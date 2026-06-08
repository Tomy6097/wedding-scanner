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

    if (type === 'success') {
      // Three ascending beeps — clear and loud
      [0, 0.15, 0.3].forEach((delay, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime([523, 659, 784][i], ctx.currentTime + delay);
        gain.gain.setValueAtTime(0, ctx.currentTime + delay);
        gain.gain.linearRampToValueAtTime(0.8, ctx.currentTime + delay + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.18);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.18);
      });
    } else {
      // Two descending beeps — distinct error sound
      [0, 0.2].forEach((delay, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'square';
        osc.frequency.setValueAtTime([380, 280][i], ctx.currentTime + delay);
        gain.gain.setValueAtTime(0, ctx.currentTime + delay);
        gain.gain.linearRampToValueAtTime(0.6, ctx.currentTime + delay + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.2);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.2);
      });
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
async function fetchEvents(filter = 'all') {
  try {
    const events = await api('GET', '/events');
    const filtered = filter === 'all' ? events :
                     events.filter(ev => ev.status === filter);
    renderEventsGrid(filtered);
  } catch (e) {
    const grid = $('#events-grid');
    if (grid) grid.innerHTML = '<div class="empty-state">Failed to load events</div>';
    console.error('fetchEvents error:', e);
  }
}

function renderEventsGrid(events) {
  // Use table instead of cards
  const tbody = $('#events-tbody');
  if (!tbody) return;

  if (!events.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No events yet. Create your first event.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  events.forEach(ev => {
    const total     = ev.total     || 0;
    const checkedIn = ev.checkedIn || 0;
    const pct       = total > 0 ? Math.round((checkedIn / total) * 100) : 0;
    const dateStr   = ev.date ? new Date(ev.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="event-name-cell">${escHtml(ev.name)}</div>
        ${ev.has_pin ? `<span style="font-size:0.7rem;color:var(--gray-400)">PIN protected</span>` : ''}
      </td>
      <td class="event-client-cell">${ev.client_name ? escHtml(ev.client_name) : '—'}</td>
      <td style="white-space:nowrap;font-size:0.82rem">${dateStr}</td>
      <td style="font-size:0.82rem;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${ev.venue ? escHtml(ev.venue) : '—'}</td>
      <td style="font-weight:700">${total}</td>
      <td>
        <div style="display:flex;align-items:center;gap:0.5rem">
          <div class="progress-bar" style="flex:1;height:6px;min-width:60px">
            <div class="progress-fill" style="width:${pct}%"></div>
          </div>
          <span style="font-size:0.75rem;color:var(--gray-500);white-space:nowrap">${checkedIn}/${total}</span>
        </div>
      </td>
      <td>
        <span class="badge ${ev.status === 'active' ? 'badge-unused' : 'badge-used'}"
          style="${ev.status === 'active' ? 'background:#dcfce7;color:#166534' : ''}">
          ${ev.status === 'active' ? 'Active' : ev.status === 'completed' ? 'Completed' : escHtml(ev.status)}
        </span>
      </td>
      <td class="event-actions-cell"></td>`;

    // Build actions
    const actionsCell = tr.querySelector('.event-actions-cell');
    const actDiv = document.createElement('div');
    actDiv.className = 'event-actions';

    const openBtn = document.createElement('button');
    openBtn.className = 'btn btn-primary btn-sm';
    openBtn.textContent = 'Open';
    openBtn.addEventListener('click', (e) => { e.stopPropagation(); openEvent(ev); });
    actDiv.appendChild(openBtn);

    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-outline btn-sm';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', (e) => { e.stopPropagation(); editEvent(ev); });
    actDiv.appendChild(editBtn);

    const menuBtn = document.createElement('button');
    menuBtn.className = 'btn btn-ghost btn-sm card-menu-btn';
    menuBtn.innerHTML = '⋯';
    menuBtn.title = 'More options';

    const dropdown = document.createElement('div');
    dropdown.className = 'card-dropdown js-dropdown';
    dropdown.innerHTML = `
      <button class="card-dropdown-item js-status-btn">${ev.status === 'active' ? 'Mark complete' : 'Reactivate'}</button>
      <div class="card-dropdown-divider"></div>
      <button class="card-dropdown-item danger js-delete-btn">Delete</button>`;

    dropdown.querySelector('.js-status-btn').addEventListener('click', (e) => { e.stopPropagation(); toggleEventStatus(gid(ev), ev.status, ev.name); });
    dropdown.querySelector('.js-delete-btn').addEventListener('click', (e) => { e.stopPropagation(); deleteEvent(gid(ev), ev.name); });

    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      $$('.card-dropdown.open').forEach(d => { if (d !== dropdown) d.classList.remove('open'); });
      dropdown.classList.toggle('open');
    });

    const menuWrap = document.createElement('div');
    menuWrap.style.position = 'relative';
    menuWrap.appendChild(menuBtn);
    menuWrap.appendChild(dropdown);
    actDiv.appendChild(menuWrap);
    actionsCell.appendChild(actDiv);

    // Click row to open event
    tr.addEventListener('click', () => openEvent(ev));
    tbody.appendChild(tr);
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function openEvent(event) {
  state.currentEvent = event;
  state.recentCheckins = [];

  // Show event nav items in sidebar
  $$('.nav-item[data-tab="tab-overview"], .nav-item[data-tab="tab-guests"], .nav-item[data-tab="tab-add"], .nav-item[data-tab="tab-send"], .nav-item[data-tab="tab-card"], .nav-item[data-tab="tab-activity"]')
    .forEach(t => { t.classList.remove('hidden'); t.style.display = ''; });

  // Update current event label in sidebar
  const labelEl = $('#sidebar-event-label');
  if (labelEl) labelEl.textContent = event.name;
  const sectionEl = $('#event-nav-section');
  if (sectionEl) { sectionEl.style.display = 'block'; }

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

  // Hide event nav items
  $$('.nav-item[data-tab="tab-overview"], .nav-item[data-tab="tab-guests"], .nav-item[data-tab="tab-add"], .nav-item[data-tab="tab-send"], .nav-item[data-tab="tab-card"], .nav-item[data-tab="tab-activity"]')
    .forEach(t => { t.classList.add('hidden'); t.style.display = 'none'; });

  const sectionEl = $('#event-nav-section');
  if (sectionEl) sectionEl.style.display = 'none';

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
  if ($('#ev-pin')) $('#ev-pin').value = event.pin || '';
  modal.dataset.editId  = gid(event);
  hideAlert($('#event-modal-error'));
  modal.classList.remove('hidden');
}

async function toggleEventStatus(id, currentStatus, name) {
  const newStatus = currentStatus === 'active' ? 'completed' : 'active';
  const msg = newStatus === 'completed'
    ? `Mark "${name}" as completed? Scanners will no longer see it.`
    : `Reactivate "${name}"? Scanners will see it again.`;
  if (!confirm(msg)) return;
  try {
    await api('PUT', `/events/${id}`, { status: newStatus });
    fetchEvents();
  } catch (e) {
    alert('Failed: ' + e.message);
  }
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
          ${g.status === 'used' ? 'Checked In' : 'Pending'}
        </span>
        ${g.status === 'used' && g.checked_in_at ? `<div style="font-size:0.75rem;color:var(--gray-400)">${formatDateTime(g.checked_in_at)}</div>` : ''}
      </td>
      <td>${g.sms_sent ? '<span style="color:var(--gray-500);font-size:0.75rem">Sent</span>' : '<span style="color:var(--gray-300)">—</span>'}</td>
      <td class="table-actions-cell"></td>`;

    // Build actions cell safely
    const actionsCell = tr.querySelector('.table-actions-cell');
    const actionsDiv  = document.createElement('div');
    actionsDiv.className = 'table-actions';

    const qrBtn = document.createElement('button');
    qrBtn.className = 'btn btn-outline btn-sm';
    qrBtn.title = 'View QR Code';
    qrBtn.innerHTML = '<i data-lucide="qr-code" style="width:13px;height:13px"></i>';
    qrBtn.addEventListener('click', () => viewGuestQR(gid(g)));
    actionsDiv.appendChild(qrBtn);

    const linkBtn = document.createElement('button');
    linkBtn.className = 'btn btn-outline btn-sm';
    linkBtn.title = 'Copy guest link';
    linkBtn.innerHTML = '<i data-lucide="link" style="width:13px;height:13px"></i>';
    linkBtn.addEventListener('click', () => copyGuestLink(g.qr_token));
    actionsDiv.appendChild(linkBtn);

    const waBtn = document.createElement('button');
    waBtn.className = 'btn btn-outline btn-sm';
    waBtn.title = 'Share via WhatsApp';
    waBtn.innerHTML = '<i data-lucide="message-circle" style="width:13px;height:13px"></i>';
    waBtn.addEventListener('click', () => shareGuestWhatsApp(g.qr_token, g.name, g.phone || ''));
    actionsDiv.appendChild(waBtn);

    const smsBtn = document.createElement('button');
    smsBtn.className = 'btn btn-outline btn-sm';
    smsBtn.title = 'Send SMS';
    smsBtn.innerHTML = '<i data-lucide="smartphone" style="width:13px;height:13px"></i>';
    smsBtn.addEventListener('click', () => sendSingleSMS(gid(g), g.name));
    actionsDiv.appendChild(smsBtn);

    if (g.status === 'used') {
      const resetBtn = document.createElement('button');
      resetBtn.className = 'btn btn-outline btn-sm';
      resetBtn.title = 'Reset check-in';
      resetBtn.innerHTML = '<i data-lucide="rotate-ccw" style="width:13px;height:13px"></i>';
      resetBtn.addEventListener('click', () => resetCheckin(gid(g), g.name));
      actionsDiv.appendChild(resetBtn);
    }

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-ghost btn-sm';
    delBtn.title = 'Delete guest';
    delBtn.style.color = 'var(--error)';
    delBtn.innerHTML = '<i data-lucide="trash-2" style="width:13px;height:13px"></i>';
    delBtn.addEventListener('click', () => deleteGuest(gid(g), g.name));
    actionsDiv.appendChild(delBtn);

    const histBtn = document.createElement('button');
    histBtn.className = 'btn btn-outline btn-sm';
    histBtn.title = 'View scan history';
    histBtn.innerHTML = '<i data-lucide="clock" style="width:13px;height:13px"></i>';
    histBtn.addEventListener('click', () => viewGuestHistory(gid(g), g.name));
    actionsDiv.appendChild(histBtn);

    actionsCell.appendChild(actionsDiv);
    tbody.appendChild(tr);
  });
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function refreshGuestRow(guest) {
  const row = $(`#guest-row-${gid(guest)}`);
  if (!row) return;
  const cells = row.querySelectorAll('td');
  // Status cell is index 5
  if (cells[5]) {
    cells[5].innerHTML = `<span class="badge badge-used">Checked In</span>
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

    // Check if event has card template
    const ev = state.currentEvent;
    if (ev && ev.card_image && ev.card_qr_x != null) {
      // Show card with QR overlaid
      const cardDataUrl = await generateGuestCard(
        { name: guest.name },
        data.qrDataUrl,
        { image: ev.card_image, qr_x: ev.card_qr_x, qr_y: ev.card_qr_y, qr_size: ev.card_qr_size || 20 }
      );
      const container = $('#view-qr-card-preview');
      if (container) {
        container.innerHTML = `<div style="text-align:center"><img src="${cardDataUrl}" style="max-width:100%;border-radius:8px" /></div>`;
        container.dataset.qrDataUrl = cardDataUrl;
      }
    } else {
      showQRCard(data, '#view-qr-card-preview');
    }

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

  // Show ONLY the plain QR image — no text, no code, no decoration
  container.innerHTML = `
    <div style="text-align:center;padding:0.5rem">
      <img src="${data.qrDataUrl}" alt="QR Code"
        style="width:220px;height:220px;display:block;margin:0 auto;border:1px solid #e5e7eb;border-radius:4px" />
    </div>`;

  container.dataset.qrDataUrl = data.qrDataUrl;
  container.dataset.guestName = (data.guest || data).name || '';
  return container;
}

// ── Download QR Card (canvas) ────────────────────────────────
function downloadQRCard(guestName, containerSelector) {
  const container = $(containerSelector);
  if (!container) return;

  // If container has a stored qrDataUrl (card template case), download that directly
  if (container.dataset.qrDataUrl) {
    const link = document.createElement('a');
    link.download = `card-${guestName.replace(/\s+/g, '-').toLowerCase()}.png`;
    link.href = container.dataset.qrDataUrl;
    link.click();
    return;
  }

  // Fallback: find any img in container
  const imgEl = container.querySelector('img');
  if (!imgEl || !imgEl.src) return;

  const SIZE = 300;
  const canvas = document.createElement('canvas');
  canvas.width  = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');

  const qrImg = new Image();
  qrImg.crossOrigin = 'anonymous';
  qrImg.onload = () => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.drawImage(qrImg, 0, 0, SIZE, SIZE);
    const link = document.createElement('a');
    link.download = `qr-${guestName.replace(/\s+/g, '-').toLowerCase()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };
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
    const guests = await api('GET', `/guests?event_id=${eventId}`);
    const withPhone   = guests.filter(g => g.phone && g.phone.trim()).length;
    const alreadySent = guests.filter(g => g.sms_sent).length;
    const notSent     = withPhone - alreadySent;
    const ev = state.currentEvent;

    const smsStatsEl = $('#sms-stats');
    if (smsStatsEl) {
      smsStatsEl.innerHTML = `
        <div class="sms-stat-row"><span>Guests with phone:</span><strong>${withPhone}</strong></div>
        <div class="sms-stat-row"><span>SMS already sent:</span><strong>${alreadySent}</strong></div>
        <div class="sms-stat-row"><span>Not sent yet:</span><strong>${notSent}</strong></div>`;
    }

    // Update invite template status
    const inviteStatus = $('#invite-template-status');
    if (inviteStatus) {
      inviteStatus.textContent = ev.invite_image
        ? `Template set. ${withPhone} guests with phone numbers.`
        : 'No invitation template set. Go to Card Template tab to upload one.';
      inviteStatus.style.color = ev.invite_image ? 'var(--success)' : 'var(--gray-500)';
    }

    // Update thanks template status
    const thanksStatus = $('#thanks-template-status');
    if (thanksStatus) {
      thanksStatus.textContent = ev.thanks_image
        ? `Template set. ${withPhone} guests with phone numbers.`
        : 'No thank you template set. Go to Card Template tab to upload one.';
      thanksStatus.style.color = ev.thanks_image ? 'var(--success)' : 'var(--gray-500)';
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

    const eventName = state.currentEvent.name;
    const origin    = window.location.origin;

    // Build CSV with name, phone, personal link, code
    const rows = [['Name', 'Phone', 'Invitation Link', 'Check-in Code']];
    withPhone.forEach(g => {
      const code = (g.unique_id || '').substring(0, 8).toUpperCase();
      const link = `${origin}/guest/${g.qr_token}`;
      rows.push([g.name, g.phone.trim(), link, code]);
    });
    const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `${eventName.replace(/\s+/g,'-')}-invitations.csv`;
    a.click();

    setTimeout(() => {
      alert(
        `✅ CSV downloaded!\n\n` +
        `The file contains:\n` +
        `• Guest name\n` +
        `• Phone number\n` +
        `• Personal invitation link\n` +
        `• Check-in code\n\n` +
        `Open it in Excel or Google Sheets to see all guests.\n` +
        `Send each guest their personal link via WhatsApp.`
      );
    }, 500);

  } catch (e) {
    alert('Failed: ' + e.message);
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

async function generateAndDownloadCard(g) {
  // If event has a card template, use it; otherwise plain QR
  if (g.cardTemplate && g.cardTemplate.image && g.cardTemplate.qr_x != null) {
    const dataUrl = await generateGuestCard(g, g.qrDataUrl, g.cardTemplate);
    const link = document.createElement('a');
    link.download = `card-${g.name.replace(/\s+/g, '-').toLowerCase()}.png`;
    link.href = dataUrl;
    link.click();
    return;
  }

  // Plain QR only
  return new Promise((resolve) => {
    const SIZE = 300;
    const canvas = document.createElement('canvas');
    canvas.width  = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    const qrImg = new Image();
    qrImg.crossOrigin = 'anonymous';
    qrImg.onload = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.drawImage(qrImg, 0, 0, SIZE, SIZE);
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

  // Scanner only sees active events
  const activeEvents = events.filter(ev => ev.status === 'active');

  if (!activeEvents.length) {
    listEl.innerHTML = '<div class="empty-state">No active events found. Ask admin to create or activate an event.</div>';
    return;
  }
  listEl.innerHTML = '';
  activeEvents.forEach(ev => {
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
        ${dateStr ? `<span>${escHtml(dateStr)}</span>` : ''}
        ${ev.venue ? `<span>${escHtml(ev.venue)}</span>` : ''}
      </div>
      <div class="event-card-stats">
        <div class="event-stat"><span class="event-stat-value">${ev.total || 0}</span><span class="event-stat-label">Guests</span></div>
        <div class="event-stat"><span class="event-stat-value">${ev.checkedIn || 0}</span><span class="event-stat-label">Arrived</span></div>
        <div class="event-stat"><span class="event-stat-value">${ev.remaining || 0}</span><span class="event-stat-label">Pending</span></div>
      </div>
      <div style="text-align:center;margin-top:0.5rem">
        <span class="btn btn-primary btn-sm">${ev.has_pin ? 'Enter PIN' : 'Select'}</span>
      </div>`;
    card.addEventListener('click', () => selectScannerEvent(ev));
    listEl.appendChild(card);
  });
}

function selectScannerEvent(event) {
  // Show PIN prompt only if event has a PIN set
  if (event.has_pin) {
    showPinPrompt(event);
  } else {
    proceedWithEvent(event);
  }
}

function showPinPrompt(event) {
  const modal    = $('#pin-modal');
  const nameEl   = $('#pin-event-name');
  const inputEl  = $('#pin-input');
  const errEl    = $('#pin-error');
  const submitBtn = $('#pin-submit-btn');

  if (!modal) { proceedWithEvent(event); return; }

  if (nameEl) nameEl.textContent = event.name;
  if (inputEl) inputEl.value = '';
  hideAlert(errEl);
  modal.classList.remove('hidden');
  setTimeout(() => { if (inputEl) inputEl.focus(); }, 100);

  // Remove old listeners by cloning
  const newSubmit = submitBtn.cloneNode(true);
  submitBtn.parentNode.replaceChild(newSubmit, submitBtn);

  async function tryPin() {
    const pin = $('#pin-input') ? $('#pin-input').value.trim() : '';
    hideAlert($('#pin-error'));
    try {
      await api('POST', `/events/${gid(event)}/verify-pin`, { pin });
      modal.classList.add('hidden');
      proceedWithEvent(event);
    } catch (e) {
      showAlert($('#pin-error'), e.message || 'Incorrect PIN');
      if ($('#pin-input')) $('#pin-input').value = '';
    }
  }

  $('#pin-submit-btn').addEventListener('click', tryPin);
  if ($('#pin-input')) {
    const newInput = $('#pin-input').cloneNode(true);
    $('#pin-input').parentNode.replaceChild(newInput, $('#pin-input'));
    $('#pin-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') tryPin(); });
  }

  // Close on overlay click
  const overlay = $('#pin-modal-overlay');
  if (overlay) {
    const newOverlay = overlay.cloneNode(true);
    overlay.parentNode.replaceChild(newOverlay, overlay);
    $('#pin-modal-overlay').addEventListener('click', () => modal.classList.add('hidden'));
  }
}

function proceedWithEvent(event) {
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
      setScanResult('invalid', '<i data-lucide="camera-off"></i>', 'Camera Error', 'Please allow camera access and try again');
    });
  } catch (err) {
    console.error('Camera init error:', err);
    html5QrCode = null;
    setScanResult('invalid', '<i data-lucide="camera-off"></i>', 'Camera Error', 'Please allow camera access and try again');
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
    setScanResult('invalid', '<i data-lucide="alert-triangle"></i>', 'Error', e.message);
    playSound('error');
  }
  setTimeout(() => { state.scanCooldown = false; }, 2500);
}

function handleScanResult(result) {
  if (result.result === 'granted') {
    const name  = result.guest ? result.guest.name : '';
    const table = result.guest && result.guest.table_number ? ` · ${result.guest.table_number}` : '';
    setScanResult('granted', '<i data-lucide="check-circle"></i>', 'Access Granted', name + table, result.guest ? result.guest.checked_in_at : '');
    playSound('success');
    fetchScannerStats();
  } else if (result.result === 'used') {
    setScanResult('used', '<i data-lucide="x-circle"></i>', 'Already Checked In', result.guest ? result.guest.name : '', result.guest ? result.guest.checked_in_at : '');
    playSound('error');
  } else {
    setScanResult('invalid', '<i data-lucide="alert-circle"></i>', 'Invalid QR Code', 'This QR code is not recognized');
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
  iconEl.innerHTML = icon;
  if (typeof lucide !== 'undefined') lucide.createIcons();
  msgEl.textContent  = message;
  nameEl.textContent = name;
  timeEl.textContent = time ? `at ${formatDateTime(time)}` : '';
  setTimeout(() => {
    el.className       = 'scan-result scan-idle';
    iconEl.innerHTML = '<i data-lucide="scan-line"></i>';
    if (typeof lucide !== 'undefined') lucide.createIcons();
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
    setScanResult('invalid', '<i data-lucide="alert-triangle"></i>', 'Error', e.message);
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
  const icons = { granted: '<i data-lucide="check-circle" style="width:16px;height:16px;color:var(--success)"></i>', used: '<i data-lucide="x-circle" style="width:16px;height:16px;color:var(--error)"></i>', invalid: '<i data-lucide="alert-circle" style="width:16px;height:16px;color:var(--warning)"></i>', reset: '<i data-lucide="rotate-ccw" style="width:16px;height:16px;color:var(--primary)"></i>' };
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
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ── Bookings ─────────────────────────────────────────────────
async function fetchBookings() {
  const filter  = $('#booking-filter') ? $('#booking-filter').value : '';
  const listEl  = $('#bookings-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="empty-state">Loading...</div>';
  try {
    let bookings = await api('GET', '/bookings');
    if (filter) bookings = bookings.filter(b => b.status === filter);
    renderBookings(bookings);
  } catch (e) {
    listEl.innerHTML = `<div class="empty-state">Failed to load: ${e.message}</div>`;
  }
}

function renderBookings(bookings) {
  const listEl = $('#bookings-list');
  if (!listEl) return;
  if (!bookings.length) {
    listEl.innerHTML = '<div class="empty-state">No bookings yet. Share your landing page to get bookings!</div>';
    return;
  }

  const statusLabels = { new: '🆕 New', contacted: '📞 Contacted', confirmed: '✅ Confirmed', cancelled: '❌ Cancelled' };
  const statusBadge  = { new: 'badge-new', contacted: 'badge-contacted', confirmed: 'badge-confirmed', cancelled: 'badge-cancelled' };

  listEl.innerHTML = '';
  bookings.forEach(b => {
    const card = document.createElement('div');
    card.className = `booking-card status-${b.status}`;
    card.innerHTML = `
      <div class="booking-info">
        <div class="booking-name">${escHtml(b.name)}</div>
        <div class="booking-phone">📞<a href="tel:${escHtml(b.phone)}">${escHtml(b.phone)}</a>
          &nbsp;
         <a href="https://wa.me/${b.phone.replace(/\D/g,'')}" target="_blank" style="color:#25D366">💬 WhatsApp</a>
        </div>
        <div class="booking-meta">
          ${b.event_date ? `${new Date(b.event_date).toLocaleDateString()}` : ''}
          ${b.package    ? ` &nbsp;·&nbsp; 📦 ${escHtml(b.package)}` : ''}
          &nbsp;·&nbsp; 🕐 ${formatDateTime(b.createdAt)}
        </div>
        ${b.message ? `<div class="booking-message">"${escHtml(b.message)}"</div>` : ''}
        ${b.notes   ? `<div class="booking-message" style="color:var(--primary)">📝 ${escHtml(b.notes)}</div>` : ''}
      </div>
      <div class="booking-actions">
        <span class="badge ${statusBadge[b.status]}">${statusLabels[b.status]}</span>
        <select class="search-input" style="width:auto;font-size:0.8rem" data-id="${b._id}" onchange="updateBookingStatus(this)">
          <option value="new"       ${b.status==='new'       ?'selected':''}>🆕 New</option>
          <option value="contacted" ${b.status==='contacted' ?'selected':''}>📞 Contacted</option>
          <option value="confirmed" ${b.status==='confirmed' ?'selected':''}>✅ Confirmed</option>
          <option value="cancelled" ${b.status==='cancelled' ?'selected':''}>❌ Cancelled</option>
        </select>
        <button class="btn btn-outline btn-sm" onclick="addBookingNote('${b._id}')">📝 Note</button>
        <button class="btn btn-danger btn-sm" onclick="deleteBooking('${b._id}','${escHtml(b.name).replace(/'/g,"\\'")}')">🗑</button>
      </div>`;
    listEl.appendChild(card);
  });
}

async function updateBookingStatus(selectEl) {
  const id     = selectEl.dataset.id;
  const status = selectEl.value;
  try {
    await api('PATCH', `/bookings/${id}`, { status });
    fetchBookings();
  } catch (e) { alert('Failed: ' + e.message); }
}

async function addBookingNote(id) {
  const note = prompt('Add a note for this booking (internal only):');
  if (note === null) return;
  try {
    await api('PATCH', `/bookings/${id}`, { notes: note });
    fetchBookings();
  } catch (e) { alert('Failed: ' + e.message); }
}

async function deleteBooking(id, name) {
  if (!confirm(`Delete booking from "${name}"?`)) return;
  try {
    await api('DELETE', `/bookings/${id}`);
    fetchBookings();
  } catch (e) { alert('Failed: ' + e.message); }
}

// ── Business Dashboard ───────────────────────────────────────
async function fetchDashboard() {
  try {
    const data = await api('GET', '/dashboard');
    const s    = data.summary;

    // Summary cards
    const set = (id, val) => { const el = $(`#${id}`); if (el) el.textContent = val; };
    set('dash-total-events',  s.totalEvents);
    set('dash-total-guests',  s.totalGuests);
    set('dash-checked-in',    s.checkedIn);
    set('dash-attendance',    `${s.overallAttendance}%`);
    set('dash-total-scans',   s.totalScans);
    set('dash-invalid-scans', s.invalidScans);

    // Per-event table
    const tbody = $('#dash-event-tbody');
    if (tbody) {
      if (!data.eventStats.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No events yet</td></tr>';
      } else {
        tbody.innerHTML = data.eventStats.map(e => `
          <tr>
            <td><strong>${escHtml(e.name)}</strong></td>
            <td>${e.client ? escHtml(e.client) : '—'}</td>
            <td>${e.date ? new Date(e.date).toLocaleDateString() : '—'}</td>
            <td>${e.guests}</td>
            <td>${e.checkedIn}</td>
            <td>
              <div style="display:flex;align-items:center;gap:0.5rem">
                <div class="progress-bar" style="flex:1;height:8px">
                  <div class="progress-fill" style="width:${e.attendance}%;background:${e.color||'var(--primary)'}"></div>
                </div>
                <span style="font-size:0.8rem;color:var(--gray-500)">${e.attendance}%</span>
              </div>
            </td>
            <td><span class="badge ${e.status==='active'?'badge-unused':'badge-used'}">${escHtml(e.status)}</span></td>
          </tr>`).join('');
      }
    }

    // Recent check-ins
    const recentEl = $('#dash-recent-list');
    if (recentEl) {
      if (!data.recentActivity.length) {
        recentEl.innerHTML = '<div class="empty-state">No check-ins yet</div>';
      } else {
        recentEl.innerHTML = data.recentActivity.map(a => `
          <div class="recent-item">
            <div class="recent-item-icon"><i data-lucide="check-circle" style="width:16px;height:16px;color:var(--gray-400)"></i></div>
            <div class="recent-item-info">
              <div class="recent-item-name">${escHtml(a.guest_name || '—')}</div>
              <div class="recent-item-time">${formatDateTime(a.createdAt)} · by ${escHtml(a.scanned_by || '—')}</div>
            </div>
          </div>`).join('');
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
    }
  } catch (e) { console.error('Dashboard error:', e); }
}

// ── Guest Scan History ───────────────────────────────────────
async function viewGuestHistory(id, name) {
  const modal   = $('#history-modal');
  const titleEl = $('#history-modal-title');
  const bodyEl  = $('#history-modal-body');
  if (!modal) return;

  if (titleEl) titleEl.textContent = `Scan History — ${name}`;
  if (bodyEl)  bodyEl.innerHTML = '<div class="empty-state">Loading...</div>';
  modal.classList.remove('hidden');

  try {
    const { logs } = await api('GET', `/guests/${id}/history`);
    if (!logs.length) {
      bodyEl.innerHTML = '<div class="empty-state">No scan attempts recorded</div>';
      return;
    }
    const icons = { granted: '<i data-lucide="check-circle" style="width:16px;height:16px;color:var(--success)"></i>', used: '<i data-lucide="x-circle" style="width:16px;height:16px;color:var(--error)"></i>', invalid: '<i data-lucide="alert-circle" style="width:16px;height:16px;color:var(--warning)"></i>', reset: '<i data-lucide="rotate-ccw" style="width:16px;height:16px;color:var(--primary)"></i>' };
    bodyEl.innerHTML = logs.map(log => `
      <div class="activity-item action-${log.action}">
        <div class="activity-icon">${icons[log.action] || '<i data-lucide="file-text" style="width:16px;height:16px"></i>'}</div>
        <div class="activity-info">
          <div class="activity-main">
            ${log.action === 'granted' ? 'Checked in' :
              log.action === 'used'    ? 'Duplicate scan attempt' :
              log.action === 'reset'   ? 'Check-in reset' : 'Invalid scan'}
          </div>
          <div class="activity-sub">By: ${escHtml(log.scanned_by || '—')}${log.note ? ' · ' + escHtml(log.note) : ''}</div>
        </div>
        <div class="activity-time">${formatDateTime(log.createdAt)}</div>
      </div>`).join('');
    if (typeof lucide !== 'undefined') lucide.createIcons();
  } catch (e) {
    if (bodyEl) bodyEl.innerHTML = `<div class="empty-state">Failed to load: ${e.message}</div>`;
  }
}

// ── Print All QR Codes ───────────────────────────────────────
async function printAllQR() {
  if (!state.currentEvent) { alert('Please open an event first.'); return; }
  const eventId = gid(state.currentEvent);
  const modal   = $('#print-all-modal');
  const fillEl  = $('#print-progress-fill');
  const textEl  = $('#print-progress-text');
  if (modal) modal.classList.remove('hidden');

  try {
    const guests = await api('GET', `/guests/allqr?event_id=${eventId}`);
    const total  = guests.length;
    if (!total) { if (modal) modal.classList.add('hidden'); alert('No guests found.'); return; }

    // Build all QR images as data URLs on canvases
    const qrImages = [];
    for (let i = 0; i < total; i++) {
      const g = guests[i];
      const dataUrl = await new Promise((resolve) => {
        const SIZE = 250;
        const canvas = document.createElement('canvas');
        canvas.width = SIZE; canvas.height = SIZE;
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.onload = () => {
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, SIZE, SIZE);
          ctx.drawImage(img, 0, 0, SIZE, SIZE);
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => resolve(g.qrDataUrl);
        img.src = g.qrDataUrl;
      });
      qrImages.push({ name: g.name, dataUrl });
      const pct = Math.round(((i + 1) / total) * 100);
      if (fillEl) fillEl.style.width = `${pct}%`;
      if (textEl) textEl.textContent = `${i + 1} / ${total}`;
      await new Promise(r => setTimeout(r, 30));
    }

    if (modal) modal.classList.add('hidden');

    // Open print window with all QR codes in a grid
    const eventName = state.currentEvent.name;
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>QR Codes — ${escHtml(eventName)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: sans-serif; padding: 1rem; }
    h1 { font-size: 1.2rem; margin-bottom: 1rem; text-align: center; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem; }
    .item { text-align: center; border: 1px solid #e5e7eb; border-radius: 8px; padding: 0.5rem; }
    .item img { width: 100%; max-width: 150px; height: auto; display: block; margin: 0 auto; }
    .item .name { font-size: 0.7rem; margin-top: 0.25rem; color: #374151; word-break: break-word; }
    @media print {
      @page { margin: 0.5cm; }
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <h1>💍 ${escHtml(eventName)} — QR Codes</h1>
  <div class="grid">
    ${qrImages.map(q => `
      <div class="item">
        <img src="${q.dataUrl}" alt="${escHtml(q.name)}" />
        <div class="name">${escHtml(q.name)}</div>
      </div>`).join('')}
  </div>
  <script>window.onload = function() { window.print(); };<\/script>
</body>
</html>`);
    win.document.close();

  } catch (e) {
    if (modal) modal.classList.add('hidden');
    alert('Failed: ' + e.message);
  } finally {
    if (fillEl) fillEl.style.width = '0%';
    if (textEl) textEl.textContent = '0 / 0';
  }
}

// ── Card Template ─────────────────────────────────────────────
let cardState = {
  imageDataUrl: null,
  qrX: null,
  qrY: null,
  qrSize: 20
};

// Name card state for invite and thanks
let nameCardState = {
  invite: { imageDataUrl: null, nameX: null, nameY: null, nameSize: 5, nameColor: '#000000' },
  thanks: { imageDataUrl: null, nameX: null, nameY: null, nameSize: 5, nameColor: '#000000' }
};

function showNameCardPreview(type, dataUrl) {
  const img  = $(`#${type}-preview-img`);
  const hint = $(`#${type}-preview-hint`);
  if (!img) return;
  img.src = dataUrl;
  img.style.display = 'block';
  if (hint) hint.textContent = 'Click on the card to position the guest name';
  const wrap = $(`#${type}-preview-wrap`);
  if (wrap) {
    wrap.onclick = (e) => {
      const rect = img.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width)  * 100;
      const y = ((e.clientY - rect.top)  / rect.height) * 100;
      nameCardState[type].nameX = Math.round(x * 10) / 10;
      nameCardState[type].nameY = Math.round(y * 10) / 10;
      updateNameMarker(type, nameCardState[type].nameX, nameCardState[type].nameY);
      const sb = $(`#save-${type}-btn`); if (sb) sb.disabled = false;
      renderNameCardSample(type);
    };
  }
}

function updateNameMarker(type, xPct, yPct) {
  const marker = $(`#${type}-name-marker`);
  if (!marker) return;
  marker.style.display = 'block';
  marker.style.left    = xPct + '%';
  marker.style.top     = yPct + '%';
}

function renderNameCardSample(type) {
  const s = nameCardState[type];
  if (!s.imageDataUrl || s.nameX == null) return;
  const canvas = $(`#${type}-sample-canvas`);
  const wrap   = $(`#${type}-sample-wrap`);
  if (!canvas) return;
  const img = new Image();
  img.onload = () => {
    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const fontSize = Math.round((s.nameSize / 100) * img.naturalWidth);
    ctx.font      = `bold ${fontSize}px 'Segoe UI', sans-serif`;
    ctx.fillStyle = s.nameColor || '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Guest Name', (s.nameX / 100) * img.naturalWidth, (s.nameY / 100) * img.naturalHeight);
    if (wrap) wrap.style.display = 'block';
  };
  img.src = s.imageDataUrl;
}

async function saveNameCardTemplate(type) {
  if (!state.currentEvent) return;
  const s    = nameCardState[type];
  const errEl = $(`#${type}-upload-error`);
  const sucEl = $(`#${type}-upload-success`);
  const saveBtn = $(`#save-${type}-btn`);
  hideAlert(errEl); hideAlert(sucEl);
  if (!s.imageDataUrl) { showAlert(errEl, 'Please upload an image first'); return; }
  if (s.nameX == null) { showAlert(errEl, 'Please click on the card to set name position'); return; }
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }
  try {
    const body = {};
    body[`${type}_image`]      = s.imageDataUrl;
    body[`${type}_name_x`]     = s.nameX;
    body[`${type}_name_y`]     = s.nameY;
    body[`${type}_name_size`]  = s.nameSize;
    body[`${type}_name_color`] = s.nameColor;
    await api('POST', `/events/${gid(state.currentEvent)}/${type}`, body);
    state.currentEvent[`${type}_image`]      = s.imageDataUrl;
    state.currentEvent[`${type}_name_x`]     = s.nameX;
    state.currentEvent[`${type}_name_y`]     = s.nameY;
    state.currentEvent[`${type}_name_size`]  = s.nameSize;
    state.currentEvent[`${type}_name_color`] = s.nameColor;
    showAlert(sucEl, 'Template saved!', 'success');
    const rb = $(`#remove-${type}-btn`); if (rb) rb.style.display = 'inline-flex';
  } catch (e) {
    showAlert(errEl, e.message);
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = `Save ${type === 'invite' ? 'Invitation' : 'Thank You'} Template`; }
  }
}

async function removeNameCardTemplate(type) {
  if (!state.currentEvent) return;
  if (!confirm(`Remove ${type === 'invite' ? 'invitation' : 'thank you'} card template?`)) return;
  try {
    await api('DELETE', `/events/${gid(state.currentEvent)}/${type}`);
    nameCardState[type] = { imageDataUrl: null, nameX: null, nameY: null, nameSize: 5, nameColor: '#000000' };
    state.currentEvent[`${type}_image`] = null;
    const img = $(`#${type}-preview-img`); if (img) { img.src = ''; img.style.display = 'none'; }
    const marker = $(`#${type}-name-marker`); if (marker) marker.style.display = 'none';
    const wrap = $(`#${type}-sample-wrap`); if (wrap) wrap.style.display = 'none';
    const rb = $(`#remove-${type}-btn`); if (rb) rb.style.display = 'none';
    const label = $(`#${type}-drop-label`); if (label) label.textContent = `Drop ${type === 'invite' ? 'invitation' : 'thank you'} image here or click to browse`;
    showAlert($(`#${type}-upload-success`), 'Template removed', 'success');
  } catch (e) { alert('Failed: ' + e.message); }
}

function initCardTab() {
  if (!state.currentEvent) return;
  updateBreadcrumbs();

  const bc = $('#event-breadcrumb-card');
  if (bc) {
    bc.innerHTML = `<a href="#" class="breadcrumb-back js-back-card">← Back to Events</a> <span class="breadcrumb-sep">›</span> <span class="breadcrumb-event">${escHtml(state.currentEvent.name)}</span>`;
    bc.querySelector('.js-back-card').addEventListener('click', (e) => { e.preventDefault(); backToEvents(); });
  }

  // Fetch full event data (includes card templates)
  api('GET', `/events`).then(events => {
    const ev = events.find(e => e._id === gid(state.currentEvent) || e._id === state.currentEvent._id);
    if (ev) {
      state.currentEvent = { ...state.currentEvent, ...ev };
      loadCardTabData(ev);
    }
  }).catch(() => loadCardTabData(state.currentEvent));
}

function loadCardTabData(ev) {
  // QR card
  if (ev.card_image) {
    cardState.imageDataUrl = ev.card_image;
    cardState.qrX   = ev.card_qr_x;
    cardState.qrY   = ev.card_qr_y;
    cardState.qrSize = ev.card_qr_size || 20;
    showCardPreview(ev.card_image);
    if (ev.card_qr_x != null) updateQRMarker(ev.card_qr_x, ev.card_qr_y);
    const removeBtn = $('#remove-card-btn');
    if (removeBtn) removeBtn.style.display = 'inline-flex';
    const saveBtn = $('#save-card-btn');
    if (saveBtn) saveBtn.disabled = false;
    const slider = $('#qr-size-slider');
    if (slider) { slider.value = cardState.qrSize; $('#qr-size-label').textContent = cardState.qrSize + '%'; }
    renderCardSample();
  }

  // Invite card
  if (ev.invite_image) {
    nameCardState.invite.imageDataUrl = ev.invite_image;
    nameCardState.invite.nameX = ev.invite_name_x;
    nameCardState.invite.nameY = ev.invite_name_y;
    nameCardState.invite.nameSize = ev.invite_name_size || 5;
    nameCardState.invite.nameColor = ev.invite_name_color || '#000000';
    showNameCardPreview('invite', ev.invite_image);
    if (ev.invite_name_x != null) updateNameMarker('invite', ev.invite_name_x, ev.invite_name_y);
    const rb = $('#remove-invite-btn'); if (rb) rb.style.display = 'inline-flex';
    const sb = $('#save-invite-btn');   if (sb) sb.disabled = false;
    const sl = $('#invite-name-size');  if (sl) { sl.value = nameCardState.invite.nameSize; $('#invite-name-size-label').textContent = nameCardState.invite.nameSize + '%'; }
    const cl = $('#invite-name-color'); if (cl) cl.value = nameCardState.invite.nameColor;
    renderNameCardSample('invite');
  }

  // Thanks card
  if (ev.thanks_image) {
    nameCardState.thanks.imageDataUrl = ev.thanks_image;
    nameCardState.thanks.nameX = ev.thanks_name_x;
    nameCardState.thanks.nameY = ev.thanks_name_y;
    nameCardState.thanks.nameSize = ev.thanks_name_size || 5;
    nameCardState.thanks.nameColor = ev.thanks_name_color || '#000000';
    showNameCardPreview('thanks', ev.thanks_image);
    if (ev.thanks_name_x != null) updateNameMarker('thanks', ev.thanks_name_x, ev.thanks_name_y);
    const rb = $('#remove-thanks-btn'); if (rb) rb.style.display = 'inline-flex';
    const sb = $('#save-thanks-btn');   if (sb) sb.disabled = false;
    const sl = $('#thanks-name-size');  if (sl) { sl.value = nameCardState.thanks.nameSize; $('#thanks-name-size-label').textContent = nameCardState.thanks.nameSize + '%'; }
    const cl = $('#thanks-name-color'); if (cl) cl.value = nameCardState.thanks.nameColor;
    renderNameCardSample('thanks');
  }
}

function showCardPreview(dataUrl) {
  const img = $('#card-preview-img');
  const hint = $('#card-preview-hint');
  if (!img) return;
  img.src = dataUrl;
  img.style.display = 'block';
  if (hint) hint.textContent = 'Click on the card to position the QR code';

  // Wire up click handler
  const wrap = $('#card-preview-wrap');
  if (wrap) {
    wrap.onclick = (e) => {
      const rect = img.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width)  * 100;
      const y = ((e.clientY - rect.top)  / rect.height) * 100;
      cardState.qrX = Math.round(x * 10) / 10;
      cardState.qrY = Math.round(y * 10) / 10;
      updateQRMarker(cardState.qrX, cardState.qrY);
      const saveBtn = $('#save-card-btn');
      if (saveBtn) saveBtn.disabled = false;
      renderCardSample();
    };
  }
}

function updateQRMarker(xPct, yPct) {
  const marker = $('#qr-position-marker');
  const img    = $('#card-preview-img');
  if (!marker || !img) return;
  const size = cardState.qrSize || 20;
  marker.style.display = 'block';
  marker.style.left    = xPct + '%';
  marker.style.top     = yPct + '%';
  marker.style.width   = size + '%';
  marker.style.height  = 'auto';
  marker.style.aspectRatio = '1';
}

async function renderCardSample() {
  if (!cardState.imageDataUrl || cardState.qrX == null) return;

  const sampleWrap = $('#card-sample-wrap');
  const canvas     = $('#card-sample-canvas');
  if (!canvas) return;

  // Get a sample QR — use a placeholder token
  const sampleToken = 'SAMPLE-QR-PREVIEW';
  let qrDataUrl;
  try {
    // Generate QR on client side using a simple approach
    qrDataUrl = await generateQRDataUrl(sampleToken);
  } catch (e) { return; }

  const cardImg = new Image();
  cardImg.onload = () => {
    const W = cardImg.naturalWidth  || 800;
    const H = cardImg.naturalHeight || 600;
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(cardImg, 0, 0, W, H);

    // Draw QR
    const qrImg = new Image();
    qrImg.onload = () => {
      const qrW = (cardState.qrSize / 100) * W;
      const qrH = qrW;
      const qrX = (cardState.qrX / 100) * W - qrW / 2;
      const qrY = (cardState.qrY / 100) * H - qrH / 2;
      ctx.drawImage(qrImg, qrX, qrY, qrW, qrH);
      if (sampleWrap) sampleWrap.style.display = 'block';
    };
    qrImg.src = qrDataUrl;
  };
  cardImg.src = cardState.imageDataUrl;
}

// Generate QR code data URL client-side using the server
async function generateQRDataUrl(token) {
  // Use a tiny 1x1 placeholder — real QR comes from server per guest
  // For preview, fetch a sample from server
  try {
    const res = await fetch('/api/events/sample-qr');
    if (res.ok) {
      const data = await res.json();
      return data.qrDataUrl;
    }
  } catch (e) { /* ignore */ }
  // Fallback: return a simple colored square
  const c = document.createElement('canvas');
  c.width = c.height = 100;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, 100, 100);
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 10; i++) {
    for (let j = 0; j < 10; j++) {
      if ((i + j) % 2 === 0) ctx.fillRect(i * 10, j * 10, 10, 10);
    }
  }
  return c.toDataURL();
}

async function saveCardTemplate() {
  if (!state.currentEvent) return;
  if (!cardState.imageDataUrl) { alert('Please upload a card image first'); return; }
  if (cardState.qrX == null)   { alert('Please click on the card to set QR position'); return; }

  const errEl = $('#card-upload-error');
  const sucEl = $('#card-upload-success');
  hideAlert(errEl); hideAlert(sucEl);
  const saveBtn = $('#save-card-btn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳ Saving...'; }

  try {
    await api('POST', `/events/${gid(state.currentEvent)}/card`, {
      card_image:   cardState.imageDataUrl,
      card_qr_x:    cardState.qrX,
      card_qr_y:    cardState.qrY,
      card_qr_size: cardState.qrSize
    });
    // Update local state
    state.currentEvent.card_image  = cardState.imageDataUrl;
    state.currentEvent.card_qr_x   = cardState.qrX;
    state.currentEvent.card_qr_y   = cardState.qrY;
    state.currentEvent.card_qr_size = cardState.qrSize;
    showAlert(sucEl, '✅ Card template saved! QR codes will now use this card.', 'success');
    const removeBtn = $('#remove-card-btn');
    if (removeBtn) removeBtn.style.display = 'inline-flex';
  } catch (e) {
    showAlert(errEl, e.message);
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 Save Template'; }
  }
}

async function removeCardTemplate() {
  if (!state.currentEvent) return;
  if (!confirm('Remove card template? QR codes will go back to plain QR images.')) return;
  try {
    await api('DELETE', `/events/${gid(state.currentEvent)}/card`);
    cardState = { imageDataUrl: null, qrX: null, qrY: null, qrSize: 20 };
    state.currentEvent.card_image = null;
    const img = $('#card-preview-img');
    if (img) { img.src = ''; img.style.display = 'none'; }
    const marker = $('#qr-position-marker');
    if (marker) marker.style.display = 'none';
    const sampleWrap = $('#card-sample-wrap');
    if (sampleWrap) sampleWrap.style.display = 'none';
    const removeBtn = $('#remove-card-btn');
    if (removeBtn) removeBtn.style.display = 'none';
    const hint = $('#card-preview-hint');
    if (hint) hint.textContent = 'Upload a card to see preview. Then click where you want the QR code.';
    const label = $('#card-drop-label');
    if (label) label.textContent = '📂 Drop card image here or click to browse';
    showAlert($('#card-upload-success'), 'Card template removed', 'success');
  } catch (e) { alert('Failed: ' + e.message); }
}

// Generate card with QR for a specific guest (used in download)
function generateGuestCard(guest, qrDataUrl, cardTemplate) {
  return new Promise((resolve) => {
    const cardImg = new Image();
    cardImg.onload = () => {
      const W = cardImg.naturalWidth  || 800;
      const H = cardImg.naturalHeight || 600;
      const canvas = document.createElement('canvas');
      canvas.width  = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(cardImg, 0, 0, W, H);

      const qrImg = new Image();
      qrImg.onload = () => {
        const qrW = (cardTemplate.qr_size / 100) * W;
        const qrH = qrW;
        const qrX = (cardTemplate.qr_x / 100) * W - qrW / 2;
        const qrY = (cardTemplate.qr_y / 100) * H - qrH / 2;
        ctx.drawImage(qrImg, qrX, qrY, qrW, qrH);
        resolve(canvas.toDataURL('image/png'));
      };
      qrImg.onerror = () => resolve(qrDataUrl); // fallback to plain QR
      qrImg.src = qrDataUrl;
    };
    cardImg.onerror = () => resolve(qrDataUrl);
    cardImg.src = cardTemplate.image;
  });
}

// ── Export Activity Log CSV ──────────────────────────────────
function exportActivityLog() {
  const items = $$('.activity-item', $('#activity-list'));
  if (!items.length) { alert('No activity to export.'); return; }

  // Re-fetch and export
  api('GET', '/activity?limit=1000' + (state.currentEvent ? `&event_id=${gid(state.currentEvent)}` : ''))
    .then(logs => {
      const rows = [['Time', 'Action', 'Guest', 'Scanned By', 'Note']];
      logs.forEach(l => rows.push([
        new Date(l.createdAt).toLocaleString(),
        l.action,
        l.guest_name || '—',
        l.scanned_by || '—',
        l.note || ''
      ]));
      const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const a    = document.createElement('a');
      a.href     = URL.createObjectURL(blob);
      const evName = state.currentEvent ? state.currentEvent.name.replace(/\s+/g,'-').toLowerCase() : 'all';
      a.download = `activity-log-${evName}.csv`;
      a.click();
    }).catch(e => alert('Export failed: ' + e.message));
}

// ── Event Summary Report ─────────────────────────────────────
async function printEventSummary() {
  if (!state.currentEvent) { alert('Please open an event first.'); return; }
  const ev = state.currentEvent;
  try {
    const [stats, guests, activity] = await Promise.all([
      api('GET', `/guests/stats?event_id=${gid(ev)}`),
      api('GET', `/guests?event_id=${gid(ev)}`),
      api('GET', `/activity?event_id=${gid(ev)}&limit=1000`)
    ]);

    const checkedInGuests  = guests.filter(g => g.status === 'used');
    const pendingGuests    = guests.filter(g => g.status !== 'used');
    const firstCheckin     = activity.filter(a => a.action === 'granted').sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt))[0];
    const lastCheckin      = activity.filter(a => a.action === 'granted').sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    const invalidScans     = activity.filter(a => a.action === 'invalid').length;
    const duplicateScans   = activity.filter(a => a.action === 'used').length;
    const pct              = stats.total > 0 ? Math.round((stats.checkedIn / stats.total) * 100) : 0;

    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Event Summary — ${escHtml(ev.name)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', sans-serif; color: #222; padding: 2rem; max-width: 800px; margin: 0 auto; }
    h1 { font-size: 1.6rem; font-weight: 800; margin-bottom: 0.25rem; }
    .subtitle { color: #666; font-size: 0.9rem; margin-bottom: 2rem; }
    .stats-row { display: grid; grid-template-columns: repeat(4,1fr); gap: 1rem; margin-bottom: 2rem; }
    .stat { background: #f8f8f8; border-radius: 8px; padding: 1rem; text-align: center; }
    .stat-val { font-size: 2rem; font-weight: 800; color: #1a1a2e; }
    .stat-lbl { font-size: 0.75rem; color: #888; margin-top: 0.2rem; }
    .section { margin-bottom: 2rem; }
    .section h2 { font-size: 1rem; font-weight: 700; border-bottom: 1px solid #eee; padding-bottom: 0.4rem; margin-bottom: 0.75rem; }
    .info-row { display: flex; justify-content: space-between; padding: 0.35rem 0; border-bottom: 1px solid #f0f0f0; font-size: 0.875rem; }
    .info-row span:first-child { color: #666; }
    table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
    th { background: #f8f8f8; padding: 0.5rem 0.75rem; text-align: left; font-weight: 600; color: #555; border-bottom: 1px solid #eee; }
    td { padding: 0.45rem 0.75rem; border-bottom: 1px solid #f5f5f5; }
    .badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 999px; font-size: 0.7rem; font-weight: 600; background: #f0f0f0; color: #555; }
    .badge-in { background: #d1fae5; color: #065f46; }
    .footer { margin-top: 2rem; font-size: 0.75rem; color: #aaa; text-align: center; }
    @media print { @page { margin: 1cm; } }
  </style>
</head>
<body>
  <h1>${escHtml(ev.name)}</h1>
  <div class="subtitle">
    Event Summary Report &nbsp;·&nbsp; Generated ${new Date().toLocaleString()}
    ${ev.date ? ` &nbsp;·&nbsp; Event Date: ${new Date(ev.date).toLocaleDateString()}` : ''}
    ${ev.venue ? ` &nbsp;·&nbsp; ${escHtml(ev.venue)}` : ''}
  </div>

  <div class="stats-row">
    <div class="stat"><div class="stat-val">${stats.total}</div><div class="stat-lbl">Total Guests</div></div>
    <div class="stat"><div class="stat-val">${stats.checkedIn}</div><div class="stat-lbl">Checked In</div></div>
    <div class="stat"><div class="stat-val">${stats.remaining}</div><div class="stat-lbl">Did Not Attend</div></div>
    <div class="stat"><div class="stat-val">${pct}%</div><div class="stat-lbl">Attendance Rate</div></div>
  </div>

  <div class="section">
    <h2>Check-in Details</h2>
    <div class="info-row"><span>First check-in</span><span>${firstCheckin ? new Date(firstCheckin.createdAt).toLocaleString() + ' — ' + escHtml(firstCheckin.guest_name || '—') : '—'}</span></div>
    <div class="info-row"><span>Last check-in</span><span>${lastCheckin ? new Date(lastCheckin.createdAt).toLocaleString() + ' — ' + escHtml(lastCheckin.guest_name || '—') : '—'}</span></div>
    <div class="info-row"><span>Invalid scan attempts</span><span>${invalidScans}</span></div>
    <div class="info-row"><span>Duplicate scan attempts</span><span>${duplicateScans}</span></div>
  </div>

  <div class="section">
    <h2>Guests Who Attended (${checkedInGuests.length})</h2>
    <table>
      <thead><tr><th>#</th><th>Name</th><th>Phone</th><th>Table</th><th>Checked In At</th></tr></thead>
      <tbody>
        ${checkedInGuests.map((g,i) => `
          <tr>
            <td>${i+1}</td>
            <td>${escHtml(g.name)}</td>
            <td>${g.phone ? escHtml(g.phone) : '—'}</td>
            <td>${g.table_number ? escHtml(g.table_number) : '—'}</td>
            <td>${g.checked_in_at ? new Date(g.checked_in_at).toLocaleString() : '—'}</td>
          </tr>`).join('')}
      </tbody>
    </table>
  </div>

  ${pendingGuests.length ? `
  <div class="section">
    <h2>Guests Who Did Not Attend (${pendingGuests.length})</h2>
    <table>
      <thead><tr><th>#</th><th>Name</th><th>Phone</th><th>Table</th></tr></thead>
      <tbody>
        ${pendingGuests.map((g,i) => `
          <tr>
            <td>${i+1}</td>
            <td>${escHtml(g.name)}</td>
            <td>${g.phone ? escHtml(g.phone) : '—'}</td>
            <td>${g.table_number ? escHtml(g.table_number) : '—'}</td>
          </tr>`).join('')}
      </tbody>
    </table>
  </div>` : ''}

  <div class="footer">TMJ Wedding Tech &nbsp;·&nbsp; Event Check-in System</div>
  <script>window.onload = function() { window.print(); };<\/script>
</body>
</html>`);
    win.document.close();
  } catch (e) {
    alert('Failed to generate report: ' + e.message);
  }
}

// ── Session Timeout Warning ───────────────────────────────────
function initSessionWarning() {
  // Warn 5 minutes before session expires (session = 24h)
  const WARNING_BEFORE = 5 * 60 * 1000; // 5 min
  const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24h

  // Check every minute
  setInterval(async () => {
    try {
      await api('GET', '/auth/me');
    } catch (e) {
      // Session expired — show warning and redirect to login
      if (confirm('Your session has expired. Click OK to log in again.')) {
        state.user = null;
        state.initialized = false;
        stopScanner();
        showPage('page-login');
      }
    }
  }, 15 * 60 * 1000); // check every 15 minutes
}

// ── Guest Import Validation ───────────────────────────────────
// (Enhanced bulk import with result report — called after import)
function showImportReport(created, total) {
  const skipped = total - created.length;
  let msg = `Import complete!\n\n✓ ${created.length} guests imported successfully.`;
  if (skipped > 0) msg += `\n⚠ ${skipped} rows skipped (empty names or errors).`;
  alert(msg);
}

// ── Custom SMS Message ────────────────────────────────────────
async function sendCustomSMS() {
  if (!state.currentEvent) return;
  const message = $('#custom-sms-text') ? $('#custom-sms-text').value.trim() : '';
  const resultEl = $('#custom-sms-result');
  const btn = $('#send-custom-sms-btn');

  if (!message) { showAlert(resultEl, 'Please write a message first', 'error'); return; }

  const targetRadio = document.querySelector('input[name="custom-sms-target"]:checked');
  const target = targetRadio ? targetRadio.value : 'all';

  const guests = await api('GET', `/guests?event_id=${gid(state.currentEvent)}`);
  let targetGuests = guests.filter(g => g.phone && g.phone.trim());

  if (target === 'attended') targetGuests = targetGuests.filter(g => g.status === 'used');
  if (target === 'absent')   targetGuests = targetGuests.filter(g => g.status !== 'used');

  if (!targetGuests.length) { showAlert(resultEl, 'No guests found for selected target', 'error'); return; }

  if (!confirm(`Send custom SMS to ${targetGuests.length} guests?`)) return;

  if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
  hideAlert(resultEl);

  let sent = 0, failed = 0, errors = [];
  for (const g of targetGuests) {
    try {
      const personalMsg = `Dear ${g.name}, ${message}`;
      // Use Beem directly via a new endpoint
      await api('POST', '/guests/sms/custom', {
        guest_id: g._id,
        message: personalMsg
      });
      sent++;
      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      failed++;
      errors.push(`${g.name}: ${e.message}`);
    }
  }

  const msg = `Sent: ${sent}${failed > 0 ? `, Failed: ${failed}` : ''}`;
  showAlert(resultEl, msg, failed === 0 ? 'success' : 'error');
  if (btn) { btn.disabled = false; btn.textContent = 'Send Custom SMS'; }
}

// ── Send Card Broadcast (Invite / Thanks) ────────────────────
async function sendCardBroadcast(type, channel) {
  if (!state.currentEvent) return;
  const ev = state.currentEvent;
  const template = type === 'invite'
    ? { image: ev.invite_image, name_x: ev.invite_name_x, name_y: ev.invite_name_y, name_size: ev.invite_name_size || 5, name_color: ev.invite_name_color || '#000000' }
    : { image: ev.thanks_image, name_x: ev.thanks_name_x, name_y: ev.thanks_name_y, name_size: ev.thanks_name_size || 5, name_color: ev.thanks_name_color || '#000000' };

  if (!template.image) { alert('Please set up the card template first in Card Template tab.'); return; }

  const guests = await api('GET', `/guests?event_id=${gid(ev)}`);
  const withPhone = guests.filter(g => g.phone && g.phone.trim());
  if (!withPhone.length) { alert('No guests with phone numbers found.'); return; }

  const typeName = type === 'invite' ? 'invitation' : 'thank you';
  if (!confirm(`Send ${typeName} cards to ${withPhone.length} guests via ${channel === 'wa' ? 'WhatsApp' : 'SMS'}?`)) return;

  if (channel === 'wa') {
    // Build CSV with personalized card links
    const origin = window.location.origin;
    const rows = [['Name', 'Phone', 'Personal Card Link']];
    withPhone.forEach(g => {
      rows.push([g.name, g.phone.trim(), `${origin}/guest/${g.qr_token}`]);
    });
    const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `${ev.name.replace(/\s+/g,'-')}-${type}-cards.csv`;
    a.click();
    setTimeout(() => alert(`CSV downloaded!\n\nEach guest's personal page (${origin}/guest/...) now shows their ${typeName} card with their name.\n\nSend each guest their link from the CSV.`), 500);
  } else {
    // SMS — send link via Beem
    if (!confirm(`This will send SMS to ${withPhone.length} guests. Beem Africa charges apply.`)) return;
    const eventName = ev.name;
    const baseUrl   = window.location.origin;
    let sent = 0, failed = 0;
    for (const g of withPhone) {
      try {
        const msg = type === 'invite'
          ? `Dear ${g.name}, you are invited to ${eventName}. View your invitation: ${baseUrl}/guest/${g.qr_token}`
          : `Dear ${g.name}, thank you for attending ${eventName}! View your card: ${baseUrl}/guest/${g.qr_token}`;
        await api('POST', `/guests/${g._id}/sms`, { custom_message: msg });
        sent++;
        await new Promise(r => setTimeout(r, 200));
      } catch (e) { failed++; }
    }
    alert(`Done! Sent: ${sent}, Failed: ${failed}`);
  }
}

// ── Tab Navigation ───────────────────────────────────────────
function switchTab(tabId) {
  // Update sidebar nav items
  $$('.nav-item').forEach(t => t.classList.remove('active'));
  const activeNavItem = $(`.nav-item[data-tab="${tabId}"]`);
  if (activeNavItem) activeNavItem.classList.add('active');

  // Show/hide tab content
  $$('.tab-content').forEach(t => t.classList.add('hidden'));
  const activeContent = $(`#${tabId}`);
  if (activeContent) activeContent.classList.remove('hidden');

  // Update topbar title
  const titles = {
    'tab-events':   'Events',
    'tab-dashboard':'Dashboard',
    'tab-bookings': 'Bookings',
    'tab-overview': 'Overview',
    'tab-guests':   'Guests',
    'tab-add':      'Add Guest',
    'tab-send':     'Send Invitations',
    'tab-card':     'Card Template',
    'tab-activity': 'Activity Log',
    'tab-settings': 'Settings'
  };
  const titleEl = $('#topbar-title');
  if (titleEl) titleEl.textContent = titles[tabId] || '';

  if (tabId === 'tab-events')    fetchEvents();
  if (tabId === 'tab-dashboard') fetchDashboard();
  if (tabId === 'tab-bookings')  fetchBookings();
  if (tabId === 'tab-overview')  { fetchStats(); renderRecentCheckins(); }
  if (tabId === 'tab-guests')    fetchGuests();
  if (tabId === 'tab-send')      loadSendTab();
  if (tabId === 'tab-activity')  fetchActivityLog();
  if (tabId === 'tab-card')      initCardTab();
  if (tabId === 'tab-settings')  { fetchSettings(); fetchScannerAccounts(); }
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
  if (adminUser) adminUser.textContent = state.user.username;

  // Hide event nav items until event is opened
  const evWrapper = $('#event-submenu-wrapper');
  const evSection = $('#event-nav-section');
  if (evWrapper) evWrapper.style.display = 'none';
  if (evSection) evSection.style.display = 'none';
  $$('.nav-item[data-tab="tab-overview"], .nav-item[data-tab="tab-guests"], .nav-item[data-tab="tab-add"], .nav-item[data-tab="tab-send"], .nav-item[data-tab="tab-card"], .nav-item[data-tab="tab-activity"]')
    .forEach(t => { t.classList.add('hidden'); t.style.display = 'none'; });

  fetchEvents();

  // Event filter tabs
  $$('.event-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.event-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      fetchEvents(btn.dataset.filter);
    });
  });

  // Sidebar nav items
  $$('.nav-item[data-tab]').forEach(item => {
    item.addEventListener('click', () => {
      const tabId = item.dataset.tab;
      if (!tabId) return;
      const eventTabs = ['tab-overview','tab-guests','tab-add','tab-send','tab-card','tab-activity'];
      if (!eventTabs.includes(tabId)) {
        // Main tab clicked — close event view
        if (state.currentEvent) backToEvents();
      }
      switchTab(tabId);
      // Active state
      $$('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      const sidebar = $('#sidebar'); if (sidebar) sidebar.classList.remove('open');
      const overlay = $('#sidebar-overlay'); if (overlay) overlay.classList.remove('show');
    });
  });

  fetchEvents();

  // Event filter tabs
  $$('.event-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.event-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      fetchEvents(btn.dataset.filter);
    });
  });

  // Sidebar nav items
  $$('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const tabId = item.dataset.tab;
      switchTab(tabId);

      // If clicking a Main or System tab (not a current-event tab),
      // collapse the current event section in sidebar
      const eventTabs = ['tab-overview','tab-guests','tab-add','tab-send','tab-card','tab-activity'];
      if (!eventTabs.includes(tabId)) {
        // Collapse current event nav items
        $$('.nav-item[data-tab="tab-overview"], .nav-item[data-tab="tab-guests"], .nav-item[data-tab="tab-add"], .nav-item[data-tab="tab-send"], .nav-item[data-tab="tab-activity"], .nav-item[data-tab="tab-card"]')
          .forEach(t => t.classList.add('hidden'));
        const sectionLabel = $('#event-nav-section');
        if (sectionLabel) sectionLabel.style.display = 'none';
        state.currentEvent = null;
        state.recentCheckins = [];
      }

      // Close sidebar on mobile
      const sidebar = $('#sidebar');
      const overlay = $('#sidebar-overlay');
      if (sidebar) sidebar.classList.remove('open');
      if (overlay) overlay.classList.remove('show');
    });
  });

  // Mobile sidebar toggle
  const sidebarToggle = $('#sidebar-toggle');
  const sidebar = $('#sidebar');
  const overlay = $('#sidebar-overlay');
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('show');
    });
  }
  if (overlay) {
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('show');
    });
  }

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
      if ($('#ev-pin')) $('#ev-pin').value = '';
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
      const pin    = $('#ev-pin') ? $('#ev-pin').value.trim() : '';
      hideAlert(errEl);
      if (!name) { showAlert(errEl, 'Event name is required'); return; }
      try {
        const editId = modal.dataset.editId;
        if (editId) {
          await api('PUT', `/events/${editId}`, { name, client_name: client, date, venue, pin: pin || null });
          if (state.currentEvent && gid(state.currentEvent) === editId) {
            state.currentEvent = { ...state.currentEvent, name, client_name: client, date, venue };
            updateBreadcrumbs();
          }
        } else {
          await createEvent({ name, client_name: client, date, venue, pin: pin || null });
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

  const printAllBtn = $('#print-all-qr-btn');
  if (printAllBtn) printAllBtn.addEventListener('click', printAllQR);

  // Card template controls
  const cardFile    = $('#card-file');
  const cardDrop    = $('#card-drop-zone');
  const saveCardBtn = $('#save-card-btn');
  const removeCardBtn = $('#remove-card-btn');
  const qrSlider    = $('#qr-size-slider');
  const downloadSampleBtn = $('#download-sample-btn');

  if (cardFile) {
    cardFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) {
        showAlert($('#card-upload-error'), 'Image too large. Maximum 2MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        cardState.imageDataUrl = ev.target.result;
        cardState.qrX = null; cardState.qrY = null;
        showCardPreview(ev.target.result);
        const label = $('#card-drop-label');
        if (label) label.textContent = file.name + ' selected';
        const marker = $('#qr-position-marker');
        if (marker) marker.style.display = 'none';
        const sampleWrap = $('#card-sample-wrap');
        if (sampleWrap) sampleWrap.style.display = 'none';
      };
      reader.readAsDataURL(file);
    });
  }

  if (cardDrop) {
    cardDrop.addEventListener('click', () => cardFile && cardFile.click());
    cardDrop.addEventListener('dragover', (e) => { e.preventDefault(); cardDrop.classList.add('drag-over'); });
    cardDrop.addEventListener('dragleave', () => cardDrop.classList.remove('drag-over'));
    cardDrop.addEventListener('drop', (e) => {
      e.preventDefault();
      cardDrop.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) { cardFile.files = e.dataTransfer.files; cardFile.dispatchEvent(new Event('change')); }
    });
  }

  if (qrSlider) {
    qrSlider.addEventListener('input', (e) => {
      cardState.qrSize = parseInt(e.target.value);
      const label = $('#qr-size-label');
      if (label) label.textContent = cardState.qrSize + '%';
      if (cardState.qrX != null) {
        updateQRMarker(cardState.qrX, cardState.qrY);
        renderCardSample();
      }
    });
  }

  if (saveCardBtn)   saveCardBtn.addEventListener('click', saveCardTemplate);
  if (removeCardBtn) removeCardBtn.addEventListener('click', removeCardTemplate);

  if (downloadSampleBtn) {
    downloadSampleBtn.addEventListener('click', () => {
      const canvas = $('#card-sample-canvas');
      if (!canvas) return;
      const link = document.createElement('a');
      link.download = 'card-sample.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    });
  }

  // ── Invite Card Controls ──────────────────────────────────
  ['invite', 'thanks'].forEach(type => {
    const fileInput = $(`#${type}-file`);
    const dropZone  = $(`#${type}-drop-zone`);
    const sizeSlider = $(`#${type}-name-size`);
    const colorPicker = $(`#${type}-name-color`);
    const saveBtn   = $(`#save-${type}-btn`);
    const removeBtn = $(`#remove-${type}-btn`);

    function handleFile(file) {
      if (!file || !file.type.startsWith('image/')) return;
      if (file.size > 2 * 1024 * 1024) { showAlert($(`#${type}-upload-error`), 'Image too large. Max 2MB.'); return; }
      const reader = new FileReader();
      reader.onload = (ev) => {
        nameCardState[type].imageDataUrl = ev.target.result;
        nameCardState[type].nameX = null;
        nameCardState[type].nameY = null;
        showNameCardPreview(type, ev.target.result);
        const label = $(`#${type}-drop-label`);
        if (label) label.textContent = file.name + ' selected';
        const marker = $(`#${type}-name-marker`); if (marker) marker.style.display = 'none';
        const wrap = $(`#${type}-sample-wrap`); if (wrap) wrap.style.display = 'none';
      };
      reader.readAsDataURL(file);
    }

    if (fileInput) fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
    if (dropZone) {
      dropZone.addEventListener('click', () => fileInput && fileInput.click());
      dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
      dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
      dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('drag-over'); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); });
    }
    if (sizeSlider) {
      sizeSlider.addEventListener('input', (e) => {
        nameCardState[type].nameSize = parseInt(e.target.value);
        const lbl = $(`#${type}-name-size-label`); if (lbl) lbl.textContent = nameCardState[type].nameSize + '%';
        if (nameCardState[type].nameX != null) renderNameCardSample(type);
      });
    }
    if (colorPicker) {
      colorPicker.addEventListener('input', (e) => {
        nameCardState[type].nameColor = e.target.value;
        if (nameCardState[type].nameX != null) renderNameCardSample(type);
      });
    }
    if (saveBtn)   saveBtn.addEventListener('click', () => saveNameCardTemplate(type));
    if (removeBtn) removeBtn.addEventListener('click', () => removeNameCardTemplate(type));
  });

  // History modal close
  const histClose   = $('#history-modal-close');
  const histOverlay = $('#history-modal-overlay');
  if (histClose)   histClose.addEventListener('click',   () => $('#history-modal').classList.add('hidden'));
  if (histOverlay) histOverlay.addEventListener('click', () => $('#history-modal').classList.add('hidden'));

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
          showAlert(errEl, `A guest named "${name}" already exists in this event. Please use a different name or check the guest list.`);
          return;
        }
      } catch (e) { /* ignore duplicate check errors */ }

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
        showAlert(sucEl, `Imported ${created.length} guests successfully${state.csvData.length - created.length > 0 ? ` (${state.csvData.length - created.length} skipped)` : ''}.`, 'success');
        showImportReport(created, state.csvData.length);
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

  // Bookings tab controls
  const bookingFilter    = $('#booking-filter');
  const refreshBookings  = $('#refresh-bookings-btn');
  if (bookingFilter)   bookingFilter.addEventListener('change', fetchBookings);
  if (refreshBookings) refreshBookings.addEventListener('click', fetchBookings);

  // Test SMS button
  const testSmsBtn = $('#test-sms-btn');
  if (testSmsBtn) {
    testSmsBtn.addEventListener('click', async () => {
      const phone   = $('#test-sms-phone') ? $('#test-sms-phone').value.trim() : '';
      const resultEl = $('#test-sms-result');
      if (!phone) { showAlert(resultEl, 'Enter a phone number to test', 'error'); return; }
      testSmsBtn.disabled = true;
      testSmsBtn.textContent = '⏳ Sending...';
      hideAlert(resultEl);
      try {
        const res = await api('POST', '/guests/sms/test', { phone });
        showAlert(resultEl, 'SMS sent successfully: ' + res.message, 'success');
      } catch (e) {
        showAlert(resultEl, 'Failed: ' + e.message, 'error');
      } finally {
        testSmsBtn.disabled = false;
        testSmsBtn.textContent = '📱 Test';
      }
    });
  }

  // ── Send Invites ─────────────────────────────────────────
  const sendAllSmsBtn = $('#send-all-sms-btn');
  if (sendAllSmsBtn) sendAllSmsBtn.addEventListener('click', sendAllSMS);

  const sendAllWaBtn = $('#send-all-wa-btn');
  if (sendAllWaBtn) sendAllWaBtn.addEventListener('click', sendAllWhatsApp);

  // Send invitation cards
  const sendInviteWaBtn  = $('#send-invite-wa-btn');
  const sendInviteSmsBtn = $('#send-invite-sms-btn');
  const sendThanksWaBtn  = $('#send-thanks-wa-btn');
  const sendThanksSmsBtn = $('#send-thanks-sms-btn');

  if (sendInviteWaBtn) sendInviteWaBtn.addEventListener('click', () => sendCardBroadcast('invite', 'wa'));
  if (sendInviteSmsBtn) sendInviteSmsBtn.addEventListener('click', () => sendCardBroadcast('invite', 'sms'));
  if (sendThanksWaBtn) sendThanksWaBtn.addEventListener('click', () => sendCardBroadcast('thanks', 'wa'));
  if (sendThanksSmsBtn) sendThanksSmsBtn.addEventListener('click', () => sendCardBroadcast('thanks', 'sms'));

  // Custom SMS
  const sendCustomSmsBtn = $('#send-custom-sms-btn');
  if (sendCustomSmsBtn) sendCustomSmsBtn.addEventListener('click', sendCustomSMS);

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

  // Export activity log
  const exportActivityBtn = $('#export-activity-btn');
  if (exportActivityBtn) exportActivityBtn.addEventListener('click', exportActivityLog);

  // Print summary report
  const printSummaryBtn = $('#print-summary-btn');
  if (printSummaryBtn) printSummaryBtn.addEventListener('click', printEventSummary);

  // Session warning
  initSessionWarning();

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
  // Initialize Lucide icons
  if (typeof lucide !== 'undefined') lucide.createIcons();
  initPWA();
  init();
  // Close any open card dropdowns when clicking outside
  document.addEventListener('click', () => {
    $$('.card-dropdown.open').forEach(d => d.classList.remove('open'));
  });
});
