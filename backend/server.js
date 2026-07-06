const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

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

const state = {
  user: {
    id: "u_ananya",
    name: "Ananya Sharma",
    email: "ananya.sharma@email.com",
    role: "Audience Member",
    joined: "May 2024",
    stats: {
      questionsAsked: 23,
      upvotesReceived: 128,
      answersGiven: 17,
      meetingsJoined: 12
    }
  },
  meetings: [
    {
      id: "m_ai_education",
      code: "482916",
      title: "AI in Education: Opportunities & Challenges",
      speaker: "Dr. Sarah Johnson",
      date: "May 30, 2025",
      time: "02:00 PM - 03:30 PM",
      duration: "1h 30m",
      status: "live",
      participants: 128,
      description: "Let's discuss how AI is transforming education and the challenges we face.",
      category: "AI in Education"
    },
    {
      id: "m_remote",
      code: "275190",
      title: "Future of Remote Learning",
      speaker: "Dr. Michael Lee",
      date: "May 25, 2025",
      time: "02:00 PM - 03:30 PM",
      duration: "1h 30m",
      status: "upcoming",
      startsIn: "In 2h",
      participants: 80,
      category: "Remote Learning"
    },
    {
      id: "m_privacy",
      code: "733512",
      title: "Data Privacy in EdTech",
      speaker: "Priya Sharma",
      date: "May 26, 2025",
      time: "11:00 AM - 12:00 PM",
      duration: "1h",
      status: "upcoming",
      startsIn: "In 1 day",
      participants: 65,
      category: "Data Privacy"
    },
    {
      id: "m_innovations",
      code: "918224",
      title: "EdTech Innovations 2025",
      speaker: "James Wilson",
      date: "May 28, 2025",
      time: "04:00 PM - 05:00 PM",
      duration: "1h",
      status: "upcoming",
      startsIn: "In 3 days",
      participants: 90,
      category: "EdTech Innovations"
    },
    {
      id: "m_engagement",
      code: "611204",
      title: "Student Engagement Strategies",
      speaker: "Ananya Sharma",
      date: "May 18, 2025",
      time: "04:00 PM - 06:00 PM",
      duration: "2h",
      status: "conducted",
      participants: 95,
      questionsCount: 34,
      upvotes: 210,
      category: "Teaching Methods"
    },
    {
      id: "m_policy",
      code: "812640",
      title: "Education Policy Discussion",
      speaker: "Ananya Sharma",
      date: "May 12, 2025",
      time: "10:00 AM - 11:30 AM",
      duration: "1h 30m",
      status: "past",
      participants: 142,
      questionsCount: 48,
      upvotes: 356,
      category: "Policy"
    }
  ],
  questions: [
    {
      id: "q1",
      text: "How can AI be used ethically in education?",
      votes: 126,
      asked: "2h ago",
      score: 0.87,
      status: "Under Review",
      similar: 18,
      clusterSize: 18,
      summary: "Participants are asking how institutions can balance useful AI tools with bias checks, privacy, transparency, and teacher oversight.",
      timeline: ["Submitted", "Clustered with 18 similar questions", "Ranked #1", "Awaiting moderator action"]
    },
    {
      id: "q2",
      text: "What are the long-term impacts of remote learning?",
      votes: 98,
      asked: "1d ago",
      score: 0.74,
      status: "Answered",
      similar: 12,
      clusterSize: 12,
      summary: "The cluster focuses on learning outcomes, student isolation, access gaps, and hybrid course design.",
      timeline: ["Submitted", "Clustered with 12 similar questions", "Answered by speaker"]
    },
    {
      id: "q3",
      text: "How do we ensure data privacy in edtech platforms?",
      votes: 84,
      asked: "2d ago",
      score: 0.66,
      status: "Answered",
      similar: 6,
      clusterSize: 6,
      summary: "The question centers on consent, minimal data collection, secure storage, and clear retention policies.",
      timeline: ["Submitted", "Clustered with 6 similar questions", "Answered by speaker"]
    }
  ],
  notifications: [
    { id: "n1", type: "Meeting Updates", title: "Education Policy Discussion is starting soon", body: "Your meeting starts in 15 minutes", time: "9:45 AM" },
    { id: "n2", type: "Questions", title: "New question in Education Policy Discussion", body: "How can AI be used ethically in education?", time: "9:30 AM" },
    { id: "n3", type: "System", title: "Meeting report is ready", body: "View insights from Education Policy Discussion", time: "May 27" }
  ]
};

