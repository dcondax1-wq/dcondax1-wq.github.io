// DIONYSUS page (ES module): the Kalshi desk. The bot's numbers from the public kalshi.json feed (read only, the same file the Kalshi page reads), else the site's own kalshicity/edges.json mirror,
// else fixture.json (DEMO). A guard check, a what-if of past bets and the scan highlights: SUGGESTIONS ONLY, nothing here places, changes or stops a bet. It sends nothing and keeps nothing.
// Text only through textContent / createElementNS. window.DIONYSUS is the test hook.
import * as C from './dionysuscore.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const sign = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
const S = { learned: null, sugg: null, sibyl: null, sibylFwd: null, k8: null, book: null, edges: null, whatif: null, fixture: null, demo: false, pick: '', now: 0, ready: false, hl: null, wi: null, g: null };
const SRC = { feed: 'The old bot\'s last feed (kalshi.json)', site: 'The site\'s copy of the old bot\'s numbers', demo: 'Example numbers' };   // the old crypto bot is RETIRED 2026-11-19: never 'Live'

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
// the feed is this site's own copy (pc_publish puts the Kalshi bot's feed next to the pages as kalshi.json), nothing else: the old kalshi-feed
// repo on the suspended account is retired (polish2 2026-11-19). A host that answers a missing file with its index page gives HTML: not an object = none.
const SITE_FEED = '../kalshi.json';
async function getFeed(ms) { const j = await getJSON(SITE_FEED, ms); return j && typeof j === 'object' && !Array.isArray(j) ? j : null; }
function say(t) { $('status').textContent = t; }
const tile = (box, k, v, n, cls) => { const t = h('div', 'tile'); t.appendChild(h('small', '', k)); t.appendChild(h('b', cls || '', v)); if (n) t.appendChild(h('span', '', n)); box.appendChild(t); };

function renderHero() {
  const b = S.book, risk = b.stake || 10;
  $('botName').textContent = `${b.name} · ${C.OLD_WORD}`;
  // retired 2026-11-19: whatever its last file says (running / paused), it is history now, never shown as a bot that trades
  const st = $('botPill'); st.textContent = S.demo ? 'Example' : 'Retired'; st.className = 'pill ' + (S.demo ? 'info' : '');
  $('bal').textContent = C.usd(b.balance);
  const t = $('heroTiles'); clear(t);
  tile(t, 'Today', C.usdS(b.today), C.rWord(b.today, risk), sign(b.today)); tile(t, 'This week', C.usdS(b.week), C.rWord(b.week, risk), sign(b.week)); tile(t, 'All time', C.usdS(b.total), C.rWord(b.total, risk), sign(b.total));
  $('srcNote').textContent = `${SRC[b.src]}${b.src === 'demo' ? '' : ', updated ' + C.ageWord(b.t, S.now)}. 1R is the bot's average bet (${C.usd(risk)}).`;
}

function renderGuard() {
  const g = S.g = C.guard(S.book, S.edges && S.edges.regime); const card = $('guardCard');
  $('guardTitle').textContent = g.title; $('guardText').textContent = g.text; card.dataset.level = g.level;
  const p = $('guardPill'); p.textContent = { ok: 'Calm', warn: 'Watch', bad: 'Resting', off: 'No reading' }[g.level]; p.className = 'pill ' + (g.level === 'off' ? '' : g.level);
}

function renderBets() {
  const b = S.book, risk = b.stake || 10, op = $('open'), rc = $('recent'); clear(op); clear(rc);
  for (const p of b.positions) { const li = h('li', 'bet'); li.appendChild(h('b', '', p.title)); li.appendChild(h('span', 'note', `${p.side.toUpperCase()} · ${p.contracts} at ${Math.round(p.price * 100)}¢ · risking ${C.usd(p.risk)}`)); op.appendChild(li); }
  if (!b.positions.length) op.appendChild(h('li', 'note', b.src === 'site' ? 'Open bets were only in the old bot\'s own feed; this copy only has the totals.' : 'No open bets when it stopped.'));
  for (const t of b.trades.slice(0, 5)) { const li = h('li', 'bet'); li.appendChild(h('b', sign(t.pnl), `${C.usdS(t.pnl)} (${C.betR(t)})`)); li.appendChild(h('span', 'note', `${t.title} · ${t.side.toUpperCase()} ${t.contracts} at ${Math.round(t.price * 100)}¢`)); rc.appendChild(li); }
  if (!b.trades.length) rc.appendChild(h('li', 'note', 'No settled bets in this copy of the numbers.'));
  $('betsNote').textContent = `A bet's R is its result over what it risked. Your average bet is ${C.usd(risk)}.`;
}

