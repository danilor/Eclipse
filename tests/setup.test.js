import { describe, expect, it } from 'vitest';
import { createState } from '../src/core/setup.js';
import { SPECIES, SPECIES_LIST } from '../src/data/species.js';
import { NPC, POP_CUBES_PER_TRACK } from '../src/data/constants.js';
import { OUTER_STACK_SIZE, STACK_IDS } from '../src/data/sectors.js';
import { TECHS } from '../src/data/techs.js';
import { scoreBreakdown } from '../src/core/queries.js';
import { checkInvariants } from './helpers.js';

const duel = (a, b) => [
  { species: a, name: 'A' },
  { species: b, name: 'B' },
];

describe('createState', () => {
  const s = createState({ seed: 11, players: duel('terran-union', 'terran-alliance') });

  it('lays out the galaxy for two players', () => {
    expect(Object.keys(s.map).sort()).toEqual(['-1,0', '-1,1', '0,-1', '0,0', '0,1', '1,-1', '1,0']);
    expect(s.map['0,0'].id).toBe('001');
    expect(s.map['0,1'].controller).toBe(0);
    expect(s.map['0,-1'].controller).toBe(1);
    expect(s.players.map((p) => p.home)).toEqual(['0,1', '0,-1']);
  });

  it('places the neutral defenders and the starting ships', () => {
    const npc = s.ships.filter((x) => x.owner === NPC).map((x) => x.type);
    expect(npc.sort()).toEqual(['gcds', 'guardian', 'guardian', 'guardian', 'guardian']);
    for (const p of s.players) {
      const mine = s.ships.filter((x) => x.owner === p.id);
      expect(mine).toHaveLength(1);
      expect(mine[0].type).toBe('interceptor');
      expect(mine[0].at).toBe(p.home);
    }
    const ids = s.ships.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every player the printed resources, discs and population', () => {
    for (const p of s.players) {
      const sp = SPECIES[p.species];
      expect(p.res).toEqual(sp.start);
      expect(p.totalDiscs).toBe(sp.discs);
      expect(p.track).toBe(sp.discs - 1);
      expect(p.colony).toEqual({ total: sp.colonyShips, up: sp.colonyShips });
      const placed = s.map[p.home].cubes.length;
      expect(placed).toBeGreaterThan(0);
      expect(p.pop.M + p.pop.S + p.pop.$).toBe(3 * POP_CUBES_PER_TRACK - placed);
    }
    expect(scoreBreakdown(s, 0).total).toBe(3);
  });

  it('prepares the sector stacks, tech tray and bags', () => {
    expect(s.stacks.I).toHaveLength(STACK_IDS.I.length);
    expect(s.stacks.II).toHaveLength(STACK_IDS.II.length);
    expect(s.stacks.III).toHaveLength(OUTER_STACK_SIZE[2]);
    const regular = Object.entries(s.tray).filter(([id]) => !TECHS[id].rare);
    expect(regular.reduce((n, [, c]) => n + c, 0)).toBe(12);
    expect(s.repBag.length).toBeGreaterThan(10);
    expect(s.discoveryBag.length).toBeGreaterThan(5);
    expect(s.players.some((p) => p.id === s.startPlayer)).toBe(true);
  });

  it('is deterministic for a given seed', () => {
    const again = createState({ seed: 11, players: duel('terran-union', 'terran-alliance') });
    expect(JSON.stringify(again)).toBe(JSON.stringify(s));
    const other = createState({ seed: 12, players: duel('terran-union', 'terran-alliance') });
    expect(JSON.stringify(other)).not.toBe(JSON.stringify(s));
  });

  it('rejects unsupported player counts', () => {
    expect(() => createState({ seed: 1, players: [{ species: 'hydran' }] })).toThrow();
  });
});

describe('every species', () => {
  it('starts in a consistent position', () => {
    SPECIES_LIST.forEach((sp, i) => {
      const other = SPECIES_LIST[(i + 1) % SPECIES_LIST.length];
      const state = createState({ seed: 100 + i, players: duel(sp.id, other.id) });
      expect(state.map[state.players[0].home].id).toBe(sp.home);
      expect(state.map[state.players[1].home].id).toBe(other.home);
      expect(() => checkInvariants(state), sp.id).not.toThrow();
    });
  });
});
