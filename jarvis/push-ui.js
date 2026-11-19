// Olympus phone notifications, the page side (2026-11-19, owner: "I want notifications on my phone").
// One card on the home (#pushCard, under the ZEUS card). One tap on "Allow notifications" and this phone gets, from the owner's PC:
// every trade entry and exit on any real account ("Zlarior 50K: LONG opened", then "Zlarior 50K: LONG closed +$605" in the same
// notification) and the important alerts. No cloud, no GitHub, nothing to copy:
//   1. the PC's status post (../pc_feed.js, the free ntfy status topic, every 15 min) carries "wp": k = the PC's VAPID public key,
//      b = its box key, d = short ids of the phones it already sends to (engine/push.app_block);
//   2. Allow = pushManager.subscribe with k; the subscription is SEALED to b (ECDH P-256 + HKDF-SHA256 "le-push-sub-v1" + AES-GCM,
//      WebCrypto: only that PC can open it) and posted to the free relay topic (../push_relay.json) as {"le": "sub", "v": 2, "box"};
//   3. the PC's 5-minute ops task picks it up (engine/push.intake) and sends ONE welcome notification; its next status post lists
//      this phone in d, and the card says "on".
// Every open re-checks: the PC's key changed -> subscribe again with the new one and send it; the PC does not list this phone (it
// was off for 12 h+, or lost its list) -> send it again (at most every 30 min). "Send a test" / "Turn off" are sealed requests too,
// proved with this phone's own subscription secret. On an iPhone this works only in the Home Screen app (iOS 16.4+): a Safari tab
// gets "Add Olympus to your Home Screen first". A tapped notification opens its page (push-sw.js -> {type: 'olympus:open', id} or
// ./?open=<id>): window.__jarvis.show(id). Automated test browsers (navigator.webdriver) get no card unless localStorage
// 'olympus.push.force' = '1' (the other suites measure the home), like the OLYMPUS intro.
//   window.OLY_PUSH = { check(), allow(), test(), off(), notNow(), state(), seal(obj, boxKey), endpointId(url) }   (tests, the console)
// Never nagging (phone QA 2026-11-19): "Not now" hides the question for 7 days; "on" stays on the home one day, then only comes back
// when something needs a tap.
// Safari 16: plain ES2020, no optional chaining, no regex lookbehind. Read only: nothing here can trade.
(function () {
  'use strict';
  const LS = 'olympus.push';
  const INFO = 'le-push-sub-v1';
  const APP_RX = /^[a-z][a-z0-9-]{0,23}$/;
  const REPOST_MS = 30 * 60 * 1000;
  const KEY_RX = /^[A-Za-z0-9_-]{87}$/;
  const enc = new TextEncoder();
  let host = null, st = { state: 'loading' }, busy = false, lastCheck = 0, poll = 0, updTries = 0;

  const store = {
    get() { try { return JSON.parse(localStorage.getItem(LS) || 'null') || {}; } catch (e) { return {}; } },
    set(v) { try { localStorage.setItem(LS, JSON.stringify(v)); } catch (e) { /* private mode */ } },
    clear() { try { localStorage.removeItem(LS); } catch (e) { /* private mode */ } },
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function b64u(buf) {
    const a = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function bytes(s) {
    let t = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    const bin = atob(t), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /** seal a JSON object to the PC's box key: 65-byte ephemeral point + 12-byte nonce + AES-256-GCM (engine/push.unseal opens it) */
  async function seal(obj, boxKey) {
    const S = crypto.subtle;
    const pub = await S.importKey('raw', bytes(boxKey), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const eph = await S.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const secret = await S.deriveBits({ name: 'ECDH', public: pub }, eph.privateKey, 256);
    const hk = await S.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
    const key = await S.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode(INFO) }, hk, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await S.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj))));
    const raw = new Uint8Array(await S.exportKey('raw', eph.publicKey));
    const out = new Uint8Array(raw.length + iv.length + ct.length);
    out.set(raw, 0); out.set(iv, raw.length); out.set(ct, raw.length + iv.length);
    return b64u(out);
  }
  /** the PC's id of a phone: sha256 of its endpoint, 12 hex (engine/push.endpoint_id); the status post lists the first 8 */
  async function endpointId(url) {
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(String(url))));
    let s = '';
    for (let i = 0; i < 6; i++) s += h[i].toString(16).padStart(2, '0');
    return s;
  }

  function env() {
    const ua = navigator.userAgent || '';
    const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    let standalone = navigator.standalone === true;
    try { standalone = standalone || matchMedia('(display-mode: standalone)').matches; } catch (e) { /* old browser */ }
    const can = 'serviceWorker' in navigator && typeof window.PushManager !== 'undefined' && typeof window.Notification !== 'undefined' && !!(window.crypto && crypto.subtle);
    return { ios, standalone, can, device: /iPad/.test(ua) ? 'iPad' : ios ? 'iPhone' : /Android/.test(ua) ? 'Android' : 'computer' };
  }
  const later = (ms) => new Promise((ok) => setTimeout(ok, ms));
  async function registration() {
    try {
      const r = await navigator.serviceWorker.getRegistration('./');
      if (r) return r;
    } catch (e) { /* below */ }
    return Promise.race([navigator.serviceWorker.ready, later(8000).then(() => null)]).catch(() => null);
  }
  /** does the worker in charge show pushes (push-sw.js answers)? Right after an update the previous worker can still be in charge */
  function ping(w, ms) {
    return new Promise((ok) => {
      if (!w || typeof MessageChannel === 'undefined') { ok(false); return; }
      const ch = new MessageChannel();
      const t = setTimeout(() => ok(false), ms || 1500);
      ch.port1.onmessage = (e) => { clearTimeout(t); ok(!!(e.data && e.data.push)); };
      try { w.postMessage({ type: 'olympus:push-ping' }, [ch.port2]); } catch (e) { clearTimeout(t); ok(false); }
    });
  }
  async function workerReady(reg, swap) {
    if (await ping(reg.active)) return true;
    if (!swap) return false;
    try { await reg.update(); } catch (e) { /* offline: the waiting one, if any */ }
    const w = reg.waiting || reg.installing;
    if (w) { try { w.postMessage('jarvis:activate'); } catch (e) { /* not yet installed */ } }   // jarvis/sw.js takes over on this
    for (let i = 0; i < 16; i++) {
      await later(500);
      if (await ping(reg.active, 800)) return true;
    }
    return false;
  }
  async function feed() {
    for (let i = 0; i < 40 && !(window.PC_FEED && window.PC_FEED.fetchLatest); i++) await later(200);     // ../pc_feed.js loads async
    if (!(window.PC_FEED && window.PC_FEED.fetchLatest)) return null;
    try { return await window.PC_FEED.fetchLatest({ feedUrl: '../status_feed.json' }); } catch (e) { return null; }
  }
  async function pcKeys() {
    const j = await feed();
    const wp = j && j.wp;
    if (!wp || !KEY_RX.test(String(wp.k)) || !KEY_RX.test(String(wp.b))) return null;
    return { k: wp.k, b: wp.b, d: Array.isArray(wp.d) ? wp.d.map(String) : [], t: +j.t || 0 };
  }
  let relayCfg = null;
  async function relayPost(obj) {
    if (!relayCfg) {
      const r = await fetch('../push_relay.json', { cache: 'no-store' });
      const j = await r.json();
      if (!j || !/^[A-Za-z0-9_-]{1,64}$/.test(String(j.topic || ''))) throw new Error('no relay');
      relayCfg = { base: String(j.ntfy || 'https://ntfy.sh').replace(/\/+$/, ''), topic: j.topic };
    }
    const r = await fetch(relayCfg.base + '/' + encodeURIComponent(relayCfg.topic), { method: 'POST', body: JSON.stringify(obj) });
    if (!r.ok) throw new Error('relay ' + r.status);
    return true;
  }
  async function sendSealed(kind, body, wp) {
    const box = await seal(Object.assign({ le: kind, t: Math.round(Date.now() / 1000) }, body), wp.b);
    return relayPost({ le: kind, v: 2, box });
  }
  function sameKey(sub, k) {
    try {
      const a = new Uint8Array(sub.options.applicationServerKey), b = bytes(k);
      return a.length === b.length && a.every((v, i) => v === b[i]);
    } catch (e) { return store.get().key === k; }
  }
  async function postSub(sub, wp) {
    const j = sub.toJSON ? sub.toJSON() : sub;
    const id = await endpointId(j.endpoint);
    await sendSealed('sub', { sub: { endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth } }, key: wp.k, ua: env().device }, wp);
    store.set({ key: wp.k, id, posted: Date.now() });
    return id;
  }
  const subscribe = (reg, k) => reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(k) });

  /** where this phone stands; also does the automatic part (new key -> subscribe again, the PC lost it -> send it again) */
  async function check(opt) {
    const o = opt || {};
    const E = env();
    lastCheck = Date.now();
    if (!E.can) return set(E.ios && !E.standalone ? { state: 'homescreen' } : E.ios ? { state: 'old' } : { state: 'unsupported' });
    if (E.ios && !E.standalone) return set({ state: 'homescreen' });
    const perm = Notification.permission;
    if (perm === 'denied') return set({ state: 'blocked' });
    const reg = await registration();
    if (!reg || !reg.pushManager) return set({ state: 'unsupported' });
    let sub = null;
    try { sub = await reg.pushManager.getSubscription(); } catch (e) { sub = null; }
    const [wp, swOk] = await Promise.all([pcKeys(), workerReady(reg, false)]);
    if (perm !== 'granted') return set({ state: wp ? 'ready' : 'nopc', wp, reg, swOk });
    if (!sub && !swOk) {                                    // never subscribe a worker that cannot show the pushes
      if ((reg.installing || reg.waiting) && updTries++ < 10) setTimeout(() => { check(); }, 4000);   // a first install: it takes over soon
      return set({ state: 'update', wp, reg, swOk });
    }
    if (!sub && store.get().off) return set({ state: 'off', wp, reg, swOk });  // turned off here: stays off until Allow again
    if (!wp) return set({ state: sub ? 'waiting' : 'pcwait', reg, sub, note: sub ? 'Your PC has not reported for a while: it confirms when it is back.' : '' });
    if (sub && !sameKey(sub, wp.k)) {                       // the PC has a new key: this phone subscribes again with it
      try { await sub.unsubscribe(); } catch (e) { /* the old one dies on its own */ }
      sub = null;
    }
    if (!sub) {
      try { sub = await subscribe(reg, wp.k); } catch (e) { return set({ state: 'finish', wp, reg, swOk, note: 'The phone wanted one more tap to finish.' }); }
    }
    const id = await endpointId(sub.toJSON ? sub.toJSON().endpoint : sub.endpoint);
    const on = wp.d.indexOf(id.slice(0, 8)) >= 0;
    const s0 = store.get();
    let note = '';
    if (!on && (o.repost || s0.key !== wp.k || s0.id !== id || Date.now() - (+s0.posted || 0) > REPOST_MS)) {
      try { await postSub(sub, wp); } catch (e) { note = 'Could not reach the relay (no internet?): Olympus tries again by itself.'; }
    } else if (!on && Date.now() - (+s0.posted || 0) > 20 * 60 * 1000) {
      note = 'Your PC has not confirmed yet: keep it on. Olympus sends it again by itself.';
    }
    if (on && (!s0.on || !s0.onAt)) store.set(Object.assign({}, store.get(), { key: wp.k, id, on: true, onAt: +s0.onAt || Date.now() }));
    if (!on && s0.on) store.set(Object.assign({}, store.get(), { on: false }));
    return set({ state: on ? 'on' : 'waiting', wp, reg, sub, id, note, swOk });
  }

  /** the button (a real tap: an iPhone asks for permission only inside one) */
  async function allow() {
    if (busy) return st;
    busy = true;
    try {
      const E = env();
      if (!E.can || (E.ios && !E.standalone)) return check();
      const reg = st.reg, wp = st.wp;
      store.clear();                                       // a "Turn off" before is undone by this tap
      let p;
      if (reg && wp && reg.pushManager && st.swOk) {       // subscribe straight from the tap: one system question
        p = subscribe(reg, wp.k).then((sub) => postSub(sub, wp));
      } else {                                             // the question now (inside the tap); the subscription once ready
        p = Notification.requestPermission();
      }
      set(Object.assign({}, st, { state: 'asking', note: '' }));
      try { await p; } catch (e) { /* denied, or the PC key is not here yet */ }
      if (reg && !st.swOk) await workerReady(reg, true);  // the updated Olympus worker takes over first
      const out = await check({ repost: false });
      if (out.state === 'waiting' || out.state === 'pcwait') startPoll();
      return out;
    } finally { busy = false; }
  }
  async function test() {
    if (!st.sub || !st.wp || !st.id) return st;
    const j = st.sub.toJSON ? st.sub.toJSON() : st.sub;
    try {
      await sendSealed('test', { id: st.id, auth: j.keys.auth }, st.wp);
      return set(Object.assign({}, st, { note: 'Asked your PC: the test notification comes within 5 minutes.' }));
    } catch (e) {
      return set(Object.assign({}, st, { note: 'Could not reach the relay (no internet?). Try again in a minute.' }));
    }
  }
  async function off() {
    try {
      if (st.sub && st.wp && st.id) {
        const j = st.sub.toJSON ? st.sub.toJSON() : st.sub;
        try { await sendSealed('unsub', { id: st.id, auth: j.keys.auth }, st.wp); } catch (e) { /* the PC drops it when Apple says gone */ }
      }
      if (st.sub) await st.sub.unsubscribe();
    } catch (e) { /* nothing to undo */ }
    store.set({ off: true });
    return check();
  }
  function startPoll() {
    clearInterval(poll);
    let n = 0;
    poll = setInterval(() => { if (++n > 25 || st.state === 'on') { clearInterval(poll); return; } if (!document.hidden) check(); }, 60000);
  }

  // ------------------------------------------------------------------------------------------------ the card
  const WORDS = {
    loading: ['Phone notifications', 'Checking this phone…'],
    homescreen: ['Get every trade on this phone', 'Add Olympus to your Home Screen first: tap Share, then Add to Home Screen. Open Olympus from the Home Screen and tap Allow there.'],
    old: ['Phone notifications', 'This needs iOS 16.4 or later: iPhone Settings, General, Software Update.'],
    unsupported: ['Phone notifications', 'This browser cannot show Olympus notifications. On the iPhone, open Olympus from the Home Screen.'],
    blocked: ['Notifications are blocked', 'iPhone Settings, Notifications, Olympus: turn on Allow Notifications, then come back here.'],
    nopc: ['Get every trade on this phone', 'Every entry and exit on your accounts and the important alerts, straight from your PC. Tap Allow now: your PC finishes the setup with its next report (every 15 minutes while it is on).'],
    pcwait: ['Allowed on this phone', 'Your PC finishes the setup with its next report (every 15 minutes while it is on). Nothing else to do.'],
    ready: ['Get every trade on this phone', 'Every entry and exit on your accounts, with the account name, and the important alerts. Straight from your PC.'],
    asking: ['Get every trade on this phone', 'Tap Allow on the question the phone shows.'],
    finish: ['Almost there', 'Tap once more to finish.'],
    waiting: ['Notifications: on for this phone', 'Your PC confirms within 5 minutes with a welcome notification.'],
    on: ['Notifications on', 'Every trade and the important alerts come here.'],
    off: ['Notifications are off on this phone', 'Tap Allow to get every trade and the important alerts here again.'],
    update: ['Almost ready', 'Olympus is updating. Close Olympus (swipe it away), open it again from the Home Screen, then tap Try again.'],
  };
  function css() {
    if (document.getElementById('pushCss')) return;
    const s = document.createElement('style');
    s.id = 'pushCss';
    s.textContent = '.push-host{margin:0 var(--gxr,16px) 0 var(--gx,16px)}'
      + 'html:root[data-jlook="classic"] .home-in[data-home="v2"] > .push-host{order:1;margin-top:8px}'
      + '.pushc{border:1px solid rgba(200,162,74,.55);border-radius:14px;padding:12px 14px;background:rgba(29,25,20,.9);color:#f3ece0;font:15px/1.35 -apple-system,system-ui,sans-serif}'
      + '.pushc b{display:block;font-weight:650;font-size:16px}.pushc .pushc-s{display:block;margin-top:3px;color:#cfc4b2;font-size:14px}'
      + '.pushc .pushc-n{display:block;margin-top:6px;color:#e9d9a8;font-size:13px}.pushc .pushc-b{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}'
      + '.pushc button{min-height:44px;padding:0 16px;border-radius:11px;border:0;background:#c8a24a;color:#14110e;font:700 15px -apple-system,system-ui,sans-serif;cursor:pointer}'
      + '.pushc button.alt{background:transparent;border:1px solid #c8a24a;color:#f3ece0}.pushc button[disabled]{opacity:.55}'
      + '.pushc[data-state="on"]{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 8px 6px 14px}'
      + '.pushc[data-state="on"] .pushc-b{margin-top:0;flex:none}.pushc[data-state="on"] .pushc-s{display:none}';
    document.head.appendChild(s);
  }
  function buttons(state) {
    if (state === 'ready' || state === 'nopc' || state === 'finish' || state === 'off' || state === 'update') {
      return '<button type="button" data-push="allow">' + (state === 'finish' ? 'Finish' : state === 'update' ? 'Try again' : 'Allow notifications') + '</button>'
        + (state === 'ready' || state === 'nopc' || state === 'off' ? '<button type="button" class="alt" data-push="later">Not now</button>' : '');
    }
    if (state === 'asking') return '<button type="button" disabled>Allow notifications</button>';
    if (state === 'on') return '<button type="button" class="alt" data-push="test">Send a test</button><button type="button" class="alt" data-push="off">Turn off</button>';
    if (state === 'waiting') return '<button type="button" class="alt" data-push="off">Turn off</button>';
    return '';
  }
  // never nagging (phone QA 2026-11-19): "Not now" puts the question away for 7 days; once the PC confirms ("on") the card stays one more
  // day (to send a test), then leaves the home. It comes back by itself the moment something needs a tap (blocked, off, an update, the
  // PC lost this phone). Turning it off later: iPhone Settings, Notifications, Olympus.
  const SNOOZE_MS = 7 * 86400 * 1000, ON_SHOW_MS = 86400 * 1000;
  function quiet(state) {
    const s0 = store.get(), now = Date.now();
    if ((state === 'ready' || state === 'nopc' || state === 'off') && +s0.later > now) return true;
    if (state === 'on' && +s0.onAt > 0 && now - +s0.onAt > ON_SHOW_MS) return true;
    return false;
  }
  function notNow() {
    store.set(Object.assign({}, store.get(), { later: Date.now() + SNOOZE_MS }));
    render();
  }
  function render() {
    if (!host) return;
    css();
    const w = WORDS[st.state] || WORDS.loading;
    const b = buttons(st.state);
    const html = '<section class="pushc" data-state="' + esc(st.state) + '" aria-label="Phone notifications"><div class="pushc-t"><b>' + esc(w[0])
      + '</b><span class="pushc-s">' + esc(w[1]) + '</span>' + (st.note ? '<span class="pushc-n" role="status">' + esc(st.note) + '</span>' : '')
      + '</div>' + (b ? '<div class="pushc-b">' + b + '</div>' : '') + '</section>';
    if (host.__html !== html) { host.innerHTML = html; host.__html = html; }
    host.hidden = st.state === 'loading' || quiet(st.state);
    host.dataset.state = st.state;
  }
  function set(next) { st = next; render(); return st; }
  function state() { return { state: st.state, id: st.id || null, note: st.note || '', key: st.wp ? st.wp.k : null }; }

  // ------------------------------------------------------------------------------------------------ a tapped notification opens its page
  function openApp(id) {
    if (!APP_RX.test(String(id || ''))) return;
    const J = window.__jarvis;
    if (J && typeof J.show === 'function') { try { J.show(id); return; } catch (e) { /* below */ } }
    location.hash = '#' + id;
  }
  function whenReady(fn) {
    let n = 0;
    const t = setInterval(() => { if (document.documentElement.dataset.ready === '1' || ++n > 100) { clearInterval(t); fn(); } }, 150);
  }
  /** the state known at once, before any network (no jump of the home when the real check answers) */
  function first() {
    const E = env();
    if (!E.can) return E.ios && !E.standalone ? 'homescreen' : E.ios ? 'old' : 'unsupported';
    if (E.ios && !E.standalone) return 'homescreen';
    if (Notification.permission === 'denied') return 'blocked';
    if (Notification.permission === 'granted') return store.get().on ? 'on' : store.get().off ? 'off' : 'waiting';
    return 'ready';
  }

  function start() {
    // a tapped notification: the worker tells a running Olympus, or opens a new one at ./?open=<id>
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (e) => {
        const d = e && e.data;
        if (d && d.type === 'olympus:open' && (!e.origin || e.origin === location.origin)) openApp(d.id);
      });
      try { navigator.serviceWorker.startMessages(); } catch (e) { /* delivered after the load anyway */ }
    }
    let q = null;
    try { q = new URLSearchParams(location.search).get('open'); } catch (e) { q = null; }
    if (q) {
      whenReady(() => {
        openApp(q);
        try { history.replaceState(null, '', location.pathname); } catch (e) { /* stays */ }
      });
    }
    host = document.getElementById('pushCard');
    // automated test browsers never get the card (like the OLYMPUS intro) unless a test asks: the other suites measure the home
    let force = false;
    try { force = localStorage.getItem('olympus.push.force') === '1'; } catch (e) { force = false; }
    if (!host || (navigator.webdriver && !force)) { if (host) host.hidden = true; return; }
    host.addEventListener('click', (e) => {
      const b = e.target.closest('[data-push]');
      if (!b) return;
      const a = b.dataset.push;
      if (a === 'allow') allow();
      else if (a === 'later') notNow();
      else if (a === 'test') test();
      else if (a === 'off') off();
    });
    set({ state: first() });
    setTimeout(() => { check(); }, 900);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastCheck > 5 * 60 * 1000) check(); });
  }

  window.OLY_PUSH = { check, allow, test, off, notNow, state, seal, endpointId };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
