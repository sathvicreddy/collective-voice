/* ============================================================
   reportSummary.js — Shared meeting digest aggregation
   Extracted from api.js /api/analytics/meeting/:id to avoid
   duplication between the analytics endpoint and digest email.
   ============================================================ */
"use strict";

// Relative path from src/utils/ → src/db/client
const db = require("../db/client");

/**
 * Build a structured digest of a meeting's Q&A activity.
 * Returns a plain object suitable for both the mailer and the
 * analytics REST endpoint.
 *
 * @param {string} meetingId
 * @returns {Promise<object>}
 */
async function buildMeetingDigest(meetingId) {
  const meeting      = await db.meeting.findUnique({ where: { id: meetingId } });
  const questions    = await db.question.findMany({ where: { meetingId }, orderBy: { score: "desc" } });
  const participants = await db.participant.findMany({ where: { meetingId } });
  const polls        = await db.poll.findMany({ where: { meetingId }, include: { options: true } });

  const totalVotes    = questions.reduce((s, q) => s + (q.votes || 0), 0);
  const answeredCount = questions.filter(q => q.status === "Answered").length;
  const pendingCount  = questions.filter(q => q.status === "Pending").length;
  const deferredCount = questions.filter(q => q.status === "Deferred").length;
  const reviewCount   = questions.filter(q => q.status === "Under Review").length;

  // Top 5 unanswered (highest-scored, still pending)
  const top5Unanswered = questions
    .filter(q => q.status !== "Answered")
    .slice(0, 5)
    .map((q, i) => ({ rank: i + 1, text: q.text, votes: q.votes || 0, status: q.status }));

  // Engagement trend: bucket into 10 equal time slots
  const times = questions.map(q => new Date(q.createdAt).getTime()).filter(Boolean);
  let trend = Array(10).fill(0);
  if (times.length > 0) {
    const tMin = Math.min(...times), tMax = Math.max(...times);
    const span = tMax - tMin || 1;
    questions.forEach(q => {
      const t = new Date(q.createdAt).getTime();
      const bucket = Math.min(9, Math.floor(((t - tMin) / span) * 10));
      trend[bucket]++;
    });
  }

  // Polls with percentage per option
  const pollsWithPcts = polls.map(p => {
    const totalPollVotes = p.options.reduce((s, o) => s + (o.votes || 0), 0) || 1;
    return {
      id: p.id, question: p.question, active: p.active,
      options: p.options.map(o => ({
        id: o.id, label: o.label, votes: o.votes || 0,
        pct: Math.round(((o.votes || 0) / totalPollVotes) * 100)
      }))
    };
  });

  // Participant breakdown
  const askerIds    = new Set(questions.map(q => q.askedById).filter(Boolean));
  const activeCount = Math.max(1, askerIds.size);
  const passiveCount = Math.max(0, participants.length - activeCount);

  return {
    meeting: meeting
      ? {
          id: meeting.id, title: meeting.title, code: meeting.code,
          status: meeting.status, description: meeting.description,
          createdAt: meeting.createdAt, updatedAt: meeting.updatedAt,
        }
      : null,
    totals: {
      participants:   participants.length,
      questions:      questions.length,
      upvotes:        totalVotes,
      answered:       answeredCount,
      pending:        pendingCount,
      deferred:       deferredCount,
      review:         reviewCount,
      polls:          polls.length,
      averageUpvotes: questions.length ? (totalVotes / questions.length).toFixed(1) : "0"
    },
    topQuestions: questions.slice(0, 10).map((q, i) => ({
      rank: i + 1, id: q.id, text: q.text, votes: q.votes || 0, status: q.status,
      askedBy: q.askedByName || "Anonymous", createdAt: q.createdAt,
      similar: Math.max(0, JSON.parse(q.membersJson || "[]").length - 1)
    })),
    allQuestions: questions.map((q, i) => ({
      rank: i + 1, id: q.id, text: q.text, votes: q.votes || 0, status: q.status,
      askedBy: q.askedByName || "Anonymous", createdAt: q.createdAt,
      similar: Math.max(0, JSON.parse(q.membersJson || "[]").length - 1)
    })),
    statusBreakdown: { answered: answeredCount, pending: pendingCount, deferred: deferredCount, review: reviewCount },
    participantBreakdown: {
      total:      participants.length,
      active:     activeCount,
      passive:    passiveCount,
      activePct:  Math.round((activeCount  / Math.max(1, participants.length)) * 100),
      passivePct: Math.round((passiveCount / Math.max(1, participants.length)) * 100)
    },
    polls: pollsWithPcts,
    trend,
    top5Unanswered,
  };
}

module.exports = { buildMeetingDigest };
