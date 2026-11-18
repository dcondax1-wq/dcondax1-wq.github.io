// KALSHI CITY "What we learned" and "Ask for the full history" (ES module). The words are written from learned.json (tools/kalshicity_learned.py, made from
// research/kalshi/edge_tables.json): no number here is typed in, so a rerun of the research refreshes the sheet. Text only through textContent.
import { usd, pct } from './cityfeed.js';

export const ASK_MESSAGE = [
  'Please do ONE read-only export for analysis. Do not change the bot, do not place or cancel any order, do not call Kalshi, and do not include any API key, key file, .env value, password or account number.',
  '',
  "From the bot's order table (the trades database, read only), make a CSV text with one row per FILLED order, oldest first, with exactly these columns:",
  'time,ticker,side,book,contracts,price,pnl',
  '- time: UTC, like 2026-11-02T15:53:47Z',
  '- ticker: the market ticker',
  '- side: yes or no',
  '- book: the strategy that placed it (for example "Late favourite (BTC hourly)")',
  '- contracts: contracts filled',
  '- price: average fill price in dollars, 0 to 1 (for example 0.98)',
  '- pnl: realised profit or loss in dollars after fees; leave it empty if the order is still open',
  '',
  'Print the CSV here in the chat inside one code block so I can copy it. If it is longer than about 400 lines, print it in parts of 400 lines and tell me how many parts there are. Also tell me the total row count.',
  'Do not save it to kalshi-feed or any other public place: that repo is public.',
].join('\n');

