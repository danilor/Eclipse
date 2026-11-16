import { createMatch } from '../src/core/match.js';
import { createAI } from '../src/ai/registry.js';
import { HeuristicAI } from '../src/ai/heuristic.js';
import { evaluate } from '../src/ai/evaluate.js';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = 'true'] = a.replace(/^--/, '').split('=');
    return [k, v];
  })
);
const seed = Number(args.seed ?? 2);
const stopRound = Number(args.round ?? 2);
const stopSeat = Number(args.seat ?? 1);
const match = createMatch(
  {
    seed,
    options: { events: false },
    players: [
      { species: args.speciesA ?? 'terran-union', name: 'A', kind: 'ai', ai: 'heuristic' },
      { species: args.speciesB ?? 'terran-alliance', name: 'B', kind: 'ai', ai: 'heuristic' },
    ],
  },
  [createAI('heuristic', 0), createAI('heuristic', 1)]
);
const ai = new HeuristicAI(0);
for (;;) {
  const g = match.game;
  const d = g.decision;
  if (!d) break;
  if (d.kind === 'chooseAction' && g.state.round === stopRound && d.playerId === stopSeat) {
    const s = g.state;
    const p = s.players[d.playerId];
    console.log('track', p.track, 'res', JSON.stringify(p.res), 'eval', evaluate(s, p.id).toFixed(1));
    for (const c of d.options) {
      if (c.type === 'action') console.log(c.action, ai.actionValue(s, p, c.action, false).toFixed(2));
    }
    console.log('techs', JSON.stringify(p.techs), 'colony', JSON.stringify(p.colony), 'pop', JSON.stringify(p.pop));
    console.log('ships', s.ships.filter((x) => x.owner === p.id).map((x) => `${x.type}@${s.map[x.at].id}`).join(' '));
    console.log('controlled', Object.entries(s.map).filter(([, t]) => t.controller === p.id).map(([k, t]) => `${t.id}[${t.cubes.length}]`).join(' '));
    break;
  }
  match.step();
}
