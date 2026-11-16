import { RandomAI } from './random.js';
import { HeuristicAI } from './heuristic.js';

// Registry of the computer opponents. Adding a new opponent = write a class with `decide(game, decision)`
// that returns one legal command, then register it here. Each seat of a match gets its own instance, so
// a match may mix any number of different opponents.
const REGISTRY = new Map();

export function registerAI(cls) {
  REGISTRY.set(cls.id, cls);
}

registerAI(HeuristicAI);
registerAI(RandomAI);

export const AI_IDS = [...REGISTRY.keys()];

export function listAIs() {
  return [...REGISTRY.values()].map((c) => ({ id: c.id, label: c.label, description: c.description || '' }));
}

export function createAI(id, seat, options = {}) {
  const cls = REGISTRY.get(id);
  if (!cls) throw new Error(`Unknown AI "${id}".`);
  return new cls(seat, options);
}

// One controller per seat of a game configuration: null for a human seat, an AI instance otherwise.
export function controllersFor(config) {
  return config.players.map((p, seat) => (p.kind === 'ai' ? createAI(p.ai ?? 'heuristic', seat, { seed: config.seed }) : null));
}
