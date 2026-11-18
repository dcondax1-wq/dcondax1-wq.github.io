// Jarvis modes + "think for me" (owner 2026-11-03: "make modes for research, trading, business whatever so it is smart. You
// should think about things, it shouldn't just be me"). One ES module: no imports, no DOM, no network. Plain ES2020 (iPhone
// Safari 16: no regex lookbehind, no nullish or optional chaining).
//
//   import { createModes } from './modes.js';
//   const modes = createModes({ storage?, cards?: (ids) => ({ id: card }) });     cards: the apps' last live cards (apps.js)
//   createBrain({ ..., modes });                                                  the brain asks it (brain.js)
//   modes.mode / modes.set(id) / modes.effective(q)     'auto' (default) | 'trading' | 'research' | 'business' | 'life'
//   modes.parseSwitch(q) -> id | null                   "switch to research mode", "trading mode", "auto mode", "life mode on"
//   modes.prompt(id) / modes.quick(id) / modes.apps(id) / modes.greeting(id, D) / modes.orderTools(list, id)
//   modes.think(D, id?, n?) -> { mode, items, text, say }   the rule list ("Here's what I'd do"), no key needed
//   modes.dueSlot(D) -> slot id | null / modes.markSlot(D, id)   the set times (ET) when Jarvis thinks for him unasked
//
// D (the brain's digest, brain.js digest()): { now, et: {y, mo, d, h, min, wd, dn}, priorities: [{p, key, text, speak, app}],
//   quiet: [{key, name, q}], accounts: [{key, name, status, room, room_frac, to_target, today_pnl}], window: {open, text},
//   market: {open}, live: {missing, stale, ago}, kalshi: {state, run, today_pnl, week_pnl, total_pnl, strategies: [{name, pnl}]},
//   plan: {ev: [{title, start, min, allDay}], tasks: [{title, overdue}]} | null, todos: [{text}], reminders: [{text, at}],
//   mind: {regime, proposals: [{idea, status}], plan} | null, money: {next, goals} | null, apps: [{id, name}], smart, vault }
// Every item: { key, p (lower = sooner), mode, text, say, label, action: {type: 'ask' | 'open' | 'mode' | 'control', value, route?} }.
// Read-only like the brain: an action asks Jarvis, opens an app or switches a mode; it never trades, arms or sends anything.

