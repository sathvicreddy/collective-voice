import { IC } from '../icons.js';
import { state } from '../state.js';

let usersList = [];
let isLoading = true;
let errorMsg = '';

// Load users on mount
export async function loadUsers() {
  const token = localStorage.getItem('cv_token');
  try {
    const res = await fetch('/api/admin/users', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to load users');
    const data = await res.json();
    usersList = data.users;
    errorMsg = '';
  } catch (err) {
    errorMsg = err.message;
  } finally {
    isLoading = false;
    // Re-render the view
    const content = document.getElementById('admin-content-area');
    if (content && state.currentPage === 'manage-admins') {
      content.innerHTML = renderManageAdmins();
    }
  }
}

// Change role
window.changeUserRole = async function(userId, newRole) {
  if (!confirm(`Are you sure you want to make this user an ${newRole}?`)) return;
  
  const token = localStorage.getItem('cv_token');
  try {
    const res = await fetch(`/api/admin/users/${userId}/role`, {
      method: 'PATCH',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ role: newRole })
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to update role');
    }
    
    // Update local state
    const user = usersList.find(u => u.id === userId);
    if (user) user.role = newRole;
    
    // Re-render
    const content = document.getElementById('admin-content-area');
    if (content && state.currentPage === 'manage-admins') {
      content.innerHTML = renderManageAdmins();
    }
  } catch (err) {
    alert(err.message);
  }
};

export function renderManageAdmins() {
  if (!state.isSuperadmin) {
    return `<div class="p-8 text-center text-[var(--text-secondary)]">Only superadmins can manage admins.</div>`;
  }

  // Trigger load if not loaded yet
  if (isLoading && usersList.length === 0) {
    loadUsers();
    return `
      <div class="page-header">
        <div>
          <h2>Manage Admins</h2>
          <p class="text-[var(--text-secondary)] mt-1">Promote or demote users to admin roles.</p>
        </div>
      </div>
      <div class="p-8 text-center text-[var(--text-secondary)]">Loading users...</div>
    `;
  }

  if (errorMsg) {
    return `
      <div class="page-header"><h2>Manage Admins</h2></div>
      <div class="p-8 text-center text-[var(--semantic-error)]">${errorMsg}</div>
    `;
  }

  const rows = usersList.map(u => {
    // Determine possible actions
    let actionsHtml = '';
    if (u.role === 'superadmin') {
      actionsHtml = `<span class="text-[var(--text-tertiary)]">Superadmin</span>`;
    } else if (u.id === state.currentUser.id) {
      actionsHtml = `<span class="text-[var(--text-tertiary)]">It's you</span>`;
    } else if (u.role === 'admin') {
      actionsHtml = `<button class="btn btn-secondary btn-sm" onclick="changeUserRole('${u.id}', 'customer')">Demote to Customer</button>`;
    } else {
      actionsHtml = `<button class="btn btn-primary btn-sm" onclick="changeUserRole('${u.id}', 'admin')">Promote to Admin</button>`;
    }

    const badgeClass = u.role === 'superadmin' ? 'badge-primary' : (u.role === 'admin' ? 'badge-info' : 'badge-neutral');
    
    return `
      <div class="card p-4 flex items-center justify-between" style="margin-bottom:0.5rem; border:1px solid var(--border)">
        <div class="flex items-center gap-4">
          <div style="width:40px;height:40px;border-radius:50%;background:var(--surface-3);display:grid;place-items:center;font-weight:600;color:var(--text-secondary)">
            ${u.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style="font-weight:600">${u.name}</div>
            <div style="font-size:0.875rem;color:var(--text-secondary)">${u.email}</div>
          </div>
        </div>
        <div class="flex items-center gap-6">
          <span class="badge ${badgeClass}">${u.role}</span>
          <div style="width:160px; text-align:right">
            ${actionsHtml}
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="page-header">
      <div>
        <h2>Manage Admins</h2>
        <p class="text-[var(--text-secondary)] mt-1">Promote or demote users to admin roles.</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" onclick="document.dispatchEvent(new CustomEvent('reload-admins'))">${IC.refreshCw} Refresh</button>
      </div>
    </div>
    
    <div class="manage-admins-list" style="margin-top:1.5rem">
      ${rows}
    </div>
  `;
}

// Listen for refresh
document.addEventListener('reload-admins', () => {
  isLoading = true;
  loadUsers();
});
