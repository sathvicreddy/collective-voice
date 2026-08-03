/* Users Page — connected to real backend */
import { IC } from '../icons.js';
import { adminGet, adminDelete, adminPatch, adminPost } from '../api.js';
import { state } from '../state.js';
import { roleBadge, authMethod, colorForInit, textColorForInit } from '../utils.js';

let _users = null;
let _searchQ = '';
let _roleFilter = 'All';
let _confirmDeleteId = null;

export function resetUsersCache() {
  _users = null;
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
    </div>
    <div class="udp-footer">
      ${user.role !== 'superadmin' ? `
        <button class="udp-btn role" onclick="openChangeRole('${user.id}', '${user.role}')">Change Role ${IC.chevronDown}</button>
      ` : ''}
      ${authType === 'password' ? `<button class="udp-btn reset" onclick="sendResetEmail('${user.email}')">Reset Password</button>` : ''}
      ${user.role !== 'superadmin' ? `<button class="udp-btn danger" onclick="promptUserDelete('${user.id}')">${IC.trash} Delete Account</button>` : ''}
    </div>`;
}

/* ── Actions ── */
window.selectUser = function(id) {
  state.selectedUserId = id;
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
