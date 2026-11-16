import { SECTORS } from '../data/sectors.js';
import { SPECIES } from '../data/species.js';
import { TECHS, ADVANCED_TECH } from '../data/techs.js';
import { PARTS } from '../data/parts.js';
import {
  NPC,
  RESOURCES,
  POP_TRACK_SIZE,
  TECH_CATEGORIES,
  SHIP_TYPES,
  SHIP_LIMITS,
  MAX_REPUTATION_DRAW,
} from '../data/constants.js';
import { DIRS, key, opposite, ringOf } from './hex.js';
import {
  GC_KEY,
  hasTech,
  controlledKeys,
  enemyShipsAt,
  ownShipsAt,
  hasUnpinnedShip,
  linkedNeighbors,
  reachableKeys,
  shipCount,
  shipsOf,
  techTrackFull,
  researchCost,
} from './queries.js';
import { blueprintError, partAvailable, slotPart } from './stats.js';
import { makeTile, addShip, drawDiscovery } from './setup.js';
import { rngInt, rngShuffle } from './rng.js';
import { clone } from './util.js';

// ---------------------------------------------------------------- population & influence

export function returnCube(p, track) {
  if (p.pop[track] < POP_TRACK_SIZE) {
    p.pop[track] += 1;
    return track;
  }
  // A full track forces the cube onto another one; keep production as high as possible.
  const alt = RESOURCES.filter((t) => p.pop[t] < POP_TRACK_SIZE).sort((a, b) => p.pop[b] - p.pop[a])[0];
  p.pop[alt] += 1;
  return alt;
}

export function returnGraveyard(p) {
  for (const t of RESOURCES) {
    for (let i = 0; i < p.grave[t]; i++) returnCube(p, t);
    p.grave[t] = 0;
  }
}

// Removes the Influence Disc from a sector (cubes go back to the Population Tracks).
export function removeInfluence(s, k) {
  const t = s.map[k];
  if (t.controller == null) return;
  const p = s.players[t.controller];
  for (const c of t.cubes) returnCube(p, c.track);
  t.cubes = [];
  t.controller = null;
  p.track += 1;
}

export function placeInfluence(s, pid, k) {
  s.players[pid].track -= 1;
  s.map[k].controller = pid;
}

export function canUseAdvanced(p, track) {
  return hasTech(p, 'metasynthesis') || hasTech(p, ADVANCED_TECH[track]);
}

// ---------------------------------------------------------------- colony ships & trade

export function colonizeOptions(s, p, { upkeep = false } = {}) {
  if (p.colony.up <= 0) return [];
  const out = [];
  for (const k of controlledKeys(s, p.id)) {
    if (upkeep && enemyShipsAt(s, p.id, k).length) continue;
    const t = s.map[k];
    const occupied = new Set(t.cubes.map((c) => c.sq));
    SECTORS[t.id].squares.forEach((sq, i) => {
      if (occupied.has(i)) return;
      const tracks = sq.kind === 'A' ? RESOURCES : [sq.kind];
      for (const track of tracks) {
        if (p.pop[track] <= 0) continue;
        if (sq.adv && !canUseAdvanced(p, track)) continue;
        out.push({ type: 'colonize', at: k, sq: i, track });
      }
    });
    if (t.orbital && !occupied.has('orb')) {
      for (const track of ['S', '$']) if (p.pop[track] > 0) out.push({ type: 'colonize', at: k, sq: 'orb', track });
    }
  }
  return out;
}

export function applyColonize(s, p, cmd) {
  p.colony.up -= 1;
  p.pop[cmd.track] -= 1;
  s.map[cmd.at].cubes.push({ owner: p.id, track: cmd.track, sq: cmd.sq });
}

export function tradeRate(p) {
  return SPECIES[p.species].trade;
}

export function tradeOptions(p) {
  const rate = tradeRate(p);
  const out = [];
  for (const from of RESOURCES) {
    if (p.res[from] < rate) continue;
    for (const to of RESOURCES) if (to !== from) out.push({ type: 'trade', from, to });
  }
  return out;
}

export function applyTrade(p, cmd) {
  p.res[cmd.from] -= tradeRate(p);
  p.res[cmd.to] += 1;
}

