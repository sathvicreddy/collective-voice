import { icons } from "../utils/icons.js";
import { state } from "../state.js";
import { go } from "../utils/api.js";

const app = document.querySelector("#app");

/* ============================================================
   AUTH HANDLER FUNCTIONS (Phase 5)
   Called by form submit buttons — replace onclick="go('/home')".
   ============================================================ */

function _showAuthError(msg) {
  let el = document.querySelector("#authError");
  if (!el) {
    el = document.createElement("div");
    el.id = "authError";
    el.style.cssText = "color:#e54040;font-size:13px;padding:8px 12px;background:#fff0f0;border-radius:8px;margin-bottom:8px";
    const form = document.querySelector(".mobile-auth-form, .auth-form-box");
    if (form) form.prepend(el);
  }
  el.textContent = msg;
}

function _storeToken(accessToken, refreshToken = null) {
  state.token = accessToken;
  try { localStorage.setItem("cv_token", accessToken); } catch {}
  if (refreshToken) {
    state.refreshToken = refreshToken;
    try { localStorage.setItem("cv_refresh_token", refreshToken); } catch {}
  }
}

/** Handle login / signup submit */
export async function authSubmit() {
  const isSignup = state.route === "/signup";
  const nameEl   = document.querySelector("#authName, input[placeholder*='name'], input[placeholder*='Name']");
  const emailEl  = document.querySelector("#authEmail, input[type='email']");
  const passEl   = document.querySelector("#authPassword, input[type='password']");
  const confEl   = document.querySelector("#authConfirm");

  const email    = emailEl?.value.trim();
  const password = passEl?.value;
  const name     = nameEl?.value.trim();
  const confirm  = confEl?.value;

  if (!email || !password) { _showAuthError("Email and password are required."); return; }
  if (isSignup && !name)   { _showAuthError("Full name is required."); return; }
  if (isSignup && password !== confirm) { _showAuthError("Passwords do not match."); return; }

  const submitBtn = document.querySelector("#authSubmit, .auth-submit-btn");
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = isSignup ? "Creating…" : "Signing in…"; }

  try {
    const endpoint = isSignup ? "/api/auth/signup" : "/api/auth/login";
    const body     = isSignup ? { name, email, password } : { email, password };
    const res      = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) { _showAuthError(data.error || "Something went wrong."); return; }

    _storeToken(data.token, data.refreshToken);
    state.profile = { user: data.user };
    go("/home");

  } catch (err) {
    _showAuthError("Network error — please try again.");
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = isSignup ? "Create Account" : "Log in"; }
  }
}

/** Handle forgot-password submit */
export async function authForgot() {
  const emailEl = document.querySelector("input[type='email']");
  const email   = emailEl?.value.trim();
  if (!email) { _showAuthError("Please enter your email."); return; }
  try {
    const res  = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    alert(data.message || "Reset instructions sent.");
    go("/login");
  } catch { _showAuthError("Network error."); }
}

/** Handle reset-password submit */
export async function authReset() {
  const passEls = document.querySelectorAll("input[type='password']");
  const password = passEls[0]?.value;
  const confirm  = passEls[1]?.value;
  if (!password || password.length < 6) { _showAuthError("Password must be at least 6 characters."); return; }
  if (password !== confirm)              { _showAuthError("Passwords do not match."); return; }
  // Token would come from URL hash in a real app — prototype uses a hardcoded prompt
  const token = prompt("Enter the reset token from the email:");
  if (!token) return;
  try {
    const res  = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password })
    });
    const data = await res.json();
    if (!res.ok) { _showAuthError(data.error || "Reset failed."); return; }
    alert("Password updated! Please log in.");
    go("/login");
  } catch { _showAuthError("Network error."); }
}

/* ============================================================
   AUTH LEFT PANEL — uses the real dark purple branding image
   as a full-bleed background (image already has logo/text/scene)
   ============================================================ */
function illustrationScene() {
  // Image is used as CSS background on .auth-left — see renderLogin()
  return ``;
}

/* ============================================================
   LANDING PAGE ILLUSTRATION — the light lavender Q&A scene
   ============================================================ */
