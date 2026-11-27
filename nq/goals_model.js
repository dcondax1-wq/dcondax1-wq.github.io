// ONE goals model (night-nq-main 2026-11-27, QA #4 + lead: "every page reads 'to pass / to payout' from one place, the owner rule").
// Pure ES module, no DOM, no fetch: node-testable (tests/test_goals_model.py). Rules = docs/ACCOUNT_RULES.md (source research/lit/mffu_rules.json):
//   EVAL      pass at the plan's target above the start (Builder 50K +$3,000, Builder 25K +$1,500, Rapid EOD 25K +$1,500, Rapid EOD 50K +$3,000)
//   FUNDED    MFFU shows a sim-funded account FROM $0 (its profit); the owner's first payout goal = the MAX request above the buffer
//             (CLAUDE.md "First payout goal = the max request ($1,000 on a 25K at $2,100)"): Builder 25K $1,000 at $2,100, Builder 50K $2,000
//             at $4,100; Rapid EOD has no max: the bot keeps $500 above the $1,100 buffer and asks MFFU's $500 minimum ($500 at $2,100).
//             earliest = what MFFU allows first (buffer + its minimum): Builder 25K $1,350, Builder 50K $2,600, Rapid $1,600 (min + 0).
//   to you    the ask x the split (Builder 80%, Rapid 90%)
// API:
//   planOf(acct)                -> 'builder50k' | 'builder25k' | 'rapid25' | 'rapid50'
//   goal(acct)                  -> { kind: 'pass' | 'payout' | 'none', plan, start, profit, goalAt, left, frac, big, unit, ask, toYou,
//                                    earliestAt, earliestLeft, line, has }
//     acct = { key?, name?, plan?, stage: 'Eval' | 'Funded' (or status 'funded'), balance (NinjaTrader $25,401 or MFFU $401: both read right) }
//   usd(v)                      -> '$1,234'
// Never guesses a date: a date belongs to the forecast (research/forecast/forecast.json), not to this model.

export const PLANS = Object.freeze({
  builder50k: { label: 'Builder 50K', start: 50000, target: 3000, mll: 2000, buffer: 2100, payMin: 500, payMax: 2000, split: 0.8 },
  builder25k: { label: 'Builder 25K', start: 25000, target: 1500, mll: 1000, buffer: 1100, payMin: 250, payMax: 1000, split: 0.8 },
  rapid25: { label: 'Rapid EOD 25K', start: 25000, target: 1500, mll: 1000, buffer: 1100, payMin: 500, payMax: null, keep: 500, split: 0.9 },
  rapid50: { label: 'Rapid EOD 50K', start: 50000, target: 3000, mll: 2000, buffer: 2100, payMin: 500, payMax: null, keep: 1000, split: 0.9 },
});
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(+v) ? null : +v);
const r2 = (x) => Math.round(x * 100) / 100;
export const usd = (v) => { const n = num(v); return n === null ? '-' : (n < 0 ? '-' : '') + '$' + Math.round(Math.abs(n)).toLocaleString('en-US'); };

export function planOf(a) {
  const s = `${(a && a.plan) || ''} ${(a && a.name) || ''} ${(a && a.key) || ''}`.toLowerCase();
  const big = /50k|50 k|z50k|zlarior$|zlarior 50/.test(s) || (a && a.key === 'zlarior');
  if (/rapid/.test(s)) return /50k/.test(s) ? 'rapid50' : 'rapid25';
  return big && !/25k/.test(s) ? 'builder50k' : 'builder25k';
}
export function isFunded(a) { return !!a && /funded/i.test(`${a.stage || ''} ${a.status || ''}`); }

/** MFFU's own number for a funded account: its profit (a NinjaTrader balance above half the start is start + profit) */
export function profitOf(balance, start, funded) {
  const b = num(balance); if (b === null) return null;
  if (funded) return r2(b > start / 2 ? b - start : b);
  return r2(b - start);
}

export function goal(a) {
  const key = planOf(a), P = PLANS[key], funded = isFunded(a), bal = num(a && a.balance);
  const base = { plan: key, label: P.label, start: P.start, has: bal !== null };
  if (bal === null) {
    return { ...base, kind: 'none', profit: null, goalAt: funded ? null : P.target, left: null, frac: null, big: '-', unit: funded ? 'to payout' : 'to pass',
      ask: null, toYou: null, earliestAt: null, earliestLeft: null, line: 'No numbers from the PC yet.' };
  }
  const profit = profitOf(bal, P.start, funded);
  if (!funded) {
    const left = Math.max(0, r2(P.target - profit)), frac = Math.max(0, Math.min(1, profit / P.target));
    return { ...base, kind: 'pass', profit, goalAt: P.target, left, frac, big: left <= 0 ? 'Target reached' : usd(left), unit: left <= 0 ? '' : 'to pass',
      ask: null, toYou: null, earliestAt: null, earliestLeft: null,
      line: left <= 0 ? `Target of ${usd(P.target)} reached: stop this eval and ask MFFU for the funded account.`
        : `${usd(left)} more to the ${usd(P.target)} target (${usd(Math.max(0, profit))} made${profit < 0 ? `, ${usd(-profit)} below the start` : ''}).` };
  }
  const ask = P.payMax ?? P.payMin, goalAt = P.buffer + (P.keep || 0) + ask, earliestAt = P.buffer + (P.keep || 0) + P.payMin;
  const left = Math.max(0, r2(goalAt - profit)), earliestLeft = Math.max(0, r2(earliestAt - profit)), toYou = r2(ask * P.split);
  return { ...base, kind: 'payout', profit, goalAt, left, frac: Math.max(0, Math.min(1, profit / goalAt)), big: left <= 0 ? 'Ready' : usd(left),
    unit: left <= 0 ? '' : `to ${usd(goalAt)}`, ask, toYou, earliestAt, earliestLeft,
    line: `MFFU shows ${usd(profit)} of profit. Goal: ask ${usd(ask)} at ${usd(goalAt)} (${usd(toYou)} to you at ${Math.round(P.split * 100)}%)`
      + (left <= 0 ? ': ready to ask.' : `, ${usd(left)} to go.`)
      + (earliestAt < goalAt ? ` Earliest MFFU allows: ${usd(P.payMin)} at ${usd(earliestAt)}${earliestLeft > 0 ? ` (${usd(earliestLeft)} to go)` : ' (allowed now)'}.` : '') };
}
