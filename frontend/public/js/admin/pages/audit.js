/* Audit Log Page — connected to real backend */
import { IC } from '../icons.js';
import { adminGet } from '../api.js';
import { state } from '../state.js';
import { colorForInit, textColorForInit } from '../utils.js';

let _logs = null;
let _total = 0;
let _offset = 0;
const _limit = 25;
let _auditExpandedRow = null;
let _filterAction = '';
let _filterTarget = '';

function auditActionBadge(action, type) {
  const colors = {
    danger:  { bg: '#fde8e8', color: '#c0392b' },
    warning: { bg: '#fff0db', color: '#d97706' },
    info:    { bg: '#e0eaff', color: '#2966e8' },
    success: { bg: '#d6f5e8', color: '#1a9c5a' },
  };
  const c = colors[type] || colors.info;
  return `<span class="audit-action-badge" style="background:${c.bg};color:${c.color}">${action}</span>`;
}

function initials(name) {
  if (!name) return '?';
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
}

function fmtTs(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

export async function loadAuditData() {
  try {
    const params = new URLSearchParams({ limit: _limit, offset: _offset });
    if (_filterAction) params.set('action', _filterAction);
    if (_filterTarget) params.set('targetType', _filterTarget);
    const data = await adminGet(`/api/admin/audit?${params}`);
    _logs  = data.logs  || [];
    _total = data.total || 0;
  } catch (err) {
    console.error('[Audit] load error:', err.message);
    _logs = [];
    _total = 0;
  }
}

export function renderAuditLog() {
  if (!_logs) {
    loadAuditData().then(() => {
      const el = document.getElementById('admin-content-area');
      if (el && state.currentPage === 'audit') el.innerHTML = renderAuditLog();
    });
    return `<div class="page active" id="page-audit"><div class="page-loading">Loading audit log…</div></div>`;
  }

  const totalPages = Math.ceil(_total / _limit);
  const currentPage = Math.floor(_offset / _limit) + 1;

  const tableRows = _logs.map((row, idx) => {
    const isExpanded = _auditExpandedRow === idx;
    const adminInit  = initials(row.adminName);
    const detailJson = JSON.stringify(row.detail || {}, null, 2);
    return `
    <tr class="dt-row ${isExpanded ? 'dt-row-selected' : ''}" onclick="toggleAuditRow(${idx})">
      <td class="dt-td audit-ts">${fmtTs(row.ts)}</td>
      <td class="dt-td">
        <div style="display:flex;align-items:center;gap:8px">
          <div class="tbl-avatar" style="background:${colorForInit(adminInit)};color:${textColorForInit(adminInit)}">${adminInit}</div>
          <div>
            <div style="font-weight:600;font-size:13px">${row.adminName}</div>
            <div style="font-size:11px;color:var(--muted)">(${row.adminRole})</div>
          </div>
        </div>
      </td>
      <td class="dt-td">${auditActionBadge(row.action, row.actionType)}</td>
      <td class="dt-td" style="color:var(--ink-secondary);font-size:13px">${row.targetType}</td>
      <td class="dt-td">
        <div style="font-size:13px;font-weight:600;color:var(--primary);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${row.targetName}</div>
        <div style="font-size:11px;color:var(--muted)">${row.targetId}</div>
      </td>
      <td class="dt-td">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:12px;font-weight:600;color:var(--primary);cursor:pointer">view</span>
          <span style="color:var(--muted);font-size:14px">${isExpanded ? '∧' : '∨'}</span>
        </div>
      </td>
    </tr>
    ${isExpanded ? `<tr class="audit-detail-row">
      <td colspan="6">
        <div class="audit-json-wrap">
          <pre class="audit-json">${detailJson}</pre>
          <button class="audit-copy-btn" onclick="event.stopPropagation();navigator.clipboard.writeText(${JSON.stringify(detailJson)})" title="Copy JSON">${IC.copy}</button>
        </div>
        ${row.ipAddress ? `<div style="padding:4px 16px 8px;font-size:11px;color:var(--muted)">IP: ${row.ipAddress}</div>` : ''}
      </td>
    </tr>` : ''}`;
  }).join('');

  const pageBtn = (label, page, disabled = false) =>
    `<button class="pg-btn ${disabled?'':''}${page===currentPage?'active':''}" ${disabled?'disabled':''} onclick="auditGoPage(${page})">${label}</button>`;

  return `
    <div class="page active" id="page-audit">
      <div class="page-header page-header-row">
        <div>
          <h1 class="page-title">Audit Log <span class="page-count">${_total.toLocaleString()} records</span></h1>
        </div>
        <button class="refresh-btn" onclick="refreshAudit()">${IC.refresh} Refresh</button>
      </div>

      <div class="audit-filters">
        <div class="audit-filter-group">
          <div class="audit-filter-label">Action type</div>
          <div class="filter-group" style="height:34px">
            <div class="filter-select-wrap">
              <select class="filter-select" onchange="auditFilterAction(this.value)">
                <option value="">All actions</option>
                <option value="user.role_update"           ${_filterAction==='user.role_update'?'selected':''}>user.role_update</option>
                <option value="user.delete"                ${_filterAction==='user.delete'?'selected':''}>user.delete</option>
                <option value="meeting.delete"             ${_filterAction==='meeting.delete'?'selected':''}>meeting.delete</option>
                <option value="meeting.force_status_change"${_filterAction==='meeting.force_status_change'?'selected':''}>meeting.force_status_change</option>
                <option value="question.delete"            ${_filterAction==='question.delete'?'selected':''}>question.delete</option>
                <option value="system.config_update"       ${_filterAction==='system.config_update'?'selected':''}>system.config_update</option>
              </select>${IC.chevronDown}
            </div>
          </div>
        </div>
        <div class="audit-filter-group">
          <div class="audit-filter-label">Target type</div>
          <div class="filter-group" style="height:34px">
            <div class="filter-select-wrap">
              <select class="filter-select" onchange="auditFilterTarget(this.value)">
                <option value="">All target types</option>
                <option value="User"        ${_filterTarget==='User'?'selected':''}>User</option>
                <option value="Meeting"     ${_filterTarget==='Meeting'?'selected':''}>Meeting</option>
                <option value="Question"    ${_filterTarget==='Question'?'selected':''}>Question</option>
                <option value="SystemConfig"${_filterTarget==='SystemConfig'?'selected':''}>SystemConfig</option>
              </select>${IC.chevronDown}
            </div>
          </div>
        </div>
        <button class="clear-filters-btn" onclick="auditClearFilters()">Clear filters</button>
      </div>

      <div class="dt-layout" style="flex:1;min-height:0">
        <div class="dt-table-wrap">
          ${_logs.length === 0 ? `
            <div style="padding:40px;text-align:center;color:var(--muted)">
              No audit log entries found${_filterAction || _filterTarget ? ' for the selected filters' : ''}.
            </div>` : `
          <table class="dt-table">
            <thead><tr>
              <th class="dt-th">Timestamp <span style="font-size:10px">↕</span></th>
              <th class="dt-th">Admin Name</th>
              <th class="dt-th">Action</th>
              <th class="dt-th">Target Type</th>
              <th class="dt-th">Target</th>
              <th class="dt-th">Details</th>
            </tr></thead>
            <tbody>${tableRows}</tbody>
          </table>`}
          <div class="dt-footer">
            <div class="dt-showing">Showing ${_offset + 1}–${Math.min(_offset + _limit, _total)} of ${_total.toLocaleString()} records</div>
            <div class="pagination-row">
              <div class="pagination">
                ${pageBtn(IC.chevronLeft, currentPage - 1, currentPage <= 1)}
                ${Array.from({ length: Math.min(totalPages, 5) }, (_, i) => pageBtn(i + 1, i + 1)).join('')}
                ${totalPages > 5 ? `<span class="pg-ellipsis">…</span>${pageBtn(totalPages, totalPages)}` : ''}
                ${pageBtn(IC.chevronRight, currentPage + 1, currentPage >= totalPages)}
              </div>
              <div class="per-page-wrap">
                <select class="filter-select"><option>25 per page</option></select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

/* ── Audit Actions ── */
window.toggleAuditRow = function(idx) {
  _auditExpandedRow = _auditExpandedRow === idx ? null : idx;
  const el = document.getElementById('admin-content-area');
  if (el) el.innerHTML = renderAuditLog();
};
window.refreshAudit = function() {
  _logs = null;
  const el = document.getElementById('admin-content-area');
  if (el) el.innerHTML = renderAuditLog();
};
window.auditGoPage = function(page) {
  const totalPages = Math.ceil(_total / _limit);
  if (page < 1 || page > totalPages) return;
  _offset = (page - 1) * _limit;
  _logs = null;
  const el = document.getElementById('admin-content-area');
  if (el) el.innerHTML = renderAuditLog();
};
window.auditFilterAction = function(val) {
  _filterAction = val;
  _offset = 0;
  _logs = null;
  const el = document.getElementById('admin-content-area');
  if (el) el.innerHTML = renderAuditLog();
};
window.auditFilterTarget = function(val) {
  _filterTarget = val;
  _offset = 0;
  _logs = null;
  const el = document.getElementById('admin-content-area');
  if (el) el.innerHTML = renderAuditLog();
};
window.auditClearFilters = function() {
  _filterAction = ''; _filterTarget = ''; _offset = 0; _logs = null;
  const el = document.getElementById('admin-content-area');
  if (el) el.innerHTML = renderAuditLog();
};
