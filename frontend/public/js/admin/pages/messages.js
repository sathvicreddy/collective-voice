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

/* ── Message row ── */
function msgRow(m, idx) {
  const acfg = AUDIENCE_CFG[m.audience] || AUDIENCE_CFG.single;
  const t    = relTime(m.createdAt);
  const name = m.sender?.name || "Unknown";
  const isMine = m.senderId === state.currentUser?.id;
  const bodyPreview = (m.body || "").length > 120 ? m.body.slice(0, 120) + "…" : m.body;
  return `
    <div class="an-row" style="animation:slideInLeft .28s ${.03+idx*.04}s both">
      <div class="an-icon" style="background:#f0ecff;color:#5b34ff">${IC.mail}</div>
      <div class="an-body">
        <div class="an-top-row">
          <span class="an-title">${m.subject}</span>
          <div class="an-meta">
            <span class="an-priority" style="background:${acfg.bg};color:${acfg.color}">${acfg.label}</span>
            <span class="an-time">${t}</span>
          </div>
        </div>
        <p class="an-desc">${bodyPreview}</p>
        <div class="an-tags">
          <span class="an-type-tag" style="color:#5b34ff;background:#f0ecff">
            ${IC.users || ""} ${m.recipientCount} recipient${m.recipientCount !== 1 ? "s" : ""}
          </span>
          ${!isMine ? `<span class="an-read-tag">By ${name}</span>` : ""}
        </div>
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
  { value: "single",               icon: "👤", label: "Direct Message",       desc: "Send to one specific person",                    superOnly: false },
  { value: "meeting_participants", icon: "🎤", label: "Meeting Participants",  desc: "Everyone in a live or scheduled meeting",         superOnly: false },
  { value: "all_users",            icon: "🌐", label: "All Users",             desc: "Broadcast to every user on the platform",         superOnly: true  },
  { value: "admins",               icon: "🛡️", label: "All Admins",           desc: "Send to all admin and superadmin accounts",       superOnly: true  },
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
        <span class="msg-pill-icon">${p.icon}</span>
        <div class="msg-pill-text">
          <span class="msg-pill-label">${p.label}</span>
          <span class="msg-pill-desc">${p.desc}</span>
        </div>
        ${disabled ? `<span class="msg-super-chip">Superadmin</span>` : ""}
        ${active ? `<span class="msg-pill-check">✓</span>` : ""}
      </div>
    `;
  }).join("");
}

