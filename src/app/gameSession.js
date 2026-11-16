import { COLORS, RECT } from '../config.js';
import { controllersFor, createAI } from '../ai/registry.js';
import { Game } from '../core/game.js';
import { Match } from '../core/match.js';
import { SPECIES } from '../data/species.js';
import { BattleTracker, openBattleReport } from '../ui/battleReport.js';
import { BOARD_HEIGHT, BoardPanel } from '../ui/boardPanel.js';
import { openHelp, tipArea } from '../ui/dialogs.js';
import { Effects } from '../ui/effects.js';
import { describeTile } from '../ui/info.js';
import { Modal, label, wait } from '../ui/kit.js';
import { MapView } from '../ui/mapView.js';
import { OPP_HEIGHT, OpponentPanel } from '../ui/opponentPanel.js';
import { Presenter } from '../ui/presenter.js';
import { PromptBar } from '../ui/promptBar.js';
import { settings, speedMs } from '../ui/settings.js';
import { RightColumn } from '../ui/sidePanels.js';
import { openTechDialog } from '../ui/techDialog.js';
import { TopBar } from '../ui/topBar.js';
import { clearSave, saveGame } from './session.js';

const AI_VERBS = {
  chooseAction: 'is choosing an action',
  chooseReaction: 'is deciding whether to react',
  explore: 'is exploring',
  placeSector: 'is placing a new sector',
  takeControl: 'is claiming a sector',
  research: 'is researching',
  upgrade: 'is upgrading its ships',
  build: 'is building',
  move: 'is moving ships',
  influence: 'is moving Influence Discs',
  upkeepColonize: 'is placing Population',
  engage: 'is deciding whether to retreat',
  discovery: 'is resolving a Discovery Tile',
  artifactKey: 'is cashing in an Artifact Key',
  chooseTech: 'is picking a technology',
  ancientPart: 'is salvaging an Ancient part',
  muon: 'is picking a Blueprint',
  bankruptcy: 'is raising money',
};

// Everything one running match needs: the rules engine, the controllers of every seat, the widgets and the
// loop that alternates between the human (through the Presenter) and the computer seats. A new session is
// created every time the Game scene starts, so promises left over from an earlier match can never touch it.
export class GameSession {
  constructor(scene, launch) {
    this.scene = scene;
    this.alive = true;
    this.autoplay = !!launch.autoplay;
    this.engine = launch.game ?? new Game(launch.config);
    this.engine.drainEvents();
    const config = this.engine.config;
    const seats = this.engine.state.players;
    this.humanId = Math.max(0, seats.findIndex((p) => p.kind === 'human'));
    this.controllers = controllersFor(config);
    this.match = new Match(this.engine, this.controllers, {
      strict: false,
      onError: (err, d) => {
        console.error(`The computer opponent failed on a "${d.kind}" decision; a safe move was used instead.`, err);
      },
    });
    this.autoAI = this.autoplay ? createAI('heuristic', this.humanId, { seed: config.seed }) : null;
    this.tracker = new BattleTracker();
    this.tracker.snapshot(this.engine.state);
    this.reports = [];
    this.streak = 0;
    this.autoGate = null;
    this.tipText = null;
    this.pinText = null;
    this.hoverKey = null;
    this.detailBoard = null;

    this.build();
    this.bindEvents();
    this.refreshAll();
    this.view.fit(false, true);
    this.syncInfo();
    this.loop();
  }

  // ------------------------------------------------------------------ construction

