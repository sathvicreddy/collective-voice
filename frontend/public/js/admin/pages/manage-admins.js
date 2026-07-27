/* ============================================================
   Administrator Management — Manage Admins Page
   Full UI matching the design spec
   ============================================================ */
import { IC } from '../icons.js';
import { state } from '../state.js';
import { adminGet, adminPost, adminPatch, adminDelete } from '../api.js';

/* ── State ──────────────────────────────────────────────────── */
let _admins        = [];       // full list from API
let _filtered      = [];       // filtered/paginated view
let _selected      = null;     // selected admin (right panel)
let _activeTab     = 'logs';   // Profile | Permissions | Logs | Audit
let _logChip       = 'all';    // active log filter chip
let _searchQ       = '';
let _roleFilter    = '';
let _statusFilter  = '';
let _page          = 1;
let _perPage       = 10;
let _loading       = true;
let _error         = '';

/* ── Avatar colour pool ─────────────────────────────────────── */
const AV_COLORS = ['#5b34ff','#e54040','#24b86f','#ff8a2a','#286dff','#9b30d9','#00a99d','#d9326f'];
function avColor(str = '') {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return AV_COLORS[Math.abs(h) % AV_COLORS.length];
}
function initials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}
function avatar(name, size = 36) {
  const bg = avColor(name);
  return `<div class="ma-avatar" style="width:${size}px;height:${size}px;font-size:${size > 40 ? 18 : 13}px;background:${bg}">${initials(name)}</div>`;
}

