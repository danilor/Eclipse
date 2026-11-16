import { COLORS, RES } from '../config.js';
import { ACTIONS, RESOURCE_NAMES } from '../data/constants.js';
import { PARTS } from '../data/parts.js';
import { SECTORS } from '../data/sectors.js';
import { TECHS } from '../data/techs.js';
import { popProduction } from '../core/queries.js';
import { activationsFor, tradeRate } from '../core/rules.js';
import { battleProgress } from './battleReport.js';
import { choiceDialog, openTradeDialog } from './dialogs.js';
import { toast } from './kit.js';
import { MAP_HANDLERS, activationTitle } from './mapPrompts.js';
import { ACTION_INFO, CATEGORY_NAMES, describePart, describeTech, plural, shipName } from './names.js';
import { openTechDialog } from './techDialog.js';
import { openUpgradeDialog } from './upgradeDialog.js';

const GREEN = 0x2f6b4a;
const RED = 0x7a2f2f;

const WHY = {
  explore: 'No unexplored zone is open to you: it must touch a sector you control (or hold a ship in) through a wormhole.',
  research: 'You cannot afford any technology in the tray right now.',
  upgrade: 'You have no ship part you could place on a blueprint.',
  build: 'You need Materials and a sector you control to build anything.',
  move: 'None of your ships can move.',
  influence: 'No Influence Disc can be moved and your Colony Ships are all ready.',
};

// Drives the prompt bar, the map and the dialogs for the decisions the human seat has to make. One instance
// serves a whole match; `ask(decision)` resolves with the command that should be applied to the game.
export class Presenter {
  constructor({ scene, game, view, prompt, pid, applyFree, tracker = null }) {
    this.scene = scene;
    this.game = game;
    this.view = view;
    this.prompt = prompt;
    this.pid = pid;
    this.applyFree = applyFree;
    this.tracker = tracker;
    this.d = null;
    this.resolve = null;
    this.mapHandler = null;
    this.redraw = null;
    this.colonizing = false;
    this.highlights = [];
    this.token = 0;
    this.fightOn = null;
    this.onClick = (key, local) => this.routeClick(key, local);
    view.on('click', this.onClick);
  }

  get state() {
    return this.game.state;
  }

  get player() {
    return this.state.players[this.pid];
  }

  get pending() {
    return !!this.resolve;
  }

  // ------------------------------------------------------------------ lifecycle

  ask(d) {
    this.cancel();
    this.d = d;
    return new Promise((resolve) => {
      this.resolve = resolve;
      const run = DIALOGS[d.kind] ?? MAP_HANDLERS[d.kind] ?? fallback;
      const rescue = (err) => {
        console.error(`Could not present the "${d.kind}" decision`, err);
        if (this.resolve && this.d === d) fallback(this, d);
      };
      try {
        const out = run(this, d);
        if (out?.catch) out.catch(rescue);
      } catch (err) {
        rescue(err);
      }
    });
  }

  // Validates and hands the command to whoever is waiting in ask().
  submit(cmd) {
    if (!this.resolve) return false;
    const err = this.game.validate(cmd);
    if (err) {
      this.warn(err);
      return false;
    }
    const resolve = this.resolve;
    this.cancel();
    this.closeModals();
    this.prompt.clear();
    resolve(cmd);
    return true;
  }

  warn(text) {
    toast(this.scene, text, { color: COLORS.danger, duration: 2600, size: 20 });
  }

  info(text) {
    toast(this.scene, text, { color: COLORS.text, duration: 2200, size: 20 });
  }

  closeModals() {
    for (const m of [...(this.scene.modals ?? [])]) m.close();
  }

  cancel() {
    this.token += 1;
    this.resolve = null;
    this.mapHandler = null;
    this.redraw = null;
    this.colonizing = false;
    this.highlights = [];
    this.view.setHighlights([]);
    this.view.setSquareTargets([]);
    this.view.setGhost(null);
    this.pin(null);
  }

  destroy() {
    this.cancel();
    this.view.off('click', this.onClick);
  }

  // ------------------------------------------------------------------ helpers for the prompts

