// ATHENA plus: the panes added 2026-11-04 (Ask, Today, Cards, Rules, Saved) and the reader's memory (bookmarks, history, card boxes,
// rule checks, lesson days). Plain DOM strings with every library text escaped (esc / linkify).
//   const plus = createPlus({ lib, ix, byId, colorOf, tagOf, open(id), toast(text), sfx(name) })
//   plus.render('ask' | 'today' | 'cards' | 'rules' | 'saved')   fills that pane
//   plus.isMarked(id) / plus.toggle(id) / plus.visit(id)           bookmarks and reading history (the entry view uses these)
//   plus.counts() -> {marks, history, due, rules, rulesDone, streak}   for the tab badges and the tests
import { esc, linkify } from './athenacore.js';
import { ask, cardStats, dailyLesson, dayKey, dueCards, flashDeck, rateCard, ruleGroups, streakOf } from './athenabrain.js';
import { load, save } from './athenastore.js';

const $ = (id) => document.getElementById(id);
const EXAMPLES = ['Why does the Kalshi bot lose?', 'What is the daily loss limit?', 'Where does the stop go?', 'How do I get a payout?', 'What happens after 7 days without a trade?', 'What did we learn about sizing?'];
const ago = (t, now = Date.now()) => { const m = Math.max(0, (now - t) / 6e4); return m < 1 ? 'just now' : m < 60 ? `${Math.floor(m)} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} d ago`; };

