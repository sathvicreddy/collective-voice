/* ============================================================
   Shared UI Components — Layout, Navigation, Cards, Charts
   ============================================================ */
import { icons } from "../utils/icons.js";
import { state } from "../state.js";
import { go } from "../utils/api.js";

const app = document.querySelector("#app");

/* --- Brand ------------------------------------------------- */
export function brand() {
  return `
    <div class="brand">
      <div class="brand-mark">${icons.mic}</div>
      <span>Collective<span>Voice</span></span>
    </div>
  `;
}

/* --- Status Bar -------------------------------------------- */
export function statusBar() {
  return `
    <div class="status">
      <span>9:41</span>
      <span class="status-icons">${icons.signal} ${icons.wifi} ${icons.battery}</span>
    </div>
  `;
}

/* --- Top Bar (mobile) --------------------------------------- */
export function topbar(showBack = false) {
  const user = state.profile?.user || {};
  const userName = user.name || "";
  const avatarLetter = userName ? userName[0].toUpperCase() : "A";
  const notifCount = (state.notifications || []).filter(n => n.read === false).length;
  return `
    ${statusBar()}
    <div class="topbar">
      ${showBack
        ? `<button class="icon-btn ghost-icon" onclick="history.back()" aria-label="Go back">${icons.arrowLeft}</button>`
        : brand()}
      <div class="topbar-actions">
        <button class="icon-btn ghost-icon" style="position:relative" onclick="go('/notifications')" aria-label="Notifications">
          ${icons.bell}
          ${notifCount > 0 ? `<span style="position:absolute;top:-4px;right:-4px;background:#e54040;color:#fff;font-size:10px;font-weight:700;border-radius:50%;width:16px;height:16px;display:flex;align-items:center;justify-content:center;line-height:1">${notifCount > 9 ? "9+" : notifCount}</span>` : ""}
        </button>
        <button class="icon-btn" onclick="go('/profile')" aria-label="Profile">${avatarLetter}</button>
      </div>
    </div>
  `;
}

/* --- Desktop Top Bar --------------------------------------- */
export function desktopTopbar(title = "", subtitle = "", dateRange = "") {
  const user     = state.profile?.user || {};
  const name     = user.name || "Guest";
  const role     = user.role || "Member";
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const notifCount = (state.notifications || []).filter(n => n.read === false).length;
  return `
    <div class="desktop-topbar">
      <div>
        <h1 class="desktop-page-title">${title}</h1>
        ${subtitle ? `<p class="desktop-page-sub">${subtitle}</p>` : ""}
      </div>
      <div class="desktop-topbar-right">
        ${dateRange ? `
          <button class="desktop-date-btn">
            ${icons.calendar} ${dateRange} ${icons.chevronDown}
          </button>
        ` : ""}
        <div class="desktop-notif-btn" onclick="go('/notifications')" style="position:relative">
          ${icons.bell}
          ${notifCount > 0 ? `<span class="desktop-notif-badge">${notifCount > 9 ? "9+" : notifCount}</span>` : ""}
        </div>
        <div class="desktop-user-pill" onclick="go('/profile')">
          <div class="desktop-avatar">${initials}</div>
          <div class="desktop-user-info">
            <span class="desktop-user-name">${name}</span>
            <span class="desktop-user-role">${role}</span>
          </div>
          ${icons.chevronDown}
        </div>
      </div>
    </div>
  `;
}


/* --- Bottom Navigation ------------------------------------- */
export function bottomNav(active) {
  const items = [
    ["/home",     "Home",     icons.home],
    ["/meetings", "Meetings", icons.calendar],
    ["/activity", "Activity", icons.activity],
    ["/profile",  "Profile",  icons.user]
  ];
  return `
    <nav class="bottom-nav" aria-label="Main navigation">
      ${items.map(([route, label, icon]) => `
        <button class="${active === label.toLowerCase() ? "active" : ""}" onclick="go('${route}')">
          ${icon}<span>${label}</span>
        </button>
      `).join("")}
    </nav>
  `;
}

