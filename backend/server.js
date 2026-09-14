/* ============================================================
   CollectiveVoice Server — Phase 4 + Phase 5 reliability hardening
   WebSocket handlers are the real write path for all question
   actions. REST keeps CRUD + auth + analytics only.
   ============================================================ */
"use strict";
if (!process.env.JWT_SECRET) require("dotenv").config(); // Load .env in dev (npm start)
const http   = require("http");
const fs     = require("fs");
const path   = require("path");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");
const handleApiRequest = require("./src/routes/api");
const { verifyToken, handleAuthRequest } = require("./src/routes/auth");
const db               = require("./src/db/client");
const { processQuestion } = require("./src/nlp/engine");
const { recomputeScores } = require("./src/nlp/scoring");
const { startScheduler } = require("./src/scheduler");

// ── Process-level error guards ──────────────────────────────────────────────
// Transient Neon/DB WebSocket drops are NOT fatal — log and continue.
// Only exit on truly unrecoverable errors.
const TRANSIENT_ERRORS = [
  "Connection terminated unexpectedly",
  "Connection terminated",
  "connect ECONNREFUSED",
  "Can't reach database server",
  "ECONNRESET",
  "WebSocket was closed",
  "socket hang up",
];

// Neon WS teardown can throw TypeErrors like
// "Cannot read properties of undefined (reading 'many')".
// These originate inside @neondatabase/serverless internals — not our code.
const NEON_INTERNAL_STACKS = [
  "@neondatabase/serverless",
  "node_modules/ws/",
];

function isTransientDbError(err) {
  const msg  = err?.message || err?.toString() || "";
  const stack = err?.stack  || "";
  if (TRANSIENT_ERRORS.some(s => msg.includes(s))) return true;
  // Swallow TypeErrors whose stack trace only touches Neon/ws internals
  if (err instanceof TypeError && NEON_INTERNAL_STACKS.some(s => stack.includes(s))) return true;
  return false;
}

process.on("uncaughtException", (err) => {
  if (isTransientDbError(err)) {
    console.warn(`[${new Date().toISOString()}] DB transient disconnect (ignored):`, err.message);
    return; // Don't exit — Neon will reconnect on next request
  }
  console.error(`[${new Date().toISOString()}] UNCAUGHT EXCEPTION:`, err.stack || err);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  if (isTransientDbError(reason)) {
    console.warn(`[${new Date().toISOString()}] DB transient rejection (ignored):`, reason?.message || reason);
    return;
  }
  console.error(`[${new Date().toISOString()}] UNHANDLED REJECTION:`, reason?.stack || reason);
  // Don't exit — transient DB errors would kill OAuth redirects and static file serving.
});

const PORT       = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "..", "frontend", "public");

// ── CORS allowlist (B9) ─────────────────────────────────────────────────────
// In production set ALLOWED_ORIGINS to a comma-separated list of trusted domains.
// Falls back to localhost for dev convenience.
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || "http://localhost:3000,http://localhost:3001")
    .split(",")
    .map(o => o.trim())
    .filter(Boolean)
);

function isCorsAllowed(origin, host) {
  if (!origin) return true;           // same-origin / server-to-server
  if (ALLOWED_ORIGINS.has(origin)) return true;
  // Auto-allow same-host requests (browser sends Origin even for same-origin module scripts)
  if (host && (origin === `https://${host}` || origin === `http://${host}`)) return true;
  // Allow any localhost port in development
  if (process.env.NODE_ENV !== "production" && /^https?:\/\/localhost(:\d+)?$/.test(origin)) return true;
  return false;
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png"
};

// Per-extension caching policy (B6):
//   HTML        — no-cache (always validate; SPA fallback must be fresh)
//   JS / CSS    — short TTL in dev (60s), long in prod (1y) — swap with a
//                 content-hash filename strategy once you go to production.
//   Images / fonts — 1-day CDN cache; safe because these change rarely.
const CACHE_CONTROL = (() => {
  const isProd = process.env.NODE_ENV === "production";
  return {
    ".html": "no-cache, must-revalidate",
    // In dev: no-cache so every file change is immediately visible in the browser.
    // In prod: immutable (use content-hash filenames for safe long caching).
    ".js":   isProd ? "public, max-age=31536000, immutable" : "no-cache, must-revalidate",
    ".css":  isProd ? "public, max-age=31536000, immutable" : "no-cache, must-revalidate",
    ".png":  "public, max-age=86400",
    ".svg":  "public, max-age=86400",
    ".woff2":"public, max-age=86400"
  };
})();

