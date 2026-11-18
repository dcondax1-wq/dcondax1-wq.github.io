// ARENA sources (ES module): every event the page scores and every fact a quest is checked against, each from one named place.
//   loadSite()             -> { doc, demo }   ./events.json (the site's verifiable trading events, tools/arena/build.py);
//                                             missing or broken -> the committed demo (doc.demo = true, DEMO badge)
//   loadRules()            -> rules.json
//   plannerEvents(S, today)-> { events, facts }   the Planner on this phone (localStorage 'planner.v1' / 'planner.hosted.v1',
//                                             read the way jarvis/data.js and hermes/data.js do): tasks done, habits, daily goals
//   vaultEvents(snap, today) -> { events, facts }   Obsidian daily notes from ../jarvis/obsidian.js graphSnapshot() (this phone's cache)
//   kalshiEvents(k, today) -> { events, facts }   the Kalshi bot's own feed (kalshi.json days) through ../jarvis/data.js
//   gather(today)          -> { events, facts, linked }   all phone sources together; a missing one is simply "not linked"
// Read-only: nothing here writes to a bot, the Planner or the vault.
import { etDay } from './rules.js';

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const txt = (x, n = 80) => (typeof x === 'string' ? x : typeof x === 'number' ? String(x) : '').replace(/\s+/g, ' ').trim().slice(0, n);
const DAY = /^\d{4}-\d{2}-\d{2}/;
export const dateOf = (v) => {
  const s = txt(v, 30);
  if (DAY.test(s)) return s.slice(0, 10);
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? etDay(new Date(x > 1e12 ? x : x * 1000)) : '';
};
const LS = (k) => { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (_) { return null; } };
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

async function getJSON(url, ms = 6000) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ac ? setTimeout(() => ac.abort(), ms) : 0;
  try {
    const r = await fetch(url, { cache: 'no-cache', ...(ac ? { signal: ac.signal } : {}) });
    return r.ok ? await r.json() : null;
  } catch (_) { return null; } finally { clearTimeout(timer); }
}

// ------------------------------------------------------------------------------------------------ the site
export async function loadRules() { return getJSON('rules.json?v=a1'); }

export async function loadSite() {
  const ok = (d) => isObj(d) && d.kind === 'olympus-arena' && Array.isArray(d.events);
  const live = await getJSON('events.json?t=' + Math.floor(Date.now() / 60000));
  if (ok(live)) return { doc: live, demo: !!live.demo };
  return { doc: { v: 1, kind: 'olympus-arena', demo: true, events: [], t: 0 }, demo: true, missing: true };
}

// ------------------------------------------------------------------------------------------------ the Planner
export function plannerState() { const S = LS('planner.v1') || LS('planner.hosted.v1'); return isObj(S) ? S : null; }

