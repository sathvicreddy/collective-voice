// prisma/seed.js
// Recreates demo data for local development.
// Run with: npm run db:seed
"use strict";

require("dotenv/config");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const db = new PrismaClient();

async function main() {
  console.log("🌱 Seeding CollectiveVoice database...");

  // ── Demo user ─────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash("password123", 10);
  const ananya = await db.user.upsert({
    where:  { email: "ananya.sharma@email.com" },
    update: {},
    create: {
      id:           "u_ananya",
      name:         "Ananya Sharma",
      email:        "ananya.sharma@email.com",
      passwordHash
    }
  });
  console.log("  ✔ User:", ananya.email);

  // ── Demo meetings ─────────────────────────────────────────────
  const meetingDefs = [
    {
      id: "m_ai_education", code: "482916",
      title: "AI in Education: Opportunities & Challenges",
      speaker: "Dr. Sarah Johnson", status: "live",
      date: "May 30, 2025", time: "02:00 PM - 03:30 PM", duration: "1h 30m",
      description: "Let's discuss how AI is transforming education.",
      category: "AI in Education", ownerId: ananya.id
    },
    {
      id: "m_remote", code: "275190",
      title: "Future of Remote Learning",
      speaker: "Dr. Michael Lee", status: "upcoming",
      date: "May 25, 2025", time: "02:00 PM - 03:30 PM", duration: "1h 30m",
      description: "", category: "Remote Learning", ownerId: ananya.id
    },
    {
      id: "m_privacy", code: "733512",
      title: "Data Privacy in EdTech",
      speaker: "Priya Sharma", status: "upcoming",
      date: "May 26, 2025", time: "11:00 AM - 12:00 PM", duration: "1h",
      description: "", category: "Data Privacy", ownerId: ananya.id
    },
    {
      id: "m_innovations", code: "918224",
      title: "EdTech Innovations 2025",
      speaker: "James Wilson", status: "upcoming",
      date: "May 28, 2025", time: "04:00 PM - 05:00 PM", duration: "1h",
      description: "", category: "EdTech Innovations", ownerId: ananya.id
    },
    {
      id: "m_engagement", code: "611204",
      title: "Student Engagement Strategies",
      speaker: "Ananya Sharma", status: "conducted",
      date: "May 18, 2025", time: "04:00 PM - 06:00 PM", duration: "2h",
      description: "", category: "Teaching Methods", ownerId: ananya.id
    },
    {
      id: "m_policy", code: "812640",
      title: "Education Policy Discussion",
      speaker: "Ananya Sharma", status: "past",
      date: "May 12, 2025", time: "10:00 AM - 11:30 AM", duration: "1h 30m",
      description: "", category: "Policy", ownerId: ananya.id
    }
  ];

  for (const m of meetingDefs) {
    await db.meeting.upsert({
      where:  { id: m.id },
      update: {},
      create: m
    });
  }
  console.log(`  ✔ ${meetingDefs.length} meetings`);

  // ── Demo questions for m_ai_education ────────────────────────
  const questions = [
    {
      id: "q1", meetingId: "m_ai_education",
      text: "How can AI be used ethically in education?",
      canonicalText: "How can AI be used ethically in education?",
      membersJson: JSON.stringify(["How can AI be used ethically in education?"]),
      votes: 126, score: 0.87, status: "Under Review",
      askedByName: "Priya Sharma",
      summaryText: "Participants are asking how institutions can balance useful AI tools with bias checks, privacy, transparency, and teacher oversight.",
      timelineJson: JSON.stringify(["Submitted", "Clustered with 18 similar questions", "Ranked #1"]),
      createdAt: new Date(Date.now() - 2 * 3600 * 1000)
    },
    {
      id: "q2", meetingId: "m_ai_education",
      text: "What are the long-term impacts of remote learning?",
      canonicalText: "What are the long-term impacts of remote learning?",
      membersJson: JSON.stringify(["What are the long-term impacts of remote learning?"]),
      votes: 98, score: 0.74, status: "Answered",
      askedByName: "James Wilson",
      summaryText: "The cluster focuses on learning outcomes, student isolation, access gaps, and hybrid course design.",
      timelineJson: JSON.stringify(["Submitted", "Clustered with 12 similar questions", "Answered by speaker"]),
      createdAt: new Date(Date.now() - 24 * 3600 * 1000)
    },
    {
      id: "q3", meetingId: "m_ai_education",
      text: "How do we ensure data privacy in edtech platforms?",
      canonicalText: "How do we ensure data privacy in edtech platforms?",
      membersJson: JSON.stringify(["How do we ensure data privacy in edtech platforms?"]),
      votes: 84, score: 0.66, status: "Pending",
      askedByName: "Ananya Sharma",
      summaryText: "The question centers on consent, minimal data collection, secure storage, and clear retention policies.",
      timelineJson: JSON.stringify(["Submitted", "Clustered with 6 similar questions"]),
      createdAt: new Date(Date.now() - 48 * 3600 * 1000)
    },
    {
      id: "q4", meetingId: "m_ai_education",
      text: "Can AI generate personalised learning paths for students with disabilities?",
      canonicalText: "Can AI generate personalised learning paths for students with disabilities?",
      membersJson: JSON.stringify(["Can AI generate personalised learning paths for students with disabilities?"]),
      votes: 61, score: 0.58, status: "Pending",
      askedByName: "Dr. Michael Lee",
      summaryText: "Asks whether adaptive AI systems can make content truly accessible for students with various learning differences.",
      timelineJson: JSON.stringify(["Submitted", "Ranked #4"]),
      createdAt: new Date(Date.now() - 45 * 60 * 1000)
    },
    {
      id: "q5", meetingId: "m_ai_education",
      text: "What role should teachers play when AI handles grading?",
      canonicalText: "What role should teachers play when AI handles grading?",
      membersJson: JSON.stringify(["What role should teachers play when AI handles grading?"]),
      votes: 47, score: 0.51, status: "Pending",
      askedByName: "Sarah Chen",
      summaryText: "Explores teacher identity and oversight in an AI-driven assessment environment.",
      timelineJson: JSON.stringify(["Submitted", "Ranked #5"]),
      createdAt: new Date(Date.now() - 60 * 60 * 1000)
    }
  ];

  for (const q of questions) {
    await db.question.upsert({
      where:  { id: q.id },
      update: {},
      create: q
    });
  }
  console.log(`  ✔ ${questions.length} questions`);

  // ── Demo poll ─────────────────────────────────────────────────
  await db.poll.upsert({
    where:  { id: "poll1" },
    update: {},
    create: {
      id: "poll1", meetingId: "m_ai_education",
      question: "How familiar are you with AI tools in your classroom?",
      active: true,
      endsAt: new Date(Date.now() + 5 * 60 * 1000),
      totalVotes: 87,
      options: {
        create: [
          { id: "opt1", label: "Very familiar",       votes: 31 },
          { id: "opt2", label: "Somewhat familiar",   votes: 38 },
          { id: "opt3", label: "Not familiar at all", votes: 18 }
        ]
      }
    }
  });
  console.log("  ✔ 1 poll");

  // ── Demo participants ─────────────────────────────────────────
  const participants = [
    { id: "p1", meetingId: "m_ai_education", name: "Priya Sharma",  initials: "PS", upvotes: 14, questionsCount: 3 },
    { id: "p2", meetingId: "m_ai_education", name: "James Wilson",  initials: "JW", upvotes: 11, questionsCount: 2 },
    { id: "p3", meetingId: "m_ai_education", name: "Sarah Chen",    initials: "SC", upvotes: 9,  questionsCount: 4 },
    { id: "p4", meetingId: "m_ai_education", name: "Ravi Kumar",    initials: "RK", upvotes: 7,  questionsCount: 1 },
    { id: "p5", meetingId: "m_ai_education", name: "Ananya Sharma", initials: "AS", upvotes: 5,  questionsCount: 2, userId: ananya.id }
  ];
  for (const p of participants) {
    await db.participant.upsert({ where: { id: p.id }, update: {}, create: p });
  }
  console.log(`  ✔ ${participants.length} participants`);

  // ── Demo notifications ────────────────────────────────────────
  const notifications = [
    { id: "n1", userId: ananya.id, type: "Meeting Updates", title: "Education Policy Discussion is starting soon", body: "Your meeting starts in 15 minutes", time: "9:45 AM" },
    { id: "n2", userId: ananya.id, type: "Questions",       title: "New question in Education Policy Discussion", body: "How can AI be used ethically in education?", time: "9:30 AM" },
    { id: "n3", userId: ananya.id, type: "System",          title: "Meeting report is ready", body: "View insights from Education Policy Discussion", time: "May 27" }
  ];
  for (const n of notifications) {
    await db.notification.upsert({ where: { id: n.id }, update: {}, create: n });
  }
  console.log(`  ✔ ${notifications.length} notifications`);

  console.log("\n✅ Seed complete!");
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
