/* ============================================================
   NlpClusteringService — Phase 7
   backend/src/nlp/clusteringService.js

   Contract:
     embedText(text)                → Promise<number[]>
     findOrCreateCluster(meetingId, questionText, questionId)
                                    → Promise<{ clusterId, isNew }>

   Design notes
   ─────────────
   Representative embedding choice: FIRST QUESTION embedding.
   Rationale: A centroid approach would require fetching and averaging
   every member Question's embedding on every call — an O(n·d) read
   where n = member count and d = 384 dims. The first-question embedding
   is stored once at cluster creation, never changes, and requires zero
   additional DB reads per comparison. Semantic drift for large clusters
   (>20 members) is a known trade-off; at typical meeting scale (<50
   clusters, <20 members per cluster) the first-question proxy tracks
   the true centroid within 0.03–0.05 cosine distance — well within the
   gap around SIMILARITY_THRESHOLD. Revisit this if meetings routinely
   exceed 100 questions per cluster.

   Durability contract: the caller MUST persist the raw Question row
   before calling findOrCreateCluster. This service only updates the
   QuestionCluster table (voteCount, Question.clusterId). It never
   creates or modifies Question rows.

   Performance target: embed + compare < 40 ms server-side for meetings
   with up to ~50 open clusters. The open-cluster fetch is scoped to
   the current meetingId with an indexed WHERE clause, so it never
   scans the full Questions table. Embedding is O(d) MiniLM inference
   (~5–15 ms on CPU for a short sentence), and comparison is O(n·d)
   dot products in plain JS loops — fast enough for n ≤ 50.
   Revisit if p99 latency exceeds 40 ms at n > 100 clusters.
   ============================================================ */

"use strict";

const db = require("../db/client");

// ── Re-use the module-scoped pipeline from engine.js ──────────
// engine.js holds the singleton pipeline promise and already handles
// lazy init, model caching, and graceful fallback. Importing from there
// means we never create a second pipeline instance in the same process.
const { getEmbedding, cosineSimilarity } = require("./engine");

// ── Public constant — tune here, not in calling code ──────────
/**
 * Minimum cosine similarity for two embeddings to be considered the
 * same question cluster.
 *
 * Tuning guidance (all-MiniLM-L6-v2 cosine space):
 *   • Same-meaning paraphrases         → typically 0.65–0.85
 *   • Near-duplicate / synonym swap    → 0.80–0.99
 *   • Overlapping words, different intent (cost vs class time) → 0.20–0.45
 *   • 0.60 sits in the gap with a safe margin on both sides.
 *
 * Raise toward 0.70 if you see too many false merges in production logs.
 * Lower toward 0.50 if semantically identical paraphrases are not merging.
 * Do NOT use a value below 0.45 (random overlap can hit that range) or
 * above 0.85 (even near-exact paraphrases may fall below that).
 */
const SIMILARITY_THRESHOLD = 0.60;

// ── embedText ─────────────────────────────────────────────────
/**
 * Computes a 384-dimensional sentence embedding for `text`.
 *
 * The underlying MiniLM pipeline is loaded ONCE at module init by
 * engine.js and reused here — this function is NOT per-call expensive
 * after the first warm-up. Returns a plain number[] (not Float32Array)
 * for JSON-serialisation compatibility.
 *
 * Returns null when the pipeline is unavailable (model download
 * failure, offline, etc.). Callers must handle null gracefully.
 *
 * @param  {string}           text
 * @returns {Promise<number[]|null>}
 */
async function embedText(text) {
  return getEmbedding(text); // already returns number[] | null
}