/* ── Recipient count ── */
function recipientCountHtml() {
  const aud = _form.audience;
  if (aud === "single") {
    return _form.targetUserId
      ? `<span class="msg-rcpt-badge">👤 1 recipient</span>`
      : `<span class="msg-rcpt-badge empty">Select a recipient</span>`;
  }
  if (aud === "meeting_participants") {
    if (!_form.meetingId) return `<span class="msg-rcpt-badge empty">Select a meeting</span>`;
    const mtg = (_meetings || []).find(m => m.id === _form.meetingId);
    const cnt = mtg ? mtg.participantsCount : "?";
    return `<span class="msg-rcpt-badge">🎤 ~${cnt} participant${cnt !== 1 ? "s" : ""}</span>`;
  }
  if (aud === "all_users") {
    const cnt = _allUsers ? _allUsers.length : "…";
    return `<span class="msg-rcpt-badge warn">🌐 ${cnt} users <em>(broadcast)</em></span>`;
  }
  if (aud === "admins") {
    return `<span class="msg-rcpt-badge warn">🛡️ All admins <em>(broadcast)</em></span>`;
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
    <div class="an-main-panel msg-compose-panel" id="msg-compose-panel" style="padding:24px">
      <h2 style="font-size:16px;font-weight:700;color:var(--text-primary);margin:0 0 20px;display:flex;align-items:center;gap:8px">
        ${IC.mail} Compose Message
      </h2>
      <div style="display:flex;flex-direction:column;gap:18px">

        <!-- Audience pills -->
        <div>
          <label class="an-form-label">Audience</label>
          <div class="msg-pills-grid" role="radiogroup">${audiencePills(isSuperadmin, aud)}</div>
        </div>

        <!-- User autocomplete -->
        ${aud === "single" ? `
        <div>
          <label class="an-form-label">Recipient</label>
          <div id="msg-user-wrap" style="position:relative">
            <div id="msg-user-chip" class="msg-chip hidden"></div>
            <div style="position:relative">
              <span class="msg-srch-ico">${IC.search}</span>
              <input type="text" id="msg-user-input" class="an-form-input msg-pad-left"
                placeholder="Search by name or email…" autocomplete="off">
            </div>
            <div id="msg-user-dd" class="msg-ac-dd" style="display:none"></div>
          </div>
        </div>` : ""}

        <!-- Meeting search -->
        ${aud === "meeting_participants" ? `
        <div>
          <label class="an-form-label">Meeting</label>
          <div id="msg-mtg-wrap" style="position:relative">
            <div id="msg-meeting-chip" class="msg-chip hidden"></div>
            <div style="position:relative">
              <span class="msg-srch-ico">${IC.search}</span>
              <input type="text" id="msg-mtg-input" class="an-form-input msg-pad-left"
                placeholder="Search by title or code…" autocomplete="off">
            </div>
            <div id="msg-mtg-dd" class="msg-ac-dd" style="display:none"></div>
          </div>
        </div>` : ""}

        <!-- Subject -->
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
            <label class="an-form-label" style="margin:0">Subject</label>
            <span class="msg-char-count" id="msg-sub-cnt">0/80</span>
          </div>
          <input type="text" id="msg-subject" class="an-form-input"
            placeholder="e.g. Important update" maxlength="80">
        </div>

        <!-- Body -->
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
            <label class="an-form-label" style="margin:0">Message</label>
            <span class="msg-char-count" id="msg-body-cnt">0/2000</span>
          </div>
          <textarea id="msg-body" class="an-form-textarea" rows="5"
            placeholder="Write your message here…" maxlength="2000"></textarea>
        </div>

        <!-- Footer: recipient count + send button -->
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
          <div id="msg-rcpt">${recipientCountHtml()}</div>
          <button id="msg-send-btn" class="an-header-btn msg-send-btn" onclick="adminSendMessage()">
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
      <div class="an-page-header">
        <div>
          <h1 class="an-page-title">Admin Messaging</h1>
          <p class="an-page-sub">Send direct or broadcast messages to users and groups</p>
          <p style="font-size:12px;color:var(--muted,#8890b0);margin:4px 0 0">
            💡 You can also message users or meeting participants from the
            <strong style="color:var(--text-secondary)">Users</strong> and
            <strong style="color:var(--text-secondary)">Meetings</strong> tabs.
          </p>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start">
        ${_composePanelHtml()}

        <div class="an-main-panel" style="padding:0">
          <div style="padding:20px 24px 12px;border-bottom:1px solid var(--border-color)">
            <h2 style="font-size:16px;font-weight:700;color:var(--text-primary);margin:0">
              ${IC.fileText || IC.bell} Sent History
            </h2>
          </div>
          <div id="msg-history-list" class="an-list" style="max-height:580px;overflow-y:auto">
            ${history.length
              ? history.map((m,i) => msgRow(m,i)).join("")
              : `<div class="an-empty"><div class="an-empty-icon">📨</div><p>No messages sent yet.</p></div>`}
          </div>
        </div>
      </div>

      <style>
        .msg-pills-grid { display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px }
        .msg-audience-pill {
          display:flex;align-items:flex-start;gap:10px;padding:10px 12px;
          border:1.5px solid var(--border-color,#e8eaf0);border-radius:10px;cursor:pointer;
          transition:border-color .18s,background .18s;background:var(--bg-primary,#fff);
          position:relative;user-select:none;
        }
        .msg-audience-pill:hover:not(.disabled) { border-color:#5b34ff;background:#f8f6ff }
        .msg-audience-pill.active { border-color:#5b34ff;background:#f0ecff }
        .msg-audience-pill.disabled { opacity:.48;cursor:not-allowed;pointer-events:none }
        .msg-pill-icon   { font-size:18px;flex-shrink:0;margin-top:1px }
        .msg-pill-text   { display:flex;flex-direction:column;gap:1px;flex:1;min-width:0 }
        .msg-pill-label  { font-size:12.5px;font-weight:700;color:var(--text-primary) }
        .msg-pill-desc   { font-size:11px;color:var(--muted,#8890b0);line-height:1.3 }
        .msg-super-chip  { position:absolute;top:6px;right:6px;font-size:9px;font-weight:700;background:#fff3e0;color:#d97706;border-radius:4px;padding:1px 5px }
        .msg-pill-check  { position:absolute;bottom:6px;right:8px;color:#5b34ff;font-size:12px;font-weight:700 }

        .msg-ac-dd {
          position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:300;
          background:var(--bg-primary,#fff);border:1.5px solid #5b34ff33;
          border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.14);
          max-height:220px;overflow-y:auto;
        }
        .msg-ac-item { display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;transition:background .13s }
        .msg-ac-item:hover { background:var(--bg-secondary,#f5f7fe) }
        .msg-ac-av  { width:30px;height:30px;border-radius:50%;background:#f0ecff;color:#5b34ff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0 }
        .msg-ac-name  { font-size:13px;font-weight:600;color:var(--text-primary) }
        .msg-ac-email { font-size:11px;color:var(--muted) }
        .msg-ac-empty { padding:12px;text-align:center;font-size:12px;color:var(--muted) }

        .msg-chip { display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg-secondary,#f5f7fe);border:1.5px solid var(--border-color);border-radius:8px;margin-bottom:6px;font-size:12.5px }
        .msg-chip.hidden { display:none }
        .msg-chip-av  { width:24px;height:24px;border-radius:50%;background:#f0ecff;color:#5b34ff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0 }
        .msg-chip-nm  { font-weight:600;color:var(--text-primary);flex:1 }
        .msg-chip-sub { font-size:11px;color:var(--muted);display:block }
        .msg-chip-rm  { background:none;border:none;color:var(--muted);cursor:pointer;font-size:13px;padding:2px 4px;border-radius:4px;transition:color .13s;margin-left:auto }
        .msg-chip-rm:hover { color:#e54040 }

        .msg-srch-ico { position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--muted);pointer-events:none }
        .msg-srch-ico svg { width:14px;height:14px }
        .msg-pad-left { padding-left:34px }

        .msg-char-count      { font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums }
        .msg-char-count.warn { color:#d97706 }
        .msg-char-count.over { color:#e54040;font-weight:700 }

        .msg-rcpt-badge      { display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;padding:4px 10px;border-radius:20px;background:#f0ecff;color:#5b34ff }
        .msg-rcpt-badge.empty{ background:#f5f7fe;color:var(--muted);font-weight:400 }
        .msg-rcpt-badge.warn { background:#ffeaea;color:#e54040 }
        .msg-rcpt-badge em   { font-style:normal;font-weight:400;font-size:11px;opacity:.8 }

        .msg-broadcast-notice { font-size:12px;color:#d97706;background:#fffbeb;border:1px solid #fed7aa;border-radius:8px;padding:8px 12px }
        .msg-broadcast-notice strong { font-weight:700 }

        .msg-send-btn { display:inline-flex;align-items:center;gap:6px }
        .msg-send-btn.msg-confirm-mode { background:linear-gradient(135deg,#d97706,#f59e0b);animation:confirmPulse .6s ease infinite alternate }
        @keyframes confirmPulse { from { box-shadow:0 0 0 0 #f59e0b44 } to { box-shadow:0 0 0 8px transparent } }

        .an-form-label { display:block;font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.04em }
        .an-form-input,.an-form-select,.an-form-textarea { width:100%;padding:9px 12px;border:1.5px solid var(--border-color);border-radius:8px;font-size:13px;color:var(--text-primary);background:var(--bg-primary);outline:none;box-sizing:border-box;transition:border-color .18s }
        .an-form-input:focus,.an-form-select:focus,.an-form-textarea:focus { border-color:#5b34ff;box-shadow:0 0 0 3px #5b34ff14 }
        .an-form-textarea { resize:vertical;min-height:100px }
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
