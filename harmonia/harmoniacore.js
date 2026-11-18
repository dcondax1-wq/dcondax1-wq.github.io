// HARMONIA core (ES module, no DOM, no network): the balance. Where the owner's risk and income sit: the three NQ accounts (Zlarior / LIT, ATLAS, BLITZ) and the five money machines, from the published
// home.json and money/index.json. It says plainly when everything depends on the same signals (copies of a strategy win and lose together) and what is left per month if the NQ bots stop, with honest ranges.
// Pure, so tests/test_harmonia_page.py calls it in node. Every dollar is an ESTIMATE, never income. It only shows: it never trades or moves money. Paper only.

export const ACCOUNTS = {
  zlarior: { key: 'zlarior', name: 'Zlarior', bot: 'LIT', size: '50K', mll: 2000, risk: 425 },
  atlas: { key: 'atlas', name: 'ATLAS', bot: 'ATLAS', size: '25K', mll: 1000, risk: 150 },
  blitz: { key: 'blitz', name: 'BLITZ', bot: 'BLITZ', size: '25K', mll: 1000, risk: 120 },
};
export const ORDER = ['zlarior', 'atlas', 'blitz'];
// what each money machine's dollars depend on. 'nq' = the NQ bots' signals (prop-firm payouts are only paid when the NQ strategies make money).
export const STREAMS = {
  chrysos: { id: 'chrysos', name: 'Chrysos', role: 'Prop-firm eval and payouts', depends: 'nq', why: 'Payouts only come if the NQ bots keep making money.' },
  mercury: { id: 'mercury', name: 'Mercury', role: 'Deals on prop-firm fees and tools', depends: 'none', why: 'Savings found by watching prices: no trading needed.' },
  sibyl: { id: 'sibyl', name: 'Sibyl', role: 'Kalshi study (paper)', depends: 'kalshi', why: 'A different market (prediction markets), not NQ.' },
  oikos: { id: 'oikos', name: 'Oikos', role: 'Household money leaks', depends: 'none', why: 'Savings in the owner\'s own spending: no market at all.' },
  arbiter: { id: 'arbiter', name: 'Arbiter', role: 'Spread and funding ideas (paper)', depends: 'other', why: 'Crypto and rate spreads, not NQ.' },
};
export const SID = ['chrysos', 'mercury', 'sibyl', 'oikos', 'arbiter'];
export const LEVELS = { high: 70, mid: 40 };      // the share of the monthly estimate that depends on NQ: 70% and up is a strong warning, 40% and up a warning
export const COLORS = { nq: '#c8a24a', kalshi: '#4b7a99', none: '#7f8a52', other: '#9c6b3c' };

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
export const num = (v) => { const x = typeof v === 'string' ? parseFloat(v.replace(/[$,\s]/g, '')) : v; return typeof x === 'number' && Number.isFinite(x) ? x : null; };
const r2 = (x) => Math.round(x * 100) / 100;
const str = (v, n) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '').replace(/\s+/g, ' ').trim().slice(0, n || 160);
export function money(x) { const v = num(x); if (v == null) return '$0'; const a = Math.abs(Math.round(v)); return (v < 0 && a !== 0 ? '-' : '') + '$' + a.toLocaleString('en-US'); }
export const pct = (x) => Math.round((num(x) || 0) * 100) + '%';
export const drawdownLine = (room, mll) => `Drawdown left ${money(room)} of ${money(mll)} max loss`;
/** a range in words: a negative low end is said as a loss, never "-$42 to ..." */
export function rangeText(lo, hi) {
  if (num(lo) == null || num(hi) == null) return 'no range yet';
  return lo < 0 ? `a loss of ${money(-lo)} a month to ${money(hi)} a month` : `${money(lo)} to ${money(hi)} a month`;
}

// ------------------------------------------------------------------------------------------------ the accounts
export function matchKey(a) {
  if (!isObj(a)) return null;
  const s = [a.id, a.name, a.strategy, a.plan, a.source].map((x) => String(x || '')).join(' ').toLowerCase();
  if (/blitz|acct_c/.test(s)) return 'blitz';
  if (/atlas|acctb|acct_b/.test(s)) return 'atlas';
  if (/zlarior|mffu50k|50k|\blit\b/.test(s)) return 'zlarior';
  return null;
}
/** one account: the max loss it can lose (the risk budget), the drawdown left and the usual loss of one trade (1R) */
export function accountView(key, a) {
  const P = ACCOUNTS[key], base = { key, name: P.name, bot: P.bot, size: P.size, mll: P.mll, room: null, risk: P.risk, est: true, has: false };
  if (!isObj(a)) return base;
  const ev = isObj(a.eval) ? a.eval : isObj(a.funded_eval) ? a.funded_eval : a, st = isObj(a.stats) ? a.stats : {};
  const loss = num(st.avg_loss) || num(a.risk), mll = num(ev.mll) || P.mll, room = num(ev.room);
  return { ...base, has: true, mll, room: room == null ? null : Math.max(0, Math.min(mll, room)), risk: loss ? Math.abs(loss) : P.risk, est: !loss };
}
// hidden bots (owner 2026-11-15, dashboard_view.json, engine/hidden_bots.py): the real home.json says "hidden_bots" (top or
// board); a hidden BLITZ has no card (the DEMO keeps its three)
const hiddenIn = (h, k) => { const o = h && typeof h === 'object' ? h : {}, b = o.board && typeof o.board === 'object' ? o.board : {};
  const L = Array.isArray(o.hidden_bots) ? o.hidden_bots : Array.isArray(b.hidden_bots) ? b.hidden_bots : [];
  return L.map(String).includes(k); };
