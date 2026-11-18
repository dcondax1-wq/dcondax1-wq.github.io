// BOARD model (2026-11-17, docs/BOARD.md): the pure part of the Board page, no DOM. Classic script (window.BOARD_MODEL) and a
// CommonJS module for node tests (tests/test_board.py).
//   pick({site, lite, plan, fixture, demo}, nowS) -> {mode, label, board}
//      site    ./board.json: on the PC the live board (/site/board/board.json, src "pc"), elsewhere the published copy (src "cloud")
//      lite    the PC's newest ntfy status post (window.PC_FEED.fetchLatest), its "brd" = the board's tiny cut
//      plan    ../business/accounts.json (rows labelled PLAN)
//      fixture ./fixture.json (demo mode, ?demo=1, or when nothing else answered)
//   Order: the PC feed when fresh, else the published board copy, else the plan, else the demo fixture.
//   planBoard(plan, nowS) -> a board made from accounts.json alone
//   silent(board, nowS)   -> {silent, age_s, text}: the PC is silent when it has not reported for STALE_S
(function (root) {
  'use strict';
  const STALE_S = 30 * 60;
  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v.replace(/[$,]/g, '')) ? +v.replace(/[$,]/g, '') : null));
  const RULES = [['rapid eod 50k', 50000, 3000], ['builder 50k', 50000, 3000], ['builder 25k', 25000, 1500]];
  const T = (b) => (isObj(b) ? num(b.t) || 0 : 0);
  // which live numbers belong to which row: by the PC id / Name, never the plan size (../business/mffumodel.js)
  const MM = root.MFFU_MODEL || (typeof require === 'function' ? require('../business/mffumodel.js') : null);

  function ago(s) {
    if (s == null || !Number.isFinite(s)) return 'never';
    s = Math.max(0, Math.round(s));
    if (s < 90) return 'just now';
    if (s < 5400) return Math.round(s / 60) + ' min ago';
    if (s < 2 * 86400) return Math.round(s / 3600) + ' h ago';
    return Math.round(s / 86400) + ' days ago';
  }

  function usd(v) {
    const x = num(v);
    return x == null ? '-' : (x < 0 ? '-$' : '$') + Math.abs(Math.round(x)).toLocaleString('en-US');
  }

  function chipOf(stage, status, locked) {
    if (stage === 'failed') return 'failed';
    if (stage === 'passed') return 'PASSED';
    if (locked) return 'locked';
    if (stage === 'funded') return 'funded';
    if (status === 'buying' || status === 'waiting') return 'planned';
    return 'eval';
  }

  function planBoard(plan, nowS) {
    const p = isObj(plan) ? plan : {};
    const accounts = [];
    for (const a of Array.isArray(p.accounts) ? p.accounts : []) {
      if (!isObj(a) || !a.key || /blitz/i.test(String(a.key))) continue;
      const m = String(a.next || '').match(/balance\s+\$?([\d,]+(?:\.\d+)?)\s*\(owner,\s*([A-Za-z]{3,9}\s+\d{1,2})\)/i);
      const bal = m ? num(m[1]) : null;
      let stage = String(a.stage || 'eval'), toPass = null;
      const rule = RULES.find((r) => String(a.plan || '').toLowerCase().includes(r[0]));
      if (rule && bal != null && (stage === 'eval' || stage === 'passed')) {
        toPass = Math.max(0, rule[1] + rule[2] - bal);
        if (toPass <= 0) stage = 'passed';
      }
      const rm = String(a.next || '').match(/\$([\d,]+)\s+of\s+room/i);
      accounts.push({ key: a.key, name: a.name || a.key, plan: a.plan || '', status: a.status || '', stage, pc: Array.isArray(a.pc) ? a.pc.map(String) : [], plan_only: true, chip: chipOf(stage, bal == null ? a.status : '', false),
                      balance: bal, room: stage === 'eval' && rm ? num(rm[1]) : null, to_pass: stage === 'passed' ? 0 : toPass, locked: false,
                      src: m ? 'PLAN (owner, ' + m[2] + ')' : 'PLAN', src_t: null, last: null, age_s: null });
    }
    return { v: 1, kind: 'olympus-board', t: nowS, src: 'plan', pc: { t: null, age_s: null, via: '', stale: true }, accounts, events: [], open_notes: [],
             waiting: (Array.isArray(p.decisions) ? p.decisions : []).map(String).slice(0, 8), plan_updated: p.updated || null };
  }

  // lay the PC's ntfy post over a board: its live account numbers (board cards lit / atlas + accounts, matched by PC id / Name),
  // then the PC's own board rows (brd: plan + events on the PC) only where no live number came, then the newest events
  function overlayLite(board, lite) {
    const b = JSON.parse(JSON.stringify(board));
    const brd = isObj(lite) && isObj(lite.brd) ? lite.brd : null;
    const t = num(lite && lite.reporter && lite.reporter.t) || num(lite && lite.t) || 0;
    b.pc = { t, age_s: null, via: 'ntfy', stale: false };
    b.accounts = b.accounts || [];
    const rows = new Map(b.accounts.map((r) => [r.key, r]));
    const done = new Set();
    if (MM && isObj(lite)) {
      const asPlan = b.accounts.map((r) => ({ key: r.key, name: r.name, pc: r.pc }));
      for (const l of MM.liveAccounts(lite, null)) {
        const key = MM.planKey(asPlan, l.id, l.name) || (l.alias ? MM.planKey(asPlan, l.alias, '') : '') || (l.card ? MM.planKey(asPlan, l.card, '') || ({ lit: 'zlarior', atlas: 'atlas' })[l.card] : '') || l.id;
        if (done.has(key) || /blitz|acct_c/i.test(key)) continue;
        done.add(key);
        let r = rows.get(key);
        if (!r) { r = { key, name: l.name || key, plan: l.plan || '', last: null, not_in_plan: true }; rows.set(key, r); b.accounts.push(r); }
        let stage = l.stage === 'funded' ? 'funded' : l.stage === 'failed' ? 'failed' : (r.chip === 'PASSED' && l.stage === 'eval' && (l.to_target == null || l.to_target <= 0)) ? 'passed' : 'eval';
        if (stage === 'eval' && l.to_target != null && l.to_target <= 0) stage = 'passed';
        Object.assign(r, { stage, chip: chipOf(stage, '', false), balance: l.balance, floor: l.floor, room: stage === 'passed' ? null : l.room,
                           to_pass: stage === 'funded' ? null : stage === 'passed' ? 0 : l.to_target, locked: false, src: 'PC live (ntfy)', src_t: l.t || t, plan_only: false });
      }
    }
    if (!brd) return b;
    for (const x of Array.isArray(brd.ac) ? brd.ac : []) {
      if (!Array.isArray(x) || !x[0] || /blitz/i.test(String(x[0])) || done.has(x[0])) continue;
      const r = rows.get(x[0]) || { key: x[0], name: String(x[0]).toUpperCase(), plan: '', last: null };
      Object.assign(r, { chip: x[1] || r.chip, balance: num(x[2]), room: num(x[3]), to_pass: num(x[4]), locked: !!x[5], src: 'PC board (ntfy)', src_t: num(brd.t) || t, plan_only: false });
      if (!rows.has(x[0])) { rows.set(x[0], r); b.accounts.push(r); }
    }
    const seen = new Set((b.events || []).map((e) => e.t + '|' + e.kind + '|' + e.acct));
    for (const x of Array.isArray(brd.ev) ? brd.ev : []) {
      if (!Array.isArray(x) || x.length < 4 || /blitz/i.test(String(x[2]))) continue;
      const k = x[0] + '|' + x[1] + '|' + (x[2] || '');
      if (seen.has(k)) continue;
      seen.add(k);
      (b.events = b.events || []).push({ id: 'n' + x[0] + x[1], t: x[0], kind: x[1], acct: x[2], text: String(x[3] || ''), src: 'bot' });
    }
    b.events = (b.events || []).sort((a, c) => (num(c.t) || 0) - (num(a.t) || 0));
    return b;
  }

  function fresh(t, nowS) { return !!t && nowS - t <= STALE_S; }

  function pick(src, nowS) {
    const s = isObj(src) ? src : {};
    const now = nowS || Math.floor(Date.now() / 1000);
    const good = (b) => isObj(b) && b.kind === 'olympus-board' && Array.isArray(b.accounts) && !b.error;
    if (s.demo && good(s.fixture)) return { mode: 'demo', label: 'DEMO: example numbers, not your accounts', board: s.fixture };
    const site = good(s.site) ? s.site : null;
    const lite = isObj(s.lite) && s.lite.kind === 'le-live' ? s.lite : null;
    const liteT = lite ? num(lite.reporter && lite.reporter.t) || num(lite.t) || 0 : 0;
    if (site && site.src === 'pc' && fresh(num(site.pc && site.pc.t), now)) return { mode: 'pc', label: 'LIVE from your PC', board: site };
    if (lite && fresh(liteT, now)) {
      const base = site || (isObj(s.plan) ? planBoard(s.plan, now) : null) || planBoard({}, now);
      return { mode: 'pc', label: 'LIVE from your PC (status feed)', board: overlayLite(base, lite) };
    }
    if (site) {
      const b = JSON.parse(JSON.stringify(site));
      if (lite && liteT > (num(b.pc && b.pc.t) || 0)) b.pc = { t: liteT, via: 'ntfy', stale: true };
      return { mode: 'copy', label: 'Board copy from ' + ago(now - T(site)) + ' (the PC is not live here)', board: b };
    }
    if (isObj(s.plan) && Array.isArray(s.plan.accounts)) return { mode: 'plan', label: 'PLAN only: no live numbers from the PC', board: planBoard(s.plan, now) };
    if (good(s.fixture)) return { mode: 'demo', label: 'DEMO: example numbers, nothing else answered', board: s.fixture };
    return { mode: 'none', label: 'Nothing to show yet', board: planBoard({}, now) };
  }

  function silent(board, nowS) {
    const t = num(board && board.pc && board.pc.t);
    const age = t ? nowS - t : null;
    const isSilent = age == null || age > STALE_S;
    return { silent: isSilent, age_s: age,
             text: !t ? 'PC SILENT: your PC has never reported here. The bots may not be running.'
                      : isSilent ? 'PC SILENT: last report ' + ago(age) + '. Check the PC: STOP BOT, then START BOT.' : 'PC reporting: ' + ago(age) };
  }

  const KIND_WORDS = { eval_passed: 'Eval passed', eval_failed: 'Eval failed', account_locked: 'Account locked', order_rejected: 'Order rejected',
                       payout_ready: 'Payout ready', payout_requested: 'Payout requested', balance: 'Balance', bot_started: 'Bot started',
                       bot_stopped: 'Bot stopped', pc_silent: 'PC silent', owner_note: 'You wrote', claude_note: 'Claude', plan_changed: 'Plan changed',
                       daily_review: 'ZEUS review', brief: 'Morning brief' };
  const LOUD = new Set(['eval_passed', 'eval_failed', 'account_locked', 'order_rejected', 'payout_ready', 'pc_silent']);
  const SRC_WORDS = { bot: 'PC', owner: 'you', claude: 'Claude', plan: 'plan', cloud: 'cloud' };
  KIND_WORDS.weekly_review = 'Weekly review';     // tools/weekly_review.py (Business -> This week)
  KIND_WORDS.risk_alert = 'Risk alert';           // night-risk: engine/circuit_breaker (live vs twin advice) + engine/msg_throttle
  LOUD.add('risk_alert');

  const api = { STALE_S, pick, planBoard, overlayLite, silent, ago, usd, chipOf, KIND_WORDS, LOUD, SRC_WORDS, num };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BOARD_MODEL = api;
})(typeof window !== 'undefined' ? window : globalThis);
