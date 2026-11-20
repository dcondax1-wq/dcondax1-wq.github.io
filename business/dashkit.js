// MONEY DASH KIT (night-revamp-dash 2026-11-20): the charts and live cards of the Money pages, one style everywhere.
// Classic script: window.MONEY_DASH. Reads ./dash.json (tools/money/dash_build.py: BACKTEST + ESTIMATE blocks, each with its date)
// and the live accounts through ../widget/olympus-widget.js (the PC's 15-minute public post = LIVE, else the site copy = PAPER).
// Every number box carries its tag (LIVE / PAPER / BACKTEST / ESTIMATE) and its age. SVG through createElementNS, text through
// textContent only. Motion: transform / opacity only, off with prefers-reduced-motion. No layout jumps: every chart box has a
// fixed aspect ratio before data arrives.
//   MONEY_DASH.mount()   fills every [data-dash="<kind>"] on the page: cockpit, payday, equity, months, edge, trades, fan, labboard
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const okN = (v) => typeof v === 'number' && Number.isFinite(v);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
  const sv = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); for (const k in attrs || {}) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = String(text); return e; };
  const usd = (v, signed) => {
    if (!okN(v)) return '—';
    const a = Math.round(Math.abs(v)).toLocaleString('en-US');
    return (v < 0 ? '-$' : signed && v > 0 ? '+$' : '$') + a;
  };
  const kusd = (v) => (!okN(v) ? '—' : Math.abs(v) >= 1000 ? (v < 0 ? '-$' : '$') + (Math.abs(v) / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1) + 'k' : usd(v));
  const day = (d) => (d && d.length >= 10 ? MN[+d.slice(5, 7) - 1] + ' ' + (+d.slice(8, 10)) : '—');
  const dayY = (d) => (d && d.length >= 10 ? day(d) + ', ' + d.slice(0, 4) : '—');
  const ym = (s) => (s && s.length >= 7 ? MN[+s.slice(5, 7) - 1] + (s.slice(2, 4) !== '26' ? ' ’' + s.slice(2, 4) : '') : s);
  const ago = (sec) => (!okN(sec) || sec < 90 ? 'just now' : sec < 3600 ? Math.round(sec / 60) + ' min ago' : sec < 48 * 3600 ? Math.round(sec / 3600) + ' h ago' : Math.round(sec / 86400) + ' days ago');
  const ageOf = (iso) => { const t = Date.parse(String(iso || '').replace(' ', 'T')); return okN(t) ? ago(Date.now() / 1000 - t / 1000) : 'date unknown'; };
  const reduce = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } };

  function tag(kind, age) {
    const t = el('span', 'dk-tag ' + kind.toLowerCase().replace(/[^a-z]/g, ''), kind);
    if (age) t.appendChild(el('small', null, ' · ' + age));
    return t;
  }
  function head(box, title, kind, age, sub) {
    const h = el('div', 'dk-head');
    h.append(el('h3', null, title), tag(kind, age));
    box.appendChild(h);
    if (sub) box.appendChild(el('p', 'dk-sub', sub));
  }
  function frame(box, ratio) {                     // a fixed-ratio chart box: no layout jump when the chart arrives
    const f = el('div', 'dk-frame'); f.style.aspectRatio = ratio || '16 / 9';
    const tip = el('div', 'dk-tip'); tip.setAttribute('role', 'status'); tip.setAttribute('aria-live', 'polite');
    f.appendChild(tip); box.appendChild(f);
    return { f, tip };
  }
  function svgIn(f, W, H, label) {
    const s = sv('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label, class: 'dk-svg' });
    f.insertBefore(s, f.firstChild);
    return s;
  }
  function showTip(tip, f, x, W, lines) {
    tip.replaceChildren(...lines.map((l, i) => el(i ? 'span' : 'b', null, l)));
    const px = (x / W) * f.clientWidth;
    tip.style.left = Math.max(4, Math.min(f.clientWidth - 150, px - 70)) + 'px';
    tip.classList.add('on');
  }
  function scaleY(lo, hi, H, pt, pb) { const span = hi - lo || 1; return (v) => pt + (H - pt - pb) * (1 - (v - lo) / span); }
  function niceTicks(lo, hi, n) {
    const span = hi - lo || 1, raw = span / (n || 4), mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
    const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
    return out;
  }
  function grid(s, ticks, y, W, fmt) {
    for (const t of ticks) {
      s.appendChild(sv('line', { x1: 0, x2: W, y1: y(t), y2: y(t), class: t === 0 ? 'dk-zero' : 'dk-grid' }));
      s.appendChild(sv('text', { x: 2, y: y(t) - 3, class: 'dk-ax' }, fmt(t)));
    }
  }
  // a line (or area) chart with a crosshair tooltip; pts = [[label, value], ...]
  function lineChart(box, pts, o) {
    const { f, tip } = frame(box, o.ratio || '16 / 8');
    const W = 360, H = 180, pt = 10, pb = 14;
    const vals = pts.map((p) => p[1]).filter(okN);
    let lo = Math.min(0, ...vals, ...(o.bands || []).map((b) => b.v)), hi = Math.max(0, ...vals, ...(o.bands || []).map((b) => b.v));
    const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
    const y = scaleY(lo, hi, H, pt, pb), x = (i) => (pts.length < 2 ? W / 2 : (i / (pts.length - 1)) * (W - 4) + 2);
    const s = svgIn(f, W, H, o.label);
    for (const b of o.bands || []) {
      const yy = y(b.v);
      s.appendChild(sv('rect', b.above ? { x: 0, y: pt, width: W, height: Math.max(0, yy - pt), class: 'dk-band ' + b.cls } : { x: 0, y: yy, width: W, height: Math.max(0, H - pb - yy), class: 'dk-band ' + b.cls }));
      s.appendChild(sv('line', { x1: 0, x2: W, y1: yy, y2: yy, class: 'dk-cut ' + b.cls }));
    }
    grid(s, niceTicks(lo, hi, 3), y, W, o.fmt || kusd);
    let d = '';
    pts.forEach((p, i) => { if (okN(p[1])) d += (d ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p[1]).toFixed(1); });
    if (o.area && d) s.appendChild(sv('path', { d: d + `L${x(pts.length - 1).toFixed(1)} ${y(Math.max(lo, 0)).toFixed(1)}L${x(0).toFixed(1)} ${y(Math.max(lo, 0)).toFixed(1)}Z`, class: 'dk-area' }));
    const path = sv('path', { d, class: 'dk-line' + (o.cls ? ' ' + o.cls : '') });
    s.appendChild(path);
    if (!reduce()) { try { const L = path.getTotalLength(); path.style.strokeDasharray = L; path.style.strokeDashoffset = L; requestAnimationFrame(() => { path.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(.2,.8,.2,1)'; path.style.strokeDashoffset = '0'; }); } catch (_) { /* jsdom */ } }
    const last = pts.length - 1;
    if (last >= 0 && okN(pts[last][1])) s.appendChild(sv('circle', { cx: x(last), cy: y(pts[last][1]), r: 3.5, class: 'dk-dot' }));
    for (const m of o.marks || []) if (pts[m.i] && okN(pts[m.i][1])) s.appendChild(sv('circle', { cx: x(m.i), cy: y(pts[m.i][1]), r: 4, class: 'dk-mark ' + (m.cls || '') }));
    const cross = sv('line', { x1: 0, x2: 0, y1: pt, y2: H - pb, class: 'dk-cross' }), hit = sv('rect', { x: 0, y: 0, width: W, height: H, fill: 'transparent' });
    s.append(cross, hit);
    const move = (ev) => {
      const r = s.getBoundingClientRect(), fx = ((ev.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(last, Math.round(((fx - 2) / (W - 4)) * last)));
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.classList.add('on');
      showTip(tip, f, x(i), W, o.tip(pts[i], i));
    };
    hit.addEventListener('pointermove', move); hit.addEventListener('pointerdown', move);
    hit.addEventListener('pointerleave', () => { tip.classList.remove('on'); cross.classList.remove('on'); });
    const axis = el('div', 'dk-xaxis');
    if (pts.length) { axis.append(el('span', null, o.xfmt(pts[0][0])), el('span', null, o.xfmt(pts[Math.floor(last / 2)][0])), el('span', null, o.xfmt(pts[last][0]))); }
    box.appendChild(axis);
  }
  // diverging bars (+ olive, - terracotta) with a tap tooltip; rows = [[label, value, extra], ...]
  function barChart(box, rows, o) {
    const { f, tip } = frame(box, o.ratio || '16 / 8');
    const W = 360, H = 180, pt = 10, pb = 14, n = rows.length || 1;
    const vals = rows.map((r) => r[1]).filter(okN);
    let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals); const pad = (hi - lo) * 0.08 || 1; lo -= lo < 0 ? pad : 0; hi += pad;
    const y = scaleY(lo, hi, H, pt, pb), bw = W / n, gap = Math.min(2, bw * 0.2);
    const s = svgIn(f, W, H, o.label);
    grid(s, niceTicks(lo, hi, 3), y, W, kusd);
    rows.forEach((r, i) => {
      if (!okN(r[1])) return;
      const y0 = y(0), y1 = y(r[1]), top = Math.min(y0, y1), h = Math.max(1, Math.abs(y1 - y0));
      const b = sv('rect', { x: i * bw + gap / 2, y: top, width: Math.max(1, bw - gap), height: h, rx: Math.min(3, bw / 3), class: 'dk-bar ' + (r[1] >= 0 ? 'pos' : 'neg') });
      if (!reduce()) { b.style.transformOrigin = `0 ${y0}px`; b.style.transform = 'scaleY(0)'; b.style.transition = `transform .7s cubic-bezier(.2,.8,.2,1) ${Math.min(i * 18, 500)}ms`; requestAnimationFrame(() => requestAnimationFrame(() => { b.style.transform = 'none'; })); }
      s.appendChild(b);
    });
    const hit = sv('rect', { x: 0, y: 0, width: W, height: H, fill: 'transparent' }); s.appendChild(hit);
    const pick = (ev) => { const r = s.getBoundingClientRect(), i = Math.max(0, Math.min(n - 1, Math.floor(((ev.clientX - r.left) / r.width) * n))); showTip(tip, f, i * bw + bw / 2, W, o.tip(rows[i])); };
    hit.addEventListener('pointermove', pick); hit.addEventListener('pointerdown', pick);
    hit.addEventListener('pointerleave', () => tip.classList.remove('on'));
    const axis = el('div', 'dk-xaxis');
    if (rows.length) axis.append(el('span', null, o.xfmt(rows[0][0])), el('span', null, o.xfmt(rows[Math.floor((n - 1) / 2)][0])), el('span', null, o.xfmt(rows[n - 1][0])));
    box.appendChild(axis);
  }
  function tiles(box, list) {
    const g = el('div', 'dk-tiles');
    for (const [label, value, cls, note] of list) { const t = el('div', 'dk-tile'); t.append(el('small', null, label), el('b', cls || null, value)); if (note) t.appendChild(el('span', null, note)); g.appendChild(t); }
    box.appendChild(g);
  }
  function table(box, cap, cols, rows) {                 // the table view behind a chart (accessibility + exact numbers)
    const d = el('details', 'dk-table'); d.appendChild(el('summary', null, cap));
    const t = el('table'), hr = el('tr'); cols.forEach((c) => hr.appendChild(el('th', null, c)));
    t.appendChild(el('thead')).appendChild(hr);
    const tb = el('tbody'); rows.forEach((r) => { const tr = el('tr'); r.forEach((c) => tr.appendChild(el('td', null, c))); tb.appendChild(tr); });
    t.appendChild(tb); d.appendChild(t); box.appendChild(d);
  }
  function empty(box, text) { box.appendChild(el('p', 'dk-empty', text)); }

  // ------------------------------------------------------------------ the cards
  const R = {};
  // LIVE cockpit: every account, ring = drawdown room left, bar = the way to pass / to payout
  R.cockpit = async function (box) {
    const W = window.OLY_WIDGET;
    box.replaceChildren(el('div', 'dk-skel'));
    if (!W) { box.replaceChildren(); empty(box, 'Live numbers need ../widget/olympus-widget.js.'); return; }
    let cached = null; try { cached = JSON.parse(localStorage.getItem('oly.glance.v1') || 'null'); } catch (_) { cached = null; }
    const d = await W.load({ site: '../', cached });
    box.replaceChildren();
    const m = d.m;
    const kind = !m ? 'OFFLINE' : m.src === 'PC' ? (m.stale ? 'STALE' : 'LIVE') : m.src === 'SITE' ? 'PAPER' : 'CACHED';   // STALE = the PC's post is over 20 min old
    head(box, 'Your accounts now', kind, m && m.t ? ago(d.now - m.t) : '', m ? m.pc.label + (m.src === 'PC' ? ' · from your PC' : '') : '');
    if (!m || !m.accounts.length) { empty(box, 'No account numbers yet: the PC has not posted and the site has none.'); return; }
    try { if (m.src !== 'CACHED') localStorage.setItem('oly.glance.v1', JSON.stringify(m)); } catch (_) { /* private mode */ }
    tiles(box, [["Today's $", usd(m.today, true), m.today < 0 ? 'neg' : m.today > 0 ? 'pos' : ''],
      ['Balance, all', usd(m.accounts.reduce((s, a) => s + (okN(a.balance) ? a.balance : 0), 0))],
      ['Room left, all', usd(m.accounts.reduce((s, a) => s + (okN(a.room) ? a.room : 0), 0))]]);
    const list = el('div', 'dk-accts');
    for (const a of m.accounts) {
      const row = el('div', 'dk-acct');
      row.appendChild(ring(a.room_frac));
      const b = el('div');
      const nm = el('div', 'dk-nm'); nm.append(el('b', null, a.name), tag(a.badge)); if (a.funded) nm.appendChild(tag('FUNDED'));
      b.appendChild(nm);
      const line = el('div', 'dk-line3');
      line.append(el('span', 'dk-bal', usd(a.balance)), el('span', a.today < 0 ? 'neg' : a.today > 0 ? 'pos' : 'muted', 'today ' + usd(a.today, true)));
      b.appendChild(line);
      const pct = okN(a.progress) ? Math.round(a.progress * 100) : 0;
      const bar = el('div', 'dk-prog'); bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-valuenow', String(pct)); bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100');
      bar.setAttribute('aria-label', a.to_label); const i = el('i'); i.style.setProperty('--w', pct + '%'); bar.appendChild(i); b.appendChild(bar);
      b.appendChild(el('p', 'dk-sub', usd(a.to_go) + ' ' + a.to_label + ' · room ' + usd(a.room) + (okN(a.mll) ? ' of ' + usd(a.mll) : '') + (a.window ? ' · ' + a.window : '')));
      row.appendChild(b); list.appendChild(row);
    }
    box.appendChild(list);
    const k = d.kalshi;
    if (k) box.appendChild(el('p', 'dk-foot', 'Next Kalshi clock window: ' + k.text + ' (' + k.name + ', PAPER first).'));
  };
  function ring(frac) {
    const r = 24, C = 2 * Math.PI * r, f = okN(frac) ? Math.max(0, Math.min(1, frac)) : 0;
    const s = sv('svg', { viewBox: '0 0 60 60', class: 'dk-ring', role: 'img', 'aria-label': okN(frac) ? 'Drawdown room left ' + Math.round(f * 100) + '%' : 'Room unknown' });
    s.appendChild(sv('circle', { cx: 30, cy: 30, r, class: 'tr' }));
    const fg = sv('circle', { cx: 30, cy: 30, r, class: 'fg ' + (f < 0.35 ? 'bad' : f < 0.6 ? 'warn' : 'good'), 'stroke-dasharray': C.toFixed(2), 'stroke-dashoffset': reduce() ? (C * (1 - f)).toFixed(2) : C.toFixed(2) });
    s.appendChild(fg);
    s.appendChild(sv('text', { x: 30, y: 28 }, okN(frac) ? Math.round(f * 100) + '%' : '—'));
    s.appendChild(sv('text', { x: 30, y: 40, class: 'lb' }, 'ROOM'));
    if (!reduce()) requestAnimationFrame(() => requestAnimationFrame(() => fg.setAttribute('stroke-dashoffset', (C * (1 - f)).toFixed(2))));
    return s;
  }

  // ESTIMATE: the payout calendar (first payout per account, the middle date + the likely range) on one timeline
  R.payday = function (box, D, mk) {
    const P = D.plan;
    if (!P) { empty(box, 'No money plan yet (research/lab/money_plan.json).'); return; }
    const M = (P.by_market || {})[mk || 'H2'] || { accounts: [] };
    head(box, 'Payday calendar', 'ESTIMATE', ageOf(P.built), 'First payout per account: the dot = the middle of 1,000 runs of a market like ' + String((P.markets || {})[mk || 'H2'] || '2026 Jul-Oct').replace(/-like$/, '') + ', the bar = the middle half of the runs.');
    const rows = M.accounts.filter((a) => a.first_pay);
    if (!rows.length) { empty(box, 'No payout dates in this plan.'); return; }
    const T = (s) => Date.parse(s + 'T12:00:00Z') / 86400000;
    const t0 = Math.min(Date.now() / 86400000, ...rows.map((a) => T(a.first_pay_p25 || a.first_pay))), t1 = Math.max(...rows.map((a) => T(a.first_pay_p75 || a.first_pay))) + 7;
    const X = (t) => ((t - t0) / (t1 - t0)) * 100;
    const tl = el('div', 'dk-cal');
    const nw = el('div', 'dk-nowwrap'), now = el('div', 'dk-now'); now.style.left = X(Date.now() / 86400000) + '%'; now.appendChild(el('span', null, 'today')); nw.appendChild(now); tl.appendChild(nw);
    for (const a of rows) {
      const r = el('div', 'dk-calrow');
      r.appendChild(el('span', 'dk-caln', a.name));
      const lane = el('div', 'dk-lane');
      const rg = el('i', 'rg'); rg.style.left = X(T(a.first_pay_p25 || a.first_pay)) + '%'; rg.style.width = Math.max(1, X(T(a.first_pay_p75 || a.first_pay)) - X(T(a.first_pay_p25 || a.first_pay))) + '%';
      const dt = el('i', 'dt'); dt.style.left = X(T(a.first_pay)) + '%';
      if (a.pass_date) { const ps = el('i', 'ps'); ps.style.left = X(T(a.pass_date)) + '%'; ps.title = 'pass ' + day(a.pass_date); lane.appendChild(ps); }
      lane.append(rg, dt); r.appendChild(lane);
      r.appendChild(el('span', 'dk-calv', day(a.first_pay) + ' · ' + usd(a.first_pay_usd)));
      tl.appendChild(r);
    }
    box.appendChild(tl);
    const lg = el('p', 'dk-legend'); lg.append(el('i', 'k-dt'), document.createTextNode(' first payout (middle)  '), el('i', 'k-rg'), document.createTextNode(' likely range  '), el('i', 'k-ps'), document.createTextNode(' eval passed (middle)'));
    box.appendChild(lg);
    table(box, 'The dates as a table', ['Account', 'Pass', 'First payout', 'Range', 'Payout', 'No payout in 6 mo'],
      rows.map((a) => [a.name, a.pass_date ? day(a.pass_date) : (a.buy_med ? 'buy ' + day(a.buy_med) : 'funded'), dayY(a.first_pay), day(a.first_pay_p25) + ' – ' + day(a.first_pay_p75), usd(a.first_pay_usd), okN(a.p_no_pay_6m) ? a.p_no_pay_6m + '%' : '—']));
    const cash = M.accounts.reduce((s, a) => s + (okN(a.cash_m) ? a.cash_m : 0), 0);
    box.appendChild(el('p', 'dk-foot', 'About ' + usd(cash) + ' a month in cash across these accounts once they pay (before tax; an ESTIMATE, not a promise).'));
  };

  // ESTIMATE: the whole fleet's money over the next months, p10 / middle / p90 of 1,000 runs
  R.fan = function (box, D, mk) {
    const P = D.plan, M = P && (P.by_market || {})[mk || 'H2'];
    if (!M || !M.fleet || !M.fleet.length) { empty(box, 'No fleet plan yet.'); return; }
    head(box, 'Money in the next 6 months', 'ESTIMATE', ageOf(P.built), 'All accounts together, after fees and tax pot, total so far. Line = the middle run; band = 8 in 10 runs.');
    const rows = M.fleet;
    const { f, tip } = frame(box, '16 / 8');
    const W = 360, H = 180, pt = 10, pb = 14, n = rows.length;
    const all = rows.flatMap((r) => [r.cum_net_p10, r.cum_net_p90, r.cum_net_p50]).filter(okN);
    let lo = Math.min(0, ...all), hi = Math.max(0, ...all); const pd = (hi - lo) * 0.08 || 1; lo -= pd; hi += pd;
    const y = scaleY(lo, hi, H, pt, pb), x = (i) => (n < 2 ? W / 2 : (i / (n - 1)) * (W - 8) + 4);
    const s = svgIn(f, W, H, 'Fleet money, next months, estimate');
    grid(s, niceTicks(lo, hi, 3), y, W, kusd);
    let up = '', dn = '', mid = '';
    rows.forEach((r, i) => { up += (i ? 'L' : 'M') + x(i) + ' ' + y(r.cum_net_p90); mid += (i ? 'L' : 'M') + x(i) + ' ' + y(r.cum_net_p50); });
    for (let i = n - 1; i >= 0; i--) dn += 'L' + x(i) + ' ' + y(rows[i].cum_net_p10);
    s.appendChild(sv('path', { d: up + dn + 'Z', class: 'dk-fan' }));
    s.appendChild(sv('path', { d: mid, class: 'dk-line' }));
    rows.forEach((r, i) => s.appendChild(sv('circle', { cx: x(i), cy: y(r.cum_net_p50), r: 3, class: 'dk-dot' })));
    const hit = sv('rect', { x: 0, y: 0, width: W, height: H, fill: 'transparent' }); s.appendChild(hit);
    const pick = (ev) => { const b = s.getBoundingClientRect(), i = Math.max(0, Math.min(n - 1, Math.round((((ev.clientX - b.left) / b.width) * W - 4) / (W - 8) * (n - 1)))), r = rows[i];
      showTip(tip, f, x(i), W, [ym(r.month) + ' total', 'middle ' + usd(r.cum_net_p50, true), '8 in 10: ' + usd(r.cum_net_p10, true) + ' to ' + usd(r.cum_net_p90, true)]); };
    hit.addEventListener('pointermove', pick); hit.addEventListener('pointerdown', pick); hit.addEventListener('pointerleave', () => tip.classList.remove('on'));
    const ax = el('div', 'dk-xaxis'); ax.append(el('span', null, ym(rows[0].month)), el('span', null, ym(rows[Math.floor((n - 1) / 2)].month)), el('span', null, ym(rows[n - 1].month))); box.appendChild(ax);
    const lastR = rows[n - 1];
    tiles(box, [['Middle, by ' + ym(lastR.month), usd(lastR.cum_net_p50, true), lastR.cum_net_p50 >= 0 ? 'pos' : 'neg'], ['Bad 1 in 10', usd(lastR.cum_net_p10, true), lastR.cum_net_p10 >= 0 ? 'pos' : 'neg'], ['Good 1 in 10', usd(lastR.cum_net_p90, true), 'pos']]);
  };

  // BACKTEST: the 2026 equity curve of the live rules (one point a trading day)
  R.equity = function (box, D) {
    const B = D.backtest;
    if (!B || !(B.equity_2026 || []).length) { empty(box, 'No backtest yet.'); return; }
    const p = (B.periods || {})['2026 YTD'] || {};
    head(box, 'Zlarior (LIT) equity, 2026', 'BACKTEST', 'built ' + (B.built || '?').slice(0, 10), 'The live rules replayed on real NQ1! futures bars, costs in, the normal size. One point a trading day.');
    const pts = B.equity_2026;
    let peak = -Infinity, ddI = 0, dd = 0, pk = 0;
    pts.forEach((q, i) => { if (q[1] > peak) { peak = q[1]; pk = i; } if (q[1] - peak < dd) { dd = q[1] - peak; ddI = i; } });
    void pk;
    lineChart(box, pts, { label: 'LIT 2026 equity, backtest', area: true, xfmt: day, tip: (q) => [day(q[0]), 'total ' + usd(q[1], true)], marks: [{ i: ddI, cls: 'neg' }] });
    tiles(box, [['Net 2026', usd(p.net, true), 'pos'], ['$ a month', usd(p.per_month)], ['Max dip', usd(B.max_dd_2026), 'neg', 'red dot'], ['Trades / week', okN(p.per_week) ? String(p.per_week) : '—'], ['Win rate', okN(p.win_pct) ? p.win_pct + '%' : '—'], ['PF', okN(p.pf) ? String(p.pf) : '—']]);
  };

  // BACKTEST: $ per month (2026, or 2021-25 to show the bad years too)
  R.months = function (box, D) {
    const B = D.backtest;
    if (!B || !(B.months || []).length) { empty(box, 'No months yet.'); return; }
    head(box, 'Zlarior (LIT) $ per month', 'BACKTEST', 'built ' + (B.built || '?').slice(0, 10), '');
    const seg = el('div', 'dk-seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Years');
    const body = el('div');
    const show = (k) => {
      body.replaceChildren();
      const rows = B.months.filter((m) => (k === '2026' ? m[0].startsWith('2026') : !m[0].startsWith('2026')));
      barChart(body, rows, { label: 'LIT $ per month ' + k + ', backtest', xfmt: ym, tip: (r) => [ym(r[0]) + (r[0].startsWith('2026') ? ' 2026' : ''), usd(r[1], true), (r[2] || 0) + ' trades, ' + (r[3] || 0) + ' wins'] });
      const pos = rows.filter((r) => r[1] > 0).length, tot = rows.reduce((s, r) => s + (r[1] || 0), 0);
      body.appendChild(el('p', 'dk-foot', pos + ' of ' + rows.length + ' months made money; total ' + usd(tot, true) + (k === '2026' ? '.' : ': the years the edge did not work (about $0), why the plan keeps a bad case.')));
      table(body, 'The months as a table', ['Month', '$', 'Trades', 'Wins'], rows.map((r) => [r[0], usd(r[1], true), String(r[2] ?? '—'), String(r[3] ?? '—')]));
      for (const b of seg.children) b.setAttribute('aria-pressed', String(b.dataset.k === k));
    };
    for (const [k, t] of [['2026', '2026'], ['old', '2021-25']]) { const b = el('button', 'dk-btn', t); b.type = 'button'; b.dataset.k = k; b.addEventListener('click', () => show(k)); seg.appendChild(b); }
    box.append(seg, body); show('2026');
  };

  // BACKTEST replay: edge health over time (LIT's last-40-session R a week vs the GREEN / RED lines)
  R.edge = function (box, D) {
    const E = D.edge;
    if (!E || !(E.series || []).length) { empty(box, 'No edge health yet.'); return; }
    head(box, 'Edge health over time', 'BACKTEST', 'data to ' + day(E.data_to), 'LIT replayed on the real bars, R a week over its last 40 sessions. Above the top line = GREEN, under the bottom = RED (like 2021-25, about $0). A warning light, not a switch.');
    const c = E.cuts || {}, L = { G: 'GREEN', A: 'AMBER', R: 'RED' };
    const pts = E.series.slice(-200);
    lineChart(box, pts.map((p) => [p[0], p[1], p[2]]), { label: 'LIT edge health, R a week', fmt: (v) => v.toFixed(1) + 'R',
      bands: okN(c.green_above_r_week) ? [{ v: c.green_above_r_week, above: true, cls: 'good' }, { v: c.red_at_or_below_r_week, above: false, cls: 'bad' }] : [],
      xfmt: day, tip: (p) => [day(p[0]), (okN(p[1]) ? p[1].toFixed(2) : '—') + ' R a week', L[p[2]] || '—'] });
    const n = E.now || {}, a = E.atlas || {};
    tiles(box, [['Light now', E.light || '—', E.light === 'GREEN' ? 'pos' : E.light === 'RED' ? 'neg' : 'warn', '● ' + (E.light || '')], ['Last 40: PF', okN(n.pf) ? String(n.pf) : '—'], ['Last 40: $/mo', usd(n.usd_month)],
      ['ATLAS light', a.light || '—', a.light === 'GREEN' ? 'pos' : a.light === 'RED' ? 'neg' : 'warn', a.data_to ? 'data to ' + day(a.data_to) : '']]);
    if (E.line) box.appendChild(el('p', 'dk-foot', E.line));
  };

  // BACKTEST: win / loss, the best and the worst trade, how trades end
  R.trades = function (box, D) {
    const B = D.backtest, S = B && B.stats_2026;
    if (!S) { empty(box, 'No trade stats yet.'); return; }
    head(box, 'Wins, losses, best and worst', 'BACKTEST', 'built ' + (B.built || '?').slice(0, 10), 'Zlarior (LIT) 2026, ' + S.n + ' trades.');
    tiles(box, [['Wins', S.wins + ' of ' + S.n, 'pos'], ['Avg win', usd(S.avg_win, true), 'pos'], ['Avg loss', usd(S.avg_loss, true), 'neg'], ['Win streak', String(S.streak_w)], ['Loss streak', String(S.streak_l), 'neg', 'plan for it'], ['Win : loss $', okN(S.avg_win) && okN(S.avg_loss) && S.avg_loss ? (S.avg_win / -S.avg_loss).toFixed(1) + ' : 1' : '—']]);
    const ex = S.exits || {}, tot = Object.values(ex).reduce((s, v) => s + v, 0) || 1;
    const NAMES = { TARGET: 'target', STOP: 'stop', BE: 'breakeven', CUT_T15: '15-min cut', TIME: 'flat at 15:55' };
    const bar = el('div', 'dk-stack'); bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', 'How trades end: ' + Object.entries(ex).map(([k, v]) => (NAMES[k] || k) + ' ' + v).join(', '));
    for (const k of ['TARGET', 'BE', 'TIME', 'CUT_T15', 'STOP']) if (ex[k]) { const i = el('i', 'x-' + k.toLowerCase()); i.style.flexGrow = String(ex[k] / tot); i.title = (NAMES[k] || k) + ' ' + ex[k]; bar.appendChild(i); }
    box.appendChild(el('p', 'dk-sub', 'How the trades end'));
    box.appendChild(bar);
    const lg = el('p', 'dk-legend');
    for (const k of ['TARGET', 'BE', 'TIME', 'CUT_T15', 'STOP']) if (ex[k]) { lg.append(el('i', 'k-' + k.toLowerCase()), document.createTextNode(' ' + (NAMES[k] || k) + ' ' + ex[k] + '  ')); }
    box.appendChild(lg);
    const two = el('div', 'dk-two');
    for (const [t, x, cls] of [['Best trade', B.best, 'pos'], ['Worst trade', B.worst, 'neg']]) {
      if (!x) continue;
      const c = el('div', 'dk-tcard ' + cls);
      c.append(el('small', null, t), el('b', cls, usd(x.pnl, true) + ' · ' + (okN(x.r) ? (x.r > 0 ? '+' : '') + x.r + 'R' : '')), el('span', null, dayY(x.day) + ' ' + (x.time || '') + ' · ' + (x.side || '') + ' · ' + (NAMES[x.exit] || x.exit || '')),
        el('span', 'muted', 'swept ' + (x.pools || []).join(', ') + ' · $' + (x.risk_usd || '—') + ' at risk'));
      two.appendChild(c);
    }
    box.appendChild(two);
  };

  // ZEUS Lab scoreboard: what was tested, what failed, why (from lab.json rows)
  R.labboard = function (box, L) {
    if (!L || !Array.isArray(L.rows)) { empty(box, 'No Lab data yet.'); return; }
    const rows = L.rows, cnt = {};
    rows.forEach((r) => { cnt[r.status] = (cnt[r.status] || 0) + 1; });
    head(box, 'Every idea tested', 'BACKTEST', 'run ' + (L.built || '?') + ', data to ' + day(L.data_to), rows.length + ' ideas. An idea passes only if it makes more $ in Jan-Jun AND Jul-Oct 2026, keeps 2-4 trades a week and beats luck.');
    const ORDER = [['ready', 'ready for your yes'], ['shadow', 'paper shadow'], ['testing', 'testing'], ['proposed', 'proposed'], ['adopted', 'adopted'], ['rejected', 'rejected'], ['blocked', 'blocked'], ['parked', 'not built']];
    const bar = el('div', 'dk-stack'); bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', ORDER.filter(([k]) => cnt[k]).map(([k, t]) => t + ' ' + cnt[k]).join(', '));
    for (const [k] of ORDER) if (cnt[k]) { const i = el('i', 's-' + k); i.style.flexGrow = String(cnt[k]); bar.appendChild(i); }
    box.appendChild(bar);
    const lg = el('p', 'dk-legend'); for (const [k, t] of ORDER) if (cnt[k]) lg.append(el('i', 'k-s-' + k), document.createTextNode(' ' + t + ' ' + cnt[k] + '  '));
    box.appendChild(lg);
    // why ideas fail: the checks named in each result line
    const WHY = [['less $ in Jan-Jun', /Jan-Jun[^;]*: -\$/], ['less $ in Jul-Oct', /Jul-Oct[^;]*: -\$/], ['trades a week off 2-4', /trades a week \(needs 2-4\)/], ['not beyond luck', /luck|p =|p<=|p ≤|sign-flip/i], ['worse drawdown', /drawdown|DD/], ['not built yet', /not built|needs data|no data/i]];
    const why = WHY.map(([t, re]) => [t, rows.filter((r) => r.status === 'rejected' && re.test(r.why || '')).length]).filter((w) => w[1]);
    if (why.length) {
      box.appendChild(el('p', 'dk-sub', 'Why the rejected ones failed (an idea can fail several checks)'));
      const mx = Math.max(...why.map((w) => w[1]));
      const ul = el('ul', 'dk-hbars');
      for (const [t, n] of why.sort((a, b) => b[1] - a[1])) { const li = el('li'); const i = el('i'); i.style.setProperty('--w', (n / mx) * 100 + '%'); li.append(el('span', null, t), i, el('b', null, String(n))); ul.appendChild(li); }
      box.appendChild(ul);
    }
    // the closest calls: rejected ideas with the best Jul-Oct $ change
    const near = rows.filter((r) => r.months && r.months.H2 && okN(r.months.H2.exp) && okN(r.months.H2.now)).map((r) => [r, r.months.H2.exp - r.months.H2.now, r.months.H1 && okN(r.months.H1.exp) ? r.months.H1.exp - r.months.H1.now : null])
      .sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (near.length) table(box, 'Top 5 by Jul-Oct $ a month change', ['Idea', 'Status', 'Jan-Jun', 'Jul-Oct'], near.map(([r, h2, h1]) => [r.title, r.word || r.status, usd(h1, true), usd(h2, true)]));
  };

  async function getJSON(u) { try { const r = await fetch(u, { cache: 'no-cache' }); return r.ok ? await r.json() : null; } catch (_) { return null; } }
  async function mount() {
    const boxes = Array.from(document.querySelectorAll('[data-dash]'));
    if (!boxes.length) return;
    const need = new Set(boxes.map((b) => b.dataset.dash));
    const [D, L] = await Promise.all([[...need].some((k) => k !== 'cockpit' && k !== 'labboard') ? getJSON('dash.json') : null, need.has('labboard') ? getJSON('lab.json') : null]);
    for (const b of boxes) {
      const k = b.dataset.dash;
      b.classList.add('dk-card');
      try {
        if (k === 'cockpit') await R.cockpit(b);
        else if (k === 'labboard') R.labboard(b, L);
        else if (!D) empty(b, 'Charts load from dash.json (tools/money/dash_build.py); not here yet.');
        else if (R[k]) R[k](b, D, b.dataset.market);
        b.classList.add('dk-in');
      } catch (e) { b.replaceChildren(); empty(b, 'This card could not draw (' + (e && e.message ? e.message : 'error') + ').'); }
    }
  }
  window.MONEY_DASH = { mount, R, usd, kusd, day, ym, ago };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