export function plannerEvents(S, today) {
  const events = [], facts = { planner: false, habits: false, doneToday: 0, habitToday: false, tomorrowTasks: 0, tasksToday: 0 };
  if (!isObj(S)) return { events, facts };
  facts.planner = true;
  const tasks = arr(S.tasks).filter(isObj), habits = arr(S.habits).filter((h) => isObj(h) && txt(h.name || h.title));
  const tomorrow = new Date(Date.parse(today + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10);
  const byDay = {};                                              // day -> { all, done } for tasks dated that day
  for (const t of tasks) {
    const due = dateOf(t.date), title = txt(t.title || t.name, 60);
    if (due) { const b = (byDay[due] = byDay[due] || { all: 0, done: 0 }); b.all++; if (t.done) b.done++; }
    if (due === today) facts.tasksToday++;
    if (due === tomorrow && !t.done) facts.tomorrowTasks++;
    if (!t.done) continue;
    const day = dateOf(t.doneAt || t.done_at || t.completed || t.date);
    if (!day || day > today) continue;
    if (day === today) facts.doneToday++;
    events.push({ id: 'task:' + (txt(t.id, 60) || hash(title + '|' + (t.date || ''))), day, kind: 'task_done', src: 'planner', note: title || 'Task' });
  }
  const logs = habits.map((h) => {
    const raw = h.log || h.done || h.days;
    const days = Array.isArray(raw) ? raw.map(dateOf) : isObj(raw) ? Object.keys(raw).filter((k) => raw[k]).map(dateOf) : [];
    return { id: txt(h.id, 40) || hash(txt(h.name || h.title)), name: txt(h.name || h.title, 40), days: new Set(days.filter((d) => d && d <= today)) };
  });
  facts.habits = logs.length > 0;
  for (const h of logs) for (const d of h.days) {
    events.push({ id: `habit:${h.id}:${d}`, day: d, kind: 'habit', src: 'planner', note: h.name });
    if (d === today) facts.habitToday = true;
  }
  // the daily goal: every habit checked in that day (when there are habits), else every task dated that day done (1+)
  const goalDays = new Set();
  if (logs.length) {
    const all = new Set(logs.flatMap((h) => [...h.days]));
    for (const d of all) if (logs.every((h) => h.days.has(d))) goalDays.add(d);
  } else {
    for (const [d, b] of Object.entries(byDay)) if (d <= today && b.all > 0 && b.done === b.all) goalDays.add(d);
  }
  for (const d of goalDays) events.push({ id: `goal:${d}`, day: d, kind: 'goal_day', src: 'planner', note: logs.length ? 'Every habit checked in' : 'Every task of the day done' });
  return { events, facts };
}

// ------------------------------------------------------------------------------------------------ Obsidian
export async function vaultSnapshot() {
  try {
    const mod = await import('../jarvis/obsidian.js');
    return mod && typeof mod.graphSnapshot === 'function' ? await mod.graphSnapshot() : null;
  } catch (_) { return null; }                                   // not deployed, or it failed: "not connected"
}

export function vaultEvents(snap, today) {
  const events = [], facts = { vault: false, noteToday: false, notes: 0 };
  if (!isObj(snap) || !Array.isArray(snap.notes)) return { events, facts };
  facts.vault = true;
  facts.notes = snap.notes.length;
  const seen = new Set();
  for (const n of snap.notes) {
    if (!isObj(n) || n.kind !== 'daily') continue;
    const m = /(\d{4}-\d{2}-\d{2})/.exec(txt(n.path, 300) || txt(n.title, 200));
    const day = m ? m[1] : dateOf(n.mtime);
    if (!day || day > today || seen.has(day)) continue;
    seen.add(day);
    if (day === today) facts.noteToday = true;
    events.push({ id: `journal:${day}`, day, kind: 'journal', src: 'obsidian', note: `Daily note ${day}` });
  }
  return { events, facts };
}

// ------------------------------------------------------------------------------------------------ Kalshi and the PC (jarvis/data.js)
let jarvisData = null;
export async function jarvis() {
  if (jarvisData) return jarvisData;
  try { jarvisData = await import('../jarvis/data.js'); } catch (_) { jarvisData = {}; }
  return jarvisData;
}

export function kalshiEvents(k, today) {
  const events = [], facts = { kalshi: false, kalshiToday: false };
  if (!isObj(k)) return { events, facts };
  facts.kalshi = true;
  const days = [];
  if (Array.isArray(k.days)) for (const d of k.days) days.push(Array.isArray(d) ? dateOf(d[0]) : isObj(d) ? dateOf(d.day || d.date) : '');
  else if (isObj(k.days)) days.push(...Object.keys(k.days).map(dateOf));
  for (const d of new Set(days)) if (d && d <= today) events.push({ id: `kalshi:${d}`, day: d, kind: 'kalshi_day', src: 'kalshi', note: 'The Kalshi bot listed the day' });
  facts.kalshiToday = k.running !== false && !!k.t && etDay(new Date(+k.t * 1000)) === today;
  return { events, facts };
}

/** The PC heartbeat today: live.json's t (jarvis/data.js liveView) is from today (New York) and under 30 min old when seen. */
export function beatToday(live, today, nowS = Date.now() / 1000) {
  const t = isObj(live) ? +live.t : 0;
  return !!t && !live.cached && etDay(new Date(t * 1000)) === today && nowS - t < 30 * 60;
}

export async function gather(today, { timeoutMs = 6000 } = {}) {
  const J = await jarvis();
  const wait = (p) => Promise.race([Promise.resolve(p).catch(() => null), new Promise((ok) => setTimeout(ok, timeoutMs))]);
  await Promise.all([J.refreshLive ? wait(J.refreshLive()) : null, J.refreshKalshi ? wait(J.refreshKalshi()) : null]);
  const live = J.liveView ? (() => { try { return J.liveView(); } catch (_) { return null; } })() : null;
  const k = J.kalshiView ? (() => { try { return J.kalshiView(); } catch (_) { return null; } })() : null;
  const P = plannerEvents(plannerState(), today), V = vaultEvents(await wait(vaultSnapshot()), today), K = kalshiEvents(k, today);
  const facts = { ...P.facts, ...V.facts, ...K.facts, beatToday: beatToday(live, today) };
  return { events: [...P.events, ...V.events, ...K.events], facts,
    linked: { planner: P.facts.planner, vault: V.facts.vault, kalshi: K.facts.kalshi, live: !!live } };
}
