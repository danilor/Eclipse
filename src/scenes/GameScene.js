class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
    }

    preload() {
        // Load game assets
        this.load.setBaseURL('http://localhost:3000');
    }

    create() {
        const { width, height } = this.cameras.main;
        
        // Game state
        this.gameState = {
            currentPlayer: 0,
            turn: 1,
            phase: 'research', // research, movement, combat, resource, end
            players: [
                { 
                    name: 'Human',
                    color: 0xffd700,
                    resources: { energy: 5, material: 15, knowledge: 3, food: 15 },
                    techs: [],
                    units: []
                },
                { 
                    name: 'AI_Opponent', 
                    color: 0xff4444,
                    resources: { energy: 5, material: 15, knowledge: 3, food: 15 },
                    techs: [],
                    units: []
                }
            ]
        };
        
        // Create hex map
        this.createHexMap(width, height);
        
        // Create UI
        this.createUI(width, height);
        
        // Create player info panels
        this.createPlayerPanels(width, height);
        
        // Create status indicator
        this.createStatusIndicator(width, height);
    }
    
    createHexMap(width, height) {
        // Hex grid parameters
        const hexSize = 40;
        const cols = 11;
        const rows = 9;
        const startX = width / 2 - (cols * hexSize * 0.866) / 2;
        const startY = height / 2 - (rows * hexSize * 1.5) / 2;
        
        this.hexMap = [];
        this.hexGroup = this.add.group();
        
        // Create hex grid
        for (let row = 0; row < rows; row++) {
            this.hexMap[row] = [];
            for (let col = 0; col < cols; col++) {
                // Calculate hex position
                const xOffset = (row % 2) * hexSize * 0.866;
                const x = startX + col * hexSize * 1.732 + xOffset;
                const y = startY + row * hexSize * 1.5;
                
                // Create hex
                const hex = this.add.polygon(x, y, this.createHexPoints(hexSize), {
                    fillFill: 0x000044,
                    fillAlpha: 0.8,
                    strokeStyle: { color: 0x444444, width: 2 }
                });
                
                // Store hex data
                const hexData = {
                    row: row,
                    col: col,
                    x: x,
                    y: y,
                    size: hexSize,
                    owner: null,
                    resource: 1,
                    type: 'neutral',
                    units: []
                };
                
                hex.setData('hexData', hexData);
                
                // Add click interaction
                hex.setInteractive({ useHandCursor: true });
                hex.on('pointerdown', () => {
                    this.handleHexClick(hexData);
                });
                
                this.hexGroup.add(hex);
                this.hexMap[row][col] = hexData;
            }
        }
        
        // Center camera on map
        this.cameras.main.centerOn(width / 2, height / 2);
    }
    
    createHexPoints(size) {
        const points = [];
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i;
            const x = size * Math.cos(angle);
            const y = size * Math.sin(angle);
            points.push({ x, y });
        }
        return points;
    }
    
    createUI(width, height) {
        // Top bar
        const topBar = this.add.rectangle(width / 2, 30, width, 60, 0x222222);
        topBar.setStrokeStyle(1, 0xffffff);
        
        // Turn counter
        const turnText = this.add.text(width * 0.1, 30, `Turn: ${this.gameState.turn}`, {
            font: 'bold 24px Arial',
            fill: '#ffffff'
        });
        turnText.setOrigin(0, 0.5);
        
        // Current phase
        const phaseText = this.add.text(width * 0.9, 30, `Phase: ${this.gameState.phase}`, {
            font: 'bold 24px Arial',
            fill: '#ffcc00'
        });
        phaseText.setOrigin(1, 0.5);
        
        // Next turn button
        const nextTurnBtn = this.add.text(width - 150, 30, 'Next Turn', {
            font: 'bold 20px Arial',
            fill: '#ffffff',
            backgroundColor: '#444444',
            padding: { left: 20, right: 20, top: 5, bottom: 5 },
            align: 'center'
        });
        nextTurnBtn.setInteractive({ useHandCursor: true });
        nextTurnBtn.on('pointerover', () => nextTurnBtn.setStyle({ fill: '#ffcc00' }));
        nextTurnBtn.on('pointerout', () => nextTurnBtn.setStyle({ fill: '#ffffff' }));
        nextTurnBtn.on('pointerdown', () => {
            this.nextTurn();
        });
        
        this.uiElements = { turnText, phaseText, nextTurnBtn };
    }
    
    createPlayerPanels(width, height) {
        // Player 1 panel
        const player1Panel = this.createPlayerPanel(
            50, 
            height / 2 - 200, 
            this.gameState.players[0], 
            'Human Player'
        );
        
        // Player 2 panel (AI)
        const player2Panel = this.createPlayerPanel(
            width - 350, 
            height / 2 - 200, 
            this.gameState.players[1], 
            'AI Opponent'
        );
        
        this.playerPanels = [player1Panel, player2Panel];
    }
    
    createPlayerPanel(x, y, player, label) {
        const panel = this.add.container(x, y);
        
        // Panel background
        const bg = this.add.rectangle(0, 0, 300, 250, 0x222222);
        bg.setStrokeStyle(2, player.color);
        
        // Label
        const labelText = this.add.text(0, -110, label, {
            font: 'bold 20px Arial',
            fill: '#ffffff',
            align: 'center'
        });
        labelText.setOrigin(0.5);
        
        // Resources
        const resourceY = -80;
        const resources = [
            { name: 'Energy', value: player.resources.energy, color: 0xffd700 },
            { name: 'Material', value: player.resources.material, color: 0xc0c0c0 },
            { name: 'Knowledge', value: player.resources.knowledge, color: 0x800080 },
            { name: 'Food', value: player.resources.food, color: 0x00ff00 }
        ];
        
        resources.forEach(resource => {
            const resourceText = this.add.text(-130, resourceY, `${resource.name}: ${resource.value}`, {
                font: '16px Arial',
                fill: `#${resource.color.toString(16)}`,
                align: 'left'
            });
            
            const resourceBox = this.add.rectangle(-130, resourceY, 10, 20, resource.color);
            
            // Add resource adjustment buttons
            const plusBtn = this.add.text(130, resourceY, '+', {
                font: 'bold 16px Arial',
                fill: '#00ff00'
            });
            plusBtn.setInteractive({ useHandCursor: true });
            plusBtn.on('pointerdown', () => {
                player.resources[resource.name.toLowerCase()]++;
                this.updatePlayerPanel(player);
            });
            
            const minusBtn = this.add.text(150, resourceY, '-', {
                font: 'bold 16px Arial',
                fill: '#ff0000'
            });
            minusBtn.setInteractive({ useHandCursor: true });
            minusBtn.on('pointerdown', () => {
                player.resources[resource.name.toLowerCase()]--;
                this.updatePlayerPanel(player);
            });
            
            resourceY += 40;
        });
        
        panel.add([bg, labelText, ...resources.map(() => this.add.container(0, 0))]);
        return panel;
    }
    
    updatePlayerPanel(player) {
        // Update resource display (simplified)
    }
    
    createStatusIndicator(width, height) {
        const statusContainer = this.add.container(width / 2, height - 50);
        
        const statusText = this.add.text(0, 0, 'Select a hex to interact', {
            font: '18px Arial',
            fill: '#ffffff'
        });
        statusText.setOrigin(0.5);
        
        statusContainer.add(statusText);
        
        this.statusText = statusText;
    }
    
    handleHexClick(hexData) {
        // Simple hex selection logic
        if (this.selectedHex) {
            this.selectedHex.setStrokeStyle(2, 0x444444);
        }
        
        hexData.owner = 0; // Set current player as owner
        hexData.type = 'owned';
        
        // Visual feedback
        hexData.hex = this.add.polygon(hexData.x, hexData.y, this.createHexPoints(hexData.size), {
            fillFill: 0x006600,
            fillAlpha: 0.8,
            strokeStyle: { color: 0x00ff00, width: 3 }
        });
        
        this.selectedHex = hexData.hex;
        this.statusText.setText(`Selected hex at (${hexData.col}, ${hexData.row})`);
    }
    
    nextTurn() {
        this.gameState.turn++;
        this.uiElements.turnText.setText(`Turn: ${this.gameState.turn}`);
        
        // Switch phase (simplified)
        const phases = ['research', 'movement', 'combat', 'resource', 'end'];
        const currentPhaseIndex = phases.indexOf(this.gameState.phase);
        this.gameState.phase = phases[(currentPhaseIndex + 1) % phases.length];
        this.uiElements.phaseText.setText(`Phase: ${this.gameState.phase}`);
        
        // AI turn (simplified)
        if (this.gameState.currentPlayer === 1) {
            this.runAI();
        }
    }
    
    runAI() {
        // Simple AI logic
        setTimeout(() => {
            // AI performs actions (simplified)
            this.gameState.currentPlayer = 0;
            this.statusText.setText('AI turn complete. Your turn!');
        }, 1000);
    }
    
    update() {
        // Game loop updates
    }
}
