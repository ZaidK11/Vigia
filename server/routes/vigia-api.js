// ============================================================
// VIGÍA BSA DECISION ENGINE — BUILD HEADER
// ============================================================
// Tool Name:        VIGÍA Portal — Claude API Integration
// Build Date:       2026-05-14
// Authorized by:    Zaid Khan (U087TL6CGNM)
// POLICY COMPLIANCE: POL-BSA-001-v4.2
// EWRA RISK MITIGATION: Risk ID(s): EWRA-01, EWRA-20 | Residual: LOW
// ============================================================

const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const { logAction } = require('../lib/audit');
const { PiiGuard } = require('../lib/pii-guard/index');

// ── PII Guard — strips PII + proprietary identifiers before Claude sees them ──
const piiGuard = new PiiGuard({
  terms: [
    // Company
    'Airtm',
    // Partners & vendors
    'Bridges', 'Elliptic', 'Kount', 'Persona',
    // Internal systems
    'Dodrio', 'Galar', 'Onix',
  ],
  // Disable DOB — compliance prompts contain date ranges we need preserved
  disableBuiltins: ['dob'],
});

// Explicitly set apiKey so SDK never tries to read env or incoming headers
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
if (!CLAUDE_API_KEY) {
  console.error('[VIGÍA API] CLAUDE_API_KEY not set!');
}
const client = new Anthropic({ apiKey: CLAUDE_API_KEY });
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5';

// ── System prompts — role-based ──────────────────────────────────

// SUPPORT FORMAT: simple, conversational, no jargon, no markdown
const SUPPORT_SYSTEM_PROMPT = `You are VIGÍA, an AI assistant embedded in Airtm's customer support portal.

Your job: help support agents understand what's going on with a customer account and what to do next.

IMPORTANT RULES:
- Write like you're talking to a colleague who has no compliance background
- NO markdown formatting (no **, no ##, no bullet points with *)
- NO policy references (don't mention POL-BSA-001, CDD, OFAC, BSA, FinCEN, etc)
- NO jargon (say "missing risk level" not "data integrity gap", say "flag this" not "escalate per PRO-TM-003")
- Keep it SHORT — under 200 words total
- Be direct and action-oriented

STEP 1 — DETECT SPECIAL REQUESTS:
Before writing anything, check: is this a SPECIAL request? Special requests include:
- Cashier account application
- Business / merchant account request
- High-value transaction approval
- Becoming a P2P agent or liquidity provider
- Account recovery after ban/suspension (requires compliance review)
- Sanctions or fraud investigation-related questions
- Any request that's NOT a standard support question

If this IS a special request:
- Do NOT write a response template
- Use this format instead:

RISK LEVEL: High

ISSUE: [What the customer is asking for, in one sentence]

WHAT THIS MEANS: This is a special request that requires review by the compliance or operations team. Support agents cannot approve or process this directly.

WHAT TO DO:
1. Do NOT send a standard reply
2. Click ESCALATE to route this to the right team
3. If needed, send a brief holding message: "Thanks for reaching out! This request requires a review by our team. We'll follow up within 24 hours."

If this is NOT a special request (it's a routine support question), use this format:

RISK LEVEL: [Low / Medium / High / Critical]

ISSUE: [One sentence saying what the problem is]

WHAT THIS MEANS: [2-3 sentences in plain English, like explaining to a friend]

WHAT TO DO:
1. [First action — specific and clear]
2. [Second action]
3. [Third action if needed]

IMPORTANT: Make the response sound human and specific to THIS ticket. Do not write a generic template. Reference what the customer actually asked about.

Be conversational. The agent needs to act quickly.`;

// COMPLIANCE FORMAT: detailed, structured, policy refs OK, markdown OK
const COMPLIANCE_SYSTEM_PROMPT = `You are VIGÍA — the Compliance Kinetic Extension (CKE) for Airtm, a licensed fintech operating as a US MSB (FinCEN), Argentina VASP (UIF/CNV), and pending India FIU-IND registrant.

You are the analytical engine embedded in the VIGÍA Compliance Portal. Compliance analysts submit cases directly to you. You analyze and respond.

## Your operating standards:

**Output format — always follow this structure:**
1. **Status** — one-line verdict (CLEAN / MEDIUM RISK / HIGH RISK / CRITICAL)
2. **What happened** — plain language summary of the case (2-3 sentences max)
3. **Key findings** — bullet list of red flags and green flags
4. **Recommendation** — single clear action (APPROVE / REJECT / ESCALATE / MONITOR / FILE SAR / REQUEST DOCS)
5. **Next step** — one sentence, one owner, one action

**Rules:**
- No table names, no SQL, no technical connector details in your response
- Translate everything to plain language a senior compliance analyst would write
- Every response must be defensible under BSA, FinCEN, OFAC, and UIF requirements
- If a sanctions match exists → hard stop, escalate immediately
- 3-hour investigation clock applies to all TM alerts — always note clock status
- EWRA-20 (TM) is always HIGH residual until PRO-TM-003 closes (Q3 2026)

**Policy hierarchy:** POL-BSA-001-v4.2 governs. Level 2 beats Level 4 always.

**The Four Ground Truths:**
1. Every TM alert must move within 3 hours — Limited, Monitoring, or closure
2. Airtm does NOT run transaction-time OFAC screening (compensating controls in place)
3. CDD cadence: High=12mo, Medium=18mo, Low=24mo (POL-BSA-001 governs, not PRO-KYC-001)
4. Hard Split: Individual (KYC/##A) and Business (KYB/##B) are never merged

Be decisive. Be concise. Be defensible.`;

