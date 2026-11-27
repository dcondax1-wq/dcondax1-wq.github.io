// NQ BRAIN · THE MIND LAYER (night-nq-brain 2026-11-27; owner 00:00 ET: "make everything better, 3D, higher quality, effects, features").
// On top of brain.js (the steps + DESIGN's 3D brain, unchanged): the "thinking right now" card, LIT's setup pipeline (a 3D-ish funnel on a
// canvas: where every setup since 2021 stopped, the latest analysed session's setups parked at their stop, today's live step from the PC),
// ATLAS's members, the ideas on trial (n / 20 rings), the lessons, live vs its backtest twin, the health bands.
// Data: brain.js's model (window.NQBRAIN: the PC's post + the site's JSON) and ../brain/learn.json (tools/build_brain_learn.py). Real data only:
// empty / old = said plainly. BLITZ is hidden (owner rule). Text only through textContent; no storage; GET only; nothing armed or sent.
// Reduced motion / LITE: the pipeline is drawn once, no animation. window.NQMIND = the test hook.
const $ = (id) => document.getElementById(id);
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
const clear = (el) => { while (el && el.firstChild) el.removeChild(el.firstChild); };
const REDUCE = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } })();
const LITE = (() => { try { const O = window.OLYMPUS; return !!(O && O.lite && O.lite()); } catch (_) { return false; } })();
const HIDDEN = new Set(['blitz']);
const S = { learn: null, model: null, atlas: null, ready: false, raf: 0, parts: [], drawn: 0, feedOn: false };
const R = (v) => (v === null || v === undefined || !Number.isFinite(+v) ? '-' : `${v > 0 ? '+' : ''}${(+v).toFixed(2)}R`);
const usd = (v) => (v === null || v === undefined ? '-' : `${v < 0 ? '-' : '+'}$${Math.abs(Math.round(v)).toLocaleString('en-US')}`);
const md = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : (s || '?'); };
const hm = (t) => { try { return new Date(t * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }); } catch (_) { return '?'; } };

// the pipeline's stations, top to bottom (engine/brain.STAGES step numbers of tools/lit_setups_learn: where a setup stopped)
const STATIONS = [
  { step: 0, gate: 'In the hours', stop: 'outside hours' }, { step: 2, gate: 'Deep sweep', stop: 'sweep too shallow' },
  { step: 3, gate: 'Inducement first', stop: 'no inducement' }, { step: 4, gate: 'Displacement', stop: 'displacement too small' },
  { step: 6, gate: 'Limit armed', stop: 'limit not armed' }, { step: 7, gate: 'Filled', stop: 'never filled' },
  { step: 9, gate: 'Day rules', stop: 'blocked by a day rule' }, { step: 8, gate: 'TAKEN', stop: 'taken' }];
// the PC's live step (engine/brain.STAGES 1-10) -> the station it has passed / sits at
const LIVE_AT = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 4, 7: 5, 8: 7, 9: 7, 10: 7 };

async function getJSON(u) { try { const r = await fetch(u, { cache: 'no-cache' }); return r.ok ? await r.json() : null; } catch (_) { return null; } }

/* ---------------- right now ---------------- */
function drawNow() {
  const box = $('mNowBody'); if (!box) return; clear(box);
  const N = window.NQBRAIN, src = N && N.S && N.S.src;
  const L = S.model, A = S.atlas;
  const row = (who, cls, state, text) => { const r = h('div', 'mnrow ' + cls); const top = h('div', 'mnwho'); top.appendChild(h('b', '', who)); top.appendChild(h('span', 'mnstate', state));
    r.appendChild(top); r.appendChild(h('p', 'mntext', text)); return r; };
  if (L) {
    const st = L.stopped ? 'stopped' : !L.has ? 'no report' : L.armed ? 'armed' : L.on ? 'on' : 'off';
    const text = !L.has ? 'The PC has not sent Zlarior\'s brain yet (its 15-minute report).' : L.current ? `Step ${L.current.n}/10, ${L.current.label}: ${L.cards[L.current.key].now}` : 'Waiting for the next step.';
    box.appendChild(row('Zlarior', L.current && L.has ? 'live' : '', st, text));
  }
  if (A) {
    const cur = (A.regions || []).find((r) => ['armed', 'trade', 'signal'].includes(r.state));
    const st = A.stopped ? 'stopped' : !A.has ? 'no report' : cur ? cur.state : A.on ? 'watching' : 'off';
    const text = !A.has ? 'The PC has not sent ATLAS\'s brain yet.' : cur ? `${cur.label}: ${cur.text || cur.state}` : (A.regions || []).map((r) => `${r.label} ${r.state}`).join(' · ');
    box.appendChild(row('ATLAS', cur ? 'live' : '', st, text));
  }
  const lite = src && src.lite;
  const t = lite && (lite.t || (lite.reporter && lite.reporter.t));
  const cur = S.learn && S.learn.current;
  const meta = [t ? `PC report ${hm(t)} ET (${ageText(t)})` : 'the PC\'s report has not arrived yet (the site\'s copy)',
    cur && cur.regime ? `market: ${cur.regime} week, ${cur.vix_band || ''}${cur.prior_day ? `, prior day ${cur.prior_day}` : ''} (as of ${md(cur.data_to)})` : null].filter(Boolean).join(' · ');
  $('mNowMeta').textContent = meta;
}

