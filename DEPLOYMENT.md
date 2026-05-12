# Vercel Deployment Guide

## Project Structure
This project has been converted to Vercel's serverless architecture:

```
├── api/                    # Vercel serverless functions
│   ├── _lib/               # Shared libraries
│   ├── admin/              # Admin API endpoints
│   ├── client/             # Client API endpoints
│   ├── owner/              # Owner API endpoints
│   └── tickets/            # Ticket API endpoints
├── public/                 # Static frontend files
├── uploads/                # File upload directory
└── vercel.json           # Vercel configuration
```

## API Endpoints

### Public APIs
- `GET /api/config` - Get public configuration
- `POST /api/tickets` - Create new ticket
- `GET /api/tickets/[id]` - Get ticket details
- `GET /api/tickets/[id]/messages` - Get ticket messages
- `POST /api/tickets/[id]/messages` - Send message
- `POST /api/tickets/[id]/payment` - Record payment
- `POST /api/tickets/[id]/close-request` - Request close
- `GET /api/client/tickets` - Get client tickets

### Admin APIs
- `POST /api/admin/login` - Admin login
- `POST /api/admin/logout` - Admin logout
- `GET /api/admin/me` - Get admin info
- `GET /api/admin/tickets` - List tickets
- `POST /api/admin/tickets/[id]/claim` - Claim ticket
- `POST /api/admin/tickets/[id]/recall` - Recall support
- `POST /api/admin/tickets/[id]/pause` - Pause ticket
- `POST /api/admin/tickets/[id]/unpause` - Unpause ticket
- `POST /api/admin/tickets/[id]/close` - Close ticket
- `POST /api/admin/tickets/[id]/mute` - Mute client

### Owner APIs
- `POST /api/owner/login` - Owner login
- `POST /api/owner/logout` - Owner logout
- `GET /api/owner/stats` - Get statistics
- `GET/POST/DELETE /api/owner/admins` - Manage admins
- `GET /api/owner/points` - Get points board
- `GET /api/owner/tickets` - List all tickets
- `GET /api/owner/logs` - Get logs
- `POST /api/owner/ban` - Ban user
- `POST /api/owner/settings` - Update settings

## Static Routes
- `/admin` → `/public/admin.html`
- `/owner` → `/public/owner.html`
- `/dashboard` → `/public/dashboard.html`
- `/` → `/public/index.html`

## Environment Variables
Set these in your Vercel dashboard:

```bash
SESSION_SECRET=your-session-secret
NEXUS_ADMIN_EMAIL=admin@example.com
NEXUS_ADMIN_PASSWORD=admin-password
NEXUS_OWNER_EMAIL=owner@example.com
NEXUS_OWNER_PASSWORD=owner-password
NEXUS_WEBSITE_NAME=Wailand Team
NEXUS_LOGO_TEXT=W
NEXUS_CURRENCY_CODE=USD
NEXUS_CURRENCY_SYMBOL=$
NEXUS_PAYMENT_METHODS=Card,PayPal,Bank transfer
NEXUS_UPLOAD_MB=25
NEXUS_DOMAIN=yourdomain.com
NEXUS_SOUNDS=1
NEXUS_COLOR_MAIN=#6366f1
NEXUS_COLOR_SECONDARY=#22d3ee
```

## Deployment Steps

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "production ready setup"
   git push origin main
   ```

2. **Deploy to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import your GitHub repository
   - Vercel will automatically detect the configuration
   - Add environment variables
   - Deploy

## Features
- ✅ Serverless API functions
- ✅ Static file serving
- ✅ File uploads with validation
- ✅ Session management
- ✅ Rate limiting
- ✅ Error handling
- ✅ CORS support
- ✅ Asset optimization
- ✅ Production-ready configuration
