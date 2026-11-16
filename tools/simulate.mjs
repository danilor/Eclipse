import { createMatch } from '../src/core/match.js';
import { SPECIES_LIST } from '../src/data/species.js';
import { createAI, AI_IDS } from '../src/ai/registry.js';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = 'true'] = a.replace(/^--/, '').split('=');
    return [k, v];
  })
);

const games = Number(args.games ?? 10);
const seed0 = Number(args.seed ?? 1);
const aiA = args.a ?? 'heuristic';
const aiB = args.b ?? 'heuristic';
const verbose = args.verbose === 'true';
if (![aiA, aiB].every((id) => AI_IDS.includes(id))) {
  console.error(`Unknown AI. Available: ${AI_IDS.join(', ')}`);
  process.exit(1);
}

const wins = [0, 0, 0];
const totals = [0, 0];
let rounds = 0;
let decisions = 0;
const t0 = Date.now();
for (let i = 0; i < games; i++) {
  const seed = seed0 + i;
  const sa = SPECIES_LIST[(seed * 7) % SPECIES_LIST.length].id;
  let sb = SPECIES_LIST[(seed * 7 + 1 + (seed % 5)) % SPECIES_LIST.length].id;
  if (sb === sa) sb = SPECIES_LIST[(SPECIES_LIST.findIndex((x) => x.id === sa) + 1) % SPECIES_LIST.length].id;
  const match = createMatch(
    {
      seed,
      options: { events: false },
      players: [
        { species: args.speciesA ?? sa, name: 'A', kind: 'ai', ai: aiA },
        { species: args.speciesB ?? sb, name: 'B', kind: 'ai', ai: aiB },
      ],
    },
    [createAI(aiA, 0, { seed }), createAI(aiB, 1, { seed })]
  );
  try {
    decisions += match.run();
  } catch (e) {
    console.error(`Game ${i + 1} (seed ${seed}, ${sa} vs ${sb}) crashed:`, e.stack);
    process.exitCode = 1;
    continue;
  }
  const s = match.game.state;
  rounds += s.round;
  const w = s.winner ?? -1;
  wins[w < 0 ? 2 : w]++;
  s.finalScores.forEach((f, idx) => (totals[idx] += f.total));
  if (verbose) {
    console.log(
      `seed ${seed}: ${sa} vs ${sb} -> winner ${w < 0 ? 'none' : s.players[w].name}; ` +
        s.finalScores.map((f) => `${f.id}:${f.total}${f.eliminated ? '(elim)' : ''}`).join(' ')
    );
  }
}
const n = Math.max(1, games);
console.log(
  `${games} games in ${((Date.now() - t0) / 1000).toFixed(1)}s | wins A/B/none: ${wins.join('/')} | ` +
    `avg score A ${(totals[0] / n).toFixed(1)} B ${(totals[1] / n).toFixed(1)} | avg rounds ${(rounds / n).toFixed(1)} | ` +
    `avg decisions ${Math.round(decisions / n)}`
);
