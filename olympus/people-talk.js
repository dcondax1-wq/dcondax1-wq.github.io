// PEOPLE OF OLYMPUS, the talk engine (pure, node-tested): an offline conversation with one person, grounded in that person's facts.
//   intentOf(text, person, mem)            which question this is (typos and synonyms forgiven, follow-ups through a short memory)
//   answer(person, facts, text, mem, env)  -> { text, sources, actions, followups, intent, open, mem }   (open = true: nothing matched, a connected model may try)
//   greeting / standupLine / standup / roundTable / debate / corpus / ungrounded (the check: every number in an answer exists in the facts)
// The temperament (calm / blunt / curious / wry) only changes the wording around the facts; the fact sentences are the same for everyone.
// A person cannot place orders, change files, predict prices or tell secrets, and says so in character. Safari 16 safe.
import { clean, arr, isObj, num, dayOf, toMs, STATUS_WORD, H } from './people-core.js';

const FIX = { u: 'you', ur: 'your', r: 'are', wat: 'what', wut: 'what', whats: 'what', wats: 'what', doin: 'doing', yday: 'yesterday', yesturday: 'yesterday', tmrw: 'tomorrow', tommorow: 'tomorrow', pls: 'please', plz: 'please', thx: 'thanks', ty: 'thanks',
  ok: 'okay', alrite: 'alright',
  learnt: 'learned', lern: 'learn', hows: 'how', whos: 'who', wheres: 'where', im: 'i', ive: 'i', dont: 'not', cant: 'cannot', gimme: 'give', lemme: 'let', wanna: 'want', gonna: 'going', bout: 'about', nr: 'number', num: 'number', nums: 'numbers', stats: 'numbers', figures: 'numbers',
  results: 'result', findings: 'find', finds: 'find', found: 'find', discovered: 'find', discover: 'find', lessons: 'learned', lesson: 'learned', takeaways: 'learned', takeaway: 'learned', learn: 'learned', failed: 'fail', failure: 'fail', failing: 'fail', fails: 'fail', broke: 'fail', broken: 'fail', errors: 'error',
  blocked: 'stuck', blocker: 'stuck', blockers: 'stuck', blocking: 'stuck', colleagues: 'team', coworkers: 'team', teammates: 'team', friends: 'team', neighbours: 'team', neighbors: 'team', surprising: 'surprise', interesting: 'surprise', confident: 'sure', confidence: 'sure', certain: 'sure',
  latest: 'last', newest: 'last', recent: 'last', previous: 'last', simply: 'simple', simpler: 'simple', plainly: 'simple', eli5: 'simple', profit: 'money', profits: 'money', pnl: 'money', earnings: 'money', earn: 'money', earned: 'money', dollars: 'money', cash: 'money', income: 'money',
  risks: 'risk', risky: 'risk', downside: 'risk', danger: 'risk', dangerous: 'risk', hello: 'hi', hey: 'hi', hiya: 'hi', yo: 'hi', kalimera: 'hi', yassou: 'hi', greetings: 'hi', thank: 'thanks', cheers: 'thanks', goodbye: 'bye', cya: 'bye', later: 'bye',
  working: 'doing', busy: 'doing', status: 'doing', update: 'doing', updates: 'doing', news: 'new', feeling: 'feel', trades: 'trade', orders: 'order', bets: 'bet', picks: 'pick', deals: 'pick', ideas: 'idea', commits: 'commit', apps: 'app', questions: 'ask', question: 'ask' };
const STOP = new Set(['a', 'an', 'the', 'to', 'of', 'is', 'are', 'am', 'was', 'were', 'be', 'so', 'then', 'just', 'well', 'hmm', 'um']);
export function tokens(text) {
  const raw = String(text == null ? '' : text).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9$%]+/g, ' ').trim().split(' ').filter(Boolean);
  return raw.map((w) => FIX[w] || w).map((w) => FIX[w] || w).filter((w) => !STOP.has(w));
}
function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = [], cur = [];
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) { const c = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); cur[j] = c; if (c < best) best = c; }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
const near = (tok, w) => tok === w || (tok[0] === w[0] && ((w.length >= 5 && tok.length >= 4) || (w.length === 4 && tok.length === 5)) && lev(tok, w, w.length >= 9 ? 2 : 1) <= (w.length >= 9 ? 2 : 1));
const has = (toks, w) => toks.some((t) => near(t, w));

