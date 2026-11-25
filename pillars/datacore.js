// ONE PILLAR'S DATA PAGE, the model (day-pillars4 2026-11-25; owner: "more 3D, more quality, more data, make everything more organized,
// more research"). Pure ES module (no DOM, no fetch, no storage; node-tested by tests/test_pillars.py). pillars/data.html#lit|atlas|blitz|of.
//   pillar  = pillarscore (via pillarsfeed.modelFrom): status word, accounts with today $, lessons, tick count
//   data    = pillars-data.json (tools/build_pillars.py): rejected tests per pillar (docs/TESTED_AND_REJECTED.md), idea mill, order-flow progress
//   trades  = trading/trades.json (src live = the PC's real MFFU trades, paper = the cloud twin) + the PC post's newest trades (lite.at)
//   region  = brain/braincore.build(...).regions[id] (the next setup + steps from the brain feed first, its age, thinking, what it learned)
// Real numbers only: a number no source has is null and drawn "-"; the bundled Brain fixture is labelled SAMPLE by the page.
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const num = (v) => (v === null || v === undefined || v === '' || typeof v === 'boolean' || !Number.isFinite(+v) ? null : +v);
const str = (v, n) => String(v == null ? '' : v).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n || 240);

export const IDS = ['lit', 'atlas', 'blitz', 'of'];
const BOT = { lit: 'LIT', atlas: 'ATLAS', blitz: 'BLITZ' };
// the PC post's account ids per pillar (pillarscore.lastTrade + pc_feed isZlarior)
const PC_IDS = { lit: /^(mffu50k_eval|lit|b25k_2|z\w*|zlarior\w*)$/i, atlas: /^(atlas\w*|acct_b)$/i, blitz: /^(blitz\w*|rapid\w*)$/i };

