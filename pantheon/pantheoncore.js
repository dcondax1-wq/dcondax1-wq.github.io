// PANTHEON core: load pantheon.json (or the demo fixture), format numbers, and build the cards' HTML (pure: no DOM reads,
// no three.js). The page module (pantheon.js) puts these strings into the cards and draws the hall.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d));
const sgn = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : (x >= 0 ? '+' : '') + x.toFixed(d));

export const LEAN = {
  'risk-on': { cls: 'on', text: 'RISK-ON', hex: '#9bab63' },
  'risk-off': { cls: 'off', text: 'RISK-OFF', hex: '#d0715a' },
  neutral: { cls: 'mid', text: 'NEUTRAL', hex: '#e0b060' },
  caution: { cls: 'caution', text: 'CAUTION', hex: '#6f9bb8' },
  offline: { cls: 'dead', text: 'OFFLINE', hex: '#8a8070' },
};
export const VERDICT = { 'RISK-ON': '#9bab63', 'RISK-OFF': '#d0715a', MIXED: '#e0b060', SILENT: '#8a8070' };
/** AGORA: each god keeps one calm, warm colour (the build's own neon values are replaced on load) */
export const GOD_COLOR = { poseidon: '#6b9bb8', zeus: '#d9b45a', ares: '#c9664a', athena: '#b7ab94', demeter: '#9bab63', helios: '#e0a050', nyx: '#9a86a0', artemis: '#d8d0c0' };
export const calmColor = (g) => GOD_COLOR[g && g.key] || '#cfc4b2';

function valid(d) {
  return d && d.app === 'pantheon' && Array.isArray(d.gods) && d.gods.length && d.council;
}

