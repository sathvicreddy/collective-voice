// backend/src/scheduler.js
// Background scheduler — runs every 60 seconds.
// Responsibilities:
//   1. Detect overdue upcoming meetings → create GracePeriod → notify host via WS
//   2. Detect expired GracePeriod records → mark meeting "expired" → broadcast to enrolled users
"use strict";

const db = require("./db/client");

const GRACE_PERIOD_MS = parseInt(process.env.GRACE_PERIOD_MINUTES || "15") * 60 * 1000;
const TICK_MS         = 60_000; // every 60 seconds

let _broadcast = null;   // injected from server.js
let _getHostWs = null;   // injected from server.js — returns the WS socket of a meeting's owner

/**
 * Inject dependencies from server.js to avoid circular requires.
 * Called once during server startup.
 */
function initScheduler({ broadcast, getHostWs }) {
  _broadcast = broadcast;
  _getHostWs = getHostWs;
}

/**
 * A single scheduler tick. Called on interval.
 */
async function tick() {
  try {
    await checkOverdueMeetings();
    await checkExpiredGracePeriods();
  } catch (err) {
    console.error("[Scheduler] Tick error:", err.message);
  }
}

/**
 * 1. Find all "upcoming" meetings whose scheduledAt has passed AND have no
 *    GracePeriod yet. Start a grace period for each.
 */
async function checkOverdueMeetings() {
  const now = new Date();

  const overdue = await db.meeting.findMany({
    where: {
      status:      "upcoming",
      scheduledAt: { lt: now },
      gracePeriod: null          // no grace period started yet
    },
    select: { id: true, title: true, ownerId: true }
  });

  for (const m of overdue) {
    const graceStartsAt = now;
    const graceEndsAt   = new Date(now.getTime() + GRACE_PERIOD_MS);

    // Create grace period record and update meeting
    await db.$transaction([
      db.gracePeriod.create({
        data: { meetingId: m.id, graceStartsAt, graceEndsAt }
      }),
      db.meeting.update({
        where: { id: m.id },
        data:  { graceEndsAt }
      })
    ]);

    console.log(`[Scheduler] Grace period started for meeting "${m.title}" (${m.id}), ends at ${graceEndsAt.toISOString()}`);

    // Notify only the host
    if (_broadcast && m.ownerId) {
      _broadcast("grace_period_started", {
        meetingId:   m.id,
        title:       m.title,
        graceEndsAt: graceEndsAt.toISOString(),
        graceMs:     GRACE_PERIOD_MS
      }, m.id, { onlyUserId: m.ownerId });
    }
  }
}

/**
 * 2. Find all GracePeriod records that have expired with no host action.
 *    Mark the meeting "expired" and broadcast to all enrolled users.
 */
async function checkExpiredGracePeriods() {
  const now = new Date();

  const expired = await db.gracePeriod.findMany({
    where: {
      graceEndsAt: { lt: now },
      hostAction:  null          // host took no action
    },
    include: {
      meeting: {
        select: { id: true, title: true, status: true }
      }
    }
  });

  for (const gp of expired) {
    if (gp.meeting.status === "expired") continue; // already handled

    // Mark grace period resolved, mark meeting expired
    await db.$transaction([
      db.gracePeriod.update({
        where: { id: gp.id },
        data:  { hostAction: "expired", resolvedAt: now }
      }),
      db.meeting.update({
        where: { id: gp.meetingId },
        data:  { status: "expired", graceEndsAt: null }
      })
    ]);

    console.log(`[Scheduler] Meeting "${gp.meeting.title}" (${gp.meetingId}) auto-expired.`);

    // Notify all enrolled users
    if (_broadcast) {
      _broadcast("meeting_expired", {
        meetingId: gp.meetingId,
        title:     gp.meeting.title
      }, gp.meetingId);
    }
  }
}

/**
 * Start the scheduler. Returns a cleanup function.
 */
function startScheduler(deps) {
  initScheduler(deps);
  // Run once immediately, then on interval
  tick();
  const intervalId = setInterval(tick, TICK_MS);
  console.log(`[Scheduler] Started — checking every ${TICK_MS / 1000}s, grace period ${GRACE_PERIOD_MS / 60000}m`);
  return () => clearInterval(intervalId);
}

module.exports = { startScheduler, tick };
