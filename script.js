/* Senior Master Carwash - booking logic (vanilla JS) */
(function () {
  'use strict';

  /* ---------- Data: all official prices live here ----------
     price: number = confirmed (PHP). null = "Price to be confirmed". */
  const SIZE_LABELS = { small: 'Small', medium: 'Medium', large: 'Large', xl: 'Extra Large', xxl: 'Extra XL' };
  const VEHICLE_SIZES = {
    motorcycle: ['small', 'medium'],
    taxi: ['small', 'medium'],
    car: ['small', 'medium', 'large', 'xl', 'xxl']
  };
  const SERVICES = {
    'moto-wash': { label: 'Wash + Tire Black', category: 'wash', vehicles: ['motorcycle'], prices: { small: 120, medium: 150 } },
    'moto-wax': { label: 'Wash & Wax (with Tire Black)', category: 'wash', vehicles: ['motorcycle'], prices: { small: 150, medium: 180 } },
    'taxi-wash': { label: 'Wash + Tire Black', category: 'wash', vehicles: ['taxi'], prices: { small: null, medium: 120 } },
    'car-b2z': { label: 'Car Wash - Back 2 Zero', category: 'wash', vehicles: ['car'], prices: { small: 350, medium: 450, large: 450, xl: 550 } }, // Medium-Large rate = 450
    'car-express': { label: 'Express Wash', category: 'wash', vehicles: ['car'], prices: { small: 150, medium: 200, large: 220, xl: 270, xxl: 320 } },
    'car-ultimate': { label: 'Ultimate Wash', category: 'wash', vehicles: ['car'], prices: { small: 270, medium: 380, large: 420, xl: 450, xxl: 470 } },
    'car-diamond': { label: 'Diamond Wash', category: 'wash', vehicles: ['car'], prices: { small: 700, medium: 800, large: 900, xl: 1000, xxl: 1100 } },
    'interior': { label: 'Interior Detailing', category: 'detailing', vehicles: ['car'], prices: { small: 3000, medium: 3500, large: 4000, xl: 4500 } },
    'exterior': { label: 'Exterior Detailing', category: 'detailing', vehicles: ['car'], prices: { small: 3500, medium: 4500, large: 5500, xl: 6500 } },
    'other-buff': { label: 'Machine Buff', category: 'other', vehicles: ['motorcycle', 'taxi', 'car'], prices: {} },
    'other-vacuum': { label: 'Vacuum', category: 'other', vehicles: ['motorcycle', 'taxi', 'car'], prices: {} },
    'other-engine': { label: 'Engine Wash', category: 'other', vehicles: ['motorcycle', 'taxi', 'car'], prices: {} },
    'other-headlight': { label: 'Headlight Restoration', category: 'other', vehicles: ['motorcycle', 'taxi', 'car'], prices: {} },
    'other-rain': { label: 'Rain Water Marks Removal', category: 'other', vehicles: ['motorcycle', 'taxi', 'car'], prices: {} }
  };

  /* Time slots: the business has not given availability rules, so none are invented.
     Set to e.g. { start: '08:00', end: '20:00' } once the owner provides them. */
  const AVAILABLE_SLOTS = null;

  const STORAGE_KEY = 'smc_demo_bookings';
  const $ = (id) => document.getElementById(id);
  const form = $('booking-form');
  const f = {
    name: $('fullName'), phone: $('contactNumber'), type: $('vehicleType'), size: $('vehicleSize'),
    model: $('vehicleModel'), plate: $('plateNumber'), cat: $('serviceCategory'), service: $('serviceSelect'),
    date: $('bookingDate'), time: $('bookingTime'), notes: $('notes')
  };
  let submitting = false;
  let lastFocus = null;

  /* ---------- Pricing ---------- */
  function getPrice(serviceId, size) {
    const s = SERVICES[serviceId];
    if (!s || !size) return undefined;
    const p = s.prices[size];
    return typeof p === 'number' ? p : null; // null => unconfirmed
  }
  const peso = (n) => '₱' + n.toLocaleString('en-PH');

  /* ---------- Dropdowns ---------- */
  function fillSelect(select, items, placeholder) {
    select.textContent = '';
    const first = document.createElement('option');
    first.value = '';
    first.textContent = placeholder;
    select.appendChild(first);
    items.forEach(([value, label]) => {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = label;
      select.appendChild(o);
    });
    select.disabled = items.length === 0;
  }

  function updateSizes() {
    const sizes = VEHICLE_SIZES[f.type.value] || [];
    fillSelect(f.size, sizes.map((s) => [s, SIZE_LABELS[s]]), sizes.length ? 'Select size' : 'Select vehicle type first');
  }

  function updateServices(preselect) {
    const items = Object.entries(SERVICES)
      .filter(([, s]) => s.category === f.cat.value && s.vehicles.includes(f.type.value))
      .map(([id, s]) => [id, s.label]);
    const ph = !f.type.value || !f.cat.value ? 'Select vehicle type and category first' : (items.length ? 'Select service' : 'No services for this combination');
    fillSelect(f.service, items, ph);
    if (preselect && items.some(([id]) => id === preselect)) f.service.value = preselect;
  }

  /* ---------- Summary ---------- */
  function updateSummary() {
    const s = SERVICES[f.service.value];
    $('sum-service').textContent = s ? s.label : 'Not selected';
    const typeTxt = f.type.selectedOptions[0] && f.type.value ? f.type.selectedOptions[0].textContent : '';
    $('sum-vehicle').textContent = typeTxt ? typeTxt + (f.size.value ? ' - ' + SIZE_LABELS[f.size.value] : '') : 'Not selected';
    $('sum-date').textContent = f.date.value || 'Not selected';
    $('sum-time').textContent = f.time.value || 'Not selected';
    const price = getPrice(f.service.value, f.size.value);
    const warn = $('price-warning');
    if (price === undefined) { $('sum-price').textContent = 'Select a service and size'; warn.hidden = true; }
    else if (price === null) { $('sum-price').textContent = 'Price to be confirmed'; warn.hidden = false; }
    else { $('sum-price').textContent = peso(price); warn.hidden = true; }
  }

  /* ---------- Validation ---------- */
  function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  // Accepts 09XXXXXXXXX, +639XXXXXXXXX, 639XXXXXXXXX (spaces/dashes allowed)
  function validPhone(v) { return /^(09|\+?639)\d{9}$/.test(v.replace(/[\s-]/g, '')); }

  function validate() {
    const errors = {};
    if (!f.name.value.trim()) errors.fullName = 'Enter your full name.';
    if (!f.phone.value.trim()) errors.contactNumber = 'Enter your contact number.';
    else if (!validPhone(f.phone.value)) errors.contactNumber = 'Use a Philippine mobile number, e.g. 0917 123 4567.';
    if (!f.type.value) errors.vehicleType = 'Select a vehicle type.';
    if (!f.size.value) errors.vehicleSize = 'Select a vehicle size.';
    if (!f.model.value.trim()) errors.vehicleModel = 'Enter the vehicle make and model.';
    if (!f.cat.value) errors.serviceCategory = 'Select a service category.';
    if (!f.service.value) errors.serviceSelect = 'Select a service.';
    if (!f.date.value) errors.bookingDate = 'Choose a date.';
    else if (f.date.value < todayStr()) errors.bookingDate = 'The date cannot be in the past.';
    if (!f.time.value) errors.bookingTime = 'Choose a time.';
    else {
      if (AVAILABLE_SLOTS && (f.time.value < AVAILABLE_SLOTS.start || f.time.value > AVAILABLE_SLOTS.end)) {
        errors.bookingTime = 'Choose a time between ' + AVAILABLE_SLOTS.start + ' and ' + AVAILABLE_SLOTS.end + '.';
      } else if (f.date.value === todayStr()) {
        const now = new Date();
        const hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
        if (f.time.value < hhmm) errors.bookingTime = 'That time has already passed today.';
      }
    }
    return errors;
  }

  function showErrors(errors) {
    Object.keys(f).forEach((k) => {
      const el = f[k];
      const msg = errors[el.id] || '';
      const slot = $(el.id + '-error');
      if (slot) slot.textContent = msg;
      if (msg) { el.setAttribute('aria-invalid', 'true'); if (slot) el.setAttribute('aria-describedby', slot.id); }
      else { el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); }
    });
    const box = $('form-errors');
    const list = Object.values(errors);
    box.textContent = list.length ? 'Please fix ' + list.length + ' field' + (list.length > 1 ? 's' : '') + ' below.' : '';
    box.hidden = list.length === 0;
    if (list.length) {
      box.focus();
      const firstId = Object.keys(errors)[0];
      $(firstId).focus();
    }
  }

  /* ---------- Storage (demo only) ----------
     localStorage keeps data in THIS browser only. It does not send anything to the business. */
  function loadBookings() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch (e) { return []; }
  }
  function storeBookings(all) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); } catch (e) { /* storage unavailable */ }
  }
  function saveDemoBooking(b) {
    const all = loadBookings();
    all.push(b);
    storeBookings(all);
  }

  /* ---------- My Bookings (customer can review what they requested) ---------- */
  function niceDate(d) {
    const dt = new Date(d + 'T00:00:00');
    return isNaN(dt) ? d : dt.toLocaleDateString('en-PH', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' });
  }
  function niceTime(t) {
    const [h, m] = t.split(':').map(Number);
    return (h % 12 || 12) + ':' + String(m).padStart(2, '0') + ' ' + (h >= 12 ? 'PM' : 'AM');
  }
  function renderBookings(highlightRef) {
    const list = $('bookings-list');
    const all = loadBookings().slice().reverse(); // newest first
    list.textContent = '';
    const active = all.filter((b) => b.status !== 'cancelled').length;
    const badge = $('nav-count');
    badge.textContent = active;
    badge.hidden = active === 0;
    if (!all.length) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = 'You have no booking requests yet. Fill in the form above and your request will appear here.';
      list.appendChild(p);
      return;
    }
    all.forEach((b) => {
      const cancelled = b.status === 'cancelled';
      const card = document.createElement('article');
      card.className = 'booking-card' + (cancelled ? ' cancelled' : '') + (b.reference === highlightRef ? ' new' : '');
      card.id = 'bk-' + b.reference;
      const h = document.createElement('h3');
      const ref = document.createElement('span'); ref.textContent = b.reference;
      const st = document.createElement('span'); st.className = 'badge';
      st.textContent = cancelled ? 'Cancelled' : 'Request sent (demo)';
      h.append(ref, st);
      const dl = document.createElement('dl');
      [['Name', b.name], ['Contact', b.phone], ['Vehicle', b.vehicle], ['Service', b.service],
       ['Date', niceDate(b.date)], ['Time', niceTime(b.time)], ['Estimated price', b.price], ['Notes', b.notes || 'None']]
        .forEach(([k, v]) => {
          const dt = document.createElement('dt'); dt.textContent = k;
          const dd = document.createElement('dd'); dd.textContent = v;
          dl.append(dt, dd);
        });
      const actions = document.createElement('div');
      actions.className = 'booking-actions';
      const print = document.createElement('button');
      print.type = 'button'; print.className = 'btn btn-outline'; print.dataset.act = 'print'; print.textContent = 'Print';
      actions.appendChild(print);
      if (!cancelled) {
        const c = document.createElement('button');
        c.type = 'button'; c.className = 'btn btn-outline'; c.dataset.act = 'cancel'; c.dataset.ref = b.reference;
        c.textContent = 'Cancel request';
        actions.appendChild(c);
      }
      if (b.chat && b.chat.length) {
        const chat = document.createElement('div');
        chat.className = 'chat';
        renderChat(chat, b.chat);
        card.append(h, dl, chat, actions);
      } else card.append(h, dl, actions);
      list.appendChild(card);
    });
  }
  function onBookingAction(e) {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'print') { window.print(); return; }
    if (btn.dataset.act === 'cancel' && window.confirm('Cancel this booking request?')) {
      const all = loadBookings();
      const item = all.find((b) => b.reference === btn.dataset.ref);
      if (item) { item.status = 'cancelled'; storeBookings(all); }
      renderBookings();
    }
  }

  function makeRef() {
    return 'SMC-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 5).toUpperCase();
  }

  /* ---------- AI assistant ----------
     Set AI_ENDPOINT to YOUR server (see server.js). Never put an API key in this file:
     anyone can read it in the browser. If the endpoint is empty or fails, a built-in
     reply is used so the customer always gets an acknowledgement. */
  const AI_ENDPOINT = ''; // e.g. '/api/assistant'
  let currentRef = null;

  function localReply(b, question) {
    if (question) return 'Thanks for your question. I am an automated assistant and cannot answer that exactly. Please keep your reference ' + b.reference + ' and ask the Senior Master Carwash staff when you arrive.';
    let t = 'Hi ' + b.name.split(' ')[0] + ', we received your booking request ' + b.reference + ' for ' + b.service + ' on ' + niceDate(b.date) + ' at ' + niceTime(b.time) + '. ';
    t += b.price === 'Price to be confirmed' ? 'The price still needs to be confirmed by the business. ' : 'Estimated price: ' + b.price + '. ';
    if (b.notes) t += 'We noted your request: "' + b.notes + '". ';
    return t + 'This request is not confirmed until the business confirms it.';
  }

  async function askAssistant(b, question) {
    if (!AI_ENDPOINT) return localReply(b, question);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(AI_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking: { reference: b.reference, name: b.name, vehicle: b.vehicle, service: b.service, date: b.date, time: b.time, price: b.price, notes: b.notes }, chat: (b.chat || []).slice(-6), question: question || '' }),
        signal: ctrl.signal
      });
      if (!res.ok) throw new Error('bad status');
      const data = await res.json();
      if (typeof data.reply !== 'string' || !data.reply.trim()) throw new Error('empty');
      return data.reply.trim();
    } catch (e) {
      return localReply(b, question);
    } finally { clearTimeout(timer); }
  }

  function renderChat(el, chat) {
    el.textContent = '';
    (chat || []).forEach((m) => {
      const p = document.createElement('p');
      p.className = 'msg ' + m.role;
      p.textContent = (m.role === 'user' ? 'You: ' : 'Assistant: ') + m.text;
      el.appendChild(p);
    });
  }

  async function runAssistant(ref, question) {
    let all = loadBookings();
    let b = all.find((x) => x.reference === ref);
    if (!b) return;
    b.chat = b.chat || [];
    if (question) b.chat.push({ role: 'user', text: question });
    storeBookings(all);
    renderChat($('ai-log'), b.chat);
    $('ai-status').textContent = 'Assistant is writing a reply…';
    $('ai-ask').disabled = true;
    const reply = await askAssistant(b, question);
    all = loadBookings();
    b = all.find((x) => x.reference === ref);
    if (b) { b.chat = b.chat || []; b.chat.push({ role: 'assistant', text: reply }); storeBookings(all); }
    if (currentRef === ref && b) renderChat($('ai-log'), b.chat);
    $('ai-status').textContent = '';
    $('ai-ask').disabled = false;
    renderBookings();
  }

  /* ---------- Modal ---------- */
  function openModal(b) {
    $('modal-ref').textContent = b.reference;
    const dl = $('modal-details');
    dl.textContent = '';
    [['Name', b.name], ['Contact', b.phone], ['Vehicle', b.vehicle], ['Service', b.service],
     ['Date and time', niceDate(b.date) + ' at ' + niceTime(b.time)], ['Estimated price', b.price], ['Notes', b.notes || 'None']]
      .forEach(([k, v]) => {
        const dt = document.createElement('dt'); dt.textContent = k;
        const dd = document.createElement('dd'); dd.textContent = v;
        dl.append(dt, dd);
      });
    currentRef = b.reference;
    renderChat($('ai-log'), b.chat || []);
    $('ai-status').textContent = '';
    $('ai-q').value = '';
    lastFocus = document.activeElement;
    $('confirm-modal').hidden = false;
    $('modal-title').focus();
  }
  function closeModal() {
    $('confirm-modal').hidden = true;
    if (lastFocus) lastFocus.focus();
  }
  function resetForm() {
    form.reset();
    updateSizes();
    updateServices();
    showErrors({});
    updateSummary();
    submitting = false;
    $('submit-btn').disabled = false;
  }

  /* ---------- Submit ---------- */
  function onSubmit(e) {
    e.preventDefault();
    if (submitting) return; // prevent duplicate submissions
    const errors = validate();
    showErrors(errors);
    if (Object.keys(errors).length) return;
    submitting = true;
    $('submit-btn').disabled = true;
    const price = getPrice(f.service.value, f.size.value);
    const booking = {
      reference: makeRef(),
      name: f.name.value.trim(),
      phone: f.phone.value.trim(),
      vehicle: f.type.selectedOptions[0].textContent + ' (' + SIZE_LABELS[f.size.value] + '), ' + f.model.value.trim() + (f.plate.value.trim() ? ', ' + f.plate.value.trim().toUpperCase() : ''),
      service: SERVICES[f.service.value].label,
      date: f.date.value,
      time: f.time.value,
      price: typeof price === 'number' ? peso(price) : 'Price to be confirmed',
      notes: f.notes.value.trim(),
      status: 'demo-request',
      chat: []
    };
    saveDemoBooking(booking); // later: replace with fetch() to a real backend
    resetForm(); // clear the form and re-enable the button so it never stays stuck
    renderBookings(booking.reference);
    openModal(booking);
    runAssistant(booking.reference, '');
  }

  /* ---------- Navigation and Book Now buttons ---------- */
  function setupNav() {
    const toggle = $('nav-toggle'), menu = $('nav-menu');
    toggle.addEventListener('click', () => {
      const open = menu.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    menu.addEventListener('click', (e) => {
      if (e.target.closest('a')) { menu.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }
    });
    document.querySelectorAll('[data-book]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const id = btn.dataset.service, cat = btn.dataset.category;
        if (cat) f.cat.value = cat;
        if (id && SERVICES[id]) {
          // Preselect a compatible vehicle type if none chosen yet
          if (!f.type.value || !SERVICES[id].vehicles.includes(f.type.value)) {
            f.type.value = SERVICES[id].vehicles[0] === 'motorcycle' && SERVICES[id].vehicles.length > 1 ? '' : SERVICES[id].vehicles[0];
            updateSizes();
          }
        }
        updateServices(id);
        updateSummary();
        $('booking').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        f.name.focus({ preventScroll: true });
      });
    });
  }

  /* ---------- Init ---------- */
  function init() {
    f.date.min = todayStr();
    if (AVAILABLE_SLOTS) { f.time.min = AVAILABLE_SLOTS.start; f.time.max = AVAILABLE_SLOTS.end; }
    $('year').textContent = new Date().getFullYear();
    setupNav();
    f.type.addEventListener('change', () => { updateSizes(); updateServices(); updateSummary(); });
    f.cat.addEventListener('change', () => { updateServices(); updateSummary(); });
    [f.size, f.service, f.date, f.time].forEach((el) => el.addEventListener('change', updateSummary));
    form.addEventListener('submit', onSubmit);
    $('modal-close').addEventListener('click', closeModal);
    $('modal-new').addEventListener('click', () => { closeModal(); f.name.focus(); });
    $('modal-view').addEventListener('click', () => {
      closeModal();
      $('my-bookings').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
    $('bookings-list').addEventListener('click', onBookingAction);
    $('ai-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const q = $('ai-q').value.trim().slice(0, 300);
      if (!q || !currentRef) return;
      $('ai-q').value = '';
      runAssistant(currentRef, q);
    });
    $('confirm-modal').addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
    updateSummary();
    renderBookings();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
