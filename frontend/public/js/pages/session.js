/* ============================================================
   Live Session Pages — Auto role assignment
   - Meeting creator (state.isHost === true) → Moderator
   - User assigned as speaker by moderator   → Speaker
   - Everyone else who joins                 → Participant
   No role-picker screen; roles are derived automatically.
   ============================================================ */
import { icons } from "../utils/icons.js";
import { state } from "../state.js";
import { go } from "../utils/api.js";
import { dispatch, getSessionState, startSessionTimer } from "../store/SessionStore.js";
import { getSocket } from "../hooks/socket.js";

import { renderModeratorView } from "../views/ModeratorView.js";
import { renderSpeakerView }   from "../views/SpeakerView.js";
import { renderParticipantView } from "../views/ParticipantView.js";

const app = document.querySelector("#app");

// ── Derive role from app state ────────────────────────────────
function _deriveRole() {
  if (state.isHost) return "moderator";
  if (state.session?.role === "speaker") return "speaker";
  return "participant";
}

// ── Session Shell ─────────────────────────────────────────────
function sessionShell(role) {
  const user = state.profile?.user || {};
  const name = user.name || "Ananya Sharma";
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const activeView = state.session.activeView;

  // Tabs visible per role:
  //  - moderator : Moderator + Speaker (to preview) + Audience tabs
  //  - speaker   : Speaker tab only
  //  - participant: Audience tab only
  const navTabs = role === "moderator"
    ? [
        { id: "moderator",   label: "Moderator", icon: icons.shield },
        { id: "speaker",     label: "Speaker View", icon: icons.mic  },
        { id: "participant", label: "Audience",  icon: icons.users  },
      ]
    : role === "speaker"
    ? [{ id: "speaker",     label: "Speaker",   icon: icons.mic    }]
    : [{ id: "participant", label: "Audience",  icon: icons.users  }];

  const roleLabel = role === "moderator" ? "Moderator"
                  : role === "speaker"   ? "Speaker"
                  : "Participant";

  return `
    <div class="ses-shell">
      <nav class="ses-navbar">
        <div class="ses-navbar-brand">
          <div class="brand-mark" style="width:28px;height:28px">${icons.mic}</div>
          <span>Collective<span>Voice</span></span>
        </div>

        <div class="ses-navbar-tabs">
          ${navTabs.map(tab => `
            <button class="ses-nav-tab ${activeView === tab.id ? "ses-tab-active" : ""}"
              data-action="sessionSwitchView" data-view="${tab.id}">
              ${tab.icon} ${tab.label}
            </button>
          `).join("")}
        </div>

        <div class="ses-navbar-right">
          <button class="ses-icon-btn" data-action="go" data-route="/notifications" title="Notifications">
            ${icons.bell}
          </button>
          <div class="ses-user-pill" data-action="go" data-route="/profile">
            <div class="ses-avatar">${initials}</div>
            <div class="ses-user-info">
              <span class="ses-user-name">${name}</span>
              <span class="ses-user-role">${roleLabel}</span>
            </div>
          </div>
          <button class="ses-icon-btn ses-exit-btn" data-action="go" data-route="/home" title="Exit session">
            ${icons.arrowLeft}
          </button>
        </div>
      </nav>

      <main class="ses-content" id="sessionViewContent"></main>

      <!-- Mobile bottom navigation bar (hidden on desktop) -->
      <nav class="ses-mobile-bottom-nav">
        ${navTabs.map(tab => `
          <button class="ses-mob-tab ${activeView === tab.id ? "ses-mob-tab-active" : ""}"
            data-action="sessionSwitchView" data-view="${tab.id}">
            <span class="ses-mob-tab-icon">${tab.icon}</span>
            <span class="ses-mob-tab-label">${tab.label}</span>
          </button>
        `).join("")}
        <button class="ses-mob-tab ses-mob-tab-exit" data-action="go" data-route="/home">
          <span class="ses-mob-tab-icon">${icons.arrowLeft}</span>
          <span class="ses-mob-tab-label">Exit</span>
        </button>
      </nav>
    </div>
  `;
}

