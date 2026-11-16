import Phaser from 'phaser';
import { COLORS, FONT, H, W, DIE_COLORS } from '../config.js';

export const css = (n) => `#${n.toString(16).padStart(6, '0')}`;

export const lighten = (color, amount) => {
  const c = Phaser.Display.Color.IntegerToColor(color);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + (amount >= 0 ? (255 - v) * amount : v * amount))));
  return Phaser.Display.Color.GetColor(f(c.red), f(c.green), f(c.blue));
};

// Text factory with the shared font, crisp resolution and a small option bag.
export function label(scene, x, y, str, o = {}) {
  const { size = 16, color = COLORS.text, bold = false, align = 'left', origin = [0, 0], wrap, stroke, thickness = 0, spacing } = o;
  const t = scene.add.text(x, y, String(str), {
    fontFamily: FONT,
    fontSize: `${size}px`,
    fontStyle: bold ? 'bold' : 'normal',
    color: typeof color === 'number' ? css(color) : color,
    align,
    wordWrap: wrap ? { width: wrap } : undefined,
    stroke: stroke === undefined ? undefined : typeof stroke === 'number' ? css(stroke) : stroke,
    strokeThickness: thickness,
    resolution: 2,
  });
  t.setOrigin(origin[0], origin[1]);
  if (spacing) t.setLineSpacing(spacing);
  return t;
}

export function drawBox(g, x, y, w, h, { fill = COLORS.panel, alpha = 1, line = COLORS.panelLine, lineWidth = 2, radius = 10 } = {}) {
  g.fillStyle(fill, alpha);
  g.fillRoundedRect(x, y, w, h, radius);
  if (line !== null) {
    g.lineStyle(lineWidth, line, 1);
    g.strokeRoundedRect(x, y, w, h, radius);
  }
  return g;
}

export function panelBox(scene, x, y, w, h, o = {}) {
  return drawBox(scene.add.graphics(), x, y, w, h, o);
}

// An object destroyed under the pointer (a rebuilt prompt, a closed dialog) never gets a pointerout, so it has to
// hand the info box back itself; otherwise its stale tooltip would hide every later sector hover.
export function releaseTipOnDestroy(scene, obj, isOver) {
  obj.once('destroy', () => {
    if (scene.sys?.isActive() && isOver()) scene.events.emit('tip', null);
  });
}

