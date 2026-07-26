/* Admin Panel Utilities */
import { IC } from './icons.js';

export function fmt(n) {
  if (n >= 1000) return (n/1000).toFixed(1).replace(/\.0$/,'')+'K';
  return String(n);
}

export function initials(name) {
  return name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
}

export function avatarStack(extra, colors=['#ede9ff','#e0eaff','#d6f5e8']) {
  let h = '<div class="participants-avatars">';
  for(let i=0;i<3;i++) h+=`<div class="pa-avatar" style="background:${colors[i%colors.length]}"></div>`;
  h+=`</div><span class="pa-more">+${extra}</span>`;
  return h;
}

export function qBars(p,r,a){
  const t=Math.max(p+r+a,1);
  return `<div class="question-bars"><div class="q-bar pending" style="flex:${p/t}"></div><div class="q-bar review" style="flex:${r/t}"></div><div class="q-bar answered" style="flex:${a/t}"></div></div>`;
}

export function qLegend(p,r,a){
  return `<div class="q-legend"><div class="q-legend-item"><div class="q-legend-dot" style="background:#ff8a2a"></div>${p} Pending</div><div class="q-legend-item"><div class="q-legend-dot" style="background:#5b34ff"></div>${r} Review</div><div class="q-legend-item"><div class="q-legend-dot" style="background:#24b86f"></div>${a} Answered</div></div>`;
}

export function statusBadge(status) {
  const map = {
    live:      '<span class="status-badge-pill live">● LIVE</span>',
    upcoming:  '<span class="status-badge-pill upcoming">UPCOMING</span>',
    conducted: '<span class="status-badge-pill conducted">CONDUCTED</span>',
    past:      '<span class="status-badge-pill past">PAST</span>',
  };
  return map[status] || status;
}

export function qStatusBadge(status) {
  const map = {
    pending:     '<span class="q-status-badge pending">PENDING</span>',
    under_review:'<span class="q-status-badge review">UNDER REVIEW</span>',
    answered:    '<span class="q-status-badge answered">ANSWERED</span>',
  };
  return map[status] || status;
}

export function roleBadge(role) {
  const map = {
    superadmin: '<span class="role-badge superadmin">Superadmin</span>',
    admin:      '<span class="role-badge admin">Admin</span>',
    user:       '<span class="role-badge user">User</span>',
  };
  return map[role] || role;
}

export function authMethod(auth) {
  if(auth==='google')   return `<span class="auth-method">${IC.google} Google</span>`;
  return `<span class="auth-method">${IC.lock} Password</span>`;
}

export function colorForInit(init) {
  const colors = ['#ede9ff','#e0eaff','#d6f5e8','#fff3e0','#fde8e8','#e0f7fa'];
  let h = 0; for(const c of init) h += c.charCodeAt(0);
  return colors[h % colors.length];
}

export function textColorForInit(init) {
  const colors = ['#5b34ff','#2966e8','#1a9c5a','#e07c00','#c0392b','#00838f'];
  let h = 0; for(const c of init) h += c.charCodeAt(0);
  return colors[h % colors.length];
}
