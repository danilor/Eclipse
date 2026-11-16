import Phaser from 'phaser';
import { COLORS, H, RES, W } from '../config.js';
import { listAIs } from '../ai/registry.js';
import { clearSave, describeSave, loadSave, matchConfig } from '../app/session.js';
import { Game } from '../core/game.js';
import { ACTIONS, RESOURCES } from '../data/constants.js';
import { SPECIES, SPECIES_LIST } from '../data/species.js';
import { TECHS } from '../data/techs.js';
import { choiceDialog, openHelp } from '../ui/dialogs.js';
import { Button, css, drawBox, label, toast } from '../ui/kit.js';
import { ACTION_INFO, MODEL_SET } from '../ui/names.js';
import { hexPoints } from '../ui/tileArt.js';

const CARD_W = 285;
const CARD_H = 90;
const CARD_GAP = 8;
const PANEL_Y = 215;
const PANEL_H = 634;
const PREFS_KEY = 'eclipse.menu.v1';

// One-line character of each species, shown on its card.
const BLURB = {
  'terran-federation': 'Balanced start. 3 Move Activations.',
  'terran-directorate': 'Balanced start. 3 Move Activations.',
  'terran-union': 'Balanced start. 3 Move Activations.',
  'terran-republic': 'Balanced start. 3 Move Activations.',
  'terran-conglomerate': 'Balanced start. 3 Move Activations.',
  'terran-alliance': 'Balanced start. 3 Move Activations.',
  eridani: 'Rich start (26 Money), fewer Discs.',
  hydran: 'Researchers: 2 Research Activations.',
  planta: 'Explorers: 2 Explore, 4 Colony Ships.',
  draco: 'Kin of the Ancients. Explore twice.',
  mechanema: 'Cheap ships, 3 Upgrade/Build.',
  orion: 'Warlike: starts with a Cruiser.',
};

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null');
    if (p && SPECIES[p.human] && SPECIES[p.rival] && p.human !== p.rival) return p;
  } catch {
    // ignore
  }
  return null;
}

class SpeciesCard extends Phaser.GameObjects.Container {
  constructor(scene, x, y, sp, { onPick, onFocus }) {
    super(scene, x, y);
    this.sp = sp;
    this.flags = { selected: false, taken: false, hover: false };
    this.bg = scene.add.graphics();
    const set = MODEL_SET[sp.id] ?? 'human';
    this.icon = scene.add.image(46, 46, `${set}-cruiser`).setScale(0.44).setTint(sp.color);
    this.title = label(scene, 84, 10, sp.name, { size: 17, bold: true, color: css(sp.color), wrap: CARD_W - 94 });
    this.tag = label(scene, 84, 32, sp.group === 'terran' ? 'Terran faction' : 'Alien species', { size: 12, color: COLORS.muted });
    this.blurb = label(scene, 84, 50, BLURB[sp.id] ?? '', { size: 12.5, color: '#b9c3de', wrap: CARD_W - 96, spacing: 1 });
    this.badge = label(scene, CARD_W - 10, 32, '', { size: 12, bold: true, origin: [1, 0], color: COLORS.goldText });
    this.hit = scene.add.rectangle(CARD_W / 2, CARD_H / 2, CARD_W, CARD_H, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    this.add([this.bg, this.icon, this.title, this.tag, this.blurb, this.badge, this.hit]);
    this.hit.on('pointerover', () => {
      this.flags.hover = true;
      this.paint();
      onFocus?.(sp.id, true);
    });
    this.hit.on('pointerout', () => {
      this.flags.hover = false;
      this.paint();
      onFocus?.(sp.id, false);
    });
    this.hit.on('pointerup', () => onPick?.(sp.id));
    this.paint();
    scene.add.existing(this);
  }

  set({ selected, taken, badge }) {
    Object.assign(this.flags, { selected, taken });
    this.badge.setText(badge ?? '');
    this.paint();
  }

  paint() {
    const { selected, taken, hover } = this.flags;
    const g = this.bg;
    g.clear();
    drawBox(g, 0, 0, CARD_W, CARD_H, {
      fill: selected ? 0x1f3158 : hover ? 0x1a2848 : 0x121c36,
      line: selected ? COLORS.gold : hover ? 0x6f86c8 : COLORS.panelLine,
      lineWidth: selected ? 3 : 2,
      radius: 10,
    });
    g.fillStyle(this.sp.color, 1);
    g.fillRoundedRect(4, 10, 5, CARD_H - 20, 2);
    const alpha = taken && !selected ? 0.5 : 1;
    for (const o of [this.icon, this.title, this.tag, this.blurb]) o.setAlpha(alpha);
  }
}

// Start screen: pick both species and the computer opponent, then begin (or resume) a match.
export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    this.modals = new Set();
    this.ais = listAIs();
    const prefs = loadPrefs();
    this.choice = prefs ?? { human: 'terran-federation', rival: 'planta' };
    this.choice.ai = this.ais.some((a) => a.id === prefs?.ai) ? prefs.ai : this.ais[0].id;
    this.focusId = this.choice.human;
    this.seedText = '';
    this.seedFocus = false;

