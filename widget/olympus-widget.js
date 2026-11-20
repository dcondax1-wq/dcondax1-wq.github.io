// Olympus widget for Scriptable (the free iOS app "Scriptable" by Simon Støvring): your accounts on the iPhone Home Screen.
// Small / medium / LARGE. Read only: it fetches public numbers, sends nothing, holds no key, arms nothing.
//
// Data, newest first (every number says where it came from and how old it is):
//   1. the PC's 15-minute status post (public ntfy topic named in the site's status_feed.json, kind "le-live"): LIVE numbers
//   2. the site's home.json board (the cloud copy): shown as PAPER / SITE with its age when the PC post is missing or older
//   3. the last good copy this widget saved (Scriptable's own Documents folder): shown as CACHED with its age
// Kalshi: the next K8 clock window (gold / silver 15-minute markets, the times engine/kalshi_clock.py uses) + the paper rewards
// net from kalshi/rewards.json. Tap the widget = open the site.
//
// Install (3 steps, also on https://dcondax1-wq.github.io/widget/): 1. get Scriptable from the App Store (free); 2. new script,
// paste this file, name it "Olympus"; 3. long-press the Home Screen, +, Scriptable, pick Large (or Small / Medium), tap the
// widget once it is placed: Script = Olympus. Optional "Parameter": small / medium / large forces a layout, "light" / "dark" a look.
//
// This file is also a CommonJS module (node tests: tests/test_widget.py) and a classic browser script (window.OLY_WIDGET,
// used by widget/glance.html). The pure part (parse / model / format) has no Scriptable calls; the Scriptable part runs only
// when Scriptable's globals (ListWidget, Request) exist.
/* global ListWidget, Request, Color, Font, LinearGradient, DrawContext, Size, Rect, Path, Point, FileManager, Script, config, args, Device, Safari */
(function (root) {
  'use strict';
  const SITE = 'https://dcondax1-wq.github.io/';
  const FEED_DEFAULT = { ntfy: 'https://ntfy.sh', topic: 'olympus-nq-status-dec434bd8a54f135' };   // public, the same as status_feed.json
  const FRESH_S = 20 * 60;          // the PC posts every 15 minutes: older than 20 min = stale (red)
  const VERSION = 'w3';   // cities3 2026-11-20: every account (compact rows past 3), Kalshi's real balance + today, extra-large (iPad) up to 6
  // Scriptable has ListWidget; a browser also has a global Request (the Fetch API), so Request alone does not mean Scriptable
  const IS_SCRIPTABLE = typeof ListWidget !== 'undefined' && typeof Request !== 'undefined';

  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const okN = (v) => typeof v === 'number' && Number.isFinite(v);

  // ------------------------------------------------------------------ format
  function usd(v, signed) {
    if (!okN(v)) return '—';
    const a = Math.round(Math.abs(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const s = v < 0 ? '-' : (signed && v > 0 ? '+' : '');
    return s + '$' + a;
  }
  function ago(sec) {
    if (!okN(sec) || sec < 0) return 'just now';
    if (sec < 90) return 'just now';
    if (sec < 3600) return Math.round(sec / 60) + ' min ago';
    if (sec < 48 * 3600) return Math.round(sec / 3600) + ' h ago';
    return Math.round(sec / 86400) + ' days ago';
  }
  function etParts(t) {                              // {y, m, d, hh, mm, wd} in New York time for epoch seconds t
    const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' });
    const o = {};
    for (const p of f.formatToParts(new Date(t * 1000))) o[p.type] = p.value;
    return { y: +o.year, m: +o.month, d: +o.day, hh: +o.hour % 24, mm: +o.minute, wd: o.weekday };
  }
  const pad = (n) => (n < 10 ? '0' : '') + n;
  function etHM(t) { const p = etParts(t); return pad(p.hh) + ':' + pad(p.mm) + ' ET'; }

  // ------------------------------------------------------------------ the PC post (ntfy /json?poll=1 answer: one JSON event per line)
  function parseLite(ndjson) {
    if (typeof ndjson !== 'string' || !ndjson) return null;
    let best = null, bt = 0;
    for (const line of ndjson.split('\n')) {
      const s = line.trim();
      if (!s) continue;
      let e, m;
      try { e = JSON.parse(s); } catch (_) { continue; }
      if (!isObj(e) || typeof e.message !== 'string') continue;
      try { m = JSON.parse(e.message); } catch (_) { continue; }
      if (!isObj(m) || m.kind !== 'le-live') continue;
      const t = +((isObj(m.reporter) && m.reporter.t) || m.t || e.time) || 0;
      if (t > bt) { best = m; bt = t; }
    }
    return best;
  }

  // ------------------------------------------------------------------ one account row, the same shape from either source
  // the payout coach on one funded card (the same inputs as pc_feed.js payoutLines: balance, room, the PC's mf row for this account) -> need_more | null
  function coachNeed(c, cx) {
    const PC = root && root.PAYOUT_COACH;
    if (!PC || typeof PC.coach !== 'function' || !okN(c.balance)) return null;
    const lite = cx && cx.lite, id = cx && cx.id;
    const mf = isObj(lite) && isObj(lite.mf) && Array.isArray(lite.mf.a) ? lite.mf.a : [];
    const row = mf.find((r) => isObj(r) && r.id === id), f = row && isObj(row.f) ? row.f : null, n = (v) => (v != null && v !== '' && okN(+v) ? +v : null);
    const st = { balance: c.balance, cycle_start_balance: f && n(f.cp) != null ? Math.round((c.balance - n(f.cp)) * 100) / 100 : null, best_day: f ? n(f.bd) : null,
      cycle_days: f ? n(f.cd) : null, payouts_n: f ? n(f.pn) : null, eligible_from: f && f.ef ? f.ef : null, room: okN(c.room) ? c.room : null };
    const p = etParts((cx && cx.now) || Date.now() / 1000), day = p.y + '-' + pad(p.m) + '-' + pad(p.d);
    try { const r = PC.coach(st, /50K/i.test(String(c.plan || '')) || +c.mll >= 2000 ? 'builder50k' : 'builder25k', day); return r && r.ok && okN(r.need_more) ? Math.max(0, r.need_more) : null; } catch (e) { return null; }
  }
  function goalText(c) { return c.to_go == null && c.funded ? 'payout: see Olympus' : usd(c.to_go) + ' ' + c.to_label; }
  function card(c, src, badge, cx) {
    if (!isObj(c)) return null;
    const funded = /funded/i.test(String(c.status || '')) || /funded/i.test(String(c.plan || ''));
    const bal = okN(c.balance) ? c.balance : null;
    if (bal == null && !okN(c.to_target)) return null;            // "not set up" cards carry no numbers: not shown
    const mll = okN(c.mll) ? c.mll : null, room = okN(c.room) ? c.room : null;
    const tgt = okN(c.target_balance) ? c.target_balance : null;
    const base = tgt != null && okN(c.profit) && bal != null ? bal - c.profit : null;   // the start balance
    const goal = tgt != null && base != null ? tgt - base : null;
    const done = goal && okN(c.to_target) ? Math.max(0, Math.min(1, 1 - c.to_target / goal)) : null;
    return {
      name: String(c.name || 'Account'), plan: String(c.plan || ''), short: shortPlan(c.plan), funded,
      balance: bal, today: okN(c.today_pnl) ? c.today_pnl : null, week: okN(c.week_pnl) ? c.week_pnl : null,
      // funded (olympus2 DATA TRUTH ask): the payout coach's need_more (business/payoutcoach.js, the number NQ / Trading / Board show), never the PC's
      // raw $750-ping line; no coach here (Scriptable) = no number ('payout: see Olympus')
      to_go: funded ? coachNeed(c, cx) : okN(c.to_target) ? Math.max(0, c.to_target) : null, to_label: funded ? 'to payout' : 'to pass',
      room, mll, room_frac: room != null && mll ? Math.max(0, Math.min(1, room / mll)) : null, progress: funded ? null : done,   // funded: the coach's number has no 'way to go' bar
      waiting: typeof c.waiting === 'string' ? c.waiting.slice(0, 120) : '', window: isObj(c.window) ? String(c.window.text || '') : '',
      src, badge: badge || (c.badge === 'LIVE' ? 'LIVE' : 'PAPER'),
    };
  }
  function shortPlan(p) { const m = String(p || '').match(/(\d+)K/i); return m ? m[1] + 'K' : ''; }
  function sameAcct(a, b) {
    if (okN(a.balance) && okN(b.balance) && Math.abs(a.balance - b.balance) < 0.01 && a.target_balance === b.target_balance) return true;
    // cities3: the same drawdown floor AND room to the cent = the same account even when one copy's balance is off (a bot card mid-update)
    return okN(a.floor) && okN(b.floor) && okN(a.room) && okN(b.room) && Math.abs(a.floor - b.floor) < 0.01 && Math.abs(a.room - b.room) < 0.01 && a.target_balance === b.target_balance;
  }

  // the extra eval / funded cards of the PC post (Zlarior 25K #2 ...) in the board-card keys
  function extraCards(list, seen) {
    const out = [];
    for (const a of Array.isArray(list) ? list : []) {
      if (!isObj(a) || !isObj(a.eval) || !/eval|funded/.test(String(a.kind || ''))) continue;
      const e = a.eval, p = isObj(a.pnl) ? a.pnl : {};
      const c = { id: a.id, name: a.name, plan: a.plan, status: e.status === 'open' ? (a.kind === 'funded' ? 'funded' : 'open') : e.status, balance: e.balance,
        floor: e.floor, room: e.room, mll: e.mll, to_target: e.to_target, target_balance: e.target_balance, profit: e.profit,
        today_pnl: okN(p.today) ? p.today : e.today, week_pnl: p.week, badge: a.badge };
      if (seen.some((s) => sameAcct(s, c))) continue;
      seen.push(c);
      out.push(c);
    }
    return out;
  }
  function tidyName(n) { return String(n || '').replace(/\s*Builder\s*/i, ' ').replace(/\s+/g, ' ').trim(); }

  // ------------------------------------------------------------------ the model: what every widget size draws
  function fromLite(lite, now) {
    if (!isObj(lite) || !isObj(lite.board)) return null;
    const b = lite.board, rt = +((isObj(lite.reporter) && lite.reporter.t) || lite.t) || 0;
    const seen = [], cards = [];
    for (const k of ['lit', 'atlas']) {
      const c = b[k];
      if (!isObj(c) || c.configured === false) continue;
      seen.push(c);
      const x = card(c, 'PC', c.badge === 'LIVE' ? 'LIVE' : 'PAPER', { lite, id: k, now });
      if (x) { if (k === 'lit' && x.short) x.name = x.name + ' ' + x.short; cards.push(x); }
    }
    for (const c of extraCards(lite.accounts, seen)) { const x = card(c, 'PC', c.badge === 'LIVE' ? 'LIVE' : 'PAPER', { lite, id: c.id, now }); if (x) { x.name = tidyName(x.name); cards.push(x); } }
    const v = isObj(lite.pc_verdict) ? lite.pc_verdict : {}, pc = isObj(lite.pc) ? lite.pc : {};
    const age = rt ? now - rt : null;
    const stale = age == null || age > FRESH_S;
    return {
      v: 1, src: 'PC', t: rt, age_s: age, stale,
      pc: { on: !stale && pc.running !== false, label: stale ? 'PC silent ' + ago(age) : String(v.label || (pc.running ? 'Bot running' : 'Bot stopped')).slice(0, 40),
        level: stale ? 'bad' : (v.level || 'good'), model: String(pc.model_state || '').slice(0, 90) },
      accounts: cards, today: sum(cards, 'today'), price: okN(lite.price) ? lite.price : null,
    };
  }
  function fromHome(home, now) {
    const b = isObj(home) && isObj(home.board) ? home.board : null;
    if (!b) return null;
    const t = +b.data_t || +b.t || 0, cards = [];
    const cloud = b.where === 'cloud';
    for (const k of ['lit', 'atlas']) {
      const c = b[k];
      if (!isObj(c) || c.configured === false) continue;
      const x = card(c, cloud ? 'SITE' : 'PC', cloud ? 'PAPER' : (c.badge === 'LIVE' ? 'LIVE' : 'PAPER'));
      if (x) { if (k === 'lit' && x.short) x.name = x.name + ' ' + x.short; cards.push(x); }
    }
    const age = t ? now - t : null;
    return { v: 1, src: 'SITE', t, age_s: age, stale: true, cloud,
      pc: { on: false, label: cloud ? 'No PC post: cloud copy' : 'Site copy', level: 'warn', model: '' },
      accounts: cards, today: sum(cards, 'today'), price: null };
  }
  function sum(cards, k) { let s = 0, n = 0; for (const c of cards) if (okN(c[k])) { s += c[k]; n++; } return n ? s : null; }

  // the best of what came back: the PC post when it has accounts and is not older than the site copy; a CLOUD site board (the
  // cloud's own paper twin, pc_feed.js rule) never beats a PC post, however old the post is (the post then shows red + its age)
  function pick(lite, home, cached, now) {
    const a = fromLite(lite, now), b = fromHome(home, now);
    let m = null;
    if (a && a.accounts.length && (!b || !b.t || b.cloud || a.t >= b.t - 60)) m = a;
    else if (b && b.accounts.length) m = b;
    else if (a) m = a;
    if (!m && isObj(cached) && Array.isArray(cached.accounts)) {
      m = Object.assign({}, cached, { src: 'CACHED', age_s: cached.t ? now - cached.t : null, stale: true });
      m.pc = Object.assign({}, cached.pc || {}, { on: false, level: 'bad', label: 'Offline: last copy ' + ago(m.age_s) });
    }
    return m;
  }

  // ------------------------------------------------------------------ Kalshi K8 clock windows (engine/kalshi_clock.py LEGS, US weekdays)
  const K_LEGS = [
    { tz: 'Europe/London', hh: 10, mm: 15, skip: 'uk', name: 'gold / silver DOWN' },
    { tz: 'America/New_York', hh: 16, mm: 0, skip: 'cme', name: 'silver DOWN' },
    { tz: 'America/New_York', hh: 16, mm: 45, skip: 'cme', name: 'gold / silver UP' },
  ];
  const UK_SKIP = ['2026-12-25', '2026-12-28', '2027-01-01', '2027-03-26', '2027-03-29'];
  const CME_SKIP = ['2026-11-26', '2026-11-27', '2026-12-24', '2026-12-25', '2027-01-01', '2027-03-26'];
  function zoneEpoch(y, m, d, hh, mm, tz) {           // epoch seconds of a wall-clock time in tz (two passes cover DST)
    let t = Date.UTC(y, m - 1, d, hh, mm) / 1000;
    for (let i = 0; i < 2; i++) {
      const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      const o = {};
      for (const p of f.formatToParts(new Date(t * 1000))) o[p.type] = p.value;
      const seen = Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour % 24, +o.minute) / 1000;
      t += Date.UTC(y, m - 1, d, hh, mm) / 1000 - seen;
    }
    return t;
  }
  function kalshiNext(now) {
    for (let add = 0; add < 8; add++) {
      const p = etParts(now + add * 86400);
      if (p.wd === 'Sat' || p.wd === 'Sun') continue;
      const iso = p.y + '-' + pad(p.m) + '-' + pad(p.d);
      const opts = [];
      for (const L of K_LEGS) {
        if ((L.skip === 'uk' ? UK_SKIP : CME_SKIP).indexOf(iso) >= 0) continue;
        const t = zoneEpoch(p.y, p.m, p.d, L.hh, L.mm, L.tz);
        if (t + 20 > now - 1) opts.push({ t, name: L.name });
      }
      opts.sort((a, b) => a.t - b.t);
      if (opts.length) {
        const o = opts[0], inS = Math.max(0, o.t - now);
        const day = add === 0 ? 'today' : (add === 1 ? 'tomorrow' : p.wd);
        return { t: o.t, in_s: inS, name: o.name, text: day + ' ' + etHM(o.t), soon: inS < 3600 };
      }
    }
    return null;
  }
  function kalshiPaper(rw) {
    const p = isObj(rw) && isObj(rw.paper) ? rw.paper : null;
    if (!p || !okN(p.net)) return null;
    const t = Date.parse(p.updated || '') / 1000;
    return { net: p.net, per100: okN(p.per100_day) ? p.per100_day : null, t: okN(t) ? t : null };
  }

  // ------------------------------------------------------------------ fetch (Scriptable Request or browser fetch)
  // kalshi.json (the site's copy of the Kalshi bot's feed): balance + today's $ when it has them, with its age; else null (never made up)
  function kalshiBal(k, now) {
    if (!isObj(k) || !okN(k.balance)) return null;
    const t = okN(k.t) ? k.t : null;
    return { balance: k.balance, today: okN(k.today_pnl) ? k.today_pnl : null, running: k.running === true, age_s: t != null && okN(now) ? Math.max(0, now - t) : null };
  }
  async function getText(url, timeoutS) {
    try {
      if (IS_SCRIPTABLE) { const r = new Request(url); r.timeoutInterval = timeoutS || 12; return await r.loadString(); }
      if (typeof fetch !== 'undefined') { const r = await fetch(url, { cache: 'no-store' }); return r.ok ? await r.text() : null; }
    } catch (_) { /* offline */ }
    return null;
  }
  async function getJSON(url) { const s = await getText(url); try { return s ? JSON.parse(s) : null; } catch (_) { return null; } }
  function feedUrl(feed) {
    const f = isObj(feed) && feed.ntfy && feed.topic ? feed : FEED_DEFAULT;
    return String(f.ntfy).replace(/\/$/, '') + '/' + encodeURIComponent(f.topic) + '/json?poll=1&since=70m';
  }
  async function load(opt) {
    const o = opt || {}, site = o.site || SITE, now = o.now || Date.now() / 1000;
    const feed = await getJSON(site + 'status_feed.json');
    const [nd, home, rw, kj] = await Promise.all([getText(feedUrl(feed)), getJSON(site + 'home.json'), getJSON(site + 'kalshi/rewards.json'), getJSON(site + 'kalshi.json')]);
    const m = pick(parseLite(nd), home, o.cached || null, now);
    return { m, kalshi: kalshiNext(now), kpaper: kalshiPaper(rw), kbal: kalshiBal(kj, now), now };
  }

  const API = { VERSION, SITE, FRESH_S, usd, goalText, coachNeed, ago, etHM, parseLite, fromLite, fromHome, pick, kalshiNext, kalshiPaper, kalshiBal, feedUrl, load, card };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root && typeof root === 'object') root.OLY_WIDGET = API;

  // ================================================================== Scriptable: draw the widget
  if (!IS_SCRIPTABLE) return;

  const dyn = (l, d) => (Color.dynamic ? Color.dynamic(new Color(l), new Color(d)) : new Color(d));
  const P = (() => {
    const force = String((typeof args !== 'undefined' && args.widgetParameter) || '').toLowerCase();
    const pickC = (l, d) => (/light/.test(force) ? new Color(l) : /dark/.test(force) ? new Color(d) : dyn(l, d));
    return {
      force,
      bg1: pickC('#f6f1e7', '#1a1611'), bg2: pickC('#ece3d2', '#0f0c09'),
      ink: pickC('#1d1914', '#f3ece0'), soft: pickC('#5a4f40', '#cfc4b2'), muted: pickC('#6f6453', '#a89c88'),
      gold: pickC('#8a6a1f', '#dcbd6e'), good: pickC('#4d6b1f', '#b6c17d'), bad: pickC('#a33f22', '#e08a6b'), warn: pickC('#8a5a00', '#e0b25a'),
      track: pickC('#ddd2bd', '#332b22'), goodFill: '#8d9a55', badFill: '#c96a4a', goldFill: '#c8a24a', trackHex: '#3a3228',
    };
  })();
  const fam = () => { const f = P.force.match(/small|medium|large|extralarge/); return f ? f[0] : (config.widgetFamily || 'large'); };
  const lvl = (l) => (l === 'good' ? P.good : l === 'bad' ? P.bad : P.warn);
  const money = (v) => (okN(v) && v < 0 ? P.bad : okN(v) && v > 0 ? P.good : P.soft);

  function txt(stack, s, size, color, opts) {
    const o = opts || {};
    const t = stack.addText(String(s));
    t.font = o.bold ? Font.boldRoundedSystemFont(size) : (o.mono ? Font.mediumMonospacedSystemFont(size) : (o.semi ? Font.semiboldRoundedSystemFont(size) : Font.regularRoundedSystemFont(size)));
    t.textColor = color;
    t.lineLimit = o.lines || 1;
    t.minimumScaleFactor = o.scale || 0.7;
    return t;
  }
  function bar(frac, w, h, fillHex) {                // a rounded progress bar image (DrawContext), safe for any frac
    const dc = new DrawContext();
    dc.size = new Size(w, h); dc.opaque = false; dc.respectScreenScale = true;
    const r = h / 2, track = new Path();
    track.addRoundedRect(new Rect(0, 0, w, h), r, r);
    dc.addPath(track); dc.setFillColor(new Color(P.trackHex, 0.85)); dc.fillPath();
    const f = okN(frac) ? Math.max(0, Math.min(1, frac)) : 0;
    if (f > 0) { const p = new Path(); p.addRoundedRect(new Rect(0, 0, Math.max(h, w * f), h), r, r); dc.addPath(p); dc.setFillColor(new Color(fillHex)); dc.fillPath(); }
    return dc.getImage();
  }
  function badge(stack, s, color) { const b = stack.addStack(); b.setPadding(1, 5, 1, 5); b.cornerRadius = 5; b.borderWidth = 1; b.borderColor = color; txt(b, s, 8, color, { semi: true }); return b; }
  function header(w, m, small) {
    const h = w.addStack(); h.centerAlignContent();
    txt(h, small ? 'OLYMPUS' : 'OLYMPUS · MONEY', small ? 11 : 12, P.gold, { bold: true });
    h.addSpacer();
    const dot = h.addText('●'); dot.font = Font.systemFont(small ? 9 : 10); dot.textColor = m ? lvl(m.pc.level) : P.bad;
    if (!small) { h.addSpacer(4); txt(h, m ? m.pc.label : 'No data yet', 10, P.soft, { semi: true }); }
  }
  function footer(w, d, small) {
    const f = w.addStack(); f.centerAlignContent();
    const m = d.m, srcTag = m ? (m.src === 'PC' ? (m.stale ? 'PC · OLD' : 'LIVE · PC') : m.src === 'SITE' ? 'PAPER · SITE' : 'CACHED') : 'OFFLINE';
    txt(f, srcTag + ' · ' + (m && m.t ? ago(d.now - m.t) : '—'), small ? 8 : 9, m && !m.stale ? P.muted : P.warn, { semi: true });
    f.addSpacer();
    const rd = new Date(d.now * 1000), hm = pad(rd.getHours()) + ':' + pad(rd.getMinutes());
    txt(f, (small ? '↻ ' : 'Updated ') + hm, small ? 8 : 9, P.muted);   // olympus2: a plain 'last updated' line (the phone's clock when the widget drew)
  }
  function acctRow(w, c, wide, big) {
    const r = w.addStack(); r.layoutVertically(); r.spacing = 2;
    const top = r.addStack(); top.centerAlignContent();
    txt(top, c.name, big ? 13 : 12, P.ink, { semi: true }); top.addSpacer(4); badge(top, c.badge, c.badge === 'LIVE' ? P.good : P.warn);
    top.addSpacer();
    txt(top, usd(c.balance), big ? 15 : 13, P.ink, { bold: true });
    const mid = r.addStack(); mid.centerAlignContent();
    txt(mid, 'today ' + usd(c.today, true), 10, money(c.today), { semi: true });
    mid.addSpacer(6);
    txt(mid, goalText(c), 10, P.gold, { semi: true });
    mid.addSpacer();
    txt(mid, 'room ' + usd(c.room), 10, c.room_frac != null && c.room_frac < 0.35 ? P.bad : P.soft);
    if (wide) {
      const b = r.addStack(); b.centerAlignContent();
      b.addImage(bar(c.progress, big ? 230 : 200, 5, P.goldFill)).imageSize = new Size(big ? 230 : 200, 5);
      b.addSpacer(); txt(b, c.progress != null ? Math.round(c.progress * 100) + '% ' + (c.funded ? 'to payout' : 'to pass') : '', 8, P.muted);
      if (big) {
        const rb = r.addStack(); rb.centerAlignContent();
        rb.addImage(bar(c.room_frac, 230, 3, c.room_frac != null && c.room_frac < 0.35 ? P.badFill : P.goodFill)).imageSize = new Size(230, 3);
        rb.addSpacer(); txt(rb, 'drawdown room ' + (c.room_frac != null ? Math.round(c.room_frac * 100) + '%' : '—'), 8, P.muted);
        if (c.window || c.waiting) txt(r, c.window || c.waiting, 9, P.muted, { lines: 1 });
      }
    }
  }
  // one compact line per account (when more accounts than rich rows fit): name + stage, today, goal, balance
  function acctLine(w, c, size) {
    const r = w.addStack(); r.centerAlignContent();
    const dot = r.addText('●'); dot.font = Font.systemFont(size - 3); dot.textColor = c.room_frac != null && c.room_frac < 0.35 ? P.bad : P.good;
    r.addSpacer(4);
    txt(r, c.name, size, P.ink, { semi: true }); r.addSpacer(4);
    txt(r, usd(c.today, true), size - 1, money(c.today), { semi: true });
    r.addSpacer();
    txt(r, goalText(c), size - 2, P.gold);
    r.addSpacer(6);
    txt(r, usd(c.balance), size, P.ink, { bold: true });
  }
  function kalshiLine(w, d, size) {
    const k = d.kalshi, kp = d.kpaper, kb = d.kbal, r = w.addStack(); r.centerAlignContent();
    txt(r, 'Kalshi', size, P.gold, { semi: true }); r.addSpacer(5);
    if (kb) { txt(r, '$' + kb.balance.toFixed(2), size, P.ink, { semi: true }); r.addSpacer(4); if (kb.today != null) { txt(r, usd(kb.today, true), size, money(kb.today)); r.addSpacer(5); } }
    txt(r, k ? 'next ' + k.text + (k.soon ? ' (' + Math.max(1, Math.round(k.in_s / 60)) + ' min)' : '') : 'no window this week', size, k && k.soon ? P.warn : P.soft);
    r.addSpacer();
    if (kp) txt(r, 'paper ' + usd(kp.net, true), size, money(kp.net));
  }

  function build(d) {
    const w = new ListWidget(), F = fam(), m = d.m;
    const g = new LinearGradient(); g.colors = [P.bg1, P.bg2]; g.locations = [0, 1]; g.startPoint = new Point(0, 0); g.endPoint = new Point(1, 1);
    w.backgroundGradient = g;
    w.url = SITE + (F === 'small' ? 'widget/glance.html' : 'business/goals.html');
    w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
    const accts = m ? m.accounts : [];
    if (F === 'small') {
      w.setPadding(12, 12, 10, 12);
      header(w, m, true); w.addSpacer(6);
      txt(w, 'today', 9, P.muted);
      txt(w, usd(m ? m.today : null, true), 24, money(m && m.today), { bold: true, scale: 0.5 });
      w.addSpacer(4);
      const a = accts[0];
      if (a) { txt(w, a.name, 10, P.soft, { semi: true }); txt(w, goalText(a), 11, P.gold, { semi: true }); }
      else txt(w, 'No account numbers yet', 10, P.soft, { lines: 2 });
      w.addSpacer();
      footer(w, d, true);
      return w;
    }
    const big = F === 'large' || F === 'extraLarge' || F === 'extralarge';
    w.setPadding(14, 14, 12, 14);
    header(w, m, false); w.addSpacer(big ? 8 : 6);
    const top = w.addStack(); top.centerAlignContent();
    const tl = top.addStack(); tl.layoutVertically();
    txt(tl, "today's $ · all accounts", 9, P.muted);
    txt(tl, usd(m ? m.today : null, true), big ? 26 : 20, money(m && m.today), { bold: true });
    top.addSpacer();
    if (big && m && m.price) { const tr = top.addStack(); tr.layoutVertically(); txt(tr, 'NQ', 9, P.muted); txt(tr, m.price.toFixed(2), 13, P.soft, { mono: true }); }
    w.addSpacer(big ? 8 : 4);
    const xl = F === 'extraLarge' || F === 'extralarge';
    const rich = big ? 3 : 2, max = xl ? 6 : big ? 5 : 4;
    if (!accts.length) txt(w, 'No account numbers yet: the PC has not posted and the site has none.', 11, P.soft, { lines: 2 });
    if (accts.length <= rich || xl) accts.slice(0, max).forEach((c, i) => { if (i) w.addSpacer(big ? 8 : 5); acctRow(w, c, true, big); });
    else accts.slice(0, max).forEach((c, i) => { if (i) w.addSpacer(big ? 6 : 3); acctLine(w, c, big ? 12 : 11); });   // every account, one line each
    if (accts.length > max) { w.addSpacer(2); txt(w, '+' + (accts.length - max) + ' more: tap to open', 9, P.muted); }
    w.addSpacer();
    if (big && m && m.pc.model) { txt(w, m.pc.model, 9, P.muted, { lines: 1 }); w.addSpacer(4); }
    kalshiLine(w, d, big ? 10 : 9);
    w.addSpacer(4);
    footer(w, d, false);
    return w;
  }

  // the last good copy (Scriptable's Documents folder), so a phone with no signal still shows numbers (marked CACHED + age)
  function cachePath() { const fm = FileManager.local(); return fm.joinPath(fm.documentsDirectory(), 'olympus-widget-cache.json'); }
  function readCache() { try { const fm = FileManager.local(), p = cachePath(); return fm.fileExists(p) ? JSON.parse(fm.readString(p)) : null; } catch (_) { return null; } }
  function writeCache(m) { try { if (m && m.src !== 'CACHED' && m.accounts.length) FileManager.local().writeString(cachePath(), JSON.stringify(m)); } catch (_) { /* full disk */ } }

  (async () => {
    const d = await load({ cached: readCache() });
    writeCache(d.m);
    const w = build(d);
    if (config.runsInWidget) Script.setWidget(w);
    else { const f = fam(); if (f === 'small') await w.presentSmall(); else if (f === 'medium') await w.presentMedium(); else await w.presentLarge(); }
    Script.complete();
  })();
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
