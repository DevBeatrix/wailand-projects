/**
 * Owner console: analytics, admins, bans, logs, settings.
 */
(function () {
  const loginEl = document.getElementById('ownerLogin');
  const appEl = document.getElementById('ownerApp');

  document.getElementById('ownerLoginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    try {
      await window.NX.apiJson('/api/owner/login', { method: 'POST', body: JSON.stringify(body) });
      await showApp();
    } catch (err) {
      window.NX.toast('Login failed', err.message);
    }
  });

  document.getElementById('ownerLogout').addEventListener('click', async () => {
    await fetch('/api/owner/logout', { method: 'POST', credentials: 'include' });
    location.reload();
  });

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const id = tab.getAttribute('data-tab');
      document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.getAttribute('data-panel') === id));
    });
  });

  document.getElementById('addAdminForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const raw = Object.fromEntries(new FormData(e.target).entries());
    try {
      await window.NX.apiJson('/api/owner/admins', { method: 'POST', body: JSON.stringify(raw) });
      window.NX.toast('Admin created', raw.email);
      e.target.reset();
      loadAdmins();
    } catch (err) {
      window.NX.toast('Error', err.message);
    }
  });

  document.getElementById('banForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target).entries());
    await window.NX.apiJson('/api/owner/ban', {
      method: 'POST',
      body: JSON.stringify({ email: fd.email, banned: fd.banned === 'true' }),
    });
    window.NX.toast('Updated', fd.email);
  });

  document.getElementById('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target).entries());
    const paymentMethods = f.paymentMethodsRaw.split(',').map((s) => s.trim()).filter(Boolean);
    await window.NX.apiJson('/api/owner/settings', {
      method: 'POST',
      body: JSON.stringify({
        websiteName: f.websiteName,
        logoText: f.logoText,
        mainColor: f.mainColor,
        secondaryColor: f.secondaryColor,
        currencyCode: f.currencyCode,
        currencySymbol: f.currencySymbol,
        paymentMethods,
        uploadLimitMb: Number(f.uploadLimitMb) || 25,
      }),
    });
    window.NX.toast('Saved', 'Settings updated');
    await window.NX.loadConfig();
  });

  init();

  async function init() {
    await window.NX.loadConfig();
    const ok = await fetch('/api/owner/stats', { credentials: 'include' }).then((r) => r.ok);
    if (ok) await showApp();
    else {
      loginEl.style.display = 'grid';
      appEl.style.display = 'none';
    }
  }

  async function showApp() {
    loginEl.style.display = 'none';
    appEl.style.display = 'block';
    const cfg = await fetch('/api/config').then((r) => r.json());
    const sf = document.getElementById('settingsForm');
    sf.websiteName.value = cfg.websiteName;
    sf.logoText.value = cfg.logoText;
    sf.mainColor.value = cfg.mainColor;
    sf.secondaryColor.value = cfg.secondaryColor;
    sf.currencyCode.value = cfg.currencyCode;
    sf.currencySymbol.value = cfg.currencySymbol;
    sf.paymentMethodsRaw.value = cfg.paymentMethods.join(', ');
    sf.uploadLimitMb.value = cfg.uploadLimitMb;

    await refreshAll();
    window.NX.connectSocket().emit('join:owner', {}, () => {});
  }

  async function refreshAll() {
    const stats = await fetch('/api/owner/stats', { credentials: 'include' }).then((r) => r.json());
    document.getElementById('statGrid').innerHTML = `
      <div class="stat"><span class="muted">Tickets</span><b>${stats.ticketsTotal}</b></div>
      <div class="stat"><span class="muted">Open</span><b>${stats.openCount}</b></div>
      <div class="stat"><span class="muted">Closed</span><b>${stats.closedCount}</b></div>
      <div class="stat"><span class="muted">Messages</span><b>${stats.messagesTotal}</b></div>
      <div class="stat"><span class="muted">Admins</span><b>${stats.adminsCount}</b></div>`;

    const points = await fetch('/api/owner/points', { credentials: 'include' }).then((r) => r.json());
    const pt = document.querySelector('#pointsTable tbody');
    pt.innerHTML = '';
    points.forEach((p) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${window.NX.escapeHtml(p.name)}</td><td>${window.NX.escapeHtml(p.email)}</td><td>${p.points}</td>`;
      pt.appendChild(tr);
    });

    await loadAdmins();

    const tickets = await fetch('/api/owner/tickets', { credentials: 'include' }).then((r) => r.json());
    const tt = document.querySelector('#allTicketsTable tbody');
    tt.innerHTML = '';
    tickets.forEach((t) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${window.NX.escapeHtml(t.number)}</td><td>${window.NX.escapeHtml(t.title)}</td><td>${t.type}</td><td>${t.status}</td><td>${window.NX.escapeHtml(
        t.admin_name || '—'
      )}</td>`;
      tt.appendChild(tr);
    });

    const logs = await fetch('/api/owner/logs', { credentials: 'include' }).then((r) => r.json());
    const lt = document.querySelector('#logsTable tbody');
    lt.innerHTML = '';
    logs.forEach((l) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${new Date(l.created_at).toLocaleString()}</td><td>${l.level}</td><td>${window.NX.escapeHtml(
        l.message
      )}</td>`;
      lt.appendChild(tr);
    });
  }

  async function loadAdmins() {
    const admins = await fetch('/api/owner/admins', { credentials: 'include' }).then((r) => r.json());
    const tb = document.querySelector('#adminsTable tbody');
    tb.innerHTML = '';
    admins.forEach((a) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${window.NX.escapeHtml(a.name)}</td><td>${window.NX.escapeHtml(a.email)}</td><td>${a.points}</td><td><button class="btn btn-sm btn-danger" type="button">Remove</button></td>`;
      tr.querySelector('button').addEventListener('click', async () => {
        if (!confirm('Remove this admin?')) return;
        await fetch(`/api/owner/admins/${a.id}`, { method: 'DELETE', credentials: 'include' });
        loadAdmins();
        refreshAll();
      });
      tb.appendChild(tr);
    });
  }
})();
