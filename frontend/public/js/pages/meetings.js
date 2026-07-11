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

/* ---- Fake QR SVG ---- */
function qrSvg() {
  return `
    <svg viewBox="0 0 80 80" width="80" height="80" style="display:block;border-radius:6px;background:#fff;padding:4px">
      ${[0,1,2,3,4,5,6].flatMap(r =>
        [0,1,2,3,4,5,6].map(c => {
          const corner = (r<3&&c<3)||(r<3&&c>3)||(r>3&&c<3);
          const fill = corner
            ? ((r===0||r===2||c===0||c===2) ? "#5b34ff" : (r===1&&c===1||r===1&&c===5||r===5&&c===1) ? "#fff" : "#5b34ff")
            : Math.random() > 0.5 ? "#5b34ff" : "transparent";
          if (fill === "transparent") return "";
          return `<rect x="${c*11+2}" y="${r*11+2}" width="9" height="9" rx="1.5" fill="${fill}"/>`;
        })
      ).join("")}
    </svg>
  `;
}

/* ============================================================
   Meetings List (main export)
   ============================================================ */
export function renderMeetings() {
  const ongoing  = state.meetings.filter(m => m.status === "live");
  const upcoming = state.meetings.filter(m => m.status === "upcoming");
  const conducted= state.meetings.filter(m => m.status === "conducted" || m.status === "past");
  const liveMeeting = ongoing[0] || state.meetings[0];

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
      ${upcoming.map(m => meetingCard(m)).join("")}
      <div class="section-header"><h2 class="screen-title">Conducted Meetings</h2><button class="link-btn" onclick="go('/conducted')">View all</button></div>
      ${conducted.slice(0,1).map(m => meetingCard(m, `<button class="btn secondary small" onclick="go('/analytics')">${icons.barChart} Analytics</button>`)).join("")}
    </div>
  `;

  /* ---- Desktop main column ---- */
  const desktopMain = `
    <div class="mtg-desktop">

      <!-- Topbar -->
      <div class="mtg-topbar">
        <div>
          <h1 class="mtg-page-title">Meetings</h1>
          <p class="mtg-page-sub">Create, join and manage your meetings with ease.
            <span class="mtg-title-wave">〰</span>
          </p>
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
          <div class="desktop-user-pill">
            <div class="desktop-avatar">AN</div>
            <div class="desktop-user-info">
              <span class="desktop-user-name">Ananya Sharma</span>
              <span class="desktop-user-role">Audience</span>
            </div>
            ${icons.chevronDown}
          </div>
        </div>
      </div>

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
      <div class="mtg-tabs">
        <button class="mtg-tab active">
          ${icons.calendar} Upcoming <span class="mtg-tab-count">${upcoming.length}</span>
        </button>
        <button class="mtg-tab">
          ${icons.radio} Ongoing <span class="mtg-tab-count">${ongoing.length}</span>
        </button>
        <button class="mtg-tab" onclick="go('/conducted')">
          ${icons.clock} Past <span class="mtg-tab-count">${conducted.length}</span>
        </button>
      </div>

      <!-- Live Featured Card -->
      ${liveMeeting ? `
      <div class="mtg-live-card">
        <div class="mtg-live-badge"><span class="live-dot"></span> LIVE NOW</div>
        <div class="mtg-live-content">
          <div class="mtg-live-icon-wrap">
            <div class="mtg-live-icon">${icons.zap}</div>
          </div>
          <div class="mtg-live-info">
            <h2 class="mtg-live-title">${liveMeeting.title}</h2>
            <div class="mtg-live-speaker">
              ${liveMeeting.speaker || "Dr. Sarah Johnson"}
              <span class="mtg-speaker-badge">Speaker</span>
            </div>
            <div class="mtg-live-meta">
              <span>${icons.calendar} ${liveMeeting.date}</span>
              <span>${icons.clock} ${liveMeeting.time}</span>
              <span>${icons.users} ${liveMeeting.participants} participants</span>
            </div>
          </div>
        </div>
        <div class="mtg-live-right">
          <div class="mtg-live-timer">
            ENDS IN <span class="mtg-timer-val">${countdown(19, 24)}</span>
          </div>
          <button class="btn mtg-join-btn" onclick="go('/join/preview')">${icons.arrowRight} Join Now</button>
          <button class="mtg-more-btn">${icons.moreVertical}</button>
        </div>
      </div>
      ` : ""}

      <!-- Upcoming Meetings List -->
      <div class="mtg-list-card">
        ${upcoming.map(m => `
          <div class="mtg-list-row">
            <div class="icon-box ${m.status === "live" ? "green" : ""}" style="width:38px;height:38px;flex-shrink:0">
              ${icons.calendar}
            </div>
            <div class="mtg-list-info">
              <strong class="mtg-list-title">${m.title}</strong>
              <div class="mtg-list-meta">
                <span>${icons.calendar} ${m.date}</span>
                <span>${icons.clock} ${m.time}</span>
                <span>${icons.users} ${m.participants} participants</span>
              </div>
            </div>
            <div class="mtg-list-actions">
              <span class="mtg-time-badge ${m.badge === "In 2h" ? "soon" : ""}">
                ${m.badge || "In 2h"}
              </span>
              <button class="mtg-more-btn">${icons.moreVertical}</button>
            </div>
          </div>
        `).join("")}

        <div class="mtg-view-all" onclick="go('/conducted')">
          View all upcoming meetings ${icons.chevronDown}
        </div>
      </div>

    </div>
  `;

  /* ---- Desktop right panel ---- */
  const desktopRight = `
    <div class="mtg-right-panel">

      <!-- Live Now Banner -->
      <div class="mtg-right-live-card">
        <div class="mtg-right-live-header">
          <span class="mtg-right-live-dot"><span class="live-dot"></span> Live Now</span>
          <span class="badge success" style="font-size:10px">${icons.radio} Live</span>
        </div>
        <div class="mtg-right-live-body">
          <div class="mtg-right-live-text">
            <h3 class="mtg-right-live-title">${liveMeeting?.title || "AI in Education: Opportunities & Challenges"}</h3>
            <p class="mtg-right-live-speaker">${liveMeeting?.speaker || "Dr. Sarah Johnson"}</p>
            <div class="mtg-right-live-stats">
              <span>${icons.users} ${liveMeeting?.participants || 128}</span>
              <span>${icons.clock} Ends in 19m 24s</span>
            </div>
            <button class="btn mtg-right-join-btn" onclick="go('/join/preview')">Join Now ${icons.arrowRight}</button>
          </div>
          <div class="mtg-right-live-art">
            <svg viewBox="0 0 90 90" width="90" height="90" style="display:block;opacity:0.85">
              <!-- Silhouette crowd -->
              <ellipse cx="45" cy="72" rx="38" ry="10" fill="#c4b5ff" opacity="0.4"/>
              <circle cx="30" cy="58" r="10" fill="#a78bfa"/>
              <circle cx="45" cy="52" r="13" fill="#7c3aed"/>
              <circle cx="60" cy="58" r="10" fill="#a78bfa"/>
              <circle cx="18" cy="64" r="7"  fill="#c4b5ff"/>
              <circle cx="72" cy="64" r="7"  fill="#c4b5ff"/>
              <!-- Microphone stand -->
              <rect x="41" y="18" width="8" height="28" rx="4" fill="#5b34ff"/>
              <rect x="36" y="42" width="18" height="4" rx="2" fill="#5b34ff"/>
              <rect x="42" y="46" width="6" height="12" rx="2" fill="#5b34ff"/>
              <ellipse cx="45" cy="20" rx="8" ry="10" fill="#7c3aed"/>
              <rect x="43" y="58" width="4" height="8" rx="2" fill="#5b34ff"/>
            </svg>
          </div>
        </div>
      </div>

      <!-- Recent Activity -->
      <div class="home-panel-card">
        <div class="home-panel-header">
          <span class="home-panel-title">Recent Activity</span>
          <button class="link-btn" onclick="go('/activity')">View all</button>
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
            <p class="mtg-qr-sub">Invite others to participate by sharing this QR code.</p>
            <button class="mtg-qr-btn">${icons.share} Share QR Code</button>
          </div>
          <div class="mtg-qr-img">
            ${qrSvg()}
          </div>
        </div>
      </div>

    </div>
  `;

  shell(
    phone(mobileContent, "meetings"),
    "",
    desktopMain,
    desktopRight
  );
}

/* --- Join Flow --------------------------------------------- */
export function renderJoin(step = "start") {
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
}

/* --- Create Meeting Flow ----------------------------------- */
export function renderCreate(step = "type") {
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
        ${["Allow Participants to Ask Questions","Enable Chat","Record Meeting","Allow Screen Sharing"].map((item,i) => `
          <div class="toggle-row"><span>${item}</span><span class="switch ${i===2?"":"on"}"></span></div>
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
              <span>${name.toLowerCase().replaceAll(" ",".")
                .replaceAll("dr.","dr")}@email.com</span>
            </div>
            <button class="icon-btn" style="width:30px;height:30px">${icons.plus}</button>
          </div>
        `).join("")}
      </div>
      <div class="field" style="margin:18px 0"><label>Invite via link</label><input value="https://cv.app/meet/abc123"></div>
      <div class="row" style="justify-content:center;gap:20px;margin:12px 0">
        ${[[icons.share,"Share Link"],[icons.mail,"Email"],[icons.link,"WhatsApp"],[icons.moreHorizontal,"More"]].map(([ic,label]) => `
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
        ${["Allow Questions","Enable Chat","Record Meeting","Screen Sharing"].map((item,i) => `
          <div class="review-row"><span>${item}</span><strong style="color:${i===2?"var(--muted)":"var(--success)"}">${i===2?"Off":"On"}</strong></div>
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

/* --- Conducted Meetings ------------------------------------ */
export function renderConductedMeetings() {
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
            <p class="subtle">${icons.users} ${meeting.participants} participants · ${icons.messageCircle} ${meeting.questionsCount||0} questions · ${icons.thumbsUp} ${meeting.upvotes||0} upvotes</p>
            <p class="subtle">${icons.calendar} ${meeting.date} · ${icons.clock} ${meeting.time}</p>
          </div>
          <button class="btn secondary small" onclick="go('/analytics')">${icons.barChart} Report</button>
        </article>
      `).join("")}
      <button class="btn" style="width:100%;margin-top:8px" onclick="go('/analytics')">${icons.barChart} Open Session Analytics</button>
    </div>
  `, "activity", true), analyticsDesktop());
}

/* --- Analytics Desktop Panel (helper for conducted) -------- */
function analyticsDesktop() {
  if (!state.sessionAnalytics) return "";
  const analytics = state.sessionAnalytics.analytics;
  return `
    <div class="panel" style="padding:22px">
      <h1 class="title">Post-Session Analytics</h1>
      <p class="subtle" style="margin-top:6px">${analytics.aiSummary}</p>
    </div>
  `;
}
