// PC feed (2026-11-12, docs/BOTS_BACK.md): the bots' status straight from the main PC, without GitHub.
// tools/pc_report.py on the PC posts a small live.json (kind "le-live", lite: true, < 4 KB: pc, pc_verdict, board.lit / atlas / blitz,
// accounts without trade lists, reporter) every 15 minutes to a public ntfy.sh topic named in status_feed.json next to the site's
// index.html. This file reads it. Its "t" is the bot's own heartbeat time, so an old report always looks old; "reporter.t" is when the
// PC last looked (reporter.server false = the PC is on but the bot server does not answer).
// Classic script (window.PC_FEED) and a CommonJS module for node tests (tests/test_bots_back.py). No DOM; fetch only in fetchLatest.
// Split (2026-11-18): the PC posts the CORE (kind "le-live": heartbeat t, verdict, cards, accounts) every run and the extras in
// "le-live-ext" posts just before it (x = brd, life, mf, board_trades, glance, kalshi_rewards, later learn / lab; part / of), every 2nd run or when
// their news changed. parseLatest lays the newest ext of each part (not older than EXT_MAX_S before the core) into the core where
// the core has none (glance -> pc.glance, board_trades -> board.trades), so every page sees the old single-post shape; an old single post comes back as it was.
// tools/pc_feed.py is the Python twin (tools/board.py).
//   parseLatest(ndjsonText)          -> the newest lite live.json in an ntfy /json?poll=1 answer (ext merged in), or null
//   merge(core, exts)                -> a copy of core with the ext blocks laid in
//   feedUrls(feed)                   -> the ntfy poll URLs for {ntfy, topic} (a 70-minute window = core + ext first, since=latest
//                                       = the core alone as the fallback, since=3h / 12h = the last real post when the PC is quiet)
//   fetchLatest({feedUrl, fetch})    -> Promise of the newest lite live.json or null (never throws)
//   mergeBoard(siteBoard, liteBoard) -> the site's board with the PC's fresher account cards laid in (map / health / progress /
//                                       trades of the site kept); the site's when it is newer. A CLOUD site board (where "cloud",
//                                       the cloud's own paper twin) never wins and only lends its calendar and backtest plan: no
//                                       balance, block, line, stage, sizing, position, map or week of the twin reaches a PC board
//   boardOver(siteBoard, lite, now)  -> mergeBoard + what only the whole post knows, on a PC board: map = the PC's price (bar_hm =
//                                       its time), progress.<bot>.week = this week's REAL trades (ext "at", else board.trades src
//                                       live; Zlarior = every Zlarior account, a signal counted once), accounts = the extra cards
//                                       (Zlarior 25K #2 ...: MissionUI shows them next to Zlarior and ATLAS)
//   toLive(lite, siteBoard)          -> what live.js may put in window.LIVE.j (board = boardOver, the rest as posted)
//   overlayHome(home, lite)          -> a copy of home.json with live.pc / pc_verdict / board taken from the lite feed when it is
//                                       newer: give it to OLYMPUS_TRUTH.canonHome (truth.js) and every app shows the PC's numbers
//   accountsOver(list, lite, board)  -> the site's accounts with the PC's laid in (its order and names, ATLAS from board.atlas, the
//                                       cloud's paper twin last; a twin never lends trades / days / stats / position / orders)
//   eval50(list) / payoutLines(...)  -> the real 50K in live.eval's keys / a funded card's payout coach line (business/payoutcoach.js)
//   homeOver(home, lite, now, coach) -> all of it on one home.json, for the apps that read home.json alone (home_feed.js)
(function (root) {
  'use strict';
  const FRESH_S = 20 * 60;
  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const okN = (v) => typeof v === 'number' && Number.isFinite(v);
  const T = (b) => (isObj(b) ? +b.data_t || +b.t || 0 : 0);

  const EXT_KIND = 'le-live-ext', EXT_MAX_S = 2 * 3600, NESTED = { glance: ['pc', 'glance'], board_trades: ['board', 'trades'] };
  const CORE_OWN = new Set(['v', 'kind', 'lite', 'src', 't', 'every_s', 'trimmed', 'pc', 'pc_verdict', 'reporter', 'board', 'accounts', 'host',
    'model_state', 'price', 'day_pnl', 'xt', 'ext_t']);
  const rtOf = (j) => +((isObj(j.reporter) && j.reporter.t) || j.rt || j.t) || 0;
  const copy = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

  function merge(core, exts) {
    if (!isObj(core)) return core;
    const out = copy(core), crt = rtOf(core), seen = new Set();
    let used = 0;
    const list = (Array.isArray(exts) ? exts : []).filter((e) => isObj(e) && e.kind === EXT_KIND && rtOf(e) > 0).sort((a, b) => rtOf(b) - rtOf(a));
    for (const e of list) {
      const et = rtOf(e), part = +e.part || 0;
      if ((crt && et < crt - EXT_MAX_S) || seen.has(part)) continue;
      seen.add(part);
      for (const [k, v] of Object.entries(isObj(e.x) ? e.x : {})) {
        if (NESTED[k]) {
          const [hk, kk] = NESTED[k];
          if (isObj(out[hk]) && out[hk][kk] == null) { out[hk][kk] = copy(v); used = Math.max(used, et); }
        } else if (!CORE_OWN.has(k) && out[k] == null) { out[k] = copy(v); used = Math.max(used, et); }
      }
    }
    if (used) out.ext_t = Math.round(used);
    return out;
  }

  // INTEGRITY (day-security 2026-11-20): anyone can post to the topic. Never a post dated > SKEW_S ahead; with status_feed.json "vk"
  // (tools/status_sign.py) only posts whose ,"sg":"..."} signs the exact text before it.
  const SKEW_S = 600, SIG_FIELD = ',"sg":"', SIG_RX = /^[A-Za-z0-9_-]{86}$/, VK_RX = /^[A-Za-z0-9_-]{87}$/;
  const tooNew = (j, m, now) => [j.t, j.rt, isObj(j.reporter) ? j.reporter.t : 0, isObj(j.brd) ? j.brd.t : 0, isObj(m) ? m.time : 0]
    .some((x) => okN(+x) && +x > now + SKEW_S);
  function splitSig(text) {
    const t = String(text || '');
    if (!t.endsWith('"}')) return null;
    const i = t.lastIndexOf(SIG_FIELD);
    if (i <= 0) return null;
    const sig = t.slice(i + SIG_FIELD.length, -2);
    return SIG_RX.test(sig) ? { orig: t.slice(0, i) + '}', sig } : null;
  }
  const unb64u = (s) => { const b = atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4)); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  const subtle = () => (typeof crypto !== 'undefined' && crypto.subtle) || null;
  const KEYS = new Map();
  const keyOf = (vk) => { if (!KEYS.has(vk)) KEYS.set(vk, subtle().importKey('raw', unb64u(vk), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])); return KEYS.get(vk); };
  async function verifyText(text, vk) {
    try {
      const sp = splitSig(text);
      if (!subtle() || !sp || !VK_RX.test(String(vk || ''))) return false;
      return await subtle().verify({ name: 'ECDSA', hash: 'SHA-256' }, await keyOf(vk), unb64u(sp.sig), new TextEncoder().encode('le-status-v1\n' + sp.orig));
    } catch (e) { return false; }
  }
  /** can this phone check signatures at all? (WebCrypto ECDSA P-256 + the key imports) */
  async function canVerify(vk) {
    try { if (!subtle() || !VK_RX.test(String(vk || ''))) return false; await keyOf(vk); return true; } catch (e) { KEYS.delete(vk); return false; }
  }
  // day-guard2: keys = vk + vks + this phone's trusted ones; a rotation post / 3 h with no trusted post -> pc_key_trust.js (lazy)
  const okVk = (k) => VK_RX.test(String(k || ''));
  const feedKeys = (f) => { let l = []; try { l = JSON.parse(localStorage.getItem('olympus.pc_vks') || '[]'); } catch (e) { /* none */ } return [...new Set([f && f.vk, ...((f && f.vks) || []), ...(f && f.vk && Array.isArray(l) ? l : [])].filter(okVk))]; };
  const ME = typeof document !== 'undefined' && document.currentScript ? document.currentScript.src : '';
  let CAND = null;
  const keyCandidate = () => CAND;
  async function keepSigned(text, vk) {
    let keys = (Array.isArray(vk) ? vk : [vk]).filter(okVk), last = 0;
    const t = String(text || ''), out = [];
    if (!keys.length || !(await canVerify(keys[0]))) return t;
    {
      const need = async () => typeof module !== 'undefined' && module.exports ? require('./pc_key_trust.js') : window.PC_KEY_TRUST || new Promise((ok) => {
        const e = document.createElement('script'); e.src = new URL('pc_key_trust.js', ME || document.baseURI).href; e.onload = e.onerror = () => ok(window.PC_KEY_TRUST); document.head.appendChild(e); });
      if (t.includes('le-key-rotate')) try { keys = await (await need()).chain(t, keys, verifyText); } catch (e) { /* the pinned keys */ }
      for (const line of t.split('\n')) {
        let m; try { m = JSON.parse(line); } catch (e) { continue; }
        if (isObj(m) && typeof m.message === 'string') for (const k of keys) if (await verifyText(m.message, k)) { out.push(line); last = Math.max(last, +m.time || 0); break; }
      }
      CAND = null;
      if (Date.now() / 1000 - last >= 10800) try { CAND = await (await need()).scan(t, keys, verifyText); } catch (e) { /* never breaks a page */ }
    }
    return out.join('\n');
  }

  function parseLatest(text, nowS) {
    let best = null, bestT = -1;
    const exts = [], now = okN(+nowS) ? +nowS : Date.now() / 1000;
    for (const line of String(text || '').split('\n')) {
      if (!line.trim()) continue;
      let m, j;
      try { m = JSON.parse(line); } catch (e) { continue; }
      if (!isObj(m) || (m.event && m.event !== 'message') || typeof m.message !== 'string') continue;
      try { j = JSON.parse(m.message); } catch (e) { continue; }
      if (isObj(j) && tooNew(j, m, now)) continue;
      if (isObj(j) && j.kind === EXT_KIND) { if (!j.rt && okN(+m.time)) j.rt = +m.time; exts.push(j); continue; }
      if (!isObj(j) || j.kind !== 'le-live' || !okN(+j.t) || +j.t <= 0) continue;
      const rt = +((isObj(j.reporter) && j.reporter.t) || m.time || j.t);
      if (rt >= bestT) { best = j; bestT = rt; }
    }
    return best ? merge(best, exts) : null;
  }

  function feedUrls(feed) {
    if (!isObj(feed) || !feed.topic || !/^[A-Za-z0-9_-]{1,64}$/.test(String(feed.topic))) return [];
    const base = String(feed.ntfy || 'https://ntfy.sh').replace(/\/+$/, '');
    if (!/^https:\/\//.test(base)) return [];
    const t = encodeURIComponent(feed.topic);
    // day-archive 2026-11-20: then 3 h, then 12 h (a quiet PC's 'latest' is often only an ext part: its last real post, with its age)
    return [`${base}/${t}/json?poll=1&since=70m`, `${base}/${t}/json?poll=1&since=latest`, `${base}/${t}/json?poll=1&since=3h`, `${base}/${t}/json?poll=1&since=12h`];
  }

  // ONE answer per page (night-feedsA 2026-11-18): 3-4 modules ask at load; they share one in-flight answer for SHARE_MS (own copies; a miss is never kept).
  const SHARE_MS = 20000, SHARED = typeof window !== 'undefined' && typeof document !== 'undefined' ? new Map() : null;
  function shared(key, make) {
    if (!SHARED) return make();
    const hit = SHARED.get(key);
    if (hit && Date.now() - hit.at < SHARE_MS) return hit.p;
    const p = Promise.resolve().then(make);
    SHARED.set(key, { at: Date.now(), p });
    p.then((v) => { if (v == null && SHARED.get(key) && SHARED.get(key).p === p) SHARED.delete(key); }, () => { if (SHARED.get(key) && SHARED.get(key).p === p) SHARED.delete(key); });
    return p;
  }
  const absUrl = (u) => { try { return new URL(u, document.baseURI).href; } catch (e) { return String(u); } };

  async function fetchLatest(opts) {
    const o = opts || {}, f = o.fetch || (typeof fetch !== 'undefined' ? fetch : null);
    if (!f) return null;
    let feed = o.feed || null;
    for (const u of feed ? [] : (o.feedUrl ? [o.feedUrl] : ['status_feed.json', '../status_feed.json'])) {
      try {
        const j = await shared('feed ' + (SHARED ? absUrl(u) : u), async () => { const r = await f(u, { cache: 'no-cache' }); return r && r.ok ? await r.json() : null; });
        if (j) { feed = j; break; }
      } catch (e) { /* next */ }
    }
    for (const u of feedUrls(feed)) {
      try {
        const j = await shared('poll ' + u, async () => { const r = await f(u, { cache: 'no-store' }); if (!r || !r.ok) return null; const t = await r.text(); const ks = feedKeys(feed); return parseLatest(ks.length ? await keepSigned(t, ks) : t); });
        if (j) return SHARED ? copy(j) : j;
      } catch (e) { /* next */ }
    }
    return null;
  }

  function mergeTrades(a, b) {
    const m = new Map();
    for (const t of [...(a || []), ...(b || [])]) if (isObj(t)) m.set(`${t.acct}|${t.entry_t || t.day}`, { ...(m.get(`${t.acct}|${t.entry_t || t.day}`) || {}), ...t });
    return [...m.values()].sort((x, y) => (+y.entry_t || 0) - (+x.entry_t || 0));
  }

  // A cloud board under a PC board (2026-11-18, night-feedsB). The site's board (home.json / data.json "board", where "cloud") is
  // built by the cloud from its OWN paper twin, on bars that stopped weeks ago: its balances, blocks ("ATLAS account is not set up",
  // "the PC has not reported yet"), lines, setup stage, sizing, open position, price map and week are about that twin, never about
  // the real accounts. Under a PC board, whatever the two times, it only lends the calendar (entry windows, ATLAS's members and
  // their hours) and the backtest plan of each bot (week goal, odds, $ a month expected); the PC's lines win even when empty.
  const isCloud = (b) => isObj(b) && b.where === 'cloud';
  const CAL_CARD = ['windows', 'max_micros', 'sessions', 'max_day', 'method', 'plan'];
  const CAL_MEMBER = ['key', 'short', 'label', 'hours', 'windows', 'window'];
  const PLAN_PROGRESS = ['sessions', 'sessions_max', 'min_days', 'odds', 'expected'];
  function pick(o, keys) { const x = {}; for (const k of keys) if (o[k] != null) x[k] = copy(o[k]); return x; }
  function overCloud(s, l) {
    const out = copy(l);
    for (const k of ['lit', 'atlas', 'blitz']) {
      const c = isObj(s[k]) ? s[k] : null, o = out[k];
      if (!c || !isObj(o)) continue;
      for (const f of CAL_CARD) if (o[f] == null && c[f] != null) o[f] = copy(c[f]);
      if (o.members == null && Array.isArray(c.members)) o.members = c.members.filter(isObj).map((m) => pick(m, CAL_MEMBER));
      // the next window's times when the cloud's calendar names the same window as the PC ("next entry window Thu 02:00-15:30 ET")
      const cw = isObj(c.window) ? c.window : null, ow = isObj(o.window) ? o.window : null;
      if (cw && ow && ow.open_t == null && !!ow.open === !!cw.open && String(ow.text || '').trim() === String(cw.text || '').trim().slice(0, 60)) {
        if (okN(+cw.open_t)) ow.open_t = +cw.open_t;
        if (okN(+cw.close_t)) ow.close_t = +cw.close_t;
      }
    }
    if (out.hidden_bots == null && s.hidden_bots != null) out.hidden_bots = copy(s.hidden_bots);
    out.lines = Array.isArray(l.lines) ? copy(l.lines) : [];
    if (isObj(s.progress)) {
      const p = {};
      for (const [k, v] of Object.entries(s.progress)) {
        if (!isObj(v)) continue;
        p[k] = pick(v, PLAN_PROGRESS);
        const w = isObj(v.week) ? v.week : null;
        if (w && okN(+w.lo) && okN(+w.hi)) p[k].goal = [+w.lo, +w.hi];
      }
      out.progress = p;
    }
    out.trades = mergeTrades((s.trades || []).filter((t) => isObj(t) && t.src === 'live'), l.trades);
    out.over_cloud = T(s) || 1;
    return out;
  }

  function mergeBoard(site, lite) {
    const s = isObj(site) && !site.error ? site : null, l = isObj(lite) && !lite.error ? lite : null;
    if (!l) return s || site || null;
    if (!s) return l;
    if (isCloud(s) && !isCloud(l)) return overCloud(s, l);      // night-feedsB: the cloud's board lends only its calendar to the PC's
    if (T(s) > T(l) && String(s.where || '').toLowerCase() !== 'cloud') return s;   // a CLOUD build's board is never newer news than the PC (its t = build time)
    const out = { ...s };
    for (const k of ['t', 'data_t', 'where', 'today', 'host', 'running', 'level']) if (l[k] != null) out[k] = l[k];
    for (const k of ['lit', 'atlas', 'blitz']) if (isObj(l[k])) out[k] = { ...(isObj(s[k]) ? s[k] : {}), ...l[k] };
    if (Array.isArray(l.lines)) out.lines = l.lines;            // the PC's newer lines win, an empty list too (= nothing wrong now)
    out.trades = mergeTrades(s.trades, l.trades);
    return out;
  }

  // ---- what only the whole post knows (night-feedsB): the price, this week's real trades per bot, the extra accounts --------------
  let ETF = null;
  function etParts(t) {
    try {
      ETF = ETF || new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
      const p = {};
      ETF.formatToParts(new Date(t * 1000)).forEach((x) => { p[x.type] = x.value; });
      return { day: `${p.year}-${p.month}-${p.day}`, hm: `${String(+p.hour % 24).padStart(2, '0')}:${p.minute}` };
    } catch (e) { const d = new Date(t * 1000).toISOString(); return { day: d.slice(0, 10), hm: d.slice(11, 16) }; }
  }
  const cmeDay = (t) => etParts(t + 6 * 3600).day;            // the CME session day: from 18:00 ET on, it is the next day
  const addDay = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const isZlarior = (id) => { const s = String(id || '').toLowerCase(); return !!s && s !== 'atlas' && !/blitz|acct_c|cloud|paper/.test(s); };
  // the real trades of one bot from the post: ext "at" (every real account's newest trades) else the board's last trades (src live)
  function realTrades(lite, bot) {
    const out = [], at = isObj(lite.at) && Array.isArray(lite.at.a) ? lite.at.a : null;
    if (at) {
      for (const a of at) {
        if (!isObj(a) || !(bot === 'atlas' ? a.id === 'atlas' : isZlarior(a.id))) continue;
        for (const r of Array.isArray(a.tr) ? a.tr : []) {
          if (!Array.isArray(r) || !okN(+r[0])) continue;
          out.push({ acct: a.id, entry_t: +r[0], open: r[1] == null, usd: okN(r[8]) ? r[8] : null, full: (a.tr || []).length >= 4 });
        }
      }
      return out;
    }
    for (const t of (isObj(lite.board) && Array.isArray(lite.board.trades) ? lite.board.trades : [])) {
      if (!isObj(t) || t.src !== 'live' || !okN(+t.entry_t) || (bot === 'atlas' ? t.acct !== 'atlas' : t.acct !== 'lit')) continue;
      out.push({ acct: t.acct, entry_t: +t.entry_t, open: !!t.open, usd: okN(t.usd) ? t.usd : null, full: true });
    }
    return out;
  }
  // this week (Mon-Fri of the CME day) for one bot, in the shape of the board's progress.week (statuscore "This week")
  function weekOf(lite, bot, goal, today, weekUsd) {
    const dow = new Date(today + 'T12:00:00Z').getUTCDay(), mon = addDay(today, -((dow + 6) % 7));
    const days = [0, 1, 2, 3, 4].map((i) => { const d = addDay(mon, i); return { day: d, wd: WD[new Date(d + 'T12:00:00Z').getUTCDay()], n: 0, usd: 0, future: d > today, today: d === today }; });
    const byAcct = {};
    let partial = false;
    for (const t of realTrades(lite, bot)) {
      const d = cmeDay(t.entry_t), row = days.find((x) => x.day === d);
      if (!row) { continue; }
      const k = t.acct + '|' + d;
      byAcct[k] = (byAcct[k] || 0) + 1;
      row.n = Math.max(row.n, byAcct[k]);                      // one LIT signal on two Zlarior accounts counts once
      if (!t.open && okN(t.usd)) row.usd = Math.round((row.usd + t.usd) * 100) / 100;
      if (t.full) partial = true;
    }
    const n = days.reduce((s, x) => s + x.n, 0), sum = Math.round(days.reduce((s, x) => s + x.usd, 0) * 100) / 100;
    const usd = okN(weekUsd) ? weekUsd : sum;
    const lo = goal ? goal[0] : null, hi = goal ? goal[1] : null, perDay = bot === 'atlas' ? 2 : 1;
    const left = days.filter((x) => x.day >= today).length;
    const status = hi != null && n > hi ? 'over' : lo == null || n >= lo || n + left * perDay >= lo ? 'on_pace' : 'behind';
    const name = bot === 'atlas' ? 'ATLAS' : 'Zlarior';
    const money = (v) => (v < 0 ? '-' : '') + '$' + Math.abs(Math.round(v)).toLocaleString('en-US');
    return { n, lo, hi, status, usd, days, src: 'pc', partial: partial || undefined,
      sentence: `${name}: ${n} real trade${n === 1 ? '' : 's'} this week (${money(usd)})${lo != null ? `, goal ${lo}-${hi}` : ''}.` };
  }
  const shortName = (n) => String(n || '').replace(/\s*\bBuilder\b\s*/i, ' ').replace(/\s+/g, ' ').trim();
  // an account the PC routes besides the board's two cards (the Zlarior 25K #2, a Rapid...) as a board-shaped card
  function extraCards(lite, b) {
    const L = b.lit || {}, out = [];
    for (const a of Array.isArray(lite.accounts) ? lite.accounts : []) {
      if (!isObj(a) || !a.id || a.id === 'atlas' || a.source === 'cloud' || /blitz|acct_c/i.test(a.id)) continue;
      const e = isObj(a.eval) ? a.eval : {}, p = isObj(a.pnl) ? a.pnl : {};
      if (a.id === 'mffu50k_eval' || (okN(e.balance) && e.balance === L.balance && e.floor === L.floor)) continue;   // the board's own Zlarior card
      out.push({ id: a.id, name: shortName(a.name) || a.id, plan: 'MFFU ' + String(a.plan || '').replace(/^MFFU\s*/, ''), method: 'LIT', badge: a.badge, source: 'PC bot',
        balance: e.balance, floor: e.floor, room: e.room, mll: e.mll, to_target: e.to_target, target_balance: e.target_balance, profit: e.profit,
        today_pnl: okN(p.today) ? p.today : e.today, week_pnl: p.week, status: e.status || 'open', session: e.session, dll: e.dll, dll_used: e.dll_used, extra: true });
    }
    return out;
  }
  // the board of a post, laid over the site's: a PC board over the cloud's gets the PC's price, its own week and its extra accounts
  function boardOver(siteBoard, lite, nowS) {
    if (!isObj(lite)) return siteBoard || null;
    let b = mergeBoard(siteBoard, lite.board);
    if (!isObj(b) || (b !== lite.board && !b.over_cloud)) return b;     // the site's own (newer) board, or an older PC copy under it
    if (b === lite.board) b = copy(b);
    const now = okN(+nowS) ? +nowS : Date.now() / 1000, t = +lite.t;
    // when the PC last posted (the ZEUS card's "PC reported X min ago"; the post comes every 15 min, so quiet means > 30 min)
    const rt = isObj(lite.reporter) && okN(+lite.reporter.t) ? +lite.reporter.t : null;
    if (rt) { b.report_t = rt; b.feed = 'ntfy'; }
    if (okN(+lite.price) && +lite.price > 0 && okN(t)) b.map = { price: +lite.price, t, bar_hm: etParts(t).hm, src: 'pc' };
    const today = /^\d{4}-\d{2}-\d{2}$/.test(String(b.today || '')) ? b.today : cmeDay(now);
    const P = isObj(b.progress) ? b.progress : (b.progress = {});
    const accts = Array.isArray(lite.accounts) ? lite.accounts : [];
    const zWeek = accts.filter((a) => isObj(a) && isZlarior(a.id) && a.source !== 'cloud' && isObj(a.pnl) && okN(a.pnl.week));
    const wk = { lit: zWeek.length ? Math.round(zWeek.reduce((s, a) => s + a.pnl.week, 0) * 100) / 100 : (isObj(b.lit) && okN(b.lit.week_pnl) ? b.lit.week_pnl : null),
      atlas: isObj(b.atlas) && okN(b.atlas.week_pnl) ? b.atlas.week_pnl : null };
    const DEF = { lit: [2, 4], atlas: [3, 4] };
    for (const k of ['lit', 'atlas']) {
      if (!isObj(b[k]) || (b[k].configured === false && !okN(b[k].balance))) continue;
      const g = isObj(P[k]) && Array.isArray(P[k].goal) ? P[k].goal : DEF[k];
      P[k] = { ...(isObj(P[k]) ? P[k] : {}), week: weekOf(lite, k, g, today, wk[k]) };
      if (k === 'atlas' && !okN(b.atlas.week_pnl)) b.atlas.week_pnl = P[k].week.usd;
    }
    const ex = extraCards(lite, b);
    for (const c of ex) {                                        // a Zlarior account trades the same LIT signal: Zlarior's window and wait
      if (!isObj(b.lit)) break;
      for (const f of ['window', 'windows', 'waiting']) if (c[f] == null && b.lit[f] != null) c[f] = copy(b.lit[f]);
    }
    if (ex.length) b.accounts = ex;
    // MFFU's 7-day inactivity clock: calendar days (New York) since the account's newest real trade in the post (Argus, Aegis read it)
    const at = isObj(lite.at) && Array.isArray(lite.at.a) ? lite.at.a : [], nowDay = etParts(now).day;
    const lastOf = (id) => { const a = at.find((x) => isObj(x) && x.id === id); const ts = (a && Array.isArray(a.tr) ? a.tr : []).map((r) => (Array.isArray(r) ? +r[0] : NaN)).filter(okN); return ts.length ? Math.max(...ts) : null; };
    for (const [card, id] of [[b.lit, at.some((x) => isObj(x) && x.id === 'mffu50k_eval') ? 'mffu50k_eval' : null], [b.atlas, 'atlas']].concat(ex.map((c) => [c, c.id]))) {
      const lt = id ? lastOf(id) : null;
      if (!isObj(card) || card.quiet_days != null || lt == null) continue;
      card.quiet_days = Math.max(0, Math.round((Date.parse(nowDay + 'T12:00:00Z') - Date.parse(etParts(lt).day + 'T12:00:00Z')) / 86400000));
      card.last_trade_day = etParts(lt).day;
    }
    return b;
  }

  function toLive(lite, siteBoard) {
    if (!isObj(lite)) return null;
    return { ...lite, board: boardOver(siteBoard, lite) };
  }

  // ---- the real accounts of a post over a site's account list (night-feedsB 2026-11-18) ---------------------------------------------
  // home.json / data.json "accounts" are the cloud's: its paper twin ($49,900) and a PAPER placeholder of the 50K. Over them: the PC's
  // accounts (in its order, with the names the ZEUS card uses), ATLAS from its board card (the PC sends it there), the cloud's twin last.
  // A cloud copy of a PC account never lends its trades, days, stats, position or orders (only the plan's session count).
  const r2 = (v) => Math.round(v * 100) / 100;
  // the PC's newest trades of one account (ext "at": [entry_t, exit_t, dir, qty, entry, stop, target, exit_kind, usd, r]) as account rows
  function atTradesOf(lite, id) {
    const a = (isObj(lite) && isObj(lite.at) && Array.isArray(lite.at.a) ? lite.at.a : []).find((x) => isObj(x) && x.id === id);
    return (a && Array.isArray(a.tr) ? a.tr : []).filter((r) => Array.isArray(r) && okN(+r[0]) && r[1] != null).map((r) => ({
      day: cmeDay(+r[0]), entry_t: +r[0], exit_t: +r[1], side: +r[2] === -1 ? 'SHORT' : 'LONG', qty: r[3], entry: r[4], stop: r[5],
      target: r[6], exit: r[7] || null, pnl: okN(r[8]) ? r[8] : null, r: okN(r[9]) ? r[9] : null, src: 'live' }));
  }
  function daysOfTrades(trades) {
    const m = new Map();
    for (const t of trades || []) if (isObj(t) && okN(t.pnl) && t.day) m.set(t.day, r2((m.get(t.day) || 0) + t.pnl));
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }
  function mergeRows(a, b) {
    const m = new Map();
    for (const t of [...(a || []), ...(b || [])]) if (isObj(t)) m.set(String(t.entry_t || t.time || '') + '|' + (t.day || ''), t);
    return [...m.values()].sort((x, y) => (+x.entry_t || 0) - (+y.entry_t || 0));
  }
  // ATLAS trades its own account: the PC sends it as board.atlas, not in "accounts"
  function atlasAccount(A, lite) {
    const start = okN(A.balance) && okN(A.profit) ? r2(A.balance - A.profit) : null, funded = /funded/i.test(String(A.status || A.plan || '')), tr = atTradesOf(lite, 'atlas');
    return { id: 'atlas', name: 'ATLAS', firm: 'MFFU', plan: String(A.plan || 'Builder 25K').replace(/^MFFU\s*/, ''), kind: funded ? 'funded' : 'eval', source: 'pc', badge: A.badge || 'LIVE',
      conn: { present: true, t: +lite.t || null, running: !!(isObj(lite.pc) && lite.pc.running), connected: true }, live: true, from_board: true,
      eval: { start_balance: start, balance: A.balance, profit: A.profit, to_target: A.to_target, target_balance: A.target_balance, floor: A.floor, room: A.room, mll: A.mll,
        dll: A.dll, dll_used: A.dll_used, today: A.today_pnl, session: A.session, status: A.status },
      pnl: { today: A.today_pnl, week: A.week_pnl, since_start: A.profit }, trades: tr, days: daysOfTrades(tr) };
  }
  function accountsOver(list, lite, board) {
    const L = (Array.isArray(list) ? list : []).slice();
    if (!isObj(lite)) return L;
    for (const a of Array.isArray(lite.accounts) ? lite.accounts : []) {
      if (!isObj(a) || !a.id) continue;
      const tr = atTradesOf(lite, a.id), i = L.findIndex((x) => isObj(x) && x.id === a.id);
      if (i < 0) { L.push({ ...copy(a), trades: tr, days: daysOfTrades(tr), live: true }); continue; }     // after the listed ones (the 50K stays first)
      const o = L[i];
      if ((+(isObj(a.conn) && a.conn.t) || 0) < (+(isObj(o.conn) && o.conn.t) || 0)) continue;
      const twin = o.badge !== 'LIVE', ot = twin ? [] : (o.trades || []), od = twin ? [] : (o.days || []);
      const T = mergeRows(ot, (a.trades || []).concat(tr));
      const ev = { ...(isObj(o.eval) && okN(o.eval.sessions) ? { sessions: o.eval.sessions } : {}), ...(isObj(a.eval) ? a.eval : {}) };
      L[i] = { ...o, ...a, eval: ev, trades: T, days: (a.days || []).length ? a.days : (od.length ? od : daysOfTrades(T)),
        position: a.position || (twin ? null : o.position), orders: a.orders || (twin ? null : o.orders), stats: a.stats || (twin ? null : o.stats), live: true };
    }
    const At = isObj(board) && isObj(board.atlas) ? board.atlas : null;
    if (At && At.configured !== false && okN(At.balance) && /LIVE|SIM/i.test(String(At.badge || '')) && !L.some((x) => isObj(x) && x.id === 'atlas' && !x.from_board)) {
      const i = L.findIndex((x) => isObj(x) && x.id === 'atlas'), acc = atlasAccount(At, lite);
      if (i < 0) L.push(acc); else L[i] = acc;
    }
    const rank = (a) => (!isObj(a) ? 3 : a.source === 'cloud' ? 2 : a.live ? 0 : 1);
    L.sort((a, b) => rank(a) - rank(b));
    for (let i = 0; i < L.length; i++) {             // the names the ZEUS card uses (the PC says "MFFU 50K Eval", "Zlarior Builder 25K #2")
      const a = L[i];
      if (isObj(a) && a.live && a.source === 'pc') L[i] = { ...a, name: a.id === 'mffu50k_eval' ? 'Zlarior 50K' : shortName(a.name || a.id) };
    }
    return L;
  }
  // MFFU'S OWN VIEW of an account (owner 2026-11-20: "our current balance for the funded account sims start at 0"; research/lit/
  // mffu_rules.json sim_funded.start_balance = 0, "balance shown as profit"). ONE place for every page (pulse, payoutcoach, Hera,
  // Ledger, Demeter, Board, NQ, widget, Jarvis): a SIM-FUNDED account shows balance = profit since it was funded (ATLAS $401, not
  // $25,401), its max-loss floor in the same terms (EOD trailing, -$1,000 on a 25K at the start, locks at +$100), and its payouts:
  // earliest = buffer + minimum request, GOAL = buffer + the full request (only 5 sim payouts before live, so each should be the max).
  // An EVAL keeps its normal balance ($25,000 / $50,000 start) and has no payout. Display only: nothing here sizes or trades.
  //   mffuView({ kind|stage|status, size|plan|name, balance, start|start_balance, floor?, room? })
  //   -> { funded, size, start, balance, profit, floor, mll, lock, earliest: { ask, at, need, ready }, goal: { ask, at, toYou, need, ready } } | null
  const MFFU = { '50K': { start: 50000, mll: 2000, lock: 100, buffer: 2100, min: 500, max: 2000, split: 0.8 },
    '25K': { start: 25000, mll: 1000, lock: 100, buffer: 1100, min: 250, max: 1000, split: 0.8 } };
  function mffuView(a) {
    if (!isObj(a)) return null;
    const N = (v) => (v == null || v === '' || !Number.isFinite(+v) ? null : +v);
    const txt = `${a.size || ''} ${a.plan || ''} ${a.name || ''} ${a.id || ''}`, st0 = N(a.start != null ? a.start : a.start_balance);
    const size = /50\s*k/i.test(txt) || st0 === 50000 ? '50K' : /25\s*k/i.test(txt) || st0 === 25000 ? '25K' : null, R = MFFU[size];
    if (!R) return null;
    const funded = /funded/i.test(`${a.kind || ''} ${a.stage || ''} ${a.status || ''}`), bal = N(a.balance), room = N(a.room), fl = N(a.floor);
    if (!funded) {
      const start = st0 != null && st0 > 0 ? st0 : R.start;
      return { funded: false, size, start, balance: bal, profit: bal == null ? null : bal - start, floor: fl != null ? fl : bal != null && room != null ? bal - room : null,
        mll: R.mll, lock: R.lock, earliest: null, goal: null };
    }
    // a funded balance still in eval terms (the PC reports 25,401 = 25,000 + profit) is shifted; one already in MFFU terms (401) is kept
    const shift = bal != null && bal > R.start / 2 ? (st0 != null && st0 > 0 ? st0 : R.start) : 0, b = bal == null ? null : Math.round((bal - shift) * 100) / 100;
    const floor = fl != null ? Math.round((fl - shift) * 100) / 100 : b != null && room != null ? Math.round((b - room) * 100) / 100 : -R.mll;
    const pay = (ask, toYou) => { const at = R.buffer + ask; return { ask, at, toYou, need: b == null ? null : Math.max(0, Math.ceil(at - b)), ready: b != null && b >= at }; };
    return { funded: true, size, start: 0, balance: b, profit: b, floor: Math.min(floor, R.lock), mll: R.mll, lock: R.lock,
      earliest: pay(R.min, Math.round(R.min * R.split)), goal: pay(R.max, Math.round(R.max * R.split)) };
  }
  // the real MFFU 50K of an account list (the PC's, live), in the cloud eval's keys (live.eval: balance, trailing_mll, cushion ...)
  function eval50(list, paper, t) {
    const a = (Array.isArray(list) ? list : []).find((x) => isObj(x) && x.live && x.source === 'pc' && x.id !== 'atlas' && isObj(x.eval) && okN(x.eval.balance)
      && (x.id === 'mffu50k_eval' || +x.eval.start_balance === 50000 || /50K/i.test(String(x.plan || ''))));
    if (!a) return null;
    const e = a.eval;
    return { balance: e.balance, profit: okN(e.profit) ? e.profit : e.balance - 50000, to_target: e.to_target, trailing_mll: okN(e.floor) ? e.floor : e.balance - e.room,
      cushion: e.room, start: isObj(paper) ? paper.start : undefined, real: true, t: okN(+t) ? +t : null, src: 'PC' };
  }
  // a funded account says what the ZEUS card says: the payout coach's "need $X more" as to_target, its sentence and status
  // (business/payoutcoach.js, given as coach; the state the way business/mffumodel.js builds it from the post's "mf" block). Without
  // the coach the number is left out (the PC's own payout line is another rule: no two numbers). Returns true when a coach was missing.
  function payoutLines(board, accounts, lite, coach, today) {
    if (!isObj(board)) return false;
    let missing = false;
    const mf = isObj(lite) && isObj(lite.mf) && Array.isArray(lite.mf.a) ? lite.mf.a : [];
    for (const [card, id] of [[board.atlas, 'atlas']].concat((Array.isArray(board.accounts) ? board.accounts : []).map((c) => [c, isObj(c) ? c.id : null]))) {
      if (!isObj(card) || !/funded/i.test(String(card.status || '')) || !okN(+card.balance)) continue;
      if (card.pc_to_target === undefined) card.pc_to_target = card.to_target == null ? null : card.to_target;
      let c = null;
      if (coach && typeof coach.coach === 'function') {
        const row = mf.find((r) => isObj(r) && r.id === id), f = row && isObj(row.f) ? row.f : null, n = (v) => (v != null && v !== '' && okN(+v) ? +v : null), bal = +card.balance;
        const st = { balance: bal, cycle_start_balance: f && n(f.cp) != null ? r2(bal - n(f.cp)) : null, best_day: f ? n(f.bd) : null, cycle_days: f ? n(f.cd) : null,
          payouts_n: f ? n(f.pn) : null, eligible_from: f && f.ef ? f.ef : null, room: n(card.room), first_at_min: !!(f && f.fm) };   // night-payfirst
        try { c = coach.coach(st, /50K/i.test(String(card.plan || '')) || +card.mll >= 2000 ? 'builder50k' : 'builder25k', today || etParts(Date.now() / 1000).day); } catch (e) { c = null; }
      }
      const acc = (Array.isArray(accounts) ? accounts : []).find((a) => isObj(a) && a.id === id);
      if (!c || !c.ok) { card.to_target = null; if (acc && isObj(acc.eval)) acc.eval.to_target = null; missing = true; continue; }
      card.to_target = c.need_more; card.payout_text = c.text; card.payout_status = c.status;
      if (acc && isObj(acc.eval)) { acc.eval.to_target = c.need_more; acc.eval.target_balance = r2(bal0(card) + c.need_more); acc.payout_text = c.text; }
    }
    return missing;
  }
  const bal0 = (c) => +c.balance;
  // home.json with the PC's post laid over it for an app that reads home.json alone (tools/web_public/home_feed.js): live.pc /
  // verdict / board (overlayHome), the accounts and the 50K eval (above), the price while fresh, the funded payout line. Never throws.
  function homeOver(home, lite, nowS, coach) {
    try {
      if (!isObj(home) || !isObj(lite) || !okN(+lite.t)) return home;
      const now = okN(+nowS) ? +nowS : Date.now() / 1000, h = overlayHome(home, lite, now);
      if (h === home || !isObj(h)) return home;
      const live = { ...h.live }, board = copy(h.board), accounts = accountsOver(home.accounts, lite, board);
      const paper = isObj(live.eval) && !live.eval.real ? live.eval : live.eval_paper, e = eval50(accounts, paper, lite.t);
      if (e) { if (paper) live.eval_paper = paper; live.eval = e; }
      if (okN(+lite.price) && now - lite.t < FRESH_S) live.price = +lite.price;
      payoutLines(board, accounts, lite, coach || root.PAYOUT_COACH || null, etParts(now).day);
      return { ...h, live, board, accounts, pc_feed: { t: +lite.t, report_t: rtOf(lite) || null } };
    } catch (e) { return home; }
  }

  function overlayHome(home, lite, nowS) {
    if (!isObj(home) || !isObj(lite) || !okN(+lite.t)) return home;
    const now = okN(+nowS) ? +nowS : Date.now() / 1000;
    const live = isObj(home.live) ? home.live : {}, pc0 = isObj(live.pc) ? live.pc : {};
    if (+lite.t < (+pc0.t || 0)) return home;
    const age = Math.max(0, now - lite.t);
    const pc = { ...pc0, ...(isObj(lite.pc) ? lite.pc : {}), present: true, t: +lite.t, age_s: Math.round(age), live: true };
    const nl = { ...live, pc };
    if (age < FRESH_S && isObj(lite.pc_verdict)) nl.pc_verdict = lite.pc_verdict;
    if (isObj(lite.reporter)) nl.reporter = lite.reporter;
    return { ...home, live: nl, board: boardOver(home.board, lite, now) };
  }

  const API = { FRESH_S, EXT_KIND, EXT_MAX_S, parseLatest, merge, feedUrls, fetchLatest, mergeBoard, boardOver, weekOf, cmeDay, toLive, overlayHome,
    atTradesOf, daysOfTrades, accountsOver, eval50, payoutLines, homeOver, verifyText, keepSigned, canVerify, splitSig, feedKeys, keyCandidate, SKEW_S, MFFU, mffuView };
  root.PC_FEED = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
