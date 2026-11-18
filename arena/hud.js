// ARENA HUD (ES module): everything you read. DOM only, text through textContent (no data ever becomes HTML).
//   renderRank(sc) / renderStreaks(sc) / renderQuests(quests, results, R) / renderLabours(sc, onOpen) / renderLog(sc, info)
//   renderBosses(bosses, R, onOpen) / renderTrophies(list, onOpen) / renderLadder(sc, R) / showTrophy(t)
//   openSheet(tab) / closeSheet() / showLabour(l, R) / celebrate({ level, rank, ranks, rankIndex }) / setTags({ demo, lite })
const $ = (id) => document.getElementById(id);
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const SRC = { site: 'Site data (bots, trades, evals)', planner: 'Planner (this phone)', obsidian: 'Obsidian (this phone)', kalshi: 'Kalshi feed', quest: 'Daily quests' };
const fmt = (n) => Math.round(+n || 0).toLocaleString('en-US');

export function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = String(text);
  return e;
}
const kids = (el, ...c) => { el.replaceChildren(...c.flat().filter(Boolean)); return el; };

export function rankProgress(sc) {
  if (!sc.next) return 1;
  return Math.max(0, Math.min(1, (sc.xp - sc.rank.xp) / (sc.next.xp - sc.rank.xp)));
}

export function setTags({ demo, lite }) { $('demo').hidden = !demo; $('lite').hidden = !lite; }

export function renderRank(sc) {
  $('rankName').textContent = sc.rank.name;
  $('xCount').textContent = sc.xpToday ? `+${fmt(sc.xpToday)}` : '0';
  $('rank').style.setProperty('--rank', sc.rank.color);
  $('lvl').textContent = `Level ${sc.level} · ${fmt(sc.xp)} XP`;
  $('lvlBar').style.transform = `scaleX(${(sc.into / sc.level_xp).toFixed(4)})`;
  $('lvlBar').parentElement.setAttribute('aria-valuenow', String(sc.into));
  $('lvlBar').parentElement.setAttribute('aria-valuemax', String(sc.level_xp));
  $('nextRank').textContent = sc.next ? `${fmt(sc.next.need)} XP to ${sc.next.name} · ${fmt(sc.level_xp - sc.into)} to level ${sc.level + 1}` : 'Titan: the top rank';
}

export function renderStreaks(sc) {
  const short = { uptime: 'Uptime', discipline: 'Hands off', planner: 'Goal', journal: 'Notes', quests: 'Quests' };
  kids($('streaks'), Object.values(sc.streaks).map((s) => {
    const c = h('span', 'oly-chip streak' + (s.cur ? ' on' : ''));
    c.title = `${s.name}: ${s.cur} ${s.unit} now, best ${s.best}`;
    c.append(h('span', 'k', short[s.id] || s.name), h('b', '', s.cur), h('span', 'u', s.unit === 'trades' ? '' : s.unit === 'market days' ? 'weekdays' : 'days'));   // plain words: 'md' meant market days (Mon-Fri, holidays skipped)
    return c;
  }));
}

export function renderQuests(quests, results, R) {
  const done = results.filter((r) => r.done).length;
  $('qCount').textContent = `${done}/${quests.length}`;
  const box = h('div', 'quests');
  quests.forEach((q, i) => {
    const r = results[i] || { done: false, why: '' }, c = h('article', 'quest' + (r.done ? ' done' : ''));
    c.dataset.quest = q.id;
    const mark = h('span', 'mark', r.done ? '✓' : String(i + 1)); mark.setAttribute('aria-hidden', 'true');
    const txt = h('div', 'qt');
    txt.append(h('b', '', q.title), h('span', 'qd', q.text), h('span', 'qs', `${r.done ? 'Done' : 'Open'} · ${r.why} · ${q.src}`));
    c.append(mark, txt, h('span', 'xp', `+${R.xp.quest.xp}`));
    box.append(c);
  });
  const sweep = h('p', 'sweep' + (quests.length === 3 && done === 3 ? ' done' : ''),
    quests.length === 3 ? `All 3 today: +${R.xp.quest_sweep.xp} XP and a day on the Quest sweep streak` : 'Link the Planner or Obsidian for a full board of 3');
  return [box, sweep];
}

export function renderLabours(sc, onOpen) {
  $('lCount').textContent = `${sc.earned}/12`;
  const grid = h('div', 'labours');
  for (const l of sc.labours) {
    const b = h('button', 'labour' + (l.earned ? ' earned' : ''));
    b.type = 'button'; b.dataset.labour = l.id;
    b.setAttribute('aria-label', `${l.name}: ${l.task}. ${l.earned ? 'Earned' : `${l.value} of ${l.goal}`}`);
    const bar = h('i', 'lb'); bar.append(h('i', '')); bar.firstChild.style.transform = `scaleX(${(l.value / l.goal).toFixed(3)})`;
    b.append(h('span', 'n', ROMAN[l.n - 1]), h('b', '', l.name), h('span', 'task', l.task), bar,
      h('span', 'st', l.earned ? `Earned ${l.day}` : `${fmt(l.value)} of ${fmt(l.goal)}`));
    b.addEventListener('click', () => onOpen(l.id));
    grid.append(b);
  }
  return [grid];
}

