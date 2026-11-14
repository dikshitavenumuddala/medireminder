/**
 * Demo data:  npm run seed
 * Creates a patient (Asha), a caregiver (Ravi) and ~3 weeks of realistic history.
 *
 *   patient   : asha@demo.com  / demo123
 *   caregiver : ravi@demo.com / demo123
 */
const bcrypt = require('bcryptjs');
const db = require('./db');
const { toDb, localDateStr, addDays, zonedToUtc } = require('./utils/time');
const { appliesOn, mapMedicine } = require('./utils/schedule');

const TZ = 'Asia/Kolkata';

async function removeDemoData() {
  const users = await db.find('users', { email: { $in: ['asha@demo.com', 'ravi@demo.com'] } });
  if (!users.length) return;
  const userIds = users.map((user) => user.id);
  const medicines = await db.find('medicines', { user_id: { $in: userIds } });
  const medicineIds = medicines.map((medicine) => medicine.id);

  await db.removeMany('notifications', { user_id: { $in: userIds } });
  await db.removeMany('caregivers', {
    $or: [{ user_id: { $in: userIds } }, { caregiver_user_id: { $in: userIds } }],
  });
  await db.removeMany('reminders', {
    $or: [{ user_id: { $in: userIds } }, { medicine_id: { $in: medicineIds } }],
  });
  await db.removeMany('medicines', { user_id: { $in: userIds } });
  await db.removeMany('users', { id: { $in: userIds } });
}

async function main() {
  await db.init();
  const now = new Date();
  await removeDemoData();
  const hash = await bcrypt.hash('demo123', 10);
  const patient = await db.insert('users', {
    name: 'Asha Reddy',
    email: 'asha@demo.com',
    password_hash: hash,
    phone: '+91 90000 11111',
    role: 'user',
    timezone: TZ,
    emergency_name: 'Meena (daughter)',
    emergency_phone: '+91 98765 43210',
    emergency_email: 'meena@example.com',
    created_at: toDb(new Date(now - 30 * 86400000)),
  });
  const caregiver = await db.insert('users', {
    name: 'Ravi Reddy',
    email: 'ravi@demo.com',
    password_hash: hash,
    phone: '+91 90000 22222',
    role: 'caregiver',
    timezone: TZ,
    created_at: toDb(new Date(now - 30 * 86400000)),
  });
  await db.insert('caregivers', { user_id: patient.id, caregiver_user_id: caregiver.id, linked_at: toDb(now) });

  const today = localDateStr(now, TZ);
  const start = addDays(today, -21);
  const meds = [
    { name: 'Metformin', dosage: '500 mg · 1 tablet', schedule: ['08:00', '20:00'], pattern: { type: 'daily' }, color: '#6366f1', stock: 24, thr: 10, notes: 'Take with food' },
    { name: 'Amlodipine', dosage: '5 mg · 1 tablet', schedule: ['09:00'], pattern: { type: 'daily' }, color: '#ec4899', stock: 40, thr: 10, notes: 'Blood pressure' },
    { name: 'Vitamin D3', dosage: '60,000 IU · 1 capsule', schedule: ['13:00'], pattern: { type: 'weekdays', days: [0] }, color: '#f59e0b', stock: 8, thr: 2, notes: 'Sundays only' },
    { name: 'Atorvastatin', dosage: '10 mg · 1 tablet', schedule: ['21:30'], pattern: { type: 'alternate' }, color: '#10b981', stock: 30, thr: 8, notes: 'Before bed' },
  ];

  for (const medicine of meds) {
    const created = toDb(new Date(now - 22 * 86400000));
    const record = await db.insert('medicines', {
      user_id: patient.id,
      name: medicine.name,
      dosage: medicine.dosage,
      schedule: medicine.schedule,
      start_date: start,
      end_date: null,
      repeat_pattern: medicine.pattern,
      notes: medicine.notes,
      color: medicine.color,
      stock: medicine.stock,
      refill_threshold: medicine.thr,
      is_active: true,
      created_at: created,
      updated_at: created,
    });
    const mapped = mapMedicine(record);

    for (let i = -21; i < 0; i++) {
      const date = addDays(today, i);
      if (!appliesOn(mapped, date)) continue;
      for (const time of mapped.schedule) {
        const scheduled = zonedToUtc(date, time, TZ);
        const roll = Math.random();
        const status = roll < 0.86 ? 'Taken' : roll < 0.95 ? 'Missed' : 'Dismissed';
        const delay = status === 'Taken' ? Math.floor(Math.random() * 25) * 60000 : 0;
        const scheduledTime = toDb(scheduled);
        await db.insertIfMissing(
          'reminders',
          { medicine_id: record.id, scheduled_time: scheduledTime },
          {
            medicine_id: record.id,
            user_id: patient.id,
            scheduled_time: scheduledTime,
            due_at: scheduledTime,
            status,
            action_time: toDb(new Date(scheduled.getTime() + delay)),
            snooze_count: status === 'Taken' && roll < 0.2 ? 1 : 0,
            notified: true,
          }
        );
      }
    }
  }
  console.log('✅ Demo data created.\n   Patient  : asha@demo.com / demo123\n   Caregiver: ravi@demo.com / demo123');
  console.log('   Today\'s reminders are generated automatically by the scheduler when you log in.');
  await db.close();
}

main().catch(async (error) => {
  console.error(error);
  await db.close();
  process.exitCode = 1;
});
