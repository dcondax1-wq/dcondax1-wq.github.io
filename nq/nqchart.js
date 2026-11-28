// NQ live chart (ES module, the page side; owner 2026-11-18: "Live chart + our trades: NQ chart with every entry, stop and target drawn on it").
// The latest NQ 5-minute bars from the PC's NinjaTrader with our trades: an arrow at each entry (in the account's colour), the open trades'
// entry / stop / target lines, each closed trade's exit with its $; the account filter (All / Zlarior 50K / Zlarior 25K #2 / ATLAS funded);
// "As of <time> ET, from the PC"; a plain sentence when the PC has not sent bars (never fake data). The feed: tools/pc_report.py's
// "le-bars" post on the public chart topic (nqbars.js feedUrls, read like pc_feed.js: ntfy /json?poll=1), polled every 2 minutes while
// the page is open. The chart: TradingView Lightweight Charts 5.2.1 (Apache-2.0), vendored in vendor/ (no CDN: it works offline),
// loaded after the page. Its own module and card: a failure here never touches the rest of the NQ page. Text only through textContent.
// Read only: it sends nothing, stores nothing, places nothing. window.NQCHART is the test hook. ?acct=z50k opens on one account.
import * as B from './nqbars.js?v=b2';
import * as L from './lcmodel.js?v=1';     // day-livechart 2026-11-27: what the bots see (pure)

const LIB = 'vendor/lightweight-charts.standalone.production.js?v=5.2.1';
const POLL_MS = 120000;
const $ = (id) => document.getElementById(id);
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el && el.firstChild) el.removeChild(el.firstChild); };
// the data side (fetch, poll, S) is nqchartfeed.js (eager); this view loads on first view / idle (day-livechart perf)
const C = window.NQCHART, S = C.S, getText = C.getText, pcPrice = C.pcPrice, refresh = C.refresh;

