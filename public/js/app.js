/* ============================================================
   Multi-Event Wedding Check-in System — Frontend Application
   ============================================================ */
'use strict';

// ── State ────────────────────────────────────────────────────
const state = {
  user: null,
  currentEvent: null,      // { _id, name, color, ... }
  guests: [],
  stats: { total: 0, checkedIn: 0, remaining: 0 },
  recentCheckins: [],
  scanCooldown: false,
  csvData: [],
  initialized: false,
  scannerEventId: null     // event scanner is working on
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
  if (!el) return;
  el.textContent = msg;
  el.className = `alert alert-${type}`;
  el.classList.remove('hidden');
  if (type === 'success') setTimeout(() => el.classList.add('hidden'), 4000);
}

function hideAlert(el) {
  if (el) el.classList.add('hidden');
}

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
  state.user        = null;
  state.initialized = false;
  state.currentEvent = null;
  state.scannerEventId = null;
  stopScanner();
  showPage('page-login');
}

// ── Events (Admin) ───────────────────────────────────────────
async function fetchEvents() {
  try {
    const events = await api('GET', '/events');
    renderEventsGrid(events);
  } catch (e) {
    const grid = $('#events-grid');
    if (grid) grid.innerHTML = '<div class="empty-state">Failed to load events</div>';
    console.error('fetchEvents error:', e);
  }
}

