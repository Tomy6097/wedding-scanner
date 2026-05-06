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
  scanner: null,
  scanCooldown: false,
  csvData: []
};

// ── Socket.io ────────────────────────────────────────────────
const socket = io();

// ── Helpers ──────────────────────────────────────────────────
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

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
  // Use Web Audio API to generate tones (no external files needed)
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      osc.frequency.setValueAtTime(523, ctx.currentTime);       // C5
      osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1); // E5
      osc.frequency.setValueAtTime(784, ctx.currentTime + 0.2); // G5
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
  const res = await fetch(`/api${path}`, opts);
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
  } catch {
    return null;
  }
}

async function login(username, password) {
  const data = await api('POST', '/auth/login', { username, password });
  state.user = data;
  return data;
}

async function logout() {
  await api('POST', '/auth/logout');
  state.user = null;
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
  const pct = total > 0 ? Math.round((checkedIn / total) * 100) : 0;
  // Admin stats
  const elTotal = $('#stat-total');
  const elChecked = $('#stat-checkedin');
  const elRemaining = $('#stat-remaining');
  const elPct = $('#stat-percent');
  const elFill = $('#progress-fill');
  const elPText = $('#progress-text');
  if (elTotal) elTotal.textContent = total;
  if (elChecked) elChecked.textContent = checkedIn;
  if (elRemaining) elRemaining.textContent = remaining;
  if (elPct) elPct.textContent = `${pct}%`;
  if (elFill) elFill.style.width = `${pct}%`;
  if (elPText) elPText.textContent = `${checkedIn} / ${total}`;
}

async function fetchScannerStats() {
  try {
    const stats = await api('GET', '/guests/stats');
    state.stats = stats;
    const elCI = $('#sc-checkedin');
    const elT = $('#sc-total');
    const elR = $('#sc-remaining');
    if (elCI) elCI.textContent = stats.checkedIn;
    if (elT) elT.textContent = stats.total;
    if (elR) elR.textContent = stats.remaining;
  } catch (e) { console.error('Scanner stats error:', e); }
}

// ── Admin: Guests ────────────────────────────────────────────
async function fetchGuests(search = '') {
  const path = search ? `/guests?search=${encodeURIComponent(search)}` : '/guests';
  const guests = await api('GET', path);
  state.guests = guests;
  renderGuestsTable(guests);
}

function renderGuestsTable(guests) {
  const tbody = $('#guests-tbody');
  if (!tbody) return;

  if (guests.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No guests found</td></tr>';
    return;
  }

  tbody.innerHTML = guests.map((g, i) => `
    <tr id="guest-row-${g.id}">
      <td>${i + 1}</td>
      <td><strong>${escHtml(g.name)}</strong></td>
      <td>${g.phone ? escHtml(g.phone) : '<span style="color:var(--gray-400)">—</span>'}</td>
      <td>
        <span class="badge ${g.status === 'used' ? 'badge-used' : 'badge-unused'}">
          ${g.status === 'used' ? '✅ Checked In' : '⏳ Pending'}
        </span>
      </td>
      <td>${g.status === 'used' ? formatDateTime(g.checked_in_at) : '—'}</td>
      <td>
        <div class="table-actions">
          <button class="btn btn-outline btn-sm" onclick="viewGuestQR(${g.id})">🔲 QR</button>
          <button class="btn btn-danger btn-sm" onclick="deleteGuest(${g.id}, '${escHtml(g.name)}')">🗑</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function refreshGuestRow(guest) {
  const row = $(`#guest-row-${guest.id}`);
  if (!row) return;
  // Update status cell and time cell
  const cells = row.querySelectorAll('td');
  if (cells[3]) cells[3].innerHTML = `<span class="badge badge-used">✅ Checked In</span>`;
  if (cells[4]) cells[4].textContent = formatDateTime(guest.checked_in_at);
}

function addRecentCheckin(guest) {
  state.recentCheckins.unshift(guest);
  if (state.recentCheckins.length > 10) state.recentCheckins.pop();
  renderRecentCheckins();
}

function renderRecentCheckins() {
  const el = $('#recent-checkins');
  if (!el) return;
  if (state.recentCheckins.length === 0) {
    el.innerHTML = '<div class="empty-state">No check-ins yet</div>';
    return;
  }
  el.innerHTML = state.recentCheckins.map(g => `
    <div class="recent-item">
      <div class="recent-item-icon">✅</div>
      <div class="recent-item-info">
        <div class="recent-item-name">${escHtml(g.name)}</div>
        <div class="recent-item-time">${formatDateTime(g.checked_in_at)} · by ${escHtml(g.checked_in_by || '—')}</div>
      </div>
    </div>
  `).join('');
}

async function deleteGuest(id, name) {
  if (!confirm(`Delete guest "${name}"? This cannot be undone.`)) return;
  try {
    await api('DELETE', `/guests/${id}`);
    await fetchGuests($('#guest-search')?.value || '');
    await fetchStats();
  } catch (e) {
    alert('Failed to delete guest: ' + e.message);
  }
}

async function viewGuestQR(id) {
  try {
    const { qrDataUrl, guest } = await api('GET', `/guests/${id}/qr`);
    $('#view-qr-title').textContent = guest.name;
    $('#view-qr-image').src = qrDataUrl;
    $('#view-qr-download-btn').onclick = () => downloadQR(qrDataUrl, guest.name);
    $('#view-qr-print-btn').onclick = () => printQR(qrDataUrl, guest.name);
    $('#view-qr-modal').classList.remove('hidden');
  } catch (e) {
    alert('Failed to load QR: ' + e.message);
  }
}

// ── Add Guest ────────────────────────────────────────────────
async function addGuest(name, phone) {
  const guest = await api('POST', '/guests', { name, phone });
  return guest;
}

async function showNewGuestQR(guest) {
  const { qrDataUrl } = await api('GET', `/guests/${guest.id}/qr`);
  $('#qr-guest-info').innerHTML = `
    <div class="guest-name">${escHtml(guest.name)}</div>
    ${guest.phone ? `<div class="guest-phone">${escHtml(guest.phone)}</div>` : ''}
  `;
  $('#qr-image').src = qrDataUrl;
  $('#qr-download-btn').onclick = () => downloadQR(qrDataUrl, guest.name);
  $('#qr-print-btn').onclick = () => printQR(qrDataUrl, guest.name);
  $('#qr-modal').classList.remove('hidden');
}

// ── QR Download / Print ──────────────────────────────────────
function downloadQR(dataUrl, name) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `qr-${name.replace(/\s+/g, '-').toLowerCase()}.png`;
  a.click();
}

