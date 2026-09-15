/* ============================================================
   src/services/meeting.service.js
   All business logic for meetings, sessions, polls,
   announcements, enrollments, and grace-period management.

   Framework-agnostic: no req/res objects, no HTTP concerns.
   ============================================================ */
"use strict";

const crypto = require("crypto");
const qrcode = require("qrcode");

const meetingRepo = require("../repositories/meeting.repository");
const db          = require("../db/client");
const { buildMeetingDigest } = require("../utils/reportSummary");
const { sendDigestEmail }    = require("../utils/mailer");

// ── Broadcast helper (lazy to avoid circular dep with server.js) ──
function broadcast(event, data, meetingId = null, opts = {}) {
  try {
    const { broadcast: _b } = require("../../server");
    _b({ event, data, meetingId }, null, opts);
  } catch { /* server not yet attached */ }
}

// ── Helpers ───────────────────────────────────────────────────

/**
 * Parse JSON settings, returning {} on failure.
 * @param {string|null} raw
 * @returns {object}
 */
function parseSettings(raw) {
  try { return JSON.parse(raw || "{}"); } catch { return {}; }
}

const ALLOWED_SETTINGS = new Set([
  "allowQuestions", "enableChat", "recordMeeting",
  "upvoteReact", "showParticipants", "requireApproval", "qaMode", "language",
]);

/**
 * Strip unknown keys from meeting settings, coerce booleans.
 * @param {object} raw
 * @returns {object}
 */
function sanitizeSettings(raw) {
  if (!raw || typeof raw !== "object") return {};
  const safe = {};
  for (const key of ALLOWED_SETTINGS) {
    if (key in raw) safe[key] = raw[key];
  }
  return safe;
}

const VALID_STATUSES = new Set(["live", "upcoming", "conducted", "past"]);

// ── Permission helpers ─────────────────────────────────────────

/**
 * Assert that the authenticated user owns the meeting.
 * Returns null if OK, "401" if not authenticated, "403" if not owner.
 * @param {object|null} auth  — { user, payload } from requireAuth
 * @param {object|null} meeting
 * @returns {"401"|"403"|null}
 */
function checkOwnership(auth, meeting) {
  if (!auth) return "401";
  if (meeting && meeting.ownerId !== auth.user.id) return "403";
  return null;
}

// ── Meeting CRUD ──────────────────────────────────────────────

/**
 * Get the full meeting detail (with owner, participant counts, etc.).
 * @param {string} id
 * @param {object|null} currentUser
 * @returns {Promise<object>}
 */
async function getMeetingById(id, currentUser) {
  const meeting = await meetingRepo.findByIdWithDetails(id);
  if (!meeting) return null;

  const isOwner  = currentUser ? meeting.ownerId === currentUser.id : false;
  const settings = parseSettings(meeting.settingsJson);

  return {
    ...meeting,
    participantCount: meeting.participants?.length ?? 0,
    enrollmentCount:  meeting.enrollments?.length ?? 0,
    pollCount:        meeting.polls?.length ?? 0,
    settings,
    isOwner,
    shortId: meeting.code ? `CV-${meeting.code}` : meeting.id.slice(0, 8).toUpperCase(),
  };
}

/**
 * List all meetings.
 * @returns {Promise<object[]>}
 */
async function listMeetings() {
  return meetingRepo.findAll();
}

/**
 * Get all meetings owned/enrolled by a user, grouped by status.
 * @param {string} userId
 * @returns {Promise<object>}
 */
async function getMyMeetings(userId) {
  return meetingRepo.findMine(userId);
}

/**
 * Create a new meeting for the authenticated user.
 * @param {object} body    — parsed request body
 * @param {object} user    — authenticated user row
 * @returns {Promise<object>} — created meeting row
 */
