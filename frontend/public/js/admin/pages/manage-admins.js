/* ============================================================
   Administrator Management — Full UI
   ============================================================ */
import { IC } from '../icons.js';
import { state } from '../state.js';

/* ── Module state ─────────────────────────────────────────── */
let adminState = {
  users:           [],
  filtered:        [],
  selected:        null,   // selected user object
  activeTab:       'activity',
  activeLogFilter: 'all',
  search:          '',
  roleFilter:      'all',
  statusFilter:    'all',
  lastActiveFilter:'all',
  page:            1,
  perPage:         10,
  loading:         true,
  error:           '',
  activeDropdown:  null,
  logSearch:       '',
};

// Guard to prevent loadUsers() from being called while already in flight
let _loadStarted = false;

/* ── Avatar colours ──────────────────────────────────────── */
const AVATAR_COLORS = ['#5b34ff','#24b86f','#e54040','#ff8a2a','#0093d5','#7c3aed','#059669','#dc2626','#d97706','#2563eb'];
function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h << 5) - h + name.charCodeAt(i);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

/* ── Helpers ─────────────────────────────────────────────── */
function relTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) {
    const h = d.getHours();
    return `Today, ${String(h).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
  }
  if (diff < 172800000) return 'Yesterday';
  const days = Math.floor(diff / 86400000);
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
}

function toast(msg, type = 'success') {
  if (window.adminToast) { window.adminToast(msg, type); return; }
  const el = document.createElement('div');
  el.className = `ma-toast ${type}`;
  el.innerHTML = `${type === 'success' ? IC.check : IC.alertCircle} ${msg}`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

/* ── Filter + paginate ───────────────────────────────────── */
function applyFilters() {
  let list = [...adminState.users];
  const q = adminState.search.toLowerCase();
  if (q) list = list.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  if (adminState.roleFilter !== 'all') list = list.filter(u => u.role === adminState.roleFilter);
  if (adminState.statusFilter !== 'all') list = list.filter(u => (u.status || 'active') === adminState.statusFilter);
  adminState.filtered = list;
  adminState.page = 1;
}

function pageItems() {
  const start = (adminState.page - 1) * adminState.perPage;
  return adminState.filtered.slice(start, start + adminState.perPage);
}

function totalPages() { return Math.max(1, Math.ceil(adminState.filtered.length / adminState.perPage)); }

/* ── Load data ───────────────────────────────────────────── */
export async function loadUsers() {
  // Guard: prevent concurrent fetches that cause infinite re-render loop
  if (_loadStarted) return;
  _loadStarted = true;

  adminState.loading = true;
  adminState.error = '';
  // NOTE: do NOT call rerender() here — that would trigger renderManageAdmins()
  //       which calls loadUsers() again → infinite loop.

  const token = localStorage.getItem('cv_token');
  if (!token) {
    adminState.error = 'Not authenticated — please log in again.';
    adminState.loading = false;
    _loadStarted = false;
    rerender();
    return;
  }

  try {
    const res = await fetch('/api/admin/users', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.status === 401) throw new Error('Session expired — please log in again.');
    if (res.status === 403) throw new Error('Admin access required.');
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Server error (${res.status})`);
    }
    const data = await res.json();

    // Backend now only returns admin/superadmin users — map to display shape
    const depts = ['System','Operations','Content','Moderation','Analytics','Support'];
    adminState.users = (data.users || []).map((u, i) => ({
      ...u,
      department: depts[i % depts.length],
      status: 'active',
      lastLogin: u.createdAt,
      dateAdded: u.createdAt,
      managedMeetings: u.role === 'superadmin' ? 23 : Math.floor(Math.random() * 20),
      actionsPerformed: u.role === 'superadmin' ? 1248 : Math.floor(Math.random() * 300),
    }));
    applyFilters();
    adminState.loading = false;
  } catch (err) {
    adminState.error = err.message;
    adminState.loading = false;
  }
  _loadStarted = false;
  rerender();
}
// Expose as global so inline onclick="loadUsers()" works
window.loadUsers = loadUsers;