// id, patterns ("word word|alt": every word must be there), kinds it belongs to (none = everyone), priority
const I = (id, pats, kinds, pri) => ({ id, pats: pats.map((p) => p.split(' ').map((w) => w.split('|'))), kinds: kinds || null, pri: pri || 0 });
export const INTENTS = [
  I('order', ['place order|trade|bet', 'buy it|this|that|now|for', 'sell it|this|that|now|for', 'go live', 'arm live|trading|it|bot', 'execute', 'enter trade|position|long|short', 'open position|long|short', 'close position|trade', 'take trade', 'make trade|bet', 'put money', 'send order', 'real order|money', 'trade for me', 'short it', 'long it'], null, 40),
  I('secret', ['password', 'api key', 'token', 'secret', 'login', 'credentials'], null, 40),
  I('forecast', ['will price|market|nq|it|we go|rise|fall|win|pass', 'predict', 'prediction tomorrow|price|market', 'forecast', 'guarantee', 'promise', 'going up|down', 'where market|price|nq going|headed', 'tomorrow up|down|price'], null, 30),
  I('do', ['can you change|fix|delete|restart|run|deploy|merge|push|turn|switch|stop|pause|start|edit|add|remove|build|make|write', 'please change|fix|delete|restart|run|deploy|merge|push|turn|switch|stop|pause|start|edit|add|remove|build|make|write', 'i want you', 'restart', 'deploy'], null, 20),
  I('request', ['leave request|note|message', 'remind', 'tell claude|lead|him', 'note for', 'request'], null, 12),
  I('greet', ['hi', 'good morning|evening|afternoon|day|night'], null, -5),
  I('who', ['who you', 'your name', 'introduce', 'what you do', 'your job|role|work|task', 'about yourself|you'], null, -2),
  I('name', ['name mean|means|meaning', 'why called|named', 'greek name'], null, 6),
  I('doing', ['what doing', 'what up', 'doing now', 'right now', 'what happening', 'currently', 'doing', 'how going|it'], null, -1),
  I('found', ['what find', 'find anything', 'anything good|new|worth', 'what pick', 'any pick|find|result|idea', 'show find|pick', 'what have|got'], null, 0),
  I('learned', ['what learned', 'learned', 'what know now', 'teach me'], null, 0),
  I('failed', ['why fail', 'what wrong', 'went wrong', 'fail', 'error', 'mistake|mistakes', 'what happened', 'why lose|lost|loss|red|down|rejected', 'why not work|working'], null, 1),
  I('stuck', ['stuck', 'anything stopping|wrong', 'any problem|problems|trouble|issue|issues', 'you okay|alright|fine', 'who stuck'], null, 2),
  I('need', ['what need', 'need from me', 'need anything|help|something', 'can i help', 'how help', 'what should i do', 'what can i do', 'what want from me'], null, 3),
  I('last', ['last result|output|run|thing|one|trade|find|pick|commit|job', 'show last', 'show result', 'most last'], null, 2),
  I('simple', ['explain simple', 'simple', 'plain words|english', 'like five|child|kid', 'not understand', 'explain', 'what does that mean', 'in short', 'short version'], null, 1),
  I('next', ['what next', 'do next', 'next step|steps|move', 'your plan', 'what plan', 'what tomorrow', 'what would you do', 'what you suggest|recommend|advise', 'suggest', 'recommend', 'advice', 'what should'], null, 0),
  I('sure', ['how sure', 'sure', 'trust', 'reliable', 'how accurate|honest|good|solid|real', 'can believe', 'is real|true|legit', 'proof'], null, 1),
  I('changed', ['what changed', 'changed since|yesterday|today', 'since yesterday', 'what new', 'anything new', 'any new', 'new today'], null, 3),
  I('compare', ['compare', 'last week', 'this week', 'better worse', 'versus|vs', 'trend', 'improving', 'week'], null, 1),
  I('team', ['who work with', 'work with', 'team', 'who else', 'who help|helps', 'who know'], null, 1),
  I('built', ['how built|made|work|works|coded', 'what you made', 'your code|files|file|data|source', 'where live|from', 'how do you know', 'what read', 'under hood'], null, 1),
  I('surprise', ['surprise', 'fun fact', 'something cool|odd|strange|weird|funny', 'did not expect', 'tell me something'], null, 1),
  I('good', ['good new', 'best new', 'good part|thing|first', 'what went well', 'any win|wins', 'cheer me'], null, 4),
  I('bad', ['bad new', 'worst new', 'bad part|thing|first', 'worst', 'hard truth', 'honest'], null, 4),
  I('number', ['give number', 'a number', 'key number', 'numbers', 'how many', 'one number', 'show number', 'your number', 'score'], null, 1),
  I('money', ['how much', 'money', 'what worth', 'how much make|made|month'], null, 1),
  I('risk', ['risk', 'what could go wrong', 'could wrong', 'worst case', 'what if fail', 'catch', 'how safe', 'safe'], null, 2),
  I('when', ['when last|run|update|updated', 'how old|fresh|stale', 'what time|date', 'how long ago', 'up date', 'when'], null, 2),
  I('yesterday', ['how yesterday', 'yesterday', 'how today', 'how did it go', 'how was day|night|session|today', 'recap', 'summary', 'report', 'stand up|standup'], null, 1),
  I('mood', ['how you', 'how feel', 'you happy|sad|proud|tired|worried', 'your mood', 'how you today'], null, -4),
  I('help', ['what ask', 'what can you tell|say|answer', 'help', 'what can you do', 'options', 'menu', 'what else'], null, 2),
  I('sources', ['where that from', 'your source|sources', 'which file|files', 'show file|source', 'where come from', 'how do you know that'], null, 3),
  I('open', ['open your|work|app|page|it', 'show your work|app|page', 'take me', 'go to', 'see your work|app|page'], null, 3),
  I('owner', ['remember me', 'who am i', 'what did i ask', 'last time', 'do you know me', 'my last ask'], null, 4),
  I('more', ['more', 'go on', 'another', 'next one', 'and', 'continue', 'keep going', 'what else there', 'tell more'], null, -3),
  I('repeat', ['say again', 'repeat', 'pardon', 'once more', 'come again'], null, 5),
  I('joke', ['joke', 'make laugh', 'funny'], null, 0),
  I('thanks', ['thanks', 'good job', 'well done', 'nice work', 'great'], null, -4),
  I('bye', ['bye', 'good night', 'see you', 'that all'], null, -4),
  // by kind
  I('top', ['top pick', 'best pick|idea|find|one|deal', 'your favourite|favorite', 'which one', 'what buy|pick'], ['scanner'], 6),
  I('expire', ['expire|expires|expiry', 'deadline', 'end|ends|ending', 'how long left', 'until when'], ['scanner'], 6),
  I('drawdown', ['drawdown', 'room', 'how much lose', 'max loss', 'how close limit', 'cushion'], ['bot'], 6),
  I('target', ['target', 'how far', 'pass eval', 'eval', 'when pass'], ['bot'], 5),
  I('position', ['in trade', 'position', 'open trade', 'you long|short|flat'], ['bot'], 6),
  I('rules', ['your rules|strategy|setup|method|edge', 'how trade', 'how do you trade', 'what strategy'], ['bot'], 6),
  I('old', ['2021', 'earlier years', 'five years', 'before 2026', 'out sample', 'hold up', 'other years', 'long run', 'history'], ['champion'], 6),
  I('pass', ['pass', 'eval', 'odds', 'two weeks', 'ten sessions'], ['champion'], 5),
  I('verdict', ['why adopted|rejected|champion|here', 'verdict', 'adopted', 'rejected', 'are you live'], ['champion'], 6),
  I('commit', ['commit', 'pushed', 'shipped', 'what built|ship|shipped|finished', 'done yet', 'finished'], ['builder'], 6),
  I('branch', ['branch', 'where your work', 'merged', 'merge'], ['builder'], 6),
  I('apps', ['which app', 'your app', 'district', 'what keep|guard', 'your people'], ['keeper', 'villager'], 6),
  I('attention', ['need look', 'which fail|red|stale|old', 'what attention', 'where look', 'what check'], ['keeper', 'villager'], 7),
  I('tested', ['how many idea|tested|candidates|jobs|tasks', 'tested', 'idea'], ['mind'], 5),
];
const BY_ID = {}; for (const x of INTENTS) BY_ID[x.id] = x;
const IMPERATIVE = new Set(['change', 'fix', 'delete', 'restart', 'deploy', 'merge', 'push', 'edit', 'remove', 'stop', 'pause', 'start', 'build', 'write', 'add', 'turn', 'switch', 'run']);

/** { id, score }: the best matching question; 'fallback' when nothing fits */
export function intentOf(text, person, mem) {
  const toks = tokens(text), kind = person && person.kind;
  if (!toks.length) return { id: 'fallback', score: 0 };
  let best = { id: 'fallback', score: 0 };
  for (const it of INTENTS) {
    if (it.kinds && it.kinds.indexOf(kind) < 0) continue;
    for (const pat of it.pats) {
      if (pat.every((alts) => alts.some((w) => has(toks, w)))) {
        const exact = pat.every((alts) => alts.some((w) => toks.indexOf(w) >= 0));
        const s = pat.length * 10 + it.pri + (exact ? 1.5 : 0) + (it.kinds ? 12 : 0);
        if (s > best.score) best = { id: it.id, score: s };
      }
    }
  }
  if (IMPERATIVE.has(toks[0]) && best.score < 26 && ['order', 'secret'].indexOf(best.id) < 0) best = { id: 'do', score: 26 };
  if (best.id === 'greet' && toks.length > 3) { const other = intentOf(toks.filter((t) => t !== 'hi' && t !== 'good' && t !== 'morning' && t !== 'evening' && t !== 'afternoon').join(' '), person, mem); if (other.id !== 'fallback') best = other; }
  if (best.id === 'fallback' && toks.length <= 2 && has(toks, 'why')) best = { id: 'why', score: 5 };
  if (best.id === 'fallback' && toks.length <= 3 && (has(toks, 'really') || has(toks, 'huh') || has(toks, 'oh')) && mem && mem.last) best = { id: 'more', score: 4 };
  return best;
}

