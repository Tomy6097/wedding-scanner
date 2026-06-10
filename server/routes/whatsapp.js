const express  = require('express');
const https    = require('https');
const FormData = require('form-data');
const QRCode   = require('qrcode');
const Jimp     = require('jimp');
const { Guest, Event, Settings } = require('../db');
const router   = express.Router();

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin')
    return res.status(403).json({ error: 'Admin access required' });
  next();
}

// ── Helpers ───────────────────────────────────────────────────
async function getToken() {
  const s = await Settings.findOne({ key: 'fonnte_token' });
  const t = s?.value?.trim();
  if (!t) throw new Error('Fonnte token not configured in Settings');
  return t;
}

async function getAppUrl() {
  const s = await Settings.findOne({ key: 'app_url' });
  return (s?.value || 'https://wedding-scanner.onrender.com').replace(/\/$/, '');
}

function cleanPhone(raw) {
  const p = (raw || '').replace(/\D/g, '');
  if (p.length < 9) throw new Error(`Invalid phone: ${raw}`);
  return p;
}

// ── Core Fonnte POST (URL-encoded, no file) ───────────────────
function fonntePost(fields, token) {
  return new Promise((resolve, reject) => {
    const payload = new URLSearchParams(fields).toString();
    const buf = Buffer.from(payload, 'utf8');
    const opts = {
      hostname: 'api.fonnte.com', port: 443, path: '/send', method: 'POST',
      headers: {
        'Authorization': token,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': buf.length
      }
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        console.log('[Fonnte text]', data);
        try {
          const j = JSON.parse(data);
          if (j.status === true) resolve(j);
          else reject(new Error(j.reason || j.message || JSON.stringify(j)));
        } catch (e) { reject(new Error('Parse error: ' + data)); }
      });
    });
    req.on('error', e => reject(new Error('Network: ' + e.message)));
    req.write(buf);
    req.end();
  });
}

// ── Fonnte POST with image file (multipart via form-data npm) ─
function fonntePostWithFile(fields, imageBuffer, token) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, String(v));
    form.append('file', imageBuffer, { filename: 'card.jpg', contentType: 'image/jpeg' });

    const headers = {
      ...form.getHeaders(),
      'Authorization': token
    };

    const opts = {
      hostname: 'api.fonnte.com', port: 443, path: '/send', method: 'POST',
      headers
    };

    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        console.log('[Fonnte file]', data);
        try {
          const j = JSON.parse(data);
          if (j.status === true) resolve(j);
          else reject(new Error(j.reason || j.message || JSON.stringify(j)));
        } catch (e) { reject(new Error('Parse error: ' + data)); }
      });
    });
    req.on('error', e => reject(new Error('Network: ' + e.message)));
    form.pipe(req);
  });
}

// ── Public text-only send ─────────────────────────────────────
async function sendFonnte(phone, message) {
  const token = await getToken();
  const p = cleanPhone(phone);
  return fonntePost({ target: p, message, delay: '2', countryCode: '255' }, token);
}

// ── Generate QR card image ────────────────────────────────────
async function generateQRCard(guest, ev, appUrl) {
  const link  = `${appUrl}/guest/${guest.qr_token}`;
  const qrBuf = await QRCode.toBuffer(link, {
    width: 300, margin: 2, color: { dark: '#1a1a2e', light: '#ffffff' }
  });

  if (ev.card_image && ev.card_qr_x != null) {
    const cardImg = await Jimp.read(
      Buffer.from(ev.card_image.replace(/^data:image\/\w+;base64,/, ''), 'base64')
    );
    const qrImg = await Jimp.read(qrBuf);
    const W = cardImg.bitmap.width;
    const H = cardImg.bitmap.height;
    const sz = Math.round((ev.card_qr_size || 20) / 100 * W);
    qrImg.resize(sz, sz);
    cardImg.composite(qrImg,
      Math.round(ev.card_qr_x / 100 * W - sz / 2),
      Math.round(ev.card_qr_y / 100 * H - sz / 2)
    );
    return cardImg.quality(90).getBufferAsync(Jimp.MIME_JPEG);
  }

  // No template — just QR code as JPEG
  const qrImg = await Jimp.read(qrBuf);
  return qrImg.quality(90).getBufferAsync(Jimp.MIME_JPEG);
}

// ── Generate invite/thanks name card image ────────────────────
async function generateNameCard(guest, ev, type) {
  const src = type === 'invite' ? ev.invite_image : ev.thanks_image;
  if (!src) return null;

  const cardImg = await Jimp.read(
    Buffer.from(src.replace(/^data:image\/\w+;base64,/, ''), 'base64')
  );
  const W = cardImg.bitmap.width;
  const H = cardImg.bitmap.height;

  const nameX    = (type === 'invite' ? ev.invite_name_x    : ev.thanks_name_x)    ?? 50;
  const nameY    = (type === 'invite' ? ev.invite_name_y    : ev.thanks_name_y)    ?? 50;
  const nameSize = (type === 'invite' ? ev.invite_name_size : ev.thanks_name_size) ?? 5;
  const fontSize = Math.round((nameSize / 100) * W);

  let font;
  try {
    font = await Jimp.loadFont(
      fontSize >= 64 ? Jimp.FONT_SANS_64_BLACK :
      fontSize >= 32 ? Jimp.FONT_SANS_32_BLACK :
      fontSize >= 16 ? Jimp.FONT_SANS_16_BLACK :
                       Jimp.FONT_SANS_14_BLACK
    );
  } catch (_) { font = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK); }

  const tw = Jimp.measureText(font, guest.name);
  const th = Jimp.measureTextHeight(font, guest.name, W);
  cardImg.print(font,
    Math.round(nameX / 100 * W - tw / 2),
    Math.round(nameY / 100 * H - th / 2),
    guest.name
  );
  return cardImg.quality(90).getBufferAsync(Jimp.MIME_JPEG);
}

