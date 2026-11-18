// PLANNER v2 page (ES module): calendar, tasks and projects, the trading day, habits, goals, notes, a focus timer, search and Export / Import.
// The plan lives in this phone's localStorage ('planner.agora.v2', migrated from 'planner.agora.v1' / 'planner.v1', which are never touched; keys are documented at the top of plannercore.js).
// While nothing is saved it shows the DEMO plan from fixture.json (never blank; changes made in the demo are not saved). Reads only published JSON of this site (Pythia's events, home.json), nothing is sent anywhere.
// Text only through textContent / a value (no markup is built from data). window.PLANNER is the test hook.
import * as C from './plannercore.js';
import * as Scene from './plannerscene.js';
import * as Day from '../olympus/day.js';

const O = window.OLYMPUS || null;
const $ = (id) => document.getElementById(id);
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
const TABS = ['today', 'calendar', 'tasks', 'projects', 'habits', 'goals', 'notes', 'focus', 'find', 'data'];
const S = {
  state: null, demo: false, forced: false, fixture: null, day: '', today: '', tab: 'today', fixedNow: null, saveOk: null, savedAt: 0, arm: '', ready: false, from: [],
  cal: { view: 'month', day: '' }, lane: 'today', proj: '', kind: 'auto', market: null, marketDemo: false, home: null, argo: null, argoReal: false, focus: null, scene: null, sheet: null,
  day0: null, inbox: [], inboxAdded: 0,   // your calendars (../day/day.json, the PC's own link only) and the iPhone inbox (../day/inbox.json), read only
};
const INBOX_KEY = 'planner.inbox.v1';     // { ids: [...] } the iPhone inbox items already added to this plan (so each is added once)
let armTimer = 0, noteTimer = 0, reviewTimer = 0, tickTimer = 0;

async function getJSON(url, ms) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null, timer = ac ? setTimeout(() => ac.abort(), ms || 6000) : 0;
  try { const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) }); return r.ok ? await r.json() : null; } catch (_) { return null; } finally { clearTimeout(timer); }
}
function say(t) { $('status').textContent = t; }
function nowDate() { return S.fixedNow || new Date(); }
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch (_) { /* nothing */ } };

// ------------------------------------------------------------------------------------------------ storage
function loadSaved() {
  const t2 = lsGet(C.STORE_KEY), r = C.loadAll(t2, lsGet(C.OLD_KEY), lsGet(C.LEGACY_KEY));
  if (r.bad && t2 != null) lsSet(C.STORE_KEY + '.bad', t2);
  return r;
}
function save() {
  if (S.demo) return;
  S.state.updated = Date.now();
  const ok = lsSet(C.STORE_KEY, JSON.stringify(S.state));
  S.saveOk = ok; if (ok) S.savedAt = S.state.updated;
  lsSet(C.TODAY_KEY, JSON.stringify(C.todaySummary(S.state, S.today, S.state.updated)));
  lsSet(C.SESSIONS_KEY, JSON.stringify(C.sessionsExport(S.state, S.today, S.state.updated)));
}
function change(fn) { fn(S.state); save(); render(); }
function armed(key) {
  if (S.arm === key) { S.arm = ''; clearTimeout(armTimer); return true; }
  S.arm = key; clearTimeout(armTimer); armTimer = setTimeout(() => { S.arm = ''; render(); }, 4000);
  render();
  return false;
}

// ------------------------------------------------------------------------------------------------ small builders
function btn(label, onTap, cls, aria) { const b = h('button', 'btn ' + (cls || ''), label); b.type = 'button'; if (aria) b.setAttribute('aria-label', aria); b.addEventListener('click', onTap); return b; }
function chip(label, on, onTap, aria) { const b = h('button', 'ag-chip', label); b.type = 'button'; b.setAttribute('aria-pressed', on ? 'true' : 'false'); if (aria) b.setAttribute('aria-label', aria); b.addEventListener('click', onTap); return b; }
function empty(ul, text) { ul.appendChild(h('li', 'note empty', text)); }
function card(title, cls) { const c = h('section', 'ag-card card' + (cls ? ' ' + cls : '')); if (title) c.appendChild(h('h2', '', title)); return c; }
function toggleRow(done, text, small, onTap, extra) {
  const li = h('li', 'row'), b = h('button', 'rowbtn'); b.type = 'button'; b.setAttribute('role', 'checkbox'); b.setAttribute('aria-checked', done ? 'true' : 'false');
  b.appendChild(h('span', 'box', done ? '✓' : ''));
  if (extra) b.appendChild(h('span', 'slot', extra));
  const t = h('span', 'txt', text); if (small) t.appendChild(h('small', '', small));
  b.appendChild(t); b.addEventListener('click', onTap); li.appendChild(b);
  return li;
}
// a task / event row: a 44 px tick (or dot) on the left, the text opens the editor, optional buttons on the right
function itemRow(o) {
  const li = h('li', 'row item');
  if (o.tick) {
    const t = h('button', 'tick'); t.type = 'button'; t.setAttribute('role', 'checkbox'); t.setAttribute('aria-checked', o.done ? 'true' : 'false'); t.setAttribute('aria-label', (o.done ? 'Mark not done: ' : 'Mark done: ') + o.text);
    t.appendChild(h('span', 'box', o.done ? '✓' : '')); t.addEventListener('click', o.tick); li.appendChild(t);
  }
  const b = h('button', 'rowbtn' + (o.done ? ' isdone' : '') + (o.cls ? ' ' + o.cls : '')); b.type = 'button'; b.setAttribute('aria-label', (o.label || o.text) + (o.meta ? '. ' + o.meta : ''));
  if (o.time) b.appendChild(h('span', 'slot', o.time));
  if (o.color) { const d = h('span', 'dot'); d.style.background = o.color; b.appendChild(d); }
  const t = h('span', 'txt', o.text); if (o.meta) t.appendChild(h('small', '', o.meta));
  b.appendChild(t); b.addEventListener('click', o.open); li.appendChild(b);
  for (const a of o.actions || []) li.appendChild(a);
  return li;
}
// a category's colour follows the OLYMPUS look (2026-11-14, team T2): its AGORA colour is the fallback, so the default is unchanged
const CAT_SLOT = { '#c8a24a': 'a8', '#4b7a99': 'info', '#9c6b3c': 'a5', '#7f8a52': 'g6', '#c96a4a': 'r8', '#e0b060': 'warn', '#9a8f7d': 'n22' };
const catColor = (id) => { const c = (C.CATS.find((x) => x.id === id) || C.CATS[6]).color; return CAT_SLOT[c] ? `var(--oly-th-${CAT_SLOT[c]}, ${c})` : c; };
const projName = (id) => { const p = S.state.projects.find((x) => x.id === id); return p ? p.name : ''; };
function taskMeta(t) {
  const bits = [];
  if (t.day) bits.push((t.day < S.today && !t.done ? 'Late: ' : 'Due ') + C.dayLabel(t.day));
  if (t.prio) bits.push(C.prioWord(t.prio) + ' priority');
  if (t.project) bits.push(projName(t.project));
  if (t.subs && t.subs.length) bits.push(`${t.subsDone} of ${t.subs.length} steps`);
  return bits.join(' · ');
}

// ------------------------------------------------------------------------------------------------ sheets (the one editor for events, tasks, notes, projects, goals)
function closeSheet() {
  const sh = $('sheet'); sh.hidden = true; clear($('sheetBody')); clear($('sheetAct'));
  const op = S.sheet && S.sheet.opener; S.sheet = null;
  try { if (op && document.contains(op)) op.focus(); } catch (_) { /* nothing */ }
}
/**
 * openSheet({ title, fields: [{ key, type: 'text' | 'date' | 'time' | 'select' | 'chips' | 'area', label, value, options: [[value, label]], max, placeholder, show: (vals) => bool }],
 *   extra: (body, vals) => void, actions: [{ label, primary, warn, arm, fn(vals) -> true to close }] })
 */
function openSheet(spec) {
  const vals = {}, els = [], body = $('sheetBody'), act = $('sheetAct');
  clear(body); clear(act);
  $('sheetT').textContent = spec.title;
  S.sheet = { opener: document.activeElement, vals, spec };
  const refresh = () => { for (const e of els) e.wrap.hidden = e.f.show ? !e.f.show(vals) : false; };
  for (const f of spec.fields || []) {
    vals[f.key] = f.value == null ? '' : f.value;
    const wrap = h('div', 'field'), id = 'sf-' + f.key;
    wrap.appendChild(Object.assign(h('label', 'note', f.label), { htmlFor: id }));
    let inp;
    if (f.type === 'select') {
      inp = h('select'); for (const [v, l] of f.options) { const o = h('option', '', l); o.value = String(v); inp.appendChild(o); }
      inp.value = String(vals[f.key]); inp.addEventListener('change', () => { const v = inp.value; vals[f.key] = typeof f.options[0][0] === 'number' ? Number(v) : v; refresh(); });
    } else if (f.type === 'chips') {
      inp = h('div', 'seg'); inp.setAttribute('role', 'group'); inp.setAttribute('aria-label', f.label);
      const draw = () => { clear(inp); for (const [v, l] of f.options) inp.appendChild(chip(l, vals[f.key] === v, () => { vals[f.key] = vals[f.key] === v && f.toggle ? '' : v; draw(); refresh(); })); };
      draw();
    } else if (f.type === 'area') {
      inp = h('textarea'); inp.rows = f.rows || 4; inp.maxLength = f.max || 400; inp.value = String(vals[f.key]); inp.placeholder = f.placeholder || ''; inp.addEventListener('input', () => { vals[f.key] = inp.value; });
    } else {
      inp = h('input'); inp.type = f.type || 'text'; if (f.max) inp.maxLength = f.max; inp.value = String(vals[f.key]); inp.placeholder = f.placeholder || '';
      inp.addEventListener('input', () => { vals[f.key] = inp.value; refresh(); });
      if (f.type === 'text') inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const p = (spec.actions || []).find((a) => a.primary); if (p && p.fn(vals)) closeSheet(); } });
    }
    inp.id = id; wrap.appendChild(inp); body.appendChild(wrap); els.push({ f, wrap });
  }
  if (spec.extra) spec.extra(body, vals);
  refresh();
  for (const a of spec.actions || []) {
    const key = 'sheet:' + a.label, on = S.arm === key;
    const b = btn(a.arm && on ? 'Tap again' : a.label, () => {
      if (a.arm && !armed2(key)) return;
      if (a.fn(vals) !== false) closeSheet();
    }, (a.primary ? 'primary ' : '') + (a.warn ? 'warnbtn' : ''), a.arm ? a.label : '');
    act.appendChild(b);
  }
  act.appendChild(btn('Cancel', closeSheet, ''));
  $('sheet').hidden = false;
  const first = body.querySelector('input:not([type=date]):not([type=time]), textarea'); try { if (first && !spec.noFocus) first.focus(); } catch (_) { /* nothing */ }
}
// two taps inside a sheet: the first tap changes the label, the second does it (no re-render of the sheet)
function armed2(key) {
  if (S.arm === key) { S.arm = ''; clearTimeout(armTimer); return true; }
  S.arm = key; clearTimeout(armTimer); armTimer = setTimeout(() => { S.arm = ''; }, 4000);
  for (const b of $('sheetAct').querySelectorAll('button')) if (b.getAttribute('aria-label') && ('sheet:' + b.getAttribute('aria-label')) === key) b.textContent = 'Tap again';
  return false;
}

