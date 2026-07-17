/* ============================================================
   Session Report Page — Post-session analytics dashboard
   Uses the standard app shell (sidebar + content area).
   Shown immediately after "End Session" is clicked.
   ============================================================ */
import { icons } from "../utils/icons.js";
import { state } from "../state.js";
import { go } from "../utils/api.js";
import { shell } from "../components/shared.js";
import { getSessionState, selectRankedQuestions, stopSessionTimer } from "../store/SessionStore.js";

// ── Helpers ───────────────────────────────────────────────────

function buildTrendData(ss) {
  const totalSecs = ss.sessionTimer || 3600;
  const buckets   = Math.max(8, Math.min(13, Math.ceil(totalSecs / 300)));
  // Simulate engagement: rising peak then tapering
  return Array.from({ length: buckets }, (_, i) => {
    const t    = i / (buckets - 1);
    const peak = Math.sin(Math.PI * t) * 60 + 15;
    return Math.max(5, Math.min(95, Math.round(peak + (Math.random() * 20 - 10))));
  });
}

function drawLineChart(data, sessionMins) {
  const W = 600, H = 170, PAD_X = 36, PAD_Y = 18;
  const scaleY = v =>
    H - PAD_Y - ((v / 100) * (H - PAD_Y * 2));
  const stepX = (W - PAD_X * 2) / (data.length - 1);

  const pts     = data.map((v, i) => `${PAD_X + i * stepX},${scaleY(v)}`);
  const areaPath = `M${pts[0]} L${pts.slice(1).join(" L ")} L${PAD_X + (data.length - 1) * stepX},${H - PAD_Y} L${PAD_X},${H - PAD_Y} Z`;

  const yLabels = [0, 20, 40, 60, 80, 100].map(v => `
    <text x="${PAD_X - 6}" y="${scaleY(v) + 4}" font-size="10" fill="#9ca3af" text-anchor="end">${v}</text>
    <line x1="${PAD_X}" y1="${scaleY(v)}" x2="${W - PAD_X}" y2="${scaleY(v)}" stroke="#f3f4f6" stroke-width="1"/>
  `).join("");

  const startHour = 10, startMin = 24;
  const xLabels = data.map((_, i) => {
    const totalMin = startHour * 60 + startMin + Math.round(i * ((sessionMins || 60) / (data.length - 1)));
    const h = Math.floor(totalMin / 60) % 24;
    const m = String(totalMin % 60).padStart(2, "0");
    const ampm = h >= 12 ? "PM" : "AM";
    return `<text x="${PAD_X + i * stepX}" y="${H - 2}" font-size="9" fill="#9ca3af" text-anchor="middle">${h % 12 || 12}:${m} ${ampm}</text>`;
  }).join("");

  return `
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
         style="width:100%;height:auto;display:block;overflow:visible">
      <defs>
        <linearGradient id="rptGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stop-color="#6366f1" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="#6366f1" stop-opacity="0.01"/>
        </linearGradient>
      </defs>
      ${yLabels}
      ${xLabels}
      <path d="${areaPath}" fill="url(#rptGrad)"/>
      <polyline points="${pts.join(" ")}" fill="none"
        stroke="#6366f1" stroke-width="2.5"
        stroke-linejoin="round" stroke-linecap="round"/>
      ${pts.map(p => {
        const [cx, cy] = p.split(",");
        return `<circle cx="${cx}" cy="${cy}" r="4" fill="white" stroke="#6366f1" stroke-width="2"/>`;
      }).join("")}
    </svg>`;
}

function drawDonut() {
  const segs = [
    { pct: 68, color: "#6366f1" },
    { pct: 22, color: "#10b981" },
    { pct: 8,  color: "#f59e0b" },
    { pct: 2,  color: "#3b82f6" },
  ];
  const R = 50, CX = 65, CY = 65, SW = 16;
  const circ = 2 * Math.PI * R;
  let offset = 0;
  const slices = segs.map(s => {
    const dash = (s.pct / 100) * circ;
    const el = `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none"
      stroke="${s.color}" stroke-width="${SW}"
      stroke-dasharray="${dash} ${circ - dash}"
      stroke-dashoffset="${-offset}"
      transform="rotate(-90 ${CX} ${CY})"/>`;
    offset += dash;
    return el;
  }).join("");
  return `
    <svg viewBox="0 0 130 130" width="120" height="120" style="flex-shrink:0">
      ${slices}
      <text x="${CX}" y="${CY - 5}" text-anchor="middle" font-size="14"
            font-weight="800" fill="#111936">68%</text>
      <text x="${CX}" y="${CY + 10}" text-anchor="middle" font-size="9" fill="#68708d">Active</text>
    </svg>`;
}

