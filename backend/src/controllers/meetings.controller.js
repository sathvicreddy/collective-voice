/* ============================================================
   src/controllers/meetings.controller.js
   Parses req, calls meeting.service, shapes res.
   No DB queries. No business rules.
   ============================================================ */
"use strict";

const { json, readBody }    = require("../utils/helpers");
const meetingSvc             = require("../services/meeting.service");

// ── Auth helpers ───────────────────────────────────────────────
// Imported lazily to keep the same pattern as the original api.js
// and avoid any circular dependency issues.
async function _requireAuth(req) {
  const { verifyToken } = require("../routes/auth");
  const db = require("../db/client");
  const payload = verifyToken(req);
  if (!payload) return null;
  const user = await db.user.findUnique({ where: { id: payload.sub } });
  if (!user) return null;
  return { payload, user };
}

async function _requireModerator(req, meeting) {
  const auth = await _requireAuth(req);
  if (!auth) return "401";
  if (meeting && meeting.ownerId !== auth.user.id) return "403";
  return null;
}

// ── NLP cache accessor (from question service) ─────────────────
function _getCache() {
  return require("../services/question.service").getCache;
}

// ── Handlers ──────────────────────────────────────────────────

async function getAll(req, res) {
  const meetings = await meetingSvc.listMeetings();
  return json(res, 200, { meetings });
}

async function getMine(req, res) {
  const auth = await _requireAuth(req);
  if (!auth) return json(res, 401, { error: "Unauthorized." });
  const result = await meetingSvc.getMyMeetings(auth.user.id);
  return json(res, 200, result);
}

async function getById(req, res, id) {
  const auth        = await _requireAuth(req);
  const currentUser = auth?.user || null;
  const meeting     = await meetingSvc.getMeetingById(id, currentUser);
  if (!meeting) return json(res, 404, { error: "Meeting not found" });
  return json(res, 200, { meeting });
}

async function getLive(req, res, url) {
  const meetingId = url.searchParams.get("meetingId");
  if (!meetingId) return json(res, 400, { error: "meetingId query parameter is required" });
  const getCache = _getCache();
  return json(res, 200, await meetingSvc.getLivePayload(meetingId, getCache));
}

async function getQrCode(req, res, id) {
  const meeting = await require("../repositories/meeting.repository").findById(id);
  if (!meeting) return json(res, 404, { error: "Meeting not found" });
  const proto = req.headers["x-forwarded-proto"] || "http";
  try {
    const { svg, joinLink } = await meetingSvc.generateQrCode(meeting.code, proto, req.headers.host);
    res.writeHead(200, {
      "Content-Type":  "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
      "X-Join-Link":   joinLink,
    });
    res.end(svg);
  } catch (err) {
    console.error("[QR] Failed to generate QR code:", err.message);
    return json(res, 500, { error: "QR generation failed" });
  }
}

async function getByCode(req, res, code) {
  const meeting = await require("../repositories/meeting.repository").findByCode(code);
  if (!meeting) return json(res, 404, { error: "Meeting not found" });
  return json(res, 200, { meeting });
}

async function create(req, res) {
  const body = await readBody(req);
  const auth = await _requireAuth(req);
  if (!auth) return json(res, 401, { error: "Unauthorized. Please log in to create a meeting." });
  const meeting = await meetingSvc.createMeeting(body, auth.user);
  return json(res, 201, { meeting });
}

async function update(req, res, id) {
  const meeting = await require("../repositories/meeting.repository").findById(id);
  if (!meeting) return json(res, 404, { error: "Meeting not found" });
  const authErr = await _requireModerator(req, meeting);
  if (authErr === "401") return json(res, 401, { error: "Unauthorized." });
  if (authErr === "403") return json(res, 403, { error: "Forbidden." });
  const body    = await readBody(req);
  const updated = await meetingSvc.updateMeeting(id, body);
  return json(res, 200, { meeting: updated });
}

async function patchStatus(req, res, id) {
  const meeting = await require("../repositories/meeting.repository").findById(id);
  if (!meeting) return json(res, 404, { error: "Meeting not found" });
  const authErr = await _requireModerator(req, meeting);
  if (authErr === "401") return json(res, 401, { error: "Unauthorized." });
  if (authErr === "403") return json(res, 403, { error: "Forbidden." });
  const body    = await readBody(req);
  const allowed = ["upcoming", "live", "conducted", "past"];
  if (!allowed.includes(body.status))
    return json(res, 400, { error: `Status must be one of: ${allowed.join(", ")}` });
  const updated = await meetingSvc.changeMeetingStatus(id, body.status);
  return json(res, 200, { meeting: updated });
}

