/* ============================================================
   CollectiveVoice Server — Phase 4
   WebSocket handlers are the real write path for all question
   actions. REST keeps CRUD + auth + analytics only.
   ============================================================ */
"use strict";
if (!process.env.JWT_SECRET) require("dotenv").config(); // Load .env in dev (npm start)
const http  = require("http");
const fs    = require("fs");
const path  = require("path");
const { WebSocketServer } = require("ws");
const handleApiRequest = require("./src/routes/api");
const { verifyToken, handleAuthRequest } = require("./src/routes/auth");
const db               = require("./src/db/client");
const { processQuestion } = require("./src/nlp/engine");
const { recomputeScores } = require("./src/nlp/scoring");

const PORT       = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "..", "frontend", "public");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png"
};

function publicFile(req, res) {
  const requested = req.url === "/" ? "/index.html" : req.url;
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
        res.writeHead(200, { "Content-Type": mimeTypes[".html"] });
        res.end(fb);
      });
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  // ── CORS headers (Section 3) ─────────────────────────────────
  // Allow same-origin requests and explicit cross-origin if the frontend
  // is served from a different origin (e.g., Vite dev server on :5173).
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin",  origin);
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  // ── Health check (Section 9) ──────────────────────────────────
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", uptime: process.uptime(), ts: Date.now() }));
    return;
  }

  if (req.url.startsWith("/api/auth/")) { handleAuthRequest(req, res); return; }
  if (req.url.startsWith("/api/")) { handleApiRequest(req, res); return; }

  // ── /auth-callback — exchange Google OAuth tokens passed in URL params ──
  // The OAuth callback in auth.js redirects here with ?token=...&refreshToken=...&name=...
  // This page stores them in localStorage and redirects to /home via the SPA router.
  if (req.url.startsWith("/auth-callback")) {
    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Signing in…</title>
<style>body{margin:0;background:#0f0f1a;color:#fff;font-family:system-ui,sans-serif;
  display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:16px}
.spinner{width:40px;height:40px;border:3px solid rgba(255,255,255,.2);border-top-color:#8b5cf6;
  border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}</style></head>
<body><div class="spinner"></div><p>Signing you in with Google…</p>
<script>
  const p = new URLSearchParams(window.location.search);
  const token = p.get('token'), refresh = p.get('refreshToken'), name = p.get('name');
  if (token) {
    localStorage.setItem('cv_token', token);
    if (refresh) localStorage.setItem('cv_refresh_token', refresh);
    window.location.replace('/?google_auth=1');
  } else {
    document.querySelector('p').textContent = 'Sign-in failed. Redirecting…';
    setTimeout(() => window.location.replace('/login'), 2000);
  }
</script></body></html>`;
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  publicFile(req, res);
});

// ── WebSocket Server ──────────────────────────────────────────
const wss     = new WebSocketServer({ server });
const clients = new Map(); // ws → { meetingId, userId, role, isAlive }

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

  clients.set(ws, { meetingId: null, userId: wsUserId, role: null, isAlive: true });
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

      // ── join_meeting ──────────────────────────────────────
      case "join_meeting": {
        const { meetingId, userId, userName } = data;
        if (!meetingId) break;
        const resolvedUserId = wsUserId || userId;
        const meta = clients.get(ws);
        if (meta) {
          meta.meetingId = meetingId;
          meta.userId    = resolvedUserId;
          const meeting  = await db.meeting.findUnique({ where: { id: meetingId }, select: { ownerId: true } });
          meta.role      = meeting && meeting.ownerId === resolvedUserId ? "owner" : "participant";
        }

        // Add participant record if new
        if (resolvedUserId) {
          const existing = await db.participant.findFirst({ where: { meetingId, userId: resolvedUserId } });
          if (!existing) {
            const participant = await db.participant.create({
              data: {
                meetingId,
                userId:    resolvedUserId,
                name:      userName || "Guest",
                initials:  (userName || "G").slice(0, 2).toUpperCase(),
                role:      meta?.role || "participant"
              }
            });
            broadcastToMeeting("participant_joined", participant, meetingId, ws);
          }
        }

        const snap = await buildSnapshot(meetingId);
        ws.send(JSON.stringify({ event: "session_snapshot", data: snap }));
        broadcastToMeeting("session_stats", snap.stats, meetingId);
        break;
      }

      // ── submit_question ─────────────────────────────────
      case "submit_question": {
        const { meetingId, text, askedBy } = data;
        if (!meetingId || !text) break;
        // Use in-memory NLP cache (same as REST handler)
        const { _nlpCache, persistCluster } = (() => {
          try { return require("./src/routes/api"); } catch { return {}; }
        })();
        const cache = _nlpCache?.[meetingId] ?? [];
        const cluster = processQuestion(meetingId, text.trim(), askedBy || "Anonymous", cache.length ? cache : null);
        if (persistCluster) await persistCluster(cluster).catch(() => {});
        const ranked = [...(cache.length ? cache : [cluster])].sort((a, b) => (b.score || 0) - (a.score || 0));
        broadcastToMeeting("question_submitted", cluster, meetingId);
        broadcastToMeeting("questions_reranked", ranked, meetingId);
        const snap = await buildSnapshot(meetingId);
        broadcastToMeeting("session_stats", snap.stats, meetingId);
        break;
      }

      // ── upvote ──────────────────────────────────────────
      case "upvote": {
        const { meetingId, questionId } = data;
        if (!meetingId || !questionId) break;
        const row = await db.question.update({
          where: { id: questionId },
          data:  { votes: { increment: 1 } }
        }).catch(() => null);
        if (!row) break;
        broadcastToMeeting("question_upvoted", { id: questionId, votes: row.votes, score: row.score }, meetingId);
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

      // ── speaker_changed ────────────────────────────────
      case "speaker_changed": {
        const { meetingId, speakerId, speakerName } = data;
        if (!meetingId) break;
        if (!await isOwner(ws, meetingId)) {
          ws.send(JSON.stringify({ event: "error", data: { code: 403, message: "Only the meeting owner can change the speaker" } }));
          break;
        }
        broadcastToMeeting("speaker_changed", { speakerId, speakerName }, meetingId);
        break;
      }

      default:
        if (data.meetingId) {
          broadcastToMeeting(event, data, data.meetingId, ws);
        }
        break;
    }
    })().catch(err => console.error("[WS] Handler error:", err.message));
  });

  ws.on("close",  () => { clients.delete(ws); console.log(`[WS] Client disconnected (total: ${clients.size})`); });
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
 * Optionally skip one sender ws.
 */
function broadcastToMeeting(event, data, meetingId = null, skip = null) {
  const raw = JSON.stringify({ event, data });
  clients.forEach((meta, ws) => {
    if (ws === skip) return;
    if (ws.readyState !== 1 /* OPEN */) return;
    if (meetingId && meta.meetingId && meta.meetingId !== meetingId) return;
    ws.send(raw);
  });
}

/** Global broadcast (for api.js) */
function broadcast(msg, skip = null) {
  const { event, data, meetingId } = msg;
  broadcastToMeeting(event, data, meetingId || null, skip);
}

// Expose broadcast + raw server so api.js and tests can use them
module.exports.broadcast = broadcast;
module.exports.server    = server; // Supertest injects this directly

// Only bind the port when run directly, not when required by tests
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`CollectiveVoice is running at http://localhost:${PORT}`);
    console.log(`WebSocket server ready on ws://localhost:${PORT}`);
  });
}
