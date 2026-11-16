class MenuScene extends Phaser.Scene {
    constructor() {
        super('MenuScene');
    }

    create() {
        const { width, height } = this.cameras.main;
        
        // Title
        const titleStyle = {
            font: 'bold 64px Arial',
            fill: '#ffffff',
            align: 'center'
        };
        
        const title = this.add.text(width / 2, height * 0.2, 'ECLIPSE', titleStyle);
        title.setOrigin(0.5);
        
        const subtitleStyle = {
            font: '32px Arial',
            fill: '#cccccc',
            align: 'center'
        };
        
        const subtitle = this.add.text(width / 2, height * 0.3, 'Second Dawn for the Galaxy', subtitleStyle);
        subtitle.setOrigin(0.5);
        
        // Menu buttons
        const buttonStyle = {
            font: '24px Arial',
            fill: '#ffffff',
            backgroundColor: '#333333',
            padding: { left: 30, right: 30, top: 10, bottom: 10 },
            align: 'center'
        };
        
        const singlePlayerBtn = this.add.text(width / 2, height * 0.5, '1 vs 1 vs AI', buttonStyle);
        singlePlayerBtn.setInteractive({ useHandCursor: true });
        singlePlayerBtn.on('pointerover', () => singlePlayerBtn.setStyle({ fill: '#ffcc00' }));
        singlePlayerBtn.on('pointerout', () => singlePlayerBtn.setStyle({ fill: '#ffffff' }));
        singlePlayerBtn.on('pointerdown', () => {
            this.scene.start('SetupScene');
        });
        
        const exitBtn = this.add.text(width / 2, height * 0.65, 'Exit', buttonStyle);
        exitBtn.setInteractive({ useHandCursor: true });
        exitBtn.on('pointerover', () => exitBtn.setStyle({ fill: '#ffcc00' }));
        exitBtn.on('pointerout', () => exitBtn.setStyle({ fill: '#ffffff' }));
        exitBtn.on('pointerdown', () => {
            // Simple exit - reload page
            window.location.reload();
        });
        
        // Instructions text
        const instructionsStyle = {
            font: '16px Arial',
            fill: '#aaaaaa',
            align: 'center'
        };
        
        const instructions = this.add.text(width / 2, height * 0.8, 'Press ESC to exit game', instructionsStyle);
        instructions.setOrigin(0.5);
    }
}