    this.drawBackdrop();
    this.drawTitle();
    this.buildPickers();
    this.buildDetails();
    this.buildOpponentPanel();
    this.buildSeedPanel();
    this.buildStartPanel();
    this.refresh();

    this.input.keyboard.on('keydown', (e) => this.onKey(e));
    this.input.on('pointerdown', (_p, over) => {
      if (!over.includes(this.seedHit)) this.setSeedFocus(false);
    });
  }

  // ------------------------------------------------------------------ decoration

  drawBackdrop() {
    this.cameras.main.setBackgroundColor(COLORS.bg);
    const g = this.add.graphics();
    const blobs = [
      [320, 260, 0x3b2a7a],
      [1560, 760, 0x14506b],
      [980, 980, 0x5a1f4a],
    ];
    for (const [x, y, c] of blobs) {
      for (let r = 420; r > 40; r -= 40) {
        g.fillStyle(c, 0.018);
        g.fillCircle(x, y, r);
      }
    }
    for (let i = 0; i < 280; i++) {
      g.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.12, 0.8));
      g.fillCircle(Phaser.Math.Between(0, W), Phaser.Math.Between(0, H), Phaser.Math.FloatBetween(0.5, 1.7));
    }
  }

  drawTitle() {
    const g = this.add.graphics();
    const cells = [[0, 0], [1, 0], [-1, 0], [0.5, 0.87], [-0.5, 0.87], [0.5, -0.87], [-0.5, -0.87]];
    cells.forEach(([cx, cy], i) => {
      const pts = hexPoints(26, 120 + cx * 52, 96 + cy * 52);
      g.fillStyle(i === 0 ? COLORS.gold : 0x2c3c66, i === 0 ? 0.9 : 0.35);
      g.fillPoints(pts, true, true);
      g.lineStyle(2, COLORS.gold, 0.8);
      g.strokePoints(pts, true, true);
    });
    label(this, W / 2, 58, 'ECLIPSE', { size: 96, bold: true, origin: [0.5, 0.5], color: COLORS.goldText, stroke: 0x1a1200, thickness: 8 });
    label(this, W / 2, 128, 'SECOND DAWN FOR THE GALAXY', { size: 30, bold: true, origin: [0.5, 0.5], color: '#9fd0ff' });
    label(this, W / 2, 168, 'A duel against the computer. Explore, expand, research and conquer to earn the most Victory Points in eight rounds.', {
      size: 17,
      origin: [0.5, 0.5],
      color: COLORS.muted,
    });
  }

  // ------------------------------------------------------------------ species pickers

  panel(x, y, w, h, title) {
    const g = this.add.graphics();
    drawBox(g, x, y, w, h, { fill: 0x0d1427, alpha: 0.92, line: COLORS.panelLine, radius: 12 });
    if (title) label(this, x + 16, y + 10, title, { size: 15, bold: true, color: COLORS.goldText });
    return g;
  }

  buildPickers() {
    this.cards = { human: [], rival: [] };
    const sides = [
      { key: 'human', x: 60, title: 'YOU PLAY AS' },
      { key: 'rival', x: 680, title: 'YOUR OPPONENT PLAYS AS' },
    ];
    for (const side of sides) {
      this.panel(side.x, PANEL_Y, 600, PANEL_H, side.title);
      new Button(this, side.x + 600 - 112, PANEL_Y + 6, 100, 28, 'Random', () => this.randomize(side.key), { size: 14 });
      SPECIES_LIST.forEach((sp, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const card = new SpeciesCard(this, side.x + 12 + col * (CARD_W + CARD_GAP + 2), PANEL_Y + 44 + row * (CARD_H + CARD_GAP), sp, {
          onPick: (id) => this.pick(side.key, id),
          onFocus: (id, on) => this.showDetails(on ? id : this.focusId),
        });
        this.cards[side.key].push(card);
      });
    }
  }

  pick(side, id) {
    const other = side === 'human' ? 'rival' : 'human';
    this.choice[side] = id;
    if (this.choice[other] === id) {
      const i = SPECIES_LIST.findIndex((s) => s.id === id);
      this.choice[other] = SPECIES_LIST[(i + 1) % SPECIES_LIST.length].id;
    }
    this.focusId = id;
    this.refresh();
  }

  randomize(side) {
    const other = side === 'human' ? 'rival' : 'human';
    const pool = SPECIES_LIST.filter((s) => s.id !== this.choice[other] && s.id !== this.choice[side]);
    this.pick(side, Phaser.Utils.Array.GetRandom(pool).id);
  }

  refresh() {
    for (const side of ['human', 'rival']) {
      const other = side === 'human' ? 'rival' : 'human';
      for (const card of this.cards[side]) {
        const id = card.sp.id;
        card.set({
          selected: this.choice[side] === id,
          taken: this.choice[other] === id,
          badge: this.choice[side] === id ? 'SELECTED' : this.choice[other] === id ? 'in use' : '',
        });
      }
    }
    this.showDetails(this.focusId);
    this.paintAi();
    localStorage.setItem(PREFS_KEY, JSON.stringify(this.choice));
  }

  // ------------------------------------------------------------------ species details

  buildDetails() {
    this.panel(1300, PANEL_Y, 560, PANEL_H, 'SPECIES');
    this.detail = this.add.container(1300, PANEL_Y);
  }

  showDetails(id) {
    const sp = SPECIES[id];
    if (!sp || !this.detail) return;
    const c = this.detail;
    c.removeAll(true);
    const put = (x, y, str, o) => {
      const t = label(this, x, y, str, o);
      c.add(t);
      return t;
    };
    const g = this.add.graphics();
    c.add(g);
    put(18, 36, sp.name, { size: 30, bold: true, color: css(sp.color) });
    put(18, 76, `${sp.group === 'terran' ? 'Terran faction' : 'Alien species'} \u00b7 Home sector ${sp.home}`, { size: 14, color: COLORS.muted });
    const bio = put(18, 100, sp.bio, { size: 15, color: '#c9d3ee', wrap: 524, spacing: 2 });
    let y = 100 + bio.height + 16;

    put(18, y, 'STARTING RESOURCES', { size: 12, bold: true, color: COLORS.muted });
    y += 22;
    RESOURCES.forEach((r, i) => {
      const x = 18 + i * 178;
      g.fillStyle(RES[r].color, 1);
      g.fillCircle(x + 14, y + 16, 14);
      put(x + 14, y + 16, r, { size: 15, bold: true, origin: [0.5, 0.5], color: css(RES[r].dark) });
      put(x + 38, y + 3, `${sp.start[r]}`, { size: 24, bold: true });
    });
    y += 48;

    put(18, y, 'ACTIVATIONS PER ACTION', { size: 12, bold: true, color: COLORS.muted });
    y += 22;
    ACTIONS.forEach((a, i) => {
      const x = 18 + i * 87;
      drawBox(g, x, y, 80, 48, { fill: sp.activations[a] > 1 ? 0x1f3a2c : 0x121c36, line: sp.activations[a] > 1 ? 0x3f8f65 : COLORS.panelLine, radius: 8 });
      put(x + 40, y + 12, ACTION_INFO[a].label, { size: 12, origin: [0.5, 0.5], color: COLORS.muted });
      put(x + 40, y + 32, `${sp.activations[a]}`, { size: 20, bold: true, origin: [0.5, 0.5] });
    });
    y += 62;

    put(18, y, `Influence Discs ${sp.discs} \u00b7 Colony Ships ${sp.colonyShips} \u00b7 Trade ${sp.trade}:1 \u00b7 Reputation slots ${sp.repSlots}`, { size: 14, color: '#c9d3ee', wrap: 524 });
    y += 30;

    put(18, y, 'STARTING TECHNOLOGIES', { size: 12, bold: true, color: COLORS.muted });
    y += 20;
    const techs = Object.values(sp.startTechs)
      .flat()
      .map((t) => TECHS[t]?.name ?? t);
    const tt = put(18, y, techs.length ? techs.join(', ') : 'None', { size: 15, wrap: 524 });
    y += tt.height + 14;

    put(18, y, 'SPECIAL RULES', { size: 12, bold: true, color: COLORS.muted });
    y += 20;
    for (const rule of sp.rules) {
      put(18, y, '\u2022', { size: 15, color: COLORS.goldText });
      const t = put(34, y, rule, { size: 15, wrap: 508, spacing: 1 });
      y += t.height + 6;
    }
  }

  // ------------------------------------------------------------------ opponent AI, seed, start

  buildOpponentPanel() {
    this.panel(60, 870, 600, 190, 'COMPUTER OPPONENT');
    this.aiButtons = this.ais.map((ai, i) => {
      const b = new Button(this, 76 + (i % 3) * 190, 902 + Math.floor(i / 3) * 52, 180, 44, ai.label, () => {
        this.choice.ai = ai.id;
        this.refresh();
      }, { size: 17 });
      return { ai, b };
    });
    this.aiText = label(this, 76, 970, '', { size: 15, color: '#c9d3ee', wrap: 568, spacing: 2 });
    this.aiHint = label(this, 76, 1030, 'More opponents can be registered in src/ai/registry.js.', { size: 12, color: COLORS.dim });
  }

  paintAi() {
    if (!this.aiButtons) return;
    for (const { ai, b } of this.aiButtons) b.setFill(ai.id === this.choice.ai ? 0x2f6b4a : 0x22335c);
    const cur = this.ais.find((a) => a.id === this.choice.ai);
    this.aiText.setText(cur?.description ?? '');
    this.aiText.setY(this.ais.length > 3 ? 1000 : 960);
    this.aiHint.setY(1036);
  }

  buildSeedPanel() {
    this.panel(680, 870, 600, 190, 'GALAXY SEED');
    const g = this.add.graphics();
    this.seedBox = g;
    this.seedLabel = label(this, 700, 929, '', { size: 24, bold: true, origin: [0, 0.5] });
    this.seedHit = this.add.rectangle(700 + 150, 929, 300, 44, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    this.seedHit.on('pointerup', () => this.setSeedFocus(true));
    new Button(this, 1020, 907, 240, 44, 'New random seed', () => {
      this.seedText = String(Phaser.Math.Between(1, 999999));
      this.paintSeed();
    }, { size: 16 });
    label(this, 700, 970, 'The seed decides the order of the sector and technology stacks. The same seed and species give the same galaxy.\nClick the box and type digits, or leave it empty for a random galaxy.', {
      size: 14,
      color: COLORS.muted,
      wrap: 560,
      spacing: 3,
    });
    this.paintSeed();
  }

  setSeedFocus(on) {
    this.seedFocus = on;
    this.paintSeed();
  }

  paintSeed() {
    const g = this.seedBox;
    g.clear();
    drawBox(g, 700, 907, 300, 44, { fill: 0x0a1020, line: this.seedFocus ? COLORS.gold : COLORS.panelLine, lineWidth: this.seedFocus ? 3 : 2, radius: 8 });
    const caret = this.seedFocus ? '|' : '';
    this.seedLabel.setText(this.seedText ? `${this.seedText}${caret}` : this.seedFocus ? '|' : 'random');
    this.seedLabel.setColor(this.seedText ? COLORS.text : COLORS.dim);
    this.seedLabel.setX(712);
  }

  onKey(e) {
    if (!this.seedFocus || this.modals.size) return;
    if (/^\d$/.test(e.key) && this.seedText.length < 9) this.seedText += e.key;
    else if (e.key === 'Backspace') this.seedText = this.seedText.slice(0, -1);
    else if (e.key === 'Enter' || e.key === 'Escape') this.seedFocus = false;
    this.paintSeed();
  }

  buildStartPanel() {
    new Button(this, 1300, 870, 560, 76, 'START GAME', () => this.start(), { size: 30, fill: 0x2f6b4a, line: COLORS.gold });
    const save = loadSave();
    if (save) {
      new Button(this, 1300, 956, 560, 56, `Continue saved game\n${describeSave(save)}`, () => this.resume(save), { size: 16 });
    } else {
      label(this, 1580, 984, 'No saved game yet. Your game is saved automatically.', { size: 14, color: COLORS.dim, origin: [0.5, 0.5] });
    }
    new Button(this, 1300, 1020, 560, 40, 'How to play', () => openHelp(this), { size: 16 });
  }

  // ------------------------------------------------------------------ starting a match

  async start() {
    if (loadSave()) {
      const ok = await choiceDialog(this, {
        title: 'Start a new game?',
        text: 'Your saved game will be replaced as soon as the new one begins.',
        options: [
          { label: 'Start new game', value: true, fill: 0x2f6b4a },
          { label: 'Cancel', value: false },
        ],
        closable: true,
        w: 640,
      });
      if (!ok) return;
    }
    const seed = this.seedText ? Number(this.seedText) : Phaser.Math.Between(1, 999999);
    const config = matchConfig({ seed, human: this.choice.human, opponents: [{ species: this.choice.rival, ai: this.choice.ai }] });
    clearSave();
    this.scene.start('Game', { config });
  }

  resume(save) {
    try {
      const game = Game.load(save);
      game.drainEvents();
      this.scene.start('Game', { game });
    } catch (err) {
      console.error('Could not restore the saved game', err);
      clearSave();
      toast(this, 'That saved game is not compatible with this version and was discarded.', { color: COLORS.danger, y: 120, duration: 3200 });
    }
  }
}
