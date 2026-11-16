class SetupScene extends Phaser.Scene {
    constructor() {
        super('SetupScene');
    }

    create() {
        const { width, height } = this.cameras.main;
        
        // Player setup screen
        const titleStyle = {
            font: 'bold 48px Arial',
            fill: '#ffffff',
            align: 'center'
        };
        
        const title = this.add.text(width / 2, height * 0.15, 'Player Setup', titleStyle);
        title.setOrigin(0.5);
        
        // Race selection
        const races = ['Human', 'Klackon', 'Psilon', 'Gnolam', 'Bulrathi', 'Silicoid'];
        
        const raceContainer = this.add.container(width / 2, height * 0.4);
        
        // Create race selection buttons
        races.forEach((race, index) => {
            const row = Math.floor(index / 3);
            const col = index % 3;
            
            const x = -width * 0.3 + col * width * 0.3;
            const y = -height * 0.2 + row * height * 0.3;
            
            const buttonStyle = {
                font: '20px Arial',
                fill: '#ffffff',
                backgroundColor: '#333333',
                padding: { left: 20, right: 20, top: 10, bottom: 10 },
                align: 'center'
            };
            
            const button = this.add.text(x, y, race, buttonStyle);
            button.setInteractive({ useHandCursor: true });
            
            // Store race info
            button.setData('race', race);
            
            button.on('pointerover', () => button.setStyle({ fill: '#ffcc00' }));
            button.on('pointerout', () => button.setStyle({ fill: '#ffffff' }));
            button.on('pointerdown', () => {
                this.playerRace = race;
                this.createPlayerMat(width, height);
            });
        });
        
        // Instructions
        const instructionsStyle = {
            font: '18px Arial',
            fill: '#aaaaaa',
            align: 'center'
        };
        
        const instructions = this.add.text(width / 2, height * 0.9, 'Select your race to begin', instructionsStyle);
        instructions.setOrigin(0.5);
    }
    
    createPlayerMat(width, height) {
        // Clear previous elements
        this.cameras.main.setBackgroundColor('#000000');
        
        // Display player mat
        const matContainer = this.add.container(width / 2, height / 2);
        
        // Create a simplified player mat representation
        const matWidth = 600;
        const matHeight = 800;
        
        const matBorder = this.add.rectangle(0, 0, matWidth, matHeight, 0x333333);
        matBorder.setStrokeStyle(2, 0xffffff);
        
        const matTitle = this.add.text(0, -350, 'Player Mat', {
            font: 'bold 32px Arial',
            fill: '#ffffff',
            align: 'center'
        });
        matTitle.setOrigin(0.5);
        
        const playerRace = this.playerRace;
        const raceTitle = this.add.text(0, -300, `Race: ${playerRace}`, {
            font: 'bold 28px Arial',
            fill: '#ffcc00',
            align: 'center'
        });
        raceTitle.setOrigin(0.5);
        
        // Simple resource displays
        const resources = [
            { name: 'Energy', value: 5, color: 0xffd700 },
            { name: 'Material', value: 15, color: 0xc0c0c0 },
            { name: 'Knowledge', value: 3, color: 0x800080 },
            { name: 'Food', value: 15, color: 0x00ff00 }
        ];
        
        let yOffset = -200;
        resources.forEach(resource => {
            const resourceText = this.add.text(-200, yOffset, `${resource.name}: ${resource.value}`, {
                font: '20px Arial',
                fill: `#${resource.color.toString(16)}`,
                align: 'left'
            });
            
            const resourceBox = this.add.rectangle(-200, yOffset, 10, 24, resource.color);
            
            yOffset += 50;
        });
        
        // Start game button
        const startBtn = this.add.text(0, 300, 'Start Game', {
            font: 'bold 24px Arial',
            fill: '#ffffff',
            backgroundColor: '#444444',
            padding: { left: 30, right: 30, top: 10, bottom: 10 },
            align: 'center'
        });
        startBtn.setInteractive({ useHandCursor: true });
        startBtn.on('pointerover', () => startBtn.setStyle({ fill: '#ffcc00' }));
        startBtn.on('pointerout', () => startBtn.setStyle({ fill: '#ffffff' }));
        startBtn.on('pointerdown', () => {
            this.scene.start('GameScene');
        });
        
        // Back button
        const backBtn = this.add.text(0, 350, 'Back to Menu', {
            font: '20px Arial',
            fill: '#aaaaaa',
            align: 'center'
        });
        backBtn.setInteractive({ useHandCursor: true });
        backBtn.on('pointerdown', () => {
            this.scene.start('MenuScene');
        });
    }
}