function printQR(dataUrl, name) {
  const win = window.open('', '_blank');
  win.document.write(`
    <!DOCTYPE html><html><head><title>QR - ${name}</title>
    <style>
      body { font-family: sans-serif; text-align: center; padding: 2rem; }
      img { width: 250px; height: 250px; border: 2px solid #ccc; border-radius: 8px; }
      h2 { margin-top: 1rem; font-size: 1.4rem; }
      p { color: #666; }
    </style></head><body>
    <img src="${dataUrl}" alt="QR Code" />
    <h2>${escHtml(name)}</h2>
    <p>Wedding Check-in QR Code</p>
    <script>window.onload = () => { window.print(); window.close(); }<\/script>
    </body></html>
  `);
  win.document.close();
}

// ── CSV Bulk Import ──────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split('\n');
  const results = [];
  // Skip header if it looks like one
  const start = lines[0].toLowerCase().includes('name') ? 1 : 0;
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
    const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };

    await html5QrCode.start(
      { facingMode: 'environment' },
      config,
      onScanSuccess,
      () => {} // ignore decode errors (continuous scanning)
    );

    $('#start-scan-btn').classList.add('hidden');
    $('#stop-scan-btn').classList.remove('hidden');
  } catch (err) {
    console.error('Camera error:', err);
    setScanResult('invalid', '📵', 'Camera Error', 'Please allow camera access and try again');
  }
}

function stopScanner() {
  if (html5QrCode) {
    html5QrCode.stop().then(() => {
      html5QrCode.clear();
      html5QrCode = null;
    }).catch(() => { html5QrCode = null; });
  }
  const startBtn = $('#start-scan-btn');
  const stopBtn = $('#stop-scan-btn');
  if (startBtn) startBtn.classList.remove('hidden');
  if (stopBtn) stopBtn.classList.add('hidden');
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

  // Cooldown to prevent rapid re-scans
  setTimeout(() => { state.scanCooldown = false; }, 2500);
}

function handleScanResult(result) {
  if (result.result === 'granted') {
    setScanResult('granted', '✅', 'Access Granted', result.guest?.name || '', result.guest?.checked_in_at);
    playSound('success');
    fetchScannerStats();
  } else if (result.result === 'used') {
    setScanResult('used', '🚫', 'Already Checked In', result.guest?.name || '', result.guest?.checked_in_at);
    playSound('error');
  } else {
    setScanResult('invalid', '❓', 'Invalid QR Code', 'This QR code is not recognized');
    playSound('error');
  }
}

