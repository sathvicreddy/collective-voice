const crypto = require("crypto");

/* ============================================================
   Backend In-Memory State
   - meetings: flat array (unchanged shape)
   - questions / polls / participants: keyed by meetingId
   - users: array for auth
   ============================================================ */

const state = {
  user: {
    id: "u_ananya",
    name: "Ananya Sharma",
    email: "ananya.sharma@email.com",
    role: "Audience",
    joined: "May 18, 2025",
    location: "New Delhi, India",
    bio: "Curious mind, better questions, stronger conversations.",
    stats: {
      questionsAsked: 23,
      upvotesReceived: 128,
      answersGiven: 17,
      meetingsJoined: 8
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
      ownerId: "u_ananya",
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
      ownerId: null,
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
      ownerId: null,
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
      ownerId: null,
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
      ownerId: "u_ananya",
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
      ownerId: "u_ananya",
      participants: 142,
      questionsCount: 48,
      upvotes: 356,
      category: "Policy"
    }
  ],

  // Per-meeting question clusters, keyed by meetingId
  // Each entry is an NLP cluster object (see nlp/engine.js)
  _questions: {
    "m_ai_education": [
      {
        id: "q1",
        meetingId: "m_ai_education",
        text: "How can AI be used ethically in education?",
        canonical_text: "How can AI be used ethically in education?",
        members: ["How can AI be used ethically in education?"],
        votes: 126,
        asked: "2h ago",
        createdAt: Date.now() - 2 * 60 * 60 * 1000,
        score: 0.87,
        status: "Under Review",
        similar: 18,
        clusterSize: 18,
        askedBy: "Priya Sharma",
        assignedSpeakerId: null,
        summary: "Participants are asking how institutions can balance useful AI tools with bias checks, privacy, transparency, and teacher oversight.",
        timeline: ["Submitted", "Clustered with 18 similar questions", "Ranked #1", "Awaiting moderator action"]
      },
      {
        id: "q2",
        meetingId: "m_ai_education",
        text: "What are the long-term impacts of remote learning?",
        canonical_text: "What are the long-term impacts of remote learning?",
        members: ["What are the long-term impacts of remote learning?"],
        votes: 98,
        asked: "1d ago",
        createdAt: Date.now() - 24 * 60 * 60 * 1000,
        score: 0.74,
        status: "Answered",
        similar: 12,
        clusterSize: 12,
        askedBy: "James Wilson",
        assignedSpeakerId: null,
        summary: "The cluster focuses on learning outcomes, student isolation, access gaps, and hybrid course design.",
        timeline: ["Submitted", "Clustered with 12 similar questions", "Answered by speaker"]
      },
      {
        id: "q3",
        meetingId: "m_ai_education",
        text: "How do we ensure data privacy in edtech platforms?",
        canonical_text: "How do we ensure data privacy in edtech platforms?",
        members: ["How do we ensure data privacy in edtech platforms?"],
        votes: 84,
        asked: "2d ago",
        createdAt: Date.now() - 48 * 60 * 60 * 1000,
        score: 0.66,
        status: "Pending",
        similar: 6,
        clusterSize: 6,
        askedBy: "Ananya Sharma",
        assignedSpeakerId: null,
        summary: "The question centers on consent, minimal data collection, secure storage, and clear retention policies.",
        timeline: ["Submitted", "Clustered with 6 similar questions"]
      },
      {
        id: "q4",
        meetingId: "m_ai_education",
        text: "Can AI generate personalised learning paths for students with disabilities?",
        canonical_text: "Can AI generate personalised learning paths for students with disabilities?",
        members: ["Can AI generate personalised learning paths for students with disabilities?"],
        votes: 61,
        asked: "45m ago",
        createdAt: Date.now() - 45 * 60 * 1000,
        score: 0.58,
        status: "Pending",
        similar: 4,
        clusterSize: 4,
        askedBy: "Dr. Michael Lee",
        assignedSpeakerId: null,
        summary: "Asks whether adaptive AI systems can make content truly accessible for students with various learning differences.",
        timeline: ["Submitted", "Ranked #4"]
      },
      {
        id: "q5",
        meetingId: "m_ai_education",
        text: "What role should teachers play when AI handles grading?",
        canonical_text: "What role should teachers play when AI handles grading?",
        members: ["What role should teachers play when AI handles grading?"],
        votes: 47,
        asked: "1h ago",
        createdAt: Date.now() - 60 * 60 * 1000,
        score: 0.51,
        status: "Pending",
        similar: 3,
        clusterSize: 3,
        askedBy: "Sarah Chen",
        assignedSpeakerId: null,
        summary: "Explores teacher identity and oversight in an AI-driven assessment environment.",
        timeline: ["Submitted", "Ranked #5"]
      }
    ]
  },

  // Per-meeting polls, keyed by meetingId
  _polls: {
    "m_ai_education": [
      {
        id: "poll1",
        meetingId: "m_ai_education",
        question: "How familiar are you with AI tools in your classroom?",
        active: true,
        endsAt: Date.now() + 5 * 60 * 1000,
        totalVotes: 87,
        options: [
          { id: "opt1", label: "Very familiar",        votes: 31 },
          { id: "opt2", label: "Somewhat familiar",    votes: 38 },
          { id: "opt3", label: "Not familiar at all",  votes: 18 }
        ]
      }
    ]
  },

  // Per-meeting participants, keyed by meetingId
  _participants: {
    "m_ai_education": [
      { id: "p1", name: "Priya Sharma",  initials: "PS", upvotes: 14, questions: 3, meetingId: "m_ai_education" },
      { id: "p2", name: "James Wilson",  initials: "JW", upvotes: 11, questions: 2, meetingId: "m_ai_education" },
      { id: "p3", name: "Sarah Chen",    initials: "SC", upvotes: 9,  questions: 4, meetingId: "m_ai_education" },
      { id: "p4", name: "Ravi Kumar",    initials: "RK", upvotes: 7,  questions: 1, meetingId: "m_ai_education" },
      { id: "p5", name: "Ananya Sharma", initials: "AS", upvotes: 5,  questions: 2, meetingId: "m_ai_education" }
    ]
  },

  // Per-user notifications, keyed by userId — Bug #3 fix
  // Previously a single global array; now isolated per user.
  _notifications: {
    "u_ananya": [
      { id: "n1", type: "Meeting Updates", title: "Education Policy Discussion is starting soon", body: "Your meeting starts in 15 minutes", time: "9:45 AM" },
      { id: "n2", type: "Questions", title: "New question in Education Policy Discussion", body: "How can AI be used ethically in education?", time: "9:30 AM" },
      { id: "n3", type: "System", title: "Meeting report is ready", body: "View insights from Education Policy Discussion", time: "May 27" }
    ]
  },

  // Users for auth
  users: [
    {
      id: "u_ananya",
      name: "Ananya Sharma",
      email: "ananya.sharma@email.com",
      passwordHash: null, // set on first login/signup
      ownedMeetingIds: ["m_ai_education", "m_engagement", "m_policy"],
      createdAt: Date.now()
    }
  ],

  // Password reset tokens: { token -> { userId, expiresAt } }
  resetTokens: {}
};

