// OLYMPUS truth (QA round 6, 2026-11-11): ONE place that turns the site's home.json into the account numbers and the data ages every app shows.
// Before, Aegis and Helios read home.accounts (no ATLAS there, and a /50k/ match that could pick the cloud paper twin), while Home and NQ read
// home.board: the same "Drawdown left" could differ between apps. Now every page that shows drawdown / balance / data age goes through here,
// and the root page (classic scripts) gets the same functions as window.OLYMPUS_TRUTH (one module tag in index.html).
// ES module, no imports, no DOM, no network: pure, so tests/test_truth.py runs it in node with the other cores.
//   accountsOf(home)          -> { lit, atlas, blitz }: per account { key, id, name, size, has, room, mll, balance, floor, start, today, week, dll, dllUsed,
//                                toTarget, target, profit, kind, status, paper, t (the PC report it comes from, epoch s), src (the published field) }
//   agesOf(home, nowS)        -> { pc: {t, age, words, text}, cloud: {t, age, words, text}, line, short, silent, stale }
//   canonHome(home)           -> home with `accounts` = the three canonical rows (the shape the older cores read) and `board.lit / board.atlas`
//                                filled from the same numbers, plus `truth` = { accounts, ages }. The input is never changed.
//   extraOf(home)             -> the PC's other real accounts (Zlarior 25K #2), same row shape (night-feedsA 2026-11-18)
//   drawdownLine(room, mll), money(x), ageWords(sec)
// Source order (the published field first, the same as NQ and Home): board.<key> (engine/live_board.py, in home.json) -> lit: the PC's own account
// row in home.accounts (never the cloud paper twin) -> atlas: second.account_b.eval / blitz: live.pc.blitz.eval (paper).