const f0 = (x) => (x == null ? '-' : `${x < 0 ? '-' : ''}$${Math.abs(x).toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
const range = (lo, hi) => `${pct(lo)} to ${pct(hi)}`;
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function find(cls, title, ...lines) { const d = h('div', `find ${cls}`); d.append(h('b', '', title), ...lines.map((t) => h('p', '', t))); return d; }

/** the sheet: the headline findings of the research, in plain words. learned = learned.json, onHistory = open the ask card. */
export function lessonsView(learned, onHistory) {
  const Ls = learned;
  if (!Ls) return [h('p', '', 'The research tables are not on this site yet.')];
  const f = Ls.fees, hi = Ls.buckets.find((b) => b.label.startsWith('95-99c')), mid = Ls.buckets.find((b) => b.label === '90-95c'), r98 = f.rows.find((r) => r.price === 0.98), ru = Ls.ruin;
  const out = [h('p', 'strong', Ls.headline),
    h('p', '', `Research of ${(Ls.source.generated_utc || '').slice(0, 10)} on the bot's ${Ls.source.bets ? Ls.source.bets.toLocaleString('en-US') : ''} settled bets, all after Kalshi's fees. The feed gives totals, never combinations, so these are slices, not proof.`)];
  out.push(find('bad', 'Fees eat the edge',
    `Before fees the bot made about ${usd(f.pnl_gross, 0)} on ${f0(f.staked)} bet. Kalshi's fee took about ${f0(f.total)} (${pct(f.pct_of_stake, 2)} of the money bet), so it ended at ${usd(f.pnl_net, 0)}.`,
    `A fee is ${pct(f.pct_of_win_min, 0)} to ${pct(f.pct_of_win_max, 0)} of what a win pays, at every price. Resting (maker) orders would pay about ${f0(f.maker_total)} instead (not tested).`));
  if (hi) {
    out.push(find('good', '95c and above: a thin pocket',
      `${hi.n.toLocaleString('en-US')} bets, won ${pct(hi.win_rate)} (${range(hi.wilson_lo, hi.wilson_hi)}) against ${pct(hi.breakeven_win_rate)} needed: ${pct(hi.roi)} per $1 (${range(hi.roi_ci_lo, hi.roi_ci_hi)}), ${usd(hi.pnl, 0)} on ${f0(hi.staked)}.`,
      `Plausible, not proven: the one-sided p is ${hi.p_one_sided} before allowing for the many slices looked at.${r98 ? ` And it pays for tail risk: one loss erases about ${Math.round(r98.loss_to_win_ratio)} wins at 98c.` : ''}`));
  }
  if (mid) {
    out.push(find('bad', '90-95c entries lose',
      `${mid.n} bets: ${usd(mid.pnl, 0)} (${pct(mid.roi)} per $1, ${range(mid.roi_ci_lo, mid.roi_ci_hi)}). Even the best end of that range is below zero.`,
      `${f0(Math.abs(mid.size_effect_pnl))} of the loss came from losing bets being bigger than winning ones.`));
  }
  if (ru && ru.rows.length) {
    const ul = h('ul', 'kv');
    ru.rows.forEach((r) => {
      const li = h('li', r.p_ruin > 0.1 ? 'bad' : r.p_ruin < 0.01 ? 'ok' : '');
      li.append(h('span', 'k', r.policy), h('span', 'v', `${pct(r.p_ruin, r.p_ruin < 0.01 ? 1 : 0)} ruin · median ${usd(r.median_end, 0)}`));
      ul.append(li);
    });
    out.push(find('warn', 'Risk of ruin grows with bet size', `Late favourite only, ${ru.bets_per_day} bets a day for ${ru.horizon_days} days from ${usd(ru.bankroll, 0)}. Ruin = under ${usd(ru.floor, 0)}, too little for the smallest bet.`), ul,
      h('p', '', 'At a safe size the edge earns a few dollars in 90 days; at a size that could earn real money the bot is more likely to bust. The edge is too thin for the bankroll.'));
  }
  const bl = h('ul', 'kv');
  Ls.buckets.forEach((b) => {
    const li = h('li', b.low_n ? 'dim' : b.roi > 0 ? 'ok' : 'bad');
    li.append(h('span', 'k', b.label.replace(/ \(.*$/, '')), h('span', 'v', `${b.n} bets · won ${pct(b.win_rate)} vs ${pct(b.breakeven_win_rate)} needed · ${pct(b.roi)} per $1`));
    bl.append(li);
  });
  out.push(h('h3', '', 'By entry price'), bl);
  if (Ls.ideas.length) {
    out.push(h('h3', '', 'Ideas to paper-test first'));
    const ol = h('ol', 'steps');
    Ls.ideas.forEach((i) => ol.append(h('li', '', `${i.title} (about ${i.n_needed} bets)`)));
    out.push(ol);
  }
  const b = h('button', 'more', 'Ask for the full history (unlocks hour-of-day edges)'); b.type = 'button'; b.id = 'askBtn'; b.addEventListener('click', onHistory);
  out.push(b, h('p', '', `Full write-up: ${Ls.source.writeup}.`));
  return out;
}

/** the card that explains why the full order history matters and holds the message to paste into the kalshi-server chat. */
export function historyView(state) {
  const msg = h('pre', '', ASK_MESSAGE), copy = h('button', 'more', 'Copy the message'); copy.type = 'button'; copy.id = 'copyAsk';
  copy.addEventListener('click', async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(ASK_MESSAGE); ok = true; } catch (_) {
      try { const r = document.createRange(); r.selectNodeContents(msg); const s = getSelection(); s.removeAllRanges(); s.addRange(r); ok = document.execCommand('copy'); } catch (__) { /* select it by hand */ }
    }
    copy.textContent = ok ? 'Copied' : 'Press and hold the text to copy it'; state.copied = ok;
  });
  const steps = h('ol', 'steps');
  ['Copy the message below.', 'Paste it in the kalshi-server chat (the one that runs the bot).',
    'Copy the CSV it prints and paste it back into your lead chat on this repo (or save it as a file and upload it there). One run of the engine then adds every bet.'].forEach((t) => steps.append(h('li', '', t)));
  const ask = h('div', 'ask');
  ask.append(h('p', 'strong', 'The feed carries only the last 40 bets, so the city cannot see which hour of the day works, or which strategy at which price.'), steps, copy, msg);
  return [ask, h('p', '', 'With every bet the engine can build hour-of-day, strategy-by-price and coin-by-strategy edges in seconds (about 600 bets a slice are needed before a verdict). The export is read only: no order, no key, nothing public.')];
}
