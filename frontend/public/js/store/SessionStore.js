/* ============================================================
   SessionStore — Plain-JS pub/sub store for live session state
   Pattern: useReducer + event bus (no React / Zustand needed)
   ============================================================ */

// ── Initial State ─────────────────────────────────────────────
const _initialState = () => ({
  questions: [],
  polls: [],
  participants: [],
  activityFeed: [],   // { id, type, text, timestamp }
  stats: {
    questionsCount: 0,
    participantsCount: 0,
    upvotesCount: 0,
    avgLatency: "—",
  },
  sessionTimer: 0,        // seconds elapsed
  isQuestionsPaused: false,
  healthStatus: {
    connection: "connected",   // connected | connecting | disconnected
    sync: "synced",            // synced | syncing | error
    responseTime: "38ms",
    aiProcessing: "active",    // active | idle | error
  },
  topContributors: [],   // { name, initials, upvotes, questions }
  assignedQuestion: null,  // question currently shown to speaker
  activeView: "participant", // local UI state only
});

let _state = _initialState();
const _listeners = new Set();

// ── Helpers ───────────────────────────────────────────────────
function _notify() {
  _listeners.forEach(fn => fn({ ..._state }));
}

function _now() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function _addActivity(type, text) {
  const entry = { id: `act_${Date.now()}`, type, text, time: _now() };
  _state.activityFeed = [entry, ..._state.activityFeed].slice(0, 50);
}

// ── Reducer ───────────────────────────────────────────────────
function reducer(action) {
  switch (action.type) {

    case "SESSION_LOADED": {
      const { questions, polls, participants, stats } = action.payload;
      _state.questions = questions || [];
      _state.polls = polls || [];
      _state.participants = participants || [];
      _state.stats = { ..._state.stats, ...stats };
      _recalcStats();
      break;
    }

    case "QUESTION_ADDED": {
      const q = action.payload;
      if (!_state.questions.find(x => x.id === q.id)) {
        _state.questions = [q, ..._state.questions];
        _recalcStats();
        _addActivity("question", `New question: "${q.text.slice(0, 60)}…"`);
      }
      break;
    }

    case "QUESTION_UPVOTED": {
      const { id, votes, score } = action.payload;
      _state.questions = _state.questions.map(q =>
        q.id === id ? { ...q, votes, score } : q
      );
      _recalcStats();
      _addActivity("upvote", `Question received an upvote`);
      break;
    }

    case "QUESTION_ASSIGNED": {
      const { questionId, speakerId } = action.payload;
      _state.questions = _state.questions.map(q =>
        q.id === questionId
          ? { ...q, status: "under_review", assignedSpeakerId: speakerId }
          : q
      );
      const q = _state.questions.find(x => x.id === questionId);
      _state.assignedQuestion = q || null;
      _addActivity("assign", `Question assigned to speaker`);
      break;
    }

    case "SPEAKER_ASSIGNED": {
      // Moderator explicitly designated a participant as speaker
      const { speakerId, speakerName, speakerInitials } = action.payload;
      _state.currentSpeaker = speakerId
        ? { id: speakerId, name: speakerName, initials: speakerInitials }
        : null;
      if (speakerName) {
        _addActivity("assign", `${speakerName} was made the speaker`);
      }
      break;
    }

    case "QUESTION_ANSWERED": {
      const { id } = action.payload;
      _state.questions = _state.questions.map(q =>
        q.id === id ? { ...q, status: "Answered" } : q
      );
      _addActivity("answered", `Question marked as answered`);
      break;
    }

    case "QUESTION_STATUS": {
      const { id, status } = action.payload;
      _state.questions = _state.questions.map(q =>
        q.id === id ? { ...q, status } : q
      );
      break;
    }

    case "POLL_CREATED": {
      _state.polls = [action.payload, ..._state.polls];
      _addActivity("poll", `New poll started: "${action.payload.question}"`);
      break;
    }

    case "POLL_UPDATED": {
      const updated = action.payload;
      _state.polls = _state.polls.map(p =>
        p.id === updated.id ? updated : p
      );
      break;
    }

    case "PARTICIPANT_JOINED": {
      const { name } = action.payload;
      if (!_state.participants.find(p => p.name === name)) {
        _state.participants = [..._state.participants, action.payload];
        _recalcStats();
        _addActivity("join", `${name} joined the session`);
      }
      break;
    }

    case "STATS_UPDATED": {
      _state.stats = { ..._state.stats, ...action.payload };
      break;
    }

    case "HEALTH_UPDATED": {
      _state.healthStatus = { ..._state.healthStatus, ...action.payload };
      break;
    }

    case "TIMER_TICK": {
      _state.sessionTimer += 1;
      break;
    }

    case "QUESTIONS_PAUSED": {
      _state.isQuestionsPaused = action.payload;
      _addActivity("system", `Questions ${action.payload ? "paused" : "resumed"}`);
      break;
    }

    case "CLEAR_ANSWERED": {
      _state.questions = _state.questions.filter(q => q.status !== "Answered");
      _addActivity("system", "Answered questions cleared from queue");
      break;
    }

    // Server echoes back the authoritative vote result for just THIS client.
    // Updates are already reflected in state.myVotes (set in socket.js); this
    // action is dispatched so subscribed views can re-render the affected card.
    case "YOUR_VOTE_CHANGED": {
      // No _state mutation needed here — myVotes lives on the global `state` object
      // (frontend/public/js/state.js) and was already updated in socket.js.
      // We notify so subscribed UI components re-read state.myVotes.
      break;
    }

    // ── Meeting lifecycle ────────────────────────────────────────
    case "MEETING_STATUS_CHANGED": {
      const { status } = action.payload;
      _state.meetingStatus = status;
      if (status === "live") {
        _state.meetingEnded = false;
        _addActivity("system", "Meeting is now live!");
      }
      break;
    }

    case "MEETING_ENDED": {
      _state.meetingEnded  = true;
      _state.meetingStatus = action.payload?.status || "conducted";
      _addActivity("system", "The meeting has ended.");
      break;
    }

    case "ANNOUNCEMENT": {
      const { message } = action.payload;
      if (message) {
        _addActivity("announcement", `📣 ${message}`);
      }
      break;
    }

    case "RESET": {
      _state = _initialState();
      break;
    }

    default:
      break;
  }
}