export function renderLog(sc, info, R, onExport) {
  const src = h('div', 'srcs');
  src.append(h('h3', '', 'Where the XP comes from'));
  for (const [k, label] of Object.entries(SRC)) {
    const row = h('div', 'src'), st = info.sources[k] || {};
    row.append(h('b', '', label), h('span', 'v', `${fmt(sc.bySrc[k] || 0)} XP`), h('span', 'why', st.text || ''));
    if (!st.ok) row.classList.add('off');
    src.append(row);
  }
  src.append(h('p', 'honest', 'XP comes only from events a source shows: never from $, size, R or trades past the plan. ' +
    'Broken rules, manual exits and 7-day lapses earn nothing and reset a streak.'));
  const ex = h('button', 'export', 'Export my progress (JSON)'); ex.type = 'button'; ex.id = 'export';
  ex.addEventListener('click', onExport);
  const list = h('ol', 'log');
  for (const e of sc.log.slice(0, 40)) {
    const li = h('li', e.xp ? '' : 'zero');
    li.append(h('span', 'd', e.day.slice(5)), h('span', 'w', e.note || e.label), h('span', 'x', e.xp ? `+${e.xp}` : e.capped ? 'cap' : '0'));
    li.title = R.xp[e.kind] ? R.xp[e.kind].why : '';
    list.append(li);
  }
  return [src, ex, h('h3', '', 'Latest events'), list];
}

const TIER_NAME = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', legend: 'Legend' };
const STATE_TXT = { fighting: 'In the fight', slain: 'Slain', escaped: 'Escaped this week', locked: 'Locked' };

export function renderBosses(B, R, onOpen) {
  const slain = B.cur.filter((b) => b.state === 'slain').length;
  $('bCount').textContent = `${slain}/4`;
  const fx = B.cur.find((b) => b.id === B.featured) || B.cur[0];
  const card = (b, big) => {
    const c = h('article', `boss ${b.state}${big ? ' big' : ''}`);
    c.dataset.boss = b.id; c.style.setProperty('--bc', b.color);
    const head = h('div', 'bh');
    head.append(h('span', 'glyph', b.glyph), h('div', 'bn'), h('span', 'bs', STATE_TXT[b.state]));
    head.querySelector('.bn').append(h('b', '', b.name), h('span', 'bt', b.title));
    const hp = h('div', 'hp'); hp.setAttribute('role', 'progressbar'); hp.setAttribute('aria-label', `${b.name}: ${b.hits} of ${b.max}`);
    hp.setAttribute('aria-valuemin', '0'); hp.setAttribute('aria-valuemax', String(b.max)); hp.setAttribute('aria-valuenow', String(b.hits));
    for (let i = 0; i < b.max; i++) hp.append(h('i', i < b.hits ? 'hit' : ''));
    const parts = h('div', 'parts');
    b.parts.forEach((p) => parts.append(h('span', `part ${p.state}`, p.label)));
    c.append(head, h('p', 'bx', b.text), hp, parts, h('p', 'bnote', `${b.note} · ${b.src}`),
      h('p', 'bxp', b.state === 'slain' ? `+${R.xp.boss.xp} XP earned` : `+${R.xp.boss.xp} XP when slain`));
    return c;
  };
  const out = [h('p', 'sweep', 'Boss of the week, then the others. A boss falls to discipline only: no $, size or R is ever checked.'), card(fx, true)];
  out.push(h('h3', '', 'The other bosses'));
  B.cur.filter((b) => b !== fx).forEach((b) => out.push(card(b, false)));
  out.push(h('h3', '', 'Last four weeks'));
  const hist = h('div', 'weeks');
  B.past.forEach((w) => {
    const row = h('div', 'week');
    row.append(h('b', '', `Week of ${w.mon.slice(5)}`));
    w.bosses.forEach((b) => row.append(h('span', `wchip ${b.state}`, b.glyph)));
    hist.append(row);
  });
  out.push(hist);
  return out;
}

export function renderTrophies(list, onOpen) {
  const n = list.filter((t) => t.earned).length;
  $('tCount').textContent = `${n}/${list.length}`;
  const grid = h('div', 'trophies');
  list.forEach((t) => {
    const b = h('button', `trophy ${t.tier}${t.earned ? ' earned' : ''}`);
    b.type = 'button'; b.dataset.trophy = t.id;
    b.setAttribute('aria-label', `${t.name}, ${TIER_NAME[t.tier]}: ${t.text}. ${t.earned ? 'Earned' : `${t.value} of ${t.goal}`}`);
    b.append(h('span', 'cup', t.glyph), h('b', '', t.name), h('span', 'tt', TIER_NAME[t.tier]),
      h('span', 'st', t.earned ? 'Earned' : `${fmt(t.value)} of ${fmt(t.goal)}`));
    b.addEventListener('click', () => onOpen(t.id));
    grid.append(b);
  });
  return [h('p', 'sweep', `${n} of ${list.length} trophies. They are honour, not XP: the XP comes from the events themselves.`), grid];
}