const CAT_OPTS = () => C.CATS.map((c) => [c.id, c.label]);
function eventSheet(ev, day) {
  const isNew = !ev, e = ev || { title: '', day: day || S.day, start: '', end: '', cat: 'other', repeat: 'none', until: '', remind: 0, note: '', ex: [] };
  openSheet({
    title: isNew ? 'New event' : 'Edit event',
    fields: [
      { key: 'title', type: 'text', label: 'What', value: e.title, max: 200, placeholder: 'Event name' },
      { key: 'day', type: 'date', label: isNew || e.repeat === 'none' ? 'Day' : 'First day', value: e.day },
      { key: 'start', type: 'time', label: 'Starts (empty = all day)', value: e.start },
      { key: 'end', type: 'time', label: 'Ends', value: e.end, show: (v) => !!v.start },
      { key: 'repeat', type: 'select', label: 'Repeat', value: e.repeat, options: C.REPEATS },
      { key: 'until', type: 'date', label: 'Repeat until (empty = no end)', value: e.until, show: (v) => v.repeat !== 'none' },
      { key: 'cat', type: 'chips', label: 'Colour', value: e.cat, options: CAT_OPTS() },
      { key: 'remind', type: 'select', label: 'Reminder (shows on this page)', value: e.remind, options: C.REMINDS, show: (v) => !!v.start },
      { key: 'note', type: 'area', label: 'Note', value: e.note, max: 400, rows: 3 },
    ],
    actions: [
      { label: 'Save', primary: true, fn: (v) => {
        if (!C.validDay(v.day)) { say('Pick a day first.'); return false; }
        if (!String(v.title).trim()) { say('Type what the event is first.'); return false; }
        change((st) => { if (isNew) C.addEvent(st, v); else C.updateEvent(st, ev.id, v); });
        say(isNew ? 'Event added.' : 'Event saved.');
      } },
      ...(!isNew && e.repeat !== 'none' && day ? [{ label: 'Skip this day', fn: () => { change((st) => C.skipOccurrence(st, ev.id, day)); say('Skipped ' + C.dayLabel(day) + '. The other days stay.'); } }] : []),
      ...(!isNew ? [{ label: 'Delete', warn: true, arm: true, fn: () => { change((st) => C.removeEvent(st, ev.id)); say('Event deleted.'); } }] : []),
    ],
  });
}
function taskSheet(t, preset) {
  const isNew = !t, p = preset || {}, x = t || { text: '', day: p.day || '', slot: '', prio: p.prio || 0, lane: p.lane || 'next', project: p.project || '', goal: p.goal || '', note: '' };
  const projOpts = [['', '(no project)'], ...S.state.projects.map((q) => [q.id, q.name])], goalOpts = [['', '(no goal)'], ...S.state.goals.map((g) => [g.id, g.name])];
  openSheet({
    title: isNew ? (p.parent ? 'New step' : 'New task') : t.parent ? 'Edit step' : 'Edit task',
    fields: [
      { key: 'text', type: 'text', label: 'What', value: x.text, max: 200, placeholder: 'Task name' },
      { key: 'day', type: 'date', label: 'Due day (empty = none)', value: x.day },
      { key: 'slot', type: 'time', label: 'At what time (optional)', value: x.slot, show: (v) => !!v.day },
      { key: 'prio', type: 'chips', label: 'Priority', value: x.prio, options: C.PRIOS },
      { key: 'lane', type: 'chips', label: 'Lane', value: x.lane, options: C.LANES, show: (v) => !v.day },
      { key: 'project', type: 'select', label: 'Project', value: x.project, options: projOpts, show: () => !(t ? t.parent : p.parent) },
      { key: 'goal', type: 'select', label: 'Goal', value: x.goal, options: goalOpts, show: () => !(t ? t.parent : p.parent) },
      { key: 'note', type: 'area', label: 'Note', value: x.note, max: 400, rows: 3 },
    ],
    extra: (body) => {
      if (isNew || t.parent) return;
      const box = h('div', 'field'); box.appendChild(h('span', 'note', 'Steps'));
      const ul = h('ul', 'rows'); box.appendChild(ul);
      const draw = () => {
        clear(ul);
        const subs = S.state.tasks.filter((s) => s.parent === t.id);
        if (!subs.length) empty(ul, 'No steps yet.');
        for (const s of subs) {
          const li = toggleRow(s.done, s.text, '', () => { change((st) => C.toggleTask(st, s.id)); draw(); });
          li.appendChild(btn('×', () => { change((st) => C.removeTask(st, s.id)); draw(); }, 'warnbtn sq', 'Delete step: ' + s.text)); ul.appendChild(li);
        }
      };
      draw();
      const f = h('form', 'addrow'); const inp = h('input'); inp.type = 'text'; inp.maxLength = 200; inp.placeholder = 'Add a step'; inp.setAttribute('aria-label', 'Add a step'); inp.id = 'sf-step';
      f.appendChild(inp); const ad = h('button', 'btn primary', 'Add'); ad.type = 'submit'; f.appendChild(ad);
      f.addEventListener('submit', (e) => { e.preventDefault(); const v = inp.value; if (!v.trim()) return; change((st) => C.addTask(st, { text: v, day: '', lane: t.lane }, S.today, { parent: t.id })); inp.value = ''; draw(); inp.focus(); });
      box.appendChild(f); body.appendChild(box);
    },
    actions: [
      { label: 'Save', primary: true, fn: (v) => {
        if (!String(v.text).trim()) { say('Type the task first.'); return false; }
        const patch = { text: v.text, day: C.validDay(v.day) ? v.day : '', slot: v.day ? v.slot : '', prio: v.prio, lane: v.lane || x.lane, project: v.project, goal: v.goal, note: v.note };
        change((st) => { if (isNew) C.addTask(st, { ...patch, start: patch.slot }, S.today, p.parent ? { parent: p.parent } : {}); else C.updateTask(st, t.id, patch); });
        say(isNew ? 'Task added.' : 'Task saved.');
      } },
      ...(!isNew ? [{ label: 'Delete', warn: true, arm: true, fn: () => { change((st) => C.removeTask(st, t.id)); say('Task deleted.'); } }] : []),
    ],
  });
}
function noteSheet(n, preset) {
  const isNew = !n, x = n || { title: '', text: '', tags: preset && preset.tags ? preset.tags : [], pin: false, day: preset && preset.day ? preset.day : '' };
  openSheet({
    title: isNew ? 'New note' : 'Edit note',
    fields: [
      { key: 'title', type: 'text', label: 'Title (optional)', value: x.title, max: 80 },
      { key: 'text', type: 'area', label: 'Note', value: x.text, max: 4000, rows: 8, placeholder: 'Write here' },
      { key: 'tags', type: 'text', label: 'Tags (words, like: rules study ideas)', value: x.tags.join(' '), max: 120 },
      { key: 'pin', type: 'chips', label: 'Pin to the top', value: x.pin ? 'yes' : '', options: [['yes', 'Pinned']], toggle: true },
    ],
    actions: [
      { label: 'Save', primary: true, fn: (v) => {
        if (!String(v.text).trim() && !String(v.title).trim()) { say('Write something first.'); return false; }
        const o = { title: v.title, text: v.text, tags: v.tags, pin: v.pin === 'yes', day: x.day, at: Date.now() };
        change((st) => { if (isNew) C.addNote(st, o); else C.updateNote(st, n.id, o); });
        say('Note saved.');
      } },
      ...(!isNew ? [{ label: 'Delete', warn: true, arm: true, fn: () => { change((st) => C.removeNote(st, n.id)); say('Note deleted.'); } }] : []),
    ],
  });
}
function projectSheet(p) {
  openSheet({
    title: 'Edit project',
    fields: [
      { key: 'name', type: 'text', label: 'Name', value: p.name, max: 60 },
      { key: 'cat', type: 'chips', label: 'Colour', value: p.cat, options: CAT_OPTS() },
      { key: 'done', type: 'chips', label: 'Status', value: p.done ? 'done' : '', options: [['done', 'Finished']], toggle: true },
    ],
    actions: [
      { label: 'Save', primary: true, fn: (v) => { if (!String(v.name).trim()) { say('A project needs a name.'); return false; } change((st) => { const q = st.projects.find((z) => z.id === p.id); if (q) { q.name = String(v.name).trim().slice(0, 60); q.cat = v.cat; q.done = v.done === 'done'; } }); } },
      { label: 'Delete', warn: true, arm: true, fn: () => { change((st) => C.removeProject(st, p.id)); say('Project deleted. Its tasks are kept, without a project.'); } },
    ],
  });
}
function goalSheet(g) {
  const ag = S.argo || [], opts = [['', '(not linked)'], ...ag.map((a) => [a.id, a.name + ' (' + a.text + ')'])];
  openSheet({
    title: 'Edit goal',
    fields: [
      { key: 'name', type: 'text', label: 'Goal', value: g.name, max: 80 },
      { key: 'due', type: 'date', label: 'By when (optional)', value: g.due },
      { key: 'argo', type: 'select', label: 'Linked Argo goal (read only)', value: g.argo, options: opts },
      { key: 'pct', type: 'select', label: 'Progress by hand (used when no task is linked)', value: g.pct - (g.pct % 10), options: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((n) => [n, n + '%']) },
      { key: 'note', type: 'area', label: 'Note', value: g.note, max: 200, rows: 3 },
    ],
    actions: [
      { label: 'Save', primary: true, fn: (v) => { if (!String(v.name).trim()) { say('A goal needs a name.'); return false; } change((st) => C.updateGoal(st, g.id, { name: v.name, due: v.due, argo: v.argo, pct: v.pct, note: v.note })); } },
      { label: 'Delete', warn: true, arm: true, fn: () => { change((st) => C.removeGoal(st, g.id)); } },
    ],
  });
}

