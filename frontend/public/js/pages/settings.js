/* ============================================================
   Settings Page — Desktop Rich Layout + Mobile Phone Frame
   ============================================================ */
import { icons } from "../utils/icons.js";
import { go } from "../utils/api.js";
import { state } from "../state.js";
import { shell, phone, desktopTopbar } from "../components/shared.js";

export function renderSettings() {
  const user = state.profile?.user || {
    name: "Ananya Sharma",
    email: "ananya.sharma@email.com",
    role: "Audience",
    joined: "May 18, 2025",
    location: "New Delhi, India"
  };

  /* ---- Mobile (phone frame) -------------------------------- */
  const mobileContent = phone(`
    <h1 class="screen-title">Settings</h1>
    <p class="subtle">Manage account, privacy, security, and appearance.</p>
    <div class="stack" style="margin-top:18px;gap:8px">
      ${[
        [icons.user,       "Account",       "Manage your personal info",         ""],
        [icons.bell,       "Notifications", "Set your preferences",              ""],
        [icons.shield,     "Privacy",       "Control your data",                 "green"],
        [icons.eye,        "Security",      "Password and 2FA",                  "orange"],
        [icons.monitor,    "Appearance",    "Theme and language",                "blue"],
        [icons.download,   "Data & Export", "Download your data",                ""],
        [icons.helpCircle, "Help & Support","Get help when you need",            ""]
      ].map(([ic, title, desc, tone]) => `
        <article class="list-card row" style="gap:14px;cursor:pointer">
          <div class="icon-box ${tone}" style="width:40px;height:40px">${ic}</div>
          <div style="flex:1">
            <strong style="font-size:14px">${title}</strong><br>
            <span class="subtle">${desc}</span>
          </div>
          ${icons.chevronRight}
        </article>
      `).join("")}
      <button class="btn secondary" style="width:100%;margin-top:8px" onclick="go('/profile')">${icons.arrowLeft} Back to Profile</button>
    </div>
  `, "profile", true);

  /* ---- Desktop Sidebar Items ------------------------------- */
  const settingsSections = [
    { id: "account",       icon: icons.user,       label: "Account",        sub: "Manage your personal info" },
    { id: "notifications", icon: icons.bell,       label: "Notifications",  sub: "Set your preferences" },
    { id: "privacy",       icon: icons.shield,     label: "Privacy",        sub: "Control your data" },
    { id: "security",      icon: icons.eye,        label: "Security",       sub: "Password and 2FA" },
    { id: "appearance",    icon: icons.monitor,    label: "Appearance",     sub: "Theme and language" },
    { id: "data",          icon: icons.download,   label: "Data & Export",  sub: "Download your data" },
    { id: "help",          icon: icons.helpCircle, label: "Help & Support", sub: "Get help when you need" }
  ];

  /* ---- Desktop Main: Settings Content Panel ---------------- */
  const desktopMain = `
    ${desktopTopbar("Settings", "Manage your account, preferences and application settings.")}

    <div class="settings-layout">
      <!-- Left Settings Sidebar -->
      <div class="settings-sidebar">
        ${settingsSections.map((s, i) => `
          <button class="settings-nav-btn ${i === 0 ? "active" : ""}"
            id="snav-${s.id}"
            onclick="settingsNav(this,'${s.id}')">
            <div class="settings-nav-icon">${s.icon}</div>
            <div class="settings-nav-text">
              <strong>${s.label}</strong>
              <span>${s.sub}</span>
            </div>
          </button>
        `).join("")}
      </div>

      <!-- Right Settings Content -->
      <div class="settings-content">

        <!-- Account Section -->
        <div id="sc-account" class="settings-section">
          <div class="settings-section-header">
            <h2 class="settings-section-title">Account Information</h2>
            <button class="edit-profile-btn" onclick="go('/profile')">${icons.edit} Edit Profile</button>
          </div>
          <div class="settings-account-card">
            <div class="settings-account-avatar">AS</div>
            <div class="settings-account-info">
              <div class="settings-account-name-row">
                <strong class="settings-account-name">${user.name}</strong>
                <span class="badge">${user.role}</span>
              </div>
              <p class="settings-account-detail">${icons.mail} ${user.email}</p>
              <p class="settings-account-detail">${icons.calendar} Joined ${user.joined}</p>
              <p class="settings-account-detail">${icons.info} ${user.location || "New Delhi, India"}</p>
            </div>
          </div>

          <h3 class="settings-group-title" style="margin-top:28px">Account Actions</h3>
          <div class="settings-actions-row">
            <button class="settings-action-card" onclick="">
              <div class="icon-box" style="width:38px;height:38px">${icons.eye}</div>
              <div style="flex:1;text-align:left">
                <strong style="font-size:14px;display:block">Change Password</strong>
                <span class="subtle" style="font-size:12px">Update your account password</span>
              </div>
              ${icons.chevronRight}
            </button>
            <button class="settings-action-card danger" onclick="">
              <div class="icon-box red" style="width:38px;height:38px">${icons.logOut}</div>
              <div style="flex:1;text-align:left">
                <strong style="font-size:14px;display:block;color:var(--danger)">Delete Account</strong>
                <span class="subtle" style="font-size:12px">Permanently delete your account</span>
              </div>
              <span style="color:var(--danger)">${icons.chevronRight}</span>
            </button>
          </div>
        </div>

        <!-- Notifications Section -->
        <div id="sc-notifications" class="settings-section" style="display:none">
          <h2 class="settings-section-title">Notification Preferences</h2>
          <div class="settings-toggle-list">
            ${[
              { icon: icons.calendar,    color: "blue",   title: "Meeting Reminders",    desc: "Receive reminders for upcoming meetings",                      on: true  },
              { icon: icons.messageCircle, color: "green",title: "Question Updates",     desc: "Get notified when your questions get updates or answers",      on: true  },
              { icon: icons.thumbsUp,    color: "orange", title: "Upvote Notifications", desc: "Get notified when someone upvotes your question",              on: true  },
              { icon: icons.bell,        color: "",       title: "System Announcements", desc: "Important updates and announcements",                          on: false }
            ].map(n => `
              <div class="settings-toggle-row">
                <div class="icon-box ${n.color}" style="width:40px;height:40px;flex-shrink:0">${n.icon}</div>
                <div class="settings-toggle-info">
                  <strong>${n.title}</strong>
                  <span class="subtle">${n.desc}</span>
                </div>
                <label class="settings-toggle ${n.on ? "on" : ""}">
                  <input type="checkbox" ${n.on ? "checked" : ""} onchange="this.closest('.settings-toggle').classList.toggle('on',this.checked)">
                  <span class="settings-toggle-thumb"></span>
                </label>
              </div>
            `).join("")}
          </div>
        </div>

        <!-- Privacy Section -->
        <div id="sc-privacy" class="settings-section" style="display:none">
          <h2 class="settings-section-title">Privacy Settings</h2>
          <div class="settings-toggle-list">
            <div class="settings-toggle-row">
              <div class="icon-box green" style="width:40px;height:40px;flex-shrink:0">${icons.shield}</div>
              <div class="settings-toggle-info">
                <strong>Profile Visibility</strong>
                <span class="subtle">Control who can see your profile information</span>
              </div>
              <select class="settings-select">
                <option>Public</option>
                <option>Friends</option>
                <option>Private</option>
              </select>
            </div>
            <div class="settings-toggle-row">
              <div class="icon-box orange" style="width:40px;height:40px;flex-shrink:0">${icons.activity}</div>
              <div class="settings-toggle-info">
                <strong>Show Activity Status</strong>
                <span class="subtle">Allow others to see when you are active</span>
              </div>
              <label class="settings-toggle on">
                <input type="checkbox" checked onchange="this.closest('.settings-toggle').classList.toggle('on',this.checked)">
                <span class="settings-toggle-thumb"></span>
              </label>
            </div>
            <div class="settings-toggle-row">
              <div class="icon-box" style="width:40px;height:40px;flex-shrink:0">${icons.user}</div>
              <div class="settings-toggle-info">
                <strong>Data Collection</strong>
                <span class="subtle">Help improve CollectiveVoice by allowing anonymous data</span>
              </div>
              <label class="settings-toggle">
                <input type="checkbox" onchange="this.closest('.settings-toggle').classList.toggle('on',this.checked)">
                <span class="settings-toggle-thumb"></span>
              </label>
            </div>
          </div>
        </div>

        <!-- Security Section -->
        <div id="sc-security" class="settings-section" style="display:none">
          <h2 class="settings-section-title">Security</h2>
          <div class="settings-toggle-list">
            <div class="settings-toggle-row">
              <div class="icon-box orange" style="width:40px;height:40px;flex-shrink:0">${icons.eye}</div>
              <div class="settings-toggle-info">
                <strong>Two-Factor Authentication</strong>
                <span class="subtle">Add an extra layer of security to your account</span>
              </div>
              <label class="settings-toggle">
                <input type="checkbox" onchange="this.closest('.settings-toggle').classList.toggle('on',this.checked)">
                <span class="settings-toggle-thumb"></span>
              </label>
            </div>
            <div class="settings-toggle-row">
              <div class="icon-box" style="width:40px;height:40px;flex-shrink:0">${icons.monitor}</div>
              <div class="settings-toggle-info">
                <strong>Active Sessions</strong>
                <span class="subtle">Manage devices that are logged into your account</span>
              </div>
              <button class="link-btn" style="flex-shrink:0">Manage</button>
            </div>
          </div>
        </div>

        <!-- Appearance Section -->
        <div id="sc-appearance" class="settings-section" style="display:none">
          <h2 class="settings-section-title">Appearance</h2>
          <div class="settings-toggle-list">
            <div class="settings-toggle-row">
              <div class="icon-box blue" style="width:40px;height:40px;flex-shrink:0">${icons.monitor}</div>
              <div class="settings-toggle-info">
                <strong>Theme</strong>
                <span class="subtle">Choose your preferred theme</span>
              </div>
              <div class="settings-theme-group" id="themeGroup">
                <button class="settings-theme-btn active" onclick="setTheme(this,'light')">Light</button>
                <button class="settings-theme-btn" onclick="setTheme(this,'dark')">Dark</button>
                <button class="settings-theme-btn" onclick="setTheme(this,'system')">System</button>
              </div>
            </div>
            <div class="settings-toggle-row">
              <div class="icon-box green" style="width:40px;height:40px;flex-shrink:0">${icons.info}</div>
              <div class="settings-toggle-info">
                <strong>Language</strong>
                <span class="subtle">Choose your preferred language</span>
              </div>
              <select class="settings-select">
                <option>English</option>
                <option>Hindi</option>
                <option>Spanish</option>
                <option>French</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Data Section -->
        <div id="sc-data" class="settings-section" style="display:none">
          <h2 class="settings-section-title">Data &amp; Export</h2>
          <div class="settings-toggle-list">
            <div class="settings-toggle-row">
              <div class="icon-box" style="width:40px;height:40px;flex-shrink:0">${icons.download}</div>
              <div class="settings-toggle-info">
                <strong>Download My Data</strong>
                <span class="subtle">Get a copy of all your data in JSON format</span>
              </div>
              <button class="btn" style="font-size:13px;padding:8px 14px">${icons.download} Download</button>
            </div>
            <div class="settings-toggle-row">
              <div class="icon-box red" style="width:40px;height:40px;flex-shrink:0">${icons.logOut}</div>
              <div class="settings-toggle-info">
                <strong>Delete All Data</strong>
                <span class="subtle">Permanently remove all your data from CollectiveVoice</span>
              </div>
              <button class="btn secondary" style="font-size:13px;padding:8px 14px;color:var(--danger);border-color:var(--danger)">Delete</button>
            </div>
          </div>
        </div>

        <!-- Help Section -->
        <div id="sc-help" class="settings-section" style="display:none">
          <h2 class="settings-section-title">Help &amp; Support</h2>
          <div class="settings-toggle-list">
            ${[
              [icons.helpCircle, "Help Center",       "Browse FAQs and guides"],
              [icons.messageCircle, "Contact Support","Send us a message"],
              [icons.info,       "Privacy Policy",    "Read our privacy policy"],
              [icons.info,       "Terms of Service",  "Read our terms of service"]
            ].map(([ic, title, desc]) => `
              <div class="settings-toggle-row" style="cursor:pointer">
                <div class="icon-box" style="width:40px;height:40px;flex-shrink:0">${ic}</div>
                <div class="settings-toggle-info">
                  <strong>${title}</strong>
                  <span class="subtle">${desc}</span>
                </div>
                ${icons.chevronRight}
              </div>
            `).join("")}
          </div>
        </div>

      </div>
    </div>
  `;

  shell(mobileContent, "", desktopMain, "");

  /* Settings nav switching */
  window.settingsNav = function(btn, id) {
    document.querySelectorAll(".settings-nav-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".settings-section").forEach(s => s.style.display = "none");
    btn.classList.add("active");
    const sec = document.getElementById("sc-" + id);
    if (sec) sec.style.display = "";
  };

  /* Theme toggle */
  window.setTheme = function(btn, theme) {
    document.querySelectorAll(".settings-theme-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  };
}
