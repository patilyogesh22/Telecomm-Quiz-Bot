/* ═══════════════════════════════════════════════════
   TeleBot — script.js
   Full SPA logic: navigation, quiz engine, tutor chat,
   plan explorer, vector DB viewer
═══════════════════════════════════════════════════ */

"use strict";

// ── Config ────────────────────────────────────────
// API base — relative when served by Flask, absolute for file:// fallback
const API = (window.location.protocol === "file:")
  ? "http://localhost:5000/api"
  : "/api";

// ── State ─────────────────────────────────────────
const state = {
  sessionScore:  0,
  quizQuestions: [],
  quizIndex:     0,
  quizCorrect:   0,
  quizWrong:     0,
  quizDifficulty:"all",
  chatHistory:   [],
  llmOnline:     false,
};

// ══════════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════════
function navigate(pageId, btnEl) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));

  document.getElementById("pg-" + pageId).classList.add("active");
  if (btnEl) btnEl.classList.add("active");

  const labels = { home:"HOME", quiz:"QUIZ MODE", tutor:"AI TUTOR", plans:"PLAN EXPLORER", vdb:"VECTOR DB" };
  document.getElementById("topbar-page").textContent = labels[pageId] || pageId.toUpperCase();

  if (pageId === "plans") renderPlans(PLANS_LOCAL);
}

// ══════════════════════════════════════════════════
//  HEALTH CHECK
// ══════════════════════════════════════════════════
async function checkHealth() {
  try {
    const r = await fetch(`${API}/health`, { signal: AbortSignal.timeout(3000) });
    const d = await r.json();
    state.llmOnline = d.llm_available;
    updateLLMPill(state.llmOnline);
    if (d.vectordb) updateVDBStats(d.vectordb);
  } catch {
    updateLLMPill(false);
  }
}

function updateLLMPill(online) {
  const pill = document.getElementById("llm-pill");
  if (!pill) return;
  pill.className = "llm-pill " + (online ? "on" : "off");
  pill.innerHTML = (online ? "● AI ONLINE" : "○ AI OFFLINE");
}

function updateVDBStats(stats) {
  setText("vdb-plans-n",    stats.plans_indexed    ?? "—");
  setText("vdb-concepts-n", stats.concepts_indexed ?? "—");
  setText("vdb-model",      stats.embedding_model  ?? "—");
  setText("vdb-metric",     stats.similarity_metric ?? "—");
}

// ══════════════════════════════════════════════════
//  QUIZ ENGINE
// ══════════════════════════════════════════════════

// ── Difficulty filter ──────────────────────────
function setDifficulty(diff, btn) {
  state.quizDifficulty = diff;
  document.querySelectorAll(".fbtn").forEach(b => {
    b.classList.remove("active", "easy", "medium", "hard");
  });
  btn.classList.add("active");
  if (diff !== "all") btn.classList.add(diff);
}

// ── Start quiz ─────────────────────────────────
async function startQuiz() {
  setEl("quiz-start",  "display", "none");
  setEl("quiz-active", "display", "block");
  document.getElementById("score-screen").classList.remove("show");

  state.quizIndex   = 0;
  state.quizCorrect = 0;
  state.quizWrong   = 0;

  try {
    const r = await fetch(`${API}/quiz/questions?difficulty=${state.quizDifficulty}&count=8`);
    const d = await r.json();
    state.quizQuestions = d.questions;
  } catch {
    // Fallback to local questions if backend is down
    state.quizQuestions = QUESTIONS_LOCAL.filter(
      q => state.quizDifficulty === "all" || q.difficulty === state.quizDifficulty
    );
    if (!state.quizQuestions.length) state.quizQuestions = QUESTIONS_LOCAL;
    state.quizQuestions = shuffle(state.quizQuestions).slice(0, 8);
  }

  renderQuestion();
}

