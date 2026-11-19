// Olympus phone notifications, the service-worker side (2026-11-19, owner: "I want notifications on my phone").
// jarvis/sw.js imports it at the top:  try { importScripts('./push-sw.js?v=p1'); } catch (e) { /* notifications are optional */ }
// The PC (engine/push.py) sends Web Push straight to this phone with its own key (no cloud, no GitHub): every real-account entry and
// exit ("Zlarior 50K: LONG opened", "Zlarior 50K: LONG closed +$605") and the important alerts of its 15-minute report.
//   push               every push shows ONE notification (an iPhone drops the subscription of an app that stays silent). A trade has
//                      its own tag: the exit closes the entry's notification and takes its place, so one trade = one notification.
//                      "silent" (quiet hours) = no sound; "require" stays on screen until tapped.
//   notificationclick  opens Olympus at the right page: a running Olympus gets {type: 'olympus:open', id} (push-ui.js opens that app,
//                      e.g. 'nq' for a trade, 'board' for the rest), else a new window at ./?open=<id>. A critical alert's tap (or its
//                      "Got it" button) also posts {"le": "ack", "id"} to the free relay (push_relay.json) so the PC stops repeating it.
//   pushsubscriptionchange  subscribes again with the same key; push-ui.js sends the new subscription to the PC on the next open.
//   message            {type: 'olympus:push-ping'} -> {push: 1}: push-ui.js subscribes only once this worker is the one in charge.
// Everything is in OLY_PUSH_SW (pure functions + the two handlers with their worker objects passed in) so tests can drive it.
// Safari 16: plain ES2020, no optional chaining. Read only: nothing here can trade.
(function (G) {
  'use strict';
  const ICON = 'icon-192.png?v=j5';
  const APP_RX = /^[a-z][a-z0-9-]{0,23}$/;
  const TAG_RX = /^[A-Za-z0-9_.:-]{1,64}$/;

  /** the app a notification opens: '#nq' / 'nq' -> 'nq'; anything else -> 'board' */
  function appOf(url) {
    const u = String(url == null ? '' : url);
    if (/^#\//.test(u)) return 'board';                  // the old app's routes (#/activity, #/today ...)
    const id = u.replace(/^#/, '').split(/[/?#]/)[0].toLowerCase();
    return APP_RX.test(id) ? id : 'board';
  }

  /** a push's data (JSON from engine/push.wire) -> {title, opts}; never throws */
  function build(d) {
    d = d && typeof d === 'object' ? d : {};
    const title = String(d.title || 'Olympus').slice(0, 120);
    const opts = {
      body: String(d.body || '').slice(0, 600), icon: ICON, badge: ICON, lang: 'en',
      data: { app: appOf(d.url), key: typeof d.key === 'string' ? d.key.slice(0, 120) : null, kind: typeof d.kind === 'string' ? d.kind.slice(0, 20) : null, t: +d.t || null },
      timestamp: +d.t > 0 ? +d.t * 1000 : Date.now(),
    };
    if (typeof d.tag === 'string' && TAG_RX.test(d.tag)) { opts.tag = d.tag; opts.renotify = !d.silent; }
    if (d.require) opts.requireInteraction = true;
    if (d.silent) opts.silent = true;
    if (typeof d.ack === 'string' && d.ack.length < 90) { opts.data.ack = d.ack; opts.actions = [{ action: 'ack', title: 'Got it' }]; opts.requireInteraction = true; }
    return { title, opts };
  }

  function parse(e) {
    try { return e && e.data ? e.data.json() : {}; } catch (_) {
      try { return { body: e.data.text() }; } catch (__) { return {}; }
    }
  }

  /** show one push: the older notification with the same tag goes first (the exit replaces the entry, even where a tag alone would not) */
  async function onPush(d, reg, clients) {
    const b = build(d);
    try {
      if (b.opts.tag && reg.getNotifications) {
        const old = await reg.getNotifications({ tag: b.opts.tag });
        for (const n of old || []) { try { n.close(); } catch (_) { /* gone already */ } }
      }
    } catch (_) { /* show it anyway */ }
    await reg.showNotification(b.title, b.opts);
    try {                                         // an open Olympus may refresh its numbers (push-ui.js listens)
      const cs = clients ? await clients.matchAll({ type: 'window', includeUncontrolled: true }) : [];
      for (const c of cs) c.postMessage({ type: 'olympus:push', kind: b.opts.data.kind, app: b.opts.data.app });
    } catch (_) { /* nobody to tell */ }
    return b;
  }

  /** the relay "Got it" for a critical alert (engine/alerts_plus reads {"le": "ack", "id"} and stops the repeats) */
  async function ack(id, fetchFn, scope) {
    const f = fetchFn || (typeof fetch === 'function' ? fetch : null);
    if (!f || typeof id !== 'string' || !id) return false;
    try {
      const r = await f(new URL('../push_relay.json', scope).href, { cache: 'no-store' });
      const j = await r.json();
      if (!j || !/^[A-Za-z0-9_-]{1,64}$/.test(String(j.topic || ''))) return false;
      const base = String(j.ntfy || 'https://ntfy.sh').replace(/\/+$/, '');
      if (!/^https:\/\//.test(base)) return false;
      const p = await f(base + '/' + encodeURIComponent(j.topic), { method: 'POST', body: JSON.stringify({ le: 'ack', id, t: Math.round(Date.now() / 1000) }) });
      return !!(p && p.ok);
    } catch (_) { return false; }
  }

  /** a tapped notification: open Olympus at its page (a running one is told; else a new window). action 'ack' = only Got it */
  async function onClick(n, action, clients, scope, fetchFn) {
    const data = (n && n.data) || {};
    const app = appOf(data.app);
    if (data.ack) await ack(data.ack, fetchFn, scope);
    if (action === 'ack') return { app: null, acked: !!data.ack };
    const cs = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const mine = cs.find((c) => typeof c.url === 'string' && c.url.indexOf(scope) === 0);
    if (mine) {
      mine.postMessage({ type: 'olympus:open', id: app });
      if (mine.focus) { try { await mine.focus(); } catch (_) { /* iOS may refuse: the page still opens the app */ } }
      return { app, focused: true };
    }
    if (clients.openWindow) await clients.openWindow(scope + '?open=' + encodeURIComponent(app));
    return { app, opened: true };
  }

  const API = { appOf, build, parse, onPush, onClick, ack };
  G.OLY_PUSH_SW = API;
  // the real worker: a ServiceWorkerGlobalScope has registration, clients and skipWaiting (a page or node only gets the API)
  if (G && G.registration && G.clients && typeof G.skipWaiting === 'function' && typeof G.addEventListener === 'function') {
    G.addEventListener('push', (e) => {
      const d = parse(e);
      e.waitUntil(onPush(d, G.registration, G.clients).catch(() => G.registration.showNotification('Olympus', { body: String((d && d.body) || 'New alert from your PC').slice(0, 600), icon: ICON })));
    });
    G.addEventListener('notificationclick', (e) => {
      try { e.notification.close(); } catch (_) { /* closed */ }
      e.waitUntil(onClick(e.notification, e.action, G.clients, G.registration.scope).catch(() => (G.clients.openWindow ? G.clients.openWindow(G.registration.scope) : null)));
    });
    // push-ui.js asks before it subscribes: only a worker with these handlers may get pushes (an iPhone drops the subscription of an
    // app whose worker shows nothing, e.g. the previous Olympus worker still in charge right after an update)
    G.addEventListener('message', (e) => {
      const d = e && e.data;
      if (d && d.type === 'olympus:push-ping' && e.ports && e.ports[0]) e.ports[0].postMessage({ push: 1, v: 1 });
    });
    G.addEventListener('pushsubscriptionchange', (e) => {
      const key = e.oldSubscription && e.oldSubscription.options && e.oldSubscription.options.applicationServerKey;
      if (!key) return;
      e.waitUntil(G.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }).catch(() => null));
    });
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof self !== 'undefined' ? self : globalThis);
