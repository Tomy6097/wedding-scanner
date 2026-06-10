const express = require('express');
const https   = require('https');
const QRCode  = require('qrcode');
const Jimp    = require('jimp');
const { Guest, Event, Settings } = require('../db');
const router  = express.Router();

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin')
    return res.status(403).json({ error: 'Admin access required' });
  next();
}

// ── Low-level Fonnte send (URL-encoded, text only) ────────────
function fonnteRequest(payload, token) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(payload, 'utf8');
    const options = {
      hostname: 'api.fonnte.com',
      port: 443, path: '/send', method: 'POST',
      headers: {
        'Authorization': token,
        'Content-Type':  'application/x-www-form-urlencoded',
        'Content-Length': buf.length
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        console.log('[Fonnte text response]', data);
        try {
          const j = JSON.parse(data);
          if (j.status === true) resolve(j);
          else reject(new Error(j.reason || j.message || JSON.stringify(j)));
        } catch (e) { reject(new Error('Fonnte parse error: ' + data)); }
      });
    });
    req.on('error', e => reject(new Error('Network: ' + e.message)));
    req.write(buf);
    req.end();
  });
}

// ── Fonnte multipart send (with image buffer) ─────────────────
function fonnteMultipart(phone, message, imgBuffer, token) {
  return new Promise((resolve, reject) => {
    const boundary = 'WB' + Date.now();
    const CRLF = '\r\n';

    // Build all text parts
    const fields = { target: phone, message, delay: '3', countryCode: '255' };
    let headerStr = '';
    for (const [k, v] of Object.entries(fields)) {
      headerStr += `--${boundary}${CRLF}`;
      headerStr += `Content-Disposition: form-data; name="${k}"${CRLF}${CRLF}`;
      headerStr += `${v}${CRLF}`;
    }
    // File part header
    headerStr += `--${boundary}${CRLF}`;
    headerStr += `Content-Disposition: form-data; name="file"; filename="card.png"${CRLF}`;
    headerStr += `Content-Type: image/png${CRLF}${CRLF}`;

    const footer = `${CRLF}--${boundary}--${CRLF}`;

    const headerBuf = Buffer.from(headerStr, 'utf8');
    const footerBuf = Buffer.from(footer, 'utf8');
    const body = Buffer.concat([headerBuf, imgBuffer, footerBuf]);

    const options = {
      hostname: 'api.fonnte.com',
      port: 443, path: '/send', method: 'POST',
      headers: {
        'Authorization':  token,
        'Content-Type':   `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        console.log('[Fonnte image response]', data);
        try {
          const j = JSON.parse(data);
          if (j.status === true) resolve(j);
          else reject(new Error(j.reason || j.message || JSON.stringify(j)));
        } catch (e) { reject(new Error('Fonnte parse error: ' + data)); }
      });
    });
    req.on('error', e => reject(new Error('Network: ' + e.message)));
    req.write(body);
    req.end();
  });
}

// ── Get token from DB ─────────────────────────────────────────
async function getToken() {
  const s = await Settings.findOne({ key: 'fonnte_token' });
  const t = s?.value?.trim();
  if (!t) throw new Error('Fonnte token not configured in Settings');
  return t;
}

function cleanPhone(raw) {
  const p = (raw || '').replace(/\D/g, '');
  if (p.length < 9) throw new Error(`Invalid phone: ${raw}`);
  return p;
}

// ── Public helper: send text ──────────────────────────────────
async function sendFonnte(phone, message) {
  const token = await getToken();
  const p = cleanPhone(phone);
  const payload = new URLSearchParams({ target: p, message, delay: '3', countryCode: '255' }).toString();
  return fonnteRequest(payload, token);
}

// ── POST /api/whatsapp/test ───────────────────────────────────
router.post('/test', requireAdmin, async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone required' });
  try {
    await sendFonnte(phone, 'Test from TMJ Wedding Tech. WhatsApp is working!');
    res.json({ success: true, message: 'Test message sent!' });
  } catch (err) {
    console.error('[/test error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/whatsapp/debug ── shows raw Fonnte response ─────
router.post('/debug', requireAdmin, async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone required' });
  try {
    const token = await getToken();
    const p = cleanPhone(phone);
    const payload = new URLSearchParams({ target: p, message: 'DEBUG TEST', delay: '1', countryCode: '255' }).toString();
    const result = await fonnteRequest(payload, token);
    res.json({ success: true, raw: result, phone: p, token_length: token.length });
  } catch (err) {
    res.json({ success: false, error: err.message, phone: (phone || '').replace(/\D/g,'') });
  }
});

// ── Generate QR card image ────────────────────────────────────
async function generateQRCard(guest, ev) {
  const appUrl = (await Settings.findOne({ key: 'app_url' }))?.value
                 || 'https://wedding-scanner.onrender.com';
  const link = `${appUrl}/guest/${guest.qr_token}`;

  const qrBuf = await QRCode.toBuffer(link, {
    width: 300, margin: 2, color: { dark: '#1a1a2e', light: '#ffffff' }
  });

  if (ev.card_image && ev.card_qr_x != null) {
    const cardImg = await Jimp.read(Buffer.from(ev.card_image.replace(/^data:image\/\w+;base64,/, ''), 'base64'));
    const qrImg   = await Jimp.read(qrBuf);
    const W = cardImg.bitmap.width;
    const H = cardImg.bitmap.height;
    const sz = Math.round((ev.card_qr_size || 20) / 100 * W);
    qrImg.resize(sz, sz);
    cardImg.composite(qrImg,
      Math.round(ev.card_qr_x / 100 * W - sz / 2),
      Math.round(ev.card_qr_y / 100 * H - sz / 2)
    );
    return cardImg.getBufferAsync(Jimp.MIME_PNG);
  }
  return qrBuf;
}

// ── Generate name card image (invite / thanks) ────────────────
async function generateNameCard(guest, ev, type) {
  const src = type === 'invite' ? ev.invite_image : ev.thanks_image;
  if (!src) return null;

  const cardImg = await Jimp.read(Buffer.from(src.replace(/^data:image\/\w+;base64,/, ''), 'base64'));
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
  } catch (_) {
    font = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
  }

  const tw = Jimp.measureText(font, guest.name);
  const th = Jimp.measureTextHeight(font, guest.name, W);
  cardImg.print(font,
    Math.round(nameX / 100 * W - tw / 2),
    Math.round(nameY / 100 * H - th / 2),
    guest.name
  );
  return cardImg.getBufferAsync(Jimp.MIME_PNG);
}

// ── POST /api/whatsapp/send-invites ──────────────────────────
router.post('/send-invites', requireAdmin, async (req, res) => {
  const { event_id, type, only_unsent, custom_message } = req.body;
  if (!event_id) return res.status(400).json({ error: 'Event ID required' });

  try {
    const ev = await Event.findById(event_id);
    if (!ev) return res.status(404).json({ error: 'Event not found' });

    const token = await getToken();

    const appUrl = (await Settings.findOne({ key: 'app_url' }))?.value
                   || 'https://wedding-scanner.onrender.com';

    const filter = { event_id, phone: { $exists: true, $nin: [null, ''] } };
    if (type === 'qr' && only_unsent) filter.sms_sent = { $ne: true };
    if (type === 'thanks') filter.status = 'used';

    const guests = await Guest.find(filter);
    if (!guests.length) return res.json({ success: true, sent: 0, failed: 0, message: 'No guests with phone numbers found' });

    let sent = 0, failed = 0, errors = [];

    for (const g of guests) {
      try {
        if (!g.phone || !g.phone.trim()) { failed++; continue; }
        const phone = cleanPhone(g.phone);
        const link  = `${appUrl}/guest/${g.qr_token}`;
        const code  = g.unique_id.substring(0, 8).toUpperCase();

        if (type === 'qr') {
          const msg = `Habari ${g.name},\n\nUmealikwa kwenye *${ev.name}*!\n\nTiketi yako ya QR:\n${link}\n\nNambari ya kuingia: *${code}*\n\nOnyesha QR code hii mlangoni.\nAsante!`;
          try {
            const imgBuf = await generateQRCard(g, ev);
            await fonnteMultipart(phone, msg, imgBuf, token);
          } catch (imgErr) {
            console.error('[QR image fallback]', imgErr.message);
            // fallback: text only
            const payload = new URLSearchParams({ target: phone, message: msg, delay: '3', countryCode: '255' }).toString();
            await fonnteRequest(payload, token);
          }
          g.sms_sent    = true;
          g.sms_sent_at = new Date();
          await g.save();
          sent++;

        } else if (type === 'invite') {
          const msg = `Habari ${g.name},\n\nUnaalikwa rasmi kwenye *${ev.name}*.\n\nTazama mwaliko wako:\n${link}`;
          try {
            const imgBuf = await generateNameCard(g, ev, 'invite');
            if (imgBuf) await fonnteMultipart(phone, msg, imgBuf, token);
            else await fonnteRequest(new URLSearchParams({ target: phone, message: msg, delay: '3', countryCode: '255' }).toString(), token);
          } catch (e) {
            const payload = new URLSearchParams({ target: phone, message: msg, delay: '3', countryCode: '255' }).toString();
            await fonnteRequest(payload, token);
          }
          sent++;

        } else if (type === 'thanks') {
          const msg = `Habari ${g.name},\n\nAsante sana kwa kuja kwenye *${ev.name}*!\n\nIlikuwa furaha kubwa kushiriki nawe. Mungu akubariki!`;
          try {
            const imgBuf = await generateNameCard(g, ev, 'thanks');
            if (imgBuf) await fonnteMultipart(phone, msg, imgBuf, token);
            else await fonnteRequest(new URLSearchParams({ target: phone, message: msg, delay: '3', countryCode: '255' }).toString(), token);
          } catch (e) {
            const payload = new URLSearchParams({ target: phone, message: msg, delay: '3', countryCode: '255' }).toString();
            await fonnteRequest(payload, token);
          }
          sent++;

        } else if (custom_message) {
          const msg = `Ndugu ${g.name}, ${custom_message}`;
          const payload = new URLSearchParams({ target: phone, message: msg, delay: '3', countryCode: '255' }).toString();
          await fonnteRequest(payload, token);
          sent++;

        } else {
          failed++;
          continue;
        }

        await new Promise(r => setTimeout(r, 1500));
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
