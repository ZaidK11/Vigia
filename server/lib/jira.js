const axios = require('axios');

const BASE = process.env.JIRA_BASE_URL || 'https://airtech.atlassian.net';
const EMAIL = process.env.JIRA_EMAIL || 'zaid@airtm.io';
const TOKEN = process.env.JIRA_TOKEN || '';

const auth = { username: EMAIL, password: TOKEN };
const headers = { 'Accept': 'application/json', 'Content-Type': 'application/json' };

async function searchIssues(jql, maxResults = 50) {
  try {
    const res = await axios.get(`${BASE}/rest/api/3/search`, {
      auth, headers,
      params: { jql, maxResults, fields: 'summary,status,assignee,created,updated,priority,description,labels,customfield_10014' },
      timeout: 15000
    });
    return res.data.issues || [];
  } catch (err) {
    console.error('[Jira] Search error:', err.message);
    return [];
  }
}

async function getIssue(issueKey) {
  try {
    const res = await axios.get(`${BASE}/rest/api/3/issue/${issueKey}`, {
      auth, headers, timeout: 15000
    });
    return res.data;
  } catch (err) {
    console.error('[Jira] Get issue error:', err.message);
    return null;
  }
}

module.exports = { searchIssues, getIssue };
