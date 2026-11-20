// PLUTUS: the vault. One gold column per month = the money the plan has made by then, after fees (red below the floor while the
// fees are still unpaid); the blue ghost beside it is the bad case (1 in 10); a small ring marks your goal. Tap-drag to turn it.
// All numbers come from plutuscore.js; this file is the screen.
import * as THREE from '../jarvis/three.module.min.js';
import * as CORE from './plutuscore.js';
import { loadPlans, project, siteFacts, SPANS, usd, esc, num } from './plutuscore.js';
import { renderExtras, vaultFx } from './plutusfx.js';
import { renderPlus } from './plutusplus.js';
import { startRoadmap } from './plutusroadmap.js';             // the Money plan card (roadmap.json, 12 months)
import * as AT from '../olympus/fx-atmos.js';                       // JOB 4+5 follow-up: light shafts, gold embers, contact shadow, a studio environment for the metals
import { RoomEnvironment } from '../olympus/three-addons/RoomEnvironment.js';

const O = window.OLYMPUS || null;
const Q = new URLSearchParams(location.search);
const RM = O ? O.reduced() : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const $ = (id) => document.getElementById(id);
const KEY = 'plutus.v1';
const DEFAULTS = { span: 'H2', counts: { mffu_builder_50k: 1, mffu_builder_25k: 0, lucid_pro_50k: 1, fn_rapid_daily_50k: 1 }, months: 6, haircut: 0, tax: 0, goal: '' };
const S = { doc: null, st: { ...DEFAULTS }, site: null, facts: null, hall: null, errors: [], tab: 'plan', P: null };

function loadState() {
  let st = {};
  try { st = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { st = {}; }
  S.st = { ...DEFAULTS, ...st, counts: { ...DEFAULTS.counts, ...(st.counts || {}) } };
  if (!S.doc.spans[S.st.span]) S.st.span = 'H2';
  for (const p of S.doc.plans) S.st.counts[p.id] = Math.max(0, Math.min(p.cap, Math.round(+S.st.counts[p.id] || 0)));
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S.st)); } catch (_) { /* private mode */ } }

const opts = (over = {}) => ({ span: S.st.span, months: S.st.months, haircut: S.st.haircut / 100, tax: S.st.tax / 100, goal: S.st.goal, ...over });
const compute = () => (S.P = project(S.doc, S.st.counts, opts()));
const sgn = (v) => (v >= 0 ? 'pos' : 'neg');

function renderPlan() {
  $('spans').innerHTML = SPANS.filter((k) => S.doc.spans[k] && S.doc.plans.every((p) => p.spans[k])).map((k) => `<button type="button" data-span="${k}" aria-pressed="${S.st.span === k}">${esc(S.doc.spans[k])}</button>`).join('');
  $('spans').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { S.st.span = b.dataset.span; save(); update(); }));
  $('accts').innerHTML = S.doc.plans.map((p) => {
    const n = S.st.counts[p.id] || 0, sp = p.spans[S.st.span] || p.spans.H2;
    return `<div class="acct"><div class="nm"><b>${esc(p.firm)} ${esc(p.name)}</b><span>${usd(p.price, p.price % 1 ? 2 : 0)} each · ${sp.p10 != null ? `${Math.round(sp.p10)}% pass in 2 weeks` : 'eval'} · max ${p.cap}</span></div>`
      + `<button type="button" data-dec="${p.id}" aria-label="Fewer ${esc(p.name)}" ${n <= 0 ? 'disabled' : ''}>−</button><span class="ct" data-n="${p.id}">${n}</span><button type="button" data-inc="${p.id}" aria-label="More ${esc(p.name)}" ${n >= p.cap ? 'disabled' : ''}>+</button></div>`;
  }).join('') + (S.st.counts.mffu_builder_25k > 0 && S.st.counts.mffu_builder_50k > 0 ? '<p class="warn">MFFU has not said a Builder 25K may sit next to your Builder 50K. Ask them before you buy it.</p>' : '');
  $('accts').querySelectorAll('[data-inc],[data-dec]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.inc || b.dataset.dec, p = S.doc.plans.find((x) => x.id === id);
    S.st.counts[id] = Math.max(0, Math.min(p.cap, (S.st.counts[id] || 0) + (b.dataset.inc ? 1 : -1))); save(); update();
  }));
}

