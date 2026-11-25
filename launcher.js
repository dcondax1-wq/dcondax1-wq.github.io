/* OLYMPUS launcher for Zenith (2026-11-04). ONE file, byte-identical in both dashboards (tools/web_public/launcher.js = web_next/js/next/launcher.js):
 * a button in the Zenith top bar opens a glass sheet with every OLYMPUS app. A classic deferred script, the only tag the page needs. The list
 * (olympus/apps-list.js on the phone, js/next/apps-list.js on the PC) is loaded by this script, async, 4 s after the page is up or when the sheet opens, so a
 * slow site never holds Zenith back (a deferred file would). The list is generated from jarvis/apps.js + olympus/olympus.js by tools/apps_list_build.py (window.OLYMPUS_APPS_LIST).
 *   top      a big "Open Olympus (Jarvis)" button, then a search box and your 4 most recent apps
 *   grid     the FOUR DOORS (2026-11-18, olympus/doors.js, docs/ORGANIZATION.md): ZEUS Trading / Money / Kalshi / More, each with its few
 *            shortcuts in plain words (chips: My accounts, Taxes, Bot's brain...) and then its apps as tiles (glyph in its own colour, name,
 *            one plain line, a status dot); a door's heading opens hub/doors.html#<door>. doors.js is loaded with the list (async); without it
 *            the old groups Trading / Life / Money. Search: every word of a door's shortcut or an app's plain words (OLYMPUS_DOORS.words).
 *   status   the dot comes from <app>/jarvis.json (fetched only when the sheet opens, 4 at a time, 5 s each, kept 5 min in
 *            localStorage 'oly.launcher.status'): green = running well, amber = needs a look, red = a problem, grey = not updated
 *            for 30 minutes, no dot = the app has no status card. A failed fetch keeps the last dot.
 *   links    phone (the site's own origin): the app's folder, "<app>/", in this tab. PC dashboard (localhost:8766 / web_next, which has no apps):
 *            the public site, https://dcondax1-wq.github.io/<app>/, in a new tab.
 *   recent   localStorage 'oly.launcher.recent' = ["oracle", ...], newest first, 4 kept.
 *   quality  LITE / reduced motion (ZenithFX when the page has it, else prefers-reduced-motion): no entrance animation, no glow sweep, no tilt.
 * Read-only: it only reads jarvis.json files and links to pages; it never posts, writes to a bot or touches an account.
 * window.OLYMPUS_LAUNCHER = { open(), close(), isOpen(), state() } (the tests). Never blank: without the list the sheet still has the Jarvis button. */