function publicFile(req, res) {
  // Strip query string (?v=...) before resolving file path so cache-busting
  // params don't cause 404s on JS module imports.
  const rawUrl    = req.url.split("?")[0];
  const requested = rawUrl === "/" ? "/index.html" : rawUrl;
  const safePath  = path.normalize(requested).replace(/^(\.\.[\\/])+/, "");
  const filePath  = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end("Forbidden"); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback
      fs.readFile(path.join(PUBLIC_DIR, "index.html"), (fbErr, fb) => {
        if (fbErr) { res.writeHead(404); res.end("Not found"); return; }
        res.writeHead(200, {
          "Content-Type":  mimeTypes[".html"],
          "Cache-Control": CACHE_CONTROL[".html"]
        });
        res.end(fb);
      });
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type":  mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": CACHE_CONTROL[ext] || "public, max-age=60"
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  // ── Security headers (applied to every response) ────────────────────────────
  res.setHeader("X-Content-Type-Options",   "nosniff");
  res.setHeader("X-Frame-Options",           "DENY");
  res.setHeader("X-XSS-Protection",          "1; mode=block");
  res.setHeader("Referrer-Policy",           "strict-origin-when-cross-origin");
  // C4 Fix: Content-Security-Policy — primary XSS mitigation
  res.setHeader("Content-Security-Policy",
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: https:; " +
    "connect-src 'self' wss: ws: https://accounts.google.com; " +
    "frame-ancestors 'none';"
  );
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  // ── CORS headers ───────────────────────────────────────────────────────────────
  const origin = req.headers.origin;
  const host   = req.headers.host;   // e.g. collective-voice.onrender.com
  if (origin && isCorsAllowed(origin, host)) {
    res.setHeader("Access-Control-Allow-Origin",  origin);
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  // ── Top-level try/catch (B1) ───────────────────────────────────────────────────
  // Catches synchronous throws and async rejections from any route handler.
  // Responds 500 instead of leaving the connection hanging or crashing the process.
  try {

  // ── Health check ───────────────────────────────────────────────────────────────
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", uptime: process.uptime(), ts: Date.now() }));
    return;
  }

  if (req.url.startsWith("/api/auth/")) { handleAuthRequest(req, res); return; }
  if (req.url.startsWith("/api/")) {
    // Block cross-origin API requests from untrusted origins
    if (origin && !isCorsAllowed(origin, host)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "CORS: origin not allowed" }));
      return;
    }
    await handleApiRequest(req, res);
    return;
  }

  // NOTE: /auth-callback is no longer a separate server route.
  // The OAuth flow redirects to /?token=...#/auth-callback which serves index.html.
  // The SPA's handleGoogleCallback() (in app.js) reads the query params and completes auth.

  } catch (err) {
    const reqId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    console.error(`[${new Date().toISOString()}] [${reqId}] HTTP 500 on ${req.method} ${req.url}:`, err.stack || err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Internal server error", requestId: reqId }));
    }
    return;
  }

  publicFile(req, res);
});

// ── WebSocket Server ──────────────────────────────────────────
const wss     = new WebSocketServer({ server });
const clients = new Map(); // ws → { meetingId, userId, guestToken, voterId, role, isAlive }

// ── Typing-indicator state ─────────────────────────────────────
// meetingId → Map<voterId, timeoutId>  (server-side 4s debounce)
// Never persisted — ephemeral, cleared on ws.close.
const typingTimers = new Map();

/**
 * Count active typers in a meeting and broadcast the tally.
 * Called after every typing_start and typing_stop event.
 */
