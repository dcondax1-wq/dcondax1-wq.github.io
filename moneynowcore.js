// "Money now" (2026-11-04, owner: the one card that answers in 5 seconds). Read-only display; it never posts, arms, routes or sizes anything.
// ONE renderer for both dashboards: tools/web_public/moneynowcore.js = web_next/js/next/moneynowcore.js (byte-identical, classic script ->
// window.MoneyNow). It reads only what the pages already have: MissionUI.accounts(M) (the live board: Zlarior 50K, ATLAS 25K, BLITZ 25K when it
// has its own account) and StatusUI (the PC bot's check-in from the same board). Per account:
//   Drawdown left $X of $max loss   (the room to the MFFU floor out of the full max loss: never "X of 10 days")
//   Today +/-$                      the account's P&L today
//   Next                            the next thing the bot is waiting for (open trade: its stop / target; else the board's own line)
//   Status                          Armed / In a trade / Running / Done for today / Blocked / Eval passed ... in plain words
// and a red / amber / green edge: red = a block, a failed eval or under 25% of the drawdown left; amber = under 50% left, a missing field or
// a quiet PC; green otherwise. A field the board does not carry says "not published yet" (never a blank). Zlarior and ATLAS always show;
// BLITZ only when it exists.
//   MoneyNow.model(M)          -> { rows: [{ key, name, size, color, edge, room, mll, today, status, next, page }], bot: { text, edge }, edge, age }
//   MoneyNow.html(M, { where: 'phone' | 'pc', go: (page) => attribute text })   the card (a string; every number goes through esc())
//   MoneyNow.line(M, { where, go })   the one-line status strip for every page: "<dot> Bot running · last check-in 2m ago · Armed: Zlarior, ATLAS" (a >= 44 px tap target)
//   MoneyNow.css()             adds the style once
(function () {
  'use strict';
  const V = 1;
  const NP = 'not published yet';
  const okN = (v) => typeof v === 'number' && Number.isFinite(v);
  const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  const arr = (x) => (Array.isArray(x) ? x : []);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const usd = (v) => (okN(v) ? (v < 0 ? '-' : '') + '$' + Math.abs(Math.round(v)).toLocaleString('en-US') : null);
  const susd = (v) => (okN(v) ? (v > 0 ? '+' : v < 0 ? '-' : '') + '$' + Math.abs(Math.round(v)).toLocaleString('en-US') : null);
  const px = (v) => (okN(v) ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : null);
  const ROWS = [
    { key: 'lit', name: 'Zlarior', size: '50K', color: '#4f9bff', page: { phone: 'lit', pc: 'zlarior' }, always: true },
    { key: 'atlas', name: 'ATLAS', size: '25K', color: '#ff9a3d', page: { phone: 'atlas', pc: 'atlas' }, always: true },
    { key: 'blitz', name: 'BLITZ', size: '25K', color: '#b388ff', page: { phone: 'blitz', pc: 'blitz' }, always: false },
  ];
  const RANK = { good: 0, idle: 0, warn: 1, bad: 2 };
  const worst = (a, b) => (RANK[b] > RANK[a] ? b : a);

  // the PC bot's check-in in plain words, from the same board the status bar reads
  function botLine(M) {
    let it = null;
    try { it = window.StatusUI && window.StatusUI.items ? window.StatusUI.items(M).find((x) => x && x.k === 'pc') : null; } catch (e) { it = null; }
    if (!it) return { text: `Bot: ${NP}`, edge: 'warn' };
    const v = String(it.value || '');
    if (it.lvl === 'good') return { text: v === 'live' ? 'Bot running' : `Bot running · last check-in ${v}`, edge: 'good' };
    if (/stopped/.test(v)) return { text: 'Bot stopped', edge: 'bad' };
    if (/no report/.test(v)) return { text: `Bot: ${NP}`, edge: 'warn' };
    if (/weekend/.test(v)) return { text: 'Bot off for the weekend (fine)', edge: 'good' };
    if (/^quiet/.test(v)) return { text: `Bot quiet ${v.replace(/^quiet\s*/, '')}: check the PC`, edge: it.lvl === 'bad' ? 'bad' : 'warn' };
    return { text: `Bot ${v || NP}`, edge: it.lvl === 'bad' ? 'bad' : 'warn' };
  }

  function statusWords(A, botEdge) {
    if (A.pos) return { text: `In a trade · ${String(A.pos.side || '').toLowerCase()}${A.pos.qty ? ' ' + A.pos.qty + ' micros' : ''}`, edge: 'good' };
    const bl = arr(A.blocks).filter((b) => b && b.kind !== 'passed');
    if (bl.length) return { text: 'Blocked', edge: 'bad' };
    if (/passed/.test(A.status || '')) return { text: 'Eval passed', edge: 'good' };
    if (/failed|lost/.test(A.status || '')) return { text: 'Eval ended', edge: 'bad' };
    if (A.state === 'off') return { text: 'Off', edge: 'warn' };
    if (botEdge === 'bad') return { text: 'Not running', edge: 'bad' };
    if (botEdge === 'warn') return { text: 'No fresh report', edge: 'warn' };   // QA6: a quiet PC (5 days) is not "Running"
    if (A.doneToday) return { text: 'Done for today', edge: 'good' };
    if (A.armed) return { text: 'Armed', edge: 'good' };
    return { text: 'Running', edge: 'good' };
  }

  // the next thing the bot waits for: an open trade waits for its stop or target; otherwise the board's own line for the bot
  function nextWords(A, M) {
    if (A.pos) {
      const t = px(A.pos.target), s = px(A.pos.stop);
      if (t || s) return `the ${t ? 'target ' + t : ''}${t && s ? ' or ' : ''}${s ? 'the stop ' + s : ''}`;
    }
    let t = '';
    try { t = window.StatusUI && window.StatusUI.oneLine ? window.StatusUI.oneLine(A, M).text : ''; } catch (e) { t = ''; }
    t = String(t || A.waiting || '').replace(/\s+/g, ' ').trim();
    if (!t || /^(watching|no data yet)$/i.test(t)) return NP;
    return t.slice(0, 120);
  }

  function rowOf(def, A, M, bot) {
    if (!A || A.placeholder) {
      return { key: def.key, name: def.name, size: def.size, color: def.color, page: def.page, edge: 'warn', room: null, mll: null, today: null, status: { text: NP, edge: 'warn' }, next: NP, have: false };
    }
    const room = okN(A.room) ? A.room : null, mll = okN(A.mll) ? A.mll : null, today = okN(A.today) ? A.today : null;
    const st = statusWords(A, bot.edge);
    const frac = room != null && mll ? room / mll : (okN(A.roomFrac) ? A.roomFrac : null);
    let edge = 'good';
    if (st.edge === 'bad' || (room != null && room <= 0) || (frac != null && frac < 0.25)) edge = 'bad';
    else if (st.edge === 'warn' || room == null || mll == null || today == null || (frac != null && frac < 0.5) || bot.edge !== 'good') edge = 'warn';
    // a paper / cloud ledger (the cloud monitor's twin of LIT): never read as a real account (2026-11-18, the ZEUS card above has the real ones)
    return { key: def.key, name: (A.paper ? 'Paper test · ' : '') + (A.name || def.name), size: A.size || def.size, color: A.color || def.color, page: def.page, edge, room, mll, today, status: st, next: nextWords(A, M), have: true };
  }

  function model(M) {
    M = obj(M);
    let As = [];
    try { As = window.MissionUI && window.MissionUI.accounts ? window.MissionUI.accounts(M) || [] : []; } catch (e) { As = []; }
    const by = {};
    for (const a of As) if (a && a.key && !by[a.key]) by[a.key] = a;
    const bot = botLine(M);
    const rows = ROWS.filter((d) => !(d.key === 'blitz' && globalThis.OLY_HIDDEN && globalThis.OLY_HIDDEN.has('blitz'))) // hidden bots (owner 2026-11-15)
      .filter((d) => d.always || (by[d.key] && !by[d.key].placeholder)).map((d) => rowOf(d, by[d.key], M, bot));
    let edge = bot.edge === 'idle' ? 'good' : bot.edge;
    for (const r of rows) edge = worst(edge, r.edge);
    const t = okN(+obj(M.board).data_t) ? +obj(M.board).data_t : null;
    return { rows, bot, edge, age: t };
  }

  function ago(t, now) {
    if (!okN(t)) return NP;
    const s = Math.max(0, Math.round((okN(now) ? now : Date.now() / 1000) - t));
    return s < 90 ? 'just now' : s < 3600 ? Math.round(s / 60) + 'm ago' : s < 86400 ? Math.round(s / 3600) + 'h ago' : Math.round(s / 86400) + 'd ago';
  }
  const cls = (e) => (e === 'bad' ? 'r' : e === 'warn' ? 'a' : 'g');

  function html(M, o) {
    o = o || {};
    const where = o.where === 'pc' ? 'pc' : 'phone';
    const mo = model(M);
    const go = typeof o.go === 'function' ? o.go : (p) => (where === 'pc' ? `data-goto="${p}"` : `data-go="${p}"`);
    const rows = mo.rows.map((r) => {
      const dd = r.room != null ? `<strong>${esc(usd(r.room))}</strong>` : `<strong class="np">${NP}</strong>`;
      const of = r.mll != null ? `<small>of ${esc(usd(r.mll))} max loss</small>` : (r.room != null ? `<small>of max loss: ${NP}</small>` : '');
      const td = r.today != null ? `<strong class="${r.today > 0 ? 'up' : r.today < 0 ? 'dn' : ''}">${esc(susd(r.today))}</strong><small>today</small>` : `<strong class="np">${NP}</strong><small>today</small>`;
      return `<a class="mn-row ${cls(r.edge)}" ${go(where === 'pc' ? r.page.pc : r.page.phone)} role="link" tabindex="0" style="--c:${esc(r.color)}" data-mn="${esc(r.key)}">
        <span class="mn-l"><b class="mn-n">${esc(r.name)} <i>${esc(r.size)}</i></b><span class="mn-dd"><em>Drawdown left</em>${dd}${of}</span></span>
        <span class="mn-r">${td}</span>
        <span class="mn-st"><em>${esc(r.status.text)}</em></span>
        <span class="mn-nx"><em>Next</em> ${esc(r.next)}</span></a>`;
    }).join('');
    return `<section class="mn-card ${cls(mo.edge)}" id="mnCard" aria-label="Money now">
      <header class="mn-h"><h3>Money now</h3><span class="mn-bot ${cls(mo.bot.edge)}">${esc(mo.bot.text)}</span></header>${rows}
      <footer class="mn-f">Drawdown left = $ you can still lose before MFFU closes the account. Updated ${esc(mo.age != null ? ago(mo.age, M && M.now) : NP)}.</footer></section>`;
  }

  // the one-line strip (sticky on the PC dashboard): bot state, last check-in age, which bots are armed. Never blank: a missing field says so.
  function line(M, o) {
    o = o || {};
    const where = o.where === 'phone' ? 'phone' : 'pc';
    const mo = model(M);
    const go = typeof o.go === 'function' ? o.go : (p) => (where === 'pc' ? `data-goto="${p}"` : `data-go="${p}"`);
    let txt = mo.bot.text;
    if (mo.age != null && !/check-in|weekend|stopped|quiet/.test(txt) && mo.bot.edge === 'good') txt += ` · checked in ${ago(mo.age, M && M.now)}`;
    // armed = the account trades for real (the board's badge LIVE: armed with the live phrase) or has a setup armed / a trade open.
    // Was: only a setup waiting counted, so a LIVE ARMED bot with no pending setup showed "Nothing armed" (owner screenshot 2026-11-16)
    const B = obj(obj(M).board);
    const liveArmed = (r) => mo.bot.edge !== 'bad' && /LIVE|REAL/i.test(String(obj(B[r.key]).badge || ''));
    const on = mo.rows.filter((r) => r.have && (liveArmed(r) || /^Armed/.test(r.status.text) || /^In a trade/.test(r.status.text))).map((r) => r.name);
    const arm = on.length ? `Armed: ${on.join(', ')}` : (mo.rows.some((r) => r.have) ? 'Nothing armed' : `Armed: ${NP}`);
    return `<a class="mn-line ${cls(mo.bot.edge)}" ${go(where === 'pc' ? 'cc' : 'lit')} role="link" tabindex="0" data-mnline="1"><i class="mn-dot" aria-hidden="true"></i><b>${esc(txt)}</b><span>${esc(arm)}</span></a>`;
  }

  const CSS = `
.mn-card{position:relative;border-radius:20px;padding:12px 12px 10px;margin:0 0 12px;background:linear-gradient(180deg,rgba(var(--oly-th-n5-rgb, 22,26,38),.88),rgba(var(--oly-th-n3-rgb, 11,13,21),.84));border:1px solid rgba(160,170,220,.16);box-shadow:inset 0 1px 0 rgba(255,255,255,.07)}
.mn-card::before{content:"";position:absolute;left:14px;right:14px;top:0;height:3px;border-radius:0 0 3px 3px;background:var(--mn,var(--oly-th-g8, #2ee59d));box-shadow:0 0 14px var(--mn,var(--oly-th-g8, #2ee59d))}
.mn-card.g{--mn:var(--good,var(--oly-th-g8, #2ee59d))}.mn-card.a{--mn:var(--warn,var(--oly-th-a10, #f7b955))}.mn-card.r{--mn:var(--bad,var(--oly-th-r11, #ff5a7a))}
.pl-hi>.mn-card{flex:1 0 100%;margin:8px 0 0}
.mn-h{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin:4px 2px 8px}
.mn-h h3{margin:0;font:750 17px/1.2 var(--sans,system-ui);letter-spacing:-.01em;color:var(--ink,var(--oly-th-n38, #eef1f8))}
.mn-bot{font:650 12px/1 var(--sans,system-ui);padding:7px 10px;border-radius:999px;border:1px solid currentColor;color:var(--good-ink,var(--oly-th-g10, #4ff0ae));min-height:28px;display:inline-flex;align-items:center}
.mn-bot.a{color:var(--warn,var(--oly-th-a10, #f7b955))}.mn-bot.r{color:var(--bad,var(--oly-th-r11, #ff5a7a))}
.mn-row{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"n st" "dd r" "nx nx";column-gap:10px;row-gap:2px;align-items:center;min-height:64px;padding:8px 10px 8px 14px;margin:0 0 6px;border-radius:14px;text-decoration:none;color:var(--ink,var(--oly-th-n38, #eef1f8));background:rgba(255,255,255,.035);border:1px solid rgba(160,170,220,.1);cursor:pointer;-webkit-tap-highlight-color:transparent}
.mn-row::before{content:"";position:absolute;left:0;top:8px;bottom:8px;width:4px;border-radius:0 4px 4px 0;background:var(--e,var(--oly-th-g8, #2ee59d))}
.mn-row.g{--e:var(--good,var(--oly-th-g8, #2ee59d))}.mn-row.a{--e:var(--warn,var(--oly-th-a10, #f7b955))}.mn-row.r{--e:var(--bad,var(--oly-th-r11, #ff5a7a))}
.mn-row:active{background:rgba(255,255,255,.07)}
.mn-l{display:contents}
.mn-n{grid-area:n;display:block;font:700 14px/1.2 var(--sans,system-ui);color:var(--c)}.mn-n i{font-style:normal;font-weight:600;font-size:12px;color:var(--muted,var(--oly-th-n24, #8b94a8))}
.mn-dd{grid-area:dd;display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;font-variant-numeric:tabular-nums;min-width:0}
.mn-dd em{flex:1 0 100%;font-style:normal;font-size:11.5px;line-height:1.2;color:var(--ink-2,var(--oly-th-n29, #a9b1c3))}.mn-dd strong{font:760 19px/1.1 var(--sans,system-ui);color:var(--ink,var(--oly-th-n38, #eef1f8))}.mn-dd small{font-size:11.5px;color:var(--muted,var(--oly-th-n24, #8b94a8))}
.mn-row.r .mn-dd strong{color:var(--bad,var(--oly-th-r11, #ff5a7a))}
.mn-r{grid-area:r;display:flex;align-items:baseline;gap:5px;font-variant-numeric:tabular-nums}.mn-r strong{font:740 16px/1.1 var(--sans,system-ui)}.mn-r small{font-size:11px;color:var(--muted,var(--oly-th-n24, #8b94a8))}
.mn-card .up{color:var(--good-ink,var(--oly-th-g10, #4ff0ae))}.mn-card .dn{color:var(--bad,var(--oly-th-r11, #ff5a7a))}.mn-card .np{font-size:12.5px;font-weight:600;color:var(--muted,var(--oly-th-n24, #8b94a8))}
.mn-st{grid-area:st;justify-self:end;font-size:12px}.mn-st em{font-style:normal;font-weight:700;color:var(--e)}
.mn-nx{grid-area:nx;font-size:12.5px;line-height:1.3;color:var(--ink-2,var(--oly-th-n29, #a9b1c3));overflow-wrap:anywhere}.mn-nx em{font-style:normal;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted,var(--oly-th-n24, #8b94a8))}
.mn-f{margin:4px 4px 0;font-size:11px;line-height:1.35;color:var(--muted,var(--oly-th-n24, #8b94a8))}
.mn-line{display:flex;align-items:center;gap:10px;min-height:44px;padding:6px 14px;box-sizing:border-box;border-radius:12px;text-decoration:none;cursor:pointer;color:var(--ink,var(--oly-th-n38, #eef1f8));font:600 13px/1.25 var(--sans,system-ui);background:rgba(var(--oly-th-n3-rgb, 14,17,27),.9);border:1px solid rgba(160,170,220,.16);-webkit-tap-highlight-color:transparent}
.mn-line b{font-weight:700;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mn-line span{margin-left:auto;font-weight:600;font-size:12.5px;color:var(--ink-2,var(--oly-th-n29, #a9b1c3));white-space:nowrap}
.mn-dot{flex:0 0 auto;width:10px;height:10px;border-radius:50%;background:var(--e,var(--oly-th-g8, #2ee59d));box-shadow:0 0 10px var(--e,var(--oly-th-g8, #2ee59d))}
.mn-line.g{--e:var(--good,var(--oly-th-g8, #2ee59d))}.mn-line.a{--e:var(--warn,var(--oly-th-a10, #f7b955))}.mn-line.r{--e:var(--bad,var(--oly-th-r11, #ff5a7a))}.mn-line.r b{color:var(--bad,var(--oly-th-r11, #ff5a7a))}
@media (max-width:560px){.mn-line span{display:none}}
@media (min-width:900px){.mn-dd em{flex:0 0 auto}.mn-row{grid-template-columns:minmax(110px,.6fr) minmax(0,1.5fr) auto minmax(0,.9fr);grid-template-areas:"n dd r st" "nx nx nx nx"}}
:root[data-theme="light"] .mn-card{background:linear-gradient(180deg,#fff,#f6f8fc);border-color:rgba(20,30,60,.1)}
:root[data-theme="light"] .mn-row{background:rgba(20,30,60,.03);border-color:rgba(20,30,60,.08)}
:root[data-theme="light"] .mn-line{background:#fff;border-color:rgba(20,30,60,.1);color:#1a2233}
:root[data-theme="light"] .mn-h h3,:root[data-theme="light"] .mn-dd strong{color:#1a2233}
`;
  function css() { if (typeof document === 'undefined' || document.getElementById('mn-css')) return; const s = document.createElement('style'); s.id = 'mn-css'; s.textContent = CSS; document.head.appendChild(s); }

  window.MoneyNow = { version: V, model, html, line, css, NP };
})();