// ── Render a question ─────────────────────────
function renderQuestion() {
  const q     = state.quizQuestions[state.quizIndex];
  const total = state.quizQuestions.length;

  // Progress
  setText("q-prog-lbl",   `QUESTION ${state.quizIndex + 1} OF ${total}`);
  setText("q-score-lbl",  `SCORE: ${state.sessionScore}`);
  document.getElementById("prog-fill").style.width = `${(state.quizIndex / total) * 100}%`;

  // Meta
  setText("q-idx", `Q${String(state.quizIndex + 1).padStart(2, "0")}`);
  renderDiffBadge(q.difficulty);
  renderTopicBadge(q.topic);
  setText("q-text", q.question);

  // Options
  const container = document.getElementById("options");
  container.innerHTML = Object.entries(q.options)
    .map(([key, val]) => `
      <button class="opt" onclick="selectAnswer('${key}','${q.id}',this)">
        <span class="opt-ltr">${key}</span>
        <span class="opt-txt">${val}</span>
      </button>`)
    .join("");

  // Reset explanation + next btn
  const exp = document.getElementById("exp-card");
  exp.className = "exp-card";
  hide("next-btn");
}

function renderDiffBadge(diff) {
  const el = document.getElementById("q-diff-badge");
  const map = { easy: "badge-lime", medium: "badge-amber", hard: "badge-red" };
  el.className = `badge ${map[diff] || "badge-ice"}`;
  el.textContent = diff.toUpperCase();
}

function renderTopicBadge(topic) {
  const el = document.getElementById("q-topic-badge");
  el.className = "badge badge-ice";
  el.textContent = topic;
}

// ── Select answer ─────────────────────────────
async function selectAnswer(answer, questionId, btnEl) {
  // Disable all options immediately
  document.querySelectorAll(".opt").forEach(b => (b.disabled = true));

  // Show thinking state
  const expCard = document.getElementById("exp-card");
  expCard.className = "exp-card show ok";
  document.getElementById("exp-head").innerHTML = "";
  document.getElementById("exp-body").innerHTML = `
    <div class="thinking">
      <span>ANALYZING WITH RAG + LLM</span>
      <div class="dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
    </div>`;

  let isCorrect = false, correctKey = "", explanation = "";

  try {
    const r = await fetch(`${API}/quiz/submit`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ question_id: questionId, answer }),
    });
    const d = await r.json();
    isCorrect  = d.is_correct;
    correctKey = d.correct_answer;
    explanation = d.explanation;
  } catch {
    // Fallback: local validation
    const qDef = QUESTIONS_LOCAL.find(q => q.id === questionId);
    if (qDef) {
      isCorrect  = answer === qDef.correct;
      correctKey = qDef.correct;
      explanation = isCorrect
        ? `**✅ Correct!**\n\nThe answer is **${qDef.options[qDef.correct]}**.\n\n**💡 Key Takeaway:**\nReview the plan details to reinforce this knowledge.`
        : `**❌ Not quite!**\n\nThe correct answer is **${qDef.options[qDef.correct]}**.\n\n**📡 Technical Context:**\nReview the Plan Explorer section for details.\n\n**💡 Key Takeaway:**\nEvery wrong answer is progress — keep going!`;
    }
  }

  // Update score
  if (isCorrect) {
    state.quizCorrect++;
    state.sessionScore += 10;
    setText("q-score-lbl", `SCORE: ${state.sessionScore}`);
    setText("topbar-score", state.sessionScore);
  } else {
    state.quizWrong++;
  }

  // Mark options
  document.querySelectorAll(".opt").forEach(b => {
    const key = b.querySelector(".opt-ltr").textContent;
    if (key === correctKey)                    b.classList.add("correct");
    else if (key === answer && !isCorrect)     b.classList.add("wrong");
  });

  // Show explanation
  expCard.className = `exp-card show ${isCorrect ? "ok" : "fail"}`;
  document.getElementById("exp-head").innerHTML = isCorrect ? "✅ Excellent!" : "❌ Here's what to know:";
  document.getElementById("exp-body").innerHTML = mdBold(explanation);

  show("next-btn");
}

