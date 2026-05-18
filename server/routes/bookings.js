const express = require('express');
const https   = require('https');
const { Booking, Settings } = require('../db');
const router = express.Router();

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin')
    return res.status(403).json({ error: 'Admin access required' });
  next();
}

// ── Send notification SMS via Beem ────────────────────────────
async function sendNotificationSMS(phone, message) {
  const apiKey    = (await Settings.findOne({ key: 'beem_api_key' }))?.value;
  const secretKey = (await Settings.findOne({ key: 'beem_secret_key' }))?.value;
  if (!apiKey || !secretKey) throw new Error('Beem API keys not configured in Settings');

  const cleanPhone = phone.replace(/\D/g, '');
  const payloadObj = {
    encoding:   0,
    message:    message,
    recipients: [{ recipient_id: 1, dest_addr: cleanPhone }]
  };
  const senderId = (await Settings.findOne({ key: 'beem_sender_id' }))?.value;
  if (senderId && senderId.trim()) payloadObj.source_addr = senderId.trim();

  const payload = JSON.stringify(payloadObj);
  const auth    = Buffer.from(`${apiKey.trim()}:${secretKey.trim()}`).toString('base64');

  return new Promise((resolve) => {
    const options = {
      hostname: 'apisms.beem.africa',
      port: 443,
      path: '/v1/send',
      method: 'POST',
      headers: {
        'Content-Type':   'application/json',
        'Authorization':  `Basic ${auth}`,
        'Content-Length': Buffer.byteLength(payload)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        console.log(`Booking notification SMS [${res.statusCode}]:`, data);
        resolve();
      });
    });
    req.on('error', (e) => { console.error('Notification SMS error:', e.message); resolve(); });
    req.write(payload);
    req.end();
  });
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

    // ── Notify admin via SMS (if Beem configured) ─────────
    const adminPhone = '255754696878';
    const smsMsg = `Booking Mpya! Jina: ${booking.name} Simu: ${booking.phone}${booking.package ? ' Package: ' + booking.package : ''}${booking.event_date ? ' Tarehe: ' + booking.event_date : ''} Angalia: https://wedding-scanner.onrender.com`;
    sendNotificationSMS(adminPhone, smsMsg).catch(() => {});

    res.status(201).json({
      success: true,
      message: 'Booking received! We will contact you soon.',
      whatsapp_notify_url: buildWhatsAppNotifyURL(booking)
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

function buildWhatsAppNotifyURL(booking) {
  const msg = `🆕 *Booking Mpya!*\n\n👤 Jina: ${booking.name}\n📞 Simu: ${booking.phone}${booking.package ? '\n📦 Package: ' + booking.package : ''}${booking.event_date ? '\n📅 Tarehe: ' + booking.event_date : ''}${booking.message ? '\n💬 Ujumbe: ' + booking.message : ''}\n\n✅ Jibu haraka!`;
  return `https://wa.me/255754696878?text=${encodeURIComponent(msg)}`;
}

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

// GET /api/bookings/test-notify — test SMS notification to admin
router.get('/test-notify', requireAdmin, async (req, res) => {
  const adminPhone = '255754696878';
  const testMsg = `Test notification from TMJ Wedding Tech system. Time: ${new Date().toLocaleString()}`;
  try {
    await sendNotificationSMS(adminPhone, testMsg);
    res.json({ success: true, message: 'Test SMS sent to ' + adminPhone });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