/* ── Cache reset (called by router on navigation) ──────────────── */
export function resetManageAdminsCache() {
  adminState.users   = [];
  adminState.loading = true;
  adminState.error   = '';
  adminState.selected = null;
  adminState.page    = 1;
  _loadStarted = false;
}

/* ── Re-render helper ────────────────────────────────────── */
function rerender() {
  const el = document.getElementById('admin-content-area');
  if (el && state.currentPage === 'manage-admins') el.innerHTML = renderManageAdmins();
}

/* ── API: change role ────────────────────────────────────── */
window.maChangeRole = async function(userId, newRole) {
  const token = localStorage.getItem('cv_token');
  try {
    const res = await fetch(`/api/admin/users/${userId}/role`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole })
    });
    if (!res.ok) {
      const d = await res.json();
      throw new Error(d.error || 'Failed to update role');
    }
    const u = adminState.users.find(x => x.id === userId);
    if (u) { u.role = newRole; if (adminState.selected?.id === userId) adminState.selected.role = newRole; }
    applyFilters();
    rerender();
    toast(`Role updated to ${newRole}`);
  } catch (err) { toast(err.message, 'error'); }
};

/* ── API: invite admin ───────────────────────────────────── */
window.maSubmitInvite = async function() {
  const name  = document.getElementById('ma-invite-name')?.value?.trim();
  const email = document.getElementById('ma-invite-email')?.value?.trim();
  const role  = document.getElementById('ma-invite-role')?.value;
  const dept  = document.getElementById('ma-invite-dept')?.value?.trim();

  if (!name || !email) { toast('Name and email are required', 'error'); return; }

  const btn = document.getElementById('ma-invite-submit');
  if (btn) { btn.disabled = true; btn.textContent = 'Inviting…'; }

  // Simulate invite (could call /api/admin/invite in production)
  await new Promise(r => setTimeout(r, 800));

  // Add locally
  adminState.users.unshift({
    id: 'local-' + Date.now(),
    name, email, role: role || 'admin',
    department: dept || 'System',
    status: 'active',
    createdAt: new Date().toISOString(),
    lastLogin: null,
    dateAdded: new Date().toISOString(),
    managedMeetings: 0,
    actionsPerformed: 0,
  });
  applyFilters();
  document.getElementById('ma-modal-overlay')?.remove();
  rerender();
  toast(`${name} invited as ${role || 'Admin'}`);
};

/* ── Select user ─────────────────────────────────────────── */
window.maSelectUser = function(userId) {
  const u = adminState.users.find(x => x.id === userId);
  adminState.selected = u || null;
  adminState.activeTab = 'activity';
  adminState.activeLogFilter = 'all';
  adminState.activeDropdown = null;
  rerender();
};

window.maCloseDetail = function() {
  adminState.selected = null;
  adminState.activeDropdown = null;
  rerender();
};

/* ── Tabs ────────────────────────────────────────────────── */
window.maSetTab = function(tab) {
  adminState.activeTab = tab;
  adminState.activeDropdown = null;
  rerender();
};

window.maSetLogFilter = function(f) {
  adminState.activeLogFilter = f;
  rerender();
};

/* ── Filters & search ────────────────────────────────────── */
window.maSearch = function(val) {
  adminState.search = val;
  applyFilters();
  rerender();
};
window.maRoleFilter = function(val) {
  adminState.roleFilter = val;
  applyFilters();
  rerender();
};
window.maStatusFilter = function(val) {
  adminState.statusFilter = val;
  applyFilters();
  rerender();
};
window.maLastActiveFilter = function(val) {
  adminState.lastActiveFilter = val;
  applyFilters();
  rerender();
};

/* ── Pagination ──────────────────────────────────────────── */
window.maGoPage = function(p) {
  const tp = totalPages();
  if (p < 1 || p > tp) return;
  adminState.page = p;
  rerender();
};
window.maPerPage = function(v) {
  adminState.perPage = Number(v);
  adminState.page = 1;
  rerender();
};

