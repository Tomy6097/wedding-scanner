const express = require('express');
const https   = require('https');
const QRCode  = require('qrcode');
const Jimp    = require('jimp');
const { Guest, Event, Settings } = require('../db');
const router  = express.Router();

const EVENTFLOW_API_KEY = 'ef_live_7f8bc928ba96948517759592f33a8ddd69fe6df9bd71b3b2';
const IMGBB_KEY         = '33c31308c29e8917b836888ce76957f4';

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

// ── Generate per-guest card image buffer ──────────────────────
async function generateGuestCardBuffer(guest, ev, appUrl) {
  const link  = `${appUrl}/guest/${guest.qr_token}`;
  const qrBuf = await QRCode.toBuffer(link, { width: 300, margin: 2, color: { dark: '#1a1a2e', light: '#ffffff' } });

  const isDouble = guest.ticket_type === 'D';
  const ticketLabel = isDouble ? 'DOUBLE' : 'SINGLE';

  if (ev?.card_image && ev.card_qr_x != null) {
    const cardImg = await Jimp.read(Buffer.from(ev.card_image.replace(/^data:image\/\w+;base64,/, ''), 'base64'));
    const qrImg   = await Jimp.read(qrBuf);
    const W = cardImg.bitmap.width, H = cardImg.bitmap.height;
    const sz = Math.round((ev.card_qr_size || 20) / 100 * W);
    qrImg.resize(sz, sz);

    const qrX = Math.round(ev.card_qr_x / 100 * W - sz / 2);
    const qrY = Math.round(ev.card_qr_y / 100 * H - sz / 2);
    cardImg.composite(qrImg, qrX, qrY);

    // ── Print ticket type label above QR ──────────────────────
    try {
      const labelFont = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
      const labelW    = Jimp.measureText(labelFont, ticketLabel);
      const labelX    = qrX + Math.round(sz / 2) - Math.round(labelW / 2);
      const labelY    = Math.max(0, qrY - 22);
      cardImg.print(labelFont, labelX, labelY, ticketLabel);
    } catch (_) { /* skip label if font fails */ }

    if (ev.card_name_x != null && ev.card_name_y != null) {
      const fontSize = Math.round(((ev.card_name_size || 5) / 100) * W);
      let font;
      try { font = await Jimp.loadFont(fontSize >= 32 ? Jimp.FONT_SANS_32_BLACK : Jimp.FONT_SANS_16_BLACK); }
      catch (_) { font = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK); }
      cardImg.print(font,
        Math.round(ev.card_name_x / 100 * W - Jimp.measureText(font, guest.name) / 2),
        Math.round(ev.card_name_y / 100 * H - Jimp.measureTextHeight(font, guest.name, W) / 2),
        guest.name
      );
    }
    return cardImg.quality(90).getBufferAsync(Jimp.MIME_JPEG);
  }

  // Plain QR — add label above QR on white background
  const labelFont  = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK).catch(() => null);
  const qrImg      = await Jimp.read(qrBuf);
  const qrW        = qrImg.bitmap.width;
  const labelH     = 28;
  const combined   = new Jimp(qrW, qrW + labelH, 0xffffffff);
  combined.composite(qrImg, 0, labelH);
  if (labelFont) {
    const lw = Jimp.measureText(labelFont, ticketLabel);
    combined.print(labelFont, Math.round(qrW / 2 - lw / 2), 6, ticketLabel);
  }
  return combined.quality(90).getBufferAsync(Jimp.MIME_JPEG);
}

// ── Upload to ImgBB → permanent public URL ────────────────────
async function uploadToImgBB(buf) {
  const b64     = buf.toString('base64');
  const payload = new URLSearchParams({ key: IMGBB_KEY, image: b64, expiration: '86400' }).toString();
  const body    = Buffer.from(payload, 'utf8');
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.imgbb.com', port: 443, path: '/1/upload', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': body.length }
    };
    const req = https.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          if (j.success && j.data?.url) { console.log('[ImgBB]', j.data.url); resolve(j.data.url); }
          else reject(new Error('ImgBB: ' + d.substring(0, 100)));
        } catch (e) { reject(new Error('ImgBB parse: ' + d.substring(0, 100))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── EventFlow POST ────────────────────────────────────────────
function efPost(path, payload) {
  return new Promise(async (resolve, reject) => {
    const hostname = await getEventFlowBase();
    const body     = JSON.stringify(payload);
    const opts     = {
      hostname, port: 443, path, method: 'POST',
      headers: {
        'X-API-Key':      EVENTFLOW_API_KEY,
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        console.log('[EF]', res.statusCode, data.substring(0, 300));
        try {
          const j = JSON.parse(data);
          if (res.statusCode === 200 || res.statusCode === 202 || j.success) resolve(j);
          else reject(new Error(j.error?.message || j.error || j.message || `HTTP ${res.statusCode}: ${data}`));
        } catch (e) { reject(new Error('Parse error: ' + data.substring(0, 100))); }
      });
    });
    req.on('error', e => reject(new Error('Network: ' + e.message)));
    req.write(body);
    req.end();
  });
}