function renderMoney(P) {
  if (!P.accounts) { $('money').innerHTML = '<p class="line">Pick at least one account on the Plan tab.</p>'; return; }
  const trio = S.facts && S.facts.trio && S.facts.trio[S.st.span];
  const isTrio = S.doc.plans.every((p) => (S.st.counts[p.id] || 0) === (p.id === 'mffu_builder_25k' ? 0 : 1)) && S.st.months === 6 && !S.st.haircut && !S.st.tax;
  const check = isTrio && trio ? `<p class="line">${Math.round(P.avg6) === Math.round(trio.net_per_month) ? 'Matches' : 'Differs from'} the trio on the published site: ${usd(trio.net_per_month)} a month.</p>` : '';
  const every = P.months > 6 ? [0, 1, 2, 3, 4, 5, 6, 8, 10, 12].filter((k) => k <= P.months) : [0, 1, 2, 3, 4, 5, 6].filter((k) => k <= P.months);
  $('money').innerHTML = `<div class="stat"><div><b>${usd(P.upfront, 0)}</b><span>up front (first evals)</span></div><div><b>${P.payback == null ? 'not yet' : P.payback < 0.1 ? 'now' : 'month ' + P.payback.toFixed(1)}</b><span>back in profit</span></div>`
    + `<div><b>${usd(P.avg6)}</b><span>a month, first 6 months</span></div><div><b>${usd(P.steady)}</b><span>a month once running (months 4-6)</span></div></div>` + check
    + `<table><thead><tr><th>Month</th><th>You have</th><th>Bad case</th></tr></thead><tbody>${every.map((k) => `<tr><td>${k === 0 ? 'Buy' : k}</td><td class="${sgn(P.mean[k])}">${usd(P.mean[k])}</td><td class="${sgn(P.p10[k])}">${usd(P.p10[k])}</td></tr>`).join('')}</tbody></table>`
    + `<table style="margin-top:12px"><thead><tr><th>Account</th><th>x</th><th>Up front</th><th>Months 4-6</th></tr></thead><tbody>${P.rows.map((r) => `<tr><td>${esc(r.firm)} ${esc(r.name)}</td><td>${r.n}</td><td>${usd(r.upfront)}</td><td class="${sgn(r.steady)}">${usd(r.steady * r.n)}</td></tr>`).join('')}</tbody></table>`
    + (P.goal ? `<p class="line">${P.steady >= P.goal ? `Your ${usd(P.goal)} a month goal is covered once running.` : P.need ? `For ${usd(P.goal)} a month once running you would need about ${P.need} accounts at this mix. Every one is the same trades, so it is also ${P.need}x the bad week.` : ''}</p>` : '')
    + `<p class="src">After fees${P.tax ? ' and ' + Math.round(P.tax * 100) + '% set aside for tax (not tax advice)' : ''}${P.haircut ? ', with the bot ' + Math.round(P.haircut * 100) + '% worse than the study' : ''}. Months 1-6 are measured; later months continue at the months 4-6 rate.</p>`;
}

function renderRisk(P) {
  if (!P.accounts) { $('risk').innerHTML = '<p class="line">Pick at least one account on the Plan tab.</p>'; return; }
  const ref = SPANS.filter((k) => k !== S.st.span && S.doc.plans.every((p) => p.spans[k])).map((k) => ({ k, P: project(S.doc, S.st.counts, opts({ span: k })) }));
  const worse = project(S.doc, S.st.counts, opts({ haircut: Math.max(S.st.haircut / 100, 0.5) }));
  const lost = P.rows.reduce((a, r) => a + r.n * (r.lost || 0), 0);
  const lines = [
    `<div class="line">Chance of being under water at month ${Math.min(6, P.months)}: about <b>${P.under6 == null ? '-' : Math.round(P.under6)}%</b>${P.rows.length === 1 && P.rows[0].n === 1 ? ` (the study counted ${P.rows[0].neg_6m}%)` : ''}.</div>`,
    `<div class="line">Bad case (1 in 10) at month ${P.months}: <b>${usd(P.p10M)}</b>. Good case (1 in 10): ${usd(P.p90[P.months])}.</div>`,
    `<div class="line">If the bot does 50% worse than the study: <b>${usd(worse.avg6)}</b> a month.</div>`,
    ...ref.map((r) => `<div class="line ${r.P.avg6 < 0 ? 'bad' : ''}">Same plan on ${esc(S.doc.spans[r.k])}: <b>${usd(r.P.avg6)}</b> a month${r.k === '2021-25' ? ' (the bot is tuned and judged on 2026; this is a reference line)' : ''}.</div>`),
    `<div class="line">Copies of one strategy rise and fall together (${(S.doc.corr ?? 0.85).toFixed(2)} correlation); LIT, ATLAS and BLITZ barely move together (${pairsText()}). More accounts of the same strategy means more money and a bigger bad week, not a safer one.</div>`,
    `<div class="line">Expected funded accounts lost in 6 months: ${lost.toFixed(2)}. Eval passed in 2 weeks: ${P.rows.map((r) => `${esc(r.name)} ${r.p10 != null ? Math.round(r.p10) + '%' : '-'}`).join(', ')}.</div>`,
  ];
  $('risk').innerHTML = lines.join('');
}

