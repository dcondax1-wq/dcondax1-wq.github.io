// ARES: the war room. A tower from the max-loss floor (red, bottom) to the target (green, top); your balance is the orb on it;
// the stop-out you are about to risk is the red slab under the orb, the 2R win the green slab above it. The ring around the top
// is the verdict (green GO, amber WAIT, red HALT). All the numbers come from arescore.js; this file is the screen.
import * as THREE from '../jarvis/three.module.min.js';
import * as CORE from './arescore.js';
import { loadRules, planOf, floorOf, judge, CHECKS, usd, esc, num, accountFromSite, botStops } from './arescore.js';
import { initDesk, renderDesk, loadHome, desk } from './aresdesk.js';
import { dressRoom } from './aresfx.js';
import { renderPlus } from './aresplus.js';

const O = window.OLYMPUS || null;
const Q = new URLSearchParams(location.search);
const RM = O ? O.reduced() : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const $ = (id) => document.getElementById(id);
const KEY = 'ares.v1';
const LEVEL = { go: { color: '#9bab63', word: 'GO' }, wait: { color: '#e0a060', word: 'WAIT' }, halt: { color: '#c96a4a', word: 'HALT' } };
const DEFAULTS = { plan: '50k', stage: 'eval', inst: 'MNQ', side: 'long', entry: '', stop: '', riskPct: 40, balance: '', peak: '', today: '', riskCap: '',
  maxTrades: 2, stopAfter: 2, tradesToday: 0, lossesToday: 0, news: false, hedge: false, checks: {}, day: '', botBalance: false };
const S = { rules: null, st: { ...DEFAULTS }, site: null, acct: null, hall: null, errors: [], tab: 'trade', last: null };

const nowDate = () => { const q = Q.get('now'); const d = q ? new Date(q) : new Date(); return Number.isNaN(+d) ? new Date() : d; };
const etDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);

function loadState() {
  let st = {};
  try { st = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { st = {}; }
  S.st = { ...DEFAULTS, ...st, checks: { ...(st.checks || {}) } };
  const today = etDay(nowDate());
  if (S.st.day !== today) { S.st.day = today; S.st.today = ''; S.st.tradesToday = 0; S.st.lossesToday = 0; S.st.checks = {}; S.st.news = false; S.st.hedge = false; }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S.st)); } catch (_) { /* private mode: this visit only */ } }

// ------------------------------------------------------------------------------------------------ the numbers
function inputs() {
  const p = planOf(S.rules, S.st.plan);
  return { ...S.st, balance: num(S.st.balance) ?? p.start, peak: num(S.st.peak) ?? undefined, entry: S.st.entry, stop: S.st.stop };
}
function compute() { S.last = judge(S.rules, inputs(), nowDate()); return S.last; }

// ------------------------------------------------------------------------------------------------ the screen
function renderOut(R) {
  const z = R.size, v = R.level;
  const big = z.valid ? `${z.n} ${z.inst}` : '-';
  const reasonHalt = R.reasons.some((x) => x.level === 'halt');
  $('out').innerHTML = `<div class="big"><b style="color:${LEVEL[v].color}">${esc(reasonHalt && z.n === 0 ? 'NO SIZE' : big)}</b><span>${z.valid ? `stop ${z.pts.toFixed(2)} pts` : esc(z.why)}</span></div>`
    + row('A stop-out costs', z.valid ? usd(z.risk) : '-', z.valid && z.rooms_pct > 0.6 ? 'bad' : '')
    + row('One contract risks', z.valid ? usd(z.loss1, 2) : '-')
    + row('Risk budget', z.valid ? usd(z.budget) : '-')
    + row('Room to the floor', usd(z.room), z.room <= 0 ? 'bad' : '')
    + row('Room after a stop-out', z.valid ? usd(z.room_after) : '-', z.valid && z.room_after < z.plan.mll * 0.25 ? 'bad' : '')
    + row('Full stop-outs left', z.valid && z.n ? String(z.stops_left) : '-')
    + (z.valid && z.n ? z.R.map((x) => row(`${x.r}R win (${x.pts.toFixed(1)} pts)`, usd(x.usd), 'good')).join('') : '')
    + (z.micros_hint ? row('Try instead', z.micros_hint + ' MNQ') : '');
}
const row = (k, v, cls = '') => `<span class="k">${esc(k)}</span><span class="v ${cls}">${esc(v)}</span>`;