async function createMeeting(body, user) {
  const defaultSpeaker = user.name || "Host";

  // Generate unique 6-digit code
  let code;
  for (let attempt = 0; attempt < 10; attempt++) {
    const digits    = attempt < 9 ? 6 : 8;
    const min       = 10 ** (digits - 1);
    const range     = 9 * min;
    const candidate = String(Math.floor(min + Math.random() * range));
    const clash     = await db.meeting.findUnique({ where: { code: candidate }, select: { id: true } });
    if (!clash) { code = candidate; break; }
  }
  if (!code) code = crypto.randomBytes(4).toString("hex");

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
  const statusIn  = ["live", "upcoming", "conducted", "past"].includes(body.status)
    ? body.status : "upcoming";

  return meetingRepo.create({
    code,
    title:        String(body.title       || "Untitled Meeting").slice(0, 200),
    speaker:      String(body.speaker     || defaultSpeaker).slice(0, 100),
    date:         dateStr,
    time:         timeStr,
    duration:     durLabel,
    scheduledAt:  isValid ? scheduled : new Date(),
    status:       statusIn,
    ownerId:      user.id,
    description:  String(body.description || "").slice(0, 1000),
    settingsJson: JSON.stringify(sanitizeSettings(body.settings)),
    category:     body.category || "Custom",
  });
}

/**
 * Update editable meeting fields (title, description, date, time, speaker).
 * @param {string} id
 * @param {object} body
 * @returns {Promise<object>}
 */
async function updateMeeting(id, body) {
  const data = {};
  if (body.title       !== undefined) data.title       = String(body.title).slice(0, 200);
  if (body.description !== undefined) data.description = String(body.description).slice(0, 1000);
  if (body.date        !== undefined) data.date        = body.date;
  if (body.time        !== undefined) data.time        = body.time;
  if (body.speaker     !== undefined) data.speaker     = String(body.speaker).slice(0, 100);
  return meetingRepo.update(id, data);
}

/**
 * Change meeting status.
 * @param {string} id
 * @param {string} status
 * @returns {Promise<object>}
 */
async function changeMeetingStatus(id, status) {
  if (!VALID_STATUSES.has(status)) {
    throw Object.assign(new Error(`Status must be one of: ${[...VALID_STATUSES].join(", ")}`), { status: 400 });
  }
  const updated = await meetingRepo.update(id, { status });
  broadcast("meeting_status_changed", { meetingId: id, status }, id);
  return updated;
}

/**
 * Delete a meeting and clear its NLP cache.
 * @param {string} id
 * @param {object} nlpCache — the _nlpCache map from question service
 * @returns {Promise<void>}
 */
async function deleteMeeting(id, nlpCache) {
  await meetingRepo.remove(id);
  if (nlpCache) delete nlpCache[id];
}

// ── Session lifecycle ─────────────────────────────────────────

/**
 * Start a session (set status to "live") and notify enrolled users.
 * @param {string} id
 * @returns {Promise<object>} — updated meeting
 */
async function startSession(id) {
  const updated = await meetingRepo.update(id, { status: "live" });

  broadcast("meeting_started",        { meetingId: id, status: "live" }, id);
  broadcast("meeting_status_changed", { meetingId: id, status: "live" }, id);
  broadcast("meeting_started",        { meetingId: id, status: "live" }, null);
  broadcast("meeting_status_changed", { meetingId: id, status: "live" }, null);

  // Fire-and-forget: notify all enrolled users
  (async () => {
    try {
      const enrollments = await db.meetingEnrollment.findMany({
        where:  { meetingId: id },
        select: { userId: true },
      });
      if (enrollments.length === 0) return;
      const notifData = enrollments.map(e => ({
        userId:  e.userId,
        type:    "Meeting Updates",
        title:   `Meeting is now live: ${updated.title}`,
        body:    `"${updated.title}" has started. Join now!`,
        time:    "Just now",
        source:  "system",
        read:    false,
      }));
      await db.notification.createMany({ data: notifData, skipDuplicates: true });
      try {
        const { pushNotificationToUser } = require("../../server");
        if (pushNotificationToUser) {
          for (const e of enrollments) {
            pushNotificationToUser(e.userId, {
              type:   "Meeting Updates",
              title:  `Meeting is now live: ${updated.title}`,
              body:   `"${updated.title}" has started. Join now!`,
              time:   "Just now",
              read:   false,
              source: "system",
            });
          }
        }
      } catch { /* WS push best-effort */ }
    } catch (err) {
      console.error("[notify] meeting-live fan-out error:", err.message);
    }
  })();

  return updated;
}

