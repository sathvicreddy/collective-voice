/* ============================================================
   CollectiveVoice — Premium SPA Application
   ============================================================ */

/* --- State ------------------------------------------------- */
const state = {
  route: location.hash.replace("#", "") || "/welcome",
  home: null,
  meetings: [],
  questions: [],
  activity: null,
  profile: null,
  notifications: [],
  sessionAnalytics: null,
  createDraft: {
    title: "AI in Education: Opportunities & Challenges",
    date: "May 30, 2025",
    time: "02:00 PM - 03:30 PM",
    duration: "1h 30m",
    description: "Let's discuss how AI is transforming education and the challenges we face.",
    participants: ["Sarah Johnson", "Dr. Michael Lee", "Priya Sharma", "James Wilson"]
  },
  isHost: false
};

const app = document.querySelector("#app");

/* --- SVG Icons --------------------------------------------- */
const icons = {
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  activity: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
  user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  users: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  bell: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  arrowLeft: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`,
  chevronRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  checkCircle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  send: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
  messageCircle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`,
  thumbsUp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`,
  arrowUp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`,
  arrowRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
  qrCode: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="8" height="8" rx="1"/><rect x="14" y="2" width="8" height="8" rx="1"/><rect x="2" y="14" width="8" height="8" rx="1"/><rect x="14" y="14" width="4" height="4" rx="1"/><line x1="22" y1="14" x2="22" y2="14.01"/><line x1="22" y1="18" x2="22" y2="22"/><line x1="18" y1="22" x2="18" y2="22.01"/></svg>`,
  share: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`,
  mail: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/></svg>`,
  link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  flag: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`,
  eye: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  helpCircle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  logOut: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  monitor: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`,
  barChart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>`,
  zap: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  image: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
  hash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>`,
  fileText: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
  mic: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,
  trendingUp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
  wifi: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>`,
  battery: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="6" width="18" height="12" rx="2" ry="2"/><line x1="23" y1="13" x2="23" y2="11"/></svg>`,
  signal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="20" x2="2" y2="16"/><line x1="7" y1="20" x2="7" y2="12"/><line x1="12" y1="20" x2="12" y2="8"/><line x1="17" y1="20" x2="17" y2="4"/></svg>`,
  moreHorizontal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>`,
  skipForward: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`,
  download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  star: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
};

/* --- API Helper -------------------------------------------- */
async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

/* --- Navigation -------------------------------------------- */
function go(route) { location.hash = route; }
window.addEventListener("hashchange", () => {
  state.route = location.hash.replace("#", "") || "/home";
  render();
});

/* --- Shared Components ------------------------------------- */

function brand() {
  return `
    <div class="brand">
      <div class="brand-mark">${icons.mic}</div>
      <span>Collective<span>Voice</span></span>
    </div>
  `;
}

function statusBar() {
  return `
    <div class="status">
      <span>9:41</span>
      <span class="status-icons">${icons.signal} ${icons.wifi} ${icons.battery}</span>
    </div>
  `;
}

function topbar(showBack = false) {
  return `
    ${statusBar()}
    <div class="topbar">
      ${showBack
        ? `<button class="icon-btn ghost-icon" onclick="history.back()" aria-label="Go back">${icons.arrowLeft}</button>`
        : brand()}
      <div class="topbar-actions">
        <button class="icon-btn ghost-icon" onclick="go('/notifications')" aria-label="Notifications">${icons.bell}</button>
        <button class="icon-btn" onclick="go('/profile')" aria-label="Profile">A</button>
      </div>
    </div>
  `;
}

