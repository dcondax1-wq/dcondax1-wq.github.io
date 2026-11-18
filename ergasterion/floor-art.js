// ERGASTERION: the environment art (2026-11-11, the environment art pass; olympus/env-kit.js). floor.js keeps the people, the stations, the boards,
// the camera and the life; this file dresses the place so the four halls read as real workshops and the camp as a real caravan camp:
//   - the surfaces: every stone / bronze / crate / sand batch of floor.js gets a Poly Haven scan (triplanar, instance colours kept), the HDRI light;
//   - fluted Doric columns along the walls, a forged anvil at every smith's station (in the halls and in the camp);
//   - per hall, props against the walls (never in a doorway, on a path or near the front door where you start):
//       Money hall: a gold chest, coin stacks, a counting table, yellow banners, a shelf of strongboxes;
//       Trading hall: red and blue banners, a sword and shield, crates and barrels, a table of candles and bottles;
//       Research hall: shelves of bottles, a long table with candles, kegs, rubble and crates of samples;
//       Library: worn bookshelves (Poly Haven), trunks, a reading table with candles, banners;
//   - THE CAMP: KayKit tents (one per builder), sacks, crates, barrels, lumber and stone, a wheelbarrow, buckets, rocks and a few trees at the edge.
// Draws: the props are ONE draw per pack (dungeon, camp), the bookshelves one, the builder (columns, anvils) three. Every file is optional.
//   materials(kit) -> { stone, metal, wood, sand }  (the batch materials)    dress(scene, kit, ctx) -> { ready, stats }
import * as THREE from '../jarvis/three.module.min.js';

/** the batch materials of floor.js, as scans (white base colour: the instance colours ARE the mean colours) */
export function materials(kit) {
  return {
    stone: kit.mat('marble', { color: '#ffffff', scale: 0.55 }),
    metal: kit.mat('bronze', { color: '#ffffff', rough: 0.42 }),
    wood: kit.mat('wood', { color: '#ffffff', scale: 1.4 }),
    sand: kit.mat('sand', { color: '#ffffff', scale: 0.3 }),
    cloth: kit.mat('cloth', { color: '#ffffff' }),
  };
}

