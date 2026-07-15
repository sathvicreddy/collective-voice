/* ============================================================
   API Integration Tests — Bug Regression Suite (Jest + Supertest)
   Directly verifies fixes for all 5 confirmed audit bugs:

     Bug #2 — /api/profile returns authenticated user, not seed
     Bug #3 — /api/notifications is per-user, not global
     Bug #4 — moderator write routes return 401/403 without auth
     Bug #5 — meeting creation uses JWT user as speaker, not seed

   Also covers Section 1 multi-tenancy and Section 5 new endpoints.
   ============================================================ */
"use strict";

const supertest = require("supertest");
// JWT_SECRET is set by setup.js — do NOT override here or tokens won't verify
process.env.NODE_ENV = "development"; // suppress startup exit check

const db = require("../../backend/src/db/client");

// Import the raw http.Server (not bound to a port yet due to require.main check)
const { server } = require("../../backend/server");

beforeAll(async () => {
  // Clean up regression test users (cascade: delete meetings/questions first)
  const users = await db.user.findMany({ where: { email: { contains: "@regression.com" } } });
  for (const u of users) {
    await db.meeting.deleteMany({ where: { ownerId: u.id } }).catch(() => {});
    await db.user.delete({ where: { id: u.id } }).catch(() => {});
  }
});

afterAll(async () => {
  const users = await db.user.findMany({ where: { email: { contains: "@regression.com" } } });
  for (const u of users) {
    await db.meeting.deleteMany({ where: { ownerId: u.id } }).catch(() => {});
    await db.user.delete({ where: { id: u.id } }).catch(() => {});
  }
  await db.$disconnect();
  try { server.close(); } catch { /* ignore */ }
});

// ── Helpers ────────────────────────────────────────────────────

function agent() {
  return supertest(server);
}

async function signupAndGetToken(name, email, password = "testpass123") {
  const res = await agent()
    .post("/api/auth/signup")
    .send({ name, email, password });
  return res.body.token;
}



// ── Bug #2 Regression: /api/profile resolves authenticated user ─
describe("Bug #2 — /api/profile", () => {
  test("returns 401 when unauthenticated", async () => {
    const res = await agent().get("/api/profile");
    expect(res.status).toBe(401);
  });

  test("returns the authenticated user's own data (not Ananya Sharma)", async () => {
    const token = await signupAndGetToken("Alice Test", "alice@regression.com");
    const res   = await agent()
      .get("/api/profile")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe("Alice Test");
    expect(res.body.user.email).toBe("alice@regression.com");
    // Must NOT be the hardcoded seed user
    expect(res.body.user.name).not.toBe("Ananya Sharma");
  });

  test("two different users see their own data", async () => {
    const tokenA = await signupAndGetToken("User Alpha", "alpha@regression.com");
    const tokenB = await signupAndGetToken("User Beta",  "beta@regression.com");

    const resA = await agent().get("/api/profile").set("Authorization", `Bearer ${tokenA}`);
    const resB = await agent().get("/api/profile").set("Authorization", `Bearer ${tokenB}`);

    expect(resA.body.user.name).toBe("User Alpha");
    expect(resB.body.user.name).toBe("User Beta");
    expect(resA.body.user.id).not.toBe(resB.body.user.id);
  });
});

// ── Bug #3 Regression: /api/notifications is per-user ──────────
describe("Bug #3 — /api/notifications", () => {
  test("returns empty array (not global seed notifications) for new user", async () => {
    const token = await signupAndGetToken("Notif User", "notif@regression.com");
    const res   = await agent()
      .get("/api/notifications")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    // New user should have an empty feed, not the shared seed notifications
    expect(Array.isArray(res.body.notifications)).toBe(true);
    // Must not contain "Education Policy Discussion" (seed user's notification)
    const titles = res.body.notifications.map(n => n.title);
    expect(titles).not.toContain("Education Policy Discussion is starting soon");
  });

  test("returns empty array when unauthenticated", async () => {
    const res = await agent().get("/api/notifications");
    expect(res.status).toBe(200);
    expect(res.body.notifications).toEqual([]);
  });
});

// ── Bug #4 Regression: moderator routes are auth-gated ─────────
describe("Bug #4 — Moderator route authorization", () => {
  test("/api/questions/:id/status returns 401 without token", async () => {
    const res = await agent()
      .post("/api/questions/q1/status?meetingId=m_ai_education")
      .send({ status: "Answered" });
    expect(res.status).toBe(401);
  });

  test("/api/questions/:id/answer returns 401 without token", async () => {
    const res = await agent()
      .post("/api/questions/q1/answer?meetingId=m_ai_education")
      .send({});
    expect(res.status).toBe(401);
  });

  test("/api/questions/:id/assign returns 401 without token", async () => {
    const res = await agent()
      .post("/api/questions/q1/assign?meetingId=m_ai_education")
      .send({ speakerId: "sp1" });
    expect(res.status).toBe(401);
  });

  test("/api/announcements returns 401 without token", async () => {
    const res = await agent()
      .post("/api/announcements")
      .send({ message: "Hello", meetingId: "m_ai_education" });
    expect(res.status).toBe(401);
  });

  test("non-owner gets 403 on /api/questions/:id/status", async () => {
    // Sign up as a non-owner and try to moderate meeting m_ai_education
    const token = await signupAndGetToken("Non Owner", "nonowner@regression.com");
    const res   = await agent()
      .post("/api/questions/q1/status?meetingId=m_ai_education")
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "Answered" });
    expect(res.status).toBe(403);
  });

  test("owner can moderate their own meeting", async () => {
    const token = await signupAndGetToken("Meeting Owner", "owner@regression.com");
    const createRes = await agent()
      .post("/api/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Owner Test Meeting" });
    expect(createRes.status).toBe(201);
    const meeting = createRes.body.meeting;

    // Submit a question to the new meeting
    const qRes = await agent()
      .post(`/api/questions?meetingId=${meeting.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ text: "Test question for ownership test" });
    expect(qRes.status).toBe(201);
    const qId = qRes.body.question.id;

    // Mark it answered — should succeed as owner
    const answerRes = await agent()
      .post(`/api/questions/${qId}/answer?meetingId=${meeting.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(answerRes.status).toBe(200);
    expect(answerRes.body.question.status).toBe("Answered");
  });
});

