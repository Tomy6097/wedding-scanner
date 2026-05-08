/* ============================================================
   Wedding Check-in System — Frontend Application
   ============================================================ */

/* ============================================================
   Wedding Check-in System — Frontend Application
   ============================================================ */

'use strict';

// ── State ────────────────────────────────────────────────────
const state = {
  user: null,
  guests: [],
  stats: { total: 0, checkedIn: 0, remaining: 0 },
  recentCheckins: [],
  scanCooldown: false,
  csvData: [],
  initialized: false,
  eventName: 'Our Wedding'
};

// ── Socket.io ────────────────────────────────────────────────
const socket = io();

// ── Helpers ──────────────────────────────────────────────────
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

/** Normalise MongoDB _id vs plain id */
const gid = (g) => g._id || g.id;

function showPage(id) {
  $$('.page').forEach(p => { p.classList.add('hidden'); p.classList.remove('active'); });
  const page = $(`#${id}`);
  if (page) { page.classList.remove('hidden'); page.classList.add('active'); }
}

function showAlert(el, msg, type = 'error') {
  el.textContent = msg;
  el.className = `alert alert-${type}`;
  el.classList.remove('hidden');
  if (type === 'success') setTimeout(() => el.classList.add('hidden'), 4000);
}

function hideAlert(el) { el.classList.add('hidden'); }

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

// ── Audio Feedback ───────────────────────────────────────────
function playSound(type) {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (type === 'success') {
      osc.frequency.setValueAtTime(523, ctx.currentTime);
      osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1);
      osc.frequency.setValueAtTime(784, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } else {
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.setValueAtTime(200, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    }
  } catch (e) { /* audio not supported */ }
}

// ── API ──────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include'
  };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(`/api${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ── Auth ─────────────────────────────────────────────────────
async function checkAuth() {
  try {
    const user = await api('GET', '/auth/me');
    state.user = user;
    return user;
  } catch { return null; }
}

async function login(username, password) {
  const data = await api('POST', '/auth/login', { username, password });
  state.user = data;
  return data;
}

async function logout() {
  try { await api('POST', '/auth/logout'); } catch (e) { /* ignore */ }
  state.user = null;
  state.initialized = false;
  stopScanner();
  showPage('page-login');
}


// ── Stats ────────────────────────────────────────────────────
async function fetchStats() {
  try {
    const stats = await api('GET', '/guests/stats');
    state.stats = stats;
    updateStatsUI(stats);
  } catch (e) { console.error('Stats error:', e); }
}

function updateStatsUI({ total, checkedIn, remaining }) {
  const pct         = total > 0 ? Math.round((checkedIn / total) * 100) : 0;
  const elTotal     = $('#stat-total');
  const elChecked   = $('#stat-checkedin');
  const elRemaining = $('#stat-remaining');
  const elPct       = $('#stat-percent');
  const elFill      = $('#progress-fill');
  const elPText     = $('#progress-text');
  if (elTotal)     elTotal.textContent     = total;
  if (elChecked)   elChecked.textContent   = checkedIn;
  if (elRemaining) elRemaining.textContent = remaining;
  if (elPct)       elPct.textContent       = `${pct}%`;
  if (elFill)      elFill.style.width      = `${pct}%`;
  if (elPText)     elPText.textContent     = `${checkedIn} / ${total}`;
}

async function fetchScannerStats() {
  try {
    const stats = await api('GET', '/guests/stats');
    state.stats = stats;
    const elCI = $('#sc-checkedin');
    const elT  = $('#sc-total');
    const elR  = $('#sc-remaining');
    if (elCI) elCI.textContent = stats.checkedIn;
    if (elT)  elT.textContent  = stats.total;
    if (elR)  elR.textContent  = stats.remaining;
  } catch (e) { console.error('Scanner stats error:', e); }
}

// ── Guest Table ──────────────────────────────────────────────
async function fetchGuests(search = '') {
  const path   = search ? `/guests?search=${encodeURIComponent(search)}` : '/guests';
  const guests = await api('GET', path);
  state.guests = guests;
  renderGuestsTable(guests);
}

function renderGuestsTable(guests) {
  const tbody = $('#guests-tbody');
  if (!tbody) return;
  if (!guests.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No guests found</td></tr>';
    return;
  }
  tbody.innerHTML = guests.map((g, i) => {
    const lookupCode = (g.unique_id || '').substring(0, 8).toUpperCase();
    const guestLink  = `${window.location.origin}/guest/${g.qr_token}`;
    return `
    <tr id="guest-row-${gid(g)}">
      <td>${i + 1}</td>
      <td><strong>${escHtml(g.name)}</strong></td>
      <td>${g.phone ? escHtml(g.phone) : '<span style="color:var(--gray-400)">—</span>'}</td>
      <td><span class="code-badge">${escHtml(lookupCode)}</span></td>
      <td>
        <span class="badge ${g.status === 'used' ? 'badge-used' : 'badge-unused'}">
          ${g.status === 'used' ? '✅ Checked In' : '⏳ Pending'}
        </span>
      </td>
      <td>${g.status === 'used' ? formatDateTime(g.checked_in_at) : '—'}</td>
      <td>
        <div class="table-actions">
          <button class="btn btn-outline btn-sm" onclick="viewGuestQR('${gid(g)}')">🔲 QR</button>
          <button class="btn btn-outline btn-sm" onclick="copyGuestLink('${g.qr_token}')" title="Copy guest link">🔗</button>
          <button class="btn btn-outline btn-sm" onclick="shareGuestWhatsApp('${g.qr_token}','${escHtml(g.name).replace(/'/g,"\\'")}','${g.phone||''}')" title="Share via WhatsApp">💬</button>
          ${g.status === 'used' ? `<button class="btn btn-outline btn-sm" onclick="resetCheckin('${gid(g)}','${escHtml(g.name).replace(/'/g,"\\'")}')">↩ Reset</button>` : ''}
          <button class="btn btn-danger btn-sm" onclick="deleteGuest('${gid(g)}', '${escHtml(g.name).replace(/'/g,"\\'")}')">🗑</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function refreshGuestRow(guest) {
  const row = $(`#guest-row-${gid(guest)}`);
  if (!row) return;
  const cells = row.querySelectorAll('td');
  if (cells[4]) cells[4].innerHTML = `<span class="badge badge-used">✅ Checked In</span>`;
  if (cells[5]) cells[5].textContent = formatDateTime(guest.checked_in_at);
}

