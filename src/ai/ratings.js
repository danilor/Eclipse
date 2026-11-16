import { DIE_DAMAGE } from '../data/constants.js';
import { SECTORS } from '../data/sectors.js';
import { shipTotals } from '../core/stats.js';

// Pure rating helpers shared by the evaluation function and the tactical heuristics.
// Everything is expressed in "units": one victory point is worth about three units.

export const W = {
  vp: 3,
  resource: { M: 0.7, S: 0.7, $: 1 },
  production: { M: 0.7, S: 0.7, $: 1 },
  shipK: 5.5,
  sectorBase: 1.2,
  emptySquare: 0.8,
};

// Probability that one die hits (a natural 6 always hits and a natural 1 always misses).
export function hitChance(computers, shield) {
  const need = 6 - (computers - shield);
  let faces = 1;
  for (let r = 2; r <= 5; r++) if (r >= need) faces++;
  return faces / 6;
}

export function attackValue(tot, shield = 0.5) {
  const h = hitChance(tot.computer, shield);
  let a = 0;
  for (const [c, n] of Object.entries(tot.dice)) a += n * DIE_DAMAGE[c] * h;
  for (const [c, n] of Object.entries(tot.missiles)) a += n * DIE_DAMAGE[c] * h * 1.3;
  return a;
}

export const durability = (tot) => (tot.hull + 1) * (1 + 0.25 * tot.shield);

export function shipEval(tot) {
  const a = attackValue(tot);
  return W.shipK * Math.sqrt(a * durability(tot) + 0.01) + 0.15 * tot.init + 0.25 * Math.min(tot.drive, 3);
}

export function sectorPotential(s, k) {
  const def = SECTORS[s.map[k].id];
  return def.vp * W.vp + W.sectorBase + def.squares.length * W.emptySquare + (def.art ? 1.5 : 0);
}

export function fleetPower(s, ships, vsShield = 0.5) {
  let a = 0;
  let d = 0;
  for (const ship of ships) {
    const tot = shipTotals(s, ship);
    a += attackValue(tot, vsShield);
    d += Math.max(0.5, durability(tot) - (ship.damage || 0));
  }
  return a * d;
}

export const fleetValue = (s, ships) => ships.reduce((a, x) => a + shipEval(shipTotals(s, x)), 0);

// Probability-like score (0..1) that `mine` beats `theirs`.
export function battleOdds(s, mine, theirs) {
  const pm = fleetPower(s, mine);
  const pe = fleetPower(s, theirs);
  if (pe <= 0) return 1;
  if (pm <= 0) return 0;
  return 1 / (1 + Math.pow(pe / pm, 1.5));
}
