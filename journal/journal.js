// MNEMOSYNE page (ES module): the bot's recent trades (read-only, the site's own odeon/trades.json; fixture.json = DEMO when it is missing), and under each trade a rating, a mood and
// one short note, kept ONLY in localStorage['journal.v1'] on this phone (and 'journal.card.v1': the Jarvis card, like the Inbox's). The maths (dollars, the streak, the weekly review and its ONE rule) is journalcore.js.
// Text only through textContent / createElementNS (no markup is ever built from data). It never sends anything anywhere. window.JOURNAL is the test hook.
import * as K from './journalcore.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const mem = (() => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } }; })();
const LS = (() => { try { localStorage.setItem(K.KEY + '.probe', '1'); localStorage.removeItem(K.KEY + '.probe'); return localStorage; } catch (_) { return mem; } })();
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function sv(tag, attrs, text) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const cls = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');

const S = { trades: [], demo: false, store: K.readStore(LS), cards: new Map(), ins: null, week: null, ready: false, saved: 0, ans: {}, checkAt: 0, forced: false };

async function getJSON(url, ms = 6000) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
function say(text) { $('status').textContent = text; }
function save() { S.saved += K.writeStore(LS, S.store) ? 1 : 0; }

// six made-up trades inside the page, for the day nothing else loads (offline first visit): DEMO, never real
const FALLBACK = { trades: [[1, '2026-10-30', 1793367660, 'LONG', 6, 412, 1.98], [2, '2026-10-29', 1793286720, 'SHORT', 5, -437, -1.03], [3, '2026-10-29', 1793300700, 'LONG', 7, 319, 1.52],
  [4, '2026-10-28', 1793176680, 'SHORT', 4, 566, 2.74], [5, '2026-10-27', 1793108100, 'LONG', 8, -352, -1.01], [6, '2026-10-27', 1793121600, 'SHORT', 3, 119, 0.77]]
  .map(([n, day, t, side, qty, usd, r]) => ({ id: 'demo.0' + n, day, entry: { t }, side, qty, usd, r, src: 'demo' })) };

// ------------------------------------------------------------------------------------------------ the demo's example entries (so the page is never empty; DEMO is labelled and never mixes with real trade ids)
const DEMO_ENTRIES = { 'demo.01': ['plan', 'calm'], 'demo.02': ['interfered', 'fomo', 'Moved my stop wider'], 'demo.03': ['plan', 'calm'], 'demo.04': ['plan', 'calm'], 'demo.05': ['hesitated', 'bored', 'Waited for one more candle'],
  'demo.06': ['plan', 'calm'], 'demo.07': ['interfered', 'revenge', 'Sized up after the loss'], 'demo.08': ['plan', 'calm'], 'demo.09': ['hesitated', 'tired'], 'demo.10': ['plan', 'calm'], 'demo.12': ['interfered', 'bored'] };
function seedDemo() {
  if (!S.demo || S.store.demoSeeded) return;
  const t = Date.now() / 1000;
  for (const [id, [rating, mood, note]] of Object.entries(DEMO_ENTRIES)) if (!S.store.entries[id]) K.setEntry(S.store, id, { rating, mood, note }, t);
  S.store.demoSeeded = true; save();
}

// ------------------------------------------------------------------------------------------------ the page
function bars(ins) {
  const svg = $('bars'); clear(svg);
  const items = K.RATINGS.map(([k, label]) => [k, label, ins.byRating[k].usd, ins.byRating[k].n]);
  const top = Math.max(50, ...items.map((x) => Math.abs(x[2]))), mid = 30, scale = 26 / top, w = 82, gap = 18;
  svg.appendChild(sv('line', { x1: 0, x2: 300, y1: mid, y2: mid, stroke: 'rgba(255,255,255,.25)', 'stroke-dasharray': '3 3' }));
  items.forEach(([k, label, usd, n], i) => {
    const x = 12 + i * (w + gap), hh = Math.max(n ? 2 : 0, Math.abs(usd) * scale), y = usd >= 0 ? mid - hh : mid;
    svg.appendChild(sv('rect', { x, y, width: w, height: hh, rx: 3, fill: usd < 0 ? '#c96a4a' : '#aeb86e', opacity: n ? 1 : 0.25 }));
    svg.appendChild(sv('text', { x: x + w / 2, y: 70, 'text-anchor': 'middle', style: 'fill: var(--ag-soft, #dcd1c2)', 'font-size': 10.5 }, `${label} (${n})`));
  });
}

