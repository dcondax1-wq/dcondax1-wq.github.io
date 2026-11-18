// TYCHE data adapter: kalshi.json in, one plain Model out. No DOM, no three.js: the HUD and the scene only read the Model.
//
// The feed (contract: docs/KALSHI_PUBLISH.md, tools/kalshi_kit/public/kalshi_status_vm.py) is the one the Kalshi page reads:
// raw.githubusercontent.com first, the GitHub API when raw fails. A 404 means "not linked yet": the page shows the demo and
// backs off (the next try 10 min later, doubling to an hour), so a load makes ONE request until the owner links his bot.
// v1 / v2 feeds (no categories, buckets, calibration, stats, kelly, prob) still give a full Model: every v3 number is then
// worked out from the lists the feed does carry, and `own` says which came from the bot itself.
// Read-only: nothing here talks to Kalshi or places anything.

export const LOCAL = '../kalshi.json';      // this site's own copy (pc_publish): tried first, the GitHub address is the fallback
export const RAW = 'https://raw.githubusercontent.com/demetrades2000-coder/kalshi-feed/main/kalshi.json';
export const API = 'https://api.github.com/repos/demetrades2000-coder/kalshi-feed/contents/kalshi.json?ref=main';
export const STALE_S = 15 * 60;
const TIMEOUT_MS = 12e3;
const EVERY_OK_MS = 60e3, EVERY_ERR_MS = 120e3, BACKOFF_MS = 10 * 60e3, BACKOFF_MAX_MS = 60 * 60e3;
// price buckets, the same edges as the bot's own (kalshi_status_vm.py) and the Kalshi page
const EDGES = [0, 0.2, 0.4, 0.6, 0.8, 0.9, 0.95, 0.97, 0.99, 1.0001];
const ASSET_NAMES = { BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', XRP: 'XRP', DOGE: 'Dogecoin', HYPE: 'Hype', BNB: 'BNB', GOLD: 'Gold', SILVER: 'Silver' };

// ------------------------------------------------------------------ small parsers (junk in -> null, never a throw)
export const num = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string' || !v.trim()) return null;
  const x = +v;
  return Number.isFinite(x) ? x : null;
};
export const unit = (v) => { const x = num(v); return x != null && x >= 0 && x <= 1 ? x : null; };
const dol = (v) => { const x = num(v); return x == null ? null : x > 1 ? x / 100 : x; };         // dollars 0-1 (cents when > 1)
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v, n) => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim().slice(0, n);
const sum = (a) => a.reduce((s, x) => s + x, 0);
export const parseT = (v) => {                                // unix s / ms / ISO -> unix seconds
  if (v == null || v === '' || typeof v === 'boolean') return null;
  const x = num(v);
  if (x != null) return x > 1e12 ? x / 1000 : x;
  if (typeof v !== 'string') return null;
  const ms = Date.parse(v.trim().replace(/^(\d{4}-\d{2}-\d{2}) (\d)/, '$1T$2'));
  return Number.isFinite(ms) ? ms / 1000 : null;
};

const assetOf = (r) => {
  const a = str(r.asset, 6).toUpperCase();
  if (a) return a;
  const m = /^KX([A-Z]+)/.exec(String(r.ticker || ''));
  return m ? Object.keys(ASSET_NAMES).filter((x) => m[1].indexOf(x) === 0)[0] || '' : '';
};
/** The market category: the row's own (v3), else from the coin it trades, else "Other". */
export const categoryOf = (r) => str(r.category, 40) || ASSET_NAMES[assetOf(r)] || assetOf(r) || 'Other';
const sideOf = (r) => {
  const s = str(r.side, 8).toLowerCase();
  if ((s === 'yes' || s === 'no') && /\bup or down\b/i.test(String(r.title || ''))) return s === 'yes' ? 'up' : 'down';
  return s === 'up' || s === 'down' || s === 'yes' || s === 'no' ? s : '';
};

