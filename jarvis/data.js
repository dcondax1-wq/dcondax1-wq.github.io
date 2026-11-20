// Jarvis data facade (ES module, no imports, no DOM): the one place that reads everything Jarvis shows or answers from.
//   getFacts() -> { now, market: {open, text, rth, session, next}, live, kalshi, kalshiState, kalshiRun, planner, apps, extras, system }
//   systemStatus(facts) / systemView()  the System view: one line per system (PC, Zlarior, ATLAS, BLITZ, Kalshi, Planner) and
//                           one verdict (ALL GOOD / HEADS UP / NEEDS YOU + the one thing to do)
//   refreshLive(), refreshKalshi() -> Promise (an in-flight call is shared) · refresh({ maxAge }) refreshes what is older
//   onChange(fn) -> off()   fn({ source: 'live' | 'kalshi' | 'planner' | 'apps' }) · the same 'change' event on `events`
//   setAppsSource(mod)      the apps list getFacts() reports (apps.js when it loaded, else fallbackApps below)
//   markManualTrade(ids) / manualTrades() / withManualTrades(live, marks, now)   the owner's own keep-alive trades (below)
// Sources (read-only; nothing here ever writes to a bot):
//   live.json   the NQ bots (the PC's heartbeat publish, branch `live` of nq-dashboard): the GitHub API first (fresh), then
//               raw.githubusercontent (GitHub's CDN keeps it ~5 min); after a 403 / 429 the API rests 15 min.
//   kalshi.json the Kalshi bot's status: ONLY this site's own copy (../kalshi.json, put next to the pages by pc_publish when the VM's kit
//               left one). The bot's old feed repo (kalshi-feed) lives on the suspended GitHub account: never asked (night-bugsweep
//               2026-11-19: it was a 404 in the console on every Jarvis load). When the PC feed carries Kalshi's cards (the paper tests,
//               the K8 live card) the PC is the source and the site copy is not asked either; 404 = 'waiting' (asked once a page load).
//   Planner     localStorage 'planner.today.v1' {day, events, tasks} when it is today's, else today computed from what the
//               Planner saved on this phone ('planner.v1' / 'planner.hosted.v1'). When the Planner's own sync is set up on this
//               phone ('planner.sync' {token, repo}: same site), refreshPlanner() also reads its planner.json from GitHub (GET only,
//               to api.github.com only, the Planner's own route), so the day is fresh without opening the Planner.
//   MFFU_RULES  the MFFU Builder rulebook (a small copy of research/lit/mffu_rules.json) for Jarvis's rules answers.
//   the market  CME NQ: Sunday 18:00 to Friday 17:00 ET, daily halt 17:00-18:00 (exchange holidays are not known here).
//   extras      the old Jarvis add-ons: BTC / ETH / SOL from CoinGecko's public price API (CORS open, no key; cached 5 min),
//               the verse and the quote of the day (bundled here, so they work offline).

export const OWNER = 'demetrades2000-coder';
export const REPO = 'nq-dashboard';
export const URLS = {
  liveApi: `https://api.github.com/repos/${OWNER}/${REPO}/contents/live.json?ref=live`,
  liveRaw: `https://raw.githubusercontent.com/${OWNER}/${REPO}/live/live.json`,
  // the Kalshi bot's feed: this site's own copy only (its old repo kalshi-feed is on the suspended account: never asked)
  kalshiLocal: '../kalshi.json',
};
const FETCH_MS = 9000;