export const KEYS = ['lit', 'atlas', 'blitz'];
export const META = {
  lit: { key: 'lit', id: 'zlarior', name: 'Zlarior', bot: 'LIT', size: '50K', start: 50000, mll: 2000, target: 3000, dll: 1000, paper: false },
  atlas: { key: 'atlas', id: 'atlas', name: 'ATLAS', bot: 'ATLAS', size: '25K', start: 25000, mll: 1000, target: 1500, dll: 600, paper: false },
  blitz: { key: 'blitz', id: 'blitz', name: 'BLITZ', bot: 'BLITZ', size: '25K', start: 25000, mll: 1000, target: 1500, dll: 600, paper: true },
};
export const FRESH_S = 20 * 60;          // a PC report this young counts as "now" (the same 20 minutes as NQ's flame)
export const STALE_S = 36 * 3600;        // older than this the numbers are called old

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const obj = (x) => (isObj(x) ? x : {});
export const num = (v) => { const x = typeof v === 'string' ? parseFloat(v.replace(/[$,\s]/g, '')) : v; return typeof x === 'number' && Number.isFinite(x) ? x : null; };
const first = (...xs) => { for (const x of xs) { const v = num(x); if (v != null) return v; } return null; };
export function money(x) { const v = num(x); if (v == null) return '$0'; const a = Math.abs(Math.round(v)); return (v < 0 && a !== 0 ? '-' : '') + '$' + a.toLocaleString('en-US'); }
export const drawdownLine = (room, mll) => `Drawdown left ${money(room)} of ${money(mll)} max loss`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
/** the age in plain words, the same words NQ uses: "47 minutes", "5 hours 12 minutes", "4 days 3 hours" */
export function ageWords(sec) {
  const s = Math.max(0, Math.floor(num(sec) || 0));
  if (s < 60) return 'less than a minute';
  if (s < 3600) return plural(Math.floor(s / 60), 'minute');
  if (s < 86400) { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return plural(h, 'hour') + (m ? ' ' + plural(m, 'minute') : ''); }
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600); return plural(d, 'day') + (h ? ' ' + plural(h, 'hour') : '');
}
const shortAge = (sec) => { const s = Math.max(0, Math.floor(num(sec) || 0)); return s < 90 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago'; };
const toS = (v) => {      // epoch seconds / ms, or an ISO time -> epoch seconds
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : /^\s*\d+(\.\d+)?\s*$/.test(String(v)) ? parseFloat(v) : null;
  if (n != null) return Number.isFinite(n) ? (n > 1e12 ? n / 1000 : n) : null;
  const t = Date.parse(String(v)); return Number.isFinite(t) ? t / 1000 : null;
};

// ------------------------------------------------------------------------------------------------ where each account's numbers come from
const ROW_RE = { lit: /mffu50k|zlarior|builder 50k|\blit\b|\b50k\b/, atlas: /atlas|acctb|acct_b/, blitz: /blitz|acct_c/ };
/** the account's own row in home.accounts (the PC's): never the cloud paper twin of LIT ("Paper (cloud)", plan "MFFU 50K rules") */
// night-feedsA 2026-11-18: the GitHub Pages site is a CLOUD build: its board cards say badge PAPER, source "cloud paper" ($49,900 = the
// cloud's paper twin) and its 50K account row is badged PAPER. Those were shown as Zlarior's numbers whenever the PC feed was late. A paper /
// cloud card or row is never a real account (BLITZ is paper by design): no number beats a wrong one. (A cloud build relaying the PC's own
// cards, badge LIVE / source "PC bot", is still the PC's numbers.)
const paperish = (x) => isObj(x) && (/^paper$/i.test(String(x.badge || '')) || /\bcloud\b/i.test(String(x.source || '')));
function rowOf(home, key) {
  for (const a of Array.isArray(home.accounts) ? home.accounts : []) {
    if (!isObj(a) || a.error) continue;
    const s = [a.id, a.name, a.plan, a.strategy].map((x) => String(x || '')).join(' ').toLowerCase();
    if (key !== 'blitz' && (String(a.source || '').toLowerCase() === 'cloud' || /\bcloud\b/.test(s) || paperish(a))) continue;
    if (key === 'lit' && (ROW_RE.atlas.test(s) || ROW_RE.blitz.test(s) || /\b25k\b/.test(s))) continue;     // Zlarior's 25K #2 is not the 50K (night-feedsA)
    if (ROW_RE[key].test(s)) return a;
  }
  return null;
}
function blockOf(key, home) {
  const board = obj(home.board), pc = obj(obj(home.live).pc), row = rowOf(home, key);
  const b = board[key], cloudCard = key !== 'blitz' && paperish(b);       // a cloud build that relays the PC's own cards (badge LIVE) still counts
  if (isObj(b) && num(b.room) != null && !cloudCard) return { e: b, today: first(b.today_pnl, b.today), week: b.week_pnl, src: 'board.' + key, row };
  if (row && (isObj(row.eval) || isObj(row.funded_eval))) { const e = isObj(row.eval) ? row.eval : row.funded_eval; return { e, today: first(obj(row.pnl).today, e.today), week: obj(row.pnl).week, src: 'accounts.' + (row.id || key), row }; }
  if (key === 'atlas') { const ab = obj(obj(home.second).account_b); return isObj(ab.eval) ? { e: ab.eval, today: first(ab.eval.today, ab.day_pnl), week: null, src: 'second.account_b', row: null } : null; }
  if (key === 'blitz') { const bl = obj(pc.blitz); return isObj(bl.eval) ? { e: bl.eval, today: bl.eval.today, week: null, src: 'live.pc.blitz', row: null } : null; }
  return null;
}
function reportT(key, home) {
  const board = obj(home.board), pc = obj(obj(home.live).pc);
  if (key === 'atlas') return first(obj(pc.second).t, pc.t, obj(home.second).pc_t, board.data_t, obj(obj(rowOf(home, 'atlas')).conn).t);
  if (key === 'blitz') return first(obj(pc.blitz).t, isObj(pc.blitz) ? pc.t : null, obj(obj(rowOf(home, 'blitz')).conn).t);
  const row = rowOf(home, 'lit');
  return first(pc.t, board.data_t, row ? obj(row.conn).t : null);
}

/** the three accounts, from the published board first. Never throws; an account without numbers has has = false and nulls. */
export function accountsOf(home) {
  const h = obj(home), out = {};
  for (const key of KEYS) {
    const M = META[key], blk = blockOf(key, h);
    const base = { key, id: M.id, name: M.name, bot: M.bot, size: M.size, has: false, room: null, mll: M.mll, balance: null, floor: null, start: M.start, today: 0, week: 0, dll: M.dll, dllUsed: 0,
      toTarget: null, target: M.target, profit: null, kind: M.paper ? 'paper' : 'eval', status: '', paper: M.paper, t: null, src: '' };
    if (!blk) { out[key] = base; continue; }
    const e = blk.e, start = first(e.start_balance, M.start), mll = first(e.mll, M.mll), roomRaw = num(e.room);
    const tb = first(e.target_balance, e.target), target = tb != null && tb > start ? tb - start : M.target;     // the same rule as NQ
    const balance = num(e.balance), profit = first(e.profit, balance != null ? balance - start : null);
    out[key] = { ...base, has: true, room: roomRaw == null ? null : Math.max(0, Math.min(mll, roomRaw)), mll, balance, floor: num(e.floor), start, today: num(blk.today) || 0, week: num(blk.week) || 0,
      dll: first(e.dll, M.dll), dllUsed: Math.max(0, first(e.dll_used, 0)), toTarget: first(e.to_target, profit != null ? target - profit : null), target, profit,
      kind: String((blk.row && blk.row.kind) || e.kind || (e.stage === 'funded' || String(e.status || '').toLowerCase() === 'funded' ? 'funded' : '')).toLowerCase() === 'funded' ? 'funded' : M.paper ? 'paper' : 'eval',   // the PC's ATLAS card says status 'funded' (night-feedsA)
      status: String(e.status || ''), t: reportT(key, h), src: blk.src };
  }
  return out;
}

/** The PC's OTHER real accounts (night-feedsA 2026-11-18, owner: "3 accounts, not 2"): accountsOf has one row per BOT (lit = Zlarior's
 *  50K, atlas = ATLAS's funded 25K); the PC also runs Zlarior 25K #2 (id b25k_2), which only its "accounts" list carries. Read from
 *  home.pc_accounts (the PC feed's list, laid in by withPcFeed) else home.accounts. Same rule as the ZEUS card (business/mffumodel.js) and
 *  Jarvis (jarvis/data.js extraAccounts): a cloud / PAPER / BLITZ row is never an account, and a row with the lit or atlas card's own
 *  balance + floor IS that card. -> [{ key, id, name, size, has, room, mll, balance, floor, start, today, week, dll, dllUsed, toTarget, target,
 *  profit, kind ('eval' | 'funded'), status, paper: false, t, src }] (the accountsOf row shape). Never throws. */
export function extraOf(home) {
  const h = obj(home), board = obj(h.board), out = [];
  const src = Array.isArray(h.pc_accounts) ? h.pc_accounts : Array.isArray(h.accounts) ? h.accounts : [];
  // the rows accountsOf already reads as Zlarior / ATLAS (an older home.json without board cards: its 50K row IS Zlarior)
  const own = new Set(['lit', 'atlas'].map((k) => (Array.isArray(h.pc_accounts) ? null : rowOf(h, k))).filter(Boolean).map((a) => String(a.id)));
  const same = (c, e) => isObj(c) && num(c.balance) != null && num(c.balance) === num(e.balance) && num(c.floor) === num(e.floor);
  for (const a of src) {
    if (!isObj(a) || !a.id || a.error || !['eval', 'funded'].includes(String(a.kind))) continue;
    const id = String(a.id), who = `${id} ${a.name || ''} ${a.source || ''}`;
    if (/^(lit|atlas|blitz|zlarior|acct_?b|acct_?c|cloud_paper)$/i.test(id) || /cloud|blitz|scalp/i.test(who) || /^paper$/i.test(String(a.badge || ''))) continue;
    const e = isObj(a.eval) ? a.eval : isObj(a.funded) ? a.funded : null;
    if (!e || num(e.balance) == null || own.has(id) || same(board.lit, e) || same(board.atlas, e) || out.some((x) => x.id === id)) continue;
    const m = /(\d+)\s*k\b/i.exec(String(a.plan || '')) || /(\d+)\s*k\b/i.exec(String(a.name || '')), size = m ? m[1] + 'K' : '';
    const start = first(e.start_balance, size === '50K' ? 50000 : size === '25K' ? 25000 : null), mll = first(e.mll, size === '50K' ? 2000 : 1000);
    const tb = first(e.target_balance), target = tb != null && start != null && tb > start ? tb - start : size === '50K' ? 3000 : 1500;
    const funded = a.kind === 'funded', balance = num(e.balance), profit = first(e.profit, balance != null && start != null ? balance - start : null);
    out.push({ key: id, id, name: String(a.name || id).replace(/\bBuilder\s+/i, '').replace(/^MFFU\s+/i, '').slice(0, 40), bot: /atlas/i.test(String(a.strategy || '')) ? 'ATLAS' : 'LIT', size, has: true,
      room: num(e.room) == null ? null : Math.max(0, Math.min(mll, num(e.room))), mll, balance, floor: num(e.floor), start, today: first(obj(a.pnl).today, e.today) || 0, week: first(obj(a.pnl).week) || 0,
      dll: first(e.dll, size === '50K' ? 1000 : 600), dllUsed: Math.max(0, first(e.dll_used, 0)), toTarget: funded ? null : first(e.to_target, profit != null ? target - profit : null), target, profit,
      kind: funded ? 'funded' : 'eval', status: String(e.status || ''), paper: false, t: first(obj(a.conn).t, board.data_t, h.pc_accounts_t), src: 'accounts.' + id });
  }
  return out;
}

/** how old the numbers are, and from where: the PC's last report (the bots' numbers) and the cloud copy (when the site was built) */
export function agesOf(home, nowS) {
  const h = obj(home), now = num(nowS) != null ? num(nowS) : Date.now() / 1000;
  const pcT = first(obj(obj(h.live).pc).t, obj(h.board).data_t), cloudT = first(toS(h.built), obj(h.board).t, toS(obj(h.live).last_run));
  const one = (t, what) => {
    if (t == null) return { t: null, age: null, words: 'never', short: 'never', text: `${what}: none yet` };
    const age = Math.max(0, Math.floor(now - t)), w = ageWords(age);
    return { t, age, words: w, short: shortAge(age), text: `${what} ${w} ago` };
  };
  const pc = one(pcT, 'PC report'), cloud = one(cloudT, 'cloud copy');
  const silent = pc.age == null || pc.age > FRESH_S, stale = pc.age == null || pc.age > STALE_S;
  const line = pc.t == null ? `No report from the PC yet${cloud.t != null ? `; cloud copy ${cloud.words} old` : ''}.`
    : `Numbers from the PC report ${pc.words} ago${cloud.t != null ? ` (cloud copy ${cloud.words} old)` : ''}.`;
  return { pc, cloud, silent, stale, line, short: `PC ${pc.short} · cloud ${cloud.short}` };
}

/** home.json with the canonical accounts laid in, for the cores that read home.accounts / home.board. The input object is not changed. */
export function canonHome(home, nowS) {
  if (!isObj(home)) return home;
  const now = num(nowS) != null ? num(nowS) : Date.now() / 1000, A = accountsOf(home), ages = agesOf(home, now), board = { ...obj(home.board) }, rows = [];
  for (const key of KEYS) {
    const a = A[key]; if (!a.has) continue;
    const row = rowOf(home, key), conn = obj(row && row.conn);
    const fresh = a.t == null || now - a.t <= FRESH_S;     // a "connected" from a report we know is old is not news: unknown, not green
    rows.push({ id: a.id, name: `${a.name} ${a.size}`, strategy: a.bot.toLowerCase(), plan: `MFFU Builder ${a.size}`, kind: a.kind, source: a.src, badge: a.paper ? 'PAPER' : 'LIVE',
      eval: { start_balance: a.start, balance: a.balance, floor: a.floor, room: a.room, mll: a.mll, dll: a.dll, dll_used: a.dllUsed, today: a.today, to_target: a.toTarget, target: a.target, profit: a.profit, status: a.status },
      pnl: { today: a.today, week: a.week }, stats: row && isObj(row.stats) ? row.stats : undefined,
      conn: { t: a.t, connected: fresh && typeof conn.connected === 'boolean' ? conn.connected : null, stale: !fresh }, paused: !!(row && row.paused) });
    if (key !== 'blitz' && isObj(board[key])) board[key] = { ...board[key], room: a.room, mll: a.mll, balance: a.balance, floor: a.floor };
    else if (key !== 'blitz') board[key] = { id: key, name: a.name, room: a.room, mll: a.mll, balance: a.balance, floor: a.floor, to_target: a.toTarget, profit: a.profit, today_pnl: a.today, status: a.status };
  }
  // t = the PC report the numbers come from (cores that judge "how old are the account numbers" read home.t), unless home.json has its own
  return { ...home, t: num(home.t) != null ? home.t : ages.pc.t, accounts: rows, board, truth: { accounts: A, ages } };
}

// Round 7 (no GitHub): the PC posts a small live status every 15 minutes (tools/pc_report.py -> ntfy; site/status_feed.json names the
// topic; pc_feed.js reads it). withPcFeed(home) lays the newest PC status over home.json before canonHome, so every app shows the PC's
// own time and numbers. Never throws, never waits more than ~3 s, returns home unchanged when there is no feed.
let pcFeedP = null;
function loadPcFeed() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.resolve(null);
  if (window.PC_FEED) return Promise.resolve(window.PC_FEED);
  if (!pcFeedP) {
    pcFeedP = new Promise((res) => {
      try {
        const s = document.createElement('script'); s.src = new URL('../pc_feed.js?v=n10', import.meta.url).href; s.async = true;
        s.onload = () => res(window.PC_FEED || null); s.onerror = () => res(null); document.head.appendChild(s);
      } catch (e) { res(null); }
    });
  }
  return pcFeedP;
}
export async function withPcFeed(home) {
  try {
    if (!home || typeof home !== 'object') return home;
    const F = await loadPcFeed(); if (!F) return home;
    const feedUrl = new URL('../status_feed.json', import.meta.url).href;
    const lite = await Promise.race([F.fetchLatest({ feedUrl }), new Promise((r) => setTimeout(() => r(null), 3000))]);
    if (!lite) return home;
    const out = F.overlayHome(home, lite);
    // the PC's own account list rides along (extraOf reads it: Zlarior 25K #2 is not a board card), only when it is the newer word
    return out !== home && Array.isArray(lite.accounts) ? { ...out, pc_accounts: lite.accounts, pc_accounts_t: num(lite.t) } : out;
  } catch (e) { return home; }
}
