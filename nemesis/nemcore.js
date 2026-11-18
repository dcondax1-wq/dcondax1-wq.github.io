// NEMESIS core (ES module, no DOM, no clock, no network): the loss post-mortem as plain functions.
// Every losing trade the site shows is a "fallen" figure. This file turns the site's own trade rows (../odeon/trades.json) into
//   parseTrades(doc)                 -> the trades, oldest first, one row per real setup (a real fill hides its paper / backtest twin)
//   replayRoom(trades, rules)        -> adds room (balance minus the trailing floor, before the trade) by replaying a fresh 50K eval
//   autopsy(t, ctx)                  -> { verdict, tone, rows[], flags[], lesson, who, tags }   the plain-words autopsy of one loss
//   fallen(trades, tags)             -> every loss (usd < -$25) with its autopsy, oldest first
//   weeks(list) / weekKey(day)       -> Monday-based week keys
//   leaks(list)                      -> the ranked leaks with their $ cost, + the plain plan losses
//   vowText(id) / obsidianLesson(a) / obsidianWeek(w)   the texts (the Copy button formats them; nothing is sent anywhere)
// Fields it reads (all already on the site): day, side, strat, src, usd, r, qty, risk_usd, risk_pts, stop, sweep.ext_px, entry.t,
// exit.kind, held_min, mfe_r, mae_r, off (seconds east of UTC), twin {qty, usd}, events (the 1m CISD and the limit price) and the
// Zenith journal tags (le.jtags on this phone). A missing field is reported as "not recorded", never guessed.
// Honest limits: manual trades are not on the site; the room before a trade is an estimate (the shown trades replayed through a
// fresh 50K eval that restarts after every pass or bust); a rule of thumb is labelled as one.

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : typeof x === 'string' && x.trim() && Number.isFinite(+x) ? +x : null);

export const TICK = 0.25;
export const LOSS_MIN = 25;                       // a trade that lost less than $25 is a scratch (break-even + costs), not a fallen
export const WINDOW = [120, 930];                 // entries 02:00-15:30 New York (the bot's rule), in minutes
export const HEAVY = 0.35;                        // rule of thumb: more than a third of the room on one trade is heavy
export const CAP = 0.8;                           // the bot's own ceiling in an eval: 80% of the room
export const EVAL = Object.freeze({ start: 50000, target: 3000, mll: 2000, lock: 100 });
export const RANK = { real: 3, paper: 2, backtest: 1 };

export const BUCKETS = [
  { id: 'open', name: 'London open', from: 120, to: 300, span: '02:00-05:00' },
  { id: 'lon', name: 'London', from: 300, to: 480, span: '05:00-08:00' },
  { id: 'pre', name: 'Pre-NY', from: 480, to: 570, span: '08:00-09:30' },
  { id: 'ny', name: 'NY open', from: 570, to: 690, span: '09:30-11:30' },
  { id: 'mid', name: 'Midday', from: 690, to: 840, span: '11:30-14:00' },
  { id: 'pm', name: 'Afternoon', from: 840, to: 930, span: '14:00-15:30' },
];
export const bucketOf = (m) => (m == null ? null : BUCKETS.find((b) => m >= b.from && m < b.to) || null);

export const LEAKS = {
  stopinside: { name: 'Stop inside the sweep', hard: true, vow: 'My stop goes 1 tick beyond the sweep extreme, never inside it.', short: 'stop inside' },
  nobe: { name: 'No break-even at 1R', hard: true, vow: 'The moment a trade reaches 1R, the stop goes to break-even. No exceptions.', short: 'no BE at 1R' },
  window: { name: 'Outside the hours', hard: true, vow: 'I only enter between 02:00 and 15:30 New York time.', short: 'outside hours' },
  second: { name: 'Second trade of the day', hard: true, vow: 'One trade a day. After the first one I close the chart.', short: '2nd trade' },
  oversize: { name: 'Heavy size', hard: false, vow: 'I never risk more than a third of my room on one trade, and never size above the bot.', short: 'heavy size' },
  streak: { name: 'Trading after 2 losses', hard: false, vow: 'After two losses in a row I stop for the day and write the lesson instead of trading.', short: 'after 2 losses' },
  late: { name: 'Late entry', hard: false, vow: 'I enter on the 1m CISD close. If I missed it, I let it go.', short: 'late entry' },
  skip: { name: 'You said: would skip', hard: false, vow: 'If my gut says I would skip it, I skip it.', short: 'would skip' },
};
export const LEAK_IDS = Object.keys(LEAKS);
const TAG_LEAK = { 'Late entry': 'late', 'Would skip': 'skip' };

