/* MONEY VIEW (day-site5 2026-11-26; lead: per account a 'to pass / to payout' gauge with the eval pass forecaster numbers, payout eligibility
   + the date ATLAS can next request, and a risk-distance bar '$X from the floor', red under $300). Pure: no DOM, no fetch (node-tested by
   tests/test_money_view.py). Works on the account objects mffucenter.js already builds (a.target, a.payout + its coach, a.money).
   Forecast source, best first: business/forecast.json (the pass forecaster, research/forecast/forecast.json via tools/build_money_health.py)
   -> business/payday.json (the payday plan: 1,000 simulated runs, real) -> nothing ("no forecast yet"). A fixture is always labelled SAMPLE.
     window.MONEY_VIEW / module.exports = { gauge, nextRequest, floor, forecastFor, FLOOR_RED } */
(function (root) {
  'use strict';
  const num = (v) => (v === null || v === undefined || v === '' || typeof v === 'boolean' || !Number.isFinite(+v) ? null : +v);
  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const r2 = (x) => Math.round(x * 100) / 100;
  const FLOOR_RED = 300;                                   // the lead's line: under $300 from the floor = red
  function usd(v, sign) {
    const n = num(v); if (n === null) return '-';
    const a = '$' + Math.abs(Math.round(n)).toLocaleString('en-US');
    return n < 0 && Math.round(n) ? '-' + a : (sign && Math.round(n) > 0 ? '+' + a : a);
  }
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function dayText(d) { if (!d) return '-'; const x = new Date(d + 'T12:00:00Z'); return isNaN(x) ? String(d) : DOW[x.getUTCDay()] + ' ' + (x.getUTCMonth() + 1) + '/' + x.getUTCDate(); }
  function addWeekdays(d, n) {                             // n trading days after day d (weekends skipped; holidays not known here)
    const x = new Date(d + 'T12:00:00Z'); let k = Math.max(0, Math.round(n));
    while (k > 0) { x.setUTCDate(x.getUTCDate() + 1); const w = x.getUTCDay(); if (w !== 0 && w !== 6) k--; }
    return x.toISOString().slice(0, 10);
  }
  const norm = (s) => String(s || '').toLowerCase().replace(/\((eval|funded|evaluation)\)/g, '').replace(/\b(eval|funded|builder|mffu)\b/g, '').replace(/[^a-z0-9#]+/g, ' ').trim();

  /** the forecast row of one account: forecast.json {accounts: {key|name: {...}}} first, else payday.json rows[market].accounts */
  function forecastFor(a, fc, pd, market) {
    const name = norm(a && a.name), key = String(a && a.key || ''), me = `${a && a.name || ''} ${a && a.plan || ''}`.toLowerCase();
    const size = (t) => { const m = /(\d+)\s*k\b/.exec(t); return m ? m[1] : null; }, rapid = (t) => /rapid/.test(t);
    const pick = (rows) => {                                 // best match: the key, the exact name, else the longest name prefix of the same size / kind
      if (!isObj(rows)) return null;
      if (key && isObj(rows[key])) return rows[key];
      let best = null, bs = 0;
      for (const r of Object.values(rows)) {
        if (!isObj(r)) continue;
        const rn = norm(r.name), them = `${r.name || ''} ${r.plan || ''}`.toLowerCase().replace(/_/g, ' ');
        if (!rn) continue;
        if (size(me) && size(them) && size(me) !== size(them)) continue;
        if (rapid(me) !== rapid(them)) continue;
        if (r.stage && a && typeof a.funded === 'boolean' && (r.stage === 'funded') !== a.funded) continue;
        const sc = rn === name ? 1000 : name.startsWith(rn) || rn.startsWith(name) ? 100 + rn.length : 0;
        if (sc > bs) { bs = sc; best = r; }
      }
      return best;
    };
    const f = isObj(fc) ? pick(fc.accounts) : null;
    if (f) {
      const mk = Object.keys(isObj(fc.markets) ? fc.markets : {}), main = isObj(f['2026-like']) ? '2026-like' : mk.find((k) => isObj(f[k])) || null;
      if (main) {                                            // research/forecast/forecast.json (day-batch5): per market {pass_pct, fail_pct, pass_med_sessions, ...}
        const M = f[main], refK = mk.find((k) => k !== main && isObj(f[k])) || null, R = refK ? f[refK] : null, pc = (v) => (num(v) === null ? null : num(v) / 100);
        return { src: 'forecast', sample: !!fc.sample, market: main, ref: refK, made: String(fc.made || '').slice(0, 10), runs: num(fc.n_paths) || num(fc.runs),
          p_pass: pc(M.pass_pct), p_fail: pc(M.fail_pct), days_med: num(M.pass_med_sessions), pass_med: null,
          p_payout: pc(M.first_payout_pct), payout_sessions: num(M.first_payout_med_sessions), p_payout60: pc(M.first_payout_60_pct), p_lost: pc(M.lost_pct), payout_med: null, payout_usd: null,
          ref_pass: R ? pc(R.pass_pct) : null, ref_payout: R ? pc(R.first_payout_pct) : null };
      }
      return { src: 'forecast', sample: !!fc.sample, market: String(fc.market || ''), made: String(fc.made || '').slice(0, 10), runs: num(fc.runs) || num(f.runs),
        p_pass: num(f.p_pass), p_fail: num(f.p_fail), pass_med: f.pass_by || f.pass_med || null, days_med: num(f.days_med), days_p25: num(f.days_p25), days_p75: num(f.days_p75),
        p_payout: num(f.p_payout), payout_med: f.payout_by || f.payout_med || null, payout_usd: num(f.payout_usd) };
    }
    const m = market || 'H2', rows = isObj(pd) && isObj(pd.rows) && isObj(pd.rows[m]) ? pd.rows[m].accounts : null, p = pick(rows);
    if (!p) return null;
    const pct = (v) => (num(v) === null ? null : num(v) / 100);
    return { src: 'payday', sample: false, market: isObj(pd.markets) ? String(pd.markets[m] || m) : m, made: String(pd.date || ''), runs: num(pd.n),
      p_pass: pct(p.p_funded_by_dec31), p_pass_by: 'Dec 31', p_fail: pct(p.p_lost_before_pay), pass_med: p.funded_med || null, pass_p10: p.funded_p10 || null,
      days_med: null, p_payout: pct(p.p_by_dec31), payout_med: p.first_pay_med || null, payout_usd: num(p.first_pay_usd) };
  }

  /** when the account can next ask MFFU for a payout: today, a date, or what it still needs */
  function nextRequest(p, today) {
    if (!isObj(p)) return null;
    const c = isObj(p.coach) ? p.coach : null, t = today || '';
    if (num(p.request_today) > 0) return { date: t, today: true, text: `Can request ${usd(p.request_today)} today (${usd(p.to_you)} to you)`, need: [] };
    if (c && (c.lost || c.graduated)) return { date: null, today: false, text: c.lost ? 'Account lost: no payout' : 'All sim payouts done', need: [] };
    const need = [];
    let d = t;
    const ef = p.eligible_from || (c && c.eligible_from) || null;
    if (ef && ef > d) { d = ef; need.push(`first request from ${dayText(ef)} (48 h after the first funded trade)`); }
    const days = c ? num(c.cycle_days) : null, dn = c ? num(c.cycle_days_need) : null;
    if (days !== null && dn !== null && days < dn) { const more = dn - days, from = addWeekdays(t, more); if (from > d) d = from; need.push(`${more} more traded day${more === 1 ? '' : 's'} this cycle`); }
    const money = c ? num(c.need_more) : null;
    if (money !== null && money > 0) need.push(`${usd(money)} more profit`);
    if (!c) return { date: ef || null, today: false, text: ef ? `Earliest request ${dayText(ef)} (needs the PC's payout tracker for the rest)` : 'Needs the PC\'s payout tracker', need };
    const onlyDates = money === null || money <= 0;
    return { date: d, today: false, sure: onlyDates, text: `${onlyDates ? 'Next request' : 'Earliest request'}: ${dayText(d)}${need.length ? ' · needs ' + need.join(', ') : ''}`, need };
  }

  /** the risk distance: $ from the trailing max-loss floor (open trade included), a fraction of the max loss, red under $300 */
  function floor(a) {
    const m = isObj(a) && isObj(a.money) ? a.money : {};
    const room = num(m.room_now) !== null ? num(m.room_now) : num(m.room), mll = num(m.mll);
    if (room === null) return { has: false, text: 'Floor distance needs the PC\'s numbers', level: 'none', frac: 0 };
    const level = room <= 0 ? 'gone' : room < FLOOR_RED ? 'red' : mll && room < mll * 0.5 ? 'gold' : 'ok';
    return { has: true, room: r2(room), mll, frac: mll ? Math.max(0, Math.min(1, room / mll)) : null, level, floor: num(m.floor), locked: !!m.locked,
      text: room <= 0 ? 'At the floor: the account is gone' : `${usd(room)} from the floor${level === 'red' ? ' · UNDER $300' : ''}`,
      sub: (num(m.floor) !== null ? `floor ${usd(m.floor, true)}` : '') + (mll ? ` · max loss ${usd(mll)}` : '') + (m.locked ? ' · locked' : '') + (num(m.room_now) !== null && num(m.room) !== null && num(m.room_now) !== num(m.room) ? ' · open trade counted' : '') };
  }

  /** one gauge per account: an eval -> $ to pass + the forecast; sim funded -> $ to the payout goal + when it can ask */
  function gauge(a, ctx) {
    const c = isObj(ctx) ? ctx : {}, today = c.today || '';
    const F = forecastFor(a, c.forecast, c.payday, c.market);
    if (isObj(a) && isObj(a.target)) {
      const t = a.target, left = num(t.left), v = num(t.v), frac = num(t.progress);
      const f = F ? {
        line: F.src === 'forecast'
          ? `Pass ${F.p_pass !== null ? Math.round(F.p_pass * 100) + '%' : '?'}${F.p_fail !== null ? ' · fail ' + Math.round(F.p_fail * 100) + '%' : ''}${F.days_med !== null ? ' · about ' + Math.round(F.days_med) + ' trading days' : ''}${F.pass_med ? ' · most likely ' + dayText(F.pass_med) : ''}${F.ref && F.ref_pass !== null ? ` (${F.ref} market: pass ${Math.round(F.ref_pass * 100)}%)` : ''}`
          : `Pass by Dec 31: ${F.p_pass !== null ? Math.round(F.p_pass * 100) + '%' : '?'}${F.pass_med ? ' · most likely ' + dayText(F.pass_med) : ''}${F.p_fail !== null ? ' · lost first ' + Math.round(F.p_fail * 100) + '%' : ''}`,
        src: F.src === 'forecast' ? `Pass forecaster${F.runs ? ', ' + F.runs.toLocaleString('en-US') + ' runs' : ''}${F.market ? ', ' + F.market + (/like$/.test(F.market) ? ' market' : '') : ''}${F.made ? ', ' + F.made : ''}` : `Payday plan (${F.runs || 1000} simulated runs, ${F.market}, ${F.made}); the pass forecaster has not landed`,
        sample: F.sample, p: F.p_pass } : null;
      return { kind: 'pass', label: 'To pass', goal: v, left, frac: frac === null ? 0 : Math.max(0, Math.min(1, frac)), have: num(t.pnl),
        text: left === null ? 'Needs the PC\'s balance' : left <= 0 ? 'Target reached' : `${usd(left)} to pass`, sub: v !== null ? `target ${usd(v)} · P&L ${usd(t.pnl, true)}` : '', forecast: f, next: null };
    }
    if (isObj(a) && isObj(a.payout)) {
      const p = a.payout, co = isObj(p.coach) ? p.coach : null, buf = num(p.buffer), max = num(p.pay_max), min = num(p.pay_min);
      const plan = co && num(co.plan_line) !== null ? num(co.plan_line) : buf !== null && max !== null ? buf + max : null;   // the owner's goal: the max request (25K: $2,100)
      const prof = isObj(a.money) ? num(a.money.balance) : null;
      const left = plan !== null && prof !== null ? r2(Math.max(0, plan - prof)) : null;
      const ask = co && co.first_at_min ? min : max;
      const f = F && F.src === 'forecast' && F.payout_sessions !== null && F.payout_sessions !== undefined
        ? { line: `First payout ${F.p_payout !== null ? Math.round(F.p_payout * 100) + '%' : '?'} · about ${Math.round(F.payout_sessions)} trading days${F.p_lost !== null ? ' · lost first ' + Math.round(F.p_lost * 100) + '%' : ''}${F.ref && F.ref_payout !== null ? ` (${F.ref} market: ${Math.round(F.ref_payout * 100)}%)` : ''}`,
          src: `Pass forecaster${F.runs ? ', ' + F.runs.toLocaleString('en-US') + ' runs' : ''}, ${F.market} market${F.made ? ', ' + F.made : ''}`, sample: F.sample, p: F.p_payout }
        : F && F.payout_med ? { line: `First payout most likely ${dayText(F.payout_med)}${F.payout_usd !== null ? ' · about ' + usd(F.payout_usd) + ' to you' : ''}${F.p_payout !== null ? ' · ' + Math.round(F.p_payout * 100) + '% by Dec 31' : ''}`,
        src: F.src === 'forecast' ? 'Pass forecaster' : `Payday plan (${F.runs || 1000} simulated runs, ${F.market}, ${F.made})`, sample: F.sample, p: F.p_payout } : null;
      return { kind: 'payout', label: 'To payout', goal: plan, left, frac: plan && prof !== null ? Math.max(0, Math.min(1, prof / plan)) : 0, have: prof,
        text: prof === null ? 'Needs the PC\'s balance' : num(p.request_today) > 0 ? `Payout ready: ${usd(p.request_today)}` : `${usd(left)} to the ${usd(ask)} payout`,
        sub: plan !== null ? `goal balance ${usd(plan)} (buffer ${usd(buf)} + ${usd(ask)}) · now ${usd(prof, true)}` : '',
        eligible: num(p.request_today) > 0, next: nextRequest(p, today), forecast: f };
    }
    return null;
  }

  const api = { gauge, nextRequest, floor, forecastFor, FLOOR_RED, usd, dayText, addWeekdays };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MONEY_VIEW = api;
})(typeof window !== 'undefined' ? window : null);
