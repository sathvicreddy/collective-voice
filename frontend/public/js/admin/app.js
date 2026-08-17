/* ============================================================
   CollectiveVoice — Admin Panel Entry Point
   ============================================================ */
import { IC } from './icons.js';
import { state } from './state.js';
import { renderSidebar, renderTopbar } from './shell.js';

/* Page renders & cache resets */
import { renderOverview }           from './pages/overview.js';
import { renderLiveNow }            from './pages/live-now.js';
import { renderMeetings, resetMeetingsCache } from './pages/meetings.js';
import { renderUsers, resetUsersCache }    from './pages/users.js';
import { renderContentModeration }  from './pages/moderation.js';
import { renderNLPEngine }          from './pages/nlp.js';
import { renderSystemHealth }       from './pages/health.js';
import { renderAuditLog }           from './pages/audit.js';
import { renderManageAdmins, resetManageAdminsCache } from './pages/manage-admins.js';
import { renderAdminNotifications, resetAdminNotificationsCache } from './pages/notifications.js';
import { renderAdminMessages, resetAdminMessagesCache } from './pages/messages.js';

/* ── Routing ── */
function getPageContent(pageId) {
  switch(pageId) {
    case 'overview':      return renderOverview();
    case 'live-now':      return renderLiveNow();
    case 'users':         return renderUsers();
    case 'meetings':      return renderMeetings();
    case 'moderation':    return renderContentModeration();
    case 'nlp':           return renderNLPEngine();
    case 'health':        return renderSystemHealth();
    case 'audit':         return renderAuditLog();
    case 'manage-admins':    return renderManageAdmins();
    case 'notifications':    return renderAdminNotifications();
    case 'messages':         return renderAdminMessages();
    default:              return renderOverview();
  }
}

/* ── Navigation ── */
window.adminNavigate = function(pageId) {
  state.currentPage = pageId;
  state.meetingContextMenu = null;
  state.selectedMeetingId  = null;
  state.selectedUserId     = null;

  // Only reset the cache for the page we're actually going to
  // (Resetting ALL caches caused async fetches from other pages to
  //  fire and overwrite the content area with the wrong page's HTML)
  if (pageId === 'meetings')      resetMeetingsCache();
  if (pageId === 'users')         resetUsersCache();
  if (pageId === 'manage-admins') resetManageAdminsCache();
  if (pageId === 'notifications') resetAdminNotificationsCache();
  if (pageId === 'messages')      resetAdminMessagesCache();

  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === pageId));
  const content = document.getElementById('admin-content-area');
  if (content) content.innerHTML = getPageContent(pageId);
};

/* ── Mount ── */
async function mount() {
  const root = document.getElementById('admin-app');
  if (!root) return;

  root.innerHTML = `<div style="display:grid;place-items:center;height:100vh;color:var(--text-secondary)">Verifying access…</div>`;

  const token = localStorage.getItem('cv_token');
  if (!token) { window.location.href = '/#/login'; return; }

  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Not logged in');

    const { user } = await res.json();
    if (user.role !== 'admin' && user.role !== 'superadmin') {
      window.location.href = '/#/home';
      return;
    }

    state.currentUser  = user;
    state.isSuperadmin = user.role === 'superadmin';

    // Render app shell
    root.innerHTML = `
      ${renderSidebar()}
      <div class="admin-main">
        ${renderTopbar()}
        <div class="admin-content" id="admin-content-area">${getPageContent(state.currentPage)}</div>
      </div>`;
  } catch (err) {
    window.location.href = '/#/login';
  }
}

mount();

/* ── Global toast notification ──
   Any admin page module can call window.adminToast(message, type)
   type: 'success' (default) | 'error' | 'info' */
window.adminToast = function(msg, type = 'success') {
  document.querySelectorAll('.admin-toast').forEach(t => t.remove());
  const colors = {
    success: { bg: '#edfaf0', color: '#158b4b', border: '#b8f0c8', icon: '✓' },
    error:   { bg: '#ffeaea', color: '#e54040', border: '#f8c8c8', icon: '✕' },
    info:    { bg: '#f0ecff', color: '#5b34ff', border: '#d4c8ff', icon: 'ℹ' },
  };
  const c = colors[type] || colors.success;
  const t = document.createElement('div');
  t.className = 'admin-toast';
  t.style.cssText = [
    'position:fixed', 'bottom:28px', 'right:28px', 'z-index:9999',
    `background:${c.bg}`, `color:${c.color}`, `border:1.5px solid ${c.border}`,
    'border-radius:10px', 'padding:11px 18px', 'font-size:13.5px', 'font-weight:600',
    'box-shadow:0 6px 24px rgba(0,0,0,.13)', 'display:flex', 'align-items:center', 'gap:9px',
    'animation:slideInRight .25s ease', 'max-width:360px',
  ].join(';');
  t.innerHTML = `<span style="font-size:16px">${c.icon}</span><span>${msg}</span>`;
  document.body.appendChild(t);
  setTimeout(() => t.style.animation = 'slideOutRight .22s ease forwards', 2600);
  setTimeout(() => t.remove(), 2900);
};

/* ── Global search handler (topbar) — event-delegated so it works
   even though #admin-search is injected dynamically by renderTopbar() ── */
(function wireSearch() {
  let _debounce = null;
  document.addEventListener('input', e => {
    if (e.target?.id !== 'admin-search') return;
    clearTimeout(_debounce);
    const q = e.target.value.trim().toLowerCase();
    if (!q) return;
    _debounce = setTimeout(() => {
      if (/user|member|customer|account/.test(q))           window.adminNavigate?.('users');
      else if (/meet|session|live|room/.test(q))            window.adminNavigate?.('meetings');
      else if (/notif|alert|bell/.test(q))                  window.adminNavigate?.('notifications');
      else if (/flag|moderat|report|spam/.test(q))          window.adminNavigate?.('moderation');
      else if (/nlp|cluster|threshold|weight|embed/.test(q))window.adminNavigate?.('nlp');
      else if (/health|server|memory|db|uptime/.test(q))    window.adminNavigate?.('health');
      else if (/audit|log|history/.test(q))                 window.adminNavigate?.('audit');
      else if (/message|send|broadcast/.test(q))            window.adminNavigate?.('messages');
      else if (/admin|manage|role|perm/.test(q))            window.adminNavigate?.('manage-admins');
      e.target.blur();
      e.target.value = '';
    }, 400);
  });
  // ⌘K / Ctrl+K focuses the search input wherever it lives
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      document.getElementById('admin-search')?.focus();
    }
  });
})();

/* Inject global toast animation if not already present */
(function injectToastStyle() {
  if (document.getElementById('admin-toast-style')) return;
  const s = document.createElement('style');
  s.id = 'admin-toast-style';
  s.textContent = `
    @keyframes slideInRight  { from { opacity:0; transform:translateX(40px) } to { opacity:1; transform:none } }
    @keyframes slideOutRight  { from { opacity:1; transform:none } to { opacity:0; transform:translateX(40px) } }
  `;
  document.head.appendChild(s);
})();
