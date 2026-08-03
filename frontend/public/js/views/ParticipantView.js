/* ============================================================
   ParticipantView — Audience-facing live session surface
   Components: AskQuestionForm, QuestionFeed, PollVoteWidget,
               LiveStatusBar
   ============================================================ */
import { icons } from "../utils/icons.js";
import {
  getSessionState, selectRankedQuestions, selectActivePoll,
  dispatch, subscribe, formatTimer
} from "../store/SessionStore.js";
import { getSocket } from "../hooks/socket.js";
import { state } from "../state.js";

// ── AskQuestionForm ───────────────────────────────────────────
function renderAskForm(isPaused) {
  return `
    <div class="ptc-panel ptc-ask-panel">
      <div class="ptc-panel-title">${icons.messageCircle} <h2>Ask a Question</h2></div>
      ${isPaused ? `
        <div class="ptc-paused-notice">
          ${icons.pause} Questions are paused by the moderator.
        </div>
      ` : ""}
      <div class="ptc-ask-form">
        <textarea id="participantQuestionInput" class="ptc-ask-textarea"
          placeholder="What's on your mind? Ask anything…"
          maxlength="500"
          oninput="participantUpdateCharCount(this)"
          ${isPaused ? "disabled" : ""}></textarea>
        <div class="ptc-ask-footer">
          <span class="ptc-char-count" id="participantCharCount">0 / 500</span>
          <button class="ptc-submit-btn" onclick="participantSubmitQuestion()"
            ${isPaused ? "disabled" : ""}>
            ${icons.send} Submit
          </button>
        </div>
      </div>
    </div>
  `;
}

// ── PollVoteWidget ────────────────────────────────────────────
function renderPollWidget(poll, votedOptionId) {
  if (!poll) return "";

  const endsInMs  = Math.max(0, (poll.endsAt || 0) - Date.now());
  const endsInSec = Math.floor(endsInMs / 1000);
  const mm = String(Math.floor(endsInSec / 60)).padStart(2, "0");
  const ss = String(endsInSec % 60).padStart(2, "0");

  return `
    <div class="ptc-panel ptc-poll-panel">
      <div class="ptc-poll-header">
        <span class="ptc-poll-live-badge">${icons.radio} Poll Live</span>
        <span class="ptc-poll-timer">${icons.clock} ${mm}:${ss}</span>
      </div>
      <p class="ptc-poll-question">${poll.question}</p>

      ${votedOptionId ? `
        <!-- Results view after voting -->
        <div class="ptc-poll-results">
          ${poll.options.map((opt, i) => {
            const pct = Math.round((opt.votes / Math.max(1, poll.totalVotes)) * 100);
            return `
              <div class="ptc-poll-result-row ${opt.id === votedOptionId ? "ptc-voted-option" : ""}">
                <span class="ptc-poll-opt-label">${opt.label}</span>
                <div class="ptc-poll-result-track">
                  <div class="ptc-poll-result-fill" style="width:${pct}%"></div>
                </div>
                <span class="ptc-poll-pct">${pct}%</span>
              </div>
            `;
          }).join("")}
          <p class="ptc-poll-thanks">✓ Your vote was recorded · ${poll.totalVotes} total votes</p>
        </div>
      ` : `
        <!-- Voting view -->
        <div class="ptc-poll-options" role="radiogroup">
          ${poll.options.map(opt => `
            <button class="ptc-poll-option" onclick="participantVotePoll('${poll.id}', '${opt.id}')"
              role="radio" aria-checked="false">
              <span class="ptc-poll-radio"></span>
              <span>${opt.label}</span>
            </button>
          `).join("")}
        </div>
      `}
    </div>
  `;
}

// ── QuestionFeed ──────────────────────────────────────────────
const STATUS_COLORS = {
  "Pending":      { bg: "#f0f4ff", border: "#c7d2fe", text: "#4f46e5" },
  "Under Review": { bg: "#fffbeb", border: "#fde68a", text: "#d97706" },
  "under_review": { bg: "#fffbeb", border: "#fde68a", text: "#d97706" },
  "Answered":     { bg: "#f0fdf4", border: "#bbf7d0", text: "#15803d" },
  "Deferred":     { bg: "#f9fafb", border: "#e5e7eb", text: "#6b7280" },
};

/**
 * Determine whether the current user has voted for a given question.
 * Merges the server-authoritative state.myVotes Set with the local optimistic map.
 * The optimistic map may be ahead of the server on the same tick, but server
 * corrections arrive via your_vote_changed and update state.myVotes before
 * the next render.
 */
