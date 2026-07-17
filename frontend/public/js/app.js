/* ============================================================
   Application Entry Point & Router
   ============================================================ */
import { state } from "./state.js";
import { api, go } from "./utils/api.js";
import { icons } from "./utils/icons.js";
import { dispatch, getSessionState } from "./store/SessionStore.js";

// Import Page Renderers
import { renderWelcome, renderOnboarding, renderLogin, renderForgot, renderReset } from "./pages/auth.js";
import { renderHome, homejoinLive } from "./pages/home.js";
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
import { renderSessionReport } from "./pages/report.js";

// View-level handlers (registered globally for inline onclick)
import {
  moderatorSearchQuestions, moderatorSortQueue,
  moderatorDeferQuestion, moderatorShowQuestionMenu,
  moderatorFlagQuestion, moderatorAnswerQuestion,
  moderatorTogglePause, moderatorClearAnswered,
  moderatorBroadcastAnnouncement, moderatorCreatePoll, moderatorMakeSpeaker,
  moderatorEndSession, moderatorGoLive
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
 * Reads all create-meeting form fields into state.createDraft,
 * validates required fields, then directly calls createMeeting().
 */
export function saveDetails() {
  const titleEl    = document.querySelector("#title");
  const dateEl     = document.querySelector("#date");
  const timeEl     = document.querySelector("#time");
  const durationEl = document.querySelector("#duration-visible") || document.querySelector("#duration");
  const descEl     = document.querySelector("#description");
  const speakerEl  = document.querySelector("#speaker");
  const tzEl       = document.querySelector("#timezone");

  if (titleEl)    state.createDraft.title       = titleEl.value.trim()    || state.createDraft.title;
  if (dateEl)     state.createDraft.date        = dateEl.value            || state.createDraft.date;
  if (timeEl)     state.createDraft.time        = timeEl.value            || state.createDraft.time;
  if (durationEl) state.createDraft.duration    = durationEl.value        || state.createDraft.duration;
  if (descEl)     state.createDraft.description = descEl.value.trim();
  if (speakerEl)  state.createDraft.speaker     = speakerEl.value.trim();
  if (tzEl)       state.createDraft.timezone    = tzEl.value;

  // Validate required fields
  if (!state.createDraft.title) {
    titleEl?.focus();
    titleEl?.setCustomValidity("Title is required");
    titleEl?.reportValidity();
    return;
  }

  // For scheduled meetings, require date and time
  if (state.createDraft.type === "scheduled") {
    if (!state.createDraft.date) {
      dateEl?.focus();
      dateEl?.setCustomValidity("Please select a date");
      dateEl?.reportValidity();
      return;
    }
    if (!state.createDraft.time) {
      timeEl?.focus();
      timeEl?.setCustomValidity("Please select a start time");
      timeEl?.reportValidity();
      return;
    }
  }

  state.createDraft.settings = {
    allowQuestions:   document.querySelector("#settingAllowQuestions")?.checked  ?? true,
    enableChat:       document.querySelector("#settingEnableChat")?.checked       ?? true,
    upvoteReact:      document.querySelector("#settingUpvoteReact")?.checked      ?? true,
    recordMeeting:    document.querySelector("#settingRecordMeeting")?.checked    ?? false,
    showParticipants: document.querySelector("#settingShowParticipants")?.checked ?? true,
    requireApproval:  document.querySelector("#settingRequireApproval")?.checked  ?? false,
    qaMode:    document.querySelector("#qaMode")?.value    || "open",
    language:  document.querySelector("#language")?.value || "English",
  };

  // Skip invite/review — directly create the meeting
  createMeeting();
}

/**
 * Reads the meeting-code form field and delegates to validateMeetingCodeDirect.
 * Called by the /join/id page's "Join Meeting" button.
 */
export async function validateMeetingCode() {
  const code = document.querySelector("#meetingCode")?.value.trim();
  validateMeetingCodeDirect(code);
}

/**
 * Core meeting-code lookup logic — shared by the form-based flow
 * (/join/id page) and the deep-link route (#/join/:code).
 *
 * Fetches the meeting by code, stores it in state.joinTarget, then
 * redirects to /join/preview (live) or /join/waiting (upcoming).
 * On failure, goes to /join/invalid.
 */
export async function validateMeetingCodeDirect(code) {
  if (!code) { go("/join/invalid"); return; }
  try {
    const response = await fetch(`/api/sessions/code/${code}`);
    if (!response.ok) { go("/join/invalid"); return; }
    const result = await response.json();
    state.joinTarget = result.meeting;
    state.isHost = false;
    go(result.meeting.status === "upcoming" ? "/join/waiting" : "/join/preview");
  } catch {
    go("/join/invalid");
  }
}

export async function createMeeting() {
  // Disable both the main and right-panel create buttons to prevent double-submit
  const btns = document.querySelectorAll("#createMeetingBtn, #createMeetingBtnRight");
  btns.forEach(b => { b.disabled = true; b.textContent = "Creating…"; });
  try {
    const draft = state.createDraft;

    // Build scheduled datetime — combine date + time if both provided
    let scheduledAt = null;
    if (draft.date && draft.time) {
      // date is "YYYY-MM-DD", time is "HH:MM" from native pickers
      try {
        scheduledAt = new Date(`${draft.date}T${draft.time}`).toISOString();
      } catch { scheduledAt = null; }
    } else if (draft.type === "instant") {
      scheduledAt = new Date().toISOString();
    }

    const payload = {
      title:       draft.title       || "Untitled Meeting",
      description: draft.description || "",
      speaker:     draft.speaker     || state.profile?.user?.name || "Host",
      duration:    Number(draft.duration) || 60,
      scheduledAt,
      status:      draft.type === "instant" ? "live" : "upcoming",
      settings:    draft.settings
    };

    const result = await api("/api/sessions", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    state.meetings.unshift(result.meeting);
    state.isHost = true;
    state.session.sessionId = result.meeting.id;
    state.joinTarget = result.meeting;

    // Track owned meetings in localStorage (survives refresh)
    try {
      const owned = JSON.parse(localStorage.getItem("cv_owned_meetings") || "[]");
      if (!owned.includes(result.meeting.id)) owned.push(result.meeting.id);
      localStorage.setItem("cv_owned_meetings", JSON.stringify(owned));
    } catch {}

    // Reset the draft so next Create Meeting session starts fresh
    state.createDraft = {
      title: "", date: "", time: "", duration: "60",
      description: "", speaker: "", type: "instant",
      roomId: "", timezone: "", access: "open",
      settings: {
        allowQuestions: true, enableChat: true,
        upvoteReact: true, recordMeeting: false,
        showParticipants: true, requireApproval: false
      }
    };
    go("/meetings/created");
  } catch (error) {
    console.error("Failed to create meeting:", error);
    btns.forEach(b => { b.disabled = false; b.textContent = "Create Meeting"; });
    alert("Failed to create meeting. Please try again.");
  }
}

/* --- Global Registration for Inline Handlers -------------- */
// Expose state on window so inline onclick handlers (which run in global scope)
// can access it. ES modules do NOT automatically expose their exports globally.
window.state = state;

window.go = go;
window.saveDetails = saveDetails;
window.validateMeetingCode = validateMeetingCode;
window.validateMeetingCodeDirect = validateMeetingCodeDirect;
window.createMeeting = createMeeting;
window.renderActivity = renderActivity;

// Dedicated meeting type selection handlers (used by type-selection card buttons)
window.selectMeetingType = function(type) {
  state.createDraft.type  = type;
  state.createDraft.date  = '';
  state.createDraft.time  = '';
  go('/meetings/create/details');
};

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
window.moderatorEndSession         = moderatorEndSession;
window.moderatorGoLive             = moderatorGoLive;

// Home page handlers
window.homejoinLive                = homejoinLive;

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

    state.home             = home || { guest: true };   // guest fallback so router unblocks
    state.meetings         = meetings.meetings || [];
    state.activity         = activity;
    state.notifications    = notifications.notifications || [];
    state.sessionAnalytics = sessionAnalytics;

    // Prune stale owned meeting IDs from localStorage (handles DB resets / deleted meetings)
    try {
      const liveIds = new Set(state.meetings.map(m => m.id));
      const owned   = JSON.parse(localStorage.getItem("cv_owned_meetings") || "[]");
      const pruned  = owned.filter(id => liveIds.has(id));
      if (pruned.length !== owned.length) {
        localStorage.setItem("cv_owned_meetings", JSON.stringify(pruned));
      }
    } catch {}


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
const PUBLIC_ROUTES = ["/welcome", "/splash", "/login", "/signup", "/forgot", "/reset", "/auth-callback"];

/**
 * Handles the Google OAuth redirect — called when the backend redirects
 * to /#/auth-callback?token=...&refresh=... after a successful OAuth flow.
 */
async function handleGoogleCallback() {
  // Backend redirects to /?token=...&refreshToken=...&name=...#/auth-callback
  const params  = new URLSearchParams(location.search);
  const token   = params.get("token");
  const refresh = params.get("refreshToken");
  const name    = params.get("name");

  // If there's no fresh token in the URL, check if we're already authenticated
  // (this fires on re-entrant render() calls after the first handleGoogleCallback ran).
  if (!token) {
    if (state.token) {
      go("/home");   // already logged in — just navigate home
    } else {
      go("/login");  // no token anywhere — show login
    }
    return;
  }

  // Fresh OAuth redirect — store the new tokens immediately so the guard above
  // fires on any concurrent render() calls that arrive while we await loadData().
  state.token = token;
  try { localStorage.setItem("cv_token", token); } catch {}
  if (refresh) {
    state.refreshToken = refresh;
    try { localStorage.setItem("cv_refresh_token", refresh); } catch {}
  }
  // Pre-populate name so home renders correctly even before loadData finishes
  if (name && !state.profile?.user) {
    state.profile = { user: { name: decodeURIComponent(name.replace(/\+/g, " ")) } };
  }
  // Advance state.route NOW so any concurrent render() calls skip this handler
  state.route = "/home";
  // Load all app data with the new token, then navigate to home
  await loadData();
  go("/home");
}
window.handleGoogleCallback = handleGoogleCallback;

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
  if (route === "/login")          return renderLogin("login");
  if (route === "/signup")         return renderLogin("signup");
  if (route === "/forgot")         return renderForgot();
  if (route === "/reset")          return renderReset();
  if (route === "/auth-callback")  { handleGoogleCallback(); return; }

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

  // Deep-link: #/join/482916 → look up meeting by code and redirect to preview/waiting
  // Matches both 6-digit numeric codes and the 8-hex fallback format.
  const joinCodeMatch = route.match(/^\/join\/([A-Za-z0-9]{6,8})$/);
  if (joinCodeMatch) {
    validateMeetingCodeDirect(joinCodeMatch[1]);
    return renderJoining(); // show loading spinner while fetch resolves
  }

  if (route === "/meetings/create")          return renderCreate("type");
  if (route === "/meetings/create/details")  return renderCreate("details");
  // invite/review steps removed — form now submits directly; redirect stale links
  if (route === "/meetings/create/invite" ||
      route === "/meetings/create/review")   return renderCreate("details");
  if (route === "/meetings/created")         return renderCreate("done");

  // Session routes — role-guarded
  if (route === "/audience")  return renderAudience();
  if (route === "/moderator") return renderModerator();
  if (route === "/speaker")   return renderSpeaker();

  if (route === "/analytics") return renderAnalytics();
  if (route === "/report")    return renderSessionReport();
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
