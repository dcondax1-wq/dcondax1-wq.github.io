// Jarvis's memory (owner 2026-11-02: "everything connected to my Obsidian ... think like me"): the conversation layer over
// the vault (obsidian.js). One ES module, no imports, no DOM. The brain calls it first for every question:
//
//   import { createMemory } from './memory.js';
//   const memory = createMemory({ vault, now? });          // vault: obsidian.js createVault(); now() -> ms (tests)
//   createBrain({ ..., memory });
//   memory.handle(raw, q, { now, facts }) -> Promise<reply | null>     null = not a memory request: the brain answers
//       reply: { text, speak, intent, smart? (a summary the model may write, with this text as the fallback), control? }
//   memory.context(question) -> Promise<{ notes: [{ title, snippet }], me }>   smart mode's grounding (top snippets + Me.md)
//   memory.pending                                         the write waiting for "yes" (null when none)
//   memory.offer(kind, text) -> { text, speak }            the same confirmed write, offered after the assistant (assistant.js)
//                                                          kept something on the phone: "Save it to ... too? Say yes."
//   memory.connected                                       true while the Obsidian vault is connected
//   memory.confirmWrite({ kind, title, text }) -> Promise<{ text, speak }>   a write the model asked for (tools.js): the
//                                                          target path is named ("Save this to OLYMPUS/Notes/Gym plan.md?
//                                                          Say yes or no.") and nothing is written before "yes"
//   memory.queue(kind, text, title)                        not connected: a note he dictated waits in the vault's outbox
//   memory.vault                                           the vault (tools.js searches and reads through it)
//
// Added 2026-11-04 (Jarvis deepening): "what do I know about X" answers in plain words and CITES the note titles (cited: [...]);
// "pull my tasks from Obsidian" copies the open `- [ ]` items of the vault into the Jarvis to-do list (opts.addTodos, opts.todos);
// "draft my weekly review" writes a review note from the week's daily notes (OLYMPUS/Notes/Weekly review <day>.md); "save today's
// brief" files the morning briefing as OLYMPUS/Notes/Daily brief.md (memory.setBrief(text) from briefing.js); "read my notes" reads
// the newest notes aloud. Every one of them asks first and writes only on "yes".
//
// Writes are append-only and always confirmed: "note: ..." / "remember ..." / "add task ..." / a stated preference / "write
// the OLYMPUS log" -> "Save ...? Say yes." -> "yes" -> vault.write(). Not connected: kept on this phone and sent on connect.

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const str = (x, n) => (typeof x === 'string' ? x : x == null ? '' : String(x)).replace(/\s+/g, ' ').trim().slice(0, n || 2000);
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const plural = (n, w) => `${n} ${n === 1 ? w : w + 's'}`;
const lines = (...a) => a.filter((x) => x != null && x !== '').join('\n');
const PENDING_MS = 3 * 60e3;              // a confirmation waits 3 minutes, then it is dropped
const BLOCKY = (k) => k === 'append' || k === 'create';      // a note body may be several lines (Markdown)
// "OLYMPUS/Notes/Gym plan.md" said aloud: "Gym plan"
const spoken = (path) => String(path || '').split('/').pop().replace(/\.md$/i, '');

