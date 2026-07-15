/* ============================================================
   Question Detail Page
   Reads from SessionStore — single source of truth for questions.
   ============================================================ */
import { icons } from "../utils/icons.js";
import { state } from "../state.js";
import { shell, phone, questionCard } from "../components/shared.js";
import { getSessionState, selectRankedQuestions, dispatch } from "../store/SessionStore.js";
import { getSocket } from "../hooks/socket.js";

export function renderQuestionDetail(id = "q1") {
  // Read from SessionStore — never from state.questions
  const ss = getSessionState();
  const ranked = selectRankedQuestions(ss);
  const question = ranked.find(q => q.id === id) || ranked[0] || {
    id, text: "Loading…", votes: 0, score: 0, status: "Pending",
    similar: 0, clusterSize: 1, summary: "", timeline: []
  };

  /* Moderator panel for desktop side */
  const moderatorPanel = `
    <div class="panel" style="padding:22px">
      <div class="row">
        <div>
          <h1 class="title">Live Session Control</h1>
          <p class="subtle" style="margin-top:4px">Speaker and moderator surfaces share the same ranked queue.</p>
        </div>
      </div>
    </div>
    <div class="wide-cards">
      ${[[ss.stats.questionsCount || ranked.length, "Questions"],
         [ranked.filter(q => q.similar > 1).length, "Clustered"],
         [ss.stats.upvotesCount || ranked.reduce((s,q)=>s+(q.votes||0),0), "Upvotes"],
         ["38ms", "Latency"]].map(([value, label]) => `
        <div class="stat-card" style="text-align:center">
          <strong>${value}</strong>
          <span class="subtle">${label}</span>
        </div>
      `).join("")}
    </div>
    <div class="chart-card stack">
      <h2 class="screen-title">Top 3 Questions</h2>
      ${ranked.slice(0, 3).map((q, i) => questionCard(q, i, true)).join("")}
    </div>
  `;

  shell(phone(`
    <div class="row">
      <div>
        <h1 class="screen-title">Question Detail</h1>
        <p class="subtle">Cluster, score, timeline, and status.</p>
      </div>
      <span class="badge">#${ranked.indexOf(question) + 1 || 1}</span>
    </div>

    <section class="panel stack" style="margin:18px 0;padding:18px">
      <h2 style="font-size:17px;font-weight:700">${question.text}</h2>
      <div class="meta" style="gap:14px">
        <span>${icons.thumbsUp} ${question.votes} upvotes</span>
        <span>${icons.users} ${question.clusterSize || question.similar || 1} cluster</span>
        <span>${icons.star} Score ${(question.score || 0).toFixed(2)}</span>
      </div>
      <span class="badge ${question.status === "Answered" ? "success" : "warning"}" style="justify-self:start">${question.status}</span>
    </section>

    <section class="chart-card stack" style="margin-bottom:14px">
      <h2 class="screen-title">${icons.zap} AI Summary</h2>
      <p style="font-size:14px;color:var(--ink-secondary);line-height:1.6">${question.summary || "This cluster contains related audience questions and is ranked using upvotes, recency, diversity, and novelty."}</p>
    </section>

    <section class="chart-card stack">
      <h2 class="screen-title">${icons.clock} Timeline</h2>
      ${(question.timeline || ["Submitted", "Clustered", "Ranked"]).map(item => `
        <div class="timeline-row">
          <span class="timeline-dot"></span>
          <span>${item}</span>
        </div>
      `).join("")}
    </section>

    <h3 style="font-size:14px;font-weight:600;margin:18px 0 10px">Moderator Actions</h3>
    <div class="stack" style="gap:8px">
      <button class="btn" style="width:100%" onclick="qDetailMarkAnswered('${question.id}')">${icons.check} Mark Answered</button>
      <button class="btn secondary" style="width:100%" onclick="qDetailSetStatus('${question.id}', 'Deferred')">${icons.pause} Defer</button>
      <button class="btn secondary" style="width:100%" onclick="qDetailSetStatus('${question.id}', 'Skipped')">${icons.skipForward} Skip</button>
      <button class="btn secondary" style="width:100%" onclick="qDetailSetStatus('${question.id}', 'Flagged')">${icons.flag} Flag</button>
    </div>
  `, "activity", true), moderatorPanel);

  // Register global handlers for this page
  window.qDetailMarkAnswered = (id) => {
    const socket = getSocket();
    socket.emit("mark_answered", { questionId: id, meetingId: state.session.sessionId });
    dispatch({ type: "QUESTION_ANSWERED", payload: { id } });
  };
  window.qDetailSetStatus = (id, status) => {
    const socket = getSocket();
    const event = status === "Deferred" ? "mark_deferred"
                : status === "Flagged"  ? "mark_flagged"
                : "mark_skipped";
    socket.emit(event, { questionId: id, meetingId: state.session.sessionId });
    dispatch({ type: "QUESTION_STATUS", payload: { id, status } });
  };
}
