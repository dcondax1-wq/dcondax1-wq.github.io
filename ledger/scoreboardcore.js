// LEDGER Scoreboard card core (ES module, no DOM, no network; 2026-11-13). The site's money/scoreboard.json (tools/money_scoreboard.py: every money
// source in one file, read-only) turned into the plain rows the Overview card shows: three tiles (week, month, all time), ROI on eval fees, the run-rate,
// the next milestone and its ETA, each source with its net, the paper results (never cash) and every source's status and age. Missing sources are listed
// as missing; nothing is invented. Pure, so tests/test_scoreboard_card.py runs it in node.

export const KIND = 'olympus-money-scoreboard';
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
export const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v, n) => (typeof v === 'string' ? v : '').replace(/\s+/g, ' ').trim().slice(0, n || 120);
/** whole dollars: $1,234 / -$5 / +$5 (signed) / '-' for nothing */
export function usd(v, signed) {
  const x = num(v); if (x == null) return '-';
  const a = Math.round(Math.abs(x)); if (a === 0) return '$0';
  return (x < 0 ? '-' : signed ? '+' : '') + '$' + a.toLocaleString('en-US');
}
export const tone = (x) => (num(x) == null || Math.abs(x) < 0.5 ? 'dim' : x > 0 ? 'pos' : 'neg');
const pl = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
/** the same words as olympus/truth.js ageWords */
export function ageWords(sec) {
  const s = Math.max(0, Math.floor(num(sec) || 0));
  if (s < 60) return 'less than a minute';
  if (s < 3600) return pl(Math.floor(s / 60), 'minute');
  if (s < 86400) { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return pl(h, 'hour') + (m ? ' ' + pl(m, 'minute') : ''); }
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600); return pl(d, 'day') + (h ? ' ' + pl(h, 'hour') : '');
}
export const ok = (sb) => isObj(sb) && sb.kind === KIND && isObj(sb.totals) && isObj(sb.totals.all);
const STATUS = { ok: ['ok', 'ok'], stale: ['old', 'warn'], missing: ['missing', 'bad'], bad: ['broken', 'bad'], private: ['private', 'info'], sample: ['sample', 'warn'], none: ['none yet', 'info'], off: ['not connected', 'info'] };

/** -> { ok: false, text } when there is no good file; else the card's rows. nowS = the phone's clock (epoch seconds) */
export function view(sb, nowS) {
  if (!ok(sb)) return { ok: false, text: 'The scoreboard is not on the site yet: the site build makes it (tools/money_scoreboard.py). Your own entries above still count.' };
  const now = num(nowS) != null ? nowS : Date.now() / 1000, T = sb.totals, w = isObj(T.week) ? T.week : {}, m = isObj(T.month) ? T.month : {}, a = T.all;
  const builtAge = num(sb.t) != null ? Math.max(0, now - sb.t) : null;
  // a source's age as the phone sees it now (its time), else the age the build wrote
  const ageOf = (s) => (num(s.t) != null ? ageWords(now - s.t) + ' ago' : str(s.age, 40) || 'never');
  const tiles = [
    { k: 'This week', v: usd(w.net, true), cls: tone(w.net), note: `in ${usd(w.cash_in)} · out ${usd(w.cash_out)}` },
    { k: 'This month', v: usd(m.net, true), cls: tone(m.net), note: `in ${usd(m.cash_in)} · out ${usd(m.cash_out)}` },
    { k: 'Net cash, all time', v: usd(a.net, true), cls: tone(a.net), note: `in ${usd(a.cash_in)} · out ${usd(a.cash_out)}${num(a.pending) ? ` · ${usd(a.pending)} requested, pending` : ''}` },
  ];
  const roi = isObj(sb.roi) ? sb.roi : {}, rr = isObj(sb.run_rate) ? sb.run_rate : {}, plan = isObj(rr.plan) ? rr.plan : null, nx = isObj(sb.next) ? sb.next : null;
  const rows = [
    ['ROI on eval fees', num(roi.pct) == null ? 'no fees yet' : `${roi.pct > 0 ? '+' : ''}${Math.round(roi.pct)}%`, num(roi.pct) == null ? 'dim' : tone(roi.pct)],
    ['Run-rate (real cash)', num(rr.cash_per_month) == null ? 'too early' : `${usd(rr.cash_per_month, true)} a month`, num(rr.cash_per_month) == null ? 'dim' : tone(rr.cash_per_month)],
    plan ? ['Plan estimate (not cash)', `${usd(plan.per_month)} a month`, 'dim'] : null,
    nx ? [`Next milestone ${usd(nx.usd)}`, `${usd(nx.left)} to go`, ''] : ['Milestones', 'all reached', 'pos'],
    nx ? ['ETA at the cash pace', isObj(nx.eta_cash) ? `${pl(nx.eta_cash.months, 'month')} (${str(nx.eta_cash.date, 10)})` : 'no date yet', isObj(nx.eta_cash) ? '' : 'dim'] : null,
    nx && isObj(nx.eta_plan) ? ['ETA at the plan estimate', `${pl(nx.eta_plan.months, 'month')} (${str(nx.eta_plan.date, 10)})`, 'dim'] : null,
  ].filter(Boolean);
  const bySource = arr(sb.by_source).filter(isObj).slice(0, 20).map((r) => [str(r.name, 70) || str(r.id, 40), usd(r.net, true), tone(r.net),
    r.paper && isObj(r.paper) ? str(r.paper.text, 140) : r.kind === 'kalshi' ? `this week ${usd(r.week, true)}` : '']);
  const paper = arr(sb.paper).filter(isObj).slice(0, 8).map((p) => [str(p.name, 70), usd(p.profit, true), tone(p.profit)]);
  const sources = arr(sb.sources).filter(isObj).slice(0, 12).map((s) => {
    const st = STATUS[s.status] || [str(s.status, 12) || 'unknown', 'info'];
    return { name: str(s.name, 60), status: st[0], chip: st[1], age: s.status === 'missing' ? 'not found' : ageOf(s), note: str(s.note, 200) };
  });
  const missing = arr(sb.missing).filter(isObj).map((x) => str(x.name, 60)).filter(Boolean);
  return {
    ok: true, tiles, rows, bySource, paper, sources,
    missing: missing.length ? `Missing: ${missing.join(', ')}. Nothing is made up for them.` : '',
    roiText: str(roi.text, 160), rateText: str(rr.text, 200), nextText: nx ? str(nx.text, 220) : 'Every milestone is reached.',
    foot: `Built ${builtAge == null ? 'at an unknown time' : ageWords(builtAge) + ' ago'} from ${sources.length} sources. Paper only: cash is money that really moved; paper P&L and estimates are never counted.`
      + (sb.ledger_included ? '' : ' Your PC ledger (data/money_ledger.json) is not in this public copy.'),
    stale: builtAge != null && builtAge > 36 * 3600,
  };
}
