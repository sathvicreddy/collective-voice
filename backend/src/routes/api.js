/* ============================================================
   API Routes — Phase 2 (Prisma DB) + Phase 3+4+5 + Phase 6 realtime
   All persistent data (meetings, questions, polls, participants,
   notifications) is now read/written via Prisma.
   The NLP engine still runs in-memory (per active meeting) for
   performance — rehydrated from DB on first access.
   ============================================================ */
"use strict";
const crypto  = require("crypto");
const qrcode  = require("qrcode");
const db      = require("../db/client");
const { json, readBody } = require("../utils/helpers");
const { processQuestion } = require("../nlp/engine");
const { recomputeScores } = require("../nlp/scoring");
const { handleAuthRequest, verifyToken } = require("./auth");
const { buildMeetingDigest }             = require("../utils/reportSummary");
const { sendDigestEmail }                = require("../utils/mailer");
const { notifyUser, notifyAdmins }       = require("../utils/notify");

// ── NLP in-memory cache ───────────────────────────────────────
// Questions are stored in Prisma but kept in RAM for fast NLP access.
// Key: meetingId → array of question cluster objects (same shape as before).
const _nlpCache = {};

/**
 * Returns the NLP question cache for a meeting.
 * On first access, loads questions from DB (async-safe via a sentinel).
 */
async function getCache(meetingId) {
  if (!_nlpCache[meetingId]) {
    // Load from DB into cache
    const rows = await db.question.findMany({
      where:   { meetingId },
      orderBy: { createdAt: "asc" }
    });
    _nlpCache[meetingId] = rows.map(dbRowToCluster);
  }
  return _nlpCache[meetingId];
}

/** Convert a Prisma Question row to the NLP cluster shape used by the frontend */
function dbRowToCluster(row) {
  return {
    id:                row.id,
    meetingId:         row.meetingId,
    text:              row.text,
    canonical_text:    row.canonicalText,
    members:           safeJson(row.membersJson, [row.text]),
    votes:             row.votes,
    score:             row.score,
    status:            row.status,
    askedBy:           row.askedByName,
    askedById:         row.askedById || null,
    assignedSpeakerId: row.assignedSpeakerId || null,
    summary:           row.summaryText,
    timeline:          safeJson(row.timelineJson, []),
    clusterSize:       safeJson(row.membersJson, []).length,
    similar:           Math.max(0, safeJson(row.membersJson, []).length - 1),
    createdAt:         row.createdAt?.getTime?.() ?? Date.now(),
    // Restore cached embedding for scoring.js reuse (NOT exposed to frontend)
    _embedding:        row.embeddingJson ? safeJson(row.embeddingJson, null) : null
  };
}

/** Persist a cluster object back to the DB */
async function persistCluster(cluster) {
  await db.question.upsert({
    where:  { id: cluster.id },
    update: {
      text:              cluster.text,
      canonicalText:     cluster.canonical_text || cluster.text,
      membersJson:       JSON.stringify(cluster.members || [cluster.text]),
      votes:             cluster.votes || 0,
      score:             cluster.score || 0,
      status:            cluster.status || "Pending",
      askedByName:       cluster.askedBy || "",
      askedById:         cluster.askedById || null,
      assignedSpeakerId: cluster.assignedSpeakerId || null,
      summaryText:       cluster.summary || "",
      timelineJson:      JSON.stringify(cluster.timeline || []),
      embeddingJson:     cluster._embedding ? JSON.stringify(cluster._embedding) : undefined
    },
    create: {
      id:                cluster.id,
      meetingId:         cluster.meetingId,
      text:              cluster.text,
      canonicalText:     cluster.canonical_text || cluster.text,
      membersJson:       JSON.stringify(cluster.members || [cluster.text]),
      votes:             cluster.votes || 0,
      score:             cluster.score || 0,
      status:            cluster.status || "Pending",
      askedByName:       cluster.askedBy || "",
      askedById:         cluster.askedById || null,
      summaryText:       cluster.summary || "",
      timelineJson:      JSON.stringify(cluster.timeline || []),
      embeddingJson:     cluster._embedding ? JSON.stringify(cluster._embedding) : null
    }
  });
}

// ── Broadcast (lazy-loaded to avoid circular deps) ────────────
function broadcast(event, data, meetingId = null, opts = {}) {
  try {
    const { broadcast: _b } = require("../../server");
    _b({ event, data, meetingId }, null, opts);
  } catch { /* server not yet attached */ }
}

// ── Auth helpers ───────────────────────────────────────────────

async function requireAuth(req) {
  const payload = verifyToken(req);
  if (!payload) return null;
  const user = await db.user.findUnique({ where: { id: payload.sub } });
  if (!user) return null;
  return { payload, user };
}

async function requireModerator(req, meeting) {
  const auth = await requireAuth(req);
  if (!auth) return "401";
  if (meeting && meeting.ownerId !== auth.user.id) return "403";
  return null;
}

// ── Analytics ─────────────────────────────────────────────────

async function analytics(userId) {
  const whereOwner = userId ? { ownerId: userId } : {};
  const meetings   = await db.meeting.findMany({ where: whereOwner, select: { id: true, category: true } });
  const mIds       = meetings.map(m => m.id);
  const questions  = mIds.length
    ? await db.question.findMany({ where: { meetingId: { in: mIds } } })
    : [];

  const questionsAsked  = questions.length;
  const upvotesReceived = questions.reduce((s, q) => s + (q.votes || 0), 0);
  const answersGiven    = questions.filter(q => q.status === "Answered").length;
  const meetingsJoined  = meetings.length;

  const catMap = {};
  meetings.forEach(m => {
    const cat = m.category || "Other";
    catMap[cat] = (catMap[cat] || 0) +
      questions.filter(q => q.meetingId === m.id).length;
  });

  return {
    overview: [
      { label: "Questions Asked",  value: questionsAsked  },
      { label: "Upvotes Received", value: upvotesReceived },
      { label: "Answers Given",    value: answersGiven    },
      { label: "Meetings Joined",  value: meetingsJoined  }
    ],
    trend: [28, 34, 31, 46, 37, 58, 43, 64, 39, 55],
    categories: Object.entries(catMap).map(([label, value]) => ({ label, value }))
  };
}

// ── Helpers ────────────────────────────────────────────────────

function getMeetingId(url, body = {}) {
  return url.searchParams.get("meetingId") || body.meetingId || null;
}

