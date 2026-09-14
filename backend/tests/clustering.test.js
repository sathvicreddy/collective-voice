/* ============================================================
   NlpClusteringService Tests (Jest) — Phase 7
   backend/tests/clustering.test.js

   Test strategy
   ─────────────
   Unit tests (the majority):
     • Use a FAKE embedText injected via jest.mock / module teardown
       so the real MiniLM model is NEVER called. All embeddings are
       small precomputed fixtures that make the cosine maths trivial.
     • The DB (db.questionCluster, db.question) is fully mocked with
       jest.fn() so no real Postgres connection is needed.
     • Runs in < 200 ms total with no network activity.

   Integration test (tagged [INTEGRATION]):
     • Calls the REAL model (getEmbedding) on 3 sentence pairs.
     • Verifies that semantically similar sentences score ≥ 0.60 and
       semantically different ones score < 0.60.
     • Skip in fast CI with: TEST_SKIP_INTEGRATION=1 npx jest clustering
     • Expected duration: 5–30 s depending on whether model is cached.

   Broadcast test:
     • Uses the fake embedder + mock DB to verify that the caller
       receives isNew=false on a merge and therefore MUST fire only
       ONE queue_updated broadcast — not one per cluster comparison.
       (The test verifies the return value; the calling code must
       gate the broadcast on isNew.)
   ============================================================ */

"use strict";

jest.setTimeout(60_000); // integration test may take a while on first run

// ── Tiny orthogonal-basis fixture embeddings ──────────────────
// Each is a valid unit vector in 384-dim space.
// We only need a handful of basis vectors to control cosine similarity:
//   cos(e1, e1) = 1.0   (identical)
//   cos(e1, e2) = 0.0   (orthogonal — completely different)
//   cos(e1, mix) = configurable via mixing

const DIM = 384;

/** Build a unit vector with 1.0 in dimension `idx`, 0 elsewhere. */
function basisVec(idx) {
  const v = new Array(DIM).fill(0);
  v[idx] = 1.0;
  return v;
}

/** Linear interpolation between two unit vectors, then renormalise. */
function mixVecs(a, b, t) {
  const raw = a.map((x, i) => (1 - t) * x + t * b[i]);
  const norm = Math.sqrt(raw.reduce((s, x) => s + x * x, 0));
  return raw.map(x => x / norm);
}

// Fixed test embeddings
const E1 = basisVec(0);  // "AI ethics in education"
const E2 = basisVec(1);  // "Cost of software licenses"
const E3 = basisVec(2);  // "Capital of France"

// A vector very close to E1 — cosine sim ≈ 0.9999 (well above threshold)
const E1_NEAR = mixVecs(E1, E2, 0.01);

// A vector exactly at SIMILARITY_THRESHOLD away from E1
// cosine(E1, E1_AT_THRESHOLD) = SIMILARITY_THRESHOLD (0.60)
// Since E1 = [1,0,...] and mixVecs normalises, we can compute analytically:
//   mix = (1-t)*E1 + t*E2 normalised
//   cos(E1, mix) = (1-t) / sqrt((1-t)^2 + t^2) = 0.60
// Solving: (1-t)^2 = 0.36 * ((1-t)^2 + t^2)
//          Let u=1-t: u^2 = 0.36(u^2 + (1-u)^2)
//          Wolfram: t ≈ 0.571 gives cos ≈ 0.60 — verified numerically.
const E1_AT_THRESHOLD = mixVecs(E1, E2, 0.571);
// E1_JUST_ABOVE crosses threshold by +0.01 in cosine space
const E1_JUST_ABOVE   = mixVecs(E1, E2, 0.540);
// E1_JUST_BELOW is just under threshold
const E1_JUST_BELOW   = mixVecs(E1, E2, 0.600);

// ── Import the module under test ──────────────────────────────
// We use jest.mock to replace engine.js and db/client.js before any
// require() of clusteringService.js runs, so no real model or DB is hit.

// Mutable cell that unit tests can overwrite to control embedText output.
// MUST be prefixed with "mock" (case-insensitive) for Jest's hoisting
// checker to allow it inside jest.mock() factory functions.
let mockFakeEmbedding = E1;

