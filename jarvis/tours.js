// Jarvis guided tours (2026-11-11, JARVIS BRAIN v3): "show me around", "tour Athens", "tour the money machines".
// A tour is a short list of stops: { title, text (one sentence), open (an app id), route? }. The Jarvis home can render the list
// (JARVIS_API.tours()) and the brain walks it by voice ("next", "back", "stop the tour"). The sentence for a stop is the app's own
// purpose line from the apps list when there is one, so a tour never describes an app differently from the launcher.
// No DOM, no network, no state. iPhone Safari 16: plain ES2020.
//
//   import { tours, findTour, tourAsk } from './tours.js';
//   tours(apps)                 -> [{ id, title, about, steps: [{ n, title, text, open, route }] }]
//   tourAsk('tour the money machines')  -> 'money' | null

import { norm } from './router.js';

// [app id, route, the sentence when the apps list has no purpose line, an optional fixed title]
const DEFS = [
  { id: 'olympus', title: 'OLYMPUS in seven stops', about: 'The short way round: where the bots are, what needs you, and where everything else lives.', say: 'around|olympus|everything|the site|the apps|the whole thing|the dashboard|all of it|me around',
    steps: [['zenith', '', 'The bots: Zlarior, ATLAS and BLITZ, live.'], ['helios', '', 'The morning briefing: today, drawdown, deals and the plan.'], ['compass', '', 'The next best action: at most five things.'], ['atlas', '', 'The map of every app, in five districts.'], ['archive', '', 'Everything we ever tested, searchable.'], ['mint', '', 'The money machines, paper only.'], ['settings', '', 'Look, sound, voice and your data.']] },
  { id: 'athens', title: 'A walk through Athens', about: 'The city that shows your own numbers as buildings. Read only: scenery, never an order.', say: 'athens|the city|city|cities|metropolis',
    steps: [['cities', '', 'The world of city islands: the way in.'], ['cities', '#athens', 'Athens itself: the monuments are built from your published numbers.', 'Athens'], ['stoa', '', 'The colonnade: what needs you, by the same rules Athens uses.'], ['kalshicity', '', 'The night city of the Kalshi bot.'], ['mintcity', '', 'The city of the money machines.'], ['atlas', '', 'Back to the map of every app.']] },
  { id: 'money', title: 'The money machines', about: 'Five paper streams that read public data. Estimates, never promises; nothing here trades.', say: 'money|money machines|money machine|the mint|mint|streams|money streams|side income|five streams|machines',
    steps: [['mint', '', 'All the streams on one page.'], ['mercury', '', 'Prop-firm deals and rule changes.'], ['sibyl', '', 'Prediction-market edges, on paper.'], ['chrysos', '', 'The fleet planner: fees against payouts.'], ['oikos', '', 'The household: where money leaks.'], ['arbiter', '', 'Spreads and funding rates, on paper.'], ['mintcity', '', 'The same streams as a city.']] },
  { id: 'trading', title: 'The trading day', about: 'From the plan to the replay: the apps you use around a session.', say: 'trading|the trading day|market|the market|trading apps|market district|bots|the bots',
    steps: [['helios', '', 'Start here: the morning briefing.'], ['pythia', '', 'The risk calendar: what is scheduled.'], ['ares', '', 'GO, WAIT or HALT.'], ['zenith', '', 'The bots, live.'], ['odeon', '', 'Every trade, replayed.'], ['journal', '', 'Rate the trade in the journal.'], ['kronos', '', 'The calendar of money: daily P&L.']] },
  { id: 'research', title: 'The research library', about: 'What was tested, what was adopted and what was rejected, in plain words.', say: 'research|the research|library|the library|archive|studies|tests|research district',
    steps: [['archive', '', 'Everything we ever tested, searchable.'], ['clio', '', 'Every study in plain words.'], ['prometheus', '', 'The forge: strategies tested.'], ['datacity', '', 'Every combo tested, as a city.'], ['observatory', '', 'Data health and the evidence.'], ['athena', '', 'The strategy itself, in plain language.']] },
  { id: 'kalshi', title: 'The Kalshi side', about: 'The prediction-market bot and what its ledger says. Suggestions only.', say: 'kalshi|the kalshi bot|kalshi city|prediction markets|bets',
    steps: [['kalshi', '', 'The Kalshi bot\'s dashboard.'], ['kalshicity', '', 'Its edges as a night city.'], ['dionysus', '', 'The Kalshi desk and guard.'], ['tyche', '', 'The fortune wheel.'], ['sibyl', '', 'Paper edges worth a look.']] },
  { id: 'life', title: 'Plan and learn', about: 'The apps for the day, the rules and the habit of reviewing.', say: 'life|plan and learn|life district|personal|planner|learning|school',
    steps: [['hestia', '', 'Today at home.'], ['planner', '', 'The day and the week.'], ['lyceum', '', 'The daily quiz on your rules.'], ['journal', '', 'The trade journal.'], ['apollo', '', 'The weekly review: one rule.'], ['arena', '', 'Ranks and XP.']] },
];
const clipS = (s, n) => { const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).replace(/[\s,;:]+$/, '') + '…' : t; };
const sentence = (s) => { const t = clipS(s, 110); return t ? (/[.!?…]$/.test(t) ? t : t + '.') : ''; };

