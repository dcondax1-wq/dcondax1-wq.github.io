// KALSHI CITY page (ES module): loads edges.json + learning_log.json (the learning engine, tools/kalshi_edges.py) and the bot's live numbers (this site's
// kalshi.json), shapes them (cityfeed.js), lays the city out (citylayout.js), draws it (cityscene.js) and writes the words. Text only through
// textContent (no data ever becomes HTML). Read only: nothing here writes anywhere. window.KC is the test hook.
import { shape, shapeHyps, cardFreshness, cardBotStatus, cardOf, headlineOf, usd, pct, evf, pts, STATUS_COLOR, STATUS_WORD, ADVICE, etHour, clockLabel, phaseWord, MIN_N,
  hypOf, hypCardOf, pairOf, tickerLines, changesOf, HYP_COLOR, HYP_WORD, worldBotLabel } from './cityfeed.js?v=bot20';
import { layout } from './citylayout.js?v=night8';
import { cityAtlas, edgeCountLabel } from './cityatlas.js?v=skyline8';
import { districtOptionLabel, districtTitle } from './citynav.js?v=nav1';
import { lessonsView, historyView, ASK_MESSAGE } from './lessons.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
const KEY = 'kalshicity.v1';
const store = {
  read() { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; } },
  write(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (_) { /* private mode */ } },
};
const S = { learned: null, sound: false, copied: false, model: null, L: null, demo: true, scene: null, atlas: null, view: '', ready: false, error: null, sel: null, logMore: 40, liveFailed: false, preview: null,
  prevHyp: null, changes: [], districtKey: 'Downtown', tk: { lines: [], i: 0 } };
/** the dollars of every idea tower, stored on the phone so the next visit can show what grew or shrank in between */
const hypSnap = (m) => { const o = {}; if (m.hyp && !m.hyp.demo) m.hyp.hyps.forEach((h) => { o[`${h.id}:back`] = h.back.gain; o[`${h.id}:live`] = h.live.gain; o[`${h.id}:prog`] = h.nLive; }); return o; };
const reduced = () => (O ? O.reduced() : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches));
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
const kids = (el, ...c) => { el.replaceChildren(...c.flat().filter(Boolean)); return el; };

async function getJSON(url, ms = 7000) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
// the feed is this site's own copy (pc_publish puts the Kalshi bot's feed next to the pages as kalshi.json), nothing else: the old kalshi-feed
// repo on the suspended account is retired (polish2 2026-11-19). A host that answers a missing file with its index page gives HTML: not an object = none.
const SITE_FEED = '../kalshi.json';
async function getFeed(ms) { const j = await getJSON(SITE_FEED, ms); return j && typeof j === 'object' && !Array.isArray(j) ? j : null; }
const dollars = (x) => usd(x);
const smoney = (x) => (x == null ? '-' : `${x < 0 ? '-' : '+'}$${Math.abs(x).toFixed(2)}`);
const dotOf = (e) => { const d = h('span', 'dot'); d.style.background = e.small ? '#8a7f6e' : STATUS_COLOR[e.status]; return d; };

// ------------------------------------------------------------------------------------------------ the top card
function renderTop() {
  const m = S.model, bk = m.book;
  $('vText').textContent = headlineOf(m);
  $('oMore').textContent = String(m.counts.doMore);
  $('oStop').textContent = String(m.counts.stop);
  $('oRuin').textContent = bk.ruinNow == null ? '-' : bk.ruinNow >= 0.995 ? '~100%' : pct(bk.ruinNow, 0);
  const bot = [`${bk.name}: ${bk.status || bk.mode || 'unknown'}`, bk.balance != null ? `bankroll ${dollars(bk.balance)}` : '', bk.week != null ? `week ${smoney(bk.week)}` : ''].filter(Boolean).join(' · ');
  const led = m.ledger;
  const seen = led && led.n ? ` · learned from ${led.n}${led.bets_total ? ` of ${led.bets_total.toLocaleString('en-US')}` : ''} bets read one by one, the rest from the bot's totals` : '';
  const age = m.age > 3 * 86400 ? ` · learning is ${Math.floor(m.age / 86400)} days old` : '';
  const botAge = !bk.statusFresh ? (bk.feedAge == null ? ' · no timestamped bot report' :
    ` · last bot report ${bk.feedAge < 3600 ? Math.floor(bk.feedAge / 60) + ' min' : Math.floor(bk.feedAge / 3600) + ' h'} ago${bk.lastStatus ? ' (' + bk.lastStatus + ')' : ''}`) : '';
  $('bot').textContent = `${bot}${botAge}${seen}${age}`;
  $('bot').dataset.feed = bk.statusFresh ? 'fresh' : 'unverified';
  $('bot').hidden = false;
  const wx = $('wx'), r = m.regime;
  wx.textContent = `${{ clear: 'Clear', overcast: 'Overcast', rain: 'Rain', storm: 'Storm' }[r.state]}${r.paused ? ' · fog' : ''}`;
  wx.dataset.wx = r.state; wx.title = r.why + (r.paused ? '. Fog: the bot is paused.' : '');
  $('demo').hidden = !S.demo;
  renderPair(); renderTicker(true);
}
// ---- Best edge so far / Worst leak (dollars, never blank) and the learning ticker
const pairSub = (p, fixWord) => `${p.label} · ${p.n} bets${p.fix && S.model.hyp ? ` · ${fixWord}: ${S.model.hyp.byId.get(p.fix).name}` : ''}`;
function renderPair() {
  const P = pairOf(S.model);
  const fill = (v, s, p, word, none) => { $(v).textContent = p ? smoney(p.pnl) : '$0.00'; $(s).textContent = p ? pairSub(p, word) : none; };
  fill('pBestV', 'pBestS', P.best, 'made', 'No edge has 30 bets and a profit yet');
  fill('pWorstV', 'pWorstS', P.worst, 'fix', 'No leak has 30 bets and a loss yet');
}
function renderTicker(reset) {
  if (reset) { S.tk.lines = tickerLines(S.model, S.changes); S.tk.i = 0; }
  $('tkText').textContent = S.tk.lines[S.tk.i % S.tk.lines.length];
}
function tickNext() {
  if (document.hidden || S.view || S.tk.lines.length < 2) return;
  S.tk.i = (S.tk.i + 1) % S.tk.lines.length;
  const el = $('tkText'); el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; renderTicker(false);
}
function pairPick(which) {
  const p = pairOf(S.model)[which];
  if (!p) { openSheet('lab'); return; }
  const idea = which === 'worst' && p.fix ? `hyp:${p.fix}:back` : null;
  if (idea && S.model.hyp) selectEdge(idea, true); else if (S.model.byId.has(p.id)) selectEdge(p.id, true); else openSheet('lab');
}
function renderClock() {
  const hr = S.scene ? S.scene.hour() : (S.preview != null ? S.preview : etHour());
  const c = $('clock');
  c.textContent = `${clockLabel(hr)} · ${phaseWord(hr)}`;
  c.title = `New York time${S.preview != null ? ' (a preview: tap for the next hour)' : ''}`;
  c.classList.toggle('preview', S.preview != null);
}

