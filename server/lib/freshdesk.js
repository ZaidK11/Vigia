const axios = require('axios');

const BASE = process.env.FRESHDESK_BASE_URL || 'https://airtm.freshdesk.com/api/v2';
const KEY = process.env.FRESHDESK_KEY || '';

function authHeader() {
  const b64 = Buffer.from(`${KEY}:X`).toString('base64');
  return { Authorization: `Basic ${b64}`, 'Content-Type': 'application/json' };
}

async function getTicketsByEmail(email) {
  try {
    const res = await axios.get(`${BASE}/tickets`, {
      headers: authHeader(),
      params: { email, per_page: 10, order_by: 'created_at', order_type: 'desc' },
      timeout: 15000
    });
    return res.data || [];
  } catch (err) {
    console.error('[Freshdesk] Tickets error:', err.message);
    return [];
  }
}

async function getTicket(id) {
  try {
    const res = await axios.get(`${BASE}/tickets/${id}`, {
      headers: authHeader(), timeout: 15000
    });
    return res.data;
  } catch (err) {
    console.error('[Freshdesk] Get ticket error:', err.message);
    return null;
  }
}

module.exports = { getTicketsByEmail, getTicket };
