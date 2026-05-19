const axios = require('axios');

const BASE = process.env.PERSONA_BASE_URL || 'https://withpersona.com/api/v1';
const KEY = process.env.PERSONA_API_KEY || '';

const headers = {
  Authorization: `Bearer ${KEY}`,
  'Persona-Version': '2023-01-05',
  'Content-Type': 'application/json'
};

async function getInquiry(inquiryId) {
  try {
    const res = await axios.get(`${BASE}/inquiries/${inquiryId}`, {
      headers, timeout: 15000
    });
    return res.data;
  } catch (err) {
    console.error('[Persona] Get inquiry error:', err.message);
    return null;
  }
}

async function listInquiries(params = {}) {
  try {
    const res = await axios.get(`${BASE}/inquiries`, {
      headers,
      params: { 'page[size]': 25, ...params },
      timeout: 15000
    });
    return res.data;
  } catch (err) {
    console.error('[Persona] List inquiries error:', err.message);
    return { data: [] };
  }
}

module.exports = { getInquiry, listInquiries };