const pairsText = () => ((S.doc.strategy && S.doc.strategy.corr_pairs) || [{ a: 'LIT', b: 'ATLAS', rho: 0.14 }, { a: 'LIT', b: 'BLITZ', rho: -0.06 }, { a: 'ATLAS', b: 'BLITZ', rho: 0 }])
  .filter((x) => x.a !== 'copies of one strategy').map((x) => `${x.a} x ${x.b} ${x.rho > 0 ? '+' : ''}${x.rho.toFixed(2)}`).join(', ');

/** The three strategies you run (published strategy block of plans.json): money by period, both first-payout counts, the MFFU cap, the 3-account result. */
function strategyBlock() {
  const sa = S.doc.strategy;
  if (!sa) return '';
  const two = (o, d = 0) => (o && o.H1 != null ? `${usd(o.H1, d)} / ${usd(o.H2, d)}` : '-');
  const pair = (o) => (o && o.H1 != null ? `${o.H1} / ${o.H2}` : '-');
  const rows = sa.accounts.map((a) => `<tr><td>${esc(a.name)}<br><small>${usd(a.price, a.price % 1 ? 2 : 0)} each</small></td><td>${two(a.funded_per_month)}${a.funded_label && a.funded_label !== 'funded study' ? `<br><small>${esc(a.funded_label)}</small>` : ''}</td><td>${two(a.net_per_month_from_purchase)}</td>`
    + `<td>${pair(a.first_pay_from_funded)} / ${pair(a.first_pay_from_purchase)}</td><td>${pair(a.eval_2w_pass)} / ${pair(a.eval_2w_fail)}</td></tr>`).join('');
  const t = sa.three_accounts, cap = sa.mffu_caps;
  return '<div class="line"><b>Your three strategies</b> (Jan-Jun / Jul-Oct 2026)</div>'
    + `<table class="strat"><thead><tr><th>Account</th><th>Funded $ a month</th><th>$ a month from purchase, after eval fees</th><th>First payout, sessions: from funded start / from purchase</th><th>Eval in 2 weeks: pass / fail %</th></tr></thead><tbody>${rows}</tbody></table>`
    + `<div class="line">Funded $ a month is the payout stage only (80% to you); the next column starts at the purchase and pays every eval. BLITZ's funded column is an estimate (6-month Monte Carlo at the $150 size; many accounts get stuck with the room too small to pay out), its second column is the research slot.</div>`
    + `<div class="line"><b>${esc(cap.text)}</b></div>`
    + `<div class="line"><b>All three</b> (LIT 50K + ATLAS 25K + BLITZ 25K): <b>${two(t.H1 && { H1: t.H1.per_month, H2: t.H2.per_month })}</b> a month after eval fees in the model (first payout around session ${t.H1.first_payout_session_med} / ${t.H2.first_payout_session_med} from purchase, `
    + `${t.H1.evals_per_month} evals bought a month, ${t.H1.fails_per_month} fails). Honest range: <b>${esc(t.range.text)}</b>. It is a bet on the 2026 market continuing; in 2021-25-type markets every account loses.</div>`;
}

