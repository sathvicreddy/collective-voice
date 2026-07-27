/* ============================================================
   CollectiveVoice — Animation Utilities
   Injected globally via index.html — no module imports needed.
   ============================================================ */

(function () {
  "use strict";

  /* ── 1. Splash / App Loading Screen ─────────────────────── */
  const SPLASH_MIN_MS = 900; // first-visit minimum display time
  const SPLASH_KEY    = "cv_splash_done"; // sessionStorage flag

  // Only show the splash on the very first page load of this browser session.
  // On every reload / hash navigation, skip it entirely.
  const _firstVisit = !sessionStorage.getItem(SPLASH_KEY);

  function showSplash() {
    const el = document.createElement("div");
    el.id = "cv-splash";
    el.className = "cv-splash";
    el.innerHTML = `
      <div class="cv-splash__logo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      </div>
      <div style="text-align:center">
        <div class="cv-splash__title">Collective<span>Voice</span></div>
        <div class="cv-splash__sub">Where every voice counts</div>
      </div>
      <div class="cv-splash__bar-wrap">
        <div class="cv-splash__bar"></div>
      </div>
    `;
    document.body.appendChild(el);
    return el;
  }

  function hideSplash(el) {
    if (!el) return;
    el.classList.add("cv-splash--out");
    // Mark as shown so reloads skip it
    try { sessionStorage.setItem(SPLASH_KEY, "1"); } catch {}
    setTimeout(() => el.remove(), 320);
  }

  // Only create the splash element on first visit
  const _splashEl      = _firstVisit ? showSplash() : null;
  const _splashShownAt = Date.now();

  // Expose dismiss function — no-op if splash wasn't shown
  window.cvHideSplash = function () {
    if (!_splashEl) return; // already seen — skip immediately
    const elapsed   = Date.now() - _splashShownAt;
    const remaining = Math.max(0, SPLASH_MIN_MS - elapsed);
    setTimeout(() => hideSplash(_splashEl), remaining);
  };

  /* ── 2. Button Ripple Effect ────────────────────────────── */
  function addRipple(e) {
    const btn = e.currentTarget;
    const wave = document.createElement("span");
    wave.className = "ripple-wave";
    const rect = btn.getBoundingClientRect();
    wave.style.left = `${e.clientX - rect.left}px`;
    wave.style.top  = `${e.clientY - rect.top}px`;
    btn.appendChild(wave);
    wave.addEventListener("animationend", () => wave.remove(), { once: true });
  }

  // Attach ripple to all .btn elements (and future ones via delegation)
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn");
    if (!btn) return;
    addRipple({ currentTarget: btn, clientX: e.clientX, clientY: e.clientY });
  });

  /* ── 3. Button Loading State Helper ────────────────────── */
  // Usage: setBtnLoading(el, true) / setBtnLoading(el, false, 'Done')
  window.setBtnLoading = function setBtnLoading(el, loading, doneText) {
    if (!el) return;
    if (loading) {
      el._origText = el.innerHTML;
      el.disabled = true;
      el.classList.add("btn--loading");
      el.innerHTML = el.dataset.loadingText || "Please wait…";
    } else {
      el.disabled = false;
      el.classList.remove("btn--loading");
      el.innerHTML = doneText || el._origText || el.innerHTML;
    }
  };

  /* ── 4. QR Scan Line Injection ──────────────────────────── */
  // Called after the scan screen is rendered
  window.mountScanLine = function mountScanLine() {
    const frame = document.querySelector(".qr-frame");
    if (!frame || frame.querySelector(".qr-scan-line")) return;
    const line = document.createElement("div");
    line.className = "qr-scan-line";
    frame.appendChild(line);
  };

  /* ── 5. Skeleton Loader Builder ─────────────────────────── */
  // Replaces target element content with shimmer placeholders
  window.showSkeleton = function showSkeleton(containerId, rows = 3) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const html = Array.from({ length: rows }, (_, i) => `
      <div class="panel" style="padding:14px;margin-bottom:12px;animation-delay:${i * 0.06}s">
        <div style="display:flex;gap:12px;align-items:center">
          <div class="skeleton skeleton-avatar"></div>
          <div style="flex:1">
            <div class="skeleton skeleton-title"></div>
            <div class="skeleton skeleton-text" style="width:80%"></div>
            <div class="skeleton skeleton-text" style="width:55%"></div>
          </div>
        </div>
      </div>
    `).join("");
    el.innerHTML = html;
  };

  /* ── 6. Joining / Connecting Screen Orbit ────────────────── */
  // Replaces the static big-mark in joining screens with the orbit spinner
  window.mountJoiningOrb = function mountJoiningOrb() {
    const hero = document.querySelector(".logo-hero .big-mark");
    if (!hero) return;
    const parent = hero.parentElement;
    const orb = document.createElement("div");
    orb.className = "joining-orb";
    orb.innerHTML = `
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none"
           stroke="rgba(255,255,255,0.9)" stroke-width="2" stroke-linecap="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    `;
    parent.replaceChild(orb, hero);

    // Also swap the spinner div with the orbit component
    const staticSpinner = parent.parentElement?.querySelector(".spinner");
    if (staticSpinner) {
      const orbit = document.createElement("div");
      orbit.className = "cv-orbit";
      orbit.innerHTML = `
        <div class="cv-orbit__outer"></div>
        <div class="cv-orbit__inner"></div>
        <div class="cv-orbit__dot"></div>
      `;
      staticSpinner.replaceWith(orbit);
    }
  };

  /* ── 7. Three-Dot Loader Helper ─────────────────────────── */
  // Returns HTML string for a cv-dots bouncing loader
  window.dotsHTML = function dotsHTML() {
    return `<div class="cv-dots"><span></span><span></span><span></span></div>`;
  };

  /* ── 8. Success Check Animation ─────────────────────────── */
  // Returns an inline SVG success animation
  window.successIconHTML = function successIconHTML() {
    return `
      <svg class="cv-success-icon" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r="33" stroke-width="3" fill="none" stroke="#24b86f" opacity="0.2"/>
        <circle cx="36" cy="36" r="33" stroke-width="3" fill="none" stroke="#24b86f"
                stroke-dasharray="207" stroke-dashoffset="0"
                style="animation:circleIn .45s cubic-bezier(.34,1.56,.64,1) both"/>
        <path d="M22 36 L32 46 L50 28" stroke-width="3" fill="none" stroke="#24b86f"
              stroke-linecap="round" stroke-linejoin="round"
              stroke-dasharray="40" stroke-dashoffset="40"
              style="animation:checkDraw .4s ease .45s forwards"/>
      </svg>
    `;
  };

  /* ── 9. Grace-Period Countdown Timer ────────────────────── */
  // Finds all [id^="grace-cd-"] elements and starts a live countdown
  function tickGraceCountdowns() {
    document.querySelectorAll("[id^='grace-cd-']").forEach(el => {
      const meetingId = el.id.replace("grace-cd-", "");
      const m = window.state?.myMeetings?.all?.find(x => x.id === meetingId);
      if (!m?.graceEndsAt) return;
      const msLeft = Math.max(0, new Date(m.graceEndsAt) - Date.now());
      const mins = Math.floor(msLeft / 60000);
      const secs = Math.floor((msLeft % 60000) / 1000);
      el.textContent = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
      // Add urgency class when < 3 minutes
      if (mins < 3) {
        el.classList.add("grace-cd-urgent");
      } else {
        el.classList.remove("grace-cd-urgent");
      }
    });
  }
  setInterval(tickGraceCountdowns, 1000);

  /* ── 10. Page Transition Observer ───────────────────────── */
  // Watches #app children and triggers entrance animations
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      m.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        // Trigger reflow so CSS animations restart cleanly on re-render
        node.querySelectorAll(".meeting-card, .list-card, .question-card, .panel, .action-card")
          .forEach((card, i) => {
            card.style.animationDelay = `${i * 0.04}s`;
          });
      });
    });
  });

  const appEl = document.getElementById("app");
  if (appEl) observer.observe(appEl, { childList: true, subtree: true });

  /* ── 11. Input Focus Ring Enhancement ───────────────────── */
  // Adds a class to labels when inputs are focused for enhanced styling
  document.addEventListener("focusin", (e) => {
    const input = e.target.closest("input, textarea, select");
    if (!input) return;
    const field = input.closest(".field");
    if (field) field.classList.add("field--focused");
  });
  document.addEventListener("focusout", (e) => {
    const input = e.target.closest("input, textarea, select");
    if (!input) return;
    const field = input.closest(".field");
    if (field) field.classList.remove("field--focused");
  });

  /* ── 12. Safety-net: auto-dismiss splash if app.js never calls cvHideSplash ── */
  // Only runs on first visit (_splashEl is null on reloads so this is a no-op)
  if (_splashEl) {
    setTimeout(() => {
      if (_splashEl.parentNode) hideSplash(_splashEl);
    }, 4000);
  }

  /* ── 13. Joining screen — auto-mount orbit after render ─── */
  // Watches for .joining-orb or the /joining route and replaces the big-mark
  const _joinObs = new MutationObserver(() => {
    const joiningScreen = document.querySelector(".center-screen .logo-hero");
    if (joiningScreen && window.state?.route === "/joining") {
      window.mountJoiningOrb();
      _joinObs.disconnect(); // run once per render
    }
    // Re-connect on next render
    setTimeout(() => {
      if (appEl) _joinObs.observe(appEl, { childList: true, subtree: true });
    }, 100);
  });
  if (appEl) _joinObs.observe(appEl, { childList: true, subtree: true });

  /* ── 14. Scan screen — auto-inject scan line ────────────── */
  document.addEventListener("cv:ws_event", () => {});  // keep alive
  const _scanObs = new MutationObserver(() => {
    if (window.state?.route?.includes("/scan")) {
      setTimeout(window.mountScanLine, 80);
    }
  });
  if (appEl) _scanObs.observe(appEl, { childList: true, subtree: true });

  console.log("[CV] Animation controller initialized");
})();
