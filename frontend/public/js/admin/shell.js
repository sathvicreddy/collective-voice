/* Admin Panel Shell — Sidebar & Topbar */
import { IC } from './icons.js';
import { state } from './state.js';

const BASE_NAV = [
  { id:'overview',       label:'Overview',          icon:IC.home      },
  { id:'live-now',       label:'Live Now',           icon:IC.radio     },
  { id:'users',          label:'Users',              icon:IC.users     },
  { id:'meetings',       label:'Meetings',           icon:IC.calendar  },
  { id:'moderation',     label:'Content Moderation', icon:IC.shield    },
  { id:'nlp',            label:'NLP Engine',         icon:IC.cpu       },
  { id:'health',         label:'System Health',      icon:IC.monitor   },
  { id:'audit',          label:'Audit Log',          icon:IC.fileText  },
  { id:'notifications',  label:'Notifications',      icon:IC.bell      },
  { id:'messages',       label:'Messages',           icon:IC.mail || IC.bell },
];

export function getNavItems() {
  const items = [...BASE_NAV];
  // Only superadmins can manage admin roles
  if (state.isSuperadmin) {
    items.push({ id:'manage-admins', label:'Manage Admins', icon:IC.userPlus || IC.users });
  }
  return items;
}

// Keep backward-compat export
export const NAV_ITEMS = BASE_NAV;

function _userInitials() {
  const name = state.currentUser?.name || 'AD';
  return name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
}

function _userName() {
  return state.currentUser?.name || 'Admin';
}

function _userRole() {
  return state.isSuperadmin ? 'Superadmin' : 'Admin';
}

export function renderSidebar() {
  const initials = _userInitials();
  const navItems = getNavItems();
  const navHtml = navItems.map(item => `
    <div class="nav-item ${item.id===state.currentPage?'active':''}" data-page="${item.id}" onclick="adminNavigate('${item.id}')">
      ${item.icon}<span>${item.label}</span>
    </div>`).join('');
  return `
    <aside class="admin-sidebar">
      <div class="sidebar-brand">
        <div class="sidebar-brand-icon">${IC.mic}</div>
        <div class="sidebar-brand-text">
          <div class="sidebar-brand-name">CollectiveVoice</div>
          <div class="sidebar-brand-sub">Admin Panel</div>
        </div>
      </div>
      <nav class="sidebar-nav">${navHtml}</nav>
      <div class="sidebar-status">
        <div class="status-badge-row"><div class="status-dot"></div><div class="status-label">System Status</div></div>
        <div class="status-sub">All Systems Operational</div>
        <div class="status-link" onclick="adminNavigate('health')">View System Health ${IC.arrowRight}</div>
      </div>
      <div class="sidebar-user">
        <div class="user-avatar">${initials}</div>
        <div class="user-info"><div class="user-name">${_userName()}</div><div class="user-role">${_userRole()}</div></div>
        <span class="user-chevron">▲</span>
      </div>
    </aside>`;
}

export function renderTopbar() {
  const initials = _userInitials();
  return `
    <header class="admin-topbar">
      <div class="topbar-search">
        ${IC.search}
        <input type="text" placeholder="Search users, meetings, questions…" id="admin-search">
        <span class="search-kbd">⌘ K</span>
      </div>
      <div class="topbar-actions">
        <div style="position:relative">
          <button class="topbar-notif-btn" id="admin-notif-bell" title="Notifications"
            onclick="toggleAdminNotifDropdown(this)">
            ${IC.bell}<span class="notif-badge" id="admin-notif-badge">4</span>
          </button>
        </div>
        <div class="topbar-user">
          <div class="topbar-avatar">${initials}</div>
          <div class="topbar-user-info"><div class="topbar-user-name">${_userName()}</div><div class="topbar-user-role">${_userRole()}</div></div>
        </div>
        <button class="topbar-exit-btn" onclick="window.location.href='/'">Exit to regular app ${IC.logOut}</button>
      </div>
    </header>`;
}