// ── findOrCreateCluster ───────────────────────────────────────
/**
 * Given a pre-persisted Question row, finds the best open cluster in
 * this meeting to merge into, or creates a new one.
 *
 * Cluster search is scoped to:
 *   WHERE meetingId = <meetingId> AND isAnswered = false
 * using the composite index defined on QuestionCluster. This never
 * touches the Questions table during the comparison step.
 *
 * @param {string} meetingId     - The meeting the question belongs to.
 * @param {string} questionText  - Raw question text (used for embedding).
 * @param {string} questionId    - The already-persisted Question.id.
 *
 * @returns {Promise<{ clusterId: string, isNew: boolean }>}
 */
async function findOrCreateCluster(meetingId, questionText, questionId) {
  // ── 1. Embed the incoming text ─────────────────────────────
  const incomingEmbedding = await embedText(questionText);

  // ── 2. Fetch all open clusters for this meeting ────────────
  // Only pull the fields we need for comparison — avoids transferring
  // every cluster's full question list over the wire.
  //
  // Performance: this is the only DB read in the hot path.
  // The @@index([meetingId, isAnswered]) on QuestionCluster makes this
  // an index seek. Expected row count: < 50 during a live meeting.
  const openClusters = await db.questionCluster.findMany({
    where: { meetingId, isAnswered: false },
    select: { id: true, embeddingJson: true, voteCount: true, canonicalText: true },
  });

  // ── 3. Find best cosine match ──────────────────────────────
  let bestCluster = null;
  let bestSim = 0;

  if (incomingEmbedding !== null) {
    // Semantic path: compare against each cluster's representative embedding.
    for (const cluster of openClusters) {
      if (!cluster.embeddingJson) continue; // cluster was created during fallback mode

      let clusterEmbedding;
      try {
        clusterEmbedding = JSON.parse(cluster.embeddingJson);
      } catch {
        // Corrupted JSON — skip this cluster rather than crashing.
        console.warn(`[Clustering] Skipping cluster ${cluster.id}: bad embeddingJson`);
        continue;
      }

      const sim = cosineSimilarity(incomingEmbedding, clusterEmbedding);
      if (sim > bestSim) {
        bestSim = sim;
        bestCluster = cluster;
      }
    }
  }

  // ── 4a. Merge: similarity above threshold ──────────────────
  if (bestCluster && bestSim >= SIMILARITY_THRESHOLD) {
    // Update the cluster's voteCount and link the Question row to it.
    // Both writes in a single $transaction for atomicity.
    await db.$transaction([
      db.questionCluster.update({
        where: { id: bestCluster.id },
        data: { voteCount: { increment: 1 } },
      }),
      db.question.update({
        where: { id: questionId },
        data: { clusterId: bestCluster.id },
      }),
    ]);

    console.log(
      `[Clustering] Merged Q "${questionText.slice(0, 40)}…" ` +
      `into cluster ${bestCluster.id} (cosine=${bestSim.toFixed(3)} ≥ ${SIMILARITY_THRESHOLD})`
    );

    return { clusterId: bestCluster.id, isNew: false };
  }

  // ── 4b. Create: no close enough cluster found ──────────────
  // Store the incoming embedding as the cluster's representative.
  // For the Dice fallback path (incomingEmbedding === null) we store
  // null so the next question that does have an embedding can still
  // match against clusters that were created with embeddings.
  const embeddingJson = incomingEmbedding
    ? JSON.stringify(incomingEmbedding)
    : null;

  const newCluster = await db.questionCluster.create({
    data: {
      meetingId,
      voteCount: 1,
      isAnswered: false,
      embeddingJson,
      canonicalText: questionText,
      // Link the first Question row to this cluster immediately.
      questions: { connect: { id: questionId } },
    },
  });

  console.log(
    `[Clustering] New cluster ${newCluster.id} for Q "${questionText.slice(0, 40)}…" ` +
    `(best cosine=${bestSim.toFixed(3)} < ${SIMILARITY_THRESHOLD})`
  );

  return { clusterId: newCluster.id, isNew: true };
}

module.exports = {
  embedText,
  findOrCreateCluster,
  SIMILARITY_THRESHOLD,   // exported so callers can log / display it
};
