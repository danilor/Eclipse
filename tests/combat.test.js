import { describe, expect, it } from 'vitest';
import { battleSectors, combatPhase, hasBattle, isHit, isHostile, planHits, resolveSector, retreatDestinations, rollDice } from '../src/core/combat.js';
import { Game } from '../src/core/game.js';
import { addShip, createState, makeTile } from '../src/core/setup.js';
import { createRng } from '../src/core/rng.js';
import { NPC } from '../src/data/constants.js';
import { checkInvariants, drive, fakeGame } from './helpers.js';

const duel = [
  { species: 'terran-union', name: 'A' },
  { species: 'terran-alliance', name: 'B' },
];

const arena = (seed = 3) => {
  const s = createState({ seed, players: duel });
  s.startPlayer = 0;
  // a far away tile with no wormhole links, so nobody can retreat
  s.map['3,0'] = makeTile('101', 3, 0, 0);
  return { s, g: fakeGame(s) };
};

// Covers the Ion Cannon of the interceptor so that the ship has no weapons.
const disarm = (p) => {
  p.blueprints.interceptor.slots[0].tile = 'hull';
};

describe('dice', () => {
  it('hits on a 6, misses on a 1 and otherwise compares computers with shields', () => {
    expect(isHit(6, 0, 9)).toBe(true);
    expect(isHit(1, 9, 0)).toBe(false);
    expect(isHit(2, 3, 0)).toBe(false);
    expect(isHit(3, 3, 0)).toBe(true);
    expect(isHit(4, 2, 1)).toBe(false);
    expect(isHit(5, 1, 0)).toBe(true);
    expect(isHit(5, 0, 0)).toBe(false);
  });

  it('rolls one die per cannon and per ship', () => {
    const s = { rng: createRng(4) };
    const rolls = rollDice(s, { yellow: 2, red: 1 }, 3);
    expect(rolls).toHaveLength(9);
    expect(rolls.filter((r) => r.color === 'red')).toHaveLength(3);
    for (const r of rolls) expect(r.roll >= 1 && r.roll <= 6).toBe(true);
  });
});

describe('hit assignment', () => {
  const target = (id, type, hull, shield = 0, damage = 0) => ({ ship: { id, type, damage }, tot: { hull, shield } });
  const plan = (items, ...targets) => planHits(items, 0, targets.map((t) => t.ship), (ship) => targets.find((t) => t.ship === ship).tot);
  const item = (id, roll, dmg) => ({ id, die: Number(id.replace(/\D/g, '')), roll, dmg });

  it('destroys the largest ship first with the fewest dice', () => {
    const map = plan(
      [item('r0', 6, 4), item('y1', 6, 1), item('y2', 6, 1)],
      target(10, 'dreadnought', 3),
      target(11, 'interceptor', 0)
    );
    expect(map.get('r0')).toBe(10);
    expect([map.get('y1'), map.get('y2')].filter((t) => t === 11)).toHaveLength(1);
    expect(map.size).toBe(2);
  });

  it('ignores misses and shielded hits', () => {
    expect(plan([item('y0', 1, 1)], target(10, 'cruiser', 1)).size).toBe(0);
    expect(plan([item('y0', 4, 1)], target(10, 'cruiser', 1, 3)).size).toBe(0);
    expect(plan([item('y0', 6, 1)], target(10, 'cruiser', 1, 3)).get('y0')).toBe(10);
  });

  it('spreads damage when nothing can be destroyed', () => {
    const map = plan([item('y0', 6, 1), item('y1', 6, 1)], target(10, 'dreadnought', 3), target(11, 'cruiser', 2));
    expect(map.get('y0')).toBe(10);
    expect(map.get('y1')).toBe(10);
  });
});

