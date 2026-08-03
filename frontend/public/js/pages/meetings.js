/* ============================================================
   Meetings Pages — List, Join Flow, Create Flow
   Desktop: two-column layout matching the Meetings design image
   Mobile: phone frame with tabs (unchanged)
   ============================================================ */
import { icons } from "../utils/icons.js";
import { state } from "../state.js";
import { go } from "../utils/api.js";
import { shell, phone, meetingCard, desktopTopbar } from "../components/shared.js";

/* ---- Countdown helper (static display) ---- */
function countdown(minutes, seconds) {
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return `${mm}:${ss}`;
}

/* ---- Copy meeting link to clipboard ---- */
async function copyMeetingLink(meetingId) {
  try {
    // Fetch the meeting to get its join code
    const res  = await fetch(`/api/sessions/${meetingId}/qrcode`);
    // The server sets X-Join-Link header for convenience
    const link = res.headers.get("X-Join-Link");
    if (!link) throw new Error("No link header");
    await navigator.clipboard.writeText(link);
    // Brief visual feedback on the button
    const btn = document.querySelector(`#copy-link-btn-${meetingId}`);
    if (btn) {
      const orig = btn.innerHTML;
      btn.innerHTML = "✓ Copied!";
      btn.style.color = "var(--success)";
      setTimeout(() => { btn.innerHTML = orig; btn.style.color = ""; }, 2000);
    }
  } catch {
    // Fallback: build link from known code (if meeting is in state)
    const m = window.state?.meetings?.find(m => m.id === meetingId);
    const link = m ? `${location.origin}/#/join/${m.code}` : location.origin;
    navigator.clipboard.writeText(link).catch(() => prompt("Copy this link:", link));
  }
}
/* ---- Copy invite link (used on the create/invite step before meeting is created) ---- */
async function copyInviteLink() {
  // After createMeeting() runs, state.joinTarget has the real meeting.
  // Before that (still on invite step), build a placeholder message.
  const m = state.joinTarget;
  let link;
  if (m?.code) {
    link = `${location.origin}/#/join/${m.code}`;
  } else {
    link = `${location.origin}/#/join/(code will appear after creation)`;
  }
  // Update the input so the user can see it
  const input = document.querySelector("#inviteLinkInput");
  if (input) input.value = link;
  try {
    await navigator.clipboard.writeText(link);
    const btn = document.querySelector("[onclick='copyInviteLink()']");
    if (btn) { const orig = btn.innerHTML; btn.innerHTML = "✓ Copied!"; setTimeout(() => { btn.innerHTML = orig; }, 1500); }
  } catch { prompt("Copy this link:", link); }
}
window.copyInviteLink = copyInviteLink;


/* ============================================================
   Meetings List (main export)
   ============================================================ */
