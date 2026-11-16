import { COLORS, RES } from '../config.js';
import { TECH_CATEGORIES } from '../data/constants.js';
import { TECHS } from '../data/techs.js';
import { hasTech } from '../core/stats.js';
import { researchCost, techTrackFull } from '../core/queries.js';
import { Button, Modal, drawBox, label } from './kit.js';
import { CATEGORY_COLORS, CATEGORY_NAMES, describeTech } from './names.js';
import { choiceDialog, tipArea } from './dialogs.js';
import { PartIcon } from './partIcon.js';

const CARD_W = 284;
const CARD_H = 64;
const GAP = 7;
const COLS = [
  { cat: 'military', x: 30, sub: 0 },
  { cat: 'grid', x: 322, sub: 0 },
  { cat: 'nano', x: 614, sub: 0 },
  { cat: 'rare', x: 906, sub: 0 },
  { cat: 'rare', x: 1198, sub: 1 },
];

function cardInfo(game, pid, id, options) {
  const s = game.state;
  const p = s.players[pid];
  const t = TECHS[id];
  const tracks = t.rare ? TECH_CATEGORIES : [t.category];
  const perTrack = tracks.filter((c) => !techTrackFull(p, c)).map((c) => ({ track: c, cost: researchCost(p, id, c) }));
  const owned = hasTech(p, id);
  const best = perTrack.length ? Math.min(...perTrack.map((x) => x.cost)) : t.cost;
  const picks = (options || []).filter((o) => o.tech === id);
  let status = '';
  if (owned) status = 'You already own this technology.';
  else if (!perTrack.length) status = 'The matching technology track is full.';
  else if (best > p.res.S) status = `Not enough Science (you have ${p.res.S}).`;
  else if (options && !picks.length) status = 'Not available right now.';
  return { t, perTrack, owned, best, picks, status, left: s.tray[id] };
}

// Technology tray. With `options` (the research decision) cards can be bought; without, it is a read-only view.
export function openTechDialog(scene, game, pid, { options = null, onPick = null, onClose = null } = {}) {
  const s = game.state;
  const p = s.players[pid];
  const w = 1520;
  const h = 810;
  const ctx = { picked: false };
  const modal = new Modal(scene, {
    title: options ? 'Research a Technology' : 'Technology Tray',
    w,
    h,
    onClose: () => {
      if (!ctx.picked) onClose?.();
    },
  });
  const body = modal.body;
  const tips = tipArea(scene, modal, 30, 660, w - 60, 88, { size: 15, hint: 'Hover over a technology to read what it does and what it costs.' });

  body.add(label(scene, w - 70, 30, `Your Science: ${p.res.S}`, { size: 20, bold: true, origin: [1, 0.5], color: RES.S.color }));

  const placed = { military: 0, grid: 0, nano: 0, rare: 0 };
  for (const col of COLS) {
    const color = CATEGORY_COLORS[col.cat];
    if (col.sub === 0) {
      const span = col.cat === 'rare' ? CARD_W * 2 + GAP : CARD_W;
      const g = scene.add.graphics();
      drawBox(g, col.x, 58, span, 26, { fill: 0x16203a, line: color, lineWidth: 2, radius: 7 });
      body.add(g);
      body.add(label(scene, col.x + span / 2, 71, CATEGORY_NAMES[col.cat].toUpperCase(), { size: 15, bold: true, origin: [0.5, 0.5], color }));
    }
  }

  const ids = Object.keys(s.tray)
    .filter((id) => s.tray[id] > 0)
    .sort((a, b) => TECHS[a].cost - TECHS[b].cost || TECHS[a].name.localeCompare(TECHS[b].name));
  const perColumn = 8;
  for (const id of ids) {
    const info = cardInfo(game, pid, id, options);
    const cat = info.t.category;
    const n = placed[cat]++;
    const col = COLS.find((c) => c.cat === cat && c.sub === Math.floor(n / perColumn)) ?? COLS.find((c) => c.cat === cat);
    const row = n % perColumn;
    const x = col.x;
    const y = 92 + row * (CARD_H + GAP);
    drawCard(scene, modal, tips, game, pid, id, info, x, y, !!options, onPick, ctx);
  }
  if (!ids.length) body.add(label(scene, w / 2, 300, 'The Technology Tray is empty.', { size: 22, origin: [0.5, 0.5], color: COLORS.muted }));

  body.add(new Button(scene, w / 2 - 90, h - 54, 180, 42, options ? 'Close (decide later)' : 'Close', () => modal.close(), { size: 17, fill: 0x2f6b4a }));
  return modal;
}

