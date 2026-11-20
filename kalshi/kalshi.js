/* Kalshi page (tools/web_public/kalshi/, owner 2026-11-01). The Kalshi bot's numbers reach the phone as kalshi.json (contract:
   engine/kalshi_publish.py, docs/KALSHI_PUBLISH.md): this site's own copy (../kalshi.json, pc_publish), 404 = not connected yet.
   The old feed repo of the VM bot (kalshi-feed, on the suspended GitHub account) is retired (polish2 2026-11-19): never asked here
   (olympus/quiet-net.js answers it locally if an old copy of a page still names it). Kalshi runs on the PC now: its K8 live card and
   its paper tests come from the PC's status post (the ntfy topic of ../status_feed.json, below). Read-only: it never talks to Kalshi
   and places nothing.
   Contract v2 adds two optional lists, `strategies` [{name, mode, running, today_pnl, total_pnl, trades, wins, losses}] and
   `equity` [[unix, balance]] (the bot keeps 24 h of it); without `equity` the curve is the running sum of `days`.
   Sides: yes / no, or the bot's own UP / DOWN. Optional per row: `asset` (else read from the ticker) and `book` / `strategy`.
   Live prices: Kalshi's public API (api.elections.kalshi.com) answers browsers only from kalshi.com (CloudFront 403 for any
   other Origin, checked 2026-11-01), so prices are the bot's own, as of its last update.
   Look: kalshi.css, its own Kalshi theme (index.html sets data-theme="kalshi" before paint; never Jarvis's theme).
   Safari 16 safe: no regex lookbehind, no Array copy methods, no Object.groupBy, no AbortSignal.timeout. */
