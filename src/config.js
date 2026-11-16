// Layout and theme constants shared by every scene.

export const W = 1920;
export const H = 1080;

const TOP_H = 56;
const BOTTOM_H = 132;
const LEFT_W = 430;
const RIGHT_W = 372;

export const RECT = {
  top: { x: 0, y: 0, w: W, h: TOP_H },
  left: { x: 0, y: TOP_H, w: LEFT_W, h: H - TOP_H - BOTTOM_H },
  right: { x: W - RIGHT_W, y: TOP_H, w: RIGHT_W, h: H - TOP_H - BOTTOM_H },
  bottom: { x: 0, y: H - BOTTOM_H, w: W, h: BOTTOM_H },
  map: { x: LEFT_W, y: TOP_H, w: W - LEFT_W - RIGHT_W, h: H - TOP_H - BOTTOM_H },
};

export const FONT = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

export const COLORS = {
  bg: 0x070b16,
  panel: 0x111a30,
  panelHi: 0x1a2646,
  panelLine: 0x2c3c66,
  text: '#e8ecf6',
  muted: '#8f9bb8',
  dim: '#5d6a8a',
  gold: 0xf5c542,
  goldText: '#f5c542',
  good: 0x4fd18b,
  bad: 0xff6464,
  accent: 0x58a6ff,
  highlight: 0x7dffb0,
  target: 0xffe066,
  danger: 0xff5a5a,
};

// Resource colours: Materials, Science, Money.
export const RES = {
  M: { color: 0xc9783a, dark: 0x6b3f1c, name: 'Materials' },
  S: { color: 0xff7ab8, dark: 0x8a2f5d, name: 'Science' },
  $: { color: 0xf5d142, dark: 0x8a7312, name: 'Money' },
};

export const DIE_COLORS = { yellow: 0xf5d142, orange: 0xff8c2b, blue: 0x4aa3ff, red: 0xff4d4d };

export const RING_COLORS = {
  GC: { fill: 0x2a1650, edge: 0xb48cff },
  START: { fill: 0x16263f, edge: 0x6f93c8 },
  GUARD: { fill: 0x3a1a22, edge: 0xd9708a },
  I: { fill: 0x123a3a, edge: 0x4fc7b3 },
  II: { fill: 0x15294f, edge: 0x5e92e6 },
  III: { fill: 0x241a4a, edge: 0x8f7be0 },
};

// Size (circumradius) of a sector hexagon on the map.
export const HEX = 118;
