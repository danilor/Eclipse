import { COLORS, RES } from '../config.js';
import {
  ACTIONS,
  BASE_INFLUENCE_DISCS,
  POP_TRACK,
  POP_TRACK_SIZE,
  RESOURCES,
  RESOURCE_NAMES,
  SHIP_NAMES,
  SHIP_TYPES,
  TECH_CATEGORIES,
  TECH_DISCOUNT,
  TECH_TRACK_SIZE,
  TECH_TRACK_VP,
  UPKEEP,
} from '../data/constants.js';
import { PARTS } from '../data/parts.js';
import { SPECIES } from '../data/species.js';
import { TECHS } from '../data/techs.js';
import { blueprintTotals, slotPart } from '../core/stats.js';
import { actionDiscCount, productionOf, upkeepOf } from '../core/queries.js';
import { drawBox, hoverZone, label } from './kit.js';
import { ACTION_INFO, CATEGORY_COLORS, CATEGORY_NAMES, describeTech, signed } from './names.js';
import { PartIcon } from './partIcon.js';

const IW = 400;
const POP_X = 38;
const POP_PITCH = 27;
const ACTION_SHORT = { explore: 'Explore', research: 'Research', upgrade: 'Upgrade', build: 'Build', move: 'Move', influence: 'Influence', reaction: 'Reaction' };

// The full player board: resources, Influence Track, action discs, Population Tracks, Technology Tracks,
// Blueprints and miscellaneous counters. Built once, then `update()` re-reads the game state.
export class BoardPanel {
  constructor(scene, game, pid, x, y, { parent = null, depth = 100 } = {}) {
    this.scene = scene;
    this.game = game;
    this.pid = pid;
    this.root = scene.add.container(x, y);
    this.root.setDepth(depth);
    parent?.add(this.root);
    this.texts = {};
    this.build();
    this.update();
  }

  get p() {
    return this.game.state.players[this.pid];
  }

  text(key, x, y, str, o) {
    const t = label(this.scene, x, y, str, o);
    this.root.add(t);
    if (key) this.texts[key] = t;
    return t;
  }

