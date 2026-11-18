// OLYMPUS SETTINGS page (ES module): the controls over this phone's Olympus keys (settingscore.js has the rules), the storage manager,
// the health shortcuts and the first-run tour. Text only through textContent; no network at all (a settings page must work offline);
// keys and tokens are never read for display, exported, imported or cleared. window.SETTINGS is the test hook.
import * as C from './settingscore.js?v=s4';

const O = window.OLYMPUS || null, T = window.OLYMPUS_THEMES || null;
const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const mem = (() => { const m = {}; return { get length() { return Object.keys(m).length; }, key: (i) => Object.keys(m)[i] || null, getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } }; })();
const LS = (() => { try { localStorage.setItem('olympus.probe', '1'); localStorage.removeItem('olympus.probe'); return localStorage; } catch (_) { return mem; } })();
const mq = (q) => { try { return !!(window.matchMedia && window.matchMedia(q).matches); } catch (_) { return false; } };
const SFX = () => window.OLYMPUS_SFX || null;
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const sget = (k) => { try { return JSON.parse(LS.getItem(k) || 'null') || {}; } catch (_) { return {}; } };

// ------------------------------------------------------------------------------------------------ the tier now, LITE
const fxNow = () => (O && O.fx ? O.fx() : C.fxGet(LS) || 'high');
const reduced = () => mq('(prefers-reduced-motion: reduce)') || fxNow() === 'off';
function paintLite() {
  const lite = fxNow() === 'low' || fxNow() === 'off' || mq('(prefers-reduced-motion: reduce)');
  if (lite) root.setAttribute('data-lite', '1'); else root.removeAttribute('data-lite');
  $('lite').hidden = !lite;
  $('lite').textContent = fxNow() === 'off' || mq('(prefers-reduced-motion: reduce)') ? 'STILL' : 'LITE';
}

