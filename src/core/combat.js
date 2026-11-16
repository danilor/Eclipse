import { DIE_DAMAGE, NPC, SHIP_SIZE } from '../data/constants.js';
import { SECTORS } from '../data/sectors.js';
import { SPECIES } from '../data/species.js';
import { shipTotals, hasTech, diceCount } from './stats.js';
import {
  enemyShipsAt,
  ownShipsAt,
  friendlyAncients,
  isLinked,
  neighborKeys,
  sectorNumber,
  controlledKeys,
  shipsOf,
} from './queries.js';
import { rngD6 } from './rng.js';
import { removeInfluence, placeInfluence, drawReputation } from './rules.js';
import { resolveDiscovery } from './discovery.js';
import { eliminatePlayer } from './endgame.js';

const REP_TILES = { interceptor: 1, starbase: 1, ancient: 1, cruiser: 2, guardian: 2, dreadnought: 3, gcds: 3 };
const TYPE_RANK = { starbase: 0, interceptor: 1, cruiser: 2, dreadnought: 3, ancient: 4, guardian: 5, gcds: 6 };
const MAX_ENGAGEMENT_ROUNDS = 60;

// ---------------------------------------------------------------- dice & damage

export function isHit(roll, computers, shield) {
  if (roll >= 6) return true;
  if (roll <= 1) return false;
  return roll + computers - shield >= 6;
}

export function rollDice(s, dice, times = 1) {
  const out = [];
  for (const [color, n] of Object.entries(dice)) {
    for (let i = 0; i < n * times; i++) out.push({ color, roll: rngD6(s.rng) });
  }
  return out;
}

// Smallest set of items (fewest dice, then least wasted damage) that deals at least `need` damage.
function cheapestKill(cand, need) {
  const n = cand.length;
  if (n <= 12) {
    let best = null;
    for (let m = 1; m < 1 << n; m++) {
      let total = 0;
      let cnt = 0;
      for (let b = 0; b < n; b++) {
        if (m & (1 << b)) {
          total += cand[b].dmg;
          cnt++;
        }
      }
      if (total < need) continue;
      const over = total - need;
      if (!best || cnt < best.cnt || (cnt === best.cnt && over < best.over)) best = { m, cnt, over };
    }
    return cand.filter((_, b) => best.m & (1 << b));
  }
  const sorted = [...cand].sort((a, b) => b.dmg - a.dmg);
  const pick = [];
  let total = 0;
  for (const it of sorted) {
    if (total >= need) break;
    pick.push(it);
    total += it.dmg;
  }
  return pick;
}

// Default hit assignment: destroy ships from largest to smallest where possible, then spread the
// remaining damage from largest to smallest. Returns Map(item id -> target ship id).
export function planHits(items, computers, targets, tot) {
  const info = targets.map((t) => ({
    t,
    hull: tot(t).hull,
    shield: tot(t).shield,
    dmg: t.damage,
    size: SHIP_SIZE[t.type] ?? 1,
    dead: false,
  }));
  info.sort((a, b) => b.size - a.size || b.hull - a.hull || a.t.id - b.t.id);
  const out = new Map();
  const free = new Set(items.map((i) => i.id));
  const hits = (it, tg) => isHit(it.roll, computers, tg.shield);

  for (const tg of info) {
    const need = tg.hull - tg.dmg + 1;
    const cand = items.filter((i) => free.has(i.id) && hits(i, tg));
    if (!cand.length || cand.reduce((a, i) => a + i.dmg, 0) < need) continue;
    for (const it of cheapestKill(cand, need)) {
      out.set(it.id, tg.t.id);
      free.delete(it.id);
    }
    tg.dead = true;
  }

  const rest = items.filter((i) => free.has(i.id)).sort((a, b) => b.dmg - a.dmg);
  for (const it of rest) {
    const tg = info.find((x) => !x.dead && hits(it, x));
    if (!tg) continue;
    out.set(it.id, tg.t.id);
    tg.dmg += it.dmg;
    if (tg.dmg > tg.hull) tg.dead = true;
  }
  return out;
}

