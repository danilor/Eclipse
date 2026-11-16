import { describe, expect, it } from 'vitest';
import { DIRS, dirTo, distance, key, neighbors, opposite, ringOf, rotateEdges } from '../src/core/hex.js';
import { createRng, rngD6, rngNext, rngShuffle } from '../src/core/rng.js';
import { canon, withArticle } from '../src/core/util.js';
import { SECTORS, STACK_IDS, GUARDIAN_IDS } from '../src/data/sectors.js';
import { SPECIES_LIST } from '../src/data/species.js';
import { TECH_LIST } from '../src/data/techs.js';
import { PARTS } from '../src/data/parts.js';
import { blueprintTotals, createBlueprint, blueprintError } from '../src/core/stats.js';
import { UPKEEP, POP_TRACK } from '../src/data/constants.js';

describe('hex helpers', () => {
  it('has opposite directions that cancel out', () => {
    DIRS.forEach((d, i) => {
      const o = DIRS[opposite(i)];
      expect(d.q + o.q).toBe(0);
      expect(d.r + o.r).toBe(0);
    });
  });

  it('measures distance and direction', () => {
    expect(distance({ q: 0, r: 0 }, { q: 2, r: -1 })).toBe(2);
    expect(distance({ q: 0, r: 1 }, { q: 0, r: -1 })).toBe(2);
    for (const n of neighbors({ q: 3, r: -2 })) expect(distance({ q: 3, r: -2 }, n)).toBe(1);
    expect(dirTo({ q: 0, r: 0 }, { q: 1, r: -1 })).toBe(1);
    expect(dirTo({ q: 0, r: 0 }, { q: 3, r: 3 })).toBe(-1);
  });

  it('rotates edges and classifies rings', () => {
    expect(rotateEdges([0, 5], 2)).toEqual([2, 1]);
    expect(ringOf({ q: 0, r: 0 })).toBe(0);
    expect(ringOf({ q: 0, r: 1 })).toBe(1);
    expect(ringOf({ q: 2, r: 0 })).toBe('I');
    expect(ringOf({ q: 3, r: -3 })).toBe('II');
    expect(ringOf({ q: -4, r: 2 })).toBe('III');
    expect(key(2, -1)).toBe('2,-1');
  });
});

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = createRng(7);
    const b = createRng(7);
    expect([rngNext(a), rngNext(a), rngNext(a)]).toEqual([rngNext(b), rngNext(b), rngNext(b)]);
    expect(rngNext(createRng(8))).not.toBe(rngNext(createRng(7)));
  });

  it('rolls fair dice and shuffles without losing items', () => {
    const rng = createRng(1);
    const seen = new Set();
    for (let i = 0; i < 200; i++) seen.add(rngD6(rng));
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(rngShuffle(rng, [1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('utilities', () => {
  it('canonicalises commands regardless of key order', () => {
    expect(canon({ a: 1, b: { c: [1, 2], d: undefined } })).toBe(canon({ b: { c: [1, 2] }, a: 1 }));
    expect(canon({ a: 1 })).not.toBe(canon({ a: 2 }));
  });

  it('chooses the right article', () => {
    expect(withArticle('interceptor')).toBe('an interceptor');
    expect(withArticle('cruiser')).toBe('a cruiser');
  });
});

describe('static data', () => {
  it('describes twelve playable species', () => {
    expect(SPECIES_LIST).toHaveLength(12);
    for (const sp of SPECIES_LIST) {
      expect(SECTORS[sp.home], `${sp.id} home sector`).toBeDefined();
      for (const type of ['interceptor', 'cruiser', 'dreadnought', 'starbase']) {
        expect(sp.blueprints[type], `${sp.id} ${type}`).toBeDefined();
        expect(sp.costs[type]).toBeGreaterThan(0);
        for (const slot of sp.blueprints[type].slots) if (slot) expect(PARTS[slot], `${sp.id} ${slot}`).toBeDefined();
      }
      expect(sp.discs).toBeGreaterThanOrEqual(11);
    }
  });

  it('starts every species with a legal set of blueprints', () => {
    for (const sp of SPECIES_LIST) {
      const player = { species: sp.id, blueprints: Object.fromEntries(['interceptor', 'cruiser', 'dreadnought', 'starbase'].map((t) => [t, createBlueprint(sp.id, t)])) };
      for (const type of Object.keys(player.blueprints)) {
        expect(blueprintError(player, type), `${sp.id} ${type}`).toBeNull();
        const totals = blueprintTotals(player, type);
        expect(totals.energyUse).toBeLessThanOrEqual(totals.energyProd);
      }
    }
  });

  it('has wormhole edges within range on every sector', () => {
    for (const s of Object.values(SECTORS)) {
      for (const e of s.wormholes) expect(e >= 0 && e < 6).toBe(true);
      expect(s.vp).toBeGreaterThanOrEqual(0);
    }
  });

  it('fills the sector stacks and guardian pool', () => {
    expect(STACK_IDS.I.length).toBeGreaterThan(0);
    expect(STACK_IDS.II.length).toBeGreaterThan(0);
    expect(STACK_IDS.III.length).toBeGreaterThanOrEqual(5);
    expect(GUARDIAN_IDS.length).toBeGreaterThanOrEqual(4);
    const all = [...STACK_IDS.I, ...STACK_IDS.II, ...STACK_IDS.III, ...GUARDIAN_IDS];
    expect(new Set(all).size).toBe(all.length);
  });

  it('defines technologies with sane costs', () => {
    for (const t of TECH_LIST) {
      expect(t.count).toBeGreaterThan(0);
      expect(t.cost).toBeGreaterThanOrEqual(t.min);
    }
  });

  it('keeps the track tables monotone', () => {
    for (let i = 1; i < UPKEEP.length; i++) expect(UPKEEP[i]).toBeGreaterThanOrEqual(UPKEEP[i - 1]);
    for (let i = 1; i < POP_TRACK.length; i++) expect(POP_TRACK[i]).toBeGreaterThanOrEqual(POP_TRACK[i - 1]);
  });
});
