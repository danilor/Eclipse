# Eclipse: Second Dawn for the Galaxy – Road Map

Status of the offline **1 human vs 1 computer** adaptation built with Phaser 3 (version 0.1).
The rules follow `source_data/rulebook.pdf`; the species boards, technologies, sector tiles and the
other reference sheets in `source_data/` were transcribed into `src/data`.

Legend: ✅ implemented · ⚠️ implemented as an approximation (see [section 3](#3-approximations-and-house-rules)) · ❌ not in this version

---

## 1. Features in this version

### 1.1 Rules engine (`src/core`, no Phaser dependency)

- ✅ Deterministic, generator-based engine: a game is a configuration plus a log of commands, so it can be
  saved, resumed, replayed and simulated. A seeded random number generator drives every shuffle and die.
- ✅ Every moment that needs a player is a *decision* with the exact list of legal commands, which is what
  lets the UI and the computer opponents share one code path.
- ✅ Two-player galaxy layout: Galactic Center with its defender, both home sectors, the inner, middle and outer
  sector stacks, discovery tiles, Ancients and Guardians, the technology tray and the reputation bag.
- ✅ Eight rounds with the four phases: **Action**, **Combat**, **Upkeep** and **Cleanup**; first player to pass
  becomes the start player and gets 2 Money.
- ✅ The six actions with their activations (**Explore, Research, Upgrade, Build, Move, Influence**), the
  Influence Disc economy and the **Reactions** (Upgrade, Build, Move with one activation, without tech bonuses)
  that are available once a player has passed.
- ✅ Exploring: drawing a tile for a zone, taking or discarding it, placing it with every legal rotation,
  Wormhole Connection rules, taking control of the new sector, discoveries, Ancients and Guardians on it.
- ✅ Research with the tech tray, discounts from the three technology tracks, the minimum price and the
  track victory points; rare technologies; Artifact Key, Ancient Labs, Quantum Grid and the other tech effects.
- ✅ Upgrade: full Blueprint editing (replace or remove parts, energy balance, drive, initiative, computers,
  shields, hulls) with the activations of each species and Pico Modulator; Ancient parts can be placed at once
  or kept for a later Upgrade.
- ✅ Build: ships, Starbases, Orbitals and Monoliths with the Material cost of the species, the ship limits and
  the Nanorobots bonus.
- ✅ Move: drive range, wormhole movement (Wormhole Generator), pinning (and Cloaking Device), Improved Logistics.
- ✅ Influence: moving Influence Discs between the Influence Track and sectors (take, move and give up control).
- ✅ **Colony Ships** (usable at any time during an action), **Trade** with the rate of each species and Population
  Cubes on the three Population Tracks including the advanced squares.
- ✅ Upkeep: placing colony ships, income from the Population Tracks, the Civilization Upkeep scale,
  and **bankruptcy** (trade resources or abandon sectors).
- ✅ Combat: battle order by entry, missiles that fire once, initiative, dice colours, Computers, Shields,
  Hull and damage, retreating (with the "retreating ships can still be hit" rule), stalemate handling,
  attacks on Population (and Neutron Bombs / Neutron Absorber), losing and taking control of sectors,
  claiming discovery tiles, and Reputation Tile draws for every participant (one for taking part, unless all your
  remaining ships retreat, plus one or more per destroyed enemy ship, at most five; the best tile drawn is kept).
- ✅ Non-player ships: Ancients, Guardians and the Galactic Center Defense System with their blueprints.
- ✅ Discovery tiles (35): resources, Ancient Technology, Ancient Cruiser, Ancient Orbital, Ancient Monolith,
  Ancient ship parts and the Muon Source, each either used immediately or kept for 2 VP.
- ✅ End of game scoring: Reputation, Controlled Sectors, Monoliths, kept Discoveries, Technology Tracks and the
  species-specific points (Planta per controlled Sector, Descendants of Draco per Ancient on the board) with a
  per-category breakdown; ties are broken by stored resources, and a player left with no ships and no sectors
  (or who cannot pay the upkeep at all) is eliminated.

### 1.2 Content (`src/data`)

- ✅ **12 playable factions**: Terran Federation, Directorate, Union, Republic, Conglomerate and Alliance,
  Eridani Empire, Hydran Progress, Planta, Descendants of Draco, Mechanema and Orion Hegemony – each with its
  blueprints, start resources, starting technologies, activations, costs and special rules.
- ✅ **38 technologies** (24 regular with their copy counts and 14 rare) and **32 ship parts**
  (basic, technology, rare and 7 Ancient parts plus the Muon Source).
- ✅ **60 sector tiles** with their wormholes, population squares (normal and advanced), artifacts, discovery
  markers, Ancient/Guardian markers and the Galactic Center (the three Warp Portal sectors are transcribed too
  but kept out of the exploration stacks, see 2.1).
- ✅ Reputation tiles, discovery tiles, NPC blueprints, species boards and costs as listed on the player aids.

### 1.3 Computer opponents (`src/ai`)

- ✅ Pluggable opponents: an AI is a class with `static id`, `static label` and `decide(game, decision)` that
  returns one legal command; `registerAI(cls)` in `src/ai/registry.js` makes it available to the menu and tools.
- ✅ A match is a `Game` plus **one controller per seat** (`src/core/match.js`); `null` marks a human seat.
  The engine already supports any number of seats, so extra opponents only need a layout (see 2.1).
- ✅ **Heuristic AI**: one-ply greedy player with a static position evaluation (economy, expansion, tech,
  fleet strength, combat odds, upkeep risk, victory points) and tactical estimates for moves and battles.
- ✅ **Random AI** as a baseline and a stress test for the rules engine.
- ✅ A misbehaving AI can never freeze a match: in the browser an illegal or failing decision falls back to the
  most passive legal command.

### 1.4 Game UI (Phaser 3, `src/ui`, `src/scenes`, `src/app`)

- ✅ Main menu: species cards for you and the rival, seed box with "New random seed", AI choice,
  **Start game**, **Continue saved game** and **How to play**.
- ✅ Galaxy map: drag to pan, wheel to zoom, "Fit view", hover tooltips for sectors, ships, population squares and
  discoveries, sprites for every ship type, colour tinted per player, Ancients, Guardians, Orbitals and Monoliths.
- ✅ Sector placement with a rotation preview, Colony Ship mode that highlights every legal Population square,
  move/influence/build destinations, selection highlights and effects (flashes, dice, floating numbers).
- ✅ Player board on the left: resources and production, Influence Track and upkeep, Population Tracks,
  Technology Tracks with the discount, blueprint overview (click to edit), Colony Ships, trade rate,
  Reputation and a summary of the opponent with a detailed **opponent board**.
- ✅ Right panel: live victory point breakdown for both players, hint of what to do next and the event log.
- ✅ Top bar: round tracker, AI speed (Slow / Normal / Fast / Instant), "Skip reactions", Tech tray, Help, Menu.
- ✅ Dialogs for everything the rules ask: research (tech tray with prices and track choice), Blueprint
  upgrade (pick a part from the palette, click a slot to place or remove it, with the live Initiative, Computer,
  Shield, Hull, Drive and energy figures, in red when the energy budget is exceeded), trade, discovery, Ancient
  parts, Artifact Key, bankruptcy, retreat, and a paged **battle report** (summary plus every engagement round
  with each die rolled).
- ✅ Game over scene with the final score and "Play again" / "Main menu".
- ✅ Autosave after every command and **Continue saved game** (`localStorage`, replayed from the command log).
- ✅ URL options: `?autoplay=1`, `?quick`, `?seed=`, `?speed=`, `?species=`, `?versus=`, `?ai=`.
- ✅ The Phaser game scale-fits any window size; all art is generated or rendered from the supplied 3D models.

### 1.5 Assets

- ✅ The STL models in `source_data/3D` (human, bulrathi, gnolam, klackon, psilon, silicoid ships, Ancients,
  Guardian, Orbital, marker) are rendered to 28 transparent sprites by `tools/render_models.py`
  (only `numpy` + `Pillow`); the game tints them with the player colour.
- ✅ Sector tiles, tech cards, discs and cubes are drawn at run time with Phaser graphics; no scanned board-game
  artwork is used.

### 1.6 Quality tooling

- ✅ Vitest suite (91 tests) for the data tables, set-up, rules, combat (including the event stream that feeds the
  battle report), whole-game replay and forking from the seed and command log, and the AIs (`npm test`).
- ✅ `tools/simulate.mjs` – AI vs AI simulations with statistics (win rates, scores, rounds, speed).
- ✅ `tools/ui-smoke.mjs` – plays a whole match through the real UI and fails on any console error.
- ✅ `tools/ui-drive.mjs` – plays the human seat of a whole match **with real mouse clicks** and proves that
  every decision the engine can ask can be answered through the UI (see the README).
- ✅ `tools/trace.mjs` and `tools/debug-values.mjs` – inspect what the heuristic AI sees and why it chose a command.

---

## 2. Rulebook features that are not in this version

### 2.1 Not implemented

| Rulebook feature | Notes |
|---|---|
| Games of 3–6 players (galaxy layouts, number of outer sectors per player count) | Only the 2-player layout exists in `src/core/setup.js` (`LAYOUTS`); the stack sizes for 3–6 players are already in the data. The match, the AI registry and the engine are per seat, so a new layout plus a menu entry is what is missing. |
| **Ambassador Tiles and Diplomatic Relations** | Rulebook: 4+ players only. Includes breaking relations and "Acts of Aggression". |
| **Traitor Tile** | Part of Diplomatic Relations (−2 VP for its holder). |
| **Advanced Blueprint tiles** for the Ancients, Guardians and Galactic Center Defense System (marked with two notches) | Only the regular NPC Blueprints are used, as the rulebook recommends for new players. |
| **Warp Portals** (optional module) | Sectors 281, 381 and 382, the Ancient Warp Portal discovery tile, the Warp Portal rare technology and the Warp Portal tile are left out of the stacks. |
| Choices that the rulebook gives the player and the game makes for them | Which Reputation Tile to keep, how to assign each die to an enemy ship, and which resource type the Artifact Key pays (see section 3). |

### 2.2 Interface and platform ideas that the rulebook does not require

- ❌ Online or hot-seat multiplayer, spectating, replays viewer (the engine can already replay a command log).
- ❌ Sound and music, combat animations beyond the dice/flash effects, 3D ship view.
- ❌ Touch-first layout for phones, keyboard shortcuts and accessibility options (colour-blind palettes).
- ❌ Tutorial / guided first game (there is a **How to play** summary and tooltips everywhere).
- ❌ Undo of the last command (possible because the game is a command log, not exposed in the UI).

---

## 3. Approximations and house rules

These are the places where the game deliberately differs from, or fills in gaps of, the printed rules.

| Area | What the game does |
|---|---|
| Ancient parts and Muon Source | The rulebook text gives no numbers for them (they are printed on the tiles), so the stats are approximations (`src/data/parts.js`): Ion Turret 2 yellow dice, Plasma Turret 2 orange dice, Axion Computer +3 / initiative +2, Hypergrid Source +11 energy, Conformal Drive 4 / initiative +3, Flux Shield 3, Shard Hull 3, Muon Source +4 energy. Two of each Ancient part are in the discovery pool (14 tiles, as in the rulebook). |
| Missile parts | Flux Missile and Plasma Missile add no initiative; missiles fire once at the start of a battle, ship type by ship type in initiative order. |
| Dice assignment | Dice are assigned to enemy ships automatically (kill the biggest ships that can be killed, then spread the rest); the player is not asked. |
| Antimatter Splitter | Every damage point of an Antimatter Cannon hit becomes a separate hit that the same automatic assignment places freely. |
| Reputation tiles | When several are drawn, the best one is kept automatically. |
| Artifact Key | The player picks **one** resource type for the whole payout instead of one type per Artifact. |
| Descendants of Draco | Always draw two sectors per Explore activation and place one or none; the unplaced tile goes back on top of its stack (the FAQ lets the player decide after the first one). |
| Stalemates | If no ship on either side can hurt the other, the attacker is forced to retreat (or is destroyed); any battle is cut off after 60 rounds. |
| Hidden information | The VP panel and the opponent board show everything about the computer player, including the totals of its Reputation Tiles and kept Discovery Tiles that stay facedown in the board game. |

---

## 4. Next steps (suggested order)

1. **3–6 player layouts** and a "number of opponents" selector in the menu (the engine, `Match` and `registerAI`
   are already per seat; the menu offers exactly one opponent today).
2. **A stronger opponent**: a lookahead / Monte-Carlo player on top of the same `decide(game, decision)` interface,
   plus difficulty levels and species-specific personalities (builder, raider, scientist).
3. **Ambassadors, Diplomatic Relations and the Traitor Tile** for 4+ player games.
4. **Warp Portals** module and **Advanced Blueprints**.
5. A choice for Reputation Tiles, dice assignment and Artifact Key resources instead of the automatic picks.
6. Presentation: sound, combat animations, optional 3D ships with the original STL files, touch layout.
7. Undo and replay viewer built on the command log.
