const express = require('express');
const https   = require('https');
const http    = require('http');
const QRCode  = require('qrcode');
const Jimp    = require('jimp');
const { Guest, Event, Settings } = require('../db');
const router  = express.Router();

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin')
    return res.status(403).json({ error: 'Admin access required' });
  next();
}

// ── Multipart form-data helper ────────────────────────────────
// Builds a multipart/form-data body from fields + optional file buffer
function buildMultipart(fields, fileBuffer, fileName, mimeType) {
  const boundary = '----WeddingBoundary' + Date.now();
  const parts = [];

  for (const [key, val] of Object.entries(fields)) {
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${key}"\r\n\r\n` +
      `${val}\r\n`
    );
  }

  if (fileBuffer) {
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`
    );
  }

  const closing = `\r\n--${boundary}--\r\n`;

  const textParts = Buffer.from(parts.join(''), 'utf8');
  const closingBuf = Buffer.from(closing, 'utf8');

  let body;
  if (fileBuffer) {
    const afterFile = Buffer.from('\r\n', 'utf8');
    body = Buffer.concat([textParts, fileBuffer, afterFile, closingBuf]);
  } else {
    body = Buffer.concat([textParts, closingBuf]);
  }

  return { body, boundary };
}

async function sendFonnteRaw(payload, token) {
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
        try {
          const parsed = JSON.parse(data);
          // Fonnte returns status:true on success
          if (parsed.status === true) resolve(parsed);
          else reject(new Error(parsed.reason || parsed.message || `Fonnte error: ${data}`));
        } catch (e) { reject(new Error('Fonnte parse error: ' + data)); }
      });
    });
    req.on('error', e => reject(new Error('Network: ' + e.message)));
    req.write(payload);
    req.end();
  });
}

// ── Send via Fonnte with image (multipart/form-data) ──────────
async function sendFonnteWithImage(phone, message, imageBuffer, token) {
  const cleanPhone = phone.replace(/\D/g, '');

  const fields = {
    target:      cleanPhone,
    message:     message,
    delay:       '3',
    countryCode: '255'
  };

  const { body, boundary } = buildMultipart(fields, imageBuffer, 'card.png', 'image/png');

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.fonnte.com',
      port: 443, path: '/send', method: 'POST',
      headers: {
        'Authorization':  token.trim(),
        'Content-Type':   `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.status === true) resolve(parsed);
          else reject(new Error(parsed.reason || parsed.message || `Fonnte error: ${data}`));
        } catch (e) { reject(new Error('Fonnte parse error: ' + data)); }
      });
    });
    req.on('error', e => reject(new Error('Network: ' + e.message)));
    req.write(body);
    req.end();
  });
}

