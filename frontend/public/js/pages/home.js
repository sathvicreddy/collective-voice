/* ============================================================
   Home Page — Desktop matches design image exactly
   ============================================================ */
import { icons } from "../utils/icons.js";
import { state } from "../state.js";
import { go } from "../utils/api.js";
import { shell, phone, meetingCard } from "../components/shared.js";

export function renderHome() {
  const data = state.home;
  const user = state.profile?.user || {};
  const userName = user.name ? user.name.split(" ")[0] : "there";
  const userInitials = (user.name || "G")
    .split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const live = data?.live;
  const notifCount = state.notifications?.length || 0;

  /* ---- Mobile content (phone frame) ---- */
  const mobileContent = `
    <h1 class="screen-title">Hello, ${userName}! 👋</h1>
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
        <span class="subtle">${live ? live.participants || 0 : 0} joined</span>
      </div>
      <h2 style="font-size:16px;font-weight:700">${live ? live.title : 'No live session'}</h2>
      <p class="subtle">${icons.user} Speaker: ${live ? (live.speaker || 'Host') : '—'}</p>
      <div class="row">
        <span class="subtle">${icons.clock} Started 10 min ago</span>
        ${live ? `<button class="btn small" onclick="homejoinLive('${live.id}')">${icons.arrowRight} Join Now</button>`
          : `<button class="btn small" onclick="go('/meetings/create')">${icons.plus} Create</button>`}
      </div>
    </section>

    <div class="section-header">
      <h2 class="screen-title">Upcoming Meetings</h2>
      <button class="link-btn" onclick="go('/meetings')">View all</button>
    </div>
    <div class="stack">${(data.upcoming || []).slice(0, 3).map(m => meetingCard(m)).join("")}</div>

    <div class="empty-space"></div>

    <div class="section-header">
      <h2 class="screen-title">Recent Activity</h2>
      <button class="link-btn" onclick="go('/activity')">View all</button>
    </div>
    <article class="list-card row">
      <div class="icon-box green">${icons.thumbsUp}</div>
      <div style="flex:1">
        <h3 style="font-size:14px;font-weight:600">Your question received 12 upvotes</h3>
        <p class="subtle">${data.recentActivity?.text || "How can AI be used ethically in education?"}</p>
      </div>
      <span class="subtle">2m ago</span>
    </article>
  `;

  /* ---- Desktop main column ---- */
  const desktopMain = `
    <div class="home-desktop-main">
      <!-- Greeting -->
      <div class="home-greeting">
        <h1 class="home-greeting-title">Hello, ${userName}! 👋</h1>
        <p class="home-greeting-sub">Welcome back! Let's make conversations count.</p>
      </div>

      <!-- Quick Action Cards -->
      <div class="home-quick-grid">
        ${[
      { icon: icons.messageCircle, label: "My Questions", sub: "View, track & manage your questions", route: "/activity", tone: "" },
      { icon: icons.calendar, label: "Meetings", sub: "Explore upcoming, live & past meetings", route: "/meetings", tone: "orange" },
      { icon: icons.activity, label: "Activity", sub: "Track your engagement and impact", route: "/activity", tone: "blue" },
      { icon: icons.user, label: "Profile", sub: "Manage your profile and preferences", route: "/profile", tone: "green" }
    ].map(c => `
          <button class="home-quick-card" onclick="go('${c.route}')">
            <div class="icon-box ${c.tone}">${c.icon}</div>
            <div class="home-quick-card-body">
              <strong>${c.label}</strong>
              <p>${c.sub}</p>
            </div>
            <span class="home-quick-arrow">${icons.arrowRight}</span>
          </button>
        `).join("")}
      </div>

      <!-- Live Now Banner -->
      ${live ? `
      <div class="home-live-banner">
        <div class="home-live-left">
          <div class="home-live-top-row">
            <span class="badge success"><span class="live-dot"></span> Live Now</span>
          </div>
          <h2 class="home-live-title">${live.title}</h2>
          <p class="home-live-speaker">Speaker: ${live.speaker || "Host"}</p>
          <div class="home-live-meta">
            <span>${icons.users} ${live.participants || 0} joined</span>
            <span>${icons.clock} Session active</span>
          </div>
        </div>
        <div class="home-live-right">
          <div class="home-live-chart">
            ${[40, 55, 65, 50, 72, 68, 80, 75, 85].map((h, i) => `
              <div class="home-live-bar" style="height:${h * 0.7}px;opacity:${0.4 + i * 0.07}"></div>
            `).join("")}
          </div>
          <button class="btn home-live-join-btn" onclick="homejoinLive('${live.id}')">Join Now</button>
        </div>
      </div>
      ` : `
      <div class="home-live-banner" style="background:linear-gradient(135deg,#f1f5f9,#e8eaf6);border:1px dashed #c7d2fe">
        <div class="home-live-left">
          <div class="home-live-top-row"><span class="badge" style="background:#f1f5f9;color:#6b7280">No Live Session</span></div>
          <h2 class="home-live-title" style="color:#6b7280">No meeting is live right now</h2>
          <p class="home-live-speaker" style="color:#9ca3af">Create or join a meeting when it starts</p>
        </div>
        <div class="home-live-right">
          <button class="btn home-live-join-btn" onclick="go('/meetings/create')">Create Meeting</button>
        </div>
      </div>
      `}

      <!-- Upcoming Meetings -->
      <div class="home-section-header">
        <h2 class="home-section-title">Upcoming Meetings</h2>
        <button class="link-btn" onclick="go('/meetings')">View all</button>
      </div>
      <div class="home-meetings-list">
        ${(data.upcoming || []).slice(0, 3).map(m => `
          <div class="home-meeting-row">
            <div class="icon-box" style="background:#ede9ff;color:#5b34ff">${icons.calendar}</div>
            <div class="home-meeting-info">
              <strong>${m.title}</strong>
              <div class="home-meeting-meta">
                <span>${icons.calendar} ${m.date}</span>
                <span style="margin:0 6px">•</span>
                <span>${m.time}</span>
              </div>
              <div class="home-meeting-meta">
                <span>${icons.users} ${m.participants || 0} participants</span>
              </div>
            </div>
            <span class="home-meeting-badge ${m.status === 'live' ? 'live' : ''}">${m.startsIn || m.status || 'Upcoming'}</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;

  /* ---- Desktop right panel ---- */
  const desktopRight = `
    <div class="home-right-panel">
      <!-- Recent Activity -->
      <div class="home-panel-card">
        <div class="home-panel-header">
          <span class="home-panel-title">Recent Activity</span>
          <button class="link-btn" onclick="go('/activity')">View all</button>
        </div>
        <div class="home-activity-list">
          ${[
      { icon: icons.checkCircle, tone: "green", title: "Your question received 12 upvotes", sub: "How can AI be used ethically in education?", time: "2m ago" },
      { icon: icons.arrowUp, tone: "orange", title: "You upvoted a question", sub: "What are the long-term impacts of remote learning?", time: "15m ago" },
      { icon: icons.calendar, tone: "blue", title: "You joined a meeting", sub: "Future of Remote Learning", time: "1h ago" },
      { icon: icons.user, tone: "", title: "You registered for a meeting", sub: "Data Privacy in EdTech", time: "Yesterday" }
    ].map(a => `
            <div class="home-activity-item">
              <div class="icon-box ${a.tone}" style="width:34px;height:34px;flex-shrink:0">${a.icon}</div>
              <div class="home-activity-body">
                <p class="home-activity-title">${a.title}</p>
                <p class="home-activity-sub">${a.sub}</p>
              </div>
              <span class="home-activity-time">${a.time}</span>
            </div>
          `).join("")}
        </div>
      </div>

      <!-- Stay Updated -->
      <div class="home-panel-card">
        <p class="home-panel-title" style="margin-bottom:8px">Stay Updated</p>
        <p class="subtle" style="font-size:13px;line-height:1.5;margin-bottom:16px">Get notified about upcoming meetings and live sessions.</p>
        <button class="btn secondary" style="width:100%;justify-content:space-between" onclick="go('/notifications')">
          <span style="display:flex;align-items:center;gap:8px">${icons.bell} Manage Notifications</span>
          ${icons.arrowRight}
        </button>
      </div>
    </div>
  `;

  /* ---- Assemble with shell ---- */
  shell(
    /* mobile phone frame */
    phone(mobileContent, "home"),
    /* desktop custom layout replaces the default right panel */
    "",
    /* pass both columns for the home desktop override */
    desktopMain,
    desktopRight
  );
}

/** Called by "Join Now" on the home live banner.
 *  Sets state.joinTarget so the join preview screen has meeting info. */
export function homejoinLive(meetingId) {
  const m = state.meetings?.find(x => x.id === meetingId)
    || (state.home?.live?.id === meetingId ? state.home.live : null);
  if (m) { state.joinTarget = m; state.isHost = false; }
  go('/join/preview');
}
