"use strict";
const API = window.location.protocol === "file:" ? "http://localhost:5000/api" : "/api";

const S = { score:0, qqs:[], qi:0, qc:0, qw:0, diff:"all", history:[], llmOn:false };

// ── Navigation ──────────────────────────────────────────────
function navigate(id, btn) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nb").forEach(b => b.classList.remove("active"));
  document.getElementById("pg-" + id).classList.add("active");
  if (btn) btn.classList.add("active");
  const labels = { home:"Dashboard", quiz:"Quiz Mode", tutor:"AI Tutor", plans:"Plan Explorer", vdb:"Vector DB" };
  setText("tb-page", labels[id] || id);
  if (id === "plans") renderPlans(PLANS);
  document.querySelector(".sidebar")?.classList.remove("open");
}
function toggleSidebar() { document.querySelector(".sidebar")?.classList.toggle("open"); }

// ── Health check ────────────────────────────────────────────
async function checkHealth() {
  const pill = document.getElementById("llm-pill");
  const led  = document.getElementById("sys-led");
  const stxt = document.getElementById("sys-txt");
  const atxt = document.getElementById("ai-txt");
  try {
    const r = await fetch(`${API}/health`, { signal: AbortSignal.timeout(4000) });
    const d = await r.json();
    S.llmOn = d.llm_available;
    pill.className = "chip " + (d.llm_available ? "on" : "off");
    atxt.textContent = d.llm_available ? "Gemini Online" : "Set API Key";
    led.className  = "sys-led " + (d.llm_available ? "on" : "off");
    stxt.textContent = d.llm_available ? "System Online" : "AI Key Missing";
    if (d.vectordb) {
      setText("vdb-plans",    d.vectordb.plans_indexed    ?? 8);
      setText("vdb-concepts", d.vectordb.concepts_indexed ?? 11);
      setText("vdb-metric",   d.vectordb.similarity_metric ?? "cosine");
    }
  } catch {
    pill.className = "chip off"; atxt.textContent = "Backend Offline";
    led.className  = "sys-led off"; stxt.textContent = "Backend Offline";
  }
}

// ── Quiz ────────────────────────────────────────────────────
function setDiff(d, btn) {
  S.diff = d;
  document.querySelectorAll(".dt").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
}

async function startQuiz() {
  hide("quiz-start"); show("quiz-active"); hide("score-screen");
  S.qi = 0; S.qc = 0; S.qw = 0;
  try {
    const r = await fetch(`${API}/quiz/questions?difficulty=${S.diff}&count=8`);
    const d = await r.json();
    S.qqs = d.questions;
  } catch {
    S.qqs = shuffle(QUESTIONS.filter(q => S.diff === "all" || q.difficulty === S.diff) || QUESTIONS).slice(0, 8);
  }
  renderQ();
}

function renderQ() {
  const q = S.qqs[S.qi], tot = S.qqs.length;
  setText("q-prog-lbl",  `Q ${S.qi + 1} / ${tot}`);
  setText("q-score-lbl", `${S.score} pts`);
  document.getElementById("prog-fill").style.width = `${(S.qi / tot) * 100}%`;
  setText("q-idx", `Q${String(S.qi + 1).padStart(2, "0")}`);

  const db = document.getElementById("q-diff-b");
  db.textContent = q.difficulty.toUpperCase();
  db.className = `diff-b ${q.difficulty}`;
  setText("q-topic-b", q.topic);
  setText("q-txt", q.question);

  document.getElementById("options").innerHTML = Object.entries(q.options).map(([k, v]) => `
    <button class="opt" onclick="pick('${k}','${q.id}',this)">
      <span class="opt-k">${k}</span>
      <span class="opt-t">${v}</span>
      <span class="opt-r"></span>
    </button>`).join("");

  hide("exp-card"); hide("next-btn");

  // Card entrance
  const card = document.getElementById("q-card");
  card.style.opacity = "0"; card.style.transform = "translateY(8px)";
  requestAnimationFrame(() => {
    card.style.transition = "opacity .28s ease, transform .28s ease";
    card.style.opacity = "1"; card.style.transform = "translateY(0)";
  });
}

