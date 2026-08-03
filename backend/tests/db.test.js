// backend/tests/db.test.js
// DB smoke tests — basic Prisma CRUD via the singleton client.
// These run against the same SQLite dev.db used by the seed.

"use strict";
const db = require("../src/db/client");

afterAll(async () => {
  await db.$disconnect();
});

describe("DB — User CRUD", () => {
  const testEmail = `db_test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}@example.com`;

  test("User CRUD cycle (create, find, update, delete)", async () => {
    // 1. Create
    const user = await db.user.create({
      data: { name: "DB Test", email: testEmail, passwordHash: "hash123" }
    });
    expect(user.id).toBeTruthy();
    expect(user.email).toBe(testEmail);

    // 2. Find
    const found = await db.user.findUnique({ where: { id: user.id } });
    expect(found).not.toBeNull();
    expect(found.name).toBe("DB Test");

    // 3. Update
    const updated = await db.user.update({
      where: { id: found.id },
      data:  { name: "DB Test Updated" }
    });
    expect(updated.name).toBe("DB Test Updated");

    // 4. Delete
    await db.user.delete({ where: { id: found.id } });
    const gone = await db.user.findUnique({ where: { id: found.id } });
    expect(gone).toBeNull();
  });
});

describe("DB — Meeting CRUD", () => {
  let meetingId;
  const ownerId = "u_ananya"; // seeded user

  test("create meeting", async () => {
    const m = await db.meeting.create({
      data: {
        code:    String(Math.floor(Math.random() * 900000) + 100000),
        title:   "Smoke Test Meeting",
        speaker: "Tester",
        ownerId
      }
    });
    expect(m.id).toBeTruthy();
    meetingId = m.id;
  });

  test("find meeting by id", async () => {
    const m = await db.meeting.findUnique({ where: { id: meetingId } });
    expect(m.title).toBe("Smoke Test Meeting");
  });

  test("update meeting status", async () => {
    const m = await db.meeting.update({ where: { id: meetingId }, data: { status: "live" } });
    expect(m.status).toBe("live");
  });

  test("create question in meeting", async () => {
    const q = await db.question.create({
      data: {
        meetingId,
        text:          "What is DB testing?",
        canonicalText: "What is DB testing?",
        askedByName:   "Tester"
      }
    });
    expect(q.id).toBeTruthy();
    expect(q.votes).toBe(0);
  });

  test("create poll in meeting", async () => {
    const p = await db.poll.create({
      data: {
        meetingId,
        question: "Smoke test poll?",
        options:  { create: [{ label: "Yes" }, { label: "No" }] }
      },
      include: { options: true }
    });
    expect(p.options).toHaveLength(2);
  });

  test("delete meeting (cascades)", async () => {
    await db.meeting.delete({ where: { id: meetingId } });
    const gone = await db.meeting.findUnique({ where: { id: meetingId } });
    expect(gone).toBeNull();
    // Cascade: questions and polls should also be gone
    const qs = await db.question.findMany({ where: { meetingId } });
    expect(qs).toHaveLength(0);
  });
});

describe("DB — Seeded data", () => {
  test("seed user exists", async () => {
    const u = await db.user.findUnique({ where: { email: "ananya.sharma@email.com" } });
    expect(u).not.toBeNull();
    expect(u.name).toBe("Ananya Sharma");
  });

  test("seed has live meeting", async () => {
    const m = await db.meeting.findFirst({ where: { status: "live" } });
    expect(m).not.toBeNull();
  });

  test("seed has questions", async () => {
    const qs = await db.question.findMany({ take: 1 });
    expect(qs.length).toBeGreaterThan(0);
  });

  test("seed has notifications for ananya", async () => {
    const u = await db.user.findUnique({ where: { email: "ananya.sharma@email.com" } });
    const ns = await db.notification.findMany({ where: { userId: u.id } });
    expect(ns.length).toBeGreaterThan(0);
  });
});
