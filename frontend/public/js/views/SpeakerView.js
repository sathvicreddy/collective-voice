/* ============================================================
   SpeakerView — Speaker-facing live session surface
   
   The speaker is a session-level designation (chosen by moderator
   from the participants panel). They see the full live ranked
   question queue — the top question is highlighted as "Focus Now",
   the rest show as "Up Next". No per-question assignment needed.
   ============================================================ */
import { icons } from "../utils/icons.js";
import {
  getSessionState, selectRankedQuestions,
  dispatch, subscribe, formatTimer
} from "../store/SessionStore.js";
import { getSocket } from "../hooks/socket.js";
import { state } from "../state.js";

const NOTES_KEY = "cv_speaker_notes";

// ── Focus Question Card (top-ranked active question) ───────────
function renderFocusCard(topQuestion, sessionTimer) {
  if (!topQuestion) {
    return `
      <div class="spk-panel spk-next-card spk-next-empty">
        <div class="spk-empty-icon">${icons.mic}</div>
        <h2>Waiting for Questions</h2>
        <p>As the audience asks questions they'll appear here, ranked by score. You'll see the most important one first.</p>
        <div class="spk-waiting-dots">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;
  }

  const pct = Math.round((topQuestion.score || 0) * 100);

  return `
    <div class="spk-panel spk-next-card">
      <div class="spk-next-header">
        <span class="spk-selected-badge">${icons.zap} Top Question — Focus Now</span>
        <span class="spk-score-pill">Score ${pct}</span>
      </div>

      <h2 class="spk-next-question">${topQuestion.text}</h2>

      <div class="spk-next-meta">
        <span>${icons.thumbsUp} ${topQuestion.votes} upvotes</span>
        <span>${icons.users} ${topQuestion.similar || topQuestion.clusterSize || 1} similar</span>
        <span>${icons.clock} asked ${topQuestion.asked || "recently"}</span>
      </div>

      ${topQuestion.summary ? `
        <div class="spk-ai-summary">
          <div class="spk-ai-label">${icons.zap} AI Context Summary</div>
          <p>${topQuestion.summary}</p>
        </div>
      ` : ""}

      <div class="spk-next-actions">
        <button class="spk-start-btn" data-action="speakerMarkAnswered" data-id="${topQuestion.id}">
          ${icons.check} Mark Answered
        </button>
        <button class="spk-skip-btn" data-action="speakerDeferQuestion" data-id="${topQuestion.id}">
          ${icons.skipForward} Defer
        </button>
      </div>
    </div>
  `;
}

// ── Live Overview Stats ────────────────────────────────────────
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

// ── Up-Next Queue (questions 2–6) ──────────────────────────────
function renderUpcomingQueue(ranked) {
  // Skip the top question (already shown in focus card), show next 5
  const upcoming = ranked
    .filter(q => q.status !== "Answered" && q.status !== "Deferred" && q.status !== "Skipped")
    .slice(1, 6);

  return `
    <div class="spk-panel spk-queue-panel">
      <div class="spk-panel-header">
        <div class="spk-panel-title">${icons.skipForward} <h2>Up Next</h2></div>
        <span class="spk-queue-count">${upcoming.length} queued</span>
      </div>
      ${upcoming.length === 0 ? `<p class="spk-empty">No more questions in the queue.</p>` : ""}
      <div class="spk-upcoming-list">
        ${upcoming.map((q, i) => `
          <div class="spk-upcoming-item">
            <span class="spk-upcoming-rank">${i + 2}</span>
            <div class="spk-upcoming-body">
              <p class="spk-upcoming-text">${q.text}</p>
              <span class="spk-upcoming-meta">
                ${icons.thumbsUp} ${q.votes}
                &nbsp;·&nbsp;
                Score ${((q.score || 0) * 100).toFixed(0)}
                &nbsp;·&nbsp;
                ${q.similar || 1} similar
              </span>
            </div>
            <div class="spk-upcoming-actions">
              <button class="spk-mini-btn" data-action="speakerMarkAnswered" data-id="${q.id}" title="Mark answered">${icons.check}</button>
              <button class="spk-mini-btn spk-mini-defer" data-action="speakerDeferQuestion" data-id="${q.id}" title="Defer">${icons.skipForward}</button>
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

// ── Speaker Notes ──────────────────────────────────────────────
function renderSpeakerNotes() {
  const saved = localStorage.getItem(NOTES_KEY) || "";
  return `
    <div class="spk-panel spk-notes-panel">
      <div class="spk-panel-title">${icons.edit} <h2>Speaker Notes <span class="spk-private-tag">Private</span></h2></div>
      <p class="spk-notes-sub">Only visible to you — auto-saved locally.</p>
      <textarea id="speakerNotesTextarea" class="spk-notes-textarea"
        placeholder="Key points, references, reminders…"
        data-input="speakerSaveNotes">${saved}</textarea>
      <span class="spk-notes-saved" id="speakerNotesSavedTag">✓ Auto-saved</span>
    </div>
  `;
}

// ── Tips Panel ─────────────────────────────────────────────────
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

// ── Admin Announcement Banner ────────────────────────────────────────
let _spkAdminAnnouncement = null;
let _spkAnnouncementListenerAttached = false;

function _spkRenderAdminBanner() {
  if (!_spkAdminAnnouncement) return "";
  const { subject, body, senderName } = _spkAdminAnnouncement;
  return `
    <div class="cv-admin-announcement" role="alert" aria-live="assertive" id="cvAdminAnnouncement">
      <span class="cv-admin-announce-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg></span>
      <div class="cv-admin-announce-body">
        <strong class="cv-admin-announce-subject">${subject || "Announcement"}</strong>
        ${body ? `<span class="cv-admin-announce-text">${body}</span>` : ""}
        ${senderName ? `<span class="cv-admin-announce-from">— ${senderName}</span>` : ""}
      </div>
      <button class="cv-admin-announce-dismiss" data-action="dismissAnnouncement" title="Dismiss">&times;</button>
    </div>
  `;
}

// ── Main Render ────────────────────────────────────────────
let _unsubscribe = null;

export function renderSpeakerView(container) {
  const ss = getSessionState();
  if (ss.questions.length === 0) {
    const meetingId = state.session?.sessionId || "m_ai_education";
    fetch(`/api/session/live?meetingId=${meetingId}`)
      .then(r => r.json())
      .then(data => dispatch({ type: "SESSION_LOADED", payload: data }));
  }

  // Register live admin announcement listener once per view mount
  if (!_spkAnnouncementListenerAttached) {
    _spkAnnouncementListenerAttached = true;
    document.addEventListener("cv:meeting_announcement", (e) => {
      _spkAdminAnnouncement = e.detail;
      const existing = document.getElementById("cvAdminAnnouncement");
      const bannerHtml = _spkRenderAdminBanner();
      if (existing) {
        existing.outerHTML = bannerHtml;
      } else {
        const sessionRoot = document.querySelector("#sessionViewContent");
        if (sessionRoot) sessionRoot.insertAdjacentHTML("afterbegin", bannerHtml);
      }
      window._cvDismissAnnouncement = () => {
        _spkAdminAnnouncement = null;
        document.getElementById("cvAdminAnnouncement")?.remove();
      };
    });
  }

  if (_unsubscribe) _unsubscribe();
  _unsubscribe = subscribe((s) => paintSpeakerView(container, s));
  paintSpeakerView(container, ss);
}

function paintSpeakerView(container, s) {
  const ranked = selectRankedQuestions(s).filter(
    q => q.status !== "Answered" && q.status !== "Deferred" && q.status !== "Skipped"
  );
  const topQuestion = ranked[0] || null;

  // Speaker name from store (set when moderator clicks "Make Speaker")
  const speakerName = s.currentSpeaker?.name || state.profile?.user?.name || "Speaker";

  // Answering banner — mirrors ParticipantView, gives speaker confirmation
  const answeringBanner = s.nowAnswering?.text
    ? `<div class="cv-answering-banner" role="status" aria-live="polite"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;flex-shrink:0;vertical-align:-2px"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg> <strong>Now answering:</strong> ${s.nowAnswering.text}</div>`
    : "";

  container.innerHTML = `
    ${answeringBanner}
    <!-- Session Header -->
    <div class="spk-header">
      <div>
        <h1 class="spk-page-title">Speaker View</h1>
        <p class="spk-page-sub">
          ${icons.mic} ${speakerName}
          &nbsp;·&nbsp;
          ${state.joinTarget?.title || "Live Session"}
        </p>
      </div>
      <span class="spk-live-badge">
        <span class="mod-live-dot"></span> Live · ${formatTimer(s.sessionTimer)}
      </span>
    </div>

    <div class="spk-main-grid">
      <!-- Left: focus question + upcoming queue -->
      <div class="spk-left-col">
        ${renderFocusCard(topQuestion)}
        ${renderUpcomingQueue(ranked)}
      </div>

      <!-- Right: stats + notes + tips -->
      <div class="spk-right-col">
        ${renderSpeakerStats(s.stats)}
        ${renderSpeakerNotes()}
        ${renderTipsPanel()}
      </div>
    </div>
  `;

  // Register inline handlers after innerHTML update
  window.speakerMarkAnswered = speakerMarkAnswered;
  window.speakerDeferQuestion = speakerDeferQuestion;
}

export function teardownSpeakerView() {
  if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
  _spkAdminAnnouncement = null;
  _spkAnnouncementListenerAttached = false;
}

// ── Global Handlers ───────────────────────────────────────────

export function speakerSaveNotes(value) {
  localStorage.setItem(NOTES_KEY, value);
  const tag = document.querySelector("#speakerNotesSavedTag");
  if (tag) { tag.style.opacity = "1"; setTimeout(() => { tag.style.opacity = "0"; }, 1500); }
}

/**
 * Speaker marks a question as answered.
 * Emits via WebSocket → server broadcasts → all tabs update.
 */
export function speakerMarkAnswered(questionId) {
  if (!questionId) return;
  const meetingId = state.session?.sessionId || "m_ai_education";
  getSocket().emit("mark_answered", { meetingId, questionId });
  dispatch({ type: "QUESTION_ANSWERED", payload: { id: questionId } });
}

/**
 * Speaker defers a question (pushes it lower in the queue).
 */
export function speakerDeferQuestion(questionId) {
  if (!questionId) return;
  const meetingId = state.session?.sessionId || "m_ai_education";
  getSocket().emit("mark_deferred", { meetingId, questionId });
  dispatch({ type: "QUESTION_STATUS", payload: { id: questionId, status: "Deferred" } });
}

/**
 * Legacy exports — still wired in app.js but replaced by new handlers above.
 * Kept so existing window registrations don't break.
 */
export function speakerStartAnswering() {
  // No-op: replaced by speakerMarkAnswered on focus card
}

export function speakerSkipQuestion() {
  // Defer the top question
  const ss = getSessionState();
  const top = selectRankedQuestions(ss).find(q =>
    q.status !== "Answered" && q.status !== "Deferred" && q.status !== "Skipped"
  );
  if (top) speakerDeferQuestion(top.id);
}
