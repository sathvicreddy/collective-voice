/* ============================================================
   ModeratorView — Full live session control dashboard
   Components: OverviewCards, RankedQuestionQueue, ActivePollsPanel,
               RecentActivityFeed, SessionHealthPanel, ParticipantsPanel,
               QuickActionsPanel, SpeakerPickerModal
   ============================================================ */
import { icons } from "../utils/icons.js";
import {
  getSessionState, selectRankedQuestions, selectActivePoll,
  dispatch, subscribe, formatTimer
} from "../store/SessionStore.js";
import { getSocket } from "../hooks/socket.js";
import { state } from "../state.js";
import { sessionSwitchView } from "../pages/session.js";

// ── Helpers ───────────────────────────────────────────────────
const BAR_COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe"];

function statusBadge(status) {
  const map = {
    "Pending":      "mod-badge-pending",
    "Under Review": "mod-badge-review",
    "under_review": "mod-badge-review",
    "Answering":    "mod-badge-review",
    "Answered":     "mod-badge-answered",
    "Deferred":     "mod-badge-deferred",
    "Flagged":      "mod-badge-flagged",
  };
  return `<span class="mod-badge ${map[status] || "mod-badge-pending"}">${status}</span>`;
}

function relScore(score) {
  const pct = Math.round((score || 0) * 100);
  return `<div class="mod-score-bar"><div class="mod-score-fill" style="width:${pct}%"></div></div>`;
}

