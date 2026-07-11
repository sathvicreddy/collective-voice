/* ============================================================
   Notifications Page — Desktop + Mobile layouts
   ============================================================ */
import { icons } from "../utils/icons.js";
import { state } from "../state.js";
import { go } from "../utils/api.js";
import { shell, phone, desktopTopbar } from "../components/shared.js";

export function renderNotifications() {
  const typeIcons = {
    "Meeting Updates": icons.calendar,
    "Questions":       icons.messageCircle,
    "System":          icons.info
  };

  /* ---- Mobile phone content ---- */
  const mobileContent = `
    <div class="row">
      <h1 class="screen-title">Notifications</h1>
      <button class="link-btn">Mark all as read</button>
    </div>
    <div class="tabs">
      <button class="active">All</button>
      <button>Meetings</button>
      <button>Questions</button>
    </div>
    <div class="stack">
      ${state.notifications.map(item => `
        <article class="list-card row" style="gap:14px">
          <div class="icon-box" style="width:36px;height:36px">${typeIcons[item.type] || icons.bell}</div>
          <div style="flex:1">
            <strong style="font-size:13px">${item.title}</strong>
            <p class="subtle">${item.body}</p>
          </div>
          <span class="subtle" style="white-space:nowrap">${item.time}</span>
        </article>
      `).join("")}
    </div>
  `;

  /* ---- Desktop main content ---- */
  const desktopMain = `
    ${desktopTopbar("Notifications", "Stay updated on meetings, questions and activity.")}

    <div class="notif-desktop-wrap">
      <div class="notif-desktop-card">
        <div class="notif-desktop-header">
          <span class="notif-desktop-title">All Notifications</span>
          <button class="btn secondary" style="font-size:13px;padding:8px 16px">
            ${icons.checkCircle} Mark all as read
          </button>
        </div>

        <div class="notif-desktop-tabs">
          <button class="notif-dtab active">All</button>
          <button class="notif-dtab">Meetings</button>
          <button class="notif-dtab">Questions</button>
          <button class="notif-dtab">System</button>
        </div>

        <div class="notif-list">
          ${state.notifications.map((item, idx) => `
            <div class="notif-item" style="animation:fadeUp .35s ${.04 + idx*.06}s both">
              <div class="icon-box" style="width:38px;height:38px;flex-shrink:0">
                ${typeIcons[item.type] || icons.bell}
              </div>
              <div class="notif-item-body">
                <p class="notif-item-title">${item.title}</p>
                <p class="notif-item-body-text">${item.body}</p>
              </div>
              <span class="notif-item-time">${item.time}</span>
            </div>
          `).join("")}
        </div>
      </div>
    </div>
  `;

  shell(
    phone(mobileContent, "profile"),
    "",
    desktopMain,
    ""
  );
}
