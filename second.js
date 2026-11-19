// ATLAS (phone; loaded by index.html with one <script defer> after secondcore.js; read-only). ATLAS is the second strategy
// (owner 2026-10-22: "LIT is on the 50K, the new one trades the 25K, then we scale"): EMA London pullback + MACD sweep
// divergence + S/R NY reclaim pooled on their own account (account B; internal key "second" everywhere in the data).
//   Bottom bar   Home · Brain · ATLAS · Trades · Money · More (Strategy and its research pages fold into More)
//   ATLAS page   status (PAPER / SIM / LIVE on <account>), today's $, the 25K eval card, the ATLAS brain per member, the
//                go / no-go scorecard, today's and recent trades, the rules, the backtest + 25K eval odds, "with LIT"
//   Home         two cards on top: "LIT · 50K" and "ATLAS · 25K" (status, today, this week, eval progress, next action)
// Data: data.json "second" (engine/second.dashboard_block; second.atlas = research/second/atlas.json or the account-B
// research), the PC's live cut (live.json / heartbeat "second") laid over it. Renderer: secondcore.js (SecondUI.atlas).
// Classic script that uses the main page's helpers (D, VIEWS, GROUPS, PAGES, P, head, nav, route) when they exist.
(function () {
  'use strict';
  if (typeof GROUPS === 'undefined' || typeof VIEWS === 'undefined') return;
  const FRESH_S = 20 * 60;
  const HD = () => (typeof D !== 'undefined' && D) || window.HOMEJ || null;
  const liveCut = () => { const h = HD(); return (h && h.live && h.live.pc && h.live.pc.second) || null; };
  // the freshest ATLAS brain: the PC's (live.json / heartbeat) while fresh, else the cloud run's
  function brainOf() {
    const h = HD(), U = window.SecondUI; if (!h || !U) return null;
    const pc = liveCut(), now = Date.now() / 1000;
    if (pc && pc.strategies && Object.keys(pc.strategies).length && now - (+pc.t || 0) < FRESH_S) return U.brainList(pc, 'PC bot');
    if (h.second && (h.second.strategies || []).length) return U.brainList(h.second, 'cloud run');
    return pc ? U.brainList(pc, 'PC bot (not live)') : null;
  }
  // ATLAS's account from the PC's status post (night-feedsB 2026-11-18): the board card (LIVE, funded or eval), the MFFU block (start
  // day, last 4 digits) and its newest real trades, in the account-B shape secondcore draws (acctB / fundedB). The cloud's own copy
  // says "not set up / not bought yet" because the cloud cannot see the PC; this is what the ZEUS card shows.
  const okN = (v) => typeof v === 'number' && Number.isFinite(v);
  function pcRoute() {
    const L = window.LIVE, raw = L && L.raw, B = (HD() || {}).board || null, A = B && B.atlas;
    if (!raw || !A || A.configured === false || !okN(A.balance) || !/LIVE|SIM/i.test(String(A.badge || ''))) return null;
    const mf = ((raw.mf && raw.mf.a) || []).find((r) => r && r.id === 'atlas') || {}, funded = /funded/i.test(String(A.status || ''));
    const start = okN(A.profit) ? Math.round((A.balance - A.profit) * 100) / 100 : 25000, C = window.PAYOUT_COACH;
    const R = C && C.PLANS ? C.PLANS[+A.mll >= 2000 ? 'builder50k' : 'builder25k'] : null;
    const rt = +((raw.reporter && raw.reporter.t) || raw.t) || null, mins = rt ? Math.max(0, Math.round((Date.now() / 1000 - rt) / 60)) : null;
    let F = null;
    if (funded) {
      let c = null;
      try {
        const f = mf.f || {};
        c = C && C.coach ? C.coach({ balance: A.balance, cycle_start_balance: okN(f.cp) ? A.balance - f.cp : null, best_day: okN(f.bd) ? f.bd : null, cycle_days: okN(f.cd) ? f.cd : null,
          payouts_n: okN(f.pn) ? f.pn : null, eligible_from: f.ef || null, room: A.room }, +A.mll >= 2000 ? 'builder50k' : 'builder25k') : null;
      } catch (e) { c = null; }
      F = c && c.ok ? { text: A.payout_text || c.text, ask_at_balance: R ? start + c.plan_line : null, to_ask: R ? Math.round((start + c.plan_line - A.balance) * 100) / 100 : null,
        buffer: R ? R.buffer : null, buffer_reached: c.above_buffer >= 0, buffer_balance: R ? start + R.buffer : null, best_day_pct: c.best_pct, cons_limit_pct: 50,
        cycle_profit: c.cycle_profit, cycle_days: c.cycle_days, cycle_days_need: c.cycle_days_need, payouts_n: c.payouts_n, payouts_max: c.payouts_max, paid_to_you: null,
        eligible: c.eligible, max_request: c.request_today, to_you: c.to_you, eligible_from: c.eligible_from || (mf.f && mf.f.ef) || null, why: c.why, ready: c.status === 'ready', record_cmd: 'tell Claude the amount' }
        : { text: A.payout_text || 'Funded. The payout line shows once the payout coach has loaded.', why: [], eligible_from: (mf.f && mf.f.ef) || null, record_cmd: 'tell Claude the amount' };
    }
    const at = ((raw.at && raw.at.a) || []).find((x) => x && x.id === 'atlas');
    const routed = (at && at.tr || []).filter((r) => Array.isArray(r)).map((r) => ({ t: r[0], side: +r[2] === -1 ? 'sell' : 'buy', qty: r[3], strategy: '', reason: r[7] || 'open', pnl: r[8] }));
    const p = A.position && A.position.side ? { side: A.position.side, qty: A.position.qty, strategy: '', entry: A.position.entry, stop: A.position.stop, target: A.position.target } : null;
    const ab = { label: 'ATLAS', account: 'MFFU account …' + (mf.l4 || '····'), plan_label: String(A.plan || 'MFFU Builder 25K'), kind: String(A.badge || 'LIVE').toUpperCase(), enabled: true,
      stage: funded ? 'funded' : 'eval', keys: String(A.method || 'EMA · MACD · S/R').split(/\s*·\s*/), day_pnl: A.today_pnl, week_pnl: A.week_pnl, entries_today: A.trades_today,
      open: p, routed, funded: F, note: `PC report${mins != null ? ' · ' + mins + ' min ago' : ''}`,
      eval: { balance: A.balance, floor: A.floor, room: A.room, status: funded ? 'funded' : (A.status || 'open'), session: A.session, start: mf.sd || null,
        target: okN(A.target_balance) ? A.target_balance : null, to_target: okN(A.to_target) ? A.to_target : null } };
    // the member brains stay the PC's / cloud's; its real trades (board src live) replace nothing, they are added to the members' rows
    const strategies = {};
    for (const t of (B.trades || [])) {
      if (!t || t.acct !== 'atlas' || t.src !== 'live' || !t.key) continue;
      (strategies[t.key] = strategies[t.key] || { trades: [] }).trades.push({ entry_t: t.entry_t, exit_t: t.exit_t, day: t.day, dir: String(t.side).toUpperCase() === 'SHORT' ? -1 : 1, qty: t.qty,
        exit_kind: t.open ? 'OPEN' : (t.exit || 'EXIT'), r: t.r, usd: t.usd, src: 'live' });
    }
    return { route: { account_b: ab }, strategies };
  }
  function view(el) {
    const S = (HD() && HD().second) || null;
    el.innerHTML = (typeof head === 'function' ? head('Strategy 2 · 25K', 'ATLAS',
      'The 25K bot: is it on, $ today, $ left to pass, what it waits for, its trades and rules') : '<h2>ATLAS</h2>') + '<div id="atRoot"></div>';
    const root = el.querySelector('#atRoot');
    if (!window.SecondUI || !window.SecondUI.atlas) { root.innerHTML = '<div class="card">secondcore.js did not load.</div>'; return; }
    const lc = liveCut(), pr = lc && lc.route && lc.route.account_b ? null : pcRoute();
    window.SecondUI.atlas(root, S, { live: pr ? { ...(lc || {}), ...pr, strategies: { ...((lc && lc.strategies) || {}), ...pr.strategies } } : lc, brain: brainOf(), charts: chartsOf() });
  }

  // trade pictures (engine/trade_chart.py): data.json "charts" (home.json carries the newest 3 per strategy)
  const chartsOf = () => { const h = HD(); return (h && h.charts) || null; };
  // Trades page: LIT's trade pictures on top (its paper trades, else backtest examples); tap = full screen
  function litPics() {
    const T = window.TradePics, ch = chartsOf();
    if (!T || !ch) return '';
    const L = T.list(ch, 'lit');
    if (!L.length) return '';
    return `<div class="card tp-trades"><div class="card-h"><h3>Trade pictures · Zlarior</h3><span class="meta">${L[0].example ? 'backtest examples until the first paper trade' : 'newest first'} · tap for full screen</span></div>
      ${T.strip(L.slice(0, 20), { label: 'Zlarior trade pictures' })}</div>`;
  }

  // ------------------------------------------------------------------ Home: "LIT · 50K" and "ATLAS · 25K" side by side
  const ok = (v) => v != null && !isNaN(v);
  function litCard() {
    const h = HD() || {}, L = h.live || {}, A = (h.accounts || []).filter((a) => a && a.id && !a.error);
    const pc = A.find((a) => a.source === 'pc'), cl = A.find((a) => a.source === 'cloud');
    const a = (pc && (pc.conn && pc.conn.connected || pc.eval)) ? pc : (cl || pc || null);
    const v = L.pc_verdict || {}, e = (a && a.eval) || {}, pn = (a && a.pnl) || {};
    const lvl = v.level === 'good' ? 'good' : v.level === 'bad' ? 'bad' : v.level ? 'warn' : (a && a.source === 'cloud' ? 'warn' : '');
    const status = v.label || (a && a.source === 'cloud' ? 'CLOUD PAPER' : 'CHECKING');
    const now = Date.now() / 1000, pb = L.pc && L.pc.brain && !L.pc.brain.error ? L.pc.brain : null, cb = L.brain && !L.brain.error ? L.brain : null;
    const b = pb && (now - (+pb.t || 0) < FRESH_S || !cb) ? pb : cb;
    const hl = L.pc && typeof L.pc.health === 'object' ? L.pc.health : null;
    const next = (b && b.stage && b.stage.waiting) || (hl && hl.lit && hl.lit.text) || L.model_state || '';
    const target = 3000, prof = ok(e.profit) ? e.profit : null;
    const parts = [];
    if (ok(e.to_target)) parts.push('$' + Math.round(e.to_target).toLocaleString('en-US') + ' to pass');
    if (ok(e.room)) parts.push('drawdown left $' + Math.round(e.room).toLocaleString('en-US') + ' of $' + Math.round(+e.mll || 2000).toLocaleString('en-US'));
    return { name: 'Zlarior', plan: (a && a.plan) ? 'MFFU ' + String(a.plan).replace(/^MFFU\s*/, '') + (a.source === 'cloud' ? ' · cloud paper' : '') : 'MFFU Builder 50K',
      status, lvl, today: pn.today, week: pn.week, prog: prof != null ? prof / target : 0, progText: parts.join(' · ') || 'eval not reporting yet', next, go: 'today' };
  }
  function homeCards() {
    if (!window.SecondUI || !window.SecondUI.twoCards) return '';
    const S = (HD() && HD().second) || null;
    const at = window.SecondUI.atlasCard(S, liveCut(), brainOf());
    if (!S) { at.status = 'LOADING'; at.progText = 'loading ATLAS…'; }
    const lit = litCard(); lit.go = 'brain';
    return window.SecondUI.twoCards([lit, at]);
  }

  function install() {
    if (typeof P !== 'undefined' && !P.atlas) P.atlas = '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.4 3.9 5.2 3.9 8.5s-1.3 6.1-3.9 8.5c-2.6-2.4-3.9-5.2-3.9-8.5s1.3-6.1 3.9-8.5z"/>';
    // the old System > Second strategies page becomes the ATLAS tab (old links #/second still work)
    GROUPS.forEach((g) => { g.pages = g.pages.filter((p) => p[0] !== 'second' && p[0] !== 'atlas'); });
    // Strategy (and its research pages) fold into More so the bar stays at six tabs at 390 px
    const si = GROUPS.findIndex((g) => g.id === 'strategy'), more = GROUPS.find((g) => g.id === 'system');
    if (si >= 0 && more) {
      const sp = GROUPS[si].pages;
      GROUPS.splice(si, 1);
      more.pages.splice(1, 0, ...sp.filter((p) => !more.pages.some((q) => q[0] === p[0])));
      Object.values(PAGES).forEach((p) => { if (p.group === 'strategy') p.group = 'system'; });
      if (typeof DETAIL !== 'undefined') Object.values(DETAIL).forEach((d) => { if (d.group === 'strategy') d.group = 'system'; });
    }
    if (!GROUPS.some((g) => g.id === 'atlas')) {
      const bi = GROUPS.findIndex((g) => g.id === 'brain');
      GROUPS.splice(bi >= 0 ? bi + 1 : 1, 0, { id: 'atlas', label: 'ATLAS', icon: 'atlas', pages: [['atlas', 'ATLAS', 'atlas', 'Strategy 2 on the 25K: status, brain, go / no-go, trades, rules, backtest']] });
    }
    delete PAGES.second;
    PAGES.atlas = { id: 'atlas', label: 'ATLAS', icon: 'atlas', desc: 'Strategy 2 on the 25K', group: 'atlas' };
    VIEWS.atlas = view;
    VIEWS.second = view;
    if (typeof SCENE !== 'undefined') SCENE.atlas = 'eval';
    if (typeof ALIAS !== 'undefined') Object.assign(ALIAS, { second: 'atlas', ema: 'atlas', macd: 'atlas', sr: 'atlas', paper2: 'atlas', second_strategies: 'atlas', acctb: 'atlas', account_b: 'atlas', strategy2: 'atlas' });
    // Home: the two-strategy summary on top (under the Surface line / banners)
    const t0 = VIEWS.today;
    if (t0 && !t0.__atlas) {
      VIEWS.today = function (el) {
        t0.apply(this, arguments);
        try {
          const h = homeCards(); if (!h) return;
          el.querySelectorAll('.bz-tile').forEach((x) => x.remove());   // the Bot Brain tile repeated the LIT card's "next" line (a tap on LIT opens the brain)
          const inst = el.querySelector('#moInst');          // the "Add to Home Screen" guide (browser only) stays first
          if (inst) inst.insertAdjacentHTML('afterend', h); else el.insertAdjacentHTML('afterbegin', h);
        } catch (e) { console.warn('atlas home cards', e); }
      };
      VIEWS.today.__atlas = true;
    }
    const tr0 = VIEWS.trades;
    if (tr0 && !tr0.__pics) {
      VIEWS.trades = function (el) {
        tr0.apply(this, arguments);
        try {
          const h = litPics(); if (!h) return;
          const hd = el.querySelector('.stats') || el.querySelector('.card');
          if (hd) hd.insertAdjacentHTML('beforebegin', h); else el.insertAdjacentHTML('beforeend', h);
          if (window.TradePics) window.TradePics.settle(el);
        } catch (e) { console.warn('trade pictures', e); }
      };
      VIEWS.trades.__pics = true;
    }
    if (typeof nav === 'function') { nav(); if (typeof route === 'function') route(); }
  }
  install();
})();
