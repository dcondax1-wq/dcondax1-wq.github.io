// SIBYL page (ES module): the prediction-market edge scanner. Reads money/sibyl.json (written by tools/money/sibyl.py from the Kalshi study) or fixture.json (DEMO, never blank).
// SUGGESTIONS ONLY: it never places, changes or stops a bet, sends nothing and keeps nothing. Text only through textContent / createElementNS. window.SIBYL is the test hook.
// The marble ball (sibylball.js, three.js) is a pure extra: if WebGL is missing the same tokens are drawn flat in an SVG, and everything works from the lists below it.
import * as C from './sibylcore.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const sign = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
const NS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; };
const S = { fixture: null, view: null, bank: 100, type: '', onlyPicks: false, sel: -1, now: 0, ball: null, flat: false, ready: false, built: false, rm: false };
const RM = () => { try { return O ? O.reduced() : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (_) { return false; } };

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
function say(t) { $('status').textContent = t; }
const tile = (box, k, v, n, cls) => { const t = h('div', 'tile'); t.appendChild(h('small', '', k)); t.appendChild(h('b', cls || '', v)); if (n) t.appendChild(h('span', '', n)); box.appendChild(t); };
const items = () => S.view.items;

const VERB = { stop: 'Stop', pause: 'Pause', watch: 'Watch', keep: 'Keep' };
function renderStop() {
  const d = S.stop; if (!d || !Array.isArray(d.items)) { $('stopCard').hidden = true; return; }
  $('stopCard').hidden = false;
  const c = d.counts || {};
  $('stopPill').textContent = S.stopSrc === 'saved' ? 'Saved copy' : 'Fresh study'; $('stopPill').className = 'pill ' + (S.stopSrc === 'saved' ? 'info' : 'ok');
  $('stopText').textContent = `Suggestions only, the bot is untouched. ${c.stop || 0} to stop, ${c.pause || 0} to pause, ${c.watch || 0} to watch. Dollars are what the bot really made or lost after Kalshi fees, with the number of bets (n).`;
  const ul = $('stopRows'); clear(ul);
  for (const it of d.items.filter((i) => i.verdict !== 'keep')) {
    const li = h('li', '');
    const iv = it.interval_pct && it.interval_pct[0] != null ? `, 95% range ${it.interval_pct[0]}% to ${it.interval_pct[1]}%${it.interval_is ? ' (' + it.interval_is + ')' : ' of stake'}` : '';
    li.appendChild(h('b', it.verdict === 'stop' ? 'neg' : '', `${VERB[it.verdict]}: ${it.kind}. `));
    li.appendChild(h('span', '', `${it.net_usd < 0 ? '-' : '+'}$${Math.abs(it.net_usd).toFixed(2)} over ${it.n} bets${it.roi_pct != null ? ', ' + it.roi_pct + '% of stake' : ''}${iv}. ${it.rule}`));
    ul.appendChild(li);
  }
  $('stopNote').textContent = (d.not_proven || []).join(' ');
}

function renderHero() {
  const v = S.view, pill = $('srcPill');
  pill.textContent = v.src === 'demo' ? 'Example' : v.status === 'stale' ? 'Old study' : 'Fresh study'; pill.className = 'pill ' + (v.src === 'demo' ? 'info' : v.status === 'stale' ? 'warn' : 'ok');
  $('head').textContent = C.headlineWords(v);
  const t = $('heroTiles'); clear(t);
  const best = items().find((i) => i.picked), sz = best ? C.sizeFor(best, S.bank) : null;
  tile(t, 'Paper picks today', String(v.counts.worthy), `of ${v.counts.edges} kinds of bet`);
  tile(t, 'Best pick: 1R', sz ? C.usd(sz.stake) : '$0.00', best ? `${best.title}, ${C.cents(best.edgeC)} per $1` : 'no pick clears the test');
  tile(t, 'Est. a month (best pick)', v.month != null && best ? C.usdS(v.month * S.bank / v.bank.usd) : 'none', v.month != null && best ? `${C.rWord(v.month * S.bank / v.bank.usd, sz.stake)} · estimate, not a promise` : 'no estimate without a pick', v.month > 0 ? 'pos' : '');
  $('srcNote').textContent = `${v.src === 'demo' ? 'Example numbers' : 'Study'}, updated ${v.src === 'demo' ? 'n/a' : C.ageWord(v.asof, S.now)}. Bankroll ${C.usd(v.bank.usd)}${v.bank.known ? '' : ' (an example: none in the study)'}.`;
}

function renderBank() {
  const inp = $('bank'); if (document.activeElement !== inp) inp.value = String(S.bank);
  const risk = C.totalRisk(items(), S.bank);
  $('bankNote').textContent = `Today's paper picks together risk ${C.usd(risk)} (${S.bank > 0 ? (risk / S.bank * 100).toFixed(1) : '0.0'}% of ${C.usd(S.bank)}). The cap is ${(S.view.params.capTotal * 100).toFixed(0)}%, and ${(S.view.params.cap * 100).toFixed(0)}% for one bet.`;
}

function itemCard(it, idx, open) {
  const li = h('li', 'pick'); li.dataset.idx = String(idx); if (idx === S.sel) li.classList.add('sel');
  const b = h('button', 'prow', ''); b.type = 'button'; b.setAttribute('aria-expanded', open ? 'true' : 'false'); b.setAttribute('aria-label', `${it.title}, ${C.TIERS[it.tier]}, score ${it.score}, ${it.n} bets`);
  const l = h('span', 'pl'); l.appendChild(h('b', '', it.title)); l.appendChild(h('small', '', `${it.type} · n=${it.n} bets`)); b.appendChild(l);
  const r = h('span', 'pr'); r.appendChild(h('span', 'pill ' + C.TIERCLS[it.tier], C.TIERS[it.tier])); r.appendChild(h('small', 'ag-num', `score ${it.score}`)); b.appendChild(r);
  const body = h('div', 'pbody'); body.hidden = !open;
  const bar = h('div', 'ag-bar ' + (it.score >= 60 ? 'green' : it.score >= 30 ? 'amber' : 'red')); bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', `Score ${it.score} of 100`); const bi = h('i'); bi.style.width = it.score + '%'; bar.appendChild(bi); body.appendChild(bar);
  const sz = C.sizeFor(it, S.bank);
  if (sz) {
    const t = h('div', 'tiles'); tile(t, 'Paper stake = 1R', C.usd(sz.stake), `${sz.pct.toFixed(2)}% of ${C.usd(S.bank)}`); tile(t, 'If it loses', C.usdS(sz.lose), C.rWord(sz.lose, sz.stake), 'neg');
    if (sz.win != null) tile(t, 'If it wins', C.usdS(sz.win), C.rWord(sz.win, sz.stake), 'pos');
    tile(t, `Halves in ${S.view.params.ruinBets} bets`, C.ruinWord(it.ruinPct), 'on the cautious win rate'); body.appendChild(t);
  }
  const t2 = h('dl', 'kv');
  const kv = (k, v) => { t2.appendChild(h('dt', '', k)); t2.appendChild(h('dd', '', v)); };
  if (it.win != null) { kv('Won', `${(it.win * 100).toFixed(1)}% of ${it.n}`); kv('Break-even', `${(it.breakEven * 100).toFixed(1)}%`); kv('Cautious win rate', `${(it.winLow * 100).toFixed(1)}%`); kv('Edge after fees', `${C.cents(it.evC)} per $1`); kv('Cautious edge', `${C.cents(it.edgeC)} per $1`); }
  if (t2.childNodes.length) body.appendChild(t2);
  body.appendChild(h('p', 'note', it.detail));
  b.addEventListener('click', () => { const o = b.getAttribute('aria-expanded') !== 'true'; b.setAttribute('aria-expanded', o ? 'true' : 'false'); body.hidden = !o; select(idx, false); });
  li.appendChild(b); li.appendChild(body); return li;
}

function renderPicks() {
  const box = $('picks'); clear(box);
  const picks = items().map((it, i) => [it, i]).filter(([it]) => it.picked);
  for (const [it, i] of picks) box.appendChild(itemCard(it, i, true));
  if (!picks.length) box.appendChild(h('li', 'note', 'No kind of bet clears the cautious test today. Staying out is a result.'));
  $('picksNote').textContent = picks.length ? 'Sorted by the cautious edge after fees. Each stake is a quarter of Kelly, capped. Paper only: nothing is bought.' : '';
}

function renderList() {
  const types = C.typesOf(items()), seg = $('types'); clear(seg);
  const chip = (label, val) => { const b = h('button', 'ag-chip', label); b.type = 'button'; b.dataset.type = val; b.setAttribute('aria-pressed', S.type === val ? 'true' : 'false'); b.addEventListener('click', () => { S.type = val; renderList(); say(val ? `Showing ${val}.` : 'Showing every kind of bet.'); }); seg.appendChild(b); };
  chip('All', ''); for (const t of types) chip(t, t);
  const pk = h('button', 'ag-chip', 'Picks only'); pk.type = 'button'; pk.id = 'onlyPicks'; pk.setAttribute('aria-pressed', S.onlyPicks ? 'true' : 'false'); pk.addEventListener('click', () => { S.onlyPicks = !S.onlyPicks; renderList(); }); seg.appendChild(pk);
  const box = $('list'); clear(box);
  const rows = items().map((it, i) => [it, i]).filter(([it]) => (!S.type || it.type === S.type) && (!S.onlyPicks || it.picked));
  for (const [it, i] of rows) box.appendChild(itemCard(it, i, false));
  if (!rows.length) box.appendChild(h('li', 'note', 'Nothing in this view.'));
  $('listNote').textContent = `${rows.length} of ${items().length} rows. Ranked: paper-worthy first, then fading, not proven, too few bets, avoid.`;
}

function renderScore() {
  const s = S.view.score; $('sbText').textContent = s.text;
  const p = $('sbPill'); p.textContent = s.status === 'collecting' ? `Collecting, n=${s.n}` : s.status === 'early' ? `Early, n=${s.n}` : `Building, n=${s.n}`; p.className = 'pill ' + (s.status === 'collecting' ? 'warn' : s.status === 'early' ? 'info' : 'ok');
  const body = $('sbRows'); clear(body);
  for (const x of s.sets) { const tr = h('tr'); tr.appendChild(h('th', '', x.name)); tr.appendChild(h('td', 'ag-num', String(x.n))); tr.appendChild(h('td', 'ag-num ' + sign(x.net), C.usdS(x.net))); tr.appendChild(h('td', 'ag-num ' + sign(x.vsAsis), x.id === 'asis' ? 'base' : C.usdS(x.vsAsis))); body.appendChild(tr); }
  $('sbTable').hidden = !s.sets.length;
  $('sbNote').textContent = s.note + (s.gaps ? ` ${s.gaps} gap(s) in the feed: the tally may be incomplete.` : '') + ' No claim is made below ' + s.minN + ' bets, and 30 is still very few.';
}

function renderOwn() {
  const o = S.own, p = $('ownPill'), t = $('ownTiles'), box = $('ownRows'); clear(t); clear(box);
  if (!o) { p.textContent = 'Not started'; p.className = 'pill'; $('ownText').textContent = 'Sibyl has not recorded a pick of its own yet. The ledger starts the first day a fresh study is scanned, and counts only picks made after that: nothing is back-filled.'; $('ownNote').textContent = ''; return; }
  p.textContent = o.claim ? `${o.status === 'early' ? 'Early' : 'Building'}, n=${o.n}` : `Collecting, n=${o.n}`; p.className = 'pill ' + (o.claim ? 'info' : 'warn');
  $('ownText').textContent = o.text;
  tile(t, 'Settled', String(o.n), 'won or lost'); tile(t, 'Still open', String(o.nOpen), 'not settled yet'); tile(t, 'Recorded', String(o.nBets), `since ${o.start}`);
  if (o.claim) { tile(t, 'Net', C.usdS(o.net), C.rWord(o.net, o.avg), o.net > 0 ? 'pos' : o.net < 0 ? 'neg' : ''); tile(t, 'Won', `${Math.round(o.winRate * 100)}%`, `${o.wins} of ${o.n}`); }
  else tile(t, 'Net and win rate', 'hidden', `until ${C.OWN_MIN} bets settle`);
  for (const b of o.recent) { const li = h('li', 'bet'); const done = b.status === 'won' || b.status === 'lost'; li.appendChild(h('b', done ? sign(b.pnl) : '', done ? `${C.usdS(b.pnl)} (${C.rWord(b.pnl, b.stake)})` : b.status === 'void' ? 'Void' : 'Open')); li.appendChild(h('span', 'note', `${b.day} · ${b.title} · stake ${C.usd(b.stake)} = 1R`)); box.appendChild(li); }
  $('ownNote').textContent = 'Recorded by tools/money/sibyl_ledger.py on the day Sibyl made each pick, settled later from a results file. Paper only: no bet was ever placed.';
}

function renderRisks() {
  const box = $('risks'); clear(box);
  for (const r of S.view.risks) { const li = h('li', 'risk ' + r.level); const t = h('div', 'row'); t.appendChild(h('b', '', r.title)); t.appendChild(h('span', 'pill ' + C.RISKCLS[r.level], r.level === 'high' ? 'High' : r.level === 'med' ? 'Medium' : 'Low')); li.appendChild(t); li.appendChild(h('p', 'note', r.detail)); box.appendChild(li); }
  const nt = $('notes'); clear(nt); for (const n of S.view.notes) nt.appendChild(h('li', '', n));
}

// ------------------------------------------------------------------------------------------------ the ball (3D) and its flat twin
function renderFlat(t) {
  const svg = $('flat'); clear(svg);
  const defs = sv('defs'), g = sv('radialGradient', { id: 'mb', cx: '38%', cy: '34%', r: '70%' });
  g.appendChild(sv('stop', { offset: '0', 'stop-color': '#f1ebdd' })); g.appendChild(sv('stop', { offset: '0.7', 'stop-color': '#c9c0ae' })); g.appendChild(sv('stop', { offset: '1', 'stop-color': '#8d8472' })); defs.appendChild(g); svg.appendChild(defs);
  svg.appendChild(sv('path', { d: 'M132 206h56l-6 22h-44z', fill: '#9c6b3c' })); svg.appendChild(sv('ellipse', { cx: 160, cy: 206, rx: 40, ry: 7, fill: '#7a5230' }));
  svg.appendChild(sv('circle', { cx: 160, cy: 112, r: 62, fill: 'url(#mb)', stroke: '#9c6b3c', 'stroke-width': 1.5 }));
  svg.appendChild(sv('path', { d: 'M126 96c18 8 30 4 44 18s20 8 34 2', fill: 'none', stroke: '#8a8070', 'stroke-width': 1, opacity: '.55' }));
  for (const tk of C.tokenLayout(items(), 8)) {
    const p = C.flatPos(tk, t || 0), r = 14 + tk.size * 14, on = tk.i === S.sel;
    const gr = sv('g'); gr.appendChild(sv('circle', { cx: p.x, cy: p.y, r: on ? r + 3 : r, fill: '#d6b45c', stroke: tk.tier === 'worthy' ? '#7f8a52' : tk.tier === 'avoid' ? '#c96a4a' : '#9c6b3c', 'stroke-width': 2.5 }));
    gr.appendChild(sv('text', { x: p.x, y: p.y + 4, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#2b2012' }, tk.label)); svg.appendChild(gr);
  }
}
async function startBall() {
  const q = new URLSearchParams(location.search).get('q'), canvas = $('stage');
  const flat = (why) => { S.flat = true; $('flat').hidden = false; canvas.hidden = true; renderFlat(0); S.why = why; };
  if (q === 'off' || q === 'flat') { flat('3D is off'); return; }
  try {
    for (let k = 0; k < 25 && !window.SIBYL_BALL && !window.SIBYL_BALL_FAIL; k++) await new Promise((r) => setTimeout(r, 100));   // sibylball.js is its own module tag: if it fails to load the page goes on flat
    if (!window.SIBYL_BALL) throw new Error('the 3D module did not load');
    S.ball = window.SIBYL_BALL.createBall(canvas, items(), { reduced: RM(), onPick: (i) => select(i, true) });
    if (O && O.mode) O.mode(S.ball.lite);
    $('flat').hidden = true;
  } catch (e) { S.ball = null; flat(String(e && e.message ? e.message : e).slice(0, 80)); }
}

function select(i, scroll) {
  S.sel = i; if (S.ball) S.ball.select(i); if (S.flat) renderFlat(0);
  document.querySelectorAll('.pick').forEach((li) => li.classList.toggle('sel', Number(li.dataset.idx) === i));
  const it = items()[i]; if (it) say(`${it.title}: ${C.TIERS[it.tier]}, score ${it.score}, ${it.n} bets.`);
  if (scroll) { const li = document.querySelector(`#picks .pick[data-idx="${i}"]`) || document.querySelector(`#list .pick[data-idx="${i}"]`); if (li) { const b = li.querySelector('.prow'); if (b && b.getAttribute('aria-expanded') !== 'true') b.click(); li.scrollIntoView({ block: 'center', behavior: RM() ? 'auto' : 'smooth' }); } }
}

function render() {
  $('demo').hidden = !(S.view.src === 'demo'); try { $('lite').hidden = !(O && O.lite && O.lite()); } catch (_) { $('lite').hidden = true; }
  renderHero(); renderBank(); renderPicks(); renderList(); renderScore(); renderOwn(); renderStop(); renderRisks();
  say(`Sibyl: ${S.view.counts.worthy} paper pick${S.view.counts.worthy === 1 ? '' : 's'} of ${S.view.counts.edges} kinds of bet. ${S.view.src === 'demo' ? 'Example numbers. ' : S.view.status === 'stale' ? 'Old study. ' : ''}Suggestions only.`);
}

async function boot() {
  const q = new URLSearchParams(location.search), forced = q.get('demo') === '1', at = q.get('at');
  S.now = at && Number.isFinite(Date.parse(at)) ? Date.parse(at) / 1000 : Date.now() / 1000;
  const [fx, real, own] = await Promise.all([getJSON('./fixture.json'), forced ? null : getJSON('../money/sibyl.json'), forced ? null : getJSON('../money/sibyl_forward.json')]);
  const sug = forced ? null : await getJSON('../kalshicity/suggestions.json');
  S.stop = sug && Array.isArray(sug.items) ? sug : await getJSON('./suggestions_fixture.json'); S.stopSrc = sug && Array.isArray(sug.items) ? 'live' : 'saved';
  S.fixture = fx; const v = C.chooseView(real, fx); if (!v) throw new Error('no numbers');
  S.view = v; S.bank = v.bank.usd; S.own = v.src === 'demo' ? v.own : C.normOwn(own);
  const b = Number(q.get('bank')); if (Number.isFinite(b) && b > 0 && b <= 1e6) S.bank = Math.round(b * 100) / 100;
  render();
  $('bank').addEventListener('input', () => { const x = Number($('bank').value); if (Number.isFinite(x) && x > 0 && x <= 1e6) { S.bank = x; renderHero(); renderBank(); renderPicks(); renderList(); } });
  await startBall();
  S.ready = true;
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
}
window.addEventListener('pagehide', () => { try { if (S.ball) S.ball.dispose(); } catch (_) { /* gone */ } });
window.SIBYL = { S, C, ready: () => S.ready, render, select, get ball() { return S.ball; }, get flat() { return S.flat; } };
boot().catch((e) => { say('Something went wrong: ' + (e && e.message ? e.message : e)); try { if (O && O.fail) O.fail('Sibyl could not start'); } catch (_) { /* nothing */ } });