function renderAcct(R) {
  const z = R.size, p = z.plan;
  $('acct').innerHTML = `<div class="stat" style="grid-column:1/3"><div><b>${usd(z.room)}</b><span>room to floor</span></div><div><b>${usd(z.floor)}</b><span>floor</span></div>`
    + `<div><b>${p.dll ? usd(Math.max(0, z.dllLeft)) : '-'}</b><span>daily loss left</span></div></div>`
    + `<span class="k" style="grid-column:1/3">${S.st.stage === 'eval' ? `${usd(Math.max(0, z.to_target))} to the target (${usd(z.target_bal)}).` : `First payout at ${usd(p.start + p.buffer + p.pay_min)} (buffer ${usd(p.buffer)} + ${usd(p.pay_min)}); ${Math.round(p.split * 100)}% is yours.`}</span>`;
}

function renderWhy(R) {
  const items = R.reasons.length ? R.reasons : [{ level: 'ok', text: 'The rules see nothing in the way.' }];
  if (!R.reasons.some((x) => x.level === 'halt') && R.checks.done < R.checks.total) items.push({ level: 'warn', id: 'list', text: `Checklist: ${R.checks.done} of ${R.checks.total} ticked. Finish it for GO.` });
  $('why').innerHTML = items.map((x) => `<div class="reason ${x.level}"><i>${x.level === 'halt' ? 'HALT' : x.level === 'ok' ? 'OK' : 'NOTE'}</i><span>${esc(x.text)}</span></div>`).join('');
  $('whyN').textContent = String(R.reasons.filter((x) => x.level === 'halt').length || '');
}

function renderChecks(R) {
  $('checks').innerHTML = CHECKS.map((c) => `<label class="chk"><input type="checkbox" data-chk="${c.id}" ${S.st.checks[c.id] ? 'checked' : ''}><span>${esc(c.text)}${c.must ? '<em>MUST</em>' : ''}</span></label>`).join('');
  $('chkN').textContent = `${R.checks.done}/${R.checks.total}`;
  $('checks').querySelectorAll('input').forEach((i) => i.addEventListener('change', () => { S.st.checks[i.dataset.chk] = i.checked; save(); update(); }));
}

function renderRules() {
  const R = S.rules, p = planOf(R, S.st.plan);
  $('rules').innerHTML = `<div class="stat"><div><b>${usd(p.mll)}</b><span>max loss (EOD)</span></div><div><b>${p.dll ? usd(p.dll) : '-'}</b><span>daily (soft)</span></div><div><b>${p.max_micros}</b><span>micros max</span></div></div>`
    + (R.rules || []).map((x) => `<div class="rule"><s class="${esc(x.status)}">${esc(String(x.status).toUpperCase())}</s>${esc(x.text)}</div>`).join('')
    + `<p class="src">Source: ${esc(R.source)}${R.src === 'embedded' ? ' (rules.json not found, using the copy inside the app)' : ''}. Check MFFU's own pages before a payout.</p>`;
}

function renderBot() {
  const b = botStops(S.site);
  $('botstops').innerHTML = b ? `<div class="rule"><s>BOT</s>The bot's ${b.n} real stops: middle ${b.med.toFixed(1)} pts, usual range ${b.p25.toFixed(1)} to ${b.p75.toFixed(1)}, widest ${b.max.toFixed(1)}. A stop far outside that range is not the bot's setup.</div>` : '';
}