// Select system prompt based on portal type
function getSystemPrompt(portalType, language) {
  const isSupport = portalType === 'support';
  let prompt = isSupport ? SUPPORT_SYSTEM_PROMPT : COMPLIANCE_SYSTEM_PROMPT;
  if (language === 'es') {
    prompt += isSupport
      ? '\n\nIMPORTANT: Provide your entire response in Spanish (Español). Same format, same rules, but in Spanish.'
      : '\n\nIMPORTANT: Provide your entire response in Spanish (Español). Keep all formatting but write in Spanish.';
  }
  return prompt;
}

// POST /api/vigia/analyze
router.post('/analyze', async (req, res) => {
  const { command, portalType, resourceId, context, language } = req.body;

  if (!command) {
    return res.status(400).json({ error: 'command is required' });
  }

  const startTime = Date.now();
  const systemPrompt = getSystemPrompt(portalType, language);
  const maxTokens = portalType === 'support' ? 512 : 1024; // shorter for support

  try {
    // Stream the response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Redact PII + proprietary terms before sending to Claude
    const { redacted: redactedCommand, restore } = piiGuard.redact(command);

    const stream = await client.messages.stream({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: redactedCommand }]
    });

    let fullResponse = '';

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
        const text = chunk.delta.text;
        fullResponse += text;
        res.write(`data: ${JSON.stringify({ text: restore(text) })}\n\n`);
      }
    }

    // Restore any remaining tokens in full response
    fullResponse = restore(fullResponse);

    const elapsed = Date.now() - startTime;

    // Log to audit trail
    logAction({
      userEmail: req.user?.email || 'unknown',
      action: `VIGIA_ANALYZE_${(portalType || 'UNKNOWN').toUpperCase()}`,
      resourceId: resourceId || null,
      details: {
        commandLength: command.length,
        responseLength: fullResponse.length,
        elapsedMs: elapsed,
        model: MODEL
      }
    });

    res.write(`data: ${JSON.stringify({ done: true, elapsed })}\n\n`);
    res.end();

  } catch (err) {
    console.error('[VIGÍA API] Error:', err.message);

    if (!res.headersSent) {
      res.status(500).json({ error: 'VIGÍA analysis failed', details: err.message });
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

// POST /api/vigia/analyze-sync (non-streaming, for simpler clients)
router.post('/analyze-sync', async (req, res) => {
  const { command, portalType, resourceId, language } = req.body;

  if (!command) return res.status(400).json({ error: 'command is required' });

  const systemPrompt = getSystemPrompt(portalType, language);

  try {
    // Redact PII + proprietary terms before sending to Claude
    const { redacted: redactedCommand, restore } = piiGuard.redact(command);

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: portalType === 'support' ? 512 : 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: redactedCommand }]
    });

    const response = restore(message.content[0]?.text || '');

    logAction({
      userEmail: req.user?.email || 'unknown',
      action: `VIGIA_ANALYZE_SYNC_${(portalType || 'UNKNOWN').toUpperCase()}`,
      resourceId: resourceId || null,
      details: { responseLength: response.length, model: MODEL }
    });

    res.json({ response, model: MODEL, usage: message.usage });

  } catch (err) {
    console.error('[VIGÍA API] Sync error:', err.message);
    res.status(500).json({ error: 'VIGÍA analysis failed', details: err.message });
  }
});

// POST /api/vigia/chat — Leadership open chat with conversation history
router.post('/chat', async (req, res) => {
  if (req.user?.role !== 'LEADERSHIP') {
    return res.status(403).json({ error: 'Leadership only' });
  }
  const { messages } = req.body;
  if (!messages?.length) return res.status(400).json({ error: 'messages required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    // Redact user messages only (assistant messages are already clean)
    const restoreFns = [];
    const safeMessages = messages
      .filter(m => m.role && m.content)
      .map(m => {
        if (m.role === 'user') {
          const { redacted, restore } = piiGuard.redact(m.content);
          restoreFns.push(restore);
          return { role: m.role, content: redacted };
        }
        return { role: m.role, content: m.content };
      });
    const restoreAll = (text) => restoreFns.reduce((t, fn) => fn(t), text);

    const stream = await client.messages.stream({
      model: MODEL,
      max_tokens: 2048,
      system: COMPLIANCE_SYSTEM_PROMPT,
      messages: safeMessages,
    });

    let fullText = '';
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
        const text = restoreAll(chunk.delta.text);
        fullText += text;
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

    logAction({
      userEmail: req.user.email,
      action: 'LEADERSHIP_CHAT',
      details: { messageCount: messages.length, responseLength: fullText.length, model: MODEL }
    });

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    console.error('[VIGÍA Chat]', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

module.exports = router;
