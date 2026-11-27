// NQ BRAIN · "WHY?" (nq/ask.js; night 2026-11-27). Tap a question, get a plain answer built ONLY from the page's data (no AI, no
// guessing): the PC's report through brain.js's model (window.NQBRAIN), the site's account copy (home.json via pc_feed), and
// brain/learn.json (window.NQMIND). Every answer ends with the age of the data it used. A fact the data does not have is said
// plainly ("the PC does not send that"). BLITZ is hidden. Text only through textContent; no storage; no fetch of its own.
// window.NQASK = the test hook.
const $ = (id) => document.getElementById(id);
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
const S = { ready: false, q: null };
const usd = (v) => `${v < 0 ? '-' : ''}$${Math.abs(Math.round(v)).toLocaleString('en-US')}`;
const sUsd = (v) => `${v < 0 ? '-' : '+'}$${Math.abs(Math.round(v)).toLocaleString('en-US')}`;
const etDay = (t) => { try { const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
  .formatToParts(new Date((t + 6 * 3600) * 1000)); const g = (k) => (p.find((x) => x.type === k) || {}).value; return `${g('year')}-${g('month')}-${g('day')}`; } catch (_) { return ''; } };
const hm = (t) => { try { return new Date(t * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }); } catch (_) { return '?'; } };
const md = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : (s || '?'); };
function ago(t) {
  try { const Q = window.NQ_FEED; if (Q && Q.age) return Q.age(t).text; } catch (_) { /* below */ }
  const m = Math.max(0, Math.round((Date.now() / 1000 - t) / 60));
  return m < 2 ? 'just now' : m < 120 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
}

const QUESTIONS = [
  { id: 'notrade', q: 'Why no trade today?' },
  { id: 'next', q: 'When could the next trade come?' },
  { id: 'accounts', q: 'How close is each account to passing / payout?' },
  { id: 'learned', q: 'What did the bots learn this week?' },
  { id: 'pc', q: 'Is anything wrong with the PC?' },
];

/* ---------------- the data ---------------- */
function data() {
  const N = window.NQBRAIN, M = window.NQMIND;
  if (!N || !N.S || !N.BC || !N.S.src) return null;
  const now = Date.now() / 1000;
  let lit = null, atl = null;
  try { lit = N.BC.brain('lit', N.S.src, now); atl = N.BC.brain('atlas', N.S.src, now); } catch (_) { return null; }
  const lite = N.S.src.lite, t = lite ? Number(lite.t || (lite.reporter && lite.reporter.t) || 0) : 0;
  return { lit, atl, lite, t, home: N.S.src.home || {}, learn: M && M.S ? M.S.learn : null, now, today: etDay(now) };
}
function pcAge(D) { return D.t ? `PC report ${hm(D.t)} ET (${ago(D.t)})` : 'the PC\'s report has not arrived on this page (the site\'s copy)'; }

