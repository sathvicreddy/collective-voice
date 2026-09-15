/* ============================================================
   src/routes/meetings.routes.js
   Thin routing layer — HTTP method + path → controller.

   Pattern mirrors the original api.js url-string matching
   so it can be dropped into the existing handleApiRequest
   dispatcher without changing the URL surface.
   ============================================================ */
"use strict";

const ctrl = require("../controllers/meetings.controller");

// Regexes for path segments
const R_ID        = /^\/api\/meetings\/([^/]+)$/;
const R_CODE      = /^\/api\/meetings\/code\/([^/]+)$/;
const R_QR        = /^\/api\/meetings\/([^/]+)\/qr$/;
const R_STATUS    = /^\/api\/meetings\/([^/]+)\/status$/;
const R_START     = /^\/api\/meetings\/([^/]+)\/start$/;
const R_END       = /^\/api\/meetings\/([^/]+)\/end$/;
const R_ENROLL_C  = /^\/api\/meetings\/join\/([^/]+)$/;
const R_ENROLL_ID = /^\/api\/meetings\/([^/]+)\/enroll$/;
const R_GRACE     = /^\/api\/meetings\/([^/]+)\/grace$/;
const R_EXTEND    = /^\/api\/meetings\/([^/]+)\/extend$/;
const R_RESCHEDULE = /^\/api\/meetings\/([^/]+)\/reschedule$/;
const R_POLL_VOTE = /^\/api\/polls\/([^/]+)\/vote$/;
const R_POLL_END  = /^\/api\/polls\/([^/]+)\/end$/;

/**
 * Try to handle the request. Returns null if this router doesn't own the path.
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse}  res
 * @param {URL}                            url
 * @param {string}                         method
 * @returns {Promise<boolean>}  true if handled, false otherwise
 */
async function handleMeetingRequest(req, res, url, method) {
  const pathname = url.pathname;

  // GET /api/home
  if (method === "GET" && pathname === "/api/home") {
    await ctrl.getHome(req, res); return true;
  }

  // GET /api/meetings
  if (method === "GET" && pathname === "/api/meetings") {
    await ctrl.getAll(req, res); return true;
  }

  // GET /api/meetings/mine
  if (method === "GET" && pathname === "/api/meetings/mine") {
    await ctrl.getMine(req, res); return true;
  }

  // GET /api/meetings/live
  if (method === "GET" && pathname === "/api/meetings/live") {
    await ctrl.getLive(req, res, url); return true;
  }

  // POST /api/meetings
  if (method === "POST" && pathname === "/api/meetings") {
    await ctrl.create(req, res); return true;
  }

  // POST /api/announce
  if (method === "POST" && pathname === "/api/announce") {
    await ctrl.sendAnnouncement(req, res); return true;
  }

  // POST /api/polls   — create a poll
  if (method === "POST" && pathname === "/api/polls") {
    await ctrl.createPoll(req, res); return true;
  }

  // POST /api/polls/:id/vote
  let m;
  if (method === "POST" && (m = pathname.match(R_POLL_VOTE))) {
    await ctrl.votePoll(req, res, m[1]); return true;
  }

  // POST /api/polls/:id/end
  if (method === "POST" && (m = pathname.match(R_POLL_END))) {
    await ctrl.endPoll(req, res, m[1]); return true;
  }

  // GET /api/meetings/code/:code
  if (method === "GET" && (m = pathname.match(R_CODE))) {
    await ctrl.getByCode(req, res, m[1]); return true;
  }

  // POST /api/meetings/join/:code
  if (method === "POST" && (m = pathname.match(R_ENROLL_C))) {
    await ctrl.enrollByCode(req, res, m[1]); return true;
  }

  // GET /api/meetings/:id/qr
  if (method === "GET" && (m = pathname.match(R_QR))) {
    await ctrl.getQrCode(req, res, m[1]); return true;
  }

  // PATCH /api/meetings/:id/status
  if (method === "PATCH" && (m = pathname.match(R_STATUS))) {
    await ctrl.patchStatus(req, res, m[1]); return true;
  }

  // POST /api/meetings/:id/start
  if (method === "POST" && (m = pathname.match(R_START))) {
    await ctrl.startSession(req, res, m[1]); return true;
  }

  // POST /api/meetings/:id/end
  if (method === "POST" && (m = pathname.match(R_END))) {
    await ctrl.endSession(req, res, m[1]); return true;
  }

  // POST /api/meetings/:id/enroll
  if (method === "POST" && (m = pathname.match(R_ENROLL_ID))) {
    await ctrl.enrollById(req, res, m[1]); return true;
  }

  // GET /api/meetings/:id/grace
  if (method === "GET" && (m = pathname.match(R_GRACE))) {
    await ctrl.getGrace(req, res, m[1]); return true;
  }

  // POST /api/meetings/:id/extend
  if (method === "POST" && (m = pathname.match(R_EXTEND))) {
    await ctrl.extend(req, res, m[1]); return true;
  }

  // POST /api/meetings/:id/reschedule
  if (method === "POST" && (m = pathname.match(R_RESCHEDULE))) {
    await ctrl.reschedule(req, res, m[1]); return true;
  }

  // GET /api/meetings/:id
  if (method === "GET" && (m = pathname.match(R_ID))) {
    await ctrl.getById(req, res, m[1]); return true;
  }

  // PATCH /api/meetings/:id
  if (method === "PATCH" && (m = pathname.match(R_ID))) {
    await ctrl.update(req, res, m[1]); return true;
  }

  // DELETE /api/meetings/:id
  if (method === "DELETE" && (m = pathname.match(R_ID))) {
    await ctrl.remove(req, res, m[1]); return true;
  }

  return false; // not handled by this router
}

module.exports = { handleMeetingRequest };
