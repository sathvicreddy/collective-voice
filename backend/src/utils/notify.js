// backend/src/utils/notify.js
// Shared helper for creating Notification and AdminNotification records
// and pushing them live via WebSocket.
//
// Uses the same lazy-require pattern as api.js broadcast() to avoid circular deps:
//   require("../../server") is only resolved at call-time, not at module load.
"use strict";
const db = require("../db/client");

/**
 * Create a Notification row for a single user and push it live via WS.
 * Respects the user's NotificationPreference — skips creation if the
 * relevant category is disabled.
 *
 * @param {string} userId
 * @param {{ type: string, title: string, body: string, source?: string, senderId?: string }} opts
 */
async function notifyUser(userId, { type, title, body, source = "system", senderId = null }) {
  if (!userId) return null;

  // ── Check notification preferences ────────────────────────────────────────
  // Only enforce prefs for system-generated categories. Admin messages have
  // their own pref flag (adminMessages).
  // TODO(product-decision): confirm whether superadmin broadcasts (audience:
  // "all_users" / "admins") should bypass the adminMessages opt-out entirely
  // (e.g. for ToS/security notices). Currently they DO respect the pref.
  try {
    const prefs = await db.notificationPreference.findUnique({ where: { userId } });
    if (prefs) {
      if (type === "Meeting Updates" && !prefs.meetingUpdates) return null;
      if (type === "Questions"       && !prefs.questionActivity) return null;
      if (type === "System"          && !prefs.systemAlerts) return null;
      if (type === "Admin Message"   && !prefs.adminMessages) return null;
    }
  } catch { /* prefs table missing or unreadable — proceed */ }

  const n = await db.notification.create({
    data: { userId, type, title, body, time: "Just now", source, senderId: senderId || null, read: false }
  });

  // Push live via WS (fire-and-forget; safe to fail if server not yet attached)
  try {
    const { pushNotificationToUser } = require("../../server");
    if (pushNotificationToUser) pushNotificationToUser(userId, n);
  } catch { /* WS push is best-effort */ }

  return n;
}

/**
 * Create an AdminNotification row (visible to all admins) and push it live.
 *
 * @param {{ type: string, priority?: string, title: string, body: string, relatedId?: string }} opts
 */
async function notifyAdmins({ type, priority = "medium", title, body, relatedId = "" }) {
  const n = await db.adminNotification.create({
    data: { type, priority, title, body, relatedId: relatedId || "", read: false }
  });

  // Push live via WS (fire-and-forget)
  try {
    const { pushNotificationToAdmins } = require("../../server");
    if (pushNotificationToAdmins) pushNotificationToAdmins(n);
  } catch { /* WS push is best-effort */ }

  return n;
}

module.exports = { notifyUser, notifyAdmins };
