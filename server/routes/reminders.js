const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { wrap, bad } = require('../utils/errors');
const svc = require('../services/reminderService');

const router = express.Router();
router.use(requireAuth);

// GET /api/reminders/today
router.get(
  '/today',
  wrap(async (req, res) => {
    const { date, reminders } = await svc.listToday(req.user);
    const done = reminders.filter((r) => ['Taken', 'Missed', 'Dismissed'].includes(r.status));
    res.json({
      date,
      serverTime: new Date().toISOString(),
      summary: {
        total: reminders.length,
        taken: reminders.filter((r) => r.status === 'Taken').length,
        missed: reminders.filter((r) => r.status === 'Missed').length,
        pending: reminders.filter((r) => ['Pending', 'Snoozed'].includes(r.status)).length,
        completed: done.length,
      },
      reminders,
    });
  })
);

// GET /api/reminders/upcoming?days=7
router.get(
  '/upcoming',
  wrap(async (req, res) => {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 7, 1), 7);
    res.json({ reminders: await svc.listUpcoming(req.user, days) });
  })
);

// PUT /api/reminders/:id/mark   body: { status: "Taken" | "Missed" | "Dismissed" }
router.put(
  '/:id/mark',
  wrap(async (req, res) => {
    if (!req.body || !req.body.status) throw bad('status is required');
    res.json({ reminder: await svc.mark(req.user, Number(req.params.id), req.body.status) });
  })
);

// PUT /api/reminders/:id/snooze   body: { minutes: 10 }
router.put(
  '/:id/snooze',
  wrap(async (req, res) => {
    res.json({ reminder: await svc.snooze(req.user, Number(req.params.id), req.body && req.body.minutes) });
  })
);

module.exports = router;