export function buildAccounts(home, fixture) {
  const list = isObj(home) && Array.isArray(home.accounts) ? home.accounts : [], found = {};
  for (const a of list) { const k = matchKey(a); if (k && !found[k] && !a.error) found[k] = a; }
  const real = Object.keys(found).length > 0, fx = isObj(fixture) && Array.isArray(fixture.accounts) ? fixture.accounts : [];
  return { demo: !real, accounts: ORDER.filter((k) => !(real && k === 'blitz' && hiddenIn(home, 'blitz'))).map((k) => (real ? accountView(k, found[k]) : accountView(k, fx.find((x) => x && x.key === k) || null))) };
}
/** the risk donut: every account's max loss as a share of all of them (the money that can be lost on the evals). Accounts with no numbers still count at their plan's max loss. */
export function riskSlices(accts) {
  const tot = accts.reduce((s, a) => s + a.mll, 0) || 1;
  return accts.map((a) => ({ key: a.key, name: `${a.name} ${a.size}`, bot: a.bot, usd: a.mll, share: a.mll / tot, room: a.room, line: a.room != null ? drawdownLine(a.room, a.mll) : `Max loss ${money(a.mll)} (no live numbers yet)`, trade: a.risk, est: a.est }));
}

// ------------------------------------------------------------------------------------------------ the money machines
/** the five streams from money/index.json (or the fixture): a stream with no number is kept at $0 and flagged, so the picture is always the five */
export function streamsOf(idx) {
  const rows = isObj(idx) && Array.isArray(idx.streams) ? idx.streams : [];
  return SID.map((id) => {
    const r = rows.find((x) => isObj(x) && x.id === id), M = STREAMS[id], um = r && isObj(r.usd_month) ? r.usd_month : {};
    const base = num(um.base), has = base != null;
    const low = num(um.low) != null ? um.low : has ? 0 : null, high = num(um.high) != null ? um.high : has ? base : null;
    return { id, name: M.name, role: M.role, depends: M.depends, nq: M.depends === 'nq', why: M.why, has, base: has ? Math.max(0, base) : 0, low: low == null ? 0 : low, high: high == null ? 0 : Math.max(high, has ? base : 0),
      status: r && ['ok', 'stale', 'sample'].includes(r.status) ? r.status : 'none' };
  });
}
export function incomeBars(streams) {
  const tot = streams.reduce((s, x) => s + x.base, 0);
  return { total: r2(tot), parts: streams.map((x) => ({ id: x.id, name: x.name, depends: x.depends, nq: x.nq, usd: x.base, share: tot ? x.base / tot : 0 })) };
}

/** concentration: how much of the monthly estimate depends on the NQ signals. { share, nqUsd, otherUsd, level: ok|warn|bad, title, text } */
export function concentration(streams, accts) {
  const nqUsd = streams.filter((s) => s.nq).reduce((s, x) => s + x.base, 0), tot = streams.reduce((s, x) => s + x.base, 0), otherUsd = tot - nqUsd;
  const share = tot > 0 ? nqUsd / tot : 0, n = accts.length;
  const level = !tot ? 'off' : share * 100 >= LEVELS.high ? 'bad' : share * 100 >= LEVELS.mid ? 'warn' : 'ok';
  const same = `All ${n} accounts trade NQ at the same hours, and copies of one strategy take the same signals, so they win and lose TOGETHER: ${n} accounts are not ${n} independent chances.`;
  let title, text;
  if (!tot) { title = 'No estimate to weigh yet'; text = 'The money machines have not reported a number. ' + same; }
  else if (level === 'ok') { title = `${pct(share)} of the estimate depends on NQ`; text = `${money(nqUsd)} of ${money(tot)} a month depends on the NQ bots; the rest comes from other places. ` + same; }
  else { title = `${pct(share)} of the estimate depends on the same NQ signals`; text = `${money(nqUsd)} of ${money(tot)} a month (an estimate) is paid only if the NQ bots keep winning. ${same} One bad stretch can hit every account at once.`; }
  return { share, nqUsd: r2(nqUsd), otherUsd: r2(otherUsd), total: r2(tot), level, title, text };
}