function syncFields() {
  for (const k of ['entry', 'stop', 'balance', 'peak', 'today', 'riskCap', 'maxTrades', 'stopAfter', 'tradesToday', 'lossesToday']) { const el = $(k); if (el && document.activeElement !== el) el.value = S.st[k] ?? ''; }
  $('riskPct').value = S.st.riskPct; $('riskPctV').textContent = S.st.riskPct + '%';
  $('news').checked = !!S.st.news; $('hedge').checked = !!S.st.hedge;
  document.querySelectorAll('[data-set]').forEach((b) => { const on = String(S.st[b.dataset.set]) === b.dataset.v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  const p = planOf(S.rules, S.st.plan);
  $('balance').placeholder = String(p.start);
  $('peak').placeholder = 'as balance';
}

function update() {
  const R = compute(), lv = LEVEL[R.level], z = R.size;
  const v = $('verdict');
  v.dataset.level = R.level; $('vk').textContent = lv.word;
  const halts = R.reasons.filter((x) => x.level === 'halt');
  $('vs').textContent = R.level === 'halt' ? (!z.valid && halts.length === 1 && halts[0].id === 'input' ? 'enter entry + stop' : z.valid && z.n === 0 ? 'no size fits' : halts.length + (halts.length === 1 ? ' reason' : ' reasons')) : z.valid ? `${z.n} ${z.inst} · risk ${usd(z.risk)}` : 'enter entry + stop';
  $('vline').textContent = R.level === 'halt' ? halts[0].text : R.level === 'wait' ? (z.valid ? `Allowed. Size ${z.n} ${z.inst}. Finish the list (${R.checks.done}/${R.checks.total}) to go.` : 'Enter your entry and stop.') : `Size ${z.n} ${z.inst}, stop ${z.pts.toFixed(1)} pts. Place the stop first.`;
  syncFields(); renderOut(R); renderAcct(R); renderWhy(R); renderChecks(R); renderRules(); renderBot();
  renderDesk(S, R);
  try { renderPlus(S, R, S.rules); } catch (e) { S.errors.push('plus: ' + ((e && e.message) || e)); }
  S.hall?.set(R);
  O?.mode?.(!!(S.hall && S.hall.lite));
}

function setTab(t) {
  S.tab = t;
  document.querySelectorAll('.pane').forEach((p) => { p.hidden = p.id !== 'p-' + t; });
  document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === t)));
  $('sheet').scrollTop = 0;
  if (history.replaceState && ['trade', 'account', 'why', 'list', 'rules'].includes(t)) history.replaceState(null, '', '#' + (t === 'trade' ? 'size' : t));
}
function route() {
  const h = location.hash.slice(1);
  setTab({ size: 'trade', trade: 'trade', account: 'account', why: 'why', list: 'list', rules: 'rules' }[h] || 'trade');
}

function applyBot() {
  const a = S.acct; if (!a) return;
  S.st.plan = a.start && a.start < 40000 ? '25k' : '50k'; S.st.stage = 'eval'; S.st.balance = String(a.balance); S.st.today = String(a.today || '');
  const p = planOf(S.rules, S.st.plan);          // the best end-of-day balance that gives the bot's floor (locked floor: any balance past start + lock + max loss)
  S.st.peak = String(a.floor >= p.start + p.lock - 0.01 ? p.start + p.lock + p.mll : a.floor + p.mll);
  S.st.botBalance = true; save();
}

