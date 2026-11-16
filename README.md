# Eclipse: Second Dawn for the Galaxy — Phaser edition

An offline, single-player adaptation of the board game *Eclipse: Second Dawn for the Galaxy*, built with
[Phaser 3](https://phaser.io). You play a two-player game against a computer opponent: explore the galaxy, expand
your territory, research technologies, design ships, fight, and score the most Victory Points in eight rounds.

This is the first version. What is implemented, which rules are approximated and what was left out is listed in
[`RoadMap.md`](RoadMap.md).

> Unofficial fan project, not affiliated with Lautapelit.fi or Ayeaye Games. The rulebooks and mats in
> `source_data/` are the reference material the game was built from; they are not used at run time.

## Quick start

Requires Node.js 22.12 or newer (Vite 8 alone needs 20.19+, Vitest 5 needs 22.12+).

```powershell
npm install
npm run dev        # development server with hot reload (http://localhost:5173)
npm run build      # production build in dist/
npm run preview    # serve the production build
npm test           # rules engine and AI tests (Vitest, no browser needed)
```

## Playing

The main menu lets you pick your faction and your opponent's faction (12 factions with their own board, start
technologies, blueprints and special rules), the computer opponent that plays the other seat, and an optional seed
(the same seed and factions always give the same galaxy). **Continue saved game** resumes an interrupted match.

During the game the bar at the bottom always tells you what the game expects from you: click the highlighted
sectors, zones and buttons. Press **Help** in the top bar for the rules summary. Handy things to know:

- Drag to pan the map, scroll to zoom, **Fit view** recentres it.
- Hover over almost anything (sectors, ship parts, technologies, counters) to read about it in the info box.
- **Colonize** and **Trade** at the bottom right are free actions, available during any action and the Upkeep phase.
- Every battle you take part in gets a report: a summary and a page per engagement round with every die rolled.
- **Details** on the opponent's panel opens their player board; **Tech tray** shows the technologies for sale.
- The top bar also has the computer's speed (Slow … Instant) and the "Skip reactions" switch. The game is saved
  automatically after every one of your decisions.

URL parameters (all optional): `?speed=fast` (`slow`, `normal`, `fast`, `instant`) sets the computer's speed. `?quick`
skips the menu and starts a game straight away (seed 1, Terran Federation against Planta, heuristic AI), which you can
change with `?seed=123`, `?species=hydran`, `?versus=orion` and `?ai=random`. `?autoplay=1` implies `?quick` and
lets an AI play your seat too (used by the smoke test). Faction ids: `terran-federation`, `terran-directorate`,
`terran-union`, `terran-republic`, `terran-conglomerate`, `terran-alliance`, `eridani`, `hydran`, `planta`, `draco`,
`mechanema`, `orion`.

## How the code is organised

```
src/
  core/    the rules engine: pure JavaScript, no Phaser, no DOM, fully testable in Node
  data/    rulebook data: species, technologies, ship parts, sector tiles, discoveries, reputation, ancients
  ai/      computer opponents and their registry
  app/     glue between engine and screen: the game session (loop, saving) and the match configuration
  scenes/  Phaser scenes: Boot, Menu, Game, GameOver
  ui/      Phaser widgets: map, panels, dialogs, effects, prompt bar, battle report, tile art
tests/     Vitest suites (data, setup, rules, combat, whole games, AI)
tools/     simulation, tracing and browser drivers, sprite renderer
public/assets/models/   sprites rendered from the STL models in source_data/3D
```

**The engine is a decision machine.** `Game` (`src/core/game.js`) runs the whole game as a generator
(`flow.js`, `combat.js`, `discovery.js`, `endgame.js`). Whenever a seat has to choose, the flow yields a
*decision*: `game.decision = { playerId, kind, ctx, options }` with the complete list of legal commands in
`options`. `game.apply(command)` validates the answer and resumes the flow. `colonize` and `trade` are free commands
that may be applied at any time a decision has `allowFree` set. The state is plain JSON and every die roll comes from a
seeded generator, so a game is fully described by its configuration plus the list of commands applied
(`game.serialize()`, `Game.load()`, `game.fork()`). That is what saving, the simulations and the tests rely on.

**Seats and controllers.** A `Match` (`src/core/match.js`) couples a `Game` with one controller per seat: an AI object,
or `null` for a human, in which case the match pauses until the UI supplies a command. Nothing in the engine, the
match or the session assumes two players or a single opponent: a seat is a seat.

**The UI is a view.** `GameSession` (`src/app/gameSession.js`) owns the game loop: computer turns are played with
a pause (the AI speed), human turns are handed to the `Presenter` (`src/ui/presenter.js`), which turns every decision
kind into prompts, highlighted map targets and dialogs and resolves with the chosen command. The map, the player
boards and the log are redrawn from the engine state, and `effects.js` animates the engine's events.