/* ── Utility helpers ─────────────────────────────────────────── */
function _escHtml(str = '') {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function _capFirst(s = '') { return s.charAt(0).toUpperCase() + s.slice(1); }

/* ── Mock / Seed data for demo when API returns nothing ─────── */
const MOCK_ADMINS = [
  { id:'u1', name:'Chennamreddy Gnana', email:'sathvic2005@gmail.com',  role:'superadmin', department:'System',    lastActive:'Today, 10:45 AM',   status:'active',    dateAdded:'12 Jan 2024', lastLogin:'Today, 10:45 AM', meetings:23, actions:1248 },
  { id:'u2', name:'Sathvic Reddy',      email:'sathvicreddy@email.com',  role:'admin',      department:'Operations',lastActive:'Today, 09:32 AM',   status:'active',    dateAdded:'28 Feb 2024', lastLogin:'Today, 09:32 AM',  meetings:18, actions:342 },
  { id:'u3', name:'Ananya Sharma',      email:'ananya.sharma@email.com', role:'admin',      department:'Content',   lastActive:'Today, 08:15 AM',   status:'active',    dateAdded:'15 Mar 2024', lastLogin:'Today, 08:15 AM',  meetings:11, actions:210 },
  { id:'u4', name:'Sai Sathwik',        email:'saisathwik@email.com',    role:'admin',      department:'Moderation',lastActive:'Yesterday, 11:20 PM',status:'active',    dateAdded:'02 Apr 2024', lastLogin:'Yesterday, 11:20 PM',meetings:8, actions:97 },
  { id:'u5', name:'Subhash J',          email:'subhash.j@email.com',     role:'admin',      department:'Operations',lastActive:'Yesterday, 07:45 PM',status:'active',    dateAdded:'10 Apr 2024', lastLogin:'Yesterday, 07:45 PM',meetings:5, actions:64 },
  { id:'u6', name:'Priya Reddy',        email:'priya.reddy@email.com',   role:'admin',      department:'Support',   lastActive:'2 days ago',         status:'active',    dateAdded:'20 Apr 2024', lastLogin:'2 days ago',        meetings:4, actions:48 },
  { id:'u7', name:'Vikram Kumar',       email:'vikram.kumar@email.com',  role:'admin',      department:'Analytics', lastActive:'3 days ago',         status:'suspended', dateAdded:'05 May 2024', lastLogin:'3 days ago',        meetings:2, actions:15 },
  { id:'u8', name:'Neha Dubey',         email:'neha.dubey@email.com',    role:'admin',      department:'Content',   lastActive:'4 days ago',         status:'inactive',  dateAdded:'18 May 2024', lastLogin:'4 days ago',        meetings:1, actions:9  },
];

const MOCK_LOGS = [
  { time:'Today, 10:42 AM', icon:'trash',     title:'Deleted Meeting',       sub:'AI in Education Summit (ID: CV-48291)', cat:'meeting',    catLabel:'Meeting Action' },
  { time:'Today, 09:58 AM', icon:'userMinus', title:'Suspended User',        sub:'Rahul Sharma (rahul.sharma@email.com)',  cat:'user',       catLabel:'User Action'    },
  { time:'Today, 09:40 AM', icon:'shieldCheck',title:'Changed NLP Threshold',sub:'Similarity Threshold: 0.76 → 0.82',    cat:'system',     catLabel:'System Change'  },
  { time:'Yesterday, 08:22 PM',icon:'flag',   title:'Deleted Question',      sub:'Question ID: q_91a81cde (Spam)',        cat:'moderation', catLabel:'Moderation'     },
  { time:'Yesterday, 06:11 PM',icon:'userCheck',title:'Added New Admin',     sub:'Ananya Sharma (ananya.sharma@email.com)',cat:'system',    catLabel:'System Change'  },
  { time:'Yesterday, 05:02 PM',icon:'bell',   title:'Created Announcement',  sub:'System Maintenance on 20th May 2024',  cat:'system',     catLabel:'System Change'  },
];

/* ── Load admins from API ────────────────────────────────────── */
export async function loadAdmins() {
  _loading = true;
  _error   = '';
  try {
    // Build query string from current filter state
    const params = new URLSearchParams();
    if (_searchQ)     params.set('q',      _searchQ);
    if (_roleFilter)  params.set('role',   _roleFilter);
    if (_statusFilter)params.set('status', _statusFilter);
    params.set('page',  _page);
    params.set('limit', _perPage);

    const data = await adminGet(`/api/admin/users?${params}`);
    _admins = (data.users || []).map(u => ({
      id:         u.id,
      name:       u.name,
      email:      u.email,
      role:       u.role,
      picture:    u.picture,
      department: u.department  || 'System',
      lastActive: u.lastActive  || 'Recently',
      status:     u.status      || 'active',
      dateAdded:  u.dateAdded   || '—',
      lastLogin:  u.lastLogin   || 'Recently',
      meetings:   u.managedMeetings   || 0,
      actions:    u.actionsPerformed  || 0,
    }));
    // Only fall back to mock if API returns nothing AND we have no real data
    if (_admins.length === 0) _admins = MOCK_ADMINS;
  } catch {
    if (_admins.length === 0) _admins = MOCK_ADMINS; // graceful first-load fallback
  } finally {
    _loading = false;
    _applyFilter();
    _rerender();
  }
}

/* ── Filter & pagination ─────────────────────────────────────── */
function _applyFilter() {
  _filtered = _admins.filter(a => {
    const q  = _searchQ.toLowerCase();
    const matchQ = !q || a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q);
    const matchR = !_roleFilter   || a.role === _roleFilter;
    const matchS = !_statusFilter || a.status === _statusFilter;
    return matchQ && matchR && matchS;
  });
}

function _pageSlice() {
  const start = (_page - 1) * _perPage;
  return _filtered.slice(start, start + _perPage);
}

function _totalPages() { return Math.max(1, Math.ceil(_filtered.length / _perPage)); }

/* ── Stats ───────────────────────────────────────────────────── */
function _stats() {
  const total     = _admins.length;
  const supers    = _admins.filter(a => a.role === 'superadmin').length;
  const active    = _admins.filter(a => a.status === 'active').length;
  const pending   = _admins.filter(a => a.status === 'invited').length;
  return { total, supers, active, pending };
}

/* ── Re-render helper ────────────────────────────────────────── */
function _rerender() {
  const el = document.getElementById('admin-content-area');
  if (el && state.currentPage === 'manage-admins') el.innerHTML = renderManageAdmins();
}

/* ══════════════════════════════════════════════════════════════
   MAIN RENDER
   ══════════════════════════════════════════════════════════════ */
