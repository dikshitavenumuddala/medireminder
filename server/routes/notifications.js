const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { wrap, notFound } = require('../utils/errors');
const { toIso } = require('../utils/time');
const { sendEmail, notify } = require('../services/notifier');

const router = express.Router();
router.use(requireAuth);

const map = (n) => ({
  id: Number(n.id),
  type: n.type,
  title: n.title,
  message: n.message,
  reminderId: n.reminder_id === null ? null : Number(n.reminder_id),
  isRead: !!n.is_read,
  createdAt: toIso(n.created_at),
});

// GET /api/notifications?since=<id>&limit=30
router.get(
  '/',
  wrap(async (req, res) => {
    const since = parseInt(req.query.since, 10) || 0;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
    const filter = { user_id: req.user.id, id: { $gt: since } };
    const rows = await db.find('notifications', filter, { sort: { id: -1 }, limit });
    const unread = await db.count('notifications', { user_id: req.user.id, is_read: false });
    res.json({ unread, notifications: rows.map(map) });
  })
);

// PUT /api/notifications/read-all
router.put(
  '/read-all',
  wrap(async (req, res) => {
    await db.updateMany('notifications', { user_id: req.user.id }, { $set: { is_read: true } });
    res.json({ ok: true });
  })
);

// PUT /api/notifications/:id/read
router.put(
  '/:id/read',
  wrap(async (req, res) => {
    const result = await db.update('notifications', { id: Number(req.params.id), user_id: req.user.id }, { $set: { is_read: true } });
    if (!result.matchedCount) throw notFound('Notification not found');
    res.json({ ok: true });
  })
);

// DELETE /api/notifications  (clear all)
router.delete(
  '/',
  wrap(async (req, res) => {
    await db.removeMany('notifications', { user_id: req.user.id });
    res.json({ ok: true });
  })
);

// POST /api/notifications/test  -> sends a test in-app notification + e-mail (handy for the demo)
router.post(
  '/test',
  wrap(async (req, res) => {
    await notify({ userId: req.user.id, type: 'test', title: 'Test notification', message: 'Notifications are working.', email: true });
    res.json({ ok: true });
  })
);

// POST /api/notifications/emergency  -> alert emergency contact + caregivers
router.post(
  '/emergency',
  wrap(async (req, res) => {
    const u = req.user;
    const note = String(req.body.message || '').slice(0, 300);
    const text = `${u.name} has triggered an emergency alert from MediReminder.${note ? `\n\nMessage: ${note}` : ''}\n\nPlease contact them as soon as possible${u.phone ? ` on ${u.phone}` : ''}.`;
    const notified = [];
    if (u.emergency_email) {
      await sendEmail(u.emergency_email, `EMERGENCY: ${u.name} needs help`, text);
      notified.push(u.emergency_name || u.emergency_email);
    }
    const links = await db.find('caregivers', { user_id: u.id });
    const carers = (await Promise.all(links.map(async (link) => {
      const caregiver = await db.one('users', { id: link.caregiver_user_id });
      return caregiver ? { id: caregiver.id, name: caregiver.name } : null;
    }))).filter(Boolean);
    for (const c of carers) {
      await notify({ userId: c.id, type: 'emergency', title: `EMERGENCY: ${u.name}`, message: note || `${u.name} pressed the emergency button.`, email: true });
      notified.push(c.name);
    }
    res.json({ ok: true, notified, emergencyPhone: u.emergency_phone || null });
  })
);

module.exports = router;
