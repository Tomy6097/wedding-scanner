const express = require('express');
const { Event, Guest, Activity } = require('../db');
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

// GET /api/events — list events
// Admin sees all fields including PIN
// Scanner sees events but PIN is hidden
router.get('/', requireAuth, async (req, res) => {
  try {
    const isAdmin = req.session.user.role === 'admin';
    const events  = await Event.find().sort({ createdAt: -1 });
    const result  = await Promise.all(events.map(async (e) => {
      const total     = await Guest.countDocuments({ event_id: e._id });
      const checkedIn = await Guest.countDocuments({ event_id: e._id, status: 'used' });
      const obj       = e.toObject();
      // Hide PIN value from scanners but tell them if a PIN exists
      if (!isAdmin) {
        obj.has_pin = !!e.pin;
        delete obj.pin;
      }
      return { ...obj, total, checkedIn, remaining: total - checkedIn };
    }));
    res.json(result);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// POST /api/events — create event (admin only)
router.post('/', requireAdmin, async (req, res) => {
  const { name, client_name, date, venue, color, pin } = req.body;
  if (!name || !name.trim())
    return res.status(400).json({ error: 'Event name is required' });
  try {
    const event = await Event.create({
      name:        name.trim(),
      client_name: client_name ? client_name.trim() : null,
      date:        date ? new Date(date) : null,
      venue:       venue ? venue.trim() : null,
      color:       color || '#7c3aed',
      pin:         pin ? String(pin).trim() : null
    });
    res.status(201).json(event);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// PUT /api/events/:id — update event (admin only)
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    if (!event) return res.status(404).json({ error: 'Event not found' });
    res.json(event);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// POST /api/events/:id/verify-pin — scanner verifies PIN before accessing event
router.post('/:id/verify-pin', requireAuth, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    // If no PIN set, allow access freely
    if (!event.pin) return res.json({ success: true });

    const { pin } = req.body;
    if (!pin) return res.status(400).json({ error: 'PIN is required' });

    if (String(pin).trim() !== String(event.pin).trim()) {
      return res.status(401).json({ error: 'Incorrect PIN' });
    }

    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/events/:id — delete event and all its guests (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    await Guest.deleteMany({ event_id: req.params.id });
    await Activity.deleteMany({ event_id: req.params.id });
    await Event.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// GET /api/events/:id/stats
router.get('/:id/stats', requireAuth, async (req, res) => {
  try {
    const total     = await Guest.countDocuments({ event_id: req.params.id });
    const checkedIn = await Guest.countDocuments({ event_id: req.params.id, status: 'used' });
    res.json({ total, checkedIn, remaining: total - checkedIn });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
