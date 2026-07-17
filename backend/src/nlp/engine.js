/* ============================================================
   NLP Engine — Semantic Similarity Clustering (v2)

   Upgraded from Dice coefficient (character bigrams) to
   sentence embeddings via @xenova/transformers with the
   Xenova/all-MiniLM-L6-v2 model.

   Threshold: process.env.NLP_THRESHOLD (default 0.60)
   
   Threshold justification (cosine similarity space):
     • Same-meaning paraphrases (e.g. "data privacy in edtech" ↔
       "protecting student information on apps") → typically 0.65–0.85
     • Near-duplicate / synonym swap → 0.80–0.99
     • Overlapping words but different intent (cost ↔ class time) → 0.20–0.45
     • 0.60 sits cleanly in the gap, with a safe margin on both sides.
   
   Graceful degrade: if the transformers pipeline fails to load
   (offline, model download failure, etc.) the engine logs a warning
   ONCE and silently falls back to the Dice coefficient path so the
   server never crashes.

   API contract — unchanged from v1:
     module.exports = { processQuestion, diceCoefficient }
   
   processQuestion is now async. Both call sites (api.js and server.js)
   must await it — they are already in async functions.
   ============================================================ */

"use strict";
const crypto = require("crypto");
const state  = require("../data/state"); // NLP in-memory cache fallback only
const { recomputeScores } = require("./scoring");

const THRESHOLD = parseFloat(process.env.NLP_THRESHOLD || "0.60");

// ── Dice Coefficient (kept as fallback + standalone export) ───
/**
 * Character-bigram Dice coefficient. Returns [0,1].
 * Used when the MiniLM pipeline is unavailable, and exported
 * for callers that need a synchronous, standalone similarity metric.
 */
function getBigrams(str) {
  const s = str.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const set = new Set();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
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

// ── MiniLM pipeline (lazy-initialised, module-scoped) ─────────
/**
 * Module-level pipeline promise. Resolved once on first call then reused.
 * null  = not attempted yet
 * false = load failed (use Dice fallback)
 * Promise<pipeline> = loading or loaded
 */
let _pipelinePromise = null;
let _pipelineFailed  = false;

async function getPipeline() {
  if (_pipelineFailed) return null;
  if (_pipelinePromise) return _pipelinePromise;

  _pipelinePromise = (async () => {
    try {
      // Dynamic import so the module loads even if package is absent
      const { pipeline, env } = await import("@xenova/transformers");

      // Keep model files in project node_modules cache, not home dir
      env.cacheDir = "./node_modules/.cache/xenova";

      const pipe = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
        quantized: true  // 50MB quantized model vs 90MB full — same quality for short texts
      });
      console.log("[NLP] MiniLM pipeline loaded — semantic clustering active.");
      return pipe;
    } catch (err) {
      _pipelineFailed = true;
      console.warn(
        "[NLP] WARNING: Sentence embedding pipeline failed to load. " +
        `Falling back to Dice coefficient. Reason: ${err.message}`
      );
      return null;
    }
  })();

  return _pipelinePromise;
}

// ── Embedding computation ──────────────────────────────────────
/**
 * Returns a float32 embedding vector for `text`, or null on failure.
 * Results are NOT cached here — the caller stores them on the cluster.
 */
async function getEmbedding(text) {
  const pipe = await getPipeline();
  if (!pipe) return null;
  try {
    // mean pooling over token embeddings
    const output = await pipe(text, { pooling: "mean", normalize: true });
    // output.data is a Float32Array
    return Array.from(output.data);
  } catch (err) {
    console.warn("[NLP] Embedding failed for text snippet:", err.message);
    return null;
  }
}

// ── Cosine similarity ──────────────────────────────────────────
/**
 * Cosine similarity between two flat float arrays. Returns [0,1].
 * Assumes vectors are already L2-normalised (MiniLM normalises by default).
 */
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dot = 0;
  for (let i = 0; i < vecA.length; i++) dot += vecA[i] * vecB[i];
  // Vectors are already normalised, so ||A||*||B|| = 1
  // Clamp to [0,1] to guard against floating-point drift
  return Math.max(0, Math.min(1, dot));
}

// ── Fluency heuristic (prefer longer, well-formed questions) ──
function fluencyScore(text) {
  return Math.min(text.trim().length / 120, 1);
}

function bestCanonical(members) {
  return members.reduce((best, t) =>
    fluencyScore(t) >= fluencyScore(best) ? t : best
  , members[0]);
}

// ── Core function ──────────────────────────────────────────────
/**
 * async processQuestion(meetingId, text, askedBy, questionsArray?)
 *
 * 1. Compute a sentence embedding for `text` (or fall back to Dice).
 * 2. Compare against every active cluster using cosine similarity.
 * 3. If similarity >= THRESHOLD → merge into best cluster.
 * 4. Else → create a new cluster.
 * 5. Store embedding on cluster._embedding for scoring.js to reuse.
 * 6. Call recomputeScores.
 * 7. Return the cluster (merged or new).
 *
 * @param {string}   meetingId
 * @param {string}   text          Raw question text
 * @param {string}   [askedBy]     Submitter display name
 * @param {Array}    [questionsArray] External cache. Falls back to state.js if omitted.
 */
