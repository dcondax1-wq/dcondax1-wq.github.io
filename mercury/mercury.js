// MERCURY page (ES module): the deal watcher. Reads ../money/mercury.json (written by tools/money/mercury.py) or its own fixture.json (DEMO), and shows
// what is on sale, what ends soon, which rule changes touch you, and what it would buy. Read only: it never buys or sends anything and keeps nothing on the
// phone. Text only through textContent. window.MERCURY is the test hook. The marble scene (mercury3d.js) listens for the 'mercury:model' event.
import * as C from './mercurycore.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const S = { fixture: null, doc: null, demo: false, forced: false, model: null, now: new Date(), ready: false };

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
function say(t) { $('status').textContent = t; }

// ------------------------------------------------------------------------------------------------ the model
function model() {
  const q = new URLSearchParams(location.search), at = q.get('at'), d = at ? new Date(at) : new Date();
  S.now = Number.isFinite(d.getTime()) ? d : new Date();
  let doc = S.forced ? null : S.doc, m = C.buildModel(doc, S.now);
  S.demo = false;
  if (!m.ok || m.status === 'sample') { if (!m.ok) { m = C.buildModel(S.fixture, S.now); } S.demo = true; }
  if (!m.ok) m = { ok: false, deals: [], soon: [], rulesMine: [], rulesOther: [], pages: [], notes: [], tags: [], pick: { buy: false, title: 'Nothing to show yet', why: 'The first check has not run.', usd: null, buyBy: null }, headline: 'No deal list yet.', ageH: null };
  S.model = m;
  return m;
}

// ------------------------------------------------------------------------------------------------ the page
function chip(text, cls) { return h('span', 'pill ' + (cls || ''), text); }

function itemRow(i, withLink) {
  const li = h('li', 'it'); li.dataset.kind = i.kind; li.dataset.id = i.id;
  const top = h('div', 'it-top'); top.appendChild(h('h3', '', i.title));
  top.appendChild(h('span', 'it-usd ag-num', i.usd != null ? '~' + C.money(i.usd) : 'no $ change'));
  li.appendChild(top); li.appendChild(h('p', 'it-detail', i.detail));
  const chips = h('div', 'chips'); chips.appendChild(chip(C.KIND_WORD[i.kind], 'gold'));
  chips.appendChild(chip(C.RISK_WORD[i.risk], i.risk === 'low' ? 'ok' : i.risk === 'med' ? 'warn' : 'bad'));
  if (i.isNew) chips.appendChild(chip('New since last check', 'info'));
  if (i.kind !== 'rule') chips.appendChild(chip(C.whenText(i.days), i.days != null && i.days <= 3 ? 'warn' : ''));
  if (i.kind !== 'rule') chips.appendChild(chip('Score ' + i.score + ' of 100'));
  li.appendChild(chips);
  const acts = h('div', 'acts');
  if (i.code) {
    const b = h('button', 'btn', 'Copy code ' + i.code); b.type = 'button';
    b.addEventListener('click', () => { try { navigator.clipboard.writeText(i.code); b.textContent = 'Copied ' + i.code; } catch (_) { b.textContent = 'Code: ' + i.code; } });
    acts.appendChild(b);
  }
  if (withLink && i.url) { const a = h('a', 'btn', 'Open the page'); a.href = i.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; acts.appendChild(a); }
  if (acts.firstChild) li.appendChild(acts);
  return li;
}

function fill(ul, list, emptyText, withLink) {
  clear(ul);
  if (!list.length) { ul.appendChild(h('li', 'empty', emptyText)); return; }
  for (const i of list) ul.appendChild(itemRow(i, withLink));
}

function render() {
  const m = model();
  $('demo').hidden = !S.demo; try { $('lite').hidden = !(O && O.lite && O.lite()); } catch (_) { $('lite').hidden = true; }
  $('headline').textContent = m.headline;
  $('asof').textContent = (S.demo ? 'Example list, not real. ' : '') + C.ageText(m.ageH) + (m.status === 'stale' ? '. Some pages could not be read, see the notes.' : '.');
  const p = m.pick;
  $('pickTitle').textContent = p.title; $('pickWhy').textContent = p.why;
  const pill = $('pickPill'); pill.textContent = p.buy ? 'Worth a look' : 'Wait'; pill.className = 'pill ' + (p.buy ? 'gold' : '');
  $('pickCard').dataset.buy = p.buy ? '1' : '0';
  fill($('deals'), m.deals, 'No sale or free reset found on the pages being watched. Nothing to buy.', true);
  fill($('soon'), m.soon, 'Nothing ends in the next 7 days.', false);
  $('soonCard').dataset.count = String(m.soon.length);
  fill($('rules'), m.rulesMine, 'No rule change that affects you. The bot can carry on.', true);
  fill($('rulesOther'), m.rulesOther, 'None.', false);
  $('otherSum').textContent = 'Other rule changes (' + m.rulesOther.length + ', firms you do not use)';
  const w = $('watch'); clear(w);
  if (!m.pages.length) w.appendChild(h('li', '', 'No page list in this file.'));
  for (const x of m.pages) w.appendChild(h('li', '', x.firm + (x.owner ? ' (yours)' : '') + (x.ok ? ': read' : ': not read this time')));
  const n = $('notes'); clear(n); for (const t of m.notes) n.appendChild(h('li', '', t));
  say(C.statusLine(m));
  S.ready = true;
  try { window.dispatchEvent(new CustomEvent('mercury:model', { detail: { tags: m.tags } })); } catch (_) { /* the scene is optional */ }
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
}

async function boot() {
  const q = new URLSearchParams(location.search); S.forced = q.get('demo') === '1';
  const [fx, doc] = await Promise.all([getJSON('./fixture.json'), S.forced ? null : getJSON('../money/mercury.json')]);
  S.fixture = fx; S.doc = doc;
  render();
}
window.MERCURY = { S, C, ready: () => S.ready, render };
boot().catch((e) => { say('Something went wrong: ' + (e && e.message ? e.message : e)); try { if (O && O.fail) O.fail('Mercury could not start'); } catch (_) { /* nothing */ } });