function renderMiniMap() {
  const wards = S.L.neighborhoods || [];
  const svg = $('miniSvg'), places = [...S.L.districts, ...(S.L.labs || []), ...wards.map((d) => ({ ...d, ward: true, color: '#749ebf' }))].filter((d) => Number.isFinite(d.cx) && Number.isFinite(d.cz));
  const core = S.L.districts.find((d) => d.key === 'Downtown') || places[0];
  const edge = Math.max(1, ...places.flatMap((d) => [Math.abs(d.cx), Math.abs(d.cz)]));
  const at = (x, z) => [50 + x / edge * 40, 50 + z / edge * 40];
  const node = (tag, attrs) => { const el = document.createElementNS('http://www.w3.org/2000/svg', tag); Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k, String(v))); return el; };
  const elements = [];
  if (core) {
    const [x,y] = at(core.cx, core.cz);
    places.forEach((d) => { if (d === core || d.ward) return; const [dx,dy] = at(d.cx, d.cz);
      elements.push(node('path', { d:`M ${x} ${y} Q ${(x+dx)/2} ${Math.min(y,dy)-8} ${dx} ${dy}` })); });
  }
  (S.L.roads || []).filter((road) => road.kind.startsWith('ward-')).forEach((road) => {
    const [x0,y0] = at(road.x0, road.z0), [x1,y1] = at(road.x1, road.z1);
    elements.push(node('path', { d:`M ${x0} ${y0} L ${x1} ${y1}`, 'data-kind':road.kind, opacity:0.44 }));
  });
  places.forEach((d) => { const [cx,cy] = at(d.cx, d.cz);
    elements.push(node('circle', { cx, cy, r:d===core ? 4 : d.ward ? 1.15 : d.lab ? 2.1 : 3, fill:d.color || (d.lab ? '#b9a98c' : '#d69c62'), opacity:d.ward ? 0.58 : 1 })); });
  svg.replaceChildren(...elements);
  const marketCount = Math.max(0, S.L.districts.length - 1);
  $('miniCount').textContent = `${marketCount} market districts · ${wards.length} scene wards`;
  $('miniCount').title = 'Scene wards are decorative blocks, not extra market data.';
}

function renderDistrictSwitch() {
  const select = $('districtSelect');
  if (!select || !S.L) return;
  const districts = S.L.districts || [];
  if (!districts.some((d) => d.key === S.districtKey)) S.districtKey = districts[0]?.key || 'Downtown';
  const options = districts.map((d) => {
    const option = document.createElement('option');
    option.value = d.key;
    option.textContent = districtOptionLabel(d, S.demo);
    return option;
  });
  select.replaceChildren(...options);
  select.value = S.districtKey;
  const d = districts.find((item) => item.key === S.districtKey);
  if (d) {
    const count = Number.isFinite(d.count) ? d.count : 0;
    const source = S.demo ? 'demo' : 'published';
    $('districtStatus').textContent = `${districtTitle(d)} · ${count} ${source} ${count === 1 ? 'edge' : 'edges'} · 3D moves camera · map opens edge list`;
    $('districtStatus').title = 'In 3D, this selector moves the camera. If WebGL is unavailable, it opens the selected market’s edge list. Scenic wards are not market data; this selector never controls the bot.';
  }
}

function switchDistrict(key) {
  const d = S.L && S.L.districts.find((item) => item.key === key);
  if (!d) return false;
  S.districtKey = d.key;
  $('districtSelect').value = d.key;
  renderDistrictSwitch();
  if (S.view) closeSheet();
  S.sel = null;
  if (S.scene) { S.scene.select(null); S.scene.focusDistrict(d.key); }
  else if (S.atlas) S.atlas.focusDistrict(d.key);
  return true;
}

function setNetworkPanel(open) {
  const panel = $('networkPanel'), toggle = $('networkToggle');
  panel.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
}

// ------------------------------------------------------------------------------------------------ sheets
const TITLES = { worlds: 'Worlds: city atlas', lab: 'The Lab: ideas being tested', learn: 'What the city learned', board: 'Leaderboard: the best edges', moves: 'Do more · Stop doing', risk: 'Risk and sizing', guide: 'How to read the city', lessons: 'What we learned', history: 'Ask for the full history', card: '' };

function edgeRow(e, i, extra) {
  const b = h('button', `row-btn${e.small ? ' grey' : ''}`); b.type = 'button'; b.dataset.id = e.id;
  const nm = h('span', 'nm'); nm.append(dotOf(e), document.createTextNode(e.label));
  const sm = h('small', '', `${e.n} bets${e.small ? ' (too few)' : ''} · ${e.status.toLowerCase()}${extra ? ` · ${extra}` : ''}`); nm.append(sm);
  b.append(h('span', 'rk', i == null ? '' : String(i + 1)), nm, h('span', 'ev', e.ev == null ? '-' : evf(e.ev)));
  b.addEventListener('click', () => selectEdge(e.id, true));
  return b;
}
function listOf(ids, make, empty) {
  const ul = h('ul', 'list');
  if (!ids.length) return h('p', '', empty);
  ids.forEach((id, i) => { const e = S.model.byId.get(id); if (e) { const li = h('li'); li.append(make(e, i)); ul.append(li); } });
  return ul;
}

