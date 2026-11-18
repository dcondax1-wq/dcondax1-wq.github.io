// ARES desk (2026-11-04): the scenario presets, the journal of past checks, the "rules you broke" tracker, the pre-trade ritual timer, the
// live drawdown-left bar (the bot's account from data.json or home.json) and the share card. The numbers come from arescore.js; this file is
// the screen. The OLYMPUS effects library (../olympus/fx-*.js) adds the ring, the sparks and the count-up when the page has it; without
// it (or on LITE / off / reduced motion) everything draws the same. The journal is this phone's own (localStorage 'ares.journal.v1').
import { SCENARIOS, scenarioPatch, journalEntry, brokenRules, drawdownLeft, accountFromHome, shareSpec, usd, esc } from './arescore.js';

const $ = (id) => document.getElementById(id);
const FX = () => window.OLYMPUS_FX || null;
const JKEY = 'ares.journal.v1', RITUAL_S = 60;
const STEPS = [[0, 'Breathe out slowly. Shoulders down.'], [20, 'Read the stop and the size out loud. It is the number above.'], [40, 'Say what makes you wrong. Then take it or leave it.']];
const store = {
  read() { try { const v = JSON.parse(localStorage.getItem(JKEY) || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; } },
  write(v) { try { localStorage.setItem(JKEY, JSON.stringify(v.slice(-200))); } catch (_) { /* private mode */ } },
};
const W = { ring: null, timer: 0, t0: 0, left: RITUAL_S, ritualAt: 0, home: null };

/** the account in home.json (the Forum's feed), optional */
export async function loadHome() {
  try {
    const ac = typeof AbortController === 'function' ? new AbortController() : null, tm = ac ? setTimeout(() => ac.abort(), 5000) : 0;
    const r = await fetch('../home.json', { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); clearTimeout(tm);
    return r.ok ? accountFromHome(await r.json()) : null;
  } catch (_) { return null; }
}

// ------------------------------------------------------------------------------------------------ scenarios
function scenarios(S, update, save) {
  const box = $('scen');
  box.innerHTML = SCENARIOS.map((s) => `<button type="button" data-scen="${s.id}">${esc(s.label)}</button>`).join('');
  box.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    const patch = scenarioPatch(S.rules, b.dataset.scen);
    if (!patch) return;
    Object.assign(S.st, patch); save(); update();
    box.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    const f = FX(); if (f && f.sparkleBurst) f.sparkleBurst(b, { count: 14 });
  }));
}

// ------------------------------------------------------------------------------------------------ drawdown left
function drawdown(S) {
  const d = drawdownLeft(S.rules, S.st, S.st.botBalance ? S.acct : null), box = $('dd');
  box.dataset.tone = d.tone;
  box.querySelector('.ddv').textContent = d.room > 0 ? `${usd(d.room)} left of ${usd(d.mll)}` : 'No room left';
  box.querySelector('.ddk').textContent = d.live ? 'DRAWDOWN LEFT · LIVE' : 'DRAWDOWN LEFT';
  box.querySelector('i').style.width = Math.round(d.frac * 100) + '%';
  box.setAttribute('aria-label', `Drawdown left: ${usd(d.room)} of ${usd(d.mll)}${d.live ? ', from the bot\'s account' : ''}`);
}

// ------------------------------------------------------------------------------------------------ the journal and the tracker
function journal(S, R) {
  const list = store.read(), B = brokenRules(list, new Date(), 30);
  $('journal').innerHTML = list.length ? list.slice(-8).reverse().map((e) => `<div class="jrow ${esc(e.level)}"><s>${esc(String(e.level).toUpperCase())}</s><span>${esc(new Date(e.t).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }))} ET · ${e.n || 0} ${esc(e.inst)} ${esc(e.side || '')}${e.pts ? ', stop ' + e.pts : ''}${e.risk ? ', risk ' + usd(e.risk) : ''} · list ${e.checks}/${e.of}${e.ritual ? ' · ritual' : ''}</span><b>${e.taken ? 'TOOK IT' : 'passed'}</b></div>`).join('')
    : '<p class="hint">No checks logged yet. Run a check, then tap "Log this check" and say if you took the trade.</p>';
  $('broken').innerHTML = `<div class="stat"><div><b>${B.entries}</b><span>checks, 30 days</span></div><div><b>${B.brokenEntries}</b><span>taken against the rules</span></div><div><b>${B.cleanDays == null ? (B.taken ? 'all clean' : '-') : B.cleanDays + ' d'}</b><span>since the last break</span></div></div>`
    + (B.by.length ? B.by.map((x) => `<div class="rule"><s>${x.n}×</s>${esc(x.label)}</div>`).join('') : `<p class="hint">${B.taken ? 'Every trade you logged followed the war room.' : 'Nothing broken on record. Self-reported: only what you log here.'}</p>`)
    + (B.warned.length ? `<p class="hint">Warnings taken anyway: ${B.warned.slice(0, 3).map((x) => esc(x.label) + ' ' + x.n + '×').join(' · ')}.</p>` : '');
  $('logCheck').disabled = !R.size.valid;
}

