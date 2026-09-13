/* ============================================================
   Meeting Detail Page — Host View & Participant View
   Renders on route: /meetings/detail/:id
   Role detection: isOwner flag from API + state.currentUserId
   ============================================================ */
import { icons }  from "../utils/icons.js";
import { state }  from "../state.js";
import { go, api } from "../utils/api.js";
import { sidebar } from "../components/shared.js";



/* ── Main entry point ─────────────────────────────────────── */
export async function renderMeetingDetail(meetingId) {
  /* 1. Render a loading skeleton immediately */
  _paintShell(`
    <div class="md-loading">
      <div class="md-spinner"></div>
      <p>Loading meeting…</p>
    </div>
  `);

  /* 2. Fetch full meeting data */
  let meeting;
  try {
    const res = await api(`/api/meetings/${meetingId}`);
    meeting   = res?.meeting;
  } catch (e) {
    console.error("[MeetingDetail] fetch error:", e);
  }

  if (!meeting) {
    _paintShell(`
      <div class="md-error">
        ${icons.calendar}
        <h3>Meeting Not Found</h3>
        <p>This meeting may have been deleted or you don't have access.</p>
        <button class="btn" style="margin-top:12px" data-action="go" data-route="/meetings">
          Back to Meetings
        </button>
      </div>
    `);
    return;
  }

  /* 3. Determine role */
  const isHost = meeting.isOwner
    || (state.currentUserId && meeting.ownerId === state.currentUserId)
    || (() => {
      try {
        const owned = JSON.parse(localStorage.getItem("cv_owned_meetings") || "[]");
        return owned.includes(meetingId);
      } catch { return false; }
    })();

  /* 4. Paint the correct view */
  if (isHost) {
    _renderHostView(meeting);
  } else {
    _renderParticipantView(meeting);
  }
}

/* ── Paint helper (full desktop shell with no right panel) ── */
function _paintShell(mainHtml) {
  const app = document.getElementById("app");
  if (!app) return;
  app.innerHTML = `
    <div class="app-shell">
      ${sidebar()}
      <main class="content">
        <div class="md-page">${mainHtml}</div>
      </main>
    </div>
  `;
}

/* ══════════════════════════════════════════════════════════════
   HOST VIEW
   ══════════════════════════════════════════════════════════════ */
