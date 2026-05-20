#!/usr/bin/env python3
"""
VIGÍA Portal — Daily Backup & Audit Log Sync
Runs daily (via cron/launchd) to:
1. Export today's audit log from production → Google Drive 03_Daily_Audit_Logs
2. Backup key workspace files → Google Drive 04_Cron_Jobs_and_Backups
3. Upload daily snapshot report → Google Drive 04_Cron_Jobs_and_Backups

Authorized by: Zaid Khan (U087TL6CGNM)
"""

import subprocess, json, warnings, io, datetime, os, sys, urllib.request
warnings.filterwarnings('ignore')

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

# ── Setup ─────────────────────────────────────────────────────────
today = datetime.date.today().isoformat()
now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M CST')

GDRIVE_FOLDERS = {
    'audit':  '1ZbvsWVPqtY4shMUiolnCN5qoj_ZpzmGt',   # 03_Daily_Audit_Logs
    'backup': '1vqvoWqU4XIeT35PLebbEGHh6lHcI3vDh',   # 04_Cron_Jobs_and_Backups
    'docs':   '1PsAr9uopAw5wyWP27p5hikrwBgRCPMNO',   # 05_Documentation
    'source': '1AnkbgTVh1kyi-qzrAUcRYCGCbqpHvlug',   # 01_Source_Code_and_Config
}

PORTAL_URL = 'https://vigia-production-5a0a.up.railway.app'
WORKSPACE = os.path.expanduser('~/.openclaw-state-vigia/workspace')

log_lines = [f"VIGÍA Daily Backup — {now}", "=" * 50]

def log(msg):
    print(msg)
    log_lines.append(msg)

def get_gdrive():
    r = subprocess.run(
        ['op', 'read', 'op://sophia-agent-zaid/vigia-gdrive-ingestion-key/vigia-495502-78515dc9a899.json'],
        capture_output=True, text=True
    )
    creds = service_account.Credentials.from_service_account_info(
        json.loads(r.stdout),
        scopes=['https://www.googleapis.com/auth/drive']
    )
    return build('drive', 'v3', credentials=creds)

def upload(service, name, content, folder_id, mime='text/plain'):
    media = MediaIoBaseUpload(io.BytesIO(content.encode() if isinstance(content, str) else content), mimetype=mime)
    meta = {'name': name, 'parents': [folder_id]}
    f = service.files().create(body=meta, media_body=media, supportsAllDrives=True, fields='id,name').execute()
    return f['id']

def upload_file(service, path, folder_id):
    name = os.path.basename(path)
    mime = 'text/markdown' if name.endswith('.md') else 'text/plain'
    with open(path, 'rb') as f:
        content = f.read()
    media = MediaIoBaseUpload(io.BytesIO(content), mimetype=mime)
    meta = {'name': f"{today}_{name}", 'parents': [folder_id]}
    service.files().create(body=meta, media_body=media, supportsAllDrives=True, fields='id').execute()

# ── Step 1: Get production token ──────────────────────────────────
log("Step 1: Connecting to portal...")
try:
    login_data = json.dumps({"email": "zaid@airtm.io"}).encode()
    req = urllib.request.Request(
        f"{PORTAL_URL}/api/auth/login",
        data=login_data,
        headers={"Content-Type": "application/json"}
    )
    resp = json.loads(urllib.request.urlopen(req, timeout=15).read())
    token = resp['token']
    log(f"  ✅ Authenticated as zaid@airtm.io")
except Exception as e:
    log(f"  ❌ Auth failed: {e}")
    token = None

# ── Step 2: Export today's audit log ─────────────────────────────
log("Step 2: Exporting audit log...")
audit_entries = 0
audit_csv = "timestamp,user_email,action,resource_id,decision,details\n"