// ------------------------------------------------------------------------------------------------ Today
function bar(pct, cls) { const b = h('div', 'ag-bar' + (cls ? ' ' + cls : '')); b.setAttribute('aria-hidden', 'true'); const i = h('i'); i.style.width = Math.max(0, Math.min(100, pct)) + '%'; b.appendChild(i); return b; }
const RISKCLS = { closed: 'info', high: 'bad', med: 'warn', low: 'ok', calm: '' };
function marketRows(list, ul) {
  for (const e of list) {
    const li = h('li', 'mrow'); li.appendChild(h('span', 'slot', e.time || 'All day'));
    const t = h('span', 'txt', e.title); li.appendChild(t);
    li.appendChild(h('span', 'pill ' + RISKCLS[e.closed ? 'closed' : e.impact], e.closed ? 'closed' : e.impact === 'high' ? 'red' : e.impact === 'med' ? 'amber' : 'light'));
    ul.appendChild(li);
  }
}
function tradingCard(day) {
  const c = card('The trading day', 'trading'), isToday = day === S.today, ses = C.sessionState(nowDate());
  c.appendChild(h('p', 'note', C.dayLong(day)));
  if (isToday) {
    const row = h('div', 'clock'); const tm = h('b', 'ag-num', ses.hhmm); tm.id = 'clkTime'; row.appendChild(tm); row.appendChild(h('span', 'note', 'New York time'));
    const ph = h('span', 'pill', ses.label); ph.id = 'clkPhase'; row.appendChild(ph); c.appendChild(row);
    const nx = h('p', 'lead', ses.nextText); nx.id = 'clkNext'; c.appendChild(nx);
    if (!ses.weekend) { const b = bar(ses.pct); b.id = 'clkBarWrap'; b.firstChild.id = 'clkBar'; c.appendChild(b); }
    phaseClass(ph, ses);
  } else c.appendChild(h('p', 'lead', C.isWeekend(day) ? 'The bot does not trade at the weekend. Plan the week.' : day < S.today ? 'This day is over. See what you planned and wrote.' : 'A trading day. The windows below apply.'));
  // the bots: status line and the drawdown left (home.json, read only)
  const bv = C.botsView(S.home, S.fixture && S.fixture.bots);
  const bots = h('div', 'botbox');
  bots.appendChild(h('b', '', 'The bots' + (bv.real ? '' : ' (example)')));
  bots.appendChild(h('p', 'note', bv.bot || 'No status line is published right now.'));
  const dl = h('dl', 'kv'); for (const a of bv.accounts) { dl.appendChild(h('dt', '', a.name)); dl.appendChild(h('dd', '', a.room == null ? 'not published' : `${C.money(a.room)} left of ${C.money(a.mll)}`)); }
  if (bv.accounts.length) { bots.appendChild(h('p', 'note', 'Drawdown left, so you know the room before the session.')); bots.appendChild(dl); }
  c.appendChild(bots);
  if (S.state.prefs.windows) {
    const blocks = C.sessionBlocks(day);
    const ul = h('ul', 'wins'); ul.setAttribute('aria-label', 'Session windows, New York time');
    if (!blocks.length) ul.appendChild(h('li', 'note empty', 'No trading windows today.'));
    const nowM = isToday ? ses.mins : -1;
    for (const w of blocks) {
      const from = C.hmMins(w.from), to = C.hmMins(w.to), inside = nowM >= 0 && (from < to ? nowM >= from && nowM < to : nowM >= from || nowM < to);
      const li = h('li', 'win ' + w.tone + (inside ? ' now' : '')); li.appendChild(h('span', 'slot', w.from + '-' + w.to)); const t = h('span', 'txt', w.label); t.appendChild(h('small', '', w.who + (inside ? ' · now' : ''))); li.appendChild(t); ul.appendChild(li);
    }
    c.appendChild(ul);
  }
  const mk = C.marketOn(S.market, day);
  const mh = h('div', 'mkt'); mh.appendChild(h('b', '', 'Market events' + (S.marketDemo ? ' (example)' : ''))); mh.appendChild(h('span', 'pill ' + RISKCLS[C.marketRisk(mk)], C.RISKWORD[C.marketRisk(mk)])); c.appendChild(mh);
  const mu = h('ul', 'rows'); if (!mk.length) empty(mu, 'Nothing scheduled that moves the market.'); marketRows(mk, mu); c.appendChild(mu);
  const ahead = C.marketAhead(S.market, day, 14).filter((x) => x.day !== day);
  const det = h('details'); det.appendChild(h('summary', '', `The next 14 days (${ahead.length} day${ahead.length === 1 ? '' : 's'} with events)`));
  const au = h('ul', 'rows');
  if (!ahead.length) empty(au, 'No events in the next 14 days.');
  for (const a of ahead) { au.appendChild(h('li', 'dayhead', C.dayLabel(a.day) + ' · ' + C.RISKWORD[a.risk])); marketRows(a.events, au); }
  det.appendChild(au); c.appendChild(det);
  return c;
}
// your work day from your own calendars (tools/calendar_sync.py on the PC, olympus/day.js): the shift over the bot's windows, read only
function workCard(day) {
  const D = S.day0, isToday = day === S.today;
  if (!D) return null;
  const v = isToday ? Day.today(D, nowDate().getTime()) : null, d = D.days[day] || null;
  const c = card('Your work day' + (D.demo ? ' (example)' : ''), 'workday'); c.id = 'workCard';
  const text = v ? v.text : d ? d.text : 'This day is not in your calendar file.';
  const lead = h('p', 'lead', text); lead.id = 'workLead'; c.appendChild(lead);
  const notes = v ? v.notes : d ? d.notes : [];
  if (notes.length) { const ul = h('ul', 'rows worknotes'); for (const n of notes) ul.appendChild(h('li', 'note', n)); c.appendChild(ul); }
  const evs = Day.eventsOn(D, day);
  const mu = h('ul', 'rows'); mu.setAttribute('aria-label', 'From your calendars');
  if (!evs.length) empty(mu, 'Nothing in your calendars this day.');
  for (const e of evs.slice(0, 12)) {
    const li = h('li', 'mrow'); li.appendChild(h('span', 'slot', e.allDay ? 'All day' : e.start + '-' + e.end));
    const t = h('span', 'txt', e.title); t.appendChild(h('small', '', ' · ' + e.cal + (e.work ? ' · work' : '') + (!e.busy && !e.allDay ? ' · free' : ''))); li.appendChild(t);
    if (e.work) li.appendChild(h('span', 'pill warn', 'work'));
    mu.appendChild(li);
  }
  c.appendChild(h('b', '', 'From your calendars')); c.appendChild(mu);
  const free = d ? d.free : [];
  if (free.length) c.appendChild(h('p', 'note', 'Free: ' + free.slice(0, 4).map((f) => f.start + '-' + f.end).join(', ') + '.'));
  if (D.week.line && (isToday || C.weekStart(day) === C.weekStart(S.today))) { const w = h('p', 'note', D.week.line); w.id = 'workWeek'; c.appendChild(w); }
  const bad = D.calendars.filter((x) => !x.ok && !D.demo);
  const age = v && v.age ? `Read from your calendars ${v.age}.` : '';
  c.appendChild(h('p', 'note', [age, bad.length ? `${bad.map((x) => x.name).join(', ')}: ${bad[0].error || 'could not be read'}${bad[0].cached ? ' (last good copy shown)' : ''}.` : ''].filter(Boolean).join(' ') || 'Read only: change shifts in your own calendar app.'));
  return c;
}
// what you sent from the iPhone ("Add to my day" Shortcut -> the PC's inbox): added once each to this plan, never in the DEMO
function importInbox() {
  if (S.demo || !S.inbox.length) return 0;
  let seen = []; try { const j = JSON.parse(lsGet(INBOX_KEY) || 'null'); seen = j && Array.isArray(j.ids) ? j.ids : []; } catch (_) { seen = []; }
  const fresh = S.inbox.filter((x) => !seen.includes(x.id)); if (!fresh.length) return 0;
  let n = 0;
  for (const x of fresh) {
    const ok = x.kind === 'note' ? C.addNote(S.state, { text: x.text, tags: ['inbox'], day: x.due || S.today, at: x.t * 1000 }) : C.addTask(S.state, { text: x.text, day: x.due || S.today, lane: 'today' }, S.today);
    if (ok) n++; seen.push(x.id);
  }
  lsSet(INBOX_KEY, JSON.stringify({ ids: seen.slice(-500) }));
  if (n) save();
  return n;
}
function phaseClass(ph, ses) { ph.className = 'pill ' + (ses.id === 'entries' ? 'ok' : ses.id === 'winddown' || ses.id === 'flat' ? 'warn' : ses.id === 'closed' ? '' : 'info'); }
function renderClock() {
  const el = $('clkTime'); if (!el) return;
  const ses = C.sessionState(nowDate());
  el.textContent = ses.hhmm; const ph = $('clkPhase'); ph.textContent = ses.label; phaseClass(ph, ses); $('clkNext').textContent = ses.nextText; const b = $('clkBar'); if (b) b.style.width = ses.pct + '%';
}
function agendaCard(day) {
  const c = card('Your day'), items = C.agenda(S.state, day), ul = h('ul', 'rows');
  if (!items.length) empty(ul, 'Nothing timed. Add an event, or type one above like "tomorrow 9am call".');
  for (const a of items) {
    const ev = a.kind === 'event' ? S.state.events.find((e) => e.id === a.id) : null, tk = a.kind === 'task' ? S.state.tasks.find((t) => t.id === a.id) : null;
    ul.appendChild(itemRow({ text: a.title, time: a.allDay ? 'All day' : a.start + (a.end ? '-' + a.end : ''), color: a.kind === 'event' ? catColor(a.cat) : '', done: a.done, tick: tk ? () => change((st) => C.toggleTask(st, tk.id)) : null,
      meta: (a.kind === 'task' ? 'Task' : C.CATS.find((x) => x.id === a.cat).label) + (a.repeat !== 'none' ? ' · repeats' : ''), open: () => { if (ev) eventSheet(ev, day); else if (tk) taskSheet(tk); } }));
  }
  c.appendChild(ul);
  c.appendChild(h('div', 'seg')).appendChild(btn('Add an event', () => eventSheet(null, day), 'small'));
  return c;
}
function todayTasksCard(day) {
  const c = card('Tasks'), ul = h('ul', 'rows');
  const L = C.lanes(S.state, S.today), list = day === S.today ? L.today : S.state.tasks.filter((t) => !t.parent && t.day === day).map((t) => ({ ...t, subs: S.state.tasks.filter((s) => s.parent === t.id), subsDone: S.state.tasks.filter((s) => s.parent === t.id && s.done).length, late: false }));
  const done = day === S.today ? L.done.filter((t) => t.day === day) : [];
  const all = list.concat(done);
  const open = all.filter((t) => !t.done).length;
  c.appendChild(h('p', 'note', `${all.length - open} of ${all.length} done`));
  if (!all.length) empty(ul, 'No tasks for this day. Type one above; a time like 9am or a day like Friday is understood.');
  for (const t of all) ul.appendChild(taskRow(t, true));
  c.appendChild(ul);
  return c;
}
function taskRow(t, showMove) {
  const acts = [];
  if (showMove && !t.done) {
    const lane = C.laneOf(t, S.today);
    if (lane === 'today') acts.push(btn('Tomorrow', () => change((st) => (t.day ? C.moveTask(st, t.id, C.addDays(t.day < S.today ? S.today : t.day, 1)) : C.setLane(st, t.id, 'next'))), 'small', 'Move to the next day: ' + t.text));
    else acts.push(btn('Today', () => change((st) => (t.day ? C.moveTask(st, t.id, S.today) : C.setLane(st, t.id, 'today'))), 'small', 'Move to today: ' + t.text));
  }
  const li = itemRow({ text: t.text, time: t.slot, done: t.done, tick: () => change((st) => C.toggleTask(st, t.id)), meta: taskMeta(t), cls: t.late ? 'late' : '', open: () => taskSheet(S.state.tasks.find((x) => x.id === t.id)), actions: acts });
  if (t.subs && t.subs.length) {
    const sub = h('ul', 'rows subs'); for (const s of t.subs) sub.appendChild(toggleRow(s.done, s.text, '', () => change((st) => C.toggleTask(st, s.id))));
    const wrap = h('li', 'withsubs'); const inner = h('ul', 'rows'); inner.appendChild(li); wrap.appendChild(inner); wrap.appendChild(sub); return wrap;
  }
  return li;
}
function checklistCard(day, v) {
  const c = card('Pre-session checklist');
  c.appendChild(h('p', 'note', `${v.checkDone} of ${v.check.length} done`));
  const ul = h('ul', 'rows'); if (!v.check.length) empty(ul, 'The checklist is empty. Add lines in the Data tab.');
  for (const x of v.check) ul.appendChild(toggleRow(x.done, x.text, '', () => change((st) => C.toggleCheck(st, day, x.id))));
  c.appendChild(ul); return c;
}
function reviewCard(day, v) {
  const c = card('Post-session review'), r = S.state.post[day] || { rating: '', mood: '', lesson: '', rule: '' };
  c.appendChild(h('p', 'note', 'Five minutes after the session. Epilogue and Lyceum can read it.'));
  c.appendChild(h('span', 'note', 'How did you trade the plan?'));
  const g1 = h('div', 'seg'); g1.setAttribute('role', 'group'); g1.setAttribute('aria-label', 'How did you trade the plan');
  for (const [k, l] of C.RATINGS) g1.appendChild(chip(l, r.rating === k, () => change((st) => C.setReview(st, day, { rating: r.rating === k ? '' : k, at: Date.now() }))));
  c.appendChild(g1);
  c.appendChild(h('span', 'note', 'How did you feel?'));
  const g2 = h('div', 'seg'); g2.setAttribute('role', 'group'); g2.setAttribute('aria-label', 'How did you feel');
  for (const [k, l] of C.MOODS) g2.appendChild(chip(l, r.mood === k, () => change((st) => C.setReview(st, day, { mood: r.mood === k ? '' : k, at: Date.now() }))));
  c.appendChild(g2);
  const ul = h('ul', 'rows'); for (const x of v.post) ul.appendChild(toggleRow(x.done, x.text, '', () => change((st) => C.togglePost(st, day, x.id)))); c.appendChild(ul);
  const l1 = h('label', 'note', 'The one lesson'); l1.htmlFor = 'rvLesson'; const i1 = h('input'); i1.type = 'text'; i1.id = 'rvLesson'; i1.maxLength = 300; i1.value = r.lesson; i1.placeholder = 'What did the day teach you?';
  const l2 = h('label', 'note', 'The one rule for tomorrow'); l2.htmlFor = 'rvRule'; const i2 = h('input'); i2.type = 'text'; i2.id = 'rvRule'; i2.maxLength = 200; i2.value = r.rule; i2.placeholder = 'One short rule';
  const sv = () => { clearTimeout(reviewTimer); C.setReview(S.state, day, { lesson: i1.value, rule: i2.value, at: Date.now() }); save(); say('Review saved.'); };
  i1.addEventListener('change', sv); i2.addEventListener('change', sv);
  c.appendChild(l1); c.appendChild(i1); c.appendChild(l2); c.appendChild(i2);
  return c;
}
function habitsTodayCard(day, v) {
  const c = card('Habits'), ul = h('ul', 'rows');
  if (!v.habits.length) empty(ul, 'No habits yet. Add one in the Habits tab.');
  for (const x of v.habits) ul.appendChild(toggleRow(x.done, x.name, x.streak ? `${x.streak} day${x.streak === 1 ? '' : 's'} in a row` : '', () => change((st) => C.toggleHabit(st, day, x.id))));
  c.appendChild(ul); return c;
}
function noteCard(day) {
  const c = card('Note for ' + C.dayLabel(day)), ta = h('textarea'); ta.id = 'noteIn'; ta.rows = 5; ta.maxLength = 4000; ta.setAttribute('aria-label', 'Note for the day'); ta.placeholder = 'The one rule, what you saw, what to do differently. It saves as you type.'; ta.value = C.dayView(S.state, day).note;
  const cnt = h('p', 'note', `${ta.value.length} of 4000 characters`);
  ta.addEventListener('input', () => { C.setDayNote(S.state, day, ta.value); cnt.textContent = `${ta.value.length} of 4000 characters`; clearTimeout(noteTimer); noteTimer = setTimeout(save, 300); });
  ta.addEventListener('blur', () => { clearTimeout(noteTimer); save(); });
  c.appendChild(ta); c.appendChild(cnt); return c;
}
function renderToday() {
  const d = S.day, v = C.dayView(S.state, d), box = $('v-today'); clear(box);
  $('dayTitle').textContent = C.dayLabel(d); $('daySub').textContent = d === S.today ? 'Today' : d < S.today ? 'A past day' : 'A day ahead'; $('dayToday').hidden = d === S.today;
  box.appendChild(tradingCard(d)); const wc = workCard(d); if (wc) box.appendChild(wc); box.appendChild(agendaCard(d)); box.appendChild(checklistCard(d, v)); box.appendChild(todayTasksCard(d)); box.appendChild(habitsTodayCard(d, v)); box.appendChild(reviewCard(d, v)); box.appendChild(noteCard(d));
}

