import { PARTS } from '../data/parts.js';
import { TECHS } from '../data/techs.js';
import { SHIP_NAMES } from '../data/constants.js';

export const ACTION_INFO = {
  explore: { label: 'Explore', text: 'Reveal a new sector and place it next to a sector you control or have a ship in.' },
  research: { label: 'Research', text: 'Pay Science to take a technology from the tray.' },
  upgrade: { label: 'Upgrade', text: 'Place Ship Parts on your Blueprints (and return old ones).' },
  build: { label: 'Build', text: 'Pay Materials to build ships, Orbitals and Monoliths in sectors you control.' },
  move: { label: 'Move', text: 'Move ships along wormholes, up to their Drive value.' },
  influence: { label: 'Influence', text: 'Move Influence Discs between sectors and your track. Readies 2 Colony Ships.' },
};

export const PHASE_NAMES = {
  setup: 'Setup',
  action: 'Action Phase',
  combat: 'Combat Phase',
  upkeep: 'Upkeep Phase',
  cleanup: 'Cleanup Phase',
  end: 'Game Over',
};

// Which pre-rendered 3D model family each species flies.
export const MODEL_SET = {
  'terran-federation': 'human',
  'terran-directorate': 'human',
  'terran-union': 'human',
  'terran-republic': 'human',
  'terran-conglomerate': 'human',
  'terran-alliance': 'human',
  eridani: 'gnolam',
  hydran: 'psilon',
  planta: 'silicoid',
  draco: 'klackon',
  mechanema: 'bulrathi',
  orion: 'bulrathi',
};

export const MODEL_SETS = ['human', 'bulrathi', 'gnolam', 'klackon', 'psilon', 'silicoid'];
export const SHIP_SPRITES = ['interceptor', 'cruiser', 'dreadnought', 'starbase'];
export const EXTRA_SPRITES = ['ancient', 'guardian', 'orbital', 'marker'];

export const SHIP_SCALE = { interceptor: 0.3, cruiser: 0.4, dreadnought: 0.5, starbase: 0.42, ancient: 0.34, guardian: 0.44, gcds: 0.62 };

export const shipSprite = (speciesId, type) => {
  if (type === 'ancient' || type === 'guardian' || type === 'gcds') return type;
  return `${MODEL_SET[speciesId] ?? 'human'}-${type}`;
};

export const signed = (n) => (n >= 0 ? `+${n}` : `\u2212${Math.abs(n)}`);
export const shipName = (type) => SHIP_NAMES[type] ?? type;
export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Structured description of a Ship Part (also used to draw its icon).
export function partStats(part) {
  const out = [];
  for (const [color, n] of Object.entries(part.dice)) out.push({ kind: 'cannon', color, n });
  for (const [color, n] of Object.entries(part.missiles)) out.push({ kind: 'missile', color, n });
  if (part.shield) out.push({ kind: 'shield', n: part.shield });
  if (part.computer) out.push({ kind: 'computer', n: part.computer });
  if (part.hull) out.push({ kind: 'hull', n: part.hull });
  if (part.drive) out.push({ kind: 'drive', n: part.drive });
  if (part.energy > 0) out.push({ kind: 'source', n: part.energy });
  return out;
}

export function describePart(id) {
  const p = PARTS[id];
  if (!p) return '';
  const bits = [];
  for (const [c, n] of Object.entries(p.dice)) bits.push(`${n} ${c} cannon${n > 1 ? 's' : ''}`);
  for (const [c, n] of Object.entries(p.missiles)) bits.push(`${n} ${c} missile${n > 1 ? 's' : ''}`);
  if (p.computer) bits.push(`Computer +${p.computer}`);
  if (p.shield) bits.push(`Shield ${p.shield}`);
  if (p.hull) bits.push(`Hull +${p.hull}`);
  if (p.drive) bits.push(`Drive ${p.drive}`);
  if (p.init) bits.push(`Initiative +${p.init}`);
  if (p.energy > 0) bits.push(`Energy +${p.energy}`);
  if (p.energy < 0) bits.push(`Energy cost ${-p.energy}`);
  return bits.join(', ') || 'No effect';
}

export function describeTech(id) {
  const t = TECHS[id];
  if (!t) return '';
  if (t.part) return `${PARTS[t.part].name}: ${describePart(t.part)}`;
  return t.text ?? '';
}

export const CATEGORY_NAMES = { military: 'Military', grid: 'Grid', nano: 'Nano', rare: 'Rare' };
export const CATEGORY_COLORS = { military: 0xd9534f, grid: 0x3fa7d6, nano: 0x59c36a, rare: 0xb07cff };

export const ancientPartName = (id) => PARTS[id]?.name ?? id;
