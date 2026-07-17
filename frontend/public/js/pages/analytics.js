/* ============================================================
   Analytics Page — Session analytics and post-session reports
   Loaded from real DB via GET /api/analytics (aggregate) and
   GET /api/analytics/meeting/:id (per-meeting).
   ============================================================ */
import { icons } from "../utils/icons.js";
import { state } from "../state.js";
import { go } from "../utils/api.js";
import { shell, phone, lineChart, desktopDashboard } from "../components/shared.js";

// ── Helpers ────────────────────────────────────────────────────

function fmt(n) { return n == null ? "0" : String(n); }

function statCard(icon, label, value) {
  return `
    <div class="stat-card" style="text-align:center">
      <strong style="font-size:22px">${fmt(value)}</strong>
      <span class="subtle">${icon} ${label}</span>
    </div>
  `;
}

function emptyState() {
  return `
    <div class="center-screen" style="text-align:center;padding:40px 0">
      ${icons.barChart}
      <h2 class="screen-title" style="margin:16px 0 8px">No analytics yet</h2>
      <p class="subtle">Host or attend a meeting to see your session data here.</p>
      <button class="btn" style="margin-top:16px" onclick="go('/meetings')">
        ${icons.plus} Create a Meeting
      </button>
    </div>
  `;
}

// ── Per-meeting analytics loader (called from conducted meetings / reports) ─
export async function loadMeetingAnalytics(meetingId) {
  const res  = await fetch(`/api/analytics/meeting/${meetingId}`).catch(() => null);
  if (!res?.ok) return null;
  return res.json();
}
window.loadMeetingAnalytics = loadMeetingAnalytics;

// ── Main page ─────────────────────────────────────────────────

export function renderAnalytics() {
  const data = state.sessionAnalytics;

  if (!data || (!data.overview && !data.analytics)) {
    // No data yet — show empty state
    shell(phone(emptyState(), "activity"), desktopDashboard());
    return;
  }

  // Support both old shape (data.analytics) and new shape (data.overview)
  const overview = data.overview || [];
  const trend    = data.trend || data.analytics?.trend || [0];
  const totals   = data.analytics?.totals || {};
  const aiSum    = data.analytics?.aiSummary || "Run a session to see your AI summary.";

  shell(phone(`
    <h1 class="screen-title">Analytics</h1>
    <p class="subtle">Your overall performance across all sessions.</p>

    ${overview.length > 0 ? `
    <div class="wide-cards" style="grid-template-columns:repeat(2,1fr);margin:18px 0">
      ${overview.map(({ label, value, delta }) => `
        <div class="stat-card" style="text-align:center">
          <strong style="font-size:20px">${value}</strong>
          <span class="subtle">${label}</span>
          ${delta ? `<span style="font-size:11px;color:var(--success)">${delta}</span>` : ""}
        </div>
      `).join("")}
    </div>
    ` : ""}

    ${Object.keys(totals).length > 0 ? `
    <div class="wide-cards" style="grid-template-columns:repeat(2,1fr);margin:18px 0">
      ${statCard(icons.users,         "Participants",  totals.participants)}
      ${statCard(icons.messageCircle, "Questions",     totals.questions)}
      ${statCard(icons.hash,          "Answered",      totals.answered)}
      ${statCard(icons.clock,         "Avg Latency",   totals.averageLatency)}
    </div>
    ` : ""}

    <div class="chart-card" style="margin-bottom:14px">
      <div class="row"><h2 class="screen-title">Engagement Trend</h2><span class="badge">Session</span></div>
      ${lineChart(trend)}
    </div>

    <section class="chart-card stack">
      <h2 class="screen-title">${icons.zap} AI Summary</h2>
      <p style="font-size:14px;color:var(--ink-secondary);line-height:1.6">${aiSum}</p>
    </section>

    <div class="stack" style="margin-top:16px;gap:10px">
      <button class="btn secondary" style="width:100%" onclick="exportAnalytics()">
        ${icons.download} Export Report
      </button>
      <button class="btn" style="width:100%" onclick="go('/conducted')">
        ${icons.fileText} Conducted Meetings
      </button>
    </div>
  `, "activity"), analyticsDesktop());
}

export function analyticsDesktop() {
  if (!state.sessionAnalytics) return desktopDashboard();
  const data     = state.sessionAnalytics;
  const overview = data.overview || [];
  const trend    = data.trend || data.analytics?.trend || [0];
  const aiSum    = data.analytics?.aiSummary || data.aiSummary || "";

  return `
    <div class="panel" style="padding:22px">
      <h1 class="title">Analytics Overview</h1>
      <p class="subtle" style="margin-top:6px">${aiSum}</p>
    </div>
    ${overview.length > 0 ? `
    <div class="wide-cards">
      ${overview.map(({ label, value, delta }) => `
        <div class="stat-card" style="text-align:center">
          <strong>${value}</strong>
          <span class="subtle">${label.replace(/[A-Z]/g, " $&")}</span>
          ${delta ? `<span style="font-size:11px;color:var(--success)">${delta}</span>` : ""}
        </div>
      `).join("")}
    </div>
    ` : ""}
    <div class="chart-card">
      <div class="row"><h2 class="screen-title">Engagement</h2><span class="badge">Session</span></div>
      ${lineChart(trend)}
    </div>
  `;
}

// ── Export helper ─────────────────────────────────────────────

function exportAnalytics() {
  const data = state.sessionAnalytics;
  if (!data) return alert("No analytics data to export.");
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `collectivevoice-analytics-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
window.exportAnalytics = exportAnalytics;
