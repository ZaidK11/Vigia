#!/bin/bash
# Vigia Portal — Railway Environment Variable Setup
# Run this once after `railway login` to push all env vars to Railway
# Usage: ./set-railway-env.sh

set -e

echo "🔑 Pulling secrets from 1Password..."

JIRA_TOKEN=$(op item get "vigia-jira-api-token" --vault "sophia-agent-zaid" --field "password")
FRESHDESK_KEY=$(op item get "vigia-freshdesk-api-key" --vault "sophia-agent-zaid" --field "password")
CH_PASS=$(op item get "vigia-clickhouse" --vault "sophia-agent-zaid" --field "password")
ANTHROPIC_KEY=$(op item get "vigia-anthropic-api-key" --vault "sophia-agent-zaid" --field "password")
PERSONA_KEY=$(op item get "vigia-persona-api-key" --vault "sophia-agent-zaid" --field "password")
GOOGLE_CID=$(op item get "vigia-google-oauth" --vault "sophia-agent-zaid" --field "client_id")
GOOGLE_CSEC=$(op item get "vigia-google-oauth" --vault "sophia-agent-zaid" --field "client_secret")

# Fixed values
SESSION_SECRET=$(openssl rand -hex 32)
REG_SECRET="a87ba84d8ebf1478f5ac27a8f0bb69b8d606ca6c092ed2d6771a6005725b6569"

echo "✅ Secrets loaded. Pushing to Railway..."

railway variables set \
  JIRA_BASE_URL="https://airtech.atlassian.net" \
  JIRA_EMAIL="zaid@airtm.io" \
  JIRA_TOKEN="$JIRA_TOKEN" \
  FRESHDESK_BASE_URL="https://airtm.freshdesk.com/api/v2" \
  FRESHDESK_KEY="$FRESHDESK_KEY" \
  CLICKHOUSE_HOST="https://data-lake.galar.data.airtm.com" \
  CLICKHOUSE_USER="ruben" \
  CLICKHOUSE_PASSWORD="$CH_PASS" \
  ANTHROPIC_API_KEY="$ANTHROPIC_KEY" \
  CLAUDE_MODEL="claude-sonnet-4-5" \
  PERSONA_BASE_URL="https://withpersona.com/api/v1" \
  PERSONA_API_KEY="$PERSONA_KEY" \
  GOOGLE_CLIENT_ID="$GOOGLE_CID" \
  GOOGLE_CLIENT_SECRET="$GOOGLE_CSEC" \
  GOOGLE_CALLBACK_URL="https://vigia-production-5a0a.up.railway.app/auth/google/callback" \
  SESSION_SECRET="$SESSION_SECRET" \
  NODE_ENV="production" \
  PORT="3000" \
  REGULATORY_FEED_SECRET="$REG_SECRET"

echo ""
echo "✅ All Railway environment variables set."
echo "   Railway will auto-redeploy. Portal should be live in ~2 minutes."
echo ""
echo "   REGULATORY_FEED_SECRET: $REG_SECRET"
echo "   (Sophia uses this to POST daily briefs to the Regulatory Intel tab)"