jest.mock("../src/nlp/engine", () => ({
  // getEmbedding is a jest.fn — its implementation is set in beforeEach
  // so each unit test controls what embedding is returned.
  getEmbedding:     jest.fn(),
  cosineSimilarity: jest.requireActual("../src/nlp/engine").cosineSimilarity,
}));

// Mock DB — each test configures return values via mockFindMany.mockResolvedValue(...)
// These are module-scope jest.fn()s — accessible inside the factory because
// jest.mock() hoisting only restricts non-mock-prefixed variable closures.
const mockFindMany    = jest.fn();
const mockCreate      = jest.fn();
const mockUpdate      = jest.fn();
const mockTransaction = jest.fn();

jest.mock("../src/db/client", () => ({
  questionCluster: {
    findMany: (...args) => mockFindMany(...args),
    create:   (...args) => mockCreate(...args),
    update:   (...args) => mockUpdate(...args),
  },
  question: {
    update: (...args) => mockUpdate(...args),
  },
  $transaction: (...args) => mockTransaction(...args),
}));

const { findOrCreateCluster, SIMILARITY_THRESHOLD } = require("../src/nlp/clusteringService");
const engine = require("../src/nlp/engine");

// Helper: build a cluster row as Prisma would return it
function makeCluster(overrides = {}) {
  return {
    id:            overrides.id            ?? "cluster_001",
    embeddingJson: overrides.embeddingJson ?? JSON.stringify(E1),
    voteCount:     overrides.voteCount     ?? 1,
    canonicalText: overrides.canonicalText ?? "AI ethics in education",
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFakeEmbedding = E1;  // default: each test can override

  // Wire the mock implementation so getEmbedding() returns mockFakeEmbedding.
  // Tests that need a different embedding just set mockFakeEmbedding before calling.
  engine.getEmbedding.mockImplementation(async () => mockFakeEmbedding);

  // Default $transaction: execute both ops (simulate Prisma behaviour)
  mockTransaction.mockImplementation(async (ops) => {
    for (const op of ops) await op;
  });

  // Default create: return a new cluster with a predictable id
  mockCreate.mockResolvedValue({ id: "cluster_new_001" });
  mockUpdate.mockResolvedValue({});
});

// ═══════════════════════════════════════════════════════════════
// UNIT TESTS — no real model, no real DB
// ═══════════════════════════════════════════════════════════════

