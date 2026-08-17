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
      <div class="sidebar-user" onclick="toggleSidebarUserMenu()" style="cursor:pointer;position:relative">
        <div class="user-avatar">${initials}</div>
        <div class="user-info"><div class="user-name">${_userName()}</div><div class="user-role">${_userRole()}</div></div>
        <span class="user-chevron" id="sidebar-user-chevron">▲</span>
      </div>
    </aside>`;
}

/* ── Sidebar user dropdown ── */
window.toggleSidebarUserMenu = function() {
  const existing = document.getElementById('sidebar-user-dropdown');
  if (existing) { existing.remove(); return; }
  const sidebar = document.querySelector('.admin-sidebar');
  const userEl  = document.querySelector('.sidebar-user');
  if (!sidebar || !userEl) return;
  const menu = document.createElement('div');
  menu.id = 'sidebar-user-dropdown';
  menu.style.cssText = [
    'position:absolute', 'bottom:80px', 'left:16px', 'right:16px', 'z-index:500',
    'background:var(--bg-primary,#fff)', 'border:1.5px solid var(--border-color,#e8eaf0)',
    'border-radius:12px', 'box-shadow:0 8px 24px rgba(0,0,0,.14)', 'overflow:hidden',
  ].join(';');
  menu.innerHTML = `
    <div style="padding:14px 16px 10px;border-bottom:1px solid var(--border-color,#e8eaf0)">
      <div style="font-weight:700;font-size:13px;color:var(--text-primary)">${_userName()}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">${_userRole()}</div>
    </div>
    <div style="padding:6px">
      <div onclick="adminNavigate('manage-admins');document.getElementById('sidebar-user-dropdown')?.remove()"
           style="padding:9px 12px;border-radius:8px;cursor:pointer;font-size:13px;color:var(--text-primary);display:flex;align-items:center;gap:9px;transition:background .12s"
           onmouseover="this.style.background='var(--bg-secondary,#f5f7fe)'" onmouseout="this.style.background=''">👤 My Profile</div>
      <div onclick="localStorage.removeItem('cv_token');window.location.href='/'"
           style="padding:9px 12px;border-radius:8px;cursor:pointer;font-size:13px;color:#e54040;display:flex;align-items:center;gap:9px;transition:background .12s"
           onmouseover="this.style.background='#ffeaea'" onmouseout="this.style.background=''">🚪 Sign Out</div>
    </div>
  `;
  sidebar.style.position = 'relative';
  sidebar.appendChild(menu);
  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', function _close(e) {
      if (!e.target.closest('#sidebar-user-dropdown') && !e.target.closest('.sidebar-user')) {
        document.getElementById('sidebar-user-dropdown')?.remove();
        document.removeEventListener('click', _close);
      }
    });
  }, 10);
};

export function renderTopbar() {
  const initials = _userInitials();
  return `
    <header class="admin-topbar">
      <!-- Hamburger — visible only on mobile -->
      <button class="admin-hamburger" id="admin-hamburger" onclick="toggleAdminSidebar()" title="Menu" aria-label="Open navigation">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="3" y1="6"  x2="21" y2="6"/>
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>
      <div class="topbar-search">
        ${IC.search}
        <input type="text" placeholder="Search… (Ctrl+K)" id="admin-search">
        <span class="search-kbd">⌘ K</span>
      </div>
      <!-- Search icon for ≤480px, replaces the full search bar -->
      <button class="admin-search-toggle" title="Search" onclick="document.getElementById('admin-search')?.focus()" aria-label="Search">
        ${IC.search}
      </button>
      <div class="topbar-actions">
        <div style="position:relative">
          <button class="topbar-notif-btn" id="admin-notif-bell" title="Notifications"
            onclick="toggleAdminNotifDropdown(this)">
            ${IC.bell}<span class="notif-badge" id="admin-notif-badge"></span>
          </button>
        </div>
        <div class="topbar-user">
          <div class="topbar-avatar">${initials}</div>
          <div class="topbar-user-info"><div class="topbar-user-name">${_userName()}</div><div class="topbar-user-role">${_userRole()}</div></div>
        </div>
        <button class="topbar-exit-btn" onclick="window.location.href='/'" title="Exit to app">Exit to regular app ${IC.logOut}</button>
      </div>
    </header>`;
}

/* ── Mobile sidebar open / close ── */
window.toggleAdminSidebar = function() {
  const sidebar  = document.querySelector('.admin-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!sidebar) return;
  const isOpen = sidebar.classList.contains('open');
  if (isOpen) {
    sidebar.classList.remove('open');
    backdrop?.classList.remove('active');
  } else {
    sidebar.classList.add('open');
    backdrop?.classList.add('active');
  }
};

window.closeAdminSidebar = function() {
  document.querySelector('.admin-sidebar')?.classList.remove('open');
  document.getElementById('sidebar-backdrop')?.classList.remove('active');
};

/* Inject the backdrop element once */
(function injectBackdrop() {
  if (document.getElementById('sidebar-backdrop')) return;
  const bd = document.createElement('div');
  bd.id = 'sidebar-backdrop';
  bd.className = 'sidebar-backdrop';
  bd.addEventListener('click', window.closeAdminSidebar);
  document.body.appendChild(bd);
})();

/* Close sidebar when a nav-item is clicked on mobile */
document.addEventListener('click', e => {
  const navItem = e.target.closest('.nav-item');
  if (navItem && window.innerWidth <= 768) {
    setTimeout(window.closeAdminSidebar, 60); // brief delay so navigate fires first
  }
});

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
