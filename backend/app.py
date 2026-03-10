"""
app.py — TeleBot Full-Stack Server
Run this ONE file to launch the entire app:
    python app.py
Then open: http://localhost:5000
"""

import os
import re
import logging
import webbrowser
import threading

# ── Silence ChromaDB telemetry noise ─────────────────────────────────
logging.getLogger("chromadb.telemetry").setLevel(logging.CRITICAL)
logging.getLogger("chromadb").setLevel(logging.WARNING)

from flask import Flask, request, jsonify, send_from_directory, send_file
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()  # auto-load .env file

import vector_db as vdb
import quiz_engine as quiz
import llm_service as llm

# ── Inline plan data (fallback if vector_db.BUILTIN_PLANS not available) ──
PLANS_DATA = [
    {"id":"basicconnect_4g","name":"BasicConnect 4G","text":"BasicConnect 4G\n\nType: Prepaid\nPrice: 199 INR/month\nData: 1GB total\nSpeed: 4G LTE up to 25 Mbps\nCalls: 100 minutes\nSMS: 100 SMS\nValidity: 28 days\nFeatures: No contract, Auto-renewal optional, Basic data rollover\nBest For: Light users, backup SIM, elderly users\nDescription: Entry-level prepaid plan with 1GB 4G data for 28 days at Rs.199."},
    {"id":"smartdaily_5g","name":"SmartDaily 5G","text":"SmartDaily 5G\n\nType: Prepaid\nPrice: 299 INR/month\nData: 2GB per day\nSpeed: 5G up to 1 Gbps\nCalls: Unlimited\nValidity: 28 days\nFeatures: 5G ready, Netflix basic, Wi-Fi calling, Daily reset\nBest For: Daily heavy users, streamers, remote workers\nDescription: Daily 2GB 5G plan with Netflix basic."},
    {"id":"familyshare_pro","name":"FamilyShare Pro","text":"FamilyShare Pro\n\nType: Postpaid\nPrice: 999 INR/month\nData: 100GB shared\nSpeed: 5G/4G 500 Mbps\nCalls: Unlimited\nValidity: 30 days\nFeatures: 4 members, Disney+ Hotstar, Intl roaming 20 countries, Parental controls\nBest For: Families, multiple devices\nDescription: Family postpaid with 100GB shared 5G and Disney+ Hotstar."},
    {"id":"businesselite_5g","name":"BusinessElite 5G","text":"BusinessElite 5G\n\nType: Postpaid Enterprise\nPrice: 1499 INR/month\nData: Unlimited\nSpeed: 5G Priority 2 Gbps\nCalls: Unlimited + 500 intl\nValidity: 30 days\nFeatures: Static IP, VPN, Microsoft 365, Cloud 100GB, SLA 99.9%, IoT Portal\nBest For: Enterprises, IoT deployments\nDescription: Enterprise 5G with static IP, VPN, Microsoft 365 and 99.9% SLA."},
    {"id":"travelglobal_sim","name":"TravelGlobal SIM","text":"TravelGlobal SIM\n\nType: International Roaming\nPrice: 2499 INR/month\nData: 5GB intl + Unlimited domestic\nSpeed: 4G global 150 Mbps\nCalls: 200 intl + Unlimited domestic\nValidity: 30 days\nFeatures: 150+ countries, No roaming charges, Airport lounge 2x/month, Travel insurance\nBest For: International travelers, expats\nDescription: Global SIM covering 150+ countries with airport lounge access."},
    {"id":"iotconnect_m2m","name":"IoTConnect M2M","text":"IoTConnect M2M\n\nType: IoT / M2M\nPrice: 49 INR/SIM/month\nData: 500MB\nSpeed: NB-IoT / LTE-M\nCalls: Not applicable\nValidity: 30 days\nFeatures: NB-IoT, LTE-M, Bulk SIM portal, API access, FOTA support\nBest For: Smart meters, GPS trackers, sensors, industrial IoT\nDescription: IoT/M2M SIM supporting NB-IoT and LTE-M with bulk API management."},
    {"id":"studentflex","name":"StudentFlex","text":"StudentFlex\n\nType: Prepaid\nPrice: 149 INR per 56 days\nData: 1.5GB per day\nSpeed: 4G LTE 150 Mbps\nCalls: Unlimited\nValidity: 56 days\nFeatures: Education zero-rating, Google One 15GB, Night unlimited, 56-day validity\nBest For: Students, e-learning, budget users\nDescription: Student plan with 56-day validity and zero-rated education apps."},
    {"id":"streammax_5g","name":"StreamMax 5G","text":"StreamMax 5G\n\nType: Postpaid\nPrice: 699 INR/month\nData: 75GB\nSpeed: 5G 1.5 Gbps\nCalls: Unlimited\nValidity: 30 days\nFeatures: 4K optimized, Netflix+Prime+Hotstar+SonyLIV+Zee5, Binge-On mode\nBest For: Entertainment, gaming, 4K streaming\nDescription: Entertainment 5G plan with 75GB and full OTT bundle."},
]


# ── Paths ─────────────────────────────────────────────────────────────
BASE_DIR     = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "..", "frontend")
FRONTEND_DIR = os.path.normpath(FRONTEND_DIR)

# ── Flask App ─────────────────────────────────────────────────────────
app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")
CORS(app, origins="*")

