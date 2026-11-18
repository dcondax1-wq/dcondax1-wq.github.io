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
//                                       = the core alone as the fallback)
//   fetchLatest({feedUrl, fetch})    -> Promise of the newest lite live.json or null (never throws)
//   mergeBoard(siteBoard, liteBoard) -> the site's board with the PC's fresher account cards laid in (map / health / progress /
//                                       trades of the site kept); the site's when it is newer
//   toLive(lite, siteBoard)          -> what live.js may put in window.LIVE.j (board merged, the rest as posted)
//   overlayHome(home, lite)          -> a copy of home.json with live.pc / pc_verdict / board taken from the lite feed when it is
//                                       newer: give it to OLYMPUS_TRUTH.canonHome (truth.js) and every app shows the PC's numbers
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

  function parseLatest(text) {
    let best = null, bestT = -1;
    const exts = [];
    for (const line of String(text || '').split('\n')) {
      if (!line.trim()) continue;
      let m, j;
      try { m = JSON.parse(line); } catch (e) { continue; }
      if (!isObj(m) || (m.event && m.event !== 'message') || typeof m.message !== 'string') continue;
      try { j = JSON.parse(m.message); } catch (e) { continue; }
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
    return [`${base}/${t}/json?poll=1&since=70m`, `${base}/${t}/json?poll=1&since=latest`];
  }

  async function fetchLatest(opts) {
    const o = opts || {}, f = o.fetch || (typeof fetch !== 'undefined' ? fetch : null);
    if (!f) return null;
    let feed = o.feed || null;
    for (const u of feed ? [] : (o.feedUrl ? [o.feedUrl] : ['status_feed.json', '../status_feed.json'])) {
      try { const r = await f(u, { cache: 'no-cache' }); if (r && r.ok) { feed = await r.json(); break; } } catch (e) { /* next */ }
    }
    for (const u of feedUrls(feed)) {
      try {
        const r = await f(u, { cache: 'no-store' });
        if (!r || !r.ok) continue;
        const j = parseLatest(await r.text());
        if (j) return j;
      } catch (e) { /* next */ }
    }
    return null;
  }

  function mergeTrades(a, b) {
    const m = new Map();
    for (const t of [...(a || []), ...(b || [])]) if (isObj(t)) m.set(`${t.acct}|${t.entry_t || t.day}`, { ...(m.get(`${t.acct}|${t.entry_t || t.day}`) || {}), ...t });
    return [...m.values()].sort((x, y) => (+y.entry_t || 0) - (+x.entry_t || 0));
  }

  function mergeBoard(site, lite) {
    const s = isObj(site) && !site.error ? site : null, l = isObj(lite) && !lite.error ? lite : null;
    if (!l) return s || site || null;
    if (!s) return l;
    if (T(s) > T(l)) return s;
    const out = { ...s };
    for (const k of ['t', 'data_t', 'where', 'today', 'host', 'running', 'level']) if (l[k] != null) out[k] = l[k];
    for (const k of ['lit', 'atlas', 'blitz']) if (isObj(l[k])) out[k] = { ...(isObj(s[k]) ? s[k] : {}), ...l[k] };
    if (Array.isArray(l.lines) && l.lines.length) out.lines = l.lines;
    out.trades = mergeTrades(s.trades, l.trades);
    return out;
  }

  function toLive(lite, siteBoard) {
    if (!isObj(lite)) return null;
    return { ...lite, board: mergeBoard(siteBoard, lite.board) };
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
    return { ...home, live: nl, board: mergeBoard(home.board, lite.board) };
  }

  const API = { FRESH_S, EXT_KIND, EXT_MAX_S, parseLatest, merge, feedUrls, fetchLatest, mergeBoard, toLive, overlayHome };
  root.PC_FEED = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