/**
 * End a session (set status to "conducted") and send digest email.
 * @param {string} id
 * @returns {Promise<object>} — updated meeting
 */
async function endSession(id) {
  const meeting = await meetingRepo.findByIdWithOwner(id);
  if (!meeting) return null;

  const updated = await meetingRepo.update(id, { status: "conducted" });

  broadcast("meeting_ended",          { meetingId: id, status: "conducted" }, id);
  broadcast("meeting_status_changed", { meetingId: id, status: "conducted" }, id);
  broadcast("meeting_ended",          { meetingId: id, status: "conducted" }, null);
  broadcast("meeting_status_changed", { meetingId: id, status: "conducted" }, null);

  // Fire-and-forget: post-meeting digest email
  buildMeetingDigest(id)
    .then(summary => sendDigestEmail({ ...meeting, ...updated }, summary))
    .catch(err => console.error("[Digest] Email send failed:", err.message));

  return updated;
}

// ── QR code ───────────────────────────────────────────────────

/**
 * Generate a QR SVG string linking to the meeting join page.
 * @param {string} meetingCode
 * @param {string} proto  — "http" or "https"
 * @param {string} host
 * @returns {Promise<{ svg: string, joinLink: string }>}
 */
async function generateQrCode(meetingCode, proto, host) {
  const joinLink = `${proto}://${host}/#/join/${meetingCode}`;
  const svg = await qrcode.toString(joinLink, {
    type:   "svg",
    width:  300,
    margin: 1,
    color:  { dark: "#5b34ff", light: "#ffffff" },
  });
  return { svg, joinLink };
}

// ── Enrollment ────────────────────────────────────────────────

/**
 * Enroll a user in a meeting by join code.
 * @param {string} code
 * @param {string} userId
 * @param {"code"|"qr"} method
 * @returns {Promise<{ meeting: object, enrollment: object, action: string }>}
 */
async function enrollByCode(code, userId, method = "code") {
  const meeting = await meetingRepo.findByCode(code);
  if (!meeting) return { notFound: true };
  if (meeting.status === "expired")
    return { gone: true, meeting, message: "This meeting has expired." };
  if (meeting.status === "conducted" || meeting.status === "past")
    return { gone: true, meeting, message: "This meeting has already ended." };

  const enrollment = await meetingRepo.upsertEnrollment(meeting.id, userId, method);
  const action     = meeting.status === "live" ? "join_now" : "added_to_upcoming";

  return { meeting, enrollment, action };
}

/**
 * Enroll a user in a meeting by meeting ID (QR scan path).
 * @param {string} id
 * @param {string} userId
 * @returns {Promise<{ meeting: object, enrollment: object, action: string }>}
 */
async function enrollById(id, userId) {
  const meeting = await meetingRepo.findById(id);
  if (!meeting) return { notFound: true };
  if (meeting.status === "expired")
    return { gone: true, meeting, message: "This meeting has expired." };

  const enrollment = await meetingRepo.upsertEnrollment(id, userId, "qr");
  const action     = meeting.status === "live" ? "join_now" : "added_to_upcoming";

  return { meeting, enrollment, action };
}

// ── Grace period / extend / reschedule ────────────────────────

/**
 * Get grace period state for a meeting.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
async function getGracePeriod(id) {
  const meeting = await meetingRepo.findByIdWithGrace(id);
  if (!meeting) return null;
  return { meeting, gracePeriod: meeting.gracePeriod || null };
}

/**
 * Extend a meeting by N minutes.
 * @param {string} id
 * @param {number} extendMins
 * @returns {Promise<{ meeting: object, extendedByMins: number }>}
 */
