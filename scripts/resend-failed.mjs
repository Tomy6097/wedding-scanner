/**
 * resend-failed.mjs
 *
 * Sends the WhatsApp invitation to every guest where wa_sent != true
 * (failed, never tried, or pending) for a given event.
 *
 * Usage:
 *   node scripts/resend-failed.mjs                  ← all events
 *   node scripts/resend-failed.mjs <event_id>        ← one event
 *   node scripts/resend-failed.mjs <event_id> --failed-only  ← only wa_failed=true
 *
 * Uses the live backend API so all the same retry + rate-limit logic applies.
 */

import 'dotenv/config';
import mongoose from 'mongoose';

// ── Config ────────────────────────────────────────────────────
const MONGO_URI   = process.env.MONGO_URI   || 'mongodb://localhost:27017/wedding-checkin';
const APP_URL     = process.env.APP_URL     || 'https://wedding-scanner.onrender.com';
const EF_BASE     = 'eventflow-backend-614505894752.us-central1.run.app';
const EF_API_KEY  = 'ef_live_7f8bc928ba96948517759592f33a8ddd69fe6df9bd71b3b2';
const DELAY_MS    = 3500; // 3.5s between sends — stays well under rate limit

const targetEventId = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2] : null;
const failedOnly = process.argv.includes('--failed-only');

// ── DB models (inline — no require needed) ────────────────────
await mongoose.connect(MONGO_URI);
console.log('✅ MongoDB connected');

const Event = mongoose.model('Event', new mongoose.Schema({
  name: String, date: Date, venue: String
}, { strict: false }));

const Guest = mongoose.model('Guest', new mongoose.Schema({
  event_id: mongoose.Schema.Types.ObjectId,
  name: String, phone: String,
  qr_token: String,
  wa_sent: Boolean, wa_sent_at: Date,
  wa_failed: Boolean, wa_message_id: String
}, { strict: false }));

// ── Helpers ───────────────────────────────────────────────────
function cleanPhone(raw) {
  let p = (raw || '').replace(/\D/g, '');
  if (!p || p.length < 9) throw new Error('Invalid phone: ' + raw);
  if (p.startsWith('0')) p = '255' + p.slice(1);
  else if (!p.startsWith('255') && p.length <= 10) p = '255' + p;
  return '+' + p;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function efPost(path, payload, retries = 3) {
  const { default: https } = await import('https');
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const opts = {
      hostname: EF_BASE, port: 443, path, method: 'POST',
      headers: {
        'X-API-Key': EF_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', async () => {
        try {
          const j = JSON.parse(data);
          if (res.statusCode === 429 && retries > 0) {
            console.log(`  ⏳ 429 rate limited — waiting 60s then retrying (${retries} left)`);
            await sleep(60000);
            return efPost(path, payload, retries - 1).then(resolve).catch(reject);
          }
          if (res.statusCode === 200 || res.statusCode === 202 || j.success) resolve(j);
          else reject(new Error(j?.error?.message || j?.message || `HTTP ${res.statusCode}`));
        } catch (e) { reject(new Error('Parse: ' + data.slice(0, 80))); }
      });
    });
    req.on('error', e => reject(new Error('Network: ' + e.message)));
    req.write(body); req.end();
  });
}

async function sendToGuest(guest, ev) {
  const phone = cleanPhone(guest.phone);
  const efBase = `https://${EF_BASE}`;
  const rsvpLink = `${efBase}/go/rsvp/${guest.qr_token}`;
  const qrLink   = `${efBase}/go/qr/${guest.qr_token}`;
  const imageUrl = `${APP_URL}/api/guests/${guest._id}/whatsapp-cover`;

  const eventDate = ev.date
    ? new Date(ev.date).toLocaleDateString('sw', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'Tarehe itafahamishwa';

  const result = await efPost('/api/v1/external/whatsapp/send/template', {
    to: phone,
    template: 'eventflow_invite_sw',
    params: {
      guestName: guest.name,
      eventName: ev.name,
      eventDate,
      location:  ev.venue || 'Mahali patatangazwa',
      rsvpLink,
      qrLink,
      imageUrl
    }
  });

  return result;
}

// ── Main ──────────────────────────────────────────────────────
const events = targetEventId
  ? [await Event.findById(targetEventId)]
  : await Event.find({});

if (!events.length || !events[0]) {
  console.error('❌ No events found');
  process.exit(1);
}

let grandTotal = 0, grandSent = 0, grandFailed = 0;

for (const ev of events) {
  if (!ev) continue;
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📅 Event: ${ev.name} (${ev._id})`);

  // Build filter
  const filter = {
    event_id: ev._id,
    phone:    { $exists: true, $nin: [null, ''] },
    ...(failedOnly
      ? { wa_failed: true }
      : { $or: [{ wa_sent: { $ne: true } }] })
  };

  const guests = await Guest.find(filter);
  console.log(`   Target guests: ${guests.length}${failedOnly ? ' (failed only)' : ' (unsent + failed)'}`);

  if (!guests.length) {
    console.log('   ✅ Everyone already received the invitation — nothing to do.');
    continue;
  }

  let sent = 0, failed = 0;

  for (let i = 0; i < guests.length; i++) {
    const g = guests[i];
    const num = `[${i + 1}/${guests.length}]`;
    try {
      const phone = cleanPhone(g.phone);
      process.stdout.write(`   ${num} ${g.name} (${phone}) ... `);

      const result = await sendToGuest(g, ev);
      const msgId  = result?.data?.messageId ?? result?.data?.message_id ?? '';

      if (result?.data?.status === 'failed' || result?.data?.error) {
        g.wa_failed = true;
        await g.save();
        console.log(`❌ failed: ${result.data?.error || 'unknown'}`);
        failed++;
      } else {
        g.wa_sent       = true;
        g.wa_sent_at    = new Date();
        g.wa_failed     = false;
        g.wa_message_id = String(msgId);
        await g.save();
        console.log(`✅ queued (id=${msgId})`);
        sent++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`❌ error: ${msg}`);
      g.wa_failed = true;
      await g.save();
      failed++;
    }

    if (i < guests.length - 1) await sleep(DELAY_MS);
  }

  console.log(`\n   📊 Event summary: ✅ ${sent} sent | ❌ ${failed} failed`);
  grandTotal += guests.length; grandSent += sent; grandFailed += failed;
}

console.log(`\n${'═'.repeat(60)}`);
console.log(`🏁 TOTAL: ${grandTotal} targeted | ✅ ${grandSent} sent | ❌ ${grandFailed} failed`);
console.log(`${'═'.repeat(60)}\n`);

await mongoose.disconnect();
process.exit(grandFailed > 0 ? 1 : 0);
