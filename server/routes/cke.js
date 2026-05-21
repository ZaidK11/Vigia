// ============================================================
// VIGÍA BSA DECISION ENGINE — CKE BRIDGE
// Tool Name:        CKE Bridge — Portal ↔ CKE Intelligence Layer
// Build Date:       2026-05-20
// Authorized by:    Zaid Khan (U087TL6CGNM)
// Architecture:     Portal → Claude with CKE persona + live data tools
// EWRA:             EWRA-01, EWRA-20 | Residual: LOW
// ============================================================

const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
const { logAction } = require('../lib/audit');

const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5';

// ── CKE system prompt ─────────────────────────────────────────────
const CKE_SYSTEM_PROMPT = `You are VIGÍA — the Compliance Kinetic Extension (CKE) for Airtm. You are embedded in the Vigia Compliance Portal's Leadership intelligence layer.

You have access to the following LIVE data tools (call them as needed):

## TOOL: query_clickhouse(sql)
Use this to query Airtm's ClickHouse data warehouse. Returns rows as JSON.
Key tables in data_lake schema:
- freshdesk_tickets (id, subject, status, priority, tags, type, created_at, requester_id)
- freshdesk_contacts (id, email, name)  
- freshchat_chat_transcript (actor_email, message, created_at)
- oauth2_onix_users (id, email, first_name, last_name, country, registered_at, status)
- security_hub_dodrio_users (id, email, tier_level, document_verified, watchlist_verified)
- security_hub_dodrio_risk_level (user_id, risk_level, score, created_at)
- payments_kecleon_operations (id, airtm_user_id, amount, operation_type, status, created_at)
- analytics_compliance.fact_ar_issues (key, summary, current_status, alert_type, assignee, created_at, is_closed)
- analytics_compliance.stg_dodrio_persona_inquiries (inquiry_id, user_id, inquiry_status, country_code, created_at)

## TOOL: query_freshdesk(endpoint, params)
Use this to query Freshdesk API directly.
Example: query_freshdesk("/tickets", {"per_page": 100, "order_by": "created_at"})

## YOUR OPERATING STANDARDS
- Always query real data before answering quantitative questions
- Never make up numbers — if you don't have data, say so and query for it
- Cite your data source (ClickHouse table, Freshdesk API, etc)
- Format answers clearly for compliance leadership
- You are Zaid's intelligence layer — answer like a senior analyst

## AIRTM CONTEXT
- US MSB (FinCEN), Argentina VASP (UIF/CNV), India FIU-IND pending
- 918,286 total support tickets since 2019
- Compliance team: Fraud, KYC, TM analysts
- Key frameworks: BSA, OFAC, FATF, UIF`;

// ── Live tool execution ───────────────────────────────────────────
async function runTool(toolName, toolInput) {
  if (toolName === 'query_clickhouse') {
    const CH_HOST = process.env.CLICKHOUSE_HOST || 'https://data-lake.galar.data.airtm.com';
    const CH_USER = process.env.CLICKHOUSE_USER || 'ruben';
    const CH_PASS = process.env.CLICKHOUSE_PASSWORD;
    
    try {
      const resp = await axios.post(
        `${CH_HOST}/?default_format=JSONEachRow&max_execution_time=30`,
        toolInput.sql,
        { auth: { username: CH_USER, password: CH_PASS }, timeout: 35000 }
      );
      const raw = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
      const lines = raw.trim().split('\n').filter(Boolean);
      return lines.slice(0, 200).map(l => { try { return JSON.parse(l); } catch { return { _raw: l }; } });
    } catch (err) {
      return { error: err.response?.data || err.message };
    }
  }
  
  if (toolName === 'query_freshdesk') {
    const FD_BASE = process.env.FRESHDESK_BASE_URL || 'https://airtm.freshdesk.com/api/v2';
    const FD_KEY = process.env.FRESHDESK_KEY;
    try {
      const resp = await axios.get(`${FD_BASE}${toolInput.endpoint}`, {
        auth: { username: FD_KEY, password: 'X' },
        params: toolInput.params || {},
        timeout: 20000
      });
      return resp.data;
    } catch (err) {
      return { error: err.response?.data || err.message };
    }
  }
  
  return { error: `Unknown tool: ${toolName}` };
}

