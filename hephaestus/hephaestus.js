// HEPHAESTUS page (ES module): loads data.json (the stored backtest runs, cut by tools/hephaestus_build.py), or the recorded fixture.json (DEMO),
// draws the forge (scene.js) and lets you turn dials. Text only through textContent. Reads only: nothing is sent anywhere, nothing is written
// to the bot. window.HEPH is the test hook.
import { find, byId, tested, anyTested, verdict, table, summary, usd, dec, pct, KIND_COLOR, HALVES, ROWS, presets, compare, pushHistory, cardModel } from './hephaestuscore.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
const KEY = 'hephaestus.v1';
const S = { pin: null, hist: [], recipes: [], cmp: null, data: null, demo: true, dials: {}, sc: null, v: null, scene: null, ready: false, error: null, msg: '' };

function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
const store = {
  read() { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; } },
  write(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (_) { /* private mode */ } },
};
async function getJSON(url, ms = 6000) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
const valid = (d) => !!(d && Array.isArray(d.dials) && Array.isArray(d.scenarios) && d.scenarios.length && d.live && d.live_id);

// ------------------------------------------------------------------------------------------------ dials
function buildDials() {
  const box = $('dials'); box.replaceChildren();
  for (const d of S.data.dials) {
    const g = h('div', 'dial'); g.dataset.dial = d.id;
    const lab = h('span', 'dl', d.label); g.append(lab);
    const chips = h('div', 'chips'); chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', d.label);
    for (const o of d.options) {
      const b = h('button', 'chip', o.label); b.type = 'button'; b.dataset.dial = d.id; b.dataset.v = o.v;
      if (o.live) b.classList.add('live');
      b.addEventListener('click', () => choose(d.id, o.v));
      chips.append(b);
    }
    g.append(chips); box.append(g);
  }
}
function paintDials() {
  for (const b of $('dials').querySelectorAll('.chip')) {
    const id = b.dataset.dial, v = b.dataset.v, on = S.dials[id] === v, ok = tested(S.data, S.dials, id, v);
    b.setAttribute('aria-pressed', String(on));
    b.classList.toggle('nt', !ok);
    b.setAttribute('aria-disabled', String(!ok));
    b.title = ok ? '' : 'Not tested';
  }
}
function choose(id, v) {
  if (S.dials[id] === v) return;
  if (!tested(S.data, S.dials, id, v)) {
    const never = !anyTested(S.data, id, v);
    S.msg = never ? 'Not tested: no stored run has this.' : 'Not tested with the other dials as they are.';
    $('msg').textContent = S.msg; return;
  }
  S.dials = { ...S.dials, [id]: v };
  S.msg = ''; $('msg').textContent = '';
  saveAll();
  render(true);
}

// ------------------------------------------------------------------------------------------------ the numbers
function renderTable() {
  const body = $('rows'); body.replaceChildren();
  const sc = S.sc;
  if (!sc) { const tr = h('tr'), td = h('td', '', 'Not tested'); td.colSpan = 3; tr.append(td); body.append(tr); return; }
  for (const r of table(S.data, sc)) {
    const tr = h('tr'); tr.dataset.row = r.k; tr.append(h('td', '', r.label));
    for (const hf of HALVES) {
      const c = r.cells[hf], td = h('td', c.cls); td.dataset.half = hf;
      td.append(h('b', '', c.v));
      if (!c.same) td.append(h('i', '', 'live ' + c.ref));
      tr.append(td);
    }
    body.append(tr);
  }
}
function render(strike) {
  const sc = find(S.data, S.dials);
  S.sc = sc; S.v = verdict(S.data, sc);
  paintDials(); renderTable();
  const v = S.v;
  if (sc) S.hist = pushHistory(S.hist, { id: sc.id, label: sc.label, head: v.head, kind: v.kind, dials: { ...S.dials } });
  renderRecipes(); renderCompare(); renderHistory();
  $('vh').textContent = v.head; $('vp').textContent = v.plain;
  $('vs').textContent = v.flags.length ? v.flags.join(' ') : (sc ? summary(S.data, sc) : '');
  const col = KIND_COLOR[v.kind] || KIND_COLOR.none;
  $('verdict').dataset.kind = v.kind; $('verdict').style.setProperty('--vk', col);
  document.documentElement.dataset.kind = v.kind;
  const live = byId(S.data, S.data.live_id);
  renderHero(sc, live);
  $('src').textContent = sc ? `Stored run: ${sc.run}${sc.base_confirm ? ` (1m confirm window ${sc.base_confirm})` : ''}. ${sc.label}.` : 'No stored run for this mix of dials.';
  $('ref2125').textContent = sc && sc.ref2125 && sc.ref2125.net != null ? `2021-25 for reference only (never a gate): ${usd(sc.ref2125.net)}, PF ${dec(sc.ref2125.pf)}, ${dec(sc.ref2125.tpw)} trades a week.` : '';
  if (S.scene) {
    const ratio = sc && live && live.y26 && live.y26.net > 0 ? Math.sqrt(Math.max(0.01, sc.y26.net / live.y26.net)) : 1;
    S.scene.setState({ color: col, scale: sc ? ratio : 0.5, kind: v.kind });
    if (strike) S.scene.strike();
  }
}