function landingIllustration() {
  return `
    <div class="landing-illus-wrap">
      <img
        src="/images/landing-illustration.png"
        class="landing-illus-img"
        alt="Live Q&A session with speaker and audience"
        loading="eager"
      />
    </div>
  `;
}

/* ============================================================
   LANDING PAGE — renderWelcome()
   Desktop: full marketing page  |  Mobile: dark welcome screen
   ============================================================ */
export function renderWelcome() {
  app.innerHTML = `
    <!-- ===== DESKTOP LANDING (hidden on mobile) ===== -->
    <div class="landing-desktop">
      <!-- Top Navbar -->
      <nav class="landing-nav">
        <div class="landing-nav-brand">
          <div class="landing-brand-mark">
            ${icons.mic}
          </div>
          <div>
            <span class="landing-brand-name">Collective<span>Voice</span></span>
            <span class="landing-brand-tagline">Every voice matters</span>
          </div>
        </div>
        <div class="landing-nav-links">
          <a href="#how-it-works" class="landing-nav-link">How It Works</a>
          <a href="#features" class="landing-nav-link">Features</a>
          <a href="#for-events" class="landing-nav-link">For Events</a>
          <a href="#about" class="landing-nav-link">About Us</a>
        </div>
        <div class="landing-nav-actions">
          <button class="landing-nav-login" onclick="go('/login')">Log in</button>
          <button class="landing-nav-cta" onclick="go('/signup')">Get Started <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></button>
        </div>
      </nav>

      <!-- Hero Section -->
      <div class="landing-hero">
        <!-- Left: Text + CTAs -->
        <div class="landing-hero-left">
          <div class="landing-ai-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            AI-Powered Q&amp;A for Live Events
          </div>
          <h1 class="landing-hero-title">
            Make Every<br>
            <span class="landing-hero-accent">Voice</span> Count
          </h1>
          <p class="landing-hero-sub">
            CollectiveVoice helps audiences ask better questions, speakers focus on what matters, and events become more engaging for everyone.
          </p>
          <div class="landing-hero-btns">
            <button class="landing-btn-primary" onclick="go('/meetings/create')">
              Create a Meeting
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <button class="landing-btn-outline" onclick="go('/join')">
              Join a Meeting
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><rect x="2" y="2" width="8" height="8" rx="1"/><rect x="14" y="2" width="8" height="8" rx="1"/><rect x="2" y="14" width="8" height="8" rx="1"/><rect x="14" y="14" width="4" height="4" rx="1"/></svg>
            </button>
          </div>

          <!-- Feature Icons -->
          <div class="landing-features">
            ${[
              { icon: icons.users,      label: "Anonymous",        sub: "Ask without<br>revealing identity",   tone: "purple" },
              { icon: icons.trendingUp, label: "Crowd-Prioritized", sub: "Top questions<br>surface first",      tone: "green" },
              { icon: icons.zap,        label: "AI Clustering",    sub: "Smart grouping of<br>similar questions", tone: "orange" },
              { icon: icons.activity,   label: "Real-Time",        sub: "Live updates in<br>under 40ms",         tone: "blue" }
            ].map(f => `
              <div class="landing-feature-item">
                <div class="landing-feature-icon landing-feature-${f.tone}">${f.icon}</div>
                <span class="landing-feature-label">${f.label}</span>
                <span class="landing-feature-sub">${f.sub}</span>
              </div>
            `).join("")}
          </div>

          <!-- Trust logos -->
          <div class="landing-trust">
            <span class="landing-trust-label">Trusted by educators, organizations and event hosts</span>
            <div class="landing-trust-logos">
              <span class="landing-trust-logo">🎓 LPU</span>
              <span class="landing-trust-logo">◆ IEEE</span>
              <span class="landing-trust-logo"><b>NASSCOM</b></span>
              <span class="landing-trust-logo"><b>JGI</b></span>
            </div>
          </div>
        </div>

        <!-- Right: Illustration with blended corners -->
        <div class="landing-hero-right">
          <div class="landing-illus-blend">
            ${landingIllustration()}
          </div>
        </div>
      </div>

      <!-- Stats Bar -->
      <div class="landing-stats">
        ${[
          { icon: icons.users,    value: "500+",  label: "Live Events",         tone: "purple" },
          { icon: icons.users,    value: "50K+",  label: "Participants",         tone: "green" },
          { icon: icons.barChart, value: "63%",   label: "Redundancy Reduced",  tone: "orange" },
          { icon: icons.clock,    value: "40ms",  label: "Average Latency",     tone: "blue" }
        ].map(s => `
          <div class="landing-stat-item">
            <div class="landing-stat-icon landing-feature-${s.tone}">${s.icon}</div>
            <span class="landing-stat-value">${s.value}</span>
            <span class="landing-stat-label">${s.label}</span>
          </div>
        `).join("")}
      </div>

      <!-- ===== HOW IT WORKS ===== -->
      <section id="how-it-works" class="ls-section ls-section--light">
        <div class="ls-container">
          <div class="ls-section-header">
            <span class="ls-section-tag">Simple &amp; Powerful</span>
            <h2 class="ls-section-title">How It Works</h2>
            <p class="ls-section-sub">Three simple steps to transform any event into an engaging Q&amp;A experience.</p>
          </div>
          <div class="ls-steps">
            <div class="ls-step">
              <div class="ls-step-num">01</div>
              <div class="ls-step-icon ls-step-icon--purple">${icons.mic}</div>
              <h3 class="ls-step-title">Host Creates a Meeting</h3>
              <p class="ls-step-desc">Sign up, create a meeting room in seconds, and share the join code or link with your audience instantly.</p>
            </div>
            <div class="ls-step-arrow">→</div>
            <div class="ls-step">
              <div class="ls-step-num">02</div>
              <div class="ls-step-icon ls-step-icon--green">${icons.users}</div>
              <h3 class="ls-step-title">Audience Joins &amp; Asks</h3>
              <p class="ls-step-desc">Audience members join without signing up. They submit questions anonymously or with their name — no friction.</p>
            </div>
            <div class="ls-step-arrow">→</div>
            <div class="ls-step">
              <div class="ls-step-num">03</div>
              <div class="ls-step-icon ls-step-icon--orange">${icons.trendingUp}</div>
              <h3 class="ls-step-title">AI Surfaces the Best</h3>
              <p class="ls-step-desc">Our AI clusters similar questions and the crowd upvotes the most important ones — best questions rise to the top.</p>
            </div>
          </div>
        </div>
      </section>

      <!-- ===== FEATURES ===== -->
      <section id="features" class="ls-section ls-section--purple">
        <div class="ls-container">
          <div class="ls-section-header">
            <span class="ls-section-tag ls-section-tag--light">Everything You Need</span>
            <h2 class="ls-section-title ls-section-title--light">Packed with Features</h2>
            <p class="ls-section-sub ls-section-sub--light">Built for educators, event hosts, and organizations who value every voice in the room.</p>
          </div>
          <div class="ls-features-grid">
            ${[
              { icon: icons.users,      title: "Anonymous Submissions",  desc: "Audience members can ask questions without revealing their identity — encouraging honest, fearless questions.", tone: "purple" },
              { icon: icons.zap,        title: "AI Semantic Clustering", desc: "Similar questions are automatically grouped so you never answer the same thing twice. Focus on what matters.", tone: "blue" },
              { icon: icons.trendingUp, title: "Live Upvoting",          desc: "The crowd votes in real time. The most important questions surface automatically — pure democratic prioritization.", tone: "green" },
              { icon: icons.activity,   title: "Real-Time Dashboard",    desc: "Hosts see a live stream of questions ranked by votes. Respond, moderate, pin, or dismiss with one click.", tone: "orange" },
              { icon: icons.shield,     title: "Moderation Controls",    desc: "Review questions before they go public. Block spam, hide inappropriate content, and keep your session on track.", tone: "purple" },
              { icon: icons.barChart,   title: "Post-Event Analytics",   desc: "Get detailed reports: most voted questions, engagement rates, audience size, and session sentiment analysis.", tone: "blue" },
            ].map(f => `
              <div class="ls-feat-card">
                <div class="ls-feat-icon ls-feat-icon--${f.tone}">${f.icon}</div>
                <h4 class="ls-feat-title">${f.title}</h4>
                <p class="ls-feat-desc">${f.desc}</p>
              </div>
            `).join("")}
          </div>
        </div>
      </section>

      <!-- ===== FOR EVENTS ===== -->
      <section id="for-events" class="ls-section ls-section--light">
        <div class="ls-container">
          <div class="ls-section-header">
            <span class="ls-section-tag">Built for Every Format</span>
            <h2 class="ls-section-title">For Every Type of Event</h2>
            <p class="ls-section-sub">Whether you're teaching a class, hosting a webinar, or running a town hall — CollectiveVoice scales to your needs.</p>
          </div>
          <div class="ls-events-grid">
            <div class="ls-event-card ls-event-card--edu">
              <div class="ls-event-emoji">🎓</div>
              <h3 class="ls-event-title">Education</h3>
              <p class="ls-event-desc">Transform lectures into interactive sessions. Students ask anonymously, instructors answer the most critical questions first.</p>
              <ul class="ls-event-list">
                <li>Anonymous student questions</li>
                <li>Group similar doubts automatically</li>
                <li>Works for classrooms of 5 to 5,000</li>
              </ul>
              <button class="ls-event-btn" onclick="go('/signup')">Get Started Free →</button>
            </div>
            <div class="ls-event-card ls-event-card--corp">
              <div class="ls-event-emoji">🏢</div>
              <h3 class="ls-event-title">Corporate Events</h3>
              <p class="ls-event-desc">All-hands meetings, town halls, and conferences — give every employee a voice without the chaos of open mic sessions.</p>
              <ul class="ls-event-list">
                <li>Moderated question flow</li>
                <li>Executive-level analytics</li>
                <li>Brand your meeting room</li>
              </ul>
              <button class="ls-event-btn" onclick="go('/signup')">Try for Your Team →</button>
            </div>
            <div class="ls-event-card ls-event-card--conf">
              <div class="ls-event-emoji">🎤</div>
              <h3 class="ls-event-title">Conferences &amp; Webinars</h3>
              <p class="ls-event-desc">From small workshops to international conferences — real-time Q&amp;A that keeps your speakers and audience in sync.</p>
              <ul class="ls-event-list">
                <li>Share via QR code or link</li>
                <li>Multi-speaker support</li>
                <li>Export Q&amp;A reports</li>
              </ul>
              <button class="ls-event-btn" onclick="go('/signup')">Host Your First Event →</button>
            </div>
          </div>
        </div>
      </section>

      <!-- ===== ABOUT US ===== -->
      <section id="about" class="ls-section ls-section--dark">
        <div class="ls-container">
          <div class="ls-about-grid">
            <div class="ls-about-left">
              <span class="ls-section-tag ls-section-tag--light">Our Mission</span>
              <h2 class="ls-section-title ls-section-title--light">Every Voice Deserves to Be Heard</h2>
              <p class="ls-about-desc">We built CollectiveVoice because the best ideas often come from the back row. Traditional Q&amp;A is broken — the loudest voice wins, the shy stay silent, and the best questions never get asked.</p>
              <p class="ls-about-desc">Our platform uses AI and crowd wisdom to ensure the most important questions always reach the stage — regardless of who asked them.</p>
              <div class="ls-about-stats">
                <div class="ls-about-stat"><span class="ls-about-stat-val">500+</span><span class="ls-about-stat-label">Events Hosted</span></div>
                <div class="ls-about-stat"><span class="ls-about-stat-val">50K+</span><span class="ls-about-stat-label">Questions Asked</span></div>
                <div class="ls-about-stat"><span class="ls-about-stat-val">98%</span><span class="ls-about-stat-label">Host Satisfaction</span></div>
              </div>
            </div>
            <div class="ls-about-right">
              <div class="ls-value-cards">
                ${[
                  { emoji: "🎯", title: "Purpose-Built",   desc: "Designed specifically for live event Q&A — not a generic tool forced into a new shape." },
                  { emoji: "🔒", title: "Privacy First",   desc: "Anonymous questions by default. We never sell data and your sessions are encrypted end-to-end." },
                  { emoji: "⚡", title: "Lightning Fast",  desc: "Questions appear in under 40ms. Our real-time engine handles thousands of simultaneous participants." },
                  { emoji: "🌍", title: "Inclusive Design", desc: "Works on any device, any browser, any connection speed — no app download required." },
                ].map(v => `
                  <div class="ls-value-card">
                    <span class="ls-value-emoji">${v.emoji}</span>
                    <div>
                      <div class="ls-value-title">${v.title}</div>
                      <div class="ls-value-desc">${v.desc}</div>
                    </div>
                  </div>
                `).join("")}
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ===== FOOTER CTA ===== -->
      <div class="ls-footer-cta">
        <h2 class="ls-footer-cta-title">Ready to Make Every Voice Count?</h2>
        <p class="ls-footer-cta-sub">Join thousands of educators and event hosts already using CollectiveVoice.</p>
        <div class="ls-footer-cta-btns">
          <button class="landing-btn-primary" onclick="go('/signup')">Create Free Account <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></button>
          <button class="ls-footer-ghost-btn" onclick="go('/join')">Join as Guest</button>
        </div>
        <div class="ls-footer-links">
          <span class="ls-footer-link">© 2026 CollectiveVoice</span>
          <a href="#how-it-works" class="ls-footer-link">How It Works</a>
          <a href="#features" class="ls-footer-link">Features</a>
          <a href="#for-events" class="ls-footer-link">For Events</a>
          <a href="#about" class="ls-footer-link">About Us</a>
        </div>
      </div>
    </div>

    <!-- ===== MOBILE WELCOME (hidden on desktop) ===== -->
    <div class="mobile-welcome">
      <div class="mobile-welcome-bg"></div>
      <div class="mobile-welcome-content">
        <div class="mobile-welcome-logo">
          <div class="mobile-welcome-mark">${icons.mic}</div>
          <div>
            <div class="mobile-welcome-brand">Collective<span>Voice</span></div>
            <div class="mobile-welcome-tagline">Every voice matters</div>
          </div>
        </div>

        <div class="mobile-welcome-hero">
          <h1 class="mobile-welcome-title">Make Every <span>Voice</span> Count</h1>
          <p class="mobile-welcome-sub">AI-powered Q&amp;A platform that brings the best questions to the top using crowd wisdom and semantic intelligence.</p>
        </div>

        <div class="mobile-welcome-features">
          ${[
            [icons.users, "Ask anonymously", "No sign-up required for audience"],
            [icons.trendingUp, "Smart prioritization", "AI groups similar questions"],
            [icons.zap, "Real-time updates", "Instant ranking & live interaction"],
            [icons.shield, "Secure & private", "Your data is always protected"]
          ].map(([ic, t, s]) => `
            <div class="mobile-welcome-feat">
              <div class="mobile-feat-icon">${ic}</div>
              <div>
                <div class="mobile-feat-title">${t}</div>
                <div class="mobile-feat-sub">${s}</div>
              </div>
            </div>
          `).join("")}
        </div>

        <div class="mobile-welcome-actions">
          <button class="mobile-welcome-btn-primary" onclick="go('/login')">Log In</button>
          <button class="mobile-welcome-btn-secondary" onclick="go('/signup')">Sign Up</button>
          <button class="mobile-welcome-btn-ghost" onclick="go('/home')">Continue as Guest</button>
        </div>
      </div>
    </div>
  `;
}

