import { describe, expect, it } from 'vitest';
import {
  activationsFor,
  applyBuild,
  applyColonize,
  applyResearch,
  applyTrade,
  applyUpgrade,
  buildOptions,
  colonizeOptions,
  drawReputation,
  exploreZones,
  gainTech,
  influenceOptions,
  moveOptions,
  placeInfluence,
  placeSector,
  placementRotations,
  removeInfluence,
  researchOptions,
  tradeOptions,
  upgradeCandidates,
  upgradeError,
} from '../src/core/rules.js';
import { reachableKeys, productionOf, researchCost, upkeepOf, shipsAt } from '../src/core/queries.js';
import { rotateEdges } from '../src/core/hex.js';
import { SECTORS } from '../src/data/sectors.js';
import { NPC, UPKEEP, POP_TRACK } from '../src/data/constants.js';
import { makeGame, checkInvariants } from './helpers.js';

const fresh = (seed = 5) => {
  const g = makeGame(seed);
  const s = g.state;
  return { g, s, p: s.players[0], q: s.players[1] };
};

const upgrade = (part, bp, slot, returns = []) => ({ type: 'upgrade', returns, place: { part, bp, slot } });

describe('upkeep and production tables', () => {
  it('charges the printed upkeep for every empty Influence Track space', () => {
    const expected = { 13: 0, 12: 0, 11: 0, 10: 1, 9: 2, 8: 3, 7: 5, 6: 7, 5: 10, 4: 13, 3: 17, 2: 21, 1: 25, 0: 30 };
    for (const [track, cost] of Object.entries(expected)) expect(upkeepOf({ track: Number(track) }), `track ${track}`).toBe(cost);
    expect(UPKEEP).toHaveLength(13);
  });

  it('produces more the fewer cubes remain on a Population Track', () => {
    const at = (n) => productionOf({ pop: { M: n, S: n, $: n } }).M;
    expect(at(11)).toBe(2);
    expect(at(10)).toBe(3);
    expect(at(0)).toBe(POP_TRACK[12]);
    expect(at(13)).toBe(0);
    for (let n = 1; n <= 12; n++) expect(at(n - 1)).toBeGreaterThanOrEqual(at(n));
  });
});

describe('influence and population', () => {
  it('moves discs between the track and the board', () => {
    const { s, p } = fresh();
    const before = p.track;
    placeInfluence(s, p.id, '0,0');
    expect(p.track).toBe(before - 1);
    expect(s.map['0,0'].controller).toBe(0);
    removeInfluence(s, '0,0');
    expect(p.track).toBe(before);
    expect(s.map['0,0'].controller).toBeNull();
  });

  it('returns the cubes of an abandoned sector to the population tracks', () => {
    const { s, p } = fresh();
    const cubes = s.map[p.home].cubes.length;
    const onTracks = p.pop.M + p.pop.S + p.pop.$;
    removeInfluence(s, p.home);
    expect(s.map[p.home].cubes).toHaveLength(0);
    expect(p.pop.M + p.pop.S + p.pop.$).toBe(onTracks + cubes);
    checkInvariants(s);
  });

  it('only offers advanced squares with the matching technology', () => {
    const { s, p } = fresh();
    expect(colonizeOptions(s, p)).toEqual([]);
    p.techs.grid.push('advancedEconomy');
    const options = colonizeOptions(s, p);
    expect(options).toEqual([{ type: 'colonize', at: p.home, sq: 0, track: '$' }]);
    applyColonize(s, p, options[0]);
    expect(p.colony.up).toBe(p.colony.total - 1);
    expect(colonizeOptions(s, p)).toEqual([]);
    checkInvariants(s);
  });

  it('trades at the species rate', () => {
    const { p } = fresh();
    expect(tradeOptions(p)).toHaveLength(6);
    applyTrade(p, { type: 'trade', from: 'M', to: '$' });
    expect(p.res).toEqual({ M: 2, S: 3, $: 4 });
    p.res.M = 1;
    expect(tradeOptions(p).every((o) => o.from !== 'M')).toBe(true);
  });
});

