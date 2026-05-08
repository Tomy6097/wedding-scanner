const express = require('express');
const bcrypt = require('bcryptjs');
const { User } = require('../db');

const router = express.Router();

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin')
    return res.status(403).json({ error: 'Admin access required' });
  next();
}

// GET /api/users — list all scanner accounts
router.get('/', requireAdmin, async (req, res) => {
  try {
    const users = await User.find({ role: 'scanner' })
      .select('username role createdAt')
      .sort({ createdAt: 1 });
    res.json(users);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// POST /api/users — create a new scanner account
router.post('/', requireAdmin, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !username.trim())
    return res.status(400).json({ error: 'Username is required' });
  if (!password || password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });

  // Only allow creating scanner accounts (not admin)
  try {
    const exists = await User.findOne({ username: username.trim().toLowerCase() });
    if (exists) return res.status(400).json({ error: 'Username already exists' });

    const user = await User.create({
      username: username.trim().toLowerCase(),
      password: bcrypt.hashSync(password, 10),
      role: 'scanner'
    });
    res.status(201).json({ id: user._id, username: user.username, role: user.role });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/users/:id — delete a scanner account
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'admin') return res.status(403).json({ error: 'Cannot delete admin account' });
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
