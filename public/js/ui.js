/* Shared UI helpers: icons, escaping, formatting, toast, modal */
window.MR = window.MR || { state: { user: null, today: null, notifications: [], unread: 0, clockOffset: 0 } };

(function () {
  const ICONS = {
    home: '<path d="M3 11l9-8 9 8v10a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z"/>',
    pill: '<path d="M10.5 20.5a5 5 0 0 1-7-7l10-10a5 5 0 0 1 7 7z"/><path d="M8.5 8.5l7 7"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>',
    sos: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    pause: '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>',
    play: '<path d="M5 3l14 9-14 9z"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 6L2 7"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.4 1.5-3.5.3 1 .8 2 1 3z"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
    refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
    chevron: '<path d="M6 9l6 6 6-6"/>',
  };

  const icon = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const tz = () => (MR.state.user && MR.state.user.timezone) || Intl.DateTimeFormat().resolvedOptions().timeZone;

  /** current time corrected by the offset between server and browser clocks */
  const now = () => new Date(Date.now() + MR.state.clockOffset);

  const fmtTime = (iso) =>
    new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: tz() });
  const fmtDate = (iso, opts) =>
    new Date(iso).toLocaleDateString([], opts || { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz() });
  const fmtDateTime = (iso) => `${fmtDate(iso, { day: 'numeric', month: 'short', timeZone: tz() })}, ${fmtTime(iso)}`;
  /** "YYYY-MM-DD" for a Date in the user's timezone */
  const dateKey = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: tz(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const addDays = (key, n) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
  };
  const hhmmTo12 = (t) => {
    const [h, m] = t.split(':').map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  };
  const initials = (name) => (name || '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  function relative(iso) {
    const diff = new Date(iso) - now();
    const mins = Math.round(diff / 60000);
    const abs = Math.abs(mins);
    const txt = abs < 60 ? `${abs} min` : abs < 1440 ? `${Math.floor(abs / 60)}h ${abs % 60 ? (abs % 60) + 'm' : ''}`.trim() : `${Math.round(abs / 1440)}d`;
    if (abs < 1) return 'now';
    return mins > 0 ? `in ${txt}` : `${txt} ago`;
  }

  /* ---------- toast ---------- */
  function toast(title, message = '', kind = 'info') {
    const root = $('#toasts');
    const div = document.createElement('div');
    div.className = `toast ${kind}`;
    const ic = kind === 'ok' ? 'check' : kind === 'err' ? 'alert' : 'bell';
    div.innerHTML = `${icon(kind === 'err' ? 'sos' : ic)}<div><b>${esc(title)}</b>${message ? `<span>${esc(message)}</span>` : ''}</div>`;
    root.appendChild(div);
    setTimeout(() => div.remove(), kind === 'err' ? 6000 : 4200);
  }

  /* ---------- modal ---------- */
  let closeFns = [];
  function modal({ title, body, footer, small = false, className = '', onClose, raw = false }) {
    const root = $('#modal-root');
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `<div class="modal ${small ? 'sm' : ''} ${className}" role="dialog" aria-modal="true">${
      raw
        ? body
        : `<div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
           <div class="modal-body">${body}</div>${footer ? `<div class="modal-foot">${footer}</div>` : ''}`
    }</div>`;
    root.appendChild(overlay);
    const close = () => {
      overlay.remove();
      closeFns = closeFns.filter((f) => f !== close);
      if (onClose) onClose();
    };
    closeFns.push(close);
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) close();
    });
    $$('[data-close]', overlay).forEach((b) => b.addEventListener('click', close));
    const first = $('input, select, textarea', overlay);
    if (first && !raw) setTimeout(() => first.focus(), 30);
    return { el: overlay, close, $: (s) => $(s, overlay), $$: (s) => $$(s, overlay) };
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && closeFns.length) closeFns[closeFns.length - 1]();
  });

  function confirmDialog({ title, message, confirmText = 'Confirm', danger = false }) {
    return new Promise((resolve) => {
      let answered = false;
      const m = modal({
        title,
        small: true,
        body: `<p class="muted">${esc(message)}</p>`,
        footer: `<button class="btn" data-close>Cancel</button><button class="btn ${danger ? 'danger solid' : 'primary'}" data-ok>${esc(confirmText)}</button>`,
        onClose: () => !answered && resolve(false),
      });
      m.$('[data-ok]').addEventListener('click', () => {
        answered = true;
        m.close();
        resolve(true);
      });
    });
  }

  /* ---------- alert sound (no audio file needed) ---------- */
  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.22, 0.44].forEach((t, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = i === 2 ? 1046 : 784;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.2);
        o.connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + t);
        o.stop(ctx.currentTime + t + 0.22);
      });
    } catch (_) {
      /* audio blocked until the user interacts with the page */
    }
  }

  const STATUS = {
    Taken: { cls: 'ok', label: 'Taken' },
    Missed: { cls: 'danger', label: 'Missed' },
    Pending: { cls: 'primary', label: 'Upcoming' },
    Snoozed: { cls: 'warn', label: 'Snoozed' },
    Dismissed: { cls: '', label: 'Dismissed' },
  };

  Object.assign(MR, { icon, esc, $, $$, tz, now, fmtTime, fmtDate, fmtDateTime, dateKey, addDays, hhmmTo12, initials, plural, relative, toast, modal, confirmDialog, beep, STATUS });
})();
