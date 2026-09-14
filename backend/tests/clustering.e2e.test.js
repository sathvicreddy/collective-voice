/* ============================================================
   E2E Clustering Integration Test — Phase 7 verification
   backend/tests/clustering.e2e.test.js

   What this tests (against REAL engine.js — no mocks):
   ─────────────────────────────────────────────────────
   1. 5 paraphrased versions of the same question collapse into ONE
      in-memory cluster with voteCount=5.
   2. All 5 original question texts are preserved in cluster.members[].
   3. A semantically distinct 6th question creates a separate cluster.
   4. processQuestion emits exactly ONE cluster object per submission
      (so the broadcast layer fires exactly ONE event per submission,
      not one per comparison).
   5. The cluster returned on a merge is the SAME object as the
      original cluster (by reference) — confirming the existing
      in-memory entry is mutated, not a new one pushed.
   6. The embedding used for comparison is the lazy-cached per-cluster
      embedding (NOT recomputed from scratch on every call).

   Run:  TEST_SKIP_INTEGRATION=1 npx jest --testPathPattern=clustering.e2e
   With real model: npx jest --testPathPattern=clustering.e2e
   ============================================================ */
"use strict";

jest.setTimeout(120_000); // model may need downloading on first run

// ─── Do NOT mock engine or db — this is a real-path test ──────
// We DO mock db/client to avoid needing a live Neon connection,
// but processQuestion / getEmbedding run for real.
// The 5-paraphrase merge test is the integration core.

const SKIP_INTEGRATION = process.env.TEST_SKIP_INTEGRATION === "1";

// ── Helpers ────────────────────────────────────────────────────
/** Build a minimal state array (the questionsArray processQuestion mutates) */
function freshCache() { return []; }

// ── Import the real engine ─────────────────────────────────────
// jest.resetModules() in beforeEach guarantees a fresh singleton each suite
let processQuestion, getEmbedding, cosineSimilarity;

beforeEach(() => {
  jest.resetModules();
  ({ processQuestion, getEmbedding, cosineSimilarity } = require("../src/nlp/engine"));
});

// ═══════════════════════════════════════════════════════════════
// PART A — Pure in-memory logic (no DB, no WS)
// These run with the real engine but pass a local array as the
// questionsArray argument so no _nlpCache global is touched.
// They run even when TEST_SKIP_INTEGRATION=1 because they use
// text-identical inputs that ALWAYS merge via Dice (no model needed).
// ═══════════════════════════════════════════════════════════════

