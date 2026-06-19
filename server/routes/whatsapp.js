const express = require('express');
const https   = require('https');
const { Guest, Event, Settings } = require('../db');
const router  = express.Router();

const EVENTFLOW_API_KEY = 'ef_live_7f8bc928ba96948517759592f33a8ddd69fe6df9bd71b3b2';

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin')
    return res.status(403).json({ error: 'Admin access required' });
  next();
}

async function getEventFlowBase() {
  const s = await Settings.findOne({ key: 'eventflow_url' });
  const url = s?.value?.trim();
  if (url) return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return 'eventflow-backend-614505894752.us-central1.run.app';
}

async function getAppUrl() {
  const s = await Settings.findOne({ key: 'app_url' });
  return (s?.value || 'https://wedding-scanner.onrender.com').replace(/\/$/, '');
}

function cleanPhone(raw) {
  let p = (raw || '').replace(/\D/g, '');
  if (!p || p.length < 9) throw new Error('Invalid phone: ' + raw);
  if (p.startsWith('0')) p = '255' + p.slice(1);
  else if (!p.startsWith('255') && p.length <= 10) p = '255' + p;
  return '+' + p;
}

// ── EventFlow POST ────────────────────────────────────────────
function efPost(path, payload, token) {
  return new Promise(async (resolve, reject) => {
    const hostname = await getEventFlowBase();
    const body     = JSON.stringify(payload);
    const opts     = {
      hostname, port: 443, path, method: 'POST',
      headers: {
        'X-API-Key':      token || EVENTFLOW_API_KEY,
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        console.log('[EF]', res.statusCode, data.substring(0, 200));
        try {
          const j = JSON.parse(data);
          if (res.statusCode === 200 || res.statusCode === 202 || j.success) resolve(j);
          else reject(new Error(j.error || j.message || `HTTP ${res.statusCode}: ${data}`));
        } catch (e) { reject(new Error('Parse error: ' + data.substring(0, 100))); }
      });
    });
    req.on('error', e => reject(new Error('Network: ' + e.message)));
    req.write(body);
    req.end();
  });
}

async function sendTemplate(phone, params, guestImageUrl) {
  // Always use eventflow_invite_sw — the only confirmed working template.
  // It requires: imageUrl (IMAGE header) + body params + rsvpLink + qrLink buttons.
  const appUrl = await getAppUrl();

  // Build the stable /go/ redirect URLs so buttons work regardless of frontend domain
  const efBase = 'https://eventflow-backend-614505894752.us-central1.run.app';
  const rsvpLink = params.rsvpToken ? `${efBase}/go/rsvp/${params.rsvpToken}` : '';
  const qrLink   = params.qrToken   ? `${efBase}/go/qr/${params.qrToken}`     : '';

  return efPost('/api/v1/external/whatsapp/send/template', {
    to:       phone,
    template: 'eventflow_invite_sw',
    params: {
      guestName: params.guestName,
      eventName: params.eventName,
      eventDate: params.eventDate,
      location:  params.location,
      rsvpLink,
      qrLink,
      imageUrl:  guestImageUrl || ''
    }
  });
}

async function sendText(phone, message) {
  return efPost('/api/v1/external/whatsapp/send/text', { to: phone, message });
}

// Keep for backwards compat
async function sendFonnte(phone, message) {
  return sendText(phone, message);
}

// ── GET /api/whatsapp/logs ────────────────────────────────────
router.get('/logs', requireAdmin, async (req, res) => {
  try {
    const hostname = await getEventFlowBase();
    const phone    = req.query.phone || '';
    const path     = `/api/v1/external/whatsapp/logs${phone ? '?phone=' + encodeURIComponent(phone) : ''}`;
    const result   = await new Promise((resolve, reject) => {
      const opts = {
        hostname, port: 443, path, method: 'GET',
        headers: { 'X-API-Key': EVENTFLOW_API_KEY }
      };
      const req = https.request(opts, (r) => {
        let d = '';
        r.on('data', c => { d += c; });
        r.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error(d)); } });
      });
      req.on('error', reject);
      req.end();
    });
    res.json(result);
  } catch (err) { res.status(500).json({ error: String(err.message || err) }); }
});