// ── Next question ─────────────────────────────
function nextQuestion() {
  state.quizIndex++;
  if (state.quizIndex >= state.quizQuestions.length) {
    showScore();
  } else {
    renderQuestion();
    document.getElementById("prog-fill").style.width =
      `${(state.quizIndex / state.quizQuestions.length) * 100}%`;
  }
}

// ── Show score screen ─────────────────────────
function showScore() {
  hide("quiz-active");
  const sc    = document.getElementById("score-screen");
  const total = state.quizQuestions.length;
  const pct   = Math.round((state.quizCorrect / total) * 100);

  sc.classList.add("show");
  setText("sc-emoji",   pct >= 90 ? "🏆" : pct >= 70 ? "🎯" : pct >= 50 ? "📡" : "💪");
  setText("sc-title",   pct >= 90 ? "Outstanding!" : pct >= 70 ? "Well Done!" : pct >= 50 ? "Good Progress!" : "Keep Practicing!");
  setText("sc-pct",     pct + "%");
  setText("sc-sub",     `${state.quizCorrect} correct out of ${total} questions`);
  setText("sc-correct", state.quizCorrect);
  setText("sc-wrong",   state.quizWrong);
  setText("sc-score",   state.sessionScore);

  // Color correct/wrong
  document.getElementById("sc-correct").style.color = "var(--lime)";
  document.getElementById("sc-wrong").style.color   = "var(--red)";
}

function resetQuiz() {
  document.getElementById("score-screen").classList.remove("show");
  setEl("quiz-start",  "display", "block");
  setEl("quiz-active", "display", "none");
}

// ══════════════════════════════════════════════════
//  AI TUTOR CHAT
// ══════════════════════════════════════════════════
function useSuggestion(el) {
  document.getElementById("chat-ta").value = el.textContent;
  document.getElementById("sugg-chips").style.display = "none";
  sendMessage();
}

async function sendMessage() {
  const ta  = document.getElementById("chat-ta");
  const msg = ta.value.trim();
  if (!msg) return;

  ta.value = "";
  ta.style.height = "auto";
  appendMsg(msg, "user");

  document.getElementById("send-btn").disabled = true;

  const thinkId = "think_" + Date.now();
  appendThinking(thinkId);

  try {
    const r = await fetch(`${API}/tutor/chat`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ message: msg, history: state.chatHistory }),
    });
    const d = await r.json();
    removeThinking(thinkId);
    appendMsg(d.response, "bot");
    state.chatHistory.push({ role: "user",      content: msg });
    state.chatHistory.push({ role: "assistant", content: d.response });
    if (state.chatHistory.length > 20) state.chatHistory = state.chatHistory.slice(-20);
  } catch {
    removeThinking(thinkId);
    appendMsg(
      "⚠️ Backend is offline. Start the server:\n```\ncd backend\npython app.py\n```\nThe Quiz and Plan Explorer still work with local data!",
      "bot"
    );
  }

  document.getElementById("send-btn").disabled = false;
}

function appendMsg(text, type) {
  const box = document.getElementById("chat-box");
  const div = document.createElement("div");
  div.className = `msg ${type}`;
  div.innerHTML = `
    <div class="msg-av ${type === "bot" ? "bot" : "usr"}">${type === "bot" ? "📡" : "👤"}</div>
    <div class="msg-bub">${mdBold(text).replace(/\n/g, "<br>")}</div>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function appendThinking(id) {
  const box = document.getElementById("chat-box");
  const div = document.createElement("div");
  div.className = "msg bot"; div.id = id;
  div.innerHTML = `<div class="msg-av bot">📡</div>
    <div class="msg-bub"><div class="thinking">
      <span>Thinking</span>
      <div class="dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
    </div></div>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}
function removeThinking(id) { document.getElementById(id)?.remove(); }

// ══════════════════════════════════════════════════
//  PLAN EXPLORER
// ══════════════════════════════════════════════════
const TYPE_BADGE = {
  "prepaid":              "badge-lime",
  "postpaid":             "badge-ice",
  "postpaid enterprise":  "badge-ice",
  "international roaming":"badge-amber",
  "iot / m2m (machine-to-machine)": "badge-red",
};