// ---------------------------------------------------------------- research

export function ownsTech(p, id) {
  return hasTech(p, id);
}

export function researchOptions(s, p) {
  const out = [];
  for (const [id, count] of Object.entries(s.tray)) {
    if (count <= 0 || ownsTech(p, id)) continue;
    const t = TECHS[id];
    const tracks = t.rare ? TECH_CATEGORIES : [t.category];
    for (const track of tracks) {
      if (techTrackFull(p, track)) continue;
      const cost = researchCost(p, id, track);
      if (cost <= p.res.S) out.push({ type: 'research', tech: id, track, cost });
    }
  }
  return out;
}

// Adds a tech to the player's board and resolves the immediate effects that need no decision.
export function gainTech(s, p, id, track) {
  s.tray[id] -= 1;
  if (s.tray[id] <= 0) delete s.tray[id];
  p.techs[track].push(id);
  if (id === 'quantumGrid') {
    p.totalDiscs += 2;
    p.track += 2;
  } else if (id === 'advancedRobotics') {
    p.totalDiscs += 1;
    p.track += 1;
  }
}

export function applyResearch(s, p, cmd) {
  p.res.S -= cmd.cost;
  gainTech(s, p, cmd.tech, cmd.track);
}

export function artifactCount(s, pid) {
  return controlledKeys(s, pid).filter((k) => SECTORS[s.map[k].id].art).length;
}

// Regular techs in the tray with the lowest printed cost that the player can still take (Ancient Tech).
export function ancientTechChoices(s, p) {
  let best = Infinity;
  let list = [];
  for (const [id, count] of Object.entries(s.tray)) {
    const t = TECHS[id];
    if (count <= 0 || t.rare || ownsTech(p, id) || techTrackFull(p, t.category)) continue;
    if (t.cost < best) {
      best = t.cost;
      list = [id];
    } else if (t.cost === best) list.push(id);
  }
  return list;
}

// ---------------------------------------------------------------- upgrade

export function upgradeError(p, cmd) {
  const trial = clone(p.blueprints);
  const returns = Array.isArray(cmd.returns) ? cmd.returns : [];
  for (const r of returns) {
    const slot = trial[r?.bp]?.slots[r.slot];
    if (!slot || !slot.tile) return 'There is no Ship Part to return there.';
    slot.tile = null;
  }
  if (cmd.place) {
    const { part, bp, slot } = cmd.place;
    const target = trial[bp]?.slots[slot];
    if (!target) return 'Unknown Ship Part space.';
    if (target.tile) return 'That space is occupied.';
    if (!PARTS[part]) return 'Unknown part.';
    if (!partAvailable(p, part)) return 'That Ship Part is not available.';
    target.tile = part;
  } else if (!returns.length) {
    return 'Nothing to upgrade.';
  }
  const probe = { species: p.species, blueprints: trial };
  for (const type of SHIP_TYPES) {
    const err = blueprintError(probe, type);
    if (err) return err;
  }
  return null;
}

export function applyUpgrade(p, cmd) {
  for (const r of cmd.returns || []) p.blueprints[r.bp].slots[r.slot].tile = null;
  if (cmd.place) {
    const { part, bp, slot } = cmd.place;
    p.blueprints[bp].slots[slot].tile = part;
    if (PARTS[part].kind === 'ancient') {
      const i = p.ancientParts.indexOf(part);
      if (i >= 0) p.ancientParts.splice(i, 1);
    }
  }
}