function toItems(dice, splitter) {
  const items = [];
  dice.forEach((d, i) => {
    if (splitter && d.color === 'red') {
      for (let u = 0; u < DIE_DAMAGE.red; u++) items.push({ id: `${i}.${u}`, die: i, roll: d.roll, dmg: 1 });
    } else {
      items.push({ id: String(i), die: i, roll: d.roll, dmg: DIE_DAMAGE[d.color] });
    }
  });
  return items;
}

// ---------------------------------------------------------------- hostility

export function isHostile(s, a, b) {
  if (a.owner === b.owner) return false;
  if (a.owner === NPC && b.owner === NPC) return false;
  if (a.owner === NPC && a.type === 'ancient' && friendlyAncients(s, b.owner)) return false;
  if (b.owner === NPC && b.type === 'ancient' && friendlyAncients(s, a.owner)) return false;
  return true;
}

export function hasBattle(s, k) {
  const here = s.ships.filter((x) => x.at === k);
  return here.some((a) => here.some((b) => isHostile(s, a, b)));
}

export function battleSectors(s) {
  return Object.keys(s.map)
    .filter((k) => hasBattle(s, k))
    .sort((a, b) => sectorNumber(s, b) - sectorNumber(s, a));
}

export function retreatDestinations(s, pid, k) {
  return neighborKeys(k).filter(
    (n) => s.map[n] && s.map[n].controller === pid && isLinked(s, pid, k, n) && !enemyShipsAt(s, pid, n).length
  );
}

// ---------------------------------------------------------------- battle

function makeCtx(s, k) {
  const cache = new Map();
  return {
    k,
    entryOrder: [],
    engaged: {},
    retreated: new Set(),
    kills: [],
    tot(ship) {
      let t = cache.get(ship.id);
      if (!t) {
        t = shipTotals(s, ship);
        cache.set(ship.id, t);
      }
      return t;
    },
  };
}

function destroyShip(g, ctx, ship, killer) {
  const s = g.state;
  s.ships = s.ships.filter((x) => x.id !== ship.id);
  ctx.kills.push({ killer, type: ship.type, owner: ship.owner });
  g.emit('shipDestroyed', { id: ship.id, owner: ship.owner, shipType: ship.type, at: ship.at });
}

function volley(g, ctx, side, sample, dice, foes) {
  const s = g.state;
  const tot = ctx.tot(sample);
  const splitter = side.owner !== NPC && hasTech(s.players[side.owner], 'antimatterSplitter');
  const items = toItems(dice, splitter);
  const plan = planHits(items, tot.computer, foes, ctx.tot);
  const result = [];
  for (const it of items) {
    const tid = plan.get(it.id);
    if (tid == null) continue;
    const ship = s.ships.find((x) => x.id === tid);
    if (!ship) continue;
    const t = ctx.tot(ship);
    if (!isHit(it.roll, tot.computer, t.shield)) continue;
    ship.damage += it.dmg;
    const destroyed = ship.damage > t.hull;
    result.push({ die: it.die, target: ship.id, dmg: it.dmg, destroyed });
    if (destroyed) destroyShip(g, ctx, ship, side.owner);
  }
  g.emit('volley', { at: ctx.k, owner: side.owner, shipType: sample.type, dice, hits: result });
  return result;
}

function ownerName(s, owner) {
  return owner === NPC ? 'The defenders' : s.players[owner].name;
}

