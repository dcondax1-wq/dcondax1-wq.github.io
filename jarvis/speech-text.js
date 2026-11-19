// Jarvis's spoken English (2026-11-18, owner: "Jarvis voice sucks, it sounds like a bot, it should sound like a person"; he picked
// Male, British). Pure text in, words out: no DOM, no network, no imports, so the AI voice (Kokoro, neural-voice.js) and the iPhone's
// own voice say exactly the same words. What a person does when reading Jarvis's answers out loud:
//   - money in British words: "$3,807" -> "three thousand eight hundred and seven dollars", "-$113" -> "minus a hundred and thirteen
//     dollars", "+$213" -> "up two hundred and thirteen dollars", "$12.50" -> "twelve dollars and fifty cents", "$2,000/mo" -> "two
//     thousand dollars a month"; account sizes "25K" -> "twenty-five K"
//   - prices the way a trader reads them (only in a trade sentence: stop / target / entry / long / short / NQ ...): "24,955" ->
//     "twenty-four nine fifty-five", "25,360.25" -> "twenty-five three sixty and a quarter"
//   - times and dates: "6:45 PM" -> "six forty-five PM", "10:00 AM" -> "ten AM", "18:00 ET" -> "six PM Eastern", "12:00 PM" -> "noon",
//     "Nov 18" -> "November the eighteenth", "2026" -> "twenty twenty-six"
//   - symbols and shorthand: "P&L" -> "P and L", "NQ" -> "N Q", "MFFU" -> "M F F U", "%" -> "percent", "8R" -> "eight R", "3-5" ->
//     "three to five", "w/" -> "with", "#2" -> "number two"; markdown, emoji, links and code are never read out
//   - how a person talks: contractions ("it is" -> "it's", "do not" -> "don't"), plain words ("however" -> "but"), short sentences
//     (a line break or a " · " list becomes its own sentence)
//
//   import { speechText, sentences, numberWords, moneyWords, priceWords, timeWords } from './speech-text.js';
//   speechText(text) -> the words to say        sentences(words, { first, max }) -> the pieces the AI voice makes one by one
//   (the first piece short so he starts talking within a second or two; the rest one sentence each, tiny ones joined)
// iPhone Safari 16: plain ES2020, no regex lookbehind, no nullish or optional chaining, no Array at().

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen',
  'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES = [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON_RX = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const DAYS = { mon: 'Monday', tue: 'Tuesday', tues: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', thur: 'Thursday', thurs: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

