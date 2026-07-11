const crypto = require("crypto");
const state = require("../data/state");
const { json, readBody } = require("../utils/helpers");

// Lazy-load broadcast to avoid circular dependency with server.js
function broadcast(event, data) {
  try {
    const { broadcast: _broadcast } = require("../../server");
    _broadcast({ event, data });
  } catch { /* server not yet attached */ }
}

function analytics() {
  return {
    overview: [
      { label: "Questions Asked", value: 23, delta: "+15%" },
      { label: "Upvotes Received", value: 128, delta: "+22%" },
      { label: "Answers Given", value: 17, delta: "+11%" },
      { label: "Meetings Joined", value: 12, delta: "+9%" }
    ],
    trend: [28, 34, 31, 46, 37, 58, 43, 64, 39, 55],
    categories: [
      { label: "AI in Education", value: 45 },
      { label: "Remote Learning", value: 30 },
      { label: "Data Privacy", value: 15 },
      { label: "EdTech Innovations", value: 10 }
    ]
  };
}

async function handleApiRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // ── GET /api/home ────────────────────────────────────────────
  if (req.method === "GET" && url.pathname === "/api/home") {
    return json(res, 200, {
      user: state.user,
      live: state.meetings.find((meeting) => meeting.status === "live"),
      upcoming: state.meetings.filter((meeting) => meeting.status === "upcoming"),
      recentActivity: state.questions[0]
    });
  }

  // ── GET /api/meetings ────────────────────────────────────────
  if (req.method === "GET" && url.pathname === "/api/meetings") {
    return json(res, 200, { meetings: state.meetings });
  }

  // ── GET /api/sessions/code/:code ─────────────────────────────
  if (req.method === "GET" && url.pathname.startsWith("/api/sessions/code/")) {
    const code = url.pathname.split("/").pop();
    const meeting = state.meetings.find((item) => item.code === code);
    if (!meeting) return json(res, 404, { error: "Meeting not found" });
    return json(res, 200, { meeting });
  }

  // ── GET /api/session/live ─────────────────────────────────────
  if (req.method === "GET" && url.pathname === "/api/session/live") {
    return json(res, 200, {
      questions: state.questions,
      polls: state.polls || [],
      participants: state.participants || [],
      stats: {
        questionsCount: state.questions.length,
        participantsCount: (state.participants || []).length,
        upvotesCount: state.questions.reduce((s, q) => s + (q.votes || 0), 0),
        avgLatency: "38ms"
      }
    });
  }

  // ── GET /api/questions/:id ───────────────────────────────────
  if (req.method === "GET" && url.pathname.match(/^\/api\/questions\/[^/]+$/)) {
    const id = url.pathname.split("/").pop();
    const question = state.questions.find((item) => item.id === id);
    if (!question) return json(res, 404, { error: "Question not found" });
    return json(res, 200, { question });
  }

  // ── GET /api/questions ───────────────────────────────────────
  if (req.method === "GET" && url.pathname === "/api/questions") {
    const ranked = [...state.questions].sort((a, b) => (b.score || 0) - (a.score || 0));
    return json(res, 200, { questions: ranked });
  }

  // ── POST /api/questions ──────────────────────────────────────
  if (req.method === "POST" && url.pathname === "/api/questions") {
    const body = await readBody(req);
    const text = String(body.text || "").trim();
    if (!text) return json(res, 400, { error: "Question text is required" });
    const question = {
      id: `q_${crypto.randomUUID()}`,
      text,
      votes: 1,
      asked: "Just now",
      score: 0.51,
      status: "Pending",
      similar: 1,
      askedBy: body.askedBy || "Anonymous",
      assignedSpeakerId: null,
      summary: "New question — AI context analysis in progress."
    };
    state.questions.unshift(question);
    broadcast("question_submitted", question);
    return json(res, 201, { question, questions: state.questions });
  }

  // ── POST /api/questions/:id/upvote ───────────────────────────
  if (req.method === "POST" && url.pathname.match(/^\/api\/questions\/[^/]+\/upvote$/)) {
    const id = url.pathname.split("/")[3];
    const question = state.questions.find((item) => item.id === id);
    if (!question) return json(res, 404, { error: "Question not found" });
    question.votes += 1;
    question.score = Math.min(0.99, Number((question.score + 0.01).toFixed(2)));
    broadcast("question_upvoted", { id: question.id, votes: question.votes, score: question.score });
    return json(res, 200, { question });
  }

  // ── POST /api/questions/:id/assign ───────────────────────────
  if (req.method === "POST" && url.pathname.match(/^\/api\/questions\/[^/]+\/assign$/)) {
    const id = url.pathname.split("/")[3];
    const body = await readBody(req);
    const question = state.questions.find((item) => item.id === id);
    if (!question) return json(res, 404, { error: "Question not found" });
    question.status = "under_review";
    question.assignedSpeakerId = body.speakerId || "speaker_default";
    broadcast("question_assigned", { questionId: id, speakerId: question.assignedSpeakerId });
    return json(res, 200, { question });
  }

  // ── POST /api/questions/:id/answer ───────────────────────────
  if (req.method === "POST" && url.pathname.match(/^\/api\/questions\/[^/]+\/answer$/)) {
    const id = url.pathname.split("/")[3];
    const question = state.questions.find((item) => item.id === id);
    if (!question) return json(res, 404, { error: "Question not found" });
    question.status = "Answered";
    broadcast("question_answered", { id });
    return json(res, 200, { question });
  }

  // ── POST /api/questions/:id/status ───────────────────────────
  if (req.method === "POST" && url.pathname.match(/^\/api\/questions\/[^/]+\/status$/)) {
    const id = url.pathname.split("/")[3];
    const body = await readBody(req);
    const question = state.questions.find((item) => item.id === id);
    if (!question) return json(res, 404, { error: "Question not found" });
    question.status = body.status || question.status;
    return json(res, 200, { question });
  }

  // ── POST /api/polls/:id/vote ──────────────────────────────────
  if (req.method === "POST" && url.pathname.match(/^\/api\/polls\/[^/]+\/vote$/)) {
    const id = url.pathname.split("/")[3];
    const body = await readBody(req);
    const poll = (state.polls || []).find((p) => p.id === id);
    if (!poll) return json(res, 404, { error: "Poll not found" });
    const option = poll.options.find((o) => o.id === body.optionId);
    if (!option) return json(res, 400, { error: "Invalid option" });
    option.votes += 1;
    poll.totalVotes = poll.options.reduce((s, o) => s + o.votes, 0);
    broadcast("poll_updated", poll);
    return json(res, 200, { poll });
  }

  // ── POST /api/announcements ───────────────────────────────────
  if (req.method === "POST" && url.pathname === "/api/announcements") {
    const body = await readBody(req);
    const msg = String(body.message || "").trim();
    if (!msg) return json(res, 400, { error: "Message required" });
    broadcast("announcement", { message: msg, time: new Date().toISOString() });
    return json(res, 200, { sent: true });
  }

  // ── POST /api/sessions ───────────────────────────────────────
  if (req.method === "POST" && url.pathname === "/api/sessions") {
    const body = await readBody(req);
    const meeting = {
      id: `m_${crypto.randomUUID()}`,
      code: String(Math.floor(100000 + Math.random() * 899999)),
      title: body.title || "Untitled Meeting",
      speaker: "Ananya Sharma",
      date: body.date || "May 30, 2025",
      time: body.time || "02:00 PM - 03:30 PM",
      duration: body.duration || "1h 30m",
      status: "upcoming",
      startsIn: "Scheduled",
      participants: Array.isArray(body.participants) ? body.participants.length : 0,
      category: "Custom"
    };
    state.meetings.unshift(meeting);
    return json(res, 201, { meeting });
  }

  // ── GET /api/activity ────────────────────────────────────────
  if (req.method === "GET" && url.pathname === "/api/activity") {
    return json(res, 200, {
      analytics: analytics(),
      questions: state.questions,
      meetings: state.meetings
    });
  }

  // ── GET /api/analytics ───────────────────────────────────────
  if (req.method === "GET" && url.pathname === "/api/analytics") {
    return json(res, 200, {
      session: state.meetings[0],
      analytics: {
        ...analytics(),
        totals: {
          participants: 128,
          questions: state.questions.length,
          uniqueClusters: 41,
          upvotes: state.questions.reduce((s, q) => s + (q.votes || 0), 0),
          queueReduction: "63%",
          averageLatency: "38ms"
        },
        aiSummary: "Most discussion centered on responsible AI use, student privacy, remote-learning outcomes, and institutional policy."
      }
    });
  }

  // ── GET /api/profile ─────────────────────────────────────────
  if (req.method === "GET" && url.pathname === "/api/profile") {
    return json(res, 200, { user: state.user });
  }

  // ── GET /api/notifications ───────────────────────────────────
  if (req.method === "GET" && url.pathname === "/api/notifications") {
    return json(res, 200, { notifications: state.notifications });
  }

  return json(res, 404, { error: "API route not found" });
}

module.exports = handleApiRequest;