// ── Main Render ───────────────────────────────────────────────

export function renderSessionReport() {
  // Stop the session timer immediately
  stopSessionTimer();

  const ss        = getSessionState();
  const rd        = state._reportData || {};
  const sess      = state.joinTarget || {};
  const questions = selectRankedQuestions(ss);

  // Stats
  const totalQ     = ss.stats.questionsCount    || questions.length || rd.questions    || 24;
  const totalUp    = ss.stats.upvotesCount      || rd.upvotes       || 156;
  const totalP     = ss.stats.participantsCount || rd.participants  || 47;
  const totalAns   = questions.filter(q => q.status === "Answered").length || rd.answers || 19;
  const sessionSec = ss.sessionTimer            || rd.durationSecs  || 3600;
  const sessionMin = Math.round(sessionSec / 60);
  const sessionH   = Math.floor(sessionMin / 60);
  const sessionRM  = sessionMin % 60;
  const duration   = `${sessionH}h ${String(sessionRM).padStart(2, "0")}m`;

  const trendData   = buildTrendData(ss);
  const peakEngage  = Math.max(...trendData);
  const avgEngage   = Math.round(trendData.reduce((a, b) => a + b, 0) / trendData.length);
  const engageScore = Math.min(100, Math.round(avgEngage * 1.35));
  const engageGrade = engageScore >= 80 ? "Excellent" : engageScore >= 60 ? "Great" : engageScore >= 40 ? "Moderate" : "Fair";

  const sessionTitle = sess.title || rd.title || "Session Report";
  const meetingId    = state.session?.sessionId || sess.id || "";
  const shortId      = (meetingId || "").slice(-6).toUpperCase() || "8F3K2L";

  const topQ = [...questions].sort((a, b) => (b.votes || 0) - (a.votes || 0))[0];

  const now       = new Date();
  const startDate = new Date(now.getTime() - sessionSec * 1000);
  const fmtTime   = d => { const h = d.getHours(), m = String(d.getMinutes()).padStart(2,"0"); return `${h % 12 || 12}:${m} ${h >= 12 ? "PM" : "AM"}`; };
  const fmtDate   = d => d.toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" });

  const aiSummary = rd.aiSummary
    || `The session focused on ${sessionTitle.replace(/\s*session\s*/i, "").trim()}, resource allocation, and timeline alignment. High engagement was observed during key discussion rounds and Q&A.`;

  const donutItems = [
    { color: "#6366f1", label: "Active Participants",  pct: 68 },
    { color: "#10b981", label: "Passive Participants", pct: 22 },
    { color: "#f59e0b", label: "Drop-off",             pct: 8  },
    { color: "#3b82f6", label: "Others",               pct: 2  },
  ];

  // ── Report HTML ─────────────────────────────────────────────
  const reportHtml = `
    <div class="rpt-wrap">

      <!-- Page header -->
      <div class="rpt-page-header">
        <div class="rpt-page-header-left">
          <div>
            <div class="rpt-title-row">
              <h1 class="rpt-page-title">${sessionTitle}</h1>
              <span class="rpt-type-badge">Instant Meeting</span>
            </div>
            <div class="rpt-meta-row">
              <span class="rpt-status-chip">${icons.check} Completed</span>
              <span class="rpt-meta-item">${icons.calendar} ${fmtDate(startDate)}</span>
              <span class="rpt-meta-item">${icons.clock} ${fmtTime(startDate)} – ${fmtTime(now)} (IST)</span>
              <span class="rpt-meta-item">${icons.users} Meeting ID: ${shortId}</span>
            </div>
          </div>
        </div>
        <div class="rpt-page-header-actions">
          <button class="rpt-outline-btn" id="rptShareBtn">${icons.share} Share Report</button>
          <button class="rpt-primary-btn" id="rptExportBtn">${icons.download} Export Report</button>
        </div>
      </div>

      <!-- Tab bar -->
      <nav class="rpt-tabs">
        <button class="rpt-tab rpt-tab-active" onclick="rptTab('overview',this)">Overview</button>
        <button class="rpt-tab" onclick="rptTab('questions',this)">Questions</button>
        <button class="rpt-tab" onclick="rptTab('participants',this)">Participants</button>
        <button class="rpt-tab" onclick="rptTab('insights',this)">Insights</button>
        <button class="rpt-tab" onclick="rptTab('ai',this)">AI Summary</button>
      </nav>

      <!-- Body grid -->
      <div class="rpt-body-grid">

        <!-- ── Left column ── -->
        <div class="rpt-left-col">

          <!-- Overview stat cards -->
          <div class="rpt-card" id="rptPane-overview">
            <h2 class="rpt-card-title">Session Overview</h2>
            <div class="rpt-stat-grid">
              ${[
                { icon: icons.helpCircle, bg: "#eef2ff", color: "#6366f1", val: totalQ,   label: "Questions Asked",  delta: "↑ 18% vs last session" },
                { icon: icons.arrowUp,    bg: "#ecfdf5", color: "#10b981", val: totalUp,  label: "Upvotes Received", delta: "↑ 27% vs last session" },
                { icon: icons.checkCircle,bg: "#eff6ff", color: "#3b82f6", val: totalAns, label: "Answers Given",    delta: "↑ 12% vs last session" },
                { icon: icons.users,      bg: "#fff7ed", color: "#f59e0b", val: totalP,   label: "Participants",     delta: "↑ 8% vs last session"  },
              ].map(c => `
                <div class="rpt-stat-card">
                  <div class="rpt-stat-icon" style="background:${c.bg};color:${c.color}">${c.icon}</div>
                  <div class="rpt-stat-body">
                    <span class="rpt-stat-val">${c.val}</span>
                    <span class="rpt-stat-lbl">${c.label}</span>
                    <span class="rpt-stat-delta">${c.delta}</span>
                  </div>
                </div>
              `).join("")}
            </div>
          </div>

          <!-- Questions pane (hidden) -->
          <div class="rpt-card" id="rptPane-questions" style="display:none">
            <h2 class="rpt-card-title">Top Questions</h2>
            ${questions.length === 0 ? `<p style="color:var(--muted);font-size:13px">No questions were submitted in this session.</p>` :
              questions.slice(0, 10).map((q, i) => `
                <div class="rpt-q-row">
                  <span class="rpt-q-rank">#${i + 1}</span>
                  <div class="rpt-q-body">
                    <p class="rpt-q-text">${q.text}</p>
                    <div class="rpt-q-meta">
                      ${icons.thumbsUp} ${q.votes || 0} upvotes
                      &nbsp;·&nbsp; ${icons.checkCircle} ${q.status || "Pending"}
                    </div>
                  </div>
                </div>
              `).join("")
            }
          </div>

          <!-- Participants pane (hidden) -->
          <div class="rpt-card" id="rptPane-participants" style="display:none">
            <h2 class="rpt-card-title">Participants</h2>
            <div class="rpt-donut-wrap">${drawDonut()}
              <div class="rpt-legend">
                ${donutItems.map(s => `
                  <div class="rpt-legend-item">
                    <span class="rpt-legend-dot" style="background:${s.color}"></span>
                    <span class="rpt-legend-label">${s.label}</span>
                    <span class="rpt-legend-pct">${s.pct}%</span>
                  </div>`).join("")}
              </div>
            </div>
          </div>

          <!-- Insights pane (hidden) -->
          <div class="rpt-card" id="rptPane-insights" style="display:none">
            <h2 class="rpt-card-title">Session Insights</h2>
            <div class="rpt-highlights">
              <div class="rpt-hi-item"><span style="color:#f59e0b">${icons.clock}</span> Most active time: 10:40 AM – 11:10 AM</div>
              <div class="rpt-hi-item"><span style="color:#6366f1">${icons.thumbsUp}</span> Highest upvoted question received ${topQ?.votes || 18} upvotes</div>
              <div class="rpt-hi-item"><span style="color:#10b981">${icons.users}</span> ${totalP} participants joined the session</div>
              <div class="rpt-hi-item"><span style="color:#3b82f6">${icons.share}</span> ${totalAns} answers shared by participants</div>
              <div class="rpt-hi-item"><span style="color:#8b5cf6">${icons.zap}</span> Peak engagement reached ${peakEngage}% at 11:05 AM</div>
              <div class="rpt-hi-item"><span style="color:#ef4444">${icons.barChart}</span> Average engagement score: ${avgEngage}% (${engageGrade})</div>
            </div>
          </div>

          <!-- AI Summary pane (hidden) -->
          <div class="rpt-card" id="rptPane-ai" style="display:none">
            <h2 class="rpt-card-title">${icons.zap} AI Summary</h2>
            <p style="font-size:14px;color:var(--ink-secondary);line-height:1.7;margin-top:8px">${aiSummary}</p>
            <div style="margin-top:16px;padding:14px;background:#f8f6ff;border-radius:10px;border:1px solid #e0daff">
              <p style="font-size:12px;color:#5b34ff;font-weight:600;margin-bottom:6px">${icons.star} Key Themes</p>
              <ul style="font-size:13px;color:var(--ink-secondary);line-height:1.8;padding-left:16px;margin:0">
                <li>Resource allocation priorities</li>
                <li>Timeline alignment discussions</li>
                <li>Risk assessment and mitigation</li>
                <li>Participant engagement trends</li>
              </ul>
            </div>
          </div>

          <!-- Engagement Trend Chart (always visible in overview) -->
          <div class="rpt-card rpt-chart-card" id="rptChartSection">
            <div class="rpt-chart-hdr">
              <div style="display:flex;align-items:center;gap:8px">
                <h2 class="rpt-card-title" style="margin:0">Engagement Trend</h2>
                <span style="color:#9ca3af">${icons.info}</span>
              </div>
              <select class="rpt-chart-sel" onchange="rptFilterChart(this.value)">
                <option value="during">During Meeting</option>
                <option value="before">Before Meeting</option>
                <option value="after">After Meeting</option>
              </select>
            </div>
            <div id="rptChartWrap">${drawLineChart(trendData, sessionMin)}</div>
            <div class="rpt-sub-stats">
              <div class="rpt-sub-stat">
                <span class="rpt-sub-label">Peak Engagement</span>
                <span class="rpt-sub-val">${peakEngage}</span>
                <span class="rpt-sub-note">at 11:05 AM</span>
              </div>
              <div class="rpt-sub-stat">
                <span class="rpt-sub-label">Avg. Engagement</span>
                <span class="rpt-sub-val">${avgEngage}</span>
                <span class="rpt-sub-note">Moderate</span>
              </div>
              <div class="rpt-sub-stat">
                <span class="rpt-sub-label">Total Duration</span>
                <span class="rpt-sub-val">${duration}</span>
                <span class="rpt-sub-note">${sessionMin} minutes</span>
              </div>
              <div class="rpt-sub-stat">
                <span class="rpt-sub-label">Engagement Score</span>
                <span class="rpt-sub-val">${engageScore} <sup style="font-size:12px;font-weight:500">/100</sup></span>
                <span class="rpt-sub-note">${engageGrade}</span>
              </div>
            </div>
          </div>

          <!-- What's Next -->
          <div class="rpt-card rpt-next-card">
            <div class="rpt-next-icon">${icons.send}</div>
            <div class="rpt-next-body">
              <h3>What's Next?</h3>
              <p>Keep the conversation going. Review questions, export insights, or start a new session.</p>
            </div>
            <div class="rpt-next-actions">
              <button class="rpt-outline-btn" onclick="go('/conducted')">View Questions</button>
              <button class="rpt-primary-btn" onclick="go('/meetings/create')">${icons.plus} Start New Meeting</button>
            </div>
          </div>

        </div>

        <!-- ── Right column ── -->
        <div class="rpt-right-col">

          <!-- AI Summary Card -->
          <div class="rpt-card rpt-ai-card">
            <div class="rpt-ai-hdr">
              <div class="rpt-ai-icon-wrap">${icons.zap}</div>
              <div>
                <p class="rpt-ai-title">AI Summary</p>
                <p class="rpt-ai-sub">Generated insights from your session</p>
              </div>
            </div>
            <p class="rpt-ai-text">${aiSummary}</p>
            <button class="rpt-ai-view-btn" onclick="rptTab('ai', document.querySelectorAll('.rpt-tab')[4])">
              ${icons.eye} View Full Summary
            </button>
          </div>

          <!-- Engagement Breakdown -->
          <div class="rpt-card">
            <h2 class="rpt-card-title">Engagement Breakdown</h2>
            <div class="rpt-donut-wrap">
              ${drawDonut()}
              <div class="rpt-legend">
                ${donutItems.map(s => `
                  <div class="rpt-legend-item">
                    <span class="rpt-legend-dot" style="background:${s.color}"></span>
                    <span class="rpt-legend-label">${s.label}</span>
                    <span class="rpt-legend-pct">${s.pct}%</span>
                  </div>`).join("")}
              </div>
            </div>
          </div>

          <!-- Session Highlights -->
          <div class="rpt-card">
            <h2 class="rpt-card-title">Session Highlights</h2>
            <div class="rpt-highlights">
              <div class="rpt-hi-item"><span style="color:#f59e0b">${icons.clock}</span> Most active: 10:40 AM – 11:10 AM</div>
              <div class="rpt-hi-item"><span style="color:#6366f1">${icons.thumbsUp}</span> Top question got ${topQ?.votes || 18} upvotes</div>
              <div class="rpt-hi-item"><span style="color:#10b981">${icons.users}</span> ${totalP} participants joined</div>
              <div class="rpt-hi-item"><span style="color:#3b82f6">${icons.share}</span> ${totalAns} answers shared</div>
            </div>
          </div>

        </div>
      </div>
    </div>
  `;

  // Use shell() so the left sidebar is included
  shell(
    "", // no mobile phone frame needed
    "", // no legacy right panel
    reportHtml,
    "" // no separate right desktop column — we handle it inside reportHtml
  );

  // ── Register handlers ──────────────────────────────────────
  document.getElementById("rptShareBtn")?.addEventListener("click", () => {
    navigator.clipboard?.writeText(location.href).catch(() => {});
    _rptToast("Report link copied!");
  });

  document.getElementById("rptExportBtn")?.addEventListener("click", () => {
    const data = {
      title: sessionTitle, generatedAt: new Date().toISOString(),
      stats: { questions: totalQ, upvotes: totalUp, answers: totalAns, participants: totalP },
      questions: selectRankedQuestions(getSessionState()),
      aiSummary,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob),
      download: `session-report-${Date.now()}.json`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  });

  window.rptTab = (tab, btn) => {
    // Switch active tab highlight
    document.querySelectorAll(".rpt-tab").forEach(t => t.classList.remove("rpt-tab-active"));
    btn?.classList.add("rpt-tab-active");

    // Show/hide panes (overview card + chart are always shown)
    const allPanes = ["overview", "questions", "participants", "insights", "ai"];
    allPanes.forEach(id => {
      const el = document.getElementById(`rptPane-${id}`);
      if (el) el.style.display = id === tab ? "block" : "none";
    });
    // Chart section always visible
    const chart = document.getElementById("rptChartSection");
    if (chart) chart.style.display = "block";
  };

  window.rptFilterChart = (val) => {
    const wrap = document.getElementById("rptChartWrap");
    if (!wrap) return;
    const fake = buildTrendData(getSessionState()).map(v =>
      val === "before" ? Math.max(5, Math.round(v * 0.35)) :
      val === "after"  ? Math.max(5, Math.round(v * 0.55)) : v
    );
    wrap.innerHTML = drawLineChart(fake, sessionMin);
  };
}

function _rptToast(msg) {
  const t = Object.assign(document.createElement("div"), { className: "rpt-toast", textContent: msg });
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add("rpt-toast-show"));
  setTimeout(() => { t.classList.remove("rpt-toast-show"); setTimeout(() => t.remove(), 300); }, 2500);
}
