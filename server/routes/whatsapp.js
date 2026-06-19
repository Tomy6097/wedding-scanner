const express  = require('express');
const https    = require('https');
const http     = require('http');
const FormData = require('form-data');
const QRCode   = require('qrcode');
const Jimp     = require('jimp');
const { Guest, Event, Settings } = require('../db');
const router   = express.Router();

// ── EventFlow API config ──────────────────────────────────────
const EVENTFLOW_API_KEY = 'ef_live_7f8bc928ba96948517759592f33a8ddd69fe6df9bd71b3b2';
const EVENTFLOW_BASE_DEFAULT = 'eventflow-backend.onrender.com'; // production default

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

function isLocalhostUrl(url) {
  try {
    const host = new URL(url).hostname;
    return ['localhost', '127.0.0.1', '::1'].includes(host);
  } catch {
    return false;
  }
}

async function uploadDataUrlToPublicHost(dataUrl, filename = 'image.png') {
  const match = dataUrl?.match(/^data:image\/([\w+]+);base64,(.+)$/s);
  if (!match) throw new Error('Invalid image data');

  const subtype = match[1] === 'jpg' ? 'jpeg' : match[1];
  const buf = Buffer.from(match[2], 'base64');
  const form = new FormData();
  form.append('file', buf, {
    filename,
    contentType: `image/${subtype}`,
  });
  form.append('secret', '');

  return new Promise((resolve, reject) => {
    const req = https.request(
      'https://0x0.st',
      {
        method: 'POST',
        headers: {
          ...form.getHeaders(),
          'User-Agent': 'Wedding-Scanner/1.0',
        },
      },
      (res) => {
        let out = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { out += chunk; });
        res.on('end', () => {
          const url = out.trim();
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`Public image upload failed: ${url || res.statusCode}`));
          }
          if (!url.startsWith('http')) {
            return reject(new Error(`Public image upload returned invalid URL: ${url}`));
          }
          resolve(url);
        });
      },
    );

    req.on('error', reject);
    form.pipe(req);
  });
}

function cleanPhone(raw) {
  let p = (raw || '').replace(/\D/g, '');
  if (!p) throw new Error(`Invalid phone: ${raw}`);
  if (p.startsWith('0')) p = '255' + p.slice(1);
  else if (!p.startsWith('255') && p.length <= 10) p = '255' + p;
  return '+' + p;
}

