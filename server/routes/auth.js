const express = require('express');
const router = express.Router();
const { EMPLOYEES, ROLE_PORTALS } = require('../employees');

// Simple token-based auth: token = base64(email + ':' + secret)
const SECRET = process.env.SESSION_SECRET || 'vigia-compliance-portal-2026';

function makeToken(email) {
  return Buffer.from(`${email}:${SECRET}:${Date.now()}`).toString('base64');
}

function validateToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const [email] = decoded.split(':');
    return EMPLOYEES[email] ? { email, ...EMPLOYEES[email] } : null;
  } catch {
    return null;
  }
}

// POST /api/auth/login  { email }
router.post('/login', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const normalized = email.toLowerCase().trim();
  const employee = EMPLOYEES[normalized];
  if (!employee) {
    return res.status(403).json({ error: 'Access denied. Not on the Airtm employee whitelist.' });
  }

  const token = makeToken(normalized);
  const portals = ROLE_PORTALS[employee.role] || ['support'];

  res.json({
    token,
    user: {
      email: normalized,
      name: employee.name,
      department: employee.department,
      title: employee.title,
      role: employee.role,
      portals
    }
  });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = auth.slice(7);
  const user = validateToken(token);
  if (!user) return res.status(401).json({ error: 'Invalid token' });

  const portals = ROLE_PORTALS[user.role] || ['support'];
  res.json({ ...user, portals });
});

module.exports = { router, validateToken, ROLE_PORTALS };
