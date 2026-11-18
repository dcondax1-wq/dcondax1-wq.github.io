// Jarvis actions (2026-11-10, JARVIS BRAIN): the typed action registry. Anything Jarvis DOES (not just says) is one entry here with
// a name, a typed argument list and a flag: `write: true` means it changes something the owner keeps, so Jarvis first says what it
// would do and waits for "yes" (or "no"). Reading and navigating never ask. One ES module; the Planner and Compass cores load on
// demand ('../planner/plannercore.js', '../compass/compasscore.js') or are passed in (tests). No network, no secrets, paper only:
// no action ever places, arms or routes an order.
//
//   import { createActions } from './actions.js';
//   const acts = createActions({ storage?, now?, mem?, planner?, compass?, env? });
//     env: { navigate(appId, route?), copy(text) -> Promise<bool>, download(name, text, mime?), briefing() -> Promise<{text}>, sources() -> Promise<sources> }
//   acts.defs                              [{ id, label, write, args: {name: 'string'|'day'|...}, about }]
//   acts.plan(id, args) -> Promise<reply>  reads/navigates run now; a write returns { pending: { token, id, summary } } and waits
//   acts.confirm(token?) -> Promise<reply> | null     "yes": runs the pending write (null when nothing is pending or it expired)
//   acts.cancel() -> reply | null          "no"
//   acts.pending                            { token, id, args, summary, at } | null  (expires after 2 minutes)
//   acts.run(id, args) -> Promise<reply>    the action itself, no question (what confirm() calls; apps may call it after their own confirm)
// reply: { text, speak, intent: 'action_<id>', ok, open?, route?, pending?, download?: { name, text, mime }, copied? }

import { etParts, str, isObj } from './jdata.js';
import { tokens, fuzzyEq } from './router.js';

export const PENDING_MS = 120000;
export const SECRET_KEY_RX = /(smart|vault|token|secret|password|apikey|api_key)/i;
export const EXPORT_KEY_RX = /^(jarvis\.|planner\.|compass\.|journal\.|ledger\.|olympus\.|mind\.|settings\.)/;

export const DEFS = [
  { id: 'open_app', label: 'Open an app', write: false, args: { app: 'app id', route: 'optional route' }, about: 'Navigate to any of the 60+ apps.' },
  { id: 'open_district', label: 'Open an Atlas district', write: false, args: { district: 'market | research | risk | command | life' }, about: 'Atlas, on one district.' },
  { id: 'start_quiz', label: 'Start the Lyceum quiz', write: false, args: {}, about: 'Opens Lyceum on today\'s quiz.' },
  { id: 'planner_goal', label: 'Set today\'s goal in Planner', write: true, args: { text: 'string' }, about: 'Writes "Goal: ..." at the top of today\'s Planner note.' },
  { id: 'planner_task', label: 'Add a Planner task', write: true, args: { text: 'string (a time like 09:30 is kept as the slot)' }, about: 'A task for today.' },
  { id: 'planner_event', label: 'Add a Planner event', write: true, args: { text: 'string, e.g. "Fri 9am journal review"' }, about: 'An event, read by the Planner\'s own phrase parser.' },
  { id: 'plan_today', label: 'What is on my plan', write: false, args: { which: 'today | tomorrow' }, about: 'The day\'s events, tasks and note from the Planner.' },
  { id: 'planner_note', label: 'Add to today\'s Planner note', write: true, args: { text: 'string' }, about: 'Appends a line to today\'s note.' },
  { id: 'compass_done', label: 'Mark a Compass item done', write: true, args: { which: 'optional words of its title (default: the top one)' }, about: 'Compass hides it until the situation changes.' },
  { id: 'import_memory', label: 'Import memory', write: true, args: { text: 'JSON text' }, about: 'Merges a Jarvis memory file into what he kept.' },
  { id: 'copy_briefing', label: 'Copy the briefing', write: false, args: {}, about: 'The briefing text to the clipboard.' },
  { id: 'export_data', label: 'Export my data', write: false, args: {}, about: 'A JSON file of everything Jarvis and the apps keep on this phone, without keys.' },
];

const rep = (text, extra) => ({ text, speak: (extra && extra.speak) || text, ok: true, ...(extra || {}) });