async function getInviteImageUrl(eventId, appUrl) {
  const ev = await Event.findById(eventId);
  if (!ev?.invite_image && !ev?.card_image) {
    throw new Error('Upload a card or invitation image first (Card Template tab)');
  }
  const url = `${appUrl.replace(/\/$/, '')}/api/events/${eventId}/whatsapp-cover`;
  try {
    const mod = url.startsWith('https') ? https : http;
    await new Promise((resolve, reject) => {
      const req = mod.get(url, { timeout: 8000 }, (res) => {
        res.resume(); // consume response to free socket
        if (res.statusCode === 200) resolve();
        else reject(new Error(`HTTP ${res.statusCode}`));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
    return url;
  } catch (e) {
    console.warn('[WhatsApp] Public cover image not reachable at', url, '—', e.message);

    // Fallback for localhost / private deployments: upload the stored data URL
    // to a temporary public host so WhatsApp can fetch it.
    const dataUrl = ev?.invite_image || ev?.card_image;
    if (dataUrl) {
      console.warn('[WhatsApp] Public cover image not reachable at', url, '— uploading to a temporary public host');
      try {
        return await uploadDataUrlToPublicHost(dataUrl, `event-${eventId}.png`);
      } catch (uploadErr) {
        console.warn('[WhatsApp] Temporary upload failed:', uploadErr.message);
      }
    }

    throw new Error('WhatsApp image URL is not publicly reachable. Deploy the app or update App URL in Settings.');
  }
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

// ── Resolve a publicly reachable image URL for WhatsApp header ──
// Builds the /whatsapp-cover URL from appUrl, does a quick reachability
// check, and throws a clear error if it's not publicly accessible.
async function getInviteImageUrl(eventId, appUrl) {
  const ev = await Event.findById(eventId);
  if (!ev?.invite_image && !ev?.card_image) {
    throw new Error('Upload a card or invitation image first (Card Template tab)');
  }

  const url = `${appUrl.replace(/\/$/, '')}/api/events/${eventId}/whatsapp-cover`;

  try {
    const mod = url.startsWith('https') ? https : http;
    await new Promise((resolve, reject) => {
      const req = mod.get(url, { timeout: 8000 }, (res) => {
        res.resume(); // consume response to free socket
        if (res.statusCode === 200) resolve();
        else reject(new Error(`HTTP ${res.statusCode}`));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
    return url;
  } catch (e) {
    console.warn('[WhatsApp] Public cover image not reachable at', url, '—', e.message);
    throw new Error(
      'WhatsApp image URL is not publicly reachable. Deploy the app or update App URL in Settings.'
    );
  }
}

// ── POST /api/whatsapp/test ───────────────────────────────────
router.post('/test', requireAdmin, async (req, res) => {
  const { phone, event_id } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone required' });
  try {
    const p = cleanPhone(phone);
    const appUrl = await getAppUrl();
    const ev = event_id
      ? await Event.findById(event_id)
      : await Event.findOne().sort({ createdAt: -1 });
    const imageUrl = ev
      ? await getInviteImageUrl(ev._id, appUrl)
      : undefined;
    await eventFlowSend({
      to:       p,
      template: 'event_invitation',
      params: {
        guestName:  'Mgeni wa Majaribio',
        eventName:  ev?.name || 'TMJ Wedding Tech — Test',
        eventDate:  ev?.date
          ? new Date(ev.date).toLocaleDateString('sw', { day: 'numeric', month: 'long', year: 'numeric' })
          : new Date().toLocaleDateString('sw', { day: 'numeric', month: 'long', year: 'numeric' }),
        location:   ev?.venue || 'Dar es Salaam',
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
  const { event_id, type, only_unsent, custom_message, guest_ids } = req.body;
  if (!event_id) return res.status(400).json({ error: 'Event ID required' });

  try {
    const ev     = await Event.findById(event_id);
    if (!ev) return res.status(404).json({ error: 'Event not found' });

    const appUrl = await getAppUrl();

    const eventDateStr = ev.date
      ? new Date(ev.date).toLocaleDateString('sw', { day: 'numeric', month: 'long', year: 'numeric' })
      : 'Tarehe itafahamishwa';
    const eventLocation = ev.venue || 'Mahali patatangazwa';

    // Build filter — support targeting specific guest IDs
    const filter = { event_id, phone: { $exists: true, $nin: [null, ''] } };
    if (guest_ids && Array.isArray(guest_ids) && guest_ids.length > 0) {
      const mongoose = require('mongoose');
      filter._id = { $in: guest_ids.map(id => new mongoose.Types.ObjectId(id)) };
    } else if (type === 'qr' && only_unsent) {
      filter.sms_sent = { $ne: true };
    }
    if (type === 'thanks') filter.status = 'used';

    const guests = await Guest.find(filter);
    if (!guests.length) return res.json({ success: true, sent: 0, failed: 0, message: 'Hakuna wageni wenye simu' });

    let imageUrl;
    // imageUrl is now per-guest — see below in the loop

    let sent = 0, failed = 0, errors = [];

    for (const g of guests) {
      try {
        if (!g.phone || !g.phone.trim()) { failed++; continue; }

        const phone = cleanPhone(g.phone);
        const linkSuffix = g.qr_token;

        // Per-guest image URL — generates card with QR for this specific guest
        const guestImageUrl = `${appUrl}/api/guests/${g._id}/whatsapp-cover`;

        if (type === 'qr') {
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
          // No thanks template yet — use text
          const guestLink = `${appUrl}/guest/${g.qr_token}`;
          const msg = `Habari ${g.name},\n\nAsante sana kwa kuja kwenye *${ev.name}*!\n\nIlikuwa furaha kubwa kushiriki nawe. Mungu akubariki!\n\nAngalia kadi yako: ${guestLink}`;
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
