/* Thin fetch wrapper around the REST API */
(function () {
  const KEY = 'mr_token';

  async function request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem(KEY);
    if (token) headers.Authorization = `Bearer ${token}`;
    let res;
    try {
      res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (e) {
      throw new Error('Cannot reach the server. Is it running?');
    }
    if (res.status === 401 && token && !path.startsWith('/auth/')) {
      localStorage.removeItem(KEY);
      MR.onSessionExpired && MR.onSessionExpired();
      throw new Error('Session expired, please sign in again');
    }
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await res.json() : await res.text();
    if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
    return data;
  }

  async function download(path, filename) {
    const token = localStorage.getItem(KEY);
    const res = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const qs = (obj) => {
    const p = new URLSearchParams();
    Object.entries(obj || {}).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && p.set(k, v));
    const s = p.toString();
    return s ? `?${s}` : '';
  };

  MR.api = {
    setToken: (t) => localStorage.setItem(KEY, t),
    clearToken: () => localStorage.removeItem(KEY),
    hasToken: () => !!localStorage.getItem(KEY),
    qs,
    download,
    // auth
    register: (b) => request('POST', '/auth/register', b),
    login: (b) => request('POST', '/auth/login', b),
    me: () => request('GET', '/auth/me'),
    updateProfile: (b) => request('PUT', '/auth/profile', b),
    changePassword: (b) => request('PUT', '/auth/password', b),
    // medicines
    medicines: () => request('GET', '/medicines'),
    addMedicine: (b) => request('POST', '/medicines', b),
    updateMedicine: (id, b) => request('PUT', `/medicines/${id}`, b),
    deleteMedicine: (id) => request('DELETE', `/medicines/${id}`),
    // reminders
    today: () => request('GET', '/reminders/today'),
    upcoming: (days = 7) => request('GET', `/reminders/upcoming?days=${days}`),
    mark: (id, status) => request('PUT', `/reminders/${id}/mark`, { status }),
    snooze: (id, minutes) => request('PUT', `/reminders/${id}/snooze`, { minutes }),
    // history
    history: (params) => request('GET', `/history${qs(params)}`),
    analytics: (params) => request('GET', `/history/analytics${qs(params)}`),
    // caregivers
    invite: () => request('POST', '/caregivers/invite'),
    linkCaregiver: (b) => request('POST', '/caregivers/link', b),
    myCaregivers: () => request('GET', '/caregivers/mine'),
    patients: () => request('GET', '/caregivers/patients'),
    patient: (id) => request('GET', `/caregivers/patients/${id}`),
    unlink: (id) => request('DELETE', `/caregivers/${id}`),
    // notifications
    notifications: (since = 0) => request('GET', `/notifications${qs({ since })}`),
    readAll: () => request('PUT', '/notifications/read-all'),
    clearNotifications: () => request('DELETE', '/notifications'),
    testNotification: () => request('POST', '/notifications/test'),
    emergency: (message) => request('POST', '/notifications/emergency', { message }),
  };
})();
