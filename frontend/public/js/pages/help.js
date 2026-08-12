/* ============================================================
   Help & Support Page — Matches reference image exactly
   ============================================================ */
import { icons } from "../utils/icons.js";
import { go }    from "../utils/api.js";
import { state } from "../state.js";
import { shell, desktopTopbar } from "../components/shared.js";

/* ── Category data ─────────────────────────────────────────── */
const CATEGORIES = [
  {
    id: "getting-started",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="#5b34ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    title: "Getting Started",
    desc: "Learn the basics and set up your account",
  },
  {
    id: "managing-meetings",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    title: "Managing Meetings",
    desc: "Create, manage and run meetings",
  },
  {
    id: "participants",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    title: "Participants",
    desc: "Manage speakers, audience and roles",
  },
  {
    id: "polls-questions",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
    title: "Polls & Questions",
    desc: "Everything about polls, questions and votes",
  },
  {
    id: "account-settings",
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    title: "Account & Settings",
    desc: "Manage your profile, preferences and more",
  },
];

/* ── Popular articles ──────────────────────────────────────── */
const ARTICLES = [
  {
    id: "create-meeting",
    title: "How to create and schedule a meeting",
    desc: "Step-by-step guide to create a new meeting and invite participants.",
    tag: "Meetings",
    tagColor: "#5b34ff",
    tagBg: "#f0ecff",
  },
  {
    id: "start-meeting",
    title: "How to start a meeting as moderator",
    desc: "Learn how to start your scheduled meeting and manage the session.",
    tag: "Meetings",
    tagColor: "#5b34ff",
    tagBg: "#f0ecff",
  },
  {
    id: "speakers-audience",
    title: "Managing speakers and audience",
    desc: "Assign speakers, mute/unmute participants and manage roles.",
    tag: "Participants",
    tagColor: "#059669",
    tagBg: "#edf9f3",
  },
  {
    id: "polls",
    title: "Creating and managing polls",
    desc: "How to create polls, view results and share with participants.",
    tag: "Polls & Questions",
    tagColor: "#d97706",
    tagBg: "#fff7ed",
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting connection issues",
    desc: "Solutions for common audio, video and connection problems.",
    tag: "Troubleshooting",
    tagColor: "#7c3aed",
    tagBg: "#f5f3ff",
  },
];

