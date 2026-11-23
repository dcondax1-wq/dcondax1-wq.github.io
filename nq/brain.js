// NQ BRAIN page (ES module): the 2D brain from braincore.js at once; DESIGN's brain (olympus/brain3d.js, window.Brain3D, mounted in brain.html's body) gets the live states.
// lands, only on this page, after the first paint and never on LITE. Text only through textContent; no storage; GET only; nothing armed.
// ?bot=atlas opens ATLAS. window.NQBRAIN is the test hook.
import * as BC from './braincore.js?v=7';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
const clear = (el) => { while (el && el.firstChild) el.removeChild(el.firstChild); };
const S = { bot: 'lit', src: {}, model: null, ready: false, three: 'none', open: null };

async function early(u) {
  const E = window.NQ_EARLY && window.NQ_EARLY.json;
  if (E && E[u]) { const p = E[u]; delete E[u]; try { return await p; } catch (_) { return null; } }
  try { const r = await fetch(u, { cache: 'no-cache' }); return r.ok ? await r.json() : null; } catch (_) { return null; }
}
async function load() {
  const [home, biz, goals, brief, news, edge, file] = await Promise.all(['../home.json', '../business/accounts.json', '../business/goals.json', './brief.json', './news_week.json', '../edge.json', '../trading/trades.json'].map(early));
  S.src = { home: home || {}, biz, goals, brief, news, edge, file, lite: null };
  render();                                                   // the site's copy at once (the PC's post may take seconds)
  try {
    const F = window.PC_FEED;
    if (F && F.fetchLatest) {
      const lite = await Promise.race([F.fetchLatest({ feedUrl: new URL('../status_feed.json', import.meta.url).href }), new Promise((r) => setTimeout(() => r(null), 15000))]);
      if (lite) { S.src.lite = lite; S.src.home = F.homeOver(S.src.home, lite, Date.now() / 1000, window.PAYOUT_COACH || null); render(); }
    }
  } catch (_) { /* the site's copy stays */ }
}

function render() {
  const B = S.model = BC.brain(S.bot, S.src, Date.now() / 1000);
  for (const b of document.querySelectorAll('.bsw')) b.setAttribute('aria-pressed', String(b.dataset.bot === S.bot));
  $('brainH').textContent = `${B.name}'s brain`;
  const mode = $('bMode'); mode.textContent = B.stopped ? 'STOPPED' : !B.has ? 'NO REPORT' : B.armed ? 'ARMED' : B.on ? 'ON' : 'OFF';
  mode.className = 'pill ' + (B.stopped || !B.has ? 'bad' : B.armed ? 'ok' : 'warn');
  $('bNow').textContent = !B.has ? 'The PC has not sent this bot\'s brain yet (its 15-minute report).' : B.current ? `Now: ${B.current.label}. ${B.cards[B.current.key].now}` : 'Waiting for the next step.';
  $('bStatus').textContent = S.src.lite ? `From your PC's report${B.what ? ' · ' + B.what : ''}.` : 'The site\'s copy: your PC\'s report has not arrived on this page yet.';
  drawSteps(B); drawThoughts(B); drawWatch(B); drawGrade(B); drawRisk(B); drawPlan(B); drawMemory(B); drawPay(B); drawAccts(B); drawReplay(B); drawHealth(B);
  feed3d(B);
  if (!S.ready) { S.ready = true; try { if (O && O.ready) O.ready(); } catch (_) { /* nothing */ } }
}

