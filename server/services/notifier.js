const db = require('../db');
const config = require('../config');
const { toDb } = require('../utils/time');

let transporter = null;
let mailMode = 'mock';

function getTransporter() {
  if (transporter || !config.mail.host) return transporter;
  try {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.secure,
      auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined,
    });
    mailMode = 'smtp';
  } catch (e) {
    console.warn('[mail] nodemailer unavailable, falling back to mock mode:', e.message);
  }
  return transporter;
}

/** Send an e-mail via SMTP, or print it (MOCK mode) when SMTP is not configured. */
async function sendEmail(to, subject, text) {
  if (!to) return false;
  const t = getTransporter();
  if (!t) {
    console.log(`\n[MOCK EMAIL] to=${to}\n  subject: ${subject}\n  ${text.replace(/\n/g, '\n  ')}\n`);
    return true;
  }
  try {
    const info = await t.sendMail({ from: config.mail.from, to, subject, text });
    console.log(`[mail:${mailMode}] sent to ${to} (${info.messageId})`);
    return true;
  } catch (e) {
    console.error('[mail] failed:', e.message);
    return false;
  }
}

/**
 * Store an in-app notification and (optionally) e-mail the same content.
 * @returns {Promise<number>} notification id
 */
async function notify({ userId, type, title, message, reminderId = null, email = false }) {
  const notification = await db.insert('notifications', {
    user_id: userId,
    type,
    title: String(title).slice(0, 160),
    message: String(message).slice(0, 500),
    reminder_id: reminderId,
    is_read: false,
    created_at: toDb(new Date()),
  });
  if (email) {
    const user = await db.one('users', { id: userId });
    if (user) sendEmail(user.email, `MediReminder: ${title}`, message).catch(() => {});
  }
  return notification.id;
}

module.exports = { notify, sendEmail };
