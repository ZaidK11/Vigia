/**
 * pii-guard — Airtm singleton
 *
 * Single shared PiiGuard instance with the Airtm-specific config.
 * All routes requiring Claude calls should import this module.
 *
 * Per-request usage:
 *   const session = airtmGuard.session();
 *   const redactedText   = session.redact(text);
 *   const redactedObject = session.redactObject(clickhouseRows);
 *   const restored       = session.restore(llmOutput);        // user-facing
 *   const suppressed     = llmOutput;                         // analytical mode (no restore)
 *
 * The session keeps a shared token map for the entire request lifetime,
 * so the same raw value always maps to the same token — across the question,
 * conversation history, tool results, and the final response.
 */

'use strict';

const { PiiGuard } = require('./pii-guard/src/sdk/index');

const airtmGuard = new PiiGuard({
  template: 'enterprise',
  custom_rules: [
    // ── Airtm identifiers ─────────────────────────────────────────────────────
    // Device fingerprints (hex 32–64 chars) from data_lake.oauth2_onix_users
    { name: 'device_fingerprint', source: '[a-fA-F0-9]{32,64}', label: 'DEVICE_FP' },
    // Crypto wallet addresses — Elliptic / operations_silvally surface
    { name: 'btc_address', source: '(?:1|3)[a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-z0-9]{39,59}', label: 'WALLET' },
    { name: 'eth_address', source: '0x[a-fA-F0-9]{40}', label: 'WALLET' },
    { name: 'wallet_hex',  source: '[a-fA-F0-9]{40,64}', label: 'WALLET' },
    // ── Company, partners, internal systems ───────────────────────────────────
    { pattern: 'Airtm',   label: 'COMPANY'  },
    { pattern: 'Bridges', label: 'PARTNER'  },
    { pattern: 'Elliptic',label: 'PARTNER'  },
    { pattern: 'Kount',   label: 'PARTNER'  },
    { pattern: 'Persona', label: 'PARTNER'  },
    { pattern: '(Dodrio|Galar|Onix|Kecleon|Silvally)', label: 'INTERNAL' },
    // ── Regulatory passthrough — Claude needs these for compliance reasoning ──
    { name: 'keep_regulatory',
      pattern: '(OFAC|FinCEN|SAR|AML|KYC|KYB|BSA|UIF|CTR|FATF|PEP|STR)',
      redact: false },
  ],
  // dob: compliance prompts include date ranges ("last 90 days") — don't strip them.
  // us_zip: not relevant to Airtm's LATAM user base.
  disable_builtins: ['dob', 'us_zip'],
});

module.exports = airtmGuard;
