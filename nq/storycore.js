// TODAY'S STORY: the model (day-nqports 2026-11-27). Pure ES module (no DOM / fetch / storage): node-tested (tests/test_nq_story.py).
// One story = the CME session (18:00 ET -> 17:00) as a timeline of key moments, each with the bars around it for a mini chart.
// Sources (never made up; a thin day says so):
//   bars      today: the PC's chart post (nq.js NQ_HOME.bars); past days: nq/replay/<day>.json bars (the PC's own 5-minute bars)
//   levels    the prior session's high / low (ports.json for today, else the previous replay day), the Asia range from the bars
//   thoughts  today only: the PC's thought stream (lite.glog: lit / atlas lines "Swept ... (0.18 ATR deep; ✗ LIT needs 0.5)", "Now: Stage - ...")
//   twin      past days: the replay twin's LIT / ATLAS steps, stopped setups (+ why), entries / exits on the same bars (labelled TWIN)
//   real      the PC's real trades (home.board.trades: entry / exit, $), labelled REAL; BLITZ and paper copies never
//   halt      a short CME day (ports.json cal today; past: the bars ending early)
// API: build(input) -> { day, moments: [{t, hm, emoji, kind, title, text, short, tone, level, tag}], waiting, thin, note, summary }
//      snap(bars, t, level) -> { pts: [[x, y]], mark: x, lvl: y | null } (0..1 coordinates for a mini chart)
//      storyLine(S) -> one line for the hero ("Story so far: 🌏 Asia 200 pts · 🇬🇧 took the Asia high 03:15 · LIT: waiting for a sweep")
//      tradeDay(tS), dayOf(bars)
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(+v) ? null : +v);
const arr = (v) => (Array.isArray(v) ? v : []);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const px = (v) => (num(v) === null ? '-' : (+v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const pts = (v) => `${Math.round(Math.abs(v)).toLocaleString('en-US')} pts`;
const usd = (v) => (num(v) === null ? '' : `${v < 0 ? '-' : '+'}$${Math.round(Math.abs(v)).toLocaleString('en-US')}`);
function et(tS) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(tS * 1000)).map((x) => [x.type, x.value]));
    return { day: `${p.year}-${p.month}-${p.day}`, m: +p.hour * 60 + +p.minute, hm: `${p.hour}:${p.minute}` };
  } catch (_) { const d = new Date(tS * 1000); return { day: d.toISOString().slice(0, 10), m: d.getUTCHours() * 60 + d.getUTCMinutes(), hm: d.toISOString().slice(11, 16) }; }
}
const addDays = (iso, k) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); };
export function tradeDay(tS) { const e = et(tS); let d = e.m >= 1080 ? addDays(e.day, 1) : e.day; const wd = new Date(d + 'T12:00:00Z').getUTCDay(); if (wd === 6) d = addDays(d, 2); if (wd === 0) d = addDays(d, 1); return d; }
export function dayOf(bars) { const B = arr(bars); return B.length ? tradeDay(num(B[B.length - 1][0])) : ''; }
const prevDay = (iso) => { let d = addDays(iso, -1); const wd = new Date(d + 'T12:00:00Z').getUTCDay(); if (wd === 0) d = addDays(d, -2); if (wd === 6) d = addDays(d, -1); return d; };
/** an ET "HH:MM" inside the session of `day` -> epoch (>= 18:00 = the evening before) */
function hmToT(day, hm) {
  const m = /^(\d\d):(\d\d)/.exec(String(hm || '')); if (!m) return null;
  const mins = +m[1] * 60 + +m[2], d = mins >= 1080 ? addDays(day, -1) : day;   // 18:00+ belongs to the evening before (Sunday evening for Monday)
  const guess = Date.parse(`${d}T${m[1]}:${m[2]}:00Z`) / 1000, e = et(guess);
  return guess - ((e.m - mins) + (e.day < d ? -1440 : e.day > d ? 1440 : 0)) * 60;
}
const emojiAt = (m) => (m >= 1080 || m < 120 ? '🌏' : m < 480 ? '🇬🇧' : '🗽');
const placeAt = (m) => (m >= 1080 || m < 120 ? 'Asia' : m < 480 ? 'London' : 'New York');

