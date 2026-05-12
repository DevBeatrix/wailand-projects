<<<<<<< HEAD
# Wailand Team — Support & Ticket System

Premium ticket and support SaaS platform built with **Express**, **Socket.io**, and **JSON file storage**.

## Features

- 🎫 **Ticket System** — Order & support ticket creation with real-time chat
- 👨‍💼 **Admin Panel** — Live queue management, claim/recall/pause/mute/close tickets
- 👑 **Owner Console** — Analytics, admin management, bans, system logs, global settings
- 💳 **Payments** — Record payments with configurable methods and currencies
- 📎 **File Uploads** — Images, videos, audio, PDFs, and more
- 🎙️ **Voice Messages** — Record and send audio directly in chat
- 🔔 **Real-time Notifications** — Toasts, sounds, and typing indicators via Socket.io
- 🎨 **Glassmorphism UI** — Dark premium theme with animations
- 📁 **JSON Storage** — All data stored in separate JSON files (`data/`)

## Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm start
```

Server runs at `http://localhost:3000` by default.

## Environment Variables (`.env`)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `SESSION_SECRET` | `wailand-secret-...` | Session encryption secret |
| `NEXUS_ADMIN_EMAIL` | `admin@wailand.com` | Default admin email |
| `NEXUS_ADMIN_PASSWORD` | `wailandadmin` | Default admin password |
| `NEXUS_OWNER_EMAIL` | `owner@wailand.com` | Owner email |
| `NEXUS_OWNER_PASSWORD` | `wailandowner` | Owner password |
| `NEXUS_WEBSITE_NAME` | `Wailand Team` | Displayed site name |
| `NEXUS_LOGO_TEXT` | `W` | Logo letter/text |
| `NEXUS_DOMAIN` | `localhost` | Domain name |
| `NEXUS_CURRENCY_CODE` | `USD` | Currency code |
| `NEXUS_CURRENCY_SYMBOL` | `$` | Currency symbol |
| `NEXUS_PAYMENT_METHODS` | `Card,PayPal,Bank transfer` | Comma-separated payment methods |
| `NEXUS_UPLOAD_MB` | `25` | Max upload size in MB |
| `NEXUS_SOUNDS` | `1` | Enable notification sounds (`0` to disable) |
| `NEXUS_COLOR_MAIN` | `#6366f1` | Primary brand color |
| `NEXUS_COLOR_SECONDARY` | `#22d3ee` | Secondary brand color |

## Data Storage

All data is stored as JSON files in the `data/` directory:

| File | Contents |
|---|---|
| `settings.json` | App configuration & branding |
| `users.json` | Client accounts |
| `admins.json` | Admin accounts & points |
| `tickets.json` | All tickets |
| `messages.json` | Chat messages |
| `payments.json` | Payment records |
| `notifications.json` | System notifications |
| `logs.json` | Activity logs |

## Routes

| URL | Description |
|---|---|
| `/` | Landing page — create tickets |
| `/dashboard.html` | Client ticket dashboard & chat |
| `/admin` | Admin operations panel |
| `/owner` | Owner management console |

## License

© Wailand Team


firebase deploy

<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Wailand Team</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="/css/app.css" />
  </head>
  <body data-page="home">
    <header class="nav">
      <div class="shell nav-inner">
        <a href="/" class="brand">
          <span class="brand-mark" data-logo-text>W</span>
          <span data-site-name>Wailand Team</span>
        </a>
        <nav class="nav-links">
          <a class="btn btn-ghost btn-sm" href="/dashboard.html">My tickets</a>
          <a class="btn btn-ghost btn-sm" href="/admin">Admin</a>
          <a class="btn btn-ghost btn-sm" href="/owner">Owner</a>
          <button type="button" class="btn btn-primary btn-sm" id="openTicketModal">Create ticket</button>
        </nav>
      </div>
    </header>

    <main class="shell hero">
      <div class="hero-grid">
        <div>
          <p class="pill pill-live" style="width: fit-content; margin-bottom: 1rem">Realtime · Secure · Premium</p>
          <h1 class="h1">Support that feels <span style="color: var(--accent)">instant</span>.</h1>
          <p class="lead">
            Glass dashboards, live chat, rich media, and intelligent routing — engineered for teams who expect a
            flagship experience.
          </p>
          <div style="display: flex; flex-wrap: wrap; gap: 0.75rem">
            <button type="button" class="btn btn-primary" id="openTicketModal2">Start a ticket</button>
            <a class="btn btn-ghost" href="/dashboard.html">View dashboard</a>
          </div>
        </div>
        <div class="card glow hero-visual" aria-hidden="true">
          <div class="hero-visual-inner">
            <div class="fake-row" style="width: 70%"></div>
            <div class="fake-row" style="width: 45%"></div>
            <div class="fake-row" style="width: 88%"></div>
            <div class="fake-row" style="width: 60%"></div>
            <div style="margin-top: 1rem" class="card card-pad">
              <div class="muted" style="font-size: 0.8rem">Live queue</div>
              <div style="font-size: 1.5rem; font-weight: 700; margin-top: 0.35rem">Fluid motion</div>
              <div class="muted" style="margin-top: 0.35rem">Agents see claims, recalls, and typing in real time.</div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <footer class="footer shell">
      <div>© <span data-site-name>Wailand Team</span> — crafted for modern operations teams.</div>
    </footer>

    <div class="modal-backdrop" id="ticketModal" aria-hidden="true">
      <div class="modal card card-pad">
        <div class="modal-head">
          <h2 class="modal-title">Create ticket</h2>
          <button type="button" class="btn btn-ghost btn-sm" id="closeTicketModal">Close</button>
        </div>
        <form id="ticketForm">
          <label>Ticket type</label>
          <select class="input" name="type" required>
            <option value="order">Order ticket</option>
            <option value="support">Support ticket</option>
          </select>
          <div class="grid2" style="margin-top: 0.85rem">
            <div>
              <label>Title</label>
              <input class="input" name="title" required placeholder="Short summary" />
            </div>
            <div>
              <label>Priority</label>
              <select class="input" name="priority" required>
                <option value="low">Low</option>
                <option value="normal" selected>Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
          <div class="grid2" style="margin-top: 0.85rem">
            <div>
              <label>Email</label>
              <input class="input" type="email" name="email" required />
            </div>
            <div>
              <label>Phone</label>
              <input class="input" type="tel" name="phone" placeholder="Optional" />
            </div>
          </div>
          <div style="margin-top: 0.85rem">
            <label>Description</label>
            <textarea class="input" name="description" placeholder="What do you need?"></textarea>
          </div>
          <div style="margin-top: 1rem; display: flex; justify-content: flex-end; gap: 0.5rem">
            <button type="button" class="btn btn-ghost" id="closeTicketModal2">Cancel</button>
            <button type="submit" class="btn btn-primary">Submit</button>
          </div>
        </form>
      </div>
    </div>

    <script>
      document.getElementById('openTicketModal2').addEventListener('click', () => {
        document.getElementById('ticketModal').classList.add('open');
      });
      document.getElementById('closeTicketModal2').addEventListener('click', () => {
        document.getElementById('ticketModal').classList.remove('open');
      });
    </script>
    <script src="https://cdn.socket.io/4.8.1/socket.io.min.js" crossorigin="anonymous"></script>
    <script src="/js/core.js"></script>
    <script src="/js/client.js"></script>
  </body>
</html>
=======
# wailand-projects
>>>>>>> b6f9d4a7c1a59361795a6ec2f8dd8619f8693a09
