/* ============ Отправка заявок на сервер (Excel + уведомление) ============ */
window.Leads = (function () {
  'use strict';

  var ENDPOINT = '/api/leads';
  var QUEUE_KEY = 'pride.leads.pending';

  function utm() {
    var p = new URLSearchParams(location.search), parts = [];
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'yclid'].forEach(function (k) {
      var v = p.get(k);
      if (v) parts.push(k + '=' + v);
    });
    if (!parts.length && document.referrer) parts.push('ref=' + document.referrer.replace(/^https?:\/\//, '').split('/')[0]);
    return parts.join('&');
  }

  function queue(payload, reason) {
    try {
      var list = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
      list.push({ payload: payload, reason: reason, at: new Date().toISOString() });
      localStorage.setItem(QUEUE_KEY, JSON.stringify(list.slice(-30)));
    } catch (e) { }
    if (window.console && console.warn) console.warn('[leads] сервер недоступен, заявка сохранена локально:', reason);
  }

  function flush() {
    var list;
    try { list = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch (e) { return; }
    if (!list.length) return;
    localStorage.removeItem(QUEUE_KEY);
    list.forEach(function (item) { send(item.payload, true); });
  }

  function send(payload, isRetry) {
    payload.page = payload.page || location.href;
    payload.utm = payload.utm || utm();
    payload.ts = payload.ts || new Date().toISOString();

    return fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      if (!isRetry) flush();
      return r.json();
    }).catch(function (err) {
      if (!isRetry) queue(payload, err.message);
      return { ok: false, queued: true };
    });
  }

  window.addEventListener('load', flush);

  return { send: send, utm: utm };
})();
