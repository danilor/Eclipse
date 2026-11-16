import Phaser from 'phaser';
import { COLORS, DIE_COLORS } from '../config.js';
import { PARTS } from '../data/parts.js';
import { label } from './kit.js';
import { describePart, signed } from './names.js';

const GLYPHS = {
  bolt: [[0.12, -0.5], [-0.3, 0.08], [-0.02, 0.08], [-0.14, 0.5], [0.3, -0.12], [0.04, -0.12]],
  shield: [[-0.42, -0.4], [0.42, -0.4], [0.42, 0.06], [0, 0.5], [-0.42, 0.06]],
  arrow: [[-0.5, -0.15], [0.08, -0.15], [0.08, -0.42], [0.54, 0], [0.08, 0.42], [0.08, 0.15], [-0.5, 0.15]],
  hull: Array.from({ length: 6 }, (_, i) => [0.48 * Math.cos((Math.PI / 3) * i), 0.48 * Math.sin((Math.PI / 3) * i)]),
  chip: [[-0.4, -0.4], [0.4, -0.4], [0.4, 0.4], [-0.4, 0.4]],
};

const GLYPH_COLOR = { shield: 0x4aa3ff, computer: 0x59d98e, hull: 0xaab4c8, drive: 0xff9f43, source: 0xf5d142 };

function poly(g, name, cx, cy, s, fill, outline = 0x05070d) {
  const pts = GLYPHS[name].map(([x, y]) => ({ x: cx + x * s, y: cy + y * s }));
  g.fillStyle(fill, 1);
  g.fillPoints(pts, true, true);
  g.lineStyle(1.5, outline, 1);
  g.strokePoints(pts, true, true);
}

export function mainKind(part) {
  if (Object.keys(part.dice).length) return 'cannon';
  if (Object.keys(part.missiles).length) return 'missile';
  if (part.shield) return 'shield';
  if (part.drive) return 'drive';
  if (part.hull) return 'hull';
  if (part.computer) return 'computer';
  return 'source';
}

// Draws the glyph of a part (no frame) centred on cx, cy. Returns the number to print over it, if any.
export function drawPartGlyph(g, part, cx, cy, size) {
  const kind = mainKind(part);
  const s = size * 0.62;
  if (kind === 'cannon' || kind === 'missile') {
    const colors = Object.entries(kind === 'cannon' ? part.dice : part.missiles).flatMap(([c, n]) => Array(n).fill(c));
    const n = colors.length;
    const d = n > 1 ? size * 0.3 : size * 0.4;
    colors.forEach((c, i) => {
      const x = cx + (i - (n - 1) / 2) * (d + 3);
      g.fillStyle(0x05070d, 1);
      if (kind === 'cannon') {
        g.fillRoundedRect(x - d / 2 - 2, cy - d / 2 - 2, d + 4, d + 4, 4);
        g.fillStyle(DIE_COLORS[c], 1);
        g.fillRoundedRect(x - d / 2, cy - d / 2, d, d, 3);
        g.fillStyle(0x05070d, 0.7);
        g.fillCircle(x, cy, d * 0.14);
      } else {
        const tri = [{ x, y: cy - d * 0.7 }, { x: x + d * 0.62, y: cy + d * 0.5 }, { x: x - d * 0.62, y: cy + d * 0.5 }];
        g.fillPoints(tri.map((p) => ({ x: p.x, y: p.y })), true, true);
        g.fillStyle(DIE_COLORS[c], 1);
        g.fillPoints(tri.map((p) => ({ x: x + (p.x - x) * 0.82, y: cy + (p.y - cy) * 0.82 })), true, true);
      }
    });
    return null;
  }
  const fill = GLYPH_COLOR[kind];
  if (kind === 'computer') {
    g.fillStyle(0x05070d, 1);
    for (const o of [-0.25, 0, 0.25]) {
      g.fillRect(cx + o * s - 1.5, cy - 0.58 * s, 3, 1.16 * s);
      g.fillRect(cx - 0.58 * s, cy + o * s - 1.5, 1.16 * s, 3);
    }
    poly(g, 'chip', cx, cy, s, fill);
    return signed(part.computer);
  }
  if (kind === 'shield') {
    poly(g, 'shield', cx, cy, s, fill);
    return String(part.shield);
  }
  if (kind === 'drive') {
    poly(g, 'arrow', cx, cy, s * 1.05, fill);
    return String(part.drive);
  }
  if (kind === 'hull') {
    poly(g, 'hull', cx, cy, s, fill);
    return String(part.hull);
  }
  poly(g, 'bolt', cx, cy, s * 1.1, fill);
  return `+${part.energy}`;
}