(function () {
  'use strict';
  if (window.OLYMPUS_LAUNCHER) return;
  var d = document, root = d.documentElement;
  var PUBLIC = (function () { var o = get('oly.public'); if (o && /^https:\/\/[^ ]+\/$/.test(o)) return o; return 'https://dcondax1-wq.github.io/'; })();   // the PC dashboard has no apps of its own: a site address saved as localStorage 'oly.public' overrides the default
  var RECENT_KEY = 'oly.launcher.recent', STATUS_KEY = 'oly.launcher.status', RECENT_MAX = 4, FAV_KEY = 'oly.launcher.fav', FAV_MAX = 12, PRESS_MS = 520, STATUS_TTL = 5 * 60 * 1000, GONE_TTL = 24 * 3600 * 1000, STALE_S = 30 * 60, FETCH_MS = 5000, PARALLEL = 4;
  var GROUPS = [['trading', 'Trading'], ['life', 'Life'], ['money', 'Money']];   // the old groups: only when olympus/doors.js did not load
  function doors() { var D = window.OLYMPUS_DOORS; return D && D.DOORS && D.DOORS.length ? D : null; }
  // Every app keeps its registry glyph and receives a small visual signature. These names are presentation only:
  // routes, status, order and the generated app list remain the existing sources of truth.
  var GLYPH_MOTION = { oracle:'scan', odeon:'curtain', fates:'thread', datacity:'rise', tree:'leaf', prometheus:'flame', pantheon:'lightning', ares:'shield', forum:'banner', labyrinth:'maze', argus:'blink', nemesis:'scale', chronos:'tick', hephaestus:'forge', cities:'flight', kalshicity:'flow', journal:'ripple', ledger:'vault', inbox:'letter', settings:'control', bridge:'portal', planner:'calendar', mind:'neuron', arena:'laurel', athena:'owl', kalshi:'market', tyche:'coin', hermes:'wing', plutus:'treasure', atlas:'cartography', observatory:'lens' };
  var isPC = false, base = '';                                  // decided at mount (the PC dashboard's own top bar is there, or port 8766)
  var st = { open: false, q: '', apps: [], tiles: {}, status: {}, fetching: false, lastFetch: 0, built: false, map: false };
  var els = {}, lastFocus = null;

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode: this visit only */ } }
  function json(k, fb) { try { var v = JSON.parse(get(k) || 'null'); return v == null ? fb : v; } catch (e) { return fb; } }
  function calm() {
    try { if (window.ZenithFX && (ZenithFX.still && ZenithFX.still() || ZenithFX.lite && ZenithFX.lite())) return true; } catch (e) { /* the media query below */ }
    try { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }
  function el(tag, cls, text) { var e = d.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
  function rgb(hex) { var h = String(hex || '#a855f7'); return [1, 3, 5].map(function (i) { return parseInt(h.substr(i, 2), 16) || 0; }).join(', '); }
  function url(path) { return base + path; }

  // ---------------------------------------------------------------- the list (Zenith itself is not in its own launcher)
  var listState = 'idle', waiters = [];                         // idle | loading | done | failed
  function loadList(cb) {
    if ((window.OLYMPUS_APPS_LIST && (doors() || listState !== 'idle')) || listState === 'failed' || listState === 'done') { if (cb) cb(); return; }
    if (cb) waiters.push(cb);
    if (listState === 'loading') return;
    listState = 'loading';
    var left = 0, fin = function () { if (--left > 0) return; listState = window.OLYMPUS_APPS_LIST ? 'done' : 'failed'; var w = waiters; waiters = []; w.forEach(function (f) { try { f(); } catch (e) { /* */ } }); };
    var add = function (src) { left++; var s = d.createElement('script'); s.async = true; s.src = src; s.onload = fin; s.onerror = fin; (d.head || root).appendChild(s); };
    if (!window.OLYMPUS_APPS_LIST) add(isPC ? '/js/next/apps-list.js?v=l15' : 'olympus/apps-list.js?v=l15');
    if (!doors()) add(isPC ? '/js/next/doors.js?v=d15' : 'olympus/doors.js?v=d15');      // the four doors (same file on both sites)
    if (!left) { left = 1; fin(); }
  }
  function apps() {
    var L = window.OLYMPUS_APPS_LIST;
    if (!L || !L.length) return [];
    var out = [], D = doors(), FIRST = ['cities', 'kalshi', 'nq', 'jarvis', 'agency', 'business', 'planner'];   // owner 2026-11-20 17:00 ET: the 6 arenas first, then Planner
    for (var i = 0; i < L.length; i++) if (L[i].id !== 'zenith' && L[i].path && !(D && D.retired && D.retired(L[i].id))) out.push(L[i]);   // retired: shown nowhere
    var rank = function (a) { var k = FIRST.indexOf(a.id); return k < 0 ? FIRST.length : k; };
    return out.map(function (a, i) { return [rank(a), i, a]; }).sort(function (x, y) { return x[0] - y[0] || x[1] - y[1]; }).map(function (x) { return x[2]; });
  }

  // ---------------------------------------------------------------- recent
  function recent() { var r = json(RECENT_KEY, []); return Array.isArray(r) ? r.filter(function (x) { return typeof x === 'string'; }).slice(0, RECENT_MAX) : []; }
  function touch(id) { var r = recent().filter(function (x) { return x !== id; }); r.unshift(id); set(RECENT_KEY, JSON.stringify(r.slice(0, RECENT_MAX))); }

  // favourites: long-press a tile (or press F on it) to star it; the stars sit on top of the sheet
  function favs() { var r = json(FAV_KEY, []); return Array.isArray(r) ? r.filter(function (x) { return typeof x === 'string'; }).slice(0, FAV_MAX) : []; }
  function toggleFav(id) { var f = favs(), i = f.indexOf(id); if (i >= 0) f.splice(i, 1); else f.push(id); set(FAV_KEY, JSON.stringify(f.slice(0, FAV_MAX))); try { if (navigator.vibrate) navigator.vibrate(10); } catch (e) { /* none on iPhone */ } render(); }

  // ---------------------------------------------------------------- status dots
  var WORDS = { ok: 'Running well', warn: 'Needs a look', bad: 'A problem', stale: 'Not updated for a while', off: 'Resting', none: 'No status card' };
  function level(card) {
    var lv = card && card.status && card.status.level, t = card && +card.t;
    if (lv !== 'ok' && lv !== 'warn' && lv !== 'bad' && lv !== 'off') return 'none';
    if (lv !== 'off' && t && Date.now() / 1000 - t > STALE_S) return 'stale';
    return lv;
  }
  function paintDot(id) {
    if (!els.body) return;
    var s = st.status[id], lv = s ? s.lv : 'none', label = s && s.label ? WORDS[lv] + ': ' + s.label : WORDS[lv];
    [].forEach.call(els.body.querySelectorAll('.oly-tile[data-app="' + id + '"]'), function (tile) {
      var dot = tile.querySelector('.oly-dot');
      dot.className = 'oly-dot ' + lv;
      dot.title = label; dot.setAttribute('aria-label', label);
      tile.setAttribute('data-status', lv);
    });
  }
  function fetchJson(u) {
    return new Promise(function (res) {
      var done = false, ac = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = setTimeout(function () { if (!done) { done = true; if (ac) ac.abort(); res(undefined); } }, FETCH_MS);
      fetch(u, { cache: 'no-cache', credentials: 'omit', signal: ac ? ac.signal : undefined }).then(function (r) { return r.ok ? r.json() : r.status === 404 ? false : null; }).then(function (j) {
        if (!done) { done = true; clearTimeout(timer); res(j); }
      }, function () { if (!done) { done = true; clearTimeout(timer); res(undefined); } });
    });
  }
  function loadStatus() {
    var saved = json(STATUS_KEY, {}); if (saved && typeof saved === 'object') for (var k in saved) if (!st.status[k] && saved[k] && saved[k].lv) st.status[k] = saved[k];
    st.apps.forEach(function (a) { paintDot(a.id); });
    // the list not loaded yet: nothing to ask, and the 2-minute pause must not start now (night-bugsweep: an open before the list arrived
    // used it up, so the dots stayed empty for 2 minutes)
    if (!st.apps.length || st.fetching || Date.now() - st.lastFetch < 2 * 60 * 1000) return;
    // a folder not on this site (its jarvis.json answered 404: mind/ on the public site, the vault stays on the PC) is not asked again for a
    // day (night-bugsweep 2026-11-19: it was a 404 in the console on every Refresh); its dot stays grey
    var gone = function (a) { var s = st.status[a.id]; return !!(s && s.gone && Date.now() - (s.at || 0) < GONE_TTL); };
    var fresh = Object.keys(st.status).length && st.apps.filter(function (a) { return a.live; }).every(function (a) { return st.status[a.id] && Date.now() - (st.status[a.id].at || 0) < (st.status[a.id].gone ? GONE_TTL : STATUS_TTL); });
    if (fresh) return;
    st.fetching = true; st.lastFetch = Date.now();
    var todo = st.apps.filter(function (a) { return a.live && !gone(a); }), i = 0, running = 0;
    function next() {
      while (running < PARALLEL && i < todo.length) {
        (function (a) {
          running++;
          fetchJson(url(a.path + 'jarvis.json')).then(function (card) {
            if (card === undefined) { /* no answer: the last dot stays */ }
            else if (card === false) { st.status[a.id] = { lv: 'none', label: 'not on this site', at: Date.now(), gone: 1 }; paintDot(a.id); }
            else { st.status[a.id] = { lv: level(card), label: card && card.status && card.status.label ? String(card.status.label).slice(0, 48) : '', at: Date.now() }; paintDot(a.id); }
            running--; next();
          });
        })(todo[i++]);
      }
      if (i >= todo.length && running === 0 && st.fetching) { st.fetching = false; set(STATUS_KEY, JSON.stringify(st.status)); }
    }
    next();
  }

  // ---------------------------------------------------------------- the sheet
  var CSS = [
    '.oly-lbtn{display:inline-grid;grid-auto-flow:column;align-items:center;justify-content:center;gap:7px;min-width:44px;height:44px;padding:0 11px;border-radius:12px;cursor:pointer;color:var(--ink-2,var(--oly-th-n30, #cfc4b2));',
    'background:var(--oly-th-n4, #1d1914);border:1px solid var(--oly-th-n8, #3a3228);font:700 12px/1 var(--oly-th-display, "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif);letter-spacing:.04em;transition:color .2s,border-color .2s}',
    '.oly-lbtn:hover,.oly-lbtn:focus-visible{color:var(--oly-th-n37, #f3ece0);border-color:var(--oly-th-a8, #c8a24a)}',
    '.oly-lbtn svg{width:18px;height:18px;display:block}.oly-lbtn .t{display:none}@media(min-width:900px){.oly-lbtn .t{display:inline}}',
    '.oly-lbtn.float{position:fixed;top:calc(10px + env(safe-area-inset-top,0px));right:calc(12px + env(safe-area-inset-right,0px));z-index:8000;background:var(--oly-th-n4, #1d1914)}',
    '.oly-l{position:fixed;left:0;top:0;right:0;bottom:0;z-index:9000;display:flex;align-items:flex-end;justify-content:center;font-family:-apple-system,"SF Pro Text",system-ui,sans-serif}',
    '.oly-l[hidden]{display:none}.oly-l .oly-bd{position:absolute;left:0;top:0;right:0;bottom:0;background:rgba(var(--oly-th-n3-rgb, 20,17,14),.72)}',
    '.oly-l .oly-pn{position:relative;width:100%;max-width:640px;max-height:92vh;max-height:92dvh;display:flex;flex-direction:column;border-radius:16px 16px 0 0;overflow:hidden;color:var(--oly-th-n37, #f3ece0);',
    'background:var(--oly-th-n4, #1d1914);border:1px solid var(--oly-th-n8, #3a3228);border-bottom:0;box-shadow:0 6px 18px rgba(0,0,0,.35)}',
    '.oly-l.pc{align-items:center}.oly-l.pc .oly-pn{border-radius:16px;border-bottom:1px solid var(--oly-th-n8, #3a3228);max-height:84vh;max-width:760px}',
    '.oly-l:not(.calm) .oly-pn{animation:olyUp .3s ease-out}.oly-l:not(.calm) .oly-bd{animation:olyFade .25s ease}',
    '@keyframes olyUp{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}@keyframes olyFade{from{opacity:0}to{opacity:1}}',
    '.oly-l .oly-hd{display:flex;align-items:center;gap:10px;padding:14px 16px 8px}.oly-l .oly-hd h2{flex:1;margin:0;font:700 20px/1.1 var(--oly-th-display, "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif);letter-spacing:.02em;color:var(--oly-th-a11, #e0c27a);border-bottom:1px solid var(--oly-th-a8, #c8a24a);padding-bottom:6px}',
    '.oly-l .oly-x{width:44px;height:44px;border-radius:50%;border:1px solid var(--oly-th-n8, #3a3228);background:var(--oly-th-n5, #26211b);color:var(--oly-th-n37, #f3ece0);font-size:22px;line-height:1;cursor:pointer}',
    '.oly-l .oly-sc{overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:4px 14px calc(18px + env(safe-area-inset-bottom,0px))}',
    '.oly-l .oly-jv{display:flex;align-items:center;gap:14px;width:100%;min-height:64px;padding:12px 16px;border-radius:16px;text-decoration:none;color:var(--oly-th-n37, #f3ece0);background:var(--oly-th-n5, #26211b);border:1px solid var(--oly-th-a8, #c8a24a)}',
    '.oly-l .oly-jv .oly-o{flex:none;display:grid;place-items:center;width:42px;height:42px;border-radius:50%;border:1.5px solid var(--oly-th-a8, #c8a24a);color:var(--oly-th-a11, #e0c27a);font:700 20px/1 var(--oly-th-display, "Iowan Old Style",Palatino,Georgia,serif)}',
    '.oly-l .oly-jv b{display:block;font:700 17px/1.2 var(--oly-th-display, "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif)}.oly-l .oly-jv small{display:block;margin-top:2px;font-size:13px;color:var(--oly-th-n30, #cfc4b2)}.oly-l .oly-jv .oly-go{margin-left:auto;font-size:24px;color:var(--oly-th-a11, #e0c27a)}',
    '.oly-l .oly-sr{position:relative;display:flex;gap:8px;margin:12px 0 4px}.oly-l .oly-sr input{flex:1;min-width:0;height:46px;border-radius:12px;border:1px solid var(--oly-th-n8, #3a3228);background:var(--oly-th-n3, #14110e);color:var(--oly-th-n37, #f3ece0);padding:0 14px;font:500 16px -apple-system,system-ui,sans-serif}',
    '.oly-l .oly-sr input:focus{border-color:var(--oly-th-a8, #c8a24a);outline:0}.oly-l .oly-sr input::placeholder{color:var(--oly-th-n22, #9a8f7d)}',
    '.oly-l .oly-mb{flex:none;min-width:64px;min-height:46px;padding:0 14px;border-radius:12px;border:1px solid var(--oly-th-a5, #9c6b3c);background:var(--oly-th-n5, #26211b);color:var(--oly-th-a11, #e0c27a);font:700 13px var(--oly-th-display, "Iowan Old Style",Palatino,Georgia,serif);cursor:pointer}',
    '.oly-l .oly-mb[aria-pressed="true"]{background:var(--oly-th-a8, #c8a24a);color:var(--oly-th-n3, #14110e)}',
    '.oly-l h3{margin:16px 2px 8px;font:700 15px/1.1 var(--oly-th-display, "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif);letter-spacing:.02em;color:var(--gc,var(--oly-th-a11, #e0c27a));border-bottom:1px solid var(--gc,var(--oly-th-a8, #c8a24a));padding-bottom:5px}',
    '.oly-l [data-group=trading]{--gc:var(--oly-th-a8, #c8a24a)}.oly-l [data-group=life]{--gc:#4b7a99}.oly-l [data-group=money]{--gc:var(--oly-th-g6, #7f8a52)}.oly-l .oly-fav{--gc:var(--oly-th-warn, #e0b060)}',
    '.oly-l [data-group=zeus]{--gc:var(--oly-th-a8, #c8a24a)}.oly-l [data-group=kalshi]{--gc:#c9b94e}.oly-l [data-group=more]{--gc:#d1a06a}.oly-l section[data-group=money]{--gc:#a0ac6e}',
    '.oly-l h3 a.oly-dh{display:flex;align-items:center;justify-content:space-between;min-height:40px;color:inherit;text-decoration:none}.oly-l h3 a.oly-dh em{font:600 12px -apple-system,system-ui,sans-serif;font-style:normal;color:var(--oly-th-n30, #cfc4b2)}',
    '.oly-l .oly-dks{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 9px}.oly-l .oly-dk{display:inline-flex;flex-direction:column;justify-content:center;min-height:44px;padding:4px 12px;border-radius:12px;box-sizing:border-box;text-decoration:none;',
    'color:var(--oly-th-n37, #f3ece0);background:var(--oly-th-n5, #26211b);border:1px solid var(--gc,var(--oly-th-n8, #3a3228))}.oly-l .oly-dk b{font:700 14px/1.15 -apple-system,system-ui,sans-serif}.oly-l .oly-dk small{font-size:11px;line-height:1.2;color:var(--oly-th-n24, #a89c88)}',
    '.oly-l.map .oly-dks{display:none}',
    '.oly-l .oly-rc{display:flex;gap:8px;overflow-x:auto;padding:2px 0 4px;scrollbar-width:none}.oly-l .oly-rc::-webkit-scrollbar{display:none}',
    '.oly-l .oly-chip{flex:none;display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 14px 0 8px;border-radius:999px;border:1px solid var(--oly-th-n8, #3a3228);background:var(--oly-th-n5, #26211b);color:var(--oly-th-n37, #f3ece0);text-decoration:none;font:600 14px -apple-system,system-ui,sans-serif}',
    '.oly-l .oly-chip i,.oly-l .oly-tile .oly-g{display:grid;place-items:center;font-style:normal;border-radius:50%;color:var(--c);background:rgba(var(--cr),.12);border:1.5px solid var(--c)}',
    '.oly-l .oly-chip i{width:28px;height:28px;font:700 14px/1 var(--oly-th-display, "Iowan Old Style",Palatino,Georgia,serif)}',
    '.oly-l .oly-gr{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.oly-l.pc .oly-gr{grid-template-columns:repeat(3,minmax(0,1fr))}',
    '.oly-l .oly-arc{margin:10px 0 0}.oly-l .oly-arc>summary{min-height:44px;display:flex;align-items:center;padding:0 4px;font:600 13px -apple-system,system-ui,sans-serif;color:var(--oly-th-n22, #9a8f7d);cursor:pointer;list-style:none}.oly-l .oly-arc>summary::-webkit-details-marker{display:none}.oly-l .oly-arc>summary::after{content:"\u203a";margin-left:8px;transition:transform .2s}.oly-l .oly-arc[open]>summary::after{transform:rotate(90deg)}.oly-l .oly-arc .oly-tile{opacity:.82}',
    '.oly-l .oly-tile{position:relative;display:flex;align-items:center;gap:11px;min-height:64px;padding:10px 12px;border-radius:16px;text-decoration:none;color:var(--oly-th-n37, #f3ece0);min-width:0;background:var(--oly-th-n5, #26211b);border:1px solid var(--oly-th-n8, #3a3228);border-left:3px solid var(--gc,var(--oly-th-a8, #c8a24a));-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}',
    '.oly-l .oly-tile:hover,.oly-l .oly-tile:focus-visible{border-color:var(--gc,var(--oly-th-a8, #c8a24a));outline:0}.oly-l .oly-tile:active{background:var(--oly-th-n6, #2e271f)}',
    '.oly-l .oly-tile .oly-g{flex:none;width:40px;height:40px;font:700 18px/1 var(--oly-th-display, "Iowan Old Style",Palatino,Georgia,serif)}',
    '.oly-l .oly-tile .oly-tx{min-width:0;display:flex;flex-direction:column;gap:2px}.oly-l .oly-tile b{font:700 15px/1.15 var(--oly-th-display, "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif);overflow-wrap:anywhere}',
    '.oly-l .oly-tile small{font-size:12px;line-height:1.25;color:var(--oly-th-n30, #cfc4b2);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}',
    '.oly-l .oly-star{position:absolute;right:8px;bottom:6px;color:var(--oly-th-warn, #e0b060);font-size:13px;line-height:1}',
    '.oly-l.map .oly-gr{grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.oly-l.map .oly-tile{flex-direction:column;justify-content:center;text-align:center;min-height:68px;padding:6px 3px;gap:3px;border-left:1px solid var(--oly-th-n8, #3a3228);border-top:3px solid var(--gc,var(--oly-th-a8, #c8a24a))}',
    '.oly-l.map .oly-tile small,.oly-l.map .oly-jv small,.oly-l.map .oly-ft{display:none}.oly-l.map .oly-tile .oly-g{width:30px;height:30px;font-size:15px}.oly-l.map .oly-tile b{font-size:12px}.oly-l.map .oly-tile .oly-tx{align-items:center}',
    '.oly-l.map .oly-sc h3{margin:10px 2px 6px}.oly-l.map.pc .oly-gr{grid-template-columns:repeat(6,minmax(0,1fr))}',
    '.oly-dot{position:absolute;top:9px;right:9px;width:9px;height:9px;border-radius:50%;background:transparent;border:1px solid var(--oly-th-n16, #6f6659)}',
    '.oly-dot.ok{background:var(--oly-th-g8, #a3ae6b);border-color:var(--oly-th-g8, #a3ae6b)}.oly-dot.warn{background:var(--oly-th-warn, #e0b060);border-color:var(--oly-th-warn, #e0b060)}.oly-dot.bad{background:var(--oly-th-r9, #e0795a);border-color:var(--oly-th-r9, #e0795a)}',
    '.oly-dot.stale,.oly-dot.off{background:var(--oly-th-n15, #68625c);border-color:var(--oly-th-n15, #68625c)}.oly-dot.none{display:none}',
    '.oly-l .oly-em{margin:18px 4px;text-align:center;color:var(--oly-th-n30, #cfc4b2);font-size:14px}.oly-l .oly-ft{margin:14px 2px 0;font-size:12px;color:var(--oly-th-n22, #9a8f7d);text-align:center}',
    '@media(prefers-reduced-motion:reduce){.oly-l *{animation:none!important;transition:none!important}}'
  ].join('');

  function build() {
    if (st.built) return;
    st.built = true;
    var style = el('style'); style.textContent = CSS; (d.head || root).appendChild(style);
    var o = el('div', 'oly-l' + (isPC ? ' pc' : '')); o.hidden = true; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-label', 'OLYMPUS apps');
    var bd = el('div', 'oly-bd'); bd.addEventListener('click', close);
    var pn = el('div', 'oly-pn');
    var hd = el('div', 'oly-hd'); hd.appendChild(el('h2', '', 'OLYMPUS'));
    var x = el('button', 'oly-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close the app launcher'); x.addEventListener('click', close);
    hd.appendChild(x);
    var sc = el('div', 'oly-sc');
    var jv = el('a', 'oly-jv'); jv.href = url('jarvis/'); jv.setAttribute('data-app', 'jarvis'); if (isPC) { jv.target = '_blank'; jv.rel = 'noopener'; }
    var jo = el('span', 'oly-o', 'Ο'); jo.setAttribute('aria-hidden', 'true');
    var jt = el('span'); jt.appendChild(el('b', '', 'Open Olympus (Jarvis)')); jt.appendChild(el('small', '', 'Talk to Jarvis, switch apps, see everything at once'));
    jv.appendChild(jo); jv.appendChild(jt); jv.appendChild(el('span', 'oly-go', '›'));
    jv.addEventListener('click', function () { close(); });
    var sr = el('div', 'oly-sr'), inp = el('input'); inp.type = 'search'; inp.placeholder = 'Search: payout, taxes, accounts, kalshi'; inp.setAttribute('aria-label', 'Search apps'); inp.autocomplete = 'off'; inp.setAttribute('autocapitalize', 'off'); inp.spellcheck = false; inp.enterKeyHint = 'go';
    inp.addEventListener('input', function () { st.q = inp.value; filter(); });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { var t = sc.querySelector('.oly-tile:not([hidden])'); if (t) t.click(); } });
    sr.appendChild(inp);
    var mb = el('button', 'oly-mb', 'MAP'); mb.type = 'button'; mb.setAttribute('aria-pressed', 'false'); mb.setAttribute('aria-label', 'Show every app on one screen');
    mb.addEventListener('click', function () { st.map = !st.map; o.classList.toggle('map', st.map); mb.setAttribute('aria-pressed', String(st.map)); });
    sr.appendChild(mb);
    var rcH = el('h3', '', 'Recent'), rc = el('div', 'oly-rc');
    var body = el('div', 'oly-bodyg'), em = el('p', 'oly-em', ''); em.hidden = true;
    var ft = el('p', 'oly-ft', isPC ? 'Apps open on the public site, in a new tab.' : 'Apps open on this site. Dots: green = running well, amber = look, red = a problem, grey = not updated.');
    sc.appendChild(jv); sc.appendChild(sr); sc.appendChild(rcH); sc.appendChild(rc); sc.appendChild(body); sc.appendChild(em); sc.appendChild(ft);
    pn.appendChild(hd); pn.appendChild(sc); o.appendChild(bd); o.appendChild(pn); d.body.appendChild(o);
    els = { o: o, pn: pn, x: x, inp: inp, rc: rc, rcH: rcH, body: body, em: em, sc: sc, jv: jv };
    o.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
      if (e.key !== 'Tab') return;
      var f = o.querySelectorAll('a[href],button,input'), vis = [].filter.call(f, function (n) { return !n.closest('[hidden]') && n.offsetParent !== null; });
      if (!vis.length) return;
      var first = vis[0], last = vis[vis.length - 1];
      if (e.shiftKey && d.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && d.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  function tile(a, i, chip) {
    var t = el('a', chip ? 'oly-chip' : 'oly-tile'); t.href = url(a.path); t.setAttribute('data-app', a.id);
    if (!chip) t.setAttribute('data-group', a.group);
    t.style.setProperty('--c', a.colour); t.style.setProperty('--cr', rgb(a.colour)); t.style.setProperty('--i', String(i)); t.style.setProperty('--phase', (-((i * 37) % 29) / 10) + 's');
    t.setAttribute('data-motion', GLYPH_MOTION[a.id] || 'portal');
    if (isPC) { t.target = '_blank'; t.rel = 'noopener'; }
    var g = el(chip ? 'i' : 'span', chip ? '' : 'oly-g', a.glyph); g.setAttribute('aria-hidden', 'true');
    if (chip) { t.appendChild(g); t.appendChild(d.createTextNode(a.name)); }
    else {
      var tx = el('span', 'oly-tx'); tx.appendChild(el('b', '', a.name)); tx.appendChild(el('small', '', a.purpose));
      t.appendChild(g); t.appendChild(tx);
      var dot = el('i', 'oly-dot none'); t.appendChild(dot);
      if (favs().indexOf(a.id) >= 0) { var sg = el('span', 'oly-star', '\u2605'); sg.setAttribute('aria-hidden', 'true'); t.appendChild(sg); }
      var pt = 0, pressed = false;
      t.addEventListener('pointerdown', function () { clearTimeout(pt); pt = setTimeout(function () { pressed = true; toggleFav(a.id); }, PRESS_MS); });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { t.addEventListener(ev, function () { clearTimeout(pt); }); });
      t.addEventListener('click', function (e) { if (pressed) { pressed = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
      t.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      t.addEventListener('keydown', function (e) { if (e.key === 'f' || e.key === 'F') toggleFav(a.id); });
      t.setAttribute('data-q', doors() ? doors().words(a) : (a.name + ' ' + a.purpose + ' ' + a.groupName + ' ' + a.id).toLowerCase());
    }
    t.addEventListener('click', function () { touch(a.id); if (isPC) setTimeout(renderRecent, 0); else close(); });
    return t;
  }
  function renderRecent() {
    var ids = recent(), byId = {}; st.apps.forEach(function (a) { byId[a.id] = a; });
    var list = ids.map(function (id) { return byId[id]; }).filter(Boolean);
    els.rc.replaceChildren.apply(els.rc, list.map(function (a, i) { return tile(a, i, true); }));
    els.rc.hidden = els.rcH.hidden = !list.length || !!st.q;
  }
  function render() {
    st.apps = apps(); st.tiles = {};
    var frag = [], n = 0;
    var byId = {}; st.apps.forEach(function (a) { byId[a.id] = a; });
    var fv = favs().map(function (id) { return byId[id]; }).filter(Boolean);
    if (fv.length) {                                           // a div, not a section: the sections stay the four doors
      var fd = el('div', 'oly-fav'); fd.appendChild(el('h3', '', '\u2605 Favourites'));
      var fg = el('div', 'oly-gr'); fv.forEach(function (a) { fg.appendChild(tile(a, n++, false)); }); fd.appendChild(fg); frag.push(fd);
    }
    var D = doors(), AR = D && D.ARENAS ? D.ARENAS : [], isAr = function (id) { return !!(D && D.arena && D.arena(id === 'home' ? 'jarvis' : id)); };
    if (AR.length) {                                           // owner 2026-11-20 17:00 ET: the 6 arenas first, everything else under More
      var asec = el('section'); asec.setAttribute('data-group', 'arenas'); asec.appendChild(el('h3', '', 'Arenas'));
      var agr = el('div', 'oly-gr'); AR.forEach(function (r) { var a = byId[r.id] || (r.id === 'jarvis' ? (byId.home || { id: 'jarvis', name: 'Jarvis', glyph: '\u0399', colour: '#9d59ee', group: 'life', purpose: r.line, path: 'jarvis/' }) : null); /* Jarvis has no app-list row (the big button opens it): its tile comes from doors.js */ if (!a) return; var t = tile(a, n++, false); st.tiles[a.id] = t; agr.appendChild(t); });
      asec.appendChild(agr); frag.push(asec);
      var mh = el('h3', 'oly-morehead', 'More'); frag.push(mh);
    }
    (D ? D.DOORS.map(function (x) { return [x.id, x.title, x]; }) : GROUPS).forEach(function (g) {
      var list = st.apps.filter(function (a) { return (D ? D.doorOf(a.id) === g[0] : a.group === g[0]) && !isAr(a.id); });
      if (!list.length && !(g[2] && g[2].items.length)) return;
      var sec = el('section'); sec.setAttribute('data-group', g[0]);
      if (g[2]) {                                              // a door: its heading opens the Doors page there, then its shortcuts
        var h = el('h3'), ha = el('a', 'oly-dh'); ha.href = url('hub/doors.html#' + g[0]); if (isPC) { ha.target = '_blank'; ha.rel = 'noopener'; }
        ha.appendChild(el('span', '', g[1])); ha.appendChild(el('em', '', 'Open door \u203a')); ha.addEventListener('click', function () { if (!isPC) close(); });
        h.appendChild(ha); sec.appendChild(h);
        var ks = el('div', 'oly-dks');
        g[2].items.forEach(function (it) {
          var k = el('a', 'oly-dk'); k.href = url(it.href); if (isPC) { k.target = '_blank'; k.rel = 'noopener'; }
          k.appendChild(el('b', '', it.label)); k.appendChild(el('small', '', it.greek));
          k.setAttribute('data-q', [it.label, it.greek, it.words, g[1]].join(' ').toLowerCase());
          k.addEventListener('click', function () { if (it.app) touch(it.app); if (!isPC) close(); });
          ks.appendChild(k);
        });
        sec.appendChild(ks);
      } else sec.appendChild(el('h3', '', g[1]));
      var gr = el('div', 'oly-gr'), arc = D && D.archived ? list.filter(function (a) { return D.archived(a.id); }) : [];
      list.forEach(function (a) { if (arc.indexOf(a) >= 0) return; var t = tile(a, n++, false); st.tiles[a.id] = t; gr.appendChild(t); });
      sec.appendChild(gr);
      if (arc.length) {                                        // night-revamp-main 2026-11-20: the weak / duplicate apps, folded at the end of the door (doors.js ARCHIVE)
        var ad = el('details', 'oly-arc'), ag = el('div', 'oly-gr'); ad.appendChild(el('summary', '', 'Archive · ' + arc.length + ' older pages'));
        arc.forEach(function (a) { var t = tile(a, n++, false); st.tiles[a.id] = t; ag.appendChild(t); });
        ad.appendChild(ag); sec.appendChild(ad);
      }
      frag.push(sec);
    });
    els.body.replaceChildren.apply(els.body, frag);
    st.apps.forEach(function (a) { paintDot(a.id); });
    if (!st.apps.length) { els.em.hidden = false; els.em.textContent = listState === 'loading' ? 'Loading the apps...' : 'The app list could not load. Open Olympus (Jarvis) above and pick an app there.'; }
    else els.em.hidden = true;
    renderRecent(); filter();
  }
  function filter() {
    var q = st.q.trim().toLowerCase(), ws = q.split(/\s+/).filter(Boolean), shown = 0, keys = 0;
    var hit = function (n) { var h = n.getAttribute('data-q') || ''; for (var i = 0; i < ws.length; i++) if (h.indexOf(ws[i]) < 0) return false; return true; };   // every word
    [].forEach.call(els.body.querySelectorAll('.oly-tile, .oly-dk'), function (t) { t.hidden = !(!q || hit(t)); if (!t.hidden && t.className === 'oly-dk') keys++; });
    st.apps.forEach(function (a) { if (st.tiles[a.id] && !st.tiles[a.id].hidden) shown++; });
    els.body.querySelectorAll('section, .oly-fav').forEach(function (s) { s.hidden = !s.querySelector('.oly-tile:not([hidden]), .oly-dk:not([hidden])'); });
    els.body.querySelectorAll('details.oly-arc').forEach(function (x) { if (q) { if (!x.open) { x.open = true; x.setAttribute('data-auto', '1'); } } else if (x.getAttribute('data-auto')) { x.open = false; x.removeAttribute('data-auto'); } });
    if (st.apps.length) { els.em.hidden = shown + keys > 0; if (!shown && !keys) els.em.textContent = 'No app matches "' + st.q.trim().slice(0, 40) + '".'; }
    renderRecent();
  }

  function open() {
    if (st.open) return;
    build(); st.open = true; lastFocus = d.activeElement;
    els.o.classList.toggle('calm', calm());
    render();
    els.o.hidden = false;
    if (!window.OLYMPUS_APPS_LIST || !doors()) loadList(function () { if (st.open) { render(); loadStatus(); } });
    root.style.overflow = 'hidden';
    try { if (window.ZenithFX && ZenithFX.glass && !calm()) ZenithFX.glass(els.pn, '.oly-tile', { deg: 4 }); } catch (e) { /* the plain tiles */ }
    setTimeout(function () { try { els.x.focus(); } catch (e) { /* */ } }, 30);
    loadStatus();
  }
  function close() {
    if (!st.open) return;
    st.open = false; els.o.hidden = true; root.style.overflow = '';
    try { if (lastFocus && lastFocus.focus) lastFocus.focus(); } catch (e) { /* */ }
  }

  // ---------------------------------------------------------------- the top-bar button
  var ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="5" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="12" cy="19" r="2"/><circle cx="19" cy="19" r="2"/></svg>';
  function mount() {
    if (d.getElementById('olyLauncherBtn') || !d.body) return;
    isPC = location.port === '8766' || !!d.querySelector('header.nx-top, .tb-right'); base = isPC ? PUBLIC : '';
    build();                                                   // the style first: the button needs it
    var b = el('button', 'oly-lbtn'); b.type = 'button'; b.id = 'olyLauncherBtn';
    b.setAttribute('aria-haspopup', 'dialog'); b.setAttribute('aria-label', 'Open the OLYMPUS app launcher'); b.title = 'OLYMPUS apps';
    b.innerHTML = ICON; b.appendChild(el('span', 't', 'OLYMPUS'));
    b.addEventListener('click', open);
    var host = d.querySelector('header.top') || d.querySelector('.tb-right');
    if (host) {
      var anchor = isPC ? d.getElementById('soundBtn') || host.firstChild : d.getElementById('refresh');
      if (anchor && anchor.parentNode === host) host.insertBefore(b, anchor); else host.appendChild(b);
    } else { b.className += ' float'; d.body.appendChild(b); }
  }
  setTimeout(function () { loadList(); }, 4000);                 // warm the list after the page is up (async: it never blocks the page)
  window.OLYMPUS_LAUNCHER = { open: open, close: close, isOpen: function () { return st.open; },
    state: function () { return { open: st.open, pc: isPC, apps: st.apps.length || apps().length, tiles: Object.keys(st.tiles).length, q: st.q, recent: recent(), status: JSON.parse(JSON.stringify(st.status)), base: base }; } };
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', mount); else mount();
}());
