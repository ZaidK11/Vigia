const axios = require('axios');

const CH_HOST = process.env.CLICKHOUSE_HOST || 'https://data-lake.galar.data.airtm.com';
const CH_USER = process.env.CLICKHOUSE_USER || 'ruben';
const CH_PASS = process.env.CLICKHOUSE_PASSWORD || '';

async function query(sql) {
  try {
    const url = `${CH_HOST}/?default_format=JSONEachRow&max_execution_time=30`;
    const response = await axios.post(url, sql, {
      auth: { username: CH_USER, password: CH_PASS },
      headers: { 'Content-Type': 'text/plain' },
      timeout: 35000
    });

    const raw = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    const lines = raw.trim().split('\n').filter(Boolean);
    return lines.map((line) => {
      try { return JSON.parse(line); } catch { return { _raw: line }; }
    });
  } catch (err) {
    const msg = err.response?.data || err.message;
    console.error('[ClickHouse] Query error:', msg);
    return [];
  }
}

module.exports = { query };
