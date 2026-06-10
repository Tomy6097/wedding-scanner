const express = require('express');
const https   = require('https');
const { Guest, Event, Settings } = require('../db');
const router  = express.Router();

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin')
    return res.status(403).json({ error: 'Admin access required' });
  next();
}

// ── Send via Fonnte API ───────────────────────────────────────
async function sendFonnte(phone, message) {
  const token = (await Settings.findOne({ key: 'fonnte_token' }))?.value;
  if (!token || !token.trim()) throw new Error('Fonnte token not configured in Settings');

  const cleanPhone = phone.replace(/\D/g, '');
  if (!cleanPhone || cleanPhone.length < 9) throw new Error(`Invalid phone: ${phone}`);

  const payload = new URLSearchParams({
    target:      cleanPhone,
    message:     message,
    delay:       '3',
    countryCode: '255'
  }).toString();

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.fonnte.com',
      port: 443, path: '/send', method: 'POST',
      headers: {
        'Authorization': token.trim(),
        'Content-Type':  'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(payload)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        console.log(`Fonnte [${res.statusCode}]:`, data);
        try {
          const parsed = JSON.parse(data);
          if (parsed.status === true || res.statusCode === 200) resolve(parsed);
          else reject(new Error(parsed.reason || parsed.message || `Fonnte error ${res.statusCode}`));
        } catch (e) { reject(new Error('Fonnte parse error: ' + data)); }
      });
    });
    req.on('error', e => reject(new Error('Network: ' + e.message)));
    req.write(payload);
    req.end();
  });
}

// POST /api/whatsapp/test
router.post('/test', requireAdmin, async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone required' });
  try {
    await sendFonnte(phone, 'Test from TMJ Wedding Tech. WhatsApp is working!');
    res.json({ success: true, message: 'Test message sent!' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/whatsapp/send-invites
router.post('/send-invites', requireAdmin, async (req, res) => {
  const { event_id, type, only_unsent, custom_message } = req.body;
  if (!event_id) return res.status(400).json({ error: 'Event ID required' });

  try {
    const ev = await Event.findById(event_id);
    if (!ev) return res.status(404).json({ error: 'Event not found' });

    const appUrl = (await Settings.findOne({ key: 'app_url' }))?.value
                   || 'https://wedding-scanner.onrender.com';

    const filter = { event_id, phone: { $ne: null } };
    if (type === 'qr' && only_unsent) filter.sms_sent = { $ne: true };
    if (type === 'thanks') filter.status = 'used';

    const guests = await Guest.find(filter);
    if (!guests.length) return res.json({ success: true, sent: 0, failed: 0 });

    let sent = 0, failed = 0, errors = [];

    for (const g of guests) {
      try {
        const link = `${appUrl}/guest/${g.qr_token}`;
        const code = g.unique_id.substring(0, 8).toUpperCase();
        let msg = '';

        if (type === 'qr') {
          msg = `Habari ${g.name},\n\nUmealikwa kwenye *${ev.name}*!\n\nHii ndiyo tiketi yako ya QR:\n${link}\n\nNambari ya kuingia: *${code}*\n\nOnyesha QR code hii mlangoni.\nAsante!`;
        } else if (type === 'invite') {
          msg = `Habari ${g.name},\n\nUnaalikwa rasmi kwenye *${ev.name}*.\n\nAngalia mwaliko wako:\n${link}`;
        } else if (type === 'thanks') {
          msg = `Habari ${g.name},\n\nAsante kwa kuja kwenye *${ev.name}*! Ilikuwa furaha kubwa kuwa nawe.`;
        } else if (custom_message) {
          msg = `Ndugu ${g.name}, ${custom_message}`;
        }

        if (!msg) { failed++; continue; }

        await sendFonnte(g.phone, msg);
        sent++;

        if (type === 'qr') {
          g.sms_sent    = true;
          g.sms_sent_at = new Date();
          await g.save();
        }

        await new Promise(r => setTimeout(r, 1500));
      } catch (e) {
        failed++;
        errors.push(`${g.name}: ${e.message}`);
      }
    }

    res.json({ success: true, sent, failed, errors: errors.slice(0, 5) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = { router, sendFonnte };
