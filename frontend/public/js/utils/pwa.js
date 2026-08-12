/* ============================================================
   pwa.js — PWA registration + offline question queue
   Registers the service worker and exposes helpers for
   the offline question queue (localStorage-backed).
   ============================================================ */
"use strict";

const OFFLINE_QUEUE_KEY = "cv_pending_questions";

// ── Service Worker Registration ───────────────────────────────
export function initPWA() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/service-worker.js", { scope: "/" })
    .then((reg) => {
      console.log("[PWA] Service worker registered, scope:", reg.scope);
    })
    .catch((err) => {
      console.warn("[PWA] Service worker registration failed:", err.message);
    });
}

// ── Offline Question Queue ─────────────────────────────────────

/**
 * Add a pending question to the localStorage queue.
 * Called when the WS is not OPEN at submit time.
 */
export function queueOfflineQuestion(data) {
  const queue = _readQueue();
  queue.push({ ...data, queuedAt: Date.now() });
  _writeQueue(queue);
  showOfflineToast("Question saved — will send when you're back online");
}

/**
 * Flush the queue: replay each pending question via the provided emitter,
 * then clear the queue. Called from socket.js on ws.onopen.
 * @param {function} emitFn — bound socket.emit(event, data)
 */
export function flushOfflineQueue(emitFn) {
  const queue = _readQueue();
  if (queue.length === 0) return;
  console.log(`[PWA] Flushing ${queue.length} offline question(s)`);
  for (const item of queue) {
    try {
      const { queuedAt: _q, ...payload } = item; // strip internal field
      emitFn("submit_question", payload);
    } catch (e) {
      console.warn("[PWA] Could not replay offline question:", e);
    }
  }
  _writeQueue([]);
}

/** Returns true if there are pending offline questions */
export function hasOfflineQueue() {
  return _readQueue().length > 0;
}

// ── Toast ─────────────────────────────────────────────────────
/**
 * Show a non-blocking transient toast notification.
 * Uses --primary token colour for the accent border.
 */
export function showOfflineToast(message) {
  // Remove any existing toast first
  const existing = document.getElementById("cv-offline-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "cv-offline-toast";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.style.cssText = [
    "position:fixed",
    "bottom:24px",
    "left:50%",
    "transform:translateX(-50%)",
    "background:#1e2038",
    "color:#fff",
    "padding:12px 20px",
    "border-radius:var(--radius,12px)",
    "border-left:4px solid var(--primary,#5b34ff)",
    "font-size:13px",
    "font-weight:500",
    "font-family:inherit",
    "box-shadow:0 8px 32px rgba(0,0,0,.3)",
    "z-index:99999",
    "animation:toastIn .25s ease",
    "max-width:calc(100vw - 48px)",
    "white-space:nowrap"
  ].join(";");
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity .3s ease";
    setTimeout(() => toast.remove(), 320);
  }, 3500);
}

// ── Private helpers ───────────────────────────────────────────
function _readQueue() {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

function _writeQueue(queue) {
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch { /* storage full — silently drop */ }
}