export function renderMeetings() {
  // Use user-specific lists (enrolled + owned) so each user only sees
  // meetings they have joined or created.
  const myMtgs   = state.myMeetings;
  const ongoing  = myMtgs.live.length ? myMtgs.live : state.meetings.filter(m => m.status === "live");
  const upcoming = (myMtgs.upcoming.length ? myMtgs.upcoming : state.meetings.filter(m => m.status === "upcoming" || m.status === "scheduled"))
    .sort((a, b) => new Date(a.scheduledAt || a.date || 0) - new Date(b.scheduledAt || b.date || 0));
  const conducted = myMtgs.past.length ? myMtgs.past : state.meetings.filter(m => m.status === "conducted" || m.status === "past");
  const expired   = myMtgs.expired || [];

  // Only set liveMeeting if there is genuinely a live meeting
  const liveMeeting = ongoing[0] || null;

  // Format a meeting's date + time from API fields for display
  function fmtMtg(m) {
    // API may return m.date as ISO string or "YYYY-MM-DD", m.time as "HH:MM"
    let dateStr = "—", timeStr = "—";
    const raw = m.scheduledAt || m.date || m.createdAt;
    if (raw) {
      const d = new Date(raw);
      if (!isNaN(d)) {
        dateStr = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
        // If there's an explicit time field use it, else derive from timestamp
        if (m.time) {
          timeStr = m.time;
        } else if (m.scheduledAt || m.createdAt) {
          timeStr = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true });
        }
      }
    } else if (m.date) {
      dateStr = m.date;
      timeStr = m.time || "—";
    }
    return { dateStr, timeStr };
  }

  /** Grace period countdown banner — shown on host's overdue upcoming meetings */
  function graceBanner(m) {
    if (!m._graceActive && !m.graceEndsAt) return "";
    const endsAt    = new Date(m.graceEndsAt);
    const msLeft    = Math.max(0, endsAt - Date.now());
    const minsLeft  = Math.floor(msLeft / 60000);
    const secsLeft  = Math.floor((msLeft % 60000) / 1000);
    const countStr  = `${String(minsLeft).padStart(2, "0")}:${String(secsLeft).padStart(2, "0")}`;
    return `
      <div class="grace-banner" style="
        background:linear-gradient(135deg,#ff8a2a22,#ffb36622);
        border:1px solid #ff8a2a55;
        border-radius:10px;
        padding:12px 16px;
        margin-top:10px;
        font-size:13px;
      ">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-weight:700;color:#ff8a2a">⏱ Meeting Overdue</span>
          <span style="font-family:monospace;font-weight:700;color:#ff8a2a" id="grace-cd-${m.id}">${countStr}</span>
        </div>
        <p style="color:var(--ink-secondary);margin-bottom:10px;font-size:12px">Grace period — start now or choose an option.</p>
        <div style="display:flex;gap:8px">
          <button class="btn small" style="flex:1;font-size:12px"
            onclick="extendMeeting('${m.id}', 30)">
            ⏱ Extend 30 min
          </button>
          <button class="btn secondary small" style="flex:1;font-size:12px"
            onclick="showRescheduleDialog('${m.id}')">
            📅 Reschedule
          </button>
        </div>
      </div>
    `;
  }

  /* ---- Mobile phone frame ---- */
  const mobileContent = `
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
      ${upcoming.length ? upcoming.map(m => meetingCard(m) + graceBanner(m)).join("") : `<p class="subtle" style="padding:16px 0;text-align:center">No upcoming meetings yet.<br><small>Scan a QR code or enter a meeting ID to add one.</small></p>`}
      <div class="section-header"><h2 class="screen-title">Conducted Meetings</h2><button class="link-btn" onclick="go('/conducted')">View all</button></div>
      ${conducted.slice(0,1).map(m => meetingCard(m, `<button class="btn secondary small" onclick="go('/analytics')">${icons.barChart} Analytics</button>`)).join("")}
    </div>
  `;

  /* ---- Desktop right panel ---- */
  const nextUpcoming = upcoming[0] || null;
  const rightPanelHtml = `
    <div class="mtg-right-panel">

      <!-- Live Now Banner OR Upcoming card -->
      ${liveMeeting ? `
      <div class="mtg-right-live-card">
        <div class="mtg-right-live-header">
          <span class="mtg-right-live-dot"><span class="live-dot"></span> Live Now</span>
          <span class="badge success" style="font-size:10px">${icons.radio} Live</span>
        </div>
        <div class="mtg-right-live-body">
          <div class="mtg-right-live-text">
            <h3 class="mtg-right-live-title">${liveMeeting.title}</h3>
            <p class="mtg-right-live-speaker">${liveMeeting.speaker || ""}</p>
            <div class="mtg-right-live-stats">
              <span>${icons.users} ${liveMeeting.participants || 0} participants</span>
            </div>
            <button class="btn mtg-right-join-btn" onclick="go('/join/preview')">Join Now ${icons.arrowRight}</button>
          </div>
          <div class="mtg-right-live-art">
            <svg viewBox="0 0 90 90" width="90" height="90" style="display:block;opacity:0.85">
              <ellipse cx="45" cy="72" rx="38" ry="10" fill="#c4b5ff" opacity="0.4"/>
              <circle cx="30" cy="58" r="10" fill="#a78bfa"/>
              <circle cx="45" cy="52" r="13" fill="#7c3aed"/>
              <circle cx="60" cy="58" r="10" fill="#a78bfa"/>
              <circle cx="18" cy="64" r="7"  fill="#c4b5ff"/>
              <circle cx="72" cy="64" r="7"  fill="#c4b5ff"/>
              <rect x="41" y="18" width="8" height="28" rx="4" fill="#5b34ff"/>
              <rect x="36" y="42" width="18" height="4" rx="2" fill="#5b34ff"/>
              <rect x="42" y="46" width="6" height="12" rx="2" fill="#5b34ff"/>
              <ellipse cx="45" cy="20" rx="8" ry="10" fill="#7c3aed"/>
              <rect x="43" y="58" width="4" height="8" rx="2" fill="#5b34ff"/>
            </svg>
          </div>
        </div>
      </div>
      ` : nextUpcoming ? `
      <div class="home-panel-card" style="border:1.5px solid #e0daff;background:linear-gradient(135deg,#f8f6ff,#fff)">
        <div class="home-panel-header">
          <span class="home-panel-title" style="color:#5b34ff">${icons.calendar} Next Scheduled</span>
        </div>
        <div style="padding:4px 0">
          <p style="font-size:14px;font-weight:700;color:#111936;margin:0 0 6px">${nextUpcoming.title}</p>
          <div style="display:flex;flex-direction:column;gap:5px;font-size:12px;color:#68708d">
            <span>${icons.calendar} ${fmtMtg(nextUpcoming).dateStr}</span>
            <span>${icons.clock} ${fmtMtg(nextUpcoming).timeStr}</span>
          </div>
          <button class="btn" style="margin-top:12px;width:100%" onclick="go('/meetings/create')">${icons.plus} Create Meeting</button>
        </div>
      </div>
      ` : `
      <div class="home-panel-card" style="text-align:center;padding:28px 16px">
        <div style="font-size:28px;margin-bottom:8px">📅</div>
        <p style="font-weight:700;color:#111936;margin:0 0 4px">No meetings today</p>
        <p style="font-size:12px;color:#68708d;margin:0 0 16px">Schedule a meeting to get started</p>
        <button class="btn" style="width:100%" onclick="go('/meetings/create')">${icons.plus} Create Meeting</button>
      </div>
      `}

      <!-- Recent Activity -->
      <div class="home-panel-card">
        <div class="home-panel-header">
          <span class="home-panel-title">Recent Activity</span>
          <button class="link-btn" onclick="go('/meetings')">View all</button>
        </div>
        <div class="home-activity-list">
          ${[
            { icon: icons.checkCircle, color: "green",  title: "Your question received 12 upvotes",       sub: "How can AI be used ethically in education?",    time: "2m ago"   },
            { icon: icons.thumbsUp,    color: "",        title: "You upvoted a question",                  sub: "What are the long-term impacts of remote learning?", time: "15m ago" },
            { icon: icons.calendar,    color: "blue",    title: "You joined a meeting",                    sub: "Future of Remote Learning",                     time: "1h ago"   },
            { icon: icons.user,        color: "",        title: "You registered for a meeting",            sub: "Data Privacy in EdTech",                        time: "Yesterday" }
          ].map(a => `
            <div class="home-activity-item">
              <div class="icon-box ${a.color}" style="width:32px;height:32px;flex-shrink:0">${a.icon}</div>
              <div class="home-activity-body">
                <p class="home-activity-title">${a.title}</p>
                <p class="home-activity-sub">${a.sub}</p>
              </div>
              <span class="home-activity-time">${a.time}</span>
            </div>
          `).join("")}
        </div>
      </div>

      <!-- Join via QR -->
      <div class="mtg-qr-card">
        <div class="mtg-qr-body">
          <div>
            <strong class="mtg-qr-title">Join a meeting in seconds</strong>
            <p class="mtg-qr-sub">Share this QR code to invite others.</p>
            ${liveMeeting?.id ? `
              <button id="copy-link-btn-${liveMeeting.id}" class="mtg-qr-btn"
                onclick="copyMeetingLink('${liveMeeting.id}')">
                ${icons.link} Copy Link
              </button>
              <button class="mtg-qr-btn" style="margin-top:6px"
                onclick="shareMeetingQR('${liveMeeting.id}')">
                ${icons.share} Share QR Code
              </button>
            ` : `<p class="subtle" style="font-size:12px">No live meeting to share.</p>`}
          </div>
          <div class="mtg-qr-img">
            ${liveMeeting?.id
              ? `<img src="/api/sessions/${liveMeeting.id}/qrcode"
                      alt="Join ${liveMeeting.title}"
                      width="100" height="100"
                      style="border-radius:6px;background:#fff;padding:4px;display:block"
                      onerror="this.style.display='none'">`
              : `<div style="width:100px;height:100px;border-radius:6px;background:var(--soft);display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:11px">No meeting</div>`
            }
          </div>
        </div>
      </div>

    </div>
  `;

  // Combine into one full-width layout:
  // topbar spans the whole width, then a two-col grid sits below it
  const fullDesktop = `
    <div class="mtg-page-wrap">

      <!-- Full-width topbar -->
      <div class="mtg-topbar">
        <div class="mtg-topbar-left">
          <h1 class="mtg-page-title">Meetings</h1>
          <p class="mtg-page-sub">Create, join and manage your meetings with ease. <span class="mtg-title-wave">〰</span></p>
        </div>
        <div class="mtg-topbar-right">
          <div class="mtg-search-wrap">
            <span class="mtg-search-icon">${icons.search}</span>
            <input class="mtg-search-input" placeholder="Search meetings..."/>
          </div>
          <button class="mtg-filter-btn">${icons.filter} Filters</button>
          <div class="desktop-notif-btn">
            ${icons.bell}
            <span class="desktop-notif-badge">3</span>
          </div>
          <div class="desktop-user-pill" onclick="go('/profile')">
            ${(() => {
              const u = state.profile?.user || {};
              const name = u.name || "Guest";
              const initials = name.split(" ").map(w => w[0] || "").join("").slice(0, 2).toUpperCase() || "G";
              return `
                <div class="desktop-avatar">${initials}</div>
                <div class="desktop-user-info">
                  <span class="desktop-user-name">${name}</span>
                  <span class="desktop-user-role">${state.isHost ? "Host" : "Member"}</span>
                </div>
              `;
            })()}
            ${icons.chevronDown}
          </div>
        </div>
      </div>

      <!-- Two-column body below topbar -->
      <div class="mtg-body-grid">

        <!-- Left: meetings content -->
        <div class="mtg-left-col">
          <!-- CTA Cards -->
          <div class="mtg-cta-row">
            <button class="mtg-cta-card mtg-cta-create" onclick="go('/meetings/create')">
              <div class="mtg-cta-icon">${icons.plus}</div>
              <div class="mtg-cta-body">
                <strong>Create Meeting</strong>
                <p>Start a new meeting instantly<br>or schedule for later.</p>
              </div>
              <div class="mtg-cta-arrow">${icons.arrowRight}</div>
            </button>
            <button class="mtg-cta-card mtg-cta-join" onclick="go('/join')">
              <div class="mtg-cta-icon">${icons.arrowRight}</div>
              <div class="mtg-cta-body">
                <strong>Join Meeting</strong>
                <p>Enter a meeting code<br>or scan QR to join.</p>
              </div>
              <div class="mtg-cta-arrow">${icons.arrowRight}</div>
            </button>
          </div>

          <!-- Tabs -->
          <div class="mtg-tabs" id="mtgTabBar">
            <button class="mtg-tab mtg-tab-active" onclick="mtgSwitchTab('upcoming', this)">
              ${icons.calendar} Upcoming <span class="mtg-tab-count">${upcoming.length}</span>
            </button>
            <button class="mtg-tab" onclick="mtgSwitchTab('ongoing', this)">
              ${icons.radio} Ongoing <span class="mtg-tab-count">${ongoing.length}</span>
            </button>
            <button class="mtg-tab" onclick="mtgSwitchTab('past', this)">
              ${icons.clock} Past <span class="mtg-tab-count">${conducted.length}</span>
            </button>
          </div>

          <!-- Live Featured Card (ongoing tab only) -->
          <div id="mtgLiveCard" style="display:${ongoing.length ? 'block' : 'none'}">
            ${liveMeeting ? `
            <div class="mtg-live-card">
              <div class="mtg-live-badge"><span class="live-dot"></span> LIVE NOW</div>
              <div class="mtg-live-content">
                <div class="mtg-live-icon-wrap"><div class="mtg-live-icon">${icons.zap}</div></div>
                <div class="mtg-live-info">
                  <h2 class="mtg-live-title">${liveMeeting.title}</h2>
                  <div class="mtg-live-speaker">${liveMeeting.speaker || "Dr. Sarah Johnson"}<span class="mtg-speaker-badge">Speaker</span></div>
                  <div class="mtg-live-meta">
                    <span>${icons.calendar} ${liveMeeting.date}</span>
                    <span>${icons.clock} ${liveMeeting.time}</span>
                    <span>${icons.users} ${liveMeeting.participants || 0} participants</span>
                  </div>
                </div>
              </div>
              <div class="mtg-live-right">
                <div class="mtg-live-timer">ENDS IN <span class="mtg-timer-val">${countdown(19, 24)}</span></div>
                <button class="btn mtg-join-btn" onclick="go('/join/preview')">${icons.arrowRight} Join Now</button>
                <button class="mtg-more-btn">${icons.moreVertical}</button>
              </div>
            </div>
            ` : ""}
          </div>

          <!-- Meeting list panes -->
          <div class="mtg-list-card" id="mtgListPanel">
            <div id="mtgPane-upcoming">
              ${upcoming.length === 0 ? `
                <div class="mtg-empty-state">
                  <div class="mtg-empty-icon">${icons.calendar}</div>
                  <p class="mtg-empty-title">No upcoming meetings</p>
                  <p class="mtg-empty-sub">Create a new meeting to get started.</p>
                  <button class="btn" style="margin-top:12px" onclick="go('/meetings/create')">${icons.plus} Create Meeting</button>
                </div>
              ` : upcoming.map(m => { const { dateStr, timeStr } = fmtMtg(m); return `
                <div class="mtg-list-row" style="cursor:pointer" onclick="openMeetingDetail('${m.id}')">
                  <div class="icon-box" style="width:38px;height:38px;flex-shrink:0">${icons.calendar}</div>
                  <div class="mtg-list-info">
                    <strong class="mtg-list-title">${m.title}</strong>
                    <div class="mtg-list-meta">
                      <span>${icons.calendar} ${dateStr}</span>
                      <span>${icons.clock} ${timeStr}</span>
                      <span>${icons.users} ${m.participants || 0} participants</span>
                    </div>
                  </div>
                  <div class="mtg-list-actions">
                    <span class="mtg-time-badge ${m.badge === 'In 2h' ? 'soon' : ''}">${m.badge || "Upcoming"}</span>
                    <button class="mtg-more-btn" onclick="event.stopPropagation()">${icons.moreVertical}</button>
                  </div>
                </div>
              `; }).join("")}
            </div>

            <div id="mtgPane-ongoing" style="display:none">
              ${ongoing.length === 0 ? `
                <div class="mtg-empty-state">
                  <div class="mtg-empty-icon">${icons.radio}</div>
                  <p class="mtg-empty-title">No ongoing meetings</p>
                  <p class="mtg-empty-sub">Start or join a live meeting to see it here.</p>
                </div>
              ` : ongoing.map(m => { const { dateStr, timeStr } = fmtMtg(m); return `
                <div class="mtg-list-row" style="cursor:pointer" onclick="openMeetingDetail('${m.id}')">
                  <div class="icon-box green" style="width:38px;height:38px;flex-shrink:0">${icons.radio}</div>
                  <div class="mtg-list-info">
                    <strong class="mtg-list-title">${m.title}</strong>
                    <div class="mtg-list-meta">
                      <span>${icons.calendar} ${dateStr}</span>
                      <span>${icons.clock} ${timeStr}</span>
                      <span>${icons.users} ${m.participants || 0} participants</span>
                    </div>
                  </div>
                  <div class="mtg-list-actions">
                    <span class="badge success"><span class="live-dot"></span> Live</span>
                    <button class="btn small" onclick="event.stopPropagation();openMeetingDetail('${m.id}')">${icons.arrowRight} Join</button>
                  </div>
                </div>
              `; }).join("")}
            </div>

            <div id="mtgPane-past" style="display:none">
              ${conducted.length === 0 ? `
                <div class="mtg-empty-state">
                  <div class="mtg-empty-icon">${icons.clock}</div>
                  <p class="mtg-empty-title">No past meetings yet</p>
                  <p class="mtg-empty-sub">Your completed meetings will appear here.</p>
                </div>
              ` : conducted.map(m => { const { dateStr, timeStr } = fmtMtg(m); return `
                <div class="mtg-list-row">
                  <div class="icon-box" style="width:38px;height:38px;flex-shrink:0;background:#f5f3ff;color:#6366f1">${icons.checkCircle}</div>
                  <div class="mtg-list-info">
                    <strong class="mtg-list-title">${m.title}</strong>
                    <div class="mtg-list-meta">
                      <span>${icons.calendar} ${dateStr}</span>
                      <span>${icons.clock} ${timeStr}</span>
                      <span>${icons.users} ${m.participants || 0} participants</span>
                    </div>
                  </div>
                  <div class="mtg-list-actions">
                    <span class="mtg-time-badge">Completed</span>
                    <button class="mtg-outline-action" onclick="openReport('${m.id}')">${icons.barChart} Report</button>
                  </div>
                </div>
              `; }).join("")}
              <div class="mtg-view-all" onclick="go('/conducted')">
                View all conducted meetings ${icons.chevronDown}
              </div>
            </div>
          </div>
        </div>

        <!-- Right: side panel -->
        <div class="mtg-right-col">
          ${rightPanelHtml}
        </div>

      </div>
    </div>
  `;

  shell(
    phone(mobileContent, "meetings"),
    "",
    fullDesktop,   // single full-width column — topbar + two-col grid inside
    ""             // no separate right col from shell
  );


  // Register tab switch handler globally
  window.mtgSwitchTab = function(tab, btn) {
    // Update active tab button
    document.querySelectorAll("#mtgTabBar .mtg-tab").forEach(t => t.classList.remove("mtg-tab-active"));
    if (btn) btn.classList.add("mtg-tab-active");

    // Show/hide panes
    ["upcoming", "ongoing", "past"].forEach(id => {
      const pane = document.getElementById(`mtgPane-${id}`);
      if (pane) pane.style.display = id === tab ? "block" : "none";
    });

    // Show/hide the live card when on "ongoing" tab
    const liveCard = document.getElementById("mtgLiveCard");
    if (liveCard) liveCard.style.display = tab === "ongoing" ? "block" : "none";
  };
}