describe('research', () => {
  it('applies tech discounts down to the printed minimum', () => {
    const { p } = fresh();
    expect(researchCost(p, 'plasmaCannon', 'military')).toBe(5);
    p.techs.military.push('neutronBombs', 'phaseShield', 'tachyonSource');
    expect(researchCost(p, 'plasmaCannon', 'military')).toBe(4);
  });

  it('offers only affordable techs the player does not own', () => {
    const { s, p } = fresh();
    p.res.S = 0;
    expect(researchOptions(s, p)).toEqual([]);
    p.res.S = 100;
    const options = researchOptions(s, p);
    expect(options.length).toBeGreaterThan(5);
    for (const o of options) {
      expect(s.tray[o.tech]).toBeGreaterThan(0);
      expect(o.cost).toBe(researchCost(p, o.tech, o.track));
      expect(p.techs.military.concat(p.techs.grid, p.techs.nano)).not.toContain(o.tech);
    }
  });

  it('pays Science, moves the tile and grants extra Influence Discs', () => {
    const { s, p } = fresh();
    s.tray.quantumGrid = 1;
    p.res.S = 40;
    const discs = p.totalDiscs;
    const track = p.track;
    applyResearch(s, p, { type: 'research', tech: 'quantumGrid', track: 'grid', cost: 8 });
    expect(p.res.S).toBe(32);
    expect(s.tray.quantumGrid).toBeUndefined();
    expect(p.techs.grid).toContain('quantumGrid');
    expect(p.totalDiscs).toBe(discs + 2);
    expect(p.track).toBe(track + 2);
    s.tray.advancedRobotics = 1;
    gainTech(s, p, 'advancedRobotics', 'nano');
    expect(p.totalDiscs).toBe(discs + 3);
    checkInvariants(s);
  });

  it('changes the number of activations of an action', () => {
    const { p } = fresh();
    expect(activationsFor(p, 'move')).toBe(3);
    expect(activationsFor(p, 'build')).toBe(2);
    expect(activationsFor(p, 'upgrade')).toBe(2);
    p.techs.nano.push('nanorobots');
    p.techs.military.push('x');
    p.techs.grid.push('improvedLogistics', 'picoModulator');
    expect(activationsFor(p, 'build')).toBe(3);
    expect(activationsFor(p, 'move')).toBe(4);
    expect(activationsFor(p, 'upgrade')).toBe(4);
  });
});

describe('upgrade', () => {
  it('requires the part to be available', () => {
    const { p } = fresh();
    expect(upgradeError(p, upgrade('gaussShield', 'interceptor', 3))).toMatch(/not available/);
    p.techs.grid.push('gaussShield');
    expect(upgradeError(p, upgrade('gaussShield', 'interceptor', 3))).toBeNull();
    expect(upgradeError(p, upgrade('doesNotExist', 'interceptor', 3))).toMatch(/Unknown part/);
  });

  it('keeps the energy balance non-negative', () => {
    const { p } = fresh();
    p.techs.military.push('plasmaCannon');
    p.techs.grid.push('fusionSource');
    expect(upgradeError(p, upgrade('plasmaCannon', 'interceptor', 3))).toMatch(/energy/);
    expect(upgradeError(p, upgrade('plasmaCannon', 'cruiser', 5))).toMatch(/energy/);
    applyUpgrade(p, upgrade('fusionSource', 'cruiser', 3));
    expect(upgradeError(p, upgrade('plasmaCannon', 'cruiser', 5))).toBeNull();
  });

  it('keeps a Drive on every ship and none on Starbases', () => {
    const { p } = fresh();
    expect(upgradeError(p, upgrade('hull', 'interceptor', 2))).toMatch(/Drive/);
    p.techs.nano.push('fusionDrive');
    expect(upgradeError(p, upgrade('fusionDrive', 'starbase', 1))).toMatch(/Drive/);
  });

  it('refuses occupied spaces, empty commands and returns of missing parts', () => {
    const { p } = fresh();
    p.techs.grid.push('gaussShield', 'improvedHull');
    applyUpgrade(p, upgrade('gaussShield', 'interceptor', 3));
    expect(upgradeError(p, upgrade('improvedHull', 'interceptor', 3))).toMatch(/occupied/);
    expect(upgradeError(p, upgrade('improvedHull', 'interceptor', 3, [{ bp: 'interceptor', slot: 3 }]))).toBeNull();
    expect(upgradeError(p, { type: 'upgrade', returns: [], place: null })).toMatch(/Nothing/);
    const twice = { type: 'upgrade', returns: [{ bp: 'interceptor', slot: 3 }, { bp: 'interceptor', slot: 3 }], place: null };
    expect(upgradeError(p, twice)).toMatch(/no Ship Part/);
    expect(upgradeError(p, { type: 'upgrade', returns: [{ bp: 'cruiser', slot: 0 }], place: null })).toMatch(/no Ship Part/);
    expect(upgradeError(p, { type: 'upgrade', returns: 'nonsense', place: null })).toMatch(/Nothing/);
  });

  it('applies a placement and consumes Ancient Parts from the stash', () => {
    const { p } = fresh();
    p.ancientParts.push('ancientShardHull');
    applyUpgrade(p, upgrade('ancientShardHull', 'cruiser', 5));
    expect(p.blueprints.cruiser.slots[5].tile).toBe('ancientShardHull');
    expect(p.ancientParts).toEqual([]);
  });

  it('lists only legal candidates', () => {
    const { p } = fresh();
    p.techs.grid.push('gaussShield');
    p.techs.military.push('plasmaCannon');
    const all = upgradeCandidates(p);
    expect(all.length).toBeGreaterThan(5);
    for (const cmd of all) expect(upgradeError(p, cmd)).toBeNull();
    expect(upgradeCandidates(p, { limit: 2 })).toHaveLength(2);
  });
});