/* ---------------- LIT's setup pipeline ---------------- */
function pipeData() {
  const F = S.learn && S.learn.learning && S.learn.learning.lit_setups;
  const SC = S.learn && S.learn.learning && S.learn.learning.setup_scores;
  const cnt = {}; for (const f of (F && F.funnel) || []) cnt[f.step] = f.n;
  const rows = ((SC && SC.rows) || []);
  const lastDay = rows.length ? rows.map((r) => r.day).sort().pop() : null;
  const latest = rows.filter((r) => r.day === lastDay);
  const L = S.model, live = L && L.has && L.current ? LIVE_AT[L.current.n] : null;
  return { F, cnt, total: F ? F.setups : null, taken: F ? F.taken : null, lastDay, latest, live, liveLabel: L && L.current ? L.current.label : null };
}
function drawPipeList(P) {
  const ul = $('mPipeList'); clear(ul);
  if (!P.F) { ul.appendChild(h('li', 'mnone', 'The LIT setup learner has not written its funnel yet (research/learn/lit_setups.json).')); return; }
  let left = P.total;
  STATIONS.forEach((st, i) => {
    const n = P.cnt[st.step] || 0;
    const li = h('li', 'mst' + (st.step === 8 ? ' taken' : '') + (P.live === i ? ' live' : ''));
    const top = h('div', 'mstrow');
    top.appendChild(h('b', '', st.step === 8 ? 'Taken' : st.gate));
    top.appendChild(h('span', 'ag-num', st.step === 8 ? `${n.toLocaleString('en-US')} trades` : `${n.toLocaleString('en-US')} stopped`));
    li.appendChild(top);
    const bar = h('div', 'mbar'); const fill = h('i'); fill.style.width = `${Math.max(1, Math.round(100 * n / Math.max(1, P.total)))}%`; bar.appendChild(fill); li.appendChild(bar);
    if (st.step !== 8) li.appendChild(h('p', 'mnote', `${left.toLocaleString('en-US')} reached it; ${n.toLocaleString('en-US')} stopped here (${st.stop})`));
    const here = P.latest.filter((r) => r.step === st.step);
    if (here.length) li.appendChild(h('p', 'mlate', `${md(P.lastDay)}: ` + here.map((r) => `${r.at} ${r.side.toLowerCase()}`).join(', ')));
    if (P.live === i) li.appendChild(h('p', 'mlivetxt', `Now (PC): ${P.liveLabel}`));
    left -= st.step === 8 ? 0 : n;
    ul.appendChild(li);
  });
}

