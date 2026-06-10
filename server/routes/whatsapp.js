const express  = require('express');
const https    = require('https');
const QRCode   = require('qrcode');
const Jimp     = require('jimp');
const { Guest, Event, Settings } = require('../db');
const router   = express.Router();

const IMGBB_KEY = '33c31308c29e8917b836888ce76957f4';

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

// ── Upload image buffer to ImgBB → returns public URL ─────────
async function uploadToImgBB(imageBuffer) {
  const base64 = imageBuffer.toString('base64');
  const payload = new URLSearchParams({
    key:   IMGBB_KEY,
    image: base64,
    expiration: '3600'   // expire in 1 hour — enough for Fonnte to fetch
  }).toString();
  const buf = Buffer.from(payload, 'utf8');

  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.imgbb.com',
      port: 443,
      path: '/1/upload',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': buf.length
      }
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (j.success && j.data && j.data.url) {
            console.log('[ImgBB] uploaded:', j.data.url);
            resolve(j.data.url);
          } else {
            reject(new Error('ImgBB error: ' + JSON.stringify(j)));
          }
        } catch (e) { reject(new Error('ImgBB parse error: ' + data)); }
      });
    });
    req.on('error', e => reject(new Error('ImgBB network: ' + e.message)));
    req.write(buf);
    req.end();
  });
}

// ── Fonnte POST (URL-encoded) ─────────────────────────────────
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
        console.log('[Fonnte]', data);
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

// ── Send via Fonnte with image URL ────────────────────────────
async function fonntePostWithImageUrl(phone, message, imageUrl, token) {
  return fonntePost({
    target:      phone,
    message:     message,
    url:         imageUrl,
    delay:       '2',
    countryCode: '255'
  }, token);
}

// ── Public text-only send ─────────────────────────────────────
async function sendFonnte(phone, message) {
  const token = await getToken();
  const p = cleanPhone(phone);
  return fonntePost({ target: p, message, delay: '2', countryCode: '255' }, token);
}

// ── Generate QR card image buffer ────────────────────────────
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

  const qrImg = await Jimp.read(qrBuf);
  return qrImg.quality(90).getBufferAsync(Jimp.MIME_JPEG);
}

// ── Generate invite/thanks name card buffer ───────────────────
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

// ── Helper: generate image + upload to ImgBB + send via Fonnte ─
async function sendWithImage(phone, message, imgBuf, token) {
  try {
    const imgUrl = await uploadToImgBB(imgBuf);
    await fonntePostWithImageUrl(phone, message, imgUrl, token);
  } catch (e) {
    // Fallback: send text + link only
    console.error('[sendWithImage fallback]', e.message);
    await fonntePost({ target: phone, message, delay: '2', countryCode: '255' }, token);
  }
}

// ── POST /api/whatsapp/test ───────────────────────────────────
router.post('/test', requireAdmin, async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone required' });
  try {
    await sendFonnte(phone, 'Test from TMJ Wedding Tech. WhatsApp is working!');
    res.json({ success: true, message: 'Test message sent!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/whatsapp/test-image ─────────────────────────────
router.post('/test-image', requireAdmin, async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone required' });
  try {
    const token = await getToken();
    const p     = cleanPhone(phone);

    // Small test image
    const img = new Jimp(400, 200, 0xffffffff);
    const font = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
    img.print(font, 40, 80, 'TMJ Wedding Tech');
    const buf = await img.quality(90).getBufferAsync(Jimp.MIME_JPEG);

    const imgUrl = await uploadToImgBB(buf);
    await fonntePostWithImageUrl(p, 'Test image from TMJ Wedding Tech', imgUrl, token);

    res.json({ success: true, message: 'Image sent!', url: imgUrl });
  } catch (err) {
    console.error('[test-image]', err.message);
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

        const phone  = cleanPhone(g.phone);
        const link   = `${appUrl}/guest/${g.qr_token}`;
        const code   = g.unique_id.substring(0, 8).toUpperCase();

        if (type === 'qr') {
          const msg = `Habari ${g.name},\n\nUmealikwa kwenye *${ev.name}*!\n\nTiketi yako ya QR:\n${link}\n\nNambari ya kuingia: *${code}*\n\nOnyesha QR code hii mlangoni.\nAsante!`;
          const imgBuf = await generateQRCard(g, ev, appUrl);
          await sendWithImage(phone, msg, imgBuf, token);
          g.sms_sent    = true;
          g.sms_sent_at = new Date();
          await g.save();
          sent++;

        } else if (type === 'invite') {
          const msg = `Habari ${g.name},\n\nUnaalikwa rasmi kwenye *${ev.name}*.\n\nTazama mwaliko wako:\n${link}`;
          const imgBuf = await generateNameCard(g, ev, 'invite');
          if (imgBuf) await sendWithImage(phone, msg, imgBuf, token);
          else        await fonntePost({ target: phone, message: msg, delay: '2', countryCode: '255' }, token);
          sent++;

        } else if (type === 'thanks') {
          const msg = `Habari ${g.name},\n\nAsante sana kwa kuja kwenye *${ev.name}*!\n\nIlikuwa furaha kubwa kushiriki nawe. Mungu akubariki!`;
          const imgBuf = await generateNameCard(g, ev, 'thanks');
          if (imgBuf) await sendWithImage(phone, msg, imgBuf, token);
          else        await fonntePost({ target: phone, message: msg, delay: '2', countryCode: '255' }, token);
          sent++;

        } else if (custom_message) {
          await fonntePost({ target: phone, message: `Ndugu ${g.name}, ${custom_message}`, delay: '2', countryCode: '255' }, token);
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
