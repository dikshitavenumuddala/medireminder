const path = require('path');
const express = require('express');
const cors = require('cors');
const config = require('./config');
const db = require('./db');
const scheduler = require('./services/scheduler');
const { HttpError } = require('./utils/errors');

const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '100kb' }));

// small security headers without extra dependencies
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

// ---- API ----
app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/medicines', require('./routes/medicines'));
app.use('/api/reminders', require('./routes/reminders'));
app.use('/api/history', require('./routes/history'));
app.use('/api/caregivers', require('./routes/caregivers'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API route' }));

// ---- Frontend (static) ----
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

// ---- errors ----
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
});

async function main() {
  try {
    await db.init();
  } catch (e) {
    console.error('\n❌ Could not connect to MongoDB:', e.message);
    console.error('   Check MONGODB_URI in your .env file and that MongoDB is running.\n');
    process.exit(1);
  }
  const server = app.listen(config.port, () => {
    console.log(`\n💊 MediReminder running at http://localhost:${config.port}\n`);
  });
  scheduler.start();

  const shutdown = () => {
    scheduler.stop();
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) main();
module.exports = app;
