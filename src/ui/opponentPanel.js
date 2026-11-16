import { COLORS, RES } from '../config.js';
import { RESOURCES, SHIP_TYPES, TECH_CATEGORIES } from '../data/constants.js';
import { SPECIES } from '../data/species.js';
import { actionDiscCount, controlledKeys, productionOf, scoreBreakdown, upkeepOf } from '../core/queries.js';
import { Button, css, drawBox, hoverZone, label } from './kit.js';
import { CATEGORY_NAMES, signed } from './names.js';

export const OPP_WIDTH = 420;
export const OPP_HEIGHT = 110;

// Compact read-out of an opponent. The full board of any player can be opened from the "Details" button.
export class OpponentPanel {
  constructor(scene, game, pid, x, y, { onDetails = null, depth = 100 } = {}) {
    this.scene = scene;
    this.game = game;
    this.pid = pid;
    this.root = scene.add.container(x, y).setDepth(depth);
    this.gfx = scene.add.graphics();
    this.root.add(this.gfx);
    this.t = {};
    const sp = SPECIES[this.p.species];
    drawBox(this.gfx, 0, 0, OPP_WIDTH, OPP_HEIGHT, { fill: COLORS.panel, line: sp.color, lineWidth: 2, radius: 9 });

    this.add('name', 10, 6, sp.name, { size: 17, bold: true, color: css(sp.color) });
    this.add('state', 10, 28, '', { size: 12, color: COLORS.muted });

    this.details = new Button(scene, OPP_WIDTH - 90, 6, 82, 26, 'Details', () => onDetails?.(this.pid), { size: 14, tip: 'Open the full player board of this opponent.' });
    this.root.add(this.details);

    RESOURCES.forEach((r, i) => {
      const bx = 10 + i * 100;
      this.add(null, bx, 46, r, { size: 14, bold: true, color: css(RES[r].color) });
      this.add(`res${r}`, bx + 16, 45, '', { size: 14, bold: true, color: COLORS.text });
      this.add(`prod${r}`, bx + 50, 47, '', { size: 12, color: '#6ee7a0' });
    });
    this.add('line1', 10, 68, '', { size: 12, color: COLORS.muted });
    this.add('line2', 10, 87, '', { size: 12, color: COLORS.muted });
    hoverZone(scene, this.root, 0, 40, OPP_WIDTH, 66, () => this.tip());
    this.update();
  }

  get p() {
    return this.game.state.players[this.pid];
  }

  add(key, x, y, str, o) {
    const t = label(this.scene, x, y, str, o);
    this.root.add(t);
    if (key) this.t[key] = t;
    return t;
  }

  tip() {
    const p = this.p;
    const s = this.game.state;
    const sc = scoreBreakdown(s, this.pid);
    const ships = SHIP_TYPES.map((ty) => `${s.ships.filter((x) => x.owner === this.pid && x.type === ty).length} ${ty}`).join(', ');
    return `${SPECIES[p.species].name} (${p.kind === 'human' ? 'you' : 'computer'})\nVictory points now: ${sc.total}\nSectors: ${controlledKeys(s, this.pid).length}\nShips: ${ships}\nTechnologies: ${TECH_CATEGORIES.map((c) => `${CATEGORY_NAMES[c]} ${p.techs[c].length}`).join(', ')}\nUpkeep per round: ${upkeepOf(p)}`;
  }

  update() {
    const p = this.p;
    const s = this.game.state;
    const prod = productionOf(p);
    this.t.state.setText(p.eliminated ? 'Eliminated' : p.passed ? 'Passed' : 'Still acting');
    this.t.state.setColor(p.passed ? '#ffcf5a' : COLORS.muted);
    for (const r of RESOURCES) {
      this.t[`res${r}`].setText(String(p.res[r]));
      this.t[`prod${r}`].setText(`+${prod[r]}`);
    }
    const ships = s.ships.filter((x) => x.owner === this.pid).length;
    const techs = TECH_CATEGORIES.reduce((a, c) => a + p.techs[c].length, 0);
    const sectors = controlledKeys(s, this.pid).length;
    const up = upkeepOf(p);
    this.t.line1.setText(`Sectors ${sectors} \u00b7 Ships ${ships} \u00b7 Techs ${techs} \u00b7 Colony ${p.colony.up}/${p.colony.total}`);
    this.t.line2.setText(`Discs: ${p.track} track \u00b7 ${actionDiscCount(p) + p.reactionDiscs} actions \u00b7 upkeep ${up} (net ${signed(prod.$ - up)})`);
  }

  destroy() {
    this.root.destroy();
  }
}