function renderInsights() {
  const ins = S.ins = K.insights(S.trades, S.store), I = ins.byRating.interfered, P = ins.byRating.plan;
  $('tInt').textContent = K.money(I.usd); $('tInt').className = cls(I.usd) === 'neg' ? 'neg' : '';
  $('tPlan').textContent = K.money(P.usd);
  $('tIntN').textContent = `${I.n} trade${I.n === 1 ? '' : 's'}`; $('tPlanN').textContent = `${P.n} trade${P.n === 1 ? '' : 's'}`;
  $('lead').textContent = ins.lines.join(' ');
  { const I = ins.byRating.interfered, P = ins.byRating.plan, el = $('ifplan');   // AGORA: what discipline is worth, in dollars
    if (el) { const extra = I.n && P.n ? I.n * (P.avg - I.avg) : 0; el.hidden = !(extra > 0);
      if (extra > 0) el.textContent = `If every trade had gone like your plan trades, you would be ${K.plainMoney(extra)} richer.`; } }
  $('progress').textContent = ins.rated === ins.n ? `All ${ins.n} trades rated. Nice.` : `${ins.rated} of ${ins.n} trades rated. Each one takes about 10 seconds.`;
  bars(ins);
  // moods
  const ul = $('mlist'); clear(ul);
  const big = Math.max(50, ...K.MOODS.map(([k]) => Math.abs(ins.byMood[k].usd)));
  for (const [k, label] of K.MOODS) {
    const b = ins.byMood[k], li = h('li', 'mrow'), bar = h('span', 'bar'), fill = document.createElement('i');
    fill.style.background = b.usd < 0 ? '#c96a4a' : '#aeb86e';
    const half = (Math.abs(b.usd) / big) * 50; fill.style.width = half + '%'; fill.style.left = b.usd < 0 ? 50 - half + '%' : '50%';
    bar.appendChild(fill);
    li.append(h('span', 'nm', label), bar, h('span', 'v ' + cls(b.usd), b.n ? `${K.money(b.usd)} (${b.n})` : '-'));
    ul.appendChild(li);
  }
  $('streak').textContent = String(ins.streak);
  $('streakLbl').textContent = `day${ins.streak === 1 ? '' : 's'} in a row following the plan (best ${ins.bestStreak})`;
  // the week
  const wk = S.week = K.weekly(S.trades, S.store), box = $('weekLines'); clear(box);
  if (wk) {
    for (const l of wk.lines) box.appendChild(h('p', null, l));
    $('ruleText').textContent = wk.rule.text; $('ruleWhy').textContent = wk.rule.why;
    const on = !!(S.store.rule && S.store.rule.week === wk.from && S.store.rule.id === wk.rule.id && S.store.rule.on);
    $('ruleBtn').setAttribute('aria-pressed', String(on)); $('ruleBtn').textContent = on ? 'I will try this rule' : 'Try this rule next week';
  }
  postCard();
}

function chipGroup(label, items, current, onPick, kind) {
  const wrap = h('div', kind); wrap.setAttribute('role', 'radiogroup'); wrap.setAttribute('aria-label', label);
  for (const [v, text] of items) {
    const b = h('button', null, text); b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.v = v; b.setAttribute('aria-checked', String(v === current)); b.setAttribute('data-oly-cue', 'tap');
    b.addEventListener('click', () => onPick(v));
    wrap.appendChild(b);
  }
  return wrap;
}
const mark = (group, v) => { for (const b of group.children) b.setAttribute('aria-checked', String(b.dataset.v === v)); };

