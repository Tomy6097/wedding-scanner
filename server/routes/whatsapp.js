const express  = require('express');
const https    = require('https');
const http     = require('http');
const QRCode   = require('qrcode');
const Jimp     = require('jimp');
const { Guest, Event, Settings } = require('../db');
const router   = express.Router();

// ── EventFlow API config ──────────────────────────────────────
const EVENTFLOW_API_KEY = 'ef_live_7f8bc928ba96948517759592f33a8ddd69fe6df9bd71b3b2';
const EVENTFLOW_BASE_DEFAULT = 'e31c-197-186-3-137.ngrok-free.app';

async function getEventFlowBase() {
  const s = await Settings.findOne({ key: 'eventflow_url' });
  const url = s?.value?.trim();
  if (url) return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return EVENTFLOW_BASE_DEFAULT;
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin')
    return res.status(403).json({ error: 'Admin access required' });
  next();
}

async function getAppUrl() {
  const s = await Settings.findOne({ key: 'app_url' });
  return (s?.value || 'https://wedding-scanner.onrender.com').replace(/\/$/, '');
}

function cleanPhone(raw) {
  let p = (raw || '').replace(/\D/g, '');
  if (!p) throw new Error(`Invalid phone: ${raw}`);
  if (!p.startsWith('+')) p = '+' + p;
  return p;
}

// ── Send via EventFlow template API ──────────────────────────
async function eventFlowSend(payload) {
  const hostname = await getEventFlowBase();
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const options = {
      hostname,
      port: 443,
      path: '/api/v1/external/whatsapp/send/template',
      method: 'POST',
      headers: {
        'X-API-Key':      EVENTFLOW_API_KEY,
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
        'ngrok-skip-browser-warning': 'true'
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        console.log('[EventFlow]', res.statusCode, data);
        try {
          const j = JSON.parse(data);
          if (j.success || res.statusCode === 202 || res.statusCode === 200) resolve(j);
          else reject(new Error(j.error || j.message || JSON.stringify(j)));
        } catch (e) { reject(new Error('EventFlow parse error: ' + data)); }
      });
    });
    req.on('error', e => reject(new Error('Network: ' + e.message)));
    req.write(body);
    req.end();
  });
}

// ── Send via EventFlow text API ───────────────────────────────
async function eventFlowSendText(phone, message) {
  const hostname = await getEventFlowBase();
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ to: phone, message });
    const options = {
      hostname,
      port: 443,
      path: '/api/v1/external/whatsapp/send/text',
      method: 'POST',
      headers: {
        'X-API-Key':      EVENTFLOW_API_KEY,
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
        'ngrok-skip-browser-warning': 'true'
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        console.log('[EventFlow text]', res.statusCode, data);
        try {
          const j = JSON.parse(data);
          if (j.success || res.statusCode === 202 || res.statusCode === 200) resolve(j);
          else reject(new Error(j.error || j.message || JSON.stringify(j)));
        } catch (e) { reject(new Error('EventFlow parse error: ' + data)); }
      });
    });
    req.on('error', e => reject(new Error('Network: ' + e.message)));
    req.write(body);
    req.end();
  });
}

// ── Public text-only helper ───────────────────────────────────
async function sendFonnte(phone, message) {
  return eventFlowSendText(phone, message);
}

// ── GET /api/whatsapp/logs — check delivery status ───────────
router.get('/logs', requireAdmin, async (req, res) => {
  try {
    const hostname = await getEventFlowBase();
    const phone    = req.query.phone || '';
    const path     = `/api/v1/external/whatsapp/logs${phone ? '?phone=' + encodeURIComponent(phone) : ''}`;

    const result = await new Promise((resolve, reject) => {
      const opts = {
        hostname, port: 443, path, method: 'GET',
        headers: {
          'X-API-Key': EVENTFLOW_API_KEY,
          'ngrok-skip-browser-warning': 'true'
        }
      };
      const req = https.request(opts, (r) => {
        let data = '';
        r.on('data', c => { data += c; });
        r.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error('Parse error: ' + data)); }
        });
      });
      req.on('error', e => reject(e));
      req.end();
    });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/whatsapp/test ───────────────────────────────────
