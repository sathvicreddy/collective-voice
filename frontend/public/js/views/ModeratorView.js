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

// ── ActivePollsPanel ──────────────────────────────────────────
function renderPollsPanel(poll) {
  if (!poll) {
    return `
      <div class="mod-panel">
        <div class="mod-panel-header">
          <div class="mod-panel-title">${icons.barChart}<h2>Active Poll</h2></div>
        </div>
        <div class="mod-empty-state">
          <div class="mod-empty-icon">${icons.barChart}</div>
          <p>No active poll right now.</p>
          <button class="mod-outline-btn" onclick="moderatorCreatePoll()">Start a Poll</button>
        </div>
      </div>
    `;
  }

  const endsInMs = (poll.endsAt || 0) - Date.now();
  const endsInSec = Math.max(0, Math.floor(endsInMs / 1000));
  const mm = String(Math.floor(endsInSec / 60)).padStart(2, "0");
  const ss = String(endsInSec % 60).padStart(2, "0");
  const total = poll.totalVotes || 1;

  return `
    <div class="mod-panel">
      <div class="mod-panel-header">
        <div class="mod-panel-title">${icons.barChart}<h2>Active Poll</h2></div>
        <span class="mod-poll-timer">${icons.clock} ends in ${mm}:${ss}</span>
      </div>
      <p class="mod-poll-question">"${poll.question}"</p>
      <div class="mod-poll-bars">
        ${poll.options.map((opt, i) => {
          const pct = Math.round((opt.votes / total) * 100);
          return `
            <div class="mod-poll-row">
              <span class="mod-poll-label">${opt.label}</span>
              <div class="mod-poll-track">
                <div class="mod-poll-fill" style="width:${pct}%;background:${BAR_COLORS[i % BAR_COLORS.length]}"></div>
              </div>
              <span class="mod-poll-pct">${pct}%</span>
            </div>
          `;
        }).join("")}
      </div>
      <span class="mod-poll-votes">${icons.users} ${poll.totalVotes} votes</span>
    </div>
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

export function renderModeratorView(container) {
  const ss = getSessionState();
  if (ss.questions.length === 0) {
    const mid = state.session?.sessionId || "";
    fetch(`/api/session/live${mid ? `?meetingId=${mid}` : ""}`)
      .then(r => r.json())
      .then(data => dispatch({ type: "SESSION_LOADED", payload: data }));
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
        ${renderPollsPanel(poll)}
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

export function moderatorCreatePoll() {
  alert("Poll creation UI — coming soon!");
}

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

  // Phase 4: emit speaker_changed via WebSocket so ALL other tabs receive it too
  const meetingId = state.session?.sessionId || "m_ai_education";
  getSocket().emit("speaker_changed", {
    meetingId,
    speakerId:   _currentSpeakerId,
    speakerName: _currentSpeakerName
  });
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

  // Persist to backend
  if (meetingId) {
    fetch(`/api/meetings/${meetingId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}) },
      body: JSON.stringify({ status: "conducted" })
    }).catch(() => {}); // fire-and-forget
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
