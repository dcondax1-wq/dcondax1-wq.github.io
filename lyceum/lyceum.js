// LYCEUM page (ES module): the school. A 5-question quiz a day on the owner's own rules, XP and Greek ranks, review cards made from past mistakes, the 3 habits that cost
// the most money, a weekly report card. Reads ../odeon/trades.json and ../home.json (published), the Journal's ratings on this phone (localStorage 'journal.v1', READ ONLY) and
// fixture.json (DEMO when there are no real trades). It writes ONLY its own progress ('lyceum.v1', this phone), never in the demo. Text only through textContent. window.LYCEUM is the test hook.
import * as C from './lyceumcore.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const sign = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
const S = { fixture: null, trades: [], entries: {}, prog: C.emptyProg(), home: null, demo: false, forced: false, ymd: '', quiz: [], qi: 0, answers: [], picked: null, result: null, revShown: false, rankUp: null, ready: false, saved: 0 };

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
function say(t) { $('status').textContent = t; }

// ------------------------------------------------------------------------------------------------ this phone's storage (never in the demo)
function loadProg() { try { return C.cleanProg(JSON.parse(localStorage.getItem('lyceum.v1') || 'null')); } catch (_) { return C.emptyProg(); } }
function saveProg() { if (S.demo) return; try { localStorage.setItem('lyceum.v1', JSON.stringify(S.prog)); S.saved++; } catch (_) { /* not kept: the page still works */ } }
function journalEntries() { try { return C.normEntries(JSON.parse(localStorage.getItem('journal.v1') || 'null')); } catch (_) { return {}; } }

// ------------------------------------------------------------------------------------------------ the model
function setup() {
  const q = new URLSearchParams(location.search), at = q.get('at'), d = at ? new Date(at) : new Date();
  S.now = Number.isFinite(d.getTime()) ? d : new Date();
  S.ymd = C.localYmd(S.now);
  const real = S.forced ? [] : C.normTrades(S.trades);
  S.demo = !real.length;
  if (S.demo) {
    const fx = C.shiftDemo(S.fixture, S.ymd) || { trades: [], entries: {}, progress: C.emptyProg() };
    S.trades = C.normTrades(fx.trades); S.entries = C.normEntries(fx.entries); S.prog = fx.progress;
  } else { S.trades = real; S.entries = journalEntries(); S.prog = loadProg(); }
  S.quiz = C.dailyQuiz(S.ymd); S.qi = 0; S.answers = []; S.picked = null; S.result = null;
}

// ------------------------------------------------------------------------------------------------ the page
function renderHero() {
  const xp = C.totalXp(S.prog), rk = C.rankFor(xp), st = C.streak(S.prog, S.ymd);
  $('rankH').textContent = rk.rank.name; $('rankNote').textContent = (S.rankUp ? 'New rank earned! ' : '') + 'The ' + rk.rank.note.replace(/^the /, '') + '. ' + (S.demo ? 'Example progress, not real.' : '');
  $('streakPill').textContent = st.streak + ' day streak' + (st.best > st.streak ? ' (best ' + st.best + ')' : '');
  const bar = $('xpBar'), i = bar.firstElementChild; i.style.width = Math.round(rk.frac * 100) + '%';
  bar.setAttribute('aria-label', rk.next ? Math.round(rk.frac * 100) + ' percent of the way to ' + rk.next.name : 'The top rank');
  $('xpLine').textContent = xp + ' XP' + (rk.next ? '. ' + rk.toNext + ' more for ' + rk.next.name + ', which adds a column to the hall.' : '. The hall is complete.');
  const ol = $('ranks'); clear(ol);
  C.RANKS.forEach((r, n) => { const hall = C.hallFor(n), li = h('li', n === rk.index ? 'me' : '', r.name + ': ' + r.xp + ' XP, ' + hall.columns + ' columns' + (hall.laurels ? ', ' + hall.laurels + ' laurels' : '') + (n === rk.index ? ' (you are here)' : '')); ol.appendChild(li); });
  return { xp, rk, st };
}

