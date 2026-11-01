/* ============ Бронирование: календарь, номера, предоплата ============ */
(function () {
  'use strict';

  var STORE_KEY = 'pride.bookings.v1';
  var state = {
    checkIn: null,
    checkOut: null,
    adults: 2,
    children: 0,
    roomId: null,
    prepay: 0,
    cursor: startOfMonth(new Date()),
    guest: null
  };

  /* ---------- утилиты дат ---------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function key(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
  function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function maxMonth() { var t = today(); return new Date(t.getFullYear(), t.getMonth() + 14, 1); }
  function today() { var t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); }
  function diffDays(a, b) { return Math.round((b - a) / 86400000); }
  function sameDay(a, b) { return key(a) === key(b); }

  var MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  var MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  var DOW = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

  function plural(n, one, few, many) {
    var n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return one;
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return few;
    return many;
  }
  function nightsWord(n) { return plural(n, 'ночь', 'ночи', 'ночей'); }
  function fmtDate(d) { return d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()]; }
  function fmtDateLong(d) { return d.getDate() + ' ' + MONTHS_GEN[d.getMonth()]; }
  function fmtMoney(v) { return Math.round(v).toLocaleString('ru-RU') + ' ₽'; }

  /* ---------- доступность ---------- */
  function hash(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }
  function localBookings() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveLocal(list) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch (e) { }
  }
  function isFree(dateObj) {
    if (dateObj < today()) return false;
    var k = key(dateObj);
    var busy = localBookings();
    for (var i = 0; i < busy.length; i++) if (busy[i].dates.indexOf(k) >= 0) return false;
    var dow = dateObj.getDay();               // 5 = пятница, 6 = суббота
    var weekend = dow === 5 || dow === 6;
    var limit = weekend ? 34 : 20;            // выходные заняты чаще
    return hash(k) % 100 >= limit;
  }
  function rangeIsFree(from, to) {
    for (var d = new Date(from.getTime()); d < to; d = addDays(d, 1)) if (!isFree(d)) return false;
    return true;
  }

  /* ---------- цены ---------- */
  function nightPrice(room, date) {
    var dow = date.getDay();
    if (dow !== 5 && dow !== 6) return room.price;
    return Math.round(room.price * (1 + SEASON.weekendSurcharge) / 10) * 10;
  }
  function total(room) {
    if (!state.checkIn || !state.checkOut) return { sum: 0, nights: 0, items: [] };
    var sum = 0, items = [];
    for (var d = new Date(state.checkIn.getTime()); d < state.checkOut; d = addDays(d, 1)) {
      var p = nightPrice(room, d);
      sum += p;
      items.push({ date: new Date(d.getTime()), price: p });
    }
    return { sum: sum, nights: items.length, items: items };
  }
  function selectedRoom() {
    for (var i = 0; i < ROOMS.length; i++) if (ROOMS[i].id === state.roomId) return ROOMS[i];
    return null;
  }
  function prepaySum(sum) { return Math.round(sum * state.prepay / 100); }

  /* ---------- DOM ---------- */
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  /* ---------- календарь ---------- */
  function renderCalendar() {
    var wrap = $('#calendar');
    if (!wrap) return;
    wrap.innerHTML = '';
    var months = window.innerWidth <= 900 ? 1 : 2;
    for (var m = 0; m < months; m++) {
      wrap.appendChild(monthBlock(new Date(state.cursor.getFullYear(), state.cursor.getMonth() + m, 1)));
    }
    $('#calPrev').disabled = state.cursor <= startOfMonth(today());
    $('#calNext').disabled = state.cursor >= maxMonth();
  }

  function monthBlock(first) {
    first = startOfMonth(first);
    var box = el('div', 'cal-month');
    box.appendChild(el('div', 'cal-month__title', MONTHS[first.getMonth()] + ' ' + first.getFullYear()));

    var grid = el('div', 'cal-grid');
    DOW.forEach(function (d, i) { grid.appendChild(el('div', 'cal-dow' + (i > 4 ? ' is-weekend' : ''), d)); });

    var startDow = (first.getDay() + 6) % 7;   // пн = 0
    for (var i = 0; i < startDow; i++) grid.appendChild(el('div', 'cal-day is-empty'));

    var days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    for (var n = 1; n <= days; n++) {
      var date = new Date(first.getFullYear(), first.getMonth(), n);
      grid.appendChild(dayCell(date));
    }
    box.appendChild(grid);
    return box;
  }

  function dayCell(date) {
    var k = key(date);
    var free = isFree(date);
    var btn = el('button', 'cal-day');
    btn.type = 'button';
    btn.dataset.date = k;
    btn.innerHTML = '<span>' + date.getDate() + '</span>' + (free ? '<small>·</small>' : '');

    if (!free) { btn.classList.add('is-busy'); btn.disabled = true; }
    if (sameDay(date, today())) btn.classList.add('is-today');

    if (state.checkIn && sameDay(date, state.checkIn)) btn.classList.add('is-in');
    if (state.checkOut && sameDay(date, state.checkOut)) btn.classList.add('is-out');
    if (state.checkIn && state.checkOut && date > state.checkIn && date < state.checkOut) btn.classList.add('is-range');

    if (!free) btn.title = 'Занято';
    btn.addEventListener('click', function () { pickDate(date); });
    return btn;
  }

  function pickDate(date) {
    if (!state.checkIn || state.checkOut) {
      state.checkIn = date;
      state.checkOut = null;
    } else if (date.getTime() === state.checkIn.getTime()) {
      state.checkIn = null;
    } else if (date < state.checkIn) {
      state.checkIn = date;
      state.checkOut = null;
    } else {
      var nights = diffDays(state.checkIn, date);
      if (nights < SEASON.minNights) { state.checkIn = date; state.checkOut = null; }
      else if (nights > SEASON.maxNights) { toast('Максимальная длительность — ' + SEASON.maxNights + ' ночей'); return; }
      else if (!rangeIsFree(state.checkIn, date)) { toast('В выбранном периоде есть занятые даты'); return; }
      else state.checkOut = date;
    }
    update();
  }

  /* ---------- гости ---------- */
  function guestsText() {
    var a = state.adults, c = state.children, out = [];
    out.push(a + ' ' + plural(a, 'взрослый', 'взрослых', 'взрослых'));
    if (c) out.push(c + ' ' + plural(c, 'ребёнок', 'ребёнка', 'детей'));
    return out.join(', ');
  }

  /* ---------- номера ---------- */
  function renderRooms() {
    var wrap = $('#rooms');
    if (!wrap) return;
    wrap.innerHTML = '';
    var need = state.adults + state.children;
    var hint = $('#roomsHint');

    ROOMS.forEach(function (room) {
      var t = total(room);
      var fits = room.capacity.adults + room.capacity.children >= need;
      var card = el('button', 'room');
      card.type = 'button';
      card.dataset.room = room.id;
      if (!fits) card.classList.add('is-disabled');
      if (state.roomId === room.id && fits) card.classList.add('is-selected');

      var priceLine = state.checkIn && state.checkOut
        ? '<div class="room__price">' + fmtMoney(t.sum) + ' <i>за ' + t.nights + ' ' + nightsWord(t.nights) + '</i></div>'
        : '<div class="room__price">от ' + fmtMoney(room.price) + ' <i>/ ночь</i></div>';

      card.innerHTML =
        '<img class="room__img" src="' + room.photo + '" alt="' + room.name + '" loading="lazy">' +
        '<div class="room__body">' +
          '<div class="room__top"><span class="room__name">' + room.name + '</span></div>' +
          priceLine +
          '<div class="room__meta">' + room.size + ' · до ' + (room.capacity.adults + room.capacity.children) + ' гостей · ' + room.bed + '</div>' +
          '<div class="room__tags">' + room.features.slice(0, 4).map(function (f) { return '<span class="tag">' + f + '</span>'; }).join('') + '</div>' +
        '</div>' +
        '<span class="room__state">' + (fits ? (state.roomId === room.id ? 'Выбрано' : 'Свободен') : 'Мало мест') + '</span>';

      if (fits) card.addEventListener('click', function () {
        state.roomId = state.roomId === room.id ? null : room.id;
        update();
      });
      wrap.appendChild(card);
    });

    if (hint) {
      hint.textContent = (!state.checkIn || !state.checkOut)
        ? 'Сначала выберите даты — покажем точную стоимость'
        : 'Цены за ' + nightsOf() + ' ' + nightsWord(nightsOf()) + ' при выбранных датах';
    }
  }
  // маленький хелпер для подсказки
  function nightsOf() {
    if (!state.checkIn || !state.checkOut) return 0;
    return diffDays(state.checkIn, state.checkOut);
  }

  /* ---------- сводка ---------- */
  function update() {
    renderCalendar();
    renderRooms();

    var n = nightsOf();
    $('#dateIn').textContent = state.checkIn ? fmtDate(state.checkIn) : '—';
    $('#dateOut').textContent = state.checkOut ? fmtDate(state.checkOut) : '—';
    $('#nightsCount').textContent = n;
    $('#nightsWord').textContent = nightsWord(n);

    $('#adultsValue').textContent = state.adults;
    $('#childrenValue').textContent = state.children;
    $('#adultsWord').textContent = 'взрослых';
    $('#childrenWord').textContent = state.children === 1 ? 'ребёнок' : (state.children >= 2 && state.children <= 4 ? 'ребёнка' : 'детей');
    $('#sumGuests').textContent = guestsText();

    var room = selectedRoom();
    var t = room ? total(room) : { sum: 0, nights: n };

    $('#sumDates').textContent = (state.checkIn && state.checkOut)
      ? fmtDateLong(state.checkIn) + ' — ' + fmtDateLong(state.checkOut) + ', ' + n + ' ' + nightsWord(n)
      : 'выберите даты';
    $('#sumRoom').textContent = room ? room.name : 'не выбран';
    $('#sumNights').textContent = n;
    $('#sumNightsWord').textContent = nightsWord(n);
    $('#sumTotal').textContent = room ? fmtMoney(t.sum) : '—';

    var pay = prepaySum(t.sum);
    $('#prepayNow').textContent = !room ? '—' : (state.prepay ? fmtMoney(pay) : '0 ₽');
    $('#mPrepayNow').textContent = state.prepay ? fmtMoney(pay) : fmtMoney(t.sum);
    $('#mPaySum').textContent = fmtMoney(state.prepay ? pay : t.sum);

    var ready = !!(state.checkIn && state.checkOut && room);
    $('#toCheckout').disabled = !ready;
  }

  /* ---------- модальное окно ---------- */
  var modal, step = 1, lastBooking = null;

  function openModal() {
    if (!state.checkIn || !state.checkOut) {
      document.getElementById('booking').scrollIntoView({ behavior: 'smooth', block: 'start' });
      toast('Сначала выберите свободные даты в календаре');
      return;
    }
    if (!state.roomId) {
      document.getElementById('booking').scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast('Выберите номер');
      return;
    }
    modal = $('#bookingModal');
    modal.hidden = false;
    document.body.classList.add('is-locked');
    fillOrder();
    goStep(1);
  }
  function closeModal() {
    if (modal) modal.hidden = true;
    document.body.classList.remove('is-locked');
  }
  function goStep(n) {
    step = n;
    $$('#bmSteps .step').forEach(function (s) {
      var i = +s.dataset.step;
      s.classList.toggle('is-active', i === n);
      s.classList.toggle('is-done', i < n);
    });
    $$('.modal__body').forEach(function (p) { p.hidden = +p.dataset.panel !== n; });
    $('.modal__dialog').scrollTop = 0;
  }
  function orderRows() {
    var room = selectedRoom();
    var t = total(room);
    var pay = prepaySum(t.sum);
    return [
      ['Номер', room.name],
      ['Даты', fmtDateLong(state.checkIn) + ' — ' + fmtDateLong(state.checkOut)],
      ['Ночей', t.nights + ' ' + nightsWord(t.nights)],
      ['Гости', guestsText()],
      ['Итого', fmtMoney(t.sum)],
      [state.prepay ? 'Предоплата ' + state.prepay + '%' : 'Способ', state.prepay ? fmtMoney(pay) + ' сейчас, ' + fmtMoney(t.sum - pay) + ' при заезде' : 'оплата при заселении']
    ];
  }
  function fillOrder() {
    var html = orderRows().map(function (r, i, arr) {
      var cls = i >= arr.length - 2 ? ' order-card__row order-card__row--sum' : ' order-card__row';
      return '<div class="' + cls + '"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>';
    }).join('');
    $('#orderCard').innerHTML = html;
    $('#doneCard').innerHTML = html;
    var room = selectedRoom(), t = total(room);
    var pay = prepaySum(t.sum);
    $('#payLead').textContent = state.prepay
      ? 'Оплатите ' + state.prepay + '% стоимости — ' + fmtMoney(pay) + '. Остаток ' + fmtMoney(t.sum - pay) + ' вносится при заселении.'
      : 'Бронирование без предоплаты: вы оплатите ' + fmtMoney(t.sum) + ' при заселении. Сейчас карта не списывается.';
    $('#payBtn').textContent = state.prepay ? 'Оплатить ' + fmtMoney(pay) : 'Подтвердить бронь';
    $('#mPaySum').textContent = state.prepay ? fmtMoney(pay) : fmtMoney(t.sum);

    var cardBox = $('#cardFields');
    if (cardBox) cardBox.hidden = !state.prepay;
    var np = $('#noPayNote');
    if (np) np.hidden = !!state.prepay;
  }

  /* ---------- валидация ---------- */
  function setError(form, name, msg) {
    var input = form.querySelector('[name="' + name + '"]');
    var field = input.closest('.field');
    field.classList.toggle('is-error', !!msg);
    var em = field.querySelector('.err');
    if (em) em.textContent = msg || '';
  }
  function luhn(num) {
    var s = 0, alt = false;
    for (var i = num.length - 1; i >= 0; i--) {
      var d = +num[i];
      if (alt) { d *= 2; if (d > 9) d -= 9; }
      s += d; alt = !alt;
    }
    return num.length >= 16 && s % 10 === 0;
  }
  function validCard(num) {
    if (!/^\d{16}$/.test(num)) return false;
    if (/^(\d)\1{15}$/.test(num)) return false;
    return luhn(num) || /^[3-6]/.test(num) || /^2[2-7]/.test(num);
  }

  function init() {
    renderStatic();
    bindCalendar();
    bindGuests();
    bindPrepay();
    bindModal();
    bindCallback();
    update();
    window.addEventListener('resize', debounce(renderCalendar, 200));
  }

  /* ---------- статичный контент ---------- */
  function renderStatic() {
    var g = $('#gallery');
    if (g) {
      PHOTOS.forEach(function (p, i) {
        var item = el('button', 'gallery__item');
        item.type = 'button';
        var cls = i === 0 ? ' gallery__item--big' : (i === 1 || i === 4 ? ' gallery__item--wide' : '');
        if (cls) item.className += cls;
        item.innerHTML = '<img src="' + p.src + '" alt="' + p.alt + '" loading="lazy"><span>' + p.alt + '</span>';
        item.addEventListener('click', function () { window.Lightbox && Lightbox.open(i); });
        g.appendChild(item);
      });
    }

    var ag = $('#amenitiesGrid');
    if (ag) AMENITIES.forEach(function (a) {
      ag.appendChild(el('div', 'amenity reveal', '<h4>' + a.title + '</h4><ul>' +
        a.items.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</ul>'));
    });

    $('#aboutP1').textContent = HOTEL.about[0];
    $('#aboutP2').textContent = HOTEL.about[1];
    $('#docNote').textContent = HOTEL.documentNote;
    $('#addressLine').textContent = HOTEL.address;
    $('#mapsLink').href = HOTEL.mapsUrl;

    var d = $('#distances');
    HOTEL.distances.forEach(function (x) { d.appendChild(el('li', '', '<span>' + x.label + '</span><b>' + x.value + '</b>')); });

    var l = $('#landmarks');
    HOTEL.landmarks.forEach(function (x) { l.appendChild(el('li', '', x)); });

    var f = $('#faqList');
    if (f) FAQ.forEach(function (item) {
      var box = el('div', 'faq__item reveal');
      box.innerHTML = '<button class="faq__q" type="button">' + item.q + '</button><div class="faq__a"><p>' + item.a + '</p></div>';
      box.querySelector('.faq__q').addEventListener('click', function () {
        var open = box.classList.toggle('is-open');
        var a = box.querySelector('.faq__a');
        a.style.maxHeight = open ? a.scrollHeight + 'px' : 0;
      });
      f.appendChild(box);
    });
  }

  /* ---------- обработчики ---------- */
  function bindCalendar() {
    $('#calPrev').addEventListener('click', function () {
      state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() - 1, 1);
      fixCursor(); renderCalendar();
    });
    $('#calNext').addEventListener('click', function () {
      state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() + 1, 1);
      fixCursor(); renderCalendar();
    });    $('#calReset').addEventListener('click', function () {
      state.checkIn = state.checkOut = null; update();
    });
  }
  function fixCursor() {
    var min = startOfMonth(today());
    if (state.cursor < min) state.cursor = min;
    if (state.cursor > maxMonth()) state.cursor = maxMonth();
  }

  function bindGuests() {
    $$('.counter').forEach(function (c) {
      c.addEventListener('click', function (e) {
        var btn = e.target.closest('.counter__btn');
        if (!btn) return;
        var dir = +btn.dataset.dir;
        var type = c.dataset.counter;
        if (type === 'adults') state.adults = Math.min(8, Math.max(1, state.adults + dir));
        else state.children = Math.min(6, Math.max(0, state.children + dir));
        if (state.roomId) {
          var room = selectedRoom();
          if (room && room.capacity.adults + room.capacity.children < state.adults + state.children) state.roomId = null;
        }
        update();
      });
    });
  }

  function bindPrepay() {
    $$('input[name="prepay"]').forEach(function (r) {
      r.addEventListener('change', function () { state.prepay = +r.value; update(); });
    });
  }

  function bindModal() {
    $$('.js-open-booking').forEach(function (b) { b.addEventListener('click', openModal); });
    $('#toCheckout').addEventListener('click', openModal);
    $$('#bookingModal [data-close]').forEach(function (b) { b.addEventListener('click', closeModal); });
    $('#doneBtn').addEventListener('click', closeModal);
    $('#backTo1').addEventListener('click', function () { goStep(1); });

    /* шаг 1 */
    $('#guestForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target, ok = true;
      var name = f.fullname.value.trim();
      if (name.length < 3) { setError(f, 'fullname', 'Укажите имя и фамилию'); ok = false; } else setError(f, 'fullname', '');

      var digits = f.phone.value.replace(/\D/g, '');
      if (digits.length < 10) { setError(f, 'phone', 'Введите телефон не короче 10 цифр'); ok = false; } else setError(f, 'phone', '');

      if (!/^[^@\s]+@[^@\s]+\.[a-zA-Zа-яА-Я]{2,}$/.test(f.email.value.trim())) { setError(f, 'email', 'Проверьте адрес почты'); ok = false; } else setError(f, 'email', '');

      if (!ok) return;
      state.guest = {
        name: name,
        phone: f.phone.value.trim(),
        email: f.email.value.trim(),
        comment: f.comment.value.trim()
      };
      fillOrder();
      goStep(2);
    });

    /* маски */
    maskCard($('#payForm [name="card"]'));
    maskExpiry($('#payForm [name="expiry"]'));
    maskPhone($('#guestForm [name="phone"]'));

    /* шаг 2 */
    $('#payForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target, ok = true;
      var num = f.card.value.replace(/\s/g, '');

      if (state.prepay) {
        if (!validCard(num)) { setError(f, 'card', 'Номер карты не проходит проверку'); ok = false; } else setError(f, 'card', '');

        var nm = f.cardname.value.trim();
        if (nm.replace(/[^A-Za-z ]/g, '').split(/\s+/).filter(Boolean).length < 2) { setError(f, 'cardname', 'Имя латиницей, как на карте'); ok = false; } else setError(f, 'cardname', '');

        var exp = f.expiry.value;
        if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(exp)) { setError(f, 'expiry', 'ММ/ГГ'); ok = false; }
        else {
          var mm = +exp.slice(0, 2), yy = 2000 + +exp.slice(3);
          var end = new Date(yy, mm, 1);
          if (end < today()) { setError(f, 'expiry', 'Срок истёк'); ok = false; } else setError(f, 'expiry', '');
        }

        var cvc = f.cvc.value;
        if (!/^\d{3}$/.test(cvc)) { setError(f, 'cvc', '3 цифры'); ok = false; } else setError(f, 'cvc', '');
      }

      if (!ok) return;

      var btn = $('#payBtn');
      btn.classList.add('is-loading');
      setTimeout(function () {
        btn.classList.remove('is-loading');
        confirmBooking();
      }, 1600);
    });

    $('#icsBtn').addEventListener('click', downloadIcs);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (modal && !modal.hidden) closeModal();
        else if (window.Lightbox) Lightbox.close();
      }
    });
  }

  function confirmBooking() {
    var room = selectedRoom();
    var t = total(room);
    var pay = prepaySum(t.sum);
    var id = 'PRD-' + Date.now().toString(36).toUpperCase().slice(-6);

    /* свободные даты: помечаем период занятым */
    var dates = [];
    for (var d = new Date(state.checkIn.getTime()); d < state.checkOut; d = addDays(d, 1)) dates.push(key(d));
    var list = localBookings();
    list.push({ id: id, dates: dates });
    saveLocal(list);

    lastBooking = { id: id, room: room, from: state.checkIn, to: state.checkOut, total: t.sum, paid: state.prepay ? pay : 0 };

    if (window.Leads) {
      Leads.send({
        type: 'booking',
        bookId: id,
        name: state.guest.name,
        phone: state.guest.phone,
        email: state.guest.email,
        comment: state.guest.comment,
        dateIn: fmtDateLong(state.checkIn),
        dateOut: fmtDateLong(state.checkOut),
        nights: t.nights,
        guests: guestsText(),
        room: room.name,
        total: t.sum,
        prepayPct: state.prepay,
        prepaid: state.prepay ? pay : 0,
        rest: state.prepay ? t.sum - pay : t.sum,
        paid: state.prepay ? 'предоплата ' + state.prepay + '%' : 'оплата при заселении'
      });
    }

    $('#bookId').textContent = id;
    $('#doneMail').textContent = state.prepay
      ? 'Подтверждение и чек отправлены на ' + state.guest.email + '. Предоплата ' + fmtMoney(pay) + ' получена, остаток ' + fmtMoney(t.sum - pay) + ' — при заселении.'
      : 'Подтверждение отправлено на ' + state.guest.email + '. Оплата ' + fmtMoney(t.sum) + ' — при заселении.';

    goStep(3);
    state.checkIn = state.checkOut = null;
    state.roomId = null;
    update();
  }

  function downloadIcs() {
    if (!lastBooking) return;
    function dts(d) { return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); }
    var ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pride//Booking//RU', 'BEGIN:VEVENT',
      'UID:' + lastBooking.id + '@pride',
      'DTSTART;VALUE=DATE:' + dts(lastBooking.from),
      'DTEND;VALUE=DATE:' + dts(lastBooking.to),
      'SUMMARY:Гостевой дом «Прайд» — ' + lastBooking.room.name,
      'LOCATION:' + HOTEL.address,
      'DESCRIPTION:Бронь ' + lastBooking.id + '. Заезд после ' + HOTEL.checkIn + ', выезд до ' + HOTEL.checkOut + '.',
      'END:VEVENT', 'END:VCALENDAR'
    ].join('\r\n');
    var blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pride-' + lastBooking.id + '.ics';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  /* ---------- формы ---------- */
  function bindCallback() {
    var form = $('#callbackForm');
    if (!form) return;
    var fName = form.elements['name'];
    var fPhone = form.elements['phone'];
    maskPhone(fPhone);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var ok = true;
      if (fName.value.trim().length < 2) { fName.closest('.field').classList.add('is-error'); ok = false; }
      else fName.closest('.field').classList.remove('is-error');
      if (fPhone.value.replace(/\D/g, '').length < 10) { fPhone.closest('.field').classList.add('is-error'); ok = false; }
      else fPhone.closest('.field').classList.remove('is-error');
      if (!ok) return;
      if (window.Leads) {
        Leads.send({
          type: 'callback',
          name: fName.value.trim(),
          phone: fPhone.value.trim(),
          comment: 'Обратный звонок'
        });
      }
      $('#callbackMsg').textContent = 'Спасибо! Заявка принята — перезвоним на ' + fPhone.value;
      form.reset();
    });
  }

  function maskPhone(input) {
    if (!input) return;
    input.addEventListener('input', function () {
      var d = input.value.replace(/\D/g, '');
      if (d[0] === '8') d = '7' + d.slice(1);
      if (d[0] !== '7' && d.length) d = '7' + d;
      d = d.slice(0, 11);
      var out = '';
      if (d.length) out = '+7';
      if (d.length > 1) out += ' (' + d.slice(1, 4);
      if (d.length >= 5) out += ') ' + d.slice(4, 7);
      if (d.length >= 8) out += '-' + d.slice(7, 9);
      if (d.length >= 10) out += '-' + d.slice(9, 11);
      input.value = out;
    });
  }
  function maskCard(input) {
    if (!input) return;
    input.addEventListener('input', function () {
      var d = input.value.replace(/\D/g, '').slice(0, 16);
      input.value = d.replace(/(.{4})/g, '$1 ').trim();
    });
  }
  function maskExpiry(input) {
    if (!input) return;
    input.addEventListener('input', function () {
      var d = input.value.replace(/\D/g, '').slice(0, 4);
      input.value = d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d;
    });
  }

  function debounce(fn, ms) {
    var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  function toast(msg) {
    var t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(t._t);
    t._t = setTimeout(function () { t.hidden = true; }, 3200);
  }

  window.Booking = { init: init, toast: toast, isFree: isFree, update: update };
})();
