// Jarvis and the people of OLYMPUS (2026-11-11, docs/PERSONA_API.md): "talk to Sibyl", "let me speak to Chrysos",
// "ask Chrysos what he found", "who can I talk to", "stand-up", "what is everyone doing".
// This module only READS the phrase and matches the name; the answers come from the People kit (globalThis.OLYMPUS_PEOPLE, when the
// page loaded it) or, without the kit, from the agents file the skills already read. No DOM, no network, no state.
//
//   import { peopleAsk, matchPerson, FALLBACK } from './jpeople.js';
//   peopleAsk('ask Chrysos what he found')  -> { type: 'talk', who: 'chrysos', question: 'what he found' }
//   peopleAsk('who can I talk to')          -> { type: 'list' }        peopleAsk('stand-up') -> { type: 'standup' }
//   matchPerson('sybil', roster)            -> { id, name, ... } | null      (fuzzy: a word of the name, a prefix, a small typo)
// iPhone Safari 16: plain ES2020, no regex lookbehind.

import { norm, lev } from './router.js';

// The people Jarvis knows of when neither the kit nor people.json is there (ids as docs/PERSONA_API.md defines them).
export const FALLBACK = [
  { id: 'scanner:sibyl', name: 'Sibyl', title: 'Prediction-market edges, on paper', kind: 'scanner', app: 'sibyl' },
  { id: 'scanner:chrysos', name: 'Chrysos', title: 'The fleet planner: fees against payouts', kind: 'scanner', app: 'chrysos' },
  { id: 'scanner:mercury', name: 'Mercury', title: 'Prop-firm deals and rule changes', kind: 'scanner', app: 'mercury' },
  { id: 'scanner:oikos', name: 'Oikos', title: 'The household: where money leaks', kind: 'scanner', app: 'oikos' },
  { id: 'scanner:arbiter', name: 'Arbiter', title: 'Spreads and funding rates, on paper', kind: 'scanner', app: 'arbiter' },
  { id: 'bot:lit', name: 'Zlarior', title: 'The LIT bot on the 50K eval', kind: 'bot', app: 'zenith', aka: 'lit' },
  { id: 'bot:atlas', name: 'ATLAS', title: 'The second strategy on a 25K', kind: 'bot', app: 'zenith' },
  { id: 'bot:blitz', name: 'BLITZ', title: 'The scalp on a 25K', kind: 'bot', app: 'zenith' },
  { id: 'bot:kalshi', name: 'Kalshi bot', title: 'The prediction-market bot', kind: 'bot', app: 'kalshicity' },
  { id: 'mind', name: 'Mind', title: 'Memory, game plans and trade reviews', kind: 'mind', app: 'mind' },
];
const P = '(?:please |pls |jarvis |hey jarvis |ok |okay |can i |could i |may i |can you |could you |i want to |i wanna |i would like to |i\'d like to |i need to |let me |lets |let\'s |let us |now |and |then )*';
const LIST = new RegExp('^' + P + '(?:who can i (?:talk|speak|chat) (?:to|with)|who (?:is|s|\'s) (?:here|around|there|in the symposium|on the team)|who (?:works|lives) here|who are the (?:people|workers|agents)|(?:list|show|show me|name) (?:the |all the |all )?(?:people|workers|persons|characters|team)|the roster|roster|who do we have|who can i ask|meet the (?:team|people|workers))$');
const STANDUP = new RegExp('^' + P + '(?:(?:the |a |our |daily |morning |todays |run the |do the |do a |start the |give me the |give me a |hold a |call a )*(?:stand ?-?up|standup meeting|stand up meeting|round table|roundtable|team update|roll call)(?: please| now| meeting)?|what (?:is|s|\'s|are) (?:everyone|everybody|every worker|the team|the workers|the people|they all) (?:doing|up to|working on|on today)|how (?:is|s|are) (?:everyone|everybody|the team) doing)$');
const TALK = new RegExp('^' + P + '(?:talk|speak|chat|have a word|have a chat|a word|get in touch|check in|catch up) (?:to|with) (.+?)$');
const FETCH = new RegExp('^' + P + '(?:get me|bring me|call|summon|fetch|put me through to|connect me to|connect me with|open a chat with|open the chat with|i want|meet|find me) (.+?)$');
const ASK = new RegExp('^' + P + '(?:ask|tell|message|ping|question for) (.+)$');
const NOT_PERSON = /^(?:me|you|myself|yourself|us|him|her|them|it|someone|somebody|anyone|a human|a person|my wife|my broker|the broker|mffu|support|the owner|god)\b/;

