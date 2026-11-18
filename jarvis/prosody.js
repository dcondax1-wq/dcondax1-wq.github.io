// Jarvis's natural-speech layer (2026-11-04, owner: "Jarvis sounds like a bot, I want a real person"). Pure text in, text out:
// no DOM, no network, no imports. It runs AFTER tts.js's cleanSpeech (which already removed markdown, emojis, links and said
// "$1,133" as "1,133 dollars") and does what a person does when reading out loud:
//   - numbers, money, percents, times, years, ordinals and tickers become WORDS ("1,133 dollars" -> "eleven hundred thirty three
//     dollars", "9:30 AM" -> "nine thirty A M", "NQ" -> "N Q"), because every voice reads digits differently;
//   - a conversational register: contractions ("do not" -> "don't"), plain words instead of report words ("however" -> "but");
//   - phrases: a long sentence is cut at its commas into breaths, each phrase and sentence gets a short pause, and a rate / pitch
//     nudge by sentence type (a question lifts, a statement settles, a small steady jitter so no two phrases are identical).
//
//   import { prepare, plan, merge, numberToWords, expandNumbers, conversational, SAMPLES, createProsody } from './prosody.js';
//   numberToWords(1133) -> 'one thousand one hundred thirty three'     spokenMoney(1133) -> 'eleven hundred thirty three'
//   expandNumbers('9:30 AM, 2.5 percent') -> 'nine thirty A M, two point five percent'
//   conversational("It is fine, but we do not know.") -> "It's fine, but we don't know."
//   prepare(text, { conversational: true })   expandNumbers + tickers + conversational, in that order
//   plan(text, { max })   -> [{ text, pause (ms, phone voice), rate, pitch, type: 's' | 'q' | 'x' | 'c' }]  (<= max chars each)
//   merge(items, max)     -> the same items joined into parts of up to max chars (a cloud voice: fewer, longer requests)
//   createProsody(opts)   -> { prepare, plan, merge } with the owner's switches baked in (the shape tts.js takes as `prosody`)
// iPhone Safari 16: plain ES2020, no regex lookbehind, no nullish or optional chaining

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen',
  'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES = [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';

function below100(n) { return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : ''); }
function below1000(n) {
  const h = Math.floor(n / 100), r = n % 100;
  return (h ? ONES[h] + ' hundred' + (r ? ' ' : '') : '') + (r ? below100(r) : '');
}
// 1133 -> "one thousand one hundred thirty three"; 0 -> "zero"; -5 -> "minus five"; beyond a quadrillion: digit by digit
export function numberToWords(input) {
  let n = Math.trunc(+input);
  if (!Number.isFinite(n)) return String(input);
  if (n < 0) return 'minus ' + numberToWords(-n);
  if (n >= 1e15) return String(n).split('').map((d) => ONES[+d]).join(' ');
  if (n === 0) return 'zero';
  const out = [];
  for (const sc of SCALES) {
    if (n >= sc[0]) { out.push(below1000(Math.floor(n / sc[0])) + ' ' + sc[1]); n %= sc[0]; }
  }
  if (n) out.push(below1000(n));
  return out.join(' ');
}
// money and prices are said in hundreds: 1,133 -> "eleven hundred thirty three" (1,100-9,999 except the round thousands and 2,000s)
export function spokenMoney(n) {
  const v = Math.trunc(+n);
  if (v >= 1100 && v <= 9999 && v % 1000 !== 0 && !(v >= 2000 && v <= 2099) && !(v >= 1000 && v <= 1099)) {
    const h = Math.floor(v / 100), r = v % 100;
    return numberToWords(h) + ' hundred' + (r ? ' ' + below100(r) : '');
  }
  return numberToWords(v);
}
// 2026 -> "twenty twenty six"; 2005 -> "two thousand five"; 2000 -> "two thousand"; 1999 -> "nineteen ninety nine"
export function yearWords(y) {
  const v = Math.trunc(+y);
  if (v >= 2000 && v <= 2009) return v === 2000 ? 'two thousand' : 'two thousand ' + ONES[v - 2000];
  const a = Math.floor(v / 100), b = v % 100;
  if (b === 0) return below100(a) + ' hundred';
  return below100(a) + ' ' + (b < 10 ? 'oh ' + ONES[b] : below100(b));
}
export function digitsWords(s) { return String(s).split('').map((d) => (/\d/.test(d) ? ONES[+d] : '')).filter(Boolean).join(' '); }
const ORD_IRR = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' };
export function ordinalWords(n) {
  const w = numberToWords(n).split(' '), last = w.pop();
  let o;
  if (ORD_IRR[last]) o = ORD_IRR[last];
  else if (/y$/.test(last)) o = last.replace(/y$/, 'ieth');
  else o = last + 'th';
  w.push(o);
  return w.join(' ');
}
// 9:30 -> "nine thirty", 9:05 -> "nine oh five", 10:00 AM -> "ten A M", 15:55 -> "fifteen fifty five"
export function timeWords(h, m, ap) {
  const hh = +h, mm = +m;
  let s = numberToWords(hh);
  if (mm === 0) s = ap ? s : s + " o'clock";
  else s += ' ' + (mm < 10 ? 'oh ' + ONES[mm] : below100(mm));
  return ap ? s + ' ' + ap.toUpperCase().split('').join(' ') : s;
}
const decimalWords = (int, frac) => numberToWords(int) + ' point ' + digitsWords(frac);

