import { describe, expect, it } from 'vitest';
import { AI_IDS, createAI, listAIs, registerAI } from '../src/ai/registry.js';
import { Match } from '../src/core/match.js';
import { ROUNDS } from '../src/data/constants.js';
import { SPECIES_LIST } from '../src/data/species.js';
import { SPECIES_PAIRS, checkInvariants, makeGame, makeMatch, playOut } from './helpers.js';

describe('AI registry', () => {
  it('lists the built-in opponents', () => {
    expect(AI_IDS).toEqual(expect.arrayContaining(['heuristic', 'random']));
    for (const ai of listAIs()) {
      expect(ai.id).toBeTruthy();
      expect(ai.label).toBeTruthy();
    }
  });

  it('creates one instance per seat and rejects unknown ids', () => {
    const a = createAI('heuristic', 0);
    const b = createAI('heuristic', 1);
    expect(a).not.toBe(b);
    expect(typeof a.decide).toBe('function');
    expect(() => createAI('does-not-exist', 0)).toThrow(/Unknown AI/);
  });

  it('accepts new opponents without touching the engine', () => {
    class PassiveAI {
      static id = 'test-passive';
      static label = 'Passive';
      constructor(seat) {
        this.seat = seat;
      }
      decide(game, d) {
        return d.options.find((o) => ['pass', 'done', 'keep', 'stash'].includes(o.type)) ?? d.options[0];
      }
    }
    registerAI(PassiveAI);
    expect(listAIs().map((a) => a.id)).toContain('test-passive');
    const game = makeGame(2);
    new Match(game, [createAI('test-passive', 0), createAI('heuristic', 1)]).run();
    expect(game.over).toBe(true);
  });
});

describe('full games', () => {
  it('finish after eight rounds with consistent state (heuristic vs heuristic)', () => {
    SPECIES_PAIRS.slice(0, 4).forEach(([a, b], i) => {
      const match = makeMatch(300 + i, 'heuristic', 'heuristic', a, b);
      playOut(match);
      const s = match.game.state;
      expect(s.over, `${a} vs ${b}`).toBe(true);
      expect(s.round).toBeLessThanOrEqual(ROUNDS);
      expect(s.finalScores).toHaveLength(2);
      for (const score of s.finalScores) expect(score.total).toBeGreaterThanOrEqual(0);
      expect(s.log.length).toBeGreaterThan(20);
    });
  });

  it('survive a random opponent', () => {
    for (let i = 0; i < 4; i++) {
      const match = makeMatch(500 + i, i % 2 ? 'random' : 'heuristic', i % 2 ? 'heuristic' : 'random');
      playOut(match);
      expect(match.game.over).toBe(true);
    }
  });

  it('are fully determined by the seed', () => {
    const run = () => {
      const match = makeMatch(77, 'heuristic', 'heuristic');
      match.run();
      return JSON.stringify(match.game.serialize());
    };
    expect(run()).toBe(run());
  });

  it('reward a competent opponent over a random one', () => {
    let wins = 0;
    for (let i = 0; i < 4; i++) {
      const heuristicSeat = i % 2;
      const match = makeMatch(900 + i, heuristicSeat === 0 ? 'heuristic' : 'random', heuristicSeat === 0 ? 'random' : 'heuristic');
      match.run();
      if (match.game.state.winner === heuristicSeat) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(3);
  });

  it('work for every species', () => {
    SPECIES_LIST.forEach((sp, i) => {
      const other = SPECIES_LIST[(i + 5) % SPECIES_LIST.length];
      const match = makeMatch(1200 + i, 'heuristic', 'heuristic', sp.id, other.id);
      playOut(match, { every: 25 });
      expect(match.game.over, `${sp.id} vs ${other.id}`).toBe(true);
    });
  }, 120000);
});

describe('decision handling', () => {
  it('asks only for the kinds of decisions the UI knows about', () => {
    const known = new Set([
      'chooseAction',
      'chooseReaction',
      'explore',
      'research',
      'upgrade',
      'build',
      'move',
      'influence',
      'placeSector',
      'takeControl',
      'artifactKey',
      'upkeepColonize',
      'bankruptcy',
      'engage',
      'discovery',
      'chooseTech',
      'ancientPart',
      'muon',
    ]);
    const seen = new Set();
    for (let i = 0; i < 5; i++) {
      const match = makeMatch(40 + i, 'heuristic', 'heuristic');
      while (match.game.decision) {
        seen.add(match.game.decision.kind);
        match.step();
      }
      checkInvariants(match.game.state);
    }
    for (const kind of seen) expect(known.has(kind), kind).toBe(true);
    expect(seen.size).toBeGreaterThan(8);
  });
});
