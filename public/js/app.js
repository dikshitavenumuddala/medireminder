/* App shell: authentication, layout, routing, polling, due-dose alerts, SOS */
(function () {
  const { icon, esc, $, $$, toast, modal, initials, fmtTime, now } = MR;

  const ROUTES = {
    dashboard: { title: 'Dashboard', icon: 'home', sub: () => MR.fmtDate(new Date().toISOString(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: MR.tz() }) },
    medicines: { title: 'My Medicines', icon: 'pill', sub: () => 'Add, edit or pause your medicines' },
    history: { title: 'History & Insights', icon: 'chart', sub: () => 'Understand your adherence' },
    caregivers: { title: 'Caregivers', icon: 'users', sub: () => 'Share progress with people who care' },
    profile: { title: 'Profile & Settings', icon: 'user', sub: () => 'Your account, timezone and emergency contact' },
  };

  document.addEventListener('click', (e) => { if (!e.target.closest('.dropdown')) $('#bell-panel')?.classList.add('hidden'); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && MR.state.user) { MR.pollNotifications(); pollToday(); } });

  let lastNotifId = 0;
  let pollTimers = [];
  let alertQueue = [];
  let alertOpen = false;
  const alerted = new Set();

  /* ======================= Auth screen ======================= */
  function showAuth(mode = 'login') {
    $('#app').classList.add('hidden');
    const root = $('#auth');
    root.classList.remove('hidden');
    root.innerHTML = `
      <div class="auth-hero">
        <div class="brand"><span class="brand-mark">${icon('pill')}</span> MediReminder</div>
        <div>
          <h1>Never miss a dose again.</h1>
          <p class="lead">Schedule your medicines, get timely reminders, snooze when you need a minute, and share your progress with the people who care.</p>
          <div class="feature-list">
            <div class="feature">${icon('bell')}<div><b>Smart reminders</b><span>In-app pop-ups, sound and e-mail alerts</span></div></div>
            <div class="feature">${icon('chart')}<div><b>Adherence insights</b><span>Streaks, calendar heat-map and detailed history</span></div></div>
            <div class="feature">${icon('users')}<div><b>Caregiver access</b><span>Family is alerted when a dose is missed</span></div></div>
          </div>
        </div>
        <p class="small" style="opacity:.8">Your health data stays private to you and the caregivers you invite.</p>
      </div>
      <div class="auth-form-wrap"><div class="auth-form">
        <div class="brand mb" style="color:var(--text)"><span class="brand-mark">${icon('pill')}</span> MediReminder</div>
        <h2>${mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
        <p class="muted mb">${mode === 'login' ? 'Sign in to see today’s doses.' : 'It takes less than a minute.'}</p>
        <div id="auth-err"></div>
        <form id="auth-form" novalidate>
          ${mode === 'register' ? `
            <div class="field"><label>I am a…</label><div class="seg" id="role"><button type="button" data-role="user" class="on">Patient</button><button type="button" data-role="caregiver">Caregiver</button></div></div>
            <div class="field"><label>Full name</label><input class="input" id="a-name" autocomplete="name" placeholder="Asha Reddy" required/></div>` : ''}
          <div class="field"><label>Email</label><input class="input" id="a-email" type="email" autocomplete="email" placeholder="you@example.com" required/></div>
          ${mode === 'register' ? `<div class="field"><label>Phone (optional)</label><input class="input" id="a-phone" type="tel" autocomplete="tel" placeholder="+91 …"/></div>` : ''}
          <div class="field"><label>Password</label><input class="input" id="a-pass" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" placeholder="${mode === 'login' ? 'Your password' : 'At least 6 characters'}" required/></div>
          <button class="btn primary block" id="a-submit" type="submit">${mode === 'login' ? 'Sign in' : 'Create account'}</button>
        </form>
        <p class="small muted mt" style="text-align:center">${mode === 'login' ? 'New here?' : 'Already registered?'} <a href="#" id="switch" style="color:var(--primary);font-weight:700;text-decoration:none">${mode === 'login' ? 'Create an account' : 'Sign in'}</a></p>
        ${mode === 'login' ? `<div class="demo-box"><b>Demo accounts</b> (after <code>npm run seed</code>)<br/>
          Patient: <button type="button" data-demo="asha@demo.com">asha@demo.com</button> · Caregiver: <button type="button" data-demo="ravi@demo.com">ravi@demo.com</button><br/>Password: demo123</div>` : ''}
      </div></div>`;

    let role = 'user';
    $$('#role button', root).forEach((b) => b.addEventListener('click', () => { role = b.dataset.role; $$('#role button', root).forEach((x) => x.classList.toggle('on', x === b)); }));
    $$('[data-demo]', root).forEach((b) => b.addEventListener('click', () => { $('#a-email').value = b.dataset.demo; $('#a-pass').value = 'demo123'; }));
    $('#switch', root).addEventListener('click', (e) => { e.preventDefault(); showAuth(mode === 'login' ? 'register' : 'login'); });
    $('#auth-form', root).addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#a-submit');
      btn.disabled = true;
      $('#auth-err').innerHTML = '';
      try {
        const res = mode === 'login'
          ? await MR.api.login({ email: $('#a-email').value, password: $('#a-pass').value })
          : await MR.api.register({ name: $('#a-name').value, email: $('#a-email').value, phone: $('#a-phone').value, password: $('#a-pass').value, role, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
        MR.api.setToken(res.token);
        MR.state.user = res.user;
        location.hash = res.user.role === 'caregiver' ? '#/caregivers' : '#/dashboard';
        startApp();
      } catch (err) {
        $('#auth-err').innerHTML = `<div class="err">${esc(err.message)}</div>`;
        btn.disabled = false;
      }
    });
  }

  /* ======================= Shell ======================= */
  MR.renderShell = function () {
    const u = MR.state.user;
    const app = $('#app');
    const navItems = Object.entries(ROUTES).map(([k, r]) => `<a href="#/${k}" data-nav="${k}">${icon(r.icon)}<span>${r.title.replace('My ', '').replace(' & Insights', '').replace(' & Settings', '')}</span></a>`).join('');
    const bottom = Object.entries(ROUTES).map(([k, r]) => `<a href="#/${k}" data-nav="${k}">${icon(r.icon)}<span>${r.title.split(' ')[0].replace('My', 'Meds')}</span></a>`).join('');
    const keep = $('#view');
    app.innerHTML = `
      <aside class="sidebar">
        <div class="brand"><span class="brand-mark">${icon('pill')}</span> MediReminder</div>
        <nav class="nav">${navItems}</nav>
        <div class="sos"><button class="sos-btn" id="sos">${icon('sos')} Emergency alert</button></div>
      </aside>
      <div class="main">
        <header class="topbar">
          <div><h1 id="title"></h1><div class="date" id="subtitle"></div></div>
          <div class="top-actions">
            <button class="icon-btn" id="theme" title="Toggle dark mode">${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')}</button>
            <div class="dropdown">
              <button class="icon-btn" id="bell" aria-label="Notifications">${icon('bell')}<span class="dot hidden" id="bell-dot">0</span></button>
              <div class="panel hidden" id="bell-panel"></div>
            </div>
            <button class="avatar" id="avatar" title="${esc(u.name)}">${esc(initials(u.name))}</button>
          </div>
        </header>
        <main class="view" id="view"></main>
      </div>
      <nav class="bottom-nav">${bottom}</nav>`;
    if (keep) $('#view').replaceWith(keep);

    $('#theme').addEventListener('click', toggleTheme);
    $('#avatar').addEventListener('click', () => (location.hash = '#/profile'));
    $('#sos').addEventListener('click', openSos);
    $('#bell').addEventListener('click', toggleBell);
    updateBell();
    highlightNav();
  };

  function highlightNav() {
    const { name } = parseHash();
    $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === name));
  }
  MR.setTitle = (t, s) => { const a = $('#title'), b = $('#subtitle'); if (a) a.textContent = t; if (b) b.textContent = s || ''; };

  function toggleTheme() {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('mr_theme', next); } catch (_) {}
    $('#theme').innerHTML = icon(next === 'dark' ? 'sun' : 'moon');
  }

  /* ======================= Router ======================= */
  function parseHash() {
    const [name, param] = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('/');
    return { name: ROUTES[name] ? name : 'dashboard', param };
  }

  let rendering = 0;
  async function render() {
    if (!MR.state.user) return;
    const { name, param } = parseHash();
    highlightNav();
    const r = ROUTES[name];
    MR.setTitle(r.title, r.sub());
    const view = $('#view');
    const token = ++rendering;
    const y = window.scrollY;
    try {
      await MR.views[name](view, param);
    } catch (e) {
      if (token !== rendering) return;
      view.innerHTML = `<div class="card empty"><div class="big">⚠️</div><b>Something went wrong</b><p class="muted mt">${esc(e.message)}</p><button class="btn mt" id="retry">Try again</button></div>`;
      $('#retry').addEventListener('click', render);
    }
    if (token === rendering) window.scrollTo(0, y);
  }
  MR.refreshView = render;
  window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });

  /* ======================= Notifications ======================= */
  const NOTIF_ICON = { reminder: 'pill', missed: 'sos', 'caregiver-alert': 'users', caregiver: 'users', refill: 'info', emergency: 'sos', test: 'bell' };

  function updateBell() {
    const dot = $('#bell-dot');
    if (!dot) return;
    dot.textContent = MR.state.unread > 9 ? '9+' : MR.state.unread;
    dot.classList.toggle('hidden', !MR.state.unread);
  }

  MR.pollNotifications = async function () {
    try {
      const res = await MR.api.notifications(lastNotifId);
      const fresh = res.notifications.filter((n) => n.id > lastNotifId);
      const firstLoad = lastNotifId === 0;
      if (fresh.length) lastNotifId = Math.max(...fresh.map((n) => n.id));
      MR.state.unread = res.unread;
      updateBell();
      if (!firstLoad) {
        fresh.slice().reverse().forEach((n) => {
          toast(n.title, n.message, n.type === 'missed' || n.type === 'emergency' || n.type === 'caregiver-alert' ? 'err' : 'info');
          if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
            try { new Notification(n.title, { body: n.message }); } catch (_) {}
          }
        });
        if (fresh.length) MR.beep();
      }
    } catch (_) { /* ignore transient errors */ }
  };

  async function toggleBell(e) {
    e.stopPropagation();
    const panel = $('#bell-panel');
    if (!panel.classList.contains('hidden')) return panel.classList.add('hidden');
    panel.classList.remove('hidden');
    panel.innerHTML = '<div class="empty small">Loading…</div>';
    try {
      const res = await MR.api.notifications(0);
      panel.innerHTML = `<div class="panel-head"><b>Notifications</b><div class="row" style="gap:4px"><button class="btn ghost sm" id="mark-all">Mark all read</button><button class="btn ghost sm" id="clear-all">Clear</button></div></div>
        ${res.notifications.length ? res.notifications.map((n) => `<div class="notif ${n.isRead ? '' : 'unread'}"><div class="ico">${icon(NOTIF_ICON[n.type] || 'bell')}</div><div><b>${esc(n.title)}</b><span>${esc(n.message)}</span><span>${MR.fmtDateTime(n.createdAt)}</span></div></div>`).join('') : '<div class="empty small"><div class="big">🔔</div>You are all caught up.</div>'}`;
      $('#mark-all', panel)?.addEventListener('click', async (ev) => { ev.stopPropagation(); await MR.api.readAll(); MR.state.unread = 0; updateBell(); panel.querySelectorAll('.unread').forEach((n) => n.classList.remove('unread')); });
      $('#clear-all', panel)?.addEventListener('click', async (ev) => { ev.stopPropagation(); await MR.api.clearNotifications(); MR.state.unread = 0; updateBell(); panel.classList.add('hidden'); });
      panel.addEventListener('click', (ev) => ev.stopPropagation());
      if (res.unread) { MR.api.readAll().then(() => { MR.state.unread = 0; updateBell(); }); }
    } catch (err) { panel.innerHTML = `<div class="empty small">${esc(err.message)}</div>`; }
  }

  /* ======================= Due-dose alerts & live refresh ======================= */
  let lastSignature = '';
  async function pollToday() {
    try {
      const today = await MR.api.today();
      MR.state.today = today;
      MR.state.clockOffset = new Date(today.serverTime) - Date.now();
      const sig = today.reminders.map((r) => `${r.id}:${r.status}:${r.dueAt}`).join('|');
      const dueNow = today.reminders.filter((r) => r.status === 'Pending' && new Date(r.dueAt) <= now());
      // queue pop-ups for newly due doses
      dueNow.forEach((r) => {
        const key = `${r.id}:${r.snoozeCount}`;
        if (!alerted.has(key)) { alerted.add(key); alertQueue.push(r); }
      });
      showNextAlert();
      const changed = sig !== lastSignature;
      lastSignature = sig;
      if (changed && parseHash().name === 'dashboard' && !$('.overlay') && !$('.snooze-menu')) render();
    } catch (_) { /* ignore */ }
  }

  function showNextAlert() {
    if (alertOpen || !alertQueue.length) return;
    const r = alertQueue.shift();
    alertOpen = true;
    MR.beep();
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      try { new Notification(`Time to take ${r.name}`, { body: r.dosage }); } catch (_) {}
    }
    const m = modal({
      raw: true,
      className: 'sm',
      body: `<div class="alert-modal">
        <div class="alert-pill" style="background:${esc(r.color)}">${icon('pill').replace('class="i ', 'style="width:40px;height:40px" class="i ')}</div>
        <span class="chip primary">${icon('clock')} Scheduled ${fmtTime(r.scheduledTime)}</span>
        <h3 style="margin-top:12px">Time to take ${esc(r.name)}</h3>
        <p class="muted mt">${esc(r.dosage)}${r.notes ? ' · ' + esc(r.notes) : ''}</p>
        <div class="alert-actions">
          <button class="btn ok" data-a="take">${icon('check')} I took it</button>
          <div class="grid2"><button class="btn" data-a="snooze10">${icon('clock')} Snooze 10 min</button><button class="btn" data-a="snooze30">${icon('clock')} Snooze 30 min</button></div>
          <button class="btn ghost" data-a="dismiss">Dismiss</button>
        </div></div>`,
      onClose: () => { alertOpen = false; setTimeout(showNextAlert, 300); },
    });
    const act = async (fn, msg) => {
      try { await fn(); toast(msg, '', 'ok'); m.close(); lastSignature = ''; await pollToday(); if (parseHash().name !== 'dashboard') return; } catch (e) { toast('Could not update', e.message, 'err'); }
    };
    m.$('[data-a=take]').addEventListener('click', () => act(() => MR.api.mark(r.id, 'Taken'), 'Marked as taken'));
    m.$('[data-a=snooze10]').addEventListener('click', () => act(() => MR.api.snooze(r.id, 10), 'Snoozed for 10 minutes'));
    m.$('[data-a=snooze30]').addEventListener('click', () => act(() => MR.api.snooze(r.id, 30), 'Snoozed for 30 minutes'));
    m.$('[data-a=dismiss]').addEventListener('click', () => act(() => MR.api.mark(r.id, 'Dismissed'), 'Reminder dismissed'));
  }

  /* ======================= SOS ======================= */
  function openSos() {
    const ec = MR.state.user.emergencyContact;
    const m = modal({
      title: 'Send emergency alert',
      small: true,
      body: `<p class="muted mb">This immediately notifies your caregivers${ec.email ? ` and ${esc(ec.name || ec.email)}` : ''}.${!ec.email ? ' <b>Tip:</b> add an emergency contact in your profile.' : ''}</p>
        <div class="field"><label>Message (optional)</label><textarea class="textarea" id="sos-msg" placeholder="e.g. I feel dizzy after taking my medicine"></textarea></div>`,
      footer: `<button class="btn" data-close>Cancel</button><button class="btn danger solid" id="sos-send">${icon('sos')} Send alert</button>`,
    });
    m.$('#sos-send').addEventListener('click', async () => {
      try {
        const r = await MR.api.emergency(m.$('#sos-msg').value);
        m.close();
        toast('Emergency alert sent', r.notified.length ? `Notified: ${r.notified.join(', ')}` : 'No caregivers or emergency contact are set up yet.', r.notified.length ? 'ok' : 'err');
        if (r.emergencyPhone) toast('Call emergency contact', r.emergencyPhone, 'info');
      } catch (e) { toast('Could not send', e.message, 'err'); }
    });
  }

  /* ======================= Boot ======================= */
  function startApp() {
    $('#auth').classList.add('hidden');
    $('#app').classList.remove('hidden');
    MR.renderShell();
    lastNotifId = 0;
    lastSignature = '';
    alerted.clear();
    pollTimers.forEach(clearInterval);
    MR.pollNotifications();
    pollToday();
    pollTimers = [setInterval(MR.pollNotifications, 15000), setInterval(pollToday, 30000)];
    render();
  }

  MR.logout = function () {
    MR.api.clearToken();
    MR.state.user = null;
    pollTimers.forEach(clearInterval);
    location.hash = '';
    showAuth('login');
  };
  MR.onSessionExpired = () => { MR.state.user = null; pollTimers.forEach(clearInterval); showAuth('login'); toast('Session expired', 'Please sign in again.', 'info'); };

  (async function boot() {
    try { const t = localStorage.getItem('mr_theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); document.documentElement.dataset.theme = t; } catch (_) {}
    if (!MR.api.hasToken()) return showAuth('login');
    try {
      const { user } = await MR.api.me();
      MR.state.user = user;
      if (!location.hash && user.role === 'caregiver') location.hash = '#/caregivers';
      startApp();
    } catch (_) { MR.api.clearToken(); showAuth('login'); }
  })();
})();
