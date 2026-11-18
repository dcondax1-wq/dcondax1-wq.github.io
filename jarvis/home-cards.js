// Jarvis home, the cards (2026-11-10, AGORA; v2 2026-11-11: ONE clear first screen). This file only draws; every number comes from home-data.js (loadHome).
//   First screen   the hero sentence (#heroLine: ONE sentence of what matters now, from window.JARVIS_API.nudges() with plain-word fallbacks),
//                  the state line (#heroState: demo / offline / an old bot report with its age), the five district doorways (#court: a doorway
//                  is marked when its district needs you) and the three tiles (#hfirst: NQ bots "Drawdown left $X of $max loss", Money = the Mint
//                  estimate with its range, Today = the window now / the next event).
//   Below the fold #htoday: Needs you (the top 3) · NQ bots (one card per account) · Market day;  #hfavs: Favourites · Recent
// Never blank: skeleton loaders until the first numbers are in, then plain words (offline, waiting, demo) when a source has nothing.
// Pull down on the home (or the Refresh button) refetches the feeds. Taps are the shell's own: [data-app] opens an app, [data-say] asks Jarvis
// (index.html's delegated click handler), so nothing here opens or asks by itself. ?demo=1 shows the example data (labelled).
// Read only: no button here arms, orders or changes a bot.
//
//   window.__jarvisHome = { render(), model(), refresh({ force }), pull: { state } }       (tests)
// Safari 16: plain ES2020 module, no optional chaining.
import { loadHome, drawdownLine, usd, _resetCache } from './home-data.js';
import { districtOf, DISTRICTS } from './districts.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const demo = /[?&]demo=1(?:&|$)/.test(location.search);
const T0 = Date.now();
let host = null, first = null, favHost = null, last = null, busy = false, timer = 0, lastAt = 0;
const $ = (id) => document.getElementById(id);

const dot = (lv) => `<i class="hc-dot ${lv === 'ok' || lv === 'warn' || lv === 'bad' ? lv : 'off'}" aria-hidden="true"></i>`;
const pnlHtml = (v) => (v == null ? '<span class="hc-n">no P&amp;L yet</span>' : `<span class="hc-n ${v > 0 ? 'up' : v < 0 ? 'dn' : ''}">${esc(usd(v, true))} today</span>`);
const chev = '<svg class="hv-go" width="9" height="16" viewBox="0 0 9 16" fill="none" aria-hidden="true"><path d="m1.5 1.5 6 6.5-6 6.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const TONE_WORD = { bad: 'needs you', warn: 'heads up' };

// ------------------------------------------------------------------------------------------------ the first screen
const set = (el, html) => { if (el && el.__html !== html) { el.innerHTML = html; el.__html = html; } };     // no repaint (and no lost press state) when nothing changed
const skTile = (k) => `<div class="tile sk" aria-hidden="true"><span class="t-k">${k}</span><span class="sk-b w60"></span><span class="sk-b w80 s"></span></div>`;
export function skeleton() {
  if (first) { first.innerHTML = skTile('NQ bots') + skTile('Money') + skTile('Today'); first.setAttribute('aria-busy', 'true'); }
  const hl = $('heroLine'); if (hl && !hl.firstChild) hl.innerHTML = '<span class="sk-b w80 l" aria-hidden="true"></span><span class="sr">Loading what matters now</span>';
}
function tile(t, pending) {
  if (pending) return skTile(esc(t.kicker));
  // "NQ bots · Drawdown left" / "$1,240 of $1,500 max loss": the owner's wording in reading order, and the number line never wraps
  const body = t.big ? `<span class="t-v"><b>${esc(t.big)}</b>${t.tail ? ` <span class="t-l">${esc(t.tail)}</span>` : ''}</span>` : `<span class="t-v t-w">${esc(t.text)}</span>`;
  const meter = t.frac != null ? `<span class="t-m ${esc(t.tone || 'ok')}" aria-hidden="true"><i style="width:${Math.round(t.frac * 100)}%"></i></span>` : '';
  return `<button class="tile t-${esc(t.id)}${t.tone ? ' ' + esc(t.tone) : ''}" type="button" data-app="${esc(t.app)}" aria-label="${esc(t.aria)}. Opens ${esc(t.app)}">`
    + `<span class="t-k">${dot(t.tone)}${esc(t.kicker)}${t.big && t.lead ? ` · <span class="t-kl">${esc(t.lead)}</span>` : ''}</span>${body}${meter}<span class="t-s">${esc(t.sub || '')}</span>${chev}</button>`;
}
function hero(m) {
  const h = m.hero, hl = $('heroLine'), hs = $('heroState');
  if (hl && h) {
    const attr = h.app ? `data-app="${esc(h.app)}"` : `data-say="${esc(h.say || 'What should I do today?')}"`;
    set(hl, `<button class="hero-now ${esc(h.tone)}" id="heroNow" type="button" ${attr}><span>${esc(h.text)}</span>${chev}</button>`
      + (h.more ? `<button class="hero-more" type="button" data-hc="needs" aria-label="${h.more} more ${h.more === 1 ? 'thing needs' : 'things need'} you: show the list">+${h.more} more</button>` : ''));
  }
  if (hs) {
    const st = m.state || { kind: 'live', text: '' }, show = st.kind === 'demo' || st.kind === 'offline' || (st.kind === 'stale' && !(st.fix && m.hero && m.hero.text === st.text + '.'));   // never the hero's own sentence twice
    hs.hidden = !show; hs.className = 'hero-state ' + st.kind; hs.textContent = show ? st.text : '';
  }
}
function doors(m) {
  const needs = m.needs || {};
  for (const d of DISTRICTS) {
    const el = document.querySelector(`#court [data-district="${d.id}"]`); if (!el) continue;
    const lv = needs[d.id] || '';
    if (lv) el.setAttribute('data-need', lv); else el.removeAttribute('data-need');
    el.setAttribute('aria-label', `${d.title} district${lv ? ': ' + TONE_WORD[lv] : ''}. Opens the map`);
    const art = document.querySelector(`#courtArt [data-door="${d.id}"]`);
    if (art) { if (lv) art.setAttribute('data-need', lv); else art.removeAttribute('data-need'); }
  }
  try { const c = window.__jarvisBackdrop && window.__jarvisBackdrop.home && window.__jarvisBackdrop.home.courtyard; if (c && c.setNeeds) c.setNeeds(needs); } catch (_) { /* the 3D courtyard is optional */ }
  window.__jarvisNeeds = needs;                                                    // the courtyard reads it when it arrives later
}