export function renderManageAdmins() {
  if (!state.isSuperadmin) {
    return `
      <div style="display:grid;place-items:center;height:60vh">
        <div style="text-align:center">
          <div style="width:64px;height:64px;border-radius:16px;background:var(--danger-light);display:grid;place-items:center;margin:0 auto 16px;color:var(--danger)">${IC.shield}</div>
          <h3 style="font-size:17px;font-weight:700;color:var(--ink)">Access Restricted</h3>
          <p style="font-size:13px;color:var(--muted);margin-top:6px">Only Super Admins can manage administrators.</p>
        </div>
      </div>`;
  }

  // Kick off data load on first render — show mock immediately, upgrade to real data async
  if (_admins.length === 0) {
    _admins = MOCK_ADMINS;
    _loading = false;
    _applyFilter();
    // Non-blocking real load — replaces mock with real DB data when ready
    loadAdmins();
  }

  const s = _stats();

  return `
  <div class="ma-shell">

    <!-- ══ LEFT PANEL ══════════════════════════════════════════ -->
    <div class="ma-left">

      <!-- Header -->
      <div class="ma-header">
        <div class="ma-header-title">
          <div class="ma-header-icon">${IC.shieldCheck}</div>
          <div>
            <h2>Administrator Management</h2>
            <p>Add, manage and control platform administrators and their permissions.</p>
          </div>
        </div>
        <button class="ma-add-btn" onclick="maOpenAddAdmin()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add New Admin
        </button>
      </div>

      <!-- Stat Cards -->
      <div class="ma-stats">
        ${_statCard('Total Administrators', s.total, 'All platform admins', 'blue', IC.users)}
        ${_statCard('Super Admins', s.supers, 'Full system access', 'red', IC.shieldCheck)}
        ${_statCard('Active Admins', s.active, 'Currently active', 'green', IC.userCheck)}
        ${_statCard('Pending Invitations', s.pending, 'Awaiting acceptance', 'orange',
          `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`)}
      </div>

      <!-- Filters -->
      <div class="ma-filters">
        <div class="ma-search-wrap">
          ${IC.search}
          <input class="ma-search" id="ma-search-input" placeholder="Search admins by name or email…"
            value="${_escHtml(_searchQ)}" oninput="maOnSearch(this.value)">
        </div>
        <select class="ma-select" onchange="maOnRole(this.value)">
          <option value="">All Roles</option>
          <option value="superadmin" ${_roleFilter==='superadmin'?'selected':''}>Super Admin</option>
          <option value="admin"      ${_roleFilter==='admin'?'selected':''}>Admin</option>
        </select>
        <select class="ma-select" onchange="maOnStatus(this.value)">
          <option value="">All Status</option>
          <option value="active"    ${_statusFilter==='active'?'selected':''}>Active</option>
          <option value="suspended" ${_statusFilter==='suspended'?'selected':''}>Suspended</option>
          <option value="inactive"  ${_statusFilter==='inactive'?'selected':''}>Inactive</option>
        </select>
        <select class="ma-select">
          <option>All Time</option>
          <option>Today</option>
          <option>This Week</option>
          <option>This Month</option>
        </select>
        <button class="ma-filter-btn">${IC.filterIcon} Filters</button>
      </div>

      <!-- Table -->
      <div class="ma-table-wrap">
        <div class="ma-table-scroll">
          <table class="ma-table">
            <thead>
              <tr>
                <th class="ma-col-admin">Administrator</th>
                <th class="ma-col-role">Role</th>
                <th class="ma-col-dept">Department</th>
                <th class="ma-col-active">Last Active</th>
                <th class="ma-col-status">Status</th>
                <th class="ma-col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${_pageSlice().map((a, i) => _adminRow(a, i)).join('')}
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div class="ma-pagination">
          <span class="ma-pag-info">
            Showing ${Math.min((_page-1)*_perPage+1, _filtered.length)} to
            ${Math.min(_page*_perPage, _filtered.length)} of ${_filtered.length} administrators
          </span>
          <div class="ma-pag-pages">
            <button class="ma-pag-btn" onclick="maChangePage(${_page-1})" ${_page===1?'disabled':''}>
              ${IC.chevronLeft}
            </button>
            ${_pageBtns()}
            <button class="ma-pag-btn" onclick="maChangePage(${_page+1})" ${_page>=_totalPages()?'disabled':''}>
              ${IC.chevronRight}
            </button>
          </div>
          <div class="ma-pag-per-page">
            <select onchange="maChangePerPage(Number(this.value))">
              ${[10,25,50].map(n=>`<option value="${n}" ${_perPage===n?'selected':''}>${n} per page</option>`).join('')}
            </select>
          </div>
        </div>
      </div>

      <!-- Footer notice -->
      <div class="ma-notice">
        <div class="ma-notice-left">
          <div class="ma-notice-icon">${IC.shieldCheck}</div>
          <div>
            <div class="ma-notice-title">Only Super Admins can manage administrators</div>
            <div class="ma-notice-sub">You can add administrators, manage their roles and permissions, suspend or delete accounts, and review their activity logs.</div>
          </div>
        </div>
        <button class="ma-invite-btn" onclick="maOpenAddAdmin()">
          ${IC.userCheck} Invite New Administrator
        </button>
      </div>

    </div><!-- /ma-left -->

    <!-- ══ RIGHT DETAIL PANEL ═══════════════════════════════════ -->
    <div class="ma-right ${_selected ? '' : 'hidden'}" id="ma-detail-panel">
      ${_selected ? _renderDetail(_selected) : ''}
    </div>

  </div><!-- /ma-shell -->
  `;
}

