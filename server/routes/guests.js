const express = require('express');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const db = require('../db');

const router = express.Router();

// ── Middleware ────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ── GET /api/guests ───────────────────────────────────────────
router.get('/', requireAdmin, (req, res) => {
  const { search } = req.query;
  let guests = db.get('guests').value();

  if (search) {
    const q = search.toLowerCase();
    guests = guests.filter(g =>
      g.name.toLowerCase().includes(q) ||
      (g.phone && g.phone.includes(q)) ||
      g.unique_id.toLowerCase().includes(q)
    );
  }

  // Return newest first
  guests = [...guests].reverse();
  res.json(guests);
});

// ── GET /api/guests/stats ─────────────────────────────────────
router.get('/stats', requireAuth, (req, res) => {
  const guests = db.get('guests').value();
  const total = guests.length;
  const checkedIn = guests.filter(g => g.status === 'used').length;
  res.json({ total, checkedIn, remaining: total - checkedIn });
});

// ── POST /api/guests ──────────────────────────────────────────
router.post('/', requireAdmin, (req, res) => {
  const { name, phone } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Guest name is required' });
  }

  const guest = {
    id: Date.now(),
    name: name.trim(),
    phone: phone ? phone.trim() : null,
    unique_id: uuidv4(),
    qr_token: uuidv4(),
    status: 'unused',
    checked_in_at: null,
    checked_in_by: null,
    created_at: new Date().toISOString()
  };

  db.get('guests').push(guest).write();
  res.status(201).json(guest);
});

// ── POST /api/guests/bulk ─────────────────────────────────────
router.post('/bulk', requireAdmin, (req, res) => {
  const { guests } = req.body;

  if (!Array.isArray(guests) || guests.length === 0) {
    return res.status(400).json({ error: 'Guests array is required' });
  }

  const created = [];
  for (const g of guests) {
    if (!g.name || !g.name.trim()) continue;
    const guest = {
      id: Date.now() + Math.random(),
      name: g.name.trim(),
      phone: g.phone ? g.phone.trim() : null,
      unique_id: uuidv4(),
      qr_token: uuidv4(),
      status: 'unused',
      checked_in_at: null,
      checked_in_by: null,
      created_at: new Date().toISOString()
    };
    db.get('guests').push(guest).write();
    created.push(guest);
  }

  res.status(201).json(created);
});

// ── GET /api/guests/:id/qr ────────────────────────────────────
router.get('/:id/qr', requireAdmin, async (req, res) => {
  const guest = db.get('guests').find({ id: Number(req.params.id) }).value();
  if (!guest) return res.status(404).json({ error: 'Guest not found' });

  try {
    const qrDataUrl = await QRCode.toDataURL(guest.qr_token, {
      width: 300,
      margin: 2,
      color: { dark: '#1a1a2e', light: '#ffffff' }
    });
    res.json({ qrDataUrl, guest });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// ── DELETE /api/guests/:id ────────────────────────────────────
router.delete('/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const guest = db.get('guests').find({ id }).value();
  if (!guest) return res.status(404).json({ error: 'Guest not found' });

  db.get('guests').remove({ id }).write();
  res.json({ success: true });
});

// ── POST /api/guests/scan ─────────────────────────────────────
router.post('/scan', requireAuth, (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ result: 'invalid', message: 'No token provided' });
  }

  const guest = db.get('guests').find({ qr_token: token.trim() }).value();

  if (!guest) {
    return res.json({ result: 'invalid', message: 'Invalid QR Code' });
  }

  if (guest.status === 'used') {
    return res.json({
      result: 'used',
      message: 'Already Checked In',
      guest: { name: guest.name, phone: guest.phone, checked_in_at: guest.checked_in_at }
    });
  }

  // Mark as used
  const now = new Date().toISOString();
  const scannedBy = req.session.user.username;

  db.get('guests')
    .find({ qr_token: token.trim() })
    .assign({ status: 'used', checked_in_at: now, checked_in_by: scannedBy })
    .write();

  const updated = db.get('guests').find({ qr_token: token.trim() }).value();

  // Emit real-time event
  const io = req.app.get('io');
  if (io) {
    io.emit('guest_checked_in', {
      id: updated.id,
      name: updated.name,
      phone: updated.phone,
      status: updated.status,
      checked_in_at: updated.checked_in_at,
      checked_in_by: updated.checked_in_by
    });
  }

  res.json({
    result: 'granted',
    message: 'Access Granted',
    guest: { name: updated.name, phone: updated.phone, checked_in_at: updated.checked_in_at }
  });
});

module.exports = router;