function tradeCard(t, i) {
  const e = S.store.entries[t.id] || {}, li = h('li', 'trade ' + (t.usd >= 0 ? 'win' : 'loss') + (S.first ? ' new' : '')), head = h('div', 'thead');
  li.dataset.id = t.id;
  head.append(h('span', 'what', `${t.side}${t.qty ? ` ${t.qty} micro${t.qty === 1 ? '' : 's'}` : ''} · ${K.srcLabel(t.src)}`), h('span', 'usd', K.money(t.usd)));
  li.appendChild(head);
  li.appendChild(h('div', 'tmeta', `${t.day} · ${K.etLabel(t.t)}${t.r !== null ? ` · ${t.r >= 0 ? '+' : ''}${t.r}R` : ''}`));
  const set = (patch) => { K.setEntry(S.store, t.id, patch); save(); renderInsights(); say('Saved on this phone'); };
  const rate = chipGroup('How did you trade it?', K.RATINGS, e.rating, (v) => { const nv = (S.store.entries[t.id]?.rating === v) ? null : v; set({ rating: nv }); mark(rate, nv); }, 'seg');
  const mood = chipGroup('How did you feel?', K.MOODS, e.mood, (v) => { const nv = (S.store.entries[t.id]?.mood === v) ? null : v; set({ mood: nv }); mark(mood, nv); }, 'chips');
  const row = h('div', 'noterow'), inp = document.createElement('input'), cnt = h('span', 'cnt', String(K.NOTE_MAX - (e.note || '').length));
  inp.type = 'text'; inp.maxLength = K.NOTE_MAX; inp.value = e.note || ''; inp.placeholder = 'One line, if you like (140 characters)'; inp.setAttribute('aria-label', 'Note for this trade'); inp.autocomplete = 'off';
  let timer = 0;
  const commit = () => { clearTimeout(timer); if (K.cleanNote(inp.value) !== (S.store.entries[t.id]?.note || '')) set({ note: inp.value }); };
  inp.addEventListener('input', () => { cnt.textContent = String(K.NOTE_MAX - inp.value.length); clearTimeout(timer); timer = setTimeout(commit, 300); });
  inp.addEventListener('blur', commit); inp.addEventListener('change', commit);
  row.append(inp, cnt);
  li.append(rate, mood, row);
  S.cards.set(t.id, { li, rate, mood, inp });
  return li;
}
function renderTrades() {
  const ul = $('tlist'); clear(ul); S.cards.clear();
  S.trades.forEach((t, i) => ul.appendChild(tradeCard(t, i)));
}

// ------------------------------------------------------------------------------------------------ tools: export, Markdown, import, erase
function download(name, text) {
  try { const a = document.createElement('a'), url = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); return true; } catch (_) { return false; }
}
$('exportBtn').addEventListener('click', () => {
  const text = K.exportJSON(S.store); $('box').value = text; $('boxLbl').textContent = 'Your journal as JSON (also downloaded as a file)';
  say(download('mnemosyne-journal.json', text) ? 'Exported: a file was saved and the text is in the box' : 'The text is in the box: select it and copy it');
});
$('mdBtn').addEventListener('click', async () => {
  const text = K.markdown(S.trades, S.store, { demo: S.demo }); $('box').value = text; $('boxLbl').textContent = 'Your journal as Markdown for Obsidian';
  let ok = false; try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); ok = true; } } catch (_) { ok = false; }
  say(ok ? 'Copied as Markdown: paste it into Obsidian' : 'The Markdown is in the box: select it and copy it');
});
function doImport(text) {
  const r = K.parseImport(text);
  if (!r.ok) { say(r.error); return false; }
  S.store = K.mergeStores(S.store, r.store); save(); renderTrades(); renderInsights();
  say(`Imported ${r.n} entr${r.n === 1 ? 'y' : 'ies'} (the newer one wins when a trade is in both)`); return true;
}
$('importBtn').addEventListener('click', () => doImport($('box').value));
$('importFile').addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  if (f.size > 1_000_000) { say('That file is too big for a journal'); return; }
  const rd = new FileReader(); rd.onload = () => { $('box').value = String(rd.result || ''); doImport($('box').value); }; rd.onerror = () => say('Could not read that file'); rd.readAsText(f);
  e.target.value = '';
});
let armT = 0;
$('wipeBtn').addEventListener('click', () => {
  const b = $('wipeBtn');
  if (!b.classList.contains('arm')) { b.classList.add('arm'); b.textContent = 'Tap again to erase'; armT = setTimeout(() => { b.classList.remove('arm'); b.textContent = 'Erase my journal'; }, 4000); return; }
  clearTimeout(armT); b.classList.remove('arm'); b.textContent = 'Erase my journal';
  const seeded = S.store.demoSeeded; S.store = K.emptyStore(); S.store.demoSeeded = S.demo ? true : seeded; save(); renderTrades(); renderInsights(); say('Erased. Your journal is empty again');
});
$('ruleBtn').addEventListener('click', () => {
  if (!S.week) return;
  const on = !(S.store.rule && S.store.rule.week === S.week.from && S.store.rule.id === S.week.rule.id && S.store.rule.on);
  K.setRule(S.store, S.week.from, S.week.rule.id, on); save(); renderInsights(); say(on ? 'Rule saved: you will see it next week' : 'Rule removed');
});

