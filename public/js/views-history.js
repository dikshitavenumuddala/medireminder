/* History & Insights: adherence analytics, heat-map, per-medicine bars, filterable log, CSV export */
(function () {
  const { icon, esc, $, $$, fmtDateTime, fmtDate, toast, dateKey, addDays, now, STATUS } = MR;

  const state = { range: 30, status: '', medicineId: '', page: 1 };

  MR.heatmap = function (daily) {
    return `<div class="heat">${daily
      .map((d) => {
        const lvl = d.total === 0 ? '' : d.adherence === 100 ? 'l4' : d.adherence >= 70 ? 'l3' : d.adherence >= 40 ? 'l2' : 'l1';
        const day = new Date(`${d.date}T12:00:00Z`).getUTCDate();
        return `<div class="${lvl}" title="${esc(d.date)}: ${d.total ? d.taken + '/' + d.total + ' taken' : 'no doses'}">${day}</div>`;
      })
      .join('')}</div>
      <div class="legend mt"><span><i style="background:#34d399"></i>100%</span><span><i style="background:#b7ecd6"></i>70–99%</span><span><i style="background:#fde9b8"></i>40–69%</span><span><i style="background:#fbd5d5"></i>&lt;40%</span></div>`;
  };

  MR.views = MR.views || {};
  MR.views.history = async function (view) {
    view.innerHTML = '<div class="skeleton"></div><div class="skeleton mt"></div>';
    const today = dateKey(now());
    const from = addDays(today, -(state.range - 1));
    const params = { from, to: today, status: state.status, medicineId: state.medicineId, page: state.page, pageSize: 15 };
    const [stats, hist, meds] = await Promise.all([MR.api.analytics({ days: Math.max(7, state.range) }), MR.api.history(params), MR.api.medicines()]);

    const t = stats.totals;
    view.innerHTML = `
      <div class="row between mb wrap">
        <div class="seg" id="range">${[7, 30, 90].map((d) => `<button data-r="${d}" class="${state.range === d ? 'on' : ''}">${d} days</button>`).join('')}</div>
        <button class="btn" id="export">${icon('download')} Export CSV</button>
      </div>

      <div class="stats mb">
        ${MR.statCard('target', 'Adherence', stats.adherence === null ? '—' : stats.adherence + '%', 'taken ÷ scheduled', 'var(--primary-50)', 'var(--primary)')}
        ${MR.statCard('check', 'Taken', t.taken, `of ${t.taken + t.missed + t.dismissed} doses`, 'var(--ok-50)', 'var(--ok)')}
        ${MR.statCard('sos', 'Missed', t.missed, `${t.dismissed} dismissed`, 'var(--danger-50)', 'var(--danger)')}
        ${MR.statCard('flame', 'Best streak', stats.bestStreak + ' d', `current ${stats.streak} d`, 'var(--warn-50)', 'var(--warn)')}
      </div>

      <div class="dash-grid mb">
        <div class="card"><div class="card-head"><h3>Daily adherence</h3></div>${MR.barChart(stats.daily, { labelEvery: stats.daily.length > 40 ? 7 : stats.daily.length > 14 ? 3 : 1 })}</div>
        <div class="card"><div class="card-head"><h3>Calendar view</h3></div>${MR.heatmap(stats.daily)}</div>
      </div>

      <div class="dash-grid mb">
        <div class="card"><div class="card-head"><h3>By medicine</h3></div>
          ${stats.byMedicine.length ? stats.byMedicine.map((m) => `
            <div style="margin-bottom:14px"><div class="row between small"><span><span class="swatch" style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${esc(m.color)};margin-right:8px"></span><b>${esc(m.name)}</b></span><b>${m.adherence === null ? '—' : m.adherence + '%'}</b></div>
            <div class="progress" style="margin-top:6px"><i style="width:${m.adherence || 0}%;background:${esc(m.color)}"></i></div></div>`).join('') : '<p class="muted small">No completed doses in this period yet.</p>'}
        </div>
        <div class="card"><div class="card-head"><h3>When you take them</h3><span class="chip">by hour</span></div>
          ${stats.byHour.length ? stats.byHour.map((h) => `<div class="row small" style="margin-bottom:8px"><span class="muted" style="width:46px">${String(h.hour).padStart(2, '0')}:00</span><div class="progress grow"><i style="width:${Math.round((h.taken / h.total) * 100)}%"></i></div><b style="width:44px;text-align:right">${Math.round((h.taken / h.total) * 100)}%</b></div>`).join('') : '<p class="muted small">Not enough data yet.</p>'}
        </div>
      </div>

      <div class="card">
        <div class="card-head wrap"><h3>Dose log <span class="muted small">(${hist.total})</span></h3>
          <div class="row wrap">
            <select class="select" id="f-status" style="width:auto"><option value="">All statuses</option>${['Taken', 'Missed', 'Snoozed', 'Dismissed'].map((s) => `<option ${state.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
            <select class="select" id="f-med" style="width:auto"><option value="">All medicines</option>${meds.medicines.map((m) => `<option value="${m.id}" ${String(state.medicineId) === String(m.id) ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
          </div></div>
        ${hist.items.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Scheduled</th><th>Medicine</th><th>Status</th><th>Logged at</th></tr></thead><tbody>
          ${hist.items.map((r) => `<tr><td>${fmtDateTime(r.scheduledTime)}</td>
            <td><span class="swatch" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${esc(r.color)};margin-right:8px"></span><b>${esc(r.name)}</b> <span class="muted small">${esc(r.dosage)}</span></td>
            <td><span class="chip ${STATUS[r.status].cls}">${r.status}</span>${r.snoozeCount ? ` <span class="muted small">snoozed ${r.snoozeCount}×</span>` : ''}</td>
            <td class="muted">${r.actionTime ? fmtDateTime(r.actionTime) : '—'}</td></tr>`).join('')}
          </tbody></table></div>
          <div class="row between mt"><span class="muted small">Page ${hist.page} of ${hist.pages}</span>
            <div class="row"><button class="btn sm" id="prev" ${hist.page <= 1 ? 'disabled' : ''}>Previous</button><button class="btn sm" id="next" ${hist.page >= hist.pages ? 'disabled' : ''}>Next</button></div></div>`
        : '<div class="empty"><div class="big">📋</div>No doses match these filters.</div>'}
      </div>`;

    $$('#range button', view).forEach((b) => b.addEventListener('click', () => { state.range = Number(b.dataset.r); state.page = 1; MR.refreshView(); }));
    $('#f-status', view).addEventListener('change', (e) => { state.status = e.target.value; state.page = 1; MR.refreshView(); });
    $('#f-med', view).addEventListener('change', (e) => { state.medicineId = e.target.value; state.page = 1; MR.refreshView(); });
    $('#prev', view)?.addEventListener('click', () => { state.page -= 1; MR.refreshView(); });
    $('#next', view)?.addEventListener('click', () => { state.page += 1; MR.refreshView(); });
    $('#export', view).addEventListener('click', async () => {
      try {
        await MR.api.download(`/history/export.csv${MR.api.qs({ from, to: today, status: state.status, medicineId: state.medicineId })}`, `medireminder-history-${from}_to_${today}.csv`);
        toast('Export ready', 'Your CSV file was downloaded.', 'ok');
      } catch (e) { toast('Export failed', e.message, 'err'); }
    });
  };
})();
