// Agency > Expert, the page (team web-expert 2026-11-20). Draws playbook.json with textContent only: the 5-tap diagnosis (expertcore.js
// diagnose), the playbooks (search), the 3D verdict per trade and the offers. Offline after the first open (the browser's cache); sends nothing.
// window.EXPERT = { ready, answers, playbook } for tests.
import { diagnose, range, find } from './expertcore.js?v=1';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
const S = { P: null, answers: {}, step: 0 };
window.EXPERT = { ready: false, get answers() { return { ...S.answers }; }, get playbook() { return S.P; } };
const VERDICT = { sells: '3D sells', maybe: '3D maybe', gimmick: '3D = gimmick' };

async function load() {
  try { const r = await fetch('playbook.json?v=1', { cache: 'no-cache' }); if (r.ok) return await r.json(); } catch (_) { /* offline: the cached copy below */ }
  try { const r = await fetch('playbook.json?v=1'); if (r.ok) return await r.json(); } catch (_) { /* nothing */ }
  return null;
}

// ------------------------------------------------------------------ the 5-tap diagnosis
function drawStep() {
  const box = $('dx'), qs = S.P.diagnose.questions;
  box.replaceChildren();
  if (S.step >= qs.length) { drawResult(); return; }
  const q = qs[S.step];
  box.append(el('p', 'ex-step', `Step ${S.step + 1} of ${qs.length}`), el('p', 'ex-q', q.q));
  const opts = el('div', 'ex-opts'); opts.setAttribute('role', 'group'); opts.setAttribute('aria-label', q.q);
  for (const [v, label] of q.options) {
    const b = el('button', 'ex-opt', label); b.type = 'button'; b.dataset.v = v;
    b.setAttribute('aria-pressed', S.answers[q.id] === v ? 'true' : 'false');
    b.addEventListener('click', () => { S.answers[q.id] = v; S.step++; drawStep(); focusFirst(); });
    opts.append(b);
  }
  box.append(opts);
  if (S.step > 0) { const back = el('button', 'ex-btn', 'Back'); back.type = 'button'; back.addEventListener('click', () => { S.step--; drawStep(); focusFirst(); }); const r = el('div', 'ex-row'); r.append(back); box.append(r); }
}
function focusFirst() { const b = $('dx').querySelector('button, h3'); if (b && b.focus) try { b.focus({ preventScroll: true }); } catch (_) { b.focus(); } }
function drawResult() {
  const box = $('dx'), d = diagnose(S.answers, S.P);
  // the Agency HQ tile (HUB team): how many prospects were diagnosed on this phone, and the last offer
  try { const k = 'agency.expert.summary', o = JSON.parse(localStorage.getItem(k) || '{}') || {}; const n = (+o.dx || 0) + 1;
    localStorage.setItem(k, JSON.stringify({ n, dx: n, label: n === 1 ? 'prospect diagnosed' : 'prospects diagnosed', next: d.offer ? `Last: ${d.offer.name}, ${d.price}` : '', t: Math.floor(Date.now() / 1000) })); } catch (_) { /* private mode */ }
  box.classList.add('ex-res');
  const h = el('h3', '', d.offer ? d.offer.name : 'No offer'); h.tabIndex = -1;
  box.append(el('p', 'ex-step', 'The offer to lead with'), h, el('p', 'ex-price', `${d.price}${d.offer && d.offer.days ? ` · ready in about ${d.offer.days} days` : ''}`));
  if (d.offer) box.append(el('p', '', d.offer.what));
  if (d.total) box.append(el('p', 'ex-usd', `With the care plan: ${d.total}`));
  const why = el('ul', 'ex-list'); for (const w of d.why) why.append(el('li', '', w)); box.append(why);
  if (d.addons.length) { box.append(el('p', 'ex-step', 'Then offer')); const ul = el('ul', 'ex-list'); for (const a of d.addons) ul.append(el('li', '', `${a.name}: ${a.range}`)); box.append(ul); }
  if (d.script) {
    const say = el('div', 'ex-say'); say.append(el('b', '', `What to say (${d.niche ? d.niche.name : 'opener'})`), el('span', '', d.script)); box.append(say);
  }
  if (d.niche) box.append(el('p', '', `3D for a ${d.niche.name.toLowerCase()}: ${VERDICT[d.niche.three_d] || ''}. ${d.niche.hook}`));
  const row = el('div', 'ex-row');
  const copy = el('button', 'ex-btn', 'Copy the words'); copy.type = 'button';
  copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(d.script); copy.textContent = 'Copied'; } catch (_) { copy.textContent = 'Select the words above'; } });
  const again = el('button', 'ex-btn', 'Start again'); again.type = 'button';
  again.addEventListener('click', () => { S.answers = {}; S.step = 0; box.classList.remove('ex-res'); drawStep(); focusFirst(); });
  row.append(copy, again); box.append(row);
}

