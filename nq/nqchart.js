// NQ live chart (ES module, the page side; owner 2026-11-18: "Live chart + our trades: NQ chart with every entry, stop and target drawn on it").
// The latest NQ 5-minute bars from the PC's NinjaTrader with our trades: an arrow at each entry (in the account's colour), the open trades'
// entry / stop / target lines, each closed trade's exit with its $; the account filter (All / Zlarior 50K / Zlarior 25K #2 / ATLAS funded);
// "As of <time> ET, from the PC"; a plain sentence when the PC has not sent bars (never fake data). The feed: tools/pc_report.py's
// "le-bars" post on the public chart topic (nqbars.js feedUrls, read like pc_feed.js: ntfy /json?poll=1), polled every 2 minutes while
// the page is open. The chart: TradingView Lightweight Charts 5.2.1 (Apache-2.0), vendored in vendor/ (no CDN: it works offline),
// loaded after the page. Its own module and card: a failure here never touches the rest of the NQ page. Text only through textContent.
// Read only: it sends nothing, stores nothing, places nothing. window.NQCHART is the test hook. ?acct=z50k opens on one account.
import * as B from './nqbars.js?v=b1';

const LIB = 'vendor/lightweight-charts.standalone.production.js?v=5.2.1';
const POLL_MS = 120000, TIMEOUT_MS = 7000;
const $ = (id) => document.getElementById(id);
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el && el.firstChild) el.removeChild(el.firstChild); };
const S = { feed: undefined, post: null, why: '', acct: 'all', model: null, lib: null, libTried: false, chart: null, series: null, marks: null, lines: [],
  whole: false, want: null, mode: 'default', viewKey: '', drawnN: 0, ready: false, fetchedAt: 0, busy: false, err: '' };

// ------------------------------------------------------------------------------------------------ the AGORA colours (canvas needs real colours)
function tokens() {
  const cs = getComputedStyle(document.documentElement), v = (n, d) => (cs.getPropertyValue(n) || '').trim() || d;
  return { text: v('--ag-text', '#f3ece0'), soft: v('--ag-soft', '#cfc4b2'), muted: v('--ag-muted', '#9a8f7d'), line: v('--ag-line', '#3a3228'),
    up: v('--ag-olive-text', '#a0ac6e'), down: v('--ag-terra-text', '#e08a6b'), good: v('--ag-olive-text', '#a0ac6e'), bad: v('--ag-terra-text', '#e08a6b'),
    gold: v('--ag-gold-hi', '#dcbd6e'), aegean: v('--ag-aegean-text', '#7fa7c2'), mauve: '#c9a3c4', sand: '#d8c39a', olive: v('--ag-olive', '#7f8a52'), rose: '#d9a3a3',
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
}

// ------------------------------------------------------------------------------------------------ the chart
function makeChart(LC, T) {
  const el = $('chart');
  const chart = LC.createChart(el, {
    autoSize: true,
    layout: { background: { type: LC.ColorType.Solid, color: 'rgba(0,0,0,0)' }, textColor: T.muted, fontFamily: T.font, fontSize: 11, attributionLogo: false },
    grid: { vertLines: { color: 'rgba(243,236,224,0.05)' }, horzLines: { color: 'rgba(243,236,224,0.07)' } },
    rightPriceScale: { borderColor: T.line, scaleMargins: { top: 0.08, bottom: 0.08 } },
    timeScale: { borderColor: T.line, timeVisible: true, secondsVisible: false, rightOffset: 3, barSpacing: 5, minBarSpacing: 0.8 },     // 0.8: the whole day fits a phone
    crosshair: { mode: LC.CrosshairMode.Normal, vertLine: { color: T.muted, labelBackgroundColor: '#2c251c' }, horzLine: { color: T.muted, labelBackgroundColor: '#2c251c' } },
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    localization: { locale: 'en-US', priceFormatter: (p) => { const r = Math.round(p * 100) / 100; return Number.isInteger(r) ? r.toLocaleString('en-US') : B.px(r); } },
  });
  const series = chart.addSeries(LC.CandlestickSeries, {
    upColor: T.up, downColor: T.down, borderUpColor: T.up, borderDownColor: T.down, wickUpColor: T.up, wickDownColor: T.down,
    priceFormat: { type: 'price', precision: 2, minMove: 0.25 }, lastValueVisible: true, priceLineVisible: true, priceLineColor: T.muted, priceLineStyle: LC.LineStyle.Dotted,
    // the open trade's stop and target stay on the screen even when the candles have not reached them (the price scale takes them in)
    autoscaleInfoProvider: (orig) => {
      const r = orig(), x = S.model && S.model.extent;
      if (!r || !r.priceRange || !x) return r;
      return { priceRange: { minValue: Math.min(r.priceRange.minValue, x.min), maxValue: Math.max(r.priceRange.maxValue, x.max) }, margins: r.margins };
    },
  });
  const marks = LC.createSeriesMarkers(series, []);
  // the view is set before the price axis has measured its labels: when the plot gets narrower (or the phone turns), set it again,
  // unless the owner moved the chart himself (a drag, a pinch, the wheel: from then on his view is kept)
  chart.timeScale().subscribeSizeChange(() => { if (S.want && S.mode !== 'user') setView(S.want[0], S.want[1]); });
  const mine = () => { S.mode = 'user'; };
  for (const ev of ['pointerdown', 'touchstart', 'wheel']) el.addEventListener(ev, mine, { passive: true });
  return { chart, series, marks };
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

async function refresh(force) {
  if (S.busy || (!force && (document.hidden || Date.now() - S.fetchedAt < POLL_MS / 2))) return;
  S.busy = true;
  try {
    const r = await fetchPost();
    S.fetchedAt = Date.now();
    if (r.post || !S.post) { S.post = r.post; S.why = r.why; }       // a failed poll keeps the last good bars on the screen
    render();
    try { window.dispatchEvent(new Event('nq-bars')); } catch (e) { /* the desk cards redraw on their own minute */ }
  } finally { S.busy = false; }
}

async function boot() {
  const q = new URLSearchParams(location.search), a = q.get('acct');
  if (a && /^[a-z0-9_]{1,24}$/.test(a)) S.acct = a;
  $('chartWhole').addEventListener('click', () => {
    if (!S.model || !S.chart) return;
    S.whole = !S.whole; $('chartWhole').textContent = S.whole ? 'Last 6 hours' : 'Whole day';
    if (S.whole) want(0, S.model.n - 1, 'whole'); else want(S.model.view.from, S.model.view.to, 'default');
  });
  render();                                                  // the waiting card at once
  const libP = loadLib().then((LC) => { S.lib = LC && LC.createChart ? LC : null; S.libTried = true; });
  await Promise.all([libP, refresh(true)]);
  render();
  setInterval(() => refresh(false), POLL_MS);
  setInterval(() => { if (!document.hidden && S.model && S.model.state !== 'none') say(B.model(S.post, S.acct, Date.now() / 1000)); }, 60000);   // the age keeps counting
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(false); });
  window.addEventListener('nq-refresh', () => refresh(true));
}
window.NQCHART = { S, B, ready: () => S.ready && S.libTried && S.fetchedAt > 0, refresh: () => refresh(true), render, setAcct: (k) => { S.acct = k; S.mode = 'default'; render(); } };
boot().catch((e) => { S.err = String(e && e.message ? e.message : e); S.ready = true; S.libTried = true; S.fetchedAt = S.fetchedAt || 1; try { $('chartMsg').textContent = 'The chart could not start: ' + S.err; $('chartMsg').hidden = false; } catch (_) { /* nothing */ } });