// ------------------------------------------------------------------------------------------------ wording by temperament (never a fact, never a number)
const W = {
  calm: { hi: 'Good {tod}.', none: 'I don\'t have that.', good: 'The good part first.', bad: 'The hard part first.', also: 'Also:', done: 'That is all I have on that.', thanks: 'Gladly.', bye: 'Go well.', sure: 'Honestly:', idk: 'I only know what my own files say.', yes: 'Yes.', no: 'No.',
    joke: 'I count slowly so that I only have to count once. That is the whole joke.', mood: { calm: 'I am steady today.', proud: 'I am quietly pleased today.', busy: 'I am busy, in a good way.', worried: 'I am a little uneasy today.', sheepish: 'I am a bit humbled today.' } },
  blunt: { hi: '{Tod}.', none: 'Don\'t have that.', good: 'Good news:', bad: 'Bad news:', also: 'And:', done: 'Nothing more on that.', thanks: 'Fine.', bye: 'Right. Back to work.', sure: 'Straight answer:', idk: 'I say what my files say. Nothing else.', yes: 'Yes.', no: 'No.',
    joke: 'I don\'t do jokes. I do numbers, and some of them are funny enough.', mood: { calm: 'All fine here.', proud: 'It worked, and I am glad.', busy: 'I am busy.', worried: 'I am not happy today.', sheepish: 'It is not my best day.' } },
  curious: { hi: 'Oh, hello! Good {tod}.', none: 'Hm, I don\'t have that.', good: 'Ooh, the good part:', bad: 'The awkward part, since you ask:', also: 'And look:', done: 'That is everything I have on that, I checked twice.', thanks: 'Any time, I like questions.', bye: 'Come back with more questions!',
    sure: 'Good question. Honestly:', idk: 'I only know what is in my own files, and I wish I knew more.', yes: 'Yes!', no: 'No, actually.',
    joke: 'Why did the scroll go to the agora? To get a second opinion. I am still working on my material.', mood: { calm: 'I am content, and wondering about things.', proud: 'I am delighted, honestly.', busy: 'I am happily buried in work.', worried: 'I am puzzled, and a bit worried.', sheepish: 'I am embarrassed, but I learned something.' } },
  wry: { hi: 'Ah, there you are. Good {tod}.', none: 'That I don\'t have, sadly.', good: 'The good news, such as it is:', bad: 'The bad news, since you insist:', also: 'Oh, and:', done: 'And that is the bottom of the amphora.', thanks: 'I live to serve. Figuratively.', bye: 'Off you go. I will be here, obviously.',
    sure: 'Between us:', idk: 'I know what my files know, which keeps me humble.', yes: 'Indeed.', no: 'Not this time.',
    joke: 'A backtest walks into a bar. It had already been there, and it knew exactly how the evening ended.', mood: { calm: 'I am unbothered, as ever.', proud: 'I am smug today, within reason.', busy: 'I am swamped, thanks for asking.', worried: 'I am mildly alarmed today.', sheepish: 'It was not my day; let us not dwell on it.' } },
};
const SIMPLE = {
  'bot:kalshi': 'Simply: I place practice bets on yes-or-no questions and keep score. No real money moves because of me.',
  'job:cronos': 'Simply: I am the night clock. I start the nightly jobs and note which ones worked.',
  'job:queue': 'Simply: I keep the to-do list of this project and the list of ideas that were tried and dropped.',
  'job:prometheus': 'Simply: I try many settings on the first half of the year and see whether any still works on the second half.',
  'job:hephaestus': 'Simply: I am the shelf where every tested setting and its result is kept.',
  scanner: 'Simply: I read public information and write down ideas that could save or make money. I never spend anything; you decide.',
  bot: 'Simply: I follow one written plan on a practice account. I wait for my setup, take one trade, and stop. No real money moves because of me.',
  mind: 'Simply: I look at what already happened and write down what I notice. I suggest; people decide.',
  builder: 'Simply: I am one of the workers who writes the pages and tools you see here. My work waits on a side branch until the lead checks it.',
  keeper: 'Simply: I watch over a group of pages and tell you which ones are fine and which ones need you.',
  champion: 'Simply: I am one stored test of a trading idea on old data. I show what would have happened, not what will.',
  villager: 'Simply: I live in one app and read you its own status card.' };
const BUILT = {
  'bot:kalshi': 'Behind me is the paper bot that publishes a small feed file. I read that file to you; I am not the bot itself.',
  'job:queue': 'I read the task list and the write-ups index that the Ergasterion build makes from the repo.',
  scanner: 'Behind me is a small Python script in tools/money. It reads public data, writes one JSON file, and I read that file to you.',
  bot: 'Behind me is the paper bot on the PC. It publishes the account file, and I read that file to you. I am not the bot itself.',
  mind: 'Behind me is a nightly job on the PC. It writes its notes into a file, and I read that file to you.',
  builder: 'Behind me is a coding agent working on its own git branch. I read the agent list and whatever commit notes were published with the site.',
  keeper: 'I read the small status card that each app in my care publishes, and add them up.',
  champion: 'Behind me is one stored backtest in the run library. I read its row in the Archive index.',
  villager: 'I read the status card my app publishes. Nothing more.' };
const NEED = {
  'bot:kalshi': 'Nothing. I stay on paper. If my feed is old, check that the PC is publishing it.',
  'job:cronos': 'Leave the PC on at night so my jobs can run.',
  'job:queue': 'Tick off what is done, and tell the lead what matters most.',
  scanner: 'Nothing urgent. For fresher numbers run RUN_MONEY.bat on the PC. Before acting on a pick, read its detail yourself.',
  bot: 'Keep the PC and NinjaTrader on during the session. Going live is yours alone; I stay on paper.',
  mind: 'Read my notes when you have a minute and tell the lead which ones are worth a real test.',
  builder: 'A look at my work, and a merge by the lead when it is ready. If you want something different, leave me a request.',
  keeper: 'Open the apps I flag, that is all.',
  champion: 'Nothing. I am history. If you want an idea like me live, that is a rule change you make with the lead.',
  villager: 'Just visit now and then.' };
const NEXT = {
  'bot:kalshi': 'Keep taking small paper bets and keep score after fees. I cannot place a real one.',
  'job:cronos': 'Run the nightly jobs again and report what failed.',
  'job:queue': 'The task at the top of my list is next.',
  'job:prometheus': 'Breed again next week and check on the later months. If nothing holds, I say so.',
  'job:hephaestus': 'Nothing: I store what was run. New results arrive when someone runs a setting.',
  scanner: 'I would look closer at the top pick and check its detail before anything else. I only suggest.',
  bot: 'The same plan as always: wait for my setup, one trade, the stop behind the sweep, flat before the close. I cannot place a live order.',
  mind: 'Tonight I test more ideas and write down what I notice. You decide what is worth adopting.',
  builder: 'Finish my job, test it on a phone-sized screen, commit, and hand the wiring to the lead.',
  keeper: 'Walk my district again and see which cards changed.',
  champion: 'Nothing for me to do: I am a finished test. The next step is yours, with the lead.',
  villager: 'Wait for my app to publish a new card.' };
const FOLLOW = {
  greet: ['What are you doing?', 'What did you find?', 'Are you stuck?'], who: ['What are you doing?', 'How are you built?', 'What does your name mean?'], name: ['What do you do?', 'Who do you work with?', 'Tell me something surprising'],
  doing: ['What did you find?', 'Are you stuck?', 'How sure are you?'], found: ['Explain it simply', 'How sure are you?', 'What would you do next?'], learned: ['Tell me more', 'Where does that come from?', 'What would you do next?'],
  failed: ['What do you need from me?', 'What did you learn?', 'What would you do next?'], stuck: ['What do you need from me?', 'What are you doing?', 'Good news first'], need: ['Leave a request', 'What would you do next?', 'Are you stuck?'],
  last: ['Tell me more', 'What changed since yesterday?', 'Give me a number'], simple: ['How sure are you?', 'What could go wrong?', 'Show me your last result'], next: ['What do you need from me?', 'What could go wrong?', 'How sure are you?'],
  sure: ['What could go wrong?', 'Where does that come from?', 'Give me a number'], changed: ['Compare with last week', 'Show me your last result', 'What did you learn?'], compare: ['Give me a number', 'What changed since yesterday?', 'What did you learn?'],
  team: ['How are you built?', 'What are you doing?', 'What should I ask you?'], built: ['Where does that come from?', 'How sure are you?', 'Who do you work with?'], surprise: ['Tell me more', 'What did you learn?', 'Give me a number'],
  good: ['Bad news first', 'Give me a number', 'What would you do next?'], bad: ['What do you need from me?', 'Good news first', 'What could go wrong?'], number: ['Another', 'Explain it simply', 'How sure are you?'],
  money: ['How sure are you?', 'What could go wrong?', 'Give me a number'], risk: ['How sure are you?', 'What would you do next?', 'Good news first'], when: ['What changed since yesterday?', 'Show me your last result', 'Are you stuck?'],
  yesterday: ['What changed since yesterday?', 'Are you stuck?', 'What did you learn?'], mood: ['What are you doing?', 'Good news first', 'Bad news first'], help: ['What are you doing?', 'What did you find?', 'What did you learn?'],
  sources: ['How are you built?', 'How sure are you?', 'When did you last update?'], open: ['What are you doing?', 'Show me your last result', 'What should I ask you?'], owner: ['What are you doing?', 'What changed since yesterday?', 'What should I ask you?'],
  more: ['Tell me more', 'Give me a number', 'What should I ask you?'], repeat: ['Explain it simply', 'What should I ask you?', 'Tell me more'], joke: ['What are you doing?', 'Tell me something surprising', 'Good news first'],
  thanks: ['What should I ask you?', 'What would you do next?', 'Tell me something surprising'], bye: ['What should I ask you?', 'What are you doing?', 'Good news first'],
  order: ['What would you do next?', 'What could go wrong?', 'Leave a request'], secret: ['How are you built?', 'What should I ask you?', 'What are you doing?'], forecast: ['How sure are you?', 'What did you learn?', 'Show me your last result'],
  do: ['Leave a request', 'What do you need from me?', 'What are you doing?'], request: ['Leave a request', 'What are you doing?', 'What should I ask you?'], why: ['What did you learn?', 'What could go wrong?', 'How sure are you?'],
  top: ['Explain it simply', 'What could go wrong?', 'When does it end?'], expire: ['What is your top pick?', 'How sure are you?', 'What did you find?'], drawdown: ['How far to the target?', 'What could go wrong?', 'How did today go?'],
  target: ['How much drawdown is left?', 'How did today go?', 'What are your rules?'], position: ['How did today go?', 'How much drawdown is left?', 'What are your rules?'], rules: ['What could go wrong?', 'How did today go?', 'What did you learn?'],
  old: ['Why were you adopted or rejected?', 'What are the eval odds?', 'How sure are you?'], pass: ['How did the earlier years go?', 'Give me a number', 'How sure are you?'], verdict: ['How did the earlier years go?', 'What could go wrong?', 'Give me a number'],
  commit: ['What are you doing?', 'Are you stuck?', 'What do you need from me?'], branch: ['What was your last commit?', 'Are you stuck?', 'What do you need from me?'], apps: ['Which ones need a look?', 'Give me a number', 'What changed since yesterday?'],
  attention: ['Which apps do you keep?', 'What do you need from me?', 'Good news first'], tested: ['What did you find?', 'What did you learn?', 'How sure are you?'],
  fallback: ['What are you doing?', 'What did you find?', 'What should I ask you?'] };

