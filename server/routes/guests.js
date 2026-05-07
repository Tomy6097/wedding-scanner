const express = require('express');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const { Guest } = require('../db');

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

router.get('/stats', requireAuth, async (req, res) => {
  try {
    const total     = await Guest.countDocuments();
    const checkedIn = await Guest.countDocuments({ status: 'used' });
    res.json({ total, checkedIn, remaining: total - checkedIn });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

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

router.get('/:id/qr', requireAdmin, async (req, res) => {
  try {
    const guest = await Guest.findById(req.params.id);
    if (!guest) return res.status(404).json({ error: 'Guest not found' });
    const qrDataUrl = await QRCode.toDataURL(guest.qr_token, {
      width: 300, margin: 2,
      color: { dark: '#1a1a2e', light: '#ffffff' }
    });
    res.json({ qrDataUrl, guest });
  } catch (err) { res.status(500).json({ error: 'Failed to generate QR code' }); }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const guest = await Guest.findByIdAndDelete(req.params.id);
    if (!guest) return res.status(404).json({ error: 'Guest not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

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

module.exports = router;
