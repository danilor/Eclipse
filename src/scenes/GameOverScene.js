import Phaser from 'phaser';
import { COLORS, H, W } from '../config.js';
import { clearSave } from '../app/session.js';
import { SPECIES } from '../data/species.js';
import { Button, css, drawBox, label } from '../ui/kit.js';

const ROWS = [
  ['Reputation tiles', 'reputation'],
  ['Sectors controlled', 'sectors'],
  ['Monoliths', 'monoliths'],
  ['Discovery tiles kept', 'discoveries'],
  ['Technology tracks', 'techs'],
  ['Species bonus', 'species'],
];

// Final standings of a finished match.
export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  init(data) {
    this.result = data ?? {};
  }

  create() {
    const engine = this.result.game;
    const s = engine.state;
    clearSave();
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.stars();

    const human = s.players.find((p) => p.kind === 'human');
    const winner = s.winner == null ? null : s.players[s.winner];
    const won = winner && human && winner.id === human.id;
    const headline = !winner ? 'NO WINNER' : !human ? 'GAME OVER' : won ? 'VICTORY' : 'DEFEAT';
    label(this, W / 2, 80, headline, {
      size: 88,
      bold: true,
      origin: [0.5, 0.5],
      color: won ? COLORS.goldText : winner ? '#ff8a8a' : COLORS.muted,
      stroke: 0x0a0a14,
      thickness: 8,
    });
    const scores = s.finalScores ?? s.players.map((p) => ({ id: p.id, total: 0, storage: 0 }));
    const sub = !winner
      ? 'The galaxy was left without a clear ruler.'
      : s.players.every((p) => !p.eliminated)
        ? `${winner.name} wins with ${scores.find((x) => x.id === winner.id).total} Victory Points.`
        : `${winner.name} is the last empire standing.`;
    label(this, W / 2, 152, sub, { size: 28, origin: [0.5, 0.5], color: winner ? css(SPECIES[winner.species].color) : COLORS.text });

    this.table(s, scores, winner);

    const again = () => {
      const cfg = engine.config;
      this.scene.start('Game', {
        config: { ...cfg, seed: Phaser.Math.Between(1, 999999), players: cfg.players.map((p) => ({ ...p })), options: { ...cfg.options } },
        autoplay: this.result.autoplay,
      });
    };
    new Button(this, W / 2 - 330, 880, 320, 64, 'Play again', again, { size: 24, fill: 0x2f6b4a, line: COLORS.gold });
    new Button(this, W / 2 + 10, 880, 320, 64, 'Main menu', () => this.scene.start('Menu'), { size: 24 });
    label(this, W / 2, 970, `Rounds played: ${Math.min(s.round, 8)} \u00b7 Galaxy seed: ${engine.config.seed} \u00b7 Moves recorded: ${engine.cmdLog.length}`, {
      size: 15,
      origin: [0.5, 0.5],
      color: COLORS.dim,
    });
    window.__eclipseResult = { winner: s.winner, scores };
  }

  stars() {
    const g = this.add.graphics();
    for (let i = 0; i < 240; i++) {
      g.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.1, 0.75));
      g.fillCircle(Phaser.Math.Between(0, W), Phaser.Math.Between(0, H), Phaser.Math.FloatBetween(0.5, 1.6));
    }
  }

  table(s, scores, winner) {
    const n = s.players.length;
    const x0 = 360;
    const w = W - 2 * x0;
    const labelW = 420;
    const colW = (w - labelW) / n;
    const y0 = 215;
    const rowH = 56;
    const rows = [...ROWS.filter(([, key]) => scores.some((sc) => sc[key])), ['TOTAL', 'total'], ['Resources left (tie-breaker)', 'storage']];
    const g = this.add.graphics();
    const height = 92 + rows.length * rowH + 10;
    drawBox(g, x0, y0, w, height, { fill: 0x0d1427, alpha: 0.95, line: COLORS.panelLine, radius: 14 });

    s.players.forEach((p, i) => {
      const sp = SPECIES[p.species];
      const cx = x0 + labelW + colW * (i + 0.5);
      if (winner && winner.id === p.id) {
        g.lineStyle(3, COLORS.gold, 1);
        g.strokeRoundedRect(x0 + labelW + colW * i + 6, y0 + 6, colW - 12, height - 12, 12);
        label(this, cx, y0 + 74, 'WINNER', { size: 13, bold: true, origin: [0.5, 0.5], color: COLORS.goldText });
      }
      g.fillStyle(sp.color, 1);
      g.fillCircle(cx - Math.min(150, colW / 2 - 30), y0 + 36, 12);
      label(this, cx + 10, y0 + 36, `${p.name}${p.kind === 'human' ? ' (you)' : ''}`, {
        size: 22,
        bold: true,
        origin: [0.5, 0.5],
        color: css(sp.color),
        wrap: colW - 60,
        align: 'center',
      });
      if (p.eliminated) label(this, cx, y0 + 74, 'Eliminated', { size: 13, origin: [0.5, 0.5], color: '#ff8a8a' });
    });

    rows.forEach(([name, key], r) => {
      const y = y0 + 92 + r * rowH;
      const total = key === 'total';
      if (total) {
        g.fillStyle(0x1a2646, 1);
        g.fillRect(x0 + 8, y, w - 16, rowH - 4);
      } else if (r % 2 === 0) {
        g.fillStyle(0xffffff, 0.03);
        g.fillRect(x0 + 8, y, w - 16, rowH - 4);
      }
      label(this, x0 + 28, y + rowH / 2 - 2, name, { size: total ? 26 : 20, bold: total, origin: [0, 0.5], color: key === 'storage' ? COLORS.muted : COLORS.text });
      s.players.forEach((p, i) => {
        const sc = scores.find((x) => x.id === p.id);
        const v = sc?.[key] ?? 0;
        label(this, x0 + labelW + colW * (i + 0.5), y + rowH / 2 - 2, `${v}`, {
          size: total ? 34 : 22,
          bold: total,
          origin: [0.5, 0.5],
          color: total ? COLORS.goldText : key === 'storage' ? COLORS.muted : COLORS.text,
        });
      });
    });
  }
}