/** the Lab: every research idea with its paper score, the pair in dollars, and the plain-words learning log */
function labView() {
  const H = S.model.hyp, P = pairOf(S.model);
  if (!H) return [h('p', 'strong', 'No ideas are being tested yet. The first ones are registered on the next run of the engine.')];
  const box = h('div', 'pairbox');
  [['Best edge so far', P.best, 'good'], ['Worst leak', P.worst, 'bad']].forEach(([k, p, tone]) => {
    const b = h('button', `pcard ${tone}`); b.type = 'button'; b.append(h('span', 'k', k), h('b', '', p ? smoney(p.pnl) : '$0.00'), h('small', '', p ? pairSub(p, 'fix') : 'Nothing proven yet'));
    b.addEventListener('click', () => pairPick(tone === 'good' ? 'best' : 'worst')); box.append(b);
  });
  const ul = h('ul', 'list ideas');
  [...H.hyps].sort((a, b) => Math.abs(b.back.gain) - Math.abs(a.back.gain)).forEach((x) => {
    const li = h('li'), b = h('button', 'row-btn'); b.type = 'button'; b.dataset.id = `hyp:${x.id}:back`;
    const nm = h('span', 'nm'); nm.append(document.createTextNode(x.name));
    const live = x.kind === 'filter' ? `${x.live.nSkip} live bets ${smoney(x.live.gain)}` : x.kind === 'data' ? 'needs data' : `${x.live.nAll} live bets`;
    nm.append(h('small', '', `${x.kind === 'filter' ? `looking back ${smoney(x.back.gain)} on ${x.back.nSkip} bets` : x.kind === 'fee' ? `up to ${smoney(x.back.gain)} if filled` : x.kind === 'size' ? `${smoney(x.back.gain)} on the same bets` : 'not testable yet'} · ${live}`));
    const w = h('span', 'ev', HYP_WORD[x.word]); w.style.color = HYP_COLOR[x.word];
    b.append(nm, w); b.addEventListener('click', () => selectEdge(`hyp:${x.id}:back`, true)); li.append(b); ul.append(li);
  });
  const log = H.log.slice().reverse(), lul = h('ul', 'list log');
  log.slice(0, 30).forEach((x) => {
    const li = h('li'), bar = h('span', 'bar'); bar.style.background = x.kind === 'live' ? '#a0af6a' : x.kind === 'started' ? '#b9a98c' : '#d9a26b';
    const body = h('div'); body.append(h('small', '', x.d), document.createTextNode(x.text)); li.append(bar, body); lul.append(li);
  });
  return [H.demo ? h('p', 'warnbox', 'DEMO ideas: invented bets, not the bot\'s numbers. The real ideas appear as soon as the engine has run once.') : null,
    h('p', 'strong', 'Each idea is a rule that might turn the bot\'s loss into a profit. The engine keeps a paper score for it on every run: nothing here places an order.'), box,
    h('p', '', 'Looking back, every rule looks good, because it was picked after seeing the bets. Only LIVE bets (after the idea was registered) can prove it, and it needs 30 before it says anything.'),
    h('h3', '', `Ideas (${H.hyps.length})`), ul, h('h3', '', 'What the lab learned'), log.length ? lul : h('p', '', 'Nothing yet.')];
}
function learnView() {
  const m = S.model, log = m.log.slice().reverse();
  const ul = h('ul', 'list log');
  log.slice(0, S.logMore).forEach((x) => {
    const li = h('li'), bar = h('span', 'bar');
    bar.style.background = x.advice ? ADVICE[x.advice].color : 'rgba(255,255,255,.25)';
    const body = h('div');
    body.append(h('small', '', `${x.d}${x.kind === 'run' ? ' · read' : ''}`));
    if (x.id && m.byId.has(x.id)) { const b = h('button', '', x.text); b.type = 'button'; b.addEventListener('click', () => selectEdge(x.id, true)); body.append(b); } else body.append(document.createTextNode(x.text));
    li.append(bar, body); ul.append(li);
  });
  const out = [h('p', 'strong', 'Every time the engine re-measures the bets, what it learned is written here with the date. Old lines are never rewritten.'), log.length ? ul : h('p', '', 'Nothing learned yet.')];
  if (log.length > S.logMore) { const b = h('button', 'more', `Show ${Math.min(40, log.length - S.logMore)} more`); b.type = 'button'; b.addEventListener('click', () => { S.logMore += 40; openSheet('learn'); }); out.push(b); }
  return out;
}
/** A navigable atlas of the market cities and the independent paper strategy labs. */
function worldsView() {
  const L = S.L, H = S.model.hyp, wrap = h('div', 'worlds');
  wrap.append(h('p', 'strong', 'One connected night city, with a market district for each market in the published data. Choose a district to fly there. Outer research outposts are separate paper tests.'));
  const pulse = h('div', 'world-pulse');
  pulse.append(h('span', 'pulse-light'), h('span', 'pulse-state', worldBotLabel(S.model.book, S.demo)), h('span', 'pulse-meta', `${L.districts.length} market districts · ${L.labs.length} research outposts`));
  pulse.querySelector('.pulse-state').setAttribute('aria-live', 'polite');
  const find = h('input', 'world-find');
  find.type = 'search'; find.placeholder = 'Find a district: bitcoin, gold, strategy...'; find.setAttribute('aria-label', 'Find a district'); find.autocomplete = 'off';
  const key = h('p', 'world-key', 'Tall tower = big edge (profit per $1). Olive = do more, gold = keep, bronze = watch, terracotta = stop. The bank vault is the balance; the harbour holds the open bets.');
  wrap.append(pulse, find, key, h('h3', '', 'City districts'));
  const grid = h('div', 'world-grid');
  const band = (list, ids) => list.filter((e) => ids.includes(e.id)).length;
  const Ls = S.model.lists;
  find.addEventListener('input', () => {
    const w = find.value.toLowerCase().split(/\s+/).filter(Boolean);
    grid.querySelectorAll('.world-card').forEach((c) => { c.hidden = !w.every((x) => c.dataset.q.includes(x)); });
  });
  L.districts.forEach((d, i) => {
    const candidates = d.list.filter(e => !e.small && e.ev != null).sort((a,b) => b.ev - a.ev);
    const best = candidates[0], c = h('button', 'world-card');
    c.type = 'button'; c.style.setProperty('--world-color', d.color);
    const glyph = h('span', 'world-glyph', i === 0 ? '◆' : String(i).padStart(2,'0'));
    const top = h('span', 'world-top'); top.append(glyph, h('span','world-count', edgeCountLabel(d.count)));
    const name = h('strong','',districtTitle(d));
    const detail = h('small','',best ? `Strongest observed: ${best.label} · ${evf(best.ev)} per $1` : 'Collecting bets; no tested edge yet');
    const bands = h('small', 'world-bands', `${band(d.list, Ls.doMore)} do more · ${band(d.list, Ls.watch)} watch · ${band(d.list, Ls.stop)} stop`);
    c.dataset.q = `${districtTitle(d)} ${d.key} ${i === 0 ? 'downtown strategy price band side hour' : (d.key === 'Gold' || d.key === 'Silver' ? 'metals' : d.key === 'Other' ? 'other' : 'crypto')}`.toLowerCase();
    c.append(top,name,detail,bands,h('span','world-action','FLY TO DISTRICT  ↗'));
    c.addEventListener('click', () => {
      switchDistrict(d.key);
      if (best) selectEdge(best.id,true);
      else if (d.list.length) selectEdge(d.list[0].id,true);
      else closeSheet();
    });
    grid.append(c);
  });
  // market types (the data decides: crypto, metals, other) and Downtown's quarters by kind of edge, each with its edge bands and its tallest tower
  const TYPE = { Gold: 'Metals', Silver: 'Metals', Other: 'Other markets' }, typeOf = (k) => TYPE[k] || 'Crypto';
  const types = new Map();
  L.districts.slice(1).forEach((d) => { const t = typeOf(d.key); if (!types.has(t)) types.set(t, []); types.get(t).push(d); });
  const QUARTER = { strategy: 'Strategy quarter', hour: 'Hour quarter', band: 'Price-band quarter', side: 'Side quarter', combo: 'Combination quarter' };
  const quarters = new Map();
  (L.districts[0]?.list || []).forEach((e) => { const k = QUARTER[e.kind] ? e.kind : 'combo'; if (!quarters.has(k)) quarters.set(k, []); quarters.get(k).push(e); });
  const row = (title, list, onTap) => {
    const real = list.filter((e) => !e.small && e.ev != null).sort((a, b) => b.ev - a.ev), top = real[0] || list[0];
    const r = h('button', 'world-lab'); r.type = 'button';
    r.append(h('span', 'lab-number', String(list.length)), h('span', 'lab-description', title),
      h('span', 'lab-verdict', `${band(list, Ls.doMore)} do more · ${band(list, Ls.watch)} watch · ${band(list, Ls.stop)} stop${top && top.ev != null ? ' · tallest ' + evf(top.ev) + ' per $1' : ''}`));
    r.addEventListener('click', () => onTap(top)); return r;
  };
  const groups = h('div', 'world-labs');
  groups.append(h('h3', '', 'By market type'));
  for (const [t, ds] of types) groups.append(row(`${t}: ${ds.map((d) => d.key).join(', ')}`, ds.flatMap((d) => d.list), (top) => { switchDistrict(ds[0].key); if (top) selectEdge(top.id, true); }));
  groups.append(h('h3', '', 'Downtown quarters'));
  for (const [k, list] of quarters) groups.append(row(QUARTER[k], list, (top) => { switchDistrict('Downtown'); if (top) selectEdge(top.id, true); }));
  wrap.append(grid, groups, h('h3', '', 'Research outposts'));
  if (!H || !H.hyps.length) wrap.append(h('p','', 'No research ideas have been recorded yet. They appear when the next learning run publishes them.'));
  else {
    const labs = h('div','world-labs');
    H.hyps.forEach((idea,i) => {
      const b = h('button','world-lab'); b.type = 'button';
      b.style.setProperty('--world-color',L.labs[i]?.color || '#b9a98c');
      b.append(h('span','lab-number',String(i+1).padStart(2,'0')), h('span','lab-description',idea.name),
        h('span','lab-verdict',`${HYP_WORD[idea.word] || 'Collecting'} · ${idea.nLive || 0} later bets`));
      b.addEventListener('click',() => selectEdge(`hyp:${idea.id}:live`,true)); labs.append(b);
    });
    wrap.append(labs);
  }
  wrap.append(h('p','world-note','Market districts use only published edge records. Scenery has no market data; slices overlap, so their bet counts and profits cannot be added together. Ideas are paper tests; nothing here changes the bot or places an order.'));
  return [wrap];
}
function boardView() {
  const m = S.model;
  const small = m.edges.filter((e) => e.small && e.size === 1).sort((a, b) => b.n - a.n).slice(0, 6).map((e) => e.id);
  return [h('p', 'strong', 'The edges with the biggest proven lead over the market (win rate low end minus the market\'s own odds). Tap one to fly to its building.'),
    listOf(m.lists.board.slice(0, 15), (e, i) => edgeRow(e, i), 'No edge has 30 bets yet.'),
    small.length ? h('h3', '', 'Too few bets to rank (grey)') : null, small.length ? listOf(small, (e) => edgeRow(e, null), '') : null];
}
function movesView() {
  const m = S.model, L = m.lists;
  return [h('h3', '', `Do more (${m.counts.doMore})`), h('p', '', 'Proven to beat the odds, and worth a stake. The stake is a quarter of a conservative Kelly, never more.'),
    listOf(L.doMore, (e, i) => edgeRow(e, i, e.stake ? `stake ${usd(e.stake)}` : ''), 'Nothing is proven strongly enough yet. That is the honest answer for now.'),
    h('h3', '', `Stop doing (${m.counts.stop})`), h('p', '', 'Proven to lose money, or losing in every window.'),
    listOf(L.stop, (e, i) => edgeRow(e, i, `lost ${usd(Math.abs(e.pnl || 0))}`), 'Nothing is proven to lose yet.'),
    h('h3', '', `Watch (${m.counts.watch})`), h('p', '', 'Fading, or losing but not yet proven. Do not add size.'),
    listOf(L.watch.slice(0, 8), (e, i) => edgeRow(e, i), 'None.')];
}
function riskView() {
  const bk = S.model.book, rows = h('ul', 'kv');
  const add = (k, v, tone) => { const li = h('li', tone || ''); li.append(h('span', 'k', k), h('span', 'v', v)); rows.append(li); };
  add('Bankroll', bk.balance == null ? '-' : dollars(bk.balance));
  add('Average bet', bk.stakeAvg == null ? '-' : `${dollars(bk.stakeAvg)}${bk.stakeFrac != null ? ` (${pct(bk.stakeFrac, 0)} of the bankroll)` : ''}`, bk.stakeFrac > 0.1 ? 'bad' : '');
  add('Win rate / break-even', bk.w == null ? '-' : `${pct(bk.w)} / ${pct(bk.p)}`);
  add('Profit per $1 staked', bk.ev == null ? '-' : `${evf(bk.ev)} after fees`, bk.ev > 0 ? 'ok' : 'bad');
  add('Kelly for the whole book', bk.kellyBook == null ? '-' : bk.kellyBook > 0 ? pct(bk.kellyBook) : 'none: no edge overall', bk.kellyBook > 0 ? 'ok' : 'bad');
  add('Chance of losing half at this bet size', bk.ruinNow == null ? '-' : bk.ruinNow >= 0.995 ? 'about 100%' : `up to ${pct(bk.ruinNow, 0)}`, bk.ruinNow > 0.3 ? 'bad' : '');
  add('...at a quarter Kelly', bk.ruinKelly == null ? '-' : `up to ${pct(bk.ruinKelly, 1)}`, 'ok');
  add('Last 7 days / 30 days', `${smoney(bk.pnl7)} / ${smoney(bk.pnl30)}`);
  add('Worst day / best day', `${bk.worstDay == null ? '-' : usd(bk.worstDay)} / ${bk.bestDay == null ? '-' : usd(bk.bestDay)}`);
  const lines = [];
  if (bk.stakeFrac > 0.1) lines.push('Each bet is a big slice of the bankroll. When almost every bet wins, one loss costs as much as many wins; sizing down is the safest change.');
  if (bk.kellyBook != null && bk.kellyBook <= 0) lines.push('Across everything the bot has done, wins have not beaten the break-even rate after fees. Only the proven edges (Moves) deserve a stake.');
  return [h('p', 'strong', 'Kelly says how much of the bankroll an edge deserves. "Losing half" is an upper bound for the chance the bankroll ever falls to half while betting that size.'), rows,
    ...lines.map((t) => h('p', 'warnbox', t)), h('p', '', 'A what-if on the bot\'s own numbers. It never places or changes an order.')];
}
function guideView() {
  const lg = (color, text) => { const d = h('div', 'legend'); const sw = h('span', 'sw'); sw.style.background = color; d.append(sw, h('span', '', text)); return d; };
  return [h('p', 'strong', 'Each building is one edge: a slice of the bot\'s bets (a strategy, a market, a price band, an hour, yes or no, or a mix).'),
    lg('#d9a26b', 'Height: profit per $1 staked (after fees). A losing edge is a low stub.'),
    lg('#a0af6a', 'Roof glow: the recent win rate. Roof colour is the status: green growing, gold holding, orange fading, red dead, blue new.'),
    lg('#d79e65', 'Windows: the bets. Gold windows won, red windows lost.'),
    lg('#8a7f6e', 'Grey and low: fewer than 30 bets. Too few to trust: no verdict, no stake.'),
    lg('#b9a98c', 'Going up with a crane: a new edge. Crumbling with embers: one that just died.'),
    lg('#9fae68', 'Roads: capital out (cool cars), bets that came back (gold won, red lost). Pink cars are the bot\'s open orders.'),
    lg('#d49759', 'Weather is the last 7 days: clear, overcast, rain, storm. Fog means the bot is paused. Day and night follow New York time.'),
    lg('#9fae68', 'The scanner (the round button) sweeps the city when the engine learns something new, and the buildings it learned light up. Fireworks mark a new DO MORE edge.'),
    lg('#ca785c', 'Neon signs name the tallest edges (flickering = fading, STOP = dead). Lightning means a storm or a high risk of ruin; in rain every glowing building reflects on the street. The note button turns the ambience on.'),
    lg('#dcaa78', 'The gold beam marks the best proven edge. The red/green lighthouse shows the risk of ruin.'),
    lg('#b9a98c', 'The Lab, on the outer ring: one small district per idea that might fix the bot, three towers each. Left: what the rule would have added looking back (it was picked after seeing the bets, so this proves nothing). Middle: what it adds on live bets since it was registered. Right, with a crane: how many live bets are collected. Taller means more dollars; a loss is a low stub. Tap the LAB strip for the list.'),
    lg('#dcaa78', 'Best edge so far and Worst leak are the biggest winner and loser (30+ bets), in dollars after fees. A gold beam marks the winner, a red beam the leak. A tower that moved since your last visit grows or shrinks when you open the city.'),
    h('p', 'warnbox', 'Market HQ anchors the connected city. SWITCH DISTRICT moves the camera to a published market; the 40 glowing low-rise satellite wards beyond those districts and the distant skyline are scenery only. Only buildings inside a market district carry edge data.'),
    S.startedDemo ? null : demoButton(),
    h('p', '', `The engine re-measures every edge each time it runs: win rate against the market's odds, profit per $1, a 95% range, a luck test (z), the last 7 and 30 days, and a Kelly stake. Anything under ${MIN_N} bets stays grey. Read only: it never places or changes an order.`)];
}
function demoButton() {
  const b = h('button', 'more', S.showingDemo ? 'Back to the real city' : 'Preview the demo city (invented bets, after weeks of learning)'); b.type = 'button';
  b.addEventListener('click', () => showDemo(!S.showingDemo));
  return b;
}
async function showDemo(on) {
  if (on) {
    S.fx = S.fx || await getJSON('fixture.json', 12000);
    if (!S.fx) return;
    S.real = S.model; S.model = shape(S.fx.edges, { entries: S.fx.log }, null, Date.now() / 1000, S.fx.hyps, true);
  } else if (S.real) S.model = S.real;
  S.showingDemo = !!on; S.demo = S.startedDemo || !!on; S.sel = null; S.L = layout(S.model, on || S.hypDemo ? null : S.prevHyp);
  renderDistrictSwitch();
  if (S.scene) { S.scene.select(null); S.scene.rebuild(S.model, S.L); if (S.districtKey !== 'Downtown') S.scene.focusDistrict(S.districtKey); }
  renderTop(); openSheet('guide');
}
function hypCardView(x) {
  const c = hypCardOf(x.h, x.part), rows = h('ul', 'kv');
  c.rows.forEach(([k, v, tone]) => { const li = h('li', tone || ''); li.append(h('span', 'k', k), h('span', 'v', v)); rows.append(li); });
  const st = h('span', 'badge', c.word); st.style.color = c.color;
  const pr = h('div', 'pillrow'); pr.append(st);
  if (x.h.judgedLive) { const lv = h('span', 'badge', 'LIVE-TESTED'); lv.style.color = '#a0af6a'; pr.append(lv); }
  return [pr, c.banner ? h('p', 'warnbox', c.banner) : null, h('p', 'strong', c.verdict), rows];
}
function cardView() {
  const hx = hypOf(S.model, S.sel); if (hx) return hypCardView(hx);
  const e = S.model.byId.get(S.sel); if (!e) return [h('p', '', 'Select a building.')];
  const c = cardOf(e, S.model.book), rows = h('ul', 'kv');
  c.rows.forEach(([k, v, tone]) => { const li = h('li', tone || ''); li.append(h('span', 'k', k), h('span', 'v', v)); rows.append(li); });
  const st = h('span', 'badge', e.small ? 'NEW' : e.status); st.style.color = e.small ? '#8a7f6e' : STATUS_COLOR[e.status];
  const ad = h('span', 'badge', c.advice.word); ad.style.color = c.advice.color;
  const pr = h('div', 'pillrow'); pr.append(st, ad);
  return [pr, c.banner ? h('p', 'warnbox', c.banner) : null, h('p', 'strong', `${c.statusWord}. ${c.advice.text}`), rows];
}

