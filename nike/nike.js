// NIKE page (ES module): the trophy hall. Eight trophies on marble shelves (cup, laurel crown, owl, shield; flat-shaded meshes on a 2D canvas, no WebGL), tap one to look closer and turn it.
// Reads ../home.json, ../ledger/rules.json, ../odeon/trades.json, ../kalshicity/edges.json (published JSON of this site), the journal's ratings from this phone (localStorage 'journal.v1', READ ONLY) and fixture.json (DEMO).
// With no home.json the whole hall is the labelled demo. Read only: it sends nothing and writes nothing. Text only through textContent. window.NIKE is the test hook. ?demo=1 forces the demo; ?pick=<trophy id> opens one.
import * as C from './nikecore.js';
import * as X from './nikescene.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const S = { list: [], demo: false, pick: 0, yaw: 0.5, spin: true, ready: false, meshes: {}, raf: 0, last: 0, quality: 'high', srcs: [], drag: null };

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
function say(t) { $('status').textContent = t; }
const lite = () => { try { return !!(O && O.lite && O.lite()); } catch (_) { return false; } };
const reduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } };
function readRatings() { try { const raw = localStorage.getItem('journal.v1'); return raw ? C.normRatings(JSON.parse(raw)) : {}; } catch (_) { return {}; } }
const today = () => new Date().toISOString().slice(0, 10);

function mesh(shape) { return S.meshes[shape] || (S.meshes[shape] = X.makeMesh(shape, S.quality)); }
function fit(cv, w, h) {
  const dpr = S.quality === 'low' ? 1 : Math.min(2, window.devicePixelRatio || 1), ctx = cv.getContext('2d');
  if (!ctx) return null;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return ctx;
}
function paint(cv, t, yaw, w, h, pad) { const ctx = cv.getContext('2d'); if (!ctx) return; X.draw(ctx, mesh(t.shape), w, h, yaw, t.state === 'locked', pad); }

function renderHall() {
  const hall = $('hall'); clear(hall);
  S.list.forEach((t, i) => {
    const b = h('button', 'slot ' + (t.state === 'unlocked' ? 'won' : 'lost') + (i === S.pick ? ' on' : '')); b.type = 'button'; b.dataset.id = t.id; b.setAttribute('aria-pressed', i === S.pick ? 'true' : 'false');
    b.setAttribute('aria-label', `${t.name}: ${t.state === 'unlocked' ? 'earned' : 'not yet'}. ${t.sentence}`);
    const cv = h('canvas'); cv.setAttribute('aria-hidden', 'true'); b.appendChild(cv); b.appendChild(h('span', 'nm', t.name)); b.appendChild(h('span', 'st', t.state === 'unlocked' ? (t.value || 'Earned') : 'Not yet'));
    b.addEventListener('click', () => { S.pick = i; select(); }); hall.appendChild(b);
    if (fit(cv, 132, 132)) paint(cv, t, 0.55, 132, 132, 0.04);
  });
}
function select() {
  const t = S.list[S.pick]; if (!t) return;
  for (const [i, b] of [...$('hall').children].entries()) { b.classList.toggle('on', i === S.pick); b.setAttribute('aria-pressed', i === S.pick ? 'true' : 'false'); }
  const pill = $('tPill'); pill.textContent = t.state === 'unlocked' ? 'Earned' : 'Not yet'; pill.className = 'pill ' + (t.state === 'unlocked' ? 'ok' : 'info');
  $('tName').textContent = t.name;
  $('tDate').textContent = t.state === 'unlocked' ? (t.date ? `Earned ${C.dateText(t.date)}${t.value ? ' · ' + t.value : ''}` : `Earned${t.value ? ' · ' + t.value : ''} · date not published`) : (t.goal ? `Goal: ${t.goal}` : 'Not earned yet');
  $('tSentence').textContent = t.sentence;
  const bar = $('tBar'); bar.firstElementChild.style.width = Math.round(t.progress * 100) + '%'; bar.className = 'ag-bar ' + (t.state === 'unlocked' ? 'green' : 'amber');
  bar.setAttribute('aria-label', t.state === 'unlocked' ? 'Earned' : `${Math.round(t.progress * 100)} percent of the way`);
  $('tGoal').textContent = t.state === 'unlocked' ? 'Earned from a published number.' : t.progress ? `About ${Math.round(t.progress * 100)}% of the way (from published numbers).` : 'No progress published yet.';
  $('big').setAttribute('aria-label', `${t.name}, ${t.state === 'unlocked' ? 'earned' : 'not yet earned'}. Drag sideways or use the arrow keys to turn it.`);
  paintBig();
  say(`${t.name}: ${t.state === 'unlocked' ? 'earned' : 'not yet'}. ${t.sentence}`);
}
function paintBig() { const t = S.list[S.pick]; if (t) paint($('big'), t, S.yaw, 300, 260, 0.1); }
function loop(now) {
  if (S.spin && !reduced() && !lite() && !S.drag && !document.hidden) { const dt = Math.min(0.05, (now - S.last) / 1000 || 0); S.yaw += dt * 0.6; paintBig(); }
  S.last = now; S.raf = requestAnimationFrame(loop);
}
function turn(d) { S.yaw += d; paintBig(); }

