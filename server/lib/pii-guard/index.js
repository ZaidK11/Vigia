/**
 * pii-guard
 * Zero-dependency PII redaction middleware for LLM pipelines.
 *
 * Flow:
 *   guard.redact(text) → { redacted, restore, map }
 *   restore(redactedText) → original text with tokens replaced back
 *
 * What it scrubs:
 *   - Email addresses
 *   - Phone numbers (US + international)
 *   - IPv4 addresses
 *   - Credit card numbers
 *   - SSNs / Tax IDs (US format)
 *   - Dates of birth
 *   - UUIDs
 *   - Custom terms (company names, partner names, internal identifiers)
 *   - Custom regex patterns
 *
 * Strategy: single-pass positional scan — all patterns run simultaneously,
 * longest non-overlapping match wins, left-to-right. This prevents patterns
 * from eating each other's matches.
 */

'use strict';

// ── Built-in pattern library ────────────────────────────────────────────────
// Order here only affects label assignment, not match priority (that's positional).

const BUILT_IN_PATTERNS = [
  {
    name: 'email',
    // Must come early — email contains @, so very specific
    pattern: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    label: 'EMAIL',
  },
  {
    name: 'uuid',
    pattern: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    label: 'UUID',
  },
  {
    name: 'creditCard',
    // Visa, MC, Amex, Discover
    pattern: /\b(?:4\d{3}|5[1-5]\d{2}|6011|3[47]\d{2})[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}(?:[-\s]?\d{3})?\b/g,
    label: 'CARD',
  },
  {
    name: 'ssn',
    pattern: /\b(?!000|666|9\d{2})\d{3}[-\s](?!00)\d{2}[-\s](?!0000)\d{4}\b/g,
    label: 'SSN',
  },
  {
    name: 'phone',
    // Require separator or explicit country code to avoid digit-soup false positives
    pattern: /(?:\+?1[-.\s])?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}(?:\s?(?:x|ext)\.?\s?\d{1,5})?/g,
    label: 'PHONE',
  },
  {
    name: 'ipv4',
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    label: 'IP_ADDR',
  },
  {
    name: 'dob',
    pattern: /\b(?:\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{2}[\/\-]\d{2}|\d{1,2}[-\s](?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-\s]\d{2,4})\b/gi,
    label: 'DOB',
  },
];

// ── Core class ──────────────────────────────────────────────────────────────

class PiiGuard {
  /**
   * @param {Object} options
   * @param {string[]} [options.terms]           - Custom terms to redact (whole-word, case-insensitive)
   * @param {Array}    [options.patterns]        - Extra patterns: { pattern: RegExp, label: string }
   * @param {string[]} [options.disableBuiltins] - Disable built-in patterns by name (e.g. ['dob','uuid'])
   * @param {string}   [options.placeholder]     - Token format. Default: '[REDACTED_{label}_{n}]'
   */
  constructor(options = {}) {
    this.terms = options.terms || [];
    this.extraPatterns = options.patterns || [];
    this.disabled = new Set(options.disableBuiltins || []);
    this.placeholder = options.placeholder || '[REDACTED_{label}_{n}]';
  }

  /**
   * Redact PII from text using single-pass positional scan.
   * Returns { redacted, restore, map }
   */
  redact(text) {
    if (typeof text !== 'string') return { redacted: text, restore: (t) => t, map: new Map() };

    // Build all pattern sources to scan
    const sources = [];

    // Custom terms (whole-word, case-insensitive)
    for (const term of this.terms) {
      if (!term) continue;
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      sources.push({ pattern: new RegExp(`\\b${escaped}\\b`, 'gi'), label: 'TERM' });
    }

    // Built-in patterns
    for (const def of BUILT_IN_PATTERNS) {
      if (this.disabled.has(def.name)) continue;
      sources.push({ pattern: new RegExp(def.pattern.source, def.pattern.flags), label: def.label });
    }

    // Extra patterns
    for (const def of this.extraPatterns) {
      sources.push({ pattern: new RegExp(def.pattern.source, def.pattern.flags), label: def.label || 'CUSTOM' });
    }

    // Collect all matches with positions
    const allMatches = [];
    for (const { pattern, label } of sources) {
      let m;
      while ((m = pattern.exec(text)) !== null) {
        allMatches.push({ start: m.index, end: m.index + m[0].length, value: m[0], label });
      }
    }

    // Sort by start position; on tie, prefer longer match
    allMatches.sort((a, b) => a.start - b.start || b.end - a.end);

    // Filter overlapping matches (greedy left-to-right, longest wins at each position)
    const selected = [];
    let cursor = 0;
    for (const match of allMatches) {
      if (match.start >= cursor) {
        selected.push(match);
        cursor = match.end;
      }
    }

    // Build value→token map (same value always gets the same token)
    const valueToToken = new Map(); // original value → token
    const map = new Map();         // token → original value (for restore)
    const counters = {};

    for (const match of selected) {
      if (!valueToToken.has(match.value)) {
        counters[match.label] = (counters[match.label] || 0) + 1;
        const token = this.placeholder
          .replace('{label}', match.label)
          .replace('{n}', counters[match.label]);
        valueToToken.set(match.value, token);
        map.set(token, match.value);
      }
    }

    // Build redacted string from right to left to preserve indices
    let result = text;
    for (let i = selected.length - 1; i >= 0; i--) {
      const { start, end, value } = selected[i];
      const token = valueToToken.get(value);
      result = result.slice(0, start) + token + result.slice(end);
    }

    const restore = (redactedText) => this._restore(redactedText, map);
    return { redacted: result, restore, map };
  }

  /**
   * Restore redacted tokens using the map from redact().
   */
  _restore(text, map) {
    if (typeof text !== 'string') return text;
    let result = text;
    for (const [token, original] of map.entries()) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(escaped, 'g'), original);
    }
    return result;
  }

  /**
   * Dry run — shows what would be redacted without modifying anything.
   */
  dryRun(text) {
    const { redacted, map } = this.redact(text);
    return {
      redacted,
      tokens: Object.fromEntries(map),
      count: map.size,
    };
  }
}

// ── Convenience exports ─────────────────────────────────────────────────────

function createGuard(options = {}) {
  return new PiiGuard(options);
}

function redact(text, options = {}) {
  return new PiiGuard(options).redact(text);
}

module.exports = { PiiGuard, createGuard, redact };