/* --- Phone Frame ------------------------------------------- */
export function phone(content, active = "home", showBack = false) {
  return `
    <section class="phone">
      <main class="phone-main">
        ${topbar(showBack)}
        ${content}
      </main>
      ${active ? bottomNav(active) : ""}
    </section>
  `;
}

/* --- Sidebar ----------------------------------------------- */
export function sidebar() {
  const topNav = [
    ["/home",     "Home",         icons.home],
    ["/meetings", "Meetings",     icons.calendar],
    ["/profile",  "Profile",      icons.user]
  ];
  const bottomNavItems = [
    ["/help",  "Help & Support", icons.info],
    ["/settings", "Settings",       icons.settings]
  ];

  return `
    <aside class="sidebar">
      ${brand()}
      <div class="side-nav" style="flex:1">
        ${topNav.map(([route, label, icon]) => `
          <button class="nav-btn ${state.route === route ? "active" : ""}" onclick="go('${route}')">
            ${icon}<span>${label}</span>
          </button>
        `).join("")}
        <div class="divider" style="margin: 12px 0;"></div>
        ${bottomNavItems.map(([route, label, icon]) => `
          <button class="nav-btn ${state.route === route ? "active" : ""}" onclick="go('${route}')">
            ${icon}<span>${label}</span>
          </button>
        `).join("")}
      </div>
      
      <div class="promo-card">
        <div class="promo-img">
          <svg viewBox="0 0 100 80" fill="none" style="width:100%;height:auto">
            <rect x="10" y="20" width="30" height="40" rx="4" fill="#e2dcfc"/>
            <rect x="60" y="10" width="30" height="50" rx="4" fill="#a493ff"/>
            <circle cx="25" cy="40" r="8" fill="#5b34ff"/>
            <circle cx="75" cy="35" r="12" fill="#5b34ff"/>
          </svg>
        </div>
        <strong>Join a Meeting</strong>
        <p class="subtle" style="font-size:11px; margin: 6px 0 12px">Have a meeting ID or QR code? Join and be a part of the conversation.</p>
        <button class="btn" style="width:100%" onclick="go('/join')">Join Meeting</button>
      </div>
    </aside>
  `;
}

/* --- App Shell --------------------------------------------- */
/**
 * shell(phoneHtml, desktopHtml, desktopMain, desktopRight)
 *
 * - phoneHtml:    The mobile phone-frame content (shown on mobile, hidden on desktop)
 * - desktopHtml:  Legacy right panel content (used when desktopMain is empty)
 * - desktopMain:  New: main desktop content column
 * - desktopRight: New: right desktop panel column
 */
export function shell(phoneHtml, desktopHtml = "", desktopMain = "", desktopRight = "") {
  const hasDesktopLayout = desktopMain !== "";
  const hasRightCol = desktopRight !== "";

  app.innerHTML = `
    <div class="app-shell">
      ${sidebar()}
      <main class="content">
        ${hasDesktopLayout ? `
          <!-- Desktop layout: full-width with topbar + optional two columns -->
          <div class="desktop-full-layout">
            ${phoneHtml /* mobile phone hidden on desktop */}
            <div class="${hasRightCol ? "desktop-two-col" : "desktop-single-col"}">
              <div class="desktop-main-col">${desktopMain}</div>
              ${hasRightCol ? `<div class="desktop-right-col">${desktopRight}</div>` : ""}
            </div>
          </div>
        ` : `
          <!-- Legacy layout -->
          <div class="desktop-grid">
            ${phoneHtml}
            <section class="desktop-panel">${desktopHtml || desktopDashboard()}</section>
          </div>
        `}
      </main>
    </div>
  `;
}

