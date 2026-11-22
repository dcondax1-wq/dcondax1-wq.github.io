// MONEY PIPELINE core (day-a11y 2026-11-22; owner: "see calls turn into dollars"). Pure: no DOM, no storage, no network.
// Sources, in this order: the PC's card (agency/pipeline.py, "ap" in the PC report: every caller + the CLEARED client money), else this
// phone's own caller log (agency.portal.v1: counts only, never $); trading payouts that reached you (home.json goals.money.payouts to_you);
// the owner's own entries (stored on this phone). Only cleared money counts toward the goal.
export const KEY = 'money.corvette.v1';
export const DEFAULT_TARGET = 70000;
const DIALS = ['called', 'voicemail', 'interested', 'booked', 'no', 'dnc', 'won'];
const TALKS = ['called', 'interested', 'booked', 'no', 'won', 'dnc'];
const num = (x) => (typeof x === 'number' && isFinite(x) ? x : 0);
export const usd = (n) => (n < 0 ? '-' : '') + '$' + Math.round(Math.abs(num(n))).toLocaleString('en-US');

export function fromLog(log) {
  const L = Array.isArray(log) ? log.filter((e) => e && typeof e === 'object' && e.id) : [];
  return { dials: L.filter((e) => DIALS.includes(e.k)).length, talks: L.filter((e) => TALKS.includes(e.k)).length,
    proposals: new Set(L.filter((e) => e.k === 'proposal').map((e) => e.id)).size, deposits: null, live: null, setup: null, mrr: null, cleared: null };
}
export function fromCard(card) {
  if (!card || card.kind !== 'agency-pipeline') return null;
  const o = {}; for (const k of ['dials', 'talks', 'proposals', 'deposits', 'live', 'sold', 'setup', 'mrr', 'cleared', 'month_in', 't']) o[k] = num(card[k]);
  return o;
}
export function tradingPayouts(home) {
  const p = home && home.goals && home.goals.money && Array.isArray(home.goals.money.payouts) ? home.goals.money.payouts : [];
  return p.reduce((s, x) => s + num(x && (x.to_you != null ? x.to_you : 0)), 0);
}
// the five steps, each with the share of the step before
export function funnel(c) {
  const steps = [['Dials', c.dials], ['Talks', c.talks], ['Proposals sent', c.proposals], ['Deposits', c.deposits], ['Live sites', c.live]];
  return steps.map(([label, v], i) => {
    const prev = i ? steps[i - 1][1] : null;
    return { label, v, rate: v != null && prev ? Math.round((v / prev) * 100) : null };
  });
}
// the goal: website money that CLEARED + trading payouts that reached you + your own entries (each one cleared by your word)
export function loadGoal(text) {
  let j = null; try { j = JSON.parse(text || 'null'); } catch (e) { j = null; }
  const t = j && num(j.target) >= 1000 && num(j.target) <= 10000000 ? Math.round(j.target) : DEFAULT_TARGET;
  const manual = j && Array.isArray(j.manual) ? j.manual.filter((m) => m && num(m.amount) > 0 && num(m.amount) < 1e7 && ['website', 'trading', 'other'].includes(m.src)) : [];
  return { v: 1, name: j && typeof j.name === 'string' && j.name.trim() ? j.name.trim().slice(0, 40) : 'Corvette fund', target: t, manual };
}
export function goal(g, website, trading) {
  const mine = g.manual.reduce((s, m) => s + num(m.amount), 0), have = num(website) + num(trading) + mine;
  const pct = Math.max(0, Math.min(100, (have / g.target) * 100));
  return { have, mine, website: num(website), trading: num(trading), target: g.target, pct: Math.round(pct * 10) / 10, left: Math.max(0, g.target - have) };
}
export function addManual(g, amount, src, nowMs) {
  const a = Math.round(Number(amount) * 100) / 100;
  if (!(a > 0 && a < 1e7)) return { error: 'Type an amount in dollars.' };
  if (!['website', 'trading', 'other'].includes(src)) return { error: 'Pick where it came from.' };
  g.manual.push({ amount: a, src, t: nowMs }); return { ok: true };
}
