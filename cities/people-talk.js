// PEOPLE of the cities: who they are, how they look and how you talk to them. Shared by Hellas and Athens.
// The contract is docs/PERSONA_API.md. Two paths, both always work:
//   kit path   window.OLYMPUS_PEOPLE is loaded (olympus/people.js) and knows the person -> its own chat sheet opens (open(id))
//   own path   no kit (or it does not know this id) -> our own chat card: six tappable questions answered ONLY from the data the
//              city already holds. Nobody here invents a number and nobody can place a trade.
// Ids: keeper:<polis-id>, builder:<branch-short>, villager:<app-id>. Pure except the small DOM helpers at the end.
import { hash32, rng } from './util.js';

const FIRST = `Nikandros Kallias Xanthippe Lysander Theano Demetrios Phaedra Kleon Aspasia Timon Ione Philon Korinna Stratos Melissa Diokles Chloe Agathon Eirene Pelagios
Thais Leonidas Myrto Hektor Kleio Nikias Daphne Alkaios Zoe Praxilla Menon Arete Solon Hypatia Kimon Rhode Xenon Elpis Theron Kallisto Dion Lysistrata Pindaros Selene
Aristos Berenike Kyros Damaris Euandros Phoibe Glaukos Helike Ibykos Kassandra Lykos Nephele Orestes Pyrrha Simon Tyro`.split(/\s+/);
export const greekName = (key) => FIRST[hash32('who:' + key) % FIRST.length];

// the look: a friendly toy-like character. Plain data, seeded by the id (olympus/people3d.js spec() wins when it is loaded).
const SKIN = ['#f1c9a5', '#e2b08a', '#c98f66', '#a9714b', '#f6d7b8', '#8a5a3c'], HAIR = ['#2e2018', '#5a3a22', '#8a5a2c', '#c9a15a', '#d8d2c8', '#3a3a3e', '#7a2e1c'];
const OUTFIT = ['#c8a24a', '#7f8a52', '#c96a4a', '#4b7a99', '#f3ece0', '#9c6b3c'], STYLES = ['short', 'bun', 'long', 'bald', 'curly'];
let spec3d = null;
/** optional: the shared 3D look kit. Never throws; without it our own seeded look is used. */
/** the shared People kit (olympus/people.js sets window.OLYMPUS_PEOPLE) and its 3D look (people3d.js), both optional: loaded once, never throws.
 *  Waits at most ms; when they are missing everything here keeps working on our own chat card and our own look. */
let kitP = null;
export function loadKit(base = import.meta.url, ms = 1500) {
  if (!kitP) kitP = Promise.all([
    typeof window !== 'undefined' && window.OLYMPUS_PEOPLE ? Promise.resolve(true) : import(new URL('../olympus/people.js?v=p3', base).href).then(() => true, () => false),
    loadLook(base),
  ]).then(async ([k, l]) => { const K = kit(); if (K && typeof K.ready === 'function') { try { await K.ready(); } catch (e) { /* the kit's own fallback */ } } return { kit: !!K || k, look: l }; });
  return Promise.race([kitP, new Promise((r) => setTimeout(() => r({ kit: !!kit(), look: !!spec3d, late: true }), ms))]);
}
export async function loadLook(base = import.meta.url) { try { const m = await import(new URL('../olympus/people3d.js', base).href); if (m && typeof m.spec === 'function') spec3d = m.spec; } catch (e) { spec3d = null; } return !!spec3d; }
export function lookOf(id, kind = '') {
  const r = rng(hash32('look:' + id)), own = { skin: SKIN[Math.floor(r() * SKIN.length)], hair: HAIR[Math.floor(r() * HAIR.length)], hairStyle: STYLES[Math.floor(r() * STYLES.length)], outfit: OUTFIT[Math.floor(r() * OUTFIT.length)], height: .92 + r() * .2, kind };
  if (kind === 'keeper') own.outfit = '#f3ece0'; if (kind === 'builder') own.outfit = '#c8a24a';
  if (spec3d) { try { const s = spec3d(id); if (s && s.skin && s.hair && s.outfit) return { ...own, skin: s.skin, hair: s.hair, outfit: s.outfit, hairStyle: s.hairStyle || own.hairStyle, height: s.height || own.height, shared: true }; } catch (e) { /* our own look */ } }
  return own;
}

export const kit = () => (typeof window !== 'undefined' && window.OLYMPUS_PEOPLE && typeof window.OLYMPUS_PEOPLE.open === 'function' ? window.OLYMPUS_PEOPLE : null);
/** the id the kit knows for this person (its own id or one of its other spellings), or null */
export function kitId(person) {
  const K = kit(); if (!K) return null;
  for (const id of [person.id, ...(person.alt || [])]) { try { if (typeof K.get !== 'function' || K.get(id)) return id; } catch (e) { /* next */ } }
  return null;
}
/** talk to a person: 'kit' when the shared chat sheet opened, 'own' when the caller must show its own chat card */
export function talkTo(person, opts = {}) {
  const id = kitId(person); if (id) { try { kit().open(id, opts); return 'kit'; } catch (e) { /* fall back */ } }
  return 'own';
}

