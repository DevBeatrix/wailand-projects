/**
 * Shared utilities: theme, API, toasts, notification sounds, Socket.io helpers.
 */
(function () {
  const NS = (window.NX = window.NX || {});

  NS.cfg = null;

  NS.applyTheme = function (cfg) {
    NS.cfg = cfg;
    document.documentElement.style.setProperty('--accent-main', cfg.mainColor);
    document.documentElement.style.setProperty('--accent-sec', cfg.secondaryColor);
    const logoEls = document.querySelectorAll('[data-logo-text]');
    logoEls.forEach((el) => (el.textContent = cfg.logoText));
    const nameEls = document.querySelectorAll('[data-site-name]');
    nameEls.forEach((el) => (el.textContent = cfg.websiteName));
    document.title = cfg.websiteName;
  };

  NS.loadConfig = async function () {
    const r = await fetch('/api/config');
    const cfg = await r.json();
    NS.applyTheme(cfg);
    return cfg;
  };

  NS.toastsEl = function () {
    let el = document.getElementById('toasts');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toasts';
      el.className = 'toasts';
      document.body.appendChild(el);
    }
    return el;
  };

  NS.toast = function (title, body) {
    const wrap = NS.toastsEl();
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<strong>${escapeHtml(title)}</strong><div class="muted">${escapeHtml(body || '')}</div>`;
    wrap.appendChild(t);
    setTimeout(() => t.remove(), 4200);
  };

  NS.soundEnabled = function () {
    const v = localStorage.getItem('nx_sound');
    if (v === null) return !!(NS.cfg && NS.cfg.soundsDefault);
    return v === '1';
  };

  NS.setSound = function (on) {
    localStorage.setItem('nx_sound', on ? '1' : '0');
  };

  /** Soft UI chime using Web Audio API */
  NS.playSound = function (kind) {
    if (!NS.soundEnabled()) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = kind === 'alert' ? 'square' : 'sine';
      const base = kind === 'claim' ? 660 : kind === 'alert' ? 220 : 520;
      o.frequency.value = base;
      g.gain.value = 0.0001;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      const now = ctx.currentTime;
      g.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      o.stop(now + 0.25);
      setTimeout(() => ctx.close(), 300);
    } catch (_e) {}
  };

  NS.socket = null;

  NS.connectSocket = function () {
    if (NS.socket) return NS.socket;
    // eslint-disable-next-line no-undef
    NS.socket = io({ transports: ['websocket', 'polling'], withCredentials: true });
    NS.socket.on('notify', (p) => {
      NS.toast(p.title || 'Notice', p.body || '');
      NS.playSound('message');
    });
    NS.socket.on('sound', (p) => NS.playSound(p.kind || 'message'));
    return NS.socket;
  };

  NS.apiJson = async function (url, opts) {
    const r = await fetch(url, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(opts && opts.headers) },
      credentials: 'include',
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
  };

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  NS.escapeHtml = escapeHtml;
})();
