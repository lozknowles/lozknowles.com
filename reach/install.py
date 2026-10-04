"""Scoped installation on cottageserver. Run as root after tests and staging checks."""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys

def run(*args):
    subprocess.run(args,check=True)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--release",required=True)
    parser.add_argument("--revision",required=True)
    parser.add_argument("--confirm-host",required=True)
    args=parser.parse_args()
    if os.geteuid()!=0 or args.confirm_host!="cottageserver" or subprocess.check_output(["hostname"],text=True).strip()!="cottageserver":
        raise SystemExit("Root installation restricted to confirmed cottageserver")
    release=Path(args.release).resolve()
    if not str(release).startswith("/home/loz/deploy-staging/reach-") or not (release/"reach/server.py").is_file():
        raise SystemExit("Unexpected staged release")
    vhost=Path("/etc/apache2/sites-available/lozknowles.com.conf")
    text=vhost.read_text()
    auth=Path("/etc/apache2/auth/maps-explorer.htpasswd")
    if not auth.is_file() or "DocumentRoot /var/www/lozknowles.com/public_html/dist" not in text:
        raise SystemExit("Verified production boundary changed")
    if "reach-growth" in text:
        raise SystemExit("Existing portal installation requires reviewed update workflow")
    stamp=dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup=Path("/home/loz/deploy-backups/reach-growth")/stamp
    backup.mkdir(parents=True,mode=0o700)
    shutil.copy2(vhost,backup/"lozknowles.com.conf.before")
    old_collingham=Path("/etc/apache2/sites-enabled/collingham.org.conf").read_bytes()
    (backup/"collingham.org.sha256").write_text(hashlib.sha256(old_collingham).hexdigest())
    data=Path("/var/lib/reach-growth")
    data.mkdir(mode=0o700,exist_ok=True)
    os.chown(data,1000,1000)
    private=Path("/etc/reach-growth");private.mkdir(mode=0o750,exist_ok=True);os.chown(private,0,1000)
    config=json.loads((release/"reach/config.example.json").read_text())
    config["proxy_token"]=secrets.token_hex(32)
    config_path=private/"config.json"
    if config_path.exists():raise SystemExit("Private config already exists; do not overwrite")
    config_path.write_text(json.dumps(config,indent=2));config_path.chmod(0o640);os.chown(config_path,0,1000)
    installed=Path("/opt/reach-growth/releases")/args.revision
    installed.parent.mkdir(parents=True,exist_ok=True)
    if installed.exists():raise SystemExit("Release already installed")
    for directory in (installed.parent.parent,installed.parent): directory.chmod(0o755)
    installed.mkdir()
    installed.chmod(0o755)
    shutil.copytree(release/"reach",installed/"reach",ignore=shutil.ignore_patterns("__pycache__","*.sqlite*","config.json","evidence"))
    for file in installed.rglob("*"):file.chmod(0o755 if file.is_dir() else 0o644)
    current=Path("/opt/reach-growth/current")
    if current.exists() or current.is_symlink():raise SystemExit("Unexpected current release")
    current.symlink_to(installed)
    snippet=Path("/etc/apache2/conf-available/reach-growth-routes.conf")
    snippet.write_text('''# Private Reach & Growth portal; all reads require existing owner authentication.
RedirectMatch 302 "^/reach$" "/reach/"
ProxyPass "/reach/" "http://127.0.0.1:18196/reach/" connectiontimeout=3 timeout=30 retry=0
ProxyPassReverse "/reach/" "http://127.0.0.1:18196/reach/"
<LocationMatch "^/reach(?:/|$)">
    AuthType Basic
    AuthName "Private Reach and Growth"
    AuthBasicProvider file
    AuthUserFile /etc/apache2/auth/maps-explorer.htpasswd
    Require valid-user
    RequestHeader unset X-Reach-Token
    RequestHeader set X-Reach-Token "TOKEN"
    RequestHeader unset X-Reach-Client
    Header always set Cache-Control "no-store, private"
    Header always set X-Robots-Tag "noindex, nofollow, noarchive"
    Header always set Referrer-Policy "no-referrer"
    Header always set X-Content-Type-Options "nosniff"
    ErrorDocument 401 default
</LocationMatch>
'''.replace("TOKEN",config["proxy_token"]))
    snippet.chmod(0o640)
    # Insert only in the existing TLS virtual host, preserving every other directive.
    marker="    Include /etc/letsencrypt/options-ssl-apache.conf"
    if text.count(marker)!=1:raise SystemExit("TLS include insertion point changed")
    text=text.replace(marker,"    Include /etc/apache2/conf-available/reach-growth-routes.conf\n"+marker)
    vhost.write_text(text)
    service='''[Unit]
Description=Private Reach and Growth portal
After=network.target
[Service]
User=loz
Group=loz
WorkingDirectory=/opt/reach-growth/current
ExecStart=/usr/bin/python3 -m reach.server --config /etc/reach-growth/config.json
Restart=on-failure
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/var/lib/reach-growth
InaccessiblePaths=/home/loz/.ssh /home/loz/.config /root
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
[Install]
WantedBy=multi-user.target
'''
    Path("/etc/systemd/system/reach-growth.service").write_text(service)
    refresh=service.replace("Private Reach and Growth portal","Refresh private Reach and Growth aggregates").replace("After=network.target","After=network-online.target").replace("ExecStart=/usr/bin/python3 -m reach.server","Type=oneshot\nExecStart=/usr/bin/python3 -m reach.refresh").replace("Restart=on-failure\n","").replace("[Install]\nWantedBy=multi-user.target\n","")
    Path("/etc/systemd/system/reach-growth-refresh.service").write_text(refresh)
    Path("/etc/systemd/system/reach-growth-refresh.timer").write_text("""[Unit]
Description=Durable private analytics refresh
[Timer]
OnCalendar=*-*-* 04:15:00
OnCalendar=*-*-* 12:15:00
Persistent=true
RandomizedDelaySec=60
[Install]
WantedBy=timers.target
""")
    try:
        run("apache2ctl","configtest")
        run("systemctl","daemon-reload")
        run("systemctl","enable","--now","reach-growth.service")
        run("systemctl","start","reach-growth-refresh.service")
        run("systemctl","enable","--now","reach-growth-refresh.timer")
        run("systemctl","reload","apache2")
        run("systemctl","is-active","--quiet","apache2","reach-growth.service")
    except Exception:
        subprocess.run(['systemctl','disable','--now','reach-growth-refresh.timer','reach-growth.service'])
        shutil.copy2(backup/"lozknowles.com.conf.before",vhost)
        subprocess.run(["apache2ctl","configtest"])
        subprocess.run(["systemctl","reload","apache2"])
        raise
    if old_collingham!=Path("/etc/apache2/sites-enabled/collingham.org.conf").read_bytes():
        raise SystemExit("Unrelated Collingham config changed concurrently; inspect before claiming preservation")
    rollback=backup/"rollback.sh"
    rollback.write_text("""#!/bin/sh
set -eu
test "$(hostname)" = cottageserver
cp 'BACKUP/lozknowles.com.conf.before' /etc/apache2/sites-available/lozknowles.com.conf
apache2ctl configtest
systemctl reload apache2
systemctl disable --now reach-growth-refresh.timer reach-growth.service
# Keep private database, release, config and reports for recovery.
""".replace("BACKUP",str(backup)))
    rollback.chmod(0o700)
    manifest={"revision":args.revision,"installed":str(installed),"backup":str(backup),"time":stamp,"auth":"existing maps login","data":"/var/lib/reach-growth/portal.sqlite","collector":"not yet installed","existing_reports_job":"unchanged"}
    (backup/"deployment.json").write_text(json.dumps(manifest,indent=2))
    print(json.dumps(manifest))

if __name__=="__main__":main()

