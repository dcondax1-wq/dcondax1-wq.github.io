// NQ live chart (ES module, the page side; owner 2026-11-18: "Live chart + our trades: NQ chart with every entry, stop and target drawn on it").
// The latest NQ 5-minute bars from the PC's NinjaTrader with our trades: an arrow at each entry (in the account's colour), the open trades'
// entry / stop / target lines, each closed trade's exit with its $; the account filter (All / Zlarior 50K / Zlarior 25K #2 / ATLAS funded);
// "As of <time> ET, from the PC"; a plain sentence when the PC has not sent bars (never fake data). The feed: tools/pc_report.py's
// "le-bars" post on the public chart topic (nqbars.js feedUrls, read like pc_feed.js: ntfy /json?poll=1), polled every 2 minutes while
// the page is open. The chart: TradingView Lightweight Charts 5.2.1 (Apache-2.0), vendored in vendor/ (no CDN: it works offline),
// loaded after the page. Its own module and card: a failure here never touches the rest of the NQ page. Text only through textContent.
// Read only: it sends nothing, stores nothing, places nothing. window.NQCHART is the test hook. ?acct=z50k opens on one account.
import * as B from './nqbars.js?v=b2';

const LIB = 'vendor/lightweight-charts.standalone.production.js?v=5.2.1';
const POLL_MS = 120000, TIMEOUT_MS = 7000;
const $ = (id) => document.getElementById(id);
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el && el.firstChild) el.removeChild(el.firstChild); };
const S = { feed: undefined, post: null, why: '', acct: 'all', model: null, lib: null, libTried: false, chart: null, series: null, marks: null, lines: [],
  whole: false, want: null, mode: 'default', viewKey: '', drawnN: 0, ready: false, fetchedAt: 0, busy: false, err: '' };

