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
    case 'manage-admins': return renderManageAdmins();
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