// ------------------------------------------------------------------------------------------------ tickers and trade words
// uppercase words only (so "es" or "be" in a sentence is untouched); each is said the way a trader says it
export const TICKERS = {
  NQ: 'N Q', MNQ: 'M N Q', ES: 'E S', MES: 'M E S', YM: 'Y M', RTY: 'R T Y', CL: 'C L', GC: 'G C',
  VIX: 'vicks', VXN: 'V X N', MFFU: 'M F F U', TV: 'T V', AI: 'A I', API: 'A P I', USD: 'U S D', UTC: 'U T C', ET: 'Eastern time', NY: 'New York',
  PF: 'profit factor', DD: 'drawdown', PNL: 'P and L', ATR: 'A T R', FVG: 'F V G', IFVG: 'I F V G', CISD: 'C I S D', RR: 'R R', EOD: 'end of day',
  PM: 'P M', AM: 'A M', BTC: 'bitcoin', ETH: 'ether', ETF: 'E T F', IPO: 'I P O', CEO: 'C E O', PC: 'P C', OK: 'okay', PDF: 'P D F', GPS: 'G P S',
};
export function expandTickers(text) {
  return String(text).replace(/\b[A-Z][A-Za-z]{1,5}\b/g, (w) => {
    if (w === 'PnL') return 'P and L';
    return Object.prototype.hasOwnProperty.call(TICKERS, w) ? TICKERS[w] : w;
  });
}

