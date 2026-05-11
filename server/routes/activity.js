const express = require('express');
const { Activity } = require('../db');
const router = express.Router();

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin')
    return res.status(403).json({ error: 'Admin access required' });
  next();
}

// GET /api/activity — get activity log (admin only)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const limit  = parseInt(req.query.limit) || 100;
    const filter = {};
    if (req.query.action)   filter.action   = req.query.action;
    if (req.query.event_id) filter.event_id = req.query.event_id;
    const logs = await Activity.find(filter).sort({ createdAt: -1 }).limit(limit);
    res.json(logs);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/activity — clear all logs (admin only)
router.delete('/', requireAdmin, async (req, res) => {
  try {
    await Activity.deleteMany({});
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
