// TRADING HOME core (owner 2026-11-22): the 5-line "Today" checklist (+ a READY / NOT READY line first when the post carries the PC's ready check) from the PC's PUBLIC status post only (status_feed.json,
// read by ../pc_feed.js). Pure: no DOM, no fetch. Browser: window.TRADING_HOME; node tests: module.exports. Sends nothing, arms nothing.
// Each line: {id, ok: true | false | null (null = the phone cannot see it), title, say (plain words), menu (the TRADE_HOME number on the PC)}.
(function (root) {
  'use strict';
  const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
  const num = (v) => (v == null || v === '' || !Number.isFinite(+v) ? null : +v);
  const usd = (n) => '$' + Math.round(Math.abs(n)).toLocaleString('en-US');
  const FRESH_S = 30 * 60, ALERT_OK_DAYS = 30;

  function ageText(s) {
    if (s == null) return 'never';
    s = Math.max(0, Math.round(s));
    return s < 90 ? s + ' s' : s < 5400 ? Math.round(s / 60) + ' min' : (s / 3600).toFixed(1) + ' h';
  }
  // the PC's accounts; ATLAS (account B) is not in "accounts" (tonight's real post): a row is made from board.atlas (audit E1, 2026-11-22)
  function realAccounts(lite) {
    const rows = (Array.isArray(lite && lite.accounts) ? lite.accounts : [])
      .filter((a) => isObj(a) && a.id && !/blitz/i.test(String(a.id)) && a.source !== 'cloud');
    const bd = isObj(lite) && isObj(lite.board) ? lite.board : {}, at = isObj(bd.atlas) ? bd.atlas : null;
    if (at && at.configured !== false && !rows.some((a) => /atlas|acct_b/i.test(String(a.id)))) {
      const funded = /funded/i.test(String(at.status || '') + ' ' + String(at.plan || ''));
      rows.push({ id: 'atlas', name: 'ATLAS', plan: at.plan || 'Builder 25K', kind: funded ? 'funded' : 'eval', stage: funded ? 'funded' : undefined, source: 'pc',
        badge: at.badge, enabled: at.enabled, locked: at.locked, synthetic: true, conn: { running: bd.running },
        eval: { balance: at.balance, floor: at.floor, room: at.room, to_target: funded ? undefined : at.to_target, today: at.today_pnl, status: at.status } });
    }
    return rows;
  }
  // the brain glance's id of an account (the core's "ar" is keyed by it): the bot's main account = "lit"
  function arKey(a, lite) {
    const lit = isObj(lite) && isObj(lite.board) && isObj(lite.board.lit) ? lite.board.lit : null, ev = isObj(a.eval) ? a.eval : {};
    if (a.id === 'mffu50k_eval' || (lit && num(ev.balance) != null && num(ev.balance) === num(lit.balance) && num(ev.floor) === num(lit.floor))) return 'lit';
    return /atlas|acct_b/i.test(String(a.id)) ? 'atlas' : String(a.id);
  }
  // why an account is held ('' = armed): off, locked, not a LIVE account, or the core's "ar" says not armed (audit E1)
  function heldWhy(a, lite) {
    const ar = isObj(lite) && isObj(lite.ar) ? lite.ar[arKey(a, lite)] : undefined;
    if (a.enabled === false) return 'off';
    if (a.locked) return 'locked today';
    if (Array.isArray(ar) && ar.length >= 2 && !ar[1]) return 'not armed';
    if (String(a.badge || '').toUpperCase() !== 'LIVE') return a.badge ? 'on ' + String(a.badge).toUpperCase() : 'not armed';
    return '';
  }
  const nameOf = (a) => String(a.name || a.id).replace(/^MFFU\s+/i, '');

  // the next money step in $ for the closest account: an eval needs +$X to pass, a funded one $X more to the max payout
  function nextStep(lite, mffuView) {
    const out = [];
    for (const a of realAccounts(lite)) {
      const ev = isObj(a.eval) ? a.eval : {};
      const funded = /funded/i.test(String(a.kind || '') + ' ' + String(a.stage || '') + ' ' + String(a.plan || '') + ' ' + String(ev.status || ''));
      if (funded && typeof mffuView === 'function') {
        let v = null;
        try { v = mffuView({ kind: 'funded', plan: a.plan, name: a.name, id: a.id, balance: ev.balance, room: ev.room, floor: ev.floor }); } catch (e) { v = null; }
        if (v && v.goal && v.goal.need != null) { out.push({ n: v.goal.need, t: nameOf(a) + ': ' + (v.goal.ready ? 'ask the ' + usd(v.goal.ask) + ' payout now' : usd(v.goal.need) + ' more profit, then ask the ' + usd(v.goal.ask) + ' payout') }); continue; }
      }
      const tt = num(ev.to_target);
      if (!funded && tt != null) out.push({ n: Math.max(0, tt), t: nameOf(a) + ' needs +' + usd(tt) + ' to pass the eval' });
    }
    out.sort((x, y) => x.n - y.n);
    return out.length ? out[0].t : null;
  }

  // night-truth 2026-11-22 (owner's ask): one line per account: armed / running, room $, today $, next window (the LIT window for
  // Zlarior's accounts and the Rapid, ATLAS its own). "ar" sure = the core said it; without it the badge is a guess ("?").
  const size = (t) => { const m = /(25|50|100|150)\s*k/i.exec(String(t || '')); return m ? m[1] + 'K' : ''; };
  function winText(c) {
    const w = isObj(c) && isObj(c.window) ? c.window : null;
    if (!w) return null;
    if (w.open) return 'window open now';
    return String(w.text || '').replace(/^next entry window\s*/i, 'next ') || null;
  }
  function accountRows(lite) {
    const L = isObj(lite) ? lite : {}, bd = isObj(L.board) ? L.board : {}, ar = isObj(L.ar) ? L.ar : null;
    return realAccounts(L).map((a) => {
      const ev = isObj(a.eval) ? a.eval : {}, conn = isObj(a.conn) ? a.conn : {}, k = arKey(a, L), why = heldWhy(a, L);
      const funded = /funded/i.test(String(a.kind || '') + ' ' + String(a.stage || '') + ' ' + String(ev.status || ''));
      const nm = k === 'lit' ? 'Zlarior ' + (size(a.plan) || size(a.name) || '50K') : k === 'atlas' ? 'ATLAS ' + (size(a.plan) || '25K') + (funded ? ' funded' : '')
        : /rapid/i.test(String(a.id) + ' ' + String(a.plan || '')) ? 'Rapid EOD ' + (size(a.plan) || size(a.name)) : nameOf(a).replace(/\bBuilder\s+/i, '');
      const t = num(ev.today) != null ? num(ev.today) : num(isObj(a.pnl) ? a.pnl.today : null);
      return { id: String(a.id), name: nm.trim(), armed: { v: !why, why, sure: !!(ar && Array.isArray(ar[k])) },
        run: conn.running != null ? !!conn.running : a.running != null ? !!a.running : bd.running, room: num(ev.room), today: t,
        win: winText(k === 'atlas' ? bd.atlas : bd.lit), funded };
    });
  }
  function rowText(r) {
    const arm = r.armed.v ? 'ARMED' + (r.armed.sure ? '' : ' ?') : 'NOT armed' + (r.armed.why && r.armed.why !== 'not armed' ? ' (' + r.armed.why + ')' : '');
    const run = r.run === true ? 'running' : r.run === false ? 'STOPPED' : 'running ?';
    const sg = (n) => (n == null ? '-' : (n > 0.5 ? '+' : n < -0.5 ? '-' : '') + usd(n));
    return arm + ', ' + run + ' · room ' + (r.room == null ? '-' : usd(r.room)) + ' · today ' + sg(r.today) + ' · ' + (r.win || 'next window: -');
  }

  function today(lite, o) {
    o = o || {};
    const now = num(o.now) != null ? +o.now : Date.now() / 1000;
    const L = isObj(lite) ? lite : null;
    const age = L && num(L.t) ? now - +L.t : null;
    const fresh = age != null && age <= FRESH_S;
    const accts = L ? realAccounts(L) : [];
    const out = [];

    // 0 READY / NOT READY (engine/readiness via the status post's "rd" block, day-ready 2026-11-22): the PC's own pre-window self-check
    const rd = L && fresh && isObj(L.rd) ? L.rd : null;
    const rds = rd && (rd.s === 'ok' || rd.s === 'warn' || rd.s === 'no') ? rd.s : null;
    if (rds) out.push({ id: 'ready', ok: rds === 'ok' || rds === 'warn' ? true : rds === 'no' ? false : null, tone: rds === 'no' ? 'gold' : rds ? 'mint' : null, title: 'Ready to trade',
      say: rds === 'ok' ? 'READY' + (rd.w ? ' for ' + rd.w : '') + '. The PC checked its clock, NinjaTrader, bars and accounts.' :
        rds === 'warn' ? 'READY, 1 to watch: ' + (rd.b || 'see the PC') + '.' :
        'NOT READY' + (rd.w ? ' for ' + rd.w : '') + ': ' + (rd.b || 'see the PC') + '. ' + (rd.f || 'On the PC: double-click HEALTH_CHECK.bat.'),
      menu: rds === 'no' ? 1 : null });

    // 1 bot running
    let run = null;
    if (L && fresh) {
      const flags = [isObj(L.board) ? L.board.running : undefined, isObj(L.pc) ? L.pc.running : undefined].concat(accts.map((a) => (isObj(a.conn) ? a.conn.running : undefined)));
      run = flags.some((f) => f === true) ? true : flags.some((f) => f === false) ? false : null;
    }
    out.push({ id: 'bot', ok: !L || !fresh ? false : run, title: 'Bot running',
      say: run === true ? 'Running. The PC reported ' + ageText(age) + ' ago.' :
        !L ? 'No report from the PC at all. On the PC: double-click TRADE_HOME, press 2 (Start bot).' :
        !fresh ? 'The PC has been silent ' + ageText(age) + '. On the PC: double-click TRADE_HOME, press 1 to look, then 2 (Start bot).' :
        'The bot is not running. On the PC: double-click TRADE_HOME, press 2 (Start bot) and type the phrase.',
      menu: run === true ? null : 2 });

    // 2 keep-alive
    const rows = L && isObj(L.k7) && Array.isArray(L.k7.a) ? L.k7.a.filter((r) => isObj(r) && r.on != null) : [];
    const off = rows.filter((r) => r.on !== true);
    const kok = !rows.length ? null : off.length === 0;
    out.push({ id: 'keepalive', ok: kok, title: 'Keep-alive on',
      say: kok === true ? 'On for ' + rows.length + ' account(s): MFFU will not close them for 7 idle days.' :
        kok === false ? 'Off for ' + off.map((r) => r.nm || r.id).join(', ') + '. On the PC: TRADE_HOME, press 3, type KEEP ALIVE ON yourself.' :
        'The phone cannot see it. On the PC: TRADE_HOME, press 1 (Status), or press 3 to turn it on.',
      menu: kok === true ? null : 3 });

    // 3 alerts: the public post does not carry it, so the owner ticks it after a test alert reached his phone
    const at = num(o.alertsOkAt);
    const aok = at != null && now - at <= ALERT_OK_DAYS * 86400;
    out.push({ id: 'alerts', ok: aok, title: 'Phone alerts OK',
      say: aok ? 'You saw a test alert ' + Math.max(0, Math.round((now - at) / 86400)) + ' day(s) ago.' :
        'Not checked lately. On the PC: TRADE_HOME, press 5 (Phone alerts), send a test, then tap "I got my test alert" below.',
      menu: aok ? null : 5, tick: true });

    // 4 every account armed (audit E1): held = off, locked, not a LIVE account, or the core's "ar" says not armed; ATLAS counted too
    const held = accts.filter((a) => heldWhy(a, L));
    const arm = !L || !fresh ? null : !accts.length ? false : held.length === 0;
    out.push({ id: 'armed', ok: arm, title: 'Every account armed',
      say: arm === true ? accts.length + ' account(s) armed.' :
        !accts.length && L && fresh ? 'No account is on the bot yet. On the PC: TRADE_HOME, press 4 (Add an account).' :
        arm === false ? held.map((a) => nameOf(a) + ' (' + heldWhy(a, L) + ')').join(', ') + ' held. On the PC: TRADE_HOME, press 2 (Start bot) and type the phrase yourself.' :
        'Cannot tell: the PC is silent. On the PC: TRADE_HOME, press 1 (Status).',
      menu: arm === true ? null : accts.length || !L || !fresh ? 2 : 4 });

    // 5 next money step
    const step = L ? nextStep(L, o.mffuView) : null;
    out.push({ id: 'next', ok: step != null ? true : null, title: 'Next step in $',
      say: step != null ? step : 'No account numbers yet. On the PC: TRADE_HOME, press 1 (Status).', menu: step != null ? null : 1 });
    // the account lines (owner's ask), their own list under the checklist: armed / running, room $, today $, next window
    // red team 2026-11-23: green only when the core's "ar" CONFIRMS armed (sure); an armed guess from the badge alone is grey (null)
    const acctRows = L ? accountRows(L).map((r) => ({ id: r.id, ok: !fresh ? null : !r.armed.v || r.run === false ? false
      : r.armed.sure && r.run === true ? true : null, title: r.name,
      say: (fresh ? '' : 'Old report (' + ageText(age) + '): ') + rowText(r) })) : [];
    // 6 Fleet (engine/fleet_mgr via the status post's "fl" block, night-fleetmgr 2026-11-23): the accounts, MFFU's slots, the next money move.
    // Info only: it never counts as a to-do (ok true), and it is shown only when the PC sends it.
    const fl = L && isObj(L.fl) && typeof L.fl.s === 'string' ? L.fl : null;
    if (fl) out.push({ id: 'fleet', ok: true, info: true, title: 'Fleet', say: String(fl.s).slice(0, 200), menu: null });
    return { age, fresh, lines: out, accounts: acctRows, left: out.filter((x) => x.ok !== true).length };
  }

  const API = { today, nextStep, ageText, realAccounts, heldWhy, accountRows, rowText, FRESH_S, ALERT_OK_DAYS };
  root.TRADING_HOME = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
