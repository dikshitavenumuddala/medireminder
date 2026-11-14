const express = require('express');
const db = require('../db');
const { requireAuth, assertCanViewPatient } = require('../middleware/auth');
const { wrap, bad, notFound } = require('../utils/errors');
const { zonedToUtc, addDays, localDateStr, toDb, toIso, isDateStr, localTimeStr } = require('../utils/time');
const { adherence } = require('../services/analytics');

const router = express.Router();
router.use(requireAuth);

const STATUSES = ['Pending', 'Taken', 'Missed', 'Snoozed', 'Dismissed'];

async function targetUser(req) {
  const pid = req.query.patientId ? Number(req.query.patientId) : req.user.id;
  await assertCanViewPatient(req.user, pid);
  if (pid === req.user.id) return req.user;
  const patient = await db.one('users', { id: pid });
  if (!patient) throw notFound('Patient not found');
  return patient;
}

async function fetchHistory(user, query, { limit, offset }) {
  const today = localDateStr(new Date(), user.timezone);
  const from = query.from || addDays(today, -29);
  const to = query.to || today;
  if (!isDateStr(from) || !isDateStr(to)) throw bad('from and to must be YYYY-MM-DD');
  if (to < from) throw bad('"to" must not be before "from"');

  const filter = {
    user_id: user.id,
    scheduled_time: {
      $gte: toDb(zonedToUtc(from, '00:00', user.timezone)),
      $lt: toDb(zonedToUtc(addDays(to, 1), '00:00', user.timezone)),
    },
    $or: [
      { status: { $ne: 'Pending' } },
      { scheduled_time: { $lte: toDb(new Date()) } },
    ],
  };
  if (query.status) {
    if (!STATUSES.includes(query.status)) throw bad('Unknown status filter');
    filter.status = query.status;
  }
  if (query.medicineId) filter.medicine_id = Number(query.medicineId);

  const total = await db.count('reminders', filter);
  const options = { sort: { scheduled_time: -1 } };
  if (limit) {
    options.limit = limit;
    options.skip = offset;
  }
  const reminders = await db.find('reminders', filter, options);
  const medicineIds = [...new Set(reminders.map((r) => r.medicine_id))];
  const medicines = await db.find('medicines', { id: { $in: medicineIds } });
  const medicineById = new Map(medicines.map((m) => [m.id, m]));
  const items = reminders.flatMap((reminder) => {
    const medicine = medicineById.get(reminder.medicine_id);
    return medicine ? [{
      id: Number(reminder.id),
      medicineId: reminder.medicine_id,
      name: medicine.name,
      dosage: medicine.dosage,
      color: medicine.color,
      scheduledTime: toIso(reminder.scheduled_time),
      actionTime: toIso(reminder.action_time),
      status: reminder.status,
      snoozeCount: reminder.snooze_count,
    }] : [];
  });
  return { from, to, total, items };
}

// GET /api/history?from=YYYY-MM-DD&to=YYYY-MM-DD&status=&medicineId=&page=&pageSize=&patientId=
router.get(
  '/',
  wrap(async (req, res) => {
    const user = await targetUser(req);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 25, 1), 200);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const data = await fetchHistory(user, req.query, { limit: pageSize, offset: (page - 1) * pageSize });
    res.json({ ...data, page, pageSize, pages: Math.max(1, Math.ceil(data.total / pageSize)) });
  })
);

// GET /api/history/analytics?days=30&patientId=
router.get(
  '/analytics',
  wrap(async (req, res) => {
    const user = await targetUser(req);
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 7), 90);
    res.json(await adherence(user, days));
  })
);

// GET /api/history/export.csv?from=&to=
router.get(
  '/export.csv',
  wrap(async (req, res) => {
    const user = await targetUser(req);
    const data = await fetchHistory(user, req.query, { limit: 0, offset: 0 });
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = ['Date,Time,Medicine,Dosage,Status,Action time,Snoozes'];
    for (const reminder of data.items) {
      const sched = new Date(reminder.scheduledTime);
      lines.push(
        [
          localDateStr(sched, user.timezone),
          localTimeStr(sched, user.timezone),
          reminder.name,
          reminder.dosage,
          reminder.status,
          reminder.actionTime
            ? `${localDateStr(new Date(reminder.actionTime), user.timezone)} ${localTimeStr(new Date(reminder.actionTime), user.timezone)}`
            : '',
          reminder.snoozeCount,
        ]
          .map(esc)
          .join(',')
      );
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="adherence-${data.from}_to_${data.to}.csv"`);
    res.send(lines.join('\r\n'));
  })
);

module.exports = router;
