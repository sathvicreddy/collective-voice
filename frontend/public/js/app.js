/* ============================================================
   Application Entry Point & Router
   ============================================================ */
import { state } from "./state.js";
import { api, go } from "./utils/api.js";
import { icons } from "./utils/icons.js";

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
  moderatorSearchQuestions, moderatorSortQueue, moderatorAssignQuestion,
  moderatorConfirmAssign, moderatorCloseModal, moderatorDeferQuestion,
  moderatorShowQuestionMenu, moderatorFlagQuestion, moderatorAnswerQuestion,
  moderatorTogglePause, moderatorClearAnswered, moderatorBroadcastAnnouncement,
  moderatorCreatePoll, moderatorMakeSpeaker
} from "./views/ModeratorView.js";
import { speakerSaveNotes, speakerStartAnswering, speakerSkipQuestion } from "./views/SpeakerView.js";
import {
  participantUpdateCharCount, participantSubmitQuestion,
  participantUpvote, participantVotePoll
} from "./views/ParticipantView.js";

const app = document.querySelector("#app");

/* --- Actions ----------------------------------------------- */
export function saveDetails() {
  state.createDraft.title = document.querySelector("#title")?.value || state.createDraft.title;
  state.createDraft.date = document.querySelector("#date")?.value || state.createDraft.date;
  state.createDraft.time = document.querySelector("#time")?.value || state.createDraft.time;
  state.createDraft.duration = document.querySelector("#duration")?.value || state.createDraft.duration;
  state.createDraft.description = document.querySelector("#description")?.value || state.createDraft.description;
  go("/meetings/create/invite");
}

export async function validateMeetingCode() {
  const code = document.querySelector("#meetingCode")?.value.trim();
  if (!code) { go("/join/invalid"); return; }
  try {
    const response = await fetch(`/api/sessions/code/${code}`);
    if (!response.ok) { go("/join/invalid"); return; }
    const result = await response.json();
    state.isHost = false;
    go(result.meeting.status === "upcoming" ? "/join/waiting" : "/join/preview");
  } catch (error) {
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
    go("/meetings/created");
  } catch (error) {
    console.error("Failed to create meeting:", error);
  }
}

export async function submitQuestion() {
  const input = document.querySelector("#newQuestion");
  const text = input?.value.trim();
  if (!text) return;
  try {
    const result = await api("/api/questions", {
      method: "POST",
      body: JSON.stringify({ text })
    });
    state.questions = result.questions;
    renderAudience();
  } catch (error) {
    console.error("Failed to submit question:", error);
  }
}

export async function upvote(id) {
  try {
    const result = await api(`/api/questions/${id}/upvote`, { method: "POST" });
    state.questions = state.questions.map(q => q.id === id ? result.question : q);
    render();
  } catch (error) {
    console.error("Failed to upvote:", error);
  }
}

export function markAnswered(id) {
  state.questions = state.questions.map(q => q.id === id ? { ...q, status: "Answered" } : q);
  render();
}

export function setQuestionStatus(id, status) {
  state.questions = state.questions.map(q => q.id === id ? { ...q, status } : q);
  render();
}

/* --- Global Registration for Inline Handlers -------------- */
window.go = go;
window.saveDetails = saveDetails;
window.validateMeetingCode = validateMeetingCode;
window.createMeeting = createMeeting;
window.submitQuestion = submitQuestion;
window.upvote = upvote;
window.markAnswered = markAnswered;
window.setQuestionStatus = setQuestionStatus;
window.renderActivity = renderActivity;

// Session view handlers
window.sessionSwitchView      = sessionSwitchView;
window.sessionPromoteToSpeaker = sessionPromoteToSpeaker;

// Moderator handlers
window.moderatorSearchQuestions    = moderatorSearchQuestions;
window.moderatorSortQueue          = moderatorSortQueue;
window.moderatorAssignQuestion     = moderatorAssignQuestion;
window.moderatorConfirmAssign      = moderatorConfirmAssign;
window.moderatorCloseModal         = moderatorCloseModal;
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
window.speakerSaveNotes      = speakerSaveNotes;
window.speakerStartAnswering = speakerStartAnswering;
window.speakerSkipQuestion   = speakerSkipQuestion;

// Participant handlers
window.participantUpdateCharCount = participantUpdateCharCount;
window.participantSubmitQuestion  = participantSubmitQuestion;
window.participantUpvote          = participantUpvote;
window.participantVotePoll        = participantVotePoll;

/* --- Data Loading & Router --------------------------------- */
export async function loadData() {
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

/* Public routes that do not require API data */
const PUBLIC_ROUTES = ["/welcome", "/splash", "/login", "/signup", "/forgot", "/reset"];

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
  if (route === "/joining")       return renderJoining();
  
  if (route === "/meetings/create")         return renderCreate("type");
  if (route === "/meetings/create/details") return renderCreate("details");
  if (route === "/meetings/create/invite")  return renderCreate("invite");
  if (route === "/meetings/create/review")  return renderCreate("review");
  if (route === "/meetings/created")        return renderCreate("done");

  // Session routes — role-guarded
  if (route === "/audience") return renderAudience();
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