function safeJson(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

async function livePayload(meetingId) {
  const questions    = await getCache(meetingId);
  const polls        = await db.poll.findMany({
    where:   { meetingId },
    include: { options: true }
  });
  const participants = await db.participant.findMany({ where: { meetingId } });
  const ranked       = [...questions].sort((a, b) => (b.score || 0) - (a.score || 0));
  return {
    questions: ranked,
    polls:     polls.map(p => ({
      ...p,
      endsAt: p.endsAt?.getTime?.() ?? null
    })),
    participants,
    stats: {
      questionsCount:    questions.length,
      participantsCount: participants.length,
      upvotesCount:      questions.reduce((s, q) => s + (q.votes || 0), 0)
    }
  };
}

async function submitQuestionShared(meetingId, text, askedBy, askedById) {
  const cache   = await getCache(meetingId);
  const cluster = await processQuestion(meetingId, text.trim(), askedBy || "Anonymous", cache);
  cluster.askedById = askedById || null;

  // Persist asynchronously — don't block the response
  persistCluster(cluster).catch(err => console.error("[API] persistCluster error:", err.message));

  // Strip internal _embedding before sending to clients
  const { _embedding, ...clusterForClient } = cluster;
  const ranked = [...cache]
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .map(({ _embedding: _e, ...c }) => c);

  broadcast("question_submitted",  clusterForClient, meetingId);
  broadcast("questions_reranked",  ranked,           meetingId);

  // Async stats update — don't await so we don't block the caller
  livePayload(meetingId)
    .then(snap => broadcast("session_stats", snap.stats, meetingId))
    .catch(() => {});

  return clusterForClient;
}

const ALLOWED_SETTINGS = new Set([
  "allowQuestions", "enableChat", "recordMeeting",
  // Extended settings from the new create form
  "upvoteReact", "showParticipants", "requireApproval", "qaMode", "language"
]);
function sanitizeSettings(raw) {
  if (!raw || typeof raw !== "object") return {};
  const safe = {};
  for (const key of ALLOWED_SETTINGS) {
    if (key in raw) {
      // Boolean toggles → coerce; string fields → keep as string
      safe[key] = typeof raw[key] === "boolean" ? raw[key] : raw[key];
    }
  }
  return safe;
}

// ── Main request handler ───────────────────────────────────────

async function handleApiRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // ── Auth routes ──────────────────────────────────────────
  if (url.pathname.startsWith("/api/auth/")) {
    const handled = await handleAuthRequest(req, res);
    if (handled !== null) return;
  }

  // ── GET /health ──────────────────────────────────────────
  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, { status: "ok", uptime: process.uptime(), ts: Date.now() });
  }

  // ── GET /api/home ────────────────────────────────────────
  if (req.method === "GET" && url.pathname === "/api/home") {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });

    const { user } = auth;
    const ownedMeetings = await db.meeting.findMany({ where: { ownerId: user.id }, select: { id: true } });
    const ownedIds      = ownedMeetings.map(m => m.id);

    const liveM    = await db.meeting.findFirst({ where: { status: "live" } });
    const upcoming = await db.meeting.findMany({ where: { status: "upcoming" }, take: 5 });
    const liveQs   = liveM ? await getCache(liveM.id) : [];

    return json(res, 200, {
      user:           { id: user.id, name: user.name, email: user.email, picture: user.picture, ownedMeetingIds: ownedIds },
      live:           liveM,
      upcoming,
      recentActivity: liveQs[0] || null
    });
  }

  // ── GET /api/meetings ────────────────────────────────────
  if (req.method === "GET" && url.pathname === "/api/meetings") {
    const meetings = await db.meeting.findMany({ orderBy: { createdAt: "desc" } });
    return json(res, 200, { meetings });
  }

  // ── GET /api/meetings/:id ─────────────────────────────────
  if (req.method === "GET" && url.pathname.match(/^\/api\/meetings\/[^/]+$/)) {
    const id      = url.pathname.split("/").pop();
    const meeting = await db.meeting.findUnique({
      where:   { id },
      include: {
        owner:        { select: { id: true, name: true, email: true, picture: true } },
        participants: { select: { id: true } },
        enrollments:  { select: { userId: true } },
        polls:        { select: { id: true } },
      }
    });
    if (!meeting) return json(res, 404, { error: "Meeting not found" });

    const auth        = await requireAuth(req);
    const currentUser = auth?.user || null;
    const isOwner     = currentUser ? meeting.ownerId === currentUser.id : false;
    const settings    = (() => { try { return JSON.parse(meeting.settingsJson || "{}"); } catch { return {}; } })();

    return json(res, 200, {
      meeting: {
        ...meeting,
        participantCount: meeting.participants?.length ?? 0,
        enrollmentCount:  meeting.enrollments?.length ?? 0,
        pollCount:        meeting.polls?.length ?? 0,
        settings,
        isOwner,
        // Convenience: short human-readable ID
        shortId: meeting.code ? `CV-${meeting.code}` : meeting.id.slice(0, 8).toUpperCase()
      }
    });
  }

  // ── GET /api/sessions/:id/qrcode ─────────────────────────
  if (req.method === "GET" && url.pathname.match(/^\/api\/sessions\/[^/]+\/qrcode$/)) {
    const id      = url.pathname.split("/")[3];
    const meeting = await db.meeting.findUnique({ where: { id } });
    if (!meeting) return json(res, 404, { error: "Meeting not found" });

    const proto    = req.headers["x-forwarded-proto"] || "http";
    const joinLink = `${proto}://${req.headers.host}/#/join/${meeting.code}`;

    try {
      const svg = await qrcode.toString(joinLink, {
        type:   "svg",
        width:  300,
        margin: 1,
        color:  { dark: "#5b34ff", light: "#ffffff" }
      });
      res.writeHead(200, {
        "Content-Type":  "image/svg+xml",
        "Cache-Control": "public, max-age=3600",
        "X-Join-Link":   joinLink
      });
      res.end(svg);
    } catch (err) {
      console.error("[QR] Failed to generate QR code:", err.message);
      return json(res, 500, { error: "QR generation failed" });
    }
    return;
  }

  // ── GET /api/sessions/code/:code ────────────────────────
  if (req.method === "GET" && url.pathname.startsWith("/api/sessions/code/")) {
    const code    = url.pathname.split("/").pop();
    const meeting = await db.meeting.findUnique({ where: { code } });
    if (!meeting) return json(res, 404, { error: "Meeting not found" });
    return json(res, 200, { meeting });
  }

  // ── GET /api/session/live?meetingId= ───────────────────────────
  if (req.method === "GET" && url.pathname === "/api/session/live") {
    const meetingId = url.searchParams.get("meetingId");
    if (!meetingId) return json(res, 400, { error: "meetingId query parameter is required" });
    return json(res, 200, await livePayload(meetingId));
  }

  // ── GET /api/questions/:id ───────────────────────────────
  if (req.method === "GET" && url.pathname.match(/^\/api\/questions\/[^/]+$/)) {
    const id       = url.pathname.split("/").pop();
    const question = await db.question.findUnique({ where: { id } });
    if (!question) return json(res, 404, { error: "Question not found" });
    return json(res, 200, { question: dbRowToCluster(question) });
  }

  // ── GET /api/questions?meetingId= ───────────────────────
  if (req.method === "GET" && url.pathname === "/api/questions") {
    const meetingId = url.searchParams.get("meetingId");
    if (!meetingId) return json(res, 400, { error: "meetingId query parameter is required" });
    const questions = await getCache(meetingId);
    const ranked    = [...questions].sort((a, b) => (b.score || 0) - (a.score || 0));
    return json(res, 200, { questions: ranked });
  }

  // ── POST /api/questions?meetingId= ──────────────────────
  if (req.method === "POST" && url.pathname === "/api/questions") {
    const body      = await readBody(req);
    const meetingId = getMeetingId(url, body);
    if (!meetingId) return json(res, 400, { error: "meetingId is required" });
    const text      = String(body.text || "").trim();
    if (!text) return json(res, 400, { error: "Question text is required" });
    if (text.length > 500) return json(res, 400, { error: "Question text must be 500 characters or fewer" });

    const auth    = await requireAuth(req);
    const askedBy = body.askedBy || auth?.user?.name || "Anonymous";
    const askedById = auth?.user?.id || null;

    const cluster = await submitQuestionShared(meetingId, text, askedBy, askedById);
    const cache   = await getCache(meetingId);

    const { _embedding: _emb, ...clusterForClient } = cluster;
    const ranked = [...cache].sort((a, b) => (b.score || 0) - (a.score || 0))
      .map(({ _embedding, ...c }) => c);
    broadcast("question_submitted", clusterForClient, meetingId);
    broadcast("session_stats",      (await livePayload(meetingId)).stats, meetingId);
    return json(res, 201, { question: clusterForClient, questions: ranked });
  }

  // ── POST /api/questions/:id/upvote ──────────────────────
  if (req.method === "POST" && url.pathname.match(/^\/api\/questions\/[^/]+\/upvote$/)) {
    const id        = url.pathname.split("/")[3];
    const body      = await readBody(req);
    const meetingId = getMeetingId(url, body);
    if (!meetingId) return json(res, 400, { error: "meetingId is required" });

    const auth    = await requireAuth(req);
    const voterId = auth?.user?.id || body.guestToken || null;
    if (!voterId) return json(res, 401, { error: "A voter identity (login or guestToken) is required to upvote." });

    const question = await db.question.findUnique({ where: { id } }).catch(() => null);
    if (!question) return json(res, 404, { error: "Question not found" });

    const existingVote = await db.vote.findUnique({
      where: { questionId_voterId: { questionId: id, voterId } }
    }).catch(() => null);

    let newVotes;
    if (existingVote) {
      await db.vote.delete({ where: { questionId_voterId: { questionId: id, voterId } } }).catch(() => {});
      newVotes = Math.max(0, question.votes - 1);
    } else {
      await db.vote.create({ data: { questionId: id, voterId } }).catch(() => {});
      newVotes = question.votes + 1;
    }

    const row = await db.question.update({
      where: { id },
      data:  { votes: newVotes }
    }).catch(() => null);
    if (!row) return json(res, 500, { error: "Failed to update vote count" });

    const cache  = await getCache(meetingId);
    const cached = cache.find(q => q.id === id);
    if (cached) cached.votes = row.votes;
    recomputeScores(meetingId, cache);
    if (cached) await db.question.update({ where: { id }, data: { score: cached.score } }).catch(() => {});

    const { _embedding: _emb2, ...cachedForClient } = cached ?? dbRowToCluster(row);
    broadcast("question_upvoted", { id, votes: row.votes, score: cachedForClient.score ?? row.score }, meetingId);

    // §3: Upvote milestone — notify question author every 10 upvotes
    if (!existingVote && row.votes > 0 && row.votes % 10 === 0 && row.askedById) {
      notifyUser(row.askedById, {
        type:  "Questions",
        title: `Your question reached ${row.votes} upvotes!`,
        body:  `"${row.text.slice(0, 80)}" hit ${row.votes} upvotes.`
      }).catch(() => {});
    }

    return json(res, 200, { question: cachedForClient, voted: !existingVote });
  }

  // ── POST /api/questions/:id/assign ──────────────────────
  if (req.method === "POST" && url.pathname.match(/^\/api\/questions\/[^/]+\/assign$/)) {
    const id        = url.pathname.split("/")[3];
    const body      = await readBody(req);
    const meetingId = getMeetingId(url, body) || "m_ai_education";
    const meeting   = await db.meeting.findUnique({ where: { id: meetingId } });
    const authErr   = await requireModerator(req, meeting);
    if (authErr === "401") return json(res, 401, { error: "Unauthorized." });
    if (authErr === "403") return json(res, 403, { error: "Forbidden — you are not the meeting owner." });

    const speakerId = body.speakerId || "speaker_default";
    const row = await db.question.update({
      where: { id },
      data:  { status: "Under Review", assignedSpeakerId: speakerId }
    }).catch(() => null);
    if (!row) return json(res, 404, { error: "Question not found" });

    const cache = await getCache(meetingId);
    const cached = cache.find(q => q.id === id);
    if (cached) { cached.status = "Under Review"; cached.assignedSpeakerId = speakerId; }

    broadcast("question_assigned", { questionId: id, speakerId }, meetingId);
    return json(res, 200, { question: cached ?? dbRowToCluster(row) });
  }

  // ── POST /api/questions/:id/answer ──────────────────────
  if (req.method === "POST" && url.pathname.match(/^\/api\/questions\/[^/]+\/answer$/)) {
    const id        = url.pathname.split("/")[3];
    const body      = await readBody(req);
    const meetingId = getMeetingId(url, body) || "m_ai_education";
    const meeting   = await db.meeting.findUnique({ where: { id: meetingId } });
    const authErr   = await requireModerator(req, meeting);
    if (authErr === "401") return json(res, 401, { error: "Unauthorized." });
    if (authErr === "403") return json(res, 403, { error: "Forbidden — you are not the meeting owner." });

    const row = await db.question.update({ where: { id }, data: { status: "Answered" } }).catch(() => null);
    if (!row) return json(res, 404, { error: "Question not found" });

    const cache = await getCache(meetingId);
    const cached = cache.find(q => q.id === id);
    if (cached) cached.status = "Answered";
    recomputeScores(meetingId, cache);

    broadcast("question_status_changed", { id, status: "Answered" }, meetingId);

    // §3: Notify question author that their question was answered
    if (row.askedById) {
      notifyUser(row.askedById, {
        type:  "Questions",
        title: "Your question was answered!",
        body:  `"${row.text.slice(0, 80)}" was marked as answered.`
      }).catch(() => {});
    }

    return json(res, 200, { question: cached ?? dbRowToCluster(row) });
  }

  // ── POST /api/questions/:id/status ──────────────────────
  if (req.method === "POST" && url.pathname.match(/^\/api\/questions\/[^/]+\/status$/)) {
    const id        = url.pathname.split("/")[3];
    const body      = await readBody(req);
    const meetingId = getMeetingId(url, body) || "m_ai_education";
    const meeting   = await db.meeting.findUnique({ where: { id: meetingId } });
    const authErr   = await requireModerator(req, meeting);
    if (authErr === "401") return json(res, 401, { error: "Unauthorized." });
    if (authErr === "403") return json(res, 403, { error: "Forbidden — you are not the meeting owner." });

    const newStatus = body.status;
    const row = await db.question.update({ where: { id }, data: { status: newStatus } }).catch(() => null);
    if (!row) return json(res, 404, { error: "Question not found" });

    const cache = await getCache(meetingId);
    const cached = cache.find(q => q.id === id);
    if (cached) cached.status = newStatus;
    recomputeScores(meetingId, cache);

    broadcast("question_status_changed", { id, status: newStatus }, meetingId);

    // §3: Notify admins when a question is flagged
    if (newStatus === "Flagged") {
      notifyAdmins({
        type:      "content",
        priority:  "high",
        title:     "Question flagged in meeting",
        body:      `Question flagged: "${row.text.slice(0, 100)}"`,
        relatedId: id
      }).catch(() => {});
    }

    return json(res, 200, { question: cached ?? dbRowToCluster(row) });
  }

  // ── POST /api/polls/:id/vote ─────────────────────────────
  if (req.method === "POST" && url.pathname.match(/^\/api\/polls\/[^/]+\/vote$/)) {
    const id        = url.pathname.split("/")[3];
    const body      = await readBody(req);
    const meetingId = getMeetingId(url, body) || "m_ai_education";

    const option = await db.pollOption.update({
      where: { id: body.optionId },
      data:  { votes: { increment: 1 } }
    }).catch(() => null);
    if (!option || option.pollId !== id) return json(res, 400, { error: "Invalid option" });

    const poll = await db.poll.findUnique({
      where: { id },
      include: { options: true }
    });
    if (!poll) return json(res, 404, { error: "Poll not found" });

    const total = poll.options.reduce((s, o) => s + o.votes, 0);
    await db.poll.update({ where: { id }, data: { totalVotes: total } });
    poll.totalVotes = total;

    broadcast("poll_updated", { ...poll, endsAt: poll.endsAt?.getTime?.() ?? null }, meetingId);
    return json(res, 200, { poll: { ...poll, endsAt: poll.endsAt?.getTime?.() ?? null } });
  }

  // ── POST /api/polls (create) ─────────────────────────────
  if (req.method === "POST" && url.pathname === "/api/polls") {
    const body      = await readBody(req);
    const meetingId = getMeetingId(url, body) || "m_ai_education";
    const meeting   = await db.meeting.findUnique({ where: { id: meetingId } });
    const authErr   = await requireModerator(req, meeting);
    if (authErr === "401") return json(res, 401, { error: "Unauthorized." });
    if (authErr === "403") return json(res, 403, { error: "Forbidden — you are not the meeting owner." });

    const question = String(body.question || "").trim();
    if (!question) return json(res, 400, { error: "Poll question is required" });
    const labels = (body.options || []).map(l => String(l).trim()).filter(Boolean);
    if (labels.length < 2) return json(res, 400, { error: "At least 2 options required" });

    const poll = await db.poll.create({
      data: {
        meetingId,
        question,
        active:  true,
        endsAt:  body.endsAt ? new Date(body.endsAt) : new Date(Date.now() + 5 * 60 * 1000),
        options: { create: labels.map(label => ({ label })) }
      },
      include: { options: true }
    });

    broadcast("poll_created", { ...poll, endsAt: poll.endsAt?.getTime?.() ?? null }, meetingId);
    return json(res, 201, { poll: { ...poll, endsAt: poll.endsAt?.getTime?.() ?? null } });
  }

  // ── POST /api/polls/:id/end ───────────────────────────────
  if (req.method === "POST" && url.pathname.match(/^\/api\/polls\/[^/]+\/end$/)) {
    const id   = url.pathname.split("/")[3];
    const poll = await db.poll.findUnique({ where: { id }, include: { options: true } });
    if (!poll) return json(res, 404, { error: "Poll not found" });

    const meeting = await db.meeting.findUnique({ where: { id: poll.meetingId } });
    const authErr = await requireModerator(req, meeting);
    if (authErr === "401") return json(res, 401, { error: "Unauthorized." });
    if (authErr === "403") return json(res, 403, { error: "Forbidden." });

    const updated = await db.poll.update({
      where: { id },
      data:  { active: false },
      include: { options: true }
    });

    broadcast("poll_ended",   { ...updated, endsAt: updated.endsAt?.getTime?.() ?? null }, poll.meetingId);
    broadcast("poll_updated", { ...updated, endsAt: updated.endsAt?.getTime?.() ?? null }, poll.meetingId);
    return json(res, 200, { poll: { ...updated, endsAt: updated.endsAt?.getTime?.() ?? null } });
  }

  // ── POST /api/announcements ──────────────────────────────
  if (req.method === "POST" && url.pathname === "/api/announcements") {
    const body      = await readBody(req);
    const meetingId = body.meetingId || null;
    const meeting   = meetingId ? await db.meeting.findUnique({ where: { id: meetingId } }) : null;
    const authErr   = await requireModerator(req, meeting);
    if (authErr === "401") return json(res, 401, { error: "Unauthorized." });
    if (authErr === "403") return json(res, 403, { error: "Forbidden — you are not the meeting owner." });

    const msg = String(body.message || "").trim();
    if (!msg) return json(res, 400, { error: "Message required" });
    broadcast("announcement", { message: msg, time: new Date().toISOString() }, meetingId);
    return json(res, 200, { sent: true });
  }

  // ── POST /api/sessions/:id/start ────────────────────────
  if (req.method === "POST" && url.pathname.match(/^\/api\/sessions\/[^/]+\/start$/)) {
    const id      = url.pathname.split("/")[3];
    const meeting = await db.meeting.findUnique({ where: { id } });
    if (!meeting) return json(res, 404, { error: "Meeting not found" });
    const authErr = await requireModerator(req, meeting);
    if (authErr === "401") return json(res, 401, { error: "Unauthorized." });
    if (authErr === "403") return json(res, 403, { error: "Forbidden." });

    const updated = await db.meeting.update({ where: { id }, data: { status: "live" } });
    // Broadcast to all WS clients in this meeting room (including those on the detail page)
    broadcast("meeting_started",        { meetingId: id, status: "live" }, id);
    broadcast("meeting_status_changed", { meetingId: id, status: "live" }, id);
    // Also broadcast globally (null meetingId) so participants watching before joining a WS room also get it
    broadcast("meeting_started",        { meetingId: id, status: "live" }, null);
    broadcast("meeting_status_changed", { meetingId: id, status: "live" }, null);

    // §3: Notify all enrolled users that the meeting is now live
    // Use createMany for the DB writes, then push WS individually per connected user.
    // createMany does not return created rows in all Prisma versions, so we construct
    // the WS payload manually rather than relying on the return value.
    (async () => {
      try {
        const enrollments = await db.meetingEnrollment.findMany({
          where:  { meetingId: id },
          select: { userId: true }
        });
        if (enrollments.length === 0) return;
        const notifData = enrollments.map(e => ({
          userId:  e.userId,
          type:    "Meeting Updates",
          title:   `Meeting is now live: ${updated.title}`,
          body:    `"${updated.title}" has started. Join now!`,
          time:    "Just now",
          source:  "system",
          read:    false
        }));
        await db.notification.createMany({ data: notifData, skipDuplicates: true });
        // Push WS individually to each enrolled connected user
        const { pushNotificationToUser } = require("../../server");
        if (pushNotificationToUser) {
          for (const e of enrollments) {
            pushNotificationToUser(e.userId, {
              type:  "Meeting Updates",
              title: `Meeting is now live: ${updated.title}`,
              body:  `"${updated.title}" has started. Join now!`,
              time:  "Just now",
              read:  false,
              source: "system"
            });
          }
        }
      } catch (err) {
        console.error("[notify] meeting-live fan-out error:", err.message);
      }
    })();

    return json(res, 200, { meeting: updated });
  }

  // ── POST /api/sessions/:id/end ──────────────────────────
  if (req.method === "POST" && url.pathname.match(/^\/api\/sessions\/[^/]+\/end$/)) {
    const id      = url.pathname.split("/")[3];
    const meeting = await db.meeting.findUnique({
      where: { id },
      include: { owner: { select: { email: true, name: true } } }
    });
    if (!meeting) return json(res, 404, { error: "Meeting not found" });
    const authErr = await requireModerator(req, meeting);
    if (authErr === "401") return json(res, 401, { error: "Unauthorized." });
    if (authErr === "403") return json(res, 403, { error: "Forbidden." });

    const updated = await db.meeting.update({ where: { id }, data: { status: "conducted" } });
    // Broadcast meeting_ended to all participants in the room and globally
    broadcast("meeting_ended",          { meetingId: id, status: "conducted" }, id);
    broadcast("meeting_status_changed", { meetingId: id, status: "conducted" }, id);
    broadcast("meeting_ended",          { meetingId: id, status: "conducted" }, null);
    broadcast("meeting_status_changed", { meetingId: id, status: "conducted" }, null);

    // Fire-and-forget post-meeting digest email — never blocks the HTTP response
    buildMeetingDigest(id)
      .then(summary => sendDigestEmail({ ...meeting, ...updated }, summary))
      .catch(err => console.error("[Digest] Email send failed:", err.message));

    return json(res, 200, { meeting: updated });
  }


  // ── POST /api/sessions ───────────────────────────────────
  if (req.method === "POST" && url.pathname === "/api/sessions") {
    const body = await readBody(req);
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized. Please log in to create a meeting." });

    const { user } = auth;
    const defaultSpeaker = user.name || "Host";

    let code;
    for (let attempt = 0; attempt < 10; attempt++) {
      const digits = attempt < 9 ? 6 : 8;
      const min    = 10 ** (digits - 1);
      const range  = 9 * min;
      const candidate = String(Math.floor(min + Math.random() * range));
      const clash = await db.meeting.findUnique({ where: { code: candidate }, select: { id: true } });
      if (!clash) { code = candidate; break; }
    }
    if (!code) {
      code = crypto.randomBytes(4).toString("hex");
    }

    const scheduled = body.scheduledAt ? new Date(body.scheduledAt) : new Date();
    const isValid   = !isNaN(scheduled.getTime());
    const dateStr   = isValid
      ? scheduled.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
      : new Date().toLocaleDateString();
    const timeStr   = isValid
      ? scheduled.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })
      : "";
    const durMin    = Number(body.duration) || 60;
    const durLabel  = durMin >= 60
      ? `${Math.floor(durMin / 60)}h${durMin % 60 ? ` ${durMin % 60}m` : ""}`
      : `${durMin}m`;
    const statusIn  = ["live","upcoming","conducted","past"].includes(body.status)
      ? body.status : "upcoming";

    const meeting = await db.meeting.create({
      data: {
        code,
        title:        String(body.title || "Untitled Meeting").slice(0, 200),
        speaker:      String(body.speaker || defaultSpeaker).slice(0, 100),
        date:         dateStr,
        time:         timeStr,
        duration:     durLabel,
        scheduledAt:  isValid ? scheduled : new Date(),
        status:       statusIn,
        ownerId:      user.id,
        description:  String(body.description || "").slice(0, 1000),
        settingsJson: JSON.stringify(sanitizeSettings(body.settings)),
        category:     body.category || "Custom"
      }
    });
    return json(res, 201, { meeting });
  }


  // ── PATCH /api/meetings/:id ──────────────────────────────
  if (req.method === "PATCH" && url.pathname.match(/^\/api\/meetings\/[^/]+$/) &&
      !url.pathname.endsWith("/status")) {
    const id      = url.pathname.split("/").pop();
    const meeting = await db.meeting.findUnique({ where: { id } });
    if (!meeting) return json(res, 404, { error: "Meeting not found" });
    const authErr = await requireModerator(req, meeting);
    if (authErr === "401") return json(res, 401, { error: "Unauthorized." });
    if (authErr === "403") return json(res, 403, { error: "Forbidden." });

    const body = await readBody(req);
    const data = {};
    if (body.title       !== undefined) data.title       = String(body.title).slice(0, 200);
    if (body.description !== undefined) data.description = String(body.description).slice(0, 1000);
    if (body.date        !== undefined) data.date        = body.date;
    if (body.time        !== undefined) data.time        = body.time;
    if (body.speaker     !== undefined) data.speaker     = String(body.speaker).slice(0, 100);

    const updated = await db.meeting.update({ where: { id }, data });
    return json(res, 200, { meeting: updated });
  }

  // ── PATCH /api/meetings/:id/status ──────────────────────
  if (req.method === "PATCH" && url.pathname.match(/^\/api\/meetings\/[^/]+\/status$/)) {
    const id      = url.pathname.split("/")[3];
    const meeting = await db.meeting.findUnique({ where: { id } });
    if (!meeting) return json(res, 404, { error: "Meeting not found" });
    const authErr = await requireModerator(req, meeting);
    if (authErr === "401") return json(res, 401, { error: "Unauthorized." });
    if (authErr === "403") return json(res, 403, { error: "Forbidden." });

    const body    = await readBody(req);
    const allowed = ["upcoming", "live", "conducted", "past"];
    if (!allowed.includes(body.status))
      return json(res, 400, { error: `Status must be one of: ${allowed.join(", ")}` });

    const updated = await db.meeting.update({ where: { id }, data: { status: body.status } });
    broadcast("meeting_status_changed", { meetingId: id, status: body.status }, id);
    return json(res, 200, { meeting: updated });
  }

  // ── DELETE /api/meetings/:id ─────────────────────────────
  if (req.method === "DELETE" && url.pathname.match(/^\/api\/meetings\/[^/]+$/)) {
    const id      = url.pathname.split("/").pop();
    const meeting = await db.meeting.findUnique({ where: { id } });
    if (!meeting) return json(res, 404, { error: "Meeting not found" });
    const authErr = await requireModerator(req, meeting);
    if (authErr === "401") return json(res, 401, { error: "Unauthorized." });
    if (authErr === "403") return json(res, 403, { error: "Forbidden." });

    await db.meeting.delete({ where: { id } });
    delete _nlpCache[id];
    return json(res, 200, { deleted: true });
  }

  // ── GET /api/templates ───────────────────────────────────────
  // List all templates owned by the authenticated user.
  if (req.method === "GET" && url.pathname === "/api/templates") {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });
    const templates = await db.meetingTemplate.findMany({
      where:   { ownerId: auth.user.id },
      orderBy: { createdAt: "desc" }
    });
    return json(res, 200, { templates });
  }

  // ── POST /api/templates ──────────────────────────────────────
  if (req.method === "POST" && url.pathname === "/api/templates") {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });
    const body = await readBody(req);
    const template = await db.meetingTemplate.create({
      data: {
        title:        String(body.title       || "").slice(0, 200),
        category:     String(body.category    || "").slice(0, 100),
        duration:     String(body.duration    || "").slice(0, 50),
        settingsJson: JSON.stringify(body.settingsJson || {}),
        ownerId:      auth.user.id
      }
    });
    return json(res, 201, { template });
  }

  // ── GET /api/templates/:id ───────────────────────────────────
  if (req.method === "GET" && url.pathname.match(/^\/api\/templates\/[^/]+$/)) {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });
    const tid = url.pathname.split("/").pop();
    const template = await db.meetingTemplate.findUnique({ where: { id: tid } });
    if (!template) return json(res, 404, { error: "Template not found" });
    if (template.ownerId !== auth.user.id) return json(res, 403, { error: "Forbidden." });
    return json(res, 200, { template });
  }

  // ── DELETE /api/templates/:id ────────────────────────────────
  if (req.method === "DELETE" && url.pathname.match(/^\/api\/templates\/[^/]+$/)) {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });
    const tid = url.pathname.split("/").pop();
    const template = await db.meetingTemplate.findUnique({ where: { id: tid } });
    if (!template) return json(res, 404, { error: "Template not found" });
    if (template.ownerId !== auth.user.id) return json(res, 403, { error: "Forbidden." });
    await db.meetingTemplate.delete({ where: { id: tid } });
    return json(res, 200, { deleted: true });
  }

  // ── GET /api/admin/meetings/:id/export.csv ───────────────────
  // Admin-facing CSV export for meeting Q&A data.
  // TODO(pdf-export): PDF export needs a library decision (e.g. pdfkit) — deferred
  if (req.method === "GET" && url.pathname.match(/^\/api\/admin\/meetings\/[^/]+\/export\.csv$/)) {
    const segs      = url.pathname.split("/");  // ["","api","admin","meetings","<id>","export.csv"]
    const meetingId = segs[4];
    const meeting   = await db.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) return json(res, 404, { error: "Meeting not found" });

    const questions = await db.question.findMany({
      where:   { meetingId },
      orderBy: { score: "desc" }
    });

    // CSV serialiser — wrap all string values in double-quotes, escape embedded quotes as ""
    const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["Rank", "Question", "Votes", "Status", "Asked By", "Similar Grouped", "Created At"].join(",");
    const rows   = questions.map((q, i) => {
      const similar = Math.max(0, JSON.parse(q.membersJson || "[]").length - 1);
      return [
        i + 1,
        esc(q.text),
        q.votes || 0,
        esc(q.status),
        esc(q.askedByName || "Anonymous"),
        similar,
        esc(new Date(q.createdAt).toISOString())
      ].join(",");
    });

    const csv = [header, ...rows].join("\n");
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cv-${meeting.code}-${Date.now()}.csv"`,
      "Cache-Control": "no-store"
    });
    res.end(csv);
    return;
  }


  if (req.method === "GET" && url.pathname === "/api/activity") {
    const auth      = await requireAuth(req);
    const meetingId = url.searchParams.get("meetingId") || "m_ai_education";
    const questions = await getCache(meetingId);
    const meetings  = await db.meeting.findMany({ orderBy: { createdAt: "desc" } });
    return json(res, 200, {
      analytics: await analytics(auth?.user?.id ?? null),
      questions,
      meetings
    });
  }

  // ── GET /api/analytics ───────────────────────────────────
  if (req.method === "GET" && url.pathname === "/api/analytics") {
    const auth = await requireAuth(req);
    const data = await analytics(auth?.user?.id || null);
    return json(res, 200, data);
  }

  // ── GET /api/analytics/meeting/:id/export?format=csv|json ─
  if (req.method === "GET" && url.pathname.match(/^\/api\/analytics\/meeting\/[^/]+\/export$/)) {
    const segs      = url.pathname.split("/");        // ["","api","analytics","meeting","<id>","export"]
    const meetingId = segs[4];
    const format    = url.searchParams.get("format") || "json";
    const meeting   = await db.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) return json(res, 404, { error: "Meeting not found" });

    const questions    = await db.question.findMany({ where: { meetingId }, orderBy: { score: "desc" } });
    const participants = await db.participant.findMany({ where: { meetingId } });
    const totalUpvotes = questions.reduce((s, q) => s + (q.votes || 0), 0);
    const answeredCount = questions.filter(q => q.status === "Answered").length;

    if (format === "csv") {
      const header = "Rank,Question,Votes,Status,Asked By,Similar Grouped\n";
      const rows   = questions.map((q, i) => {
        const members = JSON.parse(q.membersJson || "[]").length;
        const cell = v => `"${String(v || "").replace(/"/g, '""')}"`;
        return [i+1, cell(q.text), q.votes||0, cell(q.status), cell(q.askedByName||"Anonymous"), Math.max(0,members-1)].join(",");
      }).join("\n");
      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="report-${meeting.code}-${Date.now()}.csv"`,
        "Cache-Control": "no-store"
      });
      res.end(header + rows);
      return;
    }

    // JSON export
    const exportData = {
      generatedAt: new Date().toISOString(),
      meeting: { id: meeting.id, title: meeting.title, code: meeting.code, status: meeting.status, createdAt: meeting.createdAt },
      summary: { participants: participants.length, questions: questions.length, upvotes: totalUpvotes, answered: answeredCount },
      questions: questions.map((q, i) => ({ rank: i+1, text: q.text, votes: q.votes||0, status: q.status, askedBy: q.askedByName||"Anonymous", createdAt: q.createdAt }))
    };
    const exportBody = JSON.stringify(exportData, null, 2);
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="report-${meeting.code}-${Date.now()}.json"`,
      "Cache-Control": "no-store"
    });
    res.end(exportBody);
    return;
  }

  // ── GET /api/analytics/meeting/:id ───────────────────────
  if (req.method === "GET" && url.pathname.match(/^\/api\/analytics\/meeting\/[^/]+$/)) {
    const meetingId = url.pathname.split("/").pop();
    const meeting   = await db.meeting.findUnique({ where: { id: meetingId }, include: { owner: { select: { name: true, email: true } } } });
    if (!meeting) return json(res, 404, { error: "Meeting not found" });

    const questions    = await db.question.findMany({ where: { meetingId }, orderBy: { score: "desc" } });
    const participants = await db.participant.findMany({ where: { meetingId } });
    const polls        = await db.poll.findMany({ where: { meetingId }, include: { options: true } });

    const totalUpvotes   = questions.reduce((s, q) => s + (q.votes || 0), 0);
    const answeredCount  = questions.filter(q => q.status === "Answered").length;
    const pendingCount   = questions.filter(q => q.status === "Pending").length;
    const deferredCount  = questions.filter(q => q.status === "Deferred").length;
    const reviewCount    = questions.filter(q => q.status === "Under Review").length;

    // Engagement trend: bucket questions into 10 equal time slots based on createdAt
    const times = questions.map(q => new Date(q.createdAt).getTime()).filter(Boolean);
    let trend = Array(10).fill(0);
    if (times.length > 0) {
      const tMin = Math.min(...times), tMax = Math.max(...times);
      const span = tMax - tMin || 1;
      questions.forEach(q => {
        const t = new Date(q.createdAt).getTime();
        const bucket = Math.min(9, Math.floor(((t - tMin) / span) * 10));
        trend[bucket]++;
      });
    }

    // Polls with percentage per option
    const pollsWithPcts = polls.map(p => {
      const totalPollVotes = p.options.reduce((s, o) => s + (o.votes || 0), 0) || 1;
      return {
        id: p.id, question: p.question, active: p.active,
        options: p.options.map(o => ({
          id: o.id, label: o.label, votes: o.votes || 0,
          pct: Math.round(((o.votes || 0) / totalPollVotes) * 100)
        }))
      };
    });

    // Participant engagement breakdown
    const askerIds     = new Set(questions.map(q => q.askedById).filter(Boolean));
    const activeCount  = Math.max(1, askerIds.size);
    const passiveCount = Math.max(0, participants.length - activeCount);

    return json(res, 200, {
      meeting: {
        id: meeting.id, title: meeting.title, code: meeting.code,
        status: meeting.status, description: meeting.description,
        createdAt: meeting.createdAt, updatedAt: meeting.updatedAt,
        owner: meeting.owner,
      },
      analytics: {
        totals: {
          participants:   participants.length,
          questions:      questions.length,
          upvotes:        totalUpvotes,
          answered:       answeredCount,
          pending:        pendingCount,
          deferred:       deferredCount,
          review:         reviewCount,
          polls:          polls.length,
          uniqueClusters: questions.length,
          averageUpvotes: questions.length ? (totalUpvotes / questions.length).toFixed(1) : "0"
        },
        topQuestions: questions.slice(0, 10).map((q, i) => ({
          rank: i+1, id: q.id, text: q.text, votes: q.votes||0, status: q.status,
          askedBy: q.askedByName||"Anonymous", createdAt: q.createdAt,
          similar: Math.max(0, JSON.parse(q.membersJson||"[]").length - 1)
        })),
        allQuestions: questions.map((q, i) => ({
          rank: i+1, id: q.id, text: q.text, votes: q.votes||0, status: q.status,
          askedBy: q.askedByName||"Anonymous", createdAt: q.createdAt,
          similar: Math.max(0, JSON.parse(q.membersJson||"[]").length - 1)
        })),
        statusBreakdown: { answered: answeredCount, pending: pendingCount, deferred: deferredCount, review: reviewCount },
        participantBreakdown: {
          total:      participants.length,
          active:     activeCount,
          passive:    passiveCount,
          activePct:  Math.round((activeCount  / Math.max(1, participants.length)) * 100),
          passivePct: Math.round((passiveCount / Math.max(1, participants.length)) * 100)
        },
        polls: pollsWithPcts,
        trend,
        aiSummary: `This ${meeting.title} session attracted ${participants.length} participant${participants.length!==1?"s":""} who submitted ${questions.length} question${questions.length!==1?"s":""} earning ${totalUpvotes} upvote${totalUpvotes!==1?"s":""}. ${answeredCount} question${answeredCount!==1?"s were":" was"} answered live while ${pendingCount} remain${pendingCount!==1?"":"s"} pending.`
      }
    });
  }

  // ── GET /api/profile ────────────────────────────────────
  if (req.method === "GET" && url.pathname === "/api/profile") {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });
    const { user } = auth;

    const ownedMeetings = await db.meeting.findMany({ where: { ownerId: user.id }, select: { id: true } });
    const ownedIds      = ownedMeetings.map(m => m.id);

    const allQuestions = ownedIds.length
      ? await db.question.findMany({ where: { meetingId: { in: ownedIds } } })
      : [];

    const myQs = await db.question.findMany({ where: { askedById: user.id } });

    return json(res, 200, {
      user: {
        id:              user.id,
        name:            user.name,
        email:           user.email,
        picture:         user.picture || null,
        ownedMeetingIds: ownedIds,
        createdAt:       user.createdAt,
        stats: {
          questionsAsked:  myQs.length,
          upvotesReceived: myQs.reduce((s, q) => s + (q.votes || 0), 0),
          answersGiven:    myQs.filter(q => q.status === "Answered").length,
          meetingsJoined:  ownedIds.length
        }
      }
    });
  }

  // ── GET /api/notifications ───────────────────────────────
  if (req.method === "GET" && url.pathname === "/api/notifications") {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 200, { notifications: [] });
    const notifications = await db.notification.findMany({
      where:   { userId: auth.user.id },
      orderBy: { createdAt: "desc" }
    });
    return json(res, 200, { notifications });
  }

  // ── PATCH /api/notifications/mark-read ──────────────────
  // Marks all (or a single) notification as read for the current user.
  // Body: { id?: string }  — omit `id` to mark all as read.
  if (req.method === "PATCH" && url.pathname === "/api/notifications/mark-read") {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });

    const body = await readBody(req).catch(() => ({}));
    const { id } = body;

    if (id) {
      // Mark a single notification as read
      await db.notification.updateMany({
        where: { id, userId: auth.user.id },
        data:  { read: true }
      }).catch(() => {});
    } else {
      // Mark all as read
      await db.notification.updateMany({
        where: { userId: auth.user.id, read: false },
        data:  { read: true }
      }).catch(() => {});
    }
    return json(res, 200, { ok: true });
  }

  // ── GET /api/user/export ─────────────────────────────────
  // Returns all of the authenticated user's data as a JSON blob.
  // The frontend triggers a file download from this response.
  if (req.method === "GET" && url.pathname === "/api/user/export") {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });
    const { user } = auth;

    const [meetings, questions, notifications, enrollments] = await Promise.all([
      db.meeting.findMany({ where: { ownerId: user.id } }),
      db.question.findMany({ where: { askedById: user.id } }),
      db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
      db.meetingEnrollment.findMany({ where: { userId: user.id } }).catch(() => [])
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      profile: {
        id:        user.id,
        name:      user.name,
        email:     user.email,
        createdAt: user.createdAt
      },
      meetings,
      questions,
      notifications,
      enrollments
    };

    const filename = `collectivevoice-data-${user.id.slice(0, 8)}-${Date.now()}.json`;
    res.writeHead(200, {
      "Content-Type":        "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control":       "no-store"
    });
    res.end(JSON.stringify(exportData, null, 2));
    return;
  }

  // ── DELETE /api/user/account ─────────────────────────────
  // Permanently deletes the authenticated user's own account.
  // Requires the user's current password as confirmation (unless Google-only).
  if (req.method === "DELETE" && url.pathname === "/api/user/account") {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });
    const { user } = auth;

    const body = await readBody(req).catch(() => ({}));
    const { password } = body;

    // Password accounts must confirm their password
    if (user.passwordHash) {
      if (!password) return json(res, 400, { error: "Please enter your password to confirm account deletion." });
      const match = await require("bcryptjs").compare(password, user.passwordHash);
      if (!match) return json(res, 400, { error: "Incorrect password. Account not deleted." });
    }

    // Delete all user data (Prisma cascades handle most relations)
    await db.user.delete({ where: { id: user.id } }).catch(err => {
      console.error("[API] Account deletion failed:", err.message);
      throw err;
    });

    return json(res, 200, { ok: true, message: "Account permanently deleted." });
  }


  // ?view=customers  → returns customer/regular users (for the Users admin page)
  // (no param)       → returns admin+superadmin users  (for Manage Admins page)
  if (req.method === "GET" && url.pathname === "/api/admin/users") {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });
    if (auth.user.role !== "admin" && auth.user.role !== "superadmin") {
      return json(res, 403, { error: "Admin access required." });
    }
    const view   = url.searchParams.get("view");
    const search = url.searchParams.get("search")?.trim() || "";
    const roleWhere = view === "customers"
      ? { role: { notIn: ["admin", "superadmin"] } }
      : { role: { in:    ["admin", "superadmin"] } };
    // Optional search filter — case-insensitive substring on name or email
    const searchWhere = search
      ? { OR: [
          { name:  { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ]}
      : {};
    const where = { AND: [roleWhere, searchWhere] };
    const users = await db.user.findMany({
      where,
      select:  { id: true, name: true, email: true, role: true, picture: true, createdAt: true, googleId: true },
      orderBy: { createdAt: "desc" },
      take: search ? 20 : undefined, // limit autocomplete results
    });
    return json(res, 200, { users });
  }

  // ── PATCH /api/admin/users/:id/role ── Change role (superadmin only) ──
  const roleMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/role$/);
  if (req.method === "PATCH" && roleMatch) {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });
    if (auth.user.role !== "superadmin") {
      return json(res, 403, { error: "Only the superadmin can change user roles." });
    }
    const targetUserId = roleMatch[1];
    const { role } = await readBody(req);
    if (!["customer", "admin"].includes(role)) {
      return json(res, 400, { error: "Role must be 'customer' or 'admin'." });
    }
    if (targetUserId === auth.user.id) {
      return json(res, 400, { error: "You cannot change your own role." });
    }
    const target = await db.user.findUnique({ where: { id: targetUserId } });
    const updated = await db.user.update({ where: { id: targetUserId }, data: { role } });
    // Audit
    await writeAudit(auth, "user.role_update", "warning", "User", updated.name, `userId:${updated.id}`,
      { previousRole: target?.role, newRole: role }, req);
    return json(res, 200, { user: { id: updated.id, name: updated.name, email: updated.email, role: updated.role } });
  }

  // ── DELETE /api/admin/users/:id ── Delete user (superadmin only) ──
  const userDeleteMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (req.method === "DELETE" && userDeleteMatch) {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });
    if (auth.user.role !== "superadmin") return json(res, 403, { error: "Superadmin only." });
    const targetId = userDeleteMatch[1];
    if (targetId === auth.user.id) return json(res, 400, { error: "Cannot delete yourself." });
    const target = await db.user.findUnique({ where: { id: targetId } });
    if (!target) return json(res, 404, { error: "User not found." });
    await db.user.delete({ where: { id: targetId } });
    await writeAudit(auth, "user.delete", "danger", "User", target.name, `userId:${targetId}`,
      { email: target.email }, req);
    return json(res, 200, { ok: true });
  }

  // ── GET /api/admin/users/:id/notifications ── User notification history ──
  const userNotifsMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/notifications$/);
  if (req.method === "GET" && userNotifsMatch) {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });
    if (auth.user.role !== "admin" && auth.user.role !== "superadmin") {
      return json(res, 403, { error: "Admin access required." });
    }
    const targetUserId = userNotifsMatch[1];
    const notifications = await db.notification.findMany({
      where: { userId: targetUserId },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return json(res, 200, { notifications });
  }

  // ── GET /api/admin/stats ── Platform-wide stats ──
  if (req.method === "GET" && url.pathname === "/api/admin/stats") {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });
    if (auth.user.role !== "admin" && auth.user.role !== "superadmin") return json(res, 403, { error: "Admin only." });

    const [userCount, meetingCounts, questionCount, voteSum] = await Promise.all([
      db.user.count(),
      db.meeting.groupBy({ by: ["status"], _count: { id: true } }),
      db.question.count(),
      db.question.aggregate({ _sum: { votes: true } }),
    ]);

    const byStatus = {};
    meetingCounts.forEach(r => { byStatus[r.status] = r._count.id; });
    const totalMeetings = Object.values(byStatus).reduce((s, v) => s + v, 0);

    // Chart: questions per day for last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const recentQs = await db.question.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      select: { createdAt: true }
    });
    const dayMap = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 3600 * 1000);
      const key = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      dayMap[key] = 0;
    }
    recentQs.forEach(q => {
      const key = new Date(q.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      if (dayMap[key] !== undefined) dayMap[key]++;
    });
    const chartData = Object.entries(dayMap).map(([label, value]) => ({ label, value }));

    return json(res, 200, {
      totalUsers: userCount,
      totalMeetings,
      liveCount:     byStatus["live"]      || 0,
      upcomingCount: byStatus["upcoming"]  || 0,
      conductedCount:byStatus["conducted"] || 0,
      pastCount:     byStatus["past"]      || 0,
      totalQuestions: questionCount,
      totalVotes: voteSum._sum.votes || 0,
      chartData,
    });
  }

  // ── GET /api/admin/health ── Server health metrics ──
  if (req.method === "GET" && url.pathname === "/api/admin/health") {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });
    if (auth.user.role !== "admin" && auth.user.role !== "superadmin") return json(res, 403, { error: "Admin only." });

    const mem     = process.memoryUsage();
    const uptimeSec = Math.floor(process.uptime());
    const hh = Math.floor(uptimeSec / 3600);
    const mm = Math.floor((uptimeSec % 3600) / 60);
    const ss = uptimeSec % 60;
    const uptimeStr = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;

    let dbStatus = "Healthy";
    try { await db.user.count(); } catch { dbStatus = "Degraded"; }

    // WS stats are stored on process globals by server.js on each connection event
    const wsClients   = process._cvWsClients   ?? 0;
    const wsActiveMtg = process._cvWsActiveMeetings ?? 0;

    return json(res, 200, {
      uptime: uptimeStr,
      nodeVersion: process.version,
      platform:    process.platform,
      dbStatus,
      wsConnections:    wsClients,
      wsActiveMeetings: wsActiveMtg,
      rateLimited: [],  // Reserved — real rate-limiter data lives in auth.js in-memory map
      memory: {
        heapUsedMB:  Math.round(mem.heapUsed  / 1024 / 1024),
        heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
        rssMemMB:    Math.round(mem.rss       / 1024 / 1024),
        memPct:      Math.round((mem.heapUsed / mem.heapTotal) * 100),
      },
    });
  }

  // ── GET /api/admin/audit ── Audit log with pagination + filters ──
  if (req.method === "GET" && url.pathname === "/api/admin/audit") {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });
    if (auth.user.role !== "admin" && auth.user.role !== "superadmin") return json(res, 403, { error: "Admin only." });

    const limit      = Math.min(parseInt(url.searchParams.get("limit")  || "25"), 100);
    const offset     = Math.max(parseInt(url.searchParams.get("offset") || "0"),  0);
    const action     = url.searchParams.get("action")     || undefined;
    const targetType = url.searchParams.get("targetType") || undefined;

    const where = {};
    if (action)     where.action     = action;
    if (targetType) where.targetType = targetType;

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      }),
      db.auditLog.count({ where }),
    ]);

    return json(res, 200, {
      logs: logs.map(l => ({
        id:         l.id,
        adminId:    l.adminId,
        adminName:  l.adminName,
        adminRole:  l.adminRole,
        action:     l.action,
        actionType: l.actionType,
        targetType: l.targetType,
        targetName: l.targetName,
        targetId:   l.targetId,
        detail:     (() => { try { return JSON.parse(l.detailJson); } catch { return {}; } })(),
        ipAddress:  l.ipAddress,
        ts:         l.createdAt.toISOString(),
      })),
      total,
    });
  }

  if (req.method === "GET" && url.pathname === "/api/admin/meetings") {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });
    if (auth.user.role !== "admin" && auth.user.role !== "superadmin") return json(res, 403, { error: "Admin only." });

    const status = url.searchParams.get("status");
    const where = status ? { status } : {};

    const meetings = await db.meeting.findMany({
      where,
      include: {
        owner: { select: { id: true, name: true, email: true } },
        _count: { select: { questions: true, participants: true } }
      },
      orderBy: { createdAt: "desc" }
    });

    return json(res, 200, {
      meetings: meetings.map(m => ({
        id: m.id, title: m.title, code: m.code, status: m.status,
        speaker: m.speaker, description: m.description,
        settingsJson: m.settingsJson,
        scheduledAt: m.scheduledAt?.toISOString() ?? null,
        createdAt: m.createdAt.toISOString(),
        owner: m.owner,
        questionsCount: m._count.questions,
        participantsCount: m._count.participants,
      }))
    });
  }

  // ── DELETE /api/admin/meetings/:id ── Delete meeting ──
  const meetingDeleteMatch = url.pathname.match(/^\/api\/admin\/meetings\/([^/]+)$/);
  if (req.method === "DELETE" && meetingDeleteMatch) {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });
    if (auth.user.role !== "admin" && auth.user.role !== "superadmin") return json(res, 403, { error: "Admin only." });

    const mid = meetingDeleteMatch[1];
    const meeting = await db.meeting.findUnique({
      where: { id: mid },
      include: { _count: { select: { questions: true, participants: true } } }
    });
    if (!meeting) return json(res, 404, { error: "Meeting not found." });

    await db.meeting.delete({ where: { id: mid } });
    // Clear NLP cache
    delete _nlpCache[mid];

    await writeAudit(auth, "meeting.delete", "danger", "Meeting", meeting.title, `code:${meeting.code}`,
      { questionsDeleted: meeting._count.questions, participantsDeleted: meeting._count.participants }, req);
    return json(res, 200, { ok: true });
  }

  // ── PATCH /api/admin/meetings/:id/status ── Force status change ──
  const meetingStatusMatch = url.pathname.match(/^\/api\/admin\/meetings\/([^/]+)\/status$/);
  if (req.method === "PATCH" && meetingStatusMatch) {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });
    if (auth.user.role !== "admin" && auth.user.role !== "superadmin") return json(res, 403, { error: "Admin only." });

    const mid = meetingStatusMatch[1];
    const { status } = await readBody(req);
    const valid = ["live", "upcoming", "conducted", "past"];
    if (!valid.includes(status)) return json(res, 400, { error: `Status must be one of: ${valid.join(", ")}` });

    const meeting = await db.meeting.findUnique({ where: { id: mid } });
    if (!meeting) return json(res, 404, { error: "Meeting not found." });

    const updated = await db.meeting.update({ where: { id: mid }, data: { status } });
    await writeAudit(auth, "meeting.force_status_change", "warning", "Meeting", meeting.title, `code:${meeting.code}`,
      { previousStatus: meeting.status, newStatus: status }, req);
    return json(res, 200, { meeting: updated });
  }

  // ── GET /api/admin/meetings/:id/details ── Meeting detail ──
  const meetingDetailMatch = url.pathname.match(/^\/api\/admin\/meetings\/([^/]+)\/details$/);
  if (req.method === "GET" && meetingDetailMatch) {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });
    if (auth.user.role !== "admin" && auth.user.role !== "superadmin") return json(res, 403, { error: "Admin only." });

    const mid = meetingDetailMatch[1];
    const [questions, polls, participants] = await Promise.all([
      db.question.findMany({ where: { meetingId: mid }, orderBy: { score: "desc" } }),
      db.poll.findMany({ where: { meetingId: mid }, include: { options: true } }),
      db.participant.findMany({ where: { meetingId: mid } }),
    ]);

    return json(res, 200, {
      questions: questions.map(q => ({
        id: q.id, text: q.text, status: q.status, votes: q.votes,
        similar: Math.max(0, safeJson(q.membersJson, []).length - 1),
        createdAt: q.createdAt.toISOString(),
      })),
      polls: polls.map(p => ({
        id: p.id, question: p.question, active: p.active, totalVotes: p.totalVotes,
        options: p.options.map(o => ({ id: o.id, label: o.label, votes: o.votes,
          pct: p.totalVotes > 0 ? Math.round((o.votes / p.totalVotes) * 100) : 0 }))
      })),
      participants: participants.map(p => ({
        id: p.id, name: p.name, role: p.role, upvotes: p.upvotes, questionsCount: p.questionsCount
      }))
    });
  }

  // ── GET /api/admin/questions/flagged ── All flagged questions ──
  if (req.method === "GET" && url.pathname === "/api/admin/questions/flagged") {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });
    if (auth.user.role !== "admin" && auth.user.role !== "superadmin") return json(res, 403, { error: "Admin only." });

    const tab = url.searchParams.get("tab") || "flagged"; // "flagged" | "all" | "answered"
    let where = {};
    if (tab === "flagged")  where = { status: "Flagged" };
    if (tab === "answered") where = { status: "Answered" };

    const questions = await db.question.findMany({
      where,
      include: { meeting: { select: { title: true, code: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const total = await db.question.count();
    const flaggedCount = await db.question.count({ where: { status: "Flagged" } });
    const answeredCount = await db.question.count({ where: { status: "Answered" } });

    return json(res, 200, {
      questions: questions.map(q => ({
        id: q.id, text: q.text, status: q.status, votes: q.votes,
        askedByName: q.askedByName,
        similar: Math.max(0, safeJson(q.membersJson, []).length - 1),
        meetingTitle: q.meeting?.title || "",
        meetingCode: q.meeting?.code || "",
        createdAt: q.createdAt.toISOString(),
      })),
      counts: { total, flagged: flaggedCount, answered: answeredCount }
    });
  }

  // ── DELETE /api/admin/questions/:id ── Delete question (admin) ──
  const qDeleteMatch = url.pathname.match(/^\/api\/admin\/questions\/([^/]+)$/);
  if (req.method === "DELETE" && qDeleteMatch) {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });
    if (auth.user.role !== "admin" && auth.user.role !== "superadmin") return json(res, 403, { error: "Admin only." });

    const qid = qDeleteMatch[1];
    const q = await db.question.findUnique({
      where: { id: qid },
      include: { meeting: { select: { title: true } } }
    });
    if (!q) return json(res, 404, { error: "Question not found." });

    await db.question.delete({ where: { id: qid } });
    // Remove from NLP cache
    if (_nlpCache[q.meetingId]) {
      _nlpCache[q.meetingId] = _nlpCache[q.meetingId].filter(c => c.id !== qid);
    }
    await writeAudit(auth, "question.delete", "danger", "Question",
      q.text.slice(0, 60), `questionId:${qid}`,
      { meetingTitle: q.meeting?.title, text: q.text }, req);
    return json(res, 200, { ok: true });
  }

  // ── PATCH /api/admin/questions/:id/flag ── Dismiss flag ──
  const qFlagMatch = url.pathname.match(/^\/api\/admin\/questions\/([^/]+)\/flag$/);
  if (req.method === "PATCH" && qFlagMatch) {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });
    if (auth.user.role !== "admin" && auth.user.role !== "superadmin") return json(res, 403, { error: "Admin only." });

    const qid = qFlagMatch[1];
    const updated = await db.question.update({
      where: { id: qid },
      data: { status: "Pending" }
    });
    // Update NLP cache
    if (_nlpCache[updated.meetingId]) {
      const idx = _nlpCache[updated.meetingId].findIndex(c => c.id === qid);
      if (idx !== -1) _nlpCache[updated.meetingId][idx].status = "Pending";
    }
    return json(res, 200, { ok: true });
  }

  // ── GET /api/admin/health ── Real server health ──
  if (req.method === "GET" && url.pathname === "/api/admin/health") {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });
    if (auth.user.role !== "admin" && auth.user.role !== "superadmin") return json(res, 403, { error: "Admin only." });

    const mem = process.memoryUsage();
    const uptimeSecs = Math.floor(process.uptime());
    const hours   = Math.floor(uptimeSecs / 3600);
    const minutes = Math.floor((uptimeSecs % 3600) / 60);
    const seconds = uptimeSecs % 60;
    const uptimeStr = `${String(hours).padStart(2,"0")}:${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}`;

    // Try DB ping
    let dbOk = false;
    try {
      await db.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch { dbOk = false; }

    // Get rate limiter state (exported from middleware)
    let rateLimited = [];
    try {
      const { getRateLimitedIPs } = require("../middleware/rateLimiter");
      rateLimited = getRateLimitedIPs ? getRateLimitedIPs() : [];
    } catch { rateLimited = []; }

    // WS connection count from server
    let wsConnections = 0;
    let wsActiveMeetings = 0;
    try {
      const { getWsStats } = require("../../server");
      const stats = getWsStats ? getWsStats() : { connections: 0, activeMeetings: 0 };
      wsConnections = stats.connections;
      wsActiveMeetings = stats.activeMeetings;
    } catch { /* ok */ }

    const heapUsedMB = (mem.heapUsed / 1024 / 1024).toFixed(1);
    const heapTotalMB = (mem.heapTotal / 1024 / 1024).toFixed(1);
    const rssMemMB = (mem.rss / 1024 / 1024).toFixed(1);
    const memPct = ((mem.heapUsed / mem.heapTotal) * 100).toFixed(1);

    return json(res, 200, {
      uptime: uptimeStr,
      uptimeSecs,
      dbStatus: dbOk ? "Healthy" : "Error",
      memory: { heapUsedMB, heapTotalMB, rssMemMB, memPct },
      wsConnections,
      wsActiveMeetings,
      rateLimited,
      nodeVersion: process.version,
      platform: process.platform,
    });
  }

  // ── GET /api/admin/audit ── Audit log ──
  if (req.method === "GET" && url.pathname === "/api/admin/audit") {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });
    if (auth.user.role !== "admin" && auth.user.role !== "superadmin") return json(res, 403, { error: "Admin only." });

    const limit  = Math.min(parseInt(url.searchParams.get("limit")  || "50"), 200);
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const action = url.searchParams.get("action") || null;
    const target = url.searchParams.get("targetType") || null;

    const where = {};
    if (action) where.action = { contains: action };
    if (target) where.targetType = target;

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: limit, skip: offset }),
      db.auditLog.count({ where }),
    ]);

    return json(res, 200, {
      logs: logs.map(l => ({
        id: l.id,
        ts: l.createdAt.toISOString(),
        adminName: l.adminName,
        adminRole: l.adminRole,
        action: l.action,
        actionType: l.actionType,
        targetType: l.targetType,
        targetName: l.targetName,
        targetId: l.targetId,
        detail: safeJson(l.detailJson, {}),
        ipAddress: l.ipAddress,
      })),
      total,
    });
  }

  // ── GET /api/admin/nlp/config ── Get NLP config ──
  if (req.method === "GET" && url.pathname === "/api/admin/nlp/config") {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });
    if (auth.user.role !== "admin" && auth.user.role !== "superadmin") return json(res, 403, { error: "Admin only." });

    return json(res, 200, {
      threshold: parseFloat(process.env.NLP_THRESHOLD || "0.60"),
      weights: {
        vote:    parseFloat(process.env.SCORE_ALPHA  || "0.40"),
        fresh:   parseFloat(process.env.SCORE_BETA   || "0.25"),
        novel:   parseFloat(process.env.SCORE_GAMMA  || "0.20"),
        diverse: parseFloat(process.env.SCORE_DELTA  || "0.15"),
      },
      rateLimiting: {
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "5"),
        windowMs:    parseInt(process.env.RATE_LIMIT_WINDOW_MS    || "900000"),
      }
    });
  }

  // ── POST /api/admin/nlp/config ── Save NLP config ──
  if (req.method === "POST" && url.pathname === "/api/admin/nlp/config") {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });
    if (auth.user.role !== "admin" && auth.user.role !== "superadmin") return json(res, 403, { error: "Admin only." });

    const body = await readBody(req);
    if (body.threshold !== undefined) {
      process.env.NLP_THRESHOLD = String(parseFloat(body.threshold));
    }
    if (body.weights) {
      if (body.weights.vote    !== undefined) process.env.SCORE_ALPHA  = String(parseFloat(body.weights.vote));
      if (body.weights.fresh   !== undefined) process.env.SCORE_BETA   = String(parseFloat(body.weights.fresh));
      if (body.weights.novel   !== undefined) process.env.SCORE_GAMMA  = String(parseFloat(body.weights.novel));
      if (body.weights.diverse !== undefined) process.env.SCORE_DELTA  = String(parseFloat(body.weights.diverse));
    }
    if (body.rateLimiting) {
      if (body.rateLimiting.maxRequests !== undefined) process.env.RATE_LIMIT_MAX_REQUESTS = String(body.rateLimiting.maxRequests);
      if (body.rateLimiting.windowMs    !== undefined) process.env.RATE_LIMIT_WINDOW_MS    = String(body.rateLimiting.windowMs);
    }
    await writeAudit(auth, "system.config_update", "info", "SystemConfig", "NLP Config", "nlp.config",
      { threshold: process.env.NLP_THRESHOLD, weights: body.weights }, req);
    return json(res, 200, { ok: true, message: "NLP config updated (in-memory until server restart)." });
  }

  // ── POST /api/admin/nlp/compare ── Compare two questions ──
  if (req.method === "POST" && url.pathname === "/api/admin/nlp/compare") {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });
    if (auth.user.role !== "admin" && auth.user.role !== "superadmin") return json(res, 403, { error: "Admin only." });

    const { a, b } = await readBody(req);
    if (!a || !b) return json(res, 400, { error: "Both 'a' and 'b' questions are required." });

    try {
      const { computeSimilarity } = require("../nlp/engine");
      if (computeSimilarity) {
        const score = await computeSimilarity(a.trim(), b.trim());
        return json(res, 200, { score: Math.round(score * 100), wouldMerge: score >= parseFloat(process.env.NLP_THRESHOLD || "0.60") });
      }
    } catch { /* fallback below */ }
    // Fallback: dice-coefficient approximation
    const tokensA = new Set(a.toLowerCase().split(/\s+/));
    const tokensB = new Set(b.toLowerCase().split(/\s+/));
    const inter = [...tokensA].filter(t => tokensB.has(t)).length;
    const dice = (2 * inter) / (tokensA.size + tokensB.size);
    return json(res, 200, { score: Math.round(dice * 100), wouldMerge: dice >= parseFloat(process.env.NLP_THRESHOLD || "0.60") });
  }


  // ── POST /api/sessions/code/:code/enroll ─────────────────────────────────────
  // Enroll authenticated user in a scheduled meeting via meeting code.
  // Creates a MeetingEnrollment record — this makes the meeting appear in
  // the user's personal "Upcoming Meetings" list.
  if (req.method === "POST" && url.pathname.match(/^\/api\/sessions\/code\/[^/]+\/enroll$/)) {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Sign in to enroll in a meeting." });

    const code    = url.pathname.split("/")[4];
    const meeting = await db.meeting.findUnique({ where: { code } });
    if (!meeting) return json(res, 404, { error: "Meeting not found." });
    if (meeting.status === "expired") return json(res, 410, { error: "This meeting has expired.", meeting });
    if (meeting.status === "conducted" || meeting.status === "past") {
      return json(res, 410, { error: "This meeting has already ended.", meeting });
    }

    // Upsert so repeat scans are idempotent
    const body     = await readBody(req).catch(() => ({}));
    const method   = body.method === "qr" ? "qr" : "code";
    const enrollment = await db.meetingEnrollment.upsert({
      where:  { meetingId_userId: { meetingId: meeting.id, userId: auth.user.id } },
      update: {},  // already enrolled — no-op
      create: { meetingId: meeting.id, userId: auth.user.id, joinMethod: method }
    });

    // If the meeting is live — direct the user to join immediately
    if (meeting.status === "live") {
      return json(res, 200, { meeting, enrollment, action: "join_now" });
    }

    // Meeting is upcoming — added to user's list
    return json(res, 201, { meeting, enrollment, action: "added_to_upcoming" });
  }

  // ── POST /api/sessions/:id/enroll (QR scan path — ID-based) ─────────────────
  if (req.method === "POST" && url.pathname.match(/^\/api\/sessions\/[^/]+\/enroll$/) &&
      !url.pathname.includes("/code/")) {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Sign in to enroll in a meeting." });

    const id      = url.pathname.split("/")[3];
    const meeting = await db.meeting.findUnique({ where: { id } });
    if (!meeting) return json(res, 404, { error: "Meeting not found." });
    if (meeting.status === "expired")
      return json(res, 410, { error: "This meeting has expired.", meeting });

    const enrollment = await db.meetingEnrollment.upsert({
      where:  { meetingId_userId: { meetingId: id, userId: auth.user.id } },
      update: {},
      create: { meetingId: id, userId: auth.user.id, joinMethod: "qr" }
    });

    const action = meeting.status === "live" ? "join_now" : "added_to_upcoming";
    return json(res, 201, { meeting, enrollment, action });
  }

  // ── GET /api/meetings/mine ───────────────────────────────────────────────────
  // Returns the authenticated user's personally-enrolled meetings.
  // The host also sees all meetings they own.
  if (req.method === "GET" && url.pathname === "/api/meetings/mine") {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });

    const { user } = auth;

    // Meetings enrolled in (attendee side)
    const enrollments = await db.meetingEnrollment.findMany({
      where:   { userId: user.id },
      include: { meeting: { include: { gracePeriod: true } } },
      orderBy: { enrolledAt: "desc" }
    });
    const enrolledMeetings = enrollments.map(e => ({
      ...e.meeting,
      enrolledAt: e.enrolledAt,
      joinMethod: e.joinMethod
    }));

    // Meetings the user hosts (always included)
    const ownedMeetings = await db.meeting.findMany({
      where:   { ownerId: user.id },
      include: { gracePeriod: true },
      orderBy: { createdAt: "desc" }
    });

    // Merge, de-duplicate by id (host may also be enrolled in their own meeting)
    const seen = new Set();
    const all  = [...enrolledMeetings, ...ownedMeetings].filter(m => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });

    // Split into upcoming, live, past, expired for the client
    const upcoming  = all.filter(m => m.status === "upcoming" || m.status === "scheduled");
    const live      = all.filter(m => m.status === "live");
    const past      = all.filter(m => m.status === "conducted" || m.status === "past");
    const expired   = all.filter(m => m.status === "expired");

    return json(res, 200, { meetings: all, upcoming, live, past, expired });
  }

  // ── GET /api/meetings/:id/grace ──────────────────────────────────────────────
  // Returns the current grace period state for a meeting. Host-only.
  if (req.method === "GET" && url.pathname.match(/^\/api\/meetings\/[^/]+\/grace$/)) {
    const id      = url.pathname.split("/")[3];
    const meeting = await db.meeting.findUnique({ where: { id }, include: { gracePeriod: true } });
    if (!meeting) return json(res, 404, { error: "Meeting not found." });
    const auth = await requireModerator(req, meeting);
    if (auth === "401") return json(res, 401, { error: "Unauthorized." });
    if (auth === "403") return json(res, 403, { error: "Forbidden." });
    return json(res, 200, { gracePeriod: meeting.gracePeriod || null });
  }

  // ── POST /api/meetings/:id/extend ────────────────────────────────────────────
  // Host extends the meeting by 30 minutes. Resets the grace period window.
  if (req.method === "POST" && url.pathname.match(/^\/api\/meetings\/[^/]+\/extend$/)) {
    const id      = url.pathname.split("/")[3];
    const meeting = await db.meeting.findUnique({ where: { id }, include: { gracePeriod: true } });
    if (!meeting) return json(res, 404, { error: "Meeting not found." });
    const authErr = await requireModerator(req, meeting);
    if (authErr === "401") return json(res, 401, { error: "Unauthorized." });
    if (authErr === "403") return json(res, 403, { error: "Forbidden." });

    const body        = await readBody(req).catch(() => ({}));
    const extendMins  = Math.min(Number(body.minutes) || 30, 120); // max 2h extension
    const EXTEND_MS   = extendMins * 60 * 1000;
    const now         = new Date();

    // Push scheduledAt forward from now
    const newScheduledAt = new Date((meeting.scheduledAt || now).getTime() + EXTEND_MS);
    const newGraceEndsAt = new Date(now.getTime() + EXTEND_MS);

    const [updatedMeeting] = await db.$transaction([
      db.meeting.update({
        where: { id },
        data: { scheduledAt: newScheduledAt, graceEndsAt: newGraceEndsAt }
      }),
      ...(meeting.gracePeriod ? [db.gracePeriod.update({
        where: { id: meeting.gracePeriod.id },
        data: { graceEndsAt: newGraceEndsAt, hostAction: "extended" }
      })] : [])
    ]);

    broadcast("meeting_extended", {
      meetingId:      id,
      newScheduledAt: newScheduledAt.toISOString(),
      graceEndsAt:    newGraceEndsAt.toISOString(),
      extendedByMins: extendMins
    }, id);

    return json(res, 200, { meeting: updatedMeeting, extendedByMins: extendMins });
  }

  // ── POST /api/meetings/:id/reschedule ────────────────────────────────────────
  // Host sets a new date/time for the meeting. Clears the grace period.
  if (req.method === "POST" && url.pathname.match(/^\/api\/meetings\/[^/]+\/reschedule$/)) {
    const id      = url.pathname.split("/")[3];
    const meeting = await db.meeting.findUnique({ where: { id }, include: { gracePeriod: true } });
    if (!meeting) return json(res, 404, { error: "Meeting not found." });
    const authErr = await requireModerator(req, meeting);
    if (authErr === "401") return json(res, 401, { error: "Unauthorized." });
    if (authErr === "403") return json(res, 403, { error: "Forbidden." });

    const body        = await readBody(req);
    const newDateRaw  = body.scheduledAt;
    if (!newDateRaw) return json(res, 400, { error: "scheduledAt is required." });
    const newScheduledAt = new Date(newDateRaw);
    if (isNaN(newScheduledAt.getTime())) return json(res, 400, { error: "Invalid scheduledAt." });
    if (newScheduledAt <= new Date()) return json(res, 400, { error: "New time must be in the future." });

    const dateStr = newScheduledAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    const timeStr = newScheduledAt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });

    const ops = [
      db.meeting.update({
        where: { id },
        data: {
          scheduledAt: newScheduledAt,
          date:        dateStr,
          time:        timeStr,
          status:      "upcoming",
          graceEndsAt: null
        }
      })
    ];
    // Clear grace period
    if (meeting.gracePeriod) {
      ops.push(db.gracePeriod.update({
        where: { id: meeting.gracePeriod.id },
        data: { hostAction: "rescheduled", resolvedAt: new Date() }
      }));
    }

    const [updatedMeeting] = await db.$transaction(ops);

    broadcast("meeting_rescheduled", {
      meetingId:      id,
      newScheduledAt: newScheduledAt.toISOString(),
      date:           dateStr,
      time:           timeStr
    }, id);

    // Notify enrolled users
    const enrolled = await db.meetingEnrollment.findMany({
      where: { meetingId: id },
      select: { userId: true }
    });
    for (const e of enrolled) {
      broadcast("meeting_rescheduled", {
        meetingId:      id,
        newScheduledAt: newScheduledAt.toISOString(),
        date:           dateStr,
        time:           timeStr
      }, id, { onlyUserId: e.userId });
    }

    return json(res, 200, { meeting: updatedMeeting });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // §4 — Admin → User Messaging
  // ════════════════════════════════════════════════════════════════════════════

  // ── POST /api/admin/messages ── Send a message to users ──
  if (req.method === "POST" && url.pathname === "/api/admin/messages") {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });
    if (auth.user.role !== "admin" && auth.user.role !== "superadmin") {
      return json(res, 403, { error: "Admin access required." });
    }

    const body = await readBody(req);
    const { subject, body: msgBody, audience, targetUserId, meetingId: targetMeetingId } = body;
    if (!subject?.trim()) return json(res, 400, { error: "subject is required." });
    if (!msgBody?.trim())  return json(res, 400, { error: "body is required." });
    const validAudiences = ["single", "all_users", "meeting_participants", "admins"];
    if (!validAudiences.includes(audience)) {
      return json(res, 400, { error: `audience must be one of: ${validAudiences.join(", ")}` });
    }

    // Superadmin-only audiences — enforced server-side
    if ((audience === "all_users" || audience === "admins") && auth.user.role !== "superadmin") {
      return json(res, 403, { error: "Only superadmins can message all users or all admins." });
    }
    if (audience === "single" && !targetUserId) {
      return json(res, 400, { error: "targetUserId is required for audience: single." });
    }
    if (audience === "meeting_participants" && !targetMeetingId) {
      return json(res, 400, { error: "meetingId is required for audience: meeting_participants." });
    }

    // Resolve recipient list
    let recipientIds = [];
    if (audience === "single") {
      const target = await db.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
      if (!target) return json(res, 404, { error: "Target user not found." });
      recipientIds = [targetUserId];
    } else if (audience === "all_users") {
      const users = await db.user.findMany({ select: { id: true } });
      recipientIds = users.map(u => u.id).filter(id => id !== auth.user.id);
    } else if (audience === "meeting_participants") {
      // Check meeting exists and the caller can moderate it
      const meeting = await db.meeting.findUnique({ where: { id: targetMeetingId } });
      if (!meeting) return json(res, 404, { error: "Meeting not found." });
      // Regular admins can only message participants of meetings they own
      if (auth.user.role !== "superadmin" && meeting.ownerId !== auth.user.id) {
        return json(res, 403, { error: "You can only message participants of meetings you own." });
      }
      // Fetch both Participant.userId and MeetingEnrollment.userId
      const [parts, enrolls] = await Promise.all([
        db.participant.findMany({ where: { meetingId: targetMeetingId, userId: { not: null } }, select: { userId: true } }),
        db.meetingEnrollment.findMany({ where: { meetingId: targetMeetingId }, select: { userId: true } }),
      ]);
      const ids = new Set([...parts.map(p => p.userId), ...enrolls.map(e => e.userId)]);
      ids.delete(auth.user.id);
      recipientIds = [...ids];
    } else if (audience === "admins") {
      const admins = await db.user.findMany({
        where: { role: { in: ["admin", "superadmin"] } },
        select: { id: true }
      });
      recipientIds = admins.map(u => u.id).filter(id => id !== auth.user.id);
    }

    if (recipientIds.length === 0) {
      return json(res, 200, { ok: true, recipientCount: 0, message: "No recipients to notify." });
    }

    // Create AdminMessage audit log row
    const adminMsg = await db.adminMessage.create({
      data: {
        senderId:       auth.user.id,
        subject:        subject.trim(),
        body:           msgBody.trim(),
        audience,
        targetUserId:   audience === "single" ? targetUserId : null,
        meetingId:      audience === "meeting_participants" ? targetMeetingId : null,
        recipientCount: recipientIds.length,
        recipientsJson: JSON.stringify(recipientIds),
      }
    });

    // Batch-create Notification rows for all recipients
    const notifRows = recipientIds.map(uid => ({
      userId:   uid,
      type:     "Admin Message",
      title:    subject.trim(),
      body:     msgBody.trim(),
      time:     "Just now",
      source:   "admin",
      senderId: auth.user.id,
      read:     false,
    }));
    await db.notification.createMany({ data: notifRows, skipDuplicates: true });

    // Push live WS to each connected recipient
    // TODO(product-decision): confirm whether superadmin broadcasts should bypass
    // the adminMessages preference opt-out (currently they do NOT bypass it —
    // the createMany above writes rows regardless, but the pref is only checked
    // in notifyUser() which is not used here for performance reasons).
    try {
      const { pushNotificationToUser, broadcast } = require("../../server");
      if (pushNotificationToUser) {
        for (const uid of recipientIds) {
          pushNotificationToUser(uid, {
            type:     "Admin Message",
            title:    subject.trim(),
            body:     msgBody.trim(),
            time:     "Just now",
            source:   "admin",
            senderId: auth.user.id,
            senderName: auth.user.name || "Admin",
            read:     false,
          });
        }
      }
      // For meeting-participant messages: additionally broadcast a live
      // in-meeting announcement to every socket active in that meeting room.
      // This is separate from the per-user Notification WS push above so that
      // participants who haven't set up a personal WS session (e.g. guests)
      // also see the announcement banner immediately in the session UI.
      if (audience === "meeting_participants" && targetMeetingId && broadcast) {
        broadcast({
          event: "meeting_announcement",
          data: {
            subject:   subject.trim(),
            body:      msgBody.trim(),
            senderName: auth.user.name || "Admin",
            sentAt:    new Date().toISOString(),
          },
          meetingId: targetMeetingId,
        });
      }
    } catch (wsErr) {
      console.error("[admin/messages] WS push error:", wsErr.message);
      /* WS push is best-effort — response still succeeds */
    }

    return json(res, 200, { ok: true, recipientCount: recipientIds.length, messageId: adminMsg.id });
  }

  // ── GET /api/admin/meetings/:id/messages ── Per-meeting message history ──
  const mtgMsgMatch = url.pathname.match(/^\/api\/admin\/meetings\/([^/]+)\/messages$/);
  if (req.method === "GET" && mtgMsgMatch) {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });
    if (auth.user.role !== "admin" && auth.user.role !== "superadmin") {
      return json(res, 403, { error: "Admin access required." });
    }
    const meetingId = mtgMsgMatch[1];
    const meeting = await db.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) return json(res, 404, { error: "Meeting not found." });
    // Regular admins can only view message history for their own meetings
    if (auth.user.role !== "superadmin" && meeting.ownerId !== auth.user.id) {
      return json(res, 403, { error: "Forbidden." });
    }
    const messages = await db.adminMessage.findMany({
      where: { audience: "meeting_participants", meetingId },
      orderBy: { createdAt: "desc" },
      include: { sender: { select: { id: true, name: true, role: true } } }
    });
    return json(res, 200, { messages });
  }

  // ── GET /api/admin/meetings/:id/notifications ── Notifications for meeting participants ──
  const mtgNotifMatch = url.pathname.match(/^\/api\/admin\/meetings\/([^/]+)\/notifications$/);
  if (req.method === "GET" && mtgNotifMatch) {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });
    if (auth.user.role !== "admin" && auth.user.role !== "superadmin") {
      return json(res, 403, { error: "Admin access required." });
    }
    const meetingId = mtgNotifMatch[1];
    const meeting = await db.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) return json(res, 404, { error: "Meeting not found." });
    // Get participant userIds for this meeting (only those with a linked user account)
    const participants = await db.participant.findMany({
      where: { meetingId, userId: { not: null } },
      select: { userId: true, name: true },
    });
    const userIds = [...new Set(participants.map(p => p.userId).filter(Boolean))];
    if (userIds.length === 0) return json(res, 200, { notifications: [] });
    // Fetch the most recent notifications for those users
    const notifications = await db.notification.findMany({
      where: { userId: { in: userIds } },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    return json(res, 200, { notifications });
  }

  // ── GET /api/admin/messages ── List sent messages ──
  if (req.method === "GET" && url.pathname === "/api/admin/messages") {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });
    if (auth.user.role !== "admin" && auth.user.role !== "superadmin") {
      return json(res, 403, { error: "Admin access required." });
    }
    // Superadmin sees all; regular admin sees only their own messages (server-side filter)
    const where = auth.user.role === "superadmin" ? {} : { senderId: auth.user.id };
    const messages = await db.adminMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { sender: { select: { id: true, name: true, role: true } } }
    });
    return json(res, 200, { messages });
  }

  // ── GET /api/admin/messages/:id/recipients ── Recipient detail ──
  const msgRecipientsMatch = url.pathname.match(/^\/api\/admin\/messages\/([^/]+)\/recipients$/);
  if (req.method === "GET" && msgRecipientsMatch) {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });
    if (auth.user.role !== "admin" && auth.user.role !== "superadmin") {
      return json(res, 403, { error: "Admin access required." });
    }
    const msgId = msgRecipientsMatch[1];
    const msg = await db.adminMessage.findUnique({ where: { id: msgId } });
    if (!msg) return json(res, 404, { error: "Message not found." });
    // Regular admins can only view their own message recipients
    if (auth.user.role !== "superadmin" && msg.senderId !== auth.user.id) {
      return json(res, 403, { error: "Forbidden." });
    }
    const recipientIds = safeJson(msg.recipientsJson, []);
    const users = await db.user.findMany({
      where: { id: { in: recipientIds } },
      select: { id: true, name: true, email: true, role: true }
    });
    return json(res, 200, { recipients: users, recipientCount: msg.recipientCount });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // §6 — Admin Notification CRUD (real data for admin/pages/notifications.js)
  // ════════════════════════════════════════════════════════════════════════════

  // ── GET /api/admin/notifications ──
  if (req.method === "GET" && url.pathname === "/api/admin/notifications") {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });
    if (auth.user.role !== "admin" && auth.user.role !== "superadmin") {
      return json(res, 403, { error: "Admin only." });
    }
    const notifications = await db.adminNotification.findMany({ orderBy: { createdAt: "desc" } });
    return json(res, 200, { notifications });
  }

  // ── PATCH /api/admin/notifications/mark-read ──
  if (req.method === "PATCH" && url.pathname === "/api/admin/notifications/mark-read") {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });
    if (auth.user.role !== "admin" && auth.user.role !== "superadmin") {
      return json(res, 403, { error: "Admin only." });
    }
    const body = await readBody(req).catch(() => ({}));
    if (body.id) {
      await db.adminNotification.update({ where: { id: body.id }, data: { read: true } }).catch(() => {});
    } else {
      await db.adminNotification.updateMany({ where: { read: false }, data: { read: true } }).catch(() => {});
    }
    return json(res, 200, { ok: true });
  }

  // ── DELETE /api/admin/notifications/:id ── Single delete ──
  const adminNotifDeleteMatch = url.pathname.match(/^\/api\/admin\/notifications\/([^/]+)$/);
  if (req.method === "DELETE" && adminNotifDeleteMatch) {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });
    if (auth.user.role !== "admin" && auth.user.role !== "superadmin") {
      return json(res, 403, { error: "Admin only." });
    }
    await db.adminNotification.delete({ where: { id: adminNotifDeleteMatch[1] } }).catch(() => {});
    return json(res, 200, { ok: true });
  }

  // ── DELETE /api/admin/notifications ── Clear all (writes audit log) ──
  if (req.method === "DELETE" && url.pathname === "/api/admin/notifications") {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });
    if (auth.user.role !== "admin" && auth.user.role !== "superadmin") {
      return json(res, 403, { error: "Admin only." });
    }
    const count = await db.adminNotification.count();
    await db.adminNotification.deleteMany({});
    await writeAudit(auth, "notification.clear_all", "danger", "AdminNotification",
      "All admin notifications", "", { deletedCount: count }, req);
    return json(res, 200, { ok: true, deletedCount: count });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // §7 — Notification Preferences
  // ════════════════════════════════════════════════════════════════════════════

  // ── GET /api/notifications/preferences ──
  if (req.method === "GET" && url.pathname === "/api/notifications/preferences") {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });
    // Return existing prefs or defaults (upsert read: return defaults if no row)
    const prefs = await db.notificationPreference.findUnique({ where: { userId: auth.user.id } });
    return json(res, 200, {
      preferences: prefs ?? {
        userId: auth.user.id, meetingUpdates: true, questionActivity: true,
        systemAlerts: true, adminMessages: true, emailDigest: false
      }
    });
  }

  // ── PATCH /api/notifications/preferences ──
  if (req.method === "PATCH" && url.pathname === "/api/notifications/preferences") {
    const auth = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized." });
    const body = await readBody(req).catch(() => ({}));
    const allowed = ["meetingUpdates", "questionActivity", "systemAlerts", "adminMessages", "emailDigest"];
    const data = {};
    for (const key of allowed) {
      if (typeof body[key] === "boolean") data[key] = body[key];
    }
    const prefs = await db.notificationPreference.upsert({
      where:  { userId: auth.user.id },
      update: data,
      create: { userId: auth.user.id, ...data }
    });
    return json(res, 200, { preferences: prefs });
  }

  return json(res, 404, { error: "API route not found" });
}