function addRecentCheckin(guest) {
  const exists = state.recentCheckins.some(g => gid(g) === gid(guest));
  if (exists) return;
  state.recentCheckins.unshift(guest);
  if (state.recentCheckins.length > 10) state.recentCheckins.pop();
  renderRecentCheckins();
}

function renderRecentCheckins() {
  const el = $('#recent-checkins');
  if (!el) return;
  if (!state.recentCheckins.length) {
    el.innerHTML = '<div class="empty-state">No check-ins yet</div>';
    return;
  }
  el.innerHTML = state.recentCheckins.map(g => `
    <div class="recent-item">
      <div class="recent-item-icon">✅</div>
      <div class="recent-item-info">
        <div class="recent-item-name">${escHtml(g.name)}</div>
        <div class="recent-item-time">${formatDateTime(g.checked_in_at)}${g.checked_in_by ? ' · by ' + escHtml(g.checked_in_by) : ''}</div>
      </div>
    </div>
  `).join('');
}

async function deleteGuest(id, name) {
  if (!confirm(`Delete guest "${name}"? This cannot be undone.`)) return;
  try {
    await api('DELETE', `/guests/${id}`);
    await fetchGuests($('#guest-search') ? $('#guest-search').value : '');
    await fetchStats();
  } catch (e) {
    alert('Failed to delete guest: ' + e.message);
  }
}

async function resetCheckin(id, name) {
  if (!confirm(`Reset check-in for "${name}"? They will be marked as not checked in.`)) return;
  try {
    await api('PATCH', `/guests/${id}/reset`);
    await fetchGuests($('#guest-search') ? $('#guest-search').value : '');
    await fetchStats();
  } catch (e) {
    alert('Failed to reset: ' + e.message);
  }
}

function copyGuestLink(token) {
  const link = `${window.location.origin}/guest/${token}`;
  navigator.clipboard.writeText(link).then(() => {
    alert('Link copied! Share it with the guest:\n' + link);
  }).catch(() => {
    prompt('Copy this link and send to the guest:', link);
  });
}

