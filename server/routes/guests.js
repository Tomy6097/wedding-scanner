const express  = require('express');
const { v4: uuidv4 } = require('uuid');
const QRCode   = require('qrcode');
const https    = require('https');
const { Guest, Event, Settings, Activity } = require('../db');

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

async function getEventName(eventId) {
  if (eventId) {
    const ev = await Event.findById(eventId);
    if (ev) return ev.name;
  }
  const s = await Settings.findOne({ key: 'event_name' });
  return s ? s.value : 'Our Wedding';
}

// ── Send SMS via Beem Africa ──────────────────────────────────
async function sendBeemSMS(phone, message) {
  const apiKey    = (await Settings.findOne({ key: 'beem_api_key' }))?.value;
  const secretKey = (await Settings.findOne({ key: 'beem_secret_key' }))?.value;
  const senderId  = (await Settings.findOne({ key: 'beem_sender_id' }))?.value;
  // Use provided sender ID or fall back to null (Beem will use account default)
  const source = senderId && senderId.trim() ? senderId.trim() : undefined;

  if (!apiKey || !apiKey.trim()) throw new Error('Beem API Key not configured in Settings');
  if (!secretKey || !secretKey.trim()) throw new Error('Beem Secret Key not configured in Settings');

  // Clean phone — must be digits only, with country code (e.g. 255712345678)
  const cleanPhone = phone.replace(/\D/g, '');
  if (!cleanPhone || cleanPhone.length < 9) throw new Error(`Invalid phone number: ${phone}`);

  // Build payload — only include source_addr if Sender ID is set
  const payloadObj = {
    encoding:   0,
    message:    message,
    recipients: [{ recipient_id: 1, dest_addr: cleanPhone }]
  };
  if (source) payloadObj.source_addr = source;

  const payload = JSON.stringify(payloadObj);

  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${apiKey.trim()}:${secretKey.trim()}`).toString('base64');
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
        console.log(`Beem SMS response [${res.statusCode}]:`, data);
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode === 200 || res.statusCode === 201) {
            resolve(parsed);
          } else {
            // Return full Beem error message
            const errMsg = parsed.message || parsed.error || parsed.description || JSON.stringify(parsed);
            reject(new Error(`Beem error ${res.statusCode}: ${errMsg}`));
          }
        } catch (e) {
          reject(new Error(`Beem response parse error: ${data}`));
        }
      });
    });
    req.on('error', (e) => reject(new Error(`Network error: ${e.message}`)));
    req.write(payload);
    req.end();
  });
}

// ── Fixed routes BEFORE /:id ──────────────────────────────────

// Stats — scoped to event
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const { event_id } = req.query;
    const filter = event_id ? { event_id } : {};
    const total     = await Guest.countDocuments(filter);
    const checkedIn = await Guest.countDocuments({ ...filter, status: 'used' });
    res.json({ total, checkedIn, remaining: total - checkedIn });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// Search — scoped to event
router.get('/search', requireAuth, async (req, res) => {
  try {
    const { q, event_id } = req.query;
    if (!q || !q.trim()) return res.json([]);
    const filter = {
      ...(event_id ? { event_id } : {}),
      $or: [
        { name:      { $regex: q.trim(), $options: 'i' } },
        { phone:     { $regex: q.trim(), $options: 'i' } },
        { unique_id: { $regex: '^' + q.trim(), $options: 'i' } }
      ]
    };
    const guests = await Guest.find(filter).sort({ name: 1 }).limit(10);
    res.json(guests);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// Public guest page — no auth
router.get('/view/:token', async (req, res) => {
  try {
    const guest = await Guest.findOne({ qr_token: req.params.token });
    if (!guest) return res.status(404).json({ error: 'Guest not found' });
    const eventName   = await getEventName(guest.event_id);
    const totalGuests = await Guest.countDocuments({ event_id: guest.event_id });
    const guestNumber = await Guest.countDocuments({ event_id: guest.event_id, createdAt: { $lte: guest.createdAt } });
    const qrDataUrl   = await QRCode.toDataURL(guest.qr_token, {
      width: 300, margin: 2, color: { dark: '#1a1a2e', light: '#ffffff' }
    });
    res.json({
      name: guest.name, phone: guest.phone,
      unique_id: guest.unique_id, status: guest.status,
      table_number: guest.table_number,
      guest_number: guestNumber, total_guests: totalGuests,
      qrDataUrl, eventName
    });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// List guests — scoped to event
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { search, event_id } = req.query;
    const filter = event_id ? { event_id } : {};
    if (search) {
      filter.$or = [
        { name:      { $regex: search, $options: 'i' } },
        { phone:     { $regex: search, $options: 'i' } },
        { unique_id: { $regex: search, $options: 'i' } }
      ];
    }
    const guests = await Guest.find(filter).sort({ createdAt: -1 });
    res.json(guests);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// Check duplicate — scoped to event
router.get('/check-duplicate', requireAdmin, async (req, res) => {
  try {
    const { name, event_id } = req.query;
    if (!name) return res.json({ exists: false });
    const filter = {
      name: { $regex: `^${name.trim()}$`, $options: 'i' },
      ...(event_id ? { event_id } : {})
    };
    const existing = await Guest.findOne(filter);
    res.json({ exists: !!existing });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// Add single guest
router.post('/', requireAdmin, async (req, res) => {
  const { name, phone, table_number, event_id } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Guest name is required' });
  if (!event_id) return res.status(400).json({ error: 'Event is required' });
  try {
    const guest = await Guest.create({
      event_id, name: name.trim(),
      phone: phone ? phone.trim() : null,
      table_number: table_number ? table_number.trim() : null,
      unique_id: uuidv4(), qr_token: uuidv4()
    });
    res.status(201).json(guest);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// Bulk add
router.post('/bulk', requireAdmin, async (req, res) => {
  const { guests, event_id } = req.body;
  if (!Array.isArray(guests) || !guests.length) return res.status(400).json({ error: 'Guests array required' });
  if (!event_id) return res.status(400).json({ error: 'Event is required' });
  try {
    const docs = guests.filter(g => g.name?.trim()).map(g => ({
      event_id, name: g.name.trim(),
      phone: g.phone ? g.phone.trim() : null,
      table_number: g.table_number ? g.table_number.trim() : null,
      unique_id: uuidv4(), qr_token: uuidv4()
    }));
    const created = await Guest.insertMany(docs);
    res.status(201).json(created);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// Scan QR — strictly validates event_id
router.post('/scan', requireAuth, async (req, res) => {
  const { token, event_id } = req.body;
  if (!token) return res.status(400).json({ result: 'invalid', message: 'No token provided' });
  try {
    // Find guest by token only first
    const guest = await Guest.findOne({ qr_token: token.trim() });

    if (!guest) {
      await Activity.create({ action: 'invalid', scanned_by: req.session.user.username, token_used: token.trim().substring(0, 20), event_id: event_id || null });
      return res.json({ result: 'invalid', message: 'Invalid QR Code' });
    }

    // If scanner has an event_id, enforce it — QR must belong to that event
    if (event_id && String(guest.event_id) !== String(event_id)) {
      await Activity.create({
        action: 'invalid', guest_name: guest.name, guest_id: guest._id,
        event_id: event_id, scanned_by: req.session.user.username,
        note: `QR belongs to different event`
      });
      return res.json({ result: 'invalid', message: 'QR Code belongs to a different event' });
    }

    if (guest.status === 'used') {
      await Activity.create({ action: 'used', guest_name: guest.name, guest_id: guest._id, event_id: guest.event_id, scanned_by: req.session.user.username });
      return res.json({ result: 'used', message: 'Already Checked In', guest: { name: guest.name, phone: guest.phone, checked_in_at: guest.checked_in_at } });
    }

    guest.status        = 'used';
    guest.checked_in_at = new Date();
    guest.checked_in_by = req.session.user.username;
    await guest.save();

    await Activity.create({ action: 'granted', guest_name: guest.name, guest_id: guest._id, event_id: guest.event_id, scanned_by: req.session.user.username });

    const io = req.app.get('io');
    if (io) io.emit('guest_checked_in', {
      id: guest._id, name: guest.name, phone: guest.phone,
      status: guest.status, checked_in_at: guest.checked_in_at,
      checked_in_by: guest.checked_in_by, event_id: guest.event_id
    });

    res.json({ result: 'granted', message: 'Access Granted', guest: { name: guest.name, phone: guest.phone, table_number: guest.table_number, checked_in_at: guest.checked_in_at } });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// Test SMS — send a test message to verify Beem settings
router.post('/sms/test', requireAdmin, async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number required' });
  try {
    await sendBeemSMS(phone, 'Test message from your Event Check-in System. SMS is working correctly!');
    res.json({ success: true, message: 'Test SMS sent successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send SMS to single guest
router.post('/:id/sms', requireAdmin, async (req, res) => {
  try {
    const guest = await Guest.findById(req.params.id);
    if (!guest) return res.status(404).json({ error: 'Guest not found' });
    if (!guest.phone) return res.status(400).json({ error: 'Guest has no phone number' });

    const eventName  = await getEventName(guest.event_id);
    const lookupCode = guest.unique_id.substring(0, 8).toUpperCase();
    const baseUrl    = process.env.APP_URL || 'https://wedding-scanner.onrender.com';
    const link       = `${baseUrl}/guest/${guest.qr_token}`;
    const message    = `Dear ${guest.name}, you are invited to ${eventName}. Your QR invitation: ${link} Code: ${lookupCode}`;

    await sendBeemSMS(guest.phone, message);
    guest.sms_sent    = true;
    guest.sms_sent_at = new Date();
    await guest.save();

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send SMS to ALL guests in an event
router.post('/sms/bulk', requireAdmin, async (req, res) => {
  const { event_id, only_unsent } = req.body;
  if (!event_id) return res.status(400).json({ error: 'Event ID required' });

  try {
    const filter = { event_id, phone: { $ne: null } };
    if (only_unsent) filter.sms_sent = { $ne: true };
    const guests = await Guest.find(filter);

    if (!guests.length) return res.json({ success: true, sent: 0, failed: 0, message: 'No guests to send to' });

    const eventName = await getEventName(event_id);
    const baseUrl   = process.env.APP_URL || 'https://wedding-scanner.onrender.com';
    let sent = 0, failed = 0, errors = [];

    for (const guest of guests) {
      try {
        const lookupCode = guest.unique_id.substring(0, 8).toUpperCase();
        const link       = `${baseUrl}/guest/${guest.qr_token}`;
        const message    = `Dear ${guest.name}, you are invited to ${eventName}. Your QR invitation: ${link} Code: ${lookupCode}`;
        await sendBeemSMS(guest.phone, message);
        guest.sms_sent    = true;
        guest.sms_sent_at = new Date();
        await guest.save();
        sent++;
        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 200));
      } catch (e) {
        failed++;
        errors.push(`${guest.name}: ${e.message}`);
      }
    }

    res.json({ success: true, sent, failed, errors: errors.slice(0, 5) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// All QR data for download
router.get('/allqr', requireAdmin, async (req, res) => {
  try {
    const { event_id } = req.query;
    const filter    = event_id ? { event_id } : {};
    const guests    = await Guest.find(filter).sort({ name: 1 });
    const eventName = await getEventName(event_id);
    const total     = guests.length;

    // Get card template if exists
    let cardTemplate = null;
    if (event_id) {
      const ev = await Event.findById(event_id);
      if (ev && ev.card_image) {
        cardTemplate = {
          image:   ev.card_image,
          qr_x:    ev.card_qr_x,
          qr_y:    ev.card_qr_y,
          qr_size: ev.card_qr_size || 20
        };
      }
    }

    const results = await Promise.all(guests.map(async (g, idx) => {
      const qrDataUrl = await QRCode.toDataURL(g.qr_token, {
        width: 300, margin: 2, color: { dark: '#1a1a2e', light: '#ffffff' }
      });
      return {
        id: g._id, name: g.name, phone: g.phone,
        unique_id: g.unique_id, qr_token: g.qr_token,
        table_number: g.table_number, guest_number: idx + 1,
        total_guests: total, status: g.status, qrDataUrl, eventName,
        cardTemplate
      };
    }));
    res.json(results);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Guest scan history — all scan attempts for a specific guest
router.get('/:id/history', requireAdmin, async (req, res) => {
  try {
    const guest = await Guest.findById(req.params.id);
    if (!guest) return res.status(404).json({ error: 'Guest not found' });
    const logs = await Activity.find({ guest_id: req.params.id }).sort({ createdAt: -1 });
    res.json({ guest, logs });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// ── /:id routes LAST ──────────────────────────────────────────

router.get('/:id/qr', requireAdmin, async (req, res) => {
  try {
    const guest     = await Guest.findById(req.params.id);
    if (!guest) return res.status(404).json({ error: 'Guest not found' });
    const eventName   = await getEventName(guest.event_id);
    const totalGuests = await Guest.countDocuments({ event_id: guest.event_id });
    const guestNumber = await Guest.countDocuments({ event_id: guest.event_id, createdAt: { $lte: guest.createdAt } });
    const qrDataUrl   = await QRCode.toDataURL(guest.qr_token, {
      width: 300, margin: 2, color: { dark: '#1a1a2e', light: '#ffffff' }
    });
    res.json({ qrDataUrl, guest, eventName, guest_number: guestNumber, total_guests: totalGuests });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/reset', requireAdmin, async (req, res) => {
  try {
    const guest = await Guest.findById(req.params.id);
    if (!guest) return res.status(404).json({ error: 'Guest not found' });
    guest.status = 'unused'; guest.checked_in_at = null; guest.checked_in_by = null;
    await guest.save();
    await Activity.create({ action: 'reset', guest_name: guest.name, guest_id: guest._id, event_id: guest.event_id, scanned_by: req.session.user.username, note: 'Reset by admin' });
    const io = req.app.get('io');
    if (io) io.emit('guest_reset', { id: guest._id, name: guest.name, status: 'unused', event_id: guest.event_id });
    res.json({ success: true, guest });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/all', requireAdmin, async (req, res) => {
  try {
    const { event_id } = req.query;
    const filter = event_id ? { event_id } : {};
    await Guest.deleteMany(filter);
    await Activity.deleteMany(event_id ? { event_id } : {});
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const guest = await Guest.findOneAndDelete({ _id: req.params.id });
    if (!guest) return res.status(404).json({ error: 'Guest not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
