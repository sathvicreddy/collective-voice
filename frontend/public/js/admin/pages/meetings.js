/* Meetings Page — connected to real backend */
import { IC } from '../icons.js';
import { adminGet, adminDelete, adminPatch } from '../api.js';
import { state } from '../state.js';
import { statusBadge, qStatusBadge, colorForInit, textColorForInit } from '../utils.js';

let _meetings = null;
let _searchQ  = '';
let _statusFilter = 'All';
let _detail = null; // { questions, polls, participants }

function initials(name) {
  if (!name) return '?';
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
}

export async function loadMeetingsData() {
  try {
    const data = await adminGet('/api/admin/meetings');
    _meetings = data.meetings || [];
  } catch (err) {
    console.error('[Meetings] load error:', err.message);
    _meetings = [];
  }
}

async function loadMeetingDetail(id) {
  try {
    const data = await adminGet(`/api/admin/meetings/${id}/details`);
    _detail = data;
  } catch (err) {
    console.error('[Meetings] detail error:', err.message);
    _detail = { questions: [], polls: [], participants: [] };
  }
}

function filteredMeetings() {
  if (!_meetings) return [];
  return _meetings.filter(m => {
    const matchSearch = !_searchQ || m.title.toLowerCase().includes(_searchQ) || m.code.toLowerCase().includes(_searchQ);
    const matchStatus = _statusFilter === 'All' || m.status === _statusFilter.toLowerCase();
    return matchSearch && matchStatus;
  });
}

export function renderMeetings() {
  if (!_meetings) {
    loadMeetingsData().then(() => {
      const el = document.getElementById('admin-content-area');
      if (el) el.innerHTML = renderMeetings();
    });
    return `<div class="page active" id="page-meetings"><div class="page-loading">Loading meetings…</div></div>`;
  }

  const list = filteredMeetings();
  const sel  = _meetings.find(m => m.id === state.selectedMeetingId) || null;
  const deleteModal = state.showDeleteModal ? renderDeleteModal() : '';

  const tableHtml = list.map(m => {
    const ownerInit = initials(m.owner?.name || '?');
    return `<tr class="dt-row ${m.id===state.selectedMeetingId?'dt-row-selected':''}" onclick="selectMeeting('${m.id}')">
      <td class="dt-td"><span class="dt-meeting-title">${m.title}</span></td>
      <td class="dt-td">
        <div style="display:flex;align-items:center;gap:8px">
          <div class="tbl-avatar" style="background:${colorForInit(ownerInit)};color:${textColorForInit(ownerInit)}">${ownerInit}</div>
          <span class="dt-owner">${m.owner?.name || '—'}</span>
        </div>
      </td>
      <td class="dt-td">${statusBadge(m.status)}</td>
      <td class="dt-td"><span class="dt-code">${m.code}</span></td>
      <td class="dt-td">${m.questionsCount}</td>
      <td class="dt-td">${m.status === 'live' || m.status === 'upcoming' ? m.participantsCount : '—'}</td>
      <td class="dt-td dt-muted">${new Date(m.createdAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</td>
      <td class="dt-td dt-actions">
        <div class="dt-actions-wrap">
          <button class="dt-more-btn" onclick="toggleMeetingMenu(event,'${m.id}')">${IC.moreHoriz}</button>
          ${state.meetingContextMenu?.meetingId===m.id ? renderMeetingContextMenu(m.id) : ''}
        </div>
      </td>
    </tr>`;
  }).join('');

  return `
    <div class="page active" id="page-meetings">
      ${deleteModal}
      <div class="page-header page-header-row">
        <div><h1 class="page-title">Meetings <span class="page-count">${_meetings.length} meetings</span></h1></div>
      </div>
      <div class="dt-filters">
        <div class="dt-search-wrap">${IC.search}<input class="dt-search-input" placeholder="Search by title or code…" type="text" value="${_searchQ}" oninput="meetingsSearch(this.value)"></div>
        <div class="filter-group">
          <label class="filter-label">Status</label>
          <div class="filter-select-wrap">
            <select class="filter-select" onchange="meetingsStatusFilter(this.value)">
              <option ${_statusFilter==='All'?'selected':''}>All</option>
              <option ${_statusFilter==='live'?'selected':''} value="live">Live</option>
              <option ${_statusFilter==='upcoming'?'selected':''} value="upcoming">Upcoming</option>
              <option ${_statusFilter==='conducted'?'selected':''} value="conducted">Conducted</option>
              <option ${_statusFilter==='past'?'selected':''} value="past">Past</option>
            </select>${IC.chevronDown}
          </div>
        </div>
        <button class="clear-filters-btn" onclick="meetingsClearFilters()">Clear filters</button>
      </div>
      <div class="dt-layout">
        <div class="dt-table-wrap">
          <table class="dt-table">
            <thead><tr>
              <th class="dt-th">TITLE</th><th class="dt-th">OWNER</th><th class="dt-th">STATUS</th>
              <th class="dt-th">CODE</th><th class="dt-th">QUESTIONS</th><th class="dt-th">PARTICIPANTS</th>
              <th class="dt-th">CREATED</th><th class="dt-th"></th>
            </tr></thead>
            <tbody>${tableHtml || '<tr><td colspan="8" class="dt-td" style="text-align:center;color:var(--muted)">No meetings found</td></tr>'}</tbody>
          </table>
          <div class="dt-footer"><div class="dt-showing">Showing ${list.length} of ${_meetings.length} meetings</div></div>
        </div>
        ${sel ? `<div class="detail-panel" id="detail-panel">${renderMeetingDetailPanel(sel)}</div>` : ''}
      </div>
    </div>`;
}

