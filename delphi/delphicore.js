// DELPHI core (ES module, no DOM, no network): the oracle's briefing. A calm pre-session page: what the bots plan today (LIT / ATLAS / BLITZ in plain words), the VIX-band target, the stop and size logic,
// the news windows and a five-line go / no-go checklist. Pure, so tests/test_delphi_page.py calls it in node.
// Inputs are published files: home.json (live.brief = the LIT day analyst, accounts, strategy.lit), ledger/rules.json (MFFU's limits) and fixture.json (DEMO). Nothing here places or changes an order; paper / eval planning only.
// Money words: "Drawdown left $X of $max loss"; every R sits next to its dollars (1R = the risk of one trade at today's size; ~ = a stand-in because the bot has not reported it).

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
export const num = (v) => { const x = typeof v === 'string' ? parseFloat(v.replace(/[$,\s]/g, '')) : v; return typeof x === 'number' && Number.isFinite(x) ? x : null; };
const str = (v, n) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '').replace(/\s+/g, ' ').trim().slice(0, n || 200);
export function money(x) { const v = num(x); if (v == null) return '$0'; const a = Math.abs(Math.round(v)); return (v < 0 && a !== 0 ? '-' : '') + '$' + a.toLocaleString('en-US'); }
export function moneyS(x) { const v = num(x); if (v == null) return '$0'; const m = money(v); return v > 0 && Math.round(v) !== 0 ? '+' + m : m; }
export const px = (x) => { const v = num(x); return v == null ? 'n/a' : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
export const pts = (x) => { const v = num(x); return v == null ? 'n/a' : (Math.round(v * 10) / 10).toString(); };
export const drawdownLine = (room, mll) => `Drawdown left ${money(room)} of ${money(mll)} max loss`;
export const levelOf = (f) => (f < 0.25 ? 'bad' : f < 0.5 ? 'warn' : 'ok');
export const MICRO_PT = 2;
export const DEFAULT_MLL = 2000;      // Builder 50K (research/lit/mffu_rules.json); ledger/rules.json overrides
const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** The day of the New York calendar at `d` (a Date), as YYYY-MM-DD. */
export function etDay(d) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); } catch (_) { return d.toISOString().slice(0, 10); }
}

// ------------------------------------------------------------------------------------------------ the model
/** One tidy object from home.json (or the fixture's copy of it). Every field may be missing; nothing here throws. */
export function readHome(home, rules) {
  const h = isObj(home) ? home : {}, live = isObj(h.live) ? h.live : {}, b = isObj(live.brief) ? live.brief : null;
  const ac = Array.isArray(h.accounts) ? h.accounts.find((a) => isObj(a) && isObj(a.eval) && num(a.eval.room) != null) : null;
  const L = isObj(rules) && isObj(rules.limits) && isObj(rules.limits.builder_50k) ? rules.limits.builder_50k : {};
  const ev = b && isObj(b.eval) ? b.eval : {};
  const roomA = ac ? num(ac.eval.room) : null, room = roomA != null ? roomA : num(ev.room);
  const mll = (ac ? num(ac.eval.mll) : null) || (num(L.mll) > 0 ? num(L.mll) : DEFAULT_MLL);
  const v = b && isObj(b.vix) ? b.vix : {};
  const open18 = num(v.open18), vix = num(v.vix);
  let move = num(v.move); if (move == null && open18 != null && vix != null && vix > 0) move = Math.round((open18 * vix / 100 / Math.sqrt(252)) * 10) / 10;
  let low = num(v.low), high = num(v.high);
  if ((low == null || high == null) && move != null && open18 != null) { low = Math.round((open18 - move) * 100) / 100; high = Math.round((open18 + move) * 100) / 100; }
  const news = (b && Array.isArray(b.news) ? b.news : []).filter(isObj).slice(0, 8).map((e) => ({ time: str(e.time, 8), title: str(e.title, 80), kind: str(e.kind, 40), blackout: str(e.blackout, 20) }));
  const lit = isObj(h.strategy) && isObj(h.strategy.lit) ? h.strategy.lit : {};
  return {
    has: !!b, day: b ? str(b.day, 10) : '', builtT: num(b && b.built_t), built: str(h.built, 40), plan: b ? str(b.plan, 900) : '', monday: b && isObj(b.monday) ? str(b.monday.text, 160) : '',
    overnight: b && isObj(b.overnight) ? str(b.overnight.text, 200) : '', untaken: b && isObj(b.untaken) ? { above: num(b.untaken.above), below: num(b.untaken.below) } : null,
    weekly: b && isObj(b.weekly_stop) ? b.weekly_stop : null,
    vix: { vix, move, open18, low, high, has: low != null && high != null },
    news, newsText: b ? str(b.news_text, 400) : '', newsSrc: b ? str(b.news_src, 30) : '',
    size: { stop: num(ev.stop), micros: num(ev.max_micros), risk: num(ev.risk_usd), mode: str(ev.mode, 30), why: Array.isArray(ev.why) ? ev.why.map((x) => str(x, 160)).filter(Boolean).slice(0, 2) : [], toTarget: num(ev.to_target) },
    room, mll, accountName: ac ? str(ac.name, 40) : '', lit: isObj(lit.params) ? lit.params : isObj(lit) ? lit : {},
  };
}