function setScanResult(type, icon, message, name = '', time = '') {
  const el = $('#scan-result');
  const iconEl = $('#scan-icon');
  const msgEl = $('#scan-message');
  const nameEl = $('#scan-name');
  const timeEl = $('#scan-time');

  el.className = `scan-result scan-${type}`;
  iconEl.textContent = icon;
  msgEl.textContent = message;
  nameEl.textContent = name;
  timeEl.textContent = time ? `at ${formatDateTime(time)}` : '';

  // Auto-reset to idle after 3 seconds
  setTimeout(() => {
    el.className = 'scan-result scan-idle';
    iconEl.textContent = '📷';
    msgEl.textContent = 'Ready to Scan';
    nameEl.textContent = '';
    timeEl.textContent = '';
  }, 3000);
}

// ── Manual Search (Scanner) ──────────────────────────────────
async function manualSearch(query) {
  if (!query.trim()) return;
  try {
    const guests = await api('GET', `/guests?search=${encodeURIComponent(query)}`);
    renderManualResults(guests);
  } catch (e) {
    console.error('Manual search error:', e);
  }
}

function renderManualResults(guests) {
  const el = $('#manual-results');
  if (!el) return;

  if (guests.length === 0) {
    el.innerHTML = '<div class="empty-state">No guests found</div>';
    el.classList.remove('hidden');
    return;
  }

  el.innerHTML = guests.slice(0, 5).map(g => `
    <div class="manual-result-item">
      <div class="manual-result-info">
        <div class="name">${escHtml(g.name)}</div>
        <div class="phone">${g.phone || '—'}</div>
      </div>
      <div style="display:flex;align-items:center;gap:0.5rem;">
        <span class="badge ${g.status === 'used' ? 'badge-used' : 'badge-unused'}">
          ${g.status === 'used' ? '✅ In' : '⏳ Pending'}
        </span>
        ${g.status === 'unused' ? `<button class="btn btn-success btn-sm" onclick="manualCheckIn('${g.qr_token}')">Check In</button>` : ''}
      </div>
    </div>
  `).join('');
  el.classList.remove('hidden');
}

async function manualCheckIn(token) {
  try {
    const result = await api('POST', '/guests/scan', { token });
    handleScanResult(result);
    // Refresh manual results
    const query = $('#manual-search-input')?.value;
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
    g.name, g.phone || '', g.status,
    g.checked_in_at ? new Date(g.checked_in_at).toLocaleString() : '',
    g.checked_in_by || ''
  ]));
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'wedding-guests.csv';
  a.click();
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
  $(`[data-tab="${tabId}"]`)?.classList.add('active');
  $(`#${tabId}`)?.classList.remove('hidden');

  // Load data when switching tabs
  if (tabId === 'tab-guests') fetchGuests();
  if (tabId === 'tab-overview') { fetchStats(); renderRecentCheckins(); }
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

  // ── Login Form ──
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#login-btn');
    const errEl = $('#login-error');
    hideAlert(errEl);
    btn.disabled = true;
    btn.querySelector('.btn-text').textContent = 'Signing in…';

    try {
      const user = await login($('#username').value, $('#password').value);
      state.user = user;
      if (user.role === 'admin') initAdmin();
      else initScanner();
    } catch (e) {
      showAlert(errEl, e.message);
    } finally {
      btn.disabled = false;
      btn.querySelector('.btn-text').textContent = 'Sign In';
    }
  });
}

