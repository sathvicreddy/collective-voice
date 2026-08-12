/* ============================================================
   Notifications Page — v2 Beautiful redesign
   ============================================================ */
import { icons } from "../utils/icons.js";
import { state } from "../state.js";
import { go, api } from "../utils/api.js";
import { shell, desktopTopbar } from "../components/shared.js";

/* ── Active filter ── */
let _activeFilter = "all";

/* ── Type config ── */
const TYPE_CONFIG = {
  "Meeting Updates": { key:"meetings", color:"#5b34ff", bg:"#f0ecff", label:"Meetings" },
  "Meetings":        { key:"meetings", color:"#5b34ff", bg:"#f0ecff", label:"Meetings" },
  "Questions":       { key:"questions",color:"#059669", bg:"#edf9f3", label:"Questions" },
  "Question":        { key:"questions",color:"#059669", bg:"#edf9f3", label:"Questions" },
  "System":          { key:"system",   color:"#d97706", bg:"#fff7ed", label:"System" },
  "Admin Message":   { key:"admin",    color:"#2563eb", bg:"#eff6ff", label:"Admin Message" },
};

/* ── Icons per type ── */
const TYPE_ICONS = {
  meetings:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  questions: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  system:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  admin:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
  default:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
};

const ICON_COLORS = { meetings:"#5b34ff", questions:"#059669", system:"#d97706", admin:"#2563eb", default:"#8890b0" };
const ICON_BG     = { meetings:"#f0ecff", questions:"#edf9f3", system:"#fff7ed", admin:"#eff6ff", default:"#f4f5fa" };

/* ── Helpers ── */
function typeKey(n) { return (TYPE_CONFIG[n.type]?.key) || "system"; }

function timeAgo(item) {
  if (item.time) return item.time;
  if (!item.createdAt) return "";
  const diff = Date.now() - new Date(item.createdAt).getTime();
  if (diff < 60000)   return "Just now";
  if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
  if (diff < 86400000)return `${Math.floor(diff/3600000)}h ago`;
  return new Date(item.createdAt).toLocaleDateString("en-US",{month:"short",day:"numeric"});
}

function filterNotifications(list, filter) {
  if (filter === "all") return list;
  return list.filter(n => typeKey(n) === filter);
}

/* ── Single notification row ── */
function notifRow(item, idx) {
  const key = typeKey(item);
  const cfg = TYPE_CONFIG[item.type] || { color:"#8890b0", bg:"#f4f5fa", label:"Notification" };
  const isUnread = item.read === false;
  const iconHtml = TYPE_ICONS[key] || TYPE_ICONS.default;
  const t = timeAgo(item);

  return `
    <div class="nv2-item ${isUnread ? "nv2-unread" : ""}"
      style="animation:fadeUp .3s ${.04+idx*.05}s both"
      onclick="notifItemClick('${item.id||""}','${(item.type||"").replace(/'/g,"\\'")}')">
      <div class="nv2-item-icon" style="background:${ICON_BG[key]||"#f4f5fa"};color:${ICON_COLORS[key]||"#8890b0"}">
        ${iconHtml}
        ${isUnread ? `<span class="nv2-unread-dot"></span>` : ""}
      </div>
      <div class="nv2-item-body">
        <div class="nv2-item-top">
          <span class="nv2-item-title">${item.title || "Notification"}</span>
          <span class="nv2-item-time">${t}</span>
        </div>
        <p class="nv2-item-desc">${item.body || ""}</p>
        <span class="nv2-tag" style="color:${cfg.color};background:${cfg.bg}">${cfg.label}</span>
      </div>
    </div>
  `;
}

/* ── Empty state ── */
function emptyState(filter) {
  const msgs = {
    all:       { icon:`🔔`, title:"All caught up!", sub:"No notifications yet. Check back after your next meeting." },
    meetings:  { icon:`📅`, title:"No meeting updates", sub:"Meeting reminders and status changes will appear here." },
    questions: { icon:`💬`, title:"No question activity", sub:"Upvotes and answers on your questions appear here." },
    system:    { icon:`⚙️`, title:"No system alerts", sub:"Platform announcements and updates will show here." },
    admin:     { icon:`✉️`, title:"No messages", sub:"Direct messages from the admin team will appear here." },
  };
  const m = msgs[filter] || msgs.all;
  return `
    <div class="nv2-empty">
      <div class="nv2-empty-icon">${m.icon}</div>
      <h3 class="nv2-empty-title">${m.title}</h3>
      <p class="nv2-empty-sub">${m.sub}</p>
    </div>
  `;
}