// the canvas: a glowing funnel tube seen in perspective; particles = setups flowing down, peeling off at the gate that stopped them
function pipeCanvas(P) {
  const cv = $('mPipe'); if (!cv || !cv.getContext) return;
  const box = cv.parentElement, W = Math.max(280, box.clientWidth), H = Math.round(Math.min(560, Math.max(380, W * 1.05)));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = `${H}px`;
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const top = 46, bot = H - 54, n = STATIONS.length, cx = W / 2;
  const yOf = (i) => top + (bot - top) * (i / (n - 1));
  const wOf = (y) => { const k = (y - top) / (bot - top); return (W * 0.42) * (1 - 0.62 * k); };          // the funnel narrows downward
  const tot = Math.max(1, P.total || 1);
  // where a new particle stops: sampled from the real funnel
  const weights = STATIONS.map((s) => (P.cnt[s.step] || 0) / tot);
  const pick = () => { let r = Math.random(), i = 0; for (; i < weights.length - 1; i++) { r -= weights[i]; if (r <= 0) break; } return i; };
  const spawn = () => ({ i: pick(), y: top - 20 - Math.random() * 60, a: Math.random() * Math.PI * 2, r: 0.35 + Math.random() * 0.6, v: 0.55 + Math.random() * 0.55, out: 0, life: 1 });
  if (!S.parts.length) for (let k = 0; k < 90; k++) { const p = spawn(); p.y = top + Math.random() * (bot - top); S.parts.push(p); }
  const latest = P.latest.map((r) => ({ ...r, i: STATIONS.findIndex((s) => s.step === r.step) })).filter((r) => r.i >= 0);
  const per = {}; for (const r of latest) { r.k = per[r.i] = (per[r.i] || 0) + 1; }      // the k-th orb at its gate, spread round the ring

  function frame(t) {
    g.clearRect(0, 0, W, H);
    // the tube: rings at each station + the glowing walls
    for (let k = 0; k < 2; k++) {
      g.beginPath();
      for (let y = top; y <= bot; y += 6) { const x = cx + (k ? 1 : -1) * wOf(y); y === top ? g.moveTo(x, y) : g.lineTo(x, y); }
      const gr = g.createLinearGradient(0, top, 0, bot); gr.addColorStop(0, 'rgba(157,89,238,.85)'); gr.addColorStop(1, 'rgba(241,193,75,.75)');
      g.strokeStyle = gr; g.lineWidth = 2; g.shadowColor = '#9d59ee'; g.shadowBlur = 14; g.stroke(); g.shadowBlur = 0;
    }
    STATIONS.forEach((st, i) => {
      const y = yOf(i), w = wOf(y), live = P.live === i, taken = st.step === 8;
      g.beginPath(); g.ellipse(cx, y, w, w * 0.22, 0, 0, Math.PI * 2);
      g.strokeStyle = taken ? 'rgba(119,219,137,.9)' : live ? 'rgba(241,193,75,.95)' : 'rgba(157,89,238,.55)';
      g.lineWidth = live || taken ? 2.4 : 1.3; g.shadowColor = taken ? '#77db89' : live ? '#f1c14b' : '#9d59ee'; g.shadowBlur = live ? 22 + 8 * Math.sin(t / 300) : 10; g.stroke(); g.shadowBlur = 0;
      g.fillStyle = taken ? '#77db89' : live ? '#f1c14b' : '#dacbf0'; g.font = `${taken ? 700 : 600} 12px system-ui, sans-serif`; g.textAlign = 'left';
      const n = P.cnt[st.step] || 0;
      g.fillText(taken ? `TAKEN ${n.toLocaleString('en-US')}` : st.gate, 10, y - 4);
      if (!taken) { g.fillStyle = 'rgba(169,156,194,.9)'; g.font = '12px system-ui, sans-serif'; g.fillText(`-${n.toLocaleString('en-US')}`, 10, y + 11); }
      if (live) { g.fillStyle = '#f1c14b'; g.font = '700 12px system-ui, sans-serif'; g.textAlign = 'right'; g.fillText('NOW', W - 10, y - 4); }
    });
    // particles
    for (const p of S.parts) {
      const yStop = yOf(p.i);
      if (!REDUCE && !LITE) {
        if (p.y < yStop) p.y += p.v * 1.4;
        else if (STATIONS[p.i].step === 8) { p.life -= 0.02; }
        else { p.out += 0.9; p.life -= 0.016; }
        p.a += 0.02;
      } else if (p.y > yStop) p.y = yStop;
      const w = wOf(Math.min(Math.max(p.y, top), bot));
      const x = cx + Math.cos(p.a) * w * p.r + (p.out ? (Math.cos(p.a) >= 0 ? 1 : -1) * p.out * 1.6 : 0);
      const y = p.y + Math.sin(p.a) * w * 0.22 * p.r;
      const taken = STATIONS[p.i].step === 8 && p.y >= yStop;
      g.globalAlpha = Math.max(0, Math.min(1, p.life)) * (p.y < top ? 0.3 : 1);
      g.beginPath(); g.arc(x, y, taken ? 2.8 : 1.8, 0, Math.PI * 2);
      g.fillStyle = taken ? '#77db89' : p.out ? 'rgba(239,154,154,.9)' : '#c9a7ff'; g.shadowColor = g.fillStyle; g.shadowBlur = 8; g.fill(); g.shadowBlur = 0;
      g.globalAlpha = 1;
      if (p.life <= 0) Object.assign(p, spawn());
    }
    // the latest analysed session's setups, parked at the gate that stopped them (gold orbs)
    latest.forEach((r, k) => {
      const m = per[r.i], ang = Math.PI * (0.15 + 0.7 * ((r.k - 0.5) / m)) + (REDUCE || LITE ? 0 : t / 9000);
      const w = wOf(yOf(r.i)), x = cx - Math.cos(ang) * w * 0.82, y = yOf(r.i) + Math.sin(ang) * w * 0.22 * 0.82;
      g.beginPath(); g.arc(x, y, 5.5, 0, Math.PI * 2); g.fillStyle = '#f1c14b'; g.shadowColor = '#f1c14b'; g.shadowBlur = 16 + (REDUCE ? 0 : 6 * Math.sin(t / 400 + k)); g.fill(); g.shadowBlur = 0;
      g.fillStyle = '#000'; g.font = '700 7px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(r.side[0], x, y + 2.5);
    });
    g.fillStyle = 'rgba(218,203,240,.9)'; g.font = '600 12px system-ui, sans-serif'; g.textAlign = 'center';
    g.fillText(`${(P.total || 0).toLocaleString('en-US')} setups since 2021 enter here`, cx, 18);
    S.drawn++;
    if (!REDUCE && !LITE && !document.hidden) S.raf = requestAnimationFrame(frame);
  }
  cancelAnimationFrame(S.raf);
  if (!P.F) { g.clearRect(0, 0, W, H); return; }
  S.raf = requestAnimationFrame(frame);
}
function drawPipe() {
  const P = pipeData();
  $('mPipeSub').textContent = P.F ? `Every LIT setup since 2021 (${(P.total || 0).toLocaleString('en-US')}) and the gate that stopped it; ${P.taken.toLocaleString('en-US')} were taken. Gold = the setups of ${md(P.lastDay)}, the newest session analysed.${P.live !== null && P.live !== undefined ? ' NOW = where today\'s setup is, from the PC.' : ''}` : 'No funnel yet.';
  drawPipeList(P); pipeCanvas(P);
}

