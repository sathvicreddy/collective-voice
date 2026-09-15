/* ============================================================
   src/repositories/meeting.repository.js
   All Prisma queries for the Meeting, GracePeriod,
   MeetingEnrollment, Participant, Poll, and PollOption models.

   Only called by meeting.service.js (and transitionally by
   api.js until that file is fully decomposed).
   ============================================================ */
"use strict";

const db = require("../db/client");

// ── Read ───────────────────────────────────────────────────────

/**
 * Find a meeting by its primary key.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
async function findById(id) {
  return db.meeting.findUnique({ where: { id } });
}

/**
 * Find a meeting by its short join code.
 * @param {string} code
 * @returns {Promise<object|null>}
 */
async function findByCode(code) {
  return db.meeting.findUnique({ where: { code } });
}

/**
 * Find a meeting by ID with full relations for the detail page.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
async function findByIdWithDetails(id) {
  return db.meeting.findUnique({
    where:   { id },
    include: {
      owner:        { select: { id: true, name: true, email: true, picture: true } },
      participants: { select: { id: true } },
      enrollments:  { select: { userId: true } },
      polls:        { select: { id: true } },
    },
  });
}

/**
 * Find a meeting with its grace period included.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
async function findByIdWithGrace(id) {
  return db.meeting.findUnique({ where: { id }, include: { gracePeriod: true } });
}

/**
 * Find a meeting with the owner's email (used for digest emails).
 * @param {string} id
 * @returns {Promise<object|null>}
 */
async function findByIdWithOwner(id) {
  return db.meeting.findUnique({
    where:   { id },
    include: { owner: { select: { email: true, name: true } } },
  });
}

/**
 * List all meetings, newest first.
 * @param {object} [where]
 * @returns {Promise<object[]>}
 */
async function findAll(where = {}) {
  return db.meeting.findMany({ where, orderBy: { createdAt: "desc" } });
}

/**
 * Returns all meetings the user owns plus all they are enrolled in,
 * de-duplicated. Also returns the enrollment metadata on each.
 * @param {string} userId
 * @returns {Promise<{ all: object[], upcoming: object[], live: object[], past: object[], expired: object[] }>}
 */
