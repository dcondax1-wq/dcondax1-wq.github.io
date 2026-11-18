// BUSINESS page (ES module): reads ./business.json (the PC's own, tools/biz_publish.py) else ./fixture.json (DEMO), and ../home.json (the
// published evals) for the payout plan (businesscore.planPayouts = engine/payout_plan.py). Sends nothing. The ONE money place (2026-11-16).
import * as C from './businesscore.js?v=2';

const $ = (id) => document.getElementById(id);
const KEY = 'business.week.v1';
let READY = false;
window.BUSINESS = { ready: () => READY };   // for the tests (tests/agora_kit.open_app)
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

async function getJSON(url) {
  try { const r = await fetch(url, { cache: 'no-cache' }); return r.ok ? await r.json() : null; } catch (_) { return null; }
}
function loadTicks() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { return {}; } }
function saveTicks(t) { try { localStorage.setItem(KEY, JSON.stringify(t)); } catch (_) { /* private window: ticks just do not stay */ } }

function kv(dl, k, v) { dl.appendChild(h('dt', '', k)); dl.appendChild(h('dd', '', v)); }

function render(doc) {
  $('demo').hidden = !doc.sample;
  $('status').textContent = doc.sample ? 'Example numbers (DEMO), not yours yet. To see yours: run AGENCY_DAY.bat on the PC.' : `Updated ${doc.asof.replace('T', ' ').slice(0, 16)}.`;
  $('heroM3').textContent = `${C.range(doc.total.usd_m3)} a month`;
  $('heroText').textContent = `Estimate for month 3, all side work together. Do next: ${C.firstAction(doc)}`;
  const kvs = $('heroKv'); kvs.textContent = '';
  kv(kvs, 'Month 1', `${C.range(doc.total.usd_m1)} a month`);
  kv(kvs, 'Your hours', `${doc.total.hours[0]}-${doc.total.hours[1]} a week`);
  kv(kvs, 'Real money so far', `${C.money(doc.total.real)} a month`);

  const tb = $('tbl').querySelector('tbody'); tb.textContent = '';
  for (const m of doc.models) {
    const tr = h('tr');
    tr.appendChild(h('td', '', m.paused ? `${m.name} (paused)` : m.name));
    tr.appendChild(h('td', 'n', C.range(m.usd_m1)));
    tr.appendChild(h('td', 'n', C.range(m.usd_m3)));
    tr.appendChild(h('td', 'n', `${m.hours[0]}-${m.hours[1]}`));
    tb.appendChild(tr);
  }

  const box = $('models'); box.textContent = '';
  for (const m of doc.models) {
    const s = h('section', `ag-card card model${m.paused ? ' paused' : ''}`);
    const row = h('div', 'row'); row.appendChild(h('h2', '', m.name)); row.appendChild(h('span', `pill ${m.paused ? '' : 'ok'}`, m.paused ? 'Paused' : `${C.range(m.usd_m3)} by month 3`));
    s.appendChild(row);
    s.appendChild(h('p', 'lead', m.what));
    s.appendChild(h('p', 'next', `Next: ${m.next}`));
    if (!m.paused) {
      s.appendChild(h('p', 'note', 'Still needed before the first $:'));
      const ul = h('ul'); for (const x of m.first_dollar) ul.appendChild(h('li', '', x)); s.appendChild(ul);
    }
    const d = h('details'); d.appendChild(h('summary', '', `Already built (${m.built.length})`));
    const ub = h('ul'); for (const x of m.built) ub.appendChild(h('li', '', x)); d.appendChild(ub); s.appendChild(d);
    s.appendChild(h('p', 'note', `${m.why} More: ${m.doc}`));
    box.appendChild(s);
  }

  const pr = $('prices'); pr.textContent = '';
  for (const p of doc.prices) kv(pr, p.name, C.priceLine(p));

  const ticks = loadTicks(); const wk = $('week'); wk.textContent = '';
  const count = () => { const n = Object.entries(ticks).filter(([k, v]) => v && /^d\d/.test(k)).length; $('weekPill').textContent = `${n} done`; };
  for (const d of doc.week) {
    wk.appendChild(h('h3', '', `Day ${d.day}: ${d.title}`));
    const ol = h('ol');
    d.tasks.forEach((t, i) => {
      const k = C.taskKey(d.day, i), li = h('li'), lab = h('label', 'chk'), cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = !!ticks[k];
      cb.onchange = () => { ticks[k] = cb.checked; saveTicks(ticks); count(); };
      lab.appendChild(cb); lab.appendChild(h('span', '', t)); li.appendChild(lab); ol.appendChild(li);
    });
    wk.appendChild(ol);
  }
  count();
  const ru = $('rules'); ru.textContent = ''; for (const r of [...doc.rules, ...(doc.x.door_rules || [])]) ru.appendChild(h('li', '', r));
  renderDoor(doc, ticks);
  renderProp(doc.prop);
}