/* ============================================================
   LOGIN / SIGNUP — renderLogin()
   Desktop: dark-left + white-right split  |  Mobile: single column
   ============================================================ */
export function renderLogin(kind = "login") {
  const isSignup = kind === "signup";
  app.innerHTML = `
    <!-- ===== DESKTOP AUTH SPLIT (hidden on mobile) ===== -->
    <div class="auth-desktop">
      <!-- Auth Left: Full-bleed image IS the design (logo + hero + scene) -->
      <div class="auth-left" style="background-image: url('/images/auth-illustration.png'); background-size: cover; background-position: center top; background-repeat: no-repeat; padding: 0; position: relative; overflow: hidden;">
        <!-- Dark overlay gradient at bottom for readability -->
        <div class="auth-left-overlay"></div>
      </div>

      <!-- Right White Panel -->
      <div class="auth-right">
        <div class="auth-right-inner">
          <h2 class="auth-right-title">${isSignup ? "Create account 🎉" : "Welcome back! 👋"}</h2>
          <p class="auth-right-sub">${isSignup ? "Sign up to get started with CollectiveVoice" : "Log in to continue to CollectiveVoice"}</p>

          <div class="auth-form">
            ${isSignup ? `
              <div class="auth-field">
                <label class="auth-label">Full Name</label>
                <div class="auth-input-wrap">
                  <span class="auth-input-icon">${icons.user}</span>
                  <input id="fullName" class="auth-input" placeholder="Enter your full name" type="text" autocomplete="name">
                </div>
              </div>
            ` : ""}

            <div class="auth-field">
              <label class="auth-label">Email address</label>
              <div class="auth-input-wrap">
                <span class="auth-input-icon">${icons.mail}</span>
                <input id="authEmail" class="auth-input" placeholder="Enter your email" type="email" autocomplete="email">
              </div>
            </div>

            <div class="auth-field">
              <label class="auth-label">Password</label>
              <div class="auth-input-wrap">
                <span class="auth-input-icon">${icons.shield}</span>
                <input id="authPassword" class="auth-input" placeholder="Enter your password" type="password" autocomplete="${isSignup ? "new-password" : "current-password"}">
                <button class="auth-eye-btn" type="button" onclick="this.previousElementSibling.type = this.previousElementSibling.type === 'password' ? 'text' : 'password'">${icons.eye}</button>
              </div>
            </div>

            ${isSignup ? `
              <div class="auth-field">
                <label class="auth-label">Confirm Password</label>
                <div class="auth-input-wrap">
                  <span class="auth-input-icon">${icons.shield}</span>
                  <input id="authConfirm" class="auth-input" placeholder="Confirm your password" type="password" autocomplete="new-password">
                  <button class="auth-eye-btn" type="button" onclick="this.previousElementSibling.type = this.previousElementSibling.type === 'password' ? 'text' : 'password'">${icons.eye}</button>
                </div>
              </div>
            ` : `
              <div class="auth-forgot-row">
                <button class="auth-forgot-link" onclick="go('/forgot')">Forgot password?</button>
              </div>
            `}

            <button class="auth-submit-btn" id="authSubmit" onclick="authSubmit()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
              ${isSignup ? "Create Account" : "Log in"}
            </button>

            <!-- Divider -->
            <div class="auth-divider">
              <span class="auth-divider-line"></span>
              <span class="auth-divider-text">or continue with</span>
              <span class="auth-divider-line"></span>
            </div>

            <!-- Social Buttons -->
            <div class="auth-social-row">
              <button class="auth-social-btn" id="googleBtn" onclick="window.location.href='/api/auth/google'">
                <svg viewBox="0 0 24 24" width="18" height="18">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Google
              </button>
              <button class="auth-social-btn" id="microsoftBtn" onclick="go('/home')">
                <svg viewBox="0 0 24 24" width="18" height="18">
                  <rect x="1" y="1" width="10" height="10" fill="#F25022"/>
                  <rect x="13" y="1" width="10" height="10" fill="#7FBA00"/>
                  <rect x="1" y="13" width="10" height="10" fill="#00A4EF"/>
                  <rect x="13" y="13" width="10" height="10" fill="#FFB900"/>
                </svg>
                Microsoft
              </button>
              <button class="auth-social-btn" id="githubBtn" onclick="go('/home')">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                </svg>
                GitHub
              </button>
            </div>

            ${!isSignup ? `
              <!-- Join as Guest -->
              <div class="auth-guest-card">
                <div class="auth-guest-icon">${icons.users}</div>
                <div class="auth-guest-body">
                  <strong>Join as audience</strong>
                  <span>No account needed. Enter meeting code</span>
                </div>
                <button class="auth-guest-btn" onclick="go('/join')">Join as Guest →</button>
              </div>
            ` : ""}

            <!-- Switch link -->
            <p class="auth-switch">
              ${isSignup ? "Already have an account?" : "Don't have an account?"}
              <button class="auth-switch-link" onclick="go('${isSignup ? "/login" : "/signup"}')">
                ${isSignup ? "Log in" : "Sign up"}
              </button>
            </p>

            <!-- Trust badge -->
            <div class="auth-trust">
              ${icons.shield} Trusted by educators, organizations and event hosts worldwide.
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== MOBILE AUTH (hidden on desktop) ===== -->
    <div class="mobile-auth">
      <div class="mobile-auth-header">
        <button class="mobile-auth-back" onclick="go('/welcome')">${icons.arrowLeft}</button>
        <div class="mobile-auth-logo">
          <div class="mobile-auth-mark">${icons.mic}</div>
          <span>Collective<b>Voice</b></span>
        </div>
        <div style="width:36px"></div>
      </div>

      <div class="mobile-auth-body">
        <h1 class="mobile-auth-title">${isSignup ? "Create account 🎉" : "Welcome back! 👋"}</h1>
        <p class="mobile-auth-sub">${isSignup ? "Sign up to get started" : "Log in to continue"}</p>

        <div class="mobile-auth-form">
          ${isSignup ? `
            <div class="auth-field">
              <label class="auth-label">Full Name</label>
              <div class="auth-input-wrap">
                <span class="auth-input-icon">${icons.user}</span>
                <input class="auth-input" placeholder="Enter your full name" type="text">
              </div>
            </div>
          ` : ""}
          <div class="auth-field">
            <label class="auth-label">Email address</label>
            <div class="auth-input-wrap">
              <span class="auth-input-icon">${icons.mail}</span>
              <input class="auth-input" placeholder="Enter your email" type="email">
            </div>
          </div>
          <div class="auth-field">
            <label class="auth-label">Password</label>
            <div class="auth-input-wrap">
              <span class="auth-input-icon">${icons.shield}</span>
              <input class="auth-input" placeholder="Enter your password" type="password">
              <button class="auth-eye-btn" type="button" onclick="this.previousElementSibling.type = this.previousElementSibling.type === 'password' ? 'text' : 'password'">${icons.eye}</button>
            </div>
          </div>
          ${isSignup ? `
            <div class="auth-field">
              <label class="auth-label">Confirm Password</label>
              <div class="auth-input-wrap">
                <span class="auth-input-icon">${icons.shield}</span>
                <input class="auth-input" placeholder="Confirm your password" type="password">
              </div>
            </div>
          ` : `
            <div class="auth-forgot-row">
              <button class="auth-forgot-link" onclick="go('/forgot')">Forgot password?</button>
            </div>
          `}

          <button class="auth-submit-btn" onclick="authSubmit()">
            ${isSignup ? "Create Account" : "Log in"}
          </button>

          <div class="auth-divider">
            <span class="auth-divider-line"></span>
            <span class="auth-divider-text">or continue with</span>
            <span class="auth-divider-line"></span>
          </div>

          <div class="auth-social-row">
            <button class="auth-social-btn" onclick="window.location.href='/api/auth/google'">
              <svg viewBox="0 0 24 24" width="18" height="18"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Google
            </button>
            <button class="auth-social-btn" onclick="go('/home')">
              <svg viewBox="0 0 24 24" width="18" height="18"><rect x="1" y="1" width="10" height="10" fill="#F25022"/><rect x="13" y="1" width="10" height="10" fill="#7FBA00"/><rect x="1" y="13" width="10" height="10" fill="#00A4EF"/><rect x="13" y="13" width="10" height="10" fill="#FFB900"/></svg>
              Microsoft
            </button>
            <button class="auth-social-btn" onclick="go('/home')">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
              GitHub
            </button>
          </div>

          ${!isSignup ? `
            <div class="auth-guest-card">
              <div class="auth-guest-icon">${icons.users}</div>
              <div class="auth-guest-body">
                <strong>Join as audience</strong>
                <span>No account needed. Enter meeting code</span>
              </div>
              <button class="auth-guest-btn" onclick="go('/join')">Join as Guest →</button>
            </div>
          ` : ""}

          <p class="auth-switch">
            ${isSignup ? "Already have an account?" : "Don't have an account?"}
            <button class="auth-switch-link" onclick="go('${isSignup ? "/login" : "/signup"}')">
              ${isSignup ? "Log in" : "Sign up"}
            </button>
          </p>
        </div>
      </div>
    </div>
  `;
}