async function remove(req, res, id) {
  const meeting = await require("../repositories/meeting.repository").findById(id);
  if (!meeting) return json(res, 404, { error: "Meeting not found" });
  const authErr = await _requireModerator(req, meeting);
  if (authErr === "401") return json(res, 401, { error: "Unauthorized." });
  if (authErr === "403") return json(res, 403, { error: "Forbidden." });
  const getCache = _getCache();
  const nlpCache = (await Promise.resolve(null)) || require("../services/question.service")._nlpCache;
  await meetingSvc.deleteMeeting(id, nlpCache);
  return json(res, 200, { deleted: true });
}

async function startSession(req, res, id) {
  const meeting = await require("../repositories/meeting.repository").findById(id);
  if (!meeting) return json(res, 404, { error: "Meeting not found" });
  const authErr = await _requireModerator(req, meeting);
  if (authErr === "401") return json(res, 401, { error: "Unauthorized." });
  if (authErr === "403") return json(res, 403, { error: "Forbidden." });
  const updated = await meetingSvc.startSession(id);
  return json(res, 200, { meeting: updated });
}

async function endSession(req, res, id) {
  const meeting = await require("../repositories/meeting.repository").findById(id);
  if (!meeting) return json(res, 404, { error: "Meeting not found" });
  const authErr = await _requireModerator(req, meeting);
  if (authErr === "401") return json(res, 401, { error: "Unauthorized." });
  if (authErr === "403") return json(res, 403, { error: "Forbidden." });
  const updated = await meetingSvc.endSession(id);
  return json(res, 200, { meeting: updated });
}

async function enrollByCode(req, res, code) {
  const auth = await _requireAuth(req);
  if (!auth) return json(res, 401, { error: "Sign in to enroll in a meeting." });
  const body   = await readBody(req).catch(() => ({}));
  const method = body.method === "qr" ? "qr" : "code";
  const result = await meetingSvc.enrollByCode(code, auth.user.id, method);
  if (result.notFound) return json(res, 404, { error: "Meeting not found." });
  if (result.gone)     return json(res, 410, { error: result.message, meeting: result.meeting });
  const status = result.action === "join_now" ? 200 : 201;
  return json(res, status, result);
}

async function enrollById(req, res, id) {
  const auth = await _requireAuth(req);
  if (!auth) return json(res, 401, { error: "Sign in to enroll in a meeting." });
  const result = await meetingSvc.enrollById(id, auth.user.id);
  if (result.notFound) return json(res, 404, { error: "Meeting not found." });
  if (result.gone)     return json(res, 410, { error: result.message, meeting: result.meeting });
  return json(res, 201, result);
}

async function getGrace(req, res, id) {
  const meeting = await require("../repositories/meeting.repository").findById(id);
  if (!meeting) return json(res, 404, { error: "Meeting not found." });
  const authErr = await _requireModerator(req, meeting);
  if (authErr === "401") return json(res, 401, { error: "Unauthorized." });
  if (authErr === "403") return json(res, 403, { error: "Forbidden." });
  const result = await meetingSvc.getGracePeriod(id);
  return json(res, 200, { gracePeriod: result?.gracePeriod ?? null });
}

async function extend(req, res, id) {
  const meeting = await require("../repositories/meeting.repository").findById(id);
  if (!meeting) return json(res, 404, { error: "Meeting not found." });
  const authErr = await _requireModerator(req, meeting);
  if (authErr === "401") return json(res, 401, { error: "Unauthorized." });
  if (authErr === "403") return json(res, 403, { error: "Forbidden." });
  const body   = await readBody(req).catch(() => ({}));
  const result = await meetingSvc.extendMeeting(id, body.minutes);
  if (!result) return json(res, 404, { error: "Meeting not found." });
  return json(res, 200, result);
}