/* ---------------- ATLAS members ---------------- */
function drawAtlas() {
  const box = $('mAtlas'); if (!box) return; clear(box);
  const A = S.atlas;
  if (!A || !(A.regions || []).length) { box.appendChild(h('p', 'mnone', 'No ATLAS brain yet.')); return; }
  const WORD = { armed: 'armed', trade: 'in a trade', signal: 'signal', window: 'in its window', done: 'done today', off: 'off now', unknown: 'not reported' };
  for (const r of A.regions) {
    const t = h('div', 'mmem ' + r.state); t.appendChild(h('b', '', r.label)); t.appendChild(h('span', 'mmstate', WORD[r.state] || r.state));
    t.appendChild(h('p', '', r.text || (A.has ? '' : 'The PC has not sent it.'))); box.appendChild(t);
  }
}

/* ---------------- ideas on trial ---------------- */
function drawTrial() {
  const box = $('mTrial'); if (!box) return; clear(box);
  const F = S.learn && S.learn.learning && S.learn.learning.forward;
  const rules = ((F && F.rules) || []).filter((r) => !HIDDEN.has(String(r.bot || '').toLowerCase()) && !/^blitz/i.test(r.id));
  if (!rules.length) { box.appendChild(h('p', 'mnone', 'No idea is on trial yet.')); return; }
  $('mTrialSub').textContent = `Scored only on trading days from ${md(F.from)} on, against its own backtest. 20 new trades holding up = an owner yes / no card; nothing switches on by itself.${!F.sessions ? ` No new day scored yet (bars end ${md(F.data_end)}).` : rules.some((r) => r.n) ? '' : ` ${F.sessions} new trading day${F.sessions === 1 ? '' : 's'} scored to ${md(F.data_end)}: no idea had a trade on them yet.`}`;
  const grid = h('div', 'mrings');
  for (const r of rules) {
    const c = h('div', 'mring ' + r.status); c.dataset.id = r.id;
    const ring = h('div', 'mr'); ring.style.setProperty('--p', `${Math.round(100 * r.progress)}%`); ring.setAttribute('role', 'img'); ring.setAttribute('aria-label', `${r.n} of ${r.need} new trades`);
    ring.appendChild(h('b', 'ag-num', `${r.n}/${r.need}`)); c.appendChild(ring);
    const t = h('div', 'mrt');
    const name = h('b', '', r.what.split(' (')[0]);
    t.appendChild(name);
    if (/s1/i.test(r.id)) t.appendChild(h('span', 'mnew', 'NEW · S1 forward flag'));
    t.appendChild(h('p', '', `${r.bot && r.bot !== '-' ? r.bot + ' · ' : ''}backtest ${R(r.band_r)} a trade · new days ${r.n ? R(r.fwd_r) : 'none yet'}`));
    t.appendChild(h('p', 'mw', r.word));
    c.appendChild(t); grid.appendChild(c);
  }
  box.appendChild(grid);
}

