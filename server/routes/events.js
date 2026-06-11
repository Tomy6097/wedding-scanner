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
      const evGuests  = await Guest.find({ event_id: e._id }, 'ticket_type status scan_count');
      const total     = evGuests.reduce((s, g) => s + (g.ticket_type === 'D' ? 2 : 1), 0);
      const checkedIn = evGuests.reduce((s, g) => {
        if (g.ticket_type === 'D') return s + (g.status === 'used' ? 2 : g.scan_count === 1 ? 1 : 0);
        return s + (g.status === 'used' ? 1 : 0);
      }, 0);
      const obj = e.toObject();
      if (!isAdmin) { obj.has_pin = !!e.pin; delete obj.pin; }
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

// GET /api/events/sample-qr — returns a sample QR for card preview
router.get('/sample-qr', requireAuth, async (req, res) => {
  try {
    const QRCode = require('qrcode');
    const qrDataUrl = await QRCode.toDataURL('SAMPLE-PREVIEW', {
      width: 300, margin: 2, color: { dark: '#1a1a2e', light: '#ffffff' }
    });
    res.json({ qrDataUrl });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// POST /api/events/:id/card — upload QR card template
router.post('/:id/card', requireAdmin, async (req, res) => {
  try {
    const { card_image, card_qr_x, card_qr_y, card_qr_size,
            card_name_x, card_name_y, card_name_size, card_name_color } = req.body;
    if (!card_image) return res.status(400).json({ error: 'Card image is required' });
    if (!card_image.startsWith('data:image/')) return res.status(400).json({ error: 'Invalid image format' });
    const sizeBytes = Math.ceil((card_image.length * 3) / 4);
    if (sizeBytes > 2 * 1024 * 1024) return res.status(400).json({ error: 'Image too large. Maximum size is 2MB.' });
    const event = await Event.findByIdAndUpdate(req.params.id,
      { $set: {
          card_image, card_qr_x, card_qr_y, card_qr_size: card_qr_size || 20,
          card_name_x:    card_name_x    ?? null,
          card_name_y:    card_name_y    ?? null,
          card_name_size: card_name_size || 5,
          card_name_color: card_name_color || '#000000'
      }},
      { new: true });
    if (!event) return res.status(404).json({ error: 'Event not found' });
    res.json({ success: true, message: 'QR card template saved' });
  } catch (err) { res.status(500).json({ error: 'Server error: ' + err.message }); }
});

// DELETE /api/events/:id/card
router.delete('/:id/card', requireAdmin, async (req, res) => {
  try {
    await Event.findByIdAndUpdate(req.params.id, {
      $set: { card_image: null, card_qr_x: null, card_qr_y: null,
              card_name_x: null, card_name_y: null }
    });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// POST /api/events/:id/invite — upload invitation card template
router.post('/:id/invite', requireAdmin, async (req, res) => {
  try {
    const { invite_image, invite_name_x, invite_name_y, invite_name_size, invite_name_color } = req.body;
    if (!invite_image) return res.status(400).json({ error: 'Image is required' });
    if (!invite_image.startsWith('data:image/')) return res.status(400).json({ error: 'Invalid image format' });
    const sizeBytes = Math.ceil((invite_image.length * 3) / 4);
    if (sizeBytes > 2 * 1024 * 1024) return res.status(400).json({ error: 'Image too large. Maximum 2MB.' });
    await Event.findByIdAndUpdate(req.params.id, {
      $set: { invite_image, invite_name_x, invite_name_y,
              invite_name_size: invite_name_size || 5,
              invite_name_color: invite_name_color || '#000000' }
    });
    res.json({ success: true, message: 'Invitation card template saved' });
  } catch (err) { res.status(500).json({ error: 'Server error: ' + err.message }); }
});

// DELETE /api/events/:id/invite
router.delete('/:id/invite', requireAdmin, async (req, res) => {
  try {
    await Event.findByIdAndUpdate(req.params.id, { $set: { invite_image: null, invite_name_x: null, invite_name_y: null } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// POST /api/events/:id/thanks — upload thank you card template
router.post('/:id/thanks', requireAdmin, async (req, res) => {
  try {
    const { thanks_image, thanks_name_x, thanks_name_y, thanks_name_size, thanks_name_color } = req.body;
    if (!thanks_image) return res.status(400).json({ error: 'Image is required' });
    if (!thanks_image.startsWith('data:image/')) return res.status(400).json({ error: 'Invalid image format' });
    const sizeBytes = Math.ceil((thanks_image.length * 3) / 4);
    if (sizeBytes > 2 * 1024 * 1024) return res.status(400).json({ error: 'Image too large. Maximum 2MB.' });
    await Event.findByIdAndUpdate(req.params.id, {
      $set: { thanks_image, thanks_name_x, thanks_name_y,
              thanks_name_size: thanks_name_size || 5,
              thanks_name_color: thanks_name_color || '#000000' }
    });
    res.json({ success: true, message: 'Thank you card template saved' });
  } catch (err) { res.status(500).json({ error: 'Server error: ' + err.message }); }
});

// DELETE /api/events/:id/thanks
router.delete('/:id/thanks', requireAdmin, async (req, res) => {
  try {
    await Event.findByIdAndUpdate(req.params.id, { $set: { thanks_image: null, thanks_name_x: null, thanks_name_y: null } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