  build() {
    const s = this.scene;
    const sp = SPECIES[this.p.species];
    const bg = s.add.graphics();
    this.root.add(bg);
    this.gfx = s.add.graphics();
    this.root.add(this.gfx);

    // header
    drawBox(bg, 0, 0, IW + 20, 32, { fill: COLORS.panelHi, line: sp.color, lineWidth: 2, radius: 9 });
    this.text('name', 12, 16, sp.name, { size: 18, bold: true, origin: [0, 0.5], color: '#' + sp.color.toString(16).padStart(6, '0') });
    this.text('who', IW + 8, 16, '', { size: 13, origin: [1, 0.5], color: COLORS.muted });
    hoverZone(s, this.root, 0, 0, IW + 20, 32, () => `${sp.name}\n${sp.rules.join('\n')}`);

    // resources
    const rw = (IW + 20 - 16) / 3;
    this.resBoxes = [];
    RESOURCES.forEach((r, i) => {
      const x = i * (rw + 8);
      drawBox(bg, x, 38, rw, 58, { fill: COLORS.panel, line: RES[r].dark, radius: 9 });
      bg.fillStyle(RES[r].color, 1);
      bg.fillCircle(x + 22, 67, 14);
      this.text(null, x + 22, 68, r, { size: 17, bold: true, origin: [0.5, 0.5], color: '#' + RES[r].dark.toString(16).padStart(6, '0') });
      this.text(`stock${r}`, x + 44, 44, '0', { size: 28, bold: true, color: COLORS.text });
      this.text(`prod${r}`, x + rw - 8, 44, '', { size: 16, bold: true, origin: [1, 0], color: '#6ee7a0' });
      this.text(`sub${r}`, x + rw - 8, 70, '', { size: 12, origin: [1, 0], color: COLORS.muted });
      hoverZone(s, this.root, x, 38, rw, 58, () => this.resourceTip(r));
    });

    // influence track
    drawBox(bg, 0, 102, IW + 20, 66, { fill: COLORS.panel, line: COLORS.panelLine, radius: 9 });
    this.text(null, 10, 107, 'INFLUENCE TRACK', { size: 12, bold: true, color: COLORS.muted });
    this.text('infl', IW + 10, 107, '', { size: 12, origin: [1, 0], color: COLORS.text });
    hoverZone(s, this.root, 0, 102, IW + 20, 66, () => this.influenceTip());
    for (let i = 0; i < BASE_INFLUENCE_DISCS; i++) {
      this.text(`up${i}`, this.cellX(i), 146, String(UPKEEP[i]), { size: 12, bold: true, origin: [0.5, 0.5], color: COLORS.dim });
    }

    // action discs
    drawBox(bg, 0, 174, IW + 20, 42, { fill: COLORS.panel, line: COLORS.panelLine, radius: 9 });
    const names = [...ACTIONS, 'reaction'];
    const cw = (IW + 20 - 12) / names.length;
    this.chips = names.map((a, i) => {
      const x = 6 + i * cw;
      this.text(`ch${a}`, x + cw / 2 - 1, 188, ACTION_SHORT[a], { size: 11, origin: [0.5, 0.5], color: COLORS.muted });
      this.text(`chn${a}`, x + cw / 2 - 1, 204, '0', { size: 15, bold: true, origin: [0.5, 0.5], color: COLORS.text });
      hoverZone(s, this.root, x, 176, cw - 2, 38, () =>
        a === 'reaction' ? 'Reaction discs: placed when you react (Upgrade, Build or Move) after passing.' : `${ACTION_INFO[a].label}: ${ACTION_INFO[a].text}`
      );
      return { x: x + 1, w: cw - 4, a };
    });

    // population
    drawBox(bg, 0, 222, IW + 20, 106, { fill: COLORS.panel, line: COLORS.panelLine, radius: 9 });
    this.text(null, 10, 227, 'POPULATION  (cubes cover the numbers; production = highest open number)', { size: 11, bold: true, color: COLORS.muted });
    RESOURCES.forEach((r, i) => {
      const y = 244 + i * 27;
      bg.fillStyle(RES[r].color, 1);
      bg.fillRoundedRect(8, y, 24, 24, 5);
      this.text(null, 20, y + 13, r, { size: 15, bold: true, origin: [0.5, 0.5], color: '#' + RES[r].dark.toString(16).padStart(6, '0') });
      POP_TRACK.forEach((v, c) => this.text(`pop${r}${c}`, POP_X + c * POP_PITCH + 12.5, y + 13, String(v), { size: 12, bold: true, origin: [0.5, 0.5], color: COLORS.muted }));
      this.text(`grave${r}`, IW + 14, y + 13, '', { size: 12, bold: true, origin: [1, 0.5], color: '#ff8c8c' });
      hoverZone(s, this.root, 0, y, IW + 20, 25, () => this.populationTip(r));
    });

    // technology tracks
    drawBox(bg, 0, 334, IW + 20, 158, { fill: COLORS.panel, line: COLORS.panelLine, radius: 9 });
    this.techCells = [];
    TECH_CATEGORIES.forEach((cat, row) => {
      const y = 338 + row * 51;
      this.text(`tt${cat}`, 10, y + 2, CATEGORY_NAMES[cat], { size: 12, bold: true, color: '#' + CATEGORY_COLORS[cat].toString(16).padStart(6, '0') });
      for (let i = 0; i < TECH_TRACK_SIZE; i++) {
        const cx = 8 + i * 57.5;
        const t = this.text(`tc${cat}${i}`, cx + 27, y + 32, '', { size: 11, bold: true, origin: [0.5, 0.5], align: 'center', color: COLORS.text });
        this.techCells.push({ cat, i, x: cx, y: y + 17, t });
        hoverZone(s, this.root, cx, y + 17, 54, 30, () => this.techTip(cat, i));
      }
    });

    // blueprints
    drawBox(bg, 0, 498, IW + 20, 234, { fill: COLORS.panel, line: COLORS.panelLine, radius: 9 });
    this.bpRows = SHIP_TYPES.map((type, row) => {
      const y = 502 + row * 57;
      this.text(`bpn${type}`, 10, y + 1, SHIP_NAMES[type], { size: 13, bold: true, color: COLORS.text });
      this.text(`bpt${type}`, IW + 10, y + 2, '', { size: 12, origin: [1, 0], color: COLORS.muted });
      const icons = Array.from({ length: 9 }, (_, i) => {
        const ic = new PartIcon(s, 28 + i * 44.5, y + 35, 38);
        this.root.add(ic);
        return ic;
      });
      return { type, icons, y };
    });

    // misc
    drawBox(bg, 0, 738, IW + 20, 32, { fill: COLORS.panel, line: COLORS.panelLine, radius: 9 });
    this.text('misc', 10, 754, '', { size: 13, origin: [0, 0.5], color: COLORS.text });
    this.text('misc2', IW + 10, 754, '', { size: 13, origin: [1, 0.5], color: COLORS.muted });
    hoverZone(s, this.root, 0, 738, IW + 20, 32, () => this.miscTip());
  }