export const MODE_KEY = 'jarvis.mode';
export const SLOT_KEY = 'jarvis.mode.slots';
export const MODE_IDS = ['auto', 'trading', 'research', 'business', 'life'];
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : null);
const str = (v, n) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '').replace(/\s+/g, ' ').trim().slice(0, n || 300);
const usd = (v, sign) => { const n = num(v); if (n == null) return '—'; return (sign && n > 0 ? '+' : n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US'); };
const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const dayNum = (y, mo, d) => Math.round(Date.UTC(y, mo - 1, d) / 864e5);
const plain = (s) => String(s || '').replace(/([+-]?)\$([\d,]+)(?:\.(\d\d))?/g, (m0, sg, n, c) => (sg === '-' ? 'minus ' : sg === '+' ? 'plus ' : '') + n.replace(/,/g, '') + ' dollars' + (c && c !== '00' ? ' ' + (+c) : ''))
  .replace(/(\d)%/g, '$1 percent').replace(/\b1 MNQ\b/g, 'one micro').replace(/\bMNQ\b/g, 'micro').replace(/[·•|→]/g, ',').replace(/[*_#`[\]<>]/g, '').replace(/\s+/g, ' ').trim();

// ------------------------------------------------------------------------------------------------ the modes
// prompt: the smart-mode system prompt's mode line; tools: offered first to the model (the rest follow); quick: the chips;
// apps: the home cards for the mode; words: the auto pick (a question with these words is that mode's)
export const MODES = {
  auto: { id: 'auto', name: 'Auto', glyph: '◎', blurb: 'I pick the mode from your question', prompt: '', tools: [], apps: [],
    quick: [], words: null },
  trading: { id: 'trading', name: 'Trading', glyph: '▲', blurb: 'Bots, eval drawdown, today\'s plan, risk',
    prompt: 'MODE: TRADING. He wants the trading desk: the bots\' status, each eval\'s room to its floor (drawdown), MFFU\'s 7-day rule, the day\'s plan and entry window, and risk. Lead with money at risk. Use FACTS only for every number; say plainly when one is missing. Never suggest a manual trade beyond the 1 MNQ keep-alive, never sizing up, never arming or going live: paper rules and his own tap.',
    tools: ['get_bots_status', 'get_money', 'calc', 'open_app', 'set_reminder'],
    quick: ['How are the bots?', 'Am I at risk?', "Today's trading plan", 'How much room is left?', 'Why no trade?', 'When is the next setup?'],
    apps: ['zenith', 'ares', 'fates', 'oracle'],
    words: /\b(bots?|zlarior|atlas|blitz|nq|mnq|es|evals?|mffu|drawdown|room|floor|trades?|traded|trading|setup|entry|stop|target|risk|p&l|pnl|market|futures|ninja ?trader|pc|chart|vix|sweep|cisd|fvg|ifvg)\b/ },
  research: { id: 'research', name: 'Research', glyph: '◇', blurb: 'Data City, Prometheus, the Mind, the web, notes',
    prompt: 'MODE: RESEARCH. He wants to dig: what Data City, Prometheus, DAPHNE and the Mind found (FACTS.research), ideas worth testing, facts from Wikipedia and the web tools. A trading idea is only worth adopting if it holds in 2026 AND 2021-25 and keeps 2-4 trades a week; say so, and never call an untested idea an edge. Cite where each fact came from. Offer to save findings as a research note in Obsidian (obsidian_create_note "Research - <topic>"); he confirms every write.',
    tools: ['wiki_summary', 'web_search', 'obsidian_search', 'obsidian_read', 'obsidian_create_note', 'obsidian_append_note', 'define', 'calc'],
    quick: ['Research findings', 'A research idea worth testing', 'What did the bots learn?', 'Data City findings', 'Look up mean reversion'],
    apps: ['datacity', 'prometheus', 'athena', 'mind', 'tree'],
    words: /\b(research|study|studies|test(ed|ing)?|backtests?|hypothes\w*|idea|ideas|data city|datacity|prometheus|daphne|pantheon|mind|wiki\w*|look up|search|who is|what is|explain|why does|paper|sources?|findings?|learn\w*|notes?|obsidian)\b/ },
  business: { id: 'business', name: 'Business', glyph: '$', blurb: 'Money goals, more accounts, Kalshi edge, deadlines',
    prompt: 'MODE: BUSINESS. Think like a self-made operator: his money goals (FACTS.money / the Road to $10K), the plan for more funded accounts (MFFU Builder 50K $91.80 and Builder 25K $63, one-time, his real prices), the Kalshi bot\'s edge by strategy, and his to-dos with deadlines. One clear recommendation with the real numbers, then the next step and its deadline. Check the maths with calc. Treat every edge as unproven; never promise returns.',
    tools: ['calc', 'get_money', 'list_tasks', 'add_task', 'set_reminder', 'obsidian_create_note', 'web_search'],
    quick: ['How close am I to my money goal?', 'How is Kalshi?', "What's my best Kalshi edge?", 'What should I stop on Kalshi?', 'Kalshi risks', 'How much should I bet?', 'What did Kalshi learn today?', 'Plan for more accounts', 'My to-dos with deadlines', 'Deals on evals', 'Connect ChatGPT'],     // KALSHI-BRAIN quick asks
    apps: ['plutus', 'hermes', 'kalshi', 'tyche', 'bridge'],
    words: /\b(business|money goal|goals?|10 ?k|income|revenue|profit|payouts?|accounts? plan|more accounts|scale|scaling|buy (an? )?evals?|kalshi|edge|deadlines?|due|invest\w*|budget|savings|costs?|price|pricing|deal|deals|discount|side hustle|sell|clients?)\b/ },
  life: { id: 'life', name: 'Life', glyph: '☼', blurb: 'Planner, reminders, Ascend, your day',
    prompt: 'MODE: LIFE. He wants his day sorted: the Planner (events, tasks), his reminders and to-dos, gym and looks (his Ascend app), school, sleep and people. Warm and short, like a sharp friend who keeps him on schedule. Use set_reminder / add_task when he asks, never invent his schedule.',
    tools: ['list_tasks', 'add_task', 'set_reminder', 'get_weather', 'remember_fact', 'recall', 'time_in', 'open_app'],
    quick: ["What's on today?", 'My reminders', 'My to-dos', 'Open Ascend', "What's the weather?"],
    apps: ['planner', 'ascend', 'arena', 'mind'],
    words: /\b(planner|calendar|schedule|events?|meetings?|reminders?|remind|to ?-?dos?|tasks?|ascend|looks\w*|gym|workout|lift\w*|sleep|school|class|homework|girl\w*|friends?|mom|dad|family|birthday|weather|eat|food|diet|skin\w*|jawline|mew\w*|routine|habits?)\b/ },
};
const ORDER = ['trading', 'business', 'life', 'research'];       // auto: the most specific words win in this order

/** "switch to research mode", "research mode", "go to business mode", "life mode on", "auto mode", "trading" alone is not one. */
export function parseSwitch(q) {
  const t = str(q, 120).toLowerCase().replace(/[.!?,]+$/g, '').replace(/^(?:jarvis|hey jarvis|ok jarvis)[, ]+/, '').replace(/^(?:please|can you|could you)\s+/, '').trim();
  const m = t.match(/^(?:(?:switch|change|go|move|flip|put me|get)(?: (?:it|me|us|you|yourself))?(?: (?:in)?to| in)?|enter|start|use|turn on|activate|be in|i want|i need|let's do|lets do)?\s*(?:the\s+)?(auto|automatic|trading|trade|trader|research|researcher|business|money|life|personal)\s+mode(?:\s+on)?(?:\s+please)?$/);
  if (!m) return null;
  const w = m[1];
  return w === 'automatic' ? 'auto' : w === 'trade' || w === 'trader' ? 'trading' : w === 'researcher' ? 'research' : w === 'money' ? 'business' : w === 'personal' ? 'life' : w;
}
/** The mode a question belongs to (auto): its words, else '' (no clear mode). */
export function pickMode(q) {
  const t = str(q, 600).toLowerCase();
  if (!t) return '';
  let best = '', score = 0;
  for (const id of ORDER) {
    const rx = MODES[id].words, g = new RegExp(rx.source, 'g'), n = (t.match(g) || []).length;
    if (n > score) { best = id; score = n; }
  }
  return best;
}
/** A tool list in any provider's format, the mode's tools first (the model reads the list in order). */
export function orderTools(list, id) {
  const pref = (MODES[id] || MODES.auto).tools;
  if (!Array.isArray(list) || !pref.length) return list;
  const nameOf = (d) => (isObj(d) ? str(d.name, 60) || (isObj(d.function) ? str(d.function.name, 60) : '') : '');
  const rank = (d) => { const i = pref.indexOf(nameOf(d)); return i < 0 ? pref.length : i; };
  const sortList = (l) => l.map((d, i) => [rank(d), i, d]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[2]);
  if (list.length === 1 && isObj(list[0]) && Array.isArray(list[0].functionDeclarations)) return [{ ...list[0], functionDeclarations: sortList(list[0].functionDeclarations) }];   // Gemini
  return sortList(list);
}
/** The deadline in a to-do's words: "by friday", "by tomorrow", "due nov 5", "by 11/5", "(due 2026-11-05)" -> its day number, else null. */
export function parseDeadline(text, et) {
  const t = str(text, 240).toLowerCase();
  if (!isObj(et) || num(et.dn) == null) return null;
  const m = t.match(/\b(?:by|due|before|deadline|until|till)\s*:?\s*(today|tonight|tomorrow|tmrw|yesterday|(?:this |next )?(?:sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)[a-z]*|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.? \d{1,2}|\d{1,2} (?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{4}-\d{2}-\d{2}|end of (?:the )?(?:week|month))\b/);
  if (!m) return null;
  const w = m[1];
  if (w === 'today' || w === 'tonight') return et.dn;
  if (w === 'tomorrow' || w === 'tmrw') return et.dn + 1;
  if (w === 'yesterday') return et.dn - 1;
  if (w === 'end of the week' || w === 'end of week') return et.dn + ((5 - et.wd + 7) % 7);
  if (/^end of (the )?month$/.test(w)) return dayNum(et.y, et.mo + 1, 1) - 1;
  const wdm = w.match(/^(this |next )?(sun|mon|tue|wed|thu|fri|sat)/);
  if (wdm) { const want = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(wdm[2]); let k = (want - et.wd + 7) % 7; if (wdm[1] === 'next ' && k < 7) k = k || 7; return et.dn + k; }
  let y = et.y, mo = 0, d = 0, x;
  if ((x = w.match(/^(\d{4})-(\d{2})-(\d{2})$/))) { y = +x[1]; mo = +x[2]; d = +x[3]; }
  else if ((x = w.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/))) { mo = +x[1]; d = +x[2]; if (x[3]) y = x[3].length === 2 ? 2000 + +x[3] : +x[3]; }
  else if ((x = w.match(/^([a-z]{3})[a-z]*\.? (\d{1,2})$/))) { mo = MON.indexOf(x[1]) + 1; d = +x[2]; }
  else if ((x = w.match(/^(\d{1,2}) ([a-z]{3})/))) { mo = MON.indexOf(x[2]) + 1; d = +x[1]; }
  if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null;
  let dn = dayNum(y, mo, d);
  if (!/\d{4}|\/\d{2,4}$/.test(w) && dn < et.dn - 60) dn = dayNum(y + 1, mo, d);       // "by jan 5" in November: next year
  return dn;
}
const dayWord = (dn, et) => (dn === et.dn ? 'today' : dn === et.dn + 1 ? 'tomorrow' : dn === et.dn - 1 ? 'yesterday' : dn > et.dn && dn - et.dn < 7 ? WD[(et.wd + dn - et.dn) % 7] : `${Math.abs(dn - et.dn)} days ${dn < et.dn ? 'ago' : 'from now'}`);

// ------------------------------------------------------------------------------------------------ "Here's what I'd do" (rules)
const ask = (value) => ({ type: 'ask', value });
const open = (value, route) => (route ? { type: 'open', value, route } : { type: 'open', value });
const MODE_OF_APP = { zenith: 'trading', fates: 'trading', oracle: 'trading', odeon: 'trading', planner: 'life', ascend: 'life', arena: 'life', kalshi: 'business', tyche: 'business', hermes: 'business',
  ares: 'trading', forum: 'trading', argus: 'trading', nemesis: 'trading', chronos: 'trading', hephaestus: 'trading', bridge: 'business', labyrinth: 'trading', plutus: 'business', athena: 'research', datacity: 'research', prometheus: 'research', tree: 'research', mind: 'research', pantheon: 'research' };
const APP_NAME = { datacity: 'Data City', prometheus: 'Prometheus', tree: 'DAPHNE', mind: 'the Mind', pantheon: 'Pantheon', fates: 'Fates', oracle: 'Oracle', odeon: 'Odeon', hermes: 'Hermes', tyche: 'Tyche', arena: 'Arena' };

/** The rule items for every mode, most urgent first. No key, no network: only what D holds. */
export function thinkAll(D) {
  D = isObj(D) ? D : {};
  const et = isObj(D.et) ? D.et : null, out = [];
  const add = (p, mode, key, text, label, action, say) => out.push({ p, mode, key, text, say: plain(say || text), label: label || 'Do it', action: action || null });
  const late = et ? et.h >= 17 || (D.market && D.market.open === false && et.h >= 15) : false;

  // 1. money at risk first: the brain's ranked list (MFFU 7-day rule, the PC, the feed, the floor, the Planner, Kalshi)
  for (const x of arr(D.priorities).filter((y) => isObj(y) && num(y.p) != null && y.p <= 8).slice(0, 4)) {
    const app = str(x.app, 20), mode = app === 'planner' ? 'life' : app === 'kalshi' ? 'business' : 'trading';
    const act = /^quiet/.test(str(x.key, 20)) ? ask('Why no trade?') : app === 'zenith' ? ask('What should I do now?') : app ? open(app) : ask('What should I do now?');
    add(x.p, mode, 'pri:' + str(x.key, 60), str(x.text, 240), /^quiet/.test(str(x.key, 20)) ? 'Why no trade?' : app ? 'Open ' + (app === 'zenith' ? 'Zenith' : app[0].toUpperCase() + app.slice(1)) : 'What now?', act, x.speak);
  }
  // 2. the 7-day rule before it is urgent (days 3-4): a heads-up with the day it becomes a problem
  for (const qd of arr(D.quiet).filter((y) => isObj(y) && num(y.q) != null && y.q >= 3 && y.q < 5)) {
    add(6.5, 'trading', 'quiet-early:' + qd.key + qd.q, `${qd.name} has gone ${qd.q} days with no trade. If the bot finds no setup by day 6, place 1 MNQ keep-alive (MFFU closes at day 7).`,
      'Why no trade?', ask('Why no trade?'), `${qd.name} has gone ${qd.q} days with no trade. Watch the seven day rule.`);
  }
  // 3. eval risk: room to the floor under 40% (the brain's list already shouts under 25%)
  for (const a of arr(D.accounts).filter(isObj)) {
    const rf = num(a.room_frac);
    if (rf != null && rf >= 0.25 && rf < 0.4) add(4.5, 'trading', 'room:' + a.key, `${a.name} has ${usd(a.room)} of room left (${Math.round(rf * 100)}% of its drawdown). Let the bot size down; no manual trades until it is back above 40%.`, 'Room', ask('How much room is left?'));
    if (num(a.to_target) != null && a.to_target > 0 && a.to_target <= 600 && str(a.status, 20).toLowerCase() !== 'passed')
      add(5.8, 'business', 'near-pass:' + a.key, `${a.name} is ${usd(a.to_target)} from passing. Line up the next account now (MFFU Builder 50K $91.80, one-time) so there is no gap after the pass.`, 'Accounts plan', ask('Plan for more accounts'));
    if (str(a.status, 20).toLowerCase() === 'passed') add(5, 'business', 'passed:' + a.key, `${a.name} passed. Next: the funded step and the next eval; I can lay out the plan.`, 'Plan it', ask('Plan for more accounts'));
  }
  // 4. stale data: the bots' feed (when the market is closed: the brain's list keeps it as context) and the research apps' cards
  if (D.live && D.live.missing && !arr(D.priorities).some((x) => isObj(x) && x.key === 'nolive')) add(7, 'trading', 'live-missing', 'I cannot see the bots\' live feed from this phone. Check the signal, then the PC.', 'Open Zenith', open('zenith'));
  else if (D.live && D.live.stale && !arr(D.priorities).some((x) => isObj(x) && x.key === 'silent')) add(7, 'trading', 'live-stale', `The bots' numbers are from ${str(D.live.ago, 40) || 'a while ago'}: the PC may be off. Have it on before the next window.`, 'Open Zenith', open('zenith'));
  const cards = isObj(D.cards) ? D.cards : {};
  const staleApps = Object.keys(cards).filter((id) => isObj(cards[id]) && cards[id].stale && num(cards[id].age) != null && cards[id].age > 36 * 3600 && MODE_OF_APP[id] === 'research');
  if (staleApps.length) {
    const days = Math.round(Math.max(...staleApps.map((id) => cards[id].age)) / 86400);
    add(7.2, 'research', 'stale:' + staleApps.join(','), `${staleApps.map((id) => APP_NAME[id] || id).join(', ')} ${staleApps.length > 1 ? 'have' : 'has'} not updated in ${days} day${days === 1 ? '' : 's'}: the nightly run (CRONOS) may have failed. Check its status on GitHub Actions.`, 'Open ' + (APP_NAME[staleApps[0]] || staleApps[0]), open(staleApps[0]));
  }
  // 5. to-dos with deadlines (his Jarvis list) and reminders coming up
  if (et) {
    const due = arr(D.todos).filter(isObj).map((x) => ({ text: str(x.text, 160), dn: parseDeadline(x.text, et) })).filter((x) => x.dn != null).sort((a, b) => a.dn - b.dn);
    const over = due.filter((x) => x.dn < et.dn), soon = due.filter((x) => x.dn >= et.dn && x.dn <= et.dn + 1);
    if (over.length) add(5, 'business', 'todo-over:' + over.length, `Overdue on your list: ${over.slice(0, 2).map((x) => x.text).join('; ')}${over.length > 2 ? ` (+${over.length - 2})` : ''}. Do the first one today or move its deadline.`, 'My to-dos', ask('My to-dos'));
    if (soon.length) add(5.5, 'business', 'todo-soon:' + soon[0].text, `Due ${dayWord(soon[0].dn, et)}: ${soon[0].text}${soon.length > 1 ? ` (+${soon.length - 1} more)` : ''}. Block 30 minutes for it.`, 'Remind me', ask(`remind me in 1 hour to ${soon[0].text.replace(/\s*\b(by|due)\b.*$/i, '')}`));
    const nowMs = num(D.now) || Date.now();
    const rem = arr(D.reminders).filter((r) => isObj(r) && num(r.at) != null && r.at > nowMs && r.at - nowMs < 3 * 3600e3)[0];
    if (rem) add(6, 'life', 'rem:' + rem.text, `Coming up in ${Math.max(1, Math.round((rem.at - nowMs) / 60e3))} min: ${str(rem.text, 140)}.`, 'My reminders', ask('My reminders'));
    const open0 = arr(D.todos).filter(isObj).length - due.length;
    if (!due.length && open0 >= 3) add(8, 'business', 'todo-nodl', `${open0} to-dos on your list and none has a deadline. Give the top one a day ("by Friday") and I will chase it.`, 'My to-dos', ask('My to-dos'));
  }
  // 6. a research idea worth testing: the Mind's own proposals, else the research apps' newest finding
  const props = arr(D.mind && D.mind.proposals).filter((x) => isObj(x) && str(x.idea, 160) && !/^(done|rejected|adopted|closed)$/i.test(str(x.status, 20)));
  if (props.length) add(7.5, 'research', 'idea:' + str(props[0].idea, 60), `Worth testing: ${str(props[0].idea, 160)}${str(props[0].status, 20) ? ` (${str(props[0].status, 20)})` : ''}. Adopt it only if it holds in 2026 and 2021-25 with 2-4 trades a week.`, 'What did it learn?', ask('What did the bots learn?'));
  const finds = ['prometheus', 'datacity', 'tree', 'pantheon'].map((id) => [id, cards[id]]).filter((x) => isObj(x[1]) && !x[1].stale && arr(x[1].lines).length);
  if (finds.length) {
    const [id, c] = finds[0], line = str(arr(c.lines)[0], 160);
    add(props.length ? 8.2 : 7.6, 'research', 'find:' + id + ':' + line.slice(0, 40), `${APP_NAME[id] || id}: ${line}. Want it in your research log?`, 'Save to Obsidian', ask(`make a note called Research log: ${APP_NAME[id] || id}: ${line}`));
  }
  if (!props.length && !finds.length) add(9, 'research', 'idea-none', 'No new research finding in the feed. Pick one question for the week (one idea, one test, judged on 2026 and 2021-25) and I will keep it in Obsidian.', 'Note an idea', ask('make a note called Research ideas: idea to test this week'));
  // 7. tomorrow's plan (evening): the next window, the Mind's game plan, the Planner
  if (late && D.window) add(7.8, 'trading', 'tomorrow', `Tomorrow: ${str(D.window.text, 120)}. The Mind posts its game plan at 1:45 AM ET; have the PC and NinjaTrader on before then.`, "Tomorrow's plan", ask("What's on tomorrow?"));
  else if (D.window && D.window.open) add(8.5, 'trading', 'window', `${str(D.window.text, 120)}. Let the bot work; check back after the close.`, 'Status', ask('How are the bots?'));
  if (D.mind && str(D.mind.plan, 200)) add(8, 'trading', 'gameplan', `Game plan: ${str(D.mind.plan, 200)}`, 'What did it learn?', ask('What did the bots learn?'));
  // 7b. the bots right now (bots.js, via the brain's digest): a setup armed, a trade open, the window about to open, the daily loss close
  for (const x of arr(D.bots && D.bots.items).filter((y) => isObj(y) && num(y.p) != null && str(y.text, 300)))
    add(x.p, 'trading', str(x.key, 60) || 'bot', str(x.text, 300), str(x.label, 30), isObj(x.action) ? x.action : null, x.say);
  // 7c. KALSHI-BRAIN (kalshi-brain.js, via the brain's digest): the bot paused, a bet size too big for the bankroll, what to stop, the best edge, what the engine learned today
  for (const x of arr(D.kalshiBrain && D.kalshiBrain.items).filter((y) => isObj(y) && num(y.p) != null && str(y.text, 300)))
    add(x.p, 'business', str(x.key, 60) || 'kalshi', str(x.text, 300), str(x.label, 30), isObj(x.action) ? x.action : null, x.say);
  // /KALSHI-BRAIN
  // 8. business: the money goal, Kalshi's edge, more accounts
  if (D.money && str(D.money.next, 200)) add(7, 'business', 'goal', `Money goal, next step: ${str(D.money.next, 200)}`, 'Money goal', ask('How close am I to my money goal?'));
  const k = D.kalshi;
  if (isObj(k) && k.state === 'ok') {
    const st = arr(k.strategies).filter((s) => isObj(s) && num(s.pnl) != null).sort((a, b) => b.pnl - a.pnl);
    if (st.length >= 2 && st[st.length - 1].pnl < 0) add(6.8, 'business', 'kalshi-edge', `Kalshi: ${str(st[0].name, 40)} is the edge (${usd(st[0].pnl, true)}); ${str(st[st.length - 1].name, 40)} is losing (${usd(st[st.length - 1].pnl, true)}). Ask your kalshi-server chat to cut its size.`, 'Kalshi edge', ask('How is the Kalshi edge?'));
    else if (num(k.week_pnl) != null) add(8.8, 'business', 'kalshi-week', `Kalshi this week: ${usd(k.week_pnl, true)}.`, 'Open Kalshi', open('kalshi'));
  } else if (isObj(k) && k.state === 'waiting') add(9.2, 'business', 'kalshi-link', 'Kalshi is not linked to Jarvis yet: one step in your kalshi-server chat, then I can track its edge.', 'Open Kalshi', open('kalshi'));
  if (!out.some((x) => x.mode === 'business' && x.p < 9)) add(9, 'business', 'accounts', 'One business move this week: decide the next account (a second Builder 50K at $91.80 vs. waiting for the pass). I can run the numbers.', 'Plan it', ask('Plan for more accounts'));
  // 9. life: the day, Ascend
  if (D.plan && arr(D.plan.ev).length && !out.some((x) => /^pri:ev:/.test(x.key))) {
    const nx = arr(D.plan.ev).filter((e) => isObj(e) && !e.allDay && num(e.min) != null && et && e.min > et.min)[0];
    if (nx) add(7, 'life', 'ev:' + nx.title, `Next on your Planner: ${str(nx.title, 100)} at ${str(nx.start, 5)}.`, 'Open Planner', open('planner'));
  } else if (!D.plan) add(9.5, 'life', 'plan-missing', 'I cannot see your Planner on this phone yet: open it once so I can plan your day with you.', 'Open Planner', open('planner'));
  const ascend = arr(D.apps).find((a) => isObj(a) && a.id === 'ascend');
  if (ascend) add(et && et.h >= 19 ? 6.9 : 8.6, 'life', 'ascend', et && et.h >= 19 ? 'Before bed: log today in Ascend (routine, sleep, gym). Two minutes.' : 'Ascend: do today\'s routine and log it.', 'Open Ascend', open('ascend'));
  else add(9.4, 'life', 'ascend-add', 'Add your Ascend app to Jarvis (the + under the apps) and I will remind you to log it.', 'Add apps', ask('what apps do I have'));
  // 9b. the ChatGPT link (Bridge wizard): until it is 3/3 and he has never opened it, one gentle nudge
  if (isObj(D.bridge) && num(D.bridge.done) != null && D.bridge.done < 3 && !D.bridge.seen)
    add(8.4, 'business', 'bridge-setup', 'Connect ChatGPT to Olympus: 3 quick steps in the Bridge, about two minutes. Then ChatGPT can build icons and skies for you.', 'Open Bridge', open('bridge'), 'Connect ChatGPT to Olympus. It is three quick steps in the Bridge.');
  // 10. a key makes this smarter (only when nothing urgent is on)
  if (!D.smart) add(9.8, 'research', 'key', 'Give me a free AI key (one minute, no card) and these suggestions get smarter.', 'Set up', { type: 'control', value: 'ai_setup' });
  return out.sort((a, b) => a.p - b.p);
}

/** The list for one mode: the mode's own items, and anything urgent (p <= 2.5: money at risk) from any mode first. */
export function thinkFor(D, mode, n) {
  const id = MODES[mode] ? mode : 'auto', all = thinkAll(D), k = Math.max(1, Math.min(8, num(n) || 3));
  const urgent = all.filter((x) => x.p <= 2.5);
  const mine = id === 'auto' ? all : all.filter((x) => x.mode === id);
  const seen = new Set(), items = [];
  for (const x of urgent.concat(mine)) if (!seen.has(x.key) && items.length < k) { seen.add(x.key); items.push(x); }
  for (const x of all) if (!seen.has(x.key) && items.length < k && x.p < 9) { seen.add(x.key); items.push(x); }     // a short list: the next most useful
  if (!items.length) items.push({ p: 10, mode: id, key: 'calm', text: 'Nothing needs you right now. A good moment to plan the week.', say: 'Nothing needs you right now.', label: 'Brief me', action: ask('Brief me') });
  const head = id === 'auto' ? "Here's what I'd do:" : `Here's what I'd do (${MODES[id].name}):`;
  return { mode: id, items, text: head + '\n' + items.map((x, i) => `${i + 1}. ${x.text}`).join('\n'), say: plain("Here's what I'd do. " + items.map((x, i) => `${i ? (i === 1 ? 'Then: ' : 'Also: ') : ''}${x.say}`).join(' ')) };
}

// ------------------------------------------------------------------------------------------------ the modes' own questions
// The quick asks the other answers do not cover, answered from the same digest (no key needed). model: true = with a key the
// model answers, this is its fallback. null = not one of them.
const lines = (...a) => a.filter((x) => x != null && x !== '').join('\n');
export function answer(raw, D, nOpt) {
  const q = str(raw, 200).toLowerCase().replace(/[?.!]+$/g, '').trim();
  D = isObj(D) ? D : {};
  const accts = arr(D.accounts).filter(isObj), et = isObj(D.et) ? D.et : null;
  const R = (text, intent, model, sayText) => ({ text, speak: plain(sayText || text).slice(0, 420), intent, model: !!model });
  if (/^(?:am i at risk|risk check|what'?s my risk|how risky is it|any risk|eval risk|is my eval (?:safe|ok|at risk))$/.test(q)) {
    if (D.live && D.live.missing) return R('I cannot see the bots\' feed, so I cannot check the risk right now. Check the signal, then the PC.', 'mode_risk');
    const out = [];
    for (const a of accts) {
      const rf = num(a.room_frac);
      out.push(`${a.name}: ${usd(a.room)} of room${rf != null ? ` (${Math.round(rf * 100)}%)` : ''}${rf != null && rf < 0.25 ? ': close to the floor' : rf != null && rf < 0.4 ? ': getting thin' : ''}.`);
    }
    for (const x of arr(D.quiet).filter((y) => isObj(y) && y.q >= 5)) out.push(`${x.name}: day ${x.q} with no trade (MFFU closes at day 7).`);
    const hot = arr(D.priorities).filter((x) => isObj(x) && x.p <= 3)[0];
    const verdict = hot ? 'Yes, one thing: ' + str(hot.text, 200) : out.some((x) => /floor|thin|day [5-7]/.test(x)) ? 'Some: see below.' : 'No: nothing puts an eval at risk right now.';
    return R(lines(verdict, ...out, D.live && D.live.stale ? `(These numbers are from ${str(D.live.ago, 40) || 'a while ago'}.)` : ''), 'mode_risk', false, verdict);
  }
  if (/^(?:today'?s trading plan|(?:the |my )?trading plan(?: today| for today)?|what'?s the plan (?:for )?today|what is the plan (?:for )?today|plan for the bots|what'?s the plan for the bots)$/.test(q)) {
    const out = [str(D.window && D.window.text, 160) ? str(D.window.text, 160) + '.' : 'The entry window: unknown.'];
    if (D.mind && str(D.mind.plan, 200)) out.push('Game plan: ' + str(D.mind.plan, 200));
    if (D.mind && str(D.mind.regime, 80)) out.push('Regime: ' + str(D.mind.regime, 80) + '.');
    for (const x of arr(D.quiet).filter((y) => isObj(y) && y.q >= 5)) out.push(`${x.name} needs a trade: day ${x.q} of 7.`);
    out.push('The bot trades its rules by itself: 1 trade a day at most, flat by 3:55 PM. Your job: the PC and NinjaTrader on, no manual trades.');
    return R(lines(...out), 'mode_plan', false, out.slice(0, 2).join(' '));
  }
  if (/^(?:research findings|(?:the |any )?(?:new )?findings|what did (?:the )?research (?:find|show)|research update|(?:data city|prometheus|daphne|pantheon)(?: findings| results| update)?|a research idea worth testing|(?:a |any )?research ideas?(?: worth testing)?|what should i test(?: next)?|idea worth testing)$/.test(q)) {
    const only = /data city/.test(q) ? 'datacity' : /prometheus/.test(q) ? 'prometheus' : /daphne/.test(q) ? 'tree' : /pantheon/.test(q) ? 'pantheon' : '';
    const cards = isObj(D.cards) ? D.cards : {}, out = [];
    for (const id of only ? [only] : ['prometheus', 'datacity', 'tree', 'pantheon', 'mind']) {
      const c = cards[id];
      if (!isObj(c)) { if (only) out.push(`${APP_NAME[id] || id}: no card on this phone yet (open it once).`); continue; }
      const head = c.status && isObj(c.status) ? str(c.status.label, 40) : '', ls = arr(c.lines).slice(0, 2).map((l) => str(l, 160)).filter(Boolean);
      const old = c.stale && num(c.age) != null ? ` (not updated for ${Math.round(c.age / 3600)} h)` : '';
      out.push(`${APP_NAME[id] || id}${head ? ' · ' + head : ''}${old}: ${ls.join(' ') || 'no lines on its card.'}`);
    }
    const props = arr(D.mind && D.mind.proposals).filter((x) => isObj(x) && str(x.idea, 160));
    if (!only) for (const x of props.slice(0, 2)) out.push(`The Mind wants to test: ${str(x.idea, 160)}${str(x.status, 20) ? ` (${str(x.status, 20)})` : ''}.`);
    if (!out.length) out.push('No research cards or Mind ideas on this phone yet: open Data City, Prometheus or the Mind once and I will read them.');
    out.push('The bar for any idea: better in 2026 and in 2021-25, 2-4 trades a week, the MFFU eval numbers. Say "make a note called Research log: ..." to keep one.');
    return R(lines(...out), 'mode_research', /idea|test/.test(q), out[0]);
  }
  if (/^(?:(?:a |the |my )?plan for more accounts|more accounts(?: plan)?|accounts plan|should i (?:buy|get) (?:another|a new|more) (?:eval|account)s?|next account)$/.test(q)) {
    const out = [];
    for (const a of accts) {
      const st = str(a.status, 20).toLowerCase();
      out.push(`${a.name}: ${st === 'passed' ? 'passed' : num(a.to_target) != null ? usd(a.to_target) + ' to pass' : 'progress missing'}${num(a.room_frac) != null ? `, ${Math.round(a.room_frac * 100)}% of its room left` : ''}.`);
    }
    const near = accts.filter((a) => num(a.to_target) != null && a.to_target <= 600);
    out.push(near.length ? `Next: ${near[0].name} is close, so line up the next Builder 50K ($91.80, one-time, $0 activation) for the day it passes.` : 'Next: let the open evals pass first; a new account only adds cost while none is close (Builder 50K $91.80, Builder 25K $63).');
    out.push('Rule of thumb: one new eval per pass, never more accounts than you can watch; the 7-day rule applies to each one.');
    return R(lines(...out), 'mode_accounts', true, out[out.length - 2]);
  }
  if (/^(?:my )?to ?-?dos? with deadlines$|^(?:my )?deadlines$|^what'?s due(?: soon| this week)?$/.test(q)) {
    if (!et) return null;
    const t = arr(D.todos).filter(isObj).map((x) => ({ text: str(x.text, 160), dn: parseDeadline(x.text, et) }));
    const due = t.filter((x) => x.dn != null).sort((a, b) => a.dn - b.dn), none = t.length - due.length;
    if (!t.length) return R('Your Jarvis list is empty. Say "add send the invoice by friday to my list" and I will chase the deadline.', 'mode_deadlines');
    const out = due.slice(0, 8).map((x) => `• ${x.text} — ${x.dn < et.dn ? 'OVERDUE (' + dayWord(x.dn, et) + ')' : 'due ' + dayWord(x.dn, et)}`);
    if (none) out.push(`${none} more without a deadline: add "by <day>" to give them one.`);
    return R(lines(due.length ? `Deadlines (${due.length}):` : 'No deadlines on your list yet.', ...out), 'mode_deadlines', false, due.length ? `${due.length} with a deadline. First: ${due[0].text}, ${due[0].dn < et.dn ? 'overdue' : 'due ' + dayWord(due[0].dn, et)}.` : 'No deadlines on your list yet.');
  }
  return null;
}

// ------------------------------------------------------------------------------------------------ the instance
const SLOTS = [{ id: 'morning', min: 7 * 60 + 30 }, { id: 'midday', min: 12 * 60 }, { id: 'close', min: 16 * 60 + 15 }, { id: 'evening', min: 21 * 60 }];
export function createModes(opts) {
  const o = isObj(opts) ? opts : {};
  const store = () => { if (o.storage) return o.storage; try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (_) { return null; } };
  const lget = (k) => { try { const st = store(); return st ? st.getItem(k) : null; } catch (_) { return null; } };
  const lset = (k, v) => { try { const st = store(); if (st) st.setItem(k, v); } catch (_) { /* not kept */ } };
  let cur = lget(MODE_KEY);
  if (!MODES[cur]) cur = 'auto';
  const listeners = [];
  const cardsOf = (ids) => { if (typeof o.cards !== 'function') return {}; try { const c = o.cards(ids); return isObj(c) ? c : {}; } catch (_) { return {}; } };
  function set(id) {
    const m = MODES[id] ? id : 'auto';
    if (m !== cur) { cur = m; lset(MODE_KEY, m); for (const f of listeners) { try { f(m); } catch (_) { /* a listener's own problem */ } } }
    return cur;
  }
  function greeting(id, D) {
    const m = MODES[id] || MODES.auto, h = isObj(D) && isObj(D.et) ? D.et.h : new Date().getHours();
    const hi = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    if (m.id === 'auto') return `${hi}. Auto mode: I pick trading, research, business or life from what you ask.`;
    const lines = {
      trading: `${hi}. Trading mode: I am watching the bots, the eval room and the 7-day rule.`,
      research: `${hi}. Research mode: Data City, Prometheus and the Mind are open to me, and I can save notes to Obsidian.`,
      business: `${hi}. Business mode: money goals, more accounts, the Kalshi edge and your deadlines.`,
      life: `${hi}. Life mode: your Planner, reminders and Ascend.`,
    };
    return lines[m.id];
  }
  function think(D, id, n) {
    const d = isObj(D) ? { ...D } : {};
    const want = ['datacity', 'prometheus', 'tree', 'pantheon', 'mind', 'fates', 'hermes'];
    if (!isObj(d.cards)) d.cards = cardsOf(want);
    return thinkFor(d, id || cur, n);
  }
  function slotKey(D) { const e = isObj(D) && isObj(D.et) ? D.et : null; return e ? `${e.y}-${e.mo}-${e.d}` : ''; }
  function dueSlot(D) {
    const e = isObj(D) && isObj(D.et) ? D.et : null;
    if (!e) return null;
    let done = {};
    try { done = JSON.parse(lget(SLOT_KEY) || '{}'); } catch (_) { done = {}; }
    const got = isObj(done) && Array.isArray(done[slotKey(D)]) ? done[slotKey(D)] : [];
    const s = SLOTS.filter((x) => e.min >= x.min && e.min < x.min + 120 && got.indexOf(x.id) < 0).pop();
    return s ? s.id : null;
  }
  function markSlot(D, id) {
    const k = slotKey(D);
    if (!k) return;
    let done = {};
    try { done = JSON.parse(lget(SLOT_KEY) || '{}'); } catch (_) { done = {}; }
    const keep = {}; keep[k] = (isObj(done) && Array.isArray(done[k]) ? done[k] : []).concat([id]);
    lset(SLOT_KEY, JSON.stringify(keep));
  }
  return {
    get mode() { return cur; }, set, ids: MODE_IDS.slice(), list: () => MODE_IDS.map((id) => ({ id, name: MODES[id].name, glyph: MODES[id].glyph, blurb: MODES[id].blurb })),
    effective: (q) => (cur !== 'auto' ? cur : pickMode(q) || 'auto'),
    parseSwitch, pickMode, orderTools, parseDeadline,
    answer: (raw, D) => { const d = isObj(D) ? { ...D } : {}; if (!isObj(d.cards)) d.cards = cardsOf(['datacity', 'prometheus', 'tree', 'pantheon', 'mind']); return answer(raw, d); },
    prompt: (id) => (MODES[id] || MODES.auto).prompt, quick: (id) => (MODES[id || cur] || MODES.auto).quick.slice(), apps: (id) => (MODES[id || cur] || MODES.auto).apps.slice(),
    name: (id) => (MODES[id || cur] || MODES.auto).name, greeting, think, dueSlot, markSlot, cards: cardsOf,
    onChange(f) { if (typeof f === 'function') listeners.push(f); },
  };
}
export default createModes;
