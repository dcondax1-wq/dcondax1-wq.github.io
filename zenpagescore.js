// Zenith pages core (2026-11-04, JOB 28 "every tab looks sick, no blank-looking pages"): ONE shared classic script, byte-identical in
// tools/web_public/ (phone) and web_next/js/next/ (PC). window.ZenithPages. Read-only UI: it never fetches, posts, arms or routes.
//   peek(el, info)    a page that has nothing to show yet (only an empty box, or a few lines on a blank sky) gets one glass card
//                     under it: what the page shows (the page's own description), a SAMPLE preview (four tiles, an equity curve
//                     with the drawdown floor / gradient bars / ghost rows / a calendar, clearly marked "Sample, not your data")
//                     and when it fills in, plus links to the pages that already have numbers. Idempotent; removed when real
//                     content arrives.
//   skeleton(el)      a page that is still loading (empty, or one "Loading" line) shows ghost cards with a slow shimmer
//   rolls(el, route)  the first time a page is opened its key figures roll up to their value (ZenithFX.count; nothing when the
//                     motion is off: reduced motion, 3D quality Off, automation)
//   kindOf(route, t)  which sample a page gets (curve | bars | list | cal)
// info: { route, title, desc, go(route) }   go = the app's own navigation (phone: location.hash, PC: LE.go)
(function () {
  'use strict';
  if (window.ZenithPages) return;
  const Z = () => window.ZenithFX || null;
  const CURVE = new Set(['perf', 'real', 'pro', 'scale', 'whatif', 'props', 'evals', 'eval', 'evalhq', 'evaltl', 'curve', 'money', 'results', 'lab', 'experiments', 'share', 'accounts', 'goals', 'realtoday', 'learning', 'atlearn', 'engine', 'backtest', 'variants', 'study', 'analytics', 'robust', 'firms', 'business', 'prop', 'cold']);
  const BARS = new Set(['edge', 'stops', 'intraday', 'learned', 'stats', 'setups', 'risk', 'atstats', 'execq', 'conf', 'regime', 'playbook', 'sensitivity', 'radar', 'levels', 'cockpit', 'tradeintel', 'intel']);
  const CAL = new Set(['weekcal', 'pnlcal', 'sesscal', 'calendar']);
  function kindOf(route, text) {
    const r = String(route || '').toLowerCase();
    if (CAL.has(r)) return 'cal';
    if (CURVE.has(r)) return 'curve';
    if (BARS.has(r)) return 'bars';
    const t = String(text || '').toLowerCase();
    if (/calendar|month by month|week by week/.test(t)) return 'cal';
    if (/equity|eval|p&l|profit|balance|money|payout|drawdown/.test(t)) return 'curve';
    if (/by (weekday|hour|size|stop|setup)|edge|stop|profit factor|win rate/.test(t)) return 'bars';
    return 'list';
  }
  const COPY = {
    curve: { sample: 'Equity curve with the drawdown floor', tiles: [['Net', '+$2,480'], ['Per month', '+$1,240'], ['Max drawdown', '−$610'], ['Profit factor', '2.4']], fills: 'The first closed trade draws the curve; every trade after that moves it.' },
    bars: { sample: 'Result by group', tiles: [['Best group', 'Mon · +$820'], ['Trades', '26'], ['Win rate', '58%'], ['Avg trade', '+$95']], fills: 'It fills after the bot has a handful of closed trades to compare.' },
    list: { sample: 'The newest first', tiles: [['Today', '1 trade'], ['This week', '+$640'], ['Win rate', '60%'], ['Average', '+$128']], fills: 'A line appears here for every finished day or trade.' },
    cal: { sample: 'Green days, red days', tiles: [['Green days', '9'], ['Red days', '4'], ['Best day', '+$740'], ['Worst day', '−$210']], fills: 'A square lights up for every trading day.' },
  };
  // per page: what it shows (used when the page has no description of its own) and what makes it fill in
  const ROUTE = {
    brief: ['The cloud monitor\'s briefing for the session: the plan, the levels and what to watch.', 'The cloud monitor writes it at 01:30 ET on the next market day.'],
    plan: ['Today\'s plan for Zlarior: the levels it watches and the sweeps it has seen.', 'The day brief is written before the session; the page fills at 01:30 ET.'],
    recaps: ['One card per finished trade: the chart, why it entered and the lesson.', 'The first card appears when the first trade closes.'],
    weekly: ['A weekly review: the week in dollars, the best and worst day and what changed.', 'It is written on Sunday, after the week\'s last trade.'],
    weekcal: ['Twelve weeks of trading days coloured by dollars.', 'A square lights up after each trading day closes.'],
    last10: ['The last ten trades side by side with their result.', 'It fills as soon as the bot has closed trades.'],
    journal: ['Search and filter every trade; add your own notes.', 'It lists a trade the moment it closes.'],
    stats: ['Key stats and streaks: win rate, average trade, best and worst run.', 'It needs a handful of closed trades.'],
    edge: ['Where the strategy makes its money: by group, by hour, by side.', 'It needs a handful of closed trades to compare.'],
    stops: ['How wide the stop is and how many micros that allows: a wide stop means less risk.', 'It fills after the bot has sized a few trades.'],
    intraday: ['Which hours and weekdays pay, from the backtest and live.', 'It fills after the first week of live trades.'],
    learned: ['What the bot learned from its closed trades, in plain words.', 'It writes a lesson after each closed trade.'],
    replays: ['Replay a day: every fill exactly where it happened.', 'A replay appears for each day the bot traded.'],
    results: ['The live strategy replayed on five years of NQ futures.', 'It comes with the next backtest run.'],
    perf: ['Is live inside the expected range, live against backtest, exit quality, months.', 'The next cloud run adds it.'],
    scale: ['The scaling plan: when to add a second account and how big.', 'It fills after the first eval day.'],
    fleet: ['Your other accounts in one place: prop firms, sim and live.', 'Add an account once and it appears here.'],
    pro: ['The Zenith score, expectancy in dollars, the eval pace and the playbook.', 'It is built from the LIT replay.'],
    aiwatch: ['Anomalies, drift against the backtest, losses worth a look.', 'It starts watching with the first live trade.'],
    learning: ['What the bot learned from real trades: costs, reviews, suggestions.', 'It learns from real fills, so it fills after the first one.'],
    atlearn: ['What ATLAS learned from real trades: costs, reviews, suggestions.', 'It learns from ATLAS fills.'],
    atstats: ['ATLAS statistics: win rate, profit factor and the best setups.', 'It needs a handful of ATLAS trades.'],
    evaltl: ['The eval session by session: the P&L and the drawdown floor.', 'It starts with the first eval session.'],
    accounts: ['Every account, its balance, the drawdown floor and the profit target.', 'It fills when an account is added.'],
    activity: ['Every fill and every outcome the bot made, newest first.', 'A line appears for every order.'],
    execq: ['Execution quality: live fills against the backtest, slippage and costs.', 'It needs real fills to compare.'],
    levels: ['The liquidity levels the bot watches, taken or not.', 'The levels are drawn each morning.'],
    setups: ['The setups the bot saw and why it rejected them.', 'A line appears for every setup it skips.'],
    writeups: ['Every finding of the research, written up in plain words.', 'A write-up is added with every study.'],
    losses: ['Why the bot loses and how much: each loss dissected.', 'It fills after the first losing trade.'],
    experiments: ['Every backtest stored with its data, judged on 2026 and 2021-25.', 'It fills with each experiment run.'],
    lab: ['The research lab: every backtest and what it showed.', 'It fills with each run.'],
    share: ['A share card of your month, ready to post.', 'It fills when the month has a trading day.'],
    curve: ['The eval curve against the drawdown floor and the target.', 'It starts with the first eval day.'],
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // a fixed, pleasant sample curve (no data, no randomness: it is the same on every visit)
  const PTS = [0, 6, 4, 11, 9, 16, 22, 18, 14, 21, 29, 26, 34, 31, 40, 47, 43, 52, 58, 55, 63, 70, 66, 74, 82];
  function curveSVG() {
    const W = 300, H = 120, mx = Math.max.apply(null, PTS), n = PTS.length - 1, fl = 100;
    const xy = PTS.map((v, i) => [(i / n) * W, 104 - (v / mx) * 88]);
    const d = xy.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const last = xy[xy.length - 1];
    return `<svg class="zp-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="zpA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".42"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient>
      <linearGradient id="zpL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="var(--accent)"/><stop offset="1" stop-color="var(--good, #3dffb0)"/></linearGradient></defs>
      <path d="${d} L${W} ${H} L0 ${H} Z" fill="url(#zpA)"/>
      <line x1="0" x2="${W}" y1="${fl}" y2="${fl}" class="zp-floor"/>
      <path d="${d}" class="zp-line" pathLength="1" stroke="url(#zpL)"/>
      </svg><i class="zp-dot" style="top:${(last[1] / H * 100).toFixed(1)}%"></i><span class="zp-fl">Drawdown floor</span>`;
  }
  const barsHTML = () => '<div class="zp-bars" aria-hidden="true">' + [34, 58, 42, 80, 66, 92, 50, 72].map((h, i) => `<i style="--h:${h}%;--d:${i * 60}ms"></i>`).join('') + '</div>';
  const listHTML = () => '<div class="zp-rows" aria-hidden="true">' + [[70, 40], [58, 30], [76, 36], [48, 28]].map((w, i) => `<div style="--d:${i * 90}ms"><s></s><span><i style="width:${w[0]}%"></i><i style="width:${w[1]}%"></i></span><em></em></div>`).join('') + '</div>';
  const CELLS = ['', 'g2', 'g1', 'r1', 'g1', 'g3', '', 'g1', '', 'g2', 'r2', 'g1', 'g1', '', 'g3', 'g1', 'r1', '', 'g2', 'g1', 'g2', '', 'g1', 'g1', 'r1', 'g2', 'g3', ''];
  const calHTML = () => '<div class="zp-cal" aria-hidden="true">' + CELLS.map((c, i) => `<i class="${c}" style="--d:${i * 18}ms"></i>`).join('') + '</div>';
  function sampleHTML(kind) {
    const c = COPY[kind] || COPY.list;
    const body = kind === 'curve' ? '<div class="zp-chart">' + curveSVG() + '</div>' : kind === 'bars' ? barsHTML() : kind === 'cal' ? calHTML() : listHTML();
    return `<div class="zp-tiles" aria-hidden="true">${c.tiles.map((t) => `<span><em>${esc(t[0])}</em><b>${esc(t[1])}</b></span>`).join('')}</div>
      <div class="zp-vis" aria-hidden="true"><div class="zp-cap"><span>${esc(c.sample)}</span><u>Sample · not your data</u></div>${body}</div>`;
  }
  const LINKS = [['today', 'Home'], ['lit', 'Zlarior today'], ['money', 'Money now']];
  // ------------------------------------------------------------------ thin page?
  const EMPTY = '.empty, .su-empty, .pr-empty, .bl-empty, .sc-empty, .rc-empty, .mn-empty, .cl-empty, .muted-empty';
  const OWN = '.zp-peek, .zp-skel';
  const CARDISH = '.card, .stat, .stats, .panel, .kpi, .kpis, .tile, .row, .grid, .zl-body, .empty, .hero';
  function metrics(el) {
    let top = Infinity, bot = 0, cards = 0, full = 0, text = 0;
    const r0 = el.getBoundingClientRect();
    let root = el;                                                    // a page wrapped in one plain div: look inside it
    for (let i = 0; i < 3; i++) {
      const k = [...root.children].filter((c) => !c.matches(OWN));
      if (k.length === 1 && k[0].tagName === 'DIV' && !k[0].matches(CARDISH)) root = k[0]; else break;
    }
    for (const c of root.children) {
      if (c.matches(OWN) || c.nodeType !== 1) continue;
      const r = c.getBoundingClientRect(); if (!r.height) continue;
      top = Math.min(top, r.top); bot = Math.max(bot, r.bottom);
      if (c.matches(CARDISH + ', table, canvas, svg') && !c.matches('.hero')) {
        cards++;
        if (!c.querySelector(EMPTY) && !c.matches(EMPTY) && (c.innerText || '').trim().length > 40) full++;
      }
      text += (c.innerText || '').trim().length;
    }
    return { h: bot > top ? bot - top : 0, top: r0.top, cards, full, text };
  }
  function thin(el) {
    const m = metrics(el);
    const vh = window.innerHeight || 800;
    if (m.text > 700 && !el.querySelector(EMPTY)) return false;      // a lot of text and no empty box: it is a real page
    if (m.full >= 3) return false;                                   // real content: three cards that hold something
    if (m.h > vh * 0.72 && m.full >= 2) return false;
    return m.h < vh * 0.62 || m.full === 0;
  }
  function peek(el, info) {
    if (!el) return false;
    info = info || {};
    let box = el.querySelector(':scope > .zp-peek');
    const sk = el.querySelector(':scope > .zp-skel'); if (sk) sk.remove();
    if (!thin(el)) { if (box) box.remove(); return false; }
    if (box && box.dataset.route === info.route) return true;
    if (box) box.remove();
    const kind = kindOf(info.route, (info.title || '') + ' ' + (info.desc || ''));
    const c = COPY[kind] || COPY.list;
    box = document.createElement('section');
    box.className = 'zp-peek';
    box.dataset.route = info.route || '';
    box.dataset.kind = kind;
    const links = LINKS.filter((l) => l[0] !== info.route).map((l) => `<button type="button" class="zp-go" data-zp-go="${l[0]}">${esc(l[1])}</button>`).join('');
    const R = ROUTE[info.route] || [];
    const what = esc(info.desc || R[0] || 'This page fills itself in while the bot trades.');
    box.innerHTML = `<div class="zp-h"><span class="zp-ic" aria-hidden="true"></span><div><h3>${esc(info.title || 'This page')} · what you will see here</h3><p>${what}</p></div></div>
      ${sampleHTML(kind)}
      <p class="zp-fills"><b>When it fills in:</b> ${esc(R[1] || c.fills)} Nothing to do, the bot does it by itself.</p>
      <div class="zp-links"><span>Pages with numbers right now</span>${links}</div>`;
    box.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-zp-go]'); if (!b) return;
      try { if (typeof info.go === 'function') info.go(b.dataset.zpGo); } catch (err) { /* navigation is the app's */ }
    });
    el.appendChild(box);
    return true;
  }
  // real content arrived under a sample card: the sample goes at once
  function prune(el) { const b = el && el.querySelector(':scope > .zp-peek'); if (b && !thin(el)) { b.remove(); return true; } return false; }
  // ------------------------------------------------------------------ loading: ghost cards
  function skeleton(el) {
    if (!el) return false;
    const real = [...el.children].filter((c) => !c.matches(OWN));
    const txt = real.map((c) => (c.innerText || '').trim()).join(' ').trim();
    const loading = !real.length || (txt.length < 40 && /^(loading|…|\.\.\.|one moment)/i.test(txt)) || (txt.length < 200 && /(^|\s)(loading|one moment)[\s….]*(\s|$)/i.test(txt));
    let sk = el.querySelector(':scope > .zp-skel');
    if (!loading) { if (sk) sk.remove(); return false; }
    if (sk) return true;
    sk = document.createElement('div'); sk.className = 'zp-skel'; sk.setAttribute('aria-hidden', 'true');
    sk.innerHTML = '<div class="zp-sk-h"><i></i><i></i></div><div class="zp-sk-t"><i></i><i></i><i></i><i></i></div><div class="zp-sk-c"><i></i></div><div class="zp-sk-c short"><i></i></div>';
    el.appendChild(sk);
    return true;
  }
  // ------------------------------------------------------------------ key figures roll up the first time a page opens
  const SEEN = new Set();
  const KEY = '.stat > b, .zm-t > b, .su-big b, .kpi b, .zh-big b, .pr-big b, .rc-big b, .bl-big b, .big-num, .stat .v';
  function rolls(el, route) {
    const z = Z(); if (!el || !z || z.still()) return 0;
    const k = String(route || ''); if (SEEN.has(k)) return 0;
    const list = [...el.querySelectorAll(KEY)].filter((e) => !e.classList.contains('zn-ticking') && z.parse(e.textContent));
    if (!list.length) return 0;
    SEEN.add(k);
    list.slice(0, 8).forEach((e) => { const p = z.parse(e.textContent); z.count(e, p.v * 0, 750); });
    return Math.min(8, list.length);
  }
  window.ZenithPages = { version: 1, kindOf, peek, prune, skeleton, rolls, thin, sampleHTML };
})();