/* ---------------- lessons / live vs twin / health ---------------- */
function drawLessons() {
  const ol = $('mLessons'); if (!ol) return; clear(ol);
  const seen = new Set(), J = [];                     // one line per lesson: the "- FADED: ..." follow-up of a lesson already shown is folded in
  for (const r of ((S.learn && S.learn.journal) || [])) {
    if (HIDDEN.has(r.pillar)) continue;
    const k = r.pillar + '|' + String(r.text || '').split(' - ')[0].slice(0, 90);
    if (seen.has(k)) continue;
    seen.add(k); J.push(r); if (J.length >= 7) break;
  }
  if (!J.length) { ol.appendChild(h('li', 'mnone', 'No lessons logged yet.')); return; }
  const NAME = { lit: 'LIT', atlas: 'ATLAS', of: 'ORDER FLOW', learn: 'MARKET', risk: 'RISK' };
  for (const r of J) { const li = h('li', 'mles ' + r.pillar); li.appendChild(h('small', '', `${md(r.date)} · ${NAME[r.pillar] || r.pillar}`)); li.appendChild(h('span', '', r.text)); ol.appendChild(li); }
}
function drawGap() {
  const box = $('mGap'); if (!box) return; clear(box);
  const G = S.learn && S.learn.learning && S.learn.learning.livegap;
  if (!G) { box.appendChild(h('p', 'mnone', 'The live-vs-twin audit has not run yet.')); return; }
  const WORDS = { MISSED: 'Missed trades', SLIPPED: 'Slipped fills', SIZE: 'Different size', EXTRA: 'Extra moves' };
  box.appendChild(h('p', 'mnote', `The twin = the backtest run on your PC's own bars. $ = live minus twin since each account started, to ${md(G.to)} (+ = live did better).`));
  const tot = Object.entries(G.totals || {}), mx = Math.max(1, ...tot.map(([, v]) => Math.abs(v || 0)));
  for (const [k, v] of tot) {
    const r = h('div', 'mgap'); const top = h('div', 'mstrow'); top.appendChild(h('b', '', WORDS[k] || k)); top.appendChild(h('span', 'ag-num ' + ((v || 0) >= 0 ? 'pos' : 'neg'), usd(v)));
    r.appendChild(top); const bar = h('div', 'mbar ' + ((v || 0) >= 0 ? 'up' : 'dn')); const f = h('i'); f.style.width = `${Math.max(2, Math.round(100 * Math.abs(v || 0) / mx))}%`; bar.appendChild(f); r.appendChild(bar); box.appendChild(r);
  }
}
function drawHealth() {
  const box = $('mHealth'); if (!box) return; clear(box);
  const H = S.learn && S.learn.learning && S.learn.learning.health;
  const bots = Object.entries((H && H.bots) || {}).filter(([b]) => !HIDDEN.has(b.toLowerCase()));
  if (!bots.length) { box.appendChild(h('p', 'mnone', 'The health bands have not been built yet.')); return; }
  box.appendChild(h('p', 'mnote', `Green = where ${H.window}-trade stretches landed in 2026. Gold = live so far, violet = the twin on the same days.`));
  for (const [bot, b] of bots) {
    const [lo, mid, hi] = b.band_2026 || [];
    const vals = [lo, hi, b.live_r, b.twin_r].filter((v) => v !== null && v !== undefined);
    const a = Math.min(-1.5, ...vals), z = Math.max(2, ...vals), x = (v) => `${Math.max(1, Math.min(99, Math.round(100 * (v - a) / (z - a))))}%`;
    const row = h('div', 'mstrow'); row.appendChild(h('b', '', bot)); row.appendChild(h('span', 'mnote', b.zone || '')); box.appendChild(row);
    const band = h('div', 'mband'); band.setAttribute('role', 'img'); band.setAttribute('aria-label', `${bot}: live ${R(b.live_r)} a trade; 2026 band ${R(lo)} to ${R(hi)}`);
    if (lo !== null && hi !== null) { const zz = h('i', 'z'); zz.style.left = x(lo); zz.style.width = `calc(${x(hi)} - ${x(lo)})`; band.appendChild(zz); }
    if (b.twin_r !== null && b.twin_r !== undefined) { const m = h('i', 'm t'); m.style.left = x(b.twin_r); band.appendChild(m); }
    if (b.live_r !== null && b.live_r !== undefined) { const m = h('i', 'm'); m.style.left = x(b.live_r); band.appendChild(m); }
    box.appendChild(band);
    box.appendChild(h('p', 'mnote', [b.live_n ? `live ${b.live_n} trades ${R(b.live_r)}` : 'no live trades yet', b.twin_n ? `twin ${b.twin_n} trades ${R(b.twin_r)}` : null, `2026 typical ${R(mid)}`].filter(Boolean).join(' · ')));
  }
}

