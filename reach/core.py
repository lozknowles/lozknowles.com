"""Private aggregate analytics. Raw request observations are used only in memory."""
import collections
import datetime as dt
import glob
import gzip
import hashlib
import json
import os
import re
import sqlite3
from pathlib import Path
from urllib.parse import parse_qsl, urlsplit, unquote
from zoneinfo import ZoneInfo

DOMAINS = ("lozknowles.com", "collingham.org")
TZ = ZoneInfo("Europe/London")
LINE = re.compile(r'^(\S+) \S+ \S+ \[([^\]]+)\] "([A-Z]+) (\S+)(?: HTTP/[^"]*)?" (\d{3}) \S+ "([^"]*)" "([^"]*)"')
BOT = re.compile(r"bot|spider|crawl|slurp|preview|python-requests|go-http-client|curl|wget|aiohttp|httpclient|headless|uptimerobot|pingdom|statuscake|healthcheck|monitor|zabbix|nagios|reachtechnicalaudit", re.I)
STATIC = re.compile(r"\.(?:avif|bmp|css|csv|geojson|gif|gpx|ico|jpe?g|js|json|kml|map|mp3|mp4|ogg|otf|pdf|png|svg|ttf|txt|wav|webm|webmanifest|webp|woff2?|xml)$", re.I)
SENSITIVE = re.compile(r"\.env|wp-admin|wp-login|phpmyadmin|\.git|cgi-bin|xmlrpc|\.php|[0-9a-f]{24,}|[0-9]{5,}|@|%40", re.I)
FIELD = re.compile(r"^[a-z0-9][a-z0-9_-]{0,47}$")
EVENTS = {"walk_start", "ask_use", "narration_play"}
DEFINITIONS = [
    "Page views: successful GET requests for public document paths, excluding known bots, monitors, assets, APIs, private routes, redirects and sensitive/dynamic paths. SPA view changes and cached/CDN-served visits may be absent.",
    "Estimated sessions: same IP and user agent in memory, split after 30 minutes inactivity and at local midnight. No IP, user agent or visitor/session identifier is stored. Estimates are not unique people; VPNs, NAT, bot evasion and missing CDN traffic affect counts.",
    "Combined sessions are a sum of independent domain estimates, not deduplicated people. Referrals use hostname only; identifier-like hostnames and all arbitrary query parameters are discarded. Known bot signatures are incomplete and referral spam may remain.",
    "Coverage: Europe/London calendar days. First observed day and current day are partial. Interior days are only provisionally complete within accessible continuous logs; missing dates are unknown, never zero. Raw-log loss retains prior aggregates.",
    "UTM arrivals are validated tagged page requests, not unique arrivals or conversions. Repeated tagged reloads count again. Generic printed QR links cannot be retrospectively assigned to a flyer.",
    "Actions count accepted occurrences, not people. Same-tab campaign context expires after 30 minutes and supports association only; it does not establish causal conversion. Collection starts only after instrumentation is installed.",
    "Google Search Console has its own lag, timezone and anonymized-query omissions; search metrics are never inferred from Apache or GoAccess. SEO crawl results are sampled technical checks, not proof of indexing.",
    "GoAccess is retained as an independent existing report; its hits/visitors have different definitions and are not merged into session estimates."
]

def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()

def connect(path):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=30)
    db.execute("PRAGMA journal_mode=WAL")
    db.executescript("""
    CREATE TABLE IF NOT EXISTS daily(domain TEXT,date TEXT,payload TEXT,PRIMARY KEY(domain,date));
    CREATE TABLE IF NOT EXISTS source(domain TEXT,name TEXT,payload TEXT,PRIMARY KEY(domain,name));
    CREATE TABLE IF NOT EXISTS document(domain TEXT,name TEXT,payload TEXT,PRIMARY KEY(domain,name));
    CREATE TABLE IF NOT EXISTS action(date TEXT,domain TEXT,event TEXT,campaign TEXT,n INTEGER,PRIMARY KEY(date,domain,event,campaign));
    CREATE TABLE IF NOT EXISTS state(key TEXT PRIMARY KEY,value TEXT);
    """)
    return db

