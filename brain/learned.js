// WHAT THE BOTS LEARNED (brain/learned.html; big-learnview 2026-11-26). One GET of learn.json (tools/build_brain_learn.py): the dated lessons
// (research/learn/journal.json), what each bot tests next (brain_state.json), the watched ideas on new days (research/forward/forward.json),
// the idea mill, live vs its twin (research/livegap), the health bands, LIT's setup funnel, the order-flow learner.
// Text only through textContent / createElement. Read only: nothing sent, armed or placed. Storage: none. window.LEARNED = the test hook.
const $ = (id) => document.getElementById(id);
const COL = { lit: '#f1c14b', atlas: '#77db89', blitz: '#c58cff', of: '#9d59ee', learn: '#e9d58a', risk: '#b6f0c2' };
const NAME = { lit: 'LIT', atlas: 'ATLAS', blitz: 'BLITZ', of: 'POSEIDON', learn: 'MARKET', risk: 'RISK' };
const STATUS = { watching: 'watching', confirmed: 'confirmed', rejected: 'rejected', paper: 'on paper', found: 'found', noted: 'noted', promote: 'ready', demoted: 'dropped', error: 'not scored' };
const S = { d: null, filter: 'all', shown: 24 };

function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }
  for (const k of kids) if (k != null) e.append(typeof k === 'string' ? document.createTextNode(k) : k);
  return e;
}
const fmt = (v, d = 2) => (v === null || v === undefined || !Number.isFinite(+v) ? '-' : (+v).toFixed(d));
const R = (v) => (v === null || v === undefined ? '-' : `${v > 0 ? '+' : ''}${fmt(v)}R`);
const usd = (v) => (v === null || v === undefined ? '-' : `${v < 0 ? '-' : '+'}$${Math.abs(Math.round(v)).toLocaleString('en-US')}`);
const int = (v) => (v === null || v === undefined ? '-' : Math.round(v).toLocaleString('en-US'));
const md = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : (s || 'undated'); };
const cls = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');

async function load() {
  try { const r = await fetch('learn.json', { cache: 'no-cache' }); return r.ok ? await r.json() : null; } catch (_) { return null; }
}