function renderWhatIf() {
  const w = S.wi = C.normWhatIf(S.whatif), seg = $('sets'); clear(seg); const box = $('wiTiles'); clear(box);
  if (!w) { $('wiText').textContent = 'No what-if has been published yet. It appears after enough settled bets (about 100).'; $('wiWhy').textContent = ''; return; }
  if (!S.pick || !w.sets.some((s) => s.id === S.pick)) S.pick = (w.sets.find((s) => s.isPick) || w.sets[0]).id;
  for (const s of w.sets) {
    const b = h('button', 'ag-chip', s.isBase ? 'As it is' : s.id); b.type = 'button'; b.dataset.id = s.id; b.setAttribute('aria-pressed', s.id === S.pick ? 'true' : 'false'); b.setAttribute('aria-label', s.name);
    b.addEventListener('click', () => { S.pick = s.id; renderWhatIf(); say(`${s.name}: ${C.usdS(s.net)} on the past bets.`); }); seg.appendChild(b);
  }
  const s = w.sets.find((x) => x.id === S.pick), risk = S.book.stake || w.typical || 10;
  $('wiName').textContent = s.name;
  tile(box, 'Past bets, net', C.usdS(s.net), `${C.rWord(s.net, risk)} · ${s.bets} bets`, sign(s.net)); tile(box, 'Worst dip', C.usd(-s.dip), C.rWord(-s.dip, risk), 'neg'); tile(box, 'Chance of ruin', s.ruinPct + '%', `half the money lost: ${s.halfPct}%`);
  $('wiText').textContent = s.isBase ? 'This is the old bot as it traded, on the same past bets.' : `${C.usdS(s.gain)} better than the old bot as it was, on the same past bets (${C.rWord(s.gain, risk)}).`;
  $('wiWhy').textContent = (s.id === w.pick && w.recommend ? w.recommend + ' ' : '') + (w.why || '');
}

function renderScan() {
  const hl = S.hl = C.highlights(S.edges), box = $('scan'); clear(box);
  if (!hl) { box.appendChild(h('p', 'lead', 'No scan has been published yet. It looks at every kind of bet the bot makes and ranks them.')); return; }
  const block = (title, cls, items, empty) => { const d = h('div', 'sblock ' + cls); d.appendChild(h('h3', '', title)); const ul = h('ul', 'plain');
    for (const x of items) ul.appendChild(h('li', '', C.edgeLine(x))); if (!items.length) ul.appendChild(h('li', 'note', empty)); d.appendChild(ul); box.appendChild(d); };
  block('Worth a paper test', 'more', hl.more, 'Nothing stands out.'); block('Worth avoiding', 'stop', hl.stop, 'Nothing stands out.'); block('Keep watching', 'watch', hl.watch, 'Nothing yet.');
  if (hl.edges != null) box.appendChild(h('p', 'note', `${hl.edges} kinds of bet checked, ${hl.proven} look proven. Looking back, not a promise.`));
}

