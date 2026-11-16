import { COLORS, RES } from '../config.js';
import { RESOURCES, RESOURCE_NAMES } from '../data/constants.js';
import { tradeRate } from '../core/rules.js';
import { Button, Modal, drawBox, label } from './kit.js';

// Height a wrapped text block will occupy.
export function measureText(scene, str, size, wrap) {
  const t = label(scene, 0, 0, str, { size, wrap });
  const h = t.height;
  t.destroy();
  return h;
}

// A read-only strip inside a modal that mirrors the hover tooltips of whatever the pointer is over.
export function tipArea(scene, modal, x, y, w, h, { size = 15, hint = 'Hover over anything for details.' } = {}) {
  const g = scene.add.graphics();
  drawBox(g, x, y, w, h, { fill: 0x0a1020, line: COLORS.panelLine, radius: 8 });
  const text = label(scene, x + 12, y + 8, hint, { size, wrap: w - 24, color: COLORS.muted, spacing: 2 });
  modal.body.add([g, text]);
  const set = (str) => {
    text.setText(str ?? hint);
    text.setColor(str ? COLORS.text : COLORS.muted);
    for (let s = size; s >= 11; s--) {
      text.setFontSize(s);
      if (text.height <= h - 14) break;
    }
  };
  const on = (str) => set(str);
  scene.events.on('tip', on);
  // Children of a dialog are destroyed one by one, and one of them may still emit a 'tip' (see releaseTipOnDestroy),
  // so the listener has to go as soon as its own text does.
  text.once('destroy', () => scene.events.off('tip', on));
  return { set, text };
}

// Simple modal that returns the value attached to the clicked option (undefined when dismissed).
export function choiceDialog(scene, { title, text = '', options, w = 760, cols = 1, closable = false, btnH = 54, size = 17 }) {
  return new Promise((resolve) => {
    const inner = w - 56;
    const textH = text ? measureText(scene, text, 16, inner) : 0;
    const rows = Math.ceil(options.length / cols);
    const h = 74 + textH + (text ? 18 : 0) + rows * (btnH + 10) + 24;
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    const modal = new Modal(scene, { title, w, h, closable, onClose: () => finish(undefined) });
    let y = 62;
    if (text) {
      modal.body.add(label(scene, 28, y, text, { size: 16, wrap: inner, spacing: 3 }));
      y += textH + 18;
    }
    const gap = 12;
    const bw = (inner - gap * (cols - 1)) / cols;
    options.forEach((o, i) => {
      const bx = 28 + (i % cols) * (bw + gap);
      const by = y + Math.floor(i / cols) * (btnH + 10);
      const b = new Button(
        scene,
        bx,
        by,
        bw,
        btnH,
        o.label,
        () => {
          finish(o.value);
          modal.close();
        },
        { size: o.size ?? size, fill: o.fill ?? 0x22335c, tip: o.tip }
      );
      b.setEnabled(o.enabled !== false);
      modal.body.add(b);
    });
  });
}

// Trade dialog: each click performs one trade through `apply` (a free command) and the dialog stays open.
export function openTradeDialog(scene, { game, pid, apply }) {
  const rate = tradeRate(game.state.players[pid]);
  const w = 820;
  const h = 560;
  const modal = new Modal(scene, { title: 'Trade Resources', w, h });
  const body = modal.body;
  body.add(label(scene, w / 2, 68, `You may exchange ${rate} of one resource for 1 of another, any number of times.`, { size: 17, origin: [0.5, 0], color: COLORS.muted }));

  const stock = {};
  RESOURCES.forEach((r, i) => {
    const x = 60 + i * 235;
    const g = scene.add.graphics();
    drawBox(g, x, 110, 215, 62, { fill: COLORS.panel, line: RES[r].dark, radius: 10 });
    g.fillStyle(RES[r].color, 1);
    g.fillCircle(x + 32, 141, 18);
    body.add(g);
    body.add(label(scene, x + 32, 141, r, { size: 20, bold: true, origin: [0.5, 0.5], color: '#' + RES[r].dark.toString(16).padStart(6, '0') }));
    body.add(label(scene, x + 62, 123, RESOURCE_NAMES[r], { size: 13, color: COLORS.muted }));
    stock[r] = label(scene, x + 62, 138, '0', { size: 26, bold: true });
    body.add(stock[r]);
  });

  body.add(label(scene, 60, 196, 'GIVE', { size: 14, bold: true, color: COLORS.muted }));
  body.add(label(scene, 250, 196, 'GET', { size: 14, bold: true, color: COLORS.muted }));
  const cells = [];
  RESOURCES.forEach((from, i) => {
    const y = 226 + i * 84;
    RESOURCES.forEach((to, j) => {
      const x = 60 + j * 235;
      if (from === to) {
        const g = scene.add.graphics();
        drawBox(g, x, y, 215, 68, { fill: 0x0b1224, line: 0x1c2744, radius: 10 });
        body.add(g);
        return;
      }
      const b = new Button(scene, x, y, 215, 68, `${rate} ${RESOURCE_NAMES[from]}\n\u2192 1 ${RESOURCE_NAMES[to]}`, () => {
        apply({ type: 'trade', from, to });
        paint();
      }, { size: 17, fill: 0x22335c });
      body.add(b);
      cells.push({ b, from, to });
    });
  });

  function paint() {
    const p = game.state.players[pid];
    for (const r of RESOURCES) stock[r].setText(String(p.res[r]));
    for (const c of cells) c.b.setEnabled(p.res[c.from] >= rate && !!game.decision?.allowFree);
  }
  paint();
  body.add(new Button(scene, w / 2 - 80, h - 66, 160, 44, 'Close', () => modal.close(), { size: 18, fill: 0x2f6b4a }));
  return modal;
}

