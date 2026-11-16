import { ACTIONS, REACTIONS, ROUNDS, PASS_BONUS_MONEY, RESOURCES } from '../data/constants.js';
import { SECTORS } from '../data/sectors.js';
import { TECHS } from '../data/techs.js';
import {
  controlledKeys,
  enemyShipsAt,
  nextSeat,
  productionOf,
  upkeepOf,
  actionDiscCount,
  speciesOf,
} from './queries.js';
import {
  applyBuild,
  applyColonize,
  applyInfluence,
  applyMove,
  applyResearch,
  applyTrade,
  applyUpgrade,
  activationsFor,
  artifactCount,
  buildOptions,
  colonizeOptions,
  drawSector,
  exploreZones,
  influenceOptions,
  moveOptions,
  placeInfluence,
  placeSector,
  placementRotations,
  removeInfluence,
  researchOptions,
  returnGraveyard,
  stackFor,
  tradeOptions,
  upgradeCandidates,
  upgradeError,
} from './rules.js';
import { combatPhase } from './combat.js';
import { withArticle } from './util.js';
import { resolveDiscovery } from './discovery.js';
import { eliminatePlayer, finishGame } from './endgame.js';
import { drawDiscovery, drawTechs } from './setup.js';

export { applyColonize, applyTrade, colonizeOptions, tradeOptions };

const TECHS_PER_ROUND = { 2: 5, 3: 6, 4: 7, 5: 8, 6: 9 };

// ---------------------------------------------------------------- availability

export function actionPossible(s, p, action) {
  switch (action) {
    case 'explore':
      return exploreZones(s, p).length > 0;
    case 'research':
      return researchOptions(s, p).length > 0;
    case 'upgrade':
      return upgradeCandidates(p, { limit: 1 }).length > 0;
    case 'build':
      return buildOptions(s, p).length > 0;
    case 'move':
      return moveOptions(s, p).length > 0;
    case 'influence':
      return p.colony.up < p.colony.total || influenceOptions(s, p, new Set()).length > 0;
    default:
      return false;
  }
}

export function actionChoices(s, p) {
  const out = [];
  if (p.track > 0) for (const action of ACTIONS) if (actionPossible(s, p, action)) out.push({ type: 'action', action });
  out.push({ type: 'pass' });
  return out;
}

export function reactionChoices(s, p) {
  const out = [];
  if (p.track > 0) for (const action of REACTIONS) if (actionPossible(s, p, action)) out.push({ type: 'react', action });
  return out;
}

// ---------------------------------------------------------------- activations

function* exploreActivation(g, p, ctx) {
  const s = g.state;
  const zones = exploreZones(s, p);
  if (!zones.length) return false;
  const cmd = yield g.ask(p.id, 'explore', ctx, [...zones.map((zone) => ({ type: 'explore', zone })), { type: 'done' }], {
    allowFree: true,
  });
  if (cmd.type === 'done') return false;

  const zone = cmd.zone;
  const stack = stackFor(zone);
  const drawn = [];
  const count = speciesOf(s, p.id).traits.exploreDrawTwo ? 2 : 1;
  for (let i = 0; i < count; i++) {
    const id = drawSector(s, stack);
    if (id) drawn.push(id);
  }
  const options = [];
  drawn.forEach((id, index) => {
    for (const rot of placementRotations(s, p, zone, id)) options.push({ type: 'place', index, rot });
  });
  options.push({ type: 'discard' });
  g.log(`${p.name} explores and reveals ${drawn.map((id) => `sector ${id}`).join(' and ') || 'nothing'}.`);
  g.emit('explore', { pid: p.id, zone, drawn });

  const choice =
    options.length === 1 ? options[0] : yield g.ask(p.id, 'placeSector', { zone, tiles: drawn, stack }, options);

  drawn.forEach((id, index) => {
    if (choice.type === 'place' && choice.index === index) return;
    if (count > 1) s.stacks[stack].unshift(id);
    else s.sectorDiscard[stack].push(id);
  });
  if (choice.type !== 'place') {
    g.log(`${p.name} does not place a sector.`);
    return true;
  }

  const id = drawn[choice.index];
  const tile = placeSector(s, zone, id, choice.rot);
  g.log(`${p.name} places sector ${id}.`);
  g.emit('sectorPlaced', { at: zone });

  if (p.track > 0 && !enemyShipsAt(s, p.id, zone).length) {
    const c = yield g.ask(p.id, 'takeControl', { reason: 'explore', at: zone }, [
      { type: 'influence', from: 'track', to: zone },
      { type: 'done' },
    ]);
    if (c.type === 'influence') {
      placeInfluence(s, p.id, zone);
      g.log(`${p.name} takes control of sector ${id}.`);
      g.emit('controlChanged', { at: zone });
    }
  }
  if (tile.discovery && SECTORS[id].anc === 0) {
    const found = tile.discovery;
    tile.discovery = null;
    yield* resolveDiscovery(g, p.id, found, zone);
  }
  return true;
}

