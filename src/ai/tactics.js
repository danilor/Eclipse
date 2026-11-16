import { NPC, ROUNDS } from '../data/constants.js';
import { distance } from '../core/hex.js';
import { enemyShipsAt, ownShipsAt } from '../core/queries.js';
import { exploreZones } from '../core/rules.js';
import { shipTotals } from '../core/stats.js';
import { attackValue, battleOdds, fleetValue, sectorPotential } from './ratings.js';

// Tactical estimates used by the heuristic AI.

// Enemy player ships within `range` hexes of a sector.
export function enemiesNear(s, pid, k, range = 2) {
  const t = s.map[k];
  return s.ships.filter((x) => x.owner !== pid && x.owner !== NPC && s.map[x.at] && distance(t, s.map[x.at]) <= range);
}

// Change in exploration options when the given ships all end up in sector `to`.
function explorePotentialChange(s, p, movers, to) {
  const from = movers.map((x) => x.at);
  const before = exploreZones(s, p).length;
  movers.forEach((x) => (x.at = to));
  const after = exploreZones(s, p).length;
  movers.forEach((x, i) => (x.at = from[i]));
  const phase = Math.max(0, Math.min(1, (ROUNDS - s.round - 1) / 5));
  return Math.max(-2, Math.min(4, 1.4 * (after - before))) * phase;
}

// Value of having exactly `ships` (the player's own) in sector k. Moves are scored as the difference of this
// potential before and after, so a sequence of moves that ends where it started always sums to zero and the
// AI can never shuffle ships back and forth.
function groupValue(s, p, k, ships) {
  const t = s.map[k];
  const pot = sectorPotential(s, k);
  if (!ships.length) return t.controller === p.id && enemiesNear(s, p.id, k, 2).length ? -pot * 0.5 : 0;
  const enemies = enemyShipsAt(s, p.id, k);
  if (enemies.length) {
    const win = battleOdds(s, ships, enemies);
    let gain = 2 + 0.6 * fleetValue(s, enemies);
    if (t.controller == null) gain += pot * 0.6;
    else if (t.controller !== p.id) gain += pot * 0.8;
    if (t.discovery) gain += 5;
    return win * gain - (1 - win) * fleetValue(s, ships) * 1.2;
  }
  if (t.controller == null) return pot * 0.35;
  if (t.controller === p.id) return 0;
  const armed = ships.some((x) => attackValue(shipTotals(s, x), 0) > 0);
  return pot * (t.cubes.length ? 0.25 : 0.9) + (armed ? t.cubes.length * 2.5 : 0);
}

// Value of sending the ships `movers` (each able to reach `to`) to that sector together.
function planValue(s, p, to, there, base, movers) {
  let v = groupValue(s, p, to, [...there, ...movers]) - base;
  const sources = new Map();
  for (const m of movers) sources.set(m.at, [...(sources.get(m.at) ?? []), m]);
  for (const [at, list] of sources) {
    const here = ownShipsAt(s, p.id, at);
    const stay = here.filter((x) => !list.includes(x));
    v += groupValue(s, p, at, stay) - groupValue(s, p, at, here);
  }
  return v + explorePotentialChange(s, p, movers, to);
}

// Picks the most promising first move of a plan that may use up to `remaining` activations. Several weak
// ships can be worth sending together even if none of them is worth sending alone, so every destination is
// scored by the best group of up to `remaining` ships; the command returned is the first mover of that group.
export function bestMove(s, p, options, remaining = 1) {
  const byTo = new Map();
  for (const o of options) {
    if (o.type !== 'move') continue;
    if (!byTo.has(o.to)) byTo.set(o.to, []);
    byTo.get(o.to).push(o);
  }
  let best = null;
  for (const [to, list] of byTo) {
    const there = ownShipsAt(s, p.id, to);
    const base = groupValue(s, p, to, there);
    const pool = list.map((o) => ({ o, ship: s.ships.find((x) => x.id === o.ship) }));
    const chosen = [];
    for (let step = 0; step < Math.min(remaining, pool.length); step++) {
      let pick = null;
      for (const c of pool) {
        if (chosen.includes(c)) continue;
        const v = planValue(s, p, to, there, base, [...chosen, c].map((x) => x.ship));
        if (!pick || v > pick.v) pick = { c, v };
      }
      chosen.push(pick.c);
      if (!best || pick.v > best.value) best = { cmd: chosen[0].o, value: pick.v };
    }
  }
  return best;
}