/* ── Dropdown ────────────────────────────────────────────── */
window.maToggleDropdown = function(userId, ev) {
  ev.stopPropagation();
  adminState.activeDropdown = adminState.activeDropdown === userId ? null : userId;
  rerender();
};
document.addEventListener('click', () => {
  if (adminState.activeDropdown) { adminState.activeDropdown = null; rerender(); }
});

/* ── Modal ───────────────────────────────────────────────── */
window.maOpenAddModal = function() {
  const overlay = document.createElement('div');
  overlay.id = 'ma-modal-overlay';
  overlay.className = 'ma-modal-overlay';
  overlay.innerHTML = `
    <div class="ma-modal" onclick="event.stopPropagation()">
      <div class="ma-modal-header">
        <div class="ma-modal-title">Invite New Administrator</div>
        <div class="ma-modal-close" onclick="document.getElementById('ma-modal-overlay').remove()">${IC.x}</div>
      </div>
      <div class="ma-form-group">
        <label class="ma-form-label">Full Name</label>
        <input id="ma-invite-name" class="ma-form-input" placeholder="e.g. John Smith" />
      </div>
      <div class="ma-form-group">
        <label class="ma-form-label">Email Address</label>
        <input id="ma-invite-email" class="ma-form-input" type="email" placeholder="john@example.com" />
      </div>
      <div class="ma-form-group">
        <label class="ma-form-label">Role</label>
        <select id="ma-invite-role" class="ma-form-select">
          <option value="admin">Admin</option>
        </select>
      </div>
      <div class="ma-form-group">
        <label class="ma-form-label">Department</label>
        <select id="ma-invite-dept" class="ma-form-select">
          <option>System</option><option>Operations</option><option>Content</option>
          <option>Moderation</option><option>Analytics</option><option>Support</option>
        </select>
      </div>
      <div class="ma-modal-footer">
        <button class="ma-btn-cancel" onclick="document.getElementById('ma-modal-overlay').remove()">Cancel</button>
        <button id="ma-invite-submit" class="ma-btn-submit" onclick="maSubmitInvite()">Send Invitation</button>
      </div>
    </div>`;
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
};

/* ── Mock log data ───────────────────────────────────────── */
function getMockLogs(user) {
  if (!user) return [];
  return [
    { time: 'Today, 10:42 AM', title: 'Deleted Meeting', desc: 'AI in Education Summit (ID: CV-48291)', tag: 'meeting' },
    { time: 'Today, 09:58 AM', title: 'Suspended User', desc: 'Rahul Sharma (rahul.sharma@email.com)', tag: 'user' },
    { time: 'Today, 09:40 AM', title: 'Changed NLP Threshold', desc: 'Similarity Threshold: 0.76 → 0.82', tag: 'system' },
    { time: 'Yesterday, 08:22 PM', title: 'Deleted Question', desc: 'Question ID: q_91a81cde (Spam / Offensive)', tag: 'moderation' },
    { time: 'Yesterday, 06:11 PM', title: 'Added New Admin', desc: 'Ananya Sharma (ananya.sharma@email.com)', tag: 'system' },
    { time: 'Yesterday, 05:02 PM', title: 'Created Announcement', desc: 'System Maintenance on 20th May 2024', tag: 'system' },
  ];
}

/* ── Stats ───────────────────────────────────────────────── */
function renderStats() {
  const total     = adminState.users.length;
  const superAdmins = adminState.users.filter(u => u.role === 'superadmin').length;
  const active    = adminState.users.filter(u => (u.status || 'active') === 'active').length;
  const pending   = 1; // mock
  return `
    <div class="ma-stats">
      <div class="ma-stat-card">
        <div class="ma-stat-icon blue">${IC.users}</div>
        <div class="ma-stat-body">
          <div class="ma-stat-label">Total Administrators</div>
          <div class="ma-stat-value">${total}</div>
          <div class="ma-stat-sub">All platform admins</div>
        </div>
      </div>
      <div class="ma-stat-card">
        <div class="ma-stat-icon red">${IC.shieldCheck}</div>
        <div class="ma-stat-body">
          <div class="ma-stat-label">Super Admins</div>
          <div class="ma-stat-value">${superAdmins}</div>
          <div class="ma-stat-sub">Full system access</div>
        </div>
      </div>
      <div class="ma-stat-card">
        <div class="ma-stat-icon green">${IC.userCheck}</div>
        <div class="ma-stat-body">
          <div class="ma-stat-label">Active Admins</div>
          <div class="ma-stat-value">${active}</div>
          <div class="ma-stat-sub">Currently active</div>
        </div>
      </div>
      <div class="ma-stat-card">
        <div class="ma-stat-icon orange">${IC.bell}</div>
        <div class="ma-stat-body">
          <div class="ma-stat-label">Pending Invitations</div>
          <div class="ma-stat-value">${pending}</div>
          <div class="ma-stat-sub">Awaiting acceptance</div>
        </div>
      </div>
    </div>`;
}