const firstSentence = (t) => { const s = clean(t, 400), m = /^(.{8,}?[.!?])(\s|$)/.exec(s); return m ? m[1] : s; };
const dot = (t) => { const s = String(t || '').trim(); return !s ? '' : /[.!?…)]$/.test(s) ? s : s + '.'; };
const day = (t) => { const ms = typeof t === 'number' ? t : toMs(t); return ms == null ? '' : dayOf(ms); };
const tod = (h) => (h < 5 ? 'evening' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening');
function label(f) {
  if (f.sample) return ' (Sample data, not real.)';
  if (f.status === 'stale' && !f.missing) return ' (My data is old.)';
  if (f.note === 'snapshot at build time') return ' (A snapshot from when the site was built.)';
  return '';
}
const withDay = (x) => dot(x.text) + (x.t != null ? ' [' + day(x.t) + ']' : '');
const numLine = (n) => n.label + ': ' + dot(n.text);
function getNum(f, re) { return arr(f.numbers).find((n) => re.test(n.label)); }

/** the answer to one question. mem is the short memory of this conversation ({ last, cur, lastText, lastQ, prevQ }); the new one comes back in .mem */
export function answer(person, facts, text, mem0, env0) {
  const p = person, f = facts, env = env0 || {}, w = W[p.temperament] || W.calm, mem = { cur: {}, ...(isObj(mem0) ? mem0 : {}) };
  mem.cur = { ...(mem.cur || {}) };
  const now = num(env.now) != null ? env.now : Date.now();
  let it = intentOf(text, p, mem).id;
  let stepping = false;
  if (it === 'more') { if (mem.last && mem.last !== 'more' && LISTY.indexOf(mem.last) >= 0) { it = mem.last; stepping = true; } else it = mem.last === 'learned' ? 'last' : 'learned'; }
  if (it === 'why') it = f.failed || f.blocked || f.status === 'failed' ? 'failed' : mem.last === 'sure' ? 'risk' : 'sure';
  const cur = (k) => { const c = stepping ? (mem.cur[k] || 0) : 0; return c; };
  const step = (k, n) => { mem.cur[k] = (stepping ? (mem.cur[k] || 0) : 0) + n; };
  const R = { text: '', sources: arr(f.sources).slice(0, 3), actions: [], followups: (FOLLOW[it] || FOLLOW.fallback).slice(), intent: it, open: false };
  const L = arr(f.last), LE = arr(f.learned), NU = arr(f.numbers), lab = label(f);
  const say = (...parts) => parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  const openAct = () => { if (p.app) R.actions.push({ label: 'Open their work', open: '../' + p.app + '/' }); };
  const reqAct = () => R.actions.push({ label: 'Leave a request', request: true });
  const list = (items, k, n, render, empty) => {
    const at = cur(k), part = items.slice(at, at + n);
    if (!part.length) return items.length ? w.done : empty;
    step(k, n);
    return part.map(render).join(' ');
  };
  switch (it) {
    case 'greet': { const op = opener(p, f, { hour: env.hour }); R.text = say(op.hello, op.intro, op.fact || dot(firstSentence(f.doing)) + lab); break; }
    case 'who': R.text = say('I am ' + p.name + (p.meaning ? ' ("' + p.meaning + '")' : '') + ': ' + role(p) + '.', dot(p.bio), 'I speak only from my own files and I cannot place orders.'); break;
    case 'name': R.text = p.meaning ? say(p.name + ' means "' + p.meaning + '" in Greek.', 'It fits: I am ' + role(p) + '.') : say(w.none, 'Nobody wrote down what ' + p.name + ' means.'); break;
    case 'doing': R.text = say(dot(f.doing), 'Status: ' + STATUS_WORD[f.status].toLowerCase() + '.' + lab); break;
    case 'found': R.text = say(list(L, 'found', 2, withDay, say(w.none, 'Nothing is on my table yet.')), lab); if (!stepping && f.details && f.details[0] && L.length) R.text = say(R.text, 'Detail on the first: ' + dot(f.details[0])); openAct(); break;
    case 'last': R.text = say(list(L, 'last', 1, (x) => 'My last result: ' + withDay(x), say(w.none, 'I have no result on file yet.')), lab); openAct(); break;
    case 'learned': { const at = cur('learned'), part = LE.slice(at, at + 2); R.text = part.length ? say(part.map(withDay).join(' '), lab) : say(LE.length ? w.done : say(w.none, 'No lesson is on file for me yet.')); if (part.length) { step('learned', 2); R.sources = uniq(part.map((x) => x.src).filter(Boolean)).slice(0, 3); } break; }
    case 'failed':
      if (f.failed) R.text = say(dot(f.failed), lab);
      else if (f.blocked) R.text = say('What is wrong: ' + dot(f.blocked), lab);
      else if (f.status === 'failed') R.text = say('My last run failed and no reason was written down.', lab);
      else if (f.mood === 'sheepish' && NU[0]) R.text = say('Not a failure, but not a good day either. ' + numLine(NU[0]), lab);
      else R.text = say('Nothing failed that I know of.', 'Status: ' + STATUS_WORD[f.status].toLowerCase() + '.' + lab);
      break;
    case 'stuck': R.text = f.blocked ? say(w.yes, dot(f.blocked), lab) : say(w.no, 'Nothing is blocking me.', 'Status: ' + STATUS_WORD[f.status].toLowerCase() + '.' + lab); break;
    case 'need': R.text = say(f.blocked ? 'First this: ' + dot(f.blocked) : '', NEED[p.id] || NEED[p.kind] || NEED.keeper); reqAct(); break;
    case 'simple': R.text = say(SIMPLE[p.id] || SIMPLE[p.kind] || SIMPLE.keeper, 'Right now: ' + dot(firstSentence(f.doing)) + lab); break;
    case 'next': R.text = say(f.blocked ? 'First I would clear this: ' + dot(f.blocked) : '', NEXT[p.id] || NEXT[p.kind] || NEXT.keeper); if (p.kind === 'scanner') { const t = getNum(f, /^Top pick/); if (t) R.text = say(R.text, numLine(t)); } reqAct(); break;
    case 'sure': R.text = say(w.sure, dot(f.risk), f.sample ? 'And right now I am showing sample data, not real numbers.' : f.status === 'stale' ? 'And my data is old, so treat it as a memory.' : f.note === 'snapshot at build time' ? 'What I show is a snapshot from when the site was built.' : '', 'I read: ' + (arr(f.sources).join(', ') || 'nothing yet') + '.'); break;
    case 'risk': R.text = say(dot(f.risk), f.blocked ? 'Right now: ' + dot(f.blocked) : '', lab); break;
    case 'changed': {
      const fresh = L.concat(LE).filter((x) => x.t != null && now - x.t <= 36 * H && now - x.t >= -H);
      const newest = L.concat(LE).filter((x) => x.t != null).sort((a, b) => b.t - a.t)[0];
      R.text = fresh.length ? say('New since yesterday:', fresh.slice(0, 2).map(withDay).join(' '), lab) : say('Nothing new on my file since yesterday.', newest ? 'My newest entry: ' + withDay(newest) : '', lab);
      break; }
    case 'compare': {
      const wk = getNum(f, /week/i), td = getNum(f, /^Today/);
      const week = L.concat(LE).filter((x) => x.t != null && now - x.t <= 7 * 24 * H).length, older = L.concat(LE).filter((x) => x.t != null && now - x.t > 7 * 24 * H).length;
      if (wk) R.text = say(numLine(wk), td ? numLine(td) : '', 'I do not keep last week\'s total on this file, so that is the honest comparison I can give.', lab);
      else R.text = say('I do not keep a week-by-week history.', week && older ? 'Some of my entries are from this week and some are older.' : week ? 'Everything I have on file is from this week.' : older ? 'Nothing on my file is from this week; it is all older.' : '', NU[0] ? 'What I do have: ' + numLine(NU[0]) : '', lab);
      break; }
    case 'team': { const mates = arr(env.roster).filter((x) => x.id !== p.id && (x.kind === p.kind || x.area === p.area)).slice(0, 4).map((x) => x.name + (/\d/.test(x.title) || x.kind === 'champion' ? '' : ' (' + lowerFirst(x.title) + ')')); R.text = mates.length ? say('I work next to ' + joinAnd(mates) + '.', 'And for you, of course.') : say('I work alone, and for you.'); break; }
    case 'built': R.text = say(BUILT[p.id] || BUILT[p.kind] || BUILT.keeper, 'My files: ' + (arr(f.sources).join(', ') || 'none yet') + '.', 'I am a character, not the worker itself: I cannot run code, change files or place orders.'); break;
    case 'sources': R.text = say('It comes from: ' + (uniq(arr(f.sources).concat(mem.lastSrc || [])).join(', ') || 'no file yet') + '.', f.asof ? 'Dated ' + day(f.asof) + '.' : '', lab); break;
    case 'surprise': { const pool = LE.concat(L), k = cur('surprise'), x = pool[pool.length ? (p.seed + k) % pool.length : 0]; R.text = x ? say('Here is one:', withDay(x), lab) : say(w.none, 'Nothing surprising is on file for me yet.'); step('surprise', 1); if (x && x.src) R.sources = [x.src]; break; }
    case 'good': case 'bad': {
      const goodBit = f.mood === 'proud' && NU[0] ? numLine(NU[0]) : L[0] ? withDay(L[0]) : dot(firstSentence(f.doing));
      const badBit = f.blocked ? dot(f.blocked) : f.failed ? dot(f.failed) : dot(f.risk);
      R.text = it === 'good' ? say(w.good, goodBit, 'The other side: ' + badBit, lab) : say(w.bad, badBit, 'The other side: ' + goodBit, lab);
      break; }
    case 'number': R.text = say(list(NU, 'number', 1, numLine, say(w.none, 'I have no number on file yet.')), lab); break;
    case 'money': { const m = NU.filter((n) => /\$/.test(n.text) && !/^Drawdown|target/i.test(n.label)); R.text = m.length ? say(m.slice(0, 3).map(numLine).join(' '), /estimate/.test(m.map((n) => n.text).join(' ')) ? '' : p.kind === 'champion' ? 'History, not a forecast.' : 'Paper, not real money.', lab) : say(w.none, 'No dollar figure is on my file.', lab); break; }
    case 'when': R.text = f.asof ? say('My data is dated ' + day(f.asof) + '.', (getNum(f, /^(Updated|Built|Stored|Last research|Newest run|Last commit)$/) ? numLine(getNum(f, /^(Updated|Built|Stored|Last research|Newest run|Last commit)$/)) : ''), lab) : say(w.none, 'There is no time on my file.', lab); break;
    case 'yesterday': { const lines = L.slice(0, 2).map(withDay); R.text = lines.length ? say(lines.join(' '), f.blocked ? 'Blocked: ' + dot(f.blocked) : 'Nothing is blocking me.', lab) : say(dot(firstSentence(f.doing)), 'I have no dated result on file.', lab); break; }
    case 'mood': R.text = say((w.mood[f.mood] || w.mood.calm), MOOD_WHY[f.mood] || '', dot(firstSentence(f.doing)) + lab); break;
    case 'help': R.text = say('You can ask me what I am doing, what I found, what I learned, whether I am stuck, what I need from you, how sure I am, for a number, or for the good or the bad news first.', KIND_HELP[p.kind] || ''); break;
    case 'open': R.text = p.app ? say('My work lives in the ' + p.app + ' app. Tap the button and I will take you there.') : say(w.none, 'I have no page of my own.'); openAct(); break;
    case 'owner': R.text = mem.prevQ ? say('Last time you asked me: "' + clean(mem.prevQ, 90) + '".', 'I keep that on this phone only.') : say('This is our first talk on this phone, as far as I remember.', 'I only remember your last question, and only here.'); break;
    case 'repeat': R.text = mem.lastText ? mem.lastText : say(w.none, 'I have not said anything yet.'); break;
    case 'joke': R.text = w.joke; break;
    case 'thanks': R.text = w.thanks; break;
    case 'bye': R.text = w.bye; break;
    case 'order': R.text = say('I can\'t place orders: paper and suggestions only.', 'Going live is yours alone, by the rules of the eval.'); break;
    case 'secret': R.text = say('I don\'t have that, and I would not say it if I did.', 'Keys and passwords never live in my files.'); break;
    case 'forecast': R.text = say('I can\'t know that. Nobody here predicts the market.', 'What I have is what already happened: ' + dot(firstSentence(f.doing)) + lab); break;
    case 'do': R.text = say('I can\'t change anything from here: I only read my own files.', 'Leave me a request and it goes into your request box for Claude.'); reqAct(); break;
    case 'request': R.text = say('Tap "Leave a request" and write it down.', 'It stays on this phone until you copy it to Claude; nothing is sent anywhere.'); reqAct(); break;
    // by kind
    case 'top': { const t = getNum(f, /^Top pick/), s = getNum(f, /^Its score/); R.text = t ? say(numLine(t), s ? numLine(s) : '', f.details && f.details[0] ? dot(f.details[0]) : '', lab) : say(w.none, 'No pick is on my table.', lab); openAct(); break; }
    case 'expire': { const e = L.filter((x) => /, ends /.test(x.text)); R.text = e.length ? say(e.slice(0, 2).map((x) => dot(x.text)).join(' '), lab) : say('None of my picks has an end date on file.', lab); break; }
    case 'drawdown': { const d = getNum(f, /^Drawdown/); R.text = d ? say(dot(d.text), lab) : say(w.none, 'My drawdown is not on the file.', lab); break; }
    case 'target': { const t = getNum(f, /target/i); R.text = t ? say(numLine(t), 'Passing is never promised.', lab) : say(w.none, 'The distance to the target is not on my file.', lab); break; }
    case 'position': R.text = say(w.none, 'My open position is not in the file I read. Hestia shows it live.'); R.actions.push({ label: 'Open Hestia', open: '../hestia/' }); break;
    case 'rules': R.text = say(dot(p.bio), 'The full plan is written on the Strategy page. I follow it on paper; I never change it.'); break;
    case 'old': { const o = L.find((x) => /^In the five years before|no numbers for the years before/.test(x.text)); R.text = o ? say(dot(o.text), 'A change only counts when it holds in both periods.', lab) : say(w.none, lab); break; }
    case 'pass': { const a = getNum(f, /passed within ten/), b = getNum(f, /failed within ten/); R.text = a || b ? say(a ? numLine(a) : '', b ? numLine(b) : '', 'That is from stored history, not a promise.', lab) : say(w.none, 'No eval odds are stored with my run.', lab); break; }
    case 'verdict': R.text = say(dot(firstSentence(f.doing)), dot(f.doing.replace(firstSentence(f.doing), '')), f.failed ? dot(f.failed) : 'The rule: better in 2026 and in the earlier years, and still two to four trades a week.', lab); break;
    case 'commit': { const c = L.find((x) => /^Commit: /.test(x.text)); R.text = c ? say('My last commit: ' + withDay({ t: c.t, text: c.text.replace(/^Commit: /, '') }), lab) : say(w.none, 'No commit of mine was published with the site.', dot(f.note)); break; }
    case 'branch': { const b = getNum(f, /^Branch$/); R.text = b ? say('My work is on the branch ' + b.text + '.', 'It reaches the site only after the lead merges it.') : say(w.none, 'No branch is on file for me.'); break; }
    case 'apps': { const a = isObj(p.district) ? arr(p.district.apps) : p.app ? [p.app] : []; R.text = a.length ? say('In my care: ' + joinAnd(a.slice(0, 12)) + (a.length > 12 ? ' and more' : '') + '.') : say(dot(f.doing)); openAct(); break; }
    case 'attention': R.text = f.blocked ? say(dot(f.blocked), lab) : say('None of my apps is asking for you right now.', lab); break;
    case 'tested': { const t = getNum(f, /tested|Jobs|Open tasks|Beat live|Dials/); R.text = t ? say(numLine(t), lab) : say(w.none, lab); break; }
    default:
      R.open = true; R.intent = 'fallback';
      R.text = say(w.none, w.idk, 'Try one of these.');
  }
  if (!R.text) R.text = say(w.none);
  if (R.intent !== 'repeat') mem.lastText = R.text;
  mem.lastSrc = R.sources.slice(0, 3);
  if (R.intent !== 'fallback' && R.intent !== 'repeat') mem.last = R.intent;
  mem.lastQ = clean(text, 120);
  mem.turns = (mem.turns || 0) + 1;
  R.mem = mem;
  return R;
}
const LISTY = ['found', 'last', 'learned', 'number', 'surprise'];
const MOOD_WHY = { proud: 'Something went right.', sheepish: 'Something did not go my way.', worried: 'Something needs a look.', busy: 'There is work on my table.', calm: '' };
const KIND_HELP = { scanner: 'Also: my top pick, and when a deal ends.', bot: 'Also: my drawdown, my target and my rules.', champion: 'Also: how the earlier years went, the eval odds, and why I was adopted or rejected.', builder: 'Also: my last commit and my branch.', keeper: 'Also: which apps I keep and which need a look.', mind: 'Also: how many ideas were tested.', villager: '' };
const lowerFirst = (s) => { const t = String(s || ''); return /^[A-Z][a-z]/.test(t) && !/^(LIT|ATLAS|BLITZ|Kalshi|Prometheus|Hephaestus|Cronos|Hellas|Jarvis|Ergasterion|Pinakes|Colosseum|NQ|Champion|Rejected)/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t; };
/** what a person IS, as the end of "I am <name>, ..." (a real role, never a bare title like "Lives in Queue" or "Prometheus: ...") */
const ROLE = { mind: 'the Mind of this project: I research every night', 'job:prometheus': 'the smith of Prometheus, where LIT settings are bred and checked', 'job:hephaestus': 'the keeper of Hephaestus, the shelf of every LIT setting that was run',
  'job:cronos': 'the night clock: I start the nightly jobs', 'job:queue': 'the scribe of the task queue', 'job:dev': 'the foreman of the coding agents', 'bot:lit': 'the LIT bot, trading the Zlarior 50K on paper',
  'bot:atlas': 'the ATLAS bot, trading a 25K account on paper', 'bot:blitz': 'the BLITZ bot, trading a 25K account on paper', 'bot:kalshi': 'the Kalshi bot: I place practice bets on paper' };
const role = (p) => {
  if (ROLE[p.id]) return ROLE[p.id];
  if (p.kind === 'champion') return p.fallen ? 'a rejected idea from the Archive' : 'an adopted run from the Archive';
  const t = String(p.title || '').trim();
  if (p.kind === 'villager' || /^Lives in /.test(t)) return 'the voice of the ' + (p.appName || t.replace(/^Lives in /, '') || 'local') + ' app';
  if (p.kind === 'builder' && / builder$/i.test(t)) return 'one of the builders, on the ' + t.replace(/ builder$/i, '') + ' job';
  if (/^[^:]{2,30}: /.test(t)) { const m = /^([^:]+): (.+)$/.exec(t); return 'the worker behind ' + m[1] + ' (' + lowerFirst(m[2]) + ')'; }
  return /^(The|A|An) /.test(t) ? lowerFirst(t) : 'the ' + lowerFirst(t || 'keeper of this place');
};
/** the short role for a name plate ("Scribe of the task queue", "Voice of the Zenith app") */
export function roleShort(p) {
  const r = role(p || {}).replace(/^(the|a|an) /i, '').replace(/[:,(].*$/, '').trim();
  return r ? r.charAt(0).toUpperCase() + r.slice(1) : '';
}
const joinAnd = (a) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
const uniq = (a) => a.filter((x, i) => a.indexOf(x) === i);

// ------------------------------------------------------------------------------------------------ the opener (2026-11-11 scene direction: "greeting with their name and job,
// then one interesting real fact from their data with $ and R, then an invitation"). Every sentence is whole (a speech bubble shows one at a time, never a
// fragment like "Quietly"), every number is the facts' own text (the grounding check reads it).
const HELLO = { calm: (t, n) => 'Good ' + t + (n ? ', ' + n : '') + '.', blunt: (t, n) => (n ? n + ', good ' : 'Good ') + t + '.', curious: (t, n) => 'Oh, hello' + (n ? ' ' + n : '') + '! Good ' + t + '.', wry: (t, n) => 'Ah, there you are' + (n ? ', ' + n : '') + '. Good ' + t + '.' };
const INVITE = { bot: 'Want to see my last trades?', scanner: 'Want to see what I found?', builder: 'Want to see my last commits?', champion: 'Shall I show you my run, year by year?', keeper: 'Ask me which apps need you.', mind: 'Ask me what I learned last night.', villager: 'Ask me how my app is doing.' };
const INVITE_ID = { 'bot:kalshi': 'Want to see my last paper bets?', 'job:queue': 'Ask me what is next on the list.', 'job:cronos': 'Ask me which job failed.', 'job:prometheus': 'Ask me whether anything beat live.', 'job:hephaestus': 'Ask me for a number.', 'job:dev': 'Ask me who is building what.' };
const sentence = (t) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); if (!s) return ''; return dot(s.charAt(0).toUpperCase() + s.slice(1)); };
const numT = (f, re) => { const n = getNum(f, re); return n ? String(n.text) : ''; };
/** one interesting real fact from this person's data, as one or two whole sentences (money with its R where both exist). '' when there is nothing. */
export function highlight(person, facts) {
  const p = person || {}, f = facts || {}, L = arr(f.last), id = p.id || '';
  const lastLine = L[0] ? sentence(L[0].text.replace(/^Commit: (.*)$/, 'My last commit: "$1"')) : '';
  if (p.kind === 'bot' && id !== 'bot:kalshi') {
    const lt = numT(f, /^Last trade$/), td = numT(f, /^Today$/), wk = numT(f, /^This week$/);
    if (td || lt) return (td ? 'My paper account is at ' + td + ' today.' : '') + (lt ? ' My last paper trade made ' + lt + '.' : wk ? ' This week I am at ' + wk + '.' : '');
  }
  if (id === 'bot:kalshi') { const td = numT(f, /^Today$/), n = numT(f, /^Settled paper bets$/); if (td || n) return (td ? 'Today my paper bets are at ' + td + '.' : '') + (n ? ' I have ' + n + ' settled paper bets on file.' : ''); }
  if (p.kind === 'scanner') { const tp = numT(f, /^Top pick$/), um = numT(f, /^Estimate per month$/); if (tp) return 'My best find: ' + dot(tp) + (um ? ' Altogether about ' + um.replace(/ \(an estimate, not a promise\)/, '') + ' a month, an estimate, not a promise.' : ''); }
  if (p.kind === 'champion') {
    const net = numT(f, /^2026 net$/), pf = numT(f, /^2026 profit factor$/), old = numT(f, /^Earlier years, net$/);
    if (net) return 'In 2026 I made ' + net + (pf ? ' with a profit factor of ' + pf : '') + ', after costs.' + (old ? ' In the earlier years: ' + old + '.' : '');
  }
  if (p.kind === 'builder') { const n = numT(f, /^Commits on my branch$/); if (lastLine || n) return (lastLine || '') + (n ? ' I have ' + n + ' commits on my branch.' : ''); if (/^My job: /.test(f.doing || '')) return sentence(String(f.doing).replace(/^My job: (.)/, (m, c) => 'My job is ' + c.toLowerCase())); }
  if (p.kind === 'mind') { const n = numT(f, /^Ideas tested$/); if (n) return 'So far I have tested ' + n + ' ideas, and I only suggest.'; }
  if (id === 'job:queue') { const a = numT(f, /^Open tasks$/), b = numT(f, /^Done tasks$/); if (a) return 'There are ' + a + ' open tasks on my list' + (b ? ' and ' + b + ' done' : '') + '.'; }
  if (id === 'job:prometheus') { const b = numT(f, /^Beat live on both halves$/); if (b) return b + ' of my candidates beat live on both halves.'; }
  if (id === 'job:dev' && f.doing && !f.missing) return sentence(f.doing);
  if (id === 'job:hephaestus') { const d = numT(f, /^Dials$/); if (d) return 'I keep the results for ' + d + ' dials of LIT, every one really run.'; }
  if (p.kind === 'keeper') { const a = numT(f, /^Apps reporting$/), w = numT(f, /^Need a look$/); if (a) return a + ' of my apps report in' + (w ? ', and ' + w + ' need a look.' : '.'); }
  if (lastLine && !/^No /.test(lastLine)) return lastLine;
  return sentence(firstSentence(f.doing));
}
/** the opener, in parts: { hello, intro, mood, fact, invite, text } (text = the parts joined; the bubble shows them one by one) */
export function opener(person, facts, env) {
  const p = person, f = facts || {}, e = env || {}, h = num(e.hour) != null ? e.hour : 12, temp = HELLO[p.temperament] ? p.temperament : 'calm', w = W[temp];
  const hello = HELLO[temp](tod(h), e.ownerName ? clean(e.ownerName, 24) : '');
  const intro = 'I am ' + p.name + ', ' + role(p) + '.';
  const mood = f.mood && f.mood !== 'calm' && w.mood[f.mood] ? w.mood[f.mood] : '';
  const fact = (highlight(p, f) + label(f)).trim();
  const invite = f.missing ? 'Ask me what I need from you.' : INVITE_ID[p.id] || INVITE[p.kind] || INVITE.keeper;
  return { hello, intro, mood, fact, invite, text: [hello, intro, mood, fact, invite].filter(Boolean).join(' ').replace(/\s+/g, ' ') };
}
/** the first thing a person says when the sheet opens: hello (time of day, the owner's name), who they are, one real fact, an invitation; and your last question if they remember one */
export function greeting(person, facts, mem, env) {
  const o = opener(person, facts, env);
  return [o.hello, o.intro, o.mood, o.fact, mem && mem.lastQ ? 'Last time you asked: "' + clean(mem.lastQ, 70) + '".' : '', o.invite].filter(Boolean).join(' ').replace(/\s+/g, ' ');
}