  highlight(list) {
    this.highlights = list;
    this.view.setHighlights(this.colonizing ? [] : list);
    if (!this.colonizing && list.some((h) => !this.view.isVisible(h.key))) this.view.fit(true);
  }

  onMap(fn) {
    this.mapHandler = fn;
  }

  pin(text) {
    this.scene.events.emit('pin', text);
  }

  show({ title, hint, buttons = [] }) {
    const free = this.d?.allowFree ? this.freeButtons() : [];
    this.prompt.set({ title, hint, buttons, free });
  }

  routeClick(key, local) {
    if (!this.resolve) return;
    if (this.colonizing) this.colonizeClick(key, local);
    else this.mapHandler?.(key, local);
  }

  // ------------------------------------------------------------------ free actions: colony ships and trading

  colonizeCommands() {
    return this.d?.allowFree ? this.game.freeCommands().filter((c) => c.type === 'colonize') : [];
  }

  freeButtons() {
    const p = this.player;
    const cmds = this.game.freeCommands();
    const canColonize = cmds.some((c) => c.type === 'colonize');
    const canTrade = cmds.some((c) => c.type === 'trade');
    const rate = tradeRate(p);
    const colony = this.colonizing
      ? { text: 'Stop placing cubes', fill: RED, tip: 'Leave Colony Ship mode and go back to the current action.', fn: () => this.setColonizing(false) }
      : {
          text: `Colony Ships (${p.colony.up} ready)`,
          enabled: canColonize,
          fill: canColonize ? GREEN : undefined,
          tip: canColonize
            ? 'Free action: spend a ready Colony Ship to move a Population Cube from your tracks onto an empty square of a sector you control. Click this, then click a glowing square.'
            : p.colony.up
              ? 'None of your sectors has an empty Population square you could fill right now.'
              : 'You have no ready Colony Ship. The Influence action readies two of them.',
          fn: () => this.setColonizing(true),
        };
    const trade = {
      text: 'Trade resources',
      enabled: canTrade,
      tip: canTrade ? `Free action: exchange ${rate} of one resource for 1 of another.` : `You need at least ${rate} of a resource to trade it away.`,
      fn: () => this.openTrade(),
    };
    return [colony, trade];
  }

  openTrade() {
    openTradeDialog(this.scene, { game: this.game, pid: this.pid, apply: (cmd) => this.runFree(cmd) });
  }

  // Free commands do not advance the decision; the options of the current decision are recomputed instead.
  runFree(cmd) {
    const err = this.game.validate(cmd);
    if (err) {
      this.warn(err);
      return false;
    }
    this.applyFree(cmd);
    this.syncColonize();
    this.redraw?.();
    return true;
  }

  setColonizing(on) {
    this.colonizing = on && this.colonizeCommands().length > 0;
    this.view.setHighlights(this.colonizing ? [] : this.highlights);
    this.syncColonize();
    this.redraw?.();
  }

  syncColonize() {
    const targets = [];
    if (this.colonizing) {
      const cmds = this.colonizeCommands();
      if (!cmds.length) {
        this.colonizing = false;
        this.view.setHighlights(this.highlights);
        this.info('Colony Ship mode is over: no more cubes can be placed right now.');
      }
      const seen = new Set();
      for (const c of cmds) {
        const id = `${c.at}|${c.sq}`;
        if (seen.has(id)) continue;
        seen.add(id);
        targets.push({ at: c.at, sq: c.sq });
      }
    }
    this.view.setSquareTargets(targets);
  }

  async colonizeClick(key, local) {
    const here = this.colonizeCommands().filter((c) => c.at === key);
    const sq = here.length ? this.view.squareAt(key, local) : null;
    const options = here.filter((c) => c.sq === sq);
    if (!options.length) {
      this.warn('Click one of the glowing Population squares.');
      return;
    }
    if (options.length === 1) {
      this.runFree(options[0]);
      return;
    }
    const p = this.player;
    const token = this.token;
    const cmd = await choiceDialog(this.scene, {
      title: 'Which Population track?',
      text: 'This square accepts a cube from any of your tracks. Taking a cube off a track raises that resource\u2019s production.',
      closable: true,
      btnH: 64,
      options: options.map((c) => ({
        label: `${RESOURCE_NAMES[c.track]}\nproduction ${popProduction(p.pop[c.track])} \u2192 ${popProduction(p.pop[c.track] - 1)}`,
        value: c,
        fill: RES[c.track].dark,
      })),
    });
    if (cmd && token === this.token) this.runFree(cmd);
  }
}

