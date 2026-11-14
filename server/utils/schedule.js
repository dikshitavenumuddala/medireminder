const { bad } = require('./errors');
const { zonedToUtc, daysBetween, dayOfWeek, isDateStr, isTimeStr } = require('./time');

const PATTERN_TYPES = ['daily', 'alternate', 'interval', 'weekdays'];

function parseJson(v, fallback) {
  if (v === null || v === undefined) return fallback;
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

/** DB row -> API object */
function mapMedicine(row) {
  return {
    id: row.id,
    name: row.name,
    dosage: row.dosage,
    schedule: parseJson(row.schedule, []),
    startDate: row.start_date,
    endDate: row.end_date || null,
    repeatPattern: parseJson(row.repeat_pattern, { type: 'daily' }),
    notes: row.notes || '',
    color: row.color,
    stock: row.stock === null ? null : Number(row.stock),
    refillThreshold: row.refill_threshold === null ? null : Number(row.refill_threshold),
    isActive: !!row.is_active,
  };
}

/** Does this medicine have doses on local calendar date `dateStr`? */
function appliesOn(med, dateStr) {
  if (dateStr < med.startDate) return false;
  if (med.endDate && dateStr > med.endDate) return false;
  const p = med.repeatPattern || { type: 'daily' };
  const diff = daysBetween(med.startDate, dateStr);
  switch (p.type) {
    case 'alternate':
      return diff % 2 === 0;
    case 'interval':
      return diff % Math.max(2, Number(p.interval) || 2) === 0;
    case 'weekdays':
      return (p.days || []).includes(dayOfWeek(dateStr));
    case 'daily':
    default:
      return true;
  }
}

/** UTC Dates of every dose on `dateStr` for a user in timezone `tz`. */
function occurrencesOn(med, dateStr, tz) {
  if (!appliesOn(med, dateStr)) return [];
  return (med.schedule || []).map((t) => zonedToUtc(dateStr, t, tz));
}

/** Validate + normalise a medicine payload from the client. */
function validateMedicine(body, { partial = false } = {}) {
  const out = {};
  const has = (k) => body[k] !== undefined;

  if (!partial || has('name')) {
    const name = String(body.name || '').trim();
    if (!name) throw bad('Medicine name is required');
    if (name.length > 120) throw bad('Medicine name is too long');
    out.name = name;
  }
  if (!partial || has('dosage')) {
    const dosage = String(body.dosage || '').trim();
    if (!dosage) throw bad('Dosage is required (e.g. "500 mg" or "1 tablet")');
    if (dosage.length > 120) throw bad('Dosage is too long');
    out.dosage = dosage;
  }
  if (!partial || has('schedule')) {
    const raw = Array.isArray(body.schedule) ? body.schedule : [];
    const times = [...new Set(raw.map(String))];
    if (!times.length) throw bad('Add at least one reminder time');
    if (times.length > 12) throw bad('A maximum of 12 times per day is supported');
    if (!times.every(isTimeStr)) throw bad('Times must be in 24h HH:MM format');
    out.schedule = times.sort();
  }
  if (!partial || has('startDate')) {
    if (!isDateStr(body.startDate)) throw bad('Start date must be YYYY-MM-DD');
    out.startDate = body.startDate;
  }
  if (has('endDate')) {
    if (body.endDate === null || body.endDate === '') out.endDate = null;
    else if (!isDateStr(body.endDate)) throw bad('End date must be YYYY-MM-DD');
    else out.endDate = body.endDate;
  } else if (!partial) {
    out.endDate = null;
  }
  if (out.startDate && out.endDate && out.endDate < out.startDate) {
    throw bad('End date cannot be before the start date');
  }
  if (!partial || has('repeatPattern')) {
    const p = body.repeatPattern || { type: 'daily' };
    if (!PATTERN_TYPES.includes(p.type)) throw bad('Unknown repeat pattern');
    const clean = { type: p.type };
    if (p.type === 'weekdays') {
      const days = [...new Set((p.days || []).map(Number))].filter((d) => d >= 0 && d <= 6).sort();
      if (!days.length) throw bad('Pick at least one weekday');
      clean.days = days;
    }
    if (p.type === 'interval') {
      const n = Number(p.interval);
      if (!Number.isInteger(n) || n < 2 || n > 30) throw bad('Interval must be between 2 and 30 days');
      clean.interval = n;
    }
    out.repeatPattern = clean;
  }
  if (has('notes')) out.notes = String(body.notes || '').slice(0, 1000);
  if (has('color')) {
    if (!/^#[0-9a-fA-F]{6}$/.test(String(body.color))) throw bad('Color must be a hex value like #6366f1');
    out.color = body.color;
  }
  for (const [key, label] of [
    ['stock', 'Stock'],
    ['refillThreshold', 'Refill threshold'],
  ]) {
    if (has(key)) {
      if (body[key] === null || body[key] === '') out[key] = null;
      else {
        const n = Number(body[key]);
        if (!Number.isInteger(n) || n < 0 || n > 100000) throw bad(`${label} must be a whole number`);
        out[key] = n;
      }
    }
  }
  if (has('isActive')) out.isActive = !!body.isActive;
  return out;
}

module.exports = { mapMedicine, appliesOn, occurrencesOn, validateMedicine, parseJson, PATTERN_TYPES };
