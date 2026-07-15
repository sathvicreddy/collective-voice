/* ============================================================
   Application Entry Point & Router
   ============================================================ */
import { state } from "./state.js";
import { api, go } from "./utils/api.js";
import { icons } from "./utils/icons.js";
import { dispatch, getSessionState } from "./store/SessionStore.js";

// Import Page Renderers
import { renderWelcome, renderOnboarding, renderLogin, renderForgot, renderReset } from "./pages/auth.js";
import { renderHome } from "./pages/home.js";
import { renderMeetings, renderJoin, renderJoining, renderCreate, renderConductedMeetings } from "./pages/meetings.js";
import { renderActivity } from "./pages/activity.js";
import { renderProfile } from "./pages/profile.js";
import { renderSettings } from "./pages/settings.js";
import {
  renderAudience, renderModerator, renderSpeaker,
  sessionSwitchView, sessionPromoteToSpeaker
} from "./pages/session.js";
import { renderAnalytics } from "./pages/analytics.js";
import { renderNotifications } from "./pages/notifications.js";
import { renderQuestionDetail } from "./pages/questions.js";

// View-level handlers (registered globally for inline onclick)
import {
  moderatorSearchQuestions, moderatorSortQueue,
  moderatorDeferQuestion, moderatorShowQuestionMenu,
  moderatorFlagQuestion, moderatorAnswerQuestion,
  moderatorTogglePause, moderatorClearAnswered,
  moderatorBroadcastAnnouncement, moderatorCreatePoll, moderatorMakeSpeaker
} from "./views/ModeratorView.js";
import { speakerSaveNotes, speakerStartAnswering, speakerSkipQuestion, speakerMarkAnswered, speakerDeferQuestion } from "./views/SpeakerView.js";
import {
  participantUpdateCharCount, participantSubmitQuestion,
  participantUpvote, participantVotePoll
} from "./views/ParticipantView.js";
import { authSubmit, authForgot, authReset } from "./pages/auth.js";

const app = document.querySelector("#app");

/* --- Actions ----------------------------------------------- */

/**
 * Reads the meeting-details form fields and settings toggles
 * into state.createDraft, then navigates to the invite step.
 */
export function saveDetails() {
  state.createDraft.title       = document.querySelector("#title")?.value       || state.createDraft.title;
  state.createDraft.date        = document.querySelector("#date")?.value        || state.createDraft.date;
  state.createDraft.time        = document.querySelector("#time")?.value        || state.createDraft.time;
  state.createDraft.duration    = document.querySelector("#duration")?.value    || state.createDraft.duration;
  state.createDraft.description = document.querySelector("#description")?.value || state.createDraft.description;
  // Read the 4 setting toggles by id
  state.createDraft.settings = {
    allowQuestions:  document.querySelector("#settingAllowQuestions")?.checked  ?? true,
    enableChat:      document.querySelector("#settingEnableChat")?.checked      ?? true,
    recordMeeting:   document.querySelector("#settingRecordMeeting")?.checked   ?? false,
    allowScreenShare:document.querySelector("#settingAllowScreenShare")?.checked ?? true,
  };
  go("/meetings/create/invite");
}

/**
 * Looks up a meeting code via the API and stores the full meeting
 * object in state.joinTarget so preview/waiting screens use it.
 */
export async function validateMeetingCode() {
  const code = document.querySelector("#meetingCode")?.value.trim();
  if (!code) { go("/join/invalid"); return; }
  try {
    const response = await fetch(`/api/sessions/code/${code}`);
    if (!response.ok) { go("/join/invalid"); return; }
    const result = await response.json();
    state.joinTarget = result.meeting;  // ← store it for preview/waiting screens
    state.isHost = false;
    go(result.meeting.status === "upcoming" ? "/join/waiting" : "/join/preview");
  } catch {
    go("/join/invalid");
  }
}

export async function createMeeting() {
  try {
    const result = await api("/api/sessions", {
      method: "POST",
      body: JSON.stringify(state.createDraft)
    });
    state.meetings.unshift(result.meeting);
    state.isHost = true;
    // Store meeting id so session knows which meeting this is
    state.session.sessionId = result.meeting.id;
    state.joinTarget = result.meeting;
    // Track ALL owned meetings (supports hosting multiple concurrent meetings)
    // instead of the old single-key cv_host_meeting approach.
    try {
      const owned = JSON.parse(localStorage.getItem("cv_owned_meetings") || "[]");
      if (!owned.includes(result.meeting.id)) owned.push(result.meeting.id);
      localStorage.setItem("cv_owned_meetings", JSON.stringify(owned));
    } catch {}
    go("/meetings/created");
  } catch (error) {
    console.error("Failed to create meeting:", error);
  }
}

