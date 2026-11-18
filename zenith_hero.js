// Zenith hero (2026-11-03 night, owner: "everything sicker and higher quality, it looks like Play-Doh").
// Loaded after zenith.js, before embed.js. A classic script on window.ZenithFX (zenithcore.js), window.POLISH.model() and
// window.MissionUI (missioncore.js). Read-only: it never fetches, posts, arms or routes anything.
//   hero      Home, under the greeting: today's real $ (counts to its new value), the state of every bot (in a trade / armed /
//             watching / off) with its own $ today, the next entry window with a live countdown
//   equity    a real live equity curve per account (the account's closed days ending on the live balance), the drawdown floor as
//             a dashed red line with a glow, the target as a faint green line, a pulsing "now" dot, a finger scrub readout
//   material  glass with a metal rim (a conic sheen), a bloom on the line (High / Ultra only), tabular numbers
//   quality   the shared key 'jfx' through ZenithFX: Low = no bloom, no pulse, Off or reduced motion = still
(function () {
  'use strict';
  const Z = window.ZenithFX;
  if (!Z || typeof PAGES === 'undefined' || typeof VIEWS === 'undefined') return;
  const okN = (v) => typeof v === 'number' && Number.isFinite(v);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const usd = (v) => (okN(v) ? (v < 0 ? '−$' : '$') + Math.abs(Math.round(v)).toLocaleString('en-US') : '—');
  const sUsd = (v) => (okN(v) ? (v < 0 ? '−$' : '+$') + Math.abs(Math.round(v)).toLocaleString('en-US') : '—');
  const cls = (v) => (okN(v) && v > 0 ? 'up' : okN(v) && v < 0 ? 'dn' : '');
  const STATE = { trade: 'In a trade', armed: 'Armed', idle: 'Watching', off: 'Off' };
  const ST = { sel: null, sig: '', cv: null, pts: null, open: false };
  // each bot's pill + the balance chart sit behind one tap (2026-11-18 night-polish: Money now right above already gives each bot's
  // state and $ today; Home under 3,500 px on a phone); the choice is remembered on this phone
  const MORE_KEY = 'zh.more';
  try { ST.open = localStorage.getItem(MORE_KEY) === '1'; } catch (e) { ST.open = false; }
  const MU = () => window.MissionUI;

  function model() { try { return window.POLISH && window.POLISH.model ? window.POLISH.model() : null; } catch (e) { return null; } }
  function accounts(M) { try { return M && M.board && MU() ? (MU().accounts(M) || []) : []; } catch (e) { return []; } }
  const dayPairs = (A) => {
    const o = [];
    for (const d of (A && A.days) || []) {
      const day = Array.isArray(d) ? String(d[0]) : String((d || {}).day || (d || {}).d || '');
      const v = Array.isArray(d) ? +d[1] : +(d || {}).usd;
      if (day && Number.isFinite(v)) o.push([day, v]);
    }
    return o.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  };
  const etDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

  // an account's balance curve: the start (balance minus its closed days), every closed day, then the live balance
  function series(A) {
    const D = dayPairs(A), td = etDay();
    if (okN(A.today) && !D.some((d) => d[0] === td)) D.push([td, A.today]);
    const sum = D.reduce((s, d) => s + d[1], 0);
    const end = okN(A.balance) ? A.balance : null;
    const start = end != null ? end - sum : (okN(A.target) && okN(A.toTarget) ? null : null);
    if (start == null) return null;
    let run = start;
    const pts = [{ l: 'start', v: start }];
    D.forEach((d) => { run += d[1]; pts.push({ l: d[0], v: run }); });
    if (pts.length < 2) pts.push({ l: 'now', v: end });
    return pts;
  }

  // ---------------------------------------------------------------- the next entry window (one live countdown)
  function nextWindow(As, now) {
    let best = null;
    for (const A of As) {
      if (A.placeholder || !A.win) continue;
      const open = A.win.open, t = open ? +A.win.close_t : +A.win.open_t;
      if (!okN(t) || t <= now) continue;
      if (!best || (open && !best.open) || (open === best.open && t < best.t)) best = { t, open, name: A.name, hours: A.win.hours || '' };
    }
    return best;
  }
  const cd = (s) => {
    s = Math.max(0, Math.floor(s));
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return d ? `${d}d ${h}h` : h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(x).padStart(2, '0')}s`;
  };

  // ---------------------------------------------------------------- the chart
  function drawChart(box, pts, A, hover) {
    const cv = box.querySelector('canvas'); if (!cv || !pts) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const b = box.getBoundingClientRect(), W = Math.max(1, b.width), H = Math.max(1, b.height), k = Math.min(2, Z.dpr());
    if (cv.width !== Math.round(W * k) || cv.height !== Math.round(H * k)) { cv.width = Math.round(W * k); cv.height = Math.round(H * k); }
    ctx.setTransform(k, 0, 0, k, 0, 0); ctx.clearRect(0, 0, W, H);
    const lite = Z.lite(), vs = pts.map((p) => p.v);
    const floor = okN(A.floor) ? A.floor : null, tgt = okN(A.target) ? A.target : null;
    let lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs);
    if (floor != null) lo = Math.min(lo, floor);
    if (tgt != null && tgt - hi < (hi - lo) * 2.5) hi = Math.max(hi, tgt);   // the target only when it is near enough to read the curve
    const pad = (hi - lo || 1) * 0.12; lo -= pad; hi += pad;
    const L = 10, R = 10, T = 14, B = 18, n = pts.length;
    const X = (i) => L + (W - L - R) * (n === 1 ? 0.5 : i / (n - 1));
    const Y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
    const up = vs[n - 1] >= vs[0], c1 = up ? '163,174,107' : '224,121,90';   // AGORA v2: olive up, terracotta down (was neon mint / pink)
    // the grid: three quiet lines
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(207,196,178,.08)';
    for (let g = 1; g <= 3; g++) { const y = T + (H - T - B) * g / 4; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(W - R, y); ctx.stroke(); }
    // the drawdown floor: a red band below the line, the line dashed with a glow
    if (floor != null) {
      const fy = Y(floor);
      const g = ctx.createLinearGradient(0, fy, 0, H); g.addColorStop(0, 'rgba(201,106,74,.18)'); g.addColorStop(1, 'rgba(201,106,74,0)');
      ctx.fillStyle = g; ctx.fillRect(L, fy, W - L - R, Math.max(0, H - fy));
      ctx.save(); ctx.setLineDash([6, 5]); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(224,138,107,.95)';
      ctx.beginPath(); ctx.moveTo(L, fy); ctx.lineTo(W - R, fy); ctx.stroke(); ctx.restore();
    }
    if (tgt != null && tgt <= hi) {
      const ty = Y(tgt); ctx.save(); ctx.setLineDash([2, 5]); ctx.strokeStyle = 'rgba(200,162,74,.55)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(L, ty); ctx.lineTo(W - R, ty); ctx.stroke(); ctx.restore();
    }
    // the area under the curve, then the curve (smooth), then the bloom pass
    const path = () => {
      ctx.beginPath(); ctx.moveTo(X(0), Y(vs[0]));
      for (let i = 1; i < n; i++) { const mx = (X(i - 1) + X(i)) / 2; ctx.bezierCurveTo(mx, Y(vs[i - 1]), mx, Y(vs[i]), X(i), Y(vs[i])); }
    };
    path(); ctx.lineTo(X(n - 1), H - B); ctx.lineTo(X(0), H - B); ctx.closePath();
    const fill = ctx.createLinearGradient(0, T, 0, H - B); fill.addColorStop(0, `rgba(${c1},.34)`); fill.addColorStop(1, `rgba(${c1},0)`);
    ctx.fillStyle = fill; ctx.fill();
    const lg = ctx.createLinearGradient(L, 0, W - R, 0); lg.addColorStop(0, '#9c6b3c'); lg.addColorStop(1, up ? '#a3ae6b' : '#e0795a');
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (!lite) { ctx.save(); path(); ctx.strokeStyle = lg; ctx.lineWidth = 6; ctx.globalAlpha = .16; ctx.stroke(); ctx.restore(); }
    path(); ctx.strokeStyle = lg; ctx.lineWidth = 2.4; ctx.stroke();
    // the day dots
    if (n <= 40) { ctx.fillStyle = 'rgba(243,236,224,.8)'; for (let i = 1; i < n - 1; i++) { ctx.beginPath(); ctx.arc(X(i), Y(vs[i]), 2, 0, 6.3); ctx.fill(); } }
    // the labels of the two lines
    ctx.font = '600 11px -apple-system, system-ui, sans-serif'; ctx.textBaseline = 'bottom';
    if (floor != null) { ctx.fillStyle = 'rgba(224,138,107,.95)'; ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText('Drawdown floor ' + usd(floor), W - R - 2, Math.min(H - 14, Y(floor) + 4)); }
    // the hover readout (finger scrub)
    let hx = X(n - 1), hy = Y(vs[n - 1]);
    if (hover != null) {
      const i = Math.max(0, Math.min(n - 1, Math.round(((hover - L) / (W - L - R)) * (n - 1))));
      hx = X(i); hy = Y(vs[i]);
      ctx.strokeStyle = 'rgba(243,236,224,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hx, T); ctx.lineTo(hx, H - B); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx, hy, 4, 0, 6.3); ctx.fill();
      return { i, p: pts[i], x: hx, y: hy };
    }
    return { i: n - 1, p: pts[n - 1], x: hx, y: hy };
  }

  // ---------------------------------------------------------------- the hero
  function build(M, As) {
    const live = As.filter((a) => !a.placeholder);
    if (!live.length) return null;
    const today = live.reduce((s, a) => (okN(a.today) ? s + a.today : s), 0);
    const trades = live.reduce((s, a) => s + (a.tradesToday || 0), 0);
    const withCurve = live.filter((a) => series(a));
    if (!ST.sel || !withCurve.some((a) => a.key === ST.sel)) ST.sel = (withCurve[0] || {}).key || null;
    const A = withCurve.find((a) => a.key === ST.sel) || null;
    return { live, As, today, trades, withCurve, A, now: M.now || Date.now() / 1000 };
  }
  function html(H) {
    const pills = H.As.map((a) => {
      const st = a.placeholder ? 'off' : a.state;
      return `<span class="zh-bot st-${st}" style="--c:${esc(a.color || '#c8a24a')}"><i aria-hidden="true"></i><span><em>${esc(a.name)}</em><b>${a.placeholder ? 'Paper only' : STATE[st] || st}</b></span>`
        + `<u class="${cls(a.today)}" data-zn-num="zh-${esc(a.key)}">${a.placeholder ? '' : sUsd(a.today)}</u></span>`;
    }).join('');
    const tabs = H.withCurve.length > 1 ? `<div class="zh-tabs" role="tablist">${H.withCurve.map((a) => `<button type="button" role="tab" aria-selected="${a.key === ST.sel}" class="${a.key === ST.sel ? 'on' : ''}" data-zh="${esc(a.key)}" style="--c:${esc(a.color || '#c8a24a')}">${esc(a.name)}</button>`).join('')}</div>` : '';
    return `<div class="zh-top"><div class="zh-big"><em>Today · all bots</em><b class="${cls(H.today)}" data-zn-num="zh-today">${sUsd(H.today)}</b>
        <small>${H.trades ? H.trades + (H.trades === 1 ? ' trade' : ' trades') + ' closed or open' : 'No trade yet today'}</small></div>
      <div class="zh-next" data-zh-next></div></div>
      <button type="button" class="zh-more" data-zh-more aria-expanded="${ST.open}"><span>${ST.open ? 'Hide each bot + balance chart' : 'Each bot + balance chart'}</span><i class="pl-chev" aria-hidden="true"></i></button>
      ${ST.open ? `<div class="zh-bots">${pills}</div>` : ''}
      ${ST.open && H.A ? `<div class="zh-ch-h"><span>${esc(H.A.name)} balance</span>${tabs}</div>
      <div class="zh-chart" role="img" aria-label="${esc(H.A.name)} balance by day with the drawdown floor ${usd(H.A.floor)}"><canvas aria-hidden="true"></canvas><i class="zh-now" aria-hidden="true"></i><div class="zh-read" aria-live="off"></div></div>` : ''}`;
  }
  function nextText(H) {
    const nw = nextWindow(H.As, Date.now() / 1000);
    if (nw) return `<em>${nw.open ? 'Window open · closes in' : 'Next window · opens in'}</em><b>${cd(nw.t - Date.now() / 1000)}</b><small>${esc(nw.name)}${nw.hours ? ' · ' + esc(nw.hours) : ''}</small>`;
    const open = MU() && MU().nextSession ? MU().nextSession(Date.now() / 1000) : null;
    return open ? `<em>Market opens in</em><b>${cd(open - Date.now() / 1000)}</b><small>CME 18:00 ET</small>` : `<em>Next window</em><b>—</b><small>waiting for the bots' hours</small>`;
  }

  let HERO = null, H0 = null, tick = 0;
  // no board yet: the hero's own shape as a shimmer, so the cards under it do not jump when the data lands (it is gone for good
  // once the first board has come: a Home with no account at all just shows none)
  let seen = false;
  function skeleton(home) {
    const hi = home.querySelector(':scope > .pl-hi');
    if (seen || !hi) { if (HERO) { HERO.remove(); HERO = null; } return; }
    if (!HERO) { HERO = document.createElement('section'); HERO.className = 'zh-hero zh-skel'; HERO.setAttribute('aria-hidden', 'true'); wire(HERO); }
    if (!HERO.classList.contains('zh-skel')) return;
    if (HERO.parentNode !== hi) hi.appendChild(HERO);
    // the shimmer has the shape of the hero that will land (folded = the big number + the one-tap row), so nothing jumps when it does
    HERO.classList.toggle('zh-sk-open', ST.open);
    if (!HERO.firstChild) HERO.innerHTML = ST.open ? '<i class="zh-sk a"></i><i class="zh-sk b"></i><div class="zh-sk-row"><i class="zh-sk c"></i><i class="zh-sk c"></i></div><i class="zh-sk d"></i>'
      : '<i class="zh-sk a"></i><i class="zh-sk b"></i><i class="zh-sk e"></i>';
  }
  function paint(sync) {
    const home = document.querySelector('#page > .pl-home');
    if (!home) { if (HERO) { HERO.remove(); HERO = null; } return; }
    const M = model(), As = M ? accounts(M) : [], H = M ? build(M, As) : null;
    if (!H) { skeleton(home); return; }
    if (HERO && HERO.classList.contains('zh-skel')) { HERO.classList.remove('zh-skel', 'zh-sk-open'); ST.sig = ''; }
    H0 = H;
    seen = true;
    if (!HERO) { HERO = document.createElement('section'); HERO.className = 'zh-hero'; HERO.setAttribute('aria-label', 'Today'); wire(HERO); }
    HERO.removeAttribute('aria-hidden'); HERO.setAttribute('aria-label', 'Today');
    // inside the greeting box (Home's child order stays: greeting, status bar, account cards ...), ahead of the money ribbon
    const hi = home.querySelector(':scope > .pl-hi');
    if (!hi) return;
    const zi = hi.querySelector(':scope > .zn-hi');
    if (HERO.parentNode !== hi) { if (zi) hi.insertBefore(HERO, zi); else hi.appendChild(HERO); }
    else if (zi && HERO.nextElementSibling !== zi) hi.insertBefore(HERO, zi);
    const A = H.A, S = A ? series(A) : null;
    const sig = JSON.stringify([H.As.map((a) => [a.key, a.state, a.today, a.balance, a.floor, a.placeholder]), ST.sel, ST.open, S && S.map((p) => p.v)]) + Z.quality();
    if (sig !== ST.sig) {
      const prev = {};
      HERO.querySelectorAll('[data-zn-num]').forEach((e) => { const p = Z.parse(e.textContent); if (p) prev[e.dataset.znNum] = p.v; });
      ST.sig = sig;
      HERO.innerHTML = html(H);
      HERO.querySelectorAll('[data-zn-num]').forEach((e) => { const o = prev[e.dataset.znNum]; if (Number.isFinite(o)) Z.count(e, o, 800); else if (!ST.shown && e.dataset.znNum === 'zh-today') Z.count(e, 0, 1100); });
      ST.shown = true;
      ST.pts = S;
      if (sync) chart(); else requestAnimationFrame(chart);
    }
    const nx = HERO.querySelector('[data-zh-next]');
    if (nx) { const t = nextText(H); if (nx.__t !== t) { nx.__t = t; nx.innerHTML = t; } }
    if (!tick) tick = setInterval(() => {
      if (document.hidden || !HERO || !HERO.isConnected || !H0) return;
      const nx2 = HERO.querySelector('[data-zh-next]'); if (nx2) { const t = nextText(H0); if (nx2.__t !== t) { nx2.__t = t; nx2.innerHTML = t; } }
    }, 1000);
  }
  function chart(hover) {
    if (!HERO || !H0 || !H0.A || !ST.pts) return null;
    const box = HERO.querySelector('.zh-chart'); if (!box) return null;
    const r = drawChart(box, ST.pts, H0.A, typeof hover === 'number' ? hover : null);
    const dot = box.querySelector('.zh-now'), rd = box.querySelector('.zh-read');
    if (r && dot) { dot.style.transform = `translate(${r.x}px,${r.y}px)`; dot.classList.toggle('hov', typeof hover === 'number'); }
    if (r && rd) {
      const last = r.i === ST.pts.length - 1;
      rd.innerHTML = `<b>${usd(r.p.v)}</b><span>${last ? 'now' : esc(r.p.l)}</span>`;
      rd.classList.toggle('on', typeof hover === 'number' || true);
    }
    return r;
  }
  function wire(el) {
    el.addEventListener('click', (e) => {
      if (e.target.closest && e.target.closest('[data-zh-more]')) {
        ST.open = !ST.open; ST.sig = '';
        try { localStorage.setItem(MORE_KEY, ST.open ? '1' : '0'); } catch (err) { /* private mode: this visit only */ }
        paint(); return;
      }
      const b = e.target.closest && e.target.closest('[data-zh]'); if (!b) return;
      ST.sel = b.dataset.zh; ST.sig = ''; paint();
    });
    const at = (e) => { const box = el.querySelector('.zh-chart'); if (!box) return null; return e.clientX - box.getBoundingClientRect().left; };
    el.addEventListener('pointermove', (e) => { if (e.target.closest && e.target.closest('.zh-chart')) { const x = at(e); if (x != null) chart(x); } });
    el.addEventListener('pointerleave', () => chart());
    el.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') chart(); });
  }
  addEventListener('resize', () => { if (HERO) chart(); });
  // Home's own draw (polish.js builds .pl-home inside VIEWS.today): the hero lands in the same task, so nothing already painted
  // is pushed down a frame later (layout shift)
  const t0 = VIEWS.today;
  if (t0 && !t0.__zh) {
    const w = function (el) {
      const out = t0.apply(this, arguments);
      try { paint(true); } catch (e) { console.warn('zenith hero', e); }
      return out;
    };
    Object.keys(t0).forEach((k) => { w[k] = t0[k]; });
    w.__zh = true;
    VIEWS.today = w;
  }

  // repaint after every Home draw (the page redraws itself on live data)
  let q = 0;
  const soon = () => { if (!q) q = requestAnimationFrame(() => { q = 0; try { paint(); } catch (e) { console.warn('zenith hero', e); } }); };
  const pg = document.getElementById('page');
  if (pg && typeof MutationObserver !== 'undefined') new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.target.closest && m.target.closest('.zh-hero')) continue;
      for (const n of m.addedNodes) if (n.nodeType === 1 && !n.classList.contains('zh-hero')) { soon(); return; }
    }
  }).observe(pg, { childList: true, subtree: true });
  addEventListener('hashchange', soon);
  addEventListener('storage', (e) => { if (e.key === 'jfx') { ST.sig = ''; soon(); } });
  // pull to refresh (index.html's #ptr) or the refresh button: a light sweep over the hero while the data loads
  const ptr = document.getElementById('ptr'), rf = document.getElementById('refresh');
  const sync = () => { if (HERO) HERO.classList.toggle('zh-sync', !!((ptr && ptr.classList.contains('go')) || (rf && /spin|busy|load/.test(rf.className)))); };
  if (typeof MutationObserver !== 'undefined') [ptr, rf].forEach((n) => n && new MutationObserver(sync).observe(n, { attributes: true, attributeFilter: ['class'] }));
  window.ZENITH_HERO = { version: 1, series, nextWindow, paint: soon };
  soon();
})();
