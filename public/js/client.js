/**
 * Client site: landing + ticket dashboard (chat, uploads, payments).
 */
(function () {
  const page = document.body.dataset.page;
  if (page === 'home') initHome();
  if (page === 'dashboard') initDashboard();

  async function initHome() {
    await window.NX.loadConfig();
    const modal = document.getElementById('ticketModal');
    const open = document.getElementById('openTicketModal');
    const close = document.getElementById('closeTicketModal');
    const form = document.getElementById('ticketForm');

    open.addEventListener('click', () => modal.classList.add('open'));
    close.addEventListener('click', () => modal.classList.remove('open'));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('open');
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const payload = Object.fromEntries(fd.entries());
      try {
        const data = await window.NX.apiJson('/api/tickets', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        window.NX.toast('Ticket created', data.number);
        localStorage.setItem('nx_ticket_' + data.id, data.access_token);
        window.location.href = `/dashboard.html?id=${encodeURIComponent(data.id)}&token=${encodeURIComponent(
          data.access_token
        )}`;
      } catch (err) {
        window.NX.toast('Error', err.message);
      }
    });
  }

  async function initDashboard() {
    const cfg = await window.NX.loadConfig();
    const params = new URLSearchParams(location.search);
    let ticketId = params.get('id');
    let token = params.get('token');

    if (!ticketId || !token) {
      window.NX.toast('Missing ticket', 'Open from your ticket link or create a new one.');
    }

    const socket = window.NX.connectSocket();

    const listActive = document.getElementById('listActive');
    const listClosed = document.getElementById('listClosed');
    const chatEl = document.getElementById('chatMessages');
    const ticketTitle = document.getElementById('ticketTitle');
    const ticketType = document.getElementById('ticketType');
    const ticketStatus = document.getElementById('ticketStatus');
    const msgInput = document.getElementById('msgInput');
    const sendBtn = document.getElementById('sendBtn');
    const fileInput = document.getElementById('fileInput');
    const audioBtn = document.getElementById('audioBtn');
    const payBtn = document.getElementById('payBtn');
    const closeReqBtn = document.getElementById('closeReqBtn');
    const typingEl = document.getElementById('typingInd');
    const menuBtn = document.getElementById('menuBtn');
    const dropdown = document.getElementById('ticketMenu');
    const infoPanel = document.getElementById('infoPanel');

    let currentTicket = null;
    let mediaRecorder = null;
    let audioChunks = [];

    try {
      const tickets = await fetch('/api/client/tickets', { credentials: 'include' }).then((r) => r.json());
      if (!ticketId && tickets.length) {
        ticketId = tickets[0].id;
        token = localStorage.getItem('nx_ticket_' + ticketId) || token;
      }
      renderSidebar(tickets, ticketId);
    } catch (_e) {
      /* guest session */
    }

    menuBtn.addEventListener('click', () => dropdown.classList.toggle('open'));
    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target)) dropdown.classList.remove('open');
    });

    if (ticketId && token) {
      socket.emit('join:ticket', { ticketId, token }, () => {});
      await loadTicket();
      await loadMessages();
    }

    socket.on('message', (m) => {
      if (m.ticket_id === ticketId) appendMessage(m, cfg);
    });
    socket.on('ticket:refresh', () => loadTicket());
    socket.on('typing', (p) => {
      if (p.ticketId !== ticketId) return;
      typingEl.textContent = p.typing ? 'Support is typing…' : '';
    });

    let typingTimer = null;
    msgInput.addEventListener('input', () => {
      socket.emit('typing', { ticketId, token, typing: true });
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => socket.emit('typing', { ticketId, token, typing: false }), 900);
    });

    sendBtn.addEventListener('click', () => sendMessage());
    msgInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    fileInput.addEventListener('change', async () => {
      const f = fileInput.files[0];
      if (!f) return;
      await uploadFile(f);
      fileInput.value = '';
    });

    audioBtn.addEventListener('click', async () => {
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          mediaRecorder = new MediaRecorder(stream);
          audioChunks = [];
          mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
          mediaRecorder.onstop = async () => {
            const blob = new Blob(audioChunks, { type: 'audio/webm' });
            await uploadFile(new File([blob], 'voice.webm', { type: 'audio/webm' }));
            stream.getTracks().forEach((t) => t.stop());
          };
          mediaRecorder.start();
          audioBtn.textContent = 'Stop';
          window.NX.toast('Recording', 'Click stop to send');
        } catch (_e) {
          window.NX.toast('Mic blocked', 'Allow microphone access');
        }
      } else {
        mediaRecorder.stop();
        audioBtn.textContent = 'Audio';
      }
    });

    payBtn.addEventListener('click', () => document.getElementById('payModal').classList.add('open'));
    document.getElementById('closePay').addEventListener('click', () => document.getElementById('payModal').classList.remove('open'));
    document.getElementById('payForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = Object.fromEntries(fd.entries());
      try {
        await window.NX.apiJson(`/api/tickets/${ticketId}/payment`, {
          method: 'POST',
          body: JSON.stringify({ ...body, token }),
        });
        document.getElementById('payModal').classList.remove('open');
        window.NX.toast('Payment recorded', 'Your team will confirm shortly.');
      } catch (err) {
        window.NX.toast('Error', err.message);
      }
    });

    closeReqBtn.addEventListener('click', async () => {
      try {
        await window.NX.apiJson(`/api/tickets/${ticketId}/close-request`, {
          method: 'POST',
          body: JSON.stringify({ token }),
        });
        window.NX.toast('Requested', 'Close request sent');
      } catch (err) {
        window.NX.toast('Error', err.message);
      }
    });

    async function loadTicket() {
      const r = await fetch(`/api/tickets/${ticketId}?token=${encodeURIComponent(token)}`);
      if (!r.ok) return;
      currentTicket = await r.json();
      ticketTitle.textContent = currentTicket.title;
      ticketType.textContent = currentTicket.type === 'order' ? 'Order ticket' : 'Support ticket';
      ticketStatus.textContent = currentTicket.status;
      infoPanel.innerHTML = `
        <div class="muted">Ticket ID</div><div><code>${currentTicket.id}</code></div>
        <div class="muted">Number</div><div>${currentTicket.number}</div>
        <div class="muted">Created</div><div>${fmtDate(currentTicket.created_at)}</div>
        <div class="muted">Assigned</div><div>${currentTicket.admin_name || '—'}</div>
        <div class="muted">Muted until</div><div>${currentTicket.client_muted_until ? fmtDate(currentTicket.client_muted_until) : '—'}</div>
        <div class="muted">Close request</div><div>${currentTicket.close_requested_by || '—'}</div>
      `;
    }

    async function loadMessages() {
      const r = await fetch(`/api/tickets/${ticketId}/messages?token=${encodeURIComponent(token)}`);
      const list = await r.json();
      chatEl.innerHTML = '';
      list.forEach((m) => appendMessage(m, cfg));
      chatEl.scrollTop = chatEl.scrollHeight;
    }

    function appendMessage(m, c) {
      const div = document.createElement('div');
      const me = m.sender_type === 'client';
      div.className = 'msg' + (me ? ' me' : '');
      const who = m.sender_type === 'admin' ? m.admin_name || 'Support' : 'You';
      let inner = '';
      if (m.msg_type === 'code') {
        let lang = 'plaintext';
        try {
          lang = JSON.parse(m.meta_json || '{}').lang || lang;
        } catch (_e) {}
        inner += `<div class="code-block"><span class="muted" style="display:block;margin-bottom:6px">${lang}</span>${window.NX.escapeHtml(
          m.body || ''
        )}</div>`;
      } else if (m.msg_type === 'payment') {
        inner += `<div>${window.NX.escapeHtml(m.body || '')}</div>`;
      } else if (m.attachment_path) {
        if ((m.attachment_mime || '').startsWith('image/')) {
          inner += `<img src="${m.attachment_path}" alt="">`;
        } else if ((m.attachment_mime || '').startsWith('video/')) {
          inner += `<video controls src="${m.attachment_path}"></video>`;
        } else if ((m.attachment_mime || '').startsWith('audio/')) {
          inner += `<audio controls src="${m.attachment_path}"></audio>`;
        } else {
          inner += `<a class="btn btn-sm btn-ghost" href="${m.attachment_path}" target="_blank" rel="noreferrer">Download ${window.NX.escapeHtml(
            m.attachment_name || 'file'
          )}</a>`;
        }
        if (m.body) inner += `<div style="margin-top:8px">${window.NX.escapeHtml(m.body)}</div>`;
      } else {
        inner += `<div>${window.NX.escapeHtml(m.body || '')}</div>`;
      }
      div.innerHTML = `<div class="who">${window.NX.escapeHtml(who)}</div>${inner}<div class="time">${fmtDate(
        m.created_at
      )}</div>`;
      chatEl.appendChild(div);
      chatEl.scrollTop = chatEl.scrollHeight;
    }

    async function sendMessage() {
      const body = msgInput.value.trim();
      if (!body) return;
      const fd = new FormData();
      fd.set('body', body);
      fd.set('msg_type', 'text');
      fd.set('token', token);
      const r = await fetch(`/api/tickets/${ticketId}/messages`, { method: 'POST', body: fd, credentials: 'include' });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        window.NX.toast('Error', err.error || 'Send failed');
        return;
      }
      msgInput.value = '';
    }

    async function uploadFile(file) {
      const fd = new FormData();
      fd.set('file', file);
      fd.set('token', token);
      fd.set('msg_type', 'file');
      const r = await fetch(`/api/tickets/${ticketId}/messages`, { method: 'POST', body: fd, credentials: 'include' });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        window.NX.toast('Upload failed', err.error || '');
      }
    }

    function renderSidebar(tickets, activeId) {
      listActive.innerHTML = '';
      listClosed.innerHTML = '';
      tickets.forEach((t) => {
        const btn = document.createElement('button');
        btn.className = 'list-btn' + (t.id === activeId ? ' active' : '');
        btn.innerHTML = `<div><strong>${window.NX.escapeHtml(t.title)}</strong></div><div class="muted">${t.number} · ${t.status}</div>`;
        btn.addEventListener('click', () => {
          const tok = localStorage.getItem('nx_ticket_' + t.id) || token;
          window.location.href = `/dashboard.html?id=${encodeURIComponent(t.id)}&token=${encodeURIComponent(tok)}`;
        });
        if (t.status === 'closed') listClosed.appendChild(btn);
        else listActive.appendChild(btn);
      });
    }

    function fmtDate(iso) {
      try {
        const d = new Date(iso);
        return d.toLocaleString();
      } catch (_e) {
        return iso;
      }
    }

    /* Populate payment methods */
    const sel = document.getElementById('payMethod');
    cfg.paymentMethods.forEach((m) => {
      const o = document.createElement('option');
      o.value = m;
      o.textContent = m;
      sel.appendChild(o);
    });
  }
})();