function* battle(g, ctx, attackerOwner, defenderOwner) {
  const s = g.state;
  const k = ctx.k;
  const A = { owner: attackerOwner, foe: defenderOwner, role: 'attacker' };
  const D = { owner: defenderOwner, foe: attackerOwner, role: 'defender' };
  const ships = (side) =>
    s.ships.filter(
      (x) => x.at === k && x.owner === side.owner && !(side.owner === NPC && friendlyAncients(s, side.foe) && x.type === 'ancient')
    );
  const foeOf = (side) => (side === A ? D : A);

  for (const side of [A, D]) {
    if (side.owner === NPC) continue;
    const set = (ctx.engaged[side.owner] ||= new Set());
    for (const x of ships(side)) set.add(x.id);
  }
  g.log(`Battle in sector ${s.map[k].id}: ${ownerName(s, attackerOwner)} attacks ${ownerName(s, defenderOwner)}.`);
  g.emit('battleStart', { at: k, attacker: attackerOwner, defender: defenderOwner });

  const activations = () => {
    const list = [];
    for (const side of [D, A]) {
      const present = ships(side);
      for (const type of new Set(present.map((x) => x.type))) {
        const sample = present.find((x) => x.type === type);
        list.push({ side, type, init: ctx.tot(sample).init });
      }
    }
    list.sort(
      (x, y) =>
        y.init - x.init ||
        (x.side.role === 'defender' ? 0 : 1) - (y.side.role === 'defender' ? 0 : 1) ||
        TYPE_RANK[x.type] - TYPE_RANK[y.type]
    );
    return list;
  };
  const typeShips = (act) => ships(act.side).filter((x) => x.type === act.type);
  const over = () => !ships(A).length || !ships(D).length;

  // Missiles are fired once, by ship type, in initiative order.
  for (const act of activations()) {
    const mine = typeShips(act);
    if (!mine.length || over()) continue;
    const tot = ctx.tot(mine[0]);
    if (!diceCount(tot.missiles)) continue;
    volley(g, ctx, act.side, mine[0], rollDice(s, tot.missiles, mine.length), ships(foeOf(act.side)));
  }

  for (let round = 1; !over(); round++) {
    const armed = (side) => ships(side).some((x) => diceCount(ctx.tot(x).dice) > 0);
    if (round > MAX_ENGAGEMENT_ROUNDS || (!armed(A) && !armed(D))) {
      forceRetreat(g, ctx, A, ships(A));
      break;
    }
    g.emit('engagementRound', { at: k, round });
    for (const act of activations()) {
      if (over()) break;
      const mine = typeShips(act);
      if (!mine.length) continue;
      const side = act.side;
      if (mine.some((x) => x.retreat)) {
        for (const x of mine) {
          if (!x.retreat) continue;
          x.at = x.retreat;
          delete x.retreat;
          x.seq = ++s.moveSeq;
        }
        g.log(`${ownerName(s, side.owner)}'s ${act.type}s complete their retreat.`);
        g.emit('retreated', { owner: side.owner, shipType: act.type });
        continue;
      }
      const tot = ctx.tot(mine[0]);
      const dests = side.owner === NPC || tot.drive < 1 ? [] : retreatDestinations(s, side.owner, k);
      let choice = { type: 'attack' };
      if (dests.length) {
        const options = [{ type: 'attack' }, ...dests.map((to) => ({ type: 'retreat', to }))];
        choice = yield g.ask(
          side.owner,
          'engage',
          { at: k, shipType: act.type, ships: mine.map((x) => x.id), round, role: side.role },
          options
        );
      }
      if (choice.type === 'retreat') {
        for (const x of mine) {
          x.retreat = choice.to;
          ctx.retreated.add(x.id);
        }
        g.log(`${ownerName(s, side.owner)}'s ${act.type}s begin to retreat.`);
        g.emit('retreating', { owner: side.owner, shipType: act.type, to: choice.to });
        continue;
      }
      if (!diceCount(tot.dice)) continue;
      volley(g, ctx, side, mine[0], rollDice(s, tot.dice, mine.length), ships(foeOf(side)));
    }
  }

  const left = [A, D].filter((side) => ships(side).length);
  for (const x of s.ships) if (x.at === k) delete x.retreat;
  g.emit('battleEnd', { at: k, survivor: left.length === 1 ? left[0].owner : null });
  return left.length === 1 ? left[0].owner : left.length === 2 ? D.owner : null;
}

