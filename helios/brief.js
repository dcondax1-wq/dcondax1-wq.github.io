// HELIOS: the NQ pre-market brief (day-arenas 2026-11-20). Reads ../nq/brief.json (tools/premarket_brief.py, contract docs/BRIEF.md v 1)
// if it is there; without it the card says "the brief is on its way" and nothing fails. Every field may be null. The day bias is shown
// grey as "context, no better than a coin" whenever bias.context_only is true (the contract's rule). Read only, text via textContent.
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const n0 = (x) => (typeof x === 'number' && Number.isFinite(x) ? x.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '-');

/** brief.json -> the lines the card shows, or null when it is not a v1 brief */
export function view(b) {
  if (!isObj(b) || b.v !== 1) return null;
  const m = isObj(b.market) ? b.market : {}, nw = isObj(b.news) ? b.news : {}, bi = isObj(b.bias) ? b.bias : {}, d = isObj(b.data) ? b.data : {};
  const lv = (Array.isArray(m.levels) ? m.levels : []).filter((x) => isObj(x) && typeof x.price === 'number')
    .sort((a, c) => Math.abs(a.dist_pts || 0) - Math.abs(c.dist_pts || 0)).slice(0, 4);
  const t1 = isObj(nw.next_tier1) ? `${nw.next_tier1.event} · ${nw.next_tier1.date}${nw.next_tier1.time ? ' ' + nw.next_tier1.time + ' ET' : ''}` : 'none on the calendar';
  const today = (Array.isArray(nw.today) ? nw.today : []).filter(isObj).map((x) => `${x.time || ''} ${x.event || ''}${x.tier === 1 ? ' (Tier 1)' : ''}`.trim());
  const call = String(bi.call || 'none'), ctx = bi.context_only !== false;
  return {
    head: String(b.headline || 'Pre-market brief'), day: `${b.weekday || ''} ${b.day || ''}`.trim(),
    where: String(m.where_text || ''), levels: lv.map((x) => `${x.name} ${n0(x.price)} (${x.dist_pts > 0 ? '+' : ''}${n0(x.dist_pts)})`),
    news: today.length ? today.join(' · ') : 'No US release today', next1: t1,
    bias: call === 'none' ? `No call${bi.why_none ? ': ' + bi.why_none : ''}` : `${call.toUpperCase()}${ctx ? ' (context, no better than a coin)' : ''}`, biasGrey: ctx || call === 'none',
    stale: (Array.isArray(d.stale) ? d.stale : []).map(String), early: b.early_close ? `Early close ${b.early_close} ET` : '',
  };
}

async function boot() {
  const box = document.getElementById('nqBrief'); if (!box) return;
  let b = null; try { const r = await fetch('../nq/brief.json', { cache: 'no-cache' }); b = r.ok ? await r.json() : null; } catch (e) { b = null; }
  const v = view(b), body = box.querySelector('.br-body'); body.replaceChildren();
  if (!v) { body.append(el('p', 'br-head', 'The pre-market brief is on its way.'), el('p', 'note', 'It shows here as soon as the site publishes it (nq/brief.json): levels, today\'s news and what each bot waits for.')); box.classList.add('ready'); return; }
  const row = (k, val, cls) => { const r = el('div', 'br-row' + (cls ? ' ' + cls : '')); r.append(el('span', 'br-k', k), el('span', 'br-v', val)); return r; };
  body.append(el('p', 'br-head', v.head),
    row('Where', v.where || '-'), row('Levels', v.levels.join(' · ') || '-'), row('News today', v.news + (v.early ? ' · ' + v.early : '')),
    row('Next Tier 1', v.next1), row('Day bias', v.bias, v.biasGrey ? 'grey' : ''),
    el('p', 'note br-stale', v.stale.length ? `Data: ${v.stale.length} old source${v.stale.length > 1 ? 's' : ''}. ${v.stale[0]}` : 'Data: fresh.'));
  box.querySelector('.br-day').textContent = v.day;
  box.classList.add('ready');
}
if (typeof document !== 'undefined') boot().catch(() => {});
