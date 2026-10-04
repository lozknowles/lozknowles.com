"""Promote a reviewed private release after a first-install rollback; public files untouched."""
import argparse, hashlib, http.client, json, os, re, shutil, subprocess, time
from pathlib import Path

def run(*args): subprocess.run(args,check=True)
def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--stage",required=True);parser.add_argument("--revision",required=True);parser.add_argument("--backup",required=True)
    args=parser.parse_args()
    if os.geteuid()!=0 or subprocess.check_output(["hostname"],text=True).strip()!="cottageserver": raise SystemExit("Confirmed production root required")
    if not re.fullmatch("[a-f0-9]{40}",args.revision): raise SystemExit("Invalid commit")
    stage=Path(args.stage).resolve();backup=Path(args.backup).resolve()
    if not str(stage).startswith("/home/loz/deploy-staging/reach-") or not str(backup).startswith("/home/loz/deploy-backups/reach-growth/"): raise SystemExit("Unexpected scoped paths")
    vhost=Path("/etc/apache2/sites-available/lozknowles.com.conf")
    before=(backup/"lozknowles.com.conf.before").read_bytes()
    if vhost.read_bytes()!=before: raise SystemExit("Apache baseline drifted; review before promotion")
    config=json.loads(Path("/etc/reach-growth/config.json").read_text())
    current=Path("/opt/reach-growth/current");prior=str(current.resolve())
    release=Path("/opt/reach-growth/releases")/args.revision
    if release.exists(): raise SystemExit("Release already exists")
    release.mkdir(mode=0o755);release.chmod(0o755)
    shutil.copytree(stage/"reach",release/"reach",ignore=shutil.ignore_patterns("__pycache__","*.sqlite*","config.json","evidence"))
    for p in release.rglob("*"): p.chmod(0o755 if p.is_dir() else 0o644)
    nextlink=current.parent/"current.next"
    if nextlink.exists() or nextlink.is_symlink(): raise SystemExit("Existing pending release link")
    nextlink.symlink_to(release);os.replace(nextlink,current)
    try:
        run("systemctl","restart","reach-growth.service")
        run("systemctl","start","reach-growth-refresh.service")
        connection=http.client.HTTPConnection("127.0.0.1",config["port"],timeout=15)
        connection.request("GET","/reach/api/overview",headers={"X-Reach-Token":config["proxy_token"]})
        response=connection.getresponse();payload=json.loads(response.read());connection.close()
        if response.status!=200 or any(payload["domains"][d]["sources"]["apache"]["status"]!="connected" for d in ("lozknowles.com","collingham.org")): raise RuntimeError("Private service/data preflight failed")
        marker="    Include /etc/letsencrypt/options-ssl-apache.conf"
        text=before.decode()
        if text.count(marker)!=1: raise RuntimeError("TLS insertion point changed")
        vhost.write_text(text.replace(marker,"    Include /etc/apache2/conf-available/reach-growth-routes.conf\n"+marker))
        run("apache2ctl","configtest")
        run("systemctl","enable","--now","reach-growth.service","reach-growth-refresh.timer")
        run("systemctl","reload","apache2")
        run("systemctl","is-active","--quiet","apache2","reach-growth.service")
    except Exception:
        vhost.write_bytes(before)
        subprocess.run(["apache2ctl","configtest"]);subprocess.run(["systemctl","reload","apache2"])
        subprocess.run(["systemctl","disable","--now","reach-growth-refresh.timer","reach-growth.service"])
        raise
    rollback=backup/"rollback.sh"
    rollback.write_text("""#!/bin/sh
set -eu
test "$(hostname)" = cottageserver
cp 'BACKUP/lozknowles.com.conf.before' /etc/apache2/sites-available/lozknowles.com.conf
apache2ctl configtest
systemctl reload apache2
systemctl disable --now reach-growth-refresh.timer reach-growth.service
# Keep private aggregates/config/versioned source for recovery.
""".replace("BACKUP",str(backup)));rollback.chmod(0o700)
    record={"revision":args.revision,"release":str(release),"prior_unpublished_release":prior,"backup":str(backup),"url":"https://lozknowles.com/reach/","auth":"existing maps login","collector":"not exposed","public_site_files":"not modified"}
    (backup/"deployment.json").write_text(json.dumps(record,indent=2))
    print(json.dumps(record))
if __name__=="__main__":main()
