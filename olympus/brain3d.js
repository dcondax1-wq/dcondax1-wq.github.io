/* OLYMPUS brain3d (olympus/brain3d.js, DESIGN 2026-11-21; owner: "a brain for each bot, very 3D, very high quality, lots of effects").
 * A bot's brain: its pipeline stages as glowing regions inside a glass brain, synapse particles along the path, a risk ring around the
 * stem. Classic script (no import), window.Brain3D. The page gets a useful 2D first paint at once (a schematic + the steps in order);
 * the 3D (brain3d-scene.js, three.js r160) is imported only after mount, when the box is on screen, the page is idle and WebGL exists.
 *
 *   const b = Brain3D.mount(el, { stages: [{ id, name, why }], ring: [{ id, name }], layout: 'path' | 'lobes', palette: {...}, list: true, title })
 *   b.update({ stageStates: { id: 'passed' | 'current' | 'waiting' | 'blocked' }, ringStates: { id: 'ok' | 'warn' | 'bad' },
 *              currentId, pulse: 0..1, reasons: { id: 'text' }, ringValues: { id: '$1,025' }, now: 'one line' })
 *   b.on('tap', (id, kind) => ...)        kind = 'stage' | 'ring'; a tapped region in 3D, or a step in the list
 *   b.mode                                '2d' | 'loading' | '3d'
 *   b.where(id, 'stage' | 'ring')        { x, y, front } in CSS px on the canvas (3D only; null in 2D); b.stats() the scene's numbers
 *   b.dispose()                           everything off (canvas, GPU objects, listeners, the 2D nodes)
 * Phone budget: 30 fps, pixel ratio <= 2 (1.5 on a small memory), paused off screen / hidden tab; reduced motion = a still frame redrawn on
 * update(); no WebGL / Save-Data / a 2G-3G line = the 2D brain stays. 'path' = the steps along one curve through the brain (Zlarior's 10),
 * 'lobes' = a few regions that meet at the stem (ATLAS's EMA / MACD / S/R over one risk ring).
 */
