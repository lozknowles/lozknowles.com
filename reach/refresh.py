"""Independent refresh jobs; errors preserve the previous successful source snapshot."""
import argparse
import datetime as dt
import json
import os
import tempfile
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode,quote,urlsplit,urljoin
from urllib.request import Request,urlopen,HTTPSHandler,build_opener
import http.client
import socket
from html.parser import HTMLParser
from .core import connect,ingest,source,document,DOMAINS,now

AUDIT_ORIGIN=None

class OriginHTTPSConnection(http.client.HTTPSConnection):
    def connect(self):
        if AUDIT_ORIGIN=="127.0.0.1" and self.host in set(DOMAINS)|{"www."+d for d in DOMAINS}:
            raw=socket.create_connection((AUDIT_ORIGIN,self.port),self.timeout)
            self.sock=self._context.wrap_socket(raw,server_hostname=self.host)
        else:
            super().connect()

class OriginHTTPSHandler(HTTPSHandler):
    def https_open(self,req):
        return self.do_open(OriginHTTPSConnection,req,context=self._context,check_hostname=self._check_hostname)

def fetch(url,method="GET",data=None,headers=None):
    req=Request(url,data=data,method=method,headers={"User-Agent":"ReachTechnicalAudit/1.0",**(headers or {})})
    with build_opener(OriginHTTPSHandler()).open(req,timeout=15) as response:
        body=response.read(5*1024*1024+1)
        if len(body)>5*1024*1024: raise ValueError("Source response too large")
        return body,response.status,dict(response.headers)

def search_token(path):
    credential=json.loads(Path(path).read_text())
    if credential.get("type")=="service_account":
        try:
            from google.oauth2 import service_account
            from google.auth.transport.requests import Request as GoogleRequest
        except ImportError:
            raise ValueError("Service-account connector requires google-auth and requests in the private service environment")
        auth=service_account.Credentials.from_service_account_info(credential,scopes=["https://www.googleapis.com/auth/webmasters.readonly"])
        auth.refresh(GoogleRequest())
        return auth.token
    required=("client_id","client_secret","refresh_token")
    if not all(credential.get(k) for k in required):
        raise ValueError("Credential must be authorized_user JSON with client_id, client_secret and refresh_token, or service_account JSON")
    body,_,_=fetch("https://oauth2.googleapis.com/token",method="POST",data=urlencode({k:credential[k] for k in required}|{"grant_type":"refresh_token"}).encode(),headers={"Content-Type":"application/x-www-form-urlencoded"})
    return json.loads(body)["access_token"]

