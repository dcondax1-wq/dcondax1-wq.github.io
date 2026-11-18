// POLIS page (2026-11-11, POLIS_25 items 19-25). Loaded as a module (so it runs after the plain scripts), written in ES5 (var / function, no imports).
// Reads: the app list (olympus/apps-list.js), home.json (the bots, the Mind), kalshi.json (the Kalshi bot), olympus/people.json (the citizens), ergasterion/queue.json (the Mind's
// matters), sky.json (optional weather), every app's jarvis.json (fresh news = a glowing building) and fixture.json (DEMO, never blank). Read only: it never sends anything and keeps
// nothing on the phone. Text only through textContent / createElementNS. window.POLIS is the test hook.
(function () {
  'use strict';
  var W = window, D = document, O = W.OLYMPUS || null, C = W.POLIS_CORE, SK = W.OLYMPUS_POLIS_SKYLINE, SKY = W.OLYMPUS_POLIS_SKY;
  var NS = 'http://www.w3.org/2000/svg';
  var q = (function () { var o = {}, s = location.search.replace(/^\?/, '').split('&'); for (var i = 0; i < s.length; i++) { var kv = s[i].split('='); if (kv[0]) o[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' ')); } return o; })();
  var S = { ready: false, demo: false, forced: q.demo === '1', city: null, model: null, apps: [], spots: {}, selected: null, cards: {}, fresh: {}, fixture: null, nowFixed: null, errors: [] };
  function $(id) { return D.getElementById(id); }
  function h(tag, cls, text) { var e = D.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
  function sv(tag, attrs) { var e = D.createElementNS(NS, tag); for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]); return e; }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function say(t) { $('status').textContent = t; }

  function getJSON(url, ms) {
    return new Promise(function (res) {
      var done = false, ac = typeof AbortController === 'function' ? new AbortController() : null, timer = setTimeout(function () { if (ac) ac.abort(); if (!done) { done = true; res(null); } }, ms || 6000);
      fetch(url, ac ? { cache: 'no-cache', signal: ac.signal } : { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (!done) { done = true; clearTimeout(timer); res(j); } }, function () { if (!done) { done = true; clearTimeout(timer); res(null); } });
    });
  }
  // an app's published status card (the Jarvis card contract, docs/JARVIS_APPS.md): only its own folder on this site, only a plain id
  function getCard(row) {
    if (!row || !row.live || !/^[a-z0-9]+\/$/.test(row.path || '')) return Promise.resolve(null);
    return new Promise(function (res) {
      var timer = setTimeout(function () { res(null); }, 5000);
      fetch('../' + row.path + 'jarvis.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { clearTimeout(timer); res(j); }, function () { clearTimeout(timer); res(null); });
    });
  }

  function nowMs() { return S.nowFixed != null ? S.nowFixed : Date.now(); }
  function lite() { try { return !!(O && O.lite && O.lite()); } catch (e) { return false; } }
  function reduced() { try { if (O && O.reduced && O.reduced()) return true; } catch (e) { /* */ } return !!(W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function nyTime(ms) { try { return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(new Date(ms)); } catch (e) { return ''; } }
  function districtName(id) { return { life: 'The Gardens · Life', trading: 'The Acropolis · Trading', money: 'The Harbour and the Mint · Money' }[id] || ''; }

  // ------------------------------------------------------------------------------------------------ the time and the sky
  function pickTime() {
    var base = Date.now(), t = q.t ? Date.parse(q.t) : NaN;
    if (isFinite(t)) return t;
    if (/^(dawn|day|dusk|night)$/.test(q.phase || '')) return SKY.timeFor(q.phase, base);
    return null;
  }

  // ------------------------------------------------------------------------------------------------ the hotspots (one 44 px button per building and ship)
  function placeSpots() {
    var city = S.city, k = city.info().view.k, world = $('world'), L = city.layout;
    world.style.width = Math.round(L.W * k) + 'px';
    for (var i = 0; i < L.buildings.length; i++) {
      var b = L.buildings[i], el = S.spots[b.id];
      if (!el) {
        el = h('button', 'spot'); el.type = 'button'; el.setAttribute('data-id', b.id); el.setAttribute('aria-label', b.name + ': ' + (b.purpose || 'an app of OLYMPUS'));
        el.textContent = b.name; bindSpot(el, b); world.appendChild(el); S.spots[b.id] = el;
      }
      var w = Math.max(44, b.w * k), hh = Math.max(44, b.h * k * 1.05), x = b.x * k - w / 2, y = (b.y + SK.PAD) * k - hh;
      el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px'; el.style.width = Math.round(w) + 'px'; el.style.height = Math.round(hh) + 'px';
    }
  }
  function bindSpot(el, b) {
    el.addEventListener('pointerdown', function () { S.ptr = true; });
    el.addEventListener('click', function (e) { e.preventDefault(); S.ptr = false; if (S.dragged) return; if (S.selected === b.id) { enter(b); return; } select(b.id); });
    el.addEventListener('mouseenter', function () { if (S.city) S.city.hover(b.id); if (!S.selected && W.matchMedia && W.matchMedia('(hover: hover)').matches) showPlaque(b, true); });
    el.addEventListener('mouseleave', function () { if (S.city) S.city.hover(null); if (!S.selected) hidePlaque(); });
    el.addEventListener('focus', function () { if (!S.ptr) select(b.id, true); });
  }
  function find(id) { var L = S.city.layout.buildings; for (var i = 0; i < L.length; i++) if (L[i].id === id) return L[i]; return null; }
  function select(id, quiet) {
    var b = find(id); if (!b) return;
    S.selected = id; S.city.select(id); showPlaque(b, false);
    if (!quiet && O && O.cue) try { O.cue('tap'); } catch (e) { /* */ }
  }
  function enter(b) { try { if (O && O.cue) O.cue('open'); } catch (e) { /* */ } location.href = '../' + b.path; }
  function showPlaque(b, hover) {
    var p = $('plaque'), card = S.cards[b.id], f = S.fresh[b.id] || 0;
    $('pkDistrict').textContent = districtName(b.district);
    $('pkName').textContent = b.name; $('pkPurpose').textContent = b.purpose || '';
    var pf = $('pkFresh');
    if (f > 0 && card) { pf.textContent = 'Fresh news: ' + C.str(card.status && card.status.label, 48) + ' (' + C.ago(nowS() - card.t) + ')'; pf.className = 'pf on'; }
    else if (card && card.status) { pf.textContent = 'Quiet: ' + C.str(card.status.label, 48) + (card.t ? ' (' + C.ago(nowS() - card.t) + ')' : ''); pf.className = 'pf'; }
    else { pf.textContent = 'No published news.'; pf.className = 'pf'; }
    var en = $('pkEnter'); en.textContent = 'Enter ' + b.name; en.setAttribute('href', '../' + b.path);
    p.hidden = false; p.setAttribute('data-id', b.id); p.setAttribute('data-hover', hover ? '1' : '0');
    positionPlaque();
  }
  function positionPlaque() {
    var p = $('plaque'); if (p.hidden) return;
    var id = p.getAttribute('data-id'), b = find(id); if (!b) return;
    var r = S.city.screenOf(b), hero = $('hero'), W0 = hero.clientWidth, pw = p.offsetWidth, ph = p.offsetHeight;
    var x = Math.max(12, Math.min(W0 - pw - 12, r.x - pw / 2)), y = r.y - r.h - ph - 14, below = false;
    if (y < 156) { y = r.y + 12; below = true; }
    if (y + ph > hero.clientHeight - 64) y = hero.clientHeight - 64 - ph;
    p.style.left = Math.round(x) + 'px'; p.style.top = Math.round(y) + 'px';
    p.className = 'plaque' + (below ? ' below' : '');
    p.style.setProperty('--tip', Math.max(16, Math.min(pw - 16, r.x - x)) + 'px');
    if (r.x < -20 || r.x > W0 + 20) hidePlaque();
  }
  function hidePlaque() { $('plaque').hidden = true; S.selected = null; if (S.city) S.city.select(null); }
  function nowS() { return Math.floor((S.nowFixed != null ? S.nowFixed : Date.now()) / 1000); }

  // ship hotspots: tap opens the ship's app
  function placeShipSpots(harbour) {
    var world = $('world'), k = S.city.info().view.k, L = S.city.layout, list = harbour.ships;
    for (var i = 0; i < list.length; i++) {
      var s = list[i], id = 'ship-' + s.key, el = S.spots[id];
      if (!el) { el = h('a', 'spot boat'); el.setAttribute('href', '../' + s.app + '/'); world.appendChild(el); S.spots[id] = el; }
      el.setAttribute('aria-label', s.name + ' ship: ' + s.words + '. ' + s.why); el.textContent = s.name;
      var pos = s.state === 'port' ? L.berths[i] : s.state === 'returning' ? [2585, 494 + i * 6] : [L.lanes[i][0], L.lanes[i][1]];
      var x = (s.state === 'port' && SK.berthX ? SK.berthX(pos[0], S.city.info().view.w) : pos[0]) * k;   // a phone spreads the berths (polis-skyline.js)
      el.style.left = Math.round(x - 40) + 'px'; el.style.top = Math.round((pos[1] + SK.PAD) * k - 64 * k) + 'px'; el.style.width = '80px'; el.style.height = Math.round(Math.max(44, 66 * k)) + 'px';
      el.setAttribute('data-state', s.state);
    }
  }

  // ------------------------------------------------------------------------------------------------ input: pan by mouse drag, tilt, scroll, districts
  function bindInput() {
    var pan = $('pan'), down = null;
    pan.addEventListener('scroll', function () { if (S.city) { S.city.onScroll(); positionPlaque(); markDistrict(); if (S.harbour) placeShipSpots(S.harbour); } }, { passive: true });
    pan.addEventListener('mousedown', function (e) { if (e.button !== 0) return; down = { x: e.clientX, l: pan.scrollLeft, moved: 0 }; S.dragged = false; });
    W.addEventListener('mousemove', function (e) {
      if (down) { var dx = e.clientX - down.x; down.moved = Math.max(down.moved, Math.abs(dx)); if (down.moved > 4) { S.dragged = true; pan.classList.add('drag'); pan.scrollLeft = down.l - dx; } }
      var r = $('hero').getBoundingClientRect(); if (S.city && !reduced() && e.clientY < r.bottom) S.city.setTilt((e.clientX / Math.max(1, W.innerWidth) - 0.5) * 2, (e.clientY / Math.max(1, W.innerHeight) - 0.5) * 2);
    });
    W.addEventListener('mouseup', function () { if (down) { pan.classList.remove('drag'); setTimeout(function () { S.dragged = false; }, 30); } down = null; });
    pan.addEventListener('click', function (e) { if (e.target === pan || e.target === $('world')) hidePlaque(); });
    $('pkClose').addEventListener('click', function () { hidePlaque(); });
    var btns = D.querySelectorAll('.dist');
    for (var i = 0; i < btns.length; i++) btns[i].addEventListener('click', function (e) { var go = e.currentTarget.getAttribute('data-go'); walk(go); });
    W.addEventListener('scroll', function () { if (S.city) S.city.setScroll(W.scrollY || 0); }, { passive: true });
    var t = 0; W.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(function () { if (!S.city) return; S.city.resize(); placeSpots(); if (S.harbour) placeShipSpots(S.harbour); positionPlaque(); }, 160); });
    D.addEventListener('visibilitychange', function () { if (S.city) S.city.setVisible(!D.hidden); });
    if ('IntersectionObserver' in W) new IntersectionObserver(function (es) { if (S.city) S.city.setVisible(es[0].isIntersecting && !D.hidden); }).observe($('hero'));
    // the phone's tilt (iPhone asks once, on the first touch of the city)
    var tiltOn = false;
    function onTilt(e) { if (!S.city || reduced() || e.gamma == null) return; S.city.setTilt(Math.max(-1, Math.min(1, e.gamma / 25)), Math.max(-1, Math.min(1, ((e.beta || 45) - 45) / 30))); }
    function startTilt() { if (tiltOn || !W.DeviceOrientationEvent) return; tiltOn = true; W.addEventListener('deviceorientation', onTilt, { passive: true }); }
    if (W.DeviceOrientationEvent && typeof W.DeviceOrientationEvent.requestPermission === 'function') {
      $('hero').addEventListener('touchend', function once() { $('hero').removeEventListener('touchend', once); try { W.DeviceOrientationEvent.requestPermission().then(function (r) { if (r === 'granted') startTilt(); }, function () { /* */ }); } catch (e) { /* */ } });
    } else if (('ontouchstart' in W) && W.DeviceOrientationEvent) startTilt();
  }
  function walk(go) {
    if (!S.city) return; var x = S.city.panFor(go), pan = $('pan');
    hidePlaque();
    try { pan.scrollTo({ left: x, behavior: reduced() ? 'auto' : 'smooth' }); } catch (e) { pan.scrollLeft = x; }
  }
  function markDistrict() {
    var info = S.city.info(), k = info.view.k, cx = (info.pan + info.view.w / 2) / k, cur = cx > 2420 ? 'harbour' : cx > 1800 ? 'money' : cx > 650 ? 'trading' : 'life';
    var btns = D.querySelectorAll('.dist'); for (var i = 0; i < btns.length; i++) btns[i].className = 'dist' + (btns[i].getAttribute('data-go') === cur ? ' on' : '');
    if (btns.length) for (i = 0; i < btns.length; i++) btns[i].setAttribute('aria-pressed', btns[i].getAttribute('data-go') === cur ? 'true' : 'false');
  }

  // ------------------------------------------------------------------------------------------------ the cards
  function shipIcon(s) {
    var svg = sv('svg', { viewBox: '0 0 52 40', 'aria-hidden': 'true' });
    svg.appendChild(sv('path', { d: 'M4 30 Q26 36 46 30 L50 27 L44 26 L8 26 Q3 22 5 18 Z', fill: '#6a4a30' }));
    svg.appendChild(sv('rect', { x: 25, y: 4, width: 2, height: 23, fill: '#8c6a48' }));
    if (s.state === 'port') svg.appendChild(sv('rect', { x: 16, y: 6, width: 20, height: 3, rx: 1.5, fill: '#e8dcc0' }));
    else { svg.appendChild(sv('path', { d: 'M15 6 L37 6 Q40 15 36 24 L16 24 Q19 15 15 6 Z', fill: '#efe4c8' })); svg.appendChild(sv('circle', { cx: 26, cy: 15, r: 3.4, fill: s.colour })); }
    svg.appendChild(sv('path', { d: 'M2 34 Q14 31 26 34 T50 34', fill: 'none', stroke: '#4b7a99', 'stroke-width': 1.5 }));
    return svg;
  }
  function renderHarbour(H, T, rec) {
    var ul = $('ships'); clear(ul);
    var n = { port: 0, sail: 0, returning: 0 };
    for (var i = 0; i < H.ships.length; i++) {
      var s = H.ships[i], li = h('li'), a = h('a', 'ship'); a.setAttribute('href', '../' + s.app + '/'); n[s.state]++;
      a.appendChild(shipIcon(s));
      var mid = h('div'); mid.appendChild(h('b', null, s.name + ' · ' + s.who)); var pl = h('span', null, s.words + '. ' + s.why); mid.appendChild(pl); a.appendChild(mid);
      var usd = h('span', 'usd ' + (s.state === 'returning' ? (s.usd >= 0 ? 'pos' : 'neg') : ''), s.state === 'returning' ? C.money(s.usd) : s.state === 'sail' ? 'sailing' : 'in port'); a.appendChild(usd);
      li.appendChild(a); ul.appendChild(li);
    }
    $('harLead').textContent = (H.demo ? 'DEMO harbour (no bot report is published on this site yet): ' : '') + n.sail + ' under sail, ' + n.returning + ' returning with cargo, ' + n.port + ' in port.';
    $('treasury').textContent = (T.up ? 'Gold rises from the mint: ' : '') + T.words + (H.demo ? ' (demo numbers, not real)' : '');
    S.treasury = T;
  }
  function stone(kind) {
    var svg = sv('svg', { viewBox: '0 0 26 26', role: 'img', 'aria-label': kind + ' voting stone' }), fill = kind === 'white' ? '#efe6d2' : kind === 'black' ? '#2a2420' : '#8f877a';
    svg.appendChild(sv('ellipse', { cx: 13, cy: 14, rx: 10, ry: 9, fill: fill, stroke: '#9c6b3c', 'stroke-width': 1.2 }));
    svg.appendChild(sv('ellipse', { cx: 10, cy: 11, rx: 3.5, ry: 2.2, fill: '#ffffff', opacity: kind === 'black' ? 0.15 : 0.35 }));
    return svg;
  }
  function renderAssembly(A) {
    var ol = $('motions'); clear(ol);
    if (!A.motions.length) ol.appendChild(h('li', 'note', 'No motion is open: the Mind has published no proposal yet.'));
    for (var i = 0; i < A.motions.length; i++) {
      var m = A.motions[i], li = h('li', 'motion');
      li.appendChild(stone(m.stone || 'grey'));
      li.appendChild(h('b', null, 'Motion ' + (i + 1) + ': ' + C.str(m.title, 140)));
      li.appendChild(h('span', 'mv', (m.verdict || '') + (m.bot ? ' · ' + String(m.bot).toUpperCase() : '') + (m.usd_month != null ? ' · ' : '')));
      if (m.usd_month != null) { var u = h('span', 'usd ' + (m.usd_month >= 0 ? 'pos' : 'neg'), C.money(m.usd_month) + ' a month vs live'); li.lastChild.appendChild(u); }
      var ul = h('ul'); var lines = m.lines || []; for (var j = 0; j < lines.length; j++) ul.appendChild(h('li', null, C.str(lines[j], 170))); if (m.change) ul.appendChild(h('li', null, 'The change: ' + C.str(m.change, 200)));
      li.appendChild(ul); ol.appendChild(li);
    }
    var rb = $('raisedBox'), rl = $('raised'); clear(rl); rb.hidden = !A.raised.length;
    for (i = 0; i < A.raised.length; i++) rl.appendChild(h('li', null, A.raised[i].text));
    var open = A.motions.filter(function (m) { return m.status !== 'rejected'; }).length;
    $('asmLead').textContent = (A.demo ? 'DEMO motions (nothing is published on this site yet). ' : '') + (A.motions.length ? open + ' open, ' + (A.motions.length - open) + ' rejected by the numbers.' : A.raised.length + ' matters raised by the Mind' + (A.date ? ' on ' + A.date : '') + (A.tested != null ? ' after ' + A.tested + ' tests' : '') + '.') + ' Source: ' + A.src + '.';
  }
  function renderSky(info, rec) {
    var ul = $('consts'), ph = info.phase; clear(ul);
    var up = info.up.slice(0, 16);
    $('skyH').textContent = ph === 'night' ? "Tonight's sky over New York" : ph === 'dusk' || ph === 'dawn' ? 'The sky at ' + ph + ' over New York' : 'The sky over New York (stars hidden by daylight)';
    $('skyLead').textContent = (ph === 'night' ? 'Up now: ' : 'Above the horizon now, behind the daylight: ') + up.length + ' of the ' + SKY.CONSTELLATIONS.length + ' Greek constellations we draw. Swipe the city to turn the sky.' +
      (info.moon && info.moon.alt > 0 ? ' The Moon is up, ' + Math.round(info.moon.frac * 100) + '% lit.' : '');
    for (var i = 0; i < up.length; i++) { var li = h('li'); li.appendChild(h('b', null, up[i].name)); li.appendChild(h('span', null, up[i].myth + ' · ' + up[i].dir + ', ' + up[i].alt + '° up')); ul.appendChild(li); }
    $('recordLine').textContent = rec.on ? 'A new record today (' + rec.what + '): a shooting star crosses the sky.' : 'No new record today. A shooting star crosses the sky on a new best day.';
  }
  var ROLL_N = 12;
  function renderRolls(R) {
    var ul = $('rolls'), all = $('rollMore').getAttribute('aria-expanded') === 'true'; clear(ul);
    var list = all ? R.list : R.list.slice(0, ROLL_N);
    for (var i = 0; i < list.length; i++) {
      var p = list[i], li = h('li', 'roll');
      li.appendChild(h('b', null, p.name)); li.appendChild(h('span', 'rr', p.role)); li.appendChild(h('span', 'rd', 'Deme of ' + p.deme + ' (' + p.demeWords + ')' + (p.meaning ? ' · "' + p.meaning + '"' : '')));
      ul.appendChild(li);
    }
    $('rollLead').textContent = R.n ? R.n + ' citizens on the rolls' + (R.asof ? ' (people.json, ' + R.asof + ')' : '') + ': name, role and deme. Every one is a real worker of OLYMPUS.' : 'The rolls are empty: olympus/people.json is not published on this site.';
    var more = $('rollMore'); more.hidden = R.n <= ROLL_N; more.textContent = all ? 'Show fewer' : 'Show all ' + R.n + ' citizens';
  }
  function renderDirectory() {
    var box = $('dirList'); clear(box);
    var groups = [['trading', 'The Acropolis: Trading'], ['money', 'The Harbour and the Mint: Money'], ['life', 'The Gardens: Life']];
    for (var g = 0; g < groups.length; g++) {
      var sec = h('div', 'dgroup'); sec.appendChild(h('h3', null, groups[g][1]));
      var ul = h('ul', 'dlist');
      for (var i = 0; i < S.apps.length; i++) {
        var a = S.apps[i]; if (a.group !== groups[g][0]) continue;
        var li = h('li'), link = h('a', 'dl'); link.setAttribute('href', a.id === 'zenith' ? '../' : '../' + a.path); link.setAttribute('data-id', a.id);
        var ic = h('i', null, a.glyph || a.name.charAt(0)); ic.style.background = /^#[0-9a-f]{6}$/i.test(a.colour || '') ? a.colour : '#c8a24a'; link.appendChild(ic);
        var mid = h('div'); mid.appendChild(h('b', null, a.name)); mid.appendChild(h('span', null, a.purpose || '')); link.appendChild(mid);
        var em = h('em', null, S.fresh[a.id] ? 'fresh news' : ''); em.setAttribute('data-fresh', a.id); link.appendChild(em);
        li.appendChild(link); ul.appendChild(li);
      }
      sec.appendChild(ul); box.appendChild(sec);
    }
    $('dirLead').textContent = S.apps.length + ' apps, the same as the buildings on the map. A building glows and raises a gold banner when its app published fresh news in the last 24 hours.';
  }
  function updateFreshMarks() {
    var ems = D.querySelectorAll('[data-fresh]'); for (var i = 0; i < ems.length; i++) ems[i].textContent = S.fresh[ems[i].getAttribute('data-fresh')] ? 'fresh news' : '';
  }

  // ------------------------------------------------------------------------------------------------ boot
  function boot() {
    if (!C || !SK || !SKY) { say('The city could not load its kit.'); return; }
    S.apps = (W.OLYMPUS_APPS_LIST || []).map(function (r) { return { id: r.id, name: r.name, glyph: r.glyph, colour: r.colour, group: r.group, purpose: r.purpose, path: r.id === 'zenith' ? '' : r.path, live: r.live }; });
    S.nowFixed = pickTime();
    var forced = S.forced;
    Promise.all([getJSON('./fixture.json'), forced ? null : getJSON('../home.json'), forced ? null : getJSON('../kalshi.json'), getJSON('../olympus/people.json'), forced ? null : getJSON('../ergasterion/queue.json'), forced ? null : getJSON('./sky.json')]).then(function (r) {
      var fx = r[0] || {}, home = r[1], kalshi = r[2], people = r[3], queue = r[4], sky = r[5];
      S.fixture = fx;
      if (!S.apps.length && Array.isArray(fx.apps)) S.apps = fx.apps;
      var ns = nowS(), wx = C.weather(sky, q.wx, ns), H = C.ships(home, kalshi, ns, fx), T = C.treasury(H), rec = C.record(home, kalshi, ns), A = C.motions(home, queue, fx), R = C.citizens(people);
      if (q.record === '1') rec = { on: true, what: 'a preview (?record=1)' };
      S.harbour = H; S.model = { weather: wx, harbour: H, treasury: T, record: rec, assembly: A, rolls: R };
      S.demo = H.demo || A.demo;
      $('demo').hidden = !S.demo; $('lite').hidden = !lite();
      // the city
      var city = SK.create($('hero'), { apps: S.apps.map(function (a) { return { id: a.id, name: a.name, group: a.group, colour: a.colour, glyph: a.glyph, purpose: a.purpose, path: a.path }; }),
        ships: H.ships, weather: wx, time: S.nowFixed, quality: lite() ? 'low' : 'high', reduced: reduced(), scroller: $('pan') });
      S.city = city; city.setTreasury(T.up); city.start();
      placeSpots(); placeShipSpots(H);
      var start = q.pan && /^(life|trading|money|harbour|[a-z0-9]+)$/.test(q.pan) ? city.panFor(q.pan) : city.panFor('trading');
      $('pan').scrollLeft = start; city.setPan(start); markDistrict();
      renderHarbour(H, T, rec); renderAssembly(A); renderRolls(R); renderDirectory();
      var info = city.info(); renderSky(info, rec);
      $('clock').textContent = C.skyWords(info.phase, nyTime(nowMs()));
      $('foot').textContent = 'Painted in code for this minute of the New York sky' + (wx.src === 'sky.json' ? ', weather from sky.json' + (wx.text ? ' (' + wx.text + ')' : '') : wx.src === 'none' ? ' (no weather file published: a fair sky)' : ', weather ' + wx.src) + '. Read only.';
      $('rollMore').addEventListener('click', function () { var b = $('rollMore'); b.setAttribute('aria-expanded', b.getAttribute('aria-expanded') === 'true' ? 'false' : 'true'); renderRolls(R); });
      if (rec.on) setTimeout(function () { if (S.city) S.city.shootingStar(); }, 1200);
      S.ready = true;
      try { if (O && O.ready) O.ready(); } catch (e) { /* the veil lifts by itself */ }
      say(S.apps.length + ' buildings in the city. ' + C.skyWords(info.phase, nyTime(nowMs())) + '.');
      // fresh news: each app's status card, six at a time
      loadCards();
      // keep the clock and the sky moving with real time
      if (S.nowFixed == null) setInterval(function () { var inf = S.city.info(); $('clock').textContent = C.skyWords(inf.phase, nyTime(Date.now())) + (S.attic ? ' \u00b7 ' + S.attic : ''); }, 30000);
      decorate();
    });
  }
  function loadCards() {
    var rows = S.apps.filter(function (a) { return a.live && a.path; }), i = 0, busy = 0, ns = Math.floor(Date.now() / 1000);
    S.cardsDone = false;
    function next() {
      while (busy < 6 && i < rows.length) {
        (function (row) { busy++; getCard(row).then(function (card) { busy--; if (card && typeof card === 'object') { S.cards[row.id] = card; var f = C.fresh(card, ns); if (f > 0) S.fresh[row.id] = f; } if (i >= rows.length && !busy) finish(); else next(); }); })(rows[i++]);
      }
      if (!rows.length) finish();
    }
    function finish() {
      if (S.cardsDone) return; S.cardsDone = true;
      S.city.setFresh(S.fresh); updateFreshMarks();
      var n = 0; for (var k in S.fresh) if (Object.prototype.hasOwnProperty.call(S.fresh, k)) n++;
      S.freshN = n;
      say(S.apps.length + ' buildings in the city, ' + n + ' with fresh news (published in the last 24 hours). ' + C.skyWords(S.city.info().phase, nyTime(nowMs())) + '.');
    }
    next();
  }
  // the optional Polis kits of the other agents (olympus/polis.js, olympus/polis-life.js): used when the page already has them
  function decorate() {
    var P = W.OLYMPUS_POLIS;
    if (P) {
      try { if (P.meander) P.meander($('band'), { sides: 'band', color: 'gold', size: 16, live: false }); } catch (e) { S.errors.push('meander: ' + e.message); }
      try { if (P.coin && S.treasury) P.coin($('coin'), { value: S.treasury.n ? S.treasury.today : 0, size: 44, label: S.treasury.n ? C.money(S.treasury.today) : '$0' }); } catch (e) { S.errors.push('coin: ' + e.message); }
      try { if (P.laurel && S.model && S.model.record.on) P.laurel($('wreath'), { kind: 'laurel', gold: true, size: 44 }); } catch (e) { S.errors.push('laurel: ' + e.message); }
      try { if (P.atticDate) { var ad = P.atticDate(new Date(nowMs()), { tz: 'America/New_York' }); if (ad && ad.label) { S.attic = ad.label; $('clock').textContent = C.skyWords(S.city.info().phase, nyTime(nowMs())) + ' \u00b7 ' + ad.label; } } } catch (e) { S.errors.push('attic: ' + e.message); }
      try { if (P.auto) P.auto($('app')); } catch (e) { S.errors.push('polis auto: ' + e.message); }
    }
    try { if (W.OLYMPUS_POLIS && typeof W.OLYMPUS_POLIS.decorate === 'function') W.OLYMPUS_POLIS.decorate($('app')); } catch (e) { S.errors.push('polis kit: ' + e.message); }
    try { if (W.OLYMPUS_POLIS_LIFE && typeof W.OLYMPUS_POLIS_LIFE.mount === 'function') W.OLYMPUS_POLIS_LIFE.mount($('app'), { app: 'polis' }); } catch (e) { S.errors.push('polis life: ' + e.message); }
  }

  W.POLIS = { ready: function () { return S.ready; }, state: S, info: function () { return S.city ? S.city.info() : null; }, select: function (id) { select(id); }, walk: walk, cardsDone: function () { return !!S.cardsDone; } };
  bindInput();
  boot();
})();