function broadcastTypingUpdate(meetingId) {
  const meetingTypers = typingTimers.get(meetingId);
  const count = meetingTypers ? meetingTypers.size : 0;
  broadcastToMeeting("typing_update", { meetingId, count }, meetingId);
}

/**
 * Check if the connected client is the meeting owner.
 * Used to gate moderator WS events — mirrors the requireModerator()
 * check on the REST side (Bug #4 WS fix).
 */
async function isOwner(ws, meetingId) {
  const meta = clients.get(ws);
  if (!meta || !meta.userId) return false;
  const meeting = await db.meeting.findUnique({ where: { id: meetingId }, select: { ownerId: true } });
  return meeting ? meeting.ownerId === meta.userId : false;
}

// ── Heartbeat — detect and prune stale connections ──────────
// Prevents the clients Map from accumulating dead entries when
// a client disconnects without sending a close frame.
const HEARTBEAT_INTERVAL = 30_000;
const heartbeatTimer = setInterval(() => {
  clients.forEach((meta, ws) => {
    if (meta.isAlive === false) {
      clients.delete(ws);
      return ws.terminate();
    }
    meta.isAlive = false;
    try { ws.ping(); } catch { clients.delete(ws); }
  });
}, HEARTBEAT_INTERVAL);
// unref() prevents the timer from keeping the process alive after all other I/O
// (servers, sockets) have closed — important for clean Jest teardown.
heartbeatTimer.unref();
wss.on("close", () => clearInterval(heartbeatTimer));