export function usd(v, sign = true) {
  const n = num(v); if (n === null) return '-';
  const a = '$' + Math.abs(Math.round(n)).toLocaleString('en-US');
  return n < 0 && Math.round(n) ? '-' + a : (sign && Math.round(n) > 0 ? '+' + a : a);
}
/** ET parts of a unix time: {date 'YYYY-MM-DD', hm, dow 0=Sun, ym} (Intl; null on failure) */
export function et(t) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
      .formatToParts(new Date(t * 1000)).map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}`, dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday), ym: `${p.year}-${p.month}` };
  } catch (_) { return null; }
}
/** the CME trading day of a time (from 18:00 ET it is the next day), as 'YYYY-MM-DD' */
export const cmeDay = (t) => (et(t + 6 * 3600) || {}).date || null;
/** Monday of the CME week of a time */
export function weekStart(t) {
  const d = cmeDay(t); if (!d) return null;
  const x = new Date(d + 'T12:00:00Z'), dow = x.getUTCDay();
  x.setUTCDate(x.getUTCDate() - ((dow + 6) % 7));
  return x.toISOString().slice(0, 10);
}

/* ---------------- trades ---------------- */
/** every real (+ paper) trade of a pillar, newest first: the PC post's newest rows win over the same trade in the file */
export function tradesOf(id, file, lite) {
  if (!BOT[id]) return [];
  const rows = [];
  for (const t of arr(isObj(file) ? file.trades : null)) {
    if (!isObj(t) || t.bot !== BOT[id] || !['live', 'real', 'paper'].includes(t.src)) continue;
    const at = num(t.t); if (at === null) continue;
    rows.push({ t: at, xt: num(t.xt), day: str(t.day, 10) || cmeDay(at), hm: str(t.hm, 5) || (et(at) || {}).hm || '', side: /short/i.test(String(t.side)) ? 'SHORT' : 'LONG',
      usd: num(t.usd), r: num(t.r), how: str(t.k, 12), acct: str(t.an || t.acct, 40), member: str(t.m, 12), src: t.src === 'paper' ? 'paper' : 'live', open: false, from: 'file' });
  }
  const at = isObj(lite) && isObj(lite.at) ? arr(lite.at.a) : [];
  for (const a of at) {
    if (!isObj(a) || !PC_IDS[id].test(String(a.id || ''))) continue;
    for (const r of arr(a.tr)) {
      if (!Array.isArray(r) || num(r[0]) === null) continue;
      const t0 = num(r[0]), open = r[1] == null;
      const same = rows.findIndex((x) => x.src === 'live' && Math.abs(x.t - t0) <= 180);
      const row = { t: t0, xt: num(r[1]), day: cmeDay(t0), hm: (et(t0) || {}).hm || '', side: num(r[2]) < 0 ? 'SHORT' : 'LONG', usd: num(r[8]), r: num(r[9]), how: open ? 'OPEN' : '',
        acct: str(a.n || a.name || '', 40), member: '', src: 'live', open, from: 'pc' };
      if (same >= 0) rows[same] = { ...rows[same], ...Object.fromEntries(Object.entries(row).filter(([k, v]) => v !== null && v !== '' && !(k === 'acct' && !v))) };
      else rows.push(row);
    }
  }
  rows.sort((a, b) => b.t - a.t);
  return rows;
}

/** money numbers of the REAL closed trades: this week / this month $, win rate, PF, avg R, all-time; paper apart */
export function stats(rows, nowS) {
  const live = arr(rows).filter((r) => r.src === 'live' && !r.open && r.usd !== null);
  const wk = weekStart(nowS), mo = (et(nowS + 6 * 3600) || {}).ym;
  const sum = (xs) => xs.reduce((s, r) => s + r.usd, 0);
  const week = live.filter((r) => wk && r.day >= wk), month = live.filter((r) => mo && String(r.day).slice(0, 7) === mo);
  const wins = live.filter((r) => r.usd > 0), losses = live.filter((r) => r.usd < 0);
  const gw = sum(wins), gl = -sum(losses), rs = live.filter((r) => r.r !== null);
  const open = arr(rows).find((r) => r.open) || null;
  return {
    n: live.length, week: week.length ? sum(week) : 0, weekN: week.length, month: month.length ? sum(month) : 0, monthN: month.length, total: sum(live),
    win: live.length ? (wins.length / live.length) * 100 : null, pf: gl > 0 ? gw / gl : null, pfWord: gl > 0 ? (gw / gl).toFixed(2) : wins.length ? 'no losses yet' : '-',
    avgR: rs.length ? rs.reduce((s, r) => s + r.r, 0) / rs.length : null, best: live.length ? Math.max(...live.map((r) => r.usd)) : null, worst: live.length ? Math.min(...live.map((r) => r.usd)) : null,
    paperN: arr(rows).filter((r) => r.src === 'paper').length, open, first: live.length ? live[live.length - 1].day : null, weekFrom: wk, monthOf: mo,
    thin: live.length < 20,
    curve: live.slice().sort((a, b) => a.t - b.t).reduce((acc, r) => { acc.push({ t: r.t, day: r.day, v: (acc.length ? acc[acc.length - 1].v : 0) + r.usd }); return acc; }, []),
  };
}

/* ---------------- the whole data page of one pillar ---------------- */
export function build(id, src) {
  const S = isObj(src) ? src : {}, nowS = num(S.nowS) || 0;
  const pillars = arr(S.pillars), p = pillars.find((x) => x.id === id) || null;
  const D = isObj(S.data) ? S.data : {}, raw = arr(D.pillars).find((x) => isObj(x) && x.id === id) || {};
  const reg = isObj(S.region) ? S.region : null;
  const rows = tradesOf(id, S.trades, S.lite);
  const st = stats(rows, nowS);
  const rj = isObj(raw.rejected) ? raw.rejected : { n: 0, rows: [] };
  const mill = isObj(D.mill) ? D.mill : null;
  const prog = isObj(raw.progress) ? raw.progress : null;
  const tick = p && p.tick ? p.tick : null;
  const nx = reg && reg.next ? reg.next : null;
  const learn = reg && reg.learn ? reg.learn : null;
  return {
    id, name: p ? p.name : (raw.name || id.toUpperCase()), alias: p ? p.alias : str(raw.alias, 40), color: p ? p.color : (raw.color || '#9d59ee'),
    statusWord: p ? p.statusWord : 'waiting', level: p ? p.level : 'warn', status: p ? str(p.status, 240) : str(raw.status, 240),
    sample: !!S.sample,
    // live status (the PC feed)
    live: { pc: isObj(S.pc) ? S.pc : null, accounts: p ? arr(p.accounts).map((a) => ({ name: str(a.name, 40), stage: str(a.stage, 14), today: a.todayText || '-', lvl: a.todayLvl || 'none', state: str(a.stateWord, 30), clock: a.clock ? a.clock.text : '' })) : [],
      accountsText: p ? str(p.accountsText, 120) : '', day: reg && reg.money ? reg.money.day : null, room: reg && reg.money ? reg.money.room : null, mll: reg && reg.money ? reg.money.mll : null },
    // money
    trades: rows.slice(0, 10), tradesN: rows.length, stats: st,
    tradesNote: !BOT[id] ? 'No trades: order flow is research on recorded ticks (nothing trades).' : id === 'blitz' ? 'None: BLITZ is switched OFF (paper only, never on a real account).' : rows.length ? '' : 'No real trade in the ledger or the PC post yet.',
    // next setup + steps (the brain feed first)
    next: nx ? { setup: str(nx.setup, 140), waiting: str(nx.waiting, 260), window: str(nx.window, 80), steps: arr(nx.steps).length ? nx.steps : null, stepsText: nx.stepsText || '',
      chain: reg && reg.chain && reg.chain.length === 1 ? reg.chain[0].steps.map((s) => ({ label: s.label, state: s.state })) : reg && reg.chain ? reg.chain.flatMap((c) => c.steps.map((s) => ({ label: `${c.name ? c.name + ': ' : ''}${s.label}`, state: s.state }))).slice(0, 14) : [],
      limit: nx.limit ?? null, stop: nx.stop ?? null, target: nx.target ?? null, rr: nx.rr ?? null, dist: nx.dist ?? null, distFrom: nx.distFrom || '', pct: nx.pct || 0, word: nx.word || '',
      from: nx.from || 'derived', feed: nx.feed || null, inTrade: !!nx.inTrade } : null,
    think: reg ? arr(reg.think).slice(0, 8) : [], thinkFrom: reg ? reg.thinkFrom : 'none',
    // what it learned (research/learn via brain/learn.json + the weekly lessons in pillars-data.json)
    learned: { week: learn ? arr(learn.week).filter((x, i, a) => a.findIndex((y) => y.text === x.text) === i).slice(0, 6) : [], testing: learn ? arr(learn.testing).slice(0, 4) : [], confidence: learn ? learn.confidence : null, confWord: learn ? learn.confWord : 'not scored yet',
      lessons: p ? arr(p.lessons).slice(0, 5) : arr(raw.lessons).slice(0, 5), src: learn ? learn.src : '', journalLanded: !!(learn && learn.journalLanded) },
    // research
    rejected: { n: num(rj.n) || 0, rows: arr(rj.rows).slice(0, 12), src: str(D.rejected_src, 60) || 'docs/TESTED_AND_REJECTED.md', shared: isObj(D.rejected_shared) ? num(D.rejected_shared.n) || 0 : 0 },
    mill: mill ? { ideas: num(mill.ideas), scored: num(mill.scored), families: num(mill.families), raw: num(mill.raw_p05), luck: num(mill.luck_p05), passed: num(mill.passed) || 0,
      best: isObj(mill.best) ? `${str(mill.best.family, 40)} (p ${num(mill.best.p) !== null ? num(mill.best.p).toFixed(3) : '-'})` : '', made: str(mill.made, 16), dataEnd: str(mill.data_end, 10), src: str(mill.src, 60) } : null,
    spans: arr(raw.spans), recent: isObj(raw.recent) ? raw.recent : null, edge: str(raw.edge, 400), risks: arr(raw.risks).map((x) => str(x, 240)), nextSteps: arr(raw.next).map((x) => str(x, 300)),
    // order flow
    flow: id === 'of' ? { days: tick && tick.has ? tick.d : null, of: (tick && tick.of) || num(raw.study_days) || 60, frac: tick && tick.has ? tick.frac : 0, text: tick ? tick.text : '', ageText: tick ? tick.ageText : '',
      looks: prog ? num(prog.looks) : 2, looksUsed: prog ? num(prog.looks_used) || 0 : 0, mode: prog ? str(prog.study_mode, 10) : '', onDisk: prog ? num(prog.tick_days_on_disk) : null,
      battery: prog ? { need: num(prog.battery_need), state: str(prog.battery_state, 80), made: str(prog.battery_made, 10) } : null, proxy: prog ? str(prog.proxy_tests, 200) : '',
      designs: arr(raw.designs).map((d) => ({ id: str(d.id, 8), text: str(d.text, 200), gate: str(d.gate, 160) })), src: prog ? str(prog.src, 160) : '' } : null,
  };
}