// ------------------------------------------------------------------------------------------------ tabs
const TABS = ['look', 'jarvis', 'data', 'system'];
function selectTab(id, focus) {
  if (TABS.indexOf(id) < 0) id = 'look';
  for (const t of TABS) {
    const b = $('t-' + t), on = t === id;
    b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; $('p-' + t).hidden = !on;
    if (on && focus) b.focus();
  }
  if (id === 'data') renderData();
  if (id === 'jarvis') renderJarvis();
  preview.sync();
  try { sessionStorage.setItem('settings.tab', id); } catch (_) { /* private mode */ }
}
$('tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) selectTab(b.getAttribute('data-tab')); });
$('tabs').addEventListener('keydown', (e) => {
  const i = TABS.findIndex((t) => $('t-' + t).getAttribute('aria-selected') === 'true');
  const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1;
  if (n >= 0) { e.preventDefault(); selectTab(TABS[(n + TABS.length) % TABS.length], true); }
});

// ------------------------------------------------------------------------------------------------ segmented radios
function radios(host, items, current, onPick) {
  clear(host);
  for (const it of items) {
    const b = h('button', null, it[1]); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('data-v', it[0]);
    b.setAttribute('aria-checked', String(it[0] === current));
    if (it[2]) b.title = it[2];
    b.addEventListener('click', () => onPick(it[0]));
    host.appendChild(b);
  }
}

// ------------------------------------------------------------------------------------------------ the live quality preview (a small canvas, drawn only while it is on screen)
const preview = (() => {
  const cv = $('fxCanvas'), g = cv.getContext && cv.getContext('2d');
  const N = { ultra: 90, high: 56, low: 22, off: 0 };
  let raf = 0, t0 = 0, last = 0, k = 1, cssW = 300, cssH = 96, rgb = '183, 155, 255';
  const dots = Array.from({ length: 90 }, (_, i) => ({ a: (i * 2.399963) % 6.2832, r: 0.15 + ((i * 37) % 100) / 130, s: 0.3 + ((i * 53) % 100) / 160, z: 0.4 + ((i * 29) % 100) / 100 }));
  // perf v2: the backing store follows the CSS box x the screen's pixel ratio (it was 300 x 96 stretched: blurry on a 3x phone and at 4K),
  // measured on a resize only; the accent colour is read once per repaint request, not with a style read every frame
  function fit() {
    const b = cv.getBoundingClientRect(); if (!b.width || !b.height) return;
    cssW = b.width; cssH = b.height; k = Math.min(3, window.devicePixelRatio || 1);
    const W = Math.round(cssW * k), H = Math.round(cssH * k);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    rgb = getComputedStyle(root).getPropertyValue('--oly-accent-rgb').trim() || '183, 155, 255';
  }
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { fit(); draw((performance.now() - (t0 || performance.now())) / 1000); }).observe(cv);
  function draw(t) {
    if (!g) return;
    const lv = fxNow(), n = N[lv] == null ? N.high : N[lv], w = cssW, hgt = cssH;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.clearRect(0, 0, w, hgt);
    if (lv === 'ultra' || lv === 'high') { const gr = g.createRadialGradient(w / 2, hgt / 2, 4, w / 2, hgt / 2, w / 2.2); gr.addColorStop(0, 'rgba(' + rgb + ',.35)'); gr.addColorStop(1, 'rgba(' + rgb + ',0)'); g.fillStyle = gr; g.fillRect(0, 0, w, hgt); }
    g.fillStyle = 'rgba(' + rgb + ',.9)';
    const move = lv !== 'off' && !mq('(prefers-reduced-motion: reduce)') ? t : 0;
    for (let i = 0; i < n; i++) {
      const d = dots[i], a = d.a + move * d.s * (lv === 'low' ? 0.5 : 1), x = w / 2 + Math.cos(a) * d.r * w * 0.46, y = hgt / 2 + Math.sin(a) * d.r * hgt * 0.42;
      g.globalAlpha = lv === 'low' ? 0.7 : 0.35 + 0.65 * d.z;
      g.beginPath(); g.arc(x, y, (lv === 'ultra' ? 2.4 : 1.8) * d.z + 0.4, 0, 6.2832); g.fill();
    }
    g.globalAlpha = 1;
    if (lv === 'off') { g.fillStyle = 'rgba(255,255,255,.55)'; g.font = '600 12px sans-serif'; g.textAlign = 'center'; g.fillText('Still: nothing moves', w / 2, hgt / 2 + 4); }
    const tag = (lv === 'low' ? 'BATTERY · LITE' : lv === 'off' ? 'STILL' : lv === 'ultra' ? 'ULTRA 4K' : lv.toUpperCase()) + ' · ' + n + ' motes';
    if ($('fxTag').textContent !== tag) $('fxTag').textContent = tag;      // perf v2: a DOM write only when it changes (it ran 30 times a second)
  }
  // perf v2 (2026-11-14): the preview moves only while it is on screen and someone is using the page (a touch, a key, a scroll, or the first
  // 8 s after a change); then it holds a still frame (0 draws, the page idles at ~0 CPU) and wakes on the next touch.
  let onScreen = true, wakeTo = performance.now() + 8000;
  const active = (now) => now < wakeTo || !(O && O.idle && O.idle());
  function frame(now) {
    raf = 0;
    if (document.hidden || $('p-look').hidden || !onScreen) return;
    const lv = fxNow(), gap = lv === 'low' ? 66 : 33;
    if (!t0) t0 = now;
    if (now - last >= gap) { last = now; draw((now - t0) / 1000); }
    if (lv !== 'off' && !mq('(prefers-reduced-motion: reduce)') && active(now)) raf = requestAnimationFrame(frame);
  }
  function sync() { wakeTo = Math.max(wakeTo, performance.now() + 8000); fit(); draw((performance.now() - (t0 || performance.now())) / 1000); if (!raf && !$('p-look').hidden && onScreen) raf = requestAnimationFrame(frame); }
  document.addEventListener('visibilitychange', sync);
  const wake = () => { if (!raf && !document.hidden && onScreen && !$('p-look').hidden) { wakeTo = Math.max(wakeTo, performance.now() + 4000); raf = requestAnimationFrame(frame); } };
  ['pointerdown', 'keydown', 'wheel', 'scroll', 'touchstart'].forEach((e) => window.addEventListener(e, wake, { passive: true, capture: true }));
  if (typeof IntersectionObserver === 'function') new IntersectionObserver((es) => { onScreen = es[es.length - 1].isIntersecting; if (onScreen) wake(); }).observe(cv);
  return { sync, draw };
})();