function renderNotes() {
  const f = S.facts || {}, t = f.trades;
  $('notes').innerHTML = `<div class="line">Model: ${esc(S.doc.source)}${S.doc.src === 'embedded' ? ' (plans.json not found, using the copy inside the app: Jul-Oct only)' : ''}.</div>`
    + (S.doc.notes || []).map((n) => `<div class="line">${esc(n)}</div>`).join('')
    + strategyBlock()
    + (t ? `<div class="line"><b>The bot's published record</b> (${esc(t.from)} to ${esc(t.to)}, normal sizing): ${t.n} trades${t.tpw ? `, ${t.tpw.toFixed(1)} a week` : ''}, ${usd(t.net)}${t.pf ? ', profit factor ' + t.pf.toFixed(2) : ''}. The accounts above are sized for each plan, so their dollars differ.</div>` : '<div class="line">The published site data (data.json) was not found, so the bot\'s own record is not shown here.</div>')
    + `<div class="line">Prices are the owner's real one-time prices (Builder 50K $91.80, Builder 25K $63). Other firms' prices are list or discounted prices found in the repo's research, check before buying.</div>`
    + '<div class="line">Paper results from a study. Not a promise, not advice. MFFU wants you present for live trading.</div>';
}

function update() {
  const P = compute();
  $('months').value = S.st.months; $('monthsV').textContent = S.st.months;
  $('haircut').value = S.st.haircut; $('hairV').textContent = S.st.haircut + '%';
  $('tax').value = S.st.tax; $('taxV').textContent = S.st.tax + '%';
  if (document.activeElement !== $('goal')) $('goal').value = S.st.goal;
  const h = $('headline');
  h.dataset.neg = P.accounts && P.per_month_M < 0 ? '1' : '0';
  $('hk').textContent = P.accounts ? usd(P.per_month_M) : '$0';
  $('hs').textContent = P.accounts ? `a month, first ${P.months} months` : 'pick an account';
  $('vline').textContent = P.accounts ? `${P.accounts} account${P.accounts === 1 ? '' : 's'}, ${usd(P.upfront)} up front. ${P.payback == null ? 'Not back in profit inside ' + P.months + ' months.' : P.payback < 0.1 ? '' : 'Back in profit in about ' + P.payback.toFixed(1) + ' months.'} Bad case at month ${P.months}: ${usd(P.p10M)}.` : 'Add an account with + on the Plan tab.';
  renderPlan(); renderMoney(P); renderRisk(P); renderNotes();
  renderExtras(S, P, addAccount);
  try { renderPlus(S, P); } catch (e) { S.errors.push('plus: ' + ((e && e.message) || e)); }
  S.hall?.set(P);
  O?.mode?.(!!(S.hall && S.hall.lite));
}

function addAccount(id) {
  const p = S.doc.plans.find((x) => x.id === id);
  if (!p) return;
  S.st.counts[id] = Math.max(0, Math.min(p.cap, (S.st.counts[id] || 0) + 1)); save(); update();
}

function setTab(t) {
  S.tab = t;
  document.querySelectorAll('.pane').forEach((p) => { p.hidden = p.id !== 'p-' + t; });
  document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === t)));
  $('sheet').scrollTop = 0;
  if (history.replaceState) history.replaceState(null, '', '#' + t);
}
const route = () => { const h = location.hash.slice(1); setTab(['plan', 'money', 'risk', 'notes'].includes(h) ? h : 'plan'); };

function bind() {
  $('months').addEventListener('input', (e) => { S.st.months = +e.target.value; save(); update(); });
  $('haircut').addEventListener('input', (e) => { S.st.haircut = +e.target.value; save(); update(); });
  $('tax').addEventListener('input', (e) => { S.st.tax = +e.target.value; save(); update(); });
  $('goal').addEventListener('input', (e) => { S.st.goal = e.target.value; save(); update(); });
  $('tabs').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  $('headline').addEventListener('click', () => setTab('money'));
  addEventListener('hashchange', route);
}