(() => {
  'use strict';
  // the feed: this site's own copy only (pc_publish puts it next to the pages); a 404 = not connected yet
  const LOCAL = new URL('../kalshi.json', location.href).href;
  // the setup link is this site's own SETUP.md (same origin); the old address stays as the fallback when the page is opened locally
  // {SITE_URL} is filled from this page's own address (location.origin), so the message follows the site wherever it is hosted
  const STEP0 = 'Open your kalshi-server chat in the Claude app and paste: Set up Jarvis for my Kalshi bot by following {SITE_URL}/kalshi/SETUP.md';
  const SITE = /^https?:$/.test(location.protocol) ? location.origin : '{SITE_URL}';
  const fillSite = (t) => t.split('{SITE_URL}').join(SITE);
  // the server script is pinned: the site build writes kit.json next to this page ({"v":1, "file":"kalshi_status_vm.py",
  // "sha256":"<64 hex>"}); with a valid hash the step carries it, else the step stays exactly STEP0
  let STEP = fillSite(STEP0);
  const pinned = (h) => `${fillSite(STEP0)} (only run kalshi_status_vm.py if its sha256 is ${h})`;
  const paste = () => STEP.slice(STEP.indexOf('paste: ') + 7);     // what goes into the bot's chat (the hash included)
  const TZ = 'America/New_York', STALE_S = 15 * 60, POLL_MS = 60e3, TICK_MS = 30e3, TIMEOUT_MS = 12e3, TR_PAGE = 10, TR_CAP = 40;
  const RANGES = [['1W', 7, 'past week'], ['1M', 30, 'past month'], ['3M', 90, 'past 3 months'], ['All', 0, '']];
  const SORTS = [['closes', 'Soonest'], ['pnl', 'Best'], ['pnl-asc', 'Worst'], ['value', 'Biggest'], ['name', 'A–Z']];
  const SIDES = ['all', 'yes', 'no'];
  const ASSETS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'HYPE', 'BNB', 'GOLD', 'SILVER'];

  // ------------------------------------------------------------------ helpers
  const $ = (s) => document.querySelector(s);
  const EVT = '<abbr title="expected value: what this bet is worth on average">EV</abbr>';   // plain words on hover / long-press
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v !== 'string' || !v.trim()) return null;
    const x = +v;
    return Number.isFinite(x) ? x : null;
  };
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const arr = (v) => (Array.isArray(v) ? v : []);
  const sum = (a) => a.reduce((s, x) => s + x, 0);
  const MINUS = '−';
  const sgn = (x, sign) => (x < 0 ? MINUS : sign && x > 0 ? '+' : '');
  const usd = (v, sign) => {                                   // real money: always to the cent
    const x = num(v);
    if (x == null) return '—';
    const r = +Math.abs(x).toFixed(2);
    return (r === 0 ? '' : sgn(x, sign)) + '$' + r.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const short = (a) => (a >= 1e6 ? +(a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M' : a >= 1e3 ? +(a / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k'
    : a >= 100 ? String(Math.round(a)) : a >= 10 ? a.toFixed(1) : a.toFixed(2));
  const cmp = (v, sign) => { const x = num(v); if (x == null) return ''; const a = Math.abs(x); return (a < 0.005 ? '' : sgn(x, sign)) + (a < 0.005 ? '0' : short(a)); };
  const pct = (x, sign) => (x == null || !Number.isFinite(x) ? '' : sgn(x, sign) + Math.abs(x * 100).toFixed(Math.abs(x) < 0.1 ? 1 : 0) + '%');
  const cls = (v) => { const x = num(v); return x == null || Math.abs(x) < 0.005 ? '' : x > 0 ? 'up' : 'down'; };
  const cents = (v) => {                                       // 0.42 -> 42¢, 0.9683 -> 96.8¢ (the favourites trade at 95-97¢)
    const x = num(v);
    if (x == null) return '—';
    const c = x <= 1 ? x * 100 : x;
    return (Math.abs(c - Math.round(c)) < 0.05 ? String(Math.round(c)) : c.toFixed(1)) + '¢';
  };
  const dol = (v) => { const x = num(v); return x == null ? null : x > 1 ? x / 100 : x; };     // contract: dollars 0-1 (cents if > 1)
  const fmtN = (x) => (Number.isInteger(x) ? x.toLocaleString('en-US') : String(+x.toFixed(2)));
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
  const by = (f, desc) => (a, b) => {
    const x = f(a), y = f(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return typeof x === 'string' ? (desc ? y.localeCompare(x) : x.localeCompare(y)) : desc ? y - x : x - y;
  };

  const nowS = () => Date.now() / 1000;
  const parseT = (v) => {                                    // unix s / ms / ISO text -> unix seconds
    if (v == null || v === '' || typeof v === 'boolean') return null;
    const x = num(v);
    if (x != null) return x > 1e12 ? x / 1000 : x;
    if (typeof v !== 'string') return null;
    const ms = Date.parse(v.trim().replace(/^(\d{4}-\d{2}-\d{2}) (\d)/, '$1T$2'));    // Safari wants the T
    return Number.isFinite(ms) ? ms / 1000 : null;
  };
  const ago = (t) => {
    const x = parseT(t);
    if (!x) return '';
    const s = Math.max(0, nowS() - x);
    return s < 90 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago';
  };
  const dtf = (o, tz) => { try { return new Intl.DateTimeFormat('en-US', Object.assign({ timeZone: tz || TZ }, o)); } catch (_) { return null; } };
  const F = {
    when: dtf({ month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
    full: dtf({ weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
    time: dtf({ hour: 'numeric', minute: '2-digit' }),
    md: dtf({ month: 'short', day: 'numeric' }),
    key: dtf({ year: 'numeric', month: '2-digit', day: '2-digit' }),
    dayL: dtf({ weekday: 'short', month: 'short', day: 'numeric' }, 'UTC'),
    mdU: dtf({ month: 'short', day: 'numeric' }, 'UTC'),
    mon: dtf({ month: 'long', year: 'numeric' }, 'UTC'),
  };
  const ff = (f, t) => { try { return f && t != null ? f.format(new Date(t * 1000)) : ''; } catch (_) { return ''; } };
  const when = (t) => ff(F.when, parseT(t));
  const dayKey = (t) => {                                    // unix seconds -> 'YYYY-MM-DD' in New York
    try {
      const p = {};
      F.key.formatToParts(new Date(t * 1000)).forEach((q) => { p[q.type] = q.value; });
      return p.year && p.month && p.day ? `${p.year}-${p.month}-${p.day}` : '';
    } catch (_) { return ''; }
  };
  const pd = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s == null ? '' : s).slice(0, 10)); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null; };
  const dayT = (s) => { const p = pd(s); return p ? Date.UTC(p.y, p.m - 1, p.d, 12) / 1000 : null; };   // a day as noon UTC (labels in UTC)
  const dayLabel = (s) => ff(F.dayL, dayT(s)) || String(s);
  const left = (t) => {
    const s = Math.round(t - nowS());
    if (s <= 0) return '';
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    return d >= 1 ? `${d}d ${h}h` : h >= 1 ? `${h}h ${m}m` : m >= 1 ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;      // under an hour it counts the seconds
  };
  const closesTxt = (t) => { const l = left(t); return l ? 'closes in ' + l : 'closed · settling'; };
  const cdnCls = (t) => { const s = t - nowS(); return s <= 0 ? ' past' : s < 3600 ? ' soon' : ''; };
  // the side as the bot means it: yes / no, or UP / DOWN (an "up or down" market's YES is UP)
  const sideOf = (r) => {
    const s = String(r.side == null ? '' : r.side).trim().toLowerCase().slice(0, 8);
    if ((s === 'yes' || s === 'no') && /\bup or down\b/i.test(String(r.title || ''))) return s === 'yes' ? 'up' : 'down';
    return s;
  };
  const sideKey = (s) => (s === 'yes' || s === 'up' ? 'yes' : s === 'no' || s === 'down' ? 'no' : '');
  const sideTag = (s) => `<span class="tag ${sideKey(s) || 'unk'}">${s ? esc(s.toUpperCase()) : '—'}</span>`;
  const assetOf = (r) => {
    const a = r.asset == null ? '' : String(r.asset).trim().toUpperCase().slice(0, 6);
    if (a) return a;
    const m = /^KX([A-Z]+)/.exec(String(r.ticker || ''));
    return m ? ASSETS.filter((x) => m[1].indexOf(x) === 0)[0] || '' : '';
  };

  // ---- asset badges (2026-11-04): each coin drawn as its own little SVG, no image files; an unknown asset gets a letter badge
  const ICONS = {
    BTC: ['#f7931a', '<path d="M9 7.5h4a2 2 0 0 1 0 4H9m0 0h4.4a2.1 2.1 0 0 1 0 4.2H9M9 7.5v8.2M11 6v1.5M13.4 6v1.5M11 15.8v1.7M13.4 15.8v1.7" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'],
    ETH: ['#4b7a99', '<path d="M12 4.6 7.2 12.2l4.8 2.8 4.8-2.8zM7.2 13.7 12 20.4l4.8-6.7-4.8 2.8z" fill="#fff" fill-opacity=".92"/>'],
    DOGE: ['#c9a227', '<path d="M8.4 7h3.3a5 5 0 0 1 0 10H8.4zM6.9 12h7" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'],
    XRP: ['#2b3a4a', '<path d="m6.8 7.4 5.2 4.6 5.2-4.6M6.8 16.6l5.2-4.6 5.2 4.6" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'],
    SOL: ['#6b5a8e', '<path d="M8.4 8h9.2M6.4 12h9.2M8.4 16h9.2" fill="none" stroke="#e0c27a" stroke-width="2" stroke-linecap="round"/>'],
    HYPE: ['#3d6b5c', '<path d="M8.2 7.5v9M15.8 7.5v9M8.2 12h7.6" fill="none" stroke="#f3ece0" stroke-width="2" stroke-linecap="round"/>'],
    BNB: ['#d8a516', '<path d="m12 6.2 1.9 1.9L12 10 10.1 8.1zM7.6 10.6l1.9 1.9-1.9 1.9-1.9-1.9zM16.4 10.6l1.9 1.9-1.9 1.9-1.9-1.9zM12 15l1.9 1.9L12 18.8l-1.9-1.9z" fill="#fff"/>'],
    GOLD: ['#b8891a', '<path d="M6.2 16.4h11.6l-1.5-4.2H7.7zM9.4 12.2l.9-3.2h3.4l.9 3.2" fill="none" stroke="#fff3c4" stroke-width="1.6" stroke-linejoin="round"/>'],
    SILVER: ['#7d8794', '<path d="M6.2 16.4h11.6l-1.5-4.2H7.7zM9.4 12.2l.9-3.2h3.4l.9 3.2" fill="none" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>'],
  };
  const CAT_ASSET = { Bitcoin: 'BTC', Ethereum: 'ETH', Dogecoin: 'DOGE', Solana: 'SOL', Gold: 'GOLD', Silver: 'SILVER' };
  const assetIcon = (a) => {
    a = String(a == null ? '' : a).trim().toUpperCase().slice(0, 6);
    if (!a) return '';
    const ic = ICONS[a] || ['#5a4d3a', `<text x="12" y="15.6" text-anchor="middle" font-size="10" font-weight="700" font-family="Georgia,serif" fill="#fff">${esc(a.charAt(0))}</text>`];
    return `<svg class="ai" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="11.2" fill="${ic[0]}"/><circle cx="12" cy="12" r="11.2" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1"/>${ic[1]}</svg>`;
  };
  const assetTag = (a) => (a ? `<span class="asset">${assetIcon(a)}${esc(a)}</span>` : '');
  // a seeded random stream (the Monte Carlo fan below): the same numbers always draw the same fan, so it never jitters between refreshes
  const rng32 = (a) => () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  // the 95% range a measured win rate really covers (Wilson): few bets = a wide range
  const wilson = (w, n) => {
    if (!(n > 0)) return [0, 1];
    const z = 1.96, p = w / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
    return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)];
  };

  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* private mode / storage full */ } },
  };
  function theme() {                                          // its own dashboard (owner 2026-11-02): always the Kalshi theme
    document.documentElement.setAttribute('data-theme', 'kalshi');
  }

  // ------------------------------------------------------------------ state
  const ui0 = LS.get('kalshi.ui', null), u = isObj(ui0) ? ui0 : {};
  const S = {
    k: null, raw: '', state: 'loading', busy: false, at: 0, label: '', intro: true,
    ui: {
      range: RANGES.some((r) => r[0] === u.range) ? u.range : '1M',
      sort: SORTS.some((r) => r[0] === u.sort) ? u.sort : 'closes',
      side: SIDES.indexOf(u.side) >= 0 ? u.side : 'all',
    },
    preview: false, jf: 'all', jn: '', q: '', kf: 0, calc: { p: '', c: '' }, trShown: TR_PAGE, cal: '', calSel: '', calGr: '', open: new Set(), scrub: false, pend: false, chart: null, series: null, v: null, pos: [], fresh: false, alerts: null,
    gpx: '', wi: '', sc: '', city: false, eqv: '', raceOff: new Set(), heatSel: '', bm: 'wr', bs: 1,
  };
  const saveUi = () => LS.set('kalshi.ui', S.ui);
  const cached = LS.get('kalshi.last', null);
  if (isObj(cached)) { S.k = cached; S.raw = JSON.stringify(cached); }

  // ------------------------------------------------------------------ the feed
  async function get(url, headers, ms) {
    let ac = null, tm = 0;
    try { ac = new AbortController(); tm = setTimeout(() => ac.abort(), ms || TIMEOUT_MS); } catch (_) { ac = null; }
    try { return await fetch(url, { cache: 'no-cache', headers: headers || {}, signal: ac ? ac.signal : undefined }); } catch (_) { return null; } finally { clearTimeout(tm); }
  }

  async function load() {
    if (S.busy) return;
    S.busy = true;
    busyUi();
    let j = null, st = 'error';
    const lr = await get(LOCAL + '?t=' + Math.floor(Date.now() / 60000));          // this site's own copy (pc_publish)
    let body = '';
    if (lr && lr.ok) { try { body = await lr.text(); const x = JSON.parse(body); if (isObj(x)) { j = x; st = 'ok'; } } catch (_) { j = null; } }
    // not published: a 404, or the site's own HTML page answering for a file it does not have = not connected yet; a broken file = an error
    if (st !== 'ok' && lr && (lr.status === 404 || (lr.ok && /^\s*</.test(body)))) st = 'waiting';
    S.busy = false;
    S.at = Date.now();
    busyUi();                                                // the spinner stops even when the drawing waits (render below)
    if (st === 'ok') {
      if (S.preview) { S.preview = false; S.raw = ''; }       // real data: the sample preview is over for good
      const raw = JSON.stringify(j), same = raw === S.raw && S.state === 'ok';
      S.k = j; S.raw = raw; S.state = 'ok'; S.fresh = !same;
      LS.set('kalshi.last', j);
      if (same) { busyUi(); tick(); return; }               // nothing new: keep the page as it is (open rows, scroll, typing)
    } else S.state = st;
    render();
  }

  // ------------------------------------------------------------------ the data, cleaned for display
  function norm(k) {
    const dm = new Map();
    arr(k.days).forEach((d) => {
      const r = Array.isArray(d) ? [d[0], d[1]] : isObj(d) ? [d.day || d.date, d.pnl] : null;
      if (!r) return;
      const key = String(r[0] == null ? '' : r[0]).slice(0, 10), x = num(r[1]);
      if (pd(key) && x != null) dm.set(key, x);
    });
    const em = new Map();
    arr(k.equity).forEach((p) => {
      const r = Array.isArray(p) ? [p[0], p[1]] : isObj(p) ? [p.t, p.balance != null ? p.balance : p.equity] : null;
      if (!r) return;
      const t = parseT(r[0]), x = num(r[1]);
      if (t != null && t > 1e9 && x != null) em.set(t, x);
    });
    return {
      pos: arr(k.positions).filter(isObj),
      tr: arr(k.trades).filter(isObj).sort(by((t) => parseT(t.t), true)),        // newest first
      days: Array.from(dm.entries()).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)),
      strat: arr(k.strategies).filter(isObj),
      eq: Array.from(em.entries()).sort((a, b) => a[0] - b[0]),
    };
  }

  const stateOf = (k) => {
    const t = parseT(k.t), age = t == null ? Infinity : nowS() - t;
    // An old snapshot cannot establish whether a bot is running, paused, or stopped now.
    if (age < -300 || age >= STALE_S) return ['warn', 'Not updating'];
    if (k.running === false) return /\bpaus/i.test(String(k.status == null ? '' : k.status)) ? ['warn', 'Paused'] : ['bad', 'Stopped'];
    return k.running === true ? ['ok', 'Running'] : ['warn', 'Status unverified'];
  };
  const safe = (name, fn) => {
    try { return fn(); } catch (e) {
      try { console.error('kalshi page: the ' + name + ' section failed', e); } catch (_) { /* no console */ }
      return `<section class="card"><p class="muted">The ${esc(name)} section could not be shown.</p></section>`;
    }
  };

  // the PC runs Kalshi now (K8 live card, K1 / rewards paper tests in its status post): the header says that instead of the old
  // kalshi-server's "Not connected yet" (phone QA 2026-11-19), with the age of the PC's numbers
  function pcKalshi() {
    const lv = KLV.j && KLV.j.st !== 'off' ? KLV.j : null, k1 = K1.j, rw = RW.src === 'pc' ? RW.j : null;   // all set up before the first render
    const tm = (j) => Date.parse((j && j.updated) || '') || 0;
    const src = lv ? { updated: lv.u } : !k1 ? rw : !rw ? k1 : tm(k1) >= tm(rw) ? k1 : rw;   // the newer of the two
    if (!src) return '';
    const age = rwAge(src);
    return (lv ? (lv.st === 'live' ? 'K8 LIVE on your PC' : 'K8 on your PC: ' + lv.st) : 'On your PC · real money paused') + ' · updated ' + age.s;
  }
  function subFix() { if (S.state === 'waiting' && !previewing()) { const e = $('#sub'); if (e) e.textContent = pcKalshi() || 'Not connected yet'; } }

  // ------------------------------------------------------------------ sections
  function subHtml() {
    if (previewing()) return '<span class="pill warn" id="pill">Preview</span><span class="ago">sample data, not your account</span>';
    if (S.state === 'waiting') return pcKalshi() || 'Not connected yet';
    const k = S.k;
    if (!k) return S.state === 'error' ? 'Could not reach the Kalshi feed' : 'Loading…';
    const [lvl, label] = stateOf(k), m = String(k.mode == null ? '' : k.mode).trim().toLowerCase().slice(0, 12), t = parseT(k.t);
    const mode = !m ? '' : m === 'live' ? '<span class="mode live" id="mode">LIVE <i>· real money</i></span>' : `<span class="mode" id="mode">${esc(m.toUpperCase())}</span>`;
    return `<span class="pill ${lvl}" id="pill">${esc(label)}</span>${mode}`
      + (t ? `<span class="ago" data-ago="${t}">updated ${esc(ago(t))}</span>` : '') + (S.state === 'error' ? '<span class="off">offline copy</span>' : '');
  }

  function notesHtml(k) {
    const t = parseT(k.t), age = t ? nowS() - t : Infinity;
    if (S.state === 'error') {
      return `<div class="note bad" role="status"><p><b>Offline copy</b> Can't reach the Kalshi feed${navigator.onLine === false ? ' (this phone is offline)' : ''}, so this is the last copy${t ? `, from ${esc(when(t))} (${esc(ago(t))})` : ''}.</p><button type="button" class="btn ghost" data-act="retry">Try again</button></div>`;
    }
    if (S.state === 'ok' && age > STALE_S) {
      return `<div class="note warn" role="status"><p><b>Not updating</b> The bot's last update came ${t ? esc(ago(t)) : 'a while ago'}; it normally sends one every minute. Its server may have stopped sending.</p></div>`;
    }
    return '';
  }

  // ---- Today: the money first (owner 2026-11-03 "balance, $ today / week / month, ROI"). Month = the bot's month_pnl when it
  // sends one, else the sum of `days` since the 1st (ET; the same basis as today / week). ROI = P&L on the money bet (the bot's
  // `stats`, else the settled trades in the list); never P&L on the balance (deposits make the start unknown).
  const FX = () => window.KFX || null;                       // kfx.js: the look (odometer, sparklines, section bar, themes)
  const monday = (key) => {
    const p = pd(key);
    if (!p) return '';
    const dw = (new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay() + 6) % 7;
    return new Date(Date.UTC(p.y, p.m - 1, p.d - dw)).toISOString().slice(0, 10);
  };
  function monthPnl(k, v) {
    const own = num(k.month_pnl);
    if (own != null) return own;
    const ym = (dayKey(nowS()) || '').slice(0, 7), ds = v.days.filter((d) => d[0].slice(0, 7) === ym);
    return ds.length ? Math.round(sum(ds.map((d) => d[1])) * 100) / 100 : null;
  }
  function roiOf(k, v) {
    const at = isObj(k.stats) ? k.stats : null, st = at ? num(at.staked) : null, p = at ? num(at.pnl) : null;
    if (st != null && st > 0 && p != null) return { x: p / st, sub: 'on ' + usd(st) + ' bet' };
    let ss = 0, sp = 0, n = 0;
    settled(v).forEach((t) => { const c = num(t.contracts), px = dol(t.price); if (c != null && px != null) { ss += Math.abs(c) * px; sp += num(t.pnl); n++; } });
    return ss > 0 ? { x: sp / ss, sub: `last ${n} ${n === 1 ? 'bet' : 'bets'}` } : null;
  }
  const cumul = (xs) => { let c = 0; return [0].concat(xs.map((x) => (c += x))); };
  function heroHtml(k, v) {
    const bal = num(k.balance), today = dayKey(nowS()), fx = FX();
    // today's wins / losses, as in the bot's own money text, when the trades list covers the whole day
    const tt = v.tr.filter((t) => { const x = parseT(t.t); return x && dayKey(x) === today; });
    const whole = v.tr.length < TR_CAP || v.tr.some((t) => { const x = parseT(t.t); return x && dayKey(x) < today; });
    const tw = tt.filter((t) => num(t.pnl) > 0.005).length, tl = tt.filter((t) => num(t.pnl) < -0.005).length;
    // all time: the strategies' own W / L totals; no % there (deposits and withdrawals make the start unknown)
    let aw = 0, al = 0, ok = false;
    v.strat.forEach((s) => { const w = num(s.wins), l = num(s.losses); if (w != null && l != null) { aw += w; al += l; ok = true; } });
    const sp = (vals) => (fx && vals.length > 2 ? fx.spark(vals, { cls: cls(vals[vals.length - 1] - vals[0]) }) : '');
    const kp = (id, lab, val, extra, withPct, spk) => {
      const x = num(val), base = bal != null && x != null ? bal - x : null, p = withPct && base && base > 0 ? pct(x / base, true) : '';
      return `<div class="kpi" data-k="${id}"><span class="lab">${lab}</span><strong class="fit ${cls(x)}" data-odo="${id}">${esc(usd(x, true))}</strong>`
        + `${[extra, p].filter(Boolean).map((t) => `<em>${esc(t)}</em>`).join('')}${spk || ''}</div>`;
    };
    // the sparklines (running sums): today's settled trades, this week's and this month's days; the balance's own curve
    const pnlToday = tt.slice().reverse().map((t) => num(t.pnl)).filter((x) => x != null);
    const mon = monday(today), wk = v.days.filter((d) => mon && d[0] >= mon && d[0] <= today).map((d) => d[1]);
    const mo = v.days.filter((d) => today && d[0].slice(0, 7) === today.slice(0, 7)).map((d) => d[1]);
    const s = series(v), eqVals = s ? thin(s.pts, 80).map((p) => p[1]) : [];
    const month = monthPnl(k, v), roi = roiOf(k, v);
    const pv = v.pos.map(posModel), pVal = sum(pv.map((m) => (m.value != null ? m.value : m.cost != null ? m.cost : 0))), evs = pv.filter((m) => m.ev != null);
    const roiTile = `<div class="kpi" data-k="roi"><span class="lab">ROI</span><strong class="fit ${roi ? cls(roi.x) : ''}" data-odo="roi">${roi ? esc(pct(roi.x, true)) : '—'}</strong>`
      + `<em>${esc(roi ? roi.sub : 'no settled bets yet')}</em></div>`;
    const openTile = `<div class="kpi" data-k="open"><span class="lab">Open bets</span><strong class="fit" data-odo="open">${esc(usd(pv.length ? pVal : 0))}</strong>`
      + `<em>${pv.length ? `${pv.length} ${pv.length === 1 ? 'bet' : 'bets'}${evs.length ? ' · ' + EVT + ' ' + esc(usd(sum(evs.map((m) => m.ev)), true)) : ''}` : 'none open'}</em></div>`;
    const balSp = fx && eqVals.length > 2 ? fx.spark(eqVals, { cls: cls(eqVals[eqVals.length - 1] - eqVals[0]), live: true }) : '';
    return `<section class="card hero" id="sec-kpi" data-tilt><div class="bal"><div><span class="lab">${esc(k.name ? String(k.name).slice(0, 40) : 'Balance')}${k.name ? ' · balance' : ''}</span>`
      + `<strong class="fit" data-odo="bal">${esc(usd(bal))}</strong></div>${balSp ? `<div class="bal-sp">${balSp}</div>` : ''}</div>`
      + `<div class="kpis">${kp('today', 'Today', k.today_pnl, whole && tw + tl ? `${tw}W ${tl}L` : '', true, sp(cumul(pnlToday)))}`
      + `${kp('week', 'Week', k.week_pnl, '', true, sp(cumul(wk)))}${kp('month', 'Month', month, '', true, sp(cumul(mo)))}`
      + `${kp('all', 'All time', k.total_pnl, ok && aw + al ? `${fmtN(aw)}W ${fmtN(al)}L` : '', false, '')}${roiTile}${openTile}</div>`
      + chipsHtml(v)
      + (k.status ? `<p class="status">${esc(k.status)}</p>` : '') + (k.note ? `<p class="muted">${esc(k.note)}</p>` : '')
      + '<div class="l3d"><a class="lnk3d" href="../tyche/#wheel"><i aria-hidden="true"></i><span>See it in 3D</span><b>Tyche ›</b></a>'
      + (S.city ? '<a class="lnk3d city" href="../kalshicity/"><i aria-hidden="true"></i><span>See it in 3D</span><b>Kalshi City ›</b></a>' : '') + '</div></section>';
  }
  // streak chips: the run of wins or losses now, the best run, the green days (from the recent list and the daily P&L)
  function chipsHtml(v) {
    const chip = (c, a, b) => `<span class="chip ${c}"><b>${esc(a)}</b>${esc(b)}</span>`, out = [];
    const pn = settled(v).map((t) => num(t.pnl));              // newest first
    let cur = 0, cs = 0;
    for (let i = 0; i < pn.length; i++) { const x = pn[i] > 0.005 ? 1 : pn[i] < -0.005 ? -1 : 0; if (!x) continue; if (!cs) cs = x; if (x !== cs) break; cur++; }
    if (cur) out.push(chip(cs > 0 ? 'up' : 'down', (cs > 0 ? 'W' : 'L') + cur, cs > 0 ? 'win streak' : 'loss streak'));
    let run = 0, best = 0;
    for (let i = pn.length - 1; i >= 0; i--) { if (pn[i] > 0.005) { run++; best = Math.max(best, run); } else if (pn[i] < -0.005) run = 0; }
    if (best > 1) out.push(chip('', 'W' + best, `best run of ${pn.length}`));
    if (v.days.length) {
      const dv = v.days.map((d) => d[1]), g = dv.filter((x) => x > 0.005).length;
      let ds = 0, dS = 0;
      for (let i = dv.length - 1; i >= 0; i--) { const x = dv[i] > 0.005 ? 1 : dv[i] < -0.005 ? -1 : 0; if (!x) continue; if (!dS) dS = x; if (x !== dS) break; ds++; }
      out.push(chip('', `${g}/${dv.length}`, 'green days'));
      if (ds) out.push(chip(dS > 0 ? 'up' : 'down', `${ds} ${dS > 0 ? 'green' : 'red'}`, ds === 1 ? 'day running' : 'days running'));
    }
    return out.length ? `<div class="chips" aria-label="Streaks">${out.join('')}</div>` : '';
  }

  // ---- equity curve: `equity` when published, else the running sum of the daily P&L
  const flatEq = (v) => v.eq.length >= 2 && Math.max.apply(null, v.eq.map((p) => p[1])) - Math.min.apply(null, v.eq.map((p) => p[1])) < 0.005;
  function series(v) {
    const both = v.eq.length >= 2 && v.days.length >= 3, want = S.eqv || (both && flatEq(v) ? 'days' : 'eq');     // a paused bot's flat 24 h: show the days
    if (v.eq.length >= 2 && !(both && want === 'days')) return { kind: 'eq', pts: v.eq, both };
    if (!v.days.length) return null;
    const f = pd(v.days[0][0]);
    const pts = [[Date.UTC(f.y, f.m - 1, f.d - 1, 12) / 1000, 0, null, '']];
    let c = 0;
    v.days.forEach((d) => { c = Math.round((c + d[1]) * 1e4) / 1e4; pts.push([dayT(d[0]), c, d[1], d[0]]); });
    return { kind: 'days', pts, both };
  }
  const spanOf = (s) => s.pts[s.pts.length - 1][0] - s.pts[0][0];
  const rangesOf = (s) => RANGES.filter((r) => !r[1] || r[1] * 86400 < spanOf(s) - 86400);
  function cut(s, key) {
    const r = RANGES.find((x) => x[0] === key);
    if (!r || !r[1]) return s.pts;
    const from = s.pts[s.pts.length - 1][0] - r[1] * 86400;
    let i = 0;
    while (i < s.pts.length && s.pts[i][0] < from) i++;
    return s.pts.slice(Math.min(Math.max(0, i - 1), s.pts.length - 2));   // one point before the range: the change is right
  }
  const thin = (p, n) => {
    if (p.length <= n) return p;
    const out = [], step = p.length / n;
    for (let i = 0; i < n; i++) out.push(p[Math.floor(i * step)]);
    out.push(p[p.length - 1]);
    return out;
  };
  const xLabel = (c, t) => (c.kind === 'days' ? ff(F.mdU, t) : c.dt <= 20 * 3600 ? ff(F.time, t) : c.dt <= 8 * 86400 ? ff(F.when, t) : ff(F.md, t));

  function eqHtml(v) {
    const s = series(v);
    S.series = s;
    S.chart = null;
    if (!s) return '<section class="card" id="sec-eq"><div class="card-h"><h2>Equity</h2></div><p class="empty">No history yet: the curve starts with the bot\'s first equity points or daily P&amp;L.</p></section>';
    const avail = rangesOf(s), key = avail.some((r) => r[0] === S.ui.range) ? S.ui.range : 'All', rl = RANGES.find((r) => r[0] === key);
    const pts = cut(s, key);
    const W = 1000, H = 300, PT = 18, PB = 18;
    const t0 = pts[0][0], dt = Math.max(1, pts[pts.length - 1][0] - t0);
    let lo = Infinity, hi = -Infinity;
    pts.forEach((p) => { if (p[1] < lo) lo = p[1]; if (p[1] > hi) hi = p[1]; });
    const flat = hi === lo, pad = flat ? Math.max(0.5, Math.abs(hi) * 0.02) : (hi - lo) * 0.04;
    const ylo = lo - pad, yhi = hi + pad;
    const X = (t) => ((t - t0) / dt) * W, Y = (x) => PT + (1 - (x - ylo) / (yhi - ylo)) * (H - PT - PB);
    const tp = thin(pts, 700), d = tp.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join('');
    // drawdown shading (2026-11-04): the red band between the running high and the curve = how far under its best the money was
    let pk = -Infinity, ddMax = 0;
    const peaks = tp.map((p) => { if (p[1] > pk) pk = p[1]; if (p[1] - pk < ddMax) ddMax = p[1] - pk; return pk; });
    const ddPath = ddMax < -0.005 ? 'M' + tp.map((p, i) => X(p[0]).toFixed(1) + ',' + Y(peaks[i]).toFixed(1)).join('L') + 'L' + tp.slice().reverse().map((p) => X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join('L') + 'Z' : '';
    const pkPath = ddPath ? 'M' + tp.map((p, i) => X(p[0]).toFixed(1) + ',' + Y(peaks[i]).toFixed(1)).join('L') : '';
    const first = pts[0][1], last = pts[pts.length - 1][1];
    const range = rl[2] || (dt <= 2 * 86400 ? `last ${Math.max(1, Math.round(dt / 3600))} h` : 'since ' + (s.kind === 'eq' ? ff(F.md, t0) : ff(F.mdU, t0)));
    const c = { kind: s.kind, pts, t0, dt, first, i: -1, range, xp: (t) => (X(t) / W) * 100, yp: (x) => (Y(x) / H) * 100 };
    S.chart = c;
    const chips = avail.length > 1 ? `<div class="seg" role="group" aria-label="Range">${avail.map((r) => `<button type="button" data-act="range" data-v="${r[0]}" aria-pressed="${r[0] === key}">${r[0]}</button>`).join('')}</div>` : '';
    const lab = s.kind === 'eq' ? 'Equity' : 'Cumulative P&amp;L', sg = s.kind === 'days';
    const sw = s.both ? `<div class="sw" role="group" aria-label="Curve">${[['eq', 'Live'], ['days', 'Daily']].map((r) => `<button type="button" data-act="eqv" data-v="${r[0]}" aria-pressed="${r[0] === s.kind}">${r[1]}</button>`).join('')}</div>` : '';
    const axes = flat ? `<span class="ax" style="top:${Y(hi) / H * 100}%">${esc(usd(hi, sg))}</span>`
      : `<span class="ax" style="top:${Y(hi) / H * 100}%">${esc(usd(hi, sg))}</span><span class="ax" style="top:${Y(lo) / H * 100}%">${esc(usd(lo, sg))}</span>`;
    return `<section class="card" id="sec-eq"><div class="card-h"><h2>${lab}</h2>${chips}${sw}</div>`
      + `<div class="eq-read" id="eqRead">${readHtml(-1)}</div>`
      + `<div class="chart" id="chart" tabindex="0" role="img" aria-label="${esc((s.kind === 'eq' ? 'Equity' : 'Cumulative P&L') + ', ' + range + ': from ' + usd(first) + ' to ' + usd(last) + '. Drag or use the arrow keys to read a point.')}">`
      + `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><defs><linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".34"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>`
      + (flat ? '' : `<line class="grid" x1="0" x2="${W}" y1="${Y(hi).toFixed(1)}" y2="${Y(hi).toFixed(1)}"/><line class="grid" x1="0" x2="${W}" y1="${Y(lo).toFixed(1)}" y2="${Y(lo).toFixed(1)}"/>`)
      + `<line class="base" x1="0" x2="${W}" y1="${Y(first).toFixed(1)}" y2="${Y(first).toFixed(1)}"/>`
      + (ddPath ? `<path class="dd" d="${ddPath}"/><path class="pk" d="${pkPath}"/>` : '')
      + `<path class="area" d="${d}L${W},${H}L0,${H}Z" fill="url(#eqFill)"/><path class="ln" d="${d}"/></svg>`
      + `${axes}<i class="cross" hidden></i><i class="dot" hidden></i></div>`
      + `<div class="xs"><span>${esc(xLabel(c, t0))}</span><span>${esc(xLabel(c, pts[pts.length - 1][0]))}</span></div>`
      + (s.kind === 'days' ? `<p class="muted small">${s.both ? 'The daily P&amp;L added up day by day (the bot\'s live 24 h curve is under Live).' : 'From the daily P&amp;L: no equity points from the bot yet.'}</p>` : '')
      + (ddPath ? `<p class="muted small ddn"><i class="ddk" aria-hidden="true"></i>Red = under its previous high. Deepest dip ${esc(usd(ddMax, true))}.</p>` : '')
      + '</section>';
  }

  function readHtml(i) {
    const c = S.chart;
    if (!c) return '';
    const idle = i < 0, p = c.pts[idle ? c.pts.length - 1 : i], chg = p[1] - c.first, base = Math.abs(c.first);
    if (c.kind === 'eq') {
      return `<b>${esc(usd(p[1]))}</b><span class="${cls(chg)}">${esc(usd(chg, true))}${base > 0 ? ' (' + esc(pct(chg / base, true)) + ')' : ''}</span>`
        + `<span class="when">${esc(idle ? c.range : ff(F.when, p[0]))}</span>`;
    }
    if (idle) return `<b class="${cls(chg)}">${esc(usd(chg, true))}</b><span class="when">${esc(c.range)}</span>`;
    return `<b class="${cls(p[1])}">${esc(usd(p[1], true))}</b>${p[3] ? `<span class="${cls(p[2])}">day ${esc(usd(p[2], true))}</span><span class="when">${esc(dayLabel(p[3]))}</span>` : '<span class="when">start</span>'}`;
  }

  function bindChart() {
    const el = $('#chart'), c = S.chart;
    if (!el || !c) return;
    const cross = el.querySelector('.cross'), dot = el.querySelector('.dot'), read = $('#eqRead');
    const show = (i) => {
      c.i = i;
      const p = c.pts[i], x = c.xp(p[0]);
      cross.style.left = x + '%'; dot.style.left = x + '%'; dot.style.top = c.yp(p[1]) + '%';
      cross.hidden = false; dot.hidden = false;
      if (read) read.innerHTML = readHtml(i);
    };
    const hide = () => { c.i = -1; cross.hidden = true; dot.hidden = true; if (read) read.innerHTML = readHtml(-1); };
    const at = (cx) => {
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      const t = c.t0 + Math.min(1, Math.max(0, (cx - r.left) / r.width)) * c.dt;
      let lo = 0, hi = c.pts.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c.pts[m][0] < t) lo = m; else hi = m; }
      show(Math.abs(c.pts[lo][0] - t) <= Math.abs(c.pts[hi][0] - t) ? lo : hi);
    };
    const end = () => { S.scrub = false; hide(); if (S.pend) { S.pend = false; render(); } };
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') { S.scrub = true; try { el.setPointerCapture(e.pointerId); } catch (_) { /* not capturable */ } }
      at(e.clientX);
    });
    el.addEventListener('pointermove', (e) => { if (S.scrub || e.pointerType === 'mouse') at(e.clientX); });
    el.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') end(); });
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') end(); });
    el.addEventListener('blur', () => { if (!S.scrub) hide(); });
    el.addEventListener('keydown', (e) => {
      const n = c.pts.length;
      let i = c.i < 0 ? n - 1 : c.i;
      if (e.key === 'ArrowLeft') i -= 1; else if (e.key === 'ArrowRight') i += 1; else if (e.key === 'Home') i = 0; else if (e.key === 'End') i = n - 1;
      else if (e.key === 'Escape') { hide(); return; } else return;
      e.preventDefault();
      show(Math.max(0, Math.min(n - 1, i)));
    });
  }

  // ---- daily P&L: bars (last 30 days) and the calendar heat map
  function barsHtml(v) {
    const d = v.days.slice(-30);
    if (!d.length) return '<section class="card" id="sec-days"><div class="card-h"><h2>Daily P&amp;L</h2></div><p class="empty">No daily P&amp;L yet.</p></section>';
    const m = Math.max.apply(null, d.map((x) => Math.abs(x[1]))) || 1, w = 300, h = 64, mid = h / 2, slot = w / Math.max(d.length, 14), off = w - slot * d.length;
    const rects = d.map((x, i) => {
      const val = x[1], bh = Math.max(1, (Math.abs(val) / m) * (mid - 3));
      return `<rect x="${(off + i * slot + 1).toFixed(1)}" y="${(val >= 0 ? mid - bh : mid).toFixed(1)}" width="${Math.max(1, slot - 2).toFixed(1)}" height="${bh.toFixed(1)}" fill="${val >= 0 ? 'var(--ok)' : 'var(--bad)'}"><title>${esc(dayLabel(x[0]))}: ${esc(usd(val, true))}</title></rect>`;
    }).join('');
    const tot = sum(d.map((x) => x[1]));
    return `<section class="card" id="sec-days"><div class="card-h"><h2>Daily P&amp;L · ${d.length} ${d.length === 1 ? 'day' : 'days'}</h2><span class="r ${cls(tot)}">${esc(usd(tot, true))}</span></div>`
      + `<svg class="bars" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Daily P&amp;L, last ${d.length} days"><line class="mid" x1="0" x2="${w}" y1="${mid}" y2="${mid}"/>${rects}</svg></section>`;
  }

  const ymAdd = (ym, n) => { const y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n, yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12; return `${yy}-${String(mm + 1).padStart(2, '0')}`; };
  function calHtml(v) {
    if (!v.days.length) return '';
    const map = new Map(v.days), today = dayKey(nowS()) || v.days[v.days.length - 1][0];
    const firstM = v.days[0][0].slice(0, 7), lastM = v.days[v.days.length - 1][0].slice(0, 7), maxM = today.slice(0, 7) > lastM ? today.slice(0, 7) : lastM;
    if (!S.cal || S.cal < firstM || S.cal > maxM) S.cal = lastM;
    const y = +S.cal.slice(0, 4), m = +S.cal.slice(5, 7);
    const dow = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7, nd = new Date(Date.UTC(y, m, 0)).getUTCDate();   // Monday first, as the bot's weeks
    const key = (d) => `${S.cal}-${String(d).padStart(2, '0')}`;
    let mx = 0, tot = 0, g = 0, r = 0, n = 0;
    for (let d = 1; d <= nd; d++) {
      const x = map.get(key(d));
      if (x != null) { mx = Math.max(mx, Math.abs(x)); tot += x; n++; if (x > 0.005) g++; else if (x < -0.005) r++; }
    }
    const cells = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((c) => `<span class="wd" aria-hidden="true">${c}</span>`);
    cells.push('<span class="wd wk" title="Week total">WK</span>');
    for (let w = 0; w < Math.ceil((dow + nd) / 7); w++) {
      let wt = 0, wn = 0;
      for (let c = 0; c < 7; c++) {
        const d = w * 7 + c - dow + 1;
        if (d < 1 || d > nd) { cells.push('<span class="cd x" aria-hidden="true"></span>'); continue; }
        const k = key(d), x = map.get(k);
        if (x != null) { wt += x; wn++; }
        const lv = x == null ? (k > today ? 'f' : 'e') : Math.abs(x) < 0.005 ? 'z' : (x > 0 ? 'p' : 'n') + Math.max(1, Math.min(4, Math.ceil((Math.abs(x) / (mx || 1)) * 4)));
        cells.push(`<button type="button" class="cd ${lv}${k === today ? ' today' : ''}" data-act="day" data-v="${k}" aria-pressed="${S.calSel === k}" aria-label="${esc(dayLabel(k) + ': ' + (x == null ? 'no P&L' : usd(x, true)))}"><i>${d}</i><em>${x == null ? '' : esc(cmp(x, true))}</em></button>`);
      }
      cells.push(`<span class="cw ${wn ? cls(wt) : ''}">${wn ? esc(cmp(wt, true)) : ''}</span>`);
    }
    const prev = ymAdd(S.cal, -1), next = ymAdd(S.cal, 1), mon = ff(F.mon, Date.UTC(y, m - 1, 15) / 1000);
    S.calGr = n ? `${n} ${n === 1 ? 'day' : 'days'} this month: ${g} green, ${r} red` : 'No P&amp;L this month';
    return `<section class="card" id="sec-cal"><div class="card-h"><h2>P&amp;L calendar</h2><span class="r ${cls(tot)}">${n ? esc(usd(tot, true)) : ''}</span></div>`
      + `<div class="cal-h"><button type="button" class="nav" data-act="month" data-v="${prev}" aria-label="Previous month"${prev < firstM ? ' disabled' : ''}>‹</button>`
      + `<b id="calMonth">${esc(mon)}</b><button type="button" class="nav" data-act="month" data-v="${next}" aria-label="Next month"${next > maxM ? ' disabled' : ''}>›</button></div>`
      + `<div class="cal" role="group" aria-label="${esc('Daily P&L, ' + mon)}">${cells.join('')}</div>`
      + `<p class="muted cal-read" id="calRead" aria-live="polite">${calRead(map)}</p></section>`;
  }
  function calRead(map) {
    const k = S.calSel;
    if (!k) return `${S.calGr}. Tap a day for its P&amp;L.`;
    const x = map.get(k), tr = S.v ? S.v.tr.filter((t) => { const tt = parseT(t.t); return tt && dayKey(tt) === k; }) : [];
    // its week (Monday to Sunday, as the bot's): on a phone the calendar has no week column, so the total is here
    const p = pd(k), dw = (new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay() + 6) % 7;
    let wk = 0, wn = 0;
    for (let i = 0; i < 7; i++) { const x2 = map.get(new Date(Date.UTC(p.y, p.m - 1, p.d - dw + i)).toISOString().slice(0, 10)); if (x2 != null) { wk += x2; wn++; } }
    return `<b>${esc(dayLabel(k))}</b> · ${x == null ? 'no P&amp;L' : `<span class="${cls(x)}">${esc(usd(x, true))}</span>`}`
      + (wn ? ` · its week <span class="${cls(wk)}">${esc(usd(wk, true))}</span>` : '') + (tr.length ? ` · ${tr.length} ${tr.length === 1 ? 'trade' : 'trades'} in the recent list` : '');
  }

  // ---- stats
  function statsHtml(v, k) {
    const pn = v.tr.map((t) => num(t.pnl)).filter((x) => x != null);
    const wins = pn.filter((x) => x > 0.005), losses = pn.filter((x) => x < -0.005);
    const tile = (lab, vals, sub, extra) => `<div class="stat"><span class="lab">${lab}</span>${vals}${sub ? `<em>${sub}</em>` : ''}${extra || ''}</div>`;
    const one = (h) => `<strong class="fit">${h}</strong>`;
    const two = (a, la, b, lb) => `<strong class="fit"><span class="${cls(a)}">${esc(usd(a, true))}</span>${la ? `<small>${esc(la)}</small>` : ''}</strong>`
      + `<strong class="fit"><span class="${cls(b)}">${esc(usd(b, true))}</span>${lb ? `<small>${esc(lb)}</small>` : ''}</strong>`;
    const tiles = [];
    if (pn.length) {
      const nd = wins.length + losses.length, wr = nd ? wins.length / nd : null;
      const aw = wins.length ? sum(wins) / wins.length : null, al = losses.length ? sum(losses) / losses.length : null;
      const gw = sum(wins), gl = -sum(losses);
      let cur = 0, curS = 0;
      for (let i = 0; i < pn.length; i++) { const s = pn[i] > 0.005 ? 1 : pn[i] < -0.005 ? -1 : 0; if (!s) continue; if (!curS) curS = s; if (s !== curS) break; cur++; }
      let run = 0, best = 0;
      for (let i = pn.length - 1; i >= 0; i--) { if (pn[i] > 0.005) { run++; best = Math.max(best, run); } else if (pn[i] < -0.005) run = 0; }
      tiles.push(tile('Win rate', one(wr == null ? '—' : esc(pct(wr))), `${wins.length}W · ${losses.length}L`,
        nd ? `<div class="wl" aria-hidden="true"><i style="width:${(wr * 100).toFixed(1)}%"></i><b style="width:${(100 - wr * 100).toFixed(1)}%"></b></div>` : ''));
      tiles.push(tile('Profit factor', one(gl > 0 ? (gw / gl).toFixed(2) : gw > 0 ? '∞' : '—'), `${esc(usd(gw - gl, true))} net`));
      tiles.push(tile('Avg win / loss', two(aw, 'win', al, 'loss'), aw != null && al ? `payoff ${(aw / -al).toFixed(2)}×` : ''));
      tiles.push(tile('Best / worst', two(Math.max.apply(null, pn), 'best', Math.min.apply(null, pn), 'worst'), ''));
      tiles.push(tile('Streak', one(cur ? `<span class="${curS > 0 ? 'up' : 'down'}">${cur} ${curS > 0 ? (cur === 1 ? 'win' : 'wins') : cur === 1 ? 'loss' : 'losses'}</span>` : '—'),
        best ? `best run ${best} ${best === 1 ? 'win' : 'wins'}` : 'no wins yet'));
    }
    if (v.days.length) {
      const dv = v.days.map((d) => d[1]), g = dv.filter((x) => x > 0.005).length;
      let bi = 0, wi = 0;
      dv.forEach((x, i) => { if (x > dv[bi]) bi = i; if (x < dv[wi]) wi = i; });
      let ds = 0, dS = 0;
      for (let i = dv.length - 1; i >= 0; i--) { const s = dv[i] > 0.005 ? 1 : dv[i] < -0.005 ? -1 : 0; if (!s) continue; if (!dS) dS = s; if (s !== dS) break; ds++; }
      tiles.push(tile('Green days', one(`${g} / ${dv.length}`), `${esc(pct(g / dv.length))}${ds ? ` · now ${ds} ${dS > 0 ? 'green' : 'red'}` : ''}`));
      tiles.push(tile('Best / worst day', two(dv[bi], ff(F.mdU, dayT(v.days[bi][0])), dv[wi], ff(F.mdU, dayT(v.days[wi][0]))), ''));
    }
    const at = k && isObj(k.stats) ? k.stats : null, aw = at ? num(at.wins) : null, al = at ? num(at.losses) : null, ast = at ? num(at.staked) : null, ap = at ? num(at.pnl) : null;
    if (aw != null && al != null && aw + al > 0) {
      tiles.push(tile('All-time win', one(esc(pct(aw / (aw + al)))), `${esc(fmtN(aw))}W · ${esc(fmtN(al))}L${num(at.avg_price) != null ? ' · avg ' + esc(cents(at.avg_price)) : ''}`));
    }
    if (ast != null && ast > 0 && ap != null) tiles.push(tile('All-time ROI', one(`<span class="${cls(ap)}">${esc(pct(ap / ast, true))}</span>`), `${esc(usd(ap, true))} on ${esc(usd(ast))} bet`));
    const s = S.series;
    if (s) {
      let peak = -Infinity, dd = 0, at = 0;
      s.pts.forEach((p) => { if (p[1] > peak) peak = p[1]; if (p[1] - peak < dd) { dd = p[1] - peak; at = peak; } });
      tiles.push(tile(s.kind === 'eq' ? 'Max drawdown' : 'Max drawdown', one(dd < -0.005 ? `<span class="down">${esc(usd(dd, true))}</span>` : esc(usd(0))),
        dd < -0.005 ? (s.kind === 'eq' && at > 0 ? esc(pct(dd / at, true)) + ' from peak' : 'from daily P&amp;L') : 'none so far'));
    }
    const head = `<div class="card-h"><h2>Stats</h2>${pn.length ? `<span class="r muted">last ${pn.length} closed ${pn.length === 1 ? 'trade' : 'trades'}</span>` : ''}</div>`;
    if (!tiles.length) return `<section class="card" id="sec-stats">${head}<p class="empty">No stats yet: they show once trades settle.</p></section>`;
    return `<section class="card" id="sec-stats">${head}${pn.length ? '' : '<p class="muted">No settled trades in the recent list yet; these come from the daily P&amp;L.</p>'}<div class="stats">${tiles.join('')}</div></section>`;
  }

  // ---- strategies (contract v2)
  function stratHtml(v) {
    if (!v.strat.length) return '';
    let tT = 0, tA = 0, tN = 0, tW = 0, tL = 0, hT = false, hA = false, hN = false, hWL = false, on = 0;
    const rows = v.strat.map((s) => {
      const run = s.running === true ? 'on' : s.running === false ? 'off' : '';
      const w = num(s.wins), l = num(s.losses), n = num(s.trades), td = num(s.today_pnl), tot = num(s.total_pnl);
      const wr = w != null && l != null && w + l > 0 ? w / (w + l) : null;
      if (td != null) { tT += td; hT = true; }
      if (tot != null) { tA += tot; hA = true; }
      if (n != null) { tN += n; hN = true; }
      if (w != null && l != null) { tW += w; tL += l; hWL = true; }
      if (run === 'on') on++;
      const mode = s.mode == null ? '' : String(s.mode).trim().toLowerCase().slice(0, 12);
      const sub = [mode === 'live' ? 'Live' : mode.toUpperCase(), n != null ? fmtN(n) + (n === 1 ? ' trade' : ' trades') : '', run === 'on' ? 'running' : run === 'off' ? 'stopped' : ''].filter(Boolean).join(' · ');
      return `<tr><td><div class="nm"><i class="sdot ${run}" aria-hidden="true"></i><b>${esc(s.name == null || s.name === '' ? 'Strategy' : s.name)}</b></div>${sub ? `<small>${esc(sub)}</small>` : ''}</td>`
        + `<td class="${cls(td)}">${esc(usd(td, true))}</td><td class="${cls(tot)}">${esc(usd(tot, true))}</td>`
        + `<td>${wr == null ? '—' : esc(pct(wr))}${w != null && l != null ? `<small>${esc(fmtN(w))}–${esc(fmtN(l))}</small>` : ''}</td></tr>`;
    }).join('');
    const n = v.strat.length, twr = hWL && tW + tL > 0 ? tW / (tW + tL) : null;
    const foot = n > 1 ? `<tfoot><tr><td>All ${n}<small>${hN ? esc(fmtN(tN)) + ' trades' : ''}</small></td><td class="${cls(tT)}">${hT ? esc(usd(tT, true)) : '—'}</td><td class="${cls(tA)}">${hA ? esc(usd(tA, true)) : '—'}</td><td>${twr == null ? '—' : esc(pct(twr))}</td></tr></tfoot>` : '';
    return `<section class="card" id="sec-strat"><div class="card-h"><h2>Strategies · ${n}</h2><span class="r muted">${on} running</span></div>`
      + `<table class="tbl"><thead><tr><th scope="col">Strategy</th><th scope="col">Today</th><th scope="col">Total</th><th scope="col">Win</th></tr></thead><tbody>${rows}</tbody>${foot}</table></section>`;
  }

  // ---- open bets: side tags, countdown, value, P&L; sorted, filtered, searchable
  function posModel(p, i) {
    const side = sideOf(p), n = num(p.contracts), avg = dol(p.avg_price), px = dol(p.price);
    const cost = n != null && avg != null ? n * avg : null;
    const value = num(p.value) != null ? num(p.value) : n != null && px != null ? n * px : null;
    const pnl = num(p.pnl) != null ? num(p.pnl) : px != null && value != null && cost != null ? value - cost : null;
    const title = String(p.title == null || p.title === '' ? (p.ticker == null ? '' : p.ticker) : p.title), ticker = String(p.ticker == null ? '' : p.ticker);
    const prob = unit(p.prob), ref = px != null ? px : avg, edge = prob != null && ref != null ? prob - ref : null;      // v3: the bot's own chance
    return { p, side, sk: sideKey(side), n, avg, px, cost, value, pnl, closes: parseT(p.closes), title, ticker, asset: assetOf(p), key: (ticker || title) + '#' + i,
      prob, edge, ev: edge != null && n != null ? edge * n : null };
  }
  function posHtml(v) {
    const ps = v.pos.map(posModel);
    S.pos = ps;
    const n = ps.length;
    let tv = 0, tp = 0, hv = false, hp = false;
    ps.forEach((m) => { if (m.value != null) { tv += m.value; hv = true; } if (m.pnl != null) { tp += m.pnl; hp = true; } });
    const evs = ps.filter((m) => m.ev != null), evT = sum(evs.map((m) => m.ev)), soon = ps.filter((m) => m.closes != null && m.closes > nowS()).sort(by((m) => m.closes))[0];
    const head = `<div class="card-h"><h2>Open bets · ${n}</h2>${n ? `<span class="r">${hv ? `<span class="muted">${esc(usd(tv))}</span>` : ''}${hv && hp ? ' · ' : ''}${hp ? `<span class="${cls(tp)}">${esc(usd(tp, true))}</span>` : ''}</span>` : ''}</div>`;
    if (!n) return `<section class="card" id="sec-pos">${head}<p class="empty">No open bets right now.</p></section>`;
    const live = evs.length || soon ? `<div class="pos-live">${evs.length ? `<span>Live edge <b class="${cls(evT)}">${esc(usd(evT, true))}</b> ${EVT}</span>` : ''}${soon ? `<span>Next settles <b class="cdn${cdnCls(soon.closes)}" data-c="${soon.closes}">${esc(closesTxt(soon.closes))}</b></span>` : ''}</div>` : '';
    const updown = ps.every((m) => m.side === 'up' || m.side === 'down');
    const cnt = { all: n, yes: ps.filter((m) => m.sk === 'yes').length, no: ps.filter((m) => m.sk === 'no').length };
    const lab = { all: 'All', yes: updown ? 'UP' : 'YES', no: updown ? 'DOWN' : 'NO' };
    const ctl = n > 1 ? `<div class="ctl"><div class="seg" role="group" aria-label="Side">${SIDES.map((k) => `<button type="button" data-act="side" data-v="${k}" aria-pressed="${S.ui.side === k}">${lab[k]} <span>${cnt[k]}</span></button>`).join('')}</div>`
      + `<select id="posSort" class="sel" aria-label="Sort open bets">${SORTS.map((s) => `<option value="${s[0]}"${S.ui.sort === s[0] ? ' selected' : ''}>${esc(s[1])}</option>`).join('')}</select></div>` : '';
    const q = n > 5 ? `<input id="posQ" class="q" type="search" placeholder="Search open bets" aria-label="Search open bets" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" value="${esc(S.q)}">` : '';
    return `<section class="card" id="sec-pos">${head}${live}${ctl}${q}<ul class="rows" id="posList">${posRows()}</ul></section>`;
  }
  function posRows() {
    const q = S.q.trim().toLowerCase(), k = S.ui.sort, n = S.pos.length;
    const list = S.pos.filter((m) => (n < 2 || S.ui.side === 'all' || m.sk === S.ui.side) && (!q || (m.title + ' ' + m.ticker + ' ' + m.asset).toLowerCase().indexOf(q) >= 0))
      .sort(k === 'pnl' ? by((m) => m.pnl, true) : k === 'pnl-asc' ? by((m) => m.pnl) : k === 'value' ? by((m) => m.value, true) : k === 'name' ? by((m) => m.title.toLowerCase()) : by((m) => m.closes));
    if (!list.length) return `<li class="none"><p class="muted">No ${S.ui.side === 'all' ? 'open bets' : 'bets on this side'}${q ? ' match “' + esc(S.q.trim()) + '”' : ''}.</p></li>`;
    return list.map(posRow).join('');
  }
  // the settle clock as a ring: full = the whole window (15 min, an hour, a day, a week: whichever the time left fits), empty = settled
  const ringFrac = (c) => { const r = c - nowS(), sc = r <= 900 ? 900 : r <= 3600 ? 3600 : r <= 86400 ? 86400 : 604800; return r <= 0 ? 0 : Math.min(1, r / sc); };
  const ring = (c) => `<svg class="ring${cdnCls(c)}" data-c="${c}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle class="rg-b" cx="12" cy="12" r="9"/><circle class="rg-v" cx="12" cy="12" r="9" pathLength="100" stroke-dasharray="${(ringFrac(c) * 100).toFixed(1)} 100" transform="rotate(-90 12 12)"/></svg>`;
  function posRow(m) {
    const p = m.p;
    const cdn = m.closes != null ? `<span class="cdn${cdnCls(m.closes)}" data-c="${m.closes}">${esc(closesTxt(m.closes))}</span>` : p.closes ? 'closes ' + esc(String(p.closes).slice(0, 16)) : '';
    const ret = m.pnl != null && m.cost ? pct(m.pnl / m.cost, true) : '';
    const dd = (t, d) => `<div><dt>${t}</dt><dd>${d}</dd></div>`;
    const det = [
      m.ticker ? dd('Market', esc(m.ticker)) : '',
      dd('Side', `${m.side ? esc(m.side.toUpperCase()) : '—'}${m.n != null ? ' · ' + esc(fmtN(m.n)) + (m.n === 1 ? ' contract' : ' contracts') : ''}`),
      dd('Cost', `${esc(usd(m.cost))}${m.avg != null ? ' · ' + esc(cents(p.avg_price)) + ' each' : ''}`),
      m.px != null || num(p.value) != null ? dd('Value now', `${esc(usd(m.value))}${m.px != null ? ' · ' + esc(cents(p.price)) + ' each' : ''}`) : '',
      m.n != null && m.cost != null ? dd('If it wins', `pays ${esc(usd(m.n))} · <span class="up">${esc(usd(m.n - m.cost, true))}</span>`) : '',
      m.closes != null ? dd('Closes', esc(ff(F.full, m.closes)) + ' ET') : '',
      m.prob != null ? dd('Live edge', `<span class="${cls(m.edge)}">${esc(edgeC(m.edge))}</span> · chance ${esc(pct(m.prob))}${m.ev != null ? ' · ' + EVT + ' ' + esc(usd(m.ev, true)) : ''}`) : '',
      p.category ? dd('Market', esc(String(p.category).slice(0, 40))) : '',
    ].join('');
    const price = num(p.price) != null ? ' → ' + esc(cents(p.price)) : '';
    return `<li class="pos" data-side="${esc(m.sk)}"><details data-k="${esc(m.key)}"${S.open.has(m.key) ? ' open' : ''}><summary><div class="pr">`
      + `<b class="t">${sideTag(m.side)}${assetTag(m.asset)}${esc(m.title)}</b><span class="v ${cls(m.pnl)}">${m.pnl == null ? '<span class="open">OPEN</span>' : esc(usd(m.pnl, true))}</span>`
      + `<small>${esc(m.n == null ? '?' : fmtN(m.n))} × ${esc(cents(p.avg_price))}${price}${m.edge != null ? ` <span class="edge ${cls(m.edge)}">edge ${esc(edgeC(m.edge))}</span>` : ''}</small>`
      + `<span class="v2">${m.value == null ? '' : esc(usd(m.value))}${ret ? ' · ' + esc(ret) : ''}</span>${cdn ? `<small class="cdl">${m.closes != null ? ring(m.closes) : ''}${cdn}</small>` : ''}</div></summary><dl class="dl">${det}</dl></details></li>`;
  }

  // ================================================================== contract v3 (2026-11-03): what Kalshi's own app, Polymarket
  // and the prediction-market trackers show and this page lacked: alerts, live edge, Kelly sizing, P&L by market category, win rate
  // and ROI by price, calibration. Each reads the bot's own v3 list when it sends one (every settled trade), else works it out from
  // the recent trades list (the last 40) and says so. All optional: a v1 / v2 feed shows exactly the sections it showed before.
  const LEVELS = ['bad', 'warn', 'info'];
  const edgeC = (x) => sgn(x, true) + Math.abs(x * 100).toFixed(1) + '¢';           // 0.05 -> '+5.0¢'
  const unit = (v) => { const x = num(v); return x != null && x >= 0 && x <= 1 ? x : null; };
  const settled = (v) => v.tr.filter((t) => num(t.pnl) != null && String(t.action == null ? '' : t.action).trim().toLowerCase() !== 'sell');
  const catOf = (r) => {
    const c = r.category == null ? '' : String(r.category).trim().slice(0, 40);
    if (c) return c;
    const a = assetOf(r);
    return a ? ({ BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', DOGE: 'Dogecoin', GOLD: 'Gold', SILVER: 'Silver' }[a] || a) : 'Other';
  };
  const roiTxt = (pnl, st) => (st > 0 && pnl != null ? pct(pnl / st, true) : '—');
  const fromNote = (n) => `<p class="muted small src">From the last ${n} settled ${n === 1 ? 'trade' : 'trades'} in the list: the bot's own totals show once it sends them.</p>`;

  // ---- alerts: the bot's own list, plus what the page sees (a bet settling within 15 min, a losing run, a quiet bot)
  function alertsList(k, v) {
    const out = [];
    arr(k.alerts).filter(isObj).forEach((a) => {
      const tx = a.text == null ? '' : String(a.text).trim().slice(0, 160);
      const lv = String(a.level == null ? '' : a.level).trim().toLowerCase();
      if (tx) out.push({ t: parseT(a.t), lv: LEVELS.indexOf(lv) >= 0 ? lv : 'info', tx });
    });
    v.pos.forEach((p) => {
      const c = parseT(p.closes), s = c ? c - nowS() : 0;
      if (c && s > 0 && s < 900) out.push({ t: c, lv: 'info', tx: 'Settles soon: ' + String(p.title || p.ticker || 'an open bet').slice(0, 100), c });
    });
    if (!Array.isArray(k.alerts)) {
      let run = 0;
      for (let i = 0; i < v.tr.length; i++) { const x = num(v.tr[i].pnl); if (x == null) continue; if (x < -0.005) run++; else if (x > 0.005) break; }
      if (run >= 3) out.push({ t: parseT(v.tr[0].t), lv: 'warn', tx: `${run} losses in a row` });
    }
    return out.sort((a, b) => LEVELS.indexOf(a.lv) - LEVELS.indexOf(b.lv) || (b.t || 0) - (a.t || 0)).slice(0, 12);
  }
  function alertsHtml(k, v) {
    const a = alertsList(k, v), bad = a.filter((x) => x.lv !== 'info').length;
    const head = `<div class="card-h"><h2>Alerts${a.length ? ' · ' + a.length : ''}</h2>${bad ? `<span class="r down">${bad} need${bad === 1 ? 's' : ''} you</span>` : ''}</div>`;
    if (!a.length) return `<section class="card al-card" id="sec-al">${head}<p class="calm"><i aria-hidden="true"></i>All quiet: nothing needs you.</p></section>`;
    return `<section class="card al-card" id="sec-al">${head}<ul class="al">${a.map((x) => `<li class="${x.lv}"><i aria-hidden="true"></i><span>${esc(x.tx)}</span>`
      + `<small${x.c ? ` class="cdn soon" data-c="${x.c}"` : ''}>${x.c ? esc(closesTxt(x.c)) : x.t ? esc(ago(x.t)) : ''}</small></li>`).join('')}</ul></section>`;
  }

  // ---- Kelly: the bot's own settings (fraction, bankroll, max bet, min edge), else a quarter Kelly of the balance
  const kellyCfg = (k) => {
    const c = isObj(k.kelly) ? k.kelly : {}, f = unit(c.fraction), b = num(c.bankroll), mb = num(c.max_bet), me = unit(c.min_edge);
    return { f: f && f > 0 ? f : 0.25, own: f != null && f > 0, bank: b != null && b > 0 ? b : num(k.balance), max: mb != null && mb > 0 ? mb : null, minEdge: me };
  };
  // full Kelly for a binary contract bought at price c with a chance p of paying $1: (p - c) / (1 - c)
  const kellyF = (p, c) => (p == null || c == null || c <= 0 || c >= 1 ? null : (p - c) / (1 - c));
  function kellyHtml(k, v) {
    const cfg = kellyCfg(k), ps = v.pos.map(posModel).filter((m) => m.prob != null && (m.px != null || m.avg != null));
    const fr = S.kf || cfg.f, fl = fr === 1 ? 'Full' : fr === 0.5 ? '½' : fr === 0.25 ? '¼' : Math.round(fr * 100) + '%';
    const bank = cfg.bank;
    const rows = ps.map((m) => {
      const c = m.px != null ? m.px : m.avg, f = kellyF(m.prob, c), raw = f != null && f > 0 && bank ? f * fr * bank : 0, cap = cfg.max != null && raw > cfg.max;
      const want = cap ? cfg.max : raw, cost = m.cost, ratio = want > 0 && cost != null ? cost / want : null;
      const tag = f == null ? '' : f <= 0 ? '<span class="kt bad">no edge</span>' : ratio == null ? '' : ratio > 1.5 ? '<span class="kt warn">over</span>' : ratio < 0.5 ? '<span class="kt">under</span>' : '<span class="kt ok">on size</span>';
      return `<li><b class="t">${sideTag(m.side)}${esc(m.title)}</b><span class="v ${f != null && f > 0 ? 'up' : 'down'}">${f == null ? '—' : esc(pct(Math.max(-1, f), false))}</span>`
        + `<small>chance ${esc(pct(m.prob))} vs ${esc(cents(c))} · edge ${esc(edgeC(m.prob - c))}</small>`
        + `<small class="kk">${esc(fl)} Kelly ${esc(usd(want))}${cap ? ' (max bet)' : ''} · bet ${esc(usd(cost))} ${tag}</small></li>`;
    }).join('');
    const seg = `<div class="seg" role="group" aria-label="Kelly fraction">${[[0.25, '¼'], [0.5, '½'], [1, 'Full']].map((x) => `<button type="button" data-act="kf" data-v="${x[0]}" aria-pressed="${fr === x[0]}">${x[1]}</button>`).join('')}</div>`;
    const c0 = S.calc;
    const pre = (f, lab, vals) => `<div class="pre"><span class="lab">${lab}</span><div class="seg" role="group" aria-label="${lab} presets">${vals.map((x) => `<button type="button" data-act="kcp" data-f="${f}" data-v="${x}" aria-pressed="${S.calc[f === 'p' ? 'p' : 'c'] === String(x)}">${x}</button>`).join('')}</div></div>`;
    return `<section class="card" id="sec-kelly"><div class="card-h"><h2>Edge &amp; sizing</h2>${seg}</div>`
      + `<p class="muted small">Kelly = the share of the bankroll a bet is worth: (chance − price) ÷ (1 − price). ${cfg.own ? `The bot sizes at ${esc(pct(cfg.f))} Kelly` : 'Most pros bet a quarter of it'}${bank ? ` · bankroll ${esc(usd(bank))}` : ''}${cfg.max ? ` · max bet ${esc(usd(cfg.max))}` : ''}${cfg.minEdge != null ? ` · min edge ${esc((cfg.minEdge * 100).toFixed(1))}¢` : ''}.</p>`
      + (rows ? `<ul class="rows kel">${rows}</ul>` : '<p class="muted">No open bet carries the bot\'s own chance yet (the <code>prob</code> field): try the calculator.</p>')
      + `<div class="calc" role="group" aria-label="Kelly calculator"><label><span class="lab">Your chance %</span><input id="kcP" class="q" type="text" inputmode="decimal" autocomplete="off" value="${esc(c0.p)}" aria-label="Your chance in percent"></label>`
      + `<label><span class="lab">Price ¢</span><input id="kcC" class="q" type="text" inputmode="decimal" autocomplete="off" value="${esc(c0.c)}" aria-label="Price in cents"></label>`
      + `<div class="pres">${pre('p', 'Chance %', [90, 94, 97])}${pre('c', 'Price ¢', [90, 94, 97])}</div>`
      + `<output id="kcOut" class="calc-o" aria-live="polite">${calcOut(cfg, fr)}</output></div>`
      + `<div id="kcCurve" class="kcurve">${kellyCurve(k, fr)}</div></section>`;
  }
  function calcOut(cfg, fr) {
    const p = num(S.calc.p), c = num(S.calc.c);
    if (p == null || c == null || p <= 0 || p >= 100 || c <= 0 || c >= 100) return '<span class="muted">Type a chance and a price (1-99).</span>';
    const pp = p / 100, cc = c / 100, f = kellyF(pp, cc), ev = pp - cc;
    if (f <= 0) return `<b class="down">No bet</b><span>edge ${esc(edgeC(ev))} · the price is above your chance</span>`;
    const bank = cfg.bank, stake = bank ? Math.min(f * fr * bank, cfg.max || Infinity) : null;
    return `<b class="up">${esc(pct(f * fr))} of the bankroll</b><span>edge ${esc(edgeC(ev))} · ROI ${esc(pct(ev / cc, true))} a contract</span>`
      + (stake != null ? `<span>bet ${esc(usd(stake))} ≈ ${esc(fmtN(Math.floor(stake / cc)))} contracts</span>` : '');
  }

  // ---- live edge: the bot's chance against the price, per open bet (only bets that carry `prob`), the EV it adds up to, and
  // where each bet sits against the bot's own minimum edge
  function edgeHtml(k, v) {
    const ps = v.pos.map(posModel).filter((m) => m.edge != null).sort(by((m) => m.edge, true));
    if (!ps.length) return '';
    const cfg = kellyCfg(k), evT = sum(ps.map((m) => m.ev || 0)), n = sum(ps.map((m) => m.n || 0));
    const avg = n ? sum(ps.map((m) => m.edge * (m.n || 0))) / n : sum(ps.map((m) => m.edge)) / ps.length;
    const risk = sum(ps.map((m) => m.cost || 0)), mx = Math.max(0.02, Math.max.apply(null, ps.map((m) => Math.abs(m.edge))));
    const me = cfg.minEdge, meX = me != null ? Math.min(50, (me / mx) * 50) : null;
    const rows = ps.map((m) => {
      const w = Math.max(1.5, (Math.abs(m.edge) / mx) * 50), under = me != null && m.edge < me;
      return `<li><div class="bk-t"><b>${sideTag(m.side)}${esc(m.title)}</b><span class="v ${cls(m.edge)}">${esc(edgeC(m.edge))}</span></div>`
        + `<div class="dv" aria-hidden="true">${meX != null ? `<u style="left:${(50 + meX).toFixed(1)}%"></u>` : ''}<i class="${m.edge < 0 ? 'neg' : 'pos'}" style="width:${w.toFixed(1)}%"></i></div>`
        + `<small>chance ${esc(pct(m.prob))} vs ${esc(cents(m.px != null ? m.px : m.avg))}${m.ev != null ? ' · ' + EVT + ' ' + esc(usd(m.ev, true)) : ''}${under ? ' · <span class="down">under the bot\'s min edge</span>' : ''}</small></li>`;
    }).join('');
    return `<section class="card" id="sec-edge"><div class="card-h"><h2>Live edge</h2><span class="r ${cls(evT)}">${esc(usd(evT, true))} EV</span></div>`
      + `<div class="edge-k"><div><span class="lab">Avg edge</span><b class="${cls(avg)}">${esc(edgeC(avg))}</b></div><div><span class="lab">EV / risk</span><b class="${cls(evT)}">${risk > 0 ? esc(pct(evT / risk, true)) : '—'}</b></div>`
      + `<div><span class="lab">Bets</span><b>${ps.length}<small> of ${v.pos.length}</small></b></div></div>`
      + `<ul class="brk edge-l">${rows}</ul><p class="muted small">Edge = the bot's own chance − the price now, per contract; EV = edge × contracts${me != null ? `; the line = its min edge ${esc((me * 100).toFixed(1))}¢` : ''}.</p></section>`;
  }


  // ---- Edge map (2026-11-03): every open bet as a bubble. Across = the price paid now, up = the bot's own chance; the diagonal is
  // fair (chance = price), so a bubble ABOVE it has an edge and the further up the bigger. Size = what is staked; green = at or
  // over the bot's min edge, amber = some edge but under it, red = no edge. Pure SVG, no library.
  function edgeMapHtml(k, v) {
    const ps = v.pos.map(posModel).filter((m) => m.prob != null && (m.px != null || m.avg != null));
    if (!ps.length) return '';
    const cfg = kellyCfg(k), me = cfg.minEdge != null ? cfg.minEdge : 0.03;
    const xy = ps.map((m) => ({ m, x: m.px != null ? m.px : m.avg, y: m.prob }));
    const lo = Math.max(0, Math.min.apply(null, xy.map((d) => Math.min(d.x, d.y))) - 0.08), hi = Math.min(1, Math.max.apply(null, xy.map((d) => Math.max(d.x, d.y))) + 0.08);
    const W = 300, H = 210, PL = 30, PB = 22, PT = 8, PR = 8, sc = (t, a, b) => a + ((t - lo) / Math.max(0.05, hi - lo)) * (b - a);
    const X = (t) => sc(t, PL, W - PR), Y = (t) => sc(t, H - PB, PT), mx = Math.max.apply(null, xy.map((d) => d.m.cost || 0)) || 1;
    const stp = hi - lo > 0.5 ? 0.25 : hi - lo > 0.2 ? 0.1 : 0.05, ticks = [];
    for (let t = Math.ceil((lo - 1e-9) / stp) * stp; t <= hi + 1e-9; t += stp) ticks.push(Math.round(t * 100) / 100);
    const grid = ticks.map((t) => `<line class="gx" x1="${X(t).toFixed(1)}" x2="${X(t).toFixed(1)}" y1="${PT}" y2="${H - PB}"/><line class="gx" x1="${PL}" x2="${W - PR}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}"/>`
      + `<text class="ax" x="${X(t).toFixed(1)}" y="${H - 6}" text-anchor="middle">${Math.round(t * 100)}¢</text><text class="ax" x="${PL - 4}" y="${(Y(t) + 3).toFixed(1)}" text-anchor="end">${Math.round(t * 100)}%</text>`).join('');
    const dots = xy.map((d, i) => {
      const e = d.y - d.x, c = e >= me ? 'ok' : e > 0 ? 'warn' : 'bad', r = 5 + 9 * Math.sqrt((d.m.cost || 0) / mx);
      return `<circle class="em-d ${c}" cx="${X(d.x).toFixed(1)}" cy="${Y(d.y).toFixed(1)}" r="${r.toFixed(1)}" style="--i:${i}"><title>${esc(d.m.title)}: chance ${esc(pct(d.y))} vs ${esc(cents(d.x))}, edge ${esc(edgeC(e))}${d.m.cost != null ? ', staked ' + esc(usd(d.m.cost)) : ''}</title></circle>`;
    }).join('');
    const ok = xy.filter((d) => d.y - d.x >= me).length;
    return `<section class="card" id="sec-emap"><div class="card-h"><h2>Edge map</h2><span class="r muted">${ok} of ${ps.length} clear the min edge</span></div>`
      + `<svg class="emap" viewBox="0 0 ${W} ${H}" role="img" aria-label="Open bets: the price paid across, the bot's own chance up; the diagonal is fair, bubbles above it have an edge">${grid}`
      + `<path class="em-up" d="M${X(lo).toFixed(1)},${Y(lo).toFixed(1)}L${X(lo).toFixed(1)},${Y(hi).toFixed(1)}L${X(hi).toFixed(1)},${Y(hi).toFixed(1)}Z"/><line class="em-fair" x1="${X(lo).toFixed(1)}" y1="${Y(lo).toFixed(1)}" x2="${X(hi).toFixed(1)}" y2="${Y(hi).toFixed(1)}"/>${dots}</svg>`
      + `<p class="muted small">Across: the price now. Up: the bot's own chance. Above the diagonal = an edge; bigger bubble = more staked; green = over the bot's min edge (${esc((me * 100).toFixed(1))}¢), amber = under it, red = none.</p></section>`;
  }

  // ---- Kelly growth curve (2026-11-03): how fast the bankroll grows at each bet size, for the calculator's chance and price (else
  // the open bets' own average). The top is full Kelly; past about twice that the curve goes under zero: betting that much loses.
  function kellyCurve(k, fr) {
    let p = num(S.calc.p), c = num(S.calc.c), src = 'your numbers';
    p = p != null && p > 0 && p < 100 ? p / 100 : null; c = c != null && c > 0 && c < 100 ? c / 100 : null;
    if (p == null || c == null) {
      const ps = (S.v ? S.v.pos : []).map(posModel).filter((m) => m.prob != null && (m.px != null || m.avg != null) && (m.n || 0) > 0);
      const n = sum(ps.map((m) => m.n || 0));
      if (ps.length && n) { p = sum(ps.map((m) => m.prob * (m.n || 0))) / n; c = sum(ps.map((m) => (m.px != null ? m.px : m.avg) * (m.n || 0))) / n; src = 'the open bets, averaged'; }
      else { p = 0.58; c = 0.5; src = 'an example: 58% chance at 50¢'; }
    }
    const fs = kellyF(p, c);
    if (fs == null || fs <= 0) return `<p class="muted small">No edge at ${esc(pct(p))} for ${esc(cents(c))} (${esc(src)}): every bet size loses, so the curve is under zero everywhere. Bet nothing.</p>`;
    const b = (1 - c) / c, g = (f) => p * Math.log(1 + f * b) + (1 - p) * Math.log(Math.max(1e-9, 1 - f));
    const fmax = Math.min(0.98, fs * 2.4), N = 60, W = 300, H = 120, PX = 6, PY = 10;
    const pts = [];
    for (let i = 0; i <= N; i++) { const f = (i / N) * fmax; pts.push([f, g(f)]); }
    const gtop = g(fs), gmin = Math.min(-gtop * 0.6, Math.min.apply(null, pts.map((q) => q[1])));
    const X = (f) => PX + (f / fmax) * (W - 2 * PX), Y = (y) => PY + ((gtop - y) / (gtop - gmin)) * (H - 2 * PY), y0 = Y(0);
    const d = pts.map((q, i) => `${i ? 'L' : 'M'}${X(q[0]).toFixed(1)},${Y(q[1]).toFixed(1)}`).join('');
    const mk = (f, lab, cls) => (f <= fmax ? `<line class="kc-m ${cls}" x1="${X(f).toFixed(1)}" x2="${X(f).toFixed(1)}" y1="${PY}" y2="${H - PY}"/><text class="kc-t ${cls}" x="${X(f).toFixed(1)}" y="${(H - 1).toFixed(1)}" text-anchor="middle">${lab}</text>` : '');
    const cur = S.kf || fr;
    const rel = (f) => (g(f) / gtop * 100);
    return `<svg class="kcurve-s" viewBox="0 0 ${W} ${H + 8}" role="img" aria-label="Growth rate of the bankroll against the bet size: best at full Kelly, negative past about double">`
      + `<line class="kc-z" x1="${PX}" x2="${W - PX}" y1="${y0.toFixed(1)}" y2="${y0.toFixed(1)}"/><path class="kc-a" d="${d}L${X(fmax).toFixed(1)},${y0.toFixed(1)}L${X(0).toFixed(1)},${y0.toFixed(1)}Z"/><path class="kc-l" d="${d}"/>`
      + `${mk(fs * 0.25, '¼', 'q')}${mk(fs * 0.5, '½', 'h')}${mk(fs, 'Full', 'f')}${mk(fs * 2, '2×', 'x')}<circle class="kc-p" cx="${X(fs * cur).toFixed(1)}" cy="${Y(g(fs * cur)).toFixed(1)}" r="4.5"/></svg>`
      + `<p class="muted small">Growth by bet size for ${esc(pct(p))} at ${esc(cents(c))} (${esc(src)}). Full Kelly is ${esc(pct(fs))} of the bankroll. ${esc(cur === 1 ? 'Full' : cur === 0.5 ? '½' : cur === 0.25 ? '¼' : Math.round(cur * 100) + '%')} Kelly keeps `
      + `<b>${esc(rel(fs * cur).toFixed(0))}%</b> of the best growth with far smaller swings; <b class="down">2× Kelly</b> grows <b class="down">${esc(rel(Math.min(fs * 2, 0.98)).toFixed(0))}%</b>: past that, a bigger bet only loses.</p>`;
  }

  // ---- Bet journal (2026-11-03): every settled bet by day, with the process behind it. A bet with an edge when it was taken that
  // lost is variance; one with no edge that won was luck: the journal marks both, so a red day is read for what it was. Optional
  // notes per day are kept on this phone only. Filter: all / wins / losses.
  const JF = [['all', 'All'], ['win', 'Wins'], ['loss', 'Losses']], JN_MAX = 280, JDAYS = 7;
  function journalModel(v) {
    const days = new Map();
    v.tr.forEach((t) => {
      const pnl = num(t.pnl), tt = parseT(t.t), act = String(t.action == null ? '' : t.action).trim().toLowerCase();
      if (pnl == null || act === 'sell' || !tt) return;
      const day = dayKey(tt), price = dol(t.price), prob = unit(t.prob), edge = prob != null && price != null ? prob - price : null, n = num(t.contracts);
      const win = pnl > 0.004, loss = pnl < -0.004;
      const tag = edge == null ? '' : win && edge <= 0 ? 'luck' : loss && edge > 0 ? 'variance' : loss ? 'no edge' : win ? 'earned' : '';
      let d = days.get(day);
      if (!d) { d = { day, net: 0, w: 0, l: 0, rows: [] }; days.set(day, d); }
      d.net += pnl; if (win) d.w++; else if (loss) d.l++;
      d.rows.push({ t: tt, pnl, win, loss, side: sideOf(t), title: String(t.title || t.ticker || ''), price, prob, edge, n, tag, strat: t.strategy != null ? String(t.strategy) : '' });
    });
    return Array.from(days.values()).sort((a, b) => (a.day < b.day ? 1 : -1));
  }
  function journalHtml(v) {
    const all = journalModel(v);
    if (!all.length) return '';
    const notes = LS.get('kalshi.journal', {}) || {};
    const f = S.jf, days = all.slice(0, JDAYS);
    const rated = all.reduce((a, d) => a.concat(d.rows.filter((r) => r.tag)), []);
    const proc = rated.length ? rated.filter((r) => r.tag === 'earned' || r.tag === 'variance').length / rated.length : null;
    const seg = `<div class="seg" role="group" aria-label="Journal filter">${JF.map((x) => `<button type="button" data-act="jf" data-v="${x[0]}" aria-pressed="${f === x[0]}">${x[1]}</button>`).join('')}</div>`;
    const body = days.map((d) => {
      const rows = d.rows.filter((r) => f === 'all' || (f === 'win' ? r.win : r.loss)).sort((a, b) => b.t - a.t);
      if (!rows.length) return '';
      const note = typeof notes[d.day] === 'string' ? notes[d.day] : '', open = S.jn === d.day;
      const li = rows.map((r) => `<li class="jr ${r.win ? 'w' : r.loss ? 'l' : ''}"><b class="t">${sideTag(r.side)}${esc(r.title)}</b><span class="v ${cls(r.pnl)}">${esc(usd(r.pnl, true))}</span>`
        + `<small>${r.n != null ? esc(fmtN(r.n)) + ' ' : ''}${r.price != null ? '@ ' + esc(cents(r.price)) : ''}${r.prob != null ? ' · chance ' + esc(pct(r.prob)) + ' (edge ' + esc(edgeC(r.edge)) + ')' : ''}${ff(F.time, r.t) ? ' · ' + esc(ff(F.time, r.t)) : ''}`
        + `${r.tag ? ` <span class="kt ${r.tag === 'luck' || r.tag === 'no edge' ? 'warn' : r.tag === 'earned' ? 'ok' : ''}">${esc(r.tag)}</span>` : ''}</small></li>`).join('');
      return `<li class="jd"><div class="jd-h"><b>${esc(dayLabel(d.day))}</b><span class="${cls(d.net)}">${esc(usd(d.net, true))}</span><small>${d.w}W ${d.l}L</small>`
        + `<button type="button" class="jn-b" data-act="jnote" data-v="${esc(d.day)}" aria-expanded="${open}">${note ? 'Note' : 'Add note'}</button></div>`
        + (open ? `<textarea id="jnote" class="jn q" rows="3" maxlength="${JN_MAX}" data-day="${esc(d.day)}" aria-label="Your note for ${esc(dayLabel(d.day))}" placeholder="What happened, what you would do again…">${esc(note)}</textarea>`
          : note ? `<p class="jn-t">${esc(note)}</p>` : '')
        + `<ul class="jl">${li}</ul></li>`;
    }).join('');
    return `<section class="card" id="sec-journal"><div class="card-h"><h2>Bet journal</h2>${seg}</div>`
      + `<p class="muted small">${all.reduce((a, d) => a + d.rows.length, 0)} settled bets over ${all.length} day${all.length === 1 ? '' : 's'}${proc != null ? ` · <b>${Math.round(proc * 100)}%</b> were good bets when taken (had an edge, or won with one)` : ''}. Notes stay on this phone.</p>`
      + (body ? `<ul class="journal">${body}</ul>` : '<p class="empty">No bet matches this filter.</p>')
      + (all.length > days.length ? `<p class="muted small">The last ${JDAYS} trading days of ${all.length}.</p>` : '') + '</section>';
  }

  // ---- P&L by market category
  function catRows(k, v) {
    if (Array.isArray(k.categories)) {
      return { own: true, rows: arr(k.categories).filter(isObj).map((c) => ({ name: String(c.name == null ? '' : c.name).slice(0, 40), group: c.group == null ? '' : String(c.group).slice(0, 30),
        n: num(c.trades), w: num(c.wins), l: num(c.losses), pnl: num(c.pnl), st: num(c.staked) })).filter((c) => c.name) };
    }
    const m = new Map();
    settled(v).forEach((t) => {
      const name = catOf(t), r = m.get(name) || { name, group: '', n: 0, w: 0, l: 0, pnl: 0, st: 0 }, x = num(t.pnl), c = num(t.contracts), px = dol(t.price);
      r.n++; r.pnl += x; if (x > 0.005) r.w++; else if (x < -0.005) r.l++;
      if (c != null && px != null) r.st += Math.abs(c) * px;
      m.set(name, r);
    });
    return { own: false, rows: Array.from(m.values()) };
  }
  function catHtml(k, v) {
    const d = catRows(k, v), rows = d.rows.sort(by((r) => r.pnl, true));
    if (!rows.length) return '';
    const mx = Math.max.apply(null, rows.map((r) => Math.abs(r.pnl || 0))) || 1, n = sum(rows.map((r) => r.n || 0));
    return `<section class="card" id="sec-cat"><div class="card-h"><h2>By market · ${rows.length}</h2><span class="r muted">${esc(fmtN(n))} trades</span></div>`
      + `<ul class="brk">${rows.map((r) => {
        const wr = r.w != null && r.l != null && r.w + r.l > 0 ? r.w / (r.w + r.l) : null, w = Math.max(2, (Math.abs(r.pnl || 0) / mx) * 50);
        return `<li><div class="bk-t"><b>${assetIcon(CAT_ASSET[r.name] || (ICONS[String(r.name).toUpperCase()] ? String(r.name).toUpperCase() : ''))}${esc(r.name)}</b>${r.group ? `<small>${esc(r.group)}</small>` : ''}<span class="v ${cls(r.pnl)}">${esc(usd(r.pnl, true))}</span></div>`
          + `<div class="dv" aria-hidden="true"><i class="${(r.pnl || 0) < 0 ? 'neg' : 'pos'}" style="width:${w.toFixed(1)}%"></i></div>`
          + `<small>${esc(fmtN(r.n || 0))} ${r.n === 1 ? 'trade' : 'trades'}${wr == null ? '' : ' · win ' + esc(pct(wr))}${r.st ? ' · ROI ' + esc(roiTxt(r.pnl, r.st)) : ''}</small></li>`;
      }).join('')}</ul>${d.own ? '' : fromNote(n)}</section>`;
  }

  // ---- win rate and ROI by entry price: is the bot paid enough for the risk at each price?
  const EDGES = [0, 0.2, 0.4, 0.6, 0.8, 0.9, 0.95, 0.97, 0.99, 1.0001];
  function bucketRows(k, v) {
    if (Array.isArray(k.buckets)) {
      return { own: true, rows: arr(k.buckets).filter(isObj).map((b) => ({ lo: unit(b.lo), hi: unit(b.hi), n: num(b.trades), w: num(b.wins), l: num(b.losses), pnl: num(b.pnl), st: num(b.staked) }))
        .filter((b) => b.lo != null && b.hi != null && b.lo < b.hi).sort(by((b) => b.lo)) };
    }
    const m = new Map();
    settled(v).forEach((t) => {
      const px = dol(t.price), x = num(t.pnl), c = num(t.contracts);
      if (px == null || px <= 0 || px >= 1.0001) return;
      let i = 0; while (i < EDGES.length - 2 && px >= EDGES[i + 1]) i++;
      const r = m.get(i) || { lo: EDGES[i], hi: Math.min(1, EDGES[i + 1]), n: 0, w: 0, l: 0, pnl: 0, st: 0 };
      r.n++; r.pnl += x; if (x > 0.005) r.w++; else if (x < -0.005) r.l++;
      if (c != null) r.st += Math.abs(c) * px;
      m.set(i, r);
    });
    return { own: false, rows: Array.from(m.values()).sort(by((b) => b.lo)) };
  }
  const cRange = (lo, hi) => `${Math.round(lo * 100)}–${Math.round(hi * 100)}¢`;
  function bucketHtml(k, v) {
    const d = bucketRows(k, v), rows = d.rows;
    if (!rows.length) return '';
    const n = sum(rows.map((r) => r.n || 0));
    // the win rate a bucket needs to break even is about the price paid (fees aside): the staked share of the contracts' payout
    const body = rows.map((r) => {
      const wr = r.w != null && r.l != null && r.w + r.l > 0 ? r.w / (r.w + r.l) : null, need = (r.lo + r.hi) / 2, short = r.pnl != null ? r.pnl < -0.005 : wr != null && wr + 0.0001 < need;
      return `<tr><td>${esc(cRange(r.lo, r.hi))}<small>${esc(fmtN(r.n || 0))} ${r.n === 1 ? 'trade' : 'trades'}</small></td>`
        + `<td class="${wr == null ? '' : short ? 'down' : 'up'}">${wr == null ? '—' : esc(pct(wr))}<small>needs ~${esc(pct(need))}</small></td>`
        + `<td class="${cls(r.pnl)}">${esc(roiTxt(r.pnl, r.st))}</td><td class="${cls(r.pnl)}">${esc(usd(r.pnl, true))}</td></tr>`;
    }).join('');
    return `<section class="card" id="sec-bk"><div class="card-h"><h2>By price</h2><span class="r muted">${esc(fmtN(n))} trades</span></div>`
      + `<table class="tbl"><thead><tr><th scope="col">Paid</th><th scope="col">Win</th><th scope="col">ROI</th><th scope="col">P&amp;L</th></tr></thead><tbody>${body}</tbody></table>`
      + `<p class="muted small">A contract bought at 96¢ must win about 96% of the time to break even: red = that price range lost money.</p>${d.own ? '' : fromNote(n)}</section>`;
  }

  // ---- calibration: when the bot (or the price) said X%, how often did it win?
  function calibRows(k, v) {
    if (Array.isArray(k.calibration)) {
      return { own: true, basis: String(k.calib_basis || '') === 'model' ? 'model' : 'price',
        rows: arr(k.calibration).filter(isObj).map((c) => ({ p: unit(c.p), n: num(c.n), hit: unit(c.hit) })).filter((c) => c.p != null && c.hit != null && c.n >= 1) };
    }
    const m = new Map();
    let model = true;
    const st = settled(v);
    st.forEach((t) => { if (unit(t.prob) == null) model = false; });
    st.forEach((t) => {
      const p = model ? unit(t.prob) : dol(t.price), x = num(t.pnl);
      if (p == null || p <= 0 || p > 1) return;
      let i = 0; while (i < EDGES.length - 2 && p >= EDGES[i + 1]) i++;
      const r = m.get(i) || { s: 0, n: 0, w: 0 };
      r.s += p; r.n++; if (x > 0.005) r.w++;
      m.set(i, r);
    });
    return { own: false, basis: model && st.length ? 'model' : 'price', rows: Array.from(m.values()).map((r) => ({ p: r.s / r.n, n: r.n, hit: r.w / r.n })).sort(by((r) => r.p)) };
  }
  function calibHtml(k, v) {
    const d = calibRows(k, v), rows = d.rows;
    if (!rows.length) return '';
    const n = sum(rows.map((r) => r.n)), lo0 = Math.min.apply(null, rows.map((r) => Math.min(r.p, r.hit)));
    const lo = Math.max(0, lo0 > 0.6 ? Math.floor((lo0 - 0.02) * 20) / 20 : Math.floor((lo0 - 0.05) * 10) / 10), span = 1 - lo, W = 300, P = 8;
    const X = (x) => P + ((x - lo) / span) * (W - 2 * P), Y = (y) => W - P - ((y - lo) / span) * (W - 2 * P);
    const gap = sum(rows.map((r) => r.n * (r.hit - r.p))) / n, big = rows.slice().sort(by((r) => r.n, true))[0];
    const ticks = []; for (let t = lo; t <= 1.0001; t += span > 0.5 ? 0.25 : 0.05) ticks.push(+t.toFixed(2));
    // the 95% range each win rate could really be (Wilson): a shaded band through the groups and a bar on each, so a dot far from the
    // diagonal with a long bar is read as 'too few bets to tell', not as a miss
    const bd = rows.map((r) => { const w = wilson(r.hit * r.n, r.n); return { x: X(r.p), lo: Y(w[0]), hi: Y(w[1]), n: r.n }; });
    const bb = bd.filter((b) => b.n >= 10);                               // groups of 10+ bets make the band; thinner ones only get a faint bar
    const band = bb.length >= 2 ? 'M' + bb.map((b) => b.x.toFixed(1) + ',' + b.hi.toFixed(1)).join('L') + 'L' + bb.slice().reverse().map((b) => b.x.toFixed(1) + ',' + b.lo.toFixed(1)).join('L') + 'Z' : '';
    const curve = rows.length >= 2 ? 'M' + rows.map((r) => X(r.p).toFixed(1) + ',' + Y(r.hit).toFixed(1)).join('L') : '';
    const bars = bd.map((b) => `<line class="cb-eb${b.n < 10 ? ' thin' : ''}" x1="${b.x.toFixed(1)}" x2="${b.x.toFixed(1)}" y1="${b.hi.toFixed(1)}" y2="${b.lo.toFixed(1)}"/>`).join('');
    const inside = rows.filter((r) => { const w = wilson(r.hit * r.n, r.n); return r.p >= w[0] - 1e-9 && r.p <= w[1] + 1e-9; }).length;
    const dots = rows.map((r) => `<circle cx="${X(r.p).toFixed(1)}" cy="${Y(r.hit).toFixed(1)}" r="${Math.min(12, 4 + Math.sqrt(r.n) * 0.9).toFixed(1)}" class="${r.hit + 0.0001 < r.p ? 'cb-n' : 'cb-p'}"><title>${esc(pct(r.p))} said, ${esc(pct(r.hit))} won (${r.n})</title></circle>`).join('');
    const what = d.basis === 'model' ? "the bot's own chance" : 'the price paid (the market\'s chance)';
    return `<section class="card" id="sec-cb"><div class="card-h"><h2>Calibration</h2><span class="r ${gap < -0.005 ? 'down' : gap > 0.005 ? 'up' : 'muted'}">${esc(sgn(gap, true) + Math.abs(gap * 100).toFixed(1))} pts</span></div>`
      + `<div class="cb"><svg viewBox="0 0 ${W} ${W}" role="img" aria-label="${esc(`Calibration, ${n} settled bets: ${rows.map((r) => pct(r.p) + ' said, ' + pct(r.hit) + ' won').join('; ')}`)}">`
      + ticks.map((t) => `<line class="cb-g" x1="${X(t).toFixed(1)}" x2="${X(t).toFixed(1)}" y1="${P}" y2="${W - P}"/><line class="cb-g" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}" x1="${P}" x2="${W - P}"/>`).join('')
      + `<defs><clipPath id="cbClip"><rect x="${P}" y="${P}" width="${W - 2 * P}" height="${W - 2 * P}"/></clipPath></defs><g clip-path="url(#cbClip)">${band ? `<path class="cb-band" d="${band}"/>` : ''}${bars}</g>`
      + `<line class="cb-d" x1="${X(lo)}" y1="${Y(lo)}" x2="${X(1)}" y2="${Y(1)}"/>${curve ? `<path class="cb-curve" d="${curve}"/>` : ''}${dots}</svg>`
      + ticks.map((t, i) => `<span class="cb-t${i === 0 ? ' a0' : i === ticks.length - 1 ? ' a1' : ''}" style="left:${(X(t) / W * 100).toFixed(1)}%">${Math.round(t * 100)}%</span>`).join('')
      + '<span class="cb-ax cb-y">↑ won · said →</span></div>'
      + `<p class="muted small">Predicted = ${esc(what)}. On the line = honest odds; above it = the bets win more than they cost (green), below = less (red). `
      + `Biggest group: ${esc(pct(big.p))} said, ${esc(pct(big.hit))} won, ${esc(fmtN(big.n))} ${big.n === 1 ? 'bet' : 'bets'}. `
      + `The shaded band is the 95% range each win rate could really be: the diagonal runs inside it for ${inside} of ${rows.length} ${rows.length === 1 ? 'group' : 'groups'}, so ${inside === rows.length ? 'every group is as good as honest odds can tell' : 'the others are off by more than luck'}.</p>${d.own ? '' : fromNote(n)}</section>`;
  }

  // ================================================================== 2026-11-04 "every view looks sick": the verdict, the heat map,
  // the strategy race and battle, the risk-of-ruin gauge with its Monte Carlo fan, the timeline, the rest-state explainer. Everything is
  // worked out from the numbers the bot sends (never invented), drawn as SVG / HTML, and drawn once per update (no per-frame work).
  const PALETTE = ['#c8a24a', '#4b7a99', '#9aa664', '#d97a58', '#9c6b3c', '#b9a8d0'];
  const stratName = (t) => (t.strategy != null && String(t.strategy) ? String(t.strategy) : t.book != null ? String(t.book) : '');

  // ---- the verdict: one plain sentence at the top, then the reasons, each linked to the numbers behind it
  function verdictModel(k, v) {
    const at = isObj(k.stats) ? k.stats : null;
    let w = at ? num(at.wins) : null, l = at ? num(at.losses) : null, st = at ? num(at.staked) : null, pnl = at ? num(at.pnl) : null, px = at ? dol(at.avg_price) : null, basis = 'all time';
    if (!(w != null && l != null && w + l >= 5)) {
      const ss = settled(v);
      w = ss.filter((t) => num(t.pnl) > 0.005).length; l = ss.filter((t) => num(t.pnl) < -0.005).length;
      let cn = 0, pxs = 0;
      st = 0; pnl = 0;
      ss.forEach((t) => { const c = num(t.contracts), p2 = dol(t.price); pnl += num(t.pnl); if (c != null && p2 != null) { st += Math.abs(c) * p2; pxs += p2 * Math.abs(c); cn += Math.abs(c); } });
      px = cn ? pxs / cn : null; st = st || null;
      basis = `last ${ss.length} bets`;
    }
    if (w + l < 5) return null;
    const total = num(k.total_pnl) != null && basis === 'all time' ? num(k.total_pnl) : pnl;
    if (total == null) return null;
    return { w, l, wr: w / (w + l), st, pnl, px, total, basis };
  }
  function verdictHtml(k, v) {
    const m = verdictModel(k, v);
    if (!m) return '';
    const win = m.wr >= 0.5, plus = m.total >= 0, wr = pct(m.wr);
    const head = win && !plus ? `You win ${wr} of bets but lose money: here is why` : win ? `You win ${wr} of bets and make money: here is how`
      : plus ? `You win only ${wr} of bets and still make money: here is how` : `You win ${wr} of bets and lose money: here is why`;
    const items = [];
    const px = m.px, c = (x) => Math.round(x * 100);
    if (px != null && px > 0.02 && px < 0.98) {
      const r = px / (1 - px);
      items.push(['sec-bk', r >= 1.5 ? `A win pays only about <b>${c(1 - px)}¢</b> on the <b>${c(px)}¢</b> you put in, but a loss takes all of it. One loss wipes out about <b>${Math.round(r)} wins</b>.`
        : r <= 0.67 ? `A win pays <b>${c(1 - px)}¢</b> on <b>${c(px)}¢</b> in, a loss costs <b>${c(px)}¢</b>: one win pays back about <b>${(1 / r).toFixed(1)} losses</b>.`
          : `Wins and losses are about the same size here (<b>${c(1 - px)}¢</b> won against <b>${c(px)}¢</b> lost per contract).`]);
      const edge = (m.wr - px) * 100;
      let fee = '';
      if (m.st) {
        const drag = (m.wr / px - 1) - m.pnl / m.st;
        if (drag > 0.0005) fee = ` Fees and slips cost about <b>${esc(usd(drag * m.st))}</b> (${(drag * 100).toFixed(1)}% of what was bet).`;
      }
      const p1 = (x) => (x * 100).toFixed(1) + '%';
      items.push(['sec-cb', `To break even at ${c(px)}¢ you must win about <b>${esc(p1(px))}</b>. You win <b>${esc(p1(m.wr))}</b>: <b class="${edge >= 0 ? 'up' : 'down'}">${Math.abs(edge).toFixed(1)} points ${edge >= 0 ? 'above' : 'below'}</b> the line.${fee}`]);
    }
    const bk = bucketRows(k, v).rows.filter((r) => r.pnl != null && r.lo != null);
    if (bk.length >= 2) {
      const worst = bk.slice().sort(by((r) => r.pnl))[0], rest = sum(bk.filter((r) => r !== worst).map((r) => r.pnl));
      const wrb = worst.w != null && worst.l != null && worst.w + worst.l > 0 ? worst.w / (worst.w + worst.l) : null;
      if (worst.pnl < -0.5) {
        items.push(['sec-bk', `The <b>${esc(cRange(worst.lo, worst.hi))}</b> price band is the leak: <b class="down">${esc(usd(worst.pnl, true))}</b> on ${esc(fmtN(worst.n || 0))} bets${wrb != null ? ` (wins ${esc(pct(wrb))}, needs about ${esc(pct((worst.lo + worst.hi) / 2))})` : ''}. All the other bands together: <b class="${cls(rest)}">${esc(usd(rest, true))}</b>.`]);
      }
    }
    const sp = v.strat.filter((s) => num(s.total_pnl) != null);
    if (sp.length >= 2) {
      const a = sp.slice().sort(by((s) => num(s.total_pnl)));
      const lo = a[0], hi = a[a.length - 1];
      if (num(lo.total_pnl) < -0.5 || num(hi.total_pnl) > 0.5) items.push(['sec-battle', `<b>${esc(String(hi.name || 'Strategy'))}</b>${String(hi.mode || '').toLowerCase() === 'paper' ? ' (paper)' : ''} <span class="${cls(hi.total_pnl)}">${esc(usd(hi.total_pnl, true))}</span> against <b>${esc(String(lo.name || 'Strategy'))}</b>${String(lo.mode || '').toLowerCase() === 'paper' ? ' (paper)' : ''} <span class="${cls(lo.total_pnl)}">${esc(usd(lo.total_pnl, true))}</span>.`]);
    }
    const ring = (() => {
      const r = 26, cf = 2 * Math.PI * r, a = Math.max(0, Math.min(1, m.wr)) * cf;
      return `<svg class="vd-ring" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><circle cx="32" cy="32" r="${r}" class="vr-b"/><circle cx="32" cy="32" r="${r}" class="vr-w" stroke-dasharray="${a.toFixed(1)} ${cf.toFixed(1)}" transform="rotate(-90 32 32)"/>`
        + `<text x="32" y="36.5" text-anchor="middle">${esc(pct(m.wr))}</text></svg>`;
    })();
    const roi = m.st ? ` · ROI <b class="${cls(m.pnl)}">${esc(pct(m.pnl / m.st, true))}</b> on ${esc(usd(m.st))} bet` : '';
    const paused = k.running === false ? '<span class="vd-p">Paused: nothing is at risk right now.</span>' : '';
    return `<section class="card verdict ${plus ? 'pos' : 'neg'}" id="sec-verdict" aria-label="The verdict"><div class="vd-top">${ring}<div class="vd-t"><span class="lab">The verdict · ${esc(m.basis)}</span><h3>${esc(head)}</h3></div></div>`
      + `<p class="vd-m"><b class="${cls(m.total)}">${esc(usd(m.total, true))}</b> ${m.basis === 'all time' ? 'all time' : 'on these bets'} · <b>${esc(fmtN(m.w))}W ${esc(fmtN(m.l))}L</b>${roi}</p>${paused}`
      + (items.length ? `<div class="vd-l">${items.map((x, i) => `<button type="button" class="vd-i" data-act="jump" data-v="${x[0]}"><i>${i + 1}</i><span>${x[1]}</span><em aria-hidden="true">›</em></button>`).join('')}</div>` : '')
      + '</section>';
  }


  // ================================================================== 2026-11-04 the guard: "Do not take this bet" (suggestions only)
  // The top card. It checks every open bet (and, with nothing open, any bet you pick below) against what the research found
  // (research/writeups/2026-11-04_kalshi_edges.md): the price band that loses, the fee against the edge, the size against a
  // wipe-out, a coin that loses, bets that settle together. Green = nothing breaks a rule, amber = close to the line, red = do not
  // take it, each with the dollar reason. It reads only the numbers the bot sends; it never places, changes or cancels a bet.
  const GUARD_BAND = { lo: 0.9, hi: 0.95, pnl: -248.3, n: 581, st: 5343.43 };   // the research's leak, used only when the feed has no price bands
  const GLV = { red: ['DO NOT TAKE', 'red'], amber: ['CAREFUL', 'amber'], green: ['OK', 'green'] };
  const glRank = { green: 0, amber: 1, red: 2 };
  const feeOf = (n, p) => Math.round(0.07 * n * p * (1 - p) * 100) / 100;            // Kalshi's taker fee, to the cent (the bot's own P&L matches it)
  const medianOf = (a) => { const b = a.filter((x) => x != null).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };

  function guardCtx(k, v) {
    const rows = bucketRows(k, v).rows.filter((r) => r.lo != null && r.hi != null);
    // a band is only called a leak on 100+ bets; when the feed has no such band over 90-95c, the research's own leak stands in for it
    const strong = rows.filter((r) => r.n >= 100 && r.pnl != null && r.st > 0);
    const bad = strong.filter((r) => r.pnl < -0.5 && r.pnl / r.st < -0.01).concat(strong.some((r) => r.lo < 0.95 && r.hi > 0.9) ? [] : [GUARD_BAND]);
    const strat = new Map();
    v.strat.forEach((x) => { const w = num(x.wins), l = num(x.losses); if (w != null && l != null && w + l >= 30) strat.set(String(x.name || '').toLowerCase(), w / (w + l)); });
    const st = isObj(k.stats) ? k.stats : null, sw = st ? num(st.wins) : null, sl = st ? num(st.losses) : null;
    return { bal: num(k.balance), rows, bad, strat, all: sw != null && sl != null && sw + sl >= 30 ? sw / (sw + sl) : null, cats: arr(k.categories).filter(isObj),
      typical: medianOf(v.tr.map((t) => num(t.contracts))) || 6 };
  }

  /** one bet against the rules: { level, reasons: [{ lv, html }] }; b = { n, p, strategy, cat, asset } (p in dollars) */
  function guardBet(g, b) {
    const p1 = (x) => (x * 100).toFixed(1) + '%', R = [], c = (x) => Math.round(x * 100), p = b.p, n = b.n, cost = n * p;
    // 1) the price band
    const leak = g.bad.filter((r) => p >= r.lo - 1e-9 && p < r.hi - 1e-9)[0], band = g.rows.filter((r) => p >= r.lo - 1e-9 && p < r.hi - 1e-9)[0];
    if (leak) R.push({ lv: 'red', html: `The <b>${esc(cRange(leak.lo, leak.hi))}</b> price band has lost <b class="down">${esc(usd(leak.pnl, true))}</b> on ${esc(fmtN(leak.n || 0))} bets${leak.st ? ` (${esc(pct(leak.pnl / leak.st, true))} of what was bet)` : ''}. This one is at ${c(p)}¢.` });
    else if (p >= 0.99) R.push({ lv: 'amber', html: `At <b>${c(p)}¢</b> one loss wipes out about <b>${Math.round(p / (1 - p))} wins</b> and the fee alone needs ${esc(p1(p + 0.07 * p * (1 - p)))} wins.` });
    else if (p < 0.9) R.push({ lv: 'amber', html: `Under <b>90¢</b> the bot has no proven edge${band && band.n >= 100 && band.pnl != null ? `: this band is <b class="${cls(band.pnl)}">${esc(usd(band.pnl, true))}</b> on ${esc(fmtN(band.n || 0))} bets` : ''}.` });
    else if (band && band.n >= 100 && band.pnl != null && band.pnl > 0.5) R.push({ lv: 'green', html: `The <b>${esc(cRange(band.lo, band.hi))}</b> band has made <b class="up">${esc(usd(band.pnl, true))}</b> after fees.` });
    else R.push({ lv: 'green', html: 'No loss-making price band here (95¢ and up is the band that has paid after fees).' });
    // 2) the fee against the edge: the win rate this band (else this strategy, else all bets) has had, against the line at this price
    const fee = feeOf(n, p), be = p + 0.07 * p * (1 - p);
    const bw = band && band.w != null && band.l != null && band.w + band.l >= 100 ? band.w / (band.w + band.l) : null;
    const sw = b.strategy ? g.strat.get(String(b.strategy).toLowerCase()) : null;
    const wr = bw != null ? bw : sw != null ? sw : g.all, src = bw != null ? 'bets in this band' : sw != null ? b.strategy : 'all bets';
    if (wr != null) {
      const gap = wr - be, ev = n * gap;
      R.push({ lv: gap < -0.005 ? 'red' : gap <= 0.005 ? 'amber' : 'green', html: `Needs <b>${esc(p1(be))}</b> wins to break even after the <b>${esc(usd(fee))}</b> fee; ${esc(src)} win <b>${esc(p1(wr))}</b>: expect <b class="${cls(ev)}">${esc(usd(ev, true))}</b> on this bet.` });
    } else R.push({ lv: 'amber', html: `The fee is <b>${esc(usd(fee))}</b> and needs <b>${esc(p1(be))}</b> wins to break even; there is not enough history to say if that is met.` });
    // 3) the size against a wipe-out
    if (g.bal != null && g.bal > 0) {
      const sh = cost / g.bal;
      R.push({ lv: sh >= 0.25 ? 'red' : sh >= 0.1 ? 'amber' : 'green', html: `One loss costs <b class="${sh >= 0.1 ? 'down' : ''}">${esc(usd(cost))}</b>, <b>${esc(pct(sh))}</b> of your ${esc(usd(g.bal))}${sh >= 0.25 ? ': three of these would end the account' : sh >= 0.1 ? ': keep it under 10% (the research: 2% to 5%)' : ''}.` });
    }
    // 4) a coin that has lost
    const cat = g.cats.filter((x) => { const nm = String(x.name || '').toLowerCase(); return nm && (nm === String(b.cat || '').toLowerCase() || nm === String(b.asset || '').toLowerCase()); })[0];
    if (cat && num(cat.staked) > 0 && num(cat.trades) >= 30 && num(cat.pnl) / num(cat.staked) < -0.03) {
      R.push({ lv: 'red', html: `<b>${esc(String(cat.name))}</b> bets have lost <b class="down">${esc(usd(num(cat.pnl), true))}</b> on ${esc(usd(num(cat.staked)))} bet (${esc(pct(num(cat.pnl) / num(cat.staked), true))}).` });
    }
    const level = R.reduce((m, r) => (glRank[r.lv] > glRank[m] ? r.lv : m), 'green');
    return { level, reasons: R, cost, ev: wr != null ? n * (wr - be) : null };
  }

  function guardModel(k, v) {
    const g = guardCtx(k, v), ps = v.pos.map(posModel).filter((m) => m.n != null && (m.avg != null || m.px != null));
    const bets = ps.map((m) => ({ m, ...guardBet(g, { n: Math.abs(m.n), p: m.avg != null ? m.avg : m.px, strategy: m.p.strategy, cat: m.p.category, asset: m.asset }) }));
    // bets that settle within 90 s of each other move together: one bad coin move takes them all
    bets.forEach((b) => {
      const same = bets.filter((o) => b.m.closes != null && o.m.closes != null && Math.abs(o.m.closes - b.m.closes) <= 90);
      if (same.length >= 2) {
        const tot = sum(same.map((o) => o.cost));
        b.reasons.push({ lv: 'amber', html: `<b>${same.length} bets</b> settle together (${esc(usd(tot))} at risk): coins move as one, so a bad move can lose them all.` });
        if (b.level === 'green') b.level = 'amber';
      }
    });
    const worst = bets.reduce((mm, b) => (glRank[b.level] > glRank[mm] ? b.level : mm), 'green');
    return { g, bets, worst, red: bets.filter((b) => b.level === 'red').length, amber: bets.filter((b) => b.level === 'amber').length,
      atRisk: sum(bets.filter((b) => b.level === 'red').map((b) => b.cost)) };
  }

  const GPX = [0.91, 0.94, 0.96, 0.98];
  function guardHtml(k, v) {
    const gm = guardModel(k, v), n = gm.bets.length;
    const chk = (() => {
      const p = S.gpx ? +S.gpx : null, bal = gm.g.bal;
      const r = p ? guardBet(gm.g, { n: gm.g.typical, p, strategy: null, cat: '', asset: '' }) : null;
      return `<div class="gd-chk"><p class="lab">Check a bet before it opens · ${esc(fmtN(gm.g.typical))} contracts, the bot's usual size</p>`
        + `<div class="gd-px" role="group" aria-label="Price of the bet to check">${GPX.map((x) => `<button type="button" data-act="gpx" data-v="${x}" aria-pressed="${p === x}">${Math.round(x * 100)}¢</button>`).join('')}</div>`
        + (r ? `<div class="gd-b ${GLV[r.level][1]}"><span class="gd-v ${GLV[r.level][1]}">${GLV[r.level][0]}</span><span class="gd-t">${gm.g.typical} × ${Math.round(p * 100)}¢ = ${esc(usd(r.cost))}${bal ? ` · ${esc(pct(r.cost / bal))} of your balance` : ''}</span>`
          + `<ul class="gd-r">${r.reasons.filter((x) => r.level === 'green' || x.lv !== 'green').map((x) => `<li class="${x.lv}">${x.html}</li>`).join('')}</ul></div>` : '<p class="muted">Tap a price to see the verdict for a bet at that price.</p>')
        + '</div>';
    })();
    const light = n ? gm.worst : 'idle';
    const head = !n ? (S.gpx ? '' : 'No open bets: nothing to stop right now')
      : gm.red ? `Do not take ${gm.red === n ? (n === 1 ? 'this bet' : `any of these ${n} bets`) : `${gm.red} of these ${n} bets`}`
        : gm.amber ? `Careful: ${gm.amber} of ${n} open bets ${gm.amber === 1 ? 'is' : 'are'} near the line` : `OK: nothing open breaks the research rules`;
    const sub = !n ? 'Below is the check for the bot\'s next bet. Nothing is at risk while it is paused.'
      : gm.red ? `${esc(usd(gm.atRisk))} is at risk in the red ${gm.red === 1 ? 'one' : 'ones'}. Suggestions only: this page never places, changes or cancels a bet.`
        : 'Suggestions only: this page never places, changes or cancels a bet.';
    const rows = gm.bets.slice().sort((a, b) => glRank[b.level] - glRank[a.level]).slice(0, 5).map((b) => {
      const lv = GLV[b.level];
      return `<div class="gd-b ${lv[1]}"><span class="gd-v ${lv[1]}">${lv[0]}</span><span class="gd-t">${esc(b.m.title.slice(0, 60))} · ${esc(fmtN(b.m.n))} × ${Math.round((b.m.avg != null ? b.m.avg : b.m.px) * 100)}¢ = ${esc(usd(b.cost))}</span>`
        + `<ul class="gd-r">${b.reasons.filter((x) => b.level === 'green' || x.lv !== 'green').map((x) => `<li class="${x.lv}">${x.html}</li>`).join('')}</ul></div>`;
    }).join('');
    const more = n > 5 ? `<p class="muted">and ${n - 5} more, all in the list below.</p>` : '';
    return `<section class="card guard ${light}" id="sec-guard" aria-label="Do not take this bet: the guard"><div class="gd-top"><span class="gd-light ${light}" aria-hidden="true"></span>`
      + `<div class="gd-h"><span class="lab">The guard · ${n ? n + ' open bet' + (n === 1 ? '' : 's') : 'no open bets'}</span><h3>${esc(head || 'Check a bet')}</h3></div></div><p class="gd-s">${sub}</p>${rows}${more}${chk}</section>`;
  }

  // ================================================================== 2026-11-13 the risk guard on the VM (kalshi_guard.py, team K2)
  // kalshi.json `risk` (only when the guard is installed): the mode it enforces, today's room under the owner's limits, the kill
  // switch, what it blocked and the orders the bot asked about. Read-only: this page never arms, changes or places anything.
  const RK_MODE = { paper: 'Paper', dry_run: 'Dry run', live: 'Live' };
  function riskHtml(k) {
    const r = k && isObj(k.risk) ? k.risk : null;
    if (!r) return '';
    const lim = isObj(r.limits) ? r.limits : {}, td = isObj(r.today) ? r.today : {}, rm = isObj(r.room) ? r.room : {};
    const mode = RK_MODE[r.mode] || 'Paper', bad = !!(r.kill || r.stopped || num(r.unguarded) > 0);
    const lvl = bad ? 'bad' : r.connected === false ? 'warn' : r.mode === 'live' ? 'ok' : 'warn';
    const head = r.kill ? 'Kill switch on: no orders' : num(r.unguarded) > 0 ? `${fmtN(num(r.unguarded))} real order${num(r.unguarded) === 1 ? '' : 's'} went around the guard`
      : r.stopped ? 'Daily stop hit: no new buys until tomorrow (ET)' : r.connected === false ? 'Installed: the bot has not asked it about an order yet'
        : r.mode === 'live' ? 'Live: real orders, inside your limits' : r.mode === 'dry_run' ? 'Dry run: every order logged, none sent' : 'Paper: no real orders';
    const m = (x) => (num(x) == null ? '—' : usd(num(x)));
    const cell = (lab, val, of) => `<div><span class="lab">${esc(lab)}</span><b>${esc(val)}</b>${of ? `<span class="muted small"> of ${esc(of)}</span>` : ''}</div>`;
    const grid = '<div class="rk-g">'
      + cell('Loss room today', m(rm.stop), num(lim.daily_stop_usd) != null ? usd(num(lim.daily_stop_usd)) : '')
      + cell('Spent today', m(td.spend), num(lim.max_day_usd) != null ? usd(num(lim.max_day_usd)) : '')
      + cell('Open now', m(r.open), num(lim.max_open_usd) != null ? usd(num(lim.max_open_usd)) : '')
      + cell('Orders today', `${fmtN(num(td.sent) || 0)} let through · ${fmtN(num(td.blocked) || 0)} blocked`, '') + '</div>';
    const rules = [num(lim.max_order_usd) != null ? `${usd(num(lim.max_order_usd))} per order` : '', num(lim.max_market_usd) != null ? `${usd(num(lim.max_market_usd))} per market` : '',
      num(lim.no_trade_last_s) != null ? `no buys in the last ${fmtN(num(lim.no_trade_last_s))} s` : '', num(lim.min_edge_cents) != null ? `edge after Kalshi's fee ≥ ${num(lim.min_edge_cents)}¢` : '']
      .filter(Boolean).join(' · ');
    const rows = arr(r.intended).filter(isObj).slice(0, 5).map((x) => {
      const px = num(x.price), what = `${String(x.action || 'buy').toUpperCase()} ${fmtN(num(x.contracts) || 0)} ${String(x.side || '').toUpperCase()}${px != null ? ' @ ' + Math.round(px * 100) + '¢' : ''}`;
      const verdict = x.send ? '<b class="up">sent</b>' : x.why ? `<span class="down">blocked</span>: ${esc(String(x.why).slice(0, 100))}` : `not sent (${esc(mode.toLowerCase())})`;
      return `<li><span>${esc(what)} <span class="muted small">${esc(String(x.ticker || '').slice(0, 40))}</span></span><span class="small">${verdict}</span></li>`;
    }).join('');
    const lb = isObj(r.last_block) && r.last_block.text ? `<p class="muted small">Last block${parseT(r.last_block.t) ? ' ' + esc(ago(parseT(r.last_block.t))) : ''}: ${esc(String(r.last_block.text).slice(0, 160))}</p>` : '';
    const go = r.mode !== 'live' && typeof r.go_live === 'string' && /^GO LIVE \d{4}-\d{2}-\d{2} STOP [\d.]+$/.test(r.go_live)
      ? `<p class="muted small">Real money only when you type, on the bot's server: <code>${esc(r.go_live)}</code> (docs/KALSHI_VM_UPDATE.md).</p>` : '';
    return `<section class="card rk ${lvl}" id="sec-risk" aria-label="Risk guard"><div class="card-h"><h2>Risk guard</h2><span class="pill ${lvl}">${esc(mode)}</span>`
      + `${r.why ? `<span class="r muted">${esc(String(r.why).slice(0, 80))}</span>` : ''}</div><p class="rk-h">${esc(head)}</p>${grid}`
      + (rules ? `<p class="muted small">${esc(rules)}</p>` : '') + lb + (rows ? `<ul class="rk-o" aria-label="Orders the bot asked about">${rows}</ul>` : '') + go
      + '<p class="muted small">Read-only: this page never arms, changes or places anything.</p></section>';
  }

  // ================================================================== 2026-11-04 "If you change the bot" and "Why am I losing"
  // The research turned into the owner's money decision, from the numbers the bot publishes (the price bands carry every settled bet in
  // totals). Same maths as tools/kalshi_whatif.py (a test holds the two equal). A BACKTEST of past bets, suggestions only: it never
  // places or changes a bet. Under 100 settled bets it says "not enough bets" instead of numbers.
  const WI_MIN = 100, WI_PATHS = 400, WI_BETS = 200, WI_SEED = 20261104, WI_MINBAL = 6, WI_CAP = 0.02, TAKER = 0.07;
  const WI_NAMES = { asis: 'The bot as it is', A: 'A · skip the 90–95¢ band', B: 'B · only 95¢ and up, 2% bets', C: 'C · skip 90–95¢, 2% bets' };
  const WI_RULES = { asis: 'Every bet as it was placed.', A: 'Skips every bet priced 90–95¢; the rest as they were.',
    B: 'Only bets at 95¢ and up, each shrunk to 2% of today\'s balance.', C: 'Skips 90–95¢ and shrinks every other bet to 2% of today\'s balance.' };
  const wiInLeak = (r) => r.lo >= 0.9 - 1e-9 && r.hi <= 0.95 + 1e-9;
  const usdA = (x, sign) => (x < -0.004 ? '−' : sign && x > 0.004 ? '+' : '') + usd(Math.abs(x));

  function wiRows(k, v) {
    const cal = new Map();
    arr(k.calibration).filter(isObj).forEach((c) => { if (num(c.n) != null && num(c.p) != null) cal.set(Math.round(num(c.n)), num(c.p)); });
    return bucketRows(k, v).rows.filter((r) => r.n > 0 && r.w != null && r.l != null && r.pnl != null && r.st != null && r.st > 0).map((r) => {
      const hi = Math.min(1, r.hi), mid = (r.lo + hi) / 2, p = cal.has(r.n) ? cal.get(r.n) : mid;
      return { lo: r.lo, hi, n: r.n, w: r.w, l: r.l, pnl: r.pnl, st: r.st, p: Math.min(0.98, Math.max(0.02, p)) };
    });
  }
  function wiSize(r) {
    const f = TAKER * (1 - r.p), win = 1 / r.p - 1 - f;
    if (r.w > 0 && r.l > 0 && r.st > 0) {
      const sl = (r.st * win - r.pnl) / (r.l * (win + 1 + f)), sw = (r.st - sl * r.l) / r.w;
      if (sl > 0 && sw > 0) return [sw, sl, win, f];
    }
    const e = r.st / r.n;
    return [e, e, win, f];
  }
  function wiKeep(rows, rule, cap) {
    const keep = rows.filter((r) => rule === 'asis' || ((rule === 'A' || rule === 'C') && !wiInLeak(r)) || (rule === 'B' && r.lo >= 0.95 - 1e-9));
    const capped = rule === 'B' || rule === 'C';
    return keep.map((r) => [r, capped ? Math.min(1, cap / (r.st / r.n)) : 1]);
  }
  function wiSim(rows, rule, bal, t0, cap) {
    const kept = wiKeep(rows, rule, cap);
    if (!kept.length || !(bal > 0)) return { ruin: null, half: null, dip: null };
    const sAll = sum(rows.map((r) => r.st)) / Math.max(1, sum(rows.map((r) => r.n))), g = sAll > 0 ? t0 / sAll : 1, capped = rule === 'B' || rule === 'C';
    const tot = sum(kept.map((x) => x[0].n));
    const pre = kept.map(([r]) => {
      const [sw, sl, win, f] = wiSize(r), u = g * (capped ? Math.min(1, cap / ((r.st / r.n) * g)) : 1);
      return [r.n / tot, r.w / r.n, sw * win * u, sl * (1 + f) * u];
    });
    let seed = WI_SEED;
    const rnd = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
    let ruined = 0, half = 0;
    const dips = [];
    for (let i = 0; i < WI_PATHS; i++) {
      let b = bal, peak = bal, dd = 0, low = bal, dead = false;
      for (let j = 0; j < WI_BETS; j++) {
        const x = rnd();
        let q = 0, acc = pre[0][0];
        while (x > acc && q < pre.length - 1) { q++; acc += pre[q][0]; }
        b += rnd() < pre[q][1] ? pre[q][2] : -pre[q][3];
        if (b > peak) peak = b;
        if (b < low) low = b;
        if (peak - b > dd) dd = peak - b;
        if (b < WI_MINBAL) { dead = true; break; }
      }
      if (dead) ruined++;
      if (low < bal / 2) half++;
      dips.push(dd);
    }
    dips.sort((a, b) => a - b);
    return { ruin: ruined / WI_PATHS, half: half / WI_PATHS, dip: dips[Math.floor(WI_PATHS / 2)] };
  }
  function whatifModel(k, v) {
    const rows = wiRows(k, v), bal = num(k.balance), n = sum(rows.map((r) => r.n));
    const out = { n, enough: n >= WI_MIN && bal != null && bal > 0, balance: bal, sets: [] };
    if (!out.enough) { out.recommend = `Not enough bets yet (${fmtN(n)} of ${WI_MIN}) to say what a change would do.`; return out; }
    const cap = WI_CAP * bal;
    const costs = v.tr.filter((t) => t.action !== 'sell' && num(t.contracts) != null && dol(t.price) != null && dol(t.price) > 0 && dol(t.price) <= 1.0001).map((t) => num(t.contracts) * dol(t.price)).sort((a, b) => a - b);
    const t0 = costs.length ? costs[Math.floor(costs.length / 2)] : 6 * 0.96;
    out.cap = cap; out.t0 = t0;
    ['asis', 'A', 'B', 'C'].forEach((id) => {
      const kept = wiKeep(rows, id, cap), sim = wiSim(rows, id, bal, t0, cap);
      out.sets.push({ id, name: WI_NAMES[id], bets: sum(kept.map((x) => x[0].n)), net: sum(kept.map(([r, m]) => r.pnl * m)), dip: sim.dip, ruin: sim.ruin, half: sim.half });
    });
    const base = out.sets[0], ok = out.sets.slice(1).filter((x) => x.net > base.net && x.ruin != null && x.ruin <= 0.05);
    const pick = ok.length ? ok.reduce((a, b) => (b.net > a.net ? b : a)) : null, rp = (x) => (!x.ruin ? '0%' : Math.round(x.ruin * 100) + '%');
    out.pick = pick ? pick.id : null;
    out.recommend = pick ? `The data supports ${pick.name.split(' · ')[0]}: ${usdA(pick.net, true)} after fees on the past bets and a ${rp(pick)} chance of ruin, against ${usdA(base.net, true)} and ${rp(base)} as the bot is. The band was picked after looking at these bets: try it on paper first.`
      : 'Keep the bot as it is: none of the three rule sets beats it on the past bets with a ruin chance under 5%.';
    return out;
  }
  function whyModel(k, v) {
    const rows = wiRows(k, v), n = sum(rows.map((r) => r.n)), st = isObj(k.stats) ? k.stats : null;
    const total = num(k.total_pnl) != null ? num(k.total_pnl) : st ? num(st.pnl) : null;
    if (n < WI_MIN || total == null) return { enough: false, n, text: `Not enough settled bets yet (${fmtN(n)} of ${WI_MIN}) to say why.` };
    const leaks = [];
    rows.forEach((r) => { if (r.pnl < -0.5) leaks.push({ kind: 'band', usd: r.pnl, label: `${cRange(r.lo, r.hi)} bets`, n: r.n, to: 'sec-bk' }); });
    arr(k.categories).filter(isObj).forEach((c) => { if (num(c.pnl) != null && num(c.pnl) < -0.5 && (num(c.trades) || 0) >= 30) leaks.push({ kind: 'coin', usd: num(c.pnl), label: `${c.name} bets`, n: num(c.trades), to: 'sec-cat' }); });
    v.strat.forEach((x) => { if (num(x.total_pnl) != null && num(x.total_pnl) < -0.5 && (num(x.trades) || 0) >= 30) leaks.push({ kind: 'strategy', usd: num(x.total_pnl), label: `the ${x.name} strategy`, n: num(x.trades), to: 'sec-strat' }); });
    const fees = sum(rows.map((r) => TAKER * r.st * (1 - r.p)));
    if (fees >= 5) leaks.push({ kind: 'fees', usd: -fees, label: 'Kalshi\'s fees', n: null, to: 'sec-cb' });
    leaks.sort((a, b) => a.usd - b.usd);
    const top = [], seen = new Set();
    leaks.forEach((x) => { if (top.length < 2 && !seen.has(x.kind)) { seen.add(x.kind); top.push(x); } });
    const say = (x) => (x.kind === 'fees' ? `Kalshi's fees cost about ${usdA(Math.abs(x.usd))}` : `${x.label} lost ${usdA(Math.abs(x.usd))}${x.n ? ` on ${fmtN(x.n)} bets` : ''}`);
    const text = !top.length ? (total < 0 ? `You are down ${usdA(Math.abs(total))} but no single price band, coin or strategy stands out.` : `You are up ${usdA(total, true)} and no single leak is bigger than $0.50.`)
      : (total < 0 ? `You are down ${usdA(Math.abs(total))} mostly because ` : `You are up ${usdA(total, true)}, but the two biggest leaks are `) + top.map(say).join(' and ') + '. These overlap, so do not add them up.';
    return { enough: true, n, total, leaks: top, text };
  }
  function whyHtml(k, v) {
    const m = whyModel(k, v), loss = m.enough && m.total < 0;
    return `<section class="card why ${m.enough ? (loss ? 'neg' : 'pos') : 'idle'}" id="sec-why" aria-label="${loss ? 'Why am I losing' : 'Where the money goes'}"><span class="lab">${loss || !m.enough ? 'Why am I losing' : 'Where the money goes'}</span>`
      + `<p class="why-t">${esc(m.text)}</p>${m.enough ? '<button type="button" class="why-b" data-act="jump" data-v="sec-whatif">What to change <em aria-hidden="true">›</em></button>' : ''}</section>`;
  }

  // ---- the forward test strip (bottom of the what-if card): RETIRED (2026-11-20). ../kalshicity/forward.json came only from tools/kalshi_forward.py on
  // the retired kalshi-feed repo (suspended account, 2026-11-19), so it will never exist again: the page no longer asks for it and says so plainly.
  function fwdStrip() {
    return '<div class="wi-fwd" id="wi-fwd"><b>Forward test</b> · retired: it counted the old Kalshi bot\'s new bets, and that bot\'s feed was switched off on 2026-11-19. '
      + 'The K8 gold and silver bot is tested on paper on your home computer instead (the K8 status card at the top).</div>';
  }

  // ---- "Rewards test (paper)" (owner 2026-11-17): tools/kalshi_rewards_paper.py keeps pretend two-sided orders on Kalshi's paid-liquidity markets.
  // Its numbers: the PC's 15-minute status post (ntfy topic of ../status_feed.json, key kalshi_rewards, tools/pc_report.py lite) when that is newer,
  // else rewards.json in this folder (a dated copy + the 30-day backtest line, research/writeups/kalshi-rewards-backtest-2026-11-17.md). $0 at risk.
  const RW = { j: null, src: '', bt: null };
  const rwUsd = (x, sign) => { const v = num(x); return v == null ? '–' : (v < -0.004 ? '−' : sign && v > 0.004 ? '+' : '') + '$' + Math.abs(v).toFixed(2); };
  function rwOk(j) { return isObj(j) && j.kind === 'kalshi_rewards_pub' && j.paper_only === true && num(j.reward) != null; }
  // how old the numbers are (the PC child writes every minute, the PC posts every 15 min; over 1 h old = the PC copy is late)
  function rwAge(j) {
    const up = Date.parse((j && j.updated) || '');
    if (!Number.isFinite(up)) return { s: 'age unknown', old: true };
    const m = Math.max(0, (Date.now() - up) / 60000);
    const s = m < 2 ? 'just now' : m < 60 ? Math.round(m) + ' min ago' : m < 48 * 60 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago';
    return { s, old: m > 60 };
  }
  function rwLine() {                                 // the status line's rewards part (#kpaused-rw)
    const el = $('#kpaused-rw'), j = RW.j;
    if (!el) return;
    if (!rwOk(j)) { el.textContent = 'rewards (no numbers yet)'; return; }
    const d = num(j.days);
    el.textContent = `rewards (net ${rwUsd(j.net, true)} over ${d == null ? '?' : d < 1 ? d.toFixed(1) : String(Math.round(d * 10) / 10)} day${d === 1 ? '' : 's'})`;
  }
  function rwHtml() {
    const j = RW.j, bt = RW.bt;
    if (!rwOk(j)) return '';
    const d = num(j.days), up = Date.parse(j.updated || ''), when = Number.isFinite(up) ? new Date(up).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '', age = rwAge(j);
    const cell = (t, v, c) => `<div><dt>${t}</dt><dd class="${c || ''}">${v}</dd></div>`;
    const per = num(j.per100_day);
    return '<p><b>Rewards test (paper)</b> Pretend orders that earn Kalshi\'s liquidity rewards. $0 at risk, nothing is placed.</p>'
      + '<dl class="krw-g">' + cell('Earned', esc(rwUsd(j.reward, true)), cls(j.reward)) + cell('Fills', esc(rwUsd(j.fill_pnl, true)), cls(j.fill_pnl))
      + cell('Net', esc(rwUsd(j.net, true)), cls(j.net)) + cell('Days', d == null ? '–' : esc(d < 1 ? d.toFixed(1) : String(Math.round(d * 10) / 10))) + '</dl>'
      + `<p class="krw-f">${per != null ? esc(rwUsd(per, true)) + ' a day per $100 parked · ' : ''}${esc(fmtN(num(j.fills) || 0))} fill${num(j.fills) === 1 ? '' : 's'}`
      + `${when ? ' · ' + esc(when) : ''} · ${RW.src === 'pc' ? 'from the PC' : 'saved copy'} · <span class="krw-age${age.old ? ' old' : ''}">updated ${esc(age.s)}${age.old ? (RW.src === 'pc' ? ' (late)' : ' (the PC has not sent newer numbers)') : ''}</span></p>`
      + (isObj(bt) && bt.text ? `<p class="krw-f">Backtest (30 days): ${esc(String(bt.text).slice(0, 220))}</p>` : '');
  }
  function rwShow() {
    const el = $('#krw');
    if (!el) return;
    const h = rwHtml();
    el.innerHTML = h;
    el.hidden = !h;
    rwLine();
  }
  async function rwGet(url, ms, text) {
    let ac = null, tm = 0;
    try { ac = new AbortController(); tm = setTimeout(() => ac.abort(), ms); } catch (_) { ac = null; }
    try { const r = await fetch(url, { cache: 'no-cache', signal: ac ? ac.signal : undefined }); if (!r || !r.ok) return null; return text ? await r.text() : await r.json(); } catch (_) { return null; } finally { clearTimeout(tm); }
  }
  async function rewardsLoad() {
    const own = await rwGet('rewards.json', 4000);
    if (isObj(own)) { RW.bt = isObj(own.backtest) ? own.backtest : null; if (rwOk(own.paper)) { RW.j = own.paper; RW.src = 'copy'; } }
    rwShow();
    const feed = await rwGet('../status_feed.json', 3000);
    if (!isObj(feed) || !/^[A-Za-z0-9_-]{1,64}$/.test(String(feed.topic || '')) || !/^https:\/\/[A-Za-z0-9.-]+\/?$/.test(String(feed.ntfy || ''))) return;   // the host comes from the site's own status_feed.json
    const txt = await rwGet(String(feed.ntfy).replace(/\/+$/, '') + '/' + encodeURIComponent(feed.topic) + '/json?poll=1&since=12h', 5000, true);
    let best = null;
    for (const line of String(txt || '').split('\n')) {
      let m = null, x = null;
      try { m = JSON.parse(line); x = JSON.parse(m.message); } catch (_) { continue; }
      const kr = !isObj(x) ? null : x.kind === 'le-live' ? x.kalshi_rewards : x.kind === 'le-live-ext' && isObj(x.x) ? x.x.kalshi_rewards : null;   // the old single post or the ext post (2026-11-18 split)
      if (rwOk(kr) && (!best || String(kr.updated || '') >= String(best.updated || ''))) best = kr;
    }
    if (best && (!RW.j || String(best.updated || '') >= String(RW.j.updated || ''))) { RW.j = best; RW.src = 'pc'; rwShow(); subFix(); }
  }

  // ---- "K1 rules test (paper)": tools/kalshi_paper.py (weather lock + NQ hourly model) on the PC; its tiny card (key kalshi_k1, <= 200 bytes) rides the
  // PC's ntfy ext post (tools/pc_report.py). No numbers -> the card says plainly that it is not running / not arriving. $0 at risk.
  const K1 = { j: null };
  function k1Ok(j) { return isObj(j) && j.kind === 'kalshi_k1_pub' && j.paper_only === true && num(j.sig) != null && num(j.set) != null; }
  function k1Show() {
    const el = $('#kk1'), ln = $('#kpaused-k1'), j = K1.j;
    if (!k1Ok(j)) { if (ln) ln.textContent = 'K1 rules (not running yet)'; return; }
    const d = num(j.days), age = rwAge(j), pu = num(j.pu);
    if (ln) ln.textContent = `K1 rules (${rwUsd(j.net, true)} over ${d == null ? '?' : d < 1 ? d.toFixed(1) : String(Math.round(d * 10) / 10)} day${d === 1 ? '' : 's'})`;
    if (!el) return;
    const cell = (t, v, c) => `<div><dt>${t}</dt><dd class="${c || ''}">${v}</dd></div>`;
    el.innerHTML = '<p><b>K1 rules test (paper)</b> Weather lock and Nasdaq hourly rules, 1 contract each, fee included. $0 at risk, nothing is placed.</p>'
      + '<dl class="krw-g">' + cell('Signals', esc(fmtN(num(j.sig) || 0))) + cell('Settled', esc(fmtN(num(j.set) || 0)))
      + cell('Net', esc(rwUsd(j.net, true)), cls(j.net)) + cell('Days', d == null ? '–' : esc(d < 1 ? d.toFixed(1) : String(Math.round(d * 10) / 10))) + '</dl>'
      + `<p class="krw-f">${pu != null ? esc(rwUsd(pu, true)) + ' per $1 bet · ' : ''}from the PC · <span class="krw-age${age.old ? ' old' : ''}">updated ${esc(age.s)}${age.old ? ' (late)' : ''}</span></p>`;
  }
  async function k1Load() {
    const feed = await rwGet('../status_feed.json', 3000);
    if (!isObj(feed) || !/^[A-Za-z0-9_-]{1,64}$/.test(String(feed.topic || '')) || !/^https:\/\/[A-Za-z0-9.-]+\/?$/.test(String(feed.ntfy || ''))) return;
    const txt = await rwGet(String(feed.ntfy).replace(/\/+$/, '') + '/' + encodeURIComponent(feed.topic) + '/json?poll=1&since=12h', 5000, true);
    let best = null, live = null;
    for (const line of String(txt || '').split('\n')) {
      let m = null, x = null;
      try { m = JSON.parse(line); x = JSON.parse(m.message); } catch (_) { continue; }
      const k = !isObj(x) ? null : x.kind === 'le-live' ? x.kalshi_k1 : x.kind === 'le-live-ext' && isObj(x.x) ? x.x.kalshi_k1 : null;
      if (k1Ok(k) && (!best || String(k.updated || '') >= String(best.updated || ''))) best = k;
      const kl = !isObj(x) ? null : x.kind === 'le-live' ? x.kalshi_live : x.kind === 'le-live-ext' && isObj(x.x) ? x.x.kalshi_live : null;   // the same ext post
      if (klOk(kl) && (!live || String(kl.u || '') >= String(live.u || ''))) live = kl;
    }
    if (best) { K1.j = best; k1Show(); }
    if (live) { KLV.j = live; klShow(); }
    subFix();
  }

  // ---- Kalshi LIVE (engine/kalshi_live.py, night-klive 2026-11-19): OFF until the owner types the phrase on the PC. Its <= 200-byte card
  // {kind: kalshi_live_pub, st: off | live | paused | stopped | idle, net, f, o, cap, stop, u, why} rides the same PC ext post (key kalshi_live).
  // No card, or st off = the page keeps saying "PAUSED: ready to go live when you type the phrase" and "$0 at risk".
  const KLV = { j: null };
  function klOk(j) { return isObj(j) && j.kind === 'kalshi_live_pub' && ['off', 'paper', 'live', 'paused', 'stopped', 'idle'].includes(j.st); }

  // ---- K8 status card (night-kalshi8 2026-11-20): the card's k8 block (engine/kalshi_clock.card_k8: m L|P, nx next window, b bankroll,
  // s $ a bet, td [bets, won, net] today, l last 10 'WLW..', wk / dd [$ used, stop], wr [bets, % won], lp loop). Without it: the $55 rule
  // + the next window computed here (weekdays: London 10:15 = gold DOWN, 16:45 ET = gold + silver UP; Thanksgiving/early closes skip the evening).
  const K8 = { nx: null, tm: 0 };
  function tzEpoch(y, mo, d, h, mi, tz) {            // the epoch (ms) of a wall time in a time zone, no library
    let g = Date.UTC(y, mo, d, h, mi);
    for (let k = 0; k < 2; k++) {
      const p = {}; for (const x of new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(g))) p[x.type] = +x.value || 0;
      g += Date.UTC(y, mo, d, h, mi) - Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute);
    }
    return g;
  }
  const K8_SKIP_PM = ['2026-11-26', '2026-11-27', '2026-12-24', '2026-12-25', '2027-01-01', '2027-03-26'], K8_SKIP_AM = ['2026-12-25', '2026-12-28', '2027-01-01', '2027-03-26', '2027-03-29'];
  function k8Next(now) {
    try {
      for (let a = 0; a < 9; a++) {
        const t = new Date(now + a * 86400000), p = {};
        for (const x of new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(t)) p[x.type] = x.value;
        if (p.weekday === 'Sat' || p.weekday === 'Sun') continue;
        const y = +p.year, mo = +p.month - 1, d = +p.day, iso = `${p.year}-${p.month}-${p.day}`;
        const c = [];
        if (!K8_SKIP_AM.includes(iso)) c.push(tzEpoch(y, mo, d, 10, 15, 'Europe/London'));
        if (!K8_SKIP_PM.includes(iso)) c.push(tzEpoch(y, mo, d, 16, 45, 'America/New_York'));
        const n = c.filter((x) => x + 20000 > now).sort((u, v) => u - v)[0];
        if (n) return n;
      }
    } catch (_) { /* old browsers: no countdown */ }
    return null;
  }
  // ---- K8 LIVE DAY (day-kalshi round 3): the next LIVE window (05:15 / 16:45 ET) as a big countdown, what the bot will do there,
  // the $ left before each stop (and how many $2.50 bets still fit), from the card's dy / wk / dd and the $55 rule. No order, no key.
  const K8V = { key: '' };
  const k8Cost = () => { const s = num(K8D.k && K8D.k.s) || 2.5; return s + 0.09; };        // a bet + its worst fee (5 contracts: 9c)
  function k8NextLive(now) {
    const legs = k8Legs().filter((L) => L.live);
    for (let a = 0; a < 9; a++) {
      const D = k8Day(now + a * 86400000);
      if (D.wd === 'Sat' || D.wd === 'Sun') continue;
      const by = {};
      for (const L of legs) {
        if (k8Skip(L.sk, D.iso)) continue;
        const t = tzEpoch(D.y, D.mo, D.d, L.o[0], L.o[1], L.tz);
        if (t + 20000 > now - 900000) (by[t] = by[t] || []).push(L);
      }
      const ts = Object.keys(by).map(Number).sort((x, y) => x - y);
      for (const t of ts) if (t + 900000 > now) return { t, legs: by[t], D, today: a === 0 };
    }
    return null;
  }
  function k8Left() {                                 // $ left before each stop: [label, left, stop]
    const k = K8D.k || {}, R = K8D.j && isObj(K8D.j.rule) ? K8D.j.rule : {};
    const pair = (a, st) => { const u = num(arr(a)[0]) || 0, s = num(arr(a)[1]) || st; return [Math.max(0, s - u), s]; };
    return [['Today', ...pair(k.dy, num(R.day_stop) || 8)], ['This week', ...pair(k.wk, num(R.week_stop) || 13.75)], ['From the peak', ...pair(k.dd, num(R.dd_stop) || 19.25)]];
  }
  function k8Live(now) {
    const big = $('#k8d-big'), at = $('#k8d-at'), lab = $('#k8d-lab'), x = $('#k8d-x');
    if (!big || !x) return;
    const W = k8NextLive(now);
    if (!W) { big.textContent = '–'; return; }
    const s = Math.round((W.t + 20000 - now) / 1000);
    const hh = Math.floor(Math.max(0, s) / 3600), mm = Math.floor((Math.max(0, s) % 3600) / 60), ss = Math.max(0, s) % 60;
    const pad = (v) => String(v).padStart(2, '0');
    const names = W.legs.map((L) => L.n).join(' + ');
    big.textContent = s > 0 ? `${hh ? hh + ':' : ''}${pad(mm)}:${pad(ss)}` : 'betting now';
    if (lab) lab.textContent = s > 0 ? `Next live bet: ${names}` : `In the window: ${names}`;
    if (at) at.textContent = `${W.today ? 'today' : W.D.wd + ' ' + W.D.md} ${k8HM(W.t)} ET (the bot buys at +20 s; results at ${k8HM(W.t + 900000)} ET)`;
    const st = KLV.j && KLV.j.st, live = st === 'live', left = k8Left(), cost = k8Cost();
    const fit = Math.max(0, Math.floor(Math.min(left[0][1], left[1][1], left[2][1]) / cost + 1e-9));
    const used = num(arr(K8D.k && K8D.k.td)[0]) || 0, slots = Math.max(0, 3 - (W.today ? used : 0));
    const key = [W.t, st, JSON.stringify(left), used, K8D.j ? K8D.j.through : ''].join('|');
    if (key === K8V.key) return;
    K8V.key = key;
    const fair = {};
    for (const L of k8Legs()) fair[L.c] = L.x || {};
    const n = W.legs.length, will = n > Math.min(fit, slots) ? Math.min(fit, slots) : n;
    const what = !live ? `<p class="k8d-w paper"><b>PAPER:</b> at ${esc(k8HM(W.t))}:20 ET it records ${esc(names)} with no money. Real bets start only after you type the phrase on :8444/kalshi-live/.</p>`
      : will <= 0 ? `<p class="k8d-w stop"><b>It will NOT bet:</b> ${fit <= 0 ? 'a stop is reached (no $2.50 bet fits in the $ left below)' : 'today\'s 3 bets are used'}.</p>`
        : `<p class="k8d-w live"><b>At ${esc(k8HM(W.t))}:20 ET it buys ${will < n ? will + ' of ' : ''}${esc(names)}</b>: ${W.legs.map((L) => (L.n.indexOf('DOWN') >= 0 ? 'NO' : 'YES')).join(' / ')}, about 4-6 contracts each at up to 70¢, at most $2.50 a bet (+ 7-9¢ fee). It skips a bet if the price is over 70¢ or a stop would be passed. A push comes when it is in, and one with the result.</p>`;
    const legs = W.legs.map((L) => {
      const f = fair[L.c], p = num(f.last_c), fc = num(f.fair_c), ed = p != null && fc != null ? Math.round(fc) - Math.round(p) : null;
      return `<li data-leg="${esc(L.c)}"><span>${esc(L.n)}</span><span>last ${esc(k8c(p))} · fair ${esc(k8c(fc))}${ed == null ? '' : ` · <b class="${ed > 0 ? 'k8-g' : 'k8-r'}">${ed > 0 ? '+' : ed < 0 ? MINUS : ''}${Math.abs(ed)}¢</b>`}</span></li>`;
    }).join('');
    const rows = left.map(([t, l, s]) => `<div><dt>${esc(t)}</dt><dd class="${l < cost ? 'red' : l < 2 * cost ? 'hot' : ''}">${esc(usd(l))} <i>of ${esc(usd(s))}</i></dd></div>`).join('');
    x.innerHTML = what + `<ul class="k8d-l" id="k8d-legs">${legs}</ul><p class="krw-f">Last = what Kalshi takers paid at +20 s on the leg's last day${K8D.j && typeof K8D.j.through === 'string' ? ' (Kalshi numbers through ' + esc(K8D.j.through.slice(5, 10)) + ')' : ' (no Kalshi numbers on this site yet)'}; fair = where the bet breaks even (its win rate minus the fee).</p>`
      + `<p class="k8w-h">Left before each stop</p><dl class="krw-g k8d-s" id="k8d-s">${rows}</dl>`
      + `<p class="krw-f" id="k8d-fit">Room for <b>${esc(fmtN(fit))}</b> more $2.50 bet${fit === 1 ? '' : 's'} before the tightest stop${W.today ? `; ${esc(fmtN(slots))} of today's 3 left` : ''}.</p>`;
  }
  // ---- Monday go-live checklist (day-kalshi, Olympus 2): an item ticks itself from the PC's card (k8: kk key on the PC, al alerts, s the bet,
  // lp the loop; the card's st live = the phrase typed); the others the owner ticks on this phone (localStorage only, never sent).
  const KGO_KEY = 'kalshi.golive.v1';
  const KGO = [
    { id: 'dep', t: 'Kalshi account has the $55 (no more deposits)' },
    { id: 'key', t: 'Kalshi API key saved on the PC (phone: your PC link :8444/kalshi-live/, "Key OK · balance $55.00")', pc: (k) => (k.kk === 1 ? true : k.kk === 0 ? false : null) },
    { id: 'pc', t: 'The PC is on and running K8', pc: (k) => (k.lp === 1 ? true : k.lp === 0 ? false : null) },
    { id: 'stake', t: 'Bet size $2.50 (the rule for $55)', pc: (k) => (num(k.s) == null ? null : Math.abs(num(k.s) - 2.5) < 1e-9) },
    { id: 'alerts', t: 'Phone alerts on (ntfy): a push when a bet goes in and when it settles', pc: (k) => (k.al === 1 ? true : k.al === 0 ? false : null) },
    { id: 'live', t: 'Phrase typed: I ACCEPT KALSHI LIVE RISK (K8 shows LIVE)', pc: (k, st) => (st === 'live' || st === 'paused' ? true : st ? false : null) }];
  function kgoMine() { try { const j = JSON.parse(localStorage.getItem(KGO_KEY) || '{}'); return isObj(j) ? j : {}; } catch (_) { return {}; } }
  function kgoSave(m) { try { localStorage.setItem(KGO_KEY, JSON.stringify(m)); } catch (_) { /* private mode: ticks last this visit only */ } }
  const KGOM = { m: null };
  function kgo() {
    const ul = $('#kgo-l'), n = $('#kgo-n');
    if (!ul) return;
    if (!KGOM.m) KGOM.m = kgoMine();
    const k = K8D.k || {}, st = KLV.j && klOk(KLV.j) ? KLV.j.st : null, age = KLV.j ? rwAge({ updated: KLV.j.u }) : null;
    let done = 0;
    ul.innerHTML = KGO.map((x) => {
      const pc = x.pc ? x.pc(k, st) : null, mine = !!KGOM.m[x.id], on = pc === true || (pc == null && mine);
      if (on) done += 1;
      const why = pc === true ? `from your PC${age ? ', ' + age.s : ''}` : pc === false ? 'the PC says not yet' : mine ? 'ticked by you' : '';
      return `<li class="${on ? 'on' : ''}${pc === false ? ' no' : ''}"><label><input type="checkbox" data-kgo="${esc(x.id)}"${on ? ' checked' : ''}${pc != null ? ' disabled' : ''}>`
        + `<span>${esc(x.t)}${why ? ` <i>${esc(why)}</i>` : ''}</span></label></li>`;
    }).join('');
    if (n) { n.textContent = done === KGO.length ? 'ready' : `${done} of ${KGO.length}`; n.className = 'kgo-n' + (done === KGO.length ? ' ok' : ''); }
  }
  function kgoInit() {
    const ul = $('#kgo-l'), r = $('#kgo-reset');
    if (!ul || ul.dataset.on) return;
    ul.dataset.on = '1';
    ul.addEventListener('change', (e) => {
      const id = e.target && e.target.getAttribute && e.target.getAttribute('data-kgo');
      if (!id) return;
      KGOM.m = Object.assign(kgoMine(), { [id]: !!e.target.checked });
      kgoSave(KGOM.m);
      kgo();
    });
    if (r) r.addEventListener('click', () => { KGOM.m = {}; kgoSave({}); kgo(); });
    kgo();
  }
  function k8Sub() {                                  // the header line: K8's state, never the old bot's
    const m = $('#k8sub-m');
    if (!m) return;
    const st = KLV.j && klOk(KLV.j) ? KLV.j.st : null;
    const t = st === 'live' ? 'LIVE' : st === 'paused' ? 'PAUSED' : st === 'stopped' ? 'STOPPED' : st === 'idle' ? 'ARMED, PC not running it' : 'PAPER';
    if (m.textContent !== t) { m.textContent = t; m.className = st === 'live' ? 'live' : st === 'stopped' || st === 'idle' ? 'bad' : ''; }
  }
  // ---- K8 TODAY (Olympus 2): the one-glance card at the top. Text only through esc / textContent.
  const K8T = { key: '' };
  function k8Top(now) {
    const ul = $('#k8top-legs');
    if (!ul) return;
    const k = K8D.k || {}, j = KLV.j && klOk(KLV.j) ? KLV.j : null, st = j ? j.st : null;
    const m = $('#k8top-m'); if (m) { const t = st === 'live' ? 'LIVE' : st === 'paused' ? 'PAUSED' : st === 'stopped' ? 'STOPPED' : st === 'idle' ? 'ARMED, PC off' : 'PAPER'; if (m.textContent !== t) { m.textContent = t; m.className = 'k8t-m ' + (st === 'live' ? 'live' : st === 'stopped' || st === 'idle' ? 'bad' : ''); } }
    const ag = $('#k8top-age');
    if (ag) { const a = j ? rwAge({ updated: j.u }) : null, t = a ? `PC data ${a.s}` : 'no PC data yet'; if (ag.textContent !== t) { ag.textContent = t; ag.className = 'k8t-age' + (!a || a.old ? ' old' : ''); } }
    const W = k8NextLive(now), nx = $('#k8top-next');
    if (nx) {
      let t = 'Next: no live window this week';
      if (W) { const s = Math.round((W.t + 20000 - now) / 1000), hh = Math.floor(Math.max(0, s) / 3600), mm = Math.floor((Math.max(0, s) % 3600) / 60), ss = Math.max(0, s) % 60;
        t = `Next: ${W.legs.map((L) => L.n).join(' + ')} · ${W.today ? '' : W.D.wd + ' '}${k8HM(W.t)} ET · ${s > 0 ? `in ${hh ? hh + ':' : ''}${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : 'betting now'}`; }
      if (nx.textContent !== t) nx.textContent = t;
    }
    const R = k8Rows(now), day = k8Day(now).md, lg = arr(k.lg).filter(Array.isArray);
    const rows = R ? R.rows.filter((r) => r.L.live).map((r) => {
      const b = R.today ? lg.filter((x) => x[0] === r.L.c && x[1] === day).pop() : null;
      let st2, cl = '';
      if (r.skip) { st2 = r.L.sk === 'uk' ? 'skipped (UK holiday)' : 'skipped (CME holiday)'; cl = 'sk'; }
      else if (b && b[5] === 'W') { st2 = `WON ${usd(num(b[4]), true)}`; cl = 'w'; }
      else if (b && b[5] === 'L') { st2 = `LOST ${usd(num(b[4]), true)}`; cl = 'l'; }
      else if (b) { st2 = `in: ${fmtN(num(b[2]) || 0)} at ${Math.round(num(b[3]) || 0)}¢, result ${k8HM(r.t + 900000)}`; cl = 'o'; }
      else st2 = k8Cd(r, now) === 'done' ? 'done, no bet seen' : k8Cd(r, now);
      return `<li class="${cl}" data-leg="${esc(r.L.c)}"><b>${esc(k8HM(r.t))}</b><span>${esc(r.L.n)}</span><em>${esc(st2)}</em></li>`;
    }).join('') : '';
    const pn = arr(k.pn), led = k.m === 'L' ? 'Live' : 'Paper';
    const pl = num(pn[0]) == null ? `${led} $: no settled bets yet` : `${led} $: today ${usd(num(pn[0]), true)} · this week ${usd(num(pn[1]), true)} · since the start ${usd(num(pn[2]), true)}`;
    const key = rows + '|' + pl + '|' + (R ? R.D.iso : '');
    if (key !== K8T.key) {
      K8T.key = key;
      ul.innerHTML = rows ? `<li class="hd">${R && R.today ? 'Today' : esc((R ? R.D.wd + ' ' + R.D.md : ''))}, New York time</li>${rows}` : '';
      const p = $('#k8top-pnl'); if (p) p.textContent = pl;
    }
    const g = $('#k8top-gon'), gn = $('#kgo-n'); if (g && gn && g.textContent !== gn.textContent) g.textContent = gn.textContent;
  }
  function k8Tick() {
    const now = Date.now();
    try { k8Top(now); } catch (_) { /* the top card never stops the countdown */ }
    try { kgoInit(); k8Sub(); } catch (_) { /* the checklist never stops the countdown */ }
    try { k8Live(now); } catch (_) { /* the live-day view never stops the countdown */ }
    try { k8Win(now); } catch (_) { /* the windows list never stops the countdown */ }
    const el = $('#k8s-cd');
    if (!el) return;
    if (!K8.nx || K8.nx + 20000 < now) K8.nx = k8Next(now);
    if (!K8.nx) { el.textContent = '–'; return; }
    const x = Math.max(0, Math.round((K8.nx + 20000 - now) / 1000)), h = Math.floor(x / 3600), m = Math.floor((x % 3600) / 60);
    let at = '';
    try { at = new Date(K8.nx).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }) + ' ET'; } catch (_) { at = ''; }
    el.textContent = x <= 0 ? 'now' : `${h ? h + 'h ' : ''}${m}m${h ? '' : ' ' + (x % 60) + 's'}${at ? ' (' + at + ')' : ''}`;
  }
  function k8Show(j) {
    const k = isObj(j) && isObj(j.k8) ? j.k8 : null, g = $('#k8s-g'), x = $('#k8s-x'), mm = $('#k8s-m');
    if (!g || !x) return;
    if (k && num(k.nx)) K8.nx = num(k.nx) * 1000;
    if (!K8.tm) { K8.tm = setInterval(k8Tick, 1000); }
    k8Tick();
    if (!k) { k8Extra(); return; }
    K8D.k = k;
    try { kgo(); k8Sub(); K8T.key = ''; k8Top(Date.now()); } catch (_) { /* never blocks the card */ }
    const live = j.st === 'live' || j.st === 'paused', led = k.m === 'L' ? 'live' : 'paper', td = arr(k.td), age = rwAge({ updated: j.u });
    if (mm) { mm.textContent = live ? (j.st === 'paused' ? 'PAUSED' : 'LIVE') : j.st === 'stopped' ? 'STOPPED' : 'PAPER'; mm.className = 'k8s-m' + (j.st === 'live' ? ' live' : ''); }
    const cell = (t, v, c, id) => `<div><dt>${t}</dt><dd class="${c || ''}"${id ? ' id="' + id + '"' : ''}>${v}</dd></div>`;
    g.innerHTML = cell('Bankroll', esc(usd(k.b))) + cell('A bet', esc(usd(k.s)))
      + cell(`Today (${led})`, num(td[0]) ? `${esc(fmtN(td[0]))} bet${td[0] === 1 ? '' : 's'}, ${esc(usd(td[2], true))}` : 'no bets yet', num(td[0]) ? cls(td[2]) : '')
      + cell('Next window', '…', '', 'k8s-cd');
    k8Tick();
    const l = String(k.l || '').replace(/[^WL]/g, '').slice(-10), bar = (t, a) => {
      const u = num(arr(a)[0]) || 0, st = num(arr(a)[1]) || 0, f = st ? Math.min(1, Math.max(0, u / st)) : 0;
      return `<span>${t}</span><span>${esc(usd(-u))} of ${esc(usd(-st))}</span><i><b class="${f > 0.8 ? 'red' : f > 0.5 ? 'hot' : ''}" style="width:${Math.round(f * 100)}%"></b></i>`;
    };
    const wr = arr(k.wr);
    x.innerHTML = `<p class="krw-f">Last ${l.length || 0} results (${led}), oldest first</p><div class="k8s-l">${l ? l.split('').map((c) => `<span class="${c === 'W' ? 'w' : ''}">${c}</span>`).join('') : '<em class="muted">none yet</em>'}</div>`
      + `<div class="k8s-b">${bar('Today (day stop)', Array.isArray(k.dy) ? k.dy : [Math.max(0, -(num(td[2]) || 0)), k8Rule().day])}${bar('This week', k.wk)}${bar('From the peak (OFF)', k.dd)}</div>`
      + `<p class="krw-f">${num(wr[0]) ? `${esc(fmtN(wr[0]))} bets, ${esc(String(wr[1]))}% won (OFF under 58% after 60). ` : ''}${k.lp ? 'Running on the PC' : 'The PC is not running it right now'} · <span class="krw-age${age.old ? ' old' : ''}">updated ${esc(age.s)}${age.old ? ' (late)' : ''}</span></p>`;
    k8Extra();
  }
  // ---- K8 day dashboard (day-kalshi 2026-11-20, live Monday 11-23 with $55): today's 5 windows with a countdown each, price vs fair per
  // live leg, the last 5 bets, the day stop bar (above), edge health. From the card's new dy / e / lg (missing on an old PC: those parts
  // hide or fall back) and the site's own k8.json (Kalshi's PUBLIC results at the bot's +20 s price: the strategy's health, not our bets;
  // missing = the parts that need it hide). Leg codes as engine/kalshi_clock.LEG_CODE.
  const K8L = [
    { c: 'g5', n: 'gold DOWN', tz: 'Europe/London', o: [10, 15], live: true, sk: 'uk' },
    { c: 's5', n: 'silver DOWN', tz: 'Europe/London', o: [10, 15], live: false, sk: 'uk' },
    { c: 's16', n: 'silver DOWN', tz: 'America/New_York', o: [16, 0], live: false, sk: 'cme' },
    { c: 'g17', n: 'gold UP', tz: 'America/New_York', o: [16, 45], live: true, sk: 'cme' },
    { c: 's17', n: 'silver UP', tz: 'America/New_York', o: [16, 45], live: true, sk: 'cme' }];
  const K8D = { j: null, k: null, day: '' };
  const K8_WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function k8Rule() {
    const r = K8D.j && isObj(K8D.j.rule) ? K8D.j.rule : {}, g = (key, d) => { const x = num(r[key]); return x == null ? d : x; };
    return { day: g('day_stop', 8), win: g('min_win', 0.58), creep: g('creep_max', 0.58), after: g('after', 60) };
  }
  function k8Legs() {                                // the 5 legs; k8.json's live / paper flag, time zone and open time win when it has them
    const by = {};
    for (const x of arr(K8D.j && K8D.j.legs)) if (isObj(x) && typeof x.code === 'string') by[x.code] = x;
    return K8L.map((L) => {
      const x = by[L.c] || {}, m = /^(\d{1,2}):(\d{2})$/.exec(String(x.open || ''));
      return Object.assign({}, L, { live: typeof x.live === 'boolean' ? x.live : L.live, tz: x.tz === 'Europe/London' || x.tz === 'America/New_York' ? x.tz : L.tz,
        o: m && +m[1] < 24 && +m[2] < 60 ? [+m[1], +m[2]] : L.o, x });
    });
  }
  function k8Day(ms) {                               // the New York date of a moment
    const p = {};
    for (const x of new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(new Date(ms))) p[x.type] = x.value;
    return { y: +p.year, mo: +p.month - 1, d: +p.day, iso: `${p.year}-${p.month}-${p.day}`, wd: p.weekday, md: `${p.month}-${p.day}` };
  }
  const k8HM = (ms) => { try { return new Date(ms).toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); } catch (_) { return ''; } };
  function k8Skip(sk, iso) {
    const extra = K8D.j && isObj(K8D.j.skip) ? arr(K8D.j.skip[sk]) : [];
    return (sk === 'uk' ? K8_SKIP_AM : K8_SKIP_PM).includes(iso) || extra.includes(iso);
  }
  function k8Rows(now) {                             // today's windows while one is still to come or running, else the next weekday's
    const legs = k8Legs();
    for (let a = 0; a < 9; a++) {
      const D = k8Day(now + a * 86400000);
      if (D.wd === 'Sat' || D.wd === 'Sun') continue;
      const rows = legs.map((L) => ({ L, t: tzEpoch(D.y, D.mo, D.d, L.o[0], L.o[1], L.tz), skip: k8Skip(L.sk, D.iso) }));
      if (rows.some((r) => !r.skip && (a > 0 || r.t + 900000 > now))) return { D, rows, today: a === 0 };
    }
    return null;
  }
  function k8Cd(r, now) {                            // "in 2h 14m" until the bet goes in (+20 s), "now" during the 15 minutes, then "done"
    if (r.skip) return r.L.sk === 'uk' ? 'skipped (UK holiday)' : 'skipped (CME holiday)';
    const s = Math.round((r.t + 20000 - now) / 1000);
    if (s > 0) { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return 'in ' + (h ? `${h}h ${m}m` : m ? `${m}m` : `${s}s`); }
    return now < r.t + 900000 ? 'now' : 'done';
  }
  function k8Win(now) {
    const el = $('#k8s-w');
    if (!el) return;
    const W = k8Rows(now);
    if (!W) { el.innerHTML = ''; K8D.day = ''; return; }
    const key = W.D.iso + '|' + W.rows.map((r) => r.L.c + (r.L.live ? 1 : 0) + (r.skip ? 1 : 0) + r.t).join();
    if (key !== K8D.day) {
      K8D.day = key;
      el.innerHTML = `<p class="k8w-h">${W.today ? 'Today' : 'Next'}, ${esc(W.D.wd)} ${esc(W.D.md)} · New York time</p><ul class="k8w">`
        + W.rows.map((r, i) => `<li class="${r.L.live ? 'lv' : 'pp'}${r.skip ? ' sk' : ''}" data-leg="${esc(r.L.c)}"><b>${esc(k8HM(r.t))}</b><span>${esc(r.L.n)}${r.L.live ? '' : ' <i>paper only</i>'}</span><em id="k8w-${i}"></em></li>`).join('') + '</ul>';
      k8Extra();
    }
    W.rows.forEach((r, i) => {
      const e = document.getElementById('k8w-' + i);
      if (!e) return;
      const t = k8Cd(r, now);
      if (e.textContent !== t) { e.textContent = t; e.className = t === 'now' ? 'now' : t === 'done' || r.skip ? 'done' : ''; }
    });
  }
  const k8c = (x) => (x == null ? '–' : Math.round(x) + '¢');
  function k8Price(now) {                            // per live leg: paid today (our bet) or Kalshi's last price at +20 s, vs the break-even (fair) price
    const W = k8Rows(now), day = k8Day(now).md, lg = arr(K8D.k && K8D.k.lg);
    const rows = k8Legs().filter((L) => L.live).map((L) => {
      let mine = null;
      for (const b of lg) if (Array.isArray(b) && b[0] === L.c && b[1] === day && num(b[3]) != null) mine = b;
      const paid = mine ? num(mine[3]) : num(L.x.last_c), fair = num(L.x.fair_c);
      if (fair == null) return '';
      const r = W && W.rows.filter((x) => x.L.c === L.c)[0], ed = paid == null ? null : Math.round(fair) - Math.round(paid);
      const from = mine ? 'our bet today' : L.x.last_day ? `Kalshi, ${String(L.x.last_day).slice(5, 10)}` : 'Kalshi';
      return `<li data-leg="${esc(L.c)}"><span>${esc(L.n)} ${esc(r ? k8HM(r.t) : '')} <i>${esc(from)}</i></span>`
        + `<span>paid ${esc(k8c(paid))} · fair ${esc(k8c(fair))}${ed == null ? '' : ` · <b class="${ed > 0 ? 'k8-g' : 'k8-r'}">edge ${ed > 0 ? '+' : ed < 0 ? MINUS : ''}${Math.abs(ed)}¢</b>`}</span></li>`;
    }).filter(Boolean);
    if (!rows.length) return '';
    const th = K8D.j && typeof K8D.j.through === 'string' ? K8D.j.through.slice(0, 10) : '';
    return `<div class="k8p" id="k8s-pf"><p class="k8w-h">Price vs fair (fair = where the bet breaks even after the fee)</p><ul>${rows.join('')}</ul>`
      + `<p class="krw-f">Fair prices from Kalshi's public results${th ? ' through ' + esc(th) : ''}, not our bets.</p></div>`;
  }
  function k8Log(now) {                              // the last 5 bets in plain words, newest first
    const lg = K8D.k && Array.isArray(K8D.k.lg) ? K8D.k.lg.filter(Array.isArray) : null;
    if (!lg) return '';
    const D = k8Day(now), by = {};
    for (const L of k8Legs()) by[L.c] = L;
    const li = lg.slice(-5).reverse().map((b) => {
      const L = by[b[0]], m = /^(\d{2})-(\d{2})$/.exec(String(b[1] || ''));
      let wd = '', hm = '';
      if (m) {
        const y = +m[1] > D.mo + 2 ? D.y - 1 : D.y;
        wd = K8_WD[new Date(Date.UTC(y, +m[1] - 1, +m[2], 12)).getUTCDay()];
        if (L) hm = k8HM(tzEpoch(y, +m[1] - 1, +m[2], L.o[0], L.o[1], L.tz));
      }
      const n = num(b[2]), c = num(b[3]), pnl = num(b[4]), r = b[5];
      const res = r === 'W' ? `WON ${usd(pnl, true)}` : r === 'L' ? `LOST ${usd(pnl, true)}` : 'open';
      return `<li class="${r === 'W' ? 'w' : r === 'L' ? 'l' : 'o'}">${esc(`${wd} ${m ? b[1] : ''} ${L ? L.n + ' ' + hm : 'a K8 bet'}`.replace(/\s+/g, ' ').trim())}: `
        + `${esc(n != null && c != null ? `${fmtN(n)} at ${Math.round(c)}¢` : 'size not known')}, <b>${esc(res)}</b></li>`;
    });
    return `<div class="k8g" id="k8s-log"><p class="k8w-h">Last ${li.length || ''} bets (${K8D.k.m === 'L' ? 'live' : 'paper'}), newest first</p>`
      + (li.length ? `<ul>${li.join('')}</ul>` : '<p class="krw-f">No bets yet.</p>') + '</div>';
  }
  function k8Health() {                              // win rate last 30 / 60 vs the 58% OFF line, price paid last 30 vs the 58¢ line
    const R = k8Rule(), e = K8D.k && Array.isArray(K8D.k.e) ? K8D.k.e : null, pool = K8D.j && isObj(K8D.j.pool) ? K8D.j.pool : null;
    let r30 = null, r60 = null, p30 = null, src = '';
    if (e && e.some((x) => num(x) != null)) { r30 = num(e[0]); r60 = num(e[1]); p30 = num(e[2]); src = `our bets (${K8D.k.m === 'L' ? 'live' : 'paper'})`; }
    else if (pool) { const f = (x) => (num(x) == null ? null : num(x) * 100); r30 = f(pool.r30); r60 = f(pool.r60); p30 = num(pool.avg30_c); src = 'Kalshi results, not our bets'; }
    if (r30 == null && r60 == null && p30 == null) return '<div class="k8e" id="k8s-eh" data-v="none"><p class="k8w-h">Edge health</p><p class="krw-f">No numbers yet.</p></div>';
    const W = R.win * 100, C = R.creep * 100;
    const lv = (x, bad, watch) => (x == null ? -1 : bad(x) ? 2 : watch(x) ? 1 : 0);
    const a = [lv(r30, (x) => x < W, (x) => x < W + 5), lv(r60, (x) => x < W, (x) => x < W + 5), lv(p30, (x) => x > C, (x) => x > C - 5)];
    const worst = Math.max.apply(null, a), V = ['Healthy', 'Watch', 'OFF line crossed'][worst], vc = ['ok', 'watch', 'off'][worst];
    const lc = ['ok', 'watch', 'off'], row = (t, v, i, line) => `<span>${t}</span><b class="${a[i] < 0 ? '' : lc[a[i]]}">${v}</b><span>${line}</span>`;
    const pc = (x) => (x == null ? 'not enough yet' : Math.round(x) + '%');
    const why = worst === 2 ? (a[2] === 2 ? ' Paying too much: the edge is gone at these prices.' : ' Winning too little.') + (src.startsWith('our') ? ` The bot switches itself OFF${num(arr(K8D.k.wr)[0]) != null && num(arr(K8D.k.wr)[0]) < R.after ? ` once it has ${fmtN(R.after)} bets` : ''}.` : '')
      : worst === 1 ? ' Close to a line (within 5 points): keep an eye on it.' : '';
    return `<div class="k8e" id="k8s-eh" data-v="${vc}"><p class="k8w-h">Edge health · ${esc(src)}</p><div class="k8e-g">`
      + row('Won, last 30', pc(r30), 0, `OFF under ${Math.round(W)}%`) + row('Won, last 60', pc(r60), 1, `OFF under ${Math.round(W)}%`)
      + row('Paid, last 30', p30 == null ? 'not enough yet' : (Math.round(p30 * 10) / 10) + '¢', 2, `OFF above ${Math.round(C)}¢`)
      + `</div><p class="k8e-v ${vc}"><b>${V}</b>${esc(why)}</p></div>`;
  }
  function k8Switch() {                              // each live leg's own last 20 windows and the pause rule (card ls: [code, won, of, paused, obeyed])
    const ls = arr(K8D.k && K8D.k.ls).filter((x) => Array.isArray(x) && num(x[1]) != null && num(x[2]) != null);
    if (!ls.length) return '';
    const name = {}; k8Legs().forEach((L) => { name[L.c] = L.n; });
    const obey = ls.some((x) => x[4] === 1);
    return `<div class="k8e" id="k8s-ls"><p class="k8w-h">Each bet's last 20 windows · pause at 10 won, resume at 12${obey ? '' : ' (shown only: the bot does not pause on it yet)'}</p><ul class="k8l">`
      + ls.map((x) => {
        const n = esc(name[x[0]] || x[0]), w = num(x[1]), o = num(x[2]);
        const t = o < 20 ? `${n}: ${w} of ${o} so far` : x[3] === 1 ? `${n} ${obey ? 'paused' : 'would pause'}: won ${w} of the last ${o} (resumes at 12)` : `${n}: won ${w} of the last ${o}`;
        return `<li class="${x[3] === 1 ? 'off' : ''}" data-leg="${esc(String(x[0]))}">${t}</li>`;
      }).join('') + '</ul></div>';
  }
  function k8Extra() {
    const el = $('#k8s-y');
    if (!el) return;
    const now = Date.now();
    let h = '';
    try { h = k8Price(now) + k8Log(now) + k8Health() + k8Switch(); } catch (_) { h = ''; }
    if (el.innerHTML !== h) el.innerHTML = h;
  }
  async function k8Load() {                          // the site's own k8.json (same folder), 3 s at most; not an object = absent
    const j = await rwGet('k8.json', 3000);
    K8D.j = isObj(j) && (j.kind === 'k8_plan' || Array.isArray(j.legs)) ? j : null;
    K8D.day = '';
    try { k8Win(Date.now()); } catch (_) { /* nothing */ }
    k8Extra();
  }

  function klShow() {
    const j = KLV.j, ln = $('#kpaused-live'), hd = $('#kpaused-h'), risk = $('#kpaused-risk');
    k8Show(j);
    if (j && j.st === 'paper' && ln) {
      ln.innerHTML = '<b>K8, the gold and silver clock bot · PAPER:</b> running on the PC with no money (the K8 status card below). Live only when you type the phrase on the PC\'s private page (your PC link :8444/kalshi-live/).';
      return;
    }
    if (!ln || !klOk(j) || j.st === 'off') return;
    const cap = num(j.cap), stop = num(j.stop), age = rwAge({ updated: j.u });
    const lim = cap != null && stop != null ? ` Limits: ${usd(cap)} total, stop at ${MINUS}${usd(stop)} a day.` : '';
    const today = num(j.net) != null ? `today ${usd(j.net, true)}` : 'today not known yet';
    if (j.st === 'stopped') {
      if (hd) hd.textContent = 'Kalshi: STOPPED';
      ln.textContent = `K8 (gold and silver) STOPPED${j.why ? ' (' + String(j.why).slice(0, 40) + ')' : ''}: it is OFF now, ${today}. To restart, type the phrase on the PC (KALSHI_LIVE.bat). Updated ${age.s}.`;
      if (risk) risk.textContent = 'No new orders.';
      return;
    }
    if (j.st === 'idle') {
      if (hd) hd.textContent = 'Kalshi: ARMED, not running';
      ln.textContent = `K8 (gold and silver) ARMED, but the PC is not running it right now: double-click KALSHI_LIVE.bat on the PC to start it again. ${today[0].toUpperCase() + today.slice(1)}. Updated ${age.s}.`;
      if (risk) risk.textContent = 'No order rests for more than 20 minutes without it.';
      return;
    }
    if (hd) hd.textContent = j.st === 'live' ? 'Kalshi: LIVE' : 'Kalshi: PAUSED from the phone';
    ln.textContent = `K8 (gold and silver) ${j.st === 'live' ? 'LIVE' : 'PAUSED (no new orders until 4 PM ET or RESUME)'}: ${today}, ${fmtN(num(j.f) || 0)} fill${num(j.f) === 1 ? '' : 's'}, `
      + `${fmtN(num(j.o) || 0)} order${num(j.o) === 1 ? '' : 's'} resting.${lim} Pause or flatten from the phone: ZEUS Safety. Updated ${age.s}${age.old ? ' (late)' : ''}.`;
    if (risk && cap != null) risk.textContent = `At most ${usd(cap)} at risk.`;
  }

  function whatifHtml(k, v) {
    const m = whatifModel(k, v), head = '<div class="card-h"><h2>If you change the bot</h2></div><p class="wi-lab">A backtest of past bets · suggestions only · nothing here places or changes a bet</p>';
    if (!m.enough) return `<section class="card whatif" id="sec-whatif">${head}<p class="muted">${esc(m.recommend)}</p>${fwdStrip()}</section>`;
    const pc = (x) => (x == null ? '–' : x === 0 ? '0%' : x < 0.01 ? '<1%' : Math.round(x * 100) + '%');
    const sets = m.sets.map((x) => `<div class="wi-set${x.id === m.pick ? ' pick' : ''}${x.id === 'asis' ? ' base' : ''}"><button type="button" class="wi-h" data-act="wi" data-v="${x.id}" aria-expanded="${S.wi === x.id}">`
      + `<span class="wi-n">${esc(x.name)}${x.id === m.pick ? ' <i>the data favours this</i>' : ''}</span><em aria-hidden="true">${S.wi === x.id ? '−' : '+'}</em></button>`
      + `<dl><div><dt>Net after fees</dt><dd class="${cls(x.net)}">${esc(usdA(x.net, true))}</dd></div><div><dt>Typical worst dip</dt><dd>${x.dip == null ? '–' : esc(usdA(x.dip))}</dd></div>`
      + `<div><dt>Chance of ruin</dt><dd class="${x.ruin > 0.05 ? 'down' : ''}">${pc(x.ruin)}</dd></div><div><dt>Lose half</dt><dd>${pc(x.half)}</dd></div></dl>`
      + (S.wi === x.id ? `<p class="wi-r">${esc(WI_RULES[x.id])} ${esc(fmtN(x.bets))} of the past ${esc(fmtN(m.n))} bets stay in.</p>` : '') + '</div>').join('');
    return `<section class="card whatif" id="sec-whatif">${head}<p class="wi-rec">${esc(m.recommend)}</p><div class="wi-l">${sets}</div>`
      + `<p class="muted wi-f">Net = the past bets replayed (B and C shrunk to 2% of today's ${esc(usdA(m.balance))} = ${esc(usdA(m.cap))} a bet). Worst dip and ruin (balance under $6) come from 400 seeded runs of the next ${WI_BETS} bets drawn from the same price bands at the bot's usual ${esc(usdA(m.t0))} bet. A past replay is not a promise.</p>${fwdStrip()}</section>`;
  }

  // ================================================================== "Where the money is" (2026-11-04). Its ../kalshicity/scan.json came only from the retired
  // kalshi-feed repo (2026-11-19) and is no longer asked for (2026-11-20): the card works from the feed's own price bands, else the dated sample.
  // The top 5 slices of the bot's bets worth a paper test and the top 5 to avoid, each with the fee-adjusted EV per $1 risked and its 95% range. LOOKING
  // BACK, NOT PROVEN. The maths on this feed's own price bands (30+ bets each); else a dated sample from
  // the research, labelled as such. Never blank.
  const SC_FIXTURE = { label: 'Sample from the 2026-11-04 research, not your live numbers', test: [
    { name: '95–97¢ bets', ev: 0.015, n: 715, fragile: false, text: '95–97¢ bets: won 97.8% of 715 bets against 96.1% priced. After Kalshi\'s fee that is +1.5¢ on every $1 risked. It made $137 on $9,182 bet.' },
    { name: '97–99¢ bets', ev: 0.008, n: 360, fragile: true, text: '97–99¢ bets: won 98.6% of 360 bets against 97.7% priced. After the fee +0.8¢ on every $1 risked, but the range includes zero: a hint, not a result.' }], avoid: [
    { name: '90–95¢ bets', ev: -0.011, n: 581, fragile: false, text: '90–95¢ bets: won 92.2% of 581 bets against 92.8% priced. After the fee −1.1¢ on every $1 risked. It lost $248 on $5,343 bet.' },
    { name: 'XRP bets', ev: -0.037, n: 192, fragile: false, text: 'XRP bets: won 92.7% of 192 bets against 96.0% priced. After the fee −3.7¢ on every $1 risked. It lost $107 on $1,739 bet.' }] };
  const cents1 = (x) => (x < 0 ? '−' : '+') + Math.abs(x * 100).toFixed(1) + '¢';
  function scanFromBands(k, v) {
    const cells = wiRows(k, v).filter((r) => r.n >= 30).map((r) => {
      const w = r.w / r.n, p = r.p, f = TAKER * p * (1 - p), ev = (x) => (x - p - f) / p, [lo, hi] = wilson(r.w, r.n), e = ev(w), e0 = ev(lo), e1 = ev(hi);
      const fragile = e > 0 && (r.n < 100 || e0 <= 0), name = `${cRange(r.lo, r.hi)} bets`;
      const text = `${name}: won ${(w * 100).toFixed(1)}% of ${fmtN(r.n)} bets against ${(p * 100).toFixed(1)}% priced. After Kalshi's fee that is ${cents1(e)} on every $1 risked (95% range ${cents1(e0)} to ${cents1(e1)}). It ${r.pnl >= 0 ? 'made' : 'lost'} ${usdA(Math.abs(r.pnl))} on ${usdA(r.st)} bet.`
        + (e > 0 && fragile ? ' Positive but fragile (a small sample or the range includes zero): a hint, not a result.' : e < 0 && e1 >= 0 ? ' Negative, but the range includes zero: not proven.' : '');
      return { name, ev: e, ev_lo: e0, n: r.n, pnl: r.pnl, fragile, text };
    });
    const pos = cells.filter((c) => c.ev > 0).sort((a, b) => (a.fragile - b.fragile) || (a.fragile ? b.ev - a.ev : b.ev_lo - a.ev_lo)), neg = cells.filter((c) => c.ev < 0).sort((a, b) => a.pnl - b.pnl);
    return { label: 'From this feed\'s price bands only', test: pos.slice(0, 5), avoid: neg.slice(0, 5), n: cells.length };
  }
  function scanModel(k, v) {
    const b = scanFromBands(k, v);
    if (b.test.length || b.avoid.length) return { src: 'bands', label: b.label, head: '', n: b.n, test: b.test, avoid: b.avoid };
    return { src: 'fixture', label: SC_FIXTURE.label, head: '', n: 0, test: SC_FIXTURE.test, avoid: SC_FIXTURE.avoid };
  }
  function scanHtml(k, v) {
    const m = scanModel(k, v);
    const item = (c, kind, i) => {
      const id = kind + i, open = S.sc === id;
      return `<div class="sc-i ${kind}${open ? ' open' : ''}"><button type="button" class="sc-h" data-act="sc" data-v="${id}" aria-expanded="${open}"><span class="sc-n">${esc(String(c.name).slice(0, 80))}${c.fragile ? ' <i>small sample</i>' : ''}</span>`
        + `<b class="${c.ev >= 0 ? 'up' : 'down'}">${esc(cents1(c.ev))}</b></button>${open ? `<p class="sc-d">${esc(String(c.text).slice(0, 700))}</p>` : ''}</div>`;
    };
    return `<section class="card scan" id="sec-scan"><div class="card-h"><h2>Where the money is</h2></div><p class="wi-lab">Looking back at past bets · not proven · suggestions only</p>`
      + `<p class="sc-l">${esc(m.label)}${m.head ? '. ' + esc(m.head) : ''}</p><h3 class="sc-g">Worth a paper test</h3>${m.test.length ? m.test.map((c, i) => item(c, 'test', i)).join('') : '<p class="muted">No slice with 30+ bets is clearly positive.</p>'}`
      + `<h3 class="sc-g">Avoid</h3>${m.avoid.length ? m.avoid.map((c, i) => item(c, 'avoid', i)).join('') : '<p class="muted">No slice with 30+ bets is clearly negative.</p>'}`
      + '<p class="muted wi-f">EV per $1 = (win rate − price − Kalshi\'s fee) ÷ price, at equal size. The slices overlap and were picked from many, so the best-looking ones are partly luck: paper-test, never bet on one.</p></section>';
  }
  // ---- when nothing is open (a paused bot, a quiet hour): never a blank card, the history stays and the page says what comes back
  function restHtml(k, v) {
    if (v.pos.length) return '';
    const off = k.running === false, last = v.tr.length ? parseT(v.tr[0].t) : null;
    const on = v.strat.filter((s) => s.running === true).length, names = v.strat.filter((s) => String(s.mode || '').toLowerCase() === 'live').map((s) => String(s.name || '').slice(0, 40)).filter(Boolean);
    const steps = [['A bet opens', 'it shows up here as a card with a clock counting down to when it settles.'],
      ['The edge fills in', 'Live edge, the Edge map and Kelly sizing light up for that bet.'],
      ['It settles', 'the win or loss lands in Alerts and the journal, the balance moves, the streaks update.'],
      ['Every minute', 'the bot sends fresh numbers and this page redraws itself.']];
    return `<section class="card rest" id="sec-rest"><div class="card-h"><h2>${off ? 'Paused · what happens when it resumes' : 'Quiet · what shows up when a bet opens'}</h2></div>`
      + `<p class="muted">${off ? 'The bot is not betting right now, so nothing is at risk.' : 'No bet is open at the moment.'} Everything below is the history, and it stays exactly as it was.</p>`
      + `<ol class="steps">${steps.map((s, i) => `<li><i aria-hidden="true">${i + 1}</i><span><b>${s[0]}</b> ${s[1]}</span></li>`).join('')}</ol>`
      + `<div class="chips">${last ? `<span class="chip"><b>${esc(ago(last))}</b>last bet</span>` : ''}${v.strat.length ? `<span class="chip"><b>${v.strat.length}</b>${v.strat.length === 1 ? 'strategy' : 'strategies'}${on ? ` · ${on} on` : ''}</span>` : ''}`
      + `${names.length ? `<span class="chip"><b>${esc(names[0])}</b>${names.length > 1 ? `+${names.length - 1} live` : 'live'}</span>` : ''}</div></section>`;
  }
  function edgeWaitHtml(k, v) {
    if (v.pos.map(posModel).some((m) => m.edge != null)) return '';
    return '<section class="card rest" id="sec-ew"><div class="card-h"><h2>Edge · waiting for a bet</h2></div>'
      + '<p class="muted">The live edge (the bot\'s own chance against the price) and the edge map appear as soon as a bet that carries its chance is open. The calculator below works any time.</p></section>';
  }

  // ---- the heat map: every day with its P&L in one grid (weeks across, Monday to Sunday down); tap a day to read it
  function heatModel(v) {
    if (!v.days.length) return null;
    const map = new Map(v.days), f = pd(v.days[0][0]), l = pd(v.days[v.days.length - 1][0]);
    const d0 = Date.UTC(f.y, f.m - 1, f.d), d1 = Date.UTC(l.y, l.m - 1, l.d), dow0 = (new Date(d0).getUTCDay() + 6) % 7;
    const n = Math.round((d1 - d0) / 864e5) + 1, cols = Math.ceil((n + dow0) / 7);
    const vals = v.days.map((d) => d[1]), mx = Math.max.apply(null, vals.map((x) => Math.abs(x))) || 1;
    return { map, d0, dow0, n, cols, mx };
  }
  function heatHtml(v) {
    const m = heatModel(v);
    if (!m) return '';
    const cell = Math.max(9, Math.min(20, Math.floor(300 / m.cols) - 3)), gp = 3, LW = 14, TH = 13, width = LW + m.cols * (cell + gp), height = TH + 7 * (cell + gp);
    let rects = '', mons = '', lastM = '';
    const wl = ['M', '', 'W', '', 'F', '', 'S'].map((c, i) => (c ? `<text x="0" y="${TH + i * (cell + gp) + cell * 0.72}" class="hm-l">${c}</text>` : '')).join('');
    for (let i = 0; i < m.n; i++) {
      const dt = new Date(m.d0 + i * 864e5), key = dt.toISOString().slice(0, 10), pos = i + m.dow0, col = Math.floor(pos / 7), row = pos % 7;
      const x = m.map.get(key), lv = x == null ? 'e' : Math.abs(x) < 0.005 ? 'z' : (x > 0 ? 'p' : 'n') + Math.max(1, Math.min(4, Math.ceil(Math.sqrt(Math.abs(x) / m.mx) * 4)));
      rects += `<rect class="hc ${lv}${S.heatSel === key ? ' sel' : ''}" x="${LW + col * (cell + gp)}" y="${TH + row * (cell + gp)}" width="${cell}" height="${cell}" rx="3" data-d="${key}"/>`;
      const mk = key.slice(0, 7);
      if (mk !== lastM && row < 6) { lastM = mk; mons += `<text x="${LW + col * (cell + gp)}" y="9" class="hm-l">${esc(ff(F.mdU, dayT(key)).split(' ')[0].toUpperCase())}</text>`; }
    }
    return `<section class="card" id="sec-heat"><div class="card-h"><h2>Every day · ${m.map.size} days</h2><span class="r muted">tap a day</span></div>`
      + `<div class="heat-w"><svg class="heat" id="heat" viewBox="0 0 ${width} ${height}" width="${width}" style="max-width:100%;height:auto" tabindex="0" role="group" aria-label="Daily P&amp;L heat map, ${m.map.size} days. Tap a day, or use the arrow keys, to read it.">${mons}${wl}${rects}</svg>`
      + `<div class="heat-r" id="heatRead" aria-live="polite">${heatRead(v)}</div></div></section>`;
  }
  function heatRead(v) {
    const k = S.heatSel, vals = v.days.map((d) => d[1]);
    if (!k) {
      const g = vals.filter((x) => x > 0.005).length, mean = sum(vals) / vals.length, bi = vals.indexOf(Math.max.apply(null, vals)), wi = vals.indexOf(Math.min.apply(null, vals));
      return `<span class="lab">All ${vals.length} days</span><b class="${cls(sum(vals))}">${esc(usd(sum(vals), true))}</b><small>${g} green · ${vals.length - g} red</small>`
        + `<small>average <span class="${cls(mean)}">${esc(usd(mean, true))}</span> a day</small><small>best <span class="up">${esc(usd(vals[bi], true))}</span> ${esc(ff(F.mdU, dayT(v.days[bi][0])))}</small><small>worst <span class="down">${esc(usd(vals[wi], true))}</span> ${esc(ff(F.mdU, dayT(v.days[wi][0])))}</small>`;
    }
    const map = new Map(v.days), x = map.get(k), sorted = vals.slice().sort((a, b) => b - a);
    const rank = x == null ? 0 : sorted.indexOf(x) + 1;
    let cum = 0;
    v.days.forEach((d) => { if (d[0] <= k) cum += d[1]; });
    const tr = v.tr.filter((t) => { const tt = parseT(t.t); return tt && dayKey(tt) === k; }).length;
    return `<span class="lab">${esc(dayLabel(k))}</span>` + (x == null ? '<b class="muted">no P&amp;L</b>' : `<b class="${cls(x)}">${esc(usd(x, true))}</b><small>${rank === 1 ? 'the best day' : rank === vals.length ? 'the worst day' : `#${rank} of ${vals.length}, best first`}</small>`)
      + `<small>running total <span class="${cls(cum)}">${esc(usd(cum, true))}</span></small>${tr ? `<small>${tr} ${tr === 1 ? 'bet' : 'bets'} in the recent list</small>` : ''}`;
  }
  function heatPick(key) {
    if (!key) return;
    S.heatSel = S.heatSel === key ? '' : key;
    document.querySelectorAll('#heat .hc').forEach((r) => r.classList.toggle('sel', r.getAttribute('data-d') === S.heatSel));
    const r = $('#heatRead');
    if (r && S.v) r.innerHTML = heatRead(S.v);
    if (S.heatSel && S.v && S.v.days.some((d) => d[0] === S.heatSel)) {          // the calendar below follows: same day, same month
      S.cal = S.heatSel.slice(0, 7); S.calSel = S.heatSel;
      if ($('#sec-cal')) swap('sec-cal', calHtml(S.v));
    }
  }

  // ---- the strategy race: one line per strategy (running P&L over the recent bets), and the finish line (P&L since the start)
  function sampleBy(v) {
    const m = new Map();
    settled(v).slice().reverse().forEach((t) => {                    // oldest first
      const nm = stratName(t);
      if (!nm) return;
      const r = m.get(nm) || { name: nm, n: 0, w: 0, l: 0, sw: 0, sl: 0, st: 0, pnl: 0, fee: 0, pts: [] };
      const x = num(t.pnl), c = num(t.contracts), px = dol(t.price), tt = parseT(t.t);
      r.n++; r.pnl += x;
      if (x > 0.005) { r.w++; r.sw += x; } else if (x < -0.005) { r.l++; r.sl += -x; }
      if (c != null && px != null) {
        const stake = Math.abs(c) * px;
        r.st += stake;
        if (x > 0.005) r.fee += Math.abs(c) * (1 - px) - x; else if (x < -0.005) r.fee += -stake - x;
      }
      if (tt != null) r.pts.push([tt, r.pnl]);
      m.set(nm, r);
    });
    return m;
  }
  function raceHtml(v) {
    const sm = sampleBy(v), lines = Array.from(sm.values()).filter((r) => r.pts.length >= 2 && r.pts[0][0] != null);
    const strat = v.strat.filter((s) => num(s.total_pnl) != null).sort(by((s) => num(s.total_pnl), true));
    if (!lines.length && !strat.length) return '';
    let svg = '', legend = '';
    if (lines.length) {
      const W = 300, H = 130, PX = 4, PY = 8, all = lines.reduce((a, r) => a.concat(r.pts), []);
      const t0 = Math.min.apply(null, all.map((p) => p[0])), t1 = Math.max.apply(null, all.map((p) => p[0])), dt = Math.max(1, t1 - t0);
      const lo = Math.min(0, Math.min.apply(null, all.map((p) => p[1]))), hi = Math.max(0, Math.max.apply(null, all.map((p) => p[1]))), sp = (hi - lo) || 1;
      const X = (t) => PX + ((t - t0) / dt) * (W - 2 * PX), Y = (x) => PY + (1 - (x - lo) / sp) * (H - 2 * PY);
      const paths = lines.map((r, i) => {
        if (S.raceOff.has(r.name)) return '';
        const d = r.pts.map((p, j) => (j ? 'L' : 'M') + X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join(''), e = r.pts[r.pts.length - 1];
        return `<path class="rc-l" style="stroke:${PALETTE[i % PALETTE.length]}" d="${d}"/><circle class="rc-e" style="fill:${PALETTE[i % PALETTE.length]}" cx="${X(e[0]).toFixed(1)}" cy="${Y(e[1]).toFixed(1)}" r="3.2"/>`;
      }).join('');
      svg = `<svg class="race" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc('Running P&L of each strategy over the last ' + all.length + ' bets: ' + lines.map((r) => r.name + ' ' + usd(r.pnl, true)).join(', '))}">`
        + `<line class="rc-z" x1="${PX}" x2="${W - PX}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}"/>${paths}</svg>`;
      legend = `<div class="rleg" role="group" aria-label="Strategies">${lines.map((r, i) => `<button type="button" class="rchip" data-act="race" data-v="${esc(r.name)}" aria-pressed="${!S.raceOff.has(r.name)}" style="--rc:${PALETTE[i % PALETTE.length]}"><i aria-hidden="true"></i><span>${esc(r.name)}</span><b class="${cls(r.pnl)}">${esc(usd(r.pnl, true))}</b></button>`).join('')}</div>`;
    }
    const mx = Math.max.apply(null, strat.map((s) => Math.abs(num(s.total_pnl)))) || 1;
    const fin = strat.length ? `<p class="lab fin">Finish line · P&amp;L since the start</p><ul class="brk">${strat.map((s, i) => {
      const x = num(s.total_pnl), w = Math.max(2, (Math.abs(x) / mx) * 50), mode = String(s.mode == null ? '' : s.mode).trim().toLowerCase().slice(0, 12);
      return `<li><div class="bk-t"><b><i class="sdot ${s.running === true ? 'on' : s.running === false ? 'off' : ''}" aria-hidden="true"></i>${i === 0 && x > 0 ? '<span class="lead">1st</span>' : ''}${esc(String(s.name || 'Strategy'))}</b>${mode ? `<small>${esc(mode)}</small>` : ''}<span class="v ${cls(x)}">${esc(usd(x, true))}</span></div>`
        + `<div class="dv" aria-hidden="true"><i class="${x < 0 ? 'neg' : 'pos'}" style="width:${w.toFixed(1)}%"></i></div></li>`;
    }).join('')}</ul>` : '';
    return `<section class="card" id="sec-race"><div class="card-h"><h2>Strategy race</h2>${lines.length ? `<span class="r muted">last ${sum(lines.map((r) => r.n))} bets</span>` : ''}</div>${svg}${legend}${fin}</section>`;
  }

  // ---- the strategy battle: the same strategies on one measure at a time
  const BM = [['wr', 'Win %', 'Win rate'], ['pb', 'Per bet', 'P&L per bet'], ['aw', 'Win/loss', 'Average win against average loss'], ['ev', 'EV/$', 'Expected value per dollar bet'], ['fee', 'Fees', 'Fee drag']];
  function battleHtml(k, v) {
    const sm = sampleBy(v), mm = verdictModel(k, v);
    const bot = mm && mm.st && mm.px ? mm : null;
    const sg = v.strat.filter((s) => num(s.trades) > 0 || (num(s.wins) || 0) + (num(s.losses) || 0) > 0);
    if (!sg.length && !sm.size && !bot) return '';
    const key = BM.some((b) => b[0] === S.bm) ? S.bm : 'wr';
    const nm = (s) => String(s.name || 'Strategy');
    let list = [], foot = '', fmt = () => '';
    if (key === 'wr' || key === 'pb') {
      list = sg.map((s) => {
        const w = num(s.wins), l = num(s.losses), n = num(s.trades);
        const x = key === 'wr' ? (w != null && l != null && w + l > 0 ? w / (w + l) : null) : (num(s.total_pnl) != null && n ? num(s.total_pnl) / n : null);
        return { name: nm(s), x, sub: key === 'wr' ? (w != null && l != null ? `${fmtN(w)}W ${fmtN(l)}L` : '') : `${fmtN(n || 0)} bets · ${usd(s.total_pnl, true)} total` };
      }).filter((r) => r.x != null);
      fmt = key === 'wr' ? (x) => pct(x) : (x) => usd(x, true);
      foot = key === 'wr' ? 'Win rate alone says little: a 94% winner can still lose money when each loss costs 15 wins. Read it with Per bet and EV per $.' : 'What one bet earns on average: total P&L divided by the bets placed.';
    } else {
      const own = [];
      if (bot) {
        const stake = bot.st / (bot.w + bot.l), aw = bot.w > 0 ? (bot.pnl + bot.l * stake) / bot.w : null, drag = (bot.wr / bot.px - 1) - bot.pnl / bot.st;
        own.push({ name: 'All bets · ' + bot.basis, aw, al: stake, ev: bot.pnl / bot.st, fee: bot.basis === 'all time' ? drag : null, feeD: bot.basis === 'all time' ? drag * bot.st : null, n: bot.w + bot.l });
      }
      Array.from(sm.values()).forEach((r) => own.push({ name: r.name, aw: r.w ? r.sw / r.w : null, al: r.l ? r.sl / r.l : null, ev: r.st ? r.pnl / r.st : null, fee: r.st ? r.fee / r.st : null, feeD: r.st ? r.fee : null, n: r.n }));
      list = own.map((r) => ({ name: r.name, x: key === 'aw' ? r.aw : key === 'ev' ? r.ev : r.fee, r,
        sub: key === 'aw' ? (r.al != null ? 'a loss costs ' + usd(r.al) : 'no loss in the list') : key === 'ev' ? `${fmtN(r.n)} bets` : r.feeD != null ? `${usd(r.feeD)} in fees and slips over ${fmtN(r.n)} bets` : '' })).filter((r) => r.x != null);
      fmt = key === 'aw' ? (x) => usd(x, true) : key === 'ev' ? (x) => pct(x, true) : (x) => (x * 100).toFixed(2) + '%';
      foot = key === 'aw' ? 'The average winning bet (green bar) against the average losing bet (red bar). The first row is all bets; the others come from the recent list, so a strategy with no bet there is missing.'
        : key === 'ev' ? 'Profit per $1 put into bets (P&L ÷ money staked). Above zero = the strategy pays for its risk.'
          : 'What fees and slippage take from each $1 bet: the gross result minus the real result. Smaller is better.';
    }
    const mx = Math.max.apply(null, list.map((r) => Math.abs(r.x))) || 1;
    const body = list.map((r) => {
      let bar;
      if (key === 'aw') {
        const m2 = Math.max.apply(null, list.map((q) => Math.max(q.r.aw || 0, q.r.al || 0))) || 1;
        bar = `<div class="b1" aria-hidden="true"><i class="pos" style="width:${(((r.r.aw || 0) / m2) * 100).toFixed(1)}%"></i></div><div class="b1" aria-hidden="true"><i class="neg" style="width:${(((r.r.al || 0) / m2) * 100).toFixed(1)}%"></i></div>`;
      } else if (key === 'wr' || key === 'fee') {
        const lo = key === 'wr' ? Math.max(0, Math.min.apply(null, list.map((q) => q.x)) - 0.08) : 0, hi = key === 'wr' ? 1 : mx;
        bar = `<div class="b1" aria-hidden="true"><i class="${key === 'fee' ? 'neg' : 'pos'}" style="width:${(Math.max(2, ((r.x - lo) / Math.max(1e-9, hi - lo)) * 100)).toFixed(1)}%"></i></div>`;
      } else bar = `<div class="dv" aria-hidden="true"><i class="${r.x < 0 ? 'neg' : 'pos'}" style="width:${Math.max(2, (Math.abs(r.x) / mx) * 50).toFixed(1)}%"></i></div>`;
      const val = key === 'aw' ? `<span class="v up">${esc(usd(r.r.aw, true))}</span>` : `<span class="v ${key === 'fee' ? 'down' : cls(r.x)}">${esc(fmt(r.x))}</span>`;
      return `<li><div class="bk-t"><b>${esc(r.name)}</b>${val}</div>${bar}<small>${esc(r.sub)}</small></li>`;
    }).join('');
    const tabs = `<div class="seg bm" role="group" aria-label="Measure">${BM.map((b) => `<button type="button" data-act="bm" data-v="${b[0]}" aria-pressed="${b[0] === key}" aria-label="${esc(b[2])}" title="${esc(b[2])}">${b[1]}</button>`).join('')}</div>`;
    return `<section class="card" id="sec-battle"><div class="card-h"><h2>Strategy battle</h2></div>${tabs}`
      + (body ? `<ul class="brk">${body}</ul>` : '<p class="empty">No numbers for this measure yet: it needs settled bets with a price.</p>') + `<p class="muted small">${esc(foot)}</p></section>`;
  }

  // ---- risk of ruin: 400 simulated runs of the next 100 bets, drawn from this bot's own win rate and bet sizes (seeded: the same
  // numbers always draw the same fan). Ruin = the balance cannot buy one more contract (under $1).
  const SIM_N = 400, SIM_STEPS = 100;
  function ruinModel(k, v) {
    const bal = num(k.balance);
    if (!(bal > 0)) return null;
    const at = isObj(k.stats) ? k.stats : null;
    let w = at ? num(at.wins) : null, l = at ? num(at.losses) : null, st = at ? num(at.staked) : null, pnl = at ? num(at.pnl) : null, aw, al, src = 'all-time';
    if (w != null && l != null && w + l >= 10 && st > 0 && pnl != null && w > 0) {
      al = st / (w + l); aw = (pnl + l * al) / w;
    } else {
      const ss = settled(v), ws = ss.filter((t) => num(t.pnl) > 0.005), ls = ss.filter((t) => num(t.pnl) < -0.005);
      if (ss.length < 10 || !ws.length || !ls.length) return null;
      w = ws.length; l = ls.length; aw = sum(ws.map((t) => num(t.pnl))) / w; al = -sum(ls.map((t) => num(t.pnl))) / l; src = 'last ' + ss.length;
    }
    if (!(aw > 0) || !(al > 0)) return null;
    return { bal, p: w / (w + l), aw, al, n: w + l, src };
  }
  function simulate(m, mult) {
    const R = rng32((Math.round(m.bal * 100) * 31 + m.n * 7 + Math.round(m.p * 1e4)) | 0), cols = [], ends = [];
    for (let s = 0; s <= SIM_STEPS; s++) cols.push(new Float64Array(SIM_N));
    let ruined = 0;
    const ratio = m.aw / m.al;
    for (let i = 0; i < SIM_N; i++) {
      let b = m.bal, dead = false;
      cols[0][i] = b;
      for (let s = 1; s <= SIM_STEPS; s++) {
        if (!dead) {
          if (b < 1) dead = true;
          else { const stake = Math.min(m.al * mult, b); if (R() < m.p) b += stake * ratio; else b -= stake; if (b < 1) { b = Math.max(0, b); dead = true; } }
        }
        cols[s][i] = b;
      }
      if (dead) ruined++;
      ends.push(b);
    }
    const q = (a, f) => a[Math.min(SIM_N - 1, Math.floor(f * SIM_N))];
    const fan = cols.map((c) => { const a = Float64Array.from(c).sort(); return [q(a, 0.1), q(a, 0.25), q(a, 0.5), q(a, 0.75), q(a, 0.9)]; });
    return { ruin: ruined / SIM_N, fan, med: fan[SIM_STEPS][2], up: ends.filter((x) => x > m.bal).length / SIM_N };
  }
  function ruinHtml(k, v) {
    const m = ruinModel(k, v);
    if (!m) return '';
    const mult = [0.5, 1, 2].indexOf(S.bs) >= 0 ? S.bs : 1, r = simulate(m, mult), alt = [0.5, 1, 2].map((x) => [x, x === mult ? r : simulate(m, x)]);
    // the drawn fan is smoothed over 7 bets (the raw percentiles step with every loss); the numbers in the chips are the raw ones
    const F = r.fan.map((_, s) => [0, 1, 2, 3, 4].map((k) => { let a = 0, n = 0; for (let j = Math.max(0, s - 3); j <= Math.min(SIM_STEPS, s + 3); j++) { a += r.fan[j][k]; n++; } return a / n; }));
    F[0] = r.fan[0].slice();                                  // the fan starts at today's balance exactly
    const W = 300, H = 140, PX = 4, PY = 8, hi = Math.max(m.bal * 1.1, Math.max.apply(null, F.map((f) => f[4]))) || 1;
    const X = (s) => PX + (s / SIM_STEPS) * (W - 2 * PX), Y = (x) => PY + (1 - x / hi) * (H - 2 * PY);
    const band = (a, b) => 'M' + F.map((f, s) => X(s).toFixed(1) + ',' + Y(f[b]).toFixed(1)).join('L') + 'L' + F.map((f, s) => X(SIM_STEPS - s).toFixed(1) + ',' + Y(F[SIM_STEPS - s][a]).toFixed(1)).join('L') + 'Z';
    const med = 'M' + F.map((f, s) => X(s).toFixed(1) + ',' + Y(f[2]).toFixed(1)).join('L');
    const gc = r.ruin < 0.15 ? 'ok' : r.ruin < 0.4 ? 'warn' : 'bad', gv = Math.round(r.ruin * 100);
    const gauge = `<svg class="gauge ${gc}" viewBox="0 0 200 118" role="img" aria-label="Risk of ruin ${gv} in 100"><path class="g-t" pathLength="100" d="M20,102A80,80 0 0 1 180,102"/>`
      + `<path class="g-v" pathLength="100" stroke-dasharray="${Math.max(0.6, r.ruin * 100).toFixed(1)} 100" d="M20,102A80,80 0 0 1 180,102"/>`
      + `<g transform="rotate(${(-90 + r.ruin * 180).toFixed(1)} 100 102)"><line class="g-n" x1="100" y1="102" x2="100" y2="34"/></g><circle class="g-c" cx="100" cy="102" r="6"/>`
      + `<text class="g-x" x="100" y="86" text-anchor="middle">${gv}%</text><text class="g-s" x="24" y="116">0</text><text class="g-s" x="176" y="116" text-anchor="end">100</text></svg>`;
    const seg = `<div class="seg" role="group" aria-label="Bet size">${[[0.5, '½ size'], [1, 'Same'], [2, '2× size']].map((x) => `<button type="button" data-act="bs" data-v="${x[0]}" aria-pressed="${x[0] === mult}">${x[1]}</button>`).join('')}</div>`;
    const plain = gv >= 50 ? 'More than half the runs hit zero.' : gv >= 15 ? `About ${gv} runs in 100 hit zero.` : 'Few runs hit zero.';
    return `<section class="card" id="sec-ruin"><div class="card-h"><h2>Risk of ruin</h2>${seg}</div>`
      + `<div class="ruin-w">${gauge}<div class="ruin-t"><b>${gv} in 100</b><span>runs of the next ${SIM_STEPS} bets end with no money left (under $1).</span><small>${esc(plain)}</small></div></div>`
      + `<svg class="fan" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${SIM_N} simulated runs of ${SIM_STEPS} bets from ${usd(m.bal)}: the middle run ends at ${usd(r.med)}`)}">`
      + `<line class="fn-z" x1="${PX}" x2="${W - PX}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}"/><line class="fn-s" x1="${PX}" x2="${W - PX}" y1="${Y(m.bal).toFixed(1)}" y2="${Y(m.bal).toFixed(1)}"/>`
      + `<path class="fn-o" d="${band(0, 4)}"/><path class="fn-i" d="${band(1, 3)}"/><path class="fn-m" d="${med}"/><circle class="fn-d" cx="${X(0).toFixed(1)}" cy="${Y(m.bal).toFixed(1)}" r="3.5"/>`
      + `<text class="fn-t" x="${W - PX}" y="${(Y(F[SIM_STEPS][2]) - 5).toFixed(1)}" text-anchor="end">${esc(usd(r.med))}</text></svg>`
      + `<div class="xs"><span>now ${esc(usd(m.bal))}</span><span>${SIM_STEPS} bets later</span></div>`
      + `<div class="chips"><span class="chip"><b>${esc(usd(r.med))}</b>middle run</span><span class="chip"><b>${esc(pct(r.up))}</b>end above today</span>`
      + alt.map((a) => `<span class="chip ${a[0] === mult ? 'on' : ''}"><b>${esc(pct(a[1].ruin))}</b>ruin at ${a[0] === 0.5 ? '½' : a[0] === 2 ? '2×' : '1×'}</span>`).join('') + '</div>'
      + `<p class="muted small">Built from ${esc(fmtN(m.n))} settled bets (${esc(m.src)}): it wins ${esc(pct(m.p))}, a win adds about ${esc(usd(m.aw))}, a loss costs about ${esc(usd(m.al))}, so a bet is ${esc(pct(m.al / m.bal))} of today's balance. `
      + `${SIM_N} runs, the same every time you open the page. Light band = 80% of runs, dark = the middle half. A guide, not a promise: the real bot sizes its bets by its own rules.</p></section>`;
  }

  // ---- the timeline: the bot's alerts and every loss and big win, newest first, grouped by day
  function timelineHtml(k, v) {
    const ev = [], seen = new Set();
    const add = (t, lv, tx, c) => { const key = lv + tx; if (seen.has(key)) return; seen.add(key); ev.push({ t, lv, tx, c }); };
    alertsList(k, v).forEach((a) => add(a.t || parseT(k.t), a.lv, a.tx, a.c));
    const st = settled(v), wins = st.filter((t) => num(t.pnl) > 0.005).sort(by((t) => num(t.pnl), true)).slice(0, 2);
    st.filter((t) => num(t.pnl) < -0.005).forEach((t) => add(parseT(t.t), 'bad', `Lost ${usd(-num(t.pnl))} · ${String(t.title || t.ticker || 'a bet').slice(0, 90)}`));
    wins.forEach((t) => add(parseT(t.t), 'ok', `Won ${usd(num(t.pnl), true)} · ${String(t.title || t.ticker || 'a bet').slice(0, 90)}`));
    const list = ev.filter((e) => e.t).sort((a, b) => b.t - a.t).slice(0, 14);
    const head = `<div class="card-h"><h2>Timeline${list.length ? ' · ' + list.length : ''}</h2></div>`;
    if (!list.length) return `<section class="card" id="sec-tl">${head}<p class="empty">No events yet: alerts, losses and big wins collect here.</p></section>`;
    let last = '', out = '';
    const today = dayKey(nowS()), yday = dayKey(nowS() - 86400);
    list.forEach((e) => {
      const d = dayKey(e.t);
      if (d !== last) { last = d; out += `<li class="tl-d">${esc(d === today ? 'Today' : d === yday ? 'Yesterday' : dayLabel(d))}</li>`; }
      out += `<li class="tl-e ${e.lv}"><i aria-hidden="true"></i><div><span>${esc(e.tx)}</span><small${e.c ? ` class="cdn soon" data-c="${e.c}"` : ''}>${e.c ? esc(closesTxt(e.c)) : esc(ff(F.time, e.t) + ' · ' + ago(e.t))}</small></div></li>`;
    });
    return `<section class="card" id="sec-tl">${head}<ul class="tl">${out}</ul></section>`;
  }

  // ---- the ticker tape under the header: open bets and the latest results, scrolling (still with reduced motion)
  function tapeHtml(v) {
    const it = [];
    v.pos.slice(0, 6).forEach((p) => { const m = posModel(p, 0); it.push(`<span>${sideTag(m.side)}${esc((m.asset || '') + ' ' + cents(p.avg_price))}${m.prob != null ? ` <em class="up">edge ${esc(edgeC(m.edge))}</em>` : ''}${m.closes ? ` <em>${esc(left(m.closes) || 'settling')}</em>` : ''}</span>`); });
    settled(v).slice(0, 10).forEach((t) => { const x = num(t.pnl), a = assetOf(t); it.push(`<span>${esc(a || catOf(t))} <em class="${cls(x)}">${esc(usd(x, true))}</em></span>`); });
    if (!it.length) return '';
    const run = it.join('<b aria-hidden="true">◆</b>');
    return `<div class="tape-in">${run}<b aria-hidden="true">◆</b>${run}<b aria-hidden="true">◆</b></div>`;
  }

  // ---- recent trades, grouped by day, with show more
  function tradesHtml(v) {
    const tr = v.tr, n = tr.length;
    if (!n) return '<section class="card" id="sec-tr"><div class="card-h"><h2>Recent trades</h2></div><p class="empty">No trades yet.</p></section>';
    const shown = Math.min(n, Math.max(TR_PAGE, S.trShown)), rest = n - shown;
    const dp = new Map(v.days), today = dayKey(nowS()), yday = dayKey(nowS() - 86400);
    const out = [];
    let last = null;
    tr.slice(0, shown).forEach((t) => {
      const tt = parseT(t.t), k = tt ? dayKey(tt) : '';
      if (k !== last) {
        last = k;
        const p = dp.get(k);
        out.push(`<li class="day">${esc(k === today ? 'Today' : k === yday ? 'Yesterday' : k ? dayLabel(k) : 'Earlier')}${p != null ? `<span class="${cls(p)}">${esc(usd(p, true))}</span>` : ''}</li>`);
      }
      const side = sideOf(t), c = num(t.contracts), pnl = num(t.pnl), act = String(t.action == null ? '' : t.action).trim().toLowerCase(), a = assetOf(t);
      const what = [cap(act), c == null ? '' : fmtN(c)].filter(Boolean).join(' ') + (num(t.price) == null ? '' : ' @ ' + cents(t.price));
      const strat = t.strategy != null ? String(t.strategy) : t.book != null ? String(t.book) : '';
      out.push(`<li class="row"><b class="t">${sideTag(side)}${assetTag(a)}${esc(t.title || t.ticker || '')}</b>`
        + `<span class="v ${cls(pnl)}">${pnl != null ? esc(usd(pnl, true)) : act === 'sell' ? '' : '<span class="open">OPEN</span>'}</span>`
        + `<small>${esc(what)}${tt ? ' · ' + esc(ff(F.time, tt)) : ''}${strat ? ' · ' + esc(strat.slice(0, 40)) : ''}</small></li>`);
    });
    const more = n > TR_PAGE ? `<button type="button" class="more" data-act="more">${rest > 0 ? `Show ${Math.min(TR_PAGE, rest)} more · ${rest} left` : 'Show fewer'}</button>` : '';
    return `<section class="card" id="sec-tr"><div class="card-h"><h2>Recent trades</h2><span class="r muted">${shown} of ${n}</span></div><ul class="rows" id="trList">${out.join('')}</ul>${more}</section>`;
  }

  // ---- preview while not connected (owner can't see his dashboard until the bot's chat finishes the setup): a built-in sample
  // in the real bot's shape. Built on every draw, never kept: not in S.k / S.raw, not the offline copy, not in any cache; real
  // data (or a real copy on this phone) ends it and hides the button.
  const previewing = () => S.preview && !S.k && S.state !== 'ok';
  function sample() {
    const now = Math.floor(Date.now() / 1000), today = dayKey(now) || '2026-11-01', p = pd(today);
    let seed = 20261101;
    const rnd = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
    const r2 = (x) => Math.round(x * 100) / 100;
    const trades = [];
    let t = now - 240;
    for (let i = 0; i < 16; i++) {
      const close = Math.ceil((t + 60) / 900) * 900, c = i % 7 === 3 ? 'BTCD' : i % 11 === 6 ? 'GOLD' : ['ETH', 'BTC', 'HYPE'][i % 3];
      const n = 10 + Math.floor(rnd() * 10), price = r2(95.5 + rnd() * 2) / 100, win = rnd() < 0.9;
      const title = c === 'BTCD' ? `Bitcoin above $80,500 at ${ff(F.time, Math.ceil(close / 3600) * 3600)} ET ${ff(F.md, close)}` : c === 'GOLD' ? 'Gold 5 PM close'
        : `${c} up or down · 15 min to ${ff(F.time, close)} ET ${ff(F.md, close)}`;
      trades.push({ t, ticker: `KX${c}${c === 'BTCD' || c === 'GOLD' ? '' : '15M'}-SAMPLE-${i + 1}`, title, side: c === 'BTCD' || c === 'GOLD' ? (rnd() < 0.7 ? 'yes' : 'no') : rnd() < 0.6 ? 'UP' : 'DOWN',
        action: 'buy', contracts: n, price, pnl: i === 0 ? null : r2(win ? n * (1 - price) - 0.02 * n : -n * price - 0.02 * n) });
      t -= 1500 + Math.floor(rnd() * 1800);
    }
    const todayPnl = r2(sum(trades.filter((x) => x.pnl != null && dayKey(x.t) === today).map((x) => x.pnl)));
    const days = [];
    for (let i = 29; i >= 1; i--) days.push([new Date(Date.UTC(p.y, p.m - 1, p.d - i)).toISOString().slice(0, 10), r2(-6 + rnd() * 9.5)]);
    days.push([today, todayPnl]);
    const equity = [];
    let bal = 67.1;
    for (let i = 96; i >= 1; i--) { bal = r2(Math.max(64, bal + (rnd() - 0.47) * 0.5)); equity.push([now - i * 900, bal]); }
    equity.push([now, 68.12]);
    const first = trades[0];
    return {
      v: 1, kind: 'kalshi', name: 'Sample bot', mode: 'live', running: true, t: now - 30, pub_t: now - 20, balance: 68.12,
      status: 'Sample · 3 live strategies · 1 open bet', note: 'Sample data, not your account',
      today_pnl: todayPnl, week_pnl: -6.4, total_pnl: -14.45,
      kelly: { fraction: 0.25, bankroll: 68.12, max_bet: 20 },
      alerts: [{ t: now - 1800, level: 'warn', text: 'Sample alert: 2 losses in a row on HYPE' }],
      positions: [{ ticker: first.ticker, title: first.title, side: first.side, contracts: first.contracts, avg_price: first.price, prob: 0.985,
        value: r2(first.contracts * first.price), closes: new Date((Math.ceil((now + 60) / 900) * 900) * 1000).toISOString() }],
      trades, days, equity,
      strategies: [
        { name: '15-min favourites', mode: 'live', running: true, today_pnl: r2(todayPnl - 0.41), total_pnl: -21.37, trades: 612, wins: 571, losses: 41 },
        { name: 'Late favourite (BTC hourly)', mode: 'live', running: true, today_pnl: 0.41, total_pnl: 5.12, trades: 48, wins: 45, losses: 3 },
        { name: 'Gold 5 PM', mode: 'live', running: true, today_pnl: 0, total_pnl: 1.8, trades: 9, wins: 8, losses: 1 },
      ],
    };
  }
  const previewBar = () => '<div class="note sample" id="previewBar" role="status"><p><b>Sample data, not your account</b>'
    + '<span>How this page looks once your bot is connected.</span></p><button type="button" class="btn ghost" data-act="exit-preview">Exit preview</button></div>';

  // ---- waiting / error / loading
  const waitHtml = () => '<section class="card wait"><h2>Connect your Kalshi bot</h2><p>Your Kalshi bot runs on its own server. One paste in its own chat connects it to Jarvis:</p>'
    + `<code id="step">${esc(STEP)}</code><div class="wait-a"><button type="button" class="btn" data-act="copy">Copy the message</button><span class="muted" id="copied" role="status"></span></div>`
    + '<p class="muted">After that it sends its numbers here every minute, by itself.</p>'
    + `<ul class="feat" aria-label="What this page shows once connected">${['Balance &amp; P&amp;L', 'Alerts', 'Open bets · live edge', 'Kelly sizing', 'By market', 'By price', 'Calibration', 'P&amp;L calendar', 'Equity curve']
      .map((f) => `<li>${f}</li>`).join('')}</ul>`
    + (S.k ? '' : '<button type="button" class="quiet" data-act="preview">Preview with sample data</button>') + '</section>';
  const errHtml = () => `<section class="card err"><p class="muted">No connection to the Kalshi feed right now${navigator.onLine === false ? ' (this phone is offline)' : ''}. Tap Refresh to try again.</p>`
    + '<div><button type="button" class="btn ghost" data-act="retry">Try again</button></div></section>';
  const skelHtml = () => '<div class="sk sk1" aria-hidden="true"></div><div class="sk sk2" aria-hidden="true"></div><div class="sk sk3" aria-hidden="true"></div>';

  function footHtml() {
    if (previewing()) return 'Sample data for the preview, not your account: none of these numbers are real.';
    const k = S.k;
    if (!k || S.state === 'waiting') return 'Read-only. The Kalshi bot runs on its own server.';
    const pt = parseT(k.pub_t);
    return `Read-only · the bot's own numbers and prices, as of its last update${pt ? ' · sent ' + esc(when(pt)) : ''}`;
  }

  // ------------------------------------------------------------------ the four groups and their one-line summaries
  const GROUPS = { today: '01', edge: '02', perf: '03', alerts: '04' };
  function groupHtml(id, title, summary, cards) {
    const body = cards.filter(Boolean).join('');
    if (!body) return '';
    return `<section class="grp" id="g-${id}" aria-labelledby="gh-${id}"><header class="grp-h"><span class="grp-n" aria-hidden="true">${GROUPS[id]}</span>`
      + `<h2 id="gh-${id}">${esc(title)}</h2>${summary ? `<span class="grp-s">${summary}</span>` : ''}</header>${body}</section>`;
  }
  const todaySum = (k) => (num(k.today_pnl) == null ? '' : `<b class="${cls(k.today_pnl)}">${esc(usd(k.today_pnl, true))}</b> today`);
  function edgeSum(v) {
    const ev = v.pos.map(posModel).filter((m) => m.ev != null);
    return ev.length ? `<b class="${cls(sum(ev.map((m) => m.ev)))}">${esc(usd(sum(ev.map((m) => m.ev)), true))}</b> EV` : v.pos.length ? 'Kelly sizing' : 'no open bets';
  }
  const perfSum = (k) => (num(k.total_pnl) == null ? '' : `<b class="${cls(k.total_pnl)}">${esc(usd(k.total_pnl, true))}</b> all time`);
  function alertSum(k, v) {
    const a = alertsList(k, v), bad = a.filter((x) => x.lv !== 'info').length;
    S.alerts = { n: a.length, bad };
    return bad ? `<b class="down">${bad} need${bad === 1 ? 's' : ''} you</b>` : a.length ? `${a.length} note${a.length === 1 ? '' : 's'}` : 'all quiet';
  }
  function navUi(data) {                     // the section bar: shown with data, the alerts count on its last button
    const bar = $('#secnav');
    if (!bar) return;
    const b = bar.querySelector('[data-go="alerts"] b');
    if (b) { const a = S.alerts || { n: 0, bad: 0 }; b.textContent = a.n ? String(a.n) : ''; b.className = a.bad ? 'bad' : ''; }
    if (!data) { bar.hidden = true; return; }
    const fx = FX();
    if (fx) fx.nav(); else bar.hidden = false;
  }
  function emitData(v, data) {               // korb.js (the 3D header) listens: a point per open bet, a pulse on new numbers
    const detail = { bets: data && v ? v.pos.map((p) => ({ side: sideKey(sideOf(p)) })) : [], fresh: S.fresh, state: S.state, shown: !!data };
    S.fresh = false;
    window.__kalshiData = detail;
    try { document.dispatchEvent(new CustomEvent('kalshi:data', { detail })); } catch (_) { /* old browser */ }
  }

  // ------------------------------------------------------------------ render
  function fit(root) {                    // shrink a number until it fits its box (long values, wide fonts): never cut off
    (root || document).querySelectorAll('.fit').forEach((el) => {
      el.style.fontSize = '';
      if (el.scrollWidth <= el.clientWidth + 0.5) return;
      let fs = parseFloat(getComputedStyle(el).fontSize) || 14;
      for (let i = 0; i < 24 && fs > 9 && el.scrollWidth > el.clientWidth + 0.5; i++) { fs -= 0.5; el.style.fontSize = fs + 'px'; }
    });
  }

  function render() {
    // not while a finger reads the chart or the iPhone's sort picker is open (a new body would close it): right after
    if (S.scrub || (document.activeElement && document.activeElement.id === 'posSort')) { S.pend = true; return; }
    const body = $('#body');
    if (!body) return;
    const ae = document.activeElement, fid = ae && ae.id && body.contains(ae) ? ae.id : '';
    let sel = null;
    try { sel = fid && typeof ae.selectionStart === 'number' ? [ae.selectionStart, ae.selectionEnd] : null; } catch (_) { sel = null; }
    $('#sub').innerHTML = subHtml();
    let html;
    const pv = previewing();
    if (S.state === 'waiting' && !pv) html = waitHtml();
    else if (!S.k && !pv) html = S.state === 'error' ? errHtml() : skelHtml();
    else {
      const k = pv ? sample() : S.k, v = norm(k);
      S.v = v;
      // one clean hierarchy (owner 2026-11-03 "more organized"): Today -> Edge -> Performance -> Alerts
      const eq = safe('equity', () => eqHtml(v));              // first: the stats read its series (max drawdown)
      html = (pv ? previewBar() : notesHtml(k))
        + groupHtml('today', 'Today', todaySum(k), [safe('risk guard', () => riskHtml(k)), safe('why', () => whyHtml(k, v)), safe('guard', () => guardHtml(k, v)), safe('verdict', () => verdictHtml(k, v)), safe('balance', () => heroHtml(k, v)), safe('open bets', () => posHtml(v)), safe('rest', () => restHtml(k, v))])
        + groupHtml('edge', 'Edge', edgeSum(v), [safe('what-if', () => whatifHtml(k, v)), safe('where the money is', () => scanHtml(k, v)), safe('edge wait', () => edgeWaitHtml(k, v)), safe('live edge', () => edgeHtml(k, v)), safe('edge map', () => edgeMapHtml(k, v)), safe('sizing', () => kellyHtml(k, v)), safe('risk of ruin', () => ruinHtml(k, v))])
        + groupHtml('perf', 'Performance', perfSum(k), [eq, safe('race', () => raceHtml(v)), safe('heat map', () => heatHtml(v)), safe('calendar', () => calHtml(v)), safe('daily P&L', () => barsHtml(v)), safe('stats', () => statsHtml(v, k)),
          safe('battle', () => battleHtml(k, v)), safe('strategies', () => stratHtml(v)), safe('prices', () => bucketHtml(k, v)), safe('calibration', () => calibHtml(k, v)), safe('markets', () => catHtml(k, v)), safe('journal', () => journalHtml(v))])
        + groupHtml('alerts', 'Alerts', alertSum(k, v), [safe('alerts', () => alertsHtml(k, v)), safe('timeline', () => timelineHtml(k, v)), safe('trades', () => tradesHtml(v))]);
    }
    S.label = S.k && S.state !== 'waiting' ? stateOf(S.k)[1] : '';
    const data = !!S.k && S.state !== 'waiting';
    body.classList.toggle('intro', data && S.intro);         // the panels rise in once, not on every minute's update
    if (data) S.intro = false;
    body.innerHTML = html;
    body.setAttribute('aria-busy', !S.k && S.state === 'loading' ? 'true' : 'false');
    body.setAttribute('data-state', pv ? 'preview' : S.state === 'waiting' ? 'waiting' : !S.k ? S.state : S.state === 'error' ? 'offline' : S.label === 'Not updating' && S.state === 'ok' ? 'stale' : S.state === 'loading' ? 'loading' : 'ok');
    const foot = $('#foot');
    if (foot) foot.innerHTML = footHtml();
    const tape = $('#tape');
    if (tape) { let th = ''; try { th = S.v && (S.k || pv) && S.state !== 'waiting' ? tapeHtml(S.v) : ''; } catch (_) { th = ''; } tape.innerHTML = th; tape.hidden = !th; }
    bindChart();
    fit(body);
    const shown = pv || data, fx = FX();
    navUi(shown);
    emitData(S.v, shown);
    if (fx && shown) { fx.odometer(body); fit(body); }      // the rolling digits are a little wider than the plain number: fit again so none is cut while it rolls
    if (fid) {
      const nEl = document.getElementById(fid);
      if (nEl) {
        try { nEl.focus({ preventScroll: true }); } catch (_) { nEl.focus(); }
        if (sel && nEl.setSelectionRange) { try { nEl.setSelectionRange(sel[0], sel[1]); } catch (_) { /* not a text field */ } }
      }
    }
    busyUi();
  }

  function swap(id, html) {
    const el = document.getElementById(id);
    if (!el) { render(); return; }
    const t = document.createElement('div');
    t.innerHTML = html;
    const n = t.firstElementChild;
    if (n) { el.replaceWith(n); fit(n); } else el.remove();
  }

  function busyUi() {
    const b = $('#refresh');
    if (b) b.setAttribute('aria-busy', S.busy ? 'true' : 'false');
  }

  function tick() {
    document.querySelectorAll('[data-ago]').forEach((n) => { n.textContent = 'updated ' + ago(+n.getAttribute('data-ago')); });
    document.querySelectorAll('.cdn[data-c]').forEach((n) => { const c = +n.getAttribute('data-c'); n.textContent = closesTxt(c); n.className = 'cdn' + cdnCls(c); });
    document.querySelectorAll('svg.ring[data-c]').forEach((n) => { const c = +n.getAttribute('data-c'), v = n.querySelector('.rg-v'); n.setAttribute('class', 'ring' + cdnCls(c)); if (v) v.setAttribute('stroke-dasharray', (ringFrac(c) * 100).toFixed(1) + ' 100'); });
    if (S.k && S.state !== 'waiting' && stateOf(S.k)[1] !== S.label) render();       // e.g. 15 min without an update: the stale note
  }

  // under an hour to a bet's close the countdown (and its ring) moves every second; one timer, only while such a bet is on screen
  function tickFast() {
    const t = nowS();
    document.querySelectorAll('.cdn[data-c]').forEach((n) => { const c = +n.getAttribute('data-c'); if (c - t < 3600 && c - t > -2) { n.textContent = closesTxt(c); n.className = 'cdn' + cdnCls(c); } });
    document.querySelectorAll('svg.ring[data-c]').forEach((n) => { const c = +n.getAttribute('data-c'); if (c - t < 3600 && c - t > -2) { const v = n.querySelector('.rg-v'); n.setAttribute('class', 'ring' + cdnCls(c)); if (v) v.setAttribute('stroke-dasharray', (ringFrac(c) * 100).toFixed(1) + ' 100'); } });
  }

  // ------------------------------------------------------------------ interactions (delegated: the sections are re-rendered)
  document.addEventListener('click', (e) => {
    const b = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
    if (!b || b.disabled) return;
    const a = b.getAttribute('data-act'), val = b.getAttribute('data-v') || '';
    if (a === 'kf') { const f = +val; S.kf = [0.25, 0.5, 1].indexOf(f) >= 0 ? f : 0; if (S.v) swap('sec-kelly', kellyHtml(previewing() ? sample() : S.k, S.v)); }
    else if (a === 'range') { S.ui.range = val; saveUi(); if (S.v) { swap('sec-eq', eqHtml(S.v)); bindChart(); } }
    else if (a === 'eqv') { S.eqv = val === 'days' ? 'days' : 'eq'; render(); const nb = document.querySelector('#sec-eq [data-act="eqv"][aria-pressed="true"]'); if (nb) nb.focus({ preventScroll: true }); }
    else if (a === 'side') {
      S.ui.side = SIDES.indexOf(val) >= 0 ? val : 'all';
      saveUi();
      document.querySelectorAll('[data-act="side"]').forEach((x) => x.setAttribute('aria-pressed', String(x.getAttribute('data-v') === S.ui.side)));
      const l = $('#posList');
      if (l) l.innerHTML = posRows();
    } else if (a === 'more') {
      const n = S.v ? S.v.tr.length : 0;
      S.trShown = S.trShown >= n ? TR_PAGE : S.trShown + TR_PAGE;
      if (S.v) swap('sec-tr', tradesHtml(S.v));
      if (S.trShown === TR_PAGE) { const sec = $('#sec-tr'); if (sec && sec.scrollIntoView) sec.scrollIntoView({ block: 'nearest' }); }
      const nb = $('#sec-tr .more');
      if (nb) nb.focus({ preventScroll: true });
    } else if (a === 'month') {
      S.cal = /^\d{4}-\d{2}$/.test(val) ? val : '';
      S.calSel = '';
      if (S.v) swap('sec-cal', calHtml(S.v));
      const lab = b.getAttribute('aria-label'), f = Array.prototype.filter.call(document.querySelectorAll('#sec-cal .nav'), (x) => x.getAttribute('aria-label') === lab)[0];
      if (f && !f.disabled) f.focus({ preventScroll: true });
    } else if (a === 'day') {
      S.calSel = S.calSel === val ? '' : val;
      document.querySelectorAll('#sec-cal .cd[data-v]').forEach((x) => x.setAttribute('aria-pressed', String(x.getAttribute('data-v') === S.calSel)));
      const r = $('#calRead');
      if (r && S.v) r.innerHTML = calRead(new Map(S.v.days));
    } else if (a === 'jf') { S.jf = ['all', 'win', 'loss'].indexOf(val) >= 0 ? val : 'all'; if (S.v) swap('sec-journal', journalHtml(S.v)); }
    else if (a === 'jnote') { S.jn = S.jn === val ? '' : val; if (S.v) swap('sec-journal', journalHtml(S.v)); const ta = $('#jnote'); if (ta) ta.focus({ preventScroll: true }); }
    else if (a === 'gpx') { S.gpx = S.gpx === val ? '' : val; const k = previewing() ? sample() : S.k; if (S.v && k) { swap('sec-guard', guardHtml(k, S.v)); const nb = Array.prototype.filter.call(document.querySelectorAll('#sec-guard [data-act="gpx"]'), (x) => x.getAttribute('data-v') === val)[0]; if (nb) nb.focus({ preventScroll: true }); } }
    else if (a === 'wi') { S.wi = S.wi === val ? '' : val; const k = previewing() ? sample() : S.k; if (S.v && k) { swap('sec-whatif', whatifHtml(k, S.v)); const nb = Array.prototype.filter.call(document.querySelectorAll('#sec-whatif [data-act="wi"]'), (x) => x.getAttribute('data-v') === val)[0]; if (nb) nb.focus({ preventScroll: true }); } }
    else if (a === 'sc') { S.sc = S.sc === val ? '' : val; const k = previewing() ? sample() : S.k; if (S.v && k) { swap('sec-scan', scanHtml(k, S.v)); const nb = Array.prototype.filter.call(document.querySelectorAll('#sec-scan [data-act="sc"]'), (x) => x.getAttribute('data-v') === val)[0]; if (nb) nb.focus({ preventScroll: true }); } }
    else if (a === 'jump') jump(val);
    else if (a === 'race') { if (S.raceOff.has(val)) S.raceOff.delete(val); else S.raceOff.add(val); if (S.v) { swap('sec-race', raceHtml(S.v)); const nb = Array.prototype.filter.call(document.querySelectorAll('#sec-race .rchip'), (x) => x.getAttribute('data-v') === val)[0]; if (nb) nb.focus({ preventScroll: true }); } }
    else if (a === 'bm') { S.bm = val; if (S.v && S.k) { swap('sec-battle', battleHtml(S.k, S.v)); const nb = Array.prototype.filter.call(document.querySelectorAll('#sec-battle [data-act="bm"]'), (x) => x.getAttribute('data-v') === val)[0]; if (nb) nb.focus({ preventScroll: true }); } }
    else if (a === 'bs') { S.bs = +val; const k = previewing() ? sample() : S.k; if (S.v && k) { swap('sec-ruin', ruinHtml(k, S.v)); const nb = Array.prototype.filter.call(document.querySelectorAll('#sec-ruin [data-act="bs"]'), (x) => x.getAttribute('data-v') === val)[0]; if (nb) nb.focus({ preventScroll: true }); } }
    else if (a === 'kcp') { S.calc[b.getAttribute('data-f') === 'p' ? 'p' : 'c'] = val; kcSync(); }
    else if (a === 'retry') load();
    else if (a === 'copy') copyStep();
    else if (a === 'preview' || a === 'exit-preview') {
      S.preview = a === 'preview' && !S.k;
      S.cal = ''; S.calSel = ''; S.trShown = TR_PAGE; S.q = '';
      render();
      try { window.scrollTo(0, 0); } catch (_) { /* old browser */ }
      const f = $(S.preview ? '#previewBar button' : '[data-act="preview"]');
      if (f) f.focus({ preventScroll: true });
    }
  });
  // the heat map is one SVG: a tap finds its day from where it landed (so no 40 tiny buttons), the arrow keys walk the days
  const heatAt = (e) => {
    const el = e.target && e.target.closest ? e.target.closest('#heat') : null;
    if (!el) return null;
    const r = e.target.closest('.hc');
    if (r) return r.getAttribute('data-d');
    const bb = el.getBoundingClientRect(), vb = el.viewBox.baseVal, m = S.v ? heatModel(S.v) : null;
    if (!m || !bb.width) return null;
    const cell = Math.max(9, Math.min(20, Math.floor(300 / m.cols) - 3)) + 3, x = (e.clientX - bb.left) / bb.width * vb.width - 14, y = (e.clientY - bb.top) / bb.height * vb.height - 13;
    const col = Math.floor(x / cell), row = Math.floor(y / cell), i = col * 7 + row - m.dow0;
    if (x < 0 || y < 0 || row > 6 || i < 0 || i >= m.n) return null;
    return new Date(m.d0 + i * 864e5).toISOString().slice(0, 10);
  };
  document.addEventListener('click', (e) => { const k = heatAt(e); if (k) heatPick(k); });
  document.addEventListener('keydown', (e) => {
    if (!e.target || e.target.id !== 'heat' || !S.v) return;
    const m = heatModel(S.v), d = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 }[e.key];
    if (!m || d == null) return;
    e.preventDefault();
    const cur = S.heatSel ? Math.round((Date.parse(S.heatSel + 'T00:00:00Z') - m.d0) / 864e5) : m.n - 1 - d;
    const i = Math.max(0, Math.min(m.n - 1, cur + d));
    S.heatSel = '';
    heatPick(new Date(m.d0 + i * 864e5).toISOString().slice(0, 10));
  });
  document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'posSort') { S.ui.sort = SORTS.some((s) => s[0] === e.target.value) ? e.target.value : 'closes'; saveUi(); const l = $('#posList'); if (l) l.innerHTML = posRows(); }
  });
  document.addEventListener('input', (e) => {
    if (e.target && (e.target.id === 'kcP' || e.target.id === 'kcC')) {
      S.calc[e.target.id === 'kcP' ? 'p' : 'c'] = String(e.target.value || '').replace(/[^\d.]/g, '').slice(0, 6);
      kcSync();
      return;
    }
    if (e.target && e.target.id === 'jnote') {
      const day = e.target.getAttribute('data-day') || '', all = LS.get('kalshi.journal', {}) || {}, txt = String(e.target.value || '').slice(0, JN_MAX);
      if (/^\d{4}-\d{2}-\d{2}$/.test(day)) { if (txt) all[day] = txt; else delete all[day]; LS.set('kalshi.journal', all); }
      return;
    }
    if (e.target && e.target.id === 'posQ') { S.q = String(e.target.value || '').slice(0, 80); const l = $('#posList'); if (l) l.innerHTML = posRows(); }
  });
  document.addEventListener('focusout', (e) => {
    if (e.target && e.target.id === 'posSort' && S.pend && !S.scrub) setTimeout(() => { if (S.pend && document.activeElement !== e.target) { S.pend = false; render(); } }, 0);
  });
  document.addEventListener('toggle', (e) => {
    const d = e.target;
    if (d && d.matches && d.matches('details[data-k]')) { const k = d.getAttribute('data-k'); if (d.open) S.open.add(k); else S.open.delete(k); }
  }, true);

  // a verdict line (or any link inside the page) glides to the card behind it and flashes it once
  function jump(id) {
    const t = document.getElementById(id);
    if (!t) return;
    const bar = $('#secnav'), sm = $('#previewBar'), fx = FX();
    const y = t.getBoundingClientRect().top + window.pageYOffset - (bar && !bar.hidden ? bar.offsetHeight : 0) - (sm ? sm.offsetHeight + 6 : 0) - 14;
    try { window.scrollTo({ top: Math.max(0, y), behavior: fx && fx.motion() ? 'smooth' : 'auto' }); } catch (_) { window.scrollTo(0, Math.max(0, y)); }
    t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash');
    setTimeout(() => t.classList.remove('flash'), 1800);
  }
  // the calculator's two boxes and its readout, redrawn from S.calc (typing and the preset chips both end here)
  function kcSync() {
    const k = previewing() ? sample() : S.k;
    const p = $('#kcP'), c = $('#kcC');
    if (p && p !== document.activeElement) p.value = S.calc.p;
    if (c && c !== document.activeElement) c.value = S.calc.c;
    document.querySelectorAll('[data-act="kcp"]').forEach((x) => x.setAttribute('aria-pressed', String(S.calc[x.getAttribute('data-f') === 'p' ? 'p' : 'c'] === x.getAttribute('data-v'))));
    const o = $('#kcOut'), kcv = $('#kcCurve');
    if (k) {
      const fr = S.kf || kellyCfg(k).f;
      if (o) o.innerHTML = calcOut(kellyCfg(k), fr);
      if (kcv) kcv.innerHTML = kellyCurve(k, fr);
    }
  }
  function copyStep() {
    const done = (ok) => { const n = $('#copied'); if (n) n.textContent = ok ? 'Copied' : 'Selected: copy it from the menu'; };
    const pick = () => {
      try { const r = document.createRange(); r.selectNodeContents($('#step')); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); } catch (_) { /* nothing to select */ }
      done(false);
    };
    try { navigator.clipboard.writeText(paste()).then(() => done(true), pick); } catch (_) { pick(); }
  }

  // ------------------------------------------------------------------ the kit's pin (kit.json, same origin, 3 s at most)
  async function kit() {
    const r = await get('kit.json', {}, 3000);
    if (!r || !r.ok) return;
    let j = null;
    try { j = await r.json(); } catch (_) { return; }
    const h = j && typeof j === 'object' && typeof j.sha256 === 'string' ? j.sha256 : '';
    if (!/^[0-9a-f]{64}$/.test(h)) return;
    STEP = pinned(h);
    const el = $('#step');
    if (el) el.textContent = STEP;
  }

  // ------------------------------------------------------------------ the upcoming Kalshi City (../kalshicity/): linked only once it exists on the site
  async function city() {
    let ac = null, tm = 0, r = null;
    try { ac = new AbortController(); tm = setTimeout(() => ac.abort(), 3000); } catch (_) { ac = null; }
    try { r = await fetch('../kalshicity/', { method: 'HEAD', cache: 'no-cache', signal: ac ? ac.signal : undefined }); } catch (_) { r = null; } finally { clearTimeout(tm); }
    if (!r || !r.ok || !/html/i.test(r.headers.get('content-type') || '')) return;
    S.city = true;
    if (S.v && S.state !== 'waiting' && !S.scrub) render();
  }

  // ------------------------------------------------------------------ offline
  function offline() {                // sw.js: the page opens without a connection, never on a browser error page
    try {
      if (!('serviceWorker' in navigator)) return;
      navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => null);
    } catch (_) { /* no service worker here */ }
  }

  // ------------------------------------------------------------------ start
  theme();
  $('#refresh').addEventListener('click', () => load());
  render();                         // the saved copy (or the loading cards) at once, then the feed
  load();
  setInterval(() => { if (document.visibilityState === 'visible') load(); }, POLL_MS);
  setInterval(() => { if (document.visibilityState === 'visible') tick(); }, TICK_MS);
  setInterval(() => { if (document.visibilityState === 'visible') tickFast(); }, 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - S.at > 15e3) load(); });
  window.addEventListener('pageshow', (e) => { if (e.persisted) load(); });
  window.addEventListener('online', () => load());
  let rz = 0;
  window.addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => fit()); });
  try {                             // Jarvis's fonts swap in after the first paint: numbers are fitted again then
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fit());
    if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => fit());
  } catch (_) { /* no font loading API */ }
  kit();
  city();
  rewardsLoad();
  k1Load();
  k8Show(null);                                       // the K8 status card: the next-window countdown from the first paint
  k8Load();                                           // + the K8 day dashboard's k8.json (Kalshi's public results), again every 15 min
  setInterval(k8Load, 15 * 60e3);
  offline();
})();

// K1 card: see k1Load

//
