#!/bin/bash
# ============================================================
# VIGÍA Compliance Portal — Setup Script
# Resolves secrets from 1Password and writes server/.env
# Run: bash setup.sh
# ============================================================

set -e

echo "⚖️  VIGÍA Compliance Portal — Setup"
echo "======================================"

# Check op CLI
if ! command -v op &> /dev/null; then
  echo "❌ 1Password CLI (op) not found. Install from: https://developer.1password.com/docs/cli/"
  exit 1
fi

echo "🔐 Resolving secrets from 1Password vault: sophia-agent-zaid..."

CH_PASS=$(op read "op://sophia-agent-zaid/vigia-clickhouse/password" 2>/dev/null || echo "")
JIRA_TOK=$(op read "op://sophia-agent-zaid/openclaw-jira-api-token/password" 2>/dev/null || echo "")
FD_KEY=$(op read "op://sophia-agent-zaid/vigia-freshdesk-api-key/password" 2>/dev/null || echo "")
PERSONA_KEY=$(op read "op://sophia-agent-zaid/vigia-persona-api-key/password" 2>/dev/null || echo "")
ELLIPTIC_KEY=$(op read "op://sophia-agent-zaid/vigia-elliptic-api-key/password" 2>/dev/null || echo "")

if [ -z "$JIRA_TOK" ]; then
  echo "⚠️  Warning: Some secrets could not be resolved. Check 1Password vault access."
fi

cat > server/.env << EOF
# VIGÍA Compliance Portal — Environment Config
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Authorized: Zaid Khan (U087TL6CGNM)

CLICKHOUSE_HOST=https://data-lake.galar.data.airtm.com
CLICKHOUSE_USER=ruben
CLICKHOUSE_PASSWORD=${CH_PASS}

JIRA_BASE_URL=https://airtech.atlassian.net
JIRA_EMAIL=zaid@airtm.io
JIRA_TOKEN=${JIRA_TOK}

FRESHDESK_BASE_URL=https://airtm.freshdesk.com/api/v2
FRESHDESK_KEY=${FD_KEY}

PERSONA_API_KEY=${PERSONA_KEY}
PERSONA_BASE_URL=https://withpersona.com/api/v1

ELLIPTIC_API_KEY=${ELLIPTIC_KEY}

SESSION_SECRET=vigia-compliance-portal-2026
PORT=3001
EOF

echo "✅ server/.env written"
echo ""
echo "📦 Installing server dependencies..."
cd server && npm install && cd ..

echo "📦 Installing client dependencies..."
cd client && npm install && cd ..

echo ""
echo "======================================"
echo "✅ Setup complete!"
echo ""
echo "To start the portal:"
echo "  Terminal 1 (backend):  cd server && npm start"
echo "  Terminal 2 (frontend): cd client && npm run dev"
echo ""
echo "  Portal URL: http://localhost:5173"
echo "  API URL:    http://localhost:3001"
echo ""
echo "Login with any @airtm.io email from the whitelist."
echo "======================================"
