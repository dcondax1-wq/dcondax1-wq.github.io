// PANTHEON plus (2026-11-04): what the page does with pantheon.json beyond the hall. Pure functions + small DOM enhancers; read-only
// context, nothing here changes a strategy.
//   whatIf(d, over)        the Council's own rule on edited votes: score = the mean of the council votes (at least 3 voices),
//                          gauge = (score + 1) x 50, RISK-ON at >= +0.20, RISK-OFF at <= -0.20, else MIXED (tools/pantheon/council.py)
//   regimes(d)             the verdict history as runs: [{label, n, weeks (about), peak, from, to}] newest first
//   flipCheck(d, last)     the verdict now against the one last seen on this phone -> {flipped, from, to}
//   councilNote(d)         the daily Council note: {title, lines (each <= 120 characters, for Jarvis's card), text}
//   godChartHtml(g) + wireChart(root, g)          a history chart of a god with a finger-scrub readout
//   enhanceCouncil(root, d, hooks)                the note, "what if" sliders and the regime timeline inside the Council panel
//   remember(d) -> {flip}                         keeps the last verdict under 'pantheon.last' / 'pantheon.flips' (this phone only)
import { esc, VERDICT, verdictHistory } from './pantheoncore.js';

const ON = 0.2, OFF = -0.2, MIN_VOICES = 3;
const fmt = (x, d = 2) => (x == null || !Number.isFinite(x) ? '-' : (x >= 0 ? '+' : '') + x.toFixed(d));
const labelOf = (s) => (s == null ? 'SILENT' : s >= ON ? 'RISK-ON' : s <= OFF ? 'RISK-OFF' : 'MIXED');

export const councilGods = (d) => d.gods.filter((g) => g.council && g.vote != null && Number.isFinite(g.vote));

/** over: {godKey: vote (-1..+1) | null (sits out)}; missing keys keep the real vote */
export function whatIf(d, over = {}) {
  const votes = councilGods(d).map((g) => (g.key in over ? over[g.key] : g.vote)).filter((v) => v != null && Number.isFinite(v));
  if (votes.length < MIN_VOICES) return { score: null, gauge: null, label: 'SILENT', voices: votes.length };
  const score = votes.reduce((a, b) => a + Math.max(-1, Math.min(1, b)), 0) / votes.length;
  return { score: Math.round(score * 1000) / 1000, gauge: Math.round((score + 1) * 50), label: labelOf(score), voices: votes.length };
}

export function regimes(d) {
  const h = verdictHistory(d), out = [];
  h.cells.forEach((c, i) => {
    const last = out[out.length - 1];
    if (last && last.label === c.label) { last.n++; last.to = i; last.peak = Math.max(last.peak, Math.abs(c.score)); }
    else out.push({ label: c.label, n: 1, from: i, to: i, peak: Math.abs(c.score) });
  });
  out.forEach((r) => { r.weeks = Math.max(1, Math.round(r.n * 0.8)); });
  return out.reverse();
}

export function flipCheck(d, last) {
  const now = d.council.label;
  if (!last || !last.label || last.label === now) return { flipped: false, from: last ? last.label : null, to: now };
  return { flipped: true, from: last.label, to: now };
}