/* ============================================================
   ONBOARDING
   ============================================================ */
export function renderOnboarding(step = 1) {
  const slides = [
    { icon: icons.mic,      title: "Welcome to CollectiveVoice",  body: "Join live sessions, ask anonymously, and help the best questions rise to the top." },
    { icon: icons.zap,      title: "AI Question Clustering",      body: "Similar questions are grouped into one ranked cluster so the speaker sees the real crowd priority." },
    { icon: icons.send,     title: "Make Every Voice Count",      body: "Scan a QR code, join the room, upvote, and track answers — even after the meeting." }
  ];
  const index = Math.max(0, Math.min(slides.length - 1, Number(step) - 1));
  const slide = slides[index];
  app.innerHTML = `
    <div class="mobile-auth" style="justify-content:center;align-items:center;text-align:center">
      <div class="mobile-auth-body" style="padding:48px 32px">
        <div class="onboard-icon">${slide.icon}</div>
        <h1 class="mobile-auth-title" style="margin-top:24px">${slide.title}</h1>
        <p class="mobile-auth-sub" style="margin-bottom:40px">${slide.body}</p>
        <div style="display:flex;justify-content:center;gap:8px;margin-bottom:32px">
          ${slides.map((_, di) => `<span class="dot ${di === index ? "active" : ""}"></span>`).join("")}
        </div>
        <div style="display:flex;flex-direction:column;gap:12px">
          ${index < slides.length - 1
            ? `<button class="auth-submit-btn" onclick="go('/onboarding/${index + 2}')">Next</button>`
            : `<button class="auth-submit-btn" onclick="go('/login')">Get Started</button>`}
          <button class="auth-switch-link" onclick="go('/home')" style="padding:12px">Skip</button>
        </div>
      </div>
    </div>
  `;
}

