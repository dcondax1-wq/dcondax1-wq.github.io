// Zenith inside Jarvis + the settings code (2026-11-01, owner: "on Jarvis I can switch between that mode [Jarvis], zenith mode
// with all of the features"). Loaded by index.html with one <script defer> last. Read-only UI: it never arms, routes or
// changes the bot.
//
// 1. Settings code (every Zenith). On iPhone each Home Screen app keeps its own storage, so Zenith inside Jarvis does not
//    have the settings set in the Zenith app. Settings > "Settings for Jarvis" copies them as one line of text
//    (ZEN1.<base64url JSON>.<fnv-1a checksum>); Zenith inside Jarvis > Settings > "Inside Jarvis" pastes it, shows what it
//    holds, and applies it only on a tap (an Undo keeps the values it replaced). Only the keys listed in CARRY move, and
//    the list is checked again on paste:
//      look and motion   le.accent le.theme le.motion le.compact le.auto le.haptic le.haptics le.intro le.more.zoom le.more.contrast
//      3D                le.fx le.fxbg le.chart3d le.rp3d le.fx2d.* le.holo.*
//      notifications     le.more.notify (which kinds ring) le.plus.levels (alert levels) le.deck.mute le.deck.inf
//      page choices      le.act.f le.chartN le.ckSpan le.cmpPer le.dataSub le.heatM le.heatPer le.newsMm le.resEq le.rjSpan
//                        le.rkStop le.rkStopL le.rpSpeed le.rsYr le.trSrc le.trYear le.vView le.xSort le.acc.sel le.clean.adv
//                        le.ex.calm le.ex.calsrc le.ex.mffu le.ex.span le.at.span le.feat.open le.hs.span le.jf le.wi.stop
//                        le.wi.tgt le.goal.name le.goal.usd le.more.curveAcct le.more.shareKey le.pl.homeAll le.st.open
//                        le-perf-tab le.howto.* (the notes you closed)
//    Never: secrets and keys (le.jarvis.*: the Jarvis brain's chat and its own AI key), the phone's notification subscription
//    (le.push.*: each app subscribes on its own tap), what this app has seen or been asked (le.act.seen, le.feat.new,
//    le.goals.seen, le.deck.seen, le.mc.seen, le.intro.day, le.plus.acked, le.plus.levels_posted, le.more.instLater), searches
//    and history (le.feat.q, le.more.q, le.pl.recent, le.pl.visits), today's checklist ticks (le.ex.ops.*), remote-control
//    drafts (le.rcCmd, le.rcPauseAt), tilt to look around (le.gyro: needs the motion-sensor tap in each app), and every key
//    not listed here.
//
// 2. Inside Jarvis only (index.html's head sets window.LE_JARVIS for a same-site frame; jarvis/zenith-mode.js documents the
//    protocol): hello / state (route, title, alert badge = unseen activity) / layout (header and tab-bar room for Jarvis's
//    floating control, and whether a full-screen layer covers it) / exit to Jarvis; Jarvis's open (a route), insets (safe
//    areas), visible (hidden = paused like a backgrounded app: document.hidden, so the 3D scene and the polling stop) and
//    ping. Every message is posted to this site's origin only and accepted only from window.parent on this site's origin.
//    Links that would take the frame off Zenith (another site, or _top / _parent) open on their own instead. No intro,
//    no "Add to Home Screen" card, no notification prompt on Home; Settings opens with an "Inside Jarvis" card.
(function () {
  'use strict';
  if (typeof VIEWS === 'undefined' || typeof store === 'undefined') return;
  const J = window.LE_JARVIS === true;
  const nowS = () => Math.round(Date.now() / 1000);
  const ic = (n) => (typeof icon === 'function' ? icon(n) : '');
  const say = (t, ms) => { try { toast(t, ms); } catch (e) { /* no toast yet */ } };

  // ================================================================================================ 1. the settings code
  const CARRY = {
    look: ['le.accent', 'le.theme', 'le.motion', 'le.compact', 'le.auto', 'le.haptic', 'le.haptics', 'le.intro', 'le.more.zoom', 'le.more.contrast'],
    fx: ['le.fx', 'le.fxbg', 'le.chart3d', 'le.rp3d'],
    notify: ['le.more.notify', 'le.plus.levels', 'le.deck.mute', 'le.deck.inf'],
    pages: ['le.act.f', 'le.chartN', 'le.ckSpan', 'le.cmpPer', 'le.dataSub', 'le.heatM', 'le.heatPer', 'le.newsMm', 'le.resEq', 'le.rjSpan',
      'le.rkStop', 'le.rkStopL', 'le.rpSpeed', 'le.rsYr', 'le.trSrc', 'le.trYear', 'le.vView', 'le.xSort', 'le.acc.sel', 'le.clean.adv',
      'le.ex.calm', 'le.ex.calsrc', 'le.ex.mffu', 'le.ex.span', 'le.at.span', 'le.feat.open', 'le.hs.span', 'le.jf', 'le.wi.stop',
      'le.wi.tgt', 'le.goal.name', 'le.goal.usd', 'le.more.curveAcct', 'le.more.shareKey', 'le.pl.homeAll', 'le.st.open', 'le-perf-tab'],
  };
  const PREFIX = { fx: ['le.fx2d.', 'le.holo.'], pages: ['le.howto.'] };
  const GROUP_NAME = { look: 'look and motion', fx: '3D', notify: 'notifications', pages: 'page choices' };
  const RAW = new Set(['le-perf-tab']);                 // stored as plain text; every other key holds JSON (store.set)
  const KEYNAME = /^[\w.\-]{1,64}$/;
  function groupOf(k) {
    for (const g of Object.keys(CARRY)) if (CARRY[g].includes(k) || (PREFIX[g] || []).some((p) => k.startsWith(p))) return g;
    return null;
  }
  const carries = (k) => typeof k === 'string' && KEYNAME.test(k) && groupOf(k) != null;
  const LSk = () => { try { return Object.keys(localStorage); } catch (e) { return []; } };
  const LSget = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  function okValue(k, v) {
    if (typeof v !== 'string' || v.length > 20000) return false;
    if (RAW.has(k)) return true;
    try { JSON.parse(v); return true; } catch (e) { return false; }
  }
  function collect() {
    const s = {};
    for (const k of LSk().sort()) { if (!carries(k)) continue; const v = LSget(k); if (v != null && okValue(k, v)) s[k] = v; }
    return s;
  }
  function fnv(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); }
  function b64u(str) { const b = new TextEncoder().encode(str); let bin = ''; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64u(s) { const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4)); return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))); }
  function exportCode(s) {
    const p = b64u(JSON.stringify({ v: 1, at: nowS(), s: s || collect() }));
    return `ZEN1.${p}.${fnv(p)}`;
  }
  /** { ok, at, s: {key: value}, n, groups: {look: n, ...}, skipped, err } from pasted text (whitespace and line breaks are fine). */
  function parseCode(text) {
    const t = String(text || '').replace(/\s+/g, '');
    if (t.length > 300000) return { ok: false, err: 'That code is too big to be a Zenith settings code.' };   // shared storage stays safe
    const m = t.match(/ZEN1\.([A-Za-z0-9_-]+)\.([0-9a-f]{8})/);
    if (!m) return { ok: false, err: t.indexOf('ZEN1.') >= 0 ? 'The code is cut short or changed. Copy it again in full.' : 'That is not a Zenith settings code (it starts with ZEN1.).' };
    if (fnv(m[1]) !== m[2]) return { ok: false, err: 'The code is cut short or changed. Copy it again in full.' };
    let o;
    try { o = JSON.parse(unb64u(m[1])); } catch (e) { return { ok: false, err: 'The code cannot be read. Copy it again in full.' }; }
    if (!o || o.v !== 1 || !o.s || typeof o.s !== 'object') return { ok: false, err: 'This code is from another version of Zenith.' };
    const s = {}, groups = {};
    let skipped = 0, total = 0;
    for (const [k, v] of Object.entries(o.s).slice(0, 300)) {
      if (!carries(k) || !okValue(k, v) || total + k.length + v.length > 200000) { skipped++; continue; }   // at most ~200 KB in all
      s[k] = v; total += k.length + v.length; const g = groupOf(k); groups[g] = (groups[g] || 0) + 1;
    }
    const n = Object.keys(s).length;
    if (!n) return { ok: false, err: 'The code holds no settings this app can use.' };
    return { ok: true, at: +o.at || null, s, n, groups, skipped };
  }
  const UNDO = 'le.carry.undo';
  function apply(p) {
    if (!p || !p.ok) return false;
    const before = {};
    for (const k of Object.keys(p.s)) before[k] = LSget(k);       // null = it was not set: Undo removes it again
    try { localStorage.setItem(UNDO, JSON.stringify({ t: nowS(), before })); } catch (e) { /* no undo in private mode */ }
    let n = 0;
    for (const [k, v] of Object.entries(p.s)) { try { localStorage.setItem(k, v); n++; } catch (e) { /* storage full */ } }
    return n;
  }
  function undo() {
    let u = null; try { u = JSON.parse(localStorage.getItem(UNDO) || 'null'); } catch (e) { u = null; }
    if (!u || !u.before) return false;
    for (const [k, v] of Object.entries(u.before)) { if (!carries(k)) continue; try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
    try { localStorage.removeItem(UNDO); } catch (e) { /* ignore */ }
    return true;
  }
  const undoInfo = () => { try { const u = JSON.parse(localStorage.getItem(UNDO) || 'null'); return u && u.t && nowS() - u.t < 7 * 86400 ? u : null; } catch (e) { return null; } };
  window.ZenithCarry = { CARRY, PREFIX, carries, collect, exportCode, parseCode, apply, undo };

  // ---- clipboard (the tap is the gesture; a selectable box when the clipboard is not allowed)
  async function copyText(t) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(t); return true; } } catch (e) { /* fall back */ }
    try {
      const x = document.createElement('textarea'); x.value = t; x.setAttribute('readonly', ''); x.style.cssText = 'position:fixed;left:-9999px;top:0;font-size:16px';
      document.body.appendChild(x); x.select(); x.setSelectionRange(0, t.length); const ok = document.execCommand('copy'); x.remove(); return !!ok;
    } catch (e) { return false; }
  }
  const fWhen = (t) => { try { return new Date(t * 1000).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } };
  const groupsLine = (g) => Object.keys(GROUP_NAME).filter((k) => g[k]).map((k) => `${GROUP_NAME[k]} (${g[k]})`).join(', ');

  function carryCard(where) {
    const n = Object.keys(collect()).length, u = undoInfo();
    const head = where === 'jarvis'
      ? `<div class="card-h"><h3>${ic('phone')}Inside Jarvis</h3>${chip('Zenith mode', 'good')}</div>
        <div class="note" style="margin-top:0">This is the whole Zenith app inside Jarvis: every tab, Live View, the Holodeck and the charts. On iPhone Jarvis keeps its own copy of Zenith's settings, so bring yours over once.</div>
        <ol class="list"><li>Open the <b>Zenith</b> app, then <b>Settings</b> → <b>Copy settings code</b>.</li><li>Come back here, tap <b>Paste</b> (or paste into the box), check what it holds, then <b>Apply</b>.</li></ol>`
      : `<div class="card-h"><h3>${ic('phone')}Settings for Jarvis</h3>${chip(n + (n === 1 ? ' setting' : ' settings'))}</div>
        <div class="note" style="margin-top:0">Use Zenith inside Jarvis too? On iPhone each Home Screen app keeps its own settings. Copy this code, then in Jarvis open Zenith → <b>Settings</b> → paste it.</div>`;
    return `<div class="card zc-card" id="zcCard" data-where="${where}">${head}
      <div class="row-btns">${where === 'jarvis'
        ? `<button class="btn primary" type="button" id="zcPaste">${ic('doc')}Paste</button><button class="btn ghost" type="button" id="zcBack">${ic('back')}Back to Jarvis</button>`
        : `<button class="btn primary" type="button" id="zcCopy">${ic('share')}Copy settings code</button><button class="btn ghost" type="button" id="zcPasteOpen">Paste a code</button>`}</div>
      <textarea class="zc-code" id="zcOut" readonly hidden aria-label="Your settings code"></textarea>
      <div class="zc-in" id="zcIn"${where === 'jarvis' ? '' : ' hidden'}>
        <textarea class="zc-code" id="zcText" rows="3" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Paste the code (ZEN1…)" aria-label="Settings code"></textarea>
        <p class="zc-msg" id="zcMsg" aria-live="polite"></p>
        <div class="row-btns">${where === 'jarvis' ? '' : `<button class="btn ghost" type="button" id="zcPaste">${ic('doc')}Paste</button>`}<button class="btn primary" type="button" id="zcApply" disabled>${ic('check')}Apply</button></div></div>
      ${u ? `<div class="row-btns"><button class="btn ghost" type="button" id="zcUndo">${ic('replay')}Undo the last paste (${esc(fWhen(u.t))})</button></div>` : ''}
      <details class="zc-what"><summary>What moves, what never does</summary>
        <p><b>Moves:</b> look and motion (accent, theme, text size, contrast, motion, haptics, intro, auto-refresh), 3D (effects, background, 3D charts, Holodeck layers), which notifications ring and the alert levels, your page choices (spans, filters, closed notes).</p>
        <p><b>Never:</b> any key or token, the phone's notification subscription (each app turns it on with its own tap), what was seen or read, searches, remote-control drafts, tilt to look around (each app asks for the motion sensors).</p>
        ${where === 'jarvis' ? `<div class="row-btns"><button class="btn ghost" type="button" id="zcCopy">${ic('check')}Copy this copy's code</button></div>` : ''}</details></div>`;
  }
  function wireCarry(el) {
    const card = el.querySelector('#zcCard'); if (!card) return;
    const $c = (s) => card.querySelector(s);
    let parsed = null;
    const check = () => {
      const t = $c('#zcText'), msg = $c('#zcMsg'), go = $c('#zcApply');
      if (!t || !msg || !go) return;
      parsed = t.value.trim() ? parseCode(t.value) : null;
      go.disabled = !(parsed && parsed.ok);
      msg.className = 'zc-msg' + (parsed ? (parsed.ok ? ' ok' : ' bad') : '');
      msg.textContent = !parsed ? '' : parsed.ok
        ? `${parsed.n} ${parsed.n === 1 ? 'setting' : 'settings'}${parsed.at ? ` from ${fWhen(parsed.at)}` : ''}: ${groupsLine(parsed.groups)}.${parsed.skipped ? ` ${parsed.skipped} left out.` : ''} Tap Apply to use them here.`
        : parsed.err;
    };
    const t = $c('#zcText'); if (t) t.addEventListener('input', check);
    const cp = $c('#zcCopy');
    if (cp) cp.onclick = async () => {
      const code = exportCode(), out = $c('#zcOut');
      if (await copyText(code)) { say('Settings code copied. Paste it in Jarvis: Zenith → Settings', 4200); if (out) out.hidden = true; }
      else if (out) { out.hidden = false; out.value = code; out.focus(); out.select(); say('Copy the code in the box', 4200); }
    };
    const po = $c('#zcPasteOpen'); if (po) po.onclick = () => { const b = $c('#zcIn'); if (b) { b.hidden = !b.hidden; if (!b.hidden) $c('#zcText').focus(); } };
    const ps = $c('#zcPaste');
    if (ps) ps.onclick = async () => {
      const b = $c('#zcIn'); if (b) b.hidden = false;
      try { const v = navigator.clipboard && navigator.clipboard.readText ? await navigator.clipboard.readText() : ''; if (v) { $c('#zcText').value = v; check(); return; } } catch (e) { /* not allowed: paste by hand */ }
      $c('#zcText').focus(); say('Paste the code into the box (touch and hold, Paste)', 4200);
    };
    const go = $c('#zcApply');
    if (go) go.onclick = () => {
      if (!parsed || !parsed.ok) return;
      const n = apply(parsed);
      say(`${n} settings applied. Reloading…`, 2400);
      setTimeout(() => location.reload(), 700);
    };
    const un = $c('#zcUndo'); if (un) un.onclick = () => { if (undo()) { say('Back to the settings before the paste. Reloading…', 2400); setTimeout(() => location.reload(), 700); } };
    const bk = $c('#zcBack'); if (bk) bk.onclick = () => jarvisExit();
  }

  // ================================================================================================ 2. inside Jarvis
  const ORIGIN = location.origin, CAN = J && ORIGIN && ORIGIN !== 'null';
  const post = (type, o) => { if (!CAN) return; try { window.parent.postMessage(Object.assign({ ns: 'le-zenith', v: 1, type }, o || {}), ORIGIN); } catch (e) { /* no parent */ } };
  function jarvisExit() { post('exit'); }
  const ROUTE_RX = /^#\/[\w\-/:.%,]*$/;
  function normRoute(r) {
    if (typeof r !== 'string') return null;
    let s = r.trim(); if (!s) return null;
    if (s[0] !== '#') s = '#' + (s[0] === '/' ? s : '/' + s);
    return s.length <= 200 && ROUTE_RX.test(s) ? s : null;
  }

  // Settings / Activity / Notifications: the Jarvis card, the code card, the notifications note (after every other wrapper)
  const JNOTE = `<div class="note zc-jnote">${ic('info')} Inside Jarvis: phone notifications come to the Zenith app on this phone. Turn them on here only if Jarvis takes its place, else each one arrives twice.</div>`;
  function pushNote(el) {
    if (!J) return;
    for (const c of el.querySelectorAll('#pushCardS, #pushCardA')) if (!c.querySelector('.zc-jnote')) { const h = c.querySelector('.card-h'); if (h) h.insertAdjacentHTML('afterend', JNOTE); }
  }
  const s0 = VIEWS.settings;
  if (typeof s0 === 'function' && !s0.__zc) {
    const w = function (el) {
      s0.apply(this, arguments);
      try {
        const hs = [...el.querySelectorAll('.card h3')].find((h) => /^Home Screen app/.test(h.textContent.trim()));
        const card = hs && hs.closest('.card');
        if (J) {                                   // no "install the app" card inside Jarvis: the Jarvis card opens the page
          if (card) card.remove();
          const hero = el.firstElementChild;
          if (hero) hero.insertAdjacentHTML('afterend', carryCard('jarvis')); else el.insertAdjacentHTML('afterbegin', carryCard('jarvis'));
          pushNote(el);
        } else {
          const grid = card && card.closest('.grid');
          if (grid && grid.parentElement === el) grid.insertAdjacentHTML('afterend', carryCard('app'));
          else el.insertAdjacentHTML('beforeend', carryCard('app'));
        }
        wireCarry(el);
      } catch (e) { console.warn('settings code', e); }
    };
    Object.keys(s0).forEach((k) => { w[k] = s0[k]; }); w.__zc = true; VIEWS.settings = w;
  }
  for (const v of ['activity', 'alerts']) {
    const f = VIEWS[v];
    if (typeof f !== 'function' || f.__zc || !J) continue;
    const w = function (el) { f.apply(this, arguments); try { pushNote(el); } catch (e) { /* note only */ } };
    Object.keys(f).forEach((k) => { w[k] = f[k]; }); w.__zc = true; VIEWS[v] = w;
  }

  const CSS = `
.zc-card .row-btns{margin-top:10px}
.zc-code{display:block;width:100%;box-sizing:border-box;margin:10px 0 0;padding:10px 12px;min-height:64px;border-radius:12px;border:1px solid var(--line);background:var(--surface-2);color:var(--ink);font:16px/1.4 var(--mono);resize:vertical;word-break:break-all}
.zc-code:focus{outline:2px solid var(--accent);outline-offset:1px}.zc-code[hidden],.zc-in[hidden]{display:none}
.zc-msg{margin:8px 0 0;font-size:13px;color:var(--ink-2);min-height:1em}.zc-msg.ok{color:var(--good-ink)}.zc-msg.bad{color:var(--bad)}
.zc-what{margin-top:12px;font-size:13px;color:var(--ink-2)}.zc-what summary{cursor:pointer;color:var(--ink);font-weight:600}.zc-what p{margin:8px 0 0;line-height:1.5}
.zc-jnote{margin:0 0 10px}.zc-jnote .ico{vertical-align:-3px}
html[data-jarvis="on"] #moInst,html[data-jarvis="on"] #pushPrompt{display:none!important}
`;
  const st = document.createElement('style'); st.id = 'zc-css'; st.textContent = CSS; document.head.appendChild(st);

  const redrawSettings = () => { if (typeof PAGE !== 'undefined' && PAGE === 'settings' && typeof D !== 'undefined' && D && typeof render === 'function') render(true); };
  if (!J) { redrawSettings(); return; }

  // ---- what Jarvis is told: the route, the page title, the alert badge
  let BADGE = 0, last = '';
  const hashNow = () => { const h = location.hash || ''; if (!h || h === '#' || h === '#/') return '#/today'; if (ROUTE_RX.test(h) && h.length <= 200) return h; return normRoute('#/' + h.replace(/^#\/?/, '').split('/')[0]) || '#/today'; };
  const titleNow = () => String(document.title || '').replace(/\s*·\s*Zenith\s*$/, '').trim().slice(0, 80) || 'Zenith';
  const snap = () => ({ route: hashNow(), title: titleNow(), badge: BADGE });
  function state(force) { const s = snap(), k = JSON.stringify(s); if (!force && k === last) return; last = k; post('state', s); }
  let stT = 0;
  const stateSoon = () => { clearTimeout(stT); stT = setTimeout(() => state(false), 30); };
  addEventListener('hashchange', () => { stateSoon(); layoutSoon(); });
  const tEl = document.querySelector('title');
  if (tEl) new MutationObserver(stateSoon).observe(tEl, { childList: true, characterData: true, subtree: true });
  const ab = window.actBadge;                                        // index.html: the unseen activity count (the app badge)
  if (typeof ab === 'function' && !ab.__zc) {
    const w = async function () { const n = await ab.apply(this, arguments); BADGE = Math.max(0, Math.round(+n || 0)); stateSoon(); return n; };
    w.__zc = true; window.actBadge = w;
  }

  // ---- the floating control's room (header, tab bar + the scroll-to-top slot) and full-screen layers it must not cover
  const COVER = '#splash, #plPal.on, .sheet-wrap.on, .hd-root.hd-max, .lv-phone.lv-max, .lv-root.lv-max, .tp-lb.on';
  const cover = () => !!(document.fullscreenElement || document.webkitFullscreenElement || document.querySelector(COVER));
  function box(sel) {
    const e = document.querySelector(sel); if (!e) return null;
    const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return null;
    const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? r : null;
  }
  function layoutNow() {
    const H = innerHeight;
    const tops = ['.top', '#sub'].map(box).filter((r) => r && r.top < H / 2).map((r) => r.bottom);
    const tb = box('#tabs');
    const sb = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--jz-sa-bottom')) || 0;
    const bottom = Math.max(tb && tb.top > H / 2 ? H - tb.top + 62 : 0, 136 + sb);   // .ft-top: 44 px at bottom 92 px + the safe area
    return { top: Math.round(tops.length ? Math.max(...tops) : 0), bottom: Math.round(bottom), cover: cover() };
  }
  let lastL = '', lT = 0;
  function layout(force) { const l = layoutNow(), k = JSON.stringify(l); if (!force && k === lastL) return; lastL = k; post('layout', l); }
  const layoutSoon = () => { clearTimeout(lT); lT = setTimeout(() => layout(false), 140); };
  addEventListener('resize', layoutSoon);
  let SHOWN = true;
  setInterval(() => { if (!document.hidden) layout(false); }, 700);     // a layer opening or closing (hidden: nothing to do)

  // ---- hidden while Jarvis mode shows: a backgrounded app (the 3D scene, the polling and the timers that check
  // document.hidden stop; shown again = visibilitychange, so the data refreshes like an app brought back)
  let JHIDE = false, keepY = 0, lastY = scrollY;
  // where the owner is on the page, recorded while the frame is on screen (a hub that hides its view with display:none
  // drops this frame's scroll to 0 before Jarvis's 'visible' message arrives)
  addEventListener('scroll', () => {
    if (!SHOWN) return;
    const fe = window.frameElement;
    if (fe && !fe.getClientRects().length) return;
    lastY = scrollY;
  }, { passive: true });
  try {
    const dh = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden'), dv = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
    if (dh && dh.get && dv && dv.get) {
      Object.defineProperty(document, 'hidden', { configurable: true, get() { return JHIDE || dh.get.call(document); } });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get() { return JHIDE ? 'hidden' : dv.get.call(document); } });
    }
  } catch (e) { /* the page just keeps running */ }
  function setShown(on) {
    if (on === SHOWN) return;
    const was = document.hidden;
    if (!on) keepY = lastY;
    SHOWN = on; JHIDE = !on;
    if (document.hidden !== was) document.dispatchEvent(new Event('visibilitychange'));
    if (on) {
      // the hub may have hidden its view (display:none drops this frame's scroll): back to where the owner was, once the
      // frame has its size again, unless the owner already scrolls
      const back = () => { if (keepY > 2 && scrollY < 2) scrollTo(0, keepY); };
      back(); requestAnimationFrame(back); setTimeout(back, 120); setTimeout(back, 450);
      state(true); layout(true);
    }
  }

  // a hub that hides this frame's view with display:none (also the older Jarvis page, without the 'visible' message): the
  // frame has no box then; noticed within 0.15 s, Zenith pauses the same way and comes back where the owner was
  let PARENT_SHOWN = true, RENDERED = true;
  const FE = window.frameElement;
  if (FE) setInterval(() => {
    let r = true;
    try { r = FE.getClientRects().length > 0; } catch (e) { r = true; }
    if (r === RENDERED) return;
    RENDERED = r;
    setShown(PARENT_SHOWN && RENDERED);
  }, 150);

  // ---- links that would take this frame off Zenith open on their own (another site refuses to be framed, or would
  // replace Jarvis itself with _top / _parent)
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || a.hasAttribute('download')) return;
    const tg = (a.getAttribute('target') || '').toLowerCase();
    if (tg === '_blank') return;
    let u; try { u = new URL(a.href, location.href); } catch (er) { return; }
    if (!/^https?:$/.test(u.protocol)) return;
    const home = new URL('./', location.href), rel = u.pathname.slice(home.pathname.length);
    const inside = u.origin === location.origin && u.pathname.startsWith(home.pathname) && !/^(jarvis|planner|kalshi)(\/|$)/.test(rel);
    if (inside && tg !== '_top' && tg !== '_parent') return;
    e.preventDefault();
    window.open(u.href, '_blank', 'noopener');
  });

  // ---- Jarvis's messages
  addEventListener('message', (e) => {
    if (e.origin !== ORIGIN || e.source !== window.parent) return;      // this site, and only the Jarvis page around this frame
    const m = e.data;
    if (!m || typeof m !== 'object' || m.ns !== 'le-jarvis' || m.v !== 1) return;
    if (m.type === 'open') {
      const r = normRoute(m.route);
      if (!r) return;
      if (location.hash === r) { if (typeof window.route === 'function') window.route(); } else location.hash = r;
    } else if (m.type === 'insets') {
      if (window.LEJ && typeof window.LEJ.set === 'function') window.LEJ.set([m.top, m.right, m.bottom, m.left]);
      layoutSoon();
    } else if (m.type === 'visible') {
      PARENT_SHOWN = m.visible !== false;
      setShown(PARENT_SHOWN && RENDERED);
    } else if (m.type === 'ping') {
      state(true); layout(true);
    }
  });
  window.ZenithInJarvis = { state: snap, layout: layoutNow, exit: jarvisExit, shown: () => SHOWN };
  post('hello', snap());
  layout(true);
  if (typeof D !== 'undefined' && D && typeof window.actBadge === 'function') window.actBadge().catch(() => null);
  redrawSettings();
})();