def gsc(db,domain,settings,today=None):
    property=settings.get("property")
    credential=settings.get("credential_file")
    setup=("Verify sc-domain:"+domain+" in Search Console. Enable Search Console API on the credential project. "
           "Give the authorized user or service-account email read access to that exact property. "
           "Store authorized_user JSON (client_id, client_secret, refresh_token with webmasters.readonly scope) or service_account JSON outside the web root, chmod 600. "
           "Set domains."+domain+".search_console.property and credential_file in the private config. "
           "For service_account install google-auth and requests in the service venv. Run python -m reach.refresh --config PRIVATE_CONFIG.")
    if not property or not credential or not Path(credential).is_file():
        with db: source(db,domain,"search_console",status="not_connected",setup=setup,last_attempt=now(),error=None)
        return False
    if property not in {"sc-domain:"+domain,"https://"+domain+"/","https://www."+domain+"/"}:
        with db: source(db,domain,"search_console",status="error",setup=setup,last_attempt=now(),error="Property is outside domain allowlist")
        return False
    try:
        token=search_token(credential)
        today=today or dt.date.today()
        end=today-dt.timedelta(days=3)
        start=end-dt.timedelta(days=179)
        result={}
        for key,dimension in (("daily","date"),("queries","query"),("pages","page")):
            rows=[]
            offset=0
            while True:
                payload={"startDate":start.isoformat(),"endDate":end.isoformat(),"dimensions":[dimension],"rowLimit":25000,"startRow":offset,"dataState":"final","type":"web"}
                body,_,_=fetch("https://www.googleapis.com/webmasters/v3/sites/"+quote(property,safe="")+"/searchAnalytics/query",method="POST",data=json.dumps(payload).encode(),headers={"Authorization":"Bearer "+token,"Content-Type":"application/json"})
                batch=json.loads(body).get("rows",[])
                rows.extend(batch)
                if len(batch)<25000: break
                offset+=25000
                if offset>=100000: raise ValueError("Search row coverage exceeded 100000; narrow the date range")
            if dimension=="date":
                rows=[{"date":r["keys"][0],**{k:r[k] for k in ("clicks","impressions","ctr","position")}} for r in rows]
            elif dimension=="page":
                clean=[]
                for r in rows:
                    parts=urlsplit(r["keys"][0])
                    if parts.hostname in {domain,"www."+domain}:
                        clean.append({**r,"keys":[parts.scheme+"://"+parts.netloc+parts.path]})
                rows=clean
            result[key]=rows
        with db:
            document(db,domain,"search",result)
            source(db,domain,"search_console",status="connected",last_success=now(),last_attempt=now(),error=None,setup=setup,property=property,coverage_start=start.isoformat(),coverage_end=end.isoformat())
        return True
    except Exception as e:
        # Do not persist provider response bodies or credential values.
        message=("Provider HTTP "+str(e.code)) if isinstance(e,HTTPError) else (str(e) if isinstance(e,(ValueError,FileNotFoundError)) else "Search Console refresh failed ("+type(e).__name__+")")
        with db: source(db,domain,"search_console",status="error",last_attempt=now(),error=message,setup=setup)
        return False

class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title=False; self.title_text=""; self.description=None; self.canonical=None; self.structured=[]; self.links=[]; self.viewport=None; self.in_script=False; self.script=""
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=="title": self.title=True
        if tag=="meta" and a.get("name")=="description": self.description=a.get("content")
        if tag=="meta" and a.get("name")=="viewport": self.viewport=a.get("content")
        if tag=="link" and a.get("rel")=="canonical": self.canonical=a.get("href")
        if tag=="a" and a.get("href"): self.links.append(a["href"])
        if tag=="script" and a.get("type")=="application/ld+json": self.in_script=True; self.script=""
    def handle_data(self,data):
        if self.title: self.title_text+=data
        if self.in_script: self.script+=data
    def handle_endtag(self,tag):
        if tag=="title": self.title=False
        if tag=="script" and self.in_script:
            self.in_script=False
            try: self.structured.append(json.loads(self.script))
            except ValueError: self.structured.append(None)