// ------------------------------------------------------------------------------------------------ the money hero (what this setting pays, plainly)
function renderHero(sc, live) {
  const big = $('heroBig'), dl = $('heroDelta'), facts = $('heroFacts'); if (!big) return;
  facts.replaceChildren();
  if (!sc || !sc.h2) { big.textContent = '-'; dl.textContent = 'No stored run has this mix of dials, so there is no number to show.'; dl.className = 'delta'; $('barThis').style.width = '0%'; $('barLive').style.width = '0%'; return; }
  const a = sc.h2.per_month, b = live && live.h2 ? live.h2.per_month : null;
  big.textContent = usd(a);
  const d = typeof a === 'number' && typeof b === 'number' ? a - b : null;
  dl.className = 'delta ' + (d == null || Math.abs(d) < 1 ? '' : d > 0 ? 'up' : 'down');
  dl.textContent = sc.id === S.data.live_id ? 'This is what the bot does today.' : d == null ? '' : Math.abs(d) < 1 ? 'The same as live.' : `${usd(d, true)} a month ${d > 0 ? 'more' : 'less'} than live (${usd(b)}).`;
  const top = Math.max(1, a || 0, b || 0);
  $('barThis').style.width = Math.max(2, Math.round(100 * Math.max(0, a || 0) / top)) + '%';
  $('barLive').style.width = Math.max(2, Math.round(100 * Math.max(0, b || 0) / top)) + '%';
  const f = (k, v) => { const li = h('li'); li.append(h('b', 'ag-num', v), h('span', '', k)); facts.append(li); };
  f('Worst dip (eval allows $2,000)', usd(Math.abs(sc.h2.dd || 0)));
  f('Evals passed in 2 weeks', pct(sc.h2.p10));
  f('Evals failed in 2 weeks', pct(sc.h2.f10));
}
const saveAll = () => store.write({ dials: S.dials, hist: S.hist.slice(0, 12), pin: S.pin });

