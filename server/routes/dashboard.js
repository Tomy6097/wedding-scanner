const express = require('express');
const { Event, Guest, Activity } = require('../db');
const router = express.Router();

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin')
    return res.status(403).json({ error: 'Admin access required' });
  next();
}

// GET /api/dashboard — overall business stats
router.get('/', requireAdmin, async (req, res) => {
  try {
    const totalEvents   = await Event.countDocuments();
    const activeEvents  = await Event.countDocuments({ status: 'active' });
    const totalScans    = await Activity.countDocuments();
    const invalidScans  = await Activity.countDocuments({ action: 'invalid' });
    const dupScans      = await Activity.countDocuments({ action: 'used' });

    // Count persons (D ticket = 2 persons)
    const allGuests = await Guest.find({}, 'ticket_type status scan_count');
    const totalGuests = allGuests.reduce((s, g) => s + (g.ticket_type === 'D' ? 2 : 1), 0);
    const checkedIn   = allGuests.reduce((s, g) => {
      if (g.ticket_type === 'D') return s + (g.status === 'used' ? 2 : g.scan_count === 1 ? 1 : 0);
      return s + (g.status === 'used' ? 1 : 0);
    }, 0);

    // Per-event breakdown
    const events = await Event.find().sort({ createdAt: -1 });
    const eventStats = await Promise.all(events.map(async (e) => {
      const evGuests = await Guest.find({ event_id: e._id }, 'ticket_type status scan_count');
      const guests   = evGuests.reduce((s, g) => s + (g.ticket_type === 'D' ? 2 : 1), 0);
      const checked  = evGuests.reduce((s, g) => {
        if (g.ticket_type === 'D') return s + (g.status === 'used' ? 2 : g.scan_count === 1 ? 1 : 0);
        return s + (g.status === 'used' ? 1 : 0);
      }, 0);
      const scans    = await Activity.countDocuments({ event_id: e._id });
      return {
        _id:        e._id,
        name:       e.name,
        client:     e.client_name,
        date:       e.date,
        status:     e.status,
        color:      e.color,
        guests,
        checkedIn:  checked,
        remaining:  guests - checked,
        attendance: guests > 0 ? Math.round((checked / guests) * 100) : 0,
        scans
      };
    }));

    // Recent activity across all events (last 20)
    const recentActivity = await Activity.find({ action: 'granted' })
      .sort({ createdAt: -1 }).limit(20);

    res.json({
      summary: {
        totalEvents, activeEvents,
        totalGuests, checkedIn,
        remaining: totalGuests - checkedIn,
        totalScans, invalidScans, dupScans,
        overallAttendance: totalGuests > 0 ? Math.round((checkedIn / totalGuests) * 100) : 0
      },
      eventStats,
      recentActivity
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

module.exports = router;