/** "Yesterday / today / blocked" in one line */
export function standupLine(person, facts) {
  const L = arr(facts.last), y = L[0] ? clean(L[0].text, 120) : 'nothing new on file';
  return 'Yesterday: ' + dot(y) + ' Today: ' + dot(firstSentence(facts.doing)) + ' Blocked: ' + (facts.blocked ? dot(facts.blocked) : 'nothing.') + label(facts);
}
/** rows = [{ person, facts }] -> { lines: [{ id, name, line, blocked }], blocked: [{ id, name, why }], summary } */
export function standup(rows) {
  const lines = rows.map((r) => ({ id: r.person.id, name: r.person.name, line: standupLine(r.person, r.facts), blocked: !!r.facts.blocked, status: r.facts.status, mood: r.facts.mood }));
  const blocked = rows.filter((r) => r.facts.blocked).map((r) => ({ id: r.person.id, name: r.person.name, why: clean(r.facts.blocked, 160) }));
  const sample = rows.filter((r) => r.facts.sample).length;
  const summary = (blocked.length ? 'Blocked: ' + joinAnd(blocked.map((b) => b.name)) + '.' : 'Nobody is blocked.') + (sample ? ' Some of them are showing sample data, not real numbers.' : '');
  return { lines, blocked, summary };
}
/** one question, everyone who has something to say answers from their own data. rows = [{ person, facts }] */
export function roundTable(question, rows, env) {
  const out = [];
  for (const r of rows) {
    const a = answer(r.person, r.facts, question, null, env);
    if (a.intent === 'fallback') continue;
    out.push({ id: r.person.id, name: r.person.name, text: a.text, sources: a.sources, intent: a.intent, empty: /don.t have that|That I don.t have/i.test(a.text) });
  }
  out.sort((a, b) => (a.empty ? 1 : 0) - (b.empty ? 1 : 0));
  return out;
}
const LOWER_BETTER = { f10: 1, failed: 1, warn: 1, open: 1 };
/** two people argue a topic with their own numbers; the summary takes no side beyond what the shared numbers say */
export function debate(a, fa, b, fb, topic, env) {
  const T = [], t = clean(topic, 80) || 'who is doing better', push = (who, text) => T.push({ id: who.id, name: who.name, text: text.replace(/\s+/g, ' ').trim() });
  const wa = W[a.temperament] || W.calm, wb = W[b.temperament] || W.calm;
  const A1 = answer(a, fa, t, null, env), B1 = answer(b, fb, t, null, env);
  push(a, (A1.intent === 'fallback' || A1.intent === 'greet' ? dot(firstSentence(fa.doing)) + label(fa) : A1.text));
  push(b, (B1.intent === 'fallback' || B1.intent === 'greet' ? dot(firstSentence(fb.doing)) + label(fb) : B1.text));
  const shared = Object.keys(fa.metrics || {}).filter((k) => fb.metrics && fb.metrics[k]).slice(0, 3);
  const leadA = [], leadB = [];
  for (const k of shared) { const x = fa.metrics[k].v, y = fb.metrics[k].v; if (num(x) == null || num(y) == null || x === y) continue; ((x > y) !== !!LOWER_BETTER[k] ? leadA : leadB).push(fa.metrics[k].label); }
  if (shared.length) {
    push(a, 'My numbers against yours, ' + b.name + '. ' + shared.map((k) => cap(fa.metrics[k].label) + ': I have ' + fa.metrics[k].text + ', you have ' + fb.metrics[k].text + '.').join(' '));
    push(b, (leadB.length ? 'I am ahead on ' + joinAnd(leadB) + '.' : leadA.length ? 'On those numbers you are ahead, I give you that.' : 'On those numbers we are level.') + ' And remember what you said yourself, ' + a.name + ': ' + lowerFirst(dot(fa.risk)));
  } else {
    push(a, 'We do not measure the same thing, ' + b.name + '. Mine: ' + (arr(fa.numbers).slice(0, 2).map(numLine).join(' ') || dot(firstSentence(fa.doing))));
    push(b, 'True. Mine: ' + (arr(fb.numbers).slice(0, 2).map(numLine).join(' ') || dot(firstSentence(fb.doing))));
  }
  push(a, wa.bad + ' ' + dot(fa.blocked || fa.failed || fa.risk));
  push(b, wb.bad + ' ' + dot(fb.blocked || fb.failed || fb.risk));
  let summary = 'Neutral summary. ';
  if (!shared.length) summary += a.name + ' and ' + b.name + ' measure different things, so no number decides this. ';
  else summary += shared.map((k) => cap(fa.metrics[k].label) + ': ' + a.name + ' ' + fa.metrics[k].text + ', ' + b.name + ' ' + fb.metrics[k].text + '.').join(' ') + ' ' + (leadA.length ? a.name + ' is ahead on ' + joinAnd(leadA) + '. ' : '') + (leadB.length ? b.name + ' is ahead on ' + joinAnd(leadB) + '. ' : '') + (!leadA.length && !leadB.length ? 'Neither is ahead. ' : '');
  summary += 'Both speak from stored or paper data: history and estimates, not a forecast.' + (fa.sample || fb.sample ? ' At least one of them is showing sample data, not real numbers.' : '');
  return { topic: t, turns: T, summary: summary.replace(/\s+/g, ' ').trim(), shared };
}
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