// ------------------------------------------------------------------------------------------------ below the fold
function needsList(m) {
  const items = m.today.items;
  if (!items.length) return '';
  const rows = items.map((x) => {
    const attr = x.app ? `data-app="${esc(x.app)}"` : `data-say="${esc(x.say || 'What should I do today?')}"`;
    return `<li><button class="hc-row" type="button" ${attr}>${dot(x.tone)}<span>${esc(x.text)}</span><b aria-hidden="true">›</b></button></li>`;
  }).join('');
  return `<section class="hc-sec hc-today" id="hcNeeds" aria-labelledby="hcT"><h2 id="hcT">Needs you<span class="hc-badge">${items.length + m.today.more}</span></h2><ul class="hc-list">${rows}</ul>`
    + (m.today.more ? `<button class="hc-more" type="button" data-say="What should I do today?">${m.today.more} more</button>` : '') + '</section>';
}
function bots(m) {
  const st = m.state || {};
  const cards = m.bots.length ? m.bots.map((b) => `<button class="hc-bot" type="button" data-app="${esc(b.app || 'zenith')}" aria-label="${esc(b.name)}: ${esc(drawdownLine(b))}">`
    + `<span class="hc-bh">${dot(b.level)}<b>${esc(b.name)}</b><em>${esc(b.size)}</em></span>${pnlHtml(b.pnl)}<span class="hc-dd">${esc(drawdownLine(b))}</span>`
    + (b.text ? `<span class="hc-sub">${esc(b.text)}</span>` : '') + '</button>').join('')
    : st.fix && m.online ? `<button class="hc-bot hc-wide" type="button" data-app="zenith"><span class="hc-bh">${dot('warn')}<b>No bot report since ${esc(st.since)}</b></span><span class="hc-sub">On the PC, tap STOP BOT, then START BOT.</span></button>`
    : st.pcOnly ? `<a class="hc-bot hc-wide" href="../hub/zeus.html"><span class="hc-bh">${dot('ok')}<b>${esc(st.text)}</b></span><span class="hc-sub">Each account, $ to pass and today's $: the ZEUS card at the top.</span></a>`
    : `<button class="hc-bot hc-wide" type="button" data-app="zenith"><span class="hc-bh">${dot('')}<b>No bot report yet</b></span><span class="hc-sub">${m.online ? 'The bots have not reported yet: your accounts are not affected.' : 'You are offline. The bots keep running on the PC on their own.'}</span></button>`;
  const age = (st.kind === 'stale' && !(st.fix && !m.bots.length)) || (st.kind === 'live' && !(st.pcOnly && !m.bots.length)) ? `<p class="hc-age ${esc(st.kind)}">${esc(st.text)}</p>` : '';
  return `<section class="hc-sec" aria-labelledby="hcB"><h2 id="hcB">NQ bots</h2><div class="hc-strip${m.bots.length > 1 ? '' : ' one'}">${cards}</div>${age}</section>`;
}
function day(m) {
  const w = m.day.now, e = m.day.next;
  const a = w ? `<button class="hc-row hc-day" type="button" data-app="kairos">${dot(w.entries ? 'ok' : '')}<span><b>${esc(w.label)}</b>${w.text ? ' · ' + esc(w.text) : ''}${w.until ? `<small>${esc(w.until)}</small>` : ''}</span><b aria-hidden="true">›</b></button>`
    : '<p class="hc-empty">The trading windows are not available right now. Times are New York (ET).</p>';
  const b = e ? `<button class="hc-row hc-day" type="button" data-app="pythia">${dot(e.impact === 'high' ? 'warn' : '')}<span><b>Next: ${esc(e.title)}</b><small>${esc(e.when)}${e.impact ? ' · ' + esc(e.impact) + ' impact' : ''}</small></span><b aria-hidden="true">›</b></button>`
    : '<p class="hc-empty">No market event on the calendar I can read. Open Pythia for the full list.</p>';
  return `<section class="hc-sec hc-mday" aria-labelledby="hcD"><h2 id="hcD">Market day</h2>${a}${b}</section>`;
}
function appRow(title, list, empty, id) {
  const body = list.length ? list.map((a) => `<button class="hc-app" type="button" data-app="${esc(a.id)}" aria-label="${esc(a.name)}"><i aria-hidden="true">${esc(a.glyph)}</i><span>${esc(a.name)}</span></button>`).join('')
    : `<p class="hc-empty">${empty}</p>`;
  return `<section class="hc-sec" aria-labelledby="${id}"><h3 id="${id}">${title}</h3><div class="hc-apps">${body}</div></section>`;
}
function favs(m) {
  const fav = appRow('Favourites', m.favs, 'Pin the apps you open most: hold the orb, then press and hold an app. Or <button class="hc-link" type="button" data-hc="welcome">pick three now</button>.', 'hcF');
  const rec = m.recent.length ? appRow('Recent', m.recent, '', 'hcR') : '';
  return fav + rec;
}