// ------------------------------------------------------------------ Kelly
/** Full Kelly for a binary contract bought at price c (0-1) with a chance p of paying $1: (p - c) / (1 - c). */
export const kellyFull = (p, c) => (p == null || c == null || c <= 0 || c >= 1 ? null : (p - c) / (1 - c));

/** The suggested stake for one bet at a Kelly fraction (¼ = 0.25 ...), capped at the max bet. {f, raw, stake, capped}. */
export function kellyStake(prob, price, fraction, cfg) {
  const f = kellyFull(prob, price);
  if (f == null) return { f: null, raw: null, stake: null, capped: false };
  const bank = cfg && cfg.bankroll > 0 ? cfg.bankroll : 0;
  const raw = f > 0 && bank ? f * fraction * bank : 0;
  const capped = !!(cfg && cfg.maxBet != null && raw > cfg.maxBet);
  return { f, raw, stake: capped ? cfg.maxBet : raw, capped };
}

// ------------------------------------------------------------------ the Model
/** kalshi.json (any version) -> the Model the page draws. `now` in unix seconds. Never throws on junk: missing = null / []. */
export function normalize(k, now = Date.now() / 1000) {
  if (!isObj(k)) return null;
  const t = parseT(k.t);
  const balance = num(k.balance);

  // open bets: the coins on the wheel
  const open = arr(k.positions).filter(isObj).slice(0, 60).map((p, i) => {
    const n = num(p.contracts), avg = dol(p.avg_price), px = dol(p.price), prob = unit(p.prob);
    const ref = px != null ? px : avg, cost = n != null && avg != null ? Math.abs(n) * avg : null;
    const value = num(p.value) != null ? num(p.value) : n != null && px != null ? Math.abs(n) * px : null;
    const closes = parseT(p.closes), ticker = str(p.ticker, 64), title = str(p.title, 120) || ticker || 'Open bet';
    return {
      key: (ticker || title) + '#' + i, ticker, title, side: sideOf(p), category: categoryOf(p), strategy: str(p.strategy, 40),
      contracts: n, avg, px, ref, cost, value, pnl: num(p.pnl) != null ? num(p.pnl) : value != null && cost != null ? value - cost : null,
      prob, edge: prob != null && ref != null ? prob - ref : null, closes, left: closes != null ? closes - now : null,
    };
  });

  // settled bets (graded, not an exit): the coins that fall into the pools. Oldest first, the order they fell.
  const settled = arr(k.trades).filter(isObj)
    .filter((r) => num(r.pnl) != null && str(r.action, 10).toLowerCase() !== 'sell')
    .map((r, i) => {
      const n = num(r.contracts), price = dol(r.price), pnl = num(r.pnl);
      return { key: str(r.ticker, 64) + '@' + (parseT(r.t) || i) + '#' + i, t: parseT(r.t), title: str(r.title, 120) || str(r.ticker, 64) || 'Bet', strategy: str(r.strategy, 40),
        side: sideOf(r), category: categoryOf(r), contracts: n, price, prob: unit(r.prob), pnl, win: pnl > 0.005, loss: pnl < -0.005,
        staked: n != null && price != null ? Math.abs(n) * price : null };
    })
    .sort((a, b) => (a.t || 0) - (b.t || 0));

  const categories = categoryRows(k, settled);
  const stats = statsOf(k, settled, categories);
  const kelly = kellyCfg(k, balance);
  const next = open.filter((o) => o.left != null && o.left > -60).sort((a, b) => a.closes - b.closes)[0] || null;
  // colours: the biggest categories first, over everything the page shows
  const weight = new Map();
  const add = (name, w) => weight.set(name, (weight.get(name) || 0) + w);
  categories.rows.forEach((c) => add(c.name, (c.staked || 0) + (c.n || 0)));
  open.forEach((o) => add(o.category, (o.cost || 0) + 1));
  settled.forEach((s) => add(s.category, 0.5));
  const order = Array.from(weight.entries()).sort((a, b) => b[1] - a[1]).map((e) => e[0]);

  return {
    v: num(k.v) || 1, name: str(k.name, 40) || 'Kalshi bot', mode: str(k.mode, 12).toLowerCase(), running: k.running === true ? true : k.running === false ? false : null,
    status: str(k.status, 120), t, age: t != null ? Math.max(0, now - t) : null,
    balance, today: num(k.today_pnl), week: num(k.week_pnl), total: num(k.total_pnl),
    open, settled, next, categories, order, stats, kelly,
    buckets: bucketRows(k, settled), calibration: calibRows(k, settled), equity: equityOf(k, balance, t != null ? t : now),
    days: daysOf(k),
    alerts: arr(k.alerts).filter(isObj).map((a) => ({ t: parseT(a.t), level: ['bad', 'warn', 'info'].indexOf(str(a.level, 8).toLowerCase()) >= 0 ? str(a.level, 8).toLowerCase() : 'info', text: str(a.text, 160) }))
      .filter((a) => a.text).slice(0, 20),
    hasProb: open.some((o) => o.prob != null),
  };
}

