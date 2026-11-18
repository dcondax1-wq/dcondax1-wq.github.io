// Zenith money (2026-11-03 night, owner: "I want money": net $ at a glance, the payout tracker, the path to $X a month).
// Loaded after zenith_hero.js. Classic script on the main page's helpers (VIEWS, PAGE, esc, D / window.HOMEJ), window.POLISH.model()
// + window.MissionUI (the accounts' real days), the goals block (data.json goals: engine/goals.py payout tracker) and two
// published files it only READS: plutus/plans.json (the funded study) and ares/rules.json (the MFFU numbers).
// Display only: it never posts, arms, routes or sizes anything. No number is invented: every figure is a real account figure,
// a stored study figure, or plain multiplication of one of them (and says so).
//   Money now   per account: today / this week / this month / since start, one number per tile
//   Payouts     what can be withdrawn now, the buffer, the 50% consistency rule, payouts used, when the next request can open
//   Path        "$X a month": the bot's H2 check rate per 50K account, what 2 / 3 / 6 accounts make at that rate, and what reaches
//               you after the payout rules (the study's steady rate per account; 3 accounts also as the study measured them)
// Mounted at the top of #/goals and #/money. jfx: the tile numbers roll up unless the quality is Off / reduced motion.
(function () {
  'use strict';
  const Z = window.ZenithFX;
  if (typeof VIEWS === 'undefined') return;
  const okN = (v) => typeof v === 'number' && Number.isFinite(v);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const usd = (v) => (okN(v) ? (v < 0 ? '−$' : '$') + Math.abs(Math.round(v)).toLocaleString('en-US') : '—');
  const sUsd = (v) => (okN(v) ? (v < 0 ? '−$' : '+$') + Math.abs(Math.round(v)).toLocaleString('en-US') : '—');
  const cls = (v) => (okN(v) && v > 0 ? 'up' : okN(v) && v < 0 ? 'dn' : '');
  const BOT_RATE_FALLBACK = 2670;                     // the H2 check rate per 50K account (CLAUDE.md headline: ~$2,670 a month)
  const GOALS = ['3000', '5000', '10000'];
  const ST = { plans: null, rules: null, asked: false, goal: '5000' };
  try { const g = localStorage.getItem('zm.goal'); if (GOALS.indexOf(g) >= 0) ST.goal = g; } catch (e) { /* private mode */ }

  const HD = () => (typeof D !== 'undefined' && D) || window.HOMEJ || null;
  const GL = () => (HD() && HD().goals) || null;
  function accounts() {
    try {
      const M = window.POLISH && window.POLISH.model ? window.POLISH.model() : null;
      return M && M.board && window.MissionUI ? (window.MissionUI.accounts(M) || []).filter((a) => a && !a.placeholder) : [];
    } catch (e) { return []; }
  }
  const etDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const dayPairs = (A) => {
    const o = new Map();
    for (const d of (A && A.days) || []) {
      const day = Array.isArray(d) ? String(d[0]) : String((d || {}).day || (d || {}).d || '');
      const v = Array.isArray(d) ? +d[1] : +(d || {}).usd;
      if (day && Number.isFinite(v)) o.set(day, v);
    }
    return o;
  };
  // the account's net $: today (the live number), this ET week (Monday on), this ET month, since start
  function nets(A) {
    const D = dayPairs(A), td = etDay();
    if (okN(A.today)) D.set(td, A.today);
    const now = new Date(td + 'T12:00:00Z'), dow = (now.getUTCDay() + 6) % 7;
    const mon = new Date(now.getTime() - dow * 864e5).toISOString().slice(0, 10), ym = td.slice(0, 7);
    let week = 0, month = 0, all = 0, hw = false, hm = false;
    D.forEach((v, d) => { all += v; if (d >= mon && d <= td) { week += v; hw = true; } if (d.slice(0, 7) === ym) { month += v; hm = true; } });
    return { today: okN(A.today) ? A.today : (D.has(td) ? D.get(td) : null), week: hw ? week : null, month: hm ? month : null,
      all: D.size ? all : (okN(A.profit) ? A.profit : null) };
  }

  function moneyNow() {
    const As = accounts(); if (!As.length) return '';
    const rows = As.map((A) => {
      const n = nets(A);
      const tile = (k, l, v) => `<div class="zm-t"><em>${l}</em><b class="${cls(v)}" data-zn-num="zm-${esc(A.key)}-${k}">${sUsd(v)}</b></div>`;
      return `<div class="zm-acct" style="--c:${esc(A.color || '#c8a24a')}"><div class="zm-an"><i aria-hidden="true"></i><b>${esc(A.name)}</b><span>${esc(A.size || '')}</span></div>
        <div class="zm-tiles">${tile('today', 'Today', n.today)}${tile('week', 'This week', n.week)}${tile('month', 'This month', n.month)}${tile('all', 'Since start', n.all)}</div></div>`;
    }).join('');
    return `<section class="card zm-card" id="zmNow"><div class="card-h"><h3>Money now</h3><span class="meta">net $ per account, costs in</span></div>${rows}</section>`;
  }

  // ---------------------------------------------------------------- payouts
  function rule50() { const r = ST.rules && ST.rules.plans && ST.rules.plans['50k']; return r || null; }
  function payouts() {
    const G = GL(), P = G && G.payout; if (!P || P.error) return '';
    const R = rule50(), min = R ? R.pay_min : null, max = R ? R.pay_max : null, cons = R ? R.cons : 0.5, split = R ? R.split : null;
    if (P.stage !== 'funded') {
      return `<section class="card zm-card" id="zmPay"><div class="card-h"><h3>Payouts</h3><span class="meta">not yet</span></div>
        <p class="zm-p">${esc(P.sentence || 'Payouts start on the funded account.')}</p>
        ${R ? `<div class="zm-tiles two"><div class="zm-t"><em>First payout needs</em><b>${usd(min)}</b><small>profit above the ${usd(R.buffer)} buffer</small></div><div class="zm-t"><em>You keep</em><b>${Math.round((split || 0) * 100)}%</b><small>of each payout</small></div></div>` : ''}</section>`;
    }
    const T = P.tracker || {}, ready = !!P.ready, avail = okN(P.max_request) ? P.max_request : null;
    const day = okN(P.best_day_pct) ? P.best_day_pct : null, dayOk = day == null || day <= cons * 100 + 0.01;
    const used = okN(P.payouts_n) ? P.payouts_n : null, tot = okN(P.payouts_max) ? P.payouts_max : (R ? R.max_payouts : null);
    const frac = Math.max(0, Math.min(1, +P.frac || 0));
    const bar = `<div class="zm-bar"><i style="width:${(frac * 100).toFixed(1)}%"></i></div>`;
    const when = P.eligible_from ? `Next request can open ${esc(String(P.eligible_from).slice(0, 16).replace('T', ' '))}` : '';
    return `<section class="card zm-card" id="zmPay"><div class="card-h"><h3>Payouts</h3><span class="zm-pill ${ready ? 'ok' : 'wait'}">${ready ? 'Ready to request' : 'Building'}</span></div>
      <div class="zm-tiles"><div class="zm-t"><em>Withdrawable now</em><b class="${ready ? 'up' : ''}" data-zn-num="zm-wd">${ready && avail != null ? usd(avail) : '$0'}</b><small>${ready ? 'max you can ask for' : (min ? 'first ' + usd(min) + ' needs the buffer cleared' : '')}</small></div>
        <div class="zm-t"><em>Best day vs 50% rule</em><b class="${dayOk ? 'up' : 'dn'}">${day != null ? Math.round(day) + '%' : '—'}</b><small>${dayOk ? 'ok: no day over ' + Math.round(cons * 100) + '% of the profit' : 'too big a day: trade more days'}</small></div>
        <div class="zm-t"><em>Payouts used</em><b>${used != null ? used : '—'}${tot ? ' / ' + tot : ''}</b><small>${max ? 'up to ' + usd(max) + ' each' : ''}</small></div></div>
      <div class="zm-lab"><span>Buffer to the payout line</span><span>${okN(P.balance) ? usd(P.balance) : ''}${okN(P.ask_at) ? ' of ' + usd(P.ask_at) : ''}</span></div>${bar}
      <p class="zm-p">${esc(P.sentence || '')}${when ? ' ' + when + '.' : ''}</p>${T.text && T.text !== P.sentence ? '' : ''}</section>`;
  }

  // ---------------------------------------------------------------- path to $X a month
  function plan50() { const ps = ST.plans && ST.plans.plans; return ps ? ps.find((p) => p.id === 'mffu_builder_50k') : null; }
  function path() {
    const G = GL(), rate = (G && G.month && okN(+G.month.per_month_expected) && +G.month.per_month_expected > 0) ? +G.month.per_month_expected : BOT_RATE_FALLBACK;
    const pl = plan50(), h2 = pl && pl.spans && pl.spans.H2, steady = h2 ? h2.steady : null, trio = ST.plans && ST.plans.trio && ST.plans.trio.H2;
    const X = +ST.goal, need = Math.ceil(X / rate);
    const chips = GOALS.map((g) => `<button type="button" role="radio" aria-checked="${g === ST.goal}" class="${g === ST.goal ? 'on' : ''}" data-zm-goal="${g}">$${(+g / 1000)}K</button>`).join('');
    const row = (n) => {
      const gross = n * rate, net = steady != null ? n * steady : null;
      const sa3 = ST.plans && ST.plans.strategy && ST.plans.strategy.three_accounts;
      const meas = n === 3 && sa3 && sa3.range && !(globalThis.OLY_HIDDEN && globalThis.OLY_HIDDEN.has("blitz")) ? ` · your 3 strategies (LIT + ATLAS + BLITZ) measured $${sa3.range.low.toLocaleString('en-US')}-${sa3.range.high.toLocaleString('en-US')} (first 6 months)`
        : n === 3 && trio ? ` · the study measured ${usd(trio.net_per_month)} (first 6 months)` : '';
      return `<div class="zm-r ${gross >= X ? 'hit' : ''}"><span class="zm-n">${n} accounts</span><span class="zm-g"><b data-zn-num="zm-g${n}">${usd(gross)}</b><small>the bot's trading</small></span>
        <span class="zm-g"><b>${net != null ? usd(net) : '—'}</b><small>after payout rules${esc(meas)}</small></span></div>`;
    };
    return `<section class="card zm-card" id="zmPath"><div class="card-h"><h3>Path to a month of $${(X / 1000)}K</h3><div class="zm-seg" role="radiogroup" aria-label="Monthly goal">${chips}</div></div>
      <div class="zm-tiles two"><div class="zm-t"><em>The bot, one 50K account</em><b class="up" data-zn-num="zm-rate">${usd(rate)}</b><small>a month, Jul-Oct check half, costs in</small></div>
        <div class="zm-t"><em>Accounts for $${(X / 1000)}K</em><b>${need}</b><small>at that trading rate</small></div></div>
      <div class="zm-rows">${row(2)}${row(3)}${row(6)}</div>
      <p class="zm-p small">Trading = accounts × ${usd(rate)}. After payout rules = accounts × ${steady != null ? usd(steady) : '—'} (the funded study's steady rate for the Builder 50K: the 80% split, caps, the buffer and eval fees are in it). Copies of one strategy take the same trades, so they rise and fall together${ST.plans && ST.plans.corr ? ' (correlation ' + ST.plans.corr + ')' : ''}; LIT, ATLAS and BLITZ barely move together (+0.14, -0.06, 0.00). MFFU allows 1 funded Builder 50K + 2 funded Builder 25K, so 3 accounts is the cap and more must be another firm. Backtest rates, not promises.</p></section>`;
  }

  function cards() { return moneyNow() + payouts() + path(); }

  // ---------------------------------------------------------------- mount
  function mount(el) {
    if (!el || !el.isConnected) return;
    el.querySelectorAll(':scope > .zm-card').forEach((x) => x.remove());
    const h = el.querySelector(':scope > .hero, :scope > header.hero');
    const html = cards(); if (!html) return;
    if (h) h.insertAdjacentHTML('afterend', html); else el.insertAdjacentHTML('afterbegin', html);
    el.querySelectorAll('.zm-card [data-zn-num]').forEach((e) => { const p = Z && Z.parse(e.textContent); if (p && p.v) Z.count(e, 0, 900); });
    bindSeg(el);
  }
  function bindSeg(el) { const sg = el.querySelector('.zm-seg'); if (sg) sg.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-zm-goal]'); if (!b) return; ST.goal = b.dataset.zmGoal; try { localStorage.setItem('zm.goal', ST.goal); } catch (x) { /* */ } const old = el.querySelector('#zmPath'); if (old) { old.insertAdjacentHTML('afterend', path()); old.remove(); bindSeg(el); } }); }
  // the two published study files, read once (a missing file only leaves its figures out)
  function load(el) {
    if (ST.asked) return; ST.asked = true;
    const get = (u) => fetch(u, { cache: 'force-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    Promise.all([get('plutus/plans.json'), get('ares/rules.json')]).then(([p, r]) => {
      ST.plans = p; ST.rules = r;
      const pg = document.getElementById('page');
      if (pg && (PAGE === 'goals' || PAGE === 'money')) mount(pg);
    });
  }
  ['goals', 'money'].forEach((id) => {
    const v0 = VIEWS[id];
    if (!v0 || v0.__zm) return;
    const w = function (el) {
      const out = v0.apply(this, arguments);
      try { mount(el); load(el); } catch (e) { console.warn('zenith money', e); }
      return out;
    };
    Object.keys(v0).forEach((k) => { w[k] = v0[k]; });
    w.__zm = true;
    VIEWS[id] = w;
  });
  window.ZENITH_MONEY = { version: 1, nets, cards };
})();
