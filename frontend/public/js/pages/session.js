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
              onclick="sessionSwitchView('${tab.id}')">
              ${tab.icon} ${tab.label}
            </button>
          `).join("")}
        </div>

        <div class="ses-navbar-right">
          <button class="ses-icon-btn" onclick="go('/notifications')" title="Notifications">
            ${icons.bell}
          </button>
          <div class="ses-user-pill" onclick="go('/profile')">
            <div class="ses-avatar">${initials}</div>
            <div class="ses-user-info">
              <span class="ses-user-name">${name}</span>
              <span class="ses-user-role">${roleLabel}</span>
            </div>
          </div>
          <button class="ses-icon-btn ses-exit-btn" onclick="go('/home')" title="Exit session">
            ${icons.arrowLeft}
          </button>
        </div>
      </nav>

      <main class="ses-content" id="sessionViewContent"></main>
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

  // Resolve meetingId: from joinTarget, created meeting, or fallback to live demo
  const meetingId = state.session.sessionId
    || state.joinTarget?.id
    || state.meetings?.find(m => m.status === "live")?.id
    || "m_ai_education";
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

  // Listen for speaker_changed events to auto-promote this tab if needed
  socket.on("speaker_changed", (data) => {
    sessionPromoteToSpeaker(data.speakerId);
  });

  _renderActiveView(container);
}


function _renderActiveView(container) {
  if (!container) return;
  const view = state.session?.activeView || "participant";
  if (view === "moderator") renderModeratorView(container);
  else if (view === "speaker") renderSpeakerView(container);
  else renderParticipantView(container);
}

// ── Entry points (called by router in app.js) ─────────────────
export function renderAudience() {
  // Participants and anyone navigating to /audience
  // If they're the host, redirect to /moderator
  if (state.isHost) { go("/moderator"); return; }
  mountSession();
}

export function renderModerator() {
  // Only the host can access /moderator
  if (!state.isHost) { go("/audience"); return; }
  mountSession();
}

export function renderSpeaker() {
  // /speaker route: only accessible if assigned as speaker or is host
  if (!state.isHost && state.session?.role !== "speaker") {
    go("/audience"); return;
  }
  mountSession();
}

// ── Global handlers ───────────────────────────────────────────

/**
 * Called by the moderator when assigning a question to a speaker.
 * This marks that specific user as a speaker in the shared session store.
 * In a real app this would emit a socket event so the assignee's UI switches;
 * here we update state.session.role if the current user is the assigned speaker.
 */
export function sessionPromoteToSpeaker(userId) {
  // If current user matches, switch their local role to speaker
  const me = state.profile?.user?.id;
  if (me && me === userId) {
    state.session.role = "speaker";
    state.session.activeView = "speaker";
    mountSession();
  }
}

export function sessionSwitchView(viewId) {
  state.session.activeView = viewId;
  // Update active tab highlight without full re-mount
  document.querySelectorAll(".ses-nav-tab").forEach(btn => {
    btn.classList.toggle("ses-tab-active", btn.getAttribute("onclick").includes(`'${viewId}'`));
  });
  const container = document.querySelector("#sessionViewContent");
  if (container) _renderActiveView(container);
}
