"""Tailnet-only OpenAI usage service. Python 3.11+, no dependencies."""
import datetime as dt
import json
import os
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ACCOUNTS = json.loads(os.environ.get("OPENAI_USAGE_ACCOUNTS", "[]"))
assert isinstance(ACCOUNTS, list) and len(ACCOUNTS) <= 4
HOST = os.environ.get("OPENAI_USAGE_BIND", "127.0.0.1")
if HOST not in ("127.0.0.1", "::1"):
    raise SystemExit("Refusing non-loopback binding; use Tailscale Serve for access")

def fetch(url, key):
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + key, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=12) as response:
        return json.load(response)

def snapshot():
    now = dt.datetime.now(dt.timezone.utc)
    start = int(now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).timestamp())
    end = int(now.timestamp())
    result = []
    for index, account in enumerate(ACCOUNTS):
        name = str(account.get("name", "Account " + str(index + 1)))[:80]
        entry = {"name": name, "type": account.get("type", "chatgpt"), "spend_usd": None, "status": "manual"}
        if entry["type"] == "api":
            key = os.environ.get(account.get("admin_key_env", ""), "")
            if not key:
                entry["status"] = "missing admin key"
            else:
                try:
                    data = fetch("https://api.openai.com/v1/organization/costs?start_time=%d&end_time=%d&bucket_width=1d&limit=31" % (start, end), key)
                    entry["spend_usd"] = round(sum(float(r.get("amount", {}).get("value", 0)) for b in data.get("data", []) for r in b.get("results", [])), 2)
                    entry["status"] = "ok"
                except Exception:
                    entry["status"] = "API request failed"
        result.append(entry)
    return {"accounts": result, "updated_at": now.isoformat()}

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/api/usage":
            payload = json.dumps(snapshot()).encode()
            content_type = "application/json"
        elif self.path in ("/", "/index.html"):
            payload = (ROOT / "index.html").read_bytes()
            content_type = "text/html; charset=utf-8"
        else:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'")
        self.end_headers()
        self.wfile.write(payload)

if __name__ == "__main__":
    ThreadingHTTPServer((HOST, int(os.environ.get("OPENAI_USAGE_PORT", "8765"))), Handler).serve_forever()
