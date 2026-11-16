import { ROUNDS } from '../data/constants.js';
import { SECTORS } from '../data/sectors.js';
import { DIRS, key as hexKey, distance } from '../core/hex.js';
import { enemyShipsAt, ownShipsAt, productionOf, upkeepOf } from '../core/queries.js';
import {
  activationsFor,
  applyBuild,
  applyColonize,
  applyInfluence,
  applyMove,
  applyResearch,
  applyTrade,
  applyUpgrade,
  buildOptions,
  colonizeOptions,
  influenceOptions,
  moveOptions,
  placeInfluence,
  removeInfluence,
  researchOptions,
  upgradeCandidates,
} from '../core/rules.js';
import { clone } from '../core/util.js';
import { evaluate, deltaOf, simClone, solvencyCost } from './evaluate.js';
import { battleOdds, sectorPotential } from './ratings.js';
import { bestMove, enemiesNear } from './tactics.js';
import { TECH_UTILITY } from './techValues.js';

const argmax = (list, fn) => {
  let best = null;
  for (const item of list) {
    const value = fn(item);
    if (best === null || value > best.value) best = { item, value };
  }
  return best;
};

// Replaces only the player's blueprints (cheap) so that blueprint changes can be evaluated quickly.
function blueprintSim(s, pid) {
  return {
    ...s,
    players: s.players.map((pl) =>
      pl.id === pid ? { ...pl, blueprints: clone(pl.blueprints), ancientParts: [...pl.ancientParts] } : pl
    ),
  };
}



function describeHome(s, p) {
  return s.map[p.home];
}

// A one-ply greedy opponent: it evaluates the position reached by every legal command with a static
// evaluation function (see evaluate.js) and picks the best one. It needs no search, so it is quick enough
// to run in the browser, and since it only talks to the public Game API it can be replaced or complemented
// by other opponents.
export class HeuristicAI {
  static id = 'heuristic';
  static label = 'Heuristic';
  static description = 'Greedy opponent that weighs expansion, economy, technology and fleets.';

  constructor(seat) {
    this.seat = seat;
  }

  decide(game, d) {
    const s = game.state;
    const p = s.players[d.playerId];
    if (d.allowFree) {
      const free = this.freeCommand(game, d, s, p);
      if (free) return free;
    }
    const handler = this[`on_${d.kind}`];
    const cmd = handler ? handler.call(this, game, d, s, p) : null;
    return cmd ?? d.options[0];
  }

  // ------------------------------------------------------------ free commands

  freeCommand(game, d, s, p) {
    const col = colonizeOptions(s, p, { upkeep: d.upkeep });
    if (!col.length) return null;
    const base = evaluate(s, p.id);
    const best = argmax(col, (c) => deltaOf(s, p.id, (sim, sp) => applyColonize(sim, sp, c), base));
    return best && best.value > 0 ? best.item : null;
  }

  // ------------------------------------------------------------ action selection

  on_chooseAction(game, d, s, p) {
    let best = { cmd: { type: 'pass' }, value: s.firstPasser == null ? 2.5 : 0 };
    if (p.track <= 1) best.value += 1.5;
    for (const c of d.options) {
      if (c.type !== 'action') continue;
      const value = this.actionValue(s, p, c.action, false);
      if (value > best.value) best = { cmd: c, value };
    }
    return best.cmd;
  }

  on_chooseReaction(game, d, s, p) {
    let best = { cmd: { type: 'pass' }, value: 1.5 };
    for (const c of d.options) {
      if (c.type !== 'react') continue;
      const value = this.actionValue(s, p, c.action, true);
      if (value > best.value) best = { cmd: c, value };
    }
    return best.cmd;
  }

  // Estimated worth of spending an Influence Disc on an action (greedy over its activations).
  actionValue(s, p, action, reaction) {
    const sim = simClone(s);
    const sp = sim.players[p.id];
    const before = upkeepOf(sp) + solvencyCost(sp);
    sp.track -= 1;
    if (reaction) sp.reactionDiscs += 1;
    else sp.actionDiscs[action] += 1;
    const discCost = upkeepOf(sp) + solvencyCost(sp) - before;
    const n = reaction ? 1 : activationsFor(p, action);
    if (action === 'influence') sp.colony.up = Math.min(sp.colony.total, sp.colony.up + 2);
    let total = 0;
    const touched = new Set();
    for (let i = 0; i < n; i++) {
      const best = this.bestActivation(sim, sp, action, touched, n - i);
      if (!best || best.value <= 0.05) break;
      best.apply?.();
      total += best.value + this.simColonize(sim, sp);
    }
    return total - discCost - 0.8;
  }