  cellX(i) {
    return 8 + ((i + 0.5) * (IW + 4)) / BASE_INFLUENCE_DISCS;
  }

  // ------------------------------------------------------------------ tooltips

  resourceTip(r) {
    const p = this.p;
    const prod = productionOf(p);
    const net = r === '$' ? `\nCivilization Upkeep: \u2212${upkeepOf(p)} per round, so net income is ${signed(prod.$ - upkeepOf(p))}.` : '';
    return `${RESOURCE_NAMES[r]}\nIn storage: ${p.res[r]}\nProduction per round: ${prod[r]}${net}\nPopulation cubes still on the track: ${p.pop[r]}`;
  }

  influenceTip() {
    const p = this.p;
    return `Influence Track\n${p.track} Influence Discs are on the track; the others sit on sectors or actions.\nEvery disc you take off the track reveals a higher Civilization Upkeep (current: ${upkeepOf(p)} Money per round).\nDiscs come back during Cleanup.`;
  }

  populationTip(r) {
    const dead = this.p.grave[r];
    return `${RESOURCE_NAMES[r]} Population Track\nEach Colony Ship moves the leftmost cube from here onto a ${RESOURCE_NAMES[r]} square of a sector you control, raising your production.${dead ? `\n${dead} cube(s) in the Graveyard (destroyed); they return to the track during Cleanup.` : ''}`;
  }

  techTip(cat, i) {
    const id = this.p.techs[cat][i];
    if (id) return `${TECHS[id].name}\n${describeTech(id)}`;
    return `${CATEGORY_NAMES[cat]} track slot ${i + 1}\nNext ${CATEGORY_NAMES[cat]} tech gives ${TECH_DISCOUNT[i]} Science discount on later research.\n${TECH_TRACK_VP[i + 1] ? `Having ${i + 1} techs here is worth ${TECH_TRACK_VP[i + 1]} VP at the end.` : ''}`;
  }

  miscTip() {
    const p = this.p;
    return `Colony Ships: ${p.colony.up} ready of ${p.colony.total}.\nTrade rate: ${SPECIES[p.species].trade} of one resource for 1 of another.\nReputation tiles: ${p.rep.length ? p.rep.join(', ') : 'none'} VP.\nAncient parts in stock: ${p.ancientParts.map((a) => PARTS[a].name).join(', ') || 'none'}.`;
  }

  // ------------------------------------------------------------------ refresh

