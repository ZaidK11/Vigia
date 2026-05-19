import React, { useState, useContext } from 'react';
import { AuthContext } from '../App';
import './SearchWidget.css';

const SearchWidget = ({ protocolId, onVerdictReceived }) => {
  const { user, token } = useContext(AuthContext);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [feedbackGiven, setFeedbackGiven] = useState(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setFeedbackGiven(null);

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          protocolId,
          query: query.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }

      const data = await response.json();
      setResult(data);
      if (onVerdictReceived) onVerdictReceived(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFeedback = async (thumbsUp) => {
    if (!result || feedbackGiven) return;

    try {
      await fetch('/api/feedback/log-verdict', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          search_type: protocolId,
          user_id: result.user_id,
          verdict_given: result.verdict.verdict,
          verdict_chosen: null, // Will be filled if agent overrides
          agreement: thumbsUp ? 'thumbs_up' : 'thumbs_down',
          agent_note: null,
          timestamp: new Date().toISOString(),
        }),
      });

      setFeedbackGiven(thumbsUp ? 'up' : 'down');
    } catch (err) {
      console.error('Feedback submission failed:', err);
    }
  };

  return (
    <div className="search-widget">
      <form onSubmit={handleSearch} className="search-form">
        <div className="search-input-group">
          <input
            type="text"
            placeholder="Enter email or UUID"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={loading}
            className="search-input"
          />
          <button type="submit" disabled={loading} className="search-button">
            {loading ? '⏳ Searching...' : '🔍 Search'}
          </button>
        </div>
      </form>

      {error && (
        <div className="alert alert-error">
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div className="search-result">
          {/* User Info */}
          <div className="result-section user-info">
            <h3>User Information</h3>
            <div className="info-grid">
              <div className="info-item">
                <label>Email</label>
                <span>{result.user_email}</span>
              </div>
              <div className="info-item">
                <label>User ID</label>
                <span className="mono">{result.user_id}</span>
              </div>
              <div className="info-item">
                <label>Account Status</label>
                <span className="badge">{result.account_status}</span>
              </div>
              <div className="info-item">
                <label>Account Age</label>
                <span>{new Date(result.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          {/* Protocol-specific data */}
          {result.transactionPattern && (
            <div className="result-section transaction-data">
              <h3>Transaction Pattern</h3>
              <div className="info-grid">
                <div className="info-item">
                  <label>Last 24h</label>
                  <span>{result.transactionPattern.last_24h_count} transactions</span>
                </div>
                <div className="info-item">
                  <label>Last 7d</label>
                  <span>{result.transactionPattern.last_7d_count} transactions</span>
                </div>
                <div className="info-item">
                  <label>90-day Volume</label>
                  <span>${(result.transactionPattern.total_volume || 0).toFixed(2)}</span>
                </div>
                <div className="info-item">
                  <label>Max Single TX</label>
                  <span>${(result.transactionPattern.max_single_tx || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          {result.riskLevel && (
            <div className="result-section risk-data">
              <h3>Risk Assessment</h3>
              <div className="risk-badge" data-level={result.riskLevel.toLowerCase()}>
                {result.riskLevel}
              </div>
              {result.ellipticRisk?.risk_score !== undefined && (
                <p className="risk-score">Elliptic Score: {result.ellipticRisk.risk_score}</p>
              )}
            </div>
          )}

          {result.kyc_status && (
            <div className="result-section kyc-data">
              <h3>KYC Status</h3>
              <div className="info-grid">
                <div className="info-item">
                  <label>Status</label>
                  <span className="badge">{result.kyc_status}</span>
                </div>
                <div className="info-item">
                  <label>Level</label>
                  <span>{result.kyc_level || 'Pending'}</span>
                </div>
                {result.isRestrictedCountry && (
                  <div className="info-item alert-inline">
                    <span className="warning">⚠️ Restricted Country</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* VERDICT */}
          <div className="result-section verdict-section">
            <h3>VIGÍA Recommendation</h3>
            <div className={`verdict-card verdict-${result.verdict.verdict.toLowerCase()}`}>
              <div className="verdict-header">
                <span className="verdict-label">{result.verdict.label}</span>
                <span className="verdict-confidence">{result.verdict.confidence || 'High'}</span>
              </div>
              <p className="verdict-description">{result.verdict.description}</p>
              {result.verdict.actions && (
                <div className="verdict-actions">
                  <strong>Suggested Actions:</strong>
                  <ul>
                    {result.verdict.actions.map((action, i) => (
                      <li key={i}>{action}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* FEEDBACK */}
          {!feedbackGiven && (
            <div className="result-section feedback-section">
              <p className="feedback-prompt">Was this recommendation helpful?</p>
              <div className="feedback-buttons">
                <button
                  onClick={() => handleFeedback(true)}
                  className="feedback-btn feedback-up"
                  title="This recommendation was helpful"
                >
                  👍 Yes
                </button>
                <button
                  onClick={() => handleFeedback(false)}
                  className="feedback-btn feedback-down"
                  title="This recommendation was not helpful"
                >
                  👎 No
                </button>
              </div>
            </div>
          )}

          {feedbackGiven && (
            <div className="result-section feedback-section feedback-submitted">
              <p className="feedback-submitted-msg">
                {feedbackGiven === 'up'
                  ? '✅ Thanks! We\'ll learn from this.'
                  : '✅ Feedback noted. We\'ll improve.'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchWidget;