// ------------------------------------------------------------------------------------------------ small helpers
export const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* private mode: nothing kept */ } },
  del(k) { try { localStorage.removeItem(k); } catch (_) { /* nothing kept */ } },
};
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const okUrl = (u) => { try { const x = new URL(u, location.href); return /^https?:$/.test(x.protocol) ? x.href : null; } catch (_) { return null; } };
export const sameSite = (u) => { try { return new URL(u, location.href).origin === location.origin; } catch (_) { return false; } };
export const usd = (v, sign) => (v == null || !Number.isFinite(+v)) ? '—' : (sign && +v > 0 ? '+' : (+v < 0 ? '−' : '')) + '$' + Math.abs(Math.round(+v)).toLocaleString('en-US');
export const usd2 = (v, sign) => {
  if (v == null || !Number.isFinite(+v)) return '—';
  const x = +v, a = Math.abs(x);
  return (sign && x > 0 ? '+' : x < 0 ? '−' : '') + '$' + a.toLocaleString('en-US', { minimumFractionDigits: a < 1000 ? 2 : 0, maximumFractionDigits: a < 1000 ? 2 : 0 });
};
export const ago = (t) => { if (!t) return ''; const s = Math.max(0, Date.now() / 1000 - +t); return s < 90 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago'; };
export const hm = (s) => { if (!s) return ''; const [h, m] = String(s).split(':').map(Number); if (!Number.isFinite(h)) return ''; return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')}${h < 12 ? ' AM' : ' PM'}`; };

async function get(url, opts) {                  // fetch with a time limit (a phone on a bad signal can hang for minutes)
  const ac = typeof AbortController === 'function' ? new AbortController() : null;
  const t = ac ? setTimeout(() => ac.abort(), FETCH_MS) : 0;
  try { return await fetch(url, ac ? { ...opts, signal: ac.signal } : opts); } finally { clearTimeout(t); }
}

// ------------------------------------------------------------------------------------------------ change events
export const events = new EventTarget();
function emit(source) { try { events.dispatchEvent(new CustomEvent('change', { detail: { source } })); } catch (_) { /* old browser */ } }
export function onChange(fn) {
  const h = (e) => { try { fn(e.detail || {}); } catch (_) { /* a listener's error stays its own */ } };
  events.addEventListener('change', h);
  return () => events.removeEventListener('change', h);
}

// ------------------------------------------------------------------------------------------------ time and the market
// one formatter each, made once (night-fitperf 2026-11-19: a new Intl.DateTimeFormat per call was ~1 s of Jarvis's start on a phone:
// marketNext() asks the ET clock hundreds of times); the same options, so the same text
const FMT = {};
const fmt = (k, loc, o) => FMT[k] || (FMT[k] = new Intl.DateTimeFormat(loc, Object.assign({ timeZone: 'America/New_York' }, o)));
export function etParts(d = new Date()) {
  const p = fmt('et', 'en-US', { weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false, month: 'short', day: 'numeric' }).formatToParts(d);
  const g = (k) => (p.find((x) => x.type === k) || {}).value;
  return { wd: g('weekday'), h: +g('hour') % 24, m: +g('minute'), mon: g('month'), day: g('day') };
}
export function market(d = new Date()) {
  const { wd, h, m } = etParts(d), t = h * 60 + m;
  const open = wd === 'Sat' ? false : wd === 'Sun' ? t >= 1080 : wd === 'Fri' ? t < 1020 : !(t >= 1020 && t < 1080);
  if (open) {
    const rth = !['Sat', 'Sun'].includes(wd) && t >= 570 && t < 960;
    return { open: true, rth, session: rth ? 'regular' : 'overnight', text: rth ? 'NQ market open · regular session' : 'NQ market open · overnight session' };
  }
  const when = wd === 'Fri' || wd === 'Sat' || (wd === 'Sun' && t < 1080) ? 'Sunday 6:00 PM ET' : 'today 6:00 PM ET';
  return { open: false, rth: false, session: 'closed', text: `NQ market closed · opens ${when}` };
}
// minutes until the market opens or closes next (steps of 15 min, then minutes; DST-safe through the ET clock)
export function marketNext(d = new Date()) {
  const open = market(d).open;
  let t = d.getTime(), n = 0;
  while (n < 800 && market(new Date(t + 15 * 60e3)).open === open) { t += 15 * 60e3; n++; }
  if (n >= 800) return null;
  while (market(new Date(t + 60e3)).open === open) t += 60e3;
  const at = new Date(t + 60e3), mins = Math.round((at - d) / 60e3);
  return { open: !open, at, mins, text: `${open ? 'Closes' : 'Opens'} in ${mins >= 60 ? Math.floor(mins / 60) + ' h ' + String(mins % 60).padStart(2, '0') + ' min' : mins + ' min'}` };
}
export function greeting(d = new Date()) {
  const { h } = etParts(d);
  return h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
export const clock = (d = new Date()) => fmt('clock', 'en-US', { hour: 'numeric', minute: '2-digit' }).format(d);
export const ymd = (d = new Date()) => fmt('ymd', 'en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
export function whenLine(d = new Date()) {
  const { wd, mon, day } = etParts(d);
  return `${wd} ${mon} ${day} · ${clock(d)} ET · ${market(d).text}`;
}

// ------------------------------------------------------------------------------------------------ live.json: the NQ bots
const L = { j: null, at: 0, okAt: 0, err: null, busy: null, apiUntil: 0 };
// Hidden bots (owner 2026-11-15: "Zlarior and ATLAS only for now"): the switch is dashboard_view.json "hidden_bots" in the repo
// (engine/hidden_bots.py, default ["blitz"]); the builders take those bots out of every published file and stamp "hidden_bots", and every
// page asks window.OLY_HIDDEN.has(bot) before it draws a bot. The last list a file carried is kept (localStorage oly.hiddenBots) so the
// next open starts with it; nothing known = ["blitz"]. Idempotent (the same block sits in jarvis/data.js, jarvis/brain.js, web_next routes.js).
(function () {
  if (typeof window === 'undefined' || window.OLY_HIDDEN) return;
  var AL = { scalp: 'blitz', account_c: 'blitz', acct_c: 'blitz', acctc: 'blitz', pc_blitz: 'blitz', 'strategy 3': 'blitz', s3: 'blitz' };
  var L = ['blitz'];
  try { var s = localStorage.getItem('oly.hiddenBots'); if (s) { var a = JSON.parse(s); if (Array.isArray(a)) L = a.map(function (x) { return String(x).toLowerCase(); }); } } catch (e) {}
  function key(b) { b = String(b == null ? '' : b).trim().toLowerCase(); return AL[b] || (/^blitz/.test(b) ? 'blitz' : b); }
  function mark() { try { var r = document.documentElement; if (H.has('blitz')) r.setAttribute('data-hide-blitz', ''); else r.removeAttribute('data-hide-blitz'); } catch (e) {} }
  var H = { list: L,
    has: function (b) { return H.list.indexOf(key(b)) >= 0; },
    keep: function (arr) { return (arr || []).filter(function (b) { return !H.has(b); }); },
    seen: function (j) {
      var v = j && (Array.isArray(j.hidden_bots) ? j.hidden_bots : j.board && Array.isArray(j.board.hidden_bots) ? j.board.hidden_bots : null);
      if (!v) return;
      H.list = v.map(function (x) { return String(x).toLowerCase(); });
      try { localStorage.setItem('oly.hiddenBots', JSON.stringify(H.list)); } catch (e) {}
      mark();
    } };
  window.OLY_HIDDEN = H; mark();
})();
// hidden bots (owner 2026-11-15, dashboard_view.json -> window.OLY_HIDDEN, jarvis/index.html): a hidden BLITZ is never read
const HIDB = () => !!(globalThis.OLY_HIDDEN && globalThis.OLY_HIDDEN.has('blitz'));
function slim(j) {                          // what Jarvis needs, also kept for an offline start
  if (j && globalThis.OLY_HIDDEN) globalThis.OLY_HIDDEN.seen(j);
  const b = (j && j.board) || {};
  // BLITZ: the board's card while account C is on, else live.json's own "blitz" (an "off" card while account C is off)
  const bz = HIDB() ? null : b.blitz && !b.blitz.error ? b.blitz : j && j.blitz && !j.blitz.error ? j.blitz : null;
  const num = (x) => (x == null || x === '' || !Number.isFinite(+x) ? null : +x);
  const trades = (Array.isArray(b.trades) ? b.trades : []).filter((x) => !(x && x.acct === 'blitz' && HIDB())).slice(-8).map((x) => x && ({ acct: x.acct, side: x.side, qty: x.qty, exit: x.exit, usd: num(x.usd), r: num(x.r),
    entry_t: x.entry_t, exit_t: x.exit_t, open: !!x.open, day: x.day })).filter(Boolean);
  const health = (b.health && Array.isArray(b.health.items) ? b.health.items : []).slice(0, 8).map((x) => x && ({ key: x.key, label: x.label, value: x.value, ok: x.ok, warn: !!x.warn, detail: x.detail })).filter(Boolean);
  const lines = (Array.isArray(b.lines) ? b.lines : []).slice(0, 4).map((x) => x && ({ level: x.level, text: x.text })).filter((x) => x && x.text);
  // the PC's own health (live.json "pc_health", engine/live_publish.pc_health_summary): CPU / RAM / disk / NinjaTrader lines
  const ph0 = j && j.pc_health && typeof j.pc_health === 'object' && Array.isArray(j.pc_health.lines) ? j.pc_health : null;
  const pc_health = ph0 ? { t: num(ph0.t), level: ph0.level, cpu: num(ph0.cpu), ram: num(ph0.ram),
    lines: ph0.lines.slice(0, 8).map((x) => x && ({ key: x.key, label: x.label, level: x.level, text: x.text })).filter((x) => x && x.key) } : null;
  // Mind (engine/mind.compact) and Live learning (the heartbeat's "learn"), cut to what Jarvis says: kept for an offline start
  const pcj = j && isObj(j.pc) ? j.pc : {}, mi = isObj(pcj.mind) ? pcj.mind : null, le = isObj(pcj.learn) ? pcj.learn : null;
  const mind = mi ? { t: num(mi.t), regime: isObj(mi.regime) ? { label: txt(mi.regime.label).slice(0, 80), why: txt(mi.regime.why).slice(0, 240) } : null,
    plans: isObj(mi.plans) ? Object.fromEntries(Object.entries(mi.plans).slice(0, 4).map(([k, p]) => [k, { headline: txt(isObj(p) ? p.headline : '').slice(0, 200) }])) : {},
    reviews: list(mi.reviews).filter(isObj).slice(0, 3).map((r) => ({ bot: txt(r.bot), grade: txt(r.grade), lesson: txt(r.lesson).slice(0, 200), t: num(r.t) })),
    proposals: list(mi.proposals).filter(isObj).slice(0, 3).map((x) => ({ bot: txt(x.bot), idea: txt(x.idea).slice(0, 140), status: txt(x.status) })) } : null;
  const learn = le ? { reviews: list(le.reviews).filter(isObj).slice(0, 4).map((r) => ({ bot: txt(r.bot), day: txt(r.day), status: txt(r.status), cause: txt(r.cause).slice(0, 120), gap_usd: num(r.gap_usd) })) } : null;
  return { lit: b.lit || null, atlas: b.atlas || null, blitz: bz, verdict: (j && j.pc_verdict) || null, running: b.running, t: j && j.t,
    trades, health, lines, level: b.level || null, price: num(j && j.price), last_signal: (j && j.last_signal) || null, pc_health,
    progress: isObj(b.progress) ? b.progress : null, money: j && isObj(j.money) && !j.money.error ? j.money : null, mind, learn,
    extra: extraAccounts(j), kpaper: kalshiPaper(j), klive: kalshiLive(j) };
}
// Kalshi's K8 live card from the PC feed (engine/kalshi_live.read_card, key kalshi_live, <= 200 bytes): {st: live | paused | stopped | idle,
// net, f, o, cap, stop, u, why}; st off (or none) = null. Real money only moves after the owner types the phrase on the PC.
export function kalshiLive(j) {
  const c = isObj(j && j.kalshi_live) ? j.kalshi_live : null;
  if (!c || c.kind !== 'kalshi_live_pub' || !['live', 'paused', 'stopped', 'idle'].includes(c.st)) return null;
  const n = (x) => (x == null || x === '' || !Number.isFinite(+x) ? null : +x), t = Date.parse(txt(c.u));
  return { st: c.st, net: n(c.net), fills: n(c.f), orders: n(c.o), cap: n(c.cap), stop: n(c.stop), why: txt(c.why).slice(0, 40), t: Number.isFinite(t) ? Math.round(t / 1000) : null };
}
// The PC's OTHER real accounts (night-feedsA 2026-11-18, owner: "3 accounts, not 2"): the board has one card per BOT (lit = Zlarior's
// 50K, atlas = ATLAS's funded 25K), but the PC runs a third account (Zlarior 25K #2, id b25k_2) that only its "accounts" list carries.
// Every Jarvis count / list of accounts = the cards + these. Same rule as the ZEUS card (business/mffumodel.js liveAccounts): a cloud /
// PAPER / BLITZ row is never an account, and the row with the lit (or atlas) card's own balance + floor IS that card, not a 2nd account.
//   extraAccounts(liveJson) -> [{ id, key, name, plan, size, stage, status, badge, balance, floor, room, mll, room_frac, to_target,
//                                 target_balance, today_pnl, dll, dll_used, session, t }]  (card-shaped: what the lit / atlas cards carry)
export function extraAccounts(j) {
  const b = isObj(j && j.board) ? j.board : {}, out = [];
  const n = (x) => (x == null || x === '' || !Number.isFinite(+x) ? null : +x);
  const same = (c, e) => isObj(c) && n(c.balance) != null && n(c.balance) === n(e.balance) && n(c.floor) === n(e.floor);
  for (const a of list(j && j.accounts)) {
    if (!isObj(a) || !a.id || a.error || !['eval', 'funded'].includes(String(a.kind))) continue;
    const id = String(a.id), who = `${id} ${txt(a.name)} ${txt(a.source)}`;
    if (/^(lit|atlas|acct_?b|acct_?c|cloud_paper)$/i.test(id) || /cloud|blitz|scalp/i.test(who) || /^paper$/i.test(txt(a.badge))) continue;
    const e = isObj(a.eval) ? a.eval : isObj(a.funded) ? a.funded : null;
    if (!e || n(e.balance) == null || same(b.lit, e) || same(b.atlas, e) || out.some((x) => x.id === id)) continue;
    const plan = txt(a.plan) || txt(a.name), size = (/(\d+)\s*k\b/i.exec(plan) || /(\d+)\s*k\b/i.exec(txt(a.name)) || [])[1];
    const stage = a.kind === 'funded' ? 'funded' : /fail/i.test(txt(e.status)) ? 'failed' : 'eval';
    const room = n(e.room), mll = n(e.mll), pnl = isObj(a.pnl) && n(a.pnl.today) != null ? n(a.pnl.today) : n(e.today);
    out.push({ id, key: id, name: txt(a.name).replace(/\bBuilder\s+/i, '').replace(/^MFFU\s+/i, '').slice(0, 40) || id, plan: plan.slice(0, 40), size: size ? size + 'K' : '',
      stage, status: stage, badge: txt(a.badge).slice(0, 8), balance: n(e.balance), floor: n(e.floor), room, mll,
      room_frac: room != null && mll ? Math.max(0, Math.min(1, room / mll)) : null, to_target: stage === 'eval' ? n(e.to_target) : null,
      target_balance: n(e.target_balance), today_pnl: pnl, dll: n(e.dll), dll_used: n(e.dll_used), session: n(e.session),
      t: n(isObj(a.conn) ? a.conn.t : null) || n(b.data_t) || n(b.t) || n(j && j.t) });
  }
  return out;
}
// Kalshi's PAPER tests on the PC (night-feedsA): the PC's status post carries kalshi_k1 (the K1 rules test) and kalshi_rewards (the
// liquidity-rewards test), both paper_only, while real-money Kalshi is paused ("Kalshi paused for now") and kalshi.json is not published.
//   kalshiPaper(liveJson) -> null | { k1: {sig, set, net, days, t} | null, rewards: {net, reward, fills, markets, days, t} | null, net, t }
export function kalshiPaper(j) {
  const n = (x) => (x == null || x === '' || !Number.isFinite(+x) ? null : +x);
  const tOf = (x) => { const v = Date.parse(txt(x && x.updated)); return Number.isFinite(v) ? Math.round(v / 1000) : null; };
  const k = isObj(j && j.kalshi_k1) && j.kalshi_k1.paper_only === true && n(j.kalshi_k1.sig) != null ? j.kalshi_k1 : null;
  const r = isObj(j && j.kalshi_rewards) && j.kalshi_rewards.paper_only === true && n(j.kalshi_rewards.net) != null ? j.kalshi_rewards : null;
  if (!k && !r) return null;
  const k1 = k ? { sig: n(k.sig), set: n(k.set), net: n(k.net), days: n(k.days), t: tOf(k) } : null;
  const rewards = r ? { net: n(r.net), reward: n(r.reward), fills: n(r.fills), markets: n(r.markets), days: n(r.days), t: tOf(r) } : null;
  const nets = [k1 && k1.net, rewards && rewards.net].filter((x) => x != null), ts = [k1 && k1.t, rewards && rewards.t].filter((x) => x != null);
  return { k1, rewards, net: nets.length ? Math.round(nets.reduce((s, x) => s + x, 0) * 100) / 100 : null, t: ts.length ? Math.max(...ts) : null };
}
// SYNC (night A 2026-11-16): the PC feed (../pc_feed.js, the ntfy report tools/pc_report.py posts every 15 min, what the Gate, the hubs and
// Zenith lay over home.json) wins when it is newer, so Jarvis says the same drawdown / today's $ / data age as every other page, also when
// the PC runs without GitHub (then live.json on GitHub stays old). Runs after each GitHub read; one at a time; 4 s at most.
let feedBusy = null;
function pcFeedOver() {
  const F = globalThis.PC_FEED;
  if (feedBusy || !F || typeof F.fetchLatest !== 'function' || typeof F.toLive !== 'function') return feedBusy;
  feedBusy = (async () => {
    try {
      const lite = await Promise.race([F.fetchLatest({ feedUrl: '../status_feed.json', fetch: get }), new Promise((r) => setTimeout(() => r(null), 4000))]);
      const base = L.j;
      if (lite && (+lite.t || 0) > (+((base && base.pc) || {}).t || +(base || {}).t || 0)) {
        L.j = { ...(base || {}), ...F.toLive(lite, base && base.board), src: 'pc_feed' }; L.okAt = Date.now(); L.err = null;
        LS.set('jarvis.lastLive', { t: L.j.t, board: slim(L.j) });
        emit('live');
      } else if (lite && base && base.src === 'pc_feed') { L.okAt = Date.now(); L.err = null; }   // the same post again: still live
      feedBusy = null;
      return lite || null;
    } catch (_) { /* the GitHub copy stays */ }
    feedBusy = null;
    return null;
  })();
  return feedBusy;
}
// pc_feed.js loads async next to this module: wait for it a moment (2 s at most) so the first read can be the PC's own feed
function feedLib(ms = 2000) {
  if (globalThis.PC_FEED || typeof document === 'undefined' || typeof document.getElementById !== 'function') return Promise.resolve(globalThis.PC_FEED || null);
  const s = document.getElementById('pcFeedJs');
  if (!s || typeof s.addEventListener !== 'function') return Promise.resolve(null);
  return new Promise((ok) => {
    const done = () => { clearTimeout(t); ok(globalThis.PC_FEED || null); }, t = setTimeout(done, ms);
    s.addEventListener('load', done, { once: true }); s.addEventListener('error', done, { once: true });
  });
}
export const pcFeedReady = () => feedBusy || Promise.resolve();
export function refreshLive() {
  if (L.busy) return L.busy;
  L.busy = (async () => {
    // the PC's own feed FIRST (night-feedsA 2026-11-18): the GitHub live.json below lives on the old, suspended account (every read
    // was a 404 in the console); it is asked only when the PC feed has nothing (no status_feed.json, ntfy down, a test site)
    let F0 = null;
    try { F0 = await feedLib(); } catch (_) { F0 = null; }
    if (F0) {
      let lite = null;
      try { lite = await pcFeedOver(); } catch (_) { lite = null; }
      if (lite) { L.at = Date.now(); L.busy = null; emit('live'); return; }
    }
    try {
      let j = null;
      if (Date.now() > L.apiUntil) {
        try {
          const r = await get(URLS.liveApi, { cache: 'no-cache', headers: { Accept: 'application/vnd.github.raw+json' } });
          if (r.ok) j = await r.json(); else if (r.status === 403 || r.status === 429) L.apiUntil = Date.now() + 15 * 60e3;
        } catch (_) { /* fall back to raw */ }
      }
      let gerr = null;
      if (!j) { try { const r = await get(URLS.liveRaw + '?t=' + Math.floor(Date.now() / 60000), { cache: 'no-cache' }); if (r.ok) j = await r.json(); else gerr = new Error('live feed ' + r.status); } catch (e2) { gerr = e2; } }
      if (j && typeof j === 'object' && (!L.j || (+j.t || 0) >= (+L.j.t || 0))) { L.j = j; L.okAt = Date.now(); L.err = null; LS.set('jarvis.lastLive', { t: j.t, board: slim(j) }); }
      else if (!j && gerr && !globalThis.PC_FEED) throw gerr;
      else if (!j && gerr) L.err = String(gerr.message || gerr);
    } catch (e) { L.err = String((e && e.message) || e); }
    L.at = Date.now(); L.busy = null;
    emit('live');
    if (!F0) pcFeedOver();                          // pc_feed.js came late: the PC feed now, never holding the GitHub answer up
  })();
  return L.busy;
}
export function liveView() {                // today's numbers, or the last ones this phone saw (marked cached)
  if (L.j) return { ...slim(L.j), raw: L.j, err: L.err };
  const c = LS.get('jarvis.lastLive', null);
  return c && c.board ? { ...c.board, cached: true, raw: null, err: L.err } : null;
}
export const liveError = () => L.err;

// ------------------------------------------------------------------------------------------------ manual keep-alive trades
// (owner 2026-11-02: "I placed my 1-MNQ keep-alive trades from the Tradovate app"). The bot's ledger only sees its own orders,
// so live.json's quiet_days kept counting and Jarvis kept saying "place 1 MNQ". The owner says so ("I traded on both", brain.js)
// or taps "I did it" on the warning: today's ET date per account, kept on this phone ('jarvis.manualTrades' {lit, atlas}).
// The quiet days everywhere are then the days since the later of the card's own last trade and the mark; a mark counts only
// while it is newer than the card's last trade (a bot trade after it takes over again). getFacts().live has it applied (its
// cards and its .raw board, which brain.js reads); systemStatus applies f.manualTrades itself, so it stays pure.
export const MANUAL_KEY = 'jarvis.manualTrades';
const MANUAL_IDS = ['lit', 'atlas', 'blitz'];
const dayOf = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 : null; };
export function manualTrades() { const m = LS.get(MANUAL_KEY, null); return isObj(m) ? m : {}; }
/** The owner traded by hand today on these accounts ('lit', 'atlas', 'blitz'): -> the marks kept. */
export function markManualTrade(ids, now = new Date()) {
  const m = manualTrades(), day = ymd(now);
  for (const id of list(ids)) if (MANUAL_IDS.includes(id)) m[id] = day;
  LS.set(MANUAL_KEY, m);
  emit('live');
  return m;
}
/** live (liveView()) with the marks applied to each card's quiet_days (and manual_mark); the same live when nothing applies. */
export function withManualTrades(live, marks, now = Date.now()) {
  if (!isObj(live) || !isObj(marks) || !MANUAL_IDS.some((id) => dayOf(marks[id]) != null)) return live;
  const ms = now instanceof Date ? now.getTime() : +now, today = dayOf(ymd(new Date(ms)));
  const raw = isObj(live.raw) ? live.raw : null, t = Number.isFinite(+live.t) && +live.t > 0 ? +live.t : raw && Number.isFinite(+raw.t) ? +raw.t : 0;
  const pub = t ? dayOf(ymd(new Date(t * 1000))) : today;          // the day the card's quiet_days was counted on
  const fix = (c, id) => {
    const q = isObj(c) && c.quiet_days != null && c.quiet_days !== '' && Number.isFinite(+c.quiet_days) ? Math.round(+c.quiet_days) : null, mk = dayOf(marks[id]);
    if (q == null || mk == null || mk > today || mk <= pub - q) return c;          // no count, no mark, or a trade since the mark
    return { ...c, quiet_days: Math.max(0, today - mk), manual_mark: marks[id] };
  };
  const out = { ...live };
  for (const id of MANUAL_IDS) if (isObj(live[id])) out[id] = fix(live[id], id);
  if (raw) {
    const board = isObj(raw.board) ? { ...raw.board } : null;
    if (board) for (const id of MANUAL_IDS) if (isObj(board[id])) board[id] = fix(board[id], id);
    out.raw = { ...raw, board: board || raw.board, blitz: isObj(raw.blitz) ? fix(raw.blitz, 'blitz') : raw.blitz };
  }
  return out;
}
export const liveLoading = () => !!L.busy;

// ------------------------------------------------------------------------------------------------ kalshi.json: the Kalshi bot (its own server)
const K = { j: null, at: 0, state: '', busy: null, n404: 0 };      // state: '' not asked yet | ok | waiting (not published yet) | error
// kalshi.json not published yet (404, "not linked yet"): asked once per page load, then left alone (no 404 every few minutes
// in the console). Opening Jarvis again (or kalshiRetry()) asks once more: that is how a newly linked bot shows up.
export const kalshiBackedOff = () => K.state === 'waiting' && K.n404 > 0;
export function kalshiRetry() { K.n404 = 0; return kalshiFetch(true); }
export function refreshKalshi() { return kalshiBackedOff() ? (K.at = Date.now(), Promise.resolve()) : kalshiFetch(); }
// the PC feed carries Kalshi (its paper tests or the K8 live card): then the PC is Kalshi's source and nothing else is asked
const pcHasKalshi = () => { const v = liveView(); return !!(v && !v.cached && (isObj(v.kpaper) || isObj(v.klive))); };
// wait for the live read (the PC feed) before asking the site copy only when it may carry Kalshi: a fresh view is there (a refresh), or
// the last view this phone saw had Kalshi from the PC. With no view yet (a first open) or a saved one without Kalshi, the site copy is
// asked at once, next to the live read (night-jarvisfix 2026-11-20: waiting left the Kalshi card on "Loading Kalshi…" 2-5 s behind the bots)
const pcMayCarryKalshi = () => { const v = liveView(); return !!(v && (!v.cached || isObj(v.kpaper) || isObj(v.klive))); };
function kalshiFetch(force) {
  if (K.busy) return K.busy;
  K.busy = (async () => {
    try {
      if (pcMayCarryKalshi()) { try { await (L.busy || Promise.resolve()); await pcFeedReady(); } catch (_) { /* the PC feed is optional */ } }
      if (!force && pcHasKalshi()) { K.state = 'waiting'; K.n404++; K.at = Date.now(); K.busy = null; emit('kalshi'); return; }
      let lr = null, lj = null;             // this site's own copy (pc_publish puts the feed next to the pages); HTML or junk = not published
      try { lr = await get(URLS.kalshiLocal + '?t=' + Math.floor(Date.now() / 60000), { cache: 'no-cache' }); } catch (_) { lr = null; }
      if (lr && lr.ok) { try { const x = await lr.json(); if (x && typeof x === 'object' && !Array.isArray(x)) lj = x; } catch (_) { lj = null; } }
      if (lj) { K.j = lj; K.state = 'ok'; K.n404 = 0; LS.set('jarvis.lastKalshi', lj); }
      else if (lr && (lr.ok || lr.status === 404)) { K.state = 'waiting'; K.n404++; }
      else K.state = 'error';                // no answer / a server error: NO SIGNAL
    } catch (_) { K.state = 'error'; }
    K.at = Date.now(); K.busy = null;
    emit('kalshi');
  })();
  return K.busy;
}
export const kalshiView = () => K.j || (K.state === 'waiting' ? null : LS.get('jarvis.lastKalshi', null));
export const kalshiState = () => K.state;
// the PC's Kalshi PAPER tests (kalshiPaper above), from the newest live view (its saved copy on a cold start); null = none posted
export const kalshiPaperView = () => { const v = liveView(); return v && isObj(v.kpaper) ? v.kpaper : null; };
export const kalshiLoading = () => !!K.busy;
// [level, label] of the Kalshi bot: stopped, running (updated in the last 15 min) or not updating
export const kalshiRun = (k) => (!k ? null : k.running === false ? ['bad', 'Stopped'] : k.t && Date.now() / 1000 - k.t < 15 * 60 ? ['ok', 'Running'] : ['warn', 'Not updating']);

// ------------------------------------------------------------------------------------------------ the Planner's day
function plannerState() {
  if (PS.doc) return PS.doc;                     // the Planner's synced planner.json, fresher than this phone's copy
  for (const k of ['planner.v1', 'planner.hosted.v1']) { const s = LS.get(k, null); if (s && (Array.isArray(s.events) || Array.isArray(s.tasks))) return s; }
  return null;
}
// The Planner's own sync (its settings 'planner.sync' = {token, repo}, saved by the Planner on this same site): read-only GET
// of planner.json from api.github.com, every 5 min at most. The token goes to api.github.com only and is never kept here.
const PS = { doc: null, at: 0, okAt: 0, busy: null, state: '' };       // state: '' | 'nosync' | 'ok' | 'error'
export const plannerSyncState = () => PS.state;
export function plannerLinked() { const s = LS.get('planner.sync', null); return !!(isObj(s) && typeof s.token === 'string' && s.token && /^[\w.-]+\/[\w.-]+$/.test(String(s.repo || ''))); }
export function refreshPlanner({ maxAge = 5 * 60e3 } = {}) {
  if (PS.busy) return PS.busy;
  if (!plannerLinked()) { PS.state = 'nosync'; PS.doc = null; return Promise.resolve(null); }
  if (PS.doc && Date.now() - PS.at < maxAge) return Promise.resolve(PS.doc);
  PS.busy = (async () => {
    try {
      const sy = LS.get('planner.sync', {}), url = `https://api.github.com/repos/${sy.repo}/contents/planner.json`;
      const r = await get(url, { cache: 'no-cache', headers: { Authorization: 'Bearer ' + sy.token, Accept: 'application/vnd.github.raw+json', 'X-GitHub-Api-Version': '2022-11-28' } });
      if (!r.ok) throw new Error('planner sync ' + r.status);
      const j = await r.json();
      if (!isObj(j)) throw new Error('planner sync: not a document');
      const dead = isObj(j.deleted) ? j.deleted : {};
      const alive = (x) => isObj(x) && !(x.id && Number(dead[x.id]) >= Number(x.u || 0));
      PS.doc = { events: list(j.events).filter(alive), tasks: list(j.tasks).filter(alive), projects: list(j.projects).filter(alive) };
      PS.okAt = Date.now(); PS.state = 'ok';
    } catch (_) { PS.state = 'error'; }
    PS.at = Date.now(); PS.busy = null;
    emit('planner');
    return PS.doc;
  })();
  return PS.busy;
}
export function occursOn(e, day) {
  if (!e || !e.date) return false;
  if (Array.isArray(e.ex) && e.ex.includes(day)) return false;
  if (e.date === day) return true;
  if (!e.repeat || e.repeat === 'none' || day < e.date || (e.until && day > e.until)) return false;
  const a = new Date(e.date + 'T12:00:00Z'), b = new Date(day + 'T12:00:00Z'), dd = Math.round((b - a) / 864e5), wd = b.getUTCDay();
  switch (e.repeat) {
    case 'daily': return true;
    case 'weekdays': return wd >= 1 && wd <= 5;
    case 'weekly': return dd % 7 === 0;
    case 'biweekly': return dd % 14 === 0;
    case 'monthly': return a.getUTCDate() === b.getUTCDate();
    case 'yearly': return a.getUTCDate() === b.getUTCDate() && a.getUTCMonth() === b.getUTCMonth();
    default: return false;
  }
}
const hhmm = (s) => { const m = /(\d{1,2}):(\d{2})/.exec(String(s || '')); return m ? `${m[1].padStart(2, '0')}:${m[2]}` : ''; };
const byStart = (x, y) => (x.allDay ? -1 : 0) - (y.allDay ? -1 : 0) || String(x.start || '').localeCompare(String(y.start || ''));
// total: whatever the Planner's keys hold (junk, another shape), the answer is a day or null, never an error
export function plannerDay(d = new Date()) { try { return plannerDayOf(d); } catch (_) { return null; } }
const list = (x) => (Array.isArray(x) ? x : []);
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const txt = (x) => (typeof x === 'string' ? x : typeof x === 'number' ? String(x) : '');
function plannerDayOf(d) {
  const day = ymd(d);
  // 1. the Planner's own summary of today (written by the Planner on this phone), when it is today's
  const t = LS.get('planner.today.v1', null);
  if (isObj(t) && t.day === day && (Array.isArray(t.events) || Array.isArray(t.tasks)) && !(PS.doc && Number(t.updated || 0) < PS.okAt)) {
    const ev = list(t.events).filter((e) => isObj(e) && txt(e.title || e.name))
      .map((e) => ({ ...e, title: txt(e.title || e.name), start: hhmm(txt(e.start || e.time)), allDay: !!e.allDay || !txt(e.start || e.time) })).sort(byStart);
    const tasks = list(t.tasks).filter((x) => isObj(x) && !x.done && txt(x.title || x.name)).map((x) => ({ ...x, title: txt(x.title || x.name) }));
    return { day, ev, tasks, projects: list(t.projects).filter((p) => isObj(p) && txt(p.name)), source: 'planner.today.v1' };
  }
  // 2. computed from what the Planner saved here
  const S = plannerState();
  if (!isObj(S)) return null;
  const ev = list(S.events).filter((e) => isObj(e) && typeof e.date === 'string' && occursOn(e, day)).map((e) => ({ ...e, title: txt(e.title), start: txt(e.start) })).sort(byStart);
  const tasks = list(S.tasks).filter((x) => isObj(x) && !x.done && typeof x.date === 'string' && x.date <= day).map((x) => ({ ...x, title: txt(x.title) }));
  const projects = list(S.projects).filter((p) => isObj(p) && txt(p.name));
  return { day, ev, tasks, projects, source: S === PS.doc ? 'planner-sync' : 'planner' };
}

// ------------------------------------------------------------------------------------------------ the apps (fallback for apps.js)
export const KALSHI_URL = '../kalshi/';   // the Kalshi page (tools/web_public/kalshi/): the bot's kalshi.json
export const BUILT_IN = [
  { id: 'zenith', name: 'Zenith', sub: 'NQ bots · Zlarior · ATLAS', url: '../', icon: '../icons/icon-192.png?v=p111031', builtIn: true },
  { id: 'planner', name: 'Planner', sub: 'Calendar, tasks and projects', url: '../planner/', icon: '../planner/icon-192.png', builtIn: true },
  { id: 'kalshi', name: 'Kalshi', sub: 'Kalshi bot · its own server', url: KALSHI_URL, glyph: 'K', builtIn: true },
];
// The same calls as apps.js: listApps(), addApp({name, url}), removeApp(id), appStatus(app). Kept on this phone:
// 'jarvis.extra' (added dashboards) and 'jarvis.links' (a pasted link for a built-in one without its own).
export const fallbackApps = {
  fallback: true,
  listApps() {
    const links = LS.get('jarvis.links', {}) || {};
    const extra = LS.get('jarvis.extra', []);
    const out = BUILT_IN.map((a) => ({ ...a, url: a.url || links[a.id] || '' }));
    for (const x of Array.isArray(extra) ? extra : []) if (x && x.id && x.name && okUrl(x.url)) out.push({ id: x.id, name: x.name, url: x.url, glyph: x.name[0], extra: true });
    return out;
  },
  addApp({ name, url }) {
    name = String(name || '').trim().slice(0, 24); url = okUrl(String(url || '').trim());
    if (!name) throw new Error('Give it a name.');
    if (!url) throw new Error('Paste a full link that starts with https://');
    const pre = BUILT_IN.find((b) => b.name.toLowerCase() === name.toLowerCase() && !b.url);
    if (pre) { const l = LS.get('jarvis.links', {}) || {}; l[pre.id] = url; LS.set('jarvis.links', l); emit('apps'); return { ...pre, url }; }
    const id = 'x-' + (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'app');
    LS.set('jarvis.extra', [...(LS.get('jarvis.extra', []) || []).filter((x) => x && x.id !== id), { id, name, url }]);
    emit('apps');
    return { id, name, url, glyph: name[0], extra: true };
  },
  removeApp(id) {
    const l = LS.get('jarvis.links', {}) || {};
    if (l[id]) { delete l[id]; LS.set('jarvis.links', l); }
    LS.set('jarvis.extra', (LS.get('jarvis.extra', []) || []).filter((x) => x && x.id !== id));
    emit('apps');
  },
  setLink(id, url) {
    const u = okUrl(url); if (!u) return false;
    const l = LS.get('jarvis.links', {}) || {}; l[id] = u; LS.set('jarvis.links', l); emit('apps'); return true;
  },
  async appStatus() { return null; },     // the built-in cards come from getFacts(); an added link has no status feed
};
let appsSrc = fallbackApps, appsCache = null;
// the list, kept for the rest of the current task (night-fitperf 2026-11-19): one home render asked apps.js for the whole list once per
// tile (~75 apps x ~75 links parsed each = Jarvis's longest start task). Dropped when the task ends, on every 'apps' change and by
// appsChanged() (the shell calls it after an add / remove through apps.js), so a new or removed app is never missed.
let appsMemo = null, appsMemoT = 0;
export function appsChanged() { appsMemo = null; }
events.addEventListener('change', (e) => { if (e && e.detail && e.detail.source === 'apps') appsMemo = null; });
export function setAppsSource(mod) { appsSrc = mod && typeof mod.listApps === 'function' ? mod : fallbackApps; appsCache = null; appsMemo = null; emit('apps'); }
export const appsSource = () => appsSrc;
export function listApps() {
  if (appsMemo && appsMemo.src === appsSrc) return appsMemo.list.slice();
  const out = listAppsNow();
  appsMemo = { src: appsSrc, list: out };
  if (!appsMemoT) appsMemoT = setTimeout(() => { appsMemoT = 0; appsMemo = null; }, 0);
  return out.slice();
}
function listAppsNow() {
  let r = null;
  try { r = appsSrc.listApps(); } catch (_) { r = null; }
  if (r && typeof r.then === 'function') {        // an async list: answer with the last one, update when it lands
    r.then((x) => { if (Array.isArray(x)) { appsCache = x; emit('apps'); } }).catch(() => null);
    r = appsCache;
  }
  if (!Array.isArray(r)) r = appsSrc === fallbackApps ? [] : fallbackApps.listApps();
  else appsCache = r;
  return r.filter((a) => a && a.id && a.id !== 'home' && a.id !== 'jarvis');
}

// ------------------------------------------------------------------------------------------------ extras: crypto, verse, quote
const CG = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true';
const C = { j: LS.get('jarvis.crypto', null), at: 0, busy: null, err: null };
export function refreshCrypto({ maxAge = 5 * 60e3 } = {}) {
  if (C.busy) return C.busy;
  if (C.j && Date.now() - C.at < maxAge) return Promise.resolve(C.j);
  C.busy = (async () => {
    try {
      const r = await get(CG, { cache: 'no-cache' });
      if (!r.ok) throw new Error('prices ' + r.status);
      const j = await r.json(), row = (k) => (j && j[k] && Number.isFinite(+j[k].usd) ? { usd: +j[k].usd, chg: Number.isFinite(+j[k].usd_24h_change) ? +j[k].usd_24h_change : null } : null);
      const x = { t: Math.floor(Date.now() / 1000), BTC: row('bitcoin'), ETH: row('ethereum'), SOL: row('solana') };
      if (x.BTC || x.ETH || x.SOL) { C.j = x; C.err = null; LS.set('jarvis.crypto', x); }
    } catch (e) { C.err = String((e && e.message) || e); }
    C.at = Date.now(); C.busy = null;
    emit('crypto');
  })();
  return C.busy;
}
export const cryptoView = () => C.j;
export const cryptoError = () => C.err;
// King James Version (public domain)
export const VERSES = [
  ['The hand of the diligent shall bear rule: but the slothful shall be under tribute.', 'Proverbs 12:24'],
  ['Commit thy works unto the LORD, and thy thoughts shall be established.', 'Proverbs 16:3'],
  ['The thoughts of the diligent tend only to plenteousness; but of every one that is hasty only to want.', 'Proverbs 21:5'],
  ['Wealth gotten by vanity shall be diminished: but he that gathereth by labour shall increase.', 'Proverbs 13:11'],
  ['Seest thou a man diligent in his business? he shall stand before kings; he shall not stand before mean men.', 'Proverbs 22:29'],
  ['Trust in the LORD with all thine heart; and lean not unto thine own understanding.', 'Proverbs 3:5'],
  ['In all thy ways acknowledge him, and he shall direct thy paths.', 'Proverbs 3:6'],
  ['Keep thy heart with all diligence; for out of it are the issues of life.', 'Proverbs 4:23'],
  ['He becometh poor that dealeth with a slack hand: but the hand of the diligent maketh rich.', 'Proverbs 10:4'],
  ['In all labour there is profit: but the talk of the lips tendeth only to penury.', 'Proverbs 14:23'],
  ['Without counsel purposes are disappointed: but in the multitude of counsellors they are established.', 'Proverbs 15:22'],
  ['A man\'s heart deviseth his way: but the LORD directeth his steps.', 'Proverbs 16:9'],
  ['Be thou diligent to know the state of thy flocks, and look well to thy herds.', 'Proverbs 27:23'],
  ['Whatsoever thy hand findeth to do, do it with thy might.', 'Ecclesiastes 9:10'],
  ['He that observeth the wind shall not sow; and he that regardeth the clouds shall not reap.', 'Ecclesiastes 11:4'],
  ['I can do all things through Christ which strengtheneth me.', 'Philippians 4:13'],
  ['Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.', 'Joshua 1:9'],
  ['They that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint.', 'Isaiah 40:31'],
  ['This is the day which the LORD hath made; we will rejoice and be glad in it.', 'Psalm 118:24'],
  ['Commit thy way unto the LORD; trust also in him; and he shall bring it to pass.', 'Psalm 37:5'],
  ['Take therefore no thought for the morrow: for the morrow shall take thought for the things of itself.', 'Matthew 6:34'],
  ['And let us not be weary in well doing: for in due season we shall reap, if we faint not.', 'Galatians 6:9'],
  ['And whatsoever ye do, do it heartily, as to the Lord, and not unto men.', 'Colossians 3:23'],
  ['For God hath not given us the spirit of fear; but of power, and of love, and of a sound mind.', '2 Timothy 1:7'],
  ['For which of you, intending to build a tower, sitteth not down first, and counteth the cost, whether he have sufficient to finish it?', 'Luke 14:28'],
  ['If any of you lack wisdom, let him ask of God, that giveth to all men liberally, and upbraideth not; and it shall be given him.', 'James 1:5'],
  ['Not slothful in business; fervent in spirit; serving the Lord.', 'Romans 12:11'],
  ['Go to the ant, thou sluggard; consider her ways, and be wise.', 'Proverbs 6:6'],
  ['Prepare thy work without, and make it fit for thyself in the field; and afterwards build thine house.', 'Proverbs 24:27'],
  ['For the vision is yet for an appointed time, but at the end it shall speak, and not lie: though it tarry, wait for it.', 'Habakkuk 2:3'],
  ['So teach us to number our days, that we may apply our hearts unto wisdom.', 'Psalm 90:12'],
];
export const QUOTES = [
  ['You\'ve got to get up every morning with determination if you\'re going to go to bed with satisfaction.', 'George Lorimer'],
  ['Well done is better than well said.', 'Benjamin Franklin'],
  ['Discipline is the bridge between goals and accomplishment.', 'Jim Rohn'],
  ['Risk comes from not knowing what you\'re doing.', 'Warren Buffett'],
  ['The stock market is a device for transferring money from the impatient to the patient.', 'Warren Buffett'],
  ['Rule No. 1: Never lose money. Rule No. 2: Never forget rule No. 1.', 'Warren Buffett'],
  ['The four most dangerous words in investing are: this time it\'s different.', 'Sir John Templeton'],
  ['The goal of a successful trader is to make the best trades. Money is secondary.', 'Alexander Elder'],
  ['Amateurs think about how much money they can make. Professionals think about how much money they could lose.', 'Jack Schwager'],
  ['In investing, what is comfortable is rarely profitable.', 'Robert Arnott'],
  ['Opportunities come infrequently. When it rains gold, put out the bucket, not the thimble.', 'Warren Buffett'],
  ['We are what we repeatedly do. Excellence, then, is not an act, but a habit.', 'Will Durant'],
  ['Success is the sum of small efforts, repeated day in and day out.', 'Robert Collier'],
  ['Don\'t watch the clock; do what it does. Keep going.', 'Sam Levenson'],
  ['Energy and persistence conquer all things.', 'Benjamin Franklin'],
  ['An investment in knowledge pays the best interest.', 'Benjamin Franklin'],
  ['Losers average losers.', 'Paul Tudor Jones'],
  ['Every day I assume every position I have is wrong.', 'Paul Tudor Jones'],
  ['It\'s not whether you\'re right or wrong that\'s important, but how much money you make when you\'re right and how much you lose when you\'re wrong.', 'George Soros'],
  ['The elements of good trading are: cutting losses, cutting losses, and cutting losses.', 'Ed Seykota'],
  ['Win or lose, everybody gets what they want out of the market.', 'Ed Seykota'],
  ['Plan your trade and trade your plan.', 'Trading proverb'],
  ['The trend is your friend.', 'Trading proverb'],
  ['The best time to plant a tree was 20 years ago. The second best time is now.', 'Proverb'],
  ['Patience is bitter, but its fruit is sweet.', 'Jean-Jacques Rousseau'],
  ['Action is the foundational key to all success.', 'Pablo Picasso'],
  ['The harder I work, the luckier I get.', 'Samuel Goldwyn'],
  ['It does not matter how slowly you go as long as you do not stop.', 'Confucius'],
  ['Do not anticipate and move without market confirmation; being a little late in your trade is your insurance that you are right or wrong.', 'Jesse Livermore'],
  ['The market can stay irrational longer than you can stay solvent.', 'John Maynard Keynes'],
  ['Cut your losses short and let your profits run.', 'David Ricardo'],
];
export function dayPick(list, d = new Date()) {     // the same pick all day (ET), a new one each day
  const n = Math.floor(Date.parse(ymd(d) + 'T12:00:00Z') / 864e5);
  return list[((n % list.length) + list.length) % list.length];
}

// ------------------------------------------------------------------------------------------------ the MFFU rulebook
// A small copy of research/lit/mffu_rules.json (built 2026-10-18 from MFFU's help pages; "check" = re-check with MFFU support).
// tests/test_jarvis_brain.py checks it still matches that file.
export const MFFU_RULES = {
  checked: '2026-10-18',
  b50: { name: 'Builder 50K', target: 3000, mll: 2000, dll: 1000, max_minis: 4, max_micros: 40, price: 91.8, inactivity: 7, min_days: 1 },
  b25: { name: 'Builder 25K', target: 1500, mll: 1000, dll: 600, max_minis: 2, max_micros: 20, price: 63, inactivity: 7 },
  mll_type: 'end-of-day trailing: the floor moves up only at the session close and stops at the start + $100; open losses still count intraday',
  dll_type: 'soft: hitting it pauses trading for the rest of that session; the account stays open',
  inactivity: 'no trade for 7 calendar days in a row can close an eval or a sim-funded account (one-time-payment accounts); live accounts have no inactivity rule',
  flat: 'intraday only: flat by 16:10 ET (the platform auto-liquidates at 16:10 ET); no overnight or weekend holds; on CME half-days you must close before the early halt yourself',
  news: 'Builder: news trading allowed in the eval and the sim-funded account (Rapid and Pro have the Tier-1 news rule, Builder does not)',
  consistency: 'eval: no consistency rule (one big day can pass it); funded: at payout time the best day must be at most 50% of the cycle\'s profit',
  payout: 'funded 50K: clear the $2,100 buffer, then at least $500 above it (balance $2,600+), 2 traded days a cycle, $500-$2,000 a payout, 80% split; after 5 sim payouts you move to a live account. 25K: buffer $1,100, $250-$1,000 a payout',
  bots: 'bots and automation are allowed (your own parameters); high-frequency trading and exploiting sim fills are not',
  hedging: 'hedging is prohibited: no long and short on the same market at the same time, also across accounts',
  contracts: 'minis and micros count together (10 micros = 1 mini): 50K max 4 minis / 40 micros, 25K max 2 minis / 20 micros',
  min_days: 'the eval can pass in 1 trading day (no minimum days)',
};

// ------------------------------------------------------------------------------------------------ the System view
// The owner (2026-11-02): "everything combined and simple". One line per system and one verdict for all of them:
//   systemStatus(facts) -> { verdict: 'ALL GOOD' | 'HEADS UP' | 'NEEDS YOU' | 'CHECKING', level: 'ok' | 'warn' | 'bad' | '',
//                            todo: the one thing to do ('' when none), short: the same in a few words (the header strip), todoApp,
//                            rows: [{ id, name, sub, app, level, value, tone?, text, todo, short?, mark? }],
//                            marks: the accounts on day 5+ with no trade (what an "I did it" on the warning marks) }
//   rows: pc (the PC: checking in? bot running? NinjaTrader feed fresh? CPU / RAM), lit (Zlarior, 50K), atlas (ATLAS, 25K),
//   blitz (BLITZ; off = grey), kalshi (the Kalshi bot), planner (the day). level '' = off / unknown: never counted against
//   the verdict. A red line wins over an amber one; the first red line in that order is the one thing to do.
// Pure: facts in (getFacts() without .system, or any part of it), the answer out; junk in, a 'CHECKING' answer out.
export const PC_SILENT_S = 20 * 60;          // the PC publishes live.json every 1-5 min: 20 min quiet = it is off or stuck
const SYS_LV = (x) => (x === 'good' || x === 'ok' || x === 'green' ? 'ok' : x === 'bad' || x === 'red' ? 'bad' : x === 'warn' || x === 'amber' ? 'warn' : '');
const agoS = (s) => (s < 90 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago');
export function systemStatus(f) {
  try { return systemOf(isObj(f) ? f : {}); } catch (_) { return { verdict: 'CHECKING', level: '', todo: '', todoApp: '', rows: [] }; }
}
function systemOf(f) {
  const nowMs = f.now instanceof Date ? f.now.getTime() : Number.isFinite(+f.now) && +f.now > 0 ? +f.now : Date.now(), now = nowMs / 1000;
  const v = isObj(f.live) ? withManualTrades(f.live, f.manualTrades, nowMs) : null, m = isObj(f.market) ? f.market : {};
  const nextMin = isObj(m.next) && Number.isFinite(+m.next.mins) ? +m.next.mins : null;
  const soon = !!m.open || (nextMin != null && nextMin <= 120);       // the market is open or opens within 2 h: the PC should be on
  const rows = [];
  // the PC
  const pc = { id: 'pc', name: 'PC', sub: 'bot server · NinjaTrader', app: 'zenith', level: '', value: '—', text: '', todo: '' };
  if (!v) {
    pc.value = f.liveError ? 'NO SIGNAL' : 'LINKING…';
    pc.text = f.liveError ? 'Cannot reach the PC\'s live feed from this phone' : 'Loading the PC\'s live feed';
    if (f.liveError) { pc.level = 'warn'; pc.short = 'No signal from the PC'; pc.todo = 'Check this phone has signal; if it does, check the PC is on'; }
  } else {
    const t = Number.isFinite(+v.t) && +v.t > 0 ? +v.t : null, age = t ? Math.max(0, now - t) : null;
    const ph = isObj(v.pc_health) ? v.pc_health : null, items = list(v.health).filter(isObj);
    const item = (k) => items.find((x) => x.key === k) || null;
    const feed = item('age_1m_s'), nt = item('nt');
    const bits = [];
    if (ph && (ph.cpu != null || ph.ram != null)) pc.value = [ph.cpu != null ? `CPU ${Math.round(ph.cpu)}%` : '', ph.ram != null ? `RAM ${Math.round(ph.ram)}%` : ''].filter(Boolean).join(' · ');
    else pc.value = 'ONLINE';
    bits.push(age == null ? 'check-in time unknown' : `checked in ${agoS(age)}`);
    if (feed && feed.value != null && feed.value !== '—') bits.push(`feed ${feed.value}`);
    const phBad = ph ? list(ph.lines).filter((x) => isObj(x) && SYS_LV(x.level) === 'bad') : [];
    const phWarn = ph ? list(ph.lines).filter((x) => isObj(x) && SYS_LV(x.level) === 'warn') : [];
    if (age != null && age > PC_SILENT_S) {
      pc.value = 'SILENT';
      pc.level = soon ? 'bad' : '';
      pc.todo = soon ? `Turn the PC on and start the bot: it last checked in ${agoS(age)}` : '';
      bits.splice(0, bits.length, `last checked in ${agoS(age)}${soon ? '' : ' (market closed: fine if it is off)'}`);
    } else if (v.running === false) {
      pc.level = 'bad'; pc.todo = 'Start the bot on the PC: it is stopped'; bits.unshift('bot stopped');
    } else if (feed && feed.ok === false) {
      pc.level = 'bad'; pc.todo = 'Check NinjaTrader on the PC: the bar feed is stale (no new entries until it is fresh)'; bits.unshift('feed stale');
    } else if (nt && nt.ok === false) {
      pc.level = 'bad'; pc.todo = 'Reconnect NinjaTrader on the PC'; bits.unshift('NinjaTrader not connected');
    } else if (phBad.length) {
      pc.level = 'bad'; pc.prio = 3; pc.todo = `PC: ${txt(phBad[0].text) || txt(phBad[0].label)}`; bits.unshift(txt(phBad[0].label) + ' red');
    } else if (phWarn.length) {
      pc.level = 'warn'; pc.prio = 5; pc.todo = `PC: ${txt(phWarn[0].text) || txt(phWarn[0].label)}`; bits.unshift(txt(phWarn[0].label) + ' to watch');
    } else pc.level = 'ok';
    if (v.cached) bits.push('saved copy');
    pc.text = bits.join(' · ');
    if (pc.level === 'bad' || pc.level === 'warn') pc.short = pc.value === 'SILENT' ? 'PC silent' : 'PC: ' + bits[0];
  }
  rows.push(pc);
  // the NQ bots: Zlarior trades the 50K (the PC's verdict is about it), ATLAS the 25K, BLITZ is off until account C is set up
  const vd = v && isObj(v.verdict) ? v.verdict : null;
  const bot = (id, name, sub, c, useVerdict) => {
    const r = { id, name, sub, app: 'zenith', level: '', value: '—', text: '', todo: '' };
    if (!v) { r.text = 'waiting for the PC\'s feed'; return r; }
    if (!isObj(c)) { r.text = 'no card in the live feed'; return r; }
    if (c.off || c.room == null || !Number.isFinite(+c.room)) { r.value = 'OFF'; r.text = c.off ? 'paper only until its own account is set up' : txt(c.status) || 'not set up'; return r; }
    const pnl = Number.isFinite(+c.today_pnl) ? +c.today_pnl : null;
    r.value = usd(pnl, true); r.tone = pnl > 0 ? 'up' : pnl < 0 ? 'dn' : '';
    const rf = Number.isFinite(+c.room_frac) ? +c.room_frac : null;
    r.text = [useVerdict && vd ? txt(vd.label) : txt(c.status), `drawdown left ${usd(c.room)}`].filter(Boolean).join(' · ');
    r.level = 'ok';
    if (useVerdict && vd && SYS_LV(vd.level) && SYS_LV(vd.level) !== 'ok') {
      r.level = SYS_LV(vd.level);
      r.todo = `${name}: ${txt(vd.label)}${txt(vd.reason) ? ' (' + txt(vd.reason) + ')' : ''}`;
      r.short = `${name}: ${txt(vd.label).split(':')[0]}`;
    }
    if (rf != null && rf < 0.25 && r.level === 'ok') { r.level = 'warn'; r.short = `${name}: near its floor`; r.todo = `${name} is close to its floor: ${usd(c.room)} of room left`; }
    if (pc.value === 'SILENT') { r.level = ''; r.todo = ''; r.short = ''; r.text = 'last known · ' + r.text; }    // the PC's fault, said once on its own line
    // MFFU's inactivity rule (owner 2026-11-02): 7 calendar days with no trade can close the eval. Day 5 amber, day 6+ red,
    // even while the PC is off (a silent PC does not stop the count)
    const q = c.quiet_days != null && Number.isFinite(+c.quiet_days) ? Math.max(0, Math.round(+c.quiet_days)) : null;
    if (q != null && q >= 5) {
      const left = Math.max(0, 7 - q);
      r.text += ` · ${q} days no trade`;
      r.mark = id;                      // the shell's "I did it" on the warning (markManualTrade)
      if (r.level !== 'bad') {
        r.level = q >= 6 ? 'bad' : 'warn';
        r.short = `${name}: ${q} days no trade`;
        r.todo = `${name}: place 1 MNQ by hand ${q >= 6 ? 'today' : 'by tomorrow'}: no trade for ${q} days, MFFU can close the account at 7 (${left} left)`;
        r.prio = q >= 6 ? 1 : 2;        // money at risk: the eval itself can be closed
      }
    }
    return r;
  };
  rows.push(bot('lit', 'Zlarior', '50K eval', v && v.lit, true));
  rows.push(bot('atlas', 'ATLAS', '25K', v && v.atlas, false));
  if (!HIDB()) rows.push(bot('blitz', 'BLITZ', '25K', v && v.blitz, false));
  // the PC's other real accounts (extraAccounts: Zlarior 25K #2), one line each, after the bot cards
  list(v && v.extra).filter(isObj).forEach((x, i) => {
    const r = bot(txt(x.id) || 'acct' + i, txt(x.name) || 'Account', `${txt(x.size)} ${txt(x.stage) || 'eval'}`.trim(), x, false);
    r.abbr = /zlarior/i.test(txt(x.name)) ? 'Z' + (i + 2) : txt(x.name).charAt(0) + (i + 2);
    rows.push(r);
  });
  // the Kalshi bot (its own server)
  const k = isObj(f.kalshi) ? f.kalshi : null, ks = txt(f.kalshiState);
  const kr = { id: 'kalshi', name: 'Kalshi', sub: 'its own server', app: 'kalshi', level: '', value: '—', text: '', todo: '' };
  // not published yet: an intentional "not linked yet" state (grey, never counted), not a broken one
  const kp = !k && v && isObj(v.kpaper) ? v.kpaper : null, kl = !k && v && isObj(v.klive) ? v.klive : null;
  if (kl) {                                // the K8 live card from the PC feed (armed by the owner on the PC; Jarvis only reads it)
    const age = kl.t ? Math.max(0, now - kl.t) : null, late = age == null || age > 45 * 60;
    kr.sub = 'live on your PC';
    kr.value = { live: 'LIVE', paused: 'PAUSED', stopped: 'STOPPED', idle: 'ARMED' }[kl.st];
    kr.text = [kl.st === 'idle' ? 'armed, not running' : kl.st === 'paused' ? 'paused from the phone' : kl.st === 'stopped' ? `off${kl.why ? ' (' + kl.why + ')' : ''}` : 'running',
      kl.net != null ? `today ${usd2(kl.net, true)}` : '', kl.fills != null ? `${kl.fills} fill${kl.fills === 1 ? '' : 's'}` : '', age != null ? agoS(age) : ''].filter(Boolean).join(' · ');
    kr.tone = kl.net > 0 ? 'up' : kl.net < 0 ? 'dn' : '';
    kr.level = kl.st === 'stopped' ? 'bad' : kl.st === 'idle' || (kl.st === 'live' && late) ? 'warn' : kl.st === 'live' ? 'ok' : '';
    if (kl.st === 'stopped') { kr.short = 'Kalshi stopped'; kr.todo = 'Kalshi live is OFF (it stopped itself): to start it again, type the phrase on the PC (KALSHI_LIVE.bat)'; }
    else if (kl.st === 'idle') { kr.short = 'Kalshi armed, not running'; kr.todo = 'Kalshi is armed but the PC is not running it: double-click KALSHI_LIVE.bat on the PC'; }
    else if (kl.st === 'live' && late) { kr.short = 'Kalshi not updating'; kr.todo = `Kalshi live card not updating${age != null ? ' since ' + agoS(age) : ''}: check the PC`; }
  } else if (kp) {                                // real money paused; the PC runs the PAPER tests (K1 rules, rewards) and posts them every 15 min
    kr.sub = 'paper tests on your PC'; kr.value = 'PAUSED';
    kr.text = ['real money paused', kp.k1 ? `K1 ${usd2(kp.k1.net, true)} (${kp.k1.sig} signal${kp.k1.sig === 1 ? '' : 's'})` : 'K1 not running',
      kp.rewards ? `rewards ${usd2(kp.rewards.net, true)}` : '', kp.t ? agoS(Math.max(0, now - kp.t)) : ''].filter(Boolean).join(' · ');
  } else if (!k) { kr.value = ks === 'waiting' ? 'NOT LINKED' : ks === 'error' ? 'NO SIGNAL' : 'LINKING…'; kr.text = ks === 'waiting' ? 'not linked yet · planned: one step in your kalshi-server chat' : ks === 'error' ? 'feed unreachable' : 'loading'; }
  else {
    const run = kalshiRun(k) || ['', ''];
    const pnl = Number.isFinite(+k.today_pnl) ? +k.today_pnl : null;
    kr.value = usd2(pnl, true); kr.tone = pnl > 0 ? 'up' : pnl < 0 ? 'dn' : '';
    kr.level = run[0]; kr.text = `${run[1]} · balance ${usd2(k.balance)}`;
    if (run[0] === 'bad' || run[0] === 'warn') kr.short = run[0] === 'bad' ? 'Kalshi bot stopped' : 'Kalshi not updating';
    if (run[0] === 'bad') kr.todo = 'Kalshi bot stopped: check it in your kalshi-server chat';
    else if (run[0] === 'warn') kr.todo = `Kalshi bot not updating${Number.isFinite(+k.t) ? ' since ' + agoS(Math.max(0, now - +k.t)) : ''}: check it in your kalshi-server chat`;
  }
  rows.push(kr);
  // the Planner's day
  const p = isObj(f.planner) ? f.planner : null;
  const pr = { id: 'planner', name: 'Planner', sub: 'your day', app: 'planner', level: '', value: 'NOT LINKED', text: 'open the Planner once on this phone to link your day', todo: '' };
  if (p) {
    const nowHM = fmt('hm', 'en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(nowMs));
    const ev = list(p.ev).filter(isObj), tasks = list(p.tasks).filter(isObj);
    const nx = ev.find((e) => !e.allDay && String(e.start || '') >= nowHM) || ev.find((e) => e.allDay);
    pr.level = 'ok';
    pr.value = nx ? (nx.allDay ? 'ALL DAY' : hm(nx.start)) : 'FREE';
    pr.text = [nx ? txt(nx.title) : 'nothing else on today', tasks.length ? `${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'} open` : ''].filter(Boolean).join(' · ');
  }
  rows.push(pr);
  // the one thing to do: ranked by money at risk (an eval about to be closed for inactivity beats a PC warning), then red over amber
  const pr0 = (r) => (Number.isFinite(r.prio) ? r.prio : r.level === 'bad' ? (r.id === 'pc' ? 1 : 2.5) : 4);
  const bad = rows.filter((r) => r.level === 'bad'), warn = rows.filter((r) => r.level === 'warn');
  const todos = bad.concat(warn).filter((r) => r.todo).sort((a, b) => pr0(a) - pr0(b));
  const first = todos[0] || bad[0] || warn[0] || null;
  const known = rows.some((r) => r.level);
  return { verdict: bad.length ? 'NEEDS YOU' : warn.length ? 'HEADS UP' : known ? 'ALL GOOD' : 'CHECKING', level: bad.length ? 'bad' : warn.length ? 'warn' : known ? 'ok' : '',
    todo: first ? first.todo : '', short: first ? first.short || first.name : '', todoApp: first ? first.app : '', rows, t:v && Number.isFinite(+v.t) ? +v.t : null,
    marks: rows.filter((r) => r.mark).map((r) => r.mark),       // the accounts on day 5+ with no trade: what "I did it" marks     // the accounts an "I did it" marks
    todos: todos.map((r) => ({ id: r.id, level: r.level, todo: r.todo, short: r.short || r.name, app: r.app })) };
}

// ------------------------------------------------------------------------------------------------ the facts
const tryf =(f, d) => { try { const v = f(); return v === undefined ? d : v; } catch (_) { return d; } };
export function getFacts() {               // each part on its own: one broken source never takes the others down
  const now = new Date(), k = tryf(kalshiView, null);
  const f = {
    now,
    market: tryf(() => ({ ...market(now), next: marketNext(now) }), { open: false, text: 'NQ market: unknown', next: null }),
    manualTrades: tryf(manualTrades, {}),
    live: tryf(() => withManualTrades(liveView(), manualTrades(), now), null),
    liveError: L.err,
    kalshi: k,
    kalshiState: K.state,
    kalshiRun: tryf(() => kalshiRun(k), null),
    planner: plannerDay(now),
    plannerLinked: tryf(plannerLinked, false),
    mffu: MFFU_RULES,
    apps: tryf(listApps, []),
    extras: { crypto: C.j, verse: tryf(() => dayPick(VERSES, now), VERSES[0]), quote: tryf(() => dayPick(QUOTES, now), QUOTES[0]) },
  };
  f.system = systemStatus(f);             // the System view: one line per system, one verdict (never throws)
  return f;
}
export const systemView = () => getFacts().system;
export function refresh({ maxAge = 50e3 } = {}) {
  const jobs = [];
  if (Date.now() - L.at > maxAge) jobs.push(refreshLive());
  // while kalshi.json is not published (404), every 5 minutes is enough (less noise on the phone and in the console)
  if (!kalshiBackedOff() && Date.now() - K.at > maxAge) jobs.push(refreshKalshi());
  if (Date.now() - PS.at > Math.max(maxAge, 5 * 60e3)) jobs.push(refreshPlanner({ maxAge: 5 * 60e3 }));
  return Promise.all(jobs).then(() => getFacts());
}
// the Planner saves in another frame of this site: its writes reach Jarvis as storage events
if (typeof window !== 'undefined') window.addEventListener('storage', (e) => { if (/^planner\./.test(e.key || '')) emit('planner'); else if (/^jarvis\.(extra|links)$/.test(e.key || '')) emit('apps'); });
