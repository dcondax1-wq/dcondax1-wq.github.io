// DAPHNE branch library (2026-11-04): the sheet that opens from BRANCHES. Four pages: LIST (search + filters + per-branch plain-words
// cards, tap A / B to compare, SHARE makes a picture), HALL (the best branches that hold in every period), COMPARE (two branches side
// by side), STATS (nodes tested, survival, the placebo check). Vault-free, read-only: it only reads tree.json's model.
//   const ui = createBranchUI({ model, open(rootId), toast(text) })     ui.open(tab) / ui.close() / ui.state
//   makeShareImage(b) -> Promise<Blob>    the 1080 x 1350 picture of one branch (a canvas, nothing is uploaded)
import { branchesOf, filterBranches, sortBranches, hallOfFame, compare, plainWords, statsOf, shareLines } from './branches.js?v=d1';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const usd = (x, d = 2) => (x == null || !Number.isFinite(x) ? '-' : (x < 0 ? '-$' : '+$') + Math.abs(x).toFixed(d));
const SORTS = [['robust', 'BEST OVERALL'], ['test', 'TEST $'], ['train', 'TRAIN $'], ['y2026', '2026 $'], ['net', 'NET $'], ['name', 'A-Z']];
const PAGE = 30;

function bars(b, w = 150) {
  const vals = [b.periods.train.mean, b.periods.test.mean, b.periods.y2026 ? b.periods.y2026.mean : 0], hi = Math.max(10, ...vals.map(Math.abs));
  return `<svg class="mb" viewBox="0 0 ${w} 30" width="${w}" height="30" role="img" aria-label="Dollars per trade: train ${usd(vals[0], 0)}, test ${usd(vals[1], 0)}, 2026 ${usd(vals[2], 0)}">${vals.map((v, i) => {
    const h = Math.max(1.5, (Math.abs(v) / hi) * 12), x = 4 + i * (w / 3);
    return `<rect x="${x}" y="${v >= 0 ? 15 - h : 15}" width="${w / 3 - 14}" height="${h}" rx="2" class="${v >= 0 ? 'up' : 'dn'}"/><text x="${x + (w / 3 - 14) / 2}" y="28" text-anchor="middle">${['TR', 'TE', '26'][i]}</text>`;
  }).join('')}<line x1="0" x2="${w}" y1="15" y2="15" class="zero"/></svg>`;
}