  update() {
    const p = this.p;
    const t = this.texts;
    const g = this.gfx;
    const sp = SPECIES[p.species];
    g.clear();
    const prod = productionOf(p);
    const up = upkeepOf(p);

    t.who.setText(p.eliminated ? 'ELIMINATED' : p.kind === 'human' ? 'You' : 'Computer');
    RESOURCES.forEach((r) => {
      t[`stock${r}`].setText(String(p.res[r]));
      t[`prod${r}`].setText(`+${prod[r]}`);
      if (r === '$') {
        t.sub$.setText(`upkeep \u2212${up}`);
        t.sub$.setColor(prod.$ - up < 0 ? '#ff8c8c' : '#9fb0d6');
      } else t[`sub${r}`].setText('per round');
    });

    // influence track: discs occupy the right-hand cells; the left ones reveal the upkeep
    const empties = Math.max(0, BASE_INFLUENCE_DISCS - p.track);
    t.infl.setText(`${p.track} on track \u00b7 ${actionDiscCount(p) + p.reactionDiscs} on actions \u00b7 upkeep ${up}`);
    for (let i = 0; i < BASE_INFLUENCE_DISCS; i++) {
      const cx = this.cellX(i);
      const open = i < empties;
      const current = open && i === empties - 1;
      if (open) {
        g.fillStyle(0x0a0f1c, 1);
        g.fillCircle(cx, 138, 13);
        g.lineStyle(current ? 3 : 1.5, current ? COLORS.gold : 0x3a4a78, 1);
        g.strokeCircle(cx, 138, 13);
      } else {
        g.fillStyle(0x05070d, 1);
        g.fillCircle(cx, 138, 14);
        g.fillStyle(sp.color, 1);
        g.fillCircle(cx, 138, 12);
        g.lineStyle(2, 0xffffff, 0.8);
        g.strokeCircle(cx, 138, 12);
        g.lineStyle(2, 0x05070d, 0.5);
        g.strokeCircle(cx, 138, 7);
      }
      t[`up${i}`].setPosition(cx, open ? 138 : 158);
      t[`up${i}`].setColor(current ? COLORS.goldText : open ? '#c9d3ee' : COLORS.dim);
      t[`up${i}`].setFontSize(open ? 13 : 11);
    }
    if (p.track > BASE_INFLUENCE_DISCS) t.infl.setText(`${p.track} on track (extra discs) \u00b7 upkeep ${up}`);

    // action discs
    for (const chip of this.chips) {
      const n = chip.a === 'reaction' ? p.reactionDiscs : p.actionDiscs[chip.a];
      g.fillStyle(n ? 0x2c4a86 : 0x0d1427, 1);
      g.fillRoundedRect(chip.x, 177, chip.w, 36, 6);
      g.lineStyle(n ? 2 : 1, n ? COLORS.accent : 0x2c3c66, 1);
      g.strokeRoundedRect(chip.x, 177, chip.w, 36, 6);
      t[`chn${chip.a}`].setText(String(n));
      t[`chn${chip.a}`].setColor(n ? '#ffffff' : COLORS.dim);
    }

    // population tracks
    RESOURCES.forEach((r, i) => {
      const y = 244 + i * 27;
      const cubes = p.pop[r];
      const open = POP_TRACK_SIZE - 1 - cubes;
      for (let c = 0; c < POP_TRACK_SIZE; c++) {
        const x = POP_X + c * POP_PITCH;
        const covered = c >= POP_TRACK_SIZE - cubes;
        const exposed = c === open;
        if (covered) {
          g.fillStyle(RES[r].color, 1);
          g.fillRoundedRect(x + 1, y + 1, 24, 23, 4);
          g.fillStyle(0xffffff, 0.3);
          g.fillRoundedRect(x + 1, y + 1, 24, 8, 4);
          g.lineStyle(1.5, 0x05070d, 0.9);
          g.strokeRoundedRect(x + 1, y + 1, 24, 23, 4);
        } else {
          g.fillStyle(exposed ? 0x3a3010 : 0x0a0f1c, 1);
          g.fillRoundedRect(x + 1, y + 1, 24, 23, 4);
          g.lineStyle(exposed ? 3 : 1, exposed ? COLORS.gold : 0x2c3c66, 1);
          g.strokeRoundedRect(x + 1, y + 1, 24, 23, 4);
        }
        const tx = t[`pop${r}${c}`];
        tx.setVisible(!covered);
        tx.setColor(exposed ? COLORS.goldText : COLORS.muted);
      }
      const dead = p.grave[r];
      t[`grave${r}`].setText(dead ? `\u2020${dead}` : '');
    });

    // technology tracks
    for (const cell of this.techCells) {
      const id = p.techs[cell.cat][cell.i];
      const color = CATEGORY_COLORS[cell.cat];
      g.fillStyle(id ? lightenMix(color) : 0x0a0f1c, 1);
      g.fillRoundedRect(cell.x, cell.y, 54, 30, 5);
      g.lineStyle(id ? 2 : 1, id ? color : 0x2c3c66, 1);
      g.strokeRoundedRect(cell.x, cell.y, 54, 30, 5);
      if (id) {
        const words = TECHS[id].name.split(' ');
        cell.t.setText(words.length > 1 ? `${words[0]}\n${words.slice(1).join(' ')}` : words[0]);
        cell.t.setColor(COLORS.text);
        cell.t.setLineSpacing(-2);
      } else {
        const vp = TECH_TRACK_VP[cell.i + 1];
        cell.t.setText(`\u2212${TECH_DISCOUNT[cell.i]}${vp ? `\n${vp} VP` : ''}`);
        cell.t.setColor(COLORS.dim);
        cell.t.setLineSpacing(-2);
      }
      cell.t.setScale(1);
      if (cell.t.width > 50) cell.t.setScale(50 / cell.t.width);
    }

    // blueprints
    for (const row of this.bpRows) {
      const bp = p.blueprints[row.type];
      const tot = blueprintTotals(p, row.type);
      const parts = [`Init ${tot.init}`, `Computer ${signed(tot.computer)}`, `Shield ${tot.shield}`, `Hull ${tot.hull}`];
      if (row.type !== 'starbase') parts.push(`Drive ${tot.drive}`);
      parts.push(`Energy ${tot.energyUse}/${tot.energyProd}`);
      t[`bpt${row.type}`].setText(parts.join(' \u00b7 '));
      t[`bpt${row.type}`].setColor(tot.energyUse > tot.energyProd ? '#ff8c8c' : '#9fb0d6');
      row.icons.forEach((icon, i) => {
        const slot = bp.slots[i];
        if (slot) {
          icon.setVisible(true);
          icon.setPart(slotPart(slot), { printed: !slot.tile });
        } else if (i - bp.slots.length < bp.extras.length) {
          icon.setVisible(true);
          icon.setPart(bp.extras[i - bp.slots.length], { extra: true });
        } else icon.setVisible(false);
      });
    }

    // misc
    const ships = `${p.colony.up}/${p.colony.total}`;
    t.misc.setText(`Colony ships ${ships}   Trade ${SPECIES[p.species].trade}:1`);
    const repSum = p.rep.reduce((a, b) => a + b, 0);
    t.misc2.setText(`Reputation ${repSum} VP${p.ancientParts.length ? `  \u00b7  Ancient parts ${p.ancientParts.length}` : ''}`);
  }

  destroy() {
    this.root.destroy();
  }
}

function lightenMix(color) {
  const r = (color >> 16) & 255;
  const gr = (color >> 8) & 255;
  const b = color & 255;
  const f = (v) => Math.round(v * 0.35 + 18);
  return (f(r) << 16) | (f(gr) << 8) | f(b);
}

export const BOARD_WIDTH = IW + 20;
export const BOARD_HEIGHT = 772;