function bottomNav(active) {
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

function phone(content, active = "home", showBack = false) {
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

function sidebar() {
  const topNav = [
    ["/home",     "Home",         icons.home],
    ["/activity", "My Questions", icons.helpCircle],
    ["/meetings", "Meetings",     icons.calendar],
    ["/activity", "Activity",     icons.activity],
    ["/profile",  "Profile",      icons.user]
  ];
  const bottomNavItems = [
    ["/support",  "Help & Support", icons.info],
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

function shell(phoneHtml, desktopHtml = "") {
  app.innerHTML = `
    <div class="app-shell">
      ${sidebar()}
      <main class="content">
        <div class="desktop-grid">
          ${phoneHtml}
          <section class="desktop-panel">${desktopHtml || desktopDashboard()}</section>
        </div>
      </main>
    </div>
  `;
}

/* --- Card Components --------------------------------------- */

function meetingCard(meeting, action = "") {
  const isLive = meeting.status === "live";
  return `
    <article class="meeting-card">
      <div class="icon-box ${isLive ? "green" : ""}">
        ${isLive ? icons.zap : icons.calendar}
      </div>
      <div>
        <h3>${meeting.title}</h3>
        <p class="subtle">${icons.calendar} ${meeting.date} &nbsp; ${icons.clock} ${meeting.time}</p>
        <p class="subtle">${icons.users} ${meeting.participants} participants</p>
      </div>
      ${action || `<span class="badge${isLive ? " success" : ""}">${isLive ? `<span class="live-dot"></span>Live` : meeting.startsIn || meeting.status}</span>`}
    </article>
  `;
}

function questionCard(question, index, moderator = false) {
  return `
    <article class="question-card">
      <div class="rank">${index + 1}</div>
      <div class="stack">
        <div class="row">
          <h3 style="font-size:14px;font-weight:600">${question.text}</h3>
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
            <button class="btn secondary small" onclick="go('/question/${question.id}')">${icons.eye} Details</button>
            <button class="btn secondary small" onclick="markAnswered('${question.id}')">${icons.check} Answered</button>
            <button class="btn secondary small" onclick="setQuestionStatus('${question.id}', 'Deferred')">${icons.pause} Defer</button>
            <button class="btn secondary small" onclick="setQuestionStatus('${question.id}', 'Flagged')">${icons.flag} Flag</button>
          </div>
        ` : `
          <div class="row" style="gap:6px">
            <button class="btn secondary small" onclick="go('/question/${question.id}')">${icons.eye} Details</button>
            <button class="btn secondary small" onclick="upvote('${question.id}')">${icons.thumbsUp} Upvote</button>
          </div>
        `}
      </div>
    </article>
  `;
}

/* --- Charts ------------------------------------------------ */

function lineChart(points) {
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

function donutChart(segments, total, label) {
  const radius = 54, cx = 75, cy = 75, circumference = 2 * Math.PI * radius;
  let offset = 0;
  const colors = ["#5b34ff", "#286dff", "#24b86f", "#ff8a2a"];
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

/* --- Desktop Dashboard ------------------------------------- */

function desktopDashboard() {
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

/* === SCREEN RENDERERS ====================================== */

/* --- Welcome / Splash -------------------------------------- */
function renderWelcome() {
  shell(phone(`
    <div class="auth-wrap">
      <div class="logo-hero">
        <div class="big-mark">${icons.mic}</div>
        <div>
          <h1 class="title">Collective<span style="color:var(--primary)">Voice</span></h1>
          <p class="subtle" style="margin-top:10px">Your voice shapes smarter decisions.</p>
        </div>
      </div>
      <div class="stack">
        <button class="btn" onclick="go('/login')">Log In</button>
        <button class="btn secondary" onclick="go('/signup')">Sign Up</button>
        <button class="link-btn" style="text-align:center;padding:8px 0" onclick="go('/onboarding/1')">View Onboarding</button>
        <button class="link-btn" style="text-align:center;padding:4px 0;color:var(--muted)" onclick="go('/home')">Continue as Guest</button>
      </div>
    </div>
  `, null), authDesktop());
}

/* --- Onboarding -------------------------------------------- */
function renderOnboarding(step = 1) {
  const slides = [
    { icon: icons.mic,      title: "Welcome to CollectiveVoice",  body: "Join live sessions, ask anonymously, and help the best questions rise to the top." },
    { icon: icons.zap,      title: "AI Question Clustering",      body: "Similar questions are grouped into one ranked cluster so the speaker sees the real crowd priority." },
    { icon: icons.send,     title: "Make Every Voice Count",       body: "Scan a QR code, join the room, upvote, and track answers — even after the meeting." }
  ];
  const index = Math.max(0, Math.min(slides.length - 1, Number(step) - 1));
  const slide = slides[index];
  shell(phone(`
    <div class="auth-wrap">
      <div class="logo-hero">
        <div class="big-mark">${slide.icon}</div>
        <div>
          <h1 class="screen-title">${slide.title}</h1>
          <p class="subtle" style="max-width:280px;margin:8px auto 0">${slide.body}</p>
        </div>
      </div>
      <div class="row" style="justify-content:center;gap:6px">
        ${slides.map((_, di) => `<span class="dot ${di === index ? "active" : ""}"></span>`).join("")}
      </div>
      <div class="stack">
        ${index < slides.length - 1
          ? `<button class="btn" onclick="go('/onboarding/${index + 2}')">Next</button>`
          : `<button class="btn" onclick="go('/login')">Get Started</button>`}
        <button class="btn secondary" onclick="go('/home')">Skip</button>
      </div>
    </div>
  `, null, true), authDesktop());
}

/* --- Auth Desktop Side Panel ------------------------------- */
function authDesktop() {
  return `
    <div class="panel" style="padding:28px">
      <div class="logo-hero" style="gap:14px">
        <div class="big-mark" style="width:64px;height:64px;border-radius:20px;font-size:28px">${icons.mic}</div>
        <h1 class="title">Collective<span style="color:var(--primary)">Voice</span></h1>
        <p class="subtle" style="max-width:320px">Crowd-prioritised Q&A platform with live voting, AI question clustering, and real-time analytics.</p>
      </div>
    </div>
    <div class="wide-cards" style="grid-template-columns:repeat(3,1fr)">
      ${[
        [icons.users, "Anonymous Q&A", "Ask without fear"],
        [icons.zap, "AI Clustering", "Smart question grouping"],
        [icons.barChart, "Real-time Analytics", "Live insights"]
      ].map(([ic, t, s]) => `
        <div class="stat-card" style="text-align:center">
          <div class="icon-box" style="margin:0 auto 8px">${ic}</div>
          <strong style="font-size:14px;color:var(--ink)">${t}</strong>
          <span class="subtle">${s}</span>
        </div>
      `).join("")}
    </div>
  `;
}

/* --- Login / Sign Up --------------------------------------- */
function renderLogin(kind = "login") {
  const isSignup = kind === "signup";
  shell(phone(`
    <div class="auth-wrap">
      <div>
        <h1 class="screen-title">${isSignup ? "Create Account" : "Welcome Back"}</h1>
        <p class="subtle">${isSignup ? "Sign up to get started" : "Login to your account"}</p>
      </div>
      <div class="stack" style="gap:14px">
        ${isSignup ? `<div class="field"><label>Full Name</label><input placeholder="Enter your full name"></div>` : ""}
        <div class="field"><label>Email or Phone</label><input placeholder="Enter your email or phone"></div>
        <div class="field"><label>Password</label><input type="password" placeholder="Enter your password"></div>
        ${isSignup
          ? `<div class="field"><label>Confirm Password</label><input type="password" placeholder="Confirm your password"></div>`
          : `<button class="link-btn" style="text-align:right" onclick="go('/forgot')">Forgot Password?</button>`}
        <button class="btn" style="width:100%" onclick="go('/home')">${isSignup ? "Sign Up" : "Log In"}</button>
        <button class="link-btn" style="text-align:center" onclick="go('${isSignup ? "/login" : "/signup"}')">
          ${isSignup ? "Already have an account? <strong>Log In</strong>" : "Don't have an account? <strong>Sign Up</strong>"}
        </button>
      </div>
    </div>
  `, null, true), authDesktop());
}

/* --- Forgot / Reset Password ------------------------------- */
function renderForgot() {
  shell(phone(`
    <div class="auth-wrap">
      <div>
        <h1 class="screen-title">Forgot Password</h1>
        <p class="subtle">Enter your email and we'll send instructions to reset your password.</p>
      </div>
      <div class="stack" style="gap:14px">
        <div class="field"><label>Email</label><input placeholder="Enter your email"></div>
        <button class="btn" style="width:100%" onclick="go('/reset')">Send Reset Link</button>
        <button class="link-btn" style="text-align:center" onclick="go('/login')">Remember your password? <strong>Log In</strong></button>
      </div>
    </div>
  `, null, true), authDesktop());
}

function renderReset() {
  shell(phone(`
    <div class="auth-wrap">
      <div>
        <h1 class="screen-title">Reset Password</h1>
        <p class="subtle">Enter your new password below.</p>
      </div>
      <div class="stack" style="gap:14px">
        <div class="field"><label>New Password</label><input type="password" placeholder="Enter new password"></div>
        <div class="field"><label>Confirm Password</label><input type="password" placeholder="Confirm new password"></div>
        <button class="btn" style="width:100%" onclick="go('/login')">Reset Password</button>
        <div class="stack" style="gap:4px;font-size:13px;color:var(--muted)">
          <span>${icons.checkCircle} At least 8 characters</span>
          <span>${icons.checkCircle} Include a number</span>
          <span>${icons.checkCircle} Include an uppercase letter</span>
        </div>
      </div>
    </div>
  `, null, true), authDesktop());
}

/* --- Home -------------------------------------------------- */
function renderHome() {
  const data = state.home;
  shell(phone(`
    <h1 class="screen-title">Hello, Ananya! 👋</h1>
    <p class="subtle">Welcome back! Let's make conversations count.</p>

    <div class="quick-grid">
      ${[
        [icons.messageCircle, "My Questions", "/activity", ""],
        [icons.calendar, "Meetings", "/meetings", "orange"],
        [icons.activity, "Activity", "/activity", "blue"],
        [icons.user, "Profile", "/profile", "green"]
      ].map(([ic, label, route, tone]) => `
        <button class="quick-card" onclick="go('${route}')">
          <span class="icon-box ${tone}">${ic}</span>
          <span>${label}</span>
        </button>
      `).join("")}
    </div>

    <section class="live-card stack">
      <div class="row">
        <span class="badge success"><span class="live-dot"></span> Live Now</span>
        <span class="subtle">${data.live.participants} joined</span>
      </div>
      <h2 style="font-size:16px;font-weight:700">${data.live.title}</h2>
      <p class="subtle">${icons.user} Speaker: ${data.live.speaker}</p>
      <div class="row">
        <span class="subtle">${icons.clock} Started 10 min ago</span>
        <button class="btn small" onclick="go('/join/preview')">${icons.arrowRight} Join Now</button>
      </div>
    </section>

    <div class="section-header">
      <h2 class="screen-title">Upcoming Meetings</h2>
      <button class="link-btn" onclick="go('/meetings')">View all</button>
    </div>
    <div class="stack">${data.upcoming.slice(0, 2).map(m => meetingCard(m)).join("")}</div>

    <div class="empty-space"></div>

    <div class="desktop-hide">
      <div class="section-header">
        <h2 class="screen-title">Recent Activity</h2>
        <button class="link-btn" onclick="go('/activity')">View all</button>
      </div>
      <article class="list-card row">
        <div class="icon-box green">${icons.thumbsUp}</div>
        <div style="flex:1">
          <h3 style="font-size:14px;font-weight:600">Your question received 12 upvotes</h3>
          <p class="subtle">${data.recentActivity.text}</p>
        </div>
        <span class="subtle">2m ago</span>
      </article>
    </div>
  `, "home"));
}

/* --- Meetings ---------------------------------------------- */
function renderMeetings() {
  const ongoing = state.meetings.filter(m => m.status === "live");
  const upcoming = state.meetings.filter(m => m.status === "upcoming");
  const conducted = state.meetings.filter(m => m.status === "conducted" || m.status === "past");

  shell(phone(`
    <h1 class="screen-title">Meetings</h1>
    <p class="subtle">Create, join and manage your meetings.</p>

    <div class="form-grid" style="margin:16px 0">
      <button class="action-card row" style="gap:12px" onclick="go('/meetings/create')">
        <span class="icon-box">${icons.plus}</span>
        <span><strong>Create Meeting</strong><br><span class="subtle">Start a new meeting</span></span>
      </button>
      <button class="action-card row" style="gap:12px" onclick="go('/join')">
        <span class="icon-box blue">${icons.arrowRight}</span>
        <span><strong>Join Meeting</strong><br><span class="subtle">Enter a code to join</span></span>
      </button>
    </div>

    <div class="segmented">
      <button class="active">Upcoming ${upcoming.length}</button>
      <button>Ongoing ${ongoing.length}</button>
      <button onclick="go('/conducted')">Past ${conducted.length}</button>
    </div>

    <div class="stack">
      ${ongoing.length ? `
        <div class="section-header"><h2 class="screen-title">Ongoing Meeting</h2><span class="badge success"><span class="live-dot"></span>Live</span></div>
        ${ongoing.map(m => meetingCard(m, `<button class="btn small" onclick="go('/join/preview')">${icons.arrowRight} Join Now</button>`)).join("")}
      ` : ""}

      <div class="section-header"><h2 class="screen-title">Upcoming Meetings</h2><button class="link-btn">View all</button></div>
      ${upcoming.map(m => meetingCard(m)).join("")}

      <div class="section-header"><h2 class="screen-title">Conducted Meetings</h2><button class="link-btn" onclick="go('/conducted')">View all</button></div>
      ${conducted.slice(0, 1).map(m => meetingCard(m, `<button class="btn secondary small" onclick="go('/analytics')">${icons.barChart} Analytics</button>`)).join("")}
    </div>
  `, "meetings"));
}

/* --- Activity ---------------------------------------------- */
function renderActivity(tab = "questions") {
  const analytics = state.activity.analytics;
  const meetings = state.activity.meetings || state.meetings;

  const content = {
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
          meetingCard(m, `<button class="btn secondary small" onclick="go('/analytics')">${icons.barChart} Report</button>`)
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

  shell(phone(`
    <h1 class="screen-title">Activity</h1>
    <p class="subtle">Your engagement overview</p>

    <div class="tabs tabs-four">
      <button class="${tab === "overview" ? "active" : ""}" onclick="renderActivity('overview')">Overview</button>
      <button class="${tab === "questions" ? "active" : ""}" onclick="renderActivity('questions')">Questions</button>
      <button class="${tab === "meetings" || tab === "conducted" ? "active" : ""}" onclick="renderActivity('meetings')">Meetings</button>
      <button class="${tab === "insights" ? "active" : ""}" onclick="renderActivity('insights')">Insights</button>
    </div>

    ${content[tab] || content.questions}
  `, "activity"));
}

/* --- Profile ----------------------------------------------- */
function renderProfile() {
  const user = state.profile.user;
  const stats = user.stats;
  shell(phone(`
    <div style="text-align:center;padding:8px 0 20px">
      <div class="avatar" style="margin:0 auto 12px;font-size:28px">AS</div>
      <h1 class="screen-title">${user.name}</h1>
      <span class="badge" style="margin:6px 0">${user.role}</span>
      <p class="subtle">${icons.mail} ${user.email}</p>
      <p class="subtle">${icons.calendar} Joined ${user.joined}</p>
      <button class="edit-profile-btn" style="margin-top:10px" onclick="go('/settings')">${icons.edit} Edit Profile</button>
    </div>

    <div class="wide-cards" style="grid-template-columns:repeat(4,1fr);margin:8px 0 20px">
      ${[
        [icons.messageCircle, "Questions Asked", stats.questionsAsked],
        [icons.thumbsUp, "Upvotes Received", stats.upvotesReceived],
        [icons.checkCircle, "Answers Given", stats.answersGiven],
        [icons.calendar, "Meetings Joined", stats.meetingsJoined]
      ].map(([ic, label, value]) => `
        <div class="stat-card" style="text-align:center;padding:12px 6px">
          <strong style="font-size:22px">${value}</strong>
          <span class="subtle" style="font-size:10px">${label}</span>
        </div>
      `).join("")}
    </div>

    <h2 class="screen-title" style="margin-bottom:12px">Account</h2>
    <div class="stack" style="gap:8px">
      ${[
        [icons.user, "Personal Information", "Update your personal details"],
        [icons.bell, "Notification Preferences", "Manage your notifications"],
        [icons.shield, "Privacy & Security", "Manage your privacy and security"],
        [icons.helpCircle, "Help & Support", "Get help and contact support"],
        [icons.info, "About CollectiveVoice", "Version 1.4.0"]
      ].map(([ic, title, desc]) => `
        <button class="list-card row" style="gap:14px" onclick="go('/settings')">
          <div class="icon-box" style="width:36px;height:36px">${ic}</div>
          <span style="flex:1;text-align:left"><strong style="font-size:14px">${title}</strong><br><span class="subtle">${desc}</span></span>
          ${icons.chevronRight}
        </button>
      `).join("")}
      <button class="list-card row" style="gap:14px;color:var(--danger)" onclick="go('/welcome')">
        <div class="icon-box red" style="width:36px;height:36px">${icons.logOut}</div>
        <span style="flex:1;text-align:left"><strong style="font-size:14px">Log Out</strong></span>
        ${icons.chevronRight}
      </button>
    </div>
  `, "profile"));
}

/* --- Join Flow --------------------------------------------- */
function renderJoin(step = "start") {
  const meeting = state.meetings[0];
  const screens = {
    start: `
      <h1 class="screen-title">Join Meeting</h1>
      <p class="subtle">Join an ongoing meeting as an audience.</p>
      <div class="center-screen">
        <div class="logo-hero">
          <div class="big-mark">${icons.users}</div>
        </div>
        <div class="stack" style="gap:12px">
          <button class="btn" style="width:100%" onclick="go('/join/scan')">${icons.qrCode} Scan QR Code</button>
          <button class="btn secondary" style="width:100%" onclick="go('/join/id')">${icons.hash} Enter Meeting ID</button>
        </div>
      </div>
    `,
    scan: `
      <h1 class="screen-title">Scan QR Code</h1>
      <p class="subtle">Place the QR code inside the frame to scan automatically.</p>
      <div class="qr-frame"><div class="fake-qr"></div></div>
      <div class="row" style="justify-content:center;gap:28px;margin:16px 0">
        <button class="icon-btn" style="width:48px;height:48px">${icons.zap}</button>
        <button class="icon-btn" style="width:48px;height:48px">${icons.image}</button>
      </div>
      <div class="stack" style="gap:10px">
        <button class="btn" style="width:100%" onclick="go('/join/preview')">Use Detected Meeting</button>
        <button class="btn secondary" style="width:100%" onclick="go('/join/waiting')">Preview Upcoming State</button>
      </div>
    `,
    id: `
      <h1 class="screen-title">Enter Meeting ID</h1>
      <p class="subtle">Enter the meeting ID provided by the moderator.</p>
      <div class="stack" style="margin-top:60px;gap:16px">
        <div class="field"><label>Meeting ID</label><input id="meetingCode" value="482916" placeholder="Enter meeting ID"></div>
        <p class="subtle" style="padding:10px 14px;background:var(--soft);border-radius:var(--radius-sm)">${icons.info} The meeting ID is a 6 to 10 digit numeric code.</p>
      </div>
      <button class="btn" style="width:100%;margin-top:100px" onclick="validateMeetingCode()">${icons.arrowRight} Join Meeting</button>
    `,
    preview: `
      <h1 class="screen-title">Meeting Details</h1>
      <p class="subtle">Review meeting details before joining.</p>
      <section class="panel stack" style="margin-top:24px;padding:20px">
        <div class="row">
          <h2 style="font-size:17px;font-weight:700">${meeting.title}</h2>
          <span class="badge success"><span class="live-dot"></span> Live</span>
        </div>
        <div class="stack" style="gap:8px">
          <div class="info-row">${icons.calendar} <span>${meeting.date}</span></div>
          <div class="info-row">${icons.clock} <span>${meeting.time} (${meeting.duration})</span></div>
          <div class="info-row">${icons.users} <span>${meeting.participants} participants</span></div>
          <div class="info-row">${icons.user} <span>${meeting.speaker} · Moderator</span></div>
        </div>
        <p style="font-size:14px;color:var(--ink-secondary);margin-top:4px">${meeting.description}</p>
      </section>
      <section class="panel row" style="margin:18px 0;padding:14px 18px;gap:14px">
        <div class="icon-box">${icons.users}</div>
        <span>You are joining as<br><strong style="font-size:15px">Audience</strong></span>
      </section>
      <button class="btn" style="width:100%" onclick="go('/joining')">${icons.arrowRight} Join Now</button>
    `,
    waiting: `
      <div class="center-screen" style="text-align:center">
        <div class="logo-hero">
          <div class="big-mark" style="background:linear-gradient(135deg,#ff8a2a,#ffb366)">${icons.clock}</div>
          <div>
            <h1 class="screen-title">Meeting Not Started</h1>
            <p class="subtle" style="max-width:260px;margin:6px auto 0">This meeting hasn't started yet. It has been added to your Upcoming Meetings.</p>
          </div>
        </div>
        ${meetingCard(meeting)}
        <button class="btn" style="width:100%" onclick="go('/meetings')">${icons.calendar} View Upcoming Meetings</button>
        <button class="link-btn" style="text-align:center" onclick="go('/home')">Go to Home</button>
      </div>
    `,
    invalid: `
      <div class="center-screen" style="text-align:center">
        <div class="logo-hero">
          <div class="big-mark" style="background:linear-gradient(135deg,#e54040,#ff6b6b)">${icons.helpCircle}</div>
          <div>
            <h1 class="screen-title">Invalid Meeting</h1>
            <p class="subtle" style="max-width:260px;margin:6px auto 0">We could not find a meeting with that code. Please check and try again.</p>
          </div>
        </div>
        <div class="stack" style="gap:10px">
          <button class="btn" style="width:100%" onclick="go('/join/id')">${icons.hash} Try Again</button>
          <button class="btn secondary" style="width:100%" onclick="go('/join/scan')">${icons.qrCode} Scan QR Code</button>
        </div>
      </div>
    `
  };
  shell(phone(screens[step], "meetings", true));
}

/* --- Joining Loading Screen -------------------------------- */
function renderJoining() {
  shell(phone(`
    <div class="center-screen" style="text-align:center">
      <div class="logo-hero">
        <div class="big-mark">${icons.users}</div>
        <h1 class="screen-title">Joining Meeting...</h1>
        <p class="subtle">Please wait while we connect you to the room.</p>
        <div class="spinner"></div>
      </div>
      <button class="btn" onclick="go('/audience')">${icons.arrowRight} Enter Room</button>
    </div>
  `, null, true));
}

/* --- Create Meeting Flow ----------------------------------- */
function renderCreate(step = "type") {
  const draft = state.createDraft;
  const screens = {
    type: `
      <h1 class="screen-title">Create Meeting</h1>
      <p class="subtle">Choose how you want to create your meeting.</p>
      <div class="stack" style="margin-top:32px;gap:14px">
        <button class="action-card stack" style="padding:22px;gap:10px" onclick="go('/meetings/create/details')">
          <span class="icon-box green" style="width:48px;height:48px">${icons.zap}</span>
          <h2 style="font-size:17px">Start Instantly</h2>
          <p class="subtle">Start a meeting right away with an open room.</p>
        </button>
        <button class="action-card stack" style="padding:22px;gap:10px" onclick="go('/meetings/create/details')">
          <span class="icon-box" style="width:48px;height:48px">${icons.calendar}</span>
          <h2 style="font-size:17px">Schedule Meeting</h2>
          <p class="subtle">Plan for later and invite participants.</p>
        </button>
      </div>
    `,
    details: `
      <h1 class="screen-title">Meeting Details</h1>
      <p class="subtle">Add the details for your meeting.</p>
      <div class="stack" style="margin-top:18px;gap:14px">
        <div class="field"><label>Meeting Title</label><input id="title" value="${draft.title}"></div>
        <div class="field"><label>Date</label><input id="date" value="${draft.date}"></div>
        <div class="form-grid">
          <div class="field"><label>Time</label><input id="time" value="${draft.time}"></div>
          <div class="field"><label>Duration</label><input id="duration" value="${draft.duration}"></div>
        </div>
        <div class="field"><label>Description (Optional)</label><textarea id="description">${draft.description}</textarea></div>

        <h2 class="screen-title" style="margin-top:8px">Meeting Settings</h2>
        ${["Allow Participants to Ask Questions", "Enable Chat", "Record Meeting", "Allow Screen Sharing"].map((item, i) => `
          <div class="toggle-row"><span>${item}</span><span class="switch ${i === 2 ? "" : "on"}"></span></div>
        `).join("")}

        <button class="btn" style="width:100%;margin-top:8px" onclick="saveDetails()">${icons.arrowRight} Next</button>
      </div>
    `,
    invite: `
      <h1 class="screen-title">Invite Participants</h1>
      <p class="subtle">Add participants or share the invite link.</p>
      <div class="field" style="margin:16px 0"><input placeholder="Search by name or email"></div>
      <p class="subtle" style="font-weight:600;margin-bottom:8px">Suggested</p>
      <div class="stack" style="gap:8px">
        ${draft.participants.map(name => `
          <div class="participant-row">
            <div class="mini-avatar">${name[0]}</div>
            <div class="participant-info">
              <strong>${name}</strong>
              <span>${name.toLowerCase().replaceAll(" ", ".").replaceAll("dr.", "dr")}@email.com</span>
            </div>
            <button class="icon-btn" style="width:30px;height:30px">${icons.plus}</button>
          </div>
        `).join("")}
      </div>
      <div class="field" style="margin:18px 0"><label>Invite via link</label><input value="https://cv.app/meet/abc123"></div>
      <div class="row" style="justify-content:center;gap:20px;margin:12px 0">
        ${[
          [icons.share, "Share Link"],
          [icons.mail, "Email"],
          [icons.link, "WhatsApp"],
          [icons.moreHorizontal, "More"]
        ].map(([ic, label]) => `
          <div style="text-align:center">
            <button class="icon-btn" style="width:44px;height:44px;margin-bottom:4px">${ic}</button>
            <span class="subtle" style="font-size:10px">${label}</span>
          </div>
        `).join("")}
      </div>
      <button class="btn" style="width:100%;margin-top:8px" onclick="go('/meetings/create/review')">${icons.arrowRight} Next</button>
    `,
    review: `
      <h1 class="screen-title">Review & Confirm</h1>
      <p class="subtle">Please review your meeting details.</p>
      <section class="panel stack" style="margin:18px 0;padding:18px">
        <h2 style="font-size:16px;font-weight:700">${draft.title}</h2>
        <div class="info-row">${icons.calendar} <span>${draft.date}</span></div>
        <div class="info-row">${icons.clock} <span>${draft.time} (${draft.duration})</span></div>
        <div class="info-row">${icons.users} <span>${draft.participants.length} participants invited</span></div>
        <p style="font-size:14px;color:var(--ink-secondary)">${draft.description}</p>
      </section>
      <section class="panel stack" style="padding:14px 18px;gap:6px">
        <h3 style="font-size:14px;font-weight:600;margin-bottom:4px">Settings</h3>
        ${["Allow Questions", "Enable Chat", "Record Meeting", "Screen Sharing"].map((item, i) => `
          <div class="review-row"><span>${item}</span><strong style="color:${i === 2 ? "var(--muted)" : "var(--success)"}">${i === 2 ? "Off" : "On"}</strong></div>
        `).join("")}
      </section>
      <div class="form-grid" style="margin-top:16px">
        <button class="btn secondary" onclick="history.back()">Back</button>
        <button class="btn" onclick="createMeeting()">${icons.checkCircle} Create Meeting</button>
      </div>
    `,
    done: `
      <div class="center-screen" style="text-align:center">
        <div class="logo-hero">
          <div class="success-mark">${icons.checkCircle}</div>
          <div>
            <h1 class="screen-title">Meeting Created!</h1>
            <p class="subtle">Your meeting has been created successfully.</p>
          </div>
        </div>
        <section class="panel stack" style="text-align:left;padding:16px">
          <h3 style="font-size:15px;font-weight:700">${state.meetings[0]?.title || draft.title}</h3>
          <div class="info-row">${icons.calendar} <span>${draft.date}</span></div>
          <div class="info-row">${icons.clock} <span>${draft.time} (${draft.duration})</span></div>
          <div class="info-row">${icons.users} <span>${draft.participants.length} participants invited</span></div>
        </section>
        <div class="stack" style="gap:10px">
          <button class="btn" style="width:100%" onclick="go('/moderator')">${icons.zap} Start Meeting Now</button>
          <button class="btn secondary" style="width:100%" onclick="go('/meetings')">${icons.calendar} View Meeting Details</button>
          <button class="link-btn" style="text-align:center" onclick="go('/meetings')">Go to Meetings</button>
        </div>
      </div>
    `
  };
  shell(phone(screens[step], "meetings", true));
}

/* --- Audience View ----------------------------------------- */
function renderAudience() {
  shell(phone(`
    <div class="row">
      <div>
        <h1 class="screen-title">Audience Q&A</h1>
        <p class="subtle">Ask anonymously and upvote the best questions.</p>
      </div>
      <span class="badge success"><span class="live-dot"></span> Live</span>
    </div>

    <section class="panel stack" style="margin:18px 0;padding:18px">
      <div class="field">
        <label>${icons.messageCircle} Ask a Question</label>
        <textarea id="newQuestion" maxlength="500" placeholder="Type your question..."></textarea>
      </div>
      <button class="btn" style="width:100%" onclick="submitQuestion()">${icons.send} Submit Question</button>
    </section>

    <div class="section-header">
      <h2 class="screen-title">Ranked Questions</h2>
      <span class="badge">${state.questions.length} total</span>
    </div>
    <div class="stack">${state.questions.map((q, i) => questionCard(q, i)).join("")}</div>
  `, "activity"), renderAudiencePanel());
}

function renderAudiencePanel() {
  return `
    <div class="panel" style="padding:22px">
      <div class="row">
        <div>
          <h1 class="title">Live Session</h1>
          <p class="subtle" style="margin-top:4px">Participate in the discussion by asking and upvoting questions.</p>
        </div>
      </div>
    </div>
    <div class="wide-cards" style="grid-template-columns:repeat(2,1fr)">
      ${[["2", "Your Questions"], ["14", "Your Upvotes"]].map(([value, label]) => `
        <div class="stat-card" style="text-align:center">
          <strong>${value}</strong>
          <span class="subtle">${label}</span>
        </div>
      `).join("")}
    </div>
  `;
}

/* --- Moderator View ---------------------------------------- */
function renderModerator() {
  shell(phone(`
    <div class="segmented" style="margin-bottom:16px">
      <button class="segment active">Moderator</button>
      <button class="segment" onclick="go('/speaker')">Speaker</button>
    </div>
    <div class="row">
      <div>
        <h1 class="screen-title">Moderator View</h1>
        <p class="subtle">Ranked queue with real-time controls.</p>
      </div>
      <span class="badge success"><span class="live-dot"></span> Live · 60</span>
    </div>

    <div class="wide-cards" style="grid-template-columns:repeat(2,1fr);margin:16px 0">
      ${[
        [icons.messageCircle, "Questions", 112],
        [icons.hash, "Unique", 41],
        [icons.thumbsUp, "Upvotes", 326],
        [icons.clock, "Latency", "38ms"]
      ].map(([ic, label, value]) => `
        <div class="stat-card" style="text-align:center">
          <strong style="font-size:20px">${value}</strong>
          <span class="subtle">${label}</span>
        </div>
      `).join("")}
    </div>

    <div class="stack">${state.questions.map((q, i) => questionCard(q, i, true)).join("")}</div>

    <div class="stack" style="margin-top:16px;gap:10px">
      <button class="btn danger-outline" style="width:100%" onclick="go('/analytics')">${icons.flag} End Meeting</button>
    </div>
  `, "activity"), renderModeratorPanel());
}

function renderModeratorPanel() {
  return `
    <div class="panel" style="padding:22px">
      <div class="row">
        <div>
          <h1 class="title">Live Session Control</h1>
          <p class="subtle" style="margin-top:4px">Speaker and moderator surfaces share the same ranked queue.</p>
        </div>
      </div>
    </div>
    <div class="wide-cards">
      ${[["112", "Questions"], ["41", "Unique"], ["326", "Upvotes"], ["38ms", "Latency"]].map(([value, label]) => `
        <div class="stat-card" style="text-align:center">
          <strong>${value}</strong>
          <span class="subtle">${label}</span>
        </div>
      `).join("")}
    </div>
    <div class="chart-card stack">
      <h2 class="screen-title">Top 3 Questions</h2>
      ${state.questions.slice(0, 3).map((q, i) => questionCard(q, i, true)).join("")}
    </div>
  `;
}

/* --- Notifications ----------------------------------------- */
function renderNotifications() {
  const typeIcons = { "Meeting Updates": icons.calendar, "Questions": icons.messageCircle, "System": icons.info };
  shell(phone(`
    <div class="row">
      <h1 class="screen-title">Notifications</h1>
      <button class="link-btn">Mark all as read</button>
    </div>
    <div class="tabs">
      <button class="active">All</button>
      <button>Meetings</button>
      <button>Questions</button>
    </div>
    <div class="stack">
      ${state.notifications.map(item => `
        <article class="list-card row" style="gap:14px">
          <div class="icon-box" style="width:36px;height:36px">${typeIcons[item.type] || icons.bell}</div>
          <div style="flex:1">
            <strong style="font-size:13px">${item.title}</strong>
            <p class="subtle">${item.body}</p>
          </div>
          <span class="subtle" style="white-space:nowrap">${item.time}</span>
        </article>
      `).join("")}
    </div>
  `, "profile"));
}

/* --- Speaker View ------------------------------------------ */
function renderSpeaker() {
  const topThree = state.questions.slice(0, 3);
  shell(phone(`
    <div class="segmented" style="margin-bottom:16px">
      <button class="segment" onclick="go('/moderator')">Moderator</button>
      <button class="segment active">Speaker</button>
    </div>
    <div class="row">
      <div>
        <h1 class="screen-title">Speaker View</h1>
        <p class="subtle">Top 3 questions for presentation.</p>
      </div>
      <span class="badge success"><span class="live-dot"></span> Live</span>
    </div>

    <div class="stack" style="margin-top:18px">
      ${topThree.map((q, i) => `
        <button class="question-card" onclick="go('/question/${q.id}')">
          <div class="rank">${i + 1}</div>
          <div class="stack" style="text-align:left;gap:8px">
            <h2 style="font-size:15px;font-weight:700">${q.text}</h2>
            <div class="meta">
              <span>${icons.thumbsUp} ${q.votes} upvotes</span>
              <span>${icons.star} Score ${q.score}</span>
            </div>
            <p class="subtle" style="font-size:12px">${q.summary}</p>
          </div>
        </button>
      `).join("")}

      <div class="stack" style="margin-top:8px;gap:10px">
        <button class="btn" style="width:100%" onclick="go('/question/${topThree[0].id}')">${icons.eye} Open Top Question</button>
        <button class="btn danger-outline" style="width:100%" onclick="go('/analytics')">${icons.flag} End Meeting</button>
      </div>
    </div>
  `, "activity"), renderModeratorPanel());
}

/* --- Session Analytics ------------------------------------- */
function renderAnalytics() {
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

function analyticsDesktop() {
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

/* --- Settings ---------------------------------------------- */
function renderSettings() {
  const rows = [
    [icons.user,     "Account",       "Name, email, profile visibility",           ""],
    [icons.shield,   "Privacy",       "Anonymous participation and data controls", "green"],
    [icons.eye,      "Security",      "Password, sessions, and two-step verification", "orange"],
    [icons.monitor,  "Appearance",    "Theme, contrast, and display density",      "blue"],
    [icons.bell,     "Notifications", "Meeting reminders and question updates",    ""]
  ];
  shell(phone(`
    <h1 class="screen-title">Settings</h1>
    <p class="subtle">Manage account, privacy, security, and appearance.</p>
    <div class="stack" style="margin-top:18px;gap:8px">
      ${rows.map(([ic, title, desc, tone]) => `
        <article class="list-card row" style="gap:14px;cursor:pointer">
          <div class="icon-box ${tone}" style="width:40px;height:40px">${ic}</div>
          <div style="flex:1">
            <strong style="font-size:14px">${title}</strong><br>
            <span class="subtle">${desc}</span>
          </div>
          ${icons.chevronRight}
        </article>
      `).join("")}
      <button class="btn secondary" style="width:100%;margin-top:8px" onclick="go('/profile')">${icons.arrowLeft} Back to Profile</button>
    </div>
  `, "profile", true));
}

/* --- Conducted Meetings ------------------------------------ */
function renderConductedMeetings() {
  const conducted = state.meetings.filter(m => m.status === "conducted" || m.status === "past");
  shell(phone(`
    <h1 class="screen-title">Conducted Meetings</h1>
    <p class="subtle">Hosted sessions, participants, questions, analytics, and reports.</p>
    <div class="stack" style="margin-top:18px">
      ${conducted.map(meeting => `
        <article class="meeting-card">
          <div class="icon-box green">${icons.checkCircle}</div>
          <div>
            <h3>${meeting.title}</h3>
            <p class="subtle">${icons.users} ${meeting.participants} participants · ${icons.messageCircle} ${meeting.questionsCount || 0} questions · ${icons.thumbsUp} ${meeting.upvotes || 0} upvotes</p>
            <p class="subtle">${icons.calendar} ${meeting.date} · ${icons.clock} ${meeting.time}</p>
          </div>
          <button class="btn secondary small" onclick="go('/analytics')">${icons.barChart} Report</button>
        </article>
      `).join("")}
      <button class="btn" style="width:100%;margin-top:8px" onclick="go('/analytics')">${icons.barChart} Open Session Analytics</button>
    </div>
  `, "activity", true), analyticsDesktop());
}

/* --- Question Detail --------------------------------------- */
function renderQuestionDetail(id = "q1") {
  const question = state.questions.find(q => q.id === id) || state.questions[0];
  shell(phone(`
    <div class="row">
      <div>
        <h1 class="screen-title">Question Detail</h1>
        <p class="subtle">Cluster, score, timeline, and status.</p>
      </div>
      <span class="badge">#1</span>
    </div>

    <section class="panel stack" style="margin:18px 0;padding:18px">
      <h2 style="font-size:17px;font-weight:700">${question.text}</h2>
      <div class="meta" style="gap:14px">
        <span>${icons.thumbsUp} ${question.votes} upvotes</span>
        <span>${icons.users} ${question.clusterSize || question.similar} cluster</span>
        <span>${icons.star} Score ${question.score}</span>
      </div>
      <span class="badge ${question.status === "Answered" ? "success" : "warning"}" style="justify-self:start">${question.status}</span>
    </section>

    <section class="chart-card stack" style="margin-bottom:14px">
      <h2 class="screen-title">${icons.zap} AI Summary</h2>
      <p style="font-size:14px;color:var(--ink-secondary);line-height:1.6">${question.summary || "This cluster contains related audience questions and is ranked using upvotes, recency, diversity, and novelty."}</p>
    </section>

    <section class="chart-card stack">
      <h2 class="screen-title">${icons.clock} Timeline</h2>
      ${(question.timeline || ["Submitted", "Clustered", "Ranked"]).map((item, i, arr) => `
        <div class="timeline-row">
          <span class="timeline-dot ${i === arr.length - 1 ? "" : ""}"></span>
          <span>${item}</span>
        </div>
      `).join("")}
    </section>

    <h3 style="font-size:14px;font-weight:600;margin:18px 0 10px">Moderator Actions</h3>
    <div class="stack" style="gap:8px">
      <button class="btn" style="width:100%" onclick="markAnswered('${question.id}')">${icons.check} Mark Answered</button>
      <button class="btn secondary" style="width:100%" onclick="setQuestionStatus('${question.id}', 'Deferred')">${icons.pause} Defer</button>
      <button class="btn secondary" style="width:100%" onclick="setQuestionStatus('${question.id}', 'Skipped')">${icons.skipForward} Skip</button>
      <button class="btn secondary" style="width:100%" onclick="setQuestionStatus('${question.id}', 'Flagged')">${icons.flag} Flag</button>
    </div>
  `, "activity", true), renderModeratorPanel());
}

/* === ACTIONS =============================================== */

function saveDetails() {
  state.createDraft.title = document.querySelector("#title")?.value || state.createDraft.title;
  state.createDraft.date = document.querySelector("#date")?.value || state.createDraft.date;
  state.createDraft.time = document.querySelector("#time")?.value || state.createDraft.time;
  state.createDraft.duration = document.querySelector("#duration")?.value || state.createDraft.duration;
  state.createDraft.description = document.querySelector("#description")?.value || state.createDraft.description;
  go("/meetings/create/invite");
}

async function validateMeetingCode() {
  const code = document.querySelector("#meetingCode")?.value.trim();
  if (!code) { go("/join/invalid"); return; }
  const response = await fetch(`/api/sessions/code/${code}`);
  if (!response.ok) { go("/join/invalid"); return; }
  const result = await response.json();
  state.isHost = false; // Joined as audience
  go(result.meeting.status === "upcoming" ? "/join/waiting" : "/join/preview");
}

async function createMeeting() {
  const result = await api("/api/sessions", {
    method: "POST",
    body: JSON.stringify(state.createDraft)
  });
  state.meetings.unshift(result.meeting);
  state.isHost = true; // Started the meeting
  go("/meetings/created");
}

async function submitQuestion() {
  const input = document.querySelector("#newQuestion");
  const text = input?.value.trim();
  if (!text) return;
  const result = await api("/api/questions", {
    method: "POST",
    body: JSON.stringify({ text })
  });
  state.questions = result.questions;
  renderAudience();
}

async function upvote(id) {
  const result = await api(`/api/questions/${id}/upvote`, { method: "POST" });
  state.questions = state.questions.map(q => q.id === id ? result.question : q);
  render();
}

function markAnswered(id) {
  state.questions = state.questions.map(q => q.id === id ? { ...q, status: "Answered" } : q);
  render();
}

function setQuestionStatus(id, status) {
  state.questions = state.questions.map(q => q.id === id ? { ...q, status } : q);
  render();
}

/* === DATA LOADING & ROUTER ================================= */

async function loadData() {
  const [home, meetings, questions, activity, profile, notifications, sessionAnalytics] = await Promise.all([
    api("/api/home"),
    api("/api/meetings"),
    api("/api/questions"),
    api("/api/activity"),
    api("/api/profile"),
    api("/api/notifications"),
    api("/api/analytics")
  ]);
  state.home = home;
  state.meetings = meetings.meetings;
  state.questions = questions.questions;
  state.activity = activity;
  state.profile = profile;
  state.notifications = notifications.notifications;
  state.sessionAnalytics = sessionAnalytics;
}

function render() {
  if (!state.home) return;
  const route = state.route;
  if (route === "/welcome" || route === "/splash") return renderWelcome();
  if (route.startsWith("/onboarding/")) return renderOnboarding(route.split("/").pop());
  if (route === "/login")    return renderLogin("login");
  if (route === "/signup")   return renderLogin("signup");
  if (route === "/forgot")   return renderForgot();
  if (route === "/reset")    return renderReset();
  if (route === "/home")     return renderHome();
  if (route === "/meetings") return renderMeetings();
  if (route === "/activity") return renderActivity("questions");
  if (route === "/activity/overview")  return renderActivity("overview");
  if (route === "/activity/meetings")  return renderActivity("meetings");
  if (route === "/activity/insights")  return renderActivity("insights");
  if (route === "/conducted") return renderConductedMeetings();
  if (route === "/profile")  return renderProfile();
  if (route === "/settings") return renderSettings();
  if (route === "/join")          return renderJoin("start");
  if (route === "/join/scan")     return renderJoin("scan");
  if (route === "/join/id")       return renderJoin("id");
  if (route === "/join/preview")  return renderJoin("preview");
  if (route === "/join/waiting")  return renderJoin("waiting");
  if (route === "/join/invalid")  return renderJoin("invalid");
  if (route === "/joining")  return renderJoining();
  if (route === "/meetings/create")         return renderCreate("type");
  if (route === "/meetings/create/details") return renderCreate("details");
  if (route === "/meetings/create/invite")  return renderCreate("invite");
  if (route === "/meetings/create/review")  return renderCreate("review");
  if (route === "/meetings/created")        return renderCreate("done");
  if (route === "/audience") {
    if (state.isHost) { go("/moderator"); return; }
    return renderAudience();
  }
  if (route === "/moderator" || route === "/speaker") {
    if (!state.isHost) { go("/audience"); return; }
    return route === "/moderator" ? renderModerator() : renderSpeaker();
  }
  if (route === "/analytics")   return renderAnalytics();
  if (route.startsWith("/question/")) return renderQuestionDetail(route.split("/").pop());
  if (route === "/notifications") return renderNotifications();
  renderHome();
}

loadData().then(render).catch(error => {
  app.innerHTML = `
    <main class="content" style="display:grid;place-items:center;min-height:100vh">
      <section class="panel" style="max-width:400px;text-align:center;padding:40px">
        <div class="big-mark" style="margin:0 auto 18px;background:linear-gradient(135deg,#e54040,#ff6b6b)">${icons.helpCircle}</div>
        <h1 class="screen-title">Unable to load app</h1>
        <p class="subtle" style="margin:8px 0 18px">${error.message}</p>
        <button class="btn" onclick="location.reload()">Retry</button>
      </section>
    </main>
  `;
});