// ── Per-meeting helpers ────────────────────────────────────────

/** Returns the questions array for a given meetingId (creates if missing) */
state.getQuestionsForMeeting = function(meetingId) {
  if (!this._questions[meetingId]) this._questions[meetingId] = [];
  return this._questions[meetingId];
};

/** Returns the polls array for a given meetingId (creates if missing) */
state.getPollsForMeeting = function(meetingId) {
  if (!this._polls[meetingId]) this._polls[meetingId] = [];
  return this._polls[meetingId];
};

/** Returns the participants array for a given meetingId (creates if missing) */
state.getParticipantsForMeeting = function(meetingId) {
  if (!this._participants[meetingId]) this._participants[meetingId] = [];
  return this._participants[meetingId];
};

/** Returns the notifications array for a given userId (creates if missing) — Bug #3 fix */
state.getNotificationsForUser = function(userId) {
  if (!this._notifications[userId]) this._notifications[userId] = [];
  return this._notifications[userId];
};

// Legacy compatibility shim — code that uses state.questions gets ai_education data
Object.defineProperty(state, "questions", {
  get() { return this.getQuestionsForMeeting("m_ai_education"); },
  set(v) { this._questions["m_ai_education"] = v; }
});
Object.defineProperty(state, "polls", {
  get() { return this.getPollsForMeeting("m_ai_education"); },
  set(v) { this._polls["m_ai_education"] = v; }
});
Object.defineProperty(state, "participants", {
  get() { return this.getParticipantsForMeeting("m_ai_education"); },
  set(v) { this._participants["m_ai_education"] = v; }
});

module.exports = state;
