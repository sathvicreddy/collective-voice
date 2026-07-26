/* NLP Engine Page — connected to real backend */
import { IC } from '../icons.js';
import { adminGet, adminPost } from '../api.js';

let _nlpConfig = null;
let nlpThreshold = 0.60;
let nlpWeights = { vote: 0.40, fresh: 0.25, novel: 0.20, diverse: 0.15 };
let nlpRate = { maxReq: 5, windowMs: 900000 };
let nlpTest = { a: 'How will AI impact the future of education?', b: 'What is the future of AI in education?', result: null, loading: false, wouldMerge: null };

export async function loadNLPConfig() {
  try {
    _nlpConfig = await adminGet('/api/admin/nlp/config');
    nlpThreshold = _nlpConfig.threshold;
    nlpWeights   = _nlpConfig.weights;
    nlpRate      = { maxReq: _nlpConfig.rateLimiting.maxRequests, windowMs: _nlpConfig.rateLimiting.windowMs };
  } catch (err) {
    console.error('[NLP] config load error:', err.message);
  }
}

function renderSlider(id, label, greek, min, max, step, val, onInput) {
  return `
    <div class="nlp-slider-row">
      <div class="nlp-slider-label">${label}${greek ? ` <span class="nlp-greek">(${greek})</span>` : ''}</div>
      <div class="nlp-slider-track-wrap">
        <span class="nlp-range-val">${min.toFixed(2)}</span>
        <div class="nlp-slider-wrap">
          <input type="range" id="${id}" class="nlp-slider" min="${min}" max="${max}" step="${step}" value="${val}"
            style="--pct:${((val-min)/(max-min)*100).toFixed(1)}%"
            oninput="${onInput}">
        </div>
        <span class="nlp-range-val">${max.toFixed(2)}</span>
      </div>
      <div class="nlp-slider-val" id="${id}-val">${val.toFixed(2)}</div>
    </div>`;
}