// ------------------------------------------------------------------------------------------------ what the owner says
// each matcher: (raw text, normalized q) -> a parsed request or null. Raw keeps the owner's own words for the note.
const WRITE_RX = [
  ['task', /^(?:hey jarvis,?\s*)?(?:add (?:a )?(?:task|to ?do)|new task)\s*[:,-]?\s+(.+)$/i],
  ['task', /^(?:hey jarvis,?\s*)?(?:task|to ?do)\s*:\s*(.+)$/i],                 // a bare "task" / "todo" needs its colon ("task list" is a question)
  ['task', /^(?:hey jarvis,?\s*)?add (.+?) to (?:my |the )?(?:tasks|to ?do(?: list)?|list|inbox)\.?$/i],
  ['remember', /^(?:hey jarvis,?\s*)?(?:remember|don'?t forget)(?: that)?\s*[:,-]?\s+(.+)$/i],
  ['note', /^(?:hey jarvis,?\s*)?(?:note|jot(?: down)?|write down|save (?:a )?note|take (?:a )?note)\s*[:,-]?\s+(.+)$/i],
];
const WRITE_KINDS = ['note', 'task', 'remember', 'me', 'daily', 'append', 'create'];
export function parseWrite(raw) {
  const t = str(raw, 1200);
  for (const [kind, rx] of WRITE_RX) { const m = rx.exec(t); if (m && str(m[1]).length >= 2) return { kind, text: str(m[1], 600).replace(/^["“']|["”']$/g, '') }; }
  return null;
}
// a stated preference or correction ("I don't like long answers", "always give me the dollars first"): offered for Me.md
const PREF_RX = /^(i (don'?t|do not) (like|want)|i hate|i prefer|i like it when|i want you to|always|never|from now on|stop (saying|doing|telling|giving)|don'?t (ever )?(say|tell|give|show|call)|call me|be more|be less|keep it|keep answers) .{3,}/i;
const NOT_PREF_RX = /^(never ?mind|always on|i love you|less than|more than|stop$)/i;
export function parsePreference(raw, q) {
  const t = str(raw, 600).replace(/^(hey )?jarvis,?\s*/i, '');
  if (NOT_PREF_RX.test(t) || !PREF_RX.test(t) || t.split(' ').length < 3) return null;
  if (/\?$/.test(t) || /^(always|never) (on|off)$/i.test(q || '')) return null;
  return { kind: 'me', text: cap(t.replace(/[.!]+$/, '')) };
}
const YES_RX = /^(yes|yeah|yep|yup|sure|ok|okay|do it|save it|save|confirm|go ahead|please do|y|yes please|yes save it)$/;
const NO_RX = /^(no|nope|cancel|don't|dont|never ?mind|forget it|n|no thanks|skip)$/;
const LOG_RX = /^((write|save|make|do) (the |today's |my )?(olympus |daily |end of day )?log|log (the|my|today's) day|end of day( log)?)$/;

// read intents over the vault: [name, regex, topic group index or 0]
const READ_RX = [
  ['connect', /^(connect|link|set ?up|hook up) (my )?(obsidian|vault)( to jarvis)?$|^how do i (connect|link) (my )?(obsidian|vault)$/, 0],
  ['status', /^(is )?(my )?(obsidian|vault) (connected|linked|synced|status|working)$|^(obsidian|vault) status$/, 0],
  ['sync', /^(sync|refresh|update|reload) (my )?(vault|obsidian|notes)( now)?$/, 0],
  ['search', /^(?:what did i (?:write|say|note|jot)(?: down)? (?:about|on|regarding)|what do my notes say (?:about|on)|what have i written (?:about|on)|(?:search|find|look up) (?:my )?(?:notes|vault|obsidian) (?:for|about|on)?|anything in my notes (?:about|on)|notes (?:about|on)|what do i know about|my notes on|find in my notes)\s+(.{2,80})$/, 1],
  ['daily', /\b(today'?s daily( note)?|my daily note|daily note( for today)?|what did i write today|today'?s note)\b/, 0],
  ['yesterday', /\b(yesterday'?s (daily )?note|what did i write yesterday)\b/, 0],
  ['importTasks', /^(?:pull|import|bring|get|sync|extract|copy|grab|collect)(?: in)?(?: all)?(?: my)?(?: open)?(?: obsidian| vault)? ?(?:tasks|to ?-?dos|checkboxes|action items)(?: (?:from|in|out of))?(?: my| the)?(?: obsidian| vault| notes)?(?: (?:to|into|onto|on) (?:my |the )?(?:jarvis )?(?:to ?-?do(?: list)?|list|tasks))?$|^(?:add|put) (?:my )?(?:obsidian|vault) (?:tasks|to ?-?dos) (?:to|on|into) (?:my )?(?:jarvis )?(?:to ?-?do(?: list)?|list)$/, 0],
  ['weekly', /^(?:(?:draft|write|make|create|start|prepare|do|give me|build)(?: me)?(?: up)? (?:a |my |the |this week'?s |last week'?s )?weekly review(?: note)?(?: draft)?|weekly review(?: draft| note)?|draft (?:a |my |the )?review of (?:the |my |this )?week)$/, 0],
  ['saveBrief', /^(?:save|write|file|log|put|add|keep)(?: (?:it|this))?(?: (?:today'?s|the|my|this))? ?(?:daily |morning )?brief(?:ing)?(?: (?:to|in|into) (?:obsidian|my vault|my notes|the vault))?$|^(?:save|write|file) (?:it|this) (?:to|in|into) (?:obsidian|my vault)$/, 0],
  ['readNotes', /^(?:read|read me|read out|read back)(?: me)? (?:my )?(?:recent |latest |newest |last )?(?:obsidian |vault )?notes(?: to me| out loud| aloud)?$|^(?:what'?s|what is) in my (?:latest |newest |recent )?notes$/, 0],
  ['tasks', /\b(open tasks|my tasks|obsidian tasks|vault tasks|tasks in my (notes|vault)|unchecked tasks|my to ?do list|what'?s on my (to ?do|task) list)\b/, 0],
  ['mind', /\b(on my mind|been thinking about|thinking about lately|my themes|recurring themes|what have i been (writing|thinking) about)\b/, 0],
  ['week', /\b(summari[sz]e|recap|sum up|review)\b.*\b(week|weekly|notes)\b|\bthis week in my notes\b|\bweekly notes\b|\bweek'?s notes\b/, 0],
  ['links', /^(?:what links to|backlinks (?:for|to|of)|links (?:for|to|from|of)|what'?s linked to|connections (?:of|for|to)|what connects to)\s+(.{2,80})$/, 1],
  ['goals', /\b(my goals|what are my goals|goals note|my vault goals)\b/, 0],
  ['me', /\b(what do you (remember|know) about me|what have you learned about me|my preferences|my profile|how do i think|do you know me)\b/, 0],
  ['recall', /\b(what did i ask you to remember|what should you remember|your memory|what do you remember)\b/, 0],
  ['read', /^(?:read|open|show|pull up)(?: me)? (?:my |the )?(?:note (?:called |named |titled )?(.{2,60})|(.{2,40}?) note)$/, 1],
];
export function parseRead(q) {
  for (const [name, rx, g] of READ_RX) {
    const m = rx.exec(q);
    if (!m) continue;
    const topic = g ? str(m[g] || m[g + 1], 80).replace(/[?.!]+$/, '') : '';
    if (name === 'read' && /^(daily|today'?s|today'?s daily|yesterday'?s|jarvis)$/.test(topic)) continue;
    return { name, topic };
  }
  return null;
}

// ------------------------------------------------------------------------------------------------ the memory
// the same Markdown -> plain words as obsidian.js plainText (this module stays import-free)
const plain = (md) => String(md || '').replace(/^\s{0,3}#{1,6}\s+/gm, '').replace(/^\s*[-*+]\s+\[[ xX/-]\]\s+.*$/gm, '').replace(/^\s*[-*+]\s+/gm, '')
  .replace(/!?\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (m0, a, b, c) => c || a).replace(/(\*\*|__|`)/g, '');
export function createMemory(opts) {
  const o = isObj(opts) ? opts : {};
  const vault = o.vault && typeof o.vault.search === 'function' ? o.vault : null;
  const nowMs = () => { try { const t = o.now ? o.now() : Date.now(); return t instanceof Date ? t.getTime() : +t || Date.now(); } catch (_) { return Date.now(); } };
  let pending = null, lastBrief = '';
  const addTodos = typeof o.addTodos === 'function' ? o.addTodos : null;          // (texts[]) -> number added (assistant.js's to-do list)
  const haveTodos = typeof o.todos === 'function' ? o.todos : () => [];            // () -> [{text}] already on the Jarvis list
  const status = () => { try { return vault ? vault.status() : { connected: false, notes: 0, local: 0 }; } catch (_) { return { connected: false, notes: 0, local: 0 }; } };
  const where = (kind, path) => {
    const st = status(), day = ymd(nowMs());
    const file = path || (kind === 'me' ? 'OLYMPUS/Jarvis/Me.md' : kind === 'log' ? `OLYMPUS/Logs/${day}.md` : `OLYMPUS/Inbox/${day}.md`);
    return st.connected ? `${file}${kind === 'remember' ? ' and your Jarvis memory' : ''}` : 'this phone (sent to Obsidian once it is connected)';
  };
  // the file a named / daily / new note goes to (the vault knows the owner's own notes)
  async function pathFor(kind, title) {
    if (!vault || typeof vault.resolve !== 'function' || !['append', 'create', 'daily'].includes(kind)) return '';
    try { const r = await vault.resolve(kind, title); return r && r.path ? r.path : ''; } catch (_) { return ''; }
  }

  function confirm(req) {
    pending = { ...req, t: nowMs() };
    const what = req.kind === 'task' ? 'Add the task' : req.kind === 'me' ? 'Save this to your Me profile' : req.kind === 'log' ? 'Write today\'s OLYMPUS log' : req.kind === 'remember' ? 'Remember' : 'Save the note';
    const quote = req.kind === 'log' ? '' : ` “${req.text}”`;
    const text = req.kind === 'me' ? `${what}:${quote} (${where('me')})? Say yes to save, or no.` : `${what}${quote} to ${where(req.kind)}? Say yes to save, or no.`;
    return { text, speak: `${what}? Say yes to save.`, intent: 'memory_confirm', pending: true };
  }
  async function commit() {
    const req = pending; pending = null;
    if (req.kind === 'import_tasks') {
      const n = addTodos ? +addTodos(arr(req.list)) || 0 : 0;
      return { text: n ? `Added ${plural(n, 'task')} from your notes to your Jarvis to-do list.` : 'Nothing was added (they are already on your list).', speak: n ? `Added ${plural(n, 'task')}.` : 'Nothing new to add.', intent: 'memory_import_tasks' };
    }
    if (!vault) return { text: 'I have nowhere to save it on this phone. Nothing was written.', intent: 'memory_save' };
    const r = await vault.write(req.kind, req.text, undefined, req.title ? { title: req.title } : undefined);
    if (!r || !r.ok) return { text: `Not saved: ${str(r && r.error, 200) || 'the vault did not answer'}. Nothing was changed.`, speak: 'Not saved.', intent: 'memory_save' };
    if (r.local) return { text: 'Saved on this phone. It goes to your Obsidian vault once you connect it (⋯ → Connect Obsidian).', speak: 'Saved on this phone.', intent: 'memory_save' };
    const paths = arr(r.paths);
    return { text: `Saved to ${paths[0] || 'your vault'}${paths.length > 1 ? ` (+${paths.length - 1} more: ${paths.slice(1).join(', ')})` : ''}.`, speak: 'Saved to your vault.', intent: 'memory_save' };
  }

  // ---------------------------------------------------------------------------------------------- the read answers
  const notConnected = () => {
    const st = status();
    if (st.connected || st.local) return null;
    return { text: 'Your Obsidian vault is not connected yet. ⋯ → Connect Obsidian: three steps, free. Or paste a note there to start today.', speak: 'Your Obsidian vault is not connected yet.', intent: 'memory_missing', control: 'obsidian' };
  };
  const cite = (h) => `${h.title}: ${str(h.snippet, 220)}`;
  async function search(topic) {
    const hits = await vault.search(topic, 5);
    if (!hits.length) return { text: `Nothing in your notes about “${topic}”.`, speak: `Nothing in your notes about ${topic}.`, intent: 'memory_search' };
    const top = hits.slice(0, 3), cited = top.map((h) => h.title);
    const said = cited.length > 1 ? cited.slice(0, -1).join(', ') + ' and ' + cited[cited.length - 1] : cited[0];
    return { text: lines(`Your notes on “${topic}” (${hits.length === 1 ? '1 match' : hits.length + ' matches'}):`, ...top.map((h, i) => `${i + 1}. ${cite(h)}`), `Sources: ${cited.map((t) => `[[${t}]]`).join(', ')}`),
      speak: `${topic} comes up in ${said}. ${spokenSnip(top[0].snippet)}`.trim(), intent: 'memory_search', smart: true, cited };
  }
  const spokenSnip = (t) => str(plain(t), 200).replace(/^…\s*/, '').replace(/\s*…$/, '');
  async function dailyNote(day, label) {
    const n = await vault.daily(day);
    if (!n) return { text: `No daily note for ${label} (${day}) in your vault yet.`, speak: `No daily note for ${label}.`, intent: 'memory_daily' };
    const open = arr(n.tasks).filter((t) => !t.done);
    const body = str(plain(n.text), 600);
    return { text: lines(`${cap(label)}'s note (${n.title}):`, body || '(empty)', open.length ? `${plural(open.length, 'open task')}: ${open.slice(0, 3).map((t) => t.text).join('; ')}` : ''),
      speak: `${cap(label)}'s note has ${plural(n.words || body.split(' ').length, 'word')}${open.length ? ` and ${plural(open.length, 'open task')}` : ''}.`, intent: 'memory_daily', smart: true };
  }
  async function tasks() {
    const ts = await vault.tasks();
    if (!ts.length) return { text: 'No open tasks in your notes. Clean slate.', intent: 'memory_tasks' };
    return { text: lines(`${plural(ts.length, 'open task')} in your notes:`, ...ts.slice(0, 7).map((t) => `• ${t.text} (${t.note})`), ts.length > 7 ? `…and ${ts.length - 7} more.` : ''),
      speak: `${plural(ts.length, 'open task')}. First: ${ts[0].text}.`, intent: 'memory_tasks' };
  }
  async function recent(days, intent) {
    const r = await vault.recent(days, ymd(nowMs()));
    const all = r.notes.concat(r.inbox);
    if (!all.length) return { text: `No daily or inbox notes from ${r.start} to ${r.end}.`, intent };
    const heads = r.notes.slice(0, 5).map((n) => `${n.daily}: ${str(plain(n.text), 120) || '(empty)'}`);
    return { text: lines(intent === 'memory_mind' ? `On your mind lately: ${r.themes.slice(0, 5).join(', ') || 'no clear theme yet'}.` : `This week in your notes (${r.start} to ${r.end}): ${plural(all.length, 'note')}.`,
      ...heads, r.inbox.length ? `Inbox: ${plural(r.inbox.length, 'page')} from Jarvis.` : ''),
    speak: intent === 'memory_mind' ? `Lately you write most about ${r.themes.slice(0, 3).join(', ') || 'nothing in particular'}.` : `${plural(all.length, 'note')} this week.`, intent, smart: true };
  }
  async function links(name) {
    const l = await vault.links(name);
    if (!l) return { text: `No note called “${name}” in your vault.`, intent: 'memory_links' };
    return { text: lines(`${l.title}: links to ${l.out.length ? l.out.slice(0, 8).join(', ') : 'nothing'}.`, `Linked from: ${l.back.length ? l.back.slice(0, 8).join(', ') : 'no other note'}.`),
      speak: `${l.title} links to ${plural(l.out.length, 'note')} and ${plural(l.back.length, 'note')} link back.`, intent: 'memory_links' };
  }
  async function goals() {
    const g = await vault.goals();
    if (!g.length) return null;                // the brain's own goals answer (the Road to $10K card)
    const n = g[0], open = arr(n.tasks).filter((t) => !t.done);
    return { text: lines(`Your goals (${n.title}):`, ...(open.length ? open.slice(0, 6).map((t) => '• ' + t.text) : n.headings.slice(0, 6).map((h) => '• ' + h)), !open.length && !n.headings.length ? str(n.text, 400) : ''),
      speak: `${n.title}: ${open.length ? plural(open.length, 'open goal') : 'your goals note'}.`, intent: 'memory_goals', smart: true };
  }
  async function me() {
    const t = await vault.me();
    const learned = String(t).split(/\n## Preferences Jarvis learned\n/)[1] || '';
    const prefs = learned.split('\n').map((x) => x.replace(/^\s*-\s*/, '').trim()).filter(Boolean);
    return { text: lines('What I keep in your Me profile: money first, results not talk, the one action first; your trading rules (stop beyond the sweep, size follows the stop, one target, 2-4 trades a week, evals in 2 weeks).',
      prefs.length ? `What you taught me: ${prefs.slice(-5).join('; ')}.` : 'Tell me a preference ("I prefer ...", "always ...") and I will offer to save it.'), intent: 'memory_me' };
  }
  async function statusLine() {
    const st = status();
    if (!st.connected) return { text: st.local ? `Obsidian is not connected; ${plural(st.local, 'pasted note')} on this phone.${st.outbox ? ` ${plural(st.outbox, 'save')} waiting to be sent.` : ''}` : 'Obsidian is not connected yet: ⋯ → Connect Obsidian.', intent: 'memory_status', control: st.local ? undefined : 'obsidian' };
    const ago = st.at ? Math.max(0, Math.round((nowMs() - st.at) / 60000)) : null;
    return { text: `Obsidian connected (${st.repo}): ${plural(st.notes, 'note')}${ago != null ? `, synced ${ago < 1 ? 'just now' : ago + ' min ago'}` : ''}${st.error ? ` (${st.error})` : ''}.`, intent: 'memory_status' };
  }
  // pull the open `- [ ]` tasks of the vault into the Jarvis to-do list (asks first; Jarvis's own inbox pages are skipped: those came from this list)
  const OWN_RX = /^OLYMPUS\/(Inbox|Logs|Jarvis)\//;
  async function importTasks() {
    if (!addTodos) return { text: 'I have no to-do list on this phone to add them to.', intent: 'memory_import_tasks' };
    const ts = (await vault.tasks()).filter((t) => !OWN_RX.test(t.path || ''));
    const have = new Set(arr(haveTodos()).map((x) => str(x && x.text, 200).toLowerCase()));
    const seen = new Set(), fresh = [];
    for (const t of ts) { const k = str(t.text, 200).toLowerCase(); if (!k || have.has(k) || seen.has(k)) continue; seen.add(k); fresh.push(t); }
    if (!fresh.length) return { text: ts.length ? `All ${plural(ts.length, 'open task')} in your notes are already on your Jarvis list.` : 'No open tasks in your notes.', speak: ts.length ? 'Your list already has them.' : 'No open tasks in your notes.', intent: 'memory_import_tasks' };
    const list = fresh.slice(0, 20).map((t) => str(t.text, 200));
    pending = { kind: 'import_tasks', list, text: list.join('; '), t: nowMs() };
    return { text: lines(`Add ${plural(list.length, 'open task')} from your notes to your Jarvis to-do list?`, ...fresh.slice(0, 8).map((t) => `• ${str(t.text, 100)} (${t.note})`), fresh.length > 8 ? `…and ${fresh.length - 8} more.` : '', 'Say yes to add them, or no.'),
      speak: `Add ${plural(list.length, 'task')} from your notes to your list? Say yes.`, intent: 'memory_confirm', pending: true };
  }
  // a weekly review note from the week's daily notes, open tasks and the numbers on screen; asks first, then OLYMPUS/Notes/Weekly review <day>.md
  async function weeklyReview(facts) {
    const day = ymd(nowMs()), r = await vault.recent(7, day), open = (await vault.tasks()).filter((t) => !OWN_RX.test(t.path || ''));
    const notes = r.notes.slice().reverse();
    const done = []; for (const n of notes) for (const t of arr(n.tasks)) if (t.done) done.push(t.text);
    const sys = isObj(facts) && isObj(facts.system) ? facts.system : null;
    const body = lines(`## Week ${r.start} to ${r.end}`, '',
      '### What I wrote', ...(notes.length ? notes.map((n) => `- ${n.daily}: ${str(plain(n.text), 160) || '(empty)'} ([[${n.title}]])`) : ['- No daily notes this week.']), '',
      '### Themes', r.themes.length ? r.themes.slice(0, 6).map((t) => '#' + t).join(' ') : '- none yet', '',
      '### Done', ...(done.length ? done.slice(0, 8).map((t) => `- [x] ${str(t, 120)}`) : ['- Nothing ticked this week.']), '',
      '### Still open', ...(open.length ? open.slice(0, 8).map((t) => `- [ ] ${str(t.text, 120)} ([[${t.note}]])`) : ['- Nothing open.']), '',
      sys ? `### Numbers\n- Systems: ${str(sys.verdict, 20) || 'unknown'}${str(sys.todo, 200) ? ' · to do: ' + str(sys.todo, 200) : ''}\n` : '',
      '### Next week', '- [ ] ', '- [ ] ', '- [ ] ');
    const r2 = await confirmWrite({ kind: 'create', title: `Weekly review ${day}`, text: body });
    return r2 ? { ...r2, text: `Here is your weekly review draft (${plural(notes.length, 'daily note')}, ${plural(open.length, 'open task')}).\n${r2.text}` } : null;
  }
  // the newest notes, read aloud in plain words (the daily notes of the last week)
  async function readNotes() {
    const r = await vault.recent(7, ymd(nowMs()));
    const list = r.notes.slice(0, 3);
    if (!list.length) return { text: 'No daily notes from the last week to read. Say "read my X note" for a named one.', speak: 'No recent daily notes to read.', intent: 'memory_read_notes' };
    return { text: lines(`Your latest notes (${plural(list.length, 'note')}):`, ...list.map((n) => `• ${n.title}: ${str(plain(n.text), 260) || '(empty)'}`)),
      speak: list.map((n) => `${n.title}. ${str(plain(n.text), 200) || 'Empty.'}`).join(' '), intent: 'memory_read_notes', smart: true, cited: list.map((n) => n.title) };
  }
  async function read(req, facts) {
    if (req.name === 'connect') return { text: 'Opening the Obsidian setup: three steps, free, about five minutes.', speak: 'Opening the Obsidian setup.', intent: 'memory_connect', control: 'obsidian' };
    if (req.name === 'status') return statusLine();
    if (req.name === 'saveBrief') return lastBrief ? confirmWrite({ kind: 'create', title: 'Daily brief', text: lastBrief }) : { text: 'There is no briefing to save yet. Say "brief me" first.', speak: 'There is no briefing to save yet.', intent: 'memory_missing' };
    const nc = notConnected();
    if (nc) return req.name === 'goals' ? null : nc;
    if (req.name === 'sync') { const st = await vault.sync({ force: false }); return { text: `Synced: ${plural(st.notes, 'note')}${st.error ? ` (${st.error})` : ''}.`, intent: 'memory_sync' }; }
    if (req.name === 'search') return search(req.topic);
    if (req.name === 'daily') return dailyNote(ymd(nowMs()), 'today');
    if (req.name === 'yesterday') return dailyNote(ymd(nowMs() - 864e5), 'yesterday');
    if (req.name === 'tasks') return tasks();
    if (req.name === 'importTasks') return importTasks();
    if (req.name === 'weekly') return weeklyReview(facts);
    if (req.name === 'readNotes') return readNotes();
    if (req.name === 'mind') return recent(10, 'memory_mind');
    if (req.name === 'week') return recent(7, 'memory_week');
    if (req.name === 'links') return links(req.topic);
    if (req.name === 'goals') return goals();
    if (req.name === 'me') return me();
    if (req.name === 'read') {
      const n = typeof vault.read === 'function' ? await vault.read(req.topic) : null;
      if (!n) return { text: `No note called “${req.topic}” in your vault.`, intent: 'memory_read' };
      return { text: lines(`${n.title} (${n.path}):`, str(n.text, 900) || '(empty)'), speak: `${n.title}. ${str(n.text, 260)}`, intent: 'memory_read', smart: true };
    }
    if (req.name === 'recall') { const r = await vault.search('remember', 5); return r.length ? { text: lines('What you asked me to remember:', ...r.slice(0, 5).map((h) => '• ' + str(h.snippet, 200))), intent: 'memory_recall' } : { text: 'Nothing saved to remember yet. Say "remember ..." and I will.', intent: 'memory_recall' }; }
    return null;
  }

  // ---------------------------------------------------------------------------------------------- the end-of-day log
  function logText(facts) {
    const f = isObj(facts) ? facts : {}, sys = isObj(f.system) ? f.system : null, day = ymd(nowMs());
    const rows = sys ? arr(sys.rows).filter(isObj).map((r) => `| ${str(r.name, 30)} | ${str(r.value, 40) || '—'} | ${str(r.text, 160) || '—'} |`) : [];
    return lines(`## ${day} · OLYMPUS log`, sys ? `Verdict: ${str(sys.verdict, 20)}${str(sys.todo, 200) ? ' · to do: ' + str(sys.todo, 200) : ''}` : 'No system view on the phone right now.',
      rows.length ? '\n| System | Today | Status |\n|---|---|---|\n' + rows.join('\n') : '', '');
  }

  // ---------------------------------------------------------------------------------------------- the public face
  async function handle(raw, q, ctx) {
    try {
      q = str(q || raw, 600).toLowerCase();
      if (pending && nowMs() - pending.t > PENDING_MS) pending = null;
      if (pending) {
        if (YES_RX.test(q)) return await commit();
        if (NO_RX.test(q)) { pending = null; return { text: 'Not saved.', speak: 'Not saved.', intent: 'memory_cancel' }; }
        pending = null;                       // anything else: the offer lapses, the new question is answered
      }
      const w = parseWrite(raw);
      if (w) return confirm(w);
      if (LOG_RX.test(q)) return confirm({ kind: 'log', text: logText(ctx && ctx.facts) });
      const rq = parseRead(q);
      if (rq && vault) return await read(rq, ctx && ctx.facts);
      const p = parsePreference(raw, q);
      if (p) { const r = confirm(p); return { ...r, text: `Noted. ${r.text}` }; }
      return null;
    } catch (_) { return null; }
  }
  async function context(question) {
    if (!vault) return null;
    try {
      const [notes, me] = await Promise.all([vault.search(question, 4).catch(() => []), vault.me().catch(() => '')]);
      return { notes: arr(notes).map((n) => ({ title: n.title, snippet: n.snippet })), me: String(me || '').slice(0, 3000) };
    } catch (_) { return null; }
  }
  // assistant.js kept a fact / to-do / note on the phone: the vault copy is offered, then written on "yes" (as every write)
  async function offer(kind, text, title) {
    const k = WRITE_KINDS.includes(kind) ? kind : 'remember', t = BLOCKY(k) ? String(text == null ? '' : text).slice(0, 8000).trim() : str(text, 600), ti = str(title, 80);
    if (!t || ((k === 'append' || k === 'create') && !ti)) return null;
    const path = await pathFor(k, ti);
    pending = { kind: k, text: t, title: ti || undefined, t: nowMs() };
    return { text: `Save it to ${where(k, path)} too? Say yes.`, speak: 'Save it to Obsidian too? Say yes.' };
  }
  // the model asked to write (tools.js): one clear question naming the file; "yes" writes it (append-only / new file only)
  async function confirmWrite(req) {
    const r = isObj(req) ? req : {}, k = ['note', 'daily', 'append', 'create'].includes(r.kind) ? r.kind : 'note';
    const t = String(r.text == null ? '' : r.text).slice(0, 8000).trim(), ti = str(r.title, 80);
    if (!t) return null;
    const path = await pathFor(k, ti);
    pending = { kind: k, text: t, title: ti || undefined, t: nowMs() };
    const file = status().connected ? path || where(k) : null;
    const preview = str(t, 140) + (t.length > 140 ? '…' : '');
    return { text: file ? `Save this to ${file}? Say yes or no.\n“${preview}”` : `Save this note${ti ? ` “${ti}”` : ''} on this phone (it goes to Obsidian once you connect it)? Say yes or no.\n“${preview}”`,
      speak: file ? `Save this to ${spoken(file)}? Yes or no.` : 'Save this note on the phone? Yes or no.', intent: 'memory_confirm', pending: true };
  }
  // not connected: a note he dictated waits in the vault's outbox and goes once he connects (he said "write down", so no question)
  async function queue(kind, text, title) {
    if (!vault || status().connected || !WRITE_KINDS.includes(kind)) return null;
    try { const r = await vault.write(kind, text, undefined, title ? { title } : undefined); return r && r.ok ? { local: true } : null; } catch (_) { return null; }
  }
  const setBrief = (t) => { lastBrief = String(t == null ? '' : t).slice(0, 6000); };
  return { handle, context, offer, confirmWrite, queue, setBrief, get vault() { return vault; }, get connected() { return !!status().connected; }, get pending() { return pending ? { kind: pending.kind, text: pending.text, title: pending.title } : null; } };
}
function ymd(ms) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms)); }
  catch (_) { return new Date(ms).toISOString().slice(0, 10); }
}
export default createMemory;