/** "if the NQ bots stop": the combined range now and what is left from the machines that do not depend on NQ. All $ a month, estimates. */
export function scenario(streams) {
  const sum = (f, k) => r2(streams.filter(f).reduce((s, x) => s + (x[k] || 0), 0));
  const now = { low: sum(() => true, 'low'), base: sum(() => true, 'base'), high: sum(() => true, 'high') };
  const left = { low: sum((x) => !x.nq, 'low'), base: sum((x) => !x.nq, 'base'), high: sum((x) => !x.nq, 'high') };
  const lost = { low: r2(now.low - left.low), base: r2(now.base - left.base), high: r2(now.high - left.high) };
  let text;
  if (!now.base) text = 'No estimate yet, so there is nothing to compare.';
  else text = `Estimate: today about ${money(now.base)} a month. If the NQ bots stop, about ${money(left.base)} a month is left (${rangeText(left.low, left.high)}). That is a drop of about ${money(lost.base)} a month, and the fees already paid do not come back.`;
  const worst = left.low <= 0 ? 'In the worst case nothing is left.' : `In the worst case ${money(left.low)} a month is left.`;
  return { now, left, lost, text, worst, keepShare: now.base ? left.base / now.base : 0 };
}

// ------------------------------------------------------------------------------------------------ pictures (pure geometry)
const pt = (cx, cy, r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
/** a donut arc as an SVG path: angles in radians from the top, clockwise. A full circle is split in two halves so the arc never collapses. */
export function arcPath(cx, cy, r0, r1, a0, a1) {
  if (a1 - a0 >= Math.PI * 2 - 1e-6) return arcPath(cx, cy, r0, r1, a0, a0 + Math.PI) + ' ' + arcPath(cx, cy, r0, r1, a0 + Math.PI, a0 + Math.PI * 2);
  const f = (v) => Math.round(v * 100) / 100, big = a1 - a0 > Math.PI ? 1 : 0, [x0, y0] = pt(cx, cy, r1, a0), [x1, y1] = pt(cx, cy, r1, a1), [x2, y2] = pt(cx, cy, r0, a1), [x3, y3] = pt(cx, cy, r0, a0);
  return `M${f(x0)} ${f(y0)} A${r1} ${r1} 0 ${big} 1 ${f(x1)} ${f(y1)} L${f(x2)} ${f(y2)} A${r0} ${r0} 0 ${big} 0 ${f(x3)} ${f(y3)} Z`;
}
/** slices [{share}] -> [{a0, a1}] with a small gap between them */
export function sliceAngles(slices, gap) {
  const g = num(gap) != null ? gap : 0.03, out = []; let a = 0;
  const n = slices.filter((s) => s.share > 0).length;
  for (const s of slices) { const span = s.share * Math.PI * 2; out.push(s.share > 0 ? { a0: a + (n > 1 ? g / 2 : 0), a1: a + span - (n > 1 ? g / 2 : 0) } : { a0: a, a1: a }); a += span; }
  return out;
}
/** the balance beam: NQ-dependent weight on the left pan, the rest on the right. tilt in radians (positive = the left side is down), at most 0.4; `stopped` empties the left pan. */
export function beam(streams, stopped) {
  const left = streams.filter((s) => s.nq).map((s) => ({ id: s.id, name: s.name, usd: stopped ? 0 : s.base })), right = streams.filter((s) => !s.nq).map((s) => ({ id: s.id, name: s.name, usd: s.base }));
  const L = left.reduce((s, x) => s + x.usd, 0), R = right.reduce((s, x) => s + x.usd, 0), tot = L + R;
  const tilt = tot > 0 ? Math.max(-0.4, Math.min(0.4, ((L - R) / tot) * 0.4)) : 0;
  return { left, right, L: r2(L), R: r2(R), tilt: Math.round(tilt * 1000) / 1000, level: tot ? (Math.abs(tilt) > 0.28 ? 'bad' : Math.abs(tilt) > 0.16 ? 'warn' : 'ok') : 'off' };
}
export function headline(c, sc) {
  if (!c.total) return 'No estimate to weigh yet: the money machines have not reported a number.';
  return `${pct(c.share)} of the estimated ${money(c.total)} a month depends on the NQ bots; if they stop, about ${money(sc.left.base)} a month is left.`;
}
export function jarvisCard(c, sc) {
  return { name: 'Harmonia', level: c.level === 'off' ? 'off' : c.level, nq: pct(c.share), left: money(sc.left.base), line: headline(c, sc) };
}
