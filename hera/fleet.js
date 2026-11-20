// HERA: the fleet's month-by-month cash plan (day-arenas 2026-11-20). Reads ./../business/fleet_plan.json (helper day-fleet,
// tools/money/fleet_plan.py) when the site has it; until then the card says "plan coming" and nothing fails. The reader is loose on purpose
// (the file's contract was still landing): months = [{month, median | p50 | cash_p50 | cum_cash_p50, bad | p10 | cash_p10 | cum_cash_p10}],
// next_buy = text or {what, when, why, usd}, decide / top_decide = [{title | text, usd}]. ESTIMATE wording, never a promise. textContent only.
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const usd = (v) => (num(v) == null ? '-' : (v < 0 ? '-$' : '$') + Math.abs(Math.round(v)).toLocaleString('en-US'));
const pick = (o, ks) => { for (const k of ks) if (num(o[k]) != null) return num(o[k]); return null; };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const mWord = (m) => (/^\d{4}-\d{2}/.test(String(m)) ? `${MON[+String(m).slice(5, 7) - 1]} '${String(m).slice(2, 4)}` : String(m || ''));

export function view(d) {
  if (!isObj(d)) return null;
  const months = (Array.isArray(d.months) ? d.months : []).filter(isObj).map((m) => ({ m: mWord(m.month || m.m),
    mid: pick(m, ['median', 'p50', 'cash_p50', 'cash_median', 'cum_cash_p50']), bad: pick(m, ['bad', 'p10', 'cash_p10', 'cash_bad', 'cum_cash_p10']) }))
    .filter((x) => x.m && (x.mid != null || x.bad != null)).slice(0, 8);
  const nb = d.next_buy, next = typeof nb === 'string' ? nb : isObj(nb) ? [nb.what || nb.name, nb.when, nb.usd != null ? usd(nb.usd) : null, nb.why].filter(Boolean).join(' · ') : '';
  const cards = (Array.isArray(d.top_decide) ? d.top_decide : Array.isArray(d.decide) ? d.decide : []).filter(isObj).slice(0, 3)
    .map((c) => ({ t: String(c.title || c.text || c.q || c.id || ''), v: num(c.usd) ?? num(c.usd_year) ?? num(c.value) }));
  if (!months.length && !next && !cards.length) return null;
  return { months, next, cards, cum: months.some((x) => x.mid != null) && /cum/.test(JSON.stringify(Object.keys((d.months || [])[0] || {}))) };
}

async function boot() {
  const box = document.getElementById('fleetPlan'); if (!box) return;
  let d = null; try { const r = await fetch('../business/fleet_plan.json', { cache: 'no-cache' }); d = r.ok ? await r.json() : null; } catch (e) { d = null; }
  const v = view(d), body = box.querySelector('.fp-body'); body.replaceChildren();
  if (!v) { body.append(el('p', 'fp-empty', 'Plan coming: the fleet cash plan (Dec to Jun, typical and bad case, the next account to buy) shows here once it is published.')); return; }
  const top = Math.max(1, ...v.months.map((x) => Math.max(Math.abs(x.mid || 0), Math.abs(x.bad || 0))));
  const grid = el('div', 'fp-months');
  for (const x of v.months) {
    const c = el('div', 'fp-m'), bars = el('div', 'fp-bars');
    const a = el('i', 'fp-mid'); a.style.height = `${Math.round(Math.max(0, x.mid || 0) / top * 100)}%`;
    const b = el('i', 'fp-bad'); b.style.height = `${Math.round(Math.max(0, x.bad || 0) / top * 100)}%`;
    bars.append(b, a); c.append(el('span', 'fp-v', usd(x.mid)), bars, el('span', 'fp-k', x.m)); grid.appendChild(c);
  }
  body.append(grid, el('p', 'note', 'Gold = typical month, bronze = a bad run (1 in 10). An estimate from the paper studies, after fees, not a promise.'));
  if (v.next) body.appendChild(el('p', 'fp-next', 'Next buy: ' + v.next));
  for (const c of v.cards) { const r = el('div', 'fp-card'); r.append(el('span', '', c.t), el('b', '', c.v != null ? usd(c.v) : '')); body.appendChild(r); }
}
if (typeof document !== 'undefined') boot().catch(() => {});
