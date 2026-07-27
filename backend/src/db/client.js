// backend/src/db/client.js
// Singleton Prisma client — import this everywhere instead of @prisma/client directly.
// This ensures only one connection pool is open per process.
//
// Uses @neondatabase/serverless + @prisma/adapter-neon when DATABASE_URL is a
// PostgreSQL connection string. This routes all traffic over WebSockets (port 443)
// instead of native TCP (port 5432), so the DB works even behind restrictive firewalls.
"use strict";

// ── Dev TLS fix ────────────────────────────────────────────────────────────────
// Neon WebSocket connections on some Windows / corporate networks fail with
// "self-signed certificate in certificate chain" because the system CA store is
// not trusted by Node's built-in TLS. Setting this env var before any network
// call is made disables TLS verification in dev. NEVER set this in production.
if (process.env.NODE_ENV !== "production") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const { PrismaClient } = require("@prisma/client");

const DATABASE_URL = process.env.DATABASE_URL || "";
const isPostgres = DATABASE_URL.startsWith("postgresql://") || DATABASE_URL.startsWith("postgres://");

function createClient() {
  if (isPostgres) {
    // Use Neon serverless adapter — all traffic over wss:// (port 443), never port 5432.
    const { Pool, neonConfig } = require("@neondatabase/serverless");
    const { PrismaNeon } = require("@prisma/adapter-neon");
    const ws = require("ws");

    // On Windows with SSL-intercepting proxies/antivirus, the self-signed cert
    // in the TLS chain causes "self-signed certificate in certificate chain".
    // NODE_TLS_REJECT_UNAUTHORIZED=0 doesn't reach Neon's internal WS stack,
    // so we patch the WebSocket constructor to pass rejectUnauthorized:false directly.
    class InsecureWS extends ws {
      constructor(url, protocols, opts) {
        const merged = Object.assign({}, opts, {
          rejectUnauthorized: false,
          checkServerIdentity: () => undefined,
        });
        super(url, protocols, merged);
      }
    }
    neonConfig.webSocketConstructor = InsecureWS;
    neonConfig.pipelineConnect      = false; // more stable on slow connections

    const pool    = new Pool({ connectionString: DATABASE_URL });

    // Catch pool-level errors (e.g. "Connection terminated unexpectedly" from
    // Neon's WebSocket keep-alive). Without this, Node emits an uncaught
    // 'error' event on the pool EventEmitter and crashes the process.
    pool.on("error", (err) => {
      console.warn("[DB] Pool error (non-fatal, will retry on next query):", err.message);
    });

    const adapter = new PrismaNeon(pool);
    return new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
    });
  }

  // SQLite / local dev fallback (no adapter needed)
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  });
}

// In development, attach to globalThis to survive hot-reloads (e.g. nodemon).
// In production/test, create fresh every time.
const globalForPrisma = globalThis;

// Always create a fresh client on restart (avoids stale TLS state)
const db = createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

module.exports = db;