export function render(m) {
  if (!host) return '';
  const p = m.pending || {};
  hero(m); doors(m);
  if (first) { set(first, m.tiles.map((t) => tile(t, !!p[t.id])).join('')); first.removeAttribute('aria-busy'); first.classList.toggle('two', m.tiles.length === 2); }
  set(host, needsList(m) + bots(m) + day(m));
  if (favHost) set(favHost, favs(m));
  host.setAttribute('data-ready', '1');
  const up = $('hUpdated'); if (up) up.textContent = m.demo ? 'Example numbers' : 'Updated ' + new Date(m.asof).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return host.innerHTML;
}
const jarvisUp = () => !!(window.__jarvis && window.__jarvis.facts);
export async function refresh(opts) {
  opts = opts || {};
  if (busy || !host) return last;
  busy = true;
  try {
    if (opts.force) {                                                             // pull to refresh / the button: the feeds again, not the 5-minute copy
      _resetCache();
      try { if (window.JARVIS_API && window.JARVIS_API.refresh) window.JARVIS_API.refresh(); } catch (_) { /* optional */ }
      try { if (window.__jarvis && window.__jarvis.refresh) await Promise.race([window.__jarvis.refresh(), new Promise((r) => setTimeout(r, 6000))]); } catch (_) { /* the shell's own feeds */ }
    }
    const m = await loadHome({ demo, districtOf, quick: !!opts.quick });
    // still starting: a tile whose source has not answered yet stays a skeleton (never "nothing" for a second, then a number)
    const young = Date.now() - T0 < 6000, f = jarvisUp() ? window.__jarvis.facts() : null;
    m.pending = demo ? {} : { bots: !m.bots.length && young && !(f && f.liveError) && navigator.onLine !== false, money: !!opts.quick && !m.money, today: false };
    last = m; lastAt = Date.now();
  } catch (_) { last = last || null; }
  busy = false;
  if (last) render(last);
  return last;
}
function visible() { return !document.hidden && document.documentElement.getAttribute('data-mode') === 'jarvis'; }