function kellyCfg(k, balance) {
  const c = isObj(k.kelly) ? k.kelly : {}, f = unit(c.fraction), b = num(c.bankroll), mb = num(c.max_bet), me = unit(c.min_edge);
  return { fraction: f && f > 0 ? f : 0.25, own: f != null && f > 0, bankroll: b != null && b > 0 ? b : balance != null && balance > 0 ? balance : null,
    maxBet: mb != null && mb > 0 ? mb : null, minEdge: me };
}

function categoryRows(k, settled) {
  if (Array.isArray(k.categories)) {
    const rows = k.categories.filter(isObj).map((c) => ({ name: str(c.name, 40), group: str(c.group, 30), n: num(c.trades), w: num(c.wins), l: num(c.losses),
      pnl: num(c.pnl), staked: num(c.staked) })).filter((c) => c.name);
    return { own: true, rows };
  }
  const m = new Map();
  settled.forEach((s) => {
    const r = m.get(s.category) || { name: s.category, group: '', n: 0, w: 0, l: 0, pnl: 0, staked: 0 };
    r.n++; r.pnl += s.pnl; if (s.win) r.w++; else if (s.loss) r.l++;
    if (s.staked != null) r.staked += s.staked;
    m.set(s.category, r);
  });
  return { own: false, rows: Array.from(m.values()) };
}

/** Win rate and ROI, best source first: the bot's `stats` (v3), its `categories`, the strategies' W/L (v2), the trades list. */
function statsOf(k, settled, categories) {
  const s = isObj(k.stats) ? k.stats : null;
  if (s && num(s.wins) != null && num(s.losses) != null) {
    const w = num(s.wins), l = num(s.losses), st = num(s.staked), p = num(s.pnl);
    return { src: 'bot', trades: num(s.trades) != null ? num(s.trades) : w + l, wins: w, losses: l, winRate: w + l > 0 ? w / (w + l) : null,
      staked: st, pnl: p, roi: st > 0 && p != null ? p / st : null };
  }
  if (categories.own && categories.rows.length) {
    const w = sum(categories.rows.map((c) => c.w || 0)), l = sum(categories.rows.map((c) => c.l || 0));
    const st = sum(categories.rows.map((c) => c.staked || 0)), p = sum(categories.rows.map((c) => c.pnl || 0));
    return { src: 'bot', trades: sum(categories.rows.map((c) => c.n || 0)), wins: w, losses: l, winRate: w + l > 0 ? w / (w + l) : null,
      staked: st || null, pnl: p, roi: st > 0 ? p / st : null };
  }
  const tw = sum(settled.map((x) => (x.win ? 1 : 0))), tl = sum(settled.map((x) => (x.loss ? 1 : 0)));
  const tst = sum(settled.map((x) => x.staked || 0)), tp = sum(settled.map((x) => x.pnl));
  let w = tw, l = tl, src = 'trades';
  const strat = arr(k.strategies).filter(isObj).filter((x) => num(x.wins) != null && num(x.losses) != null);
  if (strat.length) { w = sum(strat.map((x) => num(x.wins))); l = sum(strat.map((x) => num(x.losses))); src = 'strategies'; }
  return { src, trades: settled.length, wins: w, losses: l, winRate: w + l > 0 ? w / (w + l) : null, staked: tst || null, pnl: tp,
    roi: tst > 0 ? tp / tst : null };
}

