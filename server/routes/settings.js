const express = require('express');
const { Settings } = require('../db');
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

router.get('/', requireAuth, async (req, res) => {
  try {
    const all = await Settings.find();
    const obj = {};
    all.forEach(s => {
      // Hide secret keys from non-admin
      if (s.key.includes('secret') && req.session.user.role !== 'admin') return;
      obj[s.key] = s.value;
    });
    res.json(obj);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/', requireAdmin, async (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: 'Key is required' });
  try {
    await Settings.findOneAndUpdate({ key }, { value: value || '' }, { upsert: true, new: true });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// Save multiple settings at once
router.post('/bulk', requireAdmin, async (req, res) => {
  const { settings } = req.body;
  if (!settings || typeof settings !== 'object')
    return res.status(400).json({ error: 'Settings object required' });
  try {
    for (const [key, value] of Object.entries(settings)) {
      await Settings.findOneAndUpdate({ key }, { value: value || '' }, { upsert: true });
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