/* ── Preferences panel ── */
function prefPanel() {
  const prefs = state.notifPrefs || {};
  const rows = [
    { id:"pref-meetings",  label:"Meeting updates",    desc:"Reminders, starts, ends",      checked: prefs.meetingUpdates   !== false, color:"#5b34ff" },
    { id:"pref-questions", label:"Question activity",  desc:"Upvotes, answers, flags",      checked: prefs.questionActivity !== false, color:"#059669" },
    { id:"pref-system",    label:"System alerts",      desc:"Platform news & maintenance",  checked: prefs.systemAlerts     !== false, color:"#d97706" },
    { id:"pref-admin",     label:"Admin messages",     desc:"Direct messages from admins",  checked: prefs.adminMessages    !== false, color:"#2563eb" },
    { id:"pref-email",     label:"Email digest",       desc:"Weekly summary to your inbox", checked: prefs.emailDigest      === true,  color:"#7c3aed" },
  ];
  return `
    <div class="nv2-pref-card">
      <div class="nv2-pref-header">
        <svg viewBox="0 0 24 24" fill="none" stroke="#5b34ff" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        <span>Preferences</span>
      </div>
      <div class="nv2-pref-list">
        ${rows.map(p => `
          <div class="nv2-pref-row">
            <div class="nv2-pref-dot" style="background:${p.color}"></div>
            <div class="nv2-pref-body">
              <div class="nv2-pref-label">${p.label}</div>
              <div class="nv2-pref-desc">${p.desc}</div>
            </div>
            <label class="nv2-toggle">
              <input type="checkbox" id="${p.id}" ${p.checked ? "checked" : ""} onchange="notifPrefChange('${p.id}',this.checked,this)">
              <span class="nv2-toggle-slider"></span>
            </label>
          </div>
        `).join("")}
      </div>
    </div>

    <div class="nv2-pref-card nv2-stats-card">
      <div class="nv2-pref-header">
        <svg viewBox="0 0 24 24" fill="none" stroke="#5b34ff" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
        <span>Activity</span>
      </div>
      <div class="nv2-stats-grid">
        <div class="nv2-stat">
          <div class="nv2-stat-num" style="color:#5b34ff">${(state.notifications||[]).length}</div>
          <div class="nv2-stat-label">Total</div>
        </div>
        <div class="nv2-stat">
          <div class="nv2-stat-num" style="color:#e54040">${(state.notifications||[]).filter(n=>!n.read).length}</div>
          <div class="nv2-stat-label">Unread</div>
        </div>
        <div class="nv2-stat">
          <div class="nv2-stat-num" style="color:#059669">${(state.notifications||[]).filter(n=>typeKey(n)==="meetings").length}</div>
          <div class="nv2-stat-label">Meetings</div>
        </div>
        <div class="nv2-stat">
          <div class="nv2-stat-num" style="color:#d97706">${(state.notifications||[]).filter(n=>typeKey(n)==="system").length}</div>
          <div class="nv2-stat-label">System</div>
        </div>
      </div>
    </div>
  `;
}

/* ── Helper: update all topbar notification badges ── */
function _updateTopbarBadges() {
  const unread = (state.notifications || []).filter(n => n.read === false).length;

  // Desktop badge
  const desktopBadge = document.querySelector(".desktop-notif-badge");
  if (desktopBadge) {
    if (unread > 0) {
      desktopBadge.textContent = unread > 9 ? "9+" : String(unread);
      desktopBadge.style.display = "";
    } else {
      desktopBadge.style.display = "none";
    }
  }

  // Mobile badge (inside .topbar bell button)
  const mobileBellBtns = document.querySelectorAll(".topbar .icon-btn.ghost-icon");
  mobileBellBtns.forEach(btn => {
    if (!btn.getAttribute("onclick")?.includes("notifications")) return;
    let mobileBadge = btn.querySelector("span[style*='position:absolute']");
    if (unread > 0) {
      if (!mobileBadge) {
        mobileBadge = document.createElement("span");
        mobileBadge.style.cssText = "position:absolute;top:-4px;right:-4px;background:#e54040;color:#fff;font-size:10px;font-weight:700;border-radius:50%;width:16px;height:16px;display:flex;align-items:center;justify-content:center;line-height:1";
        btn.appendChild(mobileBadge);
      }
      mobileBadge.textContent = unread > 9 ? "9+" : String(unread);
    } else if (mobileBadge) {
      mobileBadge.remove();
    }
  });
}