// ── Audit log writer ─────────────────────────────────────────────────────────
async function writeAudit(auth, action, actionType, targetType, targetName, targetId, detail, req) {
  try {
    const ip = req?.socket?.remoteAddress || req?.headers?.["x-forwarded-for"] || "";
    await db.auditLog.create({
      data: {
        adminId:    auth.user.id,
        adminName:  auth.user.name,
        adminRole:  auth.user.role,
        action,
        actionType,
        targetType,
        targetName,
        targetId:   String(targetId),
        detailJson: JSON.stringify(detail || {}),
        ipAddress:  String(ip),
      }
    });
  } catch (err) {
    console.error("[Audit] Failed to write audit log:", err.message);
  }
}

/**
 * Thin wrapper that catches errors thrown by readBody (413 / 400) and
 * responds before any route logic runs. All other errors bubble up to
 * the server.js top-level try/catch.
 */
async function handleApiRequestSafe(req, res) {
  try {
    await handleApiRequest(req, res);
  } catch (err) {
    if (err.status === 413) return json(res, 413, { error: "Payload too large (max 1 MiB)." });
    if (err.status === 400) return json(res, 400, { error: err.message || "Invalid JSON in request body." });
    throw err; // re-throw so server.js top-level handler logs and responds 500
  }
}

module.exports = handleApiRequestSafe;
// Export NLP internals so server.js WS handler can share the same code path
module.exports._nlpCache         = _nlpCache;
module.exports.persistCluster    = persistCluster;
module.exports.submitQuestionShared = submitQuestionShared;