function shareGuestWhatsApp(token, name, phone) {
  const link = `${window.location.origin}/guest/${token}`;
  const msg  = `Dear ${name}, you are invited! Open your personal invitation and QR code here: ${link}`;
  const ph   = (phone || '').replace(/\D/g, '');
  const url  = ph ? `https://wa.me/${ph}?text=${encodeURIComponent(msg)}`
                  : `https://wa.me/?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
}

// ── View Guest QR ────────────────────────────────────────────
async function viewGuestQR(id) {
  try {
    const data = await api('GET', `/guests/${id}/qr`);
    const card = showQRCard(data, '#view-qr-card-preview');
    const guest = data.guest;

    // Share buttons
    $('#view-qr-download-btn').onclick = () => downloadQRCard(guest.name, '#view-qr-card-preview');
    $('#view-qr-print-btn').onclick    = () => printQRCard(guest.name, '#view-qr-card-preview');
    $('#view-qr-whatsapp-btn').onclick = () => shareViaWhatsApp(guest, data.eventName || state.eventName);
    $('#view-qr-sms-btn').onclick      = () => shareViaSMS(guest, data.eventName || state.eventName);

    $('#view-qr-modal').classList.remove('hidden');
  } catch (e) {
    alert('Failed to load QR: ' + e.message);
  }
}

// ── Add Guest ────────────────────────────────────────────────
async function addGuest(name, phone) {
  return await api('POST', '/guests', { name, phone });
}

async function showNewGuestQR(guest) {
  const data = await api('GET', `/guests/${gid(guest)}/qr`);
  showQRCard(data, '#qr-card-preview');

  // Share buttons
  $('#qr-download-btn').onclick = () => downloadQRCard(guest.name, '#qr-card-preview');
  $('#qr-print-btn').onclick    = () => printQRCard(guest.name, '#qr-card-preview');
  $('#qr-whatsapp-btn').onclick = () => shareViaWhatsApp(data.guest, data.eventName || state.eventName);
  $('#qr-sms-btn').onclick      = () => shareViaSMS(data.guest, data.eventName || state.eventName);

  $('#qr-modal').classList.remove('hidden');
}

// ── QR Card Rendering ────────────────────────────────────────
/**
 * Renders a decorated QR card inside containerSelector.
 * @param {object} data  - { qrDataUrl, guest, eventName }
 * @param {string} containerSelector
 * @returns {HTMLElement} the card element
 */
function showQRCard(data, containerSelector) {
  const container = $(containerSelector);
  if (!container) return null;

  const guest      = data.guest;
  const eventName  = data.eventName || state.eventName || 'Our Wedding';
  const lookupCode = (guest.unique_id || '').substring(0, 8).toUpperCase();

  const card = document.createElement('div');
  card.className = 'qr-card';
  card.innerHTML = `
    <div class="qr-card-event">${escHtml(eventName)}</div>
    <div class="qr-card-name">${escHtml(guest.name)}</div>
    ${guest.phone ? `<div class="qr-card-phone">${escHtml(guest.phone)}</div>` : ''}
    <img class="qr-card-img" src="${data.qrDataUrl}" alt="QR Code" />
    <div class="qr-card-code">${escHtml(lookupCode)}</div>
    <div class="qr-card-footer">Present this QR code at the entrance</div>
  `;

  container.innerHTML = '';
  container.appendChild(card);
  return card;
}

// ── Download QR Card (canvas) ────────────────────────────────
function downloadQRCard(guestName, containerSelector) {
  const container = $(containerSelector);
  if (!container) return;

  const imgEl = container.querySelector('.qr-card-img');
  if (!imgEl) return;

  const W = 300, H = 420;
  const canvas = document.createElement('canvas');
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  function drawCard(qrImg) {
    // Purple gradient background
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#7c3aed');
    grad.addColorStop(1, '#4c1d95');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Decorative top strip
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(0, 0, W, 6);

    // Event name
    const eventName = container.querySelector('.qr-card-event')
      ? container.querySelector('.qr-card-event').textContent
      : (state.eventName || 'Our Wedding');
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(eventName, W / 2, 36);

    // Guest name
    const nameEl = container.querySelector('.qr-card-name');
    const name   = nameEl ? nameEl.textContent : guestName;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    // Truncate if too long
    let displayName = name;
    while (ctx.measureText(displayName).width > W - 24 && displayName.length > 4) {
      displayName = displayName.slice(0, -1);
    }
    if (displayName !== name) displayName += '…';
    ctx.fillText(displayName, W / 2, 66);

    // Phone
    const phoneEl = container.querySelector('.qr-card-phone');
    if (phoneEl) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(phoneEl.textContent, W / 2, 86);
    }

    // QR image — centered
    const qrSize = 180;
    const qrX    = (W - qrSize) / 2;
    const qrY    = 100;
    // White background behind QR
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(qrX - 8, qrY - 8, qrSize + 16, qrSize + 16, 10)
                  : ctx.rect(qrX - 8, qrY - 8, qrSize + 16, qrSize + 16);
    ctx.fill();
    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

    // Lookup code
    const codeEl = container.querySelector('.qr-card-code');
    const code   = codeEl ? codeEl.textContent : '';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(code, W / 2, qrY + qrSize + 32);

    // Footer
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Present this QR code at the entrance', W / 2, H - 16);

    // Trigger download
    const link = document.createElement('a');
    link.download = `qr-${guestName.replace(/\s+/g, '-').toLowerCase()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  // Load QR image then draw
  const qrImg = new Image();
  qrImg.crossOrigin = 'anonymous';
  qrImg.onload = () => drawCard(qrImg);
  qrImg.src = imgEl.src;
}

// ── Print QR Card ────────────────────────────────────────────
function printQRCard(guestName, containerSelector) {
  const container = $(containerSelector);
  if (!container) return;
  const cardEl = container.querySelector('.qr-card');
  const html   = cardEl ? cardEl.outerHTML : container.innerHTML;

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>QR Card - ${escHtml(guestName)}</title>
  <style>
    body { margin: 0; padding: 2rem; font-family: sans-serif; display: flex; justify-content: center; }
    .qr-card { background: linear-gradient(to bottom, #7c3aed, #4c1d95); color: #fff;
      border-radius: 16px; padding: 1.5rem; width: 260px; text-align: center; }
    .qr-card-event { font-size: 13px; opacity: 0.85; margin-bottom: 0.4rem; font-weight: bold; }
    .qr-card-name  { font-size: 20px; font-weight: bold; margin-bottom: 0.25rem; }
    .qr-card-phone { font-size: 13px; opacity: 0.7; margin-bottom: 0.75rem; }
    .qr-card-img   { width: 180px; height: 180px; background: #fff; padding: 8px;
      border-radius: 10px; display: block; margin: 0 auto 0.75rem; }
    .qr-card-code  { font-family: monospace; font-size: 16px; font-weight: bold;
      letter-spacing: 2px; margin-bottom: 0.5rem; }
    .qr-card-footer { font-size: 11px; opacity: 0.6; }
  </style>
</head>
<body>
  ${html}
  <script>window.onload = function() { window.print(); window.close(); };<\/script>
</body>
</html>`);
  win.document.close();
}


// ── Share via WhatsApp ───────────────────────────────────────
function shareViaWhatsApp(guest, eventName) {
  const phone      = (guest.phone || '').replace(/\D/g, '');
  const lookupCode = (guest.unique_id || '').substring(0, 8).toUpperCase();
  const message    = `Dear ${guest.name}, you are invited to ${eventName}. Your check-in code is: ${lookupCode}. Show this code at the entrance for manual check-in.`;
  const url        = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
}

// ── Share via SMS ────────────────────────────────────────────
function shareViaSMS(guest, eventName) {
  const phone      = (guest.phone || '').replace(/\D/g, '');
  const lookupCode = (guest.unique_id || '').substring(0, 8).toUpperCase();
  const message    = `Dear ${guest.name}, you are invited to ${eventName}. Your check-in code is: ${lookupCode}. Show this code at the entrance for manual check-in.`;
  const url        = `sms:${phone}?body=${encodeURIComponent(message)}`;
  window.open(url, '_self');
}

// ── CSV Bulk Import ──────────────────────────────────────────
function parseCSV(text) {
  const lines   = text.trim().split('\n');
  const results = [];
  const start   = lines[0].toLowerCase().includes('name') ? 1 : 0;
  for (let i = start; i < lines.length; i++) {
    const parts = lines[i].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
    if (parts[0]) results.push({ name: parts[0], phone: parts[1] || '' });
  }
  return results;
}

// ── Scanner ──────────────────────────────────────────────────
let html5QrCode = null;

async function startScanner() {
  if (html5QrCode) return;
  try {
    html5QrCode = new Html5Qrcode('qr-reader');
    await html5QrCode.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
      onScanSuccess,
      () => {}
    );
    const startBtn = $('#start-scan-btn');
    const stopBtn  = $('#stop-scan-btn');
    if (startBtn) startBtn.classList.add('hidden');
    if (stopBtn)  stopBtn.classList.remove('hidden');
  } catch (err) {
    console.error('Camera error:', err);
    setScanResult('invalid', '📵', 'Camera Error', 'Please allow camera access and try again');
  }
}

function stopScanner() {
  if (html5QrCode) {
    html5QrCode.stop()
      .then(() => { html5QrCode.clear(); html5QrCode = null; })
      .catch(() => { html5QrCode = null; });
  }
  const startBtn = $('#start-scan-btn');
  const stopBtn  = $('#stop-scan-btn');
  if (startBtn) startBtn.classList.remove('hidden');
  if (stopBtn)  stopBtn.classList.add('hidden');
}

async function onScanSuccess(token) {
  if (state.scanCooldown) return;
  state.scanCooldown = true;
  try {
    const result = await api('POST', '/guests/scan', { token });
    handleScanResult(result);
  } catch (e) {
    setScanResult('invalid', '❌', 'Error', e.message);
    playSound('error');
  }
  setTimeout(() => { state.scanCooldown = false; }, 2500);
}

function handleScanResult(result) {
  if (result.result === 'granted') {
    setScanResult('granted', '✅', 'Access Granted', result.guest ? result.guest.name : '', result.guest ? result.guest.checked_in_at : '');
    playSound('success');
    fetchScannerStats();
  } else if (result.result === 'used') {
    setScanResult('used', '🚫', 'Already Checked In', result.guest ? result.guest.name : '', result.guest ? result.guest.checked_in_at : '');
    playSound('error');
  } else {
    setScanResult('invalid', '❓', 'Invalid QR Code', 'This QR code is not recognized');
    playSound('error');
  }
}

function setScanResult(type, icon, message, name, time) {
  name = name || '';
  time = time || '';
  const el     = $('#scan-result');
  const iconEl = $('#scan-icon');
  const msgEl  = $('#scan-message');
  const nameEl = $('#scan-name');
  const timeEl = $('#scan-time');
  if (!el) return;
  el.className       = `scan-result scan-${type}`;
  iconEl.textContent = icon;
  msgEl.textContent  = message;
  nameEl.textContent = name;
  timeEl.textContent = time ? `at ${formatDateTime(time)}` : '';
  setTimeout(() => {
    el.className       = 'scan-result scan-idle';
    iconEl.textContent = '📷';
    msgEl.textContent  = 'Ready to Scan';
    nameEl.textContent = '';
    timeEl.textContent = '';
  }, 3000);
}

// ── Manual Search ────────────────────────────────────────────
async function manualSearch(query) {
  if (!query || !query.trim()) return;
  try {
    const guests = await api('GET', `/guests/search?q=${encodeURIComponent(query)}`);
    renderManualResults(guests);
  } catch (e) { console.error('Manual search error:', e); }
}

function renderManualResults(guests) {
  const el = $('#manual-results');
  if (!el) return;
  if (!guests.length) {
    el.innerHTML = '<div class="empty-state">No guests found</div>';
    el.classList.remove('hidden');
    return;
  }
  el.innerHTML = guests.slice(0, 5).map(g => `
    <div class="manual-result-item">
      <div class="manual-result-info">
        <div class="name">${escHtml(g.name)}</div>
        <div class="phone">${g.phone ? escHtml(g.phone) : '—'}</div>
      </div>
      <div style="display:flex;align-items:center;gap:0.5rem;">
        <span class="badge ${g.status === 'used' ? 'badge-used' : 'badge-unused'}">
          ${g.status === 'used' ? '✅ In' : '⏳ Pending'}
        </span>
        ${g.status !== 'used' ? `<button class="btn btn-success btn-sm" onclick="manualCheckIn('${escHtml(g.qr_token)}')">Check In</button>` : ''}
      </div>
    </div>
  `).join('');
  el.classList.remove('hidden');
}

async function manualCheckIn(token) {
  if (!confirm('Check in this guest?')) return;
  try {
    const result = await api('POST', '/guests/scan', { token });
    handleScanResult(result);
    const query = $('#manual-search-input') ? $('#manual-search-input').value : '';
    if (query) await manualSearch(query);
  } catch (e) {
    setScanResult('invalid', '❌', 'Error', e.message);
  }
}


// ── Export CSV ───────────────────────────────────────────────
function exportCSV() {
  const guests = state.guests;
  if (!guests.length) return;
  const rows = [['Name', 'Phone', 'Status', 'Checked In At', 'Checked In By']];
  guests.forEach(g => rows.push([
    g.name,
    g.phone || '',
    g.status,
    g.checked_in_at ? new Date(g.checked_in_at).toLocaleString() : '',
    g.checked_in_by || ''
  ]));
  const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = 'wedding-guests.csv';
  a.click();
}

// ── Download All QR ──────────────────────────────────────────
async function downloadAllQR() {
  const modal    = $('#download-all-modal');
  const fillEl   = $('#dl-progress-fill');
  const textEl   = $('#dl-progress-text');
  if (modal) modal.classList.remove('hidden');

  try {
    const guests = await api('GET', '/guests/allqr');
    const total  = guests.length;

    if (total === 0) {
      if (modal) modal.classList.add('hidden');
      alert('No guests found.');
      return;
    }

    for (let i = 0; i < total; i++) {
      const g = guests[i];
      await generateAndDownloadCard(g);

      const pct = Math.round(((i + 1) / total) * 100);
      if (fillEl) fillEl.style.width = `${pct}%`;
      if (textEl) textEl.textContent = `${i + 1} / ${total}`;

      // Small delay to avoid browser freezing
      await new Promise(resolve => setTimeout(resolve, 80));
    }
  } catch (e) {
    console.error('Download all QR error:', e);
    alert('Failed to download QR codes: ' + e.message);
  } finally {
    if (modal) modal.classList.add('hidden');
    if (fillEl) fillEl.style.width = '0%';
    if (textEl) textEl.textContent = '0 / 0';
  }
}

/**
 * Generates a canvas QR card for a guest and triggers download.
 * @param {object} g - guest object with qrDataUrl, name, phone, unique_id, eventName
 */
function generateAndDownloadCard(g) {
  return new Promise((resolve) => {
    const W = 300, H = 420;
    const canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    const lookupCode = (g.unique_id || '').substring(0, 8).toUpperCase();
    const eventName  = g.eventName || state.eventName || 'Our Wedding';

    const qrImg = new Image();
    qrImg.crossOrigin = 'anonymous';
    qrImg.onload = () => {
      // Purple gradient background
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#7c3aed');
      grad.addColorStop(1, '#4c1d95');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // Decorative top strip
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(0, 0, W, 6);

      // Event name
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(eventName, W / 2, 36);

      // Guest name
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      let displayName = g.name;
      while (ctx.measureText(displayName).width > W - 24 && displayName.length > 4) {
        displayName = displayName.slice(0, -1);
      }
      if (displayName !== g.name) displayName += '…';
      ctx.fillText(displayName, W / 2, 66);

      // Phone
      if (g.phone) {
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(g.phone, W / 2, 86);
      }

      // QR image — centered with white background
      const qrSize = 180;
      const qrX    = (W - qrSize) / 2;
      const qrY    = 100;
      ctx.fillStyle = '#ffffff';
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(qrX - 8, qrY - 8, qrSize + 16, qrSize + 16, 10);
        ctx.fill();
      } else {
        ctx.fillRect(qrX - 8, qrY - 8, qrSize + 16, qrSize + 16);
      }
      ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

      // Lookup code
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(lookupCode, W / 2, qrY + qrSize + 32);

      // Footer
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Present this QR code at the entrance', W / 2, H - 16);

      // Download
      const link = document.createElement('a');
      link.download = `qr-${g.name.replace(/\s+/g, '-').toLowerCase()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();

      resolve();
    };
    qrImg.onerror = () => resolve(); // skip on error
    qrImg.src = g.qrDataUrl;
  });
}

