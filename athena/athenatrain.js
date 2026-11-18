// ATHENA Train (2026-11-04): the Train tab. A 2-minute daily quiz built from the library only (Leitner boxes), 'Read the chart' drills on real replayed
// days, a streak and ONE next thing to study. The logic is athenatraincore.js (pure); this file only builds the screens.
// Everything the library or the drills say is written with textContent (createElement / append): this file builds no HTML strings. Memory: athenastore.js
// under one key ('athena.train.v1'). No network, no timers, no animation loop: a screen is drawn once per tap (the chart is one canvas).
//   const train = createTrain({ root, lib, byId, colorOf, tagOf, toast, sfx, badges, quick(), drills })
//   train.render()  train.counts()  train.state  train.questions  train.go(screen)
import * as T from './athenatraincore.js';
import { load, save } from './athenastore.js';

const KEY = 'train.v1';
const COL = { up: '#9bab63', down: '#c96a4a', entry: '#6f9bb8', stop: '#c96a4a', target: '#9bab63', exit: '#c8a24a', sweep: '#b08064', opt: '#6f9bb8', pick: '#c8a24a', grid: 'rgba(111, 155, 184,.18)', text: '#6f9bb8' };

/** a tiny element builder: text goes in as text, never as HTML. props: class, text, vars (CSS variables), anything else is an attribute */
export function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'vars') for (const [n, x] of Object.entries(v)) e.style.setProperty(n, x);
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}

