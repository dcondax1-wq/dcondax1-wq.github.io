// MFFU VIEW model (2026-11-18, owner: "a page where I can see exact accounts just like the MFFU site"). The pure part, no DOM:
// which live numbers belong to which account, and one MFFU-style card per account. Classic script (window.MFFU_MODEL) and a
// CommonJS module for node tests (tests/test_business_pages.py). Used by business/mffu.html, business/accounts.js, board/boardmodel.js.
//   planKey(planAccounts, id, name)   the accounts.json key of a PC account: its "pc" ids, else the Name. NEVER the plan size
//                                     (2026-11-18: the new Builder 25K eval b25k_2 had landed on ATLAS's funded row)
//   liveAccounts(lite, home)          every real PC account in the feed: board cards lit / atlas + lite.accounts (+ home fallback)
//   match(plan, lite, home)           [{key, plan row | null, live row | null}]: each live account on exactly one row (night-feedsA 2026-11-19:
//                                     by PC id / Name, then the last 4, the balance only as a last resort within TOL: never a 2nd Zlarior row)
//   cards(src, nowS)                  the MFFU cards: {lite, home, plan, board (the published board copy)} -> [card]
(function (root) {
  'use strict';
  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v.replace(/[$,]/g, '')) ? +v.replace(/[$,]/g, '') : null));
  const r2 = (v) => Math.round(v * 100) / 100;
  const DROP = new Set(['mffu', 'builder', 'eval', 'evaluation', 'funded', 'next', 'account', 'the', 'sim', 'live']);
  // MFFU Builder rules (research/lit/mffu_rules.json, checked 2026-11-17): eval min 1 trading day, no eval consistency rule;
  // funded: 50% best-day rule per payout cycle, 2 traded days a cycle, buffer, min / max request
  const RULES = {
    builder50k: { label: 'Builder 50K', start: 50000, target: 3000, mll: 2000, dll: 1000, lock: 100, min_days: 1, buffer: 2100, pay_min: 500, pay_max: 2000, cons: 0.5, cycle_days: 2 },
    builder25k: { label: 'Builder 25K', start: 25000, target: 1500, mll: 1000, dll: 600, lock: 100, min_days: 1, buffer: 1100, pay_min: 250, pay_max: 1000, cons: 0.5, cycle_days: 2 },
  };
  const tokens = (s) => (String(s || '').toLowerCase().match(/[a-z0-9#]+/g) || []).filter((w) => !DROP.has(w)).sort().join(' ');
  const ids = (a) => (Array.isArray(a.pc) ? a.pc : a.pc ? [a.pc] : []).map((x) => String(x).trim().toLowerCase());
  // night-feedsA 2026-11-19 (lead: a SECOND "Zlarior 50K" row on the Board and the ZEUS card when the bot's card and its ledger row read
  // the balance a few cents apart): the same account is matched by its PC id / last 4 first; the balance is only the last resort, within
  // TOL, and only between the bot's CARD (id lit / atlas, no account id) and a ledger row, never between two rows with their own ids.
  const TOL = 5;
  const near = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= (tol == null ? TOL : tol);
  // a cloud / paper twin is never a real account (the GitHub Pages build's home.json: badge PAPER, source "cloud paper", $49,900)
  const paperish = (x) => isObj(x) && (/^paper$/i.test(String(x.badge || '')) || /cloud/i.test(String(x.source || '')) || (isObj(x.conn) && x.conn.present === false));

  function planKey(planAccounts, id, name) {
    const accts = (Array.isArray(planAccounts) ? planAccounts : []).filter((a) => isObj(a) && a.key);
    const pid = String(id || '').trim().toLowerCase();
    if (pid) for (const a of accts) if (ids(a).includes(pid) || String(a.key).toLowerCase() === pid) return String(a.key);
    const t = tokens(name);
    if (t) for (const a of accts) if (tokens(a.name) === t) return String(a.key);
    return '';
  }

  function rulesOf(text) {
    const s = String(text || '').toLowerCase();
    if (/rapid/.test(s)) return null;
    return /50k/.test(s) ? RULES.builder50k : /25k/.test(s) ? RULES.builder25k : null;
  }

  // every real PC account in the feed. t = when the PC saw it; src names the feed.
  function liveAccounts(lite, home) {
    const out = [];
    const add = (r) => { if (!out.some((x) => x.id === r.id || x.alias === r.id)) out.push(r); };
    for (const [src, label] of [[lite, 'PC live feed'], [home, 'site copy of the PC']]) {
      if (!isObj(src)) continue;
      const bd = isObj(src.board) ? src.board : {};
      const t = num(bd.data_t) || num(bd.t) || num(src.t) || 0;
      for (const ck of ['lit', 'atlas']) {
        const c = isObj(bd[ck]) ? bd[ck] : null;
        if (!c || num(c.balance) == null || paperish(c)) continue;
        const st = String(c.status || '').toLowerCase();
        add({ id: ck, card: ck, name: c.name || ck, plan: c.plan || '', stage: st === 'funded' || c.stage === 'funded' ? 'funded' : /failed|lost/.test(st) ? 'failed' : 'eval',
              status: st, balance: num(c.balance), floor: num(c.floor), room: num(c.room), to_target: num(c.to_target), target_balance: num(c.target_balance),
              profit: num(c.profit), today: num(c.today_pnl), dll: num(c.dll), dll_used: num(c.dll_used), mll: num(c.mll), session: num(c.session),
              start_balance: num(c.balance) != null && num(c.profit) != null ? r2(num(c.balance) - num(c.profit)) : null, t, src: label });
      }
      const lit = out.find((x) => x.id === 'lit'), atl = out.find((x) => x.id === 'atlas');
      const accts = (Array.isArray(src.accounts) ? src.accounts : []).filter((a) => isObj(a) && a.id && ['eval', 'funded'].includes(a.kind) && a.source !== 'cloud' && a.source !== 'pc_blitz'
        && a.id !== 'acct_c' && !a.error && !paperish(a) && isObj(a.eval) && num(a.eval.balance) != null);
      // the ONE Builder 50K row of this post (MFFU funds one Builder 50K a person): with the lit card's floor it IS the lit card, even when an
      // open trade or a few seconds moved its balance (the floor follows the end-of-day balance only)
      const b50 = accts.filter((a) => rulesOf(a.plan || a.name) === RULES.builder50k);
      for (const a of Array.isArray(src.accounts) ? src.accounts : []) {
        if (!accts.includes(a)) continue;
        const e = isObj(a.eval) ? a.eval : {};
        if (num(e.balance) == null) continue;
        const st = String(e.status || '').toLowerCase();
        const r = { id: String(a.id), name: a.name || a.id, plan: a.plan || '', stage: a.kind === 'funded' ? 'funded' : st === 'failed' ? 'failed' : 'eval', status: st,
                    balance: num(e.balance), floor: num(e.floor), room: num(e.room), to_target: num(e.to_target), target_balance: num(e.target_balance),
                    profit: num(e.profit), today: num(e.today), dll: num(e.dll), dll_used: num(e.dll_used), mll: num(e.mll), session: num(e.session),
                    start_balance: num(e.start_balance), t: num(a.conn && a.conn.t) || t, src: label };
        // the bot's main account is the lit card too (a plan without "pc" ids): the same balance + floor within TOL, or the one Builder 50K row
        // with the card's floor; the ATLAS card's own ledger row (id atlas / acct_b) is the ATLAS card
        const litSame = lit && !lit.alias && lit.src === label && (rulesOf(lit.plan) || RULES.builder50k) === rulesOf(r.plan || r.name || '50k')
          && ((near(lit.balance, r.balance) && (near(lit.floor, r.floor) || lit.floor == null || r.floor == null)) || (b50.length === 1 && b50[0] === a && near(lit.floor, r.floor, 1)));
        if (litSame) { lit.alias = r.id; lit.start_balance = lit.start_balance != null ? lit.start_balance : r.start_balance; continue; }
        if (atl && !atl.alias && atl.src === label && /^(atlas|acct_?b)$/i.test(r.id)) { atl.alias = r.id; continue; }
        add(r);
      }
      const b = isObj(src.second) ? src.second.account_b : null;              // home.json's ATLAS account B (when no card)
      if (isObj(b) && isObj(b.eval) && b.enabled !== false && !out.some((x) => x.id === 'atlas')) {
        const e = b.eval;
        add({ id: 'atlas', card: 'atlas', name: 'ATLAS', plan: b.plan_label || '', stage: b.stage === 'funded' ? 'funded' : 'eval', status: String(e.status || ''),
              balance: num(e.balance), floor: num(e.floor), room: num(e.room), to_target: num(e.to_target), profit: num(e.profit), today: num(e.today),
              session: num(e.session), start_balance: num(e.start_balance), t, src: label });
      }
    }
    return out;
  }

  function match(plan, lite, home) {
    const pa = isObj(plan) && Array.isArray(plan.accounts) ? plan.accounts.filter((a) => isObj(a) && a.key && !/blitz/i.test(String(a.key))) : [];
    const live = liveAccounts(lite, home);
    const used = new Set(), rows = [];
    const keyOf = (l) => planKey(pa, l.id, l.name) || (l.alias ? planKey(pa, l.alias, '') : '') || (l.card ? planKey(pa, l.card, '') || ({ lit: 'zlarior', atlas: 'atlas' })[l.card] : '');
    // the last 4 digits of each live row (the PC's "mf" rows: id -> l4; a card through its alias, ATLAS's card as "atlas")
    const mfa = isObj(lite) && isObj(lite.mf) && Array.isArray(lite.mf.a) ? lite.mf.a.filter(isObj) : [];
    const l4 = (l) => { const r = mfa.find((x) => x.id === l.id || (l.alias && x.id === l.alias) || (l.card === 'atlas' && x.id === 'atlas')); return r && r.l4 ? String(r.l4) : ''; };
    for (const a of pa) {
      const i = live.findIndex((l, k) => !used.has(k) && keyOf(l) === String(a.key));
      if (i >= 0) {
        used.add(i);
        // every other live row of this same plan row (its PC ids / Name) is this account seen twice (the bot's card + its ledger row): one row
        live.forEach((l, k) => { if (!used.has(k) && keyOf(l) === String(a.key)) used.add(k); });
      }
      rows.push({ key: String(a.key), plan: a, live: i >= 0 ? live[i] : null });
    }
    const placed = rows.filter((r) => r.live).map((r) => r.live);
    live.forEach((l, k) => {
      if (used.has(k)) return;
      // a PC account the plan lacks gets its own row, unless it is a placed account seen twice: the same last 4, or (last resort) a bot card
      // and a ledger row of the same size with the same balance + floor within TOL (never two rows that both carry their own account id)
      const same = placed.find((p) => (l4(l) && l4(l) === l4(p)) || ((!!p.card !== !!l.card) && rulesOf(p.plan) === rulesOf(l.plan) && near(p.balance, l.balance) && near(p.floor, l.floor)));
      if (same) return;
      placed.push(l);
      rows.push({ key: l.id, plan: null, live: l });
    });
    return rows;
  }

  // the PC's "mf" row of a live account (engine/mffu_view.py); td / n / w are left out when 0
  function mfRow(lite, l) {
    const a = isObj(lite) && isObj(lite.mf) && Array.isArray(lite.mf.a) ? lite.mf.a : [];
    if (!l) return null;
    const r = a.find((x) => isObj(x) && (x.id === l.id || (l.alias && x.id === l.alias) || (l.card === 'atlas' && x.id === 'atlas'))) || null;
    return r ? { td: 0, n: 0, w: 0, ...r } : null;
  }

  function statusWord(stage, l) {
    if (stage === 'failed' || (l && l.room != null && l.room <= 0)) return 'Failed';
    if (stage === 'funded') return 'Sim Funded';
    if (stage === 'passed') return 'Passed';
    return 'Evaluation';
  }

  // one MFFU-style card. Every number carries {v, src, t}: where it came from and when.
  function card(row, ctx) {
    const P = row.plan || {}, l = row.live, mf = mfRow(ctx.lite, l), now = ctx.nowS;
    const planText = (P.plan || (l && l.plan) || '').replace(/^MFFU\s+/i, '').replace(/\s*\(funded\)/i, '');
    const R = rulesOf(planText) || rulesOf(l && l.plan);
    const S = (v, src, t) => ({ v: v == null ? null : v, src: v == null ? '' : src, t: v == null ? null : t || null });
    const pcT = l ? l.t : null, pcSrc = l ? l.src : '';
    const mfT = isObj(ctx.lite) && isObj(ctx.lite.mf) ? num(ctx.lite.mf.t) || pcT : pcT;
    const brow = (isObj(ctx.board) && Array.isArray(ctx.board.accounts) ? ctx.board.accounts : []).find((x) => isObj(x) && x.key === row.key) || null;
    let stage = l ? l.stage : String(P.stage || 'eval');
    let bal = l ? S(l.balance, pcSrc, pcT) : null, evalCopy = false;
    if (!bal && brow && num(brow.balance) != null) bal = S(num(brow.balance), 'Board copy (' + (brow.src || 'PLAN') + ')', num(brow.src_t) || num(ctx.board.t));
    if (!bal) {
      const m = String(P.next || '').match(/balance\s+\$?([\d,]+(?:\.\d+)?)\s*\(owner,\s*([A-Za-z]{3,9}\s+\d{1,2})\)/i);
      bal = m ? S(num(m[1]), 'PLAN (you told Claude, ' + m[2] + ')', null) : S(null);
    }
    const start = l && l.start_balance != null ? l.start_balance : R ? R.start : null;
    const pnl = bal.v != null && start != null ? S(r2(bal.v - start), bal.src, bal.t) : S(null);
    if (stage === 'eval' && R && pnl.v != null && pnl.v >= R.target) stage = 'passed';
    if (!l && brow && brow.chip === 'PASSED') stage = 'passed';
    // finder round 2026-11-20: with the bot STOPPED the PC sends no live card, and the board's old 'PASSED $26,946' row made ATLAS an unfunded
    // passed eval on the ZEUS card. The plan says funded: it is funded, at the PC's last LIVE balance (lite.life.acc, the funded lifecycle)
    if (/funded/i.test(String(P.stage || '')) && !l && (stage === 'passed' || stage === 'funded')) {
      stage = 'funded';
      const life = isObj(ctx.lite) && isObj(ctx.lite.life) && isObj(ctx.lite.life.acc) ? ctx.lite.life.acc : {};
      const li = ids(P).concat([String(row.key)]).map((i) => life[i]).find((x) => isObj(x) && num(x.bal) != null);
      if (li) bal = S(num(li.bal), 'the last LIVE balance (PC)', num(ctx.lite.t) || null);
      // owner phone 2026-11-21: ATLAS showed "$1,946" funded = the EVAL's PASSED $26,946 (Nov 17) in MFFU's $0 view; the funded
      // account started later from $0. With no PC number, the funded card shows none rather than the eval's
      else if (bal && /^Board copy/.test(bal.src || '') && brow && brow.chip === 'PASSED') { bal = S(null); evalCopy = true; }
    }
    const floor = l && l.floor != null ? S(l.floor, pcSrc, pcT) : !evalCopy && brow && num(brow.floor) != null ? S(num(brow.floor), 'Board copy', num(ctx.board.t)) : S(null);
    const room = l && l.room != null ? S(l.room, pcSrc, pcT) : bal.v != null && floor.v != null ? S(r2(bal.v - floor.v), bal.src, bal.t) : S(null);
    const out = { key: row.key, name: (P.name || (l && l.name) || row.key), last4: mf && mf.l4 ? mf.l4 : null, plan: planText || '-', stage,
                  status: statusWord(stage, l), notInPlan: !row.plan, planOnly: !l && !(brow && num(brow.balance) != null && !/^PLAN/.test(String(brow.src || 'PLAN'))),
                  balance: bal, pnl, floor, room, mll: R ? R.mll : null, rules: R ? R.label : null };
    out.start_date = S(mf && mf.sd ? mf.sd : null, 'PC ledger', mfT);
    if (!out.start_date.v) { const m = String(P.next || '').match(/Started\s+([A-Za-z]{3,9}\s+\d{1,2})/i); if (m) out.start_date = S(m[1], 'PLAN', null); }
    if (stage === 'funded' && isObj(P.funded) && P.funded.as_of && !out.start_date.v) out.start_date = S(P.funded.as_of, 'PLAN (funded since)', null);
    // profit target (eval) / payout line (funded)
    if (R && stage !== 'funded') {
      const p = pnl.v != null ? Math.max(0, Math.min(1, pnl.v / R.target)) : null;
      out.target = { v: R.target, balance: R.start + R.target, progress: p, left: pnl.v != null ? r2(Math.max(0, R.target - pnl.v)) : null, src: pnl.src, t: pnl.t };
    }
    out.days = { v: mf && mf.td != null ? mf.td : null, min: R ? (stage === 'funded' ? R.cycle_days : R.min_days) : null,
                 min_text: stage === 'funded' ? 'traded days per payout cycle' : 'minimum trading days to pass', session: l ? l.session : null, src: mf && mf.td != null ? 'PC ledger' : '', t: mfT };
    // consistency: the eval has no consistency rule on Builder; funded = best day <= 50% of the cycle's profit
    const f = mf && isObj(mf.f) ? mf.f : null;
    if (stage === 'funded') {
      const cp = f ? num(f.cp) : null, bd = f ? num(f.bd) : null;
      out.consistency = { rule: 'best day at most 50% of the cycle profit', best: bd, base: cp, pct: cp && cp > 0 && bd != null ? Math.round(1000 * bd / cp) / 10 : null,
                          ok: cp != null && cp > 0 && bd != null ? bd <= 0.5 * cp + 1e-9 : null, src: f ? 'PC payout tracker' : '', t: mfT };
    } else {
      const bd = mf && Array.isArray(mf.bd) ? num(mf.bd[1]) : null;
      out.consistency = { rule: 'none in the Builder evaluation (the 50% best-day rule starts when funded)', best: bd, base: pnl.v, pct: pnl.v > 0 && bd != null && bd > 0 ? Math.round(1000 * bd / pnl.v) / 10 : null,
                          ok: true, src: bd != null ? 'PC ledger' : '', t: mfT };
    }
    const dll = l && l.dll != null ? l.dll : R ? R.dll : null;
    const used = l ? (l.dll_used != null ? l.dll_used : l.today != null ? Math.max(0, -l.today) : null) : null;
    out.dll = { v: dll, used, left: dll != null && used != null ? r2(Math.max(0, dll - used)) : null, today: l ? l.today : null, src: used != null ? pcSrc : '', t: pcT };
    // payout eligibility (funded): reuse the payout coach (payoutcoach.js = engine/payout_coach.py)
    out.payout = null;
    if (stage === 'funded' && ctx.coach && R) {
      const pk = R === RULES.builder50k ? 'builder50k' : 'builder25k';
      const told = isObj(P.funded) ? P.funded : {};
      const state = { balance: bal.v, cycle_start_balance: f && num(f.cp) != null && bal.v != null ? r2(bal.v - num(f.cp)) : num(told.cycle_start_balance),
                      best_day: f && num(f.bd) != null ? num(f.bd) : num(told.best_day), cycle_days: f && num(f.cd) != null ? num(f.cd) : num(told.cycle_days),
                      first_trade: told.first_trade || null, last_trade: told.last_trade || null, payouts_n: f && num(f.pn) != null ? num(f.pn) : num(told.payouts_n),
                      eligible_from: f && f.ef ? f.ef : null, room: room.v };
      try { const c = ctx.coach.coach(state, pk, ctx.today); out.payout = { c, src: f ? 'PC payout tracker' : 'PLAN (what you told Claude)', t: f ? mfT : null }; } catch (e) { out.payout = null; }
    }
    out.trades = { n: mf && mf.n != null ? mf.n : null, w: mf && mf.w != null ? mf.w : null, win_pct: mf && mf.n ? Math.round(100 * mf.w / mf.n) : null,
                   best: mf && Array.isArray(mf.bd) ? { day: mf.bd[0], v: num(mf.bd[1]) } : null, worst: mf && Array.isArray(mf.wd) ? { day: mf.wd[0], v: num(mf.wd[1]) } : null,
                   src: mf && mf.n != null ? 'PC ledger' : '', t: mfT };
    out.equity = { pts: mf && Array.isArray(mf.eq) ? mf.eq.map(num).filter((x) => x != null) : [], src: mf && Array.isArray(mf.eq) ? 'PC ledger (P&L at each day\'s close)' : '', t: mfT };
    out.age_s = bal.t ? Math.max(0, now - bal.t) : null;
    return out;
  }

  function cards(src, nowS) {
    const s = isObj(src) ? src : {};
    const now = nowS || Math.floor(Date.now() / 1000);
    const ctx = { lite: isObj(s.lite) && s.lite.kind === 'le-live' ? s.lite : null, home: isObj(s.home) ? s.home : null, board: isObj(s.board) && s.board.kind === 'olympus-board' ? s.board : null,
                  coach: s.coach || null, today: s.today || null, nowS: now };
    return match(s.plan, ctx.lite, ctx.home).filter((r) => !(r.plan && (r.plan.status === 'waiting' || r.plan.status === 'buying') && !r.live)).map((r) => card(r, ctx));
  }

  // the plan rows not bought yet (shown as one line each, marked PLAN)
  function planned(plan) {
    return (isObj(plan) && Array.isArray(plan.accounts) ? plan.accounts : []).filter((a) => isObj(a) && (a.status === 'waiting' || a.status === 'buying') && !/blitz/i.test(String(a.key)));
  }

  const api = { RULES, planKey, liveAccounts, match, card, cards, planned, statusWord, rulesOf, tokens };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MFFU_MODEL = api;
})(typeof window !== 'undefined' ? window : globalThis);
