'use strict';

/**
 * pii-guard SDK — in-process library mode.
 *
 * Use this when you want to embed pii-guard directly in your Node.js app
 * without running a separate proxy server.
 *
 * Usage:
 *   const { PiiGuard } = require('pii-guard');
 *   const guard = new PiiGuard({ template: 'enterprise', terms: ['Acme'] });
 *
 *   // Single redact
 *   const { redacted, restore } = guard.redact('Call john@acme.com');
 *   const response = await claude.messages.create({ messages: [{ role: 'user', content: redacted }] });
 *   console.log(restore(response.content[0].text));
 *
 *   // Multi-message session (keeps token map consistent across turns)
 *   const session = guard.session();
 *   const r1 = session.redact(msg1);
 *   const r2 = session.redact(msg2);
 *   // ... call LLM ...
 *   const out = session.restore(llmResponse);
 *
 *   // Streaming
 *   const sr = guard.streamRestorer();
 *   for (const chunk of stream) {
 *     process.stdout.write(sr.push(chunk));
 *   }
 *   process.stdout.write(sr.flush());
 */

const { loadConfig, buildConfig } = require('../config/loader');
const { buildRules, redact: coreRedact, restore: coreRestore, createSession } = require('../core/redactor');
const { StreamRestorer } = require('../core/stream-restorer');
const { TEMPLATES } = require('../config/templates');

class PiiGuard {
  /**
   * @param {Object|string} options - Config object or path to YAML file
   * @param {string}   [options.template]          - Template name (default: 'personal')
   * @param {string[]} [options.terms]             - Custom term strings to redact
   * @param {Object[]} [options.custom_rules]      - Custom rule objects ({ pattern, label, redact })
   * @param {string[]} [options.disable_builtins]  - Built-in pattern names to disable
   */
  constructor(options = {}) {
    if (typeof options === 'string') {
      this._config = loadConfig(options);
    } else {
      // Normalise: accept both `terms` (shorthand) and `custom_rules`
      const customRules = [];
      if (options.terms?.length) {
        for (const term of options.terms) {
          customRules.push({ pattern: term, label: 'TERM' });
        }
      }
      if (options.custom_rules?.length) {
        customRules.push(...options.custom_rules);
      }
      this._config = buildConfig({
        template: options.template || 'personal',
        custom_rules: customRules,
        disable_builtins: options.disable_builtins || [],
        ...options,
      });
    }
    this._rules = buildRules(this._config);
  }

  /**
   * Redact a single string.
   * @param {string} text
   * @returns {{ redacted: string, restore: (text: string) => string, map: Map }}
   */
  redact(text) {
    const session = createSession();
    const { redacted } = coreRedact(text, this._rules, session);
    return {
      redacted,
      restore: (t) => coreRestore(t, session),
      map: session.tokenToValue,
    };
  }

  /**
   * Create a multi-message session with shared token map.
   * Use for multi-turn conversations.
   */
  session() {
    return new GuardSession(this._rules);
  }

  /**
   * Create a streaming restorer for use with SSE/streaming LLM responses.
   * Must be paired with a session whose token map is already populated.
   */
  streamRestorer(session) {
    return new StreamRestorer(session);
  }

  /**
   * Recursively redact all string values in a JSON object/array.
   * Keys are preserved. Useful for ClickHouse result rows, API payloads, tool results.
   * Returns a shared session so you can restore the object (or a derived string) later.
   *
   * Field-name rules: if a key matches a sensitive-field pattern (e.g. *_gid, *_id,
   * client_*, account_*), its value is redacted unconditionally — regardless of whether
   * the value matches a regex pattern. This catches non-UUID numeric IDs, aliases from
   * JOIN results, and any non-standard identifier formats.
   *
   * @param {any}    obj               - Object, array, or any value to deep-redact
   * @param {Object} [opts]
   * @param {Object} [opts.fieldRules]  - Additional { keyPattern: RegExp, label: string }[]
   * @returns {{ redacted: any, restore: (any) => any, session: GuardSession }}
   *
   * Examples:
   *   // Basic
   *   const { redacted, restore } = guard.redactObject(clickhouseRow);
   *
   *   // With extra field rules
   *   const { redacted, session } = guard.redactObject(row, {
   *     fieldRules: [{ keyPattern: /^acc_/, label: 'ACCT_ID' }]
   *   });
   *   const prompt = session.redact(`Analyse this: ${JSON.stringify(redacted)}`);
   */
  redactObject(obj, opts = {}) {
    const s = this.session();
    const fieldRules = [...AIRTM_FIELD_RULES, ...(opts.fieldRules || [])];
    const redacted = _deepRedact(obj, s, fieldRules);
    return {
      redacted,
      session: s,
      restore: (o) => _deepRestore(o, s),
    };
  }