function bind() {
  document.querySelectorAll('[data-set]').forEach((b) => b.addEventListener('click', () => { S.st[b.dataset.set] = b.dataset.v; save(); update(); }));
  for (const k of ['entry', 'stop', 'balance', 'peak', 'today', 'riskCap', 'maxTrades', 'stopAfter', 'tradesToday', 'lossesToday']) $(k).addEventListener('input', (e) => { S.st[k] = e.target.value; if (['balance', 'peak', 'today'].includes(k)) S.st.botBalance = false; save(); update(); });
  $('riskPct').addEventListener('input', (e) => { S.st.riskPct = +e.target.value; save(); update(); });
  $('news').addEventListener('change', (e) => { S.st.news = e.target.checked; save(); update(); });
  $('hedge').addEventListener('change', (e) => { S.st.hedge = e.target.checked; save(); update(); });
  $('resetChecks').addEventListener('click', () => { S.st.checks = {}; S.st.news = false; save(); update(); });
  $('tabs').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  $('verdict').addEventListener('click', () => setTab('why'));
  $('fromBot').addEventListener('click', () => { applyBot(); update(); });
  addEventListener('hashchange', route);
}

// ------------------------------------------------------------------------------------------------ the 3D room
function labelTex(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d'); x.font = '700 26px "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.shadowColor = color; x.shadowBlur = 10; x.fillStyle = color; x.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const glowTex = () => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(243, 236, 224,1)'); g.addColorStop(0.3, 'rgba(243, 236, 224,.4)'); g.addColorStop(1, 'rgba(243, 236, 224,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
};
const H = 4;