// ------------------------------------------------------------------------------------------------ Calendar
function calNav(n) {
  const c = S.cal;
  if (c.view === 'month') c.day = (() => { const ym = C.addMonths(C.monthKey(c.day), n), dd = Math.min(Number(c.day.slice(8)), C.daysInMonth(ym)); return `${ym}-${String(dd).padStart(2, '0')}`; })();
  else c.day = C.addDays(c.day, c.view === 'week' ? 7 * n : n);
  render();
}
function dots(cats, risk) { const w = h('span', 'dots'); for (const k of cats) { const d = h('i'); d.style.background = catColor(k); w.appendChild(d); } if (risk === 'high' || risk === 'med') w.appendChild(h('i', 'risk ' + risk)); return w; }
function renderCalendar() {
  const c = S.cal, body = $('calBody'); clear(body);
  for (const b of $('calView').querySelectorAll('button')) b.setAttribute('aria-pressed', b.dataset.view === c.view ? 'true' : 'false');
  $('tgWin').setAttribute('aria-pressed', S.state.prefs.windows ? 'true' : 'false'); $('tgMkt').setAttribute('aria-pressed', S.state.prefs.market ? 'true' : 'false');
  const mk = S.state.prefs.market ? S.market : null;
  if (c.view === 'month') {
    const ym = C.monthKey(c.day); $('calTitle').textContent = C.monthLabel(ym); $('calSub').textContent = 'Tap a day to see it below';
    const grid = h('div', 'mgrid'); grid.setAttribute('role', 'grid');
    for (const w of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) grid.appendChild(h('span', 'mhead', w));
    for (const row of C.monthGrid(S.state, ym, S.today, mk)) for (const cell of row) {
      const b = h('button', 'mcell' + (cell.inMonth ? '' : ' out') + (cell.today ? ' today' : '') + (cell.day === c.day ? ' sel' : '') + (C.isWeekend(cell.day) ? ' wkend' : '')); b.type = 'button';
      b.setAttribute('aria-label', `${C.dayLabel(cell.day)}: ${cell.n} event${cell.n === 1 ? '' : 's'}${cell.tasks ? ', ' + cell.tasks + ' to do' : ''}${cell.risk === 'high' ? ', red market day' : cell.risk === 'med' ? ', amber market day' : ''}`);
      b.setAttribute('aria-pressed', cell.day === c.day ? 'true' : 'false');
      b.appendChild(h('b', '', C.dayNum(cell.day))); b.appendChild(dots(cell.cats, cell.risk));
      b.addEventListener('click', () => { c.day = cell.day; render(); }); grid.appendChild(b);
    }
    body.appendChild(grid);
  } else if (c.view === 'week') {
    const days = C.weekDays(c.day); $('calTitle').textContent = `${C.dayLabel(days[0])} to ${C.dayLabel(days[6])}`; $('calSub').textContent = 'Tap a day to see it below';
    const ul = h('ul', 'rows');
    for (const d of days) {
      const evs = C.agenda(S.state, d), m = mk ? C.marketOn(mk, d) : [], li = h('li', 'row'), b = h('button', 'rowbtn' + (d === S.today ? ' today' : '') + (d === c.day ? ' sel' : '') + (C.isWeekend(d) ? ' weekend' : '')); b.type = 'button';
      b.setAttribute('aria-label', `${C.dayLabel(d)}: ${evs.length} item${evs.length === 1 ? '' : 's'}`);
      const dn = h('span', 'dn', C.shortDay(d)); dn.appendChild(h('b', '', C.dayNum(d))); b.appendChild(dn);
      const t = h('span', 'txt'); t.appendChild(h('span', 'mini', evs.length ? evs.slice(0, 2).map((a) => (a.start ? a.start + ' ' : '') + a.title).join(' · ') + (evs.length > 2 ? ` +${evs.length - 2}` : '') : (C.isWeekend(d) ? 'No trading' : 'Nothing planned')));
      if (m.length) t.appendChild(h('small', '', m.map((e) => (e.time ? e.time + ' ' : '') + e.title).slice(0, 2).join(' · ')));
      b.appendChild(t); b.appendChild(dots([...new Set(evs.map((a) => a.cat).filter(Boolean))].slice(0, 3), C.marketRisk(m)));
      b.addEventListener('click', () => { c.day = d; render(); }); li.appendChild(b); ul.appendChild(li);
    }
    body.appendChild(ul);
  } else {
    $('calTitle').textContent = C.dayLabel(c.day); $('calSub').textContent = C.dayLong(c.day);
    body.appendChild(dayStrip(c.day));
  }
  // the selected day, below
  const d = c.day, box = $('calDay'); clear(box);
  $('calDayH').textContent = C.dayLong(d) + (d === S.today ? ' (today)' : '');
  const ul = h('ul', 'rows'), items = C.agenda(S.state, d);
  if (!items.length) empty(ul, 'No events or timed tasks on this day.');
  for (const a of items) {
    const ev = a.kind === 'event' ? S.state.events.find((e) => e.id === a.id) : null, tk = a.kind === 'task' ? S.state.tasks.find((t) => t.id === a.id) : null;
    ul.appendChild(itemRow({ text: a.title, time: a.allDay ? 'All day' : a.start + (a.end ? '-' + a.end : ''), color: a.kind === 'event' ? catColor(a.cat) : '', done: a.done, tick: tk ? () => change((st) => C.toggleTask(st, tk.id)) : null,
      meta: (a.kind === 'task' ? 'Task' : C.CATS.find((x) => x.id === a.cat).label) + (a.repeat !== 'none' ? ' · ' + C.REPEATS.find((r) => r[0] === a.repeat)[1].toLowerCase() : '') + (a.remind ? ' · reminder' : ''), open: () => { if (ev) eventSheet(ev, d); else if (tk) taskSheet(tk); } }));
  }
  box.appendChild(ul);
  const due = S.state.tasks.filter((t) => !t.parent && t.day === d && !t.slot);
  if (due.length) { box.appendChild(h('b', 'note', 'Tasks due')); const tu = h('ul', 'rows'); for (const t of due) tu.appendChild(taskRow({ ...t, subs: [], subsDone: 0, late: false }, false)); box.appendChild(tu); }
  const m = mk ? C.marketOn(mk, d) : [];
  if (m.length) { box.appendChild(h('b', 'note', 'Market events' + (S.marketDemo ? ' (example)' : ''))); const mu = h('ul', 'rows'); marketRows(m, mu); box.appendChild(mu); }
  if (S.state.prefs.windows) {
    const bl = C.sessionBlocks(d);
    if (bl.length) { box.appendChild(h('b', 'note', 'Bot windows, New York time')); const wu = h('ul', 'wins'); for (const w of bl) { const li = h('li', 'win ' + w.tone); li.appendChild(h('span', 'slot', w.from + '-' + w.to)); const t = h('span', 'txt', w.label); t.appendChild(h('small', '', w.who)); li.appendChild(t); wu.appendChild(li); } box.appendChild(wu); }
  }
  box.appendChild(h('div', 'seg')).appendChild(btn('Add an event on ' + C.dayLabel(d), () => eventSheet(null, d), 'small primary'));
}
// the Day view's picture: the 24 hours as a bar with the bot windows (when on) and your events as gold ticks
function dayStrip(day) {
  const w = h('div', 'strip'); w.setAttribute('role', 'img');
  const evs = C.agenda(S.state, day).filter((a) => a.start), bl = S.state.prefs.windows ? C.sessionBlocks(day) : [];
  w.setAttribute('aria-label', `The day from 00:00 to 24:00. ${bl.length ? 'Bots may enter 02:00 to 15:30. ' : ''}${evs.length} timed item${evs.length === 1 ? '' : 's'}.`);
  const pc = (hm) => (C.hmMins(hm) / 1440) * 100;
  for (const b of bl) { if (b.id === 'asia' || b.id === 'break') continue; const s = h('i', 'seg-' + b.tone); s.style.left = pc(b.from) + '%'; s.style.width = Math.max(1, pc(b.to) - pc(b.from)) + '%'; s.title = b.label; w.appendChild(s); }
  for (const a of evs) { const t = h('b', 'tick-' + a.kind); t.style.left = pc(a.start) + '%'; t.style.background = a.kind === 'event' ? catColor(a.cat) : 'var(--oly-th-n30, #cfc4b2)'; w.appendChild(t); }
  const wrap = h('div', 'stripwrap'); wrap.appendChild(w);
  const lab = h('div', 'striplab'); for (const x of ['00', '06', '12', '18', '24']) lab.appendChild(h('span', '', x)); wrap.appendChild(lab);
  if (day === S.today) { const n = C.sessionState(nowDate()); const m = h('em', 'nowmark'); m.style.left = (n.mins / 1440) * 100 + '%'; w.appendChild(m); }
  return wrap;
}