// ------------------------------------------------------------------------------------------------ the face that goes with an answer (voice + 3D, 2026-11-11)
const FIRM = { order: 1, secret: 1, forecast: 1, do: 1 };
/** the mood a person shows while giving this answer: proud on good numbers, worried on drawdown or a block, sheepish on a rejected run or a loss, calm on a refusal */
export function moodFor(a, facts) {
  const f = facts || {}, it = a && a.intent, t = String((a && a.text) || '');
  if (FIRM[it]) return 'calm';
  if (it === 'failed' || ((it === 'verdict' || it === 'old') && f.failed)) return 'sheepish';
  if ((it === 'drawdown' || it === 'risk' || it === 'stuck' || it === 'attention') && (f.blocked || f.status === 'failed' || f.status === 'stale')) return 'worried';
  if (it === 'bad') return f.blocked || f.failed ? 'worried' : 'calm';
  if (it === 'thanks' || it === 'joke' || it === 'good') return f.mood === 'sheepish' || f.mood === 'worried' ? 'calm' : 'proud';
  if (/(^|\s)-\$\d/.test(t) && /today|trade|week|total|net/i.test(t)) return 'sheepish';
  return MOODS_OK.indexOf(f.mood) >= 0 ? f.mood : 'calm';
}
const MOODS_OK = ['calm', 'proud', 'busy', 'worried', 'sheepish'];
/** a plain topic for "earlier you asked me about ..." (never a number) */
export const TOPIC = { doing: 'what I am doing', found: 'what I found', learned: 'what I learned', failed: 'what went wrong', stuck: 'whether I am stuck', need: 'what I need from you', last: 'my last result', next: 'my next step', sure: 'how sure I am',
  changed: 'what changed', compare: 'how this week compares', number: 'my numbers', money: 'the money', risk: 'the risk', when: 'how fresh my data is', yesterday: 'how it went', drawdown: 'my drawdown', target: 'the eval target', rules: 'my rules',
  old: 'the earlier years', pass: 'the eval odds', verdict: 'my verdict', commit: 'my last commit', branch: 'my branch', top: 'my top pick', expire: 'when the deals end', attention: 'what needs a look', tested: 'the ideas tested', open: 'my work', order: 'placing an order' };
