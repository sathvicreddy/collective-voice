// scripts/apply_notification_migration.js
// Adds the notification system columns + new tables.
// Follows the same pattern as scripts/apply_migration.js.
// Run once: node -r dotenv/config scripts/apply_notification_migration.js
"use strict";

require("dotenv/config");
const db = require("../backend/src/db/client");

async function main() {
  console.log("Applying migration: notification_system_v2...\n");

  const statements = [
    // ── Notification: add missing columns ──────────────────────────────────
    `ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "read"     BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "source"   TEXT    NOT NULL DEFAULT 'system'`,
    `ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "senderId" TEXT`,

    // ── AdminNotification table ────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS "AdminNotification" (
      "id"        TEXT        NOT NULL,
      "type"      TEXT        NOT NULL,
      "priority"  TEXT        NOT NULL DEFAULT 'medium',
      "title"     TEXT        NOT NULL,
      "body"      TEXT        NOT NULL,
      "read"      BOOLEAN     NOT NULL DEFAULT false,
      "relatedId" TEXT        NOT NULL DEFAULT '',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AdminNotification_pkey" PRIMARY KEY ("id")
    )`,

    // ── AdminMessage table ─────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS "AdminMessage" (
      "id"             TEXT         NOT NULL,
      "senderId"       TEXT         NOT NULL,
      "subject"        TEXT         NOT NULL,
      "body"           TEXT         NOT NULL,
      "audience"       TEXT         NOT NULL,
      "targetUserId"   TEXT,
      "meetingId"      TEXT,
      "recipientCount" INTEGER      NOT NULL DEFAULT 0,
      "recipientsJson" TEXT         NOT NULL DEFAULT '[]',
      "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AdminMessage_pkey" PRIMARY KEY ("id")
    )`,

    // FK: AdminMessage.senderId -> User.id
    `DO $$ BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM information_schema.table_constraints
         WHERE constraint_name = 'AdminMessage_senderId_fkey'
       ) THEN
         ALTER TABLE "AdminMessage"
           ADD CONSTRAINT "AdminMessage_senderId_fkey"
           FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
       END IF;
     END $$`,

    // ── NotificationPreference table ───────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS "NotificationPreference" (
      "userId"           TEXT    NOT NULL,
      "meetingUpdates"   BOOLEAN NOT NULL DEFAULT true,
      "questionActivity" BOOLEAN NOT NULL DEFAULT true,
      "systemAlerts"     BOOLEAN NOT NULL DEFAULT true,
      "adminMessages"    BOOLEAN NOT NULL DEFAULT true,
      "emailDigest"      BOOLEAN NOT NULL DEFAULT false,
      CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId")
    )`,

    // FK: NotificationPreference.userId -> User.id
    `DO $$ BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM information_schema.table_constraints
         WHERE constraint_name = 'NotificationPreference_userId_fkey'
       ) THEN
         ALTER TABLE "NotificationPreference"
           ADD CONSTRAINT "NotificationPreference_userId_fkey"
           FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
       END IF;
     END $$`,
  ];

  for (const sql of statements) {
    const label = sql.trim().split("\n")[0].slice(0, 80);
    try {
      await db.$executeRawUnsafe(sql);
      console.log(`  OK: ${label}`);
    } catch (err) {
      console.error(`  FAIL: ${label}`);
      console.error(`    ${err.message}`);
      process.exit(1);
    }
  }

  console.log("\nNotification migration applied successfully!");
  await db.$disconnect();
}

main().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