async function pick(ans, qid, el) {
  document.querySelectorAll(".opt").forEach(b => b.disabled = true);

  const exp  = document.getElementById("exp-card");
  const exph = document.getElementById("exp-head");
  const expb = document.getElementById("exp-body");
  exp.style.display = "block";
  exph.className = "exp-hd th"; exph.textContent = "✦ AI Explanation";
  expb.innerHTML = `<div class="tdots"><span>Analyzing with Gemini + RAG</span><div class="td"></div><div class="td"></div><div class="td"></div></div>`;

  let ok = false, ck = "", expl = "";
  try {
    const r = await fetch(`${API}/quiz/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question_id: qid, answer: ans })
    });
    const d = await r.json();
    ok = d.is_correct; ck = d.correct_answer; expl = d.explanation;
  } catch {
    const qd = QUESTIONS.find(q => q.id === qid);
    if (qd) {
      ok = ans === qd.correct; ck = qd.correct;
      expl = ok
        ? `**✅ Correct!** The answer is **${qd.options[qd.correct]}**.\n\n**💡 Tip:** Check Plan Explorer to reinforce this.`
        : `**❌ Not quite.** Correct: **${qd.options[qd.correct]}**.\n\n**📡 Context:** Check Plan Explorer for details.\n\n**💡 Tip:** Every mistake builds expertise! 💪`;
    }
  }

  if (ok) {
    S.qc++; S.score += 10;
    setText("q-score-lbl", `${S.score} pts`);
    setText("tb-score", S.score);
    setText("sb-score", S.score);
    // Score bounce animation
    const sv = document.getElementById("sb-score");
    sv.style.transform = "scale(1.3)";
    setTimeout(() => { sv.style.transform = "scale(1)"; }, 280);
    toast("✨ +10 points!");
  } else { S.qw++; }

  // Highlight options
  document.querySelectorAll(".opt").forEach(b => {
    const k  = b.querySelector(".opt-k").textContent;
    const ri = b.querySelector(".opt-r");
    if (k === ck)            { b.classList.add("correct"); ri.textContent = "✓"; }
    else if (k === ans && !ok) { b.classList.add("wrong");   ri.textContent = "✗"; }
  });

  exph.className = "exp-hd " + (ok ? "c" : "w");
  exph.innerHTML = ok
    ? `<svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"/></svg> Correct! Great job!`
    : `<svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"/></svg> Here's what to know`;
  expb.innerHTML = bold(expl).replace(/\n/g, "<br>");
  show("next-btn");

  // Smooth scroll to explanation
  setTimeout(() => exp.scrollIntoView({ behavior: "smooth", block: "nearest" }), 100);
}

function nextQ() {
  S.qi++;
  if (S.qi >= S.qqs.length) showScore();
  else {
    document.getElementById("prog-fill").style.width = `${(S.qi / S.qqs.length) * 100}%`;
    renderQ();
  }
}

function showScore() {
  hide("quiz-active");
  show("score-screen");
  const tot = S.qqs.length, pct = Math.round((S.qc / tot) * 100);
  setText("sc-emoji", pct >= 90 ? "🏆" : pct >= 70 ? "🎯" : pct >= 50 ? "📡" : "💪");
  setText("sc-title", pct >= 90 ? "Outstanding!" : pct >= 70 ? "Well Done!" : pct >= 50 ? "Good Progress!" : "Keep Practicing!");
  setText("sc-pct",   pct + "%");
  setText("sc-sub",   `${S.qc} correct out of ${tot} questions`);
  setText("sc-correct", S.qc);
  setText("sc-wrong",   S.qw);
  setText("sc-pts",     S.score);
}
function resetQuiz() { hide("score-screen"); show("quiz-start"); hide("quiz-active"); }

// ── AI Tutor ─────────────────────────────────────────────────
function sendSug(el) {
  document.getElementById("chat-ta").value = el.textContent;
  document.getElementById("sug-row").style.display = "none";
  sendMsg();
}

async function sendMsg() {
  const ta  = document.getElementById("chat-ta");
  const msg = ta.value.trim();
  if (!msg) return;
  ta.value = ""; ta.style.height = "auto";
  addMsg(msg, "user");
  document.getElementById("send-btn").disabled = true;
  const tid = "t" + Date.now();
  addThinking(tid);

  try {
    const r = await fetch(`${API}/tutor/stream`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ message: msg, history: S.history })
    });
    if (!r.ok || !r.body) throw new Error("no stream");

    removeEl(tid);
    const { bubbleEl } = addStreamMsg();
    const reader  = r.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "", buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const d = JSON.parse(line.slice(6));
          if (d.chunk) { fullText += d.chunk; bubbleEl.innerHTML = bold(fullText).replace(/\n/g, "<br>"); }
          if (d.done)  { fullText = d.full || fullText; bubbleEl.innerHTML = bold(fullText).replace(/\n/g, "<br>"); }
        } catch {}
      }
      scrollChat();
    }
    S.history.push({ role: "user", content: msg }, { role: "assistant", content: fullText });
    if (S.history.length > 20) S.history = S.history.slice(-20);

  } catch {
    try {
      removeEl(tid);
      const tid2 = "t2" + Date.now();
      addThinking(tid2);
      const r = await fetch(`${API}/tutor/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ message: msg, history: S.history })
      });
      const d = await r.json();
      removeEl(tid2);
      addMsg(d.response, "bot");
      S.history.push({ role: "user", content: msg }, { role: "assistant", content: d.response });
      if (S.history.length > 20) S.history = S.history.slice(-20);
    } catch {
      removeEl(tid);
      addMsg("⚠️ **AI Tutor offline.** Add `GEMINI_API_KEY` to `backend/.env` and restart.", "bot");
    }
  }
  document.getElementById("send-btn").disabled = false;
}

function addStreamMsg() {
  const box = document.getElementById("chat-box");
  const d   = document.createElement("div");
  const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  d.className = "msg bot";
  d.innerHTML = `<div class="av av-bot">📡</div><div class="msg-body"><div class="bubble b-bot" id="sb-${Date.now()}"></div><div class="msg-t">${now}</div></div>`;
  box.appendChild(d);
  scrollChat();
  return { el: d, bubbleEl: d.querySelector(".bubble") };
}

function addMsg(txt, type) {
  const box   = document.getElementById("chat-box");
  const d     = document.createElement("div");
  const isBot = type === "bot";
  const now   = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  d.className = `msg ${type}`;
  d.innerHTML = `
    <div class="av ${isBot ? "av-bot" : "av-user"}">${isBot ? "📡" : "You"}</div>
    <div class="msg-body">
      <div class="bubble ${isBot ? "b-bot" : "b-user"}">${bold(txt).replace(/\n/g, "<br>")}</div>
      <div class="msg-t">${now}</div>
    </div>`;
  box.appendChild(d);
  scrollChat();
}

function addThinking(id) {
  const box = document.getElementById("chat-box");
  const d   = document.createElement("div");
  d.id = id; d.className = "msg bot";
  d.innerHTML = `<div class="av av-bot">📡</div><div class="msg-body"><div class="bubble b-bot"><div class="tdots"><span>Thinking</span><div class="td"></div><div class="td"></div><div class="td"></div></div></div></div>`;
  box.appendChild(d);
  scrollChat();
}
function removeEl(id) { document.getElementById(id)?.remove(); }
function scrollChat() { const b = document.getElementById("chat-box"); b.scrollTop = b.scrollHeight; }

// ── Plans ────────────────────────────────────────────────────
function renderPlans(plans) {
  const g = document.getElementById("plans-grid");
  if (!plans?.length) { g.innerHTML = `<p style="color:var(--txt3);padding:20px">No plans found.</p>`; return; }
  g.innerHTML = plans.map(p => {
    const t  = (p.type || "").toLowerCase();
    const bc = t.includes("iot") ? "iot" : t.includes("international") ? "int" : t.includes("enterprise") ? "ent" : t.includes("postpaid") ? "pos" : "pre";
    const pr = (p.price || "—").replace("INR", "₹").replace("/month", "/mo");
    const fs = (p.features || []).slice(0, 4).map(f => `<span class="plan-f">${f.trim()}</span>`).join("");
    return `<div class="plan-c">
      <div class="plan-top">
        <div class="plan-nm">${p.name}</div>
        <span class="pb ${bc}">${(p.type || "PLAN").toUpperCase()}</span>
      </div>
      <div class="plan-price">${pr}</div>
      <div class="plan-sg">
        <div><div class="plan-sl">Data</div><div class="plan-sv">${p.data || "—"}</div></div>
        <div><div class="plan-sl">Speed</div><div class="plan-sv">${p.speed || "—"}</div></div>
        <div><div class="plan-sl">Calls</div><div class="plan-sv">${p.calls || "—"}</div></div>
        <div><div class="plan-sl">Validity</div><div class="plan-sv">${p.validity || "—"}</div></div>
      </div>
      <div class="plan-fs">${fs}</div>
    </div>`;
  }).join("");
}

function filterPlans(q) {
  if (!q.trim()) { renderPlans(PLANS); return; }
  const lq = q.toLowerCase();
  renderPlans(PLANS.filter(p =>
    [p.name, p.type, p.best_for, p.data, p.speed, p.description, ...(p.features || [])]
      .some(v => (v || "").toLowerCase().includes(lq))
  ) || PLANS);
}

// ── Toast ────────────────────────────────────────────────────
function toast(msg, icon = "✦") {
  const t = document.getElementById("toast");
  document.getElementById("toast-ico").textContent = icon;
  document.getElementById("toast-msg").textContent = msg;
  t.classList.add("show");
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.classList.remove("show"), 2600);
}

// ── Utils ────────────────────────────────────────────────────
function setText(id, v) { const e = document.getElementById(id); if (e) e.textContent = v; }
function show(id)  { const e = document.getElementById(id); if (e) e.style.display = ""; }
function hide(id)  { const e = document.getElementById(id); if (e) e.style.display = "none"; }
function shuffle(a) { return [...a].sort(() => Math.random() - .5); }
function bold(t)   { return (t || "").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>"); }

// ── Data ─────────────────────────────────────────────────────
const PLANS = [
  { name:"BasicConnect 4G",    type:"Prepaid",              price:"₹199/month",    data:"1GB",          speed:"4G LTE 25 Mbps",   calls:"100 min",       validity:"28 days", features:["No contract","Auto-renewal","Data rollover"],                       best_for:"Light users",             description:"Entry-level 1GB 4G plan." },
  { name:"SmartDaily 5G",      type:"Prepaid",              price:"₹299/month",    data:"2GB/day",      speed:"5G 1 Gbps",        calls:"Unlimited",     validity:"28 days", features:["5G ready","Netflix basic","Wi-Fi calling","Daily reset"],            best_for:"Streaming, remote work",  description:"Daily 2GB 5G with Netflix." },
  { name:"FamilyShare Pro",    type:"Postpaid",             price:"₹999/month",    data:"100GB shared", speed:"5G/4G 500 Mbps",   calls:"Unlimited",     validity:"30 days", features:["4 members","Disney+ Hotstar","Intl roaming 20 countries"],           best_for:"Families",                description:"100GB shared family 5G." },
  { name:"BusinessElite 5G",   type:"Postpaid Enterprise",  price:"₹1499/month",   data:"Unlimited",    speed:"5G Priority 2Gbps",calls:"Unlim+500 intl",validity:"30 days", features:["Static IP","VPN","Microsoft 365","SLA 99.9%","IoT Portal"],         best_for:"Enterprises, IoT",        description:"Enterprise 5G with static IP and SLA." },
  { name:"TravelGlobal SIM",   type:"International Roaming",price:"₹2499/month",   data:"5GB intl+Unlim",speed:"4G global 150Mbps",calls:"200 intl min",  validity:"30 days", features:["150+ countries","No roaming charges","Lounge 2x/month"],            best_for:"International travelers", description:"Global SIM 150+ countries." },
  { name:"IoTConnect M2M",     type:"IoT / M2M",            price:"₹49/SIM/month", data:"500MB",        speed:"NB-IoT / LTE-M",   calls:"N/A",           validity:"30 days", features:["NB-IoT","LTE-M","Bulk SIM portal","API access","FOTA"],             best_for:"Smart meters, GPS trackers",description:"IoT/M2M SIM with NB-IoT and LTE-M." },
  { name:"StudentFlex",        type:"Prepaid",              price:"₹149/56 days",  data:"1.5GB/day",    speed:"4G LTE 150 Mbps",  calls:"Unlimited",     validity:"56 days", features:["Education zero-rating","Google One 15GB","Night unlimited"],         best_for:"Students, e-learning",    description:"Student plan with zero-rated education apps." },
  { name:"StreamMax 5G",       type:"Postpaid",             price:"₹699/month",    data:"75GB",         speed:"5G 1.5 Gbps",      calls:"Unlimited",     validity:"30 days", features:["4K optimized","Netflix+Prime+Hotstar+SonyLIV+Zee5","Binge-On"],     best_for:"Entertainment, gaming",   description:"Full OTT bundle with 4K 5G." },
];

const QUESTIONS = [
  { id:"q001", question:"Which telecom plan is designed for IoT and Machine-to-Machine (M2M) communication?", options:{A:"SmartDaily 5G",B:"IoTConnect M2M",C:"BusinessElite 5G",D:"BasicConnect 4G"}, correct:"B", difficulty:"easy",   topic:"IoT Plans" },
  { id:"q002", question:"The FamilyShare Pro plan allows data sharing among how many members maximum?",        options:{A:"2 members",B:"3 members",C:"4 members",D:"6 members"},                        correct:"C", difficulty:"easy",   topic:"Family Plans" },
  { id:"q003", question:"Which plan offers a Static IP address — critical for hosting servers and VPNs?",      options:{A:"FamilyShare Pro",B:"StreamMax 5G",C:"BusinessElite 5G",D:"TravelGlobal SIM"}, correct:"C", difficulty:"medium", topic:"Business Plans" },
  { id:"q004", question:"What maximum data speed does BusinessElite 5G deliver on its priority 5G network?",   options:{A:"150 Mbps",B:"500 Mbps",C:"1 Gbps",D:"2 Gbps"},                                 correct:"D", difficulty:"medium", topic:"Network Speeds" },
  { id:"q005", question:"StudentFlex zero-rates (doesn't count toward data) which category of apps?",          options:{A:"Gaming apps",B:"Social media",C:"Education apps",D:"Entertainment apps"},       correct:"C", difficulty:"easy",   topic:"Special Plans" },
  { id:"q006", question:"Which two low-power wireless protocols does IoTConnect M2M explicitly support?",       options:{A:"3G and 4G LTE",B:"NB-IoT and LTE-M",C:"WiFi 6 and Bluetooth 5",D:"LoRa and Zigbee"}, correct:"B", difficulty:"hard", topic:"IoT Protocols" },
  { id:"q007", question:"TravelGlobal SIM provides international coverage in how many countries?",              options:{A:"50+",B:"75+",C:"100+",D:"150+"},                                                correct:"D", difficulty:"easy",   topic:"International Plans" },
  { id:"q008", question:"Which plan includes Microsoft 365 Basic as a bundled enterprise benefit?",             options:{A:"StudentFlex",B:"FamilyShare Pro",C:"BusinessElite 5G",D:"SmartDaily 5G"},        correct:"C", difficulty:"medium", topic:"Plan Benefits" },
  { id:"q009", question:"What is the validity period of the StudentFlex prepaid plan?",                         options:{A:"28 days",B:"30 days",C:"56 days",D:"84 days"},                                  correct:"C", difficulty:"easy",   topic:"Plan Validity" },
  { id:"q010", question:"StreamMax 5G is optimized for which maximum video streaming resolution?",              options:{A:"720p HD",B:"1080p Full HD",C:"4K UHD",D:"8K"},                                  correct:"C", difficulty:"medium", topic:"Streaming Plans" },
  { id:"q011", question:"What key latency advantage does 5G provide over 4G LTE for real-time apps?",          options:{A:"5G has 100ms vs 4G 50ms",B:"5G achieves <1ms vs 4G's 20-50ms",C:"Both identical",D:"4G has lower latency"}, correct:"B", difficulty:"hard", topic:"5G Technology" },
  { id:"q012", question:"Which plan includes airport lounge access as a bundled travel benefit?",               options:{A:"BusinessElite 5G",B:"FamilyShare Pro",C:"TravelGlobal SIM",D:"StreamMax 5G"},    correct:"C", difficulty:"medium", topic:"Travel Benefits" },
  { id:"q013", question:"What SLA uptime percentage does BusinessElite 5G guarantee?",                          options:{A:"95%",B:"98%",C:"99.5%",D:"99.9%"},                                              correct:"D", difficulty:"medium", topic:"Enterprise SLA" },
  { id:"q014", question:"NB-IoT operates in which type of spectrum, making it reliable and interference-free?", options:{A:"Unlicensed ISM band",B:"Licensed cellular spectrum",C:"Free-space optical",D:"TV White Space"}, correct:"B", difficulty:"hard", topic:"IoT Protocols" },
  { id:"q015", question:"Which plan offers 'Binge-On' mode where video on partner apps doesn't count toward data?", options:{A:"SmartDaily 5G",B:"FamilyShare Pro",C:"StreamMax 5G",D:"BasicConnect 4G"}, correct:"C", difficulty:"medium", topic:"Streaming Plans" },
];

// ── Init ─────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  checkHealth();
  renderPlans(PLANS);

  // Textarea auto-resize + Enter to send
  const ta = document.getElementById("chat-ta");
  if (ta) {
    ta.addEventListener("input", () => {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
    });
    ta.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); }
    });
  }

  // Periodic health check
  setInterval(checkHealth, 30000);

  // Mobile hamburger
  const hb = document.getElementById("hamburger");
  const checkMobile = () => { if (hb) hb.style.display = window.innerWidth < 700 ? "flex" : "none"; };
  checkMobile();
  window.addEventListener("resize", checkMobile);

  // Click outside sidebar to close on mobile
  document.addEventListener("click", e => {
    const sb = document.querySelector(".sidebar");
    if (sb?.classList.contains("open") && !sb.contains(e.target) && !e.target.closest("#hamburger")) {
      sb.classList.remove("open");
    }
  });
});