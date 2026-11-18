// DELPHI page (ES module): the oracle's briefing. A calm pre-session page: the verdict (Go / Go, with care / Stand down), the five-line checklist, what LIT / ATLAS / BLITZ plan in plain words,
// the VIX-band target, the stop and size logic and the news windows. Reads home.json (the bot's morning briefing), ledger/rules.json and fixture.json (DEMO). Read only: it sends nothing and keeps nothing.
// Text only through textContent. window.DELPHI is the test hook. ?at=2026-11-10T12:30:00Z sets "now" (tests).
import * as C from './delphicore.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const S = { fixture: null, home: null, rules: null, model: null, demo: false, forced: false, now: new Date(), list: [], vd: null, ready: false };

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
function say(t) { $('status').textContent = t; }

function renderAnswer() {
  const v = S.vd; $('ansH').textContent = v.word; $('ansWhy').textContent = v.why; $('ansDo').textContent = v.doit;
  const p = $('ansPill'); p.textContent = `${v.ok} of ${v.total} lines in order`; p.className = 'pill ' + v.level;
  $('day').textContent = S.model.day ? `Briefing for ${S.model.day}` : 'Before the session';
  $('ansH').className = 'ans ' + (v.level === 'ok' ? 'pos' : v.level === 'bad' ? 'neg' : '');
}

function renderCheck() {
  const ol = $('check'); clear(ol);
  for (const x of S.list) {
    const li = h('li'); li.dataset.key = x.key; li.dataset.level = x.level;
    li.appendChild(h('span', 'pill ' + (x.level === 'info' ? 'info' : x.level), C.LEVEL_WORD[x.level])); li.appendChild(h('b', '', x.label)); li.appendChild(h('p', '', x.text)); ol.appendChild(li);
  }
}

function renderBots() {
  const box = $('bots'); clear(box); const m = S.model;
  const defs = [['lit', 'LIT', 'the 50K, live strategy', C.litLines(m)], ['atlas', 'ATLAS', 'the 25K, paper', C.atlasLines()], ['blitz', 'BLITZ', 'the scalper, paper', C.blitzLines()]];
  for (const [key, name, role, lines] of defs) {
    const d = h('details'); d.dataset.bot = key; if (key === 'lit') d.open = true;
    const s = h('summary'); s.appendChild(h('b', '', name)); s.appendChild(h('span', '', role)); d.appendChild(s);
    const ul = h('ul', 'plain'); for (const l of lines) ul.appendChild(h('li', '', l)); d.appendChild(ul); box.appendChild(d);
  }
}

function tile(box, k, v, n, cls) { const t = h('div', 'tile'); t.appendChild(h('small', '', k)); t.appendChild(h('b', cls || '', v)); t.appendChild(h('span', '', n)); box.appendChild(t); }

function renderVix() {
  const m = S.model, v = m.vix, tiles = $('vixTiles'); clear(tiles);
  if (v.has) { tile(tiles, 'Shorts aim at', C.px(v.low), 'VIX band low', 'neg'); tile(tiles, 'Longs aim at', C.px(v.high), 'VIX band high', 'pos'); tile(tiles, 'One day move', `${C.pts(v.move)} pts`, `${C.money(v.move * C.MICRO_PT)} per micro`); }
  else tile(tiles, 'Target band', 'None today', 'no band, no trade');
  const ul = $('vixLines'); clear(ul); for (const l of C.vixLines(m)) ul.appendChild(h('li', '', l));
}

function renderSize() {
  const s = S.model.size, tiles = $('sizeTiles'); clear(tiles);
  tile(tiles, 'Typical stop', s.stop != null ? `${C.pts(s.stop)} pts` : 'n/a', 'beyond the sweep');
  tile(tiles, 'Micros today', s.micros != null ? String(s.micros) : 'n/a', 'size follows the stop');
  tile(tiles, 'One loss costs', s.risk != null ? `-${C.money(s.risk)}` : 'n/a', s.risk != null ? '-1.0R' : 'not reported', 'neg');
  if (s.risk != null) tile(tiles, 'At 8R it pays', C.moneyS(8 * s.risk), '+8.0R', 'pos');
  const ul = $('sizeLines'); clear(ul); for (const l of C.sizeLines(S.model)) ul.appendChild(h('li', '', l));
}

function render() {
  const m = S.model;
  S.list = C.checklist(m, S.now, S.demo); S.vd = C.verdict(S.list, S.demo);
  $('demo').hidden = !S.demo; try { $('lite').hidden = !(O && O.lite && O.lite()); } catch (_) { $('lite').hidden = true; }
  renderAnswer(); renderCheck(); renderBots(); renderVix(); renderSize();
  const ul = $('news'); clear(ul);
  if (m.news.length) for (const e of m.news) { const li = h('li'); li.appendChild(h('time', '', e.time || '--:--')); const d = h('div'); d.appendChild(h('span', '', e.title)); d.appendChild(h('small', '', [e.kind, e.blackout ? `quiet window ${e.blackout}` : ''].filter(Boolean).join(' - ') || 'high impact')); li.appendChild(d); ul.appendChild(li); }
  else { const li = h('li'); li.appendChild(h('time', '', '--:--')); li.appendChild(h('span', '', m.has || S.demo ? 'No high-impact USD news today.' : 'The news list is not published yet.')); ul.appendChild(li); }
  $('newsNote').textContent = m.news.length ? 'LIT does not pause for news: price can spike through a level and the stop in seconds around a release. A sweep made by the release still counts as a sweep.' : 'Quiet calendar: the usual risks only.';
  say(`${S.vd.word}. ${S.vd.why} ${S.vd.ok} of ${S.vd.total} lines in order.`);
  S.ready = true;
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
}

async function boot() {
  const q = new URLSearchParams(location.search); S.forced = q.get('demo') === '1';
  const [fx, home, rules] = await Promise.all([getJSON('./fixture.json'), S.forced ? null : getJSON('../home.json'), getJSON('../ledger/rules.json')]);
  S.fixture = fx; S.home = home; S.rules = rules;
  const at = q.get('at'), d = at ? new Date(at) : new Date(); S.now = Number.isFinite(d.getTime()) ? d : new Date();
  const real = C.readHome(home, rules);
  if (!S.forced && real.has) { S.model = real; S.demo = false; }
  else { S.model = C.readHome(fx && fx.home, rules); S.demo = true; }
  render();
}
window.DELPHI = { S, C, ready: () => S.ready, render };
boot().catch((e) => { say('Something went wrong: ' + (e && e.message ? e.message : e)); try { if (O && O.fail) O.fail('Delphi could not start'); } catch (_) { /* nothing */ } });
