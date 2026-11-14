require('dotenv').config();

const num = (v, d) => (v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d);

function validateProductionConfig(env = process.env) {
  const isProduction = env.NODE_ENV === 'production'
    || (env.VERCEL === '1' && env.VERCEL_ENV === 'production');
  if (!isProduction) return;

  const errors = [];
  const jwtSecret = env.JWT_SECRET || '';
  const cronSecret = env.CRON_SECRET || '';
  const mongoUri = env.MONGODB_URI || '';

  if (jwtSecret.length < 32) errors.push('JWT_SECRET must be at least 32 characters');
  if (cronSecret.length < 32) errors.push('CRON_SECRET must be at least 32 characters');
  if (jwtSecret && jwtSecret === cronSecret) errors.push('JWT_SECRET and CRON_SECRET must be different');
  if (!mongoUri) {
    errors.push('MONGODB_URI must be set');
  } else if (env.VERCEL === '1') {
    try {
      const hostname = new URL(mongoUri).hostname.replace(/^\[|\]$/g, '').toLowerCase();
      if (['localhost', '127.0.0.1', '::1'].includes(hostname)) {
        errors.push('MONGODB_URI cannot use localhost on Vercel; configure an externally reachable database or secure tunnel');
      }
    } catch {
      errors.push('MONGODB_URI must be a valid MongoDB connection URI');
    }
  }

  if (errors.length) {
    throw new Error(`Invalid production configuration: ${errors.join('; ')}`);
  }
}

validateProductionConfig();

module.exports = {
  port: num(process.env.PORT, 3000),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  mongo: {
    uri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017',
    database: process.env.MONGODB_DB || 'medireminder',
  },
  cronSecret: process.env.CRON_SECRET || '',
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
  validateProductionConfig,
};
