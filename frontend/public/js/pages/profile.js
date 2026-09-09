/* ============================================================
   Profile Page — Desktop Rich Layout + Mobile Phone Frame
   ============================================================ */
import { icons } from "../utils/icons.js";
import { state } from "../state.js";
import { go } from "../utils/api.js";
import { shell, phone, desktopTopbar } from "../components/shared.js";

/* ── Logout: registered at module scope so it's available on ALL pages
   (Settings, Profile, etc.) that call profileLogout() ── */
window.profileLogout = function profileLogout() {
  // Tell the server to revoke the refresh token so it can't be replayed
  const refreshToken = state.refreshToken ||
    (() => { try { return localStorage.getItem("cv_refresh_token"); } catch { return null; } })();
  const accessToken = state.token ||
    (() => { try { return localStorage.getItem("cv_token"); } catch { return null; } })();

  // Fire-and-forget — never let a network error block logout
  fetch("/api/auth/logout", {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${accessToken || ""}`
    },
    body: JSON.stringify({ refreshToken })
  }).catch(() => {});

  // Clear local state immediately (don't wait for server response)
  state.token        = null;
  state.refreshToken = null;
  state.profile      = null;
  state.isHost       = false;
  try { localStorage.removeItem("cv_token"); } catch {}
  try { localStorage.removeItem("cv_refresh_token"); } catch {}
  go("/welcome");
};

/* ── Engagement Chart (Canvas) ────────────────────────────── */
function engagementChart(points) {
  const labels = ["May 25","May 28","May 31","Jun 03","Jun 06","Jun 09"];
  const id = "engChart";
  // Serialise data for inline script
  const pts  = JSON.stringify(points);
  const lbls = JSON.stringify(labels);
  return `
    <canvas id="${id}" class="prof-engagement-canvas" aria-label="Engagement trend"></canvas>
    <script>
    (function(){
      function draw(){
        const canvas = document.getElementById('${id}');
        if(!canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const W = canvas.offsetWidth;
        const H = 170;
        canvas.width  = W * dpr;
        canvas.height = H * dpr;
        canvas.style.height = H + 'px';
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        const pts   = ${pts};
        const lbls  = ${lbls};
        const pL=40, pR=12, pT=14, pB=28;
        const cW = W - pL - pR, cH = H - pT - pB;
        const yMax = 40;
        const yS = v => pT + cH - (v/yMax)*cH;
        const xS = i => pL + (i/(pts.length-1))*cW;

        // Grid + Y labels
        ctx.font = '11px Inter,sans-serif';
        ctx.fillStyle = '#9ea5c0';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        [0,10,20,30,40].forEach(v => {
          const y = yS(v);
          ctx.strokeStyle = '#eeeef6';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(pL, y); ctx.lineTo(W-pR, y); ctx.stroke();
          ctx.fillText(v, pL-6, y);
        });

        // Gradient fill
        const grad = ctx.createLinearGradient(0, pT, 0, pT+cH);
        grad.addColorStop(0, 'rgba(91,52,255,.13)');
        grad.addColorStop(1, 'rgba(91,52,255,0)');
        ctx.beginPath();
        ctx.moveTo(xS(0), yS(pts[0]));
        pts.forEach((p,i) => { if(i>0) ctx.lineTo(xS(i), yS(p)); });
        ctx.lineTo(xS(pts.length-1), pT+cH);
        ctx.lineTo(xS(0), pT+cH);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        // Line
        ctx.beginPath();
        ctx.moveTo(xS(0), yS(pts[0]));
        pts.forEach((p,i) => { if(i>0) ctx.lineTo(xS(i), yS(p)); });
        ctx.strokeStyle = '#5b34ff';
        ctx.lineWidth = 2.2;
        ctx.lineJoin = 'round';
        ctx.stroke();

        // Dots
        pts.forEach((p,i) => {
          ctx.beginPath();
          ctx.arc(xS(i), yS(p), 3.5, 0, Math.PI*2);
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.strokeStyle = '#5b34ff';
          ctx.lineWidth = 2;
          ctx.stroke();
        });

        // X labels
        const step = (pts.length-1)/(lbls.length-1);
        ctx.font = '11px Inter,sans-serif';
        ctx.fillStyle = '#9ea5c0';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        lbls.forEach((lbl,i) => {
          ctx.fillText(lbl, xS(Math.round(i*step)), pT+cH+6);
        });
      }
      // Draw after layout; also redraw on resize
      requestAnimationFrame(function tryDraw(){
        const c = document.getElementById('${id}');
        if(c && c.offsetWidth > 0){ draw(); }
        else { requestAnimationFrame(tryDraw); }
      });
      window.addEventListener('resize', draw, { passive:true });
    })();
    <\/script>
  `;
}

export function renderProfile() {
  const user = state.profile?.user || {};
  const name = user.name || "Guest";
  const email = user.email || "";
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "G";
  const joined = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : "—";
  const role = user.role || "Member";
  const stats = user.stats || {};

  /* ---- Mobile (phone frame) -------------------------------- */
  const mobileContent = phone(`
    <div style="text-align:center;padding:8px 0 20px">
      <div class="avatar" style="margin:0 auto 12px;font-size:28px">${initials}</div>
      <h1 class="screen-title">${name}</h1>
      <span class="badge" style="margin:6px 0">${role}</span>
      <p class="subtle" style="margin-top:8px">${icons.mail} ${email}</p>
      <p class="subtle">${icons.calendar} Joined ${joined}</p>
      <button class="edit-profile-btn" style="margin-top:10px" onclick="go('/settings')">${icons.edit} Edit Profile</button>
    </div>

    <div class="wide-cards" style="grid-template-columns:repeat(2,1fr);margin:8px 0 20px;gap:10px">
      ${[
        [icons.messageCircle, "Questions Asked", stats.questionsAsked ?? 0],
        [icons.thumbsUp,      "Upvotes Received", stats.upvotesReceived ?? 0],
        [icons.checkCircle,   "Answers Given", stats.answersGiven ?? 0],
        [icons.calendar,      "Meetings Joined", stats.meetingsJoined ?? 0]
      ].map(([ic, label, value]) => `
        <div class="stat-card" style="text-align:center;padding:14px 8px">
          <strong style="font-size:22px;color:var(--ink)">${value}</strong>
          <span class="subtle" style="font-size:11px;display:block;margin-top:4px">${label}</span>
        </div>
      `).join("")}
    </div>

    <h2 class="screen-title" style="margin-bottom:12px;font-size:16px">Account</h2>
    <div class="stack" style="gap:8px">
      ${[
        [icons.user,       "Personal Information",     "Update your personal details"],
        [icons.bell,       "Notification Preferences", "Manage your notifications"],
        [icons.shield,     "Privacy & Security",       "Manage your privacy and security"],
        [icons.helpCircle, "Help & Support",           "Get help and contact support"],
        [icons.info,       "About CollectiveVoice",    "Version 1.4.0"]
      ].map(([ic, title, desc]) => `
        <button class="list-card row" style="gap:14px" onclick="go('/settings')">
          <div class="icon-box" style="width:36px;height:36px">${ic}</div>
          <span style="flex:1;text-align:left"><strong style="font-size:14px">${title}</strong><br><span class="subtle">${desc}</span></span>
          ${icons.chevronRight}
        </button>
      `).join("")}
      <button class="list-card row" style="gap:14px;color:var(--danger)" onclick="profileLogout()">
        <div class="icon-box red" style="width:36px;height:36px">${icons.logOut}</div>
        <span style="flex:1;text-align:left"><strong style="font-size:14px">Log Out</strong></span>
        ${icons.chevronRight}
      </button>
    </div>
  `, "profile");

  /* ---- Desktop Main Column --------------------------------- */
  const chartPoints = [8, 14, 10, 18, 24, 16, 20, 28, 22, 30, 26, 36, 28, 34];

  const desktopMain = `
    ${desktopTopbar("My Profile", "Manage your account, track your impact and achievements.")}

    <!-- Profile Header Card -->
    <div class="prof-header-card">
      <div class="prof-header-bg"></div>
      <div class="prof-header-body">
        <div class="prof-avatar-wrap">
          <div class="prof-avatar">${initials}</div>
        </div>
        <div class="prof-header-info">
          <div class="prof-name-row">
            <h1 class="prof-name">${name}</h1>
            <span class="badge">${role}</span>
          </div>
          <p class="prof-meta-item">${icons.mail} ${email}</p>
          <p class="prof-meta-item">${icons.calendar} Joined ${joined}</p>
        </div>
        <button class="edit-profile-btn" onclick="go('/settings')">${icons.edit} Edit Profile</button>
      </div>
    </div>

    <!-- Stats Row -->
    <div class="prof-stats-row">
      ${[
        [icons.messageCircle, "Questions Asked",  stats.questionsAsked  ?? 0, "↑ 12% this month", "up"],
        [icons.thumbsUp,      "Upvotes Received", stats.upvotesReceived ?? 0, "↑ 19% this month", "up"],
        [icons.checkCircle,   "Answers Given",    stats.answersGiven    ?? 0, "↑ 7% this month",  "up"],
        [icons.calendar,      "Meetings Joined",  stats.meetingsJoined  ?? 0, "↑ 14% this month", "up"]
      ].map(([ic, label, value, delta, dir]) => `
        <div class="prof-stat-card">
          <div class="prof-stat-icon-wrap">${ic}</div>
          <strong class="prof-stat-value">${value}</strong>
          <span class="prof-stat-label">${label}</span>
          <span class="prof-stat-delta ${dir}">${delta}</span>
        </div>
      `).join("")}
    </div>

    <!-- Tabs -->
    <div class="prof-tabs">
      <button class="prof-tab active" onclick="profileTab(this,'overview')">Overview</button>
      <button class="prof-tab" onclick="profileTab(this,'achievements')">Achievements</button>
      <button class="prof-tab" onclick="profileTab(this,'badges')">Badges</button>
      <button class="prof-tab" onclick="profileTab(this,'preferences')">Preferences</button>
    </div>

    <!-- Tab Panels -->
    <div id="prof-panel-overview" class="prof-tab-panel">
      <!-- Engagement Chart -->
      <div class="prof-card" style="margin-bottom:16px">
        <div class="prof-card-header">
          <span class="prof-card-title">Engagement Overview</span>
          <button class="activity-period-btn">This Month ${icons.chevronDown}</button>
        </div>
        <div class="prof-chart-wrap">
          ${engagementChart(chartPoints)}
        </div>
        <div class="prof-metrics-row">
          <div class="prof-metric">
            <strong>4.2</strong>
            <span>Avg. Questions per Question</span>
          </div>
          <div class="prof-metric highlight">
            <strong>86%</strong>
            <span>Questions Upvoted</span>
          </div>
          <div class="prof-metric">
            <strong>2h 35m</strong>
            <span>Time Spent in Sessions</span>
          </div>
          <div class="prof-metric highlight">
            <strong>92%</strong>
            <span>Participation Rate</span>
          </div>
        </div>
      </div>

      <!-- Top Categories -->
      <div class="prof-card">
        <div class="prof-card-header">
          <span class="prof-card-title">Top Categories</span>
          <button class="link-btn">View all</button>
        </div>
        <div class="prof-categories-wrap">
          <div class="prof-donut-mini">
            <svg viewBox="0 0 100 100" style="width:100px;height:100px">
              <circle cx="50" cy="50" r="38" fill="none" stroke="#e8e8f4" stroke-width="14"/>
              <circle cx="50" cy="50" r="38" fill="none" stroke="#5b34ff" stroke-width="14"
                stroke-dasharray="107 131" stroke-dashoffset="-33" transform="rotate(-90 50 50)" stroke-linecap="round"/>
              <circle cx="50" cy="50" r="38" fill="none" stroke="#24b86f" stroke-width="14"
                stroke-dasharray="62 131" stroke-dashoffset="-140" transform="rotate(-90 50 50)" stroke-linecap="round"/>
              <circle cx="50" cy="50" r="38" fill="none" stroke="#ff8a2a" stroke-width="14"
                stroke-dasharray="31 131" stroke-dashoffset="-202" transform="rotate(-90 50 50)" stroke-linecap="round"/>
              <circle cx="50" cy="50" r="38" fill="none" stroke="#286dff" stroke-width="14"
                stroke-dasharray="15 131" stroke-dashoffset="-233" transform="rotate(-90 50 50)" stroke-linecap="round"/>
              <text x="50" y="46" text-anchor="middle" font-size="16" font-weight="800" fill="#111936">35</text>
              <text x="50" y="58" text-anchor="middle" font-size="7" fill="#68708d">Total Questions</text>
            </svg>
          </div>
          <div class="prof-categories-list">
            ${[
              ["AI in Education",   45, "#5b34ff"],
              ["Remote Learning",   30, "#24b86f"],
              ["Data Privacy",      15, "#ff8a2a"],
              ["EdTech Innovations",10, "#286dff"]
            ].map(([label, pct, color]) => `
              <div class="prof-cat-item">
                <span class="prof-cat-dot" style="background:${color}"></span>
                <span class="prof-cat-label">${label}</span>
                <div class="prof-cat-bar-wrap">
                  <div class="prof-cat-bar" style="width:${pct}%;background:${color}"></div>
                </div>
                <span class="prof-cat-pct">${pct}%</span>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    </div>

    <div id="prof-panel-achievements" class="prof-tab-panel" style="display:none">
      <div class="prof-card">
        <p class="subtle" style="padding:12px 0">No additional achievements to display.</p>
      </div>
    </div>
    <div id="prof-panel-badges" class="prof-tab-panel" style="display:none">
      <div class="prof-card">
        <p class="subtle" style="padding:12px 0">All badges shown in the right panel.</p>
      </div>
    </div>
    <div id="prof-panel-preferences" class="prof-tab-panel" style="display:none">
      <div class="prof-card">
        <p class="subtle" style="padding:12px 0">Manage preferences in <button class="link-btn" onclick="go('/settings')">Settings</button>.</p>
      </div>
    </div>

    <!-- Recent Questions -->
    <div class="prof-card" style="margin-top:16px">
      <div class="prof-card-header">
        <span class="prof-card-title">Recent Questions</span>
        <button class="link-btn">View all</button>
      </div>
      <div class="prof-questions-list">
        <div style="text-align:center;padding:24px 16px;color:var(--muted)">
          <div style="font-size:32px;margin-bottom:10px">💬</div>
          <p style="font-size:13px;font-weight:600;color:var(--ink);margin:0 0 6px">No questions yet</p>
          <p style="font-size:12px;margin:0 0 14px">Join a meeting and ask your first question to see it here.</p>
          <button class="btn secondary small" onclick="go('/meetings')">${icons.calendar} Find a Meeting</button>
        </div>
      </div>
    </div>
  `;

  /* ---- Desktop Right Column -------------------------------- */
  const desktopRight = `
    <!-- Achievements -->
    <div class="prof-card prof-card-right" style="margin-bottom:16px">
      <div class="prof-card-header">
        <span class="prof-card-title">Achievements</span>
        <button class="link-btn">View all</button>
      </div>
      <div class="prof-achievement-feature">
        <div class="prof-achievement-icon">
          <svg viewBox="0 0 60 60" width="60" height="60">
            <polygon points="30,4 38,20 56,22 43,35 46,53 30,45 14,53 17,35 4,22 22,20" fill="#5b34ff" opacity=".15"/>
            <polygon points="30,8 37,21 52,23 42,33 44,49 30,42 16,49 18,33 8,23 23,21" fill="none" stroke="#5b34ff" stroke-width="2"/>
            <text x="30" y="36" text-anchor="middle" font-size="18">⭐</text>
          </svg>
          <span class="prof-achievement-sparkle" style="top:-4px;right:-4px">✦</span>
          <span class="prof-achievement-sparkle" style="bottom:0;left:-6px;font-size:10px">✦</span>
        </div>
        <strong class="prof-achievement-name">Rising Contributor</strong>
        <p class="subtle" style="font-size:12px;text-align:center;margin:4px 0">
          Asked 10 questions and received 50+ upvotes
        </p>
        <div class="prof-achievement-progress">
          <div class="prof-achievement-bar" style="width:72%"></div>
        </div>
        <span class="subtle" style="font-size:11px">Earned on May 30, 2025</span>
      </div>
    </div>

    <!-- Badges -->
    <div class="prof-card prof-card-right" style="margin-bottom:16px">
      <div class="prof-card-header">
        <span class="prof-card-title">Badges</span>
        <button class="link-btn">View all</button>
      </div>
      <div class="prof-badges-grid">
        ${[
          { icon: "💬", label: "First Question", color: "#eff5ff", border: "#286dff" },
          { icon: "👍", label: "Top Voted",       color: "#fff3e9", border: "#ff8a2a" },
          { icon: "🤝", label: "Active Participant", color: "#edf9f3", border: "#24b86f" },
          { icon: "💡", label: "Thought Provoker", color: "#f6f4ff", border: "#5b34ff" },
          { icon: "🐦", label: "Early Bird",       color: "#fffbeb", border: "#f59e0b" },
          { icon: "🏆", label: "Expert",           color: "#f3f4f6", border: "#9ca3af", locked: true }
        ].map(b => `
          <div class="prof-badge-item ${b.locked ? "locked" : ""}" style="background:${b.color};border:1.5px solid ${b.border}20">
            <span style="font-size:22px;line-height:1">${b.icon}</span>
            <span class="prof-badge-label">${b.label}</span>
            ${b.locked ? `<span class="prof-badge-lock">🔒</span>` : ""}
          </div>
        `).join("")}
      </div>
    </div>

    <!-- Account Summary -->
    <div class="prof-card prof-card-right">
      <div class="prof-card-header" style="margin-bottom:14px">
        <span class="prof-card-title">Account Summary</span>
      </div>
      <div class="prof-summary-list">
        ${[
          ["Account Type",      user.role || "Audience"],
          ["Member Since",      user.joined || "May 18, 2025"],
          ["Meetings Joined",   stats.meetingsJoined || 8],
          ["Total Upvotes",     stats.upvotesReceived || 128],
          ["Notifications",     "Enabled"],
          ["Profile Visibility","Public"]
        ].map(([k, v]) => `
          <div class="prof-summary-row">
            <span class="prof-summary-key">${k}</span>
            <span class="prof-summary-val ${k === "Notifications" ? "green-text" : ""}">${v}</span>
          </div>
        `).join("")}
      </div>
      <button class="btn secondary" style="width:100%;margin-top:16px;gap:8px;font-size:13px">
        ${icons.download} Download My Data
      </button>
    </div>
  `;

  shell(mobileContent, "", desktopMain, desktopRight);

  /* Tab switching */
  window.profileTab = function(btn, id) {
    document.querySelectorAll(".prof-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".prof-tab-panel").forEach(p => p.style.display = "none");
    btn.classList.add("active");
    const panel = document.getElementById("prof-panel-" + id);
    if (panel) panel.style.display = "";
  };

  // profileLogout is registered at module scope (top of this file) — nothing to do here
}
