const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth, assertCanViewPatient } = require('../middleware/auth');
const { wrap, bad, notFound, conflict, forbidden } = require('../utils/errors');
const { toDb } = require('../utils/time');
const { listToday } = require('../services/reminderService');
const { adherence } = require('../services/analytics');
const { notify } = require('../services/notifier');

const router = express.Router();
router.use(requireAuth);

const newCode = () => crypto.randomBytes(4).toString('hex').toUpperCase(); // e.g. "9F3A1C2B"

async function link(patientId, caregiverId) {
  if (patientId === caregiverId) throw bad('You cannot be your own caregiver');
  const existing = await db.one('caregivers', { user_id: patientId, caregiver_user_id: caregiverId });
  if (existing) throw conflict('Already linked');
  try {
    await db.insert('caregivers', { user_id: patientId, caregiver_user_id: caregiverId, linked_at: toDb(new Date()) });
  } catch (error) {
    if (error.code === 11000) throw conflict('Already linked');
    throw error;
  }
}

// POST /api/caregivers/invite  -> patient generates (or rotates) an invitation code
router.post(
  '/invite',
  wrap(async (req, res) => {
    let code;
    for (let i = 0; i < 5; i++) {
      code = newCode();
      if (!(await db.one('users', { invite_code: code }))) break;
    }
    await db.update('users', { id: req.user.id }, { $set: { invite_code: code } });
    res.json({ code });
  })
);

// POST /api/caregivers/link
//   { code }  -> the logged-in user becomes caregiver of the patient who owns the code
//   { email } -> the logged-in patient adds an existing account as their caregiver
router.post(
  '/link',
  wrap(async (req, res) => {
    const { code, email } = req.body || {};
    if (code) {
      const patient = await db.one('users', { invite_code: String(code).trim().toUpperCase() });
      if (!patient) throw notFound('That invitation code is not valid');
      await link(patient.id, req.user.id);
      await notify({
        userId: patient.id,
        type: 'caregiver',
        title: 'New caregiver linked',
        message: `${req.user.name} can now view your medicine schedule and adherence.`,
        email: true,
      });
      return res.status(201).json({ ok: true, patient: { id: patient.id, name: patient.name } });
    }
    if (email) {
      const caregiver = await db.one('users', { email: String(email).trim().toLowerCase() });
      if (!caregiver) throw notFound('No account found with that email. Ask them to register first or share an invite code.');
      await link(req.user.id, caregiver.id);
      await notify({
        userId: caregiver.id,
        type: 'caregiver',
        title: 'You are now a caregiver',
        message: `${req.user.name} added you as their caregiver.`,
        email: true,
      });
      return res.status(201).json({ ok: true, caregiver: { id: caregiver.id, name: caregiver.name } });
    }
    throw bad('Provide an invitation code or a caregiver email');
  })
);

// GET /api/caregivers/mine -> people who can see MY data
router.get(
  '/mine',
  wrap(async (req, res) => {
    const links = await db.find('caregivers', { user_id: req.user.id }, { sort: { linked_at: -1 } });
    const rows = await Promise.all(links.map(async (link) => {
      const user = await db.one('users', { id: link.caregiver_user_id });
      return user ? { id: link.id, linked_at: link.linked_at, user } : null;
    }));
    const me = await db.one('users', { id: req.user.id }, { projection: { invite_code: 1 } });
    res.json({
      inviteCode: me.invite_code,
      caregivers: rows.filter(Boolean).map((r) => ({
        linkId: r.id,
        userId: r.user.id,
        name: r.user.name,
        email: r.user.email,
        phone: r.user.phone || '',
        linkedAt: r.linked_at,
      })),
    });
  })
);

// GET /api/caregivers/patients -> patients I look after, with a live snapshot of today
router.get(
  '/patients',
  wrap(async (req, res) => {
    const links = await db.find('caregivers', { caregiver_user_id: req.user.id });
    const rows = (await Promise.all(links.map(async (link) => {
      const patient = await db.one('users', { id: link.user_id });
      return patient ? { ...patient, link_id: link.id } : null;
    }))).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
    const patients = [];
    for (const p of rows) {
      const { reminders } = await listToday(p);
      const stats = await adherence(p, 7);
      patients.push({
        linkId: p.link_id,
        id: p.id,
        name: p.name,
        email: p.email,
        phone: p.phone || '',
        timezone: p.timezone,
        today: {
          total: reminders.length,
          taken: reminders.filter((r) => r.status === 'Taken').length,
          missed: reminders.filter((r) => r.status === 'Missed').length,
          pending: reminders.filter((r) => ['Pending', 'Snoozed'].includes(r.status)).length,
        },
        adherence7d: stats.adherence,
        streak: stats.streak,
        nextDose: reminders.find((r) => ['Pending', 'Snoozed'].includes(r.status)) || null,
      });
    }
    res.json({ patients });
  })
);

// GET /api/caregivers/patients/:id -> full read-only view of one patient
router.get(
  '/patients/:id',
  wrap(async (req, res) => {
    const pid = Number(req.params.id);
    if (pid === req.user.id) throw bad('Use your own dashboard for your own data');
    await assertCanViewPatient(req.user, pid);
    const p = await db.one('users', { id: pid });
    if (!p) throw notFound('Patient not found');
    const meds = await db.find(
      'medicines',
      { user_id: pid, is_active: true, deleted_at: null },
      { sort: { name: 1 }, projection: { name: 1, dosage: 1, schedule: 1 } }
    );
    const today = await listToday(p);
    res.json({
      patient: {
        id: p.id,
        name: p.name,
        phone: p.phone || '',
        emergencyContact: { name: p.emergency_name || '', phone: p.emergency_phone || '', email: p.emergency_email || '' },
      },
      medicines: meds.map((m) => ({ name: m.name, dosage: m.dosage, schedule: m.schedule })),
      today: today.reminders,
      analytics: await adherence(p, 30),
    });
  })
);

// DELETE /api/caregivers/:linkId  (either side can remove the link)
router.delete(
  '/:linkId',
  wrap(async (req, res) => {
    const row = await db.one('caregivers', { id: Number(req.params.linkId) });
    if (!row) throw notFound('Link not found');
    if (row.user_id !== req.user.id && row.caregiver_user_id !== req.user.id) throw forbidden();
    await db.remove('caregivers', { id: row.id });
    res.json({ ok: true });
  })
);

module.exports = router;
