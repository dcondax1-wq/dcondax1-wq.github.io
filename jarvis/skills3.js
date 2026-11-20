// Jarvis skills v3 (2026-11-11, JARVIS BRAIN v3): what skills.js gained in one place. skills.js builds this with its own helpers and
// asks it FIRST (`early`); anything it does not claim goes to the router as before.
//   1. safety      any wording of "place / arm / change a trade" is refused in plain words (safety.js)
//   2. follow-ups  "and yesterday?", "what about ATLAS?", "why?", "open it", "explain that in plain words", "compare with last week"
//                  resolve against the last answer for 5 minutes (dialogue.js)
//   3. tours       "show me around", "tour Athens", "tour the money machines"; "next" / "back" / "stop the tour" (tours.js)
//   4. briefing    "brief me", "brief me on Kalshi", "brief me on money": six lines with $ and R (jbrief.js, Helios' logic)
//   5. explain     "what is drawdown / CISD / a sweep / Kelly / PF", "where does the stop go" (explain.js, from STRATEGY.md + the glossary)
//   6. search      "find ...", "search ...", "where is ...", "what did we test about VWAP": top 5 with source and an open action (search.js)
// Deterministic, offline, no DOM, no network (the index and the facts are handed in by the caller). Paper only.
// iPhone Safari 16: plain ES2020, no regex lookbehind.

import { norm } from './router.js';
import { guard } from './safety.js';
import { createDialogue, followUp, timeRange, partner, dayLabel } from './dialogue.js';
import { createSearch, parseAsk as searchAsk } from './search.js';
import { createExplain } from './explain.js';
import { tours as tourList, findTour, tourAsk, tourText, stopText } from './tours.js';
import { briefKind, compose, KIND_NAME } from './jbrief.js';
import { peopleAsk, matchPerson, roster as buildRoster, FALLBACK as PEOPLE_FALLBACK, KIND_NAME as PEOPLE_KIND } from './jpeople.js';

// the app that shows more about an answer ("open it")
const LINK = { drawdown_left: 'demeter', daily_loss_left: 'demeter', eval_progress: 'fates', pnl_today: 'zenith', balance: 'zenith', weekday_worst: 'kronos', weekday_best: 'kronos', win_rate: 'odeon', last_trade: 'odeon',
  explain_trade: 'odeon', trades_count: 'odeon', next_event: 'pythia', can_trade_now: 'ares', rules_limit: 'pnyx', deals: 'mercury', sibyl_pick: 'sibyl', streams: 'mint', unrated: 'journal', next_action: 'compass',
  kalshi_status: 'kalshicity', kalshi_balance: 'kalshicity', kalshi_positions: 'kalshicity', kalshi_today: 'kalshicity', kalshi_losers: 'kalshicity', plan_today: 'planner' };
const BRIEF_LINK = { day: 'helios', kalshi: 'kalshicity', money: 'mint' };
const HOME_INTENTS = new Set(['drawdown_left', 'daily_loss_left', 'eval_progress', 'pnl_today', 'balance', 'can_trade_now']);
const TRADE_INTENTS = new Set(['win_rate', 'trades_count', 'last_trade', 'explain_trade', 'weekday_worst', 'weekday_best']);
const RANGE_INTENTS = new Set(['pnl_today', 'win_rate', 'trades_count', 'last_trade', 'explain_trade', 'briefing', 'balance', 'weekday_worst', 'weekday_best']);
const KALSHI_OF = { balance: 'kalshi_balance', pnl_today: 'kalshi_today' };
const NQ_OF = { kalshi_balance: 'balance', kalshi_today: 'pnl_today', kalshi_status: 'pnl_today', kalshi_positions: 'last_trade', kalshi_losers: 'weekday_worst' };
const ACCT_ALIAS = { lit: 'zlarior', zlarior: 'zlarior', atlas: 'atlas', blitz: 'blitz' };
const BOT_OF = { zlarior: /^(?:lit|zlarior)/i, atlas: /^atlas/i, blitz: /^blitz/i };

const AGENTS = /\b(?:what|which|who|how)\b.*\b(?:agents?|builders?|workers?|ai workers?|claude sessions?|the swarm)\b.*\b(?:working on|work on|doing|building|build|up to|busy with|on right now|status|progress)\b|\bwho(?: is|'s|s)? (?:building|working on|doing) what\b|\bwhat(?: is|'s|s)? (?:everyone|everybody|the team|each agent) (?:building|working on|doing)\b|^(?:agents?|builders?) (?:status|report|update|progress)$|^(?:status|report|update|progress) (?:of|on) (?:the )?(?:agents?|builders?)$|\bwho is working on what\b|\bwhat (?:is|are) (?:being|getting) built\b/;

export const V3_HELP = [
  { id: 'search', label: 'Find anything', ex: ['find the risk calendar', 'what did we test about VWAP', 'where is the quiz'] },
  { id: 'explain', label: 'Explain a word or a rule', ex: ['what is a sweep', 'what is drawdown', 'where does the stop go'] },
  { id: 'briefing', label: 'The six-line briefing', ex: ['brief me', 'brief me on Kalshi', 'brief me on money'] },
  { id: 'agents', label: 'Who is building what', ex: ['what are the agents working on', 'who is building what', 'agents status'] },
  { id: 'people', label: 'Talk to the workers', ex: ['who can I talk to', 'talk to Sibyl', 'stand-up'] },
  { id: 'tour', label: 'A guided tour', ex: ['show me around', 'tour Athens', 'tour the money machines'] },
  { id: 'followup', label: 'Follow-ups (for 5 minutes)', ex: ['and yesterday?', 'what about ATLAS?', 'open it'] },
];

