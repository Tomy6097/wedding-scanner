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

// GET /api/events — list all events with guest counts
router.get('/', requireAuth, async (req, res) => {
  try {
    const events = await Event.find().sort({ createdAt: -1 });
    const result = await Promise.all(events.map(async (e) => {
      const total     = await Guest.countDocuments({ event_id: e._id });
      const checkedIn = await Guest.countDocuments({ event_id: e._id, status: 'used' });
      return { ...e.toObject(), total, checkedIn, remaining: total - checkedIn };
    }));
    res.json(result);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// POST /api/events — create event
router.post('/', requireAdmin, async (req, res) => {
  const { name, client_name, date, venue, color } = req.body;
  if (!name || !name.trim())
    return res.status(400).json({ error: 'Event name is required' });
  try {
    const event = await Event.create({
      name: name.trim(),
      client_name: client_name ? client_name.trim() : null,
      date: date ? new Date(date) : null,
      venue: venue ? venue.trim() : null,
      color: color || '#7c3aed'
    });
    res.status(201).json(event);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// PUT /api/events/:id — update event
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

// DELETE /api/events/:id — delete event and all its guests
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
