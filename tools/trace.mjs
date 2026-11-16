import { createMatch } from '../src/core/match.js';
import { createAI } from '../src/ai/registry.js';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = 'true'] = a.replace(/^--/, '').split('=');
    return [k, v];
  })
);
const seed = Number(args.seed ?? 1);
const aiA = args.a ?? 'heuristic';
const aiB = args.b ?? 'heuristic';
const match = createMatch(
  {
    seed,
    options: { events: false },
    players: [
      { species: args.speciesA ?? 'hydran', name: 'A', kind: 'ai', ai: aiA },
      { species: args.speciesB ?? 'draco', name: 'B', kind: 'ai', ai: aiB },
    ],
  },
  [createAI(aiA, 0, { seed }), createAI(aiB, 1, { seed })]
);
try {
  match.run();
} catch (e) {
  console.error(e.stack);
}
for (const l of match.game.state.log) console.log(`[${l.r}] ${l.t}`);
const s = match.game.state;
console.log(JSON.stringify(s.finalScores));