function renderMeetingContextMenu(meetingId) {
  const sub = state.meetingContextMenu?.sub;
  return `
    <div class="context-menu" onclick="event.stopPropagation()">
      <div class="ctx-item" onclick="showStatusSubmenu('${meetingId}')">
        ${IC.zap} Force Status Change <span class="ctx-arrow">›</span>
        ${sub==='status'?`
          <div class="ctx-submenu">
            <div class="ctx-sub-item live" onclick="forceStatus('${meetingId}','live')">● Live</div>
            <div class="ctx-sub-item upcoming" onclick="forceStatus('${meetingId}','upcoming')">● Upcoming</div>
            <div class="ctx-sub-item conducted" onclick="forceStatus('${meetingId}','conducted')">● Conducted</div>
            <div class="ctx-sub-item past" onclick="forceStatus('${meetingId}','past')">● Past</div>
          </div>`:''}
      </div>
      <div class="ctx-sep"></div>
      <div class="ctx-item danger" onclick="openDeleteModal('${meetingId}')">${IC.trash} Delete Meeting</div>
    </div>`;
}

function renderMeetingDetailPanel(meeting) {
  const tab = state.meetingDetailTab || 'questions';
  const ownerInit = initials(meeting.owner?.name || '?');
  const settings = (() => { try { return JSON.parse(meeting.settingsJson || '{}'); } catch { return {}; } })();

  const questionsHtml = !_detail ? '<div class="dp-empty">Loading…</div>' :
    _detail.questions.length === 0 ? '<div class="dp-empty">No questions yet.</div>' : `
    <div class="dp-section">
      <table class="dp-table">
        <thead><tr><th>QUESTION</th><th>STATUS</th><th>VOTES</th><th>SIMILAR</th></tr></thead>
        <tbody>
          ${_detail.questions.map(q => `<tr>
            <td class="dp-q-text">${q.text}</td>
            <td>${qStatusBadge(q.status)}</td>
            <td class="dp-num">${q.votes}</td>
            <td class="dp-num">${q.similar}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  const pollsHtml = !_detail ? '<div class="dp-empty">Loading…</div>' :
    _detail.polls.length === 0 ? '<div class="dp-empty">No polls yet.</div>' : `
    <div class="dp-section"><div class="dp-polls-grid">
      ${_detail.polls.map(poll => `
        <div class="dp-poll-card">
          <div class="dp-poll-header">
            <span class="dp-poll-q">${poll.question}</span>
            <span class="poll-status-badge ${poll.active?'active':'closed'}">${poll.active?'ACTIVE':'CLOSED'}</span>
          </div>
          ${poll.options.map(o => `
            <div class="dp-poll-option">
              <div class="dp-poll-label-row"><span>${o.label}</span><span class="dp-poll-pct">${o.pct}% (${o.votes})</span></div>
              <div class="dp-poll-bar-wrap"><div class="dp-poll-bar" style="width:${o.pct}%"></div></div>
            </div>`).join('')}
        </div>`).join('')}
    </div></div>`;

  const participantsHtml = !_detail ? '<div class="dp-empty">Loading…</div>' :
    _detail.participants.length === 0 ? '<div class="dp-empty">No participants yet.</div>' : `
    <div class="dp-section">
      <table class="dp-table">
        <thead><tr><th>NAME</th><th>ROLE</th><th>UPVOTES</th><th>QUESTIONS</th></tr></thead>
        <tbody>
          ${_detail.participants.map(p => `<tr>
            <td class="dp-q-text">${p.name}</td>
            <td>${p.role}</td>
            <td class="dp-num">${p.upvotes}</td>
            <td class="dp-num">${p.questionsCount}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  return `
    <div class="dp-header">
      <div class="dp-title-row">
        <h3 class="dp-title">${meeting.title}</h3>
        ${meeting.status==='live'?'<span class="dp-live-badge">● LIVE</span>':''}
        <button class="dp-close-btn" onclick="closeMeetingPanel()">${IC.x}</button>
      </div>
      <div class="dp-meta-row">
        <span class="dp-id">${meeting.code}</span>
        <span class="dp-copy-btn" onclick="navigator.clipboard.writeText('${meeting.code}')" title="Copy code">⧉</span>
      </div>
      <div class="dp-host-row">
        <div class="tbl-avatar sm" style="background:${colorForInit(ownerInit)};color:${textColorForInit(ownerInit)}">${ownerInit}</div>
        <span class="dp-host">${meeting.owner?.name || '—'}</span>
        <span class="dp-created">· Created ${new Date(meeting.createdAt).toLocaleDateString()}</span>
      </div>
      ${meeting.description ? `<p class="dp-desc">${meeting.description}</p>` : ''}
    </div>

    <div class="dp-settings-grid">
      ${Object.entries({
        'Allow Questions': settings.allowQ,
        'Allow Upvotes':   settings.upvotes,
        'Enable Chat':     settings.chat,
        'Clustering':      settings.clustering,
        'Record Meeting':  settings.record,
        'Reactions':       settings.reactions,
      }).map(([label, val]) => `
        <div class="dp-setting-item"><span>${label}</span><span class="dp-setting-icon ${val?'ok':'no'}">${val?IC.check:IC.x}</span></div>`
      ).join('')}
    </div>

    <div class="dp-tabs">
      <button class="dp-tab ${tab==='questions'?'active':''}" onclick="setMeetingTab('questions')">Questions (${meeting.questionsCount})</button>
      <button class="dp-tab ${tab==='polls'?'active':''}" onclick="setMeetingTab('polls')">Polls</button>
      <button class="dp-tab ${tab==='participants'?'active':''}" onclick="setMeetingTab('participants')">Participants (${meeting.participantsCount})</button>
    </div>

    ${tab==='questions'    ? questionsHtml    : ''}
    ${tab==='polls'        ? pollsHtml        : ''}
    ${tab==='participants' ? participantsHtml : ''}

    <div class="dp-footer">
      <div class="dp-status-wrap">
        <div class="live-dot" style="flex-shrink:0"></div>
        <select class="dp-status-select" onchange="forceStatus('${meeting.id}',this.value)">
          <option value="live"      ${meeting.status==='live'?'selected':''}>Live</option>
          <option value="upcoming"  ${meeting.status==='upcoming'?'selected':''}>Upcoming</option>
          <option value="conducted" ${meeting.status==='conducted'?'selected':''}>Conducted</option>
          <option value="past"      ${meeting.status==='past'?'selected':''}>Past</option>
        </select>
      </div>
      <button class="danger-btn" onclick="openDeleteModal('${meeting.id}')">${IC.trash} Delete</button>
    </div>`;
}

