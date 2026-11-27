// NQ LIVE screen core (day-livedash 2026-11-26; owner: "I want to see live trades on the dashboard, where we're at"). Pure ES module:
// no DOM, no network, no storage; node-tested (tests/test_nq_live.py). The page (live.js) hands in:
//   lite  = the PC's newest status post, ext merged (pc_feed.js fetchLatest): reporter, pc_verdict, price, pc.glance, board, accounts, at,
//           k7, mf, ck / p4 (PC checklist, newer PCs), bf (Brain feed, newer PCs)
//   bars  = the PC's newest "le-bars" chart post (nqbars.js parseVerified) or null: 5m candles + every open trade + today's closed trades
//   cards = acctcore.build(...).cards (the Accounts screen's cards: balance, today, room, to pass / payout, armed, age)
//   nowS  = unix seconds
// build(...) -> { pc, health, accounts[], open|null, setups[], today[], todayUsd, chart }
// Every number says how old it is; nothing is made up (a missing piece is "not reported"). Read only: nothing here places, arms or changes.

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const obj = (x) => (isObj(x) ? x : {});
const arr = (x) => (Array.isArray(x) ? x : []);
export const num = (v) => (v === null || v === undefined || v === '' || typeof v === 'boolean' || !Number.isFinite(+v) ? null : +v);
const str = (v, n) => String(v == null ? '' : v).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n || 160);

export const PT_USD = 2;                    // $ a point a contract: the bots trade MNQ micros (CLAUDE.md sizing; tests check a real row)
export const FRESH_S = 20 * 60, OLD_S = 60 * 60;   // the PC posts every 15 min: <= 20 min green, <= 60 gold, older red (pc_feed / acctcore)
export const POLL_MS = 22000;               // the page asks the feed every 22 s while on screen (pc_feed.js shares one answer for 20 s: 22 always gets a new one)
export const BOT_NAME = { lit: 'Zlarior', atlas: 'ATLAS', rapid: 'Rapid EOD', blitz: 'BLITZ' };
// the PC account ids of each card (business/accounts.json "pc"; acctcore PLAN_IDS) and the chart post's account keys (nqbars ACCTS)
export const IDS_OF = { zlarior: ['mffu50k_eval', 'lit'], fresh25: ['b25k_2'], atlas: ['atlas', 'acct_b'], rapid1: ['rapid'] };
export const CHART_KEY = { z50k: 'mffu50k_eval', z25k2: 'b25k_2', atlas25f: 'atlas', rapid: 'rapid', rapid25: 'rapid' };
const LIT_IDS = ['mffu50k_eval', 'lit', 'b25k_2'];
export const HIDDEN = ['blitz', 'acctc', 'acct_c'];          // BLITZ is hidden from the owner (paper): never a card, a row or a streak