/** ctx = { S (stations), Y0 (platform top), CAMP_SPOTS, CAMP, MARBLE (column colour) } */
export function dress(scene, kit, ctx) {
  const { S, Y0, CAMP_SPOTS, CAMP } = ctx, B = kit.builder();
  // fluted columns along the outer walls (where floor.js had plain cylinders)
  const colAt = (x, z) => B.column({ x, z, h: 3.4, r: 0.25, flutes: 12, color: ctx.MARBLE || '#d9d2c3' });
  for (const x of [-11, -6.5, -2, 2, 11]) { colAt(x, -9.7); colAt(x, 9.7); }
  colAt(6.5, -9.7);
  for (const z of [-5, 5]) { colAt(-12.7, z); colAt(12.7, z); }
  // a real anvil at every smith (stations stand on a platform Y0 high; the camp's smiths at their tables)
  S.forEach((s) => { if (s.job === 'smith') B.anvil({ x: s.x, y: Y0, z: s.z + 0.5, s: 0.62, ry: Math.PI / 2, stump: 'marble:uv', wood: '#8a7a66' }); });
  CAMP_SPOTS.forEach((c) => { if (c.job === 'smith') B.anvil({ x: c.x + 0.75, z: c.z - 2.45, s: 0.6, ry: 0.4, stump: 'marble:uv', wood: '#8a7a66' }); });
  const built = B.build(scene);
  // the halls' props (KayKit Dungeon): [name, x, y, z, ry, scale]
  const N = 0, E = -Math.PI / 2, W = Math.PI / 2, Sx = Math.PI;      // facing: away from the north wall (+z), from the east wall (-x), from the west wall (+x), from the south wall
  const hall = [
    // Money hall (x -13..0, z -10..0)
    ['chest_gold', -12.1, 0, -9.0, N + 0.3, 1.1], ['coin_stack_large', -11.2, 0, -9.3, 0.4, 1.1], ['coin_stack_medium', -12.4, 0, -8.0, 0.9, 1.1], ['coin_stack_small', -11.4, 0, -8.4, 2, 1.1],
    ['table_medium', -12.1, 0, -5.6, W, 1.3], ['coin_stack_medium', -12.1, 0.65, -5.4, 0, 0.8], ['candle_lit', -12.2, 0.65, -6.0, 0, 1],
    ['banner_patternB_yellow', -4.3, 0, -9.82, N, 1.1], ['banner_patternB_yellow', -8.7, 0, -9.82, N, 1.1], ['shelves', -12.88, 0, -1.6, W, 1.1], ['chest', -12.2, 0, -1.4, W, 1.0],
    ['barrel_small', -0.7, 0, -9.2, 0, 1.2], ['box_small_decorated', -0.8, 0, -1.0, 0.3, 1.2],
    // Trading hall (x 0..13, z -10..0)
    ['banner_patternA_red', 9.0, 0, -9.82, N, 1.1], ['banner_patternA_blue', 1.0, 0, -9.82, N, 1.1], ['sword_shield', 12.9, 1.6, -5.0, E, 1.4],
    ['crates_stacked', 12.1, 0, -9.0, E + 0.2, 1.1], ['barrel_large', 12.3, 0, -1.0, 0, 1.0], ['barrel_small_stack', 11.8, 0, -1.9, 0.5, 1.0],
    ['table_small', 1.2, 0, -1.3, 0.2, 1.4], ['candle_triple', 1.2, 0.7, -1.3, 0, 1], ['bottle_A_brown', 1.5, 0.7, -1.1, 0, 1],
    // Research hall (x -13..0, z 0..10)
    ['shelves', -12.88, 0, 4.4, W, 1.1], ['shelf_small', -12.9, 1.5, 8.2, W, 1.2], ['bottle_B_green', -12.7, 1.62, 8.0, 0, 1], ['bottle_C_brown', -12.7, 1.62, 8.5, 0, 1],
    ['table_long', -2.4, 0, 8.4, W, 1.0], ['candle_triple', -2.6, 0.98, 8.2, 0, 1], ['bottle_A_brown', -2.2, 0.98, 8.8, 0, 1], ['bottle_B_green', -2.3, 0.98, 7.6, 0, 1],
    ['keg', -0.8, 0, 1.2, 0, 1], ['rubble_half', -8.6, 0, 9.4, Sx, 0.5],
    // Library (x 0..13, z 0..10): trunks, a reading table, banners (the bookshelves are Poly Haven, below)
    ['trunk_large_A', 12.2, 0, 1.2, E, 1.0], ['trunk_medium_B', 12.3, 0, 9.0, E, 1.1], ['table_medium_tablecloth', 10.2, 0, 8.4, 0, 1.3], ['candle_lit', 10.0, 0.66, 8.3, 0, 1], ['candle_lit', 10.5, 0.66, 8.6, 0, 1],
    ['banner_patternC_green', 0.18, 0, 8.4, W, 1.0], ['banner_thin_yellow', 0.18, 0, 1.6, W, 1.0],
    // torches on the walls by every door
    ['torch_mounted', -0.18, 1.7, -3.3, E, 1.3], ['torch_mounted', 0.18, 1.7, -6.7, W, 1.3], ['torch_mounted', -4.6, 1.7, -0.18, Sx, 1.3], ['torch_mounted', 4.6, 1.7, 0.18, N, 1.3],
  ];
  const props = kit.place(scene, 'dungeon', hall);
  // the camp (KayKit Medieval): a tent per builder (its door to the north, toward the factory), supplies between them, rocks and trees at the edge
  const camp = [];
  CAMP_SPOTS.forEach((c, j) => {
    camp.push(['tent', c.x, 0, c.z + 0.2, Math.PI, 1.35]);
    const side = j % 2 ? -1 : 1;
    camp.push([['sack', 'crate_A_big', 'barrel', 'crate_B_small', 'bucket_water'][j % 5], c.x + side * 1.45, 0, c.z + 0.6, j * 0.7, 1.1]);
  });
  camp.push(['wheelbarrow', 2.6, 0, 12.6, 0.6, 1.2], ['resource_lumber', 10.6, 0, 12.3, 0.2, 1.1], ['resource_stone', 13.4, 0, 12.6, -0.3, 1.1], ['pallet', 9.1, 0, 18.3, 0, 1.2],
    ['crate_long_A', -2.4, 0, 17.6, 1.2, 1.1], ['sack', 15.6, 0, 16.0, 0.4, 1.2], ['flag_red', -3.0, 0, 13.0, 0, 1.4], ['flag_yellow', 16.0, 0, 13.0, 0, 1.4],
    ['rock_single_A', -4.2, 0, 22.5, 0.3, 2.2], ['rock_single_C', 17.6, 0, 22.2, 1.2, 2.4], ['rock_single_E', 18.4, 0, 15.2, 0.4, 2.0], ['rock_single_B', -5.0, 0, 15.4, 2.1, 2.2], ['rock_single_D', 3.0, 0, 24.6, 0.4, 2.0],
    ['trees_B_small', -6.2, 0, 19.0, 0.4, 1.6], ['tree_single_B', 19.2, 0, 18.4, 0, 1.7], ['trees_A_small', 11.0, 0, 25.6, 1.0, 1.6]);
  const tents = kit.place(scene, 'camp', camp);
  const books = kit.hero(scene, 'bookshelf', [[12.62, 0, 4.8, -Math.PI / 2, 1], [0.38, 0, 7.2, Math.PI / 2, 1]], { envI: 0.6 });
  // (no contact-shadow draw here: the factory's draw budget goes to the people)
  return { built, ready: Promise.all([props, tents, books]), stats: () => kit.stats() };
}
export { THREE };