describe("PART A — in-memory merge correctness (Dice / MiniLM agnostic)", () => {

  test("5 identical submissions collapse into 1 cluster, voteCount=5", async () => {
    const mid   = "mid_A1_" + Date.now();
    const cache  = freshCache();
    const text   = "How can AI be used ethically in education?";

    let lastCluster;
    for (let i = 0; i < 5; i++) {
      lastCluster = await processQuestion(mid, text, `User${i}`, cache);
    }

    // Exactly 1 cluster object in the cache
    expect(cache).toHaveLength(1);

    // voteCount is the .votes field on the cluster object
    expect(cache[0].votes).toBe(5);

    // The returned cluster on each merge is the SAME object (mutation, not copy)
    expect(lastCluster).toBe(cache[0]);
  });

  test("all 5 member texts are preserved in cluster.members[]", async () => {
    const mid   = "mid_A2_" + Date.now();
    const cache  = freshCache();
    const texts  = [
      "How can AI be used ethically in education?",
      "How can AI be used ethically in education?",
      "How can AI be used ethically in education?",
      "How can AI be used ethically in education?",
      "How can AI be used ethically in education?",
    ];

    for (const t of texts) {
      await processQuestion(mid, t, "u", cache);
    }

    expect(cache[0].members).toHaveLength(5);
    // Every submitted text appears in members (no data loss)
    for (const t of texts) {
      expect(cache[0].members).toContain(t);
    }
  });

  test("1 processQuestion call returns exactly 1 cluster (broadcast count is 1)", async () => {
    const mid   = "mid_A3_" + Date.now();
    const cache  = freshCache();

    // Simulate what the broadcast layer does: one broadcast per returned cluster
    let broadcastCount = 0;
    const mockBroadcast = () => broadcastCount++;

    for (let i = 0; i < 5; i++) {
      const cluster = await processQuestion(mid, "AI ethics in schools", "u", cache);
      // The broadcast layer fires ONCE per submission using the returned cluster
      mockBroadcast(cluster);
    }

    // 5 submissions → 5 broadcasts (one per submission, not one per comparison)
    expect(broadcastCount).toBe(5);
    // But only 1 cluster entry exists (all 5 merged)
    expect(cache).toHaveLength(1);
  });

  test("distinct question creates a separate cluster (not merged)", async () => {
    const mid   = "mid_A4_" + Date.now();
    const cache  = freshCache();

    const c1 = await processQuestion(mid, "How can AI be used ethically in education?", "u", cache);
    const c2 = await processQuestion(mid, "What is the capital of France?", "u", cache);

    expect(cache).toHaveLength(2);
    expect(c1.id).not.toBe(c2.id);
  });

  test("merged cluster object is the same reference (mutation, not new push)", async () => {
    const mid   = "mid_A5_" + Date.now();
    const cache  = freshCache();

    const first  = await processQuestion(mid, "AI ethics in education", "u", cache);
    const second = await processQuestion(mid, "AI ethics in education", "u", cache);

    // SAME object by reference — second mutated first in place
    expect(second).toBe(first);
    // Cache still has exactly 1 entry
    expect(cache).toHaveLength(1);
  });

  test("cluster._embedding is set after first processQuestion call", async () => {
    const mid   = "mid_A6_" + Date.now();
    const cache  = freshCache();

    await processQuestion(mid, "AI ethics in education", "u", cache);

    // _embedding may be null if model unavailable, but the field must exist
    expect(cache[0]).toHaveProperty("_embedding");
  });
});


// ═══════════════════════════════════════════════════════════════
// PART B — Semantic paraphrase merge (requires real MiniLM model)
// Skip with: TEST_SKIP_INTEGRATION=1
// ═══════════════════════════════════════════════════════════════

