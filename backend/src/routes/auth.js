/* ============================================================
   Auth Routes — JWT + bcrypt + Google OAuth   (Phase 2 + Google)
   POST /api/auth/signup
   POST /api/auth/login
   GET  /api/auth/me
   POST /api/auth/refresh
   POST /api/auth/forgot-password
   POST /api/auth/reset-password
   GET  /api/auth/google              ← new: OAuth redirect
   GET  /api/auth/google/callback     ← new: OAuth callback

   All user/token storage now uses Prisma (SQLite → Postgres).
   Rate limiting, input validation, and token hardening unchanged.
   ============================================================ */
"use strict";
const crypto  = require("crypto");
const bcrypt  = require("bcryptjs");
const jwt     = require("jsonwebtoken");
const https   = require("https");
const db      = require("../db/client");
const { json, readBody } = require("../utils/helpers");
const { isRateLimited, retryAfterSeconds, getClientIp } = require("../middleware/rateLimiter");

// ── Environment config ─────────────────────────────────────────
const JWT_SECRET  = process.env.JWT_SECRET  || "cv_dev_secret_change_in_prod";
const JWT_EXPIRES = process.env.JWT_EXPIRES || "1h";
const REFRESH_TTL = parseInt(process.env.REFRESH_TTL_DAYS || "30", 10) * 24 * 3600;
const SALT_ROUNDS = 10;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// The one email that is auto-promoted to superadmin on first login
const SUPERADMIN_EMAIL = "sathvic2005@gmail.com";

// Google OAuth config
const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_CALLBACK_URL  = process.env.GOOGLE_CALLBACK_URL  ||
  "http://localhost:3000/api/auth/google/callback";

// Section 3: Fail startup if running in production with the default secret.
if (process.env.NODE_ENV === "production" && JWT_SECRET === "cv_dev_secret_change_in_prod") {
  console.error("[Auth] FATAL: JWT_SECRET is the default dev value in production.");
  process.exit(1);
}

// ── Token helpers ──────────────────────────────────────────────

function signAccessToken(userId) {
  return jwt.sign({ sub: userId, type: "access" }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function signRefreshToken(userId) {
  return jwt.sign({ sub: userId, type: "refresh" }, JWT_SECRET, { expiresIn: `${REFRESH_TTL}s` });
}

/**
 * Verifies the Authorization: Bearer <token> header.
 * Returns the decoded payload or null on failure.
 * Exported for use by api.js and server.js.
 */
function verifyToken(req) {
  const auth  = req.headers["authorization"] || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.type === "refresh") return null;
    return payload;
  } catch {
    return null;
  }
}

// ── Input validation helpers ───────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateSignupInput(name, email, pass) {
  if (!name || typeof name !== "string" || name.trim().length < 1)
    return "Full name is required.";
  if (name.trim().length > 100)
    return "Name must be 100 characters or fewer.";
  if (!email || !EMAIL_REGEX.test(email))
    return "A valid email address is required.";
  if (!pass || pass.length < 6)
    return "Password must be at least 6 characters.";
  if (pass.length > 128)
    return "Password must be 128 characters or fewer.";
  return null;
}

// ── Token hash helpers ─────────────────────────────────────────