export function createTrain(H) {
  const { root, lib, byId } = H;
  const qs = T.buildQuestions(lib), qById = Object.fromEntries(qs.map((q) => [q.id, q]));
  const D = H.drills.drills, sample = !!H.drills.sample;
  let st = T.normState(load(KEY, null));
  const persist = () => save(KEY, st);
  const V = { screen: 'home', fb: null, step: 'take', take: null, stop: null };                    // what is on screen (not saved)
  const entryTitle = (id) => (byId[id] ? byId[id].title.replace(/ \(.*\)$/, '') : id);
  const readBtn = (id, label) => (byId[id] ? h('button', { type: 'button', class: 'gl big', 'data-open': id, 'data-from': 'train', text: label || `Read: ${entryTitle(id)}` }) : null);
  const canQuiz = qs.length >= 4;

  const api = {
    get state() { return st; }, get questions() { return qs; }, get screen() { return V.screen; }, get view() { return { ...V }; },
    go(screen) { V.screen = screen; V.fb = null; V.step = 'take'; V.take = null; V.stop = null; api.render(); },
    render() {
      root.dataset.screen = V.screen;
      const screens = { home, quiz, drill };
      root.replaceChildren(...(screens[V.screen] || home)().filter(Boolean));
      H.badges && H.badges();
      const sh = root.closest('.sheet'), nx = root.querySelector('#tr-next, #tr-dnext');
      if (sh) { if (nx) nx.scrollIntoView({ block: 'nearest' }); else sh.scrollTop = 0; }                    // after an answer the Next button is in view, otherwise start at the top
    },
  };
  api.counts = () => {
    const c = T.counts(qs, st), t = st.today;
    const left = !canQuiz ? 0 : t && t.day === T.dayKey(Date.now()) && !T.roundDone(t) ? t.res.filter((r) => r === null).length : c.doneToday ? 0 : T.DAILY;
    return { ...c, left, canQuiz };
  };

  // ---------------------------------------------------------------------------------------- home
  function home() {
    const c = api.counts(), w = T.weakest(st), nx = T.nextStudy(st, qs, lib), ts = T.topicStats(st);
    const dr = st.drill && !st.drill.done ? Object.keys(st.drill.picks || {}).length : 0;
    const out = [];
    out.push(h('div', { class: 'tiles' },
      h('span', null, h('b', { text: String(c.streak) }), c.streak === 1 ? 'day streak' : 'day streak'),
      h('span', null, h('b', { text: c.doneToday ? 'Done' : String(c.left) }), c.doneToday ? 'quiz today' : 'to go today'),
      h('span', null, h('b', { text: String(c.due) }), 'due to review')));
    // the weakest topic + ONE next thing
    const study = h('div', { class: 'study' });
    study.append(h('p', { class: 'kick', text: w ? 'WEAKEST TOPIC' : 'WHERE TO START' }));
    study.append(h('h2', { text: w ? `${w.name}: ${w.pct}%` : 'Take the first quiz and Athena finds it' }));
    study.append(h('p', { class: 'why', text: w ? `${w.ok} right out of your last ${w.n} answers.` : 'After 3 answers in a topic, its score shows here.' }));
    if (nx.id) { study.append(h('p', { class: 'one', text: 'ONE thing to study next:' })); study.append(readBtn(nx.id, entryTitle(nx.id))); study.append(h('p', { class: 'why', text: nx.why })); }
    out.push(study);
    out.push(h('button', { type: 'button', class: 'cta', id: 'tr-quiz', disabled: !canQuiz }, h('strong', { text: c.doneToday ? 'Daily quiz: done today' : `Daily quiz: ${T.DAILY} questions, 2 minutes` }),
      h('span', { text: canQuiz ? (c.doneToday ? 'Tap for 8 more practice questions.' : `${c.due} to review, ${c.fresh} new. Questions come only from the library.`) : 'The library is too small for a quiz yet.' })));
    out.push(h('button', { type: 'button', class: 'cta', id: 'tr-drill' }, h('strong', { text: 'Read the chart: 10 setups' }),
      h('span', { text: (sample ? 'PRACTICE SET (the real days are not loaded). ' : 'Real days from the replay. ') + (dr ? `${dr} of ${D.length} done in this round.` : 'Would the bot take it? Where is the stop?') })));
    out.push(h('h3', { class: 'sec', text: 'Your topics' }));
    for (const t of ts) {
      out.push(h('div', { class: 'trow' }, h('span', { class: 'tn', text: t.name }), h('span', { class: 'prog', role: 'img', 'aria-label': t.n ? `${t.pct} percent` : 'not started' }, h('i', { vars: { width: `${t.pct || 0}%` } })),
        h('span', { class: 'tp', text: t.n ? `${t.pct}% of ${t.n}` : 'not started' })));
    }
    out.push(h('p', { class: 'count', text: 'A day counts toward the streak when you finish the daily quiz (or all 10 chart setups). Everything is saved on this phone only.' }));
    out.push(h('button', { type: 'button', class: 'wide', id: 'tr-quick', text: 'Quick random quiz (5 questions, nothing saved)' }));
    return out;
  }

  // ---------------------------------------------------------------------------------------- the daily quiz
  function quiz() {
    if (!canQuiz) return [h('p', { class: 'empty', text: 'The library is too small for a quiz yet.' }), h('button', { type: 'button', class: 'wide', id: 'tr-home', text: 'Back to Train' })];
    st = T.startRound(qs, st); persist();
    const t = st.today, cur = V.fb ? V.fb.i : T.roundIndex(t);
    if (cur < 0) return quizDone();
    const q = qById[t.ids[cur]];
    if (!q) { st = T.startRound(qs, st, Date.now(), true); persist(); return quiz(); }
    const seen = V.fb ? V.fb.seen : (st.q[q.id] ? st.q[q.id].n : 0), o = T.askOptions(q, seen), picked = V.fb ? V.fb.pick : null;
    const out = [h('button', { type: 'button', class: 'back', id: 'tr-home', text: '← Train' }),
      h('p', { class: 'qn', text: `Question ${cur + 1} of ${t.ids.length} · ${T.topicName(q.topic)}` }),
      h('div', { class: 'prog', role: 'img', 'aria-label': `${cur} of ${t.ids.length} done` }, h('i', { vars: { width: `${Math.round((100 * cur) / t.ids.length)}%` } })),
      h('p', { class: 'qq', text: q.q })];
    o.options.forEach((text, j) => out.push(h('button', { type: 'button', class: `opt ${picked === null ? '' : j === o.answer ? 'right' : j === picked ? 'wrong' : ''}`, 'data-tq': j, disabled: picked !== null, text })));
    if (picked !== null) {
      const ok = picked === o.answer, e = byId[q.from];
      out.push(h('p', { class: 'note', text: ok ? 'Right.' : 'Not quite. The right answer is marked.' }));
      if (e) out.push(h('p', { class: 'src', text: T.plain(e.short, byId) }));
      out.push(readBtn(q.from, `Source: ${entryTitle(q.from)}`));
      out.push(h('button', { type: 'button', class: 'wide', id: 'tr-next', text: cur + 1 >= t.ids.length ? 'See my score' : 'Next question' }));
    }
    return out;
  }
  function quizDone() {
    const t = st.today, got = t.res.filter((r) => r === 1).length, n = t.ids.length, missed = t.ids.filter((id, i) => t.res[i] === 0).map((id) => qById[id]).filter(Boolean);
    const out = [h('p', { class: 'qn', text: 'Round done' }), h('div', { class: 'score', text: `${got} / ${n}` }),
      h('p', { class: 'note', text: `${got === n ? 'Perfect.' : got >= n * 0.7 ? 'Good.' : 'Worth another look.'} Streak: ${T.streak(st)} day${T.streak(st) === 1 ? '' : 's'}. Wrong answers come back soon.` })];
    if (missed.length) { out.push(h('h3', { class: 'sec', text: 'Read these' })); for (const q of missed) out.push(h('button', { type: 'button', class: 'item', 'data-open': q.from, 'data-from': 'train', vars: { '--c': H.colorOf(byId[q.from]) } }, h('strong', { text: entryTitle(q.from) }), h('span', { text: T.plain(byId[q.from].short, byId) }))); }
    out.push(h('button', { type: 'button', class: 'wide', id: 'tr-more', text: `${n} more questions` }), h('button', { type: 'button', class: 'wide', id: 'tr-home', text: 'Back to Train' }));
    return out;
  }

  // ---------------------------------------------------------------------------------------- the chart drills
  function chart(d, opt) {
    const w = Math.max(260, Math.min(root.clientWidth || 340, 520)), ht = 200, dpr = Math.min(2, window.devicePixelRatio || 1);
    const m = T.chartModel(d, w, ht, opt), cv = h('canvas', { class: 'chart', width: Math.round(w * dpr), height: Math.round(ht * dpr), role: 'img' });
    cv.style.width = w + 'px'; cv.style.height = ht + 'px';
    const last = d.m0 + 5 * (m.bars - 1);
    cv.setAttribute('aria-label', `Candle chart of NQ, ${m.bars} five-minute bars up to ${T.hm(last + 5)} New York time. Price went from ${T.fmtPrice(d.o[0])} to ${T.fmtPrice(d.c[m.bars - 1])}.`);
    draw(cv, m, dpr, d, opt);
    cv.__model = m;
    return cv;
  }
  function draw(cv, m, dpr, d, opt) {
    const x = cv.getContext('2d'); if (!x) return;
    x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, m.w, m.h);
    x.font = '10px -apple-system,"SF Pro Text",system-ui,sans-serif'; x.textBaseline = 'middle';
    x.strokeStyle = COL.grid; x.lineWidth = 1; x.fillStyle = COL.text;
    for (const a of m.axis) { x.beginPath(); x.moveTo(4, a.y); x.lineTo(m.plotR, a.y); x.stroke(); x.textAlign = 'left'; x.fillText(a.label, m.plotR + 4, a.y); }
    x.textAlign = 'center';
    for (const t of m.ticks) { x.beginPath(); x.moveTo(t.x, 10); x.lineTo(t.x, m.plotB); x.stroke(); x.fillText(t.label, t.x, m.h - 8); }
    for (const c of m.candles) {
      x.strokeStyle = x.fillStyle = c.up ? COL.up : COL.down; x.lineWidth = 1;
      x.beginPath(); x.moveTo(c.x, c.h); x.lineTo(c.x, c.l); x.stroke();
      x.fillRect(c.x - c.w / 2, Math.min(c.o, c.c), c.w, Math.max(1, Math.abs(c.c - c.o)));
    }
    if (m.cut !== null) { x.strokeStyle = COL.pick; x.setLineDash([2, 3]); x.beginPath(); x.moveTo(m.cut, 8); x.lineTo(m.cut, m.plotB); x.stroke(); x.setLineDash([]); x.fillStyle = COL.pick; x.textAlign = 'left'; x.fillText('decision', m.cut + 3, 12); }
    for (const l of m.lines) {
      const col = COL[l.kind] || COL.opt; x.strokeStyle = col; x.lineWidth = l.kind === 'pick' ? 2 : 1.3; x.setLineDash(l.kind === 'opt' || l.kind === 'pick' ? [5, 3] : []);
      x.beginPath(); x.moveTo(l.x0, l.y); x.lineTo(l.x1, l.y); x.stroke(); x.setLineDash([]);
      x.fillStyle = col; x.textAlign = 'left'; x.font = '700 11px -apple-system,"SF Pro Text",system-ui,sans-serif'; x.fillText(l.label, l.x1 + 4, l.ly); x.font = '10px -apple-system,"SF Pro Text",system-ui,sans-serif';
    }
    if (m.off) { x.fillStyle = COL.target; x.textAlign = 'right'; x.fillText((m.off.dir === 'up' ? '↑ ' : '↓ ') + m.off.label, m.plotR, m.off.dir === 'up' ? 10 : m.plotB - 4); }
  }

  function drill() {
    if (!st.drill) { st = T.startDrills(st); persist(); }                                  // a finished round stays on its score page until 'Play the 10 again'
    const i = T.drillIndex(st, D);
    if (i < 0 && !V.fb) return drillDone();
    const idx = V.fb ? V.fb.i : i, d = D[idx];
    const out = [h('button', { type: 'button', class: 'back', id: 'tr-home', text: '← Train' }),
      h('p', { class: 'qn', text: `Setup ${idx + 1} of ${D.length}${sample ? ' · PRACTICE CHART' : ''}` }),
      h('div', { class: 'prog', role: 'img', 'aria-label': `${idx} of ${D.length} done` }, h('i', { vars: { width: `${Math.round((100 * idx) / D.length)}%` } }))];
    const reveal = V.step === 'reveal';
    out.push(h('p', { class: 'qq', text: reveal ? 'Here is what happened' : V.step === 'stop' ? 'Where does the bot put the stop?' : `NQ 5-minute candles up to ${d.take ? d.entry_time : d.cut_time} New York time. Does the bot take a trade?` }));
    out.push(chart(d, { reveal, options: V.step === 'stop', picked: V.stop }));
    if (V.step === 'take') {
      out.push(h('div', { class: 'row2' }, h('button', { type: 'button', class: 'opt', 'data-dtake': '1', text: 'Yes, it takes it' }), h('button', { type: 'button', class: 'opt', 'data-dtake': '0', text: 'No, it stays out' })));
      out.push(h('p', { class: 'count', text: 'Tip: the bot waits for a sweep of an obvious high or low, then a turn back. No trade is a normal answer.' }));
    } else if (V.step === 'stop') {
      out.push(h('p', { class: 'note', text: 'The bot takes it. Pick the stop (the dashed lines on the chart).' }));
      d.stops.forEach((q, j) => out.push(h('button', { type: 'button', class: 'opt', 'data-dstop': j, text: `${'ABCD'[j]}   ${T.fmtPrice(q)}` })));
    } else {
      const o = T.drillOutcome(d, V.take, V.stop), lines = T.drillLines(d, V.take, V.stop);
      out.push(h('div', { class: `verdict ${o.points === o.max ? 'right' : o.points ? 'half' : 'wrong'}`, text: `${o.points} / ${o.max} point${o.max === 1 ? '' : 's'}` }));
      lines.forEach((t, k) => out.push(h('p', { class: k === 0 ? 'lead' : 'note', text: t })));
      if (d.take) {
        if (d.pools && d.pools.length) out.push(h('p', { class: 'note', text: `The level it swept: ${d.pools.join(', ')}.` }));
        for (const t of d.why || []) out.push(h('p', { class: 'note', text: t }));
        out.push(h('h3', { class: 'sec', text: 'The four stops' }));
        d.stops.forEach((q, j) => out.push(h('p', { class: `stopnote ${j === d.answer ? 'real' : ''} ${V.stop === j ? 'mine' : ''}`, text: `${'ABCD'[j]} ${T.fmtPrice(q)}: ${T.STOP_NOTES[(d.kinds || [])[j]] || (j === d.answer ? 'the bot\'s stop' : 'another distance')}${V.stop === j ? ' (your pick)' : ''}` })));
      }
      out.push(readBtn(d.take ? 'step-6' : 'one-trade'));
      out.push(h('button', { type: 'button', class: 'wide', id: 'tr-dnext', text: idx + 1 >= D.length ? 'See my score' : 'Next setup' }));
    }
    return out;
  }
  function drillDone() {
    const pts = T.drillPoints(D, st.drill.picks);
    const out = [h('p', { class: 'qn', text: 'Round done' }), h('div', { class: 'score', text: `${pts.got} / ${pts.max}` }),
      h('p', { class: 'note', text: `${pts.got >= pts.max * 0.8 ? 'You read the charts like the bot.' : pts.got >= pts.max * 0.5 ? 'Getting there. Read the stop page and go again.' : 'Worth a re-read of the recipe, then go again.'} One point for each right yes/no, one for each right stop.` }),
      h('h3', { class: 'sec', text: 'Your answers' })];
    for (const d of D) {
      const p = st.drill.picks[d.id];
      out.push(h('p', { class: 'stopnote', text: `${d.day} ${d.take ? d.side.toLowerCase() + ' ' + d.entry_time : 'no trade'}: ${p && p.ok ? (p.ok[0] ? 'yes/no right' : 'yes/no missed') + (p.ok[1] === null ? '' : p.ok[1] ? ', stop right' : ', stop missed') : 'not answered'}` }));
    }
    out.push(readBtn('step-6'), h('button', { type: 'button', class: 'wide', id: 'tr-dagain', text: 'Play the 10 again' }), h('button', { type: 'button', class: 'wide', id: 'tr-home', text: 'Back to Train' }));
    return out;
  }

  // ---------------------------------------------------------------------------------------- taps (one listener on the pane)
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || !root.contains(b)) return;
    const sfx = (n) => H.sfx && H.sfx(n);
    if (b.id === 'tr-home') { sfx('tap'); api.go('home'); return; }
    if (b.id === 'tr-quiz') { sfx('tap'); const c = api.counts(); V.screen = 'quiz'; V.fb = null; if (c.doneToday) st = T.startRound(qs, st, Date.now(), T.roundDone(st.today)); persist(); api.render(); return; }
    if (b.id === 'tr-more') { st = T.startRound(qs, st, Date.now(), true); persist(); V.fb = null; api.render(); return; }
    if (b.id === 'tr-drill') { sfx('tap'); V.screen = 'drill'; V.fb = null; V.step = 'take'; api.render(); return; }
    if (b.id === 'tr-quick') { sfx('tap'); if (H.quick) H.quick(); return; }
    if (b.dataset.tq !== undefined && !V.fb) {                                          // an answer to the daily quiz
      const t = st.today, i = T.roundIndex(t), q = qById[t.ids[i]]; if (!q) return;
      const seen = st.q[q.id] ? st.q[q.id].n : 0, o = T.askOptions(q, seen), pick = +b.dataset.tq, ok = pick === o.answer;
      st = T.answer(st, q, i, pick, ok); persist(); V.fb = { i, pick, seen }; sfx(ok ? 'tick' : 'tap'); api.render(); return;
    }
    if (b.id === 'tr-next') { const done = T.roundDone(st.today); V.fb = null; if (done) sfx('rankup'); api.render(); return; }
    if (b.dataset.dtake !== undefined && V.step === 'take') {                           // drills: yes / no
      const take = b.dataset.dtake === '1', idx = T.drillIndex(st, D), d = D[idx];
      V.take = take; sfx('tap');
      if (d.take && take) V.step = 'stop';
      else { st = T.recordDrill(st, D, d, take, null); persist(); V.fb = { i: idx }; V.step = 'reveal'; }
      api.render(); return;
    }
    if (b.dataset.dstop !== undefined && V.step === 'stop') {
      const idx = T.drillIndex(st, D), d = D[idx]; V.stop = +b.dataset.dstop;
      st = T.recordDrill(st, D, d, true, V.stop); persist(); V.fb = { i: idx }; V.step = 'reveal'; sfx(V.stop === d.answer ? 'tick' : 'tap'); api.render(); return;
    }
    if (b.id === 'tr-dnext') { V.fb = null; V.step = 'take'; V.take = null; V.stop = null; if (T.drillIndex(st, D) < 0) sfx('rankup'); api.render(); return; }
    if (b.id === 'tr-dagain') { st = T.startDrills(st, true); persist(); V.fb = null; V.step = 'take'; V.take = null; V.stop = null; api.render(); }
  });

  return api;
}
