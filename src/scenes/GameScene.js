import Phaser from 'phaser';
import { GameSession } from '../app/gameSession.js';

// Thin Phaser wrapper: the match itself lives in a GameSession that is rebuilt on every start.
export class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  init(data) {
    this.launch = data ?? {};
  }

  create() {
    this.modals = new Set();
    this.session = new GameSession(this, this.launch);
    window.__eclipse = this.session;
    this.events.once('shutdown', () => {
      this.session?.dispose();
      this.session = null;
    });
  }
}