// ── Send via Fonnte (text only) ───────────────────────────────
async function sendFonnte(phone, message) {
  const token = (await Settings.findOne({ key: 'fonnte_token' }))?.value;
  if (!token || !token.trim()) throw new Error('Fonnte token not configured in Settings');
  const cleanPhone = phone.replace(/\D/g, '');
  if (!cleanPhone || cleanPhone.length < 9) throw new Error(`Invalid phone: ${phone}`);
  const payload = new URLSearchParams({ target: cleanPhone, message, delay: '3', countryCode: '255' }).toString();
  return sendFonnteRaw(payload, token);
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

// ── Generate card image with QR overlay ──────────────────────
async function generateCardImage(guest, event) {
  const appUrl = (await Settings.findOne({ key: 'app_url' }))?.value
                 || 'https://wedding-scanner.onrender.com';

  // Generate QR code as buffer — encode the guest link
  const link = `${appUrl}/guest/${guest.qr_token}`;
  const qrBuffer = await QRCode.toBuffer(link, {
    width: 300, margin: 2, color: { dark: '#1a1a2e', light: '#ffffff' }
  });

  // If event has card template, overlay QR on it
  if (event.card_image && event.card_qr_x != null) {
    const base64Data = event.card_image.replace(/^data:image\/\w+;base64,/, '');
    const cardBuffer = Buffer.from(base64Data, 'base64');

    const cardImg = await Jimp.read(cardBuffer);
    const qrImg   = await Jimp.read(qrBuffer);

    const W = cardImg.bitmap.width;
    const H = cardImg.bitmap.height;
    const qrSize = Math.round((event.card_qr_size || 20) / 100 * W);

    qrImg.resize(qrSize, qrSize);

    const qrX = Math.round((event.card_qr_x / 100) * W - qrSize / 2);
    const qrY = Math.round((event.card_qr_y / 100) * H - qrSize / 2);

    cardImg.composite(qrImg, qrX, qrY);
    return await cardImg.getBufferAsync(Jimp.MIME_PNG);
  }

  // No template — return plain QR
  return qrBuffer;
}

// ── Generate invite/thanks card image with guest name overlay ─
async function generateNameCardImage(guest, ev, type) {
  const templateImage = type === 'invite' ? ev.invite_image : ev.thanks_image;
  if (!templateImage) return null;

  const nameX    = (type === 'invite' ? ev.invite_name_x    : ev.thanks_name_x)    ?? 50;
  const nameY    = (type === 'invite' ? ev.invite_name_y    : ev.thanks_name_y)    ?? 50;
  const nameSize = (type === 'invite' ? ev.invite_name_size : ev.thanks_name_size) ?? 5;

  const base64Data = templateImage.replace(/^data:image\/\w+;base64,/, '');
  const cardBuffer = Buffer.from(base64Data, 'base64');
  const cardImg    = await Jimp.read(cardBuffer);

  const W = cardImg.bitmap.width;
  const H = cardImg.bitmap.height;

  const fontSize = Math.round((nameSize / 100) * W);
  let font;
  try {
    const fontPath = fontSize >= 64 ? Jimp.FONT_SANS_64_BLACK
                   : fontSize >= 32 ? Jimp.FONT_SANS_32_BLACK
                   : fontSize >= 16 ? Jimp.FONT_SANS_16_BLACK
                   :                  Jimp.FONT_SANS_14_BLACK;
    font = await Jimp.loadFont(fontPath);
  } catch (e) {
    font = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
  }

  const nameWidth = Jimp.measureText(font, guest.name);
  const nameHeight = Jimp.measureTextHeight(font, guest.name, W);
  const textX = Math.round((nameX / 100) * W) - Math.round(nameWidth / 2);
  const textY = Math.round((nameY / 100) * H) - Math.round(nameHeight / 2);

  cardImg.print(font, textX, textY, guest.name);

  return await cardImg.getBufferAsync(Jimp.MIME_PNG);
}

// POST /api/whatsapp/send-invites
router.post('/send-invites', requireAdmin, async (req, res) => {
  const { event_id, type, only_unsent, custom_message } = req.body;
  if (!event_id) return res.status(400).json({ error: 'Event ID required' });

  try {
    const ev = await Event.findById(event_id);
    if (!ev) return res.status(404).json({ error: 'Event not found' });

    const token = (await Settings.findOne({ key: 'fonnte_token' }))?.value;
    if (!token || !token.trim()) return res.status(400).json({ error: 'Fonnte token not configured in Settings' });

    const appUrl = (await Settings.findOne({ key: 'app_url' }))?.value
                   || 'https://wedding-scanner.onrender.com';

    const filter = { event_id, phone: { $exists: true, $nin: [null, ''] } };
    if (type === 'qr' && only_unsent) filter.sms_sent = { $ne: true };
    if (type === 'thanks') filter.status = 'used';

    const guests = await Guest.find(filter);
    if (!guests.length) return res.json({ success: true, sent: 0, failed: 0 });

    let sent = 0, failed = 0, errors = [];

    for (const g of guests) {
      try {
        const link = `${appUrl}/guest/${g.qr_token}`;
        const code = g.unique_id.substring(0, 8).toUpperCase();

        if (type === 'qr') {
          const msg = `Habari ${g.name},\n\nUmealikwa kwenye *${ev.name}*!\n\nTiketi yako ya QR:\n${link}\n\nNambari ya kuingia: *${code}*\n\nOnyesha QR code hii mlangoni.\nAsante!`;
          try {
            const cardBuf = await generateCardImage(g, ev);
            await sendFonnteWithImage(g.phone, msg, cardBuf, token.trim());
          } catch (imgErr) {
            console.error('Image send failed, falling back to text:', imgErr.message);
            await sendFonnte(g.phone, msg);
          }
          g.sms_sent    = true;
          g.sms_sent_at = new Date();
          await g.save();
          sent++;

        } else if (type === 'invite') {
          const msg = `Habari ${g.name},\n\nUnaalikwa rasmi kwenye *${ev.name}*.\n\nTazama mwaliko wako:\n${link}`;
          if (ev.invite_image) {
            try {
              const cardBuf = await generateNameCardImage(g, ev, 'invite');
              if (cardBuf) await sendFonnteWithImage(g.phone, msg, cardBuf, token.trim());
              else await sendFonnte(g.phone, msg);
            } catch (e) { await sendFonnte(g.phone, msg); }
          } else {
            await sendFonnte(g.phone, msg);
          }
          sent++;

        } else if (type === 'thanks') {
          const msg = `Habari ${g.name},\n\nAsante sana kwa kuja kwenye *${ev.name}*!\n\nIlikuwa furaha kubwa kushiriki nawe. Mungu akubariki!`;
          if (ev.thanks_image) {
            try {
              const cardBuf = await generateNameCardImage(g, ev, 'thanks');
              if (cardBuf) await sendFonnteWithImage(g.phone, msg, cardBuf, token.trim());
              else await sendFonnte(g.phone, msg);
            } catch (e) { await sendFonnte(g.phone, msg); }
          } else {
            await sendFonnte(g.phone, msg);
          }
          sent++;

        } else if (custom_message) {
          await sendFonnte(g.phone, `Ndugu ${g.name}, ${custom_message}`);
          sent++;
        } else {
          failed++;
          continue;
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

// ── Generate card image with QR overlay ──────────────────────
async function generateCardImage(guest, event) {
  const appUrl = (await Settings.findOne({ key: 'app_url' }))?.value || 'https://wedding-scanner.onrender.com';
  const link   = `${appUrl}/guest/${guest.qr_token}`;

  // Generate QR code as buffer
  const qrBuffer = await QRCode.toBuffer(guest.qr_token, {
    width: 300, margin: 2, color: { dark: '#1a1a2e', light: '#ffffff' }
  });

  // If event has card template, overlay QR on it
  if (event.card_image && event.card_qr_x != null) {
    // Parse base64 image
    const base64Data = event.card_image.replace(/^data:image\/\w+;base64,/, '');
    const cardBuffer = Buffer.from(base64Data, 'base64');

    const cardImg = await Jimp.read(cardBuffer);
    const qrImg   = await Jimp.read(qrBuffer);

    const W = cardImg.bitmap.width;
    const H = cardImg.bitmap.height;
    const qrSize = Math.round((event.card_qr_size || 20) / 100 * W);

    qrImg.resize(qrSize, qrSize);

    const qrX = Math.round((event.card_qr_x / 100) * W - qrSize / 2);
    const qrY = Math.round((event.card_qr_y / 100) * H - qrSize / 2);

    cardImg.composite(qrImg, qrX, qrY);

    return await cardImg.getBufferAsync(Jimp.MIME_PNG);
  }

  // No template — return plain QR
  return qrBuffer;
}

// ── Upload image to Fonnte and get URL ────────────────────────
// Fonnte accepts direct base64 or URL in the 'url' parameter
async function sendFonnteWithImage(phone, message, imageBuffer, token) {
  const cleanPhone = phone.replace(/\D/g, '');
  const base64Img  = imageBuffer.toString('base64');
  const dataUrl    = `data:image/png;base64,${base64Img}`;

  // First send image
  const imgPayload = new URLSearchParams({
    target:      cleanPhone,
    message:     message,
    url:         dataUrl,
    delay:       '3',
    countryCode: '255'
  }).toString();

  return sendFonnteRaw(imgPayload, token);
}

async function sendFonnteRaw(payload, token) {
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
        try {
          const parsed = JSON.parse(data);
          if (parsed.status === true || res.statusCode === 200) resolve(parsed);
          else reject(new Error(parsed.reason || parsed.message || `Fonnte error ${res.statusCode}: ${data}`));
        } catch (e) { reject(new Error('Fonnte parse error: ' + data)); }
      });
    });
    req.on('error', e => reject(new Error('Network: ' + e.message)));
    req.write(payload);
    req.end();
  });
}

// ── Send via Fonnte (text only) ───────────────────────────────
async function sendFonnte(phone, message) {
  const token = (await Settings.findOne({ key: 'fonnte_token' }))?.value;
  if (!token || !token.trim()) throw new Error('Fonnte token not configured in Settings');
  const cleanPhone = phone.replace(/\D/g, '');
  if (!cleanPhone || cleanPhone.length < 9) throw new Error(`Invalid phone: ${phone}`);
  const payload = new URLSearchParams({ target: cleanPhone, message, delay: '3', countryCode: '255' }).toString();
  return sendFonnteRaw(payload, token);
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

// ── Generate invite/thanks card image with guest name overlay ─
async function generateNameCardImage(guest, ev, type) {
  const templateImage = type === 'invite' ? ev.invite_image : ev.thanks_image;
  if (!templateImage) return null;

  const nameX    = (type === 'invite' ? ev.invite_name_x    : ev.thanks_name_x)    ?? 50;
  const nameY    = (type === 'invite' ? ev.invite_name_y    : ev.thanks_name_y)    ?? 50;
  const nameSize = (type === 'invite' ? ev.invite_name_size : ev.thanks_name_size) ?? 5;
  const nameColor= (type === 'invite' ? ev.invite_name_color: ev.thanks_name_color) || '#000000';

  const base64Data = templateImage.replace(/^data:image\/\w+;base64,/, '');
  const cardBuffer = Buffer.from(base64Data, 'base64');
  const cardImg    = await Jimp.read(cardBuffer);

  const W = cardImg.bitmap.width;
  const H = cardImg.bitmap.height;

  // Load a font from Jimp's built-in fonts (closest to name size)
  const fontSize = Math.round((nameSize / 100) * W);
  let font;
  try {
    // Pick closest built-in font size
    const fontPath = fontSize >= 64 ? Jimp.FONT_SANS_64_BLACK
                   : fontSize >= 32 ? Jimp.FONT_SANS_32_BLACK
                   : fontSize >= 16 ? Jimp.FONT_SANS_16_BLACK
                   :                  Jimp.FONT_SANS_14_BLACK;
    font = await Jimp.loadFont(fontPath);
  } catch (e) {
    font = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
  }

  const textX = Math.round((nameX / 100) * W);
  const textY = Math.round((nameY / 100) * H);

  // If name color is not black, tint a white-version font
  // For simplicity, print name using built-in font (always dark)
  cardImg.print(
    font,
    textX - Math.round(Jimp.measureText(font, guest.name) / 2),
    textY - Math.round(Jimp.measureTextHeight(font, guest.name, W) / 2),
    { text: guest.name, alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE },
    W,
    Math.round(Jimp.measureTextHeight(font, guest.name, W))
  );

  return await cardImg.getBufferAsync(Jimp.MIME_PNG);
}

// POST /api/whatsapp/send-invites
router.post('/send-invites', requireAdmin, async (req, res) => {
  const { event_id, type, only_unsent, custom_message } = req.body;
  if (!event_id) return res.status(400).json({ error: 'Event ID required' });

  try {
    const ev = await Event.findById(event_id);
    if (!ev) return res.status(404).json({ error: 'Event not found' });

    const token = (await Settings.findOne({ key: 'fonnte_token' }))?.value;
    if (!token || !token.trim()) return res.status(400).json({ error: 'Fonnte token not configured in Settings' });

    const appUrl = (await Settings.findOne({ key: 'app_url' }))?.value
                   || 'https://wedding-scanner.onrender.com';

    const filter = { event_id, phone: { $exists: true, $nin: [null, ''] } };
    if (type === 'qr' && only_unsent) filter.sms_sent = { $ne: true };
    if (type === 'thanks') filter.status = 'used';

    const guests = await Guest.find(filter);
    if (!guests.length) return res.json({ success: true, sent: 0, failed: 0 });

    let sent = 0, failed = 0, errors = [];

    for (const g of guests) {
      try {
        const link = `${appUrl}/guest/${g.qr_token}`;
        const code = g.unique_id.substring(0, 8).toUpperCase();

        if (type === 'qr') {
          // Send card image with QR overlaid (or text-only if no template)
          const msg = `Habari ${g.name},\n\nUmealikwa kwenye *${ev.name}*!\n\nTiketi yako ya QR:\n${link}\n\nNambari ya kuingia: *${code}*\n\nOnyesha QR code hii mlangoni.\nAsante!`;

          try {
            const cardBuf = await generateCardImage(g, ev);
            await sendFonnteWithImage(g.phone, msg, cardBuf, token.trim());
          } catch (imgErr) {
            // Fallback to text-only if image fails
            await sendFonnteRaw(
              new URLSearchParams({ target: g.phone.replace(/\D/g,''), message: msg, delay:'3', countryCode:'255' }).toString(),
              token.trim()
            );
          }

          g.sms_sent    = true;
          g.sms_sent_at = new Date();
          await g.save();
          sent++;

        } else if (type === 'invite') {
          const msg = `Habari ${g.name},\n\nUnaalikwa rasmi kwenye *${ev.name}*.\n\nTazama mwaliko wako:\n${link}`;
          if (ev.invite_image) {
            try {
              const cardBuf = await generateNameCardImage(g, ev, 'invite');
              if (cardBuf) {
                await sendFonnteWithImage(g.phone, msg, cardBuf, token.trim());
              } else {
                await sendFonnte(g.phone, msg);
              }
            } catch (imgErr) {
              await sendFonnte(g.phone, msg);
            }
          } else {
            await sendFonnte(g.phone, msg);
          }
          sent++;

        } else if (type === 'thanks') {
          const msg = `Habari ${g.name},\n\nAsante sana kwa kuja kwenye *${ev.name}*!\n\nIlikuwa furaha kubwa kushiriki nawe. Mungu akubariki!`;
          if (ev.thanks_image) {
            try {
              const cardBuf = await generateNameCardImage(g, ev, 'thanks');
              if (cardBuf) {
                await sendFonnteWithImage(g.phone, msg, cardBuf, token.trim());
              } else {
                await sendFonnte(g.phone, msg);
              }
            } catch (imgErr) {
              await sendFonnte(g.phone, msg);
            }
          } else {
            await sendFonnte(g.phone, msg);
          }
          sent++;

        } else if (custom_message) {
          const msg = `Ndugu ${g.name}, ${custom_message}`;
          await sendFonnte(g.phone, msg);
          sent++;
        } else {
          failed++;
          continue;
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
