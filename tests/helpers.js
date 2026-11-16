import { Game } from '../src/core/game.js';
import { Match } from '../src/core/match.js';
import { createAI } from '../src/ai/registry.js';
import { POP_CUBES_PER_TRACK, RESOURCES, SHIP_LIMITS, TECH_CATEGORIES, TECH_TRACK_SIZE } from '../src/data/constants.js';
import { actionDiscCount, controlledKeys } from '../src/core/queries.js';
import { blueprintError } from '../src/core/stats.js';

export const SPECIES_PAIRS = [
  ['terran-federation', 'terran-directorate'],
  ['terran-union', 'terran-alliance'],
  ['hydran', 'draco'],
  ['eridani', 'planta'],
  ['mechanema', 'orion'],
  ['terran-republic', 'terran-conglomerate'],
];

export function makeGame(seed, a = 'terran-union', b = 'terran-alliance', options = {}) {
  return new Game({
    seed,
    options: { events: false, ...options },
    players: [
      { species: a, name: 'A', kind: 'ai' },
      { species: b, name: 'B', kind: 'ai' },
    ],
  });
}

export function makeMatch(seed, aiA = 'heuristic', aiB = 'heuristic', a, b, options) {
  const game = makeGame(seed, a, b, options);
  return new Match(game, [createAI(aiA, 0), createAI(aiB, 1)]);
}

// Throws a descriptive error when a rule invariant is broken.
export function checkInvariants(s) {
  const fail = (msg) => {
    throw new Error(`Invariant broken (round ${s.round}, ${s.phase}): ${msg}`);
  };
  const ids = new Set();
  for (const ship of s.ships) {
    if (ids.has(ship.id)) fail(`duplicate ship id ${ship.id}`);
    ids.add(ship.id);
    if (!s.map[ship.at]) fail(`ship ${ship.id} is outside the map (${ship.at})`);
    if (ship.damage < 0) fail(`ship ${ship.id} has negative damage`);
  }
  for (const p of s.players) {
    if (p.eliminated) continue;
    for (const r of RESOURCES) {
      if (!Number.isInteger(p.res[r]) || p.res[r] < 0) fail(`player ${p.id} has ${p.res[r]} of ${r}`);
      const onMap = Object.values(s.map)
        .flatMap((t) => t.cubes)
        .filter((c) => c.owner === p.id && c.track === r).length;
      const total = p.pop[r] + p.grave[r] + onMap;
      if (total !== POP_CUBES_PER_TRACK) fail(`player ${p.id} has ${total} ${r} cubes (expected ${POP_CUBES_PER_TRACK})`);
    }
    const discs = p.track + actionDiscCount(p) + p.reactionDiscs + controlledKeys(s, p.id).length;
    if (discs !== p.totalDiscs) fail(`player ${p.id} has ${discs} discs (expected ${p.totalDiscs})`);
    if (p.colony.up < 0 || p.colony.up > p.colony.total) fail(`player ${p.id} colony ships ${p.colony.up}/${p.colony.total}`);
    for (const c of TECH_CATEGORIES) if (p.techs[c].length > TECH_TRACK_SIZE) fail(`player ${p.id} overfilled ${c}`);
    for (const type of Object.keys(SHIP_LIMITS)) {
      const n = s.ships.filter((x) => x.owner === p.id && x.type === type).length;
      if (n > SHIP_LIMITS[type]) fail(`player ${p.id} has ${n} ${type}s`);
    }
    for (const type of Object.keys(p.blueprints)) {
      const err = blueprintError(p, type);
      if (err) fail(`player ${p.id}: ${err}`);
    }
  }
  for (const [k, t] of Object.entries(s.map)) {
    if (t.controller != null && !s.players[t.controller]) fail(`sector ${k} has an unknown controller`);
    const squares = new Set();
    for (const c of t.cubes) {
      if (c.owner !== t.controller) fail(`sector ${k} holds a foreign cube`);
      if (squares.has(c.sq)) fail(`sector ${k} has two cubes on square ${c.sq}`);
      squares.add(c.sq);
    }
  }
}

// Plays a match to the end, checking the invariants every `every` AI decisions.
export function playOut(match, { every = 4, limit = 20000 } = {}) {
  let n = 0;
  while (match.step()) {
    if (++n % every === 0) checkInvariants(match.game.state);
    if (n > limit) throw new Error('The match did not finish.');
  }
  checkInvariants(match.game.state);
  return n;
}

// Minimal stand-in for Game, enough to run engine generators (combat, discoveries...) in isolation.
export function fakeGame(state) {
  return {
    state,
    options: { events: false },
    log: (text) => state.log.push({ r: state.round, t: text }),
    emit() {},
    ask: (playerId, kind, ctx, options) => ({ playerId, kind, ctx, options: typeof options === 'function' ? options() : options }),
  };
}

// Runs a generator to completion, answering every decision with `choose(decision)`.
export function drive(gen, choose) {
  const asked = [];
  let r = gen.next();
  while (!r.done) {
    asked.push(r.value);
    r = gen.next(choose(r.value));
  }
  return asked;
}