// ------------------------------------------------------------------------------------------------ the 3D vault
function tex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
const glowTex = () => tex(64, 64, (x) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,.4)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); });
const coinTex = () => tex(128, 128, (x, w) => {
  x.fillStyle = '#c8a24a'; x.fillRect(0, 0, w, w);
  const g = x.createRadialGradient(64, 64, 6, 64, 64, 64); g.addColorStop(0, '#e0b060'); g.addColorStop(1, '#c8a24a'); x.fillStyle = g; x.beginPath(); x.arc(64, 64, 60, 0, 7); x.fill();
  x.strokeStyle = '#c8a24a'; x.lineWidth = 4; x.beginPath(); x.arc(64, 64, 52, 0, 7); x.stroke();
  x.fillStyle = '#c8a24a'; x.font = '700 64px "Iowan Old Style", Palatino, Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('Ρ', 64, 68);
});
const stripeTex = () => { const t = tex(8, 64, (x, w, h) => { for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#c8a24a' : '#e0b060'; x.fillRect(0, i * 8, w, 8); } }); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 1); return t; };
const labelTex = (text, color) => tex(256, 64, (x) => { x.font = '700 30px "Iowan Old Style", Palatino, Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = color; x.fillText(text, 128, 34); });
const MAXC = 13, GAP = 0.62, HMAX = 3.4;

class Vault {
  constructor(canvas) {
    this.lite = Q.get('lite') === '1' || !!(O && O.lite());
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.lite, alpha: true, powerPreference: 'high-performance' });
    O?.track(this.renderer);
    this.renderer.setClearColor(0x14110e, 0);
    this.renderer.setPixelRatio(O ? O.dpr(this.lite) : Math.min(devicePixelRatio || 1, this.lite ? 1.5 : 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 120);
    this.yaw = 0.35; this.pitch = 0.32; this.dist = 20; this.t = 0; this.dirty = true; this.last = performance.now(); this.frames = []; this.n = 0; this.mid = 2.2;
    this.build(); this.resize(); addEventListener('resize', () => this.resize()); this.input(canvas);
  }
  build() {
    const S3 = this.scene;
    S3.add(new THREE.HemisphereLight(0xffe9c8, 0x3a2c1e, 1.1));
    const key = new THREE.PointLight(0xe0b060, 40, 26, 1.5); key.position.set(0, 6, 5); S3.add(key);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(MAXC * GAP + 1.2, 0.2, 2.2), new THREE.MeshStandardMaterial({ color: 0xd8cdb8, roughness: 0.42, metalness: 0.05 }));
    floor.position.y = -0.1; S3.add(floor);
    const stripe = stripeTex();
    this.cols = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.22, 1, 20), new THREE.MeshStandardMaterial({ map: stripe, emissive: 0x9c6b3c, emissiveIntensity: 0.12, roughness: 0.34, metalness: 0.55 }), MAXC);
    this.ghost = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.3, 1, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xe0b060, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }), MAXC);
    this.goalRings = new THREE.InstancedMesh(new THREE.TorusGeometry(0.34, 0.025, 8, 28), new THREE.MeshBasicMaterial({ color: 0x7f8a52 }), MAXC);
    this.goalRings.rotation.x = 0;
    S3.add(this.cols, this.ghost, this.goalRings);
    this.coin = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.16, 40), [new THREE.MeshStandardMaterial({ color: 0xc8a24a, metalness: 0.8, roughness: 0.3 }), new THREE.MeshStandardMaterial({ map: coinTex(), metalness: 0.7, roughness: 0.35 }), new THREE.MeshStandardMaterial({ map: coinTex(), metalness: 0.7, roughness: 0.35 })]);
    this.coin.position.set(0, 4.6, -1.2); this.coin.rotation.z = Math.PI / 2; S3.add(this.coin);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xe0b060, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }));
    this.halo.scale.set(3.4, 3.4, 1); this.halo.position.copy(this.coin.position); S3.add(this.halo);
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false })); this.tag.scale.set(2.4, 0.6, 1); S3.add(this.tag);
    this.lastTag = '';
    const n = this.lite ? 10 : 24; this.sparkN = n; this.sparkPos = new Float32Array(n * 3);
    this.seed = Array.from({ length: n }, (_, i) => ({ x: ((i * 0.61) % 1 - 0.5) * 8, y: (i * 0.37) % 4.5, z: (((i * 0.83) % 1) - 0.5) * 2, s: 0.2 + (i % 5) * 0.07 }));
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    this.sparks = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xe0b060, size: 0.045, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending })); S3.add(this.sparks);
    // the vault's air and light (fx-atmos): a studio environment so the gold reads as metal, a soft shadow under the vault floor, shafts from above, gold embers rising
    setTimeout(() => { try {          // 0.9 s after the vault: the first paint is the vault itself
      const R = this.renderer, pm = new THREE.PMREMGenerator(R); S3.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
      this.at = [];
      const ao = AT.contactAO({ radius: 5.6, depth: 1.9, strength: 0.8 }); ao.object.position.set(0, -0.21, 0); S3.add(ao.object); this.at.push(ao);
      const sh = AT.shafts({ count: 4, from: [-1, 11, 1], to: [0, 0, 0], width: 3.4, spread: [7, 0, 1.5], color: '#e0b060', strength: 0.1, seed: 12 }); S3.add(sh.object); this.at.push(sh);
      /* AGORA: no rising embers, the vault stays calm */
      AT.setQuality(this.at, this.lite ? 'low' : 'high'); this.dirty = true;
    } catch (e) { this.at = []; } }, 900);
  }
  set(P) {
    const M = P.months + 1, mx = Math.max(1, ...P.mean.map(Math.abs), ...P.p10.map(Math.abs), P.goal ? P.goal * P.months : 0), sc = HMAX / mx;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), s = new THREE.Vector3();
    this.cols.count = this.ghost.count = this.goalRings.count = M; this.n = M;
    const x0 = -((M - 1) * GAP) / 2;
    for (let k = 0; k < M; k++) {
      const x = x0 + k * GAP, v = P.mean[k] * sc, b = P.p10[k] * sc;
      const h = Math.max(0.04, Math.abs(v));
      this.cols.setMatrixAt(k, m4.compose(p.set(x, v >= 0 ? h / 2 : -h / 2, 0), q.identity(), s.set(1, h, 1)));
      this.cols.setColorAt?.(k, new THREE.Color(v >= 0 ? 0xf3ece0 : 0xc0603f));
      const hb = Math.max(0.04, Math.abs(b));
      this.ghost.setMatrixAt(k, m4.compose(p.set(x, b >= 0 ? hb / 2 : -hb / 2, 0.02), q.identity(), s.set(1, hb, 1)));
      const gy = P.goal && k > 0 ? P.goal * k * sc : -9;
      this.goalRings.setMatrixAt(k, m4.compose(p.set(x, Math.min(gy, HMAX + 0.8), 0), q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), one));
      q.identity();
    }
    for (const m of [this.cols, this.ghost, this.goalRings]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    const end = P.mean[P.months], txt = usd(end);
    if (this.lastTag !== txt) { this.lastTag = txt; this.tag.material.map?.dispose(); this.tag.material.map = labelTex(txt, end >= 0 ? '#aeb86e' : '#c96a4a'); this.tag.material.needsUpdate = true; }
    this.tag.position.set(x0 + (M - 1) * GAP, Math.max(0, end * sc) + 0.7, 0);
    this.dirty = true;
  }
  resize() {
    const w = innerWidth, h = innerHeight; this.renderer.setSize(w, h, false); this.camera.aspect = w / h;
    const hud = document.querySelector('.hud').getBoundingClientRect().bottom, sheet = $('sheet').getBoundingClientRect().top;
    const vis = Math.max(120, sheet - hud), cy = (hud + sheet) / 2;
    this.dist = Math.max(15, 6.4 / (0.849 * (vis / h)));
    this.camera.setViewOffset(w, h, 0, h / 2 - cy, w, h); this.camera.updateProjectionMatrix(); this.dirty = true;
  }
  input(cv) {
    let down = null;
    cv.addEventListener('pointerdown', (e) => { down = { x: e.clientX, yaw: this.yaw }; cv.setPointerCapture?.(e.pointerId); });
    cv.addEventListener('pointermove', (e) => { if (down) { this.yaw = Math.max(-1.3, Math.min(1.3, down.yaw - (e.clientX - down.x) * 0.01)); this.dirty = true; } });
    const up = () => { down = null; }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  }
  frame(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now; this.t += dt;
    this.frames.push(dt); if (this.frames.length > 60) this.frames.shift();
    if (RM && !this.dirty) return;
    if (!RM) {
      this.coin.rotation.y += dt * 1.2; this.halo.material.opacity = 0.22 + Math.sin(this.t * 1.2) * 0.05;
      this.yaw = Math.max(-1.3, Math.min(1.3, this.yaw + Math.sin(this.t * 0.25) * dt * 0.1));
      const pos = this.sparkPos;
      for (let i = 0; i < this.sparkN; i++) { const e = this.seed[i]; e.y += e.s * dt; if (e.y > 4.8) e.y = 0; pos[i * 3] = e.x; pos[i * 3 + 1] = e.y; pos[i * 3 + 2] = e.z + 1; }
      this.sparks.geometry.attributes.position.needsUpdate = true;
    }
    this.camera.position.set(Math.sin(this.yaw) * Math.cos(this.pitch) * this.dist, this.mid + Math.sin(this.pitch) * this.dist, Math.cos(this.yaw) * Math.cos(this.pitch) * this.dist);
    this.camera.lookAt(0, this.mid, 0);
    if (this.at && this.at.length) AT.update(this.at, RM ? 0 : this.t, this.renderer.getPixelRatio());
    this.renderer.render(this.scene, this.camera); this.dirty = false;
  }
  fps() { const a = this.frames; return a.length ? Math.round(a.length / a.reduce((s, x) => s + x, 0)) : 0; }
}

