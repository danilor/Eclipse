import Phaser from 'phaser';
import { COLORS, H, W } from '../config.js';
import { EXTRA_SPRITES, MODEL_SETS, SHIP_SPRITES } from '../ui/names.js';
import { label } from '../ui/kit.js';
import { matchConfig, urlOptions } from '../app/session.js';
import { SPECIES_LIST } from '../data/species.js';
import { SPEEDS, settings } from '../ui/settings.js';

// Loads the pre-rendered ship sprites (see tools/render_models.py) and builds the few textures that are
// drawn procedurally, then hands over to the menu (or straight to a match when the URL asks for it).
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    this.cameras.main.setBackgroundColor(COLORS.bg);
    label(this, W / 2, H / 2 - 40, 'ECLIPSE', { size: 54, bold: true, origin: [0.5, 0.5], color: COLORS.goldText });
    const bar = this.add.graphics();
    const text = label(this, W / 2, H / 2 + 40, 'Loading ship models\u2026', { size: 18, origin: [0.5, 0.5], color: COLORS.muted });
    this.load.on('progress', (v) => {
      bar.clear();
      bar.fillStyle(0x16203a, 1);
      bar.fillRoundedRect(W / 2 - 220, H / 2 + 6, 440, 14, 7);
      bar.fillStyle(COLORS.gold, 1);
      bar.fillRoundedRect(W / 2 - 220, H / 2 + 6, 440 * v, 14, 7);
    });
    this.load.on('loaderror', (file) => text.setText(`Could not load ${file.key}`));

    this.load.setPath('assets/models/');
    for (const set of MODEL_SETS) for (const type of SHIP_SPRITES) this.load.image(`${set}-${type}`, `${set}-${type}.png`);
    for (const key of EXTRA_SPRITES) this.load.image(key, `${key}.png`);
  }

  create() {
    this.makeGcds();
    const opts = urlOptions();
    if (opts.speed && opts.speed in SPEEDS) settings.speed = opts.speed;
    if (opts.quick) {
      const seed = opts.seed ?? 1;
      const pick = (id, fallback) => SPECIES_LIST.find((s) => s.id === id)?.id ?? fallback;
      const human = pick(opts.species, 'terran-federation');
      let rival = pick(opts.versus, 'planta');
      if (rival === human) rival = SPECIES_LIST.find((s) => s.id !== human).id;
      const config = matchConfig({ seed, human, opponents: [{ species: rival, ai: opts.ai ?? 'heuristic' }] });
      this.scene.start('Game', { config, autoplay: opts.autoplay });
      return;
    }
    this.scene.start('Menu');
  }

  // The Galactic Center Defense System has no 3D model in the box, so it is drawn here (and tinted by the map).
  makeGcds() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    const c = 64;
    g.fillStyle(0xb9bfcc, 1);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const at = (r, d) => ({ x: c + Math.cos(a + d) * r, y: c + Math.sin(a + d) * r });
      const tip = at(60, 0);
      const l = at(34, -0.24);
      const r = at(34, 0.24);
      g.fillTriangle(tip.x, tip.y, l.x, l.y, r.x, r.y);
    }
    g.fillStyle(0x8e95a6, 1);
    g.fillCircle(c, c, 35);
    g.fillStyle(0xdfe3ec, 1);
    g.fillCircle(c, c, 27);
    g.lineStyle(4, 0x6b7285, 1);
    g.strokeCircle(c, c, 27);
    g.fillStyle(0x59607a, 1);
    g.fillCircle(c, c, 13);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(c - 4, c - 4, 4);
    g.generateTexture('gcds', 128, 128);
    g.destroy();
  }
}
