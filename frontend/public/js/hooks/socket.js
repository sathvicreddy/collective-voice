/* ============================================================
   SessionSocket — Native WebSocket wrapper with auto-reconnect
   Maps to useSocket() hook concept from the spec
   ============================================================ */

import { dispatch } from "../store/SessionStore.js";

const WS_URL = `ws://${location.host}`;
const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

class SessionSocket {
  constructor() {
    this._ws = null;
    this._reconnectAttempts = 0;
    this._reconnectTimer = null;
    this._intentionalClose = false;
    this._eventHandlers = new Map(); // custom handlers from views
    this._connect();
  }

  _connect() {
    if (this._ws && (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING)) return;

    dispatch({ type: "HEALTH_UPDATED", payload: { connection: "connecting" } });

    try {
      this._ws = new WebSocket(WS_URL);
    } catch {
      this._scheduleReconnect();
      return;
    }

    this._ws.onopen = () => {
      this._reconnectAttempts = 0;
      dispatch({ type: "HEALTH_UPDATED", payload: { connection: "connected", sync: "synced" } });
      console.log("[WS] Connected");
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
      if (!this._intentionalClose) {
        this._scheduleReconnect();
      }
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

    // Dispatch to SessionStore
    switch (event) {
      case "question_submitted":
        dispatch({ type: "QUESTION_ADDED", payload: data });
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
      case "poll_created":
        dispatch({ type: "POLL_CREATED", payload: data });
        break;
      case "poll_updated":
        dispatch({ type: "POLL_UPDATED", payload: data });
        break;
      case "participant_joined":
        dispatch({ type: "PARTICIPANT_JOINED", payload: data });
        break;
      case "speaker_changed":
        dispatch({ type: "QUESTION_ASSIGNED", payload: data });
        break;
      case "session_stats":
        dispatch({ type: "STATS_UPDATED", payload: data });
        break;
      default:
        break;
    }

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
        const res = await fetch("/api/session/live");
        if (!res.ok) return;
        const data = await res.json();
        dispatch({ type: "SESSION_LOADED", payload: data });
      } catch { /* silent */ }
    }, 3000);
  }

  /** Emit an event to the server */
  emit(event, data) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ event, data }));
    } else {
      // Fallback: REST for critical writes
      console.warn("[WS] Not connected, event not sent:", event);
    }
  }

  /** Register a one-off custom event handler */
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
  if (!_socket) {
    _socket = new SessionSocket();
  }
  return _socket;
}

export function destroySocket() {
  if (_socket) {
    _socket.close();
    _socket = null;
  }
}
