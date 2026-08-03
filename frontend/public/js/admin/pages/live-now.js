/* Live Now Page — connected to real backend */
import { IC } from '../icons.js';
import { adminGet, adminPost } from '../api.js';
import { state } from '../state.js';
import { initials, qBars, qLegend } from '../utils.js';

let _liveMeetings = null;
let _liveView = 'card'; // 'card' | 'table'
let _liveSort = 'participants';

export async function loadLiveNowData() {
  try {
    const data = await adminGet('/api/admin/meetings?status=live');
    _liveMeetings = data.meetings || [];
  } catch (err) {
    console.error('[LiveNow] load error:', err.message);
    _liveMeetings = [];
  }
}

function sortMeetings(arr) {
  const copy = [...arr];
  if (_liveSort === 'participants') return copy.sort((a, b) => b.participantsCount - a.participantsCount);
  if (_liveSort === 'questions')    return copy.sort((a, b) => b.questionsCount    - a.questionsCount);
  return copy;
}

export function renderLiveNow() {
  if (!_liveMeetings) {
    loadLiveNowData().then(() => {
      const el = document.getElementById('admin-content-area');
      if (el && state.currentPage === 'live-now') el.innerHTML = renderLiveNow();
    });
    return `<div class="page active" id="page-live-now"><div class="page-loading">Loading live meetings…</div></div>`;
  }

  const sorted = sortMeetings(_liveMeetings);

  const cardsHtml = sorted.map((m, i) => `
    <div class="livenow-card" style="animation-delay:${i*.06}s">
      <div class="livenow-card-header"><div class="live-badge"><span class="live-badge-dot"></span> LIVE</div><button class="moderate-btn">View as Moderator</button></div>
      <div class="livenow-card-title">${m.title}</div>
      <div class="livenow-card-host"><div class="host-avatar">${initials(m.owner?.name || '?')}</div>${m.owner?.name || 'Unknown'}</div>
      <div class="livenow-stats-row">
        <div><div class="livenow-stat-label">Participants</div><div class="livenow-stat-value" style="margin-top:4px">${m.participantsCount}</div></div>
        <div><div class="livenow-stat-label">Questions</div><div class="livenow-stat-value" style="margin-top:4px">${m.questionsCount}</div></div>
        <div><div class="livenow-stat-label">Code</div><div class="livenow-stat-small" style="margin-top:4px">${m.code}</div></div>
      </div>
    </div>`).join('');

  const tableHtml = sorted.map(m => `
    <tr class="dt-row">
      <td class="dt-td"><span class="dt-meeting-title">${m.title}</span></td>
      <td class="dt-td">${m.owner?.name || '—'}</td>
      <td class="dt-td"><span class="live-badge" style="font-size:11px"><span class="live-badge-dot"></span> LIVE</span></td>
      <td class="dt-td">${m.participantsCount}</td>
      <td class="dt-td">${m.questionsCount}</td>
    </tr>`).join('');

  return `
    <div class="page active" id="page-live-now">
      <div class="page-header"><h1 class="page-title">Live Now</h1><p class="page-subtitle">Monitor all meetings that are currently live on the platform.</p></div>
      <div class="livenow-toolbar">
        <div class="view-toggle">
          <button class="view-toggle-btn ${_liveView==='card'?'active':''}" onclick="setLiveView('card')">${IC.grid} Card view</button>
          <button class="view-toggle-btn ${_liveView==='table'?'active':''}" onclick="setLiveView('table')">${IC.table} Table view</button>
        </div>
        <div class="spacer"></div>
        <button class="refresh-btn" title="Refresh" onclick="refreshLiveNow()">${IC.refresh}</button>
        <div class="sort-select-wrap">Sort by: <select class="sort-select" onchange="sortLiveMeetings(this.value)">
          <option value="participants" ${_liveSort==='participants'?'selected':''}>Most participants</option>
          <option value="questions"    ${_liveSort==='questions'?'selected':''}>Most questions</option>
        </select></div>
      </div>

      ${_liveView === 'card' ? `
        <div class="livenow-cards-grid" id="livenow-grid">
          ${sorted.length ? cardsHtml : `
            <div class="no-live-placeholder" style="grid-column:1/-1">
              <div class="no-live-icon">${IC.video}</div>
              <div class="no-live-title">No meetings are live right now</div>
              <div class="no-live-sub">When meetings go live, they will appear here in real-time.</div>
            </div>`}
        </div>` : `
        <div class="dt-table-wrap">
          <table class="dt-table">
            <thead><tr>
              <th class="dt-th">TITLE</th><th class="dt-th">HOST</th><th class="dt-th">STATUS</th>
              <th class="dt-th">PARTICIPANTS</th><th class="dt-th">QUESTIONS</th>
            </tr></thead>
            <tbody>${tableHtml || '<tr><td colspan="5" class="dt-td" style="text-align:center;color:var(--muted)">No live meetings</td></tr>'}</tbody>
          </table>
        </div>`}
    </div>`;
}

window.setLiveView = function(v) {
  _liveView = v;
  const el = document.getElementById('admin-content-area');
  if (el) el.innerHTML = renderLiveNow();
};
window.sortLiveMeetings = function(v) {
  _liveSort = v;
  const el = document.getElementById('admin-content-area');
  if (el) el.innerHTML = renderLiveNow();
};
window.refreshLiveNow = function() {
  _liveMeetings = null;
  const el = document.getElementById('admin-content-area');
  if (el) el.innerHTML = renderLiveNow();
};