function initAdmin() {
  showPage('page-admin');
  $('#admin-username').textContent = `👤 ${state.user.username}`;

  // Load initial data
  fetchStats();

  // Tab navigation
  $$('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Logout
  $('#admin-logout').addEventListener('click', logout);

  // Guest search
  let searchTimer;
  $('#guest-search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => fetchGuests(e.target.value), 300);
  });

  // Export
  $('#export-btn').addEventListener('click', exportCSV);

  // Add guest form
  $('#add-guest-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = $('#add-guest-error');
    const sucEl = $('#add-guest-success');
    hideAlert(errEl); hideAlert(sucEl);

    const name = $('#guest-name').value.trim();
    const phone = $('#guest-phone').value.trim();

    try {
      const guest = await addGuest(name, phone);
      showAlert(sucEl, `Guest "${guest.name}" added successfully!`, 'success');
      $('#add-guest-form').reset();
      await showNewGuestQR(guest);
      fetchStats();
    } catch (err) {
      showAlert(errEl, err.message);
    }
  });

  // QR Modal close
  $('#qr-modal-close').addEventListener('click', () => $('#qr-modal').classList.add('hidden'));
  $('#qr-modal-overlay').addEventListener('click', () => $('#qr-modal').classList.add('hidden'));
  $('#view-qr-modal-close').addEventListener('click', () => $('#view-qr-modal').classList.add('hidden'));
  $('#view-qr-modal-overlay').addEventListener('click', () => $('#view-qr-modal').classList.add('hidden'));

  // CSV file input
  const csvFile = $('#csv-file');
  const csvDropZone = $('#csv-drop-zone');
  const bulkBtn = $('#bulk-import-btn');

  csvFile.addEventListener('change', (e) => handleCSVFile(e.target.files[0]));

  csvDropZone.addEventListener('dragover', (e) => { e.preventDefault(); csvDropZone.classList.add('drag-over'); });
  csvDropZone.addEventListener('dragleave', () => csvDropZone.classList.remove('drag-over'));
  csvDropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    csvDropZone.classList.remove('drag-over');
    handleCSVFile(e.dataTransfer.files[0]);
  });

  function handleCSVFile(file) {
    if (!file || !file.name.endsWith('.csv')) {
      showAlert($('#bulk-error'), 'Please select a valid CSV file');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      state.csvData = parseCSV(e.target.result);
      const preview = $('#csv-preview');
      preview.innerHTML = `<strong>${state.csvData.length} guests found:</strong><br>` +
        state.csvData.slice(0, 5).map(g => `• ${escHtml(g.name)}${g.phone ? ` (${escHtml(g.phone)})` : ''}`).join('<br>') +
        (state.csvData.length > 5 ? `<br>... and ${state.csvData.length - 5} more` : '');
      preview.classList.remove('hidden');
      bulkBtn.disabled = state.csvData.length === 0;
    };
    reader.readAsText(file);
  }

  bulkBtn.addEventListener('click', async () => {
    if (!state.csvData.length) return;
    const errEl = $('#bulk-error');
    const sucEl = $('#bulk-success');
    hideAlert(errEl); hideAlert(sucEl);
    bulkBtn.disabled = true;
    bulkBtn.textContent = 'Importing…';

    try {
      const created = await api('POST', '/guests/bulk', { guests: state.csvData });
      showAlert(sucEl, `Successfully imported ${created.length} guests!`, 'success');
      state.csvData = [];
      $('#csv-preview').classList.add('hidden');
      $('#csv-file').value = '';
      bulkBtn.textContent = 'Import Guests';
      fetchStats();
    } catch (err) {
      showAlert(errEl, err.message);
      bulkBtn.disabled = false;
      bulkBtn.textContent = 'Import Guests';
    }
  });

  // Real-time: update recent checkins list
  socket.on('guest_checked_in', (guest) => {
    addRecentCheckin(guest);
    refreshGuestRow(guest);
    fetchStats();
  });
}

function initScanner() {
  showPage('page-scanner');
  $('#scanner-username').textContent = `👤 ${state.user.username}`;
  fetchScannerStats();

  // Logout
  $('#scanner-logout').addEventListener('click', () => {
    stopScanner();
    logout();
  });

  // Camera controls
  $('#start-scan-btn').addEventListener('click', startScanner);
  $('#stop-scan-btn').addEventListener('click', stopScanner);

  // Manual search
  $('#manual-search-btn').addEventListener('click', () => {
    manualSearch($('#manual-search-input').value);
  });
  $('#manual-search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') manualSearch(e.target.value);
  });

  // Real-time stats update
  socket.on('guest_checked_in', () => fetchScannerStats());
}

// ── PWA ──────────────────────────────────────────────────────
let deferredInstallPrompt = null;

function initPWA() {
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('SW registered:', reg.scope))
      .catch(err => console.warn('SW registration failed:', err));
  }

  // Capture the install prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;

    // Don't show if user already dismissed
    if (sessionStorage.getItem('pwa-dismissed')) return;

    // Show install banner after a short delay
    setTimeout(() => {
      const banner = $('#pwa-banner');
      if (banner) banner.classList.remove('hidden');
    }, 3000);
  });

  // Install button
  const installBtn = $('#pwa-install-btn');
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      $('#pwa-banner').classList.add('hidden');
    });
  }

  // Dismiss button
  const dismissBtn = $('#pwa-dismiss-btn');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      $('#pwa-banner').classList.add('hidden');
      sessionStorage.setItem('pwa-dismissed', '1');
    });
  }

  // Hide banner once installed
  window.addEventListener('appinstalled', () => {
    const banner = $('#pwa-banner');
    if (banner) banner.classList.add('hidden');
    deferredInstallPrompt = null;
    console.log('PWA installed');
  });
}

// ── Boot ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initPWA();
  init();
});