// ------------------------------------------------------------------------------------------------ numbers
// Applied to cleanSpeech's output: "1,133 dollars", "2.5 percent", "up 213 dollars", "9:30 AM", "8R", "5m", "2026".
export function expandNumbers(input) {
  let s = String(input == null ? '' : input);
  // times first (before ranges and decimals see the colon): 9:30 AM, 15:55, 3 PM
  s = s.replace(/\b(\d{1,2}):([0-5]\d)(?::[0-5]\d)?(?:\s?(AM|PM|am|pm)\b)?(?![\d:])/g, (m0, h, mi, ap) => timeWords(h, mi, ap));
  s = s.replace(/\b(\d{1,2})\s?(AM|PM|am|pm)\b/g, (m0, h, ap) => numberToWords(h) + ' ' + ap.toUpperCase().split('').join(' '));
  // ISO dates: 2026-11-04 -> November fourth, twenty twenty six
  s = s.replace(/\b((?:19|20)\d\d)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/g, (m0, y, mo, d) => MONTH_NAMES[+mo - 1] + ' ' + ordinalWords(+d) + ', ' + yearWords(y));
  // years after a month name or "in / since / until / by / during / year", not before a unit
  s = s.replace(new RegExp('\\b((?:' + MONTHS + ')\\.?(?:\\s\\d{1,2}(?:st|nd|rd|th)?,?)?|in|since|until|by|during|year|of|from|to)\\s((?:19|20)\\d\\d)\\b(?![,.]?\\d)(?!\\s(?:points?|dollars?|percent|trades?|contracts?|shares|R\\b|times))', 'gi'),
    (m0, pre, y) => pre + ' ' + yearWords(y));
  s = s.replace(/\b(\d+)(st|nd|rd|th)\b/gi, (m0, n) => ordinalWords(n));
  // chart timeframes and durations: 5m, 15m, 4h (capital M was already "million")
  s = s.replace(/\b(\d+)\s?(?:m|min|mins)\b(?!\w)/g, (m0, n) => numberToWords(n) + (+n === 1 ? ' minute' : ' minutes'));
  s = s.replace(/\b(\d+)\s?(?:h|hr|hrs)\b(?!\w)/g, (m0, n) => numberToWords(n) + (+n === 1 ? ' hour' : ' hours'));
  // multiples of risk: 8R, 1.5R, +3R
  s = s.replace(/\b(\d+(?:\.\d+)?)R\b/g, '$1 R');
  // ranges: 3-5 -> three to five; a minus in front of a number: -5 -> minus five
  s = s.replace(/(\d)\s?[-–]\s?(\d)/g, '$1 to $2');
  s = s.replace(/(^|[\s(])[-−](?=\d)/g, '$1minus ');
  // dollars and cents: 12.50 dollars -> twelve dollars fifty cents (before the generic decimal)
  s = s.replace(/\b(\d{1,3}(?:,\d{3})*|\d+)\.(\d\d)\s+dollars?\b/g, (m0, d, c) => {
    const dollars = +d.replace(/,/g, '');
    return numberToWords(dollars) + (dollars === 1 ? ' dollar' : ' dollars') + (+c ? ' ' + numberToWords(+c) + (+c === 1 ? ' cent' : ' cents') : '');
  });
  // every other number: with thousands commas, a decimal, plain; money in hundreds ("eleven hundred thirty three dollars")
  s = s.replace(/\b(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\b(\s+dollars?\b)?/g, (m0, whole, frac, dol) => {
    const digits = whole.replace(/,/g, '');
    if (digits.length > 15) return digitsWords(digits) + (frac ? ' point ' + digitsWords(frac) : '') + (dol || '');
    if (frac) return decimalWords(+digits, frac) + (dol || '');
    if (/^0\d/.test(digits)) return digitsWords(digits) + (dol || '');                 // 007, 0930: digit by digit
    return (dol ? spokenMoney(+digits) : numberToWords(+digits)) + (dol || '');
  });
  return s.replace(/\s+/g, ' ').trim();
}

// ------------------------------------------------------------------------------------------------ a conversational register
const CONTR = [
  [/\bcannot\b/gi, "can't"], [/\bcan not\b/gi, "can't"], [/\bwill not\b/gi, "won't"], [/\bshall not\b/gi, "shan't"],
  [/\b(do|does|did|is|are|was|were|has|have|had|should|would|could|must|need|ought) not\b/gi, (m0, v) => v + "n't"],
  [/\bI am\b/g, "I'm"], [/\bI will\b/g, "I'll"], [/\bI have\b/g, "I've"], [/\bI would\b/g, "I'd"],
  [/\b(you|we|they) are\b/gi, (m0, p) => p + "'re"], [/\b(you|we|they) will\b/gi, (m0, p) => p + "'ll"], [/\b(you|we|they) have\b/gi, (m0, p) => p + "'ve"],
  [/\b(he|she|it|that|there|here|what|who|where) is\b/gi, (m0, p) => p + "'s"], [/\blet us\b/gi, "let's"], [/\bit will\b/gi, "it'll"],
];
const PLAIN = [
  [/\bHowever,\s/g, 'But '], [/\bhowever,\s/g, 'but '], [/\bAdditionally,\s/g, 'Also, '], [/\bFurthermore,\s/g, 'Also, '], [/\bMoreover,\s/g, 'Also, '],
  [/\bTherefore,\s/g, 'So '], [/\btherefore,\s/g, 'so '], [/\bConsequently,\s/g, 'So '], [/\bIn order to\b/g, 'To'], [/\bin order to\b/g, 'to'],
  [/\bapproximately\b/gi, 'about'], [/\bsubsequently\b/gi, 'then'], [/\bprior to\b/gi, 'before'], [/\butilize\b/gi, 'use'], [/\bassist\b/gi, 'help'],
  [/\bUnable to\b/g, "Can't"], [/\bI apologize\b/g, "I'm sorry"], [/\bPlease note that\s/gi, ''], [/\bIt is important to note that\s/gi, ''],
  [/\bAs an AI,?\s/gi, ''], [/\bcurrently\b/gi, 'right now'],
];
// "it is." at the end of a sentence stays ("Yes, it is."): a contraction only before another word
export function conversational(input) {
  let s = String(input == null ? '' : input);
  for (const r of PLAIN) s = s.replace(r[0], r[1]);
  for (const r of CONTR) {
    s = s.replace(new RegExp(r[0].source + "(?=\\s+[A-Za-z0-9'])", r[0].flags), (m0, a) => {
      const out = typeof r[1] === 'function' ? r[1](m0, a) : r[1];
      return /^[A-Z]/.test(m0) && /^[a-z]/.test(out) ? out.charAt(0).toUpperCase() + out.slice(1) : out;
    });
  }
  return s.replace(/\s+/g, ' ').trim();
}

export function prepare(input, opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  let s = String(input == null ? '' : input);
  if (o.numbers !== false) s = expandTickers(expandNumbers(s));
  if (o.conversational !== false) s = conversational(s);
  return s.replace(/\s+/g, ' ').trim();
}

// ------------------------------------------------------------------------------------------------ phrases, pauses, rate / pitch
const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };
const words = (t) => (t.match(/\S+/g) || []).length;
const PAUSE = { s: 220, q: 280, x: 260, c: 80 };                       // ms after a statement / question / exclamation / comma break (phone voice)
const PITCH = { s: 0.985, q: 1.07, x: 1.05, c: 1.015 };
const RATE = { s: 1, q: 0.98, x: 1.04, c: 1.01 };
// a sentence cut at its commas into breaths of >= 4 words (only when it is long: 14+ words); anything over `max` chars cut at a space
function phrases(sentence, max, commas) {
  let parts = [sentence];
  if (commas !== false && words(sentence) >= 14) {
    const bits = sentence.split(/,\s+/), out = [];
    for (let i = 0; i < bits.length; i++) {
      const b = bits[i] + (i < bits.length - 1 ? ',' : '');
      if (out.length && (words(out[out.length - 1]) < 4 || words(b) < 4)) out[out.length - 1] += ' ' + b; else out.push(b);
    }
    parts = out;
  }
  const res = [];
  for (let p of parts) {
    while (p.length > max) {
      const cut = p.slice(0, max);
      let i = Math.max(cut.lastIndexOf(', '), cut.lastIndexOf('; '), cut.lastIndexOf(': '));
      if (i < max * 0.4) i = cut.lastIndexOf(' ');
      if (i < 10) i = max;
      res.push(p.slice(0, i + 1).trim());
      p = p.slice(i + 1).trim();
    }
    if (p) res.push(p);
  }
  return res;
}
export function plan(input, opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const max = Math.max(40, o.max || 180), text = String(input == null ? '' : input).trim();
  const sentences = text.match(/[\s\S]*?[.!?]+(?=\s|$)|[\s\S]+?$/g) || [];       // "1.2" stays whole
  const items = [];
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    const type = /\?["')\]]*$/.test(s) ? 'q' : /!["')\]]*$/.test(s) ? 'x' : 's';
    const ph = phrases(s, max, o.phrases);
    ph.forEach((p, i) => {
      const last = i === ph.length - 1, t = last ? type : 'c';
      const jr = (hash(p) - 0.5) * 0.024, jp = (hash(p + '~') - 0.5) * 0.02;       // steady, tiny: the same phrase always sounds the same
      items.push({ text: p, type: t, pause: PAUSE[t], rate: +(RATE[t] + jr).toFixed(3), pitch: +(PITCH[t] + jp).toFixed(3) });
    });
  }
  // very short pieces ride with the next one ("Okay." + "Done.") so the rhythm stays natural
  const out = [];
  for (const it of items) {
    const prev = out[out.length - 1];
    if (prev && prev.type !== 'q' && (words(prev.text) <= 2 || prev.text.length < 24) && prev.text.length + it.text.length + 1 <= max) { prev.text += ' ' + it.text; prev.type = it.type; prev.pause = it.pause; prev.rate = it.rate; prev.pitch = it.pitch; }
    else out.push(Object.assign({}, it));
  }
  return out;
}
// cloud voices: the model does its own breathing inside a part, so join phrases and sentences into parts of up to `max` chars
// (fewer requests: Groq's free plan allows 100 a day); the pause after a part is the last piece's
export function merge(items, max) {
  const lim = Math.max(40, max || 200), out = [];
  for (const it of Array.isArray(items) ? items : []) {
    const prev = out[out.length - 1];
    if (prev && prev.text.length + it.text.length + 1 <= lim) { prev.text += ' ' + it.text; prev.type = it.type; prev.pause = it.pause; prev.rate = it.rate; prev.pitch = it.pitch; }
    else out.push(Object.assign({}, it));
  }
  return out;
}
// the object tts.js takes as `prosody` (switches are read at each call, so the Voice sheet applies at once)
export function createProsody(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const sw = () => { try { return (typeof o.switches === 'function' ? o.switches() : o.switches) || {}; } catch (_) { return {}; } };
  return {
    prepare: (t) => { const s = sw(); return s.off ? String(t) : prepare(t, { numbers: s.numbers !== false, conversational: s.conversational !== false }); },
    plan: (t, popts) => plan(t, popts),
    merge: (items, max) => merge(items, max),
    enabled: () => !sw().off,
  };
}
// three sample lines for the Voice sheet: money and a percent, a time and tickers, a casual reply with a question
export const SAMPLES = [
  { id: 'money', label: 'Money', text: 'Your room today is $1,133, and the week is up 2.5%. That is a good start.' },
  { id: 'trade', label: 'Trade', text: 'NQ opens at 9:30 AM. I do not see a setup yet, but the 8R target is still live. Want me to watch it?' },
  { id: 'chat', label: 'Chat', text: "Hey, it's Jarvis. I checked your bots, and everything looks calm. Nothing needs you right now." },
];
