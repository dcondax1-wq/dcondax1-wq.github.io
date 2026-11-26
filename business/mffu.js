// MY MFFU ACCOUNTS: the account center page (night-mffu2 2026-11-18, owner: "I want everything on the accounts to the point where I
// barely even have to open MFFU on Safari. I need notifications when trades are taken, on which account."). Classic script, read only.
// The pure part is mffucenter.js (window.MFFU_CENTER, on mffumodel.js + payoutcoach.js); this file only fetches and draws, with
// textContent and one canvas per equity line. Live numbers come ONLY from the PC's public status post (../pc_feed.js); the site's
// saved copies (../board/board.json, ../home.json) are drawn as SNAPSHOT, never as live. window.MFFU_PAGE is the test hook.
// ?at=<ISO time> pins the clock (tests and screenshots only: it changes nothing but the page's "now").
(function () {
  'use strict';
  const X = window.MFFU_CENTER, M = window.MFFU_MODEL;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
  const usd = X.usd, sgn = X.sgn;
  const AT = (() => { try { const q = new URLSearchParams(location.search).get('at'); const t = q ? Date.parse(q) : NaN; return Number.isFinite(t) ? Math.floor(t / 1000) : null; } catch (e) { return null; } })();
  const nowS = () => AT || Math.floor(Date.now() / 1000);
  const todayET = (t) => X.etDate(t);
  const WORD = { ok: 'OK', close: 'Close', broken: 'Broken', wait: 'Not yet', info: 'Info' };

  async function getJSON(u, ms) {
    const ac = typeof AbortController === 'function' ? new AbortController() : null, tm = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
    try { const r = await fetch(u, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); if (r.ok) return await r.json(); } catch (e) { /* none */ } finally { clearTimeout(tm); }
    return null;
  }

  function src(a) { return a.src.label + (a.src.asof ? ' · ' + a.src.asof + (a.src.ago ? ' (' + a.src.ago + ')' : '') : ''); }
  function asof(t, now) { return t ? X.asOf(t, now) + ' (' + X.ago(now - t) + ')' : 'time unknown'; }
  function px(v) { return v == null ? '-' : v.toLocaleString('en-US', { maximumFractionDigits: 2 }); }
  function tradeTime(t, now) { return t ? (X.tradingDay(t) === X.tradingDay(now) ? '' : X.dayText(X.etDate(t), true) + ' ') + X.clock(t) : '-'; }

  function bar(frac, cls) {
    const b = el('div', 'bar' + (cls ? ' ' + cls : '')), i = el('i');
    i.style.width = Math.round(Math.max(0, Math.min(1, frac || 0)) * 100) + '%';
    b.appendChild(i);
    return b;
  }

  function kv(dl, k, v, small, cls) {
    dl.appendChild(el('dt', null, k));
    const dd = el('dd', cls || null);
    if (v instanceof Node) dd.appendChild(v); else dd.appendChild(document.createTextNode(String(v)));
    if (small) dd.appendChild(el('small', null, small));
    dl.appendChild(dd);
  }

  function section(box, title, open, cls) {
    const d = el('details', 'mf-sec' + (cls ? ' ' + cls : ''));
    if (open) d.open = true;
    d.appendChild(el('summary', null, title));
    box.appendChild(d);
    return d;
  }

  function equity(pts) {
    const c = el('canvas', 'eq');
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', 'P&L at each day\'s close: ' + pts.map((p) => usd(p)).join(', '));
    requestAnimationFrame(() => {
      const w = c.clientWidth || 300, h = c.clientHeight || 56, r = window.devicePixelRatio || 1;
      c.width = Math.round(w * r); c.height = Math.round(h * r);
      const g = c.getContext('2d'); if (!g) return;
      g.scale(r, r);
      const lo = Math.min(0, ...pts), hi = Math.max(0, ...pts), span = hi - lo || 1, pad = 4;
      const X0 = (i) => pad + (pts.length > 1 ? (i * (w - 2 * pad)) / (pts.length - 1) : (w - 2 * pad) / 2);
      const Y = (v) => pad + (h - 2 * pad) * (1 - (v - lo) / span);
      g.strokeStyle = 'rgba(255,255,255,.25)'; g.setLineDash([3, 3]); g.lineWidth = 1;
      g.beginPath(); g.moveTo(pad, Y(0)); g.lineTo(w - pad, Y(0)); g.stroke(); g.setLineDash([]);
      g.strokeStyle = pts[pts.length - 1] >= 0 ? '#9fcf8a' : '#e07a6a'; g.lineWidth = 2;
      g.beginPath(); pts.forEach((v, i) => (i ? g.lineTo(X0(i), Y(v)) : g.moveTo(X0(i), Y(v)))); g.stroke();
      g.fillStyle = g.strokeStyle; g.beginPath(); g.arc(X0(pts.length - 1), Y(pts[pts.length - 1]), 3, 0, Math.PI * 2); g.fill();
    });
    return c;
  }

  // one trade line: "9:42 AM LONG 6 at 27,390 -> TARGET +$1,080 (+4.5R)"
  function tradeLine(x, now, withName) {
    const li = el('li', 'tr' + (x.open ? ' open' : ''));
    const left = el('span', 'tr-what', (withName ? x.name + ' · ' : '') + tradeTime(x.entry_t, now) + ' · ' + x.side + ' ' + (x.qty || '?') + ' micro' + (x.qty === 1 ? '' : 's')
      + (x.entry != null ? ' at ' + px(x.entry) : ''));
    const right = el('b', x.open ? (x.pnl_usd > 0 ? 'pos' : x.pnl_usd < 0 ? 'neg' : 'warn') : x.usd > 0 ? 'pos' : x.usd < 0 ? 'neg' : '',
      x.open ? (x.pnl_usd != null ? sgn(x.pnl_usd, true) + ' now' : 'open now') : (x.exit ? x.exit + ' ' : '') + sgn(x.usd, true) + (x.r != null ? ' (' + (x.r > 0 ? '+' : '') + x.r.toFixed(1) + 'R)' : ''));
    li.appendChild(left); li.appendChild(right);
    return li;
  }

  function positionBox(p, now) {
    const box = el('div', 'mf-pos');
    box.appendChild(el('p', 'mf-pos-h', 'OPEN TRADE: ' + p.side + ' ' + (p.qty || '?') + ' micros at ' + px(p.entry)));
    const dl = el('dl', 'kv2');
    if (p.pnl_usd != null) kv(dl, 'Now', sgn(p.pnl_usd, true), (p.pnl_how ? 'at ' + p.pnl_how + ' · ' : '') + asof(p.pnl_t, now), p.pnl_usd > 0 ? 'pos' : p.pnl_usd < 0 ? 'neg' : null);
    if (p.stop != null) kv(dl, 'Stop', px(p.stop) + (p.risk_usd != null ? (p.stop_locks != null ? ' · locks ' + sgn(p.stop_locks, true) : ' · ' + usd(-p.risk_usd, true) + ' if hit') : ''), p.be ? 'moved to breakeven' : '');
    if (p.target != null) kv(dl, 'Target', px(p.target) + (p.reward_usd != null ? ' · ' + sgn(p.reward_usd, true) + ' if hit' : ''));
    kv(dl, 'Opened', tradeTime(p.entry_t, now) + ' ET', 'position ' + asof(p.t, now));
    box.appendChild(dl);
    return box;
  }

  function rulesList(rules, now) {
    const ul = el('ul', 'rules');
    for (const r of rules) {
      const li = el('li', 'rule ' + r.state);
      li.dataset.rule = r.key;
      li.appendChild(el('span', 'rs ' + r.state, WORD[r.state] || r.state));
      const body = el('div', 'rb');
      body.appendChild(el('b', null, r.label));
      body.appendChild(el('span', null, r.text));
      if (r.more && r.state !== 'ok') body.appendChild(el('small', null, r.more));
      li.appendChild(body);
      ul.appendChild(li);
    }
    return ul;
  }

  function card(a, now) {
    const box = el('section', 'ag-card card mf');
    box.id = 'acct-' + a.key;
    box.dataset.key = a.key;
    const top = el('div', 'mf-top');
    top.appendChild(el('h2', null, a.name));
    top.appendChild(el('span', 'mf-st ' + a.chip.cls, a.chip.text));
    box.appendChild(top);
    box.appendChild(el('p', 'mf-sub', a.plan + (a.l4 ? ' · account …' + a.l4 : '') + (a.base && a.base.notInPlan ? ' · on your PC, not in the plan yet' : '')));
    box.appendChild(el('p', 'mf-src ' + a.src.kind, src(a)));
    if (a.life_why && /locked|failed|passed|lost/.test(a.stage)) box.appendChild(el('p', 'warn mf-why', a.life_why));
    const m = a.money;
    const big = el('div', 'mf-big');
    const tile = (label, v, cls, small) => { const d = el('div'); d.appendChild(el('b', cls || null, v)); d.appendChild(el('span', null, label)); if (small) d.appendChild(el('small', null, small)); big.appendChild(d); };
    tile(a.funded ? 'Balance (MFFU, from $0)' : 'Balance', usd(m.balance, true), a.funded && m.balance != null ? (m.balance >= 0 ? 'pos' : 'neg') : '', a.funded && m.ledger_balance != null ? 'bot ledger ' + usd(m.ledger_balance, true) : '');
    tile('Today (closed)', sgn(m.today, true), m.today > 0 ? 'pos' : m.today < 0 ? 'neg' : '', m.open != null ? 'open trade ' + sgn(m.open, true) : '');
    tile(a.funded ? 'Profit since funded' : 'P&L since start', sgn(m.pnl, true), m.pnl > 0 ? 'pos' : m.pnl < 0 ? 'neg' : '');
    tile('Left to max loss', usd(m.room_now != null ? m.room_now : m.room, true), m.room != null && m.mll && m.room < m.mll * 0.25 ? 'neg' : '', m.floor != null ? 'floor ' + usd(m.floor, true) : '');
    box.appendChild(big);
    const mv = moneyView(a, now); if (mv) box.appendChild(mv);
    if (a.position) box.appendChild(positionBox(a.position, now));
    // to pass (evaluation) or the payout (sim funded)
    if (a.target) {
      const t = a.target, w = el('div', 'mf-goal');
      w.appendChild(el('p', 'mf-goal-h', 'To pass: make ' + usd(t.v) + ' (balance ' + usd(t.balance) + ')'));
      w.appendChild(bar(t.progress));
      w.appendChild(el('p', 'note', t.left == null ? 'needs the PC\'s balance' : t.left <= 0 ? 'Target reached: MFFU passes it after the day\'s close (1 trading day minimum)'
        : usd(t.left, true) + ' to go (P&L now ' + sgn(t.pnl, true) + ') · ' + Math.round((t.progress || 0) * 100) + '% done · min ' + t.min_days + ' trading day' + (t.min_days === 1 ? '' : 's')
          + (t.cons ? ' · no day over ' + Math.round(t.cons * 100) + '% of the profit' : ' · no consistency rule in the evaluation')));
      box.appendChild(w);
    }
    if (a.payout) {
      const p = a.payout, w = el('div', 'mf-goal');
      w.appendChild(el('p', 'mf-goal-h' + (p.request_today > 0 ? ' pos' : ''), 'Payout · ' + p.text));
      w.appendChild(rulesList(p.checks, now));
      w.appendChild(el('p', 'note', 'Requestable now ' + usd(p.request_today, true) + (p.request_today > 0 ? ' (' + usd(p.to_you, true) + ' to you)' : '') + ' · min ' + usd(p.pay_min)
        + ', max ' + usd(p.pay_max) + ' a payout, you keep ' + Math.round(p.split * 100) + '% · payouts ' + p.payouts_n + ' of ' + p.max_payouts
        + (p.eligible_from ? ' · first request from ' + X.dayText(p.eligible_from, true) : '') + ' · after a payout the floor sits at $100'));
      if (p.t) w.appendChild(el('p', 'note', 'Payout tracker ' + asof(p.t, now)));
      box.appendChild(w);
    }
    // the first payout's date range (payday plan, ../nqdeep.js; night-nqdash2 2026-11-20): an ESTIMATE, said as one
    const K = window.NQ_DEEP, PD = window.MFFU_PAGE && window.MFFU_PAGE.payday;
    if (K && PD && !/failed|lost/.test(a.stage || '')) {
      const P = K.core.payout(a.name, PD, 'H2', todayET(now));
      if (P) {
        const ps = section(box, 'First payout · ESTIMATE · most likely ' + (P.med ? K.core.shortDay(P.med) : 'not in the plan'), false, 'payday-sec');
        const w = el('div', 'nqd-box'); K.draw.payout(w, P);
        const other = ['H1', 'REF'].map((m) => { const o = K.core.payout(a.name, PD, m, todayET(now)); return o && o.med ? (o.market + ': ' + K.core.shortDay(o.med)) : ''; }).filter(Boolean);
        if (other.length) w.appendChild(el('p', 'nqd-note', 'In other markets: ' + other.join(' · ') + '.'));
        ps.appendChild(w);
      }
    }
    // max loss detail
    const dl = el('dl', 'kv2');
    if (m.floor != null) {
      const w = el('div');
      const ml = a.rules.find((x) => x.key === 'mll');
      w.appendChild(document.createTextNode(usd(m.room, true) + ' left above the floor ' + usd(m.floor, true) + (m.locked ? ' (locked)' : '') + ' · max loss ' + usd(m.mll) + ' from the best close'));
      w.appendChild(bar(m.mll ? m.room / m.mll : 0, 'dd ' + (ml ? ml.state : 'ok')));
      kv(dl, 'Max loss', w, m.next_text || '');
    }
    if (a.dll.v) kv(dl, 'Daily loss', a.dll.used == null ? '-' : usd(a.dll.used, true) + ' used of ' + usd(a.dll.v) + ' · ' + usd(a.dll.left, true) + ' left', 'soft: hitting it pauses the rest of the day only');
    if (a.start_date) kv(dl, 'Started', X.dayText(a.start_date) + (a.stats && a.stats.td ? ' · ' + a.stats.td + ' trading day' + (a.stats.td === 1 ? '' : 's') : ''));
    box.appendChild(dl);
    // the rules right now
    const rs = section(box, 'MFFU rules right now · ' + summaryOf(a.rules), true, 'rules-sec');
    rs.appendChild(rulesList(a.rules, now));
    // today's trades + the newest ones
    const ts = section(box, 'Trades today' + (a.today.length ? ' · ' + a.today.length + ' closed · ' + sgn(a.today_closed, true) : a.position ? ' · 1 open, none closed' : ' · none yet')
      + (a.position && a.today.length ? ' · 1 open' : ''), a.today.length > 0, 'trades-sec');
    if (a.today.length) { const ul = el('ul', 'trades'); for (const x of a.today) ul.appendChild(tradeLine(x, now)); ts.appendChild(ul); }
    else ts.appendChild(el('p', 'note', 'No trade in this session yet (MFFU\'s day runs 6:00 PM to 4:10 PM ET).'));
    const older = a.recent.filter((x) => a.today.indexOf(x) < 0);
    if (older.length) { ts.appendChild(el('p', 'note', 'Before today:')); const ul = el('ul', 'trades'); for (const x of older) ul.appendChild(tradeLine(x, now)); ts.appendChild(ul); }
    ts.appendChild(el('p', 'note', 'Trades ' + asof(a.trades_t, now)));
    // MFFU's stats dashboard
    const s = a.stats, ss = section(box, 'Stats (like MFFU\'s dashboard)', false, 'stats-sec');
    if (s) {
      const g = el('dl', 'kv2');
      kv(g, 'Trades', s.n + (s.n ? ' · win rate ' + s.win_pct + '% (' + s.w + ' won)' : ''));
      kv(g, 'Profit factor', s.pf != null ? s.pf.toFixed(2) : s.n ? 'no losing or no winning trade yet' : '-');
      kv(g, 'Average win / loss', (s.aw != null ? '+' + usd(s.aw) : '-') + ' / ' + (s.al != null ? usd(s.al) : '-'));
      kv(g, 'Best / worst trade', (s.bt != null ? sgn(s.bt) : '-') + ' / ' + (s.wt != null ? sgn(s.wt) : '-'));
      kv(g, 'Best day', s.bd ? sgn(s.bd[1]) + ' · ' + X.dayText(s.bd[0]) : '-', null, s.bd && s.bd[1] > 0 ? 'pos' : null);
      kv(g, 'Worst day', s.wd ? sgn(s.wd[1]) + ' · ' + X.dayText(s.wd[0]) : '-', null, s.wd && s.wd[1] < 0 ? 'neg' : null);
      kv(g, 'Contracts traded', s.ct != null ? s.ct + ' micros' : '-');
      kv(g, 'Trading days', String(s.td) + (a.last_trade ? ' · last ' + X.dayText(a.last_trade, true) : ''));
      ss.appendChild(g);
      ss.appendChild(el('p', 'note', 'From the bot\'s own ledger ' + asof(s.t, now) + '. MFFU also counts trades the bot did not place.'));
    } else ss.appendChild(el('p', 'note', 'The stats come with the PC\'s next update (its "mf" post).'));
    if (a.equity.length >= 2) { ss.appendChild(equity(a.equity)); ss.appendChild(el('p', 'note', 'P&L at each day\'s close')); }
    return box;
  }

  function watch(rules) {
    const b = rules.find((x) => x.state === 'broken'), c = rules.find((x) => x.state === 'close');
    return b ? 'BROKEN: ' + b.label : c ? 'watch: ' + c.label : 'rules OK';
  }

  function summaryOf(rules) {
    const n = (k) => rules.filter((r) => r.state === k).length;
    const b = n('broken'), c = n('close');
    return b ? b + ' broken' + (c ? ', ' + c + ' close' : '') : c ? c + ' close, the rest OK' : 'all OK';
  }

  // the top card: every account in one line each + open trades + the newest trades (which account)
  // night-seedata 2026-11-23: the first screen says what a trader needs per account: $ to pass (an eval) / $ to the payout (funded)
  function goalBit(a) {
    if (a.target && a.target.left != null) return a.target.left > 0 ? ' · ' + usd(a.target.left) + ' to pass' : ' · target reached';
    const c = a.payout && a.payout.coach;
    if (c && c.request_today > 0) return ' · payout ready ' + usd(c.request_today);
    if (c && c.need_more > 0) return ' · ' + usd(c.need_more) + ' to the payout';
    return '';
  }

  // the next payout $ and date (business/payday.json: tools/money/payday_plan.py, 1,000 simulated runs, Jul-Oct-like market)
  function nextPayout(pd) {
    const acc = pd && pd.rows && pd.rows.H2 && pd.rows.H2.accounts;
    if (!acc) return '';
    const best = Object.values(acc).filter((x) => x && x.first_pay_med && x.first_pay_usd).sort((x, y) => String(x.first_pay_med).localeCompare(String(y.first_pay_med)))[0];
    if (!best) return '';
    const d = new Date(best.first_pay_med + 'T12:00:00');
    const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return 'Next payout: ' + String(best.name || '').replace(/ \((eval|funded)\)/, '') + ' about ' + usd(best.first_pay_usd) + ' to you, most likely ' + day
      + ' (an estimate from ' + (pd.date || 'the plan') + ', not a promise)';
  }

  // MONEY VIEW (day-site5): the 'to pass / to payout' gauge + its forecast, when the account can next ask for a payout, $ from the floor (red under $300)
  function moneyView(a, now) {
    const V = window.MONEY_VIEW; if (!V) return null;
    const P = window.MFFU_PAGE || {}, g = V.gauge(a, { today: todayET(now), forecast: P.forecast, payday: P.payday }), f = V.floor(a);
    const box = el('div', 'mv'); box.dataset.key = a.key;
    if (g) {
      const w = el('div', 'mv-g ' + g.kind); w.dataset.kind = g.kind;
      const h = el('div', 'mv-h'); h.appendChild(el('span', 'mv-l', g.label)); h.appendChild(el('b', 'mv-t' + (g.eligible ? ' pos' : ''), g.text)); w.appendChild(h);
      const b = el('div', 'mv-bar'); const i = el('i'); i.style.width = Math.round(g.frac * 100) + '%'; b.appendChild(i); b.setAttribute('role', 'img');
      b.setAttribute('aria-label', g.label + ': ' + Math.round(g.frac * 100) + '%'); w.appendChild(b);
      if (g.sub) w.appendChild(el('small', 'mv-s', g.sub));
      if (g.next) { const n = el('p', 'mv-next' + (g.next.today ? ' pos' : '')); n.textContent = g.next.text; w.appendChild(n); }
      if (g.forecast) { const fc = el('p', 'mv-fc'); fc.appendChild(el('b', null, g.forecast.line)); fc.appendChild(el('small', null, (g.forecast.sample ? 'SAMPLE · ' : '') + g.forecast.src + ' · an estimate, not a promise')); w.appendChild(fc); }
      else w.appendChild(el('p', 'mv-fc', 'No forecast for this account yet.'));
      box.appendChild(w);
    }
    const r = el('div', 'mv-f ' + f.level); r.dataset.level = f.level;
    const h = el('div', 'mv-h'); h.appendChild(el('span', 'mv-l', 'Risk distance')); h.appendChild(el('b', 'mv-t', f.text)); r.appendChild(h);
    const b = el('div', 'mv-bar'); const i = el('i'); i.style.width = Math.round((f.frac || 0) * 100) + '%'; b.appendChild(i); r.appendChild(b);
    if (f.sub) r.appendChild(el('small', 'mv-s', f.sub.replace(/^ · /, '')));
    box.appendChild(r);
    return box;
  }

  function nowCard(r, now) {
    const box = $('now'); box.textContent = '';
    box.appendChild(el('h2', null, 'Right now'));
    const ul = el('ul', 'acct-list');
    for (const a of r.accounts) {
      const li = el('li');
      const link = el('a', 'acct-row');
      link.href = '#acct-' + a.key;
      link.appendChild(el('b', null, a.name));
      link.appendChild(el('span', 'mf-st ' + a.chip.cls, a.chip.text));
      const ln = (a.money.balance != null ? usd(a.money.balance, true) : 'no balance yet') + ' · today ' + sgn(a.money.today, true)
        + (a.position ? ' · ' + a.position.side + ' ' + a.position.qty + ' open' + (a.position.pnl_usd != null ? ' ' + sgn(a.position.pnl_usd, true) : '') : '')
        + goalBit(a) + (a.money.room != null ? ' · room ' + usd(a.money.room) : '')
        + (a.armed === true ? ' · armed' : a.armed === false ? ' · NOT armed' : '') + (a.running === false ? ' · bot OFF' : '')
        + ' · ' + watch(a.rules);
      link.appendChild(el('span', 'acct-line', ln));
      li.appendChild(link);
      ul.appendChild(li);
    }
    box.appendChild(ul);
    const np = nextPayout(r.payday || (window.MFFU_PAGE && window.MFFU_PAGE.payday));
    if (np) box.appendChild(el('p', 'mf-next', np));
    box.appendChild(el('p', 'mf-day', r.day.text));
    const known = r.feed.kind === 'live' || r.feed.kind === 'old';
    const h = el('h3', null, !known ? 'Open trades: unknown without the PC feed' : (r.open.length ? 'Open trades' : 'Open trades: none')
      + (r.feed.kind === 'old' ? ' (at the last report)' : ''));
    box.appendChild(h);
    if (r.open.length) { const o = el('ul', 'trades'); for (const x of r.open) o.appendChild(tradeLine({ ...x, open: true }, now, true)); box.appendChild(o); }
    if (r.latest.length) {
      box.appendChild(el('h3', null, 'Newest trades'));
      const o = el('ul', 'trades');
      for (const x of r.latest.slice(0, 3)) o.appendChild(tradeLine(x, now, true));
      box.appendChild(o);
    }
    const dec = r.decoder.map((d) => '…' + d[0] + ' = ' + d[1]).join(' · ');
    box.appendChild(el('p', 'note', 'Every entry on a real account also pushes to your phone at once (the ntfy app).' + (dec ? ' Which account is which: ' + dec + '.' : '')));
  }

  async function load() {
    const [plan, board, home, payday, forecast] = await Promise.all([getJSON('accounts.json'), getJSON('../board/board.json'), getJSON('../home.json'), getJSON('payday.json'), getJSON('forecast.json')]);
    window.MFFU_PAGE.payday = payday; window.MFFU_PAGE.forecast = forecast;
    let lite = null;
    try { if (window.PC_FEED) lite = await window.PC_FEED.fetchLatest({ feedUrl: '../status_feed.json' }); } catch (e) { /* none */ }   // the site root's feed (no 404 for business/status_feed.json)
    try { if (window.EDGE_CHIP) window.EDGE_CHIP.update(lite); } catch (e) { /* never the page */ }
    const now = nowS();
    const r = X.center({ lite, plan, board, home, coach: window.PAYOUT_COACH, today: todayET(now), M }, now);
    const st = $('status');
    st.textContent = r.feed.text;
    st.className = 'note feed ' + r.feed.kind;
    nowCard(r, now);
    const list = $('list'); list.textContent = '';
    for (const a of r.accounts) list.appendChild(card(a, now));
    const ul = $('planned'); ul.textContent = '';
    for (const p of r.planned) {
      const li = el('li');
      li.appendChild(el('b', null, p.name + ' · ' + p.plan + (p.cost ? ' · ' + p.cost : '') + ' · PLAN'));
      if (p.rules) li.appendChild(el('small', null, p.rules));
      ul.appendChild(li);
    }
    $('plannedBox').hidden = !r.planned.length;
    $('foot').textContent = 'Read only: nothing here trades or requests a payout (you request payouts in the MFFU dashboard). Plan updated ' + ((plan && plan.updated) || '?')
      + '. Page drawn ' + X.clock(now) + ' ET.';
    window.MFFU_PAGE.last = r;
    window.MFFU_PAGE.ready = true;
  }

  window.MFFU_PAGE = { load, last: null, ready: false, payday: null, forecast: null };
  document.addEventListener('DOMContentLoaded', () => {
    $('refresh').addEventListener('click', load);
    load();
    setInterval(() => { if (!document.hidden) load(); }, 120000);
  });
})();