/* --- Global Registration for Inline Handlers -------------- */
window.go = go;
window.saveDetails = saveDetails;
window.validateMeetingCode = validateMeetingCode;
window.createMeeting = createMeeting;
window.renderActivity = renderActivity;

// Auth handlers
window.authSubmit = authSubmit;
window.authForgot = authForgot;
window.authReset  = authReset;

// Session view handlers
window.sessionSwitchView      = sessionSwitchView;
window.sessionPromoteToSpeaker = sessionPromoteToSpeaker;

// Moderator handlers (per-question assign removed — speaker is session-level)
window.moderatorSearchQuestions    = moderatorSearchQuestions;
window.moderatorSortQueue          = moderatorSortQueue;
window.moderatorDeferQuestion      = moderatorDeferQuestion;
window.moderatorShowQuestionMenu   = moderatorShowQuestionMenu;
window.moderatorFlagQuestion       = moderatorFlagQuestion;
window.moderatorAnswerQuestion     = moderatorAnswerQuestion;
window.moderatorTogglePause        = moderatorTogglePause;
window.moderatorClearAnswered      = moderatorClearAnswered;
window.moderatorBroadcastAnnouncement = moderatorBroadcastAnnouncement;
window.moderatorCreatePoll         = moderatorCreatePoll;
window.moderatorMakeSpeaker        = moderatorMakeSpeaker;

// Speaker handlers
window.speakerSaveNotes       = speakerSaveNotes;
window.speakerStartAnswering  = speakerStartAnswering;
window.speakerSkipQuestion    = speakerSkipQuestion;
window.speakerMarkAnswered    = speakerMarkAnswered;
window.speakerDeferQuestion   = speakerDeferQuestion;

// Participant handlers
window.participantUpdateCharCount = participantUpdateCharCount;
window.participantSubmitQuestion  = participantSubmitQuestion;
window.participantUpvote          = participantUpvote;
window.participantVotePoll        = participantVotePoll;

/* --- Data Loading & Router --------------------------------- */
export async function loadData() {
  // Show a loading indicator while data is in flight
  state.isLoading = true;

  try {
    const [home, meetings, activity, notifications, sessionAnalytics] = await Promise.all([
      api("/api/home").catch(() => null),
      api("/api/meetings").catch(() => ({ meetings: [] })),
      api("/api/activity").catch(() => null),
      api("/api/notifications").catch(() => ({ notifications: [] })),
      api("/api/analytics").catch(() => null)
    ]);

    state.home             = home;
    state.meetings         = meetings.meetings || [];
    state.activity         = activity;
    state.notifications    = notifications.notifications || [];
    state.sessionAnalytics = sessionAnalytics;

    // Try to restore session from JWT on reload.
    // If the access token is expired, attempt a refresh before giving up.
    const token = state.token;
    if (token) {
      let meRes = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Access token may have expired (1h) — try refresh
      if (!meRes.ok && meRes.status === 401) {
        const refreshToken = (() => {
          try { return localStorage.getItem("cv_refresh_token"); } catch { return null; }
        })();

        if (refreshToken) {
          const refreshRes = await fetch("/api/auth/refresh", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken })
          }).catch(() => null);

          if (refreshRes?.ok) {
            const refreshData = await refreshRes.json();
            state.token = refreshData.token;
            try {
              localStorage.setItem("cv_token", refreshData.token);
              localStorage.setItem("cv_refresh_token", refreshData.refreshToken);
            } catch {}
            // Retry /api/auth/me with the new access token
            meRes = await fetch("/api/auth/me", {
              headers: { Authorization: `Bearer ${refreshData.token}` }
            });
          }
        }
      }

      if (meRes.ok) {
        const me = await meRes.json();
        state.profile = { user: me.user };
        const ownedIds = me.user.ownedMeetingIds || [];

        // Derive isHost per-meeting from ownedMeetingIds (supports multiple concurrent meetings)
        // Old single-key approach: localStorage.getItem("cv_host_meeting")
        const storedOwned = (() => {
          try { return JSON.parse(localStorage.getItem("cv_owned_meetings") || "[]"); } catch { return []; }
        })();

        const allOwned    = [...new Set([...ownedIds, ...storedOwned])];
        const sessionId   = state.session?.sessionId;
        if (sessionId && allOwned.includes(sessionId)) {
          state.isHost = true;
        } else if (allOwned.length > 0 && !sessionId) {
          // Restore last hosted meeting if session not already set
          const lastOwned = allOwned[allOwned.length - 1];
          const found     = state.meetings.find(m => m.id === lastOwned);
          if (found && (found.status === "live" || found.status === "upcoming")) {
            state.isHost = true;
            state.session.sessionId = lastOwned;
          }
        }
      } else {
        // Token invalid / refresh failed — clear auth
        state.token = null;
        state.profile = null;
        try {
          localStorage.removeItem("cv_token");
          localStorage.removeItem("cv_refresh_token");
        } catch {}
      }
    }

    // Load per-user profile after identity is confirmed
    if (state.token) {
      const profileRes = await api("/api/profile").catch(() => null);
      if (profileRes) state.profile = profileRes;
    }
  } finally {
    state.isLoading = false;
  }
}

