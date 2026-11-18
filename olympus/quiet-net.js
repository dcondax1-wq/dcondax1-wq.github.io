/* OLYMPUS quiet net (QA round 6, 2026-11-11): dead live sources fail quietly, fast and ONCE.
 * The owner's GitHub account is suspended, so the PC's live feed (repo nq-dashboard, branch live) and the Kalshi feed (repo kalshi-feed) answer
 * 404 / 403 on raw.githubusercontent.com and api.github.com. Pages still asked on every load and every poll: a red console line each time, and
 * a phone waiting up to 9 s per try. This classic script, loaded in <head> BEFORE any page script, wraps window.fetch for those addresses only:
 *   - one real attempt per source (host + repo) with a 4 s limit;
 *   - a failure (404, 401/403 incl. the rate limit, 5xx, timeout, network) is remembered for this browser session (sessionStorage, at most 6 h,
 *     shared by every app page of the site), and later asks get an immediate 404 Response made here: no network, no console line, no retry storm;
 *   - optional files of this site that nothing may have published (kalshi.json: the PC's copy of the Kalshi feed) are asked once a session too:
 *     a 404 is remembered the same way;
 *   - the owner can always ask again: a fetch within 3 s of a tap / click / key (Refresh, pull to refresh) goes to the real source, and a page
 *     can name sources it asks afresh on every load (data-fresh="raw:kalshi-feed,..." on its script tag: the Kalshi page).
 * Every other request goes through untouched. Read-only: it never sends anything new, never changes a request, never stores a response.
 * window.OLYMPUS_NET: state() -> { id: { ok, at, status, why, label } } · line(id) -> "Kalshi feed: offline since 22:04 (404), asked once" ·
 * forget() clears the memory · 'olympus-net' event on window when a source changes. Safari 15 safe (no ??, no top-level await).
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || window.OLYMPUS_NET || typeof window.fetch !== 'function') return;
  var KEY = 'olympus.deadsrc.v1', TTL = 6 * 3600e3, LIMIT_MS = 4000;
  var OWNER = 'demetrades2000-coder';
  var SOURCES = [
    { id: 'raw:nq-dashboard', label: 'PC live feed (raw)', host: 'raw.githubusercontent.com', path: '/' + OWNER + '/nq-dashboard/' },
    { id: 'api:nq-dashboard', label: 'PC live feed (API)', host: 'api.github.com', path: '/repos/' + OWNER + '/nq-dashboard/' },
    { id: 'raw:kalshi-feed', label: 'Kalshi feed (raw)', host: 'raw.githubusercontent.com', path: '/' + OWNER + '/kalshi-feed/' },
    { id: 'api:kalshi-feed', label: 'Kalshi feed (API)', host: 'api.github.com', path: '/repos/' + OWNER + '/kalshi-feed/' },
    { id: 'site:kalshi.json', label: "this site's kalshi.json", local: /\/kalshi\.json$/, optional: true },
  ];
  var mem = {};
  // the owner asked (a tap, a click, a key, a pull to refresh): a fetch within 3 s of it tries the real source again, whatever is remembered
  var touchedAt = 0, GESTURE_MS = 3000;
  ['pointerdown', 'click', 'keydown', 'touchend'].forEach(function (t) { try { window.addEventListener(t, function () { touchedAt = Date.now(); }, true); } catch (_) { /* no events (a test) */ } });
  function load() { try { var j = JSON.parse(sessionStorage.getItem(KEY) || '{}'); return j && typeof j === 'object' ? j : {}; } catch (_) { return {}; } }
  function save(all) { try { sessionStorage.setItem(KEY, JSON.stringify(all)); } catch (_) { /* private mode: memory only */ } }
  function get(id) { var all = load(), e = all[id] || mem[id]; return e && Date.now() - (e.at || 0) < TTL ? e : null; }
  // <script src="quiet-net.js" data-fresh="raw:kalshi-feed,site:kalshi.json">: a source's OWN page asks it afresh once per page load
  // (the Kalshi page must notice the bot the moment it is linked); the page's own polls are still remembered after that one answer
  try {
    var me = document.currentScript, fresh = me && me.getAttribute('data-fresh');
    if (fresh) { var all0 = load(); fresh.split(',').forEach(function (id) { delete all0[id.trim()]; }); save(all0); }
  } catch (_) { /* no document (a test) */ }
  function put(id, e) { mem[id] = e; var all = load(); all[id] = e; save(all); try { window.dispatchEvent(new CustomEvent('olympus-net', { detail: { id: id, entry: e } })); } catch (_) { /* old browser */ } }

  function sourceOf(u) {
    for (var i = 0; i < SOURCES.length; i++) {
      var s = SOURCES[i];
      if (s.local) { if (u.origin === location.origin && s.local.test(u.pathname)) return s; continue; }
      if (u.protocol === 'https:' && u.hostname === s.host && u.pathname.indexOf(s.path) === 0) return s;
    }
    return null;
  }
  function gone(s, e) {
    var body = JSON.stringify({ message: 'Not Found', olympus: 'remembered for this session: ' + s.label + ' did not answer (' + (e.status || e.why) + ')' });
    return new Response(body, { status: 404, statusText: 'Not Found', headers: { 'content-type': 'application/json', 'x-olympus-quiet': '1' } });
  }
  var raw = window.fetch.bind(window), flight = {};

  function attempt(s, input, init) {
    var ac = typeof AbortController === 'function' ? new AbortController() : null, own = init && init.signal, timer = 0, timedOut = false;
    if (ac && own) { if (own.aborted) ac.abort(); else own.addEventListener('abort', function () { ac.abort(); }, { once: true }); }
    var opts = {}; for (var k in (init || {})) opts[k] = init[k];
    if (ac) { opts.signal = ac.signal; if (!s.local) timer = setTimeout(function () { timedOut = true; ac.abort(); }, LIMIT_MS); }
    return raw(input, opts).then(function (r) {
      clearTimeout(timer);
      var bad = s.optional ? r.status === 404 : !r.ok && r.status !== 304;
      if (bad) put(s.id, { ok: false, at: Date.now(), status: r.status, why: 'HTTP ' + r.status, label: s.label });
      else put(s.id, { ok: true, at: Date.now(), status: r.status, why: '', label: s.label, live: true });
      return r;
    }, function (err) {
      clearTimeout(timer);
      if (!(own && own.aborted) && !s.optional) put(s.id, { ok: false, at: Date.now(), status: 0, why: timedOut ? 'no answer in ' + LIMIT_MS / 1000 + ' s' : 'network error', label: s.label });
      throw err;
    });
  }

  window.fetch = function (input, init) {
    var u = null;
    try { u = new URL(typeof input === 'string' ? input : (input && input.url) || String(input), location.href); } catch (_) { return raw(input, init); }
    var s = sourceOf(u);
    if (!s || (init && init.method && String(init.method).toUpperCase() !== 'GET')) return raw(input, init);
    var e = get(s.id);
    if (e && e.ok === false && Date.now() - touchedAt > GESTURE_MS) return Promise.resolve(gone(s, e));
    if (e && e.ok === false) return attempt(s, input, init);   // the owner just asked: one real try
    if (e && e.ok === true) return attempt(s, input, init);    // it answered this session: a normal request, still watched (a later failure is remembered)
    if (flight[s.id]) return flight[s.id].then(function () { var x = get(s.id); return x && x.ok === false ? gone(s, x) : raw(input, init); });
    var p = attempt(s, input, init);
    flight[s.id] = p.then(function () { return null; }, function () { return null; });
    flight[s.id].then(function () { delete flight[s.id]; });
    return p;
  };

  function hm(t) { try { return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch (_) { return ''; } }
  window.OLYMPUS_NET = {
    v: 1, sources: SOURCES.map(function (s) { return s.id; }),
    state: function () { var o = {}; SOURCES.forEach(function (s) { var e = get(s.id); if (e) o[s.id] = e; }); return o; },
    dead: function (id) { var e = get(id); return !!(e && e.ok === false); },
    /** one plain line per source: "Kalshi feed (raw): offline since 22:04 (HTTP 404), asked once this session" */
    line: function (id) {
      var e = get(id), s = SOURCES.filter(function (x) { return x.id === id; })[0];
      if (!s) return '';
      if (!e) return s.label + ': not asked yet';
      return e.ok ? s.label + ': answered at ' + hm(e.at) : s.label + ': offline since ' + hm(e.at) + ' (' + e.why + '), asked once this session';
    },
    forget: function () { mem = {}; try { sessionStorage.removeItem(KEY); } catch (_) { /* nothing kept */ } },
  };
})();