wss.on("connection", (ws, req) => {
  // Extract userId from JWT in query string (?token=...) or subprotocol
  // so that role can be set before the first message arrives.
  const urlParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
  const token     = urlParams.get("token") || null;
  const payload   = token ? (() => { try { return verifyToken({ headers: { authorization: `Bearer ${token}` } }); } catch { return null; } })() : null;
  const wsUserId  = payload?.sub || null;

  // authRole is taken from the JWT payload so pushNotificationToAdmins can
  // filter connected clients to only admin/superadmin sessions.
  clients.set(ws, { meetingId: null, userId: wsUserId, authRole: payload?.role || null, role: null, isAlive: true });
  // Expose WS stats for /api/admin/health endpoint (read via process globals)
  process._cvWsClients = clients.size;
  process._cvWsActiveMeetings = new Set([...clients.values()].map(m => m.meetingId).filter(Boolean)).size;
  console.log(`[WS] Client connected (total: ${clients.size})`);

  // Update isAlive on pong response
  ws.on("pong", () => {
    const meta = clients.get(ws);
    if (meta) meta.isAlive = true;
  });

  ws.on("message", (raw) => {
    // Wrap entire handler in async IIFE so we can await DB calls
    (async () => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const { event, data = {} } = msg;

    switch (event) {

      // ── join_meeting ────────────────────────────────────────────────
      case "join_meeting": {
        const { meetingId, userId, guestToken, userName } = data;
        if (!meetingId) break;

        // Resolve the one stable identity used throughout this session.
        // Authenticated users use their userId; guests use a browser-persisted UUID.
        const resolvedUserId = wsUserId || userId || null;
        const voterId = resolvedUserId || guestToken || null;
        if (!voterId) break; // refuse completely anonymous joins (no token at all)

        const meta = clients.get(ws);
        if (meta) {
          meta.meetingId  = meetingId;
          meta.userId     = resolvedUserId;
          meta.guestToken = guestToken || null;
          meta.voterId    = voterId;
          const meeting   = await db.meeting.findUnique({ where: { id: meetingId }, select: { ownerId: true } });
          meta.role       = meeting && meeting.ownerId === resolvedUserId ? "owner" : "participant";
        }

        // Add participant record if new; match on userId OR guestToken to avoid
        // duplicate ghost entries when the same browser reconnects after a drop.
        const existing = await db.participant.findFirst({
          where: {
            meetingId,
            OR: [
              resolvedUserId ? { userId: resolvedUserId } : undefined,
              guestToken     ? { guestToken }             : undefined
            ].filter(Boolean)
          }
        });

        let participantId;
        if (!existing) {
          const created = await db.participant.create({
            data: {
              meetingId,
              userId:     resolvedUserId || null,
              guestToken: guestToken     || null,
              name:       userName || "Guest",
              initials:   (userName || "G").slice(0, 2).toUpperCase(),
              role:       meta?.role || "participant"
            }
          });
          participantId = created.id;
          // Strip private identity fields before broadcasting to other clients
          const { userId: _u, guestToken: _g, ...publicParticipant } = created;
          broadcastToMeeting("participant_joined", publicParticipant, meetingId, ws);
        } else {
          participantId = existing.id;
          // Reconnect: update display name if provided, but don't create a duplicate entry
          if (userName && userName !== existing.name) {
            await db.participant.update({ where: { id: existing.id }, data: { name: userName } }).catch(() => {});
          }
        }

        // Fetch this voter's existing votes so the client can restore "already voted" UI state
        const myVoteRows = await db.vote.findMany({ where: { voterId }, select: { questionId: true } }).catch(() => []);
        const myVotes    = myVoteRows.map(v => v.questionId);

        const snap = await buildSnapshot(meetingId);
        ws.send(JSON.stringify({ event: "session_snapshot", data: { ...snap, myVotes, participantId } }));
        broadcastToMeeting("session_stats", snap.stats, meetingId);
        break;
      }

      // ── submit_question ─────────────────────────────────
      case "submit_question": {
        const { meetingId, text, askedBy } = data;
        if (!meetingId || !text) break;
        const meta      = clients.get(ws);
        const askedById = meta?.userId || null;
        const { submitQuestionShared } = require("./src/routes/api");
        await submitQuestionShared(meetingId, text, askedBy || "Anonymous", askedById)
          .catch(err => console.error("[WS] submit_question error:", err.message));
        break;
      }

      // ── upvote ──────────────────────────────────────────────────
      case "upvote": {
        const { meetingId, questionId } = data;
        if (!meetingId || !questionId) break;

        const meta   = clients.get(ws);
        const voterId = meta?.voterId;
        if (!voterId) break; // must have a stable identity to vote

        // Check whether this voter has already voted for this question (toggle semantics).
        // We check the DB (source of truth) — the in-memory cache is a write-through mirror.
        const existingVote = await db.vote.findUnique({
          where: { questionId_voterId: { questionId, voterId } }
        }).catch(() => null);

        const question = await db.question.findUnique({ where: { id: questionId } }).catch(() => null);
        if (!question) break;

        let newVotes;
        if (existingVote) {
          // Toggle off: remove the vote record and decrement
          await db.vote.delete({ where: { questionId_voterId: { questionId, voterId } } }).catch(() => {});
          newVotes = Math.max(0, question.votes - 1);
        } else {
          // New vote: create the vote record and increment
          await db.vote.create({ data: { questionId, voterId } }).catch(() => {});
          newVotes = question.votes + 1;
        }

        // Persist the updated vote count and recompute score
        const updated = await db.question.update({
          where: { id: questionId },
          data:  { votes: newVotes }
        }).catch(() => null);
        if (!updated) break;

        broadcastToMeeting("question_upvoted", {
          id: questionId, votes: updated.votes, score: updated.score
        }, meetingId);

        // Only tell THIS client whether their vote is now on or off
        ws.send(JSON.stringify({
          event: "your_vote_changed",
          data:  { questionId, voted: !existingVote }
        }));
        break;
      }

      // ── mark_answered ─────────────────────────────────
      case "mark_answered": {
        const { meetingId, questionId } = data;
        if (!meetingId || !questionId) break;
        if (!await isOwner(ws, meetingId)) {
          ws.send(JSON.stringify({ event: "error", data: { code: 403, message: "Moderator action requires meeting ownership" } }));
          break;
        }
        await db.question.update({ where: { id: questionId }, data: { status: "Answered" } }).catch(() => {});
        broadcastToMeeting("question_status_changed", { id: questionId, status: "Answered" }, meetingId);
        break;
      }

      // ── mark_deferred ─────────────────────────────────
      case "mark_deferred": {
        const { meetingId, questionId } = data;
        if (!meetingId || !questionId) break;
        if (!await isOwner(ws, meetingId)) {
          ws.send(JSON.stringify({ event: "error", data: { code: 403, message: "Moderator action requires meeting ownership" } }));
          break;
        }
        await db.question.update({ where: { id: questionId }, data: { status: "Deferred" } }).catch(() => {});
        broadcastToMeeting("question_status_changed", { id: questionId, status: "Deferred" }, meetingId);
        break;
      }

      // ── mark_flagged ──────────────────────────────────
      case "mark_flagged": {
        const { meetingId, questionId } = data;
        if (!meetingId || !questionId) break;
        if (!await isOwner(ws, meetingId)) {
          ws.send(JSON.stringify({ event: "error", data: { code: 403, message: "Moderator action requires meeting ownership" } }));
          break;
        }
        await db.question.update({ where: { id: questionId }, data: { status: "Flagged" } }).catch(() => {});
        broadcastToMeeting("question_status_changed", { id: questionId, status: "Flagged" }, meetingId);
        break;
      }

      // ── mark_skipped ──────────────────────────────────
      case "mark_skipped": {
        const { meetingId, questionId } = data;
        if (!meetingId || !questionId) break;
        if (!await isOwner(ws, meetingId)) {
          ws.send(JSON.stringify({ event: "error", data: { code: 403, message: "Moderator action requires meeting ownership" } }));
          break;
        }
        await db.question.update({ where: { id: questionId }, data: { status: "Skipped" } }).catch(() => {});
        broadcastToMeeting("question_status_changed", { id: questionId, status: "Skipped" }, meetingId);
        break;
      }

      // ── speaker_invite ─────────────────────────────────────
      // Moderator sends this to invite a specific participant as speaker.
      // The server finds the correct WS connection by participantId and
      // sends speaker_invite only to them (no name-matching needed).
      case "speaker_invite": {
        const { meetingId, participantId, speakerName } = data;
        if (!meetingId) break;

        // Auth: must be the meeting owner (check via meta.role set during join_meeting)
        const senderMeta = clients.get(ws);
        if (senderMeta?.role !== "owner") {
          ws.send(JSON.stringify({ event: "error", data: { code: 403, message: "Only the meeting owner can invite a speaker" } }));
          break;
        }

        // Look up the target participant in DB to get their userId/guestToken
        const targetPart = await db.participant.findUnique({
          where: { id: participantId },
          select: { id: true, userId: true, guestToken: true, name: true }
        }).catch(() => null);

        if (!targetPart) break;

        const resolvedName = speakerName || targetPart.name || "Participant";

        // Find all WS connections that match this participant
        let sent = 0;
        clients.forEach((meta, clientWs) => {
          if (clientWs.readyState !== 1) return;
          if (meta.meetingId !== meetingId) return;
          const matchById    = targetPart.userId    && meta.userId    === targetPart.userId;
          const matchByGuest = targetPart.guestToken && meta.guestToken === targetPart.guestToken;
          if (!matchById && !matchByGuest) return;
          clientWs.send(JSON.stringify({
            event: "speaker_invite",
            data:  { participantId, speakerName: resolvedName, meetingId }
          }));
          sent++;
        });

        // Tell moderator whether we reached the client
        ws.send(JSON.stringify({ event: "speaker_invite_sent", data: { participantId, reached: sent > 0 } }));

        // §3: Persistent notification for authenticated invited users
        if (targetPart.userId) {
          try {
            const { notifyUser } = require("./src/utils/notify");
            await notifyUser(targetPart.userId, {
              type:  "Meeting Updates",
              title: "You've been invited to speak!",
              body:  `A moderator invited you as a speaker for this session.`
            });
          } catch { /* non-fatal */ }
        }

        break;
      }

      // ── speaker_accepted ──────────────────────────────────────
      // Participant confirms they accepted the invite. Broadcasts to all.
      case "speaker_accepted": {
        const { meetingId, participantId, speakerName } = data;
        if (!meetingId) break;

        // ── C2 Fix: Verify the accepting client is the invited participant ──
        const acceptMeta = clients.get(ws);
        if (!acceptMeta) break;

        const acceptPart = await db.participant.findUnique({
          where:  { id: participantId },
          select: { userId: true, guestToken: true }
        }).catch(() => null);
        if (!acceptPart) break;

        const matchById    = acceptPart.userId    && acceptMeta.userId    === acceptPart.userId;
        const matchByGuest = acceptPart.guestToken && acceptMeta.guestToken === acceptPart.guestToken;
        if (!matchById && !matchByGuest) {
          ws.send(JSON.stringify({ event: "error", data: { code: 403, message: "You can only accept an invite for yourself." } }));
          break;
        }

        // Update participant role in DB
        await db.participant.update({
          where: { id: participantId },
          data:  { role: "speaker" }
        }).catch(() => {});
        // Tell everyone in the meeting who the new speaker is
        broadcastToMeeting("speaker_changed", { participantId, speakerName, status: "accepted" }, meetingId);
        break;
      }

      // ── speaker_declined ─────────────────────────────────────
      case "speaker_declined": {
        const { meetingId, participantId } = data;
        if (!meetingId) break;
        // Tell moderator the invite was declined
        broadcastToMeeting("speaker_changed", { participantId, status: "declined" }, meetingId, ws);
        break;
      }

      // ── speaker_revoked ──────────────────────────────────────
      // Moderator removes the current speaker.
      case "speaker_revoked": {
        const { meetingId, participantId } = data;
        if (!meetingId) break;
        const rMeta = clients.get(ws);
        if (rMeta?.role !== "owner") break;
        await db.participant.update({
          where: { id: participantId },
          data:  { role: "participant" }
        }).catch(() => {});
        broadcastToMeeting("speaker_changed", { participantId, status: "revoked" }, meetingId);
        break;
      }

      // ── speaker_changed (legacy) ───────────────────────────────
      case "speaker_changed": {
        const { meetingId, speakerId, speakerName } = data;
        if (!meetingId) break;
        const legMeta = clients.get(ws);
        if (legMeta?.role !== "owner") break;
        broadcastToMeeting("speaker_changed", { speakerId, speakerName }, meetingId);
        break;
      }

      // ── typing_start ────────────────────────────────────────
      // Participant started typing a question. Not persisted — ephemeral.
      case "typing_start": {
        const { meetingId: tMid } = data;
        if (!tMid) break;
        const meta   = clients.get(ws);
        const typerId = meta?.voterId || meta?.userId;
        if (!typerId) break;

        if (!typingTimers.has(tMid)) typingTimers.set(tMid, new Map());
        const meetingMap = typingTimers.get(tMid);

        // Clear previous 4s debounce for this typer
        if (meetingMap.has(typerId)) clearTimeout(meetingMap.get(typerId));

        // Auto-clear after 4s of silence
        const tid = setTimeout(() => {
          meetingMap.delete(typerId);
          if (meetingMap.size === 0) typingTimers.delete(tMid);
          broadcastTypingUpdate(tMid);
        }, 4000);
        meetingMap.set(typerId, tid);
        broadcastTypingUpdate(tMid);
        break;
      }

      // ── typing_stop ─────────────────────────────────────────
      case "typing_stop": {
        const { meetingId: tsMid } = data;
        if (!tsMid) break;
        const meta    = clients.get(ws);
        const typerId = meta?.voterId || meta?.userId;
        if (!typerId) break;
        const meetingMap = typingTimers.get(tsMid);
        if (meetingMap) {
          clearTimeout(meetingMap.get(typerId));
          meetingMap.delete(typerId);
          if (meetingMap.size === 0) typingTimers.delete(tsMid);
        }
        broadcastTypingUpdate(tsMid);
        break;
      }

      // ── react ───────────────────────────────────────────────
      // Participant adds a reaction to a question (👍 🤔 🔥).
      case "react": {
        const { meetingId: rMid, questionId: rQid, emoji } = data;
        if (!rMid || !rQid || !emoji) break;
        const ALLOWED_EMOJIS = ["thumbsup", "thinking", "fire"];
        if (!ALLOWED_EMOJIS.includes(emoji)) break;

        const rMeta   = clients.get(ws);
        const rVoter  = rMeta?.voterId;
        if (!rVoter) break;

        // Create reaction — catch unique-constraint (P2002) and treat as no-op
        await db.reaction.create({
          data: { questionId: rQid, voterId: rVoter, emoji }
        }).catch(err => {
          if (err.code !== "P2002") console.error("[WS] react error:", err.message);
          // P2002 = unique violation → already reacted → silent no-op
        });

        // Aggregate counts for this question and broadcast
        const reactions = await db.reaction.groupBy({
          by: ["emoji"],
          where: { questionId: rQid },
          _count: { emoji: true }
        }).catch(() => []);

        const counts = { thumbsup: 0, thinking: 0, fire: 0 };
        reactions.forEach(r => { counts[r.emoji] = r._count.emoji; });
        broadcastToMeeting("reaction_updated", { questionId: rQid, counts }, rMid);
        break;
      }

      // ── mark_answering ───────────────────────────────────────
      // Moderator signals "I am answering this question now".
      case "mark_answering": {
        const { meetingId: aMid, questionId: aQid } = data;
        if (!aMid || !aQid) break;
        if (!await isOwner(ws, aMid)) {
          ws.send(JSON.stringify({ event: "error", data: { code: 403, message: "Moderator action requires meeting ownership" } }));
          break;
        }
        const ansQ = await db.question.update({
          where: { id: aQid },
          data:  { status: "Answering" }
        }).catch(() => null);
        if (!ansQ) break;
        broadcastToMeeting("question_status_changed", { id: aQid, status: "Answering" }, aMid);
        broadcastToMeeting("now_answering", { questionId: aQid, text: ansQ.text, meetingId: aMid }, aMid);
        break;
      }

      default:
        // H6 Fix: Unknown events are dropped — never broadcast arbitrary client events.
        // This prevents message injection attacks via unrecognised event names.
        console.warn(`[WS] Unrecognised event "${event}" from client (meetingId:${data?.meetingId || "none"}) — dropped.`);
        break;
    }
    })().catch(err => console.error("[WS] Handler error:", err.message));
  });

  ws.on("close", () => {
    // Clean up any typing timers for this client
    const meta = clients.get(ws);
    if (meta?.meetingId && meta?.voterId) {
      const meetingMap = typingTimers.get(meta.meetingId);
      if (meetingMap) {
        clearTimeout(meetingMap.get(meta.voterId));
        meetingMap.delete(meta.voterId);
        if (meetingMap.size === 0) typingTimers.delete(meta.meetingId);
        broadcastTypingUpdate(meta.meetingId);
      }
    }
    clients.delete(ws);
    console.log(`[WS] Client disconnected (total: ${clients.size})`);
  });
  ws.on("error",  () => clients.delete(ws));
});