const below100 = (n) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : ''));
function below1000(n) {
  const h = Math.floor(n / 100), r = n % 100;
  if (!h) return below100(r);
  return ONES[h] + ' hundred' + (r ? ' and ' + below100(r) : '');
}
// British cardinal: 3807 -> "three thousand eight hundred and seven", 3050 -> "three thousand and fifty". { a: true } is how a person
// starts a number: "a hundred and thirteen", "a thousand and twenty-five", and the round hundreds 1,100-1,900 as "fifteen hundred".
export function numberWords(input, opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  let n = Math.trunc(+input);
  if (!Number.isFinite(n)) return String(input);
  if (n < 0) return 'minus ' + numberWords(-n, o);
  if (n >= 1e15) return String(n).split('').map((d) => ONES[+d]).join(' ');
  if (n === 0) return 'zero';
  if (o.a && n >= 1100 && n < 2000) return below100(Math.floor(n / 100)) + ' hundred' + (n % 100 ? ' and ' + below100(n % 100) : '');
  const out = [];
  let lead = true;
  for (const sc of SCALES) {
    if (n >= sc[0]) { out.push(below1000(Math.floor(n / sc[0])) + ' ' + sc[1]); n %= sc[0]; lead = false; }
  }
  if (n) out.push((!lead && n < 100 ? 'and ' : '') + below1000(n));
  let s = out.join(' ');
  if (o.a) s = s.replace(/^one (hundred|thousand|million|billion|trillion)\b/, 'a $1');
  return s;
}
const ORD_IRR = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' };
export function ordinalWords(n) {
  const w = numberWords(n), m = /^(.*?)([a-z]+)$/.exec(w);
  if (!m) return w;
  const last = m[2];
  const o = ORD_IRR[last] ? ORD_IRR[last] : /y$/.test(last) ? last.replace(/y$/, 'ieth') : last + 'th';
  return m[1] + o;
}
const digitWords = (s) => String(s).split('').filter((d) => /\d/.test(d)).map((d) => ONES[+d]).join(' ');
const pointWords = (whole, frac) => numberWords(whole) + ' point ' + digitWords(frac);
// 2026 -> "twenty twenty-six", 2005 -> "two thousand and five", 2000 -> "two thousand", 1999 -> "nineteen ninety-nine"
export function yearWords(y) {
  const v = Math.trunc(+y);
  if (v >= 2000 && v <= 2009) return v === 2000 ? 'two thousand' : 'two thousand and ' + ONES[v - 2000];
  const a = Math.floor(v / 100), b = v % 100;
  if (b === 0) return below100(a) + ' hundred';
  return below100(a) + ' ' + (b < 10 ? 'oh ' + ONES[b] : below100(b));
}
// money: 3807 -> "three thousand eight hundred and seven dollars", 12.5 -> "twelve dollars and fifty cents", 0.5 -> "fifty cents"
export function moneyWords(v, unit) {
  const u = unit === 'pound' ? ['pound', 'pounds', 'penny', 'pence'] : ['dollar', 'dollars', 'cent', 'cents'];
  const x = Math.abs(+v);
  if (!Number.isFinite(x)) return String(v);
  let d = Math.floor(x), c = Math.round((x - d) * 100);
  if (c === 100) { d += 1; c = 0; }
  const dw = d ? numberWords(d, { a: true }) + ' ' + (d === 1 ? u[0] : u[1]) : '';
  const cw = c ? numberWords(c) + ' ' + (c === 1 ? u[2] : u[3]) : '';
  return dw && cw ? dw + ' and ' + cw : dw || cw || 'zero ' + u[1];
}
// a futures price the way a trader says it: 24955 -> "twenty-four nine fifty-five", 25300 -> "twenty-five three hundred",
// 25045 -> "twenty-five oh forty-five", 6812.25 -> "sixty-eight twelve and a quarter"
export function priceWords(v) {
  const x = Math.abs(+v);
  if (!Number.isFinite(x)) return String(v);
  const whole = Math.floor(x + 1e-9), q = Math.round((x - whole) * 100);
  const frac = q === 0 ? '' : q === 25 ? ' and a quarter' : q === 50 ? ' and a half' : q === 75 ? ' and three quarters' : ' point ' + digitWords(String(Math.round((x - whole) * 100)).padStart(2, '0').replace(/0$/, ''));
  let w;
  if (whole >= 10000 && whole < 100000) {
    const hi = numberWords(Math.floor(whole / 1000)), lo = whole % 1000;
    if (lo === 0) w = hi + ' thousand';
    else if (lo < 10) w = hi + ' thousand and ' + ONES[lo];
    else if (lo < 100) w = hi + ' oh ' + below100(lo);
    else if (lo % 100 === 0) w = hi + ' ' + ONES[lo / 100] + ' hundred';
    else w = hi + ' ' + ONES[Math.floor(lo / 100)] + ' ' + (lo % 100 < 10 ? 'oh ' + ONES[lo % 100] : below100(lo % 100));
  } else if (whole >= 1100 && whole < 10000 && whole % 1000 !== 0) {
    const hi = Math.floor(whole / 100), lo = whole % 100;
    w = hi % 10 === 0 ? numberWords(whole) : below100(hi) + (lo === 0 ? ' hundred' : lo < 10 ? ' oh ' + ONES[lo] : ' ' + below100(lo));
  } else w = numberWords(whole);
  return w + frac;
}
// 6:45 PM -> "six forty-five PM", 10:00 AM -> "ten AM", 9:05 -> "nine oh five", 18:00 -> "six PM", 12:00 PM -> "noon", 0:00 -> "midnight"
export function timeWords(h, m, ap) {
  let hh = +h;
  const mm = +m || 0;
  let half = ap ? String(ap).toUpperCase().replace(/[^AP]/g, '') : '';
  if (!half && hh >= 13 && hh <= 23) { hh -= 12; half = 'P'; }
  else if (!half && hh === 0) { if (mm === 0) return 'midnight'; hh = 12; half = 'A'; }
  if (mm === 0 && hh === 12 && half === 'P') return 'noon';
  if (mm === 0 && hh === 12 && half === 'A') return 'midnight';
  let s = numberWords(hh);
  if (mm) s += ' ' + (mm < 10 ? 'oh ' + ONES[mm] : below100(mm));
  else if (!half) s += " o'clock";
  return half ? s + ' ' + half + 'M' : s;
}

