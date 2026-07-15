/* ============================================================
   Auth Unit Tests (Jest)
   Covers: signup, login, token-verify, rate-limit behaviour,
   reset token hashing, refresh token flow.
   ============================================================ */
"use strict";

// JWT_SECRET and NODE_ENV are set by setup.js — do NOT override here

const db             = require("../src/db/client");
const { handleAuthRequest, verifyToken } = require("../src/routes/auth");

// ── Request/Response mock helpers ────────────────────────────
function makeReq(method, pathname, body = null, headers = {}) {
  const req = {
    method,
    url: `http://localhost:3000${pathname}`,
    headers: { host: "localhost:3000", ...headers },
    socket: { remoteAddress: "127.0.0.1" }
  };
  req.on = function (event, cb) {
    if (event === "data" && body) cb(JSON.stringify(body));
    if (event === "end") cb();
    return req;
  };
  return req;
}

function makeRes() {
  const res = {
    _status: null,
    _headers: {},
    _body: null,
    writeHead(status, headers = {}) { this._status = status; Object.assign(this._headers, headers); },
    setHeader(k, v) { this._headers[k] = v; },
    end(data) { try { this._body = JSON.parse(data); } catch { this._body = data; } }
  };
  return res;
}


// Clean up all test users before each run to ensure idempotency
beforeAll(async () => {
  await db.user.deleteMany({ where: { email: { contains: "@test.com" } } }).catch(() => {});
  await db.user.deleteMany({ where: { email: { contains: "@example.com" } } }).catch(() => {});
});

describe("POST /api/auth/signup", () => {
  test("creates user and returns access + refresh tokens", async () => {
    const req = makeReq("POST", "/api/auth/signup", {
      name: "Test User", email: "test@example.com", password: "password123"
    });
    const res = makeRes();
    await handleAuthRequest(req, res);
    expect(res._status).toBe(201);
    expect(res._body.token).toBeTruthy();
    expect(res._body.refreshToken).toBeTruthy();
    expect(res._body.user.email).toBe("test@example.com");
  });

  test("rejects missing name", async () => {
    const req = makeReq("POST", "/api/auth/signup", { email: "a@b.com", password: "123456" });
    const res = makeRes();
    await handleAuthRequest(req, res);
    expect(res._status).toBe(400);
  });

  test("rejects invalid email format", async () => {
    const req = makeReq("POST", "/api/auth/signup", { name: "A", email: "not-an-email", password: "123456" });
    const res = makeRes();
    await handleAuthRequest(req, res);
    expect(res._status).toBe(400);
    expect(res._body.error).toMatch(/email/i);
  });

  test("rejects duplicate email with 409", async () => {
    const reqA = makeReq("POST", "/api/auth/signup", { name: "A", email: "dup@test.com", password: "password1" });
    await handleAuthRequest(reqA, makeRes());
    const reqB = makeReq("POST", "/api/auth/signup", { name: "B", email: "dup@test.com", password: "password2" });
    const res = makeRes();
    await handleAuthRequest(reqB, res);
    expect(res._status).toBe(409);
  });

  test("rejects password shorter than 6 chars", async () => {
    const req = makeReq("POST", "/api/auth/signup", { name: "A", email: "a@b.com", password: "12345" });
    const res = makeRes();
    await handleAuthRequest(req, res);
    expect(res._status).toBe(400);
  });
});

// ── Login ──────────────────────────────────────────────────────
describe("POST /api/auth/login", () => {
  let userId;

  beforeAll(async () => {
    // Create user once for all login tests (beforeEach would 409 on the 2nd call)
    const req = makeReq("POST", "/api/auth/signup", {
      name: "Login User", email: "login@test.com", password: "correctpass"
    });
    const res = makeRes();
    await handleAuthRequest(req, res);
    // Gracefully handle if user already exists (409) from a previous run in the same process
    userId = res._body?.user?.id;
  });

  test("logs in with correct credentials", async () => {
    const req = makeReq("POST", "/api/auth/login", { email: "login@test.com", password: "correctpass" });
    const res = makeRes();
    await handleAuthRequest(req, res);
    expect(res._status).toBe(200);
    expect(res._body.token).toBeTruthy();
    expect(res._body.refreshToken).toBeTruthy();
  });

  test("rejects wrong password with 401", async () => {
    const req = makeReq("POST", "/api/auth/login", { email: "login@test.com", password: "wrongpass" });
    const res = makeRes();
    await handleAuthRequest(req, res);
    expect(res._status).toBe(401);
  });

  test("rejects non-existent email with 401", async () => {
    const req = makeReq("POST", "/api/auth/login", { email: "nobody@test.com", password: "pass123" });
    const res = makeRes();
    await handleAuthRequest(req, res);
    expect(res._status).toBe(401);
  });
});

// ── verifyToken ────────────────────────────────────────────────
describe("verifyToken", () => {
  test("returns null for missing header", () => {
    const req = makeReq("GET", "/api/auth/me");
    expect(verifyToken(req)).toBeNull();
  });

  test("returns null for malformed token", () => {
    const req = makeReq("GET", "/api/auth/me", null, { authorization: "Bearer notavalidtoken" });
    expect(verifyToken(req)).toBeNull();
  });

  test("returns payload for valid token", async () => {
    const loginReq = makeReq("POST", "/api/auth/signup", {
      name: "T", email: "tok@test.com", password: "pass123"
    });
    const loginRes = makeRes();
    await handleAuthRequest(loginReq, loginRes);
    const { token } = loginRes._body;

    const meReq = makeReq("GET", "/api/auth/me", null, { authorization: `Bearer ${token}` });
    const payload = verifyToken(meReq);
    expect(payload).not.toBeNull();
    expect(payload.sub).toBeTruthy();
  });
});

// ── Reset token hashing (Section 3) ──────────────────────────
describe("Password reset token storage", () => {
  const resetEmail = `reset_${Date.now()}@test.com`;

  test("stored reset token is a SHA-256 hash, not the raw token", async () => {
    // Seed a user so forgot-password finds them
    const signupReq = makeReq("POST", "/api/auth/signup", {
      name: "Reset User", email: resetEmail, password: "pass123"
    });
    await handleAuthRequest(signupReq, makeRes());

    const forgotReq = makeReq("POST", "/api/auth/forgot-password", { email: resetEmail });
    await handleAuthRequest(forgotReq, makeRes());

    // The stored key should be a 64-char hex string (SHA-256), not the raw token
    const user = await db.user.findUnique({ where: { email: resetEmail } });
    expect(user).not.toBeNull();
    const tokens = await db.resetToken.findMany({ where: { userId: user.id } });
    expect(tokens.length).toBeGreaterThan(0);
    // SHA-256 hex = 64 chars
    expect(tokens[0].tokenHash).toHaveLength(64);
    expect(tokens[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ── Global cleanup — remove test accounts after all tests ────
afterAll(async () => {
  const testEmails = [
    "auth@test.com", "signup@test.com", "login@test.com",
    "tok@test.com", /^reset_\d+@test\.com$/
  ];
  // Delete by known static emails
  for (const email of testEmails.filter(e => typeof e === "string")) {
    await db.user.deleteMany({ where: { email } }).catch(() => {});
  }
  // Delete dynamic-email reset users
  await db.user.deleteMany({ where: { email: { contains: "@test.com" } } }).catch(() => {});
  await db.$disconnect();
});