// ------------------------------------------------------------------------------------------------ parse
function eventTime(events, kind) { const e = Array.isArray(events) ? events.find((x) => isObj(x) && x.k === kind) : null; return e && num(e.t) != null ? { t: num(e.t), price: num(e.price) } : null; }

export function parseTrades(doc) {
  const rows = isObj(doc) && Array.isArray(doc.trades) ? doc.trades : Array.isArray(doc) ? doc : [];
  const out = [];
  for (const t of rows) {
    if (!isObj(t)) continue;
    const usd = num(t.usd), day = typeof t.day === 'string' && /^\d{4}-\d{2}-\d{2}/.test(t.day) ? t.day.slice(0, 10) : '';
    if (usd == null || !day) continue;
    const side = /^(long|short)$/i.test(String(t.side || '')) ? String(t.side).toUpperCase() : null;
    const entry = isObj(t.entry) ? t.entry : {}, ex = isObj(t.exit) ? t.exit : {}, sw = isObj(t.sweep) ? t.sweep : null;
    const cis = eventTime(t.events, 'cisd1'), lim = eventTime(t.events, 'limit');
    const off = num(t.off), entryT = num(entry.t), tw = isObj(t.twin) ? t.twin : null;
    const m = entryT != null && off != null ? Math.floor((((entryT + off) % 86400) + 86400) % 86400 / 60) : null;
    out.push({
      day, side, strat: String(t.strat || t.bot || 'LIT'), src: String(t.src || 'trade'), usd, r: num(t.r),
      qty: num(t.qty), riskUsd: num(t.risk_usd != null ? t.risk_usd : t.risk), riskPts: num(t.risk_pts), stop: num(t.stop),
      sweepExt: sw ? num(sw.ext_px) : null, entryPx: num(entry.px), entryT, minute: m, hhmm: m == null ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`,
      exitKind: ex.kind ? String(ex.kind) : '', heldMin: num(t.held_min), mfeR: num(t.mfe_r), maeR: num(t.mae_r), planRr: num(t.plan_rr),
      cisdT: cis ? cis.t : num(t.cisd1_t), limitPx: lim && lim.price != null ? lim.price : num(t.limit_px), be: t.be != null && t.be !== false,
      twin: tw ? { qty: num(tw.qty), usd: num(tw.usd), src: String(tw.src || '') } : null,
      id: String(t.id || ''), key: '',
    });
  }
  // one row per real setup: the same day, side and entry time is one trade seen by the PC, the cloud and the backtest
  const best = new Map();
  for (const t of out) {
    t.key = t.entryT != null ? `${t.day}|${t.side}|${t.entryT}` : `${t.day}|${t.side}|${t.src}|${t.usd}`;
    const old = best.get(t.key);
    if (!old) { best.set(t.key, t); continue; }
    const [hi, lo] = (RANK[t.src] || 0) > (RANK[old.src] || 0) ? [t, old] : [old, t];
    if (!hi.twin && lo.qty != null) hi.twin = { qty: lo.qty, usd: lo.usd, src: lo.src };
    best.set(t.key, hi);
  }
  return [...best.values()].map((t, i) => ({ t, i })).sort((a, b) => (a.t.day !== b.t.day ? (a.t.day < b.t.day ? -1 : 1) : (a.t.entryT ?? 0) - (b.t.entryT ?? 0) || a.i - b.i)).map((x, i) => Object.assign(x.t, { n: i }));
}

/** the room before each LIT trade, by replaying the shown trades through a fresh 50K eval (restarted after every pass / bust): an estimate */
export function replayRoom(trades, R = EVAL) {
  let bal = R.start, peak = R.start;
  for (const t of trades) {
    if (t.strat !== 'LIT') continue;
    const floor = Math.min(R.start + R.lock, peak - R.mll);
    t.room = Math.max(1, bal - floor); t.balBefore = bal;
    bal += t.usd; peak = Math.max(peak, bal);
    if (bal <= Math.min(R.start + R.lock, peak - R.mll) || bal >= R.start + R.target) { bal = R.start; peak = R.start; }
  }
  return trades;
}

// ------------------------------------------------------------------------------------------------ helpers
const pct = (x) => `${Math.round(x * 100)}%`;
export const usd = (x) => { const v = Math.round(+x || 0), s = '$' + Math.abs(v).toLocaleString('en-US'); return v < 0 ? '-' + s : s; };
const usd0 = (x) => usd(Math.abs(x));
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
const pts = (x) => `${(+x).toFixed(2).replace(/\.?0+$/, '')} pts`;
export const isLoss = (t) => t.usd < -LOSS_MIN;
export const isWin = (t) => t.usd > LOSS_MIN;

export function weekKey(day) {                    // the Monday of that day's week, 'YYYY-MM-DD' (UTC maths on the date only)
  const d = new Date(day + 'T00:00:00Z'), dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dayText = (day) => `${MON[+day.slice(5, 7) - 1]} ${+day.slice(8, 10)}`;
export function weekText(wk) {
  const d = new Date(wk + 'T00:00:00Z'), e = new Date(d.getTime() + 6 * 86400000);
  const a = d.toISOString().slice(0, 10), b = e.toISOString().slice(0, 10);
  return `${dayText(a)} - ${a.slice(5, 7) === b.slice(5, 7) ? +b.slice(8, 10) : dayText(b)}`;
}

function summary(list) {
  const w = list.filter(isWin).length, l = list.filter(isLoss).length, net = list.reduce((s, t) => s + t.usd, 0);
  return { n: list.length, wins: w, losses: l, win: w + l ? w / (w + l) : null, net, avg: list.length ? net / list.length : 0 };
}
const small = (n) => (n < 10 ? ` Only ${n} trades, so treat it as a hint, not a fact.` : '');

// ------------------------------------------------------------------------------------------------ flags
/** every check on one losing trade; each flag has { id, cost } where cost is the part of the loss that leak explains */
function flagsOf(t, all, tags) {
  const f = [];
  const lit = t.strat === 'LIT', loss = Math.abs(t.usd);
  const i = all.indexOf(t);
  if (lit && t.stop != null && t.sweepExt != null && t.side) {
    const beyond = (t.side === 'SHORT' ? t.stop - t.sweepExt : t.sweepExt - t.stop) / TICK;
    if (beyond < 0.5) f.push({ id: 'stopinside', cost: loss, beyond });
  }
  if (lit && t.mfeR != null && t.mfeR >= 1 && /^STOP$/i.test(t.exitKind) && t.usd < -LOSS_MIN) f.push({ id: 'nobe', cost: loss });
  if (lit && t.minute != null && (t.minute < WINDOW[0] || t.minute >= WINDOW[1])) f.push({ id: 'window', cost: loss });
  if (lit) {
    const before = all.filter((x, k) => k < i && x.strat === 'LIT' && x.day === t.day);
    if (before.length) f.push({ id: 'second', cost: loss, n: before.length + 1 });
  }
  if (lit) {
    let cost = 0, why = '';
    const share = t.room && t.riskUsd ? t.riskUsd / t.room : null;
    if (share != null && share > HEAVY) { cost = Math.max(cost, loss * (1 - HEAVY / share)); why = 'room'; }
    let hard = false;
    if (t.twin && t.twin.qty && t.qty && t.qty > t.twin.qty * 1.1) { cost = Math.max(cost, loss * (1 - t.twin.qty / t.qty)); why = 'twin'; hard = true; }
    if (share != null && share > CAP) { why = 'cap'; hard = true; }
    if (why) f.push({ id: 'oversize', cost: Math.max(1, cost), share, why, hard });
  }
  if (lit) {
    const prev = all.filter((x, k) => k < i && x.strat === 'LIT');
    if (prev.length >= 2 && isLoss(prev[prev.length - 1]) && isLoss(prev[prev.length - 2])) f.push({ id: 'streak', cost: loss });
  }
  if (lit) {                                     // the entry is the 1m CISD close by design; 3+ minutes after it is late
    const lateS = t.cisdT != null && t.entryT != null ? t.entryT - t.cisdT : null;
    if (lateS != null && lateS >= 180) f.push({ id: 'late', cost: loss, lateS });
  }
  for (const g of tags || []) { const id = TAG_LEAK[g]; if (id && !f.some((x) => x.id === id)) f.push({ id, cost: loss, tag: g }); }
  return f;
}

// ------------------------------------------------------------------------------------------------ the autopsy
export function autopsy(t, all, tags = []) {
  const flags = flagsOf(t, all, tags), lit = t.strat === 'LIT';
  const isHard = (x) => (x.hard != null ? x.hard : LEAKS[x.id].hard);
  const hard = flags.filter(isHard), soft = flags.filter((x) => !isHard(x));
  const who = t.src === 'real' ? 'Your trade on the 50K (real)' : t.src === 'paper' ? 'The cloud paper bot' : t.src === 'backtest' ? 'The bot in the backtest' : 'A trade';
  const bucket = bucketOf(t.minute);
  const rows = [];
  const flag = (id) => flags.find((x) => x.id === id);

  // 1. plan or rule break
  let verdict, tone;
  if (!lit) { verdict = 'Other strategy'; tone = 'plan'; }
  else if (hard.length) { verdict = 'RULE BREAK'; tone = 'break'; }
  else if (soft.length) { verdict = 'PLAN, WITH A LEAK'; tone = 'soft'; }
  else { verdict = 'PLAN LOSS'; tone = 'plan'; }
  const names = (a) => a.map((x) => LEAKS[x.id].short).join(', ');
  rows.push({ id: 'plan', label: 'Plan or rule break?', st: tone === 'break' ? 'bad' : tone === 'soft' ? 'warn' : 'ok',
    text: !lit ? `A ${t.strat} trade from the second strategies. The LIT rules below are not checked for it, only the money and the time.`
      : hard.length ? `Rule break: ${names(hard)}.${soft.length ? ` Plus: ${names(soft)}.` : ''}`
        : soft.length ? `Followed the bot's rules, but a flag: ${names(soft)}.`
          : `${t.src === 'real' ? 'You' : 'The bot'} followed the rules. The stop was hit, which is the price of the edge, not a mistake.` });

  // 2. the stop
  if (!lit) rows.push({ id: 'stop', label: 'Stop beyond the sweep extreme?', st: 'na', text: 'Not checked: this strategy does not use the LIT sweep stop.' });
  else if (t.stop == null || t.sweepExt == null || !t.side) rows.push({ id: 'stop', label: 'Stop beyond the sweep extreme?', st: 'na', text: `Not recorded: the site has no sweep extreme for this trade${t.stop != null ? ` (the stop is ${t.stop}${t.riskPts ? `, ${pts(t.riskPts)} from the entry` : ''})` : ''}, so I cannot check it. I will not guess.` });
  else {
    const beyond = (t.side === 'SHORT' ? t.stop - t.sweepExt : t.sweepExt - t.stop) / TICK;
    rows.push({ id: 'stop', label: 'Stop beyond the sweep extreme?', st: beyond < 0.5 ? 'bad' : 'ok',
      text: beyond < 0.5 ? `No: the stop (${t.stop}) sits ${Math.abs(beyond * TICK).toFixed(2)} pts ${beyond < 0 ? 'inside' : 'on'} the sweep ${t.side === 'SHORT' ? 'high' : 'low'} (${t.sweepExt}). The plan is 1 tick beyond it.`
        : `Yes: the stop (${t.stop}) is ${beyond.toFixed(beyond % 1 ? 1 : 0)} tick${Math.round(beyond) === 1 ? '' : 's'} beyond the sweep ${t.side === 'SHORT' ? 'high' : 'low'} (${t.sweepExt})${t.riskPts ? `, a ${pts(t.riskPts)} stop` : ''}.` });
  }

  // 3. size against the room
  const sz = [];
  let szSt = 'ok';
  if (t.riskUsd != null && t.room) {
    const sh = t.riskUsd / t.room;
    sz.push(`Risk ${usd0(t.riskUsd)}${t.qty ? ` (${plural(t.qty, 'micro', 'micros')})` : ''} against about ${usd0(t.room)} of room: ${pct(sh)}.`);
    if (sh > CAP) { szSt = 'bad'; sz.push(`That is past the bot's own ceiling of ${pct(CAP)} of the room.`); }
    else if (sh > HEAVY) { szSt = 'warn'; sz.push(`Heavy: my rule of thumb is a third (${pct(HEAVY)}) of the room at most. Inside the bot's ${pct(CAP)} ceiling.`); }
    else sz.push('Fine: well inside a third of the room.');
  } else if (t.riskUsd != null) sz.push(`Risk ${usd0(t.riskUsd)}. The room before this trade is not known for a ${t.strat} trade.`);
  else sz.push('Not recorded: no risk in $ on the site for this trade.');
  if (t.twin && t.twin.qty != null && t.qty != null) {
    if (t.qty > t.twin.qty * 1.1) { szSt = 'bad'; sz.push(`You traded ${t.qty} micros; the bot's twin took ${t.twin.qty}. Oversize by ${t.qty - t.twin.qty}.`); }
    else if (t.qty < t.twin.qty) sz.push(`You traded ${t.qty} micros; the bot's twin took ${t.twin.qty}. Smaller than the bot: it saved you ${usd0((t.twin.usd ?? 0) - t.usd)}.`);
    else sz.push(`Same size as the bot's twin (${t.twin.qty} micros).`);
  }
  rows.push({ id: 'size', label: 'Size against the room', st: szSt, text: sz.join(' ') });

  // 4. time of day
  const peers = all.filter((x) => x !== t && x.strat === 'LIT');
  const inB = bucket ? peers.filter((x) => bucketOf(x.minute) === bucket) : [];
  const sB = summary(inB);
  let tText;
  if (t.minute == null) tText = 'Not recorded: no entry time on the site for this trade.';
  else {
    tText = `Entered at ${t.hhmm} New York` + (bucket ? ` (${bucket.name}, ${bucket.span}).` : ' (outside the 02:00-15:30 window).');
    if (bucket && sB.n >= 3) tText += ` Other ${bucket.name} trades: ${sB.wins} wins, ${sB.losses} losses, ${usd(sB.net)} in total.${small(sB.n)}`;
  }
  rows.push({ id: 'time', label: 'Time of day', st: !lit ? 'na' : t.minute == null ? 'na' : flag('window') ? 'bad' : (bucket && sB.n >= 10 && sB.win != null && sB.win < 0.4) ? 'warn' : 'ok', text: tText });

  // 5. what the twin / backtest says
  const sd = peers.filter((x) => x.side === t.side), band = t.riskPts == null ? null : t.riskPts < 35 ? 'tight' : t.riskPts < 60 ? 'middle' : 'wide';
  const bandOf = (x) => (x.riskPts == null ? null : x.riskPts < 35 ? 'tight' : x.riskPts < 60 ? 'middle' : 'wide');
  const sBand = band ? summary(peers.filter((x) => bandOf(x) === band)) : null, sS = summary(sd);
  const tw = [];
  if (t.twin && t.twin.usd != null) tw.push(`The bot's ${t.twin.src || 'twin'} took the same setup${t.twin.qty ? ` with ${t.twin.qty} micros` : ''} and ${t.twin.usd < 0 ? 'lost' : 'made'} ${usd0(t.twin.usd)}. Same signal, same result.`);
  else if (t.src === 'backtest') tw.push('This is the backtest of the bot, so the bot would have lost this one too.');
  if (lit && sS.n >= 3) tw.push(`All ${t.side ? t.side.toLowerCase() : ''} trades on the site: ${sS.wins} wins, ${sS.losses} losses, ${usd(sS.net)}.`);
  if (lit && sBand && sBand.n >= 3) tw.push(`${band[0].toUpperCase() + band.slice(1)} stops (${pts(t.riskPts)}): ${sBand.wins} wins, ${sBand.losses} losses, ${usd(sBand.net)}.`);
  if (!tw.length) tw.push('Not enough other trades on the site to compare this setup.');
  const nCmp = Math.max(sS.n, sBand ? sBand.n : 0);
  rows.push({ id: 'twin', label: 'What the twin / backtest says', st: 'info', text: tw.join(' ') + small(nCmp) });

  // 6. what happened
  const hp = [];
  if (t.exitKind) hp.push(({ STOP: 'Stopped out', CUT_T15: 'Cut by the 15-minute rule', CUT: 'Cut early', BE: 'Closed at break-even', EOD: 'Closed at the end of the day', FLAT: 'Closed flat' })[t.exitKind.toUpperCase()] || `Exit ${t.exitKind}`);
  if (t.heldMin != null) hp.push(`after ${t.heldMin} min`);
  let happened = hp.length ? hp.join(' ') + '.' : 'Exit not recorded.';
  if (t.mfeR != null) happened += ` It ran ${t.mfeR.toFixed(2)}R in your favour first${t.mfeR >= 0.8 && t.mfeR < 1 ? ' (close to the 1R break-even)' : ''}.`;
  if (t.maeR != null && t.maeR > 1.05) happened += ` It went ${t.maeR.toFixed(2)}R against you at worst.`;
  const nb = flag('nobe');
  rows.push({ id: 'path', label: 'What happened', st: nb ? 'bad' : 'info', text: nb ? happened + ' It reached 1R, so the stop should have moved to break-even; it did not.' : happened });

  // habits: the streak, the day, the journal tags
  const hab = [];
  if (flag('streak')) hab.push('You took this after two losses in a row.');
  if (flag('second')) hab.push(`This was trade ${flag('second').n} of the day; the rule is one.`);
  const late = flag('late');
  if (late) hab.push(late.lateS != null ? `The entry came ${Math.round(late.lateS / 60)} min after the 1m CISD: late.` : 'You tagged it as a late entry in the journal.');
  if (tags.length) hab.push(`Your journal tags: ${tags.join(', ')}.`);
  rows.push({ id: 'habit', label: 'Habits', st: flag('streak') || flag('second') || late ? 'warn' : tags.length ? 'info' : 'ok', text: hab.length ? hab.join(' ') : 'No habit flag: not after a losing streak, first trade of the day, entry at the signal.' });

  // the one lesson
  const order = ['stopinside', 'nobe', 'window', 'second', 'oversize', 'streak', 'late', 'skip'];
  const top = order.map(flag).find(Boolean);
  let lesson;
  if (top) lesson = LEAKS[top.id].vow.replace(/^I /, 'Next time I ').replace(/^My /, 'Next time my ').replace(/^One /, 'Next time: one ').replace(/^After /, 'Next time, after ').replace(/^The /, 'Next time the ').replace(/^If /, 'Next time, if ');
  else if (!lit) lesson = 'Judge this strategy on its own sample, not on one stop-out.';
  else if (bucket && sB.n >= 10 && sB.win != null && sB.win < 0.4) lesson = `A normal stop-out, but ${bucket.name} entries win only ${pct(sB.win)} here. Think about sizing down in that window instead of skipping it.`;
  else {
    const five = t.riskUsd != null ? 5 * t.riskUsd : null;
    lesson = five && t.room ? `Nothing to fix. Keep each trade small enough that five of these in a row (${usd0(five)}) is ${pct(five / t.room)} of your room, and you can take the next one calmly.` : 'Nothing to fix: the plan was followed. A stop-out is part of the edge. Take the next signal.';
  }
  const cost = flags.reduce((s, x) => s + x.cost, 0);
  return { verdict, tone, rows, flags, lesson, who, tags, bucket: bucket ? bucket.id : null, planLoss: !flags.length };
}

// ------------------------------------------------------------------------------------------------ the fallen
export function readTags(raw) {                    // the Zenith journal tags: { 'YYYY-MM-DD_entryEpoch': ['Late entry', ...] }
  let o = raw;
  if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch (_) { o = null; } }
  if (isObj(o) && isObj(o.v)) o = o.v;
  const out = {};
  if (!isObj(o)) return out;
  for (const [k, v] of Object.entries(o)) if (Array.isArray(v)) out[k] = v.filter((x) => typeof x === 'string').slice(0, 12);
  return out;
}
export function tagsFor(t, tagMap) {
  const out = [];
  for (const [k, v] of Object.entries(tagMap || {})) {
    if (!k.startsWith(t.day + '_')) continue;
    const suf = k.slice(11);
    if (t.entryT != null && (suf === String(t.entryT) || suf === String(t.entryT * 1000) || suf.startsWith(t.hhmm))) out.push(...v);
  }
  return [...new Set(out)];
}

