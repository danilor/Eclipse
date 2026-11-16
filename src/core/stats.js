import { PARTS } from '../data/parts.js';
import { SPECIES } from '../data/species.js';
import { NPC_BLUEPRINTS } from '../data/npc.js';
import { NPC, TECH_CATEGORIES, DIE_DAMAGE } from '../data/constants.js';

export function emptyDice() {
  return { yellow: 0, orange: 0, blue: 0, red: 0 };
}

export function hasTech(player, techId) {
  return TECH_CATEGORIES.some((c) => player.techs[c].includes(techId));
}

export function techCount(player) {
  return TECH_CATEGORIES.reduce((n, c) => n + player.techs[c].length, 0);
}

// Effective part in a blueprint slot: a placed tile covers the pre-printed part.
export function slotPart(slot) {
  return slot.tile ?? slot.base;
}

export function createBlueprint(speciesId, type) {
  const def = SPECIES[speciesId].blueprints[type];
  return { slots: def.slots.map((base) => ({ base, tile: null })), extras: [] };
}

// Totals for one blueprint of a player.
export function blueprintTotals(player, type) {
  const def = SPECIES[player.species].blueprints[type];
  const bp = player.blueprints[type];
  const t = {
    init: def.init,
    computer: def.innate.computer || 0,
    shield: 0,
    hull: 0,
    drive: 0,
    energyProd: def.innate.energy || 0,
    energyUse: 0,
    dice: emptyDice(),
    missiles: emptyDice(),
  };
  const add = (id) => {
    if (!id) return;
    const p = PARTS[id];
    t.computer += p.computer;
    t.shield += p.shield;
    t.hull += p.hull;
    t.drive += p.drive;
    t.init += p.init;
    if (p.energy > 0) t.energyProd += p.energy;
    else t.energyUse -= p.energy;
    for (const [c, n] of Object.entries(p.dice)) t.dice[c] += n;
    for (const [c, n] of Object.entries(p.missiles)) t.missiles[c] += n;
  };
  for (const slot of bp.slots) add(slotPart(slot));
  for (const id of bp.extras) add(id);
  return t;
}

export function npcTotals(type) {
  const b = NPC_BLUEPRINTS[type];
  return {
    init: b.init,
    computer: b.computer,
    shield: b.shield,
    hull: b.hull,
    drive: 0,
    energyProd: 0,
    energyUse: 0,
    dice: { ...emptyDice(), ...b.dice },
    missiles: emptyDice(),
  };
}

export function shipTotals(state, ship) {
  if (ship.owner === NPC) return npcTotals(ship.type);
  return blueprintTotals(state.players[ship.owner], ship.type);
}

export function diceCount(dice) {
  return Object.values(dice).reduce((a, b) => a + b, 0);
}

export function dicePower(dice) {
  return Object.entries(dice).reduce((a, [c, n]) => a + n * DIE_DAMAGE[c], 0);
}

// Returns an error string if the blueprint is not a legal configuration, otherwise null.
export function blueprintError(player, type) {
  const t = blueprintTotals(player, type);
  if (t.energyUse > t.energyProd) return `${type}: energy use ${t.energyUse} exceeds production ${t.energyProd}`;
  if (type === 'starbase' && t.drive > 0) return 'starbase: cannot carry a Drive';
  if (type !== 'starbase' && t.drive < 1) return `${type}: needs at least one Drive`;
  return null;
}

// Basic parts are always available, tech parts need the tech, Ancient parts must be in the stash.
export function partAvailable(player, partId) {
  const part = PARTS[partId];
  if (!part) return false;
  if (part.kind === 'ancient') return player.ancientParts.includes(partId);
  if (part.tech) return hasTech(player, part.tech);
  return true;
}