/* --- Desktop Dashboard (legacy right panel for non-home pages) */
export function desktopDashboard() {
  const data = state.home;
  return `
    <section class="panel" style="padding:22px; margin-bottom: 24px">
      <div class="section-header">
        <h2 class="screen-title" style="font-size: 14px">Recent Activity</h2>
        <button class="link-btn" onclick="go('/activity')">View all</button>
      </div>
      
      <div class="stack" style="gap: 16px; margin-top: 16px">
        <article class="row" style="align-items: flex-start; gap: 12px">
          <div class="icon-box green" style="width: 32px; height: 32px; background: #e8f7f0">${icons.checkCircle}</div>
          <div style="flex:1">
            <div style="display:flex; justify-content:space-between">
              <h3 style="font-size:13px;font-weight:600;margin-bottom:4px">Your question received 12 upvotes</h3>
            </div>
            <p class="subtle" style="font-size:12px; line-height: 1.4">${data?.recentActivity?.text || "How can AI be used ethically in education?"}</p>
            <span class="subtle" style="font-size: 11px; display: block; margin-top: 4px; text-align: right">2m ago</span>
          </div>
        </article>
        
        <div class="divider" style="margin:0"></div>
        
        <article class="row" style="align-items: flex-start; gap: 12px">
          <div class="icon-box orange" style="width: 32px; height: 32px">${icons.arrowUp}</div>
          <div style="flex:1">
            <h3 style="font-size:13px;font-weight:600;margin-bottom:4px">You upvoted a question</h3>
            <p class="subtle" style="font-size:12px">What are the long-term impacts of remote learning?</p>
            <span class="subtle" style="font-size: 11px; display: block; margin-top: 4px; text-align: right">15m ago</span>
          </div>
        </article>
        
        <div class="divider" style="margin:0"></div>
        
        <article class="row" style="align-items: flex-start; gap: 12px">
          <div class="icon-box blue" style="width: 32px; height: 32px">${icons.calendar}</div>
          <div style="flex:1">
            <h3 style="font-size:13px;font-weight:600;margin-bottom:4px">You joined a meeting</h3>
            <p class="subtle" style="font-size:12px">Future of Remote Learning</p>
            <span class="subtle" style="font-size: 11px; display: block; margin-top: 4px; text-align: right">1h ago</span>
          </div>
        </article>
        
        <div class="divider" style="margin:0"></div>
        
        <article class="row" style="align-items: flex-start; gap: 12px">
          <div class="icon-box" style="width: 32px; height: 32px">${icons.user}</div>
          <div style="flex:1">
            <h3 style="font-size:13px;font-weight:600;margin-bottom:4px">You registered for a meeting</h3>
            <p class="subtle" style="font-size:12px">Data Privacy in EdTech</p>
            <span class="subtle" style="font-size: 11px; display: block; margin-top: 4px; text-align: right">Yesterday</span>
          </div>
        </article>
      </div>
    </section>
    
    <section class="panel" style="padding:22px">
      <h2 class="screen-title" style="font-size: 14px; margin-bottom: 12px">Stay Updated</h2>
      <p class="subtle" style="font-size: 13px; margin-bottom: 16px; line-height: 1.5">Get notified about upcoming meetings and live sessions.</p>
      <button class="btn secondary" style="width:100%; justify-content:space-between" onclick="go('/notifications')">
        <span class="row" style="gap:8px">${icons.bell} Manage Notifications</span>
        ${icons.arrowRight}
      </button>
    </section>
  `;
}

/* --- Card Components --------------------------------------- */

export function meetingCard(meeting, action = "") {
  const isLive = meeting.status === "live";
  return `
    <article class="meeting-card">
      <div class="icon-box ${isLive ? "green" : ""}">
        ${isLive ? icons.zap : icons.calendar}
      </div>
      <div>
        <h3>${meeting.title}</h3>
        <p class="subtle">${icons.calendar} ${meeting.date} &nbsp; ${icons.clock} ${meeting.time}</p>
        <p class="subtle">${icons.users} ${meeting.participants || 0} participants</p>
      </div>
      ${action || `<span class="badge${isLive ? " success" : ""}">${isLive ? `<span class="live-dot"></span>Live` : meeting.startsIn || meeting.status}</span>`}
    </article>
  `;
}

