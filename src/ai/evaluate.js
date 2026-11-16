import { ROUNDS, SHIP_TYPES, NPC, BASE_INFLUENCE_DISCS, UPKEEP } from '../data/constants.js';
import { SECTORS } from '../data/sectors.js';
import { distance } from '../core/hex.js';
import { productionOf, upkeepOf, scoreBreakdown, controlledKeys, shipsOf, friendlyAncients } from '../core/queries.js';
import { blueprintTotals, shipTotals } from '../core/stats.js';
import { clone } from '../core/util.js';
import { canBuildType, exploreZones, tradeRate } from '../core/rules.js';
import { TECH_UTILITY } from './techValues.js';
import { W, shipEval, fleetPower, fleetValue } from './ratings.js';

// Static position evaluation used by the heuristic AI (units: one victory point is worth about three).

// Copies the parts of the state that rule helpers mutate so a command can be tried out safely.
export function simClone(s) {
  return {
    ...s,
    players: clone(s.players),
    map: clone(s.map),
    ships: clone(s.ships),
    tray: { ...s.tray },
    log: [],
  };
}

const POTENTIAL = { interceptor: 1.4, cruiser: 1.2, dreadnought: 0.9, starbase: 0.3 };

function fleetEval(s, p) {
  let v = 0;
  for (const ship of shipsOf(s, p.id)) {
    const e = shipEval(shipTotals(s, ship));
    v += ship.type === 'starbase' ? e * 0.8 : e;
  }
  for (const type of SHIP_TYPES) {
    if (!canBuildType(s, p, type)) continue;
    const tot = blueprintTotals(p, type);
    v += POTENTIAL[type] * shipEval(tot);
    v += 0.3 * Math.min(4, Math.max(-4, tot.energyProd - tot.energyUse)) * POTENTIAL[type];
  }
  return v;
}

function shipsValue(s, pid) {
  let v = 0;
  for (const ship of shipsOf(s, pid)) v += shipEval(shipTotals(s, ship));
  return v;
}

function foesValue(s, pid) {
  let v = 0;
  for (const ship of s.ships) if (ship.owner !== pid && ship.owner !== NPC) v += shipEval(shipTotals(s, ship));
  return v;
}

// Progress towards clearing nearby guarded sectors: the stronger the fleet, the closer the reward.
function opportunityEval(s, p, scale) {
  const fighters = shipsOf(s, p.id).filter((x) => x.type !== 'starbase');
  const myPower = fleetPower(s, fighters);
  const anchors = [...new Set([...controlledKeys(s, p.id), ...shipsOf(s, p.id).map((x) => x.at)])];
  if (!anchors.length) return 0;
  const friendly = friendlyAncients(s, p.id);
  const targets = [];
  for (const [k, t] of Object.entries(s.map)) {
    if (t.controller === p.id) continue;
    const foes = s.ships.filter((x) => x.at === k && x.owner !== p.id && !(friendly && x.type === 'ancient'));
    if (!foes.length || !anchors.some((a) => distance(s.map[a], t) <= 3)) continue;
    const def = SECTORS[t.id];
    const value = (t.discovery ? 6 : 0) + (def.vp * W.vp + 2) * (t.controller == null ? 0.8 : 0.6) + 2 + 0.4 * fleetValue(s, foes);
    targets.push({ value, power: fleetPower(s, foes) });
  }
  targets.sort((a, b) => b.value - a.value);
  let v = 0;
  for (const t of targets.slice(0, 2)) v += t.value * Math.min(1, Math.sqrt(myPower / (1.5 * t.power + 0.01)));
  return 0.7 * v * scale;
}

// Upkeep the player would owe once every disc on an action space is back on the Influence Track, i.e. the
// part of the bill caused by controlled sectors, which persists from round to round.
function lastingUpkeep(p) {
  const pending = Object.values(p.actionDiscs).reduce((a, b) => a + b, 0) + p.reactionDiscs;
  const empties = Math.max(0, BASE_INFLUENCE_DISCS - p.track - pending);
  return empties > 0 ? UPKEEP[empties - 1] : 0;
}

// Cost of not being able to pay this round's upkeep from money alone: first trade resources (at what they
// are worth), then give up sectors, which is much more painful.
export function solvencyCost(p) {
  const deficit = Math.max(0, upkeepOf(p) - p.res['$'] - productionOf(p)['$']);
  if (!deficit) return 0;
  const rate = tradeRate(p);
  const covered = Math.min(deficit, Math.floor((p.res.M + p.res.S) / rate));
  return covered * rate * 0.7 + (deficit - covered) * 6;
}

export function evaluate(s, pid) {
  const p = s.players[pid];
  const roundsLeft = Math.max(1, ROUNDS - s.round + 1);
  const horizon = Math.min(roundsLeft, 4);
  const scale = horizon / 4;
  const prod = productionOf(p);
  const upkeep = upkeepOf(p);
  const money = p.res['$'];
  let v = 0;
  v += horizon * (W.production.M * prod.M + W.production.S * prod.S + W.production['$'] * prod['$']);
  v -= W.production['$'] * (upkeep + (horizon - 1) * lastingUpkeep(p));
  v += W.resource.M * p.res.M + W.resource.S * p.res.S + W.resource['$'] * Math.min(money, 12) + 0.3 * Math.max(0, money - 12);
  v += W.vp * scoreBreakdown(s, pid).total;
  v -= solvencyCost(p);

  for (const k of controlledKeys(s, pid)) {
    const t = s.map[k];
    const def = SECTORS[t.id];
    v += scale * (W.sectorBase + W.emptySquare * Math.max(0, def.squares.length - t.cubes.length));
    if (t.orbital) v += 1.5;
  }
  v += 1.2 * Math.min(3, exploreZones(s, p).length) * Math.max(0, Math.min(1, (roundsLeft - 2) / 5));

  const utility = Math.max(0.2, Math.min(1, (roundsLeft + 2) / 6));
  for (const track of Object.values(p.techs)) for (const id of track) v += (TECH_UTILITY[id] ?? 4) * utility;
  v += fleetEval(s, p) * (0.4 + 0.6 * utility);
  v += opportunityEval(s, p, scale);
  v -= 0.8 * Math.max(0, 0.9 * foesValue(s, pid) - shipsValue(s, pid));
  v += p.ancientParts.length * 1.5;
  return v;
}

export function deltaOf(s, pid, mutate, base = evaluate(s, pid)) {
  const sim = simClone(s);
  mutate(sim, sim.players[pid]);
  return evaluate(sim, pid) - base;
}