// Neither side can hurt the other: the attacker must retreat or is destroyed.
function forceRetreat(g, ctx, A, attackers) {
  const s = g.state;
  for (const ship of attackers) {
    const dests = ctx.tot(ship).drive > 0 && A.owner !== NPC ? retreatDestinations(s, A.owner, ctx.k) : [];
    ctx.retreated.add(ship.id);
    if (dests.length) {
      ship.at = dests[0];
      ship.seq = ++s.moveSeq;
      g.emit('retreated', { owner: A.owner, shipType: ship.type });
    } else {
      s.ships = s.ships.filter((x) => x.id !== ship.id);
      g.emit('shipDestroyed', { id: ship.id, owner: ship.owner, shipType: ship.type, at: ctx.k });
    }
  }
  g.log('Stalemate: the attacker must retreat.');
}

function reputationDraws(g, ctx) {
  const s = g.state;
  for (const pid of ctx.entryOrder) {
    const p = s.players[pid];
    let count = 0;
    const brought = ctx.engaged[pid] || new Set();
    const allRetreated = brought.size > 0 && [...brought].every((id) => ctx.retreated.has(id));
    if (!allRetreated) count += 1;
    for (const kill of ctx.kills) if (kill.killer === pid) count += REP_TILES[kill.type] || 1;
    if (count <= 0) continue;
    const got = drawReputation(s, p, count);
    g.log(`${p.name} draws ${Math.min(count, 5)} Reputation Tile(s)${got ? ` and keeps a ${got}` : ' but keeps none'}.`);
    g.emit('reputation', { pid, kept: got });
  }
}

function hostileNpc(s, pid, k) {
  return s.ships.filter((x) => x.at === k && x.owner === NPC && !(friendlyAncients(s, pid) && x.type === 'ancient'));
}

export function* resolveSector(g, k) {
  const s = g.state;
  const ctx = makeCtx(s, k);
  const players = [...new Set(s.ships.filter((x) => x.at === k && x.owner !== NPC).map((x) => x.owner))];
  const entry = (pid) => Math.min(...ownShipsAt(s, pid, k).map((x) => x.seq));
  const controller = s.map[k].controller;
  const order = [...players].sort((a, b) => entry(b) - entry(a));
  if (controller != null && order.includes(controller)) {
    order.splice(order.indexOf(controller), 1);
    order.push(controller);
  }
  ctx.entryOrder = [...players].sort((a, b) => entry(a) - entry(b));

  let cur = null;
  for (const pid of order) {
    if (!ownShipsAt(s, pid, k).length) continue;
    if (cur == null) {
      cur = pid;
      continue;
    }
    const defender = controller === cur ? cur : controller === pid ? pid : entry(cur) <= entry(pid) ? cur : pid;
    const attacker = defender === cur ? pid : cur;
    cur = yield* battle(g, ctx, attacker, defender);
  }
  if (cur != null && hostileNpc(s, cur, k).length) {
    yield* battle(g, ctx, cur, NPC);
  }
  ctx.entryOrder = ctx.entryOrder.filter((pid) => ctx.engaged[pid]);
  reputationDraws(g, ctx);
}

// ---------------------------------------------------------------- end of the combat phase

function pickCubes(s, tile, count) {
  const squares = SECTORS[tile.id].squares;
  const rank = (c) => (squares[c.sq]?.adv ? 0 : c.sq === 'orb' ? 2 : 1);
  return [...tile.cubes].sort((a, b) => rank(a) - rank(b)).slice(0, count);
}

function killCubes(g, tile, cubes) {
  const s = g.state;
  for (const c of cubes) {
    const owner = s.players[c.owner];
    owner.grave[c.track] += 1;
    tile.cubes = tile.cubes.filter((x) => x !== c);
    g.emit('cubeDestroyed', { at: tile.key, owner: c.owner, track: c.track });
  }
  if (cubes.length) g.log(`${cubes.length} Population Cube(s) destroyed in sector ${tile.id}.`);
}