// ── Security ─────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Tab Navigation ───────────────────────────────────────────
function switchTab(tabId) {
  $$('.nav-tab').forEach(t => t.classList.remove('active'));
  $$('.tab-content').forEach(t => t.classList.add('hidden'));
  const activeTab = $(`[data-tab="${tabId}"]`);
  if (activeTab) activeTab.classList.add('active');
  const activeContent = $(`#${tabId}`);
  if (activeContent) activeContent.classList.remove('hidden');
  if (tabId === 'tab-guests')   fetchGuests();
  if (tabId === 'tab-overview') { fetchStats(); renderRecentCheckins(); }
}

// ── Settings ─────────────────────────────────────────────────
async function fetchSettings() {
  try {
    const settings = await api('GET', '/settings');
    if (settings.event_name) {
      state.eventName = settings.event_name;
      const navName = $('#nav-event-name');
      if (navName) navName.textContent = settings.event_name;
      const inputName = $('#setting-event-name');
      if (inputName) inputName.value = settings.event_name;
    }
  } catch (e) { console.error('Settings error:', e); }
}

async function saveSettings() {
  const input = $('#setting-event-name');
  if (!input) return;
  const value  = input.value.trim();
  const sucEl  = $('#settings-success');
  try {
    await api('POST', '/settings', { key: 'event_name', value });
    state.eventName = value;
    const navName = $('#nav-event-name');
    if (navName) navName.textContent = value;
    if (sucEl) showAlert(sucEl, 'Settings saved!', 'success');
  } catch (e) {
    alert('Failed to save settings: ' + e.message);
  }
}