function drawSteps(B) {
  const ol = $('bSteps'); clear(ol);
  let lobe = '';
  for (const s of B.steps) {
    if (s.lobe && s.lobe !== lobe) { lobe = s.lobe; const l = h('li', 'blobe', s.lobeName); l.setAttribute('aria-hidden', 'true'); ol.appendChild(l); }
    const li = h('li', 'bstep ' + s.state); li.dataset.key = s.key;
    const b = h('button', 'bstepb'); b.type = 'button';
    b.setAttribute('aria-label', `Step ${s.n}: ${s.label}, ${s.word}. Open its card.`);
    b.appendChild(h('span', 'bn', s.lobe ? '' : s.n)); b.appendChild(h('span', 'bl', s.lobe ? s.label.split(' · ')[1] : s.label)); b.appendChild(h('span', 'bw', s.word));
    if (s.state === 'now' && (s.text || B.cards[s.key].now)) b.appendChild(h('span', 'bt', s.text || B.cards[s.key].now));
    b.addEventListener('click', () => openCard(s.key, b));
    li.appendChild(b); ol.appendChild(li);
  }
}
function drawThoughts(B) {
  const ol = $('bThoughts'); clear(ol);
  if (!B.thoughts.length) { ol.appendChild(h('li', 'bnone', 'No thoughts posted yet today.')); return; }
  for (const t of B.thoughts) { const li = h('li', 'bth'); li.appendChild(h('b', 'ag-num', t.hm)); li.appendChild(h('span', '', t.text)); ol.appendChild(li); }
}
function drawWatch(B) {
  const ul = $('bWatch'); clear(ul);
  if (!B.watch.length) { ul.appendChild(h('li', 'bnone', 'No levels posted yet.')); return; }
  for (const w of B.watch) {
    const li = h('li', 'bwl ' + w.side); const top = h('div', 'row');
    top.appendChild(h('b', '', w.name)); top.appendChild(h('span', 'ag-num', w.px.toLocaleString('en-US', { minimumFractionDigits: 2 })));
    li.appendChild(top); li.appendChild(h('p', 'bd ag-num', `${w.side === 'above' ? 'Above' : 'Below'} price by ${w.distText}`)); li.appendChild(h('p', 'note', w.ifTouch));
    ul.appendChild(li);
  }
}
function drawGrade(B) {
  const box = $('bGrade'); clear(box);
  if (!B.grade.arms.length) box.appendChild(h('p', 'bnone', 'Nothing armed right now.'));
  for (const a of B.grade.arms) { const p = h('div', 'barm'); p.appendChild(h('b', 'bside ' + a.side.toLowerCase(), a.side)); p.appendChild(h('span', '', a.text)); if (a.trig) p.appendChild(h('p', 'note', a.trig)); box.appendChild(p); }
  box.appendChild(h('p', 'note', B.grade.gradeText));
  for (const b of B.grade.blocks || []) box.appendChild(h('p', 'note bblk', 'Blocked: ' + b));
}
function drawRisk(B) {
  const ul = $('bRisk'); clear(ul);
  for (const r of B.risk) { const li = h('li', 'brn ' + r.level); li.appendChild(h('i', 'bdot')); li.appendChild(h('b', '', r.label)); li.appendChild(h('span', 'ag-num', r.value)); li.title = r.why; ul.appendChild(li); }
}
function drawPlan(B) {
  const box = $('bPlan'); clear(box); const P = B.plan;
  const ul = h('ul', 'bwins');
  for (const w of P.windows) { const li = h('li', 'bwin ' + w.state); li.appendChild(h('b', '', w.who)); li.appendChild(h('span', 'ag-num', `${w.from}-${w.to} ET`)); li.appendChild(h('small', '', w.state)); ul.appendChild(li); }
  box.appendChild(ul); box.appendChild(h('p', 'bcount', P.countdown));
  if (P.early) box.appendChild(h('p', 'note', P.early));
  box.appendChild(h('p', 'note', P.news.length ? 'News today: ' + P.news.map((n) => `${n.time} ${n.title}${n.past ? ' (over)' : ''}`).join(' · ') : 'No high-impact US news today.'));
}
function drawMemory(B) {
  const box = $('bMem'); clear(box); const M = B.memory;
  if (M.streak) box.appendChild(h('p', 'bstreak ' + M.streak.kind, M.streak.text));
  const ol = h('ol', 'bmem');
  for (const r of M.last) { const li = h('li', (r.usd || 0) > 0.5 ? 'pos' : (r.usd || 0) < -0.5 ? 'neg' : ''); li.appendChild(h('span', '', `${r.day} ${r.side.toLowerCase()} · ${String(r.how || '').toLowerCase()}`)); const u = Math.round(r.usd || 0); li.appendChild(h('b', 'ag-num', `${u > 0 ? '+' : u < 0 ? '-' : ''}$${Math.abs(u).toLocaleString('en-US')}${r.r !== null && r.r !== undefined ? ` · ${r.r >= 0 ? '+' : ''}${r.r.toFixed(1)}R` : ''}`)); ol.appendChild(li); }
  if (!M.last.length) ol.appendChild(h('li', 'bnone', 'No real trade yet.'));
  box.appendChild(ol);
  if (M.edge) box.appendChild(h('p', 'bedge ' + M.edge.light.toLowerCase(), M.edge.text));
  if (M.learn) box.appendChild(h('p', 'note', M.learn));
}
function drawPay(B) {
  const c = $('payCard'), box = $('bPay'); c.hidden = !B.payout; clear(box); if (!B.payout) return;
  const P = B.payout, ring = h('div', 'bring'); ring.style.setProperty('--p', `${Math.round(P.frac * 100)}%`); ring.appendChild(h('b', 'ag-num', `${Math.round(P.frac * 100)}%`));
  const t = h('div', ''); t.appendChild(h('p', 'bbig ag-num', `${P.big} ${P.unit}`)); for (const l of P.lines) t.appendChild(h('p', 'note', l)); if (P.when) t.appendChild(h('p', 'note', P.when));
  const row = h('div', 'bpay'); row.appendChild(ring); row.appendChild(t); box.appendChild(row);
}
function drawAccts(B) {
  const ul = $('bAccts'); clear(ul);
  for (const a of B.accounts) { const li = h('li', 'bacct'); li.appendChild(h('b', '', a.name)); li.appendChild(h('span', 'ag-num', a.balance === null ? a.ageText : `${a.stage === 'Funded' ? 'MFFU ' : ''}$${Math.round(a.balance).toLocaleString('en-US')}${a.room !== null ? ` · room $${Math.round(a.room).toLocaleString('en-US')}` : ''}`)); ul.appendChild(li); }
}
function drawReplay(B) {
  const box = $('bReplay'); clear(box); const R = B.replay;
  box.appendChild(h('p', 'note', R.text)); if (!R.frames.length) return;
  const out = h('p', 'bframe', R.frames[0].text), sl = h('input', 'bscrub'); sl.type = 'range'; sl.min = '0'; sl.max = String(R.frames.length - 1); sl.value = '0'; sl.setAttribute('aria-label', 'Scrub today\'s trade');
  sl.addEventListener('input', () => { const f = R.frames[+sl.value]; out.textContent = f.text; light(f.stage); });
  box.appendChild(sl); box.appendChild(out);
}
function drawHealth(B) {
  const ul = $('bHealth'); clear(ul);
  for (const x of B.health) { const li = h('li', 'brn ' + x.level); li.appendChild(h('i', 'bdot')); li.appendChild(h('b', '', x.label)); li.appendChild(h('span', '', x.value)); ul.appendChild(li); }
}
/** the replay lights one step (2D and 3D) */
function light(stage) {
  for (const li of document.querySelectorAll('#bSteps .bstep')) li.classList.toggle('lit', li.dataset.key === stage || li.dataset.key.endsWith(':' + stage));
  const T = window.NQBRAIN_3D; if (T && T.api && T.bot === 'lit') { try { T.api.update({ currentId: stage === 'entry' || stage === 'trade' || stage === 'done' ? stage : undefined }); } catch (_) { /* 2D only */ } }
}