/** is this about talking to the people? -> { type, who?, question? } or null */
export function peopleAsk(raw) {
  const q = norm(raw).replace(/[?!.,]+$/g, '').trim();
  if (!q || q.length > 200) return null;
  if (LIST.test(q)) return { type: 'list' };
  if (STANDUP.test(q)) return { type: 'standup' };
  let m = q.match(TALK);
  if (m) { const who = m[1].replace(/^(?:the|my|our|mr|mrs|ms)\s+/, '').replace(/\s+(?:please|pls|now|for a minute|for a moment|about (?:it|that))$/, '').trim(); const ab = who.match(/^(.+?) about (.+)$/); return !who || NOT_PERSON.test(who) ? null : ab ? { type: 'talk', who: ab[1], question: 'what about ' + ab[2] } : { type: 'talk', who }; }
  m = q.match(ASK);
  if (m) {
    const rest = m[1].replace(/^(?:the|my|our)\s+/, '');
    if (NOT_PERSON.test(rest)) return null;
    const cut = rest.match(/^(.+?)\s+((?:what|how|why|when|where|which|who|if|whether|about|to|for|is|are|did|does|do|has|have|can|could|should|will)\b.*)$/);
    return cut ? { type: 'talk', who: cut[1].replace(/[:,]$/, ''), question: cut[2].replace(/^about /, 'what about '), soft: true } : { type: 'talk', who: rest.replace(/[:,].*$/, ''), question: (rest.match(/[:,]\s*(.+)$/) || [])[1] || '', soft: true };
  }
  m = q.match(FETCH);
  if (m) { const who = m[1].replace(/^(?:the|my|our)\s+/, '').trim(); return !who || NOT_PERSON.test(who) || who.split(' ').length > 3 ? null : { type: 'talk', who, soft: true }; }
  return null;
}

const sorted = (w) => w.split('').sort().join('');
// a small typo, or the same letters in another order ("sybil" for "sibyl")
const near = (t, w) => t.length >= 4 && w.length >= 4 && (lev(t, w, t.length >= 8 ? 2 : 1) <= (t.length >= 8 ? 2 : 1) || (t.length === w.length && t[0] === w[0] && sorted(t) === sorted(w)));
const tail = (id) => String(id || '').split(':').pop();
/** the person a spoken name means, or null. roster: [{ id, name, title?, aka? }] */
export function matchPerson(said, roster) {
  const q = norm(said).replace(/^(?:the|mr|mrs|ms)\s+/, '').replace(/\s+(?:agent|worker|bot|scanner|builder|guy|team|person)$/, '').trim();
  const list = Array.isArray(roster) ? roster.filter((p) => p && p.id && p.name) : [];
  if (!q || !list.length) return null;
  let best = null, bs = 0;
  const qt = q.split(' ');
  for (const p of list) {
    const name = norm(p.name), forms = [name, norm(tail(p.id)).replace(/[-_]/g, ' '), norm(p.aka || '')].filter(Boolean);
    let s = 0;
    for (const f of forms) {
      if (f === q) s = Math.max(s, 10);
      else if ((' ' + f + ' ').indexOf(' ' + q + ' ') >= 0) s = Math.max(s, 7 + q.length / (f.length + 1));               // a word of the name: "brain" -> "Jarvis brain"
      else if ((' ' + q + ' ').indexOf(' ' + f + ' ') >= 0) s = Math.max(s, 6.5);                                          // the name inside what he said
      else if (q.length >= 4 && f.startsWith(q)) s = Math.max(s, 6);
      else {
        const fw = f.split(' ');
        const hit = qt.filter((t) => fw.some((w) => w === t || (t.length >= 4 && w.startsWith(t)) || near(t, w))).length;
        if (hit === qt.length) s = Math.max(s, 5 - Math.abs(fw.length - qt.length) * 0.3);
        else if (q.length >= 5 && lev(q, f, 2) <= (q.length >= 8 ? 2 : 1)) s = Math.max(s, 4.5);
      }
    }
    if (s > bs) { bs = s; best = p; }
  }
  return bs >= 4.5 ? best : null;
}
/** the roster from whatever is there: the kit's list, people.json, the agents file (as builders) and the bundled list (no doubles) */
export function roster(parts) {
  const out = [], seen = new Set();
  const add = (p) => { if (!p || typeof p !== 'object' || !p.id || !p.name) return; const k = String(p.name).toLowerCase(); if (seen.has(k) || seen.has(String(p.id))) return; seen.add(k); seen.add(String(p.id)); out.push({ id: String(p.id), name: String(p.name).slice(0, 40), title: String(p.title || p.job || '').slice(0, 120), kind: String(p.kind || ''), app: String(p.app || ''), aka: p.aka || '' }); };
  for (const part of parts || []) for (const p of Array.isArray(part) ? part : []) add(p);
  return out;
}
export const KIND_NAME = { builder: 'Builders', scanner: 'Money scanners', bot: 'Bots', mind: 'The Mind', keeper: 'City keepers', champion: 'Champions', villager: 'Villagers' };
export default peopleAsk;