/* ── Table rows ──────────────────────────────────────────── */
function renderRow(u) {
  const isSelected = adminState.selected?.id === u.id;
  const color = avatarColor(u.name);
  const inits = initials(u.name);
  const statusClass = u.status === 'suspended' ? 'suspended' : u.status === 'inactive' ? 'inactive' : 'active';
  const roleClass = u.role === 'superadmin' ? 'superadmin' : u.role === 'admin' ? 'admin' : 'customer';
  const showDrop = adminState.activeDropdown === u.id;
  const isSelf = u.id === state.currentUser?.id;

  return `
    <tr class="${isSelected ? 'selected' : ''}" onclick="maSelectUser('${u.id}')">
      <td>
        <div class="ma-user-cell">
          <div class="ma-avatar" style="background:${color}">${inits}</div>
          <div>
            <div class="ma-user-name">${u.name}</div>
            <div class="ma-user-email">${u.email}</div>
          </div>
        </div>
      </td>
      <td><span class="ma-role-badge ${roleClass}">${u.role === 'superadmin' ? 'Super Admin' : u.role === 'admin' ? 'Admin' : 'Customer'}</span></td>
      <td style="color:var(--muted);font-size:13px">${u.department || '—'}</td>
      <td>
        <div class="ma-last-active">
          <div class="ma-active-dot" style="${u.status === 'suspended' ? 'background:var(--danger)' : u.status === 'inactive' ? 'background:var(--muted)' : ''}"></div>
          <span style="font-size:13px;color:var(--muted)">${relTime(u.lastLogin)}</span>
        </div>
      </td>
      <td><span class="ma-status-badge ${statusClass}">${u.status || 'active'}</span></td>
      <td>
        <div style="position:relative;display:inline-block">
          <button class="ma-actions-btn" onclick="maToggleDropdown('${u.id}', event)" title="Actions">${IC.moreHoriz}</button>
          ${showDrop ? `
            <div class="ma-dropdown" onclick="event.stopPropagation()">
              <div class="ma-dropdown-item" onclick="maSelectUser('${u.id}')">${IC.externalLink} View Profile</div>
              ${!isSelf && u.role !== 'superadmin' ? `
                ${u.role === 'admin' ? `<div class="ma-dropdown-item" onclick="maChangeRole('${u.id}','customer')">${IC.userMinus} Demote to Customer</div>` : `<div class="ma-dropdown-item" onclick="maChangeRole('${u.id}','admin')">${IC.userCheck} Promote to Admin</div>`}
              ` : ''}
              <div class="ma-dropdown-divider"></div>
              ${!isSelf && u.role !== 'superadmin' ? `<div class="ma-dropdown-item danger" onclick="maChangeRole('${u.id}','customer')">${IC.trash} Remove Admin</div>` : ''}
            </div>` : ''}
        </div>
      </td>
    </tr>`;
}