/** the person speaks its hello (the kit's say(): a speech bubble, a voice, lips that move) and shows its work (the kit's show(): a card), when the kit has them.
 *  -> { say, show } booleans; never throws. Without them the chat card says it. */
export function sayShow(person, scene, o = {}) {
  const K = typeof window !== 'undefined' ? window.OLYMPUS_PEOPLE : null, out = { say: false, show: false, card: null }; if (!K || !person) return out;
  const id = kitId(person) || person.id, first = (person.qa || [])[0];
  // say(id, text, { scene, figure | project | anchor }) (docs/PERSONA_API.md "Voices"): a speech bubble over the person (o.project = () => { x, y, front } in page pixels), its voice when on
  try { if (typeof K.say === 'function') { K.say(id, String(person.hello || (first && first[1]) || person.name).slice(0, 240), { scene, figure: o.figure || null, project: o.project || null, anchor: o.project ? null : o.anchor || null, mood: person.mood === 'sad' ? 'worried' : undefined }); out.say = true; } } catch (e) { /* our own card */ }
  // show(id, what) -> the work card element, built by the kit from the person's own facts; the caller places it (our chat card)
  try { if (typeof K.show === 'function' && first) { const el = K.show(id, { kind: 'work', title: person.title, text: first[1], items: (person.qa || []).slice(1, 4).map((x) => x[1]).filter(Boolean) }, { mini: true }); out.show = true; if (el && el.nodeType === 1) out.card = el; } } catch (e) { /* our own card */ }
  return out;
}
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** an Athens villager speaks for its app's village: the six answers come from the village's own rows */
export function villagerPerson(v, k = 0) {
  const rows = v.rows || [], good = rows.find((r) => r.tone === 'good'), bad = rows.find((r) => r.tone === 'bad' || r.tone === 'warn'), ex = v.status === 'example' ? ' These are example numbers, not live ones.' : '';
  const name = greekName(`villager:${v.id}:${k}`), none = `I have no data today: ${v.name} has not published a file I can read.`;
  return { id: 'villager:' + v.id, alt: [], kind: 'villager', name: `${name} of ${v.name}`, title: `Villager of the ${v.name} village`, app: v.id, qa: [
    ['What is this village working on?', rows.length ? `${v.blurb}. ${v.fact}${ex}` : `${v.blurb}. ${none}`],
    ['What was the last result?', rows.length ? `${rows[0].label}: ${rows[0].say}${ex}` : none],
    ['What did you learn?', good ? `The best I can show: ${good.label}: ${good.say}${ex}` : rows.length ? 'Nothing clearly good in the rows I hold today.' : none],
    ['What failed here?', bad ? `${bad.label}: ${bad.say}${ex}` : rows.length ? 'Nothing failed in the rows I hold today.' : none],
    ['What next?', `I only read ${v.name}'s published file. Open ${v.name} to act; I cannot place orders: paper and suggestions only.`],
    ['How many houses, and why?', `${v.real || 0} house${v.real === 1 ? '' : 's'}: one for each row of ${v.name}'s file${v.unplaced ? `, and ${v.unplaced} more rows did not fit` : ''}.${ex}`],
  ] };
}

/** our own chat card (DOM): portrait, name, six questions, one answer. onAsk(i) lets the scene react (the person nods). */
export function chatCard(person, o = {}) {
  if (typeof document !== 'undefined' && !document.querySelector('link[data-people-css]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('./people.css', import.meta.url).href; l.dataset.peopleCss = '1'; document.head.append(l); }
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  const box = el('div', 'ppl-chat'), head = el('div', 'ppl-head'), K = typeof window !== 'undefined' ? window.OLYMPUS_PEOPLE : null; box.dataset.person = person.id;
  let face = null; try { if (K && typeof K.portrait === 'function') face = K.portrait(person.id, 44); } catch (e) { face = null; }
  if (!face) { const L = lookOf(person.id, person.kind); face = el('span', 'ppl-face'); face.style.background = L.skin; face.style.borderColor = L.outfit; face.style.boxShadow = `inset 0 12px 0 ${L.hair}`; face.textContent = '· ·'; face.setAttribute('aria-hidden', 'true'); }
  const who = el('div', 'ppl-who'); who.append(el('b', '', person.name), el('small', '', person.title)); head.append(face, who);
  const ans = el('p', 'ppl-answer', person.hello || `I am ${person.name}. Ask me anything below.`); ans.setAttribute('aria-live', 'polite');
  const qs = el('div', 'ppl-qs');
  person.qa.forEach(([q, a], i) => { const b = el('button', '', q); b.type = 'button'; b.onclick = () => { ans.textContent = a; for (const x of qs.children) x.classList.toggle('on', x === b); o.onAsk && o.onAsk(i, q, a); }; qs.append(b); });
  box.append(head, ans, qs, el('p', 'ppl-fine', person.fine || 'Answers come only from this city\'s own data. I cannot place orders: paper and suggestions only.'));
  return box;
}
export { cap };