// ---------------------------------------------------------------------------- decisions shown as prompts + dialogs

const done = (ui, text, tip) => ({ text, tip, fn: () => ui.submit({ type: 'done' }) });

function chooseAction(ui, d) {
  const render = () => {
    const p = ui.player;
    const s = ui.state;
    const can = new Set(ui.game.decision.options.filter((o) => o.type === 'action').map((o) => o.action));
    const buttons = ACTIONS.map((a) => {
      const n = activationsFor(p, a);
      const info = ACTION_INFO[a];
      const ok = can.has(a);
      return {
        text: n > 1 ? `${info.label} \u00d7${n}` : info.label,
        enabled: ok,
        tip: `${info.label}: ${info.text}\nActivations with this action: ${n}.${ok ? '' : `\n${WHY[a]}`}`,
        fn: () => ui.submit({ type: 'action', action: a }),
      };
    });
    const first = s.firstPasser == null;
    buttons.push({
      text: 'Pass',
      fill: 0x5a3a2a,
      tip: `Pass: you take no more actions this round (a Reaction is still possible).${first ? ' The first player to pass gains 2 Money and becomes the Start Player next round.' : ''}`,
      fn: () => ui.submit({ type: 'pass' }),
    });
    ui.show({
      title: `Round ${s.round} \u2014 your turn`,
      hint: `Every action uses one of the ${plural(p.track, 'Influence Disc')} on your track and may be performed several times (see \u00d7). Colony Ships and trading are free and available at any time.`,
      buttons,
    });
  };
  ui.redraw = render;
  render();
}

function chooseReaction(ui) {
  const render = () => {
    const opts = ui.game.decision.options.filter((o) => o.type === 'react');
    const buttons = opts.map((o) => ({
      text: `React: ${ACTION_INFO[o.action].label}`,
      fill: GREEN,
      tip: `${ACTION_INFO[o.action].text}\nA Reaction is a single activation and costs one Influence Disc.`,
      fn: () => ui.submit(o),
    }));
    buttons.push({ text: 'No reaction', fn: () => ui.submit({ type: 'pass' }) });
    ui.show({
      title: 'Reaction?',
      hint: `You have passed, but you may still spend an Influence Disc (${ui.player.track} left) on one Upgrade, Build or Move activation. You are asked again after each opponent action; switch this off with the settings button at the top.`,
      buttons,
    });
  };
  ui.redraw = render;
  render();
}

function research(ui, d) {
  const open = () => {
    const options = ui.game.decision.options.filter((o) => o.type === 'research');
    if (!options.length) {
      ui.warn('You cannot afford any technology.');
      return;
    }
    openTechDialog(ui.scene, ui.game, ui.pid, { options, onPick: (cmd) => ui.submit(cmd) });
  };
  const render = () => {
    ui.show({
      title: activationTitle(d, 'Research'),
      hint: `You have ${ui.player.res.S} Science. Pick a technology from the tray; every technology you already own on its track makes the next one cheaper.`,
      buttons: [{ text: 'Open technology list', fill: GREEN, w: 200, fn: open }, done(ui, 'Done researching', 'Stop researching. Remaining activations of this action are lost.')],
    });
  };
  ui.redraw = render;
  render();
  open();
}

function upgrade(ui, d) {
  const open = async () => {
    const token = ui.token;
    const cmd = await openUpgradeDialog(ui.scene, { game: ui.game, pid: ui.pid, activation: { index: d.ctx.index, of: d.ctx.of } });
    if (token === ui.token && cmd) ui.submit(cmd);
  };
  const render = () => {
    ui.show({
      title: activationTitle(d, 'Upgrade'),
      hint: 'Place new parts on your ship blueprints: every ship you already have (and will build) is improved at once. One part is placed per activation, and each placed part pushes out the one it replaces.',
      buttons: [{ text: 'Open blueprint editor', fill: GREEN, w: 210, fn: open }, done(ui, 'Done upgrading', 'Stop upgrading. Remaining activations of this action are lost.')],
    });
  };
  ui.redraw = render;
  render();
  open();
}

