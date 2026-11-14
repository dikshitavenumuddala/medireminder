/* Medicines: list, add / edit form, pause, delete */
(function () {
  const { icon, esc, $, $$, toast, hhmmTo12, dateKey, now, confirmDialog } = MR;

  const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444', '#8b5cf6', '#14b8a6'];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const PRESETS = [
    ['Morning', '08:00'],
    ['Noon', '13:00'],
    ['Evening', '18:00'],
    ['Night', '21:00'],
  ];

  function patternText(p) {
    switch (p.type) {
      case 'alternate': return 'Every other day';
      case 'interval': return `Every ${p.interval} days`;
      case 'weekdays': return p.days.map((d) => DAYS[d]).join(', ');
      default: return 'Every day';
    }
  }

  MR.views = MR.views || {};
  MR.views.medicines = async function (view) {
    view.innerHTML = '<div class="skeleton"></div>';
    const { medicines } = await MR.api.medicines();

    view.innerHTML = `
      <div class="row between mb wrap">
        <p class="muted">${medicines.length ? `${medicines.filter((m) => m.isActive).length} active · ${medicines.filter((m) => !m.isActive).length} paused` : ''}</p>
        <button class="btn primary" id="add">${icon('plus')} Add medicine</button>
      </div>
      ${
        medicines.length
          ? `<div class="med-grid">${medicines.map(card).join('')}</div>`
          : `<div class="card empty"><div class="big">💊</div><h3>No medicines yet</h3><p class="mt muted">Add what you take, pick the times, and MediReminder does the rest.</p><button class="btn primary mt" id="add2">${icon('plus')} Add your first medicine</button></div>`
      }`;

    const refresh = () => MR.refreshView();
    $('#add')?.addEventListener('click', () => MR.openMedicineForm(null, refresh));
    $('#add2')?.addEventListener('click', () => MR.openMedicineForm(null, refresh));
    $$('[data-edit]', view).forEach((b) => b.addEventListener('click', () => MR.openMedicineForm(medicines.find((m) => m.id === Number(b.dataset.edit)), refresh)));
    $$('[data-toggle]', view).forEach((b) =>
      b.addEventListener('click', async () => {
        const m = medicines.find((x) => x.id === Number(b.dataset.toggle));
        try {
          await MR.api.updateMedicine(m.id, { isActive: !m.isActive });
          toast(m.isActive ? 'Paused' : 'Resumed', `${m.name} ${m.isActive ? 'will not send reminders until resumed' : 'is active again'}.`, 'info');
          refresh();
        } catch (e) { toast('Could not update', e.message, 'err'); }
      })
    );
    $$('[data-del]', view).forEach((b) =>
      b.addEventListener('click', async () => {
        const m = medicines.find((x) => x.id === Number(b.dataset.del));
        if (!(await confirmDialog({ title: `Delete ${m.name}?`, message: 'Upcoming reminders are removed. Your past history is kept for your records.', confirmText: 'Delete', danger: true }))) return;
        try { await MR.api.deleteMedicine(m.id); toast('Deleted', `${m.name} was removed.`, 'ok'); refresh(); }
        catch (e) { toast('Could not delete', e.message, 'err'); }
      })
    );
  };

  function card(m) {
    const hasStock = m.stock !== null;
    const low = hasStock && m.refillThreshold !== null && m.stock <= m.refillThreshold;
    const pct = hasStock ? Math.min(100, Math.round((m.stock / Math.max(m.stock, (m.refillThreshold || 5) * 3)) * 100)) : 0;
    return `<div class="card med ${m.isActive ? '' : 'paused'}">
      <div class="top">
        <div class="pill-dot" style="background:${esc(m.color)}">${icon('pill')}</div>
        <div class="grow"><h3>${esc(m.name)}</h3><div class="muted small">${esc(m.dosage)}</div></div>
        ${m.isActive ? '<span class="chip ok">Active</span>' : '<span class="chip">Paused</span>'}
      </div>
      <div class="times">${m.schedule.map((t) => `<span class="chip primary">${icon('clock')} ${hhmmTo12(t)}</span>`).join('')}</div>
      <div class="small muted">${icon('calendar')} ${patternText(m.repeatPattern)} · from ${esc(m.startDate)}${m.endDate ? ' to ' + esc(m.endDate) : ''}</div>
      ${m.notes ? `<div class="small muted">“${esc(m.notes)}”</div>` : ''}
      ${hasStock ? `<div><div class="row between small"><span class="muted">Stock</span><b ${low ? 'style="color:var(--danger)"' : ''}>${m.stock} left${low ? ' · refill soon' : ''}</b></div><div class="progress ${low ? 'low' : ''} mt" style="margin-top:6px"><i style="width:${pct}%"></i></div></div>` : ''}
      <div class="foot">
        <button class="btn sm grow" data-edit="${m.id}">${icon('edit')} Edit</button>
        <button class="btn sm" data-toggle="${m.id}" title="${m.isActive ? 'Pause' : 'Resume'}">${icon(m.isActive ? 'pause' : 'play')}</button>
        <button class="btn sm danger" data-del="${m.id}" title="Delete">${icon('trash')}</button>
      </div>
    </div>`;
  }

  /* ---------- add / edit form ---------- */
  MR.openMedicineForm = function (med, onSaved) {
    const editing = !!med;
    const st = {
      times: med ? [...med.schedule] : ['08:00'],
      type: med ? med.repeatPattern.type : 'daily',
      days: med && med.repeatPattern.days ? [...med.repeatPattern.days] : [1, 2, 3, 4, 5],
      interval: med && med.repeatPattern.interval ? med.repeatPattern.interval : 3,
      color: med ? med.color : COLORS[Math.floor(Math.random() * COLORS.length)],
    };
    const today = dateKey(now());

    const m = MR.modal({
      title: editing ? `Edit ${med.name}` : 'Add medicine',
      body: `<div id="form-err"></div>
        <div class="grid2">
          <div class="field"><label>Medicine name *</label><input class="input" id="f-name" placeholder="e.g. Metformin" value="${esc(med?.name || '')}" maxlength="120"/></div>
          <div class="field"><label>Dosage *</label><input class="input" id="f-dosage" placeholder="e.g. 500 mg · 1 tablet" value="${esc(med?.dosage || '')}" maxlength="120"/></div>
        </div>
        <div class="field"><label>Reminder times *</label>
          <div class="row wrap" id="times"></div>
          <div class="row wrap" style="margin-top:6px">
            <input type="time" class="input" id="f-time" style="width:auto" value="12:00"/>
            <button type="button" class="btn sm" id="add-time">${icon('plus')} Add time</button>
            ${PRESETS.map(([l, t]) => `<button type="button" class="btn ghost sm" data-preset="${t}">${l}</button>`).join('')}
          </div>
        </div>
        <div class="field"><label>Repeat</label>
          <select class="select" id="f-type">
            <option value="daily">Every day</option><option value="alternate">Alternate days</option>
            <option value="interval">Every N days</option><option value="weekdays">Specific weekdays</option>
          </select>
          <div id="pattern-extra" class="mt"></div>
        </div>
        <div class="grid2">
          <div class="field"><label>Start date</label><input type="date" class="input" id="f-start" value="${esc(med?.startDate || today)}"/></div>
          <div class="field"><label>End date (optional)</label><input type="date" class="input" id="f-end" value="${esc(med?.endDate || '')}"/></div>
        </div>
        <div class="field"><label>Colour</label><div class="colors" id="colors">${COLORS.map((c) => `<button type="button" data-c="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}</div></div>
        <div class="grid2">
          <div class="field"><label>Pills in stock (optional)</label><input type="number" min="0" class="input" id="f-stock" value="${med && med.stock !== null ? med.stock : ''}" placeholder="e.g. 30"/></div>
          <div class="field"><label>Remind me to refill at</label><input type="number" min="0" class="input" id="f-thr" value="${med && med.refillThreshold !== null ? med.refillThreshold : ''}" placeholder="e.g. 7"/></div>
        </div>
        <div class="field"><label>Notes (optional)</label><textarea class="textarea" id="f-notes" maxlength="1000" placeholder="Take after food…">${esc(med?.notes || '')}</textarea></div>`,
      footer: `<button class="btn" data-close>Cancel</button><button class="btn primary" id="save">${editing ? 'Save changes' : 'Add medicine'}</button>`,
    });

    const renderTimes = () => {
      const box = m.$('#times');
      box.innerHTML = st.times.length
        ? st.times.sort().map((t) => `<span class="chip primary">${icon('clock')} ${hhmmTo12(t)}<button type="button" data-rm="${t}" aria-label="Remove ${t}">×</button></span>`).join('')
        : '<span class="hint">No times yet</span>';
      m.$$('[data-rm]').forEach((b) => b.addEventListener('click', () => { st.times = st.times.filter((x) => x !== b.dataset.rm); renderTimes(); }));
    };
    const addTime = (t) => { if (t && !st.times.includes(t)) { st.times.push(t); renderTimes(); } };
    const renderPattern = () => {
      const box = m.$('#pattern-extra');
      if (st.type === 'interval') {
        box.innerHTML = `<div class="row"><span class="muted small">Every</span><input type="number" min="2" max="30" class="input" id="f-interval" style="width:90px" value="${st.interval}"/><span class="muted small">days</span></div>`;
        m.$('#f-interval').addEventListener('input', (e) => (st.interval = Number(e.target.value)));
      } else if (st.type === 'weekdays') {
        box.innerHTML = `<div class="days">${DAYS.map((d, i) => `<button type="button" data-d="${i}" class="${st.days.includes(i) ? 'on' : ''}">${d}</button>`).join('')}</div>`;
        m.$$('[data-d]').forEach((b) => b.addEventListener('click', () => {
          const d = Number(b.dataset.d);
          st.days = st.days.includes(d) ? st.days.filter((x) => x !== d) : [...st.days, d];
          renderPattern();
        }));
      } else box.innerHTML = '';
    };
    const renderColors = () => m.$$('[data-c]').forEach((b) => b.classList.toggle('on', b.dataset.c === st.color));

    m.$('#f-type').value = st.type;
    m.$('#f-type').addEventListener('change', (e) => { st.type = e.target.value; renderPattern(); });
    m.$('#add-time').addEventListener('click', () => addTime(m.$('#f-time').value));
    m.$$('[data-preset]').forEach((b) => b.addEventListener('click', () => addTime(b.dataset.preset)));
    m.$$('[data-c]').forEach((b) => b.addEventListener('click', () => { st.color = b.dataset.c; renderColors(); }));
    renderTimes(); renderPattern(); renderColors();

    m.$('#save').addEventListener('click', async () => {
      const num = (id) => (m.$(id).value === '' ? null : Number(m.$(id).value));
      const payload = {
        name: m.$('#f-name').value.trim(),
        dosage: m.$('#f-dosage').value.trim(),
        schedule: st.times,
        startDate: m.$('#f-start').value,
        endDate: m.$('#f-end').value || null,
        repeatPattern: { type: st.type, ...(st.type === 'weekdays' ? { days: st.days } : {}), ...(st.type === 'interval' ? { interval: st.interval } : {}) },
        notes: m.$('#f-notes').value.trim(),
        color: st.color,
        stock: num('#f-stock'),
        refillThreshold: num('#f-thr'),
      };
      const btn = m.$('#save');
      btn.disabled = true;
      try {
        if (editing) await MR.api.updateMedicine(med.id, payload);
        else await MR.api.addMedicine(payload);
        m.close();
        toast(editing ? 'Medicine updated' : 'Medicine added', `${payload.name} — ${payload.schedule.map(hhmmTo12).join(', ')}`, 'ok');
        onSaved && onSaved();
      } catch (e) {
        m.$('#form-err').innerHTML = `<div class="err">${esc(e.message)}</div>`;
        m.el.querySelector('.modal').scrollTo({ top: 0, behavior: 'smooth' });
        btn.disabled = false;
      }
    });
  };
})();