// Every legal single-part upgrade (a tile placed over an empty or printed space, replacing any tile there).
export function upgradeCandidates(p, { limit = Infinity } = {}) {
  const out = [];
  const parts = Object.keys(PARTS).filter((id) => id !== 'muonSource' && partAvailable(p, id));
  for (const bp of SHIP_TYPES) {
    const slots = p.blueprints[bp].slots;
    for (let i = 0; i < slots.length; i++) {
      const current = slotPart(slots[i]);
      for (const part of parts) {
        if (part === current) continue;
        const cmd = { type: 'upgrade', returns: slots[i].tile ? [{ bp, slot: i }] : [], place: { part, bp, slot: i } };
        if (upgradeError(p, cmd)) continue;
        out.push(cmd);
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

// Every legal way to put an Ancient Part (already in the stash) onto a blueprint.
export function ancientPlacementOptions(p, part) {
  const out = [];
  for (const bp of SHIP_TYPES) {
    p.blueprints[bp].slots.forEach((slot, i) => {
      const cmd = { type: 'upgrade', returns: slot.tile ? [{ bp, slot: i }] : [], place: { part, bp, slot: i } };
      if (!upgradeError(p, cmd)) out.push(cmd);
    });
  }
  return out;
}

// ---------------------------------------------------------------- build

export function structureCost(p, what) {
  return SPECIES[p.species].costs[what];
}

export function canBuildType(s, p, what) {
  if (what === 'starbase' && !hasTech(p, 'starbase')) return false;
  if (what === 'orbital' && !hasTech(p, 'orbital')) return false;
  if (what === 'monolith' && !hasTech(p, 'monolith')) return false;
  if (SHIP_LIMITS[what] != null && shipCount(s, p.id, what) >= SHIP_LIMITS[what]) return false;
  return true;
}

export function buildOptions(s, p) {
  const out = [];
  const keys = controlledKeys(s, p.id);
  for (const what of [...SHIP_TYPES, 'orbital', 'monolith']) {
    if (!canBuildType(s, p, what) || p.res.M < structureCost(p, what)) continue;
    for (const k of keys) {
      if ((what === 'orbital' && s.map[k].orbital) || (what === 'monolith' && s.map[k].monolith)) continue;
      out.push({ type: 'build', what, at: k });
    }
  }
  return out;
}

export function applyBuild(s, p, cmd) {
  p.res.M -= structureCost(p, cmd.what);
  placeBuilt(s, p.id, cmd.what, cmd.at);
}

export function placeBuilt(s, pid, what, at) {
  if (what === 'orbital') s.map[at].orbital = true;
  else if (what === 'monolith') s.map[at].monolith = true;
  else addShip(s, pid, what, at);
}

// ---------------------------------------------------------------- move

export function moveOptions(s, p) {
  const out = [];
  for (const ship of shipsOf(s, p.id)) {
    if (ship.type === 'starbase') continue;
    for (const k of reachableKeys(s, ship).keys()) out.push({ type: 'move', ship: ship.id, to: k });
  }
  return out;
}

export function applyMove(s, cmd) {
  const ship = s.ships.find((x) => x.id === cmd.ship);
  ship.at = cmd.to;
  ship.seq = ++s.moveSeq;
}

// ---------------------------------------------------------------- influence action

// Sectors where the player could place a disc right now.
export function influenceTargets(s, p) {
  const out = [];
  for (const [k, t] of Object.entries(s.map)) {
    if (t.controller != null) continue;
    if (enemyShipsAt(s, p.id, k).length) continue;
    const here = ownShipsAt(s, p.id, k).length > 0;
    const linked = linkedNeighbors(s, p.id, k).some(
      (n) => s.map[n].controller === p.id || ownShipsAt(s, p.id, n).length > 0
    );
    if (here || linked) out.push(k);
  }
  return out;
}

export function influenceOptions(s, p, touched) {
  const out = [];
  const mine = controlledKeys(s, p.id).filter((k) => !touched.has(k));
  const targets = influenceTargets(s, p).filter((k) => !touched.has(k));
  if (p.track > 0) for (const to of targets) out.push({ type: 'influence', from: 'track', to });
  for (const from of mine) {
    out.push({ type: 'influence', from, to: 'track' });
    for (const to of targets) if (to !== from) out.push({ type: 'influence', from, to });
  }
  return out;
}

export function applyInfluence(s, p, cmd) {
  if (cmd.from !== 'track') removeInfluence(s, cmd.from);
  if (cmd.to !== 'track') placeInfluence(s, p.id, cmd.to);
}

// ---------------------------------------------------------------- explore

export function stackFor(zoneKey) {
  const [q, r] = zoneKey.split(',').map(Number);
  const ring = ringOf({ q, r });
  return ring === 'I' ? 'I' : ring === 'II' ? 'II' : 'III';
}

export function stackHasTiles(s, name) {
  return s.stacks[name].length > 0 || s.sectorDiscard[name].length > 0;
}

export function drawSector(s, name) {
  if (!s.stacks[name].length && s.sectorDiscard[name].length) {
    s.stacks[name] = rngShuffle(s.rng, s.sectorDiscard[name].splice(0));
  }
  return s.stacks[name].pop() || null;
}

// Sectors adjacent to a zone from which the player may explore into it, with the direction zone -> source.
export function exploreSources(s, p, zoneKey) {
  const [q, r] = zoneKey.split(',').map(Number);
  const out = [];
  for (let d = 0; d < 6; d++) {
    const nk = key(q + DIRS[d].q, r + DIRS[d].r);
    if (s.map[nk] && (s.map[nk].controller === p.id || hasUnpinnedShip(s, p.id, nk))) out.push({ key: nk, dir: d });
  }
  return out;
}

export function exploreZones(s, p) {
  const wg = hasTech(p, 'wormholeGenerator');
  const zones = new Set();
  for (const [k, t] of Object.entries(s.map)) {
    if (!(t.controller === p.id || hasUnpinnedShip(s, p.id, k))) continue;
    for (let d = 0; d < 6; d++) {
      const zk = key(t.q + DIRS[d].q, t.r + DIRS[d].r);
      if (!s.map[zk] && (wg || t.wh.includes(d))) zones.add(zk);
    }
  }
  return [...zones].filter((zk) => stackHasTiles(s, stackFor(zk)));
}

// Rotations (without duplicates) that give a legal Wormhole Connection for the drawn sector.
export function placementRotations(s, p, zoneKey, sectorId) {
  const sources = exploreSources(s, p, zoneKey);
  const wg = hasTech(p, 'wormholeGenerator');
  const def = SECTORS[sectorId];
  const seen = new Set();
  const out = [];
  for (let rot = 0; rot < 6; rot++) {
    const wh = def.wormholes.map((e) => (e + rot) % 6);
    const sig = [...wh].sort((a, b) => a - b).join('');
    if (seen.has(sig)) continue;
    const ok = sources.some(({ key: nk, dir }) => {
      const mine = wh.includes(dir);
      const theirs = s.map[nk].wh.includes(opposite(dir));
      return wg ? mine || theirs : mine && theirs;
    });
    if (ok) {
      seen.add(sig);
      out.push(rot);
    }
  }
  return out;
}

export function placeSector(s, zoneKey, sectorId, rot) {
  const [q, r] = zoneKey.split(',').map(Number);
  const tile = makeTile(sectorId, q, r, rot);
  s.map[zoneKey] = tile;
  const def = SECTORS[sectorId];
  if (def.disc) {
    tile.discovery = drawDiscovery(s);
    for (let i = 0; i < def.anc; i++) addShip(s, NPC, 'ancient', zoneKey);
  }
  return tile;
}

// ---------------------------------------------------------------- reputation

// Draws tiles, keeps the best one (replacing the worst when the track is full) and returns the rest.
export function drawReputation(s, p, count) {
  const n = Math.min(count, MAX_REPUTATION_DRAW, s.repBag.length);
  if (n <= 0) return null;
  const drawn = [];
  for (let i = 0; i < n; i++) drawn.push(s.repBag.splice(rngInt(s.rng, s.repBag.length), 1)[0]);
  drawn.sort((a, b) => b - a);
  const best = drawn.shift();
  s.repBag.push(...drawn);
  const slots = SPECIES[p.species].repSlots;
  if (p.rep.length < slots) {
    p.rep.push(best);
    return best;
  }
  const lowest = Math.min(...p.rep);
  if (best > lowest) {
    p.rep.splice(p.rep.indexOf(lowest), 1);
    s.repBag.push(lowest);
    p.rep.push(best);
    return best;
  }
  s.repBag.push(best);
  return null;
}

// ---------------------------------------------------------------- activations

export function activationsFor(p, action) {
  let n = SPECIES[p.species].activations[action];
  if (action === 'build' && hasTech(p, 'nanorobots')) n += 1;
  if (action === 'move' && hasTech(p, 'improvedLogistics')) n += 1;
  if (action === 'upgrade' && hasTech(p, 'picoModulator')) n += 2;
  return n;
}

export { GC_KEY };