function upkeepColonize(ui) {
  const render = () => {
    ui.show({
      title: 'Upkeep \u2014 Colony Ships',
      hint: 'Before the economy is paid out you may place Population Cubes with your ready Colony Ships (the glowing squares). Unused Colony Ships stay ready. Press Done when you have finished.',
      buttons: [done(ui, 'Done', 'Finish the Upkeep phase.')],
    });
  };
  ui.redraw = render;
  render();
  ui.setColonizing(true);
}

// A prompt that is just a reopenable dialog; `open` resolves with the command to submit (or nothing).
function dialogFlow(ui, { title, hint, label = 'Choose\u2026', open }) {
  const run = async () => {
    const token = ui.token;
    const cmd = await open();
    if (token === ui.token && cmd) ui.submit(cmd);
  };
  ui.redraw = () => ui.show({ title, hint, buttons: [{ text: label, fill: GREEN, fn: run }] });
  ui.redraw();
  return run();
}

function artifactKey(ui, d) {
  const n = d.ctx.artifacts;
  return dialogFlow(ui, {
    title: 'Artifact Key',
    hint: 'Choose which resource the Artifact Key pays out.',
    open: () =>
      choiceDialog(ui.scene, {
        title: 'Artifact Key',
        text: `You control ${plural(n, 'Artifact')}. The Artifact Key pays out 5 resources of one type for each of them: ${5 * n} in total. Which resource do you want?`,
        options: d.options.map((o) => ({ label: `${5 * n} ${RESOURCE_NAMES[o.resource]}`, value: o, fill: RES[o.resource].dark })),
      }),
  });
}

function chooseTech(ui, d) {
  return dialogFlow(ui, {
    title: 'Ancient Technology',
    hint: 'Pick the technology you receive for free.',
    open: () =>
      choiceDialog(ui.scene, {
        title: 'Ancient Technology',
        text: 'The discovery grants one of the cheapest technologies in the tray for free. Which one do you take?',
        w: 900,
        btnH: 66,
        size: 16,
        options: d.options.map((o) => ({
          label: `${TECHS[o.tech].name} (${CATEGORY_NAMES[TECHS[o.tech].category]})\n${describeTech(o.tech)}`,
          value: o,
        })),
      }),
  });
}

function ancientPart(ui, d) {
  const part = PARTS[d.ctx.part];
  return dialogFlow(ui, {
    title: 'Ancient Ship Part',
    hint: `You found the ${part.name}. Place it on a blueprint now or keep it in your stash and place it later with an Upgrade action.`,
    label: 'Open blueprint editor',
    open: () => openUpgradeDialog(ui.scene, { game: ui.game, pid: ui.pid, ancientPart: d.ctx.part, options: d.options }),
  });
}

function muon(ui, d) {
  return dialogFlow(ui, {
    title: 'Muon Source',
    hint: 'Choose which blueprint receives the Muon Source.',
    open: () =>
      choiceDialog(ui.scene, {
        title: 'Muon Source',
        text: `The Muon Source is a free extra part (${describePart('muonSource')}). Which ship blueprint do you attach it to?`,
        cols: 2,
        options: d.options.map((o) => ({ label: shipName(o.bp), value: o })),
      }),
  });
}

function bankruptcy(ui, d) {
  const p = ui.player;
  const s = ui.state;
  const rate = tradeRate(p);
  return dialogFlow(ui, {
    title: 'Civilization Upkeep',
    hint: `You are ${d.ctx.shortfall} Money short of paying your upkeep.`,
    open: () =>
      choiceDialog(ui.scene, {
        title: 'You cannot pay your upkeep',
        text: `Your Money is ${d.ctx.shortfall} short of the Civilization Upkeep. Trade other resources for Money, or abandon a sector (its Influence Disc returns to your track, which lowers the upkeep).`,
        cols: 2,
        w: 860,
        options: d.options.map((o) =>
          o.type === 'trade'
            ? { label: `Trade ${rate} ${RESOURCE_NAMES[o.from]} \u2192 1 Money`, value: o }
            : { label: `Abandon sector ${s.map[o.at].id} (${SECTORS[s.map[o.at].id].vp} VP)`, value: o, fill: RED }
        ),
      }),
  });
}

