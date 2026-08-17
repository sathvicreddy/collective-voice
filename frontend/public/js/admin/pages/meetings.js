/* Meetings Page — connected to real backend */
import { IC } from '../icons.js';
import { adminGet, adminDelete, adminPatch, adminPost } from '../api.js';
import { state } from '../state.js';
import { statusBadge, qStatusBadge, colorForInit, textColorForInit } from '../utils.js';
import { openQuickMessageModal, closeQuickMessageModal } from '../components/quickMessageModal.js';

let _meetings = null;
let _searchQ  = '';
let _statusFilter = 'All';
let _detail = null; // { questions, polls, participants }

export function resetMeetingsCache() {
  _meetings = null;
  _detail = null;
}

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

async function loadMeetingMessages(id) {
  try {
    const data = await adminGet(`/api/admin/meetings/${id}/messages`);
    if (_detail) _detail.meetingMessages = Array.isArray(data.messages) ? data.messages : [];
    else _detail = { questions: [], polls: [], participants: [], meetingMessages: data.messages || [] };
  } catch {
    if (_detail) _detail.meetingMessages = [];
  }
  const el = document.getElementById('admin-content-area');
  if (el && state.currentPage === 'meetings' && state.meetingDetailTab === 'messages') {
    el.innerHTML = renderMeetings();
  }
}

