import { describe, expect, it } from 'vitest';
import { Game, IllegalCommand } from '../src/core/game.js';
import { Match } from '../src/core/match.js';
import { createAI } from '../src/ai/registry.js';
import { productionOf } from '../src/core/queries.js';
import { checkInvariants, makeGame, makeMatch } from './helpers.js';

const snapshot = (g) => JSON.stringify(g.state);

describe('Game', () => {
  it('waits for the start player to choose an action', () => {
    const g = makeGame(8);
    const d = g.decision;
    expect(d.kind).toBe('chooseAction');
    expect(d.playerId).toBe(g.state.startPlayer);
    expect(d.allowFree).toBe(true);
    expect(d.options).toContainEqual({ type: 'pass' });
    expect(d.options.filter((o) => o.type === 'action').length).toBeGreaterThan(0);
    expect(g.over).toBe(false);
    expect(g.player).toBe(g.state.players[d.playerId]);
  });

  it('rejects illegal commands without touching the state', () => {
    const g = makeGame(8);
    const before = snapshot(g);
    const bad = [
      null,
      {},
      { type: 'bogus' },
      { type: 'react', action: 'move' },
      { type: 'action', action: 'doesNotExist' },
      { type: 'colonize', at: '0,0', sq: 0, track: 'M' },
      { type: 'trade', from: 'M', to: 'M' },
    ];
    for (const cmd of bad) {
      expect(() => g.apply(cmd), JSON.stringify(cmd)).toThrow(IllegalCommand);
      expect(g.validate(cmd)).toBeTruthy();
    }
    expect(snapshot(g)).toBe(before);
    expect(g.cmdLog).toEqual([]);
  });

  it('applies free commands without advancing the flow', () => {
    const g = makeGame(8);
    const id = g.decision.id;
    const p = g.player;
    const trade = { type: 'trade', from: 'M', to: '$' };
    expect(g.legalCommands()).toContainEqual(trade);
    g.apply(trade);
    expect(g.decision.id).toBe(id);
    expect(p.res).toEqual({ M: 2, S: 3, $: 4 });
    expect(g.cmdLog).toEqual([trade]);
  });

  it('takes an action, runs its activations and returns to the next player', () => {
    const g = makeGame(8);
    const first = g.player;
    first.res.M = 10;
    const discs = first.track;
    g.apply({ type: 'action', action: 'build' });
    expect(g.decision.kind).toBe('build');
    expect(g.decision.ctx).toMatchObject({ action: 'build', index: 0, of: 2, reaction: false });
    expect(first.track).toBe(discs - 1);
    expect(first.actionDiscs.build).toBe(1);
    g.apply({ type: 'build', what: 'interceptor', at: first.home });
    expect(g.decision.ctx.index).toBe(1);
    g.apply({ type: 'done' });
    expect(g.decision.kind).toBe('chooseAction');
    expect(g.decision.playerId).not.toBe(first.id);
    checkInvariants(g.state);
  });

  it('skips activations that cannot be used', () => {
    const g = makeGame(8);
    const first = g.player;
    g.apply({ type: 'action', action: 'build' });
    g.apply({ type: 'build', what: 'interceptor', at: first.home });
    expect(first.res.M).toBe(1);
    expect(g.decision.kind).toBe('chooseAction');
    expect(g.decision.playerId).not.toBe(first.id);
  });

  it('plays a full round of passing: bonus money, start player token, upkeep and cleanup', () => {
    const g = makeGame(8);
    const [first, second] = [g.player, g.state.players[1 - g.player.id]];
    const expected = (p, bonus) => {
      const prod = productionOf(p);
      return { M: p.res.M + prod.M, S: p.res.S + prod.S, $: p.res.$ + prod.$ + bonus };
    };
    const wantFirst = expected(first, 2);
    const wantSecond = expected(second, 0);
    g.apply({ type: 'pass' });
    expect(g.decision.playerId).toBe(second.id);
    g.apply({ type: 'pass' });
    expect(g.state.round).toBe(2);
    expect(g.decision.kind).toBe('chooseAction');
    expect(g.decision.playerId).toBe(first.id);
    expect(g.state.startPlayer).toBe(first.id);
    expect(first.res).toEqual(wantFirst);
    expect(second.res).toEqual(wantSecond);
    expect(first.passed || second.passed).toBe(false);
  });

  it('ends after eight rounds of passing', () => {
    const g = makeGame(8);
    let n = 0;
    while (!g.over && n++ < 100) g.apply({ type: 'pass' });
    expect(g.over).toBe(true);
    expect(g.decision).toBeNull();
    expect(g.state.finalScores).toHaveLength(2);
    expect(g.state.winner === null || [0, 1].includes(g.state.winner)).toBe(true);
    expect(() => g.apply({ type: 'pass' })).toThrow(IllegalCommand);
  });

  it('collects events only when asked to', () => {
    const quiet = makeGame(8, 'terran-union', 'terran-alliance', { events: false });
    quiet.apply({ type: 'pass' });
    expect(quiet.drainEvents()).toEqual([]);
    const loud = makeGame(8, 'terran-union', 'terran-alliance', { events: true });
    loud.apply({ type: 'pass' });
    expect(loud.drainEvents().map((e) => e.type)).toContain('pass');
    expect(loud.drainEvents()).toEqual([]);
  });

  it('logs what happens', () => {
    const g = makeGame(8);
    g.apply({ type: 'pass' });
    expect(g.state.log.some((l) => /passes first/.test(l.t))).toBe(true);
  });
});