export function createPlus(H) {
  const { lib, ix, byId } = H;
  const deck = flashDeck(lib);
  const mem = {
    marks: load('marks', []).filter((id) => byId[id]), history: load('history', []).filter((h) => h && byId[h.id]), cards: load('cards', {}),
    rules: load('rules', { day: '', done: [] }), days: load('days', []),
  };
  if (mem.rules.day !== dayKey()) mem.rules = { day: dayKey(), done: [] };       // the checklist starts clean every day
  const persist = () => { save('marks', mem.marks); save('history', mem.history.slice(0, 60)); save('cards', mem.cards); save('rules', mem.rules); save('days', mem.days.slice(-90)); };
  const S = { q: '', card: { flip: false }, picked: null };
  const row = (e, extra = '') => `<button type="button" class="item" data-open="${esc(e.id)}" style="--c:${esc(H.colorOf(e))}"><strong>${esc(e.title)}</strong><span>${esc(extra || e.short)}</span></button>`;
  const kind = (e) => `<span class="kind" style="--c:${esc(H.colorOf(e))}">${esc((H.tagOf(e.kind) || { name: e.kind }).name.toUpperCase())}</span>`;

  const api = {
    isMarked: (id) => mem.marks.includes(id),
    toggle(id) {
      const on = !mem.marks.includes(id);
      mem.marks = on ? [id, ...mem.marks] : mem.marks.filter((x) => x !== id);
      persist();
      H.toast(on ? 'Bookmarked' : 'Bookmark removed');
      return on;
    },
    visit(id) {
      mem.history = [{ id, t: Date.now() }, ...mem.history.filter((h) => h.id !== id)].slice(0, 60);
      persist();
    },
    counts() {
      const rules = ruleGroups(lib).flatMap((g) => g.rules);
      return { marks: mem.marks.length, history: mem.history.length, due: cardStats(deck, mem.cards).due + cardStats(deck, mem.cards).fresh, rules: rules.length,
        rulesDone: mem.rules.done.filter((id) => rules.some((r) => r.id === id)).length, streak: streakOf(mem.days), cards: cardStats(deck, mem.cards) };
    },
    get state() { return { marks: mem.marks.slice(), history: mem.history.map((h) => h.id), rules: mem.rules.done.slice(), days: mem.days.slice() }; },
    answer(q) { S.q = q; return ask(ix, q, 6); },
    render(view) { ({ ask: renderAsk, today: renderToday, cards: renderCards, rules: renderRules, saved: renderSaved })[view](); },
  };

  // ---------------------------------------------------------------- Ask Athena
  function renderAsk() {
    const box = $('ask');
    if (!box.dataset.built) {
      box.dataset.built = '1';
      box.innerHTML = `<form id="askf" class="askf" role="search"><label class="vh" for="askq">Ask Athena</label><input id="askq" type="search" enterkeyhint="search" autocomplete="off" spellcheck="false" placeholder="Ask in your own words"><button type="submit" class="go">Ask</button></form><div id="askout"></div>`;
      $('askq').addEventListener('input', () => { S.q = $('askq').value; paintAsk(); });
      $('askf').addEventListener('submit', (ev) => { ev.preventDefault(); S.q = $('askq').value; paintAsk(); $('askq').blur(); });
      box.addEventListener('click', (ev) => { const b = ev.target.closest('[data-ask]'); if (b) { $('askq').value = b.dataset.ask; S.q = b.dataset.ask; paintAsk(); } });
    }
    if ($('askq').value !== S.q) $('askq').value = S.q;
    paintAsk();
  }
  function paintAsk() {
    const out = $('askout');
    if (!S.q.trim()) {
      out.innerHTML = `<p class="count">Ask anything about the system. Athena reads her own library (offline) and gives the best answers first.</p><div class="sugg">${EXAMPLES.map((q) => `<button type="button" class="gl big" data-ask="${esc(q)}">${esc(q)}</button>`).join('')}</div>`;
      return;
    }
    const r = ask(ix, S.q, 6);
    if (!r.length) { out.innerHTML = '<p class="empty">No answer in the library. Try fewer or different words.</p>'; return; }
    const CONF = { strong: 'Best match', maybe: 'Maybe', weak: 'Weak match' };
    out.innerHTML = `<p class="count">${r.length} answer${r.length === 1 ? '' : 's'}, best first.</p>` + r.map((x, k) => `<article class="ans ${esc(x.conf)}" style="--c:${esc(H.colorOf(x.e))}">
      <div class="ahead">${kind(x.e)}<span class="conf">${esc(CONF[x.conf])}</span><span class="bar" aria-hidden="true"><i style="width:${Math.max(8, Math.round(100 * x.score / r[0].score))}%"></i></span></div>
      <button type="button" class="atitle" data-open="${esc(x.e.id)}">${esc(x.e.title)}</button>
      <p>${linkify(x.excerpt, byId)}</p><p class="why">Matched: ${x.matched.map((w) => `<b>${esc(w)}</b>`).join(', ')}</p></article>`).join('');
  }

  // ---------------------------------------------------------------- the lesson of the day
  function renderToday() {
    const e = dailyLesson(lib), read = mem.days.includes(dayKey()), c = api.counts();
    const q = e.quiz;
    $('today').innerHTML = `<div class="daycard" style="--c:${esc(H.colorOf(e))}"><p class="qn">Today's lesson · ${esc(new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }))}</p>
      ${kind(e)}<h2>${esc(e.title)}</h2><p class="lead">${linkify(e.short, byId)}</p>${e.body.slice(0, 3).map((b) => `<p>${linkify(b, byId)}</p>`).join('')}
      <div class="row2"><button type="button" class="wide" data-open="${esc(e.id)}">Read all of it</button><button type="button" class="wide ${read ? 'done' : ''}" id="markRead" ${read ? 'disabled' : ''}>${read ? 'Read today' : 'I read it'}</button></div></div>
      <p class="count">Streak: <b>${c.streak}</b> day${c.streak === 1 ? '' : 's'} in a row · ${mem.days.length} lesson${mem.days.length === 1 ? '' : 's'} read</p>
      ${q ? `<h3 class="sec">Check yourself</h3><p class="qq">${esc(q.q)}</p>${[q.a, ...q.wrong.slice(0, 3)].sort((a, b) => (a < b ? -1 : 1)).map((o) => `<button type="button" class="opt ${S.picked === null ? '' : o === q.a ? 'right' : o === S.picked ? 'wrong' : ''}" data-tpick="${esc(o)}" ${S.picked === null ? '' : 'disabled'}>${esc(o)}</button>`).join('')}` : ''}`;
    $('markRead')?.addEventListener('click', () => { if (!mem.days.includes(dayKey())) mem.days.push(dayKey()); api.visit(e.id); persist(); H.sfx('rankup'); renderToday(); H.badges(); });
    $('today').querySelectorAll('[data-tpick]').forEach((b) => b.addEventListener('click', () => { S.picked = b.dataset.tpick; H.sfx(S.picked === q.a ? 'tick' : 'tap'); renderToday(); }));
  }

  // ---------------------------------------------------------------- flashcards
  function renderCards() {
    const st = cardStats(deck, mem.cards), c = dueCards(deck, mem.cards, Date.now(), 1)[0];
    const caught = mem.cards[c.id] && mem.cards[c.id].d > Date.now();
    $('cards').innerHTML = `<div class="tiles"><span><b>${st.fresh}</b>new</span><span><b>${st.due}</b>due</span><span><b>${st.learned}</b>learned</span></div>
      ${caught ? '<p class="count">All caught up. This is extra practice.</p>' : ''}
      <button type="button" class="flash ${S.card.flip ? 'flip' : ''}" id="flash" style="--c:${esc(H.colorOf(byId[c.from]))}" aria-label="${S.card.flip ? 'Answer' : 'Question'}: tap to flip"><small>${S.card.flip ? 'ANSWER' : esc((H.tagOf(byId[c.from].kind) || { name: '' }).name.toUpperCase())}</small><span>${linkify(S.card.flip ? c.back : c.front, byId)}</span><i>${S.card.flip ? '' : 'Tap to see the answer'}</i></button>
      ${S.card.flip ? `<div class="grade"><button type="button" data-g="0" class="g0">Again</button><button type="button" data-g="1" class="g1">Good</button><button type="button" data-g="2" class="g2">Easy</button></div><button type="button" class="gl big" data-open="${esc(c.from)}">Read the entry</button>` : ''}`;
    $('flash').addEventListener('click', () => { S.card.flip = !S.card.flip; H.sfx('tap'); renderCards(); });
    $('cards').querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => {
      mem.cards = rateCard(mem.cards, c.id, +b.dataset.g); persist(); S.card.flip = false; H.sfx(+b.dataset.g ? 'tick' : 'tap'); renderCards(); H.badges();
    }));
  }

  // ---------------------------------------------------------------- my rules
  function renderRules() {
    const groups = ruleGroups(lib), c = api.counts(), pct = c.rules ? Math.round((100 * c.rulesDone) / c.rules) : 0;
    $('rules').innerHTML = `<div class="prog" role="img" aria-label="${c.rulesDone} of ${c.rules} rules checked today"><i style="width:${pct}%"></i></div><p class="count"><b>${c.rulesDone}</b> of ${c.rules} checked today. It starts clean every morning. Every line comes from the library.</p>`
      + groups.map((g) => `<h3 class="sec">${esc(g.title)}</h3>` + g.rules.map((r) => {
        const on = mem.rules.done.includes(r.id);
        return `<div class="rule ${on ? 'on' : ''}"><button type="button" class="tick" role="checkbox" aria-checked="${on}" data-rule="${esc(r.id)}" aria-label="${esc(r.text)}"><i></i></button><span>${esc(r.text)}</span><button type="button" class="gl" data-open="${esc(r.from)}">why</button></div>`;
      }).join('')).join('')
      + `<button type="button" class="wide" id="rulesReset">Start the checklist again</button>`;
    $('rules').querySelectorAll('[data-rule]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.rule, on = !mem.rules.done.includes(id);
      mem.rules.done = on ? [...mem.rules.done, id] : mem.rules.done.filter((x) => x !== id);
      persist(); H.sfx(on ? 'tick' : 'tap'); renderRules(); H.badges();
    }));
    $('rulesReset').addEventListener('click', () => { mem.rules = { day: dayKey(), done: [] }; persist(); renderRules(); H.badges(); });
  }

  // ---------------------------------------------------------------- bookmarks and reading history
  function renderSaved() {
    const marks = mem.marks.map((id) => byId[id]).filter(Boolean), hist = mem.history.slice(0, 20);
    $('saved').innerHTML = `<h3 class="sec">Bookmarks <small>${marks.length}</small></h3>` + (marks.length ? marks.map((e) => row(e)).join('') : '<p class="empty">Nothing bookmarked yet. Open an entry and tap the star.</p>')
      + `<h3 class="sec">Reading history <small>${hist.length}</small></h3>` + (hist.length ? hist.map((h) => row(byId[h.id], ago(h.t))).join('') + '<button type="button" class="wide" id="clearHist">Clear my history</button>' : '<p class="empty">Entries you open show up here.</p>');
    $('clearHist')?.addEventListener('click', () => { mem.history = []; persist(); renderSaved(); H.badges(); });
  }

  return api;
}