/* --- Join Flow --------------------------------------------- */

export function renderJoin(step = "start") {
  // Use the meeting looked-up via code, fall back to first meeting for demo
  const meeting = state.joinTarget || state.meetings[0] || {};
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
      <p class="subtle">Point your camera at a CollectiveVoice QR code to join instantly.</p>
      <div class="qr-frame" style="position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden">
        <video id="cv-qr-video" autoplay playsinline muted
               style="width:100%;max-width:260px;border-radius:12px;background:#000"></video>
        <canvas id="cv-qr-canvas" style="display:none"></canvas>
        <div id="cv-qr-overlay" style="position:absolute;bottom:8px;left:0;right:0;text-align:center">
          <span id="cv-qr-status" style="background:rgba(0,0,0,.55);color:#fff;font-size:12px;padding:4px 10px;border-radius:20px">
            Starting camera…
          </span>
        </div>
      </div>
      <div class="stack" style="gap:10px;margin-top:16px">
        <button class="btn secondary" style="width:100%" onclick="go('/join/id')">${icons.hash} Enter ID Instead</button>
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
    preview: (() => {
      /* Build speaker initials avatar */
      const speakerName = meeting.speaker || "Host";
      const speakerInitials = speakerName.split(" ").map(w => w[0] || "").join("").slice(0, 2).toUpperCase() || "H";
      const participantCount = meeting.participants || 0;

      /* Avatar colours for the overlapping participant circles */
      const avatarColors = ["#7c3aed","#2563eb","#059669","#d97706","#dc2626","#7c3aed","#0891b2"];
      const avatarLetters = ["A","B","C","D","E","F"];
      const shownAvatars = avatarLetters.slice(0, Math.min(5, participantCount));

      /* Mobile phone content */
      const mobileHtml = `
        <div class="jp-page">
          <div class="jp-hero">
            <div class="jp-hero-pattern"></div>
            <div class="jp-live-badge"><span class="jp-live-dot"></span> Live Now</div>
            <h1 class="jp-hero-title">${meeting.title || "Live Meeting"}</h1>
            <div class="jp-hero-speaker">
              <div class="jp-speaker-avatar">${speakerInitials}</div>
              <div class="jp-speaker-info">
                <span class="jp-speaker-name">${speakerName}</span>
                <span class="jp-speaker-role">Moderator</span>
              </div>
            </div>
            <div class="jp-hero-stats">
              <span class="jp-stat">${icons.users} ${participantCount} participants</span>
              ${meeting.duration ? `<span class="jp-stat">${icons.clock} ${meeting.duration}</span>` : ""}
              ${meeting.date ? `<span class="jp-stat">${icons.calendar} ${meeting.date}</span>` : ""}
            </div>
          </div>

          <div class="jp-info-card">
            <div class="jp-info-rows">
              ${meeting.time ? `
              <div class="jp-info-row">
                <div class="jp-info-icon">${icons.clock}</div>
                <div><div class="jp-info-label">Time</div><div class="jp-info-value">${meeting.time}</div></div>
              </div>` : ""}
              ${meeting.duration ? `
              <div class="jp-info-row">
                <div class="jp-info-icon">${icons.calendar}</div>
                <div><div class="jp-info-label">Duration</div><div class="jp-info-value">${meeting.duration}</div></div>
              </div>` : ""}
              <div class="jp-info-row">
                <div class="jp-info-icon">${icons.users}</div>
                <div><div class="jp-info-label">Participants</div><div class="jp-info-value">${participantCount} joined</div></div>
              </div>
            </div>

            <div class="jp-role-chip">
              <div class="icon-box" style="width:32px;height:32px;flex-shrink:0">${icons.users}</div>
              <div>
                <div class="jp-role-label">You are joining as</div>
                <div class="jp-role-value">Audience</div>
              </div>
            </div>

            ${meeting.description ? `<p class="jp-desc">${meeting.description}</p>` : ""}
          </div>

          ${shownAvatars.length > 0 ? `
          <div class="jp-participants">
            <div class="jp-participants-label">Who's inside</div>
            <div class="jp-avatars">
              ${shownAvatars.map((l, i) => `<div class="jp-avatar-circle" style="background:${avatarColors[i % avatarColors.length]}">${l}</div>`).join("")}
              ${participantCount > 5 ? `<div class="jp-avatar-circle jp-avatar-more">+${participantCount - 5}</div>` : ""}
            </div>
          </div>` : ""}

          <div class="jp-actions">
            <button class="jp-join-btn" onclick="go('/joining')">${icons.arrowRight} Join Now</button>
            <button class="jp-back-btn" onclick="history.back()">← Back</button>
          </div>
        </div>
      `;

      /* Desktop left panel — large gradient hero */
      const desktopLeft = `
        <div class="jp-desktop-left">
          <div class="jp-desktop-hero-content">
            <div class="jp-live-badge" style="margin-bottom:22px"><span class="jp-live-dot"></span> Live Now</div>
            <h1 class="jp-desktop-title">${meeting.title || "Live Meeting"}</h1>
            <p class="jp-desktop-sub">${meeting.description || "Join this live meeting to participate in the conversation and ask questions."}</p>
            <div class="jp-desktop-stats">
              <div class="jp-desktop-stat">
                <span class="jp-desktop-stat-val">${participantCount}</span>
                <span class="jp-desktop-stat-label">Participants</span>
              </div>
              ${meeting.duration ? `
              <div class="jp-desktop-stat">
                <span class="jp-desktop-stat-val">${meeting.duration}</span>
                <span class="jp-desktop-stat-label">Duration</span>
              </div>` : ""}
            </div>
          </div>
          <div class="jp-desktop-avatars">
            ${shownAvatars.map((l, i) => `<div class="jp-desktop-avatar" style="background:${avatarColors[i % avatarColors.length]}">${l}</div>`).join("")}
            ${participantCount > 5 ? `<span class="jp-desktop-avatar-label">+${participantCount - 5} more joined</span>` : participantCount > 0 ? `<span class="jp-desktop-avatar-label">are inside</span>` : ""}
          </div>
        </div>
      `;

      /* Desktop right panel — detail card */
      const desktopRight = `
        <div class="jp-desktop-right">
          <div class="jp-desktop-card">
            <div class="jp-desktop-card-header">
              <div class="jp-desktop-card-title">Meeting Details</div>
              <div class="jp-desktop-detail-rows">
                <div class="jp-desktop-detail-row">
                  <div class="jp-desktop-detail-icon">${icons.user}</div>
                  <div>
                    <div class="jp-desktop-detail-label">Speaker / Moderator</div>
                    <div class="jp-desktop-detail-value">${speakerName}</div>
                  </div>
                </div>
                ${meeting.date ? `
                <div class="jp-desktop-detail-row">
                  <div class="jp-desktop-detail-icon">${icons.calendar}</div>
                  <div>
                    <div class="jp-desktop-detail-label">Date</div>
                    <div class="jp-desktop-detail-value">${meeting.date}</div>
                  </div>
                </div>` : ""}
                ${meeting.time ? `
                <div class="jp-desktop-detail-row">
                  <div class="jp-desktop-detail-icon">${icons.clock}</div>
                  <div>
                    <div class="jp-desktop-detail-label">Time</div>
                    <div class="jp-desktop-detail-value">${meeting.time}${meeting.duration ? ` · ${meeting.duration}` : ""}</div>
                  </div>
                </div>` : ""}
                <div class="jp-desktop-detail-row">
                  <div class="jp-desktop-detail-icon">${icons.users}</div>
                  <div>
                    <div class="jp-desktop-detail-label">Participants</div>
                    <div class="jp-desktop-detail-value">${participantCount} joined</div>
                  </div>
                </div>
              </div>
            </div>
            <div class="jp-desktop-card-body">
              <div class="jp-desktop-role">
                <div class="icon-box" style="width:32px;height:32px;flex-shrink:0">${icons.users}</div>
                <div>
                  <div class="jp-role-label">You are joining as</div>
                  <div class="jp-role-value">Audience</div>
                </div>
              </div>
              <button class="jp-desktop-join-btn" onclick="go('/joining')">${icons.arrowRight} Join Now</button>
              <button class="jp-desktop-back-btn" onclick="history.back()">← Back to Meetings</button>
            </div>
          </div>
        </div>
      `;

      return { mobile: mobileHtml, desktopLeft, desktopRight };
    })(),
    waiting: (() => {
      const meetingId = state.joinTarget?.id || "";
      const waitingHtml = `
        <div class="center-screen" style="text-align:center" id="cv-waiting-room">
          <div class="logo-hero">
            <div class="big-mark" style="background:linear-gradient(135deg,#ff8a2a,#ffb366)">${icons.clock}</div>
            <div>
              <h1 class="screen-title">Meeting Not Started Yet</h1>
              <p class="subtle" style="max-width:260px;margin:6px auto 0">Waiting for the host to start. You'll be notified automatically.</p>
            </div>
          </div>
          ${meetingCard(meeting)}
          <div id="cv-waiting-actions" style="margin-top:16px">
            <button class="btn" id="cv-waiting-join-btn" style="width:100%;opacity:0.4;pointer-events:none" disabled
              onclick="go('/joining')">${icons.arrowRight} Join Now (waiting for host…)</button>
            <button class="btn secondary" style="width:100%;margin-top:8px" onclick="go('/meetings')">${icons.calendar} View Upcoming Meetings</button>
          </div>
        </div>
      `;
      // Attach WS listener after DOM is painted
      if (meetingId) {
        setTimeout(() => {
          const joinBtn = document.getElementById("cv-waiting-join-btn");
          function onMeetingStarted(e) {
            const d = e.detail || {};
            if (d.meetingId && d.meetingId !== meetingId) return;
            // Activate the Join button
            if (joinBtn) {
              joinBtn.disabled = false;
              joinBtn.style.opacity = "1";
              joinBtn.style.pointerEvents = "auto";
              joinBtn.innerHTML = `${icons.arrowRight} Meeting is Live — Join Now!`;
              joinBtn.style.background = "var(--success, #16a34a)";
            }
            document.removeEventListener("cv:meeting_started", onMeetingStarted);
            document.removeEventListener("cv:meeting_status_changed", onMeetingStarted);
          }
          document.addEventListener("cv:meeting_started", onMeetingStarted);
          document.addEventListener("cv:meeting_status_changed", onMeetingStarted);
        }, 0);
      }
      return waitingHtml;
    })(),
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
    `,
    expired: `
      <div class="center-screen" style="text-align:center">
        <div class="logo-hero">
          <div class="big-mark" style="background:linear-gradient(135deg,#6b6b6b,#aaa)">${icons.clock}</div>
          <div>
            <h1 class="screen-title">Meeting Expired</h1>
            <p class="subtle" style="max-width:260px;margin:6px auto 0">This meeting was not started within the grace period and has expired. Please contact the host to reschedule.</p>
          </div>
        </div>
        ${meeting.title ? `
        <section class="panel" style="margin:18px 0;padding:14px 18px;text-align:left">
          <strong>${meeting.title}</strong>
          <p class="subtle" style="font-size:12px;margin-top:4px">${meeting.date || ""} ${meeting.time || ""}</p>
        </section>` : ""}
        <div class="stack" style="gap:10px">
          <button class="btn" style="width:100%" onclick="go('/join')">${icons.arrowRight} Try Another Code</button>
          <button class="btn secondary" style="width:100%" onclick="go('/home')">${icons.home || icons.users} Go Home</button>
        </div>
      </div>
    `
  };

  // Preview step uses the new rich split layout; all others use the phone shell
  if (step === "preview") {
    const { mobile, desktopLeft, desktopRight } = screens.preview;
    const desktopMain = `
      <div class="jp-desktop-wrap">
        ${desktopLeft}
        ${desktopRight}
      </div>
    `;
    shell(phone(mobile, "meetings", true), "", desktopMain, "");
  } else {
    shell(phone(screens[step], "meetings", true));
  }
  // After the scan screen HTML is painted, start the camera RAF loop
  if (step === "scan") setTimeout(mountScanScreen, 0);
}

/* --- Joining Loading Screen -------------------------------- */
export function renderJoining() {
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
  // Auto-navigate after a brief connection animation so the participant
  // doesn't get stuck on the spinner if they don't click the button.
  setTimeout(() => { if (window.go) window.go("/audience"); }, 800);
}

/* --- Meeting Start Page (Host) ----------------------------- */
/**
 * Shown to the HOST when they click on one of their scheduled / live meetings
 * from the Meetings list. Provides the full-width rich UI with share options,
 * enrolled-participant count, QR code, settings summary and a prominent
 * "Start Meeting Now" / "Continue Meeting" CTA.
 */
export function renderMeetingStart() {
  // state.joinTarget is always set by openMeetingDetail() before navigating here
  const meeting = state.joinTarget || state.meetings[0] || {};

  /* ---- Derived display values ---- */
  const title       = meeting.title       || "Your Meeting";
  const description = meeting.description || "Share the link below to invite your participants.";
  const speakerName = meeting.speaker     || state.profile?.user?.name || "Host";
  const speakerInit = speakerName.split(" ").map(w => w[0] || "").join("").slice(0, 2).toUpperCase() || "H";
  const participants = meeting.participants || 0;
  const isLive      = meeting.status === "live";
  const joinLink    = meeting.code
    ? `${location.origin}/#/join/${meeting.code}`
    : `${location.origin}/#/join/...`;

  /* ---- Time formatting ---- */
  let displayDate = "—", displayTime = "—", displayDur = "—";
  const raw = meeting.scheduledAt || meeting.date || meeting.createdAt;
  if (raw) {
    const d = new Date(raw);
    if (!isNaN(d)) {
      displayDate = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      displayTime = meeting.time || d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true });
    }
  } else if (meeting.date) {
    displayDate = meeting.date;
    displayTime = meeting.time || "—";
  }
  if (meeting.duration) {
    const mins = Number(meeting.duration);
    if (mins < 60) displayDur = `${mins}m`;
    else { const h = Math.floor(mins / 60); const r = mins % 60; displayDur = r ? `${h}h ${r}m` : `${h}h`; }
  }

  /* ---- Countdown until scheduled time ---- */
  let countdownHtml = "";
  if (!isLive && raw) {
    const msUntil = new Date(raw) - Date.now();
    if (msUntil > 0) {
      const hrs  = Math.floor(msUntil / 3600000);
      const mins = Math.floor((msUntil % 3600000) / 60000);
      const secs = Math.floor((msUntil % 60000) / 1000);
      const timer = hrs > 0
        ? `${hrs}h ${String(mins).padStart(2,"0")}m`
        : `${String(mins).padStart(2,"0")}:${String(secs).padStart(2,"0")}`;
      countdownHtml = `
        <div class="ms-countdown-wrap">
          <span class="ms-countdown-label">Starts in</span>
          <span class="ms-countdown-timer" id="ms-countdown">${timer}</span>
        </div>
      `;
    }
  }

  /* ---- Avatar palette for enrolled participants ---- */
  const avatarColors = ["#7c3aed","#2563eb","#059669","#d97706","#dc2626","#0891b2"];
  const avatarLetters = ["A","B","C","D","E","F","G","H"];
  const shownAvatars = avatarLetters.slice(0, Math.min(6, participants));

  /* ---- Settings chips ---- */
  const cfg = meeting.settings || {};
  const settingChips = [
    { label: "Questions", on: cfg.allowQuestions !== false },
    { label: "Chat",      on: cfg.enableChat     !== false },
    { label: "Upvotes",   on: cfg.upvoteReact    !== false },
    { label: "Recording", on: !!cfg.recordMeeting }
  ];

  /* ==== MOBILE content ==== */
  const mobileHtml = `
    <div class="ms-page">
      <div class="ms-hero${isLive ? " ms-hero--live" : ""}">
        <div class="ms-hero-pattern"></div>
        <div class="ms-host-badge">${icons.user} Host</div>
        <h1 class="ms-hero-title">${title}</h1>
        <div class="ms-hero-meta">
          <span>${icons.calendar} ${displayDate}</span>
          <span>${icons.clock} ${displayTime}</span>
          ${displayDur !== "—" ? `<span>${icons.clock} ${displayDur}</span>` : ""}
        </div>
        ${countdownHtml}
      </div>

      <div class="ms-card">
        <!-- Meeting details -->
        <div class="ms-card-section">
          <div class="ms-section-label">Meeting Details</div>
          <div class="ms-detail-rows">
            <div class="ms-detail-row">
              <div class="ms-detail-icon">${icons.user}</div>
              <div><div class="ms-detail-label">Host</div><div class="ms-detail-value">${speakerName}</div></div>
            </div>
            <div class="ms-detail-row">
              <div class="ms-detail-icon">${icons.calendar}</div>
              <div><div class="ms-detail-label">Date</div><div class="ms-detail-value">${displayDate}</div></div>
            </div>
            <div class="ms-detail-row">
              <div class="ms-detail-icon">${icons.clock}</div>
              <div><div class="ms-detail-label">Time · Duration</div><div class="ms-detail-value">${displayTime} · ${displayDur}</div></div>
            </div>
          </div>
        </div>

        <!-- Enrolled participants -->
        <div class="ms-card-section">
          <div class="ms-section-label">Enrolled</div>
          <div class="ms-enrolled">
            <div class="ms-enrolled-left">
              <span class="ms-enrolled-count">${participants}</span>
              <span class="ms-enrolled-label">participant${participants !== 1 ? "s" : ""} registered</span>
            </div>
            <div class="ms-enrolled-avatars">
              ${shownAvatars.map((l, i) => `<div class="ms-enrolled-avatar" style="background:${avatarColors[i % avatarColors.length]}">${l}</div>`).join("")}
            </div>
          </div>
        </div>

        <!-- Share link -->
        <div class="ms-card-section">
          <div class="ms-section-label">Invite Participants</div>
          <div class="ms-share-row">
            <input class="ms-share-input" readonly value="${joinLink}" onclick="this.select()" id="ms-join-link-input">
            <button class="ms-share-copy-btn" id="ms-copy-btn"
              onclick="
                navigator.clipboard.writeText('${joinLink}').then(() => {
                  const b = document.getElementById('ms-copy-btn');
                  if (b) { const o = b.innerHTML; b.innerHTML = '✓ Copied!'; b.style.color='var(--success)'; setTimeout(() => { b.innerHTML = o; b.style.color=''; }, 1500); }
                }).catch(() => document.getElementById('ms-join-link-input')?.select());
              ">
              ${icons.link} Copy
            </button>
          </div>
          <div class="ms-share-icons">
            <button class="ms-share-icon-btn">${icons.share} Share</button>
            <button class="ms-share-icon-btn">${icons.mail} Email</button>
            ${meeting.id ? `<button class="ms-share-icon-btn" onclick="shareMeetingQR('${meeting.id}')">${icons.qrCode || icons.share} QR</button>` : ""}
          </div>
        </div>

        ${meeting.id ? `
        <!-- QR code -->
        <div class="ms-card-section">
          <div class="ms-section-label">QR Code</div>
          <div class="ms-qr-row">
            <div class="ms-qr-img-wrap">
              <img src="/api/sessions/${meeting.id}/qrcode" alt="Join QR" onerror="this.style.display='none'">
            </div>
            <div class="ms-qr-text">
              <strong>Scan to join</strong>
              <p>Participants can scan this QR code to join instantly.</p>
              <button class="ms-share-copy-btn" onclick="shareMeetingQR('${meeting.id}')">${icons.share} Share QR</button>
            </div>
          </div>
        </div>` : ""}

        <!-- Settings -->
        <div class="ms-card-section">
          <div class="ms-section-label">Settings</div>
          <div class="ms-settings-grid">
            ${settingChips.map(c => `<div class="ms-setting-chip ${c.on ? "on" : "off"}">${c.on ? "✓" : "✗"} ${c.label}</div>`).join("")}
          </div>
        </div>

        <!-- CTA -->
        <div class="ms-card-section">
          <button class="ms-start-btn" onclick="go('/moderator')">
            ${icons.zap} ${isLive ? "Continue Meeting" : "Start Meeting Now"}
          </button>
          <button class="ms-secondary-btn" onclick="go('/meetings')">
            ← Back to Meetings
          </button>
        </div>
      </div>
    </div>
  `;

  /* ==== DESKTOP split layout ==== */
  const desktopMain = `
    <div class="ms-desktop-wrap">

      <!-- LEFT column: hero + stats + share -->
      <div class="ms-desktop-left">
        <div class="ms-desktop-hero">
          <div class="ms-desktop-hero-content">
            <div class="ms-desktop-badge">${icons.user} &nbsp;You are the Host</div>
            <h1 class="ms-desktop-title">${title}</h1>
            <p class="ms-desktop-desc">${description}</p>
            <div class="ms-desktop-meta-row">
              <span class="ms-desktop-meta-item">${icons.calendar} ${displayDate}</span>
              <span class="ms-desktop-meta-item">${icons.clock} ${displayTime}</span>
              ${displayDur !== "—" ? `<span class="ms-desktop-meta-item">${icons.clock} ${displayDur}</span>` : ""}
              <span class="ms-desktop-meta-item">${icons.user} ${speakerName}</span>
            </div>
            ${countdownHtml}
          </div>
        </div>

        <!-- Stats row -->
        <div class="ms-desktop-stats-row">
          <div class="ms-desktop-stat-card">
            <span class="ms-desktop-stat-val">${participants}</span>
            <span class="ms-desktop-stat-label">Enrolled</span>
          </div>
          <div class="ms-desktop-stat-card">
            <span class="ms-desktop-stat-val">${displayDur !== "—" ? displayDur : "—"}</span>
            <span class="ms-desktop-stat-label">Duration</span>
          </div>
          <div class="ms-desktop-stat-card">
            <span class="ms-desktop-stat-val" style="font-size:14px;padding-top:4px">${isLive ? "🟢 Live" : "🗓 Scheduled"}</span>
            <span class="ms-desktop-stat-label">Status</span>
          </div>
        </div>

        <!-- Share card -->
        <div class="ms-desktop-share-card">
          <div class="ms-desktop-share-title">${icons.link} Invite Participants</div>
          <div class="ms-share-row">
            <input class="ms-share-input" readonly value="${joinLink}" onclick="this.select()" id="ms-join-link-input-desk">
            <button class="ms-share-copy-btn" id="ms-copy-btn-desk"
              onclick="
                navigator.clipboard.writeText('${joinLink}').then(() => {
                  const b = document.getElementById('ms-copy-btn-desk');
                  if (b) { const o = b.innerHTML; b.innerHTML = '✓ Copied!'; b.style.color='var(--success)'; setTimeout(() => { b.innerHTML = o; b.style.color=''; }, 1500); }
                }).catch(() => document.getElementById('ms-join-link-input-desk')?.select());
              ">
              ${icons.link} Copy Link
            </button>
          </div>
          <div class="ms-share-icons" style="margin-top:12px">
            <button class="ms-share-icon-btn">${icons.share} Share</button>
            <button class="ms-share-icon-btn">${icons.mail} Email</button>
            ${meeting.id ? `<button class="ms-share-icon-btn" onclick="shareMeetingQR('${meeting.id}')">${icons.qrCode || icons.share} QR Code</button>` : ""}
          </div>

          ${meeting.id ? `
          <div class="ms-qr-row" style="margin-top:16px;padding-top:14px;border-top:1px solid var(--line-light)">
            <div class="ms-qr-img-wrap">
              <img src="/api/sessions/${meeting.id}/qrcode" alt="Join QR" onerror="this.style.display='none'">
            </div>
            <div class="ms-qr-text">
              <strong>Scan to join instantly</strong>
              <p>Share this QR code — participants scan it to enter the room.</p>
              <button class="ms-share-copy-btn" onclick="shareMeetingQR('${meeting.id}')">${icons.share} Share QR</button>
            </div>
          </div>` : ""}
        </div>
      </div>

      <!-- RIGHT sidebar -->
      <div class="ms-desktop-right">
        <div class="ms-desktop-right-card">
          <div class="ms-desktop-right-header">Host Controls</div>
          <div class="ms-desktop-right-body">
            <button class="ms-desktop-start-btn" onclick="go('/moderator')">
              ${icons.zap} ${isLive ? "Continue Meeting" : "Start Meeting Now"}
            </button>
            <button class="ms-desktop-edit-btn" onclick="go('/meetings')">← Back to Meetings</button>
          </div>
        </div>

        <!-- Settings summary -->
        <div class="ms-desktop-right-card">
          <div class="ms-desktop-right-header">Meeting Settings</div>
          <div class="ms-desktop-right-body">
            <div class="ms-settings-grid">
              ${settingChips.map(c => `<div class="ms-setting-chip ${c.on ? "on" : "off"}">${c.on ? "✓" : "✗"} ${c.label}</div>`).join("")}
            </div>
          </div>
        </div>

        <!-- Host info card -->
        <div class="ms-desktop-right-card">
          <div class="ms-desktop-right-header">Host</div>
          <div class="ms-desktop-right-body" style="display:flex;align-items:center;gap:12px">
            <div class="ms-enrolled-avatar" style="width:44px;height:44px;font-size:16px;border-radius:50%;background:linear-gradient(135deg,#5b34ff,#7c3aed);border:none;margin-left:0;display:grid;place-items:center;color:#fff;font-weight:700">${speakerInit}</div>
            <div>
              <div style="font-weight:700;font-size:14px;color:var(--ink)">${speakerName}</div>
              <div style="font-size:12px;color:var(--muted)">Moderator · Host</div>
            </div>
          </div>
        </div>
      </div>

    </div>
  `;

  shell(phone(mobileHtml, "meetings", true), "", desktopMain, "");
}


