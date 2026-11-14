/**
 * Server-side scheduler.
 *
 * Every SCHEDULER_INTERVAL_SEC seconds it generates reminders, wakes snoozed doses,
 * sends due notifications, and marks unanswered doses as Missed.
 */
const db = require('../db');
const config = require('../config');
const { notify } = require('./notifier');
const { ensureReminders, notifyCaregivers } = require('./reminderService');
const { toDb, localTimeStr } = require('../utils/time');

let timer = null;
let running = false;

async function generateAll() {
  const medicines = await db.find('medicines', { is_active: true, deleted_at: null }, { projection: { user_id: 1 } });
  const userIds = [...new Set(medicines.map((m) => m.user_id))];
  for (const userId of userIds) {
    const user = await db.one('users', { id: userId });
    if (!user) continue;
    try {
      await ensureReminders(user);
    } catch (error) {
      console.error(`[scheduler] generate failed for user ${user.id}:`, error.message);
    }
  }
}

async function wakeSnoozed(now) {
  await db.updateMany(
    'reminders',
    { status: 'Snoozed', due_at: { $lte: now } },
    { $set: { status: 'Pending', notified: false } }
  );
}

async function notifyDue(now) {
  const reminders = await db.find('reminders', {
    status: 'Pending',
    notified: false,
    due_at: { $lte: now },
  });
  for (const reminder of reminders) {
    const medicine = await db.one('medicines', { id: reminder.medicine_id, deleted_at: null });
    const user = await db.one('users', { id: reminder.user_id });
    if (!medicine || !user) continue;

    const claim = await db.update(
      'reminders',
      { id: reminder.id, status: 'Pending', notified: false },
      { $set: { notified: true } }
    );
    if (!claim.matchedCount) continue;
    const at = localTimeStr(new Date(`${reminder.scheduled_time.replace(' ', 'T')}Z`), user.timezone);
    await notify({
      userId: reminder.user_id,
      type: 'reminder',
      title: `Time to take ${medicine.name}`,
      message: `${medicine.dosage} · scheduled for ${at}${reminder.snooze_count ? ` (snoozed ${reminder.snooze_count}×)` : ''}`,
      reminderId: Number(reminder.id),
      email: true,
    });
  }
}

async function markMissed(now) {
  const cutoff = toDb(new Date(Date.now() - config.scheduler.missedAfterMin * 60000));
  const reminders = await db.find('reminders', { status: 'Pending', due_at: { $lte: cutoff } });
  for (const reminder of reminders) {
    const medicine = await db.one('medicines', { id: reminder.medicine_id });
    if (!medicine) continue;
    const result = await db.update(
      'reminders',
      { id: reminder.id, status: 'Pending' },
      { $set: { status: 'Missed', action_time: now } }
    );
    if (!result.matchedCount) continue;
    const patient = await db.one('users', { id: reminder.user_id });
    if (!patient) continue;
    await notify({
      userId: reminder.user_id,
      type: 'missed',
      title: `Missed: ${medicine.name}`,
      message: `You did not log ${medicine.name} (${medicine.dosage}). It was marked as missed.`,
      reminderId: Number(reminder.id),
    });
    await notifyCaregivers(patient, { id: reminder.id, name: medicine.name, dosage: medicine.dosage }, 'missed');
  }
}

async function tick() {
  if (running) return;
  running = true;
  try {
    const now = toDb(new Date());
    await generateAll();
    await wakeSnoozed(now);
    await notifyDue(now);
    await markMissed(now);
  } catch (error) {
    console.error('[scheduler] tick failed:', error.message);
  } finally {
    running = false;
  }
}

function start() {
  if (timer) return;
  tick();
  timer = setInterval(tick, config.scheduler.intervalSec * 1000);
  console.log(`[scheduler] running every ${config.scheduler.intervalSec}s (missed after ${config.scheduler.missedAfterMin} min)`);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, tick };
