import { COLORS, HEX, RES, RING_COLORS } from '../config.js';
import { edgeMidpoint, hexCorners } from '../core/hex.js';
import { NPC } from '../data/constants.js';
import { SECTORS } from '../data/sectors.js';
import { SPECIES } from '../data/species.js';
import { label } from './kit.js';
import { SHIP_SCALE, shipSprite } from './names.js';

export const SQ = 30;
const PITCH = 36;

export const ORB_POS = { x: -86, y: -18 };
export const ORB_SQ = { x: -86, y: 12 };
export const MONO_POS = { x: 86, y: -14 };
export const DISC_POS = { x: 0, y: -68 };
export const VP_POS = { x: -62, y: -64 };
export const TOKEN_POS = { x: 62, y: -64 };

const ANY_COLOR = 0x9aa3b8;
const NPC_TINT = { ancient: 0xc3cad6, guardian: 0xf2b84b, gcds: 0xff7a7a };

// Centres of the population squares of a sector (relative to the hex centre).
export function squarePositions(n) {
  const rows = n <= 4 ? [n] : n === 5 ? [3, 2] : [3, n - 3];
  const ys = rows.length === 1 ? [-20] : [-34, 2];
  const out = [];
  rows.forEach((count, r) => {
    for (let i = 0; i < count; i++) out.push({ x: (i - (count - 1) / 2) * PITCH, y: ys[r] });
  });
  return out;
}

export function squareCenter(def, sq) {
  if (sq === 'orb') return ORB_SQ;
  return squarePositions(def.squares.length)[sq];
}

// Slots for groups of ships along the lower part of the hex.
export function shipSlots(n) {
  if (n <= 4) return Array.from({ length: n }, (_, i) => ({ x: (i - (n - 1) / 2) * 46, y: 52 }));
  const top = Math.ceil(n / 2);
  const bottom = n - top;
  const out = [];
  for (let i = 0; i < top; i++) out.push({ x: (i - (top - 1) / 2) * 44, y: 40 });
  for (let i = 0; i < bottom; i++) out.push({ x: (i - (bottom - 1) / 2) * 44, y: 70 });
  return out;
}

export const ownerColor = (state, owner) => (owner === NPC ? 0xdde3f0 : SPECIES[state.players[owner].species].color);

function starPoints(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    pts.push({ x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) });
  }
  return pts;
}

export function hexPoints(size, cx = 0, cy = 0) {
  return hexCorners({ x: cx, y: cy }, size);
}

// Half-disc on the inner side of an edge: two neighbouring Wormholes join into one full circle.
function wormholePoints(edge, radius) {
  const m = edgeMidpoint({ x: 0, y: 0 }, HEX - 2, edge);
  const theta = (Math.PI / 180) * (-90 + 60 * edge);
  const pts = [];
  for (let i = 0; i <= 14; i++) {
    const a = theta + Math.PI / 2 + (Math.PI * i) / 14;
    pts.push({ x: m.x + radius * Math.cos(a), y: m.y + radius * Math.sin(a) });
  }
  return pts;
}

function drawSquare(g, pos, kind, adv, cubeTrack = null) {
  const fill = kind === 'A' ? (cubeTrack ? RES[cubeTrack].color : ANY_COLOR) : RES[kind].color;
  const half = SQ / 2;
  g.fillStyle(0x0a0f1c, 1);
  g.fillRoundedRect(pos.x - half - 2, pos.y - half - 2, SQ + 4, SQ + 4, 7);
  g.fillStyle(fill, 1);
  g.fillRoundedRect(pos.x - half, pos.y - half, SQ, SQ, 5);
  if (adv) {
    g.lineStyle(3, 0xffffff, 1);
    g.strokeRoundedRect(pos.x - half, pos.y - half, SQ, SQ, 5);
    g.fillStyle(0xffffff, 1);
    g.fillPoints(starPoints(pos.x + half - 4, pos.y - half + 4, 6), true, true);
  }
  if (kind === 'A' && !cubeTrack) {
    g.fillStyle(RES.M.color, 1);
    g.fillCircle(pos.x - 6, pos.y + 5, 3.6);
    g.fillStyle(RES.S.color, 1);
    g.fillCircle(pos.x + 6, pos.y + 5, 3.6);
    g.fillStyle(RES.$.color, 1);
    g.fillCircle(pos.x, pos.y - 6, 3.6);
  }
}