// ------------------------------------------------------------------------------------------------ recipes, compare, history (JOB 4+5)
function useScenario(sc) { if (!sc) return; S.dials = { ...sc.dials }; S.msg = ''; $('msg').textContent = ''; saveAll(); render(true); }
function renderRecipes() {
  const box = $('recipes'); if (!box) return;
  if (!S.recipes.length) S.recipes = presets(S.data);
  box.replaceChildren();
  let cur = null;
  for (const r of S.recipes) {
    const on = !!S.sc && r.sc.id === S.sc.id, b = h('button', 'recipe' + (r.same ? ' same' : ''), r.name); b.type = 'button'; b.dataset.recipe = r.id; b.dataset.scenario = r.sc.id;
    b.append(h('small', '', usd(r.sc.y26.net) + ' · PF ' + dec(r.sc.y26.pf)));
    b.setAttribute('aria-pressed', String(on)); if (on && !cur) cur = r;
    b.addEventListener('click', () => { S.pickedRecipe = r.id; useScenario(r.sc); });
    box.append(b);
  }
  const pick = S.recipes.find((r) => r.id === S.pickedRecipe && S.sc && r.sc.id === S.sc.id) || cur;
  $('rblurb').textContent = pick ? pick.blurb : 'Pick a recipe or turn the dials yourself.';
}
function renderCompare() {
  const a = S.pin ? byId(S.data, S.pin) : null, b = S.sc;
  $('unpin').hidden = !a; $('pin').textContent = a ? 'Pin this instead' : 'Pin this as A';
  $('pin').disabled = !b;
  $('pinmsg').textContent = a ? `A = ${a.label}` : '';
  const tb = $('cmp'), body = $('cmprows');
  if (!a || !b) { tb.hidden = true; $('cmpline').textContent = a ? 'Turn the dials to another setting: it appears as B.' : 'Pin a setting as A, then turn the dials: B (the current one) is compared with it.'; S.cmp = null; return; }
  const c = compare(S.data, a, b); S.cmp = c;
  $('cmpline').textContent = c.line; tb.hidden = false; body.replaceChildren();
  for (const r of c.rows) {
    const tr = h('tr'); tr.dataset.row = r.k; tr.append(h('td', '', r.label));
    HALVES.forEach((hf, i) => { const x = r.cells[hf]; const ta = h('td', (i ? 'sep ' : '') + (x.who === 'a' ? 'win' : x.who === 'b' ? 'lose' : ''), x.a), tbb = h('td', x.who === 'b' ? 'win' : x.who === 'a' ? 'lose' : '', x.b); tr.append(ta, tbb); });
    body.append(tr);
  }
}
function renderHistory() {
  const ol = $('hist'); if (!ol) return; ol.replaceChildren();
  if (!S.hist.length) { ol.append(h('li', 'none', 'Nothing yet: turn a dial.')); return; }
  S.hist.forEach((e, i) => {
    const li = h('li', i === 0 ? 'now' : ''), b = h('button'); b.type = 'button'; b.dataset.id = e.id;
    b.append(h('b', '', e.label || e.id), h('span', '', Object.values(e.dials || {}).join(' · ')), h('em', '', i === 0 ? 'Now' : (e.head || '').split(' ').slice(0, 2).join(' ')));
    b.addEventListener('click', () => useScenario(byId(S.data, e.id)));
    li.append(b); ol.append(li);
  });
}