  simColonize(sim, sp) {
    let total = 0;
    for (let i = 0; i < 4; i++) {
      const options = colonizeOptions(sim, sp);
      if (!options.length) break;
      const base = evaluate(sim, sp.id);
      const best = argmax(options, (c) => deltaOf(sim, sp.id, (x, xp) => applyColonize(x, xp, c), base));
      if (!best || best.value <= 0) break;
      applyColonize(sim, sp, best.item);
      total += best.value;
    }
    return total;
  }

  bestActivation(sim, sp, action, touched, remaining) {
    const base = evaluate(sim, sp.id);
    switch (action) {
      case 'explore':
        return this.exploreActivation(sim, sp);
      case 'research': {
        const opts = researchOptions(sim, sp);
        const best = argmax(opts, (c) => deltaOf(sim, sp.id, (x, xp) => applyResearch(x, xp, c), base));
        return best && { value: best.value, apply: () => applyResearch(sim, sp, best.item) };
      }
      case 'upgrade': {
        const cands = upgradeCandidates(sp, { limit: 300 });
        const best = argmax(cands, (c) => {
          const b = blueprintSim(sim, sp.id);
          applyUpgrade(b.players[sp.id], c);
          return evaluate(b, sp.id) - base;
        });
        return best && { value: best.value, apply: () => applyUpgrade(sp, best.item) };
      }
      case 'build': {
        const opts = buildOptions(sim, sp);
        const best = argmax(opts, (c) => deltaOf(sim, sp.id, (x, xp) => applyBuild(x, xp, c), base) + this.buildSpot(sim, sp, c));
        return best && { value: best.value, apply: () => applyBuild(sim, sp, best.item) };
      }
      case 'move': {
        const best = bestMove(sim, sp, moveOptions(sim, sp), remaining);
        return best && { value: best.value, apply: () => applyMove(sim, best.cmd) };
      }
      case 'influence': {
        const opts = influenceOptions(sim, sp, touched);
        const best = argmax(opts, (c) => deltaOf(sim, sp.id, (x, xp) => applyInfluence(x, xp, c), base));
        return (
          best && {
            value: best.value,
            apply: () => {
              applyInfluence(sim, sp, best.item);
              if (best.item.from !== 'track') touched.add(best.item.from);
              if (best.item.to !== 'track') touched.add(best.item.to);
            },
          }
        );
      }
      default:
        return null;
    }
  }

  exploreActivation(sim, sp) {
    const horizon = Math.min(Math.max(1, ROUNDS - sim.round + 1), 4);
    if (horizon <= 1 && sim.round >= ROUNDS) return { value: 0.5 };
    return { value: (sp.track > 0 ? 6.5 : 3) * (0.4 + 0.15 * horizon) };
  }

  // ------------------------------------------------------------ activation prompts

  on_research(game, d, s, p) {
    const opts = d.options.filter((o) => o.type === 'research');
    const base = evaluate(s, p.id);
    const best = argmax(opts, (c) => deltaOf(s, p.id, (x, xp) => applyResearch(x, xp, c), base));
    return best && best.value > 0 ? best.item : { type: 'done' };
  }

  on_upgrade(game, d, s, p) {
    const base = evaluate(s, p.id);
    const best = argmax(upgradeCandidates(p, { limit: 400 }), (c) => {
      const b = blueprintSim(s, p.id);
      applyUpgrade(b.players[p.id], c);
      return evaluate(b, p.id) - base;
    });
    return best && best.value > 0.05 ? best.item : { type: 'done' };
  }

  on_build(game, d, s, p) {
    const opts = d.options.filter((o) => o.type === 'build');
    const base = evaluate(s, p.id);
    const best = argmax(opts, (c) => deltaOf(s, p.id, (x, xp) => applyBuild(x, xp, c), base) + this.buildSpot(s, p, c));
    return best && best.value > 0 ? best.item : { type: 'done' };
  }

  buildSpot(s, p, cmd) {
    const k = cmd.at;
    if (cmd.what === 'orbital') return s.map[k].cubes.length * 0.3;
    if (cmd.what === 'monolith') return 0;
    const near = enemiesNear(s, p.id, k, 1).length;
    const here = enemyShipsAt(s, p.id, k).length;
    return near * 0.4 + here * 0.6 + ownShipsAt(s, p.id, k).length * 0.1 + (k === p.home ? 0.15 : 0);
  }

  on_move(game, d, s, p) {
    const best = bestMove(s, p, d.options, d.ctx.of - d.ctx.index);
    return best && best.value > 0.2 ? best.cmd : { type: 'done' };
  }

  on_influence(game, d, s, p) {
    const opts = d.options.filter((o) => o.type === 'influence');
    const base = evaluate(s, p.id);
    const best = argmax(opts, (c) => deltaOf(s, p.id, (x, xp) => applyInfluence(x, xp, c), base));
    return best && best.value > 0.1 ? best.item : { type: 'done' };
  }