/* ── Notification dropdown — fetches real data from /api/admin/notifications ── */

const TYPE_ICON_MAP = { security:IC.shield, user:IC.users, content:IC.flag, meeting:IC.calendar, system:IC.monitor };
const TYPE_BG_MAP   = { security:"#fff7ed", user:"#ffeaea",  content:"#f5f3ff", meeting:"#edf9f3", system:"#f0ecff" };
const TYPE_COLOR_MAP= { security:"#d97706", user:"#e54040",  content:"#7c3aed", meeting:"#059669", system:"#5b34ff" };

function _relTimeSh(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000)    return "Just now";
  if (diff < 3600000)  return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month:"short", day:"numeric" });
}

async function _fetchAdminNotifPreview() {
  try {
    const token = state.currentUser ? (localStorage.getItem("cv_token") || "") : "";
    const res = await fetch("/api/admin/notifications", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const data = await res.json();
    return Array.isArray(data.notifications) ? data.notifications.slice(0, 5) : [];
  } catch { return []; }
}

window.toggleAdminNotifDropdown = async function(btn) {
  const existing = document.getElementById("admin-notif-dropdown");
  if (existing) { existing.remove(); document.getElementById("admin-dd-overlay")?.remove(); return; }

  const overlay = document.createElement("div");
  overlay.id = "admin-dd-overlay";
  overlay.className = "an-dropdown-overlay";
  overlay.onclick = () => { dropdown.remove(); overlay.remove(); };
  document.body.appendChild(overlay);

  const dropdown = document.createElement("div");
  dropdown.id = "admin-notif-dropdown";
  dropdown.className = "an-dropdown";
  dropdown.style.cssText = "position:fixed;top:60px;right:20px;";
  dropdown.innerHTML = `
    <div class="an-dd-header">
      <span class="an-dd-title">Notifications</span>
      <div class="an-dd-actions">
        <button class="an-dd-link" onclick="window.adminNavigate('notifications');document.getElementById('admin-notif-dropdown')?.remove();document.getElementById('admin-dd-overlay')?.remove()">View all</button>
      </div>
    </div>
    <div class="an-dd-list" id="an-dd-list-inner"><div style="padding:16px;text-align:center;color:#8890b0;font-size:13px">Loading…</div></div>
    <div class="an-dd-footer">
      <button class="an-dd-footer-btn" onclick="window.adminNavigate('notifications');document.getElementById('admin-notif-dropdown')?.remove();document.getElementById('admin-dd-overlay')?.remove()">View all notifications →</button>
    </div>
  `;
  document.body.appendChild(dropdown);

  // Fetch in background after dropdown is visible
  const notifs = await _fetchAdminNotifPreview();
  const inner  = document.getElementById("an-dd-list-inner");
  if (!inner) return;

  if (notifs.length === 0) {
    inner.innerHTML = `<div style="padding:16px;text-align:center;color:#8890b0;font-size:13px">No notifications yet.</div>`;
  } else {
    inner.innerHTML = notifs.map(n => `
      <div class="an-dd-item ${!n.read?'an-dd-unread':''}">
        <div class="an-dd-icon" style="background:${TYPE_BG_MAP[n.type]||"#f0ecff"};color:${TYPE_COLOR_MAP[n.type]||"#5b34ff"}">${TYPE_ICON_MAP[n.type]||IC.bell}</div>
        <div class="an-dd-body">
          <div class="an-dd-item-title">${n.title}</div>
          <div class="an-dd-item-desc">${n.body}</div>
          <div class="an-dd-item-time">${_relTimeSh(n.createdAt)}</div>
        </div>
      </div>
    `).join("");
  }

  // Update badge with live unread count
  const unread = notifs.filter(n => !n.read).length;
  const badge  = document.getElementById("admin-notif-badge");
  if (badge) badge.textContent = unread > 0 ? String(unread) : "";
};