let gapAt = 0;
function tick(now) {
  const gap = O && O.frameGap ? O.frameGap() : 0;                         // idle 30 / 15 fps, battery saver, 3D Off (docs/OLYMPUS_PERF.md)
  if (S.hall && !(O ? O.hidden() : document.hidden) && !(gap && now - gapAt < gap - 3)) { gapAt = now; S.hall.frame(now); }
  requestAnimationFrame(tick);
}

// An optional file that answered 404 is not asked again for 6 hours: a browser logs every 404 as a console error, this keeps it to one per phone.
const GONE_KEY = 'opt404.', GONE_MS = 6 * 3600e3;
const wasGone = (u) => { try { const t = +localStorage.getItem(GONE_KEY + u); return !!t && Date.now() - t < GONE_MS; } catch (_) { return false; } };
const markGone = (u) => { try { localStorage.setItem(GONE_KEY + u, String(Date.now())); } catch (_) { /* private mode */ } };
async function loadSite() {
  if (wasGone('../data.json')) return null;           // opened on its own (no site around it): not asked again for 6 hours
  try {
    const ac = typeof AbortController === 'function' ? new AbortController() : null; const tm = ac ? setTimeout(() => ac.abort(), 6000) : 0;
    const r = await fetch('../data.json', { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); clearTimeout(tm);
    if (!r.ok && r.status === 404) markGone('../data.json');
    return r.ok ? await r.json() : null;
  } catch (_) { return null; }
}

async function main() {
  addEventListener('error', (e) => S.errors.push(String(e.message || e)));
  S.doc = await loadPlans('plans.json?v=m2');
  loadState();
  $('demo').hidden = S.doc.src === 'file';
  bind(); route(); update();
  try { S.hall = new Vault($('vault')); S.hall.set(S.P); tick(performance.now()); vaultFx(S.hall).then((h) => { S.fx = h; }); } catch (e) { S.hall = null; $('nogl').hidden = false; O?.ready(); }
  window.__plutus = { ready: true, CORE, get state() { return S.st; }, get project() { return S.P; }, get doc() { return S.doc; }, get lite() { return S.hall ? S.hall.lite : null; },
    get fps() { return S.hall ? S.hall.fps() : 0; }, get src() { return S.doc.src; }, get live() { return !!(S.facts && (S.facts.trades || S.facts.trio)); }, errors: S.errors,
    get yaw() { return S.hall ? S.hall.yaw : 0; }, get roadmap() { return S.roadmap || null; }, get fx() { return S.fx || null; }, get tab() { return S.tab; }, get ready3d() { return !!S.hall; } };
  startRoadmap().then((r) => { S.roadmap = r; }).catch((e) => S.errors.push('roadmap: ' + ((e && e.message) || e)));
  S.site = await loadSite(); S.facts = siteFacts(S.site);
  if (S.facts.trades || S.facts.trio) $('livetag').hidden = false;
  update();
  window.__plutus.siteLoaded = true;
  if (window.parent !== window) fetch('jarvis.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((card) => {
    if (card) window.parent.postMessage({ jarvis: 1, href: location.href, card: { ...card, t: Math.floor(Date.now() / 1000) } }, (/^https?:/.test(location.protocol) ? location.origin : 'https://dcondax1-wq.github.io'));
  }).catch(() => {});
}
main().catch((e) => { S.errors.push(String(e)); O?.fail?.('Plutus could not start'); });
