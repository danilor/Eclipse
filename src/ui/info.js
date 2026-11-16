import { NPC, RESOURCE_NAMES } from '../data/constants.js';
import { SECTORS } from '../data/sectors.js';
import { SPECIES } from '../data/species.js';
import { shipTotals } from '../core/stats.js';
import { shipName, signed } from './names.js';
import { shipGroups } from './tileArt.js';

export const RING_NAMES = {
  GC: 'Galactic Center',
  START: 'Starting sector',
  GUARD: 'Guardian sector',
  I: 'Inner ring',
  II: 'Middle ring',
  III: 'Outer ring',
};

const diceText = (dice) =>
  Object.entries(dice)
    .filter(([, n]) => n > 0)
    .map(([c, n]) => `${n} ${c}`)
    .join(', ');

export function statLine(t) {
  const bits = [`Init ${t.init}`, `Computer ${signed(t.computer)}`, `Shield ${t.shield}`, `Hull ${t.hull}`];
  if (t.drive) bits.push(`Drive ${t.drive}`);
  const cannons = diceText(t.dice);
  const missiles = diceText(t.missiles);
  bits.push(`Cannons: ${cannons || 'none'}`);
  if (missiles) bits.push(`Missiles: ${missiles}`);
  return bits.join(' \u00b7 ');
}

export function ownerName(state, owner) {
  return owner === NPC ? 'Neutral' : state.players[owner].name;
}

export function squareName(sq) {
  const base = sq.kind === 'A' ? 'Any' : RESOURCE_NAMES[sq.kind];
  return sq.adv ? `${base}*` : base;
}

export function describeSector(id) {
  const def = SECTORS[id];
  const lines = [`Sector ${def.id} \u2014 ${RING_NAMES[def.ring]}`];
  const bits = [`${def.vp} VP`, `${def.wormholes.length} wormholes`];
  if (def.art) bits.push('Artifact');
  lines.push(bits.join(' \u00b7 '));
  lines.push(`Population squares: ${def.squares.length ? def.squares.map(squareName).join(', ') : 'none'}`);
  const extras = [];
  if (def.disc) extras.push('Discovery Tile');
  if (def.anc) extras.push(`${def.anc} Ancient ship${def.anc > 1 ? 's' : ''} (you must defeat them to take the sector)`);
  if (extras.length) lines.push(extras.join(' \u00b7 '));
  return lines.join('\n');
}

export function describeTile(state, k) {
  const tile = state.map[k];
  if (!tile) return 'Unexplored zone.';
  const def = SECTORS[tile.id];
  const lines = [];
  lines.push(`Sector ${def.id} \u2014 ${RING_NAMES[def.ring]}`);
  const bits = [`${def.vp} VP`, `${tile.wh.length} wormholes`];
  if (def.art) bits.push('Artifact');
  lines.push(bits.join(' \u00b7 '));
  lines.push(`Controlled by: ${tile.controller == null ? 'nobody' : state.players[tile.controller].name}`);
  const free = def.squares.length ? def.squares.map(squareName).join(', ') : 'none';
  lines.push(`Population squares: ${free}${tile.cubes.length ? ` (${tile.cubes.length} occupied)` : ''}`);
  const extras = [];
  if (tile.orbital) extras.push('Orbital');
  if (tile.monolith) extras.push('Monolith (3 VP)');
  if (tile.discovery) extras.push('unclaimed Discovery Tile');
  if (extras.length) lines.push(extras.join(' \u00b7 '));
  for (const gr of shipGroups(state, k)) {
    const sample = state.ships.find((x) => x.id === gr.ids[0]);
    const who = gr.owner === NPC ? 'Neutral' : SPECIES[state.players[gr.owner].species].name;
    lines.push(`${who}: ${gr.ids.length}\u00d7 ${shipName(gr.type)}`);
    lines.push(`   ${statLine(shipTotals(state, sample))}`);
  }
  return lines.join('\n');
}