const RANK_TEXT = { mortal: 'Every trader starts here.', hero: 'Your habits are real now.', demigod: 'Discipline is your second nature.',
  olympian: 'You live on the mountain.', titan: 'The top of the ladder.' };
export function renderLadder(sc, R) {
  const box = h('div', 'ladder');
  [...R.ranks].reverse().forEach((r, k) => {
    const i = R.ranks.length - 1 - k, here = i === sc.rank.i, got = i <= sc.rank.i;
    const row = h('div', `rung${here ? ' here' : ''}${got ? ' got' : ''}`);
    row.style.setProperty('--rc', r.color); row.dataset.rank = r.id;
    row.append(h('span', 'rg', r.glyph), h('div', 'rt'), h('span', 'rx', `${fmt(r.xp)} XP`));
    row.querySelector('.rt').append(h('b', '', r.name), h('span', '', here ? `You are here · ${fmt(sc.xp)} XP` : got ? 'Reached' : `${fmt(r.xp - sc.xp)} XP to go`), h('span', 'rd', RANK_TEXT[r.id] || ''));
    box.append(row);
  });
  return [h('p', 'sweep', 'The five steps in the middle of the colosseum. Every step you reach lights up in its colour.'), box];
}

function tbar(t) { const b = h('div', 'bar tbar'), i = document.createElement('i'); i.style.width = `${Math.round(Math.min(1, (t.value || 0) / Math.max(1, t.goal || 1)) * 100)}%`; b.append(i); return b; }
export function showTrophy(t) {
  const pop = $('pop');
  kids(pop.querySelector('.pbody'), h('span', 'n', `${TIER_NAME[t.tier]} trophy`), h('h2', '', t.name), h('p', 'task', t.text),
    h('p', 'st', t.earned ? 'Earned' : `${fmt(t.value)} of ${fmt(t.goal)}`), tbar(t), h('p', 'how', 'Honour, not XP. It comes from events a source shows, never from $, size or R.'));
  pop.classList.toggle('earned', !!t.earned);
  pop.hidden = false;
  pop.dataset.labour = ''; pop.dataset.trophy = t.id;
}

const TITLES = { quests: 'Quest board · today', bosses: 'Weekly bosses', labours: 'The 12 Labours', trophies: 'Trophy room', ranks: 'The rank ladder', log: 'XP log and sources' };
let current = null;
export function openSheet(tab, build) {
  current = tab;
  $('sheetTitle').textContent = TITLES[tab] || '';
  kids($('sheetBody'), build(tab));
  $('sheet').hidden = false;
  document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === tab)));
}
export function closeSheet() {
  current = null; $('sheet').hidden = true;
  document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
}
export const sheetTab = () => current;

export function showLabour(l, R) {
  const def = R.labours.find((x) => x.id === l.id) || {}, m = def.metric || {};
  const how = m.count ? `${R.xp[m.count] ? R.xp[m.count].label : m.count}: ${R.xp[m.count] ? R.xp[m.count].why : ''}`
    : m.best ? `Best ${(R.streaks.find((s) => s.id === m.best) || {}).name || m.best} streak` : m.rank ? 'Your XP reaches the rank' : '';
  const pop = $('pop');
  kids(pop.querySelector('.pbody'), h('span', 'n', `Labour ${ROMAN[l.n - 1]}`), h('h2', '', l.name), h('p', 'task', l.task),
    h('p', 'st', l.earned ? `Earned on ${l.day}` : `${fmt(l.value)} of ${fmt(l.goal)}`), h('p', 'how', how));
  pop.classList.toggle('earned', !!l.earned);
  pop.hidden = false;
  pop.dataset.labour = l.id; delete pop.dataset.trophy;
}
export function hideLabour() { $('pop').hidden = true; }

let bannerTimer = 0;
export function celebrate({ level, rank, reduced, hold = false, ranks = null, rankIndex = 0 }) {
  const b = $('banner');
  let pips = null;
  if (rank && Array.isArray(ranks)) {
    pips = h('span', 'pips');
    ranks.forEach((r, i) => { const p = h('i', i <= rankIndex ? 'on' : ''); p.style.setProperty('--rc', r.color); pips.append(p); });
  }
  b.classList.toggle('rankup', !!rank);
  kids(b, h('span', 'k', rank ? 'Rank up' : 'Level up'), h('b', '', rank ? rank : `Level ${level}`), rank ? h('span', 's', `Level ${level}`) : null, pips);
  b.hidden = false; b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
  if (!reduced) { const f = $('flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); }
  clearTimeout(bannerTimer);
  if (hold) { b.classList.remove('go'); return; }                // a still for screenshots: no fade, no timer
  bannerTimer = setTimeout(() => { b.hidden = true; }, reduced ? 2200 : 3200);
  try { if (!reduced && navigator.vibrate) navigator.vibrate([30, 40, 60]); } catch (_) { /* no haptics */ }
}