function renderQuiz() {
  const body = $('quizBody'); clear(body);
  const done = S.prog.days[S.ymd];
  if (S.home && S.home.live && S.home.live.position && !done) body.appendChild(h('p', 'note', 'The bot has a trade open. Do the quiz when it is flat: not during a trade.'));
  if (done) {
    $('quizPill').textContent = 'Done: ' + done.score + ' of 5'; $('quizPill').className = 'pill ok';
    body.appendChild(h('p', 'qtext', done.score === 5 ? 'Perfect. All five rules, right.' : done.score + ' of 5 right today.'));
    const r = S.result;
    body.appendChild(h('p', 'lead', '+' + done.xp + ' XP.' + (r && r.rankUp ? ' New rank: ' + r.rankUp + '!' : '') + ' The next quiz opens tomorrow.'));
    for (const id of done.miss || []) { const q = C.QUESTIONS.find((x) => x.id === id); if (!q) continue; const p = h('p', 'why'); p.appendChild(h('b', '', C.RULE_NAME[q.topic] + ': ')); p.appendChild(document.createTextNode(q.why)); body.appendChild(p); }
    return;
  }
  const q = S.quiz[S.qi];
  $('quizPill').textContent = 'Question ' + (S.qi + 1) + ' of 5'; $('quizPill').className = 'pill';
  body.appendChild(h('p', 'ag-eyebrow', C.RULE_NAME[q.topic]));
  body.appendChild(h('p', 'qtext', q.q));
  const opts = h('div', 'opts'); opts.setAttribute('role', 'group'); opts.setAttribute('aria-label', 'Answers');
  q.o.forEach((text, k) => {
    const b = h('button', 'opt', text); b.type = 'button'; b.dataset.k = String(k);
    if (S.picked !== null) { b.disabled = true; if (k === q.a) b.classList.add('right'); else if (k === S.picked) b.classList.add('wrong'); }
    b.addEventListener('click', () => { if (S.picked !== null) return; S.picked = k; S.answers[S.qi] = k; renderQuiz(); });
    opts.appendChild(b);
  });
  body.appendChild(opts);
  if (S.picked !== null) {
    const p = h('p', 'why'); p.appendChild(h('b', '', S.picked === q.a ? 'Right. ' : 'Not quite. ')); p.appendChild(document.createTextNode(q.why)); body.appendChild(p);
    const last = S.qi === S.quiz.length - 1, nb = h('button', 'btn primary', last ? 'Finish the quiz' : 'Next question'); nb.type = 'button'; nb.id = 'nextBtn';
    nb.addEventListener('click', () => { if (!last) { S.qi++; S.picked = null; renderQuiz(); } else finish(); });
    body.appendChild(nb);
  }
}

function finish() {
  const before = C.rankFor(C.totalXp(S.prog)).index, out = C.finishQuiz(S.prog, S.quiz, S.answers, S.ymd);
  S.prog = out.prog; saveProg();
  const after = C.rankFor(C.totalXp(S.prog));
  S.rankUp = after.index > before ? after.rank.name : null;
  S.result = { ...out.result, rankUp: S.rankUp };
  render();
  try { if (O && O.cue) O.cue(S.rankUp ? 'levelup' : 'tick'); } catch (_) { /* sound is optional */ }
}

function renderHabits() {
  const hb = C.habits(S.trades, S.entries), ul = $('habits'); clear(ul);
  if (!hb.top.length) {
    const rated = Object.keys(S.entries).length;
    ul.appendChild(h('li', 'empty', rated ? 'No habit is costing you money right now. Keep rating your trades in the Journal.' : 'No rated trades yet. Rate your trades in the Journal (followed plan, hesitated, interfered, and your mood) and your costliest habits show up here.'));
  }
  hb.top.forEach((x, n) => {
    const li = h('li', 'hab'); li.dataset.key = x.key; const top = h('div', 'it-top');
    top.appendChild(h('h3', '', (n + 1) + '. ' + x.name)); top.appendChild(h('span', 'it-usd ag-num', 'cost ~' + C.money(x.cost) + (x.costR != null ? ' (about ' + x.costR.toFixed(1) + 'R)' : ' (R n/a)')));
    li.appendChild(top);
    li.appendChild(h('p', 'it-detail', x.n + ' trade' + (x.n === 1 ? '' : 's') + ' with this habit made ' + C.moneyS(x.usd) + (hb.planAvg ? ', versus about ' + C.moneyS(hb.planAvg.usd) + ' a trade when you followed the plan.' : '.')));
    li.appendChild(h('p', 'it-detail', 'The rule: ' + x.rule));
    ul.appendChild(li);
  });
  $('habNote').textContent = (S.demo ? 'Example trades, not real. ' : '') + 'Estimate: what those trades earned less than your followed-plan trades did, from your own Journal ratings.';
}