/* ---------------- pieces ---------------- */
function weekRows(J) {
  if (!J.length) return [];
  const last = J[0].date; const t = Date.parse(`${last}T00:00:00Z`);
  return J.filter((r) => Number.isFinite(t) && t - Date.parse(`${r.date}T00:00:00Z`) < 7 * 864e5);
}
function hero(d) {
  const L = d.learning || {}, F = L.forward || {}, M = L.ideamill || {}, J = d.journal || [];
  const rules = F.rules || [];
  const close = rules.length ? rules.reduce((a, b) => (b.progress > a.progress ? b : a), rules[0]) : null;
  const tiles = [
    { b: int(weekRows(J).length), s: 'lessons in the last 7 days' },
    { b: int(M.tested), s: 'ideas the mill has tested' },
    { b: `${rules.length}`, s: 'ideas on trial on new days', c: 'mint' },
    close && close.n ? { b: `${close.n}/${close.need}`, s: `closest to graduating: ${close.what.split(' (')[0].slice(0, 44)}` }
      : { b: int(F.sessions || 0), s: 'new trading days scored so far' },
  ];
  $('hero').replaceChildren(...tiles.map((t) => el('div', { class: 'tile' + (t.c ? ' ' + t.c : '') }, el('b', { text: t.b }), el('span', { text: t.s }))));
  const J2 = [['sGrad', 'On trial'], ['sScore', 'Setup scores'], ['sTime', 'Lessons'], ['sNext', 'Next'], ['sLit', 'LIT funnel'], ['sMill', 'Idea mill'], ['sGap', 'Live vs twin'], ['sHealth', 'Health'], ['sOf', 'POSEIDON · order flow']];
  $('jump').replaceChildren(...J2.map(([id, t]) => el('a', { href: `#${id}`, text: t })));
}
function grad(L) {
  const F = L.forward, box = $('grad');
  if (!F || !(F.rules || []).length) { box.replaceChildren(el('p', { class: 'muted', text: 'No idea is on trial yet (research/forward/forward.json has not been built).' })); return; }
  const kids = [el('p', { class: 'muted', text: `Each idea is scored only on trading days from ${md(F.from)} on, against what it did in its own backtest. It graduates at ${L.promote_bar}. Then the lead brings you a yes / no card; nothing switches on by itself.` })];
  if (!F.sessions) kids.push(el('p', { class: 'muted', text: `No new trading days scored yet (the bars end ${md(F.data_end)}). The count starts with the next pulled day.` }));
  else if (!F.rules.some((r) => r.n)) kids.push(el('p', { class: 'muted', text: `${F.sessions} new trading day${F.sessions === 1 ? '' : 's'} scored (${md(F.from)} - ${md(F.data_end)}): none of the ideas had a trade on them yet.` }));
  for (const r of F.rules) {
    kids.push(el('div', { class: 'idea', 'data-id': r.id },
      el('div', { class: 't' }, el('b', { text: r.what }), el('span', { class: `badge ${r.status}`, text: STATUS[r.status] || r.status })),
      el('div', { class: 'bar', role: 'img', 'aria-label': `${r.n} of ${r.need} new trades` }, el('i', { style: `width:${Math.round(100 * r.progress)}%` })),
      el('p', { class: 'w', text: `${r.n} of ${r.need} new trades · ${r.word}` }),
      el('p', { text: `New days: ${r.n ? R(r.fwd_r) + ' a trade' : 'none yet'} · its backtest: ${R(r.band_r)} a trade over ${int(r.band_n)}${r.bot && r.bot !== '-' ? ` · ${r.bot}` : ''} · ${r.kind}` })));
  }
  box.replaceChildren(...kids);
}
function scores(L) {
  const S2 = L.setup_scores, box = $('score');
  if (!S2 || !(S2.rows || []).length) { box.replaceChildren(el('p', { class: 'muted', text: 'No setup scores yet (research/setupscore/pool.json and the LIT setup review are needed).' })); return; }
  const h = S2.holdout;
  const kids = [el('p', { class: 'muted', text: 'Each setup is compared with the 50 most similar LIT setups since 2021 (same side; time of day, sweep depth, displacement, inducements, VIX). Display only: it never changes which trades are taken.' })];
  if (S2.verdict !== 'separates') kids.push(el('p', { class: 'w warn', text: `History only, not a predictor: on Jul-Oct 2026 (days it never saw) the best-scored third made ${R(h && h.top_third_r)} a setup and the worst third ${R(h && h.bottom_third_r)}. The score did not pick winners.` }));
  for (const r of S2.rows) {
    kids.push(el('div', { class: 'idea' }, el('div', { class: 't' }, el('b', { text: `${md(r.day)} ${r.at} ${r.side}` }),
      el('span', { class: 'badge' + (r.step === 8 ? ' promote' : ''), text: r.step === 8 ? 'taken' : r.why })),
      el('p', { class: 'w', text: r.n ? `Similar setups: ${r.n}, won ${Math.round(100 * r.win)}%, avg ${R(r.avg_r)}` : 'No similar setups yet' }),
      r.r !== null && r.r !== undefined ? el('p', { text: `${r.step === 8 ? 'It made' : 'It would have made'} ${R(r.r)}` }) : null));
  }
  box.replaceChildren(...kids);
}
function timeline(d) {
  const J = d.journal || [];
  const pills = ['all', ...Object.keys(NAME).filter((k) => J.some((r) => r.pillar === k))];
  $('filt').replaceChildren(...pills.map((k) => el('button', { type: 'button', 'data-f': k, 'aria-pressed': String(S.filter === k), text: k === 'all' ? 'All' : NAME[k],
    onclick: () => { S.filter = k; S.shown = 24; timeline(d); } })));
  const rows = J.filter((r) => S.filter === 'all' || r.pillar === S.filter);
  const ol = $('tl'), kids = [];
  let day = null;
  for (const r of rows.slice(0, S.shown)) {
    if (r.date !== day) { day = r.date; kids.push(el('li', { class: 'd', text: md(day) })); }
    kids.push(el('li', { class: 'x', style: `--c:${COL[r.pillar] || '#9d59ee'}` }, el('small', { text: NAME[r.pillar] || r.pillar }), r.text,
      el('em', { text: STATUS[r.status] || r.status }), r.usd !== null && r.usd !== undefined ? el('b', { class: cls(r.usd), text: ` ${usd(r.usd)}` }) : null));
  }
  if (!kids.length) kids.push(el('li', { class: 'muted', text: 'No lessons logged yet.' }));
  ol.replaceChildren(...kids);
  const more = $('tlMore');
  more.hidden = rows.length <= S.shown;
  more.onclick = () => { S.shown += 30; timeline(d); };
}
function nextList(L) {
  const N = L.next || [];
  $('next').replaceChildren(...(N.length ? N.map((x) => el('li', {}, el('em', { text: NAME[x.pillar] || x.pillar, style: `color:${COL[x.pillar] || ''}` }), ` ${x.text}`))
    : [el('li', { class: 'muted', text: 'Nothing registered to test yet.' })]));
}
function funnel(L) {
  const F = L.lit_setups, box = $('funnel');
  if (!F) { box.replaceChildren(el('p', { class: 'muted', text: 'The LIT setup learner has not written its funnel yet.' })); return; }
  const top = Math.max(1, ...F.funnel.map((x) => x.n));
  const kids = [el('p', { class: 'muted', text: `${int(F.setups)} setups LIT saw since 2021 (to ${md(F.data_end)}), ${int(F.taken)} taken. Where the others stopped:` })];
  for (const x of [...F.funnel].sort((a, b) => b.n - a.n)) {
    kids.push(el('div', { class: 'fn' }, el('div', { class: 'r' }, el('span', { text: x.why }), el('b', { text: int(x.n) })),
      el('div', { class: 'bar' + (x.why === 'taken' ? ' ok' : '') }, el('i', { style: `width:${Math.round(100 * x.n / top)}%` }))));
  }
  kids.push(el('div', { class: 'two' }, el('div', { class: 'up' }, el('b', { text: 'Rules that earn the most' }), ...F.earns_most.map((t) => el('div', { text: t }))),
    el('div', { class: 'dn' }, el('b', { text: 'Rules that cost the most' }), ...F.costs_most.map((t) => el('div', { text: t })))));
  if (F.recent.length) kids.push(el('p', { class: 'muted', style: 'margin-top:10px', text: 'Latest setups, in its own words:' }), el('ul', { class: 'lst' }, ...F.recent.map((t) => el('li', { text: t }))));
  box.replaceChildren(...kids);
}
function mill(L) {
  const M = L.ideamill, box = $('mill');
  if (!M) { box.replaceChildren(el('p', { class: 'muted', text: 'The idea mill summary is not there yet.' })); return; }
  const steps = [['Ideas tested', M.tested], ['Had enough trades to score', M.scored], ['Passed the first check (discovery)', M.passed_discovery], ['Survived the many-tries haircut', M.passed_haircut], ['Held on all 3 unseen periods', M.passed_holdouts]];
  const top = Math.max(1, M.tested || 1);
  const kids = steps.map(([t, v]) => el('div', { class: 'fn' }, el('div', { class: 'r' }, el('span', { text: t }), el('b', { text: int(v) })),
    el('div', { class: 'bar' }, el('i', { style: `width:${v ? Math.max(1, Math.round(100 * v / top)) : 0}%` }))));
  kids.push(el('p', { class: 'muted', text: `${int(M.survivors)} survivors so far. By pure luck about ${int(M.lucky_expected)} would look good on one test, which is why every idea must pass all the checks. Data to ${md(M.data_end)}.` }));
  box.replaceChildren(...kids);
}
function gap(L) {
  const G = L.livegap, box = $('gap');
  if (!G) { box.replaceChildren(el('p', { class: 'muted', text: 'The live-vs-twin audit has not run yet.' })); return; }
  const words = { MISSED: 'Missed (the twin traded, live did not)', SLIPPED: 'Slipped (worse fills than the twin)', SIZE: 'Size (different number of micros)', EXTRA: 'Extra (live moved with no twin trade)' };
  const kids = [el('p', { class: 'muted', text: `The twin is the backtest run on the PC's own bars. Every gap since the accounts started, to ${md(G.to)} ($ = live minus twin, by kind; + = live did better):` }),
    el('div', { class: 'kv' }, ...Object.entries(G.totals || {}).flatMap(([k, v]) => [el('span', { text: words[k] || k }), el('b', { class: cls(v), text: usd(v) })]))];
  if ((G.recent || []).length) kids.push(el('ul', { class: 'lst' }, ...G.recent.map((x) => el('li', { text: `${x.when}: ${x.kind} ${x.bot} ${usd(x.usd)}. ${x.detail}` }))));
  box.replaceChildren(...kids);
}
function health(L) {
  const H = L.health, box = $('health');
  if (!H || !Object.keys(H.bots || {}).length) { box.replaceChildren(el('p', { class: 'muted', text: 'The health bands have not been built yet.' })); return; }
  const kids = [el('p', { class: 'muted', text: `Green = where ${H.window}-trade stretches landed in 2026 (middle 90%). Gold = the live trades so far, violet = the twin over the same days.` })];
  for (const [bot, b] of Object.entries(H.bots)) {
    const [lo, mid, hi] = b.band_2026 || [];
    const vals = [lo, hi, b.live_r, b.twin_r].filter((v) => v !== null && v !== undefined);
    const a = Math.min(-1.5, ...vals), z = Math.max(2, ...vals), x = (v) => `${Math.max(1, Math.min(99, Math.round(100 * (v - a) / (z - a))))}%`;
    kids.push(el('div', { class: 'r', style: 'display:flex;justify-content:space-between;font-size:13px' }, el('b', { text: bot }), el('span', { class: 'muted', text: b.zone || '' })),
      el('div', { class: 'band', role: 'img', 'aria-label': `${bot}: live ${R(b.live_r)} a trade, 2026 band ${R(lo)} to ${R(hi)}` },
        lo !== null && hi !== null ? el('div', { class: 'z', style: `left:${x(lo)};width:calc(${x(hi)} - ${x(lo)})` }) : null,
        b.twin_r !== null && b.twin_r !== undefined ? el('div', { class: 'm t', style: `left:${x(b.twin_r)}` }) : null,
        b.live_r !== null && b.live_r !== undefined ? el('div', { class: 'm', style: `left:${x(b.live_r)}` }) : null),
      el('p', { class: 'muted', style: 'margin:-4px 0 10px', text: [b.live_n ? `live ${int(b.live_n)} trades ${R(b.live_r)} a trade` : 'no live trades yet', b.twin_n ? `twin ${int(b.twin_n)} trades ${R(b.twin_r)}${b.twin_pct_2026 !== null && b.twin_pct_2026 !== undefined ? ` (worse than ${100 - Math.round(b.twin_pct_2026)}% of 2026 stretches)` : ''}` : null, `2026 typical ${R(mid)}`].filter(Boolean).join(' · ') }));
  }
  box.replaceChildren(...kids);
}
function of(L) {
  const O = L.of || {}, box = $('of');
  const kids = (O.lines || []).length ? [el('ul', { class: 'lst' }, ...O.lines.map((x) => el('li', { text: `${md(x.date)}: ${x.text}` })))]
    : (O.verdict ? [] : [el('p', { class: 'muted', text: 'No order-flow lessons yet: it is still collecting tick days.' })]);
  const V = O.verdict;
  if (V) {
    kids.unshift(el('div', { class: 'kv' }, el('span', { text: 'Real tick days' }), el('b', { text: `${V.tick_days} (${md(V.first)} - ${md(V.last)})` }),
      el('span', { text: 'Absorbed sweeps (taken)' }), el('b', { class: cls(V.taken_r), text: `${R(V.taken_r)} a trade` }),
      el('span', { text: 'Not absorbed (skipped)' }), el('b', { class: cls(V.skipped_r), text: `${R(V.skipped_r)} a trade` }),
      el('span', { text: 'New-day trades for the verdict' }), el('b', { text: `${int(V.fwd_n || 0)} of ${int(V.fwd_need || 20)}` })),
    el('p', { class: 'muted', style: 'margin-top:8px', text: V.line }));
  }
  if (O.next && !V) kids.push(el('p', { class: 'src', text: `Next: ${O.next}` }));
  box.replaceChildren(...kids);
}