/* ── Global handlers ── */
window.notifFilterTab = function(btn, filter) {
  _activeFilter = filter;
  document.querySelectorAll(".nv2-tab, .nv2-mtab").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(`[data-filter="${filter}"]`).forEach(b => b.classList.add("active"));

  const list  = document.getElementById("nv2-list");
  const mlist = document.getElementById("nv2-list-mobile");
  const all = state.notifications || [];
  const filtered = filterNotifications(all, filter);
  const html = filtered.length ? filtered.map((n,i) => notifRow(n,i)).join("") : emptyState(filter);
  if (list)  list.innerHTML  = html;
  if (mlist) mlist.innerHTML = html;

  // Update tab count badges to reflect current state
  document.querySelectorAll(".nv2-tab, .nv2-mtab").forEach(tabBtn => {
    const f = tabBtn.dataset.filter;
    if (!f) return;
    const countEl = tabBtn.querySelector(".nv2-tab-count");
    let count = 0;
    if (f === "all")       count = all.length;
    else if (f === "meetings")  count = all.filter(n => typeKey(n) === "meetings").length;
    else if (f === "questions") count = all.filter(n => typeKey(n) === "questions").length;
    else if (f === "system")    count = all.filter(n => typeKey(n) === "system").length;
    else if (f === "admin")     count = all.filter(n => typeKey(n) === "admin").length;
    if (countEl) {
      countEl.textContent = String(count);
      countEl.style.display = count > 0 ? "" : "none";
    }
  });
};

window.markAllNotificationsRead = async function() {
  const btn  = document.getElementById("nv2-mark-all");
  const btnM = document.getElementById("nv2-mark-all-m");
  [btn,btnM].forEach(b => { if(b){b.disabled=true;b.textContent="Marking…";} });
  try {
    if (state.token) await api("/api/notifications/mark-read",{method:"PATCH",body:JSON.stringify({})});
    state.notifications = (state.notifications||[]).map(n => ({...n,read:true}));
    window.notifFilterTab(null, _activeFilter);
    document.querySelectorAll(".nv2-unread-dot").forEach(d => d.remove());
    document.querySelectorAll(".nv2-item").forEach(el => el.classList.remove("nv2-unread"));
    // Hide all unread badges
    _updateTopbarBadges();
    // Hide the in-page unread count badges
    document.querySelectorAll(".nv2-count-badge, .nv2-unread-badge").forEach(el => el.style.display = "none");
    // Disable mark-all button since there's nothing to mark
    [btn,btnM].forEach(b => { if(b) b.disabled = true; });
  } catch { /* non-fatal */ }
  finally {
    [btn,btnM].forEach(b => { if(b){b.disabled=false;b.textContent="Mark all read";} });
  }
};

window.notifItemClick = function(id, type) {
  if (id && state.token) {
    api("/api/notifications/mark-read",{method:"PATCH",body:JSON.stringify({id})}).catch(()=>{});
    const n = (state.notifications||[]).find(n => n.id===id);
    if (n) {
      n.read = true;
      // Mark the clicked item visually as read without full re-render
      const itemEl = document.querySelector(`[onclick*="'${id}'"]`);
      if (itemEl) {
        itemEl.classList.remove("nv2-unread");
        const dot = itemEl.querySelector(".nv2-unread-dot");
        if (dot) dot.remove();
      }
      _updateTopbarBadges();
    }
  }
  const key = (TYPE_CONFIG[type]?.key) || "system";
  if (key === "meetings")       go("/meetings");
  else if (key === "questions") go("/activity");
  else if (key === "admin")     go("/notifications"); // stay on page for admin messages (already read)
  else go("/notifications"); // system/unknown — stay on notifications
};


window.notifPrefChange = async function(prefId, val, checkboxEl) {
  const KEY_MAP = {
    "pref-meetings":  "meetingUpdates",
    "pref-questions": "questionActivity",
    "pref-system":    "systemAlerts",
    "pref-email":     "emailDigest",
    "pref-admin":     "adminMessages",
  };
  const apiKey = KEY_MAP[prefId];
  const names  = {
    "pref-meetings":"Meeting updates", "pref-questions":"Question activity",
    "pref-system":"System alerts", "pref-email":"Email digest", "pref-admin":"Admin messages"
  };
  if (!apiKey || !state.token) {
    // Not logged in: just show toast
    const toast = document.createElement("div");
    toast.style.cssText = "position:fixed;bottom:24px;right:24px;z-index:9999;padding:11px 18px;border-radius:10px;font-size:13px;font-weight:600;background:#edfaf0;color:#158b4b;border:1px solid #b8f0c8;box-shadow:0 6px 20px rgba(0,0,0,.12)";
    toast.textContent = `${names[prefId]||prefId}: ${val?"enabled":"disabled"}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
    return;
  }
  // Optimistic update
  if (!state.notifPrefs) state.notifPrefs = {};
  const prev = state.notifPrefs[apiKey];
  state.notifPrefs[apiKey] = val;
  try {
    const res = await api("/api/notifications/preferences", {
      method: "PATCH",
      body:   JSON.stringify({ [apiKey]: val })
    });
    if (res?.preferences) state.notifPrefs = res.preferences;
    const toast = document.createElement("div");
    toast.style.cssText = "position:fixed;bottom:24px;right:24px;z-index:9999;padding:11px 18px;border-radius:10px;font-size:13px;font-weight:600;background:#edfaf0;color:#158b4b;border:1px solid #b8f0c8;box-shadow:0 6px 20px rgba(0,0,0,.12)";
    toast.textContent = `${names[prefId]||prefId}: ${val?"enabled":"disabled"}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  } catch {
    // Revert on failure
    state.notifPrefs[apiKey] = prev;
    if (checkboxEl) checkboxEl.checked = !!prev;
  }
};

