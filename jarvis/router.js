// Jarvis router (2026-11-10, JARVIS BRAIN): the offline, rule-based intent router. One ES module, no imports, no DOM, no network.
// Words in, an intent out: synonyms, small typos (edit distance) and word order do not matter. No model, no guessing:
// a phrase that matches nothing well returns null and the brain falls through to its older rules and to the user's own model.
//
//   import { route, norm, tokens, fuzzyEq, INTENTS } from './router.js';
//   route('how much drawdown do I have left')  -> { intent: 'drawdown_left', score: 1, args: {} } | null
//   route('show me athens')                    -> { intent: 'navigate', args: { target: 'athens' } }
//   INTENTS                                    [{ id, group, write?, ... }]: the list the tests and docs/JARVIS_API.md use
//
// How a phrase is scored: an intent lists GROUPS of interchangeable words (a stem, a synonym, a two-word phrase). It needs
// `need` of them (default: all groups) to be present. A word is present when it equals a token, is a prefix of a token
// (stems, length >= 4), is within one typo (word >= 5 letters) or two (>= 9 letters), or when a phrase is found in the text.
// `not` words veto the intent. The best score wins; a tie goes to the intent listed first.
// iPhone Safari 16: plain ES2020, no regex lookbehind.

export const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[’‘`]/g, "'").replace(/&/g, ' and ').replace(/[^a-z0-9$%'+.\- ]+/g, ' ').replace(/(^|\s)[.\-]+(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
const FILLER = new Set(['the', 'a', 'an', 'my', 'me', 'i', 'to', 'of', 'is', 'are', 'it', 'do', 'does', 'did', 'please', 'pls', 'jarvis', 'hey', 'ok', 'okay', 'can', 'could', 'you', 'would', 'will', 'just', 'now', 'right', 'tell', 'us', 'we', 'for', 'be', 'on', 'in', 'at', 'have', 'has', 'got', 'get']);
export const tokens = (s) => norm(s).replace(/'s\b/g, '').replace(/'/g, '').split(' ').filter(Boolean);
export const content = (s) => tokens(s).filter((t) => !FILLER.has(t));

/** the edit distance between two words, with an early exit above `max` */
export function lev(a, b, max) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > max) return max + 1;
  let prev = new Array(n + 1), cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i; let rowMin = cur[0];
    for (let j = 1; j <= n; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev[j - 2] + 1);   // a swapped pair counts once
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    const t = prev; prev = cur; cur = t;
  }
  return prev[n];
}
/** does the word `w` (from a rule) match the token `t` (from the person)? */
export function fuzzyEq(w, t) {
  if (w === t) return true;
  if (/\d|[$%]/.test(w)) return false;
  if (w.length >= 4 && t.length >= 4 && (t.startsWith(w) || (w.length >= 5 && w.startsWith(t) && t.length >= 5))) return true;
  const max = w.length >= 9 ? 2 : w.length >= 5 ? 1 : 0;
  return max > 0 && lev(w, t, max) <= max;
}
const has = (word, text, toks) => {
  if (word.indexOf(' ') >= 0) return (' ' + text + ' ').indexOf(' ' + word + ' ') >= 0 || (word.split(' ').every((w) => toks.some((t) => fuzzyEq(w, t))) && word.split(' ').length > 1 && wordsNear(word, toks));
  return toks.some((t) => fuzzyEq(word, t));
};
function wordsNear(phrase, toks) {        // the words of a phrase all appear within a 4-word window (typos in phrases)
  const ws = phrase.split(' ');
  for (let i = 0; i < toks.length; i++) { if (!fuzzyEq(ws[0], toks[i])) continue; let k = 1; for (let j = i + 1; j < Math.min(toks.length, i + 5) && k < ws.length; j++) if (fuzzyEq(ws[k], toks[j])) k++; if (k === ws.length) return true; }
  return false;
}

const W = (s) => s.split('|');       // 'a|b c|d' -> ['a', 'b c', 'd']

// ------------------------------------------------------------------------------------------------ the intents
// g: groups of interchangeable words/phrases; need: how many groups must match (default all); not: veto words; prio: tie break (higher wins)
// write: the action changes something he keeps (it always asks him first).
export const INTENTS = [
  // --- money numbers, from the published data
  { id: 'drawdown_left', group: 'risk', g: [W('drawdown|draw down|room|buffer|cushion|floor|max loss|mll|loss limit|how close|runway|margin'), W('left|remaining|remains|have|much|got|available|spare|spend|before i blow|to the floor|until|from')], need: 2, not: W('chart|picture|trade tape'), prio: 3 },
  { id: 'drawdown_left', group: 'risk', g: [W('drawdown|draw down|mll|max loss|loss limit|loss buffer|drawdown room')], not: W('chart|picture'), prio: 1 },
  { id: 'drawdown_left', group: 'risk', g: [W('how much can i lose|how much more can i lose|how much can i still lose|can i still lose|how much risk|blow|bust|fail the eval|blow the account|blow up')], prio: 3 },
  { id: 'daily_loss_left', group: 'risk', g: [W('daily loss|dll|daily limit|loss for today|loss for the day|todays limit|stop for the day|daily stop'), W('left|remaining|used|room|how|much|limit|hit|close|near')], need: 1, prio: 4 },
  { id: 'eval_progress', group: 'risk', g: [W('target|profit target|pass|passing|eval progress|how far|to go|progress|close to passing|payout'), W('eval|target|pass|far|much|progress|account|funded|go')], need: 2, not: W('weekday|day of the week|calendar|event'), prio: 2 },
  { id: 'pnl_today', group: 'money', g: [W('p and l|pnl|profit|money|made|make|earn|earned|up|down|pnl today|results|score|performance'), W('today|so far|todays|this morning|tonight|day')], need: 2, not: W('weekday|best|worst|month|week|deal|plan'), prio: 2 },
  { id: 'pnl_today', group: 'money', g: [W('how am i doing today|how did i do today|how is today|how was today|am i up today|am i down today|how am i doing|todays p and l|todays pnl|todays result')], prio: 2 },
  { id: 'balance', group: 'money', g: [W('balance|balances|how much money|account value|equity|how much do i have|how much is in'), W('account|accounts|have|money|balance|zlarior|atlas|eval|funded|mffu')], need: 1, not: W('left|room|drawdown|target|weekday|stream|deal|weather|forecast|temperature|kalshi'), prio: 1 },
  // --- the household (your bank exports: money/household.json, tools/money_import.py)
  { id: 'household_spend_cat', group: 'money', g: [W('spend|spent|spending|cost me|costs me|paid for|pay for|paying for|go on|went on|blow on|blew on'), W('food|groceries|grocery|eating out|restaurants|takeout|take out|delivery|doordash|gas|fuel|rent|subscriptions|shopping|bills|utilities|phone|internet|car|rides|uber|health|gym|bank fees|atm|cash')], need: 2, not: W('kalshi|eval|evals|drawdown|trade|trades'), prio: 5 },
  { id: 'household_month', group: 'money', g: [W('spend|spent|spending|cash flow|cashflow|money in|money out|came in|went out|in and out|burn rate|my burn|expenses|outgoings|income'), W('this month|month|last month|so far|total|monthly|how much|average')], need: 2, not: W('kalshi|eval|evals|trade|trades|bot|bots|drawdown|payout|stream|streams|machine|machines|mint|side income|account|accounts|balance|balances'), prio: 4 },
  { id: 'household_subs', group: 'money', g: [W('subscription|subscriptions|recurring|recurring charges|memberships|monthly bills|my bills'), W('what|which|have|list|how much|my|all|cost|pay|show|any')], need: 2, not: W('cancel the bot|kalshi'), prio: 5 },
  { id: 'household_runway', group: 'money', g: [W('how long can i live|how long can i last|how long will my savings|how long will my money last|how long would my savings|savings runway|runway on savings|months of savings|live on my savings|live off my savings|how many months can i|emergency fund last|without income|without a paycheck')], prio: 6 },
  { id: 'household_networth', group: 'money', g: [W('net worth|networth|total worth|how much am i worth|everything i own|all my money together')], prio: 5 },
  // --- your health (the Apple Watch days: me/health.json, tools/me_health.py; the Me hub, the PC's private link only)
  { id: 'health_sleep', group: 'health', g: [W('how did i sleep|how well did i sleep|how much did i sleep|how long did i sleep|how was my sleep|my sleep|sleep last night|last nights sleep|did i sleep|hours of sleep|how much sleep|slept')], not: W('mode|screen|timer|kalshi|bot|bots'), prio: 6 },
  { id: 'health_steps', group: 'health', g: [W('steps|step count|walked|walking'), W('this week|week|today|so far|how many|count|daily|average|yesterday|did i|have i|total')], need: 2,
    not: W('next step|next steps|the steps|steps to|step by step|first step|start|setup|set up|install|connect|shortcut|bot|bots|trade|eval|guide|how do i'), prio: 6 },
  { id: 'health_recovered', group: 'health', g: [W('am i recovered|recovered|recovery|am i rested|ready to train|work out today|workout today|train today|hrv|heart rate variability|resting heart rate|resting hr|readiness|how is my body')], not: W('kalshi|bot|bots|trade|trades|eval|drawdown|account|password|data|file|files'), prio: 6 },
  { id: 'weekday_worst', group: 'stats', g: [W('worst|weakest|bad|losing|lose|losses|least profitable|poorest|terrible'), W('weekday|day of the week|day|days|monday|tuesday|wednesday|thursday|friday')], need: 2, not: W('hour|time of day|deal'), prio: 3 },
  { id: 'weekday_best', group: 'stats', g: [W('best|strongest|good|winning|win|most profitable|top|greatest|luckiest'), W('weekday|day of the week|day|days|monday|tuesday|wednesday|thursday|friday')], need: 2, not: W('hour|time of day|deal|next step|thing to do'), prio: 3 },
  { id: 'win_rate', group: 'stats', g: [W('win rate|winrate|win percentage|hit rate|percent of trades|how often do i win|how many do i win|profit factor|expectancy|average r|avg r|average trade'), W('trade|trades|win|rate|my|factor|expectancy|average|often')], need: 1, prio: 2 },
  { id: 'last_trade', group: 'stats', g: [W('last|latest|recent|previous|most recent'), W('trade|trades|entry|position|fill')], need: 2, not: W('explain|why|what happened|week|month'), prio: 2 },
  { id: 'explain_trade', group: 'stats', g: [W('explain|why|what happened|walk me through|break down|review|what went|analyze|analyse|how did that|how did this'), W('trade|this trade|that trade|last trade|the trade|loss|win|stop|entry|exit|it')], need: 2, not: W('rule|quiz|stop trading|drawdown'), prio: 3 },
  { id: 'trades_count', group: 'stats', g: [W('how many'), W('trades|trade|times|wins|losses|losers|winners')], need: 2, not: W('left|more|can i'), prio: 1 },
  // --- Kalshi (the bot's feed and the Kalshi City engine's files)
  { id: 'kalshi_status', group: 'kalshi', g: [W('kalshi')], need: 1, not: W('open|show me|go to|take me|launch|balance|bankroll|positions|bets|bet kinds|losing|lose money|edge|research|sibyl|win today|won today|alert|alerts|size|stake|how much should'), prio: 4, also: [W('how|doing|status|going|update|report|summary|running|paused|ok|okay|alive|working|is it|health')] },
  { id: 'kalshi_positions', group: 'kalshi', g: [W('open bets|open bet|my bets|my positions|open positions|current bets|current positions|what am i betting|betting on|bets open|bets are open|what bets|which bets are open|holding')], not: W('sibyl|how much should|kinds|types|lose money|losing'), prio: 5 },
  { id: 'kalshi_today', group: 'kalshi', g: [W('kalshi|bot|bots'), W('win|won|lose|lost|make money|made money|profit|green|red|up|down|did well|do well')], need: 2, not: W('weekday|nq|zlarior|atlas|blitz|eval|drawdown'), prio: 3, g3: [W('today|so far|tonight|this morning')] },
  { id: 'kalshi_balance', group: 'kalshi', g: [W('kalshi'), W('balance|bankroll|cash|how much money|how much do i have|account value|equity')], need: 2, prio: 6 },
  { id: 'kalshi_losers', group: 'kalshi', g: [W('bet kinds|kinds of bets|bet types|types of bets|strategies|which bets|which kind|what kind|which markets|which edges|which strategy|bets|bet kind'), W('lose|losing|loses|lost|lose money|losing money|worst|negative|bleeding|cost me')], need: 2, not: W('sibyl|open|how much should'), prio: 5 },
  { id: 'kalshi_edge_research', group: 'kalshi', g: [W('sibyl|research|writeup|study|findings|found|find|learned'), W('kalshi edge|kalshi edges|edge research|kalshi research')], need: 2, prio: 8 },
  // --- calendar, rules, deals
  { id: 'next_event', group: 'calendar', g: [W('next|upcoming|when is|when does|when\'s|coming|calendar|any|what time is|what\'s on|whats on|big|today|this week|tomorrow'), W('cpi|fomc|nfp|jobs report|payroll|news|event|events|release|rate decision|fed|powell|ppi|gdp|pce|inflation|earnings|jobless claims|opex|expiry|holiday|risk calendar|red folder|high impact')], need: 2, prio: 3 },
  { id: 'can_trade_now', group: 'rules', g: [W('allowed|can i|may i|should i|ok to|okay to|is it ok|is it safe|safe to|permitted|green light|go or wait|go no go|am i good to|good to'), W('trade|trading|take a trade|enter|place|go long|go short|buy|sell|open a position|trade now')], need: 2, not: W('how many|why|explain|weekday|fee|journal'), prio: 4 },
  { id: 'can_trade_now', group: 'rules', g: [W('is the bot allowed|is the window open|is the session open|are entries open|is it trading time|can the bot trade|window open|entry window|trading window|trading hours|am i allowed')], prio: 4 },
  { id: 'rules_limit', group: 'rules', g: [W('max|maximum|limit|how many|allowed|rule|rules|flat by|have to be flat|be flat|cutoff|cut off|inactivity|consistency'), W('micros|contracts|minis|contract|flat|payout|payouts|inactivity|consistency|mffu|builder|size|rule')], need: 2, not: W('weekday'), prio: 2 },
  { id: 'deals', group: 'money', g: [W('deal|deals|sale|sales|discount|promo|promo code|coupon|code|codes|ending|expires|expiring|cheap|free reset|black friday'), W('deal|deals|ending|end|expire|expires|expiring|soon|any|code|codes|sale|sales|today|best|new|prop|firm|firms|worth|what')], need: 2, prio: 3 },
  { id: 'sibyl_pick', group: 'money', g: [W('sibyl|prediction market|prediction markets|paper edge|paper edges|polymarket|kalshi edge|edge|edges'), W('pick|picks|picked|choose|chose|best|top|recommend|suggest|say|says|found|find|bet|bets|stake|today|what|worth|which')], need: 2, not: W('open|show me|go to'), prio: 3 },
  { id: 'streams', group: 'money', g: [W('money machine|money machines|mint|streams|stream|money streams|side income|income stream|five streams|money stream|passive'), W('how|what|status|doing|best|worth|much|earning|made|month')], need: 2, prio: 1 },
  { id: 'unrated', group: 'life', g: [W('unrated|not rated|without a rating|unjournaled|not journaled|unjournalled|to journal|needs a rating|need rating|journal backlog|rate|rating|ratings'), W('trade|trades|journal|unrated|rated|backlog|many|need|have|how|any|left')], need: 2, prio: 2 },
  { id: 'feeds', group: 'system', g: [W('stale|old|fresh|freshness|up to date|updated|outdated|offline|last updated|how old|data age|connected|connection|disconnected'), W('feed|feeds|data|numbers|files|bots|bot|pc|ninjatrader|json|home|everything|dashboard|updated')], need: 2, not: W('weekday|trade'), prio: 2 },
  // --- what next, the briefing
  { id: 'next_action', group: 'plan', g: [W('what should i do|what do i do|what now|what next|next step|next action|next best|what\'s next|whats next|where do i start|what needs me|what needs doing|to do next|priorities|priority|compass|top priority|what is most important|most important|do first|first thing|anything i should|anything i need|todo list|to do list'), W('')], need: 1, not: W('quiz|journal entry|planner goal'), prio: 3 },
  { id: 'next_action', group: 'plan', g: [W('what should i do|what do i do|what needs me|do next|next step|next action'), W('next|now|today|first|tonight|morning|plan|priority|this')], need: 2, prio: 3 },
  { id: 'copy_briefing', group: 'action', g: [W('copy|clipboard|share|send|paste|text|export'), W('briefing|brief|morning brief|morning briefing|summary|daily summary|forum|helios')], need: 2, prio: 4 },
  { id: 'briefing', group: 'plan', g: [W('brief|briefing|morning brief|morning briefing|catch me up|catch up|summary|summarize|summarise|recap|rundown|run down|overview|update me|what did i miss|good morning|whats going on|what\'s going on|status report|fill me in'), W('')], need: 1, not: W('copy|clipboard|share|send|paste|export'), prio: 1 },
  // --- actions
  { id: 'navigate', group: 'action', g: [W('open|show|go to|goto|take me to|launch|switch to|pull up|bring up|navigate|visit|start|load|jump to|head to|let me see|see|view|display|show me'), W('')], need: 1, not: W('quiz|note|goal|task|remember|my data|export|briefing|memory'), prio: 1, args: 'target' },
  { id: 'atlas_district', group: 'action', g: [W('district|districts|zone|zones|quarter'), W('market|research|money|command|life|trading|risk')], need: 2, prio: 5 },
  { id: 'quiz_start', group: 'action', g: [W('quiz|test me|question me|daily quiz|rules quiz|drill|flashcards|flash cards|review cards|school'), W('start|begin|take|do|open|run|give|launch|play|let\'s|lets|ready|go|me|quiz|test|question|drill|my')], need: 2, prio: 6 },
  { id: 'planner_goal', group: 'action', g: [W('goal|goals|target for today|intention|objective|focus'), W('set|add|make|create|new|my goal is|put|write|log|today|tomorrow|for today|for the day|is to')], need: 2, not: W('eval target|profit target|argo|island|show|open'), prio: 5 },
  { id: 'planner_task', group: 'action', g: [W('task|todo|to do|to-do|reminder|checklist item'), W('add|create|new|put|set|make|write|log|schedule')], need: 2, not: W('list|show|open|what|how many|any|do i have|my tasks|remind me|reminder|reminders|event|meeting|appointment'), prio: 5 },
  { id: 'planner_event', group: 'action', g: [W('event|meeting|appointment|call with|session')], need: 1, also: [W('add|create|new|put|set|schedule|book|make')], not: W('what|show|open|list|any|do i have|how many|next event|upcoming|cpi|fomc|nfp|calendar of'), prio: 7 },
  { id: 'plan_today', group: 'plan', g: [W('my plan|on my plan|my agenda|agenda|my schedule|schedule today|on my calendar|my calendar|my tasks|my todo|my to do|my events|my appointments|my meetings|on my plate|do i have today|do i have tomorrow|whats on my|what is on my|what do i have today|what do i have tomorrow')], need: 1, also: [W('today|tomorrow|tonight|plan|agenda|calendar|schedule|tasks|events')], not: W('add|create|new|set|schedule a|goal|note|next step|should|cpi|fomc|nfp|news|risk calendar|economic|export|copy|open|show me the|pythia|kalshi|bets'), prio: 5 },
  { id: 'planner_note', group: 'action', g: [W('note|notes|journal note|day note|diary|log'), W('add|write|put|save|make|jot|record|note to|planner|today|set|that')], need: 2, not: W('show|open|read|what|list|obsidian|vault|search'), prio: 4 },
  { id: 'compass_done', group: 'action', g: [W('done|complete|completed|finished|finish|tick|check off|mark|dismiss|snooze|cross off'), W('compass|action|item|that|it|first|top|one|next step|priority|this|task')], need: 2, not: W('quiz|trade|planner'), prio: 4 },
  { id: 'export_data', group: 'action', g: [W('export|download|backup|back up|save a copy|copy of|dump|archive'), W('data|everything|my data|memory|memories|all|backup|json|settings|phone|notes|facts')], need: 2, not: W('briefing|brief|ledger|journal csv|csv'), prio: 4 },
  { id: 'import_data', group: 'action', g: [W('import|restore|load|upload'), W('data|backup|memory|memories|json|everything|file')], need: 2, prio: 4 },
  // --- memory
  { id: 'remember', group: 'memory', g: [W('remember that|remember|keep in mind|don\'t forget|dont forget|make a note that|note that|take note|store that|memorize|memorise|save that|i prefer|i like to|i always|i never|i want you to know|for next time|from now on'), W('')], need: 1, not: W('what did|what do|do you remember|did i say|did i tell|remind me|forget that|forget about|list|show'), prio: 3 },
  { id: 'recall', group: 'memory', g: [W('what did i say|what did i tell|what did i mention|what do i prefer|do you remember|what do you remember|did i say|did i tell|what was that|what i said|what i told|recall|remind me what|what have i told|what do you know'), W('')], need: 1, prio: 5 },
  { id: 'memory_list', group: 'memory', g: [W('memory|memories|facts|remembered|what you know|what you remember|things i told|things you remember|what you have saved|what you\'ve saved'), W('list|show|everything|all|what|my|have|know|saved|stored|see|read')], need: 2, not: W('export|import|download|backup|forget|delete|clear|erase'), prio: 3 },
  { id: 'forget', group: 'memory', g: [W('forget|delete|erase|remove|clear|wipe|drop'), W('that|memory|memories|fact|facts|remember|remembered|saying|about|everything|note|my|what i said|what i told')], need: 2, not: W('tasks|task|goal|planner|cache|history|conversation|journal'), prio: 4 },
  // --- help, yes/no are handled by the brain
  { id: 'help_skills', group: 'meta', g: [W('what can you do|what can you answer|what can i ask|what do you know|help|skills|abilities|commands|capabilities|what are you able|how do i use you|examples|what questions'), W('')], need: 1, prio: 0 },
];

// app names and what people call them (the apps list supplies the official ids and names; these are extras and spoken forms)
export const ALIASES = {
  zenith: 'zenith|the bots|nq bots|bots dashboard|zlarior|zlarior dashboard|trading dashboard|main dashboard',
  oracle: 'oracle|market radar|radar',
  odeon: 'odeon|trade replay|replay|replays|trades 3d|every trade',
  fates: 'fates|pass odds|pass probability',
  moirai: 'moirai|the three fates|bust odds',
  datacity: 'data city|datacity',
  observatory: 'observatory|data health|research evidence',
  tree: 'daphne|strategy tree|tree',
  prometheus: 'prometheus|the forge|forge|strategies tested',
  pantheon: 'pantheon|data gods|rates liquidity|vix dashboard',
  ares: 'ares|war room|go wait halt',
  forum: 'forum|morning briefing app|briefing page',
  labyrinth: 'labyrinth|risk maze|size calculator|eval sizing',
  argus: 'argus|hundred eyes|what to fix',
  nemesis: 'nemesis|fallen trades|losing trades|what went wrong',
  chronos: 'chronos|session clock|clock|time and sessions',
  hephaestus: 'hephaestus|tune the dials|dials',
  cities: 'cities|city islands|city world|cities app|athens|the city',
  kalshicity: 'kalshi city|kalshicity|kalshi night city',
  journal: 'mnemosyne|journal|trade journal|my journal|rate my trades|diary',
  ledger: 'ledger|real money|payouts ledger|fees ledger|my ledger',
  inbox: 'inbox|alerts inbox|everything that needs a look',
  settings: 'settings|setting|preferences|options|look and sound|storage|voice settings',
  bridge: 'bridge|chatgpt|link chatgpt|chat gpt',
  planner: 'planner|day plan|week plan|my plan|my day|calendar of the day|agenda|schedule|todo app|tasks',
  mind: 'mind|vault|obsidian|brain 3d|my notes|notes map',
  arena: 'arena|ranks|xp|olympian ranks|leaderboard',
  hestia: 'hestia|today at home|home today|home',
  demeter: 'demeter|account health|drawdown dials|payout readiness',
  apollo: 'apollo|weekly review|one rule',
  hera: 'hera|12 month plan|money plan 12|year plan|payout plan',
  dionysus: 'dionysus|kalshi desk|kalshi guard',
  delphi: 'delphi|oracle briefing|the briefing|go no go|trading plan',
  pnyx: 'pnyx|rules calculator|prop firm rules|risk calculator|prop rules',
  mint: 'mint|money machine|money machines|five streams',
  mintcity: 'mint city|mintcity|money machines city',
  mercury: 'mercury|deal watcher|deals|discount codes|promo',
  chrysos: 'chrysos|fleet planner|prop fleet|fees against payouts',
  sibyl: 'sibyl|prediction edges|prediction market edges|paper edges',
  oikos: 'oikos|household|where money leaks|tax',
  arbiter: 'arbiter|spreads|funding rates|paper spreads',
  stoa: 'stoa|colonnade|what needs you',
  aegis: 'aegis|risk guard|full stop|shield',
  lyceum: 'lyceum|school|quiz|daily quiz|rules quiz|habits costing',
  nike: 'nike|trophy hall|trophies|wins|milestones',
  kronos: 'kronos|calendar of money|daily pnl|pnl calendar|money calendar|best weekday',
  epilogue: 'epilogue|week in 60 seconds|sunday review|weekly recap',
  argo: 'argo|the voyage|money goals|goals islands|voyage',
  kratos: 'kratos|discipline score|discipline',
  pythia: 'pythia|risk calendar|economic calendar|news calendar|events calendar|cpi calendar|fomc calendar',
  gallery: 'gallery|agora gallery|3d shapes',
  kairos: 'kairos|right moment|bots day|24 hour strip',
  compass: 'compass|next best action|next action|what to do next',
  pheme: 'pheme|word on the street|releases',
  harmonia: 'harmonia|balance of the bots|what leans on',
  helios: 'helios|morning briefing|sunrise|day start',
  clio: 'clio|research library|studies',
  atlas: 'atlas|map of dashboards|all apps|every app|app map|apps map|command center|navigation map',
  athena: 'athena|library|strategy rules quiz|strategy library|strategy page|rules page',
  kalshi: 'kalshi|kalshi bot|kalshi dashboard',
  tyche: 'tyche|fortune wheel|kalshi wheel',
  hermes: 'hermes|wrapped|olympus wrapped',
  plutus: 'plutus|money plan|accounts and payouts',
};
export const DISTRICTS = {
  market: 'market|trading|the market|read the tape',
  research: 'research|studies|ideas|tests',
  risk: 'money|risk|finance|balances|payouts',
  command: 'command|home|alerts|settings district',
  life: 'life|plan the day|learn|personal',
};

const clip = (s, n) => String(s == null ? '' : s).slice(0, n);
/** the app a phrase names: { id, name, score } or null. `apps`: [{ id, name, purpose? }] */
export function findApp(text, apps) {
  const q = norm(text), toks = content(text);
  if (!q) return null;
  const list = Array.isArray(apps) ? apps : [];
  let best = null;
  const consider = (id, name, sc) => { if (!best || sc > best.score) best = { id, name, score: sc }; };
  const names = {};
  for (const a of list) if (a && a.id) names[a.id] = a.name || a.id;
  const ids = Object.keys(names);
  for (const id of ids.length ? ids : Object.keys(ALIASES)) {
    const nm = names[id] || id, forms = norm(nm) + '|' + (ALIASES[id] || '') + '|' + id;
    for (const form of forms.split('|').map(norm).filter(Boolean)) {
      if ((' ' + q + ' ').indexOf(' ' + form + ' ') >= 0) { consider(id, nm, 3 + form.split(' ').length * 0.5 + (form === norm(nm) ? 0.2 : 0)); continue; }
      const fw = form.split(' ');
      if (fw.length === 1 && form.length >= 4) {
        let ok = false;
        for (const t of toks) { if (t.length >= 4 && fuzzyEq(form, t)) ok = true; }
        if (ok) consider(id, nm, 2 + (form === norm(nm) ? 0.2 : 0));
      } else if (fw.length > 1 && fw.every((w) => toks.some((t) => fuzzyEq(w, t)))) consider(id, nm, 2.4);
    }
  }
  if (!best || best.score < 2) {          // the purpose line: "the calendar of money" -> Kronos (only when the words are rare enough)
    const stop = new Set(['app', 'page', 'dashboard', 'screen', 'one', 'view', 'tab', 'thing', 'show', 'open']);
    const q2 = toks.filter((t) => !stop.has(t));
    if (q2.length >= 2) for (const a of list) {
      if (!a || !a.purpose) continue;
      const pw = content(a.purpose + ' ' + (a.name || ''));
      const hit = q2.filter((t) => t.length >= 4 && pw.some((w) => fuzzyEq(w, t))).length;
      if (hit >= 2 && hit >= q2.length - 1) consider(a.id, a.name || a.id, 1 + hit * 0.2);
    }
  }
  return best;
}
export function findDistrict(text) {
  const q = norm(text), toks = tokens(text);
  for (const id of Object.keys(DISTRICTS)) for (const f of DISTRICTS[id].split('|')) if ((' ' + q + ' ').indexOf(' ' + f + ' ') >= 0 && toks.length) return id;
  return null;
}

const VERBS = ['open', 'show', 'launch', 'display', 'navigate', 'visit'];
/** "opn pythia" -> "open pythia": a typo in the first word of a command */
// real words one letter from a verb are never typos: "how are the bots" is a question, not "show are the bots" (phone QA 2026-11-16:
// it answered "Opening Zenith.")
const NOT_TYPOS = ['how'];
function fixVerb(q) {
  const i = q.indexOf(' '), w = i < 0 ? q : q.slice(0, i);
  if (w.length < 3 || VERBS.indexOf(w) >= 0 || NOT_TYPOS.indexOf(w) >= 0) return q;
  const v = VERBS.find((x) => lev(x, w, 1) <= 1);
  return v ? v + (i < 0 ? '' : q.slice(i)) : q;
}
/** pull "arguments" out of a phrase: the part after a verb, etc. */
export function afterWords(raw, words) {
  const s = String(raw || '').replace(/[’‘]/g, "'").trim();
  const rx = new RegExp('(?:^|\\b)(?:' + words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b[\\s:,-]*(.*)$', 'i');
  const m = s.match(rx);
  return m ? m[1].replace(/^(that|to|about|:)\s+/i, '').trim() : '';
}

/** route(text, ctx?) -> { intent, score, args } | null.  ctx.apps: the apps list (names for "open ..." and "show me ...") */
export function route(text, ctx) {
  const raw = clip(text, 500), q = norm(raw), toks = tokens(raw);
  if (!q || toks.length === 0) return null;
  const apps = ctx && ctx.apps;
  const results = [];
  for (let i = 0; i < INTENTS.length; i++) {
    const it = INTENTS[i];
    if (it.not && it.not.some((w) => has(w, q, toks))) continue;
    const groups = it.g.filter((grp) => !(grp.length === 1 && grp[0] === ''));
    const need = it.need != null ? it.need : groups.length;
    let hit = 0;
    for (const grp of groups) if (grp.some((w) => has(w, q, toks))) hit++;
    if (hit < need || hit === 0) continue;
    if (need < groups.length && !groups[0].some((w) => has(w, q, toks))) continue;
    if (it.also && !it.also.every((grp) => grp.some((w) => has(w, q, toks)))) continue;       // extra required groups
    if (it.g3 && !it.g3.every((grp) => grp.some((w) => has(w, q, toks)))) continue;
    if (it.must && !it.must.some((w) => has(w, q, toks))) continue;      // an optional second group never carries an intent alone
    // a longer, more specific phrasing wins: the score is the share of content words the groups explain
    const score = hit / Math.max(1, groups.length) + (it.prio || 0) * 0.01 + Math.min(0.3, toks.length * 0.01) * 0.2;
    results.push({ intent: it.id, score, args: {}, order: i });
  }
  // the specific intents are explicit; "open X" / "show me X" is the navigation catch-all and needs a real app / district / thing named
  const app = findApp(raw, apps), dist = findDistrict(raw);
  const nav = results.find((r) => r.intent === 'navigate');
  const q1 = fixVerb(q);
  const verbOnly = /^(?:please |jarvis |hey jarvis |can you |could you |let'?s |i want to |i wanna |i'd like to |take me to |go to |go )?(?:open|show(?: me)?|go to|goto|launch|take me to|switch to|pull up|bring up|navigate to|visit|jump to|head to|display|view|see|load|start|let me see)\b/.test(q1);
  if (nav) {
    if (app && verbOnly) { nav.args = { target: app.id, name: app.name }; nav.score += 0.5 + app.score * 0.1; }
    else results.splice(results.indexOf(nav), 1);
  } else if (app && verbOnly && !results.length) results.push({ intent: 'navigate', score: 1.2, args: { target: app.id, name: app.name }, order: 99 });
  if (!results.length && verbOnly && /\b(athens|the city)\b/.test(q)) results.push({ intent: 'navigate', score: 1.2, args: { target: 'cities', name: 'Cities', route: '#athens' }, order: 99 });
  if (!results.length) return null;
  results.sort((a, b) => (b.score - a.score) || (a.order - b.order));
  const top = results[0];
  if (top.intent === 'navigate') {
    if (/\bathens\b/.test(q)) { top.args.target = 'cities'; top.args.name = 'Cities'; top.args.route = '#athens'; }
    if (!top.args.target) return null;
  }
  if (top.intent === 'atlas_district') { const d = findDistrict(raw); if (!d) return null; top.args = { district: d }; }
  if (top.intent === 'planner_goal') top.args.text = afterWords(raw, ['goal for today is', 'goal for today', 'goal is', 'goal', 'goals', 'my focus is', 'focus on', 'focus is', 'objective is']) || afterWords(raw, ['to']);
  if (top.intent === 'planner_task') top.args.text = afterWords(raw, ['add task', 'add a task', 'new task', 'add todo', 'add a todo', 'task', 'todo', 'to do', 'remind me to', 'add to my planner', 'add']);
  if (top.intent === 'planner_event') top.args.text = afterWords(raw, ['add event', 'add an event', 'new event', 'create event', 'create an event', 'schedule an event', 'schedule a meeting', 'add a meeting', 'add meeting', 'add an appointment', 'book an appointment', 'schedule', 'book', 'add']);
  if (top.intent === 'plan_today') top.args.which = /\btomorrow\b/.test(q) ? 'tomorrow' : 'today';
  if (top.intent === 'planner_note') top.args.text = afterWords(raw, ['add a note', 'add note', 'write a note', 'note that', 'note to planner', 'planner note', 'note', 'log']);
  if (top.intent === 'remember') top.args.text = afterWords(raw, ['remember that', 'remember', 'keep in mind that', 'keep in mind', "don't forget that", "don't forget", 'dont forget', 'note that', 'make a note that', 'take note that', 'memorize', 'memorise', 'save that', 'from now on', 'for next time']) || raw;
  if (top.intent === 'recall') top.args.topic = afterWords(raw, ['what did i say about', 'what did i tell you about', 'what did i mention about', 'what i said about', 'what i told you about', 'do you remember about', 'do you remember', 'what do you remember about', 'what do you know about', 'what have i told you about', 'what do i prefer for', 'what do i prefer', 'recall']);
  if (top.intent === 'recall' && !top.args.topic) top.intent = 'memory_list';
  if (top.intent === 'forget') top.args.topic = afterWords(raw, ['forget about', 'forget that', 'forget', 'delete', 'erase', 'remove', 'clear', 'wipe']);
  if (top.intent === 'compass_done') top.args.which = afterWords(raw, ['mark', 'tick', 'check off', 'cross off', 'dismiss', 'snooze']).replace(/\b(as )?(done|complete|completed|finished)\b/gi, '').replace(/\s+/g, ' ').trim();
  if (top.intent === 'weekday_worst' || top.intent === 'weekday_best') {
    const dd = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].find((d) => toks.some((t) => fuzzyEq(d, t)));
    if (dd) top.args.day = dd;
  }
  return { intent: top.intent, score: Math.round(top.score * 100) / 100, args: top.args };
}
export const intentIds = () => Array.from(new Set(INTENTS.map((i) => i.id)));
export default route;

// ------------------------------------------------------------------------------------------------ what Jarvis can do (the help skill)
// One label and three example phrases per intent. helpTable() groups them from INTENTS' own `group`, so the help can only list intents
// that exist; the tests route every example back to its intent and fail when an intent has no entry (it can never drift).
export const GROUP_NAMES = { risk: 'Risk and drawdown', money: 'Money', stats: 'My trades', calendar: 'Calendar', rules: 'Rules', plan: 'What to do', action: 'Do things', memory: 'Memory', kalshi: 'Kalshi', system: 'System', health: 'Health', life: 'Journal', meta: 'Help' };
export const GROUP_ORDER = ['risk', 'money', 'stats', 'calendar', 'rules', 'plan', 'kalshi', 'action', 'memory', 'system', 'health', 'life', 'meta'];
export const INFO = {
  drawdown_left: { label: 'Drawdown left', ex: ['how much drawdown do I have left', 'how much can I still lose', 'whats my max loss buffer'] },
  daily_loss_left: { label: 'Daily loss left', ex: ['how much daily loss do I have left', 'whats my dll', 'how close am I to the daily limit'] },
  eval_progress: { label: 'Eval progress', ex: ['how far am I from the target', 'how close am I to passing the eval', 'eval progress'] },
  pnl_today: { label: 'Today\'s result', ex: ['how am I doing today', 'whats my pnl today', 'am I up today'] },
  balance: { label: 'Balances', ex: ['whats my balance', 'how much money is in the accounts', 'show my account balance'] },
  household_spend_cat: { label: 'Spending by category (bank)', ex: ['how much did I spend on food this month', 'what did I spend on gas last month', 'how much do I spend on rent'] },
  household_month: { label: 'Money in and out (bank)', ex: ['how much did I spend this month', 'whats my cash flow this month', 'money in and out last month'] },
  household_subs: { label: 'Subscriptions (bank)', ex: ['what subscriptions do I have', 'list my recurring charges', 'how much are my subscriptions'] },
  household_runway: { label: 'How long savings last', ex: ['how long can I live on my savings', 'how long will my savings last', 'how many months can I last without income'] },
  household_networth: { label: 'Net worth', ex: ['whats my net worth', 'how much am I worth', 'what is my net worth now'] },
  health_sleep: { label: 'Sleep (Apple Watch)', ex: ['how did I sleep', 'how much did I sleep last night', 'how was my sleep this week'] },
  health_steps: { label: 'Steps (Apple Watch)', ex: ['how many steps this week', 'steps today', 'how many steps did I walk'] },
  health_recovered: { label: 'Recovered? (Apple Watch)', ex: ['am I recovered', 'should I work out today', 'how is my resting heart rate'] },
  weekday_worst: { label: 'Worst weekday', ex: ['what is my worst weekday', 'which day of the week do I lose the most', 'my worst day'] },
  weekday_best: { label: 'Best weekday', ex: ['what is my best weekday', 'which day of the week do I win the most', 'best day for me'] },
  win_rate: { label: 'Win rate and profit factor', ex: ['whats my win rate', 'what is my profit factor', 'how often do I win'] },
  last_trade: { label: 'Last trade', ex: ['whats my last trade', 'show my most recent trade', 'what was the latest trade'] },
  explain_trade: { label: 'Explain a trade', ex: ['explain this trade', 'why did the last trade lose', 'walk me through that trade'] },
  trades_count: { label: 'How many trades', ex: ['how many trades did I take', 'how many trades this week', 'how many trades have I had'] },
  next_event: { label: 'Next news event', ex: ['when is the next CPI', 'when is the next FOMC', 'is there any news today'] },
  can_trade_now: { label: 'Am I allowed to trade', ex: ['am I allowed to trade now', 'is the entry window open', 'can I trade right now'] },
  rules_limit: { label: 'MFFU rules', ex: ['how many micros can I trade', 'when do I have to be flat', 'whats the inactivity rule'] },
  deals: { label: 'Deals ending', ex: ['any deals ending soon', 'are there any discount codes', 'whats the best prop firm sale'] },
  sibyl_pick: { label: 'Sibyl\'s pick', ex: ['what did Sibyl pick', 'sibyl picks today', 'what does sibyl recommend'] },
  streams: { label: 'Money machines', ex: ['how are the money machines doing', 'how are my money streams', 'whats the mint status'] },
  unrated: { label: 'Unrated trades', ex: ['how many unrated trades do I have', 'which trades are not rated', 'do I have journal backlog'] },
  feeds: { label: 'Are the feeds fresh', ex: ['are my feeds stale', 'is the data fresh', 'is the data up to date'] },
  next_action: { label: 'What to do next', ex: ['what should I do next', 'whats my next best action', 'what needs me now'] },
  copy_briefing: { label: 'Copy the briefing', ex: ['copy the briefing', 'copy my morning brief', 'put the summary on the clipboard'] },
  briefing: { label: 'The briefing', ex: ['brief me', 'catch me up', 'morning briefing'] },
  navigate: { label: 'Open any app', ex: ['open kronos', 'take me to the planner', 'show me Athens'] },
  atlas_district: { label: 'Open an Atlas district', ex: ['open the money district', 'show me the life district', 'go to the research zone'] },
  quiz_start: { label: 'Start the quiz', ex: ['start the quiz', 'test me on my rules', 'lets do the daily quiz'] },
  planner_goal: { label: 'Set a goal in the Planner', ex: ['set my goal for today to stay flat before 10', 'add a goal: no trades after 11', 'my goal for today is to follow the plan'] },
  planner_task: { label: 'Add a Planner task', ex: ['add task review levels 09:30', 'add a task to call the broker', 'new task export the ledger'] },
  planner_event: { label: 'Add a Planner event', ex: ['add event Fri 9am journal review', 'add a meeting tomorrow 2pm', 'schedule an event Monday 10am review levels'] },
  plan_today: { label: 'What is on my plan', ex: ['what is on my plan today', 'whats on my calendar tomorrow', 'what do I have today'] },
  planner_note: { label: 'Add a Planner note', ex: ['add a note that levels held', 'planner note: news at 8:30', 'write a note that I stayed flat'] },
  compass_done: { label: 'Mark a Compass item done', ex: ['mark that done', 'mark the compass item as finished', 'tick off the top action'] },
  export_data: { label: 'Export my data', ex: ['export my data', 'download a backup of my data', 'make a backup of everything'] },
  import_data: { label: 'Import a backup', ex: ['import my data', 'restore my data from a file', 'upload a memory file'] },
  remember: { label: 'Remember something', ex: ['remember that I trade best before 10', 'dont forget I prefer short answers', 'keep in mind my cutoff is 11'] },
  recall: { label: 'What did I say', ex: ['what did I say about mornings', 'do you remember what I said about sizing', 'what do I prefer for answers'] },
  memory_list: { label: 'Show my memories', ex: ['what do you remember', 'show my memories', 'list my memories'] },
  forget: { label: 'Forget something', ex: ['forget that I trade best before 10', 'forget about sizing', 'delete that memory'] },
  help_skills: { label: 'What I can do', ex: ['what can you do', 'what can I ask you', 'show me the commands'] },
  kalshi_status: { label: 'How is Kalshi doing', ex: ['how is kalshi doing', 'is the kalshi bot running', 'kalshi status'] },
  kalshi_positions: { label: 'Open Kalshi bets', ex: ['what are my open bets', 'what am I betting on', 'show my open positions'] },
  kalshi_today: { label: 'Did the Kalshi bot win today', ex: ['did the kalshi bot win today', 'is kalshi up today', 'did kalshi make money today'] },
  kalshi_balance: { label: 'Kalshi balance', ex: ['what is the kalshi balance', 'how much money is on kalshi', 'kalshi bankroll'] },
  kalshi_losers: { label: 'Which bet kinds lose money', ex: ['which bet kinds lose money', 'which strategies are losing', 'what kind of bets lose'] },
  kalshi_edge_research: { label: 'Kalshi edge research', ex: ['what did Sibyl find about the kalshi edge', 'what did the research find about kalshi edges', 'kalshi edge research findings'] },
};
/** [{ id, name, items: [{ id, label, examples: [3] }] }] in a fixed order, built from INTENTS (its groups) and INFO */
export function helpTable() {
  const seen = new Set(), by = {};
  for (const it of INTENTS) {
    if (seen.has(it.id)) continue; seen.add(it.id);
    const info = INFO[it.id] || { label: it.id.replace(/_/g, ' '), ex: [] };
    (by[it.group] || (by[it.group] = [])).push({ id: it.id, label: info.label, examples: info.ex.slice(0, 3) });
  }
  return GROUP_ORDER.filter((g) => by[g]).map((g) => ({ id: g, name: GROUP_NAMES[g] || g, items: by[g] }));
}