if token:
    try:
        audit_req = urllib.request.Request(
            f"{PORTAL_URL}/api/audit/log?date={today}",
            headers={"Authorization": f"Bearer {token}"}
        )
        audit_data = json.loads(urllib.request.urlopen(audit_req, timeout=15).read())
        logs = audit_data.get('logs', [])
        audit_entries = len(logs)
        
        for entry in logs:
            det = str(entry.get('details', '')).replace('"', '""')
            audit_csv += f"\"{entry.get('timestamp','')}\",\"{entry.get('user_email','')}\",\"{entry.get('action','')}\",\"{entry.get('resource_id','')}\",\"{entry.get('decision','')}\",\"{det}\"\n"
        
        log(f"  ✅ {audit_entries} audit entries for {today}")
    except Exception as e:
        log(f"  ❌ Audit log fetch failed: {e}")
        audit_csv += f"ERROR,{e},,,,\n"
else:
    audit_csv += "ERROR,Auth failed — no token available,,,,\n"

# ── Step 3: Check portal health ───────────────────────────────────
log("Step 3: Portal health check...")
try:
    health_req = urllib.request.Request(f"{PORTAL_URL}/api/health")
    health = json.loads(urllib.request.urlopen(health_req, timeout=10).read())
    portal_status = "✅ ONLINE" if health.get('status') == 'ok' else "⚠️ DEGRADED"
    log(f"  {portal_status} — {health.get('timestamp','?')}")
    
    sso_req = urllib.request.Request(f"{PORTAL_URL}/api/health/sso")
    sso = json.loads(urllib.request.urlopen(sso_req, timeout=10).read())
    sso_status = "✅ READY" if sso.get('sso_ready') else "❌ NOT CONFIGURED"
    log(f"  SSO: {sso_status}")
except Exception as e:
    portal_status = f"❌ UNREACHABLE: {e}"
    log(f"  {portal_status}")

# ── Step 4: Upload to Google Drive ────────────────────────────────
log("Step 4: Uploading to Google Drive...")
try:
    gdrive = get_gdrive()
    
    # Audit log
    upload(gdrive, f"audit_log_{today}.csv", audit_csv, GDRIVE_FOLDERS['audit'], 'text/csv')
    log(f"  ✅ Audit log → 03_Daily_Audit_Logs/audit_log_{today}.csv")
    
    # Daily snapshot report
    snapshot = f"""VIGÍA Portal — Daily Snapshot
Date: {now}
Portal: {PORTAL_URL}

PORTAL STATUS: {portal_status}

AUDIT SUMMARY:
- Total actions today: {audit_entries}
- Log exported: YES

LAST 5 ACTIONS:
"""
    # Add last 5 from audit
    for line in audit_csv.strip().split('\n')[1:6]:
        snapshot += f"  {line}\n"
    
    upload(gdrive, f"daily_snapshot_{today}.md", snapshot, GDRIVE_FOLDERS['backup'], 'text/markdown')
    log(f"  ✅ Snapshot → 04_Cron_Jobs_and_Backups/daily_snapshot_{today}.md")
    
    # Backup key workspace files
    files_to_backup = [
        f"{WORKSPACE}/vigia-portal/VIGIA_PRODUCTION_RUNBOOK.md",
        f"{WORKSPACE}/vigia-portal/JUNE1_LAUNCH_CHECKLIST.md",
        f"{WORKSPACE}/vigia-portal/SUPPORT_TEAM_TRAINING.md",
        f"{WORKSPACE}/memory/2026-05-20.md",
    ]
    for fpath in files_to_backup:
        if os.path.exists(fpath):
            upload_file(gdrive, fpath, GDRIVE_FOLDERS['backup'])
            log(f"  ✅ Backed up: {os.path.basename(fpath)}")
    
    log("Step 4 complete.")
    
except Exception as e:
    log(f"  ❌ GDrive upload failed: {e}")
    import traceback
    log(traceback.format_exc())

# ── Step 5: Write run log ─────────────────────────────────────────
log_content = "\n".join(log_lines)
log_path = f"{WORKSPACE}/scripts/vigia_backup_last_run.log"
with open(log_path, 'w') as f:
    f.write(log_content)

log(f"\nComplete. Log written to {log_path}")
print("\n".join(log_lines[-5:]))