  build() {
    const scene = this.scene;
    scene.cameras.main.setBackgroundColor(COLORS.bg);
    this.stars();

    const left = scene.add.graphics().setDepth(99);
    left.fillStyle(COLORS.bg, 1);
    left.fillRect(RECT.left.x, RECT.left.y, RECT.left.w, RECT.left.h);

    this.view = new MapView(scene, this.engine);
    const top = RECT.left.y + 4;
    this.board = new BoardPanel(scene, this.engine, this.humanId, 5, top);
    // The duel layout has a single opponent; further computer seats would get a panel each.
    const rivals = this.engine.state.players.filter((p) => p.id !== this.humanId);
    this.rivals = rivals.slice(0, 1).map(
      (p) => new OpponentPanel(scene, this.engine, p.id, 5, top + BOARD_HEIGHT + 6, { onDetails: (pid) => this.openPlayerBoard(pid) })
    );
    this.right = new RightColumn(scene, this.engine);
    this.topBar = new TopBar(scene, this.engine, {
      onTechs: () => openTechDialog(scene, this.engine, this.humanId),
      onHelp: () => openHelp(scene),
      onMenu: () => this.leave(),
      onSettingsChanged: () => this.onSettingsChanged(),
    });
    this.prompt = new PromptBar(scene);
    this.effects = new Effects(scene, this.view, this.humanId);
    this.presenter = new Presenter({
      scene,
      game: this.engine,
      view: this.view,
      prompt: this.prompt,
      pid: this.humanId,
      applyFree: (cmd) => this.apply(cmd),
      tracker: this.tracker,
    });
    this.prompt.set({ title: 'Setting up the galaxy\u2026', hint: '' });
  }

