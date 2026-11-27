// NQ NOW: the iPhone widget for the NQ bots (Scriptable, the free iOS app by Simon Støvring). day-widget 2026-11-27.
// Big NQ price + arrow, each bot as an emoji chip (🟢 in trade +$X · 👀 setup 4/10 · ⏸️ waiting · 🔴 PC silent), today's total $,
// the next event countdown (nq/ports.json "Coming up": news, half days, the roll), MFFU's 7-day "last day", tap = the NQ dashboard.
// Sizes: small / medium / large on the Home Screen; lock screen: rectangular / inline / circular.
// Read only: public numbers (the PC's 15-minute status post on its public ntfy topic, nq/ports.json); sends nothing, holds no key,
// arms nothing. Old numbers always say so: "as of 09:42 ET" in gold past 20 min; past 60 min every bot reads 🔴 PC silent.
//
// Install (one paste, also on the site's widget/setup.html): 1. Scriptable from the App Store (free); 2. Scriptable > + > paste this
// whole file > name it "NQ NOW"; 3. long-press the Home Screen > + > Scriptable > pick a size > Add > tap the widget > Script: NQ NOW.
// Lock screen: long-press the lock screen > Customize > Lock Screen > tap the widget row > Scriptable > Script: NQ NOW.
// Optional Parameter: small / medium / large / rect / inline / circle forces a layout.
// Siri (one more paste of the SAME file): name a copy "NQ status" -> "Hey Siri, NQ status" speaks 2-3 sentences (price, each bot,
// today's trades + $, the next event); name a copy "Why no trade" -> the newest rejected setup from the PC's log in plain words.
//
// Also a CommonJS module (node tests: tests/test_nq_now.py via tests/nq_now_harness.cjs): the pure part (parse / model / words) has
// no Scriptable calls; the drawing runs only when Scriptable's globals exist.
/* global ListWidget, Request, Color, Font, FileManager, Script, config, args, LinearGradient, Point, Speech, QuickLook */
(function (root) {
  'use strict';
  const SITE = 'https://dcondax1-wq.github.io/';
  const FEED_DEFAULT = { ntfy: 'https://ntfy.sh', topic: 'olympus-nq-status-dec434bd8a54f135' };   // public, the same as status_feed.json
  const VERSION = 'nqnow1';
  const FRESH_S = 20 * 60, SILENT_S = 60 * 60, MNQ_USD = 2;
  const HIDDEN = ['blitz'];                     // BLITZ is paper and hidden
  const BOT_NAME = { lit: 'Zlarior', atlas: 'ATLAS', rapid: 'Rapid', rapid2: 'Rapid #2', b25k_2: 'Z 25K #2' };
  const IS_SCRIPTABLE = typeof ListWidget !== 'undefined' && typeof Request !== 'undefined';
  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const okN = (v) => typeof v === 'number' && Number.isFinite(v);
  const num = (v) => (v === null || v === undefined || v === '' ? null : (okN(+v) ? +v : null));

  // ------------------------------------------------------------------ words
  function usd(v, signed) {
    if (!okN(v)) return '—';
    const a = Math.round(Math.abs(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (v < 0 ? '-' : (signed && v > 0 ? '+' : '')) + '$' + a;
  }
  function px(v) { return okN(v) ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'; }
  const pad = (n) => (n < 10 ? '0' : '') + n;
  function etParts(t) {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' });
    const o = {};
    for (const p of f.formatToParts(new Date(t * 1000))) o[p.type] = p.value;
    return { y: +o.year, m: +o.month, d: +o.day, hh: +o.hour % 24, mm: +o.minute, wd: o.weekday };
  }
  function etHM(t) { const p = etParts(t); return pad(p.hh) + ':' + pad(p.mm); }
  function etDay(t) { const p = etParts(t); return p.y + '-' + pad(p.m) + '-' + pad(p.d); }
  function cmeDay(t) { return etDay(t + 6 * 3600); }          // 18:00 ET starts the next trading day
  function zoneEpoch(day, hh, mm) {                             // epoch seconds of a New York wall-clock time (two passes cover DST)
    const [y, m, d] = day.split('-').map(Number);
    let t = Date.UTC(y, m - 1, d, hh, mm) / 1000;
    for (let i = 0; i < 2; i++) { const p = etParts(t); t += ((hh * 60 + mm) - (p.hh * 60 + p.mm)) * 60 + (Date.UTC(y, m - 1, d) - Date.UTC(p.y, p.m - 1, p.d)) / 1000; }
    return t;
  }
  function span(s) {                                            // 3d 4h / 2h 05m / 12m
    s = Math.max(0, Math.round(s));
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    return d ? d + 'd ' + h + 'h' : h ? h + 'h ' + pad(m) + 'm' : m + 'm';
  }
  const wdOf = (day) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(day + 'T12:00:00Z').getUTCDay()];
  const md = (day) => +day.slice(5, 7) + '/' + +day.slice(8, 10);
  const addDays = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const dayDiff = (a, b) => Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 86400000);

  // ------------------------------------------------------------------ the PC post (ntfy /json?poll=1: one event per line; core + ext parts)
  const NESTED = { glance: ['pc', 'glance'], board_trades: ['board', 'trades'] };
  function parseLite(ndjson) {
    if (typeof ndjson !== 'string' || !ndjson) return null;
    let best = null, bt = -1;
    const exts = [];
    for (const line of ndjson.split('\n')) {
      let e, m;
      try { e = JSON.parse(line); } catch (_) { continue; }
      if (!isObj(e) || typeof e.message !== 'string') continue;
      try { m = JSON.parse(e.message); } catch (_) { continue; }
      if (!isObj(m)) continue;
      if (m.kind === 'le-live-ext' && isObj(m.x)) { exts.push(m); continue; }
      if (m.kind !== 'le-live' || !okN(+m.t)) continue;
      const t = +((isObj(m.reporter) && m.reporter.t) || e.time || m.t) || 0;
      if (t >= bt) { best = m; bt = t; }
    }
    if (!best) return null;
    for (const x of exts) {                                     // lay the ext parts in where the core has none (glance, k7, ...)
      for (const k of Object.keys(x.x)) {
        if (NESTED[k]) { const [a, b] = NESTED[k]; if (isObj(best[a]) && best[a][b] == null) best[a][b] = x.x[k]; }
        else if (best[k] == null) best[k] = x.x[k];
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ the model (pure)
  function stageOf(s) { const m = String(s || '').match(/(\d+)\s*\/\s*(\d+)/); return m ? { n: +m[1], of: +m[2] } : null; }
  function botsOf(lite) {
    const g = isObj(lite.pc) && isObj(lite.pc.glance) ? lite.pc.glance : (isObj(lite.glance) ? lite.glance : null);
    const list = g && Array.isArray(g.bots) ? g.bots : [];
    const out = list.filter((b) => isObj(b) && b.id && !HIDDEN.includes(String(b.id).toLowerCase()));
    if (!out.length) for (const id of ['lit', 'atlas']) if (isObj(lite.board) && isObj(lite.board[id])) out.push({ id, on: !!lite.board.running });
    return out;
  }
  function positionOf(lite, id) {
    const p = isObj(lite.board) && isObj(lite.board[id]) && isObj(lite.board[id].position) ? lite.board[id].position : null;
    if (!p || num(p.entry) === null) return null;
    const dir = /short/i.test(String(p.side)) || num(p.side) === -1 ? -1 : 1, qty = num(p.qty) || 1;
    return { dir, qty, entry: num(p.entry), usd: num(p.unrealized_usd) };
  }
  function chip(b, lite, price, silent) {
    const id = String(b.id), name = BOT_NAME[id] || String(b.name || id).slice(0, 10);
    if (silent) return { id, name, emoji: '🔴', text: 'PC silent', lvl: 'bad' };
    const pos = positionOf(lite, id);
    if (pos) {
      const v = pos.usd !== null ? pos.usd : okN(price) ? (price - pos.entry) * pos.dir * pos.qty * MNQ_USD : null;
      return { id, name, emoji: '🟢', text: 'in trade ' + (v === null ? (pos.dir < 0 ? 'SHORT' : 'LONG') : usd(v, true)), lvl: 'good', usd: v, side: pos.dir < 0 ? 'short' : 'long' };
    }
    if (b.on === false) return { id, name, emoji: '⏸️', text: 'off', lvl: 'soft' };
    const st = stageOf(b.stage), arm0 = Array.isArray(b.arm) && b.arm.length && isObj(b.arm[0]) ? b.arm[0] : null;
    const side = arm0 && /short/i.test(String(arm0.side)) ? 'short' : arm0 && /long/i.test(String(arm0.side)) ? 'long' : '';
    if (st && st.n >= 2 && st.n < st.of) return { id, name, emoji: '👀', text: 'setup ' + st.n + '/' + st.of, lvl: 'warn', side, stage: st };
    if (arm0 && b.armed) return { id, name, emoji: '👀', text: 'setup forming', lvl: 'warn', side, armed: true };
    return { id, name, emoji: '⏸️', text: 'waiting', lvl: 'soft' };
  }
  function todayUsd(lite) {
    let s = 0, n = 0;
    for (const a of Array.isArray(lite.accounts) ? lite.accounts : []) {
      if (!isObj(a) || HIDDEN.includes(String(a.id).toLowerCase())) continue;
      const v = num(isObj(a.eval) ? a.eval.today : null) ?? num(isObj(a.pnl) ? a.pnl.today : null);
      if (v !== null) { s += v; n++; }
    }
    if (n) return s;
    const b = isObj(lite.board) ? lite.board : {};
    const parts = ['lit', 'atlas'].map((k) => num(isObj(b[k]) ? b[k].today_pnl : null)).filter((v) => v !== null);
    return parts.length ? parts.reduce((x, y) => x + y, 0) : num(lite.day_pnl);
  }
  function nextEvent(ports, now) {
    const ev = isObj(ports) && isObj(ports.cal) && Array.isArray(ports.cal.events) ? ports.cal.events : [];
    for (const e of ev) {
      if (!isObj(e) || !/^\d{4}-\d{2}-\d{2}$/.test(String(e.day))) continue;
      const hm = /^(\d{1,2}):(\d{2})$/.exec(String(e.t || ''));
      const at = zoneEpoch(e.day, hm ? +hm[1] : 0, hm ? +hm[2] : 0);
      if (at + (e.kind === 'closed' ? 86400 : 0) <= now) continue;
      const short = e.kind === 'half' ? 'Half day ' + (e.t || '') : e.kind === 'roll' ? 'Roll' : e.kind === 'closed' ? 'CME closed'
        : String(e.what || '').split(/\s\d|:|\(/)[0].replace(/Non-Farm Payrolls/, 'NFP').replace(/FOMC rate decision.*/, 'FOMC').replace(/FOMC press conference/, 'FOMC presser').trim().slice(0, 22);
      const isNow = at <= now;
      return { what: short, kind: e.kind, day: e.day, t: e.t || null, at, in: isNow ? 'today' : span(at - now), when: wdOf(e.day) + ' ' + md(e.day) + (hm ? ' ' + e.t : '') };
    }
    return null;
  }
  function lastDay(lite, now) {                                 // MFFU's 7-day rule: the soonest "last day" of the PC's k7 block
    const rows = isObj(lite.k7) && Array.isArray(lite.k7.a) ? lite.k7.a : [];
    const today = cmeDay(now);
    let best = null;
    for (const r of rows) {
      if (!isObj(r) || !/^\d{4}-\d{2}-\d{2}$/.test(String(r.hard)) || HIDDEN.includes(String(r.id).toLowerCase())) continue;
      const left = dayDiff(r.hard, today);
      if (!best || left < best.left) best = { id: r.id, name: String(r.nm || r.id).replace(/\s*funded/i, '').slice(0, 18), hard: r.hard, left };
    }
    if (!best) return null;
    best.text = wdOf(best.hard) + ' ' + md(best.hard) + (best.left < 0 ? ' (passed)' : best.left === 0 ? ' (today)' : '');
    best.lvl = best.left <= 1 ? 'bad' : best.left <= 3 ? 'warn' : 'good';
    return best;
  }
  function priceOf(lite) {
    const g = isObj(lite.pc) && isObj(lite.pc.glance) ? lite.pc.glance : null;
    const gp = g && Array.isArray(g.bots) ? g.bots.map((b) => num(b && b.px)).find((v) => v !== null) : null;
    return num(lite.price) ?? gp ?? null;
  }
  // lite: the newest PC post or null; ports: nq/ports.json or null; cache: what this widget saved last time or null
  function model(lite, ports, cache, now) {
    const c = isObj(cache) ? cache : null;
    if (!isObj(lite) || !okN(+lite.t)) {
      if (c && isObj(c.m)) return Object.assign({}, c.m, { src: 'CACHED', age: now - c.m.t, asOf: etHM(c.m.t), stale: true, silent: now - c.m.t > SILENT_S,
        next: nextEvent(ports, now) || c.m.next, chips: (c.m.chips || []).map((x) => (now - c.m.t > SILENT_S ? Object.assign({}, x, { emoji: '🔴', text: 'PC silent', lvl: 'bad' }) : x)) });
      return { src: 'NONE', t: null, age: null, stale: true, silent: true, price: null, chips: [], today: null, next: nextEvent(ports, now), last: null };
    }
    const t = +lite.t, age = Math.max(0, now - t), silent = age > SILENT_S, price = priceOf(lite);
    let ref = null, refWhat = '';
    const v = isObj(ports) && isObj(ports.vol) ? ports.vol : null;
    if (v && num(v.nq_close) !== null && /^\d{4}-\d{2}-\d{2}$/.test(String(v.nq_day)) && v.nq_day < cmeDay(t)) { ref = num(v.nq_close); refWhat = 'vs ' + wdOf(v.nq_day) + ' close'; }
    else if (c && isObj(c.m) && okN(c.m.price) && c.m.t < t) { ref = c.m.price; refWhat = 'vs ' + etHM(c.m.t); }
    const chg = okN(price) && okN(ref) ? price - ref : null;
    return {
      src: 'PC', t, age, asOf: etHM(t), stale: age > FRESH_S, silent, price, chg, chgPct: chg !== null && ref ? chg / ref * 100 : null, refWhat,
      arrow: chg === null ? '' : chg > 0 ? '▲' : chg < 0 ? '▼' : '▶',
      chips: botsOf(lite).map((b) => chip(b, lite, price, silent)), today: todayUsd(lite), next: nextEvent(ports, now), last: lastDay(lite, now),
      trades: tradesToday(lite), why: whyNot(lite),
      verdict: isObj(lite.pc_verdict) ? String(lite.pc_verdict.label || '').slice(0, 26) : '',
    };
  }
  function statusLine(m) {                                       // the honest age line under everything
    if (m.src === 'NONE') return 'No PC numbers yet';
    if (m.src === 'CACHED') return 'Saved copy · as of ' + m.asOf + ' ET';
    if (m.silent) return 'PC silent · as of ' + m.asOf + ' ET';
    if (m.stale) return 'as of ' + m.asOf + ' ET';
    return 'live · ' + m.asOf + ' ET';
  }

  // ------------------------------------------------------------------ fetch
  async function getText(url, timeoutS) {
    try {
      if (IS_SCRIPTABLE) { const r = new Request(url); r.timeoutInterval = timeoutS || 12; return await r.loadString(); }
      if (typeof fetch !== 'undefined') { const r = await fetch(url, { cache: 'no-store' }); return r.ok ? await r.text() : null; }
    } catch (_) { /* offline */ }
    return null;
  }
  async function getJSON(url) { const s = await getText(url); try { return s ? JSON.parse(s) : null; } catch (_) { return null; } }
  function feedUrls(feed) {
    const f = isObj(feed) && feed.ntfy && /^[A-Za-z0-9_-]{1,64}$/.test(String(feed.topic || '')) ? feed : FEED_DEFAULT;
    const b = String(f.ntfy).replace(/\/$/, '') + '/' + encodeURIComponent(f.topic) + '/json?poll=1&since=';
    return [b + '70m', b + 'latest', b + '12h'];
  }
  async function load(opt) {
    const o = opt || {}, site = o.site || SITE, now = o.now || Date.now() / 1000;
    const [feed, ports] = await Promise.all([getJSON(site + 'status_feed.json'), getJSON(site + 'nq/ports.json')]);
    let lite = null;
    for (const u of feedUrls(feed)) { lite = parseLite(await getText(u)); if (lite) break; }
    return model(lite, ports, o.cache || null, now);
  }

  // ------------------------------------------------------------------ Siri: "Hey Siri, NQ status" / "Hey Siri, why no trade" (spoken words, pure)
  function tradesToday(lite) {
    const b = isObj(lite.board) ? lite.board : {};
    const n = ['lit', 'atlas'].map((k) => num(isObj(b[k]) ? b[k].trades_today : null)).filter((v) => v !== null);
    return n.length ? n.reduce((x, y) => x + y, 0) : null;
  }
  const REJECT = /✗|BLOCKED|: no\b|no - |rejected|skip|too (small|far|late|early|shallow)|outside/i;
  function plain(s) {                                          // the log's shorthand in plain spoken words
    return String(s || '').replace(/^Now:\s*/, '').replace(/…$/, '').replace(/\s*\(\s*/g, ', ').replace(/\)\s*/g, ' ')
      .replace(/;\s*✗\s*/g, ', but ').replace(/✗\s*/g, 'not OK: ').replace(/✓\s*/g, '').replace(/\bATR\b/g, 'A T R').replace(/>=/g, 'at least ')
      .replace(/\bCISD\b/g, 'C I S D').replace(/MACD-div/g, 'MACD divergence').replace(/\s+/g, ' ').replace(/[\s,;:]+$/, '').trim();
  }
  function whyNot(lite) {                                       // the newest rejection in the PC's glog (newest first per bot), BLITZ never
    const g = isObj(lite.glog) ? lite.glog : null;
    if (!g) return null;
    let best = null;
    for (const id of Object.keys(g)) {
      if (HIDDEN.includes(id.toLowerCase()) || !Array.isArray(g[id])) continue;
      for (const row of g[id]) {
        if (!Array.isArray(row) || row.length < 2 || !REJECT.test(String(row[1]))) continue;
        const hm = String(row[0]);
        if (!best || hm > best.hm) best = { id, name: BOT_NAME[id] || id, hm, text: plain(row[1]) };
        break;
      }
    }
    return best;
  }
  function spokenTime(hm) {                                     // "13:15" -> "1:15"
    const m = /^(\d{1,2}):(\d{2})/.exec(String(hm || ''));
    if (!m) return String(hm || '');
    const h = +m[1] % 12 || 12;
    return h + (m[2] === '00' ? '' : ':' + m[2]) + (+m[1] < 12 ? ' in the morning' : +m[1] >= 18 ? ' in the evening' : '');
  }
  function dollars(v) {
    if (!okN(v)) return 'unknown dollars';
    const a = Math.round(Math.abs(v));
    return a === 0 ? 'zero dollars' : (v < 0 ? 'down ' : 'up ') + a.toLocaleString('en-US') + ' dollar' + (a === 1 ? '' : 's');
  }
  function sayBot(c) {
    if (c.emoji === '🔴') return c.name + ' has no fresh report';
    if (c.emoji === '🟢') return c.name + ' is in a ' + (c.side || '') + ' trade, ' + dollars(c.usd);
    if (c.stage) return c.name + ' is forming a ' + (c.side ? c.side + ' ' : '') + 'setup at stage ' + c.stage.n + ' of ' + c.stage.of;
    if (c.armed) return c.name + ' is armed' + (c.side ? ' ' + c.side : '');
    if (c.text === 'off') return c.name + ' is off';
    return c.name + ' is waiting';
  }
  function sayNext(n) {
    if (!n) return '';
    if (n.kind === 'half') return 'Next: the market halts at ' + spokenTime(n.t) + (n.in.indexOf('d') > 0 ? ' on ' + n.when.split(' ')[0] : '') + '.';
    if (n.kind === 'closed') return 'Next: the market is closed ' + (n.in === 'today' ? 'today' : 'on ' + n.when.split(' ').slice(0, 2).join(' ')) + '.';
    if (n.kind === 'roll') return 'Next: the contract roll, in ' + n.in.replace('d', ' days').replace('h', ' hours') + '.';
    return 'Next: ' + n.what + ' at ' + spokenTime(n.t) + (/d/.test(n.in) ? ', ' + n.when.split(' ')[0] : ' today') + '.';
  }
  function sayStatus(m) {
    if (m.src === 'NONE') return 'I have no numbers from the PC yet. ' + sayNext(m.next);
    const lead = m.src === 'CACHED' || m.silent ? 'The PC has been quiet since ' + spokenTime(m.asOf) + '. As of then, '
      : m.stale ? 'As of ' + spokenTime(m.asOf) + ', ' : '';
    const pct = okN(m.chgPct) ? ', ' + (m.chgPct >= 0 ? 'up ' : 'down ') + Math.abs(m.chgPct).toFixed(1) + ' percent' : '';
    const s1 = lead + 'NQ ' + (okN(m.price) ? Math.round(m.price).toLocaleString('en-US') : 'has no price') + pct + '.';
    const bots = (m.chips || []).filter((c) => c.id !== 'rapid' && c.id !== 'rapid2' && c.id !== 'b25k_2').map(sayBot);
    const tr = m.trades === 0 ? 'no trades today' : okN(m.trades) ? m.trades + ' trade' + (m.trades === 1 ? '' : 's') + ' today' : 'today';
    const s2 = (bots.length ? bots.join(', ') + ', ' : '') + tr + ', ' + dollars(m.today) + '.';
    return [s1, s2.charAt(0).toUpperCase() + s2.slice(1), sayNext(m.next)].filter(Boolean).join(' ');
  }
  function sayWhy(m) {
    if (m.src === 'NONE') return 'I have no report from the PC yet, so I cannot say why.';
    const w = m.why;
    if (!w) return 'The PC report has no rejected setup in its log right now' + (m.trades ? ', and there ' + (m.trades === 1 ? 'was 1 trade' : 'were ' + m.trades + ' trades') + ' today.' : '.');
    return 'At ' + spokenTime(w.hm) + ', ' + w.name + ' skipped a setup: ' + w.text + '.' + (m.stale ? ' That is from the report of ' + spokenTime(m.asOf) + '.' : '');
  }

  const API = { VERSION, SITE, FRESH_S, SILENT_S, usd, px, span, etHM, parseLite, model, chip, nextEvent, lastDay, todayUsd, statusLine, feedUrls, zoneEpoch, load, sayStatus, sayWhy, whyNot, plain, spokenTime };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.NQ_NOW = API;
  if (!IS_SCRIPTABLE) return;

  // ------------------------------------------------------------------ Scriptable drawing (OLYMPUS NIGHT: black, violet, gold, mint)
  const C = { bg: '#000000', card: '#16131e', line: '#4d2e76', glow: '#9d59ee', gold: '#f1c14b', mint: '#77db89', red: '#ff6b81', text: '#ece6f7', dim: '#a99cc0' };
  const col = (h, a) => new Color(h, a == null ? 1 : a);
  const lvlCol = (l) => col(l === 'good' ? C.mint : l === 'bad' ? C.red : l === 'warn' ? C.gold : C.dim);
  const PARAM = String((args && args.widgetParameter) || '').toLowerCase();
  const FAM = (() => {
    const f = PARAM.match(/small|medium|large|rect|inline|circle/);
    if (f) return { rect: 'accessoryRectangular', inline: 'accessoryInline', circle: 'accessoryCircular' }[f[0]] || f[0];
    return config.widgetFamily || 'medium';
  })();
  function txt(s, str, size, color, o) {
    const t = s.addText(String(str));
    t.font = (o && o.mono) ? Font.boldMonospacedSystemFont(size) : (o && o.bold) ? Font.boldSystemFont(size) : (o && o.semi) ? Font.semiboldSystemFont(size) : Font.systemFont(size);
    t.textColor = color || col(C.text);
    t.lineLimit = 1; t.minimumScaleFactor = 0.6;
    return t;
  }
  function bg(w) {
    const g = new LinearGradient();
    g.colors = [col('#1a1029'), col(C.bg)]; g.locations = [0, 1]; g.startPoint = new Point(0, 0); g.endPoint = new Point(1, 1);
    w.backgroundGradient = g;
  }
  function priceRow(w, m, size) {
    const r = w.addStack(); r.centerAlignContent();
    txt(r, 'NQ', size * 0.42, col(C.gold), { bold: true }); r.addSpacer(5);
    txt(r, px(m.price), size, col(C.text), { mono: true });
    if (m.arrow) { r.addSpacer(4); txt(r, m.arrow, size * 0.6, m.chg > 0 ? col(C.mint) : m.chg < 0 ? col(C.red) : col(C.dim), { bold: true }); }
    return r;
  }
  function chgLine(w, m, size) {
    if (m.chg === null || m.chg === undefined) return;
    const s = (m.chg > 0 ? '+' : '') + m.chg.toFixed(2) + (okN(m.chgPct) ? ' (' + (m.chgPct > 0 ? '+' : '') + m.chgPct.toFixed(2) + '%)' : '') + ' ' + m.refWhat;
    txt(w, s, size, m.chg > 0 ? col(C.mint) : m.chg < 0 ? col(C.red) : col(C.dim), { semi: true });
  }
  function chipRow(w, c, size) {
    const s = w.addStack(); s.centerAlignContent(); s.setPadding(3, 7, 3, 7); s.cornerRadius = 9;
    s.backgroundColor = col(C.card, 0.95); s.borderWidth = 1; s.borderColor = col(C.line);
    txt(s, c.emoji, size); s.addSpacer(5);
    txt(s, c.name, size, col(C.text), { semi: true }); s.addSpacer(6);
    txt(s, c.text, size, lvlCol(c.lvl), { bold: true });
    return s;
  }
  function todayLine(w, m, size) {
    const r = w.addStack(); r.centerAlignContent();
    txt(r, 'Today ', size, col(C.dim));
    txt(r, m.today === null || m.today === undefined ? '—' : usd(m.today, true), size, m.today > 0 ? col(C.mint) : m.today < 0 ? col(C.red) : col(C.text), { bold: true });
  }
  function nextLine(w, m, size) {
    if (!m.next) return;
    const r = w.addStack(); r.centerAlignContent();
    txt(r, '⏳ ', size); txt(r, m.next.what, size, col(C.text), { semi: true }); r.addSpacer(4);
    txt(r, m.next.in === 'today' ? 'today' : 'in ' + m.next.in, size, col(C.gold), { bold: true });
  }
  function lastLine(w, m, size) {
    if (!m.last) return;
    const r = w.addStack(); r.centerAlignContent();
    txt(r, '7-day ', size, col(C.dim)); txt(r, m.last.text, size, lvlCol(m.last.lvl), { bold: true });
    r.addSpacer(4); txt(r, m.last.name, size, col(C.dim));
  }
  function foot(w, m, size) {
    const r = w.addStack(); r.centerAlignContent();
    txt(r, statusLine(m), size, m.src === 'PC' && !m.stale ? col(C.dim) : m.silent || m.src !== 'PC' ? col(C.red) : col(C.gold), { semi: true });
  }
  function build(m) {
    const w = new ListWidget();
    w.url = SITE + 'nq/';
    w.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);      // iOS decides the real pace (often 5-15 min); asking for 5
    if (FAM === 'accessoryInline') {
      const c = m.chips.find((x) => x.emoji === '🟢') || m.chips[0];
      txt(w, (m.arrow || '') + ' NQ ' + px(m.price) + (c ? ' ' + c.emoji + ' ' + c.text : '') + (m.stale ? ' · ' + (m.asOf || '') : ''), 12);
      return w;
    }
    if (FAM === 'accessoryCircular') {
      const c = m.chips.find((x) => x.emoji === '🟢') || m.chips.find((x) => x.emoji === '👀') || m.chips[0];
      txt(w, c ? c.emoji : '⏸️', 18); txt(w, okN(m.price) ? String(Math.round(m.price)) : '—', 11, null, { bold: true });
      txt(w, m.stale ? m.asOf || '—' : (m.arrow || ''), 9);
      return w;
    }
    if (FAM === 'accessoryRectangular') {
      txt(w, (m.arrow || '') + ' NQ ' + px(m.price) + ' · ' + (m.today === null || m.today === undefined ? '—' : usd(m.today, true)), 13, null, { bold: true });
      txt(w, m.chips.slice(0, 2).map((c) => c.emoji + ' ' + c.text).join('  ') || 'no bots reported', 11);
      txt(w, m.next ? '⏳ ' + m.next.what + ' ' + (m.next.in === 'today' ? 'today' : m.next.in) : statusLine(m), 11);
      if (m.stale) txt(w, statusLine(m), 10);
      return w;
    }
    bg(w);
    if (FAM === 'small') {
      w.setPadding(12, 12, 10, 12);
      priceRow(w, m, 22); chgLine(w, m, 10); w.addSpacer(6);
      for (const c of m.chips.slice(0, 2)) { const r = w.addStack(); txt(r, c.emoji + ' ', 11); txt(r, c.text, 11, lvlCol(c.lvl), { bold: true }); w.addSpacer(2); }
      w.addSpacer(); todayLine(w, m, 12); foot(w, m, 9);
      return w;
    }
    if (FAM === 'medium') {
      w.setPadding(12, 14, 10, 14);
      const top = w.addStack(); top.centerAlignContent();
      const l = top.addStack(); l.layoutVertically(); priceRow(l, m, 24); chgLine(l, m, 10);
      top.addSpacer(); const rr = top.addStack(); rr.layoutVertically(); todayLine(rr, m, 13);
      w.addSpacer(6);
      const chips = w.addStack(); chips.spacing = 6;
      for (const c of m.chips.slice(0, 2)) chipRow(chips, c, 11);
      w.addSpacer(6);
      const b = w.addStack(); nextLine(b, m, 11); b.addSpacer(); lastLine(b, m, 11);
      w.addSpacer(); foot(w, m, 9);
      return w;
    }
    // large (and extra large)
    w.setPadding(16, 16, 12, 16);
    const h = w.addStack(); h.centerAlignContent(); txt(h, 'NQ NOW', 12, col(C.gold), { bold: true }); h.addSpacer();
    if (m.verdict) txt(h, m.verdict, 10, col(C.dim), { semi: true });
    w.addSpacer(6); priceRow(w, m, 34); chgLine(w, m, 12); w.addSpacer(8);
    todayLine(w, m, 15); w.addSpacer(10);
    for (const c of m.chips.slice(0, 5)) { chipRow(w, c, 13); w.addSpacer(5); }
    if (!m.chips.length) txt(w, 'No bot states in the PC post yet', 12, col(C.dim));
    w.addSpacer(6); nextLine(w, m, 13); if (m.next) txt(w, '   ' + m.next.when + ' ET', 10, col(C.dim)); w.addSpacer(4); lastLine(w, m, 13);
    w.addSpacer(); foot(w, m, 10);
    return w;
  }

  const fm = FileManager.local();
  const cachePath = fm.joinPath(fm.documentsDirectory(), 'nq-now-cache.json');
  function readCache() { try { return fm.fileExists(cachePath) ? JSON.parse(fm.readString(cachePath)) : null; } catch (_) { return null; } }
  function writeCache(m) { try { if (m && m.src === 'PC') fm.writeString(cachePath, JSON.stringify({ v: 1, m })); } catch (_) { /* full disk */ } }

  (async () => {
    const m = await load({ cache: readCache() });
    writeCache(m);
    const who = String((typeof Script.name === 'function' ? Script.name() : '') + ' ' + ((args && args.shortcutParameter) || '') + ' ' + PARAM).toLowerCase();
    const voice = /why/.test(who) ? sayWhy(m) : (config.runsWithSiri || /status|siri/.test(who)) ? sayStatus(m) : null;
    if (voice) {                                                   // "Hey Siri, NQ status" / "Hey Siri, why no trade": speak, hand the text to Shortcuts
      if (typeof Speech !== 'undefined') Speech.speak(voice);
      if (typeof Script.setShortcutOutput === 'function') Script.setShortcutOutput(voice);
      if (!config.runsWithSiri && !config.runsInWidget && typeof QuickLook !== 'undefined') await QuickLook.present(voice);
      Script.complete();
      return;
    }
    const w = build(m);
    if (config.runsInWidget || config.runsInAccessoryWidget) Script.setWidget(w);
    else if (FAM === 'small') await w.presentSmall(); else if (FAM === 'large') await w.presentLarge(); else await w.presentMedium();
    Script.complete();
  })();
})(typeof globalThis !== 'undefined' ? globalThis : this);
