// SIBYL core (ES module, no DOM, no network): the prediction-market edge scanner's page logic. It reads ONE file the scanner wrote (money/sibyl.json, contract in docs/NIGHT_BRIEF.md) or the DEMO fixture.
// SUGGESTIONS ONLY: nothing here places, changes or stops a bet. Pure, so the tests call it in node.
// Money words: a Kalshi account is small, so dollars show cents ($3.41). 1R = the paper stake of the pick, so every dollar has an R next to it.

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
export const num = (v) => { const x = typeof v === 'string' ? parseFloat(v.replace(/[$,\s]/g, '')) : v; return typeof x === 'number' && Number.isFinite(x) ? x : null; };
const r2 = (x) => Math.round(x * 100) / 100;
export const str = (v, n) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '').replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n || 200);
export function usd(x) { const v = num(x); if (v == null) return '$0.00'; const a = Math.abs(v); return (v < 0 && Math.round(a * 100) !== 0 ? '-' : '') + '$' + a.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
export function usdS(x) { const v = num(x); if (v == null) return '$0.00'; const m = usd(v); return v > 0 && Math.round(v * 100) !== 0 ? '+' + m : m; }
export function rWord(usdv, risk) { const u = num(usdv), k = num(risk); if (u == null || !k || k <= 0) return '0.0R'; const r = Math.round((u / k) * 10) / 10; return (r > 0 ? '+' : r < 0 ? '-' : '') + Math.abs(r).toFixed(1) + 'R'; }
export const both = (usdv, risk) => `${usdS(usdv)} (${rWord(usdv, risk)})`;
export const cents = (x, d) => { const v = num(x); return v == null ? '' : (v < 0 ? '-' : v > 0 ? '+' : '') + Math.abs(v).toFixed(d == null ? 2 : d) + '¢'; };
export const ruinWord = (pct) => { const v = num(pct); return v == null ? 'n/a' : v < 0.5 ? 'under 1%' : Math.round(v) + '%'; };
export const SCOREWORD = (s) => (s >= 70 ? 'Strong' : s >= 40 ? 'Fair' : s >= 15 ? 'Weak' : 'None');
export const TIERS = { worthy: 'Paper-worthy', decaying: 'Fading', unproven: 'Not proven', thin: 'Too few bets', avoid: 'Avoid', rule: 'Rule hint' };
export const TIERCLS = { worthy: 'ok', decaying: 'warn', unproven: 'warn', thin: '', avoid: 'bad', rule: 'info' };
export const RISKCLS = { low: 'ok', med: 'warn', high: 'bad' };
export const RISKWORD = { low: 'Lower risk', med: 'Medium risk', high: 'High risk' };

export function ageWord(iso, nowSec) {
  const t = Date.parse(iso || ''), n = num(nowSec); if (!Number.isFinite(t) || !n) return 'time unknown';
  const m = Math.max(0, Math.round((n - t / 1000) / 60)); return m < 2 ? 'just now' : m < 90 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
}

// ------------------------------------------------------------------------------------------------ the file
function cleanItem(i) {
  if (!isObj(i)) return null;
  const title = str(i.title, 80), tier = Object.prototype.hasOwnProperty.call(TIERS, i.tier) ? i.tier : 'unproven';
  if (!title) return null;
  const risk = i.risk === 'low' || i.risk === 'med' || i.risk === 'high' ? i.risk : 'high';
  const sc = num(i.score);
  return { title, detail: str(i.detail, 700), usd: num(i.usd), score: sc == null ? 0 : Math.max(0, Math.min(100, Math.round(sc))), risk, tier, type: str(i.type, 24) || 'Other', picked: i.picked === true,
    n: Math.max(0, Math.round(num(i.n) || 0)), win: num(i.win), breakEven: num(i.break_even), winLow: num(i.win_low), evC: num(i.ev_c), edgeC: num(i.edge_c), feeC: num(i.fee_c),
    stakePct: num(i.stake_pct) || 0, stakeUsd: num(i.stake_usd), winUsd: num(i.win_usd), ruinPct: num(i.ruin_pct), usdMonth: num(i.usd_month), study: str(i.status_study, 12) };
}
/** Sibyl's own paper ledger (money/sibyl_forward.json, written by tools/money/sibyl_ledger.py) -> counts recomputed from the bets themselves. Net and win rate exist ONLY at MIN_N settled bets or more: no claim without n. */
export const OWN_MIN = 30;
export function normOwn(j) {
  if (!isObj(j) || j.kind !== 'sibyl-forward' || !Array.isArray(j.bets)) return null;
  const bets = j.bets.filter(isObj).map((b) => ({ id: str(b.id, 80), day: str(b.day, 10), title: str(b.title, 60), stake: num(b.stake_usd), win: num(b.win_usd), status: ['open', 'won', 'lost', 'void'].includes(b.status) ? b.status : 'open', pnl: num(b.pnl_usd), r: num(b.r) })).filter((b) => b.id && b.stake > 0);
  const done = bets.filter((b) => (b.status === 'won' || b.status === 'lost') && b.pnl != null), n = done.length, wins = done.filter((b) => b.status === 'won').length;
  const out = { start: str(j.start_day, 10), nBets: bets.length, nOpen: bets.filter((b) => b.status === 'open').length, n, wins, losses: n - wins, claim: n >= OWN_MIN, status: n < OWN_MIN ? 'collecting' : n < 100 ? 'early' : 'building', recent: bets.slice(-8).reverse() };
  if (out.claim) { const net = r2(done.reduce((s, b) => s + b.pnl, 0)), avg = done.reduce((s, b) => s + b.stake, 0) / n; Object.assign(out, { net, avg: r2(avg), netR: Math.round(net / avg * 10) / 10, winRate: wins / n }); }
  out.text = out.claim ? `${n} settled paper bets since ${out.start} (n=${n}): ${wins} won, ${n - wins} lost, net ${both(out.net, out.avg)}. ${n < 100 ? 'Still a small sample: luck can look like skill.' : 'A bigger sample, but a short stretch of one market.'}`
    : `Collecting: ${n} settled paper bets since ${out.start} (${out.nOpen} still open). n=${n}, fewer than ${OWN_MIN}: no claim is made. Net and win rate stay hidden until then.`;
  return out;
}
/** the scanner's file -> a view, or null when it is not a Sibyl file (so the page falls back to the demo) */
export function normSibyl(j) {
  if (!isObj(j) || j.id !== 'sibyl' || !Array.isArray(j.items) || !isObj(j.headline)) return null;
  const items = j.items.map(cleanItem).filter(Boolean).slice(0, 60);
  const sb = isObj(j.scoreboard) ? j.scoreboard : {};
  const bank = isObj(j.bankroll) && num(j.bankroll.usd) > 0 ? { usd: r2(num(j.bankroll.usd)), known: j.bankroll.known === true } : { usd: 100, known: false };
  const pr = isObj(j.params) ? j.params : {};
  return {
    status: ['ok', 'stale', 'sample'].includes(j.status) ? j.status : 'stale', asof: str(j.asof, 30), mode: 'paper', demo: j.demo === true,
    head: str(j.headline.text, 400), month: num(j.headline.usd_month), items, bank,
    notes: (Array.isArray(j.notes) ? j.notes : []).map((x) => str(x, 300)).filter(Boolean).slice(0, 8),
    risks: (Array.isArray(j.risks) ? j.risks : []).filter(isObj).map((r) => ({ title: str(r.title, 60), detail: str(r.detail, 360), level: r.level === 'low' || r.level === 'med' ? r.level : 'high' })).filter((r) => r.title).slice(0, 10),
    counts: isObj(j.counts) ? { edges: num(j.counts.edges) || 0, worthy: num(j.counts.worthy) || 0 } : { edges: items.length, worthy: items.filter((x) => x.picked).length },
    params: { minN: num(pr.min_n) || 30, kelly: num(pr.kelly_fraction) || 0.25, cap: num(pr.cap_pct) || 0.02, capTotal: num(pr.cap_total_pct) || 0.06, ruinBets: num(pr.ruin_bets) || 300 },
    score: { n: Math.max(0, Math.round(num(sb.n) || 0)), minN: num(sb.min_n) || 30, status: ['collecting', 'early', 'building'].includes(sb.status) ? sb.status : 'collecting', start: str(sb.start_day, 10), text: str(sb.text, 400) || 'No forward paper tally yet: nothing is claimed.',
      note: str(sb.note, 300), gaps: Math.round(num(sb.gaps) || 0),
      sets: (Array.isArray(sb.sets) ? sb.sets : []).filter(isObj).map((s) => ({ id: str(s.id, 8), name: str(s.name, 60), n: Math.round(num(s.n) || 0), net: r2(num(s.net) || 0), vsAsis: r2(num(s.vs_asis) || 0), wins: Math.round(num(s.wins) || 0), losses: Math.round(num(s.losses) || 0) })).slice(0, 6) },
    own: normOwn(j.own),
    ageDays: isObj(j.source) ? num(j.source.age_days) : null,
  };
}
/** the file to show: the scanner's file, else the labelled demo */
export function chooseView(real, fixture) {
  const r = normSibyl(real); if (r && r.items.length) return { ...r, src: r.status === 'sample' ? 'demo' : 'file' };
  const d = normSibyl(fixture); return d ? { ...d, src: 'demo', demo: true, status: 'sample' } : null;
}

// ------------------------------------------------------------------------------------------------ sizing in the browser
/** one pick at the viewer's own bankroll. The stake is the file's percent of the bankroll, so the numbers follow the bankroll the owner types. 1R = the stake. */
export function sizeFor(item, bankroll) {
  const b = num(bankroll); if (!item || !item.picked || b == null || b <= 0) return null;
  const stake = r2(b * item.stakePct / 100); if (stake <= 0) return null;
  const win = item.breakEven != null && item.feeC != null ? r2(stake * (1 - (item.breakEven + item.feeC / 100)) / (item.breakEven + item.feeC / 100)) : item.winUsd != null && item.stakeUsd ? r2(stake * item.winUsd / item.stakeUsd) : null;
  return { stake, lose: -stake, win, loseWord: both(-stake, stake), winWord: win == null ? '' : both(win, stake), pct: item.stakePct };
}
export function totalRisk(items, bankroll) { const b = num(bankroll); if (b == null || b <= 0) return 0; return r2(items.filter((i) => i.picked).reduce((s, i) => s + b * i.stakePct / 100, 0)); }
export const filterItems = (items, type, onlyPicks) => items.filter((i) => (!type || i.type === type) && (!onlyPicks || i.picked));
export const typesOf = (items) => [...new Set(items.map((i) => i.type))];

// ------------------------------------------------------------------------------------------------ the ball
/** where the odds tokens float (unit-free): a rank-ordered ring pattern. Deterministic, so the 3D scene and the 2D fallback agree. */
export function tokenLayout(items, max) {
  const top = items.slice(0, max || 8), out = [];
  top.forEach((it, i) => {
    const ring = i % 3, a0 = (i / Math.max(1, top.length)) * Math.PI * 2 + ring * 0.9;
    out.push({ i, label: it.breakEven != null ? Math.round(it.breakEven * 100) + '¢' : '?', radius: 1.55 + ring * 0.22, tilt: [0.28, -0.34, 0.08][ring], phase: a0, speed: (0.16 - ring * 0.035) * (i % 2 ? -1 : 1),
      size: 0.17 + Math.min(0.1, it.score / 100 * 0.1), picked: it.picked, tier: it.tier });
  });
  return out;
}
/** a position on the 2D fallback (viewBox 0 0 320 240) for a token at angle t */
export function flatPos(tok, t) { const a = tok.phase + (t || 0) * tok.speed; return { x: Math.round(160 + Math.cos(a) * tok.radius * 78), y: Math.round(112 + Math.sin(a) * tok.radius * 26 + Math.sin(a * 2) * 4) }; }

// ------------------------------------------------------------------------------------------------ words
export function headlineWords(v) {
  const n = v.counts.worthy;
  if (v.demo || v.status === 'sample') return 'Example numbers: ' + v.head;
  return v.status === 'stale' ? 'Old numbers: ' + v.head : v.head;
}
export function statusLevel(v) { return v.status === 'ok' ? (v.counts.worthy ? 'ok' : 'warn') : v.status === 'sample' ? 'off' : 'warn'; }

export function jarvisCard(v) {
  const lvl = statusLevel(v), best = v.items.find((i) => i.picked);
  return { v: 1, name: 'Sibyl', status: { level: lvl, label: str(v.status === 'sample' ? 'Demo data' : v.status === 'stale' ? 'Old study' : v.counts.worthy ? v.counts.worthy + ' paper picks' : 'No pick today', 48) },
    kpis: [{ label: 'Picks', value: String(v.counts.worthy) }, { label: 'Best edge', value: best ? cents(best.edgeC) : 'none' }, { label: 'Paper 1R', value: best ? usd(sizeFor(best, v.bank.usd).stake) : '$0.00' }],
    lines: [str(v.head, 118), str('Paper only: Sibyl places no bet.', 118)], t: 1793394000, theme: '#14110e' };
}
