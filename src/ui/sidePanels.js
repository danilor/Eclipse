import { COLORS, RECT } from '../config.js';
import { SPECIES } from '../data/species.js';
import { scoreBreakdown } from '../core/queries.js';
import { drawBox, css, label } from './kit.js';

const X = RECT.right.x + 6;
const W = RECT.right.w - 12;
const SCORE_Y = RECT.right.y + 4;
const SCORE_H = 124;
const INFO_Y = SCORE_Y + SCORE_H + 6;
const INFO_H = 290;
const LOG_Y = INFO_Y + INFO_H + 6;
const LOG_H = RECT.right.y + RECT.right.h - LOG_Y - 4;

// Right-hand column: victory points, hover information and the event log.
export class RightColumn {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.root = scene.add.container(0, 0).setDepth(100);
    const bg = scene.add.graphics();
    bg.fillStyle(COLORS.bg, 1);
    bg.fillRect(RECT.right.x, RECT.right.y, RECT.right.w, RECT.right.h);
    drawBox(bg, X, SCORE_Y, W, SCORE_H, { fill: COLORS.panel, line: COLORS.panelLine, radius: 9 });
    drawBox(bg, X, INFO_Y, W, INFO_H, { fill: COLORS.panel, line: COLORS.panelLine, radius: 9 });
    drawBox(bg, X, LOG_Y, W, LOG_H, { fill: COLORS.panel, line: COLORS.panelLine, radius: 9 });
    this.root.add(bg);
    this.gfx = scene.add.graphics();
    this.root.add(this.gfx);

    this.add(X + 10, SCORE_Y + 6, 'VICTORY POINTS', { size: 12, bold: true, color: COLORS.muted });
    this.rows = game.state.players.map((p, i) => ({
      name: this.add(X + 40, SCORE_Y + 24 + i * 48, '', { size: 16, bold: true }),
      tag: this.add(X + 40, SCORE_Y + 44 + i * 48, '', { size: 11, color: COLORS.muted, wrap: W - 96 }),
      total: this.add(X + W - 12, SCORE_Y + 22 + i * 48, '', { size: 26, bold: true, origin: [1, 0], color: COLORS.goldText }),
    }));
    this.infoTitle = this.add(X + 12, INFO_Y + 8, '', { size: 17, bold: true, color: COLORS.goldText, wrap: W - 24 });
    this.infoBody = this.add(X + 12, INFO_Y + 34, '', { size: 14, wrap: W - 24, spacing: 2 });
    this.add(X + 10, LOG_Y + 6, 'EVENT LOG', { size: 12, bold: true, color: COLORS.muted });
    this.add(X + W - 10, LOG_Y + 6, 'scroll with the mouse wheel', { size: 11, color: COLORS.dim, origin: [1, 0] });