/** two or three people talk to each other about one topic. Each speaker quotes ONLY their own facts (names of the others, never their numbers). rows = [{ person, facts }] */
export function talkTogether(rows, topic, env) {
  const R = arr(rows).filter((r) => r && r.person && r.facts).slice(0, 3), t = clean(topic, 80) || 'How did it go?', turns = [];
  if (R.length < 2) return { topic: t, turns, summary: 'It takes two to talk.' };
  const own = (r) => { const a = answer(r.person, r.facts, t, null, env); return a.intent === 'fallback' || a.intent === 'greet' ? { text: dot(firstSentence(r.facts.doing)) + label(r.facts), sources: arr(r.facts.sources).slice(0, 2), intent: 'doing' } : a; };
  const push = (r, text, a) => turns.push({ id: r.person.id, name: r.person.name, text: text.replace(/\s+/g, ' ').trim(), sources: a && a.sources ? a.sources.slice(0, 2) : arr(r.facts.sources).slice(0, 2), mood: moodFor(a || { intent: 'doing', text }, r.facts) });
  const A = R[0], B = R[1], C = R[2] || null;
  const a1 = own(A); push(A, a1.text, a1);
  const b1 = own(B); push(B, A.person.name + ', here is mine. ' + b1.text, b1);
  if (C) { const c1 = own(C); push(C, 'And mine, ' + B.person.name + '. ' + c1.text, c1); }
  const asker = C || B;
  push(asker, A.person.name + ', what could go wrong for you?', { intent: 'risk', sources: [] });
  push(A, dot(A.facts.risk || 'I only know what my own files say.') + (A.facts.blocked ? ' Right now: ' + dot(A.facts.blocked) : ''), { intent: 'risk', text: A.facts.risk || '' });
  push(B, (B.facts.blocked ? (W[B.person.temperament] || W.calm).bad + ' ' + dot(B.facts.blocked) : 'Nothing is blocking me.') + label(B.facts), { intent: 'stuck', text: B.facts.blocked || '' });
  const names = R.map((r) => r.person.name);
  const summary = 'Each of ' + joinAnd(names) + ' spoke from their own files only: ' + R.map((r) => r.person.name + ' (' + (arr(r.facts.sources)[0] || 'no file') + ')').join(', ') + '. History and paper data, not a forecast.' + (R.some((r) => r.facts.sample) ? ' Some of it is sample data, not real numbers.' : '');
  return { topic: t, turns, summary };
}

