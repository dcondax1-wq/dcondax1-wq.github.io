// TODAY'S BATTLE PLAN + ALERT HISTORY: the pure models (night-nq-main 2026-11-27). No DOM, no fetch: node-tested (tests/test_nq_plan.py).
//   plan(brief, news, home, nowS)  -> { day, stale, staleText, early, headline, map: {segs, wins, halt, now}, levels: {price, priceSrc, rows}, news: [...],
//                                       read: {vix, where, bias}, bots: [...] }
//   alerts(home, lite, board, nowS) -> [{ t, icon, tone, text, acct, ageS }] newest first, max 20
// Sources only: nq/brief.json (tools/premarket_brief.py, docs/BRIEF.md v 1), nq/news_week.json, the PC's post (pc.glance levels, brd events,
// board trades), board/board.json (the published event log). An old brief says so ("plan from Thu - today's not built yet"). BLITZ never shows.
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(+v) ? null : +v);
let FMT = null;
export function et(tS) {
  try {
    const p = Object.fromEntries((FMT || (FMT = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' })))
      .formatToParts(new Date(tS * 1000)).map((x) => [x.type, x.value]));
    return { day: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}`, wd: p.weekday };
  } catch (_) { const d = new Date(tS * 1000).toISOString(); return { day: d.slice(0, 10), hm: d.slice(11, 16), wd: '' }; }
}
const mod = (hm) => { const m = /^(\d\d):(\d\d)/.exec(String(hm || '')); return m ? +m[1] * 60 + +m[2] : null; };
const hmOf = (m) => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((m % 60) + 60) % 60).padStart(2, '0')}`;
/** the CME trading day of a moment (from 18:00 ET it is the next weekday's) */
export function tradeDay(nowS) {
  const p = et(nowS); let d = new Date(p.day + 'T12:00:00Z');
  if (mod(p.hm) >= 1080) d = new Date(d.getTime() + 86400000);
  while ([0, 6].includes(d.getUTCDay())) d = new Date(d.getTime() + 86400000);
  return d.toISOString().slice(0, 10);
}
const pos = (m) => (((m - 1080) % 1440) + 1440) % 1440 / 1380;          // 18:00 -> 0, 17:00 -> 1 (23 h)
const SESS = [{ id: 'asia', label: 'Asia', from: 1080, to: 120 }, { id: 'london', label: 'London', from: 120, to: 480 }, { id: 'ny', label: 'NY', from: 480, to: 960 }];
const WD = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });

export function plan(brief, news, home, nowS) {
  const B = isObj(brief) && (brief.v === undefined || brief.v === 1) ? brief : null, today = tradeDay(nowS);
  if (!B) return { has: false, day: today, stale: true, staleText: "No battle plan yet: the pre-market brief (nq/brief.json) is not on the site.", map: null, levels: null, news: [], read: null, bots: [] };
  const day = String(B.day || ''), stale = !!day && day < today;
  const early = typeof B.early_close === 'string' && mod(B.early_close) !== null ? B.early_close : null;
  // 1. the session map: Asia / London / New York, each bot's window, the early halt, now
  const haltM = early ? mod(early) : 960;
  const segs = SESS.map((s) => ({ id: s.id, label: s.label, a: pos(s.from), b: s.id === 'ny' ? pos(Math.min(s.to, haltM)) : pos(s.to) || 1 }));
  const wins = arr(B.bots).filter((b) => isObj(b) && !/blitz/i.test(String(b.id) + b.name)).flatMap((b) => arr(b.windows).filter(isObj).map((w) => {
    const a = mod(w.from), z = mod(w.to); return a === null || z === null ? null : { bot: String(b.name || b.id).replace(/\s*\(LIT\)/, '').replace(/^Rapid EOD 25K$/, 'Rapid 25K'), id: String(b.id), from: w.from, to: w.to, a: pos(a), b: pos(z), state: String(b.state || '') };
  }).filter(Boolean));
  const nowM = mod(et(nowS).hm), live = !stale && day === today;
  const map = { segs, wins, halt: early ? { at: early, x: pos(haltM) } : null, now: live && nowM !== null ? pos(nowM) : null };
  // 2. the key levels: the PC's live glance (with its distance) when there, else the brief's list (distance from the brief's last price)
  const h = isObj(home) ? home : {}, g = isObj(h.live) && isObj(h.live.pc) && isObj(h.live.pc.glance) ? h.live.pc.glance : null;
  const glit = g ? arr(g.bots).find((b) => isObj(b) && b.id === 'lit') : null;
  let rows = arr(glit && glit.lv).filter((x) => Array.isArray(x) && num(x[1]) !== null).map((x) => ({ name: String(x[0] || ''), px: num(x[1]), dist: num(x[2]), src: 'pc' }));
  let price = null, priceSrc = '';
  if (rows.length && rows.some((r) => r.dist !== null)) { const r = rows.find((x) => x.dist !== null); price = Math.round((r.px - r.dist) * 4) / 4; priceSrc = "the PC's last report"; }
  if (!rows.length) {
    const mk = isObj(B.market) ? B.market : {}, last = num(mk.last), litB = arr(B.bots).find((b) => isObj(b) && b.id === 'lit');
    const watch = new Set(arr(litB && litB.watch).map((w) => isObj(w) && w.name));
    rows = arr(mk.levels).filter((x) => isObj(x) && num(x.price) !== null).map((x) => ({ name: String(x.name || ''), px: num(x.price), dist: num(x.dist_pts) ?? (last !== null ? num(x.price) - last : null), src: 'brief', watched: watch.has(x.name) }));
    price = last; priceSrc = last !== null ? `the brief's last price (${B.data && B.data.bars_to ? 'bars to ' + B.data.bars_to : 'its date'})` : '';
  }
  const seen = new Set();
  rows = rows.filter((r) => { const k = r.name + '|' + r.px; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => Math.abs(a.dist ?? 1e9) - Math.abs(b.dist ?? 1e9)).slice(0, 5).sort((a, b) => b.px - a.px);
  // 3. today's news: the brief's today list (when it is today's) else news_week's high-impact events of the day; who pauses when
  let evs = !stale ? arr(B.news && B.news.today).filter(isObj).map((e) => ({ time: String(e.time || ''), title: String(e.event || e.title || ''), tier: num(e.tier) })) : [];
  if (!evs.length) evs = arr(isObj(news) ? news.events : null).filter((e) => isObj(e) && e.date === today && /high/i.test(e.impact || 'high')).map((e) => ({ time: String(e.time || ''), title: String(e.title || ''), tier: 1 }));
  const nowHm = et(nowS).hm;
  const newsRows = evs.filter((e) => e.title).map((e) => {
    const m = mod(e.time), t1 = e.tier === 1 || e.tier === null;
    const pause = m !== null && t1 ? `Rapid lanes flat ${hmOf(m - 3)} to ${hmOf(m + 2)}:30 ET (MFFU Rapid bans 2 min either side; the bot keeps 3 min before / 2.5 after)` : '';
    return { time: e.time, title: e.title, tier1: t1, past: live && !!e.time && e.time < nowHm, pause,
      builders: 'Builder bots (Zlarior, ATLAS) trade through with their normal stop (MFFU Builder allows news)' };
  });
  // 4. the market read
  const mk = isObj(B.market) ? B.market : {}, vx = isObj(mk.vix) ? mk.vix : null, bias = isObj(B.bias) ? B.bias : null;
  const read = { vix: vx && num(vx.value) !== null ? `VIX ${num(vx.value).toFixed(1)} (${vx.band || '?'}): one day's move about ${Math.round(num(vx.day_move_pts) || 0)} pts${vx.date ? ` (VIX of ${vx.date})` : ''}` : '',
    where: String(mk.where_text || ''), bias: bias ? (String(bias.call || '').match(/up|down/i) ? `Bias ${String(bias.call).toUpperCase()}${bias.context_only !== false ? ' (context only, never a trade signal)' : ''}` : `No bias call${bias.why_none ? ': ' + bias.why_none : ''}`) : '',
    day: String(B.day_type || B.forecast || ''), from: stale || rows.some((r) => r.src === 'pc') ? `the brief of ${WD(day || today)}` : '' };
  // 5. one line per bot: what it needs to trade today
  const bots = arr(B.bots).filter((b) => isObj(b) && !/blitz/i.test(String(b.id) + b.name)).map((b) => {
    const wf = String(b.waiting_for || ''), cut = wf.indexOf('. '), s1 = cut > 0 ? wf.slice(0, cut + 1) : wf;   // the first sentence (no lookbehind: Safari 16)
    const need = s1.length <= 240 ? s1 : s1.slice(0, s1.lastIndexOf(' ', 236)) + '...';                      // never cut mid-word
    const st = String(b.state || ''), win = arr(b.windows).filter(isObj).map((w) => `${w.from}-${w.to}`).join(', ');
    return { id: String(b.id), name: String(b.name || b.id), state: stale ? '' : st === 'done' ? 'window over' : st === 'off_today' ? 'off today' : st === 'open' ? 'window open' : st === 'later' ? 'later today' : st,
      window: win ? `${win} ET` : '', need, max: num(b.max_trades) };
  });
  return { has: true, day, dayText: WD(day || today), stale, staleText: stale ? `Plan from ${WD(day)} - today's (${WD(today)}) is not built yet. Levels and news below are that day's.` : '',
    early, headline: String(B.headline || ''), map, levels: { price, priceSrc, rows }, news: newsRows, read, bots };
}

// ------------------------------------------------------------------------------------------------ the alert history
const ICON = { entry: '▲', exit: '■', win: '✓', loss: '✗', warn: '⚠', note: '✎', start: '●', stop: '○', money: '$', info: '·' };
const KIND = { eval_passed: ['win', 'up'], eval_failed: ['loss', 'down'], account_locked: ['warn', 'bad'], order_rejected: ['warn', 'bad'], payout_ready: ['money', 'up'],
  payout_requested: ['money', 'up'], balance: ['info', ''], bot_started: ['start', 'up'], bot_stopped: ['stop', 'bad'], pc_silent: ['warn', 'bad'], owner_note: ['note', ''],
  claude_note: ['note', ''], plan_changed: ['info', ''], daily_review: ['info', ''], brief: ['info', ''], risk_alert: ['warn', 'bad'], weekly_review: ['info', ''],
  combo_trade: ['entry', 'warm'], self_heal: ['warn', 'bad'] };
const ACCT = { zlarior: 'Zlarior 50K', lit: 'Zlarior', fresh25: 'Zlarior 25K #2', atlas: 'ATLAS', rapid1: 'Rapid EOD 25K' };
export function alerts(home, lite, board, nowS) {
  const out = [], seen = new Set(), push = (r) => { const k = `${Math.round(r.t / 60)}|${r.text.slice(0, 40)}`; if (!r.t || seen.has(k)) return; seen.add(k); out.push(r); };
  const ev = (t, kind, acct, text, src) => {
    if (/blitz/i.test(`${acct} ${text}`)) return;
    const [ic, tone] = KIND[kind] || ['info', ''];
    const tx = String(text || ''); push({ t: +t, icon: ICON[ic], tone, kind, acct: ACCT[acct] || '', text: tx.length <= 160 ? tx : tx.slice(0, tx.lastIndexOf(' ', 156)) + '...', src });
  };
  const brd = isObj(lite) && isObj(lite.brd) ? lite.brd : null;
  for (const x of arr(brd && brd.ev)) if (Array.isArray(x) && num(x[0])) ev(x[0], x[1], x[2], x[3], 'pc');
  for (const e of arr(isObj(board) ? board.events : null)) if (isObj(e) && num(e.t)) ev(e.t, e.kind, e.acct || '', e.text, 'board');
  const h = isObj(home) ? home : {};
  for (const t of arr(isObj(h.board) ? h.board.trades : null)) {
    if (!isObj(t) || t.src === 'paper' || /blitz/i.test(String(t.acct))) continue;
    const who = /atlas/i.test(String(t.acct)) ? 'ATLAS' + (t.member ? ' ' + t.member : '') : 'Zlarior', side = String(t.side || '').toUpperCase();
    if (num(t.entry_t)) push({ t: +t.entry_t, icon: ICON.entry, tone: 'warm', kind: 'entry', acct: who, text: `${who} ${side} entered`, src: 'trade' });
    if (num(t.exit_t) && !t.open) {
      const usd = num(t.usd), win = (usd || 0) >= 0;
      push({ t: +t.exit_t, icon: win ? ICON.win : ICON.loss, tone: win ? 'up' : 'down', kind: 'exit', acct: who,
        text: `${who} ${side} closed${t.exit ? ' (' + t.exit + ')' : ''}${usd !== null ? ` ${usd >= 0 ? '+' : '-'}$${Math.abs(Math.round(usd)).toLocaleString('en-US')}` : ''}`, src: 'trade' });
    }
  }
  return out.sort((a, b) => b.t - a.t).slice(0, 20).map((r) => ({ ...r, ageS: Math.max(0, nowS - r.t) }));
}