// ------------------------------------------------------------------------------------------------ the report card (a 1080 x 1350 image drawn on a canvas)
const rr = (g, x, y, w, hh, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + hh, r); g.arcTo(x + w, y + hh, x, y + hh, r); g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
function clip(g, t, max) { let s = String(t || ''); const full = s; while (g.measureText(s).width > max && s.length > 4) s = s.slice(0, -2); return s === full ? s : s + '…'; }
function wrap(g, t, x, y, max, lh, lines) {
  const w = String(t || '').split(' '); let line = '', n = 0;
  for (const word of w) { const test = line ? line + ' ' + word : word; if (g.measureText(test).width > max && line) { g.fillText(line, x, y + n * lh); n++; line = word; if (n >= lines) return; } else line = test; }
  if (line && n < lines) g.fillText(line, x, y + n * lh);
}
function drawCard(cv, m) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height, col = KIND_COLOR[m.kind] || '#c8a24a';
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#2a2118'); bg.addColorStop(0.5, '#14110e'); bg.addColorStop(1, '#1d1914'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W * 0.5, 330, 20, W * 0.5, 330, 620); glow.addColorStop(0, col + '55'); glow.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = glow; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 90; i++) { const x = (i * 197) % W, y = (i * 311) % H; g.fillStyle = `rgba(224,176,96,${0.04 + (i % 7) * 0.015})`; g.fillRect(x, y, 3, 3); }   // embers
  const fr = g.createLinearGradient(0, 0, W, H); fr.addColorStop(0, '#d4b05a'); fr.addColorStop(0.5, '#9c6b3c'); fr.addColorStop(1, '#d4b05a');
  g.lineWidth = 6; g.strokeStyle = fr; rr(g, 30, 30, W - 60, H - 60, 36); g.stroke();
  g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,255,255,.18)'; rr(g, 44, 44, W - 88, H - 88, 28); g.stroke();
  const font = (w, px) => `${w} ${px}px 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif`;
  g.textAlign = 'center'; g.fillStyle = '#c8a24a'; g.font = font(700, 34); g.fillText(m.title, W / 2, 120);
  g.fillStyle = '#f3ece0'; g.font = font(700, 54); g.fillText(clip(g, m.name, W - 160), W / 2, 215);
  rr(g, 120, 262, W - 240, 92, 46); g.fillStyle = col + '30'; g.fill(); g.lineWidth = 3; g.strokeStyle = col; g.stroke();
  g.fillStyle = col; g.font = font(800, 38); g.fillText(clip(g, m.head, W - 300), W / 2, 322);
  g.fillStyle = 'rgba(243,236,224,.72)'; g.font = font(500, 28); wrap(g, m.plain, W / 2, 410, W - 220, 38, 3);
  m.big.forEach((b, i) => {                                           // four big numbers
    const x = 90 + (i % 2) * 450, y = 560 + Math.floor(i / 2) * 150; rr(g, x, y, 420, 128, 22); g.fillStyle = 'rgba(243,236,224,.05)'; g.fill(); g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 2; g.stroke();
    g.textAlign = 'left'; g.fillStyle = 'rgba(243,236,224,.6)'; g.font = font(600, 24); g.fillText(b[0], x + 24, y + 44); g.fillStyle = '#fff'; g.font = font(800, 54); g.fillText(b[1], x + 24, y + 104);
  });
  g.textAlign = 'right'; g.fillStyle = 'rgba(243,236,224,.6)'; g.font = font(700, 24); g.fillText('Jan-Jun', 760, 905); g.fillText('Jul-Oct', 990, 905);
  m.rows.forEach((r, i) => {
    const y = 960 + i * 62; g.textAlign = 'left'; g.fillStyle = 'rgba(243,236,224,.78)'; g.font = font(500, 28); g.fillText(r[0], 100, y);
    g.textAlign = 'right'; g.fillStyle = '#fff'; g.font = font(700, 30); g.fillText(r[1], 760, y); g.fillText(r[2], 990, y); g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(100, y + 18, W - 200, 1);
  });
  g.textAlign = 'center'; g.fillStyle = 'rgba(243,236,224,.5)'; g.font = font(500, 22); g.fillText(clip(g, m.foot, W - 140), W / 2, H - 78);
}
let cardUrl = '';
function forgeCard() {
  const m = cardModel(S.data, S.sc, S.v); if (!m) { $('msg').textContent = 'Not tested: there is no run to put on a card.'; return null; }
  const cv = $('cardCv'); drawCard(cv, m);
  $('cardbox').hidden = false;
  const dl = $('cardDl');
  try {
    cv.toBlob((b) => {
      if (!b) return; if (cardUrl) URL.revokeObjectURL(cardUrl); cardUrl = URL.createObjectURL(b); dl.href = cardUrl;
      const f = typeof File === 'function' ? new File([b], 'hephaestus-report-card.png', { type: 'image/png' }) : null;
      if (f && navigator.canShare && navigator.canShare({ files: [f] })) { const sh = $('cardShare'); sh.hidden = false; sh.onclick = () => navigator.share({ files: [f], title: 'Hephaestus report card' }).catch(() => {}); }
    }, 'image/png');
  } catch (_) { /* no blob: the canvas itself is the card */ }
  S.carded = (S.carded || 0) + 1;
  return m;
}

function renderRejected() {
  const box = $('rej'); box.replaceChildren();
  for (const r of S.data.rejected || []) { const c = h('div', 'card'); c.append(h('b', '', r.title), h('span', '', r.text)); box.append(c); }
}

