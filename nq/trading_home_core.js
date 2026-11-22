// TRADING HOME core (owner 2026-11-22): the 5-line "Today" checklist from the PC's PUBLIC status post only (status_feed.json,
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
  const realAccounts = (lite) => (Array.isArray(lite && lite.accounts) ? lite.accounts : [])
    .filter((a) => isObj(a) && a.id && !/blitz/i.test(String(a.id)) && a.source !== 'cloud');
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

  function today(lite, o) {
    o = o || {};
    const now = num(o.now) != null ? +o.now : Date.now() / 1000;
    const L = isObj(lite) ? lite : null;
    const age = L && num(L.t) ? now - +L.t : null;
    const fresh = age != null && age <= FRESH_S;
    const accts = L ? realAccounts(L) : [];
    const out = [];

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

    // 4 every account armed (badge LIVE = you armed it; anything else is held)
    const held = accts.filter((a) => String(a.badge || '').toUpperCase() !== 'LIVE');
    const arm = !L || !fresh ? null : !accts.length ? false : held.length === 0;
    out.push({ id: 'armed', ok: arm, title: 'Every account armed',
      say: arm === true ? accts.length + ' account(s) armed.' :
        !accts.length && L && fresh ? 'No account is on the bot yet. On the PC: TRADE_HOME, press 4 (Add an account).' :
        arm === false ? held.map(nameOf).join(', ') + ' held. On the PC: TRADE_HOME, press 2 (Start bot) and type the phrase yourself.' :
        'Cannot tell: the PC is silent. On the PC: TRADE_HOME, press 1 (Status).',
      menu: arm === true ? null : accts.length || !L || !fresh ? 2 : 4 });

    // 5 next money step
    const step = L ? nextStep(L, o.mffuView) : null;
    out.push({ id: 'next', ok: step != null ? true : null, title: 'Next step in $',
      say: step != null ? step : 'No account numbers yet. On the PC: TRADE_HOME, press 1 (Status).', menu: step != null ? null : 1 });
    return { age, fresh, lines: out, left: out.filter((x) => x.ok !== true).length };
  }

  const API = { today, nextStep, ageText, FRESH_S, ALERT_OK_DAYS };
  root.TRADING_HOME = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
