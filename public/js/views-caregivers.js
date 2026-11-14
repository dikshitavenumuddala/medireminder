/* Caregivers: share access (invite code / email), manage caregivers, and monitor linked patients */
(function () {
  const { icon, esc, $, $$, toast, fmtTime, fmtDate, initials, confirmDialog, hhmmTo12 } = MR;

  MR.views = MR.views || {};
  MR.views.caregivers = async function (view, param) {
    if (param) return patientDetail(view, Number(param));

    view.innerHTML = '<div class="skeleton"></div><div class="skeleton mt"></div>';
    const [mine, pat] = await Promise.all([MR.api.myCaregivers(), MR.api.patients()]);
    const isCaregiver = MR.state.user.role === 'caregiver';

    const patientsCard = `
      <div class="card ${isCaregiver ? '' : 'mt-lg'}">
        <div class="card-head"><h3>People I care for</h3>
          <button class="btn primary sm" id="join">${icon('plus')} Enter invite code</button></div>
        ${pat.patients.length ? `<div class="med-grid">${pat.patients.map(patientCard).join('')}</div>` :
          `<div class="empty"><div class="big">🤝</div><b>No linked patients yet</b><p class="small mt">Ask the person you look after for their invitation code (Caregivers page → “Generate code”).</p></div>`}
      </div>`;

    const sharingCard = `
      <div class="card">
        <div class="card-head"><h3>My caregivers</h3></div>
        <p class="muted small mb">Caregivers can see your schedule, today's status and adherence, and get an alert when you miss a dose. They cannot change anything.</p>
        <div class="grid2">
          <div class="card" style="background:var(--surface-2);box-shadow:none">
            <b>Share an invitation code</b>
            <p class="muted small" style="margin:4px 0 12px">Give this code to your caregiver. They enter it on their Caregivers page.</p>
            <div class="row"><input class="input" id="code" readonly value="${esc(mine.inviteCode || '')}" placeholder="Click “Generate code”" style="font-weight:800;letter-spacing:.18em;text-align:center"/>
              <button class="btn icon-btn" id="copy" title="Copy">${icon('copy')}</button></div>
            <button class="btn sm block mt" id="gen">${icon('refresh')} ${mine.inviteCode ? 'Generate a new code' : 'Generate code'}</button>
          </div>
          <div class="card" style="background:var(--surface-2);box-shadow:none">
            <b>Add by email</b>
            <p class="muted small" style="margin:4px 0 12px">If your caregiver already has a MediReminder account.</p>
            <input class="input" id="cg-email" type="email" placeholder="caregiver@example.com"/>
            <button class="btn primary sm block mt" id="add-email">${icon('mail')} Link caregiver</button>
          </div>
        </div>
        <div class="mt-lg">${mine.caregivers.length ? mine.caregivers.map((c) => `
          <div class="upcoming-item"><div class="avatar" style="width:38px;height:38px;border-radius:50%">${esc(initials(c.name))}</div>
            <div class="grow"><b>${esc(c.name)}</b><div class="muted small">${esc(c.email)}${c.phone ? ' · ' + esc(c.phone) : ''}</div></div>
            <button class="btn sm danger" data-unlink="${c.linkId}">Remove</button></div>`).join('') : '<p class="muted small">Nobody has access to your data yet.</p>'}</div>
      </div>`;

    view.innerHTML = isCaregiver ? patientsCard + '<div class="mt-lg"></div>' + sharingCard : sharingCard + patientsCard;

    $('#gen', view).addEventListener('click', async () => { try { await MR.api.invite(); MR.refreshView(); } catch (e) { toast('Failed', e.message, 'err'); } });
    $('#copy', view).addEventListener('click', async () => {
      const v = $('#code', view).value;
      if (!v) return toast('Generate a code first', '', 'info');
      try { await navigator.clipboard.writeText(v); toast('Copied', 'Invitation code copied to clipboard.', 'ok'); } catch { $('#code', view).select(); }
    });
    $('#add-email', view).addEventListener('click', async () => {
      const email = $('#cg-email', view).value.trim();
      if (!email) return;
      try { await MR.api.linkCaregiver({ email }); toast('Caregiver linked', email, 'ok'); MR.refreshView(); } catch (e) { toast('Could not link', e.message, 'err'); }
    });
    $$('[data-unlink]', view).forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: 'Remove caregiver?', message: 'They will no longer see your medicines or get alerts.', confirmText: 'Remove', danger: true }))) return;
      try { await MR.api.unlink(b.dataset.unlink); MR.refreshView(); } catch (e) { toast('Failed', e.message, 'err'); }
    }));
    $('#join', view).addEventListener('click', () => {
      const m = MR.modal({
        title: 'Link to a patient', small: true,
        body: `<div id="e"></div><div class="field"><label>Invitation code</label><input class="input" id="c" placeholder="e.g. 9F3A1C2B" maxlength="16" style="text-transform:uppercase;letter-spacing:.15em;font-weight:700"/></div>`,
        footer: `<button class="btn" data-close>Cancel</button><button class="btn primary" id="ok">Link</button>`,
      });
      m.$('#ok').addEventListener('click', async () => {
        try { const r = await MR.api.linkCaregiver({ code: m.$('#c').value }); m.close(); toast('Linked', `You can now follow ${r.patient.name}.`, 'ok'); MR.refreshView(); }
        catch (e) { m.$('#e').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
      });
    });
  };

  function patientCard(p) {
    const t = p.today;
    const status = t.missed ? `<span class="chip danger">${t.missed} missed today</span>` : t.pending ? `<span class="chip primary">${t.pending} pending</span>` : t.total ? '<span class="chip ok">All taken</span>' : '<span class="chip">No doses today</span>';
    return `<a href="#/caregivers/${p.id}" class="card med" style="text-decoration:none;color:inherit">
      <div class="top"><div class="avatar" style="width:46px;height:46px;border-radius:14px">${esc(initials(p.name))}</div>
        <div class="grow"><h3>${esc(p.name)}</h3><div class="muted small">${esc(p.email)}</div></div>${status}</div>
      <div class="row between small"><span class="muted">7-day adherence</span><b>${p.adherence7d === null ? '—' : p.adherence7d + '%'}</b></div>
      <div class="progress"><i style="width:${p.adherence7d || 0}%"></i></div>
      <div class="small muted">${p.nextDose ? `Next: <b style="color:var(--text)">${esc(p.nextDose.name)}</b> at ${fmtTime(p.nextDose.dueAt)}` : 'No more doses today'} · streak ${p.streak} d</div>
    </a>`;
  }

  async function patientDetail(view, id) {
    view.innerHTML = '<div class="skeleton"></div><div class="skeleton mt"></div>';
    const d = await MR.api.patient(id);
    MR.setTitle(d.patient.name, 'Caregiver view · read only');
    const t = d.today;
    const taken = t.filter((r) => r.status === 'Taken').length;
    const ec = d.patient.emergencyContact;
    view.innerHTML = `
      <a href="#/caregivers" class="btn ghost sm mb">← All patients</a>
      <div class="card hero mb">${MR.ring(taken, t.length)}
        <div style="z-index:1"><h2>${esc(d.patient.name)}</h2><p>${t.length ? `${taken} of ${t.length} doses taken today` : 'No doses scheduled today'}</p>
          <div class="row wrap mt" style="gap:10px">${d.patient.phone ? `<a class="next" style="color:#fff;text-decoration:none" href="tel:${esc(d.patient.phone)}">${icon('phone')} ${esc(d.patient.phone)}</a>` : ''}
          ${ec.name ? `<span class="next">${icon('sos')} ${esc(ec.name)} ${esc(ec.phone)}</span>` : ''}</div></div></div>
      <div class="stats mb">
        ${MR.statCard('target', 'Adherence (30d)', d.analytics.adherence === null ? '—' : d.analytics.adherence + '%', '', 'var(--primary-50)', 'var(--primary)')}
        ${MR.statCard('flame', 'Streak', d.analytics.streak + ' d', `best ${d.analytics.bestStreak} d`, 'var(--warn-50)', 'var(--warn)')}
        ${MR.statCard('check', 'Taken', d.analytics.totals.taken, 'last 30 days', 'var(--ok-50)', 'var(--ok)')}
        ${MR.statCard('sos', 'Missed', d.analytics.totals.missed, 'last 30 days', 'var(--danger-50)', 'var(--danger)')}
      </div>
      <div class="dash-grid">
        <div class="card"><div class="card-head"><h3>Today</h3></div><div class="timeline">${t.length ? t.map((r) => MR.doseRow(r, { readonly: true })).join('') : '<div class="empty">No doses today.</div>'}</div></div>
        <div>
          <div class="card mb"><div class="card-head"><h3>Medicines</h3></div>${d.medicines.length ? d.medicines.map((m) => `<div class="upcoming-item"><div class="grow"><b>${esc(m.name)}</b><div class="muted small">${esc(m.dosage)}</div></div><span class="muted small">${m.schedule.map(hhmmTo12).join(', ')}</span></div>`).join('') : '<p class="muted small">None.</p>'}</div>
          <div class="card"><div class="card-head"><h3>Last 14 days</h3></div>${MR.barChart(d.analytics.daily.slice(-14), { labelEvery: 2 })}</div>
        </div>
      </div>`;
  }
})();
