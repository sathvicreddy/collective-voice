/* Admin Panel Shell — Sidebar & Topbar */
import { IC } from './icons.js';
import { state } from './state.js';

const BASE_NAV = [
  { id:'overview',   label:'Overview',          icon:IC.home     },
  { id:'live-now',   label:'Live Now',           icon:IC.radio    },
  { id:'users',      label:'Users',              icon:IC.users    },
  { id:'meetings',   label:'Meetings',           icon:IC.calendar },
  { id:'moderation', label:'Content Moderation', icon:IC.shield   },
  { id:'nlp',        label:'NLP Engine',         icon:IC.cpu      },
  { id:'health',     label:'System Health',      icon:IC.monitor  },
  { id:'audit',      label:'Audit Log',          icon:IC.fileText },
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
        <button class="topbar-notif-btn" title="Notifications">${IC.bell}<span class="notif-badge">5</span></button>
        <div class="topbar-user">
          <div class="topbar-avatar">${initials}</div>
          <div class="topbar-user-info"><div class="topbar-user-name">${_userName()}</div><div class="topbar-user-role">${_userRole()}</div></div>
        </div>
        <button class="topbar-exit-btn" onclick="window.location.href='/'">Exit to regular app ${IC.logOut}</button>
      </div>
    </header>`;
}
