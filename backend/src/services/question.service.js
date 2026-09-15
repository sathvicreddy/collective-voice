/* ============================================================
   src/services/question.service.js
   Business logic for questions, upvotes, clustering, and the
   NLP in-memory cache.

   NOTE: This file is the authoritative home of _nlpCache.
   During the Phase 3b refactor transition, the cache was moved
   here from api.js. server.js imports _nlpCache, persistCluster,
   and submitQuestionShared via api.js module.exports — those
   exports now delegate here so the WS handlers continue working.
   ============================================================ */
"use strict";

const db             = require("../db/client");
const { processQuestion } = require("../nlp/engine");
const { recomputeScores } = require("../nlp/scoring");

// ── NLP in-memory cache ───────────────────────────────────────
// Key: meetingId → array of cluster objects (matches Prisma Question shape).
const _nlpCache = {};

// ── Helpers ───────────────────────────────────────────────────

function safeJson(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

/** Convert a Prisma Question row to the NLP cluster shape */
function dbRowToCluster(row) {
  return {
    id:                row.id,
    meetingId:         row.meetingId,
    text:              row.text,
    canonical_text:    row.canonicalText,
    members:           safeJson(row.membersJson, [row.text]),
    votes:             row.votes,
    score:             row.score,
    status:            row.status,
    askedBy:           row.askedByName,
    askedById:         row.askedById || null,
    assignedSpeakerId: row.assignedSpeakerId || null,
    summary:           row.summaryText,
    timeline:          safeJson(row.timelineJson, []),
    clusterSize:       safeJson(row.membersJson, []).length,
    similar:           Math.max(0, safeJson(row.membersJson, []).length - 1),
    createdAt:         row.createdAt?.getTime?.() ?? Date.now(),
    _embedding:        row.embeddingJson ? safeJson(row.embeddingJson, null) : null,
  };
}

// ── Cache access ──────────────────────────────────────────────

/**
 * Returns the in-memory question cache for a meeting.
 * Populates from DB on first access.
 * @param {string} meetingId
 * @returns {Promise<object[]>}
 */
async function getCache(meetingId) {
  if (!_nlpCache[meetingId]) {
    const rows = await db.question.findMany({
      where:   { meetingId },
      orderBy: { createdAt: "asc" },
    });
    _nlpCache[meetingId] = rows.map(dbRowToCluster);
  }
  return _nlpCache[meetingId];
}

// ── Persistence ───────────────────────────────────────────────

/**
 * Persist a cluster object back to the DB.
 * @param {object} cluster
 * @returns {Promise<void>}
 */
async function persistCluster(cluster) {
  await db.question.upsert({
    where:  { id: cluster.id },
    update: {
      text:              cluster.text,
      canonicalText:     cluster.canonical_text || cluster.text,
      membersJson:       JSON.stringify(cluster.members || [cluster.text]),
      votes:             cluster.votes || 0,
      score:             cluster.score || 0,
      status:            cluster.status || "Pending",
      askedByName:       cluster.askedBy || "",
      askedById:         cluster.askedById || null,
      assignedSpeakerId: cluster.assignedSpeakerId || null,
      summaryText:       cluster.summary || "",
      timelineJson:      JSON.stringify(cluster.timeline || []),
      embeddingJson:     cluster._embedding ? JSON.stringify(cluster._embedding) : undefined,
    },
    create: {
      id:                cluster.id,
      meetingId:         cluster.meetingId,
      text:              cluster.text,
      canonicalText:     cluster.canonical_text || cluster.text,
      membersJson:       JSON.stringify(cluster.members || [cluster.text]),
      votes:             cluster.votes || 0,
      score:             cluster.score || 0,
      status:            cluster.status || "Pending",
      askedByName:       cluster.askedBy || "",
      askedById:         cluster.askedById || null,
      summaryText:       cluster.summary || "",
      timelineJson:      JSON.stringify(cluster.timeline || []),
      embeddingJson:     cluster._embedding ? JSON.stringify(cluster._embedding) : null,
    },
  });
}

// ── Broadcast ─────────────────────────────────────────────────
function _broadcast(event, data, meetingId = null, opts = {}) {
  try {
    const { broadcast: _b } = require("../../server");
    _b({ event, data, meetingId }, null, opts);
  } catch { /* server not yet attached */ }
}

// ── Live payload snapshot ─────────────────────────────────────

async function livePayload(meetingId) {
  const questions    = await getCache(meetingId);
  const polls        = await db.poll.findMany({ where: { meetingId }, include: { options: true } });
  const participants = await db.participant.findMany({ where: { meetingId } });
  const ranked       = [...questions].sort((a, b) => (b.score || 0) - (a.score || 0));
  return {
    questions: ranked,
    polls:     polls.map(p => ({ ...p, endsAt: p.endsAt?.getTime?.() ?? null })),
    participants,
    stats: {
      questionsCount:    questions.length,
      participantsCount: participants.length,
      upvotesCount:      questions.reduce((s, q) => s + (q.votes || 0), 0),
    },
  };
}

// ── Core WS-shared logic ──────────────────────────────────────

/**
 * Process and submit a question — shared between REST API and WebSocket handlers.
 * @param {string} meetingId
 * @param {string} text
 * @param {string} askedBy
 * @param {string|null} askedById
 * @returns {Promise<object>} — cluster (stripped of _embedding)
 */
async function submitQuestionShared(meetingId, text, askedBy, askedById) {
  const cache   = await getCache(meetingId);
  const cluster = await processQuestion(meetingId, text.trim(), askedBy || "Anonymous", cache);
  cluster.askedById = askedById || null;

  persistCluster(cluster).catch(err => console.error("[Q] persistCluster error:", err.message));

  const { _embedding, ...clusterForClient } = cluster;
  const ranked = [...cache]
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .map(({ _embedding: _e, ...c }) => c);

  _broadcast("question_submitted", clusterForClient, meetingId);
  _broadcast("questions_reranked", ranked,           meetingId);

  livePayload(meetingId)
    .then(snap => _broadcast("session_stats", snap.stats, meetingId))
    .catch(() => {});

  return clusterForClient;
}

// ── REST API question operations ──────────────────────────────

/**
 * Up-vote a question cluster.
 * @param {string} meetingId
 * @param {string} questionId
 * @param {string} voterId
 * @returns {Promise<{ ok: boolean, question: object } | { alreadyVoted: boolean } | { notFound: boolean }>}
 */
async function upvoteQuestion(meetingId, questionId, voterId) {
  // Dedup: check existing vote
  const existingVote = voterId
    ? await db.questionVote.findUnique({
        where: { questionId_voterId: { questionId, voterId } },
      }).catch(() => null)
    : null;
  if (existingVote) return { alreadyVoted: true };

  const cache = await getCache(meetingId);
  const q     = cache.find(c => c.id === questionId);
  if (!q) return { notFound: true };

  q.votes = (q.votes || 0) + 1;
  q.score = recomputeScores([q], { recencyWeight: 1, voteWeight: 1, diversityWeight: 0 })?.[0]?.score ?? q.score;

  persistCluster(q).catch(err => console.error("[Q] upvote persist error:", err.message));

  if (voterId) {
    db.questionVote.create({ data: { questionId, voterId } }).catch(() => {});
  }

  const { _embedding, ...qForClient } = q;
  _broadcast("question_upvoted",   qForClient, meetingId);
  _broadcast("questions_reranked",
    [...cache].sort((a, b) => (b.score || 0) - (a.score || 0)).map(({ _embedding: _e, ...c }) => c),
    meetingId);

  return { ok: true, question: qForClient };
}

/**
 * Set question status (Answered / Deferred / Under Review / Pending).
 * @param {string} meetingId
 * @param {string} questionId
 * @param {string} status
 * @returns {Promise<object|null>}
 */
async function setQuestionStatus(meetingId, questionId, status) {
  const cache = await getCache(meetingId);
  const q     = cache.find(c => c.id === questionId);
  if (!q) return null;

  q.status = status;
  persistCluster(q).catch(() => {});

  const { _embedding, ...qForClient } = q;
  _broadcast("question_status_changed", qForClient, meetingId);
  return qForClient;
}

/**
 * Assign a question to a speaker.
 * @param {string} meetingId
 * @param {string} questionId
 * @param {string} speakerId
 * @returns {Promise<object|null>}
 */
async function assignQuestion(meetingId, questionId, speakerId) {
  const cache = await getCache(meetingId);
  const q     = cache.find(c => c.id === questionId);
  if (!q) return null;

  q.assignedSpeakerId = speakerId;
  persistCluster(q).catch(() => {});

  const { _embedding, ...qForClient } = q;
  _broadcast("question_assigned", qForClient, meetingId);
  return qForClient;
}

/**
 * Delete a question from the cache and DB.
 * @param {string} meetingId
 * @param {string} questionId
 * @returns {Promise<boolean>}
 */
async function deleteQuestion(meetingId, questionId) {
  if (_nlpCache[meetingId]) {
    _nlpCache[meetingId] = _nlpCache[meetingId].filter(c => c.id !== questionId);
  }
  await db.question.delete({ where: { id: questionId } }).catch(() => {});
  _broadcast("question_deleted", { questionId }, meetingId);
  return true;
}

/**
 * Add a text summary to a question.
 * @param {string} meetingId
 * @param {string} questionId
 * @param {string} summary
 * @returns {Promise<object|null>}
 */
async function addSummary(meetingId, questionId, summary) {
  const cache = await getCache(meetingId);
  const q     = cache.find(c => c.id === questionId);
  if (!q) return null;
  q.summary = summary;
  persistCluster(q).catch(() => {});
  const { _embedding, ...qForClient } = q;
  return qForClient;
}

module.exports = {
  // cache
  _nlpCache,
  getCache,
  persistCluster,
  // WS shared
  submitQuestionShared,
  livePayload,
  // REST
  upvoteQuestion,
  setQuestionStatus,
  assignQuestion,
  deleteQuestion,
  addSummary,
};