// ------------------------------------------------------------------------------------------------ the pre-trade check (a sheet): 5 yes / no questions, a plain verdict, the cost of his own interfering
function renderCheckCard() {
  const st = K.checkStats(S.store);
  $('chkHint').textContent = st.last ? `Last check: ${K.etLabel(st.last.at)}, ${st.last.v === 'wait' ? 'it said wait 10 minutes' : 'it said fine'}. ${st.n} check${st.n === 1 ? '' : 's'} so far, ${st.wait} said wait.` : '5 yes or no questions, about 5 seconds, before you touch anything.';
}
function renderQuestions() {
  const qs = K.checkQuestions(S.trades, S.store), ol = $('qs'); clear(ol);
  qs.forEach((q, i) => {
    const li = h('li', 'q'); li.dataset.q = q.id;
    li.appendChild(h('p', 'qt', `${i + 1}. ${q.text}`));
    if (q.hint) li.appendChild(h('p', 'qh', q.hint));
    const g = chipGroup(q.text, [['yes', 'Yes'], ['no', 'No']], S.ans[q.id], (v) => {
      if (S.ans[q.id] === v) delete S.ans[q.id]; else S.ans[q.id] = v;
      mark(g, S.ans[q.id]); li.className = 'q' + (S.ans[q.id] ? (S.ans[q.id] === q.good ? ' ok' : ' red') : '');
      updateVerdict(qs);
    }, 'seg');
    li.appendChild(g); ol.appendChild(li);
  });
  return qs;
}
function updateVerdict(qs) {
  qs = qs || K.checkQuestions(S.trades, S.store);
  const v = K.checkVerdict(S.trades, S.store, S.ans), box = $('verdict');
  box.dataset.level = v.level;
  $('vLevel').textContent = v.level === 'open' ? `Your verdict (${v.answered} of ${v.total} answered)` : 'Your verdict';
  $('vHead').textContent = v.headline; $('vWhy').textContent = v.why; $('vCost').textContent = v.cost;
  if (v.level !== 'open' && !S.checkAt) S.checkAt = Math.round(Date.now() / 1000);
  if (S.checkAt) { K.addCheck(S.store, qs, S.ans, v.level, S.checkAt); if (v.level === 'open') S.checkAt = 0; save(); renderCheckCard(); }
  if (v.level !== 'open' && O && O.cue) { try { O.cue(v.level === 'wait' ? 'warning' : 'success'); } catch (_) { /* silent */ } }
  return v;
}
let opener = null;
function focusables() { return [...$('panel').querySelectorAll('button')].filter((b) => !b.disabled && !b.hidden); }
function onKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); closeSheet(); return; }
  if (e.key !== 'Tab') return;
  const f = focusables(); if (!f.length) return;
  const a = document.activeElement, i = f.indexOf(a);
  if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && (i === -1 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
}
function openSheet() {
  S.ans = {}; S.checkAt = 0; opener = document.activeElement;
  const qs = renderQuestions(); updateVerdict(qs);
  $('sheet').hidden = false; document.documentElement.classList.add('sheeted'); $('panel').scrollTop = 0;
  try { $('app').inert = true; } catch (_) { /* older Safari: the focus trap below keeps Tab inside */ }
  document.addEventListener('keydown', onKey);
  const f = focusables(); if (f.length > 1) f[1].focus();
}
function closeSheet() {
  $('sheet').hidden = true; document.documentElement.classList.remove('sheeted');
  try { $('app').inert = false; } catch (_) { /* nothing */ }
  document.removeEventListener('keydown', onKey);
  if (opener && opener.focus) { try { opener.focus(); } catch (_) { /* gone */ } }
}
$('checkBtn').addEventListener('click', openSheet);
$('shClose').addEventListener('click', closeSheet);
$('scrim').addEventListener('click', closeSheet);
$('shReset').addEventListener('click', () => { S.ans = {}; S.checkAt = 0; const qs = renderQuestions(); updateVerdict(qs); const f = focusables(); if (f.length > 1) f[1].focus(); });