function renderReview() {
  const cards = C.cardsFromMistakes(S.trades, S.entries), due = C.dueCards(cards, S.prog.srs, S.ymd), body = $('revBody'); clear(body);
  $('revPill').textContent = due.length + ' due'; $('revPill').className = 'pill ' + (due.length ? 'warn' : 'ok');
  if (!cards.length) { body.appendChild(h('p', 'lead', 'No past mistakes to review. When you mark a trade as touched, hesitated or a bad mood in the Journal, it becomes a card here.')); return; }
  if (!due.length) { body.appendChild(h('p', 'lead', 'All caught up. ' + cards.length + ' card' + (cards.length === 1 ? '' : 's') + ' will come back when they are due (1, 2, 4, 8 then 16 days).')); return; }
  const c = due[0];
  body.appendChild(h('p', 'ag-eyebrow', 'Card 1 of ' + due.length + ' due'));
  body.appendChild(h('p', 'qtext', c.front));
  if (!S.revShown) {
    const b = h('button', 'btn primary', 'Show the rule'); b.type = 'button'; b.id = 'showBtn'; b.addEventListener('click', () => { S.revShown = true; renderReview(); }); body.appendChild(b);
    return;
  }
  const p = h('p', 'why'); p.appendChild(h('b', '', 'The rule: ')); p.appendChild(document.createTextNode(c.back)); body.appendChild(p);
  const acts = h('div', 'acts');
  for (const [ok, label] of [[true, 'I knew it'], [false, 'I missed it']]) {
    const b = h('button', 'btn' + (ok ? ' primary' : ''), label); b.type = 'button'; b.dataset.ok = ok ? '1' : '0';
    b.addEventListener('click', () => { S.prog = C.reviewCard(S.prog, c.id, ok, S.ymd); S.revShown = false; saveProg(); render(); });
    acts.appendChild(b);
  }
  body.appendChild(acts);
  body.appendChild(h('p', 'note', 'Each review is worth ' + C.REVIEW_XP + ' XP (up to ' + C.REVIEW_XP_DAILY + ' a day).'));
}

function renderReport() {
  const r = C.weeklyReport(S.prog, S.trades, S.entries, S.ymd), t = $('repTiles'); clear(t);
  $('grade').textContent = 'Grade ' + r.grade.name + ' ' + r.grade.letter;
  const tile = (k, v, n, cls) => { const e = h('div', 'tile'); e.appendChild(h('small', '', k)); e.appendChild(h('b', cls || '', v)); e.appendChild(h('span', '', n)); t.appendChild(e); };
  tile('Quiz days', r.quizDays + ' of 7', r.avgScore != null ? 'average ' + r.avgScore.toFixed(1) + ' of 5' : 'none yet');
  tile('Reviews', String(r.reviews), 'cards reviewed');
  tile('Followed the plan', r.rated ? r.plan + ' of ' + r.rated : 'n/a', r.rated ? 'rated trades' : 'rate trades in the Journal');
  tile('Trades this week', C.both(r.usd, r.r), r.trades + ' trade' + (r.trades === 1 ? '' : 's'), sign(r.usd));
  $('repNote').textContent = (r.weakTopic ? 'Most missed rule this week: ' + C.RULE_NAME[r.weakTopic].toLowerCase() + '. ' : '') + 'The grade is half quiz days, a fifth quiz score and three tenths plan-following. Last 7 days up to today.';
}

function render() {
  const hero = renderHero();
  $('demo').hidden = !S.demo; try { $('lite').hidden = !(O && O.lite && O.lite()); } catch (_) { $('lite').hidden = true; }
  renderQuiz(); renderHabits(); renderReview(); renderReport();
  say(hero.rk.rank.name + ', ' + hero.xp + ' XP, ' + hero.st.streak + ' day streak. ' + (S.prog.days[S.ymd] ? 'Today\'s quiz is done.' : 'Today\'s quiz is waiting.'));
  S.ready = true;
  const hall = C.hallFor(hero.rk.index);
  try { window.dispatchEvent(new CustomEvent('lyceum:model', { detail: { rank: hero.rk.index, columns: hall.columns, laurels: hall.laurels, total: hall.total } })); } catch (_) { /* the hall is optional */ }
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
}

async function boot() {
  const q = new URLSearchParams(location.search); S.forced = q.get('demo') === '1';
  const [fx, tr, home] = await Promise.all([getJSON('./fixture.json'), S.forced ? null : getJSON('../odeon/trades.json'), S.forced ? null : getJSON('../home.json')]);
  S.fixture = fx; S.trades = tr; S.home = home;
  setup();
  render();
  quizFromHash();
}
// Deep link from Jarvis ("start the quiz"): #quiz brings today's questions into view and focuses the first answer.
function quizFromHash() {
  if (!/(?:^#|[&#])quiz\b/.test(location.hash || '')) return;
  try { const c = $('quizCard') || $('quizBody'); if (c && c.scrollIntoView) c.scrollIntoView({ block: 'start' }); const b = $('quizBody') && $('quizBody').querySelector('button'); if (b) b.focus({ preventScroll: true }); } catch (_) { /* the page is already showing the quiz */ }
}
window.addEventListener('hashchange', quizFromHash);
window.LYCEUM = { S, C, ready: () => S.ready, render };
boot().catch((e) => { say('Something went wrong: ' + (e && e.message ? e.message : e)); try { if (O && O.fail) O.fail('Lyceum could not start'); } catch (_) { /* nothing */ } });
