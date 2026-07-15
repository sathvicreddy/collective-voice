/* ============================================================
   NLP Scoring Engine
   
   Implements the composite score formula:
     score = α·V + β·T + γ·S + δ·N
   
   Where:
     V = vote normalisation   — how popular vs the meeting's top question
     T = temporal freshness   — exp(-λ·ageInHours), λ = 0.5
     S = content novelty      — 1 - max Dice similarity to answered clusters
     N = topical diversity    — 1 - avg Dice similarity to OTHER active clusters
   
   Weights (tunable via env):
     α = 0.40  (votes matter most)
     β = 0.25  (freshness)
     γ = 0.20  (differs from already-answered content)
     δ = 0.15  (diverse vs other queued questions)
   
   Called after every submit, upvote, or moderator action.
   ============================================================ */

"use strict";
const state = require("../data/state");

// Inline Dice coefficient to avoid circular dependency with engine.js
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

const α = parseFloat(process.env.SCORE_ALPHA   || "0.40");
const β = parseFloat(process.env.SCORE_BETA    || "0.25");
const γ = parseFloat(process.env.SCORE_GAMMA   || "0.20");
const δ = parseFloat(process.env.SCORE_DELTA   || "0.15");
const λ = parseFloat(process.env.SCORE_LAMBDA  || "0.50");  // decay rate per hour

/**
 * Recompute scores for all active clusters in `meetingId`.
 * Mutates the question objects in-place.
 *
 * @param {string} meetingId
 * @param {Array}  [questionsArray] - External cache array. Falls back to state.js if omitted.
 */
function recomputeScores(meetingId, questionsArray = null) {
  const allQ = questionsArray ?? state.getQuestionsForMeeting(meetingId);
  if (allQ.length === 0) return;

  const active   = allQ.filter(q => q.status !== "Answered" && q.status !== "Deferred" && q.status !== "Skipped");
  const answered = allQ.filter(q => q.status === "Answered");
  const now      = Date.now();

  // Max votes across active clusters (for normalisation)
  const maxVotes = Math.max(1, ...active.map(q => q.votes || 0));

  for (const q of active) {
    // V — vote normalisation [0,1]
    const V = (q.votes || 0) / maxVotes;

    // T — temporal freshness  exp(-λ·ageHours)
    const ageHours = (now - (q.createdAt || now)) / (1000 * 60 * 60);
    const T = Math.exp(-λ * ageHours);

    // S — novelty vs answered clusters (1 = completely different, 0 = already answered)
    let maxSimToAnswered = 0;
    for (const aq of answered) {
      const sim = diceCoefficient(q.canonical_text || q.text, aq.canonical_text || aq.text);
      if (sim > maxSimToAnswered) maxSimToAnswered = sim;
    }
    const S = 1 - maxSimToAnswered;

    // N — topical diversity vs other active clusters (1 = unique, 0 = duplicate)
    const others = active.filter(o => o.id !== q.id);
    let N = 1;
    if (others.length > 0) {
      const avgSim = others.reduce((sum, o) =>
        sum + diceCoefficient(q.canonical_text || q.text, o.canonical_text || o.text), 0
      ) / others.length;
      N = 1 - avgSim;
    }

    q.score = parseFloat((α * V + β * T + γ * S + δ * N).toFixed(4));
  }

  // Answered/deferred questions keep their last computed score (no recalc needed)
}

// ── Self-test ─────────────────────────────────────────────────
if (require.main === module && process.argv.includes("--test")) {
  // Inline circular-dep workaround for self-test
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
  // sq1 has more votes → should score higher than sq2
  const sq1 = qs.find(q => q.id === "sq1");
  const sq2 = qs.find(q => q.id === "sq2");
  console.assert(sq1.score > sq2.score, "FAIL: higher-vote question should score higher");
  console.log("Ordering test:", sq1.score > sq2.score ? "PASS ✓" : "FAIL ✗");
  console.log("=== Done ===\n");
}

module.exports = { recomputeScores };