/* ── Guides & Resources ─────────────────────────────────────── */
const RESOURCES = [
  {
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="#e54040" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>`,
    iconBg: "#fff0f0",
    title: "Video Tutorials",
    desc: "Watch step-by-step videos",
  },
  {
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    iconBg: "#edf9f3",
    title: "Community Forum",
    desc: "Ask questions and connect",
  },
  {
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
    iconBg: "#fff7ed",
    title: "Release Notes",
    desc: "Latest updates and features",
  },
  {
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="#5b34ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    iconBg: "#f0ecff",
    title: "System Status",
    desc: "Check system availability",
  },
];

/* ── Quick tips ─────────────────────────────────────────────── */
const TIPS = [
  "Use polls to engage your audience",
  "Assign speakers for better flow",
  "Check your connection before starting",
  "Review session analytics after meetings",
];

/* ── Search handler ─────────────────────────────────────────── */
window.helpSearch = function(val) {
  const q = val.trim().toLowerCase();
  const items = document.querySelectorAll(".hs-article-row");
  items.forEach(el => {
    const text = el.textContent.toLowerCase();
    el.style.display = (!q || text.includes(q)) ? "" : "none";
  });
  const noRes = document.getElementById("hs-no-results");
  if (noRes) {
    const anyVisible = [...items].some(el => el.style.display !== "none");
    noRes.style.display = (q && !anyVisible) ? "" : "none";
  }
};

/* ── Open help link ─────────────────────────────────────────── */
window.openHelpArticle = function(id) {
  // In a real app this would navigate to the article — toast for now
  const names = {
    "create-meeting": "How to create and schedule a meeting",
    "start-meeting": "How to start a meeting as moderator",
    "speakers-audience": "Managing speakers and audience",
    "polls": "Creating and managing polls",
    "troubleshooting": "Troubleshooting connection issues",
  };
  showHelpToast(`Opening: ${names[id] || id}`);
};

window.openHelpCategory = function(id) {
  showHelpToast(`Browsing: ${id.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())}`);
};

window.helpLiveChat = function() {
  showHelpToast("Connecting to live chat…");
};

function showHelpToast(msg) {
  document.querySelectorAll(".hs-toast").forEach(t => t.remove());
  const t = document.createElement("div");
  t.className = "hs-toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}
window.showHelpToast = showHelpToast;

/* ── Main render ────────────────────────────────────────────── */
export function renderHelp() {
  /* ─────────────── Mobile HTML ─────────────────────────── */
  const mobileContent = `
    <div class="hs-mobile">
      <div class="hs-mobile-header">
        <button class="icon-btn ghost-icon" onclick="history.back()">${icons.arrowLeft}</button>
        <span class="hs-mobile-title">Help & Support</span>
      </div>

      <div class="hs-mobile-search-wrap">
        <svg class="hs-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input class="hs-search-input" placeholder="Search for help articles…" oninput="helpSearch(this.value)">
      </div>

      <div class="hs-mobile-categories">
        ${CATEGORIES.map(c => `
          <div class="hs-m-cat-card" onclick="openHelpCategory('${c.id}')">
            <div class="hs-m-cat-icon">${c.icon}</div>
            <div class="hs-m-cat-title">${c.title}</div>
            <div class="hs-m-cat-desc">${c.desc}</div>
          </div>
        `).join("")}
      </div>

      <div class="hs-mobile-section">
        <div class="hs-mobile-section-title">Popular Articles</div>
        ${ARTICLES.map(a => `
          <div class="hs-article-row" onclick="openHelpArticle('${a.id}')">
            <svg class="hs-article-icon" viewBox="0 0 24 24" fill="none" stroke="${a.tagColor}" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <div class="hs-article-body">
              <div class="hs-article-title">${a.title}</div>
              <div class="hs-article-desc">${a.desc}</div>
            </div>
            <span class="hs-tag" style="color:${a.tagColor};background:${a.tagBg}">${a.tag}</span>
            ${icons.chevronRight}
          </div>
        `).join("")}
        <div id="hs-no-results" style="display:none;padding:20px;text-align:center;color:#8890b0;font-size:14px">No articles found.</div>
      </div>
    </div>
  `;

  /* ─────────────── Desktop Main ─────────────────────────── */
  const desktopMain = `
    <div class="hs-page">
    ${desktopTopbar("Help & Support", "Find answers, guides and get the help you need.")}

    <div class="hs-desktop-body">

      <!-- ═══════════ LEFT COLUMN ═══════════ -->
      <div class="hs-left">

        <!-- Search bar -->
        <div class="hs-search-bar">
          <svg class="hs-search-icon" viewBox="0 0 24 24" fill="none" stroke="#8890b0" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            class="hs-search-input-desktop"
            id="hs-search-desktop"
            placeholder="Search for help articles…"
            oninput="helpSearch(this.value)"
          >
        </div>

        <!-- Categories grid -->
        <div class="hs-categories-grid">
          ${CATEGORIES.map(c => `
            <div class="hs-cat-card" onclick="openHelpCategory('${c.id}')">
              <div class="hs-cat-icon">${c.icon}</div>
              <div class="hs-cat-title">${c.title}</div>
              <div class="hs-cat-desc">${c.desc}</div>
              <div class="hs-cat-arrow">
                <svg viewBox="0 0 24 24" fill="none" stroke="#5b34ff" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </div>
            </div>
          `).join("")}
        </div>

        <!-- Popular Articles -->
        <div class="hs-articles-section">
          <div class="hs-articles-header">
            <span class="hs-articles-title">Popular Articles</span>
            <button class="hs-view-all-btn" onclick="showHelpToast('Opening all articles…')">
              View All Articles
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </button>
          </div>

          <div class="hs-articles-list">
            ${ARTICLES.map(a => `
              <div class="hs-article-row" onclick="openHelpArticle('${a.id}')">
                <svg class="hs-article-icon-d" viewBox="0 0 24 24" fill="none" stroke="#8890b0" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                <div class="hs-article-body">
                  <div class="hs-article-title-d">${a.title}</div>
                  <div class="hs-article-desc-d">${a.desc}</div>
                </div>
                <span class="hs-tag" style="color:${a.tagColor};background:${a.tagBg}">${a.tag}</span>
                <svg class="hs-article-chevron" viewBox="0 0 24 24" fill="none" stroke="#c4c8de" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            `).join("")}
            <div id="hs-no-results" style="display:none;padding:24px;text-align:center;color:#8890b0;font-size:14px">No articles match your search.</div>
          </div>
        </div>

      </div>

      <!-- ═══════════ RIGHT COLUMN ═══════════ -->
      <div class="hs-right">

        <!-- Contact Support card -->
        <div class="hs-card">
          <div class="hs-card-header">
            <svg class="hs-card-header-icon" viewBox="0 0 24 24" fill="none" stroke="#5b34ff" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span class="hs-card-title">Contact Support</span>
          </div>
          <p class="hs-card-sub">Can't find what you're looking for?<br>We're here to help!</p>

          <div class="hs-contact-list">
            <!-- Live Chat -->
            <div class="hs-contact-row" onclick="helpLiveChat()">
              <div class="hs-contact-icon" style="background:#edf9f3">
                <svg viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </div>
              <div class="hs-contact-body">
                <div class="hs-contact-title">Live Chat</div>
                <div class="hs-contact-desc">Chat with our support team</div>
              </div>
              <span class="hs-online-badge">Online</span>
            </div>

            <!-- Email -->
            <div class="hs-contact-row" onclick="showHelpToast('Opening email support…')">
              <div class="hs-contact-icon" style="background:#f0ecff">
                <svg viewBox="0 0 24 24" fill="none" stroke="#5b34ff" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              </div>
              <div class="hs-contact-body">
                <div class="hs-contact-title">Email Support</div>
                <div class="hs-contact-desc">support@collectivevoice.app</div>
                <div class="hs-contact-desc">We typically reply in 24hrs</div>
              </div>
            </div>

            <!-- Phone -->
            <div class="hs-contact-row" onclick="showHelpToast('Showing phone support…')">
              <div class="hs-contact-icon" style="background:#fff7ed">
                <svg viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.41 2 2 0 0 1 3.6 1.21h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21.73 16.92z"/></svg>
              </div>
              <div class="hs-contact-body">
                <div class="hs-contact-title">Phone Support</div>
                <div class="hs-contact-desc">+91 98765 43210</div>
                <div class="hs-contact-desc">Mon – Fri, 9:00 AM – 6:00 PM IST</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Guides & Resources card -->
        <div class="hs-card">
          <div class="hs-card-header">
            <svg class="hs-card-header-icon" viewBox="0 0 24 24" fill="none" stroke="#5b34ff" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            <span class="hs-card-title">Guides & Resources</span>
          </div>
          <div class="hs-resources-list">
            ${RESOURCES.map(r => `
              <div class="hs-resource-row" onclick="showHelpToast('Opening: ${r.title}')">
                <div class="hs-resource-icon" style="background:${r.iconBg}">${r.icon}</div>
                <div>
                  <div class="hs-resource-title">${r.title}</div>
                  <div class="hs-resource-desc">${r.desc}</div>
                </div>
              </div>
            `).join("")}
          </div>
        </div>

        <!-- Quick Tips card -->
        <div class="hs-card hs-tips-card">
          <div class="hs-card-header">
            <svg class="hs-card-header-icon" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span class="hs-card-title">Quick Tips</span>
          </div>
          <ul class="hs-tips-list">
            ${TIPS.map(tip => `<li class="hs-tip-item">${tip}</li>`).join("")}
          </ul>
        </div>

      </div>
    </div>
    </div>
  `;

  shell(mobileContent, "", desktopMain, "");
}
