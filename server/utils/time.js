/**
 * Timezone helpers built on Intl only (no extra dependency).
 * Convention used across the app:
 *   - persisted timestamps = UTC        ("YYYY-MM-DD HH:MM:SS")
 *   - API responses    = ISO-8601 UTC   ("2026-11-14T08:00:00.000Z")
 *   - DATE columns / schedule times = the user's LOCAL calendar date / wall-clock time
 */

const dtfCache = new Map();

function formatter(tz) {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    dtfCache.set(tz, f);
  }
  return f;
}

function parts(ts, tz) {
  const o = {};
  for (const p of formatter(tz).formatToParts(new Date(ts))) o[p.type] = p.value;
  return o;
}

/** offset (ms) of `tz` from UTC at instant `ts` — positive east of Greenwich. */
function tzOffsetMs(ts, tz) {
  const o = parts(ts, tz);
  const asUtc = Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour % 24, +o.minute, +o.second);
  return asUtc - Math.floor(ts / 1000) * 1000;
}

/** Convert a local wall-clock date+time in `tz` to a UTC Date. Handles DST shifts. */
function zonedToUtc(dateStr, timeStr, tz) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const off1 = tzOffsetMs(guess, tz);
  let utc = guess - off1;
  const off2 = tzOffsetMs(utc, tz);
  if (off2 !== off1) utc = guess - off2;
  return new Date(utc);
}

/** "YYYY-MM-DD" of `date` as seen in `tz`. */
function localDateStr(date, tz) {
  const o = parts(date instanceof Date ? date.getTime() : date, tz);
  return `${o.year}-${o.month}-${o.day}`;
}

/** "HH:MM" of `date` as seen in `tz`. */
function localTimeStr(date, tz) {
  const o = parts(date instanceof Date ? date.getTime() : date, tz);
  return `${String(+o.hour % 24).padStart(2, '0')}:${o.minute}`;
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

/** 0 = Sunday … 6 = Saturday for a "YYYY-MM-DD" calendar date. */
function dayOfWeek(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

function isValidTimezone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Date -> lexically sortable "YYYY-MM-DD HH:MM:SS" (UTC) timestamp string. */
function toDb(date) {
  return (date instanceof Date ? date : new Date(date)).toISOString().slice(0, 19).replace('T', ' ');
}

/** UTC timestamp string or Date -> ISO string; null stays null. */
function toIso(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  const s = String(v);
  if (s.includes('T')) return s;
  return `${s.replace(' ', 'T')}Z`;
}

const isDateStr = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const isTimeStr = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

module.exports = {
  tzOffsetMs,
  zonedToUtc,
  localDateStr,
  localTimeStr,
  addDays,
  daysBetween,
  dayOfWeek,
  isValidTimezone,
  toDb,
  toIso,
  isDateStr,
  isTimeStr,
};
