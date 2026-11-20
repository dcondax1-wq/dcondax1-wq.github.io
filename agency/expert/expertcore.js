// Agency > Expert, the pure part (team web-expert 2026-11-20, owner: "an expert expert on marketing 3D websites"). No DOM, no network:
// the page (expert.js), Jarvis (jarvis/biz.js 'web') and the node test (tests/test_web_expert.py) all read agency/expert/playbook.json through it.
//   diagnose(answers, P) -> { offer, price, monthly, total, script, why: [], addons: [], three_d, niche }      answers = { trade, site, reviews, visual, budget }
//   find(text, P)        -> { kind: 'niche' | 'card', item } | null      a free question ("what do I say to a roofer", "price a 3D site")
//   money(n)             -> '$1,500'
// Honest by design: ranges, never promises; the script slots stay [in brackets] for the owner to fill.

export const money = (n) => (typeof n === 'number' && Number.isFinite(n) ? '$' + Math.round(n).toLocaleString('en-US') : '');
// '$1,500-$3,000 + $49-$99 a month', '$500 + $299 a month', '$199-$399 a month'
const span = (lo, hi) => (lo === hi ? money(lo) : `${money(lo)}-${money(hi)}`);
export const range = (o) => {
  if (!o) return '';
  if (o.monthly) return `${span(o.usd_low, o.usd_high)} a month`;
  const mo = typeof o.mo_low === 'number' ? ` + ${span(o.mo_low, typeof o.mo_high === 'number' ? o.mo_high : o.mo_low)} a month` : '';
  return span(o.usd_low, o.usd_high) + mo;
};
const arr = (x) => (Array.isArray(x) ? x : []);
const byId = (list, id) => arr(list).find((x) => x && x.id === id) || null;

// the trade answer -> the niche whose words to use
export const TRADE_NICHE = { trades_fast: 'plumber', trades_big: 'roofer', health: 'dentist', places: 'venue', retail: 'furniture', food: 'restaurant', pro: 'lawyer' };
const VISUAL_TRADES = new Set(['trades_big', 'places', 'retail', 'health']);

export function diagnose(a, P) {
  // the research team's offers (research/handoff/2026-11-20/web/research/offers.json): templated 3D (phone scans, model-viewer, before / after),
  // the call engine and the text-back retainers; a custom 3D site only as a premium option, never the first offer
  const x = a || {}, offers = arr(P && P.offers), niches = arr(P && P.niches);
  let niche = byId(niches, TRADE_NICHE[x.trade] || 'roofer');
  if (x.trade === 'trades_big' && x.visual === 'yes') niche = byId(niches, x.budget === 'premium' ? 'builder' : 'landscaper') || niche;
  if (x.trade === 'places' && x.visual !== 'yes') niche = byId(niches, 'realestate') || niche;
  const why = [], addons = [];
  let offer = 'growth';
  const visual = x.visual === 'yes' && VISUAL_TRADES.has(x.trade);
  if (x.trade === 'food') { offer = 'gbp'; why.push('Restaurants are found on Google Maps first: fix the listing, then a fast menu site. AR menus: demo only (little effect on orders).'); addons.push('starter'); }
  else if (x.trade === 'trades_fast') {
    offer = x.site === 'ok' ? 'callengine' : 'starter';
    why.push('An emergency trade wins on speed, a phone number at the top and reviews: no 3D.');
    addons.push('textback'); why.push('They miss calls on jobs: missed-call text-back keeps those customers.');
  }
  else if (x.site === 'none' && x.budget === 'tight') { offer = 'subsite'; why.push('No site and a tight budget: the site on a subscription, no upfront ($149 a month, 12 months, in writing).'); }
  else if (visual) {
    offer = x.trade === 'retail' && x.site === 'ok' ? 'product3d' : 'growth';
    if (x.trade === 'places' || x.trade === 'health') { addons.push(x.trade === 'places' ? 'scan3d' : 'beforeafter'); }
    else if (x.trade === 'retail') { if (offer !== 'product3d') addons.push('product3d'); }
    else { addons.push('beforeafter'); if (x.budget === 'premium') addons.push('scan3d'); }
    why.push('Customers buy what they can see: sell the templated 3D piece (a phone-scan tour, a product viewer or before / after sliders), not a custom 3D build.');
    if (x.budget === 'premium' && x.site === 'ok' && (x.trade === 'places' || x.trade === 'trades_big')) { addons.push('immersive'); why.push('Premium and a decent site: a custom 3D site is possible later, only with a fixed written scope and 50% up front.'); }
  }
  else if (x.site === 'none') { offer = 'starter'; why.push('No website yet (17% of US small businesses still have none): the Starter site is the whole pitch.'); }
  else if (x.site === 'old') { offer = 'growth'; why.push('An old or slow site loses calls on phones: the Growth site fixes speed and adds a page per service and town.'); addons.push('a11y'); }
  else { offer = x.reviews === 'many' ? 'local' : 'callengine'; why.push('Their site is decent: sell results (the Google profile, reviews, calls), not a new site.'); }
  if (x.reviews === 'few' && !['gbp', 'local', 'callengine'].includes(offer)) { addons.push('local'); why.push('Under 10 Google reviews: add the reviews + Google profile engine (97% of people read local reviews).'); }
  const o = byId(offers, offer);
  const extras = [...new Set(addons)].map((id) => { const ao = byId(offers, id); return ao ? { id, name: ao.name, range: range(ao) } : null; }).filter(Boolean);
  const total = o ? range(o) : '';                                   // a site's own price carries its care plan ($49-$99 a month)
  return { offer: o, price: o ? range(o) : '', monthly: !!(o && o.monthly), total, script: niche ? niche.say : '', niche, three_d: niche ? niche.three_d : '', why, addons: extras };
}