export function createV3(c) {
  const { J, KB } = c, isObj = J.isObj, usd = J.usd;
  const dlg = createDialogue({ now: c.now });
  let se = null, ex = null, seAt = 0, exAt = 0;
  const RETRY_MS = 60000, clock = () => { const v = typeof c.now === 'function' ? c.now() : Date.now(); return v instanceof Date ? v.getTime() : Number(v) || Date.now(); };          // a missing file is asked for again after a minute, not on every phrase
  async function engine() { if (se || (seAt && Math.abs(clock() - seAt) < RETRY_MS)) return se; seAt = clock(); try { const ix = typeof c.getIndex === 'function' ? await c.getIndex() : null; if (ix) { const e = createSearch(ix); if (e.ready) se = e; } } catch (_) { /* no index: said below */ } return se; }
  async function explainer() { if (ex || (exAt && Math.abs(clock() - exAt) < RETRY_MS)) return ex; exAt = clock(); try { const f = typeof c.getFacts === 'function' ? await c.getFacts() : null; if (f) { const e = createExplain(f); if (e.ready) ex = e; } } catch (_) { /* no facts: said below */ } return ex; }
  const EXPLAINISH = /^(?:please |pls |jarvis |hey jarvis |ok |okay |so |and |can you |could you |quickly |again |remind me |tell me )*(?:what|whats|what's|define|definition|meaning|the meaning|explain|describe|tell me|teach|remind|where|how|when|why|show me|give me|summari[sz]e)\b/;
  const clip = (s, n) => { const t = String(s || ''); return t.length > n ? t.slice(0, n - 1).replace(/[\s,;:]+$/, '') + '…' : t; };
  const firstLine = (t) => String(t || '').split('\n')[0];
  const keep = (st, over) => dlg.note({ ...st, ...over }, over && over.at);

  // ------------------------------------------------------------------------------------------------ search
  async function searchReply(p, now) {
    const e = await engine();
    if (!e) return { ...c.MISSING('the search index', 'jarvis/search-index.json'), intent: 'search' };
    const hits = e.search(p.q, { n: 5, prefer: p.prefer });
    const total = e.size.toLocaleString('en-US');
    if (!hits.length) return c.reply(`I found nothing for "${p.q}" in the ${total} things I index (apps, tests, write-ups, rules, the calendar, the money machines). I will not guess.`, { intent: 'search', missing: true, hits: [], query: p.q });
    const head = p.tested ? `What we tested about "${p.q}": the best ${hits.length} of ${total} things I index.` : `Top ${hits.length} for "${p.q}" (of ${total} things I index):`;
    const lines = hits.map((h, i) => `${i + 1}. ${h.label}: ${h.title}${h.text ? ' - ' + clip(h.text, 90) : ''} [${h.source}]`);
    const rej = p.tested && hits.some((h) => h.kind === 'rejected' || h.rejected) ? 'Careful: a "Rejected idea" was tested and did not hold up.' : '';
    const out = hits.map((h) => ({ ...h, action: { label: 'Open', open: h.open, route: h.route } }));
    const text = [head].concat(lines, [rej, `Say "open it" for the first, or "open the second".`]).filter(Boolean).join('\n');
    dlg.note({ intent: 'search', args: { q: p.q, prefer: p.prefer, tested: p.tested }, entity: p.q, hits: out, link: { open: out[0].open, route: out[0].route, name: out[0].title }, text }, now);
    return c.reply(text, { intent: 'search', hits: out, query: p.q, sources: Array.from(new Set(hits.map((h) => h.source))), speak: `I found ${hits.length}. The best match is ${hits[0].title}, ${/^[aeiou]/i.test(hits[0].label) ? 'an' : 'a'} ${hits[0].label.toLowerCase()}. Say open it.` });
  }
  async function openLink(link, now) {
    const known = c.appsList();
    if (!link || !link.open || (known.length && !known.some((x) => x.id === link.open))) return c.reply('I have nothing to open for that.', { intent: 'followup', ok: false });
    const nm = (known.find((x) => x.id === link.open) || {}).name || link.open;
    const r = await c.actions.plan('open_app', { app: link.open, route: link.route || undefined, name: nm });
    return { ...r, intent: 'navigate', followup: 'open', about: link.name || undefined };
  }

  // ------------------------------------------------------------------------------------------------ who is building what
  // "what are the agents working on": ../ergasterion/builders.json when it is published, else jarvis/agents-now.json (a copy of
  // handoff/agents_now.json that the search builder bundles). c.getAgents() -> { data, file, at } | null. Neither: "I don't have that".
  const pickS = (o, keys, n) => { for (const k of keys) { const v = o[k]; if (typeof v === 'string' && J.str(v, n)) return J.str(v, n); if (typeof v === 'number' && Number.isFinite(v)) return String(v); } return ''; };
  function agentRows(data) {
    const list = Array.isArray(data) ? data : isObj(data) ? (['builders', 'agents', 'workers', 'items', 'list', 'now'].map((k) => data[k]).find(Array.isArray) || []) : [];
    return list.filter(isObj).map((a) => {
      const lc = ['last_commit', 'commit', 'last', 'lastCommit'].map((k) => a[k]).find((v) => v != null);
      const msg = isObj(lc) ? pickS(lc, ['msg', 'message', 'subject', 'text', 'title'], 110) : J.str(lc, 110);
      const when = isObj(lc) ? (lc.t != null ? lc.t : lc.at != null ? lc.at : lc.date != null ? lc.date : lc.time) : (a.last_commit_t != null ? a.last_commit_t : a.commit_t != null ? a.commit_t : a.updated != null ? a.updated : a.t);
      let ms = null; if (typeof when === 'number' && Number.isFinite(when)) ms = when < 1e11 ? when * 1000 : when; else if (typeof when === 'string' && Number.isFinite(Date.parse(when))) ms = Date.parse(when);
      return { name: pickS(a, ['name', 'agent', 'id', 'who', 'title'], 40), job: pickS(a, ['job', 'task', 'what', 'work', 'doing', 'brief', 'summary'], 140), status: pickS(a, ['status', 'state', 'phase'], 30).replace(/_/g, ' '), commit: msg.replace(/^[0-9a-f]{7,40}\s+/i, ''), ms };
    }).filter((r) => r.name && (r.job || r.status || r.commit));
  }
  async function agentsReply(now) {
    let got = null; try { got = typeof c.getAgents === 'function' ? await c.getAgents() : null; } catch (_) { got = null; }
    const rows = got && got.data ? agentRows(got.data) : [];
    if (!rows.length) return { ...c.MISSING('who is building what', 'ergasterion/builders.json (and the bundled jarvis/agents-now.json)'), intent: 'agents' };
    const t = J.fileTime(isObj(got.data) ? got.data : null, got.at), src = `${got.file}, ${J.agoText(t, now)}`;
    const busy = rows.filter((r) => /work|build|run|busy|active|progress|test/i.test(r.status)).length;
    const lines = [`${rows.length} ${rows.length === 1 ? 'agent' : 'agents'}${busy ? `, ${busy} working now` : ''}:`].concat(rows.slice(0, 12).map((r) => `• ${r.name}: ${r.job || 'no job written down'}${/[.!?]$/.test(r.job) || !r.job ? '' : '.'}${r.status ? ' Status: ' + r.status + '.' : ''}${r.commit ? ` Last commit: "${r.commit}"${r.ms ? ' (' + J.agoText(r.ms, now) + ')' : ''}.` : ' No commit yet.'}`), rows.length > 12 ? [`…and ${rows.length - 12} more in Ergasterion.`] : [], [got.file === 'jarvis/agents-now.json' ? 'This is the copy bundled at the last site build, so it can be behind.' : '', 'From ' + src + '.']).filter(Boolean);
    dlg.note({ intent: 'agents', args: {}, entity: 'agents', link: { open: 'ergasterion' }, text: lines.join('\n') }, now);
    return c.reply(lines.join('\n'), { intent: 'agents', agents: rows, sources: [src], speak: `${rows.length} agents${busy ? ', ' + busy + ' working now' : ''}. ${rows.slice(0, 3).map((r) => r.name + (r.job ? ': ' + r.job : '')).join('. ')}.` });
  }

  // ------------------------------------------------------------------------------------------------ the people (docs/PERSONA_API.md)
  // With the People kit on the page (globalThis.OLYMPUS_PEOPLE) Jarvis hands over: its list(), ask(id, text), standup(), and an action
  // { open: 'people', id } that the home turns into OLYMPUS_PEOPLE.open(id). Without it: the agents file and the bundled roster, and
  // the line that the Symposium app has the full conversation. Jarvis never speaks FOR a person beyond what those files say.
  const kit = () => { let k = null; try { k = (typeof c.people === 'function' ? c.people() : c.people) || (typeof globalThis !== 'undefined' ? globalThis.OLYMPUS_PEOPLE : null); } catch (_) { k = null; } return k && typeof k.list === 'function' ? k : null; };
  const within = (p, ms) => Promise.race([Promise.resolve(p).catch(() => undefined), new Promise((ok) => setTimeout(() => ok(undefined), ms))]);
  const SYMPOSIUM = 'The Symposium app has the full conversation.';
  async function people() {
    const k = kit();
    let kl = [], pj = null, got = null;
    if (k) { try { if (typeof k.ready === 'function') await within(k.ready(), 2500); kl = k.list() || []; } catch (_) { kl = []; } }
    if (!kl.length) { try { pj = typeof c.getPeople === 'function' ? await c.getPeople() : null; } catch (_) { pj = null; } }
    try { got = typeof c.getAgents === 'function' ? await c.getAgents() : null; } catch (_) { got = null; }
    const rows = got && got.data ? agentRows(got.data) : [];
    const builders = rows.map((r) => ({ id: 'builder:' + norm(r.name).replace(/ /g, '-'), name: r.name, title: r.job, kind: 'builder', app: 'ergasterion' }));
    return { k: k && kl.length ? k : null, list: buildRoster([kl, isObj(pj) ? pj.people : null, builders, PEOPLE_FALLBACK]), rows, got };
  }
  const talkAction = (p) => ({ label: 'Talk to ' + p.name, open: 'people', id: p.id });
  const hallLink = (p) => { const known = c.appsList().map((a) => a.id); return { open: !known.length || known.includes('symposium') ? 'symposium' : (p && p.app && known.includes(p.app) ? p.app : 'ergasterion') }; };
  async function peopleReply(a, now) {
    const R = await people(), k = R.k;
    if (a.type === 'list') {
      const by = {}; for (const p of R.list) (by[p.kind || 'other'] || (by[p.kind || 'other'] = [])).push(p.name);
      const lines = [`You can talk to ${R.list.length} ${R.list.length === 1 ? 'person' : 'people'}:`].concat(Object.keys(by).map((kd) => `${PEOPLE_KIND[kd] || 'Others'}: ${by[kd].slice(0, 14).join(', ')}${by[kd].length > 14 ? ', and ' + (by[kd].length - 14) + ' more' : ''}.`), [k ? 'Say "talk to" and a name, or "stand-up" for one line from each.' : 'Say "talk to" and a name. ' + SYMPOSIUM]);
      dlg.note({ intent: 'people', args: {}, entity: 'roster', link: hallLink(), text: lines.join('\n') }, now);
      return c.reply(lines.join('\n'), { intent: 'people', people: R.list.map((p) => ({ id: p.id, name: p.name, title: p.title, kind: p.kind })), kit: !!k, speak: `You can talk to ${R.list.length} people. ${R.list.slice(0, 5).map((p) => p.name).join(', ')}, and more on screen.` });
    }
    if (a.type === 'standup') {
      let su = null;
      if (k && typeof k.standup === 'function') { try { su = await within(k.standup(), 4000); } catch (_) { su = null; } }
      const rowsS = Array.isArray(su) ? su.filter((x) => isObj(x) && typeof x.line === 'string' && x.line.trim()).map((x) => ({ p: R.list.find((q) => q.id === x.id), id: x.id, line: J.str(x.line, 220) })) : [];
      if (rowsS.length) {
        const lines = [`Stand-up, ${rowsS.length} ${rowsS.length === 1 ? 'person' : 'people'}:`].concat(rowsS.slice(0, 14).map((x) => `• ${x.p ? x.p.name : String(x.id).split(':').pop()}: ${x.line}`), rowsS.length > 14 ? [`…and ${rowsS.length - 14} more in the Symposium.`] : [], ['Each line is that worker\'s own data, from the People kit.']);
        dlg.note({ intent: 'people', args: {}, entity: 'standup', link: hallLink(), text: lines.join('\n') }, now);
        return c.reply(lines.join('\n'), { intent: 'people', standup: rowsS.map((x) => ({ id: x.id, name: x.p ? x.p.name : '', line: x.line })), kit: true, sources: ['the People kit'], speak: `Stand-up. ${rowsS.slice(0, 3).map((x) => (x.p ? x.p.name : '') + ': ' + x.line).join(' ')}` });
      }
      const ar = await agentsReply(now);
      if (ar.missing) return { ...ar, intent: 'people' };
      dlg.note({ intent: 'people', args: {}, entity: 'standup', link: hallLink(), text: ar.text }, now);
      return { ...ar, text: ar.text + '\n' + SYMPOSIUM, intent: 'people', kit: false };
    }
    const p = matchPerson(a.who, R.list);
    if (!p) return a.soft ? null : c.reply(`I don't know anyone called "${J.str(a.who, 30)}". You can talk to: ${R.list.slice(0, 10).map((x) => x.name).join(', ')}${R.list.length > 10 ? ', and more ("who can I talk to")' : ''}.`, { intent: 'people', ok: false });
    if (k) {
      let ans = null;
      if (a.question && typeof k.ask === 'function') { try { ans = await within(k.ask(p.id, a.question), 5000); } catch (_) { ans = null; } }
      const src = ans && Array.isArray(ans.sources) ? ans.sources.filter((s) => typeof s === 'string').slice(0, 4) : [];
      const text = ans && typeof ans.text === 'string' && ans.text.trim() ? `${p.name}: ${J.str(ans.text, 700)}${src.length ? '\nFrom ' + src.join('; ') + '.' : ''}` : `Opening a chat with ${p.name}${p.title ? ' (' + p.title.replace(/\.$/, '') + ')' : ''}.${a.question ? ' Ask there: I have no answer of theirs to pass on.' : ''}`;
      dlg.note({ intent: 'people', args: {}, entity: p.id, link: hallLink(p), text }, now);
      return c.reply(text, { intent: 'people', person: { id: p.id, name: p.name, title: p.title, kind: p.kind }, action: talkAction(p), kit: true, sources: src, followups: ans && Array.isArray(ans.followups) ? ans.followups.filter((s) => typeof s === 'string').slice(0, 4) : undefined });
    }
    const row = R.rows.find((r) => r.name === p.name);
    const lines = [row ? `${p.name}: ${row.job || 'no job written down'}${/[.!?]$/.test(row.job) || !row.job ? '' : '.'}${row.status ? ' Status: ' + row.status + '.' : ''}${row.commit ? ` Last commit: "${row.commit}"${row.ms ? ' (' + J.agoText(row.ms, now) + ')' : ''}.` : ''}` : `${p.name}: ${p.title || 'one of the workers'}${/[.!?]$/.test(p.title) || !p.title ? '' : '.'}`,
      `I can only read ${row ? 'the agents file' : 'the roster'} here, so I will not answer for ${p.name}. ${SYMPOSIUM}`, row && R.got ? `From ${R.got.file}.` : ''].filter(Boolean);
    dlg.note({ intent: 'people', args: {}, entity: p.id, link: hallLink(p), text: lines.join('\n') }, now);
    return c.reply(lines.join('\n'), { intent: 'people', person: { id: p.id, name: p.name, title: p.title, kind: p.kind }, action: talkAction(p), kit: false, sources: row && R.got ? [R.got.file] : [] });
  }

  // ------------------------------------------------------------------------------------------------ tours
  function tourReply(id, now) {
    const t = findTour(id, c.appsList());
    if (!t) return null;
    dlg.note({ intent: 'tour', tour: { id: t.id, i: -1 }, entity: t.id, text: t.title, link: { open: t.steps[0].open, route: t.steps[0].route } }, now);
    return c.reply(tourText(t), { intent: 'tour', tour: t, speak: `${t.title}. ${t.steps.length} stops. Say next to begin.` });
  }
  async function tourStep(st, dir, now) {
    const t = findTour(st.tour.id, c.appsList());
    if (!t) return null;
    if (dir === 0) { dlg.clear(); return c.reply('Tour ended. Say "show me around" to start again.', { intent: 'tour', tour: null, ended: true }); }
    const i = st.tour.i + dir;
    if (i < 0) return c.reply('That is the first stop already.', { intent: 'tour', ok: false });
    if (i >= t.steps.length) { dlg.clear(); return c.reply(`That was the last stop of "${t.title}". Say "show me around" for another tour.`, { intent: 'tour', tour: null, ended: true }); }
    const s = t.steps[i];
    const r = await c.actions.plan('open_app', { app: s.open, route: s.route || undefined, name: s.title });
    dlg.note({ ...st, tour: { id: t.id, i }, link: { open: s.open, route: s.route } }, now);
    return { ...r, text: stopText(t, i), speak: `${s.title}. ${s.text}`, intent: 'tour', step: s, stepIndex: i, stepCount: t.steps.length };
  }

  // ------------------------------------------------------------------------------------------------ briefing
  async function briefReply(kind, now, ctx) {
    let S = await c.sources();
    if (ctx && ctx.account) S = filterAccount(S, ctx.account, true);
    let H = c.helios || null;
    if (!H && kind === 'day') { try { H = await import('../helios/helioscore.js'); } catch (_) { H = null; } }
    const b = compose(kind, { S, now, H, J, KB });
    if (!b) return { ...c.MISSING(kind === 'kalshi' ? 'the Kalshi numbers' : kind === 'money' ? 'the money streams' : 'your numbers for a briefing', kind === 'kalshi' ? 'kalshi.json and kalshicity/edges.json' : kind === 'money' ? 'money/index.json' : 'home.json'), intent: 'briefing', brief: { kind } };
    const t = c.tag(S, Array.from(new Set(b.names)), now), tail = (b.names.length ? t.line + ' ' : '') + 'Paper and suggestions only.';
    dlg.note({ intent: 'briefing', args: { kind }, entity: kind, topic: kind, link: { open: BRIEF_LINK[kind] }, text: b.lines.join('\n') }, now);
    return c.reply(b.lines.join('\n') + '\n' + tail, { intent: 'briefing', brief: { kind, name: KIND_NAME[kind], lines: b.lines.slice(), tail }, sources: t.sources, speak: b.say });
  }

  // ------------------------------------------------------------------------------------------------ explain
  async function explainReply(p, now, opt) {
    const e = await explainer();
    if (!e) return { ...c.MISSING('the word list and your strategy rules', 'jarvis/strategy-facts.json'), intent: 'explain' };
    const r = p.overview ? e.overview() : e.answer(p.term, opt);
    if (!r) return null;
    dlg.note({ intent: 'explain', args: { term: p.term || 'strategy', overview: !!p.overview }, entity: p.term || 'strategy', link: r.link, text: r.text }, now);
    const { link, ...rest } = r;
    return rest;
  }

  // ------------------------------------------------------------------------------------------------ accounts and time ranges
  function accountOf(rest, S) {
    const toks = norm(rest).split(' ').filter((t) => t.length >= 2 && !/^(?:the|my|our|account|accounts|eval|one|on|for|bot)$/.test(t));
    if (!toks.length || toks.length > 3) return null;
    const names = J.accounts(S).map((a) => a.name);
    const hit = names.filter((n) => { const nt = norm(n).split(' '); return toks.every((t) => nt.includes(t) || nt.includes(ACCT_ALIAS[t] || '~')); });
    const key = toks.map((t) => ACCT_ALIAS[t]).find(Boolean) || (hit.length === 1 ? Object.keys(BOT_OF).find((k) => norm(hit[0]).split(' ').includes(k)) : null) || null;
    if (!hit.length && !key) return null;
    return { names: hit, key, label: hit.length ? hit.join(' and ') : key.charAt(0).toUpperCase() + key.slice(1) };
  }
  function filterAccount(S, acct, homeOnly) {
    const out = { ...S };
    if (isObj(S.home) && Array.isArray(S.home.accounts) && acct.names.length) out.home = { ...S.home, accounts: S.home.accounts.filter((a) => isObj(a) && acct.names.includes(J.str(a.name || a.id, 40) || 'Account')) };
    if (!homeOnly && isObj(S.odeon) && Array.isArray(S.odeon.trades) && acct.key && BOT_OF[acct.key]) out.odeon = { ...S.odeon, trades: S.odeon.trades.filter((t) => isObj(t) && BOT_OF[acct.key].test(String(t.bot || t.strat || ''))) };
    return out;
  }
  const inRange = (day, r) => day >= r.from && day <= r.to;
  function tradeStats(S, r) {
    const all = J.trades(S), list = all.filter((t) => inRange(t.day, r)), st = J.stats(list), last = all.length ? all[all.length - 1].day : null;
    return { n: list.length, net: list.reduce((s, t) => s + t.usd, 0), wins: list.filter((t) => t.usd > 0).length, st, last, have: all.length > 0, list };
  }
  const statLine = (label, x, S) => (x.n ? `${label}: ${J.both(x.net, S, true)} over ${x.n} ${x.n === 1 ? 'trade' : 'trades'}, ${x.wins} won${x.st && x.st.pf != null && x.n >= 5 ? `, profit factor ${x.st.pf.toFixed(2)}` : ''}.` : `${label}: no trades in the file.`);
  const behind = (x, r) => (x.have && x.last && r.from > x.last ? `The trades file ends on ${x.last} (${dayLabel(x.last)}), so it may simply not have those days yet.` : '');
  function kalshiDays(S, r) {
    const bk = isObj(S.kalshiEdges) && isObj(S.kalshiEdges.book) ? S.kalshiEdges.book : null, days = bk && Array.isArray(bk.days) ? bk.days.filter((d) => Array.isArray(d) && typeof d[0] === 'string' && J.num(d[1]) != null) : null;
    if (!days) return null;
    const list = days.filter((d) => inRange(d[0], r));
    return { n: list.length, net: list.reduce((s, d) => s + d[1], 0), last: days.length ? days[days.length - 1][0] : null, avg: J.num(bk.stake_avg) };
  }
  const kLine = (label, k) => (k.n ? `${label}: Kalshi ${KB.usd(k.net, true) || '$0.00'}${k.avg ? ` (${J.rtxt(k.net / k.avg, true)} of a ${KB.usd(k.avg)} average bet)` : ''} over ${k.n} ${k.n === 1 ? 'day' : 'days'} with bets.` : `${label}: no Kalshi day in the engine's file${k.last ? ' (it ends on ' + k.last + ')' : ''}.`);

  async function ranged(st, r, now) {
    let S = await c.sources();
    if (st.account) S = filterAccount(S, st.account);
    const who = st.account ? ` (${st.account.label})` : '';
    if (/^kalshi_/.test(st.intent) || (st.intent === 'briefing' && st.topic === 'kalshi')) {
      const k = kalshiDays(S, r);
      if (!k) return { ...c.MISSING('the Kalshi day history', 'kalshicity/edges.json'), intent: st.intent };
      keep(st, { range: r, at: now });
      return c.withSrc(S, ['kalshiEdges'], now, [kLine(r.label, k), 'After fees, from the engine\'s ledger.'], { intent: st.intent, followup: 'range', range: r });
    }
    if (st.intent === 'next_event') {
      const today = J.etParts(now).day, ev = J.events(S).filter((e) => inRange(e.date, r));
      if (!isObj(S.pythia)) return { ...c.MISSING('the risk calendar', 'pythia/events.json'), intent: 'next_event' };
      keep(st, { range: r, at: now });
      return c.withSrc(S, ['pythia'], now, [ev.length ? `${r.label}: ${ev.length} on the calendar.` : `${r.label}: nothing on the risk calendar.`].concat(ev.slice(0, 5).map((e) => `${e.date === today ? 'Today' : dayLabel(e.date)}${e.time ? ' ' + e.time + ' ET' : ''}: ${e.title}${e.impact ? ', ' + e.impact + ' impact' : ''}${e.verify ? ' (date not verified yet)' : ''}.`)), { intent: 'next_event', followup: 'range', range: r });
    }
    if (st.intent === 'plan_today' && (r.id === 'today' || r.id === 'tomorrow')) { keep(st, { range: r, args: { ...st.args, which: r.id }, at: now }); const x = await c.actions.plan('plan_today', { which: r.id }); return { ...x, intent: 'plan_today', followup: 'range' }; }
    if (!RANGE_INTENTS.has(st.intent) && !HOME_INTENTS.has(st.intent)) return null;
    if (!RANGE_INTENTS.has(st.intent)) return c.reply(`I only have the current number for that, not what it was ${r.id === 'yesterday' ? 'yesterday' : 'then'}: the published file keeps no history. I can do ${r.label.split(' (')[0].toLowerCase()} for your results, your trades and Kalshi.`, { intent: st.intent, followup: 'range', ok: false });
    if (!isObj(S.odeon)) return { ...c.MISSING('your trades', 'odeon/trades.json'), intent: st.intent };
    const x = tradeStats(S, r), lines = [statLine(r.label + who, x, S)];
    if (x.n) { const best = x.list.slice().sort((a, b) => b.usd - a.usd)[0], worst = x.list.slice().sort((a, b) => a.usd - b.usd)[0]; if (x.n > 1) lines.push(`Best ${J.both(best.usd, S, true)} on ${best.day}; worst ${J.both(worst.usd, S, true)} on ${worst.day}.`); }
    else lines.push(behind(x, r));
    keep(st, { range: r, at: now });
    return c.withSrc(S, ['odeon'], now, lines, { intent: st.intent, followup: 'range', range: r, usd: x.n ? x.net : null, n: x.n });
  }
  async function compare(st, other, now) {
    let S = await c.sources();
    if (st.account) S = filterAccount(S, st.account);
    const cur = partner(other, st.range, now);
    if (/^kalshi_/.test(st.intent) || (st.intent === 'briefing' && st.topic === 'kalshi')) {
      const a = kalshiDays(S, cur), b = kalshiDays(S, other);
      if (!a || !b) return { ...c.MISSING('the Kalshi day history', 'kalshicity/edges.json'), intent: st.intent };
      keep(st, { range: cur, at: now });
      return c.withSrc(S, ['kalshiEdges'], now, [kLine(cur.label, a), kLine(other.label, b), a.n && b.n ? `Difference: ${KB.usd(a.net - b.net, true) || '$0.00'} ${a.net >= b.net ? 'better' : 'worse'} than ${other.label.split(' (')[0].toLowerCase()}.` : ''], { intent: st.intent, followup: 'compare', range: cur, other });
    }
    if (!isObj(S.odeon)) return { ...c.MISSING('your trades', 'odeon/trades.json'), intent: st.intent };
    const a = tradeStats(S, cur), b = tradeStats(S, other), who = st.account ? ` (${st.account.label})` : '';
    const d = a.net - b.net;
    const lines = [statLine(cur.label + who, a, S), statLine(other.label + who, b, S)];
    if (a.n && b.n) lines.push(`Difference: ${J.both(Math.abs(d), S)} ${d >= 0 ? 'better' : 'worse'} than ${other.label.split(' (')[0].toLowerCase()}. Small samples: a hint, not a trend.`);
    else lines.push(behind(a, cur) || behind(b, other) || 'One side has no trades, so there is nothing to compare.');
    keep(st, { range: cur, at: now });
    return c.withSrc(S, ['odeon'], now, lines, { intent: st.intent, followup: 'compare', range: cur, other });
  }

  // ------------------------------------------------------------------------------------------------ "why?" and "in plain words"
  async function why(st, now) {
    let S = await c.sources();
    if (st.account) S = filterAccount(S, st.account, HOME_INTENTS.has(st.intent));
    const done = (r, extra) => (r ? { ...r, followup: 'why', ...(extra || {}) } : null);
    const pre = (r, head) => (r && r.text && !r.missing ? { ...r, text: head + '\n' + r.text, speak: head + ' ' + (r.speak || '') } : r);
    switch (st.intent) {
      case 'can_trade_now': return done(pre(c.A.can_trade_now(S, now, {}), 'Because of the clock and your limits:'));
      case 'last_trade': case 'explain_trade': case 'pnl_today': case 'win_rate': case 'trades_count': return done(pre(c.A.explain_trade(S, now, {}), 'The last trade I have, step by step:'), { intent: 'explain_trade' });
      case 'drawdown_left': { const a = J.accounts(S).filter((x) => x.room != null && x.balance != null); if (!a.length) return done(c.reply('I only have the drawdown number itself, not the balance behind it, so I cannot show the sum.', { intent: st.intent, ok: false })); return done(c.withSrc(S, ['home'], now, a.map((x) => `${x.name}: balance ${usd(x.balance)}, the floor is ${usd(x.balance - x.room)}, so ${J.both(x.room, S)} is left before the account fails.`).concat(['The floor is the firm\'s max loss limit; touching it ends the account.']), { intent: st.intent })); }
      case 'daily_loss_left': { const a = J.accounts(S).filter((x) => x.dll); if (!a.length) return null; return done(c.withSrc(S, ['home'], now, a.map((x) => `${x.name}: the daily loss limit is ${usd(x.dll)} and ${usd(x.dllUsed)} is used today, so ${J.both(Math.max(0, x.dll - x.dllUsed), S)} is left.`), { intent: st.intent })); }
      case 'eval_progress': { const a = J.accounts(S).filter((x) => x.target && x.toTarget != null); if (!a.length) return null; return done(c.withSrc(S, ['home'], now, a.map((x) => `${x.name}: the profit target is ${usd(x.target)} and ${usd(x.target - x.toTarget)} is made, so ${J.both(Math.max(0, x.toTarget), S)} is still to go.`), { intent: st.intent })); }
      case 'weekday_worst': case 'weekday_best': return done(c.reply('I cannot tell you why: the file holds results, not reasons. It is what those few trades add up to, and with a sample this small it can be luck.', { intent: st.intent }));
      case 'next_event': return done(c.reply('Because it is on the risk calendar (pythia/events.json). A big release can move the price fast both ways; the bot keeps its own rules, so nothing changes by itself.', { intent: st.intent }));
      case 'next_action': case 'briefing': if (st.intent === 'briefing' && st.topic !== 'day') return done(c.reply('Those lines are read straight from the published files named under the briefing. I have the numbers, not a reason behind them.', { intent: 'briefing' })); return done(await c.nextAction(S, now));
      case 'search': return done(c.reply('Because those matched your words best. I look at titles first, then the text, and I allow small typos and words that mean the same. The order says nothing about importance.', { intent: 'search' }));
      case 'explain': { const e = await explainer(); if (!e) return null; const r = st.args.overview ? e.overview() : e.answer(st.entity, { full: true }); if (!r) return null; const { link, ...rest } = r; return done({ ...rest, text: (st.args.overview ? '' : 'Because that is how it is written:\n') + rest.text }); }
      default:
        if (/^kalshi_/.test(st.intent)) return done(pre(c.A.kalshi_losers(S, now, {}), 'What the ledger shows behind that:'));
        return done(c.reply('I only have the number, not the reason behind it, so I will not guess.', { intent: st.intent, ok: false }));
    }
  }
  async function plain(st, now) {
    let S = await c.sources();
    if (st.account) S = filterAccount(S, st.account, HOME_INTENTS.has(st.intent));
    const done = (r) => (r ? { ...r, followup: 'plain' } : null);
    const u = J.usualR(S);
    switch (st.intent) {
      case 'explain': { const e = await explainer(); if (!e) return null; if (st.args.overview) return done(c.reply('In plain words: the bot waits for price to grab the stops at an obvious high or low, waits for it to turn back, then enters with the stop just beyond that extreme and one target. One trade a day, flat before the close.\nFrom STRATEGY.md (rules 2 to 8).', { intent: 'explain', sources: ['STRATEGY.md'] })); const r = e.answer(st.entity, { plain: true }); if (!r) return null; const { link, ...rest } = r; return done(rest); }
      case 'drawdown_left': { const w = J.worstAccount(J.accounts(S)); if (!w) return null; return done(c.withSrc(S, ['home'], now, [`In plain words: you can lose ${usd(w.room)} more on ${w.name} before that account is gone.${u ? ` That is about ${Math.max(0, Math.floor(w.room / u))} full losing ${Math.floor(w.room / u) === 1 ? 'trade' : 'trades'} at your usual size (${usd(u)} each).` : ''}`], { intent: st.intent })); }
      case 'daily_loss_left': { const a = J.accounts(S).filter((x) => x.dll).sort((x, y) => (x.dll - x.dllUsed) - (y.dll - y.dllUsed))[0]; if (!a) return null; return done(c.withSrc(S, ['home'], now, [`In plain words: today you can still lose ${J.both(Math.max(0, a.dll - a.dllUsed), S)} on ${a.name} before trading stops for the day.`], { intent: st.intent })); }
      case 'eval_progress': { const a = J.accounts(S).filter((x) => x.target && x.toTarget != null); if (!a.length) return null; return done(c.withSrc(S, ['home'], now, ['In plain words: ' + a.map((x) => `${x.name} needs ${J.both(Math.max(0, x.toTarget), S)} more profit to pass`).join('; ') + '.'], { intent: st.intent })); }
      case 'pnl_today': { const a = J.accounts(S).filter((x) => x.today != null); if (!a.length) return null; const sum = a.reduce((s, x) => s + x.today, 0); return done(c.withSrc(S, ['home'], now, [`In plain words: across your accounts you are ${sum > 0 ? 'up ' + J.both(sum, S) : sum < 0 ? 'down ' + J.both(Math.abs(sum), S) : 'flat'} today.`], { intent: st.intent })); }
      case 'win_rate': { const x = J.stats(J.trades(S)); if (!x) return null; return done(c.withSrc(S, ['odeon'], now, [`In plain words: about ${Math.round(x.winRate * 10)} of every 10 trades win${x.pf != null ? `, and for every $1 lost you made $${x.pf.toFixed(2)}` : ''}. Over ${x.n} trades.`], { intent: st.intent })); }
      default: { const t = firstLine(st.text); return t ? done(c.reply('In short: ' + t, { intent: st.intent })) : null; }
    }
  }

  // ------------------------------------------------------------------------------------------------ "and X?" / "what about X?"
  async function more(fu, st, raw, now) {
    const rest = fu.rest, S = await c.sources();
    if ((st.intent === 'weekday_worst' || st.intent === 'weekday_best') && /^(?:mondays?|tuesdays?|wednesdays?|thursdays?|fridays?)$/.test(rest)) { keep(st, { at: now, args: { ...st.args, day: rest.replace(/s$/, '') } }); const r0 = c.A.weekday(st.account ? filterAccount(S, st.account) : S, now, st.intent === 'weekday_worst', rest.replace(/s$/, '')); return { ...r0, followup: 'entity' }; }
    const r = timeRange(rest, now);
    if (r) return ranged(st, r, now);
    if (fu.bare) return null;
    if (/^(?:all|everything|both|all accounts|every account|all of them|overall|the others?|everyone)$/.test(rest) && st.account) return rerun(st, { account: null }, now, S);
    if (/^(?:the )?kalshi(?: bot)?$/.test(rest)) {
      if (st.intent === 'briefing') return briefReply('kalshi', now);
      if (st.intent === 'tour') return tourReply('kalshi', now);
      const id = KALSHI_OF[st.intent] || (/^kalshi_/.test(st.intent) ? st.intent : 'kalshi_status');
      return rerun({ ...st, intent: id, account: null, range: null, topic: 'kalshi' }, {}, now, S);
    }
    if (/^(?:the )?(?:money|money machines?|machines|streams|mint|side income)$/.test(rest)) {
      if (st.intent === 'tour') return tourReply('money', now);
      return st.intent === 'briefing' ? briefReply('money', now) : rerun({ ...st, intent: 'streams', account: null, range: null, topic: 'money' }, {}, now, S);
    }
    if (/^(?:the |my )?(?:nq|bots?|nq bots?|trading|futures|evals?|accounts?)$/.test(rest)) {
      if (st.intent === 'briefing') return briefReply('day', now);
      if (NQ_OF[st.intent]) return rerun({ ...st, intent: NQ_OF[st.intent], account: null, topic: null }, {}, now, S);
    }
    const acct = accountOf(rest, S);
    if (acct && (HOME_INTENTS.has(st.intent) || TRADE_INTENTS.has(st.intent) || st.intent === 'briefing' || NQ_OF[st.intent])) {
      if (st.intent === 'briefing') return briefReply('day', now, { account: acct });
      return rerun({ ...st, intent: NQ_OF[st.intent] || st.intent }, { account: acct }, now, S);
    }
    if (st.intent === 'explain') { const e = await explainer(), t = e && e.find(rest); if (t) return explainReply({ term: t }, now); }
    if (st.intent === 'tour') { const id = tourAsk('tour ' + rest); if (id && id !== 'olympus') return tourReply(id, now); }
    if (st.intent === 'search' && !fu.tail) return searchReply({ q: rest, prefer: st.args.prefer, tested: st.args.tested }, now);
    if (st.intent === 'next_event' && Object.keys(J.EVENT_WORDS).some((k) => J.EVENT_WORDS[k].test(rest))) { const x = c.A.next_event(S, now, { q: rest }); keep(st, { at: now, args: { q: rest } }); return { ...x, followup: 'entity' }; }
    if (st.intent === 'rules_limit' && /micro|contract|size|flat|cutoff|payout|inactiv|consisten|25k|50k|atlas/.test(rest)) { const q2 = /25k|atlas/.test(rest) && !/micro|contract|size|flat|payout|inactiv|consisten/.test(rest) ? (st.args.q || '') + ' ' + rest : rest + (/25k|atlas/.test(st.args.q || '') ? ' 25k' : ''); const x = c.A.rules_limit(S, now, { q: q2 }); keep(st, { at: now, args: { q: q2 } }); return { ...x, followup: 'entity' }; }
    if (st.intent === 'explain' || st.intent === 'search') return null;
    const e = await explainer(), t = e && rest.split(' ').length <= 3 && e.find(rest);           // "what about the stop?" after anything: the word itself
    if (t && !acct) return explainReply({ term: t }, now);
    return null;
  }
  async function rerun(st, over, now, S0) {
    const next = { ...st, ...over };
    let S = S0 || await c.sources();
    if (next.account) {
      const f = filterAccount(S, next.account, HOME_INTENTS.has(next.intent));
      const emptyHome = HOME_INTENTS.has(next.intent) && !(isObj(f.home) && f.home.accounts.length);
      const emptyTrades = TRADE_INTENTS.has(next.intent) && !(isObj(f.odeon) && f.odeon.trades.length);
      if (emptyHome || emptyTrades) return c.reply(`I have no ${emptyHome ? 'account' : 'trades'} called ${next.account.label} in ${emptyHome ? 'home.json' : 'odeon/trades.json'}, so I will not guess.`, { intent: next.intent, followup: 'entity', missing: false, ok: false });
      S = f;
    }
    const r = await c.answerIntent({ intent: next.intent, args: { ...(next.args || {}) } }, (next.args && next.args.q) || '', now, S);
    if (!r) return null;
    if (!r.missing) dlg.note({ ...next, text: r.text, link: next.link || (LINK[next.intent] ? { open: LINK[next.intent] } : null), range: null }, now);
    return { ...r, intent: r.intent || next.intent, followup: 'entity', account: next.account ? next.account.label : undefined };
  }

  async function follow(fu, st, raw, now) {
    switch (fu.type) {
      case 'tour_next': return st.tour ? tourStep(st, 1, now) : null;
      case 'tour_back': return st.tour ? tourStep(st, -1, now) : null;
      case 'tour_stop': return st.tour ? tourStep(st, 0, now) : null;
      case 'open': {
        if (st.intent === 'tour' && st.tour && fu.n === 1) return st.tour.i < 0 ? tourStep(st, 1, now) : openLink(st.link, now);
        if (st.hits && st.hits.length) {
          const n = fu.n === -1 ? st.hits.length : fu.n, h = st.hits[n - 1];
          if (!h) return c.reply(`I only have ${st.hits.length} ${st.hits.length === 1 ? 'result' : 'results'} for "${st.entity}".`, { intent: 'search', followup: 'open', ok: false });
          keep(st, { at: now, link: { open: h.open, route: h.route, name: h.title } });
          return openLink({ open: h.open, route: h.route, name: h.title }, now);
        }
        if (fu.n !== 1) return null;
        if (!st.link || !st.link.open) return c.reply('There is no app behind that answer. Say "open" and the name of an app.', { intent: 'followup', followup: 'open', ok: false });
        keep(st, { at: now });
        return openLink(st.link, now);
      }
      case 'why': return why(st, now);
      case 'plain': return plain(st, now);
      case 'compare': { const r = timeRange(fu.rest, now); if (r) return compare(st, r, now); const S = await c.sources(), a = accountOf(fu.rest, S); if (a && st.account) return rerun(st, { account: null }, now, S); return null; }
      case 'more': return more(fu, st, raw, now);
      default: return null;
    }
  }

  // ------------------------------------------------------------------------------------------------ the entry point
  /** the v3 answer for a phrase, or null (the router and the older rules carry on) */
  async function early(raw, now) {
    const text = String(raw == null ? '' : raw).slice(0, 500);
    if (!text.trim()) return null;
    const g = guard(text);
    if (g) return g;
    const st = dlg.get(now), fu = followUp(text);
    if (fu && st) { const r = await follow(fu, st, text, now); if (r) return r; }
    const tid = tourAsk(text);
    if (tid) { const r = tourReply(tid, now); if (r) return r; }
    const pa = peopleAsk(text);
    if (pa) { const r = await peopleReply(pa, now); if (r) return r; }
    if (AGENTS.test(norm(text).replace(/[?!.]+$/g, ''))) return agentsReply(now);
    const bk = briefKind(text);
    if (bk) return briefReply(bk, now);
    const sa = searchAsk(text);
    const e = EXPLAINISH.test(norm(text)) ? await explainer() : null;
    const ea = e ? e.parseAsk(text) : null;
    if (ea && !(sa && sa.tested)) { const r = await explainReply(ea, now); if (r) return r; }
    if (sa) return searchReply(sa, now);
    return null;
  }
  /** skills.js tells us what it just answered, so a follow-up has something to refer to */
  function note(intent, args, out, raw, now) {
    if (!out || (out.missing && intent !== 'next_event') || out.pending || typeof out.text !== 'string') return;
    if (/^(?:help_skills|remember|recall|memory_list|forget|export_data|import_data|copy_briefing|planner_goal|planner_task|planner_note|planner_event|compass_done|quiz_start)$/.test(intent)) { dlg.clear(); return; }
    const a = { ...(args || {}), q: raw };
    dlg.note({ intent, args: a, entity: a.target || a.district || a.day || null, text: out.text, why: out.why, link: out.open ? { open: out.open, route: out.route } : LINK[intent] ? { open: LINK[intent] } : null }, now);
  }
  return {
    early, note, guard,
    heard() { dlg.clear(); },                                   // another part of the brain answered: the old state no longer applies
    context: (now) => dlg.view(now),
    tours: () => tourList(c.appsList()),
    search: async (q, n) => { const e = await engine(); return e ? e.search(String(q || ''), { n: n || 5 }) : []; },
    brief: (kind, now) => briefReply(kind === 'kalshi' || kind === 'money' ? kind : 'day', now),
    agents: (now) => agentsReply(now == null ? clock() : now),
    people: async () => (await people()).list,
    explain: async (word) => { const e = await explainer(), t = e && e.find(String(word || '')); return t ? e.answer(t) : null; },
    claims: (raw) => !!(guard(raw) || AGENTS.test(norm(raw)) || tourAsk(raw) || briefKind(raw) || searchAsk(raw) || (followUp(raw) && dlg.get())),
    help: V3_HELP,
    /** the facts file is missing and this looks like "what is X": say so instead of nothing (asked only after the router had no answer) */
    explainMissing: async (raw) => { const q = norm(raw); if (!/^(?:what is|whats|what's|what are|what does|define|explain|where does|how does|when does)\b/.test(q) || q.split(' ').length > 7 || /\b(?:my|i|me|today|now|you|we)\b/.test(q)) return null; return (await explainer()) ? null : { ...c.MISSING('the word list and your strategy rules', 'jarvis/strategy-facts.json'), intent: 'explain' }; },
  };
}
export default createV3;