function isVotedFor(questionId, optimisticUpvotes) {
  // If the optimistic map explicitly set false, that means a pending toggle-off
  if (optimisticUpvotes[questionId] === false) return false;
  // If the optimistic map set true, we're showing a pending toggle-on
  if (optimisticUpvotes[questionId] === true)  return true;
  // Otherwise fall back to server truth
  return state.myVotes.has(questionId);
}

function renderQuestionFeed(questions, optimisticUpvotes = {}) {
  return `
    <div class="ptc-panel ptc-feed-panel">
      <div class="ptc-feed-header">
        <div class="ptc-panel-title">${icons.thumbsUp} <h2>Question Feed</h2></div>
        <span class="ptc-count-badge">${questions.length} questions</span>
      </div>

      <div class="ptc-feed-list">
        ${questions.length === 0 ? `
          <div class="ptc-empty-feed">
            ${icons.messageCircle}
            <p>No questions yet. Be the first to ask!</p>
          </div>
        ` : ""}
        ${questions.map((q, i) => {
          // Use optimistic count if pending, otherwise server count
          const votes  = optimisticUpvotes[q.id] != null
            ? q.votes + (optimisticUpvotes[q.id] === true ? 1 : -1)
            : q.votes;
          const voted  = isVotedFor(q.id, optimisticUpvotes);
          const sc     = STATUS_COLORS[q.status] || STATUS_COLORS["Pending"];
          return `
            <div class="ptc-question-card" style="border-color:${sc.border}">
              <div class="ptc-q-rank">${i + 1}</div>
              <div class="ptc-q-body">
                <p class="ptc-q-text">${q.text}</p>
                <div class="ptc-q-meta">
                  <span>${icons.clock} ${q.asked}</span>
                  <span>${icons.users} ${q.similar || 0} similar</span>
                  <span class="ptc-status-tag" style="background:${sc.bg};color:${sc.text}">${q.status}</span>
                </div>
              </div>
              <div class="ptc-q-actions">
                <button class="ptc-upvote-btn ${voted ? "ptc-upvoted" : ""}"
                  onclick="participantUpvote('${q.id}', this)"
                  title="${voted ? "Remove upvote" : "Upvote this question"}"
                  aria-pressed="${voted}">
                  ${icons.arrowUp}
                  <span id="votes_${q.id}">${votes}</span>
                </button>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

// ── LiveStatusBar ─────────────────────────────────────────────
function renderStatusBar(stats, timer) {
  return `
    <div class="ptc-status-bar">
      <span>${icons.messageCircle} ${stats.questionsCount || 0} questions</span>
      <span class="ptc-status-divider">·</span>
      <span>${icons.users} ${stats.participantsCount || 0} live</span>
      <span class="ptc-status-divider">·</span>
      <span>${icons.clock} session running ${formatTimer(timer)}</span>
      <span class="ptc-status-live">${icons.radio} Live</span>
    </div>
  `;
}

// ── Main Render ───────────────────────────────────────────────
let _unsubscribe = null;
let _optimisticUpvotes = {};
let _votedPollOptions  = {};

export function renderParticipantView(container) {
  const ss = getSessionState();

  // If the meeting is known to be over, show the ended screen immediately.
  if (ss.meetingEnded) {
    _paintEndedScreen(container);
    return;
  }

  // Lazy-load session data if not yet populated
  if (ss.questions.length === 0) {
    const mid = state.session?.sessionId || "";
    if (mid) {
      fetch(`/api/session/live?meetingId=${mid}`)
        .then(r => r.json())
        .then(data => dispatch({ type: "SESSION_LOADED", payload: data }));
    }
  }

  if (_unsubscribe) _unsubscribe();
  _unsubscribe = subscribe((sessionState) => {
    if (sessionState.meetingEnded) {
      _paintEndedScreen(container);
    } else {
      paintParticipantView(container, sessionState);
    }
  });
  paintParticipantView(container, ss);
}

function paintParticipantView(container, state) {
  const ranked = selectRankedQuestions(state);
  const poll   = selectActivePoll(state);

  // Preserve textarea draft while re-rendering
  const existing = container.querySelector("#participantQuestionInput");
  const draft = existing ? existing.value : "";
  const wasPaused = existing ? existing.disabled : false;

  // Only do a full re-render if pause state changed or first render
  if (!existing || wasPaused !== state.isQuestionsPaused) {
    container.innerHTML = `
      ${renderStatusBar(state.stats, state.sessionTimer)}
      <div class="ptc-main-grid">
        <!-- Left: ask + poll -->
        <div class="ptc-left-col">
          ${renderAskForm(state.isQuestionsPaused)}
          <div id="ptcPollSlot">${renderPollWidget(poll, _votedPollOptions[poll?.id])}</div>
        </div>
        <!-- Right: question feed -->
        <div class="ptc-right-col" id="ptcFeedSlot">
          ${renderQuestionFeed(ranked, _optimisticUpvotes)}
        </div>
      </div>
    `;
    // Restore draft
    const inp = container.querySelector("#participantQuestionInput");
    if (inp && draft) { inp.value = draft; inp.dispatchEvent(new Event("input")); }
    return;
  }

  // Partial update: only refresh status bar, feed and poll slot
  const statusBar = container.querySelector(".ptc-status-bar");
  if (statusBar) statusBar.outerHTML = renderStatusBar(state.stats, state.sessionTimer);

  const feedSlot = container.querySelector("#ptcFeedSlot");
  if (feedSlot) feedSlot.innerHTML = renderQuestionFeed(ranked, _optimisticUpvotes);

  const pollSlot = container.querySelector("#ptcPollSlot");
  if (pollSlot) pollSlot.innerHTML = renderPollWidget(poll, _votedPollOptions[poll?.id]);
}

export function teardownParticipantView() {
  if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
  _optimisticUpvotes = {};
}

/** Meeting-ended screen — shown to all participants when the host ends the meeting */
function _paintEndedScreen(container) {
  if (!container) return;
  container.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                min-height:60vh;text-align:center;padding:40px;gap:16px">
      <div style="width:72px;height:72px;border-radius:50%;background:#f0fdf4;
                  display:grid;place-items:center;font-size:32px">🏁</div>
      <h2 style="font-size:22px;font-weight:800;color:var(--ink)">Meeting has ended</h2>
      <p style="color:var(--muted);font-size:14px;max-width:340px">
        The host has ended this session. Thank you for participating!
      </p>
      <p style="color:var(--muted-light);font-size:12px">Redirecting you back in 3 seconds…</p>
    </div>
  `;
  // Redirect to meetings list after 3s
  setTimeout(() => {
    if (window.go) window.go("/meetings");
  }, 3000);
}

// ── Global Handlers ───────────────────────────────────────────
export function participantUpdateCharCount(textarea) {
  const el = document.querySelector("#participantCharCount");
  if (el) el.textContent = `${textarea.value.length} / 500`;
}

export function participantSubmitQuestion() {
  const input = document.querySelector("#participantQuestionInput");
  const text  = input?.value.trim();
  if (!text) return;

  // Optimistic: add to store immediately
  const tempId = `q_opt_${Date.now()}`;
  const tempQ  = {
    id: tempId, text, votes: 1, asked: "Just now",
    score: 0.4, status: "Pending", similar: 1,
    clusterSize: 1, askedBy: "You"
  };
  dispatch({ type: "QUESTION_ADDED", payload: tempQ });
  if (input) input.value = "";

  // Phase 4: emit via WebSocket (server handles NLP + scoring + broadcast)
  const meetingId = state.session?.sessionId;
  if (!meetingId) return;
  const socket = getSocket();
  socket.emit("submit_question", {
    meetingId,
    text,
    askedBy: state.profile?.user?.name || "Anonymous"
  });
  // Server will broadcast questions_reranked → SESSION_LOADED which replaces the optimistic entry
}

export function participantUpvote(id, btn) {
  // Determine current voted state from server truth + any pending optimistic offset
  const currentlyVoted = state.myVotes.has(id);
  // Toggle optimistic state: true = pending vote-on, false = pending vote-off
  _optimisticUpvotes[id] = !currentlyVoted;

  // Update the button appearance optimistically
  const votesEl = document.querySelector(`#votes_${id}`);
  if (votesEl) {
    const delta = _optimisticUpvotes[id] ? 1 : -1;
    votesEl.textContent = Math.max(0, parseInt(votesEl.textContent, 10) + delta);
  }
  if (btn) {
    btn.classList.toggle("ptc-upvoted", _optimisticUpvotes[id]);
    btn.setAttribute("aria-pressed", String(_optimisticUpvotes[id]));
  }

  // Phase 4: emit via WebSocket — server applies toggle logic and echoes your_vote_changed
  const meetingId = state.session?.sessionId;
  if (!meetingId) return;
  const socket = getSocket();
  socket.emit("upvote", { meetingId, questionId: id });
  // Server broadcasts question_upvoted (vote count for all) → QUESTION_UPVOTED dispatch
  // Server privately sends your_vote_changed → updates state.myVotes + clears optimistic
}

export async function participantVotePoll(pollId, optionId) {
  _votedPollOptions[pollId] = optionId;
  try {
    const res  = await fetch(`/api/polls/${pollId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optionId })
    });
    const data = await res.json();
    dispatch({ type: "POLL_UPDATED", payload: data.poll });
  } catch {
    // stay on optimistic vote
    const ss = getSessionState();
    const container = document.querySelector("#sessionViewContent");
    if (container) paintParticipantView(container, ss);
  }
}
