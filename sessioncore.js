// "Today's session" timeline (2026-11-04, owner: make money by NOT breaking rules). Read-only display; it never posts, arms, routes or sizes anything.
// One renderer, classic script -> window.SessionDay. It answers on Zenith Home, right under Money now:
//   the day's windows in ET with the bot's rule in plain words (01:45 game plan, 02:00-15:30 entry window, 15:55 flat, 16:05 recap),
//   what the bot is doing now, flags (high-impact news from the calendar the pages already carry; a US/CME holiday from the calendar rules below),
//   ONE sentence "what to do now", and the exact time left to the next window (H:MM:SS, ticking).
// Reads only what the pages already have: M.now, M.news ([{ t, title, impact }], optional), MissionUI.accounts(M) (the Zlarior account: position,
// armed, blocks, done today) and MoneyNow.model(M).bot (the PC bot's check-in). A missing field says "not published yet", never a blank.
//   SessionDay.model(M)          -> { day, mode, pill, edge, rows, news, newsKnown, holiday, doing, left, bot }
//   SessionDay.html(M, { go })   the card (a string; every value goes through esc())
//   SessionDay.tick(root, now)   updates the [data-sd-cd] countdowns inside root (call every second)
//   SessionDay.css()             adds the style once
//   SessionDay.holidays(year)    { 'YYYY-MM-DD': name } the US holidays on which CME equity hours change (no early-close times are claimed)
(function () {
  'use strict';
  const V = 1;
  const NP = 'not published yet';
  const okN = (v) => typeof v === 'number' && Number.isFinite(v);
  const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  const arr = (x) => (Array.isArray(x) ? x : []);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nowS = () => Date.now() / 1000;

  // ---- New York time (the sessions are ET all year, DST included)
  const DTF = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' });
  function etp(t) {
    const o = {};
    for (const p of DTF.formatToParts(new Date(t * 1000))) o[p.type] = p.value;
    const h = +o.hour % 24, mi = +o.minute;
    return { y: +o.year, mo: +o.month, d: +o.day, h, mi, wd: o.weekday, min: h * 60 + mi };
  }
  function etEpoch(y, mo, d, min) {                        // epoch seconds of ET y-mo-d at `min` minutes after midnight
    let t = Date.UTC(y, mo - 1, d, 0, 0) / 1000 + min * 60 + 5 * 3600;
    for (let i = 0; i < 2; i++) { const p = etp(t); let dd = p.min - min; if (dd > 720) dd -= 1440; if (dd < -720) dd += 1440; t -= dd * 60; }
    return t;
  }
  const addDays = (y, mo, d, n) => { const x = new Date(Date.UTC(y, mo - 1, d + n)); return { y: x.getUTCFullYear(), mo: x.getUTCMonth() + 1, d: x.getUTCDate() }; };
  const wdOf = (y, mo, d) => new Date(Date.UTC(y, mo - 1, d)).getUTCDay();         // 0 = Sunday
  const key = (y, mo, d) => `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const hm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // ---- US holidays on which CME equity-index hours change (rules, no feed): the early-close times are NOT claimed, the card says "check the CME calendar"
  function holidays(y) {
    const nth = (m, wd, n) => { let d = 1 + ((wd - wdOf(y, m, 1) + 7) % 7) + 7 * (n - 1); return d; };
    const last = (m, wd) => { const ld = new Date(Date.UTC(y, m, 0)).getUTCDate(); return ld - ((wdOf(y, m, ld) - wd + 7) % 7); };
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m2 = Math.floor((a + 11 * h + 22 * l) / 451);
    const em = Math.floor((h + l - 7 * m2 + 114) / 31), ed = ((h + l - 7 * m2 + 114) % 31) + 1;
    const gf = addDays(y, em, ed, -2);
    const tg = nth(11, 4, 4);
    const H = {};
    const put = (mo, dd, name) => { if (wdOf(y, mo, dd) !== 0 && wdOf(y, mo, dd) !== 6) H[key(y, mo, dd)] = name; };
    put(1, 1, "New Year's Day"); put(1, nth(1, 1, 3), 'Martin Luther King Day'); put(2, nth(2, 1, 3), "Presidents' Day"); put(gf.mo, gf.d, 'Good Friday');
    put(5, last(5, 1), 'Memorial Day'); put(6, 19, 'Juneteenth'); put(7, 4, 'Independence Day'); put(9, nth(9, 1, 1), 'Labor Day');
    put(11, tg, 'Thanksgiving'); put(11, tg + 1, 'the day after Thanksgiving'); put(12, 24, 'Christmas Eve'); put(12, 25, 'Christmas Day');
    return H;
  }
  function holidayOn(y, mo, d) { return holidays(y)[key(y, mo, d)] || null; }

  // ---- the day's windows (ET minutes). `end` is when a row stops being "now".
  const ROWS = [
    { key: 'plan', label: 'Game plan', start: 105, end: 120, go: 'mind', rule: 'The Mind writes today\'s plan. Read it; it never changes the bot.' },
    { key: 'window', label: 'Entry window (Zlarior)', start: 120, end: 930, go: 'lit', rule: 'The bot looks for a sweep, then the confirm. One trade a day at most, stop at the sweep, no entries after 15:30.' },
    { key: 'flat', label: 'Flat', start: 955, end: 965, go: 'lit', rule: 'Everything is closed by 15:55. No trade is ever carried.' },
    { key: 'recap', label: 'Recap', start: 965, end: 1020, go: null, href: 'journal/', rule: 'The day is written up. Review it in Mnemosyne.' },
  ];
  const timeOf = (r) => (r.key === 'window' ? `${hm(r.start)}–${hm(r.end)}` : hm(r.start));

  function botOf(M) {
    try { if (window.MoneyNow && window.MoneyNow.model) return window.MoneyNow.model(M).bot; } catch (e) { /* optional */ }
    return null;
  }
  function litOf(M) {
    try { const As = window.MissionUI && window.MissionUI.accounts ? window.MissionUI.accounts(M) || [] : []; const A = As.find((a) => a && a.key === 'lit'); return A && !A.placeholder ? A : null; } catch (e) { return null; }
  }
  const dur = (s) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`; };

  function model(M) {
    M = obj(M);
    const now = okN(+M.now) ? +M.now : nowS();
    const p = etp(now);
    const dow = wdOf(p.y, p.mo, p.d);
    const weekend = dow === 0 || dow === 6;
    // the day shown: today on a weekday, the next Monday over a weekend
    const D = weekend ? addDays(p.y, p.mo, p.d, dow === 0 ? 1 : 2) : { y: p.y, mo: p.mo, d: p.d };
    const dDow = wdOf(D.y, D.mo, D.d);
    const rows = ROWS.map((r) => ({ key: r.key, label: r.label, time: timeOf(r), rule: r.rule, go: r.go, href: r.href || null, t: etEpoch(D.y, D.mo, D.d, r.start), tEnd: etEpoch(D.y, D.mo, D.d, r.end), state: 'later' }));
    let mode;
    if (weekend) mode = 'weekend';
    else if (now < rows[0].t) mode = 'before';
    else if (now < rows[1].t) mode = 'plan';
    else if (now < etEpoch(D.y, D.mo, D.d, 930)) mode = 'open';
    else if (now < rows[2].t) mode = 'late';
    else if (now < rows[2].tEnd) mode = 'flat';
    else mode = 'over';
    let nextSet = false;
    for (const r of rows) {
      if (now >= r.tEnd && !weekend) r.state = 'done';
      else if (now >= r.t && now < r.tEnd && !weekend) r.state = 'now';
      else if (!nextSet) { r.state = 'next'; nextSet = true; }
    }
    // the next thing and the exact time left
    let left;
    const win = rows[1];
    if (mode === 'open') left = { kind: 'closes', label: 'Entry window closes', hm: '15:30', t: etEpoch(D.y, D.mo, D.d, 930) };
    else if (mode === 'over') {
      const n = addDays(D.y, D.mo, D.d, dDow === 5 ? 3 : 1);
      left = { kind: 'plan', label: `${WD[wdOf(n.y, n.mo, n.d)]}'s game plan`, hm: '01:45', t: etEpoch(n.y, n.mo, n.d, 105) };
    } else {
      const nx = rows.find((r) => r.t > now) || rows[0];
      left = { kind: nx.key, label: nx.key === 'window' ? 'Entry window opens' : nx.label, hm: hm(ROWS.find((r) => r.key === nx.key).start), t: nx.t };
      if (weekend) left.label = `${WD[dDow]}'s ${nx.key === 'window' ? 'entry window' : nx.label.toLowerCase()}`;
    }
    left.t = Math.round(left.t);
    left.left = left.t - now;
    // flags: news from the calendar the page carries, a holiday from the rules
    const newsKnown = Array.isArray(M.news);
    const dayEnd = etEpoch(D.y, D.mo, D.d, 1020);
    const news = arr(M.news).filter((n) => n && okN(+n.t) && +n.t > now - 600 && +n.t <= dayEnd && +n.t >= etEpoch(D.y, D.mo, D.d, 0) && /high|fomc/i.test(String(n.impact || 'high')))
      .sort((a, b) => a.t - b.t).slice(0, 4).map((n) => ({ t: +n.t, hm: (() => { const q = etp(+n.t); return hm(q.min); })(), title: String(n.title || 'News'), inWindow: +n.t >= win.t && +n.t < win.tEnd }));
    const nxD = addDays(D.y, D.mo, D.d, dDow === 5 ? 3 : 1);
    const hToday = holidayOn(D.y, D.mo, D.d), hNext = !hToday && (mode === 'over' || weekend) ? holidayOn(nxD.y, nxD.mo, nxD.d) : null;
    const holiday = hToday ? { name: hToday, when: weekend ? WD[dDow] : 'today' } : hNext ? { name: hNext, when: WD[wdOf(nxD.y, nxD.mo, nxD.d)] } : null;
    // what the bot is doing, and the one sentence
    const bot = botOf(M), A = litOf(M);
    const bl = A ? arr(A.blocks).filter((b) => b && b.kind !== 'passed') : [];
    const gap = A ? '' : ` (bot state: ${NP})`;     // added to the sentence while the bot's state matters (before / plan / open / late)
    let doing, todo, edge = 'good';
    if (mode === 'weekend') { doing = 'Market closed'; todo = `Nothing: the market is closed; the bot is back ${WD[dDow]} at 01:45 ET.`; edge = 'good'; }
    else if (bot && bot.edge === 'bad' && mode !== 'over') { doing = 'Not running'; todo = /stopped/i.test(bot.text) ? 'Check the PC: the bot is stopped; start it from the Start page.' : 'Check the PC: the bot has gone quiet; wake it up and check the internet.'; edge = 'bad'; }
    else if (A && A.pos) { doing = 'In a trade'; todo = mode === 'over' || mode === 'flat' ? 'Check the PC and NinjaTrader now: a trade is still open past the flat time.' : 'Nothing: a trade is open, so leave it; the bot manages the stop and closes everything by 15:55.'; edge = mode === 'over' || mode === 'flat' ? 'bad' : 'good'; }
    else if (bl.length && mode !== 'over') { doing = 'Blocked'; todo = `Nothing: the bot is blocked (${String(bl[0].text || 'a rule').replace(/\s+/g, ' ').replace(/[.]+$/, '').slice(0, 80)}); do not trade by hand.`; edge = 'bad'; }
    else if (mode === 'over') { doing = 'Flat · session over'; todo = 'You are flat, session over, review in Mnemosyne.'; }
    else if (mode === 'flat') { doing = 'Flat'; todo = 'Nothing: you are flat, the day is done and the recap comes at 16:05.'; }
    else if (A && A.doneToday) { doing = 'Done for today'; todo = 'Nothing: the bot is done for today; do not add a trade by hand.'; }
    else if (mode === 'late') { doing = 'No new entries'; todo = 'Nothing: no new entries now; the bot is flat by 15:55.'; }
    else if (A && A.armed) { doing = 'Armed · a setup is forming'; todo = 'Nothing: the bot is armed and a setup is forming; let it work.'; }
    else if (mode === 'open') { doing = 'Waiting for a sweep'; todo = 'Nothing: the bot is waiting for a sweep.'; }
    else if (mode === 'plan') { doing = 'Game plan time'; todo = 'Nothing: read the game plan; the entry window opens at 02:00 ET.'; }
    else { doing = 'Ready'; todo = 'Nothing: the entry window opens at 02:00 ET and the bot is ready.'; }
    if (gap && /^(before|plan|open|late)$/.test(mode) && doing !== 'Not running') todo = todo.replace(/\.$/, '') + gap + '.';
    if (edge === 'good' && (!A || (bot && bot.edge !== 'good'))) edge = 'warn';
    if (holiday && edge === 'good') edge = 'warn';
    const pill = { weekend: 'Market closed', before: 'Before the plan', plan: 'Game plan time', open: 'Entry window open', late: 'No new entries', flat: 'Flat time', over: 'Session over' }[mode];
    return { day: { ymd: key(D.y, D.mo, D.d), wd: WD[dDow], today: !weekend }, mode, pill, edge, rows, news, newsKnown, holiday, doing, todo, left, bot, hasBot: !!A };
  }

  const cls = (e) => (e === 'bad' ? 'r' : e === 'warn' ? 'a' : 'g');
  function html(M, o) {
    o = o || {};
    const go = typeof o.go === 'function' ? o.go : (p) => `data-go="${p}"`;
    const m = model(M);
    const mark = { done: '✓', now: '●', next: 'next', later: '' };
    const rowHtml = m.rows.map((r) => {
      const attr = r.go ? go(r.go) : `href="${esc(r.href)}"`;
      const showRule = r.state === 'now' || (r.state === 'next' && !m.rows.some((x) => x.state === 'now'));      // the rule in full for the current / next row; the others stay one line (the title has it)
      return `<li><a class="sd-row sd-${r.state}" ${attr} role="link" data-sd="${esc(r.key)}" title="${esc(r.rule)}"><span class="sd-t">${esc(r.time)}</span><span class="sd-m"><b>${esc(r.label)}</b>${showRule ? `<em>${esc(r.rule)}</em>` : ''}</span><span class="sd-s">${esc(mark[r.state])}</span></a></li>`;
    }).join('');
    const flags = [];
    if (m.holiday) flags.push(`<li><a class="sd-flag a" ${go('news')} role="link"><span class="sd-t">Holiday</span><span class="sd-m"><b>${esc(m.holiday.name)} (${esc(m.holiday.when)})</b><em>CME hours can be shortened or closed: check the CME calendar. The bot follows its own clock.</em></span></a></li>`);
    for (const n of m.news) flags.push(`<li><a class="sd-flag a" ${go('news')} role="link"><span class="sd-t">${esc(n.hm)}</span><span class="sd-m"><b>${esc(n.title)}</b><em>High-impact news${n.inWindow ? ' inside the entry window' : ''}</em></span></a></li>`);
    if (!m.news.length) flags.push(`<li><a class="sd-flag" ${go('news')} role="link"><span class="sd-t">News</span><span class="sd-m"><b>${m.newsKnown ? 'No big US news left today' : `News calendar: ${NP}`}</b><em>The calendar the bots read</em></span></a></li>`);
    const lt = m.left;
    const leftLine = `<span class="sd-next">${lt.kind === 'closes' ? '' : 'Next: '}${esc(lt.label)} ${esc(lt.hm)} ET</span><strong class="sd-cd" data-sd-cd="${lt.t}">${esc(dur(lt.left))}</strong>`;
    return `<section class="sd-card ${cls(m.edge)}" id="sdCard" aria-label="Today's session">
      <header class="sd-h"><h3>${m.day.today ? "Today's session" : `${esc(m.day.wd)}'s session`}</h3><span class="sd-pill ${cls(m.edge)}">${esc(m.pill)}</span></header>
      <div class="sd-box"><span class="sd-do"><em>Bot now</em>${esc(m.doing)}</span><p class="sd-todo"><em>What to do now</em>${esc(m.todo)}</p><div class="sd-left">${leftLine}</div></div>
      <ul class="sd-list">${rowHtml}</ul><ul class="sd-list sd-fl">${flags.join('')}</ul>
      <footer class="sd-f">All times New York (ET). Read-only: this card never arms, routes or changes the bot.</footer></section>`;
  }

  function tick(root, now) {
    if (!root || !root.querySelectorAll) return;
    const n = okN(now) ? now : nowS();
    root.querySelectorAll('[data-sd-cd]').forEach((el) => { const t = +el.getAttribute('data-sd-cd'); if (okN(t)) el.textContent = dur(t - n); });
  }

  const CSS = `
.sd-card{position:relative;border-radius:20px;padding:12px 12px 10px;margin:0 0 12px;background:linear-gradient(180deg,rgba(var(--oly-th-n5-rgb, 22,26,38),.88),rgba(var(--oly-th-n3-rgb, 11,13,21),.84));border:1px solid rgba(160,170,220,.16);box-shadow:inset 0 1px 0 rgba(255,255,255,.07)}
.sd-card::before{content:"";position:absolute;left:14px;right:14px;top:0;height:3px;border-radius:0 0 3px 3px;background:var(--sd,var(--oly-th-g8, #2ee59d));box-shadow:0 0 14px var(--sd,var(--oly-th-g8, #2ee59d))}
.sd-card.g{--sd:var(--good,var(--oly-th-g8, #2ee59d))}.sd-card.a{--sd:var(--warn,var(--oly-th-a10, #f7b955))}.sd-card.r{--sd:var(--bad,var(--oly-th-r11, #ff5a7a))}
.pl-hi>.sd-card{flex:1 0 100%;margin:8px 0 0}
.sd-h{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin:4px 2px 8px}
.sd-h h3{margin:0;font:750 17px/1.2 var(--sans,system-ui);letter-spacing:-.01em;color:var(--ink,var(--oly-th-n38, #eef1f8))}
.sd-pill{font:650 12px/1 var(--sans,system-ui);padding:7px 10px;border-radius:999px;border:1px solid currentColor;color:var(--good-ink,var(--oly-th-g10, #4ff0ae));min-height:28px;display:inline-flex;align-items:center}
.sd-pill.a{color:var(--warn,var(--oly-th-a10, #f7b955))}.sd-pill.r{color:var(--bad,var(--oly-th-r11, #ff5a7a))}
.sd-box{padding:10px 12px;margin:0 0 8px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(160,170,220,.1)}
.sd-box em,.sd-todo em{display:block;font-style:normal;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted,var(--oly-th-n24, #8b94a8));margin:0 0 2px}
.sd-do{display:block;font:700 14px/1.25 var(--sans,system-ui);color:var(--sd,var(--ink,var(--oly-th-n38, #eef1f8)));margin:0 0 8px}
.sd-todo{margin:0 0 8px;font:650 15px/1.35 var(--sans,system-ui);color:var(--ink,var(--oly-th-n38, #eef1f8));overflow-wrap:anywhere}
.sd-left{display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:12.5px;color:var(--ink-2,var(--oly-th-n29, #a9b1c3))}
.sd-cd{font:760 19px/1.1 var(--sans,system-ui);font-variant-numeric:tabular-nums;color:var(--ink,var(--oly-th-n38, #eef1f8))}
.sd-list{list-style:none;margin:0 0 6px;padding:0;display:grid;gap:6px}
.sd-row,.sd-flag{display:grid;grid-template-columns:76px minmax(0,1fr) auto;gap:10px;align-items:center;min-height:48px;padding:7px 10px;border-radius:12px;text-decoration:none;color:var(--ink,var(--oly-th-n38, #eef1f8));background:rgba(255,255,255,.03);border:1px solid rgba(160,170,220,.08);cursor:pointer;-webkit-tap-highlight-color:transparent;box-sizing:border-box}
.sd-row:active,.sd-flag:active{background:rgba(255,255,255,.07)}
.sd-t{font:700 13px/1.2 var(--sans,system-ui);font-variant-numeric:tabular-nums;color:var(--ink-2,var(--oly-th-n29, #a9b1c3))}
.sd-m{display:block;min-width:0}.sd-m b{display:block;font:700 13.5px/1.25 var(--sans,system-ui)}.sd-m em{display:block;font-style:normal;font-size:12px;line-height:1.3;color:var(--muted,var(--oly-th-n24, #8b94a8));overflow-wrap:anywhere}
.sd-s{font:700 12px/1 var(--sans,system-ui);color:var(--muted,var(--oly-th-n24, #8b94a8));min-width:28px;text-align:right}
.sd-row.sd-now{border-color:var(--sd,var(--oly-th-g8, #2ee59d));background:rgba(255,255,255,.07)}.sd-row.sd-now .sd-s{color:var(--sd,var(--oly-th-g8, #2ee59d))}
.sd-row.sd-done{opacity:.72}.sd-row.sd-done .sd-s{color:var(--good,var(--oly-th-g8, #2ee59d))}.sd-row.sd-next .sd-s{color:var(--warn,var(--oly-th-a10, #f7b955))}
.sd-flag.a{border-color:rgba(var(--oly-th-a10-rgb, 247,185,85),.35)}.sd-flag.a .sd-t{color:var(--warn,var(--oly-th-a10, #f7b955))}
.sd-f{margin:4px 4px 0;font-size:11px;line-height:1.35;color:var(--muted,var(--oly-th-n24, #8b94a8))}
:root[data-theme="light"] .sd-card{background:linear-gradient(180deg,#fff,#f6f8fc);border-color:rgba(20,30,60,.1)}
:root[data-theme="light"] .sd-row,:root[data-theme="light"] .sd-flag,:root[data-theme="light"] .sd-now{background:rgba(20,30,60,.03);border-color:rgba(20,30,60,.08);color:#1a2233}
:root[data-theme="light"] .sd-h h3,:root[data-theme="light"] .sd-todo,:root[data-theme="light"] .sd-cd{color:#1a2233}
`;
  function css() { if (typeof document === 'undefined' || document.getElementById('sd-css')) return; const s = document.createElement('style'); s.id = 'sd-css'; s.textContent = CSS; document.head.appendChild(s); }

  window.SessionDay = { version: V, model, html, tick, css, holidays, NP };
})();