export function createActions(opts) {
  const o = isObj(opts) ? opts : {};
  const nowMs = () => { const n = typeof o.now === 'function' ? o.now() : Date.now(); return n instanceof Date ? n.getTime() : Number(n) || Date.now(); };
  const store = () => { if (o.storage) return o.storage; try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (_) { return null; } };
  const env = isObj(o.env) ? o.env : {};
  let pending = null, plannerMod = o.planner || null, compassMod = o.compass || null;
  const getPlanner = async () => { if (!plannerMod) plannerMod = await import('../planner/plannercore.js'); return plannerMod; };
  const getCompass = async () => { if (!compassMod) compassMod = await import('../compass/compasscore.js'); return compassMod; };
  const rdJson = (k) => { try { const st = store(); const v = st && st.getItem(k); return v ? JSON.parse(v) : null; } catch (_) { return null; } };
  const wrJson = (k, v) => { try { const st = store(); if (!st) return false; st.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } };

  // ---------------------------------------------------------------------------------------- planner (Planner v2, planner.agora.v2)
  // Written only through plannercore.js's own functions (loadAll migrates an older plan, parseQuick reads "Fri 9am ...", addTask / addEvent /
  // setDayNote / todaySummary / sessionsExport), and saved the way planner.js saves: the plan, the today summary Jarvis reads, the sessions file.
  const rdText = (k) => { try { const st = store(); return st ? st.getItem(k) : null; } catch (_) { return null; } };
  async function plannerState() {
    const P = await getPlanner(), t2 = rdText(P.STORE_KEY), r = P.loadAll(t2, rdText(P.OLD_KEY), rdText(P.LEGACY_KEY));
    if (r.bad) return { P, bad: true };                                  // an unreadable v2 plan is never overwritten
    return { P, st: r.state || P.blankState() };
  }
  function savePlanner(P, st, day) {
    st.updated = nowMs();
    const ok = wrJson(P.STORE_KEY, st);
    if (ok) {
      try { wrJson(P.TODAY_KEY || 'planner.today.v1', P.todaySummary(st, day, nowMs())); } catch (_) { /* the summary is optional */ }
      try { if (typeof P.sessionsExport === 'function') wrJson(P.SESSIONS_KEY, P.sessionsExport(st, day, nowMs())); } catch (_) { /* optional */ }
    }
    return ok;
  }
  const badPlan = (id) => rep('The saved Planner could not be read, so I will not write to it. Open the Planner to look at it. Nothing was changed.', { ok: false, intent: 'action_' + id });
  async function plannerGoal(text) {
    const { P, st, bad } = await plannerState(); if (bad) return badPlan('planner_goal');
    const day = etParts(nowMs()).day, goal = 'Goal: ' + str(text, 160), cur = P.dayNote(st, day);
    const rest = String(cur ? cur.text : '').split('\n').filter((l) => !/^goal:/i.test(l.trim()));
    P.setDayNote(st, day, [goal].concat(rest).join('\n').trim());
    return savePlanner(P, st, day) ? rep(`Done. Today's goal in Planner: ${str(text, 160)}.`, { intent: 'action_planner_goal', speak: 'Done. Your goal for today is set in the Planner.' }) : fail('planner_goal');
  }
  async function plannerTask(text) {
    const { P, st, bad } = await plannerState(); if (bad) return badPlan('planner_task');
    const day = etParts(nowMs()).day, q = P.parseQuick(str(text, 200), day, { kind: 'task', defaultLane: 'today' });
    if (q && !q.day) q.day = day;
    const t = q && q.text ? P.addTask(st, q, day) : null;
    if (!t) return rep('The Planner would not take that task (empty, or the list is full).', { ok: false, intent: 'action_planner_task' });
    return savePlanner(P, st, day) ? rep(`Added to the Planner: ${t.text}${t.day ? ' (' + P.dayLabel(t.day) + (t.slot ? ' at ' + P.timeWord(t.slot) : '') + ')' : ''}.`, { intent: 'action_planner_task', speak: `Added to your Planner: ${t.text}.` }) : fail('planner_task');
  }
  async function plannerEvent(text) {
    const { P, st, bad } = await plannerState(); if (bad) return badPlan('planner_event');
    const day = etParts(nowMs()).day, q = P.parseQuick(str(text, 200), day, { kind: 'event' });
    if (q && q.text && !q.day) q.day = day;
    const e = q && q.text && q.day ? P.addEvent(st, q) : null;
    if (!e) return rep('The Planner would not take that event. Say what and when, for example "add event Fri 9am journal review".', { ok: false, intent: 'action_planner_event' });
    return savePlanner(P, st, day) ? rep(`Added to the Planner: ${P.describeQuick({ ...q, kind: 'event' })}.`, { intent: 'action_planner_event', speak: `Added to your Planner: ${e.title}, ${P.dayLabel(e.day)}${e.start ? ' at ' + P.timeWord(e.start) : ''}.` }) : fail('planner_event');
  }
  async function plannerNote(text) {
    const { P, st, bad } = await plannerState(); if (bad) return badPlan('planner_note');
    const day = etParts(nowMs()).day, cur = P.dayNote(st, day);
    P.setDayNote(st, day, (cur && cur.text.trim() ? cur.text.trim() + '\n' : '') + str(text, 400));
    return savePlanner(P, st, day) ? rep(`Added to today's Planner note: ${str(text, 160)}.`, { intent: 'action_planner_note', speak: 'Added to today\'s note in the Planner.' }) : fail('planner_note');
  }
  // what is on the plan (read only): the day's events and tasks, its note and the next events
  async function planToday(which) {
    const { P, st, bad } = await plannerState();
    if (bad) return badPlan('plan_today');
    const today = etParts(nowMs()).day, day = which === 'tomorrow' ? P.addDays(today, 1) : today, rel = day === today ? 'today' : 'tomorrow';
    if (!st || (!st.events.length && !st.tasks.length && !st.notes.length)) return rep(`I don't have a plan for ${rel}: the Planner is empty on this phone. Say "add task ..." or "add event Fri 9am ..." and I will add it after you say yes.`, { ok: false, missing: true, intent: 'action_plan_today' });
    const ag = P.agenda(st, day).filter((x) => x.kind === 'event'), v = P.dayView(st, day), open = v.tasks.filter((t) => !t.done), late = st.tasks.filter((t) => !t.parent && !t.done && t.day && t.day < day);
    const lines = [`${P.dayLong(day)}:`];
    for (const e of ag) lines.push(`• ${e.allDay || !e.start ? 'All day' : P.timeWord(e.start)}${e.end ? ' to ' + P.timeWord(e.end) : ''}: ${e.title}`);
    if (!ag.length) lines.push('• No events.');
    lines.push(open.length ? `Tasks (${open.length} open${v.tasksDone ? ', ' + v.tasksDone + ' done' : ''}): ${open.slice(0, 5).map((t) => t.text + (t.slot ? ' ' + P.timeWord(t.slot) : '')).join('; ')}${open.length > 5 ? '…' : ''}.` : (v.tasks.length ? `All ${v.tasks.length} tasks are done.` : 'No tasks.'));
    if (late.length) lines.push(`${late.length} overdue: ${late.slice(0, 3).map((t) => t.text).join('; ')}.`);
    if (v.note) lines.push('Note: ' + str(v.note.split('\n')[0], 120));
    return rep(lines.join('\n') + '\nFrom the Planner on this phone.', { intent: 'action_plan_today', sources: ['planner.agora.v2 on this phone'], speak: `${rel === 'today' ? 'Today' : 'Tomorrow'} you have ${ag.length} ${ag.length === 1 ? 'event' : 'events'} and ${open.length} open ${open.length === 1 ? 'task' : 'tasks'}.` });
  }
  const fail = (id) => rep('I could not save that on this phone (storage is full or blocked). Nothing was changed.', { ok: false, intent: 'action_' + id });

  // ---------------------------------------------------------------------------------------- compass (compass.state.v1)
  async function compassPick(which) {
    const C = await getCompass(), S = env.sources ? await env.sources() : null;
    if (!S || !isObj(S.home)) return null;
    const now = nowMs(), ctx = C.context({ home: S.home, money: S.money, rules: S.rules, odeon: S.odeon, journal: rdJson('journal.v1'), ledger: rdJson('ledger.v1') }, now);
    const st = C.cleanState(rdJson('compass.state.v1')), list = C.plan ? C.plan(C.actions(ctx), st, now) : C.actions(ctx);
    const acts = Array.isArray(list) ? list : (list && Array.isArray(list.top) ? list.top : (list && Array.isArray(list.actions) ? list.actions : []));
    if (!acts.length) return { C, st, none: true, now };
    const w = tokens(which || '').filter((t) => t.length >= 3 && !['that', 'this', 'one', 'item', 'action', 'top', 'first', 'compass', 'step', 'next'].includes(t));
    let a = acts[0];
    if (w.length) { const sc = acts.map((x) => ({ x, s: w.filter((q) => tokens(x.title).some((t) => fuzzyEq(q, t))).length })).sort((p, q) => q.s - p.s); if (sc[0].s > 0) a = sc[0].x; }
    return { C, st, a, now };
  }
  async function compassDone(which) {
    const p = await compassPick(which);
    if (!p) return rep('I do not have the account numbers (home.json), so I cannot see the Compass list.', { ok: false, intent: 'action_compass_done' });
    if (p.none || !p.a) return rep('Compass has nothing open right now, so there is nothing to mark.', { ok: false, intent: 'action_compass_done' });
    return wrJson('compass.state.v1', p.C.markDone(p.st, p.a.key, p.now)) ? rep(`Marked done in Compass: ${p.a.title}.`, { intent: 'action_compass_done', speak: 'Marked done in Compass.' }) : fail('compass_done');
  }

  // ---------------------------------------------------------------------------------------- export / copy
  function exportEnvelope() {
    const st = store(), keys = {}, kept = [];
    const names = [];
    try { for (let i = 0; st && i < st.length; i++) names.push(st.key(i)); } catch (_) { /* no enumeration: memory only */ }
    for (const k of names) {
      if (!k || !EXPORT_KEY_RX.test(k)) continue;
      if (SECRET_KEY_RX.test(k)) { kept.push(k); continue; }
      try { const v = st.getItem(k); if (typeof v === 'string' && v.length <= 400000) keys[k] = v; } catch (_) { /* skip */ }
    }
    if (o.mem && !keys['jarvis.memory.v1']) { try { keys['jarvis.memory.v1'] = JSON.stringify({ v: 1, items: o.mem.list().reverse() }); } catch (_) { /* skip */ } }
    return { v: 1, kind: 'olympus-data', t: Math.round(nowMs() / 1000), keys, kept };
  }
  async function exportData() {
    const env2 = exportEnvelope(), text = JSON.stringify(env2, null, 1), p = etParts(nowMs()), name = `olympus-data-${p.day}.json`, n = Object.keys(env2.keys).length;
    try { if (typeof env.download === 'function') env.download(name, text, 'application/json'); } catch (_) { /* the reply still carries it */ }
    return rep(`Your data is ready: ${n} saved ${n === 1 ? 'item' : 'items'} from this phone as ${name}. Keys and tokens are left out on purpose.`, { intent: 'action_export_data', speak: 'Your data export is ready. Keys and tokens are left out.', download: { name, text, mime: 'application/json' }, count: n });
  }
  async function copyBriefing() {
    let b = null;
    try { b = env.briefing ? await env.briefing() : null; } catch (_) { b = null; }
    const text = b && typeof b.text === 'string' ? b.text : '';
    if (!text) return rep('I have no briefing to copy yet. Ask me "brief me" first.', { ok: false, intent: 'action_copy_briefing' });
    let ok = false;
    try { ok = env.copy ? !!(await env.copy(text)) : false; } catch (_) { ok = false; }
    return ok ? rep('The briefing is copied. Paste it anywhere.', { intent: 'action_copy_briefing', copied: true, speak: 'Copied the briefing.' })
      : rep('I could not reach the clipboard here, so here is the briefing to copy by hand:\n' + text, { ok: false, intent: 'action_copy_briefing', copied: false, speak: 'I could not reach the clipboard. The briefing is on screen.' });
  }

  // ---------------------------------------------------------------------------------------- navigation
  const open = (id, route, text) => { try { if (typeof env.navigate === 'function') env.navigate(id, route); } catch (_) { /* the reply carries open */ } return rep(text, { intent: 'action_open_app', open: id, route }); };
  const DISTRICT_NAME = { market: 'Market', research: 'Research', risk: 'Money', command: 'Command', life: 'Life' };

  async function run(id, args) {
    const a = isObj(args) ? args : {};
    switch (id) {
      case 'open_app': { const app = str(a.app, 40); return app ? open(app, a.route, a.name ? `Opening ${str(a.name, 40)}.` : `Opening ${app}.`) : rep('Which app?', { ok: false, intent: 'action_open_app' }); }
      case 'open_district': { const d = DISTRICT_NAME[a.district] ? a.district : null; if (!d) return rep('Which district: Market, Research, Money, Command or Life?', { ok: false, intent: 'action_open_district' }); const r = open('atlas', '#zone=' + d, `Opening the ${DISTRICT_NAME[d]} district in Atlas.`); r.intent = 'action_open_district'; return r; }
      case 'start_quiz': { const r = open('lyceum', '#quiz', 'Opening the Lyceum quiz: five questions on your own rules.'); r.intent = 'action_start_quiz'; return r; }
      case 'planner_goal': return plannerGoal(a.text);
      case 'planner_task': return plannerTask(a.text);
      case 'planner_note': return plannerNote(a.text);
      case 'planner_event': return plannerEvent(a.text);
      case 'plan_today': return planToday(a.which);
      case 'compass_done': return compassDone(a.which);
      case 'import_memory': { if (!o.mem) return rep('Memory is not available here.', { ok: false, intent: 'action_import_memory' }); const r = o.mem.importJson(a.text, { mode: 'merge' }); return r.ok ? rep(`Imported ${r.added} ${r.added === 1 ? 'memory' : 'memories'} (${r.skipped} already there or skipped).`, { intent: 'action_import_memory' }) : rep(r.reason || 'That file did not work.', { ok: false, intent: 'action_import_memory' }); }
      case 'copy_briefing': return copyBriefing();
      case 'export_data': return exportData();
      default: return rep('I do not have that action.', { ok: false, intent: 'action_unknown' });
    }
  }
  const summaryOf = (id, a) => {
    const t = str(a.text, 160);
    return { planner_goal: `Set today's goal in your Planner to "${t}"`, planner_task: `Add "${t}" to today's Planner tasks`, planner_note: `Add "${t}" to today's Planner note`, planner_event: `Add the event "${t}" to your Planner`, compass_done: `Mark ${a.which ? '"' + str(a.which, 60) + '"' : 'the top Compass item'} done`, import_memory: 'Merge this memory file into what Jarvis remembers' }[id] || id;
  };
  async function plan(id, args) {
    const def = DEFS.find((d) => d.id === id);
    if (!def) return rep('I do not have that action.', { ok: false, intent: 'action_unknown' });
    const a = isObj(args) ? args : {};
    if (!def.write) { pending = null; return run(id, a); }
    if ((id === 'planner_goal' || id === 'planner_task' || id === 'planner_note' || id === 'planner_event') && !str(a.text, 200)) {
      const what = { planner_goal: 'goal', planner_task: 'task', planner_event: 'event', planner_note: 'note' }[id];
      const eg = { planner_goal: 'set my goal for today to stay flat before 10', planner_task: 'add task review levels 09:30', planner_event: 'add event Fri 9am journal review', planner_note: 'add a note: levels held' }[id];
      return rep(`What should the ${what} say? For example: "${eg}".`, { ok: false, intent: 'action_' + id });
    }
    const summary = summaryOf(id, a);
    pending = { token: 'p' + nowMs().toString(36), id, args: a, summary, at: nowMs() };
    return rep(`${summary}? Say yes or no.`, { intent: 'action_confirm', speak: `${summary}? Say yes or no.`, pending: { token: pending.token, id, summary } });
  }
  const live = () => { if (pending && nowMs() - pending.at > PENDING_MS) pending = null; return pending; };
  async function confirm(token) {
    const p = live();
    if (!p || (token && token !== p.token)) return null;
    pending = null;
    return run(p.id, p.args);
  }
  function cancel() { const p = live(); if (!p) return null; pending = null; return rep('Okay, nothing changed.', { intent: 'action_cancel', speak: 'Okay, nothing changed.' }); }
  return { defs: DEFS.map((d) => ({ ...d })), plan, run, confirm, cancel, get pending() { return live(); }, exportEnvelope, DISTRICT_NAME };
}
export default createActions;
