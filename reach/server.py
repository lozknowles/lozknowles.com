"""Loopback-only private portal server. Apache must supply a private proxy token."""
import argparse
import collections
import hmac
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from .core import connect, overview, record_event, validate_event, DOMAINS

class Limiter:
    def __init__(self, clock=time.monotonic):
        self.clock=clock
        self.clients={}
        self.global_hits=collections.deque()
        self.lock=threading.Lock()
    def allow(self,client):
        with self.lock:
            now=self.clock()
            self.clients={k:v for k,v in self.clients.items() if v and v[-1]>now-60}
            while self.global_hits and self.global_hits[0]<=now-60: self.global_hits.popleft()
            if client not in self.clients and len(self.clients)>=10000: return False
            hits=self.clients.setdefault(client,collections.deque())
            while hits and hits[0]<=now-60: hits.popleft()
            if len(hits)>=30 or len(self.global_hits)>=300: return False
            hits.append(now)
            self.global_hits.append(now)
            return True

class Handler(BaseHTTPRequestHandler):
    server_version="Reach"
    def log_message(self,*args):
        pass
    def reply(self,status,body=b"",content_type="application/json"):
        self.send_response(status)
        self.send_header("Content-Type",content_type)
        self.send_header("Content-Length",str(len(body)))
        self.send_header("Cache-Control","no-store, private")
        self.send_header("X-Robots-Tag","noindex, nofollow, noarchive")
        self.send_header("X-Content-Type-Options","nosniff")
        self.send_header("Referrer-Policy","no-referrer")
        self.send_header("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        self.end_headers()
        if self.command!="HEAD": self.wfile.write(body)
    def trusted(self):
        value=self.headers.get("X-Reach-Token","")
        return bool(self.server.token) and hmac.compare_digest(value,self.server.token)
    def do_HEAD(self):
        self.do_GET()
    def do_GET(self):
        if not self.trusted():
            return self.reply(403,b'{"error":"Access denied"}')
        path=urlsplit(self.path).path
        if path=="/reach/api/overview":
            with connect(self.server.database) as db:
                body=json.dumps(overview(db)).encode()
            return self.reply(200,body)
        if path in {"/reach","/reach/","/reach/index.html"}:
            path="/reach/index.html"
        names={"/reach/index.html":"index.html","/reach/app.js":"app.js","/reach/style.css":"style.css"}
        mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8"}
        if path in names:
            file=self.server.static/names[path]
            if file.is_file():
                return self.reply(200,file.read_bytes(),mime[file.suffix])
        reports={"/reach/reports/lozknowles.html":"lozknowles.html","/reach/reports/collingham.html":"collingham.html","/reach/reports/visitor-report.html":"visitor-report.html"}
        if path in reports:
            file=(self.server.reports/reports[path]).resolve()
            if file.parent==self.server.reports.resolve() and file.is_file():
                # GoAccess includes inline code in its existing standalone report.
                body=file.read_bytes()
                self.send_response(200)
                for key,value in {"Content-Type":"text/html; charset=utf-8","Content-Length":str(len(body)),"Cache-Control":"no-store, private","X-Robots-Tag":"noindex, nofollow, noarchive","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","Content-Security-Policy":"default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"}.items(): self.send_header(key,value)
                self.end_headers()
                if self.command!="HEAD": self.wfile.write(body)
                return
        return self.reply(404,b'{"error":"Not found"}')
    def do_POST(self):
        if not self.trusted():
            return self.reply(403,b'{"error":"Access denied"}')
        if self.path!="/reach-collect":
            return self.reply(404,b'{"error":"Not found"}')
        if self.headers.get("Transfer-Encoding") or self.headers.get_content_type()!="application/json":
            return self.reply(415,b'{"error":"JSON required"}')
        try: length=int(self.headers.get("Content-Length","0"))
        except ValueError: length=0
        if not 0<length<=1024:
            return self.reply(413,b'{"error":"Body size rejected"}')
        # Apache removes incoming proxy/client headers, supplies verified values.
        if not self.server.limiter.allow(self.headers.get("X-Reach-Client","unknown")):
            return self.reply(429,b'{"error":"Rate limit"}')
        try:
            body=json.loads(self.rfile.read(length))
            domain,_,_=validate_event(body)
            origin=urlsplit(self.headers.get("Origin",""))
            if origin.scheme!="https" or origin.hostname not in {domain,"www."+domain} or origin.port not in {None,443} or origin.username:
                raise ValueError("Origin rejected")
            with connect(self.server.database) as db:
                record_event(db,body)
        except (ValueError,TypeError,json.JSONDecodeError):
            return self.reply(400,b'{"error":"Invalid event"}')
        self.send_response(204)
        self.send_header("Content-Length","0")
        self.send_header("Cache-Control","no-store")
        self.send_header("Access-Control-Allow-Origin",self.headers["Origin"])
        self.send_header("Vary","Origin")
        self.end_headers()
    def do_OPTIONS(self):
        if not self.trusted() or self.path!="/reach-collect":
            return self.reply(403)
        origin=self.headers.get("Origin","")
        if origin not in {"https://"+d for d in DOMAINS}|{"https://www."+d for d in DOMAINS}:
            return self.reply(403)
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin",origin)
        self.send_header("Access-Control-Allow-Methods","POST")
        self.send_header("Access-Control-Allow-Headers","Content-Type")
        self.send_header("Access-Control-Max-Age","600")
        self.send_header("Vary","Origin")
        self.send_header("Content-Length","0")
        self.end_headers()

def make_server(config,port=None):
    token=config.get("proxy_token","")
    if len(token)<32: raise ValueError("A private proxy token of at least 32 characters is required")
    host="127.0.0.1"
    server=ThreadingHTTPServer((host,config.get("port",18196) if port is None else port),Handler)
    server.token=token
    server.database=config["database"]
    server.static=Path(__file__).parent/"static"
    server.reports=Path(config.get("reports_dir","/home/loz/server_reports"))
    server.limiter=Limiter()
    return server

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--config",required=True)
    args=parser.parse_args()
    make_server(json.loads(Path(args.config).read_text())).serve_forever()

