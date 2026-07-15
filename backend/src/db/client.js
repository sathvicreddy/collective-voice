// backend/src/db/client.js
// Singleton Prisma client — import this everywhere instead of @prisma/client directly.
// This ensures only one connection pool is open per process.
"use strict";

const { PrismaClient } = require("@prisma/client");

// In development, attach to globalThis to survive hot-reloads (e.g. nodemon).
// In production/test, create fresh every time.
const globalForPrisma = globalThis;

const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

module.exports = db;