/* ============================================================
   FORGOT PASSWORD
   ============================================================ */
export function renderForgot() {
  app.innerHTML = `
    <div class="mobile-auth">
      <div class="mobile-auth-header">
        <button class="mobile-auth-back" onclick="go('/login')">${icons.arrowLeft}</button>
        <div class="mobile-auth-logo">
          <div class="mobile-auth-mark">${icons.mic}</div>
          <span>Collective<b>Voice</b></span>
        </div>
        <div style="width:36px"></div>
      </div>
      <div class="mobile-auth-body">
        <h1 class="mobile-auth-title">Forgot Password 🔑</h1>
        <p class="mobile-auth-sub">Enter your email and we'll send instructions to reset your password.</p>
        <div class="mobile-auth-form">
          <div class="auth-field">
            <label class="auth-label">Email address</label>
            <div class="auth-input-wrap">
              <span class="auth-input-icon">${icons.mail}</span>
              <input class="auth-input" placeholder="Enter your email" type="email">
            </div>
          </div>
          <button class="auth-submit-btn" onclick="authForgot()">Send Reset Link</button>
          <p class="auth-switch">
            Remember your password?
            <button class="auth-switch-link" onclick="go('/login')">Log in</button>
          </p>
        </div>
      </div>
    </div>
  `;
}

