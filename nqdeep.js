// NQ DEEP (night-nqdash2 2026-11-20, owner: "NQ dashboard - I want everything ... in a clean manner that looks good ... quality checks").
// One shared kit for the deeper views on the NQ pages (trading/, nq/, business/mffu.html): the pure numbers (NQ_DEEP.core, node-tested
// by tests/test_nqdeep.py) and one chart style (NQ_DEEP.draw: inline SVG through createElementNS, text only through textContent,
// colours only from the --ag-* tokens via nqdeep.css, so light and dark both read). Read only: it never trades, arms or fetches.
// Rows are the Trading page's merged rows (trading/tradingcore.js merge): {src live|paper|backtest, bot LIT|ATLAS, ak, day, hm, t, xt,
// side, e, s, tg, x, r, usd, risk, q, k}. Every view gets a source tag (LIVE / PAPER / BACKTEST) and the date of its newest trade.
//   core.dist(rows, 'r'|'usd')     histogram buckets            core.underwater(rows)   running $ + drawdown from the peak per trade day
//   core.streaks(rows)             current / longest win+loss, the last 30 as W/L/B     core.extremes(rows, n)   best and worst n trades
//   core.heat(rows)                win % by hour (ET) x weekday, with n per cell       core.twinR(rows, bot, ak)   LIVE R vs BACKTEST R, same days
//   core.timeline(r)               the levels box of one trade (entry, stop, target, exit; start and end)   core.fillLine(learned, bot)
//   core.payout(key, plan, market, nowDay)  the first payout's date range (payday plan p10 / median / p90)   core.planId(name)
//   core.weekNews(news, nowDay)    the week's high-impact US events                    core.tag(rows) / core.ageWords(sec)
(function (root) {
  'use strict';
  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const arr = (x) => (Array.isArray(x) ? x : []);
  const num = (v) => { const x = typeof v === 'string' ? parseFloat(v.replace(/[$,\s]/g, '')) : v; return typeof x === 'number' && Number.isFinite(x) ? x : null; };
  const r2 = (v) => Math.round(v * 100) / 100;
  const str = (v, n) => String(v == null ? '' : v).replace(/[<>]/g, '').slice(0, n || 120);
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const SRC = { live: 'LIVE', paper: 'PAPER', backtest: 'BACKTEST' };
  const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
  const wdOf = (day) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || '')); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay() : -1; };
  const dayNum = (d) => (isDay(d) ? Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000 : null);
  const between = (a, b) => (dayNum(b) - dayNum(a));
  const shortDay = (d) => (isDay(d) ? `${WD[wdOf(d)]} ${+d.slice(8, 10)} ${MON[+d.slice(5, 7) - 1]}` : '');
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const money = (x) => { const v = num(x); if (v == null) return '$0'; const a = Math.abs(Math.round(v)); return (v < 0 && a ? '-' : '') + '$' + a.toLocaleString('en-US'); };
  const moneyS = (x) => { const v = num(x); const m = money(v); return v != null && Math.round(v) > 0 ? '+' + m : m; };
  const rTxt = (x) => { const v = num(x); if (v == null) return ''; const k = Math.round(v * 10) / 10; return (k > 0 ? '+' : k < 0 ? '-' : '') + Math.abs(k).toFixed(1) + 'R'; };
  const WIN = 0.5;   // $: a trade above +$0.50 is a win, below -$0.50 a loss, in between break-even (= tradingcore's 0.5)
  const res = (r) => (r.usd > WIN ? 'W' : r.usd < -WIN ? 'L' : 'B');
  const good = (rows) => arr(rows).filter((r) => isObj(r) && isDay(r.day) && num(r.usd) != null && !/blitz/i.test(`${r.bot || ''} ${r.acct || ''} ${r.ak || ''}`));

  function ageWords(sec) {
    const s = Math.max(0, Math.floor(num(sec) || 0));
    if (s < 3600) return s < 60 ? 'just now' : `${plural(Math.floor(s / 60), 'minute')} ago`;
    if (s < 86400) return `${plural(Math.floor(s / 3600), 'hour')} ago`;
    return `${plural(Math.floor(s / 86400), 'day')} ago`;
  }
  /** the source label of a set of rows + the newest trade day: {src: 'LIVE' | 'PAPER' | 'BACKTEST' | 'MIXED' | '', last, text} */
  function tag(rows, nowS) {
    const R = good(rows); if (!R.length) return { src: '', last: '', text: 'No trades' };
    const S = Array.from(new Set(R.map((r) => SRC[r.src] || 'BACKTEST')));
    const last = R.reduce((a, r) => (r.day > a ? r.day : a), '');
    const lastT = R.reduce((a, r) => Math.max(a, num(r.xt) || num(r.t) || 0), 0);
    const age = nowS && lastT ? ` (${ageWords(nowS - lastT)})` : '';
    const src = S.length === 1 ? S[0] : 'MIXED';
    return { src, last, text: `${src} · ${plural(R.length, 'trade')} · newest ${shortDay(last)}${age}` };
  }

  // ---------------------------------------------------------------------------------------------- distributions
  /** histogram of R ('r', 0.5R buckets, -2 .. +8 clamped) or $ ('usd', a round width giving ~8-12 buckets). */
  function dist(rows, key) {
    const R = good(rows).filter((r) => num(r[key]) != null); const v = R.map((r) => num(r[key]));
    if (!v.length) return { key, buckets: [], n: 0, mean: null, median: null };
    let w, lo, hi;
    if (key === 'r') { w = 0.5; lo = -2.25; hi = 8.25; }   // centred on every half R: a -1.02R stop sits in the -1R bar
    else {
      const a = Math.min(...v), b = Math.max(...v), span = Math.max(1, b - a);
      const steps = [25, 50, 100, 200, 250, 500, 1000, 2000, 5000]; w = steps.find((s) => span / s <= 12) || 10000;
      lo = Math.floor(a / w) * w; hi = Math.ceil(b / w) * w; if (hi === lo) hi = lo + w;
    }
    const n = Math.max(1, Math.round((hi - lo) / w)), B = [];
    for (let i = 0; i < n; i++) B.push({ lo: r2(lo + i * w), hi: r2(lo + (i + 1) * w), n: 0, wins: 0 });
    for (const x of v) { let i = Math.floor((Math.min(Math.max(x, lo), hi - 1e-9) - lo) / w); i = Math.max(0, Math.min(n - 1, i)); B[i].n += 1; if (x > 0) B[i].wins += 1; }
    const s = v.slice().sort((a, b) => a - b), med = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
    const fmt = key === 'r' ? (x) => `${x}R` : money;
    for (const b of B) { if (key === 'r') b.mid = r2((b.lo + b.hi) / 2); b.label = key === 'r' ? `about ${rTxt(b.mid)}` : `${fmt(b.lo)} to ${fmt(b.hi)}`; }
    return { key, w, buckets: B, n: v.length, mean: r2(v.reduce((a, b) => a + b, 0) / v.length), median: r2(med), clampLo: key === 'r' && v.some((x) => x < lo), clampHi: key === 'r' && v.some((x) => x > hi) };
  }

  // ---------------------------------------------------------------------------------------------- equity and drawdown
  /** per trade day: {pts: [{day, usd, cum, peak, dd}], net, maxDD, maxDDDay, recoveredDay, days} (dd <= 0) */
  function underwater(rows) {
    const D = {}; for (const r of good(rows)) D[r.day] = (D[r.day] || 0) + r.usd;
    const days = Object.keys(D).sort(); let cum = 0, peak = 0, maxDD = 0, maxDDDay = '', rec = '';
    const pts = days.map((d) => { cum += D[d]; if (cum > peak) { peak = cum; if (maxDD < 0 && !rec) rec = d; } const dd = cum - peak; if (dd < maxDD) { maxDD = dd; maxDDDay = d; rec = ''; } return { day: d, usd: r2(D[d]), cum: r2(cum), peak: r2(peak), dd: r2(dd) }; });
    return { pts, net: r2(cum), maxDD: r2(maxDD), maxDDDay, recoveredDay: maxDD < 0 ? rec : '', days: days.length, nowDD: pts.length ? pts[pts.length - 1].dd : 0 };
  }
  /** LIVE vs its BACKTEST twin in R (sizes differ: the eval sizes each trade to the room left, so R is the fair yardstick), on the days both traded */
  function twinR(rows, bot, ak) {
    const R = good(rows).filter((r) => r.bot === bot && num(r.r) != null);
    const live = R.filter((r) => r.src === 'live' && (!ak || ak === 'all' || r.ak === ak));
    if (!live.length) return { live: [], back: [], from: '', to: '', n: 0, gap: null };
    const from = live.reduce((a, r) => (!a || r.day < a ? r.day : a), ''), to = live.reduce((a, r) => (r.day > a ? r.day : a), '');
    const back = R.filter((r) => r.src === 'backtest' && r.day >= from && r.day <= to);
    const curve = (L) => { const D = {}; for (const r of L) D[r.day] = (D[r.day] || 0) + r.r; let c = 0; return Object.keys(D).sort().map((d) => { c += D[d]; return { day: d, cum: r2(c) }; }); };
    const lc = curve(live), bc = curve(back), lE = lc.length ? lc[lc.length - 1].cum : 0, bE = bc.length ? bc[bc.length - 1].cum : 0;
    const backTo = R.filter((r) => r.src === 'backtest').reduce((a, r) => (r.day > a ? r.day : a), '');
    return { live: lc, back: bc, from, to, n: live.length, nBack: back.length, liveR: r2(lE), backR: r2(bE), gap: back.length ? r2(lE - bE) : null, backEnds: backTo && backTo < to ? backTo : '' };
  }

  // ---------------------------------------------------------------------------------------------- streaks, best / worst
  function streaks(rows) {
    const R = good(rows).slice().sort((a, b) => (num(a.t) || 0) - (num(b.t) || 0)); const seq = R.map(res);
    let curK = '', cur = 0, bestW = 0, bestL = 0, run = 0, runK = '';
    for (const s of seq) { if (s === 'B') continue; if (s === runK) run += 1; else { runK = s; run = 1; } if (s === 'W' && run > bestW) bestW = run; if (s === 'L' && run > bestL) bestL = run; }
    for (let i = seq.length - 1; i >= 0; i--) { if (seq[i] === 'B') continue; if (!curK) curK = seq[i]; if (seq[i] !== curK) break; cur += 1; }
    const last = R.slice(-30).map((r) => ({ k: res(r), day: r.day, usd: r2(r.usd), r: num(r.r) }));
    const w = seq.filter((s) => s === 'W').length, l = seq.filter((s) => s === 'L').length;
    return { cur, curK, bestW, bestL, last, wins: w, losses: l, be: seq.length - w - l, n: seq.length,
      text: !seq.length ? 'No trades yet' : cur ? `Now ${plural(cur, curK === 'W' ? 'win' : 'loss').replace('losss', 'losses')} in a row` : 'No streak (break-even last)' };
  }
  function extremes(rows, n) {
    const R = good(rows).slice().sort((a, b) => b.usd - a.usd), k = Math.max(1, n || 5);
    const view = (r) => ({ day: r.day, hm: str(r.hm, 5), bot: r.bot, src: SRC[r.src] || 'BACKTEST', side: str(r.side, 5), usd: r2(r.usd), r: num(r.r), k: str(r.k, 12), label: `${shortDay(r.day)} ${str(r.hm, 5)}` });
    return { best: R.slice(0, k).filter((r) => r.usd > 0).map(view), worst: R.slice(-k).reverse().filter((r) => r.usd < 0).map(view) };
  }

  // ---------------------------------------------------------------------------------------------- hour x weekday
  /** win % per hour (ET, from hm) x weekday (Mon-Fri); cells with n trades, wins, usd. rows: hours that had a trade. */
  function heat(rows) {
    const C = {}, H = new Set();
    for (const r of good(rows)) {
      const h = parseInt(String(r.hm || '').slice(0, 2), 10), w = wdOf(r.day); if (!(h >= 0 && h < 24) || w < 1 || w > 5) continue;
      H.add(h); const k = `${h}|${w}`, c = C[k] || (C[k] = { h, w, n: 0, wins: 0, usd: 0 }); c.n += 1; c.usd += r.usd; if (r.usd > WIN) c.wins += 1;
    }
    const hours = Array.from(H).sort((a, b) => a - b);
    const grid = hours.map((h) => ({ h, label: `${String(h).padStart(2, '0')}:00`, cells: [1, 2, 3, 4, 5].map((w) => { const c = C[`${h}|${w}`]; return c ? { ...c, usd: r2(c.usd), pct: Math.round((100 * c.wins) / c.n) } : { h, w, n: 0, wins: 0, usd: 0, pct: null }; }) }));
    const flat = grid.flatMap((g) => g.cells).filter((c) => c.n >= 3);
    const best = flat.slice().sort((a, b) => b.usd - a.usd)[0] || null, worst = flat.slice().sort((a, b) => a.usd - b.usd)[0] || null;
    return { grid, days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], best: best && best.usd > 0 ? best : null, worst: worst && worst.usd < 0 ? worst : null };
  }

  // ---------------------------------------------------------------------------------------------- one trade's levels
  /** the levels box of one trade (no price path: the site has the levels, not the bars of every trade) */
  function timeline(r) {
    if (!isObj(r)) return null;
    const e = num(r.e), s = num(r.s), tg = num(r.tg), x = num(r.x), t = num(r.t), xt = num(r.xt) || (t != null ? t + 60 : null);
    if (e == null || s == null || t == null) return null;
    const vals = [e, s].concat(tg != null ? [tg] : [], x != null ? [x] : []);
    const lo = Math.min(...vals), hi = Math.max(...vals), long = /long|buy/i.test(String(r.side || '')) || (s < e);
    const mins = Math.max(1, Math.round(((xt || t) - t) / 60));
    return { e, s, tg, x, t, xt, lo, hi, long, mins, usd: num(r.usd), r: num(r.r), k: str(r.k, 12), day: r.day, hm: str(r.hm, 5), bot: r.bot, src: SRC[r.src] || 'BACKTEST',
      text: `${long ? 'LONG' : 'SHORT'} ${r.bot === 'ATLAS' ? 'ATLAS' : 'Zlarior'} ${shortDay(r.day)} ${str(r.hm, 5)} ET: in ${e.toFixed(2)}, stop ${s.toFixed(2)}${tg != null ? ', target ' + tg.toFixed(2) : ''}${x != null ? ', out ' + x.toFixed(2) : ''} after ${plural(mins, 'minute')} (${moneyS(r.usd)}${num(r.r) != null ? ', ' + rTxt(r.r) : ''})` };
  }

  // ---------------------------------------------------------------------------------------------- real fill cost (learned.json)
  /** learned.json bots[] (tools/fill_cost.py): the bot's "Real fills so far" line, or '' (never a made-up number) */
  function fillLine(learned, bot) {
    const B = arr(isObj(learned) ? learned.bots : null);
    const want = String(bot || '').toLowerCase(), rx = want === 'lit' ? /\blit\b|zlarior/ : want === 'atlas' ? /atlas/ : null;
    const b = rx ? B.find((x) => isObj(x) && rx.test(`${x.key || ''} ${x.bot || ''} ${x.name || ''}`.toLowerCase())) : null;
    const f = b && isObj(b.fills) ? b.fills : null;
    if (!f) return { line: '', n: 0 };
    return { line: str(f.line, 200), n: num(f.n) || 0, med: num(f.entry_slip_med), worst: num(f.worst) };
  }

  // ---------------------------------------------------------------------------------------------- payout progress (payday plan)
  const PLAN_KEY = { z50k: 'Z50', z25k2: 'N25', atlas25f: 'A25', rapid25: 'R25' };
  /** an account's display name -> the payday plan id (Z50 / N25 / A25 / R25), or '' */
  function planId(name) {
    const n = String(name || '').toLowerCase();
    if (/blitz/.test(n)) return '';
    if (/rapid/.test(n)) return 'R25';
    if (/atlas/.test(n)) return 'A25';
    if (/zlarior|lit/.test(n)) return /#\s*2|25k/.test(n) ? 'N25' : 'Z50';
    return '';
  }
  /** an account card ({key, plan / rules, balance, start, stage}) + the payday plan rows of one market -> progress + date range */
  function payout(key, plan, market, nowDay) {
    const P = isObj(plan) ? plan : {}, M = market || 'H2', id = PLAN_KEY[key] || planId(key) || key;
    const a = isObj(P.rows) && isObj(P.rows[M]) && isObj(P.rows[M].accounts) ? P.rows[M].accounts[id] : null;
    if (!isObj(a)) return null;
    const d = (k) => (isDay(a[k]) ? a[k] : '');
    const lo = d('first_pay_p10'), med = d('first_pay_med'), hi = d('first_pay_p90') || d('first_pay_p75');
    const today = isDay(nowDay) ? nowDay : (isDay(P.date) ? P.date : '');
    const span = lo && hi && today ? Math.max(1, between(today, hi)) : null;
    const pos = (x) => (span && x ? Math.max(0, Math.min(1, between(today, x) / span)) : null);
    return { key, id, name: str(a.name, 60), market: str(obj(P.markets)[M] || M, 40), built: str(P.date, 10), lo, med, hi, hiOpen: !d('first_pay_p90'),
      usd: num(a.first_pay_usd), usdLo: num(a.first_pay_usd_p10), pDec31: num(a.p_by_dec31), pJan31: num(a.p_by_jan31), lostFirst: num(a.p_lost_before_pay),
      funded: d('funded_med'), daysToMed: med && today ? between(today, med) : null, posLo: pos(lo), posMed: pos(med),
      text: med ? `First payout most likely ${shortDay(med)} (between ${shortDay(lo) || 'soon'} and ${hi ? shortDay(hi) : 'later'})${num(a.first_pay_usd) != null ? ', about ' + money(a.first_pay_usd) : ''}` : 'No payout date in the plan yet' };
  }
  const obj = (x) => (isObj(x) ? x : {});

  // ---------------------------------------------------------------------------------------------- the news week (data.json news)
  /** data.json news (tools/news_hub.hub_for_dashboard) -> this week's high-impact US events, Mon-Fri, {day, hm, title, impact, past} */
  function weekNews(news, nowDay, nowHm) {
    const N = obj(news), E = arr(N.events || N.week || N.items || N.upcoming);
    if (!isDay(nowDay)) return { days: [], n: 0 };
    const w = wdOf(nowDay), mon = addDays(nowDay, w === 0 ? 1 : w === 6 ? 2 : 1 - w), fri = addDays(mon, 4);
    const rows = [];
    for (const e of E) {
      if (!isObj(e)) continue;
      const day = isDay(e.day) ? e.day : isDay(String(e.date || '').slice(0, 10)) ? String(e.date).slice(0, 10) : '';
      if (!day || day < mon || day > fri) continue;
      const imp = String(e.impact || e.tier || e.level || '').toLowerCase();
      if (imp && !/high|red|3|tier.?1|major/.test(imp)) continue;
      const cur = String(e.country || e.ccy || e.currency || 'USD').toUpperCase(); if (cur && !/US/.test(cur)) continue;
      const hm = /^\d{1,2}:\d{2}/.test(String(e.time || e.hm || '')) ? String(e.time || e.hm).slice(0, 5) : '';
      rows.push({ day, hm, title: str(e.title || e.name || e.event, 70), past: day < nowDay || (day === nowDay && hm && nowHm && hm < nowHm) });
    }
    rows.sort((a, b) => (a.day + a.hm < b.day + b.hm ? -1 : 1));
    const days = [0, 1, 2, 3, 4].map((i) => { const d = addDays(mon, i); return { day: d, label: shortDay(d), today: d === nowDay, events: rows.filter((r) => r.day === d) }; });
    let next = null;
    for (const e of E) { const d = isObj(e) ? String(e.date || e.day || '').slice(0, 10) : ''; if (isDay(d) && d > fri && (!next || d < next.day)) next = { day: d, label: shortDay(d), hm: String(e.time || e.hm || '').slice(0, 5), title: str(e.title || e.name || e.event, 70) }; }
    return { days, n: rows.length, from: mon, to: fri, next, built: str(N.built, 10) };
  }
  function addDays(day, n) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day); return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n)).toISOString().slice(0, 10); }

  const core = { dist, underwater, twinR, streaks, extremes, heat, timeline, fillLine, payout, planId, weekNews, tag, ageWords, money, moneyS, rTxt, shortDay, SRC, PLAN_KEY };

  // ================================================================================================ the chart style (DOM only)
  const NS = 'http://www.w3.org/2000/svg';
  function el(tag, cls, text) { const e = root.document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
  function sv(tag, attrs, text) { const e = root.document.createElementNS(NS, tag); for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = String(text); return e; }
  const clear = (n) => { while (n && n.firstChild) n.removeChild(n.firstChild); };
  const svgBox = (w, h, label) => sv('svg', { class: 'nqd-svg', viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': label, preserveAspectRatio: 'none' });
  function head(box, title, t) { const r = el('div', 'nqd-head'); r.appendChild(el('h3', 'nqd-h', title)); if (t) { const p = el('span', 'nqd-src', t.src || '-'); p.dataset.src = String(t.src || '').toLowerCase(); r.appendChild(p); } box.appendChild(r); if (t && t.text) box.appendChild(el('p', 'nqd-age', t.text)); }
  function empty(box, words) { box.appendChild(el('p', 'nqd-empty', words)); }

  /** equity (line) over an underwater drawdown (area below zero), one svg, 320 x 170 */
  function drawUnderwater(box, rows, t) {
    clear(box); head(box, 'Equity and drawdown', t);
    const U = underwater(rows); if (U.pts.length < 2) { empty(box, 'Needs at least 2 trading days.'); return U; }
    const W = 320, H = 170, top = 104, P = 6, n = U.pts.length;
    const svg = svgBox(W, H, `Running $ ${money(U.net)}, worst drawdown ${money(U.maxDD)}`);
    const hiV = Math.max(0, ...U.pts.map((p) => p.cum)), loV = Math.min(0, ...U.pts.map((p) => p.cum)), dv = hiV - loV || 1;
    const X = (i) => P + (i / (n - 1)) * (W - 2 * P), Y = (v) => P + (1 - (v - loV) / dv) * (top - 2 * P);
    const ddLo = Math.min(-1, U.maxDD), YD = (v) => top + 10 + (v / ddLo) * (H - top - 16);
    svg.appendChild(sv('line', { class: 'nqd-zero', x1: P, x2: W - P, y1: Y(0), y2: Y(0) }));
    svg.appendChild(sv('path', { class: 'nqd-peak', d: U.pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.peak).toFixed(1)}`).join(' ') }));
    svg.appendChild(sv('path', { class: 'nqd-line', d: U.pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.cum).toFixed(1)}`).join(' ') }));
    svg.appendChild(sv('line', { class: 'nqd-zero', x1: P, x2: W - P, y1: top + 10, y2: top + 10 }));
    svg.appendChild(sv('path', { class: 'nqd-dd', d: `M${X(0)} ${top + 10} ` + U.pts.map((p, i) => `L${X(i).toFixed(1)} ${YD(p.dd).toFixed(1)}`).join(' ') + ` L${X(n - 1)} ${top + 10} Z` }));
    svg.appendChild(sv('text', { class: 'nqd-ax', x: P + 2, y: top + 6 }, 'drawdown from the peak'));
    box.appendChild(svg);
    const k = el('dl', 'nqd-kv');
    const kv = (a, b, c) => { k.appendChild(el('dt', '', a)); k.appendChild(el('dd', c || '', b)); };
    kv('Net', moneyS(U.net), U.net >= 0 ? 'pos' : 'neg'); kv('Worst drawdown', money(U.maxDD), 'neg');
    kv('Drawdown now', U.nowDD < 0 ? money(U.nowDD) : 'at the peak', U.nowDD < 0 ? 'neg' : 'pos');
    kv('Worst on', shortDay(U.maxDDDay) || '-'); if (U.maxDD < 0) kv('Back to the peak', U.recoveredDay ? shortDay(U.recoveredDay) : 'not yet');
    box.appendChild(k); return U;
  }
  /** LIVE vs BACKTEST twin in R, one svg */
  function drawTwin(box, rows, bot, ak, nowS) {
    clear(box); const T = twinR(rows, bot, ak);
    head(box, `${bot === 'ATLAS' ? 'ATLAS' : 'Zlarior'}: LIVE vs the BACKTEST twin (R)`, { src: 'LIVE + BACKTEST', text: T.n ? `${plural(T.n, 'LIVE trade')} ${shortDay(T.from)} - ${shortDay(T.to)}; ${plural(T.nBack || 0, 'backtest trade')} on the same days` : '' });
    if (!T.n) { empty(box, 'No LIVE trades for this bot yet.'); return T; }
    if (T.live.length < 2) { box.appendChild(el('p', 'nqd-pay', `LIVE so far: ${rTxt(T.liveR)} on ${plural(T.n, 'trade')}${T.back.length ? `; the backtest: ${rTxt(T.backR)}` : ''}.`)); box.appendChild(el('p', 'nqd-note', 'The chart starts at the second LIVE trading day.')); if (T.gap == null && T.backEnds) box.appendChild(el('p', 'nqd-note', `The backtest file ends ${shortDay(T.backEnds)}: no twin for these LIVE days until the next replay upload.`)); return T; }
    const W = 320, H = 130, P = 8, all = [0].concat(T.live.map((p) => p.cum), T.back.map((p) => p.cum)), lo = Math.min(...all), hi = Math.max(...all), dv = hi - lo || 1;
    const span = Math.max(1, between(T.from, T.to)), X = (d) => P + (between(T.from, d) / span) * (W - 2 * P), Y = (v) => P + (1 - (v - lo) / dv) * (H - 2 * P);
    const path = (L) => [{ day: T.from, cum: 0 }].concat(L).map((p, i) => `${i ? 'L' : 'M'}${X(p.day).toFixed(1)} ${Y(p.cum).toFixed(1)}`).join(' ');
    const svg = svgBox(W, H, `LIVE ${rTxt(T.liveR)} vs backtest ${rTxt(T.backR)}`);
    svg.appendChild(sv('line', { class: 'nqd-zero', x1: P, x2: W - P, y1: Y(0), y2: Y(0) }));
    if (T.back.length) svg.appendChild(sv('path', { class: 'nqd-line twin', d: path(T.back) }));
    svg.appendChild(sv('path', { class: 'nqd-line', d: path(T.live) }));
    box.appendChild(svg);
    const leg = el('p', 'nqd-leg'); const a = el('span', 'k live', `LIVE ${rTxt(T.liveR)}`), b = el('span', 'k twin', T.back.length ? `BACKTEST ${rTxt(T.backR)}` : 'BACKTEST: no trades these days'); leg.appendChild(a); leg.appendChild(b); box.appendChild(leg);
    if (T.gap == null && T.backEnds) box.appendChild(el('p', 'nqd-note', `The backtest file ends ${shortDay(T.backEnds)}: no twin for these LIVE days until the next replay upload.`));
    if (T.gap != null) box.appendChild(el('p', 'nqd-note', `${T.gap >= 0 ? 'LIVE is ahead' : 'LIVE is behind'} by ${rTxt(Math.abs(T.gap)).replace('+', '')}${T.backEnds ? `; the backtest file ends ${shortDay(T.backEnds)}` : ''}. A small gap is fills and costs; a big one is worth a look.`));
    return T;
  }
  /** histogram bars (svg) for 'r' or 'usd' */
  function drawDist(box, rows, key, t) {
    clear(box); head(box, key === 'r' ? 'R-multiple of each trade' : '$ of each trade', t);
    const D = dist(rows, key); if (!D.n) { empty(box, 'No trades.'); return D; }
    const W = 320, H = 120, P = 4, n = D.buckets.length, bw = (W - 2 * P) / n, mx = Math.max(...D.buckets.map((b) => b.n)) || 1;
    const svg = svgBox(W, H + 16, `${D.n} trades, median ${key === 'r' ? rTxt(D.median) : money(D.median)}`);
    D.buckets.forEach((b, i) => {
      const h = (b.n / mx) * (H - 8), x = P + i * bw;
      const cl = key === 'r' ? (b.mid < 0 ? 'neg' : b.mid > 0 ? 'pos' : 'mid') : (b.hi <= 0 ? 'neg' : b.lo >= 0 ? 'pos' : 'mid');
      const r = sv('rect', { class: `nqd-bar ${cl}`, x: (x + 1).toFixed(1), y: (H - h).toFixed(1), width: Math.max(1, bw - 2).toFixed(1), height: Math.max(b.n ? 1 : 0, h).toFixed(1) });
      r.appendChild(sv('title', {}, `${b.label}: ${plural(b.n, 'trade')}`)); svg.appendChild(r);
    });
    const zi = D.buckets.findIndex((b) => (key === 'r' ? b.mid >= 0 : b.lo >= 0)); if (zi > 0) svg.appendChild(sv('line', { class: 'nqd-zero', x1: P + zi * bw, x2: P + zi * bw, y1: 0, y2: H }));
    const first = D.buckets[0], last = D.buckets[n - 1], fmt = key === 'r' ? (x) => `${x}R` : money;
    svg.appendChild(sv('text', { class: 'nqd-ax', x: P, y: H + 13 }, (D.clampLo ? '≤' : '') + (key === 'r' ? fmt(first.mid) : fmt(first.lo))));
    if (key === 'r' && zi > 0) svg.appendChild(sv('text', { class: 'nqd-ax', x: P + zi * bw + 2, y: H + 13 }, '0R'));
    svg.appendChild(sv('text', { class: 'nqd-ax end', x: W - P, y: H + 13 }, (D.clampHi ? '≥' : '') + (key === 'r' ? fmt(last.mid) : fmt(last.hi))));
    box.appendChild(svg);
    box.appendChild(el('p', 'nqd-note', `${plural(D.n, 'trade')}. Median ${key === 'r' ? rTxt(D.median) : moneyS(D.median)}, average ${key === 'r' ? rTxt(D.mean) : moneyS(D.mean)}.${key === 'r' ? ' -1R = a full stop; the target is banked at up to 8R.' : ''}`));
    return D;
  }
  /** hour x weekday win % grid (HTML table: readable by a screen reader) */
  function drawHeat(box, rows, t) {
    clear(box); head(box, 'Win rate by hour (ET) and weekday', t);
    const G = heat(rows); if (!G.grid.length) { empty(box, 'No trades.'); return G; }
    const tb = el('table', 'nqd-heat'); const th = el('tr'); th.appendChild(el('th', '', 'ET')); for (const d of G.days) th.appendChild(el('th', '', d)); tb.appendChild(th);
    for (const g of G.grid) {
      const tr = el('tr'); tr.appendChild(el('th', '', g.label));
      for (const c of g.cells) {
        const td = el('td', '', c.n ? `${c.pct}%` : '');
        td.dataset.lvl = !c.n ? 'none' : c.n < 3 ? 'few' : c.pct >= 60 ? 'hi' : c.pct >= 45 ? 'mid' : 'lo';
        td.setAttribute('aria-label', c.n ? `${g.label} ${G.days[c.w - 1]}: ${c.pct}% of ${plural(c.n, 'trade')} won, ${moneyS(c.usd)}` : `${g.label} ${G.days[c.w - 1]}: no trades`);
        if (c.n) td.appendChild(el('small', '', `${c.n}`)); tr.appendChild(td);
      }
      tb.appendChild(tr);
    }
    const wrap = el('div', 'nqd-scroll'); wrap.appendChild(tb); box.appendChild(wrap);
    const bits = [];
    if (G.best) bits.push(`best: ${G.days[G.best.w - 1]} ${String(G.best.h).padStart(2, '0')}:00 (${moneyS(G.best.usd)} on ${G.best.n})`);
    if (G.worst) bits.push(`worst: ${G.days[G.worst.w - 1]} ${String(G.worst.h).padStart(2, '0')}:00 (${moneyS(G.worst.usd)} on ${G.worst.n})`);
    box.appendChild(el('p', 'nqd-note', `Small number = trades in that cell; faded = under 3 trades (luck as much as edge).${bits.length ? ' ' + bits.join('; ') + '.' : ''}`));
    return G;
  }
  function drawStreaks(box, rows, t) {
    clear(box); head(box, 'Streaks', t);
    const S = streaks(rows); if (!S.n) { empty(box, 'No trades.'); return S; }
    const k = el('dl', 'nqd-kv'); const kv = (a, b, c) => { k.appendChild(el('dt', '', a)); k.appendChild(el('dd', c || '', b)); };
    kv('Right now', S.text, S.curK === 'W' ? 'pos' : S.curK === 'L' ? 'neg' : ''); kv('Longest wins', plural(S.bestW, 'trade'), 'pos'); kv('Longest losses', plural(S.bestL, 'trade'), 'neg');
    kv('Record', `${S.wins} W · ${S.losses} L · ${S.be} break-even`); box.appendChild(k);
    const strip = el('ol', 'nqd-strip'); strip.setAttribute('aria-label', `The last ${S.last.length} trades, oldest first`);
    for (const x of S.last) { const li = el('li', '', x.k); li.dataset.k = x.k; li.title = `${shortDay(x.day)}: ${moneyS(x.usd)}`; li.setAttribute('aria-label', `${shortDay(x.day)} ${x.k === 'W' ? 'win' : x.k === 'L' ? 'loss' : 'break-even'} ${moneyS(x.usd)}`); strip.appendChild(li); }
    box.appendChild(strip); box.appendChild(el('p', 'nqd-note', `The last ${S.last.length}, oldest on the left. W = win, L = loss, B = break-even (within 50 cents).`));
    return S;
  }
  function drawExtremes(box, rows, t) {
    clear(box); head(box, 'Best and worst trades', t);
    const X = extremes(rows, 5); if (!X.best.length && !X.worst.length) { empty(box, 'No trades.'); return X; }
    const col = (title, L, cls) => { const d = el('div', 'nqd-col'); d.appendChild(el('p', 'nqd-colh', title)); const ol = el('ol', 'nqd-list');
      for (const x of L) { const li = el('li'); li.appendChild(el('span', 'w', `${x.label} ${x.bot === 'ATLAS' ? 'ATLAS' : 'LIT'} ${x.side}`)); li.appendChild(el('b', cls, `${moneyS(x.usd)}${x.r != null ? ' · ' + rTxt(x.r) : ''}`)); ol.appendChild(li); }
      if (!L.length) ol.appendChild(el('li', 'nqd-empty', 'none')); d.appendChild(ol); return d; };
    const g = el('div', 'nqd-two'); g.appendChild(col('Best 5', X.best, 'pos')); g.appendChild(col('Worst 5', X.worst, 'neg')); box.appendChild(g); return X;
  }
  /** the last n trades as small level boxes: stop (red dash), target (green dash), entry dot -> exit dot */
  function drawTimeline(box, rows, n, t) {
    clear(box); head(box, 'Trade timeline: entry and exit', t);
    const R = good(rows).slice().sort((a, b) => (num(b.t) || 0) - (num(a.t) || 0)).map(timeline).filter(Boolean).slice(0, n || 6);
    if (!R.length) { empty(box, 'No trades with their levels.'); return R; }
    const g = el('div', 'nqd-tl');
    for (const T of R) {
      const card = el('figure', 'nqd-tlc'); const W = 150, H = 70, P = 6, pad = (T.hi - T.lo) * 0.12 || 1, lo = T.lo - pad, hi = T.hi + pad, Y = (v) => P + (1 - (v - lo) / (hi - lo)) * (H - 2 * P);
      const svg = svgBox(W, H, T.text);
      svg.appendChild(sv('line', { class: 'nqd-lvl stop', x1: P, x2: W - P, y1: Y(T.s), y2: Y(T.s) }));
      if (T.tg != null) svg.appendChild(sv('line', { class: 'nqd-lvl tgt', x1: P, x2: W - P, y1: Y(T.tg), y2: Y(T.tg) }));
      svg.appendChild(sv('line', { class: 'nqd-lvl in', x1: P, x2: W - P, y1: Y(T.e), y2: Y(T.e) }));
      const x0 = P + 14, x1 = W - P - 14, xe = T.x != null ? T.x : T.e;
      svg.appendChild(sv('line', { class: `nqd-path ${T.usd > WIN ? 'pos' : T.usd < -WIN ? 'neg' : 'mid'}`, x1: x0, x2: x1, y1: Y(T.e), y2: Y(xe) }));
      svg.appendChild(sv('circle', { class: 'nqd-dot in', cx: x0, cy: Y(T.e), r: 4 }));
      svg.appendChild(sv('circle', { class: `nqd-dot out ${T.usd > WIN ? 'pos' : T.usd < -WIN ? 'neg' : 'mid'}`, cx: x1, cy: Y(xe), r: 4 }));
      card.appendChild(svg);
      const cap = el('figcaption'); cap.appendChild(el('b', T.usd > WIN ? 'pos' : T.usd < -WIN ? 'neg' : '', `${moneyS(T.usd)}${T.r != null ? ' · ' + rTxt(T.r) : ''}`));
      cap.appendChild(el('span', '', `${T.long ? 'Long' : 'Short'} ${shortDay(T.day)} ${T.hm} · ${T.mins} min · ${T.k || 'exit'}`)); card.appendChild(cap); g.appendChild(card);
    }
    box.appendChild(g); box.appendChild(el('p', 'nqd-note', 'Levels only (the site keeps each trade\'s prices, not its minute bars): red dash = stop, green dash = target, line = entry to exit.'));
    return R;
  }
  /** the payout date range bar: today .. p90 with the p10-p90 band and the median dot */
  function drawPayout(box, P) {
    clear(box); if (!P) { empty(box, 'No payout plan for this account yet.'); return null; }
    box.appendChild(el('p', 'nqd-pay', P.text));
    const bar = el('div', 'nqd-range'); bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', P.text);
    const band = el('span', 'band'); band.style.left = `${Math.round((P.posLo || 0) * 100)}%`; band.style.right = '0%'; bar.appendChild(band);
    if (P.posMed != null) { const m = el('span', 'med'); m.style.left = `${Math.round(P.posMed * 100)}%`; bar.appendChild(m); }
    box.appendChild(bar);
    const ax = el('p', 'nqd-rax'); ax.appendChild(el('span', '', 'today')); ax.appendChild(el('span', '', P.hi ? shortDay(P.hi) + (P.hiOpen ? '+' : '') : 'later')); box.appendChild(ax);
    const bits = []; if (P.pDec31 != null) bits.push(`${Math.round(P.pDec31)} in 100 by Dec 31`); if (P.pJan31 != null) bits.push(`${Math.round(P.pJan31)} by Jan 31`); if (P.lostFirst != null) bits.push(`${Math.round(P.lostFirst)} in 100 lose the account first`);
    box.appendChild(el('p', 'nqd-note', `ESTIMATE from 1,000 runs of a ${P.market} market (payday plan, built ${P.built}): ${bits.join(', ')}.`));
    return P;
  }
  function drawNews(box, N) {
    clear(box);
    if (!N || !N.days.length) { empty(box, 'No news calendar in this build.'); return N; }
    const ol = el('ol', 'nqd-news');
    for (const d of N.days) {
      const li = el('li'); if (d.today) li.dataset.today = '1'; li.appendChild(el('b', '', d.label + (d.today ? ' (today)' : '')));
      if (!d.events.length) li.appendChild(el('span', 'quiet', 'no high-impact US news'));
      for (const e of d.events) { const s = el('span', e.past ? 'ev past' : 'ev', `${e.hm ? e.hm + ' ET ' : ''}${e.title}`); li.appendChild(s); }
      ol.appendChild(li);
    }
    box.appendChild(ol);
    if (N.next) box.appendChild(el('p', 'nqd-note', `Next after this week: ${N.next.label}${N.next.hm ? ' ' + N.next.hm + ' ET' : ''}, ${N.next.title}.`));
    return N;
  }
  const draw = { underwater: drawUnderwater, twin: drawTwin, dist: drawDist, heat: drawHeat, streaks: drawStreaks, extremes: drawExtremes, timeline: drawTimeline, payout: drawPayout, news: drawNews };

  const api = { core, draw, v: 1 };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && typeof root === 'object') root.NQ_DEEP = api;
})(typeof window !== 'undefined' ? window : globalThis);