// ------------------------------------------------------------------------------------------------ words said the way a trader says them
// whole words only, matched as written (so "es" or "it" in a sentence is untouched)
const SAY = {
  NQ: 'N Q', MNQ: 'M N Q', ES: 'E S', MES: 'M E S', YM: 'Y M', RTY: 'R T Y', CL: 'C L', GC: 'G C', VIX: 'the vix', VXN: 'V X N', GEX: 'gex',
  MFFU: 'M F F U', PF: 'profit factor', DD: 'drawdown', EOD: 'end of day', ATR: 'A T R', FVG: 'F V G', IFVG: 'I F V G', CISD: 'C I S D', RR: 'R R',
  ok: 'okay', Ok: 'Okay', PC: 'P C', NT: 'NinjaTrader', NT8: 'NinjaTrader eight', ET: 'Eastern', EST: 'Eastern', EDT: 'Eastern', UTC: 'U T C', AI: 'A I', API: 'A P I', OK: 'okay',
  USD: 'U S D', BTC: 'bitcoin', ETH: 'ether', ETF: 'E T F', IPO: 'I P O', CEO: 'C E O', PDF: 'P D F', ID: 'I D', LE: 'L E', TV: 'T V', NY: 'New York',
  US: 'U S', UK: 'U K', VPS: 'V P S', CME: 'C M E', FOMC: 'F O M C', CPI: 'C P I', NFP: 'N F P', GDP: 'G D P', RTH: 'R T H', ETH_: 'E T H',
  PNL: 'P and L', PnL: 'P and L', LIT: 'Lit', ATLAS: 'Atlas', ZEUS: 'Zeus', BLITZ: 'Blitz', OLYMPUS: 'Olympus', JARVIS: 'Jarvis', KALSHI: 'Kalshi',
  AGORA: 'Agora', ZENITH: 'Zenith', HELIOS: 'Helios', AEGIS: 'Aegis', CRONOS: 'Cronos', ARES: 'Ares', TP: 'take profit', SL: 'stop loss', BE: 'break even',
  MB: 'megabytes', GB: 'gigabytes', KB: 'kilobytes', WiFi: 'Wi-Fi', WIFI: 'Wi-Fi', iOS: 'i O S', IOS: 'i O S', URL: 'U R L', FAQ: 'F A Q', SMS: 'S M S',
};
const sayWord = (w) => (Object.prototype.hasOwnProperty.call(SAY, w) ? SAY[w] : w);

// ------------------------------------------------------------------------------------------------ a conversational register
const PLAIN = [
  [/\bHowever,\s/g, 'But '], [/\bhowever,\s/g, 'but '], [/\bAdditionally,\s/g, 'Also, '], [/\bFurthermore,\s/g, 'Also, '], [/\bMoreover,\s/g, 'Also, '],
  [/\bTherefore,\s/g, 'So '], [/\btherefore,\s/g, 'so '], [/\bConsequently,\s/g, 'So '], [/\bIn order to\b/g, 'To'], [/\bin order to\b/g, 'to'],
  [/\bapproximately\b/gi, 'about'], [/\bsubsequently\b/gi, 'then'], [/\bprior to\b/gi, 'before'], [/\butilize\b/gi, 'use'],
  [/\bUnable to\b/g, "Can't"], [/\bI apologize\b/g, "I'm sorry"], [/\bPlease note that\s/gi, ''], [/\bIt is important to note that\s/gi, ''], [/\bAs an AI,?\s/gi, ''],
];
const CONTR = [
  [/\bcannot\b/gi, "can't"], [/\bcan not\b/gi, "can't"], [/\bwill not\b/gi, "won't"],
  [/\b(do|does|did|is|are|was|were|has|have|had|should|would|could|must|need) not\b/gi, (m0, v) => v + "n't"],
  [/\bI am\b/g, "I'm"], [/\bI will\b/g, "I'll"], [/\bI have\b/g, "I've"], [/\bI would\b/g, "I'd"],
  [/\b(you|we|they) are\b/gi, (m0, p) => p + "'re"], [/\b(you|we|they) will\b/gi, (m0, p) => p + "'ll"], [/\b(you|we|they) have\b/gi, (m0, p) => p + "'ve"],
  [/\b(he|she|it|that|there|here|what|who|where) is\b/gi, (m0, p) => p + "'s"], [/\blet us\b/gi, "let's"], [/\bit will\b/gi, "it'll"],
];
// a contraction only before another word: "Yes, it is." stays whole at the end of a sentence
export function conversational(input) {
  let s = String(input == null ? '' : input);
  for (const r of PLAIN) s = s.replace(r[0], r[1]);
  for (const r of CONTR) {
    s = s.replace(new RegExp(r[0].source + "(?=\\s+[A-Za-z'])", r[0].flags), (m0, a) => {
      const out = typeof r[1] === 'function' ? r[1](m0, a) : r[1];
      return /^[A-Z]/.test(m0) && /^[a-z]/.test(out) ? out.charAt(0).toUpperCase() + out.slice(1) : out;
    });
  }
  return s;
}

