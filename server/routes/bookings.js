const express = require('express');
const { Booking } = require('../db');
const router = express.Router();

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin')
    return res.status(403).json({ error: 'Admin access required' });
  next();
}

// POST /api/bookings — public, from landing page
router.post('/', async (req, res) => {
  const { name, phone, event_date, package: pkg, message } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  if (!phone || !phone.trim()) return res.status(400).json({ error: 'Phone is required' });
  try {
    const booking = await Booking.create({
      name:       name.trim(),
      phone:      phone.trim(),
      event_date: event_date || null,
      package:    pkg || null,
      message:    message ? message.trim() : null
    });
    res.status(201).json({ success: true, message: 'Booking received! We will contact you soon.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/bookings — admin only
router.get('/', requireAdmin, async (req, res) => {
  try {
    const bookings = await Booking.find().sort({ createdAt: -1 });
    res.json(bookings);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// PATCH /api/bookings/:id — update status or notes
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    res.json(booking);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/bookings/:id
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await Booking.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
