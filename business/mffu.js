// MY MFFU ACCOUNTS page (classic script, read only, 2026-11-18). One card per account the way MFFU's dashboard shows it.
// The pure part is mffumodel.js (window.MFFU_MODEL); payout rules = payoutcoach.js. Everything is drawn with textContent and a
// canvas for the equity line. window.MFFU_PAGE is the test hook.
(function () {
  'use strict';
  const M = window.MFFU_MODEL;
  const $ = (id) => document.getElementById(id);
  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const nowS = () => Math.floor(Date.now() / 1000);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
  const usd = (v, cents) => (v == null ? '-' : (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', cents ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 }));
  const sgn = (v) => (v == null ? '-' : (v > 0 ? '+' : '') + usd(v, true));
  const ago = (s) => (s == null ? '' : s < 90 ? 'just now' : s < 5400 ? Math.round(s / 60) + ' min ago' : s < 172800 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' days ago');
  const day = (d) => { if (!d) return '-'; if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d; const t = new Date(d + 'T12:00:00Z'); return t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); };
  const todayET = () => { try { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); } catch (e) { return new Date().toISOString().slice(0, 10); } };

  async function getJSON(u, ms) {
    const ac = typeof AbortController === 'function' ? new AbortController() : null, tm = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
    try { const r = await fetch(u, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); if (r.ok) return await r.json(); } catch (e) { /* none */ } finally { clearTimeout(tm); }
    return null;
  }

  // "source · age" under a number
  function src(s, t, now) {
    if (!s) return 'no number yet';
    return s + (t ? ' · ' + ago(now - t) : '');
  }

  function row(dl, k, v, small, cls) {
    dl.appendChild(el('dt', null, k));
    const dd = el('dd', cls || null);
    if (v instanceof Node) dd.appendChild(v); else dd.appendChild(document.createTextNode(String(v)));
    if (small) dd.appendChild(el('small', null, small));
    dl.appendChild(dd);
  }

  function bar(frac, cls) {
    const b = el('div', 'bar' + (cls ? ' ' + cls : '')), i = el('i');
    i.style.width = Math.round(Math.max(0, Math.min(1, frac || 0)) * 100) + '%';
    b.appendChild(i);
    return b;
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
      const X = (i) => pad + (pts.length > 1 ? (i * (w - 2 * pad)) / (pts.length - 1) : (w - 2 * pad) / 2);
      const Y = (v) => pad + (h - 2 * pad) * (1 - (v - lo) / span);
      g.strokeStyle = 'rgba(255,255,255,.25)'; g.setLineDash([3, 3]); g.lineWidth = 1;
      g.beginPath(); g.moveTo(pad, Y(0)); g.lineTo(w - pad, Y(0)); g.stroke(); g.setLineDash([]);
      g.strokeStyle = pts[pts.length - 1] >= 0 ? '#9fcf8a' : '#e07a6a'; g.lineWidth = 2;
      g.beginPath(); pts.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)))); g.stroke();
      g.fillStyle = g.strokeStyle; g.beginPath(); g.arc(X(pts.length - 1), Y(pts[pts.length - 1]), 3, 0, Math.PI * 2); g.fill();
    });
    return c;
  }

  function card(c, now) {
    const box = el('section', 'ag-card card mf');
    box.dataset.key = c.key;
    const top = el('div', 'mf-top');
    const h = el('h2', null, c.name + (c.last4 ? ' · …' + c.last4 : ''));
    top.appendChild(h);
    top.appendChild(el('span', 'mf-st ' + (c.planOnly ? 'plan' : c.status.toLowerCase().replace(/\s+/g, '-')), c.planOnly ? 'PLAN · ' + c.status : c.status));
    box.appendChild(top);
    box.appendChild(el('p', 'mf-sub', 'MFFU ' + c.plan + (c.notInPlan ? ' · on your PC, not in the plan yet' : '') + (c.planOnly ? ' · PLAN only: the PC has not sent numbers for it' : '')));
    const big = el('div', 'mf-big');
    const tile = (label, v, cls) => { const d = el('div'); d.appendChild(el('b', cls || null, v)); d.appendChild(el('span', null, label)); big.appendChild(d); };
    tile('Balance', usd(c.balance.v, true));
    tile('P&L since start', sgn(c.pnl.v), c.pnl.v > 0 ? 'pos' : c.pnl.v < 0 ? 'neg' : '');
    tile('Drawdown floor', usd(c.floor.v, true));
    tile('Left to the floor', usd(c.room.v, true), c.room.v != null && c.mll && c.room.v < c.mll * 0.35 ? 'neg' : '');
    box.appendChild(big);
    box.appendChild(el('p', 'note', 'Numbers: ' + src(c.balance.src, c.balance.t, now)));
    const dl = el('dl');
    row(dl, 'Start date', day(c.start_date.v), src(c.start_date.src, c.start_date.t, now));
    if (c.room.v != null && c.mll) {
      const w = el('div'); w.appendChild(document.createTextNode(usd(c.room.v) + ' of ' + usd(c.mll) + ' max loss left')); w.appendChild(bar(c.room.v / c.mll, 'dd'));
      row(dl, 'Trailing drawdown', w, 'trails the best end-of-day balance; stops at start + $100. Touch it = account ends');
    }
    if (c.target) {
      const w = el('div');
      w.appendChild(document.createTextNode(usd(c.target.v) + ' (balance ' + usd(c.target.balance) + '): ' + (c.target.left != null ? (c.target.left <= 0 ? 'reached' : usd(c.target.left) + ' to go') : '-')));
      w.appendChild(bar(c.target.progress));
      row(dl, 'Profit target', w, c.target.progress != null ? Math.round(c.target.progress * 100) + '% done · ' + src(c.target.src, c.target.t, now) : '');
    }
    row(dl, 'Trading days', (c.days.v == null ? '-' : String(c.days.v)) + (c.days.min != null ? ' (min ' + c.days.min + ' ' + c.days.min_text + ')' : ''),
        (c.days.session != null ? 'bot session #' + c.days.session + ' · ' : '') + src(c.days.src, c.days.t, now));
    const cs = c.consistency;
    row(dl, 'Consistency', cs.pct != null ? 'best day ' + usd(cs.best) + ' = ' + cs.pct + '% of ' + usd(cs.base) + (c.stage === 'funded' ? (cs.ok ? ' (OK, max 50%)' : ' (over 50%)') : '')
        : cs.best != null ? 'best day ' + usd(cs.best) : '-', 'Rule: ' + cs.rule + (cs.src ? ' · ' + src(cs.src, cs.t, now) : ''), c.stage === 'funded' && cs.ok === false ? 'warn' : null);
    const d = c.dll;
    row(dl, 'Daily loss limit', d.v == null ? '-' : usd(d.used) + ' used of ' + usd(d.v) + (d.left != null ? ' · ' + usd(d.left) + ' left today' : ''),
        'soft: hitting it pauses the day only · ' + src(d.src, d.t, now));
    if (c.payout && c.payout.c) {
      const p = c.payout.c, w = el('div');
      w.appendChild(document.createTextNode(p.text));
      const ul = el('ul', 'coach-lines');
      if (p.ok) {
        ul.appendChild(el('li', null, 'Buffer: ' + usd(p.above_buffer) + ' above the ' + usd(M.rulesOf(c.plan).buffer) + ' buffer (profit ' + usd(p.profit) + ')'));
        ul.appendChild(el('li', null, 'Minimum request ' + usd(M.rulesOf(c.plan).pay_min) + ', maximum ' + usd(M.rulesOf(c.plan).pay_max) + '; you keep 80%'));
        ul.appendChild(el('li', null, 'Days this cycle: ' + p.cycle_days + ' of ' + p.cycle_days_need + (p.eligible_from ? ' · first request from ' + day(p.eligible_from) : '')));
        ul.appendChild(el('li', p.request_today > 0 ? 'ok' : null, 'Requestable now: ' + usd(p.request_today, true) + (p.request_today > 0 ? ' (' + usd(p.to_you) + ' to you, ' + usd(p.net) + ' after the 30% tax pot)' : '')));
        for (const why of (p.why || []).slice(0, 3)) ul.appendChild(el('li', 'warn', why));
      }
      w.appendChild(ul);
      row(dl, 'Payout', w, src(c.payout.src, c.payout.t, now));
    }
    const t = c.trades;
    row(dl, 'Trades', t.n == null ? '-' : t.n + (t.n ? ' · win rate ' + t.win_pct + '% (' + t.w + ' won)' : ''), src(t.src, t.t, now));
    row(dl, 'Best day', t.best ? usd(t.best.v, true) + ' · ' + day(t.best.day) : '-', t.best ? 'PC ledger' : '', t.best && t.best.v > 0 ? 'pos' : null);
    row(dl, 'Worst day', t.worst ? usd(t.worst.v, true) + ' · ' + day(t.worst.day) : '-', t.worst ? 'PC ledger' : '', t.worst && t.worst.v < 0 ? 'neg' : null);
    box.appendChild(dl);
    if (c.equity.pts.length >= 2) {
      box.appendChild(equity(c.equity.pts));
      box.appendChild(el('p', 'note', 'Equity: ' + src(c.equity.src, c.equity.t, now)));
    } else box.appendChild(el('p', 'eq-none', 'Equity line: needs 2 traded days from the PC.'));
    return box;
  }

  async function load() {
    const [plan, board, home] = await Promise.all([getJSON('accounts.json'), getJSON('../board/board.json'), getJSON('../home.json')]);
    let lite = null;
    try { if (window.PC_FEED) lite = await window.PC_FEED.fetchLatest({}); } catch (e) { /* none */ }
    try { if (window.EDGE_CHIP) window.EDGE_CHIP.update(lite); } catch (e) { /* never the page */ }
    const now = nowS();
    const cs = M.cards({ lite, home, plan, board, coach: window.PAYOUT_COACH, today: todayET() }, now);
    const list = $('list'); list.textContent = '';
    for (const c of cs) list.appendChild(card(c, now));
    const pl = M.planned(plan), ul = $('planned'); ul.textContent = '';
    for (const a of pl) ul.appendChild(el('li', null, a.name + ' · ' + (a.plan || '') + ' · ' + (a.cost || '') + ' · PLAN'));
    $('plannedBox').hidden = !pl.length;
    const lt = isObj(lite) ? +((lite.reporter && lite.reporter.t) || lite.t || 0) : 0;
    $('status').textContent = lt ? 'From your PC, last report ' + ago(now - lt) + (now - lt > 1800 ? ': OLD, the PC may be silent.' : '.')
      : board ? 'The PC feed did not answer: numbers from the Board copy (' + ago(now - (+board.t || now)) + ') and the plan.' : 'Plan only: no live numbers yet.';
    $('foot').textContent = 'Read only. Payouts are requested by you in the MFFU dashboard, never by the bot. Plan updated ' + ((plan && plan.updated) || '?') + '.';
    window.MFFU_PAGE.last = cs;
    window.MFFU_PAGE.ready = true;
  }

  window.MFFU_PAGE = { load, last: null, ready: false };
  document.addEventListener('DOMContentLoaded', () => {
    $('refresh').addEventListener('click', load);
    load();
    setInterval(() => { if (!document.hidden) load(); }, 120000);
  });
})();