/* ---------------- the shared fast feed (nq/nqfeed.js, night-nq-speed): instant paint from the kept post + every newer post ---------------- */
function postT(l) { return l ? Number(l.t || (l.reporter && l.reporter.t) || 0) : 0; }
function applyLite(lite) {
  const N = window.NQBRAIN, F = window.PC_FEED;
  if (!lite || !N || !N.S || !N.S.src || !N.S.src.home || !F || !F.homeOver) return false;
  if (postT(N.S.src.lite) >= postT(lite)) return false;                    // never go back to an older post
  try {
    N.S.src.lite = lite;
    N.S.src.home = F.homeOver(N.S.src.home, lite, Date.now() / 1000, window.PAYOUT_COACH || null);
    N.render();
    return true;
  } catch (_) { return false; }
}
function useFeed() {
  const Q = window.NQ_FEED;                                                 // null until nqfeed.js lands: brain.js's own read stays
  if (!Q || S.feedOn) return;
  S.feedOn = true;
  try { const first = Q.cached(); if (first) applyLite(first); } catch (_) { /* nothing kept */ }
  try { Q.on((lite) => { applyLite(lite); drawNow(); }); } catch (_) { /* the page's own read stays */ }
}
function ageText(t) {
  try { const Q = window.NQ_FEED; if (Q && Q.age) return Q.age(t).text; } catch (_) { /* below */ }
  const m = Math.max(0, Math.round((Date.now() / 1000 - t) / 60));
  return m < 2 ? 'just now' : m < 120 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

/* ---------------- loop ---------------- */
function models() {
  const N = window.NQBRAIN; if (!N || !N.S || !N.BC) return false;
  const m = N.S.model; if (!m) return false;
  const now = Date.now() / 1000;
  try { S.model = m.bot === 'lit' ? m : N.BC.brain('lit', N.S.src, now); S.atlas = m.bot === 'atlas' ? m : N.BC.brain('atlas', N.S.src, now); } catch (_) { return false; }
  return true;
}
let lastM = null;
function tick(force) {
  const N = window.NQBRAIN, m = N && N.S && N.S.model;
  if (!force && m === lastM) return;
  lastM = m;
  if (!models()) return;
  drawNow(); drawAtlas();
  if (force || !S.ready) { drawPipe(); drawTrial(); drawLessons(); drawGap(); drawHealth(); }
  else drawPipe();
  if (!S.ready) { S.ready = true; document.documentElement.dataset.mind = 'ready'; }
}
async function boot() {
  try { if (matchMedia('(min-width: 1100px)').matches) $('mPipeDet').open = true; } catch (_) { /* phone: folded */ }
  S.learn = await getJSON('../brain/learn.json');
  setInterval(() => tick(false), 1000);
  try {                                                // brain.js redraws (the PC's report arrived, a bot switch): follow at once
    const mo = new MutationObserver(() => tick(false));
    for (const id of ['bStatus', 'bNow', 'brainH']) { const e = $(id); if (e) mo.observe(e, { childList: true, characterData: true, subtree: true }); }
  } catch (_) { /* the 1 s poll stays */ }
  setInterval(async () => { const d = await getJSON('../brain/learn.json'); if (d) { S.learn = d; tick(true); } }, 10 * 60 * 1000);
  let rw = 0; addEventListener('resize', () => { clearTimeout(rw); rw = setTimeout(() => { if (S.ready) drawPipe(); }, 200); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.ready) drawPipe(); });
  const wait = () => { if (models()) { useFeed(); tick(true); } else setTimeout(wait, 300); };
  wait();
}
window.NQMIND = { S, ready: () => S.ready, tick, STATIONS, applyLite };
boot();