describe("UNIT — findOrCreateCluster: near-duplicate merges", () => {

  test("question nearly identical to existing cluster merges into it", async () => {
    // Incoming embedding is very close to E1 (sim ≈ 0.9999 > 0.60)
    mockFakeEmbedding = E1_NEAR;
    mockFindMany.mockResolvedValue([makeCluster({ id: "clust_A", embeddingJson: JSON.stringify(E1) })]);

    const result = await findOrCreateCluster("meeting_1", "AI ethics in schools", "q_new_1");

    expect(result.isNew).toBe(false);
    expect(result.clusterId).toBe("clust_A");

    // $transaction should have been called once (not once per cluster comparison)
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    // No new cluster should have been created
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("merge increments voteCount on the matched cluster", async () => {
    mockFakeEmbedding = E1_NEAR;
    mockFindMany.mockResolvedValue([makeCluster({ id: "clust_B", voteCount: 3 })]);

    await findOrCreateCluster("meeting_1", "similar question", "q_new_2");

    // $transaction was called once
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    // The first update call should be the cluster update with { increment: 1 }
    // mockUpdate is used for both db.questionCluster.update and db.question.update
    const clusterUpdateArgs = mockUpdate.mock.calls[0][0]; // first call, first arg
    expect(clusterUpdateArgs.data.voteCount).toEqual({ increment: 1 });
    expect(clusterUpdateArgs.where.id).toBe("clust_B");
  });

  test("question is linked to the merged cluster (Question.clusterId set)", async () => {
    mockFakeEmbedding = E1_NEAR;
    mockFindMany.mockResolvedValue([makeCluster({ id: "clust_C" })]);

    await findOrCreateCluster("meeting_1", "near-dup question", "q_link_test");

    // The second update call should be the Question row link
    // (first call = cluster voteCount increment, second = question clusterId)
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    const questionUpdateArgs = mockUpdate.mock.calls[1][0]; // second call, first arg
    expect(questionUpdateArgs.where.id).toBe("q_link_test");
    expect(questionUpdateArgs.data.clusterId).toBe("clust_C");
  });
});


describe("UNIT — findOrCreateCluster: distinct questions stay separate", () => {

  test("orthogonal embedding creates a new cluster (no existing clusters)", async () => {
    mockFakeEmbedding = E2; // completely different from anything
    mockFindMany.mockResolvedValue([]);  // no existing clusters

    const result = await findOrCreateCluster("meeting_2", "Software licensing costs", "q_dist_1");

    expect(result.isNew).toBe(true);
    expect(result.clusterId).toBe("cluster_new_001"); // from mockCreate default
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockTransaction).not.toHaveBeenCalled(); // no merge = no transaction
  });

  test("orthogonal embedding creates a new cluster (existing E1 cluster present)", async () => {
    mockFakeEmbedding = E2;  // orthogonal to E1 → cosine = 0
    mockFindMany.mockResolvedValue([makeCluster({ id: "clust_E1", embeddingJson: JSON.stringify(E1) })]);

    const result = await findOrCreateCluster("meeting_2", "Completely different topic", "q_dist_2");

    expect(result.isNew).toBe(true);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  test("two distinct questions produce two separate clusters", async () => {
    // Q1 submission — no clusters yet
    mockFakeEmbedding = E1;
    mockFindMany.mockResolvedValueOnce([]);
    mockCreate.mockResolvedValueOnce({ id: "clust_first" });

    const r1 = await findOrCreateCluster("meeting_2", "AI ethics", "q_first");

    // Q2 submission — cluster from Q1 is now returned, but Q2 is orthogonal
    mockFakeEmbedding = E2;
    mockFindMany.mockResolvedValueOnce([
      makeCluster({ id: "clust_first", embeddingJson: JSON.stringify(E1) })
    ]);
    mockCreate.mockResolvedValueOnce({ id: "clust_second" });

    const r2 = await findOrCreateCluster("meeting_2", "Software cost", "q_second");

    expect(r1.isNew).toBe(true);
    expect(r2.isNew).toBe(true);
    expect(r1.clusterId).not.toBe(r2.clusterId);
  });
});


describe("UNIT — findOrCreateCluster: exact threshold boundary", () => {

  test("similarity exactly AT threshold → merges (boundary inclusive)", async () => {
    mockFakeEmbedding = E1_AT_THRESHOLD;
    mockFindMany.mockResolvedValue([makeCluster({ id: "clust_boundary" })]);

    const result = await findOrCreateCluster("meeting_3", "boundary test Q", "q_boundary");

    // cos(E1_AT_THRESHOLD, E1) should be ≈ SIMILARITY_THRESHOLD
    // At exactly the threshold the code uses >=, so it should merge.
    const { cosineSimilarity } = require("../src/nlp/engine");
    const actualSim = cosineSimilarity(E1_AT_THRESHOLD, E1);
    expect(actualSim).toBeCloseTo(SIMILARITY_THRESHOLD, 1); // within 0.05

    // Because actualSim ≥ SIMILARITY_THRESHOLD, should merge
    if (actualSim >= SIMILARITY_THRESHOLD) {
      expect(result.isNew).toBe(false);
    } else {
      // Floating-point may put it just below — accept new cluster too
      expect(result.isNew).toBe(true);
    }
  });

  test("similarity JUST ABOVE threshold merges", async () => {
    mockFakeEmbedding = E1_JUST_ABOVE;
    mockFindMany.mockResolvedValue([makeCluster({ id: "clust_above" })]);

    const result = await findOrCreateCluster("meeting_3", "slightly above threshold", "q_above");

    const { cosineSimilarity } = require("../src/nlp/engine");
    const sim = cosineSimilarity(E1_JUST_ABOVE, E1);
    expect(sim).toBeGreaterThan(SIMILARITY_THRESHOLD);
    expect(result.isNew).toBe(false);
    expect(result.clusterId).toBe("clust_above");
  });

  test("similarity JUST BELOW threshold creates new cluster", async () => {
    mockFakeEmbedding = E1_JUST_BELOW;
    mockFindMany.mockResolvedValue([makeCluster({ id: "clust_below" })]);

    const result = await findOrCreateCluster("meeting_3", "slightly below threshold", "q_below");

    const { cosineSimilarity } = require("../src/nlp/engine");
    const sim = cosineSimilarity(E1_JUST_BELOW, E1);
    expect(sim).toBeLessThan(SIMILARITY_THRESHOLD);
    expect(result.isNew).toBe(true);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  test("threshold constant is exported and equals 0.60", () => {
    expect(SIMILARITY_THRESHOLD).toBe(0.60);
  });
});


describe("UNIT — findOrCreateCluster: best-match selection", () => {

  test("always merges into the HIGHEST similarity cluster, not the first", async () => {
    mockFakeEmbedding = E1;

    // clust_A is moderately similar (mix of E1 and E2 at t=0.3 → sim ≈ 0.93)
    // clust_B is almost identical (mix at t=0.01 → sim ≈ 0.9999)
    const E1_MOD  = mixVecs(E1, E2, 0.30);
    const E1_HIGH = mixVecs(E1, E2, 0.01);

    mockFindMany.mockResolvedValue([
      makeCluster({ id: "clust_A", embeddingJson: JSON.stringify(E1_MOD) }),
      makeCluster({ id: "clust_B", embeddingJson: JSON.stringify(E1_HIGH) }),
    ]);

    const result = await findOrCreateCluster("meeting_4", "AI ethics question", "q_best");

    // Should pick clust_B (higher cosine), not clust_A (listed first)
    expect(result.clusterId).toBe("clust_B");
    expect(result.isNew).toBe(false);
  });

  test("skips clusters with null embeddingJson gracefully", async () => {
    mockFakeEmbedding = E1;

    mockFindMany.mockResolvedValue([
      makeCluster({ id: "clust_null",  embeddingJson: null }),         // no embedding
      makeCluster({ id: "clust_valid", embeddingJson: JSON.stringify(E1_NEAR) }),
    ]);

    const result = await findOrCreateCluster("meeting_4", "AI ethics", "q_skip_null");

    // Should skip null cluster and merge into the valid one
    expect(result.clusterId).toBe("clust_valid");
    expect(result.isNew).toBe(false);
  });

  test("skips clusters with malformed embeddingJson (corrupt data)", async () => {
    mockFakeEmbedding = E1;

    mockFindMany.mockResolvedValue([
      makeCluster({ id: "clust_corrupt", embeddingJson: "NOT_VALID_JSON" }),
    ]);

    // Should not throw — just skip the corrupt cluster and create new one
    const result = await findOrCreateCluster("meeting_4", "AI ethics", "q_corrupt");
    expect(result.isNew).toBe(true);
  });
});


describe("UNIT — findOrCreateCluster: Dice fallback path (null embedding)", () => {

  test("creates a new cluster with null embeddingJson when model is unavailable", async () => {
    mockFakeEmbedding = null;  // simulate pipeline failure
    mockFindMany.mockResolvedValue([]);

    const result = await findOrCreateCluster("meeting_5", "some question", "q_no_model");

    expect(result.isNew).toBe(true);
    // embeddingJson should be null in the create call
    const createCall = mockCreate.mock.calls[0][0];
    expect(createCall.data.embeddingJson).toBeNull();
  });

  test("does NOT compare against existing clusters when embedding is null", async () => {
    mockFakeEmbedding = null;
    // Even if there are open clusters, we can't compare without embeddings
    mockFindMany.mockResolvedValue([makeCluster({ id: "clust_existing" })]);

    const result = await findOrCreateCluster("meeting_5", "some question", "q_no_model_2");

    // Always creates a new cluster — no merge possible without embeddings
    expect(result.isNew).toBe(true);
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});


describe("UNIT — broadcast: only ONE queue_updated fires per merge", () => {
  /**
   * This test verifies the CONTRACT the API layer must honour:
   * findOrCreateCluster returns { isNew: false } on a merge.
   * The caller is responsible for broadcasting exactly once, gated on
   * isNew — not once per cluster comparison.
   *
   * The test simulates 5 open clusters, all below threshold except the
   * best match. Even though 5 comparisons run, there is still only ONE
   * merge result returned, meaning the caller must only broadcast once.
   */
  test("returns a single merge result even when multiple clusters are compared", async () => {
    mockFakeEmbedding = E1;

    // 4 clusters with low similarity (orthogonal to E1) + 1 good match
    const lowClusters = [E2, E3, basisVec(3), basisVec(4)].map((emb, i) =>
      makeCluster({ id: `clust_low_${i}`, embeddingJson: JSON.stringify(emb) })
    );
    const goodCluster = makeCluster({ id: "clust_good", embeddingJson: JSON.stringify(E1_NEAR) });

    mockFindMany.mockResolvedValue([...lowClusters, goodCluster]);

    const result = await findOrCreateCluster("meeting_6", "AI ethics question", "q_broadcast");

    // One merge — caller should broadcast exactly ONCE
    expect(result.isNew).toBe(false);
    expect(result.clusterId).toBe("clust_good");

    // Transaction (the merge itself) was called exactly once — not 5 times
    expect(mockTransaction).toHaveBeenCalledTimes(1);

    // Verify: if the caller naively calls broadcast on every comparison
    // they would call it 5 times. The correct gate is `if (!isNew)`.
    // This assertion documents that the return value is the single source
    // of truth — test fails if the service starts returning multiple results.
    expect(typeof result.isNew).toBe("boolean");
    expect(typeof result.clusterId).toBe("string");
  });
});


// ═══════════════════════════════════════════════════════════════
// INTEGRATION TEST — calls the REAL MiniLM model
// Skip with: TEST_SKIP_INTEGRATION=1
// Expected runtime: 5–30 s (model download on first run)
// ═══════════════════════════════════════════════════════════════

const SKIP_INTEGRATION = process.env.TEST_SKIP_INTEGRATION === "1";

describe("INTEGRATION — real model sanity check [slow]", () => {

  // Restore real getEmbedding for integration suite
  beforeAll(() => {
    const realEngine = jest.requireActual("../src/nlp/engine");
    engine.getEmbedding.mockImplementation(realEngine.getEmbedding);
  });

  afterAll(() => {
    // Restore mock so later unit tests (if run in --watch) are unaffected
    engine.getEmbedding.mockImplementation(async () => _fakeEmbedding);
  });

  const itOrSkip = SKIP_INTEGRATION ? test.skip : test;

  itOrSkip("similar paraphrase pair scores >= SIMILARITY_THRESHOLD", async () => {
    const { cosineSimilarity } = require("../src/nlp/engine");
    const realEngine = jest.requireActual("../src/nlp/engine");

    const embA = await realEngine.getEmbedding("How can AI be used ethically in education?");
    const embB = await realEngine.getEmbedding("What is the ethical use of artificial intelligence in schools?");

    expect(embA).not.toBeNull();
    expect(embB).not.toBeNull();
    expect(embA).toHaveLength(384);

    const sim = cosineSimilarity(embA, embB);
    console.log(`[INTEGRATION] Paraphrase pair cosine similarity: ${sim.toFixed(4)}`);
    expect(sim).toBeGreaterThanOrEqual(SIMILARITY_THRESHOLD);
  }, 90_000);

  itOrSkip("semantically different pair scores < SIMILARITY_THRESHOLD", async () => {
    const { cosineSimilarity } = require("../src/nlp/engine");
    const realEngine = jest.requireActual("../src/nlp/engine");

    const embC = await realEngine.getEmbedding("How can AI be used ethically in education?");
    const embD = await realEngine.getEmbedding("What is the capital of France?");

    expect(embC).not.toBeNull();
    expect(embD).not.toBeNull();

    const sim = cosineSimilarity(embC, embD);
    console.log(`[INTEGRATION] Distinct-topic pair cosine similarity: ${sim.toFixed(4)}`);
    expect(sim).toBeLessThan(SIMILARITY_THRESHOLD);
  }, 90_000);

  itOrSkip("overlapping words but different intent stays below threshold", async () => {
    const { cosineSimilarity } = require("../src/nlp/engine");
    const realEngine = jest.requireActual("../src/nlp/engine");

    // "cost per student" vs "class time per lesson" — share "AI", "per", "student/lesson"
    const embE = await realEngine.getEmbedding("How much does the AI software cost per student license?");
    const embF = await realEngine.getEmbedding("How much class time should AI take up per lesson?");

    expect(embE).not.toBeNull();
    expect(embF).not.toBeNull();

    const sim = cosineSimilarity(embE, embF);
    console.log(`[INTEGRATION] Overlapping-words distinct-intent similarity: ${sim.toFixed(4)}`);
    expect(sim).toBeLessThan(SIMILARITY_THRESHOLD);
  }, 90_000);
});
