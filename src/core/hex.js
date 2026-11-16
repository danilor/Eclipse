// Axial hex coordinates for FLAT-TOP hexes.
// Edge indices go clockwise starting at the top edge:
//   0 = top, 1 = upper right, 2 = lower right, 3 = bottom, 4 = lower left, 5 = upper left
// A tile stored with a wormhole on edge e and rotated r steps clockwise has it on edge (e + r) % 6.

export const DIRS = [
  { q: 0, r: -1 },
  { q: 1, r: -1 },
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
];

export const EDGE_NAMES = ['T', 'UR', 'LR', 'B', 'LL', 'UL'];

export const key = (q, r) => `${q},${r}`;

export function parseKey(k) {
  const [q, r] = k.split(',').map(Number);
  return { q, r };
}

export const opposite = (dir) => (dir + 3) % 6;

export function neighbor(pos, dir) {
  return { q: pos.q + DIRS[dir].q, r: pos.r + DIRS[dir].r };
}

export function neighbors(pos) {
  return DIRS.map((_, d) => neighbor(pos, d));
}

export function distance(a, b) {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

// Direction index from a to b when they are adjacent, otherwise -1.
export function dirTo(a, b) {
  const dq = b.q - a.q;
  const dr = b.r - a.r;
  return DIRS.findIndex((d) => d.q === dq && d.r === dr);
}

export function rotateEdges(edges, rotation) {
  return edges.map((e) => (e + rotation) % 6);
}

// Ring a zone belongs to, by distance from the Galactic Center.
// 0 = Galactic Center, 1 = Starting/Guardian zones, 2 = Inner (I), 3 = Middle (II), 4+ = Outer (III)
export function ringOf(pos) {
  const d = distance(pos, { q: 0, r: 0 });
  if (d <= 1) return d;
  if (d === 2) return 'I';
  if (d === 3) return 'II';
  return 'III';
}

// Pixel centre of a hex (flat-top).
export function hexToPixel(pos, size) {
  return {
    x: size * 1.5 * pos.q,
    y: size * Math.sqrt(3) * (pos.r + pos.q / 2),
  };
}

export function pixelToHex(x, y, size) {
  const q = ((2 / 3) * x) / size;
  const r = ((-1 / 3) * x + (Math.sqrt(3) / 3) * y) / size;
  return hexRound(q, r);
}

export function hexRound(fq, fr) {
  const fs = -fq - fr;
  let q = Math.round(fq);
  let r = Math.round(fr);
  const s = Math.round(fs);
  const dq = Math.abs(q - fq);
  const dr = Math.abs(r - fr);
  const ds = Math.abs(s + fq + fr);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q: q === 0 ? 0 : q, r: r === 0 ? 0 : r };
}

// Corner points of a flat-top hex, starting at the right-hand corner and going clockwise.
export function hexCorners(center, size) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i);
    pts.push({ x: center.x + size * Math.cos(a), y: center.y + size * Math.sin(a) });
  }
  return pts;
}

// Midpoint of the given edge of a flat-top hex.
export function edgeMidpoint(center, size, edge) {
  const apothem = (size * Math.sqrt(3)) / 2;
  // edge 0 (top) points straight up; each edge is 60 degrees further clockwise
  const a = (Math.PI / 180) * (-90 + 60 * edge);
  return { x: center.x + apothem * Math.cos(a), y: center.y + apothem * Math.sin(a) };
}
