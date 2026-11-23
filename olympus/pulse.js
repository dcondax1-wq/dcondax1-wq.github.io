// OLYMPUS PULSE (day-arenas 2026-11-20, owner: "a whole revamp ... add a ton inside the dashboards"). ONE kit for the dense cards a prop
// trader checks on a phone, shared by the main apps (Aegis, Demeter, Fates, Hera, Ledger, Business, Journal, Helios, Compass):
//   strip     three numbers at the top: Today $ (all real accounts), Drawdown left (the tightest account), To pass (the nearest eval)
//   hero:<k>  one big headline number, k = room | today | pass | payout | net | last
//   accounts  one row per real account: today $, drawdown left, $ to pass or what the payout still needs
//   bots      what each bot is waiting for right now (window open / closed, in a trade)
//   stats     streak and last trade (real + paper), win rate by setup and by weekday (2026 replay when real trades are too few: said so)
//   money     next payout ($ and when), fees paid vs payouts received (this phone's Ledger, else the price list), net
// Data: ../home.json through olympus/truth.js (the PC's own status over the cloud copy), ../trading/trades.json, ../ledger/rules.json and
// this phone's Ledger (localStorage 'ledger.v1', read only). Never sends anything, never places or arms anything. Text only via textContent.
// Pure part (model(), the formatters) runs in node: tests/test_pulse.py. mount() is the DOM part:
//   <section class="pulse" data-pulse="strip,accounts,stats" data-pulse-app="aegis"></section>   + <script type="module" src="../olympus/pulse.js">
// The markup reserves each part's height in pulse.css before data arrives, so filling it in moves nothing (CLS 0).
import * as T from './truth.js';
import '../age.js';
import '../pc_feed.js?v=n8';      // MFFU's own view of an account (PC_FEED.mffuView: a sim-funded account shows balance = profit, day-archive 2026-11-20)          // the site's one data-age format (root age.js, DATA TRUTH) (window.OLY_AGE: "updated 4 min ago", amber / red per kind)

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const num = T.num;
export const usd = (v) => (num(v) == null ? '-' : T.money(v));
export const usdS = (v) => (num(v) == null ? '-' : (v > 0.5 ? '+' : '') + T.money(v));
export const pct = (x) => (num(x) == null ? '-' : Math.round(x * 100) + '%');
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dayWord = (d) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${MON[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}` : '');
const dowOf = (d) => new Date(d + 'T12:00:00Z').getUTCDay();
// MFFU Builder payout rules (ledger/rules.json plans; the same numbers as business/payoutcoach.js), used when rules.json is missing
const PAY = { '50K': { buffer: 2100, min: 500, max: 2000, split: 0.8, price: 91.8 }, '25K': { buffer: 1100, min: 250, max: 1000, split: 0.8, price: 63 } };

/** the real accounts (no paper BLITZ, no cloud twin): Zlarior, ATLAS and the PC's others, in that order */
export function accountsList(home) {
  if (!isObj(home)) return [];
  const A = T.accountsOf(home), out = [];
  for (const k of ['lit', 'atlas']) if (A[k] && A[k].has) out.push(A[k]);
  for (const x of T.extraOf(home)) out.push(x);
  return out;
}

function payPlan(size, rules) {
  const p = isObj(rules) && isObj(rules.plans) ? rules.plans[size === '50K' ? 'builder_50k' : 'builder_25k'] : null;
  const d = PAY[size] || PAY['25K'];
  const py = p && isObj(p.payout) ? p.payout : {};
  return { buffer: num(py.buffer) ?? d.buffer, min: num(py.min) ?? d.min, max: num(py.max) ?? d.max, split: num(py.split) ?? d.split, price: num(p && p.price_owner) ?? d.price };
}

/** a funded account's payout: what it can ask for now, or what it still needs */
export function payoutOf(a, rules) {
  // day-archive 2026-11-20: in MFFU's own terms (PC_FEED.mffuView): a sim-funded account starts at $0, so the payout lines are profit
  // levels (25K: earliest $250 at $1,350, goal $1,000 at $2,100). The site's rules.json still sets buffer / min / max / split.
  const P = payPlan(a.size, rules), V = mffu(a);
  if (!V || V.balance == null) return null;
  const b = V.balance, line = P.buffer, over = b - line;
  const goal = { ask: P.max, at: line + P.max, toYou: Math.round(P.max * P.split), need: Math.max(0, Math.ceil(line + P.max - b)) };
  if (over >= P.min) { const ask = Math.min(P.max, Math.floor(over)); return { ready: true, ask, toYou: Math.round(ask * P.split), need: 0, line, min: P.min, goal, balance: b }; }
  return { ready: false, ask: 0, toYou: 0, need: Math.max(0, Math.ceil(line + P.min - b)), line: line + P.min, min: P.min, goal, balance: b };
}
/** MFFU's view of an account row (balance / floor as MFFU's screen shows them); the row itself when the helper is not there */
export function mffu(a) {
  const F = globalThis.PC_FEED, kind = a && (a.kind === 'funded' ? 'funded' : a.kind);
  const v = F && typeof F.mffuView === 'function' ? F.mffuView({ ...a, kind }) : null;
  return v || (a ? { funded: a.kind === 'funded', balance: num(a.balance) != null && num(a.start) != null && a.kind === 'funded' ? num(a.balance) - num(a.start) : num(a.balance), floor: num(a.floor) } : null);
}

/** trades.json -> streak, last trade, win rate by setup and weekday. Real = live + paper; the replay fills in when real trades are too few */
export function tradeStats(trades) {
  const list = (isObj(trades) && Array.isArray(trades.trades) ? trades.trades : Array.isArray(trades) ? trades : []).filter((t) => isObj(t) && num(t.usd) != null && typeof t.day === 'string');
  const real = list.filter((t) => t.src === 'live' || t.src === 'paper').sort((a, b) => (num(a.t) || 0) - (num(b.t) || 0));
  const live = real.filter((t) => t.src === 'live');
  const last = (live.length ? live : real).slice(-1)[0] || null;
  let streak = null;
  if (real.length) {
    const sgn = (t) => (t.usd > 0.5 ? 1 : t.usd < -0.5 ? -1 : 0), s0 = sgn(real[real.length - 1]); let n = 0;
    for (let i = real.length - 1; i >= 0 && sgn(real[i]) === s0; i--) n++;
    streak = { n, kind: s0 > 0 ? 'win' : s0 < 0 ? 'loss' : 'flat' };
  }
  const useReal = real.length >= 20, base = useReal ? real : list.filter((t) => t.src === 'backtest' && t.day >= '2026-01-01');
  const group = (keyOf) => {
    const g = {};
    for (const t of base) { const k = keyOf(t); if (!k) continue; const o = (g[k] = g[k] || { key: k, n: 0, wins: 0, usd: 0 }); o.n++; if (t.usd > 0.5) o.wins++; o.usd += t.usd; }
    return Object.values(g).map((o) => ({ ...o, usd: Math.round(o.usd), win: o.n ? o.wins / o.n : null }));
  };
  const setupName = (t) => `${t.bot || 'Bot'} ${t.m || (t.bot === 'LIT' ? 'sweep' : '')}`.trim();
  const bySetup = group(setupName).filter((o) => o.n >= 5).sort((a, b) => b.win - a.win || b.n - a.n);
  const byDow = [1, 2, 3, 4, 5].map((d) => { const o = group((t) => (dowOf(t.day) === d ? DOW[d] : null))[0]; return o || { key: DOW[d], n: 0, wins: 0, usd: 0, win: null }; });
  const allWin = base.length ? base.filter((t) => t.usd > 0.5).length / base.length : null;
  return { nReal: real.length, nLive: live.length, last, streak, bySetup, byDow, allWin, nBase: base.length, basis: useReal ? 'real + paper trades' : '2026 replay, not money made' };
}

/** Ledger (this phone) -> fees paid and payouts received; the price list when the Ledger is empty */
export function feesOf(ledgerRaw, rules, accts) {
  let entries = [];
  try { const s = typeof ledgerRaw === 'string' ? JSON.parse(ledgerRaw) : ledgerRaw; if (isObj(s) && Array.isArray(s.entries)) entries = s.entries; } catch (e) { entries = []; }
  const sum = (kinds) => Math.round(entries.filter((e) => isObj(e) && kinds.includes(e.kind) && num(e.amount) != null).reduce((s, e) => s + Math.abs(num(e.amount)), 0) * 100) / 100;
  let fees = sum(['fee', 'reset', 'activation']), payouts = sum(['payout_in']), src = 'your Ledger';
  if (!entries.length) {
    src = 'price list (add yours in Ledger)';
    const R = isObj(rules) && isObj(rules.accounts) ? Object.values(rules.accounts).filter(isObj) : [];
    fees = R.reduce((s, r) => s + (num(r.price) || 0), 0);
    const listed = R.length;
    for (const a of (accts || []).slice(listed)) fees += payPlan(a.size, rules).price;     // an account the price list does not have yet (25K #2)
    fees = Math.round(fees * 100) / 100; payouts = 0;
  }
  return { fees, payouts, net: Math.round((payouts - fees) * 100) / 100, src, n: entries.length };
}

/** what each bot is waiting for (home.board), plain words */
export function botsOf(home, nowS) {
  const b = isObj(home) && isObj(home.board) ? home.board : {}, out = [];
  const winText = (w, ws) => {
    if (isObj(w) && w.open) return w.text || 'window open';
    const nx = (Array.isArray(ws) ? ws : []).find((x) => isObj(x) && num(x.open_t) != null && x.open_t > nowS);
    return nx ? `next window ${nx.label || ''}`.trim() : 'window closed';
  };
  const pos = (p) => (isObj(p) ? `in a trade: ${String(p.side || '').toLowerCase()} ${p.qty || p.micros || ''} micros`.replace(/\s+/g, ' ').trim() : '');
  if (isObj(b.lit)) out.push({ key: 'lit', name: 'Zlarior · LIT', text: pos(b.lit.position) || b.lit.waiting || winText(b.lit.window, b.lit.windows), open: !!(isObj(b.lit.window) && b.lit.window.open), busy: !!b.lit.position });
  if (isObj(b.atlas)) {
    const m = Array.isArray(b.atlas.members) ? b.atlas.members.filter(isObj) : [];
    const openM = m.filter((x) => isObj(x.window) && x.window.open).map((x) => x.short).filter(Boolean);
    const t = pos(b.atlas.position) || b.atlas.waiting || (openM.length ? `${openM.join(' · ')} watching` : m.length ? winText(m[0].window, m[0].windows) : 'not set up');
    out.push({ key: 'atlas', name: 'ATLAS · EMA · MACD · S/R', text: t, open: openM.length > 0 && !/outside|closed|not set up/i.test(t), busy: !!b.atlas.position });
  }
  return out;
}

/** everything the parts show, from the raw files. Never throws. */
export function model(inp, nowS) {
  const now = num(nowS) ?? Date.now() / 1000, i = isObj(inp) ? inp : {};
  const home = i.home, accts = accountsList(home), rules = i.rules;
  const real = accts.filter((a) => a.room != null || a.balance != null);
  const today = real.length ? Math.round(real.reduce((s, a) => s + (num(a.today) || 0), 0) * 100) / 100 : null;
  const tight = real.filter((a) => a.room != null).sort((a, b) => a.room / (a.mll || 1) - b.room / (b.mll || 1))[0] || null;
  const evals = real.filter((a) => a.kind === 'eval' && num(a.toTarget) != null).sort((a, b) => a.toTarget - b.toTarget);
  const funded = real.filter((a) => a.kind === 'funded').map((a) => ({ a, p: payoutOf(a, rules) })).filter((x) => x.p);
  const pay = funded.sort((x, y) => (y.p.ready - x.p.ready) || x.p.need - y.p.need)[0] || null;
  const ages = isObj(home) ? T.agesOf(home, now) : null;
  return { accts: real, today, tight, pass: evals[0] || null, pay, bots: botsOf(home, now), stats: tradeStats(i.trades), fees: feesOf(i.ledger, rules, real), ages, has: real.length > 0 };
}

/** the headline for a hero kind: { label, value, sub, tone } */
export function hero(m, kind) {
  const nm = (a) => `${a.name}${a.size && !String(a.name).includes(a.size) ? ' ' + a.size : ''}`;
  if (kind === 'today') return { label: 'Today, every real account', value: m.today == null ? '-' : usdS(m.today), tone: m.today > 0 ? 'good' : m.today < 0 ? 'bad' : '', sub: `${m.accts.length} accounts · ${m.ages ? m.ages.pc.text : 'no PC report yet'}` };
  if (kind === 'pass') { const a = m.pass; return a ? { label: `To pass · ${nm(a)}`, value: usd(Math.max(0, a.toTarget)), tone: '', sub: `of the ${usd(a.target)} target · drawdown left ${usd(a.room)}` } : { label: 'To pass', value: '-', sub: 'No eval running', tone: '' }; }
  if (kind === 'payout') { const x = m.pay; return x ? (x.p.ready ? { label: `Payout ready · ${nm(x.a)}`, value: usd(x.p.ask), tone: 'good', sub: `about ${usd(x.p.toYou)} to you after the 80% split` } : { label: `Payout goal · ${nm(x.a)}`, value: `${usd(x.p.goal.need)} to go`, tone: '', sub: `Goal ${usd(x.p.goal.ask)} at ${usd(x.p.goal.at)} · earliest ${usd(x.p.min)} at ${usd(x.p.line)}` }) : { label: 'Next payout', value: '-', sub: 'Payouts start once an eval passes', tone: '' }; }
  if (kind === 'net') return { label: 'Net: payouts minus fees', value: usdS(m.fees.net), tone: m.fees.net >= 0 ? 'good' : 'bad', sub: `fees ${usd(m.fees.fees)} · payouts ${usd(m.fees.payouts)} · from ${m.fees.src}` };
  if (kind === 'last') { const t = m.stats.last; return t ? { label: `Last trade · ${t.src === 'live' ? 'real' : 'paper'}`, value: usdS(t.usd), tone: t.usd > 0 ? 'good' : t.usd < 0 ? 'bad' : '', sub: `${dayWord(t.day)} ${t.hm || ''} · ${t.bot} ${String(t.side || '').toLowerCase()} · ${t.k || ''}`.replace(/\s+/g, ' ') } : { label: 'Last trade', value: '-', sub: 'No trade yet', tone: '' }; }
  const a = m.tight;   // room
  return a ? { label: `Drawdown left · ${nm(a)} (tightest)`, value: usd(a.room), tone: a.room / a.mll < 0.35 ? 'bad' : a.room / a.mll < 0.6 ? 'warn' : 'good', sub: `of ${usd(a.mll)} max loss · balance ${usd(mffu(a) ? mffu(a).balance : a.balance)}` } : { label: 'Drawdown left', value: '-', sub: 'No account numbers yet', tone: '' };
}

// ------------------------------------------------------------------------------------------------ DOM
const LINKS = { accounts: '../aegis/', bots: '../nq/', stats: '../journal/', money: '../ledger/', strip: '../demeter/' };
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function head(title, app, part) {
  const h = el('div', 'pu-head'); h.appendChild(el('h2', 'pu-title', title));
  const href = LINKS[part]; if (href && !href.includes(`/${app}/`)) { const a = el('a', 'pu-more', 'Open ›'); a.href = href; a.setAttribute('data-oly-cue', 'open'); h.appendChild(a); }
  return h;
}
function tile(label, value, sub, tone) {
  const t = el('div', 'pu-tile'); t.appendChild(el('span', 'pu-tl', label)); const v = el('span', 'pu-tv' + (tone ? ' ' + tone : ''), value); t.appendChild(v); if (sub != null) t.appendChild(el('span', 'pu-ts', sub)); return t;
}
const label = (a) => (a ? `${a.name}${a.size && !String(a.name).includes(a.size) ? ' ' + a.size : ''}` : '');
const toneOf = (v) => (v > 0.5 ? 'good' : v < -0.5 ? 'bad' : '');

export function render(root, m, parts, app) {
  root.replaceChildren();
  for (const raw of parts) {
    const [part, arg] = raw.split(':');
    const box = el('div', `pu-part pu-${part}`); box.dataset.part = part;
    if (part === 'strip') {
      const r = m.tight, p = m.pass;
      box.append(tile('Today', m.today == null ? '-' : usdS(m.today), 'all accounts', toneOf(m.today)),
        tile('Drawdown left', r ? usd(r.room) : '-', label(r), r && r.room / r.mll < 0.35 ? 'bad' : ''),
        tile('To pass', p ? usd(Math.max(0, p.toTarget)) : '-', p ? label(p) : 'no eval'));
    } else if (part === 'hero') {
      const h = hero(m, arg || 'room');
      box.append(el('p', 'pu-hl', h.label), el('p', 'pu-hv ag-num' + (h.tone ? ' ' + h.tone : ''), h.value), el('p', 'pu-hs', h.sub));
    } else if (part === 'accounts') {
      box.appendChild(head('Every account', app, part));
      const ul = el('ul', 'pu-list');
      for (const a of m.accts.slice(0, 3)) {
        const li = el('li', 'pu-row'), main = el('div', 'pu-rm');
        const nm = el('span', 'pu-rt', `${a.name}${String(a.name).includes(a.size) ? '' : ' ' + a.size} `); nm.appendChild(el('span', 'pu-badge ' + a.kind, a.kind === 'funded' ? 'Funded' : 'Eval')); main.appendChild(nm);
        const pay = a.kind === 'funded' ? payoutOf(a, m._rules) : null;
        main.appendChild(el('span', 'pu-rs', `Room ${usd(a.room)} of ${usd(a.mll)} · ${a.kind === 'funded' ? (pay ? (pay.ready ? `payout ready ${usd(pay.ask)}` : `payout goal ${usd(pay.goal.need)} to go`) : 'funded') : `${usd(Math.max(0, a.toTarget || 0))} to pass`}`));
        li.append(main, el('span', 'pu-re ' + toneOf(a.today), usdS(a.today || 0)));
        ul.appendChild(li);
      }
      if (!m.accts.length) ul.appendChild(el('li', 'pu-row pu-empty', 'No account numbers yet: the PC has not reported.'));
      box.appendChild(ul);
    } else if (part === 'bots') {
      box.appendChild(head('What each bot is waiting for', app, part));
      const ul = el('ul', 'pu-list');
      for (const b of m.bots.slice(0, 2)) { const li = el('li', 'pu-row'), main = el('div', 'pu-rm'); main.append(el('span', 'pu-rt', b.name), el('span', 'pu-rs', b.text)); li.append(main, el('span', 'pu-dot ' + (b.busy ? 'busy' : b.open ? 'on' : 'off'), b.busy ? 'In trade' : b.open ? 'Watching' : 'Closed')); ul.appendChild(li); }
      if (!m.bots.length) ul.appendChild(el('li', 'pu-row pu-empty', 'No bot status in the feed yet.'));
      box.appendChild(ul);
    } else if (part === 'stats') {
      const S = m.stats; box.appendChild(head('Trades: streak, setups, weekdays', app, part));
      const g = el('div', 'pu-grid');
      const best = S.bySetup[0], worst = S.bySetup[S.bySetup.length - 1];
      g.append(tile('Streak', S.streak ? `${S.streak.n} ${S.streak.kind}${S.streak.n > 1 ? (S.streak.kind === 'loss' ? 'es' : 's') : ''}` : '-', `${S.nReal} real + paper trades`, S.streak ? (S.streak.kind === 'win' ? 'good' : S.streak.kind === 'loss' ? 'bad' : '') : ''),
        tile('Last trade', S.last ? usdS(S.last.usd) : '-', S.last ? `${dayWord(S.last.day)} · ${S.last.bot} · ${S.last.src === 'live' ? 'real' : 'paper'}` : 'none yet', S.last ? toneOf(S.last.usd) : ''),
        tile('Best setup', best ? pct(best.win) : '-', best ? `${best.key} · ${best.n} trades` : 'not enough trades', 'good'),
        tile('Weakest setup', worst && worst !== best ? pct(worst.win) : '-', worst && worst !== best ? `${worst.key} · ${worst.n} trades` : '-'));
      box.appendChild(g);
      const bars = el('div', 'pu-bars'); bars.setAttribute('role', 'img');
      bars.setAttribute('aria-label', 'Win rate by weekday: ' + S.byDow.map((d) => `${d.key} ${pct(d.win)}`).join(', '));
      const topWin = Math.max(0.01, ...S.byDow.map((d) => d.win || 0));
      for (const d of S.byDow) { const c = el('div', 'pu-bar'); const i = el('i'); i.style.height = `${Math.round(((d.win || 0) / topWin) * 100)}%`; c.append(el('span', 'pu-bv', pct(d.win)), i, el('span', 'pu-bk', d.key)); bars.appendChild(c); }
      box.append(bars, el('p', 'pu-note', `Win rate by weekday and setup: ${S.basis} (${S.nBase} trades).`));
    } else if (part === 'money') {
      box.appendChild(head('Payouts and fees', app, part));
      const g = el('div', 'pu-grid'), x = m.pay, F = m.fees;
      g.append(tile('Payout goal', x ? (x.p.ready ? usd(x.p.ask) : `${usd(x.p.goal.need)} to go`) : '-', x ? (x.p.ready ? `ready now · ${x.a.name}` : `Goal ${usd(x.p.goal.ask)} at ${usd(x.p.goal.at)} · earliest ${usd(x.p.min)} at ${usd(x.p.line)}`) : 'after an eval passes', x && x.p.ready ? 'good' : ''),
        tile('To you', x && x.p.ready ? usd(x.p.toYou) : '-', '80% split, before tax'),
        tile('Fees paid', usd(F.fees), F.src, 'bad'),
        tile('Net so far', usdS(F.net), `payouts ${usd(F.payouts)}`, toneOf(F.net)));
      box.appendChild(g);
    } else continue;
    root.appendChild(box);
  }
  if (m.ages && parts.some((p) => /^(accounts|bots)/.test(p))) {
    // one age format everywhere (the root age.js): the chip says how old the PC's numbers are, amber after a missed report, red after an hour
    const A = typeof window !== 'undefined' ? window.OLY_AGE : globalThis.OLY_AGE, p = el('p', 'pu-note pu-age');
    if (A) { p.appendChild(A.chip(el('span'), m.ages.pc.age, 'pc')); p.appendChild(document.createTextNode(` PC report${m.ages.cloud.t != null ? ' · cloud copy ' + m.ages.cloud.words + ' old' : ''}`)); }
    else p.textContent = m.ages.line;
    root.appendChild(p);
  }
}

async function getJSON(u) { try { const r = await fetch(u, { cache: 'no-cache' }); return r.ok ? await r.json() : null; } catch (e) { return null; } }
const base = new URL('../', import.meta.url).href;
let loadP = null;
/** the files, once per page (several mounts share them) */
export function load(force) {
  if (!loadP || force) {
    loadP = (async () => {
      const [home, trades, rules] = await Promise.all([getJSON(base + 'home.json'), getJSON(base + 'trading/trades.json'), getJSON(base + 'ledger/rules.json')]);
      let ledger = null; try { ledger = localStorage.getItem('ledger.v1'); } catch (e) { ledger = null; }
      const live = home ? await T.withPcFeed(home) : null;
      return { home: live, trades, rules, ledger };
    })();
  }
  return loadP;
}
export async function mountAll(force) {
  if (typeof document === 'undefined') return;
  const roots = Array.from(document.querySelectorAll('[data-pulse]'));
  if (!roots.length) return;
  const inp = await load(force), m = model(inp); m._rules = inp.rules;
  // remember how old the numbers were (Settings > Data, settings/extras.js, reads it offline; nothing else is kept)
  try { if (m.ages) localStorage.setItem('olympus.pulse.ages', JSON.stringify({ pcT: m.ages.pc.t, cloudT: m.ages.cloud.t, seen: Math.round(Date.now() / 1000) })); } catch (e) { /* private mode */ }
  for (const r of roots) {
    try { render(r, m, String(r.dataset.pulse).split(',').map((s) => s.trim()).filter(Boolean), r.dataset.pulseApp || ''); r.classList.add('ready'); r.removeAttribute('aria-busy'); }
    catch (e) { r.classList.add('ready'); }
  }
  if (typeof window !== 'undefined') window.OLYMPUS_PULSE = { model: m, mountAll };
}
// subtle UI sounds (owner 2026-11-20): every button / tab / segment on a page with a pulse mount gives the kit's soft 'tap' cue through
// OLYMPUS.cue, so the Settings Sound switch, LITE, reduced motion and the iPhone ringer switch all still decide (silent before the first tap)
export function wireCues(doc) {
  doc.addEventListener('click', (e) => {
    try {
      const t = e.target && e.target.closest && e.target.closest('button, [role="tab"], [role="radio"], summary, a.pu-more, .seg > *');
      if (!t || t.closest('[data-oly-cue]') || t.disabled) return;
      const O = window.OLYMPUS; if (O && typeof O.cue === 'function') O.cue('tap');
    } catch (x) { /* no sound kit on this page */ }
  }, { passive: true });
}
if (typeof document !== 'undefined') {
  if (document.querySelector('[data-pulse]')) wireCues(document);
  const go = () => mountAll().catch(() => {});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, { once: true }); else go();
  let hid = 0;
  document.addEventListener('visibilitychange', () => { if (document.hidden) hid = Date.now(); else if (hid && Date.now() - hid > 60000) mountAll(true).catch(() => {}); });
}