/* ── Pagination controls ─────────────────────────────────── */
function renderPagination() {
  const tp = totalPages();
  const p  = adminState.page;
  const start = (p - 1) * adminState.perPage + 1;
  const end   = Math.min(p * adminState.perPage, adminState.filtered.length);
  const total = adminState.filtered.length;

  let pageButtons = '';
  for (let i = 1; i <= tp; i++) {
    if (tp > 5 && i > 2 && i < tp - 1 && Math.abs(i - p) > 1) {
      if (i === 3) pageButtons += `<span style="padding:0 4px;color:var(--muted)">…</span>`;
      continue;
    }
    pageButtons += `<button class="ma-page-btn ${i === p ? 'active' : ''}" onclick="maGoPage(${i})">${i}</button>`;
  }

  return `
    <div class="ma-pagination">
      <div class="ma-page-info">Showing ${total === 0 ? 0 : start} to ${end} of ${total} administrators</div>
      <div style="display:flex;align-items:center;gap:12px">
        <div class="ma-page-btns">
          <button class="ma-page-btn" onclick="maGoPage(${p - 1})" ${p === 1 ? 'disabled' : ''}>${IC.chevronLeft}</button>
          ${pageButtons}
          <button class="ma-page-btn" onclick="maGoPage(${p + 1})" ${p === tp ? 'disabled' : ''}>${IC.chevronRight}</button>
        </div>
        <select class="ma-perpage-select" onchange="maPerPage(this.value)">
          ${[10,20,50].map(n => `<option value="${n}" ${adminState.perPage === n ? 'selected' : ''}>${n} per page</option>`).join('')}
        </select>
      </div>
    </div>`;
}