function* afterResearch(g, p, techId) {
  const s = g.state;
  if (techId === 'artifactKey') {
    const n = artifactCount(s, p.id);
    if (n <= 0) return;
    const pick = yield g.ask(
      p.id,
      'artifactKey',
      { artifacts: n },
      RESOURCES.map((resource) => ({ type: 'artifact', resource }))
    );
    p.res[pick.resource] += 5 * n;
    g.log(`${p.name} gains ${5 * n} resources from the Artifact Key.`);
  } else if (techId === 'ancientLabs') {
    const tile = drawDiscovery(s);
    if (!tile) return;
    if (s.map[p.home]?.controller === p.id) yield* resolveDiscovery(g, p.id, tile, p.home);
    else {
      p.vpDisc += 1;
      g.log(`${p.name} keeps the Ancient Labs discovery for 2 victory points.`);
    }
  }
}

function* researchActivation(g, p, ctx) {
  const s = g.state;
  const opts = researchOptions(s, p);
  if (!opts.length) return false;
  const cmd = yield g.ask(p.id, 'research', ctx, [...opts, { type: 'done' }], { allowFree: true });
  if (cmd.type === 'done') return false;
  applyResearch(s, p, cmd);
  g.log(`${p.name} researches ${TECHS[cmd.tech].name} for ${cmd.cost} Science.`);
  g.emit('research', { pid: p.id, tech: cmd.tech });
  yield* afterResearch(g, p, cmd.tech);
  return true;
}

function* upgradeActivation(g, p, ctx) {
  const s = g.state;
  const cmd = yield g.ask(p.id, 'upgrade', ctx, [{ type: 'done' }], {
    allowFree: true,
    validate: (c) => (c.type === 'upgrade' ? upgradeError(p, c) : 'Invalid command.'),
  });
  if (cmd.type === 'done') return false;
  applyUpgrade(p, cmd);
  g.log(`${p.name} upgrades a ship blueprint.`);
  g.emit('upgrade', { pid: p.id, cmd });
  return true;
}

function* buildActivation(g, p, ctx) {
  const s = g.state;
  const opts = buildOptions(s, p);
  if (!opts.length) return false;
  const cmd = yield g.ask(p.id, 'build', ctx, [...opts, { type: 'done' }], { allowFree: true });
  if (cmd.type === 'done') return false;
  applyBuild(s, p, cmd);
  g.log(`${p.name} builds ${withArticle(cmd.what)} in sector ${s.map[cmd.at].id}.`);
  g.emit('build', { pid: p.id, what: cmd.what, at: cmd.at });
  return true;
}