// ------------------------------------------------------------------------------------------------ Tasks and Projects
function renderTasks() {
  const L = C.lanes(S.state, S.today, { project: S.proj }), bx = $('laneBtns'); clear(bx);
  for (const [k, l] of [...C.LANES, ['done', 'Done']]) bx.appendChild(chip(`${l} ${L[k].length}`, S.lane === k, () => { S.lane = k; render(); }, `${l}: ${L[k].length} task${L[k].length === 1 ? '' : 's'}`));
  const sel = $('taskProj'); clear(sel); const o0 = h('option', '', 'All projects'); o0.value = ''; sel.appendChild(o0);
  for (const p of S.state.projects) { const o = h('option', '', p.name); o.value = p.id; sel.appendChild(o); }
  sel.value = S.proj;
  const rows = $('taskRows'); clear(rows);
  const ul = h('ul', 'rows'), list = L[S.lane];
  const hint = { today: 'Nothing for today. Tasks due today or earlier land here by themselves.', next: 'Nothing next. Add a task, or move one here.', someday: 'Nothing parked for someday.', done: 'Nothing finished yet.' }[S.lane];
  if (!list.length) empty(ul, hint);
  for (const t of list) {
    const acts = [];
    if (S.lane === 'next') acts.push(btn('Someday', () => change((st) => C.setLane(st, t.id, 'someday')), 'small', 'Park for someday: ' + t.text));
    if (S.lane === 'someday') acts.push(btn('Next', () => change((st) => C.setLane(st, t.id, 'next')), 'small', 'Move to next: ' + t.text));
    const li = taskRow(t, S.lane !== 'done'); if (acts.length) { const row = li.classList.contains('withsubs') ? li.querySelector('.row') : li; for (const a of acts) row.appendChild(a); }
    ul.appendChild(li);
  }
  rows.appendChild(ul);
}
function renderProjects() {
  const box = $('projList'); clear(box);
  if (!S.state.projects.length) { const c = card(''); c.appendChild(h('p', 'lead', 'No projects yet. A project groups tasks: add one below, then pick it when you add a task.')); box.appendChild(c); return; }
  for (const p of S.state.projects) {
    const st = C.projectStats(S.state, p.id, S.today), c = card(''), top = h('div', 'hcard-top'), d = h('span', 'dot'); d.style.background = catColor(p.cat);
    const hh = h('h3', '', p.name); top.appendChild(d); top.appendChild(hh); if (p.done) top.appendChild(h('span', 'pill ok', 'Finished')); else if (st.late) top.appendChild(h('span', 'pill bad', st.late + ' late')); c.appendChild(top);
    c.appendChild(bar(st.pct, st.late ? 'amber' : 'green'));
    c.appendChild(h('p', 'note', st.total ? `${st.done} of ${st.total} tasks done${st.nextDue ? ' · next due ' + C.dayLabel(st.nextDue) : ''}` : 'No tasks yet.'));
    const seg = h('div', 'seg');
    seg.appendChild(btn('Tasks', () => { S.proj = p.id; S.lane = 'today'; const L = C.lanes(S.state, S.today, { project: p.id }); S.lane = L.today.length ? 'today' : L.next.length ? 'next' : L.someday.length ? 'someday' : 'today'; setTab('tasks'); }, 'small', 'Show the tasks of ' + p.name));
    seg.appendChild(btn('Add task', () => taskSheet(null, { project: p.id }), 'small', 'Add a task to ' + p.name));
    seg.appendChild(btn('Edit', () => projectSheet(p), 'small', 'Edit project ' + p.name));
    c.appendChild(seg); box.appendChild(c);
  }
}