function openSheet(view) {
  S.view = view;
  const hx = view === 'card' ? hypOf(S.model, S.sel) : null, e = view === 'card' && !hx ? S.model.byId.get(S.sel) : null;
  $('sheetTitle').textContent = view === 'card' ? (hx ? hx.h.name : e ? e.label : '') : TITLES[view];
  kids($('sheetBody'), view === 'worlds' ? worldsView() : view === 'lab' ? labView() : view === 'learn' ? learnView() : view === 'board' ? boardView() : view === 'moves' ? movesView() : view === 'risk' ? riskView() : view === 'guide' ? guideView() : view === 'lessons' ? lessonsView(S.learned, () => openSheet('history')) : view === 'history' ? historyView(S) : cardView());
  $('sheet').hidden = false; document.body.classList.add('sheeted');      // a sheet open: the pair and the ticker step aside so the sheet never covers the chips
  $('sheetBody').scrollTop = 0;
  document.querySelectorAll('#pills button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
  try { history.replaceState(null, '', view === 'card' ? location.pathname + location.search : '#' + view); } catch (_) { /* framed */ }
}
function closeSheet() {
  S.view = ''; $('sheet').hidden = true; document.body.classList.remove('sheeted');
  document.querySelectorAll('#pills button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  if (S.sel) { S.sel = null; if (S.scene) S.scene.select(null); }
  try { history.replaceState(null, '', location.pathname + location.search); } catch (_) { /* framed */ }
}
function selectEdge(id, fly) {
  if (!id || !(S.model.byId.has(id) || hypOf(S.model, id))) { if (S.view === 'card') closeSheet(); return; }
  S.sel = id; sfx('tick');
  if (S.scene) { S.scene.select(id); if (fly) S.scene.focus(id); }
  openSheet('card');
}

// ------------------------------------------------------------------------------------------------ Jarvis card
function card() {
  const m = S.model, bk = m.book, freshness = cardFreshness(m, S.demo), statusLine = cardBotStatus(bk, freshness.sourceVerified, S.demo);
  return { v: 1, name: 'Kalshi City', status: freshness.status,
    kpis: [{ label: 'Do more', value: String(m.counts.doMore) }, { label: 'Stop', value: String(m.counts.stop) }, { label: 'Ruin risk', value: bk.ruinNow == null ? '-' : pct(bk.ruinNow, 0) }],
    lines: [headlineOf(m).slice(0, 120), `${statusLine}. Bankroll ${bk.balance == null ? '-' : dollars(bk.balance)}. Weather: ${m.regime.state}.`.slice(0, 120),
      (({ best, worst }) => `Best ${best ? `${smoney(best.pnl)} ${best.label}` : 'none yet'}; worst leak ${worst ? `${smoney(worst.pnl)} ${worst.label}` : 'none yet'}`.slice(0, 120))(pairOf(m))],
    t: freshness.t, open: '#learn', theme: '#06100f', stale_after: freshness.stale_after };
}
function postCard() {
  if (S.demo || !O || !O.framed) return;
  try { window.parent.postMessage({ jarvis: 1, href: location.href, card: card() }, (/^https?:/.test(location.protocol) ? location.origin : 'https://dcondax1-wq.github.io')); } catch (_) { /* not inside Jarvis */ }
}

// ------------------------------------------------------------------------------------------------ sound, the edge scanner, fireworks, refresh
function sfx(name) { try { if (S.sound && O && O.sfx) O.sfx(name); } catch (_) { /* the sound is never needed */ } }
function renderSound() { const b = $('sound'); b.setAttribute('aria-pressed', String(S.sound)); b.setAttribute('aria-label', `Sound: ${S.sound ? 'on' : 'off'}`); b.title = `Sound ${S.sound ? 'on' : 'off'}: ambience, thunder, ticks`; }
function toast(text) { const FXL = window.OLYMPUS_FX; if (!FXL || !FXL.load) return; FXL.load('burst').then(() => { try { FXL.toast(document.body, { text, kind: 'ok', seconds: 3.6 }); } catch (_) { /* skip */ } }); }
/** Only announce lessons from the actual New York calendar day. A published snapshot can be days old. */
function newLessons() {
  const m = S.model, parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date()).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  if (m.day !== today) return [];
  return m.log.filter((x) => x.d === today && (x.kind === 'learned' || x.kind === 'changed') && x.id && m.byId.has(x.id));
}
function runScan(announce) {
  const L = newLessons(), ids = [...new Set(L.map((x) => x.id))].slice(0, 12), more = [...new Set(L.filter((x) => x.advice === 'do_more').map((x) => x.id))].slice(0, 3);
  S.fw = more; S.fwLeft = 3;
  if (S.scene) { S.scene.scan(ids); if (more.length) S.scene.fireworks(more); }
  if (announce) toast(more.length ? `New DO MORE edge: ${S.model.byId.get(more[0]).label}` : ids.length ? `The engine learned ${ids.length} thing${ids.length === 1 ? '' : 's'} today` : 'Scan: nothing new today');
  if (more.length) sfx('rankup');
  return { ids, more };
}
function greetNew() {                                                    // once per new batch of lessons: the scanner sweeps and fireworks mark the new DO MORE edges
  const st = store.read(), newest = S.model.log.reduce((m, x) => Math.max(m, x.t || 0), 0);
  if (newest && newest > (st.seen || 0) && newLessons().length) setTimeout(() => runScan(true), 1800);
  store.write({ ...st, seen: Math.max(st.seen || 0, newest) });
}
async function refresh() {                                               // every 5 minutes: the engine's files and the bot's numbers again; something new = scan
  if (document.hidden || S.startedDemo || S.showingDemo) return;
  const [edges, log, live, hyp] = await Promise.all([getJSON('edges.json'), getJSON('learning_log.json'), getFeed(8000), getJSON('hypotheses.json')]);
  const m = shape(edges, log, live, Date.now() / 1000, hyp, false);
  if (!m || m.edges.length < 3) return;
  if (!m.hyp && S.model.hyp) m.hyp = S.model.hyp;                        // no fresh ideas file: keep the ones on screen
  const old = S.model, before = hypSnap(old);
  const newer = m.log.length > old.log.length, changed = m.t !== old.t || (m.hyp && old.hyp && m.hyp.t !== old.hyp.t);
  S.model = m;
  S.changes = changesOf(m, before);
  if (changed) { S.L = layout(m, S.hypDemo ? null : before); renderMiniMap(); renderDistrictSwitch(); if (S.scene) { S.scene.rebuild(m, S.L); if (S.districtKey !== 'Downtown') S.scene.focusDistrict(S.districtKey); } if (S.atlas) { const p = pairOf(m); S.atlas.update(S.L, { bestId: p.best?.id, worstId: p.worst?.id }); } }
  else S.scene?.setBook(m);
  if (!S.hypDemo) store.write({ ...store.read(), hh: hypSnap(m) });
  renderTop();
  const pulseState = document.querySelector('#sheet:not([hidden]) .world-pulse .pulse-state');
  if (pulseState) pulseState.textContent = worldBotLabel(m.book, S.demo);
  // The text atlas remains live even on devices where WebGL could not start.
  if (!S.scene && S.view && S.view !== 'card') openSheet(S.view);
  if (S.changes.length) toast(S.changes[0]);
  if (newer) runScan(true);
}

// ------------------------------------------------------------------------------------------------ start
async function startScene() {
  try {
    if (new URLSearchParams(location.search).get('view') === 'atlas') throw new Error('Atlas requested');
    const { createCity } = await import('./cityscene.js?v=night11');
    S.scene = createCity($('city'), { O, model: S.model, layout: S.L, sound: () => S.sound });
    $('lite').hidden = !S.scene.lite();
    S.scene.onQuality(() => { $('lite').hidden = !S.scene.lite(); });
    S.scene.onPick((id) => { if (id) selectEdge(id, false); else if (S.view === 'card') closeSheet(); });
    S.scene.onMode((k) => document.querySelectorAll('#cams button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cam === k))));
    if (S.districtKey !== 'Downtown') S.scene.focusDistrict(S.districtKey);
  } catch (e) {
    S.error = 'scene: ' + ((e && e.message) || e);
    // The 2D fallback has no orbiting viewport to clear; keep all evidence controls visible.
    $('verdict').classList.add('expanded'); $('cityInsights').setAttribute('aria-expanded', 'true');
    const p = pairOf(S.model);
    S.atlas = cityAtlas($('city'), S.L, (id) => selectEdge(id, false), e.message === 'Atlas requested' ? 'Atlas view' : '3D unavailable on this device', { bestId: p.best?.id, worstId: p.worst?.id }, S.demo);
    if (S.districtKey !== 'Downtown') S.atlas.focusDistrict(S.districtKey);
    const measure = () => document.documentElement.style.setProperty('--kc-atlas-top', `${$('ui').getBoundingClientRect().bottom + 12}px`);
    addEventListener('resize', measure);
    if (typeof ResizeObserver === 'function') new ResizeObserver(measure).observe($('ui'));
    measure();
    if (O) O.ready();
  }
}

function wire() {
  document.querySelectorAll('#pills button').forEach((b) => b.addEventListener('click', () => (S.view === b.dataset.view ? closeSheet() : openSheet(b.dataset.view))));
  document.querySelectorAll('#cams button').forEach((b) => b.addEventListener('click', () => { if (S.scene) S.scene.setMode(b.dataset.cam); sfx('portal'); document.querySelectorAll('#cams button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }));
  $('ticker').addEventListener('click', () => (S.view === 'lab' ? closeSheet() : openSheet('lab')));
  $('pBest').addEventListener('click', () => pairPick('best'));
  $('pWorst').addEventListener('click', () => pairPick('worst'));
  $('guideBtn').addEventListener('click', () => (S.view === 'guide' ? closeSheet() : openSheet('guide')));
  $('close').addEventListener('click', closeSheet);
  $('networkToggle').addEventListener('click', () => setNetworkPanel($('networkPanel').hidden));
  $('networkClose').addEventListener('click', () => setNetworkPanel(false));
  document.addEventListener('pointerdown', (e) => {
    if (!$('networkPanel').hidden && !$('networkPanel').contains(e.target) && e.target !== $('networkToggle')) setNetworkPanel(false);
  });
  $('districtSelect').addEventListener('change', (e) => switchDistrict(e.currentTarget.value));
  $('sound').addEventListener('click', () => {
    S.sound = !S.sound; store.write({ ...store.read(), sound: S.sound }); renderSound();
    if (S.sound && O && O.sfx) { O.sfx('tap'); setTimeout(() => O.sfx('pad'), 700); } else if (window.OLYMPUS_SFX) { try { window.OLYMPUS_SFX.stop('pad'); } catch (_) { /* nothing playing */ } }
  });
  document.addEventListener('pointerdown', () => { if (S.sound && !S.padOn && O && O.sfx) { S.padOn = true; O.sfx('pad'); } }, { once: true });
  $('scan').addEventListener('click', () => { runScan(true); });
  $('cityMini').addEventListener('click', () => { if (S.scene) S.scene.setMode('map'); else openSheet('worlds'); });
  $('cityInsights').addEventListener('click', () => { const open = $('verdict').classList.toggle('expanded');
    $('cityInsights').setAttribute('aria-expanded', String(open)); $('cityInsights').firstChild.textContent = open ? 'Close insights ' : 'Open insights '; });
  $('clock').addEventListener('click', () => {                          // live -> 06:00 -> 12:00 -> 18:00 -> 00:00 -> live
    const seq = [null, 6, 12, 18, 0], i = seq.indexOf(S.preview);
    S.preview = seq[(i + 1) % seq.length];
    if (S.scene) S.scene.setHour(S.preview);
    renderClock();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { setNetworkPanel(false); closeSheet(); } });
  const route = () => { const t = location.hash.slice(1); if (TITLES[t] && t !== 'card') openSheet(t); };
  addEventListener('hashchange', route); route();
  const fit = () => document.documentElement.style.setProperty('--dock-h', Math.ceil($('dock').getBoundingClientRect().height) + 'px');
  fit(); addEventListener('resize', fit);
  if (typeof ResizeObserver === 'function') new ResizeObserver(fit).observe($('dock'));
}

async function main() {
  const [edges, log, live, learned, hyp] = await Promise.all([getJSON('edges.json'), getJSON('learning_log.json'), getFeed(8000), getJSON('learned.json'), getJSON('hypotheses.json')]);
  S.liveFailed = !live;
  S.learned = learned && Array.isArray(learned.buckets) ? learned : null;
  S.sound = !!store.read().sound;
  let model = shape(edges, log, live, Date.now() / 1000, hyp, false);
  S.demo = !model || model.edges.length < 3;
  if (S.demo) {                                                          // the engine's files are not there: the recorded copy (DEMO)
    const fx = await getJSON('fixture.json', 12000);
    if (fx) { model = shape(fx.edges, { entries: fx.log }, null, Date.now() / 1000, fx.hyps, true); S.hypDemo = true; }
  } else if (!model.hyp) {                                               // real edges but no ideas file yet: the lab shows the recorded demo ideas, labelled DEMO, never blank
    const fx = await getJSON('fixture.json', 12000);
    if (fx && fx.hyps) { model.hyp = shapeHyps(fx.hyps, true); S.hypDemo = true; }
  }
  if (!model) { S.error = 'no data'; if (O) O.fail ? O.fail('The city has no data yet.') : O && O.ready(); return; }
  S.prevHyp = S.hypDemo ? null : (store.read().hh || null);
  S.changes = changesOf(model, S.prevHyp);
  S.model = model; S.L = layout(model, S.prevHyp); S.startedDemo = S.demo;
  if (!S.hypDemo) store.write({ ...store.read(), hh: hypSnap(model) });
  renderTop(); renderClock(); renderMiniMap(); renderDistrictSwitch(); renderSound(); wire();
  await startScene();
  document.body.dataset.ready = '1';
  setInterval(renderClock, 15000);
  setInterval(tickNext, 7000);
  if (S.changes.length) setTimeout(() => toast(S.changes[0]), 2500);
  if (S.scene) setInterval(() => { if (S.preview == null) renderClock(); }, 5000);
  postCard();
  if (!S.startedDemo) {
    greetNew(); setInterval(refresh, 5 * 60 * 1000);
    if (S.scene) setInterval(() => { if (!document.hidden && S.fw && S.fw.length && S.fwLeft-- > 0 && S.scene) S.scene.fireworks(S.fw); }, 22000);
  }
  if (O && S.scene) O.ready();
  S.ready = true;
}

window.KC = {
  state: () => ({ demo: S.demo, ready: S.ready, error: S.error, view: S.view, sel: S.sel, liveUsed: !!(S.model && S.model.liveUsed), n: S.model ? S.model.edges.length : 0, counts: S.model && S.model.counts,
    regime: S.model && S.model.regime, districts: S.L ? S.L.districts.map((d) => d.key) : [], district: S.districtKey, buildings: S.L ? S.L.buildings.length : 0, edgeBuildings: S.L ? S.L.edgeCount : 0,
    labs: S.L ? S.L.labs.map((d) => d.key) : [], hypDemo: !!S.hypDemo, ticker: S.tk.lines.length, scene: S.scene ? S.scene.stats() : null, preview: S.preview }),
  model: () => S.model, layout: () => S.L, scene: () => S.scene, hyp: () => (S.model ? S.model.hyp : null), pair: () => (S.model ? pairOf(S.model) : null), ticker: () => S.tk.lines.slice(), tickNext, changes: () => S.changes.slice(),
  open: openSheet, close: closeSheet, select: (id) => selectEdge(id, true), district: switchDistrict, where: (id) => (S.scene ? S.scene.where(id) : null), pick: (x, y) => (S.scene ? S.scene.pick(x, y) : null),
  scan: runScan, sound: (on) => { S.sound = !!on; renderSound(); }, fx: () => (S.scene ? S.scene.fxStats() : null), ask: ASK_MESSAGE, learned: () => S.learned, refresh,
  hour: (v) => { S.preview = v; if (S.scene) S.scene.setHour(v); renderClock(); }, mode: (k) => { if (S.scene) S.scene.setMode(k); }, card,
};
main();