/* ── Right panel: detail ─────────────────────────────────── */
function renderDetail() {
  const u = adminState.selected;
  if (!u) return `
    <div class="ma-detail-card">
      <div class="ma-no-selection">
        ${IC.users}
        <div class="ma-no-selection-title">Select an administrator</div>
        <div class="ma-no-selection-sub">Click any row on the left to view their details, activity logs, and permissions.</div>
      </div>
    </div>`;

  const color = avatarColor(u.name);
  const inits = initials(u.name);
  const roleClass = u.role === 'superadmin' ? 'superadmin' : 'admin';
  const activeTab = adminState.activeTab;

  // Tab content
  let tabContent = '';
  if (activeTab === 'profile') {
    tabContent = `
      <div class="ma-profile-section">
        <div class="ma-profile-row"><span class="ma-profile-key">Full Name</span><span class="ma-profile-val">${u.name}</span></div>
        <div class="ma-profile-row"><span class="ma-profile-key">Email</span><span class="ma-profile-val">${u.email}</span></div>
        <div class="ma-profile-row"><span class="ma-profile-key">Role</span><span class="ma-profile-val">${u.role}</span></div>
        <div class="ma-profile-row"><span class="ma-profile-key">Department</span><span class="ma-profile-val">${u.department || '—'}</span></div>
        <div class="ma-profile-row"><span class="ma-profile-key">Status</span><span class="ma-profile-val">${u.status || 'active'}</span></div>
        <div class="ma-profile-row"><span class="ma-profile-key">Date Added</span><span class="ma-profile-val">${new Date(u.dateAdded || u.createdAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</span></div>
        <div class="ma-profile-row"><span class="ma-profile-key">Last Login</span><span class="ma-profile-val">${relTime(u.lastLogin)}</span></div>
      </div>`;
  } else if (activeTab === 'permissions') {
    const perms = [
      { label: 'Manage Users',    sub: 'Create, edit and delete users',      on: true  },
      { label: 'Manage Meetings', sub: 'Create and moderate meetings',        on: true  },
      { label: 'Content Moderation', sub: 'Review and remove flagged content', on: true },
      { label: 'NLP Settings',   sub: 'Adjust NLP engine thresholds',        on: u.role === 'superadmin' },
      { label: 'System Health',  sub: 'View server and infrastructure data',  on: true  },
      { label: 'Audit Logs',     sub: 'Access full activity history',        on: true  },
      { label: 'Invite Admins',  sub: 'Send admin invitations',              on: u.role === 'superadmin' },
    ];
    tabContent = `
      <div class="ma-perm-section">
        ${perms.map(p => `
          <div class="ma-perm-item">
            <div>
              <div class="ma-perm-label">${p.label}</div>
              <div class="ma-perm-sub">${p.sub}</div>
            </div>
            <div class="ma-toggle ${p.on ? 'on' : ''}" title="${p.on ? 'Enabled' : 'Disabled'}"></div>
          </div>`).join('')}
      </div>`;
  } else if (activeTab === 'activity') {
    const logs = getMockLogs(u);
    const chipFilters = ['all', 'user', 'meeting', 'moderation', 'system', 'auth'];
    const af = adminState.activeLogFilter;
    const filteredLogs = af === 'all' ? logs : logs.filter(l => l.tag === af);

    tabContent = `
      <div class="ma-log-filters">
        ${chipFilters.map(f => `
          <div class="ma-log-filter-chip ${af === f ? 'active' : ''}" onclick="maSetLogFilter('${f}')">
            ${f === 'all' ? 'All' : f === 'user' ? 'User Actions' : f === 'meeting' ? 'Meeting Actions' : f === 'moderation' ? 'Moderation' : f === 'system' ? 'System Changes' : 'Auth'}
          </div>`).join('')}
      </div>
      <div class="ma-log-search-row">
        <div class="ma-log-search-wrap">
          ${IC.search}
          <input class="ma-log-search" placeholder="Search activity logs…" value="${adminState.logSearch}" oninput="window._maLogSearch(this.value)">
        </div>
        <button class="ma-log-export-btn">${IC.fileText} Export</button>
      </div>
      ${filteredLogs.length === 0 ? `<div class="ma-empty"><div class="ma-empty-title">No logs found</div></div>` :
        filteredLogs.map(l => `
          <div class="ma-log-entry">
            <div class="ma-log-dot"></div>
            <div style="flex:1;min-width:0">
              <div class="ma-log-time">${l.time}</div>
              <div class="ma-log-title">${l.title}</div>
              <div class="ma-log-desc">${l.desc}</div>
            </div>
            <span class="ma-log-tag ${l.tag}">${l.tag === 'meeting' ? 'Meeting Action' : l.tag === 'user' ? 'User Action' : l.tag === 'system' ? 'System Change' : l.tag === 'moderation' ? 'Moderation' : 'Auth'}</span>
          </div>`).join('')}
      <div class="ma-log-view-all">View All Logs ${IC.arrowRight}</div>`;
  } else {
    // audit history
    tabContent = `
      <div class="ma-log-filters">
        <div class="ma-log-filter-chip active">All</div>
      </div>
      <div class="ma-empty" style="padding:32px">
        ${IC.fileText}
        <div class="ma-empty-title">No audit history yet</div>
        <div class="ma-empty-sub">Audit events will appear here as actions are performed.</div>
      </div>`;
  }

  const tabs = [
    { id: 'profile',  label: 'Profile' },
    { id: 'permissions', label: 'Permissions' },
    { id: 'activity', label: 'Activity Logs' },
    { id: 'audit',    label: 'Audit History' },
  ];

  const isSelf = u.id === state.currentUser?.id;

  return `
    <div class="ma-detail-card">
      <div class="ma-detail-header">
        <div class="ma-detail-avatar" style="background:${color}">${inits}</div>
        <div style="flex:1;min-width:0">
          <div class="ma-detail-name">${u.name}</div>
          <div class="ma-detail-email">${u.email}</div>
          <div class="ma-detail-badges">
            <span class="ma-detail-role-badge ${roleClass}">${u.role === 'superadmin' ? 'Super Admin' : 'Admin'}</span>
            <span class="ma-detail-active-badge">+ Active</span>
          </div>
        </div>
        <div class="ma-detail-close" onclick="maCloseDetail()">${IC.x}</div>
      </div>
      
      <div class="ma-detail-stats">
        <div class="ma-detail-stat">
          <div class="ma-detail-stat-icon">${IC.calendar} <span class="ma-detail-stat-label">Date Added</span></div>
          <div class="ma-detail-stat-value">${new Date(u.dateAdded || u.createdAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</div>
        </div>
        <div class="ma-detail-stat">
          <div class="ma-detail-stat-icon">${IC.clock} <span class="ma-detail-stat-label">Last Login</span></div>
          <div class="ma-detail-stat-value">${relTime(u.lastLogin)}</div>
        </div>
        <div class="ma-detail-stat">
          <div class="ma-detail-stat-icon">${IC.users} <span class="ma-detail-stat-label">Meetings</span></div>
          <div class="ma-detail-stat-value">${u.managedMeetings || 0}</div>
        </div>
        <div class="ma-detail-stat">
          <div class="ma-detail-stat-icon">${IC.zap} <span class="ma-detail-stat-label">Actions</span></div>
          <div class="ma-detail-stat-value">${(u.actionsPerformed || 0).toLocaleString()}</div>
        </div>
      </div>
      
      <div class="ma-detail-actions">
        ${u.role !== 'superadmin' ? `
          <button class="ma-detail-btn outline" onclick="maChangeRole('${u.id}','${u.role === 'admin' ? 'customer' : 'admin}')">${IC.arrowSwap} ${u.role === 'admin' ? 'Remove Admin' : 'Make Admin'}</button>
        ` : ''}
        <button class="ma-detail-btn outline" onclick="window.adminToast('Permissions are managed via role assignment.','info')">${IC.shieldCheck} Permissions</button>
        ${!isSelf ? `
          <button class="ma-detail-btn danger" onclick="if(confirm('Remove admin rights from ${u.name}?')){maChangeRole('${u.id}','customer')}">${IC.trash} Remove Admin</button>
        ` : ''}
      </div>

      <div class="ma-tabs">
        ${tabs.map(t => `<div class="ma-tab ${activeTab === t.id ? 'active' : ''}" onclick="maSetTab('${t.id}')">${t.label}</div>`).join('')}
      </div>

      <div class="ma-tab-content">
        ${tabContent}
      </div>
    </div>`;
}

