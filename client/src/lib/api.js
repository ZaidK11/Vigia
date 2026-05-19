const getToken = () => localStorage.getItem('vigia_token');
const authHdr = () => ({
  Authorization: `Bearer ${getToken()}`,
  'Content-Type': 'application/json'
});

async function req(path, opts = {}) {
  const res = await fetch(path, { headers: authHdr(), ...opts });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function* streamSSE(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: authHdr(),
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try { yield JSON.parse(line.slice(6)); } catch {}
    }
  }
}

export const api = {
  auth: {
    login: (email) => req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email }) }),
    me: () => req('/api/auth/me')
  },

  support: {
    search: (query, commandType = 'account') =>
      req('/api/support/search', { method: 'POST', body: JSON.stringify({ query, commandType }) })
  },

  fraud: {
    cases: () => req('/api/fraud/cases'),
    case: (id) => req(`/api/fraud/case/${id}`),
    decision: (caseId, decision, notes) =>
      req('/api/fraud/decision', { method: 'POST', body: JSON.stringify({ caseId, decision, notes }) })
  },

  kyc: {
    applications: () => req('/api/kyc/applications'),
    application: (id) => req(`/api/kyc/application/${id}`),
    decision: (applicationId, decision, notes) =>
      req('/api/kyc/decision', { method: 'POST', body: JSON.stringify({ applicationId, decision, notes }) })
  },

  tm: {
    alerts: () => req('/api/tm/alerts'),
    alert: (id) => req(`/api/tm/alert/${id}`),
    decision: (alertId, decision, sarNarrative, notes) =>
      req('/api/tm/decision', { method: 'POST', body: JSON.stringify({ alertId, decision, sarNarrative, notes }) })
  },

  leadership: {
    stats: () => req('/api/leadership/stats')
  },

  dashboard: {
    get: () => req('/api/dashboard'),
    refresh: () => req('/api/dashboard/refresh', { method: 'POST', body: '{}' })
  },

  // Raw helpers for Dashboard component
  get: (path) => req(path),
  post: (path, body) => req(path, { method: 'POST', body: JSON.stringify(body) }),

  audit: {
    log: (action, resourceId, decision, details) =>
      req('/api/audit/log', { method: 'POST', body: JSON.stringify({ action, resourceId, decision, details }) }),
    recent: (limit = 20, me = false) =>
      req(`/api/audit/log?limit=${limit}&me=${me}`)
  },

  vigia: {
    analyzeStream: (command, portalType, resourceId, language) =>
      streamSSE('/api/vigia/analyze', { command, portalType, resourceId, language }),
    chatStream: (messages) =>
      streamSSE('/api/vigia/chat', { messages })
  }
};
