/**
 * End-to-end test: login → send WhatsApp test message via wedding-scanner server
 */
const BASE = 'http://localhost:4000';
const TEST_PHONE = '+255683859574';

async function run() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Wedding Scanner — End-to-end WhatsApp test');
  console.log('═══════════════════════════════════════════════');

  // 1. Login and grab session cookie
  console.log('\n[1/3] Logging in as admin…');
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const loginData = await loginRes.json() as any;
  console.log(`  HTTP ${loginRes.status}:`, JSON.stringify(loginData));

  if (!loginData.success) {
    console.error('❌ Login failed'); process.exit(1);
  }

  // Extract session cookie
  const cookie = loginRes.headers.get('set-cookie') ?? '';
  console.log('  ✓ Logged in, cookie:', cookie.slice(0, 60) + '…');

  // 2. Send test WhatsApp via /api/whatsapp/test
  console.log(`\n[2/3] Sending WhatsApp test to ${TEST_PHONE}…`);
  const sendRes = await fetch(`${BASE}/api/whatsapp/test`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookie,
    },
    body: JSON.stringify({ phone: TEST_PHONE }),
  });
  const sendData = await sendRes.json() as any;
  console.log(`  HTTP ${sendRes.status}:`, JSON.stringify(sendData, null, 2));

  if (!sendData.success) {
    console.error('\n❌ Send FAILED — see error above');
    process.exit(1);
  }

  console.log('\n✅ Message sent successfully through wedding-scanner → EventFlow → GhalaRails → WhatsApp!');

  // 3. Check events in DB
  console.log('\n[3/3] Checking events in DB…');
  const eventsRes = await fetch(`${BASE}/api/events`, {
    headers: { 'Cookie': cookie },
  });
  const eventsData = await eventsRes.json() as any;
  const events = eventsData?.events ?? eventsData?.data ?? [];
  console.log(`  Found ${Array.isArray(events) ? events.length : '?'} event(s)`);
  if (Array.isArray(events) && events.length > 0) {
    events.slice(0, 3).forEach((e: any) => console.log(`   - ${e.name} (${e._id})`));
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log('  Frontend: http://localhost:4000');
  console.log('  Login:    admin / admin123');
  console.log('  Go to:    Events → open event → Send Invites tab');
  console.log('═══════════════════════════════════════════════');
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });
