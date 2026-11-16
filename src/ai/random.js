import { rngInt, rngNext } from '../core/rng.js';
import { candidates, isPassive } from './common.js';

// Chooses legal commands at random. Mostly useful as a baseline and for stress-testing the rules engine.
export class RandomAI {
  static id = 'random';
  static label = 'Random';

  constructor(seat, { seed = 1 } = {}) {
    this.seat = seat;
    this.rng = { s: (seed * 2654435761 + seat * 40503) >>> 0 || 1 };
  }

  decide(game, d) {
    const free = game.freeCommands();
    const colonize = free.filter((c) => c.type === 'colonize');
    if (colonize.length && rngNext(this.rng) < 0.6) return colonize[rngInt(this.rng, colonize.length)];

    const all = candidates(game, d);
    const active = all.filter((c) => !isPassive(c));
    if (active.length && rngNext(this.rng) < 0.9) return active[rngInt(this.rng, active.length)];
    return all[rngInt(this.rng, all.length)];
  }
}