export function createBranchUI({ model, open, toast }) {
  const all = branchesOf(model);
  const levels = [...new Set(all.map((b) => b.level))].sort();
  const U = { tab: 'list', f: { q: '', holds: 'any', dir: 'any', level: 'any', minMean: null }, sort: 'robust', a: null, b: null, more: PAGE, words: new Set() };
  try { const s = JSON.parse(localStorage.getItem('daphne.branches') || 'null'); if (s) { U.a = all.some((x) => x.id === s.a) ? s.a : null; U.b = all.some((x) => x.id === s.b) ? s.b : null; } } catch (_) { /* not kept */ }
  const keep = () => { try { localStorage.setItem('daphne.branches', JSON.stringify({ a: U.a, b: U.b })); } catch (_) { /* private mode */ } };
  const byId = (id) => all.find((x) => x.id === id) || null;
  const old = $('branches'), root = old.cloneNode(true);          // a fresh sheet (and fresh listeners) when the data is swapped
  old.replaceWith(root);
  const body = root.querySelector('#br-body');

  function verdict(b) { return b.allPos ? ['EVERY PERIOD', 'ok'] : b.holds ? ['HOLDS OOS', 'mid'] : b.periods.test.mean > 0 ? ['TEST +', 'mid'] : ['FAILS TEST', 'bad']; }

  function item(b) {
    const [v, cls] = verdict(b), p = b.periods, a = U.a === b.id, c = U.b === b.id;
    return `<li class="br ${cls}" data-id="${esc(b.id)}"><button type="button" class="brmain" data-open="${esc(b.id)}"><span class="k">${esc(b.key)}</span><span class="v">${b.targetR}R · ${b.horizon}m · ${p.test.n} test trades</span><b class="bg ${cls}">${v}</b>
      ${bars(b)}<span class="sum">test ${usd(p.test.mean)} / trade</span></button>
      <div class="bract"><button type="button" data-cmp="a" aria-pressed="${a}">A</button><button type="button" data-cmp="b" aria-pressed="${c}">B</button><button type="button" data-words="${esc(b.id)}" aria-expanded="${U.words.has(b.id)}">WORDS</button><button type="button" data-share="${esc(b.id)}">SHARE</button></div>
      ${U.words.has(b.id) ? `<div class="words">${plainWords(b).map((t) => `<p>${esc(t)}</p>`).join('')}${b.steps.length ? `<p class="steps">Conditions: ${b.steps.map(esc).join(' · ')}</p>` : ''}</div>` : ''}</li>`;
  }

  function paintList() {
    const f = { ...U.f }, list = sortBranches(filterBranches(all, f), U.sort), shown = list.slice(0, U.more);
    const chip = (key, val, text) => `<button type="button" class="chip" data-f="${key}" data-v="${val}" aria-pressed="${String(U.f[key]) === String(val)}">${text}</button>`;
    return `<div class="filters"><label class="vh" for="brq">Search the branches</label><input id="brq" type="search" placeholder="Search: PDH, short, VIX, 10:00..." value="${esc(U.f.q)}" autocomplete="off" spellcheck="false" enterkeyhint="search">
      <div class="chips">${chip('holds', 'all', 'HOLDS IN EVERY PERIOD')}${chip('holds', 'tree', 'BEATS ITS ROOT')}${chip('holds', 'any', 'ALL')}</div>
      <div class="chips">${chip('dir', 'long', 'LONG')}${chip('dir', 'short', 'SHORT')}${chip('dir', 'any', 'BOTH')}</div>
      <div class="chips scroll">${chip('level', 'any', 'ANY LEVEL')}${levels.map((l) => chip('level', l, esc(l))).join('')}</div>
      <label class="sl"><span>MIN TEST $ / TRADE</span><input id="brmin" type="range" min="-20" max="40" step="5" value="${U.f.minMean == null ? -20 : U.f.minMean}" aria-label="Minimum test dollars per trade"><b id="brminv">${U.f.minMean == null ? 'ANY' : usd(U.f.minMean, 0)}</b></label>
      <div class="chips scroll sorts" role="group" aria-label="Sort">${SORTS.map(([k, t]) => `<button type="button" class="chip" data-sort="${k}" aria-pressed="${U.sort === k}">${t}</button>`).join('')}</div></div>
      <p class="count" id="brcount">${list.length} of ${all.length} branches</p>
      <ul class="brlist">${shown.length ? shown.map(item).join('') : '<li class="empty">No branch matches. Loosen a filter.</li>'}</ul>
      ${list.length > shown.length ? `<button type="button" class="wide" data-more>SHOW MORE (${list.length - shown.length})</button>` : ''}`;
  }

  function paintFame() {
    const hof = hallOfFame(all, 10);
    if (!hof.length) return `<p class="empty">No branch holds in every period in this search. That is an honest result: the filter is strict.</p>`;
    return `<p class="count">Branches that made money in train, in the 2025+ test and in 2026, ranked by their WORST period.</p><ol class="fame">${hof.map((h) => `<li class="${h.medal}"><span class="rk">${h.rank}</span><div><button type="button" class="brmain" data-open="${esc(h.b.id)}"><span class="k">${esc(h.b.key)}</span><span class="v">${h.b.targetR}R · ${h.b.horizon}m</span></button><p>${esc(h.reason)}</p>${bars(h.b, 130)}</div><div class="bract"><button type="button" data-cmp="a">A</button><button type="button" data-cmp="b">B</button><button type="button" data-share="${esc(h.b.id)}">SHARE</button></div></li>`).join('')}</ol>`;
  }

  function paintCompare() {
    const a = byId(U.a), b = byId(U.b);
    const slot = (x, k) => `<div class="slot ${x ? '' : 'empty'}"><small>${k.toUpperCase()}</small>${x ? `<b>${esc(x.key)}</b><span>${x.targetR}R · ${x.horizon}m</span><button type="button" data-clear="${k}" aria-label="Clear ${k}">×</button>` : '<span>tap ' + k.toUpperCase() + ' on a branch</span>'}</div>`;
    if (!a || !b) return `<div class="slots">${slot(a, 'a')}${slot(b, 'b')}</div><p class="empty">Pick two branches in LIST or HALL: tap A on one and B on another. Then they sit side by side here.</p>`;
    const c = compare(a, b);
    return `<div class="slots">${slot(a, 'a')}${slot(b, 'b')}</div><p class="verdict-line" id="cmpv">${esc(c.text)}</p><table class="cmp" aria-label="Branch A against branch B"><thead><tr><th></th><th>A</th><th>B</th></tr></thead><tbody>${c.rows.map((r) => `<tr><td>${esc(r.label)}</td><td class="${r.win === 'a' ? 'w' : ''}">${esc(r.a)}</td><td class="${r.win === 'b' ? 'w' : ''}">${esc(r.b)}</td></tr>`).join('')}</tbody></table>
      <div class="cmpbars"><div>${bars(a, 150)}</div><div>${bars(b, 150)}</div></div>
      <div class="bract wide2"><button type="button" data-open="${esc(a.id)}">OPEN A</button><button type="button" data-open="${esc(b.id)}">OPEN B</button></div>`;
  }

  function paintStats() {
    const s = statsOf(model, all), peak = Math.max(1, ...s.hist), N = (x) => Math.round(x).toLocaleString('en-US');
    const label = ['< -60', '-60..-30', '-30..-15', '-15..0', '0..15', '15..30', '30..60', '> 60'];
    const pl = (s.placebo || []).map((p, i) => `<tr><td>Shuffled run ${i + 1}</td><td>${p.hold} of ${p.best_rules}</td><td>${p.hold_pct}%</td></tr>`).join('');
    return `<div class="tiles"><div><b>${N(s.nodes)}</b><span>nodes tested</span></div><div><b>${s.cutPct}%</b><span>cut by the bound</span></div><div><b>${s.branches}</b><span>best branches</span></div>
      <div><b>${s.holdPct}%</b><span>beat their root out of sample</span></div><div><b>${s.allPct}%</b><span>hold in every period (${s.all})</span></div><div><b>${s.positiveTest}</b><span>made money on the test</span></div></div>
      <h3>TEST $ PER TRADE, ALL ${s.branches} BRANCHES</h3><div class="hist" role="img" aria-label="How many branches fall in each test dollar range">${s.hist.map((n, i) => `<div class="${i >= 4 ? 'up' : 'dn'}"><i style="height:${Math.max(3, (n / peak) * 100)}%"></i><b>${n}</b><span>${label[i]}</span></div>`).join('')}</div>
      <h3>IS IT REAL? THE SHUFFLED CHECK</h3><table class="cmp" aria-label="Real search against shuffled searches"><thead><tr><th></th><th>HOLD</th><th>SHARE</th></tr></thead><tbody><tr class="w"><td>Real search</td><td>${s.real.hold || 0} of ${s.real.best_rules || s.branches}</td><td>${s.real.hold_pct || s.holdPct}%</td></tr>${pl}</tbody></table>
      <p class="count">${esc(s.rule)} If the real search is not clearly above the shuffled ones, the "winners" are mostly luck. Built ${esc(s.built)}${s.seconds ? ' in ' + s.seconds + ' s' : ''}.</p>`;
  }

  function paint() {
    body.innerHTML = ({ list: paintList, fame: paintFame, compare: paintCompare, stats: paintStats })[U.tab]();
    document.querySelectorAll('#branches [data-btab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.btab === U.tab)));
  }

  // ---------------------------------------------------------------- events
  root.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.btab) { U.tab = t.dataset.btab; paint(); body.scrollTop = 0; return; }
    if (t.dataset.open) { open(t.dataset.open); api.close(); return; }
    if (t.dataset.f) { U.f[t.dataset.f] = t.dataset.v; U.more = PAGE; paint(); return; }
    if (t.dataset.sort) { U.sort = t.dataset.sort; paint(); return; }
    if (t.dataset.more !== undefined) { U.more += PAGE; paint(); return; }
    if (t.dataset.words) { const id = t.dataset.words; if (U.words.has(id)) U.words.delete(id); else U.words.add(id); paint(); return; }
    if (t.dataset.cmp) {
      const id = (t.closest('[data-id]') || {}).dataset?.id || (t.closest('li') && t.closest('li').querySelector('[data-open]').dataset.open);
      const k = t.dataset.cmp; U[k] = U[k] === id ? null : id; if (U.a && U.a === U.b) U[k === 'a' ? 'b' : 'a'] = null;
      keep(); toast(`${k.toUpperCase()}: ${byId(id) ? byId(id).key : ''}`); if (U.a && U.b) U.tab = 'compare'; paint(); return;
    }
    if (t.dataset.clear) { U[t.dataset.clear] = null; keep(); paint(); return; }
    if (t.dataset.share) { share(byId(t.dataset.share)); return; }
    if (t.hasAttribute('data-bclose')) api.close();
  });
  root.addEventListener('input', (e) => {
    if (e.target.id === 'brq') { U.f.q = e.target.value; U.more = PAGE; const pos = e.target.selectionStart; paint(); const q = $('brq'); q.focus(); q.setSelectionRange(pos, pos); }
    else if (e.target.id === 'brmin') { const v = +e.target.value; U.f.minMean = v <= -20 ? null : v; $('brminv').textContent = U.f.minMean == null ? 'ANY' : usd(v, 0); $('brcount').textContent = `${filterBranches(all, U.f).length} of ${all.length} branches`; }
  });
  root.addEventListener('change', (e) => { if (e.target.id === 'brmin') { U.more = PAGE; paint(); } });

  async function share(b) {
    if (!b) return;
    try {
      const blob = await makeShareImage(b), url = URL.createObjectURL(blob), file = new File([blob], `daphne-${b.id}.png`, { type: 'image/png' });
      const view = $('shareView');
      view.querySelector('img').src = url; view.querySelector('img').alt = `${b.key} ${b.id}`; view.hidden = false;
      view.dataset.id = b.id;
      if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: 'DAPHNE branch' }); } catch (_) { /* cancelled: the picture stays on screen */ } }
      toast('Picture ready: press and hold it to save');
    } catch (_) { toast('Could not make the picture here'); }
  }
  const sc = $('shareClose').cloneNode(true); $('shareClose').replaceWith(sc);
  sc.addEventListener('click', () => { const v = $('shareView'); v.hidden = true; const img = v.querySelector('img'); if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src); img.removeAttribute('src'); });

  const api = {
    get state() { return { tab: U.tab, f: { ...U.f }, sort: U.sort, a: U.a, b: U.b, count: filterBranches(all, U.f).length, total: all.length }; },
    get branches() { return all; },
    open(tab) { if (tab) U.tab = tab; root.hidden = false; paint(); },
    close() { root.hidden = true; },
    share, paint,
  };
  return api;
}

