// Scorecard (2026-11-03 night quest, owner: "make Zenith the best trading dashboard there is"; read-only). ONE renderer for
// both apps: tools/web_public/procore.js = web_next/js/next/procore.js (byte-identical). Classic script: window.ProUI.
// What the best journals have (TradeZella, Tradervue, Edgewonk, TraderSync, prop-firm trackers; docs/ZENITH_COMPARISON.md)
// and Zenith did not, from the trades the apps already load:
//   score     Zenith score 0-100 (six axes: win rate, profit factor, payoff, recovery, green weeks, drawdown vs the MFFU
//             max loss), expectancy $ and R per trade, SQN, streaks, hold time, R distribution with $ per bucket, share card
//   pace      eval pace on the real accounts: progress ring, $ to go, $ needed per session vs the bot's own $ per session,
//             the sessions it should take, losses in a row the room can take, the research odds
//   risk      underwater curve ($ below the last high) against the MFFU $2,000 max loss and the $1,000 daily limit,
//             longest drawdown, worst day / week / losing run in $, quick eval odds (day resample)
//   playbook  the LIT rules as a checklist + one card per level family: trades, win %, expectancy $, $ a month, grade
//   sim       "what if" sizing: 0.25x-2x of today's size -> net $, $ a month, max drawdown, worst day, eval pass / fail odds
//   tags      $ by journal tag (tags are set in Trades > Journal, kept on this device only)
// Every R figure carries its $ and $ a month (owner rule). Paper only: nothing here talks to the bot or changes a setting.
// Input M (ProUI.model): { now, span, mult, trades: data.json trades (backtest, live settings), real: board trades,
// periods: results.periods, board: the live board (lit / atlas blocks, progress), tags: { tradeId: [tag] } }.
(function () {
  'use strict';
  const V = 1;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n = (v) => (v == null || v === '' || typeof v === 'boolean' ? NaN : +v);
  const ok = (v) => Number.isFinite(n(v));
  const arr = (a) => (Array.isArray(a) ? a : []);
  const obj = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? o : null);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const usd = (v, sign) => { const x = n(v); if (!Number.isFinite(x)) return '—'; const s = '$' + Math.abs(Math.round(x)).toLocaleString('en-US'); return sign ? (x > 0.5 ? '+' : x < -0.5 ? '−' : '') + s : (x < -0.5 ? '−' : '') + s; };
  const fr = (v, d = 2) => (ok(v) ? (n(v) > 0 ? '+' : n(v) < 0 ? '−' : '') + Math.abs(n(v)).toFixed(d) + 'R' : '—');
  const pc = (v, d = 0) => (ok(v) ? n(v).toFixed(d) + '%' : '—');
  const num = (v, d = 2) => (ok(v) ? n(v).toFixed(d) : '—');
  const usdK = (v) => (ok(v) && Math.abs(n(v)) >= 9999.5 ? (n(v) > 0 ? '+' : '−') + '$' + (Math.abs(n(v)) / 1000).toFixed(1) + 'K' : usd(v, true));   // tight columns
  const cls = (v) => (n(v) > 0.5 ? 'up' : n(v) < -0.5 ? 'dn' : '');
  const sum = (a, f) => a.reduce((s, x) => s + (f ? f(x) : x), 0);
  const st = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private window */ } } };
  const RULES = { target: 3000, mll: 2000, lock: 100, dll: 1000, sessions: 10, sessions_max: 15 };   // MFFU Builder 50K
  const SPANS = [['2026', '2026'], ['H2', 'H2 · check'], ['H1', 'H1 · picked'], ['2021-25', '2021-25'], ['real', 'Real']];
  const PERIOD_OF = { '2026': '2026 YTD', H1: '2026 H1 (picked on)', H2: '2026 H2 (check)', '2021-25': '2021-25 (reference)' };
  const PARTS = [['score', 'Score'], ['pace', 'Eval pace'], ['risk', 'Risk'], ['playbook', 'Playbook'], ['sim', 'What if'], ['tags', 'Tags']];
  const inSpan = (sp, d) => (sp === '2026' ? d >= '2026' : sp === 'H1' ? d >= '2026' && d <= '2026-06-30' : sp === 'H2' ? d >= '2026-07-01' : sp === '2021-25' ? d < '2026' : true);
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const wday = (d) => new Date(`${d}T12:00:00Z`).getUTCDay();
  const addDays = (d, k) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + k); return x.toISOString().slice(0, 10); };
  function weekdays(a, b) { if (!a || !b || a > b) return 0; let c = 0, d = a, i = 0; while (d <= b && i++ < 4000) { const w = wday(d); if (w > 0 && w < 6) c++; d = addDays(d, 1); } return c; }
  const weekOf = (d) => addDays(d, -((wday(d) + 6) % 7));
  const etDay = (t) => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(t * 1000)); } catch (e) { return new Date(t * 1000).toISOString().slice(0, 10); } };
  const etHour = (t) => { try { return +new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hourCycle: 'h23' }).format(new Date(t * 1000)) % 24; } catch (e) { return NaN; } };
  const tid = (t) => `${t.day || ''}_${t.entry_t || t.time || ''}`;        // = hub.js journal note / tag id
  const LV = { bu: 'Build-up (equal highs / lows)', asia18: 'Asia 18-19', asia19: 'Asia 19-20', asia20: 'Asia 20-00', lon23: 'Frankfurt 02-03', lon25: 'London 02-05',
    lon34: 'London 03-04', pre: 'Premarket', ny89: 'NY 08-09', ny830: 'NY 08:30', ny930: 'NY 09:30 open', ny9301030: 'NY 09:30-10:30', pd: 'Prior day high / low',
    pw: 'Prior week high / low', pm: 'NY PM', nwog: 'New-week opening gap', ndog: 'New-day opening gap' };
  const FAM = [['asia', 'Asia range', /^asia/, 'The Asia session high or low (18:00-00:00 ET) is swept in London or New York.'],
    ['london', 'London / Frankfurt', /^lon/, 'The Frankfurt or London hour\'s high or low (02:00-05:00 ET) is swept.'],
    ['ny', 'New York open', /^ny/, 'A New York opening range (08:00-10:30 ET) is swept.'],
    ['htf', 'Prior day / week', /^(pd|pw)$/, 'Yesterday\'s or last week\'s high or low is swept: the big pools.'],
    ['gap', 'Opening gaps', /^(nwog|ndog)$/, 'A new-week or new-day opening gap edge is swept.'],
    ['pre', 'Premarket / PM', /^(pre|pm)$/, 'The premarket (04:00-09:30) or PM range is swept.']];

  // ------------------------------------------------------------------ trades in, one shape out
  function norm(t, src) {
    if (!obj(t)) return null;
    const usdv = ok(t.pnl) ? +t.pnl : ok(t.usd) ? +t.usd : NaN;
    const rv = ok(t.r) ? +t.r : ok(t.pnl_r) ? +t.pnl_r : NaN;     // the PC replay (lit_backtest): pnl_r, exit_reason, swept
    if (!ok(usdv) && !ok(rv)) return null;
    if (t.open === true) return null;
    const e0 = n(t.entry_t), e1 = n(t.exit_t);
    const day = String(t.day || (ok(e0) ? etDay(e0) : '')).slice(0, 10);
    if (!day) return null;
    return { id: tid(t), day, t0: ok(e0) ? e0 : null, t1: ok(e1) ? e1 : null, r: rv, usd: ok(usdv) ? usdv : 0, side: t.side || '', exit: String(t.exit || t.exit_reason || ''),
      lv: arr(t.lv).length ? arr(t.lv) : arr(t.swept).map((c) => String(c).replace(/_[hl]$/, '')),
      hold: ok(e0) && ok(e1) && e1 >= e0 ? (e1 - e0) / 60 : null, acct: t.acct || 'lit', src: src || t.src || 'backtest' };
  }
  const isWin = (t) => (ok(t.r) ? t.r > 0.1 : t.usd > 5);
  const isLoss = (t) => (ok(t.r) ? t.r < -0.1 : t.usd < -5);

  // ------------------------------------------------------------------ the numbers
  function months(T, span, periods, now) {
    const P = obj(periods) && obj(periods[PERIOD_OF[span]]);
    if (P && ok(P.net) && ok(P.per_month) && Math.abs(P.per_month) > 0.5 && Math.abs(P.net) > 1) return Math.max(0.25, P.net / P.per_month);
    if (!T.length) return 1;
    const a = T[0].day, b = span === 'real' && ok(now) ? etDay(now) : T[T.length - 1].day;
    return Math.max(0.25, weekdays(a, b) / 21);
  }
  function sessionsOf(T, span, periods, now) {
    const P = obj(periods) && obj(periods[PERIOD_OF[span]]);
    if (P && P.from && P.to) return Math.max(1, weekdays(P.from, P.to));
    if (!T.length) return 1;
    return Math.max(1, weekdays(T[0].day, span === 'real' && ok(now) ? etDay(now) : T[T.length - 1].day));
  }
  function stats(T, mo, sessions) {
    const N = T.length, W = T.filter(isWin), L = T.filter(isLoss);
    const gw = sum(W, (t) => t.usd), gl = -sum(L, (t) => t.usd), net = sum(T, (t) => t.usd);
    const R = T.filter((t) => ok(t.r)).map((t) => t.r), mR = R.length ? sum(R) / R.length : NaN;
    const sdR = R.length > 1 ? Math.sqrt(sum(R, (r) => (r - mR) ** 2) / (R.length - 1)) : NaN;
    // equity, drawdown (closed trades, in time order)
    let eq = 0, pk = 0, mdd = 0, mddDay = null, longest = 0, curStart = null;
    const curve = [];
    for (const t of T) {
      eq += t.usd;
      if (eq >= pk) { if (curStart) { const len = weekdays(curStart, t.day); if (len > longest) longest = len; } pk = eq; curStart = null; }
      else if (!curStart) curStart = t.day;
      const dd = eq - pk; if (dd < mdd) { mdd = dd; mddDay = t.day; }
      curve.push({ day: t.day, eq, dd });
    }
    if (curStart && T.length) longest = Math.max(longest, weekdays(curStart, T[T.length - 1].day));
    // days, weeks
    const days = new Map(), weeks = new Map();
    for (const t of T) { days.set(t.day, (days.get(t.day) || 0) + t.usd); const w = weekOf(t.day); weeks.set(w, (weeks.get(w) || 0) + t.usd); }
    const dv = [...days.values()], wv = [...weeks.values()];
    // streaks (in $ too)
    let rw = 0, rl = 0, bw = 0, bl = 0, runL = 0, worstRun = 0, cur = 0, curK = '';
    for (const t of T) {
      const k = isWin(t) ? 'w' : isLoss(t) ? 'l' : 'b';
      if (k === 'w') { rw++; rl = 0; runL = 0; } else if (k === 'l') { rl++; rw = 0; runL += t.usd; worstRun = Math.min(worstRun, runL); } else { runL += t.usd; }
      bw = Math.max(bw, rw); bl = Math.max(bl, rl);
      if (k === curK) cur++; else { curK = k; cur = 1; }
    }
    const holds = T.map((t) => t.hold).filter(ok).sort((a, b) => a - b);
    const best = T.reduce((b, t) => (!b || t.usd > b.usd ? t : b), null), worst = T.reduce((b, t) => (!b || t.usd < b.usd ? t : b), null);
    const bestDay = dv.length ? Math.max(...dv) : 0;
    return { n: N, wins: W.length, losses: L.length, be: N - W.length - L.length, win: N ? (100 * W.length) / N : NaN, winX: W.length + L.length ? (100 * W.length) / (W.length + L.length) : NaN, net, gw, gl,
      pf: gl > 0 ? gw / gl : gw > 0 ? Infinity : NaN, avgW: W.length ? gw / W.length : NaN, avgL: L.length ? -gl / L.length : NaN,
      payoff: W.length && L.length ? gw / W.length / (gl / L.length) : NaN, exp: N ? net / N : NaN, expR: mR,
      avgWR: W.length ? sum(W.filter((t) => ok(t.r)), (t) => t.r) / W.length : NaN, avgLR: L.length ? sum(L.filter((t) => ok(t.r)), (t) => t.r) / L.length : NaN,
      sqn: R.length > 1 && sdR > 0 ? (Math.sqrt(Math.min(100, R.length)) * mR) / sdR : NaN,
      mdd, mddDay, longestDD: longest, recov: mdd < 0 ? net / -mdd : net > 0 ? Infinity : NaN, curve,
      mo, perMo: net / Math.max(0.25, mo), sessions, perSession: net / Math.max(1, sessions), perWeek: N / Math.max(0.2, sessions / 5),
      days: days.size, worstDay: dv.length ? Math.min(...dv) : 0, bestDay, worstWeek: wv.length ? Math.min(...wv) : 0, bestWeek: wv.length ? Math.max(...wv) : 0,
      greenWeeks: wv.length ? (100 * wv.filter((v) => v > 0).length) / wv.length : NaN, weeks: wv.length,
      dllHits: dv.filter((v) => v <= -RULES.dll).length, bestDayShare: net > 0 ? (100 * bestDay) / net : NaN,
      bw, bl, cur, curK, worstRun, holdMed: holds.length ? holds[holds.length >> 1] : NaN, best, worst };
  }
  // Zenith score: six axes, each 0-100 on a fixed scale (so a better system always scores higher), the score = their mean
  const lin = (v, a, b) => (ok(v) ? clamp((100 * (v - a)) / (b - a), 0, 100) : 0);
  function score(S, mult = 1) {
    if (!S || S.n < 5) return null;
    const ax = [
      ['Win rate', lin(S.winX, 25, 60), pc(S.winX), 'winners vs losers, breakevens left out; LIT wins big, so 35-45% is healthy'],
      ['Profit factor', lin(S.pf === Infinity ? 5 : S.pf, 1, 3), S.pf === Infinity ? '∞' : num(S.pf), '$ won per $ lost: 1 = break-even, 3 = excellent'],
      ['Payoff', lin(S.payoff, 1, 4), num(S.payoff, 1) + 'x', 'the average winner vs the average loser in $'],
      ['Recovery', lin(S.recov === Infinity ? 10 : S.recov, 0, 6), S.recov === Infinity ? '∞' : num(S.recov, 1) + 'x', 'net $ divided by the worst drawdown'],
      ['Green weeks', lin(S.greenWeeks, 30, 75), pc(S.greenWeeks), 'weeks that ended up (weeks with a trade)'],
      ['DD safety', lin(RULES.mll + S.mdd * mult, 0, RULES.mll), usd(S.mdd * mult), 'worst drawdown vs the MFFU $2,000 max loss'],
    ];
    const v = Math.round(sum(ax, (a) => a[1]) / ax.length);
    const g = v >= 80 ? 'A' : v >= 65 ? 'B' : v >= 50 ? 'C' : v >= 35 ? 'D' : 'F';
    return { v, g, ax };
  }
  // quick eval odds: sessions drawn at random from the span (days without a trade = $0), the MFFU Builder 50K rules
  // (EOD trailing $2,000 max loss that stops at +$100, $3,000 target); fixed seed = the same numbers every time
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e9) / 1e9; }; }
  function evalSim(T, sessions, mult = 1, N = 1500, R = RULES) {
    const days = new Map(); for (const t of T) days.set(t.day, (days.get(t.day) || 0) + t.usd * mult);
    const pool = [...days.values()]; while (pool.length < sessions) pool.push(0);
    if (!days.size) return null;
    const r = rng(20261103 + Math.round(mult * 100)), L = pool.length;
    let p10 = 0, f10 = 0, p15 = 0, f15 = 0; const passAt = [];
    for (let i = 0; i < N; i++) {
      let bal = 0, pk = 0, floor = -R.mll, res = 0;
      for (let s = 1; s <= R.sessions_max; s++) {
        bal += pool[Math.floor(r() * L)];
        if (bal <= floor) { res = -s; break; }
        if (bal >= R.target) { res = s; break; }
        if (bal > pk) { pk = bal; floor = Math.min(R.lock, pk - R.mll); }
      }
      if (res > 0) { passAt.push(res); if (res <= R.sessions) p10++; p15++; } else if (res < 0) { if (-res <= R.sessions) f10++; f15++; }
    }
    passAt.sort((a, b) => a - b);
    return { p10: (100 * p10) / N, f10: (100 * f10) / N, p15: (100 * p15) / N, f15: (100 * f15) / N, med: passAt.length ? passAt[passAt.length >> 1] : null, N };
  }

  // ------------------------------------------------------------------ the model
  function model(I) {
    I = obj(I) || {};
    const span = SPANS.some((s) => s[0] === I.span) ? I.span : '2026';
    const mult = ok(I.mult) ? clamp(+I.mult, 0.25, 2) : 1;
    const bt = arr(I.trades).map((t) => norm(t, 'backtest')).filter(Boolean);
    const real = arr(I.real).filter((t) => t && t.src === 'live' && (!t.acct || t.acct === 'lit')).map((t) => norm(t, 'real')).filter(Boolean);
    const byT = (a, b) => (a.t0 || 0) - (b.t0 || 0) || (a.day < b.day ? -1 : a.day > b.day ? 1 : 0);
    bt.sort(byT); real.sort(byT);
    const T = span === 'real' ? real : bt.filter((t) => inSpan(span, t.day));
    const mo = months(T, span, I.periods, I.now), ses = sessionsOf(T, span, I.periods, I.now);
    const S = stats(T, mo, ses);
    const h2 = bt.filter((t) => inSpan('H2', t.day)), S2 = h2.length ? stats(h2, months(h2, 'H2', I.periods), sessionsOf(h2, 'H2', I.periods)) : null;
    const tags = obj(I.tags) || {};
    return { v: V, now: ok(I.now) ? +I.now : Date.now() / 1000, span, mult, T, bt, real, S, S2, sc: score(S), sc2: S2 ? score(S2) : null, ses,
      board: obj(I.board), tags, periods: obj(I.periods) || {} };
  }

  // ------------------------------------------------------------------ small parts
  const card = (id, title, meta, body, k) => `<section class="pr-card ${k || ''}" id="pr-${id}"><div class="pr-h"><h3>${title}</h3>${meta ? `<span class="pr-meta">${meta}</span>` : ''}</div>${body}</section>`;
  const goA = (o, id, arg) => (o && typeof o.go === 'function' ? o.go(id, arg) : `data-go="${esc(id)}"${arg ? ` data-arg="${esc(arg)}"` : ''}`);
  const tile = (label, big, sub, k) => `<div class="pr-tile ${k || ''}"><span>${label}</span><b>${big}</b>${sub ? `<em>${sub}</em>` : ''}</div>`;
  const cnt = (v, sign) => `<span data-pr-count="${ok(v) ? Math.round(n(v)) : ''}" data-sign="${sign ? 1 : 0}">${usd(v, sign)}</span>`;
  const spanLabel = (sp) => (SPANS.find((s) => s[0] === sp) || ['', sp])[1];
  const srcNote = (M) => (M.span === 'real' ? 'real fills on the 50K (NinjaTrader), closed trades only' : `backtest, live settings, costs in · ${esc(spanLabel(M.span))}${M.span === '2021-25' ? ' (reference)' : ''}`);
  function ring(p, size, stroke, col, inner, k) {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r, f = clamp(ok(p) ? p : 0, 0, 1);
    return `<svg class="pr-ring ${k || ''}" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${Math.round(f * 100)}%"><defs><linearGradient id="prg${k || ''}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${col[0]}"/><stop offset="1" stop-color="${col[1]}"/></linearGradient></defs>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(148,163,184,.14)" stroke-width="${stroke}"/>
      <circle class="pr-arc" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="url(#prg${k || ''})" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" style="--len:${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
      ${inner || ''}</svg>`;
  }
  const gradeCol = (g) => ({ A: ['#2ee59d', '#3ee0c8'], B: ['#4f9bff', '#3ee0c8'], C: ['#ffd166', '#ff9a3d'], D: ['#ff9a3d', '#ff5a7a'], F: ['#ff5a7a', '#b388ff'] }[g] || ['#4f9bff', '#b388ff']);
  function radar(sc, size = 300) {
    const cx = size / 2, cy = size / 2, R = 78, k = sc.ax.length;
    const pt = (i, v) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / k; return [cx + Math.cos(a) * R * v, cy + Math.sin(a) * R * v]; };
    const poly = (v) => sc.ax.map((_, i) => pt(i, v).map((x) => x.toFixed(1)).join(',')).join(' ');
    const shape = sc.ax.map((a, i) => pt(i, Math.max(0.04, a[1] / 100)).map((x) => x.toFixed(1)).join(',')).join(' ');
    return `<svg class="pr-radar" viewBox="0 ${cy - R * 1.16 - 18} ${size} ${R * 2.32 + 40}" style="aspect-ratio:${size}/${(R * 2.32 + 40).toFixed(1)}" role="img" aria-label="Zenith score axes">
      ${[0.25, 0.5, 0.75, 1].map((v) => `<polygon points="${poly(v)}" fill="none" stroke="rgba(150,175,255,${v === 1 ? 0.28 : 0.12})"/>`).join('')}
      ${sc.ax.map((_, i) => { const [x, y] = pt(i, 1); return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(150,175,255,.12)"/>`; }).join('')}
      <polygon class="pr-shape" points="${shape}" fill="url(#prRad)" stroke="#7dd3fc" stroke-width="2" stroke-linejoin="round"/>
      <defs><radialGradient id="prRad"><stop offset="0" stop-color="rgba(79,155,255,.15)"/><stop offset="1" stop-color="rgba(62,224,200,.42)"/></radialGradient></defs>
      ${sc.ax.map((a, i) => { const [x, y] = pt(i, Math.max(0.04, a[1] / 100)); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="#e6f6ff"/>`; }).join('')}
      ${sc.ax.map((a, i) => { const [x, y] = pt(i, 1.16); const anc = x < cx - 8 ? 'end' : x > cx + 8 ? 'start' : 'middle'; return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anc}" class="pr-rl"><tspan x="${x.toFixed(1)}" dy="-2">${esc(a[0])}</tspan><tspan x="${x.toFixed(1)}" dy="13" class="pr-rv">${esc(a[2])}</tspan></text>`; }).join('')}
    </svg>`;
  }
  function bars(rows, o) {     // rows: [{label, v ($), n, sub}] -> horizontal $ bars, green / red
    o = o || {};
    if (!rows.length) return `<p class="pr-mut">${esc(o.empty || 'Nothing in this span.')}</p>`;
    const mx = Math.max(1, ...rows.map((r) => Math.abs(r.v)));
    return `<ul class="pr-bars">${rows.map((r) => `<li><span class="pr-bl">${esc(r.label)}${r.n != null ? `<em>${r.n} trade${r.n === 1 ? '' : 's'}</em>` : ''}</span>
      <span class="pr-bt"><i class="${r.v >= 0 ? 'g' : 'r'}" style="width:${((50 * Math.abs(r.v)) / mx).toFixed(1)}%;${r.v >= 0 ? 'left:50%' : `right:50%`}"></i></span>
      <span class="pr-bv ${cls(r.v)}">${usd(r.v, true)}${r.sub ? `<em>${esc(r.sub)}</em>` : ''}</span></li>`).join('')}</ul>`;
  }
  function spanBar(M) {
    return `<div class="pr-seg" role="tablist" aria-label="Which trades">${SPANS.map(([k, l]) => `<button type="button" role="tab" data-pr-span="${k}" aria-selected="${k === M.span}" class="${k === M.span ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`;
  }
  function partBar(part, o) {
    return `<nav class="pr-parts" aria-label="Scorecard sections">${PARTS.map(([k, l]) => `<button type="button" ${goA(o, 'pro', k)} class="${k === part ? 'on' : ''}" aria-current="${k === part ? 'page' : 'false'}">${esc(l)}</button>`).join('')}</nav>`;
  }

  // ------------------------------------------------------------------ Score
  function scoreHero(M, o) {
    const S = M.S, sc = M.sc;
    if (!sc) return card('score', 'Zenith score', esc(spanLabel(M.span)), `<p class="pr-mut">Needs at least 5 closed trades in this span (${S.n} now).${M.span === 'real' ? ' Real trades start counting with the first closed fill on the 50K.' : ''}</p>`);
    const col = gradeCol(sc.g);
    const inner = `<text x="80" y="76" text-anchor="middle" class="pr-sv" data-pr-count="${sc.v}" data-plain="1">${sc.v}</text><text x="80" y="102" text-anchor="middle" class="pr-sg">grade ${sc.g}</text>`;
    return `<section class="pr-card pr-hero" id="pr-score" style="--g1:${col[0]};--g2:${col[1]}"><div class="pr-orbit" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="pr-hero-g">${ring(sc.v / 100, 160, 12, col, inner, 'big')}
        <div class="pr-hero-t"><span class="pr-eye">Zenith score · ${esc(spanLabel(M.span))}</span>
          <b class="pr-hero-n ${cls(S.exp)}">${cnt(S.exp, true)}<small> / trade</small></b>
          <span class="pr-hero-s">${fr(S.expR)} expectancy · <b class="${cls(S.perMo)}">${usd(S.perMo, true)}</b> a month</span>
          <span class="pr-hero-s">${S.n} trades · net <b class="${cls(S.net)}">${usd(S.net, true)}</b> · PF ${S.pf === Infinity ? '∞' : num(S.pf)}</span></div></div>
      ${radar(sc)}
      <ul class="pr-axes">${sc.ax.map((a) => `<li><span>${esc(a[0])}</span><i><b style="width:${a[1].toFixed(0)}%"></b></i><em>${esc(a[2])}</em><small>${esc(a[3])}</small></li>`).join('')}</ul>
      <p class="pr-mut">Six axes on fixed scales (0 = weak, 100 = excellent); the score is their average. ${srcNote(M)}.</p>
      <div class="pr-acts"><button type="button" class="pr-btn" data-pr-share>Share my scorecard</button>${M.span !== 'H2' && M.sc2 ? `<button type="button" class="pr-btn ghost" data-pr-span="H2">H2 check: ${M.sc2.v} (${M.sc2.g})</button>` : ''}</div></section>`;
  }
  function keyStats(M) {
    const S = M.S;
    if (!S.n) return '';
    const sqnT = !ok(S.sqn) ? '' : S.sqn >= 3 ? 'excellent' : S.sqn >= 2 ? 'good' : S.sqn >= 1.6 ? 'average' : 'below average';
    const body = `<div class="pr-grid">
      ${tile('Expectancy', `<span class="${cls(S.exp)}">${usd(S.exp, true)}</span>`, `${fr(S.expR)} per trade`)}
      ${tile('$ a month', `<span class="${cls(S.perMo)}">${cnt(S.perMo, true)}</span>`, `${num(S.mo, 1)} months · ${num(S.perWeek, 1)} trades / week`)}
      ${tile('Win rate', pc(S.winX), `${S.wins} W · ${S.losses} L · ${S.be} BE (${pc(S.win)} of all)`)}
      ${tile('Profit factor', S.pf === Infinity ? '∞' : num(S.pf), `won ${usd(S.gw)} · lost ${usd(S.gl)}`)}
      ${tile('Avg winner', `<span class="up">${usd(S.avgW, true)}</span>`, fr(S.avgWR))}
      ${tile('Avg loser', `<span class="dn">${usd(S.avgL, true)}</span>`, fr(S.avgLR))}
      ${tile('Max drawdown', `<span class="dn">${usd(S.mdd, true)}</span>`, `${pc((100 * -S.mdd) / RULES.mll)} of the $2,000 max loss`)}
      ${tile('Recovery factor', S.recov === Infinity ? '∞' : num(S.recov, 1) + 'x', 'net $ / worst drawdown')}
      ${tile('SQN', num(S.sqn, 2), sqnT ? `system quality: ${sqnT}` : 'needs 2+ trades')}
      ${tile('Per session', `<span class="${cls(S.perSession)}">${usd(S.perSession, true)}</span>`, `${S.sessions} sessions · ${S.days} with a trade`)}
      ${tile('Best day', `<span class="up">${usd(S.bestDay, true)}</span>`, ok(S.bestDayShare) ? `${pc(S.bestDayShare)} of the net (MFFU payout: best day ≤ 50%)` : '')}
      ${tile('Worst day', `<span class="dn">${usd(S.worstDay, true)}</span>`, `${S.dllHits} day${S.dllHits === 1 ? '' : 's'} at the $1,000 daily limit`)}
    </div>`;
    return card('stats', 'Key numbers', esc(spanLabel(M.span)), body);
  }
  function streakCard(M) {
    const S = M.S; if (!S.n) return '';
    const curW = S.curK === 'w' ? `${S.cur} win${S.cur === 1 ? '' : 's'} in a row` : S.curK === 'l' ? `${S.cur} loss${S.cur === 1 ? '' : 'es'} in a row` : `${S.cur} breakeven${S.cur === 1 ? '' : 's'} in a row`;
    const last = M.T.slice(-20);
    return card('streaks', 'Streaks and the last 20', esc(curW), `<div class="pr-dots" aria-label="Last 20 trades">${last.map((t) => `<i class="${isWin(t) ? 'w' : isLoss(t) ? 'l' : 'b'}" title="${esc(t.day)} ${esc(usd(t.usd, true))}"></i>`).join('')}</div>
      <div class="pr-grid three">${tile('Longest win run', String(S.bw), 'trades')}${tile('Longest loss run', String(S.bl), 'trades')}${tile('Worst losing run', `<span class="dn">${usd(S.worstRun, true)}</span>`, 'in $, back to back')}
      ${tile('Median hold', ok(S.holdMed) ? (S.holdMed >= 60 ? `${Math.floor(S.holdMed / 60)}h ${String(Math.round(S.holdMed % 60)).padStart(2, '0')}m` : `${Math.round(S.holdMed)}m`) : '—', 'entry to exit')}
      ${tile('Best trade', `<span class="up">${usd(S.best && S.best.usd, true)}</span>`, S.best ? `${esc(S.best.day)} · ${fr(S.best.r)}` : '')}${tile('Worst trade', `<span class="dn">${usd(S.worst && S.worst.usd, true)}</span>`, S.worst ? `${esc(S.worst.day)} · ${fr(S.worst.r)}` : '')}</div>`);
  }
  function rDist(M) {
    const T = M.T; if (!T.length) return '';
    const B = [['−1R or worse', (r) => r <= -0.9], ['part loss', (r) => r > -0.9 && r < -0.1], ['breakeven', (r) => r >= -0.1 && r <= 0.1], ['0-1R', (r) => r > 0.1 && r <= 1],
      ['1-3R', (r) => r > 1 && r <= 3], ['3-5R', (r) => r > 3 && r <= 5], ['5R+', (r) => r > 5]];
    const rows = B.map(([l, f]) => { const g = T.filter((t) => ok(t.r) && f(t.r)); return { l, n: g.length, v: sum(g, (t) => t.usd) }; });
    const mx = Math.max(1, ...rows.map((r) => r.n));
    return card('rdist', 'R distribution', 'bar = trades · $ = what that bucket made', `<div class="pr-hist">${rows.map((r) => `<div class="pr-hc"><span class="pr-hn">${r.n}</span><i class="${r.v >= 0 ? 'g' : 'r'}" style="height:${Math.max(3, (100 * r.n) / mx).toFixed(0)}%"></i><b class="${cls(r.v)}">${usdK(r.v)}</b><em>${esc(r.l)}</em></div>`).join('')}</div>
      <p class="pr-mut">LIT's money comes from the few 3R+ winners; the breakevens (stop to entry + costs at 1R) are free tickets.</p>`);
  }
  function byWhen(M) {
    const T = M.T; if (!T.length) return '';
    const wd = [1, 2, 3, 4, 5].map((w) => { const g = T.filter((t) => wday(t.day) === w); return { label: WD[w], n: g.length, v: sum(g, (t) => t.usd), sub: g.length ? `${pc((100 * g.filter(isWin).length) / g.length)} win` : '' }; });
    const BK = [['02-05 London', 2, 5], ['05-08 pre', 5, 8], ['08-10 NY open', 8, 10], ['10-12 NY AM', 10, 12], ['12-16 NY PM', 12, 16]];
    const hr = BK.map(([l, a, b]) => { const g = T.filter((t) => t.t0 && etHour(t.t0) >= a && etHour(t.t0) < b); return { label: l, n: g.length, v: sum(g, (t) => t.usd), sub: g.length ? `${pc((100 * g.filter(isWin).length) / g.length)} win` : '' }; }).filter((r) => r.n);
    const sd = ['LONG', 'SHORT'].map((s) => { const g = T.filter((t) => t.side === s); return { label: s === 'LONG' ? 'Long' : 'Short', n: g.length, v: sum(g, (t) => t.usd), sub: g.length ? `${pc((100 * g.filter(isWin).length) / g.length)} win` : '' }; });
    const ex = [...new Set(T.map((t) => t.exit).filter(Boolean))].map((e) => { const g = T.filter((t) => t.exit === e); return { label: e === 'CUT_T15' ? '15-min cut' : e.charAt(0) + e.slice(1).toLowerCase(), n: g.length, v: sum(g, (t) => t.usd) }; }).sort((a, b) => b.v - a.v);
    return card('when', 'Where the $ comes from', 'net $ · trades · win %', `<h4 class="pr-sub">Weekday</h4>${bars(wd)}<h4 class="pr-sub">Entry time (ET)</h4>${bars(hr)}<h4 class="pr-sub">Side</h4>${bars(sd)}<h4 class="pr-sub">How it ended</h4>${bars(ex)}
      <p class="pr-mut">Read, don't filter: the owner's rule is size changes over skipping days (2-4 trades a week).</p>`);
  }
  function scorePart(M, o) { return [scoreHero(M, o), keyStats(M), rDist(M), streakCard(M), (o && o.galaxy) || '', byWhen(M)].join(''); }

  // ------------------------------------------------------------------ Eval pace (real accounts)
  function paceAcct(M, key, o) {
    const B = M.board || {}, A = obj(B[key]);
    if (!A) return '';
    const name = A.name || (key === 'lit' ? 'Zlarior' : 'ATLAS');
    const bal = n(A.balance), tb = n(A.target_balance), floor = n(A.floor), mll = ok(A.mll) ? +A.mll : key === 'lit' ? 2000 : 1000;
    const target = key === 'lit' ? RULES.target : ok(tb) && ok(bal) && ok(A.to_target) && ok(A.profit) ? n(A.to_target) + n(A.profit) : 1500;
    const prof = ok(A.profit) ? +A.profit : ok(bal) && ok(tb) ? bal - (tb - target) : NaN;
    const toGo = ok(A.to_target) ? +A.to_target : target - prof;
    const room = ok(A.room) ? +A.room : ok(bal) && ok(floor) ? bal - floor : NaN;
    const prog = (B.progress && obj(B.progress[key])) || {};
    const s = ok(A.session) ? +A.session : ok(prog.session) ? +prog.session : null, sMax = ok(prog.sessions_max) ? +prog.sessions_max : RULES.sessions_max, s10 = ok(A.sessions) ? +A.sessions : RULES.sessions;
    const left10 = s != null ? Math.max(0, s10 - s + 1) : null, left15 = s != null ? Math.max(0, sMax - s + 1) : null;
    const leftUse = left10 > 0 ? left10 : left15;
    const need = ok(toGo) && leftUse ? toGo / leftUse : NaN;
    const avg = key === 'lit' && M.S2 ? M.S2.perSession : NaN;
    const projS = ok(avg) && avg > 0 && ok(toGo) ? Math.ceil(Math.max(0, toGo) / avg) : null;
    const risk1 = A.micros && ok(A.micros.risk_usd) ? +A.micros.risk_usd : NaN;
    const lossesLeft = ok(room) && ok(risk1) && risk1 > 0 ? Math.floor(room / (risk1 * 1.05)) : null;
    const passed = ok(toGo) && toGo <= 0, under = ok(prof) && prof < 0;
    const p = passed ? 1 : under ? clamp(-prof / mll, 0, 1) : clamp(prof / target, 0, 1);
    const col = passed ? ['#2ee59d', '#3ee0c8'] : under ? ['#ff9a3d', '#ff5a7a'] : key === 'lit' ? ['#4f9bff', '#3ee0c8'] : ['#ff9a3d', '#ffd166'];
    const inner = `<text x="70" y="66" text-anchor="middle" class="pr-pv">${esc(passed ? 'PASS' : usd(toGo))}</text><text x="70" y="86" text-anchor="middle" class="pr-pl">${passed ? 'target reached' : 'to the target'}</text>`;
    const pace = !ok(need) ? '' : !ok(avg) ? `Needs <b>${usd(need)}</b> a session` : need <= avg ? `Needs <b>${usd(need)}</b> a session · the bot averages <b class="up">${usd(avg)}</b>: <b class="up">on pace</b>` : `Needs <b>${usd(need)}</b> a session · the bot averages <b>${usd(avg)}</b>: <b class="${need > avg * 2 ? 'dn' : 'warn'}">${need > avg * 2 ? 'behind pace' : 'a bit behind'}</b>`;
    const oddsRows = obj(prog.odds) && obj(prog.odds.rows) ? Object.entries(prog.odds.rows).slice(0, 3) : [];
    return `<section class="pr-card pr-pace" id="pr-pace-${esc(key)}" style="--c:${key === 'lit' ? '#4f9bff' : '#ff9a3d'}"><div class="pr-h"><h3>${esc(name)} · ${esc(A.plan || (key === 'lit' ? 'MFFU Builder 50K' : '25K'))}</h3><span class="pr-meta">${esc(A.badge || '')}${A.status ? ' · ' + esc(A.status) : ''}</span></div>
      <div class="pr-pace-g">${ring(passed ? 1 : p, 140, 11, col, inner, 'p' + key)}
        <div class="pr-pace-t"><span>Balance <b>${usd(bal)}</b> · profit <b class="${cls(prof)}">${usd(prof, true)}</b></span>
          <span>Drawdown left <b class="${ok(room) && room < mll * 0.35 ? 'dn' : ''}">${usd(room)}</b> of ${usd(mll)}</span>
          ${lossesLeft != null ? `<span>That is <b>${lossesLeft}</b> typical full loss${lossesLeft === 1 ? '' : 'es'} (${usd(risk1)} each)</span>` : ''}
</div></div>
      ${pace ? `<p class="pr-pace-l">${pace}</p>` : ''}
      ${projS != null && !passed ? `<p class="pr-mut">At the bot's own H2 pace (${usd(avg)} a session, backtest) the rest takes about <b>${projS}</b> session${projS === 1 ? '' : 's'}: ${s != null && s + projS - 1 <= sMax ? 'inside' : 'past'} the 3-week limit.</p>` : ''}
      ${oddsRows.length ? `<ul class="pr-odds">${oddsRows.map(([k, r]) => `<li><span>${esc(r.label || k)}</span><i><b class="p" style="width:${clamp(n(r.p10) || 0, 0, 100)}%"></b><b class="f" style="width:${clamp(n(r.f10) || 0, 0, 100)}%"></b></i><em>pass ${pc(r.p10)} · fail ${pc(r.f10)} in 2 wks</em></li>`).join('')}</ul><p class="pr-mut">Research odds of an eval started fresh (the live board), not of this one from today's balance (that is Trader's deck > eval odds).</p>` : ''}
      <button type="button" class="pr-link" ${goA(o, key === 'lit' ? 'evalhq' : 'atlas')}>Open the eval</button></section>`;
  }
  function pacePart(M, o) {
    const B = M.board || {};
    const h = [paceAcct(M, 'lit', o), paceAcct(M, 'atlas', o)].filter(Boolean).join('');
    const life = `<section class="pr-card"><div class="pr-h"><h3>After the pass: the payout path</h3><span class="pr-meta">MFFU Builder 50K sim funded</span></div>
      <ol class="pr-steps"><li><b>Clear the $2,100 buffer</b><span>no payout before the balance is $2,100 up</span></li><li><b>First payout from +$2,600</b><span>at least $500 above the buffer, 2 traded days a cycle, 48 h after the first trade</span></li>
      <li><b>Best day ≤ 50% of the cycle</b><span>the consistency rule; a big day just means more days, not a breach</span></li><li><b>$500-$2,000 a payout, 80% to you</b><span>5 sim payouts, then a live account</span></li></ol>
      ${ok(M.S2 && M.S2.bestDayShare) ? `<p class="pr-mut">Backtest H2: the best day was ${pc(M.S2.bestDayShare)} of the net: ${M.S2.bestDayShare <= 50 ? 'inside' : 'over'} the 50% rule over that span.</p>` : ''}
      <button type="button" class="pr-link" ${goA(o, 'money')}>Funded & payouts</button></section>`;
    return (h || `<section class="pr-card"><p class="pr-mut">The live board is not in this build yet: the eval pace shows once the PC bot or the cloud monitor publishes it.</p></section>`) + life + (B.t ? `<p class="pr-foot">Live board ${esc(new Date(+B.t * 1000).toISOString().slice(0, 16).replace('T', ' '))} UTC</p>` : '');
  }

  // ------------------------------------------------------------------ Risk
  function uwChart(M, mult = 1) {
    const C = M.S.curve; if (C.length < 2) return '<p class="pr-mut">Needs 2+ trades.</p>';
    const W = 360, H = 200, P = { l: 44, r: 8, t: 12, b: 22 };
    const lo = Math.min(-RULES.mll * 1.08, ...C.map((c) => c.dd * mult)), x = (i) => P.l + ((W - P.l - P.r) * i) / (C.length - 1), y = (v) => P.t + ((H - P.t - P.b) * (0 - v)) / (0 - lo);
    const area = `M${x(0)},${y(0)} ` + C.map((c, i) => `L${x(i).toFixed(1)},${y(c.dd * mult).toFixed(1)}`).join(' ') + ` L${x(C.length - 1)},${y(0)} Z`;
    const yr = [0, -500, -1000, -1500, -2000].filter((v) => v >= lo);
    const firstOf = []; let last = '';
    C.forEach((c, i) => { const m = c.day.slice(0, 7); if (m !== last) { last = m; firstOf.push([i, m]); } });
    const step = Math.max(1, Math.ceil(firstOf.length / 5));
    return `<svg class="pr-uw" viewBox="0 0 ${W} ${H}" role="img" aria-label="Drawdown from the last high, in $">
      <defs><linearGradient id="prUw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(255,90,122,.15)"/><stop offset="1" stop-color="rgba(255,90,122,.55)"/></linearGradient></defs>
      ${yr.map((v) => `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="rgba(150,175,255,.1)"/><text x="${P.l - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end" class="pr-ax">${v ? usd(v) : '$0'}</text>`).join('')}
      <path class="pr-uwa" d="${area}" fill="url(#prUw)" stroke="#ff5a7a" stroke-width="1.4"/>
      <line x1="${P.l}" x2="${W - P.r}" y1="${y(-RULES.dll).toFixed(1)}" y2="${y(-RULES.dll).toFixed(1)}" stroke="#ffb547" stroke-dasharray="4 4"/><text x="${W - P.r}" y="${(y(-RULES.dll) - 4).toFixed(1)}" text-anchor="end" class="pr-ax warn">$1,000 daily limit</text>
      <line x1="${P.l}" x2="${W - P.r}" y1="${y(-RULES.mll).toFixed(1)}" y2="${y(-RULES.mll).toFixed(1)}" stroke="#ff5a7a" stroke-width="1.5"/><text x="${W - P.r}" y="${(y(-RULES.mll) - 4).toFixed(1)}" text-anchor="end" class="pr-ax bad">MFFU $2,000 max loss</text>
      ${firstOf.filter((_, k) => k % step === 0).map(([i, m]) => `<text x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="middle" class="pr-ax">${esc(m.slice(2).replace('-', '/'))}</text>`).join('')}
    </svg>`;
  }
  function riskPart(M) {
    const S = M.S;
    if (!S.n) return card('risk', 'Risk', '', '<p class="pr-mut">No closed trades in this span.</p>');
    const E = evalSim(M.T, M.ses, 1);
    const head = card('uw', 'Underwater: $ below the last high', `${esc(spanLabel(M.span))} · today's size`, `${uwChart(M)}
      <div class="pr-grid">${tile('Worst drawdown', `<span class="dn">${usd(S.mdd, true)}</span>`, S.mddDay ? `bottom ${esc(S.mddDay)}` : '')}${tile('Of the max loss', pc((100 * -S.mdd) / RULES.mll), S.mdd > -RULES.mll ? 'never as deep as the MFFU max loss' : 'deeper than the max loss: an eval open then, before its floor locks, fails', S.mdd <= -RULES.mll ? 'bad' : '')}
      ${tile('Longest drawdown', `${S.longestDD}`, 'sessions under the high')}${tile('Worst week', `<span class="dn">${usd(S.worstWeek, true)}</span>`, `best ${usd(S.bestWeek, true)}`)}</div>
      <p class="pr-mut">The trailing max loss follows the end-of-day high, so a drawdown from any high counts against the eval, not only from the start. ${srcNote(M)}.</p>`);
    const odds = E ? card('ruin', 'Eval odds from this span', `${E.N.toLocaleString('en-US')} resampled evals`, `<div class="pr-grid">${tile('Pass in 2 weeks', `<span class="up">${pc(E.p10)}</span>`, `fail ${pc(E.f10)}`)}${tile('Pass in 3 weeks', `<span class="up">${pc(E.p15)}</span>`, `fail ${pc(E.f15)}`)}
      ${tile('Median pass', E.med ? `${E.med} sessions` : '—', 'when it passes')}${tile('Risk of ruin', `<span class="${E.f15 > 25 ? 'dn' : ''}">${pc(E.f15)}</span>`, 'eval lost inside 3 weeks')}</div>
      <p class="pr-mut">A quick check: each session is a random day of this span (days without a trade = $0) under the Builder 50K rules (+$3,000 target, $2,000 end-of-day trailing max loss). The research numbers (walk-forward, every start date) are in Lab > Evals; they win when the two differ.</p>`) : '';
    return head + odds;
  }

  // ------------------------------------------------------------------ Playbook
  const STEPS = [['Sweep', 'price runs a LIT level (Asia, London, NY range, prior day / week, a gap, a build-up of equal highs / lows)'], ['Inducement', 'a nearby swing is taken on the way: the trap'],
    ['Displacement', 'a big candle away from the sweep, then a 5-minute CISD (close through the last opposite candle)'], ['Entry', 'a limit for 30 minutes, then a 1-minute CISD; entries 02:00-15:30 ET, 1 trade a day'],
    ['Stop', '1 tick beyond the sweep extreme, never a fixed distance: a wide stop = fewer micros'], ['Target', 'the 18:00 open ± one VIX day move, banked at 8R; breakeven at 1R (+1.25 pts for costs)'],
    ['Exit rules', 'the 15-minute cut, flat by 15:55 ET']];
  function playbookPart(M, o) {
    const T = M.T;
    const fam = FAM.map(([k, name, re, rule]) => {
      const g = T.filter((t) => t.lv.some((c) => re.test(c)));
      const bu = g.filter((t) => t.lv.includes('bu'));
      const S = g.length ? stats(g, M.S.mo, M.S.sessions) : null;
      const lvls = [...new Set(g.flatMap((t) => t.lv.filter((c) => re.test(c))))].map((c) => LV[c] || c);
      return { k, name, rule, g, S, lvls, bu: bu.length ? sum(bu, (t) => t.usd) / bu.length : NaN, nbu: bu.length };
    }).filter((f) => f.S && f.S.n);
    const gradeOf = (S) => (S.n < 6 ? '·' : S.exp > 150 && S.pf > 2 ? 'A' : S.exp > 50 && S.pf > 1.4 ? 'B' : S.exp > 0 ? 'C' : 'D');
    const noLv = !T.some((t) => t.lv.length);
    const rules = card('rules', 'The playbook · LIT', 'the rules the bot follows, in order', `<ol class="pr-steps">${STEPS.map(([a, b]) => `<li><b>${esc(a)}</b><span>${esc(b)}</span></li>`).join('')}</ol>
      <button type="button" class="pr-link" ${goA(o, 'strategy')}>Full strategy page</button>`);
    const cards = noLv ? card('setups', 'Setups', '', `<p class="pr-mut">${M.span === 'real' ? 'Real fills do not carry the swept level yet: pick a backtest span to see each setup.' : 'The level of each trade is not in this build.'}</p>`)
      : fam.sort((a, b) => b.S.net - a.S.net).map((f) => { const g = gradeOf(f.S); return `<section class="pr-card pr-play" style="--c:${g === 'A' ? '#2ee59d' : g === 'B' ? '#4f9bff' : g === 'C' ? '#ffd166' : g === 'D' ? '#ff5a7a' : '#94a3b8'}">
        <div class="pr-h"><span class="pr-ttl"><span class="pr-grade" aria-label="grade ${g}">${g}</span><h3>${esc(f.name)}</h3></span><span class="pr-meta">${f.S.n} trade${f.S.n === 1 ? '' : 's'}</span></div>
        <p class="pr-rule">${esc(f.rule)}${f.lvls.length ? `<br><small>Levels: ${esc(f.lvls.join(' · '))}</small>` : ''}</p>
        <div class="pr-grid three">${tile('Net', `<span class="${cls(f.S.net)}">${usd(f.S.net, true)}</span>`, `${usd(f.S.net / Math.max(0.25, M.S.mo), true)} a month`)}${tile('Expectancy', `<span class="${cls(f.S.exp)}">${usd(f.S.exp, true)}</span>`, fr(f.S.expR))}${tile('Win rate', pc(f.S.winX), `PF ${f.S.pf === Infinity ? '∞' : num(f.S.pf)}`)}</div>
        ${f.nbu ? `<p class="pr-mut">With a build-up of equal highs / lows: ${f.nbu} trade${f.nbu === 1 ? '' : 's'}, ${usd(f.bu, true)} a trade.</p>` : ''}</section>`; }).join('');
    return rules + `<h4 class="pr-sec">Setups by the level swept · ${esc(spanLabel(M.span))}</h4>` + cards + `<p class="pr-foot">A trade can sweep two levels at once; it then counts in both cards. Grade: A = over $150 a trade and PF over 2, B = over $50 and PF over 1.4, C = positive, D = losing, · = under 6 trades.</p>`;
  }

  // ------------------------------------------------------------------ What if (sizing)
  function simRow(M, m) {
    const T = M.T, S = M.S, E = evalSim(T, M.ses, m, 1000);
    return { m, net: S.net * m, mo: S.perMo * m, dd: S.mdd * m, wd: S.worstDay * m, risk: S.avgL * m, E };
  }
  function simPart(M) {
    if (!M.S.n) return card('sim', 'What if', '', '<p class="pr-mut">No closed trades in this span.</p>');
    const rows = [0.5, 1, 1.5, 2].map((m) => simRow(M, m)), me = simRow(M, M.mult);
    const fmtM = (m) => (m === 1 ? 'today' : `${m}x`);
    const body = `<label class="pr-slide"><span>Size vs today: <b data-pr-mult-l>${M.mult.toFixed(2)}x</b></span><input type="range" min="0.25" max="2" step="0.25" value="${M.mult}" data-pr-mult aria-label="Size multiplier"></label>
      <div class="pr-grid">${tile('Net', `<span class="${cls(me.net)}">${usd(me.net, true)}</span>`, `${usd(me.mo, true)} a month`)}${tile('Max drawdown', `<span class="dn">${usd(me.dd, true)}</span>`, `${pc((100 * -me.dd) / RULES.mll)} of the max loss`, -me.dd >= RULES.mll ? 'bad' : '')}
      ${tile('Worst day', `<span class="dn">${usd(me.wd, true)}</span>`, -me.wd >= RULES.dll ? 'over the $1,000 daily limit' : 'inside the daily limit', -me.wd >= RULES.dll ? 'bad' : '')}${tile('Typical loss', `<span class="dn">${usd(me.risk, true)}</span>`, 'per losing trade')}
      ${me.E ? tile('Pass in 2 weeks', `<span class="up">${pc(me.E.p10)}</span>`, `fail ${pc(me.E.f10)}`) + tile('Pass in 3 weeks', `<span class="up">${pc(me.E.p15)}</span>`, `fail ${pc(me.E.f15)} · median ${me.E.med || '—'} sessions`) : ''}</div>
      <div class="pr-tbl" role="table"><div class="pr-tr pr-th" role="row"><span>Size</span><span>$ / month</span><span>Max DD</span><span>Pass 2 wk</span><span>Fail 2 wk</span></div>
      ${rows.map((r) => `<div class="pr-tr ${r.m === 1 ? 'cur' : ''}" role="row"><span>${fmtM(r.m)}</span><span class="${cls(r.mo)}">${usd(r.mo, true)}</span><span class="dn">${usd(r.dd, true)}</span><span>${r.E ? pc(r.E.p10) : '—'}</span><span>${r.E ? pc(r.E.f10) : '—'}</span></div>`).join('')}</div>
      <p class="pr-mut">Every trade's $ times the size (micros round in real life). Bigger size passes faster AND fails faster: the 2-week goal is a pass, never a blown eval. A what-if only: the bot's size is set by its sizing mode (Rules > Risk & sizing); nothing here changes it.</p>`;
    return card('sim', 'What if: sizing', `${esc(spanLabel(M.span))} · ${M.S.n} trades`, body);
  }

  // ------------------------------------------------------------------ Tags
  const TAGS = ['A+ setup', 'Textbook', 'News day', 'Bad fill', 'Late entry', 'Early exit', 'Would skip', 'Lesson'];
  function tagsPart(M, o) {
    const T = M.T, tg = M.tags, by = new Map();
    for (const t of T) for (const k of arr(tg[t.id])) { if (!by.has(k)) by.set(k, []); by.get(k).push(t); }
    const rows = [...by.entries()].map(([k, g]) => ({ label: k, n: g.length, v: sum(g, (t) => t.usd), sub: `${usd(sum(g, (t) => t.usd) / g.length, true)} a trade · ${pc((100 * g.filter(isWin).length) / g.length)} win` })).sort((a, b) => b.v - a.v);
    const tagged = new Set(); for (const g of by.values()) g.forEach((t) => tagged.add(t.id));
    const un = T.filter((t) => !tagged.has(t.id)), unNet = sum(un, (t) => t.usd);
    return card('tags', '$ by your tags', `${tagged.size} of ${T.length} trades tagged`, `${rows.length ? bars(rows) + `<p class="pr-mut">Untagged: ${un.length} trade${un.length === 1 ? '' : 's'}, ${usd(unNet, true)}.</p>` : `<p class="pr-mut">No tags in this span yet. Open a trade in the Journal and tap a tag (${TAGS.slice(0, 4).map(esc).join(', ')} …): this page then shows the $ each tag made. Tags stay on this device.</p>`}
      <button type="button" class="pr-link" ${goA(o, 'journal')}>Tag trades in the Journal</button>`);
  }

  // ------------------------------------------------------------------ the page, the Home card
  function page(M, part, o) {
    if (!PARTS.some((p) => p[0] === part)) part = 'score';
    const F = { score: scorePart, pace: pacePart, risk: riskPart, playbook: playbookPart, sim: simPart, tags: tagsPart }[part];
    let body; try { body = F(M, o); } catch (e) { body = `<section class="pr-card"><p class="pr-mut">Could not draw this part: ${esc(e && e.message)}</p></section>`; }
    const spans = part === 'pace' ? '' : spanBar(M);
    return `<div class="pr-wrap" data-pr-part="${part}"><div class="pr-title"><b>Scorecard</b><span>Zlarior · every number in $ and $ a month · read-only</span></div>${partBar(part, o)}${spans}${body}</div>`;
  }
  function home(M, o) {
    const S = M.S2 || M.S, sc = M.sc2 || M.sc;
    if (!sc) return '';
    const A = M.board && obj(M.board.lit);
    const toGo = A && ok(A.to_target) ? +A.to_target : NaN;
    const col = gradeCol(sc.g);
    const inner = `<text x="34" y="40" text-anchor="middle" class="pr-hv">${sc.v}</text>`;
    return `<button type="button" class="pr-home" ${goA(o, 'pro')} aria-label="Scorecard: Zenith score ${sc.v}, grade ${sc.g}">${ring(sc.v / 100, 68, 7, col, inner, 'home')}
      <span class="pr-home-t"><span class="pr-eye">Scorecard · H2 check</span><b>Grade ${sc.g} · <span class="${cls(S.exp)}">${usd(S.exp, true)}</span> a trade · <span class="${cls(S.perMo)}">${usd(S.perMo, true)}</span>/mo</b>
      <em>${ok(toGo) && toGo > 0 ? `50K: ${usd(toGo)} to go · bot avg ${usd(S.perSession)} a session` : 'expectancy, risk, playbook, what-if sizing'}</em></span><span class="pr-home-go" aria-hidden="true">›</span></button>`;
  }

  // ------------------------------------------------------------------ share card (a PNG for the share sheet)
  function shareCard(M) {
    if (typeof document === 'undefined') return Promise.resolve(null);
    const S = M.S, sc = M.sc; if (!sc) return Promise.resolve(null);
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1350;
    const g = c.getContext('2d'); if (!g) return Promise.resolve(null);
    const bg = g.createLinearGradient(0, 0, 1080, 1350); bg.addColorStop(0, '#050816'); bg.addColorStop(0.6, '#0b1430'); bg.addColorStop(1, '#130a2a');
    g.fillStyle = bg; g.fillRect(0, 0, 1080, 1350);
    const r0 = rng(7); for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(255,255,255,${(0.2 + r0() * 0.6).toFixed(2)})`; g.fillRect(r0() * 1080, r0() * 1350, r0() * 2.4, r0() * 2.4); }
    const col = gradeCol(sc.g), cx = 540, cy = 420, R = 220;
    g.lineWidth = 34; g.strokeStyle = 'rgba(148,163,184,.18)'; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
    const gr = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R); gr.addColorStop(0, col[0]); gr.addColorStop(1, col[1]);
    g.strokeStyle = gr; g.lineCap = 'round'; g.shadowColor = col[0]; g.shadowBlur = 40; g.beginPath(); g.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * sc.v) / 100); g.stroke(); g.shadowBlur = 0;
    g.textAlign = 'center'; g.fillStyle = '#eef1f8'; g.font = '800 170px Inter, system-ui, sans-serif'; g.fillText(String(sc.v), cx, cy + 50);
    g.font = '700 46px Inter, system-ui, sans-serif'; g.fillStyle = col[0]; g.fillText(`GRADE ${sc.g}`, cx, cy + 120);
    g.font = '800 40px Inter, system-ui, sans-serif'; g.fillStyle = '#9fc4ff'; g.fillText('ZENITH SCORE · ZLARIOR', cx, 120);
    g.font = '500 32px Inter, system-ui, sans-serif'; g.fillStyle = '#8b95ad'; g.fillText(`${spanLabel(M.span)} · ${S.n} trades · ${M.span === 'real' ? 'real fills' : 'backtest, costs in'}`, cx, 172);
    const L = [['Expectancy', usd(S.exp, true) + ' / trade'], ['$ a month', usd(S.perMo, true)], ['Net', usd(S.net, true)], ['Profit factor', S.pf === Infinity ? '∞' : num(S.pf)], ['Win rate', pc(S.win)], ['Max drawdown', usd(S.mdd, true)]];
    L.forEach(([a, b], i) => { const x = i % 2 ? 790 : 290, y = 790 + Math.floor(i / 2) * 150; g.font = '600 32px Inter, system-ui, sans-serif'; g.fillStyle = '#8b95ad'; g.fillText(a, x, y); g.font = '800 58px Inter, system-ui, sans-serif'; g.fillStyle = /^−/.test(b) ? '#ff7a93' : /^\+/.test(b) ? '#4ff0ae' : '#eef1f8'; g.fillText(b, x, y + 66); });
    g.font = '500 28px Inter, system-ui, sans-serif'; g.fillStyle = '#5d6780'; g.fillText('OLYMPUS · Zenith · paper / read-only', cx, 1300);
    return new Promise((res) => { try { c.toBlob((b) => res(b), 'image/png'); } catch (e) { res(null); } });
  }

  // ------------------------------------------------------------------ wiring: span, size slider, share, count-ups
  const reduced = () => { try { return (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) || (typeof document !== 'undefined' && document.documentElement.dataset.motion === 'off'); } catch (e) { return false; } };
  function countUp(el) {
    if (reduced() || typeof requestAnimationFrame !== 'function') return;
    el.querySelectorAll('[data-pr-count]').forEach((s) => {
      const to = n(s.dataset.prCount); if (!ok(to) || s.__c) return; s.__c = true;
      const plain = s.dataset.plain === '1', sign = s.dataset.sign === '1', t0 = performance.now(), D = 900;
      const step = (t) => { const k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 3), v = to * e; s.textContent = plain ? String(Math.round(v)) : usd(v, sign); if (k < 1) requestAnimationFrame(step); else s.textContent = plain ? String(Math.round(to)) : usd(to, sign); };
      requestAnimationFrame(step);
    });
  }
  // state lives in this browser only (span, size); set(k, v) is the caller's store (or this file's)
  function wire(el, redraw, o) {
    if (!el) return;
    countUp(el);
    if (el.__pr) return; el.__pr = true;
    el.addEventListener('click', (e) => {
      const s = e.target.closest('[data-pr-span]'), sh = e.target.closest('[data-pr-share]');
      if (s) { st.set('le.pro.span', s.dataset.prSpan); if (redraw) redraw(); }
      else if (sh) {
        const M = o && typeof o.model === 'function' ? o.model() : null; if (!M) return;
        sh.disabled = true;
        shareCard(M).then((b) => {
          sh.disabled = false; if (!b) return;
          const f = typeof File === 'function' ? new File([b], 'zenith-scorecard.png', { type: 'image/png' }) : null;
          if (f && navigator.canShare && navigator.canShare({ files: [f] })) navigator.share({ files: [f], title: 'Zenith scorecard' }).catch(() => null);
          else { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'zenith-scorecard.png'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
        });
      }
    });
    el.addEventListener('input', (e) => {
      const r = e.target.closest('[data-pr-mult]'); if (!r) return;
      const l = el.querySelector('[data-pr-mult-l]'); if (l) l.textContent = (+r.value).toFixed(2) + 'x';
    });
    el.addEventListener('change', (e) => { const r = e.target.closest('[data-pr-mult]'); if (!r) return; st.set('le.pro.mult', +r.value); if (redraw) redraw(); });
  }
  const pref = () => ({ span: st.get('le.pro.span', '2026'), mult: st.get('le.pro.mult', 1) });

  const CSS = `
.pr-wrap{display:flex;flex-direction:column;gap:12px;min-width:0}
.pr-wrap *,.pr-home *{box-sizing:border-box}
.pr-title{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;padding:2px}.pr-title b{font:800 16px var(--sans,Inter,sans-serif);letter-spacing:.06em;text-transform:uppercase;background:linear-gradient(90deg,#9fc4ff,#3ee0c8,#b388ff);-webkit-background-clip:text;background-clip:text;color:transparent}.pr-title span{font-size:12.5px;color:var(--muted,#9aa3b8)}
.pr-parts,.pr-seg{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;padding:2px;margin:0 -2px}.pr-parts::-webkit-scrollbar,.pr-seg::-webkit-scrollbar{display:none}
.pr-parts button,.pr-seg button{flex:0 0 auto;min-height:44px;padding:0 14px;border-radius:14px;border:1px solid rgba(150,175,255,.18);background:rgba(148,163,184,.07);color:var(--ink,#eef1f8);font:650 13px var(--sans,Inter,sans-serif);cursor:pointer;white-space:nowrap}
.pr-parts button.on{border-color:transparent;background:linear-gradient(135deg,rgba(79,155,255,.9),rgba(62,224,200,.75));color:#05101f;box-shadow:0 8px 24px -10px rgba(62,224,200,.7)}
.pr-seg button{min-height:44px;font-size:12.5px;border-radius:999px}.pr-seg button.on{border-color:rgba(125,211,252,.7);background:rgba(125,211,252,.16);color:#d6f1ff}
.pr-card{--pr-ink:var(--ink,#eef1f8);--pr-mut:var(--muted,#9aa3b8);--pr-line:rgba(150,175,255,.14);position:relative;padding:14px 16px;border-radius:18px;color:var(--pr-ink);min-width:0;overflow:hidden;
  background:linear-gradient(180deg,rgba(14,20,44,.72),rgba(6,8,22,.62)) padding-box,linear-gradient(140deg,rgba(79,155,255,.42),rgba(62,224,200,.18) 50%,rgba(179,136,255,.3)) border-box;border:1px solid transparent;box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 16px 40px -26px rgba(30,60,180,.6)}
.pr-card .up{color:var(--good,#2ee59d)}.pr-card .dn,.pr-home .dn{color:var(--bad,#ff5a7a)}.pr-card .warn{color:var(--warn,#ffb547)}.pr-home .up{color:var(--good,#2ee59d)}
.pr-h{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap}.pr-h h3{margin:0;font:700 15px/1.3 var(--sans,Inter,sans-serif);display:flex;align-items:center;gap:8px}.pr-meta{font-size:12px;color:var(--pr-mut)}
.pr-mut{margin:8px 0 0;font-size:12.5px;line-height:1.5;color:var(--pr-mut)}.pr-foot{margin:0 4px;font-size:11.5px;line-height:1.5;color:var(--muted,#9aa3b8)}
.pr-sub{margin:12px 0 4px;font:700 11px var(--sans,Inter,sans-serif);letter-spacing:.1em;text-transform:uppercase;color:var(--pr-mut)}.pr-sec{margin:8px 4px 0;font:700 11px var(--sans,Inter,sans-serif);letter-spacing:.1em;text-transform:uppercase;color:var(--muted,#9aa3b8)}
.pr-hero{padding:18px 16px;background:radial-gradient(120% 80% at 15% 0%,color-mix(in srgb,var(--g1) 22%,transparent),transparent 60%),linear-gradient(180deg,rgba(14,20,44,.8),rgba(6,8,22,.7)) padding-box,linear-gradient(140deg,var(--g1),rgba(79,155,255,.25) 45%,var(--g2)) border-box}
.pr-orbit{position:absolute;inset:0;pointer-events:none;overflow:hidden}.pr-orbit i{position:absolute;width:3px;height:3px;border-radius:50%;background:#fff;box-shadow:0 0 8px #9fe9ff;top:20%;left:70%;animation:prTw 4s ease-in-out infinite}.pr-orbit i:nth-child(2){top:62%;left:88%;animation-delay:1.3s}.pr-orbit i:nth-child(3){top:12%;left:40%;animation-delay:2.4s}
@keyframes prTw{0%,100%{opacity:.15;transform:scale(.6)}50%{opacity:1;transform:scale(1.4)}}
.pr-hero-g{display:flex;gap:14px;align-items:center;flex-wrap:wrap;position:relative}.pr-hero-t{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1 1 150px}
.pr-eye{font:700 11px var(--sans,Inter,sans-serif);letter-spacing:.1em;text-transform:uppercase;color:var(--pr-mut,#9aa3b8)}
.pr-hero-n{font:800 32px/1.05 var(--sans,Inter,sans-serif);font-variant-numeric:tabular-nums;letter-spacing:-.02em}.pr-hero-n small{font-size:14px;font-weight:600;color:var(--pr-mut)}.pr-hero-s{font-size:13px;color:var(--pr-mut)}.pr-hero-s b{color:var(--pr-ink)}.pr-hero-s b.up{color:var(--good,#2ee59d)}.pr-hero-s b.dn{color:var(--bad,#ff5a7a)}
.pr-ring{flex:0 0 auto;overflow:visible}.pr-ring .pr-arc{filter:drop-shadow(0 0 8px rgba(62,224,200,.55));animation:prDraw 1.2s cubic-bezier(.16,1,.3,1) both}
@keyframes prDraw{from{stroke-dasharray:0 var(--len)}}
.pr-sv{font:800 44px var(--sans,Inter,sans-serif);fill:#eef1f8}.pr-sg{font:700 13px var(--sans,Inter,sans-serif);fill:#9fc4ff;letter-spacing:.08em;text-transform:uppercase}
.pr-pv{font:800 22px var(--sans,Inter,sans-serif);fill:#eef1f8}.pr-pl{font:600 11px var(--sans,Inter,sans-serif);fill:#8b95ad}.pr-hv{font:800 20px var(--sans,Inter,sans-serif);fill:#eef1f8}
.pr-radar{display:block;width:100%;max-width:320px;height:auto;margin:10px auto 4px;overflow:visible}.pr-radar .pr-shape{transform-origin:50% 50%;animation:prGrow 1s cubic-bezier(.2,.9,.25,1.05) both;filter:drop-shadow(0 0 10px rgba(62,224,200,.45))}
@keyframes prGrow{from{transform:scale(.2);opacity:0}}
.pr-rl{font:600 10.5px var(--sans,Inter,sans-serif);fill:#9aa3b8}.pr-rv{font:700 11px var(--sans,Inter,sans-serif);fill:#eef1f8}
.pr-axes{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:6px}.pr-axes li{display:grid;grid-template-columns:96px 1fr auto;gap:4px 10px;align-items:center;font-size:12.5px}.pr-axes li>i{height:6px;border-radius:99px;background:rgba(148,163,184,.14);overflow:hidden}.pr-axes li>i b{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--g1,#4f9bff),var(--g2,#3ee0c8))}
.pr-axes em{font-style:normal;font-weight:700;font-variant-numeric:tabular-nums}.pr-axes small{grid-column:1/-1;margin-top:-3px;font-size:11px;color:var(--pr-mut)}
.pr-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.pr-btn,.pr-link{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 16px;border-radius:14px;border:0;font:700 13px var(--sans,Inter,sans-serif);cursor:pointer;background:linear-gradient(135deg,#4f9bff,#3ee0c8);color:#05101f;box-shadow:0 10px 24px -12px rgba(62,224,200,.8)}
.pr-btn.ghost,.pr-link{background:rgba(125,211,252,.08);color:#bfe9ff;border:1px solid rgba(125,211,252,.35);box-shadow:none}.pr-link{margin-top:10px}
.pr-btn:active,.pr-link:active,.pr-parts button:active,.pr-seg button:active{transform:scale(.97)}
.pr-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.pr-grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}
.pr-tile{padding:10px 10px;border-radius:12px;background:rgba(148,163,184,.06);border:1px solid var(--pr-line);min-width:0;display:flex;flex-direction:column;gap:2px}
.pr-tile span{font-size:11px;color:var(--pr-mut);letter-spacing:.02em}.pr-tile b{font:800 19px/1.15 var(--sans,Inter,sans-serif);font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.pr-tile b span{font-size:inherit;letter-spacing:0;color:inherit}.pr-tile em{font-style:normal;font-size:11px;line-height:1.35;color:var(--pr-mut)}
.pr-tile b span.up{color:var(--good,#2ee59d)}.pr-tile b span.dn{color:var(--bad,#ff5a7a)}.pr-tile.bad{border-color:rgba(255,90,122,.5);background:rgba(255,90,122,.08)}
.pr-grid.three .pr-tile b{font-size:16px}
.pr-hist{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;height:170px;align-items:end}.pr-hc{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:3px;min-width:0}
.pr-hc i{width:72%;border-radius:6px 6px 2px 2px;animation:prRise .9s cubic-bezier(.16,1,.3,1) both;max-height:100px}.pr-hc i.g{background:linear-gradient(180deg,#4ff0ae,#1c9c6c);box-shadow:0 0 12px -2px rgba(46,229,157,.6)}.pr-hc i.r{background:linear-gradient(180deg,#ff7a93,#a3243e)}
@keyframes prRise{from{transform:scaleY(0);transform-origin:bottom}}
.pr-hn{font:700 11px var(--sans,Inter,sans-serif)}.pr-hc b{font:700 10px var(--sans,Inter,sans-serif);font-variant-numeric:tabular-nums;white-space:nowrap}.pr-hc em{font-style:normal;font-size:9.5px;line-height:1.2;color:var(--pr-mut);text-align:center;min-height:24px}
.pr-dots{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px}.pr-dots i{width:14px;height:14px;border-radius:50%;background:#94a3b8}.pr-dots i.w{background:var(--good,#2ee59d);box-shadow:0 0 8px rgba(46,229,157,.6)}.pr-dots i.l{background:var(--bad,#ff5a7a)}.pr-dots i.b{background:rgba(148,163,184,.5)}
.pr-bars{list-style:none;margin:0;padding:0;display:grid;gap:6px}.pr-bars li{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr) auto;gap:8px;align-items:center;font-size:12.5px;min-height:30px}
.pr-bl{display:flex;flex-direction:column;min-width:0}.pr-bl em,.pr-bv em{font-style:normal;font-size:10.5px;color:var(--pr-mut);font-weight:500}.pr-bv{text-align:right;font-weight:750;font-variant-numeric:tabular-nums;display:flex;flex-direction:column}
.pr-bt{position:relative;height:10px;border-radius:99px;background:rgba(148,163,184,.1)}.pr-bt::after{content:"";position:absolute;left:50%;top:-3px;bottom:-3px;width:1px;background:rgba(238,241,248,.35)}.pr-bt i{position:absolute;top:0;height:100%;border-radius:99px}.pr-bt i.g{background:linear-gradient(90deg,#1c9c6c,#4ff0ae)}.pr-bt i.r{background:linear-gradient(270deg,#a3243e,#ff7a93)}
.pr-uw{display:block;width:100%;height:auto;aspect-ratio:360/200}.pr-uwa{animation:prFade .9s ease both}@keyframes prFade{from{opacity:0}}
.pr-ax{font:500 9.5px var(--sans,Inter,sans-serif);fill:#7d879d}.pr-ax.warn{fill:#ffb547}.pr-ax.bad{fill:#ff7a93}
.pr-pace-g{display:flex;gap:14px;align-items:center;flex-wrap:wrap}.pr-pace-t{display:flex;flex-direction:column;gap:5px;font-size:13px;color:var(--pr-mut);flex:1 1 160px;min-width:0}.pr-pace-t b{white-space:nowrap;color:var(--pr-ink);font-variant-numeric:tabular-nums}.pr-pace-t b.up{color:var(--good,#2ee59d)}.pr-pace-t b.dn{color:var(--bad,#ff5a7a)}
.pr-pace{background:radial-gradient(90% 70% at 10% 0%,color-mix(in srgb,var(--c) 18%,transparent),transparent 60%),linear-gradient(180deg,rgba(14,20,44,.78),rgba(6,8,22,.66)) padding-box,linear-gradient(140deg,var(--c),rgba(150,175,255,.15) 60%) border-box}
.pr-pace-l{margin:10px 0 0;padding:10px 12px;border-radius:12px;background:rgba(148,163,184,.07);font-size:13px;line-height:1.5}.pr-pace-l b.up{color:var(--good,#2ee59d)}.pr-pace-l b.dn{color:var(--bad,#ff5a7a)}.pr-pace-l b.warn{color:var(--warn,#ffb547)}
.pr-odds{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:8px}.pr-odds li{display:grid;grid-template-columns:1fr;gap:3px;font-size:12px}.pr-odds li>i{display:flex;height:9px;border-radius:99px;overflow:hidden;background:rgba(148,163,184,.14)}.pr-odds b.p{background:var(--good,#2ee59d)}.pr-odds b.f{background:var(--bad,#ff5a7a);margin-left:auto}.pr-odds em{font-style:normal;color:var(--pr-mut)}
.pr-steps{margin:0;padding:0 0 0 4px;list-style:none;counter-reset:s;display:grid;gap:8px}.pr-steps li{counter-increment:s;display:grid;grid-template-columns:28px 1fr;gap:2px 10px;font-size:13px;line-height:1.45}
.pr-steps li::before{content:counter(s);grid-row:span 2;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font:800 12px var(--sans,Inter,sans-serif);color:#05101f;background:linear-gradient(135deg,#4f9bff,#3ee0c8);box-shadow:0 0 12px -2px rgba(62,224,200,.7)}
.pr-steps li span{color:var(--pr-mut)}
.pr-play{background:linear-gradient(180deg,rgba(14,20,44,.74),rgba(6,8,22,.64)) padding-box,linear-gradient(140deg,var(--c),rgba(150,175,255,.12) 55%) border-box}
.pr-grade{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:9px;font:800 14px var(--sans,Inter,sans-serif);color:#05101f;background:var(--c);box-shadow:0 0 14px -3px var(--c)}
.pr-rule{margin:0 0 10px;font-size:13px;line-height:1.45;color:var(--pr-mut)}
.pr-slide{display:flex;flex-direction:column;gap:6px;margin-bottom:12px;font-size:13px}.pr-slide b{font-variant-numeric:tabular-nums;color:#9fe9ff}
.pr-slide input{width:100%;height:44px;accent-color:#3ee0c8;margin:0;-webkit-appearance:none;appearance:none;background:transparent}.pr-slide input::-webkit-slider-runnable-track{height:8px;border-radius:99px;background:linear-gradient(90deg,#4f9bff,#3ee0c8 50%,#ff9a3d 75%,#ff5a7a)}.pr-slide input::-moz-range-track{height:8px;border-radius:99px;background:linear-gradient(90deg,#4f9bff,#3ee0c8 50%,#ff9a3d 75%,#ff5a7a)}.pr-slide input::-webkit-slider-thumb{-webkit-appearance:none;width:30px;height:30px;margin-top:-11px;border-radius:50%;background:#eef1f8;border:3px solid #3ee0c8;box-shadow:0 0 16px rgba(62,224,200,.8)}
.pr-ttl{display:flex;align-items:center;gap:8px;min-width:0}
.pr-tbl{display:grid;margin-top:12px;border:1px solid var(--pr-line);border-radius:12px;overflow:hidden}.pr-tr{display:grid;grid-template-columns:.8fr 1.1fr 1fr .9fr .9fr;gap:4px;padding:9px 10px;font-size:12px;font-variant-numeric:tabular-nums;border-top:1px solid var(--pr-line)}
.pr-tr:first-child{border-top:0}.pr-th{font-weight:700;color:var(--pr-mut);font-size:10.5px;text-transform:uppercase;letter-spacing:.06em}.pr-tr.cur{background:rgba(62,224,200,.08);font-weight:700}
.pr-home{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;width:100%;min-height:88px;padding:10px 14px;border-radius:18px;text-align:left;cursor:pointer;color:var(--ink,#eef1f8);font:inherit;
  background:radial-gradient(80% 90% at 0% 50%,rgba(62,224,200,.14),transparent 65%),linear-gradient(180deg,rgba(14,20,44,.74),rgba(6,8,22,.64)) padding-box,linear-gradient(120deg,rgba(62,224,200,.55),rgba(79,155,255,.25) 50%,rgba(179,136,255,.4)) border-box;border:1px solid transparent;box-shadow:inset 0 1px 0 rgba(255,255,255,.06)}
.pr-home-t{display:flex;flex-direction:column;gap:2px;min-width:0}.pr-home-t b{font:750 14px/1.3 var(--sans,Inter,sans-serif)}.pr-home-t em{font-style:normal;font-size:12px;color:var(--muted,#9aa3b8);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pr-home-go{font-size:26px;color:var(--muted,#9aa3b8)}
@media (prefers-reduced-motion:reduce){.pr-wrap *,.pr-home *{animation:none!important;transition:none!important}}
:root[data-motion="off"] .pr-wrap *,:root[data-motion="off"] .pr-home *{animation:none!important}
@media (min-width:1100px){.pr-wrap{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:start}.pr-wrap>.pr-title,.pr-wrap>.pr-parts,.pr-wrap>.pr-seg,.pr-wrap>.pr-sec,.pr-wrap>.pr-foot{grid-column:1/-1}}
:root[data-theme="light"] .pr-card,:root[data-theme="light"] .pr-home{--pr-ink:#101828;--pr-mut:#526079;--pr-line:rgba(37,99,235,.14);color:#101828;background:linear-gradient(180deg,rgba(255,255,255,.94),rgba(240,247,255,.9)) padding-box,linear-gradient(140deg,rgba(37,99,235,.35),rgba(16,185,129,.25)) border-box}
:root[data-theme="light"] .pr-radar circle{fill:#1d4ed8}:root[data-theme="light"] .pr-sg,:root[data-theme="light"] .pr-pl{fill:#1d4ed8}:root[data-theme="light"] .pr-title b{background:linear-gradient(90deg,#1d4ed8,#0f9f8a,#6d28d9);-webkit-background-clip:text;background-clip:text}
:root[data-theme="light"] .pr-sv,:root[data-theme="light"] .pr-pv,:root[data-theme="light"] .pr-hv,:root[data-theme="light"] .pr-rv{fill:#101828}:root[data-theme="light"] .pr-btn.ghost,:root[data-theme="light"] .pr-link{color:#1d4ed8}
`;
  function css() { if (typeof document === 'undefined' || !document.head || document.getElementById('pro-css')) return; const s = document.createElement('style'); s.id = 'pro-css'; s.textContent = CSS; document.head.appendChild(s); }
  css();
  window.ProUI = { version: V, PARTS, SPANS, TAGS, RULES, norm, stats, score, evalSim, model, page, home, wire, pref, shareCard, css, tid };
})();