// ------------------------------------------------------------------------------------------------ pull to refresh (the home scroller) + the Refresh button
const pull = { state: 'idle', y0: 0, d: 0 };
const PULL = 72;
function pullUi() {
  const el = $('ptr'); if (!el) return;
  const h = pull.state === 'busy' || pull.state === 'done' ? 44 : Math.min(64, Math.round(pull.d * 0.5));
  el.style.height = h + 'px'; el.dataset.state = pull.state;
  const t = $('ptrT'); if (t) t.textContent = pull.state === 'busy' ? 'Refreshing' : pull.state === 'done' ? 'Up to date' : pull.d >= PULL ? 'Release to refresh' : 'Pull to refresh';
}
async function doRefresh() {
  if (pull.state === 'busy') return;
  pull.state = 'busy'; pull.d = 0; pullUi();
  if (first) first.setAttribute('aria-busy', 'true');
  const b = $('hRefresh'); if (b) b.disabled = true;
  await Promise.all([refresh({ force: true }), new Promise((r) => setTimeout(r, 450))]);
  if (first) first.removeAttribute('aria-busy');
  if (b) b.disabled = false;
  pull.state = 'done'; pullUi();
  setTimeout(() => { if (pull.state === 'done') { pull.state = 'idle'; pull.d = 0; pullUi(); } }, 900);
}
function wirePull() {
  const sc = $('home'); if (!sc) return;
  sc.addEventListener('touchstart', (e) => { if (pull.state !== 'idle' || sc.scrollTop > 0 || e.touches.length !== 1) return; pull.y0 = e.touches[0].clientY; pull.state = 'ready'; }, { passive: true });
  sc.addEventListener('touchmove', (e) => {
    if (pull.state !== 'ready' && pull.state !== 'pull') return;
    const d = e.touches[0].clientY - pull.y0;
    if (d <= 0 || sc.scrollTop > 0) { if (pull.state === 'pull') { pull.d = 0; pullUi(); } pull.state = 'ready'; return; }
    pull.state = 'pull'; pull.d = d; pullUi();
  }, { passive: true });
  const end = () => { if (pull.state === 'pull' && pull.d >= PULL) doRefresh(); else if (pull.state === 'pull' || pull.state === 'ready') { pull.state = 'idle'; pull.d = 0; pullUi(); } };
  sc.addEventListener('touchend', end, { passive: true }); sc.addEventListener('touchcancel', end, { passive: true });
}

// ------------------------------------------------------------------------------------------------ a press you can see (the web has no haptics on most iPhones)
function wirePress() {
  const sel = '.tile, .hero-now, .hc-row, .hc-bot, .hc-app, .dgate, .hero-more, .hv-btn';
  const off = () => { for (const el of document.querySelectorAll('.is-press')) el.classList.remove('is-press'); };
  document.addEventListener('pointerdown', (e) => { const t = e.target.closest && e.target.closest(sel); if (t) t.classList.add('is-press'); }, { passive: true });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave', 'scroll']) document.addEventListener(ev, off, { passive: true, capture: true });
}

function start() {
  host = $('htoday'); first = $('hfirst'); favHost = $('hfavs');
  if (!host) return;
  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('[data-hc]'); if (!t) return;
    const k = t.getAttribute('data-hc');
    if (k === 'welcome' && window.OLYMPUS_WELCOME && window.OLYMPUS_WELCOME.open) window.OLYMPUS_WELCOME.open();
    if (k === 'refresh') doRefresh();
    if (k === 'needs') { const n = $('hcNeeds'); if (n) n.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); }
  });
  skeleton(); wirePull(); wirePress();
  // first numbers as soon as Jarvis has its facts (no network: under a second), then the published files (Mint, Pythia)
  let tries = 0;
  const firstRun = () => {
    if (!jarvisUp() && !demo && ++tries < 12) { setTimeout(firstRun, 250); return; }
    refresh({ quick: true }).then(() => refresh()).then(() => { let n = 0; const again = () => { if (last && last.pending && last.pending.bots && ++n < 8) refresh().then(() => setTimeout(again, 900)); }; setTimeout(again, 900); });
  };
  firstRun();
  timer = setInterval(() => { if (visible()) refresh(); }, 15000);
  window.addEventListener('online', () => refresh()); window.addEventListener('offline', () => refresh());
  window.addEventListener('zeus:update', () => refresh());                         // the ZEUS card heard the PC: the hero and tiles follow it
  document.addEventListener('visibilitychange', () => { if (visible()) refresh(Date.now() - lastAt > 5 * 60e3 ? { force: true } : {}); });
  window.__jarvisHome = { render: () => last && render(last), model: () => last, refresh, pull, doRefresh, stop: () => clearInterval(timer) };
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
