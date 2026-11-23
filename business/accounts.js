// MY ACCOUNTS page (classic script, read only). Plan from ./accounts.json; live eval numbers from the PC (window.PC_FEED over
// ntfy) when it has reported, else ../home.json, matched to the plan by PC id / Name (mffumodel.js). Everything is drawn with textContent. BLITZ's account C is never shown.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : null));
  const usd = (v) => (v == null ? '-' : (v < 0 ? '-$' : '$') + Math.abs(Math.round(v)).toLocaleString('en-US'));
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };

  async function getJSON(u) {
    try { const r = await fetch(u, { cache: 'no-cache' }); if (r.ok) return await r.json(); } catch (e) { /* none */ }
    return null;
  }

  // home.json without what is not a real account (night-feedsA 2026-11-18): the GitHub Pages copy is a CLOUD build, whose board cards and
  // "accounts" are the cloud's paper twin (badge PAPER, $49,900): matched as "site copy of the PC" it became a 4th account ("MFFU 50K Eval,
  // on your PC, not in the plan yet") next to the real Zlarior row
  function realHome(h) {
    if (!isObj(h)) return null;
    const b = isObj(h.board) ? h.board : {}, fake = (x) => isObj(x) && (/^paper$/i.test(String(x.badge || '')) || /cloud/i.test(String(x.source || '')));
    const board = { ...b };
    for (const k of ['lit', 'atlas', 'blitz']) if (fake(b[k])) delete board[k];
    return { ...h, board, accounts: (Array.isArray(h.accounts) ? h.accounts : []).filter((a) => !fake(a) && !(isObj(a) && isObj(a.conn) && a.conn.present === false)) };
  }
  function ago(t) {
    const s = t ? Math.max(0, Date.now() / 1000 - t) : null;
    return s == null ? '' : s < 90 ? 'just now' : s < 5400 ? Math.round(s / 60) + ' min ago' : s < 172800 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' days ago';
  }

  // the live numbers of each plan row: matched by the PC id / Name (mffumodel.js), NEVER by plan size (2026-11-18: the new
  // Builder 25K eval b25k_2 had landed on ATLAS's funded row and hidden it)
  function liveFor(plan, lite, home) {
    const M = window.MFFU_MODEL, out = new Map();
    if (!M) return out;
    for (const r of M.match(plan, lite, realHome(home))) {
      if (!r.live) continue;
      const l = r.live;
      out.set(r.plan ? String(r.plan.key) : '__pc__' + r.key, { stage: l.stage, to_target: l.to_target, room: l.room, balance: l.balance, today: l.today,
                                                                status: l.status, session: l.session, name: l.name, plan: l.plan, src: l.src, t: l.t, mll: l.mll });
    }
    return out;
  }
  // the payout line of each funded account: the ZEUS card's own words (mffumodel.js cards + payoutcoach.js), keyed by plan row
  function payoutFor(plan, lite) {
    const M = window.MFFU_MODEL, out = new Map();
    if (!M || !window.PAYOUT_COACH || !isObj(lite)) return out;
    try {
      for (const c of M.cards({ lite, plan, coach: window.PAYOUT_COACH }, Math.floor(Date.now() / 1000)) || []) {
        if (isObj(c) && c.stage === 'funded' && isObj(c.payout) && isObj(c.payout.c) && c.payout.c.text) out.set(String(c.key), c.payout.c.text);
      }
    } catch (e) { /* no payout line */ }
    return out;
  }

  function kv(dl, rows) {
    dl.textContent = '';
    for (const [k, v] of rows) { dl.appendChild(el('dt', null, k)); dl.appendChild(el('dd', null, v)); }
  }

  function card(a, live, pay) {
    const c = el('section', 'ag-card card');
    const top = el('div', 'row2');
    top.appendChild(el('h3', null, a.name));
    top.appendChild(el('span', 'st ' + (a.status || 'waiting'), a.status === 'live' ? (live ? 'LIVE' : 'RUNNING') : a.status === 'buying' ? 'TO BUY' : 'LATER'));
    c.appendChild(top);
    c.appendChild(el('p', 'meta', a.plan + ' · ' + (live && live.stage === 'funded' ? 'funded' : a.stage)));
    const rows = [];
    if (live) {
      const target = a.plan.includes('25K') ? 1500 : 3000, mll = live.mll != null ? live.mll : a.plan.includes('25K') ? 1000 : 2000;
      if (live.to_target != null && live.stage !== 'funded') {
        const done = Math.max(0, Math.min(1, (target - live.to_target) / target));
        const bar = el('div', 'bar'); const i = el('i'); i.style.width = Math.round(done * 100) + '%'; bar.appendChild(i);
        c.appendChild(bar);
        rows.push(['To pass', usd(live.to_target) + ' more profit']);
      }
      if (live.stage === 'funded') rows.push(['Payout', pay || 'Funded: the payout coach above has the numbers']);
      if (live.room != null) rows.push(['Room left', usd(live.room) + ' of ' + usd(mll) + ' (lose it all = account ends)']);
      // audit E2 (2026-11-22): a sim-FUNDED account the way MFFU shows it: from $0, balance = profit (ATLAS $401, not $25,401) + the
      // need to the max payout; without PC_FEED.mffuView the raw balance as before
      const mv = live.stage === 'funded' && live.balance != null && window.PC_FEED && typeof window.PC_FEED.mffuView === 'function'
        ? window.PC_FEED.mffuView({ kind: 'funded', plan: a.plan, name: a.name, balance: live.balance, room: live.room, floor: live.floor }) : null;
      if (mv && mv.balance != null) {
        rows.push(['Balance (MFFU, from $0)', usd(mv.balance)]);
        if (mv.goal && mv.goal.need != null) rows.push(['To the max payout', mv.goal.ready ? 'ready: ask ' + usd(mv.goal.ask) : usd(mv.goal.need) + ' more, then ask ' + usd(mv.goal.ask)]);
      } else if (live.balance != null) rows.push(['Balance', usd(live.balance)]);
      if (live.today != null) rows.push(['Today', usd(live.today)]);
      if (live.session != null) rows.push(['Trading day', '#' + String(live.session)]);
    }
    rows.push(['Bots on it', a.bots || '-']);
    rows.push(['Next step', a.next || '-']);
    rows.push(['First payout', a.payout || '-']);
    rows.push(['$ a month', (a.usd_month || '-') + ' (estimate)']);
    rows.push(['Cost', a.cost || '-']);
    const dl = el('dl'); kv(dl, rows); c.appendChild(dl);
    if (live) c.appendChild(el('p', 'meta src', 'Numbers: ' + (live.src || 'PC') + (live.t ? ' · ' + ago(live.t) : '')));   // where each number comes from, and how old
    return c;
  }

  async function main() {
    const plan = (await getJSON('accounts.json')) || { accounts: [], decisions: [], rules: [] };
    const home = await getJSON('../home.json');
    let src = '', t = 0, lite = null;
    try { if (isObj(home) && window.MFFU_MODEL && window.MFFU_MODEL.liveAccounts(null, realHome(home)).length) src = 'site'; } catch (e) { src = ''; }   // a cloud build has no real numbers
    try {
      if (window.PC_FEED) {
        lite = await window.PC_FEED.fetchLatest({ feedUrl: '../status_feed.json' });
        if (isObj(lite) && ((Array.isArray(lite.accounts) && lite.accounts.length) || isObj(lite.board))) { src = 'pc'; t = +lite.t || 0; }
      }
    } catch (e) { /* plan only */ }
    try { if (window.PAYOUT_CARD) window.PAYOUT_CARD.mount($('coach'), { plan, home, lite, title: 'Payouts' }); } catch (e) { /* the coach never breaks the page */ }
    const live = liveFor(plan, src === 'pc' ? lite : null, isObj(home) ? home : null), pays = payoutFor(plan, src === 'pc' ? lite : null);
    const list = $('list'); list.textContent = '';
    for (const a of plan.accounts || []) list.appendChild(card(a, a.status === 'live' ? live.get(String(a.key)) || null : null, pays.get(String(a.key)) || ''));
    for (const [k, l] of live) if (k.startsWith('__pc__')) list.appendChild(card({ name: l.name || k.slice(6), plan: l.plan || '', stage: l.stage, status: 'live', bots: '-', next: 'On your PC, not in the plan yet: tell Claude its name' }, l));
    const n = (s) => (plan.accounts || []).filter((a) => a.status === s).length;
    const cost = (plan.accounts || []).filter((a) => a.status !== 'live').map((a) => { const m = String(a.cost || '').match(/\d+(\.\d+)?/); return m ? +m[0] : null; }).filter((v) => v != null);
    kv($('sum'), [['Running now', String(n('live'))], ['To buy now', String(n('buying'))], ['Later (if MFFU says yes)', String(n('waiting'))],
                  ['Cost to buy the new ones', cost.length ? '~' + usd(cost.reduce((x, y) => x + y, 0)) : '-'], ['Plan updated', plan.updated || '-']]);
    const dec = $('dec'); dec.textContent = '';
    for (const d of plan.decisions || []) dec.appendChild(el('li', null, d));
    kv($('rules'), (plan.rules || []).map((r) => [r[0], r[1]]));
    $('limits').textContent = plan.limits || '';
    $('foot').textContent = plan.note || '';
    const age = t ? Math.max(0, Math.round((Date.now() / 1000 - t) / 60)) : null;
    $('status').textContent = src === 'pc' ? 'Live numbers from your PC, ' + (age < 1 ? 'just now' : age + ' min ago') + '.'
      : src === 'site' ? 'Numbers from the last site update. Your PC has not reported here yet.' : 'Plan only. No live numbers yet.';
  }
  if (typeof window !== 'undefined') window.ACCOUNTS_PAGE = { card };   // tests (tests/test_state_pulse.py: the $0 funded row)
  main();
})();
