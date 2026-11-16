import { COLORS } from '../config.js';
import { SHIP_TYPES } from '../data/constants.js';
import { canBuildType, structureCost } from '../core/rules.js';
import { enemyShipsAt } from '../core/queries.js';
import { shipTotals } from '../core/stats.js';
import { describeSector, statLine } from './info.js';
import { plural, shipName } from './names.js';

const BUILD_NAMES = { interceptor: 'Interceptor', cruiser: 'Cruiser', dreadnought: 'Dreadnought', starbase: 'Starbase', orbital: 'Orbital', monolith: 'Monolith' };
const ACTIVE = 0x3a5aa8;

export const activationTitle = (d, name) =>
  `${name}${d.ctx.of > 1 ? ` \u2014 activation ${d.ctx.index + 1} of ${d.ctx.of}` : ''}${d.ctx.reaction ? ' (reaction)' : ''}`;

const sectorNo = (ui, k) => ui.state.map[k]?.id ?? '?';
const done = (ui, text, tip) => ({ text, fn: () => ui.submit({ type: 'done' }), tip });

function explore(ui, d) {
  const render = () => {
    const zones = ui.game.decision.options.filter((o) => o.type === 'explore').map((o) => o.zone);
    ui.highlight(zones.map((key) => ({ key, color: COLORS.target, kind: 'zone' })));
    ui.onMap((k) => {
      if (zones.includes(k)) ui.submit({ type: 'explore', zone: k });
    });
    ui.show({
      title: activationTitle(d, 'Explore'),
      hint: 'Click a glowing empty zone to reveal a new sector there. You may explore next to a sector you control or hold a ship in, along one of its wormholes.',
      buttons: [done(ui, 'Skip exploring', 'Do not explore. Any remaining activations of this action are lost.')],
    });
  };
  ui.redraw = render;
  render();
}

function placeSector(ui, d) {
  const { zone, tiles } = d.ctx;
  const places = d.options.filter((o) => o.type === 'place');
  const indexes = [...new Set(places.map((o) => o.index))];
  const pick = { index: indexes[0] ?? null, r: 0 };
  const rotations = () => places.filter((o) => o.index === pick.index).map((o) => o.rot);

  const rotate = () => {
    const list = rotations();
    if (list.length > 1) {
      pick.r = (pick.r + 1) % list.length;
      render();
    }
  };

  const render = () => {
    const buttons = [];
    let hint = 'No rotation of this sector connects by a wormhole, so it cannot be placed. Discarding it returns it to the supply.';
    ui.pin(null);
    if (pick.index != null) {
      const list = rotations();
      const rot = list[pick.r % list.length];
      const id = tiles[pick.index];
      ui.view.setGhost(zone, id, rot);
      ui.pin(describeSector(id));
      hint = `Sector ${id}: ${list.length > 1 ? 'turn it until the wormholes line up the way you like.' : 'this is the only way it can connect.'} A new sector needs a wormhole connection to one of your sectors or ships.`;
      if (indexes.length > 1) {
        for (const i of indexes) {
          buttons.push({
            text: `Sector ${tiles[i]}`,
            fill: i === pick.index ? ACTIVE : undefined,
            tip: describeSector(tiles[i]),
            fn: () => {
              pick.index = i;
              pick.r = 0;
              render();
            },
          });
        }
      }
      buttons.push({ text: `Rotate\n(${(pick.r % list.length) + 1} of ${list.length})`, enabled: list.length > 1, fn: rotate, tip: 'Turn the sector to the next legal orientation. You can also click it on the map.' });
      buttons.push({ text: 'Place sector', fill: 0x2f6b4a, fn: () => ui.submit({ type: 'place', index: pick.index, rot }) });
    } else ui.view.setGhost(null);
    buttons.push({ text: 'Discard', fill: 0x6b3030, fn: () => ui.submit({ type: 'discard' }), tip: 'Do not place the sector; it goes to the discard pile.' });
    ui.show({ title: 'Place the new sector', hint, buttons });
  };

  ui.highlight([{ key: zone, color: COLORS.target, kind: 'zone' }]);
  ui.onMap((k) => {
    if (k === zone) rotate();
  });
  ui.redraw = render;
  render();
}

