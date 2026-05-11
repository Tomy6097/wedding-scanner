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
    const totalGuests   = await Guest.countDocuments();
    const checkedIn     = await Guest.countDocuments({ status: 'used' });
    const totalScans    = await Activity.countDocuments();
    const invalidScans  = await Activity.countDocuments({ action: 'invalid' });
    const dupScans      = await Activity.countDocuments({ action: 'used' });

    // Per-event breakdown
    const events = await Event.find().sort({ createdAt: -1 });
    const eventStats = await Promise.all(events.map(async (e) => {
      const guests     = await Guest.countDocuments({ event_id: e._id });
      const checked    = await Guest.countDocuments({ event_id: e._id, status: 'used' });
      const scans      = await Activity.countDocuments({ event_id: e._id });
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
