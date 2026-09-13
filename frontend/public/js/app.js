/* ============================================================
   Application Entry Point & Router
   ============================================================ */
// ── All imports MUST be at the top of an ES module ──
import { state } from "./state.js";
import { api, go } from "./utils/api.js";
import { icons } from "./utils/icons.js";
import { dispatch, getSessionState } from "./store/SessionStore.js";

// Page Renderers
import { renderWelcome, renderOnboarding, renderLogin, renderForgot, renderReset, authSubmit, authForgot, authReset } from "./pages/auth.js";
import { renderHome, homejoinLive } from "./pages/home.js";
import { renderMeetings, renderJoin, renderJoining, renderCreate } from "./pages/meetings.js";
import { renderMeetingDetail } from "./pages/meetingDetail.js";
import { renderActivity } from "./pages/activity.js";
import { renderProfile } from "./pages/profile.js";
import { renderSettings } from "./pages/settings.js";
import { renderAudience, renderModerator, renderSpeaker, sessionSwitchView, sessionPromoteToSpeaker } from "./pages/session.js";
import { renderAnalytics } from "./pages/analytics.js";
import { renderNotifications } from "./pages/notifications.js";
import { renderQuestionDetail } from "./pages/questions.js";
import { renderSessionReport } from "./pages/report.js";
import { renderHelp } from "./pages/help.js";
import { initPWA } from "./utils/pwa.js";

// View-level handlers (registered globally for inline onclick)
import { moderatorSearchQuestions, moderatorSortQueue, moderatorDeferQuestion, moderatorShowQuestionMenu, moderatorFlagQuestion, moderatorAnswerQuestion, moderatorTogglePause, moderatorClearAnswered, moderatorBroadcastAnnouncement, moderatorCreatePoll, moderatorMakeSpeaker, moderatorEndSession, moderatorGoLive, moderatorMarkAnswering } from "./views/ModeratorView.js";
import { speakerSaveNotes, speakerStartAnswering, speakerSkipQuestion, speakerMarkAnswered, speakerDeferQuestion } from "./views/SpeakerView.js";
import { participantUpdateCharCount, participantSubmitQuestion, participantUpvote, participantVotePoll, participantTypingStart, participantTypingStop, participantReact } from "./views/ParticipantView.js";

