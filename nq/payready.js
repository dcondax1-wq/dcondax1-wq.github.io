// PAYOUT READINESS (nqdash3 round 2, 2026-11-20, lead: "money first"). ES module for board/ and trading/. For each FUNDED account:
// eligible yes / no with the exact reason (MFFU's rules as coded in business/payoutcoach.js = engine/payout_coach.py: first request 2 days after the
// first funded trade, 2 traded days a cycle, best day <= 50% of the cycle's profit, profit above the buffer >= the minimum request, max request),
// "$X more / N more days until you can ask for $Y", the projected date at the bot's recent pace, and the steps to request it on MFFU
// (docs/FUNDED_25K_PLAYBOOK.md section 5).
// Data: the PC's ntfy post, read only: "mf".a[] (engine/mffu_view: id, nm, l4, lt, eq, f = {cp cycle profit, bd best day, cd cycle days, ef eligible
// from, pn payouts taken, mr max request, st status, ft first funded trade, pt paid to you}) + the board cards (balance, room). No field is made up:
// a missing one is named ("the PC has not sent ...").
//   model(lite, home, biz, coach, today)  -> [{ id, name, plan, has, eligible, verdict, reason, checks[], need: {usd, days, ask, text}, pace, steps[] }]
//   draw(el, list)
// window-free and fetch-free (node-tested: tests/test_payready.py). The coach is handed in (window.PAYOUT_COACH / require).

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(+v) ? null : +v);
const arr = (x) => (Array.isArray(x) ? x : []);
const usd = (v) => { const n = num(v); return n === null ? '-' : (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US'); };
const day = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const isWeekday = (d) => ![0, 6].includes(new Date(d + 'T12:00:00Z').getUTCDay());
/** the n-th weekday after d (n = 1: the next trading day) */
export function addTradingDays(d, n) { let x = d, k = 0; while (k < n) { x = addDays(x, 1); if (isWeekday(x)) k++; } return x; }
export function nice(d) { const t = Date.parse((d || '') + 'T12:00:00Z'); return isNaN(t) ? String(d || '') : new Date(t).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }); }
// the bot's own payout ping (engine/funded_life PLANS ask_above, live today; card payout-ping-1000 asks whether to wait for the full max)
export const PING_ABOVE = { builder25k: 750, builder50k: 1500 };

function planOf(row, card, bizRow) {
  const t = `${(bizRow && bizRow.plan) || ''} ${(card && card.plan) || ''} ${(row && row.nm) || ''}`;
  if (/rapid/i.test(t)) return 'rapid';
  if (/50K/i.test(t) || num(card && card.mll) >= 2000) return 'builder50k';
  return 'builder25k';
}

/** the bot's recent pace: $ a traded day from the end-of-day P&L points (mf eq, oldest first). null when there are fewer than 3 points */
export function pace(eq) {
  const e = arr(eq).map(num).filter((x) => x !== null);
  if (e.length < 3) return null;
  const n = e.length - 1, per = (e[e.length - 1] - e[0]) / n;
  return { per: Math.round(per * 100) / 100, days: n };
}

