// HELIOS page (ES module): the morning briefing. Reads ../pythia/events.json (how today looks), ../home.json (the accounts), ../money/index.json (deals) and fixture.json (DEMO, never blank); on this phone it READS the quiz
// progress ('lyceum.v1') and never writes it. Sends nothing; it only informs. Text only through textContent / createElementNS. window.HELIOS is the test hook.
// ?demo=1&now=2026-11-10T12:45:00Z&slot=pre|morning|ny opens a given view.
import * as C from './helioscore.js';
import * as HF from '../olympus/hero-flat.js';
import * as T from '../olympus/truth.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function sv(tag, attrs) { const e = document.createElementNS(NS, tag); for (const k in attrs || {}) e.setAttribute(k, String(attrs[k])); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const S = { inp: null, m: null, now: 0, slot: null, demo: false, forced: false, sun: null, mode: 'flat', ready: false, reason: '', copied: '' };
const TONE = { bad: 'bad', warn: 'warn', ok: 'ok', info: 'info', off: '' };
const LOOKPILL = { calm: 'ok', busy: 'warn', careful: 'bad' };

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
function say(t) { $('status').textContent = t; }
function readLS(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }

function renderFlat(m) {
  // the painted twin of the 3D sun (olympus/hero-flat.js): a dusk sky, the gilded sun rising behind a marble colonnade, one gold ray per good sign
  const svg = $('flat'); clear(svg);
  const P = HF.paint(svg, { w: 320, h: 180, sky: 'dusk', horizon: 0.8, sunX: 0.5, sunY: 0.78, temple: false, disc: false });
  const cx = 160, base = 138, r = 40, y = base + 30 - m.rise * 118;
  const n = m.good, pos = [];
  for (let i = 0; i < C_MAX; i++) pos.push(Math.PI * (0.12 + 0.76 * i / (C_MAX - 1)));
  P.el('circle', { cx, cy: y, r: r * 2.4, fill: P.F.glow, opacity: 0.8 });
  for (let i = 0; i < n; i++) { const a = pos[i], x1 = cx - Math.cos(a) * (r + 6), y1 = y - Math.sin(a) * (r + 6), x2 = cx - Math.cos(a) * (r + 34), y2 = y - Math.sin(a) * (r + 34); svg.appendChild(sv('line', { x1, y1, x2, y2, stroke: '#e8c068', 'stroke-width': 6, 'stroke-linecap': 'round', class: 'ray' })); }
  P.el('circle', { cx, cy: y, r, fill: P.F.coin, stroke: '#b0802a', 'stroke-width': 5 });
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; P.el('line', { x1: cx + Math.cos(a) * 12, y1: y + Math.sin(a) * 12, x2: cx + Math.cos(a) * (r - 6), y2: y + Math.sin(a) * (r - 6), stroke: '#8a5a14', 'stroke-opacity': 0.35, 'stroke-width': 2 }); }
  P.el('circle', { cx, cy: y, r: 11, fill: '#fff4cc', opacity: 0.85 });
  P.el('rect', { x: 0, y: base + 30, width: 320, height: 12, fill: P.F.ground });
  P.steps(160, base + 32, 290, 2, { stepH: 5, run: 8 });
  [40, 100, 160, 220, 280].forEach((x) => { P.shadow(x + 6, base + 33, 14, 3); P.column(x, base + 32, 30, 14); });
  P.el('rect', { x: 18, y: base - 4, width: 284, height: 6, fill: P.F.marble });
  P.band(20, base - 10, 280, 6);
  P.el('rect', { x: 14, y: base - 14, width: 292, height: 4, fill: P.F.marbleTop });
  P.vignette();
}
const C_MAX = 6;

