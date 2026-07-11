/* ============================================================
   Analytics Page — Session analytics and post-session reports
   ============================================================ */
import { icons } from "../utils/icons.js";
import { state } from "../state.js";
import { go } from "../utils/api.js";
import { shell, phone, lineChart, desktopDashboard } from "../components/shared.js";

export function renderAnalytics() {
  const data = state.sessionAnalytics;
  const totals = data.analytics.totals;
  shell(phone(`
    <h1 class="screen-title">Session Analytics</h1>
    <p class="subtle">${data.session.title}</p>

    <div class="wide-cards" style="grid-template-columns:repeat(2,1fr);margin:18px 0">
      ${[
        [icons.users, "Participants", totals.participants],
        [icons.messageCircle, "Questions", totals.questions],
        [icons.hash, "Clusters", totals.uniqueClusters],
        [icons.clock, "Latency", totals.averageLatency]
      ].map(([ic, label, value]) => `
        <div class="stat-card" style="text-align:center">
          <strong style="font-size:20px">${value}</strong>
          <span class="subtle">${label}</span>
        </div>
      `).join("")}
    </div>

    <div class="chart-card" style="margin-bottom:14px">
      <div class="row"><h2 class="screen-title">Engagement Trend</h2><span class="badge">Session</span></div>
      ${lineChart(data.analytics.trend)}
    </div>

    <section class="chart-card stack">
      <h2 class="screen-title">${icons.zap} AI Summary</h2>
      <p style="font-size:14px;color:var(--ink-secondary);line-height:1.6">${data.analytics.aiSummary}</p>
    </section>

    <div class="stack" style="margin-top:16px;gap:10px">
      <button class="btn secondary" style="width:100%">${icons.download} Export Report</button>
      <button class="btn" style="width:100%" onclick="go('/conducted')">${icons.fileText} Conducted Meetings</button>
    </div>
  `, "activity"), analyticsDesktop());
}

export function analyticsDesktop() {
  if (!state.sessionAnalytics) return desktopDashboard();
  const analytics = state.sessionAnalytics.analytics;
  return `
    <div class="panel" style="padding:22px">
      <h1 class="title">Post-Session Analytics</h1>
      <p class="subtle" style="margin-top:6px">${analytics.aiSummary}</p>
    </div>
    <div class="wide-cards">
      ${Object.entries(analytics.totals).slice(0, 4).map(([label, value]) => `
        <div class="stat-card" style="text-align:center">
          <strong>${value}</strong>
          <span class="subtle">${label.replace(/[A-Z]/g, " $&")}</span>
        </div>
      `).join("")}
    </div>
    <div class="chart-card">
      <div class="row"><h2 class="screen-title">Engagement</h2><span class="badge">Session</span></div>
      ${lineChart(analytics.trend)}
    </div>
  `;
}
