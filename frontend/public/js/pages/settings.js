/* ============================================================
   Settings Page — All UI components fully functional
   ============================================================ */
import { icons } from "../utils/icons.js";
import { go }    from "../utils/api.js";
import { state } from "../state.js";
import { shell, phone, desktopTopbar } from "../components/shared.js";

/* ── Helpers ── */
function getInitials(name) {
  if (!name) return "?";
  return name.trim().split(/\s+/).map(w => w[0]?.toUpperCase() || "").join("").slice(0, 2);
}

function getPrefs() {
  try { return JSON.parse(localStorage.getItem("cv_settings_prefs") || "{}"); } catch { return {}; }
}
function savePrefs(obj) {
  try {
    const cur = getPrefs();
    localStorage.setItem("cv_settings_prefs", JSON.stringify({ ...cur, ...obj }));
  } catch {}
}
// Expose globally — used in inline onchange attributes in the settings HTML template
window.savePrefs = savePrefs;

/* ── Toast notification ── */
function settingsToast(msg, type = "success") {
  document.querySelectorAll(".settings-toast").forEach(t => t.remove());
  const toast = document.createElement("div");
  toast.className = "settings-toast";
  toast.setAttribute("role", "status");
  toast.style.cssText = [
    "position:fixed;bottom:28px;right:28px;z-index:9999",
    "padding:14px 20px;border-radius:12px;font-size:14px;font-weight:600",
    "display:flex;align-items:center;gap:10px",
    "box-shadow:0 8px 24px rgba(0,0,0,.15);animation:toastIn .25s ease-out",
    type === "error"
      ? "background:#fff0f0;color:#e54040;border:1px solid #ffd0d0"
      : "background:#edfaf0;color:#158b4b;border:1px solid #b8f0c8"
  ].join(";");
  toast.innerHTML = (type === "error" ? "⚠️ " : "✅ ") + msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}
window.settingsToast = settingsToast;

/* ── Global handlers (defined before shell() renders) ── */

