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

// ── Typing throttle state ───────────────────────────────────────
let _lastTypingSent  = 0;           // timestamp of last typing_start emit
const TYPING_THROTTLE_MS = 1500;    // max once per 1.5s

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
          oninput="participantUpdateCharCount(this);participantTypingStart()"
          onblur="participantTypingStop()"
          ${isPaused ? "disabled" : ""}></textarea>
        <div class="ptc-ask-footer">
          <span class="ptc-char-count" id="participantCharCount">0 / 500</span>
          <button class="ptc-submit-btn" data-action="participantSubmitQuestion"
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
          <p class="ptc-poll-thanks"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:13px;height:13px;vertical-align:-1px;margin-right:3px"><polyline points="20 6 9 17 4 12"/></svg>Your vote was recorded &middot; ${poll.totalVotes} total votes</p>
        </div>
      ` : `
        <!-- Voting view -->
        <div class="ptc-poll-options" role="radiogroup">
          ${poll.options.map(opt => `
            <button class="ptc-poll-option" data-action="participantVotePoll" data-poll="${poll.id}" data-opt="${opt.id}"
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

// ── QuestionFeed ───────────────────────────────────────
const STATUS_COLORS = {
  "Pending":      { bg: "#f0f4ff", border: "#c7d2fe", text: "#4f46e5" },
  "Under Review": { bg: "#fffbeb", border: "#fde68a", text: "#d97706" },
  "under_review": { bg: "#fffbeb", border: "#fde68a", text: "#d97706" },
  "Answered":     { bg: "#f0fdf4", border: "#bbf7d0", text: "#15803d" },
  "Answering":    { bg: "#eff4ff", border: "#93c5fd", text: "#1d4ed8" },
  "Deferred":     { bg: "#f9fafb", border: "#e5e7eb", text: "#6b7280" },
};

// Render reaction buttons for a question card
function renderReactionBar(q) {
  const rc = q.reactionCounts || {};
  const reactions = [
    { key: "thumbsup", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>` },
    { key: "thinking", svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>` },
    { key: "fire",     svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.66 11.2c-.23-.3-.51-.56-.77-.82-.67-.6-1.43-1.03-2.07-1.66C13.33 7.26 13 4.85 13.95 3c-1 .23-1.97.8-2.72 1.5C9.08 6.16 8 8.56 8 11c-.76-.03-1.48-.3-2.09-.73-.02.28-.03.56-.03.84 0 3.86 2.62 7.1 6.32 7.84C13.4 19.94 14.67 20 16 20c2.2 0 4-1.79 4-4 0-1.04-.42-2.01-1.16-2.72C18.43 12.67 18.08 11.96 17.66 11.2z"/></svg>` }
  ];
  return `
    <div class="ptc-reaction-bar">
      ${reactions.map(e => `
        <button class="ptc-reaction-btn" data-action="participantReact" data-id="${q.id}" data-key="${e.key}"
          title="${e.key}" aria-label="React with ${e.key}">
          ${e.svg}
          ${rc[e.key] ? `<span class="ptc-reaction-count">${rc[e.key]}</span>` : ""}
        </button>
      `).join("")}
    </div>
  `;
}

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
                  data-action="participantUpvote" data-id="${q.id}"
                  title="${voted ? "Remove upvote" : "Upvote this question"}"
                  aria-pressed="${voted}">
                  ${icons.arrowUp}
                  <span id="votes_${q.id}">${votes}</span>
                </button>
                ${renderReactionBar(q)}
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

// ── LiveStatusBar ───────────────────────────────────────
function renderStatusBar(stats, timer, typingCount) {
  const typingText = typingCount === 1
    ? `<span class="ptc-typing-indicator">1 person is typing a question…</span>`
    : typingCount > 1
      ? `<span class="ptc-typing-indicator">${typingCount} people are typing a question…</span>`
      : "";
  return `
    <div class="ptc-status-bar">
      <span>${icons.messageCircle} ${stats.questionsCount || 0} questions</span>
      <span class="ptc-status-divider">·</span>
      <span>${icons.users} ${stats.participantsCount || 0} live</span>
      <span class="ptc-status-divider">·</span>
      <span>${icons.clock} session running ${formatTimer(timer)}</span>
      <span class="ptc-status-live">${icons.radio} Live</span>
      ${typingText}
    </div>
  `;
}

// ── Announcement Banner ────────────────────────────────────────
// Module-level state: last admin announcement received via WS
let _adminAnnouncement = null;
let _announcementListenerAttached = false;