// ── Init ─────────────────────────────────────────────────────
async function init() {
  const user = await checkAuth();
  if (user) {
    state.user = user;
    if (user.role === 'admin') initAdmin();
    else initScanner();
  } else {
    showPage('page-login');
  }

  const loginForm = $('#login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn   = $('#login-btn');
      const errEl = $('#login-error');
      hideAlert(errEl);
      btn.disabled = true;
      const btnText = btn.querySelector('.btn-text');
      if (btnText) btnText.textContent = 'Signing in…';
      try {
        const user = await login($('#username').value, $('#password').value);
        state.user = user;
        if (user.role === 'admin') initAdmin();
        else initScanner();
      } catch (e) {
        showAlert(errEl, e.message);
      } finally {
        btn.disabled = false;
        if (btnText) btnText.textContent = 'Sign In';
      }
    });
  }
}

function initAdmin() {
  if (state.initialized) return;
  state.initialized = true;

  showPage('page-admin');
  const adminUser = $('#admin-username');
  if (adminUser) adminUser.textContent = `👤 ${state.user.username}`;

  fetchStats();
  fetchSettings();

  // Nav tabs
  $$('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Logout
  const logoutBtn = $('#admin-logout');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  // Guest search with debounce
  let searchTimer;
  const guestSearch = $('#guest-search');
  if (guestSearch) {
    guestSearch.addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => fetchGuests(e.target.value), 300);
    });
  }

  // Export
  const exportBtn = $('#export-btn');
  if (exportBtn) exportBtn.addEventListener('click', exportCSV);

  // Download all QR
  const dlAllBtn = $('#download-all-qr-btn');
  if (dlAllBtn) dlAllBtn.addEventListener('click', downloadAllQR);

  // Delete all (double confirm)
  const deleteAllBtn = $('#delete-all-btn');
  if (deleteAllBtn) {
    deleteAllBtn.addEventListener('click', async () => {
      const total = state.guests.length;
      if (total === 0) { alert('No guests to delete.'); return; }
      if (!confirm(`Delete ALL ${total} guests? This cannot be undone.`)) return;
      if (!confirm(`Are you absolutely sure? This will permanently delete all ${total} guests and their QR codes.`)) return;
      try {
        await api('DELETE', '/guests/all');
        await fetchGuests();
        await fetchStats();
      } catch (e) {
        alert('Failed to delete all guests: ' + e.message);
      }
    });
  }

  // Add guest form
  const addGuestForm = $('#add-guest-form');
  if (addGuestForm) {
    addGuestForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = $('#add-guest-error');
      const sucEl = $('#add-guest-success');
      hideAlert(errEl);
      hideAlert(sucEl);
      const name  = $('#guest-name').value.trim();
      const phone = $('#guest-phone').value.trim();

      // Duplicate name check
      try {
        const dup = await api('GET', `/guests/check-duplicate?name=${encodeURIComponent(name)}`);
        if (dup.exists) {
          const proceed = confirm(`A guest named "${name}" already exists. Add anyway?`);
          if (!proceed) return;
        }
      } catch (e) { /* ignore duplicate check errors */ }

      try {
        const guest = await addGuest(name, phone);
        showAlert(sucEl, `Guest "${guest.name}" added successfully!`, 'success');
        addGuestForm.reset();
        await showNewGuestQR(guest);
        fetchStats();
      } catch (err) {
        showAlert(errEl, err.message);
      }
    });
  }

  // QR modal close
  const qrClose   = $('#qr-modal-close');
  const qrOverlay = $('#qr-modal-overlay');
  if (qrClose)   qrClose.addEventListener('click',   () => $('#qr-modal').classList.add('hidden'));
  if (qrOverlay) qrOverlay.addEventListener('click', () => $('#qr-modal').classList.add('hidden'));

  // View QR modal close
  const vqrClose   = $('#view-qr-modal-close');
  const vqrOverlay = $('#view-qr-modal-overlay');
  if (vqrClose)   vqrClose.addEventListener('click',   () => $('#view-qr-modal').classList.add('hidden'));
  if (vqrOverlay) vqrOverlay.addEventListener('click', () => $('#view-qr-modal').classList.add('hidden'));

  // CSV file / drop / bulk import
  const csvFile     = $('#csv-file');
  const csvDropZone = $('#csv-drop-zone');
  const bulkBtn     = $('#bulk-import-btn');

  function handleCSVFile(file) {
    if (!file || !file.name.endsWith('.csv')) {
      showAlert($('#bulk-error'), 'Please select a valid CSV file');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      state.csvData = parseCSV(ev.target.result);
      const preview = $('#csv-preview');
      if (preview) {
        preview.innerHTML = `<strong>${state.csvData.length} guests found:</strong><br>` +
          state.csvData.slice(0, 5).map(g => `• ${escHtml(g.name)}${g.phone ? ` (${escHtml(g.phone)})` : ''}`).join('<br>') +
          (state.csvData.length > 5 ? `<br>… and ${state.csvData.length - 5} more` : '');
        preview.classList.remove('hidden');
      }
      if (bulkBtn) bulkBtn.disabled = state.csvData.length === 0;
    };
    reader.readAsText(file);
  }

  if (csvFile) csvFile.addEventListener('change', (e) => handleCSVFile(e.target.files[0]));

  if (csvDropZone) {
    csvDropZone.addEventListener('click', () => csvFile && csvFile.click());
    csvDropZone.addEventListener('dragover',  (e) => { e.preventDefault(); csvDropZone.classList.add('drag-over'); });
    csvDropZone.addEventListener('dragleave', ()  => csvDropZone.classList.remove('drag-over'));
    csvDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      csvDropZone.classList.remove('drag-over');
      if (e.dataTransfer.files[0]) handleCSVFile(e.dataTransfer.files[0]);
    });
  }

  if (bulkBtn) {
    bulkBtn.addEventListener('click', async () => {
      if (!state.csvData.length) return;
      const errEl = $('#bulk-error');
      const sucEl = $('#bulk-success');
      hideAlert(errEl);
      hideAlert(sucEl);
      bulkBtn.disabled    = true;
      bulkBtn.textContent = 'Importing…';
      try {
        const created = await api('POST', '/guests/bulk', { guests: state.csvData });
        showAlert(sucEl, `Successfully imported ${created.length} guests!`, 'success');
        state.csvData = [];
        const preview = $('#csv-preview');
        if (preview) preview.classList.add('hidden');
        if (csvFile) csvFile.value = '';
        bulkBtn.textContent = 'Import Guests';
        fetchStats();
      } catch (err) {
        showAlert(errEl, err.message);
        bulkBtn.disabled    = false;
        bulkBtn.textContent = 'Import Guests';
      }
    });
  }

  // Save settings
  const saveSettingsBtn = $('#save-settings-btn');
  if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', saveSettings);

  // Change admin password
  const changeAdminPwBtn = $('#change-admin-pw-btn');
  if (changeAdminPwBtn) {
    changeAdminPwBtn.addEventListener('click', async () => {
      const current  = $('#admin-current-pw').value;
      const newPw    = $('#admin-new-pw').value;
      const confirm  = $('#admin-confirm-pw').value;
      const errEl    = $('#admin-pw-error');
      const sucEl    = $('#admin-pw-success');
      hideAlert(errEl); hideAlert(sucEl);
      if (newPw !== confirm) { showAlert(errEl, 'Passwords do not match'); return; }
      if (newPw.length < 6)  { showAlert(errEl, 'Password must be at least 6 characters'); return; }
      try {
        await api('POST', '/auth/change-password', { currentPassword: current, newPassword: newPw });
        showAlert(sucEl, 'Admin password changed successfully!', 'success');
        $('#admin-current-pw').value = '';
        $('#admin-new-pw').value = '';
        $('#admin-confirm-pw').value = '';
      } catch (e) { showAlert(errEl, e.message); }
    });
  }

  // Change scanner password
  const changeScannerPwBtn = $('#change-scanner-pw-btn');
  if (changeScannerPwBtn) {
    changeScannerPwBtn.addEventListener('click', async () => {
      const newPw   = $('#scanner-new-pw').value;
      const confirm = $('#scanner-confirm-pw').value;
      const errEl   = $('#scanner-pw-error');
      const sucEl   = $('#scanner-pw-success');
      hideAlert(errEl); hideAlert(sucEl);
      if (newPw !== confirm) { showAlert(errEl, 'Passwords do not match'); return; }
      if (newPw.length < 6)  { showAlert(errEl, 'Password must be at least 6 characters'); return; }
      try {
        await api('POST', '/auth/change-password/scanner', { newPassword: newPw });
        showAlert(sucEl, 'Scanner password changed successfully!', 'success');
        $('#scanner-new-pw').value = '';
        $('#scanner-confirm-pw').value = '';
      } catch (e) { showAlert(errEl, e.message); }
    });
  }

  // Keep-alive ping every 10 minutes to prevent Render sleep
  setInterval(() => {
    fetch('/ping').catch(() => {});
  }, 10 * 60 * 1000);

  // Real-time check-in updates
  socket.on('guest_checked_in', (guest) => {
    addRecentCheckin(guest);
    refreshGuestRow(guest);
    fetchStats();
  });

  socket.on('guest_reset', () => {
    fetchGuests($('#guest-search') ? $('#guest-search').value : '');
    fetchStats();
  });
}