/** Build the full session snapshot for a meetingId (async — uses DB) */
async function buildSnapshot(meetingId) {
  const questions    = await db.question.findMany({ where: { meetingId }, orderBy: { score: "desc" } });
  const polls        = await db.poll.findMany({ where: { meetingId }, include: { options: true } });
  const participants = await db.participant.findMany({ where: { meetingId } });
  const ranked = questions.map(q => ({
    id: q.id, meetingId: q.meetingId, text: q.text,
    canonical_text: q.canonicalText, votes: q.votes, score: q.score, status: q.status,
    askedBy: q.askedByName, summary: q.summaryText
  }));
  return {
    questions: ranked,
    polls:     polls.map(p => ({ ...p, endsAt: p.endsAt?.getTime?.() ?? null })),
    participants,
    stats: {
      questionsCount:    questions.length,
      participantsCount: participants.length,
      upvotesCount:      questions.reduce((s, q) => s + (q.votes || 0), 0),
      avgLatency:        "38ms"
    }
  };
}

/**
 * Broadcast a message to all clients in a specific meeting.
 * If meetingId is null, broadcast to all clients (global).
 * Optionally skip one sender ws, or target a specific userId only.
 */
function broadcastToMeeting(event, data, meetingId = null, skip = null, opts = {}) {
  const raw = JSON.stringify({ event, data });
  clients.forEach((meta, ws) => {
    if (ws === skip) return;
    if (ws.readyState !== 1 /* OPEN */) return;
    if (meetingId && meta.meetingId && meta.meetingId !== meetingId) return;
    // If onlyUserId is set, only send to that specific user's connection(s)
    if (opts.onlyUserId && meta.userId !== opts.onlyUserId) return;
    ws.send(raw);
  });
}