  stars() {
    const g = this.scene.add.graphics().setDepth(-5);
    const m = RECT.map;
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 160; i++) {
      g.fillStyle(0xffffff, 0.08 + rnd() * 0.35);
      g.fillCircle(m.x + rnd() * m.w, m.y + rnd() * m.h, 0.5 + rnd() * 1.3);
    }
  }

  bindEvents() {
    const scene = this.scene;
    this.onTip = (text) => {
      this.tipText = text;
      this.syncInfo();
    };
    this.onPin = (text) => {
      this.pinText = text;
      this.syncInfo();
    };
    this.onHover = (key) => {
      this.hoverKey = key;
      this.syncInfo();
    };
    this.onUnload = () => {
      if (!this.engine.over) saveGame(this.engine);
    };
    scene.events.on('tip', this.onTip);
    scene.events.on('pin', this.onPin);
    this.view.on('hover', this.onHover);
    window.addEventListener('beforeunload', this.onUnload);
  }

  dispose() {
    this.alive = false;
    this.scene.events.off('tip', this.onTip);
    this.scene.events.off('pin', this.onPin);
    window.removeEventListener('beforeunload', this.onUnload);
    this.view.removeAllListeners();
    if (window.__eclipse === this) window.__eclipse = null;
  }

  // ------------------------------------------------------------------ info box and settings

  syncInfo() {
    const hover = this.hoverKey && !this.scene.modals?.size ? describeTile(this.engine.state, this.hoverKey) : null;
    this.right.show(this.tipText ?? hover ?? this.pinText);
  }

  onSettingsChanged() {
    const d = this.engine.decision;
    if (settings.skipReactions && d?.kind === 'chooseReaction' && this.presenter.pending && this.match.awaitingHuman) {
      this.presenter.submit({ type: 'pass' });
    }
  }

  refreshAll() {
    this.view.refresh();
    this.board.update();
    for (const r of this.rivals) r.update();
    this.topBar.update();
    this.right.update();
    this.detailBoard?.update();
  }

  // ------------------------------------------------------------------ applying commands

  // Runs something that changes the game (a human command or an AI step) and brings the screen up to date.
  applyWith(run) {
    const g = this.engine;
    this.tracker.snapshot(g.state);
    let ok = true;
    try {
      run();
    } catch (err) {
      ok = false;
      console.error('The game rejected a command', err);
      this.presenter.warn(String(err.message ?? err));
    }
    const events = g.drainEvents();
    this.tracker.consume(events, g.state);
    this.effects.play(events, g.state);
    this.refreshAll();
    for (const rec of this.tracker.takeFinished()) {
      if (rec.attacker === this.humanId || rec.defender === this.humanId) this.reports.push(rec);
    }
    return ok;
  }

  apply(cmd) {
    return this.applyWith(() => this.engine.apply(cmd));
  }

  async showReports() {
    while (this.alive && this.reports.length) {
      const rec = this.reports.shift();
      if (this.autoplay) continue;
      await openBattleReport(this.scene, { state: this.engine.state, record: rec, humanId: this.humanId });
    }
  }

  // ------------------------------------------------------------------ the loop

  async loop() {
    const g = this.engine;
    try {
      while (this.alive && g.decision) {
        const d = g.decision;
        if (this.match.awaitingHuman) await this.humanTurn(d);
        else await this.computerTurn(d);
      }
      if (this.alive) await this.finish();
    } catch (err) {
      console.error('The game loop stopped unexpectedly', err);
      this.prompt.set({ title: 'Something went wrong', hint: 'The game loop stopped. Use Menu to leave; your game is saved.' });
    }
  }

  async humanTurn(d) {
    this.streak = 0;
    this.refreshAll();
    if (d.kind === 'chooseReaction' && settings.skipReactions && !this.autoplay) {
      this.apply({ type: 'pass' });
      return;
    }
    if (!this.autoplay) saveGame(this.engine);
    const asked = this.presenter.ask(d);
    if (this.autoplay) {
      await wait(this.scene, 25);
      if (!this.alive) return;
      if (this.autoGate) await this.autoGate(d);
      if (!this.alive) return;
      if (this.presenter.pending && this.engine.decision === d) {
        const cmd = this.autoAI.decide(this.engine, d);
        if (!this.presenter.submit(cmd)) this.presenter.submit(d.options[0]);
      }
    }
    const cmd = await asked;
    if (!this.alive) return;
    this.apply(cmd);
    await this.showReports();
  }

  async computerTurn(d) {
    const p = this.engine.state.players[d.playerId];
    this.refreshAll();
    this.prompt.set({ title: `${p.name} ${AI_VERBS[d.kind] ?? 'is thinking'}\u2026`, hint: 'The computer opponent is playing. Watch the log on the right to follow what it does.' });
    const ms = speedMs();
    const pause = d.kind === 'chooseAction' || d.kind === 'chooseReaction' ? ms : ms * 0.45;
    if (pause > 0) {
      this.streak = 0;
      await wait(this.scene, pause);
    } else if (++this.streak % 25 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (!this.alive || this.engine.decision !== d) return;
    this.applyWith(() => this.match.step());
    await this.showReports();
  }

  async finish() {
    this.refreshAll();
    this.prompt.set({ title: 'The game is over', hint: 'Counting the final scores\u2026' });
    clearSave();
    const ms = speedMs();
    if (ms > 0) await wait(this.scene, 1400);
    if (!this.alive) return;
    this.scene.scene.start('GameOver', { game: this.engine, autoplay: this.autoplay });
  }

  leave() {
    if (!this.engine.over) saveGame(this.engine);
    this.scene.scene.start('Menu');
  }

  // ------------------------------------------------------------------ dialogs

  openPlayerBoard(pid) {
    const scene = this.scene;
    const p = this.engine.state.players[pid];
    const sp = SPECIES[p.species];
    const w = 940;
    const h = 880;
    const modal = new Modal(scene, { title: `${sp.name} \u2014 player board`, w, h });
    this.detailBoard = new BoardPanel(scene, this.engine, pid, 24, 56, { parent: modal.body });
    modal.once('destroy', () => {
      this.detailBoard = null;
    });
    const x = 470;
    modal.body.add(label(scene, x, 58, sp.bio, { size: 15, color: '#c9d3ee', wrap: w - x - 24, spacing: 2 }));
    modal.body.add(label(scene, x, 168, 'SPECIES RULES', { size: 12, bold: true, color: COLORS.muted }));
    modal.body.add(label(scene, x, 190, sp.rules.map((r) => `\u2022 ${r}`).join('\n'), { size: 15, wrap: w - x - 24, spacing: 4 }));
    tipArea(scene, modal, x, 390, w - x - 24, 420, { size: 15, hint: 'Hover over any part of the board to read what it shows.' });
    return modal;
  }
}