function initScanner() {
  if (state.initialized) return;
  state.initialized = true;

  showPage('page-scanner');
  const scanUser = $('#scanner-username');
  if (scanUser) scanUser.textContent = `👤 ${state.user.username}`;

  fetchScannerStats();
  fetchSettings();

  // Logout
  const scanLogout = $('#scanner-logout');
  if (scanLogout) scanLogout.addEventListener('click', () => { stopScanner(); logout(); });

  // Camera controls
  const startBtn = $('#start-scan-btn');
  const stopBtn  = $('#stop-scan-btn');
  if (startBtn) startBtn.addEventListener('click', startScanner);
  if (stopBtn)  stopBtn.addEventListener('click',  stopScanner);

  // Manual search
  const manualBtn   = $('#manual-search-btn');
  const manualInput = $('#manual-search-input');
  if (manualBtn)   manualBtn.addEventListener('click', () => manualSearch(manualInput ? manualInput.value : ''));
  if (manualInput) manualInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') manualSearch(e.target.value);
  });

  // Real-time stats update
  socket.on('guest_checked_in', () => fetchScannerStats());

  // Keep-alive ping every 10 minutes
  setInterval(() => { fetch('/ping').catch(() => {}); }, 10 * 60 * 1000);
}

// ── PWA ──────────────────────────────────────────────────────
let deferredInstallPrompt = null;

function initPWA() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('SW registered:', reg.scope))
      .catch(err => console.warn('SW failed:', err));
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (sessionStorage.getItem('pwa-dismissed')) return;
    setTimeout(() => {
      const b = $('#pwa-banner');
      if (b) b.classList.remove('hidden');
    }, 3000);
  });

  const installBtn = $('#pwa-install-btn');
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      const b = $('#pwa-banner');
      if (b) b.classList.add('hidden');
    });
  }

  const dismissBtn = $('#pwa-dismiss-btn');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      const b = $('#pwa-banner');
      if (b) b.classList.add('hidden');
      sessionStorage.setItem('pwa-dismissed', '1');
    });
  }

  window.addEventListener('appinstalled', () => {
    const b = $('#pwa-banner');
    if (b) b.classList.add('hidden');
    deferredInstallPrompt = null;
  });
}

// ── Boot ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initPWA();
  init();
});
