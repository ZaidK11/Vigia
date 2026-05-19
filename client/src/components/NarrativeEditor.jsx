import React, { useState } from 'react';
import { api } from '../lib/api.js';

const FRAUD_DECISIONS = ['APPROVE — No Action', 'MONITOR — Watch Account', 'ESCALATE — Restrict Account', 'SAR REQUIRED — File with FinCEN'];
const TM_DECISIONS = ['CLOSE — No Action', 'MONITOR — No SAR', 'FILE SAR'];

export default function NarrativeEditor({ mode = 'fraud', patternText = '', resourceId, onSubmit }) {
  const [sections, setSections] = useState({
    pattern: patternText,
    customerNarrative: '',
    assessment: '',
    conclusion: ''
  });
  const [decision, setDecision] = useState('');
  const [genLoading, setGenLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const decisions = mode === 'tm' ? TM_DECISIONS : FRAUD_DECISIONS;

  const generateAssessment = async () => {
    setGenLoading(true);
    const command = `As a compliance analyst, write an investigator assessment for this case.

Pattern: ${sections.pattern}
Customer narrative: ${sections.customerNarrative || 'Not provided'}

Assessment should cover (3-4 sentences):
1. Whether the customer's explanation is credible given the evidence
2. Key risk indicators present
3. Overall risk conclusion

Write professionally, in third person, as it would appear in a compliance case file.`;

    try {
      let full = '';
      for await (const chunk of api.vigia.analyzeStream(command, mode, resourceId)) {
        if (chunk.text) { full += chunk.text; setSections(s => ({ ...s, assessment: full })); }
        if (chunk.done || chunk.error) break;
      }
    } catch {}
    setGenLoading(false);
  };

  const handleSubmit = async () => {
    if (!decision) return;
    setSubmitLoading(true);
    try {
      await api.audit.log(`${mode.toUpperCase()}_NARRATIVE_SUBMITTED`, resourceId, decision, { sections, mode });
      if (onSubmit) onSubmit({ sections, decision });
      setSubmitted(true);
    } catch {}
    setSubmitLoading(false);
  };

  if (submitted) {
    return (
      <div className="card border-emerald-200 bg-emerald-50 text-center py-8">
        <p className="text-emerald-600 font-semibold mb-1">Narrative submitted</p>
        <p className="text-gray-500 text-sm">Decision: <strong>{decision}</strong></p>
        <p className="text-gray-400 text-xs mt-1">Logged to audit trail</p>
      </div>
    );
  }

  const Section = ({ num, title, tag, children }) => (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-gray-200 text-gray-600 text-[10px] flex items-center justify-center font-bold">{num}</span>
          <span className="text-sm font-semibold text-gray-700">{title}</span>
        </div>
        {tag && <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{tag}</span>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-bold text-gray-800">
          {mode === 'tm' ? 'SAR Narrative' : 'Investigation Narrative'}
        </p>
        {resourceId && <span className="badge-gray">{resourceId}</span>}
      </div>

      <Section num="1" title="Pattern Description" tag="Auto-filled">
        <textarea className="textarea min-h-[80px] text-xs" value={sections.pattern}
          onChange={e => setSections(s => ({ ...s, pattern: e.target.value }))}
          placeholder="Transaction pattern description..." />
      </Section>

      <Section num="2" title="Customer Narrative" tag="Analyst enters">
        <textarea className="textarea min-h-[70px] text-xs" value={sections.customerNarrative}
          onChange={e => setSections(s => ({ ...s, customerNarrative: e.target.value }))}
          placeholder="What did the customer explain?" />
      </Section>

      <Section num="3" title="Investigator Assessment" tag={
        <button onClick={generateAssessment} disabled={genLoading}
          className="btn-teal btn-sm text-xs">
          {genLoading ? 'Generating...' : 'Generate with VIGÍA'}
        </button>
      }>
        <textarea className="textarea min-h-[90px] text-xs" value={sections.assessment}
          onChange={e => setSections(s => ({ ...s, assessment: e.target.value }))}
          placeholder="Click 'Generate with VIGÍA' or enter manually..." />
      </Section>

      <Section num="4" title="Conclusion & Decision">
        <textarea className="textarea min-h-[60px] text-xs mb-3" value={sections.conclusion}
          onChange={e => setSections(s => ({ ...s, conclusion: e.target.value }))}
          placeholder="Final conclusion..." />
        <div className="grid grid-cols-2 gap-2">
          {decisions.map(d => (
            <button key={d} onClick={() => setDecision(d)}
              className={`text-left p-2.5 rounded-lg border text-xs font-medium transition-all ${
                decision === d
                  ? 'border-[#00C9A7] bg-[#00C9A7]/10 text-[#00b396]'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              }`}>
              {d}
            </button>
          ))}
        </div>
      </Section>

      <button onClick={handleSubmit} disabled={!decision || submitLoading}
        className="btn-teal w-full justify-center py-2.5">
        {submitLoading ? 'Submitting...' : 'Submit to Audit Trail'}
      </button>
    </div>
  );
}