/** every tour, with its stops. apps: [{ id, name, purpose }] (optional: names and sentences come from it; unknown apps are dropped) */
export function tours(apps) {
  const list = Array.isArray(apps) ? apps.filter((a) => a && a.id) : [], by = new Map(list.map((a) => [a.id, a]));
  return DEFS.map((d) => {
    const steps = [];
    for (const [id, route, fallback, fixed] of d.steps) {
      if (list.length && !by.has(id)) continue;                         // an app that is not installed is not a stop
      const a = by.get(id) || {}, name = fixed || a.name || id.charAt(0).toUpperCase() + id.slice(1);
      steps.push({ n: steps.length + 1, title: name, text: sentence(route || fixed ? fallback : (a.purpose || a.sub || fallback)), open: id, route: route || '' });
    }
    return { id: d.id, title: d.title, about: d.about, steps };
  }).filter((t) => t.steps.length >= 2);
}
export const findTour = (id, apps) => tours(apps).find((t) => t.id === id) || null;

const ASK = /^(?:please |pls |jarvis |hey jarvis |can you |could you |i want (?:a |to )?|i'd like (?:a |to )?|let's |lets |start |begin |take |do |run |give me |open )*(?:(?:a |the |me (?:on )?a |me (?:on )?the )?(?:guided |quick |short |grand |full )?tour(?: me)?(?: of| around| through| on| for| in)?|show me around|show me round|walk me through|walk me around|take me around|take me round|show me about|give me the tour of|guide me through|guide me around)\s*(.*)$/;
/** is this a request for a tour? -> the tour id (default 'olympus') or null */
export function tourAsk(raw) {
  const q = norm(raw).replace(/[?!.]+$/g, '').trim();
  if (!q) return null;
  if (/^(?:show me around|show me round|give me a tour|give me the tour|take the tour|start the tour|the tour|tour|a tour|guided tour|take me on a tour|what is here|whats here|what can i see here|where do i start here|i am new here|im new here|i'm new here|how does this place work)$/.test(q)) return 'olympus';
  const m = q.match(ASK);
  if (!m) return null;
  const rest = m[1].replace(/^(?:the|my|our|a|of|around|through)\s+/, '').replace(/\s+(?:please|pls|apps?|district|tour)$/, '').trim();
  if (!rest) return 'olympus';
  for (const d of DEFS) if (d.say.split('|').some((w) => rest === w || rest === 'the ' + w || (' ' + rest + ' ').indexOf(' ' + w + ' ') >= 0)) return d.id;
  return null;
}
/** the reply text for a tour (the whole list), and for one stop */
export function tourText(t) { return `${t.title}. ${t.about}\n` + t.steps.map((s) => `${s.n}. ${s.title}: ${s.text}`).join('\n') + '\nSay "next" and I open stop 1, "stop the tour" to end it.'; }
export function stopText(t, i) { const s = t.steps[i]; return `Stop ${s.n} of ${t.steps.length}: ${s.title}. ${s.text}` + (i + 1 < t.steps.length ? ' Say "next" to go on.' : ' That was the last stop.'); }
export default tours;