// ------------------------------------------------------------------------------------------------ Look
function setFx(v) {
  if (v === 'auto') { try { LS.removeItem('jfx'); } catch (_) { /* nothing */ } if (O && O.setFx) { /* the kit has no clear: the page follows the key */ } }
  else if (O && O.setFx) O.setFx(v); else { try { LS.setItem('jfx', v); } catch (_) { /* nothing */ } }
  try { window.dispatchEvent(new StorageEvent('storage', { key: 'jfx' })); } catch (_) { /* old browser */ }
  renderLook();
}
function renderLook() {
  const cur = C.fxGet(LS), level = fxNow();
  radios($('fxSeg'), [['auto', 'Auto']].concat(C.FX_LEVELS.map((l) => [l[0], l[1], l[2]])), cur || 'auto', setFx);
  const d = C.FX_LEVELS.find((l) => l[0] === level);
  $('fxNote').textContent = (cur ? '' : 'Auto picks High and sharpens to your screen\'s full resolution while it stays smooth (Battery if your phone asks for less motion). ') + (d ? d[2] + '.' : '');
  paintLite(); preview.sync(); renderWhy(level, cur); renderRead();
  // themes
  const list = T && T.list ? T.list() : [], now = T && T.id ? (T.id() || 'agora') : 'olympus', host = $('themes');
  clear(host);
  if (!list.length) host.appendChild(h('p', 'hint', 'Themes are not available in this copy.'));
  for (const t of list) {
    const tk = t.tokens || {}, b = h('button', 'theme'); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('data-id', t.id); b.setAttribute('aria-checked', String(t.id === now));
    b.style.background = 'linear-gradient(135deg, ' + (tk.bg2 || tk.bg || '#131210') + ', ' + (tk.bg || '#14110e') + ')'; b.style.color = tk.text || '#f3ece0';
    const dots = h('span', 'sw3');
    for (const c of [tk.accent, tk.accent2, tk.glow]) { const i = h('i'); i.style.background = c || '#888683'; dots.appendChild(i); }
    b.appendChild(dots); b.appendChild(h('b', null, t.name)); b.appendChild(h('small', null, t.tag || ''));
    b.addEventListener('click', () => { T.set(t.id); renderLook(); });
    host.appendChild(b);
  }
  $('grain').checked = !!(T && T.grain && T.grain());
  // motion and battery
  $('rmNote').textContent = mq('(prefers-reduced-motion: reduce)') ? 'Your phone asks for less motion: Olympus follows it' : 'Your phone allows motion';
  $('still').textContent = level === 'off' ? 'Back to normal' : 'Make everything still';
  $('saver').checked = C.saverOn(LS);
  $('intro').checked = !C.flagOff(LS, C.KEYS.intro);
  $('introPrev').classList.toggle('off', C.flagOff(LS, C.KEYS.intro));
  $('trans').checked = !C.flagOff(LS, C.KEYS.trans);
  const vt = typeof document.startViewTransition === 'function';
  $('transNote').textContent = vt ? 'This phone supports it' : 'This phone has no page glide: it takes effect where it does';
  $('transTry').disabled = !vt;
  // sound
  const s = sget(C.KEYS.sfx), vol = typeof s.v === 'number' ? s.v : 0.35;
  $('sfxOn').checked = s.m !== true; $('vol').value = String(Math.round(vol * 100));
  $('ambient').checked = LS.getItem(C.KEYS.ambient) === '1';
  radios($('soundSeg'), C.SOUND_MODES, C.soundGet(LS), (v) => setSound(v));
  $('soundNote').textContent = C.SOUND_MODES.find((m) => m[0] === C.soundGet(LS))[0] === 'auto' ? 'Auto: ' + C.SOUND_MODES[0][2].toLowerCase() : C.SOUND_MODES.find((m) => m[0] === C.soundGet(LS))[2];
  $('haptics').checked = !C.flagOff(LS, C.KEYS.haptics);
  const canVib = typeof navigator.vibrate === 'function';
  $('hapNote').textContent = canVib ? 'A tiny buzz on taps' : 'The iPhone has no vibration for web pages: this works on Android';
}
/** the quality explainer: why this level now, and what each level means (plain words, settingscore.js has the text) */
function renderWhy(level, cur) {
  $('fxWhy').textContent = C.fxWhy({ saver: C.saverOn(LS), reduced: mq('(prefers-reduced-motion: reduce)'), chosen: cur, level });
  const ul = $('fxLevels'); clear(ul);
  for (const l of C.FX_EXPLAIN) {
    const li = h('li', l[0] === level ? 'now' : null), b = h('b', null, l[1]);
    if (l[0] === level) b.appendChild(h('em', null, 'NOW'));
    li.appendChild(b); li.appendChild(h('span', null, l[2])); li.appendChild(h('small', null, 'Costs: ' + l[3] + '. Best for: ' + l[4] + '.'));
    ul.appendChild(li);
  }
}
/** Reading: Big text and Stronger contrast are the kit's own toggles (olympus/a11y.js reads data-oly-a11y and keeps aria-pressed); this only words them */
const A11Y = () => window.OLYMPUS_A11Y || null;
function renderRead() {
  const a = A11Y();
  if (!a) { $('bigNote').textContent = 'Not available in this copy of the page'; $('conNote').textContent = ''; $('bigText').disabled = true; $('moreContrast').disabled = true; return; }
  const g = a.get(), s = a.scale(), more = g.contrast === 'more' || mq('(prefers-contrast: more)');
  $('bigText').textContent = 'Big text: ' + (g.text === 'big' ? 'on' : 'off'); $('bigText').setAttribute('aria-pressed', String(g.text === 'big'));
  $('bigNote').textContent = 'Text is ' + Math.round(s * 100) + '% of normal' + (g.text === 'big' ? ' (big text adds 25%)' : '') + '. Your iPhone text size counts too.';
  $('moreContrast').textContent = 'Contrast: ' + (more ? 'stronger' : 'normal'); $('moreContrast').setAttribute('aria-pressed', String(g.contrast === 'more'));
  $('conNote').textContent = more ? (g.contrast === 'more' ? 'Brighter lines and text' : 'Your phone asks for stronger contrast: Olympus follows it') : 'Normal lines and ink';
}
if (A11Y() && A11Y().on) A11Y().on(renderRead);
window.addEventListener('load', () => { if (A11Y() && A11Y().on && !renderRead.wired) { renderRead.wired = true; A11Y().on(renderRead); } renderRead(); });
$('fxSeg').addEventListener('keydown', radioKeys);
function radioKeys(e) {
  const bs = [...e.currentTarget.querySelectorAll('[role=radio]')], i = bs.indexOf(document.activeElement);
  const n = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? i - 1 : -1;
  if (n >= 0 && bs.length) { e.preventDefault(); bs[(n + bs.length) % bs.length].focus(); bs[(n + bs.length) % bs.length].click(); }
}
$('grain').addEventListener('change', (e) => { if (T && T.grain) T.grain(e.target.checked); });
$('still').addEventListener('click', () => setFx(fxNow() === 'off' ? 'high' : 'off'));
$('saver').addEventListener('change', (e) => {
  C.saverSet(LS, e.target.checked);
  const s = SFX(); try { if (s && s.mute) s.mute(sget(C.KEYS.sfx).m === true); } catch (_) { /* nothing */ }
  try { window.dispatchEvent(new StorageEvent('storage', { key: 'jfx' })); } catch (_) { /* old browser */ }
  renderLook();
});
$('intro').addEventListener('change', (e) => { C.flagSet(LS, C.KEYS.intro, !e.target.checked); renderLook(); });
$('trans').addEventListener('change', (e) => { C.flagSet(LS, C.KEYS.trans, !e.target.checked); renderLook(); });
$('transTry').addEventListener('click', () => {
  const box = $('introPrev'), flip = () => box.classList.toggle('flip');
  try { if (typeof document.startViewTransition === 'function' && !C.flagOff(LS, C.KEYS.trans) && !reduced()) document.startViewTransition(flip); else flip(); } catch (_) { flip(); }
});
// sounds: the kit's own OLYMPUS_SFX saves the volume and the mute to 'olympus.sfx'
function sfxSave(patch) { const s = sget(C.KEYS.sfx), o = Object.assign({ v: 0.35, m: false }, s, patch); try { LS.setItem(C.KEYS.sfx, JSON.stringify(o)); } catch (_) { /* nothing */ } }
$('sfxOn').addEventListener('change', (e) => {
  sfxSave({ m: !e.target.checked }); const s = SFX(); try { if (s && s.mute) s.mute(!e.target.checked); } catch (_) { /* nothing */ }
  if (e.target.checked) playTry();
});
$('vol').addEventListener('input', (e) => { const v = +e.target.value / 100; sfxSave({ v }); const s = SFX(); try { if (s && s.setVolume) s.setVolume(v); } catch (_) { /* nothing */ } });
$('vol').addEventListener('change', () => playTry());
/** the Sound switch: the kit applies it (OLYMPUS_SFX.sound(null | true | false)) and stores it; without the kit the stored key is enough */
function setSound(mode) {
  C.soundSet(LS, mode);
  const s = SFX(); try { if (s && s.sound) s.sound(mode === 'auto' ? null : mode === 'on'); } catch (_) { /* nothing */ }
  renderLook();
}
/** a test sound: a success cue; says why when the switch keeps it silent */
function soundTest() {
  const s = SFX(); let said = 'Played the success cue';
  try {
    if (!s) said = 'The sound kit did not load';
    else { if (s.unlock) s.unlock(); if (s.state && s.state().muted) said = 'Sounds are switched off above'; else if (s.sound && !s.sound()) said = 'Silent: Auto stays quiet in LITE, reduced motion and battery saver. Choose On to hear it'; else if (!s.play('success')) said = 'Silent: this browser has no sound yet'; }
  } catch (_) { said = 'Silent: this browser has no sound'; }
  $('soundTestNote').textContent = said;
}
$('soundTest').addEventListener('click', soundTest);
function playTry() { const s = SFX(); try { if (s) { if (s.unlock) s.unlock(); if (s.play) s.play('tap'); } } catch (_) { /* nothing */ } }
$('sfxTry').addEventListener('click', playTry);
$('ambient').addEventListener('change', (e) => {
  try { if (e.target.checked) LS.setItem(C.KEYS.ambient, '1'); else LS.removeItem(C.KEYS.ambient); } catch (_) { /* nothing */ }
  const s = SFX(); try { if (s) { if (e.target.checked) { if (s.unlock) s.unlock(); s.play('pad'); } else if (s.stop) s.stop('pad'); } } catch (_) { /* nothing */ }
});
$('haptics').addEventListener('change', (e) => {
  C.flagSet(LS, C.KEYS.haptics, !e.target.checked);
  if (e.target.checked) { try { if (navigator.vibrate) navigator.vibrate(12); } catch (_) { /* nothing */ } }
});