export function model(lite, home, biz, coach, today) {
  const L = isObj(lite) ? lite : {}, H = isObj(home) ? home : {};
  const board = isObj(L.board) ? L.board : isObj(H.board) ? H.board : {};
  const rows = arr(isObj(L.mf) ? L.mf.a : null).filter(isObj);
  const plan = arr(isObj(biz) ? biz.accounts : null).filter(isObj);
  const out = [];
  // funded = the PC's tracker block "f", or a board card / plan row that says funded
  const ids = new Set(rows.filter((r) => isObj(r.f)).map((r) => r.id));
  if (isObj(board.atlas) && /funded/i.test(String(board.atlas.status || ''))) ids.add('atlas');
  for (const p of plan) if (/funded/i.test(String(p.stage || '')) && arr(p.pc).length) ids.add(arr(p.pc)[0]);
  for (const a of arr(L.accounts).concat(arr(H.accounts))) if (isObj(a) && a.id && isObj(a.eval) && /funded/i.test(String(a.eval.status || a.kind || ''))) ids.add(a.id);
  for (const id of ids) {
    if (/blitz/i.test(id)) continue;
    const row = rows.find((r) => r.id === id) || null, f = row && isObj(row.f) ? row.f : null;
    const card = isObj(board[id]) ? board[id] : (id === 'atlas' || id === 'acct_b') && isObj(board.atlas) ? board.atlas : null;
    const acc = arr(L.accounts).concat(arr(H.accounts)).find((a) => isObj(a) && a.id === id) || null;
    const bizRow = plan.find((p) => arr(p.pc).includes(id)) || null;
    const pk = planOf(row, card, bizRow), name = (row && row.nm) || (bizRow && bizRow.name) || (card && card.name) || id;
    const bal = num(card && card.balance) ?? num(acc && isObj(acc.eval) && acc.eval.balance);
    const base = { id, name: String(name), plan: pk, l4: row && row.l4 ? String(row.l4) : '', has: false, checks: [], steps: [] };
    if (pk === 'rapid') { out.push({ ...base, verdict: 'Not coded yet', reason: "The Rapid's payout rules (daily payouts, 30% consistency) are not in the payout coach yet.", need: null, pace: null }); continue; }
    const P = coach && coach.PLANS ? coach.PLANS[pk] : null;
    if (!P || typeof coach.coach !== 'function') { out.push({ ...base, verdict: 'No coach', reason: 'The payout coach script did not load.', need: null, pace: null }); continue; }
    const missing = [];
    if (bal === null) missing.push('the balance');
    if (!f) missing.push('its payout tracker');          // night-nq-accounts: plain words (was "the funded tracker (mf.f)")
    if (missing.length) { out.push({ ...base, verdict: 'Waiting for the PC', reason: `The PC has not sent ${missing.join(' and ')} yet: it fills in from the PC's next report.`, need: null, pace: pace(row && row.eq) }); continue; }
    const st = { balance: bal, cycle_start_balance: num(f.cp) !== null ? Math.round((bal - f.cp) * 100) / 100 : null, best_day: num(f.bd), cycle_days: num(f.cd),
      first_trade: day(f.ft), eligible_from: day(f.ef), last_trade: day(row && row.lt), payouts_n: num(f.pn), room: num(card && card.room) };
    const c = coach.coach(st, pk, today);
    if (!c || !c.ok) { out.push({ ...base, verdict: 'No numbers', reason: (c && c.text) || 'The coach could not read the numbers.', need: null, pace: pace(row && row.eq) }); continue; }
    // the rules, one row each, with the exact numbers
    const ef = c.eligible_from;
    const checks = [
      { k: 'first', label: 'First request date', ok: c.payouts_n > 0 || (!!ef && today >= ef),
        text: c.payouts_n > 0 ? `${c.payouts_n} payout(s) taken: no wait now` : ef ? `from ${nice(ef)} (2 days after the first funded trade)` : 'no funded trade yet' },
      { k: 'days', label: 'Traded days this cycle', ok: c.cycle_days >= c.cycle_days_need, text: `${c.cycle_days} (${c.cycle_days_need} needed)` },
      { k: 'profit', label: 'Cycle profit', ok: c.cycle_profit > 0, text: usd(c.cycle_profit) },
      { k: 'cons', label: 'Consistency (best day max 50%)', ok: c.cycle_profit > 0 && c.cons_ok,
        text: c.cycle_profit > 0 ? `best day ${usd(c.best_day)} = ${c.best_pct}%${c.cons_ok ? '' : `: ${usd(c.cons_need)} more on other days`}` : 'needs a cycle profit first' },
      { k: 'buffer', label: `Above the ${usd(P.buffer)} buffer`, ok: c.above_buffer >= P.pay_min, text: `${usd(Math.max(0, c.above_buffer))} (minimum request ${usd(P.pay_min)})` },
      { k: 'max', label: 'Max request today', ok: c.request_today > 0, text: c.request_today > 0 ? `${usd(c.request_today)}${num(f.mr) !== null ? ` (the PC says ${usd(f.mr)})` : ''}` : '$0' },
    ];
    // the ask: the playbook's full max (docs/FUNDED_25K_PLAYBOOK.md: $1,000 on the 25K at $27,100); the bot's own ping comes earlier
    const ask = P.pay_max, askBal = P.start + P.buffer + ask;
    // the SAME "to payout" every page shows (pc_feed.js payoutLines = the coach's need_more: until MFFU allows a request), then the plan's full ask
    const okBal = P.start + P.buffer + P.pay_min;
    const allowUsd = c.eligible ? 0 : Math.max(0, Math.round((c.need_more || 0) * 100) / 100);
    const usdMore = Math.max(0, Math.round((askBal - bal) * 100) / 100, c.cycle_profit > 0 && !c.cons_ok ? c.cons_need : 0);
    const daysMore = Math.max(0, c.cycle_days_need - c.cycle_days);
    const pc = pace(row && row.eq);
    const projFor = (need) => {
      if (need <= 0 && daysMore <= 0) return { date: today, text: 'today' };
      if (pc && pc.per > 0) { const n = Math.max(daysMore, Math.ceil(need / pc.per)), d0 = ef && ef > today ? ef : today, d = addTradingDays(d0, Math.max(1, n)); return { date: d, n, text: `${nice(d)} (${n} trading day${n === 1 ? '' : 's'} at ${usd(pc.per)} a day, the last ${pc.days} days' pace)` }; }
      if (pc) return { date: null, text: `not at the recent pace: ${usd(pc.per)} a day over the last ${pc.days} days` };
      return { date: null, text: 'not enough days yet to measure a pace' };
    };
    const proj = c.eligible ? projFor(usdMore) : projFor(Math.max(allowUsd, 0));
    const dd = daysMore > 0 ? `${daysMore} more traded day${daysMore === 1 ? '' : 's'}` : '';
    const needText = c.eligible ? (c.plan_ready ? `Ready to ask for ${usd(ask)}` : `MFFU allows ${usd(c.request_today)} now; ${usd(usdMore)} more for the plan's ${usd(ask)}`)
      : `${allowUsd > 0 ? usd(allowUsd) + ' more' : ''}${allowUsd > 0 && dd ? ' / ' : ''}${dd} until MFFU allows a payout`;
    const pp = projFor(usdMore);
    const planText = `The plan's ask: ${usd(ask)} at a balance of ${usd(askBal)}: ${usdMore > 0 ? `${usd(usdMore)} more${!c.eligible && pp.date ? `, about ${nice(pp.date)} at the recent pace` : ''}` : 'there now'}.`;
    const ping = PING_ABOVE[pk];
    const verdict = c.status === 'ready' ? 'PAYOUT READY' : c.status === 'allowed' ? 'Allowed (smaller)' : c.status === 'lost' ? 'Lost' : c.status === 'graduated' ? 'Graduated' : 'Not yet';
    const reason = c.status === 'ready' ? `Request ${usd(c.request_today)} today: ${usd(c.to_you)} to you (80%), ${usd(c.net)} after the 30% tax pot.`
      : c.status === 'allowed' ? `MFFU would pay ${usd(c.request_today)} today; the plan waits for the full ${usd(ask)} (${usd(c.plan_wait)} more).`
      : c.why[0] ? c.why[0][0].toUpperCase() + c.why[0].slice(1) + '.' : c.text;
    const steps = [
      `Wait for a balance of ${usd(askBal)} or more (${usd(ask)} above the ${usd(P.buffer)} buffer), ${P.cycle_days}+ traded days, best day under half.`,
      `In the MFFU dashboard, request a payout of ${usd(ask)} on the account${row && row.l4 ? ' ending ' + row.l4 : ''} (after the close, no open trade).`,
      `Move 30% of what lands (${usd(ask * P.split * 0.3)} of ${usd(ask * P.split)}) to the tax pot.`,
      'Record it on the PC: python -X utf8 -m engine.account_b --payout YYYY-MM-DD=' + ask,
      `A new cycle starts from the balance after the payout (${usd(askBal - ask)}).`,
    ];
    out.push({ ...base, has: true, eligible: !!c.eligible, status: c.status, verdict, reason, checks, steps, paid: num(f.pt), payouts: c.payouts_n,
      need: { usd: c.eligible ? usdMore : allowUsd, allow: allowUsd, plan: usdMore, days: daysMore, ask, askBal, okBal, text: needText, planText,
        frac: Math.max(0, Math.min(1, (bal - P.start) / ((c.eligible ? askBal : okBal) - P.start))) }, pace: pc, proj, balance: bal,
      ping: ping ? `The bot's phone ping comes at ${usd(ping)} above the buffer (balance ${usd(P.start + P.buffer + ping)}); card payout-ping-1000 asks whether to wait for ${usd(ask)}.` : '',
      trade_by: c.trade_by, idle_left: c.idle_left, coach: c });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ drawing
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
export function draw(box, list) {
  while (box.firstChild) box.removeChild(box.firstChild);
  if (!list.length) { box.appendChild(el('p', 'pr-none', 'No funded account yet. The tracker appears here the day one is funded.')); return; }
  for (const a of list) {
    const c = el('article', 'pr-acct'); c.dataset.id = a.id; c.dataset.status = a.status || 'none';
    const top = el('div', 'pr-row'); top.appendChild(el('b', 'pr-name', a.name)); top.appendChild(el('span', 'pr-badge ' + (a.status === 'ready' ? 'ok' : a.status === 'allowed' ? 'warn' : a.status === 'lost' ? 'bad' : ''), a.verdict)); c.appendChild(top);
    c.appendChild(el('p', 'pr-reason', a.reason));
    if (!a.has) { box.appendChild(c); continue; }
    const need = el('p', 'pr-need ag-num', a.need.text); c.appendChild(need);
    const g = el('div', 'pr-meter'); g.setAttribute('role', 'img');
    const frac = a.need.frac;
    g.setAttribute('aria-label', `${Math.round(frac * 100)} percent of the way from the start balance to ${usd(a.coach.eligible ? a.need.askBal : a.need.okBal)}`);
    const i = el('i'); i.style.setProperty('--w', `${Math.round(frac * 100)}%`); g.appendChild(i); c.appendChild(g);
    if (a.need.planText) c.appendChild(el('p', 'pr-line', a.need.planText));
    if (a.proj) { const p = el('p', 'pr-line'); p.appendChild(el('b', '', 'Projected: ')); p.appendChild(document.createTextNode(a.proj.text)); c.appendChild(p); }
    const ul = el('ul', 'pr-checks'); ul.setAttribute('aria-label', "MFFU's payout rules");
    for (const k of a.checks) { const li = el('li', k.ok ? 'ok' : 'no'); li.appendChild(el('span', 'pr-ic', k.ok ? '✓' : '×')); li.appendChild(el('span', 'pr-k', k.label)); li.appendChild(el('span', 'pr-v ag-num', k.text)); ul.appendChild(li); }
    c.appendChild(ul);
    if (a.trade_by) c.appendChild(el('p', 'pr-note' + (a.idle_left !== null && a.idle_left <= 2 ? ' warn' : ''), `Inactivity: trade by ${nice(a.trade_by)} (${a.idle_left} day${a.idle_left === 1 ? '' : 's'} left; 7 days without a trade wipes the profits).`));
    if (a.ping) c.appendChild(el('p', 'pr-note', a.ping));
    const det = el('details', 'pr-steps'); det.appendChild(el('summary', '', 'How to request it on MFFU'));
    const ol = el('ol'); for (const s of a.steps) ol.appendChild(el('li', '', s)); det.appendChild(ol); c.appendChild(det);
    box.appendChild(c);
  }
}