/* ---------------- the answers: [{who, lines[]}], + the data line ---------------- */
function aNoTrade(D) {
  const out = [];
  for (const B of [D.lit, D.atl]) {
    const L = [];
    const todays = (B.memory && B.memory.last || []).filter((r) => r.day === D.today);
    if (todays.length) {
      L.push(`It DID trade today: ${todays.map((r) => `${r.side.toLowerCase()} at ${hm(r.t)}, ${String(r.how || '').toLowerCase()} ${sUsd(r.usd || 0)}`).join('; ')}.`);
      out.push({ who: B.name, lines: L });
      continue;
    }
    if (!B.has) L.push('The PC has not sent this bot\'s brain, so the page cannot say why (its 15-minute report).');
    else {
      if (B.stopped) L.push('The bot is STOPPED on the PC (paper numbers only).');
      else if (!B.armed) L.push(B.on ? 'It is ON but NOT ARMED: it watches, it does not trade.' : 'It is OFF right now.');
      const W = (B.plan && B.plan.windows) || [];
      if (B.bot === 'lit' && W.length && !W.some((w) => w.state === 'open')) L.push(`Outside its window (${W.map((w) => `${w.from}-${w.to} ET`).join(', ')}).`);
      for (const n of (B.plan && B.plan.news) || []) if (!n.past) L.push(`News today: ${n.time} ${n.title} (the bot pauses around it).`);
      for (const b of (B.grade && B.grade.blocks) || []) L.push(`Blocked: ${b}.`);
      if (B.bot === 'lit') {
        if (B.current) L.push(`Its best setup so far is at step ${B.current.n} of 10 (${B.current.label}): ${B.cards[B.current.key].now}`);
        else L.push('No setup has reached the steps yet today.');
        const sc = D.learn && D.learn.learning && D.learn.learning.setup_scores;
        const nowHM = (() => { try { return new Date(D.now * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' }); } catch (_) { return '99:99'; } })();
        const mine = ((sc && sc.rows) || []).filter((r) => r.day === D.today && String(r.at) <= nowHM).reverse();   // only what has happened by now
        if (mine.length) L.push(`Today's setups so far: ${mine.map((r) => `${r.at} ${r.side.toLowerCase()} stopped at "${r.why}"`).join('; ')}.`);
      } else {
        const live = (B.regions || []).find((r) => ['armed', 'trade', 'signal'].includes(r.state));
        L.push(live ? `${live.label} is ${live.state}: ${live.text || ''}` : `Members: ${(B.regions || []).map((r) => `${r.label} ${r.state === 'done' ? 'done for today' : r.state}`).join(', ')}.`);
      }
      if (L.length === 0) L.push('Nothing blocks it: no setup has met every rule yet.');
    }
    out.push({ who: B.name, lines: L });
  }
  return { parts: out, data: `Data: ${pcAge(D)}${D.learn ? ` · setup review to ${md((D.learn.learning && D.learn.learning.lit_setups && D.learn.learning.lit_setups.data_end) || '')}` : ''}.` };
}
function aNext(D) {
  const out = [];
  const P = D.lit.plan || {};
  const L = [];
  if (P.countdown) L.push(`${P.countdown}.`);
  if (P.clock && P.clock.next && P.clock.next.text) L.push(`${P.clock.next.text}.`);
  if (P.early) L.push(`${P.early}.`);
  if (D.lit.current) L.push(`Now at step ${D.lit.current.n}/10 (${D.lit.current.label}). ${D.lit.cards[D.lit.current.key].change}`);
  for (const n of P.news || []) if (!n.past) L.push(`Watch the news at ${n.time}: ${n.title}.`);
  out.push({ who: D.lit.name, lines: L.length ? L : ['The PC has not sent its plan for today.'] });
  const A = [], live = (D.atl.regions || []).find((r) => ['armed', 'signal'].includes(r.state));
  if (live) A.push(`${live.label} is ARMED: ${live.text || 'waiting for its trigger'}. That is the next ATLAS trade if price triggers it.`);
  else A.push(`No member is armed. ${(D.atl.regions || []).map((r) => `${r.label}: ${r.state === 'done' ? 'done for today' : r.state === 'window' ? 'in its window, waiting for a setup' : r.state}`).join('; ')}.`);
  out.push({ who: D.atl.name, lines: A });
  return { parts: out, data: `Data: ${pcAge(D)}. A setup still needs every rule; nothing here is a forecast of price.` };
}
function aAccounts(D) {
  const L = [];
  for (const a of D.home.accounts || []) {
    const nm = String(a.name || 'an account');
    if (/blitz/i.test(nm)) continue;
    const e = a.eval, c = a.card;
    if (/atlas/i.test(nm) && D.atl.payout) continue;            // funded ATLAS: its payout line below says it (an old eval copy would contradict it)
    if (c && c.sentence) L.push(`${nm}: ${c.sentence}`);
    else if (e && e.to_target !== null && e.to_target !== undefined) {
      L.push(`${nm}: needs ${usd(e.to_target)} more to pass (target ${usd(e.target_balance || 0)})${e.room !== null && e.room !== undefined ? `, ${usd(e.room)} of room above the floor` : ''}.`);
    } else L.push(`${nm}: the PC has not sent its numbers yet.`);
  }
  const pay = D.atl.payout;
  if (pay) L.push(`ATLAS payout: ${pay.big} ${pay.unit}${pay.lines && pay.lines.length ? ` · ${pay.lines[0]}` : ''}${pay.when ? ` · ${pay.when}` : ''}.`);
  return { parts: [{ who: 'Accounts', lines: L.length ? L : ['No account numbers on this page yet.'] }],
    data: `Data: ${pcAge(D)}${/^\d{4}-\d{2}-\d{2}/.test(String(D.home.built || '')) ? ` · the site's account copy built ${String(D.home.built).slice(0, 10)}` : ''}. MFFU funded balances start at $0.` };
}
function aLearned(D) {
  const J = ((D.learn && D.learn.journal) || []).filter((r) => r.pillar !== 'blitz');
  if (!J.length) return { parts: [{ who: 'Learning', lines: ['No lessons logged yet (brain/learn.json).'] }], data: 'Data: brain/learn.json not loaded.' };
  const last = J[0].date, t0 = Date.parse(`${last}T00:00:00Z`);
  const wk = J.filter((r) => t0 - Date.parse(`${r.date}T00:00:00Z`) < 7 * 864e5);
  const seen = new Set(), pick = [];
  for (const r of wk) { const k = r.pillar + String(r.text).split(' - ')[0].slice(0, 80); if (!seen.has(k)) { seen.add(k); pick.push(r); } if (pick.length >= 5) break; }
  const NAME = { lit: 'LIT', atlas: 'ATLAS', of: 'Order flow', learn: 'Market', risk: 'Risk' };
  const L = [`${wk.length} lessons in the 7 days to ${md(last)}. The newest:`, ...pick.map((r) => `${NAME[r.pillar] || r.pillar} (${md(r.date)}): ${String(r.text).length > 170 ? String(r.text).slice(0, 167) + '...' : r.text}`)];
  const nx = ((D.learn.learning && D.learn.learning.next) || []).filter((x) => x.pillar !== 'blitz').slice(0, 2);
  if (nx.length) L.push(`Testing next: ${nx.map((x) => `${NAME[x.pillar] || x.pillar}: ${x.text}`).join(' · ')}`);
  return { parts: [{ who: 'Learning', lines: L }], data: `Data: brain/learn.json, newest lesson ${md(last)}. Research only: a lesson never changes a live rule by itself.` };
}
function aPc(D) {
  const L = [], bad = [];
  for (const x of D.lit.health || []) { L.push(`${x.label}: ${x.value}${x.level === 'bad' ? ' (PROBLEM)' : x.level === 'warn' ? ' (check)' : ''}.`); if (x.level === 'bad' || x.level === 'warn') bad.push(x.label); }
  for (const r of D.lit.risk || []) if (r.level === 'bad') { L.push(`${r.label}: ${r.value} (PROBLEM).`); bad.push(r.label); }
  const head = !D.t ? 'The PC\'s report has not reached this page, so it cannot be checked from here.' : bad.length ? `Something needs a look: ${bad.join(', ')}.` : 'Nothing wrong: every check the PC sends is green.';
  return { parts: [{ who: 'PC', lines: [head, ...L] }], data: `Data: ${pcAge(D)}. The page only sees what the PC posts every 15 minutes.` };
}
const ANSWER = { notrade: aNoTrade, next: aNext, accounts: aAccounts, learned: aLearned, pc: aPc };

/* ---------------- the card ---------------- */
function answer(id) {
  S.q = id;
  for (const b of document.querySelectorAll('#askQs button')) b.setAttribute('aria-pressed', String(b.dataset.q === id));
  const box = $('askA'); while (box.firstChild) box.removeChild(box.firstChild);
  const D = data();
  if (!D) { box.appendChild(h('p', 'askdata', 'The bot\'s brain has not loaded yet: try again in a moment.')); return null; }
  let A;
  try { A = ANSWER[id](D); } catch (e) { A = { parts: [{ who: 'Sorry', lines: ['This answer could not be built from the data on the page.'] }], data: '' }; }
  box.appendChild(h('p', 'askq', (QUESTIONS.find((x) => x.id === id) || {}).q));
  for (const p of A.parts) {
    const sec = h('div', 'askpart'); sec.appendChild(h('b', '', p.who));
    const ul = h('ul', ''); for (const l of p.lines) ul.appendChild(h('li', '', l)); sec.appendChild(ul); box.appendChild(sec);
  }
  if (A.data) box.appendChild(h('p', 'askdata', A.data));
  return A;
}
function boot() {
  const qs = $('askQs'); if (!qs) return;
  for (const x of QUESTIONS) { const b = h('button', 'btn askb', x.q); b.type = 'button'; b.dataset.q = x.id; b.setAttribute('aria-pressed', 'false'); b.addEventListener('click', () => answer(x.id)); qs.appendChild(b); }
  const wait = () => { const N = window.NQBRAIN; if (N && N.ready && N.ready()) { S.ready = true; document.documentElement.dataset.ask = 'ready'; } else setTimeout(wait, 300); };
  wait();
}
window.NQASK = { S, answer, QUESTIONS, ready: () => S.ready };
boot();
