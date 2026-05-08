const express = require('express');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const { Guest, Settings } = require('../db');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin')
    return res.status(403).json({ error: 'Admin access required' });
  next();
}

// ── Fixed routes BEFORE /:id ──────────────────────────────────

// Stats — any logged in user
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const total     = await Guest.countDocuments();
    const checkedIn = await Guest.countDocuments({ status: 'used' });
    res.json({ total, checkedIn, remaining: total - checkedIn });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// Search — available to BOTH admin and scanner
router.get('/search', requireAuth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || !q.trim()) return res.json([]);
    const guests = await Guest.find({
      $or: [
        { name:      { $regex: q.trim(), $options: 'i' } },
        { phone:     { $regex: q.trim(), $options: 'i' } },
        { unique_id: { $regex: q.trim(), $options: 'i' } }
      ]
    }).sort({ name: 1 }).limit(10);
    res.json(guests);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// List all — admin only
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { search } = req.query;
    const query = search ? {
      $or: [
        { name:      { $regex: search, $options: 'i' } },
        { phone:     { $regex: search, $options: 'i' } },
        { unique_id: { $regex: search, $options: 'i' } }
      ]
    } : {};
    const guests = await Guest.find(query).sort({ createdAt: -1 });
    res.json(guests);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// Add single guest
router.post('/', requireAdmin, async (req, res) => {
  const { name, phone } = req.body;
  if (!name || !name.trim())
    return res.status(400).json({ error: 'Guest name is required' });
  try {
    const guest = await Guest.create({
      name: name.trim(),
      phone: phone ? phone.trim() : null,
      unique_id: uuidv4(),
      qr_token: uuidv4()
    });
    res.status(201).json(guest);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// Bulk add
router.post('/bulk', requireAdmin, async (req, res) => {
  const { guests } = req.body;
  if (!Array.isArray(guests) || guests.length === 0)
    return res.status(400).json({ error: 'Guests array is required' });
  try {
    const docs = guests
      .filter(g => g.name && g.name.trim())
      .map(g => ({
        name: g.name.trim(),
        phone: g.phone ? g.phone.trim() : null,
        unique_id: uuidv4(),
        qr_token: uuidv4()
      }));
    const created = await Guest.insertMany(docs);
    res.status(201).json(created);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// Scan QR token
router.post('/scan', requireAuth, async (req, res) => {
  const { token } = req.body;
  if (!token)
    return res.status(400).json({ result: 'invalid', message: 'No token provided' });
  try {
    const guest = await Guest.findOne({ qr_token: token.trim() });
    if (!guest)
      return res.json({ result: 'invalid', message: 'Invalid QR Code' });
    if (guest.status === 'used')
      return res.json({
        result: 'used', message: 'Already Checked In',
        guest: { name: guest.name, phone: guest.phone, checked_in_at: guest.checked_in_at }
      });
    guest.status        = 'used';
    guest.checked_in_at = new Date();
    guest.checked_in_by = req.session.user.username;
    await guest.save();
    const io = req.app.get('io');
    if (io) io.emit('guest_checked_in', {
      id: guest._id, name: guest.name, phone: guest.phone,
      status: guest.status, checked_in_at: guest.checked_in_at,
      checked_in_by: guest.checked_in_by
    });
    res.json({
      result: 'granted', message: 'Access Granted',
      guest: { name: guest.name, phone: guest.phone, checked_in_at: guest.checked_in_at }
    });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// Bulk QR data — returns all guests with their QR data URLs
router.get('/allqr', requireAdmin, async (req, res) => {
  try {
    const guests = await Guest.find().sort({ name: 1 });
    const eventSetting = await Settings.findOne({ key: 'event_name' });
    const eventName = eventSetting ? eventSetting.value : 'Our Wedding';

    const results = await Promise.all(guests.map(async (g) => {
      const qrDataUrl = await QRCode.toDataURL(g.qr_token, {
        width: 300, margin: 2,
        color: { dark: '#1a1a2e', light: '#ffffff' }
      });
      return {
        id: g._id, name: g.name, phone: g.phone,
        qr_token: g.qr_token, status: g.status, qrDataUrl, eventName
      };
    }));
    res.json(results);
  } catch (err) {
    console.error('Bulk QR error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ── /:id routes LAST ──────────────────────────────────────────

// Get single guest QR
router.get('/:id/qr', requireAdmin, async (req, res) => {
  try {
    const guest = await Guest.findById(req.params.id);
    if (!guest) return res.status(404).json({ error: 'Guest not found' });
    const eventSetting = await Settings.findOne({ key: 'event_name' });
    const eventName = eventSetting ? eventSetting.value : 'Our Wedding';
    const qrDataUrl = await QRCode.toDataURL(guest.qr_token, {
      width: 300, margin: 2,
      color: { dark: '#1a1a2e', light: '#ffffff' }
    });
    res.json({ qrDataUrl, guest, eventName });
  } catch (err) {
    console.error('QR error:', err);
    res.status(500).json({ error: 'Failed to generate QR code: ' + err.message });
  }
});

// Delete all
router.delete('/all', requireAdmin, async (req, res) => {
  try {
    await Guest.deleteMany({});
    res.json({ success: true });
  } catch (err) {
    console.error('Delete all error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// Delete single
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const guest = await Guest.findOneAndDelete({ _id: req.params.id });
    if (!guest) return res.status(404).json({ error: 'Guest not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

module.exports = router;