// ── SessionOverviewCards ──────────────────────────────────────
function renderOverviewCards(stats) {
  const cards = [
    { icon: icons.messageCircle, label: "Questions",    value: stats.questionsCount,   color: "#6366f1", bg: "#eef2ff" },
    { icon: icons.users,         label: "Participants", value: stats.participantsCount, color: "#8b5cf6", bg: "#f5f3ff" },
    { icon: icons.thumbsUp,      label: "Upvotes",      value: stats.upvotesCount,      color: "#10b981", bg: "#ecfdf5" },
    { icon: icons.activity,      label: "Avg Latency",  value: stats.avgLatency || "38ms", color: "#f59e0b", bg: "#fffbeb" },
  ];
  return `
    <div class="mod-stat-grid">
      ${cards.map(c => `
        <div class="mod-stat-card">
          <div class="mod-stat-icon" style="background:${c.bg};color:${c.color}">${c.icon}</div>
          <div class="mod-stat-body">
            <span class="mod-stat-value">${c.value}</span>
            <span class="mod-stat-label">${c.label}</span>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

// ── RankedQuestionQueue ───────────────────────────────────────
function renderQuestionQueue(questions, search = "", sortBy = "score") {
  let filtered = questions;
  if (search) {
    const q = search.toLowerCase();
    filtered = questions.filter(x => x.text.toLowerCase().includes(q));
  }
  if (sortBy === "votes") filtered = [...filtered].sort((a, b) => b.votes - a.votes);
  else if (sortBy === "time") filtered = [...filtered].sort((a, b) => a.asked < b.asked ? -1 : 1);

  return `
    <div class="mod-panel">
      <div class="mod-panel-header">
        <div class="mod-panel-title">
          ${icons.filter}
          <h2>Question Queue</h2>
          <span class="mod-count-badge">${filtered.length}</span>
        </div>
        <div class="mod-queue-controls">
          <div class="mod-search-wrap">
            ${icons.search}
            <input id="modQueueSearch" class="mod-search" type="search" placeholder="Search questions…"
              value="${search}" oninput="moderatorSearchQuestions(this.value)">
          </div>
          <select class="mod-sort-select" onchange="moderatorSortQueue(this.value)">
            <option value="score"  ${sortBy === "score"  ? "selected" : ""}>By Score</option>
            <option value="votes"  ${sortBy === "votes"  ? "selected" : ""}>By Votes</option>
            <option value="time"   ${sortBy === "time"   ? "selected" : ""}>By Time</option>
          </select>
        </div>
      </div>

      <div class="mod-queue-table-wrap">
        <table class="mod-queue-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Question</th>
              <th>Votes</th>
              <th>Score</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.length === 0 ? `
              <tr><td colspan="6">
                <div class="mod-empty-state">
                  <div class="mod-empty-icon">${icons.messageCircle}</div>
                  <p>No questions yet. Open up the floor!</p>
                  <button class="mod-outline-btn" onclick="moderatorTogglePause()">Resume Questions</button>
                </div>
              </td></tr>
            ` : ""}
            ${filtered.map((q, i) => `
              <tr class="mod-queue-row ${q.status === "under_review" ? "mod-row-active" : ""}">
                <td class="mod-rank-cell"><div class="mod-rank">${i + 1}</div></td>
                <td class="mod-question-cell">
                  <p class="mod-question-text">${q.text}</p>
                  <div class="mod-question-meta">
                    ${icons.clock} ${q.asked}
                    &nbsp;·&nbsp;
                    ${icons.users} ${q.similar || 0} similar
                    ${q.askedBy ? `&nbsp;·&nbsp; by ${q.askedBy}` : ""}
                  </div>
                </td>
                <td>
                  <span class="mod-votes">${icons.thumbsUp} ${q.votes}</span>
                </td>
                <td>
                  <div class="mod-score-cell">
                    ${relScore(q.score)}
                    <span class="mod-score-num">${Math.round((q.score || 0) * 100)}</span>
                  </div>
                </td>
                <td>${statusBadge(q.status)}</td>
                <td class="mod-actions-cell">
                  <button class="mod-action-btn mod-btn-answer"
                    onclick="moderatorAnswerQuestion('${q.id}')"
                    title="Mark this question as answered"
                    ${q.status === "Answered" ? "disabled" : ""}>
                    ${icons.check} Answer
                  </button>
                  <button class="mod-action-btn mod-btn-answering"
                    onclick="moderatorMarkAnswering('${q.id}')"
                    title="Mark as currently answering"
                    ${q.status === "Answered" || q.status === "Answering" ? "disabled" : ""}>
                    ▶ Answering
                  </button>
                  <button class="mod-action-btn mod-btn-defer"
                    onclick="moderatorDeferQuestion('${q.id}')"
                    ${q.status === "Answered" ? "disabled" : ""}>
                    ${icons.skipForward} Defer
                  </button>
                  <button class="mod-action-btn mod-btn-more"
                    onclick="moderatorShowQuestionMenu('${q.id}', this)">
                    ${icons.moreVertical}
                  </button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

      // ── BAR_COLORS per option (matches the image: blue, blue, green, yellow) ──
const POLL_BAR_COLORS = ["#4f46e5", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

// ── ActivePollsPanel ──────────────────────────────────────────
function renderPollsPanel(poll, allPolls = []) {
  const historyPolls = allPolls.filter(p => !p.active);

  const historyTable = `
    <div class="mod-panel" style="margin-top:16px">
      <div class="mod-panel-header">
        <div class="mod-panel-title">${icons.barChart}<h2>Poll History</h2></div>
      </div>
      ${historyPolls.length === 0 ? `
        <p class="mod-poll-history-empty">No previous polls yet.</p>
      ` : `
        <div class="mod-poll-history-table-wrap">
          <table class="mod-poll-history-table">
            <thead>
              <tr>
                <th>Poll Question</th>
                <th>Type</th>
                <th>Responses</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${historyPolls.map(p => `
                <tr>
                  <td class="mod-ph-question">${p.question}</td>
                  <td class="mod-ph-type">Multiple Choice</td>
                  <td class="mod-ph-resp">${p.totalVotes || 0}</td>
                  <td><span class="mod-ph-status ${p.active ? "live" : "done"}">${p.active ? "Live" : "Completed"}</span></td>
                  <td><button class="mod-ph-action-btn" onclick="moderatorViewPollResults('${p.id}')">View Results</button></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `}
      <div class="mod-poll-create-row">
        <button class="mod-poll-create-btn" onclick="moderatorCreatePoll()">
          ${icons.plus || "+"} &nbsp;Create New Poll
        </button>
      </div>
    </div>
  `;

  if (!poll) {
    return `
      <div class="mod-panel">
        <div class="mod-panel-header">
          <div class="mod-panel-title">${icons.barChart}<h2>Active Poll</h2></div>
        </div>
        <div class="mod-empty-state">
          <div class="mod-empty-icon">${icons.barChart}</div>
          <p>No active poll right now.</p>
          <button class="mod-poll-create-btn" onclick="moderatorCreatePoll()" style="margin-top:12px">
            ${icons.plus || "+"} &nbsp;Create New Poll
          </button>
        </div>
      </div>
      ${historyTable}
    `;
  }

  const endsInMs  = (poll.endsAt || 0) - Date.now();
  const endsInSec = Math.max(0, Math.floor(endsInMs / 1000));
  const timerMM   = String(Math.floor(endsInSec / 60)).padStart(2, "0");
  const timerSS   = String(endsInSec % 60).padStart(2, "0");
  const total      = Math.max(1, poll.totalVotes || 0);

  return `
    <div class="mod-panel mod-active-poll-panel">
      <!-- Active Poll Header -->
      <div class="mod-ap-top-badge">${icons.barChart} Active Poll</div>

      <div class="mod-ap-title-row">
        <h2 class="mod-ap-question">${poll.question}</h2>
        <div class="mod-ap-timer-block">
          <span class="mod-ap-timer-value" id="mod-poll-timer-val">${timerMM}:${timerSS}</span>
          <span class="mod-ap-timer-label">Time Left</span>
          <button class="mod-ap-end-btn" onclick="moderatorEndPoll('${poll.id}')">
            ${icons.square || "◼"} End Poll
          </button>
        </div>
      </div>

      <!-- Metadata row -->
      <div class="mod-ap-meta-row">
        <span class="mod-ap-meta-chip">${icons.checkSquare || "☑"} Multiple Choice</span>
        <span class="mod-ap-meta-chip">${icons.users} ${poll.totalVotes || 0} responses</span>
        <span class="mod-ap-live-chip">Live</span>
      </div>

      <!-- Result bars -->
      <div class="mod-ap-bars">
        ${poll.options.map((opt, i) => {
          const pct   = Math.round(((opt.votes || 0) / total) * 100);
          const color = POLL_BAR_COLORS[i % POLL_BAR_COLORS.length];
          return `
            <div class="mod-ap-bar-row">
              <div class="mod-ap-bar-num" style="background:${color}">${i + 1}</div>
              <div class="mod-ap-bar-body">
                <div class="mod-ap-bar-label">${opt.label}</div>
                <div class="mod-ap-bar-track">
                  <div class="mod-ap-bar-fill" style="width:${pct}%;background:${color}"></div>
                </div>
              </div>
              <div class="mod-ap-bar-stats">
                <span class="mod-ap-bar-votes">${opt.votes || 0} votes</span>
                <span class="mod-ap-bar-pct" style="color:${color}">${pct}%</span>
              </div>
            </div>
          `;
        }).join("")}
      </div>

      <!-- Footer -->
      <div class="mod-ap-footer">
        <span class="mod-ap-footer-note">${icons.info || "ⓘ"} You can download the results after the poll ends.</span>
        <button class="mod-ap-download-btn" onclick="moderatorDownloadPollResults('${poll.id}')">
          ${icons.download || "↓"} Download Results
        </button>
      </div>
    </div>
    ${historyTable}
  `;
}

// ── RecentActivityFeed ────────────────────────────────────────
const ACTIVITY_ICONS = {
  question: icons.messageCircle,
  upvote:   icons.thumbsUp,
  assign:   icons.mic,
  answered: icons.checkCircle,
  join:     icons.users,
  poll:     icons.barChart,
  system:   icons.zap,
};
const ACTIVITY_COLORS = {
  question: "#6366f1", upvote: "#10b981", assign: "#f59e0b",
  answered: "#10b981", join: "#8b5cf6", poll: "#3b82f6", system: "#6b7280",
};

function renderActivityFeed(feed) {
  return `
    <div class="mod-panel">
      <div class="mod-panel-header">
        <div class="mod-panel-title">${icons.activity}<h2>Recent Activity</h2></div>
      </div>
      <div class="mod-activity-list">
        ${feed.length === 0 ? `<p class="mod-empty">No activity yet.</p>` : ""}
        ${feed.slice(0, 20).map(entry => `
          <div class="mod-activity-entry">
            <div class="mod-activity-dot" style="background:${ACTIVITY_COLORS[entry.type] || "#6b7280"}">
              ${ACTIVITY_ICONS[entry.type] || icons.info}
            </div>
            <div class="mod-activity-body">
              <p>${entry.text}</p>
              <span class="mod-activity-time">${entry.time}</span>
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

// ── SessionHealthPanel ────────────────────────────────────────
function renderHealthPanel(health) {
  const indicators = [
    { label: "Connection",    value: health.connection,   ok: health.connection === "connected" },
    { label: "Sync",          value: health.sync,         ok: health.sync === "synced" },
    { label: "Response Time", value: health.responseTime || "38ms", ok: true },
    { label: "AI Processing", value: health.aiProcessing, ok: health.aiProcessing === "active" },
  ];
  return `
    <div class="mod-panel">
      <div class="mod-panel-header">
        <div class="mod-panel-title">${icons.zap}<h2>Session Health</h2></div>
      </div>
      <div class="mod-health-grid">
        ${indicators.map(ind => `
          <div class="mod-health-item">
            <span class="mod-health-dot ${ind.ok ? "mod-health-ok" : "mod-health-err"}"></span>
            <div>
              <span class="mod-health-label">${ind.label}</span>
              <span class="mod-health-value">${ind.value}</span>
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

// ── ParticipantsPanel — click any person to make them speaker ─
function renderParticipantsPanel(participants, currentSpeakerId) {
  // Use only real participants from the live session — no fake fallbacks
  const list = participants || [];

  const currentSpk = list.find(p => p.id === currentSpeakerId);

  return `
    <div class="mod-panel">
      <div class="mod-panel-header">
        <div class="mod-panel-title">${icons.users}<h2>Participants</h2></div>
        <span class="mod-count-badge">${list.length}</span>
      </div>

      ${currentSpk ? `
        <div class="mod-current-speaker-banner">
          <span class="mod-spk-dot">${icons.mic}</span>
          <div>
            <span class="mod-spk-banner-label">Current Speaker</span>
            <span class="mod-spk-banner-name">${currentSpk.name}</span>
          </div>
          <button class="mod-remove-spk-btn" onclick="moderatorMakeSpeaker(null, null, null)">
            ${icons.arrowLeft} Remove
          </button>
        </div>
      ` : list.length > 0 ? `
        <p class="mod-participants-hint">
          ${icons.info} Click <strong>Make Speaker</strong> to assign someone
        </p>
      ` : ""}

      <div class="mod-participants-list">
        ${list.length === 0 ? `
          <div style="text-align:center;padding:32px 16px;color:var(--muted)">
            <div style="font-size:32px;margin-bottom:10px">👥</div>
            <p style="font-weight:600;color:#374151;margin:0 0 4px">No participants yet</p>
            <p style="font-size:12px;margin:0">Share the meeting link to invite people</p>
          </div>
        ` : list.map((p, i) => {
          const isSpk = p.id === currentSpeakerId;
          return `
            <div class="mod-participant-row ${isSpk ? "mod-participant-speaker" : ""}"
              onclick="moderatorMakeSpeaker('${p.id}', '${p.name}', '${p.initials}')">
              <span class="mod-contributor-rank">${i + 1}</span>
              <div class="mod-contributor-avatar"
                style="${isSpk ? "background:linear-gradient(135deg,#6366f1,#8b5cf6);" : ""}">
                ${p.initials}
              </div>
              <div class="mod-contributor-info">
                <span class="mod-contributor-name">
                  ${p.name}
                  ${isSpk ? `<span class="mod-spk-inline-badge">${icons.mic} Speaking</span>` : ""}
                </span>
                <span class="mod-contributor-meta">${p.upvotes || 0} upvotes · ${p.questionsCount || p.questions || 0} questions</span>
              </div>
              <button class="mod-make-speaker-btn ${isSpk ? "mod-make-speaker-active" : ""}">
                ${isSpk ? `${icons.mic} Speaking` : `${icons.mic} Make Speaker`}
              </button>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

// ── QuickActionsPanel ─────────────────────────────────────────
function renderQuickActions(isPaused) {
  return `
    <div class="mod-panel mod-quick-actions">
      <div class="mod-panel-header">
        <div class="mod-panel-title">${icons.zap}<h2>Quick Actions</h2></div>
      </div>
      <div class="mod-actions-grid">
        <button class="mod-qa-btn mod-qa-primary" onclick="moderatorBroadcastAnnouncement()">
          ${icons.send}
          <span>Broadcast</span>
        </button>
        <button class="mod-qa-btn ${isPaused ? "mod-qa-warning" : "mod-qa-secondary"}" onclick="moderatorTogglePause()">
          ${isPaused ? icons.skipForward : icons.pause}
          <span>${isPaused ? "Resume Qs" : "Pause Qs"}</span>
        </button>
        <button class="mod-qa-btn mod-qa-secondary" onclick="moderatorClearAnswered()">
          ${icons.checkCircle}
          <span>Clear Done</span>
        </button>
        <button class="mod-qa-btn mod-qa-danger" onclick="moderatorEndSession()">
          ${icons.flag}
          <span>End Session</span>
        </button>
      </div>
    </div>
  `;
}

// ── SpeakerPickerModal (triggered by "Answer" on a question) ──
function renderSpeakerPickerModal(questionId) {
  const ss = getSessionState();
  // Only show real participants — no fake fallbacks
  const candidates = ss.participants || [];

  return `
    <div class="mod-modal-overlay" id="speakerPickerModal" onclick="moderatorCloseModal(event)">
      <div class="mod-modal">
        <div class="mod-modal-header">
          <h3>Select Speaker</h3>
          <button class="mod-modal-close" onclick="moderatorCloseModal()">${icons.arrowLeft}</button>
        </div>
        <p class="mod-modal-sub">Pick who answers this question. They'll be switched to Speaker view.</p>
        <div class="mod-speaker-list">
          ${candidates.length === 0 ? `
            <div style="text-align:center;padding:24px 16px;color:var(--muted)">
              <div style="font-size:28px;margin-bottom:8px">👥</div>
              <p style="font-weight:600;color:#374151;margin:0 0 4px">No participants in session</p>
              <p style="font-size:12px;margin:0">Participants will appear here once they join</p>
            </div>
          ` : candidates.map(p => `
            <button class="mod-speaker-option"
              onclick="moderatorConfirmAssign('${questionId}', '${p.id}', '${p.name}', '${p.initials}')">
              <div class="mod-contributor-avatar">${p.initials}</div>
              <span>${p.name}</span>
              ${icons.chevronRight}
            </button>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

// ── Main Render ───────────────────────────────────────────────
let _unsubscribe = null;
let _searchTerm  = "";
let _sortBy      = "score";
let _currentSpeakerId   = null;
let _currentSpeakerName = null;
let _modAdminAnnouncement = null;
let _modAnnouncementListenerAttached = false;

function _modRenderAdminBanner() {
  if (!_modAdminAnnouncement) return "";
  const { subject, body, senderName } = _modAdminAnnouncement;
  return `
    <div class="cv-admin-announcement" role="alert" aria-live="assertive" id="cvAdminAnnouncement" style="margin-bottom:12px">
      <span class="cv-admin-announce-icon">📢</span>
      <div class="cv-admin-announce-body">
        <strong class="cv-admin-announce-subject">${subject || "Announcement"}</strong>
        ${body ? `<span class="cv-admin-announce-text">${body}</span>` : ""}
        ${senderName ? `<span class="cv-admin-announce-from">— ${senderName}</span>` : ""}
      </div>
      <button class="cv-admin-announce-dismiss" onclick="(function(){window._cvDismissAnnouncement&&window._cvDismissAnnouncement()})()" title="Dismiss">✕</button>
    </div>
  `;
}

export function renderModeratorView(container) {
  const ss = getSessionState();
  if (ss.questions.length === 0) {
    const mid = state.session?.sessionId || "";
    fetch(`/api/session/live${mid ? `?meetingId=${mid}` : ""}`)
      .then(r => r.json())
      .then(data => dispatch({ type: "SESSION_LOADED", payload: data }));
  }

  // Register live admin announcement listener once per view mount
  if (!_modAnnouncementListenerAttached) {
    _modAnnouncementListenerAttached = true;
    document.addEventListener("cv:meeting_announcement", (e) => {
      _modAdminAnnouncement = e.detail;
      const existing = document.getElementById("cvAdminAnnouncement");
      const bannerHtml = _modRenderAdminBanner();
      if (existing) {
        existing.outerHTML = bannerHtml;
      } else {
        const sessionRoot = document.querySelector("#sessionViewContent");
        if (sessionRoot) sessionRoot.insertAdjacentHTML("afterbegin", bannerHtml);
      }
      window._cvDismissAnnouncement = () => {
        _modAdminAnnouncement = null;
        document.getElementById("cvAdminAnnouncement")?.remove();
      };
    });
  }

  if (_unsubscribe) _unsubscribe();
  _unsubscribe = subscribe((state) => paintModeratorView(container, state));
  paintModeratorView(container, ss);
}

function paintModeratorView(container, state) {
  const ranked = selectRankedQuestions(state);
  const poll   = selectActivePoll(state);

  container.innerHTML = `
    <!-- Session Header -->
    <div class="mod-header">
      <div class="mod-header-left">
        <h1 class="mod-page-title">Moderator Control</h1>
        <p class="mod-page-sub">${state.joinTarget?.title || "Live Session"}</p>
      </div>
      <div class="mod-header-right">
        <span class="mod-live-badge">
          <span class="mod-live-dot"></span> Live · ${formatTimer(state.sessionTimer)}
        </span>
        ${state.isQuestionsPaused ? `<span class="mod-pause-badge">${icons.pause} Paused</span>` : ""}
        ${_currentSpeakerName ? `
          <span class="mod-spk-header-badge">
            ${icons.mic} ${_currentSpeakerName} speaking
          </span>
        ` : ""}
      </div>
    </div>

    <!-- Stats Row -->
    ${renderOverviewCards(state.stats)}

    <!-- Main Grid -->
    <div class="mod-main-grid">
      <!-- Left column: queue + polls -->
      <div class="mod-left-col">
        ${renderQuestionQueue(ranked, _searchTerm, _sortBy)}
        ${renderPollsPanel(poll, state.polls || [])}
      </div>

      <!-- Right column: quick actions + participants + health + activity -->
      <div class="mod-right-col">
        ${renderQuickActions(state.isQuestionsPaused)}
        ${renderParticipantsPanel(state.participants, _currentSpeakerId)}
        ${renderHealthPanel(state.healthStatus)}
        ${renderActivityFeed(state.activityFeed)}
      </div>
    </div>
  `;
}

export function teardownModeratorView() {
  if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
  _modAdminAnnouncement = null;
  _modAnnouncementListenerAttached = false;
}

// ── Global Handlers ───────────────────────────────────────────
export function moderatorSearchQuestions(val) {
  _searchTerm = val;
  const container = document.querySelector("#sessionViewContent");
  const ss = getSessionState();
  if (container) paintModeratorView(container, ss);
}

export function moderatorSortQueue(val) {
  _sortBy = val;
  const container = document.querySelector("#sessionViewContent");
  const ss = getSessionState();
  if (container) paintModeratorView(container, ss);
}

export function moderatorAssignQuestion(questionId) {
  const existing = document.querySelector("#speakerPickerModal");
  if (existing) existing.remove();
  document.body.insertAdjacentHTML("beforeend", renderSpeakerPickerModal(questionId));
}

export function moderatorConfirmAssign(questionId, speakerId, speakerName, initials) {
  const meetingId = state.session?.sessionId || "m_ai_education";
  // Emit via WebSocket — server updates status + broadcasts to all tabs
  const socket = getSocket();
  socket.emit("mark_answered", { meetingId, questionId }); // not answer — just assign (use REST for assign)
  fetch(`/api/questions/${questionId}/assign?meetingId=${meetingId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ speakerId })
  }).then(r => r.json()).then(() => {
    dispatch({ type: "QUESTION_ASSIGNED", payload: { questionId, speakerId } });
    moderatorCloseModal();
    // Promote the assigned participant to speaker role
    moderatorMakeSpeaker(speakerId, speakerName, initials);
  });
}

export function moderatorCloseModal(e) {
  if (e && e.target !== document.querySelector("#speakerPickerModal")) return;
  document.querySelector("#speakerPickerModal")?.remove();
}

export function moderatorDeferQuestion(id) {
  const meetingId = state.session?.sessionId || "m_ai_education";
  // Phase 4: emit via WebSocket — reaches all connected tabs
  getSocket().emit("mark_deferred", { meetingId, questionId: id });
  dispatch({ type: "QUESTION_STATUS", payload: { id, status: "Deferred" } });
}

export function moderatorShowQuestionMenu(id, btn) {
  const existing = document.querySelector(".mod-ctx-menu");
  if (existing) existing.remove();
  const menu = document.createElement("div");
  menu.className = "mod-ctx-menu";
  menu.innerHTML = `
    <button onclick="moderatorFlagQuestion('${id}')"><span>${icons.flag}</span> Flag</button>
    <button onclick="moderatorAnswerQuestion('${id}')"><span>${icons.check}</span> Mark Answered</button>
    <button onclick="window.go('/question/${id}')"><span>${icons.eye}</span> View Details</button>
  `;
  const rect = btn.getBoundingClientRect();
  menu.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${rect.left - 80}px;z-index:9999`;
  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener("click", () => menu.remove(), { once: true }), 0);
}

export function moderatorFlagQuestion(id) {
  const meetingId = state.session?.sessionId || "m_ai_education";
  getSocket().emit("mark_flagged", { meetingId, questionId: id });
  dispatch({ type: "QUESTION_STATUS", payload: { id, status: "Flagged" } });
}

export function moderatorAnswerQuestion(id) {
  const meetingId = state.session?.sessionId || "m_ai_education";
  // Phase 4: emit via WebSocket — server broadcasts to all tabs, re-scores
  getSocket().emit("mark_answered", { meetingId, questionId: id });
  dispatch({ type: "QUESTION_ANSWERED", payload: { id } });
}

export function moderatorTogglePause() {
  const ss = getSessionState();
  dispatch({ type: "QUESTIONS_PAUSED", payload: !ss.isQuestionsPaused });
}

export function moderatorClearAnswered() {
  dispatch({ type: "CLEAR_ANSWERED" });
}

export async function moderatorBroadcastAnnouncement() {
  const msg = prompt("Enter announcement message:");
  if (!msg) return;
  await fetch("/api/announcements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: msg })
  });
  dispatch({ type: "QUESTION_ADDED", payload: { id: `ann_${Date.now()}`, type: "announcement", text: `📢 ${msg}` } });
}

/* ── Poll management handlers ─────────────────────────────────
   moderatorCreatePoll  — opens the create-poll modal overlay
   moderatorEndPoll     — ends the active poll immediately
   moderatorDownloadPollResults — downloads CSV of results
   moderatorViewPollResults     — shows a result breakdown overlay
   ──────────────────────────────────────────────────────────── */

export function moderatorCreatePoll() {
  // Remove stale modal if any
  document.getElementById("mod-create-poll-modal")?.remove();

  const overlay = document.createElement("div");
  overlay.id = "mod-create-poll-modal";
  overlay.className = "mod-modal-overlay";
  overlay.innerHTML = `
    <div class="mod-modal-box" id="mod-create-poll-box">
      <div class="mod-modal-header">
        <h2 class="mod-modal-title">Create New Poll</h2>
        <button class="mod-modal-close" onclick="document.getElementById('mod-create-poll-modal').remove()">&times;</button>
      </div>

      <div class="mod-modal-body">
        <label class="mod-modal-label">Poll Question <span style="color:#ef4444">*</span></label>
        <input id="mod-poll-question" class="mod-modal-input"
          placeholder="e.g. Which topic would you like us to cover next?" maxlength="200" />

        <label class="mod-modal-label" style="margin-top:18px">Options <span style="color:#ef4444">*</span>
          <span style="font-weight:400;font-size:12px;color:#6b7280">(min 2, max 6)</span>
        </label>
        <div id="mod-poll-options-list" class="mod-poll-options-list">
          <div class="mod-poll-option-row">
            <span class="mod-poll-opt-num" style="background:#4f46e5">1</span>
            <input class="mod-modal-input mod-poll-opt-input" placeholder="Option 1" />
          </div>
          <div class="mod-poll-option-row">
            <span class="mod-poll-opt-num" style="background:#3b82f6">2</span>
            <input class="mod-modal-input mod-poll-opt-input" placeholder="Option 2" />
          </div>
        </div>
        <button class="mod-add-option-btn" id="mod-add-option-btn"
          onclick="_modAddPollOption()">
          + Add Option
        </button>

        <label class="mod-modal-label" style="margin-top:18px">Duration</label>
        <div class="mod-poll-duration-row">
          <button class="mod-dur-btn active" data-dur="300" onclick="_modSetDuration(this, 300)">5 min</button>
          <button class="mod-dur-btn" data-dur="600" onclick="_modSetDuration(this, 600)">10 min</button>
          <button class="mod-dur-btn" data-dur="900" onclick="_modSetDuration(this, 900)">15 min</button>
          <button class="mod-dur-btn" data-dur="1800" onclick="_modSetDuration(this, 1800)">30 min</button>
        </div>
        <input type="hidden" id="mod-poll-duration" value="300" />
      </div>

      <div class="mod-modal-footer">
        <button class="mod-modal-cancel-btn" onclick="document.getElementById('mod-create-poll-modal').remove()">Cancel</button>
        <button class="mod-modal-submit-btn" onclick="_modSubmitPoll()">Launch Poll</button>
      </div>
    </div>
  `;

  // Close on backdrop click
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("visible"));
  document.getElementById("mod-poll-question")?.focus();
}

// ── Internal helpers (not exported) ───────────────────────────
const _POLL_OPT_COLORS = ["#4f46e5","#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6"];

window._modAddPollOption = function() {
  const list = document.getElementById("mod-poll-options-list");
  if (!list) return;
  const count = list.querySelectorAll(".mod-poll-option-row").length;
  if (count >= 6) return;
  const row = document.createElement("div");
  row.className = "mod-poll-option-row";
  const color = _POLL_OPT_COLORS[count % _POLL_OPT_COLORS.length];
  row.innerHTML = `
    <span class="mod-poll-opt-num" style="background:${color}">${count + 1}</span>
    <input class="mod-modal-input mod-poll-opt-input" placeholder="Option ${count + 1}" />
    <button class="mod-poll-opt-remove" onclick="this.parentElement.remove(); _modRenumberOptions()">&times;</button>
  `;
  list.appendChild(row);
  if (count + 1 >= 6) document.getElementById("mod-add-option-btn").disabled = true;
  row.querySelector("input")?.focus();
};

window._modRenumberOptions = function() {
  const rows = document.querySelectorAll(".mod-poll-option-row");
  rows.forEach((r, i) => {
    const badge = r.querySelector(".mod-poll-opt-num");
    const input = r.querySelector("input");
    if (badge) { badge.textContent = i + 1; badge.style.background = _POLL_OPT_COLORS[i % _POLL_OPT_COLORS.length]; }
    if (input) input.placeholder = `Option ${i + 1}`;
  });
  const addBtn = document.getElementById("mod-add-option-btn");
  if (addBtn) addBtn.disabled = rows.length >= 6;
};

window._modSetDuration = function(btn, secs) {
  document.querySelectorAll(".mod-dur-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  const inp = document.getElementById("mod-poll-duration");
  if (inp) inp.value = secs;
};

window._modSubmitPoll = async function() {
  const question = document.getElementById("mod-poll-question")?.value.trim();
  if (!question) {
    document.getElementById("mod-poll-question")?.classList.add("mod-input-error");
    return;
  }
  const options = [...document.querySelectorAll(".mod-poll-opt-input")]
    .map(i => i.value.trim()).filter(Boolean);
  if (options.length < 2) { alert("Please add at least 2 options."); return; }

  const durSecs = parseInt(document.getElementById("mod-poll-duration")?.value || "300", 10);
  const endsAt  = Date.now() + durSecs * 1000;
  const meetingId = state.session?.sessionId;

  const submitBtn = document.querySelector(".mod-modal-submit-btn");
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Launching…"; }

  try {
    const res = await fetch("/api/polls", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}) },
      body: JSON.stringify({ question, options, endsAt, meetingId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed");
    dispatch({ type: "POLL_CREATED", payload: data.poll });
    document.getElementById("mod-create-poll-modal")?.remove();
  } catch(e) {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Launch Poll"; }
    alert("Error: " + e.message);
  }
};

export async function moderatorEndPoll(pollId) {
  if (!pollId) return;
  try {
    await fetch(`/api/polls/${pollId}/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}) }
    });
    dispatch({ type: "POLL_UPDATED", payload: { id: pollId, active: false } });
  } catch(e) {
    console.warn("[moderatorEndPoll]", e);
  }
}
window.moderatorEndPoll = moderatorEndPoll;

export function moderatorDownloadPollResults(pollId) {
  const ss = getSessionState();
  const poll = ss.polls?.find(p => p.id === pollId);
  if (!poll) { alert("Poll not found."); return; }

  const total = Math.max(1, poll.totalVotes || 0);
  const rows  = [("Option,Votes,Percentage")];
  (poll.options || []).forEach(o => {
    const pct = Math.round(((o.votes || 0) / total) * 100);
    rows.push(`"${o.label}",${o.votes || 0},${pct}%`);
  });
  rows.push(`"TOTAL",${poll.totalVotes || 0},100%`);

  const csv  = rows.join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `poll-results-${pollId}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
window.moderatorDownloadPollResults = moderatorDownloadPollResults;

export function moderatorViewPollResults(pollId) {
  const ss = getSessionState();
  const poll = ss.polls?.find(p => p.id === pollId);
  if (!poll) { alert("Poll not found."); return; }

  document.getElementById("mod-poll-results-modal")?.remove();
  const total = Math.max(1, poll.totalVotes || 0);
  const overlay = document.createElement("div");
  overlay.id = "mod-poll-results-modal";
  overlay.className = "mod-modal-overlay";
  overlay.innerHTML = `
    <div class="mod-modal-box">
      <div class="mod-modal-header">
        <h2 class="mod-modal-title">Poll Results</h2>
        <button class="mod-modal-close" onclick="document.getElementById('mod-poll-results-modal').remove()">&times;</button>
      </div>
      <div class="mod-modal-body">
        <p style="font-size:15px;font-weight:600;color:var(--ink);margin-bottom:16px">${poll.question}</p>
        <div class="mod-ap-bars" style="gap:14px">
          ${(poll.options || []).map((opt, i) => {
            const pct   = Math.round(((opt.votes || 0) / total) * 100);
            const color = _POLL_OPT_COLORS[i % _POLL_OPT_COLORS.length];
            return `
              <div class="mod-ap-bar-row">
                <div class="mod-ap-bar-num" style="background:${color}">${i + 1}</div>
                <div class="mod-ap-bar-body">
                  <div class="mod-ap-bar-label">${opt.label}</div>
                  <div class="mod-ap-bar-track">
                    <div class="mod-ap-bar-fill" style="width:${pct}%;background:${color}"></div>
                  </div>
                </div>
                <div class="mod-ap-bar-stats">
                  <span class="mod-ap-bar-votes">${opt.votes || 0} votes</span>
                  <span class="mod-ap-bar-pct" style="color:${color}">${pct}%</span>
                </div>
              </div>
            `;
          }).join("")}
        </div>
        <p style="margin-top:16px;font-size:12px;color:#6b7280">Total responses: ${poll.totalVotes || 0}</p>
      </div>
      <div class="mod-modal-footer">
        <button class="mod-modal-cancel-btn" onclick="document.getElementById('mod-poll-results-modal').remove()">Close</button>
        <button class="mod-modal-submit-btn" onclick="moderatorDownloadPollResults('${poll.id}')">Download CSV</button>
      </div>
    </div>
  `;
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("visible"));
}
window.moderatorViewPollResults = moderatorViewPollResults;


/**
 * Called when the moderator clicks a participant row or "Make Speaker" button.
 * - Updates local speaker state
 * - Re-renders the right column (participant panel) immediately
 * - Switches the moderator's active tab to "speaker" so they can see the Speaker View
 */
export function moderatorMakeSpeaker(id, name, initials) {
  // Toggle off if clicking same person again
  if (_currentSpeakerId === id) {
    _currentSpeakerId = null;
    _currentSpeakerName = null;
  } else {
    _currentSpeakerId = id;
    _currentSpeakerName = name;
  }

  // Re-render moderator view to update participant panel + header badge
  const container = document.querySelector("#sessionViewContent");
  const ss = getSessionState();
  if (container) paintModeratorView(container, ss);

  // If we just assigned a speaker, switch the moderator's own tab to Speaker View
  if (_currentSpeakerId) {
    setTimeout(() => sessionSwitchView("speaker"), 300);
  }

  // Dispatch to local store
  if (_currentSpeakerId) {
    dispatch({
      type: "SPEAKER_ASSIGNED",
      payload: { speakerId: id, speakerName: name, speakerInitials: initials }
    });
  }

  // Phase 4: emit speaker_invite so the TARGET participant receives an invite popup.
  // The server routes the invite to the correct WS connection by participantId (DB id).
  if (_currentSpeakerId) {
    const meetingId = state.session?.sessionId || "m_ai_education";
    getSocket().emit("speaker_invite", {
      meetingId,
      participantId: _currentSpeakerId,
      speakerName:   _currentSpeakerName
    });
  }
}

/** End the session: PATCH status → conducted, then navigate to session report */
export async function moderatorEndSession() {
  const meetingId = state.session?.sessionId;

  // Snapshot stats & stop timer
  const { getSessionState: getSS, selectRankedQuestions: rankQ, stopSessionTimer } = await import("../store/SessionStore.js");
  stopSessionTimer();
  const snap = getSS();
  state._reportData = {
    title:        state.joinTarget?.title || "Session Report",
    participants: snap.stats.participantsCount || 0,
    questions:    snap.stats.questionsCount    || 0,
    upvotes:      snap.stats.upvotesCount      || 0,
    answers:      rankQ(snap).filter(q => q.status === "Answered").length,
    durationSecs: snap.sessionTimer || 0,
    aiSummary:    state.sessionAnalytics?.analytics?.aiSummary || "",
  };

  // Optimistically mark conducted in local list (Past tab shows it immediately)
  if (meetingId && Array.isArray(state.meetings)) {
    const idx = state.meetings.findIndex(m => m.id === meetingId || m._id === meetingId);
    if (idx !== -1) state.meetings[idx] = { ...state.meetings[idx], status: "conducted" };
  }

  // Persist to backend and broadcast to all participants
  if (meetingId) {
    fetch(`/api/sessions/${meetingId}/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}) },
    }).catch(() => {}); // fire-and-forget; WS broadcast happens server-side
  }
  go('/report');
}



/** Go live: PATCH status → live (called before entering /moderator) */
export async function moderatorGoLive(meetingId) {
  if (!meetingId) return;
  try {
    await fetch(`/api/meetings/${meetingId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}) },
      body: JSON.stringify({ status: "live" })
    });
  } catch { /* non-fatal */ }
}

/**
 * Moderator marks a question as "Answering" — triggers the spotlight banner
 * on the participant and speaker views via the now_answering WS broadcast.
 */
export function moderatorMarkAnswering(questionId) {
  if (!questionId) return;
  const meetingId = state.session?.sessionId;
  if (!meetingId) return;
  getSocket().emit("mark_answering", { meetingId, questionId });
  dispatch({ type: "QUESTION_STATUS", payload: { id: questionId, status: "Answering" } });
}

