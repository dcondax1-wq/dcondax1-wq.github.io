// ARENA trophies (ES module, no DOM, no clock): 28 achievements that sit on pedestals in the colosseum. They are read from the
// score (rules.js score()) and the boss stats (bosses.js), so they come only from verifiable events and never from $, size or R.
// A trophy gives honour, not XP (the XP comes from the events themselves).
//   TROPHIES                          the definitions (id, name, tier, text, how to read the value)
//   trophies(sc, boss) -> [{ id, name, tier, glyph, text, value, goal, earned }]  in pedestal order
// tier: bronze < silver < gold < legend.
const T = (id, name, tier, glyph, text, goal, get) => ({ id, name, tier, glyph, text, goal, get });
const c = (k) => (sc) => sc.counts[k] || 0;
const best = (k) => (sc) => (sc.streaks[k] || {}).best || 0;

export const TROPHIES = [
  T('first_blood', 'First Blood', 'bronze', 'I', 'Your first trade inside every rule', 1, c('clean_trade')),
  T('sharpshooter', 'Sharpshooter', 'silver', 'X', '10 trades inside every rule', 10, c('clean_trade')),
  T('centurion', 'Centurion', 'gold', 'C', '50 trades inside every rule', 50, c('clean_trade')),
  T('iron_will', 'Iron Will', 'bronze', 'Fe', '5 clean trades in a row, no manual order', 5, best('discipline')),
  T('unbreakable', 'Unbreakable', 'silver', 'Ag', '15 clean trades in a row', 15, best('discipline')),
  T('adamant', 'Adamant', 'gold', 'Au', '30 clean trades in a row', 30, best('discipline')),
  T('clockwork', 'Clockwork', 'bronze', 'Ck', 'The bot ran 5 market days in a row', 5, best('uptime')),
  T('sentinel', 'Sentinel', 'gold', 'St', 'The bot ran 21 market days in a row', 21, best('uptime')),
  T('plan_keeper', 'Plan Keeper', 'silver', 'P', 'A finished week of 2 to 4 clean trades', 1, c('plan_week')),
  T('plan_master', 'Plan Master', 'gold', 'PM', '4 plan weeks', 4, c('plan_week')),
  T('green_ledger', 'Green Ledger', 'silver', 'G', '3 green weeks, every trade inside the rules', 3, c('green_week')),
  T('scribe', 'Scribe', 'bronze', 'Sc', '3 daily notes in a row', 3, best('journal')),
  T('chronicler', 'Chronicler', 'gold', 'Ch', '14 daily notes in a row', 14, best('journal')),
  T('taskmaster', 'Taskmaster', 'silver', 'Tm', '50 Planner tasks done', 50, c('task_done')),
  T('creature_of_habit', 'Creature of Habit', 'silver', 'Hb', '20 habit check-ins', 20, c('habit')),
  T('goal_getter', 'Goal Getter', 'bronze', 'Gg', '7 daily goals in a row', 7, best('planner')),
  T('questing', 'Questing', 'bronze', 'Q', '15 daily quests done', 15, c('quest')),
  T('sweeper', 'Sweeper', 'silver', 'Sw', '5 days in a row with all 3 quests', 5, best('quests')),
  T('boss_slayer', 'Boss Slayer', 'bronze', 'B1', 'Beat your first weekly boss', 1, (sc, b) => b.slain),
  T('boss_hunter', 'Boss Hunter', 'silver', 'B5', 'Beat 5 weekly bosses', 5, (sc, b) => b.slain),
  T('boss_bane', 'Bane of Monsters', 'gold', 'B15', 'Beat 15 weekly bosses', 15, (sc, b) => b.slain),
  T('hero_rank', 'Hero', 'bronze', 'H', 'Reach the rank of Hero', 1, (sc) => (sc.rank.i >= 1 ? 1 : 0)),
  T('demigod_rank', 'Demigod', 'silver', 'D', 'Reach the rank of Demigod', 1, (sc) => (sc.rank.i >= 2 ? 1 : 0)),
  T('olympian_rank', 'Olympian', 'gold', 'O', 'Reach the rank of Olympian', 1, (sc) => (sc.rank.i >= 3 ? 1 : 0)),
  T('titan_rank', 'Titan', 'legend', 'T', 'Reach the top rank, Titan', 1, (sc) => (sc.rank.i >= 4 ? 1 : 0)),
  T('payday', 'Payday', 'gold', '$', 'A payout recorded on a funded account', 1, c('payout')),
  T('eval_victor', 'Eval Victor', 'gold', 'EV', 'Pass an eval', 1, c('eval_passed')),
  T('twelve_labours', 'The Twelve', 'legend', 'XII', 'Earn all 12 Labours', 12, (sc) => sc.earned),
];

export function trophies(sc, boss) {
  const b = boss || { slain: 0 };
  return TROPHIES.map((t) => {
    const v = Math.min(t.goal, Math.max(0, +t.get(sc, b) || 0));
    return { id: t.id, name: t.name, tier: t.tier, glyph: t.glyph, text: t.text, value: v, goal: t.goal, earned: v >= t.goal };
  });
}