function json(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function publicFile(req, res) {
  const requested = req.url === "/" ? "/index.html" : req.url;
  const safePath = path.normalize(requested).replace(/^(\.\.[/\\])+/, "");
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

async function api(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/api/home") {
    return json(res, 200, {
      user: state.user,
      live: state.meetings.find((meeting) => meeting.status === "live"),
      upcoming: state.meetings.filter((meeting) => meeting.status === "upcoming"),
      recentActivity: state.questions[0]
    });
  }

  if (req.method === "GET" && url.pathname === "/api/meetings") {
    return json(res, 200, { meetings: state.meetings });
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/sessions/code/")) {
    const code = url.pathname.split("/").pop();
    const meeting = state.meetings.find((item) => item.code === code);
    if (!meeting) {
      return json(res, 404, { error: "Meeting not found" });
    }
    return json(res, 200, { meeting });
  }

  if (req.method === "GET" && url.pathname.match(/^\/api\/questions\/[^/]+$/)) {
    const id = url.pathname.split("/").pop();
    const question = state.questions.find((item) => item.id === id);
    if (!question) {
      return json(res, 404, { error: "Question not found" });
    }
    return json(res, 200, { question });
  }

  if (req.method === "GET" && url.pathname === "/api/questions") {
    const ranked = [...state.questions].sort((a, b) => b.votes - a.votes);
    return json(res, 200, { questions: ranked });
  }

  if (req.method === "POST" && url.pathname === "/api/questions") {
    const body = await readBody(req);
    const text = String(body.text || "").trim();
    if (!text) {
      return json(res, 400, { error: "Question text is required" });
    }
    const question = {
      id: `q_${crypto.randomUUID()}`,
      text,
      votes: 1,
      asked: "Just now",
      score: 0.51,
      status: "Under Review",
      similar: 1
    };
    state.questions.unshift(question);
    return json(res, 201, { question, questions: state.questions });
  }

  if (req.method === "POST" && url.pathname.match(/^\/api\/questions\/[^/]+\/upvote$/)) {
    const id = url.pathname.split("/")[3];
    const question = state.questions.find((item) => item.id === id);
    if (!question) {
      return json(res, 404, { error: "Question not found" });
    }
    question.votes += 1;
    question.score = Math.min(0.99, Number((question.score + 0.01).toFixed(2)));
    return json(res, 200, { question });
  }

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

  if (req.method === "GET" && url.pathname === "/api/activity") {
    return json(res, 200, {
      analytics: analytics(),
      questions: state.questions,
      meetings: state.meetings
    });
  }

  if (req.method === "GET" && url.pathname === "/api/analytics") {
    return json(res, 200, {
      session: state.meetings[0],
      analytics: {
        ...analytics(),
        totals: {
          participants: 128,
          questions: 112,
          uniqueClusters: 41,
          upvotes: 326,
          queueReduction: "63%",
          averageLatency: "38ms"
        },
        aiSummary: "Most discussion centered on responsible AI use, student privacy, remote-learning outcomes, and institutional policy."
      }
    });
  }

  if (req.method === "GET" && url.pathname === "/api/profile") {
    return json(res, 200, { user: state.user });
  }

  if (req.method === "GET" && url.pathname === "/api/notifications") {
    return json(res, 200, { notifications: state.notifications });
  }

  return json(res, 404, { error: "API route not found" });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    api(req, res);
    return;
  }
  publicFile(req, res);
});

server.listen(PORT, () => {
  console.log(`CollectiveVoice is running at http://localhost:${PORT}`);
});