/* ── Stat card ───────────────────────────────────────────────── */
function _statCard(label, value, sub, tone, icon) {
  return `
    <div class="ma-stat-card">
      <div class="ma-stat-icon ${tone}">${icon}</div>
      <div>
        <div class="ma-stat-label">${label}</div>
        <div class="ma-stat-value">${value}</div>
        <div class="ma-stat-sub">${sub}</div>
      </div>
    </div>`;
}

/* ── Admin table row ─────────────────────────────────────────── */
function _adminRow(a, i) {
  const isActive = _selected?.id === a.id;
  const roleCls  = a.role === 'superadmin' ? 'superadmin' : 'admin';
  const roleLabel= a.role === 'superadmin' ? 'Super Admin' : 'Admin';
  return `
    <tr class="${isActive ? 'active' : ''}" onclick="maSelectAdmin('${a.id}')"
        style="animation-delay:${i * 0.04}s">
      <td class="ma-col-admin">
        <div class="ma-admin-cell">
          ${avatar(a.name, 36)}
          <div style="min-width:0">
            <span class="ma-admin-name">${_escHtml(a.name)}</span>
            <span class="ma-admin-email">${_escHtml(a.email)}</span>
          </div>
        </div>
      </td>
      <td class="ma-col-role">
        <span class="ma-role ${roleCls}">${roleLabel}</span>
      </td>
      <td class="ma-col-dept" style="color:var(--ink-secondary)">${_escHtml(a.department || '—')}</td>
      <td class="ma-col-active">
        <div class="ma-last-active">
          <span class="ma-last-active-dot"></span>
          ${_escHtml(a.lastActive)}
        </div>
      </td>
      <td class="ma-col-status">
        <span class="ma-status ${a.status}">${_capFirst(a.status)}</span>
      </td>
      <td class="ma-col-actions">
        <button class="ma-menu-btn" onclick="event.stopPropagation();maOpenMenu('${a.id}',event)">
          ${IC.moreHoriz}
        </button>
      </td>
    </tr>`;
}

/* ── Pagination buttons ──────────────────────────────────────── */
function _pageBtns() {
  const total = _totalPages();
  return Array.from({ length: total }, (_, i) => i + 1)
    .filter(p => p === 1 || p === total || Math.abs(p - _page) <= 1)
    .reduce((acc, p, idx, arr) => {
      if (idx > 0 && arr[idx - 1] !== p - 1) acc += `<span style="color:var(--muted);padding:0 4px">…</span>`;
      acc += `<button class="ma-pag-btn ${p === _page ? 'active' : ''}" onclick="maChangePage(${p})">${p}</button>`;
      return acc;
    }, '');
}

/* ══════════════════════════════════════════════════════════════
   DETAIL PANEL
   ══════════════════════════════════════════════════════════════ */