function bucketOf(p) { let i = 0; while (i < EDGES.length - 2 && p >= EDGES[i + 1]) i++; return i; }

function bucketRows(k, settled) {
  const fin = (r) => ({ ...r, winRate: r.w != null && r.l != null && r.w + r.l > 0 ? r.w / (r.w + r.l) : null, roi: r.staked > 0 && r.pnl != null ? r.pnl / r.staked : null });
  if (Array.isArray(k.buckets)) {
    return { own: true, rows: k.buckets.filter(isObj).map((b) => ({ lo: unit(b.lo), hi: unit(b.hi), n: num(b.trades), w: num(b.wins), l: num(b.losses), pnl: num(b.pnl), staked: num(b.staked) }))
      .filter((b) => b.lo != null && b.hi != null && b.lo < b.hi).sort((a, b) => a.lo - b.lo).slice(0, 12).map(fin) };
  }
  const m = new Map();
  settled.forEach((s) => {
    if (s.price == null || s.price <= 0 || s.price >= 1.0001) return;
    const i = bucketOf(s.price), r = m.get(i) || { lo: EDGES[i], hi: Math.min(1, EDGES[i + 1]), n: 0, w: 0, l: 0, pnl: 0, staked: 0 };
    r.n++; r.pnl += s.pnl; if (s.win) r.w++; else if (s.loss) r.l++;
    if (s.staked != null) r.staked += s.staked;
    m.set(i, r);
  });
  return { own: false, rows: Array.from(m.values()).sort((a, b) => a.lo - b.lo).map(fin) };
}

/** Calibration: predicted chance vs the share won, per bin, plus the n-weighted totals the Scales of Fortune weigh. */
function calibRows(k, settled) {
  let own = false, basis = 'price', rows;
  if (Array.isArray(k.calibration)) {
    own = true;
    basis = str(k.calib_basis, 8) === 'model' ? 'model' : 'price';
    rows = k.calibration.filter(isObj).map((c) => ({ p: unit(c.p), n: num(c.n), hit: unit(c.hit) })).filter((c) => c.p != null && c.hit != null && c.n >= 1)
      .sort((a, b) => a.p - b.p).slice(0, 12);
  } else {
    const model = settled.length > 0 && settled.every((s) => s.prob != null);
    basis = model ? 'model' : 'price';
    const m = new Map();
    settled.forEach((s) => {
      const p = model ? s.prob : s.price;
      if (p == null || p <= 0 || p > 1) return;
      const i = bucketOf(p), r = m.get(i) || { s: 0, n: 0, w: 0 };
      r.s += p; r.n++; if (s.win) r.w++;
      m.set(i, r);
    });
    rows = Array.from(m.values()).map((r) => ({ p: r.s / r.n, n: r.n, hit: r.w / r.n })).sort((a, b) => a.p - b.p);
  }
  const n = sum(rows.map((r) => r.n));
  return { own, basis, rows, n, said: n ? sum(rows.map((r) => r.p * r.n)) / n : null, won: n ? sum(rows.map((r) => r.hit * r.n)) / n : null };
}