function renderEventsGrid(events) {
  const grid = $('#events-grid');
  if (!grid) return;
  if (!events.length) {
    grid.innerHTML = '<div class="empty-state">No events yet. Create your first event!</div>';
    return;
  }
  grid.innerHTML = events.map(ev => {
    const color      = ev.color || '#7c3aed';
    const dateStr    = ev.date ? new Date(ev.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
    const total      = ev.total      || 0;
    const checkedIn  = ev.checkedIn  || 0;
    const remaining  = ev.remaining  || 0;
    const pct        = total > 0 ? Math.round((checkedIn / total) * 100) : 0;
    return `
    <div class="event-card" style="--event-color: ${escHtml(color)}">
      <div class="event-card-header">
        <div class="event-card-name">${escHtml(ev.name)}</div>
        ${ev.client_name ? `<div class="event-card-client">${escHtml(ev.client_name)}</div>` : ''}
      </div>
      <div class="event-card-meta">
        ${ev.date   ? `<span>📅 ${escHtml(dateStr)}</span>` : ''}
        ${ev.venue  ? `<span>📍 ${escHtml(ev.venue)}</span>` : ''}
      </div>
      <div class="event-card-stats">
        <div class="event-stat"><span class="event-stat-value">${total}</span><span class="event-stat-label">Total</span></div>
        <div class="event-stat"><span class="event-stat-value">${checkedIn}</span><span class="event-stat-label">Checked In</span></div>
        <div class="event-stat"><span class="event-stat-value">${remaining}</span><span class="event-stat-label">Remaining</span></div>
      </div>
      <div class="event-card-progress">
        <div class="progress-bar" style="height:6px">
          <div class="progress-fill" style="width:${pct}%;background:var(--event-color)"></div>
        </div>
        <small style="color:var(--gray-400)">${pct}% attendance</small>
      </div>
      <div class="event-card-actions">
        <button class="btn btn-primary btn-sm" onclick="openEvent(${JSON.stringify(escHtml(JSON.stringify(ev))).slice(1,-1)})">Open →</button>
        <button class="btn btn-outline btn-sm" onclick='editEvent(${JSON.stringify(JSON.stringify(ev))}.replace ? JSON.parse(${JSON.stringify(JSON.stringify(ev))}) : ${JSON.stringify(ev)})'>✏️ Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteEvent('${gid(ev)}','${escHtml(ev.name).replace(/'/g,"\\'")}')">🗑 Delete</button>
      </div>
    </div>`;
  }).join('');

  // Attach open/edit/delete via data attributes to avoid inline JSON escaping issues
  grid.innerHTML = '';
  events.forEach(ev => {
    const color     = ev.color || '#7c3aed';
    const dateStr   = ev.date ? new Date(ev.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
    const total     = ev.total     || 0;
    const checkedIn = ev.checkedIn || 0;
    const remaining = ev.remaining || 0;
    const pct       = total > 0 ? Math.round((checkedIn / total) * 100) : 0;

    const card = document.createElement('div');
    card.className = 'event-card';
    card.style.setProperty('--event-color', color);
    card.innerHTML = `
      <div class="event-card-header">
        <div class="event-card-name">${escHtml(ev.name)}</div>
        ${ev.client_name ? `<div class="event-card-client">${escHtml(ev.client_name)}</div>` : ''}
      </div>
      <div class="event-card-meta">
        ${ev.date  ? `<span>📅 ${escHtml(dateStr)}</span>` : ''}
        ${ev.venue ? `<span>📍 ${escHtml(ev.venue)}</span>` : ''}
      </div>
      <div class="event-card-stats">
        <div class="event-stat"><span class="event-stat-value">${total}</span><span class="event-stat-label">Total</span></div>
        <div class="event-stat"><span class="event-stat-value">${checkedIn}</span><span class="event-stat-label">Checked In</span></div>
        <div class="event-stat"><span class="event-stat-value">${remaining}</span><span class="event-stat-label">Remaining</span></div>
      </div>
      <div class="event-card-progress">
        <div class="progress-bar" style="height:6px">
          <div class="progress-fill" style="width:${pct}%;background:var(--event-color)"></div>
        </div>
        <small style="color:var(--gray-400)">${pct}% attendance</small>
      </div>
      <div class="event-card-actions">
        <button class="btn btn-primary btn-sm js-open-event">Open →</button>
        <button class="btn btn-outline btn-sm js-edit-event">✏️ Edit</button>
        <button class="btn btn-danger btn-sm js-delete-event">🗑 Delete</button>
      </div>`;

    card.querySelector('.js-open-event').addEventListener('click', () => openEvent(ev));
    card.querySelector('.js-edit-event').addEventListener('click', () => editEvent(ev));
    card.querySelector('.js-delete-event').addEventListener('click', () => deleteEvent(gid(ev), ev.name));
    grid.appendChild(card);
  });
}

function openEvent(event) {
  state.currentEvent = event;
  state.recentCheckins = [];

  // Show event-specific tabs
  $$('.nav-tab[data-tab="tab-overview"], .nav-tab[data-tab="tab-guests"], .nav-tab[data-tab="tab-add"], .nav-tab[data-tab="tab-send"], .nav-tab[data-tab="tab-activity"]')
    .forEach(t => t.classList.remove('hidden'));

  updateBreadcrumbs();
  switchTab('tab-overview');
  fetchStats();
  fetchGuests();
}

function updateBreadcrumbs() {
  const name = state.currentEvent ? escHtml(state.currentEvent.name) : '';
  $$('.event-breadcrumb').forEach(el => {
    el.innerHTML = `<a href="#" class="breadcrumb-back js-back-to-events">← Back to Events</a> <span class="breadcrumb-sep">›</span> <span class="breadcrumb-event">${name}</span>`;
    el.querySelector('.js-back-to-events').addEventListener('click', (e) => {
      e.preventDefault();
      backToEvents();
    });
  });
}

function backToEvents() {
  state.currentEvent = null;
  state.recentCheckins = [];
  // Hide event-specific tabs
  $$('.nav-tab[data-tab="tab-overview"], .nav-tab[data-tab="tab-guests"], .nav-tab[data-tab="tab-add"], .nav-tab[data-tab="tab-send"], .nav-tab[data-tab="tab-activity"]')
    .forEach(t => t.classList.add('hidden'));
  switchTab('tab-events');
}

async function createEvent(data) {
  return await api('POST', '/events', data);
}

function editEvent(event) {
  const modal = $('#event-modal');
  if (!modal) return;
  $('#event-modal-title').textContent = 'Edit Event';
  $('#event-modal-save').textContent  = 'Save Changes';
  $('#ev-name').value   = event.name        || '';
  $('#ev-client').value = event.client_name || '';
  $('#ev-date').value   = event.date ? new Date(event.date).toISOString().split('T')[0] : '';
  $('#ev-venue').value  = event.venue       || '';
  $('#ev-color').value  = event.color       || '#7c3aed';
  modal.dataset.editId  = gid(event);
  hideAlert($('#event-modal-error'));
  modal.classList.remove('hidden');
}

async function deleteEvent(id, name) {
  if (!confirm(`Delete event "${name}" and ALL its guests? This cannot be undone.`)) return;
  try {
    await api('DELETE', `/events/${id}`);
    if (state.currentEvent && gid(state.currentEvent) === id) {
      backToEvents();
    }
    fetchEvents();
  } catch (e) {
    alert('Failed to delete event: ' + e.message);
  }
}

// ── Stats ────────────────────────────────────────────────────
async function fetchStats() {
  if (!state.currentEvent) return;
  try {
    const stats = await api('GET', `/guests/stats?event_id=${gid(state.currentEvent)}`);
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
  const eventId = state.scannerEventId;
  if (!eventId) return;
  try {
    const stats = await api('GET', `/guests/stats?event_id=${eventId}`);
    state.stats = stats;
    const elCI = $('#sc-checkedin');
    const elT  = $('#sc-total');
    const elR  = $('#sc-remaining');
    if (elCI) elCI.textContent = stats.checkedIn;
    if (elT)  elT.textContent  = stats.total;
    if (elR)  elR.textContent  = stats.remaining;
  } catch (e) { console.error('Scanner stats error:', e); }
}

// ── Guests ───────────────────────────────────────────────────
async function fetchGuests(search = '') {
  if (!state.currentEvent) return;
  const eventId = gid(state.currentEvent);
  let path = `/guests?event_id=${eventId}`;
  if (search) path += `&search=${encodeURIComponent(search)}`;
  try {
    const guests = await api('GET', path);
    state.guests = guests;
    renderGuestsTable(guests);
  } catch (e) {
    console.error('fetchGuests error:', e);
  }
}

function renderGuestsTable(guests) {
  const tbody = $('#guests-tbody');
  if (!tbody) return;
  if (!guests.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No guests found</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  guests.forEach((g, i) => {
    const lookupCode = (g.unique_id || '').substring(0, 8).toUpperCase();
    const tr = document.createElement('tr');
    tr.id = `guest-row-${gid(g)}`;
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td><strong>${escHtml(g.name)}</strong></td>
      <td>${g.phone ? escHtml(g.phone) : '<span style="color:var(--gray-400)">—</span>'}</td>
      <td>${g.table_number ? escHtml(g.table_number) : '<span style="color:var(--gray-400)">—</span>'}</td>
      <td><span class="code-badge">${escHtml(lookupCode)}</span></td>
      <td>
        <span class="badge ${g.status === 'used' ? 'badge-used' : 'badge-unused'}">
          ${g.status === 'used' ? '✅ Checked In' : '⏳ Pending'}
        </span>
        ${g.status === 'used' && g.checked_in_at ? `<div style="font-size:0.75rem;color:var(--gray-400)">${formatDateTime(g.checked_in_at)}</div>` : ''}
      </td>
      <td>${g.sms_sent ? '✅' : '<span style="color:var(--gray-400)">—</span>'}</td>
      <td class="table-actions-cell"></td>`;

    // Build actions cell safely
    const actionsCell = tr.querySelector('.table-actions-cell');
    const actionsDiv  = document.createElement('div');
    actionsDiv.className = 'table-actions';

    const qrBtn = document.createElement('button');
    qrBtn.className = 'btn btn-outline btn-sm';
    qrBtn.title = 'View QR Code';
    qrBtn.textContent = '🔲 QR';
    qrBtn.addEventListener('click', () => viewGuestQR(gid(g)));
    actionsDiv.appendChild(qrBtn);

    const linkBtn = document.createElement('button');
    linkBtn.className = 'btn btn-outline btn-sm';
    linkBtn.title = 'Copy guest link';
    linkBtn.textContent = '🔗';
    linkBtn.addEventListener('click', () => copyGuestLink(g.qr_token));
    actionsDiv.appendChild(linkBtn);

    const waBtn = document.createElement('button');
    waBtn.className = 'btn btn-outline btn-sm';
    waBtn.title = 'Share via WhatsApp';
    waBtn.textContent = '💬';
    waBtn.addEventListener('click', () => shareGuestWhatsApp(g.qr_token, g.name, g.phone || ''));
    actionsDiv.appendChild(waBtn);

    const smsBtn = document.createElement('button');
    smsBtn.className = 'btn btn-outline btn-sm';
    smsBtn.title = 'Send SMS';
    smsBtn.textContent = '📱';
    smsBtn.addEventListener('click', () => sendSingleSMS(gid(g), g.name));
    actionsDiv.appendChild(smsBtn);

    if (g.status === 'used') {
      const resetBtn = document.createElement('button');
      resetBtn.className = 'btn btn-outline btn-sm';
      resetBtn.title = 'Reset check-in';
      resetBtn.textContent = '↩ Reset';
      resetBtn.addEventListener('click', () => resetCheckin(gid(g), g.name));
      actionsDiv.appendChild(resetBtn);
    }

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-danger btn-sm';
    delBtn.title = 'Delete guest';
    delBtn.textContent = '🗑';
    delBtn.addEventListener('click', () => deleteGuest(gid(g), g.name));
    actionsDiv.appendChild(delBtn);

    actionsCell.appendChild(actionsDiv);
    tbody.appendChild(tr);
  });
}

function refreshGuestRow(guest) {
  const row = $(`#guest-row-${gid(guest)}`);
  if (!row) return;
  const cells = row.querySelectorAll('td');
  // Status cell is index 5
  if (cells[5]) {
    cells[5].innerHTML = `<span class="badge badge-used">✅ Checked In</span>
      <div style="font-size:0.75rem;color:var(--gray-400)">${formatDateTime(guest.checked_in_at)}</div>`;
  }
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
    const search = $('#guest-search') ? $('#guest-search').value : '';
    await fetchGuests(search);
    await fetchStats();
  } catch (e) {
    alert('Failed to delete guest: ' + e.message);
  }
}

async function resetCheckin(id, name) {
  if (!confirm(`Reset check-in for "${name}"? They will be marked as not checked in.`)) return;
  try {
    await api('PATCH', `/guests/${id}/reset`);
    const search = $('#guest-search') ? $('#guest-search').value : '';
    await fetchGuests(search);
    await fetchStats();
  } catch (e) {
    alert('Failed to reset: ' + e.message);
  }
}

function copyGuestLink(token) {
  const link       = `${window.location.origin}/guest/${token}`;
  const lookupCode = token.substring(0, 8).toUpperCase();
  const text       = `${link}\n\nCheck-in code: ${lookupCode}`;
  navigator.clipboard.writeText(text).then(() => {
    alert('Copied! Share this with the guest:\n\n' + text);
  }).catch(() => {
    prompt('Copy this and send to the guest:', text);
  });
}

function shareGuestWhatsApp(token, name, phone) {
  const link       = `${window.location.origin}/guest/${token}`;
  const lookupCode = token.substring(0, 8).toUpperCase();
  const eventName  = state.currentEvent ? state.currentEvent.name : 'Our Event';
  const msg = `💍 Dear ${name},\n\nYou are invited to ${eventName}! Here is your personal QR code invitation:\n\n${link}\n\nYour check-in code: *${lookupCode}*\n\nOpen the link and show the QR code at the entrance. If the QR can't be scanned, give your code: ${lookupCode}`;
  const ph  = (phone || '').replace(/\D/g, '');
  if (!ph) {
    navigator.clipboard.writeText(msg)
      .then(() => alert(`No phone number for ${name}.\n\nMessage copied to clipboard — paste it in WhatsApp manually.`))
      .catch(() => prompt(`No phone number for ${name}. Copy this message:`, msg));
    return;
  }
  window.open(`https://wa.me/${ph}?text=${encodeURIComponent(msg)}`, '_blank');
}

async function sendSingleSMS(id, name) {
  const errEl = $('#add-guest-error');
  const sucEl = $('#add-guest-success');
  try {
    await api('POST', `/guests/${id}/sms`);
    alert(`SMS sent to ${name} successfully!`);
    // Refresh row to show SMS tick
    const search = $('#guest-search') ? $('#guest-search').value : '';
    fetchGuests(search);
  } catch (e) {
    alert(`Failed to send SMS to ${name}: ${e.message}`);
  }
}

// ── View Guest QR ────────────────────────────────────────────
async function viewGuestQR(id) {
  try {
    const data  = await api('GET', `/guests/${id}/qr`);
    const guest = data.guest;
    showQRCard(data, '#view-qr-card-preview');

    $('#view-qr-download-btn').onclick = () => downloadQRCard(guest.name, '#view-qr-card-preview');
    $('#view-qr-print-btn').onclick    = () => printQRCard(guest.name, '#view-qr-card-preview');
    $('#view-qr-whatsapp-btn').onclick = () => shareViaWhatsApp(guest, data.eventName || (state.currentEvent ? state.currentEvent.name : 'Our Event'));
    $('#view-qr-sms-btn').onclick      = () => shareViaSMS(guest, data.eventName || (state.currentEvent ? state.currentEvent.name : 'Our Event'));

    $('#view-qr-modal').classList.remove('hidden');
  } catch (e) {
    alert('Failed to load QR: ' + e.message);
  }
}

// ── Add Guest ────────────────────────────────────────────────
async function addGuest(name, phone, table_number, eventId) {
  return await api('POST', '/guests', { name, phone, table_number, event_id: eventId });
}

async function showNewGuestQR(guest) {
  const data = await api('GET', `/guests/${gid(guest)}/qr`);
  showQRCard(data, '#qr-card-preview');

  $('#qr-download-btn').onclick = () => downloadQRCard(guest.name, '#qr-card-preview');
  $('#qr-print-btn').onclick    = () => printQRCard(guest.name, '#qr-card-preview');
  $('#qr-whatsapp-btn').onclick = () => shareViaWhatsApp(data.guest, data.eventName || (state.currentEvent ? state.currentEvent.name : 'Our Event'));
  $('#qr-sms-btn').onclick      = () => shareViaSMS(data.guest, data.eventName || (state.currentEvent ? state.currentEvent.name : 'Our Event'));

  $('#qr-modal').classList.remove('hidden');
}

// ── QR Card Rendering ────────────────────────────────────────
function showQRCard(data, containerSelector) {
  const container = $(containerSelector);
  if (!container) return null;

  const guest       = data.guest || data;
  const eventName   = data.eventName || (state.currentEvent ? state.currentEvent.name : 'Our Event');
  const lookupCode  = (guest.unique_id || '').substring(0, 8).toUpperCase();
  const guestNum    = data.guest_number  || null;
  const totalGuests = data.total_guests  || null;
  const tableNum    = guest.table_number || null;

  const card = document.createElement('div');
  card.className = 'qr-card';
  card.innerHTML = `
    <div class="qr-card-event">${escHtml(eventName)}</div>
    <div class="qr-card-name">${escHtml(guest.name)}</div>
    ${guest.phone  ? `<div class="qr-card-phone">${escHtml(guest.phone)}</div>` : ''}
    ${tableNum     ? `<div class="qr-card-phone">🪑 ${escHtml(tableNum)}</div>` : ''}
    ${guestNum && totalGuests ? `<div class="qr-card-phone" style="opacity:0.5;font-size:0.7rem">Guest ${guestNum} of ${totalGuests}</div>` : ''}
    <img class="qr-card-img" src="${data.qrDataUrl}" alt="QR Code" />
    <div class="qr-card-code">${escHtml(lookupCode)}</div>
    <div class="qr-card-footer">Present this QR code at the entrance</div>`;

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
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#7c3aed');
    grad.addColorStop(1, '#4c1d95');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(0, 0, W, 6);

    const eventNameEl = container.querySelector('.qr-card-event');
    const eventName   = eventNameEl ? eventNameEl.textContent : (state.currentEvent ? state.currentEvent.name : 'Our Event');
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(eventName, W / 2, 36);

    const nameEl = container.querySelector('.qr-card-name');
    const name   = nameEl ? nameEl.textContent : guestName;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    let displayName = name;
    while (ctx.measureText(displayName).width > W - 24 && displayName.length > 4) {
      displayName = displayName.slice(0, -1);
    }
    if (displayName !== name) displayName += '…';
    ctx.fillText(displayName, W / 2, 66);

    const phoneEl = container.querySelector('.qr-card-phone');
    if (phoneEl) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(phoneEl.textContent, W / 2, 86);
    }

    const qrSize = 180;
    const qrX    = (W - qrSize) / 2;
    const qrY    = 100;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(qrX - 8, qrY - 8, qrSize + 16, qrSize + 16, 10);
    } else {
      ctx.rect(qrX - 8, qrY - 8, qrSize + 16, qrSize + 16);
    }
    ctx.fill();
    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

    const codeEl = container.querySelector('.qr-card-code');
    const code   = codeEl ? codeEl.textContent : '';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(code, W / 2, qrY + qrSize + 32);

    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Present this QR code at the entrance', W / 2, H - 16);

    const link = document.createElement('a');
    link.download = `qr-${guestName.replace(/\s+/g, '-').toLowerCase()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

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
    .qr-card-event  { font-size: 13px; opacity: 0.85; margin-bottom: 0.4rem; font-weight: bold; }
    .qr-card-name   { font-size: 20px; font-weight: bold; margin-bottom: 0.25rem; }
    .qr-card-phone  { font-size: 13px; opacity: 0.7; margin-bottom: 0.75rem; }
    .qr-card-img    { width: 180px; height: 180px; background: #fff; padding: 8px;
      border-radius: 10px; display: block; margin: 0 auto 0.75rem; }
    .qr-card-code   { font-family: monospace; font-size: 16px; font-weight: bold;
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
  const link       = `${window.location.origin}/guest/${guest.qr_token}`;
  const message    = `💍 Dear ${guest.name}, you are invited to ${eventName}!\n\nYour QR invitation: ${link}\n\nCheck-in code: *${lookupCode}*\n\nShow this at the entrance.`;
  const url        = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
}

// ── Share via SMS ────────────────────────────────────────────
function shareViaSMS(guest, eventName) {
  const phone      = (guest.phone || '').replace(/\D/g, '');
  const lookupCode = (guest.unique_id || '').substring(0, 8).toUpperCase();
  const link       = `${window.location.origin}/guest/${guest.qr_token}`;
  const message    = `Dear ${guest.name}, you are invited to ${eventName}. Your QR invitation: ${link} Code: ${lookupCode}`;
  window.open(`sms:${phone}?body=${encodeURIComponent(message)}`, '_self');
}

// ── Send Invites Tab ─────────────────────────────────────────
async function loadSendTab() {
  if (!state.currentEvent) return;
  const eventId = gid(state.currentEvent);
  try {
    const stats = await api('GET', `/guests/stats?event_id=${eventId}`);
    // Fetch guests to count phone/sms stats
    const guests = await api('GET', `/guests?event_id=${eventId}`);
    const withPhone   = guests.filter(g => g.phone && g.phone.trim()).length;
    const alreadySent = guests.filter(g => g.sms_sent).length;
    const notSent     = withPhone - alreadySent;

    const smsStatsEl = $('#sms-stats');
    if (smsStatsEl) {
      smsStatsEl.innerHTML = `
        <div class="sms-stat-row"><span>Total guests with phone:</span><strong>${withPhone}</strong></div>
        <div class="sms-stat-row"><span>Already sent SMS:</span><strong style="color:var(--success)">${alreadySent}</strong></div>
        <div class="sms-stat-row"><span>Not sent yet:</span><strong style="color:var(--warning)">${notSent}</strong></div>`;
    }
  } catch (e) {
    console.error('loadSendTab error:', e);
  }
}

async function sendAllSMS() {
  if (!state.currentEvent) return;
  const eventId    = gid(state.currentEvent);
  const onlyUnsent = $('#sms-only-unsent') ? $('#sms-only-unsent').checked : true;
  const resultEl   = $('#sms-result');
  const btn        = $('#send-all-sms-btn');

  if (!confirm(`Send SMS invitations to all guests${onlyUnsent ? ' who haven\'t received one yet' : ''}?`)) return;

  if (btn) { btn.disabled = true; btn.textContent = '📱 Sending…'; }
  hideAlert(resultEl);

  try {
    const res = await api('POST', '/guests/sms/bulk', { event_id: eventId, only_unsent: onlyUnsent });
    const msg = `✅ Sent: ${res.sent} | ❌ Failed: ${res.failed}${res.errors && res.errors.length ? '\n\nErrors:\n' + res.errors.join('\n') : ''}`;
    showAlert(resultEl, msg, res.failed === 0 ? 'success' : 'error');
    loadSendTab();
  } catch (e) {
    showAlert(resultEl, 'Failed to send SMS: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📱 Send SMS to All Guests'; }
  }
}

async function sendAllWhatsApp() {
  if (!state.currentEvent) return;
  const eventId = gid(state.currentEvent);

  try {
    const guests    = await api('GET', `/guests?event_id=${eventId}`);
    const withPhone = guests.filter(g => g.phone && g.phone.trim());

    if (!withPhone.length) {
      alert('No guests with phone numbers found.');
      return;
    }

    if (!confirm(`This will open WhatsApp for ${withPhone.length} guests one by one. You will need to tap Send for each. Continue?`)) return;

    const progressEl     = $('#wa-progress');
    const progressFillEl = $('#wa-progress-fill');
    const progressTextEl = $('#wa-progress-text');
    const btn            = $('#send-all-wa-btn');

    if (progressEl) progressEl.classList.remove('hidden');
    if (btn) { btn.disabled = true; btn.textContent = '💬 Sending…'; }

    const eventName = state.currentEvent.name;

    for (let i = 0; i < withPhone.length; i++) {
      const g          = withPhone[i];
      const lookupCode = (g.unique_id || '').substring(0, 8).toUpperCase();
      const link       = `${window.location.origin}/guest/${g.qr_token}`;
      const msg        = `💍 Dear ${g.name}, you are invited to ${eventName}!\n\nYour QR invitation: ${link}\n\nCheck-in code: *${lookupCode}*\n\nShow this at the entrance.`;
      const ph         = g.phone.replace(/\D/g, '');
      window.open(`https://wa.me/${ph}?text=${encodeURIComponent(msg)}`, '_blank');

      const pct = Math.round(((i + 1) / withPhone.length) * 100);
      if (progressFillEl) progressFillEl.style.width = `${pct}%`;
      if (progressTextEl) progressTextEl.textContent = `Sent ${i + 1} of ${withPhone.length}`;

      if (i < withPhone.length - 1) {
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    if (progressTextEl) progressTextEl.textContent = `Done! Sent to ${withPhone.length} guests.`;
    if (btn) { btn.disabled = false; btn.textContent = '💬 Send WhatsApp to All Guests'; }
    setTimeout(() => {
      if (progressEl) progressEl.classList.add('hidden');
      if (progressFillEl) progressFillEl.style.width = '0%';
    }, 5000);
  } catch (e) {
    alert('Failed: ' + e.message);
    const btn = $('#send-all-wa-btn');
    if (btn) { btn.disabled = false; btn.textContent = '💬 Send WhatsApp to All Guests'; }
  }
}

// ── CSV Bulk Import ──────────────────────────────────────────
function parseCSV(text) {
  const lines   = text.trim().split('\n');
  const results = [];
  const header  = lines[0].toLowerCase();
  const start   = (header.includes('name') || header.includes('phone')) ? 1 : 0;
  for (let i = start; i < lines.length; i++) {
    const parts = lines[i].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
    if (parts[0]) {
      results.push({
        name:         parts[0],
        phone:        parts[1] || '',
        table_number: parts[2] || ''
      });
    }
  }
  return results;
}

// ── Export CSV ───────────────────────────────────────────────
function exportCSV() {
  const guests = state.guests;
  if (!guests.length) { alert('No guests to export.'); return; }
  const rows = [['Name', 'Phone', 'Table', 'Code', 'Status', 'Checked In At', 'Checked In By', 'SMS Sent']];
  guests.forEach(g => rows.push([
    g.name,
    g.phone || '',
    g.table_number || '',
    (g.unique_id || '').substring(0, 8).toUpperCase(),
    g.status,
    g.checked_in_at ? new Date(g.checked_in_at).toLocaleString() : '',
    g.checked_in_by || '',
    g.sms_sent ? 'Yes' : 'No'
  ]));
  const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  const evName = state.currentEvent ? state.currentEvent.name.replace(/\s+/g, '-').toLowerCase() : 'guests';
  a.download = `${evName}-guests.csv`;
  a.click();
}

// ── Download All QR ──────────────────────────────────────────
async function downloadAllQR() {
  if (!state.currentEvent) return;
  const eventId = gid(state.currentEvent);
  const modal   = $('#download-all-modal');
  const fillEl  = $('#dl-progress-fill');
  const textEl  = $('#dl-progress-text');
  if (modal) modal.classList.remove('hidden');

  try {
    const guests = await api('GET', `/guests/allqr?event_id=${eventId}`);
    const total  = guests.length;
    if (total === 0) {
      if (modal) modal.classList.add('hidden');
      alert('No guests found.');
      return;
    }
    for (let i = 0; i < total; i++) {
      await generateAndDownloadCard(guests[i]);
      const pct = Math.round(((i + 1) / total) * 100);
      if (fillEl) fillEl.style.width = `${pct}%`;
      if (textEl) textEl.textContent = `${i + 1} / ${total}`;
      await new Promise(r => setTimeout(r, 80));
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

function generateAndDownloadCard(g) {
  return new Promise((resolve) => {
    const W = 300, H = 420;
    const canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    const lookupCode = (g.unique_id || '').substring(0, 8).toUpperCase();
    const eventName  = g.eventName || (state.currentEvent ? state.currentEvent.name : 'Our Event');

    const qrImg = new Image();
    qrImg.crossOrigin = 'anonymous';
    qrImg.onload = () => {
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#7c3aed');
      grad.addColorStop(1, '#4c1d95');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(0, 0, W, 6);

      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(eventName, W / 2, 36);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      let displayName = g.name;
      while (ctx.measureText(displayName).width > W - 24 && displayName.length > 4) {
        displayName = displayName.slice(0, -1);
      }
      if (displayName !== g.name) displayName += '…';
      ctx.fillText(displayName, W / 2, 66);

      if (g.phone) {
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(g.phone, W / 2, 86);
      }

      const qrSize = 180;
      const qrX    = (W - qrSize) / 2;
      const qrY    = 100;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(qrX - 8, qrY - 8, qrSize + 16, qrSize + 16, 10);
      } else {
        ctx.rect(qrX - 8, qrY - 8, qrSize + 16, qrSize + 16);
      }
      ctx.fill();
      ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(lookupCode, W / 2, qrY + qrSize + 32);

      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Present this QR code at the entrance', W / 2, H - 16);

      const link = document.createElement('a');
      link.download = `qr-${g.name.replace(/\s+/g, '-').toLowerCase()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      resolve();
    };
    qrImg.onerror = () => resolve();
    qrImg.src = g.qrDataUrl;
  });
}

// ── Scanner ──────────────────────────────────────────────────
let html5QrCode = null;

async function initScannerPage() {
  if (state.initialized) return;
  state.initialized = true;

  showPage('page-scanner');
  const scanUser = $('#scanner-username');
  if (scanUser) scanUser.textContent = `👤 ${state.user.username}`;

  // Show event selector first
  const selectorEl = $('#scanner-event-selector');
  const mainEl     = $('#scanner-main');
  if (selectorEl) selectorEl.classList.remove('hidden');
  if (mainEl)     mainEl.classList.add('hidden');

  // Fetch and render events for scanner
  try {
    const events = await api('GET', '/events');
    renderScannerEventList(events);
  } catch (e) {
    const listEl = $('#scanner-event-list');
    if (listEl) listEl.innerHTML = '<div class="empty-state">Failed to load events</div>';
  }

  // Change event button
  const changeEvBtn = $('#change-event-btn');
  if (changeEvBtn) {
    changeEvBtn.addEventListener('click', () => {
      stopScanner();
      state.scannerEventId = null;
      if (selectorEl) selectorEl.classList.remove('hidden');
      if (mainEl)     mainEl.classList.add('hidden');
      const nameEl = $('#scanner-event-name');
      if (nameEl) nameEl.textContent = 'Check-in Scanner';
      // Refresh event list
      api('GET', '/events').then(renderScannerEventList).catch(() => {});
    });
  }

  // Scanner logout
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

  // Real-time stats update — only for current scanner event
  socket.on('guest_checked_in', (guest) => {
    if (state.scannerEventId && guest.event_id && String(guest.event_id) !== String(state.scannerEventId)) return;
    fetchScannerStats();
  });

  // Keep-alive ping every 10 minutes
  setInterval(() => { fetch('/ping').catch(() => {}); }, 10 * 60 * 1000);
}

function renderScannerEventList(events) {
  const listEl = $('#scanner-event-list');
  if (!listEl) return;
  if (!events.length) {
    listEl.innerHTML = '<div class="empty-state">No events found. Ask admin to create an event.</div>';
    return;
  }
  listEl.innerHTML = '';
  events.forEach(ev => {
    const color   = ev.color || '#7c3aed';
    const dateStr = ev.date ? new Date(ev.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    const card    = document.createElement('div');
    card.className = 'event-card';
    card.style.setProperty('--event-color', color);
    card.style.cursor = 'pointer';
    card.innerHTML = `
      <div class="event-card-header">
        <div class="event-card-name">${escHtml(ev.name)}</div>
        ${ev.client_name ? `<div class="event-card-client">${escHtml(ev.client_name)}</div>` : ''}
      </div>
      <div class="event-card-meta">
        ${dateStr ? `<span>📅 ${escHtml(dateStr)}</span>` : ''}
        ${ev.venue ? `<span>📍 ${escHtml(ev.venue)}</span>` : ''}
      </div>
      <div class="event-card-stats">
        <div class="event-stat"><span class="event-stat-value">${ev.total || 0}</span><span class="event-stat-label">Total</span></div>
        <div class="event-stat"><span class="event-stat-value">${ev.checkedIn || 0}</span><span class="event-stat-label">Checked In</span></div>
        <div class="event-stat"><span class="event-stat-value">${ev.remaining || 0}</span><span class="event-stat-label">Remaining</span></div>
      </div>
      <div style="text-align:center;margin-top:0.5rem">
        <span class="btn btn-primary btn-sm">Scan for this event →</span>
      </div>`;
    card.addEventListener('click', () => selectScannerEvent(ev));
    listEl.appendChild(card);
  });
}

function selectScannerEvent(event) {
  state.scannerEventId = gid(event);

  const nameEl     = $('#scanner-event-name');
  const selectorEl = $('#scanner-event-selector');
  const mainEl     = $('#scanner-main');

  if (nameEl)     nameEl.textContent = event.name;
  if (selectorEl) selectorEl.classList.add('hidden');
  if (mainEl)     mainEl.classList.remove('hidden');

  fetchScannerStats();
}

function startScanner() {
  if (html5QrCode) return;
  try {
    html5QrCode = new Html5Qrcode('qr-reader');
    html5QrCode.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
      onScanSuccess,
      () => {}
    ).then(() => {
      const startBtn = $('#start-scan-btn');
      const stopBtn  = $('#stop-scan-btn');
      if (startBtn) startBtn.classList.add('hidden');
      if (stopBtn)  stopBtn.classList.remove('hidden');
    }).catch(err => {
      console.error('Camera error:', err);
      html5QrCode = null;
      setScanResult('invalid', '📵', 'Camera Error', 'Please allow camera access and try again');
    });
  } catch (err) {
    console.error('Camera init error:', err);
    html5QrCode = null;
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
    const body   = { token };
    if (state.scannerEventId) body.event_id = state.scannerEventId;
    const result = await api('POST', '/guests/scan', body);
    handleScanResult(result);
  } catch (e) {
    setScanResult('invalid', '❌', 'Error', e.message);
    playSound('error');
  }
  setTimeout(() => { state.scanCooldown = false; }, 2500);
}

function handleScanResult(result) {
  if (result.result === 'granted') {
    const name  = result.guest ? result.guest.name : '';
    const table = result.guest && result.guest.table_number ? ` · ${result.guest.table_number}` : '';
    setScanResult('granted', '✅', 'Access Granted', name + table, result.guest ? result.guest.checked_in_at : '');
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
    let url = `/guests/search?q=${encodeURIComponent(query)}`;
    if (state.scannerEventId) url += `&event_id=${state.scannerEventId}`;
    const guests = await api('GET', url);
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
  el.innerHTML = '';
  el.classList.remove('hidden');
  guests.slice(0, 5).forEach(g => {
    const item = document.createElement('div');
    item.className = 'manual-result-item';
    item.innerHTML = `
      <div class="manual-result-info">
        <div class="name">${escHtml(g.name)}</div>
        <div class="phone">${g.phone ? escHtml(g.phone) : '—'}</div>
      </div>
      <div style="display:flex;align-items:center;gap:0.5rem;">
        <span class="badge ${g.status === 'used' ? 'badge-used' : 'badge-unused'}">
          ${g.status === 'used' ? '✅ In' : '⏳ Pending'}
        </span>
      </div>`;
    if (g.status !== 'used') {
      const checkBtn = document.createElement('button');
      checkBtn.className = 'btn btn-success btn-sm';
      checkBtn.textContent = 'Check In';
      checkBtn.addEventListener('click', () => manualCheckIn(g.qr_token));
      item.querySelector('div[style]').appendChild(checkBtn);
    }
    el.appendChild(item);
  });
}

async function manualCheckIn(token) {
  if (!confirm('Check in this guest?')) return;
  try {
    const body = { token };
    if (state.scannerEventId) body.event_id = state.scannerEventId;
    const result = await api('POST', '/guests/scan', body);
    handleScanResult(result);
    const query = $('#manual-search-input') ? $('#manual-search-input').value : '';
    if (query) await manualSearch(query);
  } catch (e) {
    setScanResult('invalid', '❌', 'Error', e.message);
  }
}

// ── Settings ─────────────────────────────────────────────────
async function fetchSettings() {
  try {
    const settings = await api('GET', '/settings');
    if (settings.beem_api_key)    { const el = $('#beem-api-key');    if (el) el.value = settings.beem_api_key; }
    if (settings.beem_secret_key) { const el = $('#beem-secret-key'); if (el) el.value = settings.beem_secret_key; }
    if (settings.beem_sender_id)  { const el = $('#beem-sender-id');  if (el) el.value = settings.beem_sender_id; }
    if (settings.app_url)         { const el = $('#app-url');         if (el) el.value = settings.app_url; }
  } catch (e) { console.error('Settings error:', e); }
}

async function saveBeemSettings() {
  const apiKey   = $('#beem-api-key')    ? $('#beem-api-key').value.trim()    : '';
  const secret   = $('#beem-secret-key') ? $('#beem-secret-key').value.trim() : '';
  const senderId = $('#beem-sender-id')  ? $('#beem-sender-id').value.trim()  : '';
  const appUrl   = $('#app-url')         ? $('#app-url').value.trim()         : '';
  const sucEl    = $('#beem-success');

  try {
    await api('POST', '/settings/bulk', {
      settings: {
        beem_api_key:    apiKey,
        beem_secret_key: secret,
        beem_sender_id:  senderId,
        app_url:         appUrl
      }
    });
    showAlert(sucEl, 'SMS settings saved!', 'success');
  } catch (e) {
    alert('Failed to save settings: ' + e.message);
  }
}

// ── Scanner Accounts ─────────────────────────────────────────
async function fetchScannerAccounts() {
  const el = $('#scanners-list');
  if (!el) return;
  try {
    const users = await api('GET', '/users');
    if (!users.length) {
      el.innerHTML = '<p class="hint-text">No scanner accounts yet. Add one above.</p>';
      return;
    }
    el.innerHTML = `
      <table class="guests-table">
        <thead><tr><th>Username</th><th>Role</th><th>Created</th><th>Action</th></tr></thead>
        <tbody>
          ${users.map(u => `
            <tr>
              <td><strong>${escHtml(u.username)}</strong></td>
              <td><span class="badge badge-unused">Scanner</span></td>
              <td>${formatDateTime(u.createdAt)}</td>
              <td><button class="btn btn-danger btn-sm js-del-scanner" data-id="${u._id}" data-username="${escHtml(u.username)}">🗑 Remove</button></td>
            </tr>`).join('')}
        </tbody>
      </table>`;
    el.querySelectorAll('.js-del-scanner').forEach(btn => {
      btn.addEventListener('click', () => deleteScanner(btn.dataset.id, btn.dataset.username));
    });
  } catch (e) { console.error('Fetch scanners error:', e); }
}

async function deleteScanner(id, username) {
  if (!confirm(`Remove scanner account "${username}"? They will no longer be able to log in.`)) return;
  try {
    await api('DELETE', `/users/${id}`);
    fetchScannerAccounts();
  } catch (e) { alert('Failed to remove: ' + e.message); }
}

// ── Activity Log ─────────────────────────────────────────────
async function fetchActivityLog() {
  const filter        = $('#activity-filter')         ? $('#activity-filter').value         : '';
  const scannerFilter = $('#activity-scanner-filter') ? $('#activity-scanner-filter').value.trim() : '';
  let url = '/activity?limit=200';
  if (filter) url += `&action=${filter}`;
  if (state.currentEvent) url += `&event_id=${gid(state.currentEvent)}`;
  try {
    let logs = await api('GET', url);
    if (scannerFilter) {
      logs = logs.filter(l => l.scanned_by && l.scanned_by.toLowerCase().includes(scannerFilter.toLowerCase()));
    }
    renderActivityLog(logs);
  } catch (e) { console.error('Activity log error:', e); }
}

function renderActivityLog(logs) {
  const el = $('#activity-list');
  if (!el) return;
  if (!logs.length) {
    el.innerHTML = '<div class="empty-state">No activity recorded yet</div>';
    return;
  }
  const icons = { granted: '✅', used: '🚫', invalid: '❓', reset: '↩' };
  el.innerHTML = logs.map(log => `
    <div class="activity-item action-${log.action}">
      <div class="activity-icon">${icons[log.action] || '📋'}</div>
      <div class="activity-info">
        <div class="activity-main">
          ${log.action === 'granted' ? 'Checked in' :
            log.action === 'used'    ? 'Duplicate scan' :
            log.action === 'invalid' ? 'Invalid QR scanned' :
            log.action === 'reset'   ? 'Check-in reset' : escHtml(log.action)}
          ${log.guest_name ? ` — <strong>${escHtml(log.guest_name)}</strong>` : ''}
        </div>
        <div class="activity-sub">
          By: ${escHtml(log.scanned_by || '—')}
          ${log.note ? ` · ${escHtml(log.note)}` : ''}
        </div>
      </div>
      <div class="activity-time">${formatDateTime(log.createdAt)}</div>
    </div>`).join('');
}

// ── Tab Navigation ───────────────────────────────────────────
function switchTab(tabId) {
  $$('.nav-tab').forEach(t => t.classList.remove('active'));
  $$('.tab-content').forEach(t => t.classList.add('hidden'));

  const activeTab = $(`[data-tab="${tabId}"]`);
  if (activeTab) activeTab.classList.add('active');
  const activeContent = $(`#${tabId}`);
  if (activeContent) activeContent.classList.remove('hidden');

  if (tabId === 'tab-events')   fetchEvents();
  if (tabId === 'tab-overview') { fetchStats(); renderRecentCheckins(); }
  if (tabId === 'tab-guests')   fetchGuests();
  if (tabId === 'tab-send')     loadSendTab();
  if (tabId === 'tab-activity') fetchActivityLog();
  if (tabId === 'tab-settings') { fetchSettings(); fetchScannerAccounts(); }
}

// ── Init ─────────────────────────────────────────────────────
async function init() {
  const user = await checkAuth();
  if (user) {
    state.user = user;
    if (user.role === 'admin') initAdmin();
    else initScannerPage();
  } else {
    showPage('page-login');
  }

  const loginForm = $('#login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn     = $('#login-btn');
      const errEl   = $('#login-error');
      const btnText = btn ? btn.querySelector('.btn-text') : null;
      hideAlert(errEl);
      if (btn) btn.disabled = true;
      if (btnText) btnText.textContent = 'Signing in…';
      try {
        const user = await login($('#username').value, $('#password').value);
        state.user = user;
        if (user.role === 'admin') initAdmin();
        else initScannerPage();
      } catch (e) {
        showAlert(errEl, e.message);
      } finally {
        if (btn) btn.disabled = false;
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

  // Hide event-specific tabs until an event is opened
  $$('.nav-tab[data-tab="tab-overview"], .nav-tab[data-tab="tab-guests"], .nav-tab[data-tab="tab-add"], .nav-tab[data-tab="tab-send"], .nav-tab[data-tab="tab-activity"]')
    .forEach(t => t.classList.add('hidden'));

  fetchEvents();

  // Nav tabs
  $$('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Logout
  const logoutBtn = $('#admin-logout');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  // ── Create/Edit Event Modal ──────────────────────────────
  const createEventBtn = $('#create-event-btn');
  if (createEventBtn) {
    createEventBtn.addEventListener('click', () => {
      const modal = $('#event-modal');
      if (!modal) return;
      $('#event-modal-title').textContent = 'Create New Event';
      $('#event-modal-save').textContent  = 'Create Event';
      $('#ev-name').value   = '';
      $('#ev-client').value = '';
      $('#ev-date').value   = '';
      $('#ev-venue').value  = '';
      $('#ev-color').value  = '#7c3aed';
      delete modal.dataset.editId;
      hideAlert($('#event-modal-error'));
      modal.classList.remove('hidden');
    });
  }

  const eventModalSave = $('#event-modal-save');
  if (eventModalSave) {
    eventModalSave.addEventListener('click', async () => {
      const modal  = $('#event-modal');
      const errEl  = $('#event-modal-error');
      const name   = $('#ev-name').value.trim();
      const client = $('#ev-client').value.trim();
      const date   = $('#ev-date').value;
      const venue  = $('#ev-venue').value.trim();
      const color  = $('#ev-color').value;
      hideAlert(errEl);
      if (!name) { showAlert(errEl, 'Event name is required'); return; }
      try {
        const editId = modal.dataset.editId;
        if (editId) {
          await api('PUT', `/events/${editId}`, { name, client_name: client, date, venue, color });
          // Update currentEvent if it's the one being edited
          if (state.currentEvent && gid(state.currentEvent) === editId) {
            state.currentEvent = { ...state.currentEvent, name, client_name: client, date, venue, color };
            updateBreadcrumbs();
          }
        } else {
          await createEvent({ name, client_name: client, date, venue, color });
        }
        modal.classList.add('hidden');
        fetchEvents();
      } catch (e) {
        showAlert(errEl, e.message);
      }
    });
  }

  const eventModalClose   = $('#event-modal-close');
  const eventModalOverlay = $('#event-modal-overlay');
  if (eventModalClose)   eventModalClose.addEventListener('click',   () => $('#event-modal').classList.add('hidden'));
  if (eventModalOverlay) eventModalOverlay.addEventListener('click', () => $('#event-modal').classList.add('hidden'));

  // ── Guest Search ─────────────────────────────────────────
  let searchTimer;
  const guestSearch = $('#guest-search');
  if (guestSearch) {
    guestSearch.addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => fetchGuests(e.target.value), 300);
    });
  }

  // ── Export / Download All QR / Delete All ────────────────
  const exportBtn = $('#export-btn');
  if (exportBtn) exportBtn.addEventListener('click', exportCSV);

  const dlAllBtn = $('#download-all-qr-btn');
  if (dlAllBtn) dlAllBtn.addEventListener('click', () => {
    if (!state.currentEvent) { alert('Please open an event first.'); return; }
    downloadAllQR();
  });

  const deleteAllBtn = $('#delete-all-btn');
  if (deleteAllBtn) {
    deleteAllBtn.addEventListener('click', async () => {
      if (!state.currentEvent) { alert('Please open an event first.'); return; }
      const total = state.guests.length;
      if (total === 0) { alert('No guests to delete.'); return; }
      if (!confirm(`Delete ALL ${total} guests from "${state.currentEvent.name}"? This cannot be undone.`)) return;
      if (!confirm(`Are you absolutely sure? This will permanently delete all ${total} guests and their QR codes.`)) return;
      try {
        await api('DELETE', `/guests/all?event_id=${gid(state.currentEvent)}`);
        await fetchGuests();
        await fetchStats();
      } catch (e) {
        alert('Failed to delete all guests: ' + e.message);
      }
    });
  }

  // ── Add Guest Form ───────────────────────────────────────
  const addGuestForm = $('#add-guest-form');
  if (addGuestForm) {
    addGuestForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!state.currentEvent) { alert('Please open an event first.'); return; }
      const errEl = $('#add-guest-error');
      const sucEl = $('#add-guest-success');
      hideAlert(errEl);
      hideAlert(sucEl);
      const name  = $('#guest-name').value.trim();
      const phone = $('#guest-phone').value.trim();
      const table = $('#guest-table') ? $('#guest-table').value.trim() : '';
      const eventId = gid(state.currentEvent);

      // Duplicate name check scoped to event
      try {
        const dup = await api('GET', `/guests/check-duplicate?name=${encodeURIComponent(name)}&event_id=${eventId}`);
        if (dup.exists) {
          const proceed = confirm(`A guest named "${name}" already exists in this event. Add anyway?`);
          if (!proceed) return;
        }
      } catch (e) { /* ignore */ }

      try {
        const guest = await addGuest(name, phone, table, eventId);
        showAlert(sucEl, `Guest "${guest.name}" added successfully!`, 'success');
        addGuestForm.reset();
        await showNewGuestQR(guest);
        fetchStats();
      } catch (err) {
        showAlert(errEl, err.message);
      }
    });
  }

  // ── QR Modal Close ───────────────────────────────────────
  const qrClose   = $('#qr-modal-close');
  const qrOverlay = $('#qr-modal-overlay');
  if (qrClose)   qrClose.addEventListener('click',   () => $('#qr-modal').classList.add('hidden'));
  if (qrOverlay) qrOverlay.addEventListener('click', () => $('#qr-modal').classList.add('hidden'));

  const vqrClose   = $('#view-qr-modal-close');
  const vqrOverlay = $('#view-qr-modal-overlay');
  if (vqrClose)   vqrClose.addEventListener('click',   () => $('#view-qr-modal').classList.add('hidden'));
  if (vqrOverlay) vqrOverlay.addEventListener('click', () => $('#view-qr-modal').classList.add('hidden'));

  // ── CSV File / Drop / Bulk Import ────────────────────────
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
          state.csvData.slice(0, 5).map(g => `• ${escHtml(g.name)}${g.phone ? ` (${escHtml(g.phone)})` : ''}${g.table_number ? ` [${escHtml(g.table_number)}]` : ''}`).join('<br>') +
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
      if (!state.currentEvent) { alert('Please open an event first.'); return; }
      const errEl = $('#bulk-error');
      const sucEl = $('#bulk-success');
      hideAlert(errEl);
      hideAlert(sucEl);
      bulkBtn.disabled    = true;
      bulkBtn.textContent = 'Importing…';
      try {
        const created = await api('POST', '/guests/bulk', {
          guests:   state.csvData,
          event_id: gid(state.currentEvent)
        });
        showAlert(sucEl, `Successfully imported ${created.length} guests!`, 'success');
        state.csvData = [];
        const preview = $('#csv-preview');
        if (preview) preview.classList.add('hidden');
        if (csvFile) csvFile.value = '';
        bulkBtn.disabled    = false;
        bulkBtn.textContent = 'Import Guests';
        fetchStats();
      } catch (err) {
        showAlert(errEl, err.message);
        bulkBtn.disabled    = false;
        bulkBtn.textContent = 'Import Guests';
      }
    });
  }

  // ── Beem Settings ────────────────────────────────────────
  const saveBeemBtn = $('#save-beem-btn');
  if (saveBeemBtn) saveBeemBtn.addEventListener('click', saveBeemSettings);

  // ── Send Invites ─────────────────────────────────────────
  const sendAllSmsBtn = $('#send-all-sms-btn');
  if (sendAllSmsBtn) sendAllSmsBtn.addEventListener('click', sendAllSMS);

  const sendAllWaBtn = $('#send-all-wa-btn');
  if (sendAllWaBtn) sendAllWaBtn.addEventListener('click', sendAllWhatsApp);

  // ── Activity Log Controls ────────────────────────────────
  const refreshActivityBtn = $('#refresh-activity-btn');
  const clearActivityBtn   = $('#clear-activity-btn');
  const activityFilter     = $('#activity-filter');
  const activityScannerFilter = $('#activity-scanner-filter');

  if (refreshActivityBtn) refreshActivityBtn.addEventListener('click', fetchActivityLog);
  if (activityFilter)     activityFilter.addEventListener('change', fetchActivityLog);
  if (activityScannerFilter) {
    let scannerFilterTimer;
    activityScannerFilter.addEventListener('input', () => {
      clearTimeout(scannerFilterTimer);
      scannerFilterTimer = setTimeout(fetchActivityLog, 300);
    });
  }
  if (clearActivityBtn) {
    clearActivityBtn.addEventListener('click', async () => {
      if (!confirm('Clear all activity logs? This cannot be undone.')) return;
      try {
        await api('DELETE', '/activity');
        fetchActivityLog();
      } catch (e) { alert('Failed to clear logs: ' + e.message); }
    });
  }

  // ── Change Admin Password ────────────────────────────────
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
        $('#admin-new-pw').value     = '';
        $('#admin-confirm-pw').value = '';
      } catch (e) { showAlert(errEl, e.message); }
    });
  }

  // ── Change Scanner Password ──────────────────────────────
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
        $('#scanner-new-pw').value    = '';
        $('#scanner-confirm-pw').value = '';
      } catch (e) { showAlert(errEl, e.message); }
    });
  }

  // ── Add Scanner Account ──────────────────────────────────
  const addScannerBtn = $('#add-scanner-btn');
  if (addScannerBtn) {
    addScannerBtn.addEventListener('click', async () => {
      const username = $('#new-scanner-username').value.trim();
      const password = $('#new-scanner-password').value;
      const errEl    = $('#new-scanner-error');
      const sucEl    = $('#new-scanner-success');
      hideAlert(errEl); hideAlert(sucEl);
      if (!username) { showAlert(errEl, 'Username is required'); return; }
      if (!password || password.length < 6) { showAlert(errEl, 'Password must be at least 6 characters'); return; }
      try {
        await api('POST', '/users', { username, password });
        showAlert(sucEl, `Scanner account "${username}" created!`, 'success');
        $('#new-scanner-username').value = '';
        $('#new-scanner-password').value = '';
        fetchScannerAccounts();
      } catch (e) { showAlert(errEl, e.message); }
    });
  }

  // ── Socket.io — Real-time Updates ───────────────────────
  socket.on('guest_checked_in', (guest) => {
    // Only update if this guest belongs to the currently open event
    if (!state.currentEvent) return;
    if (guest.event_id && String(guest.event_id) !== String(gid(state.currentEvent))) return;
    addRecentCheckin(guest);
    refreshGuestRow(guest);
    fetchStats();
  });

  socket.on('guest_reset', (data) => {
    if (!state.currentEvent) return;
    if (data && data.event_id && String(data.event_id) !== String(gid(state.currentEvent))) return;
    const search = $('#guest-search') ? $('#guest-search').value : '';
    fetchGuests(search);
    fetchStats();
  });

  // ── Keep-alive ping every 10 minutes ────────────────────
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