function renderAll(m) {
  $('sub').textContent = `${m.slot.title} briefing, ${m.slot.at} ET`;
  const pill = $('pill'); pill.textContent = m.look.look; pill.className = 'pill ' + (LOOKPILL[m.look.look] || '');
  $('lookWord').textContent = `${m.slot.hello}. ${C.lookWords(m.look)}.`; $('lookWhy').textContent = m.look.why;
  const ev = $('events'); clear(ev);
  for (const e of m.look.events.slice(0, 4)) ev.appendChild(h('li', '', `${e.time ? C.timeWord(e.time) + ': ' : ''}${e.title} (${e.impact === 'high' ? 'big' : e.impact === 'med' ? 'medium' : 'light'})`));
  if (!m.look.events.length) ev.appendChild(h('li', '', m.look.have ? 'No releases on the calendar today.' : 'No calendar file yet: nothing is known for today.'));
  $('signs').textContent = `${m.good} of ${m.total} good signs: ${m.signs.filter((s) => s.ok).map((s) => s.text).join('; ') || 'none yet'}.`;
  renderFlat(m);
  if (S.sun && S.sun.ok) S.sun.set({ rise: m.rise, rays: m.good });

  const ac = $('accts'); clear(ac);
  for (const a of m.accounts) {
    const li = h('li', 'item acc ' + (TONE[C.health(a)] || ''));
    if (a.has && a.room != null) {                     // the one number first (a visual summary; the sentence below says it all for a screen reader)
      const top = h('div', 'acc-top'); top.setAttribute('aria-hidden', 'true');
      top.appendChild(h('b', 'acc-n', `${a.name} ${a.size}`)); const v = h('span', 'acc-v ag-num', C.money(a.room)); v.appendChild(h('small', '', ` of ${C.money(a.mll)}`)); top.appendChild(v);
      li.appendChild(top);
    }
    li.appendChild(h('p', '', C.accountLine(a))); ac.appendChild(li);
  }
  const ul = $('acts'); clear(ul);
  m.actions.forEach((a, i) => {
    const li = h('li', 'item ' + (TONE[a.tone] || '')), row = h('div', 'row'); row.appendChild(h('b', '', `${i + 1}. ${a.title}`));
    row.appendChild(h('span', 'pill ' + (a.usd ? 'warn' : 'ok'), a.usd ? `${C.money(a.usd)} (est.)` : 'free')); li.appendChild(row); li.appendChild(h('p', '', a.why)); ul.appendChild(li);
  });
  if (!m.actions.length) ul.appendChild(h('li', 'item', 'Nothing needs you right now.'));
  const dl = $('deals'); clear(dl);
  for (const d of m.deals.slice(0, 3)) { const li = h('li', 'item warn'); li.appendChild(h('b', '', `${d.title} (${d.stream})`)); li.appendChild(h('p', '', `Ends in ${C.hoursText(d.hours)}${d.usd ? `, about ${C.money(d.usd)} (an estimate)` : ''}. Check it on the firm's own page first.`)); dl.appendChild(li); }
  if (!m.deals.length) dl.appendChild(h('li', 'item', 'No deal ends in the next 48 hours.'));
  const q = m.quiz, qp = $('quizPill');
  qp.textContent = q.done ? 'Done today' : q.known ? 'Not yet' : 'No progress yet'; qp.className = 'pill ' + (q.done ? 'ok' : 'warn');
  $('quiz').textContent = q.done ? `Today's quiz is done: ${q.score} of 5. ${q.streak} day${q.streak === 1 ? '' : 's'} in a row.` : q.known ? `Today's quiz is not done yet. ${q.streak ? `${q.streak} day${q.streak === 1 ? '' : 's'} in a row so far; ${q.streak === 1 ? 'it' : 'they'} count${q.streak === 1 ? 's' : ''} if you finish today.` : 'Five questions take about two minutes.'}` : 'No quiz progress on this phone yet. Open Lyceum to start.';
  $('plan').textContent = m.plan;
  $('text').textContent = m.text;
}