/** The daily P&L the bot sends (`days`: [[YYYY-MM-DD, pnl]] or [{ day, pnl }]), oldest first, junk dropped. */
function daysOf(k) {
  const m = new Map();
  arr(k.days).forEach((d) => {
    const r = Array.isArray(d) ? [str(d[0], 10), num(d[1])] : isObj(d) ? [str(d.day || d.date, 10), num(d.pnl)] : null;
    if (r && /^\d{4}-\d{2}-\d{2}$/.test(r[0]) && r[1] != null) m.set(r[0], r[1]);
  });
  return Array.from(m.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/** The bankroll's path: `equity` (v2), else the running sum of `days` ending at the balance, else the balance alone. */
function equityOf(k, balance, t) {
  const pts = arr(k.equity).map((p) => (Array.isArray(p) ? [parseT(p[0]), num(p[1])] : isObj(p) ? [parseT(p.t), num(p.balance != null ? p.balance : p.equity)] : null))
    .filter((p) => p && p[0] != null && p[0] > 1e9 && p[1] != null).sort((a, b) => a[0] - b[0]);
  if (pts.length >= 2) return { src: 'equity', pts: pts.slice(-500) };
  const days = arr(k.days).map((d) => (Array.isArray(d) ? [str(d[0], 10), num(d[1])] : isObj(d) ? [str(d.day || d.date, 10), num(d.pnl)] : null))
    .filter((d) => d && /^\d{4}-\d{2}-\d{2}$/.test(d[0]) && d[1] != null).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  if (days.length >= 2 && balance != null) {
    let v = balance - sum(days.map((d) => d[1]));
    const out = [[Date.parse(days[0][0] + 'T00:00:00Z') / 1000 - 86400, v]];
    days.forEach((d) => { v += d[1]; out.push([Date.parse(d[0] + 'T00:00:00Z') / 1000, v]); });
    return { src: 'days', pts: out };
  }
  return { src: 'balance', pts: balance != null ? [[t, balance]] : [] };
}

// ------------------------------------------------------------------ the feed (fetch + the 404 backoff)
/** One poller per page load. poll() -> {state: 'ok' | 'unlinked' | 'error', raw}; delay() -> ms until the next poll is due. */
export class Feed {
  constructor(fetchFn) {
    this.fetch = fetchFn || ((u, o) => fetch(u, o));
    this.requests = 0;
    this.last = null;               // 'ok' | 'unlinked' | 'error'
    this.backoff = 0;
  }

  async get(url, headers) {
    let ac = null, tm = 0;
    try { ac = new AbortController(); tm = setTimeout(() => ac.abort(), TIMEOUT_MS); } catch (_) { ac = null; }
    this.requests++;
    try { return await this.fetch(url, { cache: 'no-cache', headers: headers || {}, signal: ac ? ac.signal : undefined }); } catch (_) { return null; } finally { clearTimeout(tm); }
  }

  async poll() {
    let r = await this.get(LOCAL + '?t=' + Math.floor(Date.now() / 60000));
    if (r && r.ok) { const c = r.clone ? r.clone() : null; let t0 = null; try { t0 = c ? await c.json() : null; } catch (_) { t0 = null; } if (!isObj(t0) || parseT(t0.t) == null) r = null; }
    if (!r || !r.ok) r = await this.get(RAW + '?t=' + Math.floor(Date.now() / 60000));
    if (!r || (!r.ok && r.status !== 404)) r = await this.get(API, { Accept: 'application/vnd.github.raw+json' });
    if (r && r.ok) {
      let j = null;
      try { j = await r.json(); } catch (_) { j = null; }
      if (isObj(j) && parseT(j.t) != null) { this.last = 'ok'; this.backoff = 0; return { state: 'ok', raw: j }; }
      this.last = 'error';
      return { state: 'error', raw: null };
    }
    if (r && r.status === 404) {
      this.last = 'unlinked';
      this.backoff = this.backoff ? Math.min(BACKOFF_MAX_MS, this.backoff * 2) : BACKOFF_MS;
      return { state: 'unlinked', raw: null };
    }
    this.last = 'error';
    return { state: 'error', raw: null };
  }

  /** ms until the next poll: a minute when linked, 2 min after an error, 10 / 20 / 40 / 60 min after a 404. */
  delay() { return this.last === 'unlinked' ? this.backoff : this.last === 'error' ? EVERY_ERR_MS : EVERY_OK_MS; }
}