  // ------------------------------------------------------------ exploring

  on_explore(game, d, s, p) {
    const zones = d.options.filter((o) => o.type === 'explore');
    if (!zones.length) return { type: 'done' };
    const home = describeHome(s, p);
    const foe = s.players.find((x) => x.id !== p.id);
    const foeHome = foe ? s.map[foe.home] : null;
    const best = argmax(zones, (c) => {
      const [q, r] = c.zone.split(',').map(Number);
      const pos = { q, r };
      let v = -distance(pos, home) * 0.6;
      if (foeHome) v -= distance(pos, foeHome) <= 1 ? 1.5 : 0;
      return v + (Math.abs(q) + Math.abs(r) < 2 ? 0.3 : 0);
    });
    return best.item;
  }

  on_placeSector(game, d, s, p) {
    const { zone, tiles } = d.ctx;
    const [zq, zr] = zone.split(',').map(Number);
    const score = (opt) => {
      if (opt.type === 'discard') return -1;
      const def = SECTORS[tiles[opt.index]];
      let v = def.vp * 3 + def.squares.length * 1.2 + (def.art ? 1.5 : 0);
      if (def.disc && def.anc === 0) v += 4;
      if (def.anc) v -= def.anc * 3 - (def.disc ? 3 : 0);
      for (const e of def.wormholes) {
        const dir = (e + opt.rot) % 6;
        const nk = hexKey(zq + DIRS[dir].q, zr + DIRS[dir].r);
        const n = s.map[nk];
        if (!n) v += 0.4;
        else if (n.controller === p.id || ownShipsAt(s, p.id, nk).length) v += 2;
        else if (n.controller != null) v -= 2;
        else v += 0.5;
      }
      return v;
    };
    return argmax(d.options, score).item;
  }

  on_takeControl(game, d, s, p) {
    const opts = d.options.filter((o) => o.type === 'influence');
    if (!opts.length || p.track <= 0) return { type: 'done' };
    const base = evaluate(s, p.id);
    const best = argmax(opts, (c) => deltaOf(s, p.id, (x) => placeInfluence(x, p.id, c.to), base));
    return best && best.value > 0 ? best.item : { type: 'done' };
  }

  // ------------------------------------------------------------ combat

  on_engage(game, d, s, p) {
    const retreats = d.options.filter((o) => o.type === 'retreat');
    if (!retreats.length) return { type: 'attack' };
    const mine = ownShipsAt(s, p.id, d.ctx.at);
    const foes = enemyShipsAt(s, p.id, d.ctx.at);
    const odds = battleOdds(s, mine, foes);
    if (odds >= 0.3) return { type: 'attack' };
    const best = argmax(retreats, (c) => sectorPotential(s, c.to));
    return best.item;
  }

  // ------------------------------------------------------------ discoveries & rewards

  on_discovery(game, d, s, p) {
    const { tile } = d.ctx;
    if (tile.kind === 'resources') return s.round >= ROUNDS - 1 ? { type: 'keep' } : { type: 'use' };
    return { type: 'use' };
  }

  on_chooseTech(game, d) {
    return argmax(d.options, (c) => TECH_UTILITY[c.tech] ?? 0).item;
  }

  on_ancientPart(game, d, s, p) {
    const base = evaluate(s, p.id);
    const opts = d.options.filter((o) => o.type === 'upgrade');
    const best = argmax(opts, (c) => {
      const b = blueprintSim(s, p.id);
      applyUpgrade(b.players[p.id], c);
      return evaluate(b, p.id) - base;
    });
    return best && best.value > 0.5 ? best.item : { type: 'stash' };
  }

  on_muon(game, d, s, p) {
    const base = evaluate(s, p.id);
    const best = argmax(d.options, (c) => {
      const b = blueprintSim(s, p.id);
      b.players[p.id].blueprints[c.bp].extras.push('muonSource');
      return evaluate(b, p.id) - base;
    });
    return best.item;
  }

  on_artifactKey(game, d, s, p) {
    const prod = productionOf(p);
    return argmax(d.options, (c) => -(p.res[c.resource] + 3 * prod[c.resource]) + (c.resource === 'S' ? 1 : 0)).item;
  }

  // ------------------------------------------------------------ upkeep

  on_upkeepColonize() {
    return { type: 'done' };
  }

  on_bankruptcy(game, d, s, p) {
    const trades = d.options.filter((o) => o.type === 'trade');
    const base = evaluate(s, p.id);
    if (trades.length) return argmax(trades, (c) => deltaOf(s, p.id, (x, xp) => applyTrade(xp, c), base)).item;
    const abandons = d.options.filter((o) => o.type === 'abandon');
    return argmax(abandons, (c) => deltaOf(s, p.id, (x) => removeInfluence(x, c.at), base)).item;
  }
}
