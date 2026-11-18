// PLUTUS extras (2026-11-04): the goal tracker with milestones, the payout calendar, the monthly income waterfall and the "what if I add an
// account" preview, drawn with the OLYMPUS effects library (olympus/fx-*.js: progress ring with a comet tip, count-up, confetti, sparkles,
// odometer). The numbers come from plutuscore.js (milestones, payoutCalendar, waterfall, whatIf); this file is the screen only.
// Never blank: with no accounts every block says what to do; without the effects library (or on LITE / off / reduced motion) every block
// still draws, just without the motion. All the markup is static in index.html, so the effect handles live as long as the page.
import { milestones, payoutCalendar, waterfall, whatIf, usd, esc } from './plutuscore.js';

const $ = (id) => document.getElementById(id);
const FX = () => window.OLYMPUS_FX || null;
const mo = (k) => (k == null ? 'not inside the horizon' : k < 0.05 ? 'now' : 'month ' + k.toFixed(1));
const handles = { ring: null, celebrated: false, pick: null, count: null };

/** the goal tracker: a ring of the run-rate coverage and the milestones with the month each is reached */
function goal(S, P) {
  const m = milestones(P, S.st.goal), ring = $('goalring');
  const cov = m.coverage == null ? 0 : Math.min(1, m.coverage);
  $('goalpct').textContent = m.goal ? Math.round((m.coverage || 0) * 100) + '%' : '-';
  $('goaltxt').textContent = !P.accounts ? 'Pick an account on the Plan tab.' : m.goal
    ? `${usd(P.steady)} a month once running, against your ${usd(m.goal)} goal.${m.coverage >= 1 ? ' Covered.' : P.need ? ` About ${P.need} accounts of this mix would cover it.` : ''}`
    : 'Set a goal on the Plan tab and this ring fills toward it. Until then: money milestones.';
  ring.setAttribute('aria-label', m.goal ? `Goal coverage ${Math.round((m.coverage || 0) * 100)} percent` : 'No goal set');
  const fx = FX();
  if (fx && fx.progressRing) {
    if (!handles.ring || handles.ring.stopped) handles.ring = fx.progressRing(ring, { value: cov, stroke: 7 }); else handles.ring.set(cov);
  }
  $('miles').innerHTML = m.items.map((i) => `<li class="${i.month != null ? 'done' : ''}"><i aria-hidden="true"></i><span>${esc(i.label)}${i.target ? ' (' + usd(i.target) + ')' : ''}</span><b>${mo(i.month)}</b></li>`).join('');
  if (m.goal && m.coverage >= 1 && !handles.celebrated) {                  // the goal is covered: one celebration per visit
    handles.celebrated = true;
    if (fx && fx.confetti) fx.confetti($('goalring'), { count: 120 });
  } else if (!m.goal || m.coverage < 1) handles.celebrated = false;
  return m;
}

/** the payout calendar: one cell per month, the payout, the fees due and who pays for the first time */
function calendar(S, P) {
  if (!P.accounts) { $('cal').innerHTML = '<p class="line">Pick at least one account to see when the payouts land.</p>'; return []; }
  const cal = payoutCalendar(S.doc, S.st.counts, { span: S.st.span, months: S.st.months, haircut: S.st.haircut / 100 });
  $('cal').innerHTML = cal.map((r) => `<div class="cell ${r.payout > 0.5 ? 'pay' : ''}"><span>Month ${r.k}</span><b>${r.payout > 0.5 ? usd(r.payout) : '-'}</b>`
    + (r.fees > 0.5 ? `<em>fees ${usd(r.fees)}</em>` : '<em>no fees due</em>') + (r.first.length ? `<small>first payout: ${esc(r.first.join(', '))}</small>` : '') + '</div>').join('');
  return cal;
}

/** the monthly income waterfall: payouts up, fees down, the running total */
function fall(S, P) {
  if (!P.accounts) { $('fall').innerHTML = '<p class="line">Pick at least one account for the monthly waterfall.</p>'; return []; }
  const w = waterfall(S.doc, S.st.counts, { span: S.st.span, months: S.st.months, haircut: S.st.haircut / 100, tax: S.st.tax / 100 });
  const mx = Math.max(1, ...w.map((r) => Math.max(r.payout, r.fees)));
  $('fall').innerHTML = w.map((r) => `<div class="wf"><span class="wk">${r.k === 0 ? 'Buy' : r.k}</span><div class="bars"><i class="up" style="width:${(100 * r.payout / mx).toFixed(1)}%"></i><i class="dn" style="width:${(100 * r.fees / mx).toFixed(1)}%"></i></div>`
    + `<span class="wd ${r.delta >= 0 ? 'pos' : 'neg'}">${r.delta >= 0 ? '+' : ''}${usd(r.delta)}</span><b class="${r.total >= 0 ? 'pos' : 'neg'}">${usd(r.total)}</b></div>`).join('');
  return w;
}

