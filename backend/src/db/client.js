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

function createClient() {
  if (isPostgres) {
    // Use Neon serverless adapter — all traffic over wss:// (port 443), never port 5432.
    const { Pool, neonConfig } = require("@neondatabase/serverless");
    const { PrismaNeon } = require("@prisma/adapter-neon");
    const ws = require("ws");
    neonConfig.webSocketConstructor = ws;
    const pool    = new Pool({ connectionString: DATABASE_URL });
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

const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

module.exports = db;
