/* ============================================================
   mailer.js — Nodemailer wrapper for CollectiveVoice
   Reads SMTP config from env vars. Falls back to console.log
   in development so the app never crashes without SMTP creds.
   ============================================================ */
"use strict";

const nodemailer = require("nodemailer");

// ── Transport ─────────────────────────────────────────────────
// Build once; reuse across calls. Falls back to Ethereal-style
// dev mode (console.log) if SMTP_HOST is not set.
let _transport = null;

function _getTransport() {
  if (_transport) return _transport;

  if (!process.env.SMTP_HOST) {
    // Dev stub — no SMTP configured, log to console
    return null;
  }

  _transport = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_PORT === "465",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return _transport;
}

// ── Core send helper ──────────────────────────────────────────
/**
 * Send an email.
 * @param {{ to: string, subject: string, html: string }} opts
 */
async function sendMail({ to, subject, html }) {
  const transport = _getTransport();

  if (!transport) {
    // Dev-only fallback — never runs in production because SMTP_HOST is required
    if (process.env.NODE_ENV !== "production") {
      console.log(`[Mailer] (dev stub — no SMTP) To: ${to} | Subject: ${subject}`);
    }
    return;
  }

  await transport.sendMail({
    from:    process.env.SMTP_FROM || `"CollectiveVoice" <noreply@collectivevoice.app>`,
    to,
    subject,
    html,
  });
}

// ── Digest email builder ──────────────────────────────────────
/**
 * Send a post-meeting digest email to the meeting owner.
 * @param {object} meeting   — meeting row from DB (must include owner email)
 * @param {object} summary   — output of buildMeetingDigest()
 */
async function sendDigestEmail(meeting, summary) {
  if (!meeting?.owner?.email) return; // no email address → skip silently

  const { totals, top5Unanswered } = summary;

  const topQHtml = top5Unanswered.length
    ? top5Unanswered.map((q, i) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e8e8f4;font-weight:600;color:#5b34ff;">${i + 1}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e8e8f4;color:#111936;">${q.text}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e8e8f4;color:#68708d;white-space:nowrap;">${q.votes} votes</td>
        </tr>
      `).join("")
    : `<tr><td colspan="3" style="padding:12px;color:#68708d;text-align:center;">All questions were answered! 🎉</td></tr>`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Meeting Digest — ${meeting.title}</title></head>
<body style="margin:0;padding:0;background:#f7f8fc;font-family:Inter,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8fc;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(25,28,70,.10);">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#5b34ff,#7c5cff);padding:32px 40px;">
          <h1 style="margin:0;font-size:24px;font-weight:800;color:#fff;">📊 Meeting Digest</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,.8);font-size:15px;">${meeting.title}</p>
        </td></tr>

        <!-- Stats grid -->
        <tr><td style="padding:32px 40px 0;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              ${[
                ["🙋", totals.participants, "Participants"],
                ["💬", totals.questions,   "Questions"],
                ["👍", totals.upvotes,     "Upvotes"],
                ["✅", totals.answered,    "Answered"],
              ].map(([icon, val, label]) => `
                <td align="center" style="padding:16px;background:#f6f4ff;border-radius:12px;margin:4px;">
                  <div style="font-size:28px;line-height:1;">${icon}</div>
                  <div style="font-size:24px;font-weight:800;color:#5b34ff;margin:6px 0 2px;">${val}</div>
                  <div style="font-size:12px;color:#68708d;font-weight:500;">${label}</div>
                </td>
              `).join('<td width="8"></td>')}
            </tr>
          </table>
        </td></tr>

        <!-- Top unanswered -->
        <tr><td style="padding:32px 40px;">
          <h2 style="margin:0 0 16px;font-size:16px;font-weight:700;color:#111936;">Top Unanswered Questions</h2>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8e8f4;border-radius:12px;overflow:hidden;">
            <thead>
              <tr style="background:#f6f4ff;">
                <th style="padding:10px 12px;text-align:left;font-size:12px;color:#68708d;">#</th>
                <th style="padding:10px 12px;text-align:left;font-size:12px;color:#68708d;">Question</th>
                <th style="padding:10px 12px;text-align:left;font-size:12px;color:#68708d;">Votes</th>
              </tr>
            </thead>
            <tbody>${topQHtml}</tbody>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:0 40px 32px;border-top:1px solid #e8e8f4;text-align:center;">
          <p style="margin:24px 0 0;font-size:12px;color:#68708d;">
            Sent by <strong>CollectiveVoice</strong> · Meeting code: <code style="background:#f6f4ff;padding:2px 6px;border-radius:4px;">${meeting.code}</code>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
  `.trim();

  await sendMail({
    to:      meeting.owner.email,
    subject: `Meeting digest: "${meeting.title}"`,
    html,
  });
}

module.exports = { sendMail, sendDigestEmail };