def seo(db,domain):
    """Bounded same-domain document crawl. Not an indexing or performance claim."""
    base="https://"+domain+"/"
    findings=[]
    try:
        body,status,_=fetch(base)
        page=Page();page.feed(body.decode("utf-8",errors="replace"))
        for check,ok,detail in [
            ("Homepage",status==200,"HTTP "+str(status)),
            ("Title",bool(page.title_text.strip()),page.title_text.strip()[:150] or "Missing"),
            ("Meta description",bool(page.description),str(page.description or "Missing")[:180]),
            ("Canonical",bool(page.canonical) and urlsplit(urljoin(base,page.canonical)).hostname in {domain,"www."+domain},page.canonical or "Missing"),
            ("Mobile viewport",bool(page.viewport),page.viewport or "Missing"),
            ("Structured data",bool(page.structured) and all(x is not None for x in page.structured),"Valid JSON-LD blocks: "+str(sum(x is not None for x in page.structured))),
        ]: findings.append({"check":check,"status":"pass" if ok else "warning","detail":detail})
        for path in ("robots.txt","sitemap.xml"):
            try:
                data,status,_=fetch(base+path)
                valid=status==200 and (b"<urlset" in data or b"<sitemapindex" in data if path=="sitemap.xml" else b"<html" not in data.lower())
                findings.append({"check":path,"status":"pass" if valid else "warning","detail":"HTTP "+str(status)+("; content recognised" if valid else "; content not recognised")})
            except Exception as e:
                findings.append({"check":path,"status":"warning","detail":"HTTP "+str(e.code) if isinstance(e,HTTPError) else "Fetch failed"})
        links=[]
        for link in page.links:
            p=urlsplit(urljoin(base,link))
            if p.scheme=="https" and p.hostname in {domain,"www."+domain} and not p.query and not p.fragment and not p.username and not p.port and not p.path.startswith(("/reach","/api","/account","/admin","/login","/voice-clone","/lincoln-course-match/prior-attainment")):
                u=p.scheme+"://"+p.netloc+p.path
                if u not in links: links.append(u)
        broken=[];failed=[]
        for link in links[:20]:
            try:
                _,status,_=fetch(link,method="HEAD")
                if status>=400: broken.append(urlsplit(link).path)
            except HTTPError as e:
                if e.code==405: failed.append(urlsplit(link).path+" HEAD unsupported")
                else: broken.append(urlsplit(link).path+" HTTP "+str(e.code))
            except Exception: failed.append(urlsplit(link).path+" unavailable")
        findings.append({"check":"Broken-link sample","status":"warning" if broken or failed else "pass","detail":str(min(20,len(links)))+" homepage links sampled. Broken: "+", ".join(broken)+". Unverified: "+", ".join(failed)})
        value={"status":"checked","checked_at":now(),"findings":findings,"performance":{"status":"not_measured","detail":"Run Lighthouse mobile audit on both live sites and record timestamp/device/score; no performance or indexing score is inferred from HTML."},"indexing":{"status":"not_connected","detail":"Search Analytics does not provide index coverage. URL Inspection requires authorized Search Console access and sampled URL requests."}}
        with db: document(db,domain,"seo",value); source(db,domain,"seo",status="connected",last_success=now(),last_attempt=now(),error=None)
        return True
    except Exception as e:
        with db: source(db,domain,"seo",status="error",last_attempt=now(),error="Technical audit failed ("+type(e).__name__+")")
        return False

def refresh(config):
    global AUDIT_ORIGIN
    AUDIT_ORIGIN=config.get('audit_origin')
    if AUDIT_ORIGIN not in {None,'127.0.0.1'}: raise ValueError('Only the local verified origin may be used for technical audits')
    results={}
    with connect(config["database"]) as db:
        for domain in DOMAINS:
            settings=config.get("domains",{}).get(domain,{})
            results[domain]={}
            if settings.get("logs"):
                results[domain]["apache"]=ingest(db,domain,settings["logs"])
            else:
                with db: source(db,domain,"apache",status="not_connected",last_attempt=now(),setup="Configure the verified Apache combined access-log family for this domain; log permissions must allow the refresh service to read rotated/gzip archives.")
            report=Path(config.get("reports_dir","/home/loz/server_reports"))/("lozknowles.html" if domain=="lozknowles.com" else "collingham.html")
            with db:
                if report.is_file():
                    source(db,domain,"goaccess",status="connected",last_success=dt.datetime.fromtimestamp(report.stat().st_mtime,dt.timezone.utc).isoformat(),last_attempt=now(),error=None)
                else:
                    source(db,domain,"goaccess",status="not_connected",last_attempt=now(),error="Existing GoAccess report file unavailable; existing generator has not been altered")
            results[domain]["search_console"]=gsc(db,domain,settings.get("search_console",{}))
            results[domain]["seo"]=seo(db,domain)
    return results

if __name__=="__main__":
    parser=argparse.ArgumentParser();parser.add_argument("--config",required=True)
    args=parser.parse_args()
    config=json.loads(Path(args.config).read_text())
    print(json.dumps(refresh(config)))