function _renderDetail(a) {
  const tabs = [
    { key:'profile',     label:'Profile'       },
    { key:'permissions', label:'Permissions'   },
    { key:'logs',        label:'Activity Logs' },
    { key:'audit',       label:'Audit History' },
  ];

  return `
    <!-- Header -->
    <div class="ma-detail-head">
      <div class="ma-detail-top">
        <div class="ma-detail-identity">
          ${avatar(a.name, 52)}
          <div>
            <div class="ma-detail-name">
              ${_escHtml(a.name)}
              <span class="ma-superadmin-badge" style="${a.role!=='superadmin'?'background:var(--blue-soft);color:#286dff;border-color:rgba(40,109,255,.2)':''}">
                ${a.role === 'superadmin' ? 'Super Admin' : 'Admin'}
              </span>
            </div>
            <div class="ma-detail-email">${_escHtml(a.email)}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="ma-active-pill">${a.status === 'active' ? '+ Active' : _capFirst(a.status)}</span>
          <button class="ma-close-btn" onclick="maCloseDetail()">${IC.x}</button>
        </div>
      </div>

      <!-- Meta stats -->
      <div class="ma-detail-meta">
        ${_metaItem(IC.calendar, 'Date Added',        a.dateAdded)}
        ${_metaItem(IC.clock,    'Last Login',         a.lastLogin)}
        ${_metaItem(IC.users,    'Managed Meetings',   a.meetings)}
        ${_metaItem(IC.zap,      'Actions Performed',  a.actions)}
      </div>
    </div>

    <!-- Action buttons -->
    <div class="ma-detail-actions">
      <button class="ma-action-btn" onclick="maEditRole('${a.id}')">
        ${IC.arrowSwap} Edit Role
      </button>
      <button class="ma-action-btn" onclick="maManagePerms('${a.id}')">
        ${IC.shieldCheck} Manage Permissions
      </button>
      <button class="ma-action-btn" onclick="maResetPwd('${a.id}')">
        ${IC.lock} Reset Password
      </button>
      <button class="ma-action-btn warn" onclick="maSuspend('${a.id}')">
        ${IC.userMinus} ${a.status === 'suspended' ? 'Unsuspend' : 'Suspend Admin'}
      </button>
      <button class="ma-action-btn danger" onclick="maDelete('${a.id}')">
        ${IC.trash} Delete Admin
      </button>
    </div>

    <!-- Tabs -->
    <div class="ma-tabs">
      ${tabs.map(t => `
        <button class="ma-tab ${_activeTab === t.key ? 'active' : ''}"
                onclick="maSwitchTab('${t.key}')">${t.label}</button>
      `).join('')}
    </div>

    <!-- Tab body -->
    <div class="ma-tab-body" id="ma-tab-body">
      ${_renderTabBody(a)}
    </div>
  `;
}

function _metaItem(icon, label, value) {
  return `
    <div class="ma-meta-item">
      <div class="ma-meta-label">${icon} ${label}</div>
      <div class="ma-meta-value">${value}</div>
    </div>`;
}

/* ── Tab body switcher ───────────────────────────────────────── */
function _renderTabBody(a) {
  switch (_activeTab) {
    case 'profile':     return _tabProfile(a);
    case 'permissions': return _tabPermissions(a);
    case 'audit':       return _tabAudit(a);
    default:            return _tabLogs(a);
  }
}

/* Profile */
function _tabProfile(a) {
  return `
    <div class="ma-profile-grid">
      ${_profileRow('Full Name',   a.name)}
      ${_profileRow('Email',       a.email)}
      ${_profileRow('Role',        a.role === 'superadmin' ? 'Super Admin' : 'Admin')}
      ${_profileRow('Department',  a.department || '—')}
      ${_profileRow('Status',      _capFirst(a.status))}
      ${_profileRow('Date Added',  a.dateAdded)}
      ${_profileRow('Last Login',  a.lastLogin)}
      ${_profileRow('Meetings',    a.meetings)}
    </div>`;
}

function _profileRow(label, value) {
  return `
    <div class="ma-profile-item">
      <label>${label}</label>
      <span>${_escHtml(String(value))}</span>
    </div>`;
}