// ------------------------------------------------------------------ the playbooks, the trades, the offers
function cardEl(c) {
  const d = el('details', 'ex-card'); d.id = 'pb-' + c.id; d.dataset.topic = c.topic || '';
  d.append(el('summary', '', c.title));
  if (c.say && c.say.length) { const say = el('div', 'ex-say'); say.append(el('b', '', 'Say')); for (const s of c.say) say.append(el('p', '', s)); d.append(say); }
  if (c.do && c.do.length) { const ul = el('ul', 'ex-list'); for (const s of c.do) ul.append(el('li', '', s)); d.append(ul); }
  if (c.usd) d.append(el('p', 'ex-usd', c.usd));
  if (c.avoid) d.append(el('p', 'ex-avoid', 'Avoid: ' + c.avoid));
  return d;
}
function drawCards(q) {
  const box = $('cards'); box.replaceChildren();
  const t = String(q || '').trim().toLowerCase();
  const hit = t ? find(t, S.P) : null;
  let list = S.P.cards.filter((c) => !t || JSON.stringify(c).toLowerCase().includes(t));
  if (hit && hit.kind === 'card' && !list.includes(hit.item)) list = [hit.item].concat(list);
  if (hit && hit.kind === 'niche') { const n = nicheEl(hit.item); n.open = true; box.append(n); }          // a trade asked for: its card first
  if (!list.length && !box.children.length) { box.append(el('p', 'ex-step', `Nothing on "${t}". Try: pricing, 3D, objections, reviews, ads, or a trade (roofer, dentist).`)); return; }
  for (const c of list) { const d = cardEl(c); if (t && list.length <= 3) d.open = true; box.append(d); }
}
function nicheEl(n) {
  const d = el('details', 'ex-card'); d.id = 'ni-' + n.id;
  const s = el('summary', ''); const t = el('span', '', n.name); const chip = el('span', 'ex-chip ' + n.three_d, VERDICT[n.three_d] || n.three_d);
  s.append(t, chip); d.append(s);
  d.append(el('p', '', n.pain), el('p', '', 'Hook: ' + n.hook));
  const o = S.P.offers.find((x) => x.id === n.offer); if (o) d.append(el('p', 'ex-usd', `Lead with: ${o.name}, ${range(o)}`));
  const say = el('div', 'ex-say'); say.append(el('b', '', 'Say'), el('span', '', n.say)); d.append(say);
  return d;
}
function drawNiches() { const box = $('nichelist'); box.replaceChildren(); const order = { sells: 0, maybe: 1, gimmick: 2 }; for (const n of [...S.P.niches].sort((a, b) => order[a.three_d] - order[b.three_d])) box.append(nicheEl(n)); }
function drawOffers() {
  const box = $('offers'); box.replaceChildren();
  const t = el('table', 'ex-offers'), head = el('tr'); head.append(el('th', '', 'Offer'), el('th', '', 'Price')); t.append(head);
  for (const o of S.P.offers) { const r = el('tr'); const c = el('td'); c.append(el('b', '', o.name), el('br'), document.createTextNode(o.what)); r.append(c, el('td', 'p', range(o))); t.append(r); }
  box.append(t);
}

(async () => {
  S.P = await load();
  if (!S.P) { $('dx').replaceChildren(el('p', 'ex-step', 'The playbook could not load (no connection and no saved copy yet). Open it once online.')); return; }
  drawStep(); drawCards(''); drawNiches(); drawOffers();
  $('honest').textContent = S.P.honest;
  let tm = 0; $('find').addEventListener('input', (e) => { clearTimeout(tm); tm = setTimeout(() => drawCards(e.target.value), 120); });
  const h = (location.hash || '').slice(1); if (h.startsWith('pb-') || h.startsWith('ni-')) { const x = document.getElementById(h); if (x) { x.open = true; x.scrollIntoView(); } }
  window.EXPERT.ready = true;
})();