def source(db, domain, name, **fields):
    row = db.execute("SELECT payload FROM source WHERE domain=? AND name=?", (domain,name)).fetchone()
    old = json.loads(row[0]) if row else {}
    old.update(fields)
    db.execute("INSERT OR REPLACE INTO source VALUES(?,?,?)",(domain,name,json.dumps(old)))

def document(db, domain, name, value):
    db.execute("INSERT OR REPLACE INTO document VALUES(?,?,?)",(domain,name,json.dumps(value)))

def campaign(query):
    pairs = parse_qsl(query, keep_blank_values=True, max_num_fields=30)
    fields = {}
    for key, value in pairs:
        if key.startswith("utm_"):
            if key not in {"utm_source","utm_medium","utm_campaign","utm_content"} or key in fields:
                return None
            if not FIELD.fullmatch(value):
                return None
            fields[key] = value
    if not all(key in fields for key in ("utm_source","utm_medium","utm_campaign")):
        return None
    return "|".join(fields.get(key,"") for key in ("utm_source","utm_medium","utm_campaign","utm_content"))

def safe_path(target):
    parts = urlsplit(target)
    if parts.scheme or parts.netloc:
        return None
    path = unquote(parts.path or "/")
    path = re.sub(r"/+","/",path)
    # Do not retain private/admin paths, likely identifiers, or scanner targets.
    if len(path)>160 or SENSITIVE.search(path) or any(p in {".",".."} for p in path.split("/")):
        return None
    if not re.fullmatch(r"/[a-zA-Z0-9/_ .-]*",path) or " " in path:
        return None
    if path.startswith(("/api","/reach","/admin","/account","/login","/register","/profile","/lincoln-course-match/prior-attainment","/voice-clone","/localwalks/api","/localwalks/admin","/localwalks/chatbot/api")):
        return None
    if STATIC.search(path):
        return None
    return path

def read_streams(patterns):
    """Deduplicate rotation copies by whole-file/prefix provenance, never individual lines.
    Complete prefixes within a configured domain's single access-log family represent
    old snapshots of that stream. Repeated legitimate lines inside a file are retained.
    Refuse giant inputs rather than silently returning a truncated successful baseline.
    """
    streams=[]
    paths=sorted({p for pattern in patterns for p in glob.glob(pattern)})
    if not paths:
        raise FileNotFoundError("No readable Apache log files matched configured patterns")
    for path in paths:
        opener=gzip.open if path.endswith(".gz") else open
        with opener(path,"rb") as f:
            data=f.read(256*1024*1024+1)
        if len(data)>256*1024*1024:
            raise ValueError("Log exceeds 256 MiB safe ingestion limit; split into complete archives")
        # An actively written trailing line is not a completed observation.
        data=data[:data.rfind(b"\n")+1] if b"\n" in data else b""
        if data:
            streams.append((path,data))
    kept=[]
    logical={}
    for path,data in streams:
        # Compression preserves the archive name: .1 and .1.gz are the same
        # logical archive, while .1 and .2 are independent even if identical.
        identity=path[:-3] if path.endswith(".gz") else path
        if identity in logical:
            previous=logical[identity]
            if data!=previous:
                raise ValueError("Conflicting compressed/plain archive copies")
            continue
        logical[identity]=data
        kept.append((path,data))
    return kept