// ------------------------------------------------------------------------------------------------ the normalizer
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{FE0F}\u{200D}\u{20E3}\u{2190}-\u{21FF}\u{25A0}-\u{25FF}]/gu;
const TRADE_RX = /\b(stops?|stopped|targets?|entry|entries|entered|filled|fills?|price|prices|level|levels|sweep|swept|highs?|lows?|long|short|bid|ask|support|resistance|N Q|M N Q|E S|M E S|NQ|MNQ|ES|MES|points?|opened at|closed at|take profit|stop loss|break even)\b/i;
const UNIT_AFTER = /^\s*(dollars?|cents?|percent|per cent|trades?|sessions?|days?|weeks?|months?|years?|hours?|minutes?|seconds?|times|contracts?|accounts?|people|R\b|K\b)/i;
const PER = { mo: 'a month', month: 'a month', wk: 'a week', week: 'a week', day: 'a day', d: 'a day', hr: 'an hour', h: 'an hour', yr: 'a year', year: 'a year', trade: 'a trade' };
const SCALE_WORD = { k: 1e3, K: 1e3, m: 1e6, M: 1e6, b: 1e9, B: 1e9, bn: 1e9, mn: 1e6 };
const num = (s) => +String(s).replace(/,/g, '');

// text with markdown, emoji, links, symbols -> plain sentences (still with digits)
function plainText(input) {
  let s = String(input == null ? '' : input);
  s = s.replace(/```[\s\S]*?```/g, ' ').replace(/`([^`]*)`/g, '$1');
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]+)\]\((?:https?:)?[^)]*\)/g, '$1');
  s = s.replace(/\bhttps?:\/\/\S+/gi, 'a link').replace(/\bwww\.\S+/gi, 'a link').replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, 'an email address');
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, '').replace(/^\s*>\s?/gm, '').replace(/^\s*(?:[-*+•▪◦]|\d{1,2}[.)])\s+/gm, '');
  s = s.replace(/\*\*|__|~~/g, '').replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,!?:;]|$)/g, '$1$2').replace(/\*/g, '');
  s = s.replace(/(\d)\s*(?:->|→|=>)\s*(?=[$+−-]?\d)/g, '$1 to ').replace(/\s*(?:->|→|=>)\s*/g, ', then ');
  s = s.replace(EMOJI, ' ').replace(/[\u2028\u2029]/g, '\n');
  // a line is a sentence; a list item " · " is a breath
  s = s.replace(/([.!?:;,])?[ \t]*\n+\s*/g, (m0, p) => (p === ':' || p === ';' || p === ',' ? '. ' : p ? p + ' ' : '. '));
  s = s.replace(/\s*[·•|]\s*/g, ', ');
  s = s.replace(/(\d)\s*[–—]\s*(?=[$+−-]?\d)/g, '$1 to ');
  s = s.replace(/\s+[–—]\s+|\s+-\s+/g, ', ').replace(/[–—]/g, ', ');
  s = s.replace(/\be\.g\.,?/gi, 'for example').replace(/\bi\.e\.,?/gi, 'that is').replace(/\betc\./gi, 'and so on').replace(/\bw\/o\b/gi, 'without').replace(/\bw\/(?=\s)/gi, 'with');
  s = s.replace(/\bvs\.?(?=\s)/gi, 'versus').replace(/\bapprox\.?(?=\s)/gi, 'about').replace(/(^|\s)(?:~|≈)\s?(?=[$+−-]?\d)/g, '$1about ').replace(/\ba\.k\.a\.?/gi, 'also known as');
  s = s.replace(/#(\d)/g, 'number $1').replace(/\bNo\.\s?(\d)/g, 'number $1');
  s = s.replace(/\bP\s?&\s?L\b/g, 'P and L').replace(/\s*&\s*/g, ' and ').replace(/(\S)@(\S)/g, '$1 at $2').replace(/@/g, ' at ');
  s = s.replace(/[()[\]{}]/g, ', ').replace(/["“”«»]/g, '').replace(/[‘’]/g, "'");
  return s;
}

// money, prices, times, dates, numbers -> words (text from plainText)
function numberText(input) {
  let s = input;
  // times: 6:45 PM, 9:30am, 18:00, 10:00 AM ET (before ranges and decimals see the colon)
  s = s.replace(/\b(\d{1,2}):([0-5]\d)(?::[0-5]\d)?(?:\s?(a\.?m\.?|p\.?m\.?|AM|PM|am|pm)(?![A-Za-z]))?(?![\d:])/g, (m0, h, mi, ap) => (+h <= 24 ? timeWords(h, mi, ap) : m0));
  s = s.replace(/\b(\d{1,2})\s?(a\.?m\.?|p\.?m\.?|AM|PM|am|pm)(?![A-Za-z])/g, (m0, h, ap) => (+h >= 1 && +h <= 12 ? timeWords(h, 0, ap) : m0));
  s = s.replace(/\b([AP])\.M\.?(?=\s|$|[,.!?])/g, '$1M');
  // dates: 2026-11-18, Nov 18, 18 Nov, the weekday in front of a date
  s = s.replace(/\b((?:19|20)\d\d)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/g, (m0, y, mo, d) => MONTHS[+mo - 1] + ' the ' + ordinalWords(+d) + ', ' + yearWords(y));
  s = s.replace(new RegExp('\\b(' + MON_RX + ')\\.?\\s(\\d{1,2})(?:st|nd|rd|th)?\\b(?!:\\d|\\d|,\\d)', 'gi'), (m0, mo, d) => (+d >= 1 && +d <= 31 ? monthName(mo) + ' the ' + ordinalWords(+d) : m0));
  s = s.replace(new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s(' + MON_RX + ')\\b\\.?', 'gi'), (m0, d, mo) => (+d >= 1 && +d <= 31 ? 'the ' + ordinalWords(+d) + ' of ' + monthName(mo) : m0));
  s = s.replace(/\b(Mon|Tue|Tues|Wed|Thu|Thur|Thurs|Fri|Sat|Sun)\b\.?(?=,?\s+(?:the\s+)?(?:[A-Z][a-z]+\s+the\s|\d|January|February|March|April|May|June|July|August|September|October|November|December))/g, (m0, d) => DAYS[d.toLowerCase()]);
  s = s.replace(new RegExp('\\b(' + MON_RX + ')\\.?\\s((?:19|20)\\d\\d)\\b', 'gi'), (m0, mo, y) => monthName(mo) + ' ' + yearWords(y));
  s = s.replace(/\b((?:19|20)\d\d)\s?[-–]\s?((?:19|20)?\d\d)\b(?!\s*(?:dollars?|points?))/g, (m0, a, b) => yearWords(a) + ' to ' + yearWords(b.length === 2 ? a.slice(0, 2) + b : b));
  // ordinals: 1st, 22nd
  s = s.replace(/\b(\d+)(st|nd|rd|th)\b/gi, (m0, n) => ordinalWords(n));
  // money: -$113, +$213, $3,807, $1.2k, $12.50, $2,000/mo, £5
  s = s.replace(/(^|[^\w$£])([+−-]?)(\s?)([$£])\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s?(bn|mn|[kKmMbB])\b)?(\s*\/\s*(?:mo|month|wk|week|day|d|hr|h|yr|year|trade)\b)?/g, (m0, pre, sg, gap, cur, n, sc, per, at, all) => {
    let v = num(n) * (sc ? SCALE_WORD[sc] : 1);
    const before = all.slice(Math.max(0, at - 16), at + pre.length);
    const verb = /\b(made|make|earned|won|gained|lost|lose|of|is|was|at|be|been|to|by)\s*$/i.test(before);
    let lead = '';
    if (sg === '-' || sg === '−') lead = verb && /\b(lost|lose)\s*$/i.test(before) ? '' : 'minus ';
    else if (sg === '+') lead = verb ? '' : 'up ';
    const words = sc && !Number.isInteger(v) && v >= 1e6 ? pointWords(Math.trunc(num(n)), String(n).split('.')[1] || '') + ' ' + scaleName(sc) + ' ' + (cur === '£' ? 'pounds' : 'dollars')
      : moneyWords(v, cur === '£' ? 'pound' : 'dollar');
    v = 0;
    const p = per ? ' ' + (PER[per.replace(/[\s/]/g, '').toLowerCase()] || 'per ' + per.replace(/[\s/]/g, '')) : '';
    return pre + (sg ? '' : gap) + lead + words + p;
  });
  s = s.replace(/\$\s*\/\s*/g, ' dollars per ');
  s = s.replace(/\b(\d+)\.5\s+(hours?|minutes?|days?|weeks?|months?|years?)\b/g, (m0, n, u) => numberWords(n) + ' and a half ' + (/s$/.test(u) ? u : u + 's'));
  // money already in words with digits (zeus.js says "3,807 dollars", "minus 113 dollars")
  s = s.replace(/\b(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s+(dollars?|pounds?)\b/g, (m0, d, c, u) => moneyWords(num(d) + (c ? +('0.' + c) : 0), /^pound/.test(u) ? 'pound' : 'dollar'));
  s = s.replace(/\b(dollars?|pounds?)\s*\/\s*(mo|month|wk|week|day|d|hr|h|yr|year|trade)\b/gi, (m0, u, p) => u + ' ' + (PER[p.toLowerCase()] || 'per ' + p));
  // account sizes: 25K, 50K, the 150k account -> "twenty-five K"
  s = s.replace(/\b(\d{1,3})\s?[kK]\b(?!\s*(?:dollars?|pounds?))/g, (m0, n) => numberWords(n, { a: true }) + ' K');
  s = s.replace(/\b(\d+(?:\.\d+)?)(M|bn)\b/g, (m0, n, u) => (/\./.test(n) ? pointWords(Math.trunc(num(n)), n.split('.')[1]) : numberWords(n, { a: true })) + (u === 'M' ? ' million' : ' billion'));
  // percent, multiples of risk, times, per, units
  s = s.replace(/(\d)\s?%/g, '$1 percent').replace(/(\d)\s?°\s?F\b/g, '$1 degrees').replace(/(\d)\s?°\s?C\b/g, '$1 degrees');
  s = s.replace(/\b(\d+(?:\.\d+)?)\s?R\b/g, '$1 R').replace(/\b(\d+(?:\.\d+)?)\s?x\b(?=\s|$|[.,!?])/g, '$1 times');
  s = s.replace(/\b(\d+)\s?(?:min|mins|minutes?)\b/g, (m0, n) => numberWords(n, { a: true }) + (+n === 1 ? ' minute' : ' minutes'));
  s = s.replace(/\b(\d+)\s?(?:m)\b(?![A-Za-z])/g, (m0, n) => numberWords(n) + (+n === 1 ? ' minute' : ' minutes'));
  s = s.replace(/\b(\d+(?:\.\d+)?)\s?(?:h|hr|hrs)\b(?![A-Za-z])/g, (m0, n) => (/\./.test(n) ? pointWords(Math.trunc(num(n)), n.split('.')[1]) : numberWords(n)) + (+n === 1 ? ' hour' : ' hours'));
  s = s.replace(/\b(\d+)\s?(?:s|sec|secs)\b(?![A-Za-z])/g, (m0, n) => numberWords(n) + (+n === 1 ? ' second' : ' seconds'));
  s = s.replace(/\b(\d+)\s?ms\b/g, (m0, n) => numberWords(n) + ' milliseconds').replace(/\b(\d+)\s?d\b(?![A-Za-z'])/g, (m0, n) => numberWords(n) + (+n === 1 ? ' day' : ' days'));
  s = s.replace(/\b(trades?|sessions?|days?|percent)\s*\/\s*(wk|week|day|month|mo)\b/gi, (m0, w, p) => w + ' ' + (PER[p.toLowerCase()] || 'per ' + p));
  s = s.replace(/(\d)\s?\/\s?(\d)/g, (m0, a, b) => a + ' out of ' + b).replace(/\s*\/\s*/g, ' or ');
  s = s.replace(/(\d)\s?\+\s?(\d)/g, '$1 plus $2').replace(/(\d)\s?=\s?(\d)/g, '$1 equals $2').replace(/(\d)\+(?!\d)/g, '$1 or more');
  // ranges and signs: 3-5 -> "three to five", -5 -> "minus five", +3 -> "plus three"
  s = s.replace(/(\d)\s?[-–]\s?(\d)/g, '$1 to $2');
  s = s.replace(/(^|[\s,(])[-−](?=\d)/g, '$1minus ').replace(/(^|[\s,(])\+(?=\d)/g, '$1plus ');
  // years after a month or in / since / by
  s = s.replace(/\b(in|since|until|by|during|of|from|year)\s((?:19|20)\d\d)\b(?![,.]?\d)/gi, (m0, w, y) => w + ' ' + yearWords(y));
  // the rest, sentence by sentence (a trade sentence reads prices like a trader)
  return s.replace(/(?:[^.!?]|[.](?=\d))+[.!?]*/g, (sent) => {
    const trade = TRADE_RX.test(sent);
    return sent.replace(/(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?/g, (m0, whole, frac, at, all) => {
      const v = num(whole), after = all.slice(at + m0.length);
      if (whole.replace(/,/g, '').length > 15) return digitWords(whole) + (frac ? ' point ' + digitWords(frac) : '');
      if (/^0\d/.test(whole)) return digitWords(whole) + (frac ? ' point ' + digitWords(frac) : '');
      if (trade && v >= 1000 && !UNIT_AFTER.test(after)) return priceWords(v + (frac ? +('0.' + frac) : 0));
      if (!frac && v >= 1900 && v <= 2099 && whole.indexOf(',') < 0 && !UNIT_AFTER.test(after)) return yearWords(v);
      if (frac) return pointWords(v, frac);
      return numberWords(v, { a: true });
    });
  });
}
const monthName = (m) => { const k = String(m).slice(0, 3).toLowerCase(); const i = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(k); return i >= 0 ? MONTHS[i] : m; };
const scaleName = (u) => ({ k: 'thousand', K: 'thousand', m: 'million', M: 'million', mn: 'million', b: 'billion', B: 'billion', bn: 'billion' }[u] || '');

// the words in shorthand Jarvis writes: tickers, his apps' names in capitals, "STOP BOT"
const CAP3 = /^(BOT|OFF|RED|NEW|BUY|ALL|ARM|YES|NOT|AND|THE|FOR|ONE|TWO|TOP|LOW|OUT|NOW|DAY|WIN|END|AGO|BIG|HOT|RUN|SET|GET|ADD|BAD|DID|HAS|WAS|ARE|YOU|OUR|NOR|ANY|OWN|PUT|SAY|SEE|USE|WAY|WHO|WHY|HOW|TAP)$/;
function wordText(input) {
  const s = input.replace(/\b[A-Za-z][A-Za-z0-9]{0,6}\b/g, (w) => sayWord(w));
  // a word in capitals that is not shorthand is said as a word ("GREEN", "STOP BOT", "LE START" -> "L E Start")
  return s.replace(/\b[A-Z]{3,}\b/g, (w) => (w.length >= 4 && /[AEIOUY]/.test(w)) || CAP3.test(w) ? cap(w) : w);
}
const cap = (w) => w.charAt(0) + w.slice(1).toLowerCase();

// the final tidy: no symbol left to be read out, one space, a full stop at the end
function tidy(input) {
  let s = input.replace(/[_^<>{}\\*~`|#$£€=]/g, ' ').replace(/(\S)\+(\S)/g, '$1 plus $2').replace(/\+/g, ' ');
  s = s.replace(/…|\.\.\./g, '. ').replace(/\s*;\s*/g, ', ').replace(/\s*:\s+/g, ': ').replace(/\s*,\s*(,\s*)+/g, ', ');
  s = s.replace(/\s+([,.!?:])/g, '$1').replace(/([,.!?])(?=[A-Za-z])/g, '$1 ').replace(/,\s*([.!?])/g, '$1').replace(/([.!?])\s*[.,]+/g, '$1');
  s = s.replace(/:\s*([.!?])/g, '$1').replace(/^[,.:\s]+/, '').replace(/\s+/g, ' ').trim();
  s = s.replace(/(^|[.!?]\s+)([a-z])/g, (m0, p, c) => p + c.toUpperCase());
  s = s.replace(/[,:\s]+$/, '');
  if (s && !/[.!?]$/.test(s)) s += '.';
  return s;
}