// ── Tool definitions for Claude ───────────────────────────────────
const TOOLS = [
  {
    name: 'query_clickhouse',
    description: 'Query Airtm ClickHouse data warehouse for live compliance, transaction, and support data.',
    input_schema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'SQL query to execute against ClickHouse' }
      },
      required: ['sql']
    }
  },
  {
    name: 'query_freshdesk',
    description: 'Query Freshdesk API for support ticket data.',
    input_schema: {
      type: 'object',
      properties: {
        endpoint: { type: 'string', description: 'API endpoint path e.g. /tickets' },
        params: { type: 'object', description: 'Query parameters' }
      },
      required: ['endpoint']
    }
  }
];

// ── POST /api/cke/ask — CKE intelligence bridge ──────────────────
router.post('/ask', async (req, res) => {
  const { question, conversationHistory = [] } = req.body;
  const userEmail = req.user?.email || 'unknown';
  const userName = req.user?.name || 'Unknown';
  const ts = new Date().toISOString();

  if (!question?.trim()) {
    return res.status(400).json({ error: 'question is required' });
  }

  // Log the question
  logAction({
    userEmail,
    action: 'CKE_BRIDGE_QUESTION',
    resourceId: null,
    details: {
      question: question.slice(0, 500),
      userName,
      timestamp: ts,
      model: MODEL
    }
  });

  // Stream response
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const messages = [
    ...conversationHistory.filter(m => m.role && m.content),
    { role: 'user', content: question }
  ];

  let fullResponse = '';
  let toolsUsed = [];

  try {
    // Agentic loop — Claude can call tools multiple times
    while (true) {
      const resp = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: CKE_SYSTEM_PROMPT,
        tools: TOOLS,
        messages
      });

      // Stream any text blocks
      for (const block of resp.content) {
        if (block.type === 'text') {
          fullResponse += block.text;
          res.write(`data: ${JSON.stringify({ text: block.text })}\n\n`);
        }
      }

      // If Claude is done, break
      if (resp.stop_reason === 'end_turn') {
        break;
      }

      // Handle tool use
      if (resp.stop_reason === 'tool_use') {
        const toolUseBlocks = resp.content.filter(b => b.type === 'tool_use');
        
        // Add assistant message with tool_use
        messages.push({ role: 'assistant', content: resp.content });
        
        // Execute tools and collect results
        const toolResults = [];
        for (const toolUse of toolUseBlocks) {
          res.write(`data: ${JSON.stringify({ tool: toolUse.name, status: 'running' })}\n\n`);
          const result = await runTool(toolUse.name, toolUse.input);
          toolsUsed.push({ name: toolUse.name, input: toolUse.input });
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result)
          });
          res.write(`data: ${JSON.stringify({ tool: toolUse.name, status: 'done', rows: Array.isArray(result) ? result.length : 1 })}\n\n`);
        }
        
        // Add tool results
        messages.push({ role: 'user', content: toolResults });
      }
    }

    // Log the response
    logAction({
      userEmail,
      action: 'CKE_BRIDGE_RESPONSE',
      resourceId: null,
      details: {
        question: question.slice(0, 200),
        responseLength: fullResponse.length,
        toolsUsed: toolsUsed.map(t => t.name),
        model: MODEL
      }
    });

    res.write(`data: ${JSON.stringify({ done: true, toolsUsed: toolsUsed.map(t => t.name) })}\n\n`);
    res.end();

  } catch (err) {
    console.error('[CKE Bridge] Error:', err.message);
    logAction({
      userEmail,
      action: 'CKE_BRIDGE_ERROR',
      details: { error: err.message, question: question.slice(0, 200) }
    });
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

// ── GET /api/cke/log — CKE question log (LEADERSHIP only) ────────
router.get('/log', async (req, res) => {
  if (req.user?.role !== 'LEADERSHIP') {
    return res.status(403).json({ error: 'Leadership only' });
  }
  try {
    const { getDb } = require('../lib/audit');
    // Reuse audit DB
    const Database = require('better-sqlite3');
    const path = require('path');
    const db = new Database(path.join(__dirname, '..', 'audit.db'));
    
    const rows = db.prepare(`
      SELECT timestamp, user_email, action, details
      FROM audit_log
      WHERE action IN ('CKE_BRIDGE_QUESTION', 'CKE_BRIDGE_RESPONSE', 'CKE_BRIDGE_ERROR')
      ORDER BY timestamp DESC
      LIMIT 100
    `).all();
    
    res.json({ log: rows });
  } catch (err) {
    res.json({ log: [], error: err.message });
  }
});

module.exports = router;
