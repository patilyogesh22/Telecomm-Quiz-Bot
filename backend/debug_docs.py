"""
debug_docs.py  —  Run this in your backend folder:
    python debug_docs.py
It will show exactly what is in your telecom_docs.txt file.
"""
import os, re

path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "telecom_docs.txt")

print(f"File path : {path}")
print(f"File exists: {os.path.exists(path)}")
print(f"File size  : {os.path.getsize(path)} bytes\n")

# Read raw bytes
with open(path, "rb") as f:
    raw_bytes = f.read()

print(f"First 200 bytes (hex): {raw_bytes[:200].hex()}")
print(f"First 200 bytes (repr): {repr(raw_bytes[:200])}")
print()

# Read as text
with open(path, "r", encoding="utf-8-sig") as f:
    text = f.read()

lines = text.splitlines()
print(f"Total lines: {len(lines)}")
print()
print("=== First 10 lines ===")
for i, l in enumerate(lines[:10]):
    print(f"  [{i:02d}] repr={repr(l)}")

print()
print("=== All lines containing '====' ===")
for i, l in enumerate(lines):
    if "====" in l:
        print(f"  [{i:03d}] repr={repr(l)}")

print()
print("=== Testing header regex ===")
HEADER_RE = re.compile(r'^====\s+(PLAN|CONCEPT):\s+(.+?)\s+====\s*$')
matched = 0
for i, l in enumerate(lines):
    stripped = l.strip()
    m = HEADER_RE.match(stripped)
    if m:
        print(f"  MATCH [{i:03d}]: kind={m.group(1)!r}  name={m.group(2)!r}")
        matched += 1
    elif "====" in l:
        print(f"  NO MATCH [{i:03d}]: {repr(l)}")

print(f"\nTotal headers matched: {matched}")