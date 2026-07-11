/* ============================================================
   SpeakerView — Speaker-facing live session surface
   Components: NextQuestionCard, LiveOverviewStats, CurrentQuestionPanel,
               SpeakerNotesInput, TipsPanel, UpcomingQueueList
   ============================================================ */
import { icons } from "../utils/icons.js";
import {
  getSessionState, selectRankedQuestions, selectPendingQuestions,
  dispatch, subscribe, formatTimer
} from "../store/SessionStore.js";

const NOTES_KEY = "cv_speaker_notes";

// ── NextQuestionCard ──────────────────────────────────────────
function renderNextQuestionCard(assignedQuestion) {
  if (!assignedQuestion) {
    return `
      <div class="spk-panel spk-next-card spk-next-empty">
        <div class="spk-empty-icon">${icons.mic}</div>
        <h2>No Question Assigned Yet</h2>
        <p>The moderator will send you a question when ready.</p>
        <div class="spk-waiting-dots">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;
  }

  const q = assignedQuestion;
  const pct = Math.round((q.score || 0) * 100);

  return `
    <div class="spk-panel spk-next-card">
      <div class="spk-next-header">
        <span class="spk-selected-badge">${icons.mic} Selected by Moderator</span>
        <span class="spk-score-pill">Score ${pct}</span>
      </div>

      <h2 class="spk-next-question">${q.text}</h2>

      <div class="spk-next-meta">
        <span>${icons.thumbsUp} ${q.votes} upvotes</span>
        <span>${icons.users} ${q.similar || 0} similar questions</span>
        <span>${icons.clock} asked ${q.asked}</span>
      </div>

      ${q.summary ? `
        <div class="spk-ai-summary">
          <div class="spk-ai-label">${icons.zap} AI Context Summary</div>
          <p>${q.summary}</p>
        </div>
      ` : ""}

      <div class="spk-next-actions">
        <button class="spk-start-btn" onclick="speakerStartAnswering()">
          ${icons.mic} Start Answering
        </button>
        <button class="spk-skip-btn" onclick="speakerSkipQuestion()">
          ${icons.skipForward} Skip
        </button>
      </div>
    </div>
  `;
}

// ── LiveOverviewStats ─────────────────────────────────────────
function renderSpeakerStats(stats) {
  const cards = [
    { icon: icons.messageCircle, label: "Questions",    value: stats.questionsCount,   color: "#6366f1" },
    { icon: icons.users,         label: "Participants", value: stats.participantsCount, color: "#8b5cf6" },
    { icon: icons.thumbsUp,      label: "Upvotes",      value: stats.upvotesCount,      color: "#10b981" },
    { icon: icons.activity,      label: "Latency",      value: stats.avgLatency || "38ms", color: "#f59e0b" },
  ];
  return `
    <div class="spk-panel">
      <div class="spk-panel-title">${icons.barChart} <h2>Session Overview</h2></div>
      <div class="spk-stats-grid">
        ${cards.map(c => `
          <div class="spk-stat-card">
            <span class="spk-stat-icon" style="color:${c.color}">${c.icon}</span>
            <span class="spk-stat-value">${c.value}</span>
            <span class="spk-stat-label">${c.label}</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

// ── CurrentQuestionPanel ──────────────────────────────────────
function renderCurrentPanel(assignedQuestion) {
  if (!assignedQuestion) return "";
  return `
    <div class="spk-panel spk-current-panel">
      <div class="spk-panel-title">${icons.eye} <h2>Currently Answering</h2></div>
      <div class="spk-current-row">
        <div class="spk-current-rank">Q</div>
        <div>
          <p class="spk-current-text">${assignedQuestion.text}</p>
          <div class="spk-current-meta">
            ${icons.thumbsUp} ${assignedQuestion.votes} upvotes &nbsp;·&nbsp;
            ${icons.star} Score ${((assignedQuestion.score || 0) * 100).toFixed(0)}
          </div>
        </div>
      </div>
    </div>
  `;
}

// ── SpeakerNotesInput ─────────────────────────────────────────
function renderSpeakerNotes() {
  const saved = localStorage.getItem(NOTES_KEY) || "";
  return `
    <div class="spk-panel spk-notes-panel">
      <div class="spk-panel-title">${icons.edit} <h2>Speaker Notes <span class="spk-private-tag">Private</span></h2></div>
      <p class="spk-notes-sub">These notes are only visible to you and auto-saved locally.</p>
      <textarea id="speakerNotesTextarea" class="spk-notes-textarea"
        placeholder="Jot down key points, references, or reminders…"
        oninput="speakerSaveNotes(this.value)">${saved}</textarea>
      <span class="spk-notes-saved" id="speakerNotesSavedTag">✓ Auto-saved</span>
    </div>
  `;
}

// ── TipsForSpeakersPanel ──────────────────────────────────────
const TIPS = [
  { icon: icons.mic,       text: "Answer clearly and concisely — aim for 2-3 minutes." },
  { icon: icons.star,      text: "Give a concrete example or real-world analogy." },
  { icon: icons.users,     text: "Invite the audience to share their own perspectives." },
  { icon: icons.clock,     text: "Watch the session timer and stay on schedule." },
  { icon: icons.thumbsUp,  text: "Acknowledge the upvotes — they signal high interest." },
];

function renderTipsPanel() {
  return `
    <div class="spk-panel spk-tips-panel">
      <div class="spk-panel-title">${icons.zap} <h2>Speaker Tips</h2></div>
      <ul class="spk-tips-list">
        ${TIPS.map(t => `
          <li class="spk-tip-item">
            <span class="spk-tip-icon">${t.icon}</span>
            <span>${t.text}</span>
          </li>
        `).join("")}
      </ul>
    </div>
  `;
}

// ── UpcomingQueueList ─────────────────────────────────────────
function renderUpcomingQueue(questions) {
  const pending = questions.filter(q =>
    q.status !== "Answered" && q.status !== "under_review" && q.status !== "Deferred"
  ).slice(0, 3);

  return `
    <div class="spk-panel spk-queue-panel">
      <div class="spk-panel-header">
        <div class="spk-panel-title">${icons.skipForward} <h2>Up Next</h2></div>
        <button class="spk-view-all" onclick="go('/moderator')">View All ${icons.arrowRight}</button>
      </div>
      ${pending.length === 0 ? `<p class="spk-empty">Queue is empty.</p>` : ""}
      <div class="spk-upcoming-list">
        ${pending.map((q, i) => `
          <div class="spk-upcoming-item">
            <span class="spk-upcoming-rank">${i + 1}</span>
            <div class="spk-upcoming-body">
              <p class="spk-upcoming-text">${q.text}</p>
              <span class="spk-upcoming-meta">${icons.thumbsUp} ${q.votes} &nbsp;·&nbsp; Score ${((q.score || 0) * 100).toFixed(0)}</span>
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

// ── Main Render ───────────────────────────────────────────────
let _unsubscribe = null;

export function renderSpeakerView(container) {
  const ss = getSessionState();
  if (ss.questions.length === 0) {
    fetch("/api/session/live")
      .then(r => r.json())
      .then(data => dispatch({ type: "SESSION_LOADED", payload: data }));
  }

  if (_unsubscribe) _unsubscribe();
  _unsubscribe = subscribe((state) => paintSpeakerView(container, state));
  paintSpeakerView(container, ss);
}

function paintSpeakerView(container, state) {
  const ranked = selectRankedQuestions(state);

  container.innerHTML = `
    <!-- Session Header -->
    <div class="spk-header">
      <div>
        <h1 class="spk-page-title">Speaker View</h1>
        <p class="spk-page-sub">AI in Education: Opportunities &amp; Challenges</p>
      </div>
      <span class="spk-live-badge">
        <span class="mod-live-dot"></span> Live · ${formatTimer(state.sessionTimer)}
      </span>
    </div>

    <div class="spk-main-grid">
      <!-- Left: next question + current + queue -->
      <div class="spk-left-col">
        ${renderNextQuestionCard(state.assignedQuestion)}
        ${renderCurrentPanel(state.assignedQuestion)}
        ${renderUpcomingQueue(ranked)}
      </div>

      <!-- Right: stats + notes + tips -->
      <div class="spk-right-col">
        ${renderSpeakerStats(state.stats)}
        ${renderSpeakerNotes()}
        ${renderTipsPanel()}
      </div>
    </div>
  `;
}

export function teardownSpeakerView() {
  if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
}

// ── Global Handlers ───────────────────────────────────────────
export function speakerSaveNotes(value) {
  localStorage.setItem(NOTES_KEY, value);
  const tag = document.querySelector("#speakerNotesSavedTag");
  if (tag) { tag.style.opacity = "1"; setTimeout(() => { tag.style.opacity = "0"; }, 1500); }
}

export function speakerStartAnswering() {
  const ss = getSessionState();
  if (!ss.assignedQuestion) return;
  // Mark as under_review visually and emit to server
  fetch(`/api/questions/${ss.assignedQuestion.id}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "under_review" })
  });
  dispatch({ type: "QUESTION_STATUS", payload: { id: ss.assignedQuestion.id, status: "under_review" } });
  // Show detail
  window.go(`/question/${ss.assignedQuestion.id}`);
}

export function speakerSkipQuestion() {
  const ss = getSessionState();
  if (!ss.assignedQuestion) return;
  dispatch({ type: "QUESTION_ASSIGNED", payload: { questionId: null, speakerId: null } });
}