async function findMine(userId) {
  const [enrollments, ownedMeetings] = await Promise.all([
    db.meetingEnrollment.findMany({
      where:   { userId },
      include: { meeting: { include: { gracePeriod: true } } },
      orderBy: { enrolledAt: "desc" },
    }),
    db.meeting.findMany({
      where:   { ownerId: userId },
      include: { gracePeriod: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const enrolledMeetings = enrollments.map(e => ({
    ...e.meeting,
    enrolledAt: e.enrolledAt,
    joinMethod: e.joinMethod,
  }));

  const seen = new Set();
  const all  = [...enrolledMeetings, ...ownedMeetings].filter(m => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  return {
    all,
    upcoming: all.filter(m => m.status === "upcoming" || m.status === "scheduled"),
    live:     all.filter(m => m.status === "live"),
    past:     all.filter(m => m.status === "conducted" || m.status === "past"),
    expired:  all.filter(m => m.status === "expired"),
  };
}

/**
 * Find meetings the user owns.
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
async function findOwnedByUser(userId) {
  return db.meeting.findMany({ where: { ownerId: userId }, select: { id: true } });
}

/**
 * Find the first live meeting the user is involved in (owner or enrolled).
 * Falls back to any live meeting if the user has none.
 * @param {string[]} userMeetingIds
 * @returns {Promise<object|null>}
 */
async function findLiveForUser(userMeetingIds) {
  if (userMeetingIds.length > 0) {
    const mine = await db.meeting.findFirst({ where: { id: { in: userMeetingIds }, status: "live" } });
    if (mine) return mine;
  }
  return db.meeting.findFirst({ where: { status: "live" } });
}

/**
 * Find upcoming meetings the user is involved in.
 * @param {string[]} userMeetingIds
 * @param {number} [take=5]
 * @returns {Promise<object[]>}
 */
async function findUpcomingForUser(userMeetingIds, take = 5) {
  if (userMeetingIds.length === 0) return [];
  return db.meeting.findMany({
    where:   { id: { in: userMeetingIds }, status: "upcoming" },
    orderBy: { scheduledAt: "asc" },
    take,
  });
}

// ── Write ──────────────────────────────────────────────────────

/**
 * Create a new meeting.
 * @param {object} data
 * @returns {Promise<object>}
 */
async function create(data) {
  return db.meeting.create({ data });
}

/**
 * Update meeting fields.
 * @param {string} id
 * @param {object} data
 * @returns {Promise<object>}
 */
async function update(id, data) {
  return db.meeting.update({ where: { id }, data });
}

/**
 * Delete a meeting (Prisma cascades handle relations).
 * @param {string} id
 * @returns {Promise<object>}
 */
async function remove(id) {
  return db.meeting.delete({ where: { id } });
}

// ── Enrollment ─────────────────────────────────────────────────

/**
 * Upsert an enrollment record (idempotent join/scan).
 * @param {string} meetingId
 * @param {string} userId
 * @param {"code"|"qr"} method
 * @returns {Promise<object>}
 */
async function upsertEnrollment(meetingId, userId, method = "code") {
  return db.meetingEnrollment.upsert({
    where:  { meetingId_userId: { meetingId, userId } },
    update: {},
    create: { meetingId, userId, joinMethod: method },
  });
}

/**
 * Find all enrollment records for a meeting (userId only).
 * @param {string} meetingId
 * @returns {Promise<{ userId: string }[]>}
 */
async function findEnrollments(meetingId) {
  return db.meetingEnrollment.findMany({
    where:  { meetingId },
    select: { userId: true },
  });
}

/**
 * Find all meeting IDs the user is enrolled in.
 * @param {string} userId
 * @returns {Promise<string[]>}
 */
async function findEnrolledIds(userId) {
  const rows = await db.meetingEnrollment.findMany({
    where:  { userId },
    select: { meetingId: true },
  });
  return rows.map(r => r.meetingId);
}

// ── Grace period / extend / reschedule ────────────────────────

/**
 * Extend a meeting (push scheduledAt forward, update grace period).
 * Runs as a Prisma transaction.
 * @param {string} id
 * @param {Date}   newScheduledAt
 * @param {Date}   newGraceEndsAt
 * @param {object|null} existingGracePeriod
 * @returns {Promise<object>} — updated meeting row
 */
async function extend(id, newScheduledAt, newGraceEndsAt, existingGracePeriod) {
  const ops = [
    db.meeting.update({
      where: { id },
      data:  { scheduledAt: newScheduledAt, graceEndsAt: newGraceEndsAt },
    }),
    ...(existingGracePeriod ? [db.gracePeriod.update({
      where: { id: existingGracePeriod.id },
      data:  { graceEndsAt: newGraceEndsAt, hostAction: "extended" },
    })] : []),
  ];
  const [updatedMeeting] = await db.$transaction(ops);
  return updatedMeeting;
}

/**
 * Reschedule a meeting to a new date/time, clear grace period.
 * Runs as a Prisma transaction.
 * @param {string} id
 * @param {Date}   newScheduledAt
 * @param {string} dateStr
 * @param {string} timeStr
 * @param {object|null} existingGracePeriod
 * @returns {Promise<object>} — updated meeting row
 */
async function reschedule(id, newScheduledAt, dateStr, timeStr, existingGracePeriod) {
  const ops = [
    db.meeting.update({
      where: { id },
      data:  { scheduledAt: newScheduledAt, date: dateStr, time: timeStr, status: "upcoming", graceEndsAt: null },
    }),
    ...(existingGracePeriod ? [db.gracePeriod.update({
      where: { id: existingGracePeriod.id },
      data:  { hostAction: "rescheduled", resolvedAt: new Date() },
    })] : []),
  ];
  const [updatedMeeting] = await db.$transaction(ops);
  return updatedMeeting;
}

module.exports = {
  findById,
  findByCode,
  findByIdWithDetails,
  findByIdWithGrace,
  findByIdWithOwner,
  findAll,
  findMine,
  findOwnedByUser,
  findLiveForUser,
  findUpcomingForUser,
  create,
  update,
  remove,
  upsertEnrollment,
  findEnrollments,
  findEnrolledIds,
  extend,
  reschedule,
};