function logCheck(S, took) {
  const R = S.last, ritual = W.ritualAt && Date.now() - W.ritualAt < 15 * 60e3;
  const list = store.read(); list.push(journalEntry(R, S.st, new Date(), took, ritual)); store.write(list);
  $('logAsk').hidden = true;
  journal(S, R);
  const f = FX(); if (f && f.toast) f.toast(document.body, { text: took ? (R.level === 'go' ? 'Logged: taken, by the book.' : `Logged: taken against ${R.level.toUpperCase()}.`) : 'Logged: passed on it.', kind: took && R.level !== 'go' ? 'warn' : 'ok', seconds: 2.4 });
}

// ------------------------------------------------------------------------------------------------ the 60-second ritual
function ritualDraw() {
  const s = RITUAL_S - W.left, step = [...STEPS].reverse().find(([t]) => s >= t) || STEPS[0];
  $('ritualN').textContent = W.timer ? String(Math.ceil(W.left)) : W.ritualAt && Date.now() - W.ritualAt < 15 * 60e3 ? 'done' : String(RITUAL_S);
  $('ritualTxt').textContent = W.timer ? step[1] : W.ritualAt && Date.now() - W.ritualAt < 15 * 60e3 ? 'Ritual done. Now tick the list honestly.' : 'One minute before you click: breathe, read the size, name what makes you wrong.';
  $('ritualBtn').textContent = W.timer ? 'Stop' : 'Start the ritual';
  const f = FX();
  if (f && f.progressRing) { const v = W.timer ? 1 - W.left / RITUAL_S : (W.ritualAt && Date.now() - W.ritualAt < 15 * 60e3 ? 1 : 0); if (!W.ring || W.ring.stopped) W.ring = f.progressRing($('ritualRing'), { value: v, stroke: 6 }); else W.ring.set(v); }
}
function ritualToggle() {
  if (W.timer) { clearInterval(W.timer); W.timer = 0; W.left = RITUAL_S; ritualDraw(); return; }
  W.t0 = Date.now(); W.left = RITUAL_S;
  W.timer = setInterval(() => {
    W.left = Math.max(0, RITUAL_S - (Date.now() - W.t0) / 1000);
    if (W.left <= 0) {
      clearInterval(W.timer); W.timer = 0; W.ritualAt = Date.now(); W.left = RITUAL_S;
      const f = FX(); if (f && f.sparkleBurst) f.sparkleBurst($('ritualRing'), { count: 26 });
    }
    ritualDraw();
  }, 250);
  ritualDraw();
}

// ------------------------------------------------------------------------------------------------ the share card
export function drawShare(S) {
  const sp = shareSpec(S.last, S.st), col = { go: '#9bab63', wait: '#e0a060', halt: '#c96a4a' }[sp.level];
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1350;
  const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 1350);
  g.addColorStop(0, '#15110c'); g.addColorStop(1, '#0a0907'); x.fillStyle = g; x.fillRect(0, 0, 1080, 1350);
  x.strokeStyle = col; x.lineWidth = 6; x.strokeRect(36, 36, 1008, 1278);
  x.textAlign = 'center'; x.fillStyle = '#e0907a'; x.font = '700 40px "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif'; x.fillText('ARES · THE WAR ROOM', 540, 130);
  x.fillStyle = col; x.font = '800 260px "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif'; x.fillText(sp.word, 540, 480); x.shadowBlur = 0;
  x.fillStyle = '#f3ece0'; x.font = '700 48px -apple-system,"SF Pro Text",system-ui,sans-serif'; x.fillText(sp.title.toUpperCase(), 540, 590);
  x.font = '600 46px -apple-system,"SF Pro Text",system-ui,sans-serif'; x.fillStyle = '#f3ece0';
  sp.lines.slice(0, 6).forEach((t, i) => { const s = String(t); x.fillText(s.length > 56 ? s.slice(0, 55) + '…' : s, 540, 700 + i * 78); });
  x.fillStyle = '#afa79e'; x.font = '500 34px -apple-system,"SF Pro Text",system-ui,sans-serif'; x.fillText(sp.note, 540, 1260);
  return c;
}
async function share(S) {
  const c = drawShare(S), blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  if (!blob) return null;
  const file = new File([blob], 'ares-check.png', { type: 'image/png' });
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Ares: my check' }); return 'shared'; } } catch (_) { /* cancelled: nothing */ return 'cancelled'; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ares-check.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'downloaded';
}

// ------------------------------------------------------------------------------------------------ the page's hooks
export function initDesk(S, update, save) {
  scenarios(S, update, save);
  $('ritualBtn').addEventListener('click', ritualToggle);
  $('logCheck').addEventListener('click', () => { $('logAsk').hidden = false; });
  $('logTook').addEventListener('click', () => logCheck(S, true));
  $('logPassed').addEventListener('click', () => logCheck(S, false));
  $('clearJournal').addEventListener('click', () => { store.write([]); journal(S, S.last); });
  $('shareBtn').addEventListener('click', async () => { const r = await share(S); const f = FX(); if (f && f.toast && r) f.toast(document.body, { text: r === 'cancelled' ? 'Share cancelled' : 'Check card ready', kind: 'ok', seconds: 1.8 }); });
  ritualDraw();
}
export function renderDesk(S, R) { drawdown(S); journal(S, R); ritualDraw(); }
export const desk = { journal: () => store.read(), clear: () => store.write([]), ritual: () => ({ running: !!W.timer, at: W.ritualAt }) };