// ------------------------------------------------------------------------------------------------ the AGORA colours (canvas needs real colours)
// perf (CPU profile 2026-11-21: tokens() + its getComputedStyle reads were 171 ms of the load at 4x CPU): read once per theme
let TOK = null, TOK_KEY = '';
function tokens() {
  const key = (document.documentElement.getAttribute('data-oly-theme') || '') + '|' + (document.documentElement.getAttribute('data-oly-scheme') || '');
  if (TOK && TOK_KEY === key) return TOK;
  TOK_KEY = key; TOK = tokensRead(); return TOK;
}
function tokensRead() {
  // night-nq-chart 2026-11-27: the chart's own OLYMPUS NIGHT palette (the page kit's AGORA tokens fell back to cyan / olive): black, violet
  // outlines + glow, gold accents, mint up, a clear rose-red down; account dots gold / lavender / violet
  return { text: '#f3eefc', soft: '#cfc3e6', muted: '#9b8fb5', line: 'rgba(157,89,238,0.32)', up: '#77db89', down: '#ff5d73', good: '#77db89', bad: '#ff5d73',
    gold: '#f1c14b', lav: '#dacbf0', aegean: '#dacbf0', mauve: '#b48cf2', violet: '#9d59ee', rose: '#f472b6', amber: '#fbbf24', sky: '#a5b4fc', sand: '#f472b6',
    font: getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif' };
}
const col = (T, k) => T[k] || T.gold;

// ------------------------------------------------------------------------------------------------ the library and the feed
function loadLib() {
  if (window.LightweightCharts) return Promise.resolve(window.LightweightCharts);
  return new Promise((res) => {
    let done = false;
    const end = () => { if (!done) { done = true; res(window.LightweightCharts || null); } };
    try {
      const s = document.createElement('script'); s.src = LIB; s.async = true; s.onload = end; s.onerror = end;
      document.head.appendChild(s);
    } catch (e) { end(); }
    setTimeout(end, 30000);
  });
}
async function getText(url, ms, cache) {
  const E = window.NQ_EARLY && window.NQ_EARLY.text;  // perf: the page head started the feed file and the chart post (index.html); used once
  if (E && E[url]) { const p = E[url]; delete E[url]; try { const t = await p; if (t != null) return t; } catch (e) { /* ask again below */ } }
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms) : 0;
  try { const r = await fetch(url, { cache, ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.text() : null; } catch (e) { return null; } finally { clearTimeout(timer); }
}
async function fetchPost() {
  if (S.feed === undefined || S.feed === null) {
    const t = await getText('../status_feed.json', 6000, 'no-cache');
    try { S.feed = t ? JSON.parse(t) : null; } catch (e) { S.feed = null; }
  }
  const urls = B.feedUrls(S.feed);
  if (!urls.length) return { post: null, why: 'nofeed' };
  let reached = false;
  for (const u of urls) {
    const t = await getText(u, TIMEOUT_MS, 'no-store');
    if (t == null) continue;
    reached = true;
    const p = B.parse(t);
    if (p) return { post: p, why: '' };
  }
  return { post: null, why: reached ? 'none' : 'offline' };
}

// ------------------------------------------------------------------------------------------------ the card
function renderChips(m) {
  const box = $('chartChips'); clear(box);
  for (const c of m.chips) {
    const b = h('button', 'chip'); b.type = 'button'; b.dataset.k = c.k; b.setAttribute('aria-pressed', c.k === m.acct ? 'true' : 'false');
    if (c.color) { const d = h('span', 'cdot'); d.style.setProperty('--c', col(tokens(), c.color)); d.setAttribute('aria-hidden', 'true'); b.appendChild(d); }
    b.appendChild(h('span', 'cname', c.name));
    if (m.state !== 'none') b.appendChild(h('span', 'cn', String(c.n)));
    b.setAttribute('aria-label', `${c.name}: ${c.n} trade${c.n === 1 ? '' : 's'} on the chart`);
    b.addEventListener('click', () => { if (S.acct !== c.k) { S.acct = c.k; S.mode = 'default'; render(); } });
    box.appendChild(b);
  }
}
function renderList(m) {
  const ol = $('chartTrades'); clear(ol);
  $('chartTradesH').hidden = m.state === 'none';
  if (m.state === 'none') return;
  if (!m.list.length) { ol.appendChild(h('li', 'cnone note', m.none)); return; }
  const T = tokens();
  for (const r of m.list) {
    const li = h('li', 'ctrade'); li.dataset.k = r.k; li.dataset.open = r.open ? '1' : '0';
    const b = h('button', 'ctbtn'); b.type = 'button';
    const dot = h('span', 'cdot'); dot.style.setProperty('--c', col(T, r.color)); dot.setAttribute('aria-hidden', 'true'); b.appendChild(dot);
    const l = h('span', 'ctl'); l.appendChild(h('b', '', `${r.name} · ${r.head}`)); l.appendChild(h('span', 'note', `${r.when} · ${r.detail}`)); b.appendChild(l);
    const rr = h('span', 'ctr'); rr.appendChild(h('b', 'ag-num ' + (r.open ? 'openw' : r.sign), r.money)); b.appendChild(rr);
    b.setAttribute('aria-label', `${r.name}, ${r.head}, ${r.when}, ${r.detail}, ${r.open ? 'still open' : r.money}.${r.onChart ? ' Tap to see it on the chart.' : ''}`);
    if (r.onChart) b.addEventListener('click', () => focusTrade(r)); else b.disabled = true;
    li.appendChild(b); ol.appendChild(li);
  }
}
function say(m) {
  const msg = $('chartMsg'), box = $('chartBox'), pill = $('chartPill');
  let text = '';
  if (!S.fetchedAt) text = 'Loading the PC\'s chart...';
  else if (m.state === 'none') {
    text = S.why === 'offline' ? 'Could not reach the PC\'s chart feed (ntfy.sh). Check the connection; the chart tries again in 2 minutes.'
      : S.why === 'nofeed' ? 'This copy of the site has no PC feed address (status_feed.json), so there is no chart.' : m.message;
  } else if (!S.lib) text = S.libTried ? 'This phone could not load the chart drawing (vendor/lightweight-charts). The trades are listed below.' : 'Loading the chart...';
  msg.textContent = text; msg.hidden = !text || (m.state !== 'none' && !!S.lib);
  box.classList.toggle('empty', m.state === 'none' || (!S.lib && S.libTried));
  box.setAttribute('aria-label', m.state === 'none' ? text : m.label || 'The NQ chart with our trades');
  const st = m.state === 'ok' ? ['Live', 'ok'] : m.state === 'old' ? ['Last bars', 'warn'] : [S.fetchedAt ? 'Waiting for the PC' : 'Loading', ''];
  pill.textContent = st[0]; pill.className = 'pill ' + st[1];
  const asOf = $('chartAsOf'); asOf.textContent = m.state === 'none' ? '' : m.state === 'old' ? m.message : m.asOf; asOf.hidden = m.state === 'none';
  $('chartKey').hidden = m.state === 'none'; $('chartWhole').hidden = m.state === 'none' || !S.lib;
  $('chartKey').textContent = 'Arrow = entry (the account\'s colour) · dot = exit + $ · shaded = an open trade\'s risk (rose) and reward (mint) · dashed = a session\'s high / low · ◆ = a sweep';
  age();
}

// ------------------------------------------------------------------------------------------------ the chart
function makeChart(LC, T) {
  const el = $('chart');
  const chart = LC.createChart(el, {
    autoSize: true,
    layout: { background: { type: LC.ColorType.Solid, color: 'rgba(0,0,0,0)' }, textColor: T.muted, fontFamily: T.font, fontSize: 11, attributionLogo: false },
    grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(157,89,238,0.10)' } },   // night-nq-chart: horizontal guides only, faint violet
    rightPriceScale: { borderColor: T.line, scaleMargins: { top: 0.08, bottom: 0.08 } },
    timeScale: { borderColor: T.line, timeVisible: true, secondsVisible: false, rightOffset: 3, barSpacing: 5, minBarSpacing: 0.8 },     // 0.8: the whole day fits a phone
    crosshair: { mode: LC.CrosshairMode.Normal, vertLine: { color: 'rgba(218,203,240,0.45)', width: 1, style: 3, labelBackgroundColor: '#2a1846' }, horzLine: { color: 'rgba(218,203,240,0.45)', width: 1, style: 3, labelBackgroundColor: '#2a1846' } },
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    kineticScroll: { touch: true, mouse: false },      // night-nq-chart: a flick keeps gliding on a phone (momentum), like a native chart
    localization: { locale: 'en-US', priceFormatter: (p) => { const r = Math.round(p * 100) / 100; return Number.isInteger(r) ? r.toLocaleString('en-US') : B.px(r); } },
  });
  // v5 (owner 2026-11-20 15:50 ET: "The chart looks terrible. It needs some 3D, it needs some effects"): under the candles, the day's closes as a
  // glowing violet line with a soft violet fill fading to black (never in the price scale's range: the candles and the trade lines set it)
  const area = chart.addSeries(LC.AreaSeries, { lineColor: 'rgba(157,89,238,0.0)', lineWidth: 1, topColor: 'rgba(157,89,238,0.16)', bottomColor: 'rgba(157,89,238,0.0)',   // night-nq-chart: a soft violet glow under the candles, no line over them
    priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, autoscaleInfoProvider: () => null, lineType: LC.LineType ? LC.LineType.Curved : 0,
    priceFormat: { type: 'price', precision: 2, minMove: 0.25 } }, 0);
  const series = chart.addSeries(LC.CandlestickSeries, {
    upColor: T.up, downColor: T.down, borderUpColor: T.up, borderDownColor: T.down, wickUpColor: 'rgba(119,219,137,0.85)', wickDownColor: 'rgba(255,93,115,0.85)',
    priceFormat: { type: 'price', precision: 2, minMove: 0.25 }, lastValueVisible: false, priceLineVisible: false,   // the last price: the gold tag below
    // the open trade's stop and target stay on the screen even when the candles have not reached them (the price scale takes them in)
    autoscaleInfoProvider: (orig) => {
      const r = orig(), x = S.model && S.model.extent;
      if (!r || !r.priceRange || !x) return r;
      return { priceRange: { minValue: Math.min(r.priceRange.minValue, x.min), maxValue: Math.max(r.priceRange.maxValue, x.max) }, margins: r.margins };
    },
  });
  const marks = LC.createSeriesMarkers(series, []);
  // night-nq-chart 2026-11-27: the v4 light trail over the candles is gone (it hid them); the area glow under them and the gold last price stay
  const glow = null, trail = null;
  // the last price as a bright GOLD tag on the axis + a dotted gold line (one point, no line drawn); the pulsing dot over it is DOM (#chartPulse)
  const tag = chart.addSeries(LC.LineSeries, { color: '#f1c14b', lineVisible: false, pointMarkersVisible: false, crosshairMarkerVisible: false, lastValueVisible: true,
    priceLineVisible: true, priceLineColor: 'rgba(241,193,75,0.55)', priceLineStyle: LC.LineStyle.Dotted, priceLineWidth: 1, autoscaleInfoProvider: () => null,
    priceFormat: { type: 'price', precision: 2, minMove: 0.25 } }, 0);
  const pulse = () => { placePulse(); fx(); nowBtn(); };
  chart.timeScale().subscribeVisibleLogicalRangeChange(pulse);
  // the view is set before the price axis has measured its labels: when the plot gets narrower (or the phone turns), set it again,
  // unless the owner moved the chart himself (a drag, a pinch, the wheel: from then on his view is kept)
  chart.timeScale().subscribeSizeChange(() => { if (S.want && S.mode !== 'user') setView(S.want[0], S.want[1]); fx(); });
  chart.subscribeCrosshairMove((p) => legend(p && p.time != null && p.seriesData ? p.seriesData.get(series) : null));
  const mine = () => { S.mode = 'user'; };
  for (const ev of ['pointerdown', 'touchstart', 'wheel']) el.addEventListener(ev, mine, { passive: true });
  return { chart, series, marks, trail, glow, area, tag };
}
/** bars of room right of `to` so an exit's "+$514.18" (centred on its bar) is not cut by the price axis (phone QA 2026-11-20) */
function roomRight(from, to) {
  const m = S.model; let pad = 3;
  try {
    const w = S.chart.timeScale().width(); if (!m || !w) return pad;
    const idx = new Map(m.candles.map((c, i) => [c.time, i]));
    for (let k = 0; k < 2; k++) {                                      // twice: more room makes the bars narrower
      const sp = w / (to - from + 0.5 + pad);
      for (const x of m.markers) {
        const i = idx.get(x.time); if (!x.text || i == null || i < from || i > to) continue;
        pad = Math.max(pad, i - to + (x.text.length * 4.2 + 10) / sp);
      }
    }
  } catch (e) { /* 3 bars */ }
  return Math.max(3, Math.min(pad, (to - from + 1) * 0.35));
}
function setView(from, to) {
  try { S.chart.timeScale().setVisibleLogicalRange({ from: from - 0.5, to: to + roomRight(from, to) }); } catch (e) { /* the default view stays */ }
}
/** a view the page chooses: 'default' (the last 6.5 h, it follows new bars), 'whole' (every bar), 'focus' (one trade: kept on a refresh) */
function want(from, to, mode) { S.want = [from, to]; S.mode = mode; setView(from, to); }
/** the view before new data: the user's time range, or (when it reached the newest bar) its width anchored to the right edge */
function viewNow() {
  try {
    const ts = S.chart.timeScale(), lr = ts.getVisibleLogicalRange(), vr = ts.getVisibleRange();
    return lr && vr ? { atEnd: lr.to >= S.drawnN - 1, width: lr.to - lr.from, vr } : null;
  } catch (e) { return null; }
}
function draw(m) {
  const LC = S.lib; if (!LC) return;
  const T = tokens();
  if (!S.chart) Object.assign(S, makeChart(LC, T));
  const keep = S.drawnN && S.viewKey === m.acct && (S.mode === 'user' || S.mode === 'focus') ? viewNow() : null;   // a refresh keeps where the owner looked
  S.series.setData(m.candles);
  try { S.area.setData(m.candles.map((c) => ({ time: c.time, value: c.close }))); const L = m.candles[m.candles.length - 1]; S.tag.setData(L ? [{ time: L.time, value: L.close }] : []); } catch (e) { /* the candles are the chart */ }
  S.drawnN = m.n;
  S.marks.setMarkers(m.markers.map((x) => ({ time: x.time, position: x.position, price: x.price, shape: x.shape, color: col(T, x.color), text: x.text, size: x.size, id: x.id })));
  for (const pl of S.lines) { try { S.series.removePriceLine(pl); } catch (e) { /* gone */ } }
  S.lines = m.lines.map((l) => S.series.createPriceLine({ price: l.price, color: col(T, l.color), lineWidth: l.kind === 'entry' ? 1 : 2,
    lineStyle: l.style === 'dashed' ? LC.LineStyle.Dashed : LC.LineStyle.Solid, axisLabelVisible: true, title: l.title }));
  if (keep && keep.atEnd) { try { S.chart.timeScale().setVisibleLogicalRange({ from: m.n - 1 + 3 - keep.width, to: m.n - 1 + roomRight(m.n - 1 + 3 - keep.width, m.n - 1) }); } catch (e) { /* stays */ } }
  else if (keep) { try { S.chart.timeScale().setVisibleRange(keep.vr); } catch (e) { want(m.view.from, m.view.to, 'default'); } }
  else if (S.whole) want(0, m.n - 1, 'whole');
  else want(m.view.from, m.view.to, 'default');
  S.viewKey = m.acct;
  if (!S.introDone) { S.introDone = true; const box = $('chartBox'); if (box) { box.classList.add('intro'); setTimeout(() => box.classList.remove('intro'), 1200); } }
  requestAnimationFrame(() => { placePulse(); fx(); nowBtn(); });
  legend(null); age();
  if (S.view3d) feed3d();
}
/** the pulsing last-price dot (DOM, CSS animated: nothing repaints the chart): on the newest close, hidden when that bar is out of view */
function placePulse() {
  const d = $('chartPulse'), m = S.model; if (!d || !S.chart || !m || !m.candles.length || S.stale) { if (d) d.hidden = true; return; }
  try {
    const L = m.candles[m.candles.length - 1], x = S.chart.timeScale().timeToCoordinate(L.time), y = S.series.priceToCoordinate(L.close), w = S.chart.timeScale().width();
    if (x === null || y === null || x < 0 || x > w) { d.hidden = true; return; }
    d.hidden = false; d.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  } catch (e) { d.hidden = true; }
}
// ------------------------------------------------------------------------------------------------ night-nq-chart 2026-11-27: the overlay
// One canvas over the plot (pointer-events none, clipped to the plot, never the price axis): the session bands (Asia / London / New York) with
// their names, each open trade's risk (rose) and reward (mint) box from its entry to the right edge, the session highs / lows the bars hold
// (dashed lavender from where they formed, the name at their start) and each sweep (a gold diamond + "swept"). Drawn on a view change only.
function ensureFx() {
  const box = $('chartBox'); if (!box) return null;
  let c = $('chartFx');
  if (!c) { c = document.createElement('canvas'); c.id = 'chartFx'; c.className = 'cfx'; c.setAttribute('aria-hidden', 'true'); box.insertBefore(c, $('chartPulse')); }
  return c;
}
let FXQ = 0;
function fx() { if (FXQ) return; FXQ = requestAnimationFrame(() => { FXQ = 0; try { drawFx(); } catch (e) { /* the chart stays */ } }); }
function drawFx() {
  const c = ensureFx(), m = S.model; if (!c || !S.chart || !m || m.state === 'none') { if (c) c.hidden = true; return; }
  const ts = S.chart.timeScale(), W = Math.max(0, ts.width()), ps = S.chart.paneSize ? S.chart.paneSize(0) : null, H = Math.max(0, ps && ps.height ? ps.height : c.parentElement.clientHeight - 28);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.hidden = false; c.style.width = W + 'px'; c.style.height = H + 'px';
  if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
  const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const X = (t) => ts.timeToCoordinate(t), Y = (p) => S.series.priceToCoordinate(p), half = Math.max(1, (ts.options().barSpacing || 6) / 2);
  const T = tokens(), font = (px, w) => `${w || 600} ${px}px ${T.font}`;
  // sessions
  const tint = { asia: 'rgba(157,89,238,0.07)', london: 'rgba(218,203,240,0.05)', ny: 'rgba(241,193,75,0.035)' };
  for (const s of m.sessions || []) {
    let x0 = X(s.from), x1 = X(s.to);
    if (x0 == null && x1 == null) continue;
    x0 = x0 == null ? 0 : x0 - half; x1 = x1 == null ? W : x1 + half;
    if (x1 < 0 || x0 > W) continue;
    g.fillStyle = tint[s.k] || 'rgba(157,89,238,0.05)'; g.fillRect(Math.max(0, x0), 0, Math.min(W, x1) - Math.max(0, x0), H);
    g.fillStyle = 'rgba(157,89,238,0.35)'; g.fillRect(Math.max(0, x0), 0, 1, H);
    if (x1 - Math.max(0, x0) > 56) { g.font = font(10, 700); g.fillStyle = 'rgba(218,203,240,0.55)'; g.fillText(s.name.toUpperCase(), Math.max(0, x0) + 6, H - 8); }
  }
  // open trades: risk / reward boxes
  for (const z of m.zones || []) {
    const x0 = X(z.from); if (x0 == null) continue;
    const ye = Y(z.e);
    for (const [p, fill, stroke] of [[z.sl, 'rgba(255,93,115,0.13)', 'rgba(255,93,115,0.55)'], [z.tp, 'rgba(119,219,137,0.12)', 'rgba(119,219,137,0.55)']]) {
      if (p == null || ye == null) continue;
      const y = Y(p); if (y == null) continue;
      const top = Math.min(y, ye), h = Math.abs(y - ye), x = Math.max(0, x0 - half);
      g.fillStyle = fill; g.fillRect(x, top, W - x, h);
      g.strokeStyle = stroke; g.lineWidth = 1; g.strokeRect(x + 0.5, top + 0.5, W - x - 1, h - 1);
    }
  }
  // session highs / lows + the PC's levels
  g.setLineDash([5, 4]); g.lineWidth = 1;
  for (const L of m.levels || []) {
    const y = Y(L.price); if (y == null || y < 0 || y > H) continue;
    let x0 = X(L.from); x0 = x0 == null ? 0 : Math.max(0, x0 - half);
    g.strokeStyle = L.src === 'pc' ? 'rgba(241,193,75,0.75)' : 'rgba(218,203,240,0.55)';
    g.beginPath(); g.moveTo(x0, Math.round(y) + 0.5); g.lineTo(W, Math.round(y) + 0.5); g.stroke();
    g.font = font(10, 600);
    const tw = g.measureText(L.label).width, tx = Math.min(x0 + 4, W - tw - 6), ty = y + (L.side > 0 ? -5 : 13);
    g.fillStyle = 'rgba(7,5,12,0.78)'; g.fillRect(tx - 3, ty - 10, tw + 6, 13);                   // a dark backing: readable over the candles
    g.fillStyle = L.src === 'pc' ? '#f1c14b' : 'rgba(218,203,240,0.92)'; g.fillText(L.label, tx, ty);
  }
  g.setLineDash([]);
  // sweeps
  for (const w of m.sweeps || []) {
    const x = X(w.time), y = Y(w.price); if (x == null || y == null || x < 0 || x > W) continue;
    const yy = y + (w.side > 0 ? -9 : 9);
    g.save(); g.translate(x, yy); g.rotate(Math.PI / 4); g.fillStyle = '#f1c14b'; g.shadowColor = 'rgba(241,193,75,0.8)'; g.shadowBlur = 8; g.fillRect(-3.5, -3.5, 7, 7); g.restore();
    g.font = font(9, 700);
    const sx = Math.min(x + 7, W - 38), sy = yy + (w.side > 0 ? -4 : 10), sw = g.measureText('SWEPT').width;
    g.fillStyle = 'rgba(7,5,12,0.78)'; g.fillRect(sx - 2, sy - 9, sw + 4, 12);
    g.fillStyle = 'rgba(241,193,75,0.95)'; g.fillText('SWEPT', sx, sy);
  }
}
// the readout over the plot: the bar under the finger (or the newest): its ET time + session, O H L C and the change, in the chart's colours
function legend(bar) {
  const box = $('chartBox'), m = S.model; if (!box || !m || !m.candles.length) return;
  let el = $('chartLeg');
  if (!el) { el = h('div', 'cleg'); el.id = 'chartLeg'; el.setAttribute('aria-hidden', 'true'); box.appendChild(el); }
  const c = bar && bar.open != null ? bar : m.candles[m.candles.length - 1], i = m.candles.findIndex((x) => x.time === c.time), prev = i > 0 ? m.candles[i - 1].close : c.open;
  const real = c.time - ((B.et(c.time) || {}).off || 0), sess = B.sessionOf(real), sn = (B.SESS.find((x) => x.k === sess) || {}).name || '';
  const ch = c.close - prev, up = c.close >= c.open;
  clear(el);
  const top = h('div', 'cl1');
  top.appendChild(h('b', '', B.hm(real, Date.now() / 1000).replace(' ET', '')));
  top.appendChild(h('span', 'clc ' + (up ? 'up' : 'dn'), B.px(c.close)));
  top.appendChild(h('span', 'clch ' + (ch >= 0 ? 'up' : 'dn'), (ch >= 0 ? '+' : '') + B.px(ch)));
  if (sn) top.appendChild(h('span', 'cls', sn));
  el.appendChild(top);
  const row = h('div', 'cl2');
  for (const [k, v] of [['O', c.open], ['H', c.high], ['L', c.low]]) { const s2 = h('span', 'clv'); s2.appendChild(h('i', '', k)); s2.appendChild(h('b', '', B.px(v))); row.appendChild(s2); }
  el.appendChild(row);
}
// the honest age of the bars, on the chart itself: mint "LIVE" under 20 minutes, gold when older than that, rose past the fresh limit
function age() {
  const box = $('chartBox'), m = S.model; if (!box) return;
  let el = $('chartAge');
  if (!el) { el = h('div', 'cage'); el.id = 'chartAge'; box.appendChild(el); }
  const f = B.freshness(m, S.pc, Date.now() / 1000);
  if (f.cls === 'none') { el.hidden = true; return; }
  el.hidden = false; el.className = 'cage ' + f.cls + (f.pc ? ' pcnow' : '');
  if (S.stale !== (f.cls !== 'live')) { S.stale = f.cls !== 'live'; placePulse(); }   // the pulsing dot means live: never on old bars
  el.textContent = f.text; el.setAttribute('aria-label', f.label);
  // on a phone the badge sits over the readout's corner: the readout goes just under it, however many lines the badge takes
  const leg = $('chartLeg');
  if (leg) { const narrow = box.clientWidth <= 420; leg.style.top = narrow ? (el.offsetTop + el.offsetHeight + 6) + 'px' : ''; }
  // never a 500-point-old close dressed as the current price: the gold tag names its bar's time when the bars are not live,
  // and the PC's newer price gets its own dashed gold line (seen when it is inside the chart's range; the badge says it in words)
  try { if (S.tag) S.tag.applyOptions({ title: f.tagTitle }); } catch (e) { /* the badge says it */ }
  try {
    if (S.pcLine) { S.series.removePriceLine(S.pcLine); S.pcLine = null; }
    if (f.pc && S.series && S.lib) S.pcLine = S.series.createPriceLine({ price: f.pc.px, color: '#f1c14b', lineWidth: 1, lineStyle: S.lib.LineStyle.Dashed, axisLabelVisible: true, title: 'NQ now (PC)' });
  } catch (e) { /* the badge says it */ }
}
// "Now": back to the newest bar when the owner scrolled away from it
function nowBtn() {
  const box = $('chartBox'), m = S.model; if (!box || !S.chart || !m || m.state === 'none') return;
  let b = $('chartNow');
  if (!b) {
    b = h('button', 'cnow', 'Now ›'); b.id = 'chartNow'; b.type = 'button'; b.setAttribute('aria-label', 'Back to the newest bar');
    b.addEventListener('click', () => { S.whole = false; const w = $('chartWhole'); if (w) w.textContent = 'Whole day'; want(m.view.from, m.view.to, 'default'); });
    box.appendChild(b);
  }
  let away = false;
  try { const lr = S.chart.timeScale().getVisibleLogicalRange(); away = !!lr && lr.to < m.n - 1.5; } catch (e) { away = false; }
  b.hidden = !away;
}

// ------------------------------------------------------------------------------------------------ the 3D view (nqchart3d.js, only on the toggle)
// The owner's choice is kept on this phone (one key, nq.chart.view = '2d' | '3d'); 2D is the default. The 3D module (three.js) is fetched only
// when the 3D view is chosen: a module tag (no dynamic import), its 'nqchart3d' event, then NQCHART3D.mount(#chart3d, data).
const PREF = 'nq.chart.view';
const prefGet = () => { try { return window.localStorage.getItem(PREF) || ''; } catch (e) { return ''; } };
const prefSet = (v) => { try { window.localStorage.setItem(PREF, v); } catch (e) { /* this visit only */ } };
function data3d() {
  const m = S.model || {}, c = m.candles || [];
  return { candles: c, last: c.length ? c[c.length - 1].close : null, levels: m.levels || [], zones: m.zones || [],
    markers: (m.markers || []).map((x) => ({ time: x.time, kind: x.kind, usd: x.kind === 'exit' && x.text ? (/^-/.test(x.text) ? -1 : 1) : null, open: x.kind === 'entry' && !(m.markers || []).some((y) => y.kind === 'exit' && String(y.id).slice(1) === String(x.id).slice(1)) })) };
}
function feed3d() { const M = window.NQCHART3D; if (M && S.mounted3d) { try { M.update(data3d()); } catch (e) { /* the 2D chart stays */ } } }
function mount3d() {
  const M = window.NQCHART3D, box = $('chart3d');
  if (!M || !box || !S.view3d || S.mounted3d) return;
  box.hidden = false;
  let ok = false; try { ok = M.mount(box, data3d()); } catch (e) { ok = false; }
  if (ok) { S.mounted3d = true; $('chartBox').classList.add('is3d'); } else { box.hidden = true; S.view3d = false; setToggle(); const b = $('chart3dBtn'); if (b) b.title = 'This phone cannot draw 3D'; }
}
function setToggle() { const b = $('chart3dBtn'); if (b) { b.setAttribute('aria-pressed', String(!!S.view3d)); b.textContent = S.view3d ? '2D' : '3D'; b.setAttribute('aria-label', S.view3d ? 'Show the flat chart' : 'Show the chart in 3D'); } }
function show3d(on, keep) {
  S.view3d = !!on; if (keep) prefSet(on ? '3d' : '2d'); setToggle();
  const box = $('chart3d');
  if (!on) {
    if (S.mounted3d) { try { window.NQCHART3D.dispose(); } catch (e) { /* gone */ } S.mounted3d = false; }
    if (box) box.hidden = true; $('chartBox').classList.remove('is3d'); return;
  }
  if (window.NQCHART3D) { mount3d(); return; }
  if (!S.load3d) {
    S.load3d = true;
    window.addEventListener('nqchart3d', mount3d, { once: true });
    const t = document.createElement('script'); t.type = 'module'; t.src = new URL('./nqchart3d.js?v=3', import.meta.url).href;
    t.onerror = () => { S.load3d = false; S.view3d = false; setToggle(); };
    document.head.appendChild(t);
  }
}
function focusTrade(r) {
  const m = S.model; if (!S.chart || !m || !m.candles.length) return;
  const i0 = r.bi >= 0 ? r.bi : r.bx, i1 = r.bx >= 0 ? r.bx : r.bi;
  if (i0 < 0) return;
  const pad = 24, from = Math.max(0, Math.min(i0, i1) - pad), to = Math.min(m.n - 1, Math.max(i0, i1) + pad);
  want(from, to, 'focus'); S.whole = false; $('chartWhole').textContent = 'Whole day';
  S.focused = r.k + ':' + r.t;
  try { $('chartBox').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { /* old browser */ }
}

function render() {
  const m = S.model = B.model(S.post, S.acct, Date.now() / 1000);
  renderChips(m); say(m); renderList(m);
  if (m.state !== 'none' && S.lib) {
    try { draw(m); $('chart').hidden = false; } catch (e) { S.err = String(e && e.message ? e.message : e); $('chartMsg').textContent = 'The chart could not be drawn on this phone. The trades are listed below.'; $('chartMsg').hidden = false; }
  } else if (S.chart) $('chart').hidden = m.state === 'none';
  S.ready = true;
}

async function pcPrice() {
  const F = window.PC_FEED;                          // index.html loads ../pc_feed.js (its fetches are shared with the rest of the page)
  if (!F || !F.fetchLatest) return;
  try {
    const lite = await Promise.race([F.fetchLatest({ feedUrl: new URL('../status_feed.json', import.meta.url).href }), new Promise((r) => setTimeout(() => r(null), 12000))]);
    const p = B.pcNow(lite); if (p) S.pc = p;
  } catch (e) { /* the bars alone */ }
}
async function refresh(force) {
  if (S.busy || (!force && (document.hidden || Date.now() - S.fetchedAt < POLL_MS / 2))) return;
  S.busy = true;
  try {
    const [r] = await Promise.all([fetchPost(), pcPrice()]);
    S.fetchedAt = Date.now();
    if (r.post || !S.post) { S.post = r.post; S.why = r.why; }       // a failed poll keeps the last good bars on the screen
    render();
    try { window.dispatchEvent(new Event('nq-bars')); } catch (e) { /* the desk cards redraw on their own minute */ }
  } finally { S.busy = false; }
}

function css() {
  if ($('chartCss')) return;
  const l = document.createElement('link'); l.id = 'chartCss'; l.rel = 'stylesheet'; l.href = new URL('./chart.css?v=2', import.meta.url).href; document.head.appendChild(l);
}
async function boot() {
  css();
  const q = new URLSearchParams(location.search), a = q.get('acct');
  if (a && /^[a-z0-9_]{1,24}$/.test(a)) S.acct = a;
  $('chartWhole').addEventListener('click', () => {
    if (!S.model || !S.chart) return;
    S.whole = !S.whole; $('chartWhole').textContent = S.whole ? 'Last 6 hours' : 'Whole day';
    if (S.whole) want(0, S.model.n - 1, 'whole'); else want(S.model.view.from, S.model.view.to, 'default');
  });
  const t3 = $('chart3dBtn');
  if (t3) { t3.hidden = false; setToggle(); t3.addEventListener('click', () => show3d(!S.view3d, true)); }
  render();                                                  // the waiting card at once
  const libP = loadLib().then((LC) => { S.lib = LC && LC.createChart ? LC : null; S.libTried = true; });
  await Promise.all([libP, refresh(true)]);
  render();
  if (prefGet() === '3d' && S.model && S.model.state !== 'none') {                    // the owner's last choice on this phone: after the first paint
    const go = () => show3d(true, false);
    if (typeof requestIdleCallback === 'function') requestIdleCallback(go, { timeout: 1500 }); else setTimeout(go, 300);
  }
  addEventListener('resize', () => requestAnimationFrame(() => { placePulse(); fx(); }));
  setInterval(() => { if (!document.hidden) age(); }, 30000);
  setInterval(() => refresh(false), POLL_MS);
  setInterval(() => { if (!document.hidden && S.model && S.model.state !== 'none') say(B.model(S.post, S.acct, Date.now() / 1000)); }, 60000);   // the age keeps counting
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(false); });
  window.addEventListener('nq-refresh', () => refresh(true));
}
window.NQCHART = { S, B, show3d, ready: () => S.ready && S.libTried && S.fetchedAt > 0, refresh: () => refresh(true), render, setAcct: (k) => { S.acct = k; S.mode = 'default'; render(); } };
boot().catch((e) => { S.err = String(e && e.message ? e.message : e); S.ready = true; S.libTried = true; S.fetchedAt = S.fetchedAt || 1; try { $('chartMsg').textContent = 'The chart could not start: ' + S.err; $('chartMsg').hidden = false; } catch (_) { /* nothing */ } });
