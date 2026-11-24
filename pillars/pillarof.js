// Which of the FOUR PILLARS a piece of research belongs to (day-pillars 2026-11-24): one rule for the Strategy Brain's neurons, the
// Research Hub's Pillars filter and the Strategy Lab tab. Pure, tiny, no imports (the Hub loads it on its own).
/** which pillar a piece of research belongs to (Strategy Brain neurons, Research Hub filter): lit | atlas | blitz | of | null */
export function pillarOf(text, fam) {
  const t = String(text || '');
  if (/order.?flow|\btick (data|recorder|profile|days?|study)|\breal ticks\b|\bcumulative delta\b|\bdelta (divergence|bars?)\b|footprint|\bLVN\b|\bCVD\b|absorption|stacked imbalance|block prints?/i.test(t)) return 'of';   // not a bare 'tick' ("stop 1 tick beyond")
  // LIT / ATLAS / BLITZ: the one a text names FIRST ("Zlarior + ATLAS (+ BLITZ) on one account" is LIT research, not BLITZ)
  let best = null, at = Infinity;
  for (const [id, rx] of [['blitz', /\bBLITZ\b|\bscalp/i], ['atlas', /\bATLAS\b|\bEMA pullback|\bMACD\b|\bS\/R\b|account.?b\b/i], ['lit', /\bLIT\b|zlarior|\bCISD\b|\bsweep/i]]) {
    const m = rx.exec(t); if (m && m.index < at) { at = m.index; best = id; }
  }
  if (best) return best;
  if (fam === 0) return 'lit';
  if (fam === 1) return 'atlas';
  if (fam === 2) return 'blitz';
  return null;
}

export const PILLARS = [['lit', 'LIT'], ['atlas', 'ATLAS'], ['blitz', 'BLITZ'], ['of', 'ORDER FLOW']];
