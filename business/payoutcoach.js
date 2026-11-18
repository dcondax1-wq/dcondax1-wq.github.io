// PAYOUT COACH (2026-11-17, docs/FUNDED_25K_PLAYBOOK.md). The pure part: for one MFFU Builder sim-funded account, what you can
// request today, the 50% best-day rule, days traded this cycle, the 30% tax pot and the 7-day inactivity countdown. No DOM, no
// fetch. Same numbers as engine/payout_coach.py (tests/test_payout_coach.py runs both on the same cases).
// Classic script (window.PAYOUT_COACH) and a CommonJS module for node tests.
//   coach(state, planKey, today)  state = {balance, cycle_start_balance, best_day, cycle_days, first_trade, last_trade, payouts_n}
//   fromTracker(f, extra)         a PC tracker (engine/funded_life.track / live_board "funded") -> state
//   PLANS, POLICY, TAX
(function (root) {
  'use strict';
  const PLANS = {
    builder25k: { label: 'Builder 25K', start: 25000, buffer: 1100, pay_min: 250, pay_max: 1000, split: 0.8, cons: 0.5, cycle_days: 2,
                  first_wait_days: 2, max_payouts: 5, lock: 100, mll: 1000, big_day: 1000 },
    builder50k: { label: 'Builder 50K', start: 50000, buffer: 2100, pay_min: 500, pay_max: 2000, split: 0.8, cons: 0.5, cycle_days: 2,
                  first_wait_days: 2, max_payouts: 5, lock: 100, mll: 2000, big_day: 2000 },
  };
  // research/writeups/payout-policy-funded25-2026-11-17.md: ask once the request max sits above the buffer (keep the rest trading)
  const POLICY = { key: 'max', text: 'ask when the full max sits above the buffer' };
  const TAX = 0.30, IDLE_DAYS = 7;
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : null));
  const r2 = (v) => Math.round(v * 100) / 100;
  const usd = (v) => (v == null ? '-' : (v < 0 ? '-$' : '$') + Math.abs(Math.round(v)).toLocaleString('en-US'));
  const day = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const diffDays = (a, b) => Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 86400000);
  const nextWeekday = (d) => { let x = d; while ([0, 6].includes(new Date(x + 'T12:00:00Z').getUTCDay())) x = addDays(x, 1); return x; };
  const todayET = () => { try { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); } catch (e) { return new Date().toISOString().slice(0, 10); } };

  function coach(state, planKey, today) {
    const P = PLANS[planKey] || PLANS.builder25k;
    const s = state || {};
    const t = day(today) || todayET();
    const bal = num(s.balance);
    if (bal == null) return { ok: false, plan: P.label, text: 'Type the balance (or wait for the PC) to see the payout coach.' };
    const profit = r2(bal - P.start);
    const nPay = Math.max(0, Math.round(num(s.payouts_n) || 0));
    const cStart = num(s.cycle_start_balance) != null ? num(s.cycle_start_balance) : P.start;
    const cprof = r2(bal - cStart);
    const best = Math.max(0, num(s.best_day) || 0);
    const days = Math.max(0, Math.round(num(s.cycle_days) || 0));
    const above = r2(profit - P.buffer);
    const out = { ok: true, plan: P.label, today: t, balance: r2(bal), profit, above_buffer: above, cycle_profit: cprof, best_day: best,
                  cycle_days: days, cycle_days_need: P.cycle_days, payouts_n: nPay, payouts_max: P.max_payouts, why: [] };
    // the 50% rule: best day <= half of the cycle's profit
    out.best_pct = cprof > 0 ? Math.round(1000 * best / cprof) / 10 : null;
    out.cons_ok = cprof > 0 && best <= P.cons * cprof + 1e-9;
    out.cons_need = r2(Math.max(0, best / P.cons - cprof));
    out.safe_day = out.cons_ok ? r2(cprof) : 0;            // a new best day up to the cycle's profit keeps you at <= 50%
    const X = P.big_day;
    out.big_day = X;
    out.big_day_need = r2(X >= best ? Math.max(0, X - cprof) : Math.max(0, 2 * best - cprof - X));
    // MFFU's checks, in order
    out.lost = num(s.room) != null && num(s.room) <= 0;
    out.graduated = nPay >= P.max_payouts;
    const first = day(s.first_trade);
    out.eligible_from = first ? nextWeekday(addDays(first, P.first_wait_days)) : day(s.eligible_from);
    const moneyNeed = r2(Math.max(0, P.buffer + P.pay_min - profit));
    if (out.lost) out.why.push('the max-loss floor was reached: the account is gone');
    if (out.graduated) out.why.push(nPay + ' sim payouts done: MFFU moves you to live');
    if (!out.eligible_from && nPay === 0) out.why.push('no funded trade yet (first request 2 days after it)');
    else if (out.eligible_from && t < out.eligible_from && nPay === 0) out.why.push('first request from ' + out.eligible_from + ' (2 days after the first trade)');
    if (moneyNeed > 0) out.why.push(usd(moneyNeed) + ' more profit: ' + usd(Math.max(0, above)) + ' sits above the ' + usd(P.buffer) + ' buffer, the minimum request is ' + usd(P.pay_min));
    if (days < P.cycle_days) out.why.push(days + ' of ' + P.cycle_days + ' traded days this cycle');
    if (cprof > 0 && !out.cons_ok) out.why.push('best day ' + usd(best) + ' is ' + out.best_pct + '% of the cycle (max 50%): ' + usd(out.cons_need) + ' more on other days, each under ' + usd(best));
    else if (cprof <= 0 && days > 0) out.why.push('cycle profit ' + usd(cprof) + ': nothing to pay yet');
    out.need_more = r2(Math.max(moneyNeed, cprof > 0 && !out.cons_ok ? out.cons_need : 0));
    out.eligible = out.why.length === 0;
    out.request_today = out.eligible ? r2(Math.min(P.pay_max, above)) : 0;
    // the plan (POLICY): ask when the full max is above the buffer, else wait (MFFU would pay less now)
    out.plan_line = r2(P.buffer + P.pay_max);
    out.plan_ready = out.eligible && above >= P.pay_max - 1e-9;
    out.plan_wait = out.eligible && !out.plan_ready ? r2(P.pay_max - above) : 0;
    out.status = out.lost ? 'lost' : out.graduated ? 'graduated' : out.plan_ready ? 'ready' : out.eligible ? 'allowed' : 'not_yet';
    const req = out.request_today;
    out.to_you = r2(req * P.split);
    out.tax_pot = r2(out.to_you * TAX);
    out.net = r2(out.to_you - out.tax_pot);
    out.after_balance = r2(bal - req);
    out.after_room = req > 0 ? r2(bal - req - (P.start + P.lock)) : null;   // after a payout the floor sits at start + $100
    // inactivity: 7 calendar days without a trade wipes the profits; trade by last + 6 at the latest
    const last = day(s.last_trade);
    if (last) {
      const idle = Math.max(0, diffDays(t, last));
      out.idle_days = idle;
      out.trade_by = addDays(last, IDLE_DAYS - 1);
      out.idle_left = Math.max(0, IDLE_DAYS - 1 - idle);
      out.idle_warn = out.idle_left <= 2;
    } else {
      out.idle_days = null; out.trade_by = null; out.idle_left = null; out.idle_warn = false;
    }
    out.text = sentence(out);
    return out;
  }

  function sentence(c) {
    if (!c.ok) return c.text;
    if (c.status === 'lost') return 'The floor was reached: this funded account is gone.';
    if (c.status === 'graduated') return '5 sim payouts done: MFFU moves you to live (you trade it in person).';
    if (c.status === 'ready') return 'PAYOUT READY: request ' + usd(c.request_today) + ' today (' + usd(c.to_you) + ' to you, ' + usd(c.net) + ' after the 30% tax pot).';
    if (c.status === 'allowed') return 'MFFU would pay ' + usd(c.request_today) + ' today; the plan waits for the full ' + usd(c.request_today + c.plan_wait) + ' (' + usd(c.plan_wait) + ' more).';
    return 'Not yet: ' + (c.need_more > 0 ? 'need ' + usd(c.need_more) + ' more' : c.why[0] || 'keep trading') + '.';
  }

  function fromTracker(f, extra) {
    if (!f || typeof f !== 'object') return null;
    const x = extra || {};
    let bal = num(f.balance);
    if (bal == null && num(f.buffer_balance) != null && num(f.above_buffer) != null) bal = r2(num(f.buffer_balance) + num(f.above_buffer));
    if (bal == null && num(f.profit) != null && num(x.start) != null) bal = num(x.start) + num(f.profit);
    const cp = num(f.cycle_profit);
    return { balance: bal, cycle_start_balance: bal != null && cp != null ? r2(bal - cp) : null, best_day: num(f.best_day),
             cycle_days: num(f.cycle_days), first_trade: f.first_trade || null, last_trade: f.last_trade || x.last_trade || null,
             payouts_n: num(f.payouts_n), room: f.lost ? 0 : num(f.room), eligible_from: f.eligible_from || null };
  }

  // the card's rows (= engine/payout_coach.lines)
  function lines(c) {
    if (!c || !c.ok) return [(c && c.text) || ''];
    const out = [c.text,
      'Cycle profit ' + usd(c.cycle_profit) + '; best day ' + usd(c.best_day) + (c.best_pct != null ? ' = ' + c.best_pct + '% (max 50%)' : ''),
      (c.big_day_need > 0 ? 'A ' + usd(c.big_day) + " day more and you'd need " + usd(c.big_day_need) + ' more to be under 50%'
        : 'A ' + usd(c.big_day) + ' day would still keep you under 50%') + (c.cons_ok ? ' (biggest safe day now: ' + usd(c.safe_day) + ')' : ''),
      'Days traded this cycle: ' + c.cycle_days + ' (' + c.cycle_days_need + ' needed)'];
    if (c.request_today > 0) out.push('You can request ' + usd(c.request_today) + ' today: ' + usd(c.to_you) + ' to you, tax pot ' + usd(c.tax_pot) + ', net ' + usd(c.net));
    else out.push(c.need_more > 0 ? 'Not yet: need ' + usd(c.need_more) + ' more' : 'Not yet: ' + c.why.slice(0, 2).join('; '));
    if (c.trade_by) out.push('Inactivity: trade by ' + c.trade_by + ' (' + c.idle_left + ' day(s) left; 7 days without a trade wipes the profits)');
    return out;
  }

  const api = { coach, fromTracker, sentence, lines, PLANS, POLICY, TAX, IDLE_DAYS, usd };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PAYOUT_COACH = api;
})(typeof window !== 'undefined' ? window : globalThis);