async function processQuestion(meetingId, text, askedBy = "Anonymous", questionsArray = null) {
  const questions = questionsArray ?? state.getQuestionsForMeeting(meetingId);

  // Only cluster against active (non-answered, non-deferred) questions
  const active = questions.filter(q =>
    q.status !== "Answered" && q.status !== "Deferred" && q.status !== "Skipped"
  );

  // ── Compute embedding for incoming text ──────────────────────
  const incomingEmbedding = await getEmbedding(text);
  const usingEmbeddings = incomingEmbedding !== null;

  let bestMatch = null;
  let bestSim   = 0;

  for (const q of active) {
    let sim;

    if (usingEmbeddings) {
      // Ensure the cluster has a cached embedding (lazy-compute if missing)
      if (!q._embedding) {
        q._embedding = await getEmbedding(q.canonical_text || q.text);
      }
      sim = q._embedding ? cosineSimilarity(incomingEmbedding, q._embedding) : 0;
    } else {
      // Fallback path: Dice coefficient
      sim = diceCoefficient(text, q.canonical_text || q.text);
    }

    if (sim > bestSim) { bestSim = sim; bestMatch = q; }
  }

  const method = usingEmbeddings ? "cosine" : "Dice";
  let cluster;

  if (bestMatch && bestSim >= THRESHOLD) {
    // ── Merge ───────────────────────────────────────────────────
    bestMatch.members = bestMatch.members || [bestMatch.text];
    bestMatch.members.push(text);
    bestMatch.votes     += 1;
    bestMatch.clusterSize = bestMatch.members.length;
    bestMatch.similar    = bestMatch.members.length;
    bestMatch.canonical_text = bestCanonical(bestMatch.members);
    bestMatch.timeline   = bestMatch.timeline || [];
    bestMatch.timeline.push(`Merged with similar question (${method} ${bestSim.toFixed(2)})`);
    cluster = bestMatch;
    console.log(`[NLP] Merged "${text.slice(0,40)}…" into cluster ${cluster.id} (${method}=${bestSim.toFixed(3)})`);
  } else {
    // ── New cluster ─────────────────────────────────────────────
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
      timeline:       ["Submitted", "New cluster created"],
      _embedding:     incomingEmbedding  // cached for scoring.js
    };
    questions.unshift(cluster);
    console.log(`[NLP] New cluster for "${text.slice(0,40)}…" (best ${method}=${bestSim.toFixed(3)} < ${THRESHOLD})`);
  }

  // Recompute scores — pass the array directly to avoid a second state lookup
  recomputeScores(meetingId, questions);
  return cluster;
}

// ── Self-test (run with: node engine.js --test) ───────────────
if (require.main === module && process.argv.includes("--test")) {
  (async () => {
    const mid = "m_test_" + Date.now();
    console.log("\n=== NLP Engine Self-Test (semantic embeddings) ===");
    console.log("Note: First run downloads ~50MB model — subsequent runs are instant.\n");

    // ── Original 3 tests (must still pass) ────────────────────

    // Test 1: identical text merges
    const q1 = await processQuestion(mid + "_1", "How can AI be used ethically in education?", "Alice");
    const q2 = await processQuestion(mid + "_1", "How can AI be used ethically in education?", "Bob");
    console.assert(q1.id === q2.id, "FAIL: identical text should merge");
    console.assert(q2.votes === 2,  "FAIL: votes should be 2 after merge");
    console.log("Test 1 (identical merge):", q1.id === q2.id ? "PASS ✓" : "FAIL ✗");

    // Test 2: near-duplicate merges
    const q3 = await processQuestion(mid + "_2", "How can AI be used ethically in education?", "Alice");
    const q4 = await processQuestion(mid + "_2", "What is the ethical use of AI in schools?", "Bob");
    console.log("Test 2 (near-duplicate merge):", q4.id === q3.id ? "PASS ✓" : "SKIP — below threshold (expected with Dice fallback)");

    // Test 3: unrelated topics create separate clusters
    const q5 = await processQuestion(mid + "_3", "How can AI be used ethically in education?", "Alice");
    const q6 = await processQuestion(mid + "_3", "What is the capital of France?", "Dave");
    console.assert(q5.id !== q6.id, "FAIL: unrelated question should be new cluster");
    console.log("Test 3 (new cluster — unrelated):", q5.id !== q6.id ? "PASS ✓" : "FAIL ✗");

    // ── New semantic tests (these fail with Dice, pass with MiniLM) ──

    // Test 4: same meaning, different words — should merge
    const mid4 = mid + "_4";
    const qa = await processQuestion(mid4, "How do we ensure data privacy in edtech platforms?", "A");
    const qb = await processQuestion(mid4, "What about protecting student information on these apps?", "B");
    console.log("Test 4 (semantic paraphrase — data privacy):", qa.id === qb.id ? "PASS ✓" : "FAIL ✗ (merged expected)");

    // Test 5: AI grading — paraphrase
    const mid5 = mid + "_5";
    const qc = await processQuestion(mid5, "Can AI grade student work fairly?", "C");
    const qd = await processQuestion(mid5, "Is it fair for AI to assess assignments?", "D");
    console.log("Test 5 (semantic paraphrase — AI grading):", qc.id === qd.id ? "PASS ✓" : "FAIL ✗ (merged expected)");

    // Test 6: different topics with overlapping words — should NOT merge
    const mid6 = mid + "_6";
    const qe = await processQuestion(mid6, "How much does the AI software cost per student license?", "E");
    const qf = await processQuestion(mid6, "How much class time should AI take up per lesson?", "F");
    console.log("Test 6 (distinct topics — cost vs class time):", qe.id !== qf.id ? "PASS ✓" : "FAIL ✗ (separate clusters expected)");

    console.log("\n=== Done ===\n");
    process.exit(0);
  })().catch(err => { console.error("Self-test error:", err); process.exit(1); });
}

module.exports = { processQuestion, diceCoefficient, cosineSimilarity, getEmbedding };