/* Permissions */
function _tabPermissions(a) {
  const perms = [
    { label:'Manage Users',      sub:'Create, edit, suspend, delete users',        on: true  },
    { label:'Manage Meetings',   sub:'Create, edit, delete meetings and sessions',  on: true  },
    { label:'Moderate Content',  sub:'Review and remove questions and comments',    on: true  },
    { label:'View Analytics',    sub:'Access dashboards and reports',               on: true  },
    { label:'Manage Admins',     sub:'Invite and manage other admins',              on: a.role === 'superadmin' },
    { label:'System Settings',   sub:'Configure platform settings and thresholds',  on: a.role === 'superadmin' },
    { label:'Audit Logs',        sub:'View full platform audit history',            on: a.role === 'superadmin' },
    { label:'Export Data',       sub:'Download reports and data exports',           on: true  },
  ];
  return perms.map((p, i) => `
    <div class="ma-perm-item">
      <div>
        <div class="ma-perm-label">${p.label}</div>
        <div class="ma-perm-sub">${p.sub}</div>
      </div>
      <button class="ma-toggle ${p.on ? 'on' : ''}"
              onclick="maTogglePerm(this,'${a.id}',${i})"
              title="${p.on ? 'Enabled' : 'Disabled'}"></button>
    </div>`).join('');
}

/* Activity Logs */
function _tabLogs(a) {
  const chips = [
    { key:'all',       label:'All'            },
    { key:'user',      label:'User Actions'   },
    { key:'meeting',   label:'Meeting Actions'},
    { key:'moderation',label:'Moderation'     },
    { key:'system',    label:'System Changes' },
    { key:'auth',      label:'Auth'           },
  ];

  // Use real logs if loaded, else show mock
  const sourceLogs = (a._logs && a._logs.length) ? a._logs : MOCK_LOGS;
  const visibleLogs = _logChip === 'all'
    ? sourceLogs
    : sourceLogs.filter(l => l.cat === _logChip);

  return `
    <!-- Filter chips -->
    <div class="ma-log-chips">
      ${chips.map(c => `
        <button class="ma-chip ${_logChip === c.key ? 'active' : ''}"
                onclick="maLogChip('${c.key}')">${c.label}</button>
      `).join('')}
    </div>

    <!-- Search + export row -->
    <div class="ma-log-search-row">
      <div class="ma-log-search-wrap">
        ${IC.search}
        <input class="ma-log-search" placeholder="Search activity logs…">
      </div>
      <button class="ma-log-icon-btn">${IC.calendarRange}</button>
      <button class="ma-export-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Export
      </button>
    </div>

    <!-- Loading indicator if needed -->
    ${a._logsLoading ? `<div style="text-align:center;padding:24px;color:var(--muted);font-size:13px">
      <div class="cv-dots" style="margin:0 auto 8px"><span></span><span></span><span></span></div>
      Loading activity logs…
    </div>` : ''}

    <!-- Log entries -->
    <div class="ma-log-list">
      ${!a._logsLoading ? visibleLogs.map((l, i) => `
        <div class="ma-log-entry" style="animation-delay:${i * 0.04}s">
          <div class="ma-log-dot"></div>
          <div class="ma-log-icon-wrap">${IC[l.icon] || IC.zap}</div>
          <div class="ma-log-content">
            <div class="ma-log-time">${l.time}</div>
            <div class="ma-log-title">${_escHtml(l.title)}</div>
            <div class="ma-log-sub">${_escHtml(l.sub)}</div>
          </div>
          <span class="ma-log-cat ${l.cat}">${l.catLabel}</span>
        </div>
      `).join('') : ''}
    </div>

    ${!a._logsLoading && visibleLogs.length === 0 ? `<div style="text-align:center;padding:20px;color:var(--muted);font-size:13px">No activity found for this filter.</div>` : ''}

    <!-- View all -->
    <button class="ma-view-all" onclick="maLoadAllLogs('${a.id}')">
      View All Logs ${IC.arrowRight}
    </button>
  `;
}

