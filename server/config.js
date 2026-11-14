require('dotenv').config();

const num = (v, d) => (v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d);

module.exports = {
  port: num(process.env.PORT, 3000),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  mongo: {
    uri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017',
    database: process.env.MONGODB_DB || 'medireminder',
  },
  scheduler: {
    intervalSec: num(process.env.SCHEDULER_INTERVAL_SEC, 30),
    missedAfterMin: num(process.env.MISSED_AFTER_MIN, 60),
  },
  mail: {
    host: process.env.SMTP_HOST || '',
    port: num(process.env.SMTP_PORT, 587),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'MediReminder <no-reply@medireminder.local>',
  },
  maxSnoozes: 5,
};