router.post('/test', requireAdmin, async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone required' });
  try {
    const p = cleanPhone(phone);
    await eventFlowSend({
      to:       p,
      template: 'event_invitation',
      params: {
        guestName:  'Mgeni wa Majaribio',
        eventName:  'TMJ Wedding Tech — Test',
        eventDate:  new Date().toLocaleDateString('sw', { day: 'numeric', month: 'long', year: 'numeric' }),
        location:   'Dar es Salaam'
      }
    });
    res.json({ success: true, message: 'Test invitation sent via EventFlow!' });
  } catch (err) {
    console.error('[/test]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/whatsapp/send-invites ──────────────────────────
router.post('/send-invites', requireAdmin, async (req, res) => {
  const { event_id, type, only_unsent, custom_message } = req.body;
  if (!event_id) return res.status(400).json({ error: 'Event ID required' });

  try {
    const ev     = await Event.findById(event_id);
    if (!ev) return res.status(404).json({ error: 'Event not found' });

    const appUrl = await getAppUrl();

    const eventDateStr = ev.date
      ? new Date(ev.date).toLocaleDateString('sw', { day: 'numeric', month: 'long', year: 'numeric' })
      : 'Tarehe itafahamishwa';
    const eventLocation = ev.venue || 'Mahali patatangazwa';

    const filter = { event_id, phone: { $exists: true, $nin: [null, ''] } };
    if (type === 'qr' && only_unsent) filter.sms_sent = { $ne: true };
    if (type === 'thanks') filter.status = 'used';

    const guests = await Guest.find(filter);
    if (!guests.length) return res.json({ success: true, sent: 0, failed: 0, message: 'Hakuna wageni wenye simu' });

    let sent = 0, failed = 0, errors = [];

    for (const g of guests) {
      try {
        if (!g.phone || !g.phone.trim()) { failed++; continue; }

        const phone = cleanPhone(g.phone);
        const link  = `${appUrl}/guest/${g.qr_token}`;

        if (type === 'qr') {
          // Append QR link to location so guests can access their ticket
          await eventFlowSend({
            to:       phone,
            template: 'event_invitation',
            params: {
              guestName: g.name,
              eventName: ev.name,
              eventDate: eventDateStr,
              location:  `${eventLocation}\n🔗 ${link}`
            }
          });
          g.sms_sent    = true;
          g.sms_sent_at = new Date();
          await g.save();
          sent++;

        } else if (type === 'invite') {
          await eventFlowSend({
            to:       phone,
            template: 'event_invitation',
            params: {
              guestName: g.name,
              eventName: ev.name,
              eventDate: eventDateStr,
              location:  eventLocation
            }
          });
          sent++;

        } else if (type === 'thanks') {
          const msg = `Habari ${g.name},\n\nAsante sana kwa kuja kwenye *${ev.name}*!\n\nIlikuwa furaha kubwa kushiriki nawe. Mungu akubariki!\n\nAngalia kadi yako: ${link}`;
          await eventFlowSendText(phone, msg);
          sent++;

        } else if (custom_message) {
          await eventFlowSendText(phone, `Ndugu ${g.name}, ${custom_message}`);
          sent++;

        } else {
          failed++;
          continue;
        }

        await new Promise(r => setTimeout(r, 1500));
      } catch (e) {
        console.error(`[send-invites ${g.name}]`, e.message);
        failed++;
        errors.push(`${g.name}: ${e.message}`);
      }
    }

    res.json({ success: true, sent, failed, errors: errors.slice(0, 10) });
  } catch (err) {
    console.error('[send-invites fatal]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, sendFonnte };
