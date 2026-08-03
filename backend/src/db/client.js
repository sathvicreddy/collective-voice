// backend/src/db/client.js
// Singleton Prisma client — import this everywhere instead of @prisma/client directly.
// This ensures only one connection pool is open per process.
//
// Uses @neondatabase/serverless + @prisma/adapter-neon when DATABASE_URL is a
// PostgreSQL connection string. This routes all traffic over WebSockets (port 443)
// instead of native TCP (port 5432), so the DB works even behind restrictive firewalls.
"use strict";

const { PrismaClient } = require("@prisma/client");

const DATABASE_URL = process.env.DATABASE_URL || "";
const isPostgres = DATABASE_URL.startsWith("postgresql://") || DATABASE_URL.startsWith("postgres://");

// Errors that mean the Neon WS connection was dropped — recoverable by reconnecting.
const NEON_TRANSIENT = [
  "Connection terminated unexpectedly",
  "Connection terminated",
  "connect ECONNREFUSED",
  "ECONNRESET",
  "WebSocket was closed before the connection was established",
];

function isTransient(err) {
  const msg = err?.message || err?.toString() || "";
  return NEON_TRANSIENT.some(s => msg.includes(s));
}

async function withRetry(fn, retries = 3, delayMs = 150) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt < retries && isTransient(err)) {
        console.warn(`[DB] Transient error (attempt ${attempt}/${retries}): ${err.message} — retrying in ${delayMs}ms`);
        await new Promise(r => setTimeout(r, delayMs));
        delayMs *= 2; // exponential back-off
        continue;
      }
      throw err;
    }
  }
}

function createClient() {
  if (isPostgres) {
    // Use Neon serverless adapter — all traffic over wss:// (port 443), never port 5432.
    const { Pool, neonConfig } = require("@neondatabase/serverless");
    const { PrismaNeon } = require("@prisma/adapter-neon");
    const ws = require("ws");

    neonConfig.webSocketConstructor = ws;

    // Neon's pooler uses a self-signed intermediate CA that Node rejects by default.
    // rejectUnauthorized:false keeps TLS encryption but skips chain verification.
    const pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      // Keep connections alive longer — Neon drops idle connections after ~5 min.
      idleTimeoutMillis:       60_000,   // recycle idle connections after 1 min
      connectionTimeoutMillis: 10_000,   // 10 s to establish a connection
      max: 5,                            // small pool — Neon Free tier caps at 10
    });

    const adapter = new PrismaNeon(pool);
    return new PrismaClient({ adapter, log: ["error"] });
  }

  // SQLite / local dev fallback (no adapter needed)
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

// ── Singleton ─────────────────────────────────────────────────
const globalForPrisma = globalThis;
const db = globalForPrisma.__cv_prisma ?? createClient();
globalForPrisma.__cv_prisma = db;

// ── dbQuery — retry wrapper for individual model operations ───
// Use this instead of accessing db.model directly for queries outside transactions.
// $transaction is NOT wrapped — Prisma requires its own promise types there.
const MODEL_METHODS = new Set([
  "findUnique", "findFirst", "findMany", "findUniqueOrThrow", "findFirstOrThrow",
  "create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany",
  "count", "aggregate", "groupBy",
]);

/**
 * db proxy: wraps all model query methods with withRetry so "Connection terminated
 * unexpectedly" errors from Neon are transparently retried.
 *
 * $transaction is deliberately NOT proxied — it must receive raw Prisma promises,
 * not the plain JS Promises that withRetry() returns.
 */
const dbProxy = new Proxy(db, {
  get(target, prop) {
    const value = target[prop];

    // Skip $transaction and other $ top-level operators — do NOT wrap them.
    if (typeof prop === "string" && prop.startsWith("$")) return value;

    // Wrap model accessor objects (e.g. db.user, db.meeting)
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      MODEL_METHODS.has("findMany") && typeof value.findMany === "function"
    ) {
      return new Proxy(value, {
        get(modelTarget, method) {
          const fn = modelTarget[method];
          if (typeof fn !== "function") return fn;
          if (!MODEL_METHODS.has(method)) return fn.bind(modelTarget);
          // Wrap query method with retry
          return (...args) => withRetry(() => fn.apply(modelTarget, args));
        },
      });
    }

    return value;
  },
});

module.exports = dbProxy;
