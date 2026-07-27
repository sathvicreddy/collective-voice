// scripts/apply_migration.js
// Applies the enrollment + grace period schema changes directly
// using the Neon WebSocket connection (port 443, not 5432).
// Run once: node -r dotenv/config scripts/apply_migration.js
"use strict";

require("dotenv/config");
const db = require("../backend/src/db/client");

async function main() {
  console.log("Applying migration: add_enrollment_grace_period...\n");

  const statements = [
    // 1. Add graceEndsAt to Meeting
    `ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "graceEndsAt" TIMESTAMP(3)`,

    // 2. Create MeetingEnrollment table
    `CREATE TABLE IF NOT EXISTS "MeetingEnrollment" (
      "id"         TEXT NOT NULL,
      "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "joinMethod" TEXT NOT NULL DEFAULT 'code',
      "meetingId"  TEXT NOT NULL,
      "userId"     TEXT NOT NULL,
      CONSTRAINT "MeetingEnrollment_pkey" PRIMARY KEY ("id")
    )`,

    // 3. Unique constraint: one enrollment per user per meeting
    `CREATE UNIQUE INDEX IF NOT EXISTS "MeetingEnrollment_meetingId_userId_key"
     ON "MeetingEnrollment"("meetingId", "userId")`,

    // 4. Foreign key: MeetingEnrollment -> Meeting
    `DO $$ BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM information_schema.table_constraints
         WHERE constraint_name = 'MeetingEnrollment_meetingId_fkey'
       ) THEN
         ALTER TABLE "MeetingEnrollment"
           ADD CONSTRAINT "MeetingEnrollment_meetingId_fkey"
           FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE;
       END IF;
     END $$`,

    // 5. Foreign key: MeetingEnrollment -> User
    `DO $$ BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM information_schema.table_constraints
         WHERE constraint_name = 'MeetingEnrollment_userId_fkey'
       ) THEN
         ALTER TABLE "MeetingEnrollment"
           ADD CONSTRAINT "MeetingEnrollment_userId_fkey"
           FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
       END IF;
     END $$`,

    // 6. Create GracePeriod table
    `CREATE TABLE IF NOT EXISTS "GracePeriod" (
      "id"            TEXT NOT NULL,
      "graceStartsAt" TIMESTAMP(3) NOT NULL,
      "graceEndsAt"   TIMESTAMP(3) NOT NULL,
      "hostAction"    TEXT,
      "resolvedAt"    TIMESTAMP(3),
      "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "meetingId"     TEXT NOT NULL,
      CONSTRAINT "GracePeriod_pkey" PRIMARY KEY ("id")
    )`,

    // 7. Unique: one grace period per meeting
    `CREATE UNIQUE INDEX IF NOT EXISTS "GracePeriod_meetingId_key"
     ON "GracePeriod"("meetingId")`,

    // 8. Foreign key: GracePeriod -> Meeting
    `DO $$ BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM information_schema.table_constraints
         WHERE constraint_name = 'GracePeriod_meetingId_fkey'
       ) THEN
         ALTER TABLE "GracePeriod"
           ADD CONSTRAINT "GracePeriod_meetingId_fkey"
           FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE;
       END IF;
     END $$`,
  ];

  for (const sql of statements) {
    const label = sql.trim().split("\n")[0].slice(0, 80);
    try {
      await db.$executeRawUnsafe(sql);
      console.log(`  ✔ ${label}`);
    } catch (err) {
      console.error(`  ✘ ${label}`);
      console.error(`    ${err.message}`);
      process.exit(1);
    }
  }

  console.log("\n✅ Migration applied successfully!");
  await db.$disconnect();
}

main().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
