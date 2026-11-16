// Sector tiles, transcribed from the Sector sheets.
//
// wh   : edges with a Wormhole in the tile's printed orientation (0 = top, then clockwise).
// sq   : population squares. M = Materials, S = Science, $ = Money, A = any (gray).
//        A trailing * marks an Advanced square.
// disc : the tile shows a Discovery Tile symbol; anc: number of Ancients printed next to it.
// art  : the tile carries an Artifact.
// arrow: edge holding the arrow that points at the Galactic Center for Starting / Guardian Sectors.

const parseSquares = (s) =>
  s
    ? s.split(',').map((q) => ({ kind: q.replace('*', ''), adv: q.endsWith('*') }))
    : [];

const sector = (id, ring, vp, wh, sq, extra = {}) => ({
  id,
  ring, // 'GC' | 'START' | 'GUARD' | 'I' | 'II' | 'III'
  vp,
  art: false,
  disc: false,
  anc: 0,
  warp: false,
  wormholes: wh,
  squares: parseSquares(sq),
  ...extra,
});

const START_WH = [0, 1, 3, 4];

const list = [
  sector('001', 'GC', 4, [0, 1, 2, 3, 4, 5], 'S*,S,M*,M,$,$', { art: true, disc: true }),

  // Starting sectors
  sector('221', 'START', 3, START_WH, '$*,$,S*,S,M', { art: true, arrow: 0 }),
  sector('223', 'START', 3, START_WH, '$*,$,S*,S,M', { art: true, arrow: 0 }),
  sector('225', 'START', 3, START_WH, '$*,$,S*,S,M', { art: true, arrow: 0 }),
  sector('227', 'START', 3, START_WH, '$*,$,S*,S,M', { art: true, arrow: 0 }),
  sector('229', 'START', 3, START_WH, '$*,$,S*,S,M', { art: true, arrow: 0 }),
  sector('231', 'START', 3, START_WH, '$*,$,S*,S,M', { art: true, arrow: 0 }),
  sector('222', 'START', 3, START_WH, 'S,S*,$,$*', { art: true, arrow: 3 }),
  sector('224', 'START', 3, START_WH, 'M*,S*,$', { art: true, arrow: 3 }),
  sector('226', 'START', 3, START_WH, 'M,S', { art: true, arrow: 3 }),
  sector('228', 'START', 3, START_WH, '$,S,M*', { art: true, arrow: 0 }),
  sector('230', 'START', 3, START_WH, '$*,$,S,M*', { art: true, arrow: 0 }),
  sector('232', 'START', 3, START_WH, 'M,M*,S,$*', { art: true, arrow: 3 }),

  // Guardian sectors
  sector('271', 'GUARD', 2, START_WH, 'M*,$,S', { art: true, disc: true, arrow: 3, guardian: true }),
  sector('272', 'GUARD', 2, START_WH, 'S*,M,$', { art: true, disc: true, arrow: 3, guardian: true }),
  sector('273', 'GUARD', 2, START_WH, 'M,M*,$', { art: true, disc: true, arrow: 3, guardian: true }),
  sector('274', 'GUARD', 2, START_WH, 'S,S*,$', { art: true, disc: true, arrow: 3, guardian: true }),

  // Inner ring
  sector('101', 'I', 2, [1, 2, 3, 4, 5], 'M*,M,$', { disc: true, anc: 1 }),
  sector('102', 'I', 2, [0, 2, 3, 5], 'S,S'),
  sector('103', 'I', 2, [0, 1, 2, 4, 5], 'S,$'),
  sector('104', 'I', 2, [0, 1, 3, 4], '$*,$,S*,S', { disc: true, anc: 2 }),
  sector('105', 'I', 2, [0, 1, 3, 4, 5], '$,S,M*', { disc: true, anc: 1 }),
  sector('106', 'I', 2, [0, 2, 3, 4, 5], 'S,M'),
  sector('107', 'I', 3, [0, 2, 3, 4, 5], 'M*,$,S*', { art: true }),
  sector('108', 'I', 2, [0, 1, 3, 4, 5], 'S,$*,A', { disc: true, anc: 1 }),
  sector('109', 'I', 4, [1, 2, 3, 4, 5], 'M,$', { art: true, disc: true, anc: 1 }),
  sector('110', 'I', 2, [0, 2, 3, 4], '$*,A*'),

  // Middle ring
  sector('201', 'II', 1, [1, 3, 5], 'M,$'),
  sector('202', 'II', 2, [0, 2, 4, 5], 'S*,S*', { art: true }),
  sector('203', 'II', 2, [0, 2, 3, 4], 'S,$*,M', { disc: true, anc: 1 }),
  sector('204', 'II', 2, [0, 2, 3, 4], 'M*,$*,A', { art: true, disc: true, anc: 1 }),
  sector('205', 'II', 1, [0, 1, 5], 'S,$,$*', { art: true }),
  sector('206', 'II', 1, [0, 2, 4, 5], 'M', { disc: true }),
  sector('207', 'II', 2, [0, 3, 4], '', { disc: true }),
  sector('208', 'II', 2, [0, 3, 4, 5], '', { disc: true }),
  sector('209', 'II', 1, [0, 2, 3, 4], 'S,$'),
  sector('210', 'II', 1, [0, 2, 3, 4, 5], 'M,$'),
  sector('211', 'II', 1, [0, 1, 2, 3], '$,M*,A', { disc: true, anc: 1 }),
  sector('214', 'II', 2, [1, 2, 3, 4, 5], 'S,M*,A', { disc: true, anc: 1 }),
  sector('281', 'II', 2, [0, 2, 3, 5], '$*,S', { disc: true, warp: true }),

  // Outer ring
  sector('301', 'III', 2, [0, 2, 3], '$,S,M*', { disc: true, anc: 2 }),
  sector('302', 'III', 2, [0, 1, 3], 'M,$*,S*', { art: true, disc: true, anc: 2 }),
  sector('303', 'III', 2, [0, 2], '$*,S*,A', { art: true, disc: true, anc: 2 }),
  sector('304', 'III', 2, [0, 3], 'M,$*'),
  sector('305', 'III', 1, [0, 3, 4], 'M,S', { disc: true, anc: 2 }),
  sector('306', 'III', 1, [0, 4], 'M,$'),
  sector('307', 'III', 2, [0, 2, 3], '$,S*'),
  sector('308', 'III', 2, [2, 3, 5], 'S,M*'),
  sector('309', 'III', 2, [0, 3, 5], '$,S*'),
  sector('310', 'III', 1, [0, 3], 'S,M'),
  sector('311', 'III', 1, [0, 2, 3], 'M', { disc: true }),
  sector('312', 'III', 1, [0, 1, 3], 'M', { disc: true }),
  sector('313', 'III', 1, [0, 3], 'A', { disc: true }),
  sector('314', 'III', 1, [0, 1, 5], 'A', { disc: true }),
  sector('315', 'III', 1, [0, 2, 3], '', { disc: true }),
  sector('316', 'III', 1, [0, 3, 4], '', { disc: true }),
  sector('317', 'III', 2, [0, 1], '$,$*'),
  sector('318', 'III', 1, [0, 1, 5], 'M*,A'),
  sector('381', 'III', 1, [0, 1, 3], '$,M', { disc: true, warp: true }),
  sector('382', 'III', 1, [0, 3, 5], 'S,M', { disc: true, warp: true }),
];

export const SECTORS = Object.fromEntries(list.map((s) => [s.id, s]));

// Sectors that are shuffled into the exploration stacks (Warp Portal sectors are an optional module).
export const STACK_IDS = {
  I: list.filter((s) => s.ring === 'I').map((s) => s.id),
  II: list.filter((s) => s.ring === 'II' && !s.warp).map((s) => s.id),
  III: list.filter((s) => s.ring === 'III' && !s.warp).map((s) => s.id),
};

export const GUARDIAN_IDS = list.filter((s) => s.ring === 'GUARD').map((s) => s.id);

// Number of Outer sectors in the stack by player count.
export const OUTER_STACK_SIZE = { 2: 5, 3: 8, 4: 14, 5: 16, 6: 18 };