// ------------------------------------------------------------------------------------------------ the target, the stop and the size
export function vixLines(m) {
  const v = m.vix, rr = num(m.lit.max_rr) || 8, risk = m.size.risk;
  if (!v.has) return ['The VIX close is missing, so there is no target band today. No band, no trade: the bot waits.'];
  const out = [
    `One VIX day move = VIX close / 100 / 15.87 x the 18:00 open${v.vix != null && v.open18 != null ? ` = ${v.vix.toFixed(2)} / 100 / 15.87 x ${px(v.open18)}` : ''} = ${pts(v.move)} points (${money(v.move * MICRO_PT)} per micro).`,
    `Shorts aim at ${px(v.low)}, longs at ${px(v.high)}. The bot banks the trade there, at ${rr}R at most${risk ? `: ${rr}R is ${moneyS(rr * risk)} when 1R is ${money(risk)}` : ''}.`,
    `One clear target, no greed: a setup whose band is closer than ${num(m.lit.min_rr) || 1.5}R from the entry is skipped.`,
  ];
  return out;
}
export function sizeLines(m) {
  const s = m.size, out = ['The stop sits 1 tick beyond the sweep extreme (the protected high or low), never a fixed distance.', 'A wide stop means fewer micros, a small stop allows more: the size follows the stop.'];
  if (s.micros != null && s.stop != null) out.push(`Today at a typical ${pts(s.stop)}-point stop: ${s.micros} micros${s.risk != null ? `, ${money(s.risk)} at risk (1R = ${money(s.risk)}); a stop-out is ${moneyS(-s.risk)} (-1.0R)` : ''}.`);
  else out.push('Today\'s size is not reported yet. The bot sizes each trade from its own stop when a setup arms.');
  for (const w of s.why) out.push(w);
  return out;
}

// ------------------------------------------------------------------------------------------------ what each bot plans (plain words)
/** LIT's rules from home.strategy.lit (the live params) with safe defaults; never a raw number without its meaning. */
export function litLines(m) {
  const P = m.lit, w = Array.isArray(P.window) && Array.isArray(P.window[0]) ? P.window[0] : [120, 930], flat = num(P.flat_mod) || 955, be = num(P.be_r) || 1, rr = num(P.max_rr) || 8, tc = isObj(P.t_check) ? num(P.t_check.at) : 15;
  const out = [
    'LIT hunts liquidity: price sweeps a marked high or low, shows inducement and displacement, then a 5-minute CISD arms a limit order (30 minutes to fill, then a 1-minute CISD).',
    `Entries only ${hm(w[0])} to ${hm(w[1])} New York time, one trade a day. Flat by ${hm(flat)}.`,
    `Stop 1 tick beyond the sweep extreme. Target: the VIX band, banked at ${rr}R at most. At ${be}R the stop moves to break-even (plus costs)${tc ? `; a trade that goes nowhere is cut after ${tc} minutes` : ''}.`,
  ];
  if (m.plan) out.unshift('Today: ' + m.plan);
  if (m.monday) out.push(m.monday + '.');
  return out;
}
export const atlasLines = () => [
  'ATLAS pools three paper strategies on the 25K account: a London EMA pullback, MACD divergence at a sweep, and a New York sweep-and-reclaim at support / resistance.',
  'Each risks its own set amount per trade, with the stop beyond the swing. It is PAPER by default: it is not routed to a real order unless you arm it.',
  'It sits next to LIT and never trades against it.',
];
export const blitzLines = () => [
  'BLITZ is the scalper on its own 25K. It checks the market only at 11:00, 11:30 and so on to 15:30 New York time.',
  'It trades a day only if yesterday\'s 09:30-16:00 range was at least 0.8 of the recent average. A close outside the day\'s band means a long or a short at the next open.',
  'Stop 1.5 x the 5-minute ATR; out after 30 minutes or at 15:55; at most 6 trades a day and never more than 20 micros. Three losses (-3R) end its day: with 1R about $120 that is about -$360.',
  'On a quiet day it skips: no trade is a normal BLITZ day.',
];