async function sendTemplate(phone, params, imageUrl) {
  return efPost('/api/v1/external/whatsapp/send/template', {
    to: phone,
    template: 'event_invitation',
    params: { ...params, imageUrl: imageUrl || '' }
  });
}

async function sendText(phone, message) {
  return efPost('/api/v1/external/whatsapp/send/text', { to: phone, message });
}

async function sendFonnte(phone, message) { return sendText(phone, message); }

// ── GET /api/whatsapp/logs ────────────────────────────────────
router.get('/logs', requireAdmin, async (req, res) => {
  try {
    const hostname = await getEventFlowBase();
    const phone    = req.query.phone || '';
    const path     = `/api/v1/external/whatsapp/logs${phone ? '?phone=' + encodeURIComponent(phone) : ''}`;
    const result   = await new Promise((resolve, reject) => {
      const opts = { hostname, port: 443, path, method: 'GET', headers: { 'X-API-Key': EVENTFLOW_API_KEY } };
      const req = https.request(opts, (r) => {
        let d = '';
        r.on('data', c => d += c);
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
    const appUrl = await getAppUrl();
    const ev     = await Event.findOne().sort({ createdAt: -1 });

    // Generate test image and upload to ImgBB
    const testGuest = { name: 'Mgeni wa Majaribio', qr_token: 'test-token-preview' };
    let imageUrl = '';
    try {
      const imgBuf = await generateGuestCardBuffer(testGuest, ev, appUrl);
      imageUrl     = await uploadToImgBB(imgBuf);
    } catch (imgErr) {
      console.warn('[test] image upload failed:', imgErr.message);
    }

    await sendTemplate(p, {
      guestName: 'Mgeni wa Majaribio',
      eventName: ev?.name || 'TMJ Wedding Tech',
      eventDate: ev?.date
        ? new Date(ev.date).toLocaleDateString('sw', { day: 'numeric', month: 'long', year: 'numeric' })
        : new Date().toLocaleDateString('sw', { day: 'numeric', month: 'long', year: 'numeric' }),
      location: ev?.venue || 'Dar es Salaam'
    }, imageUrl);

    res.json({ success: true, message: 'Test sent!', imageUrl });
  } catch (err) {
    console.error('[test]', err.message || err);
    res.status(500).json({ error: String(err.message || err) });
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

    let sent = 0, failed = 0, errors = [];

    for (const g of guests) {
      try {
        if (!g.phone?.trim()) { failed++; continue; }
        const phone     = cleanPhone(g.phone);
        const guestLink = `${appUrl}/guest/${g.qr_token}`;

        if (type === 'qr' || type === 'invite') {
          // Generate per-guest card image and upload to ImgBB
          let imageUrl = '';
          try {
            const imgBuf = await generateGuestCardBuffer(g, ev, appUrl);
            imageUrl     = await uploadToImgBB(imgBuf);
          } catch (imgErr) {
            console.warn(`[${g.name}] image upload failed:`, imgErr.message);
          }

          await sendTemplate(phone, {
            guestName: g.name,
            eventName: ev.name,
            eventDate,
            location
          }, imageUrl);

          if (type === 'qr') {
            g.sms_sent    = true;
            g.sms_sent_at = new Date();
            await g.save();
          }
          sent++;

        } else if (type === 'thanks') {
          await sendText(phone, `Habari ${g.name},\n\nAsante sana kwa kuja kwenye *${ev.name}*!\n\nIlikuwa furaha kubwa kushiriki nawe. Mungu akubariki!\n\nAngalia kadi yako: ${guestLink}`);
          sent++;

        } else if (custom_message) {
          await sendText(phone, `Ndugu ${g.name}, ${custom_message}`);
          sent++;

        } else { failed++; continue; }

        await new Promise(r => setTimeout(r, 2000));
      } catch (e) {
        console.error(`[send ${g.name}]`, e.message || e);
        failed++;
        errors.push(`${g.name}: ${String(e.message || e)}`);
      }
    }
    res.json({ success: true, sent, failed, errors: errors.slice(0, 10) });
  } catch (err) {
    console.error('[send-invites fatal]', err.message || err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

module.exports = { router, sendFonnte };
