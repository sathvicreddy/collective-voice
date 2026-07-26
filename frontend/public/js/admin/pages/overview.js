/* Overview Page — connected to real backend */
import { IC } from '../icons.js';
import { adminGet } from '../api.js';
import { fmt, initials, avatarStack } from '../utils.js';

// Cache so we don't re-fetch on every tab switch
let _cache = null;

export async function loadOverviewData() {
  try {
    const [stats, meetings, health] = await Promise.all([
      adminGet('/api/admin/stats'),
      adminGet('/api/admin/meetings?status=live'),
      adminGet('/api/admin/health'),
    ]);
    _cache = { stats, liveMeetings: meetings.meetings || [], health };
  } catch (err) {
    console.error('[Overview] load error:', err.message);
    _cache = { stats: null, liveMeetings: [], health: null };
  }
}

export function renderOverview() {
  if (!_cache) {
    // Start async load and show loading state
    loadOverviewData().then(() => {
      const el = document.getElementById('admin-content-area');
      if (el) el.innerHTML = renderOverview();
    });
    return `<div class="page active" id="page-overview"><div class="page-loading">Loading overview…</div></div>`;
  }

  const s = _cache.stats;
  const liveMeetings = _cache.liveMeetings.slice(0, 3);
  const h = _cache.health;
  const chartData = s?.chartData || [];
  const chartMax  = Math.max(...chartData.map(d => d.value), 1);

  const totalUsers    = s?.totalUsers    ?? '—';
  const totalMeetings = s?.totalMeetings ?? '—';
  const liveCount     = s?.liveCount     ?? 0;
  const upcomingCount = s?.upcomingCount ?? 0;
  const pastCount     = (s?.conductedCount ?? 0) + (s?.pastCount ?? 0);
  const totalQs       = s?.totalQuestions ?? '—';
  const totalVotes    = s?.totalVotes     ?? '—';

  const uptimeStr   = h?.uptime  || '—';
  const memPct      = h?.memory?.memPct  ? `${h.memory.memPct}%` : '—';
  const memDetail   = h?.memory ? `${h.memory.heapUsedMB} / ${h.memory.heapTotalMB} MB` : '';
  const dbStatus    = h?.dbStatus || '—';

  const liveCardsHtml = liveMeetings.length === 0
    ? `<div class="live-empty-note">No meetings currently live.</div>`
    : liveMeetings.map(m => `
        <div class="live-card">
          <div><div class="live-badge"><span class="live-badge-dot"></span> LIVE</div><div class="live-card-title">${m.title}</div></div>
          <div class="live-card-host"><div class="host-avatar">${initials(m.owner?.name || '?')}</div>${m.owner?.name || 'Unknown'}</div>
          <div class="live-card-stats">
            <div class="live-stat"><div class="live-stat-label">Participants</div><div class="live-stat-value">${m.participantsCount}</div></div>
            <div class="live-stat"><div class="live-stat-label">Questions</div><div class="live-stat-value">${m.questionsCount}</div></div>
          </div>
          <div class="live-card-footer"><button class="view-btn" onclick="adminNavigate('live-now')">View</button></div>
        </div>`).join('');

  return `
    <div class="page active" id="page-overview">
      <div class="page-header page-header-row">
        <div><h1 class="page-title">Overview</h1><p class="page-subtitle">Platform at a glance. Real-time insights and key metrics.</p></div>
        <button class="date-filter-btn" onclick="reloadOverview()">${IC.refresh} Refresh</button>
      </div>
      <div class="metrics-grid">
        <div class="metric-card" style="animation-delay:.0s"><div class="metric-icon blue">${IC.users}</div><div class="metric-body"><div class="metric-label">Total Users</div><div class="metric-value">${typeof totalUsers === 'number' ? totalUsers.toLocaleString() : totalUsers}</div><div class="metric-sub">${liveCount} live · ${upcomingCount} upcoming</div></div></div>
        <div class="metric-card" style="animation-delay:.06s"><div class="metric-icon green">${IC.calendar}</div><div class="metric-body"><div class="metric-label">Total Meetings</div><div class="metric-value">${totalMeetings}</div><div class="metric-pills"><span class="metric-pill live">${liveCount} live</span><span class="metric-pill upcoming">${upcomingCount} upcoming</span><span class="metric-pill past">${pastCount} past</span></div></div></div>
        <div class="metric-card" style="animation-delay:.12s"><div class="metric-icon orange">${IC.messageCircle}</div><div class="metric-body"><div class="metric-label">Questions Asked<br><span style="font-size:10px;color:var(--muted)">(platform-wide)</span></div><div class="metric-value">${typeof totalQs === 'number' ? totalQs.toLocaleString() : totalQs}</div></div></div>
        <div class="metric-card" style="animation-delay:.18s"><div class="metric-icon purple">${IC.thumbsUp}</div><div class="metric-body"><div class="metric-label">Votes Cast<br><span style="font-size:10px;color:var(--muted)">(platform-wide)</span></div><div class="metric-value">${typeof totalVotes === 'number' ? totalVotes.toLocaleString() : totalVotes}</div></div></div>
      </div>
      <div class="section-header">
        <div class="section-title"><div class="live-dot"></div>Live Right Now</div>
        <span class="live-count-chip">${_cache.liveMeetings.length} meetings live</span>
        <div class="section-link" onclick="adminNavigate('live-now')">View all live meetings ${IC.arrowRight}</div>
      </div>
      <div class="live-cards-grid">${liveCardsHtml}</div>
      <div class="bottom-grid">
        <div class="health-card">
          <div class="card-header"><div class="card-title">${IC.server} Server Health</div><div class="card-link" onclick="adminNavigate('health')">View full system health ${IC.arrowRight}</div></div>
          <div class="health-stats">
            <div><div class="health-stat-label">${IC.clock} Uptime</div><div class="health-stat-value">${uptimeStr}</div></div>
            <div><div class="health-stat-label">${IC.memoryChip} Heap Usage</div><div class="health-stat-value">${memPct}</div><div class="health-stat-sub">${memDetail}</div></div>
            <div><div class="health-stat-label">${IC.database} DB Status</div><div class="health-status-ok">${dbStatus}</div><div class="health-stat-sub">PostgreSQL</div></div>
          </div>
        </div>
        <div class="chart-card">
          <div class="chart-header"><div class="card-title">${IC.barChart} Questions asked, last 7 days</div></div>
          <div class="bar-chart-wrap">
            ${chartData.map(d => `
              <div class="bar-col">
                <div class="bar-value">${fmt(d.value)}</div>
                <div class="bar-bar-wrap"><div class="bar-bar" style="height:${Math.round((d.value/chartMax)*100)}%"></div></div>
                <div class="bar-label">${d.label}</div>
              </div>`).join('')}
          </div>
        </div>
      </div>
    </div>`;
}

window.reloadOverview = function() {
  _cache = null;
  const el = document.getElementById('admin-content-area');
  if (el) el.innerHTML = renderOverview();
};