    this.logTexts = new Map();
    this.logScroll = 0;
    this.logSeen = 0;
    this.lastEntry = null;
    this.onWheel = (pointer, _objs, _dx, dy) => {
      if (this.scene.modals?.size) return;
      if (pointer.x < X || pointer.x > X + W || pointer.y < LOG_Y || pointer.y > LOG_Y + LOG_H) return;
      const total = this.game.state.log.length;
      this.logScroll = Math.max(0, Math.min(total - 1, this.logScroll + Math.sign(dy) * -2));
      this.layoutLog();
    };
    scene.input.on('wheel', this.onWheel);
    this.show(null);
  }

  add(x, y, str, o) {
    const t = label(this.scene, x, y, str, o);
    this.root.add(t);
    return t;
  }

  // ---------------------------------------------------------------- scores

  update() {
    const s = this.game.state;
    const g = this.gfx;
    g.clear();
    const d = this.game.decision;
    s.players.forEach((p, i) => {
      const row = this.rows[i];
      const sp = SPECIES[p.species];
      const sc = scoreBreakdown(s, p.id);
      const y = SCORE_Y + 24 + i * 48;
      g.fillStyle(sp.color, 1);
      g.fillCircle(X + 20, y + 13, 8);
      if (d && d.playerId === p.id) {
        g.lineStyle(3, COLORS.gold, 1);
        g.strokeCircle(X + 20, y + 13, 12);
      }
      row.name.setText(`${p.name}${p.kind === 'human' ? ' (you)' : ''}`);
      row.name.setColor(css(sp.color));
      row.total.setText(String(sc.total));
      row.tag.setText(
        `Reputation ${sc.reputation} \u00b7 Sectors ${sc.sectors} \u00b7 Monoliths ${sc.monoliths} \u00b7 Discoveries ${sc.discoveries} \u00b7 Techs ${sc.techs}${sc.species ? ` \u00b7 Species ${sc.species}` : ''}`
      );
    });
    this.refreshLog();
  }

  // ---------------------------------------------------------------- info box

  show(text) {
    const str = text ?? 'Hover over a sector, ship part, technology or button to see details here.';
    const cut = str.indexOf('\n');
    const title = text && cut > 0 ? str.slice(0, cut) : '';
    const body = text && cut > 0 ? str.slice(cut + 1) : str;
    this.infoTitle.setText(title);
    this.infoTitle.setVisible(!!title);
    this.infoBody.setY(INFO_Y + (title ? 36 + (this.infoTitle.height > 24 ? this.infoTitle.height - 22 : 0) : 10));
    this.infoBody.setColor(text ? COLORS.text : COLORS.muted);
    this.infoBody.setText(body);
    const room = INFO_Y + INFO_H - 8 - this.infoBody.y;
    for (let size = 14; size >= 10; size--) {
      this.infoBody.setFontSize(size);
      if (this.infoBody.height <= room) break;
    }
  }

  // ---------------------------------------------------------------- log

  // Texts are cached per log entry (not per index) because the engine trims the oldest entries once the log is full.
  refreshLog() {
    const log = this.game.state.log;
    const last = log[log.length - 1] ?? null;
    if (last !== this.lastEntry || log.length !== this.logSeen) {
      const at = this.lastEntry ? log.lastIndexOf(this.lastEntry) : -1;
      if (at < 0) {
        for (const t of this.logTexts.values()) t.destroy();
        this.logTexts.clear();
        this.logScroll = 0;
      } else if (this.logScroll > 0) {
        this.logScroll += log.length - 1 - at;
      }
      this.lastEntry = last;
      this.logSeen = log.length;
    }
    this.logScroll = Math.max(0, Math.min(log.length - 1, this.logScroll));
    this.layoutLog();
  }

  logColor(entry) {
    const text = entry.t;
    if (text.startsWith('---')) return COLORS.goldText;
    const s = this.game.state;
    for (const p of s.players) if (text.startsWith(p.name)) return css(SPECIES[p.species].color);
    return '#c4cde4';
  }

  makeLogText(e) {
    const header = e.t.startsWith('---');
    const t = label(this.scene, X + 12, 0, header ? e.t.replace(/-/g, '').trim().toUpperCase() : e.t, {
      size: 13,
      bold: header,
      color: this.logColor(e),
      wrap: W - 28,
      spacing: 1,
    });
    this.root.add(t);
    this.logTexts.set(e, t);
    return t;
  }

  layoutLog() {
    const log = this.game.state.log;
    const needed = new Set();
    let y = LOG_Y + LOG_H - 8;
    const top = LOG_Y + 26;
    for (let i = log.length - 1 - this.logScroll; i >= 0 && y >= top; i--) {
      const e = log[i];
      const t = this.logTexts.get(e) ?? this.makeLogText(e);
      y -= t.height + 3;
      t.setPosition(X + 12, y);
      t.setVisible(y >= top);
      needed.add(e);
    }
    for (const [e, t] of this.logTexts) {
      if (!needed.has(e)) {
        t.destroy();
        this.logTexts.delete(e);
      }
    }
  }

  destroy() {
    this.scene.input.off('wheel', this.onWheel);
    this.root.destroy();
  }
}

export const RIGHT_LOG_RECT = { x: X, y: LOG_Y, w: W, h: LOG_H };
