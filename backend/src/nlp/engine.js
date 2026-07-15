/* ============================================================
   NLP Engine — Lexical Similarity Clustering
   
   Uses Dice coefficient (bigram overlap) as a stand-in for the
   MiniLM/FAISS cosine-similarity pipeline described in the spec.
   Upgradeable: replace `diceCoefficient` with a vector embedding
   similarity call without changing any caller code.

   Threshold: process.env.NLP_THRESHOLD (default 0.40)
   A Dice of 0.40 on short questions (~8-12 words) corresponds
   roughly to 3-4 shared content bigrams — suitable for "same topic"
   deduplication without over-merging distinct questions.
   ============================================================ */

"use strict";
const crypto  = require("crypto");
const state   = require("../data/state"); // used only for self-test fallback
const { recomputeScores } = require("./scoring");

const THRESHOLD = parseFloat(process.env.NLP_THRESHOLD || "0.40");

// ── Dice Coefficient (character bigrams) ──────────────────────
/**
 * Returns a value in [0,1] where 1 = identical.
 * Pure JS — no external packages needed.
 */
function getBigrams(str) {
  const s = str.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const set = new Set();
  for (let i = 0; i < s.length - 1; i++) {
    set.add(s.slice(i, i + 2));
  }
  return set;
}

function diceCoefficient(a, b) {
  if (!a || !b) return 0;
  const ba = getBigrams(a);
  const bb = getBigrams(b);
  if (ba.size === 0 && bb.size === 0) return 1;
  if (ba.size === 0 || bb.size === 0) return 0;
  let intersection = 0;
  ba.forEach(bi => { if (bb.has(bi)) intersection++; });
  return (2 * intersection) / (ba.size + bb.size);
}

// ── Fluency heuristic (prefer longer, well-formed questions) ──
function fluencyScore(text) {
  // Simple proxy: normalised length capped at 120 chars
  return Math.min(text.trim().length / 120, 1);
}

// ── Choose the best canonical text from cluster members ───────
function bestCanonical(members) {
  return members.reduce((best, t) =>
    fluencyScore(t) >= fluencyScore(best) ? t : best
  , members[0]);
}

// ── Core function ─────────────────────────────────────────────
/**
 * processQuestion(meetingId, text, askedBy, questionsArray?)
 *
 * 1. Compare `text` against canonical_text of every active cluster.
 * 2. If similarity >= THRESHOLD → merge into best cluster.
 * 3. Else create a new cluster.
 * 4. Call recomputeScores.
 * 5. Return the cluster object (merged or new).
 *
 * @param {string}   meetingId      - Meeting ID for this question
 * @param {string}   text           - Raw question text
 * @param {string}   [askedBy]      - Display name of submitter
 * @param {Array}    [questionsArray] - External cache array (from api.js DB layer).
 *                                     If omitted, falls back to state.js (self-test/legacy).
 */
function processQuestion(meetingId, text, askedBy = "Anonymous", questionsArray = null) {
  const questions = questionsArray ?? state.getQuestionsForMeeting(meetingId);

  // Only cluster against active (non-answered, non-deferred) questions
  const active = questions.filter(q =>
    q.status !== "Answered" && q.status !== "Deferred" && q.status !== "Skipped"
  );

  let bestMatch = null;
  let bestSim   = 0;

  for (const q of active) {
    const sim = diceCoefficient(text, q.canonical_text);
    if (sim > bestSim) { bestSim = sim; bestMatch = q; }
  }

  let cluster;

  if (bestMatch && bestSim >= THRESHOLD) {
    // ── Merge ──────────────────────────────────────────────────
    bestMatch.members    = bestMatch.members || [bestMatch.text];
    bestMatch.members.push(text);
    bestMatch.votes     += 1;
    bestMatch.clusterSize = bestMatch.members.length;
    bestMatch.similar    = bestMatch.members.length;
    bestMatch.canonical_text = bestCanonical(bestMatch.members);
    bestMatch.timeline   = bestMatch.timeline || [];
    bestMatch.timeline.push(`Merged with similar question (Dice ${bestSim.toFixed(2)})`);
    cluster = bestMatch;
    console.log(`[NLP] Merged "${text.slice(0,40)}…" into cluster ${cluster.id} (Dice=${bestSim.toFixed(3)})`);
  } else {
    // ── New cluster ────────────────────────────────────────────
    cluster = {
      id:             `q_${crypto.randomUUID()}`,
      meetingId,
      text,
      canonical_text: text,
      members:        [text],
      votes:          1,
      asked:          "Just now",
      createdAt:      Date.now(),
      score:          0,
      status:         "Pending",
      similar:        1,
      clusterSize:    1,
      askedBy,
      assignedSpeakerId: null,
      summary:        "New question — clustering complete, scoring in progress.",
      timeline:       ["Submitted", "New cluster created"]
    };
    questions.unshift(cluster);
    console.log(`[NLP] New cluster for "${text.slice(0,40)}…" (best Dice=${bestSim.toFixed(3)} < ${THRESHOLD})`);
  }

  // Recompute scores — pass the array directly to avoid another state.js lookup
  recomputeScores(meetingId, questions);

  return cluster;
}

// ── Self-test (run with: node engine.js --test) ───────────────
if (require.main === module && process.argv.includes("--test")) {
  const mid = "m_test_" + Date.now();
  console.log("\n=== NLP Engine Self-Test ===");

  // Self-test uses state.js fallback (no DB in this context)
  const q1 = processQuestion(mid, "How can AI be used ethically in education?", "Alice");
  const q2 = processQuestion(mid, "How can AI be used ethically in education?", "Bob");
  console.assert(q1.id === q2.id, "FAIL: same text should merge");
  console.assert(q2.votes === 2,  "FAIL: votes should be 2 after merge");
  console.log("Test 1 (identical merge):", q1.id === q2.id ? "PASS ✓" : "FAIL ✗");

  const q3 = processQuestion(mid, "What is the ethical use of AI in schools?", "Carol");
  console.log("Test 2 (similar merge):", q3.id === q1.id ? "PASS ✓" : "SKIP — below threshold");

  const q4 = processQuestion(mid, "What is the capital of France?", "Dave");
  console.assert(q4.id !== q1.id, "FAIL: unrelated question should be new cluster");
  console.log("Test 3 (new cluster):", q4.id !== q1.id ? "PASS ✓" : "FAIL ✗");

  const qs = state.getQuestionsForMeeting(mid);
  console.log(`Total clusters: ${qs.length} (expected 2)`);
  console.log("=== Done ===\n");
}

module.exports = { processQuestion, diceCoefficient };
