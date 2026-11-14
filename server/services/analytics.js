const db = require('../db');
const { addDays, localDateStr, toDb } = require('../utils/time');
const { zonedToUtc } = require('../utils/time');

/**
 * Adherence statistics for one patient over the last `days` local days (including today).
 * Adherence % = Taken / (Taken + Missed + Dismissed). Future/pending doses are not counted.
 */
async function adherence(user, days = 30) {
  const tz = user.timezone;
  const today = localDateStr(new Date(), tz);
  const firstDay = addDays(today, -(days - 1));
  const start = zonedToUtc(firstDay, '00:00', tz);
  const end = zonedToUtc(addDays(today, 1), '00:00', tz);

  const reminders = await db.find('reminders', {
    user_id: user.id,
    scheduled_time: { $gte: toDb(start), $lt: toDb(end) },
  });
  const medicineIds = [...new Set(reminders.map((r) => r.medicine_id))];
  const medicines = await db.find('medicines', { id: { $in: medicineIds } });
  const medicineById = new Map(medicines.map((m) => [m.id, m]));
  const rows = reminders.flatMap((reminder) => {
    const medicine = medicineById.get(reminder.medicine_id);
    return medicine ? [{
      scheduled_time: reminder.scheduled_time,
      status: reminder.status,
      action_time: reminder.action_time,
      medicine_id: medicine.id,
      name: medicine.name,
      color: medicine.color,
    }] : [];
  });

  const totals = { taken: 0, missed: 0, dismissed: 0, pending: 0, snoozed: 0, total: rows.length };
  const dailyMap = new Map();
  for (let i = 0; i < days; i++) dailyMap.set(addDays(firstDay, i), { date: addDays(firstDay, i), taken: 0, missed: 0, dismissed: 0, total: 0 });
  const medMap = new Map();
  const hours = Array.from({ length: 24 }, () => ({ taken: 0, total: 0 }));
  let onTime = 0;

  for (const r of rows) {
    const when = new Date(`${r.scheduled_time.replace(' ', 'T')}Z`);
    const day = dailyMap.get(localDateStr(when, tz));
    const key = r.status.toLowerCase();
    totals[key] += 1;
    const med = medMap.get(r.medicine_id) || { id: r.medicine_id, name: r.name, color: r.color, taken: 0, missed: 0, dismissed: 0 };
    medMap.set(r.medicine_id, med);

    if (['Taken', 'Missed', 'Dismissed'].includes(r.status)) {
      if (day) {
        day.total += 1;
        day[key] += 1;
      }
      med[key] += 1;
      const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(when));
      hours[hour].total += 1;
      if (r.status === 'Taken') {
        hours[hour].taken += 1;
        // taken within 30 min of the scheduled time counts as "on time"
        if (r.action_time && Math.abs(new Date(`${r.action_time.replace(' ', 'T')}Z`) - when) <= 30 * 60000) onTime += 1;
      }
    }
  }

  const resolved = totals.taken + totals.missed + totals.dismissed;
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
  const daily = [...dailyMap.values()].map((d) => ({ ...d, adherence: pct(d.taken, d.total) }));

  // streak = consecutive fully-adherent days (days with at least one resolved dose), ending today/yesterday
  let streak = 0;
  let best = 0;
  let run = 0;
  for (const d of daily) {
    if (d.total === 0) continue;
    if (d.taken === d.total) {
      run += 1;
      best = Math.max(best, run);
    } else run = 0;
  }
  const withData = daily.filter((d) => d.total > 0);
  for (let i = withData.length - 1; i >= 0; i--) {
    const d = withData[i];
    if (d.taken === d.total) streak += 1;
    else if (d.date === today) continue; // today still in progress
    else break;
  }

  return {
    days,
    totals,
    adherence: pct(totals.taken, resolved),
    onTimeRate: pct(onTime, totals.taken),
    streak,
    bestStreak: best,
    daily,
    byMedicine: [...medMap.values()].map((m) => ({ ...m, adherence: pct(m.taken, m.taken + m.missed + m.dismissed) })),
    byHour: hours.map((h, hour) => ({ hour, ...h })).filter((h) => h.total > 0),
  };
}

module.exports = { adherence };