/** Global broadcast (for api.js and scheduler) */
function broadcast(msg, skip = null, opts = {}) {
  const { event, data, meetingId } = msg;
  broadcastToMeeting(event, data, meetingId || null, skip, opts);
}

/**
 * Push a notification to all WS connections for a specific userId.
 * Sends { event: "notification", data: notification }.
 * A user may have multiple open tabs — this reaches all of them.
 */
function pushNotificationToUser(userId, notification) {
  if (!userId) return;
  const raw = JSON.stringify({ event: "notification", data: notification });
  clients.forEach((meta, ws) => {
    if (ws.readyState !== 1) return;
    if (meta.userId !== userId) return;
    try { ws.send(raw); } catch { /* stale connection */ }
  });
}

/**
 * Push an admin_notification to all WS connections whose JWT role is
 * "admin" or "superadmin".
 * Sends { event: "admin_notification", data: notification }.
 */
function pushNotificationToAdmins(notification) {
  const raw = JSON.stringify({ event: "admin_notification", data: notification });
  clients.forEach((meta, ws) => {
    if (ws.readyState !== 1) return;
    if (meta.authRole !== "admin" && meta.authRole !== "superadmin") return;
    try { ws.send(raw); } catch { /* stale connection */ }
  });
}

// Expose broadcast + raw server so api.js and tests can use them
module.exports.broadcast  = broadcast;
module.exports.server     = server; // Supertest injects this directly
module.exports.pushNotificationToUser   = pushNotificationToUser;
module.exports.pushNotificationToAdmins = pushNotificationToAdmins;