describe('build', () => {
  it('offers only what the player can afford and is allowed to build', () => {
    const { s, p } = fresh();
    const what = (opts) => [...new Set(opts.map((o) => o.what))].sort();
    expect(what(buildOptions(s, p))).toEqual(['interceptor', 'starbase']);
    p.res.M = 2;
    expect(buildOptions(s, p)).toEqual([]);
    p.res.M = 20;
    p.techs.nano.push('orbital', 'monolith');
    expect(what(buildOptions(s, p))).toEqual(['cruiser', 'dreadnought', 'interceptor', 'monolith', 'orbital', 'starbase']);
  });

  it('pays Materials and places the structure', () => {
    const { s, p } = fresh();
    applyBuild(s, p, { type: 'build', what: 'interceptor', at: p.home });
    expect(p.res.M).toBe(1);
    expect(shipsAt(s, p.home).filter((x) => x.owner === 0)).toHaveLength(2);
    p.res.M = 20;
    p.techs.nano.push('orbital');
    applyBuild(s, p, { type: 'build', what: 'orbital', at: p.home });
    expect(s.map[p.home].orbital).toBe(true);
    expect(buildOptions(s, p).some((o) => o.what === 'orbital')).toBe(false);
  });

  it('respects the ship limits', () => {
    const { s, p } = fresh();
    p.res.M = 100;
    for (let i = 0; i < 7; i++) applyBuild(s, p, { type: 'build', what: 'interceptor', at: p.home });
    expect(buildOptions(s, p).some((o) => o.what === 'interceptor')).toBe(false);
  });
});

describe('move and explore', () => {
  it('lets ships travel along wormholes only', () => {
    const { s, p } = fresh();
    const ship = s.ships.find((x) => x.owner === 0);
    const reach = reachableKeys(s, ship);
    expect([...reach.keys()]).toContain('0,0');
    for (const [k, d] of reach) {
      expect(s.map[k]).toBeDefined();
      expect(d).toBeLessThanOrEqual(1);
    }
    const options = moveOptions(s, p);
    expect(options.every((o) => o.ship === ship.id && o.to !== ship.at)).toBe(true);
  });

  it('never moves Starbases', () => {
    const { s, p } = fresh();
    applyBuild(s, p, { type: 'build', what: 'starbase', at: p.home });
    const base = s.ships.find((x) => x.type === 'starbase');
    expect(moveOptions(s, p).some((o) => o.ship === base.id)).toBe(false);
  });

  it('explores the open zones next to a wormhole', () => {
    const { s, p, q } = fresh();
    expect(exploreZones(s, p).sort()).toEqual(['-1,2', '0,2']);
    expect(exploreZones(s, q).sort()).toEqual(['0,-2', '1,-2']);
  });

  it('only rotates a new sector so that the wormholes connect', () => {
    const { s, p } = fresh();
    for (const id of ['104', '306', '101']) {
      const rotations = placementRotations(s, p, '0,2', id);
      expect(rotations.length).toBeGreaterThan(0);
      for (const rot of rotations) expect(rotateEdges(SECTORS[id].wormholes, rot)).toContain(0);
    }
  });

  it('places sectors with their discovery tile and Ancients', () => {
    const { s, p } = fresh();
    const [rot] = placementRotations(s, p, '0,2', '104');
    const tile = placeSector(s, '0,2', '104', rot);
    expect(s.map['0,2']).toBe(tile);
    expect(tile.discovery).not.toBeNull();
    expect(s.ships.filter((x) => x.at === '0,2' && x.owner === NPC && x.type === 'ancient')).toHaveLength(2);
    expect(exploreZones(s, p)).not.toContain('0,2');
  });

  it('lists influence moves without breaking the invariants', () => {
    const { s, p } = fresh();
    const options = influenceOptions(s, p, new Set());
    for (const o of options) expect(o.type).toBe('influence');
    checkInvariants(s);
  });
});

describe('reputation', () => {
  it('keeps the best tile and returns the others to the bag', () => {
    const { s, p } = fresh();
    const bag = s.repBag.length;
    const kept = drawReputation(s, p, 3);
    expect(p.rep).toEqual([kept]);
    expect(s.repBag).toHaveLength(bag - 1);
  });

  it('replaces the lowest tile only when the new one is better', () => {
    const { s, p } = fresh();
    p.rep = [1, 1, 1, 1];
    s.repBag = [3];
    expect(drawReputation(s, p, 1)).toBe(3);
    expect(p.rep.sort()).toEqual([1, 1, 1, 3]);
    p.rep = [4, 4, 4, 4];
    s.repBag = [1];
    expect(drawReputation(s, p, 1)).toBeNull();
    expect(p.rep).toEqual([4, 4, 4, 4]);
    expect(s.repBag).toEqual([1]);
  });

  it('draws nothing from an empty bag', () => {
    const { s, p } = fresh();
    s.repBag = [];
    expect(drawReputation(s, p, 2)).toBeNull();
  });
});