function renderK8() {                       // K8 today: the site's ../kalshi/k8.json (Kalshi's public results); absent = the panel hides
  const card = $('k8Card'), k = S.k8 ? C.k8Panel(S.k8, S.now * 1000) : null;
  // CLS 0 (PERF, Olympus 2): the card is on the page from the first paint at its full height (.loading); it is never hidden later
  // (that pushed every card below it down ~5 s in): no k8.json = one plain line + the link, in the same place
  card.classList.remove('loading'); card.removeAttribute('aria-busy'); card.hidden = false;
  card.classList.toggle('none', !k);
  for (const id of ['k8Legs', 'k8Pool', 'k8Noise']) $(id).hidden = !k;
  if (!k) {
    $('k8Note').textContent = 'K8 numbers are not on this site right now. The Kalshi page has K8 live: countdown, bets, stops.';
    const v = $('k8Verdict'); v.textContent = 'no numbers'; v.className = 'pill';
    return;
  }
  $('k8Note').textContent = `Kalshi's public results${k.through ? ' through ' + k.through : ''}, not our bets. Fair = the price where the bet breaks even after the fee.`;
  const ul = $('k8Legs'); clear(ul);
  for (const L of k.legs) {
    const li = h('li', 'k8leg'); li.appendChild(h('b', '', `${L.at ? L.at + ' ET ' : ''}${L.name}`));
    li.appendChild(h('span', 'note', `fair ${L.fair == null ? '–' : L.fair + '¢'}${L.rate == null ? '' : ` · won ${Math.round(L.rate * 100)}%${L.n ? ' of ' + L.n : ''}`}`));
    const wl = h('span', 'k8wl'); L.last10.split('').forEach((c, i, a) => wl.appendChild(h('i', (c === 'W' ? 'w' : 'l') + (L.winToday && i === a.length - 1 ? ' today' : ''), c)));
    if (L.winToday) { li.dataset.win = 'today'; li.dataset.usd = String(L.winUsd || 0); } if (!L.last10) wl.appendChild(h('span', 'note', 'no results yet'));
    li.appendChild(wl); ul.appendChild(li);
  }
  const pc = (x) => (x == null ? '–' : Math.round(x * 100) + '%');
  const pr = $('k8Pool'); clear(pr);
  pr.appendChild(h('span', '', 'All legs, won last 30: ')); pr.appendChild(h('b', k.l30, pc(k.r30))); pr.appendChild(h('span', '', ' · last 60: ')); pr.appendChild(h('b', k.l60, pc(k.r60)));
  pr.appendChild(h('span', '', ` · OFF under ${Math.round(k.min * 100)}%`));
  const v = $('k8Verdict'); v.textContent = k.verdict; v.className = 'pill ' + ({ ok: 'ok', watch: 'warn', off: 'bad' }[k.level] || '');
  $('k8Noise').textContent = k.noise; $('k8Noise').hidden = !k.noise;
}