function takeControl(ui, d) {
  const render = () => {
    const targets = ui.game.decision.options.filter((o) => o.type === 'influence').map((o) => o.to);
    const explore = d.ctx.reason === 'explore';
    ui.highlight(targets.map((key) => ({ key, color: COLORS.target, kind: 'select' })));
    ui.onMap((k) => {
      if (targets.includes(k)) ui.submit({ type: 'influence', from: 'track', to: k });
    });
    const buttons = explore
      ? [
          { text: 'Take control\n(place Influence Disc)', fill: 0x2f6b4a, w: 230, fn: () => ui.submit({ type: 'influence', from: 'track', to: d.ctx.at }) },
          done(ui, 'Leave it uncontrolled'),
        ]
      : [...targets.map((k) => ({ text: `Take sector ${sectorNo(ui, k)}`, fn: () => ui.submit({ type: 'influence', from: 'track', to: k }) })), done(ui, 'Done')];
    ui.show({
      title: explore ? 'Take control of the new sector?' : 'Take control of sectors?',
      hint: explore
        ? 'Placing an Influence Disc from your track gives you the sector\u2019s Victory Points and lets you settle it, but every disc taken off the track raises your upkeep.'
        : 'You hold ships in sectors nobody controls. Click one to place an Influence Disc from your track there, or press Done.',
      buttons,
    });
  };
  ui.redraw = render;
  render();
}

function build(ui, d) {
  let what = null;
  const render = () => {
    const p = ui.player;
    const opts = ui.game.decision.options.filter((o) => o.type === 'build');
    const possible = new Set(opts.map((o) => o.what));
    if (!possible.has(what)) what = [...possible][0] ?? null;
    ui.highlight(opts.filter((o) => o.what === what).map((o) => ({ key: o.at, color: COLORS.target, kind: 'zone' })));
    ui.onMap((k) => {
      const cmd = opts.find((o) => o.what === what && o.at === k);
      if (cmd) ui.submit(cmd);
    });
    const buttons = [...SHIP_TYPES, 'orbital', 'monolith']
      .filter((w) => canBuildType(ui.state, p, w))
      .map((w) => {
        const cost = structureCost(p, w);
        return {
          text: `${BUILD_NAMES[w]}\n${cost} Materials`,
          w: 128,
          enabled: possible.has(w),
          fill: w === what ? ACTIVE : undefined,
          tip: possible.has(w) ? `${BUILD_NAMES[w]}: costs ${cost} Materials. Pick it, then click a highlighted sector.` : `${BUILD_NAMES[w]} costs ${cost} Materials (you have ${p.res.M}), or its limit is reached.`,
          fn: () => {
            what = w;
            render();
          },
        };
      });
    buttons.push(done(ui, 'Done building'));
    ui.show({
      title: activationTitle(d, 'Build'),
      hint: `Choose what to build, then click one of your highlighted sectors. You have ${p.res.M} Materials. Ships appear in the sector; Orbitals and Monoliths are placed on it.`,
      buttons,
    });
  };
  ui.redraw = render;
  render();
}