// a tick box bound to the one tick store (key prefix: m = a money move, r = a ready-to-upload step)
function tick(ticks, key, text, onChange) {
  const li = h('li'), lab = h('label', 'chk'), cb = document.createElement('input');
  cb.type = 'checkbox'; cb.checked = !!ticks[key];
  cb.onchange = () => { ticks[key] = cb.checked; saveTicks(ticks); if (onChange) onChange(); };
  lab.appendChild(cb); lab.appendChild(h('span', '', text)); li.appendChild(lab);
  return li;
}

function renderDoor(doc, ticks) {
  const X = doc.x;
  const plan = doc.livePlan || X.trading;
  const S = C.summary(doc, plan, X.costs);
  const dl = $('door'); dl.textContent = '';
  kv(dl, 'First trading payout to you', S.firstPayout);
  kv(dl, 'Once funded, all accounts', S.funded);
  if (plan && plan.funded_month_with_4) kv(dl, 'With a 4th account', `${C.money(plan.funded_month_with_4)} a month`);
  kv(dl, 'Side work by month 3', S.business);
  kv(dl, 'Spent so far (evals)', S.spent);
  kv(dl, 'Real money in so far', S.real);

  const mv = $('moves'); mv.textContent = '';
  const mcount = () => { $('movesPill').textContent = `${X.moves.filter((m) => ticks['m:' + m.id]).length} of ${X.moves.length} done`; };
  for (const m of X.moves) {
    const extra = [m.minutes ? `${m.minutes} min` : '', m.usd[1] ? `up to ${C.money(m.usd[1])}` : ''].filter(Boolean).join(', ');
    mv.appendChild(tick(ticks, 'm:' + m.id, extra ? `${m.what} (${extra})` : m.what, mcount));
  }
  mcount();

  const tr = $('trade'); tr.textContent = '';
  $('tradeSrc').textContent = doc.livePlan ? 'your evals' : (plan && plan.demo ? 'DEMO evals' : 'plan');
  $('tradeSrc').className = `pill ${doc.livePlan ? 'ok' : 'warn'}`;
  if (!plan || !plan.accounts.length) tr.appendChild(h('p', 'note', 'No eval running yet, so no dates.'));
  for (const a of (plan ? plan.accounts : [])) {
    const box = h('div', 'acct');
    const row = h('div', 'row'); row.appendChild(h('h3', '', a.name)); row.appendChild(h('span', `pill ${a.state === 'lost' ? 'bad' : 'ok'}`, a.state === 'lost' ? 'gone' : a.label || a.state));
    box.appendChild(row);
    const d2 = h('dl', 'kv');
    if (a.state !== 'lost') {
      if (a.pass_typical) kv(d2, 'Passes about', `${a.pass_typical} (slow ${a.pass_slow})`);
      kv(d2, 'Ask for the first payout', `${a.payout_typical} (slow ${a.payout_slow})`);
      kv(d2, 'You ask / you get (80%)', `${C.money(a.request)} / ${C.money(a.to_you)}`);
      kv(d2, 'In your bank about', a.bank_typical || '-');
      kv(d2, 'Once funded, a month', C.money(a.funded_month));
      kv(d2, 'Room before it fails', C.money(a.room));
    }
    box.appendChild(d2);
    if (a.state === 'lost') box.appendChild(h('p', 'note', a.text));
    tr.appendChild(box);
  }
  $('acct4').textContent = plan && plan.account4 ? plan.account4.text : '';

  const rd = $('ready'); rd.textContent = '';
  let all = 0, done = 0;
  for (const r of X.ready) {
    const d = h('details', 'item'); const sm = h('summary');
    sm.appendChild(h('span', 'nm', r.name)); sm.appendChild(h('span', 'pr', r.usd ? C.money(r.usd) : 'free'));
    d.appendChild(sm);
    d.appendChild(h('p', 'note', `Where: ${r.where}. Takes about ${r.minutes} min. File: ${r.file}`));
    const ol = h('ol');
    const recount = () => { const n = r.steps.filter((_, i) => ticks[`r:${r.id}:${i}`]).length; sm.dataset.done = n === r.steps.length ? '1' : '0'; readyCount(); };
    r.steps.forEach((t, i) => { all += 1; if (ticks[`r:${r.id}:${i}`]) done += 1; ol.appendChild(tick(ticks, `r:${r.id}:${i}`, t, recount)); });
    d.appendChild(ol); rd.appendChild(d);
    sm.dataset.done = r.steps.every((_, i) => ticks[`r:${r.id}:${i}`]) ? '1' : '0';
  }
  function readyCount() {
    const fin = X.ready.filter((r) => r.steps.length && r.steps.every((_, i) => ticks[`r:${r.id}:${i}`])).length;
    $('readyPill').textContent = `${fin} of ${X.ready.length} live`;
  }
  readyCount();

  const I = X.ideas;
  $('ideasHow').textContent = `${I.how}${I.searched ? ` Searched ${I.searched}.` : ''}`;
  const ib = $('ideas').querySelector('tbody'); ib.textContent = '';
  for (const r of I.rows) {
    const t = h('tr');
    t.appendChild(h('td', '', `${r.rank}. ${r.name}${r.model ? ' (new model)' : ''}`));
    t.appendChild(h('td', 'n', C.range(r.usd_hour)));
    t.appendChild(h('td', 'n', C.range(r.month)));
    t.appendChild(h('td', '', r.first_dollar));
    ib.appendChild(t);
  }
  const kb = $('kits'); kb.textContent = '';
  for (const r of I.rows) {
    const k = I.kits[r.id];
    const d = h('details', 'item'); const sm = h('summary');
    sm.appendChild(h('span', 'nm', k ? k.title : `${r.name}: the risk`)); d.appendChild(sm);
    d.appendChild(h('p', 'note', `Risk: ${r.risk}`));
    d.appendChild(h('p', 'note', `Fits you: ${r.fits}`));
    if (k) {
      const ol = h('ol'); for (const s of k.steps) ol.appendChild(h('li', '', s)); d.appendChild(ol);
      const ul = h('ul'); for (const s of k.rules) ul.appendChild(h('li', '', s)); d.appendChild(ul);
      d.appendChild(h('p', 'note', k.money));
    }
    kb.appendChild(d);
  }

  const cs = $('costs'); cs.textContent = '';
  for (const b of X.costs.bought) kv(cs, b.what, C.money(b.usd));
  for (const b of X.costs.subscriptions) kv(cs, b.what, `${C.money(b.usd_month)} a month`);
  kv(cs, 'Spent so far', C.money(X.costs.spent));
  kv(cs, 'Monthly bills', X.costs.monthly ? `${C.money(X.costs.monthly)} a month` : 'none');
  $('costNote').textContent = X.costs.note;
  const nb = $('nextBuys'); nb.textContent = '';
  for (const b of X.costs.next_buys) nb.appendChild(h('li', '', `Next to buy: ${b.what}, ${C.range(b.usd)}. When: ${b.when}`));
}

