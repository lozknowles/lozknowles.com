import datetime as dt
import gzip
import http.client
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
from reach.core import *
from reach.server import make_server, Limiter
from reach.refresh import gsc, OriginHTTPSHandler
import reach.refresh as refresh_module
import ssl,subprocess
from urllib.request import Request,build_opener
from urllib.error import URLError
from http.server import BaseHTTPRequestHandler,HTTPServer

def line(day=1,time="12:00:00",target="/",agent="Mozilla/5.0",method="GET",status=200,ip="192.0.2.12"):
    return f'{ip} - - [{day:02d}/Oct/2026:{time} +0100] "{method} {target} HTTP/1.1" {status} 100 "https://www.google.com/search?q=private" "{agent}"\n'

class Aggregates(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.root=Path(self.temp.name)
        self.db=connect(self.root/"private.sqlite")
        self.log=self.root/"access.log"
    def tearDown(self):
        self.db.close();self.temp.cleanup()
    def write(self,value): self.log.write_text(value)
    def test_accuracy_sessions_filter_privacy(self):
        self.write(line()+line(time="12:10:00",target="/walks/?q=secret")+line(time="13:00:00")+line(agent="Googlebot")+line(target="/assets/a.js")+line(status=301)+line(method="HEAD")+line(target="/api/ask?q=secret")+line(target="/users/123456789")+line(target="/?utm_source=facebook&utm_medium=social&utm_campaign=autumn"))
        self.assertTrue(ingest(self.db,DOMAINS[0],[str(self.log)],dt.date(2026,10,4)))
        d=overview(self.db)["domains"][DOMAINS[0]]["days"][0]
        self.assertEqual(d["page_views"],4)
        self.assertEqual(d["sessions"],2)
        self.assertEqual(d["campaigns"],{"facebook|social|autumn|":1})
        output=json.dumps(d)
        for private in ("secret","192.0.2.12","Mozilla","search?q"): self.assertNotIn(private,output)
        self.assertTrue(d["partial"])
    def test_audit_and_identifier_referral_privacy(self):
        device="device-1d5f5dd7-a3e9-401d-be75-d983b8008a8b.remotewd.com"
        self.write(line().replace("www.google.com",device)+line(agent="ReachTechnicalAudit/1.0"))
        ingest(self.db,DOMAINS[0],[str(self.log)])
        day=overview(self.db)["domains"][DOMAINS[0]]["days"][0]
        self.assertEqual(day["page_views"],1)
        self.assertNotIn(device,json.dumps(day))
        self.assertEqual(day["referrals"],{})
    def test_consecutive_identical_legitimate_lines(self):
        self.write(line()+line())
        ingest(self.db,DOMAINS[0],[str(self.log)])
        self.assertEqual(overview(self.db)["domains"][DOMAINS[0]]["days"][0]["page_views"],2)
    def test_reimport_rotation_compression(self):
        self.write(line()+line(day=2))
        ingest(self.db,DOMAINS[0],[str(self.log)])
        ingest(self.db,DOMAINS[0],[str(self.log)])
        self.log.rename(self.root/"access.log.1")
        with gzip.open(self.root/"access.log.1.gz","wb") as f:f.write((line()+line(day=2)).encode())
        self.write(line(day=3))
        ingest(self.db,DOMAINS[0],[str(self.root/"access.log*")])
        days=overview(self.db)["domains"][DOMAINS[0]]["days"]
        self.assertEqual([d["page_views"] for d in days],[1,1,1])
        (self.root/"access.log.1").unlink()
        ingest(self.db,DOMAINS[0],[str(self.root/"access.log*")])
        self.assertEqual([d["page_views"] for d in overview(self.db)["domains"][DOMAINS[0]]["days"]],[1,1,1])
    def test_distinct_archives_identical_lines_retained(self):
        self.write(line())
        (self.root/"access.log.1").write_text(line())
        ingest(self.db,DOMAINS[0],[str(self.root/"access.log*")])
        self.assertEqual(overview(self.db)["domains"][DOMAINS[0]]["days"][0]["page_views"],2)
    def test_missing_and_failure_preserve(self):
        self.write(line()+line(day=3))
        ingest(self.db,DOMAINS[0],[str(self.log)])
        before=overview(self.db)["domains"][DOMAINS[0]]
        self.assertEqual([d["date"] for d in before["days"]],["2026-10-01","2026-10-03"])
        self.log.unlink()
        self.assertFalse(ingest(self.db,DOMAINS[0],[str(self.log)]))
        after=overview(self.db)["domains"][DOMAINS[0]]
        self.assertEqual(before["days"],after["days"])
        self.assertEqual(before["sources"]["apache"]["last_success"],after["sources"]["apache"]["last_success"])
        self.assertEqual(after["sources"]["apache"]["status"],"error")
    def test_raw_rotation_loss_preserve(self):
        self.write(line()+line(day=2)+line(day=2,time="14:00:00"))
        ingest(self.db,DOMAINS[0],[str(self.log)])
        self.write(line(day=2,time="14:00:00")+line(day=3))
        ingest(self.db,DOMAINS[0],[str(self.log)])
        days=overview(self.db)["domains"][DOMAINS[0]]["days"]
        self.assertEqual([d["page_views"] for d in days],[1,2,1])
        self.assertFalse(days[1]["partial"])
    def test_bad_format_preserve(self):
        self.write(line())
        ingest(self.db,DOMAINS[0],[str(self.log)])
        self.write("not combined\n"*20+line(day=2))
        self.assertFalse(ingest(self.db,DOMAINS[0],[str(self.log)]))
        self.assertEqual(len(overview(self.db)["domains"][DOMAINS[0]]["days"]),1)
    def test_dst_elapsed_session_window(self):
        first=line(day=25,time="01:10:00")
        second=line(day=25,time="01:10:00").replace("+0100","+0000")
        self.write(first+second)
        ingest(self.db,DOMAINS[0],[str(self.log)],dt.date(2026,10,26))
        d=overview(self.db)["domains"][DOMAINS[0]]["days"][0]
        self.assertEqual(d["sessions"],2)
        self.assertEqual(d["page_views"],2)
    def test_campaign_validation(self):
        self.assertIsNone(campaign("utm_source=facebook&utm_source=mail&utm_medium=social&utm_campaign=a"))
        self.assertIsNone(campaign("utm_source=user@example.com&utm_medium=mail&utm_campaign=a"))
        self.assertIsNone(campaign("utm_source=x&utm_medium=y&utm_campaign=z&utm_term=private"))
        self.assertEqual(campaign("q=discard&utm_source=flyer&utm_medium=qr&utm_campaign=autumn"),"flyer|qr|autumn|")
        for value in ({"domain":"evil.test","event":"walk_start"},{"domain":DOMAINS[0],"event":"ask_use","question":"secret"},{"domain":DOMAINS[0],"event":"ask_use","campaign":"a|b|c|email@example.com"}):
            with self.assertRaises(ValueError): validate_event(value)
    def test_search_missing_and_failure_preserve(self):
        document(self.db,DOMAINS[0],"search",{"daily":[{"date":"2026-09-01","clicks":10}]})
        source(self.db,DOMAINS[0],"search_console",last_success="2026-09-04")
        self.db.commit()
        self.assertFalse(gsc(self.db,DOMAINS[0],{}))
        d=overview(self.db)["domains"][DOMAINS[0]]
        self.assertEqual(d["search"]["daily"][0]["clicks"],10)
        self.assertEqual(d["sources"]["search_console"]["last_success"],"2026-09-04")
        self.assertIn("sc-domain:lozknowles.com",d["sources"]["search_console"]["setup"])
    def test_transaction_rollback(self):
        self.write(line()+line(day=2))
        with patch("reach.core.source",side_effect=RuntimeError("interrupted")):
            with self.assertRaises(RuntimeError):ingest(self.db,DOMAINS[0],[str(self.log)])
        self.assertEqual(self.db.execute("SELECT count(*) FROM daily").fetchone()[0],0)

class AccessControl(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.root=Path(self.temp.name)
        self.token="a"*48
        self.server=make_server({"proxy_token":self.token,"database":str(self.root/"data.sqlite"),"reports_dir":str(self.root)},port=0)
        (self.root/"lozknowles.html").write_text("<h1>private report</h1>")
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.temp.cleanup()
    def request(self,method,path,body=None,headers=None):
        c=http.client.HTTPConnection(*self.server.server_address,timeout=3)
        c.request(method,path,body=body,headers=headers or {})
        response=c.getresponse();result=response.status,response.read(),dict(response.getheaders());c.close();return result
    def test_all_private_routes_deny(self):
        for path in ("/reach","/reach/","/reach/api/overview","/reach/reports/lozknowles.html","/reach/data.json","/reach/../core.py","/reach%2fapi/overview"):
            for method in ("GET","HEAD"):
                status,_,_=self.request(method,path)
                self.assertEqual(status,403,path)
    def test_authenticated_api_cache_and_missing(self):
        status,body,headers=self.request("GET","/reach/api/overview",headers={"X-Reach-Token":self.token})
        self.assertEqual(status,200)
        d=json.loads(body)
        self.assertEqual(d["domains"][DOMAINS[0]]["days"],[])
        self.assertEqual(d["domains"][DOMAINS[0]]["sources"]["apache"]["status"],"not_connected")
        self.assertIn("no-store",headers["Cache-Control"])
        self.assertIn("noindex",headers["X-Robots-Tag"])
    def test_collector_write_only_strict_rate_limit(self):
        headers={"X-Reach-Token":self.token,"Content-Type":"application/json","Origin":"https://collingham.org","X-Reach-Client":"fixture"}
        body=json.dumps({"domain":"collingham.org","event":"ask_use","campaign":"facebook|social|autumn|"})
        self.assertEqual(self.request("GET","/reach-collect",headers=headers)[0],404)
        self.assertEqual(self.request("POST","/reach-collect",body,{**headers,"Origin":"https://evil.test"})[0],400)
        self.assertEqual(self.request("POST","/reach-collect",json.dumps({"domain":"collingham.org","event":"ask_use","question":"secret"}),headers)[0],400)
        self.assertEqual(self.request("POST","/reach-collect","x"*1025,headers)[0],413)
        self.assertEqual(self.request("POST","/reach-collect",body,headers)[0],204)
        for _ in range(30):status=self.request("POST","/reach-collect",body,headers)[0]
        self.assertEqual(status,429)
        self.assertEqual(self.request("POST","/reach/api/overview",body,headers)[0],404)
    def test_limiter_expiry(self):
        clock=[0];l=Limiter(lambda:clock[0])
        for _ in range(30):self.assertTrue(l.allow("ip"))
        self.assertFalse(l.allow("ip"));clock[0]=61;self.assertTrue(l.allow("ip"))


class TLSOrigin(unittest.TestCase):
    def test_verified_sni_and_untrusted_rejection(self):
        with tempfile.TemporaryDirectory() as tmp:
            key=Path(tmp)/"key.pem"; cert=Path(tmp)/"cert.pem"
            subprocess.run(["openssl","req","-x509","-newkey","rsa:2048","-nodes","-days","1","-subj","/CN=lozknowles.com","-addext","subjectAltName=DNS:lozknowles.com","-keyout",str(key),"-out",str(cert)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            class Reply(BaseHTTPRequestHandler):
                def do_GET(self):
                    self.send_response(200);self.end_headers();self.wfile.write(b"verified")
                def log_message(self,*args): pass
            server=HTTPServer(("127.0.0.1",0),Reply)
            context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);context.load_cert_chain(cert,key)
            names=[];context.set_servername_callback(lambda sock,name,ctx:names.append(name))
            server.socket=context.wrap_socket(server.socket,server_side=True)
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            try:
                with patch.object(refresh_module,"AUDIT_ORIGIN","127.0.0.1"):
                    trusted=ssl.create_default_context(cafile=str(cert))
                    opener=build_opener(OriginHTTPSHandler(context=trusted))
                    with opener.open("https://lozknowles.com:"+str(server.server_port)+"/",timeout=3) as response:
                        self.assertEqual(response.read(),b"verified")
                    self.assertIn("lozknowles.com",names)
                    with self.assertRaises(URLError):
                        build_opener(OriginHTTPSHandler()).open("https://lozknowles.com:"+str(server.server_port)+"/",timeout=3)
                    with self.assertRaises(URLError):
                        opener.open("https://www.lozknowles.com:"+str(server.server_port)+"/",timeout=3)
            finally:
                server.shutdown();server.server_close()

if __name__=="__main__":unittest.main()

