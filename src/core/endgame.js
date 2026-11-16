import { scoreBreakdown, totalStorage } from './queries.js';
import { removeInfluence } from './rules.js';
import { NPC } from '../data/constants.js';

export function eliminatePlayer(g, pid) {
  const s = g.state;
  const p = s.players[pid];
  if (p.eliminated) return;
  g.log(`${p.name} has been eliminated.`);
  for (const [k, t] of Object.entries(s.map)) if (t.controller === pid) removeInfluence(s, k);
  s.ships = s.ships.filter((x) => x.owner !== pid);
  p.eliminated = true;
  p.passed = true;
  const alive = s.players.filter((x) => !x.eliminated);
  if (alive.length <= 1) {
    s.over = true;
    s.winner = alive.length === 1 ? alive[0].id : null;
    finishGame(g, true);
  }
}

export function finishGame(g, byElimination = false) {
  const s = g.state;
  s.over = true;
  s.phase = 'end';
  s.finalScores = s.players.map((p) => ({ id: p.id, ...scoreBreakdown(s, p.id), storage: totalStorage(p), eliminated: p.eliminated }));
  if (!byElimination) {
    const ranked = s.finalScores
      .filter((x) => !x.eliminated)
      .sort((a, b) => b.total - a.total || b.storage - a.storage);
    s.winner = ranked.length ? ranked[0].id : null;
  }
  g.log(s.winner == null ? 'The game ends without a winner.' : `${s.players[s.winner].name} wins the game!`);
  g.emit('gameOver', { winner: s.winner });
}

export { NPC };
