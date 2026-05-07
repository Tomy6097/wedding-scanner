const express = require('express');
const bcrypt = require('bcryptjs');
const { User } = require('../db');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password are required' });
  try {
    const user = await User.findOne({ username: username.trim() });
    if (!user || !bcrypt.compareSync(password, user.password))
      return res.status(401).json({ error: 'Invalid credentials' });
    req.session.user = { id: user._id, username: user.username, role: user.role };
    res.json({ success: true, role: user.role, username: user.username });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

router.get('/me', (req, res) => {
  if (!req.session.user)
    return res.status(401).json({ error: 'Not authenticated' });
  res.json(req.session.user);
});

module.exports = router;
