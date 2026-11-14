/* Dashboard: today's timeline, progress ring, stats, upcoming doses, adherence chart */
(function () {
  const { icon, esc, $, $$, fmtTime, fmtDate, relative, toast, now, plural, STATUS } = MR;

  const SNOOZE_OPTIONS = [5, 10, 15, 30, 60];

  /* ---- reusable pieces (also used by the caregiver patient view) ---- */
  MR.ring = function (done, total, size = 132, stroke = 11) {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const pct = total ? done / total : 0;
    return `<div class="ring" style="width:${size}px;height:${size}px">
      <svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="${stroke}"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#fff" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}" style="transition:stroke-dashoffset .6s"/></svg>
      <div class="center"><div><b>${done}/${total}</b><span>taken</span></div></div></div>`;
  };

  MR.barChart = function (daily, { labelEvery = 1 } = {}) {
    const max = Math.max(1, ...daily.map((d) => d.total));
    return `<div class="bars">${daily
      .map((d, i) => {
        const h = (n) => `${(n / max) * 100}%`;
        const label = new Date(`${d.date}T12:00:00Z`).toLocaleDateString([], { day: 'numeric', timeZone: 'UTC' });
        return `<div class="bar" title="${esc(d.date)} — ${d.taken}/${d.total} taken">
          <div class="col" style="height:${d.total ? Math.max(10, (d.total / max) * 100) : 6}%">
            <i class="t" style="height:${d.total ? (d.taken / d.total) * 100 : 0}%"></i>
            <i class="d" style="height:${d.total ? (d.dismissed / d.total) * 100 : 0}%"></i>
            <i class="m" style="height:${d.total ? (d.missed / d.total) * 100 : 0}%"></i>
          </div><small>${i % labelEvery === 0 ? label : '&nbsp;'}</small></div>`;
      })
      .join('')}</div>
      <div class="legend mt"><span><i style="background:var(--ok)"></i>Taken</span><span><i style="background:var(--warn)"></i>Dismissed</span><span><i style="background:var(--danger)"></i>Missed</span></div>`;
  };

  /** one row of the timeline; `readonly` is used in the caregiver view */
  MR.doseRow = function (r, { readonly = false } = {}) {
    const due = r.status === 'Pending' && new Date(r.dueAt) <= now();
    const st = STATUS[r.status];
    let chip = `<span class="chip ${st.cls}">${st.label}</span>`;
    if (due) chip = `<span class="chip primary">${icon('bell')} Due now</span>`;
    if (r.status === 'Snoozed') chip = `<span class="chip warn">${icon('clock')} until ${fmtTime(r.dueAt)}</span>`;
    if (r.status === 'Taken' && r.actionTime) chip = `<span class="chip ok">${icon('check')} Taken ${fmtTime(r.actionTime)}</span>`;

    let actions = '';
    if (!readonly) {
      if (r.status === 'Pending' || r.status === 'Snoozed') {
        actions = `
          <button class="btn ok sm" data-act="Taken" data-id="${r.id}">${icon('check')} Taken</button>
          <div class="snooze-wrap"><button class="btn sm" data-snooze-toggle="${r.id}">${icon('clock')} Snooze</button></div>
          <button class="btn ghost sm" data-act="Dismissed" data-id="${r.id}" title="Dismiss this reminder">Dismiss</button>
          <button class="btn ghost sm danger" data-act="Missed" data-id="${r.id}" title="Skip — mark as missed">Skip</button>`;
      } else if (r.status === 'Missed' || r.status === 'Dismissed') {
        actions = `<button class="btn sm" data-act="Taken" data-id="${r.id}">${icon('check')} I took it</button>`;
      }
    }
    return `<div class="dose ${due ? 'due' : ''} ${['Taken', 'Dismissed'].includes(r.status) ? 'done' : ''}" data-row="${r.id}">
      <div class="time"><b>${fmtTime(r.scheduledTime).replace(/\s?(AM|PM)/i, '')}</b><span>${(fmtTime(r.scheduledTime).match(/AM|PM/i) || [''])[0]}</span></div>
      <div class="pill-dot" style="background:${esc(r.color)}">${icon('pill')}</div>
      <div class="grow"><h4>${esc(r.name)}</h4><div class="meta">${esc(r.dosage)}${r.notes ? ' · ' + esc(r.notes) : ''}</div></div>
      <div class="row wrap" style="gap:8px;justify-content:flex-end">${chip}${actions}</div>
    </div>`;
  };

  /** wires up Taken / Snooze / Dismiss buttons inside `root` */
  MR.bindDoseActions = function (root, onChange) {
    $$('[data-act]', root).forEach((b) =>
      b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          await MR.api.mark(Number(b.dataset.id), b.dataset.act);
          if (b.dataset.act === 'Taken') toast('Marked as taken', 'Nice work — keep the streak going!', 'ok');
          await onChange();
        } catch (e) {
          toast('Could not update', e.message, 'err');
          b.disabled = false;
        }
      })
    );
    $$('[data-snooze-toggle]', root).forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        $$('.snooze-menu').forEach((m) => m.remove());
        const menu = document.createElement('div');
        menu.className = 'snooze-menu';
        menu.innerHTML = SNOOZE_OPTIONS.map((m) => `<button data-min="${m}">${m < 60 ? m + ' minutes' : '1 hour'}</button>`).join('');
        b.parentElement.appendChild(menu);
        $$('button', menu).forEach((o) =>
          o.addEventListener('click', async () => {
            try {
              await MR.api.snooze(Number(b.dataset.snoozeToggle), Number(o.dataset.min));
              toast('Snoozed', `We will remind you again in ${o.textContent}.`, 'info');
              await onChange();
            } catch (err) {
              toast('Could not snooze', err.message, 'err');
            }
          })
        );
      })
    );
  };
  document.addEventListener('click', () => $$('.snooze-menu').forEach((m) => m.remove()));

  /* ---- the dashboard view ---- */
  MR.views = MR.views || {};
  MR.views.dashboard = async function (view) {
    view.innerHTML = `<div class="skeleton"></div><div class="skeleton mt"></div>`;
    const [today, stats, upcoming, meds] = await Promise.all([MR.api.today(), MR.api.analytics({ days: 30 }), MR.api.upcoming(7), MR.api.medicines()]);
    MR.state.today = today;
    MR.state.clockOffset = new Date(today.serverTime) - Date.now();

    const s = today.summary;
    const next = today.reminders.find((r) => ['Pending', 'Snoozed'].includes(r.status));
    const lowStock = meds.medicines.filter((m) => m.isActive && m.stock !== null && m.refillThreshold !== null && m.stock <= m.refillThreshold);
    const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: MR.tz() }).format(now()));
    const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const first = MR.state.user.name.split(' ')[0];

    let headline = 'No doses scheduled today';
    let sub = 'Add a medicine to start receiving reminders.';
    if (s.total) {
      if (s.pending === 0) {
        headline = s.missed ? 'All done for today' : 'Perfect day! 🎉';
        sub = s.missed ? `You took ${s.taken} of ${s.total} doses today.` : 'Every dose for today is taken.';
      } else {
        headline = `${plural(s.pending, 'dose')} left today`;
        sub = `${s.taken} of ${s.total} taken so far.`;
      }
    }

    view.innerHTML = `
      <div class="card hero mb">
        ${MR.ring(s.taken, s.total)}
        <div style="z-index:1">
          <h2>${greet}, ${esc(first)}</h2>
          <p><b>${headline}</b> — ${sub}</p>
          ${next ? `<div class="next">${icon('clock')} Next: ${esc(next.name)} at ${fmtTime(next.dueAt)} · ${relative(next.dueAt)}</div>` : ''}
        </div>
      </div>

      <div class="stats mb">
        ${statCard('target', 'Adherence (30 days)', stats.adherence === null ? '—' : stats.adherence + '%', 'taken ÷ scheduled', 'var(--primary-50)', 'var(--primary)')}
        ${statCard('flame', 'Current streak', plural(stats.streak, 'day'), `Best: ${stats.bestStreak} days`, 'var(--warn-50)', 'var(--warn)')}
        ${statCard('clock', 'On-time rate', stats.onTimeRate === null ? '—' : stats.onTimeRate + '%', 'within 30 min of schedule', 'var(--ok-50)', 'var(--ok)')}
        ${statCard('sos', 'Missed (30 days)', stats.totals.missed, `${stats.totals.taken} doses taken`, 'var(--danger-50)', 'var(--danger)')}
      </div>

      ${lowStock.length ? `<div class="card mb" style="border-color:var(--warn)"><div class="row">${icon('info')}<div><b>Time to refill</b><div class="muted small">${lowStock.map((m) => `${esc(m.name)} (${m.stock} left)`).join(' · ')}</div></div></div></div>` : ''}

      <div class="dash-grid">
        <div>
          <div class="card">
            <div class="card-head"><h3>Today · ${fmtDate(today.serverTime, { weekday: 'long', day: 'numeric', month: 'long', timeZone: MR.tz() })}</h3>
              <button class="btn primary sm" id="add-med-btn">${icon('plus')} Add medicine</button></div>
            <div class="timeline" id="timeline">${
              today.reminders.length
                ? today.reminders.map((r) => MR.doseRow(r)).join('')
                : `<div class="empty"><div class="big">💊</div><b>Nothing scheduled today</b><p class="small mt">Add your first medicine and we will remind you on time.</p></div>`
            }</div>
          </div>
        </div>
        <div>
          <div class="card mb">
            <div class="card-head"><h3>Coming up</h3><span class="chip">next 7 days</span></div>
            ${
              upcoming.reminders.length
                ? upcoming.reminders
                    .slice(0, 6)
                    .map(
                      (r) => `<div class="upcoming-item"><span class="swatch" style="background:${esc(r.color)}"></span>
                        <div class="grow"><b>${esc(r.name)}</b><div class="muted small">${esc(r.dosage)}</div></div>
                        <div style="text-align:right"><b class="small">${fmtTime(r.scheduledTime)}</b><div class="muted small">${fmtDate(r.scheduledTime)}</div></div></div>`
                    )
                    .join('')
                : '<p class="muted small">No upcoming doses.</p>'
            }
          </div>
          <div class="card">
            <div class="card-head"><h3>Last 14 days</h3><a class="small" href="#/history" style="color:var(--primary);font-weight:600;text-decoration:none">Insights →</a></div>
            ${MR.barChart(stats.daily.slice(-14), { labelEvery: 2 })}
          </div>
        </div>
      </div>`;

    const refresh = () => MR.refreshView();
    MR.bindDoseActions(view, refresh);
    $('#add-med-btn').addEventListener('click', () => MR.openMedicineForm(null, refresh));
  };

  function statCard(ic, label, value, sub, bg, fg) {
    return `<div class="card stat-card"><div class="stat-ico" style="background:${bg};color:${fg}">${icon(ic)}</div>
      <div class="stat"><span class="label">${label}</span><span class="value">${value}</span><span class="sub">${sub}</span></div></div>`;
  }
  MR.statCard = statCard;
})();