/** "what if I add an account": a row per plan with room; the chosen one is previewed with a count-up and a before / after bar */
function what(S, P, add) {
  if (!P.accounts) { $('whatif').innerHTML = '<p class="line">Add one account first; then see here what a second one does to the month and to the bad week.</p>'; return []; }
  const list = whatIf(S.doc, S.st.counts, { span: S.st.span, months: S.st.months, haircut: S.st.haircut / 100, tax: S.st.tax / 100, goal: S.st.goal });
  if (!list.length) { $('whatif').innerHTML = '<p class="line">Every plan is at its cap. That is the biggest this planner models.</p>'; return list; }
  if (!list.some((x) => x.id === handles.pick)) handles.pick = list[0].id;
  const cur = list.find((x) => x.id === handles.pick), top = Math.max(P.avg6, cur.next.avg6, 1);
  $('whatif').innerHTML = `<div class="wirows">${list.map((x) => `<button type="button" class="wirow" data-pick="${x.id}" aria-pressed="${x.id === handles.pick}"><span>${esc(x.name)}</span><b class="${x.dPerMonth >= 0 ? 'pos' : 'neg'}">${x.dPerMonth >= 0 ? '+' : ''}${usd(x.dPerMonth)}/mo</b></button>`).join('')}</div>`
    + `<div class="wiprev"><div class="wibar"><span>Now</span><i style="width:${(100 * Math.max(0, P.avg6) / top).toFixed(1)}%"></i><b>${usd(P.avg6)}</b></div>`
    + `<div class="wibar plus"><span>With it</span><i id="wiafter" style="width:${(100 * Math.max(0, cur.next.avg6) / top).toFixed(1)}%"></i><b id="wival">${usd(cur.next.avg6)}</b></div>`
    + `<p class="line">One more ${esc(cur.name)} costs ${usd(cur.dUpfront)} up front. A month goes ${cur.dPerMonth >= 0 ? 'up' : 'down'} by <b id="widelta" data-to="${cur.dPerMonth.toFixed(2)}">${usd(Math.abs(cur.dPerMonth))}</b> in the first ${P.months} months; `
    + `the bad case at month ${P.months} moves ${usd(cur.dP10M)}${cur.dUnder6 == null ? '' : `; the chance of being under water at month ${Math.min(6, P.months)} moves ${cur.dUnder6 >= 0 ? '+' : ''}${cur.dUnder6.toFixed(1)} points`}. Same trades on one more account: more money and a bigger bad week.</p>`
    + `<button type="button" class="addit" id="addit" data-add="${cur.id}">Add it to my plan</button></div>`;
  const fx = FX();
  document.querySelectorAll('#whatif [data-pick]').forEach((b) => b.addEventListener('click', () => { handles.pick = b.dataset.pick; what(S, P, add); const f = FX(); if (f && f.sparkleBurst) f.sparkleBurst(b, { count: 18 }); }));
  const btn = $('addit');
  if (btn) btn.addEventListener('click', () => { const f = FX(); if (f && f.sparkleBurst) f.sparkleBurst(btn, { count: 28 }); add(btn.dataset.add); });
  if (fx && fx.countUp) {                                               // the delta counts up from zero each time a plan is picked
    if (handles.count) handles.count.stop();
    const d = $('widelta');
    handles.count = fx.countUp(d, { to: Math.abs(cur.dPerMonth), prefix: '$', decimals: 0, group: true, duration: 0.9 });
  }
  return list;
}

/** redraw every extra block for the current plan; add(planId) adds one account to the plan */
export function renderExtras(S, P, add) {
  try { goal(S, P); calendar(S, P); fall(S, P); what(S, P, add); } catch (e) { S.errors.push('extras: ' + (e && e.message)); }
}

/** the vault's own effects (dust, light shafts, fireflies in gold) on its three.js scene; tiers and cleanup are the library's */
export async function vaultFx(vault) {
  const fx = FX();
  if (!fx || !vault || vault.lite) return null;
  try {
    await Promise.all(['fx-sky.js', 'fx-weather.js'].map((f) => import('../olympus/' + f + '?v=f1')));
    const t = { scene: vault.scene, camera: vault.camera, renderer: vault.renderer };
    return [fx.dust(t, { color: '#e0b060', box: [14, 6, 6], center: [0, 2.6, 0], count: 500 }), fx.godRays(t, { position: [0, 9.5, -2], color: '#e0b060', intensity: 0.45, length: 10, count: 6 }),
      fx.fireflies(t, { color: '#e0b060', color2: '#e0b060', box: [10, 4, 5], center: [0, 2.2, 0], count: 40 })];
  } catch (e) { return null; }
}