// ------------------------------------------------------------------------------------------------ Jarvis
function renderJarvis() {
  radios($('engSeg'), C.ENGINE_MODES.map((m) => [m[0], m[1], m[2]]), C.engineGet(LS), (v) => { C.engineSet(LS, v); renderJarvis(); });
  const em = C.ENGINE_MODES.find((m) => m[0] === C.engineGet(LS));
  $('engNote').textContent = em ? em[2] + '.' : '';
  $('speak').checked = C.speakOn(LS);
  const a = C.alertsGet(LS);
  $('aSpeak').checked = a.speak; $('aBrief').checked = a.brief; $('aQuiet').checked = a.quiet; $('aFrom').value = a.from; $('aTo').value = a.to;
  $('aFrom').disabled = $('aTo').disabled = !a.quiet;
  radios($('modeSeg'), C.MODES, C.modeGet(LS), (v) => { C.modeSet(LS, v); renderJarvis(); });
  const b = C.brainStatus(LS), v = C.vaultStatus(LS);
  $('brainSt').textContent = b.saved ? 'SAVED' : 'NOT SAVED'; $('brainSt').classList.toggle('on', b.saved);
  $('brainNote').textContent = b.saved ? b.providers.join(', ') + (b.on ? ' · smart mode on' : ' · smart mode off') : 'Smart mode needs a free key (the tour shows how)';
  $('vaultSt').textContent = v.connected ? 'CONNECTED' : 'NOT CONNECTED'; $('vaultSt').classList.toggle('on', v.connected);
  $('vaultNote').textContent = v.connected ? v.repo : 'Your notes vault is not linked';
}
$('speak').addEventListener('change', (e) => C.speakSet(LS, e.target.checked));
for (const [id, k] of [['aSpeak', 'speak'], ['aBrief', 'brief'], ['aQuiet', 'quiet']]) $(id).addEventListener('change', (e) => { C.alertsSet(LS, { [k]: e.target.checked }); renderJarvis(); });
$('aFrom').addEventListener('change', (e) => { if (e.target.value) C.alertsSet(LS, { from: e.target.value }); });
$('aTo').addEventListener('change', (e) => { if (e.target.value) C.alertsSet(LS, { to: e.target.value }); });