function _renderHostView(m) {
  const shortId     = m.shortId || m.code || m.id.slice(0,8);
  const title       = m.title || "Untitled Meeting";
  const status      = m.status || "upcoming";
  const statusLabel = status === "live" ? "Live" : status === "conducted" || status === "past" ? "Completed" : "Upcoming";
  const settings    = m.settings || {};

  /* Dates/times */
  const { dateStr, timeStr, dayStr, durationLabel, tzStr } = _fmtMeeting(m);

  /* Join link */
  const joinLink = m.code ? `${location.origin}/#/join/${m.code}` : "";

  /* Countdown until start */
  const startsInStr = _startsIn(m);

  /* Build QR image URL */
  const qrSrc = `/api/sessions/${m.id}/qrcode`;

  /* Build tab HTML pieces */
  const tabOverview  = _hostTabOverview(m, joinLink);
  const tabAgenda    = _hostTabAgenda(settings);
  const tabSettings  = _hostTabSettings(settings);

  const html = `
    <!-- Breadcrumb -->
    <div class="md-breadcrumb">
      <span data-action="go" data-route="/meetings" style="cursor:pointer">Meetings</span>
      <span class="sep">›</span>
      <span data-action="go" data-route="/meetings" style="cursor:pointer">My Scheduled Meetings</span>
      <span class="sep">›</span>
      <span class="current">Meeting Details</span>
    </div>

    <div class="md-layout">
      <!-- ── Left column ── -->
      <div>
        <!-- Header card -->
        <div class="md-card">
          <div class="md-host-header">
            <div class="md-host-header-top">
              <div class="md-host-title-row">
                <div class="md-host-icon">${icons.calendar}</div>
                <div>
                  <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                    <h1 class="md-host-title">${title}</h1>
                    <span class="md-status-badge ${status}">
                      ${status === "live" ? '<span class="md-status-dot"></span>' : ""}
                      ${statusLabel}
                    </span>
                  </div>
                  <p class="md-host-subtitle">
                    Meeting ID: ${shortId} &nbsp;·&nbsp; Created on ${_createdDate(m)} by you
                  </p>
                </div>
              </div>
              <button class="md-edit-btn" id="md-edit-btn" data-action="mdEditMeeting" data-id="${m.id}">
                ${icons.edit} Edit Meeting
              </button>
            </div>
          </div>

          <!-- Meta strip -->
          <div class="md-meta-strip">
            <div class="md-meta-item">
              <div class="md-meta-label">${icons.calendar} Date</div>
              <div class="md-meta-value">${dateStr}</div>
              <div class="md-meta-sub">${dayStr}</div>
            </div>
            <div class="md-meta-item">
              <div class="md-meta-label">${icons.clock} Time</div>
              <div class="md-meta-value">${timeStr}</div>
              <span class="md-duration-chip">${durationLabel}</span>
            </div>
            <div class="md-meta-item">
              <div class="md-meta-label">${icons.globe || icons.settings} Time Zone</div>
              <div class="md-meta-value">IST</div>
              <div class="md-meta-sub">(UTC +05:30)</div>
            </div>
            <div class="md-meta-item">
              <div class="md-meta-label">${icons.users} Type</div>
              <div class="md-meta-value">${settings.access === "private" ? "Private" : "Public"}</div>
            </div>
            <div class="md-meta-item">
              <div class="md-meta-label">${icons.fileText} Category</div>
              <div class="md-meta-value">${m.category || "—"}</div>
            </div>
          </div>
        </div>

        <!-- Overview -->
        <div class="md-card">
          ${tabOverview}
        </div>
      </div>

      <!-- ── Right sidebar ── -->
      <div>
        <!-- QR Code card -->
        <div class="md-sidebar-card qr-card">
          <!-- Gradient header -->
          <div class="qr-card-header">
            <div class="qr-card-header-icon">${icons.qrCode || icons.link}</div>
            <div>
              <div class="qr-card-title">Join with QR Code</div>
              <div class="qr-card-subtitle">Scan to join instantly</div>
            </div>
          </div>

          <!-- QR image frame -->
          <div class="qr-frame-wrap">
            <div class="qr-frame-ring">
              <div class="qr-frame" id="md-host-qr">
                <img src="${qrSrc}" alt="QR Code"
                     style="width:100%;height:100%;object-fit:contain;display:block;border-radius:10px"
                     onerror="this.parentElement.innerHTML='<div style=\\'display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:11px;text-align:center\\'>${icons.qrCode}</div>'" />
              </div>
            </div>
            <!-- Corner decorations -->
            <div class="qr-corner qr-corner-tl"></div>
            <div class="qr-corner qr-corner-tr"></div>
            <div class="qr-corner qr-corner-bl"></div>
            <div class="qr-corner qr-corner-br"></div>
          </div>

          <!-- Scan hint -->
          <div class="qr-hint">
            <div class="qr-hint-dot"></div>
            <span>Point your camera at the code above</span>
          </div>

          <!-- Download button -->
          <div class="qr-download-wrap">
            <button class="qr-download-btn" data-action="mdDownloadQR" data-id="${m.id}">
              ${icons.download} Download QR
            </button>
          </div>
        </div>

        <!-- Meeting Actions card -->
        <div class="md-sidebar-card">
          <div class="md-sidebar-title">Meeting Actions</div>
          <div class="md-actions-body">
            <button class="md-action-btn primary" id="md-start-btn"
                    data-action="mdStartMeeting" data-id="${m.id}">
              ${icons.arrowRight} ${status === "live" ? "Continue Meeting" : "Start Meeting"}
            </button>
            <button class="md-action-btn" data-action="mdInviteParticipants" data-id="${m.id}">
              ${icons.users} Invite Participants
            </button>
            <button class="md-action-btn" data-action="mdShareMeeting" data-id="${m.id}">
              ${icons.share} Share Meeting
            </button>
            <button class="md-action-btn danger" data-action="mdDeleteMeeting" data-id="${m.id}">
              ${icons.flag} Delete Meeting
            </button>
          </div>
        </div>

        <!-- Meeting Summary card -->
        <div class="md-sidebar-card">
          <div class="md-sidebar-title">Meeting Summary</div>
          <div class="md-summary-body">
            <div class="md-summary-row">
              <div class="md-summary-icon">${icons.send}</div>
              <div>
                <div class="md-summary-row-label">Invitations Sent</div>
                <div class="md-summary-row-value">${_createdDate(m)}, ${_createdTime(m)}</div>
              </div>
            </div>
            <div class="md-summary-row">
              <div class="md-summary-icon">${icons.users}</div>
              <div>
                <div class="md-summary-row-label">Participants Joined</div>
                <div class="md-summary-row-value">0/${m.participantCount || 0} Joined</div>
              </div>
            </div>
            <div class="md-summary-row">
              <div class="md-summary-icon">${icons.clock}</div>
              <div>
                <div class="md-summary-row-label">Starts in</div>
                <div class="md-summary-row-value highlight">${startsInStr}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  _paintShell(html);
  _registerHostGlobals(m);
}

function _hostTabOverview(m, joinLink) {
  const settings = m.settings || {};
  const hostName = m.speaker || m.owner?.name || "You";
  const hostInitials = hostName.split(" ").map(w => w[0] || "").join("").slice(0,2).toUpperCase() || "H";

  function detailRow(iconHtml, label, valueHtml) {
    return `
      <div class="ov-row">
        <div class="ov-row-icon">${iconHtml}</div>
        <div class="ov-row-body">
          <div class="ov-row-label">${label}</div>
          <div class="ov-row-value">${valueHtml}</div>
        </div>
      </div>`;
  }

  const passcodeValue = m.code
    ? `<span class="ov-passcode-badge">${icons.shield} ${m.code}</span>`
    : `<span style="color:var(--muted)">—</span>`;

  const linkValue = joinLink
    ? `<div class="ov-link-row">
         <a class="ov-link-text" href="${joinLink}" target="_blank">${joinLink}</a>
         <button class="ov-copy-pill" id="md-copy-link-btn" data-action="mdCopyLink" data-link="${joinLink}">
           ${icons.link} Copy
         </button>
       </div>`
    : `<span style="color:var(--muted)">—</span>`;

  const coHostValue = settings.cohosts
    ? `<span class="ov-chip">${settings.cohosts}</span>`
    : `<span class="ov-empty">None added</span>`;

  return `
    <div class="md-overview-wrap">
      <!-- Description banner -->
      ${m.description
        ? `<div class="ov-desc-banner">${icons.fileText || ""} ${m.description}</div>`
        : `<div class="ov-desc-banner ov-desc-empty">${icons.fileText || ""} No description provided.</div>`}

      <div class="md-overview-grid">
        <!-- Left: detail rows -->
        <div class="ov-details">
          ${detailRow(
            `<div class="ov-icon-wrap ov-icon-purple">${icons.user}</div>`,
            "Host",
            `<div class="ov-host-row">
               <div class="ov-avatar">${hostInitials}</div>
               <span>${hostName} <span class="ov-you-badge">You</span></span>
             </div>`
          )}
          ${detailRow(
            `<div class="ov-icon-wrap ov-icon-blue">${icons.users}</div>`,
            "Co-hosts",
            coHostValue
          )}
          ${detailRow(
            `<div class="ov-icon-wrap ov-icon-green">${icons.messageCircle}</div>`,
            "Language",
            `<span class="ov-chip">${settings.language || "English"}</span>`
          )}
          ${detailRow(
            `<div class="ov-icon-wrap ov-icon-amber">${icons.shield}</div>`,
            "Passcode",
            passcodeValue
          )}
          ${detailRow(
            `<div class="ov-icon-wrap ov-icon-teal">${icons.link}</div>`,
            "Join Link",
            linkValue
          )}
        </div>

        <!-- Right: ready card -->
        <div class="ov-ready-card">
          <div class="ov-ready-glow"></div>
          <div class="ov-ready-illustration">
            <svg viewBox="0 0 100 80" fill="none" xmlns="http://www.w3.org/2000/svg">
              <ellipse cx="50" cy="70" rx="40" ry="8" fill="#e8e4ff"/>
              <rect x="20" y="30" width="25" height="32" rx="6" fill="#c4b5fd"/>
              <rect x="55" y="20" width="25" height="42" rx="6" fill="#8b5cf6"/>
              <circle cx="32" cy="20" r="10" fill="#a78bfa"/>
              <circle cx="67" cy="14" r="11" fill="#7c3aed"/>
              <path d="M30 52 Q50 45 70 52" stroke="#fff" stroke-width="2" fill="none"/>
            </svg>
          </div>
          <div class="ov-ready-badge">Ready to Launch</div>
          <h3 class="ov-ready-title">Be ready to go live!</h3>
          <p class="ov-ready-desc">Start at the scheduled time — participants can join instantly via link or QR code.</p>
          <button class="ov-invite-btn" data-action="mdInviteParticipants" data-id="${m.id}">
            ${icons.users} Invite Participants
          </button>
        </div>
      </div>
    </div>
  `;
}

function _hostTabAgenda(settings) {
  const items = settings.agenda || [];
  if (!items.length) {
    return `<p style="color:var(--muted);font-size:13px">No agenda items added.</p>`;
  }
  return `
    <ul class="md-agenda-list">
      ${items.map(item => `
        <li class="md-agenda-item">
          <div class="md-agenda-dot"></div>
          <div class="md-agenda-time">${item.time || ""}</div>
          <div class="md-agenda-title">${item.title || item}</div>
        </li>
      `).join("")}
    </ul>
  `;
}

function _hostTabSettings(settings) {
  const rows = [
    { icon: icons.messageCircle, label: "Chat",               key: "enableChat",       default: true  },
    { icon: icons.monitor,       label: "Screen Sharing",     key: "screenSharing",    default: true  },
    { icon: icons.arrowUp,       label: "Raise Hand",         key: "raiseHand",        default: true  },
    { icon: icons.mic,           label: "Recording",          key: "recordMeeting",    default: false },
    { icon: icons.helpCircle,    label: "Anonymous Questions",key: "anonymousQuestions",default: false },
    { icon: icons.clock,         label: "Auto End",           key: "autoEnd",          default: false },
  ];
  return `
    <div>
      ${rows.map(r => {
        const val = r.key in settings ? settings[r.key] : r.default;
        return `
          <div class="md-setting-row">
            <div class="md-setting-label">${r.icon} ${r.label}</div>
            <div class="md-setting-value ${val ? "on" : "off"}">${val ? "Enabled" : "Disabled"}</div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

/* ══════════════════════════════════════════════════════════════
   PARTICIPANT VIEW
   ══════════════════════════════════════════════════════════════ */
function _renderParticipantView(m) {
  const title       = m.title || "Untitled Meeting";
  const status      = m.status || "upcoming";
  const isLive      = status === "live";
  const settings    = m.settings || {};
  const { dateStr, timeStr, dayStr, durationLabel } = _fmtMeeting(m);
  const shortId     = m.shortId || m.code || m.id.slice(0,8);
  const hostName    = m.speaker || m.owner?.name || "—";
  const hostEmail   = m.owner?.email || "";
  const hostInitials = hostName.split(" ").map(w => w[0] || "").join("").slice(0,2).toUpperCase() || "H";
  const startsInStr = _startsIn(m);
  const qrSrc       = `/api/sessions/${m.id}/qrcode`;
  const enrollCount = m.enrollmentCount || m.participantCount || 0;

  /* Status notice */
  const noticeHtml = isLive ? `
    <div class="md-notice" style="background:var(--green-soft);border-color:#b7efd4">
      <div class="md-notice-icon" style="background:var(--green-soft)">
        ${icons.checkCircle}
      </div>
      <div class="md-notice-text">
        <h4>This meeting is live now!</h4>
        <p>Click "Join Meeting" to enter the room.</p>
      </div>
    </div>
  ` : `
    <div class="md-notice">
      <div class="md-notice-icon">${icons.info}</div>
      <div class="md-notice-text">
        <h4>This meeting has not started yet.</h4>
        <p>You can join the meeting when the host starts it.</p>
      </div>
      <div class="md-notice-illustration">
        <svg viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="30" cy="30" r="28" fill="currentColor" opacity="0.08"/>
          <path d="M20 38 L20 26 Q20 22 24 22 L40 22 Q44 22 44 26 L44 38 Q44 42 40 42 L24 42 Q20 42 20 38Z"
                fill="currentColor" opacity="0.4"/>
          <circle cx="30" cy="30" r="6" fill="currentColor" opacity="0.6"/>
          <path d="M30 24 L30 30 L34 34" stroke="white" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </div>
    </div>
  `;

  const html = `
    <!-- Breadcrumb -->
    <div class="md-breadcrumb">
      <span data-action="go" data-route="/meetings">Meetings</span>
      <span class="sep">›</span>
      <span data-action="go" data-route="/meetings">Upcoming Meetings</span>
      <span class="sep">›</span>
      <span class="current">Meeting Details</span>
    </div>

    <div class="md-layout">
      <!-- ── Left column ── -->
      <div>
        <!-- Header card -->
        <div class="md-card">
          <div class="md-p-header">
            <div class="md-p-title-row">
              <div class="md-p-icon">${icons.calendar}</div>
              <div>
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">
                  <h1 class="md-p-title">${title}</h1>
                  <span class="md-status-badge ${status}">
                    ${isLive ? '<span class="md-status-dot"></span>' : ""}
                    ${isLive ? "Live" : "Upcoming"}
                  </span>
                </div>
                <div class="md-p-meta-row">
                  <span class="md-p-meta-item">
                    ${icons.calendar}
                    ${dateStr} (${dayStr})
                  </span>
                  <span class="md-p-meta-item">
                    ${icons.clock}
                    ${timeStr} (${durationLabel})
                  </span>
                  <span class="md-p-meta-item">
                    ${icons.users}
                    ${enrollCount} Participants
                  </span>
                </div>
              </div>
            </div>

            <p class="md-p-description">${m.description || "No description provided."}</p>
            ${m.category ? `<span class="md-category-tag">${m.category}</span>` : ""}
          </div>
        </div>

        <!-- Meeting details table -->
        <div class="md-card">
          <div style="padding:20px 28px 4px">
            <h2 style="font-size:15px;font-weight:700;color:var(--ink);margin:0 0 4px">Meeting Details</h2>
          </div>
          <div style="padding:0 28px 20px">
            <table class="md-details-table">
              <tr>
                <td><div class="md-dt-label">${icons.hash} Meeting ID</div></td>
                <td class="md-dt-value">
                  ${shortId}
                  <button class="md-copy-btn" data-action="mdCopyLink" data-link="${shortId}" style="display:inline;margin-left:4px">
                    ${icons.link}
                  </button>
                </td>
              </tr>
              <tr>
                <td><div class="md-dt-label">${icons.user} Host</div></td>
                <td class="md-dt-value">${hostName}</td>
              </tr>
              <tr>
                <td><div class="md-dt-label">${icons.fileText} Description</div></td>
                <td class="md-dt-value" style="max-width:220px;text-align:right">
                  ${m.description || "—"}
                </td>
              </tr>
              <tr>
                <td><div class="md-dt-label">${icons.messageCircle} Language</div></td>
                <td class="md-dt-value">${settings.language || "English"}</td>
              </tr>
              <tr>
                <td><div class="md-dt-label">${icons.users} Participants</div></td>
                <td class="md-dt-value">${enrollCount} Registered</td>
              </tr>
              <tr>
                <td><div class="md-dt-label">${icons.calendar} Meeting Type</div></td>
                <td class="md-dt-value">${settings.access === "private" ? "Private" : "Public"}</td>
              </tr>
              <tr>
                <td><div class="md-dt-label">${icons.clock} Starts In</div></td>
                <td class="md-dt-value countdown">
                  ${startsInStr}<br>
                  <span style="font-size:11px;color:var(--muted);font-weight:400">(Today, ${timeStr.split(" –")[0]})</span>
                </td>
              </tr>
            </table>
          </div>
        </div>

        <!-- Status notice -->
        <div class="md-card" style="padding:20px 24px 16px">
          ${noticeHtml}
          <div class="md-cal-row" data-action="mdAddToCalendar" data-id="${m.id}">
            <div class="md-cal-row-left">${icons.calendar} Add to Calendar</div>
            ${icons.chevronRight}
          </div>
        </div>
      </div>

      <!-- ── Right sidebar ── -->
      <div>
        <!-- Join card -->
        <div class="md-sidebar-card">
          <div class="md-sidebar-title">Join This Meeting</div>
          <div class="md-join-card-body">
            <p class="md-join-card-desc" id="md-join-card-desc">
              ${isLive
                ? "The meeting is live — click Join Meeting to enter!"
                : "Join using the meeting link or QR code when the meeting starts."}
            </p>
            <button class="md-join-btn ${isLive ? "active" : "inactive"}"
                    id="md-join-btn"
                    data-action="mdJoinNowCond" data-islive="${isLive}" data-id="${m.id}">
              ${icons.monitor} Join Meeting
              ${!isLive ? `<br><span id="md-join-time-hint" style="font-size:11px;font-weight:400">(Will be active when the host starts)</span>` : ""}
            </button>

            <div class="md-or-divider">OR</div>

            <div class="md-scan-title">Scan QR Code to Join</div>
            <div class="md-qr-img" style="width:100%;height:auto;aspect-ratio:1;margin:0 0 8px">
              <img src="${qrSrc}" alt="QR Code" style="width:100%;height:100%;object-fit:contain"
                   onerror="this.parentElement.innerHTML='<div style=\\'padding:20px;color:var(--muted);font-size:11px;text-align:center\\'>${icons.qrCode}</div>'" />
            </div>
            <p class="md-scan-caption">Scan this QR code when the meeting starts.</p>
          </div>
        </div>

        <!-- Meeting Information card -->
        <div class="md-sidebar-card">
          <div class="md-sidebar-title">Meeting Information</div>
          <div class="md-info-body">
            <div class="md-info-row">
              <span class="md-info-label">${icons.fileText ? `<span style="display:inline-flex;align-items:center;gap:5px">${icons.fileText} Category</span>` : "Category"}</span>
              <span class="md-info-value">${m.category || "—"}</span>
            </div>
            <div class="md-info-row">
              <span class="md-info-label">Privacy</span>
              <span class="md-info-value">${settings.access === "private" ? "Private" : "Public"}</span>
            </div>
            <div class="md-info-row">
              <span class="md-info-label">Recording</span>
              <span class="md-info-value">${settings.recordMeeting ? "Enabled" : "Not Announced"}</span>
            </div>
            <div class="md-info-row">
              <span class="md-info-label">Q&amp;A</span>
              <span class="md-info-value">${settings.allowQuestions !== false ? "Enabled" : "Disabled"}</span>
            </div>
            <div class="md-info-row">
              <span class="md-info-label">Polls</span>
              <span class="md-info-value">${m.pollCount ? "Enabled" : "Enabled"}</span>
            </div>
          </div>
        </div>

        <!-- Organizer card -->
        <div class="md-sidebar-card">
          <div class="md-sidebar-title">Organizer</div>
          <div class="md-organizer-body">
            <div class="md-organizer-row">
              ${m.owner?.picture
                ? `<img src="${m.owner.picture}" alt="${hostInitials}" class="md-organizer-avatar" style="object-fit:cover">`
                : `<div class="md-organizer-avatar">${hostInitials}</div>`
              }
              <div>
                <div class="md-organizer-name">
                  ${hostName}
                  <span class="md-host-chip">Host</span>
                </div>
                <div class="md-organizer-email">${hostEmail}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  _paintShell(html);
  _registerParticipantGlobals(m);
}

/* ── Date/time helpers ────────────────────────────────────── */
function _fmtMeeting(m) {
  const raw = m.scheduledAt || m.date || m.createdAt;
  let dateStr = "—", timeStr = "—", dayStr = "", durationLabel = "—", tzStr = "";
  if (raw) {
    const d = new Date(raw);
    if (!isNaN(d)) {
      dateStr = d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      dayStr  = d.toLocaleDateString("en-GB", { weekday: "long" });
      timeStr = m.time || d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true });
    }
  } else if (m.date) {
    dateStr = m.date;
    timeStr = m.time || "—";
  }
  const durMins = parseInt(m.duration) || 0;
  if (durMins) {
    const h = Math.floor(durMins / 60), min = durMins % 60;
    durationLabel = h && min ? `${h}h ${min}m` : h ? `${h}h` : `${min}m`;
    if (timeStr !== "—" && durMins) {
      const parts = timeStr.match(/(\d+):(\d+)\s*(am|pm)?/i);
      if (parts) {
        let hr = parseInt(parts[1]) + (parts[3]?.toLowerCase() === "pm" && parseInt(parts[1]) < 12 ? 12 : 0);
        let mn = parseInt(parts[2]) + durMins;
        hr += Math.floor(mn / 60); mn %= 60;
        timeStr = `${timeStr} – ${String(hr % 12 || 12).padStart(2,"0")}:${String(mn).padStart(2,"0")} ${hr >= 12 ? "PM" : "AM"} (${durationLabel})`;
      }
    }
  }
  return { dateStr, timeStr, dayStr, durationLabel, tzStr };
}

function _startsIn(m) {
  const raw = m.scheduledAt;
  if (!raw) return "—";
  const diff = new Date(raw) - Date.now();
  if (diff <= 0) return "Now";
  const h = Math.floor(diff / 3600000), min = Math.floor((diff % 3600000) / 60000), sec = Math.floor((diff % 60000) / 1000);
  if (h > 24) return `${Math.floor(h/24)}d ${h%24}h`;
  return `${h}h ${min}m${h < 2 ? " " + sec + "s" : ""}`;
}

function _createdDate(m) {
  if (!m.createdAt) return "—";
  const d = new Date(m.createdAt);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function _createdTime(m) {
  if (!m.createdAt) return "—";
  const d = new Date(m.createdAt);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true });
}