/* ── Main render ─────────────────────────────────────────── */
export function renderManageAdmins() {
  if (!state.isSuperadmin) {
    return `
      <div class="ma-empty" style="padding:80px">
        ${IC.shieldCheck}
        <div class="ma-empty-title">Super Admin Access Required</div>
        <div class="ma-empty-sub">Only superadmins can manage administrators.</div>
      </div>`;
  }

  // First load — start fetch but only once, then show spinner
  if (adminState.loading && adminState.users.length === 0) {
    if (!_loadStarted) loadUsers();
    return `<div class="ma-loading"><div class="ma-spinner"></div> Loading administrators…</div>`;
  }

  if (adminState.error) {
    return `
      <div class="ma-empty" style="padding:60px">
        ${IC.alertCircle}
        <div class="ma-empty-title">Failed to load administrators</div>
        <div class="ma-empty-sub">${adminState.error}</div>
        <button class="ma-add-btn" style="margin-top:12px" onclick="loadUsers()">Try Again</button>
      </div>`;
  }

  const isMobile = window.innerWidth <= 768;

  /* Mobile card list */
  const maCardHtml = rows.map(u => {
    const color = avatarColor(u.name);
    const inits = initials(u.name);
    const roleClass = u.role === 'superadmin' ? 'superadmin' : u.role === 'admin' ? 'admin' : 'customer';
    const statusClass = u.status === 'suspended' ? 'suspended' : u.status === 'inactive' ? 'inactive' : 'active';
    const isSelected = adminState.selected?.id === u.id;
    return `
      <div class="mob-card ${isSelected ? 'mob-card-selected' : ''}" onclick="maSelectUser('${u.id}')">
        <div class="mob-card-avatar" style="background:${color}">${inits}</div>
        <div class="mob-card-body">
          <div class="mob-card-title">${u.name}</div>
          <div class="mob-card-sub">${u.email}</div>
          <div class="mob-card-tags">
            <span class="ma-role-badge ${roleClass}">${u.role === 'superadmin' ? 'Super Admin' : u.role === 'admin' ? 'Admin' : 'Customer'}</span>
            <span class="ma-status-badge ${statusClass}" style="font-size:10px;padding:2px 7px">${u.status || 'active'}</span>
          </div>
        </div>
        <button class="mob-card-more" onclick="maToggleDropdown('${u.id}',event)">${IC.moreHoriz}</button>
      </div>`;
  }).join('');

  const maDetailCloseBtn = `<button class="mob-panel-close" onclick="maCloseDetail()" aria-label="Back">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
    Back
  </button>`;

  return `
    <div class="ma-wrap${isMobile ? ' ma-wrap-mobile' : ''}">
      <!-- LEFT PANEL -->
      <div class="ma-left">
        <div class="ma-header">
          <div>
            <div class="ma-header-title">Administrator Management</div>
            <div class="ma-header-sub">Add, manage and control platform administrators and their permissions.</div>
          </div>
          <button class="ma-add-btn" onclick="maOpenAddModal()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add New Admin
          </button>
        </div>

        ${renderStats()}

        <!-- Filters -->
        <div class="ma-filters">
          <div class="ma-search-wrap">
            ${IC.search}
            <input class="ma-search" placeholder="Search admins…" value="${adminState.search}"
              oninput="maSearch(this.value)">
          </div>
          <select class="ma-select" onchange="maRoleFilter(this.value)">
            <option value="all" ${adminState.roleFilter==='all'?'selected':''}>All Roles</option>
            <option value="superadmin" ${adminState.roleFilter==='superadmin'?'selected':''}>Super Admin</option>
            <option value="admin" ${adminState.roleFilter==='admin'?'selected':''}>Admin</option>
            <option value="customer" ${adminState.roleFilter==='customer'?'selected':''}>Customer</option>
          </select>
          <select class="ma-select" onchange="maStatusFilter(this.value)">
            <option value="all" ${adminState.statusFilter==='all'?'selected':''}>All Status</option>
            <option value="active" ${adminState.statusFilter==='active'?'selected':''}>Active</option>
            <option value="suspended" ${adminState.statusFilter==='suspended'?'selected':''}>Suspended</option>
            <option value="inactive" ${adminState.statusFilter==='inactive'?'selected':''}>Inactive</option>
          </select>
          <select class="ma-select" onchange="maLastActiveFilter(this.value)">
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
          <button class="ma-filter-btn">${IC.filterIcon} Filters</button>
        </div>

        <!-- Table / Cards -->
        ${isMobile ? `
          <div class="mob-card-list">
            ${rows.length === 0
              ? '<div class="mob-empty">No administrators found</div>'
              : maCardHtml}
          </div>
          <div class="mob-list-footer">${adminState.filtered.length} administrator${adminState.filtered.length !== 1 ? 's' : ''}</div>
        ` : `
          <div class="ma-table-wrap">
            ${rows.length === 0 ? `
              <div class="ma-empty">
                ${IC.users}
                <div class="ma-empty-title">No administrators found</div>
                <div class="ma-empty-sub">Try adjusting your filters or search query.</div>
              </div>` : `
              <table class="ma-table">
                <thead>
                  <tr>
                    <th>Administrator</th>
                    <th>Role</th>
                    <th>Department</th>
                    <th>Last Active</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows.map(renderRow).join('')}
                </tbody>
              </table>
              ${renderPagination()}`}
          </div>
        `}

        <!-- Banner -->
        <div class="ma-banner">
          <div class="ma-banner-left">
            <div class="ma-banner-icon">${IC.shieldCheck}</div>
            <div>
              <div class="ma-banner-title">Only Super Admins can manage administrators</div>
              <div class="ma-banner-sub">You can add administrators, manage their roles and permissions, suspend or delete accounts, and review their activity logs.</div>
            </div>
          </div>
          <button class="ma-invite-btn" onclick="maOpenAddModal()">${IC.userCheck} Invite New Administrator</button>
        </div>
      </div>

      <!-- RIGHT PANEL -->
      <div class="ma-right">
        ${isMobile && adminState.selected ? `<div class="ma-detail-panel-mobile">${maDetailCloseBtn}${renderDetail()}</div>` : renderDetail()}
      </div>
    </div>`;
}


// log search
window._maLogSearch = function(v) {
  adminState.logSearch = v;
  rerender();
};

// Reload listener
document.addEventListener('reload-admins', () => {
  adminState.loading = true;
  adminState.users = [];
  loadUsers();
});
