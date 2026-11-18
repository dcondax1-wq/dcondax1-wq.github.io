// TYCHE fortune (2026-11-04): the strategy leaderboard, the streak coins, the daily "fortune" card, two bankrolls side by side and the session
// replay, all derived from the Model (data.js): the bot's own settled bets. Pure (no DOM, no clock of its own, no randomness), so the
// test calls it in the page. Honest by construction: the fortune is a reading of the data, never a forecast; the second bankroll is "the
// same bets at another stake", never a promise.

const sum = (a) => a.reduce((s, x) => s + x, 0);
const money = (v, sign) => { const x = Math.round(Math.abs(v) * 100) / 100, s = '$' + x.toLocaleString('en-US', { minimumFractionDigits: x % 1 ? 2 : 0, maximumFractionDigits: 2 }); return v < 0 ? '-' + s : sign && x > 0 ? '+' + s : s; };
export const usdF = money;
const settledOf = (m) => (m && Array.isArray(m.settled) ? m.settled.filter((s) => s && Number.isFinite(s.pnl)) : []);

/** Who earns the money: by strategy when the feed names at least two, else by market category. Best first, at most 6. */
export function leaderboard(m) {
  const S = settledOf(m), names = new Set(S.map((s) => s.strategy).filter(Boolean)), by = names.size >= 2 ? 'strategy' : 'category', map = new Map();
  for (const s of S) {
    const k = (by === 'strategy' ? s.strategy : s.category) || 'Other', r = map.get(k) || { name: k, trades: 0, wins: 0, losses: 0, pnl: 0, staked: 0 };
    r.trades++; r.pnl += s.pnl; r.staked += s.staked || 0; if (s.win) r.wins++; if (s.loss) r.losses++;
    map.set(k, r);
  }
  const rows = [...map.values()].map((r) => ({ ...r, pnl: Math.round(r.pnl * 100) / 100, winRate: r.wins + r.losses ? r.wins / (r.wins + r.losses) : null, roi: r.staked > 0 ? r.pnl / r.staked : null }))
    .sort((a, b) => b.pnl - a.pnl).slice(0, 6);
  return { by, rows, total: S.length };
}

/** The last n settled bets as coins (gold = won, dark = lost) and the run you are on / the best run. */
export function streakCoins(m, n = 12) {
  const S = settledOf(m), last = S.slice(-n).map((s) => ({ win: !!s.win, loss: !!s.loss, pnl: s.pnl, title: s.title || 'Bet' }));
  let cur = { kind: null, n: 0 }, best = 0, run = 0;
  for (const s of S) { run = s.win ? run + 1 : 0; best = Math.max(best, run); }
  for (let i = S.length - 1; i >= 0; i--) {
    const k = S[i].win ? 'win' : S[i].loss ? 'loss' : null;
    if (!k || (cur.kind && cur.kind !== k)) break;
    cur = { kind: k, n: cur.n + 1 };
  }
  return { coins: last, cur, best, total: S.length };
}

/** Today's fortune: a few plain sentences read straight from the data (the day's money, the strongest market, the run you are on, the sizing
 *  that fits the run). No prediction: it says so. */
export function fortune(m) {
  const S = settledOf(m), out = { headline: '', lines: [], tone: 'flat', note: 'A reading of the bot\'s own numbers, not a forecast.' };
  if (!S.length) { out.headline = 'The wheel has no settled bets yet.'; out.lines.push('Once bets settle, this card reads them: the day, the strongest market and the run you are on.'); return out; }
  const sc = streakCoins(m), board = leaderboard(m), strong = board.rows.filter((r) => r.wins + r.losses >= 5).sort((a, b) => b.winRate - a.winRate)[0];
  const today = Number.isFinite(m.today) ? m.today : null, wr = m.stats && m.stats.winRate != null ? m.stats.winRate : null;
  out.tone = today == null ? 'flat' : today > 0.005 ? 'up' : today < -0.005 ? 'down' : 'flat';
  out.headline = today == null ? `${S.length} settled bets on record.` : today > 0.005 ? `A gold day: ${money(today, true)} so far.` : today < -0.005 ? `A dark day: ${money(today)} so far. Stay small.` : 'A quiet day so far.';
  if (strong) out.lines.push(`Strongest market: ${strong.name}, ${strong.wins} of ${strong.wins + strong.losses} won (${Math.round(strong.winRate * 100)}%).`);
  if (sc.cur.kind) out.lines.push(sc.cur.kind === 'win' ? `You are on a run of ${sc.cur.n} win${sc.cur.n === 1 ? '' : 's'} (best ever ${sc.best}).` : `The last ${sc.cur.n} bet${sc.cur.n === 1 ? '' : 's'} lost.`);
  if (wr != null) out.lines.push(`Over ${S.length} bets the win rate is ${Math.round(wr * 100)}%; the Kelly slider turns that into a stake.`);
  out.lines.push(sc.cur.kind === 'loss' && sc.cur.n >= 3 ? 'After a losing run a quarter Kelly is the sober size.' : sc.cur.kind === 'win' && sc.cur.n >= 3 ? 'A run is not an edge: keep the same size, win or lose.' : 'Keep the stake at what the Kelly slider says, no more.');
  return out;
}

/** The bankroll after each settled bet, oldest first: [{ i, bal, pnl, title, win }]; i = 0 is the start. At stake scale `scale` (1 = as it was). */
export function replayFrames(m, scale = 1) {
  const S = settledOf(m), end = m && Number.isFinite(m.balance) ? m.balance : sum(S.map((s) => s.pnl)), start = end - sum(S.map((s) => s.pnl));
  const frames = [{ i: 0, bal: start, pnl: 0, title: 'Start', win: false }];
  let bal = start;
  S.forEach((s, k) => { bal += s.pnl * scale; frames.push({ i: k + 1, bal: Math.round(bal * 100) / 100, pnl: Math.round(s.pnl * scale * 100) / 100, title: s.title || 'Bet', win: !!s.win }); });
  return frames;
}

/** Two bankrolls: the real one and the same bets at another stake (default half). Final balance, the deepest drop, and both series. */
export function compareBankrolls(m, scale = 0.5) {
  const a = replayFrames(m, 1), b = replayFrames(m, scale);
  const dd = (f) => { let pk = -Infinity, w = 0; for (const x of f) { pk = Math.max(pk, x.bal); w = Math.max(w, pk - x.bal); } return Math.round(w * 100) / 100; };
  return { scale, a, b, endA: a[a.length - 1].bal, endB: b[b.length - 1].bal, ddA: dd(a), ddB: dd(b), n: a.length - 1 };
}