/* ── Global handlers — HOST ───────────────────────────────── */
function _registerHostGlobals(m) {

  window.mdStartMeeting = async function(meetingId) {
    const btn = document.getElementById("md-start-btn");
    if (btn) { btn.disabled = true; btn.innerHTML = `${icons.clock} Starting…`; }
    try {
      await api(`/api/sessions/${meetingId}/start`, { method: "POST" });
    } catch (e) {
      console.warn("[mdStartMeeting] API error (non-fatal):", e.message);
    }
    state.session = state.session || {};
    state.session.sessionId = meetingId;
    state.isHost = true;
    go("/moderator");
  };

  window.mdEditMeeting = function(meetingId) {
    state.editDraft = { meetingId };
    go("/meetings/create/details");
  };

  window.mdDeleteMeeting = async function(meetingId) {
    if (!confirm("Delete this meeting? This cannot be undone.")) return;
    try {
      await api(`/api/meetings/${meetingId}`, { method: "DELETE" });
      // Remove from localStorage owned list
      try {
        const owned = JSON.parse(localStorage.getItem("cv_owned_meetings") || "[]");
        localStorage.setItem("cv_owned_meetings", JSON.stringify(owned.filter(id => id !== meetingId)));
      } catch {}
    } catch (e) {
      alert("Failed to delete meeting: " + (e.message || "Unknown error"));
    }
    go("/meetings");
  };

  window.mdInviteParticipants = function(meetingId) {
    const m2 = state.joinTarget || {};
    const link = m2.code ? `${location.origin}/#/join/${m2.code}` : location.origin;
    navigator.clipboard.writeText(link).catch(() => {});
    _showToast("Invite link copied to clipboard!");
  };

  window.mdShareMeeting = function() {
    const m2 = state.joinTarget || {};
    const link = m2.code ? `${location.origin}/#/join/${m2.code}` : location.origin;
    if (navigator.share) {
      navigator.share({ title: m2.title || "Meeting", url: link }).catch(() => {});
    } else {
      navigator.clipboard.writeText(link).catch(() => {});
      _showToast("Link copied!");
    }
  };

  window.mdDownloadQR = function(meetingId) {
    const img = document.querySelector("#md-host-qr img");
    if (img?.src) {
      const a = document.createElement("a");
      a.href = img.src; a.download = `qr-${meetingId}.svg`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
  };

  window.mdCopyLink = function(text) {
    navigator.clipboard.writeText(text).then(() => _showToast("Copied!")).catch(() => {});
  };
}

/* ── Global handlers — PARTICIPANT ────────────────────────── */
function _registerParticipantGlobals(m) {
  window.mdJoinNow = function(meetingId) {
    state.joinTarget = m;
    state.session    = state.session || {};
    state.session.sessionId = meetingId;
    go("/joining");
  };

  window.mdAddToCalendar = function(meetingId) {
    const raw = m.scheduledAt || m.date;
    if (!raw) { _showToast("No date set for this meeting."); return; }
    const start = new Date(raw);
    const end   = new Date(start.getTime() + (parseInt(m.duration) || 60) * 60000);
    const fmt = d => d.toISOString().replace(/[-:]/g,"").split(".")[0] + "Z";
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE`
      + `&text=${encodeURIComponent(m.title || "Meeting")}`
      + `&dates=${fmt(start)}/${fmt(end)}`
      + `&details=${encodeURIComponent(m.description || "")}`
      + `&location=${encodeURIComponent(location.origin + "/#/join/" + (m.code || ""))}`;
    window.open(url, "_blank");
  };

  window.mdCopyLink = function(text) {
    navigator.clipboard.writeText(text).then(() => _showToast("Copied!")).catch(() => {});
  };

  /* ── Real-time: dual strategy (WebSocket + REST polling) ──
     1. WebSocket: instant activation the moment the host starts.
     2. Polling fallback: re-fetches meeting status every 8 s so
        participants who load the page after the meeting is already
        live, or who miss the WS event, still get unblocked.      */
  _watchMeetingLive(m.id);
  _pollMeetingStatus(m.id);
}

function _watchMeetingLive(meetingId) {
  if (window._cvDetailWs && window._cvDetailWs.readyState <= 1) return;

  const proto = location.protocol === "https:" ? "wss" : "ws";
  const token = localStorage.getItem("cv_token") || "";
  const wsUrl = `${proto}://${location.host}${token ? "?token=" + encodeURIComponent(token) : ""}`;

  let ws;
  try { ws = new WebSocket(wsUrl); } catch { return; }
  window._cvDetailWs = ws;

  ws.addEventListener("open", () => {
    ws.send(JSON.stringify({
      event: "join_meeting",
      data:  { meetingId, guestToken: _getOrCreateGuestToken(), userName: "Participant" }
    }));
  });

  ws.addEventListener("message", (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    const { event, data } = msg;
    const live =
      (event === "meeting_started"        && data?.meetingId === meetingId) ||
      (event === "meeting_status_changed" && data?.meetingId === meetingId && data?.status === "live");
    if (!live) return;
    _activateLiveUI(meetingId, true);
    ws.close();
    window._cvDetailWs = null;
  });

  ws.addEventListener("close", () => {
    if (window._cvDetailWs === ws) window._cvDetailWs = null;
  });
}

/* REST polling fallback — checks status every 8 s */
function _pollMeetingStatus(meetingId) {
  if (window._cvDetailPoll) clearInterval(window._cvDetailPoll);
  window._cvDetailPoll = setInterval(async () => {
    try {
      const r = await fetch(`/api/meetings/${meetingId}`);
      if (!r.ok) return;
      const body = await r.json();
      if (body?.meeting?.status === "live") {
        clearInterval(window._cvDetailPoll);
        window._cvDetailPoll = null;
        _activateLiveUI(meetingId, false);
      }
    } catch { /* ignore network errors */ }
  }, 8000);
}

/* Shared live-UI activation — idempotent, safe to call twice */
function _activateLiveUI(meetingId, showToast) {
  const joinBtn = document.getElementById("md-join-btn");
  if (joinBtn && joinBtn.classList.contains("active")) return; // already done

  // Join button
  if (joinBtn) {
    joinBtn.className = "md-join-btn active";
    joinBtn.onclick   = () => window.mdJoinNow(meetingId);
    joinBtn.innerHTML =
      `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
       fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
       <rect x="2" y="3" width="20" height="14" rx="2"/><path d="m8 21 4-4 4 4"/><path d="M12 17v4"/>
       </svg> Join Meeting`;
  }

  // Description + QR caption
  const desc = document.getElementById("md-join-card-desc");
  if (desc) desc.textContent = "The meeting is live \u2014 click Join Meeting to enter!";
  const cap = document.getElementById("md-scan-caption");
  if (cap) cap.textContent = "Scan this QR code to join now.";

  // Notice banner
  const notice = document.querySelector(".md-notice");
  if (notice) {
    notice.style.background  = "var(--green-soft,#f0fdf4)";
    notice.style.borderColor = "#b7efd4";
    const icon = notice.querySelector(".md-notice-icon");
    if (icon) icon.style.background = "var(--green-soft,#f0fdf4)";
    const txt = notice.querySelector(".md-notice-text");
    if (txt) txt.innerHTML = `<h4 style="color:#16a34a">\u{1F7E2} This meeting is live now!</h4>
      <p>Click \u201cJoin Meeting\u201d to enter the room.</p>`;
    const ill = notice.querySelector(".md-notice-illustration");
    if (ill) ill.style.display = "none";
  }

  // Status badge
  const badge = document.querySelector(".md-status-badge");
  if (badge) {
    badge.className = "md-status-badge live";
    badge.innerHTML = `<span class="md-status-dot"></span> Live`;
  }

  if (showToast) _showToast("\u{1F7E2} Meeting is live! You can now join.");
}

function _getOrCreateGuestToken() {
  const KEY = "cv_guest_token";
  let t = localStorage.getItem(KEY);
  if (!t) {
    t = "guest_" + Math.random().toString(36).slice(2) + "_" + Date.now();
    localStorage.setItem(KEY, t);
  }
  return t;
}


/* ── Toast helper ─────────────────────────────────────────── */
function _showToast(msg) {
  const t = document.createElement("div");
  t.textContent = msg;
  Object.assign(t.style, {
    position:"fixed", bottom:"24px", left:"50%", transform:"translateX(-50%)",
    background:"var(--ink)", color:"#fff", padding:"10px 20px",
    borderRadius:"var(--radius-full)", fontSize:"13px", fontWeight:"600",
    zIndex:"9999", pointerEvents:"none",
    animation:"fadeIn 0.2s ease"
  });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2000);
}