// ── Restore saved theme immediately (before first render) to avoid flash ──
try {
  const prefs = JSON.parse(localStorage.getItem("cv_settings_prefs") || "{}");
  if (prefs.theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else if (prefs.theme === "system") {
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  }
  if (prefs.compact) document.body?.classList.add("compact-mode");
} catch { /* non-fatal */ }

// Register service worker + initialise offline queue support
initPWA();

import { setupDelegation, registerActions } from "./utils/delegate.js";
setupDelegation();

registerActions({
  go, authSubmit, authForgot, authReset, homejoinLive,
  sessionSwitchView, sessionPromoteToSpeaker,
  moderatorSearchQuestions, moderatorSortQueue, moderatorDeferQuestion, 
  moderatorShowQuestionMenu, moderatorFlagQuestion, moderatorAnswerQuestion, 
  moderatorTogglePause, moderatorClearAnswered, moderatorBroadcastAnnouncement, 
  moderatorCreatePoll, moderatorMakeSpeaker, moderatorEndSession, 
  moderatorGoLive, moderatorMarkAnswering,
  speakerSaveNotes, speakerStartAnswering, speakerSkipQuestion, 
  speakerMarkAnswered, speakerDeferQuestion,
  participantUpdateCharCount, participantSubmitQuestion, participantUpvote, 
  participantVotePoll, participantTypingStart, participantTypingStop, participantReact
});

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
 * Fetches the meeting by code, stores it in state.joinTarget, then:
 *  - live meeting     → /join/preview (enter room immediately)
 *  - upcoming meeting → enrollInMeeting() + /join/waiting (adds to user's list)
 *  - expired meeting  → /join/expired
 * On failure, goes to /join/invalid.
 */
export async function validateMeetingCodeDirect(code) {
  if (!code) { go("/join/invalid"); return; }
  try {
    const response = await fetch(`/api/sessions/code/${code}`);
    if (!response.ok) { go("/join/invalid"); return; }
    const result = await response.json();
    const meeting = result.meeting;
    state.joinTarget = meeting;
    state.isHost = false;

    if (meeting.status === "expired") {
      go("/join/expired");
      return;
    }

    if (meeting.status === "live") {
      // Live meeting — skip enrollment, go straight to preview
      go("/join/preview");
      return;
    }

    // Upcoming/scheduled — enroll the user so this meeting appears in their list
    if (state.token) {
      // Fire-and-forget enrollment (don't block UI)
      enrollInMeeting(code, "code").then(res => {
        if (res?.action === "join_now") go("/join/preview");
      }).catch(() => {});
    }
    go("/join/waiting");
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

// Auth shims — registered early so clicking buttons before the module
// fully loads doesn't silently fail with "authSubmit is not a function".
// The real implementations are assigned below at line ~320 once imported.
["authSubmit", "authForgot", "authReset"].forEach(fn => {
  if (!window[fn]) {
    window[fn] = function(...args) {
      // Module not loaded yet — wait one tick and retry
      setTimeout(() => { if (typeof window[fn] === "function") window[fn](...args); }, 50);
    };
  }
});
window.saveDetails = saveDetails;
window.validateMeetingCode = validateMeetingCode;
window.validateMeetingCodeDirect = validateMeetingCodeDirect;
window.createMeeting = createMeeting;
window.renderActivity = renderActivity;

/* ----------------------------------------------------------------
   Landing Page Helpers
   Exposed globally so onclick attributes in renderWelcome() work.
   ---------------------------------------------------------------- */

/**
 * Smooth-scroll to a landing page section by element ID.
 * IMPORTANT: Uses scrollIntoView — does NOT touch location.hash,
 * so the SPA hashchange router is never triggered.
 */
window.scrollToSection = function scrollToSection(sectionId) {
  const el = document.getElementById(sectionId);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
};

/** Scroll back to the very top of the landing page. */
window.scrollToLandingTop = function scrollToLandingTop() {
  const top = document.getElementById("landing-top");
  if (top) {
    top.scrollIntoView({ behavior: "smooth", block: "start" });
  } else {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
};

window.toggleLandingMenu = function toggleLandingMenu() {
  const menu = document.getElementById("landing-mobile-menu");
  if (menu) menu.classList.toggle("open");
};

/**
 * Auth-guarded "Create a Meeting" button on the landing page.
 * - Logged-in users go straight to the create flow.
 * - Guest/unauthenticated users are sent to signup first.
 */
window.landingCreateMeeting = function landingCreateMeeting() {
  if (state.token) {
    go("/meetings/create");
  } else {
    go("/signup");
  }
};


// Dedicated meeting type selection handlers (used by type-selection card buttons)
window.selectMeetingType = function(type) {
  state.createDraft.type  = type;
  state.createDraft.date  = '';
  state.createDraft.time  = '';
  go('/meetings/create/details');
};

/**
 * Navigate to the correct "meeting detail" page when a user clicks on a
 * meeting card in the meetings list.
 *
 * - If the user is the HOST of this meeting → /meetings/start (host start page)
 * - Otherwise → /join/preview (participant join preview page)
 *
 * @param {string} meetingId  The meeting's UUID
 */
/**
 * Navigate to the dedicated meeting detail page.
 * Role detection (host vs participant) is handled inside renderMeetingDetail
 * by calling GET /api/meetings/:id which returns isOwner based on the JWT.
 */
window.openMeetingDetail = function(meetingId) {
  // Store a quick reference in state (the detail page will re-fetch full data)
  const all = [
    ...(state.meetings || []),
    ...(state.myMeetings?.all || []),
    ...(state.myMeetings?.upcoming || []),
    ...(state.myMeetings?.live || []),
    ...(state.myMeetings?.past || []),
  ];
  state.joinTarget = all.find(m => m.id === meetingId) || { id: meetingId };
  // Navigate to the unified detail page — role is determined server-side
  go('/meetings/detail/' + meetingId);
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
window.moderatorMarkAnswering      = moderatorMarkAnswering;

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
window.participantTypingStart     = participantTypingStart;
window.participantTypingStop      = participantTypingStop;
window.participantReact           = participantReact;

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

    // Load user-specific meetings (enrolled + owned) — only if authenticated
    if (state.token) {
      const myRes = await api("/api/meetings/mine").catch(() => null);
      if (myRes) {
        state.myMeetings.all      = myRes.meetings  || [];
        state.myMeetings.upcoming = myRes.upcoming  || [];
        state.myMeetings.live     = myRes.live      || [];
        state.myMeetings.past     = myRes.past      || [];
        state.myMeetings.expired  = myRes.expired   || [];
      }
    }

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
        // Token invalid / refresh failed — clear all auth-related state
        state.token   = null;
        state.profile = null;
        state.isHost  = false;
        state.session = null;
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
  // Backend redirects to /?token=...&refreshToken=...&name=...&role=...#/auth-callback
  const params  = new URLSearchParams(location.search);
  const token   = params.get("token");
  const refresh = params.get("refreshToken");
  const name    = params.get("name");
  const role    = params.get("role") || "customer";

  // If there's no fresh token in the URL, check if we're already authenticated
  // (this fires on re-entrant render() calls after the first handleGoogleCallback ran).
  if (!token) {
    if (state.token) {
      // Determine where to send the already-logged-in user
      const existingRole = state.profile?.user?.role || "customer";
      if (existingRole === "admin" || existingRole === "superadmin") {
        window.location.href = "/admin.html";
      } else {
        go("/home");
      }
    } else {
      go("/login");  // no token anywhere — show login
    }
    return;
  }

  // Fresh OAuth redirect — store the new tokens immediately.
  state.token = token;
  try { localStorage.setItem("cv_token", token); } catch {}
  if (refresh) {
    state.refreshToken = refresh;
    try { localStorage.setItem("cv_refresh_token", refresh); } catch {}
  }
  // Pre-populate name and role so renders have something to show immediately
  if (name && !state.profile?.user) {
    state.profile = { user: { name: decodeURIComponent(name.replace(/\+/g, " ")), role } };
  }

  // Route based on role — admins/superadmins go to the admin panel
  if (role === "admin" || role === "superadmin") {
    // Clean the URL first, then navigate (avoids triggering hashchange)
    window.history.replaceState({}, document.title, "/admin.html");
    window.location.replace("/admin.html");
    return;
  }

  // Advance state.route NOW so any concurrent render() calls triggered by
  // hashchange (from replaceState) will see /home and not re-enter this handler.
  state.route = "/home";

  // Clean the URL — use replaceState WITHOUT a hash change to avoid triggering
  // the hashchange listener which would race with the async loadData() below.
  // We remove the query params (?token=...etc) and keep the URL clean.
  window.history.replaceState({}, document.title, "/");

  // Set home to a non-null placeholder so the router doesn't block while loading
  if (!state.home) state.home = { loading: true };

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

  // All other routes need data to be loaded first
  if (!state.home) {
    // Only show loading skeleton if the user is authenticated (has a token).
    // If there's no token, there's nothing to load — send to welcome page.
    if (!state.token) {
      go("/welcome");
      return;
    }
    // Show a slim loading skeleton while data loads — no blank white screen
    const app = document.querySelector("#app");
    if (app && !app.querySelector(".loading-skeleton")) {
      app.innerHTML = `
        <div class="loading-skeleton" style="display:grid;place-items:center;min-height:100vh;background:#f5f4ff">
          <div style="text-align:center">
            <div style="width:48px;height:48px;border-radius:50%;border:4px solid #e0dbff;border-top-color:#5b34ff;animation:spin .8s linear infinite;margin:0 auto 16px"></div>
            <p style="color:#8890b0;font-size:14px;font-weight:500">Loading CollectiveVoice…</p>
          </div>
        </div>
        <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
      `;
    }
    return;
  }

  if (route === "/home")     return renderHome();
  if (route === "/meetings") return renderMeetings();

  // /meetings/detail/:id — per-meeting detail page (host or participant view)
  const meetingDetailMatch = route.match(/^\/meetings\/detail\/(.+)$/);
  if (meetingDetailMatch) { renderMeetingDetail(meetingDetailMatch[1]); return; }

  if (route === "/activity")            return renderActivity("questions");
  if (route === "/activity/overview")   return renderActivity("overview");
  if (route === "/activity/meetings")   return renderActivity("meetings");
  if (route === "/activity/insights")   return renderActivity("insights");

  if (route === "/conducted") { go("/meetings"); return; } // removed page; redirect to meetings list
  if (route === "/profile")   return renderProfile();
  if (route === "/settings")  return renderSettings();

  if (route === "/join")            return renderJoin("start");
  if (route === "/join/scan")       return renderJoin("scan");
  if (route === "/join/id")         return renderJoin("id");
  if (route === "/join/preview")    return renderJoin("preview");
  if (route === "/join/waiting")    return renderJoin("waiting");
  if (route === "/join/invalid")    return renderJoin("invalid");
  if (route === "/join/expired")    return renderJoin("expired");
  if (route === "/joining")         return renderJoining();

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
  if (route === "/meetings/start") { go("/meetings"); return; } // removed page; redirect to meetings list

  // Session routes — role-guarded
  if (route === "/audience")  return renderAudience();
  if (route === "/moderator") return renderModerator();
  if (route === "/speaker")   return renderSpeaker();

  if (route === "/analytics") { renderAnalytics(); return; }
  if (route === "/report")    { renderSessionReport(); return; }
  // /report/:id — direct link or openReport()
  const reportMatch = route.match(/^\/report\/(.+)$/);
  if (reportMatch) {
    if (window.state) window.state.report = { meetingId: reportMatch[1] };
    renderSessionReport();
    return;
  }
  if (route.startsWith("/question/")) return renderQuestionDetail(route.split("/").pop());
  if (route === "/notifications") return renderNotifications();
  if (route === "/help")          return renderHelp();

  // Nothing matched — fall back to appropriate home depending on auth state
  if (state.token) {
    renderHome();
  } else {
    go("/welcome");
  }
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
  const hash = location.hash.replace("#", "");
  // When hash is empty (e.g. browser Back pressed from a hash route to no-hash),
  // restore an appropriate default:
  //  - Authenticated users  → /home  (their dashboard)
  //  - Unauthenticated users → /welcome (the landing page)
  // This prevents pressing Back on the login page from showing the
  // authenticated home dashboard when the user is not logged in.
  state.route = hash || (state.token ? "/home" : "/welcome");
  render();
});

/* --- Global Meeting Action Helpers --------------------------------- */

/**
 * Enroll the current user in a meeting via code or QR.
 * Called from the join flow after code validation.
 */
window.enrollInMeeting = async function enrollInMeeting(code, method = "code") {
  if (!state.token) {
    go("/login");
    return null;
  }
  try {
    const result = await api(`/api/sessions/code/${code}/enroll`, {
      method: "POST",
      body: JSON.stringify({ method })
    });
    // Update local state immediately
    const m = result.meeting;
    if (m && !state.myMeetings.all.find(x => x.id === m.id)) {
      state.myMeetings.all.unshift(m);
      if (m.status === "upcoming" || m.status === "scheduled") state.myMeetings.upcoming.unshift(m);
      if (m.status === "live") state.myMeetings.live.unshift(m);
    }
    return result;
  } catch (err) {
    console.error("[Enroll] Failed:", err.message);
    return null;
  }
};

/**
 * Host extends an overdue meeting's grace period.
 * Shows a toast confirmation, re-renders meetings list.
 */
window.extendMeeting = async function extendMeeting(meetingId, minutes = 30) {
  try {
    const result = await api(`/api/meetings/${meetingId}/extend`, {
      method: "POST",
      body: JSON.stringify({ minutes })
    });
    // Update local state
    const m = state.myMeetings.all.find(x => x.id === meetingId);
    if (m && result.meeting) Object.assign(m, result.meeting);
    showToast(`⏱ Meeting extended by ${minutes} minutes`);
    if (state.route === "/meetings") render();
    return result;
  } catch (err) {
    showToast(`Failed to extend: ${err.message}`, "error");
    return null;
  }
};

/**
 * Host reschedules an overdue meeting.
 * scheduledAt must be a future ISO datetime string.
 */
window.rescheduleMeeting = async function rescheduleMeeting(meetingId, scheduledAt) {
  try {
    const result = await api(`/api/meetings/${meetingId}/reschedule`, {
      method: "POST",
      body: JSON.stringify({ scheduledAt })
    });
    // Update local state
    const m = state.myMeetings.all.find(x => x.id === meetingId);
    if (m && result.meeting) Object.assign(m, result.meeting);
    showToast(`📅 Meeting rescheduled`);
    if (state.route === "/meetings") render();
    return result;
  } catch (err) {
    showToast(`Failed to reschedule: ${err.message}`, "error");
    return null;
  }
};

/** Minimal toast notification helper */
function showToast(msg, type = "success") {
  const t = document.createElement("div");
  t.className = `cv-toast cv-toast-${type}`;
  t.textContent = msg;
  t.style.cssText = [
    "position:fixed", "bottom:24px", "left:50%", "transform:translateX(-50%)",
    "background:" + (type === "error" ? "#e54040" : "#1a1a2e"),
    "color:#fff", "padding:10px 20px", "border-radius:8px",
    "font-size:14px", "font-weight:600", "z-index:9999",
    "box-shadow:0 4px 24px rgba(0,0,0,0.25)", "pointer-events:none"
  ].join(";");
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}
window.showToast = showToast;

/**
 * Presents a simple inline date+time dialog for the host to reschedule a meeting.
 * Falls back to window.prompt for date/time input (works on all devices).
 */
window.showRescheduleDialog = function showRescheduleDialog(meetingId) {
  const dateStr = window.prompt(
    "Enter new date for the meeting (YYYY-MM-DD):",
    new Date().toISOString().slice(0, 10)
  );
  if (!dateStr) return;
  const timeStr = window.prompt(
    "Enter new time (HH:MM, 24-hour):",
    new Date().toTimeString().slice(0, 5)
  );
  if (!timeStr) return;
  const scheduledAt = new Date(`${dateStr}T${timeStr}`).toISOString();
  if (isNaN(new Date(scheduledAt))) {
    alert("Invalid date/time. Please try again.");
    return;
  }
  rescheduleMeeting(meetingId, scheduledAt);
};

/* --- WebSocket Real-Time Event Handlers for Enrollment/Grace ---- */
// These events arrive from the server scheduler and API routes.
// They update local state without a full page reload.

function handleGraceEvent(event, data) {
  switch (event) {
    case "grace_period_started": {
      // Server told this user (the host) that their meeting just became overdue.
      const m = state.myMeetings.all.find(x => x.id === data.meetingId);
      if (m) {
        m.graceEndsAt = data.graceEndsAt;
        m._graceActive = true;
      }
      showToast(`⏱ "${data.title}" overdue — ${Math.round(data.graceMs / 60000)}m to extend or reschedule`);
      // Re-render if on meetings page so the grace banner appears
      if (state.route === "/meetings") render();
      break;
    }
    case "meeting_expired": {
      // Move the meeting from upcoming → expired in local state
      const idx = state.myMeetings.upcoming.findIndex(x => x.id === data.meetingId);
      if (idx !== -1) {
        const [expired] = state.myMeetings.upcoming.splice(idx, 1);
        expired.status = "expired";
        state.myMeetings.expired.unshift(expired);
        const m = state.myMeetings.all.find(x => x.id === data.meetingId);
        if (m) m.status = "expired";
      }
      showToast(`❌ "${data.title}" has expired`, "error");
      if (state.route === "/meetings") render();
      break;
    }
    case "meeting_extended": {
      const m = state.myMeetings.all.find(x => x.id === data.meetingId);
      if (m) {
        m.scheduledAt = data.newScheduledAt;
        m.graceEndsAt = data.graceEndsAt;
        m._graceActive = true;
      }
      showToast(`✅ Meeting extended by ${data.extendedByMins} minutes`);
      if (state.route === "/meetings") render();
      break;
    }
    case "meeting_rescheduled": {
      const m = state.myMeetings.all.find(x => x.id === data.meetingId);
      if (m) {
        m.scheduledAt = data.newScheduledAt;
        m.date = data.date;
        m.time = data.time;
        m.status = "upcoming";
        m.graceEndsAt = null;
        m._graceActive = false;
        // Move back to upcoming if it was elsewhere
        if (!state.myMeetings.upcoming.find(x => x.id === data.meetingId)) {
          state.myMeetings.upcoming.unshift(m);
        }
      }
      showToast(`📅 Meeting rescheduled to ${data.date} ${data.time}`);
      if (state.route === "/meetings") render();
      break;
    }
  }
}

// Hook into SessionStore's WS message pipeline for grace/enrollment events.
// The SessionStore's dispatch() function already handles session events;
// we intercept the grace-period events here at the app level.
document.addEventListener("cv:ws_event", (e) => {
  const { event, data } = e.detail || {};
  if (["grace_period_started","meeting_expired","meeting_extended","meeting_rescheduled"].includes(event)) {
    handleGraceEvent(event, data);
  }
});
