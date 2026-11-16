import { createState } from './setup.js';
import { gameFlow, applyColonize, applyTrade, colonizeOptions, tradeOptions } from './flow.js';
import { canon } from './util.js';

export class IllegalCommand extends Error {}

const MAX_EVENTS = 4000;
const MAX_LOG = 800;

// A Game owns the rules state and the (generator based) game flow. The flow yields a decision whenever
// a seat has to choose; `apply(command)` validates the answer and resumes the flow. Because the state is
// plain data and driven by a seeded RNG, `seed + command log` fully reproduces a game.
export class Game {
  constructor(config) {
    this.config = {
      seed: config.seed ?? Date.now(),
      players: config.players.map((p) => ({ ...p })),
      options: { events: true, ...(config.options || {}) },
    };
    this.options = this.config.options;
    this.state = createState({ seed: this.config.seed, players: this.config.players });
    this.cmdLog = [];
    this.events = [];
    this.decision = null;
    this.flow = gameFlow(this);
    this.advance(undefined);
  }

  // ------------------------------------------------------------ services used by the flow

  log(text) {
    const s = this.state;
    s.log.push({ r: s.round, t: text });
    if (s.log.length > MAX_LOG) s.log.splice(0, s.log.length - MAX_LOG);
  }

  emit(type, data = {}) {
    if (!this.options.events) return;
    this.events.push({ ...data, type });
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
  }

  ask(playerId, kind, ctx, options, extra = {}) {
    return {
      id: ++this.state.decisionSeq,
      playerId,
      kind,
      ctx,
      optionsFn: typeof options === 'function' ? options : () => options,
      allowFree: !!extra.allowFree,
      upkeep: !!extra.upkeep,
      validate: extra.validate || null,
      options: [],
    };
  }

  // ------------------------------------------------------------ driving the flow

  advance(cmd) {
    const r = this.flow.next(cmd);
    if (r.done) {
      this.decision = null;
      return;
    }
    this.decision = r.value;
    this.decision.options = this.decision.optionsFn();
  }

  get over() {
    return this.state.over;
  }

  get player() {
    return this.decision ? this.state.players[this.decision.playerId] : null;
  }

  // Commands usable at any time during the decision without advancing the flow.
  freeCommands() {
    const d = this.decision;
    if (!d || !d.allowFree) return [];
    const p = this.state.players[d.playerId];
    return [...colonizeOptions(this.state, p, { upkeep: d.upkeep }), ...tradeOptions(p)];
  }

  legalCommands() {
    return this.decision ? [...this.decision.options, ...this.freeCommands()] : [];
  }

  validate(cmd) {
    const d = this.decision;
    if (!d) return 'The game is not waiting for a command.';
    if (!cmd || typeof cmd.type !== 'string') return 'Malformed command.';
    const key = canon(cmd);
    if (d.allowFree && (cmd.type === 'colonize' || cmd.type === 'trade')) {
      return this.freeCommands().some((o) => canon(o) === key) ? null : 'That is not possible right now.';
    }
    if (d.options.some((o) => canon(o) === key)) return null;
    if (d.validate) return d.validate(cmd);
    return 'That is not a legal choice.';
  }

  apply(cmd) {
    const error = this.validate(cmd);
    if (error) throw new IllegalCommand(error);
    const d = this.decision;
    const p = this.state.players[d.playerId];
    this.cmdLog.push(cmd);
    if (cmd.type === 'colonize' && d.allowFree) {
      applyColonize(this.state, p, cmd);
      this.log(`${p.name} places a Population Cube in sector ${this.state.map[cmd.at].id}.`);
      this.emit('colonize', { pid: p.id, at: cmd.at });
      d.options = d.optionsFn();
      return;
    }
    if (cmd.type === 'trade' && d.allowFree) {
      applyTrade(p, cmd);
      this.log(`${p.name} trades resources (${cmd.from} -> ${cmd.to}).`);
      this.emit('trade', { pid: p.id });
      d.options = d.optionsFn();
      return;
    }
    this.decision = null;
    this.advance(cmd);
  }

  // ------------------------------------------------------------ persistence

  serialize() {
    return { config: this.config, cmdLog: this.cmdLog };
  }

  static load(data) {
    const g = new Game(data.config);
    for (const cmd of data.cmdLog) g.apply(cmd);
    return g;
  }

  fork() {
    return Game.load(JSON.parse(JSON.stringify(this.serialize())));
  }

  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }
}
