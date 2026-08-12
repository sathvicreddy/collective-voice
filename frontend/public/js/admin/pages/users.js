/* Users Page — connected to real backend */
import { IC } from '../icons.js';
import { adminGet, adminDelete, adminPatch, adminPost } from '../api.js';
import { state } from '../state.js';
import { roleBadge, authMethod, colorForInit, textColorForInit } from '../utils.js';
import { openQuickMessageModal, closeQuickMessageModal } from '../components/quickMessageModal.js';

let _users = null;
let _searchQ = '';
let _roleFilter = 'All';
let _confirmDeleteId = null;
let _userNotifs = {};  // { [userId]: notification[] | null }

export function resetUsersCache() {
  _users = null;
  _userNotifs = {};
}

function initials(name) {
  if (!name) return '?';
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
}

function ago(date) {
  if (!date) return '—';
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export async function loadUsersData() {
  try {
    const data = await adminGet('/api/admin/users?view=customers');
    _users = data.users || [];
  } catch (err) {
    console.error('[Users] load error:', err.message);
    _users = [];
  }
}

async function loadUserNotifications(userId) {
  try {
    const data = await adminGet(`/api/admin/users/${userId}/notifications`);
    _userNotifs[userId] = Array.isArray(data.notifications) ? data.notifications : [];
  } catch {
    _userNotifs[userId] = [];
  }
  // Re-render if still on users page with this user selected
  const el = document.getElementById('admin-content-area');
  if (el && state.currentPage === 'users' && state.selectedUserId === userId) {
    el.innerHTML = renderUsers();
  }
}

function filteredUsers() {
  if (!_users) return [];
  return _users.filter(u => {
    const matchSearch = !_searchQ || u.name.toLowerCase().includes(_searchQ) || u.email.toLowerCase().includes(_searchQ);
    const matchRole   = _roleFilter === 'All' || u.role === _roleFilter.toLowerCase()
      || (_roleFilter === 'User' && (u.role === 'customer' || u.role === 'user'));
    return matchSearch && matchRole;
  });
}

export function renderUsers() {
  if (!_users) {
    loadUsersData().then(() => {
      const el = document.getElementById('admin-content-area');
      if (el && state.currentPage === 'users') el.innerHTML = renderUsers();
    });
    return `<div class="page active" id="page-users"><div class="page-loading">Loading users…</div></div>`;
  }

  const list = filteredUsers();
  const sel  = list.find(u => u.id === state.selectedUserId) || null;

  // Delete confirmation modal
  const deleteModal = _confirmDeleteId ? (() => {
    const u = _users.find(x => x.id === _confirmDeleteId);
    return `<div class="modal-overlay" onclick="cancelUserDelete()">
      <div class="modal" onclick="event.stopPropagation()">
        <div class="modal-icon">${IC.alertCircle}</div>
        <h3 class="modal-title">Delete '${u?.name}'?</h3>
        <p class="modal-body">This will permanently delete this user account and all associated data.</p>
        <div class="modal-actions">
          <button class="modal-cancel" onclick="cancelUserDelete()">Cancel</button>
          <button class="modal-delete" onclick="confirmUserDelete('${_confirmDeleteId}')">Delete Account</button>
        </div>
      </div>
    </div>`;
  })() : '';

  const tableHtml = list.map(u => {
    const init = initials(u.name);
    const authType = u.googleId ? 'google' : 'password';
    return `<tr class="dt-row ${u.id===state.selectedUserId?'dt-row-selected':''}" onclick="selectUser('${u.id}')">
      <td class="dt-td">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="tbl-avatar" style="background:${colorForInit(init)};color:${textColorForInit(init)}">${init}</div>
          <div><div class="dt-user-name">${u.name}</div><div class="dt-user-email">${u.email}</div></div>
        </div>
      </td>
      <td class="dt-td">${roleBadge(u.role)}</td>
      <td class="dt-td">${authMethod(authType)}</td>
      <td class="dt-td dt-muted">${new Date(u.createdAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</td>
      <td class="dt-td dt-actions"><div class="dt-actions-wrap"><button class="dt-more-btn" onclick="event.stopPropagation();openUserMenu('${u.id}')">${IC.moreHoriz}</button></div></td>
    </tr>`;
  }).join('');

  const detailHtml = sel ? renderUserDetailPanel(sel) : '';

  return `
    <div class="page active" id="page-users">
      ${deleteModal}
      <div class="page-header page-header-row">
        <div><h1 class="page-title">Users <span class="page-count">${_users.length} users</span></h1></div>
      </div>
      <div class="dt-filters">
        <div class="dt-search-wrap">${IC.search}<input class="dt-search-input" placeholder="Search by name or email…" type="text" value="${_searchQ}" oninput="usersSearch(this.value)"></div>
        <div class="filter-group">
          <label class="filter-label">Role</label>
          <div class="filter-select-wrap">
            <select class="filter-select" onchange="usersRoleFilter(this.value)">
              <option ${_roleFilter==='All'?'selected':''}>All</option>
              <option ${_roleFilter==='Superadmin'?'selected':''}>Superadmin</option>
              <option ${_roleFilter==='Admin'?'selected':''}>Admin</option>
              <option ${_roleFilter==='User'?'selected':''}>User</option>
            </select>${IC.chevronDown}
          </div>
        </div>
        <button class="clear-filters-btn" onclick="usersClearFilters()">Clear filters</button>
      </div>
      <div class="dt-layout">
        <div class="dt-table-wrap">
          <table class="dt-table">
            <thead><tr>
              <th class="dt-th">USER</th><th class="dt-th">ROLE</th><th class="dt-th">AUTH METHOD</th>
              <th class="dt-th">JOINED DATE</th><th class="dt-th"></th>
            </tr></thead>
            <tbody>${tableHtml || '<tr><td colspan="5" class="dt-td" style="text-align:center;color:var(--muted)">No users found</td></tr>'}</tbody>
          </table>
          <div class="dt-footer"><div class="dt-showing">Showing ${list.length} of ${_users.length} users</div></div>
        </div>
        ${sel ? `<div class="detail-panel user-detail-panel" id="user-detail-panel">${detailHtml}</div>` : ''}
    </div>
  </div>`;
}

function renderUserDetailPanel(user) {
  const init = initials(user.name);
  const authType = user.googleId ? 'google' : 'password';

  // Notification type config
  const NOTIF_COLORS = {
    "Admin Message": { color:"#2563eb", bg:"#eff6ff", icon:"✉️" },
    "Meeting Updates": { color:"#5b34ff", bg:"#f0ecff", icon:"📅" },
    "Meetings":        { color:"#5b34ff", bg:"#f0ecff", icon:"📅" },
    "Questions":       { color:"#059669", bg:"#edf9f3", icon:"💬" },
    "Question":        { color:"#059669", bg:"#edf9f3", icon:"💬" },
    "System":          { color:"#d97706", bg:"#fff7ed", icon:"⚙️" },
  };
  const defaultNC = { color:"#8890b0", bg:"#f4f5fa", icon:"🔔" };

  function fmtDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const date = d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    const time = d.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12:true });
    return `${date} · ${time}`;
  }

  const notifs = _userNotifs[user.id];
  let notifsHtml;
  if (notifs === null || notifs === undefined) {
    notifsHtml = `<div class="udp-notif-loading">Loading notifications…</div>`;
  } else if (notifs.length === 0) {
    notifsHtml = `
      <div class="udp-notif-empty">
        <span style="font-size:26px">🔔</span>
        <p>No notifications yet</p>
      </div>`;
  } else {
    notifsHtml = notifs.map((n, i) => {
      const nc   = NOTIF_COLORS[n.type] || defaultNC;
      const dt   = fmtDateTime(n.createdAt);
      const body = (n.body || '').length > 100 ? n.body.slice(0, 100) + '…' : n.body;
      return `
        <div class="udp-notif-row" style="animation:slideInLeft .22s ${.02+i*.04}s both">
          <div class="udp-notif-icon" style="background:${nc.bg};color:${nc.color}">${nc.icon}</div>
          <div class="udp-notif-body">
            <div class="udp-notif-title">${n.title || 'Notification'}</div>
            ${body ? `<div class="udp-notif-text">${body}</div>` : ''}
            <div class="udp-notif-meta">
              <span class="udp-notif-type" style="color:${nc.color};background:${nc.bg}">${n.type || 'System'}</span>
              <span class="udp-notif-time">${dt}</span>
              ${!n.read ? `<span class="udp-notif-unread-dot"></span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  const notifCount = Array.isArray(notifs) ? notifs.length : 0;
  const unreadCount = Array.isArray(notifs) ? notifs.filter(n => !n.read).length : 0;

  return `
    <div class="dp-header">
      <div class="dp-title-row">
        <div></div>
        <button class="dp-close-btn" onclick="closeUserPanel()">${IC.x}</button>
      </div>
      <div class="udp-profile">
        <div class="udp-avatar" style="background:${colorForInit(init)};color:${textColorForInit(init)}">${init}</div>
        <div>
          <div class="udp-name-row"><span class="udp-name">${user.name}</span>${roleBadge(user.role)}</div>
          <div class="udp-email">${user.email}</div>
          <div class="udp-meta">${authMethod(authType)} · Joined ${new Date(user.createdAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</div>
        </div>
      </div>
    </div>
    <div class="dp-section-scroll">
      <div class="udp-section">
        <div class="udp-section-header"><span>Account Details</span></div>
        <div class="udp-meeting-row"><span class="udp-meeting-title">User ID</span><span style="font-size:11px;color:var(--muted);font-family:monospace">${user.id}</span></div>
        <div class="udp-meeting-row"><span class="udp-meeting-title">Email</span><span style="font-size:12px">${user.email}</span></div>
        <div class="udp-meeting-row"><span class="udp-meeting-title">Role</span>${roleBadge(user.role)}</div>
      </div>

      <!-- Notifications feed -->
      <div class="udp-section">
        <div class="udp-section-header" style="display:flex;align-items:center;justify-content:space-between">
          <span>Recent Notifications</span>
          <div style="display:flex;align-items:center;gap:6px">
            ${unreadCount > 0 ? `<span class="udp-unread-badge">${unreadCount} unread</span>` : ''}
            ${notifCount > 0 ? `<span style="font-size:11px;color:var(--muted)">${notifCount} total</span>` : ''}
          </div>
        </div>
        <div class="udp-notif-feed">${notifsHtml}</div>
      </div>
    </div>
    <div class="udp-footer">
      ${user.role !== 'superadmin' ? `
        <button class="udp-btn role" onclick="openChangeRole('${user.id}', '${user.role}')">Change Role ${IC.chevronDown}</button>
      ` : ''}
      ${authType === 'password' ? `<button class="udp-btn reset" onclick="sendResetEmail('${user.email}')">Reset Password</button>` : ''}
      <button class="udp-btn message" onclick="openMessageUser('${user.id}','${user.name.replace(/'/g, "\\'")}')">${ IC.mail} Message</button>
      ${user.role !== 'superadmin' ? `<button class="udp-btn danger" onclick="promptUserDelete('${user.id}')">${IC.trash} Delete Account</button>` : ''}
    </div>

    <style>
      .udp-notif-feed     { display:flex;flex-direction:column;gap:2px;padding:4px 0 }
      .udp-notif-row      { display:flex;align-items:flex-start;gap:10px;padding:9px 0;border-bottom:1px solid var(--border-color,#e8eaf0) }
      .udp-notif-row:last-child { border-bottom:none }
      .udp-notif-icon     { width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0 }
      .udp-notif-body     { flex:1;min-width:0;display:flex;flex-direction:column;gap:2px }
      .udp-notif-title    { font-size:12.5px;font-weight:600;color:var(--text-primary);line-height:1.3 }
      .udp-notif-text     { font-size:11.5px;color:var(--text-secondary);line-height:1.4 }
      .udp-notif-meta     { display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:3px }
      .udp-notif-type     { font-size:10px;font-weight:700;padding:1px 7px;border-radius:10px;letter-spacing:.02em }
      .udp-notif-time     { font-size:10.5px;color:var(--muted,#8890b0) }
      .udp-notif-unread-dot { width:7px;height:7px;border-radius:50%;background:#5b34ff;flex-shrink:0 }
      .udp-notif-loading  { text-align:center;font-size:12px;color:var(--muted);padding:24px 0 }
      .udp-notif-empty    { display:flex;flex-direction:column;align-items:center;gap:6px;padding:24px 0;color:var(--muted);font-size:12px }
      .udp-unread-badge   { font-size:10px;font-weight:700;background:#5b34ff;color:#fff;border-radius:10px;padding:1px 8px }
    </style>`;
}

/* ── Actions ── */
window.selectUser = function(id) {
  state.selectedUserId = id;
  // Lazily load notifications the first time this user is selected
  if (!_userNotifs[id]) {
    _userNotifs[id] = null; // mark as loading
    loadUserNotifications(id);
  }
  const el = document.getElementById('admin-content-area');
  if (el) el.innerHTML = renderUsers();
};
window.closeUserPanel = function() {
  state.selectedUserId = null;
  const el = document.getElementById('admin-content-area');
  if (el) el.innerHTML = renderUsers();
};
window.usersSearch = function(q) {
  _searchQ = q.toLowerCase().trim();
  const el = document.getElementById('admin-content-area');
  if (el) el.innerHTML = renderUsers();
};
window.usersRoleFilter = function(r) {
  _roleFilter = r;
  const el = document.getElementById('admin-content-area');
  if (el) el.innerHTML = renderUsers();
};
window.usersClearFilters = function() {
  _searchQ = ''; _roleFilter = 'All';
  const el = document.getElementById('admin-content-area');
  if (el) el.innerHTML = renderUsers();
};

window.openChangeRole = function(id, currentRole) {
  const newRole = currentRole === 'admin' ? 'customer' : 'admin';
  const label   = currentRole === 'admin' ? 'Remove admin rights (→ customer)' : 'Promote to admin';
  if (!confirm(`${label}?`)) return;
  adminPatch(`/api/admin/users/${id}/role`, { role: newRole })
    .then(() => { _users = null; return loadUsersData(); })
    .then(() => { const el = document.getElementById('admin-content-area'); if (el) el.innerHTML = renderUsers(); })
    .catch(err => alert('Error: ' + err.message));
};

window.sendResetEmail = async function(email) {
  try {
    await adminPost('/api/auth/forgot-password', { email });
    alert('Password reset email sent!');
  } catch (err) {
    alert('Error: ' + err.message);
  }
};

window.promptUserDelete = function(id) {
  _confirmDeleteId = id;
  const el = document.getElementById('admin-content-area');
  if (el) el.innerHTML = renderUsers();
};
window.cancelUserDelete = function() {
  _confirmDeleteId = null;
  const el = document.getElementById('admin-content-area');
  if (el) el.innerHTML = renderUsers();
};
window.confirmUserDelete = async function(id) {
  try {
    await adminDelete(`/api/admin/users/${id}`);
    _users = null;
    state.selectedUserId = null;
    _confirmDeleteId = null;
    await loadUsersData();
    const el = document.getElementById('admin-content-area');
    if (el) el.innerHTML = renderUsers();
  } catch (err) {
    alert('Error: ' + err.message);
    _confirmDeleteId = null;
  }
};

/* ── Quick Message ── */
window.openMessageUser = function(userId, userName) {
  openQuickMessageModal({
    audienceLabel: `To: ${userName}`,
    onSend: async ({ subject, body }) => {
      await adminPost('/api/admin/messages', { audience: 'single', targetUserId: userId, subject, body });
      closeQuickMessageModal();
      if (window.adminToast) window.adminToast(`Message sent to ${userName}`);
    }
  });
};
