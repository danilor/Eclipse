import { COLORS, RECT, W } from '../config.js';
import { Button, clamp, label } from './kit.js';

const TEXT_W = 520;
const BTN_X = 556;
const BTN_W = 940;
const FREE_X = 1516;

// Bottom strip: what the game wants from the player, the answer buttons and the free actions.
export class PromptBar {
  constructor(scene) {
    this.scene = scene;
    this.root = scene.add.container(0, RECT.bottom.y).setDepth(200);
    const bg = scene.add.graphics();
    bg.fillStyle(0x0b1224, 1);
    bg.fillRect(0, 0, W, RECT.bottom.h);
    bg.lineStyle(2, COLORS.gold, 0.7);
    bg.lineBetween(0, 1, W, 1);
    bg.lineStyle(1, COLORS.panelLine, 1);
    bg.lineBetween(BTN_X - 12, 14, BTN_X - 12, RECT.bottom.h - 14);
    bg.lineBetween(FREE_X - 12, 14, FREE_X - 12, RECT.bottom.h - 14);
    this.root.add(bg);
    this.title = label(scene, 18, 12, '', { size: 21, bold: true, color: COLORS.goldText, wrap: TEXT_W });
    this.hint = label(scene, 18, 44, '', { size: 14, wrap: TEXT_W, spacing: 2 });
    this.root.add([this.title, this.hint]);
    this.buttons = [];
    this.free = [];
  }

  // spec: {title, hint, buttons:[{text,fn,enabled,tip,fill,textColor,w}], free:[{text,fn,enabled,tip,fill}]}
  set({ title = '', hint = '', buttons = [], free = [] } = {}) {
    this.clearButtons();
    this.title.setText(title);
    this.hint.setText(hint);
    this.hint.setFontSize(14);
    for (let size = 14; size >= 11 && this.hint.height > RECT.bottom.h - 52; size--) this.hint.setFontSize(size);
    this.layout(buttons);
    this.layoutFree(free);
    return this;
  }

  clearButtons() {
    for (const b of [...this.buttons, ...this.free]) b.destroy();
    this.buttons = [];
    this.free = [];
  }

  clear() {
    this.set({ title: '', hint: '' });
  }

  widthOf(b) {
    if (b.w) return b.w;
    const longest = Math.max(...String(b.text).split('\n').map((l) => l.length));
    return clamp(longest * 9.6 + 32, 96, 260);
  }

  layout(buttons) {
    if (!buttons.length) return;
    const H = 50;
    const GAP = 8;
    const rows = [[]];
    let used = 0;
    for (const b of buttons) {
      const w = this.widthOf(b);
      if (used + w > BTN_W && rows[rows.length - 1].length) {
        rows.push([]);
        used = 0;
      }
      rows[rows.length - 1].push({ b, w });
      used += w + GAP;
    }
    const total = rows.length * H + (rows.length - 1) * GAP;
    let y = (RECT.bottom.h - total) / 2;
    for (const row of rows) {
      const width = row.reduce((a, r) => a + r.w, 0) + (row.length - 1) * GAP;
      let x = BTN_X + (BTN_W - width) / 2;
      for (const { b, w } of row) {
        const btn = new Button(this.scene, x, y, w, H, b.text, b.fn, { size: b.size ?? 16, fill: b.fill ?? 0x22335c, textColor: b.textColor ?? COLORS.text, tip: b.tip, line: b.line ?? 0x4a62a3 });
        btn.setEnabled(b.enabled !== false);
        this.root.add(btn);
        this.buttons.push(btn);
        x += w + GAP;
      }
      y += H + GAP;
    }
  }

  layoutFree(free) {
    const n = free.length;
    if (!n) return;
    const H = 44;
    const GAP = 8;
    const total = n * H + (n - 1) * GAP;
    let y = (RECT.bottom.h - total) / 2;
    for (const f of free) {
      const btn = new Button(this.scene, FREE_X, y, W - FREE_X - 14, H, f.text, f.fn, { size: 16, fill: f.fill ?? 0x2a3358, tip: f.tip, textColor: f.textColor ?? COLORS.text });
      btn.setEnabled(f.enabled !== false);
      this.root.add(btn);
      this.free.push(btn);
      y += H + GAP;
    }
  }

  destroy() {
    this.root.destroy();
  }
}
