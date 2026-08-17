/* ============================================================
   Admin Messages Page — Send messages to users/groups
   Modernised: pill audience selector, user autocomplete,
   meeting search, live recipient count, char counter, confirm step.
   ============================================================ */
import { IC } from '../icons.js';
import { state } from '../state.js';

/* ── Module state ── */
let _msgHistory  = null;
let _meetings    = null;
let _allUsers    = null;
let _sending     = false;
let _confirmStep = false;
let _form = {
  audience:      "single",
  targetUserId:  "",
  targetUserName: "",
  meetingId:     "",
  meetingTitle:  "",
};

/* ── Time helper ── */
function relTime(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000)    return "Just now";
  if (diff < 3600000)  return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ── API helper ── */
async function msgFetch(method, path, body) {
  const token = localStorage.getItem("cv_token") || "";
  const opts  = { method, headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  return res.json();
}

/* ── Data loaders ── */
async function loadHistory() {
  try {
    const data = await msgFetch("GET", "/api/admin/messages");
    _msgHistory = Array.isArray(data.messages) ? data.messages : [];
  } catch { _msgHistory = []; }
  _renderHistory();
}

async function loadMeetings() {
  try {
    const data = await msgFetch("GET", "/api/admin/meetings?limit=100");
    _meetings = Array.isArray(data.meetings) ? data.meetings : [];
  } catch { _meetings = []; }
}

async function loadUsers() {
  try {
    const data = await msgFetch("GET", "/api/admin/users?view=customers");
    _allUsers = Array.isArray(data.users) ? data.users : [];
  } catch { _allUsers = []; }
}

/* ── Audience badge config ── */
const AUDIENCE_CFG = {
  single:               { label: "Direct",              color: "#5b34ff", bg: "#f0ecff" },
  all_users:            { label: "All Users",            color: "#e54040", bg: "#ffeaea" },
  meeting_participants: { label: "Meeting Participants", color: "#059669", bg: "#edf9f3" },
  admins:               { label: "Admins",               color: "#d97706", bg: "#fff7ed" },
};

/* ── SVG icons for audience pills ── */
const PILL_ICONS = {
  single: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  meeting_participants: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  all_users: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  admins: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
};

/* ── Message row — matches image: envelope icon left, subject+body center, badge+date right, recipient count below ── */
function msgRow(m, idx) {
  const acfg = AUDIENCE_CFG[m.audience] || AUDIENCE_CFG.single;
  const t    = relTime(m.createdAt);
  const bodyPreview = (m.body || "").length > 80 ? m.body.slice(0, 80) + "…" : m.body;
  const cnt  = m.recipientCount ?? 0;
  return `
    <div class="msg-hist-row" style="animation:slideInLeft .28s ${.03+idx*.04}s both">
      <div class="msg-hist-icon">${IC.mail}</div>
      <div class="msg-hist-body">
        <div class="msg-hist-top">
          <span class="msg-hist-subject">${m.subject}</span>
          <div class="msg-hist-right">
            <span class="msg-hist-badge" style="background:${acfg.bg};color:${acfg.color}">${acfg.label.toUpperCase()}</span>
            <span class="msg-hist-date">${t}</span>
          </div>
        </div>
        <p class="msg-hist-preview">${bodyPreview}</p>
        <span class="msg-hist-rcpt">${IC.users} ${cnt} recipient${cnt !== 1 ? "s" : ""}</span>
      </div>
    </div>
  `;
}

function _renderHistory() {
  const el = document.getElementById("msg-history-list");
  if (!el) return;
  const list = _msgHistory || [];
  el.innerHTML = list.length
    ? list.map((m,i) => msgRow(m,i)).join("")
    : `<div class="an-empty"><div class="an-empty-icon">📨</div><p>No messages sent yet.</p></div>`;
}

/* ── Audience pills ── */
const AUDIENCE_PILLS = [
  { value: "single",               label: "Direct Message",       desc: "Send to one specific person",               superOnly: false },
  { value: "meeting_participants", label: "Meeting Participants",  desc: "Everyone in a live or scheduled meeting",    superOnly: false },
  { value: "all_users",            label: "All Users",             desc: "Broadcast to every user on the platform",   superOnly: true  },
  { value: "admins",               label: "All Admins",            desc: "Send to all admin and superadmin accounts", superOnly: true  },
];

function audiencePills(isSuperadmin, selected) {
  return AUDIENCE_PILLS.map(p => {
    const disabled = p.superOnly && !isSuperadmin;
    const active   = selected === p.value && !disabled;
    return `
      <div class="msg-audience-pill ${active ? "active" : ""} ${disabled ? "disabled" : ""}"
        ${!disabled ? `onclick="adminMsgSetAudience('${p.value}')"` : ""}
        role="radio" aria-checked="${active}" tabindex="${disabled ? -1 : 0}"
      >
        <span class="msg-pill-icon-wrap ${active ? "active" : ""}"
          style="background:${active ? "#eeeaff" : "#f5f3ff"};color:#5b34ff">${PILL_ICONS[p.value]}</span>
        <div class="msg-pill-text">
          <span class="msg-pill-label">${p.label}</span>
          <span class="msg-pill-desc">${p.desc}</span>
        </div>
        ${disabled ? `<span class="msg-super-chip">Superadmin</span>` : ""}
        ${active ? `<span class="msg-pill-check-circle"><svg viewBox="0 0 24 24" fill="#5b34ff" width="18" height="18"><circle cx="12" cy="12" r="10" fill="#5b34ff"/><polyline points="8 12 11 15 16 9" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>` : ""}
      </div>
    `;
  }).join("");
}

/* ── Recipient count ── */
function recipientCountHtml() {
  const aud = _form.audience;
  const icon = `<span style="display:inline-flex;align-items:center;opacity:.7">${IC.users}</span>`;
  if (aud === "single") {
    return _form.targetUserId
      ? `<span class="msg-rcpt-badge">${icon} 1 recipient</span>`
      : `<span class="msg-rcpt-badge empty">${icon} Select a recipient</span>`;
  }
  if (aud === "meeting_participants") {
    if (!_form.meetingId) return `<span class="msg-rcpt-badge empty">${icon} Select a meeting</span>`;
    const mtg = (_meetings || []).find(m => m.id === _form.meetingId);
    const cnt = mtg ? mtg.participantsCount : "?";
    return `<span class="msg-rcpt-badge">${icon} ~${cnt} participant${cnt !== 1 ? "s" : ""}</span>`;
  }
  if (aud === "all_users") {
    const cnt = _allUsers ? _allUsers.length : "…";
    return `<span class="msg-rcpt-badge warn">${icon} ${cnt} users <em>(broadcast)</em></span>`;
  }
  if (aud === "admins") {
    return `<span class="msg-rcpt-badge warn">${icon} All admins <em>(broadcast)</em></span>`;
  }
  return "";
}

/* ── Send ── */
window.adminSendMessage = async function() {
  if (_sending) return;
  const subEl  = document.getElementById("msg-subject");
  const bodyEl = document.getElementById("msg-body");
  const subject  = subEl?.value.trim()  || "";
  const body     = bodyEl?.value.trim() || "";
  const audience = _form.audience;

  if (!subject) { subEl?.focus(); adminMsgToast("Subject is required.", "error"); return; }
  if (!body)    { bodyEl?.focus(); adminMsgToast("Message body is required.", "error"); return; }
  if (audience === "single" && !_form.targetUserId) { adminMsgToast("Choose a recipient.", "error"); return; }
  if (audience === "meeting_participants" && !_form.meetingId) { adminMsgToast("Select a meeting.", "error"); return; }

  // Broadcast confirm step
  if ((audience === "all_users" || audience === "admins") && !_confirmStep) {
    _confirmStep = true;
    const btn = document.getElementById("msg-send-btn");
    if (btn) {
      const aud = audience === "all_users" ? "all users" : "all admins";
      btn.innerHTML = `⚠️ Confirm: click again to send to ${aud}`;
      btn.classList.add("msg-confirm-mode");
      setTimeout(() => {
        _confirmStep = false;
        if (btn) { btn.innerHTML = `${IC.send} Send Message`; btn.classList.remove("msg-confirm-mode"); }
      }, 4000);
    }
    return;
  }
  _confirmStep = false;

  _sending = true;
  const btn = document.getElementById("msg-send-btn");
  if (btn) { btn.disabled = true; btn.innerHTML = "Sending…"; }

  try {
    const resp = await msgFetch("POST", "/api/admin/messages", {
      subject, body, audience, targetUserId: _form.targetUserId, meetingId: _form.meetingId
    });
    if (resp.error) {
      adminMsgToast(resp.error, "error");
    } else {
      adminMsgToast(`✓ Sent to ${resp.recipientCount} recipient${resp.recipientCount !== 1 ? "s" : ""}!`);
      if (subEl)  subEl.value  = "";
      if (bodyEl) bodyEl.value = "";
      _form.targetUserId = ""; _form.targetUserName = "";
      _form.meetingId    = ""; _form.meetingTitle   = "";
      // Reset chips
      const uc = document.getElementById("msg-user-chip");   if (uc) uc.classList.add("hidden");
      const mc = document.getElementById("msg-meeting-chip"); if (mc) mc.classList.add("hidden");
      _updateUI();
      _msgHistory = null; loadHistory();
    }
  } catch { adminMsgToast("Network error — try again.", "error"); }
  finally {
    _sending = false;
    if (btn) { btn.disabled = false; btn.innerHTML = `${IC.send} Send Message`; btn.classList.remove("msg-confirm-mode"); }
  }
};

window.adminMsgSetAudience = function(aud) {
  _form.audience = aud; _confirmStep = false;
  const panel = document.getElementById("msg-compose-panel");
  if (panel) { panel.outerHTML = _composePanelHtml(); _attachHandlers(); }
};

function _updateUI() {
  const rc = document.getElementById("msg-rcpt"); if (rc) rc.innerHTML = recipientCountHtml();
}

/* ── Char counter ── */
function _onSubjectInput(e) {
  const len = e.target.value.length;
  const el  = document.getElementById("msg-sub-cnt");
  if (el) { el.textContent = `${len}/80`; el.className = `msg-char-count${len>=80?" over":len>=65?" warn":""}`; }
}
function _onBodyInput(e) {
  const len = e.target.value.length;
  const el  = document.getElementById("msg-body-cnt");
  if (el) { el.textContent = `${len}/2000`; el.className = `msg-char-count${len>=2000?" over":len>=1700?" warn":""}`; }
}

/* ── User autocomplete ── */
let _uTimer = null;
function _attachUserAC() {
  const inp = document.getElementById("msg-user-input");
  if (!inp) return;
  inp.addEventListener("input", () => {
    clearTimeout(_uTimer);
    const q = inp.value.trim().toLowerCase();
    if (!q) { _hideDD("msg-user-dd"); return; }
    _uTimer = setTimeout(() => {
      const users = _allUsers || [];
      const hits  = users.filter(u => (u.name||"").toLowerCase().includes(q) || (u.email||"").toLowerCase().includes(q)).slice(0, 8);
      const dd = document.getElementById("msg-user-dd"); if (!dd) return;
      if (!hits.length) { dd.innerHTML = `<div class="msg-ac-empty">No users found</div>`; }
      else dd.innerHTML = hits.map(u => {
        const init = (u.name || u.email || "?")[0].toUpperCase();
        return `<div class="msg-ac-item" onclick="adminMsgPickUser('${u.id}','${(u.name||"").replace(/'/g,"\\'")}')">
          <div class="msg-ac-av">${init}</div>
          <div><span class="msg-ac-name">${u.name || "(no name)"}</span><br><span class="msg-ac-email">${u.email}</span></div>
        </div>`;
      }).join("");
      dd.style.display = "block";
    }, 200);
  });
  inp.addEventListener("focus", () => { if (inp.value.trim()) inp.dispatchEvent(new Event("input")); });
  document.addEventListener("click", e => { if (!e.target.closest("#msg-user-wrap")) _hideDD("msg-user-dd"); }, { capture: false });
}
function _hideDD(id) { const el = document.getElementById(id); if (el) el.style.display = "none"; }

window.adminMsgPickUser = function(id, name) {
  _form.targetUserId = id; _form.targetUserName = name;
  const inp = document.getElementById("msg-user-input"); if (inp) inp.value = "";
  _hideDD("msg-user-dd");
  const chip = document.getElementById("msg-user-chip");
  if (chip) {
    chip.innerHTML = `<span class="msg-chip-av">${(name||"?")[0].toUpperCase()}</span>
      <span class="msg-chip-nm">${name}</span>
      <button class="msg-chip-rm" onclick="adminMsgClearUser()">✕</button>`;
    chip.classList.remove("hidden");
  }
  _updateUI();
};
window.adminMsgClearUser = function() {
  _form.targetUserId = ""; _form.targetUserName = "";
  const c = document.getElementById("msg-user-chip"); if (c) c.classList.add("hidden");
  _updateUI();
};

/* ── Meeting search ── */
function _attachMeetingSearch() {
  const inp = document.getElementById("msg-mtg-input");
  if (!inp) return;
  const show = () => {
    const q = inp.value.trim().toLowerCase();
    const meetings = _meetings || [];
    const hits = (q ? meetings.filter(m => m.title.toLowerCase().includes(q) || m.code.toLowerCase().includes(q)) : meetings).slice(0, 10);
    const dd = document.getElementById("msg-mtg-dd"); if (!dd) return;
    if (!hits.length) { dd.innerHTML = `<div class="msg-ac-empty">No meetings found</div>`; }
    else dd.innerHTML = hits.map(m => {
      const badge = m.status === "live" ? "🔴" : m.status === "upcoming" ? "🟡" : "⚫";
      return `<div class="msg-ac-item" onclick="adminMsgPickMeeting('${m.id}','${(m.title||"").replace(/'/g,"\\'")}',${m.participantsCount})">
        <div><span class="msg-ac-name">${badge} ${m.title}</span><br>
        <span class="msg-ac-email">${m.code} · ${m.participantsCount} participants · ${m.status}</span></div>
      </div>`;
    }).join("");
    dd.style.display = "block";
  };
  inp.addEventListener("input", show);
  inp.addEventListener("focus", show);
  document.addEventListener("click", e => { if (!e.target.closest("#msg-mtg-wrap")) _hideDD("msg-mtg-dd"); }, { capture: false });
}

window.adminMsgPickMeeting = function(id, title, count) {
  _form.meetingId = id; _form.meetingTitle = title;
  const inp = document.getElementById("msg-mtg-input"); if (inp) inp.value = "";
  _hideDD("msg-mtg-dd");
  const chip = document.getElementById("msg-meeting-chip");
  if (chip) {
    chip.innerHTML = `<span class="msg-chip-av" style="background:#edf9f3;color:#059669">🎤</span>
      <div><span class="msg-chip-nm">${title}</span><span class="msg-chip-sub">~${count} participants</span></div>
      <button class="msg-chip-rm" onclick="adminMsgClearMeeting()">✕</button>`;
    chip.classList.remove("hidden");
  }
  _updateUI();
};
window.adminMsgClearMeeting = function() {
  _form.meetingId = ""; _form.meetingTitle = "";
  const c = document.getElementById("msg-meeting-chip"); if (c) c.classList.add("hidden");
  _updateUI();
};

/* ── Attach all handlers ── */
function _attachHandlers() {
  document.getElementById("msg-subject")?.addEventListener("input", _onSubjectInput);
  document.getElementById("msg-body")?.addEventListener("input", _onBodyInput);
  _attachUserAC();
  _attachMeetingSearch();
}

function adminMsgToast(msg, type = "success") {
  document.querySelectorAll(".an-toast").forEach(t => t.remove());
  const t = document.createElement("div");
  t.className = "an-toast";
  t.style.cssText = `background:${type==="error"?"#ffeaea":"#edfaf0"};color:${type==="error"?"#e54040":"#158b4b"};border:1px solid ${type==="error"?"#f8c8c8":"#b8f0c8"}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

/* ── Compose panel HTML ── */
function _composePanelHtml() {
  const aud = _form.audience;
  const isSuperadmin = state.isSuperadmin;
  const isBroadcast  = aud === "all_users" || aud === "admins";
  return `
    <div class="an-main-panel msg-compose-panel" id="msg-compose-panel">
      <!-- Panel header -->
      <div class="msg-panel-header">
        <div class="msg-panel-header-icon">${IC.mail}</div>
        <h2 class="msg-panel-title">Compose Message</h2>
      </div>
      <div class="msg-panel-body">

        <!-- AUDIENCE -->
        <div class="msg-field-group">
          <label class="msg-field-label">AUDIENCE</label>
          <div class="msg-pills-grid" role="radiogroup">${audiencePills(isSuperadmin, aud)}</div>
        </div>

        <!-- RECIPIENT (user search) -->
        ${aud === "single" ? `
        <div class="msg-field-group">
          <label class="msg-field-label">RECIPIENT</label>
          <div id="msg-user-wrap" style="position:relative">
            <div id="msg-user-chip" class="msg-chip hidden"></div>
            <div style="position:relative">
              <span class="msg-srch-ico">${IC.search}</span>
              <input type="text" id="msg-user-input" class="an-form-input msg-pad-left"
                placeholder="Search by name or email..." autocomplete="off">
            </div>
            <div id="msg-user-dd" class="msg-ac-dd" style="display:none"></div>
          </div>
        </div>` : ""}

        <!-- MEETING (meeting search) -->
        ${aud === "meeting_participants" ? `
        <div class="msg-field-group">
          <label class="msg-field-label">MEETING</label>
          <div id="msg-mtg-wrap" style="position:relative">
            <div id="msg-meeting-chip" class="msg-chip hidden"></div>
            <div style="position:relative">
              <span class="msg-srch-ico">${IC.search}</span>
              <input type="text" id="msg-mtg-input" class="an-form-input msg-pad-left"
                placeholder="Search by title or code..." autocomplete="off">
            </div>
            <div id="msg-mtg-dd" class="msg-ac-dd" style="display:none"></div>
          </div>
        </div>` : ""}

        <!-- SUBJECT -->
        <div class="msg-field-group">
          <div class="msg-field-label-row">
            <label class="msg-field-label">SUBJECT</label>
            <span class="msg-char-count" id="msg-sub-cnt">0/80</span>
          </div>
          <input type="text" id="msg-subject" class="an-form-input"
            placeholder="e.g. Important update" maxlength="80">
        </div>

        <!-- MESSAGE -->
        <div class="msg-field-group">
          <div class="msg-field-label-row">
            <label class="msg-field-label">MESSAGE</label>
            <span class="msg-char-count" id="msg-body-cnt">0/2000</span>
          </div>
          <textarea id="msg-body" class="an-form-textarea" rows="5"
            placeholder="Write your message here..." maxlength="2000"></textarea>
        </div>

        <!-- Footer -->
        <div class="msg-compose-footer">
          <div id="msg-rcpt">${recipientCountHtml()}</div>
          <button id="msg-send-btn" class="msg-send-btn" onclick="adminSendMessage()">
            ${IC.send} Send Message
          </button>
        </div>

        ${isBroadcast ? `
        <div class="msg-broadcast-notice">
          ⚠️ Sending to <strong>${aud === "all_users" ? "all users" : "all admins"}</strong>
          requires double confirmation — you'll be asked to click again to confirm.
        </div>` : ""}
      </div>
    </div>
  `;
}

/* ── Main render ── */
export function renderAdminMessages() {
  if (_msgHistory === null) { _msgHistory = []; loadHistory(); }
  if (_meetings   === null) { _meetings = [];   loadMeetings(); }
  if (_allUsers   === null) { _allUsers = [];   loadUsers(); }

  const history = _msgHistory || [];

  const html = `
    <div class="an-page">
      <!-- Page header -->
      <div class="an-page-header">
        <div>
          <h1 class="an-page-title">Admin Messaging</h1>
          <p class="an-page-sub">Send direct or broadcast messages to users and groups</p>
          <p class="msg-tip">
            💡 You can also message users or meeting participants from the
            <a class="msg-tip-link" href="#" onclick="return false">Users</a> and
            <a class="msg-tip-link" href="#" onclick="return false">Meetings</a> tabs.
          </p>
        </div>
      </div>

      <!-- Two-column grid -->
      <div class="msg-two-col">
        ${_composePanelHtml()}

        <!-- Sent History panel -->
        <div class="an-main-panel msg-history-panel">
          <div class="msg-panel-header">
            <div class="msg-panel-header-icon">${IC.fileText}</div>
            <h2 class="msg-panel-title">Sent History</h2>
          </div>
          <div id="msg-history-list" class="msg-hist-list">
            ${history.length
              ? history.map((m,i) => msgRow(m,i)).join("")
              : `<div class="an-empty"><div class="an-empty-icon">📨</div><p>No messages sent yet.</p></div>`}
          </div>
        </div>
      </div>

      <style>
        /* ── Layout ── */
        .msg-two-col { display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start }

        /* ── Panel header (shared by compose + history) ── */
        .msg-panel-header {
          display:flex;align-items:center;gap:10px;
          padding:18px 22px 14px;
          border-bottom:1px solid var(--border-color,#e8eaf0);
        }
        .msg-panel-header-icon {
          width:34px;height:34px;border-radius:9px;
          background:#eeeaff;color:#5b34ff;
          display:flex;align-items:center;justify-content:center;flex-shrink:0;
        }
        .msg-panel-header-icon svg { width:16px;height:16px }
        .msg-panel-title { font-size:15px;font-weight:700;color:var(--text-primary);margin:0 }

        /* ── Compose panel body ── */
        .msg-panel-body { display:flex;flex-direction:column;gap:16px;padding:18px 22px 20px }
        .msg-history-panel { padding:0 }
        .msg-compose-panel { padding:0 }

        /* ── Field groups ── */
        .msg-field-group { display:flex;flex-direction:column;gap:6px }
        .msg-field-label { font-size:11px;font-weight:700;color:var(--text-secondary,#68708d);letter-spacing:.06em }
        .msg-field-label-row { display:flex;justify-content:space-between;align-items:center }

        /* ── Audience pills ── */
        .msg-pills-grid { display:grid;grid-template-columns:1fr 1fr;gap:8px }
        .msg-audience-pill {
          display:flex;align-items:flex-start;gap:10px;padding:11px 12px;
          border:1.5px solid var(--border-color,#e8eaf0);border-radius:10px;
          cursor:pointer;transition:border-color .15s,background .15s;
          background:#fff;position:relative;user-select:none;
        }
        .msg-audience-pill:hover:not(.disabled) { border-color:#c4b8ff;background:#faf9ff }
        .msg-audience-pill.active { border-color:#5b34ff;background:#f0ecff }
        .msg-audience-pill.disabled { opacity:.45;cursor:not-allowed;pointer-events:none }
        .msg-pill-icon-wrap {
          width:32px;height:32px;border-radius:8px;
          display:flex;align-items:center;justify-content:center;flex-shrink:0;
          transition:background .15s;
        }
        .msg-pill-icon-wrap svg { width:17px;height:17px }
        .msg-pill-text  { display:flex;flex-direction:column;gap:2px;flex:1;min-width:0 }
        .msg-pill-label { font-size:12.5px;font-weight:700;color:var(--text-primary,#111936);line-height:1.2 }
        .msg-pill-desc  { font-size:11px;color:var(--muted,#8890b0);line-height:1.3 }
        .msg-super-chip {
          position:absolute;top:6px;right:6px;font-size:9px;font-weight:700;
          background:#fff3e0;color:#d97706;border-radius:4px;padding:1px 5px
        }
        .msg-pill-check-circle { position:absolute;bottom:8px;right:8px;line-height:0 }
        .msg-pill-check-circle svg { display:block }

        /* ── Autocomplete dropdown ── */
        .msg-ac-dd {
          position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:300;
          background:var(--bg-primary,#fff);border:1.5px solid #5b34ff33;
          border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.13);
          max-height:220px;overflow-y:auto;
        }
        .msg-ac-item { display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;transition:background .12s }
        .msg-ac-item:hover { background:var(--bg-secondary,#f5f7fe) }
        .msg-ac-av   { width:30px;height:30px;border-radius:50%;background:#f0ecff;color:#5b34ff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0 }
        .msg-ac-name  { font-size:13px;font-weight:600;color:var(--text-primary) }
        .msg-ac-email { font-size:11px;color:var(--muted) }
        .msg-ac-empty { padding:12px;text-align:center;font-size:12px;color:var(--muted) }

        /* ── Chip (selected user/meeting) ── */
        .msg-chip { display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg-secondary,#f5f7fe);border:1.5px solid var(--border-color);border-radius:8px;margin-bottom:4px;font-size:12.5px }
        .msg-chip.hidden { display:none }
        .msg-chip-av  { width:24px;height:24px;border-radius:50%;background:#f0ecff;color:#5b34ff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0 }
        .msg-chip-nm  { font-weight:600;color:var(--text-primary);flex:1 }
        .msg-chip-sub { font-size:11px;color:var(--muted);display:block }
        .msg-chip-rm  { background:none;border:none;color:var(--muted);cursor:pointer;font-size:13px;padding:2px 4px;border-radius:4px;transition:color .12s;margin-left:auto }
        .msg-chip-rm:hover { color:#e54040 }

        /* ── Search input icon ── */
        .msg-srch-ico { position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--muted);pointer-events:none }
        .msg-srch-ico svg { width:14px;height:14px }
        .msg-pad-left { padding-left:34px }

        /* ── Char counter ── */
        .msg-char-count      { font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums }
        .msg-char-count.warn { color:#d97706 }
        .msg-char-count.over { color:#e54040;font-weight:700 }

        /* ── Recipient badge ── */
        .msg-rcpt-badge { display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:500;padding:4px 10px;border-radius:20px;background:#f0ecff;color:#5b34ff }
        .msg-rcpt-badge svg { width:13px;height:13px;opacity:.8 }
        .msg-rcpt-badge.empty { background:#f5f7fe;color:var(--muted,#8890b0);font-weight:400 }
        .msg-rcpt-badge.warn  { background:#ffeaea;color:#e54040 }
        .msg-rcpt-badge em    { font-style:normal;font-weight:400;font-size:11px;opacity:.8 }

        /* ── Compose footer ── */
        .msg-compose-footer { display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;padding-top:4px }

        /* ── Send button ── */
        .msg-send-btn {
          display:inline-flex;align-items:center;gap:7px;
          padding:10px 20px;border-radius:10px;border:none;
          background:linear-gradient(135deg,#5b34ff,#7c5cff);
          color:#fff;font-size:13px;font-weight:600;cursor:pointer;
          box-shadow:0 4px 12px rgba(91,52,255,.3);transition:opacity .15s;
        }
        .msg-send-btn:hover { opacity:.9 }
        .msg-send-btn svg { width:14px;height:14px }
        .msg-send-btn.msg-confirm-mode { background:linear-gradient(135deg,#d97706,#f59e0b);animation:confirmPulse .6s ease infinite alternate }
        @keyframes confirmPulse { from { box-shadow:0 0 0 0 #f59e0b44 } to { box-shadow:0 0 0 8px transparent } }

        /* ── Broadcast notice ── */
        .msg-broadcast-notice { font-size:12px;color:#d97706;background:#fffbeb;border:1px solid #fed7aa;border-radius:8px;padding:8px 12px }
        .msg-broadcast-notice strong { font-weight:700 }

        /* ── Form inputs (scoped to avoid global bleed) ── */
        .msg-compose-panel .an-form-input,
        .msg-compose-panel .an-form-textarea {
          width:100%;padding:9px 12px;border:1.5px solid var(--border-color,#e8eaf0);
          border-radius:8px;font-size:13px;color:var(--text-primary);background:var(--bg-primary,#fff);
          outline:none;box-sizing:border-box;transition:border-color .15s;
        }
        .msg-compose-panel .an-form-input:focus,
        .msg-compose-panel .an-form-textarea:focus { border-color:#5b34ff;box-shadow:0 0 0 3px #5b34ff12 }
        .msg-compose-panel .an-form-textarea { resize:vertical;min-height:110px }

        /* ── Tip bar ── */
        .msg-tip { font-size:12px;color:var(--muted,#8890b0);margin:4px 0 0 }
        .msg-tip-link { color:#5b34ff;font-weight:600;text-decoration:none }
        .msg-tip-link:hover { text-decoration:underline }

        /* ── Sent history ── */
        .msg-hist-list { padding:8px 0;max-height:560px;overflow-y:auto }
        .msg-hist-row {
          display:flex;align-items:flex-start;gap:13px;
          padding:14px 20px;border-bottom:1px solid var(--border-color,#f0f0f8);
          transition:background .12s;
        }
        .msg-hist-row:last-child { border-bottom:none }
        .msg-hist-row:hover { background:var(--bg-secondary,#f9f8ff) }
        .msg-hist-icon {
          width:36px;height:36px;border-radius:9px;flex-shrink:0;
          background:#eeeaff;color:#5b34ff;
          display:flex;align-items:center;justify-content:center;
          margin-top:1px;
        }
        .msg-hist-icon svg { width:16px;height:16px }
        .msg-hist-body { flex:1;min-width:0 }
        .msg-hist-top { display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:3px }
        .msg-hist-subject { font-size:13.5px;font-weight:700;color:var(--text-primary,#111936);line-height:1.3 }
        .msg-hist-right { display:flex;align-items:center;gap:7px;flex-shrink:0 }
        .msg-hist-badge {
          font-size:10px;font-weight:700;letter-spacing:.04em;
          padding:2px 8px;border-radius:5px;white-space:nowrap;
        }
        .msg-hist-date { font-size:11.5px;color:var(--muted,#8890b0);white-space:nowrap }
        .msg-hist-preview { font-size:12.5px;color:var(--text-secondary,#68708d);margin:2px 0 6px;line-height:1.4 }
        .msg-hist-rcpt {
          display:inline-flex;align-items:center;gap:4px;
          font-size:11.5px;color:#5b34ff;font-weight:500;
          background:#f0ecff;padding:2px 9px;border-radius:20px;
        }
        .msg-hist-rcpt svg { width:12px;height:12px }
      </style>
    </div>
  `;

  setTimeout(() => _attachHandlers(), 0);
  return html;
}

export function resetAdminMessagesCache() {
  _msgHistory = null; _meetings = null; _allUsers = null;
  _form = { audience: "single", targetUserId: "", targetUserName: "", meetingId: "", meetingTitle: "" };
}