// ------------------------------------------------------------------------------------------------ the checklist and the verdict
/** Five lines, each { key, level: ok | warn | bad | info, label, text }. `now` = a Date; demo = the example data is shown. */
export function checklist(m, now, demo) {
  const out = [];
  // 1 data
  if (demo) out.push({ key: 'data', level: 'info', label: 'Fresh data', text: 'Example data. The live briefing replaces it when the bot has published today\'s.' });
  else if (!m.has) out.push({ key: 'data', level: 'bad', label: 'Fresh data', text: 'No briefing published yet. Wait for the bot\'s morning briefing (about 01:30 New York time).' });
  else {
    const t = m.builtT != null ? m.builtT * 1000 : Date.parse(m.built), age = Number.isFinite(t) ? Math.round((now.getTime() - t) / 60000) : null, today = etDay(now);
    if (m.day && m.day !== today) out.push({ key: 'data', level: 'warn', label: 'Fresh data', text: `The briefing is from ${m.day}, not today (${today}). On a weekend that is normal; otherwise wait for the new one.` });
    else if (age != null && age > 90) out.push({ key: 'data', level: 'warn', label: 'Fresh data', text: `The last update is ${age >= 120 ? Math.round(age / 60) + ' hours' : age + ' minutes'} old. The page refreshes about every 15 minutes while the bot runs.` });
    else out.push({ key: 'data', level: 'ok', label: 'Fresh data', text: age != null ? `Updated ${age <= 1 ? 'just now' : age + ' minutes ago'}, for ${m.day || today}.` : `The briefing is for ${m.day || today}.` });
  }
  // 2 target
  out.push(m.vix.has ? { key: 'band', level: 'ok', label: 'Target band known', text: `Shorts ${px(m.vix.low)}, longs ${px(m.vix.high)} (one move = ${pts(m.vix.move)} pts).` }
    : { key: 'band', level: 'bad', label: 'Target band known', text: 'No VIX band today, so no trade. The bot waits.' });
  // 3 drawdown
  if (m.room != null) {
    const f = m.room / m.mll, lv = levelOf(f);
    out.push({ key: 'room', level: lv, label: 'Drawdown left', text: `${drawdownLine(m.room, m.mll)}.` + (lv === 'bad' ? ' Very close to the floor: stand down or trade the smallest size.' : lv === 'warn' ? ' Getting close: keep the size down.' : ' A safe distance.') });
  } else out.push({ key: 'room', level: 'warn', label: 'Drawdown left', text: 'The account has not reported its drawdown yet. Check the broker\'s own screen before you rely on the size.' });
  // 4 news
  if (m.has || demo) {
    if (!m.news.length) out.push({ key: 'news', level: 'ok', label: 'News windows', text: 'No high-impact USD news today.' });
    else out.push({ key: 'news', level: 'warn', label: 'News windows', text: `${m.news.length} high-impact event${m.news.length === 1 ? '' : 's'}: ${m.news.slice(0, 3).map((e) => `${e.title} ${e.time}`).join(', ')}. LIT does not pause for news: a spike can run through the stop in seconds.` });
  } else out.push({ key: 'news', level: 'warn', label: 'News windows', text: 'The news list is not published yet. Check the calendar yourself.' });
  // 5 size
  const s = m.size;
  out.push(s.micros != null && s.micros > 0 ? { key: 'size', level: 'ok', label: 'Size set', text: `${s.micros} micros at a typical ${pts(s.stop)}-point stop${s.risk != null ? `, ${money(s.risk)} at risk (1R)` : ''}. One trade a day.` }
    : s.micros === 0 ? { key: 'size', level: 'bad', label: 'Size set', text: 'Today\'s size is 0 micros: there is no room to trade. Stand down.' }
      : { key: 'size', level: 'warn', label: 'Size set', text: 'Today\'s size is not reported yet. The bot sizes each trade from its own stop.' });
  return out;
}
const RANK = { ok: 0, info: 0, warn: 1, bad: 2 };
/** The one-line answer: Go / Go, with care / Stand down, with the reason and what to do. Never blank. */
export function verdict(list, demo) {
  const worst = list.reduce((a, x) => Math.max(a, RANK[x.level] || 0), 0), bad = list.filter((x) => x.level === 'bad'), warn = list.filter((x) => x.level === 'warn');
  const ok = list.filter((x) => x.level === 'ok').length;
  let level, word, why, doit;
  if (worst === 2) { level = 'bad'; word = 'Stand down'; why = bad.map((x) => x.label.toLowerCase()).join(' and ') + (bad.length === 1 ? ' is not in order.' : ' are not in order.'); doit = 'Leave the bot alone today and do not add a trade by hand.'; }
  else if (worst === 1) { level = 'warn'; word = 'Go, with care'; why = warn.map((x) => x.label.toLowerCase()).join(' and ') + ' need a look.'; doit = 'Let the bot trade its plan. Do not change the size, and read the lines marked Look.'; }
  else { level = 'ok'; word = 'Go'; why = 'Every line of the checklist is in order.'; doit = 'Let the bot trade its plan. Nothing to change.'; }
  return { level, word, why: demo ? why + ' (example data)' : why, doit, ok, total: list.length };
}
export const LEVEL_WORD = { ok: 'In order', warn: 'Look', bad: 'Not ready', info: 'Example' };

export function jarvisCard(list, vd) {
  return { v: 1, name: 'Delphi', status: { level: vd.level, label: vd.word.slice(0, 48) }, kpis: [{ label: 'Checklist', value: `${vd.ok} of ${vd.total} ok` }, { label: 'Verdict', value: vd.word.slice(0, 24) }],
    lines: [str(vd.why, 118)], t: 1793394000, theme: '#14110e' };
}
