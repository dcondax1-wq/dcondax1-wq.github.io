// Jarvis dialogue (2026-11-11, JARVIS BRAIN v3): the small memory that makes follow-ups work.
// After every answer the skills keep ONE state: what was asked (intent), about what (entity), for which account, for which days,
// and what "it" could open. A follow-up ("and yesterday?", "what about ATLAS?", "why?", "open it", "explain that in plain words",
// "compare with last week") is read against that state. It expires after 5 minutes; an expired or missing state means the phrase
// is not a follow-up and the rest of the brain answers it as before. No DOM, no network, nothing kept on disk.
//
//   import { createDialogue, followUp, timeRange, TTL_MS } from './dialogue.js';
//   const dlg = createDialogue({ now });  dlg.note({ intent, entity, account, range, link, hits, text });  dlg.get(nowMs) -> state | null
//   followUp('and yesterday?')  -> { type: 'more', rest: 'yesterday' }      (what `rest` means is decided by the skills, with the data)
//   timeRange('last week', nowMs) -> { id, label, from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' } | null     (New York days)
// iPhone Safari 16: plain ES2020, no regex lookbehind.

import { norm } from './router.js';
import { etParts, dowOfDay } from './jdata.js';

export const TTL_MS = 5 * 60e3;

export function createDialogue(opts) {
  const o = opts || {};
  const nowMs = (n) => { const v = n != null ? n : (typeof o.now === 'function' ? o.now() : Date.now()); return v instanceof Date ? v.getTime() : Number(v) || Date.now(); };
  let st = null;
  return {
    /** keep the state of the answer just given (replaces the old one) */
    note(s, now) { st = s && s.intent ? { intent: s.intent, args: s.args || {}, entity: s.entity || null, account: s.account || null, range: s.range || null, topic: s.topic || null, link: s.link || null, hits: Array.isArray(s.hits) ? s.hits.slice(0, 5) : null, why: s.why || null, text: String(s.text || '').slice(0, 400), tour: s.tour || null, at: nowMs(now) } : null; },
    /** the live state, or null when there is none or it is older than 5 minutes */
    get(now) { if (st && nowMs(now) - st.at > TTL_MS) st = null; return st; },
    clear() { st = null; },
    /** JARVIS_API.context(): what a follow-up would refer to (no numbers, no text of the answer) */
    view(now) { const s = this.get(now); return s ? { intent: s.intent, entity: s.entity, account: s.account, range: s.range ? { id: s.range.id, label: s.range.label, from: s.range.from, to: s.range.to } : null, topic: s.topic, canOpen: !!(s.link && s.link.open) || !!(s.hits && s.hits.length), tour: s.tour ? { id: s.tour.id, step: s.tour.i } : null, ageSec: Math.round((nowMs(now) - s.at) / 1000), expiresSec: Math.max(0, Math.round((TTL_MS - (nowMs(now) - s.at)) / 1000)) } : null; },
  };
}

