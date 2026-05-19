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