function hashToken(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

// ── Safe user shape for API responses ─────────────────────────

function safeUser(u) {
  return {
    id:             u.id,
    name:           u.name,
    email:          u.email,
    picture:        u.picture || null,
    googleId:       u.googleId || null,
    role:           u.role || "customer",
    ownedMeetingIds: u.ownedMeetingIds || [],
    createdAt:      u.createdAt
  };
}

// ── Google OAuth helpers ───────────────────────────────────────

/** Build the Google authorization URL */
function googleAuthUrl(state) {
  const params = new URLSearchParams({
    client_id:     GOOGLE_CLIENT_ID,
    redirect_uri:  GOOGLE_CALLBACK_URL,
    response_type: "code",
    scope:         "openid email profile",
    access_type:   "offline",
    prompt:        "select_account",
    state:         state || "cv_oauth"
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/** Exchange authorization code for Google tokens (returns a Promise) */
function googleExchangeCode(code) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      code,
      client_id:     GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri:  GOOGLE_CALLBACK_URL,
      grant_type:    "authorization_code"
    });
    const req = https.request(
      {
        hostname: "oauth2.googleapis.com",
        path:     "/token",
        method:   "POST",
        headers:  { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
      },
      res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end",  () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error("Failed to parse Google token response")); }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/** Fetch Google user-info using an access token (returns a Promise) */
function googleUserInfo(accessToken) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "www.googleapis.com",
        path:     "/oauth2/v2/userinfo",
        method:   "GET",
        headers:  { Authorization: `Bearer ${accessToken}` }
      },
      res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end",  () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error("Failed to parse Google userinfo")); }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

// ── Route handler ──────────────────────────────────────────────

async function handleAuthRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const ip  = getClientIp(req);

  // ── POST /api/auth/signup ──────────────────────────────────
  if (req.method === "POST" && url.pathname === "/api/auth/signup") {
    if (isRateLimited(ip)) {
      return json(res, 429, { error: `Too many signup attempts. Try again in ${retryAfterSeconds(ip)}s.` });
    }

    const { name, email, password } = await readBody(req);
    const err = validateSignupInput(name, email, password);
    if (err) return json(res, 400, { error: err });

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) return json(res, 409, { error: "An account with that email already exists." });

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await db.user.create({
      data: { name: name.trim(), email: email.toLowerCase(), passwordHash }
    });

    const token        = signAccessToken(user.id);
    const refreshToken = signRefreshToken(user.id);

    // Persist refresh token hash
    await db.refreshToken.create({
      data: {
        tokenHash: hashToken(refreshToken),
        userId:    user.id,
        expiresAt: new Date(Date.now() + REFRESH_TTL * 1000)
      }
    });

    return json(res, 201, { token, refreshToken, user: safeUser(user) });
  }

  // ── POST /api/auth/login ───────────────────────────────────
  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    if (isRateLimited(ip)) {
      return json(res, 429, { error: `Too many login attempts. Try again in ${retryAfterSeconds(ip)}s.` });
    }

    const { email, password } = await readBody(req);
    if (!email || !password) return json(res, 400, { error: "Email and password are required." });

    const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.passwordHash) {
      return json(res, 401, { error: "Invalid email or password." });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return json(res, 401, { error: "Invalid email or password." });

    const token        = signAccessToken(user.id);
    const refreshToken = signRefreshToken(user.id);

    await db.refreshToken.upsert({
      where:  { tokenHash: hashToken(refreshToken) },
      update: { expiresAt: new Date(Date.now() + REFRESH_TTL * 1000) },
      create: {
        tokenHash: hashToken(refreshToken),
        userId:    user.id,
        expiresAt: new Date(Date.now() + REFRESH_TTL * 1000)
      }
    });

    return json(res, 200, { token, refreshToken, user: safeUser(user) });
  }

  // ── GET /api/auth/me ───────────────────────────────────────
  if (req.method === "GET" && url.pathname === "/api/auth/me") {
    const payload = verifyToken(req);
    if (!payload) return json(res, 401, { error: "Unauthorized." });

    const user = await db.user.findUnique({ where: { id: payload.sub } });
    if (!user) return json(res, 401, { error: "User not found." });

    // Attach ownedMeetingIds from DB
    const ownedMeetings = await db.meeting.findMany({
      where:  { ownerId: user.id },
      select: { id: true }
    });
    user.ownedMeetingIds = ownedMeetings.map(m => m.id);

    return json(res, 200, { user: safeUser(user) });
  }

  // ── POST /api/auth/refresh ─────────────────────────────────
  if (req.method === "POST" && url.pathname === "/api/auth/refresh") {
    const { refreshToken } = await readBody(req);
    if (!refreshToken) return json(res, 400, { error: "refreshToken required." });

    let payload;
    try {
      payload = jwt.verify(refreshToken, JWT_SECRET);
    } catch {
      return json(res, 401, { error: "Invalid or expired refresh token." });
    }
    if (payload.type !== "refresh") return json(res, 401, { error: "Invalid token type." });

    const tokenHash = hashToken(refreshToken);
    const stored = await db.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.expiresAt < new Date()) {
      return json(res, 401, { error: "Refresh token revoked or expired." });
    }

    // Rotate — delete old, issue new
    await db.refreshToken.delete({ where: { tokenHash } });

    const newAccess  = signAccessToken(payload.sub);
    const newRefresh = signRefreshToken(payload.sub);
    await db.refreshToken.create({
      data: {
        tokenHash: hashToken(newRefresh),
        userId:    payload.sub,
        expiresAt: new Date(Date.now() + REFRESH_TTL * 1000)
      }
    });

    return json(res, 200, { token: newAccess, refreshToken: newRefresh });
  }

  // ── POST /api/auth/forgot-password ────────────────────────
  if (req.method === "POST" && url.pathname === "/api/auth/forgot-password") {
    const { email } = await readBody(req);
    const user = email ? await db.user.findUnique({ where: { email: email.toLowerCase() } }) : null;

    if (user) {
      const rawToken  = crypto.randomBytes(32).toString("hex");
      const tokenHash = hashToken(rawToken);
      await db.resetToken.upsert({
        where:  { tokenHash },
        update: {},
        create: {
          tokenHash,
          userId:    user.id,
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS)
        }
      });
      // In production this would send an email; for dev, log it
      console.log(`[Auth] Password reset token for ${email}: ${rawToken}`);
    }
    // Always 200 to prevent email enumeration
    return json(res, 200, { message: "If that email exists, a reset link has been sent." });
  }

  // ── POST /api/auth/reset-password ─────────────────────────
  if (req.method === "POST" && url.pathname === "/api/auth/reset-password") {
    const { token: rawToken, password } = await readBody(req);
    if (!rawToken || !password || password.length < 6) {
      return json(res, 400, { error: "Valid token and password (≥6 chars) are required." });
    }

    const tokenHash = hashToken(rawToken);
    const stored = await db.resetToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.expiresAt < new Date()) {
      return json(res, 400, { error: "Reset token is invalid or expired." });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    await db.user.update({ where: { id: stored.userId }, data: { passwordHash } });
    await db.resetToken.delete({ where: { tokenHash } });

    return json(res, 200, { message: "Password updated successfully." });
  }

  // ── GET /api/auth/google ── Redirect to Google ────────────
  if (req.method === "GET" && url.pathname === "/api/auth/google") {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || GOOGLE_CLIENT_ID === "REPLACE_ME") {
      return json(res, 501, { error: "Google OAuth is not configured on this server." });
    }
    const authUrl = googleAuthUrl(url.searchParams.get("state") || "");
    res.writeHead(302, { Location: authUrl });
    res.end();
    return;
  }

  // ── GET /api/auth/google/callback ── Handle OAuth return ──
  if (req.method === "GET" && url.pathname === "/api/auth/google/callback") {
    const code  = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    if (error || !code) {
      res.writeHead(302, { Location: "/?auth_error=google_denied" });
      res.end();
      return;
    }

    try {
      // 1. Exchange code for tokens
      const tokenData = await googleExchangeCode(code);
      if (tokenData.error) throw new Error(tokenData.error_description || tokenData.error);

      // 2. Fetch user profile
      const profile = await googleUserInfo(tokenData.access_token);
      if (!profile.id) throw new Error("No Google user ID returned");

      // 3. Upsert user — find by googleId, then by email, then create
      let user = await db.user.findUnique({ where: { googleId: profile.id } });
      if (!user && profile.email) {
        user = await db.user.findUnique({ where: { email: profile.email } });
        if (user) {
          // Link existing email-account to Google
          user = await db.user.update({
            where: { id: user.id },
            data:  { googleId: profile.id, picture: profile.picture || null }
          });
        }
      }
      if (!user) {
        const autoRole = profile.email?.toLowerCase() === SUPERADMIN_EMAIL ? "superadmin" : "customer";
        user = await db.user.create({
          data: {
            name:     profile.name || profile.email.split("@")[0],
            email:    profile.email,
            googleId: profile.id,
            picture:  profile.picture || null,
            role:     autoRole
          }
        });
      }
      // Auto-promote superadmin if existing user doesn't have the role yet
      if (user.email?.toLowerCase() === SUPERADMIN_EMAIL && user.role !== "superadmin") {
        user = await db.user.update({ where: { id: user.id }, data: { role: "superadmin" } });
      }

      // 4. Issue CollectiveVoice JWT
      const accessToken  = signAccessToken(user.id);
      const refreshToken = signRefreshToken(user.id);
      await db.refreshToken.create({
        data: {
          tokenHash: hashToken(refreshToken),
          userId:    user.id,
          expiresAt: new Date(Date.now() + REFRESH_TTL * 1000)
        }
      });

      // 5. Redirect to frontend SPA with tokens in query string.
      //    The SPA uses hash-based routing (#/route), so we redirect to /#/auth-callback
      //    and pass tokens as query params that handleGoogleCallback() reads from location.search.
      const params = new URLSearchParams({ token: accessToken, refreshToken, name: user.name, role: user.role || "customer" });
      res.writeHead(302, { Location: `/?${params}#/auth-callback` });
      res.end();

    } catch (err) {
      console.error("[Auth] Google callback error:", err.message);
      res.writeHead(302, { Location: "/?auth_error=google_failed" });
      res.end();
    }
    return;
  }

  // Route not handled by auth
  return null;
}

module.exports = { handleAuthRequest, verifyToken };
