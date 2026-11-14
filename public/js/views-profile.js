/* Profile: personal details, timezone, emergency contact, password, notification test */
(function () {
  const { icon, esc, $, toast } = MR;

  MR.views = MR.views || {};
  MR.views.profile = async function (view) {
    const u = MR.state.user;
    const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [u.timezone];
    if (!zones.includes(u.timezone)) zones.unshift(u.timezone);
    const notifPerm = 'Notification' in window ? Notification.permission : 'unsupported';

    view.innerHTML = `
      <div class="dash-grid">
        <div>
          <div class="card mb">
            <div class="card-head"><h3>Your details</h3><span class="chip primary">${u.role === 'caregiver' ? 'Caregiver account' : 'Patient account'}</span></div>
            <div id="p-err"></div>
            <div class="grid2">
              <div class="field"><label>Full name</label><input class="input" id="p-name" value="${esc(u.name)}"/></div>
              <div class="field"><label>Phone</label><input class="input" id="p-phone" value="${esc(u.phone)}" placeholder="+91 …"/></div>
            </div>
            <div class="field"><label>Email</label><input class="input" value="${esc(u.email)}" disabled/></div>
            <div class="field"><label>Timezone</label><select class="select" id="p-tz">${zones.map((z) => `<option ${z === u.timezone ? 'selected' : ''}>${esc(z)}</option>`).join('')}</select>
              <span class="hint">Reminder times are interpreted in this timezone and stored in UTC.</span></div>
            <h3 style="margin:22px 0 4px">Emergency contact</h3>
            <p class="muted small mb">Notified by e-mail when you press the SOS button, together with your caregivers.</p>
            <div class="grid2">
              <div class="field"><label>Name</label><input class="input" id="e-name" value="${esc(u.emergencyContact.name)}" placeholder="e.g. Meena (daughter)"/></div>
              <div class="field"><label>Phone</label><input class="input" id="e-phone" value="${esc(u.emergencyContact.phone)}"/></div>
            </div>
            <div class="field"><label>Email</label><input class="input" id="e-email" type="email" value="${esc(u.emergencyContact.email)}"/></div>
            <button class="btn primary" id="save">Save changes</button>
          </div>
        </div>
        <div>
          <div class="card mb">
            <div class="card-head"><h3>Notifications</h3></div>
            <div class="row mb"><span class="chip ${notifPerm === 'granted' ? 'ok' : 'warn'}">Browser alerts: ${notifPerm === 'granted' ? 'on' : notifPerm === 'denied' ? 'blocked' : 'off'}</span></div>
            <p class="muted small mb">In-app alerts, a sound and an on-screen pop-up always work while the app is open. E-mail goes to ${esc(u.email)} (printed in the server console in demo mode).</p>
            <div class="row wrap">
              ${notifPerm === 'default' ? `<button class="btn" id="perm">${icon('bell')} Enable browser alerts</button>` : ''}
              <button class="btn" id="test">${icon('mail')} Send test notification</button>
            </div>
          </div>
          <div class="card mb">
            <div class="card-head"><h3>Change password</h3></div>
            <div class="field"><label>Current password</label><input class="input" id="pw-cur" type="password" autocomplete="current-password"/></div>
            <div class="field"><label>New password</label><input class="input" id="pw-new" type="password" autocomplete="new-password" placeholder="At least 6 characters"/></div>
            <button class="btn" id="pw">Update password</button>
          </div>
          <button class="btn danger block" id="logout">${icon('logout')} Sign out</button>
        </div>
      </div>`;

    $('#save', view).addEventListener('click', async () => {
      try {
        const r = await MR.api.updateProfile({
          name: $('#p-name').value, phone: $('#p-phone').value, timezone: $('#p-tz').value,
          emergencyContact: { name: $('#e-name').value, phone: $('#e-phone').value, email: $('#e-email').value },
        });
        MR.state.user = r.user;
        MR.renderShell();
        toast('Profile saved', '', 'ok');
        $('#p-err').innerHTML = '';
      } catch (e) { $('#p-err').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
    });
    $('#perm', view)?.addEventListener('click', async () => { await Notification.requestPermission(); MR.refreshView(); });
    $('#test', view).addEventListener('click', async () => { try { await MR.api.testNotification(); toast('Test sent', 'Check the bell icon.', 'ok'); MR.pollNotifications(); } catch (e) { toast('Failed', e.message, 'err'); } });
    $('#pw', view).addEventListener('click', async () => {
      try { await MR.api.changePassword({ currentPassword: $('#pw-cur').value, newPassword: $('#pw-new').value }); toast('Password updated', '', 'ok'); $('#pw-cur').value = $('#pw-new').value = ''; }
      catch (e) { toast('Could not update', e.message, 'err'); }
    });
    $('#logout', view).addEventListener('click', () => MR.logout());
  };
})();