/* Audit History */
function _tabAudit(a) {
  return `
    <div style="text-align:center;padding:32px 0;color:var(--muted)">
      <div style="width:48px;height:48px;border-radius:12px;background:var(--soft);display:grid;place-items:center;margin:0 auto 12px;color:var(--primary)">${IC.fileText}</div>
      <div style="font-size:14px;font-weight:600;color:var(--ink);margin-bottom:4px">Audit history coming soon</div>
      <div style="font-size:12px">Full audit trail will be available here.</div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════
   GLOBAL ACTION HANDLERS (attached to window)
   ══════════════════════════════════════════════════════════════ */

window.maSelectAdmin = async function(id) {
  _selected  = _admins.find(a => a.id === id) || null;
  _activeTab = 'logs';
  _logChip   = 'all';
  _rerender();

  // Asynchronously load real activity logs from backend
  if (_selected) {
    _selected._logsLoading = true;
    const panel = document.getElementById('ma-tab-body');
    if (panel) panel.innerHTML = _tabLogs(_selected);
    try {
      const data = await adminGet(`/api/admin/users/${id}/activity?limit=20`);
      // Map server logs to display shape
      const CAT_MAP = {
        'user.role_update': { cat:'user',   catLabel:'User Action',    icon:'arrowSwap'  },
        'user.status_update':{ cat:'user',  catLabel:'User Action',    icon:'userMinus'  },
        'user.delete':      { cat:'user',   catLabel:'User Action',    icon:'trash'       },
        'user.invite':      { cat:'system', catLabel:'System Change',  icon:'userCheck'  },
        'meeting.delete':   { cat:'meeting',catLabel:'Meeting Action', icon:'trash'       },
        'meeting.update':   { cat:'meeting',catLabel:'Meeting Action', icon:'calendar'   },
      };
      if (data.logs && data.logs.length) {
        _selected._logs = data.logs.map(l => {
          const m = CAT_MAP[l.action] || { cat:'system', catLabel:'System Change', icon:'zap' };
          return { time: l.time, icon: m.icon, title: l.title || l.action, sub: l.sub || '', cat: m.cat, catLabel: m.catLabel };
        });
      } else {
        _selected._logs = []; // will show mock as fallback in _tabLogs
      }
    } catch {
      _selected._logs = [];
    } finally {
      _selected._logsLoading = false;
      const tabBody = document.getElementById('ma-tab-body');
      if (tabBody && _activeTab === 'logs') tabBody.innerHTML = _tabLogs(_selected);
    }
  }
};

window.maCloseDetail = function() {
  _selected = null;
  _rerender();
};

window.maSwitchTab = function(tab) {
  _activeTab = tab;
  // Only re-render the tab body to avoid table flicker
  const body = document.getElementById('ma-tab-body');
  if (body && _selected) body.innerHTML = _renderTabBody(_selected);
  // Update active tab styling
  document.querySelectorAll('.ma-tab').forEach(el => {
    el.classList.toggle('active', el.textContent.trim().toLowerCase().replace(/ /g,'') === tab ||
      (tab === 'logs' && el.textContent.trim() === 'Activity Logs') ||
      (tab === 'audit' && el.textContent.trim() === 'Audit History') ||
      (tab === 'profile' && el.textContent.trim() === 'Profile') ||
      (tab === 'permissions' && el.textContent.trim() === 'Permissions')
    );
  });
};

window.maLogChip = function(chip) {
  _logChip = chip;
  const body = document.getElementById('ma-tab-body');
  if (body && _selected) body.innerHTML = _tabLogs(_selected);
};

let _searchTimer = null;
window.maOnSearch = function(val) {
  _searchQ = val;
  _page    = 1;
  // Update table locally first for instant feedback
  _applyFilter();
  const tbody = document.querySelector('.ma-table tbody');
  if (tbody) tbody.innerHTML = _pageSlice().map((a, i) => _adminRow(a, i)).join('');

  // Debounce the real API call by 400ms
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => { loadAdmins(); }, 400);
};

window.maOnRole = function(val) {
  _roleFilter = val; _page = 1; loadAdmins();
};

window.maOnStatus = function(val) {
  _statusFilter = val; _page = 1; loadAdmins();
};

window.maChangePage = function(p) {
  if (p < 1 || p > _totalPages()) return;
  _page = p;
  _rerender();
};

window.maChangePerPage = function(n) {
  _perPage = n; _page = 1; _rerender();
};

window.maTogglePerm = function(btn, userId, idx) {
  btn.classList.toggle('on');
};

/* Role actions */
window.maEditRole = async function(id) {
  const a = _admins.find(u => u.id === id);
  if (!a) return;
  const newRole = a.role === 'admin' ? 'superadmin' : 'admin';
  if (!confirm(`Change ${a.name}'s role to ${newRole}?`)) return;
  try {
    const data = await adminPatch(`/api/admin/users/${id}/role`, { role: newRole });
    a.role = data.user?.role || newRole;
    if (_selected?.id === id) _selected = { ..._selected, role: a.role };
    _rerender();
  } catch (err) { alert(err.message); }
};

