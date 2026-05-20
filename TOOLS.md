# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:

- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras

- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH

- home-server → 192.168.1.100, user: admin

### TTS

- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

Add whatever helps you do your job. This is your cheat sheet.

### Google OAuth — Vigia Portal (added 2026-05-19)

- **Vault item:** `vigia-google-oauth` in `sophia-agent-zaid`
- **Item ID:** `un32y4if2w2plkufllcy5odqpu`
- **Project:** `vigia-495502` (GCP)
- **Client ID ref:** `op://sophia-agent-zaid/vigia-google-oauth/client_id`
- **Client Secret ref:** `op://sophia-agent-zaid/vigia-google-oauth/client_secret`
- **Redirect URI:** `https://vigia-production-5a0a.up.railway.app/auth/google/callback`
- **Railway vars to set:** `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`
- **Status:** ✅ Stored in 1Password — Zaid must paste into Railway Variables

### Google Drive — Vigia Portal (added 2026-05-20)

Folder structure under Vigia Digital Office (root: 0AHjKQ3BLjrxuUk9PVA):

| Folder | GDrive ID | Contents |
|---|---|---|
| 80_Vigia_Portal | `1F-Q65nc1jQhr9CdJw9NHS0BUbBglhOx2` | Portal root |
| 01_Source_Code_and_Config | `1AnkbgTVh1kyi-qzrAUcRYCGCbqpHvlug` | Config docs, env var reference |
| 02_Deployment_and_Railway | `1whCGYU4tAiAxEBcO6TqvXuG1A86wwhHB` | Deployment guides |
| 03_Daily_Audit_Logs | `1ZbvsWVPqtY4shMUiolnCN5qoj_ZpzmGt` | Daily CSV audit exports |
| 04_Cron_Jobs_and_Backups | `1vqvoWqU4XIeT35PLebbEGHh6lHcI3vDh` | Daily snapshots + file backups |
| 05_Documentation | `1PsAr9uopAw5wyWP27p5hikrwBgRCPMNO` | Runbook, training guides |

Daily backup cron: `~/Library/LaunchAgents/com.vigia.daily.backup.plist` — runs 7am daily
Script: `workspace/scripts/vigia_daily_backup.py`
Last backup: 2026-05-20 (manual run)