# ── Startup: init Vector DB ───────────────────────────────────────────
plan_count, concept_count = vdb.init_vector_db()
api_key_set = bool(os.environ.get("GEMINI_API_KEY", "").strip())

print(f"\n{'='*54}")
print(f"  🚀 TeleBot  →  http://localhost:5000")
print(f"  🗄️  ChromaDB →  {plan_count} plans · {concept_count} concepts")
if api_key_set:
    print(f"  🤖 Gemini   →  1.5 Flash (FREE)  ✅")
else:
    print(f"  🤖 Gemini   →  ❌ GEMINI_API_KEY not set")
    print(f"     Add it to backend/.env and restart")
print(f"{'='*54}\n")


# ══════════════════════════════════════════════════════════════════════
#  FRONTEND ROUTES — serve index.html + static files
# ══════════════════════════════════════════════════════════════════════

@app.route("/")
def index():
    """Serve the frontend SPA"""
    return send_file(os.path.join(FRONTEND_DIR, "index.html"))

@app.route("/<path:filename>")
def static_files(filename):
    """Serve style.css, script.js, etc."""
    return send_from_directory(FRONTEND_DIR, filename)


# ══════════════════════════════════════════════════════════════════════
#  API ROUTES
# ══════════════════════════════════════════════════════════════════════

@app.route("/api/health")
def health():
    return jsonify({
        "status":        "ok",
        "service":       "TeleBot API",
        "llm_available": llm.is_llm_available(),
        "vectordb":      vdb.get_stats(),
    })


@app.route("/api/quiz/questions")
def get_questions():
    difficulty = request.args.get("difficulty", "all")
    count      = int(request.args.get("count", 8))
    questions  = quiz.get_questions(difficulty=difficulty, count=count)
    return jsonify({"questions": questions, "total": len(questions), "difficulty": difficulty})


@app.route("/api/quiz/submit", methods=["POST"])
def submit_answer():
    data = request.get_json()
    if not data:
        return jsonify({"error": "JSON body required"}), 400

    qid         = data.get("question_id", "").strip()
    user_answer = data.get("answer", "").strip().upper()

    if not qid or not user_answer:
        return jsonify({"error": "question_id and answer are required"}), 400

    result = quiz.validate_answer(qid, user_answer)
    if "error" in result:
        return jsonify(result), 404

    rag_context = vdb.retrieve_all(result["rag_query"], plan_n=2, concept_n=1)

    explanation = llm.generate_explanation(
        question_text=result["question_text"],
        options=result["all_options"],
        user_key=result["user_key"],
        correct_key=result["correct_key"],
        correct_text=result["correct_text"],
        user_text=result["user_text"],
        is_correct=result["is_correct"],
        topic=result["topic"],
        difficulty=result["difficulty"],
        rag_context=rag_context,
    )

    return jsonify({
        "is_correct":     result["is_correct"],
        "correct_answer": result["correct_key"],
        "correct_text":   result["correct_text"],
        "user_answer":    result["user_key"],
        "explanation":    explanation,
        "topic":          result["topic"],
        "difficulty":     result["difficulty"],
    })


@app.route("/api/quiz/stats")
def quiz_stats():
    return jsonify(quiz.get_stats())


@app.route("/api/tutor/chat", methods=["POST"])
def tutor_chat():
    data = request.get_json()
    if not data:
        return jsonify({"error": "JSON body required"}), 400

    message = data.get("message", "").strip()
    history = data.get("history", [])

    if not message:
        return jsonify({"error": "message is required"}), 400

    rag_context = vdb.retrieve_all(message, plan_n=3, concept_n=2)
    response    = llm.tutor_chat(user_message=message, history=history, rag_context=rag_context)

    return jsonify({"response": response, "llm_available": llm.is_llm_available()})


@app.route("/api/plans")
def get_plans():
    # Use BUILTIN_PLANS from vector_db if available, else use inline data
    raw_plans = getattr(vdb, "BUILTIN_PLANS", None) or PLANS_DATA
    plans = []
    for p in raw_plans:
        text = p["text"]
        def field(name, t=text):
            m = re.search(rf"^{name}:\s*(.+)$", t, re.MULTILINE)
            return m.group(1).strip() if m else ""
        features_raw = field("Features")
        plans.append({
            "id":          p["id"],
            "name":        p["name"],
            "type":        field("Type"),
            "price":       field("Price"),
            "data":        field("Data"),
            "speed":       field("Speed"),
            "calls":       field("Calls"),
            "validity":    field("Validity"),
            "features":    [f.strip() for f in features_raw.split(",")] if features_raw else [],
            "best_for":    field("Best For"),
            "description": field("Description"),
        })
    return jsonify({"plans": plans, "count": len(plans)})


@app.route("/api/plans/search")
def search_plans():
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify({"error": "query parameter 'q' is required"}), 400
    context = vdb.retrieve_plans(query, n=int(request.args.get("n", 3)))
    return jsonify({"query": query, "context": context})


@app.route("/api/vdb/stats")
def vdb_stats():
    return jsonify(vdb.get_stats())

# ══════════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ══════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))

    # Auto-open browser after 1.2 seconds
    def open_browser():
        import time
        time.sleep(1.2)
        webbrowser.open(f"http://localhost:{port}")

    threading.Thread(target=open_browser, daemon=True).start()

    print(f"  Opening browser → http://localhost:{port}\n")
    app.run(debug=False, port=port, host="0.0.0.0", use_reloader=False)