// a free question -> the niche or the card that answers it
const TOPIC_WORDS = [
  ['textback', /\b(missed calls?|text ?back|voicemail)\b/],
  ['scan3d', /\b(scan|3d tour|virtual tour|walk-?through|gaussian|splat)\b/],
  ['a11yopener', /\b(accessibility|ada|a11y|speed check|site audit)\b/],
  ['killers', /\b(scope creep|what kills|mistakes?|fail(s|ing)?)\b/],
  ['price3d', /\b(price|pricing|charge|cost|quote)\b.*\b(3d|three d|immersive|webgl)\b|\b(3d|immersive)\b.*\b(price|pricing|charge|cost|worth)\b/],
  ['when3d', /\b(3d|immersive|three d)\b.*\b(niche|sell|gimmick|worth|when|best|who)\b|\b(best|which|what) (niche|trade|business(es)?)\b.*\b(3d|immersive)\b/],
  ['pricing', /\b(price|pricing|charge|how much|cost|quote|packages?)\b/],
  ['objections', /\b(objection|too expensive|not interested|nephew|already have|send me an email|they say)\b/],
  ['outreach', /\b(cold call|opener|outreach|pitch|first call|what do i say|script)\b/],
  ['gbp', /\b(google business|gbp|google (profile|listing|maps))\b/],
  ['localseo', /\b(seo|rank|near me|search)\b/],
  ['reviews', /\breviews?\b/],
  ['conversion', /\b(conversion|convert|more calls|leads from (the|my) site)\b/],
  ['ads', /\b(ads|advertis|ppc|local services)\b/],
  ['retainers', /\b(retainer|monthly|recurring|care plan|maintenance)\b/],
  ['upsells', /\b(upsell|add-?ons?|more from a client)\b/],
  ['positioning', /\b(niche|position|who should i (target|sell)|specialis|speciali[sz]e)\b/],
  ['process', /\b(process|timeline|how long|deposit|deliver)\b/],
];
const NICHE_WORDS = { roofer: /\broof/, plumber: /\b(plumb|hvac|electric)/, landscaper: /\b(landscap|pool|yard|garden)/, builder: /\b(builder|remodel|contractor|construction)/,
  dentist: /\b(dentist|dental|med ?spa|clinic|doctor)/, restaurant: /\b(restaurant|cafe|bar|bakery|pizza)/, venue: /\b(venue|wedding|event|hotel)/, realestate: /\b(real estate|realtor|realty|property|agent)/,
  auto: /\b(car|auto|dealer|mechanic)/, furniture: /\b(furniture|product|maker|showroom)/, gym: /\b(gym|fitness|studio|yoga|pilates)/, lawyer: /\b(lawyer|attorney|law firm|accountant|cpa)/ };
export function find(text, P) {
  const q = ' ' + String(text || '').toLowerCase() + ' ';
  const niches = arr(P && P.niches), cards = arr(P && P.cards);
  for (const [id, rx] of TOPIC_WORDS) if ((id === 'price3d' || id === 'when3d') && rx.test(q)) return { kind: 'card', item: byId(cards, id) };
  for (const [id, rx] of Object.entries(NICHE_WORDS)) if (rx.test(q)) { const n = byId(niches, id); if (n) return { kind: 'niche', item: n }; }
  for (const [id, rx] of TOPIC_WORDS) if (rx.test(q)) { const c = byId(cards, id); if (c) return { kind: 'card', item: c }; }
  return null;
}
export const sells3d = (P) => arr(P && P.niches).filter((n) => n.three_d === 'sells');