// ------------------------------------------------------------------------------------------------ Habits and Goals
function renderHabits() {
  const box = $('habitCards'); clear(box);
  const hm = C.heatmap(S.state, S.today, 12), hx = $('heat'); clear(hx);
  $('heatNote').textContent = S.state.habits.length ? 'Each square is one week. Darker means closer to that habit\'s goal for the week.' : 'Add a habit to see the weeks fill in.';
  for (const r of hm.rows) {
    const row = h('div', 'hrow'); row.appendChild(h('span', 'hname', r.name));
    const g = h('span', 'hcells'); g.setAttribute('role', 'img'); g.setAttribute('aria-label', `${r.name}: ${r.cells.map((c) => c.n).join(', ')} days a week, oldest first`);
    for (const c of r.cells) { const i = h('i', 'lv' + c.level); i.title = `Week of ${C.dayLabel(c.week)}: ${c.n} of ${r.perWeek}`; g.appendChild(i); }
    row.appendChild(g); hx.appendChild(row);
  }
  if (!S.state.habits.length) { const c = card(''); c.appendChild(h('p', 'note', 'No habits yet. Add one below.')); box.appendChild(c); return; }
  for (const x of S.state.habits) {
    const c = card(''), top = h('div', 'hcard-top'), st = C.streak(S.state, x.id, S.today), best = C.bestStreak(S.state, x.id);
    top.appendChild(h('h3', '', x.name));
    const key = 'hab:' + x.id, a = S.arm === key;
    top.appendChild(btn(a ? 'Tap again' : 'Remove', () => { if (armed(key)) change((s) => C.removeHabit(s, x.id)); }, 'small warnbtn', (a ? 'Tap again to remove ' : 'Remove ') + x.name)); c.appendChild(top);
    const wk = C.habitWeek(S.state, x.id, S.today), n = wk.filter((d) => d.done).length;
    c.appendChild(h('p', 'note', `${st ? st + ' day' + (st === 1 ? '' : 's') + ' in a row' : 'No streak yet. Tap today to start one.'} · best ${best} · this week ${n} of ${x.perWeek}`));
    const wb = h('div', 'hweek');
    for (const d of wk) {
      const b = h('button', 'hday' + (d.day === S.today ? ' now' : '')); b.type = 'button'; b.setAttribute('aria-pressed', d.done ? 'true' : 'false'); b.setAttribute('aria-label', `${x.name}, ${C.dayLabel(d.day)}`);
      b.appendChild(h('span', '', C.shortDay(d.day).slice(0, 2))); b.appendChild(h('b', '', C.dayNum(d.day))); b.addEventListener('click', () => change((s) => C.toggleHabit(s, d.day, x.id))); wb.appendChild(b);
    }
    c.appendChild(wb); box.appendChild(c);
  }
}
function renderGoals() {
  const box = $('goalList'); clear(box);
  if (!S.state.goals.length) { const c = card(''); c.appendChild(h('p', 'lead', 'No goals yet. A goal is something bigger than a task: add one below, then link tasks to it.')); box.appendChild(c); }
  for (const g of S.state.goals) {
    const c = card(''), top = h('div', 'hcard-top'), pr = C.goalProgress(S.state, g); top.appendChild(h('h3', '', g.name)); top.appendChild(h('span', 'score', pr.pct + '%')); c.appendChild(top);
    c.appendChild(bar(pr.pct, 'green'));
    c.appendChild(h('p', 'note', (pr.from === 'tasks' ? `${pr.done} of ${pr.total} linked tasks done` : 'Progress set by hand. Link tasks to follow it automatically.') + (g.due ? ' · by ' + C.dayLabel(g.due) : '')));
    const ag = g.argo && S.argo ? S.argo.find((a) => a.id === g.argo) : null;
    if (g.argo) c.appendChild(h('p', 'note', ag ? `Argo goal: ${ag.name} (${ag.text}). Argo keeps its own progress.` : 'Linked to an Argo goal that is not on this phone now.'));
    if (g.note) c.appendChild(h('p', 'note', g.note));
    const seg = h('div', 'seg');
    if (pr.from === 'manual') { seg.appendChild(btn('-10%', () => change((st) => C.updateGoal(st, g.id, { pct: Math.max(0, g.pct - 10) })), 'small', 'Less progress on ' + g.name)); seg.appendChild(btn('+10%', () => change((st) => C.updateGoal(st, g.id, { pct: Math.min(100, g.pct + 10) })), 'small', 'More progress on ' + g.name)); }
    seg.appendChild(btn('Add step', () => taskSheet(null, { goal: g.id }), 'small', 'Add a task for ' + g.name));
    seg.appendChild(btn('Edit', () => goalSheet(g), 'small', 'Edit goal ' + g.name));
    c.appendChild(seg); box.appendChild(c);
  }
  const ul = $('argoList'); clear(ul);
  const ag = S.argo || C.argoGoals(C.ARGO_STARTERS) || [];
  $('argoNote').textContent = S.argoReal ? 'Read from Argo on this phone. Planner never changes them: link one to a goal above.' : 'Argo has no saved goals on this phone yet, so these are its starting goals. Open Argo to set your own.';
  for (const a of ag) { const li = h('li', 'row'); const t = h('span', 'rowbtn static'); t.appendChild(h('span', 'txt', a.name)).appendChild(h('small', '', a.text)); li.appendChild(t); ul.appendChild(li); }
}