const ORD = { first: 1, '1st': 1, top: 1, one: 1, second: 2, '2nd': 2, two: 2, third: 3, '3rd': 3, three: 3, fourth: 4, '4th': 4, four: 4, fifth: 5, '5th': 5, five: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, last: -1 };
const P = '(?:please |pls |jarvis |ok |okay |so |and |then |now |yes |well |hmm |um )*';
const RX = {
  open: new RegExp('^' + P + '(?:(?:can you |could you )?(?:open|show|launch|pull up|go to|take me to|bring up|load|see|view|display)(?: me)? (?:it|that|this|that one|this one|them|that app|that page|the app|the page|it up|that up)|take me there|go there|open|show me|show it to me|let me see it|let me see|open up)(?: please| now)?$'),
  openN: new RegExp('^' + P + '(?:(?:open|show|launch|pull up|go to|take me to|bring up|see|view)(?: me)? )?(?:the |number |hit |result |#)?(first|1st|top|second|2nd|third|3rd|fourth|4th|fifth|5th|sixth|seventh|eighth|ninth|tenth|last|one|two|three|four|five|[1-9])(?: one| hit| result| link| match)?(?: please| now)?$'),
  why: new RegExp('^' + P + '(?:but )?(?:why|why is that|why not|why so|why is it|why was that|why that|why this|how come|how so|whats the reason|what is the reason|explain why|and why|why though|what makes you say that|says who|based on what)$'),
  plain: new RegExp('^' + P + '(?:(?:can you |could you |would you )?(?:explain|say|put|repeat|tell me|give me|rephrase|reword) (?:that|it|this)(?: again)?(?: to me)?(?: but)? (?:in |with |using |into )?(?:plain|simple|simpler|easy|easier|normal|human|laymans?|layman\'s|basic|kid|everyday|fewer|less) (?:words|english|terms|language|speak|talk)|(?:in )?(?:plain|simple|simpler|easier|normal) (?:words|english|terms|language)|simpler|simplify|simplify that|eli5|explain like i am five|explain like im five|what does that mean|what does it mean|what do you mean|whats that mean|i (?:don\'t|dont|do not) (?:understand|get it|get that|follow)|i (?:didn\'t|didnt|did not) (?:understand|get that|get it)|huh|explain that|explain it|explain|explain that to me|say that again simply|in short|shorter|tldr|tl dr|the short version|short version)(?: please)?$'),
  compare: new RegExp('^' + P + '(?:(?:compare|compared|comparing|versus|vs|against)(?: it| that| this| them| those)?(?: with| to| against| and)?|how does (?:that|it|this) compare (?:with|to|against)|how (?:is|was) (?:that|it) (?:compared to|against|versus|vs)|(?:is|was) (?:that|it) (?:better|worse|more|less) than)\\s+(.+?)$'),
  more: new RegExp('^' + P + '(?:(?:and )?(?:what about|how about|what of)|and for|and on|and in|and|same for|same thing for|same question for|now for|now do|now|ok and|or|but for|just|only)\\s+(.+?)$'),
  moreTail: new RegExp('^' + P + '(.+?)\\s+(?:instead|too|as well|also|then)$'),
  bare: /^(?:the )?(?:yesterday|today|tomorrow|last week|this week|next week|last month|this month|the week before|the day before|last 7 days|last 30 days|past week|past month|week to date|month to date|all time|overall)$/,
  next: new RegExp('^' + P + '(?:next|next one|next stop|next step|the next one|continue|go on|keep going|carry on|onward|forward|whats next on the tour|next please)$'),
  back: new RegExp('^' + P + '(?:back|go back|previous|previous one|previous stop|the one before|last stop|one back)$'),
  stop: new RegExp('^' + P + '(?:(?:stop|end|exit|quit|finish|leave|cancel) (?:the |this )?tour|thats enough|that is enough|enough touring|tour over|no more stops)$'),
};
/** is this phrase shaped like a follow-up? (whether it IS one depends on the state: the skills decide) */
export function followUp(raw) {
  const q = norm(raw).replace(/[?!.,]+$/g, '').replace(/\s+/g, ' ').trim();
  if (!q || q.length > 120) return null;
  let m;
  if (RX.stop.test(q)) return { type: 'tour_stop' };
  if (RX.next.test(q)) return { type: 'tour_next' };
  if (RX.back.test(q)) return { type: 'tour_back' };
  if (RX.open.test(q)) return { type: 'open', n: 1 };
  if ((m = q.match(RX.openN))) { const w = m[1]; return { type: 'open', n: ORD[w] != null ? ORD[w] : parseInt(w, 10), explicit: /^(?:.* )?(?:open|show|launch|pull up|go to|take me to|bring up|see|view)\b/.test(q) }; }
  if (RX.why.test(q)) return { type: 'why' };
  if (RX.plain.test(q)) return { type: 'plain' };
  if ((m = q.match(RX.compare))) return { type: 'compare', rest: m[1] };
  if (RX.bare.test(q)) return { type: 'more', rest: q.replace(/^the /, ''), bare: true };
  if ((m = q.match(RX.more))) return { type: 'more', rest: m[1].replace(/^(?:the|my|our|for|on|in)\s+/, '') };
  if ((m = q.match(RX.moreTail)) && m[1].split(' ').length <= 4) return { type: 'more', rest: m[1].replace(/^(?:the|my|our|for|on|in)\s+/, ''), tail: true };
  return null;
}