(function () {
  'use strict';
  if (window.Brain3D) return;
  var d = document, me = d.currentScript, BASE = me && me.src ? me.src.replace(/[^\/]*$/, '') : '../olympus/';
  var NS = 'http://www.w3.org/2000/svg';
  var PAL = { bg: '#000000', glow: '#9d59ee', hi: '#dacbf0', gold: '#f1c14b', ok: '#77db89', bad: '#ef4444', text: '#ebe9f1', muted: '#898497', line: '#3e255e', dim: '#483081' };
  var STATE_TXT = { passed: 'done', current: 'now', waiting: 'waiting', blocked: 'blocked' };

  /** where each stage sits in the brain: x = back (-1) to front (+1), y = low to high, z = left / right hemisphere */
  function layout(stages, kind) {
    var n = stages.length, out = {};
    if (kind === 'lobes') {
      var spots = [[-0.56, 0.16, 0.42], [0.48, 0.5, 0.3], [0.04, 0.3, -0.5],   // different heights: no two labels line up as it turns
         [-0.35, 0.05, -0.5], [0.45, -0.02, -0.4]];
      stages.forEach(function (s, i) { out[s.id] = spots[i % spots.length]; });
    } else {
      stages.forEach(function (s, i) {
        var t = n > 1 ? i / (n - 1) : 0.5;
        out[s.id] = [-0.82 + 1.64 * t, 0.06 + 0.5 * Math.sin(Math.PI * t), 0.36 * Math.sin(2 * Math.PI * t + 0.4)];
      });
    }
    return out;
  }
  function el(tag, cls, text) { var e = d.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function svg(tag, attrs, parent) { var e = d.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
  function weak() { try { var c = navigator.connection || {}; return !!c.saveData || /(^|-)(2g|3g)$/.test(String(c.effectiveType || '')); } catch (e) { return false; } }
  function hasGL() { return !!(window.WebGLRenderingContext || window.WebGL2RenderingContext); }

  function mount(host, o) {
    o = o || {};
    var stages = (o.stages || []).map(function (s) { return { id: String(s.id), name: String(s.name || s.id), why: s.why ? String(s.why) : '' }; });
    var ring = (o.ring || []).map(function (r) { return { id: String(r.id), name: String(r.name || r.id) }; });
    var kind = o.layout === 'lobes' ? 'lobes' : 'path', P = {}, k;
    for (k in PAL) P[k] = PAL[k]; for (k in (o.palette || {})) if (/^#[0-9a-f]{6}$/i.test(o.palette[k])) P[k] = o.palette[k];
    var pos = layout(stages, kind), subs = { tap: [] }, dead = false, scene = null, io = null;
    var state = { stageStates: {}, ringStates: {}, currentId: null, pulse: 0.5, reasons: {}, ringValues: {}, now: '' };
    stages.forEach(function (s, i) { state.stageStates[s.id] = i === 0 ? 'current' : 'waiting'; });
    ring.forEach(function (r) { state.ringStates[r.id] = 'ok'; });

    // ---------------------------------------------------------------- the 2D first paint
    var root = el('div', 'b3'), box = el('div', 'b3-stage');
    if (o.ratio) box.style.setProperty('--b3-ratio', o.ratio);
    box.setAttribute('role', 'img');
    var pic = svg('svg', { 'class': 'b3-2d', viewBox: '0 0 400 400', 'aria-hidden': 'true' });
    var g0 = svg('g', { transform: 'translate(36 -14) scale(.82)' }, pic);   // up and smaller: the caption never hides the ring
    svg('path', { d: 'M78 214c-30-70 20-150 104-158 40-26 112-22 148 22 50 18 66 82 40 128-6 46-50 70-96 66-22 16-62 18-86 2-58 6-104-20-110-60z',
      fill: 'rgba(157,89,238,.08)', stroke: P.glow, 'stroke-opacity': '.55', 'stroke-width': '2' }, g0);
    svg('path', { d: 'M200 64c-10 40 12 70 0 110s10 70 0 108', fill: 'none', stroke: P.glow, 'stroke-opacity': '.25', 'stroke-width': '1.5' }, g0);
    svg('path', { d: 'M184 292c4 24 6 44 2 70h28c-6-26-4-46 2-70', fill: 'rgba(157,89,238,.12)', stroke: P.glow, 'stroke-opacity': '.45' }, g0);
    var X = function (p) { return 200 + p[0] * 150; }, Y = function (p) { return 178 - p[1] * 150 + p[2] * 22; };
    var link = svg('path', { fill: 'none', stroke: P.hi, 'stroke-opacity': '.35', 'stroke-width': '2', 'stroke-dasharray': '4 6' }, g0);
    var ln = [];
    if (kind === 'path') stages.forEach(function (s, i) { ln.push((i ? 'L' : 'M') + X(pos[s.id]).toFixed(1) + ' ' + Y(pos[s.id]).toFixed(1)); });
    else stages.forEach(function (s) { ln.push('M' + X(pos[s.id]).toFixed(1) + ' ' + Y(pos[s.id]).toFixed(1) + 'L200 300'); });
    link.setAttribute('d', ln.join(''));
    var dots = {}, ringDots = {};
    stages.forEach(function (s) { dots[s.id] = svg('circle', { cx: X(pos[s.id]), cy: Y(pos[s.id]), r: kind === 'lobes' ? 20 : 11 }, g0); });
    ring.forEach(function (r, i) { var a = (i / Math.max(1, ring.length)) * Math.PI * 2; ringDots[r.id] = svg('circle', { cx: 200 + Math.cos(a) * 64, cy: 340 + Math.sin(a) * 14, r: 6 }, g0); });
    box.appendChild(pic);
    var tag = el('span', 'b3-tag', '3D'); box.appendChild(tag);
    var now = el('div', 'b3-now'); var nowB = el('b'), nowS = el('span'); now.appendChild(nowB); now.appendChild(nowS); box.appendChild(now);
    root.appendChild(box);
    var list = null, items = {}, ringBox = null, ringItems = {};
    if (o.list !== false) {
      list = el('ol', 'b3-list'); list.setAttribute('aria-label', (o.title ? o.title + ': ' : '') + 'the steps in order');
      stages.forEach(function (s) {
        var li = el('li'); li.tabIndex = 0; li.dataset.id = s.id;
        var n = el('span', 'b3-n', s.name), why = el('span', 'b3-why', ''), st = el('span', 'b3-s', '');
        n.appendChild(why); li.appendChild(n); li.appendChild(st);
        items[s.id] = { li: li, why: why, st: st }; list.appendChild(li);
      });
      list.addEventListener('click', function (e) { var li = e.target.closest('li'); if (li) emit('tap', li.dataset.id, 'stage'); });
      list.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset && e.target.dataset.id) { e.preventDefault(); emit('tap', e.target.dataset.id, 'stage'); } });
      root.appendChild(list);
      if (ring.length) {
        ringBox = el('div', 'b3-ring'); ringBox.setAttribute('aria-label', 'risk gate');
        ring.forEach(function (r) { var sp = el('span'); var dot = el('i'); sp.appendChild(dot); var t = el('b', '', r.name); sp.appendChild(t); var v = el('em', '', ''); v.style.fontStyle = 'normal'; sp.appendChild(v);
          ringItems[r.id] = { sp: sp, v: v }; ringBox.appendChild(sp); });
        root.appendChild(ringBox);
      }
    }
    host.appendChild(root);

    function colour(st) { return st === 'passed' ? P.ok : st === 'current' ? P.gold : st === 'blocked' ? P.bad : P.hi; }
    function ringColour(st) { return st === 'bad' ? P.bad : st === 'warn' ? P.gold : P.ok; }
    function paint2d() {
      var cur = state.currentId, curName = '';
      stages.forEach(function (s) {
        var st = state.stageStates[s.id] || 'waiting', c = dots[s.id];
        c.setAttribute('fill', colour(st)); c.setAttribute('fill-opacity', st === 'waiting' ? '.45' : '.95');
        c.setAttribute('stroke', st === 'current' ? P.glow : 'none'); c.setAttribute('stroke-width', st === 'current' ? '5' : '0');
        if (items[s.id]) { items[s.id].li.dataset.state = st; items[s.id].st.textContent = STATE_TXT[st] || st; items[s.id].why.textContent = state.reasons[s.id] || ''; items[s.id].li.setAttribute('aria-current', s.id === cur ? 'step' : 'false'); }
        if (s.id === cur) curName = s.name;
      });
      ring.forEach(function (r) {
        var st = state.ringStates[r.id] || 'ok'; ringDots[r.id].setAttribute('fill', ringColour(st));
        if (ringItems[r.id]) { ringItems[r.id].sp.dataset.state = st; ringItems[r.id].v.textContent = state.ringValues[r.id] ? ' ' + state.ringValues[r.id] : ''; }
      });
      nowB.textContent = curName ? 'Now: ' + curName : (o.title || 'Brain');
      nowS.textContent = state.now || (cur && state.reasons[cur]) || '';
      box.setAttribute('aria-label', (o.title ? o.title + '. ' : '') + (curName ? 'Now: ' + curName + '. ' : '') + (state.now || ''));
    }
    function emit(ev, a, b) { (subs[ev] || []).slice().forEach(function (f) { try { f(a, b); } catch (e) { /* the page's handler */ } }); }

    var api = {
      mode: '2d',
      update: function (u) {
        if (dead || !u) return api;
        ['stageStates', 'ringStates', 'reasons', 'ringValues'].forEach(function (key) { if (u[key]) for (var x in u[key]) state[key][x] = u[key][x]; });
        if ('currentId' in u) state.currentId = u.currentId;
        if (typeof u.pulse === 'number') state.pulse = Math.max(0, Math.min(1, u.pulse));
        if ('now' in u) state.now = String(u.now || '');
        if (state.currentId && !u.stageStates) { /* the current step is 'current' unless told otherwise */ state.stageStates[state.currentId] = state.stageStates[state.currentId] === 'blocked' ? 'blocked' : 'current'; }
        paint2d(); if (scene) scene.update(state);
        return api;
      },
      on: function (ev, f) { if (subs[ev] && typeof f === 'function') subs[ev].push(f); return api; },
      dispose: function () {
        if (dead) return; dead = true;
        if (io) io.disconnect();
        if (scene) { try { scene.dispose(); } catch (e) { /* gone */ } scene = null; }
        if (root.parentNode) root.parentNode.removeChild(root);
        subs = { tap: [] };
      },
      get state() { return JSON.parse(JSON.stringify(state)); },
      stats: function () { return scene && scene.stats ? scene.stats() : null; },
      where: function (id, kind) { return scene && scene.where ? scene.where(String(id), kind === 'ring' ? 'ring' : 'stage') : null; },
    };
    if (o.currentId) state.currentId = o.currentId;
    paint2d();

    // ---------------------------------------------------------------- the 3D, later
    function go() {
      if (dead || scene || api.mode === 'loading') return;
      if (!hasGL() || weak()) { box.dataset.mode = '2d'; return; }
      api.mode = 'loading'; box.dataset.mode = 'loading';
      import(BASE + 'brain3d-scene.js?v=b1').then(function (m) {
        if (dead) return;
        scene = m.create(box, { stages: stages, ring: ring, pos: pos, layout: kind, palette: P }, state, function (id, kind2) { emit('tap', id, kind2); });
        if (!scene) { api.mode = '2d'; box.dataset.mode = '2d'; return; }
        api.mode = '3d'; box.dataset.mode = '3d';
        requestAnimationFrame(function () { if (!dead) box.classList.add('b3-on'); });
        scene.onLost = function () { scene = null; api.mode = '2d'; box.dataset.mode = '2d'; box.classList.remove('b3-on'); };
      }, function () { api.mode = '2d'; box.dataset.mode = '2d'; });
    }
    var idle = window.requestIdleCallback ? function (f) { window.requestIdleCallback(f, { timeout: 1500 }); } : function (f) { setTimeout(f, 200); };
    var later = function () { idle(function () { requestAnimationFrame(function () { setTimeout(go, 0); }); }); };
    var start = function () {
      if (window.IntersectionObserver) { io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); io = null; later(); } }, { rootMargin: '50% 0px' }); io.observe(box); }
      else later();
    };
    if (o.lazy === false) go(); else if (d.readyState === 'complete') start(); else window.addEventListener('load', start, { once: true });
    box.dataset.mode = '2d';
    return api;
  }
  window.Brain3D = { mount: mount, layout: layout, palette: function () { var o = {}; for (var k in PAL) o[k] = PAL[k]; return o; } };
})();