export function fallen(trades, tagMap = {}) {
  replayRoom(trades);
  return trades.filter(isLoss).map((t) => {
    const tags = tagsFor(t, tagMap);
    const a = autopsy(t, trades, tags);
    return Object.assign({}, { t, a, id: t.key, day: t.day, wk: weekKey(t.day), usd: t.usd, tone: a.tone });
  });
}

export function weeks(trades) {                    // every week with a trade, newest first, with its fallen count
  const m = new Map();
  for (const t of trades) { const k = weekKey(t.day); const w = m.get(k) || { wk: k, trades: 0, losses: 0 }; w.trades++; if (isLoss(t)) w.losses++; m.set(k, w); }
  return [...m.values()].sort((a, b) => (a.wk < b.wk ? 1 : -1));
}

/** the ranked leaks of a list of fallen: { id, name, n, cost }, biggest $ first; plus the plain plan losses (not leaks) */
export function leaks(list) {
  const m = new Map();
  let plan = { n: 0, cost: 0 }, lost = 0;
  for (const f of list) {
    lost += Math.abs(f.usd);
    if (!f.a.flags.length) { plan.n++; plan.cost += Math.abs(f.usd); continue; }
    for (const x of f.a.flags) { const r = m.get(x.id) || { id: x.id, name: LEAKS[x.id].name, hard: false, n: 0, cost: 0, days: [] }; r.n++; r.cost += x.cost; r.days.push(f.day); if (x.hard != null ? x.hard : LEAKS[x.id].hard) r.hard = true; m.set(x.id, r); }
  }
  const rank = [...m.values()].map((r) => Object.assign(r, { cost: Math.round(r.cost) })).sort((a, b) => b.cost - a.cost || b.n - a.n);
  return { rank, plan: { n: plan.n, cost: Math.round(plan.cost) }, lost: Math.round(lost), n: list.length };
}

