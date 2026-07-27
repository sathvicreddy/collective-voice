/* ============================================================
   SessionSocket — Native WebSocket wrapper with auto-reconnect
   Phase 4: handles all new server events, provides emit() for
   client-side writes (submit_question, upvote, mark_* etc.)
   ============================================================ */
"use strict";
import { dispatch } from "../store/SessionStore.js";
import { state }    from "../state.js";

const WS_URL = `ws://${location.host}`;
const RECONNECT_DELAY_MS   = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

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
      this._ws = new WebSocket(WS_URL);
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
        dispatch({ type: "SESSION_LOADED", payload: data });
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

      // Participants
      case "participant_joined":
        dispatch({ type: "PARTICIPANT_JOINED", payload: data });
        break;

      // Stats (sent after every structural change)
      case "session_stats":
        dispatch({ type: "STATS_UPDATED", payload: data });
        break;

      // Speaker assignment — triggers view switch in all tabs
      case "speaker_changed":
        dispatch({ type: "SPEAKER_ASSIGNED", payload: data });
        // Fire any custom handler registered by session.js
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
        const meetingId = state.session?.sessionId || "m_ai_education";
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
      console.warn("[WS] Not connected, event queued:", event);
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
