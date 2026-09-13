/**
 * Central Event Delegation System
 * Replaces inline handlers (onclick, onchange, etc.) to comply with strict CSP (script-src 'self').
 */

const actions = {};

export function registerActions(handlers) {
  Object.assign(actions, handlers);
}

const argMap = {
  go: (el) => [el.dataset.route || el.dataset.action],
  scrollToSection: (el) => [el.dataset.section],
  participantVotePoll: (el) => [el.dataset.poll, el.dataset.opt],
  participantReact: (el) => [el.dataset.id, el.dataset.key],
  participantUpvote: (el) => [el.dataset.id, el],
  moderatorAnswerQuestion: (el) => [el.dataset.id],
  moderatorMarkAnswering: (el) => [el.dataset.id],
  moderatorDeferQuestion: (el) => [el.dataset.id],
  moderatorShowQuestionMenu: (el) => [el.dataset.id, el],
  moderatorViewPollResults: (el) => [el.dataset.id],
  moderatorEndPoll: (el) => [el.dataset.id],
  moderatorDownloadPollResults: (el) => [el.dataset.id],
  moderatorMakeSpeaker: (el) => [el.dataset.id === "null" ? null : el.dataset.id, el.dataset.name === "null" ? null : el.dataset.name, el.dataset.initials === "null" ? null : el.dataset.initials],
  moderatorConfirmAssign: (el) => [el.dataset.qid, el.dataset.pid, el.dataset.pname, el.dataset.pinitials],
  moderatorFlagQuestion: (el) => [el.dataset.id],
  removeElement: (el) => [el.dataset.id],
  modSetDuration: (el) => [el, parseInt(el.dataset.dur)],
  maCopyInvite: (el) => [el.dataset.link],
  settingsNav: (el) => [el, el.dataset.id],
  setTheme: (el) => [el, el.dataset.theme],
  openHelpLink: (el) => [el.dataset.type],
  helpNav: (el) => [el.dataset.id],
  copyInviteLink: (el) => el.dataset.code ? [el.dataset.code, el.dataset.pass] : [],
  showRescheduleDialog: (el) => [el.dataset.id],
  extendMeeting: (el) => [el.dataset.id, parseInt(el.dataset.mins)],
  mtgOpenMenu: (el) => [el.dataset.id, el],
  rptExport: (el) => [el.dataset.format],
  rptTab: (el) => [el.dataset.tab, el],
  sessionSwitchView: (el) => [el.dataset.view],
  qDetailMarkAnswered: (el) => [el.dataset.id],
  qDetailSetStatus: (el) => [el.dataset.id, el.dataset.status],
  profileTab: (el) => [el, el.dataset.tab],
  notifFilterTab: (el) => [el, el.dataset.filter],
  notifItemClick: (el) => [el.dataset.id, el.dataset.type],
  activityTab: (el) => [el.dataset.tab, el],
  activityFilterChart: (el) => [el.dataset.val],
  analyticsFilterChart: (el) => [el.dataset.val],
  analyticsTab: (el) => [el.dataset.tab, el],
  mtgStatusFilter: (el) => [el.dataset.val],
  openUserMenu: (el, e) => [el.dataset.id, e],
  openMeetingDetail: (el) => [el.dataset.id],
  adminNav: (el) => [el.dataset.page],
  maAction: (el) => [el.dataset.actiontype, el.dataset.id],
  maEdit: (el) => [el.dataset.id],
  uAction: (el) => [el.dataset.actiontype, el.dataset.id],
  uView: (el) => [el.dataset.id],
  uBan: (el) => [el.dataset.id],
  mdTab: (el) => [el.dataset.tab, el],
  mdAction: (el) => [el.dataset.actiontype, el.dataset.id],
  copyMeetingLink: (el) => [el.dataset.id],
  shareMeetingQR: (el) => [el.dataset.id],
  openReport: (el) => [el.dataset.id],
  selectMeetingType: (el) => [el.dataset.type],
  submitReschedule: (el) => [el.dataset.id],
  deleteMeeting: (el) => [el.dataset.id],
  enrollInMeeting: (el) => [el.dataset.id, el.dataset.method],
  mtgLoadTemplate: (el) => [el.dataset.id],
  mdEditMeeting: (el) => [el.dataset.id],
  mdDownloadQR: (el) => [el.dataset.id],
  mdStartMeeting: (el) => [el.dataset.id],
  mdInviteParticipants: (el) => [el.dataset.id],
  mdShareMeeting: (el) => [el.dataset.id],
  mdDeleteMeeting: (el) => [el.dataset.id],
  mdCopyLink: (el) => [el.dataset.link],
  mdAddToCalendar: (el) => [el.dataset.id],
  mdJoinNow: (el) => [el.dataset.id],
  mdJoinNowCond: (el) => el.dataset.islive === 'true' ? [el.dataset.id] : null,
  openHelpCategory: (el) => [el.dataset.id],
  openHelpArticle: (el) => [el.dataset.id],
  hmToggleTopic: (el) => [el.dataset.id],
  liveNowFilter: (el) => [el.dataset.val],
  renderActivity: (el) => [el.dataset.tab],
  showHelpToast: (el) => [el.dataset.msg],
  speakerMarkAnswered: (el) => [el.dataset.id],
  speakerDeferQuestion: (el) => [el.dataset.id],
  homejoinLive: (el) => el.dataset.id ? [el.dataset.id] : []
};

function handleEvent(e, attributePrefix) {
  const el = e.target.closest(`[data-${attributePrefix}]`);
  if (!el) return;

  const actionName = el.getAttribute(`data-${attributePrefix}`);
  
  if (actionName === "stopPropagation") {
      e.stopPropagation();
      return;
  }
  
  if (actionName === "dismissAnnouncement") {
      if (window._cvDismissAnnouncement) window._cvDismissAnnouncement();
      return;
  }
  
  if (actionName === "removeElement") {
      const target = document.getElementById(el.dataset.id);
      if (target) target.remove();
      return;
  }
  
  if (actionName === "alertNotConfigured") {
      alert("Social login is not configured");
      return;
  }

  if (actionName === "historyBack") {
      history.back();
      return;
  }

  if (actionName === "selectInput") {
      el.select();
      return;
  }
  
  if (actionName === "oauth") {
      window.location.href = `/api/auth/${el.dataset.provider}`;
      return;
  }

  if (actionName === "togglePassword") {
      const prev = el.previousElementSibling;
      if (prev) prev.type = prev.type === 'password' ? 'text' : 'password';
      return;
  }

  const handler = actions[actionName] || window[actionName];

  if (!handler) {
    console.warn(`No handler registered or on window for data-${attributePrefix}="${actionName}"`);
    return;
  }

  if (attributePrefix === 'change' || attributePrefix === 'input') {
      const val = el.value || (el.type === 'checkbox' ? el.checked : null);
      if (actionName === "savePrefs") {
          handler(el.dataset.prefs ? JSON.parse(el.dataset.prefs.replace('privacy_visibility:this.value', `"privacy_visibility":"${val}"`)) : {});
      } else {
          handler(val, el, e);
      }
  } else {
      const args = argMap[actionName] ? argMap[actionName](el, e) : [el, e];
      if (args === null) return;
      handler(...args);
  }
}

export function setupDelegation() {
  document.addEventListener("click", e => handleEvent(e, "action"));
  document.addEventListener("change", e => handleEvent(e, "change"));
  document.addEventListener("input", e => handleEvent(e, "input"));
  document.addEventListener("keydown", e => handleEvent(e, "keydown"));
  document.addEventListener("submit", e => handleEvent(e, "submit"));
}
