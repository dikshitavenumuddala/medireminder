const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken, requireAuth } = require('../middleware/auth');
const { wrap, bad, conflict, unauthorized } = require('../utils/errors');
const { isValidTimezone, toDb } = require('../utils/time');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone || '',
    role: u.role,
    timezone: u.timezone,
    emergencyContact: { name: u.emergency_name || '', phone: u.emergency_phone || '', email: u.emergency_email || '' },
  };
}

// POST /api/auth/register
router.post(
  '/register',
  wrap(async (req, res) => {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const phone = String(req.body.phone || '').trim().slice(0, 30) || null;
    const role = req.body.role === 'caregiver' ? 'caregiver' : 'user';
    const timezone = isValidTimezone(req.body.timezone) ? req.body.timezone : 'UTC';

    if (name.length < 2) throw bad('Please enter your name');
    if (!EMAIL_RE.test(email)) throw bad('Please enter a valid email address');
    if (password.length < 6) throw bad('Password must be at least 6 characters');
    if (await db.one('users', { email })) throw conflict('An account with this email already exists');

    const hash = await bcrypt.hash(password, 10);
    const user = await db.insert('users', {
      name,
      email,
      password_hash: hash,
      phone,
      role,
      timezone,
      created_at: toDb(new Date()),
    });
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  })
);

// POST /api/auth/login
router.post(
  '/login',
  wrap(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = await db.one('users', { email });
    if (!user || !(await bcrypt.compare(password, user.password_hash))) throw unauthorized('Incorrect email or password');
    res.json({ token: signToken(user), user: publicUser(user) });
  })
);

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

// PUT /api/auth/profile  (name, phone, timezone, emergency contact)
router.put(
  '/profile',
  requireAuth,
  wrap(async (req, res) => {
    const b = req.body;
    const next = {
      name: b.name !== undefined ? String(b.name).trim() : req.user.name,
      phone: b.phone !== undefined ? String(b.phone).trim().slice(0, 30) || null : req.user.phone,
      timezone: b.timezone !== undefined ? b.timezone : req.user.timezone,
      emergency_name: req.user.emergency_name,
      emergency_phone: req.user.emergency_phone,
      emergency_email: req.user.emergency_email,
    };
    if (next.name.length < 2) throw bad('Please enter your name');
    if (!isValidTimezone(next.timezone)) throw bad('Unknown timezone');
    if (b.emergencyContact) {
      const e = b.emergencyContact;
      next.emergency_name = String(e.name || '').trim().slice(0, 100) || null;
      next.emergency_phone = String(e.phone || '').trim().slice(0, 30) || null;
      next.emergency_email = String(e.email || '').trim().toLowerCase().slice(0, 150) || null;
      if (next.emergency_email && !EMAIL_RE.test(next.emergency_email)) throw bad('Emergency contact email is not valid');
    }
    await db.update('users', { id: req.user.id }, { $set: next });
    res.json({ user: publicUser(await db.one('users', { id: req.user.id })) });
  })
);

// PUT /api/auth/password
router.put(
  '/password',
  requireAuth,
  wrap(async (req, res) => {
    const { currentPassword = '', newPassword = '' } = req.body;
    if (!(await bcrypt.compare(String(currentPassword), req.user.password_hash))) throw unauthorized('Current password is incorrect');
    if (String(newPassword).length < 6) throw bad('New password must be at least 6 characters');
    await db.update('users', { id: req.user.id }, { $set: { password_hash: await bcrypt.hash(String(newPassword), 10) } });
    res.json({ ok: true });
  })
);

module.exports = router;
module.exports.publicUser = publicUser;