describe('hostility', () => {
  it('is mutual between players and between players and defenders', () => {
    const { s } = arena();
    const mine = s.ships.find((x) => x.owner === 0);
    const theirs = s.ships.find((x) => x.owner === 1);
    const guardian = s.ships.find((x) => x.type === 'guardian');
    const gcds = s.ships.find((x) => x.type === 'gcds');
    expect(isHostile(s, mine, theirs)).toBe(true);
    expect(isHostile(s, mine, guardian)).toBe(true);
    expect(isHostile(s, mine, { ...mine, id: 99 })).toBe(false);
    expect(isHostile(s, guardian, gcds)).toBe(false);
  });

  it('treats Ancients as friends for the Descendants of Draco only', () => {
    const s = createState({ seed: 3, players: [{ species: 'draco' }, { species: 'terran-union' }] });
    s.map['3,0'] = makeTile('101', 3, 0, 0);
    const ancient = addShip(s, NPC, 'ancient', '3,0');
    expect(isHostile(s, addShip(s, 0, 'interceptor', '3,0'), ancient)).toBe(false);
    expect(isHostile(s, addShip(s, 1, 'interceptor', '3,0'), ancient)).toBe(true);
  });

  it('finds the sectors where battles take place', () => {
    const { s } = arena();
    expect(battleSectors(s)).toEqual([]);
    addShip(s, 0, 'interceptor', '3,0');
    expect(hasBattle(s, '3,0')).toBe(false);
    addShip(s, 1, 'interceptor', '3,0');
    expect(battleSectors(s)).toEqual(['3,0']);
  });

  it('finds retreat destinations only in linked, controlled sectors without enemies', () => {
    const { s } = arena();
    expect(retreatDestinations(s, 0, '0,0')).toEqual(['0,1']);
    expect(retreatDestinations(s, 1, '0,0')).toEqual(['0,-1']);
    addShip(s, 1, 'interceptor', '0,1');
    expect(retreatDestinations(s, 0, '0,0')).toEqual([]);
    expect(retreatDestinations(s, 0, '3,0')).toEqual([]);
  });
});

describe('battles', () => {
  it('ends with one side destroyed and both sides drawing Reputation', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const { s, g } = arena(seed);
      s.ships = s.ships.filter((x) => x.owner === NPC);
      for (let i = 0; i < 2; i++) addShip(s, 0, 'dreadnought', '3,0');
      addShip(s, 1, 'interceptor', '3,0');
      const asked = drive(resolveSector(g, '3,0'), (d) => d.options[0]);
      expect(asked, `seed ${seed}`).toEqual([]);
      const owners = new Set(s.ships.filter((x) => x.at === '3,0').map((x) => x.owner));
      expect(owners.size, `seed ${seed}`).toBe(1);
      expect(s.players[0].rep.length + s.players[1].rep.length).toBe(2);
      for (const ship of s.ships.filter((x) => x.at === '3,0')) expect(ship.damage).toBeLessThanOrEqual(2);
      expect(hasBattle(s, '3,0')).toBe(false);
    }
  });

  it('lets the earlier arrival defend and destroys the attacker when nobody can hurt anybody', () => {
    const { s, g } = arena();
    s.ships = s.ships.filter((x) => x.owner === NPC);
    disarm(s.players[0]);
    disarm(s.players[1]);
    addShip(s, 0, 'interceptor', '3,0');
    addShip(s, 1, 'interceptor', '3,0');
    drive(resolveSector(g, '3,0'), (d) => d.options[0]);
    expect(s.ships.filter((x) => x.owner !== NPC).map((x) => x.owner)).toEqual([0]);
    expect(s.log.some((l) => /Stalemate/.test(l.t))).toBe(true);
  });

  it('asks for a retreat and completes it on the next activation', () => {
    const { s, g } = arena();
    s.ships = s.ships.filter((x) => x.owner === NPC);
    s.map['0,2'] = makeTile('104', 0, 2, 0);
    disarm(s.players[1]);
    const mine = addShip(s, 0, 'interceptor', '0,2');
    const theirs = addShip(s, 1, 'interceptor', '0,2');
    const asked = drive(resolveSector(g, '0,2'), (d) => d.options.find((o) => o.type === 'retreat') ?? d.options[0]);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ playerId: 0, kind: 'engage' });
    expect(asked[0].options).toContainEqual({ type: 'retreat', to: '0,1' });
    expect(s.ships.find((x) => x.id === mine.id).at).toBe('0,1');
    expect(s.ships.find((x) => x.id === theirs.id).at).toBe('0,2');
  });

  it('fights the defenders of a sector after the players are done', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const { s, g } = arena(seed);
      s.ships = s.ships.filter((x) => x.owner === NPC);
      for (let i = 0; i < 2; i++) addShip(s, 0, 'dreadnought', '1,0');
      for (let i = 0; i < 2; i++) addShip(s, 0, 'cruiser', '1,0');
      drive(resolveSector(g, '1,0'), (d) => d.options[0]);
      expect(hasBattle(s, '1,0'), `seed ${seed}`).toBe(false);
      checkInvariants(s);
    }
  });
});

