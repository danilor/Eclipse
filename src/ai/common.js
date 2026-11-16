import { upgradeCandidates } from '../core/rules.js';

// Shared helpers for AI controllers.

// All commands an AI may answer the decision with (excluding the free colonize / trade commands).
export function candidates(game, d, { upgradeLimit = 60 } = {}) {
  const p = game.state.players[d.playerId];
  if (d.kind === 'upgrade') return [...upgradeCandidates(p, { limit: upgradeLimit }), ...d.options];
  return d.options;
}

export const isPassive = (c) => c.type === 'done' || c.type === 'pass' || c.type === 'keep' || c.type === 'stash';