// ------------------------------------------------------------------------------------------------ Data
let sheetAct = null;
function askSheet(title, text, kept, yes, label) {
  $('shT').textContent = title; $('shP').textContent = text;
  const l = $('shL'); clear(l);
  if (kept && kept.length) { l.appendChild(h('li', null, 'Kept, never cleared: ' + kept.join(', '))); }
  $('shYes').textContent = label || 'Clear'; sheetAct = yes; $('sheet').hidden = false; $('shNo').focus();
}
const closeSheet = () => { $('sheet').hidden = true; sheetAct = null; };
$('shNo').addEventListener('click', closeSheet);
$('shYes').addEventListener('click', () => { const f = sheetAct; closeSheet(); if (f) f(); });
$('sheet').addEventListener('click', (e) => { if (e.target === $('sheet')) closeSheet(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('sheet').hidden) closeSheet(); });

async function renderData() {
  const sum = C.summarize(LS);
  let use = null, quota = null;
  try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); use = e.usage; quota = e.quota; } } catch (_) { /* no estimate */ }
  const shown = Math.max(use || 0, sum.total.bytes);
  $('stUse').textContent = C.fmtBytes(shown);
  $('stOf').textContent = quota ? 'of ' + C.fmtBytes(quota) + ' this site may use' : 'saved by Olympus on this phone';
  $('stBar').firstElementChild.style.width = quota ? Math.max(1, Math.min(100, (shown / quota) * 100)).toFixed(1) + '%' : '0%';
  $('stNote').textContent = sum.total.keys + ' saved settings (' + C.fmtBytes(sum.total.bytes) + ' of text)' + (sum.total.kept ? ' · ' + sum.total.kept + ' secret' + (sum.total.kept === 1 ? '' : 's') + ' kept out of every list' : '') + '.';
  const ul = $('appList'); clear(ul);
  $('clearAll').disabled = sum.total.keys === 0;
  if (!sum.groups.length) ul.appendChild(h('li', null, 'Nothing saved yet.'));
  for (const g of sum.groups) {
    const li = h('li'); li.setAttribute('data-app', g.id);
    li.appendChild(h('b', null, g.name));
    li.appendChild(h('small', 'about', C.aboutOf(g.id)));
    const b = h('button', 'mini', 'Clear'); b.type = 'button'; b.disabled = g.count === 0; b.setAttribute('aria-label', 'Clear ' + g.name + ' saved data');
    b.addEventListener('click', () => askSheet('Clear ' + g.name + '?', 'This removes ' + g.count + ' saved setting' + (g.count === 1 ? '' : 's') + ' (' + C.fmtBytes(g.bytes) + ') of ' + g.name + ' from this phone. The app starts fresh.', g.kept, () => { const r = C.clearApp(LS, g.id); $('ioNote').textContent = 'Cleared ' + r.removed.length + ' for ' + g.name + (r.kept.length ? ', kept ' + r.kept.length + ' secret' : '') + '.'; renderAll(); }));
    li.appendChild(b);
    li.appendChild(h('small', null, g.count + ' saved · ' + C.fmtBytes(g.bytes)));
    if (g.kept.length) li.appendChild(h('small', 'kept', 'Kept (secret): ' + g.kept.join(', ')));
    ul.appendChild(li);
  }
  renderRecords();
  await renderCaches();
}
function renderRecords() {
  const rep = C.recordsReport(LS), ul = $('recList'); clear(ul);
  $('addrText').textContent = C.ADDRESS_WARNING.text;
  let where = ''; try { where = location.origin; } catch (_) { where = ''; }
  $('addrNow').textContent = 'This phone is saving under: ' + (where || 'this site') + ' (' + rep.present + ' of your records here, ' + C.fmtBytes(rep.bytes) + ').';
  for (const r of rep.rows) {
    const li = h('li'); li.setAttribute('data-key', r.key); li.setAttribute('data-present', r.present ? '1' : '0');
    li.appendChild(h('b', null, r.app));
    li.appendChild(h('small', 'about', r.what));
    li.appendChild(h('small', null, r.present ? r.key + ' · ' + C.fmtBytes(r.bytes) : r.key + ' · not used yet'));
    ul.appendChild(li);
  }
}
$('clearAll').addEventListener('click', () => {
  const sum = C.summarize(LS);
  askSheet('Clear everything saved on this phone?', 'This removes ' + sum.total.keys + ' saved settings (' + C.fmtBytes(sum.total.bytes) + ') from every app: your look, choices, drafts and last-seen markers. Export first if you want a copy.',
    sum.groups.flatMap((g) => g.kept), () => {
      const r = C.clearAll(LS);
      $('ioNote').textContent = 'Cleared ' + r.removed.length + ' saved setting' + (r.removed.length === 1 ? '' : 's') + (r.kept.length ? ', kept ' + r.kept.length + ' secret' + (r.kept.length === 1 ? '' : 's') : '') + '.';
      try { window.dispatchEvent(new StorageEvent('storage', { key: 'jfx' })); } catch (_) { /* old browser */ }
      renderAll();
    }, 'Clear all');
});
async function cacheNames() { try { return typeof caches !== 'undefined' && caches.keys ? await caches.keys() : []; } catch (_) { return []; } }
async function renderCaches() {
  const names = await cacheNames(), ul = $('cacheList'); clear(ul);
  $('cacheAll').disabled = !names.length;
  if (!names.length) { ul.appendChild(h('li', null, 'No offline caches on this phone yet.')); return; }
  for (const n of names) {
    let count = 0;
    try { count = (await (await caches.open(n)).keys()).length; } catch (_) { count = 0; }
    const li = h('li'); li.setAttribute('data-cache', n);
    li.appendChild(h('b', null, n));
    const b = h('button', 'mini', 'Clear'); b.type = 'button'; b.setAttribute('aria-label', 'Clear cache ' + n);
    b.addEventListener('click', () => askSheet('Clear the cache ' + n + '?', 'The ' + count + ' saved files download again the next time you are online. Your settings and keys are not touched.', [], async () => { try { await caches.delete(n); } catch (_) { /* gone */ } renderCaches(); }));
    li.appendChild(b); li.appendChild(h('small', null, count + ' files'));
    ul.appendChild(li);
  }
}
$('cacheAll').addEventListener('click', async () => {
  const names = await cacheNames();
  askSheet('Clear all caches?', names.length + ' offline cache' + (names.length === 1 ? '' : 's') + ' will be removed. Apps open online and save their files again. Your settings and keys are not touched.', [], async () => { for (const n of names) { try { await caches.delete(n); } catch (_) { /* gone */ } } renderCaches(); });
});
$('exportBtn').addEventListener('click', () => {
  const data = C.buildExport(LS), n = Object.keys(data.keys).length;
  const text = JSON.stringify(data, null, 1), blob = new Blob([text], { type: 'application/json' }), url = URL.createObjectURL(blob);
  const a = h('a'); a.href = url; a.download = 'olympus-data-' + new Date().toISOString().slice(0, 10) + '.json'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  $('ioNote').textContent = 'Saved ' + n + ' entries (' + C.fmtBytes(text.length) + '). ' + data.kept.length + ' secret' + (data.kept.length === 1 ? '' : 's') + ' left out on purpose.';
});
$('importFile').addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0]; e.target.value = '';
  if (!f) return;
  let obj = null;
  try { obj = JSON.parse(await f.text()); } catch (_) { obj = null; }
  const c = C.checkImport(obj);
  if (!c.ok) { $('ioNote').textContent = c.reason || 'That file could not be read.'; return; }
  askSheet('Import ' + c.count + ' entries?', 'They replace the same entries on this phone.' + (c.skipped.length ? ' ' + c.skipped.length + ' will be skipped (secrets and odd names).' : ''), [], () => {
    const r = C.applyImport(LS, obj); $('ioNote').textContent = 'Imported ' + r.written.length + ' entries, skipped ' + r.skipped.length + '.';
    if (T && T.apply) { try { T.set(T.id() || 'agora'); } catch (_) { /* nothing */ } }
    renderAll();
  }, 'Import');
});

