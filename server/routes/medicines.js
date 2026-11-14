const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { wrap, notFound } = require('../utils/errors');
const { mapMedicine, validateMedicine } = require('../utils/schedule');
const { localDateStr, toDb } = require('../utils/time');
const { ensureReminders } = require('../services/reminderService');

const router = express.Router();
router.use(requireAuth);

async function findOwned(userId, id) {
  const row = await db.one('medicines', { id: Number(id), user_id: userId, deleted_at: null });
  if (!row) throw notFound('Medicine not found');
  return row;
}

// POST /api/medicines
router.post(
  '/',
  wrap(async (req, res) => {
    const body = { ...req.body };
    if (!body.startDate) body.startDate = localDateStr(new Date(), req.user.timezone);
    const m = validateMedicine(body);
    const now = toDb(new Date());
    const medicine = await db.insert('medicines', {
      user_id: req.user.id,
      name: m.name,
      dosage: m.dosage,
      schedule: m.schedule,
      start_date: m.startDate,
      end_date: m.endDate,
      repeat_pattern: m.repeatPattern,
      notes: m.notes || null,
      color: m.color || '#6366f1',
      stock: m.stock ?? null,
      refill_threshold: m.refillThreshold ?? null,
      is_active: true,
      created_at: now,
      updated_at: now,
    });
    await ensureReminders(req.user, { medicineId: medicine.id });
    res.status(201).json({ medicine: mapMedicine(await findOwned(req.user.id, medicine.id)) });
  })
);

// GET /api/medicines
router.get(
  '/',
  wrap(async (req, res) => {
    const rows = await db.find('medicines', { user_id: req.user.id, deleted_at: null }, { sort: { is_active: -1, name: 1 } });
    res.json({ medicines: rows.map(mapMedicine) });
  })
);

// GET /api/medicines/:id
router.get(
  '/:id',
  wrap(async (req, res) => {
    res.json({ medicine: mapMedicine(await findOwned(req.user.id, req.params.id)) });
  })
);

// PUT /api/medicines/:id   (partial updates allowed)
router.put(
  '/:id',
  wrap(async (req, res) => {
    const current = mapMedicine(await findOwned(req.user.id, req.params.id));
    const m = validateMedicine({ ...current, ...req.body }, { partial: false });
    const scheduleChanged =
      JSON.stringify(m.schedule) !== JSON.stringify(current.schedule) ||
      JSON.stringify(m.repeatPattern) !== JSON.stringify(current.repeatPattern) ||
      m.startDate !== current.startDate ||
      (m.endDate || null) !== (current.endDate || null) ||
      m.isActive === false;
    const isActive = req.body.isActive === undefined ? current.isActive : !!req.body.isActive;
    const now = toDb(new Date());

    await db.update('medicines', { id: Number(req.params.id), user_id: req.user.id }, {
      $set: {
        name: m.name,
        dosage: m.dosage,
        schedule: m.schedule,
        start_date: m.startDate,
        end_date: m.endDate || null,
        repeat_pattern: m.repeatPattern,
        notes: m.notes ?? current.notes ?? null,
        color: m.color || current.color,
        stock: m.stock === undefined ? current.stock : m.stock,
        refill_threshold: m.refillThreshold === undefined ? current.refillThreshold : m.refillThreshold,
        is_active: isActive,
        updated_at: now,
      },
    });

    if (scheduleChanged || !isActive) {
      // drop doses that have not happened yet; the history of past doses is kept
      await db.removeMany('reminders', {
        medicine_id: Number(req.params.id),
        status: { $in: ['Pending', 'Snoozed'] },
        scheduled_time: { $gte: now },
      });
    }
    if (isActive) await ensureReminders(req.user, { medicineId: Number(req.params.id) });
    res.json({ medicine: mapMedicine(await findOwned(req.user.id, req.params.id)) });
  })
);

// DELETE /api/medicines/:id   (soft delete keeps history; ?permanent=true removes everything)
router.delete(
  '/:id',
  wrap(async (req, res) => {
    await findOwned(req.user.id, req.params.id);
    if (String(req.query.permanent) === 'true') {
      await db.removeMany('reminders', { medicine_id: Number(req.params.id) });
      await db.remove('medicines', { id: Number(req.params.id), user_id: req.user.id });
    } else {
      await db.update('medicines', { id: Number(req.params.id), user_id: req.user.id }, {
        $set: { deleted_at: toDb(new Date()), is_active: false },
      });
      await db.removeMany('reminders', { medicine_id: Number(req.params.id), status: { $in: ['Pending', 'Snoozed'] } });
    }
    res.json({ ok: true });
  })
);

module.exports = router;