/** pantheon.json, else the demo fixture (marked demo); `force === 'demo'` skips the real file */
export async function loadPantheon(url = 'pantheon.json', force) {
  const get = async (u) => {
    const r = await fetch(u, { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    if (!valid(d)) throw new Error('bad ' + u);
    d.gods.forEach((g) => { g.color = calmColor(g); });
    return d;
  };
  if (force !== 'demo') {
    try { return await get(url); } catch (e) { /* the demo below */ }
  }
  const d = await get('fixture.json');
  d.demo = true;
  return d;
}

/** inline SVG sparkline of values (null gaps skipped) */
export function sparkSvg(vals, color) {
  const v = (vals || []).map((x, i) => [i, x]).filter(([, x]) => x != null && Number.isFinite(x));
  if (v.length < 2) return '';
  const xs = v.map(([i]) => i), ys = v.map(([, y]) => y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const W = 300, H = 46, P = 3;
  const px = (i) => P + (W - 2 * P) * (i - x0) / Math.max(1, x1 - x0);
  const py = (y) => H - P - (H - 2 * P) * (y - y0) / Math.max(1e-12, y1 - y0);
  const pts = v.map(([i, y]) => `${px(i).toFixed(1)},${py(y).toFixed(1)}`).join(' ');
  const last = v[v.length - 1];
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <polyline points="${P},${H - P} ${pts} ${W - P},${H - P}" fill="${color}" fill-opacity=".12" stroke="none"/>
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
    <circle cx="${px(last[0]).toFixed(1)}" cy="${py(last[1]).toFixed(1)}" r="3.5" fill="${color}"/></svg>`;
}

/** ZEUS: today's Treasury curve, 1 month -> 30 years */
export function curveSvg(c, color) {
  if (!c || !c.yields || c.yields.length < 3) return '';
  const y = c.yields, W = 300, H = 70, P = 6, lo = Math.min(...y) - 0.1, hi = Math.max(...y) + 0.1;
  const px = (i) => P + (W - 2 * P) * i / (y.length - 1), py = (v) => H - 14 - (H - 22) * (v - lo) / (hi - lo);
  const pts = y.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
  const lab = [0, Math.floor(y.length / 2), y.length - 1].map((i) => `<text x="${px(i).toFixed(0)}" y="${H - 2}" fill="#cfc4b2" font-size="10"
    text-anchor="${i === 0 ? 'start' : i === y.length - 1 ? 'end' : 'middle'}">${esc(c.tenors[i])} ${y[i].toFixed(2)}%</text>`).join('');
  return `<svg class="curve" viewBox="0 0 ${W} ${H}" aria-label="Treasury yield curve ${esc(c.date)}">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round"/>
    ${y.map((v, i) => `<circle cx="${px(i).toFixed(1)}" cy="${py(v).toFixed(1)}" r="2.4" fill="${color}"/>`).join('')}${lab}</svg>`;
}

/** the council's half-circle gauge, 0 (risk-off) .. 100 (risk-on) */
export function gaugeSvg(g, label) {
  const col = VERDICT[label] || VERDICT.SILENT;
  const a = Math.PI * (1 - (g == null ? 50 : g) / 100), R = 110, cx = 150, cy = 130;
  const arc = (from, to, c) => {
    const p = (t) => [cx + R * Math.cos(Math.PI * (1 - t)), cy - R * Math.sin(Math.PI * (1 - t))];
    const [x0, y0] = p(from), [x1, y1] = p(to);
    return `<path d="M${x0.toFixed(1)},${y0.toFixed(1)} A${R},${R} 0 0 1 ${x1.toFixed(1)},${y1.toFixed(1)}" stroke="${c}" stroke-width="14" fill="none" stroke-linecap="butt" opacity=".85"/>`;
  };
  const nx = cx + (R - 22) * Math.cos(a), ny = cy - (R - 22) * Math.sin(a);
  return `<svg class="gauge" viewBox="0 0 300 150" aria-label="Council gauge ${g ?? '—'} of 100: ${esc(label)}">
    ${arc(0, 0.4, '#d0715a')}${arc(0.4, 0.6, '#e0b060')}${arc(0.6, 1, '#9bab63')}
    <line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="${col}" stroke-width="4" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="8" fill="${col}"/>
    <text x="${cx}" y="${cy - 34}" text-anchor="middle" fill="${col}" font-size="30" font-weight="700" font-family="'SF Pro Rounded',-apple-system,sans-serif">${g ?? '—'}</text>
    <text x="20" y="148" fill="#cfc4b2" font-size="11">RISK-OFF</text><text x="280" y="148" fill="#cfc4b2" font-size="11" text-anchor="end">RISK-ON</text></svg>`;
}

const pctText = (g) => (g.pct == null ? '' : `${num(g.pct, 0)}th percentile vs ${g.pct_years >= 4.5 ? '5' : num(g.pct_years, 1)} years`);

function relTable(st) {
  if (!st || !st.periods) return '';
  if (st.periods[0] && 'ratio' in st.periods[0]) {
    return `<table aria-label="NQ moves on event days"><thead><tr><th>Period</th><th>Event days</th><th>Avg |move|</th><th>Other days</th><th>Ratio</th></tr></thead><tbody>
      ${st.periods.map((r) => `<tr><td>${esc(r.period)}</td><td>${r.n_on}</td><td>${num(r.abs_on)}%</td><td>${num(r.abs_off)}%</td><td>${r.ratio == null ? '—' : num(r.ratio) + 'x'}</td></tr>`).join('')}</tbody></table>`;
  }
  return `<table aria-label="How the vote related to NQ next-day returns"><thead><tr><th>Period</th><th>Days</th><th>Corr</th><th>Hit</th><th>Chance</th><th>On / off avg</th></tr></thead><tbody>
    ${st.periods.map((r) => `<tr><td>${esc(r.period)}</td><td>${r.n}</td><td class="${r.corr > 0.05 ? 'up' : r.corr < -0.05 ? 'down' : ''}">${sgn(r.corr, 2)}</td>
      <td>${r.hit == null ? '—' : num(r.hit, 1) + '%'}</td><td>${r.chance == null ? '—' : num(r.chance, 1) + '%'}</td>
      <td>${sgn(r.avg_on, 2)} / ${sgn(r.avg_off, 2)}%</td></tr>`).join('')}</tbody></table>`;
}

/** a god's card: {title, meta, body} */
export function godCard(g) {
  const L = LEAN[g.lean] || LEAN.neutral;
  const srcs = (g.sources || []).map((s) => `<p class="src"><b>${esc(s.name)}</b> · ${esc(s.from || 'missing')}${s.newest ? ' · to ' + esc(s.newest) : ''}</p>`).join('');
  const subs = (g.subs || []).length ? `<table aria-label="More readings"><tbody>${g.subs.map((s) => `<tr><td>${esc(s.label)}</td><td>${esc(s.value)}</td></tr>`).join('')}</tbody></table>` : '';
  const now = (g.states_now || []).length ? `<h3>Regime now</h3><div class="chips">${g.states_now.map((s) => `<span>${esc(s)}</span>`).join('')}</div>` : '';
  const up = (g.extra && g.extra.upcoming) || [];
  const cal = up.length ? `<h3>Coming up (ET)</h3><table aria-label="Coming up"><tbody>${up.map((e) => `<tr><td>${esc(e.event)}</td><td>${esc(e.when)}</td></tr>`).join('')}</tbody></table>` : '';
  const curve = g.extra && g.extra.curve ? `<h3>Treasury curve ${esc(g.extra.curve.date)}</h3>${curveSvg(g.extra.curve, g.color)}` : '';
  const pct = g.pct == null ? '' : `<div class="pct" aria-label="${esc(pctText(g))}"><em style="left:${Math.max(0, Math.min(100, g.pct))}%"></em></div>
    <div class="pctl"><span>5-yr low</span><span>${esc(pctText(g))}</span><span>high</span></div>`;
  const body = !g.ok ? `<p class="mean">${esc(g.meaning)}</p>${srcs}` : `
    ${g.futures ? '' : '<p class="warnline">Not futures data: display only</p>'}
    <div class="read"><b>${esc(g.reading.text)}</b><i class="${(g.change.value ?? 0) >= 0 ? '' : ''}">${esc(g.change.text)}${g.change.window ? ' · ' + esc(g.change.window) : ''}</i>
      <span class="lean ${L.cls}">${L.text}</span></div>
    ${pct}${sparkSvg(g.spark, g.color)}
    <p class="mean">${esc(g.meaning)}</p>
    <p class="honest ${g.stats && g.stats.holds ? 'holds' : ''}">${esc(g.honesty)}</p>
    ${now}${cal}${curve}${subs}
    <h3>Against NQ futures (next session)</h3>${relTable(g.stats)}
    <h3>Source</h3>${srcs}
    <p class="note">${esc(g.name)}: ${esc(g.why)}. Published ${g.lag_days ? g.lag_days + ' business day' + (g.lag_days > 1 ? 's' : '') + ' after its date' : 'the same day'}; the history above only uses what was out before each session.</p>`;
  return { title: g.name, meta: `${g.title}${g.asof ? ' · as of ' + g.asof : ''}${g.council ? ' · votes in the council' : ' · no council vote'}`, body };
}

/** the council panel's HTML */
export function councilHtml(d) {
  const c = d.council;
  const votes = d.gods.filter((g) => g.council).map((g) => {
    const v = g.vote, w = v == null ? 0 : Math.abs(v) * 50, left = v == null ? 50 : v >= 0 ? 50 : 50 - w;
    const col = v == null ? '#8a8070' : v >= 0.25 ? '#9bab63' : v <= -0.25 ? '#d0715a' : '#e0b060';
    return `<div class="vote"><span style="color:${g.color}">${esc(g.name)}</span><span class="bar"><em style="left:${left}%;width:${w}%;background:${col}"></em></span><span>${sgn(v, 2)}</span></div>`;
  }).join('');
  const edge = (h, c) => (h == null || c == null ? '—' : sgn(h - c, 1));
  const tag = (r) => (r.holds ? '<span class="vt up">signal</span>' : r.inverse ? '<span class="vt down">inverse</span>' : '<span class="vt">context</span>');
  const rows = (d.relation || []).map((r) => 'corr_a' in r
    ? `<tr><td>${esc(r.god)}<br>${tag(r)}</td><td>${sgn(r.corr_a, 2)}</td><td>${sgn(r.corr_b, 2)}</td><td>${edge(r.hit_a, r.chance_a)}</td><td>${edge(r.hit_b, r.chance_b)}</td></tr>`
    : `<tr><td>${esc(r.god)}<br>${tag(r)}</td><td colspan="2">event-day move ${r.ratio_a == null ? '—' : num(r.ratio_a) + 'x'}</td><td colspan="2">${r.ratio_b == null ? '—' : num(r.ratio_b) + 'x'} (2026)</td></tr>`).join('');
  const src = (d.sources || []).map((s) => `<tr><td>${esc(s.id)}</td><td class="${s.from === 'network' || s.from === 'fixture' ? 'up' : s.from === 'missing' ? 'down' : ''}">${esc(s.from)}</td><td>${esc(s.newest || '—')}</td></tr>`).join('');
  const skipped = (d.skipped || []).map((s) => `<li><b>${esc(s.name)}</b>: ${esc(s.why)}</li>`).join('');
  return `${gaugeSvg(c.gauge, c.label)}
    <p class="mean" style="text-align:center;color:${VERDICT[c.label] || '#fff'}">${esc(c.label)}</p>
    <p class="mean">${esc(c.text)}</p>
    ${c.caution ? `<p class="honest" style="color:var(--aegean)">${esc(c.caution)}</p>` : ''}
    <p class="honest ${c.stats && c.stats.holds ? 'holds' : ''}">${esc(c.honesty || '')}</p>
    <h3>Verdict history</h3>${historyHtml(d)}
    <h3>The votes (risk-off −1 … +1 risk-on)</h3>${votes}
    <p class="note">ATHENA (the calendar) has no direction and ARTEMIS (crypto) is not futures data: neither votes.</p>
    <h3>Honest check: NQ futures next session</h3>
    <div class="tw"><table aria-label="Every god against NQ"><thead><tr><th>God</th><th>Corr<br>21-25</th><th>Corr<br>2026</th><th>Edge<br>21-25</th><th>Edge<br>2026</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="note">Corr: the vote vs NQ's next-session return. Edge: hit rate minus chance, in points (risk-on vote then NQ up, risk-off then down).</p>
    <p class="note">NQ1! daily (${esc(d.nq.source)}), ${esc(d.nq.first)} → ${esc(d.nq.last)}, ${d.nq.sessions} sessions. ${(d.method || []).map(esc).join(' ')}</p>
    <p class="note"><b>Context, not a signal</b> unless a god holds in both periods. Nothing here changes the bot: paper research and display only.</p>
    <h3>Sources tonight</h3><div class="tw"><table aria-label="Sources"><thead><tr><th>Source</th><th>From</th><th>Newest</th></tr></thead><tbody>${src}</tbody></table></div>
    <h3>Skipped</h3><ul class="note">${skipped}</ul>
    <p class="note">Built ${esc(d.built)} · next session ${esc(d.next_session)} · refreshed nightly by CRONOS.</p>`;
}

/** The Council's regime verdict history from council.spark (daily scores, the last year, about 64 samples, oldest first):
 *  {cells: [{score, label}], counts: {RISK-ON, MIXED, RISK-OFF}, streak: {label, n}, flips} (RISK-ON at >= +0.20, RISK-OFF at <= -0.20,
 *  the build's own rule). Empty when the build carries no history. */
export function verdictHistory(d) {
  const raw = ((d && d.council && d.council.spark) || []).filter((x) => typeof x === 'number' && isFinite(x));
  const lab = (s) => (s >= 0.2 ? 'RISK-ON' : s <= -0.2 ? 'RISK-OFF' : 'MIXED');
  const cells = raw.map((score) => ({ score, label: lab(score) }));
  const counts = { 'RISK-ON': 0, MIXED: 0, 'RISK-OFF': 0 };
  cells.forEach((c) => { counts[c.label]++; });
  let n = 0, flips = 0;
  for (let i = cells.length - 1; i >= 0 && cells[i].label === cells[cells.length - 1].label; i--) n++;
  for (let i = 1; i < cells.length; i++) if (cells[i].label !== cells[i - 1].label) flips++;
  return { cells, counts, streak: cells.length ? { label: cells[cells.length - 1].label, n } : null, flips };
}

/** the verdict history as HTML: one coloured tick per reading (height = strength), what share of the year each verdict held */
export function historyHtml(d) {
  const h = verdictHistory(d);
  if (!h.cells.length) return '<p class="note">No verdict history in this build yet.</p>';
  const tot = h.cells.length, pc = (k) => Math.round((100 * h.counts[k]) / tot);
  const ticks = h.cells.map((c) => `<i style="height:${Math.round(18 + 70 * Math.min(1, Math.abs(c.score) / 0.6))}%;background:${VERDICT[c.label]}" title="${esc(c.label)} ${c.score > 0 ? '+' : ''}${c.score.toFixed(2)}"></i>`).join('');
  return `<div class="vh" role="img" aria-label="Council verdict over the last year, oldest to newest">${ticks}</div>
    <p class="note vh-sum"><b style="color:${VERDICT['RISK-ON']}">risk-on ${pc('RISK-ON')}%</b> · <b style="color:${VERDICT.MIXED}">mixed ${pc('MIXED')}%</b> · <b style="color:${VERDICT['RISK-OFF']}">risk-off ${pc('RISK-OFF')}%</b>
    · now ${esc(h.streak.label)} for ${h.streak.n} reading${h.streak.n === 1 ? '' : 's'} · ${h.flips} flip${h.flips === 1 ? '' : 's'} in the year</p>
    <p class="note">Each tick is one council reading (about four sessions apart across the last 12 months); taller = a stronger lean. Context, not a signal.</p>`;
}

/** the strip chip value of a god */
export function chipValue(g) {
  if (!g.ok) return 'offline';
  const n = g.extra && g.extra.next;
  if (g.key === 'athena' && n) return n.days === 0 ? 'event today' : n.days === 1 ? 'event tomorrow' : `in ${n.days} days`;
  return g.reading.text;
}