### Adding a computer opponent

An opponent is a class with a `decide(game, decision)` method that returns one of the legal commands
(`decision.options`, plus `game.freeCommands()` when `decision.allowFree`). Register it and it shows up in the
menu, can be selected with `?ai=`, and can play any seat:

```js
// src/ai/cautious.js
export class CautiousAI {
  static id = 'cautious';
  static label = 'Cautious';
  static description = 'Never attacks, always retreats.';

  constructor(seat, { seed } = {}) {
    this.seat = seat;
  }

  decide(game, decision) {
    return decision.options.find((c) => c.type === 'retreat') ?? decision.options[0];
  }
}

// src/ai/registry.js
import { CautiousAI } from './cautious.js';
registerAI(CautiousAI);
```

Two opponents ship with the game: `heuristic` (a one-ply greedy player with a static position evaluation tuned to
the rules, see `src/ai/evaluate.js`, `ratings.js`, `tactics.js` and `techValues.js`) and `random` (legal commands
chosen at random, a baseline and a stress test for the rules). A match configuration names one AI per opponent
(`matchConfig({ human, opponents: [{ species, ai }] })` in `src/app/session.js`), so several different opponents can
share one match once the three-player-and-up galaxy layouts are added (see the roadmap). In non-strict mode `Match`
replaces a failing or illegal AI answer with the most passive legal command, so a bug in an opponent never freezes
the game.

## Tools

| Command | What it does |
| --- | --- |
| `npm run simulate -- --games=20 --a=heuristic --b=random` | Plays AI-vs-AI games headlessly and prints win rates, average scores and rounds. Options: `--seed=`, `--speciesA=`, `--speciesB=`, `--verbose`. |
| `node tools/trace.mjs --seed=3 --a=heuristic --b=heuristic` | Plays one AI-vs-AI game and prints the whole game log and the final scores. Options: `--seed=`, `--a=`, `--b=`, `--speciesA=`, `--speciesB=`. Useful when debugging the engine or an AI. |
| `node tools/debug-values.mjs --seed=2 --round=2 --seat=1` | Plays up to the first action choice of the given seat and round, then prints the heuristic AI's value for every action together with the seat's resources, technologies, ships and sectors. |
| `npm run ui:smoke` | Starts its own Vite server, plays a whole match in a real browser with an AI in the human seat, takes screenshots of the interesting prompts into `tmp/shots` and fails on any console error. |
| `npm run ui:drive` | Plays the human seat with real mouse clicks: every command the AI picks (on a mirror of the engine) must be performed through the UI. Reports commands the UI could not perform, differences from the intended command, warnings and console problems. Options: `--seed=`, `--species=`, `--versus=`, `--menu` (start through the main menu), `--resume=N` (leave to the menu and resume the saved game in round N), `--quirks=retreat,trade` (prefer rarely used branches), `--tour=0`, `--hover=0`, `--out=`, `--gl=swiftshader`. A full match takes two to three minutes. |
| `python tools/render_models.py` | Renders the STL models in `source_data/3D` to the grey sprites in `public/assets/models` (needs `numpy` and `Pillow`). The game tints them with the player colours. |

The browser tools drive the Microsoft Edge or Google Chrome that is installed in its default Windows location through
`playwright-core` (nothing is downloaded); if yours lives elsewhere, adjust the `EXE` list at the top of the tool.
They start their own Vite server from port 5200 upwards, so they never collide with `npm run dev`, and write
screenshots and logs under `tmp/` (ignored by git).

## Tests

`npm test` runs the Vitest suites in `tests/`, none of which needs a browser: hex geometry, the random generator
and the static data against the rulebook (parts, technologies, sectors, species); the set-up of the galaxy for every
faction; the individual rules (upkeep and production tables, influence and population, research, upgrade, build,
move and explore, reputation); combat (dice, hit assignment, hostility, battles, retreats, battle events, the end of the
combat phase); the game flow (illegal commands, free commands, whole rounds, saving, replay from the command log,
forks) and `Match` (human seats, broken opponents); and whole games played out by the AIs with the rules invariants
checked along the way (resources, population cubes and discs conserved, ship limits respected, blueprints valid).

## Assets and credits

- Ship and species sprites are rendered from the STL models in `source_data/3D` with `tools/render_models.py`.
- Sector tiles, technology cards, discs and cubes are drawn at run time with Phaser graphics.
- Rules, tiles, technologies and species data were transcribed from `source_data/rulebook.pdf`, `player_aid.pdf`,
  `species.pdf`, `race.pdf`, `tech.pdf` and the sector PDFs.