// ------------------------------------------------------------------------------------------------ Notes, Find, Focus, Data
function renderNotes() {
  const q = $('noteQ').value.trim().toLowerCase(), tagsBox = $('noteTags'); clear(tagsBox);
  const tags = C.allTags(S.state);
  for (const [t, n] of tags.slice(0, 12)) tagsBox.appendChild(chip(`#${t} ${n}`, q === '#' + t, () => { $('noteQ').value = q === '#' + t ? '' : '#' + t; renderNotes(); }, `Notes tagged ${t}`));
  const words = q.replace(/#[^\s]+/g, ' ').split(/\s+/).filter(Boolean), tg = [...q.matchAll(/#([^\s]+)/g)].map((m) => m[1]);
  const list = S.state.notes.filter((n) => tg.every((t) => n.tags.includes(t)) && words.every((w) => (n.title + ' ' + n.text + ' ' + n.tags.join(' ')).toLowerCase().includes(w)))
    .sort((a, b) => (b.pin - a.pin) || (b.day || '').localeCompare(a.day || '') || b.at - a.at || b.id.localeCompare(a.id, 'en', { numeric: true }));
  const ul = $('noteList'); clear(ul);
  if (!list.length) empty(ul, S.state.notes.length ? 'No note matches. Clear the search.' : 'No notes yet. Tap New note, or write the note for a day on Today.');
  for (const n of list.slice(0, 100)) {
    const li = h('li', 'row'), b = h('button', 'rowbtn'); b.type = 'button';
    const t = h('span', 'txt', (n.pin ? 'Pinned: ' : '') + (n.title || (n.text.split('\n')[0] || '').slice(0, 60) || 'Note')); t.appendChild(h('small', '', (n.day ? C.dayLabel(n.day) + ' · ' : '') + (n.tags.length ? '#' + n.tags.join(' #') + ' · ' : '') + n.text.replace(/\s+/g, ' ').slice(0, 80)));
    b.appendChild(t); b.addEventListener('click', () => noteSheet(n)); li.appendChild(b); ul.appendChild(li);
  }
}
function openResult(r) {
  const st = S.state;
  if (r.kind === 'task') { const t = st.tasks.find((x) => x.id === r.id); if (t) taskSheet(t); } else if (r.kind === 'event') { const e = st.events.find((x) => x.id === r.id); if (e) eventSheet(e, e.day); }
  else if (r.kind === 'note') { const n = st.notes.find((x) => x.id === r.id); if (n) noteSheet(n); } else if (r.kind === 'project') setTab('projects'); else if (r.kind === 'goal') setTab('goals');
  else if (r.kind === 'habit') setTab('habits'); else if (r.kind === 'checklist') setTab('data'); else if (r.kind === 'review') { S.day = r.id; setTab('today'); }
}
function renderFind() {
  const ul = $('findOut'); clear(ul); const q = $('findIn').value;
  if (!q.trim()) { empty(ul, 'Type to search everything: tasks, events, notes, goals, habits and your session reviews.'); $('findNote').textContent = 'Every word you type must appear. Add #tag to search notes by tag.'; return; }
  const res = C.search(S.state, q); $('findNote').textContent = `${res.length} result${res.length === 1 ? '' : 's'}`;
  if (!res.length) empty(ul, 'Nothing found. Try fewer words.');
  for (const r of res) { const li = h('li', 'row'), b = h('button', 'rowbtn'); b.type = 'button'; const t = h('span', 'txt', r.title); t.appendChild(h('small', '', r.sub)); b.appendChild(t); b.addEventListener('click', () => openResult(r)); li.appendChild(b); ul.appendChild(li); }
}
function renderData() {
  const c = C.counts(S.state);
  $('expSum').textContent = `${c.tasks} task${c.tasks === 1 ? '' : 's'}, ${c.events} event${c.events === 1 ? '' : 's'}, ${c.projects} project${c.projects === 1 ? '' : 's'}, ${c.habits} habit${c.habits === 1 ? '' : 's'}, ${c.goals} goal${c.goals === 1 ? '' : 's'}, ${c.notes} note${c.notes === 1 ? '' : 's'}.`;
  for (const [ulId, list, key] of [['clEdit', S.state.checklist, 'checklist'], ['pcEdit', S.state.postlist, 'postlist']]) {
    const ul = $(ulId); clear(ul); if (!list.length) empty(ul, 'No lines. Add the first one below.');
    for (const x of list) {
      const li = h('li', 'row edit-row'); li.appendChild(h('span', 'txt', x.text));
      const k = key + ':' + x.id, a = S.arm === k;
      li.appendChild(btn(a ? 'Sure?' : '×', () => { if (armed(k)) change((s) => C.removeChecklist(s, x.id, key)); }, 'warnbtn' + (a ? ' armed' : ''), (a ? 'Tap again to delete ' : 'Delete ') + x.text)); ul.appendChild(li);
    }
  }
  $('stMsg').textContent = S.demo ? 'Showing the example plan. Nothing is saved until you tap Start my plan.' : S.saveOk === false ? 'This browser would not save. Use Export to keep your plan.' : 'Saved on this phone' + (S.savedAt ? ', last change ' + new Date(S.savedAt).toLocaleString() : '') + '. It works offline.';
  const from = S.state.from || '';
  $('stFrom').textContent = from && from !== 'demo' ? `Moved over from your earlier Planner (${from.replace('agora.v1', 'Planner v1').replace('planner.v1', 'the first Planner')}). The old copy is still stored, untouched.` : 'Your plan is stored in this browser only.';
  $('resetBtn').textContent = S.arm === 'reset' ? 'Tap again to erase everything' : 'Reset to a blank plan';
}

// the focus timer: 25 minutes of work, 5 off, a 15 minute break after four rounds
function focusSave() { if (S.focus) lsSet(C.FOCUS_KEY, JSON.stringify(S.focus)); else lsDel(C.FOCUS_KEY); }
function focusNotify(text) {
  say(text);
  try { if (S.state.prefs.notify && typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification('Planner', { body: text }); } catch (_) { /* on-screen only */ }
  try { if (navigator.vibrate) navigator.vibrate(120); } catch (_) { /* nothing */ }
}
function renderFocus() {
  const f = S.focus, now = Date.now();
  const sel = $('fTask'); if (!sel.dataset.built || sel.dataset.n !== String(S.state.tasks.length) + S.today) {
    const keep = sel.value; clear(sel); const o0 = h('option', '', '(nothing in particular)'); o0.value = ''; sel.appendChild(o0);
    for (const t of S.state.tasks.filter((x) => !x.done && !x.parent).slice(0, 60)) { const o = h('option', '', t.text); o.value = t.id; sel.appendChild(o); }
    sel.value = keep; sel.dataset.built = '1'; sel.dataset.n = String(S.state.tasks.length) + S.today;
  }
  if (f && !f.paused && C.focusLeft(f, now) <= 0) { focusDone(); return; }
  const left = f ? C.focusLeft(f, now) : C.FOCUS.work * 60, total = f ? f.mins * 60 : C.FOCUS.work * 60;
  $('fTime').textContent = C.clockText(left); $('fBar').style.width = f ? Math.round((1 - left / total) * 100) + '%' : '0%';
  $('fPhase').textContent = !f ? 'Ready. 25 minutes of work, then 5 off.' : f.paused ? 'Paused.' : f.phase === 'work' ? `Work, round ${f.round}. Stay on one thing.` : f.phase === 'long' ? 'Long break, 15 minutes. Step away from the screen.' : 'Short break, 5 minutes. Stand up, drink water.';
  $('fStart').hidden = !!f; $('fPause').hidden = !f; $('fPause').textContent = f && f.paused ? 'Resume' : 'Pause';
  const day = C.etParts(nowDate()).day, fs = S.state.focus[day];
  $('fStats').textContent = fs ? `Today: ${fs.n} round${fs.n === 1 ? '' : 's'}, ${fs.min} minutes of focus.` : 'No focus rounds yet today.';
  $('fNotify').setAttribute('aria-pressed', S.state.prefs.notify ? 'true' : 'false');
}
function focusDone() {
  const f = S.focus; if (!f) return;
  if (f.phase === 'work') { if (!S.demo) { C.logFocus(S.state, C.etParts(nowDate()).day, f.mins); save(); } focusNotify(f.round % C.FOCUS.every === 0 ? 'Round done. Take a long break.' : 'Round done. Take 5 minutes.'); }
  else focusNotify('Break over. Next round when you are ready.');
  S.focus = C.focusNext(f, Date.now()); if (S.focus.phase === 'work') S.focus = null; focusSave(); renderFocus();
}
function focusStartBtn() { S.focus = C.focusStart(Date.now(), 'work', 1, $('fTask').value); focusSave(); renderFocus(); }
function focusTick() { if (S.tab === 'focus' || S.focus) { try { renderFocus(); } catch (_) { /* nothing */ } } }

// ------------------------------------------------------------------------------------------------ everything else
function renderRemind() {
  const ul = $('remindBar'); clear(ul);
  const list = C.reminders(S.state, nowDate().getTime());
  ul.hidden = !list.length;
  for (const r of list.slice(0, 4)) ul.appendChild(h('li', 'rem ' + r.state, r.state === 'now' ? `${r.title}: started at ${r.start}` : `${r.title} at ${r.start}, in ${C.duration(r.mins)}`));
}
function renderHeader() {
  $('demo').hidden = !S.demo; $('demoBar').hidden = !S.demo;
  try { $('lite').hidden = !(O && O.lite && O.lite()); } catch (_) { $('lite').hidden = true; }
}
function render() {
  S.today = C.etParts(nowDate()).day;
  if (!C.validDay(S.day)) S.day = S.today;
  if (!C.validDay(S.cal.day)) S.cal.day = S.today;
  renderHeader(); renderRemind();
  const fn = { today: renderToday, calendar: renderCalendar, tasks: renderTasks, projects: renderProjects, habits: renderHabits, goals: renderGoals, notes: renderNotes, focus: renderFocus, find: renderFind, data: renderData }[S.tab];
  $('dayNav').hidden = S.tab !== 'today';
  fn();
  const v = C.dayView(S.state, S.day);
  say(`${C.dayLabel(S.day)}: ${v.tasksDone} of ${v.tasks.length} tasks, checklist ${v.checkDone} of ${v.check.length}, habits ${v.habitsDone} of ${v.habits.length}.${S.demo ? ' Example plan.' : ''}`);
  S.ready = true;
  try { if (O && O.ready) O.ready(); } catch (_) { /* the veil lifts by itself */ }
}
function setTab(t) {
  S.tab = TABS.includes(t) ? t : 'today';
  for (const id of TABS) { const on = id === S.tab; $('tab-' + id).setAttribute('aria-selected', on ? 'true' : 'false'); $('p-' + id).hidden = !on; }
  render();
  const el = $('tab-' + S.tab); try { if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (_) { /* nothing */ }
}

// ------------------------------------------------------------------------------------------------ actions
function doExport() {
  const text = C.exportText(S.state, Date.now()), name = C.exportName(S.today);
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    say(`Exported ${name}. Keep it somewhere safe.`);
  } catch (_) { say('Export did not work on this browser. Copy the text from the import box instead.'); $('impText').value = text; }
}
function doIcs() {
  const text = C.toICS(S.state, Date.now()), name = C.icsName(S.today);
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar' })), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    say(`Exported ${name}: ${S.state.events.length} event${S.state.events.length === 1 ? '' : 's'}. Open it with any calendar app.`);
  } catch (_) { say('The calendar file did not work on this browser.'); }
}
function doImport() {
  const r = C.parseImport($('impText').value), msg = $('impMsg');
  if (!r.ok) { msg.textContent = r.error; say(r.error); return; }
  if (!S.demo) lsSet(C.STORE_KEY + '.backup', JSON.stringify(S.state));
  S.state = r.state; S.state.from = S.state.from || (r.from === 'v2' ? '' : r.from); S.demo = false; S.saveOk = null;
  save(); render();
  const c = r.counts, m = `Imported ${c.tasks} tasks, ${c.events} events, ${c.habits} habits and ${c.notes} notes.`;
  $('impMsg').textContent = m; $('impText').value = ''; say(m);
}
function startPlan() {
  S.demo = false; S.state = C.blankState(); save(); setTab('today'); say('Your plan is ready. It is saved on this phone.');
}
function quickAdd(text) {
  const q = C.parseQuick(text, S.today, { kind: S.kind, projects: S.state.projects, defaultLane: S.tab === 'today' ? 'today' : 'next' });
  if (!q.text) { say('Type it first, for example "Fri 9am journal review".'); return false; }
  let made = '';
  change((st) => {
    if (q.projectName && !q.project) { const p = C.addProject(st, q.projectName); if (p) q.project = p.id; }
    if (q.kind === 'event') { const e = C.addEvent(st, { title: q.text, day: q.day, start: q.start, end: q.end, repeat: q.repeat, cat: q.cat || (q.project ? (st.projects.find((p) => p.id === q.project) || {}).cat : 'other'), remind: q.remind }); if (e) made = 'event'; }
    else { const t = C.addTask(st, q, S.today); if (t) made = 'task'; }
  });
  say(made ? `Added. ${C.describeQuick(q)}.` : 'That could not be added (the list is full).');
  return !!made;
}
function wire() {
  for (const id of TABS) $('tab-' + id).addEventListener('click', () => setTab(id));
  $('dayPrev').addEventListener('click', () => { S.day = C.addDays(S.day, -1); render(); });
  $('dayNext').addEventListener('click', () => { S.day = C.addDays(S.day, 1); render(); });
  $('dayToday').addEventListener('click', () => { S.day = S.today; render(); });
  $('startBtn').addEventListener('click', startPlan);
  $('qForm').addEventListener('submit', (e) => { e.preventDefault(); const v = $('qIn').value; if (quickAdd(v)) { $('qIn').value = ''; $('qPrev').textContent = 'A time or "every ..." makes an event, otherwise a task.'; } $('qIn').focus(); });
  const prev = () => { const v = $('qIn').value; $('qPrev').textContent = v.trim() ? C.describeQuick(C.parseQuick(v, S.today, { kind: S.kind, projects: S.state ? S.state.projects : [] })) || 'Keep typing...' : 'A time or "every ..." makes an event, otherwise a task. Try "every Sunday weekly review".'; };
  $('qIn').addEventListener('input', prev);
  for (const b of $('qForm').querySelectorAll('[data-kind]')) b.addEventListener('click', () => { S.kind = b.dataset.kind; for (const x of $('qForm').querySelectorAll('[data-kind]')) x.setAttribute('aria-pressed', x.dataset.kind === S.kind ? 'true' : 'false'); prev(); });
  for (const b of $('calView').querySelectorAll('button')) b.addEventListener('click', () => { S.cal.view = b.dataset.view; render(); });
  $('calPrev').addEventListener('click', () => calNav(-1)); $('calNext').addEventListener('click', () => calNav(1));
  $('calToday').addEventListener('click', () => { S.cal.day = S.today; render(); });
  $('calAdd').addEventListener('click', () => eventSheet(null, S.cal.day));
  $('tgWin').addEventListener('click', () => change((st) => { st.prefs.windows = !st.prefs.windows; }));
  $('tgMkt').addEventListener('click', () => change((st) => { st.prefs.market = !st.prefs.market; }));
  $('taskAdd').addEventListener('click', () => taskSheet(null, { project: S.proj, lane: S.lane === 'done' ? 'next' : S.lane, day: S.lane === 'today' ? S.today : '' }));
  $('taskProj').addEventListener('change', () => { S.proj = $('taskProj').value; render(); });
  $('projForm').addEventListener('submit', (e) => { e.preventDefault(); const v = $('projIn').value; if (!v.trim()) { say('Type the project name first.'); return; } change((st) => C.addProject(st, v)); $('projIn').value = ''; });
  $('habitForm').addEventListener('submit', (e) => { e.preventDefault(); const v = $('habitIn').value; if (!v.trim()) { say('Type the habit first.'); return; } change((st) => C.addHabit(st, v)); $('habitIn').value = ''; });
  $('goalForm').addEventListener('submit', (e) => { e.preventDefault(); const v = $('goalIn').value; if (!v.trim()) { say('Type the goal first.'); return; } change((st) => C.addGoal(st, v)); $('goalIn').value = ''; });
  $('clForm').addEventListener('submit', (e) => { e.preventDefault(); const v = $('clIn').value; if (!v.trim()) { say('Type the line first.'); return; } change((st) => C.addChecklist(st, v, 'checklist')); $('clIn').value = ''; });
  $('pcForm').addEventListener('submit', (e) => { e.preventDefault(); const v = $('pcIn').value; if (!v.trim()) { say('Type the line first.'); return; } change((st) => C.addChecklist(st, v, 'postlist')); $('pcIn').value = ''; });
  $('noteNew').addEventListener('click', () => noteSheet(null, { day: '', tags: [] }));
  $('noteQ').addEventListener('input', renderNotes);
  $('findIn').addEventListener('input', renderFind);
  $('fStart').addEventListener('click', focusStartBtn);
  $('fPause').addEventListener('click', () => { if (!S.focus) return; S.focus = S.focus.paused ? C.focusResume(S.focus, Date.now()) : C.focusPause(S.focus, Date.now()); focusSave(); renderFocus(); });
  $('fSkip').addEventListener('click', () => { if (S.focus) { S.focus = C.focusNext(S.focus, Date.now()); if (S.focus.phase === 'work') S.focus = null; } focusSave(); renderFocus(); });
  $('fReset').addEventListener('click', () => { S.focus = null; focusSave(); renderFocus(); });
  $('fNotify').addEventListener('click', async () => {
    if (S.state.prefs.notify) { change((st) => { st.prefs.notify = false; }); return; }
    let ok = false;
    $('fNote').textContent = 'Asking your phone to allow it...';
    try { if (typeof Notification !== 'undefined') ok = Notification.permission === 'granted' || (await Promise.race([Notification.requestPermission(), new Promise((res) => setTimeout(() => res('timeout'), 8000))])) === 'granted'; } catch (_) { ok = false; }
    change((st) => { st.prefs.notify = ok; });
    $('fNote').textContent = ok ? 'The phone will tell you when a round ends.' : 'Not allowed on this phone, so the clock above changes and this page says so instead.';
  });
  $('expBtn').addEventListener('click', doExport); $('icsBtn').addEventListener('click', doIcs); $('impBtn').addEventListener('click', doImport);
  $('impFile').addEventListener('change', () => {
    const f = $('impFile').files && $('impFile').files[0]; if (!f) return;
    const fr = new FileReader();
    fr.onload = () => { $('impText').value = String(fr.result || ''); $('impMsg').textContent = `${f.name} is loaded. Tap Import to use it.`; say('File loaded. Tap Import to use it.'); };
    fr.onerror = () => { $('impMsg').textContent = 'That file could not be read.'; };
    fr.readAsText(f); $('impFile').value = '';
  });
  $('resetBtn').addEventListener('click', () => { if (armed('reset')) { S.demo = false; S.state = C.blankState(); save(); render(); say('The plan is blank again.'); } });
  $('sheetX').addEventListener('click', closeSheet); $('sheetBg').addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.sheet) closeSheet(); });
  window.addEventListener('pagehide', () => { clearTimeout(noteTimer); save(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); focusTick(); } });
}