// ------------------------------------------------------------------------------------------------ the tour
const NS = 'http://www.w3.org/2000/svg';
function node(tag, attrs, kids) { const e = document.createElementNS(NS, tag); for (const k in attrs || {}) e.setAttribute(k, attrs[k]); for (const c of kids || []) e.appendChild(c); return e; }
const GLYPH = {
  seal: () => [node('circle', { cx: 48, cy: 48, r: 38, fill: 'none', stroke: 'currentColor', 'stroke-width': 3, class: 'gp' }), node('g', { class: 'gr', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.5 }, [node('path', { d: 'M48 18 L74 62 L22 62 Z' }), node('path', { d: 'M48 78 L22 34 L74 34 Z' })])],
  orb: () => [node('circle', { cx: 48, cy: 48, r: 30, fill: 'currentColor', opacity: '.25', class: 'gp' }), node('circle', { cx: 48, cy: 48, r: 18, fill: 'currentColor' }), node('g', { class: 'gr', fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }, [node('ellipse', { cx: 48, cy: 48, rx: 40, ry: 14 })])],
  apps: () => [node('g', { fill: 'none', stroke: 'currentColor', 'stroke-width': 3 }, [node('rect', { x: 14, y: 14, width: 30, height: 30, rx: 8 }), node('rect', { x: 52, y: 14, width: 30, height: 30, rx: 8 }), node('rect', { x: 14, y: 52, width: 30, height: 30, rx: 8 }), node('rect', { x: 52, y: 52, width: 30, height: 30, rx: 8, class: 'gp' })])],
  city: () => [node('g', { fill: 'none', stroke: 'currentColor', 'stroke-width': 3 }, [node('path', { d: 'M14 80 V46 H34 V80 M34 80 V24 H58 V80 M58 80 V40 H82 V80 M10 80 H86', class: 'gp' })])],
  link: () => [node('g', { fill: 'none', stroke: 'currentColor', 'stroke-width': 4, 'stroke-linecap': 'round' }, [node('path', { d: 'M40 56 L56 40' }), node('path', { d: 'M34 46 L24 56 A12 12 0 0 0 40 72 L50 62' }), node('path', { d: 'M62 50 L72 40 A12 12 0 0 0 56 24 L46 34' })])],
  home: () => [node('g', { fill: 'none', stroke: 'currentColor', 'stroke-width': 3 }, [node('rect', { x: 26, y: 10, width: 44, height: 76, rx: 10 }), node('path', { d: 'M48 56 V30 M38 40 L48 30 L58 40', 'stroke-linecap': 'round', class: 'gp' })])],
};
const tour = { i: 0, open: false, from: null };
function tourRender() {
  const c = C.TOUR[tour.i], last = tour.i === C.TOUR.length - 1;
  $('tourT').textContent = c.title; $('tourText').textContent = c.text; $('tourStep').textContent = (tour.i + 1) + ' of ' + C.TOUR.length;
  const gl = $('tourGlyph'); clear(gl);
  const svg = node('svg', { viewBox: '0 0 96 96', 'aria-hidden': 'true', style: 'color:var(--s-acc)' }, (GLYPH[c.glyph] || GLYPH.seal)()); gl.appendChild(svg);
  const links = $('tourLinks'); clear(links);
  for (const l of c.links || []) { const a = h('a', null, l[0]); a.href = l[1]; a.addEventListener('click', () => C.tourSet(LS, true)); links.appendChild(a); }
  const dots = $('tourDots'); clear(dots);
  for (let i = 0; i < C.TOUR.length; i++) dots.appendChild(h('i', i === tour.i ? 'on' : ''));
  $('tourBack').disabled = tour.i === 0; $('tourBack').style.visibility = tour.i === 0 ? 'hidden' : 'visible';
  $('tourNext').textContent = last ? 'Done' : 'Next';
}
function tourOpen(i) {
  tour.i = Math.max(0, Math.min(C.TOUR.length - 1, i || 0)); tour.open = true; tour.from = document.activeElement;
  $('tour').hidden = false; tourRender(); $('tourNext').focus();
}
function tourClose(done) {
  if (!tour.open) return;
  tour.open = false; $('tour').hidden = true; C.tourSet(LS, true);
  if (done) { try { const F = window.OLYMPUS_FX; if (F && F.confetti && !reduced()) F.confetti(document.body, { count: 80 }); } catch (_) { /* nothing */ } }
  try { if (tour.from && tour.from.focus) tour.from.focus(); } catch (_) { /* nothing */ }
}
function tourStep(d) {
  const n = tour.i + d;
  if (n >= C.TOUR.length) { tourClose(true); return; }
  if (n < 0) return;
  tour.i = n; tourRender(); const s = SFX(); try { if (s && s.play) s.play('tick'); } catch (_) { /* nothing */ }
}
$('tourNext').addEventListener('click', () => tourStep(1));
$('tourBack').addEventListener('click', () => tourStep(-1));
$('tourSkip').addEventListener('click', () => tourClose(false));
$('tourBtn').addEventListener('click', () => tourOpen(0));
$('tourBtn2').addEventListener('click', () => tourOpen(0));
document.addEventListener('keydown', (e) => {
  if (!tour.open) return;
  if (e.key === 'Escape') tourClose(false); else if (e.key === 'ArrowRight') tourStep(1); else if (e.key === 'ArrowLeft') tourStep(-1);
  else if (e.key === 'Tab') {
    const f = [...$('tour').querySelectorAll('button:not([disabled]), a[href]')].filter((x) => x.getClientRects().length);
    if (!f.length) return;
    const first = f[0], lastEl = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); } else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
  }
});
(() => { let x0 = null; const box = $('tour'); box.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  box.addEventListener('touchend', (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 50) tourStep(dx < 0 ? 1 : -1); }, { passive: true }); })();