// ------------------------------------------------------------------------------------------------ Jarvis card
function card() {
  const live = S.data ? byId(S.data, S.data.live_id) : null, y = (live && live.y26) || {}, h2 = (live && live.h2) || {};
  return { v: 1, name: 'Hephaestus', status: { level: S.demo ? 'off' : 'ok', label: S.demo ? 'Demo data' : 'Read-only workshop' },
    kpis: [{ label: '2026 net (live)', value: usd(y.net) }, { label: 'Jul-Oct PF', value: dec(h2.pf) }, { label: 'Trades / week', value: dec(y.tpw) }],
    lines: ['Turn a dial: stored 2026 results, Jan-Jun against Jul-Oct.', 'It changes nothing in the bot.'], t: Math.floor(Date.now() / 1000), open: '#dials', theme: '#14110e', stale_after: 2592000 };
}
function postCard() {
  if (S.demo || !O || !O.framed) return;
  try { window.parent.postMessage({ jarvis: 1, href: location.href, card: card() }, (/^https?:/.test(location.protocol) ? location.origin : 'https://demetrades2000-coder.github.io')); } catch (_) { /* not inside Jarvis */ }
}

// ------------------------------------------------------------------------------------------------ start
async function startScene() {
  try {
    const { createForge } = await import('./scene.js');
    S.scene = createForge($('view'), { O });
    $('lite').hidden = !S.scene.lite();
    S.scene.onQuality(() => { $('lite').hidden = !S.scene.lite(); });
  } catch (e) {
    S.error = 'scene: ' + ((e && e.message) || e);
    document.documentElement.dataset.noscene = '1';
    if (O) O.ready();
  }
}

async function main() {
  const scene = startScene();
  let data = await getJSON('data.json');
  S.demo = false;
  if (!valid(data)) { data = await getJSON('fixture.json'); S.demo = true; }
  if (!valid(data)) { S.error = 'no data'; $('honest').textContent = 'No stored results could be loaded. Nothing is changed in the bot.'; await scene; if (O) O.ready(); document.body.dataset.ready = '1'; return; }
  S.data = data; S.demo = S.demo || !!data.demo;
  $('demo').hidden = !S.demo;
  const sv = store.read(), saved = sv.dials;
  S.hist = Array.isArray(sv.hist) ? sv.hist.filter((e) => e && e.id && byId(data, e.id)).slice(0, 12) : [];
  S.pin = sv.pin && byId(data, sv.pin) ? sv.pin : null;
  S.dials = { ...data.live };
  if (saved && typeof saved === 'object' && find(data, { ...data.live, ...saved })) S.dials = { ...data.live, ...saved };
  buildDials(); renderRejected();
  $('reset').addEventListener('click', () => { S.dials = { ...S.data.live }; S.msg = ''; $('msg').textContent = ''; saveAll(); render(true); });
  $('forge').addEventListener('click', () => { forgeCard(); if (S.scene) S.scene.strike(); });
  $('cardX').addEventListener('click', () => { $('cardbox').hidden = true; });
  $('pin').addEventListener('click', () => { if (S.sc) { S.pin = S.sc.id; saveAll(); renderCompare(); } });
  $('unpin').addEventListener('click', () => { S.pin = null; saveAll(); renderCompare(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') $('cardbox').hidden = true; });
  render(false);
  await scene;
  if (S.scene) render(false);
  S.ready = true;
  document.body.dataset.ready = '1';
  postCard();
}

window.HEPH = {
  state: () => ({ ready: S.ready, demo: S.demo, dials: { ...S.dials }, scenario: S.sc ? S.sc.id : null, run: S.sc ? S.sc.run : null, verdict: S.v ? { kind: S.v.kind, head: S.v.head } : null,
    scene: S.scene ? S.scene.stats() : null, error: S.error, msg: S.msg, recipes: S.recipes.map((r) => [r.id, r.sc.id]), pin: S.pin, hist: S.hist.map((e) => e.id), cmp: S.cmp ? { line: S.cmp.line, winner: S.cmp.winner, rows: S.cmp.rows.length } : null, cards: S.carded || 0 }),
  set: (id, v) => choose(id, v),
  recipe: (id) => { const r = S.recipes.find((x) => x.id === id); if (r) { S.pickedRecipe = id; useScenario(r.sc); } return !!r; },
  pin: () => { if (S.sc) { S.pin = S.sc.id; saveAll(); renderCompare(); } return S.pin; },
  forge: () => !!forgeCard(),
  card,
};
main().catch((e) => { S.error = String((e && e.message) || e); document.body.dataset.ready = '1'; if (O) O.ready(); });