export function renderNLPEngine() {
  if (!_nlpConfig) {
    loadNLPConfig().then(() => {
      const el = document.getElementById('admin-content-area');
      if (el) el.innerHTML = renderNLPEngine();
    });
    return `<div class="page active" id="page-nlp"><div class="page-loading">Loading NLP config…</div></div>`;
  }

  const total = (nlpWeights.vote + nlpWeights.fresh + nlpWeights.novel + nlpWeights.diverse).toFixed(2);
  const totalOk = Math.abs(parseFloat(total) - 1.00) < 0.001;
  const windowMins = Math.round(nlpRate.windowMs / 60000);

  return `
    <div class="page active" id="page-nlp">
      <div class="page-header page-header-row" style="margin-bottom:20px">
        <div>
          <h1 class="page-title">NLP Engine</h1>
          <p class="page-subtitle">Configure semantic clustering and ranking engine.</p>
        </div>
        <span class="nlp-status-badge">${IC.zap} Semantic Embeddings Active</span>
      </div>

      <!-- Section 1: Clustering Threshold -->
      <div class="nlp-section">
        <div class="nlp-section-header"><span class="nlp-section-num">1</span> Clustering Threshold</div>
        <div class="nlp-section-body">
          <div class="nlp-threshold-row">
            <div class="nlp-threshold-left">
              <div class="nlp-slider-label" style="margin-bottom:12px">Similarity Threshold</div>
              <div class="nlp-slider-track-wrap">
                <span class="nlp-range-val">0.00</span>
                <div class="nlp-slider-wrap">
                  <input type="range" id="nlp-threshold" class="nlp-slider" min="0" max="1" step="0.01" value="${nlpThreshold}"
                    style="--pct:${(nlpThreshold*100).toFixed(1)}%"
                    oninput="updateNlpThreshold(this.value)">
                </div>
                <span class="nlp-range-val">1.00</span>
              </div>
              <p class="nlp-hint">Questions scoring above this threshold are merged into the same cluster.</p>
            </div>
            <div class="nlp-threshold-display">${nlpThreshold.toFixed(2)}</div>
          </div>
          <div class="nlp-section-footer">
            <button class="nlp-reset-btn" onclick="resetNlpThreshold()">Reset to default</button>
            <button class="nlp-save-btn" onclick="saveNlpThreshold()">Save</button>
          </div>
        </div>
      </div>

      <!-- Section 2: Scoring Weights -->
      <div class="nlp-section">
        <div class="nlp-section-header"><span class="nlp-section-num">2</span> Scoring Weights</div>
        <div class="nlp-section-body">
          ${renderSlider('nlp-vote',  'Vote Weight',      'α', 0, 1, 0.01, nlpWeights.vote,    'updateNlpWeight("vote",this.value)'   )}
          ${renderSlider('nlp-fresh', 'Freshness Weight', 'β', 0, 1, 0.01, nlpWeights.fresh,   'updateNlpWeight("fresh",this.value)'  )}
          ${renderSlider('nlp-novel', 'Novelty Weight',   'γ', 0, 1, 0.01, nlpWeights.novel,   'updateNlpWeight("novel",this.value)'  )}
          ${renderSlider('nlp-div',   'Diversity Weight', 'δ', 0, 1, 0.01, nlpWeights.diverse, 'updateNlpWeight("diverse",this.value)')}
          <div class="nlp-total-row ${totalOk?'ok':'err'}">
            Total: ${total} ${totalOk ? `<span class="nlp-check">${IC.check}</span>` : '<span class="nlp-warn">≠ 1.00</span>'}
          </div>
          <div class="nlp-section-footer" style="border-top:0;padding-top:0">
            <span></span>
            <button class="nlp-save-btn" onclick="saveNlpWeights()">Save</button>
          </div>
        </div>
      </div>

      <!-- Section 3: Test Cluster Tool -->
      <div class="nlp-section">
        <div class="nlp-section-header">
          <span class="nlp-section-num">3</span> Test Cluster Tool
          <span class="nlp-try-badge">${IC.zap} Try it out</span>
        </div>
        <div class="nlp-section-body">
          <div class="nlp-test-row">
            <div class="nlp-test-input-wrap">
              <label class="nlp-test-label">Question A</label>
              <textarea class="nlp-test-area" id="nlp-qa" rows="3" placeholder="Enter first question…">${nlpTest.a}</textarea>
            </div>
            <div class="nlp-swap-btn" onclick="swapNlpQuestions()">${IC.arrowSwap}</div>
            <div class="nlp-test-input-wrap">
              <label class="nlp-test-label">Question B</label>
              <textarea class="nlp-test-area" id="nlp-qb" rows="3" placeholder="Enter second question…">${nlpTest.b}</textarea>
            </div>
          </div>
          <div style="text-align:center;margin:14px 0 18px">
            <button class="nlp-compare-btn" onclick="runNlpCompare()" ${nlpTest.loading?'disabled':''}>
              ${nlpTest.loading ? 'Comparing…' : `${IC.zap} Compare`}
            </button>
          </div>
          ${nlpTest.result !== null ? `
          <div class="nlp-result-card">
            <div class="nlp-result-circle-wrap">
              <svg width="80" height="80" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="34" fill="none" stroke="#e6f9f1" stroke-width="8"/>
                <circle cx="40" cy="40" r="34" fill="none" stroke="${nlpTest.wouldMerge?'#24b86f':'#e05c5c'}" stroke-width="8"
                  stroke-dasharray="${(2*Math.PI*34*nlpTest.result/100).toFixed(1)} ${(2*Math.PI*34).toFixed(1)}"
                  stroke-dashoffset="${(2*Math.PI*34*0.25).toFixed(1)}"
                  stroke-linecap="round" transform="rotate(-90 40 40)"/>
                <text x="40" y="45" text-anchor="middle" font-size="16" font-weight="800" fill="#111936">${nlpTest.result}%</text>
              </svg>
            </div>
            <div class="nlp-result-text-wrap">
              <div class="nlp-result-title">${nlpTest.result}% similar — ${nlpTest.wouldMerge ? 'would merge' : 'would NOT merge'}</div>
              <div class="nlp-result-sub">${nlpTest.wouldMerge
                ? 'These questions are semantically very similar and will be clustered together.'
                : `These questions are not similar enough to merge (threshold: ${nlpThreshold.toFixed(2)}).`}</div>
            </div>
          </div>` : ''}
        </div>
      </div>

      <!-- Section 4: Rate Limiting -->
      <div class="nlp-section">
        <div class="nlp-section-header"><span class="nlp-section-num">4</span> Rate Limiting</div>
        <div class="nlp-section-body">
          <div class="nlp-rate-row">
            <div class="nlp-rate-field">
              <label class="nlp-rate-label">Max Requests</label>
              <div class="nlp-number-wrap">
                <input type="number" class="nlp-number-input" value="${nlpRate.maxReq}" id="nlp-maxreq" min="1">
                <div class="nlp-number-btns">
                  <button onclick="document.getElementById('nlp-maxreq').stepUp()">▲</button>
                  <button onclick="document.getElementById('nlp-maxreq').stepDown()">▼</button>
                </div>
              </div>
              <div class="nlp-rate-hint">Maximum login/signup attempts per window</div>
            </div>
            <div class="nlp-rate-field">
              <label class="nlp-rate-label">Window (minutes)</label>
              <div class="nlp-number-wrap">
                <input type="number" class="nlp-number-input" value="${windowMins}" id="nlp-window" min="1">
                <div class="nlp-number-btns">
                  <button onclick="document.getElementById('nlp-window').stepUp()">▲</button>
                  <button onclick="document.getElementById('nlp-window').stepDown()">▼</button>
                </div>
              </div>
              <div class="nlp-rate-hint">Time window for the limit</div>
            </div>
            <button class="nlp-save-btn" style="align-self:center;margin-top:16px" onclick="saveNlpRate()">Save</button>
          </div>
        </div>
      </div>

    </div>`;
}

