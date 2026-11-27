// BRIEF ME: the words (night-nq-main 2026-11-27). Pure ES module, no DOM, no speech: node-tested (tests/test_nq_brief.py).
// Built from the SAME model as the hero (nqdesk.js hero(): today, accts[].goalBig / goalUnit / room, bots[].word / line, next, level, honest),
// ages said honestly ("as of 12 minutes ago") and counted to the moment it is spoken. ~20 seconds = about 55-70 words: short sentences.
// API:
//   briefText(H, nowS)  -> { text, parts: [sentence...], words }
//   agoWords(s)         -> 'just now' | '12 minutes ago' | '2 hours ago' | '3 days ago'
//   pickVoice(voices)   -> the best English voice (neural / natural first, then known good ones, then en-US / en-GB), or null
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(+v) ? null : +v);
const usd = (v) => '$' + Math.round(Math.abs(v)).toLocaleString('en-US');

export function agoWords(s) {
  const n = num(s);
  if (n === null) return '';
  if (n < 90) return 'just now';
  const m = Math.round(n / 60);
  if (m < 90) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(n / 3600);
  if (h < 36) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(n / 86400);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}
function inWords(s) {
  const n = num(s); if (n === null) return '';
  const m = Math.max(1, Math.round(n / 60));
  if (m < 60) return `in ${m} minute${m === 1 ? '' : 's'}`;
  const h = Math.floor(m / 60), r = m % 60;
  return `in ${h} hour${h === 1 ? '' : 's'}${r ? ` ${r} minute${r === 1 ? '' : 's'}` : ''}`;
}
const say = (t) => String(t || '').replace(/\s*·\s*/g, ', ').replace(/\bMNQ\b/g, 'micro').replace(/\bET\b/g, 'Eastern').replace(/\s+/g, ' ').trim();
const firstBit = (t, max) => { const m0 = /^(.*?[.!?])(\s|$)/.exec(say(t)), s = m0 ? m0[1] : say(t); if (s.length <= max) return s.replace(/[.!?]+$/, ''); const c = s.slice(0, max); return c.slice(0, c.lastIndexOf(' ') > 20 ? c.lastIndexOf(' ') : max).replace(/[,;:]$/, ''); };

export function briefText(H, nowS) {
  const parts = [];
  if (!H || typeof H !== 'object') return { text: 'No numbers on this page yet.', parts: ['No numbers on this page yet.'], words: 6 };
  const late = num(nowS) !== null && num(H.nowS) !== null ? Math.max(0, num(nowS) - num(H.nowS)) : 0;   // the model was built a while before the tap
  const age = num(H.ageS) === null ? null : num(H.ageS) + late;
  const accts = Array.isArray(H.accts) ? H.accts : [], withNum = accts.filter((a) => a && a.has);
  if (H.demo) parts.push('Olympus brief. These are example numbers, not your accounts.');
  else if (age === null) parts.push('Olympus brief. Your PC has not reported yet, so there are no account numbers. Nothing here is made up.');
  else parts.push(`Olympus brief, as of ${agoWords(age)}.`);
  const t = num(H.today);
  if (t !== null && withNum.length) parts.push(Math.abs(t) < 0.5 ? `Today: flat across ${withNum.length} account${withNum.length === 1 ? '' : 's'}.` : `Today: ${t > 0 ? 'up' : 'down'} ${usd(t)} across ${withNum.length} account${withNum.length === 1 ? '' : 's'}.`);
  for (const a of withNum) {
    const goal = a.goalBig && a.goalBig !== '-' ? (a.goalUnit ? `${a.goalBig} ${a.goalUnit}` : a.goalBig) : '';
    const room = num(a.room) === null ? '' : `${usd(a.room)} of room`;
    parts.push(`${a.name}: ${[goal, room].filter(Boolean).join(', ') || 'no numbers yet'}.`);
  }
  for (const b of Array.isArray(H.bots) ? H.bots : []) {
    if (!b) continue;
    const w = String(b.word || '').toLowerCase(), side = b.side ? ` ${String(b.side).toLowerCase()}` : '';
    let s = `${b.name}: ${w}${side}`;
    if (b.line && /armed|forming|in trade|done/.test(w)) s += `, ${firstBit(b.line, 60)}`;
    const ba = num(b.ageS) === null ? null : num(b.ageS) + late;
    if (!H.demo && ba !== null && ba > 20 * 60) s += `, its report is ${agoWords(ba).replace(' ago', '')} old`;
    parts.push(s + '.');
  }
  const nx = H.next || {};
  if (nx.label) parts.push(`Next: ${say(nx.label)}${num(nx.inS) !== null ? ' ' + inWords(Math.max(60, num(nx.inS) - late)) : ''}.`);
  const warn = [];
  if (!H.demo && age !== null && (H.level === 'bad' || age > 60 * 60)) warn.push(`the PC report is ${agoWords(age).replace(' ago', '')} old, so these numbers may be out of date`);
  else if (!H.demo && H.level === 'warn') warn.push('the PC report is getting old');
  for (const a of withNum) { const f = num(a.roomFrac); if (f !== null && f < 0.3) warn.push(`${a.name} has only ${usd(a.room)} of room left`); }
  if (warn.length) parts.push(`Warning: ${warn.join('; ')}.`);
  else if (age !== null && !H.demo) parts.push('No warnings.');
  const text = parts.join(' ');
  return { text, parts, words: text.split(/\s+/).filter(Boolean).length };
}

const GOOD = [/natural/i, /neural/i, /online/i, /premium|enhanced/i, /google (us|uk) english/i, /\b(samantha|daniel|serena|karen|moira|alex|aria|guy|jenny|libby|ryan|sonia)\b/i];
export function pickVoice(voices) {
  const V = (Array.isArray(voices) ? voices : []).filter((v) => v && /^en([-_]|$)/i.test(String(v.lang || '')));
  if (!V.length) return null;
  const score = (v) => {
    let s = 0; const n = String(v.name || ''), l = String(v.lang || '').replace('_', '-').toLowerCase();
    GOOD.forEach((re, i) => { if (re.test(n)) s += 60 - i * 8; });
    if (l === 'en-us') s += 12; else if (l === 'en-gb') s += 10; else if (l === 'en-au' || l === 'en-ca') s += 6;
    if (/novelty|whisper|bad news|bells|bubbles|cellos|zarvox|trinoids|albert|jester|organ|superstar|wobble|boing|deranged|hysterical/i.test(n)) s -= 100;
    if (v.default) s += 2;
    return s;
  };
  return V.map((v, i) => ({ v, s: score(v), i })).sort((a, b) => b.s - a.s || a.i - b.i)[0].v;
}
