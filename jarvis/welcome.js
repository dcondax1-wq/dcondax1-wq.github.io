/* OLYMPUS welcome (2026-11-10): a calm four-step card shown ONCE on the Home Screen app, in the Jarvis home.
 *   1  what OLYMPUS is (one sentence)
 *   2  pick three favourites (writes the same keys as the switcher 'jarvis.orb.fav' and the launcher 'oly.launcher.fav')
 *   3  notifications: optional, "Not now" is the default; the phone is only asked when you tap "Turn on"
 *   4  export your data weekly: a button that opens Settings > Data (Export all)
 * Seen once: localStorage 'olympus.welcome.v1' = {"t": seconds}. ?welcome=1 forces it (and does not save), ?welcome=0 never shows it.
 * Skipped for automated browsers (navigator.webdriver) unless ?welcome=1. Skip button on every step. AGORA look, taps >= 44 px, reduced motion = no animation.
 * Reads apps.js (names + glyphs) only; it never places an order and never sends anything. window.OLYMPUS_WELCOME = { open, close, state, STEPS }. */
(function () {
  'use strict';
  var KEY = 'olympus.welcome.v1', FAV_A = 'jarvis.orb.fav', FAV_B = 'oly.launcher.fav', MAX = 12, PICK = 3;
  var d = document, q = '';
  try { q = location.search || ''; } catch (e) { q = ''; }
  var forced = /[?&]welcome=1(?:&|$)/.test(q), never = /[?&]welcome=0(?:&|$)/.test(q);
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode: it shows again next time */ } }
  function el(tag, cls, text) { var e = d.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
  function favs() { try { var v = JSON.parse(get(FAV_A) || '[]'); return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string'; }) : []; } catch (e) { return []; } }
  function saveFavs(list) { var s = JSON.stringify(list.slice(0, MAX)); set(FAV_A, s); set(FAV_B, s); }
  var STEPS = [
    { id: 'what', title: 'Welcome to OLYMPUS', text: 'OLYMPUS is one calm home for your trading, your money and your day: every app reads your numbers and shows them in plain words, and none of them places an order.' },
    { id: 'favs', title: 'Pick 3 favourites', text: 'Tap three apps you will open most. They sit on top of the app switcher and the launcher. You can change them any time (press and hold an app).' },
    { id: 'notify', title: 'Turn on notifications?', text: 'Optional. Alerts reach you when something needs a look. Nothing is asked until you tap the button, and "Not now" is fine.' },
    { id: 'export', title: 'Export your data weekly', text: 'Your journal, ledger, plans and goals live only on this phone. Once a week, save one file as a copy. It takes ten seconds.' }
  ];
  var CSS = '.olw{position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483200;display:flex;align-items:flex-end;justify-content:center;font-family:-apple-system,"SF Pro Text",system-ui,sans-serif}' +
    '.olw[hidden]{display:none}.olw .bd{position:absolute;left:0;top:0;right:0;bottom:0;background:rgba(20,17,14,.78)}' +
    '.olw .box{position:relative;width:100%;max-width:460px;max-height:92vh;max-height:92dvh;overflow-y:auto;box-sizing:border-box;padding:18px 18px calc(18px + env(safe-area-inset-bottom,0px));border-radius:16px 16px 0 0;background:#1d1914;border:1px solid #3a3228;border-bottom:0;color:#f3ece0;box-shadow:0 6px 18px rgba(0,0,0,.35)}' +
    '@media(min-width:520px){.olw{align-items:center}.olw .box{border-radius:16px;border-bottom:1px solid #3a3228}}' +
    '.olw .top{display:flex;align-items:center;justify-content:space-between;gap:10px}.olw .step{margin:0;color:#c8a24a;font:600 14px -apple-system,system-ui,sans-serif}' +
    '.olw .skip{min-height:44px;min-width:64px;padding:0 14px;border-radius:12px;border:1px solid #3a3228;background:transparent;color:#cfc4b2;font:600 15px -apple-system,system-ui,sans-serif;cursor:pointer}' +
    '.olw h2{margin:8px 0 6px;font:600 26px/1.15 "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;color:#f3ece0;padding-bottom:8px;border-bottom:1px solid #c8a24a}' +
    '.olw p.tx{margin:10px 0 12px;color:#cfc4b2;font-size:16px;line-height:1.5}.olw .note{margin:8px 0 0;color:#9a8f7d;font-size:14px}' +
    '.olw .picks{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:6px 0}' +
    '.olw .pk{position:relative;min-height:64px;padding:6px 4px;border-radius:12px;border:1px solid #3a3228;background:#26211b;color:#f3ece0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font:600 13px/1.15 -apple-system,system-ui,sans-serif;cursor:pointer}' +
    '.olw .pk i{font:700 18px/1 "Iowan Old Style",Georgia,serif;font-style:normal;color:#c8a24a}.olw .pk[aria-pressed="true"]{border-color:#c8a24a;background:#2e271f}.olw .pk[aria-pressed="true"]::after{content:"\\2605";position:absolute;top:3px;right:6px;color:#e0b060;font-size:12px}' +
    '.olw .acts{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}.olw .btn{flex:1 1 130px;min-height:48px;padding:0 16px;border-radius:12px;border:1px solid #9c6b3c;background:#26211b;color:#f3ece0;font:600 16px -apple-system,system-ui,sans-serif;cursor:pointer;text-align:center;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}' +
    '.olw .btn.go{background:#c8a24a;border-color:#e0c27a;color:#14110e}.olw .dots{display:flex;gap:6px;justify-content:center;margin-top:12px}.olw .dots i{width:8px;height:8px;border-radius:50%;background:#3a3228}.olw .dots i.on{background:#c8a24a}' +
    '.olw h2:focus{outline:none}.olw :focus-visible{outline:2px solid #e0b060;outline-offset:2px}.olw:not(.calm) .box{animation:olwUp .3s ease-out}@keyframes olwUp{from{transform:translateY(20px);opacity:0}to{transform:none;opacity:1}}' +
    '@media(prefers-reduced-motion:reduce){.olw *{animation:none!important;transition:none!important}}';
  var st = { i: 0, open: false, root: null, apps: [], picked: [], note: '' };
  function calm() { try { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }
  function done() { if (!forced) set(KEY, JSON.stringify({ t: Math.round(Date.now() / 1000) })); close(); }
  function close() { if (!st.open) return; st.open = false; st.root.hidden = true; d.documentElement.style.overflow = ''; }
  function loadApps(cb) {
    try { import('./apps.js').then(function (m) { st.apps = (m.BUILT_INS || []).filter(function (a) { return a && a.id && a.id !== 'zenith'; }).map(function (a) { return { id: a.id, name: a.name, glyph: a.glyph || a.name.charAt(0) }; }); cb(); }, function () { cb(); }); }
    catch (e) { cb(); }
  }
  function render() {
    var s = STEPS[st.i], box = st.root.firstChild.nextSibling;
    while (box.firstChild) box.removeChild(box.firstChild);
    var top = el('div', 'top'); top.appendChild(el('p', 'step', 'Step ' + (st.i + 1) + ' of ' + STEPS.length));
    var sk = el('button', 'skip', 'Skip'); sk.type = 'button'; sk.setAttribute('aria-label', 'Skip the welcome'); sk.addEventListener('click', done); top.appendChild(sk); box.appendChild(top);
    var h = el('h2', '', s.title); h.id = 'olwT'; box.appendChild(h);
    box.appendChild(el('p', 'tx', s.text));
    var acts = el('div', 'acts');
    function btn(label, cls, fn) { var b = el('button', 'btn' + (cls ? ' ' + cls : ''), label); b.type = 'button'; b.addEventListener('click', fn); acts.appendChild(b); return b; }
    if (s.id === 'favs') {
      var grid = el('div', 'picks'); grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', 'Apps to favourite');
      var list = st.apps.length ? st.apps : [];
      list.forEach(function (a) {
        var b = el('button', 'pk'); b.type = 'button'; b.setAttribute('data-app', a.id); b.setAttribute('aria-pressed', String(st.picked.indexOf(a.id) >= 0));
        b.appendChild(el('i', '', a.glyph)); b.appendChild(el('span', '', a.name));
        b.addEventListener('click', function () {
          var i = st.picked.indexOf(a.id);
          if (i >= 0) st.picked.splice(i, 1); else if (st.picked.length < PICK) st.picked.push(a.id); else { st.picked.shift(); st.picked.push(a.id); }
          saveFavs(st.picked.concat(favs().filter(function (x) { return st.picked.indexOf(x) < 0 && st.apps.every(function (z) { return z.id !== x; }); })));
          render();
        });
        grid.appendChild(b);
      });
      if (!list.length) grid.appendChild(el('p', 'note', 'The app list is not available right now. You can pick favourites later in the switcher.'));
      box.appendChild(grid); box.appendChild(el('p', 'note', st.picked.length + ' of ' + PICK + ' picked'));
    }
    if (s.id === 'notify') {
      if (st.note) box.appendChild(el('p', 'note', st.note));
      else box.appendChild(el('p', 'note', 'On the iPhone, alerts need OLYMPUS on your Home Screen. You can change this later in Settings.'));
      btn('Turn on', '', function () {
        try {
          if (!('Notification' in window)) { st.note = 'This phone does not offer notifications here. That is fine.'; render(); return; }
          Notification.requestPermission().then(function (r) { st.note = r === 'granted' ? 'Notifications are on.' : 'Not turned on. You can change it later.'; render(); }, function () { st.note = 'Not turned on. You can change it later.'; render(); });
        } catch (e) { st.note = 'Not turned on. You can change it later.'; render(); }
      });
      btn('Not now', 'go', function () { st.i++; render(); });
      box.appendChild(acts);
    } else if (s.id === 'export') {
      var a = el('a', 'btn', 'Open export'); a.href = '../settings/?tab=data'; a.addEventListener('click', function () { if (!forced) set(KEY, JSON.stringify({ t: Math.round(Date.now() / 1000) })); });
      acts.appendChild(a); btn('Done', 'go', done); box.appendChild(acts);
    } else {
      if (st.i > 0) btn('Back', '', function () { st.i--; render(); });
      btn('Next', 'go', function () { st.i++; render(); });
      box.appendChild(acts);
    }
    var dots = el('div', 'dots'); dots.setAttribute('aria-hidden', 'true');
    STEPS.forEach(function (x, k) { dots.appendChild(el('i', k === st.i ? 'on' : '')); }); box.appendChild(dots);
    try { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } catch (e) { /* fine */ }
  }
  function build() {
    if (st.root) return;
    var s = d.createElement('style'); s.textContent = CSS; (d.head || d.documentElement).appendChild(s);
    var r = el('div', 'olw'); r.hidden = true; r.setAttribute('role', 'dialog'); r.setAttribute('aria-modal', 'true'); r.setAttribute('aria-labelledby', 'olwT');
    var bd = el('div', 'bd'); bd.addEventListener('click', function () { /* a tap outside never skips by accident: use Skip */ });
    var box = el('div', 'box'); r.appendChild(bd); r.appendChild(box);
    r.addEventListener('keydown', function (e) { if (e.key === 'Escape') done(); });
    d.body.appendChild(r); st.root = r;
  }
  function open() {
    if (st.open) return;
    build(); st.open = true; st.i = 0; st.note = ''; st.picked = favs().slice(0, PICK);
    st.root.classList.toggle('calm', calm()); st.root.hidden = false; d.documentElement.style.overflow = 'hidden';
    loadApps(function () { if (st.open) render(); }); render();
  }
  function should() {
    if (never) return false;
    if (forced) return true;
    try { if (navigator.webdriver) return false; } catch (e) { /* real phone */ }
    return !get(KEY);
  }
  window.OLYMPUS_WELCOME = { open: open, close: close, STEPS: STEPS, state: function () { return { open: st.open, step: st.i, picked: st.picked.slice(), seen: !!get(KEY) }; } };
  function start() { if (should()) setTimeout(open, 1200); }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start); else start();
}());