/* --- Helpers for Create Flow ------------------------------- */
/** Format raw minutes into a human-readable label (e.g. 90 → "1h 30m") */
function fmtDuration(mins) {
  const m = Number(mins) || 60;
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}
/** Format an ISO date string (YYYY-MM-DD) into a pretty label */
function fmtDate(iso) {
  if (!iso) return "—";
  try {
    // Use local date to avoid UTC offset shifting the day
    const [y, mo, d] = iso.split("-").map(Number);
    return new Date(y, mo - 1, d).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric"
    });
  } catch { return iso; }
}
/** Format HH:MM to 12-hour clock */
function fmtTime(t) {
  if (!t) return "—";
  try {
    const [hh, mm] = t.split(":").map(Number);
    const period = hh >= 12 ? "PM" : "AM";
    const h = hh % 12 || 12;
    return `${h}:${String(mm).padStart(2, "0")} ${period}`;
  } catch { return t; }
}

/* --- Create Meeting Flow ----------------------------------- */
export function renderCreate(step = "type") {
  const draft = state.createDraft;

  // For instant meetings, fill date/time from now so review/done aren't blank
  const nowDate = new Date().toISOString().slice(0, 10);
  const nowTime = new Date().toTimeString().slice(0, 5);
  const displayDate = draft.date || (draft.type === "instant" ? nowDate : "");
  const displayTime = draft.time || (draft.type === "instant" ? nowTime : "");
  const displayDur  = fmtDuration(draft.duration);
  const displayDateLabel = fmtDate(displayDate);
  const displayTimeLabel = fmtTime(displayTime);

  const screens = {
    type: `
      <h1 class="screen-title">Create Meeting</h1>
      <p class="subtle">Choose how you want to run your meeting.</p>
      <div class="stack" style="margin-top:32px;gap:14px">
        <button class="action-card stack" style="padding:22px;gap:10px"
          onclick="selectMeetingType('instant')">
          <span class="icon-box green" style="width:48px;height:48px">${icons.zap}</span>
          <h2 style="font-size:17px">Start Instantly</h2>
          <p class="subtle">Launch a live room right now — no scheduling needed.</p>
        </button>
        <button class="action-card stack" style="padding:22px;gap:10px"
          onclick="selectMeetingType('scheduled')">
          <span class="icon-box" style="width:48px;height:48px">${icons.calendar}</span>
          <h2 style="font-size:17px">Schedule Meeting</h2>
          <p class="subtle">Pick a date and time and invite participants in advance.</p>
        </button>
      </div>
    `,
    details: (() => {
      const isInstant = draft.type === 'instant';
      const today = new Date().toISOString().slice(0, 10);
      const nowTimeFull = new Date().toTimeString().slice(0, 5);
      const hostName = draft.speaker || state.profile?.user?.name || '';
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const tzLabel = tz.replace(/_/g, ' ');
      const tzOffset = (() => {
        const off = -new Date().getTimezoneOffset();
        const sign = off >= 0 ? '+' : '-';
        const h = String(Math.floor(Math.abs(off)/60)).padStart(2,'0');
        const m = String(Math.abs(off)%60).padStart(2,'0');
        return `GMT${sign}${h}:${m}`;
      })();
      // Auto-generate Room ID if not present
      const roomId = draft.roomId || ('CV-' + Math.floor(10000+Math.random()*90000));
      draft.roomId = roomId;

      const durOpts = [
        {v:30,l:'30 minutes'},{v:45,l:'45 minutes'},{v:60,l:'1 hour'},
        {v:90,l:'1.5 hours'},{v:120,l:'2 hours'},{v:180,l:'3 hours'},{v:240,l:'4 hours'}
      ];
      const sel = s => draft.settings;
      const tog = (id, label, sub, defVal) => {
        const checked = draft.settings?.[id] !== undefined ? draft.settings[id] : defVal;
        return `<div class="cf-toggle-row">
          <div>
            <div class="cf-toggle-label">${label}</div>
            <div class="cf-toggle-sub">${sub}</div>
          </div>
          <label class="cf-switch">
            <input type="checkbox" id="${id}" ${checked ? 'checked' : ''}>
            <span class="cf-slider"></span>
          </label>
        </div>`;
      };

      const sumDate = isInstant
        ? new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})
        : (draft.date ? fmtDate(draft.date) : '—');
      const sumTime = isInstant
        ? fmtTime(nowTimeFull) + ' (Now)'
        : (draft.time ? fmtTime(draft.time) : '—');
      const sumDur = fmtDuration(draft.duration || 60);

      const mainForm = `
        <!-- ── Page Heading ─────────────────────────────────── -->
        <div class="cf-page-heading ${isInstant ? 'cf-page-heading--instant' : 'cf-page-heading--sched'}">
          <div class="cf-breadcrumb">
            <button class="cf-bc-btn" onclick="go('/meetings/create')">← Create Meeting</button>
            <span class="cf-bc-sep">›</span>
            <span class="cf-bc-current">${isInstant ? 'Instant' : 'Scheduled'}</span>
          </div>
          <div class="cf-heading-row">
            <div class="cf-heading-icon ${isInstant ? 'cf-heading-icon--live' : 'cf-heading-icon--sched'}">
              ${isInstant ? icons.zap : icons.calendar}
            </div>
            <div class="cf-heading-text">
              <div class="cf-heading-top">
                <h1 class="cf-heading-title">${isInstant ? 'Start an Instant Meeting' : 'Schedule a Meeting'}</h1>
                <span class="cf-mode-chip ${isInstant ? 'cf-mode-chip--live' : 'cf-mode-chip--sched'}">
                  ${isInstant ? '<span class="cf-live-dot"></span> Live Now' : '📅 Scheduled'}
                </span>
              </div>
              <p class="cf-heading-sub">${isInstant
                ? 'Goes live the moment you click Start — fill in the details below.'
                : 'Pick a date and time, configure settings, then share the invite link.'
              }</p>
            </div>
          </div>
        </div>

        <div class="cf-section">
          <div class="cf-section-header">
            <span class="cf-section-icon">${icons.edit || icons.pen || '✏️'}</span>
            <div>
              <div class="cf-section-title">Basic Details</div>
              <div class="cf-section-sub">Provide the essential information about your meeting</div>
            </div>
          </div>

          <div class="cf-field">
            <label class="cf-label">Meeting Title <span class="cf-req">*</span></label>
            <div class="cf-input-wrap">
              <input id="title" class="cf-input" type="text"
                placeholder="e.g. Q3 Planning Session"
                value="${draft.title || ''}"
                maxlength="80"
                oninput="document.getElementById('title-count').textContent=this.value.length"
                autocomplete="off">
              <span class="cf-count"><span id="title-count">${(draft.title||'').length}</span>/80</span>
            </div>
          </div>

          <div class="cf-field">
            <label class="cf-label">Speaker / Host Name <span class="cf-req">*</span></label>
            <div class="cf-input-wrap cf-input-icon">
              <span class="cf-icon">${icons.user}</span>
              <input id="speaker" class="cf-input" type="text"
                placeholder="Your name" value="${hostName}" autocomplete="name">
            </div>
          </div>


          ${!isInstant ? `
          <div class="cf-row-2">
            <div class="cf-field">
              <label class="cf-label">Date <span class="cf-req">*</span></label>
              <div class="cf-input-wrap cf-input-icon">
                <span class="cf-icon">${icons.calendar}</span>
                <input id="date" class="cf-input" type="date"
                  value="${draft.date || ''}"
                  min="${today}">
              </div>
            </div>
            <div class="cf-field">
              <label class="cf-label">Time <span class="cf-req">*</span></label>
              <div class="cf-input-wrap cf-input-icon">
                <span class="cf-icon">${icons.clock}</span>
                <input id="time" class="cf-input" type="time" value="${draft.time || ''}">
              </div>
            </div>
          </div>
          ` : `
          <input id="date" type="hidden" value="${today}">
          <input id="time" type="hidden" value="${nowTimeFull}">
          `}

          <div class="cf-field">
            <label class="cf-label">Duration <span class="cf-req">*</span></label>
            <div class="cf-input-wrap cf-input-icon">
              <span class="cf-icon">${icons.clock}</span>
              <select id="duration-visible" class="cf-input cf-select">
                ${durOpts.map(o=>`<option value="${o.v}" ${String(draft.duration||60)===String(o.v)?'selected':''}>${o.l}</option>`).join('')}
              </select>
            </div>
          </div>

          ${!isInstant ? `
          <div class="cf-field">
            <label class="cf-label">Time Zone <span class="cf-req">*</span></label>
            <div class="cf-input-wrap cf-input-icon">
              <span class="cf-icon">🌐</span>
              <select id="timezone" class="cf-input cf-select">
                <option value="${tz}" selected>(${tzOffset}) ${tzLabel}</option>
              </select>
            </div>
          </div>
          ` : ''}

          <div class="cf-field">
            <label class="cf-label">Description (Optional)</label>
            <div class="cf-input-wrap">
              <textarea id="description" class="cf-input cf-textarea"
                placeholder="What will this meeting cover? Add a brief description..."
                rows="3"
                maxlength="300"
                oninput="document.getElementById('desc-count').textContent=this.value.length">${draft.description||''}</textarea>
              <span class="cf-count"><span id="desc-count">${(draft.description||'').length}</span>/300</span>
            </div>
          </div>
        </div>

        <div class="cf-section">
          <div class="cf-section-header">
            <span class="cf-section-icon">⚙️</span>
            <div>
              <div class="cf-section-title">Meeting Settings</div>
              <div class="cf-section-sub">Configure how your meeting will run</div>
            </div>
          </div>
          <div class="cf-toggles-grid">
            ${tog('settingAllowQuestions','Allow Participants to Ask Questions','Attendees can submit questions',true)}
            ${tog('settingEnableChat','Enable Chat','Allow participants to chat',true)}
            ${tog('settingUpvoteReact','Upvote / React','Allow participants to upvote questions',true)}
            ${tog('settingRecordMeeting','Record Meeting','Record and save the session',false)}
            ${tog('settingShowParticipants','Show Participant Names','Display names publicly in session',true)}
          </div>
        </div>


        <div class="cf-actions">
          <button id="createMeetingBtn" class="btn" style="width:100%;justify-content:center;gap:8px" onclick="saveDetails()">
            ${icons.zap} ${isInstant ? 'Start Meeting Now' : 'Create Meeting'}
          </button>
        </div>
      `;

      const rightPanel = `
        <div class="cf-summary-card">
          <div class="cf-summary-header">
            <span class="cf-section-icon">${icons.calendar}</span>
            <div class="cf-section-title">Meeting Summary</div>
          </div>
          <div class="cf-summary-rows">
            <div class="cf-sum-row">
              <span class="cf-sum-icon">${icons.edit||'📝'}</span>
              <div><div class="cf-sum-key">Title</div><div id="sum-title" class="cf-sum-val">${draft.title||'—'}</div></div>
            </div>
            <div class="cf-sum-row">
              <span class="cf-sum-icon">${icons.user}</span>
              <div><div class="cf-sum-key">Host</div><div id="sum-host" class="cf-sum-val">${hostName||'—'}</div></div>
            </div>
            ${!isInstant ? `
            <div class="cf-sum-row">
              <span class="cf-sum-icon">${icons.calendar}</span>
              <div><div class="cf-sum-key">Date &amp; Time</div><div id="sum-datetime" class="cf-sum-val">${sumDate} · ${sumTime}</div></div>
            </div>
            ` : `
            <div class="cf-sum-row">
              <span class="cf-sum-icon">${icons.zap}</span>
              <div><div class="cf-sum-key">Starts</div><div class="cf-sum-val" style="color:var(--success)">Now · ${fmtTime(nowTimeFull)}</div></div>
            </div>
            `}
            <div class="cf-sum-row">
              <span class="cf-sum-icon">${icons.clock}</span>
              <div><div class="cf-sum-key">Duration</div><div id="sum-dur" class="cf-sum-val">${sumDur}</div></div>
            </div>
            ${!isInstant ? `
            <div class="cf-sum-row">
              <span class="cf-sum-icon">🌐</span>
              <div><div class="cf-sum-key">Time Zone</div><div class="cf-sum-val">(${tzOffset}) ${tzLabel}</div></div>
            </div>
            ` : ''}
          </div>
        </div>

        <div class="cf-summary-card" style="margin-top:16px">
          <div class="cf-summary-header">
            <span class="cf-section-icon">🔗</span>
            <div class="cf-section-title">What's Next?</div>
          </div>
          <p class="cf-sum-val" style="margin-top:8px;line-height:1.5">
            After creation, you'll get a <strong>meeting link</strong> and <strong>QR code</strong>
            to invite participants.
          </p>
        </div>

        <div class="cf-summary-card" style="margin-top:16px">
          <details class="cf-advanced">
            <summary class="cf-adv-toggle">
              <span>⚙️ Advanced Settings</span>
              <span class="cf-adv-chevron">▾</span>
            </summary>
            <div class="cf-adv-body">
              <div class="cf-field" style="margin-top:12px">
                <label class="cf-label">Q&amp;A Mode</label>
                <div class="cf-sum-key" style="margin-bottom:4px">Choose how questions are handled</div>
                <select id="qaMode" class="cf-input cf-select">
                  <option value="open" selected>Open (Anytime)</option>
                  <option value="moderated">Moderated</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div class="cf-field" style="margin-top:12px">
                <label class="cf-label">Language</label>
                <select id="language" class="cf-input cf-select">
                  <option value="English" selected>English</option>
                  <option value="Spanish">Spanish</option>
                  <option value="French">French</option>
                  <option value="German">German</option>
                  <option value="Hindi">Hindi</option>
                </select>
              </div>
              <div class="cf-field" style="margin-top:12px">
                <label class="cf-label">Max Participants</label>
                <select id="maxParticipants" class="cf-input cf-select">
                  <option value="50">50</option>
                  <option value="100">100</option>
                  <option value="250">250</option>
                  <option value="500" selected>500</option>
                  <option value="1000">1000</option>
                </select>
              </div>
              <div style="margin-top:12px">
                ${tog('settingRequireApprovalAdv','Require approval to join','Moderators must approve participants',false)}
              </div>
            </div>
          </details>
        </div>

        <div class="cf-actions-right">
          <button class="btn secondary cf-save-draft-btn" onclick="go('/meetings')">
            💾 Save as Draft
          </button>
          <button id="createMeetingBtnRight" class="btn cf-create-btn" onclick="saveDetails()">
            ${icons.zap} ${isInstant ? 'Start Meeting Now' : 'Create Meeting'}
          </button>
        </div>
      `;

      return { mainForm, rightPanel };
    })(),
    invite: `
      <h1 class="screen-title">Invite Participants</h1>
      <p class="subtle">Share the link below to invite people to your meeting.</p>

      <!-- Meeting summary chip -->
      <div class="create-summary-chip">
        <span>${icons.calendar} ${displayDateLabel}</span>
        <span>${icons.clock} ${displayTimeLabel}</span>
        <span>${icons.timer || icons.clock} ${displayDur}</span>
      </div>

      <div class="field" style="margin:16px 0">
        <label>Meeting Join Link</label>
        <div style="display:flex;gap:8px;align-items:center">
          <input id="inviteLinkInput" value="${location.origin}/#/join/..." readonly
            style="flex:1;background:var(--surface-2,#f8f9fa);cursor:text;font-size:13px" onclick="this.select()">
          <button class="btn secondary" onclick="copyInviteLink()" style="white-space:nowrap">${icons.link} Copy</button>
        </div>
      </div>
      <div class="row" style="justify-content:center;gap:20px;margin:18px 0">
        ${[[icons.share,"Share"],[icons.mail,"Email"],[icons.moreHorizontal,"More"]].map(([ic,label]) => `
          <div style="text-align:center">
            <button class="icon-btn" style="width:44px;height:44px;margin-bottom:4px">${ic}</button>
            <span class="subtle" style="font-size:10px">${label}</span>
          </div>
        `).join("")}
      </div>
      <button class="btn" style="width:100%;margin-top:8px" onclick="go('/meetings/create/review')">${icons.arrowRight} Review & Confirm</button>
    `,
    review: (() => {
      const settingsMap = {
        allowQuestions: { label: "Allow Questions", val: draft.settings?.allowQuestions ?? true  },
        enableChat:     { label: "Enable Chat",      val: draft.settings?.enableChat     ?? true  },
        upvoteReact:    { label: "Upvote / React",   val: draft.settings?.upvoteReact    ?? true  },
        recordMeeting:  { label: "Record Meeting",   val: draft.settings?.recordMeeting  ?? false },
      };
      return `
      <h1 class="screen-title">Review & Confirm</h1>
      <p class="subtle">Please review your meeting details before creating.</p>

      <section class="panel stack" style="margin:18px 0;padding:18px;gap:10px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
          <h2 style="font-size:16px;font-weight:700;margin:0">${draft.title || "Untitled Meeting"}</h2>
          <span class="badge ${draft.type === 'instant' ? 'success' : ''}"
            style="flex-shrink:0;font-size:11px">${draft.type === 'instant' ? icons.zap + ' Instant' : icons.calendar + ' Scheduled'}</span>
        </div>
        <div class="create-review-rows">
          <div class="info-row">${icons.calendar}
            <span><strong>${displayDateLabel}</strong></span>
          </div>
          <div class="info-row">${icons.clock}
            <span><strong>${displayTimeLabel}</strong> &nbsp;·&nbsp; ${displayDur}</span>
          </div>
          ${draft.speaker ? `<div class="info-row">${icons.user} <span>${draft.speaker}</span></div>` : ""}
          <div class="info-row">${icons.users} <span>Open invitation — share link below</span></div>
        </div>
        ${draft.description ? `<p style="font-size:13px;color:var(--ink-secondary);border-top:1px solid var(--border);padding-top:10px;margin-top:4px">${draft.description}</p>` : ""}
      </section>

      <section class="panel stack" style="padding:14px 18px;gap:6px">
        <h3 style="font-size:13px;font-weight:600;margin-bottom:6px;color:var(--ink-secondary);text-transform:uppercase;letter-spacing:.05em">Settings</h3>
        ${Object.values(settingsMap).map(s => `
          <div class="review-row">
            <span>${s.label}</span>
            <strong style="color:${s.val ? 'var(--success)' : 'var(--muted)'}">${s.val ? '✓ On' : '✗ Off'}</strong>
          </div>
        `).join("")}
      </section>

      <div class="form-grid" style="margin-top:16px">
        <button class="btn secondary" onclick="history.back()">Back</button>
        <button id="createMeetingBtn" class="btn" onclick="createMeeting()">${icons.checkCircle} Create Meeting</button>
      </div>
    `})(),
    done: `
      <div class="center-screen" style="text-align:center">
        <div class="logo-hero">
          <div class="success-mark">${icons.checkCircle}</div>
          <div>
            <h1 class="screen-title">Meeting Created!</h1>
            <p class="subtle">Your meeting has been created successfully.</p>
          </div>
        </div>
        <section class="panel stack" style="text-align:left;padding:16px;gap:10px">
          <h3 style="font-size:15px;font-weight:700">${state.joinTarget?.title || state.meetings[0]?.title || draft.title}</h3>
          <div class="create-review-rows">
            <div class="info-row">${icons.calendar}
              <span>${fmtDate(state.joinTarget?.date || displayDate)}</span>
            </div>
            <div class="info-row">${icons.clock}
              <span>${state.joinTarget?.time || fmtTime(displayTime)} &nbsp;·&nbsp; ${state.joinTarget?.duration || displayDur}</span>
            </div>
            <div class="info-row">${icons.users} <span>Open invitation — share the link</span></div>
          </div>
          ${state.joinTarget?.id ? `
            <div class="info-row" style="margin-top:4px">
              ${icons.link}
              <input readonly style="font-size:12px;flex:1;background:var(--soft);border:none;padding:4px 8px;border-radius:6px"
                     value="${location.origin}/#/join/${state.joinTarget.code || ""}"
                     onclick="this.select()">
            </div>
            <div style="text-align:center;margin-top:10px">
              <img src="/api/sessions/${state.joinTarget.id}/qrcode"
                   alt="Join QR" width="100" height="100"
                   style="border-radius:6px;background:#fff;padding:4px">
              <br>
              <button id="copy-link-btn-${state.joinTarget.id}"
                style="margin-top:6px;font-size:12px;background:none;border:none;color:var(--primary);cursor:pointer"
                onclick="copyMeetingLink('${state.joinTarget.id}')">
                ${icons.link} Copy Join Link
              </button>
            </div>
          ` : ""}
        </section>
        <div class="stack" style="gap:10px">
          <button class="btn" style="width:100%" onclick="go('/moderator')">${icons.zap} Start Meeting Now</button>
          <button class="btn secondary" style="width:100%" onclick="go('/meetings')">${icons.calendar} View Meetings</button>
          <button class="link-btn" style="text-align:center" onclick="go('/meetings')">Go to Meetings</button>
        </div>
      </div>
    `
  };
  // Details step uses a rich two-column desktop layout; other steps use the phone shell
  if (step === 'details') {
    const { mainForm, rightPanel } = screens.details;
    shell('', '', mainForm, rightPanel);
  } else {
    shell(phone(screens[step], 'meetings', true));
  }
}

