/* ============ Интерфейс лендинга ============ */
(function () {
  'use strict';

  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }

  /* ---------- header ---------- */
  var header = $('#header');
  function onScroll() {
    header.classList.toggle('is-stuck', window.scrollY > 20);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- бургер ---------- */
  var burger = $('#burger'), nav = $('#nav');
  burger.addEventListener('click', function () {
    burger.classList.toggle('is-open');
    nav.classList.toggle('is-open');
  });
  nav.addEventListener('click', function (e) {
    if (e.target.tagName === 'A') {
      burger.classList.remove('is-open');
      nav.classList.remove('is-open');
    }
  });

  /* ---------- смещение якорей под фиксированной шапкой ---------- */
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute('href');
    if (id.length < 2) return;
    var target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    var top = target.getBoundingClientRect().top + window.scrollY - 76;
    window.scrollTo({ top: top, behavior: 'smooth' });
  });

  /* ---------- слайдер героя ---------- */
  var slides = $$('.hero__slide');
  if (slides.length > 1) {
    var idx = 0;
    setInterval(function () {
      slides[idx].classList.remove('is-active');
      idx = (idx + 1) % slides.length;
      slides[idx].classList.add('is-active');
    }, 5200);
  }

  /* ---------- лайтбокс ---------- */
  var Lightbox = (function () {
    var box = $('#lightbox'), img = $('#lbImg'), cap = $('#lbCap'), current = 0;
    function show(i) {
      current = (i + PHOTOS.length) % PHOTOS.length;
      img.src = PHOTOS[current].src;
      img.alt = PHOTOS[current].alt;
      cap.textContent = (current + 1) + ' / ' + PHOTOS.length + ' — ' + PHOTOS[current].alt;
    }
    function open(i) { show(i); box.hidden = false; document.body.classList.add('is-locked'); }
    function close() { box.hidden = true; document.body.classList.remove('is-locked'); }
    $('#lbClose').addEventListener('click', close);
    $('#lbPrev').addEventListener('click', function (e) { e.stopPropagation(); show(current - 1); });
    $('#lbNext').addEventListener('click', function (e) { e.stopPropagation(); show(current + 1); });
    box.addEventListener('click', function (e) { if (e.target === box || e.target.tagName === 'FIGURE') close(); });
    document.addEventListener('keydown', function (e) {
      if (box.hidden) return;
      if (e.key === 'ArrowLeft') show(current - 1);
      if (e.key === 'ArrowRight') show(current + 1);
    });
    return { open: open, close: close };
  })();
  window.Lightbox = Lightbox;

  /* ---------- появление блоков ---------- */
  var pending = [];
  var io = null;
  if (typeof IntersectionObserver === 'function') {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { show(en.target); io.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
  }

  function show(node) {
    node.classList.add('is-visible');
    var i = pending.indexOf(node);
    if (i >= 0) pending.splice(i, 1);
  }

  /* запасной путь: если IntersectionObserver не сработал, показываем по скроллу */
  var checkTimer = null;
  function checkPending() {
    var vh = window.innerHeight;
    for (var i = pending.length - 1; i >= 0; i--) {
      var r = pending[i].getBoundingClientRect();
      if (r.top < vh * 0.92 && r.bottom > 0) show(pending[i]);
    }
  }
  function scheduleCheck() {
    if (checkTimer) return;
    checkTimer = setTimeout(function () { checkTimer = null; checkPending(); }, 80);
  }
  window.addEventListener('scroll', scheduleCheck, { passive: true });
  window.addEventListener('resize', scheduleCheck);
  window.addEventListener('load', scheduleCheck);

  function observeReveals() {
    $$('.section__head, .card, .amenity, .faq__item, .room, .gallery__item, .note').forEach(function (node) {
      if (!node.classList.contains('reveal')) {
        node.classList.add('reveal');
      }
      if (io) io.observe(node);
      if (pending.indexOf(node) < 0) pending.push(node);
    });
    scheduleCheck();
  }

  /* ---------- старт ---------- */
  window.Booking.init();
  observeReveals();

})();