function renderPlans(plans) {
  const grid = document.getElementById("plans-grid");
  if (!plans || !plans.length) {
    grid.innerHTML = `<div style="color:var(--text-dim);font-size:14px">No plans found.</div>`;
    return;
  }
  grid.innerHTML = plans.map(p => {
    const type  = (p.type || "").toLowerCase();
    const badge = TYPE_BADGE[type] || "badge-ice";
    const price = p.price ? p.price.replace("INR", "₹").replace("/month", "/mo") : "—";
    const feats = (p.features || []).map(f => `<span class="pfeat">${f.trim()}</span>`).join("");
    return `
      <div class="plan-card">
        <div class="plan-top">
          <div>
            <div class="plan-name">${p.name}</div>
            <span class="badge ${badge}" style="margin-top:6px">${p.type?.toUpperCase() || "PLAN"}</span>
          </div>
          <div class="plan-price">${price}</div>
        </div>
        <div class="plan-specs">
          <div><div class="spec-lbl">DATA</div><div class="spec-val">${p.data || "—"}</div></div>
          <div><div class="spec-lbl">SPEED</div><div class="spec-val">${p.speed || "—"}</div></div>
          <div><div class="spec-lbl">CALLS</div><div class="spec-val">${p.calls || "—"}</div></div>
          <div><div class="spec-lbl">VALIDITY</div><div class="spec-val">${p.validity || "—"}</div></div>
        </div>
        <div class="plan-bestfor"><strong>Best for:</strong> ${p.best_for || "—"}</div>
        <div class="plan-feats">${feats}</div>
      </div>`;
  }).join("");
}

function filterPlans(query) {
  if (!query.trim()) { renderPlans(PLANS_LOCAL); return; }
  const q = query.toLowerCase();
  const filtered = PLANS_LOCAL.filter(p =>
    p.name.toLowerCase().includes(q) ||
    (p.type||"").toLowerCase().includes(q) ||
    (p.best_for||"").toLowerCase().includes(q) ||
    (p.features||[]).some(f => f.toLowerCase().includes(q)) ||
    (p.data||"").toLowerCase().includes(q) ||
    (p.speed||"").toLowerCase().includes(q) ||
    (p.description||"").toLowerCase().includes(q)
  );
  renderPlans(filtered.length ? filtered : PLANS_LOCAL);
}

// ══════════════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════════════
function toast(msg, icon = "✓") {
  const t = document.getElementById("toast");
  document.getElementById("toast-icon").textContent = icon;
  document.getElementById("toast-msg").textContent  = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3000);
}

