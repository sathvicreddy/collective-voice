// scripts/smoke_api.js
// Quick end-to-end smoke test for the new notification + messaging routes.
// Run while the server is up: node scripts/smoke_api.js
"use strict";
const http = require("http");

const BASE = "http://localhost:3000";
let PASS = 0, FAIL = 0;

async function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      method,
      hostname: "localhost",
      port: 3000,
      path,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
      },
    };
    const r = http.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

function assert(label, condition, detail = "") {
  if (condition) {
    console.log(`  PASS  ${label}`);
    PASS++;
  } else {
    console.error(`  FAIL  ${label}${detail ? " — " + detail : ""}`);
    FAIL++;
  }
}

async function main() {
  console.log("\n=== CollectiveVoice notification smoke tests ===\n");

  // ── 1. Sign up a fresh user ──────────────────────────────────────────────
  console.log("[ signup ]");
  const email    = `smoke_${Date.now()}@test.invalid`;
  const signupR  = await req("POST", "/api/auth/signup", { name: "Smoke Test", email, password: "Password1!" });
  assert("signup 201",    signupR.status === 201, JSON.stringify(signupR.body).slice(0, 120));
  const token    = signupR.body.token;
  const userId   = signupR.body.user?.id;

  // ── 2. GET /api/notifications (empty) ────────────────────────────────────
  console.log("\n[ GET /api/notifications ]");
  const notifR   = await req("GET", "/api/notifications", null, token);
  assert("returns 200",  notifR.status === 200, JSON.stringify(notifR.body).slice(0, 60));
  assert("array field",  Array.isArray(notifR.body.notifications));

  // ── 3. PATCH /api/notifications/mark-read (mark all, none exist) ─────────
  console.log("\n[ PATCH /api/notifications/mark-read ]");
  const markR    = await req("PATCH", "/api/notifications/mark-read", {}, token);
  assert("returns 200",  markR.status === 200);
  assert("ok: true",     markR.body.ok === true);

  // ── 4. GET/PATCH /api/notifications/preferences ──────────────────────────
  console.log("\n[ GET /api/notifications/preferences ]");
  const prefGetR = await req("GET", "/api/notifications/preferences", null, token);
  assert("returns 200",  prefGetR.status === 200);
  assert("has meetingUpdates", typeof prefGetR.body.preferences?.meetingUpdates === "boolean");

  console.log("\n[ PATCH /api/notifications/preferences ]");
  const prefPatchR = await req("PATCH", "/api/notifications/preferences", { emailDigest: true }, token);
  assert("returns 200",  prefPatchR.status === 200);
  assert("emailDigest saved", prefPatchR.body.preferences?.emailDigest === true);

  // ── 5. Admin routes: unauthenticated → 401 ──────────────────────────────
  console.log("\n[ admin routes unauthenticated ]");
  const an401 = await req("GET", "/api/admin/notifications");
  assert("admin notifs 401",  an401.status === 401);
  const am401 = await req("GET", "/api/admin/messages");
  assert("admin messages 401", am401.status === 401);

  // ── 6. Admin routes: non-admin token → 403 ───────────────────────────────
  console.log("\n[ admin routes non-admin user ]");
  const an403 = await req("GET", "/api/admin/notifications", null, token);
  assert("admin notifs 403",  an403.status === 403);
  const am403 = await req("GET", "/api/admin/messages", null, token);
  assert("admin messages 403", am403.status === 403);

  // ── 7. Admin message POST: invalid body → 400 ────────────────────────────
  // (We can't easily get an admin token without seeding one, so just ensure
  //  a non-admin gets 403, which we've already confirmed above.)

  console.log(`\n${"─".repeat(48)}`);
  console.log(`  Results: ${PASS} passed, ${FAIL} failed`);
  if (FAIL > 0) process.exit(1);
}

main().catch(e => { console.error("Uncaught:", e); process.exit(1); });