function renderAdminAnnouncementBanner() {
  if (!_adminAnnouncement) return "";
  const { subject, body, senderName } = _adminAnnouncement;
  return `
    <div class="cv-admin-announcement" role="alert" aria-live="assertive" id="cvAdminAnnouncement">
      <span class="cv-admin-announce-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><path d="M22 4L12 14.01l-4-4L1 17"/><path d="M1 12l3 5 5-3"/><path d="M22 4l-1 6-5-1"/></svg></span>
      <div class="cv-admin-announce-body">
        <strong class="cv-admin-announce-subject">${subject || "Announcement"}</strong>
        ${body ? `<span class="cv-admin-announce-text">${body}</span>` : ""}
        ${senderName ? `<span class="cv-admin-announce-from">— ${senderName}</span>` : ""}
      </div>
      <button class="cv-admin-announce-dismiss" data-action="dismissAnnouncement" title="Dismiss">&times;</button>
    </div>
  `;
}

// ── Answering Now Banner ────────────────────────────────
function renderAnsweringBanner(nowAnswering) {
  if (!nowAnswering?.text) return "";
  return `
    <div class="cv-answering-banner" role="status" aria-live="polite">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;flex-shrink:0"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg> <strong>Now answering:</strong> ${nowAnswering.text}
    </div>
  `;
}

// ── Main Render ─────────────────────────────────────────
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

  // Register live admin announcement listener once per view mount.
  // When an admin messages meeting participants, this banner slides in immediately.
  if (!_announcementListenerAttached) {
    _announcementListenerAttached = true;
    document.addEventListener("cv:meeting_announcement", (e) => {
      _adminAnnouncement = e.detail;
      // Inject or replace the banner without re-rendering the whole view
      const existing = document.getElementById("cvAdminAnnouncement");
      const bannerHtml = renderAdminAnnouncementBanner();
      if (existing) {
        existing.outerHTML = bannerHtml;
      } else {
        // Prepend before the first child inside the session container
        const sessionRoot = document.querySelector("#sessionViewContent");
        if (sessionRoot) sessionRoot.insertAdjacentHTML("afterbegin", bannerHtml);
      }
      window._cvDismissAnnouncement = () => {
        _adminAnnouncement = null;
        document.getElementById("cvAdminAnnouncement")?.remove();
      };
    });
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
      ${renderAnsweringBanner(state.nowAnswering)}
      ${renderStatusBar(state.stats, state.sessionTimer, state.typingCount)}
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
  const bannerSlot = container.querySelector(".cv-answering-banner");
  const newBanner  = renderAnsweringBanner(state.nowAnswering);
  if (newBanner && !bannerSlot) {
    container.insertAdjacentHTML("afterbegin", newBanner);
  } else if (!newBanner && bannerSlot) {
    bannerSlot.remove();
  } else if (newBanner && bannerSlot) {
    bannerSlot.outerHTML = newBanner;
  }

  const statusBar = container.querySelector(".ptc-status-bar");
  if (statusBar) statusBar.outerHTML = renderStatusBar(state.stats, state.sessionTimer, state.typingCount);

  const feedSlot = container.querySelector("#ptcFeedSlot");
  if (feedSlot) feedSlot.innerHTML = renderQuestionFeed(ranked, _optimisticUpvotes);

  const pollSlot = container.querySelector("#ptcPollSlot");
  if (pollSlot) pollSlot.innerHTML = renderPollWidget(poll, _votedPollOptions[poll?.id]);
}

export function teardownParticipantView() {
  if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
  // Reset announcement state so it doesn't persist across view switches
  _adminAnnouncement = null;
  _announcementListenerAttached = false;
  _optimisticUpvotes = {};
}

/** Meeting-ended screen — shown to all participants when the host ends the meeting */
function _paintEndedScreen(container) {
  if (!container) return;
  container.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                min-height:60vh;text-align:center;padding:40px;gap:16px">
      <div style="width:72px;height:72px;border-radius:50%;background:#f0fdf4;
                  display:grid;place-items:center">
        <svg viewBox="0 0 24 24" fill="none" stroke="#15803d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:32px;height:32px"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
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

  // Stop typing indicator on submit
  participantTypingStop();

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

// ── Typing indicator emitters ──────────────────────────────────
/** Called on textarea input — throttled to 1 emit per 1.5s */
export function participantTypingStart() {
  const now = Date.now();
  if (now - _lastTypingSent < TYPING_THROTTLE_MS) return;
  _lastTypingSent = now;
  const meetingId = state.session?.sessionId;
  if (!meetingId) return;
  const voterId = state.guestToken || state.currentUserId || "";
  getSocket().emit("typing_start", { meetingId, voterId });
}

/** Called on textarea blur, submit, or clear */
export function participantTypingStop() {
  _lastTypingSent = 0; // reset throttle so next input sends immediately
  const meetingId = state.session?.sessionId;
  if (!meetingId) return;
  const voterId = state.guestToken || state.currentUserId || "";
  getSocket().emit("typing_stop", { meetingId, voterId });
}

// ── Reaction handler ──────────────────────────────────────────
/** Participant reacts to a question with an emoji */
export function participantReact(questionId, emoji) {
  const meetingId = state.session?.sessionId;
  if (!meetingId || !questionId) return;
  getSocket().emit("react", { meetingId, questionId, emoji });
}

