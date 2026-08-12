/* ============================================================
   SessionSocket — Native WebSocket wrapper with auto-reconnect
   Phase 4: handles all new server events, provides emit() for
   client-side writes (submit_question, upvote, mark_* etc.)
   ============================================================ */
"use strict";
import { dispatch }                                        from "../store/SessionStore.js";
import { state }                                           from "../state.js";
import { flushOfflineQueue, queueOfflineQuestion }         from "../utils/pwa.js";

const RECONNECT_DELAY_MS    = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

// Build the WS URL, including the JWT auth token if the user is logged in.
// This lets the server set meta.role = 'owner' for the meeting host at
// connection time — without it the isOwner check always returns false.
function _buildWsUrl() {
  const token = state.token || localStorage.getItem("cv_token") || "";
  const base  = `ws://${location.host}`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

class SessionSocket {
  constructor() {
    this._ws               = null;
    this._reconnectAttempts = 0;
    this._reconnectTimer   = null;
    this._intentionalClose = false;
    this._eventHandlers    = new Map();
    this._connect();
  }

  _connect() {
    if (this._ws && (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING)) return;
    dispatch({ type: "HEALTH_UPDATED", payload: { connection: "connecting" } });
    try {
      this._ws = new WebSocket(_buildWsUrl());
    } catch {
      this._scheduleReconnect(); return;
    }

    this._ws.onopen = () => {
      this._reconnectAttempts = 0;
      dispatch({ type: "HEALTH_UPDATED", payload: { connection: "connected", sync: "synced" } });
      console.log("[WS] Connected");

      // Auto-join the current meeting if we know the sessionId
      const meetingId = state.session?.sessionId;
      if (meetingId) {
        this.joinMeeting(meetingId);
      }

      // Flush any questions queued while offline
      flushOfflineQueue((event, data) => this._ws.send(JSON.stringify({ event, data })));
    };

    this._ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        this._handleServerEvent(msg);
      } catch (e) {
        console.warn("[WS] Failed to parse message", e);
      }
    };

    this._ws.onclose = () => {
      dispatch({ type: "HEALTH_UPDATED", payload: { connection: "disconnected" } });
      if (!this._intentionalClose) this._scheduleReconnect();
    };

    this._ws.onerror = () => {
      dispatch({ type: "HEALTH_UPDATED", payload: { connection: "disconnected", sync: "error" } });
    };
  }

  _scheduleReconnect() {
    if (this._reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.warn("[WS] Max reconnect attempts reached, falling back to polling");
      this._startPollingFallback();
      return;
    }
    this._reconnectAttempts++;
    const delay = RECONNECT_DELAY_MS * Math.min(this._reconnectAttempts, 4);
    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this._reconnectAttempts})`);
    this._reconnectTimer = setTimeout(() => this._connect(), delay);
  }

  _handleServerEvent(msg) {
    const { event, data } = msg;

    switch (event) {
      // Full snapshot on connect or rejoin
      case "session_snapshot":
        // Seed the per-user vote set before the store dispatches so renderers
        // that read state.myVotes synchronously get the right initial value.
        if (Array.isArray(data.myVotes)) {
          state.myVotes = new Set(data.myVotes);
        }
        // Store participantId — used for speaker invite accept/decline
        if (data.participantId) {
          state.myParticipantId = data.participantId;
        }
        dispatch({ type: "SESSION_LOADED", payload: data });
        break;

      // ── Meeting lifecycle ──────────────────────────────────────
      // Host started the meeting: activate participant Join buttons, etc.
      case "meeting_started":
        dispatch({ type: "MEETING_STATUS_CHANGED", payload: { status: "live", meetingId: data.meetingId } });
        document.dispatchEvent(new CustomEvent("cv:meeting_started", { detail: data }));
        break;

      // Generic status change (started, ended, rescheduled)
      case "meeting_status_changed":
        dispatch({ type: "MEETING_STATUS_CHANGED", payload: { status: data.status, meetingId: data.meetingId } });
        document.dispatchEvent(new CustomEvent("cv:meeting_status_changed", { detail: data }));
        if (data.status === "conducted" || data.status === "expired") {
          dispatch({ type: "MEETING_ENDED", payload: data });
          document.dispatchEvent(new CustomEvent("cv:meeting_ended", { detail: data }));
        }
        break;

      // Host explicitly ended the session
      case "meeting_ended":
        dispatch({ type: "MEETING_ENDED", payload: data });
        document.dispatchEvent(new CustomEvent("cv:meeting_ended", { detail: data }));
        break;

      // Question lifecycle
      case "question_submitted":
        dispatch({ type: "QUESTION_ADDED", payload: data });
        break;

      case "questions_reranked":
        // Replace entire question list with the server-reranked version
        dispatch({ type: "SESSION_LOADED", payload: { questions: data } });
        break;

      case "question_upvoted":
        dispatch({ type: "QUESTION_UPVOTED", payload: data });
        break;

      case "question_assigned":
        dispatch({ type: "QUESTION_ASSIGNED", payload: data });
        break;

      case "question_answered":
        dispatch({ type: "QUESTION_ANSWERED", payload: data });
        break;

      case "question_status_changed":
        // Generic status update for deferred/flagged/skipped/answered
        dispatch({ type: "QUESTION_STATUS", payload: data });
        break;

      // Polls
      case "poll_created":
        dispatch({ type: "POLL_CREATED", payload: data });
        break;
      case "poll_updated":
        dispatch({ type: "POLL_UPDATED", payload: data });
        break;
      case "poll_ended":
        dispatch({ type: "POLL_UPDATED", payload: { ...data, active: false } });
        break;

      // Participants
      case "participant_joined":
        dispatch({ type: "PARTICIPANT_JOINED", payload: data });
        break;

      // Stats (sent after every structural change)
      case "session_stats":
        dispatch({ type: "STATS_UPDATED", payload: data });
        break;

      // Speaker invitation — show confirm popup on the invited client only
      case "speaker_invite":
        document.dispatchEvent(new CustomEvent("cv:speaker_invite", { detail: data }));
        break;

      // Ack sent back to moderator: did the invite reach a live WS connection?
      case "speaker_invite_sent":
        dispatch({ type: "SPEAKER_INVITE_SENT", payload: data });
        break;

      // Speaker assignment confirmed/declined/revoked — broadcast to all
      case "speaker_changed":
        dispatch({ type: "SPEAKER_ASSIGNED", payload: data });
        document.dispatchEvent(new CustomEvent("cv:speaker_changed", { detail: data }));
        break;

      // Announcements
      case "announcement":
        dispatch({ type: "ANNOUNCEMENT", payload: data });
        break;

      // Per-client vote-state echo (not broadcast to the whole room)
      case "your_vote_changed": {
        const { questionId, voted } = data;
        if (voted) {
          state.myVotes.add(questionId);
        } else {
          state.myVotes.delete(questionId);
        }
        dispatch({ type: "YOUR_VOTE_CHANGED", payload: { questionId, voted } });
        break;
      }

      // Live typing indicator — count broadcast from server
      case "typing_update":
        dispatch({ type: "TYPING_UPDATED", payload: data });
        break;

      // Per-question emoji reaction counts
      case "reaction_updated":
        dispatch({ type: "REACTION_UPDATED", payload: data });
        break;

      // Moderator marked a question "Answering" — show spotlight banner
      case "now_answering":
        dispatch({ type: "NOW_ANSWERING", payload: data || null });
        document.dispatchEvent(new CustomEvent("cv:now_answering", { detail: data }));
        break;

      // Clear banner when question status changes away from Answering
      case "question_status_changed":
        dispatch({ type: "QUESTION_STATUS", payload: data });
        // If we had a banner for this question and status changed, clear it
        if (data.status !== "Answering") {
          dispatch({ type: "NOW_ANSWERING", payload: null });
        }
        break;

      // ── Live notifications (§5) ────────────────────────────────────────────
      // The server pushes this event to a specific user's WS connections
      // whenever a new Notification row is created for them.
      case "notification": {
        // Prepend to in-memory notification list
        if (!state.notifications) state.notifications = [];
        state.notifications.unshift(data);

        const unreadCount = state.notifications.filter(n => n.read === false).length;

        // ── Update desktop topbar badge ──
        const desktopBadge = document.querySelector(".desktop-notif-badge");
        if (desktopBadge) {
          desktopBadge.textContent = unreadCount > 9 ? "9+" : String(unreadCount);
          desktopBadge.style.display = unreadCount > 0 ? "" : "none";
        } else if (unreadCount > 0) {
          // Badge doesn't exist yet — create it inside the desktop bell button
          const bellBtn = document.querySelector(".desktop-notif-btn");
          if (bellBtn) {
            const newBadge = document.createElement("span");
            newBadge.className = "desktop-notif-badge";
            newBadge.textContent = unreadCount > 9 ? "9+" : String(unreadCount);
            bellBtn.appendChild(newBadge);
          }
        }

        // ── Update mobile topbar badge ──
        // The mobile topbar bell button uses an inline <span> for the badge.
        // We update or create the badge element inside the bell icon-btn.
        const mobileBellBtns = document.querySelectorAll(".topbar .icon-btn.ghost-icon");
        mobileBellBtns.forEach(btn => {
          if (!btn.getAttribute("onclick")?.includes("notifications")) return;
          let mobileBadge = btn.querySelector("span[style*='position:absolute']");
          if (unreadCount > 0) {
            if (!mobileBadge) {
              mobileBadge = document.createElement("span");
              mobileBadge.style.cssText = "position:absolute;top:-4px;right:-4px;background:#e54040;color:#fff;font-size:10px;font-weight:700;border-radius:50%;width:16px;height:16px;display:flex;align-items:center;justify-content:center;line-height:1";
              btn.appendChild(mobileBadge);
            }
            mobileBadge.textContent = unreadCount > 9 ? "9+" : String(unreadCount);
          } else if (mobileBadge) {
            mobileBadge.remove();
          }
        });

        // ── Show a brief toast for the incoming notification ──
        try {
          const toastEl = document.createElement("div");
          const iconMap = { "Meeting Updates": "📅", "Meetings": "📅", "Questions": "💬", "System": "⚙️", "Admin Message": "📨" };
          const icon = iconMap[data.type] || "🔔";
          toastEl.style.cssText = [
            "position:fixed", "bottom:88px", "left:50%", "transform:translateX(-50%)",
            "background:#1e2038", "color:#fff", "padding:10px 16px", "border-radius:10px",
            "font-size:13px", "font-weight:500", "z-index:9999",
            "box-shadow:0 4px 24px rgba(0,0,0,0.3)", "pointer-events:none",
            "display:flex", "align-items:center", "gap:8px",
            "border-left:3px solid #5b34ff", "max-width:320px",
            "animation:toastIn .25s ease"
          ].join(";");
          toastEl.innerHTML = `<span>${icon}</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${data.title || "New notification"}</span>`;
          document.body.appendChild(toastEl);
          setTimeout(() => {
            toastEl.style.opacity = "0";
            toastEl.style.transition = "opacity .3s ease";
            setTimeout(() => toastEl.remove(), 320);
          }, 3500);
        } catch { /* non-fatal */ }

        // Re-render the notifications list if the user is currently viewing it.
        document.dispatchEvent(new CustomEvent("cv:new_notification", { detail: data }));
        break;
      }

      // ── Admin live announcement scoped to a meeting room (§meeting_announcement) ─
      // Sent by the backend when an admin messages "meeting_participants".
      // Distinct from the per-user "notification" event — this reaches every
      // socket in the room, including non-authenticated guests.
      case "meeting_announcement":
        document.dispatchEvent(new CustomEvent("cv:meeting_announcement", { detail: data }));
        break;

      default:
        break;

    }

    // Bubble ALL server events to the global document as a CustomEvent.
    // This allows app.js (and other modules) to react to events like
    // grace_period_started / meeting_expired without modifying socket.js.
    document.dispatchEvent(new CustomEvent("cv:ws_event", { detail: { event, data } }));

    // Also fire any custom event handlers registered by views
    const handler = this._eventHandlers.get(event);
    if (handler) handler(data);
  }

  /** Fallback: poll /api/session/live every 3s if WS unavailable */
  _pollingInterval = null;
  _startPollingFallback() {
    dispatch({ type: "HEALTH_UPDATED", payload: { connection: "connected", sync: "syncing" } });
    this._pollingInterval = setInterval(async () => {
      try {
        const meetingId = state.session?.sessionId;
        if (!meetingId) return; // No active session, skip polling
        const res  = await fetch(`/api/session/live?meetingId=${meetingId}`);
        if (!res.ok) return;
        const data = await res.json();
        dispatch({ type: "SESSION_LOADED", payload: data });
      } catch { /* silent */ }
    }, 3000);
  }

  /** Emit a typed event to the server (Phase 4 write path) */
  emit(event, data) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ event, data }));
    } else {
      // Queue question submissions for retry when reconnected; drop other events
      if (event === "submit_question") {
        queueOfflineQuestion(data);
      } else {
        console.warn("[WS] Not connected, event dropped:", event);
      }
    }
  }

  /**
   * joinMeeting — tells the server which meeting this client belongs to.
   * Sends userId for authenticated users or guestToken for anonymous guests
   * so the server can assign a stable voterId and track participant identity.
   * Server will send session_snapshot (including myVotes) and start routing events.
   */
  joinMeeting(meetingId, userId = null, userName = null) {
    // Authenticated: send real userId, no guestToken.
    // Anonymous: send null userId + the persisted browser guest UUID.
    const isLoggedIn  = !!state.token;
    const resolvedUID = isLoggedIn ? (userId || state.currentUserId || null) : null;
    const resolvedGT  = isLoggedIn ? null : state.guestToken;
    this.emit("join_meeting", {
      meetingId,
      userId:     resolvedUID,
      guestToken: resolvedGT,
      userName:   userName || state.profile?.user?.name || "Guest"
    });
  }

  /** Register a custom event handler (for view-specific reactions) */
  on(event, handler) {
    this._eventHandlers.set(event, handler);
  }

  close() {
    this._intentionalClose = true;
    clearTimeout(this._reconnectTimer);
    clearInterval(this._pollingInterval);
    this._ws?.close();
  }
}

// ── Singleton instance ─────────────────────────────────────────
let _socket = null;

export function getSocket() {
  if (!_socket) _socket = new SessionSocket();
  return _socket;
}

export function destroySocket() {
  if (_socket) { _socket.close(); _socket = null; }
}