function* moveActivation(g, p, ctx) {
  const s = g.state;
  const opts = moveOptions(s, p);
  if (!opts.length) return false;
  const cmd = yield g.ask(p.id, 'move', ctx, [...opts, { type: 'done' }], { allowFree: true });
  if (cmd.type === 'done') return false;
  const ship = s.ships.find((x) => x.id === cmd.ship);
  const from = ship.at;
  applyMove(s, cmd);
  g.log(`${p.name} moves ${withArticle(ship.type)} from sector ${s.map[from].id} to ${s.map[cmd.to].id}.`);
  g.emit('move', { pid: p.id, ship: ship.id, from, to: cmd.to });
  return true;
}

function* influenceActivation(g, p, ctx, touched) {
  const s = g.state;
  const opts = influenceOptions(s, p, touched);
  if (!opts.length) return false;
  const cmd = yield g.ask(p.id, 'influence', ctx, [...opts, { type: 'done' }], { allowFree: true });
  if (cmd.type === 'done') return false;
  applyInfluence(s, p, cmd);
  if (cmd.from !== 'track') touched.add(cmd.from);
  if (cmd.to !== 'track') touched.add(cmd.to);
  g.log(
    `${p.name} moves an Influence Disc ${cmd.from === 'track' ? 'from the track' : `from sector ${s.map[cmd.from]?.id ?? cmd.from}`} ${
      cmd.to === 'track' ? 'to the track' : `to sector ${s.map[cmd.to].id}`
    }.`
  );
  g.emit('influence', { pid: p.id, cmd });
  return true;
}

function* runAction(g, p, action, { reaction = false } = {}) {
  const s = g.state;
  const count = reaction ? 1 : activationsFor(p, action);
  g.log(`${p.name} ${reaction ? 'reacts with' : 'takes'} the ${action} action.`);
  g.emit('action', { pid: p.id, action, reaction });
  if (action === 'influence') p.colony.up = Math.min(p.colony.total, p.colony.up + 2);
  const touched = new Set();
  for (let i = 0; i < count; i++) {
    const ctx = { action, index: i, of: count, reaction };
    let did = false;
    switch (action) {
      case 'explore':
        did = yield* exploreActivation(g, p, ctx);
        break;
      case 'research':
        did = yield* researchActivation(g, p, ctx);
        break;
      case 'upgrade':
        did = yield* upgradeActivation(g, p, ctx);
        break;
      case 'build':
        did = yield* buildActivation(g, p, ctx);
        break;
      case 'move':
        did = yield* moveActivation(g, p, ctx);
        break;
      case 'influence':
        did = yield* influenceActivation(g, p, ctx, touched);
        break;
      default:
        break;
    }
    if (!did || s.over) break;
  }
}

// ---------------------------------------------------------------- action phase

function passPlayer(g, p) {
  const s = g.state;
  p.passed = true;
  if (s.firstPasser == null) {
    s.firstPasser = p.id;
    p.res.$ += PASS_BONUS_MONEY;
    g.log(`${p.name} passes first, gaining ${PASS_BONUS_MONEY} Money and the Start Player token.`);
  } else {
    g.log(`${p.name} passes.`);
  }
  g.emit('pass', { pid: p.id });
}

function* playerTurn(g, p) {
  const s = g.state;
  if (p.track <= 0) {
    passPlayer(g, p);
    return;
  }
  const cmd = yield g.ask(p.id, 'chooseAction', { round: s.round }, () => actionChoices(s, p), { allowFree: true });
  if (cmd.type === 'pass') {
    passPlayer(g, p);
    return;
  }
  p.track -= 1;
  p.actionDiscs[cmd.action] += 1;
  yield* runAction(g, p, cmd.action);
}

function* reactionTurn(g, p) {
  const s = g.state;
  if (!reactionChoices(s, p).length) return;
  const cmd = yield g.ask(p.id, 'chooseReaction', { round: s.round }, () => [...reactionChoices(s, p), { type: 'pass' }], {
    allowFree: true,
  });
  if (cmd.type === 'pass') return;
  p.track -= 1;
  p.reactionDiscs += 1;
  yield* runAction(g, p, cmd.action, { reaction: true });
}