// ------------------------------------------------------------------------------------------------ grounding
const NUMS = /\d+(?:[.,]\d+)*/g;
const canon = (s) => s.replace(/,/g, '').replace(/\.0+$/, '');
/** everything a person may quote: its facts, its roster entry, and (for memory) the owner's own last question */
export function corpus(person, facts, extra) {
  const f = facts, bits = [person.name, person.title, person.bio, person.meaning, person.job, person.branch, person.id, person.app, f.doing, f.blocked, f.failed, f.risk, f.note, f.asof ? day(f.asof) : '', arr(f.sources).join(' ')];
  for (const x of arr(f.last)) bits.push(x.text, x.t != null ? day(x.t) : '');
  for (const x of arr(f.learned)) bits.push(x.text, x.src, x.t != null ? day(x.t) : '');
  for (const x of arr(f.numbers)) bits.push(x.label, x.text);
  for (const k of Object.keys(f.metrics || {})) bits.push(f.metrics[k].text);
  for (const x of arr(f.details)) bits.push(x);
  if (isObj(person.district)) bits.push(arr(person.district.apps).join(' '));
  for (const x of arr(extra)) bits.push(x);
  return bits.filter(Boolean).join(' \n ');
}
/** the numbers in `text` that are NOT in the corpus (empty = grounded) */
export function ungrounded(text, corp) {
  const have = new Set((String(corp).match(NUMS) || []).map(canon));
  return (String(text).match(NUMS) || []).map(canon).filter((n) => !have.has(n));
}
/** the persona + facts block a connected model gets (people.js sends it only when the owner connected his own model in Jarvis) */
export function brainContext(person, facts) {
  const f = facts, lines = ['You are ' + person.name + ', ' + person.title + ', a character in the owner\'s private dashboard. Temperament: ' + person.temperament + ' (wording only).', 'About you: ' + person.bio,
    'RULES: answer in at most three short plain sentences, in the first person. Use ONLY the facts below; never invent a number. If the facts do not answer the question say "I don\'t have that". You cannot place orders (paper and suggestions only), change files or predict prices.',
    'FACTS (' + (f.sample ? 'SAMPLE DATA, NOT REAL; say so' : 'status ' + f.status) + (f.asof ? ', dated ' + day(f.asof) : '') + '):', 'Doing: ' + f.doing];
  if (f.blocked) lines.push('Blocked: ' + f.blocked);
  for (const n of arr(f.numbers)) lines.push('- ' + n.label + ': ' + n.text);
  for (const x of arr(f.last)) lines.push('- Result: ' + x.text + (x.t != null ? ' [' + day(x.t) + ']' : ''));
  for (const x of arr(f.learned)) lines.push('- Learned: ' + x.text);
  if (f.risk) lines.push('Caveat: ' + f.risk);
  return lines.join('\n').slice(0, 5000);
}