  /**
   * Dry run — inspect what would be redacted.
   * @param {string} text
   * @returns {{ redacted: string, tokens: Object, count: number }}
   */
  dryRun(text) {
    const { redacted, map } = this.redact(text);
    return { redacted, tokens: Object.fromEntries(map), count: map.size };
  }

  get template() { return this._config.template; }
  get ruleCount() { return this._rules.length; }
}

// ── Field-name rules: redact by key regardless of value format ─────────────
// Catches non-UUID numeric IDs, JOIN aliases, non-standard identifiers.
// Any value whose key matches one of these patterns is force-redacted.
const AIRTM_FIELD_RULES = [
  // *_gid, *_id, id (exact), airtm_user_id, etc.
  { keyPattern: /(?:^|_)(?:gid|id)$/i,          label: 'ID'      },
  // client_*, account_*, user_*, inquiry_*
  { keyPattern: /^(?:client|account|user|inquiry|member)_/i, label: 'ID' },
  // *_gid variants (account_gid, client_gid, …)
  { keyPattern: /_gid$/i,                        label: 'ID'      },
  // email fields
  { keyPattern: /^email$/i,                      label: 'EMAIL'   },
  // name fields: first_name, last_name, full_name, name
  { keyPattern: /(?:^|_)(?:first|last|full)?_?name$/i, label: 'NAME' },
  // birthdate / dob
  { keyPattern: /^(?:birthdate|dob|date_of_birth)$/i,  label: 'DOB'  },
  // wallet / address
  { keyPattern: /^(?:wallet|address|crypto_address)$/i, label: 'WALLET' },
  // ip address
  { keyPattern: /^ip(?:_address)?$/i,            label: 'IP'     },
  // device fingerprint
  { keyPattern: /^(?:device_)?fingerprint$/i,    label: 'DEVICE_FP' },
  // phone
  { keyPattern: /^(?:phone|mobile|telephone)(?:_number)?$/i, label: 'PHONE' },
];

// ── Deep object helpers (used by redactObject) ─────────────────────────────

function _deepRedact(obj, session, fieldRules = []) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return session.redact(obj);
  if (Array.isArray(obj)) return obj.map(item => _deepRedact(item, session, fieldRules));
  if (typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      // Check if key itself signals a sensitive field
      const matchedRule = fieldRules.find(r => r.keyPattern.test(k));
      if (matchedRule && typeof v === 'string' && v.length > 0) {
        // Force-redact: assign a token even if value doesn't match any regex
        out[k] = session.redact(v) !== v
          ? session.redact(v)  // already caught by a pattern — use existing token
          : _forceToken(v, matchedRule.label, session);
      } else {
        out[k] = _deepRedact(v, session, fieldRules);
      }
    }
    return out;
  }
  // numbers, booleans, etc — not PII, pass through
  return obj;
}

/** Assign a token to a value unconditionally (bypasses pattern matching). */
function _forceToken(value, label, session) {
  // Reuse existing token if this value has been seen before
  if (session._session.valueToToken.has(value)) {
    return session._session.valueToToken.get(value);
  }
  session._session.counters[label] = (session._session.counters[label] || 0) + 1;
  const token = `[PII_GUARD:${label}:${session._session.counters[label]}]`;
  session._session.valueToToken.set(value, token);
  session._session.tokenToValue.set(token, value);
  return token;
}

function _deepRestore(obj, session) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return session.restore(obj);
  if (Array.isArray(obj)) return obj.map(item => _deepRestore(item, session));
  if (typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = _deepRestore(v, session);
    }
    return out;
  }
  return obj;
}

/**
 * Multi-message session.
 */
class GuardSession {
  constructor(rules) {
    this._rules = rules;
    this._session = createSession();
  }

  redact(text) {
    const { redacted } = coreRedact(text, this._rules, this._session);
    return redacted;
  }

  restore(text) {
    return coreRestore(text, this._session);
  }

  /** Deep-redact an object/array, reusing this session's token map. */
  redactObject(obj, opts = {}) {
    const fieldRules = [...AIRTM_FIELD_RULES, ...(opts.fieldRules || [])];
    return _deepRedact(obj, this, fieldRules);
  }

  /** Deep-restore an object/array using this session's token map. */
  restoreObject(obj) { return _deepRestore(obj, this); }

  streamRestorer() {
    return new StreamRestorer(this._session);
  }

  get tokenCount() { return this._session.tokenToValue.size; }
}

module.exports = {
  PiiGuard,
  GuardSession,
  StreamRestorer,
  TEMPLATES,
  // Shorthand
  createGuard: (opts) => new PiiGuard(opts),
  redact: (text, opts) => new PiiGuard(opts).redact(text),
};