function* actionPhase(g) {
  const s = g.state;
  s.phase = 'action';
  g.log(`--- Round ${s.round}: Action Phase ---`);
  let turn = s.startPlayer;
  while (!s.over && !s.players.every((p) => p.passed || p.eliminated)) {
    const p = s.players[turn];
    if (!p.eliminated) {
      if (!p.passed) yield* playerTurn(g, p);
      else yield* reactionTurn(g, p);
    }
    turn = nextSeat(s, turn);
  }
}

// ---------------------------------------------------------------- upkeep & cleanup

function* settleMoney(g, p) {
  const s = g.state;
  for (;;) {
    const net = productionOf(p).$ - upkeepOf(p);
    if (p.res.$ + net >= 0) {
      p.res.$ += net;
      g.log(`${p.name} collects ${productionOf(p).$} Money and pays ${upkeepOf(p)} upkeep.`);
      return true;
    }
    const options = [
      ...tradeOptions(p).filter((o) => o.to === '$'),
      ...controlledKeys(s, p.id).map((at) => ({ type: 'abandon', at })),
    ];
    if (!options.length) {
      g.log(`${p.name} cannot pay the Civilization Upkeep.`);
      eliminatePlayer(g, p.id);
      return false;
    }
    const cmd = yield g.ask(p.id, 'bankruptcy', { shortfall: -(p.res.$ + net) }, options, { allowFree: false });
    if (cmd.type === 'trade') {
      applyTrade(p, cmd);
      g.log(`${p.name} trades ${cmd.from} for money to pay the upkeep.`);
    } else {
      removeInfluence(s, cmd.at);
      g.log(`${p.name} abandons sector ${s.map[cmd.at].id}.`);
      g.emit('controlChanged', { at: cmd.at });
    }
  }
}

function* upkeepPhase(g) {
  const s = g.state;
  s.phase = 'upkeep';
  g.log(`--- Round ${s.round}: Upkeep Phase ---`);
  for (const p of s.players) {
    if (p.eliminated) continue;
    if (colonizeOptions(s, p, { upkeep: true }).length) {
      yield g.ask(p.id, 'upkeepColonize', {}, [{ type: 'done' }], { allowFree: true, upkeep: true });
    }
  }
  for (const p of s.players) {
    if (p.eliminated) continue;
    const ok = yield* settleMoney(g, p);
    if (s.over) return;
    if (!ok) continue;
    const prod = productionOf(p);
    p.res.M += prod.M;
    p.res.S += prod.S;
    g.log(`${p.name} produces ${prod.M} Materials and ${prod.S} Science.`);
  }
}

function cleanup(g) {
  const s = g.state;
  s.phase = 'cleanup';
  for (const p of s.players) {
    if (p.eliminated) continue;
    p.track += actionDiscCount(p) + p.reactionDiscs;
    for (const a of ACTIONS) p.actionDiscs[a] = 0;
    p.reactionDiscs = 0;
    returnGraveyard(p);
    p.colony.up = p.colony.total;
    p.passed = false;
  }
  drawTechs(s, TECHS_PER_ROUND[s.players.length] ?? 5);
  if (s.firstPasser != null && !s.players[s.firstPasser].eliminated) s.startPlayer = s.firstPasser;
  s.firstPasser = null;
}

// ---------------------------------------------------------------- game

export function* gameFlow(g) {
  const s = g.state;
  g.log('The game begins.');
  for (; s.round <= ROUNDS; s.round++) {
    for (const p of s.players) p.passed = !!p.eliminated;
    s.firstPasser = null;
    yield* actionPhase(g);
    if (s.over) return;
    yield* combatPhase(g);
    if (s.over) return;
    yield* upkeepPhase(g);
    if (s.over) return;
    cleanup(g);
  }
  s.round = ROUNDS;
  finishGame(g);
}
