// MFFU ACCOUNT CENTER model (night-mffu2 2026-11-18, owner: "I want everything on the accounts to the point where I barely even have
// to open MFFU on Safari. I need notifications when trades are taken, on which account."). The pure part: no DOM, no fetch.
// One MFFU-exact card per real account from the LIVE PC feed (../pc_feed.js: the core post every 15 min + the ext blocks mf, at,
// life merged in), built on MFFU_MODEL.match / card (mffumodel.js: matching by PC id / Name, never plan size; the payout coach).
// Classic script (window.MFFU_CENTER) and a CommonJS module for node tests (tests/test_mffu_center.py).
//   ownerName(id, name, plan, stage)     the owner's names ("Zlarior 50K", "Zlarior 25K #2", "ATLAS 25K funded") = engine/mffu_view.owner_name
//   RULES, rulesFor(text)                MFFU's numbers per plan (help.myfundedfutures.com, checked 2026-11-18; test-checked against
//                                        research/lit/mffu_rules.json), CME holiday hours (= engine/cme_calendar.py), Tier-1 news (Rapid funded)
//   tradingDay(t) / etDate(t) / clock(t) / asOf(t, now) / ago(s)   ET helpers (18:00 ET starts the next trading day)
//   center({lite, plan, board, home, coach, today, M}, nowS)
//        -> {feed, accounts: [card], planned: [plan row], open: [open trade], latest: [newest trades], decoder: [[last4, name]]}
// Every number carries where it came from and when: feed.kind = live (the PC's newest report, <= 30 min) / old (PC silent) /
// snapshot (the site's copy, NEVER shown as live) / none. Read only: nothing here trades, arms or requests a payout.
(function (root) {
  'use strict';
  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : null));
  const r2 = (v) => Math.round(v * 100) / 100;
  const arr = (x) => (Array.isArray(x) ? x : []);
  const STALE_S = 30 * 60;             // the Board's PC SILENT line (board/boardmodel.js STALE_S)
  const USD_PT = 2;                    // MNQ micros: $2 a point a contract (every bot trades MNQ)
  const TZ = 'America/New_York';

  // ---------------------------------------------------------------------------------------------- MFFU's rules
  // help.myfundedfutures.com 2026-11-18: Builder Plan 50k / 25k comprehensive guides, Rapid EOD 25k / 50k, Permitted Times to
  // Trade (flat 4:10 PM ET, holidays: no auto-close), Inactivity Rule (7 calendar days, funded: all profits forfeited), News Trading
  // Policy (Tier-1: Rapid / Pro sim funded only), Moving from Evaluation to Sim-Funded (limits), Navigating Your Dashboard.
  const BUILDER = { family: 'builder', lock: 100, dll_soft: true, min_days: 1, eval_cons: null, news_eval: true, news_funded: true, inactivity_days: 7,
                    split: 0.8, cons: 0.5, cycle_days: 2, first_wait_h: 48, max_payouts: 5 };
  const RAPID = { family: 'rapid', lock: 100, dll: null, dll_soft: false, min_days: 4, eval_cons: 0.3, news_eval: true, news_funded: false, inactivity_days: 7,
                  split: 0.9, cons: null, cycle_days: null, first_wait_h: 24, max_payouts: null, daily: true };
  const RULES = {
    builder50k: { ...BUILDER, key: 'builder50k', label: 'Builder 50K', size: '50K', start: 50000, target: 3000, mll: 2000, dll: 1000, max_minis: 4, max_micros: 40,
                  buffer: 2100, first_above: 500, next_since: 500, pay_min: 500, pay_max: 2000, funded_max: 1 },
    builder25k: { ...BUILDER, key: 'builder25k', label: 'Builder 25K', size: '25K', start: 25000, target: 1500, mll: 1000, dll: 600, max_minis: 2, max_micros: 20,
                  buffer: 1100, first_above: 250, next_since: 250, pay_min: 250, pay_max: 1000, funded_max: 2 },
    rapideod50k: { ...RAPID, key: 'rapideod50k', label: 'Rapid EOD 50K', size: '50K', start: 50000, target: 3000, mll: 2000, max_minis: 3, max_micros: 30,
                   buffer: 2100, next_since: 500, pay_min: 500, pay_max: null, funded_max: 3 },
    rapideod25k: { ...RAPID, key: 'rapideod25k', label: 'Rapid EOD 25K', size: '25K', start: 25000, target: 1500, mll: 1000, max_minis: 2, max_micros: 20,
                   buffer: 1100, next_since: 250, pay_min: 500, pay_max: null, funded_max: 3 },
  };
  const FLAT = { mffu: 16 * 60 + 10, bot: 15 * 60 + 55, last_entry: 15 * 60 + 30, open: 18 * 60 };   // ET minutes (STRATEGY.md: entries to 15:30, flat 15:55)
  // CME equity futures holiday hours the bot meets (engine/cme_calendar.py: halts 13:00 / 13:15 ET, full closures). MFFU does NOT
  // auto-close at an early halt: an open trade then breaches the account; the bot is flat 5 minutes before (cme_calendar.flat_cut).
  const CME = [
    { day: '2026-11-26', halt: 13 * 60, what: 'Thanksgiving' }, { day: '2026-11-27', halt: 13 * 60 + 15, what: 'the day after Thanksgiving' },
    { day: '2026-12-24', halt: 13 * 60 + 15, what: 'Christmas Eve' }, { day: '2026-12-25', closed: true, what: 'Christmas Day' },
    { day: '2027-01-01', closed: true, what: "New Year's Day" }, { day: '2027-01-18', halt: 13 * 60, what: 'Martin Luther King Jr. Day' },
    { day: '2027-02-15', halt: 13 * 60, what: "Presidents' Day" },
  ];
  // Tier-1 news (MFFU: FOMC meetings + minutes, the jobs report, CPI); research/lit/mffu_rules.json tier1_news_2026. Only Rapid / Pro
  // SIM FUNDED accounts must be flat with no order from 2 min before to 2 min after; Builder and every evaluation may trade them.
  const T1 = [['2026-11-18', '14:00', 'FOMC minutes'], ['2026-12-04', '08:30', 'Jobs report'], ['2026-12-09', '14:00', 'FOMC meeting'],
              ['2026-12-10', '08:30', 'CPI'], ['2026-12-30', '14:00', 'FOMC minutes']];

  function rulesFor(text) {
    const s = String(text || '').toLowerCase();
    if (/rapid/.test(s)) return /50k/.test(s) ? RULES.rapideod50k : /25k/.test(s) ? RULES.rapideod25k : null;
    return /50k/.test(s) ? RULES.builder50k : /25k/.test(s) ? RULES.builder25k : null;
  }

  // ---------------------------------------------------------------------------------------------- names + time
  function ownerName(id, name, plan, stage) {
    try {
      const i = String(id == null ? '' : id).trim().toLowerCase(), n = String(name == null ? '' : name), p = String(plan == null ? '' : plan);
      const rapid = /\brapid\b/i.test(n + ' ' + p) || i.indexOf('rapid') === 0;
      const bot = rapid ? 'Rapid EOD' : (i === 'atlas' || i === 'acct_b' || /\batlas\b/i.test(n)) ? 'ATLAS' : 'Zlarior';
      const re = /(?:^|[^\w$])(\d{2,3})\s*k\b/i;
      const m = p.match(re) || n.match(re) || i.match(/^[a-z]*?(\d{2,3})k(?:_[a-z0-9]+)?$/);
      const h = n.match(/#\s*(\d{1,2})\b/);
      const funded = ['funded', 'payout_ready', 'lost', 'sim funded'].indexOf(String(stage == null ? '' : stage).trim().toLowerCase()) >= 0;
      return bot + (m ? ' ' + m[1] + 'K' : '') + (h && h[1] !== '0' && h[1] !== '1' ? ' #' + h[1] : '') + (funded ? ' funded' : '');
    } catch (e) { return 'Account'; }
  }

  function parts(t) {
    const p = {};
    t = Number.isFinite(+t) && t !== null ? +t : Math.floor(Date.now() / 1000);
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
        .formatToParts(new Date(t * 1000)).forEach((x) => { p[x.type] = x.value; });
    } catch (e) { const d = new Date(t * 1000 - 5 * 3600000); return { day: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes(), wd: d.getUTCDay() }; }
    return { day: p.year + '-' + p.month + '-' + p.day, min: (+p.hour % 24) * 60 + +p.minute, wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
  }
  const etDate = (t) => parts(t).day;
  const etMin = (t) => parts(t).min;
  const tradingDay = (t) => parts(t + 6 * 3600).day;
  const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const diffDays = (a, b) => Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 86400000);
  const isDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function hm(min) { const h = Math.floor(min / 60) % 24, m = min % 60; return (h % 12 || 12) + ':' + String(m).padStart(2, '0') + ' ' + (h < 12 ? 'AM' : 'PM'); }
  function dayText(d, withWd) {
    if (!isDay(d)) return d || '-';
    const x = new Date(d + 'T12:00:00Z');
    return (withWd ? WD[x.getUTCDay()] + ' ' : '') + MON[x.getUTCMonth()] + ' ' + x.getUTCDate();
  }
  function clock(t) { return t ? hm(etMin(t)) : '-'; }
  function ago(s) {
    if (s == null || !Number.isFinite(s)) return '';
    s = Math.max(0, Math.round(s));
    return s < 90 ? 'just now' : s < 5400 ? Math.round(s / 60) + ' min ago' : s < 2 * 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' days ago';
  }
  // "as of 6:45 PM ET" (today), "as of Tue 4:10 PM ET" (this week), "as of Nov 7, 4:10 PM ET"
  function asOf(t, now) {
    if (!t) return 'time unknown';
    const a = etDate(t), b = etDate(now), dd = diffDays(b, a);
    return 'as of ' + (dd === 0 ? '' : dd > 0 && dd < 6 ? WD[new Date(a + 'T12:00:00Z').getUTCDay()] + ' ' : dayText(a) + ', ') + clock(t) + ' ET';
  }
  const usd = (v, cents) => (v == null ? '-' : (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', cents ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 }));
  const sgn = (v, cents) => (v == null ? '-' : (v > 0 ? '+' : '') + usd(v, cents));

  // MFFU's day: 6:00 PM ET opens the next trading day, 4:10 PM ET closes it (the EOD floor moves after that close)
  function dayEnd(now) {
    const p = parts(now), m = p.min, wd = p.wd;
    const span = (mins) => (mins >= 60 ? Math.floor(mins / 60) + ' h ' : '') + (mins % 60) + ' min';
    const weekend = wd === 6 || (wd === 5 && m >= FLAT.mffu) || (wd === 0 && m < FLAT.open);
    if (weekend) return { open: false, text: 'Weekend: the next session opens Sunday 6:00 PM ET' };
    if (m >= FLAT.mffu && m < FLAT.open) return { open: false, text: 'Today\'s session is closed (4:10 PM ET); the next one opens at 6:00 PM ET' };
    const left = m >= FLAT.open ? 24 * 60 - m + FLAT.mffu : FLAT.mffu - m;
    return { open: true, left_min: left, text: 'This session ends at 4:10 PM ET (in ' + span(left) + '); the floor moves only after that close' };
  }

  // ---------------------------------------------------------------------------------------------- the feed
  // live = the PC's newest report (<= 30 min old); old = the PC went quiet (numbers from then); snapshot = the site's copy; none
  function feedState(lite, board, home, now) {
    if (lite) {
      const rt = num(lite.reporter && lite.reporter.t) || num(lite.t) || 0;
      const ct = num(lite.board && (lite.board.data_t || lite.board.t)) || num(lite.t) || rt;
      const xt = num(lite.ext_t) || num(lite.mf && lite.mf.t) || null;
      const age = rt ? now - rt : null, kind = age != null && age <= STALE_S ? 'live' : 'old';
      return { kind, t: rt, core_t: ct, ext_t: xt, age_s: age,
               text: kind === 'live' ? 'Live from your PC: last report ' + clock(rt) + ' ET (' + ago(age) + ')'
                 : 'PC SILENT: last report ' + asOf(rt, now).replace(/^as of /, '') + ' (' + ago(age) + '). Every number below is from then, not live.' };
    }
    const st = num(board && board.t) || num(home && (home.t || home.generated_t)) || null;
    if (board || home) {
      return { kind: 'snapshot', t: st, core_t: st, ext_t: null, age_s: st ? now - st : null,
               text: 'NOT LIVE: the PC feed did not answer. Showing the site\'s saved copy' + (st ? ' (' + asOf(st, now).replace(/^as of /, '') + ')' : '') + ' and the plan.' };
    }
    return { kind: 'none', t: null, core_t: null, ext_t: null, age_s: null, text: 'No numbers yet: the PC feed did not answer. Showing the plan only.' };
  }

  function mfRows(lite) { return isObj(lite) && isObj(lite.mf) ? arr(lite.mf.a).filter(isObj) : []; }
  function atRows(lite) { return isObj(lite) && isObj(lite.at) ? arr(lite.at.a).filter(isObj) : []; }

  // one trade row from the ext "at" block: [entry_t, exit_t, dir, qty, entry, stop, target, exit_kind, usd, r]
  function atTrade(x) {
    if (!Array.isArray(x) || !num(x[0])) return null;
    const open = x[1] == null;
    return { entry_t: num(x[0]), exit_t: num(x[1]), side: num(x[2]) === -1 ? 'SHORT' : 'LONG', dir: num(x[2]) === -1 ? -1 : 1, qty: num(x[3]),
             entry: num(x[4]), stop: num(x[5]), target: num(x[6]), exit: open ? null : String(x[7] || '').toUpperCase() || null,
             usd: open ? null : num(x[8]), r: open ? null : num(x[9]), open };
  }
  function boardTrade(t) {
    if (!isObj(t) || !num(t.entry_t)) return null;
    const open = t.open === true;
    return { entry_t: num(t.entry_t), exit_t: num(t.exit_t), side: String(t.side || '').toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG',
             dir: String(t.side || '').toUpperCase() === 'SHORT' ? -1 : 1, qty: num(t.qty), entry: num(t.entry), stop: num(t.stop), target: num(t.target),
             exit: open ? null : String(t.exit || '').toUpperCase() || null, usd: open ? null : num(t.usd), r: open ? null : num(t.r), open, member: t.member || null };
  }

  // the open trade of an account: the core board card (lit / atlas, every 15 min) wins; else the ext "at" block's open row
  function positionOf(lite, ids, cardKey, feed) {
    const bd = isObj(lite) && isObj(lite.board) ? lite.board : {};
    if (cardKey && isObj(bd[cardKey])) {
      const p = bd[cardKey].position;
      if (!isObj(p) || !num(p.entry_t)) return null;
      const side = String(p.side || (num(p.dir) === -1 ? 'SHORT' : 'LONG')).toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG';
      return { entry_t: num(p.entry_t), side, dir: side === 'SHORT' ? -1 : 1, qty: num(p.qty), entry: num(p.entry), stop: num(p.stop), target: num(p.target),
               be: !!p.be, unrealized_usd: num(p.unrealized_usd), unrealized_r: num(p.unrealized_r), t: feed.core_t, src: 'core' };
    }
    const row = atRows(lite).find((r) => ids.indexOf(String(r.id)) >= 0);
    const o = row ? arr(row.tr).map(atTrade).filter((x) => x && x.open).pop() : null;
    return o ? { ...o, t: num(lite.at.t) || feed.ext_t, src: 'ext' } : null;
  }

  function enrichPosition(p, lite, feed) {
    if (!p) return null;
    const price = isObj(lite) ? num(lite.price) : null;
    const q = p.qty || 0;
    const risk = p.entry != null && p.stop != null && q ? r2((p.entry - p.stop) * p.dir * q * USD_PT) : null;   // > 0 = $ lost at the stop
    const reward = p.entry != null && p.target != null && q ? r2((p.target - p.entry) * p.dir * q * USD_PT) : null;
    let pnl = p.unrealized_usd, how = pnl != null ? 'the bot' : '';
    if (pnl == null && price != null && p.entry != null && q) { pnl = r2((price - p.entry) * p.dir * q * USD_PT); how = 'NQ ' + price.toLocaleString('en-US'); }
    return { ...p, price, risk_usd: risk, reward_usd: reward, pnl_usd: pnl, pnl_how: how, pnl_t: feed.core_t,
             stop_locks: risk != null && risk <= 0 ? r2(-risk) : null };
  }

  function tradesOf(lite, ids, cardKey) {
    const row = atRows(lite).find((r) => ids.indexOf(String(r.id)) >= 0);
    let list = row ? arr(row.tr).map(atTrade).filter(Boolean) : [];
    if (!list.length && cardKey === 'atlas' && isObj(lite) && isObj(lite.board)) {
      list = arr(lite.board.trades).filter((t) => isObj(t) && t.acct === 'atlas' && t.src === 'live').map(boardTrade).filter(Boolean);
    }
    return list.sort((a, b) => a.entry_t - b.entry_t);
  }

  // ---------------------------------------------------------------------------------------------- one account
  const CHIP = { eval: ['Evaluation', 'eval'], funded: ['Sim Funded', 'funded'], payout_ready: ['Payout ready', 'ready'], passed: ['Passed', 'passed'],
                 failed: ['Failed', 'failed'], locked: ['Locked by MFFU', 'failed'], lost: ['Lost (floor reached)', 'failed'] };

  function lifeOf(lite, ids) {
    const acc = isObj(lite) && isObj(lite.life) && isObj(lite.life.acc) ? lite.life.acc : {};
    for (const i of ids) { const v = acc[i] || acc['x:' + i]; if (isObj(v) && v.stage) return v; }
    return null;
  }

  function rule(key, label, state, text, more) { return { key, label, state, text, more: more || '' }; }

  function account(row, base, ctx, feed, now) {
    const P = row.plan || {}, l = row.live, M = ctx.M;
    const ids = [l && l.id, l && l.alias, l && l.card].concat(Array.isArray(P.pc) ? P.pc : P.pc ? [P.pc] : []).filter(Boolean).map(String);
    const mf = mfRows(ctx.lite).find((x) => ids.indexOf(String(x.id)) >= 0) || null;
    const planText = base.plan && base.plan !== '-' ? base.plan : String(P.plan || (l && l.plan) || '');
    const R = rulesFor(planText) || rulesFor(P.match) || rulesFor(l && l.plan);
    const life = lifeOf(ctx.lite, ids);
    let stage = base.stage;
    if (life && CHIP[life.stage]) stage = life.stage;
    const funded = ['funded', 'payout_ready', 'lost'].indexOf(stage) >= 0 || base.stage === 'funded';
    const srcKind = !l ? (base.planOnly ? 'plan' : 'snapshot') : l.src === 'PC live feed' ? feed.kind : 'snapshot';
    const name = (mf && mf.nm) || ownerName(l ? l.id : row.key, P.name || (l && l.name), planText, funded ? 'funded' : stage);
    let chip = CHIP[stage] || [base.status, 'eval'];
    if (!life && base.status === 'Failed') chip = CHIP.failed;
    const t = base.balance && base.balance.t ? base.balance.t : feed.core_t;
    const out = { key: row.key, name, ids, l4: base.last4 || (mf && mf.l4) || null, plan: R ? 'MFFU ' + R.label + (funded ? ' Sim Funded' : ' evaluation') : 'MFFU ' + (planText || '?'),
                  rules_key: R ? R.key : null, stage: funded && stage === 'eval' ? 'funded' : stage, funded,
                  chip: { text: base.planOnly ? 'PLAN' : srcKind === 'snapshot' ? 'SNAPSHOT · ' + chip[0] : chip[0], cls: base.planOnly ? 'plan' : srcKind === 'snapshot' ? 'snap' : chip[1] },
                  src: { kind: srcKind, label: srcKind === 'live' ? 'Live from your PC' : srcKind === 'old' ? 'PC silent: numbers from the last report' : srcKind === 'plan' ? 'PLAN: the PC has not sent numbers for it'
                    : 'SNAPSHOT, not live: the site\'s saved copy', t: srcKind === 'plan' ? null : t, asof: srcKind === 'plan' || !t ? '' : asOf(t, now), ago: srcKind !== 'plan' && t ? ago(now - t) : '' },
                  life_why: life && life.why ? String(life.why).slice(0, 160) : '', base };
    // ---- money: MFFU shows a sim funded account from $0 (start balance $0, minimum balance -$1,000 on the 25K)
    const bal = base.balance ? base.balance.v : null, start = R ? R.start : null;
    const floor = base.floor ? base.floor.v : null, room = base.room ? base.room.v : null;
    const off = funded && start != null ? start : 0;              // funded: the bot's ledger is $25,000-based, MFFU's is $0-based
    const mll = R ? R.mll : (l && l.mll) || null;
    const lockAt = start != null && R ? start + R.lock : null;
    const locked = floor != null && lockAt != null && floor >= lockAt - 0.005;
    const pos = enrichPosition(positionOf(ctx.lite, ids, l && l.card, feed), ctx.lite, feed);
    const openPnl = pos && pos.pnl_usd != null ? pos.pnl_usd : 0;
    const today = l && l.today != null ? l.today : null;
    out.money = { balance: bal != null ? r2(bal - off) : null, ledger_balance: funded ? bal : null, start: start != null ? start - off : null,
                  pnl: base.pnl ? base.pnl.v : null, today, open: pos ? pos.pnl_usd : null, floor: floor != null ? r2(floor - off) : null, room, mll, locked,
                  lock_at: lockAt != null ? lockAt - off : null, room_now: room != null ? r2(room + Math.min(0, openPnl)) : null };
    if (floor != null && mll && bal != null && !locked) {      // the EOD trail: the floor rises only after a close above the best close
      const peak = floor + mll, nf = Math.min(lockAt != null ? lockAt : Infinity, Math.max(floor, bal + openPnl - mll));
      out.money.peak = r2(peak - off);
      out.money.next_floor = r2(nf - off);
      out.money.next_text = nf > floor + 0.005 ? 'If today closes at ' + usd(r2(bal + openPnl - off), true) + ', the floor moves up to ' + usd(r2(nf - off), true) + '.'
        : 'It rises only after a day closes above ' + usd(r2(peak - off), true) + ' (your best close so far).';
    } else if (locked) out.money.next_text = 'Locked at ' + usd(lockAt - off, true) + ' (start + $100): it never moves again.';
    // ---- profit target (evaluation) / to pass
    if (R && !funded) {
      const pnl = out.money.pnl;
      out.target = { v: R.target, balance: R.start + R.target, left: pnl != null ? r2(Math.max(0, R.target - pnl)) : null,
                     progress: pnl != null ? Math.max(0, Math.min(1, pnl / R.target)) : null, pnl, min_days: R.min_days, cons: R.eval_cons };
    }
    // ---- daily loss limit (Builder: soft pause; Rapid EOD: none)
    const dllUsed = l ? (l.dll_used != null ? Math.max(l.dll_used, today != null ? -today : 0) : today != null ? Math.max(0, -today) : null) : null;
    out.dll = R && R.dll ? { v: R.dll, used: dllUsed != null ? r2(Math.max(0, dllUsed) + Math.max(0, -openPnl)) : null } : { v: null };
    if (out.dll.v && out.dll.used != null) out.dll.left = r2(Math.max(0, out.dll.v - out.dll.used));
    // ---- trades: today's session + the newest few (the ext "at" block, else ATLAS's board trades)
    const tday = tradingDay(now);
    const trades = tradesOf(ctx.lite, ids, l && l.card).filter((x) => !(x.open && pos && x.entry_t === pos.entry_t));
    out.trades_t = isObj(ctx.lite) && isObj(ctx.lite.at) ? num(ctx.lite.at.t) || feed.ext_t : feed.ext_t;
    out.today = trades.filter((x) => tradingDay(x.entry_t) === tday);
    out.recent = trades.slice(-4).reverse();
    out.position = pos;
    out.session_day = tday;
    out.today_closed = out.today.reduce((s, x) => s + (x.usd || 0), 0);
    // the last traded day (MFFU's 7-day rule): the PC's lt, else the newest day the ledger or the trade list knows
    const seen = [];
    if (mf) { if (isDay(mf.lt)) seen.push(mf.lt); for (const k of ['bd', 'wd']) if (Array.isArray(mf[k]) && isDay(mf[k][0])) seen.push(mf[k][0]); }
    for (const x of trades) seen.push(tradingDay(x.entry_t));
    if (pos && pos.entry_t) seen.push(tradingDay(pos.entry_t));
    out.last_trade = seen.length ? seen.sort().pop() : null;
    out.any_trade = !!out.last_trade || !!(mf && (mf.n || mf.td));
    // ---- stats (MFFU's dashboard: best / worst trades, average win / loss, trade count, contracts, win rate, profit factor)
    const f = mf && isObj(mf.f) ? mf.f : null;
    out.stats = mf ? { t: (isObj(ctx.lite) && isObj(ctx.lite.mf) && num(ctx.lite.mf.t)) || feed.ext_t, sd: mf.sd || null, td: mf.td || 0, lt: mf.lt || null, n: mf.n || 0, w: mf.w || 0,
                       win_pct: mf.n ? Math.round(100 * (mf.w || 0) / mf.n) : null, pf: num(mf.pf), aw: num(mf.aw), al: num(mf.al), bt: num(mf.bt), wt: num(mf.wt), ct: num(mf.ct),
                       bd: Array.isArray(mf.bd) ? mf.bd : null, wd: Array.isArray(mf.wd) ? mf.wd : null } : null;
    out.equity = base.equity && base.equity.pts ? base.equity.pts : [];
    out.start_date = base.start_date ? base.start_date.v : null;
    // ---- the payout (sim funded): the coach (payoutcoach.js = engine/payout_coach.py) + MFFU's checklist
    out.payout = funded && R && R.family === 'builder' ? payoutOf(base, R, f, out, ctx) : null;
    out.rules = rulesOf(out, R, ctx, feed, now);
    return out;
  }

  function payoutOf(base, R, f, a, ctx) {
    const c = base.payout && base.payout.c && base.payout.c.ok ? base.payout.c : null;
    const prof = a.money.balance;                                           // MFFU balance of a sim funded account = its profit
    const checks = [];
    const need = (x) => (x > 0 ? usd(x, true) + ' more' : '');
    checks.push(rule('buffer', 'Buffer ' + usd(R.buffer) + ' cleared', prof == null ? 'wait' : prof >= R.buffer ? 'ok' : 'wait',
      prof == null ? 'needs the PC\'s balance' : prof >= R.buffer ? 'balance ' + usd(prof, true) + ' is above it' : 'balance ' + usd(prof, true) + ': ' + need(r2(R.buffer - prof))));
    const line = R.buffer + R.first_above;
    checks.push(rule('above', (c && c.payouts_n ? usd(R.next_since) + ' since the last payout' : usd(R.first_above) + ' above the buffer (balance ' + usd(line) + ')'),
      prof == null ? 'wait' : prof >= line ? 'ok' : 'wait', prof == null ? '' : prof >= line ? 'met' : need(r2(line - prof))));
    const cd = f && num(f.cd) != null ? num(f.cd) : c ? c.cycle_days : null;
    checks.push(rule('days', R.cycle_days + ' trading days this payout cycle', cd == null ? 'wait' : cd >= R.cycle_days ? 'ok' : 'wait', cd == null ? 'needs the PC\'s tracker' : cd + ' of ' + R.cycle_days));
    const cp = f && num(f.cp) != null ? num(f.cp) : c ? c.cycle_profit : null, bd = f && num(f.bd) != null ? num(f.bd) : c ? c.best_day : null;
    const consOk = cp != null && cp > 0 && bd != null ? bd <= R.cons * cp + 1e-9 : null;
    checks.push(rule('cons', 'Best day at most 50% of the cycle\'s profit', consOk == null ? 'wait' : consOk ? 'ok' : 'wait',
      cp == null ? 'needs the PC\'s tracker' : cp <= 0 ? 'cycle profit ' + usd(cp) + ': nothing to measure yet' : 'best day ' + usd(bd) + ' = ' + Math.round(100 * Math.max(0, bd) / cp) + '% of ' + usd(cp)));
    const ef = (f && f.ef) || (c && c.eligible_from) || null, today = ctx.today || etDate(ctx.nowS);
    checks.push(rule('wait48', '48 hours after the first funded trade', !ef ? 'wait' : today >= ef ? 'ok' : 'wait', !ef ? 'no funded trade yet' : today >= ef ? 'since ' + dayText(ef, true) : 'from ' + dayText(ef, true)));
    const pn = f && num(f.pn) != null ? num(f.pn) : c ? c.payouts_n : 0;
    const req = c ? c.request_today : 0;
    return { coach: c, checks, eligible_from: ef, payouts_n: pn || 0, max_payouts: R.max_payouts, pay_min: R.pay_min, pay_max: R.pay_max, split: R.split, buffer: R.buffer,
             request_today: req || 0, to_you: req ? r2(req * R.split) : 0, status: (f && f.st) || (c && c.status) || null, paid: f && num(f.pt) ? num(f.pt) : 0,
             text: c ? c.text : 'Payout status needs the PC\'s balance.', t: a.stats ? a.stats.t : null };
  }

  // the MFFU rules that can pause or end the account, each OK / close / broken (wait = a requirement not met yet; info = a fact)
  function rulesOf(a, R, ctx, feed, now) {
    const out = [], m = a.money, pos = a.position;
    if (!R) return out;
    // max loss (EOD trailing): open losses count in real time
    if (m.room != null) {
      const rn = m.room_now != null ? m.room_now : m.room;
      const st = rn <= 0 || a.stage === 'failed' || a.stage === 'lost' ? 'broken' : rn < 0.25 * R.mll ? 'close' : 'ok';
      out.push(rule('mll', 'Max loss ' + usd(R.mll) + ' (trails each day\'s close)', st,
        st === 'broken' ? 'The floor ' + usd(m.floor, true) + ' was reached: MFFU ends the account' : usd(rn, true) + ' left before the floor ' + usd(m.floor, true) + (rn < m.room ? ' (open trade counted)' : ''),
        'It moves up only after a day\'s close, never down, and stops at start + $100. An open loss counts at once.'));
    } else out.push(rule('mll', 'Max loss ' + usd(R.mll) + ' (trails each day\'s close)', 'info', 'needs the PC\'s balance'));
    // daily loss limit
    if (R.dll) {
      const u = a.dll.used;
      const st = u == null ? 'info' : u >= R.dll - 0.005 ? 'broken' : u >= 0.5 * R.dll ? 'close' : 'ok';
      out.push(rule('dll', 'Daily loss limit ' + usd(R.dll) + ' (soft pause)', st,
        u == null ? 'needs today\'s $ from the PC' : st === 'broken' ? 'Hit today: MFFU pauses trading until the next session (6 PM ET); the account stays open' : usd(u, true) + ' used today, ' + usd(a.dll.left, true) + ' left',
        'Hitting it only pauses the rest of the day; it never ends the account.'));
    } else out.push(rule('dll', 'Daily loss limit', 'ok', 'None on ' + R.label));
    // contracts
    const q = pos && pos.qty ? pos.qty : 0;
    out.push(rule('size', 'Contract limit ' + R.max_minis + ' minis / ' + R.max_micros + ' micros', q > R.max_micros ? 'broken' : q > 0.8 * R.max_micros ? 'close' : 'ok',
      q ? q + ' micros open now' : 'No trade open', 'Minis and micros count together (10 micros = 1 mini); MFFU rejects orders above it.'));
    // flat by 4:10 PM ET (the bot is flat by 3:55 PM)
    const nm = etMin(now), dataMin = pos && pos.t ? etMin(pos.t) : null;
    let fst = 'ok', ftext = 'No trade held to 4:10 PM ET (the bot is flat by 3:55 PM; MFFU closes anything open at 4:10 PM)';
    if (pos) {
      if (dataMin != null && dataMin >= FLAT.mffu && dataMin < FLAT.open) { fst = 'broken'; ftext = 'A trade was still open after 4:10 PM ET (' + asOf(pos.t, now) + ')'; }
      else if (nm >= FLAT.bot && nm < FLAT.mffu && tradingDay(now) === tradingDay(pos.entry_t)) { fst = 'close'; ftext = 'Trade open near the close: the bot exits by 3:55 PM, MFFU at 4:10 PM ET'; }
      else ftext = 'Trade open: the bot closes it by 3:55 PM ET at the latest';
    }
    out.push(rule('flat', 'Flat by 4:10 PM ET', fst, ftext, 'No overnight or weekend trades. Forcing orders after 4:10 PM can disqualify the account.'));
    // holiday hours (MFFU does not auto-close at an early halt)
    const today = etDate(now), soon = CME.filter((h) => h.day >= today && diffDays(h.day, today) <= 7);
    const h = soon[0];
    let hst = 'ok', htext = 'No holiday hours in the next 7 days';
    if (h) {
      const when = dayText(h.day, true) + (h.closed ? ': CME closed all day' : ': CME closes ' + hm(h.halt) + ' ET (' + h.what + ')');
      hst = h.closed ? 'ok' : 'close';
      htext = h.closed ? when + ', no trading' : when + '. MFFU does NOT close trades for you on holidays: the bot is flat by ' + hm(h.halt - 5);
      if (!h.closed && pos && pos.t && etDate(pos.t) === h.day && etMin(pos.t) >= h.halt) { hst = 'broken'; htext = 'A trade was open after the early close on ' + dayText(h.day, true); }
    }
    out.push(rule('holiday', 'Holiday hours', hst, htext, soon.length > 1 ? 'Then: ' + soon.slice(1).map((x) => dayText(x.day, true) + (x.closed ? ' closed' : ' ' + hm(x.halt))).join(', ') : ''));
    // news
    if (a.funded && !R.news_funded) {
      const nx = T1.filter((x) => x[0] >= today && diffDays(x[0], today) <= 7)[0];
      out.push(rule('news', 'Tier-1 news (CPI, jobs, FOMC)', nx ? 'close' : 'ok', nx ? dayText(nx[0], true) + ' ' + nx[1] + ' ET ' + nx[2] + ': no trade or order from 2 min before to 2 min after'
        : 'None in the next 7 days', 'Rapid sim funded: flat with no orders 2 minutes either side of every Tier-1 release (the bot: 3 min before).'));
    } else out.push(rule('news', 'News trading', 'ok', 'Allowed on ' + R.label + (a.funded ? ' sim funded' : ' evaluations') + ' (no Tier-1 ban)'));
    // inactivity: 7 calendar days without a trade can close the account (funded: all profits lost); trade by the last day + 6
    const last = a.last_trade || null, sd = (a.stats && a.stats.sd) || (isDay(a.start_date) ? a.start_date : null);
    const base = last || (a.any_trade ? null : sd);
    if (base) {
      const idle = Math.max(0, diffDays(today, base)), left = Math.max(0, R.inactivity_days - 1 - idle), by = addDays(base, R.inactivity_days - 1);
      const st = idle >= R.inactivity_days ? 'broken' : left <= 2 ? 'close' : 'ok';
      out.push(rule('idle', '7-day inactivity rule', st, (last ? 'Last trade ' + dayText(last, true) : 'No trade yet (started ' + dayText(base, true) + ')') + (st === 'broken' ? ': 7+ days without a trade, MFFU may close it'
        : ': trade by ' + dayText(by, true) + (left === 0 ? ' (today is the last day)' : ' (' + left + ' day' + (left === 1 ? '' : 's') + ' left)')),
        a.funded ? 'On a sim funded account it forfeits all the profits. Tell MFFU support before a break of more than 7 days.' : 'Tell MFFU support before a break of more than 7 days.'));
    } else out.push(rule('idle', '7-day inactivity rule', 'info', 'needs the PC\'s ledger (last trade day)'));
    return out;
  }

  // no long + short open at the same time across your MFFU accounts (MFFU: hedging of any kind; the bot blocks it on every pair)
  function hedge(accts) {
    const open = accts.filter((a) => a.position && a.src.kind !== 'plan');
    const L = open.filter((a) => a.position.dir === 1), S = open.filter((a) => a.position.dir === -1);
    const bad = L.length && S.length;
    const text = bad ? L.map((a) => a.name).join(', ') + ' LONG while ' + S.map((a) => a.name).join(', ') + ' SHORT'
      : open.length ? 'Open trades all point the same way' : 'No opposite trades open across your accounts';
    for (const a of accts) {
      if (a.src.kind === 'plan') continue;
      a.rules.push(rule('hedge', 'No hedging across accounts', bad && a.position ? 'broken' : 'ok', bad && a.position ? text : text,
        'MFFU bans a long and a short on the same market at the same time, across all your accounts.'));
    }
  }

  function planRow(a) {
    const R = rulesFor(a.plan) || rulesFor(a.match);
    let rules = '';
    if (R && R.family === 'rapid') {
      rules = 'Pass: make ' + usd(R.target) + ' in at least ' + R.min_days + ' days, no day over ' + Math.round(R.eval_cons * 100) + '% of the profit; max loss ' + usd(R.mll)
        + ' from the best close; no daily loss limit; ' + R.max_minis + ' minis / ' + R.max_micros + ' micros. Funded: no trade 2 min around Tier-1 news, payouts daily from '
        + usd(R.pay_min) + ' after the ' + usd(R.buffer) + ' buffer, you keep ' + Math.round(R.split * 100) + '%.';
    } else if (R) {
      rules = 'Pass: make ' + usd(R.target) + ' (1 day minimum, no consistency rule); max loss ' + usd(R.mll) + ' from the best close; daily loss ' + usd(R.dll) + ' (soft pause).';
    }
    return { key: a.key, name: a.name, plan: a.plan || '', cost: a.cost || '', rules };
  }

  function center(src, nowS) {
    const s = isObj(src) ? src : {};
    const now = num(nowS) || Math.floor(Date.now() / 1000);
    const M = s.M || root.MFFU_MODEL;
    const lite = isObj(s.lite) && s.lite.kind === 'le-live' ? s.lite : null;
    const board = isObj(s.board) && s.board.kind === 'olympus-board' ? s.board : null;
    const home = isObj(s.home) ? s.home : null;
    const feed = feedState(lite, board, home, now);
    const ctx = { lite, home, board, coach: s.coach || null, today: s.today || etDate(now), nowS: now, M };
    let accts = [];
    if (M) {
      let rows = M.match(s.plan, lite, home).filter((r) => !(r.plan && (r.plan.status === 'waiting' || r.plan.status === 'buying') && !r.live)
        && !/blitz|paper|cloud/i.test(String(r.key)));
      // a PC row whose id a matched plan row already owns (its "pc" ids) is that same account seen twice (the bot's card and its ledger
      // row a few seconds apart): one card, never two
      const owned = new Set();
      for (const r of rows) if (r.plan && r.live) for (const x of (Array.isArray(r.plan.pc) ? r.plan.pc : r.plan.pc ? [r.plan.pc] : [])) owned.add(String(x).toLowerCase());
      rows = rows.filter((r) => r.plan || !r.live || !owned.has(String(r.live.id).toLowerCase()));
      accts = rows.map((r) => account(r, M.card(r, { lite, home, board, coach: ctx.coach, today: ctx.today, nowS: now }), ctx, feed, now));
    }
    hedge(accts);
    const open = accts.filter((a) => a.position).map((a) => ({ name: a.name, key: a.key, ...a.position }));
    const latest = [];
    for (const a of accts) for (const x of a.recent) latest.push({ name: a.name, key: a.key, ...x });
    latest.sort((x, y) => y.entry_t - x.entry_t);
    const decoder = accts.filter((a) => a.l4).map((a) => [a.l4, a.name]);
    return { feed, accounts: accts, planned: M ? M.planned(s.plan).map(planRow) : [], open, latest: latest.slice(0, 5), decoder, now,
             session_day: tradingDay(now), today: ctx.today, day: dayEnd(now) };
  }

  const api = { RULES, CME, T1, FLAT, STALE_S, USD_PT, rulesFor, ownerName, tradingDay, etDate, etMin, clock, asOf, ago, dayText, hm, usd, sgn, addDays, diffDays,
                feedState, atTrade, positionOf, enrichPosition, dayEnd, center };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MFFU_CENTER = api;
})(typeof window !== 'undefined' ? window : globalThis);