function attackPopulation(g) {
  const s = g.state;
  for (const k of Object.keys(s.map).sort((a, b) => sectorNumber(s, b) - sectorNumber(s, a))) {
    const tile = s.map[k];
    if (!tile.cubes.length) continue;
    const victim = s.players[tile.controller];
    if (!victim) continue;
    const attackers = [...new Set(enemyShipsAt(s, victim.id, k).filter((x) => x.owner !== NPC).map((x) => x.owner))];
    for (const aid of attackers) {
      if (!tile.cubes.length) break;
      const mine = ownShipsAt(s, aid, k);
      const attacker = s.players[aid];
      if (SPECIES[victim.species].traits.populationVulnerable) {
        killCubes(g, tile, [...tile.cubes]);
        continue;
      }
      const armed = mine.filter((x) => diceCount(shipTotals(s, x).dice) > 0);
      if (!armed.length) continue;
      if (hasTech(attacker, 'neutronBombs') && !hasTech(victim, 'neutronAbsorber')) {
        killCubes(g, tile, [...tile.cubes]);
        continue;
      }
      let damage = 0;
      for (const ship of armed) {
        const tot = shipTotals(s, ship);
        for (const d of rollDice(s, tot.dice)) if (isHit(d.roll, tot.computer, 0)) damage += DIE_DAMAGE[d.color];
      }
      if (damage > 0) killCubes(g, tile, pickCubes(s, tile, damage));
    }
  }
}

function* influenceSectors(g) {
  const s = g.state;
  for (const [k, tile] of Object.entries(s.map)) {
    if (tile.controller == null || tile.cubes.length) continue;
    const invaders = enemyShipsAt(s, tile.controller, k).filter((x) => x.owner !== NPC);
    if (!invaders.length) continue;
    g.log(`${s.players[tile.controller].name} loses control of sector ${tile.id}.`);
    removeInfluence(s, k);
    g.emit('controlChanged', { at: k });
  }
  const order = [];
  for (let i = 0; i < s.players.length; i++) order.push((s.startPlayer + i) % s.players.length);
  for (const pid of order) {
    const p = s.players[pid];
    if (p.eliminated) continue;
    for (;;) {
      if (p.track <= 0) break;
      const targets = Object.keys(s.map).filter(
        (k) => s.map[k].controller == null && ownShipsAt(s, pid, k).length && !enemyShipsAt(s, pid, k).length
      );
      if (!targets.length) break;
      const options = [...targets.map((to) => ({ type: 'influence', from: 'track', to })), { type: 'done' }];
      const cmd = yield g.ask(pid, 'takeControl', { reason: 'combat' }, options);
      if (cmd.type === 'done') break;
      placeInfluence(s, pid, cmd.to);
      g.log(`${p.name} takes control of sector ${s.map[cmd.to].id}.`);
      g.emit('controlChanged', { at: cmd.to });
    }
  }
}

function* claimDiscoveries(g) {
  const s = g.state;
  for (const k of Object.keys(s.map).sort((a, b) => sectorNumber(s, b) - sectorNumber(s, a))) {
    const tile = s.map[k];
    if (!tile.discovery) continue;
    const owners = [...new Set(s.ships.filter((x) => x.at === k && x.owner !== NPC).map((x) => x.owner))];
    for (const pid of owners) {
      if (enemyShipsAt(s, pid, k).length) continue;
      if (friendlyAncients(s, pid) && s.ships.some((x) => x.at === k && x.type === 'ancient')) continue;
      const found = tile.discovery;
      tile.discovery = null;
      yield* resolveDiscovery(g, pid, found, k);
      break;
    }
  }
}

export function* combatPhase(g) {
  const s = g.state;
  s.phase = 'combat';
  g.log(`--- Round ${s.round}: Combat Phase ---`);
  for (const k of battleSectors(s)) {
    if (!hasBattle(s, k)) continue;
    yield* resolveSector(g, k);
  }
  attackPopulation(g);
  yield* influenceSectors(g);
  yield* claimDiscoveries(g);
  for (const ship of s.ships) ship.damage = 0;
  for (const p of s.players) {
    if (p.eliminated) continue;
    if (!shipsOf(s, p.id).length && !controlledKeys(s, p.id).length) {
      eliminatePlayer(g, p.id);
      if (s.over) return;
    }
  }
}
