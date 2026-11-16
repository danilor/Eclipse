import Phaser from 'phaser';
import { H, W } from './config.js';
import { BootScene } from './scenes/BootScene.js';
import { GameOverScene } from './scenes/GameOverScene.js';
import { GameScene } from './scenes/GameScene.js';
import { MenuScene } from './scenes/MenuScene.js';

// Entry point: a 1920x1080 canvas that scales to fit the browser window.
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  backgroundColor: '#070b16',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, roundPixels: false },
  disableContextMenu: true,
  scene: [BootScene, MenuScene, GameScene, GameOverScene],
});

window.__phaser = game;