async function extendMeeting(id, extendMins = 30) {
  const clampedMins = Math.min(Number(extendMins) || 30, 120);
  const EXTEND_MS   = clampedMins * 60 * 1000;
  const now         = new Date();

  const meeting = await meetingRepo.findByIdWithGrace(id);
  if (!meeting) return null;

  const newScheduledAt = new Date((meeting.scheduledAt || now).getTime() + EXTEND_MS);
  const newGraceEndsAt = new Date(now.getTime() + EXTEND_MS);

  const updated = await meetingRepo.extend(id, newScheduledAt, newGraceEndsAt, meeting.gracePeriod);

  broadcast("meeting_extended", {
    meetingId:      id,
    newScheduledAt: newScheduledAt.toISOString(),
    graceEndsAt:    newGraceEndsAt.toISOString(),
    extendedByMins: clampedMins,
  }, id);

  return { meeting: updated, extendedByMins: clampedMins };
}

/**
 * Reschedule a meeting to a new date/time.
 * @param {string} id
 * @param {Date}   newScheduledAt
 * @returns {Promise<object>} — updated meeting
 */
async function rescheduleMeeting(id, newScheduledAt) {
  const meeting = await meetingRepo.findByIdWithGrace(id);
  if (!meeting) return null;

  const dateStr = newScheduledAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = newScheduledAt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });

  const updated = await meetingRepo.reschedule(id, newScheduledAt, dateStr, timeStr, meeting.gracePeriod);

  broadcast("meeting_rescheduled", {
    meetingId:      id,
    newScheduledAt: newScheduledAt.toISOString(),
    date:           dateStr,
    time:           timeStr,
  }, id);

  // Notify enrolled users
  const enrolled = await meetingRepo.findEnrollments(id);
  for (const e of enrolled) {
    broadcast("meeting_rescheduled", {
      meetingId:      id,
      newScheduledAt: newScheduledAt.toISOString(),
      date:           dateStr,
      time:           timeStr,
    }, id, { onlyUserId: e.userId });
  }

  return updated;
}

// ── Live session data ─────────────────────────────────────────

/**
 * Build the full live session payload (questions + polls + participants + stats).
 * Delegates question cache access to the passed-in getCache function to
 * avoid a circular dep between meeting.service and question.service.
 * @param {string}   meetingId
 * @param {Function} getCache  — async (meetingId) => clusterArray
 * @returns {Promise<object>}
 */
async function getLivePayload(meetingId, getCache) {
  const questions    = await getCache(meetingId);
  const polls        = await db.poll.findMany({ where: { meetingId }, include: { options: true } });
  const participants = await db.participant.findMany({ where: { meetingId } });
  const ranked       = [...questions].sort((a, b) => (b.score || 0) - (a.score || 0));
  return {
    questions: ranked,
    polls:     polls.map(p => ({ ...p, endsAt: p.endsAt?.getTime?.() ?? null })),
    participants,
    stats: {
      questionsCount:    questions.length,
      participantsCount: participants.length,
      upvotesCount:      questions.reduce((s, q) => s + (q.votes || 0), 0),
    },
  };
}

// ── Polls ─────────────────────────────────────────────────────

/**
 * Create a poll for a meeting.
 * @param {string}   meetingId
 * @param {string}   question
 * @param {string[]} labels
 * @param {Date|null} endsAt
 * @returns {Promise<object>}
 */
async function createPoll(meetingId, question, labels, endsAt) {
  const poll = await db.poll.create({
    data: {
      meetingId,
      question,
      active:  true,
      endsAt:  endsAt ? new Date(endsAt) : new Date(Date.now() + 5 * 60 * 1000),
      options: { create: labels.map(label => ({ label })) },
    },
    include: { options: true },
  });
  broadcast("poll_created", { ...poll, endsAt: poll.endsAt?.getTime?.() ?? null }, meetingId);
  return poll;
}

/**
 * End (close) a poll.
 * @param {string} pollId
 * @returns {Promise<object>}
 */
