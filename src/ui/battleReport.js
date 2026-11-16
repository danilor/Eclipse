import { COLORS } from '../config.js';
import { NPC } from '../data/constants.js';
import { SPECIES } from '../data/species.js';
import { Button, Modal, dieFace, drawBox, label } from './kit.js';
import { plural, shipName } from './names.js';

const NEUTRAL_COLOR = 0x9aa4b8;

export const ownerColor = (state, owner) => (owner === NPC ? NEUTRAL_COLOR : SPECIES[state.players[owner].species].color);

export function ownerLabel(state, owner, humanId) {
  if (owner === NPC) return 'Neutral';
  return `${state.players[owner].name}${owner === humanId ? ' (you)' : ''}`;
}

const groupTypes = (list) => {
  const map = new Map();
  for (const t of list) map.set(t, (map.get(t) ?? 0) + 1);
  return [...map].map(([type, n]) => plural(n, shipName(type))).join(', ');
};

// Collects the battle events produced by each applied command into per-sector records, so the UI
// can show a report afterwards (and a progress summary while a battle waits for a retreat decision).
export class BattleTracker {
  constructor() {
    this.seen = new Map();
    this.current = null;
    this.finished = [];
    this.unsettled = [];
  }

  // Ships can disappear before their events are read, so remember what each id was.
  snapshot(state) {
    for (const x of state.ships) this.seen.set(x.id, { owner: x.owner, type: x.type });
  }

  consume(events, state) {
    for (const e of events) this.handle(e);
    this.snapshot(state);
  }

  handle(e) {
    const cur = this.current;
    switch (e.type) {
      case 'battleStart': {
        if (this.unsettled.length && this.unsettled[0].at !== e.at) this.unsettled = [];
        this.current = {
          at: e.at,
          attacker: e.attacker,
          defender: e.defender,
          round: 0,
          volleys: [],
          destroyed: [],
          retreats: [],
          reputation: {},
          ended: false,
          survivor: null,
        };
        break;
      }
      case 'engagementRound':
        if (cur) cur.round = e.round;
        break;
      case 'volley':
        if (cur) {
          cur.volleys.push({
            round: cur.round,
            owner: e.owner,
            type: e.shipType,
            dice: e.dice,
            hits: e.hits.map((h) => ({ ...h, type: this.seen.get(h.target)?.type ?? null, owner: this.seen.get(h.target)?.owner ?? null })),
          });
        }
        break;
      case 'shipDestroyed':
        if (cur) cur.destroyed.push({ owner: e.owner, type: e.shipType });
        break;
      case 'retreating':
        if (cur) cur.retreats.push({ owner: e.owner, type: e.shipType, to: e.to, done: false });
        break;
      case 'retreated':
        if (cur) {
          const r = cur.retreats.find((x) => x.owner === e.owner && x.type === e.shipType && !x.done);
          if (r) r.done = true;
          else cur.retreats.push({ owner: e.owner, type: e.shipType, to: null, done: true });
        }
        break;
      case 'battleEnd':
        if (cur) {
          cur.ended = true;
          cur.survivor = e.survivor;
          this.finished.push(cur);
          this.unsettled.push(cur);
          this.current = null;
        }
        break;
      case 'reputation':
        for (const rec of this.unsettled) rec.reputation[e.pid] = e.kept;
        break;
      default:
    }
  }

  takeFinished() {
    const out = this.finished;
    this.finished = [];
    return out;
  }
}

function forcesText(state, at, owner, humanId) {
  const here = state.ships.filter((x) => x.at === at && x.owner === owner);
  const head = ownerLabel(state, owner, humanId);
  if (!here.length) return `${head}: no ships left`;
  const groups = new Map();
  for (const x of here) {
    const g = groups.get(x.type) ?? { n: 0, hurt: 0, retreating: 0 };
    g.n += 1;
    if (x.damage > 0) g.hurt += 1;
    if (x.retreat) g.retreating += 1;
    groups.set(x.type, g);
  }
  const bits = [...groups].map(([type, g]) => {
    const extra = [g.hurt ? `${g.hurt} damaged` : '', g.retreating ? `${g.retreating} retreating` : ''].filter(Boolean).join(', ');
    return `${plural(g.n, shipName(type))}${extra ? ` (${extra})` : ''}`;
  });
  return `${head}: ${bits.join(', ')}`;
}

