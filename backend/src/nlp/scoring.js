/* ============================================================
   NLP Scoring Engine — v3 (embedding-aware + reactions)

   Composite score formula:
     score = α·V + β·T + γ·S + δ·N + ε·E

   Where:
     V = vote normalisation   — how popular vs. the meeting's top question
     T = temporal freshness   — exp(-λ·ageInHours), λ = 0.5
     S = content novelty      — 1 - max similarity to answered clusters
     N = topical diversity    — 1 - avg similarity to OTHER active clusters
     E = reaction score       — reactionCount / maxReactionCount across meeting

   Similarity for S and N:
     If both clusters have precomputed _embedding vectors (set by engine.js),
     use cosine similarity. Otherwise fall back to Dice coefficient.
     This avoids any async work here — embeddings are already cached.

   Weights (tunable via env):
     Original: α=0.40, β=0.25, γ=0.20, δ=0.15, sum=1.00
     With ε=0.10: scale all by 0.90 so the sum remains 1.00
       α' = 0.40 × 0.90 = 0.360
       β' = 0.25 × 0.90 = 0.225
       γ' = 0.20 × 0.90 = 0.180
       δ' = 0.15 × 0.90 = 0.135
       ε  =                0.100
       Sum = 0.360 + 0.225 + 0.180 + 0.135 + 0.100 = 1.000 ✓

   Called after every submit, upvote, or moderator action.
   ============================================================ */

"use strict";
const state = require("../data/state");

// Import cosine similarity from engine (avoids circular dep because
// engine imports scoring but NOT via cosine — just recomputeScores)
let _cosineSim = null;
function getCosineSim() {
  if (!_cosineSim) {
    try { _cosineSim = require("./engine").cosineSimilarity; } catch { _cosineSim = () => 0; }
  }
  return _cosineSim;
}

// ── Inline Dice (fallback for clusters without embeddings) ────
function getBigrams(str) {
  const s = str.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const set = new Set();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}
function diceCoefficient(a, b) {
  if (!a || !b) return 0;
  const ba = getBigrams(a), bb = getBigrams(b);
  if (ba.size === 0 && bb.size === 0) return 1;
  if (ba.size === 0 || bb.size === 0) return 0;
  let intersection = 0;
  ba.forEach(bi => { if (bb.has(bi)) intersection++; });
  return (2 * intersection) / (ba.size + bb.size);
}

/**
 * Compute similarity between two clusters.
 * Prefers cosine similarity on cached embeddings for semantic accuracy.
 * Falls back to Dice when embeddings are absent (seeded data, fallback path).
 */
function clusterSim(a, b) {
  if (a._embedding && b._embedding) {
    return getCosineSim()(a._embedding, b._embedding);
  }
  return diceCoefficient(a.canonical_text || a.text, b.canonical_text || b.text);
}

// Weight constants — scaled to maintain sum = 1.00 with ε added
const α = parseFloat(process.env.SCORE_ALPHA   || "0.360");
const β = parseFloat(process.env.SCORE_BETA    || "0.225");
const γ = parseFloat(process.env.SCORE_GAMMA   || "0.180");
const δ = parseFloat(process.env.SCORE_DELTA   || "0.135");
const ε = parseFloat(process.env.SCORE_EPSILON || "0.100"); // reaction signal
const λ = parseFloat(process.env.SCORE_LAMBDA  || "0.50");  // decay rate per hour

/**
 * Recompute scores for all active clusters in `meetingId`.
 * Mutates question objects in-place (synchronous — embeddings already cached).
 *
 * @param {string} meetingId
 * @param {Array}  [questionsArray] External cache array. Falls back to state.js if omitted.
 */
function recomputeScores(meetingId, questionsArray = null) {
  const allQ = questionsArray ?? state.getQuestionsForMeeting(meetingId);
  if (allQ.length === 0) return;

  const active   = allQ.filter(q => q.status !== "Answered" && q.status !== "Deferred" && q.status !== "Skipped");
  const answered = allQ.filter(q => q.status === "Answered");
  const now      = Date.now();

  // Max votes and reactions across active clusters (for normalisation)
  const maxVotes     = Math.max(1, ...active.map(q => q.votes || 0));
  const maxReactions = Math.max(1, ...active.map(q => q.reactionCount || 0));

  for (const q of active) {
    // V — vote normalisation [0,1]
    const V = (q.votes || 0) / maxVotes;

    // T — temporal freshness  exp(-λ·ageHours)
    const ageHours = (now - (q.createdAt || now)) / (1000 * 60 * 60);
    const T = Math.exp(-λ * ageHours);

    // S — novelty vs. answered clusters (1 = completely new topic)
    let maxSimToAnswered = 0;
    for (const aq of answered) {
      const sim = clusterSim(q, aq);
      if (sim > maxSimToAnswered) maxSimToAnswered = sim;
    }
    const S = 1 - maxSimToAnswered;

    // N — topical diversity vs. other active clusters (1 = unique)
    const others = active.filter(o => o.id !== q.id);
    let N = 1;
    if (others.length > 0) {
      const avgSim = others.reduce((sum, o) => sum + clusterSim(q, o), 0) / others.length;
      N = 1 - avgSim;
    }

    // E — reaction signal (normalised emoji reaction count)
    const E = (q.reactionCount || 0) / maxReactions;

    q.score = parseFloat((α * V + β * T + γ * S + δ * N + ε * E).toFixed(4));
  }

  // Answered/deferred questions keep their last computed score
}

// ── Self-test ─────────────────────────────────────────────────
if (require.main === module && process.argv.includes("--test")) {
  const mid = "m_score_test";
  state._questions[mid] = [
    {
      id: "sq1", meetingId: mid, text: "AI ethics in education",
      canonical_text: "AI ethics in education",
      votes: 10, createdAt: Date.now() - 2 * 3600000,
      score: 0, status: "Pending", members: ["AI ethics in education"]
    },
    {
      id: "sq2", meetingId: mid, text: "Data privacy in schools",
      canonical_text: "Data privacy in schools",
      votes: 5, createdAt: Date.now() - 5 * 3600000,
      score: 0, status: "Pending", members: ["Data privacy in schools"]
    },
    {
      id: "sq3", meetingId: mid, text: "AI ethics for students",
      canonical_text: "AI ethics for students",
      votes: 8, createdAt: Date.now() - 1 * 3600000,
      score: 0, status: "Answered", members: ["AI ethics for students"]
    }
  ];
  recomputeScores(mid);
  const qs = state.getQuestionsForMeeting(mid);
  console.log("\n=== Scoring Self-Test ===");
  qs.filter(q => q.status !== "Answered").forEach(q => {
    console.log(`  ${q.id}: votes=${q.votes} → score=${q.score}`);
    console.assert(q.score > 0 && q.score <= 1, `FAIL: score out of range for ${q.id}`);
  });
  const sq1 = qs.find(q => q.id === "sq1");
  const sq2 = qs.find(q => q.id === "sq2");
  console.assert(sq1.score > sq2.score, "FAIL: higher-vote question should score higher");
  console.log("Ordering test:", sq1.score > sq2.score ? "PASS ✓" : "FAIL ✗");
  console.log("=== Done ===\n");
}

module.exports = { recomputeScores };
