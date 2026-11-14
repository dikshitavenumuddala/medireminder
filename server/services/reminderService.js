const db = require('../db');
const config = require('../config');
const { notify } = require('./notifier');
const { mapMedicine, occurrencesOn } = require('../utils/schedule');
const { notFound, bad, conflict } = require('../utils/errors');
const { zonedToUtc, localDateStr, addDays, toDb, toIso } = require('../utils/time');

function mapReminder(r) {
  return {
    id: Number(r.id),
    medicineId: r.medicine_id,
    name: r.name,
    dosage: r.dosage,
    color: r.color,
    notes: r.notes || '',
    scheduledTime: toIso(r.scheduled_time),
    dueAt: toIso(r.due_at),
    status: r.status,
    actionTime: toIso(r.action_time),
    snoozeCount: r.snooze_count,
  };
}

async function addMedicineDetails(reminders) {
  if (!reminders.length) return [];
  const medicineIds = [...new Set(reminders.map((r) => r.medicine_id))];
  const medicines = await db.find('medicines', { id: { $in: medicineIds } });
  const byId = new Map(medicines.map((m) => [m.id, m]));
  return reminders.flatMap((r) => {
    const medicine = byId.get(r.medicine_id);
    return medicine ? [{
      ...r,
      name: medicine.name,
      dosage: medicine.dosage,
      color: medicine.color,
      notes: medicine.notes,
      deleted_at: medicine.deleted_at,
    }] : [];
  });
}

/**
 * Create (idempotently) the reminder documents for one user's active medicines for the given
 * local dates. Doses before a medicine's last create/update moment are skipped.
 */
async function ensureReminders(user, { medicineId = null, days = 2 } = {}) {
  const filter = { user_id: user.id, is_active: true, deleted_at: null };
  if (medicineId) filter.id = medicineId;
  const meds = (await db.find('medicines', filter)).map((row) => ({
    ...mapMedicine(row),
    updatedAt: new Date(`${row.updated_at.replace(' ', 'T')}Z`),
  }));
  if (!meds.length) return 0;

  const today = localDateStr(new Date(), user.timezone);
  const reminders = [];
  for (const med of meds) {
    for (let i = 0; i < days; i++) {
      const date = addDays(today, i);
      for (const when of occurrencesOn(med, date, user.timezone)) {
        if (when < med.updatedAt) continue;
        const scheduledTime = toDb(when);
        reminders.push(await db.insertIfMissing(
          'reminders',
          { medicine_id: med.id, scheduled_time: scheduledTime },
          {
            medicine_id: med.id,
            user_id: user.id,
            scheduled_time: scheduledTime,
            due_at: scheduledTime,
            status: 'Pending',
            action_time: null,
            snooze_count: 0,
            notified: false,
          }
        ));
      }
    }
  }
  return reminders.reduce((total, inserted) => total + inserted, 0);
}

/** UTC bounds [start, end) of the user's local calendar day. */
function dayBounds(dateStr, tz) {
  return [zonedToUtc(dateStr, '00:00', tz), zonedToUtc(addDays(dateStr, 1), '00:00', tz)];
}

async function listToday(user) {
  await ensureReminders(user);
  const today = localDateStr(new Date(), user.timezone);
  const [start, end] = dayBounds(today, user.timezone);
  const reminders = await db.find('reminders', {
    user_id: user.id,
    scheduled_time: { $gte: toDb(start), $lt: toDb(end) },
  }, { sort: { scheduled_time: 1 } });
  const withMedicine = await addMedicineDetails(reminders);
  return {
    date: today,
    reminders: withMedicine
      .filter((r) => !r.deleted_at)
      .map(mapReminder),
  };
}

async function listUpcoming(user, days = 7) {
  await ensureReminders(user, { days: Math.min(days + 1, 8) });
  const now = new Date();
  const end = new Date(now.getTime() + days * 86400000);
  const reminders = await db.find('reminders', {
    user_id: user.id,
    scheduled_time: { $gte: toDb(now), $lt: toDb(end) },
    status: { $in: ['Pending', 'Snoozed'] },
  }, { sort: { scheduled_time: 1 }, limit: 100 });
  const withMedicine = await addMedicineDetails(reminders);
  return withMedicine.filter((r) => !r.deleted_at).map(mapReminder);
}

async function getOwned(userId, id) {
  const reminder = await db.one('reminders', { id: Number(id), user_id: userId });
  const [row] = await addMedicineDetails(reminder ? [reminder] : []);
  if (!row || row.deleted_at) throw notFound('Reminder not found');
  return row;
}

/** Taken / Missed / Dismissed. */
async function mark(user, id, status) {
  if (!['Taken', 'Missed', 'Dismissed'].includes(status)) throw bad('Status must be Taken, Missed or Dismissed');
  const r = await getOwned(user.id, id);
  if (r.status === status) return mapReminder(r);

  await db.update('reminders', { id, user_id: user.id }, {
    $set: { status, action_time: toDb(new Date()), notified: true },
  });

  if (status === 'Taken') await decrementStock(user, r.medicine_id);
  if (status === 'Missed') await notifyCaregivers(user, r, 'missed');
  return mapReminder(await getOwned(user.id, id));
}

async function snooze(user, id, minutes) {
  const mins = Number.isFinite(Number(minutes)) ? Math.round(Number(minutes)) : 10;
  if (mins < 1 || mins > 120) throw bad('Snooze must be between 1 and 120 minutes');
  const r = await getOwned(user.id, id);
  if (!['Pending', 'Snoozed'].includes(r.status)) throw conflict(`A ${r.status.toLowerCase()} reminder cannot be snoozed`);
  if (r.snooze_count >= config.maxSnoozes) throw conflict(`You can snooze a dose at most ${config.maxSnoozes} times`);

  const now = new Date();
  await db.update('reminders', { id, user_id: user.id }, {
    $set: {
      status: 'Snoozed',
      due_at: toDb(new Date(now.getTime() + mins * 60000)),
      notified: false,
      action_time: toDb(now),
    },
    $inc: { snooze_count: 1 },
  });
  return mapReminder(await getOwned(user.id, id));
}

async function decrementStock(user, medicineId) {
  const med = await db.one('medicines', { id: medicineId });
  if (!med || med.stock === null) return;
  await db.update('medicines', { id: medicineId, stock: { $gt: 0 } }, { $inc: { stock: -1 } });
  const updated = await db.one('medicines', { id: medicineId });
  const stock = Math.max(0, Number(updated.stock));
  if (updated.refill_threshold !== null && stock <= Number(updated.refill_threshold)) {
    await notify({
      userId: user.id,
      type: 'refill',
      title: `Refill ${updated.name}`,
      message: `Only ${stock} dose${stock === 1 ? '' : 's'} of ${updated.name} left. Time to refill.`,
      email: true,
    });
  }
}

/** Tell every linked caregiver about an event on a patient's reminder. */
async function notifyCaregivers(patient, reminder, kind) {
  const links = await db.find('caregivers', { user_id: patient.id });
  if (!links.length) return;
  const title = kind === 'missed' ? `${patient.name} missed a dose` : `${patient.name}: ${kind}`;
  const message = `${patient.name} missed ${reminder.name} (${reminder.dosage}).`;
  for (const link of links) {
    await notify({
      userId: link.caregiver_user_id,
      type: 'caregiver-alert',
      title,
      message,
      reminderId: Number(reminder.id),
      email: true,
    });
  }
}

module.exports = {
  ensureReminders,
  listToday,
  listUpcoming,
  mark,
  snooze,
  mapReminder,
  notifyCaregivers,
  dayBounds,
};