export class Button extends Phaser.GameObjects.Container {
  constructor(scene, x, y, w, h, text, onClick, o = {}) {
    super(scene, x, y);
    this.w = w;
    this.h = h;
    this.onClick = onClick;
    this.o = { size: 18, fill: 0x22335c, textColor: COLORS.text, radius: 9, bold: true, line: 0x4a62a3, ...o };
    this.isEnabled = true;
    this.hover = false;
    this.pressed = false;
    this.tip = o.tip ?? null;
    this.bg = scene.add.graphics();
    this.txt = label(scene, w / 2, h / 2, text, {
      size: this.o.size,
      bold: this.o.bold,
      color: this.o.textColor,
      align: 'center',
      origin: [0.5, 0.5],
      wrap: w - 14,
    });
    this.hit = scene.add.rectangle(w / 2, h / 2, w, h, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    this.add([this.bg, this.txt, this.hit]);
    this.hit.on('pointerover', () => {
      this.hover = true;
      this.redraw();
      if (this.tip) scene.events.emit('tip', this.tip);
    });
    this.hit.on('pointerout', () => {
      this.hover = false;
      this.pressed = false;
      this.redraw();
      if (this.tip) scene.events.emit('tip', null);
    });
    this.hit.on('pointerdown', () => {
      this.pressed = true;
      this.redraw();
    });
    this.hit.on('pointerup', () => {
      const was = this.pressed;
      this.pressed = false;
      this.redraw();
      if (was && this.isEnabled) this.onClick?.(this);
    });
    releaseTipOnDestroy(scene, this.hit, () => this.hover && this.tip);
    this.redraw();
    scene.add.existing(this);
  }

  redraw() {
    const { fill, line, radius, textColor } = this.o;
    const g = this.bg;
    g.clear();
    if (!this.isEnabled) {
      drawBox(g, 0, 0, this.w, this.h, { fill: 0x161d30, line: 0x252f4a, radius });
      this.txt.setColor(COLORS.dim);
      return;
    }
    const base = this.pressed ? lighten(fill, -0.25) : this.hover ? lighten(fill, 0.22) : fill;
    drawBox(g, 0, 0, this.w, this.h, { fill: base, line: this.hover ? COLORS.gold : line, radius, lineWidth: this.hover ? 3 : 2 });
    this.txt.setColor(typeof textColor === 'number' ? css(textColor) : textColor);
  }

  setEnabled(on) {
    this.isEnabled = on;
    this.hit.input.cursor = on ? 'pointer' : 'default';
    this.redraw();
    return this;
  }

  setText(str) {
    this.txt.setText(String(str));
    return this;
  }

  setFill(color) {
    this.o.fill = color;
    this.redraw();
    return this;
  }
}

// A centred dialog over a dimmed, input-blocking backdrop. Content goes into `body` (panel coordinates).
export class Modal extends Phaser.GameObjects.Container {
  constructor(scene, { title = '', w = 900, h = 600, closable = true, onClose = null, depth = 300 } = {}) {
    super(scene, 0, 0);
    this.setDepth(depth);
    this.w = w;
    this.h = h;
    this.onClose = onClose;
    this.blocker = scene.add.rectangle(W / 2, H / 2, W, H, 0x02040a, 0.66).setInteractive();
    this.frame = panelBox(scene, (W - w) / 2, (H - h) / 2, w, h, { fill: 0x0f1729, line: COLORS.gold, lineWidth: 2, radius: 14 });
    this.body = scene.add.container((W - w) / 2, (H - h) / 2);
    this.titleText = label(scene, W / 2, (H - h) / 2 + 22, title, { size: 26, bold: true, origin: [0.5, 0.5], color: COLORS.goldText });
    this.add([this.blocker, this.frame, this.titleText, this.body]);
    if (closable) {
      this.closeBtn = new Button(scene, (W + w) / 2 - 46, (H - h) / 2 + 8, 36, 30, 'X', () => this.close(), { size: 16 });
      this.add(this.closeBtn);
    }
    scene.add.existing(this);
    (scene.modals ||= new Set()).add(this);
  }

  close() {
    if (!this.scene) return;
    this.scene.modals?.delete(this);
    const cb = this.onClose;
    this.destroy();
    cb?.();
  }
}

// Short floating message near the top of the map area.
export function toast(scene, text, { color = COLORS.text, y = 90, duration = 1800, size = 22 } = {}) {
  const t = label(scene, W / 2, y, text, { size, bold: true, color, origin: [0.5, 0.5], align: 'center', stroke: 0x000000, thickness: 5 });
  t.setDepth(450);
  scene.tweens.add({ targets: t, y: y - 24, alpha: 0, delay: duration * 0.55, duration: duration * 0.45, onComplete: () => t.destroy() });
  return t;
}

const PIPS = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

// Six-sided die face; `hit` false dims it.
export function dieFace(scene, x, y, size, colorName, roll, hit = true) {
  const g = scene.add.graphics({ x, y });
  const fill = DIE_COLORS[colorName] ?? 0xffffff;
  drawBox(g, -size / 2, -size / 2, size, size, { fill, alpha: hit ? 1 : 0.28, line: hit ? 0x101420 : 0x33405f, lineWidth: 2, radius: size * 0.2 });
  g.fillStyle(0x101420, hit ? 1 : 0.5);
  const step = size * 0.26;
  for (const [px, py] of PIPS[roll] || []) g.fillCircle(px * step, py * step, size * 0.085);
  return g;
}

export function wait(scene, ms) {
  return new Promise((resolve) => {
    if (ms <= 0) resolve();
    else scene.time.delayedCall(ms, resolve);
  });
}

// Invisible interactive area that shows a tooltip in the info box while hovered. `tip` may be a function.
export function hoverZone(scene, parent, x, y, w, h, tip) {
  const r = scene.add.rectangle(x + w / 2, y + h / 2, w, h, 0xffffff, 0.001).setInteractive();
  let over = false;
  r.on('pointerover', () => {
    over = true;
    scene.events.emit('tip', typeof tip === 'function' ? tip() : tip);
  });
  r.on('pointerout', () => {
    over = false;
    scene.events.emit('tip', null);
  });
  releaseTipOnDestroy(scene, r, () => over);
  parent?.add(r);
  return r;
}

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