const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (day, n) => { const [y, m, d] = day.split('-').map(Number); return ymd(Date.UTC(y, m - 1, d + n)); };
const DOW = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dayLabel = (day) => { const [, m, d] = day.split('-').map(Number); return `${DOW[dowOfDay(day)].slice(0, 3).replace(/^./, (c) => c.toUpperCase())} ${MON[m - 1]} ${d}`; };
/** a spoken time range -> New York days, inclusive. null when the words are not a time range. */
export function timeRange(text, nowMs) {
  const q = norm(text).replace(/[?!.,]+$/g, '').replace(/^(?:for|on|in|during|the|from)\s+/, '').replace(/^(?:for|on|in|during|the|from)\s+/, '').trim();
  const today = etParts(nowMs).day, dow = dowOfDay(today), mon = addDays(today, -((dow + 6) % 7));
  const R = (id, label, from, to) => ({ id, label, from, to });
  if (/^(?:today|so far today|this morning|tonight|now)$/.test(q)) return R('today', 'Today (' + dayLabel(today) + ')', today, today);
  if (/^(?:yesterday|the day before|day before)$/.test(q)) { const d = addDays(today, -1); return R('yesterday', 'Yesterday (' + dayLabel(d) + ')', d, d); }
  if (/^(?:tomorrow)$/.test(q)) { const d = addDays(today, 1); return R('tomorrow', 'Tomorrow (' + dayLabel(d) + ')', d, d); }
  if (/^(?:this week|week to date|the week|so far this week|wtd)$/.test(q)) return R('this_week', `This week (${dayLabel(mon)} to ${dayLabel(today)})`, mon, today);
  if (/^(?:last week|the week before|previous week|the last week|prior week|past week)$/.test(q)) { const a = addDays(mon, -7), b = addDays(mon, -1); return R('last_week', `Last week (${dayLabel(a)} to ${dayLabel(b)})`, a, b); }
  if (/^(?:next week)$/.test(q)) { const a = addDays(mon, 7), b = addDays(mon, 13); return R('next_week', `Next week (${dayLabel(a)} to ${dayLabel(b)})`, a, b); }
  if (/^(?:this month|month to date|the month|so far this month|mtd)$/.test(q)) return R('this_month', `This month (${MON[+today.slice(5, 7) - 1]} 1 to ${dayLabel(today)})`, today.slice(0, 8) + '01', today);
  if (/^(?:last month|previous month|the month before|prior month|past month)$/.test(q)) { const first = today.slice(0, 8) + '01', b = addDays(first, -1), a = b.slice(0, 8) + '01'; return R('last_month', `Last month (${MON[+a.slice(5, 7) - 1]} ${a.slice(0, 4)})`, a, b); }
  let m = q.match(/^(?:the )?(?:last|past) (\d{1,3}) days$/);
  if (m && +m[1] >= 1 && +m[1] <= 366) return R('last_' + m[1], `The last ${m[1]} days`, addDays(today, -(+m[1] - 1)), today);
  if (/^(?:all time|overall|ever|in total|since the start|all)$/.test(q)) return R('all', 'All time', '2000-01-01', today);
  m = q.match(/^(?:last |this past |on )?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/);
  if (m) { const want = DOW.indexOf(m[1]); let back = (dow - want + 7) % 7; if (back === 0 && /^last /.test(q)) back = 7; const d = addDays(today, -back); return R('day_' + d, (back === 0 ? 'Today' : 'Last ' + m[1].replace(/^./, (c) => c.toUpperCase())) + ' (' + dayLabel(d) + ')', d, d); }
  return null;
}
/** the range to compare a range with, when he only said one side ("compare with last week" after "today") */
export function partner(other, cur, nowMs) {
  const span = (r) => (/week/.test(r.id) ? 'w' : /month/.test(r.id) ? 'm' : /^last_\d|^all$/.test(r.id) ? 'x' : 'd');
  if (cur && cur.id !== other.id && span(cur) === span(other)) return cur;
  const pick = { last_week: 'this week', yesterday: 'today', last_month: 'this month', this_week: 'last week', today: 'yesterday', this_month: 'last month' }[other.id];
  return pick ? timeRange(pick, nowMs) : timeRange('this week', nowMs);
}
export default createDialogue;