// ------------------------------------------------------------------------------------------------ the bars' own moments
function barMoments(day, B, prior, normalAsia, live, nowS) {
  const out = [];
  if (!B.length) return out;
  let aHi = null, aLo = null, aEnd = null;
  for (const b of B) { const m = et(b[0]).m; if (m >= 1080 || m < 120) { aHi = aHi === null ? b[2] : Math.max(aHi, b[2]); aLo = aLo === null ? b[3] : Math.min(aLo, b[3]); aEnd = b[0]; } }
  const pastAsia = B.some((b) => { const m = et(b[0]).m; return m >= 120 && m < 1020; });
  if (aHi !== null) {
    const r = aHi - aLo, n = num(normalAsia);
    const vs = n ? (r > n * 1.3 ? `wide (normal ${pts(n)})` : r < n * 0.7 ? `tight (normal ${pts(n)})` : `normal size (${pts(n)})`) : '';
    out.push({ t: pastAsia ? hmToT(day, '02:00') : aEnd, emoji: '🌏', kind: 'asia', title: pastAsia ? 'Asia range set' : 'Asia so far', tone: 'calm',
      text: `${px(aLo)} - ${px(aHi)}: ${pts(r)}${vs ? ', ' + vs : ''}.`, short: `🌏 Asia ${pts(r)}`, level: null });
  }
  const lv = [];
  if (prior && num(prior.pdh) !== null) lv.push({ id: 'pdh', name: "the prior day's high", px: num(prior.pdh), up: true, from: 0 });
  if (prior && num(prior.pdl) !== null) lv.push({ id: 'pdl', name: "the prior day's low", px: num(prior.pdl), up: false, from: 0 });
  if (aHi !== null && pastAsia) { lv.push({ id: 'ahi', name: 'the Asia high', px: aHi, up: true, from: 120 }); lv.push({ id: 'alo', name: 'the Asia low', px: aLo, up: false, from: 120 }); }
  for (const L of lv) {
    const hit = B.find((b) => { const m = et(b[0]).m; if (L.from && (m >= 1080 || m < L.from)) return false; return L.up ? b[2] > L.px : b[3] < L.px; });
    if (!hit) continue;
    const m = et(hit[0]).m, depth = L.up ? hit[2] - L.px : L.px - hit[3];
    out.push({ t: hit[0], emoji: emojiAt(m), kind: 'sweep', tone: 'warm', level: L.px, title: `${placeAt(m)} took ${L.name}`,
      text: `${px(L.px)} ${L.up ? 'broken above' : 'broken below'} (${pts(depth)} through in that 5-minute bar).`, short: `${emojiAt(m)} took ${L.name.replace('the ', '')} ${et(hit[0]).hm}` });
  }
  const ny = B.find((b) => et(b[0]).m === 570);
  if (ny) out.push({ t: ny[0], emoji: '🔔', kind: 'open', tone: 'calm', level: null, title: 'New York cash open', text: `NQ at ${px(ny[1])}.`, short: `🔔 NY open ${px(ny[1])}` });
  const last = B[B.length - 1], lm = et(last[0]).m;
  if (!live && lm < 945 && lm >= 600) {               // a past day whose bars stop well before 16:00: a short CME day
    const h = lm + 5;
    out.push({ t: last[0] + 300, emoji: '⏸️', kind: 'halt', tone: 'calm', level: null, title: `The CME halted at ${String(Math.floor(h / 60)).padStart(2, '0')}:${String(h % 60).padStart(2, '0')}`, text: 'A short session: the bars end here.', short: '⏸️ halted early' });
  }
  if (!live) {
    let hi = -Infinity, lo = Infinity; for (const b of B) { hi = Math.max(hi, b[2]); lo = Math.min(lo, b[3]); }
    const o = B[0][1], c = last[4];
    out.push({ t: last[0] + 301, emoji: '🏁', kind: 'close', tone: c >= o ? 'up' : 'down', level: null, title: 'The day in one line',
      text: `Range ${pts(hi - lo)} (${px(lo)} - ${px(hi)}); closed ${px(c)}, ${c >= o ? 'up' : 'down'} ${pts(c - o)} from the 18:00 open.`, short: `🏁 ${c >= o ? 'up' : 'down'} ${pts(c - o)}` });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ the PC's thought lines (today)
export function plainThought(text) {
  const s = String(text || '').replace(/…$/, '...');
  let m = /^Swept (.+?) ([\d,]+(?:\.\d+)?) \(([\d.]+) ATR deep; ✗ LIT needs ([\d.]+)\)/.exec(s);
  if (m) return { emoji: '❌', kind: 'reject', tone: 'bad', title: `LIT passed on a sweep of ${m[1]}`, text: `${m[1]} ${m[2]} was swept only ${m[3]} ATR deep; LIT needs ${m[4]} ATR. Too shallow to count.`, short: `❌ ${m[1]} sweep too shallow`, level: +m[2].replace(/,/g, '') };
  m = /^Swept (.+?) ([\d,]+(?:\.\d+)?) \(([\d.]+) ATR deep; deep enough: ✓\)/.exec(s);
  if (m) return { emoji: '👀', kind: 'notice', tone: 'warm', title: `LIT counted a sweep of ${m[1]}`, text: `${m[1]} ${m[2]} swept ${m[3]} ATR deep: deep enough for LIT's first step.`, short: `👀 swept ${m[1]}`, level: +m[2].replace(/,/g, '') };
  m = /^Now: ([A-Za-z ]+?) - (.*)$/.exec(s);
  if (m) return { emoji: '👀', kind: 'stage', tone: 'warm', title: `LIT stage: ${m[1]}`, text: m[2], short: `👀 LIT at ${m[1].toLowerCase()}`, stage: m[1], level: null };
  m = /(push|displacement) ([\d.]+) ATR.*needs ([\d.]+)/i.exec(s);
  if (m) return { emoji: '❌', kind: 'reject', tone: 'bad', title: 'LIT passed', text: `${s} (plain: the ${m[1].toLowerCase()} was ${m[2]} ATR, it needs ${m[3]}).`, short: `❌ ${m[1].toLowerCase()} too weak`, level: null };
  return { emoji: '💭', kind: 'thought', tone: 'calm', title: 'LIT', text: s, short: '', level: null };
}
function thoughtMoments(day, glog) {
  const out = [];
  let lastStage = '';
  const lit = arr(isObj(glog) ? glog.lit : null).filter((x) => Array.isArray(x)).slice().reverse();     // oldest first
  for (const [hm, text] of lit) {
    const t = hmToT(day, hm); if (t === null) continue;
    const P = plainThought(text);
    if (P.kind === 'stage') { if (P.stage === lastStage) continue; lastStage = P.stage; }
    out.push({ t, ...P });
  }
  for (const [hm, text] of arr(isObj(glog) ? glog.atlas : null).filter((x) => Array.isArray(x)).slice().reverse()) {
    const t = hmToT(day, hm); if (t === null) continue;
    out.push({ t, emoji: '🤖', kind: 'atlas', tone: 'calm', title: 'ATLAS', text: String(text || ''), short: '', level: null });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ the PC's day thought log (past days)
function logMoments(rows) {
  const out = [];
  let lastStage = '';
  for (const r of arr(rows)) {
    if (!Array.isArray(r) || num(r[0]) === null || !r[3]) continue;
    const t = +r[0], bot = String(r[1] || ''), text = String(r[3]);
    if (bot === 'lit') {
      const P = plainThought(text);
      if (P.kind === 'stage') { if (P.stage === lastStage) continue; lastStage = P.stage; }
      if (P.kind === 'thought' && /^(box|level)/i.test(String(r[2] || ''))) continue;      // the level book's housekeeping, not a story line
      out.push({ t, ...P, tag: 'PC' });
    } else if (bot === 'atlas') out.push({ t, emoji: '🤖', kind: 'atlas', tone: 'calm', title: 'ATLAS', text, short: '', level: null, tag: 'PC' });
    else if (bot === 'of') out.push({ t, emoji: '📊', kind: 'of', tone: 'calm', title: 'Order flow (paper)', text, short: '', level: null, tag: 'PC' });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ the replay twin (past days)
const WHY = { 'no inducement': 'no inducement (no small trap move before the entry)', 'never filled': 'the entry price never came back to fill it',
  'outside hours': 'it formed outside LIT\'s hours', 'no target room': 'not enough room to the target', 'target too close': 'the target was too close' };
function twinMoments(events) {
  const out = [];
  for (const e of arr(events)) {
    if (!isObj(e) || num(e.t) === null || /blitz/i.test(String(e.bot))) continue;
    const bot = String(e.bot || 'LIT'), side = String(e.side || '').toUpperCase(), text = String(e.text || '');
    if (e.kind === 'setup') {
      const m = /stopped: ([^;]+)(?:; (.*))?$/.exec(text), why = m ? (WHY[m[1].trim()] || m[1].trim()) : '';
      const sz = /\((sweep [\d.]+ ATR, displacement [\d.]+ ATR)\)/.exec(text);
      out.push({ t: e.t, emoji: '❌', kind: 'reject', tone: 'bad', tag: 'TWIN', level: null, title: `${bot} ${side.toLowerCase()} setup stopped at step ${e.step ?? '?'} of 8`,
        text: `${why ? 'Why: ' + why + '.' : text}${sz ? ` (${sz[1]})` : ''}${m && m[2] ? ` ${m[2].charAt(0).toUpperCase() + m[2].slice(1)}.` : ''}`, short: `❌ ${side.toLowerCase()} setup: ${m ? m[1].trim() : 'stopped'}` });
    } else if (e.kind === 'step') {
      out.push({ t: e.t, emoji: '👀', kind: 'stage', tone: 'warm', tag: 'TWIN', level: null, title: `${bot} ${side.toLowerCase()} setup forming (step ${e.step ?? '?'} of 8)`, text, short: `👀 ${side.toLowerCase()} setup forming` });
    } else if (e.kind === 'entry') {
      out.push({ t: e.t, emoji: '🟢', kind: 'entry', tone: 'warm', tag: 'TWIN', level: num(e.px), title: `${bot}${e.member ? ' ' + e.member : ''} entered ${side}`, text, short: `🟢 ${bot} ${side.toLowerCase()} in` });
    } else if (e.kind === 'exit') {
      const u = num(e.usd), how = String(e.how || '').toUpperCase(), win = u !== null && u > 0.5, loss = u !== null && u < -0.5;
      out.push({ t: e.t, emoji: win ? '✅' : loss ? '🛑' : '⏹️', kind: 'exit', tone: win ? 'up' : loss ? 'down' : 'calm', tag: 'TWIN', level: null,
        title: `${bot}${e.member ? ' ' + e.member : ''} out${how ? ': ' + (how === 'BE' ? 'break-even' : how.toLowerCase()) : ''} ${usd(u)}`, text, short: `${win ? '✅' : loss ? '🛑' : '⏹️'} ${bot} ${usd(u)}` });
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ the PC's real trades
const EXW = { TARGET: 'Hit its target', STOP: 'Its stop was hit', BE: 'Closed at break-even (stop moved to entry)', TIME: 'Closed at its time limit', FLAT: 'Closed at the daily flat time', EOD: 'Closed at the end of the day', MANUAL: 'Closed by hand' };
function realMoments(day, trades) {
  const out = [];
  for (const x of arr(trades)) {
    if (!isObj(x) || /blitz/i.test(String(x.acct || x.bot || '')) || x.src === 'paper' || num(x.entry_t) === null) continue;
    if (tradeDay(x.entry_t) !== day) continue;
    const bot = /atlas/i.test(String(x.acct || x.bot)) ? 'ATLAS' : 'LIT', side = String(x.side || '').toUpperCase();
    out.push({ t: x.entry_t, emoji: '🟢', kind: 'entry', tone: 'warm', tag: 'REAL', level: num(x.entry), title: `${bot}${x.member ? ' ' + x.member : ''} entered ${side}${x.qty ? ' ' + x.qty + ' MNQ' : ''}`,
      text: num(x.entry) !== null ? `At ${px(x.entry)}.` : 'A real fill on the PC.', short: `🟢 ${bot} ${side.toLowerCase()} in` });
    if (!x.open && num(x.exit_t) !== null) {
      const u = num(x.usd), ex = String(x.exit || '').toUpperCase(), win = ex === 'TARGET' || (u !== null && u > 0.5), loss = ex === 'STOP' && (u === null || u < 0) || (u !== null && u < -0.5);
      out.push({ t: x.exit_t, emoji: win ? '✅' : loss ? '🛑' : '⏹️', kind: 'exit', tone: win ? 'up' : loss ? 'down' : 'calm', tag: 'REAL', level: null,
        title: `${bot} ${win && ex === 'TARGET' ? 'hit its target' : loss && ex === 'STOP' ? 'was stopped out' : 'closed'} ${usd(u)}`, text: `${EXW[ex] || (ex ? ex.toLowerCase() : 'closed')}: ${usd(u) || 'no $ reported'}.`, short: `${win ? '✅' : loss ? '🛑' : '⏹️'} ${bot} ${usd(u)}` });
    }
  }
  return out;
}

export function build(I) {
  const day = String((I && I.day) || '') || dayOf(I && I.bars), live = !!(I && I.live), nowS = num(I && I.nowS);
  const B = arr(I && I.bars).filter((b) => Array.isArray(b) && num(b[0]) !== null && num(b[2]) !== null && num(b[3]) !== null && tradeDay(b[0]) === day)
    .map((b) => [+b[0], +b[1], +b[2], +b[3], +b[4]]).sort((a, b) => a[0] - b[0]);
  let M = [...barMoments(day, B, I && I.prior, I && I.normalAsia, live, nowS), ...thoughtMoments(day, I && I.glog), ...logMoments(I && I.thoughts), ...twinMoments(I && I.twin), ...realMoments(day, I && I.trades)];
  if (live && I && I.halt && nowS !== null) {
    const ht = hmToT(day, I.halt);
    if (ht !== null) M.push({ t: ht, emoji: '⏸️', kind: 'halt', tone: 'calm', level: null, title: `The CME halts at ${I.halt} ET`, text: ht <= nowS ? 'A short day: the session is over.' : 'A short day: every bot is flat 5 minutes before.', short: `⏸️ halt ${I.halt}`, future: ht > nowS });
  }
  M = M.filter((m) => num(m.t) !== null).sort((a, b) => a.t - b.t).map((m) => ({ ...m, hm: et(m.t).hm }));
  // what LIT was waiting for: today = its last "Now:" line; a past day = the twin's last setup / step
  let waiting = '';
  const nowLine = arr(isObj(I && I.glog) ? I.glog.lit : null).find((x) => Array.isArray(x) && /^Now: /.test(String(x[1])));
  if (nowLine) waiting = String(nowLine[1]).replace(/^Now: [A-Za-z ]+? - /, '').replace(/^Before \d\d:\d\d ET \([^)]*\):\s*/, '').replace(/\u2026$/, '...');
  else if (arr(I && I.thoughts).some((r) => Array.isArray(r) && r[1] === 'lit')) {
    const st = arr(I.thoughts).filter((r) => Array.isArray(r) && r[1] === 'lit' && /^Now: /.test(String(r[3]))).pop();
    if (st) waiting = String(st[3]).replace(/^Now: [A-Za-z ]+? - /, '').replace(/^Before \d\d:\d\d ET \([^)]*\):\s*/, '');
  }
  if (!waiting && !nowLine) { const tw = arr(I && I.twin).filter((e) => isObj(e) && /setup|step/.test(e.kind) && String(e.bot) === 'LIT').pop(); if (tw) waiting = `its last setup: ${tw.text}`; }
  const thin = B.length < 12 && M.length < 3;
  const note = !B.length ? (live ? "No bars from the PC's chart for today yet: the story starts when they come." : 'No bars stored for this day.')
    : live && !arr(isObj(I && I.glog) ? I.glog.lit : null).length ? "The PC has not posted LIT's thoughts today: the moments come from the bars and trades only."
      : !live && arr(I && I.thoughts).length ? "Past days: the bots' own thoughts from the PC's day log (PC), the replay twin's setups and trades on the same bars (TWIN), real fills (REAL)."
        : !live ? "Past days: the bars are the PC's own; setups and twin trades are LIT / ATLAS's replay twin on those bars (TWIN); real fills are marked REAL. The PC's thought log for this day has not reached the site." : '';
  return { day, live, moments: M, waiting, thin, note, nBars: B.length, bars: B,
    summary: M.length ? `${M.length} moment${M.length === 1 ? '' : 's'}${B.length ? `, ${B.length} bars` : ''}` : 'no moments yet' };
}

export function snap(bars, t, level) {
  const B = arr(bars), i = B.findIndex((b) => b[0] >= t), c = i < 0 ? B.length - 1 : i;
  if (!B.length || Math.abs(B[c][0] - t) > 1800) return null;            // the bars do not reach that moment: no chart rather than a wrong one
  const W = B.slice(Math.max(0, c - 18), Math.min(B.length, c + 7));
  if (W.length < 3) return null;
  let lo = Infinity, hi = -Infinity; for (const b of W) { lo = Math.min(lo, b[3]); hi = Math.max(hi, b[2]); }
  if (num(level) !== null) { lo = Math.min(lo, level); hi = Math.max(hi, level); }
  const y = (v) => 1 - (v - lo) / Math.max(1e-9, hi - lo), x = (k) => k / (W.length - 1);
  const mk = W.findIndex((b) => b[0] >= t);
  return { pts: W.map((b, k) => [x(k), y(b[4])]), mark: x(mk < 0 ? W.length - 1 : mk), lvl: num(level) !== null ? y(level) : null };
}

export function storyLine(S) {
  if (!isObj(S) || !arr(S.moments).length) return '';
  const keys = S.moments.filter((m) => m.short && !m.future).slice(-3).map((m) => m.short);
  const w = S.waiting && S.live ? ` · LIT now: ${S.waiting.split(/[:.(]/)[0].replace(/^Waiting for /i, 'waiting for ').trim().slice(0, 60)}` : '';
  return keys.length ? `Story so far: ${keys.join(' · ')}${w}` : '';
}