/* Public routes that do not require API data */
const PUBLIC_ROUTES = ["/welcome", "/splash", "/login", "/signup", "/forgot", "/reset"];

/**
 * Route guard helper.
 * Returns true if the current state satisfies the role requirement.
 * Used by session pages to gate access instead of ad-hoc checks inside each renderer.
 */
export function requireRole(role) {
  if (role === "moderator" && !state.isHost) {
    go("/audience"); // redirect non-owners to participant view
    return false;
  }
  if (role === "speaker" && !state.session?.canSpeak) {
    go("/audience");
    return false;
  }
  return true;
}

export function render() {
  const route = state.route;

  // Auth pages render immediately — no API data needed
  if (route === "/welcome" || route === "/splash") return renderWelcome();
  if (route.startsWith("/onboarding/")) return renderOnboarding(route.split("/").pop());
  if (route === "/login")    return renderLogin("login");
  if (route === "/signup")   return renderLogin("signup");
  if (route === "/forgot")   return renderForgot();
  if (route === "/reset")    return renderReset();

  // All other routes need data
  if (!state.home) return;

  if (route === "/home")     return renderHome();
  if (route === "/meetings") return renderMeetings();

  if (route === "/activity")            return renderActivity("questions");
  if (route === "/activity/overview")   return renderActivity("overview");
  if (route === "/activity/meetings")   return renderActivity("meetings");
  if (route === "/activity/insights")   return renderActivity("insights");

  if (route === "/conducted") return renderConductedMeetings();
  if (route === "/profile")   return renderProfile();
  if (route === "/settings")  return renderSettings();

  if (route === "/join")          return renderJoin("start");
  if (route === "/join/scan")     return renderJoin("scan");
  if (route === "/join/id")       return renderJoin("id");
  if (route === "/join/preview")  return renderJoin("preview");
  if (route === "/join/waiting")  return renderJoin("waiting");
  if (route === "/join/invalid")  return renderJoin("invalid");
  if (route === "/joining")       return renderJoining();

  if (route === "/meetings/create")          return renderCreate("type");
  if (route === "/meetings/create/details")  return renderCreate("details");
  if (route === "/meetings/create/invite")   return renderCreate("invite");
  if (route === "/meetings/create/review")   return renderCreate("review");
  if (route === "/meetings/created")         return renderCreate("done");

  // Session routes — role-guarded
  if (route === "/audience")  return renderAudience();
  if (route === "/moderator") return renderModerator();
  if (route === "/speaker")   return renderSpeaker();

  if (route === "/analytics") return renderAnalytics();
  if (route.startsWith("/question/")) return renderQuestionDetail(route.split("/").pop());
  if (route === "/notifications") return renderNotifications();

  renderHome(); // Fallback
}

// Render auth page immediately on load (don't wait for data)
render();

// Then load data and re-render
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

window.addEventListener("hashchange", () => {
  state.route = location.hash.replace("#", "") || "/home";
  render();
});
