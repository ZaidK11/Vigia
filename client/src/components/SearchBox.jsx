import React, { useState } from 'react';

const DEFAULT_TYPES = [
  { value: 'email', label: 'Email' },
  { value: 'uuid', label: 'User ID' },
  { value: 'ticket', label: 'Ticket #' },
];

export default function SearchBox({ onSearch, loading, placeholder, searchTypes = DEFAULT_TYPES }) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState(searchTypes[0]?.value || 'email');

  const handle = (e) => {
    e.preventDefault();
    if (query.trim()) onSearch(query.trim(), type);
  };

  return (
    <form onSubmit={handle} className="flex gap-2 w-full">
      <div className="relative flex-shrink-0">
        <select
          value={type}
          onChange={e => setType(e.target.value)}
          className="select w-32 pr-7"
        >
          {searchTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder={placeholder || `Search by ${type}...`}
        className="input flex-1"
      />
      <button type="submit" disabled={loading || !query.trim()} className="btn-teal flex-shrink-0">
        {loading
          ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        }
        <span>Search</span>
      </button>
    </form>
  );
}