// ── POST /api/whatsapp/test ───────────────────────────────────
router.post('/test', requireAdmin, async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone required' });
  try {
    const p      = cleanPhone(phone);
    const ev     = await Event.findOne().sort({ createdAt: -1 });
    const appUrl = await getAppUrl();

    // Create a dummy guest token for test buttons
    const testToken    = 'test-preview-token';
    const testImageUrl = ev ? `${appUrl}/api/events/${ev._id}/whatsapp-cover` : '';

    await sendTemplate(p, {
      guestName:  'Mgeni wa Majaribio',
      eventName:  ev?.name || 'TMJ Wedding Tech',
      eventDate:  ev?.date
        ? new Date(ev.date).toLocaleDateString('sw', { day: 'numeric', month: 'long', year: 'numeric' })
        : new Date().toLocaleDateString('sw', { day: 'numeric', month: 'long', year: 'numeric' }),
      location:   ev?.venue || 'Dar es Salaam',
      rsvpToken:  testToken,
      qrToken:    testToken
    }, testImageUrl);

    res.json({ success: true, message: 'Test sent!' });
  } catch (err) {
    console.error('[test]', err.message || err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

// ── POST /api/whatsapp/send-invites ──────────────────────────
// In-flight lock — prevents double-sends from double-clicks or socket re-fires
const _sendLocks = new Set();

router.post('/send-invites', requireAdmin, async (req, res) => {
  const { event_id, type, only_unsent, custom_message, guest_ids } = req.body;
  if (!event_id) return res.status(400).json({ error: 'Event ID required' });

  // Deduplicate: same event + type can only run once at a time
  const lockKey = `${event_id}:${type}:${JSON.stringify(guest_ids || [])}`;
  if (_sendLocks.has(lockKey)) {
    return res.status(429).json({ error: 'Send already in progress for this batch — please wait' });
  }
  _sendLocks.add(lockKey);

  try {
    const ev     = await Event.findById(event_id);
    if (!ev) return res.status(404).json({ error: 'Event not found' });
    const appUrl = await getAppUrl();

    const eventDate = ev.date
      ? new Date(ev.date).toLocaleDateString('sw', { day: 'numeric', month: 'long', year: 'numeric' })
      : 'Tarehe itafahamishwa';
    const location  = ev.venue || 'Mahali patatangazwa';

    const filter = { event_id, phone: { $exists: true, $nin: [null, ''] } };
    if (guest_ids?.length) {
      const { Types } = require('mongoose');
      filter._id = { $in: guest_ids.map(id => new Types.ObjectId(id)) };
    } else if (type === 'qr' && only_unsent) {
      filter.sms_sent = { $ne: true };
    }
    if (type === 'thanks') filter.status = 'used';

    const guests = await Guest.find(filter);
    if (!guests.length) return res.json({ success: true, sent: 0, failed: 0, message: 'Hakuna wageni wenye simu' });

    let sent = 0, failed = 0, not_on_whatsapp = 0, errors = [];

    for (const g of guests) {
      try {
        if (!g.phone?.trim()) { failed++; continue; }
        const phone     = cleanPhone(g.phone);
        const guestLink = `${appUrl}/guest/${g.qr_token}`;

        if (type === 'qr' || type === 'invite') {
          // Per-guest card image with their specific QR code baked in
          const guestImageUrl = `${appUrl}/api/guests/${g._id}/whatsapp-cover`;
          const result = await sendTemplate(phone, {
            guestName: g.name,
            eventName: ev.name,
            eventDate,
            location,
            rsvpToken: g.qr_token,
            qrToken:   g.qr_token
          }, guestImageUrl);

          // GhalaRails returns status:'failed' when the number is not on WhatsApp
          if (result?.data?.status === 'failed' || result?.data?.error) {
            not_on_whatsapp++;
            errors.push(`${g.name} (+${phone}): nambari hii haipo WhatsApp`);
          } else {
            if (type === 'qr') {
              g.sms_sent    = true;
              g.sms_sent_at = new Date();
              await g.save();
            }
            sent++;
          }

        } else if (type === 'thanks') {
          await sendText(phone, `Habari ${g.name},\n\nAsante sana kwa kuja kwenye *${ev.name}*!\n\nIlikuwa furaha kubwa kushiriki nawe. Mungu akubariki!\n\nAngalia kadi yako: ${guestLink}`);
          sent++;

        } else if (custom_message) {
          await sendText(phone, `Ndugu ${g.name}, ${custom_message}`);
          sent++;

        } else { failed++; continue; }

        await new Promise(r => setTimeout(r, 1500));
      } catch (e) {
        console.error(`[send ${g.name}]`, e.message || e);
        failed++;
        errors.push(`${g.name}: ${String(e.message || e)}`);
      }
    }
    res.json({ success: true, sent, failed, not_on_whatsapp, errors: errors.slice(0, 10) });
  } catch (err) {
    console.error('[send-invites fatal]', err.message || err);
    res.status(500).json({ error: String(err.message || err) });
  } finally {
    _sendLocks.delete(lockKey);
  }
});

module.exports = { router, sendFonnte };
