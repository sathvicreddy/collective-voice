// Jest setup file — runs before every test file in the suite.
"use strict";
const path = require("path");
process.env.JWT_SECRET              = "test_secret_12345_for_jest";
process.env.NODE_ENV                = "test";
process.env.RATE_LIMIT_MAX_REQUESTS = "1000";
// Absolute path so Prisma can find dev.db regardless of Jest CWD.
const dbPath = path.join(__dirname, "..", "..", "prisma", "dev.db");
process.env.DATABASE_URL = `file:${dbPath}`;
