/* Content Moderation Page — connected to real backend */
import { IC } from '../icons.js';
import { adminGet, adminDelete, adminPatch } from '../api.js';

let _questions = null;
let _counts = { total: 0, flagged: 0, answered: 0 };
let _modTab = 'flagged';
let _banPopup = null;

function modStatusBadge(status) {
  const map = {
    Flagged:        '<span class="mod-badge flagged">FLAGGED</span>',
    Pending:        '<span class="mod-badge pending">PENDING</span>',
    Answered:       '<span class="mod-badge resolved">ANSWERED</span>',
    Under_Review:   '<span class="mod-badge pending">UNDER REVIEW</span>',
  };
  return map[status] || `<span class="mod-badge pending">${status?.toUpperCase() || ''}</span>`;
}

export async function loadModerationData() {
  try {
    const data = await adminGet(`/api/admin/questions/flagged?tab=${_modTab}`);
    _questions = data.questions || [];
    _counts = data.counts || _counts;
  } catch (err) {
    console.error('[Moderation] load error:', err.message);
    _questions = [];
  }
}

export function renderContentModeration() {
  if (!_questions) {
    loadModerationData().then(() => {
      const el = document.getElementById('admin-content-area');
      if (el) el.innerHTML = renderContentModeration();
    });
    return `<div class="page active" id="page-moderation"><div class="page-loading">Loading flagged content…</div></div>`;
  }

  const tabs = [
    { id: 'flagged',  label: 'Flagged',      count: _counts.flagged   },
    { id: 'all',      label: 'All Statuses',  count: _counts.total     },
    { id: 'answered', label: 'Answered',      count: _counts.answered  },
  ];

  const tabsHtml = tabs.map(t => `
    <button class="mod-tab ${_modTab===t.id?'active':''}" onclick="setModTab('${t.id}')">
      ${t.label} <span class="mod-tab-count">${t.count}</span>
    </button>`).join('');

  const itemsHtml = _questions.map(item => {
    const banHtml = (_banPopup === item.id) ? `
      <div class="ban-popup">
        <div class="ban-popup-title">Ban submitter?</div>
        <div class="ban-popup-body">This will prevent this user from participating across all meetings.</div>
        <div class="ban-popup-actions">
          <button class="ban-cancel-btn" onclick="setBanPopup(null)">Cancel</button>
          <button class="ban-confirm-btn" onclick="confirmBanUser('${item.id}')">Ban User</button>
        </div>
      </div>` : '';

    const ago = (() => {
      const diff = Date.now() - new Date(item.createdAt).getTime();
      const m = Math.floor(diff / 60000);
      if (m < 1) return 'just now';
      if (m < 60) return `${m}m ago`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}h ago`;
      return `${Math.floor(h/24)}d ago`;
    })();

    return `
      <div class="mod-item">
        <div class="mod-item-header">
          <div class="mod-item-meta">
            <span class="mod-meeting-link">${item.meetingTitle || 'Unknown Meeting'} ${IC.externalLink}</span>
            <span class="mod-dot">·</span>
            <span class="mod-time">${ago}</span>
          </div>
          ${modStatusBadge(item.status)}
        </div>
        <div class="mod-question-text">${item.text}</div>
        <div class="mod-asker-row">
          Asked by <span class="mod-asker-name">${item.askedByName || 'Anonymous'}</span>
          <span class="mod-dot">·</span>
          represents ${item.similar} similar question${item.similar !== 1 ? 's' : ''}
          · ${item.votes} vote${item.votes !== 1 ? 's' : ''}
        </div>
        <div class="mod-actions-row">
          <button class="mod-action-btn dismiss" onclick="dismissFlag('${item.id}')">Dismiss Flag</button>
          <button class="mod-action-btn delete" onclick="deleteQuestion('${item.id}')">Delete Question</button>
          <div class="mod-ban-wrap" style="position:relative">
            <button class="mod-action-btn ban" onclick="setBanPopup(${_banPopup===item.id?'null':"'"+item.id+"'"});event.stopPropagation()">${IC.userMinus} Ban Submitter</button>
            ${banHtml}
          </div>
        </div>
      </div>`;
  }).join('');

  const emptyHtml = `
    <div class="mod-empty">
      <div class="mod-empty-icon">
        <svg viewBox="0 0 80 60" fill="none" xmlns="http://www.w3.org/2000/svg" width="90" height="68">
          <rect x="8" y="12" width="44" height="36" rx="4" fill="#ede9ff" stroke="#5b34ff" stroke-width="1.5"/>
          <rect x="18" y="4" width="44" height="36" rx="4" fill="#e0eaff" stroke="#2966e8" stroke-width="1.5"/>
          <circle cx="62" cy="44" r="14" fill="#d6f5e8" stroke="#24b86f" stroke-width="1.5"/>
          <polyline points="56,44 60,48 68,40" stroke="#24b86f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="mod-empty-title">No flagged content right now</div>
      <div class="mod-empty-sub">Great job! There are no flagged questions to review.</div>
    </div>`;

  return `
    <div class="page active" id="page-moderation">
      <div class="page-header page-header-row">
        <div><h1 class="page-title">Content Moderation</h1></div>
        <button class="refresh-btn" onclick="refreshModeration()">${IC.refresh} Refresh</button>
      </div>
      <div class="mod-tabs">${tabsHtml}</div>
      <div class="mod-list">
        ${_questions.length ? itemsHtml : emptyHtml}
      </div>
    </div>`;
}

/* ── Actions ── */
window.setModTab = function(tab) {
  _modTab = tab;
  _questions = null;
  const el = document.getElementById('admin-content-area');
  if (el) el.innerHTML = renderContentModeration();
};
window.refreshModeration = function() {
  _questions = null;
  const el = document.getElementById('admin-content-area');
  if (el) el.innerHTML = renderContentModeration();
};
window.setBanPopup = function(id) {
  _banPopup = id === null ? null : id;
  const el = document.getElementById('admin-content-area');
  if (el) el.innerHTML = renderContentModeration();
};
window.dismissFlag = async function(id) {
  try {
    await adminPatch(`/api/admin/questions/${id}/flag`, {});
    _questions = null;
    await loadModerationData();
    const el = document.getElementById('admin-content-area');
    if (el) el.innerHTML = renderContentModeration();
  } catch (err) {
    alert('Error: ' + err.message);
  }
};
window.deleteQuestion = async function(id) {
  if (!confirm('Delete this question permanently?')) return;
  try {
    await adminDelete(`/api/admin/questions/${id}`);
    _questions = null;
    await loadModerationData();
    const el = document.getElementById('admin-content-area');
    if (el) el.innerHTML = renderContentModeration();
  } catch (err) {
    alert('Error: ' + err.message);
  }
};
window.confirmBanUser = function(questionId) {
  // For now, just dismiss the flag; full user suspension requires a dedicated endpoint
  window.dismissFlag(questionId);
  _banPopup = null;
};
