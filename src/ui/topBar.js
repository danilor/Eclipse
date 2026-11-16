import { COLORS, W } from '../config.js';
import { ROUNDS } from '../data/constants.js';
import { SPECIES } from '../data/species.js';
import { Button, css, label } from './kit.js';
import { PHASE_NAMES } from './names.js';
import { SPEEDS, saveSettings, settings } from './settings.js';

const SPEED_LABELS = { slow: 'Slow', normal: 'Normal', fast: 'Fast', instant: 'Instant' };

// Header strip: round / phase / turn indicator plus the global controls.
export class TopBar {
  constructor(scene, game, { onTechs, onHelp, onMenu, onSettingsChanged } = {}) {
    this.scene = scene;
    this.game = game;
    this.root = scene.add.container(0, 0).setDepth(120);
    const bg = scene.add.graphics();
    bg.fillStyle(0x0b1224, 1);
    bg.fillRect(0, 0, W, 56);
    bg.lineStyle(2, COLORS.panelLine, 1);
    bg.lineBetween(0, 55, W, 55);
    this.root.add(bg);
    this.pips = scene.add.graphics();
    this.root.add(this.pips);

    const add = (x, y, str, o) => {
      const t = label(scene, x, y, str, o);
      this.root.add(t);
      return t;
    };
    add(18, 6, 'ECLIPSE', { size: 28, bold: true, color: COLORS.goldText });
    add(20, 38, 'Second Dawn for the Galaxy', { size: 11, color: COLORS.muted });
    add(310, 7, 'ROUND', { size: 11, bold: true, color: COLORS.muted });
    this.round = add(310, 19, '', { size: 26, bold: true });
    this.phase = add(500, 8, '', { size: 18, bold: true, color: '#9fd0ff' });
    this.turn = add(500, 31, '', { size: 14, color: COLORS.muted });
    this.start = add(740, 8, '', { size: 14, color: COLORS.muted });
    this.mode = add(740, 31, '', { size: 14, color: COLORS.muted });

    let x = W - 12;
    const place = (w, text, fn, o) => {
      x -= w;
      const b = new Button(scene, x, 12, w, 32, text, fn, { size: 15, ...o });
      this.root.add(b);
      x -= 8;
      return b;
    };
    place(78, 'Menu', () => onMenu?.(), { tip: 'Return to the main menu. The game is saved automatically.' });
    place(78, 'Help', () => onHelp?.(), { tip: 'How the game flows and what the colours mean.' });
    place(112, 'Tech tray', () => onTechs?.(), { tip: 'See every technology still available in the Technology Tray.' });
    x -= 12;
    this.speedButtons = {};
    for (const key of Object.keys(SPEEDS).reverse()) {
      this.speedButtons[key] = place(66, SPEED_LABELS[key], () => {
        settings.speed = key;
        saveSettings();
        this.paintSettings();
        onSettingsChanged?.();
      }, { size: 14, tip: 'Pause between computer moves.' });
    }
    add(x - 66, 18, 'AI speed', { size: 14, color: COLORS.muted });
    x -= 84;
    this.skip = place(190, '', () => {
      settings.skipReactions = !settings.skipReactions;
      saveSettings();
      this.paintSettings();
      onSettingsChanged?.();
    }, { size: 14, tip: 'When on, you are not asked to react (Upgrade / Build / Move) during the computer\u2019s turns after you have passed.' });
    this.paintSettings();
    this.update();
  }

  paintSettings() {
    for (const [key, b] of Object.entries(this.speedButtons)) b.setFill(key === settings.speed ? 0x2f6b4a : 0x22335c);
    this.skip.setText(`Skip reactions: ${settings.skipReactions ? 'ON' : 'OFF'}`);
    this.skip.setFill(settings.skipReactions ? 0x2f6b4a : 0x22335c);
  }

  update() {
    const s = this.game.state;
    this.round.setText(`${Math.min(s.round, ROUNDS)} / ${ROUNDS}`);
    this.phase.setText(PHASE_NAMES[s.phase] ?? s.phase);
    const d = this.game.decision;
    const p = d ? s.players[d.playerId] : null;
    if (!d) this.turn.setText('The game is over');
    else if (p.kind === 'human') this.turn.setText('Your turn');
    else this.turn.setText(`${p.name} is thinking\u2026`);
    this.turn.setColor(d && p.kind === 'human' ? '#6ee7a0' : COLORS.muted);
    const sp = s.players[s.startPlayer];
    this.start.setText(sp ? `Start player: ${sp.name}` : '');
    this.start.setColor(sp ? css(SPECIES[sp.species].color) : COLORS.muted);
    this.mode.setText(s.players.length > 2 ? `${s.players.length} players` : 'Duel \u00b7 1 vs 1');

    const g = this.pips;
    g.clear();
    for (let i = 0; i < ROUNDS; i++) {
      const cx = 400 + i * 12;
      const done = i + 1 < s.round;
      const now = i + 1 === s.round;
      g.fillStyle(now ? COLORS.gold : done ? 0x4c5f94 : 0x1c2744, 1);
      g.fillCircle(cx, 44, now ? 5 : 4);
    }
  }

  destroy() {
    this.root.destroy();
  }
}