function drawCard(scene, modal, tips, game, pid, id, info, x, y, buying, onPick, ctx) {
  const { t, owned, best, picks, status, left } = info;
  const color = CATEGORY_COLORS[t.category];
  const usable = buying && picks.length > 0;
  const body = modal.body;
  const g = scene.add.graphics();
  const alpha = owned || (buying && !usable) ? 0.5 : 1;
  const paint = (hover) => {
    g.clear();
    drawBox(g, x, y, CARD_W, CARD_H, { fill: hover && usable ? 0x2a3b6e : 0x142040, line: usable ? (hover ? COLORS.gold : color) : 0x34425f, lineWidth: usable ? 3 : 1.5, radius: 9 });
    g.fillStyle(color, usable ? 1 : 0.55);
    g.fillRoundedRect(x + 3, y + 8, 6, CARD_H - 16, 3);
  };
  paint(false);
  g.setAlpha(alpha);
  body.add(g);

  if (t.part) {
    const icon = new PartIcon(scene, x + 40, y + CARD_H / 2, 44);
    icon.setPart(t.part, {});
    icon.hit.disableInteractive();
    icon.setAlpha(alpha);
    body.add(icon);
  } else {
    const c = scene.add.graphics();
    c.fillStyle(color, 0.35);
    c.fillCircle(x + 40, y + CARD_H / 2, 20);
    c.lineStyle(2, color, 1);
    c.strokeCircle(x + 40, y + CARD_H / 2, 20);
    c.setAlpha(alpha);
    body.add(c);
    body.add(label(scene, x + 40, y + CARD_H / 2, t.name[0], { size: 20, bold: true, origin: [0.5, 0.5], color }).setAlpha(alpha));
  }
  body.add(label(scene, x + 70, y + 6, t.name, { size: 15, bold: true, wrap: CARD_W - 120 }).setAlpha(alpha));
  const desc = label(scene, x + 70, y + 26, describeTech(id), { size: 12, wrap: CARD_W - 84, color: COLORS.muted });
  desc.setMaxLines(3);
  desc.setAlpha(alpha);
  body.add(desc);

  const bx = x + CARD_W - 20;
  const by = y + 16;
  const badge = scene.add.graphics();
  const canPay = best <= game.state.players[pid].res.S;
  badge.fillStyle(canPay ? RES.S.color : 0x6b2c2c, 1);
  badge.fillCircle(bx, by, 12);
  badge.lineStyle(2, 0x05070d, 1);
  badge.strokeCircle(bx, by, 12);
  badge.setAlpha(alpha);
  body.add(badge);
  body.add(label(scene, bx, by, String(best), { size: 15, bold: true, origin: [0.5, 0.5], color: '#05070d' }).setAlpha(alpha));
  if (left > 1) body.add(label(scene, bx + 12, y + CARD_H - 6, `${left} left`, { size: 11, origin: [1, 1], color: COLORS.dim }));

  const costs = info.perTrack.map((x2) => `${CATEGORY_NAMES[x2.track]} track: ${x2.cost}`).join(' \u00b7 ');
  const tipText = `${t.name}${t.rare ? ' (Rare)' : ''}\nCost: ${best} Science (printed ${t.cost}, minimum ${t.min}). ${t.rare ? costs : ''}\n${describeTech(id)}${status ? `\n${status}` : usable ? '\nClick to research it.' : ''}`;
  const hit = scene.add.rectangle(x + CARD_W / 2, y + CARD_H / 2, CARD_W, CARD_H, 0xffffff, 0.001).setInteractive({ useHandCursor: usable }).setName(`tech:${id}`);
  hit.on('pointerover', () => {
    paint(true);
    tips.set(tipText);
  });
  hit.on('pointerout', () => {
    paint(false);
    tips.set(null);
  });
  hit.on('pointerup', async () => {
    if (!usable) return;
    let pick = picks[0];
    if (picks.length > 1) {
      const chosen = await choiceDialog(scene, {
        title: `Place ${t.name}`,
        text: 'Rare technologies can go on any Technology Track. The track decides the research discount you get now and the victory points at the end.',
        options: picks.map((o) => ({ label: `${CATEGORY_NAMES[o.track]} track \u2014 cost ${o.cost} Science`, value: o })),
        closable: true,
        w: 720,
      });
      if (!chosen) return;
      pick = chosen;
    }
    ctx.picked = true;
    modal.close();
    onPick?.(pick);
  });
  body.add(hit);
}
