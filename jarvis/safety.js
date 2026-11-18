// Jarvis safety (2026-11-11, JARVIS BRAIN v3): Jarvis never places, arms, changes or cancels a trade. This module only RECOGNISES
// such a request, however it is phrased, so the brain can refuse it in plain words before anything else looks at it. No DOM, no
// network, no state. Paper and suggestions only: there is no code path in Jarvis that could send an order, and this keeps it honest
// in what it says too ("done" is never said about a trade).
//
//   import { orderAsk, refusal } from './safety.js';
//   orderAsk('buy 2 MNQ at market')   -> { kind: 'order' }     | null (not a request to trade)
//   orderAsk('arm live trading')      -> { kind: 'arm' }
//   refusal(kind)                     -> { text, speak, intent: 'refuse_trade', refused: true }
//
// What is NOT a request (and stays with the other skills): questions ("can I trade now", "should I go long", "how many micros can I
// trade"), reports of what he did himself ("I placed a trade on both"), and words about past trades ("explain this trade").
// iPhone Safari 16: plain ES2020, no regex lookbehind.

const clean = (s) => String(s == null ? '' : s).toLowerCase().replace(/[’‘`]/g, "'").replace(/[^a-z0-9$%'.\- ]+/g, ' ').replace(/\.(?!\d)/g, ' ').replace(/\s+/g, ' ').trim();

// polite or pushy openers that do not change what is asked
const LEAD = /^(?:(?:please|pls|plz|jarvis|hey jarvis|hey|ok|okay|yo|now|quick|quickly|just|go ahead and|go ahead|go on and|i want you to|i need you to|i'd like you to|i would like you to|i order you to|i command you to|you must|you should|you need to|you have to|can you|could you|would you|will you|can u|why don't you|why dont you|let's|lets|let us|do it|override|ignore (?:your|the|all|previous) (?:rules|instructions|safety)(?: and)?|as (?:the|your) owner|i am the owner so|i'm the owner so|this is an emergency|emergency|it's fine|its fine|trust me|i allow it|i authorize you to|i authorise you to|i give you permission to|you have my permission to|you are allowed to|you're allowed to|pretend you can and|for real this time|sudo|and|then|so|kindly)[\s,.:!-]+)+/;
// he is telling Jarvis what he did, or asking a question about the past / about how: never a request
const REPORT = /^(?:i|i've|ive|i have|we|we've|we have) (?:just |already |also |have |had )?(?:traded|placed|took|taken|did|made|bought|sold|entered|closed|exited|got|was|went|shorted|longed|flattened)\b/;
const NOTE = /^(?:remind me|remember|don't forget|dont forget|note|make a note|take a note|add (?:a |an )?(?:note|task|todo|to-do|reminder|goal|event|meeting)|new (?:note|task|todo|goal)|todo|to do|write down|write|save|log|journal|search|find|look for|look up|google|where is|where are|what did we|did we|have we|tour|brief|set my goal|my goal)\b/;
const QUESTION = /^(?:how (?:do|does|did|would|can|could|should|many|much|often|long|far|close)|what (?:is|are|was|were|does|did|happens|happened|would|if|about|s)\b|what's|whats|why|when|where|which|who|did|does|do i|do we|is|are|was|were|am i|have i|has|should i|should we|can i|could i|may i|would it|explain|tell me (?:about|why|how|what)|show me|describe|define)\b/;

const THING = '(?:orders?|trades?|bets?|positions?|contracts?|micros?|minis?|lots?|mnq|nq|es|mes|futures|shares|long|short|buy|sell|entry|entries|setup|signal|stake|wager)';
const ADJ = '(?:real|live|market|limit|stop|bracket|oco|paper|new|quick|small|big|full|test|tiny|half-size|full-size)';
const AFTER = '\\b(?! (?:plan|plans|review|reviews|journal|replay|log|history|idea|ideas|checklist|pictures?|intel|tape|recap|summary|report|stats|count|rules?|quiz|notes?|size calculator|calculator|calendar|alerts?))';
const QTY = '(?:\\$?\\d+(?:\\.\\d+)?|a|an|one|two|three|four|five|six|ten|some|another|more|the|my|this|that|it|me|us|all|everything|half|both)';
const RULES = [
  // going live / arming / taking the safety off
  { kind: 'arm', rx: /\b(?:go|going|switch(?:ing)?|flip(?:ping)?|take it|put it|move|change|set it|make it) (?:to |it |us |the bot |the bots |this |everything )*(?:live(?! (?:feed|view|data|chart|charts|page|dashboard|stream|numbers|prices|learning|bars|tab|screen|loop|site))|real money|real-money|real account|production)\b/ },
  { kind: 'arm', rx: /\b(?:arm|unlock|enable|activate|turn on|switch on|start|engage|authorize|authorise|allow|unpause|resume|restart|re-arm|rearm) (?:the |my |our |all |all the |both |live |real |real-money |real money |auto ?|automatic |automated )*(?:live|bots?|trading|orders?|order routing|routing|auto ?trad(?:e|ing)|autotrad(?:e|ing)|execution|strategy|zlarior|atlas|blitz|lit|kalshi bot|ninjatrader|the account|accounts?)\b/ },
  { kind: 'arm', rx: /\b(?:disarm|pause|stop|halt|kill|disable|shut down|shut off|turn off|switch off) (?:the |my |our |all |all the |both )*(?:bots?|trading|orders?|auto ?trad(?:e|ing)|zlarior|atlas|blitz|lit|kalshi bot|strategy|algo)\b/ },
  { kind: 'arm', rx: /\b(?:turn off|switch off|disable|leave|exit|get out of|take (?:it|us|the bot) off|remove|drop|skip|bypass) (?:the |my )?(?:paper|sim|simulation|sim101|demo|practice|safe|safety)(?: mode| trading| account| lock| check| checks)?\b/ },
  { kind: 'arm', rx: /\b(?:route|send|point|connect|wire|hook) (?:it |this |that |the |my |all |the bot |the bots |orders? |trades? |signals? |everything )*(?:to|into|up to|at) (?:my |the )?(?:live|real|funded|eval|mffu|broker|ninjatrader live|real-money)\b/ },
  { kind: 'arm', rx: /\b(?:arm|go) (?:it|them|him|her|everything|now|live)\b|\barm live\b|\bkill ?switch\b|\bpanic (?:button|close|sell)\b/ },
  // placing an order, however it is worded
  { kind: 'order', rx: new RegExp('\\b(?:place|placing|submit|send|execute|fire|fire off|put in|put on|put through|enter|initiate|trigger|queue|stage|prepare and send|leg into) (?:' + QTY + ' )*(?:' + ADJ + ' )*' + THING + AFTER) },
  { kind: 'order', rx: new RegExp('\\b(?:open|make|take|grab|do|get|start|work|set up|schedule) (?:me |us )?(?:\\$?\\d+(?:\\.\\d+)?|a|an|one|two|three|four|five|six|ten|some|another) (?:' + ADJ + ' )*' + THING + AFTER) },
  { kind: 'order', rx: new RegExp('\\b(?:buy|sell|short|long|shorting|buying|selling|scalp|fade) (?:' + QTY + ' )*(?:more |extra )?(?:' + THING + '|at market|market|now|here|the dip|the rip|the open|the close|it|this|that|yes|no)\\b') },
  { kind: 'order', rx: /^(?:buy|sell|go long|go short|get long|get short|market buy|market sell|hit the bid|lift the offer|ape in|send it|full send|yolo)\b|^(?:short|long)(?:$| (?:it|this|that|now|here|nq|mnq|es|mes|the |a |an |one|two|three|some|at |\$?\d))/ },
  { kind: 'order', rx: /\b(?:go|get|be|stay) (?:me |us )?(?:long|short)\b|\b(?:get|put|take) (?:me|us) (?:in|into|long|short|a position|a trade)\b|\b(?:market|limit|stop|bracket) (?:buy|sell|order)\b/ },
  { kind: 'order', rx: /\b(?:bet|stake|wager|put|risk|throw|drop) \$?\d+(?:\.\d+)?(?: dollars| bucks| usd|k)? (?:on|into|in|at)\b|\b(?:buy|sell|take) (?:the )?(?:yes|no)\b|\b(?:place|make|put) (?:a |the |that |this |my )?(?:kalshi |real |live )?(?:bet|wager)\b/ },
  { kind: 'order', rx: /\b(?:take|trade|enter|hit|follow|copy|execute|pull the trigger on|jump (?:in|into|on)|ride) (?:the |this |that |sibyl'?s? |its |his |her |today'?s? |next |the next )?(?:setup|signal|pick|edge|trade for me|suggestion|recommendation|idea|entry)\b|\btake (?:the|this|that|it) (?:trade|long|short|position|bet)\b|\bpull the trigger\b|\btrade (?:it|this|that) for me\b|\btrade for me\b/ },
  // changing or closing what is open
  { kind: 'manage', rx: /\b(?:flatten|liquidate|close out|close|exit|dump|unwind|cover|cash out|square)(?: of| out of)? (?:me|us|it|them|all|everything|out|the |my |our |this |that |both |every |all (?:my |the )?)?(?:position|positions|trade|trades|order|orders|contract|contracts|long|longs|short|shorts|everything|all|book|account|bet|bets)?\b/, need: /\b(?:flatten|liquidate|close out|unwind|cash out)\b|\b(?:dump|cover|square) (?:it|them|all|everything|(?:the |my |our |this |that |both |every |all (?:my |the )?)?(?:position|positions|trade|trades|contract|contracts|long|longs|short|shorts|book|bet|bets))\b|\b(?:close|exit) (?:all|everything|(?:the |my |our |this |that |both |every |all (?:my |the )?)?(?:position|positions|trade|trades|order|orders|contract|contracts|long|longs|short|shorts|book|bet|bets))\b/ },
  { kind: 'manage', rx: /\b(?:move|moving|change|adjust|raise|lower|widen|tighten|trail|pull|remove|cancel|delete|modify|edit|update|replace|drag|slide|bump) (?:the |my |our |that |this |all |all the |all my |every )?(?:working |open |resting |pending |live )?(?:stop loss|stop-loss|stop|stops|target|targets|take profit|tp|sl|orders?|limit|limits|bracket|brackets|size|position size|position|contracts)\b/ },
  { kind: 'manage', rx: /\b(?:add|scale|double|triple|pyramid|average|size|load|press) (?:to |in |into |up |down |on |the )*(?:my |the |this |that |our )?(?:position|trade|size|winner|loser|long|short|contracts|micros|exposure|risk|stake|bet)\b|\b(?:scale|average) (?:in|out|down|up)\b|\bdouble down\b|\bgo all in\b|\b(?:get|take|pull) (?:me|us) out\b/ },
];

/** is this a request to place / arm / change a trade? -> { kind: 'order' | 'arm' | 'manage' } or null */
export function orderAsk(raw) {
  let q = clean(raw);
  if (!q || q.length > 400) return null;
  if (REPORT.test(q) || NOTE.test(q)) return null;            // "I placed a trade on both": he did it himself; "remind me to ...", "find ...": a note or a search
  let prev = null;
  while (prev !== q) { prev = q; q = q.replace(LEAD, '').trim(); }          // "please jarvis just ..." -> "..."
  if (!q) return null;
  if (REPORT.test(q) || NOTE.test(q)) return null;
  const led = prev !== clean(raw) || q !== clean(raw);
  if (QUESTION.test(q) && !/\b(?:for me|for us|right now for|on my behalf)\b/.test(q)) {
    // a question about trading is not an order ... unless it is "can you buy ..." (the LEAD stripped "can you", so it is not here)
    return null;
  }
  for (const r of RULES) {
    if (!r.rx.test(q)) continue;
    if (r.need && !r.need.test(q)) continue;
    if (r.kind === 'order' && NOT_ORDER.test(q)) continue;
    if (r.kind === 'manage' && NOT_MANAGE.test(q)) continue;
    if (r.kind === 'arm' && NOT_ARM.test(q)) continue;
    return { kind: r.kind, led };
  }
  return null;
}
// everyday phrases that share a verb with an order but are something else
const NOT_ORDER = /^(?:open|show|start|launch|go to|take me to|see|view|load) (?:the |my )?(?:positions?|trades?|orders?|bets?|entries|setup|kalshi|odeon|journal|ledger|planner|quiz|tour|trade (?:journal|replay|tape|pictures|intel)|open (?:bets|positions))\b|^(?:take|do|start|open|make|get) (?:the |a |my )?(?:quiz|tour|note|notes|goal|task|backup|briefing|break|look|screenshot|picture)\b|\b(?:journal|planner|note|goal|task|reminder|event|meeting|quiz|memory|remember)\b.*\b(?:entry|entries)\b|^(?:add|new|set|create|write|log|rate|review|explain|remember)\b/;
const NOT_MANAGE = /\b(?:text|font|fonts|screen|tiles?|icons?|brightness|app|page|tab|window|menu|tour|quiz|planner|journal|note|notes|task|tasks|goal|goals|reminder|reminders|memory|memories|event|meeting|appointment|alarm|timer|settings|theme|voice|volume|sound|music|briefing|search)\b|^(?:close|exit)$|^(?:add|remove|delete|cancel|change|update|edit) (?:a |an |the |my |that |this )?(?:note|task|goal|reminder|event|meeting|memory|fact|appointment|alarm|timer)\b/;
const NOT_ARM = /\b(?:alerts?|sounds?|feed|feeds|dashboard|page|view|theme|lights?|journal|planner|calendar|clock|replay|quiz|tour|voice|mic|microphone|listening|talking|speaking|music|sound|reading|timer|alarm|briefing|smart mode|the tour|hands.?free|notifications?|reminders?)\b|^(?:stop|pause|start|resume)$/;

const SAY = {
  order: "I can't place orders: paper and suggestions only. I never buy, sell or enter a trade on any account, and nothing I say sends one.",
  arm: "I can't arm, start, stop or switch anything to live: paper and suggestions only. Going live is yours alone, on the PC in NinjaTrader, with you present (MFFU's rule).",
  manage: "I can't move a stop, change the size, close or cancel anything: paper and suggestions only. Open trades are managed by the bot's own rules and by you in NinjaTrader.",
};
const HELP = 'What I can do: tell you if the entry window is open ("can I trade now"), your drawdown left, the plan for today ("brief me"), and what the rules say.';
/** the plain-words refusal for a kind */
export function refusal(kind) {
  const first = SAY[kind] || SAY.order;
  return { text: first + '\n' + HELP, speak: first, intent: 'refuse_trade', refused: true, kind: kind || 'order' };
}
/** one call: the refusal reply, or null when the text is not a trade request */
export function guard(raw) { const a = orderAsk(raw); return a ? refusal(a.kind) : null; }
export default guard;