export function questionCard(question, index, moderator = false) {
  // Safely escape question text to prevent XSS from user-submitted content
  const safeText = String(question.text || "").replace(/[<>&"']/g, c => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;"
  })[c]);
  const safeId   = String(question.id || "").replace(/[^a-zA-Z0-9_-]/g, "");

  return `
    <article class="question-card">
      <div class="rank">${index + 1}</div>
      <div class="stack">
        <div class="row">
          <h3 style="font-size:14px;font-weight:600">${safeText}</h3>
          <span class="badge ${question.status === "Answered" ? "success" : "warning"}">${question.status}</span>
        </div>
        <div class="meta">
          <span>${icons.thumbsUp} ${question.votes} upvotes</span>
          <span>${icons.clock} ${question.asked}</span>
          <span>${icons.users} ${question.similar} similar</span>
          <span>${icons.star} ${question.score}</span>
        </div>
        ${moderator ? `
          <div class="row" style="gap:6px;flex-wrap:wrap">
            <button class="btn secondary small" onclick="go('/question/${safeId}')">${icons.eye} Details</button>
            <button class="btn secondary small" onclick="window.moderatorAnswerQuestion && moderatorAnswerQuestion('${safeId}')">${icons.check} Answered</button>
            <button class="btn secondary small" onclick="window.moderatorDeferQuestion && moderatorDeferQuestion('${safeId}')">${icons.pause} Defer</button>
            <button class="btn secondary small" onclick="window.moderatorFlagQuestion && moderatorFlagQuestion('${safeId}')">${icons.flag} Flag</button>
          </div>
        ` : `
          <div class="row" style="gap:6px">
            <button class="btn secondary small" onclick="go('/question/${safeId}')">${icons.eye} Details</button>
            <button class="btn secondary small" onclick="window.participantUpvote && participantUpvote('${safeId}')">${icons.thumbsUp} Upvote</button>
          </div>
        `}
      </div>
    </article>
  `;
}

/* --- Charts ------------------------------------------------ */

export function lineChart(points) {
  const max = Math.max(...points);
  const w = 100, h = 130, pad = 12;
  const step = (w - pad * 2) / (points.length - 1);
  const coords = points.map((p, i) => `${pad + i * step},${h - pad - (p / max) * (h - pad * 2)}`).join(" ");
  const gradCoords = `${pad},${h - pad} ${coords} ${pad + (points.length - 1) * step},${h - pad}`;
  return `
    <svg class="line-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Engagement trend">
      <defs>
        <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#5b34ff" stop-opacity=".18"/>
          <stop offset="100%" stop-color="#5b34ff" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <polygon points="${gradCoords}" fill="url(#lineGrad)"/>
      <polyline points="${coords}" fill="none" stroke="#5b34ff" stroke-width="2.4" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/>
      ${points.map((p, i) => `<circle cx="${pad + i * step}" cy="${h - pad - (p / max) * (h - pad * 2)}" r="3" fill="#fff" stroke="#5b34ff" stroke-width="2" vector-effect="non-scaling-stroke"/>`).join("")}
    </svg>
  `;
}

export function donutChart(segments, total, label) {
  const radius = 54, cx = 75, cy = 75, circumference = 2 * Math.PI * radius;
  let offset = 0;
  const colors = ["#5b34ff", "#24b86f", "#ff8a2a", "#286dff"];
  const arcs = segments.map((seg, i) => {
    const pct = seg.value / total;
    const dashLen = pct * circumference;
    const dash = `${dashLen} ${circumference - dashLen}`;
    const arc = `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${colors[i % colors.length]}" stroke-width="14" stroke-dasharray="${dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})" stroke-linecap="round"/>`;
    offset += dashLen;
    return arc;
  });
  return `
    <div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap;justify-content:center">
      <div class="donut-wrap">
        <svg viewBox="0 0 150 150">${arcs.join("")}</svg>
        <div class="donut-center"><strong>${total}</strong><span>${label}</span></div>
      </div>
      <div class="donut-legend">
        ${segments.map((seg, i) => `
          <div class="donut-legend-item">
            <span class="donut-legend-dot" style="background:${colors[i % colors.length]}"></span>
            <span>${seg.label} <strong>${seg.value} (${Math.round(seg.value / total * 100)}%)</strong></span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}