// A few lines about the battle in progress, for the retreat decision.
export function battleProgress(state, record, at, humanId) {
  const lines = [];
  const rec = record ?? null;
  const owners = rec ? [rec.attacker, rec.defender] : [humanId, ...state.ships.filter((x) => x.at === at && x.owner !== humanId).map((x) => x.owner)];
  lines.push(`Battle in sector ${state.map[at].id}${rec?.round ? `, engagement round ${rec.round}` : ''}.`);
  for (const o of [...new Set(owners)]) lines.push(forcesText(state, at, o, humanId));
  const last = rec?.volleys.slice(-2) ?? [];
  for (const v of last) {
    const hits = v.hits.length;
    lines.push(`${ownerLabel(state, v.owner, humanId)}: ${shipName(v.type)} volley, ${v.dice.length} dice, ${hits ? `${hits} hit${hits === 1 ? '' : 's'}` : 'no hits'}.`);
  }
  return lines.join('\n');
}

const hitSummary = (v) => {
  if (!v.hits.length) return 'No hits';
  const parts = new Map();
  for (const h of v.hits) {
    const name = h.type ? shipName(h.type) : 'ship';
    const key = h.destroyed ? `${name} destroyed` : `${name} damaged`;
    parts.set(key, (parts.get(key) ?? 0) + 1);
  }
  const list = [...parts].map(([k, n]) => (n > 1 ? `${n}\u00d7 ${k}` : k)).join(', ');
  return `${v.hits.length} hit${v.hits.length === 1 ? '' : 's'}: ${list}`;
};

const sideStats = (record, owner) => {
  const mine = record.volleys.filter((v) => v.owner === owner);
  return {
    dice: mine.reduce((a, v) => a + v.dice.length, 0),
    hits: mine.reduce((a, v) => a + v.hits.length, 0),
    damage: mine.reduce((a, v) => a + v.hits.reduce((b, h) => b + h.dmg, 0), 0),
    lost: record.destroyed.filter((d) => d.owner === owner).map((d) => d.type),
    retreated: record.retreats.filter((r) => r.owner === owner).map((r) => r.type),
  };
};

const DICE_PER_ROW = 12;
const DICE_PITCH = 44;