describe('battle events', () => {
  // A real Game, so that the events are built by the engine itself, around the hand-made arena.
  const eventArena = (seed = 3) => {
    const { s } = arena(seed);
    s.ships = s.ships.filter((x) => x.owner === NPC);
    const g = new Game({ seed, players: duel, options: { events: true } });
    g.drainEvents();
    g.state = s;
    return { s, g };
  };
  const first = (d) => d.optionsFn()[0];
  const kinds = (events) => events.map((e) => e.type);

  it('keeps the event type and names the ship type separately', () => {
    const { s, g } = eventArena(5);
    for (let i = 0; i < 2; i++) addShip(s, 0, 'dreadnought', '3,0');
    addShip(s, 1, 'interceptor', '3,0');
    drive(resolveSector(g, '3,0'), first);
    const events = g.drainEvents();
    expect(kinds(events)[0]).toBe('battleStart');
    expect(kinds(events).indexOf('battleEnd')).toBeGreaterThan(kinds(events).lastIndexOf('volley'));
    const volleys = events.filter((e) => e.type === 'volley');
    expect(volleys.length).toBeGreaterThan(0);
    for (const v of volleys) {
      expect(['dreadnought', 'interceptor']).toContain(v.shipType);
      expect(v.dice.length).toBeGreaterThan(0);
      expect(v.dice[0]).toMatchObject({ color: expect.any(String), roll: expect.any(Number) });
    }
    const lost = events.filter((e) => e.type === 'shipDestroyed');
    expect(lost.length).toBeGreaterThan(0);
    for (const e of lost) expect(['dreadnought', 'interceptor']).toContain(e.shipType);
    const destroyedInVolleys = volleys.flatMap((v) => v.hits).filter((h) => h.destroyed).length;
    expect(lost).toHaveLength(destroyedInVolleys);
  });

  it('reports a retreat when it is announced and when it is completed', () => {
    const { s, g } = eventArena();
    s.map['0,2'] = makeTile('104', 0, 2, 0);
    disarm(s.players[1]);
    addShip(s, 0, 'interceptor', '0,2');
    addShip(s, 1, 'interceptor', '0,2');
    drive(resolveSector(g, '0,2'), (d) => d.optionsFn().find((o) => o.type === 'retreat') ?? first(d));
    const events = g.drainEvents();
    expect(kinds(events).filter((t) => t === 'retreating' || t === 'retreated')).toEqual(['retreating', 'retreated']);
    expect(events.find((e) => e.type === 'retreating')).toMatchObject({ owner: 0, shipType: 'interceptor', to: '0,1' });
    expect(events.find((e) => e.type === 'retreated')).toMatchObject({ owner: 0, shipType: 'interceptor' });
  });

  it('cannot be overridden by the payload of an event', () => {
    const g = new Game({ seed: 1, players: duel, options: { events: true } });
    g.drainEvents();
    g.emit('volley', { type: 'cruiser', owner: 0 });
    expect(g.drainEvents()).toEqual([{ type: 'volley', owner: 0 }]);
  });
});

describe('end of the combat phase', () => {
  const siege = () => {
    const { s, g } = arena();
    s.ships = s.ships.filter((x) => x.owner === NPC);
    s.players[0].techs.military.push('neutronBombs');
    addShip(s, 0, 'interceptor', '0,-1');
    return { s, g };
  };
  const take = (d) => d.options.find((o) => o.type === 'influence') ?? d.options[0];

  it('destroys the population, takes over the sector and eliminates a defenceless player', () => {
    const { s, g } = siege();
    const cubes = s.map['0,-1'].cubes.length;
    const asked = drive(combatPhase(g), take);
    expect(asked.map((d) => d.kind)).toEqual(['takeControl']);
    expect(s.map['0,-1'].controller).toBe(0);
    expect(s.map['0,-1'].cubes).toEqual([]);
    expect(s.players[1].grave.M + s.players[1].grave.S + s.players[1].grave.$).toBe(cubes);
    expect(s.players[1].eliminated).toBe(true);
    expect(s.over).toBe(true);
    expect(s.winner).toBe(0);
    expect(s.finalScores).toHaveLength(2);
  });

  it('keeps the game going while the loser still has a ship', () => {
    const { s, g } = siege();
    addShip(s, 1, 'interceptor', '3,0');
    const asked = drive(combatPhase(g), (d) => (d.playerId === 0 ? take(d) : { type: 'done' }));
    expect(asked.map((d) => d.playerId)).toEqual([0, 1]);
    expect(s.over).toBe(false);
    expect(s.players[1].eliminated).toBe(false);
    expect(s.players[1].track).toBe(s.players[1].totalDiscs);
    checkInvariants(s);
  });

  it('resets damage after the battles', () => {
    const { s, g } = arena();
    s.ships.find((x) => x.owner === 0).damage = 2;
    drive(combatPhase(g), (d) => d.options[0]);
    expect(s.ships.every((x) => x.damage === 0)).toBe(true);
  });
});