function render() {
  S.m = C.build(S.inp, S.now, S.slot);
  $('demo').hidden = !S.demo; try { $('lite').hidden = !(O && O.lite && O.lite()); } catch (_) { $('lite').hidden = true; }
  renderAll(S.m);
  say(`Helios: ${C.lookWords(S.m.look)}. ${S.m.good} of ${S.m.total} good signs.${S.copied ? ' ' + S.copied : ''}`);
  $('src').textContent = S.demo ? (S.forced ? 'Example numbers (?demo=1): open the page without it for the live accounts.' : 'Example numbers (fixture.json): the site has no home.json or money data yet.')
    : S.ages ? 'Accounts: home.json (the PC\'s report via the cloud). ' + S.ages.line : 'No account file (home.json) on the site yet.';
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
}

async function copyText() {
  const text = S.m.text; let ok = false;
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); ok = true; } } catch (_) { ok = false; }
  if (!ok) {
    try { const ta = h('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove(); } catch (_) { ok = false; }
  }
  S.copied = ok ? 'Copied. Paste it into a message to yourself.' : 'Could not copy: open "The text" below and select it.';
  $('copy').textContent = ok ? 'Copied' : 'Copy as text';
  if (!ok) $('textBox').open = true;
  say(S.copied);
  setTimeout(() => { $('copy').textContent = 'Copy as text'; }, 2500);
}

// sun.js is loaded by its own module tag (sunload.js) so the page still works when three.js or WebGL is missing: wait for it (6 s at most), else keep the flat sunrise
function waitSun() {
  return new Promise((resolve, reject) => {
    if (window.__heliosSun) { resolve(window.__heliosSun); return; }
    const done = (v, e) => { clearTimeout(tm); window.removeEventListener('helios-sun', on); if (e) reject(e); else resolve(v); };
    const on = () => done(window.__heliosSun);
    const tm = setTimeout(() => done(null, new Error('the 3D sun did not load')), 6000);
    window.addEventListener('helios-sun', on);
  });
}
async function startSun() {
  const canvas = $('stage'), flat = $('flat');
  let T = null;
  try { T = await waitSun(); } catch (e) { S.reason = String(e && e.message ? e.message : e); }
  const reduced = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } })();
  if (T) {
    let t = null;
    try { t = T.createSun(canvas, { reduced }); } catch (e) { S.reason = String(e && e.message ? e.message : e); }
    if (t && t.ok) { S.sun = t; S.mode = '3d'; canvas.hidden = false; flat.setAttribute('hidden', ''); t.set({ rise: S.m.rise, rays: S.m.good }); document.documentElement.dataset.helios = '3d'; return; }
    if (t && t.reason) S.reason = t.reason;
  }
  S.mode = 'flat'; canvas.hidden = true; flat.removeAttribute('hidden'); document.documentElement.dataset.helios = 'flat';
}

async function boot() {
  const q = new URLSearchParams(location.search); S.forced = q.get('demo') === '1';
  const nowQ = Date.parse(q.get('now') || ''); S.now = Number.isFinite(nowQ) ? nowQ : Date.now();
  S.slot = ['pre', 'morning', 'ny'].includes(q.get('slot')) ? q.get('slot') : null;
  const [fx, events, home, money] = await Promise.all([getJSON('./fixture.json'), S.forced ? null : getJSON('../pythia/events.json'), S.forced ? null : getJSON('../home.json'), S.forced ? null : getJSON('../money/index.json')]);
  const real = !S.forced && (!!home || !!money);
  S.demo = !real;
  // the accounts and their age come from the shared truth (olympus/truth.js: home.json's board first, the same numbers as Home, NQ and Aegis)
  const canon = home ? T.canonHome(await T.withPcFeed(home), S.now / 1000) : null; S.ages = canon ? canon.truth.ages : null;
  S.inp = real ? { events, home: canon, money, lyceum: readLS('lyceum.v1') } : C.demoInputs(fx, S.now);
  $('copy').addEventListener('click', copyText);
  render();
  await startSun();
  S.ready = true;
}
window.HELIOS = { S, C, ready: () => S.ready, render, text: () => (S.m ? S.m.text : ''), get mode() { return S.mode; }, get sun() { return S.sun; } };
boot().catch((e) => { say('Something went wrong: ' + (e && e.message ? e.message : e)); try { if (O && O.fail) O.fail('Helios could not start'); } catch (_) { /* nothing */ } });
