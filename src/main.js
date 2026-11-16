// Main entry point - scenes are loaded via script tags in index.html
// The scenes are already defined as global classes

// Create the Phaser game instance
const game = new Phaser.Game(gameConfig);

// Add scenes to the game
game.scene.add('BootScene', BootScene);
game.scene.add('MenuScene', MenuScene);
game.scene.add('SetupScene', SetupScene);
game.scene.add('GameScene', GameScene);

// Start with the BootScene
game.scene.start('BootScene');