const DISCOVERY_USE = {
  resources: (t) => `Gain ${t.label.replace('+', '')} right away.`,
  ancientTech: () => 'Take one of the cheapest technologies from the tray for free.',
  ancientCruiser: () => 'A free Cruiser, built from your own blueprint, joins you in this sector.',
  ancientOrbital: () => 'An Orbital is placed in this sector (and you gain 2 Materials).',
  ancientMonolith: () => 'A Monolith is placed in this sector. It is worth 3 Victory Points while you control the sector.',
  ancientPart: (t) => `The ${PARTS[t.part].name} (${describePart(t.part)}) joins your stash of parts.`,
  muon: () => `The Muon Source (${describePart('muonSource')}) can be attached to a blueprint.`,
};

function discovery(ui, d) {
  const { tile, at } = d.ctx;
  const s = ui.state;
  ui.view.flash(at, COLORS.gold, 1400);
  ui.highlight([{ key: at, color: COLORS.gold, kind: 'select' }]);
  return dialogFlow(ui, {
    title: 'Discovery Tile',
    hint: `Sector ${s.map[at].id} held a Discovery Tile: ${tile.label}. Use it now, or keep it face down for 2 Victory Points.`,
    open: () =>
      choiceDialog(ui.scene, {
        title: `Discovery: ${tile.label}`,
        text: `You claimed a Discovery Tile in sector ${s.map[at].id}.\n\nUse it: ${DISCOVERY_USE[tile.kind]?.(tile) ?? tile.label}\nKeep it: it is worth 2 Victory Points at the end of the game.`,
        options: d.options.map((o) =>
          o.type === 'use'
            ? { label: 'Use it now', value: o, fill: GREEN }
            : { label: 'Keep it for 2 Victory Points', value: o }
        ),
      }),
  });
}

function engage(ui, d) {
  const { at, shipType, ships, round, role } = d.ctx;
  const s = ui.state;
  const rec = ui.tracker?.current ?? null;
  if (rec && ui.fightOn === rec) {
    ui.submit({ type: 'attack' });
    return undefined;
  }
  ui.view.flash(at, COLORS.danger, 1200);
  ui.highlight([{ key: at, color: COLORS.danger, kind: 'select' }]);
  const retreats = d.options.filter((o) => o.type === 'retreat');
  const options = [{ label: 'Attack', value: { type: 'attack' }, fill: RED }];
  if (rec) options.push({ label: 'Attack, and do not ask again in this battle', value: 'fight', fill: RED });
  for (const o of retreats) options.push({ label: `Retreat to sector ${s.map[o.to].id}`, value: o });
  return dialogFlow(ui, {
    title: `Battle in sector ${s.map[at].id}`,
    hint: 'Decide whether this group of ships keeps fighting or retreats.',
    open: async () => {
      const value = await choiceDialog(ui.scene, {
        title: `Battle in sector ${s.map[at].id}`,
        text: `${battleProgress(s, rec, at, ui.pid)}\n\nYour ${plural(ships.length, shipName(shipType))} ${ships.length === 1 ? 'is' : 'are'} next to act (you are the ${role}). Attack to fire, or retreat: retreating ships do not fire, they leave when their turn comes round again and can still be hit until then.`,
        options,
        w: 860,
      });
      if (value === 'fight') {
        ui.fightOn = rec;
        return { type: 'attack' };
      }
      return value;
    },
  });
}

function fallback(ui, d) {
  const name = (o) => {
    const { type, ...rest } = o;
    const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
    return `${type}${extra}`;
  };
  return dialogFlow(ui, {
    title: d.kind,
    hint: 'Choose one of the available commands.',
    open: () => choiceDialog(ui.scene, { title: d.kind, options: d.options.map((o) => ({ label: name(o), value: o })), cols: 2, w: 960, size: 15 }),
  });
}

const DIALOGS = {
  chooseAction,
  chooseReaction,
  research,
  upgrade,
  upkeepColonize,
  artifactKey,
  chooseTech,
  ancientPart,
  muon,
  bankruptcy,
  discovery,
  engage,
};