/* ── Main renderer ── */
export function renderNotifications() {
  const all      = state.notifications || [];
  const unread   = all.filter(n => n.read === false).length;
  const filtered = filterNotifications(all, _activeFilter);

  const tabs = [
    { key:"all",      label:"All",       count:all.length },
    { key:"meetings", label:"Meetings",  count:all.filter(n=>typeKey(n)==="meetings").length },
    { key:"questions",label:"Questions", count:all.filter(n=>typeKey(n)==="questions").length },
    { key:"system",   label:"System",    count:all.filter(n=>typeKey(n)==="system").length },
    { key:"admin",    label:"Messages",  count:all.filter(n=>typeKey(n)==="admin").length },
  ];

  // Load prefs from API if not already loaded (fire-and-forget; pref panel re-renders on next navigate)
  if (!state.notifPrefs && state.token) {
    api("/api/notifications/preferences").then(data => {
      if (data?.preferences) state.notifPrefs = data.preferences;
    }).catch(() => {});
  }

  // Register live notification listener so incoming WS notifications appear without page reload.
  // Guard with a flag so we don't add duplicate listeners across re-renders.
  if (!window._cvNotifListenerAttached) {
    window._cvNotifListenerAttached = true;
    document.addEventListener("cv:new_notification", () => {
      // Full re-render of the notifications page so header counts, tab badges,
      // and the notification list are all consistent with the new state.
      renderNotifications();
    });
  }

  /* ─── Mobile ─── */
  const mobileContent = `
    <div class="nv2-mobile">
      <div class="nv2-mobile-header">
        <div class="nv2-mobile-title-row">
          <h1 class="nv2-mobile-title">Notifications</h1>
          ${unread > 0 ? `<span class="nv2-count-badge">${unread}</span>` : ""}
        </div>
        ${unread > 0 ? `
          <button class="nv2-mark-btn" id="nv2-mark-all-m" onclick="markAllNotificationsRead()">
            Mark all read
          </button>` : ""}
      </div>

      <div class="nv2-mobile-tabs">
        ${tabs.map(t=>`
          <button class="nv2-mtab ${_activeFilter===t.key?"active":""}" data-filter="${t.key}"
            onclick="notifFilterTab(this,'${t.key}')">
            ${t.label}${t.count>0?`<span class="nv2-tab-count">${t.count}</span>`:""}
          </button>
        `).join("")}
      </div>

      <div class="nv2-mobile-list" id="nv2-list-mobile">
        ${filtered.length ? filtered.map((n,i)=>notifRow(n,i)).join("") : emptyState(_activeFilter)}
      </div>
    </div>
  `;

  /* ─── Desktop ─── */
  const desktopMain = `
    ${desktopTopbar("Notifications","Stay updated on meetings, questions and platform activity.")}

    <div class="nv2-desktop-body">

      <!-- ═══ LEFT: Notification list ═══ -->
      <div class="nv2-left">
        <div class="nv2-list-card">
          <div class="nv2-list-header">
            <div class="nv2-list-title-row">
              <span class="nv2-list-title">All Notifications</span>
              ${unread > 0 ? `<span class="nv2-unread-badge">${unread} unread</span>` : ""}
            </div>
            <button class="nv2-mark-btn" id="nv2-mark-all"
              onclick="markAllNotificationsRead()" ${all.length===0?"disabled":""}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px"><polyline points="20 6 9 17 4 12"/></svg>
              Mark all read
            </button>
          </div>

          <div class="nv2-tabs-row">
            ${tabs.map(t=>`
              <button class="nv2-tab ${_activeFilter===t.key?"active":""}" data-filter="${t.key}"
                onclick="notifFilterTab(this,'${t.key}')">
                ${t.label}
                ${t.count>0?`<span class="nv2-tab-count">${t.count}</span>`:""}
              </button>
            `).join("")}
          </div>

          <div class="nv2-list" id="nv2-list">
            ${filtered.length ? filtered.map((n,i)=>notifRow(n,i)).join("") : emptyState(_activeFilter)}
          </div>
        </div>
      </div>

      <!-- ═══ RIGHT: Preferences + Stats ═══ -->
      <div class="nv2-right">
        ${prefPanel()}
      </div>

    </div>
  `;

  shell(mobileContent, "", desktopMain, "");
}