// ══════════════════════════════════════════════════
//  UTILITY
// ══════════════════════════════════════════════════
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function setEl(id, prop, val) { const el = document.getElementById(id); if (el) el.style[prop] = val; }
function show(id) { const el = document.getElementById(id); if (el) el.style.display = ""; }
function hide(id) { const el = document.getElementById(id); if (el) el.style.display = "none"; }
function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }
function mdBold(text) { return (text || "").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>"); }

// ══════════════════════════════════════════════════
//  LOCAL FALLBACK DATA
// ══════════════════════════════════════════════════

const PLANS_LOCAL = [
  { name:"BasicConnect 4G",   type:"Prepaid",               price:"₹199/month",  data:"1GB",                    speed:"4G LTE 25 Mbps",        calls:"100 min",     validity:"28 days",  features:["No contract","Auto-renewal","Data rollover"],                                      best_for:"Light users, backup SIM, elderly users",           description:"Entry-level prepaid plan with 1GB 4G data, 100 minutes, 100 SMS for 28 days." },
  { name:"SmartDaily 5G",     type:"Prepaid",               price:"₹299/month",  data:"2GB/day",                speed:"5G 1 Gbps",              calls:"Unlimited",   validity:"28 days",  features:["5G ready","Netflix basic","Wi-Fi calling","Daily reset"],                         best_for:"Streaming, remote work, heavy daily users",         description:"Daily 2GB 5G plan with Netflix basic subscription." },
  { name:"FamilyShare Pro",   type:"Postpaid",              price:"₹999/month",  data:"100GB shared (4 members)",speed:"5G/4G 500 Mbps",        calls:"Unlimited",   validity:"30 days",  features:["4 members","Disney+ Hotstar","Intl roaming 20 countries","Priority support"],     best_for:"Families, multiple devices, frequent travelers",    description:"Premium family postpaid plan with 100GB shared 5G data." },
  { name:"BusinessElite 5G",  type:"Postpaid Enterprise",   price:"₹1499/month", data:"Unlimited",              speed:"5G Priority 2 Gbps",    calls:"Unlim + 500 intl", validity:"30 days", features:["Static IP","VPN","Microsoft 365","Cloud 100GB","SLA 99.9%","IoT Portal"],   best_for:"Enterprises, IoT deployments, remote teams",        description:"Enterprise 5G with static IP, VPN, Microsoft 365, and 99.9% SLA." },
  { name:"TravelGlobal SIM",  type:"International Roaming", price:"₹2499/month", data:"5GB intl + Unlim domestic",speed:"4G global / 5G partner",calls:"200 intl min", validity:"30 days", features:["150+ countries","No roaming charges","Lounge 2x/month","Travel insurance"],  best_for:"International travelers, expats, digital nomads",   description:"Global SIM with 150+ country coverage and airport lounge access." },
  { name:"IoTConnect M2M",    type:"IoT / M2M (Machine-to-Machine)", price:"₹49/SIM/month", data:"500MB",       speed:"NB-IoT / LTE-M",        calls:"N/A",         validity:"30 days",  features:["NB-IoT","LTE-M","Bulk SIM portal","API access","FOTA support","Dashboard"],     best_for:"Smart meters, GPS trackers, sensors, industrial IoT", description:"M2M SIM supporting NB-IoT and LTE-M with bulk management API." },
  { name:"StudentFlex",       type:"Prepaid",               price:"₹149/56 days", data:"1.5GB/day",             speed:"4G LTE 150 Mbps",       calls:"Unlimited",   validity:"56 days",  features:["Education zero-rating","Google One 15GB","Night unlimited","56-day validity"],   best_for:"Students, e-learning, budget-conscious youth",      description:"Student plan with 56-day validity and zero-rated education apps." },
  { name:"StreamMax 5G",      type:"Postpaid",              price:"₹699/month",  data:"75GB",                   speed:"5G 1.5 Gbps",           calls:"Unlimited",   validity:"30 days",  features:["4K optimized","Netflix+Prime+Hotstar+SonyLIV+Zee5","Binge-On mode","mmWave metro"], best_for:"Entertainment, gaming, 4K streaming, smart homes", description:"Entertainment 5G plan with full OTT bundle and 4K optimization." },
];

const QUESTIONS_LOCAL = [
  { id:"q001", question:"Which telecom plan is specifically designed for IoT and Machine-to-Machine (M2M) communication?",       options:{A:"SmartDaily 5G",      B:"IoTConnect M2M",                         C:"BusinessElite 5G",              D:"BasicConnect 4G"},           correct:"B", difficulty:"easy",   topic:"IoT Plans" },
  { id:"q002", question:"The FamilyShare Pro plan allows data sharing among how many members maximum?",                          options:{A:"2 members",          B:"3 members",                              C:"4 members",                     D:"6 members"},                 correct:"C", difficulty:"easy",   topic:"Family Plans" },
  { id:"q003", question:"Which plan offers a Static IP address — critical for hosting servers and VPNs?",                        options:{A:"FamilyShare Pro",    B:"StreamMax 5G",                           C:"BusinessElite 5G",              D:"TravelGlobal SIM"},          correct:"C", difficulty:"medium", topic:"Business Plans" },
  { id:"q004", question:"What maximum data speed does the BusinessElite 5G plan deliver on its priority 5G network?",            options:{A:"Up to 150 Mbps",     B:"Up to 500 Mbps",                         C:"Up to 1 Gbps",                  D:"Up to 2 Gbps"},              correct:"D", difficulty:"medium", topic:"Network Speeds" },
  { id:"q005", question:"StudentFlex zero-rates (doesn't count toward data) which category of applications?",                   options:{A:"Gaming apps",        B:"Social media apps",                      C:"Education apps",                D:"Entertainment apps"},        correct:"C", difficulty:"easy",   topic:"Special Plans" },
  { id:"q006", question:"Which two low-power wireless protocols does the IoTConnect M2M plan explicitly support?",               options:{A:"3G and 4G LTE",      B:"NB-IoT and LTE-M",                       C:"WiFi 6 and Bluetooth 5",        D:"LoRa and Zigbee"},           correct:"B", difficulty:"hard",   topic:"IoT Protocols" },
  { id:"q007", question:"The TravelGlobal SIM plan provides international coverage in how many countries?",                      options:{A:"50+ countries",      B:"75+ countries",                          C:"100+ countries",                D:"150+ countries"},            correct:"D", difficulty:"easy",   topic:"International Plans" },
  { id:"q008", question:"Which plan includes Microsoft 365 Basic as a bundled enterprise benefit?",                              options:{A:"StudentFlex",        B:"FamilyShare Pro",                        C:"BusinessElite 5G",              D:"SmartDaily 5G"},             correct:"C", difficulty:"medium", topic:"Plan Benefits" },
  { id:"q009", question:"What is the validity period of the StudentFlex prepaid plan?",                                          options:{A:"28 days",            B:"30 days",                                C:"56 days",                       D:"84 days"},                   correct:"C", difficulty:"easy",   topic:"Plan Validity" },
  { id:"q010", question:"The StreamMax 5G plan is specifically optimized for which maximum video streaming resolution?",          options:{A:"720p HD",            B:"1080p Full HD",                          C:"4K UHD",                        D:"8K"},                        correct:"C", difficulty:"medium", topic:"Streaming Plans" },
  { id:"q011", question:"What key latency advantage does 5G provide over 4G LTE for real-time applications?",                   options:{A:"5G has 100ms vs 4G 50ms", B:"5G achieves <1ms vs 4G's typical 20-50ms", C:"Both technologies have identical latency", D:"4G LTE has lower latency"}, correct:"B", difficulty:"hard", topic:"5G Technology" },
  { id:"q012", question:"Which plan includes airport lounge access as a bundled travel benefit?",                                options:{A:"BusinessElite 5G",   B:"FamilyShare Pro",                        C:"TravelGlobal SIM",              D:"StreamMax 5G"},              correct:"C", difficulty:"medium", topic:"Travel Benefits" },
  { id:"q013", question:"What SLA uptime percentage does the BusinessElite 5G plan guarantee?",                                  options:{A:"95% uptime",         B:"98% uptime",                             C:"99.5% uptime",                  D:"99.9% uptime"},              correct:"D", difficulty:"medium", topic:"Enterprise SLA" },
  { id:"q014", question:"NB-IoT operates in which type of spectrum, making it reliable and interference-free?",                  options:{A:"Unlicensed ISM band (2.4GHz)", B:"Licensed cellular spectrum",  C:"Free-space optical spectrum",   D:"TVWS (TV White Space)"},     correct:"B", difficulty:"hard",   topic:"IoT Protocols" },
  { id:"q015", question:"Which plan offers 'Binge-On' mode where video on partner apps doesn't count toward data?",              options:{A:"SmartDaily 5G",      B:"FamilyShare Pro",                        C:"StreamMax 5G",                  D:"BasicConnect 4G"},           correct:"C", difficulty:"medium", topic:"Streaming Plans" },
];

// ══════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
  checkHealth();
  renderPlans(PLANS_LOCAL);

  // Auto-resize chat textarea
  const ta = document.getElementById("chat-ta");
  if (ta) {
    ta.addEventListener("input", () => {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 110) + "px";
    });
    ta.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  // Ping backend every 30s
  setInterval(checkHealth, 30000);
});