def aggregate(streams, today=None):
    today=today or dt.datetime.now(TZ).date()
    days={}
    clients=collections.defaultdict(list)
    observed=[]
    excluded=collections.Counter()
    salt=os.urandom(32)
    malformed=0
    for _,data in streams:
        for raw in data.decode("utf-8",errors="replace").splitlines():
            m=LINE.match(raw)
            if not m:
                malformed+=1
                continue
            ip,timestamp,method,target,status,ref,agent=m.groups()
            try:
                when=dt.datetime.strptime(timestamp,"%d/%b/%Y:%H:%M:%S %z").astimezone(TZ)
            except ValueError:
                malformed+=1
                continue
            observed.append(when)
            path=safe_path(target)
            if method!="GET" or not 200<=int(status)<300 or BOT.search(agent) or path is None or not agent.strip() or agent=="-":
                excluded["filtered_requests"]+=1
                continue
            day=when.date().isoformat()
            d=days.setdefault(day,{"date":day,"page_views":0,"sessions":0,"pages":collections.Counter(),"referrals":collections.Counter(),"campaigns":collections.Counter(),"first_seen":when.astimezone(dt.timezone.utc).isoformat(),"last_seen":when.astimezone(dt.timezone.utc).isoformat()})
            d["page_views"]+=1
            d["first_seen"]=min(d["first_seen"],when.astimezone(dt.timezone.utc).isoformat())
            d["last_seen"]=max(d["last_seen"],when.astimezone(dt.timezone.utc).isoformat())
            # Store hostname only; never URL, query or credentials from referrers.
            try:
                host=urlsplit(ref).hostname
                if host and re.fullmatch(r"[a-z0-9.-]{1,100}",host) and not re.fullmatch(r"[0-9.]+",host) and not re.search(r"[0-9a-f]{8}-[0-9a-f]{4}-|[0-9a-f]{24,}|[0-9]{5,}",host) and all(len(label)<=32 for label in host.split(".")):
                    d["referrals"][host]+=1
                elif ref=="-":
                    d["referrals"]["direct-or-unknown"]+=1
            except ValueError:
                pass
            d["pages"][path]+=1
            try:
                tag=campaign(urlsplit(target).query)
            except ValueError:
                tag=None
            if tag:
                d["campaigns"][tag]+=1
            key=hashlib.blake2b((ip+"\0"+agent).encode(),key=salt,digest_size=16).digest()
            clients[(day,key)].append(when.astimezone(dt.timezone.utc))
    for (day,_),times in clients.items():
        times.sort()
        days[day]["sessions"]+=sum(i==0 or (t-times[i-1]).total_seconds()>1800 for i,t in enumerate(times))
    if not observed:
        raise ValueError("No valid combined-log observations; previous data retained")
    if malformed>max(10,len(observed)//100):
        raise ValueError("Unexpected Apache log format; more than 1 percent malformed lines")
    start=min(observed).date()
    end=max(observed).date()
    for date,d in days.items():
        d["partial"]=dt.date.fromisoformat(date) in {start,today} or dt.date.fromisoformat(date)>today
        d["coverage_basis"]="observed access-log interval; origin/CDN coverage not independently proven"
        for key in ("pages","referrals","campaigns"):
            # Bounded report cardinality; overflow is explicitly grouped.
            entries=d[key].most_common(500)
            other=sum(d[key].values())-sum(v for _,v in entries)
            d[key]=dict(entries)
            if other: d[key]["other"]=other
    return days,{"coverage_start":start.isoformat(),"coverage_end":end.isoformat(),"excluded":dict(excluded),"malformed_lines":malformed,"files":len(streams)}

def ingest(db,domain,patterns,today=None):
    try:
        days,meta=aggregate(read_streams(patterns),today)
        with db:
            retained=[]
            for date,value in days.items():
                value['refreshed_at']=now()
                old=db.execute("SELECT payload FROM daily WHERE domain=? AND date=?",(domain,date)).fetchone()
                if old:
                    previous=json.loads(old[0])
                    # Do not shrink a day when earlier rotated observations disappear.
                    if value["page_views"]<previous["page_views"] or dt.datetime.fromisoformat(value["first_seen"]).timestamp()>dt.datetime.fromisoformat(previous["first_seen"]).timestamp() or dt.datetime.fromisoformat(value["last_seen"]).timestamp()<dt.datetime.fromisoformat(previous["last_seen"]).timestamp():
                        retained.append(date)
                        continue
                    if not previous.get('partial',True) and date!=dt.datetime.now(TZ).date().isoformat(): value['partial']=False
                db.execute("INSERT OR REPLACE INTO daily VALUES(?,?,?)",(domain,date,json.dumps(value)))
            source(db,domain,"apache",status="connected",last_success=now(),last_attempt=now(),error=None,retained_dates=retained,**meta)
        return True
    except Exception as e:
        with db:
            source(db,domain,"apache",status="error",last_attempt=now(),error=str(e))
        return False

def validate_event(value):
    if not isinstance(value,dict) or set(value)-{"domain","event","campaign"}:
        raise ValueError("Unsupported fields")
    if value.get("domain") not in DOMAINS or value.get("event") not in EVENTS:
        raise ValueError("Unknown domain or event")
    tag=value.get("campaign","")
    if not isinstance(tag,str) or len(tag)>195:
        raise ValueError("Invalid campaign")
    if tag:
        parts=tag.split("|")
        if len(parts)!=4 or not all(FIELD.fullmatch(p) for p in parts[:3]) or (parts[3] and not FIELD.fullmatch(parts[3])):
            raise ValueError("Invalid campaign")
    return value["domain"],value["event"],tag

def record_event(db,value):
    domain,event,tag=validate_event(value)
    day=dt.datetime.now(TZ).date().isoformat()
    with db:
        # Bounded campaigns per domain/day: prevent unbounded cardinality.
        count=db.execute("SELECT COUNT(DISTINCT campaign) FROM action WHERE date=? AND domain=?",(day,domain)).fetchone()[0]
        exists=db.execute("SELECT 1 FROM action WHERE date=? AND domain=? AND campaign=?",(day,domain,tag)).fetchone()
        if count>=200 and not exists:
            raise ValueError("Daily campaign cardinality limit reached")
        db.execute("INSERT INTO action VALUES(?,?,?,?,1) ON CONFLICT(date,domain,event,campaign) DO UPDATE SET n=n+1",(day,domain,event,tag))
        key="instrumentation_since:"+domain
        db.execute("INSERT OR IGNORE INTO state VALUES(?,?)",(key,now()))

def overview(db):
    result={"generated_at":now(),"domains":{},"definitions":DEFINITIONS}
    for domain in DOMAINS:
        sources={name:json.loads(payload) for name,payload in db.execute("SELECT name,payload FROM source WHERE domain=?",(domain,))}
        for name in ("apache","goaccess","search_console"):
            sources.setdefault(name,{"status":"not_connected","last_success":None,"error":None,"setup":"Configure private source paths or Search Console property and authorized credential file; see operator setup."})
        documents={name:json.loads(payload) for name,payload in db.execute("SELECT name,payload FROM document WHERE domain=?",(domain,))}
        action_days=collections.defaultdict(dict)
        for date,event,tag,n in db.execute("SELECT date,event,campaign,n FROM action WHERE domain=?",(domain,)):
            action_days[date][event]=action_days[date].get(event,0)+n
            action_days[date].setdefault("campaigns",{}).setdefault(tag,{})[event]=n
        since=db.execute("SELECT value FROM state WHERE key=?",("instrumentation_since:"+domain,)).fetchone()
        result["domains"][domain]={
            "days":[json.loads(r[0]) for r in db.execute("SELECT payload FROM daily WHERE domain=? ORDER BY date",(domain,))],
            "sources":sources,"search":documents.get("search",{"daily":[],"queries":[],"pages":[]}),
            "seo":documents.get("seo",{"status":"not_connected","findings":[],"performance":{"status":"not_measured"}}),
            "actions":{"status":"collecting" if since else "not_instrumented","since":since[0] if since else None,"days":[{"date":date,**counts} for date,counts in sorted(action_days.items())]}
        }
    for domain in DOMAINS:
        row=db.execute("SELECT payload FROM document WHERE domain=? AND name='performance'",(domain,)).fetchone()
        if row: result["domains"][domain]["seo"]["performance"]=json.loads(row[0])
    return result
