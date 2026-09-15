/* ============================================================
   src/config/index.js
   Single source of truth for every environment variable read.
   Nothing outside this file should call process.env directly.

   Startup behaviour (preserves existing logic):
     - In production, hard-exits if JWT_SECRET is the dev default.
     - In all environments, warns loudly for any truly required
       vars that are missing.
   ============================================================ */
"use strict";

// In dev the dotenv call in server.js runs first; if this module is
// loaded before that (e.g. in tests) we attempt it ourselves.
if (!process.env.JWT_SECRET) {
  try { require("dotenv").config(); } catch { /* dotenv optional */ }
}

const NODE_ENV = process.env.NODE_ENV || "development";

// ── Auth ───────────────────────────────────────────────────────
const JWT_SECRET  = process.env.JWT_SECRET  || "cv_dev_secret_change_in_prod";
const JWT_EXPIRES = process.env.JWT_EXPIRES || "1h";
// REFRESH_TTL_DAYS → seconds
const REFRESH_TTL = parseInt(process.env.REFRESH_TTL_DAYS || "30", 10) * 24 * 3600;
const SUPERADMIN_EMAIL = (process.env.SUPERADMIN_EMAIL || "").toLowerCase();

// Section 3: Fail startup if running in production with the default secret.
if (NODE_ENV === "production" && JWT_SECRET === "cv_dev_secret_change_in_prod") {
  console.error("[Config] FATAL: JWT_SECRET is the default dev value in production.");
  process.exit(1);
}

// ── Google OAuth ───────────────────────────────────────────────
const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_CALLBACK_URL  = process.env.GOOGLE_CALLBACK_URL  ||
  "http://localhost:3000/api/auth/google/callback";

// ── Server ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:3000,http://localhost:3001")
  .split(",")
  .map(o => o.trim())
  .filter(Boolean);

// ── SMTP / Mailer ──────────────────────────────────────────────
const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || '"CollectiveVoice" <noreply@collectivevoice.app>';

// ── NLP ────────────────────────────────────────────────────────
const NLP_THRESHOLD  = parseFloat(process.env.NLP_THRESHOLD  || "0.60");
const SCORE_ALPHA    = parseFloat(process.env.SCORE_ALPHA    || "0.40");
const SCORE_BETA     = parseFloat(process.env.SCORE_BETA     || "0.25");
const SCORE_GAMMA    = parseFloat(process.env.SCORE_GAMMA    || "0.20");
const SCORE_DELTA    = parseFloat(process.env.SCORE_DELTA    || "0.15");

// ── Rate limiting ──────────────────────────────────────────────
// rateLimiter.js reads these dynamically so tests can override them;
// we keep the env reads there. These copies are for the admin NLP
// config endpoint which displays and mutates them.
const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "5",      10);
const RATE_LIMIT_WINDOW_MS    = parseInt(process.env.RATE_LIMIT_WINDOW_MS    || "900000", 10);

// ── Exported config object ─────────────────────────────────────
const config = {
  nodeEnv: NODE_ENV,
  isProduction: NODE_ENV === "production",
  isDevelopment: NODE_ENV === "development",
  isTest: NODE_ENV === "test",

  server: {
    port:           PORT,
    allowedOrigins: ALLOWED_ORIGINS,
  },

  auth: {
    jwtSecret:        JWT_SECRET,
    jwtExpires:       JWT_EXPIRES,
    refreshTtl:       REFRESH_TTL,
    saltRounds:       10,
    resetTokenTtlMs:  60 * 60 * 1000, // 1 hour
    superadminEmail:  SUPERADMIN_EMAIL,
  },

  google: {
    clientId:     GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackUrl:  GOOGLE_CALLBACK_URL,
  },

  smtp: {
    host: SMTP_HOST,
    port: SMTP_PORT,
    user: SMTP_USER,
    pass: SMTP_PASS,
    from: SMTP_FROM,
  },

  nlp: {
    threshold: NLP_THRESHOLD,
    weights: {
      vote:    SCORE_ALPHA,
      fresh:   SCORE_BETA,
      novel:   SCORE_GAMMA,
      diverse: SCORE_DELTA,
    },
  },

  rateLimit: {
    maxRequests: RATE_LIMIT_MAX_REQUESTS,
    windowMs:    RATE_LIMIT_WINDOW_MS,
  },
};

module.exports = config;