/* ── NLP Actions ── */
window.updateNlpThreshold = function(val) {
  nlpThreshold = parseFloat(val);
  const display = document.querySelector('.nlp-threshold-display');
  if (display) display.textContent = nlpThreshold.toFixed(2);
  const slider = document.getElementById('nlp-threshold');
  if (slider) slider.style.setProperty('--pct', (nlpThreshold * 100).toFixed(1) + '%');
};

window.resetNlpThreshold = function() {
  nlpThreshold = 0.60;
  const el = document.getElementById('admin-content-area');
  if (el) el.innerHTML = renderNLPEngine();
};

window.saveNlpThreshold = async function() {
  try {
    await adminPost('/api/admin/nlp/config', { threshold: nlpThreshold });
    const btn = document.querySelector('.nlp-threshold-display');
    if (btn) { const old = btn.textContent; btn.textContent = '✓ Saved'; setTimeout(() => { btn.textContent = nlpThreshold.toFixed(2); }, 1500); }
  } catch (err) { alert('Error: ' + err.message); }
};

window.updateNlpWeight = function(key, val) {
  nlpWeights[key] = parseFloat(val);
  const idMap = { vote: 'nlp-vote', fresh: 'nlp-fresh', novel: 'nlp-novel', diverse: 'nlp-div' };
  const valEl = document.getElementById(idMap[key] + '-val');
  if (valEl) valEl.textContent = parseFloat(val).toFixed(2);
  const slider = document.getElementById(idMap[key]);
  if (slider) slider.style.setProperty('--pct', (parseFloat(val) * 100).toFixed(1) + '%');
  const total = nlpWeights.vote + nlpWeights.fresh + nlpWeights.novel + nlpWeights.diverse;
  const totalRow = document.querySelector('.nlp-total-row');
  if (totalRow) {
    const ok = Math.abs(total - 1.00) < 0.001;
    totalRow.className = 'nlp-total-row ' + (ok ? 'ok' : 'err');
    totalRow.innerHTML = `Total: ${total.toFixed(2)} <span class="${ok?'nlp-check':'nlp-warn'}">${ok ? IC.check : '≠ 1.00'}</span>`;
  }
};

window.saveNlpWeights = async function() {
  try {
    await adminPost('/api/admin/nlp/config', { weights: nlpWeights });
    alert('Scoring weights saved!');
  } catch (err) { alert('Error: ' + err.message); }
};

window.saveNlpRate = async function() {
  const maxReq   = parseInt(document.getElementById('nlp-maxreq')?.value || nlpRate.maxReq);
  const windowMs = parseInt(document.getElementById('nlp-window')?.value  || 15) * 60000;
  try {
    await adminPost('/api/admin/nlp/config', { rateLimiting: { maxRequests: maxReq, windowMs } });
    nlpRate = { maxReq, windowMs };
    alert('Rate limiting config saved!');
  } catch (err) { alert('Error: ' + err.message); }
};

window.swapNlpQuestions = function() {
  const tmp = nlpTest.a;
  nlpTest.a = nlpTest.b;
  nlpTest.b = tmp;
  nlpTest.result = null;
  const el = document.getElementById('admin-content-area');
  if (el) el.innerHTML = renderNLPEngine();
};

window.runNlpCompare = async function() {
  const qa = document.getElementById('nlp-qa')?.value?.trim();
  const qb = document.getElementById('nlp-qb')?.value?.trim();
  if (!qa || !qb) { alert('Please enter both questions.'); return; }
  nlpTest.a = qa;
  nlpTest.b = qb;
  nlpTest.loading = true;
  nlpTest.result = null;
  const el = document.getElementById('admin-content-area');
  if (el) el.innerHTML = renderNLPEngine();
  try {
    const data = await adminPost('/api/admin/nlp/compare', { a: qa, b: qb });
    nlpTest.result = data.score;
    nlpTest.wouldMerge = data.wouldMerge;
  } catch (err) {
    nlpTest.result = 0;
    nlpTest.wouldMerge = false;
  }
  nlpTest.loading = false;
  const el2 = document.getElementById('admin-content-area');
  if (el2) el2.innerHTML = renderNLPEngine();
};
