# 💍 Wedding QR Check-in System

A full-stack web application for managing guest check-ins at a wedding using QR codes.

---

## Features

- **Admin Dashboard** — Add guests, generate QR codes, view real-time stats
- **Scanner Page** — Camera-based QR scanning with instant feedback
- **Real-time Sync** — Multiple devices stay in sync via Socket.io
- **One-time Use QR** — Each QR code can only be scanned once
- **Manual Search** — Fallback search by name or phone
- **Bulk Import** — Upload a CSV to add many guests at once
- **Export CSV** — Download the full guest list with check-in status
- **Audio Feedback** — Distinct tones for success and failure
- **Mobile-friendly** — Designed for phones at the entrance

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Start the server

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

### 3. Open in browser

```
http://localhost:3000
```

---

## Default Credentials

| Role    | Username  | Password     |
|---------|-----------|--------------|
| Admin   | `admin`   | `admin123`   |
| Scanner | `scanner` | `scanner123` |

> **Change these passwords** before using in production (see below).

---

## Usage Guide

### Admin Workflow

1. Log in as **admin**
2. Go to **Add Guest** tab → enter name and phone → click "Add Guest & Generate QR"
3. A QR code appears — download or print it for the guest
4. Repeat for all guests, or use **Bulk Import** with a CSV file
5. On the day of the event, monitor the **Overview** tab for live check-in counts

### CSV Bulk Import Format

```
name,phone
John Smith,+1 555 0100
Jane Doe,+1 555 0101
```

The header row is optional. Phone is optional.

### Scanner Workflow

1. Log in as **scanner** on a phone or tablet
2. Click **Start Camera**
3. Point the camera at a guest's QR code
4. The result appears immediately:
   - 🟢 **Access Granted** — guest is checked in
   - 🔴 **Already Checked In** — QR was already used
   - 🟡 **Invalid QR Code** — not a valid code
5. Use **Manual Search** if the QR can't be scanned

---

## Changing Passwords

Connect to the SQLite database and update the hashed passwords:

```bash
node -e "
const bcrypt = require('bcryptjs');
const db = require('./server/db');
const hash = bcrypt.hashSync('YOUR_NEW_PASSWORD', 10);
db.prepare(\"UPDATE users SET password = ? WHERE username = ?\").run(hash, 'admin');
console.log('Password updated');
"
```

---

## Project Structure

```
wedding-checkin/
├── server/
│   ├── index.js          # Express + Socket.io server
│   ├── db.js             # SQLite setup and seeding
│   └── routes/
│       ├── auth.js       # Login / logout / session
│       └── guests.js     # Guest CRUD + QR + scan
├── public/
│   ├── index.html        # Single-page app
│   ├── css/
│   │   └── style.css     # All styles
│   └── js/
│       └── app.js        # Frontend logic
├── data/                 # SQLite database (auto-created)
├── package.json
└── README.md
```

---

## Environment Variables

Create a `.env` file (optional):

```
PORT=3000
SESSION_SECRET=your-very-secret-key-here
```

---

## Production Deployment

### Using PM2

```bash
npm install -g pm2
pm2 start server/index.js --name wedding-checkin
pm2 save
pm2 startup
```

### Using a reverse proxy (nginx)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

For HTTPS (required for camera access on mobile), use Let's Encrypt with Certbot.

> **Note:** Camera access requires HTTPS in production. On a local network, `http://` works fine.

---

## Tech Stack

- **Backend:** Node.js, Express, Socket.io
- **Database:** SQLite (via better-sqlite3) — zero config, file-based
- **QR Generation:** qrcode
- **QR Scanning:** html5-qrcode (browser camera API)
- **Auth:** express-session + bcryptjs
- **Real-time:** Socket.io
