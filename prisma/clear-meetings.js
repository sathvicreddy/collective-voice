/**
 * clear-meetings.js
 * Deletes all meeting-related data (Votes, PollOptions, Polls, Questions,
 * Participants, Meetings) while keeping User accounts intact.
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("🧹  Clearing all meeting data...\n");

  // Delete in dependency order (children before parents)
  const votes        = await prisma.vote.deleteMany({});
  const pollOptions  = await prisma.pollOption.deleteMany({});
  const polls        = await prisma.poll.deleteMany({});
  const questions    = await prisma.question.deleteMany({});
  const participants = await prisma.participant.deleteMany({});
  const meetings     = await prisma.meeting.deleteMany({});
  const notifs       = await prisma.notification.deleteMany({});

  console.log(`  ✅  Votes deleted        : ${votes.count}`);
  console.log(`  ✅  Poll options deleted : ${pollOptions.count}`);
  console.log(`  ✅  Polls deleted        : ${polls.count}`);
  console.log(`  ✅  Questions deleted    : ${questions.count}`);
  console.log(`  ✅  Participants deleted : ${participants.count}`);
  console.log(`  ✅  Meetings deleted     : ${meetings.count}`);
  console.log(`  ✅  Notifications cleared: ${notifs.count}`);
  console.log("\n✨  Database is now clean. User accounts are preserved.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