/* ---------------- page ---------------- */
function hideBlitz(d) {                                // owner rule: BLITZ is hidden on the phone pages (paper, switched off)
  const no = (x) => !/blitz/i.test(String(x || ''));
  d.journal = (d.journal || []).filter((r) => no(r.pillar));
  const L = d.learning || {};
  if (L.forward) L.forward.rules = (L.forward.rules || []).filter((r) => no(r.bot) && no(r.id));
  if (L.health && L.health.bots) for (const k of Object.keys(L.health.bots)) if (!no(k)) delete L.health.bots[k];
  if (L.next) L.next = L.next.filter((x) => no(x.pillar));
  return d;
}
function render(d) {
  d = hideBlitz(d);
  S.d = d;
  const L = d.learning || {};
  hero(d); grad(L); scores(L); timeline(d); nextList(L); funnel(L); mill(L); gap(L); health(L); of(L);
  const last = (d.journal || [])[0];
  const p = $('fresh'); p.textContent = last ? `latest ${md(last.date)}` : 'no lessons yet'; p.dataset.level = last ? 'ok' : 'warn';
  $('srcs').textContent = `Reads brain/learn.json, built from ${[...(d.sources || []), ...(L.sources || [])].join(', ') || 'nothing yet'}. Research only: nothing here changes a live rule.`;
  document.documentElement.dataset.mode = 'ready';
  const h = location.hash.slice(1);
  if (h && NAME[h] && (d.journal || []).some((r) => r.pillar === h)) { S.filter = h; timeline(d); $('sTime').scrollIntoView(); }
}
async function main() {
  const d = await load();
  if (!d) {
    $('hero').replaceChildren(el('p', { class: 'muted', text: 'Could not load learn.json. Nothing to show yet.' }));
    document.documentElement.dataset.mode = 'empty';
    return;
  }
  render(d);
}
window.LEARNED = { S, render };
main();