describe('persistence', () => {
  const play = (steps, seed = 21) => {
    const match = makeMatch(seed, 'heuristic', 'heuristic');
    for (let i = 0; i < steps && match.step(); i++);
    return match.game;
  };

  it('reproduces the exact state from seed and command log', () => {
    for (const steps of [0, 1, 37, 150, 400]) {
      const g = play(steps);
      const copy = Game.load(JSON.parse(JSON.stringify(g.serialize())));
      expect(snapshot(copy), `${steps} steps`).toBe(snapshot(g));
      expect(copy.decision?.id).toBe(g.decision?.id);
      expect(copy.decision?.kind).toBe(g.decision?.kind);
    }
  });

  it('forks into an independent game', () => {
    const g = play(60);
    const fork = g.fork();
    const before = snapshot(g);
    const cmd = fork.decision.options.find((o) => o.type === 'pass' || o.type === 'done') ?? fork.decision.options[0];
    fork.apply(cmd);
    expect(snapshot(g)).toBe(before);
    expect(g.cmdLog.length).toBe(fork.cmdLog.length - 1);
  });

  it('accepts every command it lists', () => {
    const kinds = new Set();
    for (const steps of [5, 40, 90, 150, 190]) {
      const g = play(steps);
      if (!g.decision) continue;
      const listed = g.legalCommands();
      expect(listed.length, `${steps} steps`).toBeGreaterThan(0);
      kinds.add(g.decision.kind);
      for (const cmd of listed.slice(0, 25)) {
        expect(g.validate(cmd), JSON.stringify(cmd)).toBeNull();
        const fork = g.fork();
        expect(() => fork.apply(cmd), JSON.stringify(cmd)).not.toThrow();
        checkInvariants(fork.state);
      }
    }
    expect(kinds.size).toBeGreaterThan(1);
  });
});

describe('Match', () => {
  it('pauses on seats without a controller', () => {
    const game = makeGame(4);
    const match = new Match(game, [null, createAI('heuristic', 1)]);
    const humanFirst = game.decision.playerId === 0;
    expect(match.awaitingHuman).toBe(humanFirst);
    if (humanFirst) {
      expect(match.step()).toBe(false);
      game.apply({ type: 'pass' });
    }
    expect(match.step()).toBe(true);
    expect(match.finished).toBe(false);
  });

  it('survives a broken opponent in non-strict mode', () => {
    const errors = [];
    const broken = { decide: () => ({ type: 'bogus' }) };
    const game = makeGame(4);
    const match = new Match(game, [broken, broken], { strict: false, onError: (e) => errors.push(e) });
    match.run();
    expect(game.over).toBe(true);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toBeInstanceOf(IllegalCommand);
  });

  it('throws on a broken opponent in strict mode', () => {
    const match = new Match(makeGame(4), [{ decide: () => null }, { decide: () => null }]);
    expect(() => match.step()).toThrow(/returned no command/);
  });
});