// ── Mount session ─────────────────────────────────────────────
function mountSession() {
  const role = _deriveRole();

  state.session = state.session || {};
  state.session.role       = role;
  state.session.canSpeak   = false;
  state.session.activeView = role === "moderator" ? "moderator"
                           : role === "speaker"   ? "speaker"
                           : "participant";

  // Security: resolve meetingId ONLY from a verified, user-initiated source.
  // Never fall back to "whatever is live" or a hardcoded demo id — that would
  // silently place the user into a meeting they never joined.
  const meetingId = state.session.sessionId || state.joinTarget?.id;
  if (!meetingId) {
    // No verified meeting id present — bounce back to the join flow with a
    // clear message so the user knows what to do.
    console.warn("[session] No verified meetingId found — redirecting to /join");
    go("/join");
    return;
  }
  state.session.sessionId = meetingId;

  app.innerHTML = sessionShell(role);
  const container = document.querySelector("#sessionViewContent");

  // Boot realtime layer — also auto-joins the meeting (see socket.js onopen)
  const socket = getSocket();
  startSessionTimer();

  // Emit join_meeting so server routes events to this client and sends snapshot
  socket.joinMeeting(
    meetingId,
    state.profile?.user?.id   || null,
    state.profile?.user?.name || "Guest"
  );

  // Fallback REST load in case WS snapshot is delayed
  fetch(`/api/session/live?meetingId=${meetingId}`)
    .then(r => r.json())
    .then(data => dispatch({ type: "SESSION_LOADED", payload: data }))
    .catch(() => {});

  // Listen for speaker_changed — show confirmation popup to the targeted participant
  // (handled by module-level cv:speaker_invite CustomEvent listener below)

  _renderActiveView(container);
}


function _renderActiveView(container) {
  if (!container) return;
  const view = state.session?.activeView || "participant";
  if (view === "moderator") renderModeratorView(container);
  else if (view === "speaker") renderSpeakerView(container);
  else renderParticipantView(container);
}

// ── Entry points (called by router in app.js) ───────────────────────────
function _requireAuth() {
  if (!state.token) { go("/login"); return false; }
  return true;
}

export function renderAudience() {
  if (!_requireAuth()) return;
  // Participants and anyone navigating to /audience
  // If they're the host, redirect to /moderator
  if (state.isHost) { go("/moderator"); return; }
  mountSession();
}

export function renderModerator() {
  if (!_requireAuth()) return;
  // Only the host can access /moderator
  if (!state.isHost) { go("/audience"); return; }
  mountSession();
}

export function renderSpeaker() {
  if (!_requireAuth()) return;
  // /speaker route: only accessible if assigned as speaker or is host
  if (!state.isHost && state.session?.role !== "speaker") {
    go("/audience"); return;
  }
  mountSession();
}

// ── Global handlers ───────────────────────────────────────────

export function sessionPromoteToSpeaker(userId) {
  const me = state.profile?.user?.id;
  if (me && me === userId) _doPromoteToSpeaker(null);
}

// ── Module-level speaker invite listener ──────────────────────
// Registered once at module load — fires for every cv:speaker_invite event
// regardless of when mountSession() is called. No race conditions.
document.addEventListener("cv:speaker_invite", (e) => {
  const { participantId, speakerName, meetingId } = e.detail || {};
  if (!participantId) return;
  const role = state.session?.activeView;
  if (role === "moderator" || role === "speaker") return;
  _showSpeakerInvitePopup(speakerName || "Speaker", participantId, meetingId);
});

document.addEventListener("cv:speaker_changed", (e) => {
  const { status, participantId } = e.detail || {};
  if (status === "revoked") {
    _removeSpeakerPopup();
    // If the current user was the speaker, demote them back to audience
    const myPid   = state.myParticipantId;
    const myRole  = state.session?.role;
    const isMe    = participantId && myPid && participantId === myPid;
    const isSpeaker = myRole === "speaker";
    if (isMe || isSpeaker) {
      state.session            = state.session || {};
      state.session.role       = "participant";
      state.session.activeView = "participant";
      // Re-mount so the speaker sees the audience UI immediately
      mountSession();
    }
  }
});

