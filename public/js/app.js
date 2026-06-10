// ── Settings ─────────────────────────────────────────────
async function fetchSettings() {
  try {
    const s = await api('GET', '/settings');
    const set = (id, v) => { const e = document.getElementById(id); if (e && v) e.value = v; };
    set('beem-api-key', s.beem_api_key);
    set('beem-secret-key', s.beem_secret_key);
    set('beem-sender-id', s.beem_sender_id);
    set('app-url', s.app_url);
    set('fonnte-token', s.fonnte_token);
  } catch (e) { console.error('Settings error:', e); }
}

async function saveFonnteSettings() {
  const btn=document.getElementById('save-fonnte-btn');
  const sucEl=document.getElementById('fonnte-success');
  if(btn){btn.disabled=true;btn.textContent='Saving...';}
  try {
    const token=(document.getElementById('fonnte-token')||{}).value||'';
    await api('POST', '/settings/bulk', { settings: { fonnte_token: token }});
    if(sucEl){sucEl.textContent='WhatsApp settings saved!';sucEl.className='alert alert-success';sucEl.classList.remove('hidden');setTimeout(()=>sucEl.classList.add('hidden'),4000);}
  } catch(e){alert('Failed: '+e.message);}
  finally{if(btn){btn.disabled=false;btn.textContent='Save WhatsApp Settings';}}
}

async function testFonnte() {
  const phone=(document.getElementById('fonnte-test-phone')||{}).value||'';
  const resEl=document.getElementById('fonnte-test-result');
  const btn=document.getElementById('fonnte-test-btn');
  if(!phone){if(resEl){resEl.textContent='Enter a phone number';resEl.className='alert alert-error';resEl.classList.remove('hidden');}return;}
  if(btn){btn.disabled=true;btn.textContent='Sending...';}
  if(resEl)resEl.classList.add('hidden');
  try {
    const r=await api('POST','/whatsapp/test',{phone});
    if(resEl){resEl.textContent=r.message;resEl.className='alert alert-success';resEl.classList.remove('hidden');}
  } catch(e){
    if(resEl){resEl.textContent=e.message;resEl.className='alert alert-error';resEl.classList.remove('hidden');}
  } finally{if(btn){btn.disabled=false;btn.textContent='Test';}}
}

async function saveBeemSettings() {
  const sucEl = document.getElementById('beem-success');
  try {
    await api('POST', '/settings/bulk', { settings: {
      beem_api_key:    (document.getElementById('beem-api-key')||{}).value||'',
      beem_secret_key: (document.getElementById('beem-secret-key')||{}).value||'',
      beem_sender_id:  (document.getElementById('beem-sender-id')||{}).value||'',
      app_url:         (document.getElementById('app-url')||{}).value||''
    }});
    if (sucEl) { sucEl.textContent='SMS settings saved!'; sucEl.className='alert alert-success'; sucEl.classList.remove('hidden'); setTimeout(()=>sucEl.classList.add('hidden'),4000); }
  } catch(e) { alert('Failed: '+e.message); }
}

async function saveFonnteSettings() {
  const btn=document.getElementById('save-fonnte-btn');
  const sucEl=document.getElementById('fonnte-success');
  if(btn){btn.disabled=true;btn.textContent='Saving...';}
  try {
    const token=(document.getElementById('fonnte-token')||{}).value||'';
    await api('POST', '/settings/bulk', { settings: { fonnte_token: token }});
    if(sucEl){sucEl.textContent='WhatsApp settings saved!';sucEl.className='alert alert-success';sucEl.classList.remove('hidden');setTimeout(()=>sucEl.classList.add('hidden'),4000);}
  } catch(e){alert('Failed: '+e.message);}
  finally{if(btn){btn.disabled=false;btn.textContent='Save WhatsApp Settings';}}
}

async function testFonnte() {
  const phone=(document.getElementById('fonnte-test-phone')||{}).value||'';
  const resEl=document.getElementById('fonnte-test-result');
  const btn=document.getElementById('fonnte-test-btn');
  if(!phone){if(resEl){resEl.textContent='Enter a phone number';resEl.className='alert alert-error';resEl.classList.remove('hidden');}return;}
  if(btn){btn.disabled=true;btn.textContent='Sending...';}
  if(resEl)resEl.classList.add('hidden');
  try {
    const r=await api('POST','/whatsapp/test',{phone});
    if(resEl){resEl.textContent=r.message;resEl.className='alert alert-success';resEl.classList.remove('hidden');}
  } catch(e){
    if(resEl){resEl.textContent=e.message;resEl.className='alert alert-error';resEl.classList.remove('hidden');}
  } finally{if(btn){btn.disabled=false;btn.textContent='Test';}}
}
async function saveBeemSettings() {
  const vals = {
    beem_api_key:    document.getElementById('beem-api-key')    ? document.getElementById('beem-api-key').value.trim()    : '',
    beem_secret_key: document.getElementById('beem-secret-key') ? document.getElementById('beem-secret-key').value.trim() : '',
    beem_sender_id:  document.getElementById('beem-sender-id')  ? document.getElementById('beem-sender-id').value.trim()  : '',
    app_url:         document.getElementById('app-url')         ? document.getElementById('app-url').value.trim()         : ''
  };
  const sucEl = document.getElementById('beem-success');
  try {
    await api('POST', '/settings/bulk', { settings: vals });
    if (sucEl) { sucEl.textContent = 'SMS settings saved!'; sucEl.className = 'alert alert-success'; sucEl.classList.remove('hidden'); setTimeout(() => sucEl.classList.add('hidden'), 4000); }
  } catch (e) { alert('Failed: ' + e.message); }
}