// the prop accounts' payout plan card (team E 2026-11-16): the money table, when Zlarior can pass / pay, the buying schedule
function renderProp(p) {
  const card = $('prop');
  card.hidden = !p;
  if (!p) return;
  $('propSpan').textContent = p.span || 'replay';
  const tb = $('propTbl').querySelector('tbody'); tb.textContent = '';
  for (const r of p.table) {
    const tr = h('tr');
    tr.appendChild(h('td', '', `${r.accounts} accounts`));
    tr.appendChild(h('td', 'n', C.signed(r.y1)));
    tr.appendChild(h('td', 'n', C.signed(r.steady)));
    tr.appendChild(h('td', 'n', C.signed(r.worst)));
    tr.appendChild(h('td', 'n', r.empty === null ? '-' : `${Math.round(r.empty)}%`));
    tr.appendChild(h('td', 'n', C.signed(r.ref)));
    tb.appendChild(tr);
  }
  const kvs = $('propKv'); kvs.textContent = '';
  const z = p.zlarior;
  if (z) {
    kv(kvs, 'Zlarior passes', z.pass_median ? `about ${z.pass_median} (earliest ${z.pass_earliest || '-'}; ${z.pass_10 ?? '-'}% within 2 weeks, ${z.fail_10 ?? '-'}% fail)` : '-');
    kv(kvs, 'First payout', z.pay_median ? `about ${z.pay_median}, ${C.money(z.pay_usd)} to you (earliest ${z.pay_earliest || '-'}; in your bank about ${z.bank_median || '-'})` : '-');
  }
  for (const b of p.buy) kv(kvs, `Buy ${b.n}`, b.median ? `about ${b.median} (${b.p25 || '-'} to ${b.p75 || '-'})` : 'not within 12 months');
  if (p.plan) kv(kvs, 'Each new account', `${p.plan}${p.price !== null ? `, ${C.money(p.price)}` : ''}`);
  const ul = $('propRules'); ul.textContent = '';
  for (const r of p.rules.concat(p.notes)) ul.appendChild(h('li', '', r));
}

(async function main() {
  const ownRaw = await getJSON('./business.json');
  const own = C.clean(ownRaw);
  const raw = own ? ownRaw : await getJSON('./fixture.json');
  const doc = own || C.clean(raw);
  if (!doc) { $('status').textContent = 'No numbers yet. On the PC, run: python tools/biz_publish.py'; READY = true; return; }
  doc.x = C.cleanExtra(raw);
  const accts = C.accountsFromHome(await getJSON('../home.json'));          // the published evals: the plan follows them live
  doc.livePlan = accts.length ? C.planPayouts(accts, C.localDay(new Date())) : null;
  render(doc);
  READY = true;
})();