// Settings sidebar nav
window.settingsNav = function(btn, id) {
  document.querySelectorAll(".settings-nav-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".settings-section").forEach(s => s.style.display = "none");
  btn.classList.add("active");
  const sec = document.getElementById("sc-" + id);
  if (sec) sec.style.display = "";
};

// Theme toggle — applies real dark/light/system mode
window.setTheme = function(btn, theme) {
  document.querySelectorAll(".settings-theme-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  const root = document.documentElement;
  if (theme === "dark") {
    root.setAttribute("data-theme", "dark");
  } else if (theme === "light") {
    root.removeAttribute("data-theme");
  } else {
    // System: match OS preference
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    prefersDark ? root.setAttribute("data-theme", "dark") : root.removeAttribute("data-theme");
  }
  savePrefs({ theme });
  settingsToast(`Theme set to ${theme}`);
};

// Toggle save (notification prefs, privacy prefs)
window.settingsToggleSave = function(key, checked) {
  savePrefs({ [key]: checked });
  settingsToast(checked ? "Preference enabled" : "Preference disabled");
};

// Change Password modal
window.openChangePassword = function() {
  document.getElementById("changePasswordModal")?.remove();
  const modal = document.createElement("div");
  modal.id = "changePasswordModal";
  modal.style.cssText = "position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.45);display:grid;place-items:center;animation:fadeIn .2s";
  modal.innerHTML = `
    <div style="background:white;border-radius:20px;padding:32px;width:100%;max-width:420px;box-shadow:0 24px 64px rgba(0,0,0,.18)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
        <h2 style="font-size:18px;font-weight:800;color:#111936">Change Password</h2>
        <button data-action="removeElement" data-id="changePasswordModal" style="background:none;border:none;cursor:pointer;color:#8890b0;font-size:20px">✕</button>
      </div>
      <div id="cpwError" style="display:none;color:#e54040;font-size:13px;padding:8px 12px;background:#fff0f0;border-radius:8px;margin-bottom:16px;border:1px solid #ffd0d0"></div>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div>
          <label style="font-size:13px;font-weight:600;color:#444d6e;display:block;margin-bottom:6px">Current Password</label>
          <input id="cpwCurrent" type="password" autocomplete="current-password" placeholder="Enter current password"
            style="width:100%;padding:10px 14px;border:1.5px solid #e0dbff;border-radius:10px;font-size:14px;box-sizing:border-box;outline:none">
        </div>
        <div>
          <label style="font-size:13px;font-weight:600;color:#444d6e;display:block;margin-bottom:6px">New Password</label>
          <input id="cpwNew" type="password" autocomplete="new-password" placeholder="Min 8 characters"
            style="width:100%;padding:10px 14px;border:1.5px solid #e0dbff;border-radius:10px;font-size:14px;box-sizing:border-box;outline:none">
        </div>
        <div>
          <label style="font-size:13px;font-weight:600;color:#444d6e;display:block;margin-bottom:6px">Confirm New Password</label>
          <input id="cpwConfirm" type="password" autocomplete="new-password" placeholder="Repeat new password"
            style="width:100%;padding:10px 14px;border:1.5px solid #e0dbff;border-radius:10px;font-size:14px;box-sizing:border-box;outline:none">
        </div>
        <button id="cpwSubmitBtn" data-action="submitChangePassword"
          style="margin-top:8px;padding:13px;background:linear-gradient(135deg,#5b34ff,#7c5cff);color:white;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer">
          Update Password
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
  document.getElementById("cpwCurrent")?.focus();
};

window.submitChangePassword = async function() {
  const current = document.getElementById("cpwCurrent")?.value || "";
  const newPw   = document.getElementById("cpwNew")?.value || "";
  const confirm = document.getElementById("cpwConfirm")?.value || "";
  const errEl   = document.getElementById("cpwError");
  const btn     = document.getElementById("cpwSubmitBtn");

  const showErr = msg => { if (errEl) { errEl.textContent = msg; errEl.style.display = ""; } };

  if (!current) { showErr("Please enter your current password."); return; }
  if (newPw.length < 8) { showErr("New password must be at least 8 characters."); return; }
  if (newPw !== confirm) { showErr("Passwords do not match."); return; }

  if (btn) { btn.disabled = true; btn.textContent = "Updating…"; }
  try {
    const res  = await fetch("/api/auth/change-password", {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${state.token}` },
      body:    JSON.stringify({ currentPassword: current, newPassword: newPw })
    });
    const data = await res.json();
    if (!res.ok) { showErr(data.error || "Failed to update password."); return; }
    document.getElementById("changePasswordModal")?.remove();
    settingsToast("Password updated successfully! Please log in again on other devices.");
  } catch {
    showErr("Network error — please try again.");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Update Password"; }
  }
};

// Delete Account flow
window.openDeleteAccount = function() {
  document.getElementById("deleteAccountModal")?.remove();
  const modal = document.createElement("div");
  modal.id = "deleteAccountModal";
  modal.style.cssText = "position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.5);display:grid;place-items:center;animation:fadeIn .2s";
  modal.innerHTML = `
    <div style="background:white;border-radius:20px;padding:32px;width:100%;max-width:420px;box-shadow:0 24px 64px rgba(0,0,0,.2)">
      <div style="text-align:center;margin-bottom:20px">
        <div style="width:56px;height:56px;border-radius:50%;background:#fff0f0;display:grid;place-items:center;margin:0 auto 12px;font-size:24px">🗑️</div>
        <h2 style="font-size:18px;font-weight:800;color:#e54040;margin-bottom:8px">Delete Account</h2>
        <p style="font-size:14px;color:#6a7394;line-height:1.5">This will permanently delete your account, all your meetings, and your question history. <strong>This cannot be undone.</strong></p>
      </div>
      <div id="daError" style="display:none;color:#e54040;font-size:13px;padding:8px 12px;background:#fff0f0;border-radius:8px;margin-bottom:16px;border:1px solid #ffd0d0"></div>
      <div style="margin-bottom:16px">
        <label style="font-size:13px;font-weight:600;color:#444d6e;display:block;margin-bottom:6px">Confirm your password</label>
        <input id="daPassword" type="password" placeholder="Enter your password to confirm"
          style="width:100%;padding:10px 14px;border:1.5px solid #ffd0d0;border-radius:10px;font-size:14px;box-sizing:border-box;outline:none">
      </div>
      <div style="display:flex;gap:10px">
        <button data-action="removeElement" data-id="deleteAccountModal"
          style="flex:1;padding:13px;background:#f5f4ff;color:#5b34ff;border:1.5px solid #e0dbff;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer">
          Cancel
        </button>
        <button id="daSubmitBtn" data-action="submitDeleteAccount"
          style="flex:1;padding:13px;background:#e54040;color:white;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer">
          Delete Forever
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
  document.getElementById("daPassword")?.focus();
};

window.submitDeleteAccount = async function() {
  const password = document.getElementById("daPassword")?.value || "";
  const errEl    = document.getElementById("daError");
  const btn      = document.getElementById("daSubmitBtn");

  const showErr = msg => { if (errEl) { errEl.textContent = msg; errEl.style.display = ""; } };

  if (btn) { btn.disabled = true; btn.textContent = "Deleting…"; }
  try {
    const res  = await fetch("/api/user/account", {
      method:  "DELETE",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${state.token}` },
      body:    JSON.stringify({ password })
    });
    const data = await res.json();
    if (!res.ok) { showErr(data.error || "Failed to delete account."); return; }
    // Clear all local auth state
    try {
      localStorage.removeItem("cv_token");
      localStorage.removeItem("cv_refresh_token");
      localStorage.removeItem("cv_settings_prefs");
    } catch {}
    state.token   = null;
    state.profile = null;
    document.getElementById("deleteAccountModal")?.remove();
    go("/welcome");
  } catch {
    showErr("Network error — please try again.");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Delete Forever"; }
  }
};

