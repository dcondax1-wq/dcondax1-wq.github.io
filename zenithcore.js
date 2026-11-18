// Zenith look core (2026-11-03 day, owner: "make everything way higher quality, 3D UI effects ... futuristic", "should look
// like a maid swept"). ONE file, byte-identical in both apps (tools/web_public/zenithcore.js = web_next/js/next/zenithcore.js),
// a classic script that sets window.ZenithFX. Read-only UI: it never fetches, posts, arms or routes anything.
//   quality()        the shared 3D quality: localStorage 'jfx' (ultra | high | low | off, Jarvis's key, the same one the
//                    OLYMPUS apps read) + prefers-reduced-motion; still() = no motion at all, lite() = the cheap path
//   applyTokens(t)   THE one place that writes theme tokens on <html> (Zenith's own skins and the Olympus themes both go
//                    through it): { accent, accent2, page, surface, surface2, ink, ink2, line, good, bad, warn, glow } or
//                    raw '--name' keys; null clears a token
//   olympus(theme)   maps an Olympus theme (an id, or an object with its colours) onto applyTokens
//   glass(root, sel, {deg, skip})  glass cards with an edge light that follows the finger / pointer, and a small 3D tilt (one shared
//                    overlay, one listener set; nothing per card, nothing per frame unless a card is touched)
//   count(el, to)    an animated number (from what the element shows now to `to`, the final text is the real one)
//   ribbon(box, v, {top, color})  the equity "energy ribbon": a 3D ribbon of the curve on a 2D canvas (perspective, depth, flowing light),
//                    paused off screen / in a hidden tab, drawn once when still
//   transition(fn)   View Transitions where supported (and allowed), else fn() now; resolves when the DOM is updated
(function () {
  'use strict';
  if (window.ZenithFX) return;
  const R = document.documentElement;
  const LEVELS = ['ultra', 'high', 'low', 'off'];
  const mq = (q) => { try { return matchMedia(q).matches; } catch (e) { return false; } };
  const reducedOS = () => mq('(prefers-reduced-motion: reduce)');
  function quality() {
    let v = null;
    try { v = localStorage.getItem('jfx'); } catch (e) { v = null; }
    return LEVELS.indexOf(v) >= 0 ? v : (reducedOS() ? 'low' : 'high');
  }
  const still = () => reducedOS() || quality() === 'off' || R.dataset.motion === 'off' || R.dataset.znMotion === 'off';
  const lite = () => quality() === 'low' || quality() === 'off';
  // the app's own 3D switch (Zenith: Settings > 3D effects = html[data-fx]; off by default under automation): the moving 3D
  // parts (tilt, the ribbon's flow, View Transitions) follow it; a page without the attribute has 3D on
  let app3d = null;
  const fx3d = () => { try { return app3d ? !!app3d() : !R.dataset.fx || R.dataset.fx !== 'off'; } catch (e) { return true; } };
  const use3d = (fn) => { app3d = typeof fn === 'function' ? fn : null; mark(); };
  const moving = () => !still() && fx3d();
  const dpr = () => Math.min(window.devicePixelRatio || 1, still() ? 1 : lite() ? 1.5 : 2);
  function setQuality(level) {
    if (LEVELS.indexOf(level) < 0) return;
    try { localStorage.setItem('jfx', level); } catch (e) { /* private mode: this page only */ }
    mark();
  }
  function mark() { R.dataset.zq = quality(); R.classList.toggle('zn-still', !moving()); }

  // ------------------------------------------------------------------ tokens: the one function that writes them
  const TOK = { accent: '--accent', accent2: '--accent-2', page: '--page', surface: '--surface', surface2: '--surface-2', surface3: '--surface-3',
    ink: '--ink', ink2: '--ink-2', muted: '--muted', line: '--line', good: '--good', bad: '--bad', warn: '--warn', gold: '--gold', glow: '--glow', edge: '--zn-edge' };
  const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
  function rgb(hex) {
    if (!HEX.test(String(hex || ''))) return null;
    let h = hex.slice(1); if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  let applied = {};
  function applyTokens(t, root) {
    const el = root || R, out = {};
    Object.keys(t || {}).forEach((k) => {
      const name = k.indexOf('--') === 0 ? k : TOK[k]; if (!name) return;
      const v = t[k];
      if (v == null || v === '') { el.style.removeProperty(name); delete applied[name]; return; }
      el.style.setProperty(name, String(v)); applied[name] = String(v); out[name] = String(v);
    });
    // the accent's glow and its rgb triple follow the accent unless given
    const a = t && t.accent !== undefined ? rgb(t.accent) : null;
    if (t && t.accent !== undefined) {
      if (a) { el.style.setProperty('--zn-accent-rgb', a.join(',')); if (t.glow === undefined) el.style.setProperty('--glow', `rgba(${a.join(',')},.35)`); }
      else { el.style.removeProperty('--zn-accent-rgb'); if (t.glow === undefined) el.style.removeProperty('--glow'); }
    }
    try { window.dispatchEvent(new CustomEvent('zenith:tokens', { detail: out })); } catch (e) { /* old browser */ }
    return out;
  }
  function clearTokens(root) { const el = root || R; Object.keys(applied).forEach((n) => el.style.removeProperty(n)); el.style.removeProperty('--zn-accent-rgb'); applied = {}; }

  // Olympus themes (tools/web_public/olympus/olympus.js Olympus.theme() / onTheme, localStorage 'olympus.theme'): a known
  // id maps to a token set; an object maps its colours by name; an unknown id clears back to the app's own look.
  const OLY = {
    default: null, zenith: null, olympus: null, obsidian: null,
    gold: { accent: '#e9b44c', accent2: '#ff8f5a', edge: 'rgba(255,214,140,.55)' },
    marble: { accent: '#d8c7a0', accent2: '#8fb7ff', edge: 'rgba(255,244,220,.6)' },
    aurora: { accent: '#2fd3c0', accent2: '#6d7cff', edge: 'rgba(150,255,230,.55)' },
    nebula: { accent: '#b388ff', accent2: '#ff6b9a', edge: 'rgba(210,180,255,.55)' },
    ember: { accent: '#ff7a1a', accent2: '#f7c948', edge: 'rgba(255,190,120,.55)' },
    ocean: { accent: '#00d1ff', accent2: '#00e6b0', edge: 'rgba(140,235,255,.55)' },
    crimson: { accent: '#ff2e4d', accent2: '#ffb000', edge: 'rgba(255,150,160,.55)' },
    mono: { accent: '#e8e8e8', accent2: '#9aa3b5', edge: 'rgba(255,255,255,.5)' },
  };
  const OLY_KEYS = { accent: 'accent', primary: 'accent', accent2: 'accent2', secondary: 'accent2', bg: 'page', background: 'page', page: 'page',
    surface: 'surface', panel: 'surface', glass: 'surface2', surface2: 'surface2', text: 'ink', ink: 'ink', dim: 'ink2', muted: 'ink2', line: 'line', border: 'line',
    good: 'good', up: 'good', bad: 'bad', down: 'bad', warn: 'warn', edge: 'edge', glow: 'glow' };
  let olyCur = undefined;
  // a look the OLYMPUS themes engine paints (olympus/themes.js, 2026-11-14) owns the page's colours through its slots, even where an old kit
  // theme has the same name (Glass Aurora 'aurora', Marble White 'marble', Ocean 'ocean'): the old token set would cover the look's own accent
  function owned(id) {
    try {
      const T = window.OLYMPUS_THEMES;
      if (T && typeof T.get === 'function') return T.get(id).id === id;
      return R.getAttribute('data-oly-theme') === id;
    } catch (e) { return false; }
  }
  function olympus(theme) {
    let t = theme;
    if (typeof t === 'string') { try { const j = JSON.parse(t); if (j && typeof j === 'object') t = j; } catch (e) { /* a plain id */ } }
    let set = null, id = '';
    if (typeof t === 'string') { id = t.toLowerCase(); set = owned(id) ? null : (OLY[id] || null); }
    else if (t && typeof t === 'object') {
      id = String(t.id || t.name || '').toLowerCase();
      const src = t.tokens || t.colors || t.vars || t; set = {};
      Object.keys(src).forEach((k) => { const m = OLY_KEYS[k] || OLY_KEYS[k.replace(/^--(oly-)?/, '')]; if (m && typeof src[k] === 'string') set[m] = src[k]; });
      if (!Object.keys(set).length) set = owned(id) ? null : (OLY[id] || null);
    }
    const key = id + JSON.stringify(set);
    if (key === olyCur) return set;
    olyCur = key;
    clearTokens();
    if (set) applyTokens(set);
    R.dataset.olyTheme = id || '';
    return set;
  }
  // follow Olympus when it is on the page (or on the same origin: the storage event), else the stored key once
  function followOlympus() {
    const O = window.Olympus;
    const read = () => { try { return localStorage.getItem('olympus.theme'); } catch (e) { return null; } };
    const follow = () => { try { if (O && typeof O.theme === 'function') olympus(O.theme()); else { const v = read(); if (v) olympus(v); } } catch (e) { /* the app's own look */ } };
    follow();
    // the themes engine may arrive after this (an async script): once the page has loaded, a look it paints is its own (owned())
    if (document.readyState !== 'complete') addEventListener('load', follow, { once: true });
    try { if (O && typeof O.onTheme === 'function') O.onTheme((t) => { try { olympus(t); } catch (e) { /* ignore */ } }); } catch (e) { /* no hook */ }
    addEventListener('storage', (e) => {
      if (e.key === 'olympus.theme') { try { olympus(e.newValue || 'default'); } catch (x) { /* ignore */ } }
      if (e.key === 'jfx') mark();
    });
  }

  // ------------------------------------------------------------------ glass cards: edge light + tilt (one overlay)
  let G = null;
  function glass(root, sel, opts) {
    if (G || !root) return G;
    const o = opts || {}, maxDeg = o.deg || 4;
    const fine = mq('(hover: hover) and (pointer: fine)');
    const glint = document.createElement('i'); glint.className = 'zn-glint'; glint.setAttribute('aria-hidden', 'true');
    document.body.appendChild(glint);
    let card = null, rect = null, q = 0, px = 0, py = 0, press = false;
    const skip = (c) => !c || c.closest('.zn-flat') || (o.skip && c.matches(o.skip)) || c.querySelector('canvas, video, iframe') || c.offsetWidth > innerWidth * 1.2;
    function place() {
      q = 0; if (!card || !rect) return;
      const x = (px - rect.left) / rect.width, y = (py - rect.top) / rect.height;
      glint.style.setProperty('--mx', (x * 100).toFixed(1) + '%'); glint.style.setProperty('--my', (y * 100).toFixed(1) + '%');
      if (moving() && !lite()) {
        const rx = (0.5 - y) * maxDeg * (press ? 0.6 : 1), ry = (x - 0.5) * maxDeg * (press ? 0.6 : 1);
        card.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)${press ? ' scale(.985)' : ''}`;
      }
    }
    function on(c, e) {
      if (c !== card) off();
      card = c; rect = c.getBoundingClientRect();
      const cs = getComputedStyle(c);
      glint.style.cssText = `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;border-radius:${cs.borderTopLeftRadius}`;
      glint.classList.add('on'); c.classList.add('zn-lit');
      px = e.clientX; py = e.clientY; place();
    }
    function off() {
      if (card) { card.classList.remove('zn-lit'); card.style.transform = ''; }
      card = null; rect = null; press = false; glint.classList.remove('on');
    }
    const pick = (e) => { const c = e.target && e.target.closest ? e.target.closest(sel) : null; return c && root.contains(c) && !skip(c) ? c : null; };
    if (fine) {
      root.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse') return;
        const c = pick(e); if (!c) { if (card) off(); return; }
        if (c !== card) on(c, e); else { px = e.clientX; py = e.clientY; if (!q) q = requestAnimationFrame(place); }
      }, { passive: true });
      root.addEventListener('pointerleave', off, { passive: true });
    }
    root.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && fine) { press = !!card; if (card) place(); return; }
      const c = pick(e); if (!c) return; press = true; on(c, e);
    }, { passive: true });
    const up = () => { if (!fine || !card) { off(); return; } press = false; place(); };
    addEventListener('pointerup', up, { passive: true }); addEventListener('pointercancel', off, { passive: true });
    addEventListener('scroll', off, { passive: true, capture: true }); addEventListener('resize', off, { passive: true });
    addEventListener('hashchange', off);
    G = { off, glint };
    return G;
  }

  // ------------------------------------------------------------------ numbers that count to their new value
  const NUM = /^([+−-]?)(\$?)([\d,]+(?:\.\d+)?)([^\d]*)$/;
  function parse(s) {
    const m = String(s || '').trim().match(NUM); if (!m) return null;
    const v = parseFloat(m[3].replace(/,/g, '')) * (m[1] && m[1] !== '+' ? -1 : 1);
    return Number.isFinite(v) ? { sign: m[1], cur: m[2], v, dec: (m[3].split('.')[1] || '').length, post: m[4] } : null;
  }
  function fmt(p, v) {
    const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: p.dec, maximumFractionDigits: p.dec });
    const sg = v < 0 ? (p.sign === '-' ? '-' : '−') : p.sign && v > 0 ? '+' : '';
    return sg + p.cur + s + p.post;
  }
  // el shows the final text already; it rolls from `from` to it (ms 700, ease-out); the end state is the real text
  function count(el, from, ms) {
    if (!el || still()) return;
    const fin = el.textContent, p = parse(fin); if (!p || !Number.isFinite(from) || from === p.v) return;
    const t0 = performance.now(), D = ms || 700;
    el.__znT = (el.__znT || 0) + 1; const tok = el.__znT;
    const f = (t) => {
      if (tok !== el.__znT || !el.isConnected) return;
      const k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 3);
      el.textContent = k < 1 ? fmt(p, from + (p.v - from) * e) : fin;
      if (k < 1) requestAnimationFrame(f); else el.classList.remove('zn-ticking');
    };
    el.classList.add('zn-ticking');
    requestAnimationFrame(f);
  }

  // ------------------------------------------------------------------ the energy ribbon
  // one loop for every ribbon: at most 30 frames a second, none while the page scrolls (the scroll keeps its frames), none
  // off screen or in a hidden tab
  const RIB = new Set();
  let ribLoop = 0, ribLast = 0, scrollUntil = 0;
  function ribFrame() {
    ribLoop = 0;
    const t = performance.now();          // one clock for the cap and the motion (a frame stamp can disagree with it)
    if (document.hidden || !moving()) return;
    let any = false;
    const draw = t - ribLast >= 31 && t > scrollUntil;
    if (draw) ribLast = t;
    RIB.forEach((r) => { if (!r.box.isConnected) { r.stop(); return; } if (r.vis) { if (draw) r.draw(t); any = true; } });
    if (any) ribLoop = requestAnimationFrame(ribFrame);
  }
  const kick = () => { if (!ribLoop && moving()) ribLoop = requestAnimationFrame(ribFrame); };
  addEventListener('scroll', () => { scrollUntil = performance.now() + 180; }, { passive: true, capture: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
  function ribbon(box, values, opts) {
    if (!box) return null;
    const o = opts || {};
    let cv = box.querySelector('canvas.zn-rib-cv');
    if (!cv) { cv = document.createElement('canvas'); cv.className = 'zn-rib-cv'; cv.setAttribute('aria-hidden', 'true'); box.appendChild(cv); }
    const ctx = cv.getContext('2d'); if (!ctx) return null;
    if (box.__zr) box.__zr.stop();
    const vals = (values || []).filter((v) => Number.isFinite(v));
    const pts = vals.length >= 2 ? vals : [0, 0];
    let W = 0, H = 0, k = 1;
    const size = () => { const b = box.getBoundingClientRect(); k = Math.min(1.5, dpr()); W = Math.max(1, b.width); H = Math.max(1, b.height); cv.width = Math.round(W * k); cv.height = Math.round(H * k); };
    size();
    const lo = Math.min.apply(null, pts), hi = Math.max.apply(null, pts), span = hi - lo || 1;
    const up = pts[pts.length - 1] >= pts[0];
    const cA = o.color || (up ? '#2ee59d' : '#ff5a7a'), cB = o.color2 || '#6d7cff';
    const r = { box, vis: true, t0: performance.now() };
    function draw(t) {
      const tt = Math.max(0, ((Number.isFinite(t) ? t : performance.now()) - r.t0) / 1000) || 0;
      ctx.setTransform(k, 0, 0, k, 0, 0); ctx.clearRect(0, 0, W, H);
      const mv = moving(), sway = mv ? Math.sin(tt * 0.5) * 0.08 : 0;
      const depth = Math.min(26, H * 0.24), ang = -0.55 + sway, dx = Math.cos(ang) * depth, dy = Math.sin(ang) * depth;
      const padX = 10, padT = (o.top || 8) + Math.abs(dy), padB = 12, n = pts.length;
      const X = (i) => padX + (W - padX * 2 - dx) * (n === 1 ? 0.5 : i / (n - 1));
      const Y = (v) => padT + (H - padT - padB) * (1 - (v - lo) / span);
      // the floor grid (perspective lines), HD only
      if (!lite()) {
        ctx.strokeStyle = 'rgba(140,150,255,.08)'; ctx.lineWidth = 1;
        for (let g = 0; g <= 6; g++) { const gx = padX + (W - padX * 2) * g / 6; ctx.beginPath(); ctx.moveTo(gx, H - 2); ctx.lineTo(gx + dx * 0.6, H - padB + dy * 0.6); ctx.stroke(); }
      }
      // the ribbon's face: quads between the front edge and the back edge, lit by the slope
      for (let i = 0; i < n - 1; i++) {
        const x0 = X(i), y0 = Y(pts[i]), x1 = X(i + 1), y1 = Y(pts[i + 1]);
        const rise = pts[i + 1] >= pts[i];
        const shade = 0.16 + 0.18 * Math.abs(Math.sin(i * 0.35 - tt * (mv ? 1.4 : 0)));
        ctx.fillStyle = rise ? `rgba(46,229,157,${shade.toFixed(3)})` : `rgba(255,90,122,${shade.toFixed(3)})`;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x1 + dx, y1 + dy); ctx.lineTo(x0 + dx, y0 + dy); ctx.closePath(); ctx.fill();
      }
      // the back edge (dim) and the front edge (bright, two passes = a cheap glow)
      const edge = (ox, oy) => { ctx.beginPath(); for (let i = 0; i < n; i++) { const x = X(i) + ox, y = Y(pts[i]) + oy; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.stroke(); };
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(160,170,255,.35)'; ctx.lineWidth = 1; edge(dx, dy);
      const gr = ctx.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, cB); gr.addColorStop(1, cA);
      if (!lite()) { ctx.globalAlpha = 0.28; ctx.strokeStyle = gr; ctx.lineWidth = 6; edge(0, 0); ctx.globalAlpha = 1; }
      ctx.strokeStyle = gr; ctx.lineWidth = 2; edge(0, 0);
      // the energy: two pulses run along the front edge
      if (mv) {
        for (let p = 0; p < 2; p++) {
          const f = ((tt * 0.22 + p * 0.5) % 1) * (n - 1), i = Math.floor(f), u = f - i;
          if (i >= n - 1) continue;
          const x = X(i) + (X(i + 1) - X(i)) * u, y = Y(pts[i]) + (Y(pts[i + 1]) - Y(pts[i])) * u;
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
          const rg = ctx.createRadialGradient(x, y, 0, x, y, 14); rg.addColorStop(0, 'rgba(255,255,255,.95)'); rg.addColorStop(0.3, 'rgba(160,200,255,.45)'); rg.addColorStop(1, 'rgba(160,200,255,0)');
          ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill();
        }
      }
      // the last point: a beacon
      const lx = X(n - 1), ly = Y(pts[n - 1]), pulse = mv ? 0.5 + 0.5 * Math.sin(tt * 3) : 0.6;
      if (!Number.isFinite(lx) || !Number.isFinite(ly)) return;
      ctx.fillStyle = cA; ctx.globalAlpha = 0.25 + 0.25 * pulse; ctx.beginPath(); ctx.arc(lx, ly, 6 + 3 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(lx, ly, 2.6, 0, Math.PI * 2); ctx.fill();
    }
    r.draw = draw;
    let io = null, ro = null;
    r.stop = () => { RIB.delete(r); if (io) io.disconnect(); if (ro) ro.disconnect(); if (box.__zr === r) box.__zr = null; };
    if (typeof IntersectionObserver !== 'undefined') { io = new IntersectionObserver((es) => { r.vis = es[es.length - 1].isIntersecting; if (r.vis) kick(); }); io.observe(box); }
    if (typeof ResizeObserver !== 'undefined') { let w0 = W; ro = new ResizeObserver(() => { const b = box.getBoundingClientRect(); if (Math.abs(b.width - w0) < 1) return; w0 = b.width; size(); draw(); }); ro.observe(box); }
    box.__zr = r; RIB.add(r);
    draw(); kick();
    return r;
  }

  // ------------------------------------------------------------------ page transitions
  const canVT = () => typeof document.startViewTransition === 'function' && moving() && !lite();
  function transition(fn) {
    if (!canVT()) { fn(); return Promise.resolve(false); }
    try { const vt = document.startViewTransition(fn); return vt.updateCallbackDone.then(() => true, () => true); }
    catch (e) { fn(); return Promise.resolve(false); }
  }

  // ------------------------------------------------------------------ the shared look (both apps)
  const CSS = `
:root{--zn-edge:rgba(190,205,255,.55);--zn-accent-rgb:109,124,255;--zn-s1:4px;--zn-s2:8px;--zn-s3:12px;--zn-s4:16px;--zn-s5:24px;--zn-s6:32px;--zn-r:16px;--zn-tap:44px;--zn-out:cubic-bezier(.16,1,.3,1)}
.zn-glint{position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:40;opacity:0;transition:opacity .25s;contain:strict}
.zn-glint.on{opacity:1}
.zn-glint::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;background:radial-gradient(220px circle at var(--mx,50%) var(--my,0%),var(--zn-edge),transparent 62%);
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}
.zn-glint::after{content:"";position:absolute;inset:0;border-radius:inherit;background:radial-gradient(320px circle at var(--mx,50%) var(--my,0%),rgba(var(--zn-accent-rgb),.10),transparent 60%)}
:root[data-theme="light"] .zn-glint::after{background:radial-gradient(320px circle at var(--mx,50%) var(--my,0%),rgba(var(--zn-accent-rgb),.07),transparent 60%)}
.zn-lit{transition:transform .18s var(--zn-out);will-change:transform}
.zn-ticking{font-variant-numeric:tabular-nums}
.zn-rib{position:relative;height:96px;border-radius:var(--zn-r);overflow:hidden;isolation:isolate;
  background:linear-gradient(180deg,rgba(var(--zn-accent-rgb),.10),rgba(var(--oly-th-n2-rgb, 8,10,20),.0) 70%),radial-gradient(120% 90% at 85% 0%,rgba(var(--oly-th-g8-rgb, 46,229,157),.10),transparent 60%)}
.zn-rib-cv{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y}
:root.zn-still .zn-lit{transition:none}
@media (prefers-reduced-motion: reduce){.zn-glint{transition:none}.zn-lit{transition:none}}
::view-transition-old(root),::view-transition-new(root){animation:none}
::view-transition-group(zn-page){animation-duration:.32s;animation-timing-function:var(--zn-out)}
::view-transition-old(zn-page){animation:zn-vt-out .2s var(--zn-out) both}
::view-transition-new(zn-page){animation:zn-vt-in .32s var(--zn-out) both}
:root[data-zn-dir="r"]::view-transition-new(zn-page){animation-name:zn-vt-in-r}:root[data-zn-dir="l"]::view-transition-new(zn-page){animation-name:zn-vt-in-l}
::view-transition-group(zn-top),::view-transition-group(zn-tabs),::view-transition-group(zn-sub){animation:none}
::view-transition-old(zn-top),::view-transition-old(zn-tabs),::view-transition-old(zn-sub){display:none}
::view-transition-new(zn-top),::view-transition-new(zn-tabs),::view-transition-new(zn-sub){animation:none}
@keyframes zn-vt-out{to{opacity:0;transform:scale(.985)}}
@keyframes zn-vt-in{from{opacity:0;transform:translate3d(0,10px,0) scale(.99)}}
@keyframes zn-vt-in-r{from{opacity:0;transform:translate3d(18px,0,0)}}
@keyframes zn-vt-in-l{from{opacity:0;transform:translate3d(-18px,0,0)}}
`;
  function css() {
    if (document.getElementById('zn-core-css')) return;
    const s = document.createElement('style'); s.id = 'zn-core-css'; s.textContent = CSS; (document.head || R).appendChild(s);
  }

  mark();
  try { matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', mark); } catch (e) { /* old Safari */ }
  window.ZenithFX = { version: 1, quality, still, lite, fx3d, use3d, moving, dpr, setQuality, applyTokens, clearTokens, olympus, followOlympus, OLY, glass, count, parse, ribbon, transition, canVT, css };
})();