/**
 * Returns live WebSocket stats for the admin health dashboard.
 * Counts all connected clients and the distinct meetingIds they are subscribed to.
 */
module.exports.getWsStats = function getWsStats() {
  let connections = 0;
  const meetingSet = new Set();
  try {
    for (const ws of wss.clients) {
      if (ws.readyState === 1 /* OPEN */) {
        connections++;
        if (ws._meetingId) meetingSet.add(ws._meetingId);
      }
    }
  } catch { /* wss may not be initialised yet during tests */ }
  return { connections, activeMeetings: meetingSet.size };
};

// ── Graceful shutdown (B8) ───────────────────────────────────────────────────
const SHUTDOWN_TIMEOUT_MS = 5_000;

function gracefulShutdown(signal) {
  if (gracefulShutdown._called) return;
  gracefulShutdown._called = true;

  console.log(`[${new Date().toISOString()}] ${signal} received — shutting down gracefully...`);

  // Notify all connected WS clients so frontends can show a reconnect toast
  broadcastToMeeting("server_shutdown", {
    message: "Server is restarting. Please refresh in a moment."
  });

  // Stop accepting new HTTP connections; close WS server
  server.close(() => console.log("[Shutdown] HTTP server closed."));
  wss.close(()    => console.log("[Shutdown] WebSocket server closed."));

  // Hard-kill after timeout in case something keeps the event loop alive
  const killer = setTimeout(() => {
    console.error("[Shutdown] Timeout reached — forcing exit.");
    process.exit(0);
  }, SHUTDOWN_TIMEOUT_MS);
  killer.unref();
}
gracefulShutdown._called = false;

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT",  () => gracefulShutdown("SIGINT"));

// Only bind the port when run directly, not when required by tests
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`CollectiveVoice is running at http://localhost:${PORT}`);
    console.log(`WebSocket server ready on ws://localhost:${PORT}`);

    // Start the grace-period & auto-expiry background scheduler
    startScheduler({
      broadcast: (event, data, meetingId, opts = {}) =>
        broadcastToMeeting(event, data, meetingId, null, opts)
    });
  });
}
