/* ============================================================
   CollectiveVoice — Admin Panel Entry Point
   All page modules loaded via dynamic import with version query
   so the browser ES module registry is busted on every restart.
   ============================================================ */

// Build version injected by server into admin.html → window.__CV_VERSION__
const V = window.__CV_VERSION__ || Date.now();
const base = `/js/admin`;

/* ── Dynamic module loader ──────────────────────────────────── */
async function loadModules() {
  const [
    { IC },
    { state },
    { renderSidebar, renderTopbar },
    { renderOverview },
    { renderLiveNow },
    { renderMeetings },
    { renderUsers },
    { renderContentModeration },
    { renderNLPEngine },
    { renderSystemHealth },
    { renderAuditLog },
    { renderManageAdmins, loadAdmins },
  ] = await Promise.all([
    import(`${base}/icons.js?v=${V}`),
    import(`${base}/state.js?v=${V}`),
    import(`${base}/shell.js?v=${V}`),
    import(`${base}/pages/overview.js?v=${V}`),
    import(`${base}/pages/live-now.js?v=${V}`),
    import(`${base}/pages/meetings.js?v=${V}`),
    import(`${base}/pages/users.js?v=${V}`),
    import(`${base}/pages/moderation.js?v=${V}`),
    import(`${base}/pages/nlp.js?v=${V}`),
    import(`${base}/pages/health.js?v=${V}`),
    import(`${base}/pages/audit.js?v=${V}`),
    import(`${base}/pages/manage-admins.js?v=${V}`),
  ]);
  return {
    IC, state, renderSidebar, renderTopbar,
    renderOverview, renderLiveNow, renderMeetings, renderUsers,
    renderContentModeration, renderNLPEngine, renderSystemHealth,
    renderAuditLog, renderManageAdmins, loadAdmins,
  };
}

/* ── Mount ── */
async function mount() {
  const boot = document.getElementById('cv-admin-boot');
  const root = document.getElementById('admin-app');
  if (!root) return;

  const setMsg = (msg, isErr = false) => {
    const el = document.getElementById('cv-admin-boot-msg');
    if (el) { el.textContent = msg; if (isErr) el.style.color = '#e54040'; }
  };

  const token = localStorage.getItem('cv_token');
  if (!token) {
    setMsg('Session expired — redirecting to login…');
    setTimeout(() => { window.location.href = '/#/login'; }, 1500);
    return;
  }

  try {
    // Load all modules fresh (version-busted)
    setMsg('Loading modules…');
    const mods = await loadModules();
    const {
      state, renderSidebar, renderTopbar, renderOverview, renderLiveNow,
      renderMeetings, renderUsers, renderContentModeration, renderNLPEngine,
      renderSystemHealth, renderAuditLog, renderManageAdmins,
    } = mods;

    // Verify auth
    setMsg('Verifying access…');
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Not logged in');

    const { user } = await res.json();
    if (user.role !== 'admin' && user.role !== 'superadmin') {
      setMsg('Access denied — redirecting…');
      setTimeout(() => { window.location.href = '/#/home'; }, 1500);
      return;
    }

    state.currentUser  = user;
    state.isSuperadmin = user.role === 'superadmin';
    state.currentPage  = state.currentPage || 'overview';

    /* ── Routing ── */
    function getPageContent(pageId) {
      switch (pageId) {
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

      document.querySelectorAll('.nav-item')
        .forEach(el => el.classList.toggle('active', el.dataset.page === pageId));
      const content = document.getElementById('admin-content-area');
      if (content) content.innerHTML = getPageContent(pageId);
    };

    // Render app shell
    root.innerHTML = `
      ${renderSidebar()}
      <div class="admin-main">
        ${renderTopbar()}
        <div class="admin-content" id="admin-content-area">${getPageContent(state.currentPage)}</div>
      </div>`;

    // Swap: hide boot overlay, reveal app
    if (boot) boot.classList.add('hidden');

  } catch (err) {
    console.error('[Admin] Mount error:', err);
    setMsg('Session expired — redirecting to login…');
    setTimeout(() => { window.location.href = '/#/login'; }, 1500);
  }
}

mount();