// ------------------------------------------------------------------------------------------------ merged from Kalshi City + Sibyl (day-kalshi 2026-11-20)
// Plain cards only (no 3D, no blur). Everything but the fee rule comes from the OLD crypto bot's study, retired 2026-11-19: labelled as history, never live.
function k8Price() {                        // K8's average entry (cents) from k8.json's live legs, to mark the fee row it pays
  const legs = S.k8 && Array.isArray(S.k8.legs) ? S.k8.legs.filter((x) => x && x.live === true && Number.isFinite(x.avg_c)) : [];
  return legs.length ? legs.reduce((a, x) => a + x.avg_c, 0) / legs.length : null;
}
function renderFees() {
  const f = C.feeTable(S.learned), card = $('feeCard'); card.hidden = !f; if (!f) return;
  const kp = k8Price(), near = kp == null ? -1 : f.rows.reduce((bi, r, i) => (Math.abs(r.price - kp) < Math.abs(f.rows[bi].price - kp) ? i : bi), 0);
  const tb = $('feeRows'); clear(tb);
  f.rows.forEach((r, i) => { const tr = h('tr', i === near ? 'k8' : ''); tr.appendChild(h('td', '', r.price + '¢' + (i === near ? ' (K8)' : ''))); tr.appendChild(h('td', '', r.fee.toFixed(2) + '¢')); tr.appendChild(h('td', '', r.be.toFixed(1) + '%')); tb.appendChild(tr); });
  const k = near >= 0 ? f.rows[near] : null;
  $('feeLead').textContent = k ? `K8 buys near ${Math.round(kp)}¢. There the fee is about ${k.fee.toFixed(2)}¢ a contract, so a bet must win more than ${k.be.toFixed(1)}% just to break even.`
    : 'The fee is biggest near 50¢ and tiny near 99¢. "Must win" is how often a bet at that price has to win just to break even.';
  $('feeNote').textContent = `Kalshi's own fee rule, the same for every bet. ${f.gross != null && f.net != null && f.total != null ? `The ${C.OLD_WORD} made ${C.usdS(f.gross)} before fees, paid ${C.usd(f.total)} in fees and ended at ${C.usdS(f.net)}${f.bets ? ` over ${f.bets.toLocaleString('en-US')} bets` : ''}.` : ''}`;
}
function renderRuin() {
  const r = C.ruinTable(S.learned), card = $('ruinCard'); card.hidden = !r; if (!r) return;
  $('ruinLead').textContent = `Starting from ${C.usd(r.bank)}, close to K8's $55: the bigger each bet, the more often the money ran out. Small fixed bets almost never went broke.`;
  const ul = $('ruinRows'); clear(ul);
  for (const x of r.rows) { const li = h('li', 'bet ' + (x.ruin > 0.1 ? 'bad' : x.ruin < 0.01 ? 'ok' : '')); li.appendChild(h('b', '', `${C.pct(x.ruin, x.ruin < 0.01 ? 1 : 0)} went broke`)); li.appendChild(h('span', 'note', `${x.policy.replace('(today)', '(what the old bot used)')}${x.median != null ? ' · middle result ' + C.usd(x.median) : ''}`)); ul.appendChild(li); }
  $('ruinNote').textContent = `A ${r.days || 90}-day simulation of the old bot's late-favourite bets, ${r.perDay || 12} a day (${C.OLD_WORD}). "Broke" = under ${C.usd(r.floor || 6)}. Looking back, not a promise.`;
}
function renderLessons() {
  const L = C.oldLessons(S.learned, S.sugg), card = $('lessonCard'); card.hidden = !L; if (!L) return;
  $('lessonHead').textContent = L.head ? L.head.replace(/(\d+)-(\d+)c\b/g, '$1–$2¢').replace(/(\d+)c\+/g, '$1¢ and up') : 'What lost money for the old bot.';
  const ul = $('lessonRows'); clear(ul);
  for (const i of L.items) { const li = h('li', 'bet bad'); li.appendChild(h('b', '', `${i.verdict === 'stop' ? 'Lost' : 'Weak'}: ${i.kind}, ${C.usdS(i.net)} over ${i.n} bets`)); li.appendChild(h('span', 'note', i.rule)); ul.appendChild(li); }
  const nt = $('lessonNotes'); clear(nt); for (const n of L.notes) nt.appendChild(h('li', '', n));
  $('lessonNote').textContent = `History of the ${C.OLD_WORD}${L.bets ? ', ' + L.bets.toLocaleString('en-US') + ' settled bets' : ''}${L.day ? ', study of ' + L.day : ''}. The crypto bot is retired; this is what not to repeat.`;
}
function renderSibyl() {
  const v = C.sibylView(S.sibyl, S.sibylFwd), card = $('sibylCard'); card.hidden = !v; if (!v) return;
  $('sibylHead').textContent = v.counts ? `${v.counts.worthy} paper pick${v.counts.worthy === 1 ? '' : 's'} of ${v.counts.edges} kinds of bet${v.asof ? ' (study of ' + v.asof + ')' : ''}.` : 'No pick file right now.';
  const ul = $('sibylRows'); clear(ul);
  for (const p of v.picks) { const li = h('li', 'bet'); li.appendChild(h('b', '', p.title)); li.appendChild(h('span', 'note', `${p.edge == null ? '' : C.cents(p.edge / 100) + ' per $1 after fees (cautious) · '}${p.win == null ? '' : 'won ' + C.pct(p.win, 1) + ' · '}n=${p.n} bets`)); ul.appendChild(li); }
  if (v.counts && !v.picks.length) ul.appendChild(h('li', 'note', 'No kind of bet clears the cautious test. Staying out is a result.'));
  const o = v.own, pill = $('sibylPill');
  if (!o) { $('sibylOwn').textContent = 'Its own paper record has not started yet.'; pill.textContent = 'Paper'; pill.className = 'pill'; return; }
  pill.textContent = o.claim ? `Record n=${o.n}` : `Collecting n=${o.n}`; pill.className = 'pill ' + (o.claim ? 'info' : 'warn');
  $('sibylOwn').textContent = o.claim ? `Its own paper record since ${o.start}: ${o.wins} won of ${o.n}, net ${C.usdS(o.net)}. ${o.open} still open.`
    : `Its own paper record since ${o.start}: ${o.n} settled, ${o.open} open. Under ${C.SIBYL_MIN} settled bets: no claim yet.`;
}