// Everything that never changes once a sector tile is on the map.
export function buildTileBase(scene, tile) {
  const def = SECTORS[tile.id];
  const ring = RING_COLORS[def.ring];
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();
  const outer = hexPoints(HEX - 2);

  g.fillStyle(ring.fill, 1);
  g.fillPoints(outer, true, true);
  if (def.ring === 'GC') {
    for (const [r, a] of [[96, 0.1], [70, 0.12], [44, 0.14]]) {
      g.fillStyle(0x8c5cff, a);
      g.fillCircle(0, -14, r);
    }
  }
  g.lineStyle(4, ring.edge, 1);
  g.strokePoints(outer, true, true);
  g.lineStyle(1.5, ring.edge, 0.35);
  g.strokePoints(hexPoints(HEX - 12), true, true);

  for (const e of tile.wh) {
    const pts = wormholePoints(e, 13);
    g.fillStyle(0x7be9ff, 1);
    g.fillPoints(pts, true, true);
    g.lineStyle(2, 0x0b2a3a, 1);
    g.strokePoints(pts, true, true);
  }

  const squares = squarePositions(def.squares.length);
  def.squares.forEach((sq, i) => drawSquare(g, squares[i], sq.kind, sq.adv));
  c.add(g);

  def.squares.forEach((sq, i) => {
    if (sq.kind === 'A') return;
    c.add(label(scene, squares[i].x, squares[i].y + 1, sq.kind, { size: 17, bold: true, origin: [0.5, 0.5], color: RES[sq.kind].dark }));
  });

  const badge = scene.add.graphics();
  badge.fillStyle(0x0b1020, 1);
  badge.fillCircle(VP_POS.x, VP_POS.y, 14);
  badge.lineStyle(2, COLORS.gold, 1);
  badge.strokeCircle(VP_POS.x, VP_POS.y, 14);
  c.add(badge);
  c.add(label(scene, VP_POS.x, VP_POS.y, def.vp, { size: 17, bold: true, origin: [0.5, 0.5], color: COLORS.goldText }));

  c.add(label(scene, 0, 90, `#${def.id}`, { size: 12, origin: [0.5, 0.5], color: COLORS.muted }));
  if (def.art) {
    const a = scene.add.graphics();
    a.fillStyle(0xffd86b, 1);
    a.fillPoints([{ x: 40, y: 82 }, { x: 48, y: 90 }, { x: 40, y: 98 }, { x: 32, y: 90 }], true, true);
    a.lineStyle(1.5, 0x5a4310, 1);
    a.strokePoints([{ x: 40, y: 82 }, { x: 48, y: 90 }, { x: 40, y: 98 }, { x: 32, y: 90 }], true, true);
    c.add(a);
  }
  if (def.ring === 'GC') c.add(label(scene, 0, -92, 'GALACTIC CENTER', { size: 11, bold: true, origin: [0.5, 0.5], color: '#c9b3ff' }));
  return c;
}

export function shipGroups(state, k) {
  const groups = [];
  for (const s of state.ships) {
    if (s.at !== k) continue;
    let gr = groups.find((x) => x.owner === s.owner && x.type === s.type);
    if (!gr) groups.push((gr = { owner: s.owner, type: s.type, ids: [] }));
    gr.ids.push(s.id);
  }
  const rank = { interceptor: 0, cruiser: 1, dreadnought: 2, starbase: 3, ancient: 4, guardian: 5, gcds: 6 };
  groups.sort((a, b) => (a.owner === NPC) - (b.owner === NPC) || a.owner - b.owner || rank[a.type] - rank[b.type]);
  return groups;
}

export function overlaySignature(state, tile) {
  const groups = shipGroups(state, tile.key)
    .map((g) => `${g.owner}:${g.type}:${g.ids.length}`)
    .join('|');
  const cubes = tile.cubes.map((c) => `${c.owner}${c.track}${c.sq}`).join(',');
  return `${tile.controller}/${cubes}/${tile.orbital ? 1 : 0}${tile.monolith ? 1 : 0}${tile.discovery ? 1 : 0}/${groups}`;
}