async function reschedule(req, res, id) {
  const meeting = await require("../repositories/meeting.repository").findById(id);
  if (!meeting) return json(res, 404, { error: "Meeting not found." });
  const authErr = await _requireModerator(req, meeting);
  if (authErr === "401") return json(res, 401, { error: "Unauthorized." });
  if (authErr === "403") return json(res, 403, { error: "Forbidden." });
  const body   = await readBody(req);
  if (!body.scheduledAt) return json(res, 400, { error: "scheduledAt is required." });
  const newDate = new Date(body.scheduledAt);
  if (isNaN(newDate.getTime())) return json(res, 400, { error: "Invalid scheduledAt." });
  if (newDate <= new Date())    return json(res, 400, { error: "New time must be in the future." });
  const updated = await meetingSvc.rescheduleMeeting(id, newDate);
  if (!updated) return json(res, 404, { error: "Meeting not found." });
  return json(res, 200, { meeting: updated });
}

async function sendAnnouncement(req, res) {
  const body      = await readBody(req);
  const meetingId = body.meetingId || null;
  const meeting   = meetingId ? await require("../repositories/meeting.repository").findById(meetingId) : null;
  const authErr   = await _requireModerator(req, meeting);
  if (authErr === "401") return json(res, 401, { error: "Unauthorized." });
  if (authErr === "403") return json(res, 403, { error: "Forbidden — you are not the meeting owner." });
  const msg = String(body.message || "").trim();
  if (!msg) return json(res, 400, { error: "Message required" });
  meetingSvc.sendAnnouncement(meetingId, msg);
  return json(res, 200, { sent: true });
}

// ── Poll handlers ──────────────────────────────────────────────

async function createPoll(req, res) {
  const body      = await readBody(req);
  const meetingId = body.meetingId || null;
  const meeting   = meetingId ? await require("../repositories/meeting.repository").findById(meetingId) : null;
  const authErr   = await _requireModerator(req, meeting);
  if (authErr === "401") return json(res, 401, { error: "Unauthorized." });
  if (authErr === "403") return json(res, 403, { error: "Forbidden — you are not the meeting owner." });
  const question = String(body.question || "").trim();
  if (!question) return json(res, 400, { error: "Poll question is required" });
  const labels = (body.options || []).map(l => String(l).trim()).filter(Boolean);
  if (labels.length < 2) return json(res, 400, { error: "At least 2 options required" });
  const poll = await meetingSvc.createPoll(meetingId, question, labels, body.endsAt);
  return json(res, 201, { poll: { ...poll, endsAt: poll.endsAt?.getTime?.() ?? null } });
}

async function endPoll(req, res, pollId) {
  const poll = await require("../db/client").poll.findUnique({ where: { id: pollId }, include: { options: true } });
  if (!poll) return json(res, 404, { error: "Poll not found" });
  const meeting = await require("../repositories/meeting.repository").findById(poll.meetingId);
  const authErr = await _requireModerator(req, meeting);
  if (authErr === "401") return json(res, 401, { error: "Unauthorized." });
  if (authErr === "403") return json(res, 403, { error: "Forbidden." });
  const updated = await meetingSvc.endPoll(pollId);
  return json(res, 200, { poll: { ...updated, endsAt: updated.endsAt?.getTime?.() ?? null } });
}

async function votePoll(req, res, pollId) {
  const body      = await readBody(req);
  const meetingId = body.meetingId || null;
  const auth      = await _requireAuth(req);
  const voterId   = auth?.user?.id || body.guestToken || null;
  if (!voterId) return json(res, 401, { error: "A voter identity (login or guestToken) is required to vote in a poll." });
  const result = await meetingSvc.votePoll(pollId, body.optionId, voterId, meetingId);
  if (result.conflict)   return json(res, 409, { error: "You have already voted in this poll." });
  if (result.badOption)  return json(res, 400, { error: "Invalid option" });
  if (result.notFound)   return json(res, 404, { error: "Poll not found" });
  return json(res, 200, result);
}

// ── Home ──────────────────────────────────────────────────────

async function getHome(req, res) {
  const auth = await _requireAuth(req);
  if (!auth) return json(res, 401, { error: "Unauthorized." });
  const getCache = _getCache();
  const data = await meetingSvc.getHomeData(auth.user, getCache);
  return json(res, 200, data);
}

module.exports = {
  getAll, getMine, getById, getLive, getQrCode, getByCode,
  create, update, patchStatus, remove,
  startSession, endSession,
  enrollByCode, enrollById,
  getGrace, extend, reschedule,
  sendAnnouncement,
  createPoll, endPoll, votePoll,
  getHome,
};