export const vowText = (id) => (LEAKS[id] ? LEAKS[id].vow : 'I follow the plan again: same rules, same size, one trade at a time.');

// ------------------------------------------------------------------------------------------------ Obsidian texts (copy only)
export function obsidianLesson(f) {
  const t = f.t, a = f.a;
  const lines = [`### Nemesis autopsy: ${f.day} ${t.hhmm ? t.hhmm + ' ET ' : ''}${t.side || ''} ${t.strat} ${usd(t.usd)}`.replace(/\s+/g, ' '), `- Verdict: ${a.verdict} (${a.who})`];
  for (const r of a.rows) if (['plan', 'stop', 'size', 'time'].includes(r.id)) lines.push(`- ${r.label} ${r.text}`);
  lines.push(`- Lesson: ${a.lesson}`, '#nemesis #trading-lesson');
  return lines.join('\n');
}
export function obsidianWeek(wk, list, rk, vow) {
  const lines = [`## Nemesis: week of ${wk} (${weekText(wk)})`, `- Fallen: ${list.length}, lost ${usd(-rk.lost)}`];
  if (rk.rank.length) lines.push(`- Biggest leak: ${rk.rank[0].name}, ${usd(-rk.rank[0].cost)} (${plural(rk.rank[0].n, 'trade', 'trades')})`);
  else lines.push('- Biggest leak: none. Every loss followed the plan.');
  if (rk.plan.n) lines.push(`- Plan losses (the cost of the edge): ${rk.plan.n}, ${usd(-rk.plan.cost)}`);
  if (vow) lines.push(`- [${vow.done ? 'x' : ' '}] Vow: ${vow.text}`);
  if (list.length) { lines.push('', '### Lessons'); for (const f of list) lines.push(`- ${f.day} ${f.t.side || ''} ${usd(f.usd)}: ${f.a.lesson}`); }
  lines.push('', '#nemesis #weekly-review');
  return lines.join('\n');
}

export function plainWeek(list, rk) {
  if (!list.length) return 'No fallen this week. Nothing to review.';
  const top = rk.rank[0];
  return `${plural(list.length, 'loss', 'losses')}, ${usd(-rk.lost)}. ` + (top ? `Biggest leak: ${top.name}, ${usd(-top.cost)}.` : 'Every loss followed the plan: no leak.');
}
