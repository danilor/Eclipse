import { COLORS } from '../config.js';
import { SHIP_NAMES, SHIP_TYPES } from '../data/constants.js';
import { PARTS } from '../data/parts.js';
import { upgradeError } from '../core/rules.js';
import { blueprintTotals, partAvailable, slotPart } from '../core/stats.js';
import { tipArea } from './dialogs.js';
import { Button, Modal, drawBox, label } from './kit.js';
import { signed } from './names.js';
import { PartIcon } from './partIcon.js';

const W = 1500;
const H = 850;
const ICON = 62;
const PITCH = 72;
const X0 = 250;
const ROW_Y = 104;
const ROW_H = 134;
const PAL_X = 940;
const PAL_ICON = 56;
const PAL_COLS = 8;
const PAL_PITCH_X = 69;
const PAL_PITCH_Y = 92;

const trialPlayer = (p, returns, place) => {
  const blueprints = JSON.parse(JSON.stringify(p.blueprints));
  for (const r of returns) blueprints[r.bp].slots[r.slot].tile = null;
  if (place) blueprints[place.bp].slots[place.slot].tile = place.part;
  return { species: p.species, blueprints };
};

const diceText = (dice) =>
  Object.entries(dice)
    .filter(([, n]) => n)
    .map(([c, n]) => `${n} ${c}`)
    .join(', ');

export function totalsText(t, type) {
  const lines = [
    `Initiative ${t.init}    Computer ${signed(t.computer)}`,
    `Shield ${t.shield}    Hull ${t.hull}${type === 'starbase' ? '' : `    Drive ${t.drive}`}`,
    `Energy used ${t.energyUse} of ${t.energyProd}`,
    `Cannons: ${diceText(t.dice) || 'none'}`,
  ];
  const missiles = diceText(t.missiles);
  if (missiles) lines.push(`Missiles: ${missiles}`);
  return lines.join('\n');
}

