import { SECTORS } from '../data/sectors.js';
import { SPECIES } from '../data/species.js';
import { TECHS } from '../data/techs.js';
import {
  NPC,
  POP_TRACK,
  POP_TRACK_SIZE,
  UPKEEP,
  TECH_DISCOUNT,
  TECH_TRACK_VP,
  TECH_TRACK_SIZE,
  TECH_CATEGORIES,
  BASE_INFLUENCE_DISCS,
} from '../data/constants.js';
import { dirTo, opposite, DIRS, key } from './hex.js';
import { hasTech, shipTotals } from './stats.js';

export { hasTech };

export const GC_KEY = '0,0';

export const tileAt = (s, k) => s.map[k] || null;

export const speciesOf = (s, pid) => SPECIES[s.players[pid].species];

export function shipsAt(s, k) {
  return s.ships.filter((x) => x.at === k);
}

export function shipsOf(s, pid) {
  return s.ships.filter((x) => x.owner === pid);
}

export function shipCount(s, pid, type) {
  return s.ships.filter((x) => x.owner === pid && x.type === type).length;
}

export function controlledKeys(s, pid) {
  return Object.keys(s.map).filter((k) => s.map[k].controller === pid);
}

export function friendlyAncients(s, pid) {
  return pid !== NPC && !!speciesOf(s, pid).traits.ancientsFriendly;
}

// Ships at k that are hostile to player pid (Descendants of Draco treat Ancients as friendly).
export function enemyShipsAt(s, pid, k) {
  const friendly = friendlyAncients(s, pid);
  return s.ships.filter((x) => x.at === k && x.owner !== pid && !(friendly && x.type === 'ancient'));
}

export function ownShipsAt(s, pid, k) {
  return s.ships.filter((x) => x.at === k && x.owner === pid);
}

// Number of this player's Ships that are Pinned in k by the opposition.
export function pinsAt(s, pid, k) {
  const en = enemyShipsAt(s, pid, k);
  if (en.some((x) => x.type === 'gcds')) return Infinity;
  return hasTech(s.players[pid], 'cloakingDevice') ? Math.floor(en.length / 2) : en.length;
}

export function hasUnpinnedShip(s, pid, k) {
  return ownShipsAt(s, pid, k).length > pinsAt(s, pid, k);
}

export function canLeave(s, ship) {
  return hasUnpinnedShip(s, ship.owner, ship.at);
}

// A wormhole connection between two adjacent explored sectors.
export function isLinked(s, pid, a, b) {
  const ta = s.map[a];
  const tb = s.map[b];
  if (!ta || !tb) return false;
  const d = dirTo(ta, tb);
  if (d < 0) return false;
  const ha = ta.wh.includes(d);
  const hb = tb.wh.includes(opposite(d));
  return hasTech(s.players[pid], 'wormholeGenerator') ? ha || hb : ha && hb;
}

export function neighborKeys(k) {
  const [q, r] = k.split(',').map(Number);
  return DIRS.map((d) => key(q + d.q, r + d.r));
}

export function linkedNeighbors(s, pid, k) {
  return neighborKeys(k).filter((n) => s.map[n] && isLinked(s, pid, k, n));
}

// Map of reachable sector key -> distance for a ship that may move up to its Drive value.
export function reachableKeys(s, ship) {
  const dist = new Map();
  const drive = shipTotals(s, ship).drive;
  if (drive < 1 || !canLeave(s, ship)) return dist;
  dist.set(ship.at, 0);
  const queue = [ship.at];
  while (queue.length) {
    const cur = queue.shift();
    const d = dist.get(cur);
    if (d >= drive) continue;
    // a ship that passes through a Sector with enemies must out-number the pins to continue
    if (cur !== ship.at && ownShipsAt(s, ship.owner, cur).length + 1 <= pinsAt(s, ship.owner, cur)) continue;
    for (const n of linkedNeighbors(s, ship.owner, cur)) {
      if (!dist.has(n)) {
        dist.set(n, d + 1);
        queue.push(n);
      }
    }
  }
  dist.delete(ship.at);
  return dist;
}

export function popProduction(cubesOnTrack) {
  return cubesOnTrack >= POP_TRACK_SIZE ? 0 : POP_TRACK[POP_TRACK_SIZE - 1 - cubesOnTrack];
}

export function productionOf(p) {
  return { M: popProduction(p.pop.M), S: popProduction(p.pop.S), $: popProduction(p.pop.$) };
}

export function upkeepOf(p) {
  const empties = Math.max(0, BASE_INFLUENCE_DISCS - p.track);
  return empties > 0 ? UPKEEP[empties - 1] : 0;
}

export function actionDiscCount(p) {
  return Object.values(p.actionDiscs).reduce((a, b) => a + b, 0);
}

export function techTrackFull(p, cat) {
  return p.techs[cat].length >= TECH_TRACK_SIZE;
}

export function researchCost(p, techId, track) {
  const t = TECHS[techId];
  const discount = TECH_DISCOUNT[Math.min(p.techs[track].length, TECH_DISCOUNT.length - 1)];
  return Math.max(t.min, t.cost - discount);
}

export function ancientsOnBoard(s) {
  return s.ships.filter((x) => x.type === 'ancient').length;
}

export function scoreBreakdown(s, pid) {
  const p = s.players[pid];
  const sp = SPECIES[p.species];
  const out = { reputation: 0, sectors: 0, monoliths: 0, discoveries: 0, techs: 0, species: 0, total: 0 };
  out.reputation = p.rep.reduce((a, b) => a + b, 0);
  const keys = controlledKeys(s, pid);
  for (const k of keys) {
    const t = s.map[k];
    out.sectors += SECTORS[t.id].vp;
    if (t.monolith) out.monoliths += 3;
  }
  out.discoveries = p.vpDisc * 2;
  for (const c of TECH_CATEGORIES) out.techs += TECH_TRACK_VP[Math.min(p.techs[c].length, TECH_TRACK_SIZE)];
  if (sp.traits.vpPerSector) out.species += keys.length * sp.traits.vpPerSector;
  if (sp.traits.vpPerAncient) out.species += ancientsOnBoard(s) * sp.traits.vpPerAncient;
  out.total = out.reputation + out.sectors + out.monoliths + out.discoveries + out.techs + out.species;
  return out;
}

export function totalStorage(p) {
  return p.res.M + p.res.S + p.res.$;
}

export function nextSeat(s, i) {
  const n = s.players.length;
  for (let step = 1; step <= n; step++) {
    const j = (i + step) % n;
    if (!s.players[j].eliminated) return j;
  }
  return i;
}

export function opponentsOf(s, pid) {
  return s.players.filter((x) => x.id !== pid && !x.eliminated).map((x) => x.id);
}

export function sectorNumber(s, k) {
  return Number(s.map[k].id);
}