// the status line: today's bot (K8) first, then one plain sentence that the old crypto bot is history
function headline() {
  const k = S.k8 ? C.k8Panel(S.k8, S.now * 1000) : null, pc = (x) => (x == null ? '' : ` (won ${Math.round(x * 100)}% of the last 30)`);
  const k8 = k ? `K8 today: ${k.verdict}${pc(k.r30)}.` : 'K8 today: no numbers right now (see the Kalshi page).';
  if (!S.book) return k8;
  return S.demo ? `${k8} Below: example numbers of the old crypto bot.` : `${k8} Old crypto bot: retired 2026-11-19, last balance ${C.usd(S.book.balance)}, history only.`;
}
const offWord = () => (typeof navigator !== 'undefined' && navigator.onLine === false ? 'You are offline. ' : '');
// nothing readable at all (offline, 404s, junk): K8 and the study cards still show when they can, the old bot's cards hide, one plain sentence
function renderEmpty() {
  for (const id of ['heroCard', 'guardCard', 'betsCard', 'wiCard', 'scanCard']) $(id).hidden = true;
  $('demo').hidden = true; $('lite').hidden = true;
  try { renderK8(); } catch (_) { $('k8Card').classList.remove('loading'); $('k8Card').classList.add('none'); }
  for (const [f, id] of [[renderFees, 'feeCard'], [renderRuin, 'ruinCard'], [renderLessons, 'lessonCard'], [renderSibyl, 'sibylCard']]) { try { f(); } catch (_) { $(id).hidden = true; } }
  say(`${offWord()}No Kalshi numbers could be read right now (the files are missing or could not be read). ${S.k8 ? headline() : 'Try again later.'}`);
  S.ready = true; if (S.k8) fxLater();
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
}

function render() {
  $('demo').hidden = !S.demo; try { $('lite').hidden = !(O && O.lite && O.lite()); } catch (_) { $('lite').hidden = true; }
  renderHero(); renderK8(); renderGuard(); renderBets(); renderWhatIf(); renderScan();
  for (const [f, id] of [[renderFees, 'feeCard'], [renderRuin, 'ruinCard'], [renderLessons, 'lessonCard'], [renderSibyl, 'sibylCard']]) { try { f(); } catch (_) { $(id).hidden = true; } }   // a junk file hides only its own card
  say(headline());
  S.ready = true;
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
}

