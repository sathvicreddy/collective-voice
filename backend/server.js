const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");
const handleApiRequest = require("./src/routes/api");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "..", "frontend", "public");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png"
};

function publicFile(req, res) {
  const requested = req.url === "/" ? "/index.html" : req.url;
  const safePath = path.normalize(requested).replace(/^(\.\.[\\/])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(PUBLIC_DIR, "index.html"), (fallbackErr, fallback) => {
        if (fallbackErr) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        res.writeHead(200, { "Content-Type": mimeTypes[".html"] });
        res.end(fallback);
      });
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    handleApiRequest(req, res);
    return;
  }
  publicFile(req, res);
});

// ── WebSocket Server ──────────────────────────────────────────
const wss = new WebSocketServer({ server });
const clients = new Set();

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`[WS] Client connected (total: ${clients.size})`);

  // Send current session snapshot on connect
  const state = require("./src/data/state");
  ws.send(JSON.stringify({
    event: "session_snapshot",
    data: {
      questions: state.questions,
      polls: state.polls || [],
      participants: state.participants || [],
      stats: {
        questionsCount: state.questions.length,
        participantsCount: (state.participants || []).length,
        upvotesCount: state.questions.reduce((s, q) => s + (q.votes || 0), 0),
        avgLatency: "38ms"
      }
    }
  }));

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw);
      // Echo/relay messages from clients to all others
      broadcast(msg, ws);
    } catch { /* ignore */ }
  });

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`[WS] Client disconnected (total: ${clients.size})`);
  });

  ws.on("error", () => clients.delete(ws));
});

/** Broadcast a message to all connected clients (optionally skip sender) */
function broadcast(msg, skip = null) {
  const raw = JSON.stringify(msg);
  clients.forEach(ws => {
    if (ws !== skip && ws.readyState === 1 /* OPEN */) {
      ws.send(raw);
    }
  });
}

// Expose broadcast so api.js can call it
module.exports.broadcast = broadcast;

server.listen(PORT, () => {
  console.log(`CollectiveVoice is running at http://localhost:${PORT}`);
  console.log(`WebSocket server ready on ws://localhost:${PORT}`);
});
