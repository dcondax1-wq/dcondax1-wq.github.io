// Bot Brain (phone; loaded by index.html with one <script defer>; read-only): what the LIT bot is thinking right now.
// Data: the PC bot's Brain (engine/brain.compact) in live.pc.brain (live.json every ~60 s via live.js, and data.json from the
// heartbeat), else the cloud paper bot's own Brain (live.brain in data.json). Explainers: data.json brain_help.
// Tabs: Now (stage + what it waits for + pipeline + trade + sizing), Levels, Setups (each rule ✓ / ✗ with the numbers), Log.
// All bots (2026-11-17, owner: "a whole brain page where I see what's going on"; the default): one card per bot and account
// (Zlarior / LIT, ATLAS, Rapid EOD when on; never BLITZ) from live.pc.glance (engine/brain_glance.py, on the PC's 15-minute
// status and live.json): on / off + armed, today's $ and the room left, what it waits for, the last decision and why no
// trade, the open trade with $ risk / $ target, setups armed now + what triggers them, the levels, the last thought lines,
// and "PC last reported X min ago" (red when older than 20 min). Built with createElement + textContent only.
// Classic script that uses the main page's helpers (D, VIEWS, GROUPS, PAGES, P, icon, head, esc, num, cls, segHTML, onSeg).
(function () {
  'use strict';
  if (typeof GROUPS === 'undefined' || typeof VIEWS === 'undefined') return;
  const S = { tab: 'now', who: 'all' };
  const FRESH_S = 20 * 60;
  const p2 = (x) => (x == null ? '—' : num(x, 2));
  const sg = (x, d = 1) => (x == null ? '—' : (x > 0 ? '+' : '') + num(x, d));
  const okI = (b) => `<span class="bz-ok ${b ? 'y' : 'n'}">${b ? '✓' : '✗'}</span>`;
  const info = (k) => `<button type="button" class="bz-i" data-help="${esc(k)}" aria-label="What is this?">i</button>`;
  const STAT = { armed: ['Limit armed', 'warn'], tapped: ['Tapped · waiting 1m CISD', 'warn'], entering: ['Entering now', 'up'], filled: ['Filled', 'up'],
    no_fill: ['No fill', 'mut'], rejected: ['Rejected', 'dn'], blocked: ['Blocked', 'mut'] };
  const LAB = { day: '1 trade a day', window: 'Entry window', depth: 'Sweep depth ≥ 0.5 ATR', idm: 'Inducement first', disp: 'Displacement ≥ 0.8 ATR',
    monday: 'Monday rule', stop: 'Stop 8-80 pts', target: 'Target ≥ 1.5R' };
  const STG = [['levels', 'Levels'], ['sweep', 'Sweep'], ['inducement', 'Inducement'], ['displacement', 'Displacement'], ['cisd5', '5m CISD'],
    ['limit', 'Limit armed'], ['cisd1m', '1m CISD wait'], ['entry', 'Entry'], ['trade', 'In trade'], ['done', 'Done today']];

  // the freshest Brain: the PC's (live.json / heartbeat) while it is fresh, else the cloud paper bot's
  function pick() {
    if (typeof D === 'undefined' || !D) return null;
    const L = D.live || {}, pc = L.pc || {}, now = Date.now() / 1000;
    const a = pc.brain && !pc.brain.error ? pc.brain : null, b = L.brain && !L.brain.error ? L.brain : null;
    if (a && (now - (+a.t || 0) < FRESH_S || !b || (+a.t || 0) >= (+b.t || 0))) return { b: a, src: 'PC bot', live: now - (+a.t || 0) < FRESH_S };
    if (b) return { b, src: 'cloud paper bot', live: now - (+b.t || 0) < 45 * 60 };
    return a ? { b: a, src: 'PC bot', live: false } : null;
  }
  const helpTxt = (k) => ((typeof D !== 'undefined' && D && D.brain_help) || {})[k] || '';

  function pipe(b) {
    const st = Object.fromEntries((b.stages || []).map(([k, s]) => [k, s]));
    return `<div class="bz-pipe">${STG.map(([k, l], i) => `<div class="bz-n ${st[k] || 'todo'}"><span>${st[k] === 'done' ? '✓' : st[k] === 'skip' ? '–' : i + 1}</span><em>${l}</em></div>`).join('')}</div>`;
  }
  function waiting(b, src) {
    const s = b.stage || {}, g = b.guards || {};
    return `<div class="card bz-wait ${(g.blocking || []).length ? 'blk' : ''}"><div class="bz-eb">What the bot is waiting for ${info(s.key && s.key !== 'closed' ? s.key : 'levels')}</div>
      <div class="bz-big">${esc(s.waiting || '—')}</div>
      <div class="bz-meta"><span class="chip">${s.n ? `Stage ${s.n}/10 · ` : ''}${esc(s.label || '')}</span>${s.dir ? `<span class="chip ${s.dir > 0 ? 'up' : 'dn'}">${s.dir > 0 ? 'LONG side' : 'SHORT side'}</span>` : ''}</div>
      ${pipe(b)}<div class="small mut">${esc(src.src)} · ${esc(b.at || '')} · price ${p2(b.price)} · ATR ${num(b.atr, 1)} pts${src.live ? '' : ' · <b class="dn">not live</b>'}</div>
      ${(g.blocking || []).length ? `<div class="bz-ban">Blocked: ${esc(g.blocking.join(' · '))}</div>` : ''}</div>`;
  }
  function trade(b) {
    const t = b.trade; if (!t) return '';
    return `<div class="card"><h3>The open trade ${info('be')}</h3><div class="bz-kv">
      <div><span>Side</span><b class="${t.dir > 0 ? 'up' : 'dn'}">${t.side} · ${t.qty} micros</b></div><div><span>Live</span><b class="${cls(t.r_now)}">${sg(t.r_now, 2)}R · ${sg(t.usd_now, 0)} $</b></div>
      <div><span>Entry</span><b>${p2(t.entry)}</b></div><div><span>Stop</span><b class="dn">${p2(t.stop)}</b></div><div><span>Target</span><b class="up">${p2(t.target)}</b></div><div><span>BE at +1R</span><b>${p2(t.be && t.be.trigger)}</b></div></div>
      <p class="small">${esc((t.be || {}).text || '')}</p>${t.t_check ? `<p class="small">${esc(t.t_check.text)} ${info('t_check')}</p>` : ''}<p class="small mut">${esc((t.flat || {}).text || '')} · bank at ${t.bank && t.bank.r}R</p></div>`;
  }
  function sizing(b) {
    const z = b.sizing || {}; if (!z.steps) return '';
    return `<details class="card"><summary><b>Sizing: ${z.qty ?? '—'} micros · $${num(z.risk_usd, 0)} at risk</b> ${info(z.mode === 'two_week' ? 'two_week' : 'stop')}<br><span class="small mut">${esc(z.what || '')}</span></summary>
      <ol class="bz-math">${z.steps.map((s) => `<li><b>${esc(s.label)}: ${esc(s.value)}</b><br><span class="small mut">${esc(s.text)}</span></li>`).join('')}</ol>
      ${z.eval && z.eval.text ? `<p class="small">Eval: ${esc(z.eval.text)}${z.eval.lock ? ' · <b class="dn">pass / fail lock: no new trade</b>' : ''}</p>` : ''}
      ${z.weekly_stop ? `<p class="small mut">${esc(z.weekly_stop.text || '')}</p>` : ''}</details>`;
  }
  function vNow(b, src) {
    const n = b.nearest || {}, g = b.guards || {}, m = g.market || {};
    const row = (r) => `<div class="bz-lv"><span>${esc(r.label)}</span><b>${p2(r.price)}</b><em class="${cls(r.dist)}">${sg(r.dist, 0)} pts</em></div>`;
    const W = (b.watch || []).filter((w) => w.text);
    return waiting(b, src) + trade(b) + litPic() + `<div class="card"><h3>Nearest levels ${info('depth')}</h3><div class="bz-two"><div><div class="small mut">Above</div>${(n.above || []).map(row).join('') || '—'}</div>
        <div><div class="small mut">Below</div>${(n.below || []).map(row).join('') || '—'}</div></div></div>
      ${W.length ? `<div class="card"><h3>Forming now</h3>${W.map((w) => `<p class="small"><b class="${w.side === 'LONG' ? 'up' : 'dn'}">${w.side}</b> ${esc(w.text)}</p>`).join('')}</div>` : ''}
      ${sizing(b)}
      <div class="card"><h3>Guards &amp; market</h3><p class="small">${esc(m.text || '')}${m.early_close ? ` · CME early close ${esc(m.early_close)} ET` : ''}</p>
        <p class="small">News: ${(g.news || []).length ? esc(g.news.map((x) => `${x.time || ''} ${x.title}`).join(' · ')) : 'no high-impact USD news'}</p>
        <p class="small mut">VIX ${num((g.vix || {}).vix, 1)} · band ${p2((g.vix || {}).dn)} / ${p2((g.vix || {}).up)} ${info('vix')}${(g.off || []).length ? ` · off: ${esc(g.off.join(', '))}` : ''}</p></div>`;
  }
  // LIT's latest trade picture (engine/trade_chart.py, data.json "charts"): tap = full screen, swipe between trades
  function litPic() {
    const T = window.TradePics, ch = (typeof D !== 'undefined' && D && D.charts) || null;
    if (!T || !ch || !T.list(ch, 'lit').length) return '';
    return `<div class="card bz-pic">${T.latest(ch, 'lit', {})}</div>`;
  }
  function vLevels(b) {
    const L = b.levels || [];
    return `<div class="card"><h3>Levels the bot watches ${info('levels')}</h3><p class="small mut">Price ${p2(b.price)} · a sweep counts at ≥ ${(b.rules || {}).depth} ATR (${num((b.atr || 0) * ((b.rules || {}).depth || 0.5), 1)} pts)</p>
      ${L.map((r) => `<div class="bz-lr ${r.taken ? 'tk' : ''}"><div><b class="${r.side === 'H' ? 'up' : 'dn'}">${esc(r.label)}</b><br><span class="small mut">${r.taken ? `swept ${esc(r.taken_hm || '')} · ${num(r.depth_atr, 2)} ATR ${r.deep_ok ? '✓' : '✗'}` : 'untaken'}</span></div>
        <div class="bz-lp"><b>${p2(r.price)}</b><br><span class="small ${cls(r.dist)}">${sg(r.dist, 1)} pts · ${num(Math.abs(r.dist_atr), 1)} ATR</span></div></div>`).join('') || emptyBox('No levels yet.')}</div>`;
  }
  function vSetups(b) {
    const A = b.setups || [];
    if (!A.length) return emptyBox('No setup yet today.', 'A setup appears when a sweep is followed by a 5-minute close through the CISD level (Now shows what is forming).');
    const n = b.setups_n || {};
    return `<p class="small mut" style="margin:4px 2px 10px">Why it did or didn't trade: every rule in the engine's order; the first ✗ stopped it.${n.all > (n.shown || 0) ? ` Showing ${n.shown} of ${n.all} (${n.blocked} skipped by 1 trade a day).` : ''}</p>` +
      A.slice().reverse().map((s) => { const [l, k] = STAT[s.status] || [s.status, '']; const pl = s.plan;
        return `<div class="card bz-su"><div class="bz-sh"><b>${esc(s.hm)}</b> <b class="${s.dir > 0 ? 'up' : 'dn'}">${esc(s.side)}</b> <span class="chip ${k}">${esc(l)}</span></div>
          <p class="small">${esc(s.status_text || '')}</p><p class="small mut">swept ${esc((s.swept || []).join(', '))}</p>
          <ul class="bz-ck">${(s.checks || []).map(([key, o, txt]) => `<li class="${o ? '' : 'f'}">${okI(o)}<div><b>${esc(LAB[key] || key)}</b> ${info(key)}${txt ? `<br><span class="small mut">${esc(txt)}</span>` : ''}</div></li>`).join('')}</ul>
          ${pl ? `<p class="small">Limit ${p2(pl.limit)} · stop ${p2(pl.stop)} (${num(pl.stop_pts, 1)} pts) · target ${p2(pl.target)} (${num(pl.rr, 1)}R) · ${esc(pl.armed_hm || '')}→${esc(pl.expires_hm || '')}</p>` : ''}
          ${s.trade ? `<p class="small">Entry ${esc(s.trade.entry_hm)} @ ${p2(s.trade.entry)} · ${esc(s.trade.exit || '')} ${s.trade.r != null ? sg(s.trade.r, 2) + 'R' : ''}</p>` : ''}</div>`; }).join('');
  }
  function vLog(b) {
    const R = b.log || [];
    return `<div class="card"><h3>Thought log · ${esc(b.day || '')}</h3><p class="small mut">Newest first · last ${R.length} lines (the full log is on the PC: Bot Brain → Thought log)</p>
      <ol class="bz-log">${R.map((r) => `<li class="k-${esc(r.kind || '')}"><b>${esc(r.hm || '')}</b><span>${esc(r.text || '')}</span></li>`).join('') || '<li>nothing yet</li>'}</ol></div>`;
  }
  // the second-strategy brain (engine/second.py brain): the PC's live cut (live.pc.second) while fresh, else the cloud's
  // data.json "second" (its own run of the same strategies, incl. the LIT + Asia shadow)
  function pickSecond() {
    if (typeof D === 'undefined' || !D || !window.SecondUI || !window.SecondUI.brainList) return null;
    const pc = ((D.live || {}).pc || {}).second, now = Date.now() / 1000;
    if (pc && pc.strategies && Object.keys(pc.strategies).length && now - (+pc.t || 0) < FRESH_S) return window.SecondUI.brainList(pc, 'PC bot');
    if (D.second && (D.second.strategies || []).length) return window.SecondUI.brainList(D.second, 'cloud run');
    return pc ? window.SecondUI.brainList(pc, 'PC bot (not live)') : null;
  }
  // ---------------------------------------------------------------------------------------------- All bots (DOM + textContent)
  const STALE_S = 20 * 60;                       // the PC reports every 15 min (5 min heartbeat): older than 20 min = red
  const HIDE = new Set(['blitz']);               // BLITZ never shows here (hidden, paper: owner 2026-11-16)
  function mk(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
  function add(p, ...kids) { for (const k of kids) if (k) p.appendChild(k); return p; }
  const usd = (v, sign) => { if (v == null || !isFinite(+v)) return '—'; const n = Math.round(+v), a = Math.abs(n).toLocaleString('en-US'); return (n < 0 ? '-$' : sign && n > 0 ? '+$' : '$') + a; };
  const pxT = (v) => (v == null || !isFinite(+v) ? '—' : (+v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  function agoT(s) {
    if (s == null || !isFinite(s)) return 'never';
    s = Math.max(0, Math.round(s));
    if (s < 90) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 48 * 3600) return `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min ago`;
    return `${Math.round(s / 86400)} days ago`;
  }
  // every glance the page has (live.json / the 15-minute status in D.live.pc, the newest live.json, home.json): the newest wins
  function glance() {
    const out = [];
    const take = (pc, src) => { if (pc && pc.glance && Array.isArray(pc.glance.bots)) out.push({ g: pc.glance, src }); };
    if (typeof D !== 'undefined' && D) take((D.live || {}).pc, 'PC');
    if (window.LIVE && window.LIVE.j) take(window.LIVE.j.pc, 'PC');
    if (window.HOMEJ) take((window.HOMEJ.live || {}).pc, 'PC');
    out.sort((a, b) => (+b.g.t || 0) - (+a.g.t || 0));
    if (out.length) return out[0].g;
    return fallback();
  }
  // an older PC (no glance yet): the same rows from the Bot Brain + the board's account cards
  function fallback() {
    const H = (typeof D !== 'undefined' && D) || window.HOMEJ || {};
    const L = H.live || {}, pc = L.pc || {}, br = pc.brain && !pc.brain.error ? pc.brain : null;
    const lb = window.LIVE && window.LIVE.j && window.LIVE.j.board && !window.LIVE.j.board.error ? window.LIVE.j.board : null;
    const bd = lb || (H.board && !H.board.error ? H.board : {}) || {};
    if (!br && !bd.lit && !bd.atlas) return null;
    const lit = bd.lit || {}, st = (br && br.stage) || {};
    const lv = br ? ['above', 'below'].flatMap((k) => ((br.nearest || {})[k] || []).slice(0, 3).map((r) => [r.label, r.price, r.dist])) : [];
    const arm = br ? (br.setups || []).filter((z) => ['armed', 'tapped', 'entering'].includes(z.status)).slice(-2).map((z) => ({
      side: z.side, text: z.plan ? `stop ${pxT(z.plan.stop)} · target ${pxT(z.plan.target)}` : '', trig: z.status_text || '' })) : [];
    const bots = [{ id: 'lit', name: 'Zlarior', what: 'LIT · ' + (lit.plan || 'MFFU Builder 50K'), on: !!pc.running,
      armed: !!(((pc.health || {}).account) || {}).armed, mode: (((pc.health || {}).account) || {}).label,
      stage: st.label, wait: st.waiting || lit.waiting, lv, arm, pos: lit.position, day: lit.today_pnl, room: lit.room, mll: lit.mll,
      log: br ? (br.log || []).slice(0, 4).map((r) => [r.hm, r.text]) : [] }];
    if (bd.atlas) { const a = bd.atlas; bots.push({ id: 'atlas', name: 'ATLAS', what: 'EMA · MACD · S/R · ' + (a.plan || 'MFFU Builder 25K'), on: !!pc.running && a.configured !== false,
      wait: a.waiting, pos: a.position, day: a.today_pnl, room: a.room, mll: a.mll, log: [] }); }
    return { v: 0, t: +pc.t || 0, bots, old: true };
  }
  function freshness() {
    const H = (typeof D !== 'undefined' && D) || window.HOMEJ || {};
    const L = H.live || {}, pc = L.pc || {}, rep = L.reporter || (window.LIVE && window.LIVE.j && window.LIVE.j.reporter) || null;
    const now = Date.now() / 1000, t = +pc.t || 0, age = t ? now - t : null, rage = rep && +rep.t ? now - rep.t : null;
    const v = L.pc_verdict || {};
    const stale = !t || age > STALE_S || !!pc.silent || ['DOWN', 'SILENT'].includes(v.code);
    return { t, age, rep, rage, stale, verdict: v };
  }
  function freshBox() {
    const f = freshness();
    const box = mk('div', 'card bzf ' + (f.stale ? 'bad' : 'ok'));
    box.setAttribute('role', 'status');
    const big = mk('div', 'bzf-big', f.t ? `PC last reported ${agoT(f.age)}` : 'The PC has not reported yet');
    big.dataset.ageT = String(f.t || '');
    add(box, mk('div', 'bz-eb', f.stale ? 'Data is old' : 'Live'), big);
    if (f.stale) add(box, mk('p', 'small', f.t ? 'What you see below may be out of date: the bot has not checked in for over 20 minutes. ' +
      'If the market is open, look at the PC (tools/bat/BOTS_BACK.bat brings the bots back).' : 'Nothing from the PC bot yet: start it on the PC.'));
    if (f.rep && f.rage != null) add(box, mk('p', 'small mut', `The PC's reporter looked ${agoT(f.rage)}` + (f.rep.server === false ? ' · bot server NOT answering' : '')));
    if (f.verdict && f.verdict.label) add(box, mk('p', 'small mut', `${f.verdict.label}${f.verdict.reason ? ': ' + f.verdict.reason : ''}`));
    return box;
  }
  function chip(text, kind) { return mk('span', 'chip ' + (kind || ''), text); }
  function kv(label, value, kind) { const d = mk('div'); add(d, mk('span', null, label), mk('b', kind || null, value)); return d; }
  function botCard(b) {
    const c = mk('section', 'card bzb'); c.dataset.bot = b.id;
    const h = mk('div', 'bzb-h');
    add(h, mk('h3', 'bzb-n', b.name), mk('span', 'small mut', b.what || ''));
    const chips = mk('div', 'bz-meta');
    add(chips, chip(b.on ? 'ON' : 'OFF', b.on ? 'up' : 'dn'), chip(b.armed ? 'ARMED' : 'not armed', b.armed ? 'warn' : 'mut'));
    if (b.mode) chips.appendChild(chip(String(b.mode), String(b.mode).toUpperCase().startsWith('LIVE') ? 'warn' : 'mut'));
    if (b.stage) chips.appendChild(chip(b.stage));
    add(c, h, chips);
    const money = mk('div', 'bz-kv');
    add(money, kv('Today', usd(b.day, true), b.day > 0 ? 'up' : b.day < 0 ? 'dn' : ''),
      kv('Room left', b.room == null ? '—' : `${usd(b.room)}${b.mll ? ' of ' + usd(b.mll) : ''}`, b.room != null && b.mll && b.room < 0.3 * b.mll ? 'dn' : ''));
    c.appendChild(money);
    if (b.wait) add(c, mk('div', 'bz-lab', 'Waiting for'), mk('p', 'bzb-w', b.wait));
    if (b.why) add(c, mk('div', 'bz-lab', 'Last decision'), mk('p', 'small', b.why));
    const p = b.pos;
    if (p) {
      const t = mk('div', 'bzb-t');
      add(t, mk('div', 'bz-lab', 'Open trade'));
      const g = mk('div', 'bz-kv');
      add(g, kv('Side', `${p.side || ''} · ${p.qty ?? '—'} micros`, String(p.side || '').toUpperCase() === 'LONG' ? 'up' : 'dn'),
        kv('Now', usd(p.now_usd, true), p.now_usd > 0 ? 'up' : p.now_usd < 0 ? 'dn' : ''),
        kv('$ risk (stop)', usd(p.risk_usd ?? (p.qty && p.entry != null && p.stop != null ? Math.abs(p.entry - p.stop) * 2 * p.qty : null)), 'dn'),
        kv('$ target', usd(p.tgt_usd ?? (p.qty && p.entry != null && p.target != null ? Math.abs(p.target - p.entry) * 2 * p.qty : null)), 'up'),
        kv('Entry', pxT(p.entry)), kv('Stop / target', `${pxT(p.stop)} / ${pxT(p.target)}`));
      add(t, g); c.appendChild(t);
    }
    if ((b.arm || []).length) {
      c.appendChild(mk('div', 'bz-lab', 'Setups armed now'));
      const ul = mk('ul', 'bzb-l');
      for (const a of b.arm) { const li = mk('li'); add(li, mk('b', String(a.side).toUpperCase() === 'LONG' ? 'up' : 'dn', a.side || ''), mk('span', null, ' ' + (a.text || '')), mk('div', 'small mut', a.trig || '')); ul.appendChild(li); }
      c.appendChild(ul);
    }
    if ((b.lv || []).length) {
      c.appendChild(mk('div', 'bz-lab', 'Levels it watches today'));
      const ul = mk('ul', 'bzb-lv');
      for (const r of b.lv) { const li = mk('li'); add(li, mk('span', null, r[0]), mk('b', null, pxT(r[1])), mk('em', r[2] > 0 ? 'up' : r[2] < 0 ? 'dn' : 'mut', r[2] == null ? '' : `${r[2] > 0 ? '+' : ''}${Math.round(r[2])} pts`)); ul.appendChild(li); }
      c.appendChild(ul);
    }
    if ((b.log || []).length) {
      c.appendChild(mk('div', 'bz-lab', 'Last thoughts'));
      const ol = mk('ol', 'bz-log');
      for (const r of b.log) { const li = mk('li'); add(li, mk('b', null, r[0] || ''), mk('span', null, r[1] || '')); ol.appendChild(li); }
      c.appendChild(ol);
    }
    return c;
  }
  // night-revamp-dash 2026-11-20 (owner: "Brain: what each bot is waiting for"): one line a bot on top, before the long cards:
  // ON / OFF, today's $, the room left as a bar, and the first sentence of what it waits for. Built with textContent only.
  function sumCard(bots) {
    const c = mk('section', 'card bzs');
    add(c, mk('div', 'bz-lab', 'Each bot, in one line'));
    const ul = mk('ul', 'bzb-l'); ul.style.cssText = 'list-style:none;margin:6px 0 0;padding:0;display:grid;gap:10px';
    for (const b of bots) {
      const li = mk('li'); li.style.cssText = 'display:grid;gap:3px';
      const top = mk('div'); top.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap';
      add(top, mk('b', null, b.name), chip(b.on ? 'ON' : 'OFF', b.on ? 'up' : 'dn'), mk('span', b.day > 0 ? 'up' : b.day < 0 ? 'dn' : 'small mut', 'today ' + usd(b.day, true)));
      li.appendChild(top);
      if (b.room != null && b.mll) {
        const f = Math.max(0, Math.min(1, b.room / b.mll)), bar = mk('div'); bar.setAttribute('role', 'img');
        bar.setAttribute('aria-label', 'Room left ' + Math.round(f * 100) + ' percent');
        bar.style.cssText = 'height:5px;border-radius:5px;background:rgba(127,127,127,.25);overflow:hidden';
        const i = mk('i'); i.style.cssText = 'display:block;height:100%;border-radius:5px;width:' + Math.round(f * 100) + '%;background:' + (f < 0.35 ? 'var(--bad,#e0795a)' : 'var(--good,#a3ae6b)');
        bar.appendChild(i); li.appendChild(bar);
        li.appendChild(mk('span', 'small mut', 'room ' + usd(b.room) + ' of ' + usd(b.mll)));
      }
      const w = String(b.wait || (b.on ? 'Watching the market.' : 'Bot is off.'));
      li.appendChild(mk('span', 'small', 'Waiting for: ' + (w.split(/(?<=\.)\s/)[0] || w)));
      ul.appendChild(li);
    }
    c.appendChild(ul);
    return c;
  }
  function vAll() {
    const root = mk('div', 'bz-all');
    root.appendChild(freshBox());
    const g = glance();
    if (!g || !(g.bots || []).length) {
      const e = mk('div', 'card'); add(e, mk('h3', null, 'No bot brain yet'), mk('p', 'small mut', 'It appears once the PC bot has run with this version and sent its status.'));
      root.appendChild(e); return root;
    }
    if (g.rd && (g.rd.s === 'ok' || g.rd.s === 'warn' || g.rd.s === 'no')) {     // READY (mint) / NOT READY (gold): engine/readiness, day-ready 2026-11-22
      const no = g.rd.s === 'no', ok = g.rd.s === 'ok';
      const rb = mk('div', 'card', null); rb.setAttribute('data-ready', g.rd.s); rb.style.cssText = 'border:1px solid ' + (no ? '#f1c14b' : '#77db89') + ';color:' + (no ? '#f1c14b' : '#77db89') + ';font-weight:700';
      add(rb, mk('span', null, ok ? 'READY' + (g.rd.w ? ' for ' + g.rd.w : '') : (no ? 'NOT READY' : 'READY, 1 to watch') + (g.rd.b ? ': ' + g.rd.b : '')));
      root.appendChild(rb);
    }
    if (g.old) root.appendChild(mk('p', 'small mut', 'Older PC version: levels and setups for Zlarior only. They fill in fully after the PC updates.'));
    root.appendChild(sumCard(g.bots.filter((x) => x && !HIDE.has(x.id) && !(window.OLY_HIDDEN && window.OLY_HIDDEN.has && window.OLY_HIDDEN.has(x.id)))));
    for (const b of g.bots) if (b && !HIDE.has(b.id) && !(window.OLY_HIDDEN && window.OLY_HIDDEN.has && window.OLY_HIDDEN.has(b.id))) root.appendChild(botCard(b));
    root.appendChild(mk('p', 'small mut', 'Read-only. Detail: Zlarior detail / ATLAS detail above.'));
    return root;
  }
  // the "X min ago" texts move on by themselves (no redraw)
  setInterval(() => {
    for (const e of document.querySelectorAll('[data-age-t]')) { const t = +e.dataset.ageT; if (t) e.textContent = `PC last reported ${agoT(Date.now() / 1000 - t)}`; }
  }, 30000);
  function view(el) {
    const src = pick();
    el.innerHTML = head('Bot Brain', 'What the bot is thinking', 'Live from the bot: what it waits for, every level, every setup today and the rule that stopped it. Tap i for a one-line explainer. Read-only.');
    el.insertAdjacentHTML('beforeend', `<div class="bz-tabs" style="margin:8px 0">${segHTML('brWho', [['all', 'All bots'], ['lit', 'Zlarior detail'], ['second', 'ATLAS detail']], S.who || 'all')}</div>`);
    onSeg('brWho', (v) => { S.who = v; view(el); });
    if (S.who === 'all') { el.appendChild(vAll()); return; }
    if (S.who === 'second') {
      const box = document.createElement('div'); el.appendChild(box);
      if (!window.SecondUI || !window.SecondUI.brain) { box.innerHTML = emptyBox('Second brain not loaded.', 'secondcore.js did not load.'); return; }
      window.SecondUI.brain(box, pickSecond() || { strategies: [] }, { charts: D.charts || null });
      if (window.TradePics) window.TradePics.settle(box);
      return;
    }
    if (!src) { el.insertAdjacentHTML('beforeend', emptyBox('No Bot Brain yet.', 'It appears once the PC bot (or the cloud paper bot) has run a LIT poll with this version.')); return; }
    const b = src.b;
    el.insertAdjacentHTML('beforeend', `<div class="bz-tabs" style="margin:8px 0">${segHTML('brTab', [['now', 'Now'], ['levels', 'Levels'], ['setups', 'Setups'], ['log', 'Log']], S.tab)}</div>
      <div id="brBody">${S.tab === 'levels' ? vLevels(b) : S.tab === 'setups' ? vSetups(b) : S.tab === 'log' ? vLog(b) : vNow(b, src)}</div>`);
    if (window.TradePics) window.TradePics.settle(el);
    onSeg('brTab', (v) => { S.tab = v; view(el); });
  }
  // one floating explainer
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('.bz-i');
    let tip = document.getElementById('brTip');
    if (!b) { if (tip) tip.remove(); return; }
    e.preventDefault(); e.stopPropagation();
    if (!tip) { tip = document.createElement('div'); tip.id = 'brTip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); }
    tip.textContent = helpTxt(b.dataset.help) || 'No explainer for this yet.';
    const r = b.getBoundingClientRect();
    tip.style.left = Math.max(10, Math.min(innerWidth - 290, r.left - 130)) + 'px';
    tip.style.top = (r.bottom + 8 + scrollY) + 'px';
  }, true);
  // the big Home tile (DOM + textContent): "PC last reported X min ago" (red when old) + one line per bot; a tap opens the Brain
  function homeTile() {
    const g = glance(), f = freshness();
    if (!g && !f.t) return null;
    const b = mk('button', 'card bz-tile' + (f.stale ? ' stale' : '')); b.type = 'button'; b.dataset.go = 'brain';
    const eb = mk('span', 'bz-eb'); eb.insertAdjacentHTML('afterbegin', icon('brain')); eb.appendChild(document.createTextNode(' Bot Brain'));
    const age = mk('span', 'bz-tage ' + (f.stale ? 'dn' : 'mut'), f.t ? `PC last reported ${agoT(f.age)}` : 'The PC has not reported yet');
    age.dataset.ageT = String(f.t || '');
    add(b, eb, age);
    for (const x of ((g && g.bots) || []).filter((x) => x && !HIDE.has(x.id))) {
      const line = mk('span', 'bz-tt');
      add(line, mk('b', null, `${x.name}${x.on ? '' : ' (off)'}: `), mk('span', null, x.pos ? `in a ${x.pos.side || ''} trade · ${usd(x.pos.now_usd, true)}` : (x.wait || x.stage || '—')));
      b.appendChild(line);
    }
    b.appendChild(mk('span', 'small mut', 'tap for every bot: levels, setups, why no trade, $'));
    return b;
  }
  const CSS = `.bz-wait{border-color:color-mix(in srgb,var(--accent) 45%,transparent)}.bz-wait.blk{border-color:var(--bad)}
.bz-eb{font:700 11px/1.3 var(--sans,system-ui);letter-spacing:.05em;text-transform:uppercase;color:var(--accent);display:flex;align-items:center;gap:6px}
.bz-big{font-size:19px;line-height:1.45;font-weight:650;margin:8px 0 10px}.bz-meta{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.bz-pipe{display:grid;grid-template-columns:repeat(5,1fr);gap:10px 4px;margin:4px 0 10px}.bz-n{display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center}
.bz-n span{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-weight:700;font-size:12.5px;border:2px solid var(--line);color:var(--muted)}
.bz-n em{font-style:normal;font-size:10.5px;line-height:1.2;color:var(--muted)}.bz-n.done span{border-color:var(--good);color:var(--good)}
.bz-n.now span{background:var(--accent);border-color:var(--accent);color:var(--page,#14110e)}.bz-n.now em{color:var(--ink,inherit);font-weight:700}.bz-n.skip span{border-style:dashed}
.bz-ban{margin-top:8px;padding:8px 10px;border-radius:10px;background:color-mix(in srgb,var(--bad) 18%,transparent);color:var(--bad);font-weight:650;font-size:13px}
.bz-i{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;border:1px solid var(--line);background:none;color:var(--muted);font:700 11px var(--sans,system-ui);padding:0;vertical-align:middle;cursor:pointer}
#brTip{position:absolute;z-index:300;max-width:280px;padding:10px 12px;border-radius:12px;background:var(--card,#141824);border:1px solid var(--accent);font-size:14px;line-height:1.45;box-shadow:0 8px 28px rgba(0,0,0,.45)}
.bz-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}.bz-lv{padding:6px 0;border-bottom:1px solid var(--line);font-size:13.5px}.bz-lv b{display:block;font-family:var(--mono,monospace)}.bz-lv em{font-style:normal;font-size:12px}
.bz-lr{display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid var(--line);font-size:14px}.bz-lr.tk{opacity:.6}.bz-lp{text-align:right;font-family:var(--mono,monospace)}
.bz-kv{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;margin-bottom:8px}.bz-kv span{display:block;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}.bz-kv b{font-size:15px}
.bz-ck{list-style:none;margin:6px 0 0;padding:0}.bz-ck li{display:flex;gap:8px;padding:6px 0;border-top:1px solid var(--line);font-size:13.5px}.bz-ck li.f b{color:var(--bad)}
.bz-ok{flex:none;display:inline-grid;place-items:center;width:22px;height:22px;border-radius:7px;font-weight:800}.bz-ok.y{color:var(--good);background:color-mix(in srgb,var(--good) 16%,transparent)}.bz-ok.n{color:var(--bad);background:color-mix(in srgb,var(--bad) 16%,transparent)}
.bz-sh{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:15px}.bz-math{padding-left:18px;margin:8px 0}.bz-math li{padding:5px 0}
.bz-log{list-style:none;margin:0;padding:0}.bz-log li{display:grid;grid-template-columns:46px 1fr;gap:8px;padding:7px 0;border-bottom:1px solid var(--line);font-size:13.5px;line-height:1.45}
.bz-log li.k-rejected span{color:var(--bad)}.bz-log li.k-entry span,.bz-log li.k-exit span{color:var(--good)}
.bz-pic .tp-card{border:0;padding:0;margin:0;background:none}.bz-tile{display:flex;flex-direction:column;gap:6px;width:100%;text-align:left;cursor:pointer;font:inherit;color:inherit;border-color:color-mix(in srgb,var(--accent) 45%,transparent)}.bz-tt{font-size:15px;font-weight:500;line-height:1.4}.bz-tt b{font-weight:700}
.bz-tile.stale{border-color:var(--bad)}.bz-tage{font-size:13px;font-weight:650}
.bzf{display:flex;flex-direction:column;gap:4px}.bzf.ok{border-color:color-mix(in srgb,var(--good) 45%,transparent)}
.bzf.bad{border-color:var(--bad);background:color-mix(in srgb,var(--bad) 14%,var(--surface,#1d1914))}.bzf.bad .bz-eb,.bzf.bad .bzf-big{color:var(--bad)}
.bzf-big{font:650 18px/1.35 var(--serif,Georgia,serif)}
.bzb{display:flex;flex-direction:column;gap:6px}.bzb-h{display:flex;flex-direction:column;gap:2px}.bzb-n{margin:0;font:600 20px/1.25 var(--serif,Georgia,serif)}
.bz-lab{font-size:11.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-top:6px}
.bzb-w{margin:0;font-size:15.5px;line-height:1.45;font-weight:600}.bzb .bz-meta{margin-bottom:2px}
.bzb-t{border:1px solid var(--line);border-radius:12px;padding:8px 10px}
.bzb-l,.bzb-lv{list-style:none;margin:0;padding:0}.bzb-l li{padding:6px 0;border-bottom:1px solid var(--line);font-size:14px}
.bzb-lv li{display:grid;grid-template-columns:1fr auto 70px;gap:8px;padding:5px 0;border-bottom:1px solid var(--line);font-size:13.5px}
.bzb-lv b{font-family:var(--mono,monospace)}.bzb-lv em{font-style:normal;text-align:right;font-size:12.5px}`;
  function install() {
    if (typeof P !== 'undefined' && !P.brain) P.brain = '<path d="M12 5.2a3 3 0 0 0-5.6-1A3 3 0 0 0 4.5 9a3.2 3.2 0 0 0 .3 5.6A3 3 0 0 0 9 19.3a3 3 0 0 0 3-1.3z"/><path d="M12 5.2a3 3 0 0 1 5.6-1A3 3 0 0 1 19.5 9a3.2 3.2 0 0 1-.3 5.6A3 3 0 0 1 15 19.3a3 3 0 0 1-3-1.3"/><path d="M12 5.2V18"/>';
    // its own main tab on the bottom bar, right after Home (owner 2026-10-21)
    GROUPS.forEach((g) => { g.pages = g.pages.filter((p) => p[0] !== 'brain'); });
    if (!GROUPS.some((g) => g.id === 'brain')) GROUPS.splice(1, 0, { id: 'brain', label: 'Brain', icon: 'brain', pages: [['brain', 'Bot Brain', 'brain', 'What the bot is thinking: stage, levels, setups and the rule that stopped each one']] });
    PAGES.brain = { id: 'brain', label: 'Bot Brain', icon: 'brain', desc: 'What the bot is thinking', group: 'brain' };
    VIEWS.brain = view;
    if (typeof SCENE !== 'undefined') SCENE.brain = 'today';
    if (typeof ALIAS !== 'undefined') Object.assign(ALIAS, { thinking: 'brain', thoughts: 'brain', mind: 'brain' });
    const t0 = VIEWS.today;
    if (t0 && !t0.__brain) {
      VIEWS.today = function (el) { t0.apply(this, arguments); try { const h = homeTile(); if (h) { const first = el.querySelector('.card'); if (first) first.insertAdjacentElement('afterend', h); else el.insertAdjacentElement('afterbegin', h); } } catch (e) { console.warn('brain tile', e); } };
      VIEWS.today.__brain = true;
    }
    const st = document.createElement('style'); st.id = 'brain-css'; st.textContent = CSS; document.head.appendChild(st);
    if (typeof nav === 'function') { nav(); if (typeof route === 'function' && /^#\/(brain|thinking|thoughts|mind)\b/.test(location.hash)) route(); }
  }
  install();
})();