/* --- Conducted Meetings ------------------------------------ */


/* =============================================================
   Camera QR Scanner (A4)
   Mounts after the scan screen HTML is in the DOM.
   Uses jsQR (loaded from CDN via index.html) to decode frames.
   Stops the stream when the user navigates away.
   ============================================================= */

/** Active camera stream — kept so teardownScanScreen() can stop tracks */
let _scanStream = null;
let _scanRaf    = null;

export function teardownScanScreen() {
  if (_scanRaf)    { cancelAnimationFrame(_scanRaf); _scanRaf = null; }
  if (_scanStream) { _scanStream.getTracks().forEach(t => t.stop()); _scanStream = null; }
}

async function mountScanScreen() {
  const video  = document.getElementById("cv-qr-video");
  const canvas = document.getElementById("cv-qr-canvas");
  const status = document.getElementById("cv-qr-status");
  if (!video || !canvas || !status) return;

  // Guard: jsQR must be loaded from the CDN script tag in index.html
  if (typeof jsQR !== "function") {
    status.textContent = "QR scanner unavailable (jsQR not loaded).";
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" }
    });
    _scanStream = stream;
    video.srcObject = stream;
    await video.play();
    status.textContent = "Scanning…";

    const ctx = canvas.getContext("2d");

    function tick() {
      // Check whether the video element is still in the document
      // (user may have navigated away while waiting for a frame)
      if (!document.contains(video)) { teardownScanScreen(); return; }

      if (video.readyState >= video.HAVE_ENOUGH_DATA) {
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const result    = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert"
        });

        if (result?.data) {
          // The QR encodes the full join URL: http://host/#/join/482916
          const match = result.data.match(/\/join\/([A-Za-z0-9]{6,8})/);
          if (match) {
            teardownScanScreen();
            status.textContent = `Found: ${match[1]}`;
            // Delegate to the shared lookup helper (registered on window by app.js)
            window.validateMeetingCodeDirect?.(match[1]);
            return; // stop the RAF loop
          }
        }
      }
      _scanRaf = requestAnimationFrame(tick);
    }
    _scanRaf = requestAnimationFrame(tick);

  } catch (err) {
    // Permission denied or hardware unavailable
    teardownScanScreen();
    const denied = err.name === "NotAllowedError" || err.name === "PermissionDeniedError";
    status.textContent = denied
      ? "Camera access denied. Use the 'Enter ID' button below."
      : `Camera error: ${err.message}`;
    status.style.background = "rgba(200,40,40,.75)";
  }
}