/** The share picture: one branch on a dark laurel card, 1080 x 1350 (a canvas; nothing leaves the phone). */
export async function makeShareImage(b) {
  const L = shareLines(b), W = 1080, H = 1350, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d'), mono = '-apple-system, "SF Pro Text", system-ui, sans-serif';
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0d0a07'); g.addColorStop(1, '#010503'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  const rg = x.createRadialGradient(W / 2, H * 0.3, 20, W / 2, H * 0.3, 640); rg.addColorStop(0, 'rgba(155, 171, 99,.22)'); rg.addColorStop(1, 'rgba(155, 171, 99,0)'); x.fillStyle = rg; x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(155, 171, 99,.35)'; x.lineWidth = 3; x.strokeRect(36, 36, W - 72, H - 72);
  x.fillStyle = '#9bab63'; x.font = `700 40px ${mono}`; x.fillText('DAPHNE', 84, 120);
  x.fillStyle = 'rgba(155, 171, 99,.6)'; x.font = `500 26px ${mono}`; x.fillText('THE STRATEGY TREE · NQ', 84, 160);
  x.fillStyle = '#fff'; x.font = `800 84px ${mono}`; x.fillText(L.title, 84, 290);
  x.fillStyle = 'rgba(155, 171, 99,.8)'; x.font = `500 34px ${mono}`; x.fillText(L.sub.toUpperCase(), 84, 345);
  const ok = b.allPos, pill = ok ? '#9bab63' : b.holds ? '#e0a060' : '#c96a4a';
  x.fillStyle = pill; x.globalAlpha = 0.18; x.fillRect(84, 385, 760, 76); x.globalAlpha = 1; x.strokeStyle = pill; x.lineWidth = 2; x.strokeRect(84, 385, 760, 76);
  x.fillStyle = pill; x.font = `800 38px ${mono}`; x.fillText(L.verdict, 112, 435);
  // the three bars
  const hi = Math.max(10, ...L.bars.map(([, v]) => Math.abs(v))), base = 880;
  x.strokeStyle = 'rgba(243, 236, 224,.25)'; x.lineWidth = 2; x.beginPath(); x.moveTo(84, base); x.lineTo(W - 84, base); x.stroke();
  L.bars.forEach(([name, v], i) => {
    const bx = 120 + i * 300, h = Math.max(6, (Math.abs(v) / hi) * 260), up = v >= 0;
    x.fillStyle = up ? '#9bab63' : '#c96a4a'; x.fillRect(bx, up ? base - h : base, 200, h);
    x.fillStyle = '#fff'; x.font = `800 44px ${mono}`; x.textAlign = 'center'; x.fillText((v < 0 ? '-$' : '+$') + Math.abs(v).toFixed(1), bx + 100, up ? base - h - 18 : base + h + 52);
    x.fillStyle = 'rgba(155, 171, 99,.7)'; x.font = `600 30px ${mono}`; x.fillText(name, bx + 100, base + 120 + (up ? 0 : 0)); x.textAlign = 'left';
  });
  x.fillStyle = 'rgba(155, 171, 99,.6)'; x.font = `500 26px ${mono}`; x.fillText('$ PER TRADE, ONE MICRO, AFTER COSTS', 84, 1040);
  // the plain-words sentence, wrapped
  x.fillStyle = '#f3ece0'; x.font = `500 34px ${mono}`;
  const words = L.text.split(' '); let line = '', y = 1110;
  for (const w of words) { const t = line ? line + ' ' + w : w; if (x.measureText(t).width > W - 168 && line) { x.fillText(line, 84, y); line = w; y += 46; if (y > 1230) { line += '...'; break; } } else line = t; }
  if (y <= 1260) x.fillText(line, 84, y);
  x.fillStyle = 'rgba(155, 171, 99,.45)'; x.font = `500 24px ${mono}`; x.fillText(L.foot, 84, H - 72);
  return await new Promise((res, rej) => c.toBlob((blob) => (blob ? res(blob) : rej(new Error('no image'))), 'image/png'));
}