async function endPoll(pollId) {
  const poll = await db.poll.findUnique({ where: { id: pollId }, include: { options: true } });
  if (!poll) return null;

  const updated = await db.poll.update({
    where:   { id: pollId },
    data:    { active: false },
    include: { options: true },
  });

  broadcast("poll_ended",   { ...updated, endsAt: updated.endsAt?.getTime?.() ?? null }, poll.meetingId);
  broadcast("poll_updated", { ...updated, endsAt: updated.endsAt?.getTime?.() ?? null }, poll.meetingId);
  return updated;
}

/**
 * Cast a vote on a poll option (deduped per voter).
 * @param {string} pollId
 * @param {string} optionId
 * @param {string} voterId
 * @param {string} meetingId
 * @returns {Promise<{ poll: object } | { conflict: true } | { badOption: true }>}
 */
async function votePoll(pollId, optionId, voterId, meetingId) {
  // Deduplicate if PollVote model is available
  if (db.pollVote) {
    const existing = await db.pollVote.findUnique({
      where: { pollId_voterId: { pollId, voterId } },
    }).catch(() => null);
    if (existing) return { conflict: true };

    await db.pollVote.create({
      data: { pollId, optionId, voterId },
    }).catch(() => {});
  }

  const option = await db.pollOption.update({
    where: { id: optionId },
    data:  { votes: { increment: 1 } },
  }).catch(() => null);

  if (!option || option.pollId !== pollId) return { badOption: true };

  const poll = await db.poll.findUnique({ where: { id: pollId }, include: { options: true } });
  if (!poll) return { notFound: true };

  const total = poll.options.reduce((s, o) => s + o.votes, 0);
  await db.poll.update({ where: { id: pollId }, data: { totalVotes: total } });
  poll.totalVotes = total;

  broadcast("poll_updated", { ...poll, endsAt: poll.endsAt?.getTime?.() ?? null }, meetingId);
  return { poll: { ...poll, endsAt: poll.endsAt?.getTime?.() ?? null } };
}

// ── Home data ─────────────────────────────────────────────────

/**
 * Build the home-page payload for an authenticated user.
 * @param {object} user
 * @param {Function} getCache  — async (meetingId) => clusterArray
 * @returns {Promise<object>}
 */
async function getHomeData(user, getCache) {
  const ownedMeetings = await meetingRepo.findOwnedByUser(user.id);
  const ownedIds      = ownedMeetings.map(m => m.id);
  const enrolledIds   = await meetingRepo.findEnrolledIds(user.id);
  const userMeetingIds = [...new Set([...ownedIds, ...enrolledIds])];

  const [upcoming, liveM] = await Promise.all([
    meetingRepo.findUpcomingForUser(userMeetingIds, 5),
    meetingRepo.findLiveForUser(userMeetingIds),
  ]);

  const liveQs = liveM ? await getCache(liveM.id) : [];

  return {
    user: { id: user.id, name: user.name, email: user.email, picture: user.picture, ownedMeetingIds: ownedIds },
    live: liveM,
    upcoming,
    recentActivity: liveQs[0] || null,
  };
}

// ── Announcement ─────────────────────────────────────────────

/**
 * Broadcast a meeting announcement to all clients in the room.
 * @param {string} meetingId
 * @param {string} message
 */
function sendAnnouncement(meetingId, message) {
  broadcast("announcement", { message, time: new Date().toISOString() }, meetingId);
}

module.exports = {
  // permission helpers
  checkOwnership,
  sanitizeSettings,
  parseSettings,
  // CRUD
  getMeetingById,
  listMeetings,
  getMyMeetings,
  createMeeting,
  updateMeeting,
  changeMeetingStatus,
  deleteMeeting,
  // sessions
  startSession,
  endSession,
  generateQrCode,
  // enrollment
  enrollByCode,
  enrollById,
  // grace period
  getGracePeriod,
  extendMeeting,
  rescheduleMeeting,
  // live data
  getLivePayload,
  // polls
  createPoll,
  endPoll,
  votePoll,
  // home
  getHomeData,
  // announcements
  sendAnnouncement,
};
