/* ============================================================
   Admin Notifications Page — real data from /api/admin/notifications
   ============================================================ */
import { IC } from '../icons.js';
import { state } from '../state.js';

/* ── Notification categories ── */
const ADMIN_NOTIF_CONFIG = {
  system:    { label:"System",         color:"#5b34ff", bg:"#f0ecff", icon: IC.monitor  },
  user:      { label:"User Report",    color:"#e54040", bg:"#ffeaea", icon: IC.users    },
  meeting:   { label:"Meeting",        color:"#059669", bg:"#edf9f3", icon: IC.calendar },
  security:  { label:"Security",       color:"#d97706", bg:"#fff7ed", icon: IC.shield   },
  content:   { label:"Content Flag",   color:"#7c3aed", bg:"#f5f3ff", icon: IC.flag     },
};

const PRIORITY_CONFIG = {
  critical: { label:"Critical", color:"#e54040", bg:"#ffeaea" },
  high:     { label:"High",     color:"#d97706", bg:"#fff7ed" },
  medium:   { label:"Medium",   color:"#5b34ff", bg:"#f0ecff" },
  low:      { label:"Low",      color:"#059669", bg:"#edf9f3" },
};

/* ── State ── */
let _adminNotifFilter    = "all";
let _adminPriorityFilter = "all";
let _adminNotifs         = null; // null = not yet loaded

/* ── Time helper ── */
function relTime(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000)    return "Just now";
  if (diff < 3600000)  return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ── API helper (uses admin JWT from state; falls back to localStorage) ── */