/* --- Share QR Code via Web Share API (A2) ------------------- */
async function shareMeetingQR(meetingId) {
  const meeting = state.meetings.find(m => m.id === meetingId);
  const link    = meeting
    ? `${location.origin}/#/join/${meeting.code}`
    : location.origin;
  const qrUrl   = `/api/sessions/${meetingId}/qrcode`;

  if (navigator.share) {
    try {
      // Modern share sheet (Android Chrome, iOS Safari)
      await navigator.share({ title: meeting?.title || "CollectiveVoice", url: link });
      return;
    } catch { /* user cancelled or share not supported */ }
  }
  // Fallback: open QR image in new tab (user can long-press to save/share)
  window.open(qrUrl, "_blank");
}
window.shareMeetingQR = shareMeetingQR;

// Stop the camera when the user navigates away from the scan screen
// by hooking into hashchange. This prevents the camera light staying on
// while the user browses other parts of the app.
window.addEventListener("hashchange", () => {
  const route = location.hash.replace("#", "");
  if (route !== "/join/scan") teardownScanScreen();
});

// ── openReport — navigates to /report with meeting ID stored in state ─
window.openReport = function(meetingId) {
  import("../state.js").then(({ state }) => {
    state.report = { meetingId };
  }).catch(() => {
    if (window.state) window.state.report = { meetingId };
  });
  window.go?.("/report");
};
