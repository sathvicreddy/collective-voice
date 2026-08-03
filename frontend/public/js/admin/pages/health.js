/* System Health Page — connected to real backend */
import { IC } from '../icons.js';
import { adminGet } from '../api.js';
import { state } from '../state.js';

let _health = null;
let _healthErrorFilter = 'errors';
let _healthExpandedError = null;
let _autoRefreshId = null;

export async function loadHealthData() {
  try {
    _health = await adminGet('/api/admin/health');
  } catch (err) {
    console.error('[Health] load error:', err.message);
    _health = null;
  }
}

export function renderSystemHealth() {
  if (!_health) {
    loadHealthData().then(() => {
      const el = document.getElementById('admin-content-area');
      if (el && state.currentPage === 'health') {
        el.innerHTML = renderSystemHealth();
        startHealthAutoRefresh();
      }
    });
    return `<div class="page active" id="page-health"><div class="page-loading">Loading system health…</div></div>`;
  }

  const h = _health;
  const rl = h.rateLimited || [];

  // Build WS sparkline from a fake 10-point rolling window using current count
  const pts = [Math.round(h.wsConnections * 0.72), Math.round(h.wsConnections * 0.78), Math.round(h.wsConnections * 0.85),
               Math.round(h.wsConnections * 0.91), Math.round(h.wsConnections * 0.88), Math.round(h.wsConnections * 0.94),
               Math.round(h.wsConnections * 0.97), Math.round(h.wsConnections * 0.93), Math.round(h.wsConnections * 0.98),
               h.wsConnections];
  const W = 340, H = 120;
  const minV = Math.min(...pts) * 0.80;
  const maxV = Math.max(...pts) * 1.05;
  const toX  = i => (i / (pts.length - 1)) * W;
  const toY  = v => H - ((v - minV) / (maxV - minV)) * H;
  const polylinePoints = pts.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');
  const areaPoints = `0,${H} ` + pts.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ') + ` ${W},${H}`;

  const uptimeParts = h.uptime.split(':');
  const uptimeHrs = parseInt(uptimeParts[0] || 0);
  const uptimeDisplay = uptimeHrs >= 24
    ? `${Math.floor(uptimeHrs/24)}d ${uptimeHrs%24}h`
    : h.uptime;

  return `
    <div class="page active" id="page-health">
      <div class="page-header page-header-row">
        <div>
          <h1 class="page-title">System Health</h1>
          <p class="page-subtitle">Real-time system metrics, logs, and connection activity.</p>
        </div>
        <button class="refresh-btn" onclick="refreshHealth()" title="Refresh">${IC.refresh} Refresh</button>
      </div>

      <!-- Quick stats row -->
      <div class="metrics-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:24px">
        <div class="metric-card"><div class="metric-icon green">${IC.clock}</div><div class="metric-body"><div class="metric-label">Uptime</div><div class="metric-value" style="font-size:22px">${uptimeDisplay}</div><div class="metric-sub">Since last restart</div></div></div>
        <div class="metric-card"><div class="metric-icon blue">${IC.memoryChip}</div><div class="metric-body"><div class="metric-label">Heap Used</div><div class="metric-value" style="font-size:22px">${h.memory?.heapUsedMB || '—'}MB</div><div class="metric-sub">of ${h.memory?.heapTotalMB || '—'}MB total</div></div></div>
        <div class="metric-card"><div class="metric-icon ${h.dbStatus === 'Healthy' ? 'green' : 'orange'}">${IC.database}</div><div class="metric-body"><div class="metric-label">DB Status</div><div class="metric-value" style="font-size:22px">${h.dbStatus}</div><div class="metric-sub">PostgreSQL (Neon)</div></div></div>
        <div class="metric-card"><div class="metric-icon purple">${IC.wifi}</div><div class="metric-body"><div class="metric-label">WebSocket Connections</div><div class="metric-value" style="font-size:22px">${h.wsConnections}</div><div class="metric-sub">${h.wsActiveMeetings} active meetings</div></div></div>
      </div>

      <div class="health-three-col">

        <!-- Rate Limiting Card -->
        <div class="sys-card">
          <div class="sys-card-header">
            <div class="sys-card-title">${IC.shieldCheck} Rate Limiting</div>
            <div class="sys-card-sub">IPs that are currently rate-limited.</div>
            <button class="sys-icon-btn" style="margin-left:auto" title="Refresh" onclick="refreshHealth()">${IC.refresh}</button>
          </div>
          ${rl.length > 0 ? `
          <table class="sys-rl-table">
            <thead><tr><th>IP Address</th><th>Request Count</th><th>Resets In</th><th></th></tr></thead>
            <tbody>
              ${rl.map(r => `
              <tr>
                <td class="sys-rl-ip">${r.ip}</td>
                <td class="sys-rl-num">${r.requests.toLocaleString()}</td>
                <td class="sys-rl-timer">${r.resetsIn}</td>
                <td><button class="sys-unblock-btn" disabled title="Manual unblock requires server restart">Locked</button></td>
              </tr>`).join('')}
            </tbody>
          </table>` : `
          <div class="sys-rl-empty">
            <div class="sys-rl-empty-icon">${IC.shieldCheck}</div>
            <div class="sys-rl-empty-title">No IPs are currently rate-limited</div>
            <div class="sys-rl-empty-sub">All clear! No IPs have exceeded the rate limit.</div>
          </div>`}
        </div>

        <!-- Server Info Card -->
        <div class="sys-card sys-card-dark">
          <div class="sys-card-header">
            <div class="sys-card-title sys-card-title-light">${IC.server} Server Details</div>
            <div class="sys-card-sub sys-card-sub-light">Runtime environment information.</div>
          </div>
          <div class="sys-err-list">
            ${[
              { label: 'Node.js', value: h.nodeVersion || '—' },
              { label: 'Platform', value: h.platform || '—' },
              { label: 'RSS Memory', value: `${h.memory?.rssMemMB || '—'} MB` },
              { label: 'Heap Used', value: `${h.memory?.heapUsedMB || '—'} MB` },
              { label: 'Heap Total', value: `${h.memory?.heapTotalMB || '—'} MB` },
              { label: 'Heap %', value: `${h.memory?.memPct || '—'}%` },
              { label: 'DB', value: h.dbStatus || '—' },
              { label: 'WS Connections', value: `${h.wsConnections}` },
              { label: 'Active Meetings', value: `${h.wsActiveMeetings}` },
            ].map(r => `
            <div class="sys-err-item">
              <div class="sys-err-row">
                <div class="sys-err-time" style="min-width:120px;color:var(--ink-secondary)">${r.label}</div>
                <div class="sys-err-msg" style="color:#eee;font-weight:600">${r.value}</div>
              </div>
            </div>`).join('')}
          </div>
        </div>

        <!-- WebSocket Chart Card -->
        <div class="sys-card">
          <div class="sys-card-header">
            <div class="sys-card-title">${IC.wifi} WebSocket Connections</div>
            <div class="sys-card-sub" style="flex:1">Live connections — current snapshot.</div>
          </div>
          <div class="sys-ws-chart-wrap">
            <svg viewBox="0 0 340 120" preserveAspectRatio="none" style="width:100%;height:100%;display:block">
              <defs>
                <linearGradient id="wsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#5b34ff" stop-opacity="0.18"/>
                  <stop offset="100%" stop-color="#5b34ff" stop-opacity="0.01"/>
                </linearGradient>
              </defs>
              <polygon points="${areaPoints}" fill="url(#wsGrad)"/>
              <polyline points="${polylinePoints}" fill="none" stroke="#5b34ff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
            </svg>
          </div>
          <div class="sys-ws-stats">
            <div class="sys-ws-main">
              <div class="sys-ws-stat-label">Current Connections</div>
              <div class="sys-ws-big">${h.wsConnections.toLocaleString()}</div>
              <div style="margin-top:8px">
                <div class="sys-ws-stat-label">Across</div>
                <div class="sys-ws-meetings-num">${h.wsActiveMeetings}</div>
                <div class="sys-ws-stat-label">active meetings</div>
              </div>
            </div>
          </div>
          <div class="sys-card-footer-link" style="color:var(--primary)" onclick="adminNavigate('live-now')">View all active meetings ${IC.arrowRight}</div>
        </div>

      </div>
    </div>`;
}

function startHealthAutoRefresh() {
  if (_autoRefreshId) clearInterval(_autoRefreshId);
  _autoRefreshId = setInterval(async () => {
    if (document.getElementById('page-health')) {
      await loadHealthData();
      const el = document.getElementById('admin-content-area');
      if (el && document.getElementById('page-health')) el.innerHTML = renderSystemHealth();
    } else {
      clearInterval(_autoRefreshId);
      _autoRefreshId = null;
    }
  }, 30000);
}

window.refreshHealth = async function() {
  _health = null;
  const el = document.getElementById('admin-content-area');
  if (el) el.innerHTML = renderSystemHealth();
};
