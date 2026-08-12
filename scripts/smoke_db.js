// smoke test
"use strict";
require("dotenv/config");
const db = require("../backend/src/db/client");
async function main() {
  const n1 = await db.notification.count();
  const n2 = await db.adminNotification.count();
  const n3 = await db.adminMessage.count();
  const n4 = await db.notificationPreference.count();
  console.log("notification rows:", n1);
  console.log("adminNotification rows:", n2);
  console.log("adminMessage rows:", n3);
  console.log("notificationPreference rows:", n4);
  console.log("ALL OK — all 4 tables accessible");
}
main().catch(e => { console.error("ERROR:", e.message); process.exit(1); })
  .finally(() => db.$disconnect());