function _recalcStats() {
  _state.stats.questionsCount = _state.questions.length;
  _state.stats.participantsCount = _state.participants.length;
  _state.stats.upvotesCount = _state.questions.reduce((s, q) => s + (q.votes || 0), 0);

  // Top contributors from questions (simulate upvoter data)
  const contrib = {};
  _state.questions.forEach(q => {
    const name = q.askedBy || "Anonymous";
    if (!contrib[name]) contrib[name] = { name, initials: name.slice(0, 2).toUpperCase(), upvotes: 0, questions: 0 };
    contrib[name].questions += 1;
    contrib[name].upvotes += (q.votes || 0);
  });
  _state.topContributors = Object.values(contrib)
    .sort((a, b) => b.upvotes - a.upvotes)
    .slice(0, 5);
}

// ── Public API ────────────────────────────────────────────────
export function getSessionState() {
  return { ..._state };
}

export function dispatch(action) {
  reducer(action);
  _notify();
}

/** Returns unsubscribe fn */
export function subscribe(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

/** Sorted questions by composite score (server-computed) */
export function selectRankedQuestions(state = _state) {
  return [...state.questions].sort((a, b) => (b.score || 0) - (a.score || 0));
}

export function selectPendingQuestions(state = _state) {
  return selectRankedQuestions(state).filter(q => q.status !== "Answered" && q.status !== "Deferred");
}

export function selectActivePoll(state = _state) {
  return state.polls.find(p => p.active) || null;
}

// Start session timer (call once on session mount)
let _timerInterval = null;
export function startSessionTimer() {
  if (_timerInterval) return;
  _timerInterval = setInterval(() => {
    dispatch({ type: "TIMER_TICK" });
  }, 1000);
}
export function stopSessionTimer() {
  clearInterval(_timerInterval);
  _timerInterval = null;
}

export function formatTimer(seconds) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}