function move(ui, d) {
  const sel = { from: null, type: null };
  const render = () => {
    const s = ui.state;
    const p = ui.player;
    const opts = ui.game.decision.options.filter((o) => o.type === 'move');
    const shipOf = (id) => s.ships.find((x) => x.id === id);
    const origins = new Map();
    for (const o of opts) {
      const ship = shipOf(o.ship);
      if (!ship) continue;
      const types = origins.get(ship.at) ?? new Map();
      const list = types.get(ship.type) ?? [];
      if (!list.includes(ship.id)) list.push(ship.id);
      types.set(ship.type, list);
      origins.set(ship.at, types);
    }
    if (sel.from && !origins.has(sel.from)) sel.from = sel.type = null;
    if (sel.from && sel.type && !origins.get(sel.from).has(sel.type)) sel.type = null;
    if (sel.from && !sel.type && origins.get(sel.from).size === 1) sel.type = [...origins.get(sel.from).keys()][0];

    const buttons = [];
    if (!sel.from) {
      ui.highlight([...origins.keys()].map((key) => ({ key, color: COLORS.accent, kind: 'select' })));
      ui.onMap((k) => {
        if (origins.has(k)) {
          sel.from = k;
          sel.type = null;
          render();
        }
      });
      ui.show({
        title: activationTitle(d, 'Move'),
        hint: 'Click a sector holding one of your ships to pick the ship you want to move.',
        buttons: [done(ui, 'Done moving', 'Stop moving. Any remaining activations are lost.')],
      });
      return;
    }
    const types = origins.get(sel.from);
    const back = { text: 'Back', fn: () => { sel.from = sel.type = null; render(); } };
    if (!sel.type) {
      ui.highlight([{ key: sel.from, color: COLORS.accent, kind: 'origin' }]);
      ui.onMap((k) => {
        if (k !== sel.from) {
          sel.from = origins.has(k) ? k : null;
          sel.type = null;
          render();
        }
      });
      for (const [type, ids] of types) {
        const sample = shipOf(ids[0]);
        buttons.push({ text: `${plural(ids.length, shipName(type))}`, w: 170, tip: statLine(shipTotals(s, sample)), fn: () => { sel.type = type; render(); } });
      }
      buttons.push(back);
      ui.show({ title: activationTitle(d, 'Move'), hint: `Sector ${sectorNo(ui, sel.from)} holds several kinds of ships. Which one moves?`, buttons });
      return;
    }
    const ids = types.get(sel.type);
    const shipId = ids[0];
    const dests = opts.filter((o) => o.ship === shipId).map((o) => o.to);
    ui.highlight([
      { key: sel.from, color: COLORS.accent, kind: 'origin' },
      ...dests.map((key) => ({ key, color: enemyShipsAt(s, p.id, key).length ? COLORS.danger : COLORS.target, kind: 'zone' })),
    ]);
    ui.onMap((k) => {
      if (dests.includes(k)) ui.submit({ type: 'move', ship: shipId, to: k });
      else if (origins.has(k) && k !== sel.from) {
        sel.from = k;
        sel.type = null;
        render();
      } else if (k === sel.from) {
        sel.from = sel.type = null;
        render();
      }
    });
    const total = shipTotals(s, shipOf(shipId));
    ui.show({
      title: activationTitle(d, `Move a ${shipName(sel.type)}`),
      hint: `Click a destination (red marks enemy ships). Drive ${total.drive}: it can travel that many wormhole jumps in one move. The ship leaves sector ${sectorNo(ui, sel.from)}.`,
      buttons: [back, done(ui, 'Done moving')],
    });
  };
  ui.redraw = render;
  render();
}

function influence(ui, d) {
  let from = null;
  const render = () => {
    const opts = ui.game.decision.options.filter((o) => o.type === 'influence');
    const sectors = [...new Set(opts.map((o) => o.from).filter((x) => x !== 'track'))];
    if (from && !sectors.includes(from)) from = null;
    const trackTargets = [...new Set(opts.filter((o) => o.from === 'track').map((o) => o.to))];
    const buttons = [];
    if (!from) {
      ui.highlight([
        ...sectors.map((key) => ({ key, color: COLORS.accent, kind: 'select' })),
        ...trackTargets.map((key) => ({ key, color: COLORS.target, kind: 'zone' })),
      ]);
      ui.onMap((k) => {
        if (trackTargets.includes(k)) ui.submit({ type: 'influence', from: 'track', to: k });
        else if (sectors.includes(k)) {
          from = k;
          render();
        }
      });
      ui.show({
        title: activationTitle(d, 'Influence'),
        hint: 'Click one of your sectors (blue) to lift its Influence Disc and move it, or click a gold sector to place a disc from your track there. Discs you take back to the track lower your upkeep.',
        buttons: [done(ui, 'Done', 'Stop moving discs. Any remaining activations are lost.')],
      });
      return;
    }
    const dests = opts.filter((o) => o.from === from).map((o) => o.to);
    ui.highlight([
      { key: from, color: COLORS.accent, kind: 'origin' },
      ...dests.filter((x) => x !== 'track').map((key) => ({ key, color: COLORS.target, kind: 'zone' })),
    ]);
    ui.onMap((k) => {
      if (dests.includes(k)) ui.submit({ type: 'influence', from, to: k });
      else {
        from = sectors.includes(k) && k !== from ? k : null;
        render();
      }
    });
    buttons.push({
      text: 'Return disc\nto the track',
      w: 150,
      enabled: dests.includes('track'),
      fill: 0x2f6b4a,
      tip: 'Take the Influence Disc off this sector. Its Population Cubes return to your tracks and your upkeep goes down.',
      fn: () => ui.submit({ type: 'influence', from, to: 'track' }),
    });
    buttons.push({ text: 'Cancel', fn: () => { from = null; render(); } });
    buttons.push(done(ui, 'Done'));
    ui.show({
      title: activationTitle(d, `Move the disc from sector ${sectorNo(ui, from)}`),
      hint: 'Click a gold sector to move the disc there, or return it to the track. Taking a sector\u2019s disc off removes its Population Cubes from the board (they go back to your tracks).',
      buttons,
    });
  };
  ui.redraw = render;
  render();
}

export const MAP_HANDLERS = { explore, placeSector, takeControl, build, move, influence };