const HELP = [
  {
    title: 'GOAL',
    text: 'After 8 rounds the player with the most Victory Points wins. Points come from the sectors you control (printed VP), Monoliths (3 each), Reputation tiles won in battle, Discovery Tiles kept for points (2 each), your Technology tracks (4 techs = 1 VP, 5 = 2, 6 = 3, 7 = 5 per track) and species bonuses.',
  },
  {
    title: 'A ROUND',
    text: '1. Action phase: players alternate. Move one Influence Disc from your track onto an action (Explore, Research, Upgrade, Build, Move, Influence) and perform it, or Pass. After passing you may still spend a disc on a Reaction (Upgrade, Build or Move, one activation) during the opponent\u2019s turns.\n2. Combat phase: sectors with hostile ships fight automatically; you decide when to retreat. Winners draw Reputation tiles.\n3. Upkeep phase: place Colony Ships, collect Money and pay the Civilization Upkeep (it rises with every disc you take off the Influence Track), then collect Materials and Science.\n4. Cleanup: discs return to the track, Colony Ships are readied and new technologies enter the tray.',
  },
  {
    title: 'READING THE MAP',
    text: 'The colour of a sector\u2019s rim shows its ring. Small squares are population spots (brown = Materials, pink = Science, yellow = Money, three dots = any; a gold star means Advanced Population). Half-discs on the edges are wormholes: ships and Influence can only travel between sectors whose wormholes meet. The disc in the middle shows who controls a sector. Ship icons are tinted with the owner\u2019s colour and show a count when stacked. A \u201c?\u201d marks an unclaimed Discovery Tile, a diamond an Artifact, and Ancient ships block sectors until destroyed.',
  },
  {
    title: 'CONTROLS',
    text: 'Click highlighted sectors, zones and buttons to answer the prompt at the bottom. Drag the map to pan, use the mouse wheel to zoom and \u201cFit view\u201d to recentre. Hover over almost anything (sectors, parts, technologies, counters) to read about it in the information box. \u201cColonize\u201d and \u201cTrade\u201d at the bottom right can be used during any action or the Upkeep phase. The AI speed and the \u201cSkip reactions\u201d option are in the top bar. Your game is saved automatically.',
  },
];

export function openHelp(scene) {
  const w = 1240;
  const h = 800;
  const modal = new Modal(scene, { title: 'How to Play', w, h });
  const colW = (w - 100) / 2;
  let ly = 66;
  let ry = 66;
  HELP.forEach((sec, i) => {
    const left = i % 2 === 0;
    const x = left ? 34 : 66 + colW;
    const y = left ? ly : ry;
    const head = label(scene, x, y, sec.title, { size: 18, bold: true, color: COLORS.goldText });
    const body = label(scene, x, y + 28, sec.text, { size: 15, wrap: colW, spacing: 4 });
    modal.body.add([head, body]);
    const next = y + 28 + body.height + 26;
    if (left) ly = next;
    else ry = next;
  });
  modal.body.add(new Button(scene, w / 2 - 80, h - 62, 160, 42, 'Close', () => modal.close(), { size: 18, fill: 0x2f6b4a }));
  return modal;
}
