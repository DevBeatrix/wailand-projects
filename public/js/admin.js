/**
 * Admin panel: queues, live chat, claims, recall, mute, tools.
 */
(function () {
  const views = {
    login: document.getElementById('viewLogin'),
    app: document.getElementById('viewApp'),
  };
  const recallBanner = document.getElementById('recallBanner');
  const recallText = document.getElementById('recallText');
  const recallJoin = document.getElementById('recallJoin');

  let cfg = null;
  let socket = null;
  let currentFilter = 'all';
  let currentTicketId = null;
  let me = null;

  init();

  async function init() {
    cfg = await window.NX.loadConfig();
    socket = window.NX.connectSocket();

    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = Object.fromEntries(fd.entries());
      try {
        await window.NX.apiJson('/api/admin/login', { method: 'POST', body: JSON.stringify(body) });
        await enterApp();
      } catch (err) {
        window.NX.toast('Login failed', err.message);
      }
    });

    const authed = await fetch('/api/admin/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (authed) {
      me = authed;
      await enterApp();
    } else {
      views.login.style.display = 'grid';
      views.app.style.display = 'none';
    }

    document.getElementById('logoutBtn').addEventListener('click', async () => {
      await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' });
      location.reload();
    });

    document.querySelectorAll('[data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentFilter = btn.getAttribute('data-filter');
        document.querySelectorAll('[data-filter]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        loadTickets();
      });
    });

    document.getElementById('toolClaim').addEventListener('click', () => act(`/api/admin/tickets/${currentTicketId}/claim`));
    document.getElementById('toolRecall').addEventListener('click', () => act(`/api/admin/tickets/${currentTicketId}/recall`));
    document.getElementById('toolPause').addEventListener('click', () => act(`/api/admin/tickets/${currentTicketId}/pause`));
    document.getElementById('toolUnpause').addEventListener('click', () => act(`/api/admin/tickets/${currentTicketId}/unpause`));
    document.getElementById('toolClose').addEventListener('click', () => act(`/api/admin/tickets/${currentTicketId}/close`));
    document.getElementById('toolMute').addEventListener('click', async () => {
      const minutes = prompt('Mute client (minutes)', '15');
      if (minutes === null) return;
      await fetch(`/api/admin/tickets/${currentTicketId}/mute`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes: Number(minutes) || 15 }),
      });
      window.NX.toast('Muted', 'Client temporarily silenced');
      loadTicketHeader();
    });

    document.getElementById('sendAdmin').addEventListener('click', sendText);
    let adminTypingT = null;
    document.getElementById('adminMsg').addEventListener('input', () => {
      if (!currentTicketId) return;
      socket.emit('typing', { ticketId: currentTicketId, typing: true });
      clearTimeout(adminTypingT);
      adminTypingT = setTimeout(() => socket.emit('typing', { ticketId: currentTicketId, typing: false }), 900);
    });
    document.getElementById('adminMsg').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendText();
      }
    });
    document.getElementById('adminFile').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f || !currentTicketId) return;
      const fd = new FormData();
      fd.set('file', f);
      fd.set('msg_type', 'file');
      await fetch(`/api/tickets/${currentTicketId}/messages`, { method: 'POST', body: fd, credentials: 'include' });
      e.target.value = '';
    });
    document.getElementById('adminPdf').addEventListener('click', () => {
      document.getElementById('adminFile').accept = 'application/pdf';
      document.getElementById('adminFile').click();
      document.getElementById('adminFile').accept = '*/*';
    });
    document.getElementById('adminInvoice').addEventListener('click', async () => {
      const note = prompt('Invoice note / number');
      if (note === null) return;
      const fd = new FormData();
      fd.set('body', `Invoice: ${note}`);
      fd.set('msg_type', 'text');
      await fetch(`/api/tickets/${currentTicketId}/messages`, { method: 'POST', body: fd, credentials: 'include' });
    });
    document.getElementById('adminAudio').addEventListener('click', runAdminAudio);

    socket.on('ticket:update', () => loadTickets());
    socket.on('recall', (p) => {
      recallBanner.classList.add('show');
      recallText.textContent = `${p.from || 'Admin'} needs help on: ${p.title || p.ticketId}`;
      recallJoin.onclick = () => {
        openTicket(p.ticketId);
        recallBanner.classList.remove('show');
      };
    });
    socket.on('typing', (p) => {
      if (p.ticketId !== currentTicketId) return;
      const el = document.getElementById('adminTyping');
      el.textContent = p.typing ? 'Client is typing…' : '';
    });
    socket.on('message', (m) => {
      if (m.ticket_id === currentTicketId) appendMsg(m);
    });
    socket.on('ticket:refresh', () => {
      loadTicketHeader();
      if (currentTicketId) loadMessages();
    });
  }

  async function enterApp() {
    me = await fetch('/api/admin/me', { credentials: 'include' }).then((r) => r.json());
    document.getElementById('adminName').textContent = me.name;
    views.login.style.display = 'none';
    views.app.style.display = 'grid';
    socket.emit('join:admins', {}, () => {});
    await loadTickets();
  }

  async function loadTickets() {
    const list = await fetch(`/api/admin/tickets?filter=${encodeURIComponent(currentFilter)}`, {
      credentials: 'include',
    }).then((r) => r.json());
    const tbody = document.querySelector('#ticketTable tbody');
    tbody.innerHTML = '';
    list.forEach((t) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><code>${window.NX.escapeHtml(t.number)}</code></td>
        <td>${window.NX.escapeHtml(t.title)}</td>
        <td>${window.NX.escapeHtml(t.type)}</td>
        <td>${window.NX.escapeHtml(t.status)}</td>
        <td>${window.NX.escapeHtml(t.admin_name || '—')}</td>
        <td><button class="btn btn-sm btn-primary" type="button">Open</button></td>`;
      tr.querySelector('button').addEventListener('click', () => openTicket(t.id));
      tbody.appendChild(tr);
    });
  }

  async function openTicket(id) {
    currentTicketId = id;
    document.getElementById('chatPanel').style.display = 'flex';
    socket.emit('join:ticket', { ticketId: id, token: '' }, () => {});
    await loadTicketHeader();
    await loadMessages();
  }

  async function loadTicketHeader() {
    const t = await fetch(`/api/tickets/${currentTicketId}`, { credentials: 'include' }).then((r) => r.json());
    document.getElementById('openTitle').textContent = t.title;
    document.getElementById('openMeta').textContent = `${t.number} · ${t.type} · ${t.status}`;
  }

  async function loadMessages() {
    const list = await fetch(`/api/tickets/${currentTicketId}/messages`, { credentials: 'include' }).then((r) =>
      r.json()
    );
    const box = document.getElementById('adminChat');
    box.innerHTML = '';
    list.forEach((m) => appendMsg(m));
    box.scrollTop = box.scrollHeight;
  }

  function appendMsg(m) {
    const box = document.getElementById('adminChat');
    const div = document.createElement('div');
    const isMine = m.sender_type === 'admin';
    div.className = 'msg' + (isMine ? ' me' : '');
    const who = m.sender_type === 'admin' ? m.admin_name || 'Agent' : 'Client';
    let inner = '';
    if (m.msg_type === 'code') {
      inner = `<div class="code-block">${window.NX.escapeHtml(m.body || '')}</div>`;
    } else if (m.attachment_path) {
      if ((m.attachment_mime || '').startsWith('image/')) inner = `<img src="${m.attachment_path}" alt="">`;
      else if ((m.attachment_mime || '').startsWith('audio/')) inner = `<audio controls src="${m.attachment_path}"></audio>`;
      else
        inner = `<a class="btn btn-sm btn-ghost" href="${m.attachment_path}" target="_blank">${window.NX.escapeHtml(
          m.attachment_name || 'file'
        )}</a>`;
      if (m.body) inner += `<div style="margin-top:8px">${window.NX.escapeHtml(m.body)}</div>`;
    } else {
      inner = `<div>${window.NX.escapeHtml(m.body || '')}</div>`;
    }
    div.innerHTML = `<div class="who">${window.NX.escapeHtml(who)}</div>${inner}<div class="time">${new Date(
      m.created_at
    ).toLocaleString()}</div>`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  async function sendText() {
    const el = document.getElementById('adminMsg');
    const body = el.value.trim();
    if (!body || !currentTicketId) return;
    const fd = new FormData();
    fd.set('body', body);
    fd.set('msg_type', 'text');
    await fetch(`/api/tickets/${currentTicketId}/messages`, { method: 'POST', body: fd, credentials: 'include' });
    el.value = '';
  }

  let rec = null;
  async function runAdminAudio() {
    if (!currentTicketId) return;
    if (!rec || rec.state === 'inactive') {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      rec = new MediaRecorder(stream);
      const chunks = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const fd = new FormData();
        fd.set('file', new File([blob], 'admin-note.webm', { type: 'audio/webm' }));
        fd.set('msg_type', 'file');
        await fetch(`/api/tickets/${currentTicketId}/messages`, { method: 'POST', body: fd, credentials: 'include' });
        stream.getTracks().forEach((t) => t.stop());
      };
      rec.start();
      window.NX.toast('Recording', 'Click again to stop');
    } else {
      rec.stop();
    }
  }

  async function act(url) {
    if (!currentTicketId) return;
    await fetch(url, { method: 'POST', credentials: 'include' });
    window.NX.toast('Done', '');
    loadTickets();
    loadTicketHeader();
  }
})();