function sources(inp) {
  const ul = $('srcs'); clear(ul);
  const row = (ok, name, what) => ul.appendChild(h('li', '', `${name}: ${ok ? 'published' : 'not published'}. ${what}`));
  row(inp.homeOk, 'Accounts and payouts (home.json)', 'First eval passed and the payouts.');
  row(inp.tradesOk, "The bot's trades (odeon/trades.json)", 'Best week and rules kept.');
  row(inp.kalshiOk, 'Kalshi book (kalshicity/edges.json)', 'The two Kalshi trophies.');
  row(inp.ratedOk, 'Your journal ratings (this phone)', 'The followed-the-plan streak.');
  row(inp.rulesOk, 'Rules (ledger/rules.json)', 'The profit target and payout rules; built-in numbers are used when it is missing.');
}

async function boot() {
  const q = new URLSearchParams(location.search), forced = q.get('demo') === '1';
  S.quality = lite() || reduced() ? 'low' : 'high';
  const [fx, home, rules, odeon, kal] = await Promise.all([getJSON('./fixture.json'), forced ? null : getJSON('../home.json'), forced ? null : getJSON('../ledger/rules.json'), forced ? null : getJSON('../odeon/trades.json'), forced ? null : getJSON('../kalshicity/edges.json')]);
  const H = C.normHome(home);
  let inp;
  if (H.has) {
    const ratings = readRatings(), trades = C.normTrades(odeon), k = C.normKalshi(kal);
    S.demo = false;
    inp = { home: H, trades, ratings, kalshi: k, rules };
    S.srcs = { homeOk: true, tradesOk: trades.length > 0, kalshiOk: !!k, ratedOk: Object.keys(ratings).length > 0, rulesOk: !!rules };
  } else {
    const d = C.demoInputs(fx, today());
    S.demo = true;
    inp = { home: C.normHome(d.home), trades: C.normTrades(d.trades), ratings: C.normRatings(d.store), kalshi: C.normKalshi(d.kalshi), rules: null };
    S.srcs = { homeOk: false, tradesOk: false, kalshiOk: false, ratedOk: false, rulesOk: false };
  }
  S.list = C.build(inp);
  const want = q.get('pick'), wi = S.list.findIndex((t) => t.id === want); S.pick = wi >= 0 ? wi : Math.max(0, S.list.findIndex((t) => t.state === 'unlocked'));
  const sum = C.summary(S.list);
  $('demo').hidden = !S.demo; $('lite').hidden = !lite();
  $('count').textContent = `${sum.n} of ${sum.total}`; $('count').className = 'pill ' + (sum.n ? 'ok' : 'info');
  $('headline').textContent = sum.text;
  const dn = $('demoNote'); dn.hidden = !S.demo; if (S.demo) dn.textContent = (fx && fx.note) || 'EXAMPLE numbers, not real.';
  sources(S.demo ? { ...S.srcs } : S.srcs);
  renderHall(); fit($('big'), 300, 260); select();
  $('turnL').addEventListener('click', () => turn(-0.5)); $('turnR').addEventListener('click', () => turn(0.5));
  const sp = $('spin'); sp.addEventListener('click', () => { S.spin = !S.spin; sp.setAttribute('aria-pressed', S.spin ? 'true' : 'false'); sp.textContent = S.spin ? 'Turning' : 'Still'; });
  if (lite() || reduced()) { S.spin = false; sp.setAttribute('aria-pressed', 'false'); sp.textContent = 'Still'; }
  const big = $('big');
  big.addEventListener('pointerdown', (e) => { S.drag = { x: e.clientX, y0: S.yaw }; try { big.setPointerCapture(e.pointerId); } catch (_) { /* fine */ } });
  big.addEventListener('pointermove', (e) => { if (S.drag) { S.yaw = S.drag.y0 + (e.clientX - S.drag.x) / 70; paintBig(); } });
  const end = () => { S.drag = null; }; big.addEventListener('pointerup', end); big.addEventListener('pointercancel', end);
  big.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') { turn(-0.3); e.preventDefault(); } else if (e.key === 'ArrowRight') { turn(0.3); e.preventDefault(); } });
  S.raf = requestAnimationFrame(loop);
  S.ready = true;
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
}
window.NIKE = { S, C, X, ready: () => S.ready, select };
boot().catch((e) => { say('Something went wrong: ' + (e && e.message ? e.message : e)); try { if (O && O.fail) O.fail('Nike could not start'); } catch (_) { /* nothing */ } });