// ── POST /api/whatsapp/test ───────────────────────────────────
router.post('/test', requireAdmin, async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone required' });
  try {
    await sendFonnte(phone, 'Test from TMJ Wedding Tech. WhatsApp is working!');
    res.json({ success: true, message: 'Test message sent!' });
  } catch (err) {
    console.error('[/test]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/whatsapp/debug ──────────────────────────────────
router.post('/debug', requireAdmin, async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone required' });
  try {
    const token = await getToken();
    const p     = cleanPhone(phone);
    const result = await fonntePost({ target: p, message: 'DEBUG TEST', delay: '1', countryCode: '255' }, token);
    res.json({ success: true, raw: result, phone: p, token_length: token.length });
  } catch (err) {
    res.json({ success: false, error: err.message, phone: (phone || '').replace(/\D/g, '') });
  }
});

// ── POST /api/whatsapp/send-invites ──────────────────────────
router.post('/send-invites', requireAdmin, async (req, res) => {
  const { event_id, type, only_unsent, custom_message } = req.body;
  if (!event_id) return res.status(400).json({ error: 'Event ID required' });

  try {
    const ev     = await Event.findById(event_id);
    if (!ev) return res.status(404).json({ error: 'Event not found' });

    const token  = await getToken();
    const appUrl = await getAppUrl();

    const filter = { event_id, phone: { $exists: true, $nin: [null, ''] } };
    if (type === 'qr' && only_unsent) filter.sms_sent = { $ne: true };
    if (type === 'thanks') filter.status = 'used';

    const guests = await Guest.find(filter);
    if (!guests.length) return res.json({ success: true, sent: 0, failed: 0, message: 'No guests with phone numbers' });

    let sent = 0, failed = 0, errors = [];

    for (const g of guests) {
      try {
        if (!g.phone || !g.phone.trim()) { failed++; continue; }

        const phone = cleanPhone(g.phone);
        const link  = `${appUrl}/guest/${g.qr_token}`;
        const code  = g.unique_id.substring(0, 8).toUpperCase();
        const fields = { target: phone, delay: '2', countryCode: '255' };

        if (type === 'qr') {
          const msg = `Habari ${g.name},\n\nUmealikwa kwenye *${ev.name}*!\n\nTiketi yako ya QR:\n${link}\n\nNambari ya kuingia: *${code}*\n\nOnyesha QR code hii mlangoni.\nAsante!`;
          try {
            const imgBuf = await generateQRCard(g, ev, appUrl);
            await fonntePostWithFile({ ...fields, message: msg }, imgBuf, token);
          } catch (imgErr) {
            console.error(`[QR img failed ${g.name}]:`, imgErr.message);
            await fonntePost({ ...fields, message: msg }, token);
          }
          g.sms_sent    = true;
          g.sms_sent_at = new Date();
          await g.save();
          sent++;

        } else if (type === 'invite') {
          const msg = `Habari ${g.name},\n\nUnaalikwa rasmi kwenye *${ev.name}*.\n\nTazama mwaliko wako:\n${link}`;
          try {
            const imgBuf = await generateNameCard(g, ev, 'invite');
            if (imgBuf) await fonntePostWithFile({ ...fields, message: msg }, imgBuf, token);
            else        await fonntePost({ ...fields, message: msg }, token);
          } catch (e) {
            console.error(`[invite img failed ${g.name}]:`, e.message);
            await fonntePost({ ...fields, message: msg }, token);
          }
          sent++;

        } else if (type === 'thanks') {
          const msg = `Habari ${g.name},\n\nAsante sana kwa kuja kwenye *${ev.name}*!\n\nIlikuwa furaha kubwa kushiriki nawe. Mungu akubariki!`;
          try {
            const imgBuf = await generateNameCard(g, ev, 'thanks');
            if (imgBuf) await fonntePostWithFile({ ...fields, message: msg }, imgBuf, token);
            else        await fonntePost({ ...fields, message: msg }, token);
          } catch (e) {
            console.error(`[thanks img failed ${g.name}]:`, e.message);
            await fonntePost({ ...fields, message: msg }, token);
          }
          sent++;

        } else if (custom_message) {
          await fonntePost({ ...fields, message: `Ndugu ${g.name}, ${custom_message}` }, token);
          sent++;

        } else {
          failed++; continue;
        }

        await new Promise(r => setTimeout(r, 2000));
      } catch (e) {
        console.error(`[send-invites] ${g.name}:`, e.message);
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