// Square slot showing a Ship Part (or an empty Ship Part space).
export class PartIcon extends Phaser.GameObjects.Container {
  constructor(scene, x, y, size = 40) {
    super(scene, x, y);
    this.size = size;
    this.tip = null;
    this.bg = scene.add.graphics();
    this.glyph = scene.add.graphics();
    this.num = label(scene, 0, 1, '', { size: Math.round(size * 0.36), bold: true, origin: [0.5, 0.5], color: '#05070d' });
    this.nrg = label(scene, size / 2 - 3, size / 2 - 2, '', { size: Math.round(size * 0.28), bold: true, origin: [1, 1], color: '#ff9d9d', stroke: '#05070d', thickness: 3 });
    this.hit = scene.add.rectangle(0, 0, size, size, 0xffffff, 0.001).setInteractive();
    this.hit.on('pointerover', () => {
      this.scene.events.emit('tip', this.tip);
      this.emit('over');
    });
    this.hit.on('pointerout', () => {
      this.scene.events.emit('tip', null);
      this.emit('out');
    });
    this.hit.on('pointerdown', (p) => this.emit('click', p));
    this.add([this.bg, this.glyph, this.num, this.nrg, this.hit]);
    scene.add.existing(this);
    this.setPart(null);
  }

  // opts: printed (pre-printed part), selected, dim, mark ('ok' | 'bad' | null)
  setPart(id, { printed = false, selected = false, dim = false, mark = null, extra = false } = {}) {
    const S = this.size;
    const h = S / 2;
    const part = id ? PARTS[id] : null;
    const bg = this.bg;
    const gl = this.glyph;
    bg.clear();
    gl.clear();
    this.setAlpha(dim ? 0.4 : 1);
    let border = 0x44527a;
    if (part) border = extra || part.kind === 'ancient' ? 0xb07cff : printed ? 0x6f7fa8 : COLORS.gold;
    bg.fillStyle(part ? 0x182240 : 0x0d1427, 1);
    bg.fillRoundedRect(-h, -h, S, S, 7);
    bg.lineStyle(part ? 2.5 : 1.5, border, part ? 1 : 0.7);
    bg.strokeRoundedRect(-h, -h, S, S, 7);
    if (selected) {
      bg.lineStyle(3, COLORS.highlight, 1);
      bg.strokeRoundedRect(-h - 3, -h - 3, S + 6, S + 6, 9);
    }
    if (mark) {
      bg.lineStyle(3, mark === 'ok' ? COLORS.good : COLORS.bad, 1);
      bg.strokeRoundedRect(-h - 2, -h - 2, S + 4, S + 4, 9);
    }
    this.num.setText('');
    this.nrg.setText('');
    if (!part) {
      gl.lineStyle(2, 0x44527a, 0.8);
      gl.lineBetween(-S * 0.14, 0, S * 0.14, 0);
      gl.lineBetween(0, -S * 0.14, 0, S * 0.14);
      this.tip = 'Empty Ship Part space.';
      return this;
    }
    const n = drawPartGlyph(gl, part, 0, 0, S);
    if (n) this.num.setText(n);
    if (part.energy < 0 && mainKind(part) !== 'source') this.nrg.setText(signed(part.energy));
    else if (part.energy > 0 && mainKind(part) !== 'source') this.nrg.setText(`+${part.energy}`).setColor('#ffe27a');
    if (part.energy < 0 || part.energy === 0) this.nrg.setColor('#ff9d9d');
    this.tip = `${part.name}\n${describePart(id)}${printed ? '\n(printed on the blueprint)' : ''}`;
    return this;
  }
}