/* ============================================================
   RESET PASSWORD
   ============================================================ */
export function renderReset() {
  app.innerHTML = `
    <div class="mobile-auth">
      <div class="mobile-auth-header">
        <button class="mobile-auth-back" onclick="go('/login')">${icons.arrowLeft}</button>
        <div class="mobile-auth-logo">
          <div class="mobile-auth-mark">${icons.mic}</div>
          <span>Collective<b>Voice</b></span>
        </div>
        <div style="width:36px"></div>
      </div>
      <div class="mobile-auth-body">
        <h1 class="mobile-auth-title">Reset Password ✅</h1>
        <p class="mobile-auth-sub">Enter your new password below.</p>
        <div class="mobile-auth-form">
          <div class="auth-field">
            <label class="auth-label">New Password</label>
            <div class="auth-input-wrap">
              <span class="auth-input-icon">${icons.shield}</span>
              <input class="auth-input" placeholder="Enter new password" type="password">
            </div>
          </div>
          <div class="auth-field">
            <label class="auth-label">Confirm Password</label>
            <div class="auth-input-wrap">
              <span class="auth-input-icon">${icons.shield}</span>
              <input class="auth-input" placeholder="Confirm new password" type="password">
            </div>
          </div>
          <div class="auth-password-rules">
            <span>${icons.checkCircle} At least 8 characters</span>
            <span>${icons.checkCircle} Include a number</span>
            <span>${icons.checkCircle} Include an uppercase letter</span>
          </div>
          <button class="auth-submit-btn" onclick="authReset()">Reset Password</button>
        </div>
      </div>
    </div>
  `;
}