async function loadMeetingNotifications(id) {
  try {
    const data = await adminGet(`/api/admin/meetings/${id}/notifications`);
    if (_detail) _detail.meetingNotifications = Array.isArray(data.notifications) ? data.notifications : [];
    else _detail = { questions: [], polls: [], participants: [], meetingNotifications: data.notifications || [] };
  } catch {
    if (_detail) _detail.meetingNotifications = [];
  }
  const el = document.getElementById('admin-content-area');
  if (el && state.currentPage === 'meetings' && state.meetingDetailTab === 'notifications') {
    el.innerHTML = renderMeetings();
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
      if (el && state.currentPage === 'meetings') el.innerHTML = renderMeetings();
    });
    return `<div class="page active" id="page-meetings"><div class="page-loading">Loading meetings…</div></div>`;
  }

  const isMobile = window.innerWidth <= 768;
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

  /* ── Mobile card list ── */
  const meetingCardHtml = list.map(m => {
    const ownerInit = initials(m.owner?.name || '?');
    const dateFmt = new Date(m.createdAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
    return `
      <div class="mob-card ${m.id===state.selectedMeetingId?'mob-card-selected':''}" onclick="selectMeeting('${m.id}')">
        <div class="mob-card-avatar" style="background:${colorForInit(ownerInit)};color:${textColorForInit(ownerInit)}">${ownerInit}</div>
        <div class="mob-card-body">
          <div class="mob-card-title">${m.title}</div>
          <div class="mob-card-sub">${m.owner?.name || '—'} · <span class="mob-card-code">${m.code}</span></div>
          <div class="mob-card-tags">${statusBadge(m.status)}<span class="mob-card-meta">${m.questionsCount} Q &middot; ${dateFmt}</span></div>
        </div>
        <button class="mob-card-more" onclick="toggleMeetingMenu(event,'${m.id}')">${IC.moreHoriz}</button>
      </div>`;
  }).join('');

  const detailCloseBtn = `<button class="mob-panel-close" onclick="selectMeeting(null)" aria-label="Back">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
    Back
  </button>`;

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
      ${isMobile ? `
        <div class="mob-card-list">
          ${meetingCardHtml || '<div class="mob-empty">No meetings found</div>'}
        </div>
        <div class="mob-list-footer">${list.length} of ${_meetings.length} meetings</div>
        ${sel ? `<div class="detail-panel" id="detail-panel">${detailCloseBtn}${renderMeetingDetailPanel(sel)}</div>` : ''}
      ` : `
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
      `}
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

  // Messages tab — loaded asynchronously; shows loader until _meetingMessages is populated
  const msgRows = _detail?.meetingMessages;
  const messagesHtml = !msgRows
    ? '<div class="dp-empty">Loading messages…</div>'
    : msgRows.length === 0
      ? `<div class="dp-empty">
          <div style="font-size:32px;margin-bottom:8px">📨</div>
          <p>No messages sent to this meeting yet.</p>
          <button class="dp-action-btn" style="margin-top:8px"
            onclick="openMessageParticipants('${meeting.id}','${meeting.title.replace(/'/g,"\\'")}')"
          >${IC.mail} Send first message</button>
        </div>`
      : `<div class="dp-section"><div style="display:flex;flex-direction:column;gap:6px">
          ${msgRows.map(m => {
            const t = new Date(m.createdAt).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
            const preview = (m.body||'').length > 120 ? m.body.slice(0,120)+'…' : m.body;
            return `
              <div style="padding:12px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-primary)">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px">
                  <span style="font-size:13px;font-weight:600;color:var(--text-primary)">${m.subject}</span>
                  <span style="font-size:11px;color:var(--muted);white-space:nowrap">${t}</span>
                </div>
                <p style="margin:0 0 6px;font-size:12.5px;color:var(--text-secondary);line-height:1.45">${preview}</p>
                <div style="display:flex;gap:8px;align-items:center;font-size:11px;color:var(--muted)">
                  <span>By ${m.sender?.name || 'Admin'}</span>
                  <span>·</span>
                  <span>${m.recipientCount} recipients</span>
                </div>
              </div>
            `;
          }).join('')}
        </div></div>`;


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
      <button class="dp-tab ${tab==='messages'?'active':''}" onclick="setMeetingTab('messages')">${IC.mail} Messages</button>
      <button class="dp-tab ${tab==='notifications'?'active':''}" onclick="setMeetingTab('notifications')">🔔 Notifications</button>
    </div>

    ${tab==='questions'    ? questionsHtml    : ''}
    ${tab==='polls'        ? pollsHtml        : ''}
    ${tab==='participants' ? participantsHtml : ''}
    ${tab==='messages'     ? `<div style="padding:0 0 8px">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0 6px">
        <span style="font-size:12px;color:var(--muted)">Messages sent to participants of this meeting</span>
        <button class="dp-action-btn" style="font-size:11px;padding:5px 10px"
          onclick="openMessageParticipants('${meeting.id}','${meeting.title.replace(/'/g,"\\'")}')"
        >${IC.send} New message</button>
      </div>
      ${messagesHtml}
    </div>` : ''}
    ${tab==='notifications' ? (() => {
      const NOTIF_COLORS = {
        "Admin Message":  { color:"#2563eb", bg:"#eff6ff", icon:"✉️" },
        "Meeting Updates":{ color:"#5b34ff", bg:"#f0ecff", icon:"📅" },
        "Meetings":       { color:"#5b34ff", bg:"#f0ecff", icon:"📅" },
        "Questions":      { color:"#059669", bg:"#edf9f3", icon:"💬" },
        "Question":       { color:"#059669", bg:"#edf9f3", icon:"💬" },
        "System":         { color:"#d97706", bg:"#fff7ed", icon:"⚙️" },
      };
      const defaultNC = { color:"#8890b0", bg:"#f4f5fa", icon:"🔔" };
      function fmtDT(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) + ' · ' +
               d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true});
      }
      const nrows = _detail?.meetingNotifications;
      if (!nrows) return '<div class="dp-empty">Loading notifications…</div>';
      if (!nrows.length) return `<div class="dp-empty" style="padding:24px 0">
        <div style="font-size:28px;margin-bottom:8px">🔔</div>
        <p>No notifications for this meeting’s participants yet.</p>
      </div>`;
      return `<div class="dp-section"><div style="display:flex;flex-direction:column;gap:4px">
        ${nrows.map((n, i) => {
          const nc    = NOTIF_COLORS[n.type] || defaultNC;
          const dt    = fmtDT(n.createdAt);
          const body  = (n.body||'').length > 90 ? n.body.slice(0,90)+'…' : n.body;
          const uname = n.user?.name || 'Participant';
          return `<div style="display:flex;align-items:flex-start;gap:10px;padding:9px 0;border-bottom:1px solid var(--border-color);animation:slideInLeft .2s ${.02+i*.03}s both">
            <div style="width:30px;height:30px;border-radius:8px;background:${nc.bg};color:${nc.color};display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">${nc.icon}</div>
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;flex-wrap:wrap">
                <span style="font-size:11px;font-weight:700;color:${nc.color};background:${nc.bg};padding:1px 7px;border-radius:10px">${n.type||'System'}</span>
                <span style="font-size:11px;font-weight:600;color:var(--text-secondary)">${uname}</span>
                ${!n.read ? '<span style="width:7px;height:7px;border-radius:50%;background:#5b34ff;display:inline-block"></span>' : ''}
              </div>
              <div style="font-size:12.5px;font-weight:600;color:var(--text-primary);margin-bottom:2px">${n.title||'Notification'}</div>
              ${body ? `<div style="font-size:11.5px;color:var(--text-secondary);line-height:1.4;margin-bottom:3px">${body}</div>` : ''}
              <div style="font-size:10.5px;color:var(--muted)">${dt}</div>
            </div>
          </div>`;
        }).join('')}
      </div></div>`;
    })() : ''}

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
      <div style="display:flex;gap:8px;align-items:center;">
        <a class="admin-export-csv-btn" href="/api/admin/meetings/${meeting.id}/export.csv" download
           title="Download Q&amp;A as CSV">
          ${IC.download || '⬇'} Export CSV
        </a>
        <button class="dp-action-btn" onclick="openMessageParticipants('${meeting.id}','${meeting.title.replace(/'/g, "\\'")}')">${IC.mail} Message participants</button>
        <button class="danger-btn" onclick="openDeleteModal('${meeting.id}')">${IC.trash} Delete</button>
      </div>
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
  state.selectedMeetingId = id || null;
  state.meetingContextMenu = null;
  state.meetingDetailTab = 'questions';
  _detail = null;
  const el = document.getElementById('admin-content-area');
  if (el) el.innerHTML = renderMeetings();
  // Load detail in background only for a real id
  if (id) {
    loadMeetingDetail(id).then(() => {
      const el2 = document.getElementById('admin-content-area');
      if (el2 && state.selectedMeetingId === id) el2.innerHTML = renderMeetings();
    });
  }
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
  // Lazily load message history the first time the Messages tab is opened
  if (tab === 'messages' && state.selectedMeetingId && !_detail?.meetingMessages) {
    loadMeetingMessages(state.selectedMeetingId);
  }
  // Lazily load participant notifications the first time the Notifications tab is opened
  if (tab === 'notifications' && state.selectedMeetingId && !_detail?.meetingNotifications) {
    loadMeetingNotifications(state.selectedMeetingId);
  }
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
    window.adminToast?.(err.message, 'error');
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
    window.adminToast?.(err.message, 'error');
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

/* ── Quick Message Participants ── */
window.openMessageParticipants = function(meetingId, meetingTitle) {
  // Use the participant count from already-loaded detail data if available;
  // fall back to the count on the meeting list row (participantsCount).
  const count = _detail?.participants?.length
    ?? _meetings?.find(m => m.id === meetingId)?.participantsCount
    ?? null;

  openQuickMessageModal({
    audienceLabel:  `To: all participants of ${meetingTitle}`,
    recipientCount: count,
    onSend: async ({ subject, body }) => {
      await adminPost('/api/admin/messages', { audience: 'meeting_participants', meetingId, subject, body });
      closeQuickMessageModal();
      if (window.adminToast) window.adminToast(`Message sent to ${meetingTitle} participants`);
    }
  });
};
