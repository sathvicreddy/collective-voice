/* ============================================================
   Quick Message Modal — shared component
   Reuses the exact same modal-overlay / modal / modal-actions
   shell that openChangeRole / delete-confirm modals use.

   Usage:
     import { openQuickMessageModal, closeQuickMessageModal } from '../components/quickMessageModal.js';
     openQuickMessageModal({
       audienceLabel: 'To: Priya Sharma',
       recipientCount: null,           // optional
       onSend: async ({ subject, body }) => { ... }
     });
   ============================================================ */
import { IC } from '../icons.js';

const MODAL_ID = 'qmm-overlay';

/** Remove any existing quick-message modal from the DOM */
export function closeQuickMessageModal() {
  document.getElementById(MODAL_ID)?.remove();
}

/**
 * Inject the modal into document.body.
 * @param {{ audienceLabel: string, recipientCount?: number|null, onSend: function }} opts
 */
export function openQuickMessageModal({ audienceLabel, recipientCount = null, onSend }) {
  // Remove any stale modal first
  closeQuickMessageModal();

  // ── Build markup — exact same shell as the delete/role modals ──────────
  const overlay = document.createElement('div');
  overlay.id        = MODAL_ID;
  overlay.className = 'modal-overlay';
  overlay.addEventListener('click', closeQuickMessageModal);

  overlay.innerHTML = `
    <div class="modal qmm-card" onclick="event.stopPropagation()" style="max-width:480px;width:calc(100% - 40px)">

      <!-- Header -->
      <div class="qmm-header">
        <div class="qmm-header-icon">${IC.mail}</div>
        <div>
          <h3 class="modal-title" style="margin:0 0 4px">Send Message</h3>
          <!-- Audience chip — non-editable, shows who this goes to -->
          <div class="qmm-audience-chip">
            <span class="qmm-chip-dot"></span>
            <span class="qmm-audience-label">${escHtml(audienceLabel)}</span>
          </div>
          ${recipientCount != null
            ? `<div class="qmm-recipient-count">${recipientCount} recipient${recipientCount !== 1 ? 's' : ''}</div>`
            : ''}
        </div>
        <button class="dp-close-btn qmm-close" onclick="(function(){document.getElementById('${MODAL_ID}')?.remove()})()" title="Close">${IC.x}</button>
      </div>

      <!-- Body -->
      <div class="modal-body qmm-body" style="text-align:left;padding:0 24px">
        <div class="qmm-field">
          <label class="qmm-label" for="qmm-subject">Subject</label>
          <input
            id="qmm-subject"
            class="qmm-input"
            type="text"
            placeholder="e.g. Important update about your meeting"
            maxlength="200"
            autocomplete="off"
          >
        </div>
        <div class="qmm-field">
          <label class="qmm-label" for="qmm-body">Message</label>
          <textarea
            id="qmm-body"
            class="qmm-textarea"
            rows="5"
            placeholder="Write your message here…"
            maxlength="2000"
          ></textarea>
        </div>
        <div id="qmm-error" class="qmm-error" style="display:none"></div>
      </div>

      <!-- Footer — same button classes as other modals -->
      <div class="modal-actions" style="padding:16px 24px 20px">
        <button class="modal-cancel" onclick="(function(){document.getElementById('${MODAL_ID}')?.remove()})()">Cancel</button>
        <button class="modal-confirm qmm-send-btn" id="qmm-send-btn">
          ${IC.send} Send
        </button>
      </div>
    </div>

    <style>
      /* ── Quick message modal styles — scoped via .qmm-* ── */
      .qmm-card       { padding:0; overflow:hidden; border-radius:16px; }
      .qmm-header     { display:flex; align-items:flex-start; gap:14px; padding:22px 24px 16px;
                        border-bottom:1px solid var(--border-color,#e8eaf0); position:relative; }
      .qmm-header-icon{ width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#5b34ff22,#7c5cfc22);
                        display:flex;align-items:center;justify-content:center;color:#5b34ff;flex-shrink:0; }
      .qmm-header-icon svg { width:20px;height:20px; }
      .qmm-close      { position:absolute;top:14px;right:14px; }
      .qmm-audience-chip { display:inline-flex;align-items:center;gap:6px;padding:3px 10px 3px 8px;
                           border-radius:20px;background:linear-gradient(135deg,#f0ecff,#e8f4ff);
                           border:1px solid #d4c8ff;font-size:12px;font-weight:600;color:#5b34ff;margin-top:2px; }
      .qmm-chip-dot   { width:6px;height:6px;border-radius:50%;background:#5b34ff;flex-shrink:0; }
      .qmm-recipient-count { font-size:11px;color:var(--muted,#8890b0);margin-top:4px; }
      .qmm-body       { display:flex;flex-direction:column;gap:14px;padding-top:18px;padding-bottom:4px; }
      .qmm-field      { display:flex;flex-direction:column;gap:5px; }
      .qmm-label      { font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;
                        color:var(--text-secondary,#8890b0); }
      .qmm-input,
      .qmm-textarea   { width:100%;box-sizing:border-box;padding:9px 12px;
                        border:1.5px solid var(--border-color,#e8eaf0);border-radius:9px;
                        font-size:13px;color:var(--text-primary,#1a1d2e);
                        background:var(--bg-primary,#fff);
                        font-family:inherit;outline:none;transition:border-color .18s; }
      .qmm-input:focus,
      .qmm-textarea:focus { border-color:#5b34ff; box-shadow:0 0 0 3px #5b34ff18; }
      .qmm-textarea   { resize:vertical;min-height:90px; }
      .qmm-error      { font-size:12px;color:#e54040;background:#ffeaea;border:1px solid #f8c8c8;
                        border-radius:7px;padding:8px 12px; }
      .qmm-send-btn   { display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#5b34ff,#7c5cfc);
                        color:#fff;border:none;border-radius:9px;padding:9px 20px;font-size:13px;
                        font-weight:600;cursor:pointer;transition:opacity .18s; }
      .qmm-send-btn:hover:not(:disabled) { opacity:.88; }
      .qmm-send-btn:disabled { opacity:.55;cursor:not-allowed; }
      .qmm-send-btn svg { width:14px;height:14px; }
    </style>
  `;

  document.body.appendChild(overlay);

  // Focus subject input
  setTimeout(() => document.getElementById('qmm-subject')?.focus(), 60);

  // Wire the Send button
  document.getElementById('qmm-send-btn')?.addEventListener('click', async () => {
    const subjectEl = document.getElementById('qmm-subject');
    const bodyEl    = document.getElementById('qmm-body');
    const errorEl   = document.getElementById('qmm-error');
    const sendBtn   = document.getElementById('qmm-send-btn');

    const subject = subjectEl?.value.trim() ?? '';
    const body    = bodyEl?.value.trim()    ?? '';

    // Validation
    if (!subject) {
      showQmmError(errorEl, 'Subject is required.');
      subjectEl?.focus();
      return;
    }
    if (!body) {
      showQmmError(errorEl, 'Message body is required.');
      bodyEl?.focus();
      return;
    }
    if (errorEl) errorEl.style.display = 'none';

    // Disable button while sending
    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'Sending…'; }

    try {
      await onSend({ subject, body });
    } catch (err) {
      // Re-enable on failure; show inline error
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.innerHTML = `${IC.send} Send`;
      }
      showQmmError(errorEl, err.message || 'Failed to send. Please try again.');
    }
  });
}

/* ── Internal helpers ── */
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showQmmError(el, msg) {
  if (!el) return;
  el.textContent  = msg;
  el.style.display = 'block';
}