async function boot() {
  const q = new URLSearchParams(location.search), forced = q.get('demo') === '1', at = q.get('at');
  S.now = at && Number.isFinite(Date.parse(at)) ? Date.parse(at) / 1000 : Date.now() / 1000;
  const [fx, feed, edges, wi, k8, lr, sg, sb, sf] = await Promise.all([getJSON('./fixture.json'), forced ? null : getFeed(5000), forced ? null : getJSON('../kalshicity/edges.json'), forced ? null : getJSON('../kalshicity/whatif.json'),
    forced ? null : getJSON('../kalshi/k8.json', 3000), forced ? null : getJSON('../kalshicity/learned.json', 4000), forced ? null : getJSON('../kalshicity/suggestions.json', 4000),
    forced ? null : getJSON('../money/sibyl.json', 4000), forced ? null : getJSON('../money/sibyl_forward.json', 4000)]);
  const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : null);
  S.k8 = obj(k8);
  S.learned = obj(lr); S.sugg = obj(sg); S.sibyl = obj(sb); S.sibylFwd = obj(sf);
  S.fixture = fx; const book = C.chooseBook(feed, edges, fx); if (!book) { renderEmpty(); return; }
  S.book = book; S.demo = book.src === 'demo';
  S.edges = S.demo ? (fx && fx.edges) || null : edges; S.whatif = S.demo ? (fx && fx.whatif) || null : wi;
  render();
  fxLater();
}
// ------------------------------------------------------------------------------------------------ FX (day-kalshi 2026-11-20, owner: "it needs some 3D, some effects")
// olympus/nqfx.js (the NQ effects kit) is added only AFTER the first paint: after load + idle, so the page paints exactly as before. OLYMPUS NIGHT colours
// (black, violet), the balance and K8's pool numbers roll up (the real text is already written and comes back when the roll ends), and a K8 leg whose last
// result is a win from today gets the green sparks once per page view. Reduced motion / FX off: the kit shows the final state still. No kit = nothing.
const FX_SRC = '../olympus/nqfx.js?v=n5';
const FX_COLORS = { base: '#000000', cyan: '#9d59ee', cyanHi: '#dacbf0', blue: '#4d2e76', violet: '#9d59ee', win: '#77db89', loss: '#ef4444' };   // OLYMPUS NIGHT (owner 2026-11-20)
const FX = { started: false, won: false, loaded: null, done: false, busyUntil: 0 };   // done + busyUntil: the test hook waits for the rolls to land
function fxScript() {
  if (FX.loaded) return FX.loaded;
  FX.loaded = new Promise((res) => {
    if (window.OLYMPUS_NQFX) return res(window.OLYMPUS_NQFX);
    const s = document.createElement('script'); s.src = FX_SRC; s.defer = true; s.dataset.fx = 'dionysus';
    s.onload = () => res(window.OLYMPUS_NQFX || null); s.onerror = () => res(null); document.head.appendChild(s);
  });
  return FX.loaded;
}
async function runFx() {
  if (FX.started) return; FX.started = true;
  const NQ = await fxScript(); if (!NQ) return;
  try { if (!(await NQ.ready())) return; } catch (_) { return; }
  try { NQ.theme(FX_COLORS); } catch (_) { /* default palette */ }
  // a number rolls once, when it first comes into view (an off-screen roll would only sit half-way: the kit's loop sleeps off screen)
  const go = (el, to) => { const t = el.textContent; FX.busyUntil = Math.max(FX.busyUntil, performance.now() + 1600); try { NQ.roll(el, { to, duration: 1.1 }); } catch (_) { el.textContent = t; } };
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { io.unobserve(e.target); go(e.target, +e.target.dataset.to); } }, { threshold: 0.9 }) : null;
  const roll = (el, to) => { if (!el || !Number.isFinite(to)) return; if (io) { el.dataset.to = String(to); io.observe(el); } else go(el, to); };
  if (S.book && !$('heroCard').hidden) roll($('bal'), S.book.balance > 0 ? S.book.balance : NaN);
  for (const b of $('k8Pool').querySelectorAll('b')) { const n = parseFloat(b.textContent); if (Number.isFinite(n)) roll(b, n); }
  const leg = $('k8Legs').querySelector('li[data-win="today"]');
  if (leg && !FX.won) { FX.won = true; try { NQ.win(leg, { usd: +leg.dataset.usd || 0, bigAt: 1e9, text: 'K8 won today, 1 contract' }); } catch (_) { /* no sparks */ } }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); FX.done = true;
}
function fxLater() {                        // after load + idle: never on the first paint
  const go = () => { const idle = window.requestIdleCallback || ((f) => setTimeout(f, 300)); idle(() => { runFx(); }, { timeout: 2500 }); };
  if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
}
window.DIONYSUS = { S, C, ready: () => S.ready, render, fx: () => FX, settled: () => !FX.started || (FX.done && performance.now() > FX.busyUntil) };
boot().catch(() => { say(`${offWord()}Dionysus could not show the numbers right now. Try again later.`); S.ready = true; try { if (O && O.ready) O.ready(); } catch (_) { /* nothing */ } });