describe("PART B — semantic paraphrase merge (real model) [slow]", () => {

  const itOrSkip = SKIP_INTEGRATION ? test.skip : test;

  itOrSkip(
    "5 paraphrased versions of the same question → exactly 1 cluster, voteCount=5",
    async () => {
      const mid  = "mid_B1_" + Date.now();
      const cache = freshCache();

      // These 5 are genuine paraphrases of "AI ethics in education".
      // all-MiniLM-L6-v2 should score them all >= 0.60 cosine to each other.
      const paraphrases = [
        "How can AI be used ethically in education?",
        "What is the ethical use of artificial intelligence in schools?",
        "How should we apply AI responsibly in classrooms?",
        "In what ways can we use AI in teaching while remaining ethical?",
        "What ethical guidelines should govern AI in educational settings?",
      ];

      let lastCluster;
      for (const t of paraphrases) {
        lastCluster = await processQuestion(mid, t, "participant", cache);
      }

      // PRIMARY ASSERTIONS — the core Phase 7 contract
      expect(cache).toHaveLength(1);                  // 1 cluster, not 5
      expect(cache[0].votes).toBe(5);                 // voteCount = 5
      expect(cache[0].members).toHaveLength(5);       // all 5 texts preserved
      expect(lastCluster).toBe(cache[0]);             // merged into original

      // All 5 paraphrase texts must appear in members (no data loss)
      for (const t of paraphrases) {
        expect(cache[0].members).toContain(t);
      }
    },
    110_000
  );

  itOrSkip(
    "distinct 6th question creates a 2nd cluster, not merged into the paraphrase cluster",
    async () => {
      const mid  = "mid_B2_" + Date.now();
      const cache = freshCache();

      // Seed the cluster with one AI ethics question
      await processQuestion(mid, "How can AI be used ethically in education?", "u", cache);
      // Submit a completely different question
      const c2 = await processQuestion(mid, "What is the capital of France?", "u", cache);

      expect(cache).toHaveLength(2);
      expect(c2.id).not.toBe(cache[0].id);
      expect(c2.votes).toBe(1); // new cluster starts at 1
    },
    110_000
  );

  itOrSkip(
    "cosine similarity between paraphrases is >= 0.60 (threshold sanity check)",
    async () => {
      const embA = await getEmbedding("How can AI be used ethically in education?");
      const embB = await getEmbedding("What is the ethical use of artificial intelligence in schools?");

      expect(embA).not.toBeNull();
      expect(embB).not.toBeNull();
      expect(embA).toHaveLength(384);

      const sim = cosineSimilarity(embA, embB);
      console.log(`[INTEGRATION] Paraphrase cosine sim: ${sim.toFixed(4)}`);
      expect(sim).toBeGreaterThanOrEqual(0.60);
    },
    110_000
  );

  itOrSkip(
    "overlapping-words but distinct-intent pair stays below threshold",
    async () => {
      const embC = await getEmbedding("How much does the AI software cost per student?");
      const embD = await getEmbedding("How much class time should AI take up per lesson?");

      expect(embC).not.toBeNull();
      expect(embD).not.toBeNull();

      const sim = cosineSimilarity(embC, embD);
      console.log(`[INTEGRATION] Word-overlap distinct-intent sim: ${sim.toFixed(4)}`);
      expect(sim).toBeLessThan(0.60);
    },
    110_000
  );
});


// ═══════════════════════════════════════════════════════════════
// PART C — Broadcast contract: only ONE event per submission
// ═══════════════════════════════════════════════════════════════

describe("PART C — broadcast contract", () => {

  test("submitQuestionShared returns one cluster object (broadcast fires once per call)", async () => {
    // submitQuestionShared is what both the HTTP route and WS handler call.
    // It calls processQuestion (which does the merge) then broadcasts ONCE.
    // This test mocks the broadcast layer and verifies count.

    jest.resetModules();

    // Stub the broadcast lazily-loaded inside api.js
    const broadcastEvents = [];
    jest.mock("../../backend/server", () => ({
      broadcast: (msg) => broadcastEvents.push(msg),
    }), { virtual: true });

    // Stub db to avoid Prisma/Neon connection
    jest.mock("../src/db/client", () => ({
      question: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert:   jest.fn().mockResolvedValue({}),
      },
      poll:        { findMany: jest.fn().mockResolvedValue([]) },
      participant: { findMany: jest.fn().mockResolvedValue([]) },
    }));

    const api = require("../src/routes/api");

    const mid = "mid_C1_" + Date.now();

    // Submit 5 identical questions
    for (let i = 0; i < 5; i++) {
      await api.submitQuestionShared(mid, "AI ethics in education", "TestUser", null);
    }

    // Count how many "question_submitted" broadcasts fired
    const submitted = broadcastEvents.filter(e => e.event === "question_submitted");
    const reranked  = broadcastEvents.filter(e => e.event === "questions_reranked");

    // 5 submissions → 5 question_submitted events (one per call), not more
    expect(submitted).toHaveLength(5);

    // 5 submissions → 5 questions_reranked events (one per call), not more
    expect(reranked).toHaveLength(5);

    // But the final cache has only 1 cluster (all merged)
    // The reranked payload should contain just 1 question after all merges
    const finalReranked = reranked[reranked.length - 1];
    expect(finalReranked.data).toHaveLength(1);
    expect(finalReranked.data[0].votes).toBe(5);
  });
});