async function saveFonnteSettings() {
  const token = document.getElementById('fonnte-token') ? document.getElementById('fonnte-token').value.trim() : '';
  const sucEl = document.getElementById('fonnte-success');
  const btn = document.getElementById('save-fonnte-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
  try {
    await api('POST', '/settings/bulk', { settings: { fonnte_token: token } });
    if (sucEl) { sucEl.textContent = 'WhatsApp settings saved!'; sucEl.className = 'alert alert-success'; sucEl.classList.remove('hidden'); setTimeout(() => sucEl.classList.add('hidden'), 4000); }
  } catch (e) { alert('Failed: ' + e.message); }
  finally { if (btn) { btn.disabled = false; btn.textContent = 'Save WhatsApp Settings'; } }
}

async function testFonnte() {
  const phone = document.getElementById('fonnte-test-phone') ? document.getElementById('fonnte-test-phone').value.trim() : '';
  const resEl = document.getElementById('fonnte-test-result');
  const btn = document.getElementById('fonnte-test-btn');
  if (!phone) { if (resEl) { resEl.textContent = 'Enter a phone number'; resEl.className = 'alert alert-error'; resEl.classList.remove('hidden'); } return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
  if (resEl) resEl.classList.add('hidden');
  try {
    const r = await api('POST', '/whatsapp/test', { phone });
    if (resEl) { resEl.textContent = r.message; resEl.className = 'alert alert-success'; resEl.classList.remove('hidden'); }
  } catch (e) { if (resEl) { resEl.textContent = e.message; resEl.className = 'alert alert-error'; resEl.classList.remove('hidden'); } }
  finally { if (btn) { btn.disabled = false; btn.textContent = 'Test'; } }
}
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
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No guests found</td></tr>';
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
      <td>
        <span style="font-size:0.75rem;font-weight:700;padding:0.15rem 0.5rem;border-radius:4px;background:${g.ticket_type === 'D' ? '#dbeafe' : '#f1f5f9'};color:${g.ticket_type === 'D' ? '#1d4ed8' : '#475569'}">
          ${g.ticket_type === 'D' ? 'D' : 'S'}
        </span>
        ${g.ticket_type === 'D' && g.scan_count === 1 ? '<div style="font-size:0.68rem;color:var(--warning)">1/2 entered</div>' : ''}
      </td>
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
async function addGuest(name, phone, table_number, eventId, ticket_type) {
  return await api('POST', '/guests', { name, phone, table_number, event_id: eventId, ticket_type });
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

    const waStat = $('#wa-send-stats');
    if (waStat) {
      waStat.innerHTML = `<span style="font-size:0.8rem">${withPhone} guests with phone · ${alreadySent} already sent · ${notSent} pending</span>`;
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
  const eventId    = gid(state.currentEvent);
  const onlyUnsent = $('#wa-only-unsent') ? $('#wa-only-unsent').checked : true;
  const resultEl   = $('#wa-send-result');
  const btn        = $('#send-all-wa-btn');
  if (!confirm('Send QR e-ticket via WhatsApp to all guests' + (onlyUnsent ? ' who have not received one yet' : '') + '?')) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
  hideAlert(resultEl);
  try {
    const res = await api('POST', '/whatsapp/send-invites', { event_id: eventId, type: 'qr', only_unsent: onlyUnsent });
    const msg = 'Sent: ' + res.sent + (res.failed > 0 ? ' | Failed: ' + res.failed : '');
    showAlert(resultEl, msg, res.failed === 0 ? 'success' : 'error');
    loadSendTab();
  } catch (e) {
    showAlert(resultEl, 'Failed: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Send QR E-Ticket via WhatsApp'; }
  }
}
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
    // Use Fonnte API for automatic WhatsApp sending
    const btn = $(`#send-${type}-wa-btn`);
    if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
    try {
      const res = await api('POST', '/whatsapp/send-invites', { event_id: gid(ev), type });
      alert(`Done! Sent: ${res.sent}${res.failed > 0 ? `, Failed: ${res.failed}` : ''}`);
    } catch (e) {
      alert('Failed: ' + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = type === 'invite' ? 'Send via WhatsApp' : 'Send via WhatsApp'; }
    }
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
      const ticketTypeEl = document.querySelector('input[name="ticket-type"]:checked');
      const ticketType = ticketTypeEl ? ticketTypeEl.value : 'S';
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
        const guest = await addGuest(name, phone, table, eventId, ticketType);
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
          state.csvData.slice(0, 5).map(g => `• ${escHtml(g.name)}${g.phone ? ` (${escHtml(g.phone)})` : ''}${g.table_number ? ` [${escHtml(g.table_number)}]` : ''} — ${g.ticket_type === 'D' ? 'Double' : 'Single'}`).join('<br>') +
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

  // ── Fonnte Settings (wired directly - called after tab switch) ──
  // These are wired via switchTab → fetchSettings which re-queries DOM

  // ── CSV Download fallback ─────────────────────────────────
  const dlCsvBtn = $('#download-broadcast-csv-btn');
  if (dlCsvBtn) {
    dlCsvBtn.addEventListener('click', async () => {
      if (!state.currentEvent) return;
      const guests = await api('GET', `/guests?event_id=${gid(state.currentEvent)}`);
      const withPhone = guests.filter(g => g.phone && g.phone.trim());
      if (!withPhone.length) { alert('No guests with phone numbers.'); return; }
      const origin = window.location.origin;
      const rows = [['Name','Phone','Invitation Link','Code']];
      withPhone.forEach(g => {
        rows.push([g.name, g.phone, `${origin}/guest/${g.qr_token}`, (g.unique_id||'').substring(0,8).toUpperCase()]);
      });
      const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      a.download = `${state.currentEvent.name.replace(/\s+/g,'-')}-whatsapp.csv`;
      a.click();
    });
  }

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