// Modal report of one battle. Resolves when closed.
export function openBattleReport(scene, { state, record, humanId }) {
  return new Promise((resolve) => {
    const w = 1220;
    const h = 780;
    const sector = state.map[record.at]?.id ?? '?';
    const modal = new Modal(scene, { title: `Battle in sector ${sector}`, w, h, onClose: () => resolve() });
    const body = modal.body;
    const pages = [{ kind: 'summary' }];
    const rounds = [...new Set(record.volleys.map((v) => v.round))].sort((a, b) => a - b);
    for (const r of rounds) pages.push({ kind: 'round', round: r, volleys: record.volleys.filter((v) => v.round === r) });
    let index = 0;
    const content = scene.add.container(0, 0);
    body.add(content);
    const pageText = label(scene, w / 2, h - 46, '', { size: 17, color: COLORS.muted, origin: [0.5, 0.5] });
    body.add(pageText);

    const addText = (x, y, str, o) => {
      const t = label(scene, x, y, str, o);
      content.add(t);
      return t;
    };

    const header = (y) => {
      const a = ownerLabel(state, record.attacker, humanId);
      const d = ownerLabel(state, record.defender, humanId);
      addText(40, y, `${a} attacked ${d}`, { size: 20, bold: true });
    };

    const drawSummary = () => {
      header(62);
      const winner = record.survivor;
      let outcome;
      let color = COLORS.text;
      if (winner == null) outcome = 'No one holds the sector: every surviving ship retreated or was destroyed.';
      else if (winner === humanId) {
        outcome = 'Victory! You hold the field.';
        color = '#7dffa8';
      } else if (humanId != null && (record.attacker === humanId || record.defender === humanId)) {
        outcome = `Defeat. ${ownerLabel(state, winner, humanId)} holds the field.`;
        color = '#ff8c8c';
      } else outcome = `${ownerLabel(state, winner, humanId)} holds the field.`;
      addText(40, 100, outcome, { size: 26, bold: true, color });

      [record.attacker, record.defender].forEach((owner, i) => {
        const x = 40 + i * 580;
        const g = scene.add.graphics();
        drawBox(g, x, 160, 560, 420, { fill: 0x121b33, line: ownerColor(state, owner), lineWidth: 3, radius: 12 });
        content.add(g);
        const st = sideStats(record, owner);
        addText(x + 20, 176, ownerLabel(state, owner, humanId), { size: 24, bold: true, color: ownerColor(state, owner) });
        addText(x + 20, 210, owner === record.attacker ? 'Attacker' : 'Defender', { size: 15, color: COLORS.muted });
        const lines = [
          `Dice rolled: ${st.dice}`,
          `Hits scored: ${st.hits}  (${st.damage} damage)`,
          `Ships lost: ${st.lost.length ? groupTypes(st.lost) : 'none'}`,
          `Retreated: ${st.retreated.length ? groupTypes(st.retreated) : 'none'}`,
        ];
        const rep = record.reputation[owner];
        if (owner !== NPC && rep !== undefined) lines.push(rep ? `Reputation tile kept: ${rep} VP` : 'Drew Reputation tiles but kept none.');
        addText(x + 20, 244, lines.join('\n\n'), { size: 18, wrap: 520, spacing: 3 });
      });
      const rem = state.ships.filter((s0) => s0.at === record.at);
      if (rem.length) {
        const owners = [...new Set(rem.map((s0) => s0.owner))];
        const text = owners.map((o) => forcesText(state, record.at, o, humanId)).join('   |   ');
        addText(40, 600, `Now in the sector \u2014 ${text}`, { size: 16, color: COLORS.muted, wrap: w - 80 });
      }
      addText(40, 650, 'Page through the rounds with the arrows to see every roll.', { size: 15, color: COLORS.muted });
    };

    const drawRound = (page) => {
      header(62);
      addText(40, 98, page.round === 0 ? 'Missile volleys (fired once, before the first round)' : `Engagement round ${page.round}`, { size: 22, bold: true, color: COLORS.goldText });
      addText(40, 130, 'A die hits on a 6, or when its roll + the ship\u2019s Computers \u2212 the target\u2019s Shields is 6 or more (a 1 always misses). Faded dice missed.', { size: 14, color: COLORS.muted, wrap: w - 80 });
      let y = 170;
      for (const v of page.volleys) {
        const rowsNeeded = Math.max(1, Math.ceil(v.dice.length / DICE_PER_ROW));
        const rowH = Math.max(58, rowsNeeded * 48 + 8);
        if (y + rowH > h - 80) break;
        const g = scene.add.graphics();
        drawBox(g, 30, y, w - 60, rowH, { fill: 0x121b33, line: ownerColor(state, v.owner), lineWidth: 2, radius: 8 });
        content.add(g);
        addText(46, y + 8, `${ownerLabel(state, v.owner, humanId)}`, { size: 16, bold: true, color: ownerColor(state, v.owner), wrap: 250 });
        addText(46, y + 30, `${shipName(v.type)} volley`, { size: 15, color: COLORS.muted });
        const hitDice = new Set(v.hits.map((x) => x.die));
        v.dice.forEach((d, i) => {
          const cx = 330 + (i % DICE_PER_ROW) * DICE_PITCH;
          const cy = y + 29 + Math.floor(i / DICE_PER_ROW) * 48;
          content.add(dieFace(scene, cx, cy, 38, d.color, d.roll, hitDice.has(i)));
        });
        addText(w - 330, y + rowH / 2, hitSummary(v), { size: 16, origin: [0, 0.5], wrap: 280, color: v.hits.length ? '#ffd27a' : COLORS.muted });
        y += rowH + 8;
      }
    };

    const showPage = () => {
      content.removeAll(true);
      const page = pages[index];
      if (page.kind === 'summary') drawSummary();
      else drawRound(page);
      pageText.setText(index === 0 ? `Summary \u00b7 ${pages.length - 1} round page${pages.length === 2 ? '' : 's'}` : `Page ${index} of ${pages.length - 1}`);
      prev.setEnabled(index > 0);
      next.setEnabled(index < pages.length - 1);
    };

    const prev = new Button(scene, 40, h - 70, 160, 48, '\u25c0 Previous', () => {
      index = Math.max(0, index - 1);
      showPage();
    }, { size: 18 });
    const next = new Button(scene, 216, h - 70, 160, 48, 'Next \u25b6', () => {
      index = Math.min(pages.length - 1, index + 1);
      showPage();
    }, { size: 18 });
    body.add([prev, next, new Button(scene, w - 220, h - 70, 180, 48, 'Continue', () => modal.close(), { size: 20, fill: 0x2f6b4a })]);
    showPage();
  });
}