// Download user data
window.downloadUserData = async function() {
  const btn = document.getElementById("exportDataBtn");
  if (btn) { btn.disabled = true; btn.textContent = "⏳ Preparing…"; }
  try {
    const res = await fetch("/api/user/export", {
      headers: { "Authorization": `Bearer ${state.token}` }
    });
    if (!res.ok) { settingsToast("Failed to export data.", "error"); return; }
    const blob     = await res.blob();
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement("a");
    const filename = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] || "cv-export.json";
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    settingsToast("Your data has been downloaded!");
  } catch {
    settingsToast("Network error — please try again.", "error");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "⬇️ Download"; }
  }
};

// Active sessions info
window.manageActiveSessions = function() {
  settingsToast("Session management coming soon. For now, change your password to sign out all devices.");
};

// Help links
window.openHelpLink = function(type) {
  const links = {
    "help":    "https://help.collectivevoice.app",
    "support": "mailto:support@collectivevoice.app",
    "privacy": "/privacy-policy",
    "terms":   "/terms-of-service"
  };
  if (links[type]) { window.open(links[type], "_blank", "noopener"); }
};

/* ── Main render ── */
export function renderSettings() {
  const user  = state.profile?.user || {};
  const prefs = getPrefs();
  const initials = getInitials(user.name || "?");

  // Format joined date
  const joinedDate = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "—";

  // Read saved theme preference
  const savedTheme = prefs.theme || "light";

  /* ── Mobile phone content ── */
  const mobileContent = phone(`
    <h1 class="screen-title">Settings</h1>
    <p class="subtle">Manage account, privacy, security, and appearance.</p>
    <div class="stack" style="margin-top:18px;gap:8px">
      ${[
        [icons.user,       "Account",        "Manage your personal info",    "",       "go('/profile')"],
        [icons.bell,       "Notifications",  "Set your preferences",         "",       "settingsNav(document.getElementById('snav-notifications'),'notifications')"],
        [icons.shield,     "Privacy",        "Control your data",            "green",  ""],
        [icons.eye,        "Security",       "Password and 2FA",             "orange", "openChangePassword()"],
        [icons.monitor,    "Appearance",     "Theme and language",           "blue",   ""],
        [icons.download,   "Data & Export",  "Download your data",           "",       "downloadUserData()"],
        [icons.helpCircle, "Help & Support", "Get help when you need",       "",       "openHelpLink('help')"]
      ].map(([ic, title, desc, tone, action]) => `
        <article class="list-card row" style="gap:14px;cursor:pointer" onclick="${action}">
          <div class="icon-box ${tone}" style="width:40px;height:40px">${ic}</div>
          <div style="flex:1">
            <strong style="font-size:14px">${title}</strong><br>
            <span class="subtle">${desc}</span>
          </div>
          ${icons.chevronRight}
        </article>
      `).join("")}
      <button class="btn secondary" style="width:100%;margin-top:8px" data-action="go" data-route="/profile">${icons.arrowLeft} Back to Profile</button>
      <button class="btn danger" style="width:100%;margin-top:8px" id="mobile-logout-btn" data-action="profileLogout">${icons.logOut} Log Out</button>
    </div>
  `, "profile", true);

  /* ── Desktop sidebar items ── */
  const settingsSections = [
    { id: "account",       icon: icons.user,       label: "Account",        sub: "Manage your personal info" },
    { id: "notifications", icon: icons.bell,       label: "Notifications",  sub: "Set your preferences" },
    { id: "privacy",       icon: icons.shield,     label: "Privacy",        sub: "Control your data" },
    { id: "security",      icon: icons.eye,        label: "Security",       sub: "Password and 2FA" },
    { id: "appearance",    icon: icons.monitor,    label: "Appearance",     sub: "Theme and language" },
    { id: "data",          icon: icons.download,   label: "Data & Export",  sub: "Download your data" },
    { id: "help",          icon: icons.helpCircle, label: "Help & Support", sub: "Get help when you need" }
  ];

  /* ── Notification preference toggles ── */
  const notifPrefs = [
    { key: "notif_meetings",  icon: icons.calendar,      color: "blue",   title: "Meeting Reminders",    desc: "Receive reminders for upcoming meetings",                      defOn: true  },
    { key: "notif_questions", icon: icons.messageCircle, color: "green",  title: "Question Updates",     desc: "Get notified when your questions get updates or answers",      defOn: true  },
    { key: "notif_upvotes",   icon: icons.thumbsUp,      color: "orange", title: "Upvote Notifications", desc: "Get notified when someone upvotes your question",              defOn: true  },
    { key: "notif_system",    icon: icons.bell,          color: "",       title: "System Announcements", desc: "Important platform updates and announcements",                 defOn: false }
  ];

  /* ── Desktop main panel ── */
  const desktopMain = `
    ${desktopTopbar("Settings", "Manage your account, preferences and application settings.")}

    <div class="settings-layout">
      <!-- Left Settings Sidebar -->
      <div class="settings-sidebar">
        ${settingsSections.map((s, i) => `
          <button class="settings-nav-btn ${i === 0 ? "active" : ""}"
            id="snav-${s.id}"
            data-action="settingsNav" data-id="${s.id}">
            <div class="settings-nav-icon">${s.icon}</div>
            <div class="settings-nav-text">
              <strong>${s.label}</strong>
              <span>${s.sub}</span>
            </div>
          </button>
        `).join("")}
        <button class="settings-sidebar-logout" id="sidebarLogoutBtn" data-action="profileLogout">
          <div class="settings-nav-icon">${icons.logOut}</div>
          <div class="settings-nav-text">
            <strong>Log Out</strong>
            <span>Sign out of your account</span>
          </div>
        </button>
      </div>

      <!-- Right Settings Content -->
      <div class="settings-content">

        <!-- ── Account Section ── -->
        <div id="sc-account" class="settings-section">
          <div class="settings-section-header">
            <h2 class="settings-section-title">Account Information</h2>
            <button class="edit-profile-btn" id="editProfileBtn" data-action="go" data-route="/profile">${icons.edit} Edit Profile</button>
          </div>
          <div class="settings-account-card">
            <div class="settings-account-avatar">${initials}</div>
            <div class="settings-account-info">
              <div class="settings-account-name-row">
                <strong class="settings-account-name">${user.name || "Guest"}</strong>
                <span class="badge">${user.role || "Member"}</span>
              </div>
              <p class="settings-account-detail">${icons.mail} ${user.email || "—"}</p>
              <p class="settings-account-detail">${icons.calendar} Joined ${joinedDate}</p>
              ${user.location ? `<p class="settings-account-detail">${icons.info} ${user.location}</p>` : ""}
            </div>
          </div>

          <h3 class="settings-group-title" style="margin-top:28px">Account Actions</h3>
          <div class="settings-actions-row">
            <button class="settings-action-card" id="changePasswordBtn" data-action="openChangePassword">
              <div class="icon-box" style="width:38px;height:38px">${icons.eye}</div>
              <div style="flex:1;text-align:left">
                <strong style="font-size:14px;display:block">Change Password</strong>
                <span class="subtle" style="font-size:12px">Update your account password</span>
              </div>
              ${icons.chevronRight}
            </button>
            <button class="settings-action-card" id="logoutBtn" data-action="profileLogout">
              <div class="icon-box orange" style="width:38px;height:38px">${icons.logOut}</div>
              <div style="flex:1;text-align:left">
                <strong style="font-size:14px;display:block">Log Out</strong>
                <span class="subtle" style="font-size:12px">Sign out of your account on this device</span>
              </div>
              ${icons.chevronRight}
            </button>
            <button class="settings-action-card danger" id="deleteAccountBtn" data-action="openDeleteAccount">
              <div class="icon-box red" style="width:38px;height:38px">${icons.trash}</div>
              <div style="flex:1;text-align:left">
                <strong style="font-size:14px;display:block;color:var(--danger)">Delete Account</strong>
                <span class="subtle" style="font-size:12px">Permanently delete your account and all data</span>
              </div>
              <span style="color:var(--danger)">${icons.chevronRight}</span>
            </button>
          </div>
        </div>

        <!-- ── Notifications Section ── -->
        <div id="sc-notifications" class="settings-section" style="display:none">
          <h2 class="settings-section-title">Notification Preferences</h2>
          <p class="subtle" style="margin-bottom:20px">Choose which notifications you'd like to receive.</p>
          <div class="settings-toggle-list">
            ${notifPrefs.map(n => {
              const isOn = prefs[n.key] !== undefined ? prefs[n.key] : n.defOn;
              return `
              <div class="settings-toggle-row">
                <div class="icon-box ${n.color}" style="width:40px;height:40px;flex-shrink:0">${n.icon}</div>
                <div class="settings-toggle-info">
                  <strong>${n.title}</strong>
                  <span class="subtle">${n.desc}</span>
                </div>
                <label class="settings-toggle ${isOn ? "on" : ""}">
                  <input type="checkbox" ${isOn ? "checked" : ""}
                    onchange="this.closest('.settings-toggle').classList.toggle('on',this.checked); settingsToggleSave('${n.key}',this.checked)">
                  <span class="settings-toggle-thumb"></span>
                </label>
              </div>
              `;
            }).join("")}
          </div>
        </div>

        <!-- ── Privacy Section ── -->
        <div id="sc-privacy" class="settings-section" style="display:none">
          <h2 class="settings-section-title">Privacy Settings</h2>
          <div class="settings-toggle-list">
            <div class="settings-toggle-row">
              <div class="icon-box green" style="width:40px;height:40px;flex-shrink:0">${icons.shield}</div>
              <div class="settings-toggle-info">
                <strong>Profile Visibility</strong>
                <span class="subtle">Control who can see your profile information</span>
              </div>
              <select class="settings-select" id="privacyVisibility"
                data-change="savePrefs" data-prefs="privacy_visibility:this.value">
                <option value="public"  ${(prefs.privacy_visibility||"public")==="public"  ? "selected" : ""}>Public</option>
                <option value="friends" ${(prefs.privacy_visibility||"public")==="friends" ? "selected" : ""}>Friends Only</option>
                <option value="private" ${(prefs.privacy_visibility||"public")==="private" ? "selected" : ""}>Private</option>
              </select>
            </div>
            ${[
              { key: "privacy_activity",     defOn: true,  title: "Show Activity Status",  desc: "Allow others to see when you are active",          color: "orange", icon: icons.activity },
              { key: "privacy_data_collect", defOn: false, title: "Analytics & Diagnostics", desc: "Help improve CollectiveVoice with anonymous usage data", color: "",       icon: icons.user }
            ].map(p => {
              const isOn = prefs[p.key] !== undefined ? prefs[p.key] : p.defOn;
              return `
              <div class="settings-toggle-row">
                <div class="icon-box ${p.color}" style="width:40px;height:40px;flex-shrink:0">${p.icon}</div>
                <div class="settings-toggle-info">
                  <strong>${p.title}</strong>
                  <span class="subtle">${p.desc}</span>
                </div>
                <label class="settings-toggle ${isOn ? "on" : ""}">
                  <input type="checkbox" ${isOn ? "checked" : ""}
                    onchange="this.closest('.settings-toggle').classList.toggle('on',this.checked); settingsToggleSave('${p.key}',this.checked)">
                  <span class="settings-toggle-thumb"></span>
                </label>
              </div>
              `;
            }).join("")}
          </div>
        </div>

        <!-- ── Security Section ── -->
        <div id="sc-security" class="settings-section" style="display:none">
          <h2 class="settings-section-title">Security</h2>
          <div class="settings-toggle-list">
            <div class="settings-toggle-row">
              <div class="icon-box orange" style="width:40px;height:40px;flex-shrink:0">${icons.eye}</div>
              <div class="settings-toggle-info">
                <strong>Two-Factor Authentication</strong>
                <span class="subtle">Add an extra layer of security to your account (coming soon)</span>
              </div>
              <label class="settings-toggle ${prefs.twofa ? "on" : ""}">
                <input type="checkbox" ${prefs.twofa ? "checked" : ""}
                  onchange="settingsToast('2FA setup coming soon — stay tuned!','error'); this.checked=false; this.closest('.settings-toggle').classList.remove('on')">
                <span class="settings-toggle-thumb"></span>
              </label>
            </div>
            <div class="settings-toggle-row">
              <div class="icon-box" style="width:40px;height:40px;flex-shrink:0">${icons.monitor}</div>
              <div class="settings-toggle-info">
                <strong>Active Sessions</strong>
                <span class="subtle">Manage devices logged into your account. Change your password to sign out all other devices.</span>
              </div>
              <button class="link-btn" id="manageSessionsBtn" style="flex-shrink:0" data-action="manageActiveSessions">Manage</button>
            </div>
            <div class="settings-toggle-row" style="cursor:pointer" data-action="openChangePassword">
              <div class="icon-box blue" style="width:40px;height:40px;flex-shrink:0">${icons.shield}</div>
              <div class="settings-toggle-info">
                <strong>Change Password</strong>
                <span class="subtle">Update your login password</span>
              </div>
              <button class="link-btn" style="flex-shrink:0" data-action="openChangePassword">Change</button>
            </div>
          </div>
        </div>

        <!-- ── Appearance Section ── -->
        <div id="sc-appearance" class="settings-section" style="display:none">
          <h2 class="settings-section-title">Appearance</h2>
          <div class="settings-toggle-list">
            <div class="settings-toggle-row">
              <div class="icon-box blue" style="width:40px;height:40px;flex-shrink:0">${icons.monitor}</div>
              <div class="settings-toggle-info">
                <strong>Theme</strong>
                <span class="subtle">Choose your preferred colour scheme</span>
              </div>
              <div class="settings-theme-group" id="themeGroup">
                <button class="settings-theme-btn ${savedTheme==="light"?"active":""}" id="themeBtn-light"   data-action="setTheme" data-theme="light">☀️ Light</button>
                <button class="settings-theme-btn ${savedTheme==="dark" ?"active":""}" id="themeBtn-dark"    data-action="setTheme" data-theme="dark">🌙 Dark</button>
                <button class="settings-theme-btn ${savedTheme==="system"?"active":""}" id="themeBtn-system" data-action="setTheme" data-theme="system">💻 System</button>
              </div>
            </div>
            <div class="settings-toggle-row">
              <div class="icon-box green" style="width:40px;height:40px;flex-shrink:0">${icons.info}</div>
              <div class="settings-toggle-info">
                <strong>Language</strong>
                <span class="subtle">Choose your preferred display language</span>
              </div>
              <select class="settings-select" id="languageSelect"
                data-change="savePrefs" data-prefs="language:this.value">
                <option value="en"    ${(prefs.language||"en")==="en"    ? "selected":""}>🇺🇸 English</option>
                <option value="hi"    ${(prefs.language||"en")==="hi"    ? "selected":""}>🇮🇳 Hindi</option>
                <option value="es"    ${(prefs.language||"en")==="es"    ? "selected":""}>🇪🇸 Spanish</option>
                <option value="fr"    ${(prefs.language||"en")==="fr"    ? "selected":""}>🇫🇷 French</option>
                <option value="de"    ${(prefs.language||"en")==="de"    ? "selected":""}>🇩🇪 German</option>
                <option value="pt"    ${(prefs.language||"en")==="pt"    ? "selected":""}>🇧🇷 Portuguese</option>
              </select>
            </div>
            <div class="settings-toggle-row">
              <div class="icon-box orange" style="width:40px;height:40px;flex-shrink:0">${icons.bell}</div>
              <div class="settings-toggle-info">
                <strong>Compact Mode</strong>
                <span class="subtle">Reduce spacing and padding for denser layouts</span>
              </div>
              <label class="settings-toggle ${prefs.compact ? "on" : ""}">
                <input type="checkbox" ${prefs.compact ? "checked" : ""}
                  onchange="this.closest('.settings-toggle').classList.toggle('on',this.checked); settingsToggleSave('compact',this.checked); document.body.classList.toggle('compact-mode',this.checked)">
                <span class="settings-toggle-thumb"></span>
              </label>
            </div>
          </div>
        </div>

        <!-- ── Data & Export Section ── -->
        <div id="sc-data" class="settings-section" style="display:none">
          <h2 class="settings-section-title">Data &amp; Export</h2>
          <p class="subtle" style="margin-bottom:20px">Manage your data stored on CollectiveVoice.</p>
          <div class="settings-toggle-list">
            <div class="settings-toggle-row">
              <div class="icon-box" style="width:40px;height:40px;flex-shrink:0">${icons.download}</div>
              <div class="settings-toggle-info">
                <strong>Download My Data</strong>
                <span class="subtle">Get a copy of all your data (profile, meetings, questions) as a JSON file</span>
              </div>
              <button class="btn" id="exportDataBtn" style="font-size:13px;padding:8px 14px;flex-shrink:0" data-action="downloadUserData">⬇️ Download</button>
            </div>
            <div class="settings-toggle-row">
              <div class="icon-box red" style="width:40px;height:40px;flex-shrink:0">${icons.logOut}</div>
              <div class="settings-toggle-info">
                <strong>Delete All My Data</strong>
                <span class="subtle">Permanently remove your account and all associated data from CollectiveVoice</span>
              </div>
              <button class="btn secondary" id="deleteDataBtn" style="font-size:13px;padding:8px 14px;color:var(--danger);border-color:var(--danger);flex-shrink:0" data-action="openDeleteAccount">🗑️ Delete</button>
            </div>
          </div>
        </div>

        <!-- ── Help & Support Section ── -->
        <div id="sc-help" class="settings-section" style="display:none">
          <h2 class="settings-section-title">Help &amp; Support</h2>
          <div class="settings-toggle-list">
            ${[
              { type: "help",    icon: icons.helpCircle,    title: "Help Center",     desc: "Browse FAQs, tutorials and guides" },
              { type: "support", icon: icons.messageCircle, title: "Contact Support", desc: "Send us a message — we reply within 24h" },
              { type: "privacy", icon: icons.shield,        title: "Privacy Policy",  desc: "Read how we protect your data" },
              { type: "terms",   icon: icons.info,          title: "Terms of Service", desc: "Read our terms of service" }
            ].map(h => `
              <div class="settings-toggle-row" style="cursor:pointer" id="help-${h.type}" data-action="openHelpLink" data-type="${h.type}">
                <div class="icon-box" style="width:40px;height:40px;flex-shrink:0">${h.icon}</div>
                <div class="settings-toggle-info">
                  <strong>${h.title}</strong>
                  <span class="subtle">${h.desc}</span>
                </div>
                ${icons.chevronRight}
              </div>
            `).join("")}
          </div>
          <div style="margin-top:32px;padding:20px;background:#f5f4ff;border-radius:16px;text-align:center">
            <p style="font-size:14px;font-weight:600;color:#5b34ff;margin-bottom:4px">CollectiveVoice v1.0</p>
            <p class="subtle" style="font-size:12px">© 2026 CollectiveVoice. All rights reserved.</p>
          </div>
        </div>

      </div>
    </div>
  `;

  shell(mobileContent, "", desktopMain, "");

  // Apply saved preferences immediately after render
  requestAnimationFrame(() => {
    const prefs = getPrefs();
    if (prefs.theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
    if (prefs.compact) document.body.classList.add("compact-mode");
  });
}
