"""
test_key.py — Find working Gemini model
Run: python test_key.py
"""
import urllib.request, urllib.error, json, os
from dotenv import load_dotenv
load_dotenv()

key = os.environ.get("GEMINI_API_KEY","").strip()
print(f"\nGemini key: {key[:16]}...\n")

# Step 1: List all available models
print("Fetching available models from your account...\n")
url = f"https://generativelanguage.googleapis.com/v1beta/models?key={key}"
req = urllib.request.Request(url)
try:
    with urllib.request.urlopen(req, timeout=15) as r:
        data   = json.loads(r.read().decode())
        models = data.get("models", [])
        generate_models = [
            m["name"] for m in models
            if "generateContent" in m.get("supportedGenerationMethods", [])
        ]
        print(f"Found {len(generate_models)} models supporting generateContent:")
        for m in generate_models:
            print(f"  {m}")
except Exception as e:
    print(f"Could not list models: {e}")
    generate_models = []

# Step 2: Test each model
print("\n--- Testing models ---\n")
for full_name in generate_models[:6]:   # test first 6
    model = full_name.replace("models/", "")
    url   = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
    body  = json.dumps({"contents":[{"parts":[{"text":"Say WORKING"}]}],"generationConfig":{"maxOutputTokens":5}}).encode()
    req   = urllib.request.Request(url, data=body, headers={"Content-Type":"application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            d   = json.loads(r.read().decode())
            txt = d["candidates"][0]["content"]["parts"][0]["text"]
            print(f"  SUCCESS: {model}  →  '{txt.strip()}'")
    except urllib.error.HTTPError as e:
        raw = e.read().decode() if e.fp else ""
        try:    msg = json.loads(raw).get("error",{}).get("message","")[:80]
        except: msg = raw[:80]
        print(f"  FAILED {e.code}: {model}  →  {msg}")
    except Exception as e:
        print(f"  ERROR: {model}  →  {e}")