// ------------------------------------------------------------------------------------------------ the Jarvis card (when framed), start
let cardT = 0;
function postCard() {
  const card = K.card(S.trades, S.store, S.demo);
  if (!S.forced) { try { LS.setItem('journal.card.v1', JSON.stringify(card)); } catch (_) { /* not kept */ } }    // Jarvis reads this one (same site), like the Inbox's card
  if (window.parent === window) return;
  clearTimeout(cardT);
  cardT = setTimeout(() => { try { window.parent.postMessage({ jarvis: 1, href: location.href, card }, location.origin); } catch (_) { /* no card */ } }, 400);
}

async function main() {
  S.forced = /[?&]demo=1(&|$)/.test(location.search);
  const raw = S.forced ? null : ((await getJSON('../odeon/trades_lite.json')) || await getJSON('../odeon/trades.json'));   // the slim copy first (dogfood 2026-11-20)       // ?demo=1: the fixture only (offline, tests)
  let trades = raw ? K.normTrades(raw, 30) : [];
  if (!trades.length) { trades = K.normTrades(await getJSON('./fixture.json'), 30); S.demo = true; }
  if (!trades.length) trades = K.normTrades(FALLBACK, 30);              // never blank: even with no file at all the demo trades below are shown (DEMO)
  S.trades = trades;
  $('demo').hidden = !S.demo;
  if (S.demo) $('trHint').textContent = 'DEMO: these are made-up trades so you can try the journal. The real ones appear here once the bot has trades to show. ' + $('trHint').textContent;
  // day-archive 2026-11-20: the site's trade list (odeon/trades.json) can stop days before today: say where it ends
  const upto = !S.demo && raw && typeof raw.upto === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.upto) ? raw.upto : null, oldDays = upto ? Math.floor((Date.now() - Date.parse(upto + 'T21:00:00Z')) / 86400000) : null;
  if (oldDays != null && oldDays > 2) $('trHint').textContent = `As of ${new Date(upto + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}: the site's trade list ends there (${oldDays} days ago). ` + $('trHint').textContent;
  try { const lite = !!(O && O.lite && O.lite()); if (O && O.mode) O.mode(lite); $('lite').hidden = !lite; } catch (_) { /* no tag */ }
  seedDemo();
  S.first = !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  renderTrades(); renderInsights(); renderCheckCard();
  S.ready = true;
  if (/[?&]check=1(&|$)|#check$/.test(location.search + location.hash)) openSheet();      // Jarvis (or a home-screen shortcut) can open the check straight away
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
}
const stats = () => ({ ...K.recent(S.trades, S.store), streak: S.ins ? S.ins.streak : 0, checks: K.checkStats(S.store).n, demo: S.demo });
window.JOURNAL = { S, K, ready: () => S.ready, stats };
window.JOURNAL_STATS = stats;       // the summary Jarvis's weekly recap says out loud (the same sentence is the first line of journal.card.v1)
main().catch((e) => { say('Something went wrong: ' + (e && e.message ? e.message : e)); try { if (O && O.fail) O.fail('MNEMOSYNE could not start'); } catch (_) { /* nothing */ } });