// ------------------------------------------------------------------------------------------------ the AGORA colours (canvas needs real colours)
let TOK = null, TOK_KEY = '';
function tokens() {
  const key = (document.documentElement.getAttribute('data-oly-theme') || '') + '|' + (document.documentElement.getAttribute('data-oly-scheme') || '');
  if (TOK && TOK_KEY === key) return TOK;
  TOK_KEY = key; TOK = tokensRead(); return TOK;
}
function tokensRead() {
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
// ------------------------------------------------------------------------------------------------ the card
/** day-strats: a strategy room (strat.html sets window.NQ_STRAT) shows only its bot's accounts, 'All <name>' first */
const STRAT_BOT = { lit: 'LIT', atlas: 'ATLAS' }, STRAT_NAME = { lit: 'Zlarior', atlas: 'ATLAS', blitz: 'BLITZ', poseidon: 'POSEIDON' };
function stratChips(m) {
  const b = STRAT_BOT[S.strat]; if (!S.strat) return m.chips;
  if (!b) return [];
  const mine = m.chips.filter((c) => c.k !== 'all' && String(c.bot || '').toUpperCase() === b);
  return [{ k: 'bot:' + b, name: 'All ' + STRAT_NAME[S.strat], n: mine.reduce((a, c) => a + c.n, 0), color: null }, ...mine];
}
function renderChips(m) {
  const box = $('chartChips'); clear(box);
  for (const c of stratChips(m)) {
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
  const area = chart.addSeries(LC.AreaSeries, { lineColor: 'rgba(157,89,238,0.0)', lineWidth: 1, topColor: 'rgba(157,89,238,0.16)', bottomColor: 'rgba(157,89,238,0.0)',   // night-nq-chart: a soft violet glow under the candles, no line over them
    priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, autoscaleInfoProvider: () => null, lineType: LC.LineType ? LC.LineType.Curved : 0,
    priceFormat: { type: 'price', precision: 2, minMove: 0.25 } }, 0);
  const series = chart.addSeries(LC.CandlestickSeries, {
    upColor: T.up, downColor: T.down, borderUpColor: T.up, borderDownColor: T.down, wickUpColor: 'rgba(119,219,137,0.85)', wickDownColor: 'rgba(255,93,115,0.85)',
    priceFormat: { type: 'price', precision: 2, minMove: 0.25 }, lastValueVisible: false, priceLineVisible: false,   // the last price: the gold tag below
    autoscaleInfoProvider: (orig) => {
      const r = orig(), x = S.model && S.model.extent;
      if (!r || !r.priceRange || !x) return r;
      return { priceRange: { minValue: Math.min(r.priceRange.minValue, x.min), maxValue: Math.max(r.priceRange.maxValue, x.max) }, margins: r.margins };
    },
  });
  const marks = LC.createSeriesMarkers(series, []);
  const glow = null, trail = null;
  const tag = chart.addSeries(LC.LineSeries, { color: '#f1c14b', lineVisible: false, pointMarkersVisible: false, crosshairMarkerVisible: false, lastValueVisible: true,
    priceLineVisible: true, priceLineColor: 'rgba(241,193,75,0.55)', priceLineStyle: LC.LineStyle.Dotted, priceLineWidth: 1, autoscaleInfoProvider: () => null,
    priceFormat: { type: 'price', precision: 2, minMove: 0.25 } }, 0);
  const pulse = () => { placePulse(); fx(); nowBtn(); };
  chart.timeScale().subscribeVisibleLogicalRangeChange(pulse);
  chart.timeScale().subscribeSizeChange(() => { if (S.want && S.mode !== 'user') setView(S.want[0], S.want[1]); fx(); });
  chart.subscribeClick((p) => { try { whyAt(p); } catch (e) { /* no popover */ } if (p && p.time != null) stripSync(p.time); });
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
  const cs = S.replay != null ? m.candles.slice(0, S.replay + 1) : m.candles;      // the replay scrubber: the day up to the chosen bar
  S.series.setData(cs);
  try { S.area.setData(cs.map((c) => ({ time: c.time, value: c.close }))); const Lc = cs[cs.length - 1]; S.tag.setData(Lc ? [{ time: Lc.time, value: Lc.close }] : []); } catch (e) { /* the candles are the chart */ }
  drawLiveSeries(LC, cs);
  S.drawnN = m.n;
  S.marks.setMarkers(m.markers.map((x) => ({ time: x.time, position: x.position, price: x.price, shape: x.shape, color: col(T, x.color), text: x.text, size: x.size, id: x.id })));
  for (const pl of S.lines) { try { S.series.removePriceLine(pl); } catch (e) { /* gone */ } }
  S.lines = m.lines.map((l) => S.series.createPriceLine({ price: l.price, color: col(T, l.color), lineWidth: l.kind === 'entry' ? 1 : 2,
    lineStyle: l.style === 'dashed' ? LC.LineStyle.Dashed : LC.LineStyle.Solid, axisLabelVisible: true, title: l.title + dollars(l) }));
  for (const pl of S.glLines) { try { S.series.removePriceLine(pl); } catch (e) { /* gone */ } }
  S.glLines = [];
  if (!m.lines.length && S.live) {        // the bot's open trade from its glance when the chart post has none yet: entry / stop / target with $
    for (const t of S.live.trades) {
      const rows = [['entry', t.entry, 'gold', ''], ['stop', t.stop, 'bad', t.risk != null ? ' -$' + Math.round(t.risk) : ''], ['target', t.target, 'good', t.tgt != null ? ' +$' + Math.round(t.tgt) : '']];
      for (const [kind, p, c, extra] of rows) {
        if (p == null) continue;
        S.glLines.push(S.series.createPriceLine({ price: p, color: col(T, c), lineWidth: kind === 'entry' ? 1 : 2, lineStyle: kind === 'entry' ? LC.LineStyle.Dashed : LC.LineStyle.Solid,
          axisLabelVisible: true, title: t.name + ' ' + (kind === 'entry' ? t.side + ' entry' : kind === 'stop' ? 'Stop' : 'Target') + extra }));
      }
    }
  }
  if (S.replay != null) want(Math.max(0, S.replay - B.VIEW_BARS + 1), S.replay, 'replay');
  else if (keep && keep.atEnd) { try { S.chart.timeScale().setVisibleLogicalRange({ from: m.n - 1 + 3 - keep.width, to: m.n - 1 + roomRight(m.n - 1 + 3 - keep.width, m.n - 1) }); } catch (e) { /* stays */ } }
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
  const d = $('chartPulse'), m = S.model; if (!d || !S.chart || !m || !m.candles.length || S.stale || S.replay != null) { if (d) d.hidden = true; return; }
  try {
    const L = m.candles[m.candles.length - 1], x = S.chart.timeScale().timeToCoordinate(L.time), y = S.series.priceToCoordinate(L.close), w = S.chart.timeScale().width();
    if (x === null || y === null || x < 0 || x > w) { d.hidden = true; return; }
    d.hidden = false; d.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  } catch (e) { d.hidden = true; }
}
// ------------------------------------------------------------------------------------------------ night-nq-chart 2026-11-27: the overlay
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
  const cutT = S.replay != null && m.candles[S.replay] ? m.candles[S.replay].time : Infinity;
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
  const LV = (S.live && S.live.levels) || [], x0d = X(firstToday(m));
  for (const Lv of LV) {
    if ((m.levels || []).some((q) => Math.abs(q.price - Lv.price) < 1)) continue;
    const y = Y(Lv.price); if (y == null || y < 0 || y > H) continue;
    const xs = x0d == null ? 0 : Math.max(0, x0d - half);
    g.strokeStyle = Lv.src === 'of' ? 'rgba(180,140,242,0.8)' : 'rgba(241,193,75,0.7)'; g.beginPath(); g.moveTo(xs, Math.round(y) + 0.5); g.lineTo(W, Math.round(y) + 0.5); g.stroke();
    g.font = font(10, 700); const lab = Lv.label + (Lv.read ? ' · ' + Lv.read : ''), tw = g.measureText(lab).width, tx = Math.min(xs + 4, W - tw - 6), ty = y + (Lv.side > 0 ? -5 : 13);
    g.fillStyle = 'rgba(7,5,12,0.8)'; g.fillRect(tx - 3, ty - 10, tw + 6, 13); g.fillStyle = Lv.src === 'of' ? '#c9a8ff' : '#f1c14b'; g.fillText(lab, tx, ty);
  }
  g.setLineDash([]);
  for (const w of [...(m.sweeps || []), ...((S.live && S.live.sweeps) || [])]) {
    if (w.time > cutT) continue;
    const x = X(w.time), y = Y(w.price); if (x == null || y == null || x < 0 || x > W) continue;
    const yy = y + (w.side > 0 ? -9 : 9);
    g.save(); g.translate(x, yy); g.rotate(Math.PI / 4); g.fillStyle = '#f1c14b'; g.shadowColor = 'rgba(241,193,75,0.8)'; g.shadowBlur = 8; g.fillRect(-3.5, -3.5, 7, 7); g.restore();
    g.font = font(9, 700);
    const sx = Math.min(x + 7, W - 38), sy = yy + (w.side > 0 ? -4 : 10), sw = g.measureText('SWEPT').width;
    g.fillStyle = 'rgba(7,5,12,0.78)'; g.fillRect(sx - 2, sy - 9, sw + 4, 12);
    g.fillStyle = 'rgba(241,193,75,0.95)'; g.fillText('SWEPT', sx, sy);
  }
  const Lv2 = S.live || {};
  for (const a of Lv2.absorb || []) {
    if (a.time > cutT) continue;
    const x = X(a.time), y = Y(a.price); if (x == null || y == null || x < 0 || x > W) continue;
    g.strokeStyle = '#c9a8ff'; g.lineWidth = 2; g.shadowColor = 'rgba(157,89,238,0.9)'; g.shadowBlur = 10; g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.stroke(); g.shadowBlur = 0;
    g.font = font(9, 700); g.fillStyle = 'rgba(7,5,12,0.8)'; const tw = g.measureText('ABSORBED').width; g.fillRect(Math.min(x + 9, W - tw - 6) - 2, y - 5 - 9, tw + 4, 12);
    g.fillStyle = '#c9a8ff'; g.fillText('ABSORBED', Math.min(x + 9, W - tw - 6), y - 5);
  }
  if (Lv2.halt) {
    let x = X(Lv2.halt.time);
    const cs = m.candles, lt = cs.length ? cs[cs.length - 1].time : null, lx = lt != null ? X(lt) : null;
    if (x == null && lx != null && Lv2.halt.time > lt) x = lx + ((Lv2.halt.time - lt) / 300) * (ts.options().barSpacing || 6);
    if (x != null && x >= 0 && x <= W) {
      g.strokeStyle = 'rgba(241,193,75,0.85)'; g.setLineDash([6, 4]); g.lineWidth = 1.5; g.beginPath(); g.moveTo(Math.round(x) + 0.5, 0); g.lineTo(Math.round(x) + 0.5, H); g.stroke(); g.setLineDash([]);
      g.font = font(10, 800); const lab = 'HALT ' + ((B.et(Lv2.haltT) || {}).hm || ''), tw = g.measureText(lab).width, hx = Math.max(2, Math.min(x - tw / 2, W - tw - 4));
      g.fillStyle = 'rgba(7,5,12,0.85)'; g.fillRect(hx - 4, 26, tw + 8, 15); g.fillStyle = '#f1c14b'; g.fillText(lab, hx, 37);
    }
  }
}
function firstToday(m) {
  const cs = m.candles; if (!cs.length) return null;
  const real = (c) => c.time - ((B.et(c.time) || {}).off || 0), dayOf = (t) => (B.et(t + 6 * 3600) || {}).day;   // the CME day: 18:00 ET starts it
  const lastDay = dayOf(real(cs[cs.length - 1]));
  for (const c of cs) if (dayOf(real(c)) >= lastDay) return c.time;
  return cs[0].time;
}
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
function age() {
  const box = $('chartBox'), m = S.model; if (!box) return;
  let el = $('chartAge');
  if (!el) { el = h('div', 'cage'); el.id = 'chartAge'; box.appendChild(el); }
  const f = B.freshness(m, S.pc, Date.now() / 1000);
  if (f.cls === 'none') { el.hidden = true; return; }
  el.hidden = false; el.className = 'cage ' + f.cls + (f.pc ? ' pcnow' : '');
  if (S.stale !== (f.cls !== 'live')) { S.stale = f.cls !== 'live'; placePulse(); }   // the pulsing dot means live: never on old bars
  el.textContent = f.text; el.setAttribute('aria-label', f.label);
  const leg = $('chartLeg');
  if (leg) { const narrow = box.clientWidth <= 420; leg.style.top = narrow ? (el.offsetTop + el.offsetHeight + 6) + 'px' : ''; }
  try { if (S.tag) S.tag.applyOptions({ title: f.tagTitle }); } catch (e) { /* the badge says it */ }
  try {
    if (S.pcLine) { S.series.removePriceLine(S.pcLine); S.pcLine = null; }
    if (f.pc && S.series && S.lib) S.pcLine = S.series.createPriceLine({ price: f.pc.px, color: '#f1c14b', lineWidth: 1, lineStyle: S.lib.LineStyle.Dashed, axisLabelVisible: true, title: 'NQ now (PC)' });
  } catch (e) { /* the badge says it */ }
}
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

const FP_URL = '/api/live/footprint', PRIV_URL = '/api/live/state', PRIV_MS = 3000, LITE_MS = 30000, AUX_MS = 300000;
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
const isPriv = () => /^\/site\//.test(location.pathname) || /[?&]priv=1\b/.test(location.search);
function dollars(l) {
  if (/\$/.test(l.title || '') || !S.live) return '';
  for (const t of S.live.trades) {
    if (l.kind === 'stop' && t.stop != null && Math.abs(t.stop - l.price) < 0.3 && t.risk != null) return ' -$' + Math.round(Math.abs(t.risk));
    if (l.kind === 'target' && t.target != null && Math.abs(t.target - l.price) < 0.3 && t.tgt != null) return ' +$' + Math.round(Math.abs(t.tgt));
  }
  return '';
}
/** ATLAS's 5-minute EMA 50 (what it trades around): violet, rose when it is armed SHORT, mint when armed LONG */
function drawLiveSeries(LC, cs) {
  const Lv = S.live; if (!Lv) return;
  const side = Lv.atlasArm && Lv.atlasArm.side, color = side === 'SHORT' ? '#ff5d73' : side === 'LONG' ? '#77db89' : '#b48cf2';
  if (!S.emaS) S.emaS = S.chart.addSeries(LC.LineSeries, { color, lineWidth: 2, lineStyle: LC.LineStyle.Solid, priceLineVisible: false, lastValueVisible: true, title: 'EMA 50',
    crosshairMarkerVisible: false, autoscaleInfoProvider: () => null, priceFormat: { type: 'price', precision: 2, minMove: 0.25 } });
  const last = cs.length ? cs[cs.length - 1].time : 0, t0 = cs.length ? cs[0].time : 0;
  S.emaS.applyOptions({ color, title: side ? 'EMA 50 · ATLAS ' + side : 'EMA 50' });
  S.emaS.setData(Lv.ema.filter((p) => p.time <= last && p.time >= t0));
}
function stampNow() {
  const now = Date.now() / 1000, m = S.model || {};
  if (S.privOn && S.priv) return L.stamp('private', S.priv.t, now);
  const lt = S.pc && S.pc.t != null ? S.pc.t : null, t = Math.max(lt || 0, m.dataT || 0) || null;
  return L.stamp('public', t, now);
}
function mk(id, cls, where, ref) {
  let e = $(id); if (e) return e;
  e = h('div', cls); e.id = id;
  const box = $('chartBox'); if (!box || !box.parentNode) return null;
  if (where === 'before') box.parentNode.insertBefore(e, box); else box.parentNode.insertBefore(e, ref || box.nextSibling);
  return e;
}
function renderLive() {
  const Lv = S.live, m = S.model; if (!m) return;
  const top = mk('lcTop', 'lctop', 'before'), bot = mk('lcBelow', 'lcbelow', 'after');
  if (!top || !bot) return;
  const off = m.state === 'none' && !Lv;
  top.hidden = off; bot.hidden = off;
  clear(top);
  const st = stampNow(), sp = h('span', 'lcstamp ' + st.cls, st.text); sp.id = 'lcStamp'; sp.setAttribute('role', 'status'); top.appendChild(sp);
  if (Lv && Lv.stage) {
    const g = h('div', 'lcstage'); g.id = 'lcStage';
    const n = Lv.stage.n, of = Lv.stage.of || 10;
    g.setAttribute('aria-label', `Zlarior's stage: ${Lv.stage.label}${n != null ? `, step ${n} of ${of}` : ''}${Lv.litOn ? '' : ' (off)'}`);
    const lab = h('span', 'lcsl'); lab.appendChild(h('b', '', 'Zlarior')); lab.appendChild(h('span', '', ' ' + Lv.stage.label + (n != null ? ` ${n}/${of}` : ''))); g.appendChild(lab);
    const bar = h('span', 'lcsteps'); bar.setAttribute('aria-hidden', 'true');
    for (let i = 1; i <= of; i++) bar.appendChild(h('i', n != null && i <= n ? (i === n ? 'on now' : 'on') : ''));
    g.appendChild(bar); top.appendChild(g);
  }
  const chips = h('div', 'lcchips');
  if (Lv && Lv.atlasArm) { const c = h('span', 'lcchip ' + (Lv.atlasArm.side === 'SHORT' ? 'dn' : 'up'), `ATLAS armed ${Lv.atlasArm.side}`); c.id = 'lcAtlas'; chips.appendChild(c); }
  if (Lv && Lv.halt) { const c = h('span', 'lcchip halt', Lv.halt.passed ? `Halted ${((B.et(Lv.haltT) || {}).hm || '')} ET (early close)` : `Halt ${((B.et(Lv.haltT) || {}).hm || '')} ET today`); c.id = 'lcHalt'; chips.appendChild(c); }
  if (Lv && Lv.trades.length) for (const t of Lv.trades) chips.appendChild(h('span', 'lcchip gold', `${t.name} ${t.side} open${t.risk != null ? ' · risk $' + Math.round(Math.abs(t.risk)) : ''}${t.tgt != null ? ' · target $' + Math.round(Math.abs(t.tgt)) : ''}`));
  if (chips.firstChild) top.appendChild(chips);
  clear(bot);
  const nx = Lv && Lv.next;
  const nl = h('p', 'lcnext'); nl.id = 'lcNext';
  nl.appendChild(h('b', '', nx ? `Next trade if (${nx.bot}${nx.side ? ' ' + nx.side : ''}): ` : 'Next trade: '));
  nl.appendChild(h('span', '', nx ? nx.text : 'the PC has not said what it waits for yet.'));
  bot.appendChild(nl);
  const ol = h('ol', 'lctick'); ol.id = 'lcTicker'; ol.setAttribute('aria-label', 'What the bots just thought, newest first');
  const rows = (Lv && Lv.ticker) || [];
  if (!rows.length) ol.appendChild(h('li', 'lcnone', S.lite ? 'No bot thoughts in the PC\'s last post.' : 'Waiting for the PC\'s post (the bots\' thoughts).'));
  rows.forEach((r, i) => {
    const li = h('li', i === 0 ? 'lcrow first' : 'lcrow');
    li.appendChild(h('span', 'lce', r.emoji)); li.appendChild(h('span', 'lct', r.hm)); li.appendChild(h('b', 'lcb ' + r.bot, r.name)); li.appendChild(h('span', 'lcx', r.text));
    ol.appendChild(li);
  });
  bot.appendChild(ol);
  replayBar(bot, m);
  sweepFlash();
}
function replayBar(bot, m) {
  if (!m.candles || m.candles.length < 3 || !S.lib) return;
  const i0 = Math.max(0, m.candles.findIndex((c) => c.time === firstToday(m))), n = m.candles.length;
  const row = h('div', 'lcreplay'); row.id = 'lcReplay';
  const play = h('button', 'btn lcbtn', S.playing ? 'Pause' : 'Replay ▶'); play.type = 'button'; play.id = 'lcPlay';
  play.setAttribute('aria-label', S.playing ? 'Pause the replay' : 'Replay today bar by bar');
  const r = document.createElement('input'); r.type = 'range'; r.id = 'lcScrub'; r.className = 'lcscrub'; r.min = String(i0); r.max = String(n - 1); r.step = '1';
  r.value = String(S.replay != null ? S.replay : n - 1); r.setAttribute('aria-label', 'Scrub through today');
  const at = S.replay != null ? m.candles[S.replay] : null;
  const lab = h('span', 'lcrl', at ? ((B.et(at.time - ((B.et(at.time) || {}).off || 0)) || {}).hm || '') + ' ET' : 'Live'); lab.id = 'lcRl';
  const live = h('button', 'btn lcbtn', 'Live'); live.type = 'button'; live.id = 'lcLive'; live.hidden = S.replay == null; live.setAttribute('aria-label', 'Back to live');
  r.addEventListener('input', () => { stopPlay(); const v = +r.value; S.replay = v >= n - 1 ? null : v; redraw(); });
  play.addEventListener('click', () => { if (S.playing) { stopPlay(); renderLive(); return; } S.replay = S.replay == null || S.replay >= n - 1 ? i0 : S.replay; S.playing = setInterval(stepPlay, reduced() ? 600 : 220); redraw(); });
  live.addEventListener('click', () => { stopPlay(); S.replay = null; redraw(); });
  row.appendChild(play); row.appendChild(r); row.appendChild(lab); row.appendChild(live);
  bot.appendChild(row);
}
function stopPlay() { if (S.playing) { clearInterval(S.playing); S.playing = 0; } }
function stepPlay() { const m = S.model; if (!m) return stopPlay(); S.replay = (S.replay == null ? 0 : S.replay) + 1; if (S.replay >= m.candles.length - 1) { S.replay = null; stopPlay(); } redraw(); }
function redraw() { const m = S.model; if (!m || !S.lib || m.state === 'none') return; if (S.replay != null && m.candles[S.replay]) stripSync(m.candles[S.replay].time); try { draw(m); } catch (e) { /* the chart stays */ } try { renderLive(); } catch (e) { /* the chart stays */ } }
function sweepFlash() {
  const sw = (S.live && S.live.sweeps) || [], keys = sw.map((w) => w.label + '@' + w.time);
  if (S.sweepSeen == null) { S.sweepSeen = new Set(keys); return; }
  const fresh = sw.filter((w, i) => !S.sweepSeen.has(keys[i])); keys.forEach((k) => S.sweepSeen.add(k));
  if (!fresh.length || reduced() || !S.chart) return;
  const box = $('chartBox');
  for (const w of fresh) {
    try {
      const x = S.chart.timeScale().timeToCoordinate(w.time), y = S.series.priceToCoordinate(w.price); if (x == null || y == null) continue;
      const f = h('span', 'lcflash'); f.setAttribute('aria-hidden', 'true'); f.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`; box.appendChild(f);
      setTimeout(() => f.remove(), 2200);
    } catch (e) { /* the mark stays */ }
  }
}
function whyAt(p) {
  const m = S.model, Lv = S.live || {}; if (!p || !p.point || !m || !S.chart) return;
  const ts = S.chart.timeScale(), X = (t) => ts.timeToCoordinate(t), Y = (v) => S.series.priceToCoordinate(v), at = (t) => (B.et(t - ((B.et(t) || {}).off || 0)) || {}).hm || '';
  const cand = [];
  const near = (x, y, r, text, head) => { if (x == null || y == null) return; const d = Math.hypot(x - p.point.x, y - p.point.y); if (d <= r) cand.push({ d, text, head }); };
  for (const w of [...(m.sweeps || []), ...(Lv.sweeps || [])]) near(X(w.time), Y(w.price), 22, `${w.label || 'A level'} was swept at ${at(w.time)} ET: price ran ${w.side > 0 ? 'above' : 'below'} it to ${B.px(w.price)} and closed back ${w.side > 0 ? 'under' : 'over'} it. That grab of stops is what Zlarior waits for before it looks for a ${w.side > 0 ? 'short' : 'long'}.`, '🧹 Swept');
  for (const a of Lv.absorb || []) near(X(a.time), Y(a.price), 22, `POSEIDON (order flow) at ${a.label} (${B.px(a.price)}), ${at(a.time)} ET: the ${a.side > 0 ? 'buyers' : 'sellers'} who ran it got absorbed (${a.read}). Lane A fades that.`, '🧲 Absorbed');
  for (const x of m.markers || []) near(X(x.time), Y(x.price != null ? x.price : (m.candles.find((c) => c.time === x.time) || {}).close), 20, (x.why || x.text || 'Our trade') + ` (${at(x.time)} ET)`, x.kind === 'exit' ? '💰 Exit' : '🚀 Entry');
  for (const l of Lv.levels || []) { const y = Y(l.price); if (y != null && Math.abs(y - p.point.y) <= 10) cand.push({ d: Math.abs(y - p.point.y) + 8, head: '📏 ' + l.label, text: `${l.label} at ${B.px(l.price)}: a level ${l.src === 'of' ? 'POSEIDON, the order-flow room' : l.src === 'atlas' ? 'ATLAS' : 'Zlarior'} watches.${l.read ? ' Read: ' + l.read + '.' : ''}${l.src === 'lit' && Lv.why && Lv.why.lit ? ' Zlarior: ' + Lv.why.lit : ''}` }); }
  if (Lv.halt) { let x = X(Lv.halt.time); if (x != null && Math.abs(x - p.point.x) <= 14) cand.push({ d: 30, head: '📰 Halt', text: Lv.halt.text + ': the bots stop new trades before it and are flat at it.' }); }
  cand.sort((a, b) => a.d - b.d);
  showWhy(cand[0] || null);
}
function showWhy(c) {
  const box = $('chartBox'); if (!box) return;
  let el = $('lcWhy');
  if (!c) { if (el) el.hidden = true; return; }
  if (!el) {
    el = h('div', 'lcwhy'); el.id = 'lcWhy'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-live', 'polite'); box.appendChild(el);
  }
  clear(el); el.hidden = false;
  el.appendChild(h('b', 'lcwh', c.head)); el.appendChild(h('p', 'lcwt', c.text));
  const x = h('button', 'lcwx', '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.addEventListener('click', () => { el.hidden = true; }); el.appendChild(x);
}
let PRIVQ = false;
async function privPoll() {
  if (PRIVQ || document.hidden) return; PRIVQ = true;
  try {
    const t = await getText(PRIV_URL, 2500, 'no-store'); let j = null;
    try { j = t ? JSON.parse(t) : null; } catch (e) { j = null; }
    const P = j ? L.privBars(j) : null;
    if (!P || !P.bars.length) { S.privFails++; if (S.privFails >= 3 && S.privOn) { S.privOn = false; liveTick(); } return; }
    S.privFails = 0; S.priv = P;
    const now = Date.now() / 1000;
    if (P.price != null) { S.privSeen.push({ t: now, p: P.price }); S.privSeen = S.privSeen.filter((x) => x.t >= now - 900); }
    const was = S.privOn; S.privOn = true;
    if (!was) { render(); return; }
    liveTick();
  } finally { PRIVQ = false; }
}
/** a light update: the forming bar glides to its new close (series.update, no rebuild); a new bar or a state change redraws everything */
function liveTick() {
  if (!S.post && !S.priv) return;
  const prev = S.model, m = withPriv(B.model(S.post, S.acct, Date.now() / 1000));
  if (!S.chart || !S.lib || !prev || prev.state === 'none' || m.state === 'none' || m.n !== prev.n || S.replay != null || !m.candles.length) { if (S.replay == null) render(); else { S.model = m; liveLayer(m); } return; }
  S.model = m; liveLayer(m);
  const a = prev.candles[prev.candles.length - 1], b = m.candles[m.candles.length - 1];
  const put = (c) => { try { S.series.update(c); S.area.update({ time: c.time, value: c.close }); S.tag.setData([{ time: c.time, value: c.close }]); } catch (e) { /* the next draw */ } };
  if (reduced() || !a || a.time !== b.time || a.close === b.close) put(b);
  else {
    const t0 = performance.now(), D = 450;
    const step = (now) => { const k = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - k, 3), c = a.close + (b.close - a.close) * e;
      put({ ...b, close: c, high: Math.max(b.high, c), low: Math.min(b.low, c) }); placePulse(); if (k < 1) requestAnimationFrame(step); else { put(b); fx(); } };
    requestAnimationFrame(step);
    const d = $('chartPulse'); if (d) { d.classList.remove('tick'); void d.offsetWidth; d.classList.add('tick'); }
  }
  age(); fx(); placePulse();
}
async function aux() {
  const get = async (f) => { const t = await getText(new URL('./' + f, import.meta.url).href + '?t=' + Math.floor(Date.now() / 60000), 6000, 'no-cache'); try { return t ? JSON.parse(t) : null; } catch (e) { return null; } };
  const [b, o, f] = await Promise.all([get('brief.json'), get('of_room.json'), get('of_strip.json')]);
  if (b) S.brief = b; if (o) S.ofroom = o;
  if (f && Array.isArray(f.bars) && f.bars.length && !(S.stripData && S.stripData.live) && (!S.strat || S.strat === 'poseidon')) ofStrip(f);     // the PC sends it nightly: the last recorded day, labelled
}
/** the footprint bar at a chart time (wall-time candle) -> selected in the strip (a tap on a candle, the replay scrubber) */
const stripToday = (f) => !!f && f.day === (B.et(Date.now() / 1000) || {}).day;
function stripSync(t) {
  const f = S.stripData; if (!S.strip || !f || !stripToday(f)) return;
  const hm = new Date(t * 1000).toISOString().slice(11, 16), i = f.bars.findIndex((b) => b.t === hm);
  if (i >= 0) { try { S.strip.select(i); } catch (e) { /* the strip stays */ } }
}
function ofStrip(f) {
  let box = $('lcStrip');
  if (!box) { box = h('div', 'lcstrip'); box.id = 'lcStrip'; const b = $('lcBelow') || $('chartBox'); if (!b) return; b.parentNode.insertBefore(box, b.nextSibling); }
  S.stripData = f;
  let hd = $('lcStripH');
  if (!hd) { hd = h('p', 'lcsh'); hd.id = 'lcStripH'; box.parentNode.insertBefore(hd, box); }
  const dw = (() => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(f.day || '')); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '?'; })();
  hd.textContent = stripToday(f) ? `Footprint · today${f.live ? ' (live from your PC)' : ''}` : `Footprint · ${dw} (last recorded day; today's comes after the close)`;
  const go = () => { const O = window.OFSTRIP; if (!O) return; if (S.strip) { S.strip.update(f); return; }
    S.strip = O.mount(box, f, { height: 230, onSelect: (bar) => { const m = S.model; if (!m || !S.chart || !stripToday(S.stripData)) return;
      const c = m.candles.filter((x) => new Date(x.time * 1000).toISOString().slice(11, 16) === bar.t).pop(); if (!c) return;
      try { S.chart.setCrosshairPosition(c.close, c.time, S.series); legend(c); } catch (e) { /* the strip says it */ } } }); };
  if (window.OFSTRIP) return go();
  if (S.stripLoad) return; S.stripLoad = true;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('./ofstrip.css?v=1', import.meta.url).href; document.head.appendChild(l);
  const t = document.createElement('script'); t.type = 'module'; t.src = new URL('./ofstrip.js?v=1', import.meta.url).href; t.onload = go; t.onerror = () => { box.remove(); hd.remove(); }; document.head.appendChild(t);
}
async function fpPoll() {
  if (document.hidden) return;
  const t = await getText(FP_URL, 4000, 'no-store'); let j = null;
  try { j = t ? JSON.parse(t) : null; } catch (e) { j = null; }
  if (j && Array.isArray(j.bars) && j.bars.length && stripToday(j)) ofStrip({ ...j, live: true });
}
async function liteTick() { if (document.hidden) return; await pcPrice(); if (S.model) { liveLayer(S.model); age(); fx(); } }

/** day-livechart: the bot's own bars on the private link replace the hourly public ones (same trades / markers from the public post) */
function withPriv(m) {
  const P = S.priv; if (!P || P.bars.length < 12) return m;
  const now = Date.now() / 1000, bars = P.bars.slice(-240), fm = L.forming(bars[bars.length - 1], S.privSeen, now);
  const all = fm ? [...bars, fm] : bars, off = (t) => ((B.et(t) || {}).off || 0);
  const candles = all.map(([t, o, hh, l, c]) => ({ time: t + off(t), open: o, high: hh, low: l, close: c }));
  const n = candles.length, dataT = P.t || (all[n - 1][0] + 300);
  return { ...m, state: 'ok', candles, n, last: all[n - 1][4], dataT, forming: !!fm, rawBars: all, view: { from: Math.max(0, n - B.VIEW_BARS), to: n - 1 },
    message: '', label: `NQ 5-minute chart from your PC (live), ${n} bars, last price ${B.px(all[n - 1][4])}.`,
    markers: (m.markers || []).filter((x) => x.time <= candles[n - 1].time), chips: m.chips && m.chips.length ? m.chips : [{ k: 'all', name: 'All', n: 0, color: null }],
    list: m.list || [], lines: m.lines || [], sessions: m.sessions || [], levels: m.levels || [], sweeps: m.sweeps || [], zones: m.zones || [], extent: m.extent || null };
}
/** day-strats: in a strategy room only that strategy's levels / marks / thoughts / trade (the halt stays: it stops every bot) */
function stratLive(v) {
  const s = S.strat; if (!s || !v) return v;
  const lit = s === 'lit', atl = s === 'atlas', pos = s === 'poseidon', src = lit ? 'lit' : atl ? 'atlas' : pos ? 'of' : '-';
  const bot = lit ? 'lit' : atl ? 'atlas' : '-', name = lit ? 'Zlarior' : atl ? 'ATLAS' : '-';
  return { ...v, stage: lit ? v.stage : null, litOn: lit && v.litOn, atlasArm: atl ? v.atlasArm : null, levels: v.levels.filter((x) => x.src === src),
    sweeps: v.sweeps.filter((x) => x.src === src), absorb: pos ? v.absorb : [], ema: atl ? v.ema : [], trades: v.trades.filter((t) => t.bot === bot),
    ticker: v.ticker.filter((r) => r.bot === bot), next: v.next && v.next.bot === name ? v.next : null };
}
function liveLayer(m) {
  try {
    const bars = m.rawBars || B.unpack(S.post);
    S.live = stratLive(L.live({ lite: S.lite, priv: S.priv, brief: S.brief, ofroom: S.ofroom, bars, candles: m.candles, nowS: Date.now() / 1000 }));
  } catch (e) { S.live = null; }
  try { renderLive(); } catch (e) { /* the chart stays */ }
}
function render() {
  const m = S.model = withPriv(B.model(S.post, S.acct, Date.now() / 1000));
  liveLayer(m);
  renderChips(m); say(m); renderList(m);
  if (m.state !== 'none' && S.lib) {
    try { draw(m); $('chart').hidden = false; } catch (e) { S.err = String(e && e.message ? e.message : e); $('chartMsg').textContent = 'The chart could not be drawn on this phone. The trades are listed below.'; $('chartMsg').hidden = false; }
  } else if (S.chart) $('chart').hidden = m.state === 'none';
  S.ready = true;
}

function css() {
  if ($('chartCss')) return;
  const l = document.createElement('link'); l.id = 'chartCss'; l.rel = 'stylesheet'; l.href = new URL('./chart.css?v=3', import.meta.url).href; document.head.appendChild(l);
}
async function boot() {
  css();
  $('chartWhole').addEventListener('click', () => {
    if (!S.model || !S.chart) return;
    S.whole = !S.whole; $('chartWhole').textContent = S.whole ? 'Last 6 hours' : 'Whole day';
    if (S.whole) want(0, S.model.n - 1, 'whole'); else want(S.model.view.from, S.model.view.to, 'default');
  });
  const t3 = $('chart3dBtn');
  if (t3) { t3.hidden = false; setToggle(); t3.addEventListener('click', () => show3d(!S.view3d, true)); }
  render();                                                  // the waiting card at once
  aux().then(() => { if (S.model) liveLayer(S.model); fx(); });
  const libP = loadLib().then((LC) => { S.lib = LC && LC.createChart ? LC : null; S.libTried = true; });
  await libP;
  if (!S.fetchedAt) await refresh(true);
  render();
  if (prefGet() === '3d' && S.model && S.model.state !== 'none') {                    // the owner's last choice on this phone: after the first paint
    const go = () => show3d(true, false);
    if (typeof requestIdleCallback === 'function') requestIdleCallback(go, { timeout: 1500 }); else setTimeout(go, 300);
  }
  addEventListener('resize', () => requestAnimationFrame(() => { placePulse(); fx(); }));
  setInterval(() => { if (!document.hidden) age(); }, 30000);
  setInterval(liteTick, LITE_MS);                            // day-livechart: the bots' glance / thoughts + the PC price every 30 s
  setInterval(aux, AUX_MS);
  if (isPriv()) { privPoll(); setInterval(privPoll, PRIV_MS); if (!S.strat || S.strat === 'poseidon') { fpPoll(); setInterval(fpPoll, 60000); } }   // the private link: the bot itself every 3 s
  setInterval(() => { if (!document.hidden && S.model) { const e = $('lcStamp'), st = stampNow(); if (e) { e.textContent = st.text; e.className = 'lcstamp ' + st.cls; } } }, 5000);
  setInterval(() => { if (!document.hidden && S.model && S.model.state !== 'none') say(B.model(S.post, S.acct, Date.now() / 1000)); }, 60000);   // the age keeps counting
}
Object.assign(C, { L, liveTick, privPoll, whyAt, show3d, render, view: { render } });
boot().catch((e) => { S.err = String(e && e.message ? e.message : e); S.ready = true; S.libTried = true; S.fetchedAt = S.fetchedAt || 1; try { $('chartMsg').textContent = 'The chart could not start: ' + S.err; $('chartMsg').hidden = false; } catch (_) { /* nothing */ } });
