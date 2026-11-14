/* Dependency-free tests for the scheduling maths:  npm test */
const assert = require('assert');
const { zonedToUtc, localDateStr, localTimeStr, addDays, daysBetween, dayOfWeek, toDb, toIso, isValidTimezone } = require('../utils/time');
const { appliesOn, occurrencesOn, validateMedicine } = require('../utils/schedule');
const { validateProductionConfig } = require('../config');

let passed = 0;
const test = (name, fn) => {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
};

console.log('time utils');
test('India (UTC+5:30) 08:00 -> 02:30Z', () => {
  assert.strictEqual(zonedToUtc('2026-11-14', '08:00', 'Asia/Kolkata').toISOString(), '2026-11-14T02:30:00.000Z');
});
test('New York winter (UTC-5) 08:00 -> 13:00Z', () => {
  assert.strictEqual(zonedToUtc('2026-01-15', '08:00', 'America/New_York').toISOString(), '2026-01-15T13:00:00.000Z');
});
test('New York summer (UTC-4, DST) 08:00 -> 12:00Z', () => {
  assert.strictEqual(zonedToUtc('2026-07-15', '08:00', 'America/New_York').toISOString(), '2026-07-15T12:00:00.000Z');
});
test('local date rolls over correctly (23:30 UTC = next day in India)', () => {
  assert.strictEqual(localDateStr(new Date('2026-11-14T23:30:00Z'), 'Asia/Kolkata'), '2026-11-15');
  assert.strictEqual(localTimeStr(new Date('2026-11-14T23:30:00Z'), 'Asia/Kolkata'), '05:00');
});
test('midnight in a UTC+ zone does not show hour 24', () => {
  assert.strictEqual(localTimeStr(new Date('2026-11-14T18:30:00Z'), 'Asia/Kolkata'), '00:00');
});
test('addDays / daysBetween / dayOfWeek', () => {
  assert.strictEqual(addDays('2026-02-27', 3), '2026-03-02');
  assert.strictEqual(daysBetween('2026-11-01', '2026-11-14'), 13);
  assert.strictEqual(dayOfWeek('2026-11-15'), 0); // Sunday
});
test('DB / ISO round-trip', () => {
  const d = new Date('2026-11-14T02:30:00Z');
  assert.strictEqual(toDb(d), '2026-11-14 02:30:00');
  assert.strictEqual(toIso('2026-11-14 02:30:00'), '2026-11-14T02:30:00.000Z'.replace('.000', ''));
});
test('timezone validation', () => {
  assert.ok(isValidTimezone('Asia/Kolkata'));
  assert.ok(!isValidTimezone('Mars/Olympus'));
});

console.log('repeat patterns');
const base = { startDate: '2026-11-01', endDate: null, schedule: ['08:00', '20:00'] };
test('daily', () => {
  const m = { ...base, repeatPattern: { type: 'daily' } };
  assert.ok(appliesOn(m, '2026-11-01') && appliesOn(m, '2026-12-25'));
  assert.ok(!appliesOn(m, '2026-10-31'));
});
test('alternate days', () => {
  const m = { ...base, repeatPattern: { type: 'alternate' } };
  assert.ok(appliesOn(m, '2026-11-01') && !appliesOn(m, '2026-11-02') && appliesOn(m, '2026-11-03'));
});
test('every 3 days', () => {
  const m = { ...base, repeatPattern: { type: 'interval', interval: 3 } };
  assert.deepStrictEqual(['2026-11-01', '2026-11-02', '2026-11-04', '2026-11-05'].map((d) => appliesOn(m, d)), [true, false, true, false]);
});
test('specific weekdays (Mon/Wed/Fri)', () => {
  const m = { ...base, repeatPattern: { type: 'weekdays', days: [1, 3, 5] } };
  assert.ok(appliesOn(m, '2026-11-02')); // Monday
  assert.ok(!appliesOn(m, '2026-11-03')); // Tuesday
});
test('end date is inclusive', () => {
  const m = { ...base, endDate: '2026-11-05', repeatPattern: { type: 'daily' } };
  assert.ok(appliesOn(m, '2026-11-05') && !appliesOn(m, '2026-11-06'));
});
test('occurrences are returned in UTC', () => {
  const m = { ...base, repeatPattern: { type: 'daily' } };
  const o = occurrencesOn(m, '2026-11-14', 'Asia/Kolkata').map((d) => d.toISOString());
  assert.deepStrictEqual(o, ['2026-11-14T02:30:00.000Z', '2026-11-14T14:30:00.000Z']);
});

console.log('validation');
test('accepts a valid medicine and sorts/dedupes times', () => {
  const v = validateMedicine({ name: ' Aspirin ', dosage: '75 mg', schedule: ['20:00', '08:00', '08:00'], startDate: '2026-11-14', repeatPattern: { type: 'daily' } });
  assert.deepStrictEqual(v.schedule, ['08:00', '20:00']);
  assert.strictEqual(v.name, 'Aspirin');
});
test('rejects bad input', () => {
  const bad = (b) => assert.throws(() => validateMedicine({ name: 'X', dosage: '1', schedule: ['08:00'], startDate: '2026-11-14', repeatPattern: { type: 'daily' }, ...b }));
  bad({ name: '' });
  bad({ schedule: [] });
  bad({ schedule: ['25:00'] });
  bad({ startDate: '14-11-2026' });
  bad({ endDate: '2026-11-01' });
  bad({ repeatPattern: { type: 'weekdays', days: [] } });
  bad({ repeatPattern: { type: 'interval', interval: 1 } });
  bad({ color: 'red' });
});

console.log('production configuration');
test('requires separate strong secrets and a MongoDB URI in production', () => {
  const production = {
    NODE_ENV: 'production',
    VERCEL: '1',
    JWT_SECRET: 'a'.repeat(32),
    CRON_SECRET: 'b'.repeat(32),
    MONGODB_URI: 'mongodb+srv://example.invalid/medireminder',
  };
  assert.doesNotThrow(() => validateProductionConfig(production));
  assert.throws(() => validateProductionConfig({ ...production, JWT_SECRET: 'short' }), /JWT_SECRET/);
  assert.throws(() => validateProductionConfig({ ...production, CRON_SECRET: production.JWT_SECRET }), /must be different/);
  assert.throws(() => validateProductionConfig({ ...production, MONGODB_URI: '' }), /MONGODB_URI/);
  assert.throws(() => validateProductionConfig({ ...production, MONGODB_URI: 'mongodb://localhost:27017' }), /cannot use localhost on Vercel/);
  assert.throws(() => validateProductionConfig({ ...production, MONGODB_URI: 'not-a-mongodb-uri' }), /valid MongoDB connection URI/);
});

console.log(`\n${passed} tests passed`);