// a list line ("Zlarior 50K: $49,193, $3,807 to pass, $1,025 room") said as a sentence a person would say: a label's colon becomes
// "is at" only for money right after a name; any other colon is a breath
function phrasing(input) {
  return input.replace(/\b([A-Z][\w'#]*(?:\s[A-Z0-9][\w'#]*){0,3}):\s(?=(?:minus |up )?[a-z-]+ (?:thousand|hundred|dollars))/g, '$1 is at ').replace(/:\s/g, ', ');
}

// what Jarvis says, from what Jarvis shows. opts.conversational false keeps the words as written (no contractions).
export function speechText(input, opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  let s = plainText(input);
  s = wordText(s);
  s = numberText(s);
  s = phrasing(s);
  if (o.conversational !== false) s = conversational(s);
  s = s.replace(/\d+/g, (d) => numberWords(d));                    // nothing left as digits
  return tidy(s);
}

// ------------------------------------------------------------------------------------------------ the pieces the AI voice makes one by one
// sentences(words, { first: 60, max: 220 }) -> ['First short piece,', 'the rest of the sentence.', 'Next sentence.']
// The first piece is the first sentence, or its first clause when the sentence is longer than `first` (cut at a comma: a pause a person
// makes anyway), so he starts quickly; then one sentence each, a sentence over `max` cut at a comma, pieces under 24 characters joined
// to the next (never past `max`).
export function sentences(input, opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const first = Math.max(30, +o.first || 90), max = Math.max(first, +o.max || 220);
  const text = String(input == null ? '' : input).replace(/\s+/g, ' ').trim();
  if (!text) return [];
  const raw = text.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g) || [text];
  const cut = (s, lim) => {
    const out = [];
    let rest = s.trim();
    while (rest.length > lim) {
      const head = rest.slice(0, lim);
      let i = Math.max(head.lastIndexOf(', '), head.lastIndexOf('; '), head.lastIndexOf(': '));
      if (i < 16) i = head.lastIndexOf(' ');
      if (i < 16) i = lim;
      out.push(rest.slice(0, i + 1).trim());
      rest = rest.slice(i + 1).trim();
    }
    if (rest) out.push(rest);
    return out;
  };
  let parts = [];
  for (const r of raw) { const t = r.trim(); if (t) parts = parts.concat(cut(t, max)); }
  const merged = [];
  for (const p of parts) {
    const prev = merged[merged.length - 1];
    if (prev && merged.length > 1 && prev.length < 24 && prev.length + p.length + 1 <= max) merged[merged.length - 1] = prev + ' ' + p;
    else if (prev && merged.length === 1 && prev.length < 12 && prev.length + p.length + 1 <= first) merged[0] = prev + ' ' + p;
    else merged.push(p);
  }
  if (merged.length && merged[0].length > first) {                 // the first piece: its first clause (cut at a comma, never mid-phrase), so the voice starts fast
    const s0 = merged[0], head = s0.slice(0, first);
    let i = Math.max(head.lastIndexOf(', '), head.lastIndexOf('; '));
    if (i < 12) { const m = /[,;] /.exec(s0.slice(first)); i = m && first + m.index <= 120 ? first + m.index : -1; }
    if (i >= 12 && i < s0.length - 10) merged.splice(0, 1, s0.slice(0, i + 1).trim(), s0.slice(i + 1).trim());
  }
  return merged.filter(Boolean);
}

// the shape tts.js takes as `prosody` (its speak() calls prepare on the raw text when `raw` is set): the words, and the pieces
export function createSpeechText() {
  return {
    raw: true,
    prepare: (t) => speechText(t),
    plan: (t, popts) => sentences(t, { first: 400, max: (popts && popts.max) || 180 }).map((x) => ({ text: x, type: /\?$/.test(x) ? 'q' : 's', pause: /\?$/.test(x) ? 260 : 200 })),
    merge: (items) => items,
    enabled: () => true,
  };
}
export default speechText;
