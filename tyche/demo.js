// TYCHE demo: a full v3 kalshi.json, made up but self-consistent, for when the owner's bot is not linked yet (or ?demo=1).
// 60 days of settled bets come from a seeded random walk, so every total (stats, categories, buckets, calibration, days,
// equity) is the sum of the same bets, the way the bot's own server script builds them. Open bets settle minutes to days
// from `now`, so the countdowns run. It is labelled DEMO everywhere it shows; it is never the owner's account.

const CATS = [
  // name, group, weight, typical price, edge
  ['Weather', 'Climate', 5, 0.46, 0.06],
  ['Bitcoin', 'Crypto', 4, 0.9, 0.025],
  ['Ethereum', 'Crypto', 3, 0.88, 0.02],
  ['S&P 500', 'Financials', 3, 0.55, 0.04],
  ['Gold', 'Commodities', 2, 0.72, 0.035],
  ['Economics', 'Economics', 2, 0.38, 0.05],
  ['Politics', 'Elections', 1, 0.3, 0.045],
];
const EDGES = [0, 0.2, 0.4, 0.6, 0.8, 0.9, 0.95, 0.97, 0.99, 1];
const START = 1000;

function rng(seed) {                                    // mulberry32: the same demo on every load
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r2 = (x) => Math.round(x * 100) / 100;
const r4 = (x) => Math.round(x * 10000) / 10000;

const TITLES = {
  Weather: ['NYC high above 58°F', 'Chicago rain over 0.1 in', 'Miami high 84-85°F', 'Denver low below 30°F', 'LA high above 72°F'],
  Bitcoin: ['Bitcoin above $96,000 at 5 PM ET', 'Bitcoin up or down · 15 min', 'Bitcoin above $95,250 at 1 PM ET'],
  Ethereum: ['Ethereum above $3,400 at 5 PM ET', 'ETH up or down · 15 min'],
  'S&P 500': ['S&P 500 close 5,950-5,975', 'S&P 500 above 5,900 at close', 'Nasdaq-100 up on the day'],
  Gold: ['Gold above $2,740 at 5 PM ET', 'Gold first above $2,750'],
  Economics: ['CPI m/m 0.2% or less', 'Jobless claims under 225k', 'Fed holds in December'],
  Politics: ['Senate passes the funding bill', 'Governor race called by 11 PM'],
};
const TICK = { Weather: 'KXHIGH', Bitcoin: 'KXBTC', Ethereum: 'KXETH', 'S&P 500': 'KXINX', Gold: 'KXGOLD', Economics: 'KXCPI', Politics: 'KXSEN' };

/** The demo kalshi.json as of `now` (unix seconds). */
export function demoFeed(now = Date.now() / 1000) {
  const rnd = rng(20261103);
  const day0 = Math.floor(now / 86400) * 86400;
  const pickCat = () => {
    let x = rnd() * CATS.reduce((s, c) => s + c[2], 0);
    for (const c of CATS) { x -= c[2]; if (x <= 0) return c; }
    return CATS[0];
  };

  // ---- 60 days of settled bets
  const bets = [];
  for (let d = 59; d >= 0; d--) {
    const n = 4 + Math.floor(rnd() * 6);
    for (let j = 0; j < n; j++) {
      const c = pickCat(), price = Math.min(0.98, Math.max(0.08, c[3] + (rnd() - 0.5) * 0.36));
      const prob = Math.min(0.99, price + c[4] * (0.4 + rnd() * 1.2));
      const won = rnd() < prob - 0.015 + (rnd() - 0.5) * 0.04;
      const stake = 6 + rnd() * 22, contracts = Math.max(1, Math.round(stake / price));
      const pnl = won ? contracts * (1 - price) * 0.985 : -contracts * price;
      const t = Math.round(day0 - d * 86400 + 3600 * (2 + (j + rnd()) * (20 / n)));
      if (t > now - 120) continue;
      const titles = TITLES[c[0]];
      bets.push({ t, cat: c, price: r4(price), prob: r4(prob), contracts, pnl: r2(pnl), won, title: titles[Math.floor(rnd() * titles.length)] });
    }
  }
  bets.sort((a, b) => a.t - b.t);
  const total = r2(bets.reduce((s, b) => s + b.pnl, 0));
  const balance = r2(START + total);

  // ---- the totals, each over every settled bet
  const agg = (rows) => {
    const w = rows.filter((b) => b.pnl > 0.005).length, l = rows.filter((b) => b.pnl < -0.005).length;
    return { trades: rows.length, wins: w, losses: l, pnl: r2(rows.reduce((s, b) => s + b.pnl, 0)), staked: r2(rows.reduce((s, b) => s + b.contracts * b.price, 0)) };
  };
  const categories = CATS.map((c) => ({ name: c[0], group: c[1], ...agg(bets.filter((b) => b.cat === c)) })).filter((c) => c.trades);
  const buckets = [];
  for (let i = 0; i < EDGES.length - 1; i++) {
    const rows = bets.filter((b) => b.price >= EDGES[i] && (b.price < EDGES[i + 1] || (i === EDGES.length - 2 && b.price <= 1)));
    if (rows.length) buckets.push({ lo: EDGES[i], hi: EDGES[i + 1], ...agg(rows) });
  }
  const calibration = [];
  for (let i = 0; i < EDGES.length - 1; i++) {
    const rows = bets.filter((b) => b.prob >= EDGES[i] && b.prob < EDGES[i + 1]);
    if (rows.length) calibration.push({ p: r4(rows.reduce((s, b) => s + b.prob, 0) / rows.length), n: rows.length, hit: r4(rows.filter((b) => b.won).length / rows.length) });
  }
  const all = agg(bets);
  const dayKey = (t) => new Date(t * 1000).toISOString().slice(0, 10);
  const byDay = new Map();
  bets.forEach((b) => byDay.set(dayKey(b.t), r2((byDay.get(dayKey(b.t)) || 0) + b.pnl)));
  const days = Array.from(byDay.entries());
  let run = START;
  const equity = bets.filter((_, i) => i % 3 === 0 || i === bets.length - 1).map((b) => {
    run = START + bets.filter((x) => x.t <= b.t).reduce((s, x) => s + x.pnl, 0);
    return [b.t, r2(run)];
  });
  equity.push([Math.round(now), balance]);
  const since = (s) => r2(bets.filter((b) => b.t >= s).reduce((x, b) => x + b.pnl, 0));
  const dow = (new Date(day0 * 1000).getUTCDay() + 6) % 7;

  // ---- open bets: the coins on the wheel
  const open = [
    ['Weather', 'NYC high above 58°F today', 'yes', 24, 0.41, 0.47, 0.55, 7 * 60 + 12],
    ['Bitcoin', 'Bitcoin above $96,000 at 5 PM ET', 'yes', 18, 0.9, 0.93, 0.95, 38 * 60],
    ['Ethereum', 'ETH up or down · 15 min', 'yes', 30, 0.62, 0.66, 0.7, 11 * 60 + 40],
    ['S&P 500', 'S&P 500 close 5,950-5,975', 'no', 16, 0.58, 0.6, 0.66, 5 * 3600 + 20 * 60],
    ['Gold', 'Gold above $2,740 at 5 PM ET', 'yes', 20, 0.71, 0.69, 0.76, 2 * 3600 + 5 * 60],
    ['Economics', 'CPI m/m 0.2% or less', 'yes', 40, 0.34, 0.36, 0.43, 2 * 86400 + 9 * 3600],
    ['Politics', 'Senate passes the funding bill by Friday', 'no', 25, 0.27, 0.25, 0.33, 3 * 86400 + 2 * 3600],
    ['Weather', 'Chicago rain over 0.1 in tomorrow', 'no', 22, 0.52, 0.55, 0.6, 22 * 3600],
    ['Bitcoin', 'Bitcoin up or down · 15 min', 'up', 26, 0.58, 0.61, 0.6, 3 * 60 + 30],
    ['Weather', 'Miami high 84-85°F tomorrow', 'yes', 35, 0.22, 0.2, 0.29, 26 * 3600],
    ['S&P 500', 'Nasdaq-100 up on the day', 'yes', 15, 0.64, 0.7, 0.68, 4 * 3600 + 40 * 60],
    ['Ethereum', 'Ethereum above $3,400 at 5 PM ET', 'no', 12, 0.83, 0.8, 0.86, 3 * 3600 + 15 * 60],
    ['Economics', 'Jobless claims under 225k', 'yes', 28, 0.47, 0.5, 0.5, 2 * 86400 + 30 * 60],
  ].map((p, i) => ({
    ticker: `${TICK[p[0]]}-26NOV0${(i % 7) + 3}-D${i + 1}`, title: p[1], side: p[2], contracts: p[3], avg_price: p[4], price: p[5],
    value: r2(p[3] * p[5]), pnl: r2(p[3] * (p[5] - p[4])), closes: new Date((now + p[7]) * 1000).toISOString(),
    category: p[0], prob: p[6], strategy: p[0] === 'Bitcoin' || p[0] === 'Ethereum' ? '15-min favourites' : 'Model edge',
  }));

  // ---- the last 40 settled trades, newest first (the contract's order)
  const trades = bets.slice(-40).reverse().map((b, i) => ({
    t: b.t, ticker: `${TICK[b.cat[0]]}-D${400 + i}`, title: b.title, side: i % 4 === 3 ? 'no' : 'yes', action: 'settled',
    contracts: b.contracts, price: b.price, pnl: b.pnl, category: b.cat[0], prob: b.prob,
  }));

  return {
    v: 3, t: Math.round(now) - 20, name: 'Kalshi Edge (demo)', mode: 'demo', running: true, status: 'Demo · 13 open bets',
    balance, today_pnl: since(day0), week_pnl: since(day0 - dow * 86400), total_pnl: total,
    positions: open, trades, days, equity,
    categories, buckets, calibration, calib_basis: 'model',
    alerts: [{ t: Math.round(now) - 900, level: 'info', text: 'Demo data: link the bot to see your own bets' }],
    kelly: { fraction: 0.25, bankroll: balance, max_bet: 25, min_edge: 0.03 },
    stats: { ...all, avg_price: r4(bets.reduce((s, b) => s + b.price, 0) / bets.length) },
  };
}