async function adminFetch(method, path, body) {
  const token = state.token || localStorage.getItem("cv_token") || "";
  const opts  = { method, headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  return res.json();
}

/* ── Load real data from backend ── */
async function loadNotifs() {
  try {
    const data = await adminFetch("GET", "/api/admin/notifications");
    _adminNotifs = Array.isArray(data.notifications) ? data.notifications : [];
  } catch {
    _adminNotifs = [];
  }
  _renderAdminNotifList();
  _updateAdminStats();
}

function filterAdminNotifs(list, type, priority) {
  return list.filter(n => {
    const typeOk     = type === "all"     || n.type     === type;
    const priorityOk = priority === "all" || n.priority === priority;
    return typeOk && priorityOk;
  });
}

/* ── Single row ── */
function adminNotifRow(n, idx) {
  const cfg  = ADMIN_NOTIF_CONFIG[n.type]  || ADMIN_NOTIF_CONFIG.system;
  const pcfg = PRIORITY_CONFIG[n.priority] || PRIORITY_CONFIG.low;
  const t    = relTime(n.createdAt);
  return `
    <div class="an-row ${!n.read?"an-unread":""}" style="animation:slideInLeft .28s ${.03+idx*.04}s both"
      onclick="adminNotifClick('${n.id}','${n.type}')">
      <div class="an-icon" style="background:${cfg.bg};color:${cfg.color}">${cfg.icon}</div>
      <div class="an-body">
        <div class="an-top-row">
          <span class="an-title">${n.title}</span>
          <div class="an-meta">
            <span class="an-priority" style="background:${pcfg.bg};color:${pcfg.color}">${pcfg.label}</span>
            <span class="an-time">${t}</span>
          </div>
        </div>
        <p class="an-desc">${n.body}</p>
        <div class="an-tags">
          <span class="an-type-tag" style="color:${cfg.color};background:${cfg.bg}">${cfg.label}</span>
          ${!n.read ? `<span class="an-new-tag">New</span>` : `<span class="an-read-tag">Read</span>`}
        </div>
      </div>
      <div class="an-actions">
        <button class="an-action-btn" title="Mark as read" onclick="adminMarkRead('${n.id}',event)">
          ${IC.check}
        </button>
        <button class="an-action-btn an-dismiss" title="Dismiss" onclick="adminDismiss('${n.id}',event)">
          ${IC.x}
        </button>
      </div>
    </div>
  `;
}

/* ── Global handlers ── */
window.adminNotifTypeFilter = function(btn, type) {
  _adminNotifFilter = type;
  document.querySelectorAll(".an-type-tab").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  _renderAdminNotifList();
};

window.adminNotifPriorityFilter = function(val) {
  _adminPriorityFilter = val;
  _renderAdminNotifList();
};

window.adminMarkRead = function(id, e) {
  e.stopPropagation();
  const n = (_adminNotifs || []).find(n => n.id === id);
  if (n) n.read = true;
  adminFetch("PATCH", "/api/admin/notifications/mark-read", { id }).catch(() => {});
  _renderAdminNotifList();
  _updateAdminStats();
  adminToast("Marked as read");
};

window.adminDismiss = function(id, e) {
  e.stopPropagation();
  _adminNotifs = (_adminNotifs || []).filter(n => n.id !== id);
  adminFetch("DELETE", `/api/admin/notifications/${id}`).catch(() => {});
  _renderAdminNotifList();
  _updateAdminStats();
  adminToast("Notification dismissed");
};

window.adminMarkAllRead = function() {
  (_adminNotifs || []).forEach(n => n.read = true);
  adminFetch("PATCH", "/api/admin/notifications/mark-read").catch(() => {});
  _renderAdminNotifList();
  _updateAdminStats();
  adminToast("All notifications marked as read");
};

window.adminClearAll = function() {
  if (!confirm("Clear all notifications?")) return;
  _adminNotifs = [];
  adminFetch("DELETE", "/api/admin/notifications").catch(() => {});
  _renderAdminNotifList();
  _updateAdminStats();
  adminToast("All notifications cleared");
};

window.adminNotifClick = function(id, type) {
  const n = (_adminNotifs || []).find(n => n.id === id);
  if (n && !n.read) {
    n.read = true;
    adminFetch("PATCH", "/api/admin/notifications/mark-read", { id }).catch(() => {});
    _updateAdminStats();
  }
  if (type === "security")                    window.adminNavigate("audit");
  else if (type === "user" || type === "content") window.adminNavigate("moderation");
  else if (type === "meeting")                window.adminNavigate("meetings");
  else                                        window.adminNavigate("health");
};

function _renderAdminNotifList() {
  const list = document.getElementById("an-list");
  if (!list) return;
  const all      = _adminNotifs || [];
  const filtered = filterAdminNotifs(all, _adminNotifFilter, _adminPriorityFilter);
  list.innerHTML = filtered.length
    ? filtered.map((n,i) => adminNotifRow(n,i)).join("")
    : `<div class="an-empty"><div class="an-empty-icon">🔔</div><p>No notifications match the current filters.</p></div>`;
}

function _updateAdminStats() {
  const all      = _adminNotifs || [];
  const unread   = all.filter(n => !n.read).length;
  const critical = all.filter(n => n.priority === "critical" && !n.read).length;
  const resolved = all.filter(n => n.read).length;
  const s = { "an-stat-total":all.length, "an-stat-unread":unread, "an-stat-critical":critical, "an-stat-resolved":resolved };
  Object.entries(s).forEach(([id,val]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  });
  // Update topbar badge
  const badge = document.querySelector("#admin-notif-badge");
  if (badge) badge.textContent = unread || "";
}

function adminToast(msg) {
  document.querySelectorAll(".an-toast").forEach(t => t.remove());
  const t = document.createElement("div");
  t.className = "an-toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2400);
}

/* ── Main render ── */
export function renderAdminNotifications() {
  const all      = _adminNotifs || [];
  const unread   = all.filter(n => !n.read).length;
  const critical = all.filter(n => n.priority === "critical" && !n.read).length;
  const resolved = all.filter(n => n.read).length;
  const filtered = filterAdminNotifs(all, _adminNotifFilter, _adminPriorityFilter);

  const typeTabs = [
    { key:"all",      label:"All" },
    { key:"security", label:"Security" },
    { key:"user",     label:"User Reports" },
    { key:"content",  label:"Content Flags" },
    { key:"meeting",  label:"Meetings" },
    { key:"system",   label:"System" },
  ];

  // Kick off data fetch asynchronously — re-renders when complete
  if (_adminNotifs === null) {
    _adminNotifs = []; // prevent duplicate fetches while loading
    loadNotifs();
  }

  return `
    <div class="an-page">
      <!-- Header -->
      <div class="an-page-header">
        <div>
          <h1 class="an-page-title">Notifications</h1>
          <p class="an-page-sub">Monitor system alerts, user reports and platform events</p>
        </div>
        <div class="an-header-actions">
          <button class="an-header-btn" onclick="adminMarkAllRead()">
            ${IC.check} Mark all read
          </button>
          <button class="an-header-btn an-danger-btn" onclick="adminClearAll()">
            ${IC.trash} Clear all
          </button>
        </div>
      </div>

      <!-- Stats row -->
      <div class="an-stats-row">
        <div class="an-stat-card">
          <div class="an-stat-icon" style="background:#f0ecff;color:#5b34ff">${IC.bell}</div>
          <div>
            <div class="an-stat-num" id="an-stat-total">${all.length}</div>
            <div class="an-stat-label">Total</div>
          </div>
        </div>
        <div class="an-stat-card an-stat-card--alert">
          <div class="an-stat-icon" style="background:#ffeaea;color:#e54040">${IC.alertCircle}</div>
          <div>
            <div class="an-stat-num" id="an-stat-unread" style="color:#e54040">${unread}</div>
            <div class="an-stat-label">Unread</div>
          </div>
        </div>
        <div class="an-stat-card">
          <div class="an-stat-icon" style="background:#fff7ed;color:#d97706">${IC.alertTriangle}</div>
          <div>
            <div class="an-stat-num" id="an-stat-critical" style="color:#d97706">${critical}</div>
            <div class="an-stat-label">Critical</div>
          </div>
        </div>
        <div class="an-stat-card">
          <div class="an-stat-icon" style="background:#edf9f3;color:#059669">${IC.shieldCheck}</div>
          <div>
            <div class="an-stat-num" id="an-stat-resolved" style="color:#059669">${resolved}</div>
            <div class="an-stat-label">Resolved</div>
          </div>
        </div>
      </div>

      <!-- Main panel -->
      <div class="an-main-panel">
        <!-- Type filter tabs -->
        <div class="an-type-tabs">
          ${typeTabs.map(t => `
            <button class="an-type-tab ${_adminNotifFilter===t.key?"active":""}"
              onclick="adminNotifTypeFilter(this,'${t.key}')">${t.label}
            </button>
          `).join("")}
          <div class="an-tab-spacer"></div>
          <select class="an-priority-select" data-change="adminNotifPriorityFilter">
            <option value="all">All Priorities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        <!-- List -->
        <div class="an-list" id="an-list">
          ${_adminNotifs === null || (_adminNotifs.length === 0 && filtered.length === 0)
            ? `<div class="an-empty"><div class="an-empty-icon">🔔</div><p>Loading notifications…</p></div>`
            : filtered.length
              ? filtered.map((n,i) => adminNotifRow(n,i)).join("")
              : `<div class="an-empty"><div class="an-empty-icon">🔔</div><p>No notifications yet.</p></div>`}
        </div>
      </div>
    </div>
  `;
}

/* ── Reset cache on navigation (forces re-fetch when user returns to this page) ── */
export function resetAdminNotificationsCache() {
  _adminNotifs = null;
}