// ------------------------------------------------------------------------------------------------ start
function renderAll() { renderLook(); renderJarvis(); if (!$('p-data').hidden) renderData(); }
window.addEventListener('storage', () => { renderAll(); });
if (O && O.onFx) O.onFx(() => { renderLook(); });
if (T && T.on) T.on(() => { renderLook(); });
renderAll();
try { const q = new URLSearchParams(location.search); const want = (q.get('tab') || location.hash.slice(1) || sessionStorage.getItem('settings.tab') || 'look'); selectTab(want); } catch (_) { selectTab('look'); }
try { if (window.OLYMPUS_FX && window.OLYMPUS_FX.wire) window.OLYMPUS_FX.wire(); } catch (_) { /* the effects are optional */ }
$('about').textContent = 'OLYMPUS settings. ' + (O ? 'The kit is loaded.' : 'The kit did not load: the controls still work.') + ' Everything here is stored on this phone only.';
let auto = false;
try { const q = new URLSearchParams(location.search).get('tour'); auto = q === '1' || (q !== '0' && !C.tourDone(LS)); } catch (_) { auto = !C.tourDone(LS); }
if (auto) setTimeout(() => { if (!tour.open) tourOpen(0); }, 500);
try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
window.SETTINGS = { C, LS, renderAll, renderData, selectTab, tour: { open: tourOpen, close: tourClose, step: tourStep, state: tour }, preview };