// ── Bug #5 Regression: meeting speaker defaults to JWT user ────
describe("Bug #5 — Meeting creation speaker name", () => {
  test("speaker defaults to authenticated user name, not 'Ananya Sharma'", async () => {
    const token = await signupAndGetToken("Real Host Name", "realhost@regression.com");
    const res   = await agent()
      .post("/api/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Speaker Name Test" });
    expect(res.status).toBe(201);
    expect(res.body.meeting.speaker).toBe("Real Host Name");
    expect(res.body.meeting.speaker).not.toBe("Ananya Sharma");
  });

  test("explicit speaker body field is respected", async () => {
    const token = await signupAndGetToken("Host With Custom Speaker", "customsp@regression.com");
    const res   = await agent()
      .post("/api/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Custom Speaker Test", speaker: "Dr. Custom Speaker" });
    expect(res.status).toBe(201);
    expect(res.body.meeting.speaker).toBe("Dr. Custom Speaker");
  });
});

// ── Section 1: Multi-tenancy ────────────────────────────────────
describe("Section 1 — Multi-tenancy", () => {
  test("meeting creation sets ownerId to authenticated user", async () => {
    const token = await signupAndGetToken("Owner Check", "ownerchk@regression.com");
    const meRes = await agent().get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    const userId = meRes.body.user.id;

    const res = await agent()
      .post("/api/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Ownership Test" });
    expect(res.status).toBe(201);
    expect(res.body.meeting.ownerId).toBe(userId);
  });

  test("owned meeting appears in user's ownedMeetingIds", async () => {
    const token = await signupAndGetToken("Owned Check", "ownedchk@regression.com");
    const createRes = await agent()
      .post("/api/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Owned Meeting" });
    const meetingId = createRes.body.meeting.id;

    const meRes = await agent().get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(meRes.body.user.ownedMeetingIds).toContain(meetingId);
  });
});

// ── Section 5: New endpoints ───────────────────────────────────
describe("Section 5 — API completeness", () => {
  test("PATCH /api/meetings/:id updates title (owner only)", async () => {
    const token = await signupAndGetToken("Patcher", "patch@regression.com");
    const createRes = await agent()
      .post("/api/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Original Title" });
    const id = createRes.body.meeting.id;

    const patchRes = await agent()
      .patch(`/api/meetings/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Updated Title" });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.meeting.title).toBe("Updated Title");
  });

  test("DELETE /api/meetings/:id removes the meeting (owner only)", async () => {
    const token = await signupAndGetToken("Deleter", "del@regression.com");
    const createRes = await agent()
      .post("/api/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "To Delete" });
    const id = createRes.body.meeting.id;

    const deleteRes = await agent()
      .delete(`/api/meetings/${id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.deleted).toBe(true);
  });

  test("PATCH /api/meetings/:id/status transitions status", async () => {
    const token = await signupAndGetToken("Statusser", "status@regression.com");
    const createRes = await agent()
      .post("/api/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Status Test" });
    const id = createRes.body.meeting.id;

    const res = await agent()
      .patch(`/api/meetings/${id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "live" });
    expect(res.status).toBe(200);
    expect(res.body.meeting.status).toBe("live");
  });

  test("POST /api/polls creates a poll (owner only)", async () => {
    const token = await signupAndGetToken("Poller", "poll@regression.com");
    const createRes = await agent()
      .post("/api/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Poll Test Meeting" });
    const meetingId = createRes.body.meeting.id;

    const pollRes = await agent()
      .post("/api/polls")
      .set("Authorization", `Bearer ${token}`)
      .send({ question: "Best option?", options: ["A", "B", "C"], meetingId });
    expect(pollRes.status).toBe(201);
    expect(pollRes.body.poll.options).toHaveLength(3);
  });

  test("GET /health returns ok", async () => {
    const res = await agent().get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});

// ── Question length cap (Section 3 DoS protection) ─────────────
describe("Section 3 — Input validation", () => {
  test("rejects question text longer than 500 chars", async () => {
    const res = await agent()
      .post("/api/questions?meetingId=m_ai_education")
      .send({ text: "x".repeat(501) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/500/);
  });
});