async function boot() {
  const q = new URLSearchParams(location.search);
  S.forced = q.get('demo') === '1';
  const at = q.get('at'); if (at) { const d = new Date(at); if (Number.isFinite(d.getTime())) S.fixedNow = d; }
  S.today = C.etParts(nowDate()).day; S.day = S.today; S.cal.day = S.today;
  const saved = S.forced ? { state: null, from: [] } : loadSaved();
  // your day (day.json) and the phone inbox are served only by the PC's private link (/site/..., engine/live_site.py): on the public site
  // they never exist, and asking was a 404 in the console on every open (phone QA 2026-11-16); missing = "connect your calendars", as before
  const onPc = /^\/site\//.test(location.pathname);
  const [ev, home, dayf, inb] = await Promise.all([S.forced ? null : getJSON('../pythia/events.json'), S.forced ? null : getJSON('../home.json'),
    S.forced || !onPc ? null : getJSON('../day/day.json'), S.forced || !onPc ? null : getJSON('../day/inbox.json')]);
  S.home = home;
  S.day0 = S.forced ? Day.norm(Day.demo(nowDate().getTime())) : Day.norm(dayf);
  S.inbox = Day.inboxItems(inb);
  if (saved.state) { S.state = saved.state; S.demo = false; S.from = saved.from; if (!saved.from.includes('v2')) save(); }
  else { S.fixture = await getJSON('./fixture.json'); S.state = C.buildDemo(S.fixture, S.today); S.demo = true; $('demoNote').textContent = (S.fixture && S.fixture.note) || 'Example plan, not real. Tap Start my plan to begin with your own.'; }
  if (!S.fixture && !C.botsView(S.home, null).real) S.fixture = await getJSON('./fixture.json');
  S.market = C.normMarket(ev);
  if (!S.market || !(S.market.events.length || S.market.weekly.length)) {
    if (!S.fixture) S.fixture = await getJSON('./fixture.json');
    S.market = C.marketFromFixture(S.fixture, S.today); S.marketDemo = true;
  }
  try { const raw = lsGet(C.ARGO_KEY); S.argo = raw ? C.argoGoals(JSON.parse(raw)) : null; } catch (_) { S.argo = null; }
  S.argoReal = !!S.argo; if (!S.argo) S.argo = C.argoGoals(C.ARGO_STARTERS);
  try { S.focus = C.cleanFocus(JSON.parse(lsGet(C.FOCUS_KEY) || 'null')); } catch (_) { S.focus = null; }
  S.inboxAdded = importInbox();
  if (S.inboxAdded) say(`${S.inboxAdded} item${S.inboxAdded === 1 ? '' : 's'} from your iPhone added to today.`);
  wire();
  try { S.scene = Scene.mount($('scene'), { lite: !!(O && O.lite && O.lite()), reduced: window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches, now: nowDate, hoursOf: (d) => { const p = C.etParts(d); return p.hh + p.mm / 60; } }); } catch (_) { S.scene = null; }
  render();
  tickTimer = setInterval(() => { if (!document.hidden) { renderClock(); renderRemind(); } }, 30000);
  setInterval(focusTick, 1000);
}
window.PLANNER = { S, C, ready: () => S.ready, render, setTab, closeSheet };
boot().catch((e) => { say('Something went wrong: ' + (e && e.message ? e.message : e)); try { if (O && O.fail) O.fail('Planner could not start'); } catch (_) { /* nothing */ } });
void tickTimer;