// Controller disc, population cubes, structures, discovery token and ships of one sector.
export function buildTileOverlay(scene, state, tile) {
  const def = SECTORS[tile.id];
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();
  c.add(g);

  const squares = squarePositions(def.squares.length);
  for (const cube of tile.cubes) {
    const pos = cube.sq === 'orb' ? ORB_SQ : squares[cube.sq];
    if (!pos) continue;
    const sq = def.squares[cube.sq];
    if (cube.sq === 'orb') drawSquare(g, pos, cube.track, false);
    else if (sq.kind === 'A') drawSquare(g, pos, 'A', sq.adv, cube.track);
    const col = ownerColor(state, cube.owner);
    g.fillStyle(0x05070d, 1);
    g.fillRoundedRect(pos.x - 10, pos.y - 10, 20, 20, 4);
    g.fillStyle(col, 1);
    g.fillRoundedRect(pos.x - 8, pos.y - 8, 16, 16, 3);
    g.fillStyle(0xffffff, 0.35);
    g.fillRoundedRect(pos.x - 8, pos.y - 8, 16, 6, 3);
  }

  if (tile.orbital) {
    const col = tile.controller != null ? ownerColor(state, tile.controller) : 0xcfd6e6;
    g.lineStyle(5, 0x05070d, 1);
    g.strokeCircle(ORB_POS.x, ORB_POS.y, 11);
    g.lineStyle(3, col, 1);
    g.strokeCircle(ORB_POS.x, ORB_POS.y, 11);
    g.fillStyle(col, 1);
    g.fillCircle(ORB_POS.x, ORB_POS.y, 4);
    if (!tile.cubes.some((x) => x.sq === 'orb')) {
      g.fillStyle(0x0a0f1c, 0.9);
      g.fillRoundedRect(ORB_SQ.x - 15, ORB_SQ.y - 15, SQ, SQ, 6);
      g.lineStyle(2, 0x9aa8c8, 0.9);
      g.strokeRoundedRect(ORB_SQ.x - 15, ORB_SQ.y - 15, SQ, SQ, 6);
      g.fillStyle(RES.S.color, 1);
      g.fillCircle(ORB_SQ.x - 5, ORB_SQ.y, 4);
      g.fillStyle(RES.$.color, 1);
      g.fillCircle(ORB_SQ.x + 5, ORB_SQ.y, 4);
    }
  }

  if (tile.monolith) {
    g.fillStyle(0x05070d, 1);
    g.fillRoundedRect(MONO_POS.x - 11, MONO_POS.y - 20, 22, 40, 3);
    g.fillStyle(0x6b7390, 1);
    g.fillRoundedRect(MONO_POS.x - 8, MONO_POS.y - 17, 16, 34, 2);
    g.fillStyle(0xaab4d6, 1);
    g.fillRoundedRect(MONO_POS.x - 8, MONO_POS.y - 17, 5, 34, 2);
  }

  if (tile.discovery) {
    g.fillStyle(0x05070d, 1);
    g.fillCircle(TOKEN_POS.x, TOKEN_POS.y, 15);
    g.fillStyle(0x7e4fd6, 1);
    g.fillCircle(TOKEN_POS.x, TOKEN_POS.y, 12.5);
    g.lineStyle(2, 0xd7c2ff, 1);
    g.strokeCircle(TOKEN_POS.x, TOKEN_POS.y, 12.5);
    c.add(label(scene, TOKEN_POS.x, TOKEN_POS.y, '?', { size: 18, bold: true, origin: [0.5, 0.5], color: '#ffffff' }));
  }

  if (tile.controller != null) {
    const col = ownerColor(state, tile.controller);
    g.fillStyle(0x05070d, 1);
    g.fillCircle(DISC_POS.x, DISC_POS.y, 17);
    g.fillStyle(col, 1);
    g.fillCircle(DISC_POS.x, DISC_POS.y, 14);
    g.lineStyle(2, 0xffffff, 0.9);
    g.strokeCircle(DISC_POS.x, DISC_POS.y, 14);
    g.lineStyle(2, 0x05070d, 0.6);
    g.strokeCircle(DISC_POS.x, DISC_POS.y, 8);
  }

  const groups = shipGroups(state, tile.key);
  const slots = shipSlots(Math.min(groups.length, 8));
  const badges = scene.add.graphics();
  const counts = [];
  groups.slice(0, 8).forEach((gr, i) => {
    const pos = slots[i];
    const key = shipSprite(gr.owner === NPC ? null : state.players[gr.owner].species, gr.type);
    const img = scene.add.image(pos.x, pos.y, key).setScale(SHIP_SCALE[gr.type] ?? 0.4);
    img.setTint(gr.owner === NPC ? NPC_TINT[gr.type] : ownerColor(state, gr.owner));
    c.add(img);
    if (gr.ids.length > 1) {
      const bx = pos.x + 14;
      const by = pos.y + 14;
      badges.fillStyle(0x05070d, 1);
      badges.fillCircle(bx, by, 9);
      badges.lineStyle(1.5, 0xffffff, 0.9);
      badges.strokeCircle(bx, by, 9);
      counts.push(label(scene, bx, by, gr.ids.length, { size: 12, bold: true, origin: [0.5, 0.5], color: '#ffffff' }));
    }
  });
  c.add(badges);
  c.add(counts);
  return c;
}

// Outline of a hex zone, used for highlights and for empty (not yet explored) zones.
export function drawHexOutline(g, color, { width = 4, fillAlpha = 0.14, alpha = 1, inset = 3, at = { x: 0, y: 0 } } = {}) {
  const pts = hexPoints(HEX - inset, at.x, at.y);
  if (fillAlpha > 0) {
    g.fillStyle(color, fillAlpha);
    g.fillPoints(pts, true, true);
  }
  g.lineStyle(width, color, alpha);
  g.strokePoints(pts, true, true);
}
