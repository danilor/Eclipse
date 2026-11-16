import { SECTORS, STACK_IDS, GUARDIAN_IDS, OUTER_STACK_SIZE } from '../data/sectors.js';
import { SPECIES } from '../data/species.js';
import { TECHS, TECH_LIST } from '../data/techs.js';
import { buildDiscoveryTiles } from '../data/discoveries.js';
import { buildReputationBag } from '../data/reputation.js';
import { ACTIONS, NPC, POP_CUBES_PER_TRACK, SHIP_TYPES } from '../data/constants.js';
import { createRng, rngInt, rngShuffle } from './rng.js';
import { key, dirTo } from './hex.js';
import { createBlueprint } from './stats.js';

// Starting layouts by player count. Only the two-player layout is implemented for now.
export const LAYOUTS = {
  2: {
    starts: [
      { q: 0, r: 1 },
      { q: 0, r: -1 },
    ],
    guardians: [
      { q: 1, r: -1 },
      { q: 1, r: 0 },
      { q: -1, r: 1 },
      { q: -1, r: 0 },
    ],
  },
};

const GC = { q: 0, r: 0 };

export function makeTile(id, q, r, rot) {
  const def = SECTORS[id];
  return {
    key: key(q, r),
    q,
    r,
    id,
    rot,
    wh: def.wormholes.map((e) => (e + rot) % 6).sort((a, b) => a - b),
    controller: null,
    cubes: [],
    orbital: false,
    monolith: false,
    discovery: null,
  };
}

// Rotation that makes the arrow printed on a Starting/Guardian sector point at the Galactic Center.
function rotationFacingCenter(id, pos) {
  const arrow = SECTORS[id].arrow ?? 0;
  return (dirTo(pos, GC) - arrow + 6) % 6;
}

export function addShip(s, owner, type, at) {
  const ship = { id: s.nextId++, owner, type, at, damage: 0, seq: ++s.moveSeq };
  s.ships.push(ship);
  return ship;
}

export function drawDiscovery(s) {
  if (!s.discoveryBag.length && s.discoveryDiscard.length) {
    s.discoveryBag = rngShuffle(s.rng, s.discoveryDiscard.splice(0));
  }
  return s.discoveryBag.pop() || null;
}

export function drawTechs(s, regularCount) {
  let drawn = 0;
  while (drawn < regularCount && s.techBag.length) {
    const id = s.techBag.pop();
    s.tray[id] = (s.tray[id] || 0) + 1;
    if (!TECHS[id].rare) drawn++;
  }
}

function makePlayer(id, spec) {
  const sp = SPECIES[spec.species];
  const techs = { military: [], grid: [], nano: [] };
  for (const c of Object.keys(techs)) techs[c].push(...sp.startTechs[c]);
  return {
    id,
    species: sp.id,
    name: spec.name || sp.name,
    kind: spec.kind || 'ai',
    ai: spec.ai || null,
    res: { ...sp.start },
    totalDiscs: sp.discs,
    track: sp.discs,
    actionDiscs: Object.fromEntries(ACTIONS.map((a) => [a, 0])),
    reactionDiscs: 0,
    pop: { M: POP_CUBES_PER_TRACK, S: POP_CUBES_PER_TRACK, $: POP_CUBES_PER_TRACK },
    grave: { M: 0, S: 0, $: 0 },
    colony: { total: sp.colonyShips, up: sp.colonyShips },
    techs,
    blueprints: Object.fromEntries(SHIP_TYPES.map((t) => [t, createBlueprint(sp.id, t)])),
    ancientParts: [],
    rep: [],
    vpDisc: 0,
    passed: false,
    eliminated: false,
  };
}

function placeStartPopulation(s, p, tile) {
  const sp = SPECIES[p.species];
  const squares = SECTORS[tile.id].squares;
  squares.forEach((sq, i) => {
    const wantsStar = sp.traits.startPopulation?.includes(`${sq.kind}*`) && sq.adv;
    if ((!sq.adv && sq.kind !== 'A') || wantsStar) {
      tile.cubes.push({ owner: p.id, track: sq.kind, sq: i });
      p.pop[sq.kind] -= 1;
    }
  });
}

// Creates a complete, ready-to-play game state.
//   options.players: [{ species, name?, kind?: 'human' | 'ai', ai?: string }]
export function createState(options) {
  const n = options.players.length;
  const layout = LAYOUTS[n];
  if (!layout) throw new Error(`Unsupported player count: ${n}`);
  const rng = createRng(options.seed ?? Date.now());
  const s = {
    seed: options.seed ?? null,
    rng,
    round: 1,
    phase: 'setup',
    startPlayer: 0,
    nextId: 1,
    moveSeq: 0,
    decisionSeq: 0,
    players: [],
    map: {},
    ships: [],
    stacks: { I: [], II: [], III: [] },
    sectorDiscard: { I: [], II: [], III: [] },
    techBag: [],
    tray: {},
    discoveryBag: [],
    discoveryDiscard: [],
    repBag: [],
    firstPasser: null,
    log: [],
    over: false,
    winner: null,
    finalScores: null,
  };

  s.stacks.I = rngShuffle(rng, [...STACK_IDS.I]);
  s.stacks.II = rngShuffle(rng, [...STACK_IDS.II]);
  s.stacks.III = rngShuffle(rng, [...STACK_IDS.III]).slice(0, OUTER_STACK_SIZE[n]);

  const techs = [];
  for (const t of TECH_LIST) for (let i = 0; i < t.count; i++) techs.push(t.id);
  s.techBag = rngShuffle(rng, techs);
  drawTechs(s, { 2: 12, 3: 14, 4: 16, 5: 18, 6: 20 }[n]);

  s.repBag = rngShuffle(rng, buildReputationBag());
  s.discoveryBag = rngShuffle(rng, buildDiscoveryTiles());

  // Galactic Center
  const gc = makeTile('001', 0, 0, 0);
  gc.discovery = drawDiscovery(s);
  s.map[gc.key] = gc;
  addShip(s, NPC, 'gcds', gc.key);

  // Guardian sectors
  const guardianIds = rngShuffle(rng, [...GUARDIAN_IDS]);
  layout.guardians.forEach((pos, i) => {
    const id = guardianIds[i];
    const tile = makeTile(id, pos.q, pos.r, rotationFacingCenter(id, pos));
    tile.discovery = drawDiscovery(s);
    s.map[tile.key] = tile;
    addShip(s, NPC, 'guardian', tile.key);
  });

  // Players
  options.players.forEach((spec, i) => {
    const p = makePlayer(i, spec);
    s.players.push(p);
    const sp = SPECIES[p.species];
    const pos = layout.starts[i];
    const tile = makeTile(sp.home, pos.q, pos.r, rotationFacingCenter(sp.home, pos));
    tile.controller = p.id;
    p.home = tile.key;
    p.track -= 1;
    placeStartPopulation(s, p, tile);
    s.map[tile.key] = tile;
    addShip(s, p.id, sp.startShip, tile.key);
    if (sp.traits.startReputation) {
      for (let k = 0; k < sp.traits.startReputation; k++) {
        p.rep.push(s.repBag.splice(rngInt(rng, s.repBag.length), 1)[0]);
      }
    }
  });

  s.startPlayer = rngInt(rng, n);
  return s;
}