export function councilNote(d) {
  const c = d.council, clip = (t, n = 120) => (t.length <= n ? t : t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…');
  const day = String(d.built || '').slice(0, 10) || 'today';
  const lines = [
    `Council ${day}: ${c.label}${c.gauge == null ? '' : ' ' + c.gauge + '/100'}, ${c.voices} voices.`,
    c.text, c.caution || '', c.honesty || 'Context, not a signal.',
  ].filter(Boolean).map((t) => clip(t));
  return { title: `Council note · ${day}`, lines, text: lines.join('\n') };
}

// ------------------------------------------------------------------------------------------------ the memory of this phone
export function remember(d, storage) {
  const st = storage || (() => { try { return localStorage; } catch (_) { return null; } })();
  let last = null, flips = [];
  try { last = JSON.parse(st.getItem('pantheon.last') || 'null'); flips = JSON.parse(st.getItem('pantheon.flips') || '[]'); } catch (_) { last = null; flips = []; }
  const f = flipCheck(d, last);
  if (f.flipped) flips = [{ t: Date.now(), from: f.from, to: f.to, gauge: d.council.gauge }, ...flips].slice(0, 12);
  try { st.setItem('pantheon.last', JSON.stringify({ label: d.council.label, gauge: d.council.gauge, built: d.built })); st.setItem('pantheon.flips', JSON.stringify(flips)); } catch (_) { /* not kept */ }
  return { flip: f, flips };
}

// ------------------------------------------------------------------------------------------------ a god's history chart
export function godChartHtml(g) {
  const v = (g.spark || []).filter((x) => x != null && Number.isFinite(x));
  if (v.length < 3) return `<h3>History</h3><p class="note">No daily history for ${esc(g.name)}${g.key === 'athena' ? ': it is a calendar' : ''}.</p>`;
  const W = 320, H = 120, P = 8, lo = Math.min(...v), hi = Math.max(...v), span = Math.max(1e-12, hi - lo);
  const x = (i) => P + ((W - 2 * P) * i) / (v.length - 1), y = (q) => H - P - ((H - 2 * P - 8) * (q - lo)) / span;
  const pts = v.map((q, i) => `${x(i).toFixed(1)},${y(q).toFixed(1)}`).join(' ');
  const dp = (hi >= 1000 ? 0 : hi >= 100 ? 1 : 2), f = (q) => q.toFixed(dp);
  return `<h3>History <span class="hs">last ${v.length} readings</span></h3>
    <div class="gchart" data-god="${esc(g.key)}" data-vals="${v.map((q) => +q.toFixed(4)).join(',')}" data-dp="${dp}">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(g.name)} history: from ${f(v[0])} to ${f(v[v.length - 1])}, low ${f(lo)}, high ${f(hi)}">
        <line x1="${P}" x2="${W - P}" y1="${y(hi).toFixed(1)}" y2="${y(hi).toFixed(1)}" class="gl-grid"/><line x1="${P}" x2="${W - P}" y1="${y(lo).toFixed(1)}" y2="${y(lo).toFixed(1)}" class="gl-grid"/>
        <polygon points="${P},${H - P} ${pts} ${W - P},${H - P}" fill="${esc(g.color)}" fill-opacity=".14"/><polyline points="${pts}" fill="none" stroke="${esc(g.color)}" stroke-width="2.2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
        <line class="gx" x1="0" x2="0" y1="${P}" y2="${H - P}" hidden/><circle class="gdot" r="4.5" fill="#fff" stroke="${esc(g.color)}" stroke-width="2" hidden/>
        <circle cx="${x(v.length - 1).toFixed(1)}" cy="${y(v[v.length - 1]).toFixed(1)}" r="3.5" fill="${esc(g.color)}"/>
        <text x="${P + 2}" y="${(y(hi) - 3).toFixed(1)}" class="gl-t">${f(hi)}</text><text x="${P + 2}" y="${(y(lo) + 11).toFixed(1)}" class="gl-t">${f(lo)}</text></svg>
      <p class="greadout" aria-live="polite">Drag along the chart. Now ${f(v[v.length - 1])}${g.pct == null ? '' : ' · ' + g.pct.toFixed(0) + 'th percentile of 5 years'}.</p></div>`;
}

export function wireChart(root) {
  for (const box of root.querySelectorAll('.gchart')) {
    const v = box.dataset.vals.split(',').map(Number), dp = +box.dataset.dp, svg = box.querySelector('svg'), line = box.querySelector('.gx'), dot = box.querySelector('.gdot'), out = box.querySelector('.greadout');
    const W = 320, P = 8, H = 120, lo = Math.min(...v), hi = Math.max(...v), span = Math.max(1e-12, hi - lo);
    const at = (ev) => {
      const r = svg.getBoundingClientRect(), k = Math.max(0, Math.min(v.length - 1, Math.round(((ev.clientX - r.left) / r.width * W - P) / (W - 2 * P) * (v.length - 1))));
      const cx = P + ((W - 2 * P) * k) / (v.length - 1), cy = H - P - ((H - 2 * P - 8) * (v[k] - lo)) / span;
      line.removeAttribute('hidden'); dot.removeAttribute('hidden');
      line.setAttribute('x1', cx); line.setAttribute('x2', cx); dot.setAttribute('cx', cx); dot.setAttribute('cy', cy);
      const now = v[v.length - 1], rel = now ? ((v[k] - now) / Math.abs(now)) * 100 : 0;
      out.textContent = `Reading ${k + 1} of ${v.length}${k === v.length - 1 ? ' (latest)' : ''}: ${v[k].toFixed(dp)}${k === v.length - 1 ? '' : ' · ' + (rel >= 0 ? '+' : '') + rel.toFixed(1) + '% vs now'}`;
      box.dataset.k = String(k);
    };
    svg.addEventListener('pointerdown', (e) => { svg.setPointerCapture?.(e.pointerId); at(e); });
    svg.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') at(e); });
    svg.style.touchAction = 'pan-y';
  }
}

// ------------------------------------------------------------------------------------------------ the Council panel's extra sections
const bar = (v) => { const w = Math.abs(v) * 50; return `left:${v >= 0 ? 50 : 50 - w}%;width:${w}%`; };

export function enhanceCouncil(root, d, hooks = {}) {
  const anchor = [...root.querySelectorAll('h3')].find((h) => h.textContent.startsWith('Verdict history'));
  if (!anchor) return;
  const note = councilNote(d), gods = councilGods(d), runs = regimes(d).slice(0, 8), total = runs.reduce((a, r) => a + r.n, 0) || 1;
  const html = `<section class="plus" id="cn-note"><h3>Today's Council note</h3><div class="note-card"><b>${esc(note.title)}</b>${note.lines.map((l) => `<p>${esc(l)}</p>`).join('')}
      <div class="row"><button type="button" class="act" id="cn-copy">Copy</button><button type="button" class="act" id="cn-jarvis">Show on Jarvis</button></div><p class="note" id="cn-msg" role="status"></p></div></section>
    <section class="plus" id="cn-if"><h3>What would the Council say if...</h3>
      <p class="note">Move a god's vote and watch the verdict. It uses the Council's own rule: the mean of the votes, at least 3 voices, risk-on from +0.20, risk-off from -0.20. Nothing is saved.</p>
      <div class="ifout" id="if-out" aria-live="polite"></div>
      ${gods.map((g) => `<label class="ifrow" style="--c:${esc(g.color)}"><span>${esc(g.name)}</span><input type="range" min="-100" max="100" step="5" value="${Math.round(g.vote * 100)}" data-god="${esc(g.key)}" aria-label="${esc(g.name)} vote"><b data-v="${esc(g.key)}">${fmt(g.vote)}</b><button type="button" class="sit" data-sit="${esc(g.key)}" aria-pressed="false" title="Sit this god out">out</button></label>`).join('')}
      <div class="row"><button type="button" class="act" id="if-on">All risk-on</button><button type="button" class="act" id="if-off">All risk-off</button><button type="button" class="act" id="if-reset">Reset</button></div></section>
    <section class="plus" id="cn-tl"><h3>Verdict timeline</h3>
      <div class="tlbar" role="img" aria-label="The last regimes of the Council, oldest to newest">${runs.slice().reverse().map((r) => `<i style="flex:${r.n};background:${VERDICT[r.label]}" title="${esc(r.label)} for about ${r.weeks} week${r.weeks === 1 ? '' : 's'}"></i>`).join('')}</div>
      <ol class="tl">${runs.map((r, k) => `<li style="--c:${VERDICT[r.label]}"><b>${esc(r.label)}</b><span>${k === 0 ? 'now, ' : ''}about ${r.weeks} week${r.weeks === 1 ? '' : 's'} (${r.n} reading${r.n === 1 ? '' : 's'})</span><em>${r.peak >= 0.4 ? 'strong' : r.peak >= 0.2 ? 'clear' : 'faint'}</em></li>`).join('')}</ol>
      <p class="note">Runs of the same verdict across the last year, newest first. A flip is the Council changing its mind. ${(hooks.flips || []).length ? 'Flips seen on this phone: ' + hooks.flips.slice(0, 4).map((f) => `${esc(f.from)} to ${esc(f.to)}`).join(', ') + '.' : 'No flips seen on this phone yet.'}</p></section>`;
  anchor.insertAdjacentHTML('beforebegin', html);
  const out = root.querySelector('#if-out'), over = {};
  const sliders = [...root.querySelectorAll('#cn-if input[type=range]')];
  const paint = () => {
    const r = whatIf(d, over), now = d.council;
    const col = VERDICT[r.label] || '#8a8798', delta = r.gauge == null || now.gauge == null ? '' : ` (${r.gauge - now.gauge >= 0 ? '+' : ''}${r.gauge - now.gauge} vs now)`;
    out.innerHTML = `<span style="color:${col}" class="ifl">${esc(r.label)}</span><span class="ifg">${r.gauge == null ? 'needs at least 3 voices' : r.gauge + ' / 100' + delta}</span><span class="ifb"><em style="${bar(r.score == null ? 0 : r.score)};background:${col}"></em></span>`;
    out.dataset.label = r.label; out.dataset.gauge = String(r.gauge);
    hooks.preview?.(r);
  };
  sliders.forEach((s) => s.addEventListener('input', () => { over[s.dataset.god] = +s.value / 100; root.querySelector(`[data-v="${s.dataset.god}"]`).textContent = fmt(+s.value / 100); paint(); }));
  root.querySelectorAll('[data-sit]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.sit, out_ = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', String(out_));
    if (out_) over[k] = null; else { const s = root.querySelector(`input[data-god="${k}"]`); over[k] = +s.value / 100; }
    b.closest('.ifrow').classList.toggle('out', out_); paint();
  }));
  const setAll = (v) => { sliders.forEach((s) => { s.value = String(v * 100); over[s.dataset.god] = v; root.querySelector(`[data-v="${s.dataset.god}"]`).textContent = fmt(v); }); root.querySelectorAll('[data-sit]').forEach((b) => { b.setAttribute('aria-pressed', 'false'); b.closest('.ifrow').classList.remove('out'); }); paint(); };
  root.querySelector('#if-on').addEventListener('click', () => setAll(0.8));
  root.querySelector('#if-off').addEventListener('click', () => setAll(-0.8));
  root.querySelector('#if-reset').addEventListener('click', () => {
    for (const k of Object.keys(over)) delete over[k];
    sliders.forEach((s) => { const g = gods.find((x) => x.key === s.dataset.god); s.value = String(Math.round(g.vote * 100)); root.querySelector(`[data-v="${g.key}"]`).textContent = fmt(g.vote); });
    root.querySelectorAll('[data-sit]').forEach((b) => { b.setAttribute('aria-pressed', 'false'); b.closest('.ifrow').classList.remove('out'); });
    paint();
  });
  paint();
  const msg = root.querySelector('#cn-msg');
  root.querySelector('#cn-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(note.text); msg.textContent = 'Copied.'; } catch (_) { msg.textContent = 'Could not copy here. Select the text instead.'; }
  });
  root.querySelector('#cn-jarvis').addEventListener('click', () => { hooks.jarvis?.(note); msg.textContent = window.parent === window ? 'Open Pantheon inside Jarvis to put this on her card.' : 'Sent to Jarvis.'; });
}