// ------------------------------------------------------------------------------------------------ words
export function usd(v, sign) {
  const n = num(v); if (n === null) return '-';
  const a = Math.round(Math.abs(n)); if (a === 0) return '$0';
  return (n < 0 ? '-' : sign ? '+' : '') + '$' + a.toLocaleString('en-US');
}
export const rTxt = (v) => { const n = num(v); if (n === null) return ''; const k = Math.round(n * 10) / 10; return `${k > 0 ? '+' : k < 0 ? '-' : ''}${Math.abs(k).toFixed(1)}R`; };
export const pxTxt = (v) => { const n = num(v); return n === null ? '-' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
export const ptsTxt = (v) => { const n = num(v); return n === null ? '' : `${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2 })} pts`; };
export function ago(s) {
  const n = num(s); if (n === null) return 'never';
  if (n < 90) return 'just now';
  if (n < 3600) return `${Math.round(n / 60)} min ago`;
  if (n < 48 * 3600) { const m = Math.round(n / 60), h = Math.floor(m / 60); return m % 60 ? `${h} h ${m % 60} min ago` : `${h} h ago`; }
  return `${Math.round(n / 86400)} days ago`;
}
export function dur(s) { const m = Math.max(0, Math.round((num(s) || 0) / 60)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; }
export const lvlOf = (ageS) => (num(ageS) === null ? 'bad' : ageS > OLD_S ? 'bad' : ageS > FRESH_S ? 'warn' : 'ok');

// New York wall clock: { day: 'YYYY-MM-DD', hm: 'HH:MM', wd: 0..6 }
export function et(t) {
  const v = num(t); if (v === null) return null;
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
      .formatToParts(new Date(v * 1000)).map((x) => [x.type, x.value]));
    return { day: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}`, wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
  } catch (_) { return null; }
}
/** the CME trading day of t (18:00 ET starts the next day), as engine/cme_calendar and nqcore.tradingDay */
export const cmeDay = (t) => { const p = et(num(t) === null ? null : num(t) + 6 * 3600); return p ? p.day : ''; };
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** Monday of the CME week of day s, and its month 'YYYY-MM' */
export function weekStart(s) { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return ''; const wd = new Date(s + 'T12:00:00Z').getUTCDay(); return addDays(s, -((wd + 6) % 7)); }

// ------------------------------------------------------------------------------------------------ the PC and the bots in plain words
export function health(lite, nowS) {
  const L = obj(lite), rep = obj(L.reporter), rt = num(rep.t) ?? num(L.t);
  const ageS = rt === null ? null : Math.max(0, nowS - rt), level = lvlOf(ageS);
  const pc = { ageS, level, text: ageS === null ? 'PC not heard from' : `PC ${ago(ageS)}` };
  const lines = [];
  const add = (lvl, text) => { const t = str(text, 140); if (t && !lines.some((x) => x.text === t)) lines.push({ level: lvl, text: t }); };
  if (!lite) return { pc, level: 'bad', title: 'No report from your PC yet', lines: [{ level: 'bad', text: 'The screen fills in once the PC posts (every 15 minutes while it is on).' }] };
  if (level === 'bad') add('bad', `Your PC has been quiet for ${ago(ageS).replace(' ago', '')}: the numbers below are from its last report.`);
  const ck = obj(L.ck);
  if (isObj(ck.need) && ck.need.t) add('warn', ck.need.t);
  if (rep.server === false || ck.srv === 0) add('bad', 'The bot server on the PC is not answering.');
  if (rep.nt === false) add('bad', 'NinjaTrader is closed on the PC.');
  for (const p of arr(rep.problems).slice(0, 2)) add('warn', isObj(p) ? p.text || p.msg || p.code : p);
  // the pillars: ck.pl [[pillar, state, words]] (newer PCs), else the glance's on / armed
  const pl = arr(ck.pl).filter((p) => Array.isArray(p) && p[0] !== 'BLITZ' && p[0] !== 'OF');
  const glance = arr(obj(obj(L.pc).glance).bots).filter(isObj);
  const bots = [];
  if (pl.length) {
    for (const p of pl) bots.push({ id: String(p[0]).toLowerCase(), name: p[0] === 'LIT' ? 'Zlarior' : str(p[0], 12), state: p[1] === 'run' ? 'armed' : p[1] === 'on' ? 'on' : p[1] === 'off' ? 'off' : 'unknown', text: str(p[2], 60) });
  } else {
    for (const g of glance) if (g.id !== 'blitz') bots.push({ id: g.id, name: str(g.name || BOT_NAME[g.id] || g.id, 16), state: g.armed ? 'armed' : g.on ? 'on' : 'off',
      text: g.armed ? `ON, armed${g.mode && /live/i.test(g.mode) ? ' (LIVE)' : ''}` : g.on ? 'ON, NOT armed' : 'OFF' });
  }
  for (const b of bots) if (b.state === 'on') add('warn', `${b.name} is running but NOT armed: no orders until you type the phrase on the PC.`);
  const v = obj(L.pc_verdict);
  const ok = level !== 'bad' && !lines.some((x) => x.level === 'bad');
  const title = level === 'bad' ? (ageS === null ? 'No report from your PC' : `PC silent ${ago(ageS)}`)
    : !ok ? 'PC needs you' : v.label ? str(v.label, 40) : bots.some((b) => b.state === 'armed') ? 'Bots on and armed' : 'PC on';
  return { pc, level: lines.some((x) => x.level === 'bad') ? 'bad' : lines.length ? 'warn' : 'ok', title, bots, lines, reason: str(v.reason, 90) };
}

// ------------------------------------------------------------------------------------------------ the price (the newest of the post / glance / bars)
export function price(lite, bars) {
  const L = obj(lite), c = [];
  const g = obj(obj(L.pc).glance), gb = arr(g.bots).find((b) => isObj(b) && num(b.px) !== null);
  if (num(L.price) !== null && num(L.t) !== null) c.push({ px: num(L.price), t: num(L.t), src: 'the PC report' });
  if (gb && num(g.t) !== null) c.push({ px: num(gb.px), t: num(g.t), src: 'the bot' });
  const B = obj(bars), n = num(B.n), last = B._last;
  if (Array.isArray(last) && num(last[4]) !== null) c.push({ px: num(last[4]), t: num(last[0]) + 300, src: 'the chart' });
  else if (n && num(B.t) !== null && num(B.px) !== null) c.push({ px: num(B.px), t: num(B.t), src: 'the chart' });
  return c.sort((a, b) => b.t - a.t)[0] || null;
}

// ------------------------------------------------------------------------------------------------ trades: the "at" block, the board, the chart post
// at.a[].tr rows: [entry_t, exit_t, dir, qty, entry, stop, target, exit_kind, usd, r] (engine/feed_trades), exit_t null = still open
export function nameOf(id, lite, cards) {
  const s = String(id || '');
  for (const c of arr(cards)) if ((IDS_OF[c.key] || [c.key]).includes(s)) return c.name;
  const L = obj(lite);
  const r = [...arr(obj(L.k7).a), ...arr(obj(L.mf).a)].find((x) => isObj(x) && String(x.id) === s && x.nm);
  if (r) return str(r.nm, 30);
  const a = arr(L.accounts).find((x) => isObj(x) && String(x.id) === s && x.name);
  return a ? str(a.name, 30).replace(/\b\d{5,}\b/g, '') : s === 'atlas' ? 'ATLAS 25K funded' : s || 'Account';
}
export function trades(lite, bars) {
  const L = obj(lite), out = [];
  for (const a of arr(obj(L.at).a)) {
    if (!isObj(a) || !a.id) continue;
    for (const r of arr(a.tr)) {
      if (!Array.isArray(r) || num(r[0]) === null) continue;
      out.push({ acct: String(a.id), t: num(r[0]), xt: num(r[1]), dir: num(r[2]) === -1 ? -1 : 1, qty: num(r[3]), entry: num(r[4]), stop: num(r[5]), target: num(r[6]),
        why: r[7] ? str(r[7], 10).toUpperCase() : '', usd: num(r[8]), r: num(r[9]), open: num(r[1]) === null, src: 'at' });
    }
  }
  for (const t of arr(obj(L.board).trades)) {
    if (!isObj(t) || t.src !== 'live' || num(t.entry_t) === null) continue;
    out.push({ acct: String(t.acct || ''), t: num(t.entry_t), xt: num(t.exit_t), dir: /short/i.test(t.side) ? -1 : 1, qty: num(t.qty), entry: num(t.entry), stop: num(t.stop), target: num(t.target),
      why: str(t.exit, 10).toUpperCase(), usd: num(t.usd), r: num(t.r), open: t.open === true, member: str(t.member, 8), src: 'board' });
  }
  const B = obj(bars);
  for (const [list, open] of [[B.open, true], [B.closed, false]]) for (const r of arr(list)) {
    if (!isObj(r) || num(r.t) === null || num(r.e) === null) continue;
    out.push({ acct: CHART_KEY[r.k] || String(r.k || ''), t: num(r.t), xt: open ? null : num(r.xt), dir: num(r.s) === -1 ? -1 : 1, qty: num(r.q), entry: num(r.e),
      stop: num(r.sl), target: num(r.tp), exit: num(r.x), why: str(r.why, 10).toUpperCase(), usd: num(r.usd), r: num(r.r), open, be: !!r.be, src: 'bars' });
  }
  // one row a trade: the same account + entry time (within 2 min) merged; a closed row beats an open one, then the fuller one
  const keep = [];
  for (const t of out.sort((a, b) => a.t - b.t)) {
    const k = keep.find((x) => x.acct === t.acct && Math.abs(x.t - t.t) <= 120 && x.dir === t.dir);
    if (!k) { keep.push({ ...t }); continue; }
    if (!t.open) k.open = false;
    for (const f of ['xt', 'qty', 'entry', 'stop', 'target', 'exit', 'usd', 'r', 'member']) if (k[f] == null || k[f] === '') k[f] = t[f];
    if (t.why && (!k.why || k.open === false)) k.why = k.why || t.why;
    if (t.be) k.be = true;
  }
  for (const k of keep) if (k.xt !== null && k.xt !== undefined) k.open = false;
  return keep;
}

/** the open trade (one card: every account in the same trade), with live $ and R from the newest price */
/** every open trade row (the feed's rows + the board's lit / atlas positions merged in), newest first. BLITZ never (hidden). */
export function openRows(lite, bars, nowS) {
  const L = obj(lite), bd = obj(L.board), all = trades(lite, bars);
  const rows = all.filter((t) => t.open && num(t.entry) !== null && nowS - t.t < 20 * 3600 && !HIDDEN.includes(t.acct));
  // the board's position (lit / atlas) = the bot's trade even when no account row says so yet
  for (const [bot, ids] of [['lit', ['mffu50k_eval']], ['atlas', ['atlas']]]) {
    const p = obj(obj(bd[bot]).position);
    if (num(p.entry) === null || num(p.entry_t) === null) continue;
    const dir = /short/i.test(p.side) || num(p.side) === -1 ? -1 : 1;
    const m = rows.find((r) => Math.abs(r.t - num(p.entry_t)) <= 120 && r.dir === dir);
    if (m) { if (m.stop === null) m.stop = num(p.stop); if (m.target === null) m.target = num(p.target); if (p.be) m.be = true; if (m.pcR == null) m.pcR = num(p.unrealized_r); continue; }
    rows.push({ acct: ids[0], bot, t: num(p.entry_t), dir, qty: num(p.qty), entry: num(p.entry), stop: num(p.stop), target: num(p.target), be: !!p.be, pcR: num(p.unrealized_r), open: true, src: 'board' });
  }
  return rows.sort((a, b) => b.t - a.t);
}
export function openTrade(lite, bars, cards, nowS) {
  const rows = openRows(lite, bars, nowS);
  if (!rows.length) return null;
  // group by side + entry time: the copies of one signal on several accounts
  rows.sort((a, b) => b.t - a.t);
  const lead = rows[0], same = rows.filter((r) => r.dir === lead.dir && Math.abs(r.t - lead.t) <= 300);
  const others = rows.length - same.length;
  const P = price(lite, bars);
  const entry = lead.entry, stop = same.map((r) => r.stop).find((x) => x !== null && x !== undefined) ?? null;
  const target = same.map((r) => r.target).find((x) => x !== null && x !== undefined) ?? null;
  const risk = stop !== null ? Math.abs(entry - stop) : null;
  const pts = P ? (P.px - entry) * lead.dir : null;
  const accts = [];
  for (const r of same) {
    if (accts.some((a) => a.id === r.acct)) continue;
    const q = num(r.qty) || 0;
    accts.push({ id: r.acct, name: nameOf(r.acct, lite, cards), qty: q || null, usd: pts !== null && q ? pts * q * PT_USD : null });
  }
  const qty = accts.reduce((s, a) => s + (a.qty || 0), 0) || num(lead.qty);
  const usdNow = pts !== null && qty ? pts * qty * PT_USD : null;
  const r = pts !== null && risk ? pts / risk : lead.pcR ?? null;
  const bot = lead.bot || (LIT_IDS.includes(lead.acct) || lead.acct === 'rapid' ? 'lit' : 'atlas');
  return {
    bot, botName: BOT_NAME[bot] || bot, side: lead.dir === -1 ? 'SHORT' : 'LONG', dir: lead.dir, qty, entry, stop, target, be: same.some((x) => x.be), t: lead.t,
    inFor: Math.max(0, nowS - lead.t), px: P ? P.px : null, pxT: P ? P.t : null, pxAge: P ? Math.max(0, nowS - P.t) : null, pxSrc: P ? P.src : '',
    pts, usd: usdNow, r, risk, riskUsd: risk !== null && qty ? risk * qty * PT_USD : null,
    toStop: P && stop !== null ? Math.abs(P.px - stop) : null, toTarget: P && target !== null ? Math.abs(target - P.px) : null,
    accounts: accts, others, lvl: P ? lvlOf(Math.max(0, nowS - P.t)) : 'bad',
  };
}

// ------------------------------------------------------------------------------------------------ setup progress: bf (Brain feed) first, else the glance
const LIT_STAGE = ['Levels', 'Sweep', 'Inducement', 'Displacement', '5m CISD', 'Limit armed', '1m CISD wait', 'Entry', 'In trade', 'Done for today'];
const ATLAS_STEP = ['window', 'signal', 'armed', 'trade', 'done'];
export function stageN(s) {
  const m = /\((\d{1,2})\/(\d{1,2})\)/.exec(String(s || '')); if (m) return [Math.max(0, +m[1]), +m[2]];
  const lab = String(s || '').replace(/\s*\(.*\)\s*$/, '').trim().toLowerCase(), i = LIT_STAGE.findIndex((x) => x.toLowerCase() === lab);
  return i >= 0 ? [i + 1, 10] : null;
}
function stepsOf(next) {
  const s = next && next.steps;
  if (typeof s === 'string') { const m = /^(\d+)\s*\/\s*(\d+)$/.exec(s); return m ? [+m[1], +m[2]] : null; }
  const a = arr(s).filter(isObj); return a.length ? [a.filter((x) => x.done).length, a.length] : null;
}
export function setups(lite, nowS, open) {
  const L = obj(lite), bf = obj(L.bf), g = obj(obj(L.pc).glance), out = [];
  const bfAge = num(bf.t) !== null ? Math.max(0, nowS - num(bf.t)) : null, gAge = num(g.t) !== null ? Math.max(0, nowS - num(g.t)) : null;
  const gb = (id) => arr(g.bots).find((b) => isObj(b) && b.id === id) || null;
  const px = price(lite, null);
  for (const id of ['lit', 'atlas']) {
    const B = obj(obj(bf.bots)[id]), G = gb(id);
    if (!Object.keys(B).length && !G) continue;
    const row = { id, name: BOT_NAME[id], n: null, of: id === 'lit' ? 10 : 5, label: '', wait: '', dist: null, window: '', src: '', ageS: null, on: G ? G.on !== false : null, armed: G ? !!G.armed : null };
    const nx = obj(B.next);
    if (Object.keys(B).length && !B.err && (Object.keys(nx).length || arr(B.think).length)) {
      row.src = 'bf'; row.ageS = bfAge;
      const st = stepsOf(nx); if (st) { row.n = st[0]; row.of = st[1]; }
      row.label = str(nx.setup, 60); row.wait = str(nx.waiting_for, 140); row.dist = num(nx.dist_pts); row.window = str(nx.window, 30);
      if (num(nx.limit) !== null) row.plan = { limit: num(nx.limit), stop: num(nx.stop), target: num(nx.target) };
      if (row.n === null && G) { const s = stageN(G.stage); if (s) { row.n = s[0]; row.of = s[1]; } }
      row.think = str(arr(B.think)[0], 64);
    } else if (G) {
      row.src = 'glance'; row.ageS = gAge;
      if (id === 'lit') {
        const s = stageN(G.stage); if (s) { row.n = s[0]; row.of = s[1]; }
        row.label = s ? LIT_STAGE[Math.min(9, s[0] - 1)] : str(G.stage, 40);
      } else {
        const lobes = arr(G.lobes).filter(isObj);
        let best = -1, bl = null;
        for (const lo of lobes) { const i = ATLAS_STEP.indexOf(lo.st); if (i > best && lo.st !== 'done') { best = i; bl = lo; } }
        if (bl) { row.n = best + 1; row.of = 5; row.label = `${String(bl.id).toUpperCase()}: ${ATLAS_STEP[best]}`; }
        else if (lobes.length && lobes.every((x) => x.st === 'done')) { row.n = 5; row.of = 5; row.label = 'done for today'; }
        else if (lobes.length && lobes.every((x) => x.st === 'off' || x.st === 'done')) { row.n = 0; row.of = 5; row.label = 'outside its hours'; }
      }
      const trig = arr(G.arm).filter(isObj)[0];
      row.wait = str((trig && trig.trig) || G.wait || G.why, 140);
      const ax = arr(G.ax);
      if (num(ax[0]) !== null) { row.plan = { limit: num(ax[0]), stop: num(ax[1]), target: num(ax[2]) }; if (px) row.dist = Math.abs(px.px - num(ax[0])); }
      if (row.dist === null) { const lv = arr(G.lv).filter((x) => Array.isArray(x) && num(x[2]) !== null).sort((a, b) => Math.abs(a[2]) - Math.abs(b[2]))[0]; if (lv) { row.dist = Math.abs(num(lv[2])); row.distTo = str(lv[0], 30); } }
    }
    if (open && open.bot === id) { row.n = row.of === 10 ? 9 : 4; row.label = 'In trade'; row.wait = `${open.side} from ${pxTxt(open.entry)}: managing the stop and target.`; row.inTrade = true; }
    row.lvl = lvlOf(row.ageS);
    row.ageText = row.ageS === null ? 'age unknown' : `as of ${ago(row.ageS)}`;
    row.frac = row.n !== null && row.of ? Math.max(0, Math.min(1, row.n / row.of)) : 0;
    out.push(row);
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ today's trades + week / month per account
export function periods(lite, cards, nowS, list) {
  const L = obj(lite), today = cmeDay(nowS), wk = weekStart(today), mo = today.slice(0, 7);
  const tr = (list || trades(lite, null)).filter((t) => !t.open && num(t.usd) !== null);
  const rows = [];
  for (const c of arr(cards)) {
    const ids = IDS_OF[c.key] || [String(c.key)];
    const acc = arr(L.accounts).find((a) => isObj(a) && ids.includes(String(a.id)));
    const bd = c.key === 'atlas' ? obj(obj(L.board).atlas) : c.key === 'zlarior' ? obj(obj(L.board).lit) : {};
    const mine = tr.filter((t) => ids.includes(t.acct));
    const dayOf = (t) => cmeDay(t.xt || t.t);
    const sum = (f) => mine.filter(f).reduce((s, t) => s + t.usd, 0);
    const weekPc = num(obj(acc && acc.pnl).week) ?? num(bd.week_pnl);
    const weekT = sum((t) => dayOf(t) >= wk), monthT = sum((t) => dayOf(t).slice(0, 7) === mo);
    const nMonth = mine.filter((t) => dayOf(t).slice(0, 7) === mo).length;
    // the "at" block keeps each account's newest 4 trades: a month made of 4 known trades may hold more (shown as "at least")
    const full = mine.filter((t) => t.src === 'at').length >= 4 && mine.every((t) => dayOf(t).slice(0, 7) === mo);
    rows.push({ key: c.key, name: c.name, week: weekPc !== null && weekPc !== 0 ? weekPc : weekT, weekSrc: weekPc !== null && weekPc !== 0 ? 'pc' : 'trades',
      month: monthT, monthN: nMonth, monthPartial: full });
  }
  return rows;
}

// ------------------------------------------------------------------------------------------------ night-nq-live 2026-11-27: one card per account
const botOf = (acct, bot) => bot || (LIT_IDS.includes(acct) || acct === 'rapid' ? 'lit' : 'atlas');
/** where a price sits between the stop (0) and the target (1); null without both levels */
export function frac(p, stop, target) {
  const a = num(stop), b = num(target), v = num(p);
  if (a === null || b === null || v === null || a === b) return null;
  return (v - a) / (b - a);
}
/** one open-trade card per account: entry, stop, target, R, $ now, time in trade, the stop -> entry -> target bar with the price on it */
export function openCards(lite, bars, cards, nowS) {
  const rows = openRows(lite, bars, nowS), P = price(lite, bars), out = [];
  for (const r of rows) {
    if (out.some((c) => c.acct === r.acct)) continue;
    const bot = botOf(r.acct, r.bot), qty = num(r.qty), risk = num(r.stop) !== null ? Math.abs(r.entry - r.stop) : null;
    const pts = P ? (P.px - r.entry) * r.dir : null;
    const fNow = P ? frac(P.px, r.stop, r.target) : null, fIn = frac(r.entry, r.stop, r.target);
    out.push({ acct: r.acct, name: nameOf(r.acct, lite, cards), bot, botName: BOT_NAME[bot] || bot, side: r.dir === -1 ? 'SHORT' : 'LONG', dir: r.dir, qty,
      entry: r.entry, stop: num(r.stop), target: num(r.target), be: !!r.be, t: r.t, at: et(r.t) ? et(r.t).hm : '', inFor: Math.max(0, nowS - r.t),
      px: P ? P.px : null, pxAge: P ? Math.max(0, nowS - P.t) : null, pts, usd: pts !== null && qty ? pts * qty * PT_USD : null,
      r: pts !== null && risk ? pts / risk : r.pcR ?? null, riskUsd: risk !== null && qty ? risk * qty * PT_USD : null,
      targetUsd: num(r.target) !== null && qty ? Math.abs(r.target - r.entry) * qty * PT_USD : null,
      planR: risk && num(r.target) !== null ? Math.abs(r.target - r.entry) / risk : null,
      bar: fIn === null ? null : { entry: Math.max(0, Math.min(1, fIn)), now: fNow === null ? null : Math.max(0, Math.min(1, fNow)), over: fNow !== null && (fNow < 0 || fNow > 1) },
      lvl: P ? lvlOf(Math.max(0, nowS - P.t)) : 'bad', key: `${r.acct}|${r.t}` });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ the journal: the last 30 closed real trades
// fq.fc rows (engine/feed_fills): [bot, entry_t, dir, plan micros, filled micros, entry slip ticks, exit slip ticks, execution $, flags, L|S]
export function slipOf(lite, bot, t, dir) {
  const fc = arr(obj(obj(lite).fq).fc);
  const r = fc.find((x) => Array.isArray(x) && x[0] === bot && num(x[1]) !== null && Math.abs(num(x[1]) - t) <= 300 && (num(x[2]) === null || num(x[2]) === dir));
  if (!r) return null;
  const e = num(r[5]), x = num(r[6]);
  return { entry: e, exit: x, plan: num(r[3]), filled: num(r[4]), sim: r[9] === 'S',
    grade: e === null ? '' : e <= 1 ? 'clean' : e <= 4 ? 'ok' : 'poor' };
}
export const WHY = { TARGET: 'target', STOP: 'stop', BE: 'breakeven', TIME: 'time exit', EOD: 'end of day', TRAIL: 'trail', CUT: '15-min cut', KILL: 'kill switch' };
export function journal(lite, bars, cards, n = 30) {
  const list = trades(lite, bars).filter((t) => !t.open && num(t.usd) !== null && !HIDDEN.includes(t.acct));
  list.sort((a, b) => (b.xt || b.t) - (a.xt || a.t));
  return list.slice(0, n).map((t) => {
    const bot = botOf(t.acct), e = et(t.t), x = t.xt ? et(t.xt) : null;
    return { key: `${t.acct}|${t.t}`, acct: t.acct, name: nameOf(t.acct, lite, cards), bot, botName: BOT_NAME[bot] || bot, side: t.dir === -1 ? 'SHORT' : 'LONG',
      qty: t.qty, entry: t.entry, exit: t.exit ?? null, usd: t.usd, r: t.r, why: WHY[t.why] || (t.why ? t.why.toLowerCase() : ''),
      day: cmeDay(t.xt || t.t), at: e ? e.hm : '', xAt: x ? x.hm : '', held: t.xt ? Math.max(0, t.xt - t.t) : null, slip: slipOf(lite, bot, t.t, t.dir) };
  });
}
/** the run of results, newest first: { kind 'W' | 'L' | null, n, wins, losses, be, winRate, total } (a $0 trade is breakeven: it ends a run) */
export function streak(rows) {
  const R = arr(rows).filter((t) => num(t.usd) !== null);
  const sgn = (v) => (Math.round(v) > 0 ? 'W' : Math.round(v) < 0 ? 'L' : 'B');
  let kind = null, n = 0;
  for (const t of R) { const k = sgn(t.usd); if (k === 'B') break; if (kind === null) kind = k; if (k !== kind) break; n++; }
  const wins = R.filter((t) => sgn(t.usd) === 'W').length, losses = R.filter((t) => sgn(t.usd) === 'L').length;
  return { kind, n, wins, losses, be: R.length - wins - losses, winRate: wins + losses ? wins / (wins + losses) : null,
    total: R.reduce((s, t) => s + t.usd, 0), count: R.length };
}

// ------------------------------------------------------------------------------------------------ today's timeline (the CME session 18:00 -> 17:00 ET)
export const SESSION_S = 23 * 3600;
export function sessionStart(nowS) {
  const p = et(nowS); if (!p) return null;
  const mod = +p.hm.slice(0, 2) * 60 + +p.hm.slice(3, 5);
  const since = ((mod - 18 * 60) % 1440 + 1440) % 1440;              // minutes since the last 18:00 ET
  return Math.floor(nowS / 60) * 60 - since * 60;
}
export function timeline(rows, nowS) {
  const s0 = sessionStart(nowS); if (s0 === null) return null;
  const f = (t) => (num(t) === null ? null : Math.max(0, Math.min(1, (t - s0) / SESSION_S)));
  const pins = arr(rows).filter((t) => num(t.t) !== null && t.t >= s0 - 3600).map((t) => ({ key: t.key, name: t.name, side: t.side, open: !!t.open,
    x0: f(t.t), x1: t.open ? f(nowS) : f(t.xt ?? t.t), usd: t.usd ?? null }));
  // the windows the bots trade in (ET): London 02:00, NY 09:30, LIT's last entry 15:30, the 15:55 flat
  const at = (h, m) => { const mod = h * 60 + m; return f(s0 + (((mod - 18 * 60) % 1440 + 1440) % 1440) * 60); };
  return { start: s0, now: f(nowS), pins, marks: [{ x: at(2, 0), label: '02:00' }, { x: at(9, 30), label: '09:30' }, { x: at(15, 30), label: '15:30' }] };
}

// ------------------------------------------------------------------------------------------------ the screen
export function build(input) {
  const I = obj(input), nowS = num(I.nowS) || 0, lite = isObj(I.lite) ? I.lite : null, bars = isObj(I.bars) ? I.bars : null, cards = arr(I.cards);
  const H = health(lite, nowS);
  const open = lite || bars ? openTrade(lite, bars, cards, nowS) : null;
  const list = trades(lite, bars);
  const today = cmeDay(nowS);
  const todayRows = list.filter((t) => cmeDay(t.xt || t.t) === today || t.open).sort((a, b) => b.t - a.t).map((t) => ({
    acct: t.acct, name: nameOf(t.acct, lite, cards), side: t.dir === -1 ? 'SHORT' : 'LONG', qty: t.qty, entry: t.entry, exit: t.exit ?? null, usd: t.usd, r: t.r,
    why: t.why, open: !!t.open, at: et(t.t) ? et(t.t).hm : '', xAt: t.xt && et(t.xt) ? et(t.xt).hm : '', member: t.member || '',
    t: t.t, xt: t.xt ?? null, key: `${t.acct}|${t.t}`,
  })).filter((t) => !HIDDEN.includes(t.acct));
  const P = periods(lite, cards, nowS, list);
  const inTrade = new Set(open ? open.accounts.map((a) => a.id) : []);
  const accounts = cards.map((c) => {
    const ids = IDS_OF[c.key] || [String(c.key)], bots = arr(c.bots).filter((b) => b.name !== 'BLITZ');
    const st = bots.some((b) => b.state === 'armed') ? 'armed' : bots.some((b) => b.state === 'on') ? 'on' : bots.some((b) => b.state === 'off') ? 'off' : 'unknown';
    const p = P.find((x) => x.key === c.key) || {};
    return { key: c.key, name: c.name, stage: c.stage, state: st, stateText: { armed: 'ARMED', on: 'ON · not armed', off: 'OFF', unknown: 'not reported' }[st],
      today: c.today, todayLvl: c.todayLvl, balance: c.balance, balanceNote: c.balanceNote, room: c.room, roomOf: c.roomOf, roomFrac: c.roomFrac, roomLvl: c.roomLvl,
      goal: c.goal, ageText: c.ageText, ageLvl: c.has ? lvlOf(c.ageS) : 'bad', has: c.has, planned: c.planned, inTrade: ids.some((i) => inTrade.has(i)),
      week: p.week ?? null, month: p.month ?? null, monthN: p.monthN || 0, monthPartial: !!p.monthPartial, bots: bots.map((b) => b.name).join(' + ') };
  });
  const todayUsd = todayRows.filter((t) => !t.open && num(t.usd) !== null).reduce((s, t) => s + t.usd, 0);
  const J = journal(lite, bars, cards, 30);
  return { pc: H.pc, health: H, accounts, open, setups: setups(lite, nowS, open), today: todayRows, todayUsd, day: today,
    opens: lite || bars ? openCards(lite, bars, cards, nowS) : [], journal: J, streak: streak(J), timeline: timeline(todayRows, nowS),
    fills: !!(lite && isObj(lite.fq) && arr(lite.fq.fc).length),
    rich: { bf: !!(lite && isObj(lite.bf)), ck: !!(lite && isObj(lite.ck)), bars: !!bars } };
}
