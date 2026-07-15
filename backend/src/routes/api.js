/* ============================================================
   API Routes — Phase 2 (Prisma DB) + Phase 3+4+5 hardening
   All persistent data (meetings, questions, polls, participants,
   notifications) is now read/written via Prisma.
   The NLP engine still runs in-memory (per active meeting) for
   performance — rehydrated from DB on first access.
   ============================================================ */
"use strict";
const crypto  = require("crypto");
const db      = require("../db/client");
const { json, readBody } = require("../utils/helpers");
const { processQuestion } = require("../nlp/engine");
const { recomputeScores } = require("../nlp/scoring");
const { handleAuthRequest, verifyToken } = require("./auth");

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
    createdAt:         row.createdAt?.getTime?.() ?? Date.now()
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
      timelineJson:      JSON.stringify(cluster.timeline || [])
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
      timelineJson:      JSON.stringify(cluster.timeline || [])
    }
  });
}

// ── Broadcast (lazy-loaded to avoid circular deps) ────────────
function broadcast(event, data, meetingId = null) {
  try {
    const { broadcast: _b } = require("../../server");
    _b({ event, data, meetingId });
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
      { label: "Questions Asked",  value: questionsAsked,  delta: "+15%" },
      { label: "Upvotes Received", value: upvotesReceived, delta: "+22%" },
      { label: "Answers Given",    value: answersGiven,    delta: "+11%" },
      { label: "Meetings Joined",  value: meetingsJoined,  delta: "+9%"  }
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
      upvotesCount:      questions.reduce((s, q) => s + (q.votes || 0), 0),
      avgLatency:        "38ms"
    }
  };
}

const ALLOWED_SETTINGS = new Set(["allowQuestions", "enableChat", "recordMeeting", "allowScreenShare"]);
function sanitizeSettings(raw) {
  if (!raw || typeof raw !== "object") return {};
  const safe = {};
  for (const key of ALLOWED_SETTINGS) {
    if (key in raw) safe[key] = Boolean(raw[key]);
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

  // ── GET /api/sessions/code/:code ────────────────────────
  if (req.method === "GET" && url.pathname.startsWith("/api/sessions/code/")) {
    const code    = url.pathname.split("/").pop();
    const meeting = await db.meeting.findUnique({ where: { code } });
    if (!meeting) return json(res, 404, { error: "Meeting not found" });
    return json(res, 200, { meeting });
  }

  // ── GET /api/session/live?meetingId= ────────────────────
  if (req.method === "GET" && url.pathname === "/api/session/live") {
    const meetingId = url.searchParams.get("meetingId") || "m_ai_education";
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
    const meetingId = url.searchParams.get("meetingId") || "m_ai_education";
    const questions = await getCache(meetingId);
    const ranked    = [...questions].sort((a, b) => (b.score || 0) - (a.score || 0));
    return json(res, 200, { questions: ranked });
  }

  // ── POST /api/questions?meetingId= ──────────────────────
  if (req.method === "POST" && url.pathname === "/api/questions") {
    const body      = await readBody(req);
    const meetingId = getMeetingId(url, body) || "m_ai_education";
    const text      = String(body.text || "").trim();
    if (!text) return json(res, 400, { error: "Question text is required" });
    if (text.length > 500) return json(res, 400, { error: "Question text must be 500 characters or fewer" });

    const auth    = await requireAuth(req);
    const askedBy = body.askedBy || auth?.user?.name || "Anonymous";
    const askedById = auth?.user?.id || null;

    // NLP: cluster or create (in-memory)
    const cache   = await getCache(meetingId);
    const cluster = processQuestion(meetingId, text, askedBy, cache);
    cluster.askedById = askedById;

    // Persist to DB
    await persistCluster(cluster);

    const ranked = [...cache].sort((a, b) => (b.score || 0) - (a.score || 0));
    broadcast("question_submitted", cluster, meetingId);
    broadcast("session_stats",      (await livePayload(meetingId)).stats, meetingId);
    return json(res, 201, { question: cluster, questions: ranked });
  }

  // ── POST /api/questions/:id/upvote ──────────────────────
  if (req.method === "POST" && url.pathname.match(/^\/api\/questions\/[^/]+\/upvote$/)) {
    const id        = url.pathname.split("/")[3];
    const body      = await readBody(req);
    const meetingId = getMeetingId(url, body) || "m_ai_education";

    const row = await db.question.update({
      where: { id },
      data:  { votes: { increment: 1 } }
    }).catch(() => null);
    if (!row) return json(res, 404, { error: "Question not found" });

    // Sync cache
    const cache = await getCache(meetingId);
    const cached = cache.find(q => q.id === id);
    if (cached) cached.votes = row.votes;
    recomputeScores(meetingId, cache);
    if (cached) await db.question.update({ where: { id }, data: { score: cached.score } });

    broadcast("question_upvoted", { id, votes: row.votes, score: cached?.score ?? row.score }, meetingId);
    return json(res, 200, { question: cached ?? dbRowToCluster(row) });
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

    // Sync cache
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

  // ── POST /api/sessions ───────────────────────────────────
  if (req.method === "POST" && url.pathname === "/api/sessions") {
    const body    = await readBody(req);
    const auth    = await requireAuth(req);
    if (!auth) return json(res, 401, { error: "Unauthorized. Please log in to create a meeting." });

    const { user } = auth;
    const defaultSpeaker = user.name || "Host";
    const code = String(Math.floor(100000 + Math.random() * 899999));

    const meeting = await db.meeting.create({
      data: {
        code,
        title:       String(body.title || "Untitled Meeting").slice(0, 200),
        speaker:     String(body.speaker || defaultSpeaker).slice(0, 100),
        date:        body.date      || new Date().toLocaleDateString(),
        time:        body.time      || "02:00 PM - 03:30 PM",
        duration:    body.duration  || "1h 30m",
        status:      "upcoming",
        ownerId:     user.id,
        description: String(body.description || "").slice(0, 1000),
        settingsJson: JSON.stringify(sanitizeSettings(body.settings)),
        category:    body.category  || "Custom"
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
    delete _nlpCache[id]; // evict NLP cache
    return json(res, 200, { deleted: true });
  }

  // ── GET /api/activity ────────────────────────────────────
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
    const auth      = await requireAuth(req);
    const meetingId = url.searchParams.get("meetingId") || "m_ai_education";
    const questions = await getCache(meetingId);
    const meeting   = await db.meeting.findUnique({ where: { id: meetingId } })
      || await db.meeting.findFirst({ orderBy: { createdAt: "desc" } });
    const participants = await db.participant.findMany({ where: { meetingId } });

    return json(res, 200, {
      session:   meeting,
      analytics: {
        ...await analytics(auth?.user?.id ?? null),
        totals: {
          participants:   participants.length || 128,
          questions:      questions.length,
          uniqueClusters: questions.length,
          upvotes:        questions.reduce((s, q) => s + (q.votes || 0), 0),
          queueReduction: "63%",
          averageLatency: "38ms"
        },
        aiSummary: "Most discussion centered on responsible AI use, student privacy, remote-learning outcomes, and institutional policy."
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

  return json(res, 404, { error: "API route not found" });
}

module.exports = handleApiRequest;
