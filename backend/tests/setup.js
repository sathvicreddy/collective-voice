// Jest setup file — runs before every test file in the suite.
"use strict";
require("dotenv").config();
const path = require("path");
process.env.JWT_SECRET              = process.env.JWT_SECRET || "test_secret_12345_for_jest";
process.env.NODE_ENV                = "test";
process.env.RATE_LIMIT_MAX_REQUESTS = "1000";
if (!process.env.DATABASE_URL) {
  const dbPath = path.join(__dirname, "..", "..", "prisma", "dev.db");
  process.env.DATABASE_URL = `file:${dbPath}`;
}

