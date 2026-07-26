/* ============================================================
   Activity Page — Desktop matches "Activity Overview" design image
   ============================================================ */
import { icons } from "../utils/icons.js";
import { state } from "../state.js";
import { go } from "../utils/api.js";
import { shell, phone, meetingCard, questionCard, lineChart, donutChart, desktopTopbar } from "../components/shared.js";

/* ---- Helper: Engagement Summary donut + legend (side by side) ---- */
function engagementDonut() {
  const segs = [
    { label: "Upcoming",  value: 12, pct: 52, color: "#5b34ff" },
    { label: "Live",      value: 3,  pct: 13, color: "#24b86f" },
    { label: "Conducted", value: 8,  pct: 35, color: "#ff8a2a" }
  ];
  const total = 23;
  // SVG 130x130, donut centered at (65,65) radius 50, gap of 2px between segments
  const cx = 65, cy = 65, r = 50;
  const circ = 2 * Math.PI * r;
  const GAP = 3; // px gap between segments
  let off = 0;
  const arcs = segs.map(s => {
    const len = Math.max(0, (s.value / total) * circ - GAP);
    const a = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="13" stroke-dasharray="${len} ${circ - len}" stroke-dashoffset="${-off}" transform="rotate(-90 ${cx} ${cy})"/>`;
    off += (s.value / total) * circ; // advance by full segment (gap is visual only)
    return a;
  }).join("");

  // Background ring
  const bg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#f0eeff" stroke-width="13"/>`;

  const legend = segs.map(s =>
    `<div class="act-legend-row">
      <span class="act-legend-dot" style="background:${s.color}"></span>
      <span class="act-legend-label">${s.label}</span>
      <strong class="act-legend-val">${s.value} (${s.pct}%)</strong>
    </div>`
  ).join("");

  return `
    <div class="act-donut-wrap">
      <div class="act-donut-svg-wrap">
        <svg viewBox="0 0 130 130" style="width:130px;height:130px;display:block">${bg}${arcs}</svg>
        <div class="act-donut-center">
          <strong>${total}</strong>
          <span>Total<br>Joined</span>
        </div>
      </div>
      <div class="act-donut-legend">${legend}</div>
    </div>
  `;
}

/* ---- Helper: Participation trend line chart with Y-axis labels ---- */
function trendLineChart(points) {
  const maxVal = 40; // fixed max for consistent Y scale
  const labels = ["0", "10", "20", "30", "40"];
  const W = 400, H = 160;
  const padL = 28, padR = 10, padT = 10, padB = 4;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const step = chartW / (points.length - 1);

  const coords = points.map((p, i) => {
    const x = padL + i * step;
    const y = padT + chartH - (p / maxVal) * chartH;
    return { x, y };
  });

  const polyline = coords.map(c => `${c.x},${c.y}`).join(" ");
  const gradPoly = `${padL},${padT + chartH} ${polyline} ${padL + (points.length - 1) * step},${padT + chartH}`;

  // Y-axis grid lines & labels
  const yTicks = [0, 10, 20, 30, 40].map(v => {
    const y = padT + chartH - (v / maxVal) * chartH;
    return `
      <line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#e8e8f4" stroke-width="1"/>
      <text x="${padL - 4}" y="${y + 4}" text-anchor="end" font-size="9" fill="#9ea5c0" font-family="Inter,sans-serif">${v}</text>
    `;
  }).join("");

  const dots = coords.map(c =>
    `<circle cx="${c.x}" cy="${c.y}" r="4" fill="#fff" stroke="#5b34ff" stroke-width="2"/>`
  ).join("");

  return `
    <div class="act-trend-chart">
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px;display:block;overflow:visible">
        <defs>
          <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#5b34ff" stop-opacity="0.15"/>
            <stop offset="100%" stop-color="#5b34ff" stop-opacity="0"/>
          </linearGradient>
        </defs>
        ${yTicks}
        <polygon points="${gradPoly}" fill="url(#trendGrad)"/>
        <polyline points="${polyline}" fill="none" stroke="#5b34ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        ${dots}
      </svg>
      <div class="act-trend-labels">
        <span>May 5</span><span>May 12</span><span>May 19</span><span>May 26</span><span>Jun 2</span>
      </div>
    </div>
  `;
}

export function renderActivity(tab = "questions") {
  const analytics = state.activity.analytics;
  const meetings = state.activity.meetings || state.meetings;

  /* ---- Mobile tabs content ---- */
  const mobileTabContent = {
    overview: `
      <div class="wide-cards" style="grid-template-columns:repeat(2,1fr)">
        ${analytics.overview.map(item => `
          <div class="stat-card">
            <div class="icon-box" style="margin-bottom:8px">${item.label.includes("Question") ? icons.messageCircle : item.label.includes("Upvote") ? icons.thumbsUp : item.label.includes("Answer") ? icons.checkCircle : icons.calendar}</div>
            <strong>${item.value}</strong>
            <span class="subtle">${item.label}</span>
            <div class="delta up">${icons.trendingUp} ${item.delta}</div>
          </div>
        `).join("")}
      </div>
      <div class="chart-card">
        <div class="row"><h2 class="screen-title">Engagement Trend</h2><span class="badge">This Week</span></div>
        ${lineChart(analytics.trend)}
      </div>
      <div class="chart-card">
        <h2 class="screen-title" style="margin-bottom:12px">Activity Breakdown</h2>
        ${donutChart([
          { label: "Upvotes", value: 71 },
          { label: "Questions", value: 54 },
          { label: "Answers", value: 35 },
          { label: "Meetings", value: 20 }
        ], 180, "Total Actions")}
      </div>
    `,
    questions: `
      <div class="row" style="margin:12px 0;gap:6px;flex-wrap:wrap">
        <span class="badge">All (8)</span>
        <span class="badge warning">Under Review (2)</span>
        <span class="badge success">Answered (5)</span>
      </div>
      <div class="stack">${state.questions.map((q, i) => questionCard(q, i)).join("")}</div>
      <button class="btn" style="width:100%;margin-top:14px" onclick="go('/audience')">${icons.plus} Ask a New Question</button>
    `,
    meetings: `
      <div class="segmented" style="margin-bottom:12px">
        <button class="active">Upcoming (${meetings.filter(m => m.status === "upcoming").length})</button>
        <button>Live (${meetings.filter(m => m.status === "live").length})</button>
        <button onclick="renderActivity('conducted')">Conducted (${meetings.filter(m => m.status === "conducted" || m.status === "past").length})</button>
      </div>
      <div class="stack">
        ${meetings.filter(m => m.status === "live" || m.status === "upcoming").map(m => meetingCard(m)).join("")}
      </div>
    `,
    conducted: `
      <div class="stack">
        ${meetings.filter(m => m.status === "conducted" || m.status === "past").map(m =>
          meetingCard(m, `<button class="btn secondary small" onclick="openReport('${m.id}')">${icons.barChart} Report</button>`)
        ).join("")}
        <button class="btn secondary" style="width:100%" onclick="go('/analytics')">${icons.download} Export Report</button>
      </div>
    `,
    insights: `
      <div class="wide-cards" style="grid-template-columns:repeat(2,1fr)">
        ${[
          ["Total Joined", 23, icons.users],
          ["Live Attended", 6, icons.zap],
          ["Questions Asked", 12, icons.messageCircle],
          ["Total Upvotes", 340, icons.thumbsUp]
        ].map(([label, value, ic]) => `
          <div class="stat-card">
            <div class="icon-box" style="margin-bottom:8px">${ic}</div>
            <strong>${value}</strong>
            <span class="subtle">${label}</span>
          </div>
        `).join("")}
      </div>
      <div class="chart-card">
        <div class="row"><h2 class="screen-title">Participation Trend</h2><span class="badge">This Month</span></div>
        ${lineChart(analytics.trend)}
      </div>
      <div class="chart-card stack">
        <h2 class="screen-title">Top Categories</h2>
        ${analytics.categories.map(item => `
          <div class="bar-row">
            <span>${item.label}</span>
            <div class="bar-track"><div class="bar-fill" style="width:${item.value}%"></div></div>
            <strong>${item.value}%</strong>
          </div>
        `).join("")}
      </div>
    `
  };

  /* ---- Mobile phone frame ---- */
  const mobileContent = `
    <h1 class="screen-title">Activity</h1>
    <p class="subtle">Your engagement overview</p>
    <div class="tabs tabs-four">
      <button class="${tab === "overview" ? "active" : ""}" onclick="renderActivity('overview')">Overview</button>
      <button class="${tab === "questions" ? "active" : ""}" onclick="renderActivity('questions')">Questions</button>
      <button class="${tab === "meetings" || tab === "conducted" ? "active" : ""}" onclick="renderActivity('meetings')">Meetings</button>
      <button class="${tab === "insights" ? "active" : ""}" onclick="renderActivity('insights')">Insights</button>
    </div>
    ${mobileTabContent[tab] || mobileTabContent.questions}
  `;

  /* ---- Desktop main column ---- */
  const desktopMain = `
    <div class="activity-desktop">
      ${desktopTopbar(
        "Activity Overview",
        "Track your participation and meeting engagement.",
        "May 25 – May 31, 2025"
      )}

      <!-- Stats Row: 4 cards -->
      <div class="act-stats-row">
        ${[
          { icon: icons.calendar, color: "blue",   value: "12", label: "Upcoming",     link: "View all",    route: "/meetings"  },
          { icon: icons.radio,    color: "green",  value: "3",  label: "Live",          link: "View all",    route: "/meetings"  },
          { icon: icons.check,    color: "orange", value: "8",  label: "Conducted",     link: "View all",    route: "/conducted" },
          { icon: icons.users,    color: "",       value: "23", label: "Total Joined",  link: "View details",route: "/activity"  }
        ].map(s => `
          <div class="act-stat-card">
            <div class="icon-box ${s.color} act-stat-icon">${s.icon}</div>
            <div class="act-stat-value">${s.value}</div>
            <div class="act-stat-label">${s.label}</div>
            <button class="link-btn act-stat-link" onclick="go('${s.route}')">${s.link}</button>
          </div>
        `).join("")}
      </div>

      <!-- Charts Row -->
      <div class="act-charts-row">
        <!-- LEFT: Engagement Summary -->
        <div class="act-card act-engagement-card">
          <div class="act-card-header">
            <span class="act-card-title">Engagement Summary ${icons.info}</span>
            <button class="link-btn" onclick="go('/analytics')">View Details</button>
          </div>
          ${engagementDonut()}
        </div>

        <!-- RIGHT: Participation Trend -->
        <div class="act-card act-trend-card">
          <div class="act-card-header">
            <span class="act-card-title">Participation Trend</span>
            <button class="act-period-btn">This Month ${icons.chevronDown}</button>
          </div>
          ${trendLineChart(analytics.trend)}
        </div>
      </div>

      <!-- Recent Activity -->
      <div class="act-card">
        <div class="act-card-header" style="margin-bottom:16px">
          <span class="act-card-title">Recent Activity</span>
        </div>
        <div class="act-recent-list">
          ${[
            { icon: icons.checkCircle, color: "green",  text: `You answered a question in "AI in Education: Opportunities & Challenges"`, time: "2 min ago",  btn: "View Question", route: "/activity" },
            { icon: icons.thumbsUp,    color: "",        text: `You upvoted a question "How can AI be used ethically in education?"`,       time: "15 min ago", btn: "View Question", route: "/activity" },
            { icon: icons.calendar,    color: "orange",  text: `You joined "Future of Remote Learning"`,                                   time: "1 hour ago", btn: "View Meeting",  route: "/meetings" },
            { icon: icons.user,        color: "blue",    text: `You registered for "Data Privacy in EdTech"`,                              time: "Yesterday",  btn: "View Meeting",  route: "/meetings" }
          ].map(a => `
            <div class="act-recent-item">
              <div class="icon-box ${a.color}" style="width:34px;height:34px;flex-shrink:0">${a.icon}</div>
              <div class="act-recent-body">
                <p class="act-recent-text">${a.text}</p>
                <p class="act-recent-time">${a.time}</p>
              </div>
              <button class="btn secondary small" onclick="go('${a.route}')">${a.btn}</button>
            </div>
          `).join("")}
        </div>
        <div style="text-align:center;margin-top:16px;padding-top:12px;border-top:1px solid var(--line-light)">
          <button class="link-btn" onclick="go('/activity')">View all activity</button>
        </div>
      </div>

      <!-- Bottom Action Cards -->
      <div class="act-action-grid">
        ${[
          { icon: icons.messageCircle, tone: "",       title: "Ask Questions",    sub: "Ask anonymous questions and get them answered by speakers.",          link: "Ask Now →",                 route: "/audience"      },
          { icon: icons.activity,      tone: "blue",   title: "Track Engagement", sub: "View your activity, upvotes, responses and overall participation.",    link: "View Analytics →",          route: "/analytics"     },
          { icon: icons.checkCircle,   tone: "green",  title: "Stay Updated",     sub: "Get notified about upcoming meetings and live sessions.",              link: "Manage Notifications →",    route: "/notifications" },
          { icon: icons.users,         tone: "orange", title: "Invite Others",    sub: "Invite your peers and colleagues to join upcoming events.",            link: "Invite Now →",              route: "/meetings"      }
        ].map(a => `
          <div class="act-action-card">
            <div class="icon-box ${a.tone}" style="width:44px;height:44px;margin-bottom:12px">${a.icon}</div>
            <strong style="font-size:14px;font-weight:700;display:block;margin-bottom:6px;color:var(--ink)">${a.title}</strong>
            <p class="subtle" style="font-size:12px;line-height:1.5;margin-bottom:14px">${a.sub}</p>
            <button class="link-btn" onclick="go('${a.route}')" style="font-size:13px">${a.link}</button>
          </div>
        `).join("")}
      </div>
    </div>
  `;

  /* ---- Desktop right panel ---- */
  const desktopRight = `
    <div class="activity-right-panel">
      <!-- Upcoming Meetings -->
      <div class="home-panel-card">
        <div class="home-panel-header">
          <span class="home-panel-title">Upcoming Meetings</span>
          <button class="link-btn" onclick="go('/meetings')">View all</button>
        </div>
        <div class="activity-meetings-list">
          ${(() => {
            const upcoming = (state.meetings || [])
              .filter(m => m.status === "upcoming" || m.status === "live")
              .slice(0, 4);
            if (!upcoming.length) {
              return `<p class="subtle" style="padding:12px 0;text-align:center">No upcoming meetings. <button class="link-btn" onclick="go('/meetings/create')">Create one \u2192</button></p>`;
            }
            return upcoming.map(m => `
              <div class="activity-meeting-item">
                <div class="icon-box ${m.status === 'live' ? 'orange' : ''}" style="width:34px;height:34px;flex-shrink:0">
                  ${m.status === 'live' ? icons.radio : icons.calendar}
                </div>
                <div style="flex:1;min-width:0">
                  <p style="font-size:12px;font-weight:600;margin:0 0 4px;line-height:1.3;color:var(--ink)">${m.title}</p>
                  <div class="home-meeting-meta">${icons.calendar} ${m.date || (m.scheduledAt ? new Date(m.scheduledAt).toLocaleDateString() : 'TBD')} &bull; ${m.time || ''}</div>
                  <div class="home-meeting-meta" style="margin-top:2px">${icons.users} ${m.participants || 0} participants</div>
                </div>
                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">
                  ${m.status === 'live'
                    ? '<span class="badge success" style="font-size:10px;padding:2px 7px"><span class="live-dot"></span>Live</span>'
                    : `<span class="badge" style="font-size:10px;padding:2px 7px">${m.status}</span>`}
                </div>
              </div>
            `).join('');
          })()}
        </div>

      </div>

      <!-- Top Categories -->
      <div class="home-panel-card">
        <div class="home-panel-header">
          <span class="home-panel-title">Top Categories <span class="subtle" style="font-weight:400;font-size:11px">(by participation)</span></span>
          <button class="act-period-btn">This Month ${icons.chevronDown}</button>
        </div>
        <div class="activity-categories">
          ${[
            { icon: icons.zap,          color: "blue",   label: "AI in Education",    pct: 45 },
            { icon: icons.users,        color: "",        label: "Remote Learning",    pct: 30 },
            { icon: icons.checkCircle,  color: "orange",  label: "Data Privacy",       pct: 15 },
            { icon: icons.calendar,     color: "green",   label: "EdTech Innovations", pct: 10 }
          ].map(c => `
            <div class="activity-category-item">
              <div class="activity-cat-top">
                <div style="display:flex;align-items:center;gap:8px">
                  <div class="icon-box ${c.color}" style="width:28px;height:28px">${c.icon}</div>
                  <span style="font-size:13px;font-weight:500;color:var(--ink)">${c.label}</span>
                </div>
                <span style="font-size:13px;font-weight:600;color:var(--ink)">${c.pct}%</span>
              </div>
              <div class="bar-track" style="margin-top:6px"><div class="bar-fill" style="width:${c.pct}%"></div></div>
            </div>
          `).join("")}
        </div>
      </div>
    </div>
  `;

  shell(
    phone(mobileContent, "activity"),
    "",
    desktopMain,
    desktopRight
  );
}