// the glass card: what I'm doing now / why / what would change my mind
function openCard(key, from) {
  const c = S.model && S.model.cards[key]; if (!c) return;
  $('bCardH').textContent = c.title; $('bCardNow').textContent = c.now; $('bCardWhy').textContent = c.why; $('bCardChange').textContent = c.change;
  $('bCardSheet').hidden = false; $('bVeil').hidden = false; S.open = from || null;
  try { $('bCardClose').focus(); } catch (_) { /* nothing */ }
}
function closeCard() { $('bCardSheet').hidden = true; $('bVeil').hidden = true; if (S.open) { try { S.open.focus(); } catch (_) { /* nothing */ } } S.open = null; }

// DESIGN's brain (olympus/brain3d.js, window.Brain3D, mounted in the body by brain.html before the first paint; its three.js scene comes after
// load + on screen + idle, only on this page). Read only: it shows states, a tap opens the glass card. A bot switch = a new mount (another layout).
const ST3 = { done: 'passed', now: 'current', wait: 'waiting', off: 'waiting', blocked: 'blocked' };
const LOBE3 = { done: 'passed', armed: 'current', trade: 'current', signal: 'current', window: 'waiting', off: 'waiting', unknown: 'waiting' };
const RISK3 = { dll: 'daily' };
function feed3d(B) {
  let T = window.NQBRAIN_3D;
  if (!T || !window.Brain3D || !window.NQBRAIN_DEF) return;
  if (T.bot !== B.bot) {                                      // the switch: the other bot's brain (path <-> lobes)
    try { T.api.dispose(); } catch (_) { /* gone */ }
    T = window.NQBRAIN_3D = { bot: B.bot, api: window.Brain3D.mount($('brain3d'), window.NQBRAIN_DEF(B.bot)) };
    T.tapped = false;
  }
  if (!T.tapped) {
    T.tapped = true;
    T.api.on('tap', (id, kind) => {
      const M = S.model; if (!M) return;
      if (kind === 'ring') { const r = M.risk.find((x) => (RISK3[x.k] || x.k) === id); if (r) openInfo(r.label, r.value, r.why); return; }
      const key = M.bot === 'lit' ? id : (M.steps.find((x) => x.lobe === id && x.state === 'now') || M.steps.filter((x) => x.lobe === id && x.state === 'done').pop() || M.steps.find((x) => x.lobe === id) || {}).key;
      if (key) openCard(key, null);
    });
  }
  const up = { stageStates: {}, reasons: {}, ringStates: {}, ringValues: {} };
  if (B.bot === 'lit') {
    for (const s of B.steps) up.stageStates[s.key] = ST3[s.state] || 'waiting';
    if (B.current) { up.currentId = B.current.key; up.reasons[B.current.key] = B.cards[B.current.key].now; up.now = B.cards[B.current.key].why; up.pulse = Math.min(1, B.current.n / 10); }
  } else {
    for (const r of B.regions) { up.stageStates[r.id] = LOBE3[r.state] || 'waiting'; if (r.text) up.reasons[r.id] = r.text; }
    const cur = B.regions.find((r) => LOBE3[r.state] === 'current'); if (cur) { up.currentId = cur.id; up.now = cur.text; }
  }
  if (!B.has) up.now = 'The PC has not sent this bot\'s brain yet.';
  for (const r of B.risk) { const id = RISK3[r.k] || r.k; up.ringValues[id] = r.value; up.ringStates[id] = r.level === 'bad' ? 'bad' : r.level === 'warn' || r.level === 'unknown' ? 'warn' : 'ok'; }
  try { T.api.update(up); } catch (_) { /* the 2D list stays */ }
}
function openInfo(title, now, why) {
  $('bCardH').textContent = title; $('bCardNow').textContent = now; $('bCardWhy').textContent = why; $('bCardChange').textContent = 'A rule of MFFU\'s: the bot checks it before every order.';
  $('bCardSheet').hidden = false; $('bVeil').hidden = false; S.open = null; try { $('bCardClose').focus(); } catch (_) { /* nothing */ }
}

function boot() {
  const q = new URLSearchParams(location.search); if (q.get('bot') === 'atlas') S.bot = 'atlas';
  for (const b of document.querySelectorAll('.bsw')) b.addEventListener('click', () => { if (S.bot !== b.dataset.bot) { S.bot = b.dataset.bot; render(); } });
  $('bCardClose').addEventListener('click', closeCard); $('bVeil').addEventListener('click', closeCard);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('bCardSheet').hidden) closeCard(); });
  setInterval(() => { if (!document.hidden && S.ready) render(); }, 60000);
  load().catch(() => render());
}
window.NQBRAIN = { S, BC, render, ready: () => S.ready, openCard, closeCard, three: () => window.NQBRAIN_3D || null };
boot();