function renderDeleteModal() {
  const meeting = _meetings?.find(m => m.id === state.deleteMeetingId);
  if (!meeting) return '';
  return `
    <div class="modal-overlay" onclick="closeDeleteModal()">
      <div class="modal" onclick="event.stopPropagation()">
        <div class="modal-icon">${IC.alertCircle}</div>
        <h3 class="modal-title">Delete '${meeting.title}'?</h3>
        <p class="modal-body">This will permanently delete <b>${meeting.questionsCount} questions</b> and <b>${meeting.participantsCount} participant records</b>.</p>
        <div class="modal-actions">
          <button class="modal-cancel" onclick="closeDeleteModal()">Cancel</button>
          <button class="modal-delete" onclick="confirmDeleteMeeting('${meeting.id}')">Delete Meeting</button>
        </div>
      </div>
    </div>`;
}

/* ── Meeting Actions ── */
window.selectMeeting = function(id) {
  state.selectedMeetingId = id;
  state.meetingContextMenu = null;
  state.meetingDetailTab = 'questions';
  _detail = null;
  const el = document.getElementById('admin-content-area');
  if (el) el.innerHTML = renderMeetings();
  // Load detail in background
  loadMeetingDetail(id).then(() => {
    const el2 = document.getElementById('admin-content-area');
    if (el2 && state.selectedMeetingId === id) el2.innerHTML = renderMeetings();
  });
};
window.closeMeetingPanel = function() {
  state.selectedMeetingId = null;
  state.meetingDetailTab = 'questions';
  _detail = null;
  const el = document.getElementById('admin-content-area');
  if (el) el.innerHTML = renderMeetings();
};
window.setMeetingTab = function(tab) {
  state.meetingDetailTab = tab;
  const el = document.getElementById('admin-content-area');
  if (el) el.innerHTML = renderMeetings();
};
window.toggleMeetingMenu = function(e, id) {
  e.stopPropagation();
  if (state.meetingContextMenu?.meetingId === id && !state.meetingContextMenu?.sub) {
    state.meetingContextMenu = null;
  } else {
    state.meetingContextMenu = { meetingId: id, sub: null };
  }
  const el = document.getElementById('admin-content-area');
  if (el) el.innerHTML = renderMeetings();
};
window.showStatusSubmenu = function(id) {
  state.meetingContextMenu = { meetingId: id, sub: 'status' };
  const el = document.getElementById('admin-content-area');
  if (el) el.innerHTML = renderMeetings();
};
window.openDeleteModal = function(id) {
  state.deleteMeetingId = id;
  state.showDeleteModal = true;
  state.meetingContextMenu = null;
  const el = document.getElementById('admin-content-area');
  if (el) el.innerHTML = renderMeetings();
};
window.closeDeleteModal = function() {
  state.showDeleteModal = false;
  state.deleteMeetingId = null;
  const el = document.getElementById('admin-content-area');
  if (el) el.innerHTML = renderMeetings();
};
window.confirmDeleteMeeting = async function(id) {
  try {
    await adminDelete(`/api/admin/meetings/${id}`);
    _meetings = null;
    state.selectedMeetingId = null;
    state.showDeleteModal = false;
    state.deleteMeetingId = null;
    _detail = null;
    await loadMeetingsData();
    const el = document.getElementById('admin-content-area');
    if (el) el.innerHTML = renderMeetings();
  } catch (err) {
    alert('Error: ' + err.message);
    window.closeDeleteModal();
  }
};
window.forceStatus = async function(id, status) {
  try {
    await adminPatch(`/api/admin/meetings/${id}/status`, { status });
    _meetings = null;
    state.meetingContextMenu = null;
    await loadMeetingsData();
    const el = document.getElementById('admin-content-area');
    if (el) el.innerHTML = renderMeetings();
  } catch (err) {
    alert('Error: ' + err.message);
  }
};
window.meetingsSearch = function(q) {
  _searchQ = q.toLowerCase().trim();
  const el = document.getElementById('admin-content-area');
  if (el) el.innerHTML = renderMeetings();
};
window.meetingsStatusFilter = function(s) {
  _statusFilter = s;
  const el = document.getElementById('admin-content-area');
  if (el) el.innerHTML = renderMeetings();
};
window.meetingsClearFilters = function() {
  _searchQ = ''; _statusFilter = 'All';
  const el = document.getElementById('admin-content-area');
  if (el) el.innerHTML = renderMeetings();
};
document.addEventListener('click', () => {
  if (state.meetingContextMenu) {
    state.meetingContextMenu = null;
    const el = document.getElementById('admin-content-area');
    if (el && state.currentPage === 'meetings') el.innerHTML = renderMeetings();
  }
});