/** Renders the speaker-invite confirmation modal */
function _showSpeakerInvitePopup(assignedName, participantId, meetingId) {
  _removeSpeakerPopup();

  const overlay = document.createElement("div");
  overlay.id = "cv-speaker-invite-overlay";
  overlay.style.cssText = [
    "position:fixed;inset:0;z-index:99999",
    "display:flex;align-items:center;justify-content:center",
    "background:rgba(15,10,40,0.55);backdrop-filter:blur(6px)",
    "animation:cvFadeIn 0.25s ease"
  ].join(";");

  overlay.innerHTML = `
    <div style="background:#fff;border-radius:20px;padding:36px 32px;max-width:420px;width:92%;text-align:center;box-shadow:0 24px 64px rgba(99,102,241,0.22),0 4px 16px rgba(0,0,0,0.12);animation:cvSlideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)">
      <div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;margin:0 auto 20px"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:28px;height:28px"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg></div>
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#1a1035">You've been invited to speak!</h2>
      <p style="margin:0 0 6px;font-size:14px;color:#6b7280;line-height:1.5">
        The moderator has selected <strong style="color:#6366f1">${assignedName}</strong> as the current speaker.
      </p>
      <p style="margin:0 0 28px;font-size:13px;color:#9ca3af">Accept to enter the Speaker view and answer questions live. Decline to stay in the Audience.</p>
      <div style="display:flex;gap:12px">
        <button id="cv-spk-decline" style="flex:1;padding:13px 20px;border-radius:12px;border:2px solid #e5e7eb;background:#fff;font-size:14px;font-weight:600;color:#6b7280;cursor:pointer;transition:all 0.2s">&times; Decline</button>
        <button id="cv-spk-accept" style="flex:1;padding:13px 20px;border-radius:12px;border:none;background:linear-gradient(135deg,#6366f1,#8b5cf6);font-size:14px;font-weight:700;color:#fff;cursor:pointer;box-shadow:0 4px 14px rgba(99,102,241,0.4);transition:all 0.2s"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;vertical-align:-1px;margin-right:4px"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>Accept</button>
      </div>
    </div>
    <style>
      @keyframes cvFadeIn{from{opacity:0}to{opacity:1}}
      @keyframes cvSlideUp{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}
    </style>
  `;

  document.body.appendChild(overlay);

  document.getElementById("cv-spk-accept").addEventListener("click", () => {
    _removeSpeakerPopup();
    const socket = getSocket();
    const mid = meetingId || state.session?.sessionId;
    const pid = participantId || state.myParticipantId;
    socket.emit("speaker_accepted", { meetingId: mid, participantId: pid, speakerName: assignedName });
    _doPromoteToSpeaker(pid);
  });

  document.getElementById("cv-spk-decline").addEventListener("click", () => {
    _removeSpeakerPopup();
    const socket = getSocket();
    const mid = meetingId || state.session?.sessionId;
    const pid = participantId || state.myParticipantId;
    socket.emit("speaker_declined", { meetingId: mid, participantId: pid });
  });
}

function _removeSpeakerPopup() {
  document.getElementById("cv-speaker-invite-overlay")?.remove();
}

function _doPromoteToSpeaker(participantId) {
  state.session            = state.session || {};
  state.session.role       = "speaker";
  state.session.activeView = "speaker";
  if (participantId) state.myParticipantId = participantId;
  mountSession();
}

export function sessionSwitchView(viewId) {
  state.session.activeView = viewId;

  // Update desktop navbar tab active states
  document.querySelectorAll(".ses-nav-tab").forEach(btn => {
    btn.classList.toggle("ses-tab-active", btn.getAttribute("onclick").includes(`'${viewId}'`));
  });

  // Update mobile bottom nav tab active states
  document.querySelectorAll(".ses-mob-tab").forEach(btn => {
    const onclick = btn.getAttribute("onclick") || "";
    const isActive = onclick.includes(`'${viewId}'`);
    btn.classList.toggle("ses-mob-tab-active", isActive);
  });

  const container = document.querySelector("#sessionViewContent");
  if (container) _renderActiveView(container);
}