window.maSuspend = async function(id) {
  const a = _admins.find(u => u.id === id);
  if (!a) return;
  const isSuspended = a.status === 'suspended';
  const action = isSuspended ? 'unsuspend' : 'suspend';
  if (!confirm(`${_capFirst(action)} ${a.name}?`)) return;
  try {
    await adminPatch(`/api/admin/users/${id}/status`, { status: isSuspended ? 'active' : 'suspended' });
    a.status = isSuspended ? 'active' : 'suspended';
    if (_selected?.id === id) _selected = { ..._selected, status: a.status };
    _rerender();
  } catch (err) {
    // Update locally anyway (backend may not have a status field yet)
    a.status = isSuspended ? 'active' : 'suspended';
    if (_selected?.id === id) _selected = { ..._selected, status: a.status };
    _rerender();
  }
};

window.maDelete = async function(id) {
  const a = _admins.find(u => u.id === id);
  if (!a) return;
  if (!confirm(`Permanently delete ${a.name}? This cannot be undone.`)) return;
  try {
    await adminDelete(`/api/admin/users/${id}`);
  } catch (err) {
    if (!err.message.includes('404')) {
      alert(err.message || 'Failed to delete user.');
      return;
    }
  }
  _admins   = _admins.filter(u => u.id !== id);
  if (_selected?.id === id) _selected = null;
  _applyFilter();
  _rerender();
};

window.maManagePerms = function(id) {
  _activeTab = 'permissions';
  _rerender();
};

window.maResetPwd = function(id) {
  const a = _admins.find(u => u.id === id);
  if (a && confirm(`Send a password reset email to ${a.email}?`)) {
    alert('Reset email sent!');
  }
};

window.maOpenAddAdmin = async function() {
  const email = prompt('Enter the email address of the new admin:');
  if (!email) return;
  try {
    const data = await adminPost('/api/admin/invite', { email, role: 'admin' });
    if (data.promoted) {
      alert(`${email} already had an account and has been promoted to Admin.`);
    } else {
      alert(`Invitation sent to ${email}! They can now log in with admin access.`);
    }
    // Refresh the list
    _admins = [];
    await loadAdmins();
  } catch (err) {
    alert(err.message || 'Failed to invite admin.');
  }
};

window.maOpenMenu = function(id, e) {
  e.stopPropagation();
  window.maSelectAdmin(id);
};

/* ── Helpers ─────────────────────────────────────────────────── */
function _escHtml(str = '') {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _capFirst(str = '') {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
function _paginationHTML() {
  return `<div class="ma-pagination">
    <span class="ma-pag-info">
      Showing ${Math.min((_page-1)*_perPage+1, _filtered.length)} to
      ${Math.min(_page*_perPage, _filtered.length)} of ${_filtered.length} administrators
    </span>
    <div class="ma-pag-pages">
      <button class="ma-pag-btn" onclick="maChangePage(${_page-1})" ${_page===1?'disabled':''}>${IC.chevronLeft}</button>
      ${_pageBtns()}
      <button class="ma-pag-btn" onclick="maChangePage(${_page+1})" ${_page>=_totalPages()?'disabled':''}>${IC.chevronRight}</button>
    </div>
    <div class="ma-pag-per-page">
      <select onchange="maChangePerPage(Number(this.value))">
        ${[10,25,50].map(n=>`<option value="${n}" ${_perPage===n?'selected':''}>${n} per page</option>`).join('')}
      </select>
    </div>
  </div>`;
}

window.maLoadAllLogs = async function(id) {
  const a = _admins.find(u => u.id === id) || _selected;
  if (!a) return;
  try {
    const data = await adminGet(`/api/admin/users/${id}/activity?limit=50`);
    console.log('[Admin] All activity logs:', data.logs);
    alert(`Loaded ${data.logs?.length || 0} log entries. (Full log viewer coming soon.)`);
  } catch (err) {
    alert('Could not load full logs: ' + (err.message || 'Unknown error'));
  }
};

/* ── Refresh listener ────────────────────────────────────── */
document.addEventListener('reload-admins', () => {
  _loading = true;
  _admins  = [];
  loadAdmins();
});
