(function () {
  const { $, $$, toast } = MR;
  const status = { morning: 'Taken', afternoon: 'Pending', evening: 'Pending' };
  const times = { morning: '8:00 AM', afternoon: '1:00 PM', evening: '8:00 PM' };
  const names = { morning: 'Vitamin D', afternoon: 'Metformin', evening: 'Omega 3' };
  const title = $('#page-title');
  const date = $('#demo-date');

  date.textContent = new Date().toLocaleDateString([], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  function setTab(name) {
    const active = ['overview', 'medicines', 'history', 'caregivers'].includes(name) ? name : 'overview';
    const label = active === 'medicines' ? 'Medicines' : active[0].toUpperCase() + active.slice(1);
    title.textContent = label;
    $$('.demo-panel').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === active));
    $$('[data-tab]').forEach((link) => link.classList.toggle('active', link.dataset.tab === active));
  }

  function renderDoses() {
    const completed = Object.values(status).filter((value) => value === 'Taken').length;
    const total = Object.keys(status).length;
    $('#dose-count').textContent = `${completed}/${total}`;
    $('#dose-summary').textContent = `${total - completed} ${total - completed === 1 ? 'dose' : 'doses'} left today.`;
    $('.demo-ring-value').style.strokeDashoffset = String(358.14 * (1 - completed / total));
    $('.ring').setAttribute('aria-label', `${completed} of ${total} doses taken`);
    const nextDose = Object.keys(status).find((id) => status[id] === 'Pending' || status[id] === 'Snoozed');
    $('.demo-hero-copy .next').textContent = nextDose
      ? `Next up: ${names[nextDose]} at ${times[nextDose]}`
      : 'All sample doses completed for today.';

    Object.entries(status).forEach(([id, value]) => {
      const row = $(`[data-dose="${id}"]`);
      const chip = $('[data-dose-status]', row);
      const controls = $('.demo-dose-controls', row);
      const snoozed = value === 'Snoozed';
      chip.textContent = value === 'Taken' ? 'Taken' : snoozed ? 'Snoozed' : id === 'afternoon' ? 'Due soon' : 'Upcoming';
      chip.className = `chip ${value === 'Taken' ? 'ok' : snoozed ? 'warn' : id === 'afternoon' ? 'primary' : ''}`;
      row.classList.toggle('done', value === 'Taken');
      row.classList.toggle('due', value === 'Pending' && id === 'afternoon');
      controls.querySelectorAll('[data-dose-action]').forEach((button) => button.remove());
      if (value !== 'Taken') {
        const take = document.createElement('button');
        take.className = 'btn ok sm';
        take.type = 'button';
        take.dataset.doseAction = 'taken';
        take.textContent = 'Mark taken';
        const snooze = document.createElement('button');
        snooze.className = 'btn sm';
        snooze.type = 'button';
        snooze.dataset.doseAction = 'snooze';
        snooze.textContent = snoozed ? 'Snoozed 10 min' : 'Snooze';
        controls.append(take, snooze);
      }
    });
  }

  function applyTheme() {
    const theme = localStorage.getItem('mr_theme');
    if (theme === 'dark') document.documentElement.dataset.theme = 'dark';
    $('#theme-toggle').textContent = document.documentElement.dataset.theme === 'dark' ? 'Light' : 'Dark';
  }

  document.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-tab], [data-open-tab]');
    if (tab) {
      const name = tab.dataset.tab || tab.dataset.openTab;
      location.hash = name;
      setTab(name);
      return;
    }

    const action = event.target.closest('[data-dose-action]');
    if (action) {
      const row = action.closest('[data-dose]');
      const id = row.dataset.dose;
      status[id] = action.dataset.doseAction === 'snooze' ? 'Snoozed' : 'Taken';
      renderDoses();
      toast(status[id] === 'Taken' ? 'Marked as taken' : 'Reminder snoozed', 'Demo changes are not saved.', 'ok');
    }
  });

  window.addEventListener('hashchange', () => setTab(location.hash.slice(1)));
  $('#theme-toggle').addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme !== 'dark';
    if (dark) document.documentElement.dataset.theme = 'dark';
    else delete document.documentElement.dataset.theme;
    localStorage.setItem('mr_theme', dark ? 'dark' : 'light');
    applyTheme();
  });

  applyTheme();
  setTab(location.hash.slice(1));
  renderDoses();
})();
