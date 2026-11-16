import { Game } from './game.js';

const SAFE_TYPES = ['done', 'pass', 'keep', 'stash'];

// A Match couples a Game with one controller per seat. A seat without a controller (null) is a human:
// the match pauses whenever such a seat has a decision to make. In strict mode (used by tests and tools) a
// failing or illegal AI decision throws; otherwise the match falls back to the most passive legal command so
// that a bug in an opponent can never freeze the game.
export class Match {
  constructor(game, controllers, { strict = true, onError = null } = {}) {
    this.game = game;
    this.controllers = controllers;
    this.strict = strict;
    this.onError = onError;
  }

  get awaitingHuman() {
    const d = this.game.decision;
    return !!d && !this.controllers[d.playerId];
  }

  get finished() {
    return !this.game.decision;
  }

  // Applies one AI decision. Returns false when there is nothing for an AI to do.
  step() {
    const g = this.game;
    const d = g.decision;
    if (!d) return false;
    const ai = this.controllers[d.playerId];
    if (!ai) return false;
    try {
      const cmd = ai.decide(g, d);
      if (cmd === undefined || cmd === null) throw new Error(`AI for seat ${d.playerId} returned no command for ${d.kind}.`);
      g.apply(cmd);
    } catch (err) {
      if (this.strict) throw err;
      this.onError?.(err, d);
      g.apply(d.options.find((c) => SAFE_TYPES.includes(c.type)) ?? d.options[0]);
    }
    return true;
  }

  run(maxSteps = 200000) {
    let n = 0;
    while (this.step()) {
      if (++n > maxSteps) throw new Error('The match did not finish (step limit reached).');
    }
    return n;
  }
}

export function createMatch(config, controllers, options) {
  return new Match(new Game(config), controllers, options);
}