// Blueprint editor. Resolves with the command to apply (or null when simply closed in normal mode):
//   normal mode  -> { type: 'upgrade', returns, place } or { type: 'done' }
//   ancient mode -> one of `options` (an upgrade command) or { type: 'stash' }
export function openUpgradeDialog(scene, { game, pid, activation = null, ancientPart = null, options = null }) {
  return new Promise((resolve) => {
    const p = game.state.players[pid];
    const defaultCmd = ancientPart ? { type: 'stash' } : { type: 'done' };
    const title = ancientPart
      ? `Ancient Part found: ${PARTS[ancientPart].name}`
      : activation
        ? `Upgrade \u2014 activation ${activation.index + 1} of ${activation.of}`
        : 'Upgrade Ship Blueprints';
    let finished = false;
    const finish = (cmd) => {
      if (finished) return;
      finished = true;
      modal.close();
      resolve(cmd);
    };
    const modal = new Modal(scene, { title, w: W, h: H, onClose: () => finish(ancientPart ? defaultCmd : null) });
    const body = modal.body;

    let selected = ancientPart;
    let pending = [];
    let hovered = null;
    const isPending = (bp, slot) => pending.some((r) => r.bp === bp && r.slot === slot);

    body.add(
      label(
        scene,
        30,
        56,
        ancientPart
          ? 'Place this Ancient Part on a ship blueprint (it replaces the part there), or keep it in your stash for a later Upgrade.'
          : 'Pick a Ship Part on the right, then click a green space to place it. A placed part replaces what was there. With nothing picked, click a placed part to mark it for return to the supply.',
        { size: 15, color: COLORS.muted, wrap: PAL_X - 50 }
      )
    );

    const tips = tipArea(scene, modal, 30, 676, W - 60, 90, { size: 16, hint: 'Hover over a Ship Part or a Ship Part space for details.' });

    // ------------------------------------------------------------ blueprint rows
    const rows = SHIP_TYPES.map((type, r) => {
      const y = ROW_Y + r * ROW_H;
      const g = scene.add.graphics();
      drawBox(g, 20, y - 8, 890, ROW_H - 10, { fill: 0x121b33, line: 0x2b3a63, radius: 10 });
      body.add(g);
      body.add(label(scene, 34, y, SHIP_NAMES[type], { size: 22, bold: true, color: COLORS.goldText }));
      const stats = label(scene, 34, y + 32, '', { size: 13, color: COLORS.text, wrap: 200, spacing: 2 });
      body.add(stats);
      const icons = Array.from({ length: 9 }, (_, i) => {
        const icon = new PartIcon(scene, X0 + i * PITCH + ICON / 2, y + 44, ICON);
        icon.on('over', () => (hovered = icon));
        icon.on('out', () => {
          if (hovered === icon) hovered = null;
        });
        icon.on('click', () => onSlot(type, i));
        icon.setName(`slot:${type}:${i}`);
        body.add(icon);
        return icon;
      });
      return { type, stats, icons };
    });

    // ------------------------------------------------------------ palette
    body.add(label(scene, PAL_X, 70, ancientPart ? 'The Ancient Part' : 'Ship Parts you can place', { size: 20, bold: true, color: COLORS.goldText }));
    const paletteIds = ancientPart ? [ancientPart] : Object.keys(PARTS).filter((id) => id !== 'muonSource' && partAvailable(p, id));
    const pal = paletteIds.map((id, i) => {
      const cx = PAL_X + (i % PAL_COLS) * PAL_PITCH_X + PAL_ICON / 2;
      const cy = ROW_Y + 20 + Math.floor(i / PAL_COLS) * PAL_PITCH_Y;
      const icon = new PartIcon(scene, cx, cy, PAL_ICON);
      icon.on('over', () => (hovered = icon));
      icon.on('out', () => {
        if (hovered === icon) hovered = null;
      });
      if (!ancientPart) icon.on('click', () => pick(id));
      icon.setName(`part:${id}`);
      body.add(icon);
      body.add(label(scene, cx, cy + PAL_ICON / 2 + 3, PARTS[id].name, { size: 11, color: COLORS.muted, align: 'center', origin: [0.5, 0], wrap: PAL_PITCH_X - 3 }));
      return { id, icon };
    });

    // ------------------------------------------------------------ logic
    function returnsFor(bp, slot) {
      const list = pending.slice();
      if (!isPending(bp, slot) && p.blueprints[bp].slots[slot].tile) list.push({ bp, slot });
      return list;
    }

    function placementError(bp, slot) {
      const current = p.blueprints[bp].slots[slot];
      if (ancientPart) {
        return options.some((o) => o.type === 'upgrade' && o.place.bp === bp && o.place.slot === slot)
          ? null
          : 'It would break the ship: it needs enough Energy, and every ship except the Starbase needs a Drive.';
      }
      if (slotPart(current) === selected && !isPending(bp, slot)) return `That space already holds a ${PARTS[selected].name}.`;
      return upgradeError(p, { type: 'upgrade', returns: returnsFor(bp, slot), place: { part: selected, bp, slot } });
    }

    function onSlot(bp, slot) {
      const current = p.blueprints[bp].slots[slot];
      if (!current) return;
      if (!selected) {
        if (!current.tile) return;
        pending = isPending(bp, slot) ? pending.filter((r) => !(r.bp === bp && r.slot === slot)) : [...pending, { bp, slot }];
        refresh();
        return;
      }
      if (placementError(bp, slot)) return;
      if (ancientPart) {
        finish(options.find((o) => o.type === 'upgrade' && o.place.bp === bp && o.place.slot === slot));
        return;
      }
      finish({ type: 'upgrade', returns: returnsFor(bp, slot), place: { part: selected, bp, slot } });
    }

    function pick(id) {
      selected = selected === id ? null : id;
      refresh();
    }

    function refresh() {
      for (const row of rows) {
        const bp = p.blueprints[row.type];
        const trial = trialPlayer(p, pending, null);
        const t = blueprintTotals(trial, row.type);
        row.stats.setText(totalsText(t, row.type));
        row.stats.setColor(t.energyUse > t.energyProd ? '#ff8c8c' : COLORS.text);
        row.icons.forEach((icon, i) => {
          const slot = bp.slots[i];
          if (!slot) {
            const extra = bp.extras[i - bp.slots.length];
            icon.setVisible(!!extra);
            if (extra) icon.setPart(extra, { extra: true });
            return;
          }
          icon.setVisible(true);
          const returning = isPending(row.type, i);
          const shown = returning ? slot.base : slotPart(slot);
          let mark = returning ? 'bad' : null;
          let note = '';
          if (selected) {
            const err = placementError(row.type, i);
            mark = err ? 'bad' : 'ok';
            note = err
              ? `\n\nCannot place the ${PARTS[selected].name} here: ${err}`
              : `\n\nClick to place the ${PARTS[selected].name} here.${slot.tile && !returning ? ` The ${PARTS[slot.tile].name} goes back to the supply.` : ''}`;
          } else if (returning) note = '\n\nMarked to be returned to the supply. Click again to cancel.';
          else if (slot.tile) note = '\n\nClick to mark this part for return to the supply.';
          icon.setPart(shown, { printed: returning || !slot.tile, mark: selected ? mark : returning ? 'bad' : null, dim: returning });
          icon.tip += note;
        });
      }
      for (const { id, icon } of pal) icon.setPart(id, { selected: id === selected && !ancientPart });
      clearBtn?.setEnabled(pending.length > 0 || (!ancientPart && selected !== null));
      const returnsOnly = pending.length > 0 && !ancientPart ? upgradeError(p, { type: 'upgrade', returns: pending, place: null }) : 'none';
      returnBtn?.setEnabled(returnsOnly === null);
      if (hovered) tips.set(hovered.tip);
    }

    // ------------------------------------------------------------ buttons
    let clearBtn = null;
    let returnBtn = null;
    const by = H - 70;
    if (!ancientPart) {
      clearBtn = new Button(scene, 30, by, 200, 48, 'Clear selection', () => {
        selected = null;
        pending = [];
        refresh();
      }, { size: 17, tip: 'Forget the picked part and any parts marked for return.' });
      returnBtn = new Button(scene, 246, by, 280, 48, 'Return marked parts only', () => {
        finish({ type: 'upgrade', returns: pending, place: null });
      }, { size: 17, fill: 0x3a4d86, tip: 'Take the marked parts off your blueprints without placing a new one. This uses up this Upgrade activation.' });
      body.add([clearBtn, returnBtn]);
    }
    body.add(
      new Button(
        scene,
        W - 330,
        by,
        300,
        48,
        ancientPart ? 'Keep it in my stash' : 'Finish upgrading',
        () => finish(defaultCmd),
        {
          size: 17,
          fill: 0x2f6b4a,
          tip: ancientPart ? 'Keep the part in your stash. You can place it during a later Upgrade.' : 'End the Upgrade action now. Remaining activations are not used.',
        }
      )
    );

    refresh();
  });
}