class Room {
  constructor(canvas) {
    this.lite = Q.get('lite') === '1' || !!(O && O.lite());
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.lite, alpha: true, powerPreference: 'high-performance' });
    O?.track(this.renderer);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(O ? O.dpr(this.lite) : Math.min(devicePixelRatio || 1, this.lite ? 1.5 : 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);
    this.yaw = 0.6; this.pitch = 0.3; this.dist = 20; this.t = 0; this.dirty = true; this.last = performance.now(); this.frames = [];
    this.col = new THREE.Color('#c96a4a'); this.tint = new THREE.Color('#c96a4a');
    this.glow = glowTex();
    this.build();
    try { this.dress = dressRoom(this); } catch (e) { this.dress = null; }          // bronze, steel, banners, torches, the hologram table (aresfx.js)
    this.resize(); addEventListener('resize', () => this.resize());
    this.input(canvas);
  }
  build() {
    const S3 = this.scene;
    S3.add(new THREE.HemisphereLight(0xf3ece0, 0x1d1710, 1.2));
    this.key = new THREE.PointLight(0xc0603f, 30, 20, 1.6); this.key.position.set(0, H + 1.5, 2); S3.add(this.key);
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.6, 0.3, 48), new THREE.MeshStandardMaterial({ color: 0x19140f, roughness: 0.5, metalness: 0.4 }));
    plat.position.y = -0.2; S3.add(plat);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, H, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xe0907a, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
    tower.position.y = H / 2; S3.add(tower);
    const mkDisk = (c) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.05, 40), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, depthWrite: false })); S3.add(m); return m; };
    this.floorDisk = mkDisk(0xc0603f); this.floorDisk.position.y = 0;
    this.topDisk = mkDisk(0x9bab63); this.topDisk.position.y = H;
    this.orb = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 16), new THREE.MeshStandardMaterial({ color: 0xf3ece0, emissive: 0xc0603f, emissiveIntensity: 1.2, roughness: 0.3 }));
    S3.add(this.orb);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xc0603f, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
    this.halo.scale.set(2.2, 2.2, 1); S3.add(this.halo);
    this.slabRisk = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1, 28, 1, true), new THREE.MeshBasicMaterial({ color: 0xc0603f, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.slabWin = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1, 28, 1, true), new THREE.MeshBasicMaterial({ color: 0x9bab63, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    S3.add(this.slabRisk, this.slabWin);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.07, 10, 64), new THREE.MeshBasicMaterial({ color: 0xc0603f }));
    this.ring.rotation.x = Math.PI / 2; this.ring.position.y = H + 0.7; S3.add(this.ring);
    this.spikes = new THREE.InstancedMesh(new THREE.ConeGeometry(0.16, 0.9, 6), new THREE.MeshStandardMaterial({ color: 0x251e15, emissive: 0xc0603f, emissiveIntensity: 0.4, roughness: 0.4 }), 16);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; M.compose(p.set(Math.cos(a) * 3.5, 0.45, Math.sin(a) * 3.5), q.identity(), sc); this.spikes.setMatrixAt(i, M); }
    S3.add(this.spikes);
    this.sprites = {};
    for (const k of ['floor', 'top', 'you']) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false })); s.scale.set(2.2, 0.55, 1); S3.add(s); this.sprites[k] = s; }
    const n = this.lite ? 24 : 60; this.emberN = n;
    const g = new THREE.BufferGeometry(); this.emberPos = new Float32Array(n * 3); this.emberSeed = Array.from({ length: n }, (_, i) => ({ a: i * 2.399, r: 0.6 + (i % 7) * 0.32, s: 0.15 + (i % 5) * 0.06, y: (i * 0.173) % H }));
    g.setAttribute('position', new THREE.BufferAttribute(this.emberPos, 3));
    this.embers = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xe0907a, size: 0.07, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    S3.add(this.embers);
    this.lab = {};
  }
  label(k, text, color, x, y) {
    if (this.lab[k] !== text + color) { this.lab[k] = text + color; this.sprites[k].material.map?.dispose(); this.sprites[k].material.map = labelTex(text, color); this.sprites[k].material.needsUpdate = true; }
    this.sprites[k].position.set(x, y, 0);
  }
  set(R) {
    const z = R.size, p = z.plan, lv = LEVEL[R.level];
    const top = S.st.stage === 'funded' ? p.start + p.buffer + p.pay_min : z.target_bal, lo = z.floor, span = Math.max(1, top - lo);
    const yOf = (b) => Math.max(-0.4, Math.min(H + 0.6, ((b - lo) / span) * H));
    const yB = yOf(z.bal), risk = z.valid ? z.risk : 0, win = z.valid && z.n ? z.R[1].usd : 0;
    this.orb.position.set(0, yB, 0); this.halo.position.set(0, yB, 0);
    const yR = yOf(z.bal - risk), yW = yOf(z.bal + win);
    this.slabRisk.scale.set(1, Math.max(0.001, yB - yR), 1); this.slabRisk.position.set(0, (yB + yR) / 2, 0); this.slabRisk.visible = risk > 0;
    this.slabWin.scale.set(1, Math.max(0.001, yW - yB), 1); this.slabWin.position.set(0, (yB + yW) / 2, 0); this.slabWin.visible = win > 0;
    this.tint.set(lv.color); this.ring.material.color.copy(this.tint); this.orb.material.emissive.copy(this.tint); this.halo.material.color.copy(this.tint); this.key.color.copy(this.tint);
    this.spikes.material.emissive.set(R.level === 'halt' ? '#c96a4a' : R.level === 'wait' ? '#b0763c' : '#4f5633');
    this.label('floor', 'FLOOR ' + usd(lo), '#e0907a', 2.1, 0.9); this.label('top', (S.st.stage === 'funded' ? 'PAYOUT ' : 'TARGET ') + usd(top), '#9bab63', 2.1, H + 0.3);
    this.label('you', 'YOU ' + usd(z.bal), '#f3ece0', -2.1, yB);
    this.yB = yB; this.dirty = true;
  }
  resize() {
    const w = innerWidth, h = innerHeight, cv = this.renderer.domElement;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h;
    const hud = document.querySelector('.hud').getBoundingClientRect().bottom, sheet = $('sheet').getBoundingClientRect().top;
    const vis = Math.max(120, sheet - hud), cy = (hud + sheet) / 2;
    this.dist = Math.max(14, (H + 2.8) / (0.933 * (vis / h)));
    this.camera.setViewOffset(w, h, 0, h / 2 - cy, w, h);
    this.camera.updateProjectionMatrix(); this.dirty = true; cv.style.width = '100%';
  }
  input(cv) {
    let down = null;
    cv.addEventListener('pointerdown', (e) => { down = { x: e.clientX, yaw: this.yaw }; cv.setPointerCapture?.(e.pointerId); });
    cv.addEventListener('pointermove', (e) => { if (down) { this.yaw = down.yaw - (e.clientX - down.x) * 0.01; this.dirty = true; } });
    const up = () => { down = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  }
  frame(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now; this.t += dt;
    this.frames.push(dt); if (this.frames.length > 60) this.frames.shift();
    if (RM && !this.dirty) return;
    if (!RM) {
      this.yaw += dt * 0.12;
      this.ring.rotation.z += dt * 0.6; this.ring.position.y = H + 0.7 + Math.sin(this.t * 1.4) * 0.05;
      this.halo.material.opacity = 0.65 + Math.sin(this.t * 2.2) * 0.15;
      const pos = this.emberPos;
      for (let i = 0; i < this.emberN; i++) { const e = this.emberSeed[i]; e.y += e.s * dt; if (e.y > H + 0.5) e.y = 0; const a = e.a + this.t * 0.25; pos[i * 3] = Math.cos(a) * e.r; pos[i * 3 + 1] = e.y; pos[i * 3 + 2] = Math.sin(a) * e.r; }
      this.embers.geometry.attributes.position.needsUpdate = true;
      if (this.dress) this.dress.update(dt, this.t);
    }
    this.camera.position.set(Math.sin(this.yaw) * Math.cos(this.pitch) * this.dist, H * 0.5 + Math.sin(this.pitch) * this.dist, Math.cos(this.yaw) * Math.cos(this.pitch) * this.dist);
    this.camera.lookAt(0, H * 0.5, 0);
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

// ------------------------------------------------------------------------------------------------ the site's own data (optional)
async function loadSite() {
  try {
    const ac = typeof AbortController === 'function' ? new AbortController() : null; const tm = ac ? setTimeout(() => ac.abort(), 6000) : 0;
    const r = await fetch('../data.json', { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); clearTimeout(tm);
    return r.ok ? await r.json() : null;
  } catch (_) { return null; }
}

async function main() {
  addEventListener('error', (e) => S.errors.push(String(e.message || e)));
  S.rules = await loadRules('rules.json?v=r2');
  loadState();
  $('demo').hidden = S.rules.src === 'file';
  bind(); route(); update(); initDesk(S, update, save);
  try { S.hall = new Room($('room')); S.hall.set(S.last); tick(performance.now()); } catch (e) { S.hall = null; $('nogl').hidden = false; O?.ready(); }
  window.__ares = { ready: true, CORE, get state() { return S.st; }, get verdict() { return S.last; }, get lite() { return S.hall ? S.hall.lite : null; },
    get fps() { return S.hall ? S.hall.fps() : 0; }, get rulesSrc() { return S.rules.src; }, get live() { return !!S.acct; }, errors: S.errors,
    get yaw() { return S.hall ? S.hall.yaw : 0; }, desk, get dressed() { return !!(S.hall && S.hall.dress); }, get tab() { return S.tab; }, get ready3d() { return !!S.hall; } };
  S.site = await loadSite();
  S.acct = accountFromSite(S.site) || await loadHome();
  if (S.acct && (S.st.balance === '' || S.st.botBalance)) { applyBot(); }
  if (S.acct) { $('fromBot').hidden = false; $('livetag').hidden = false; $('sub').textContent = `${S.acct.name}: ${usd(S.acct.balance)}, floor ${usd(S.acct.floor)}`; }
  update();
  window.__ares.siteLoaded = true;
  if (window.parent !== window) fetch('jarvis.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((card) => {
    if (card) window.parent.postMessage({ jarvis: 1, href: location.href, card: { ...card, t: Math.floor(Date.now() / 1000) } }, (/^https?:/.test(location.protocol) ? location.origin : 'https://demetrades2000-coder.github.io'));
  }).catch(() => {});
}
main().catch((e) => { S.errors.push(String(e)); O?.fail?.('Ares could not start'); });
