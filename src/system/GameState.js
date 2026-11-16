/**
 * Game state manager
 * Handles global game state and player information
 */

class GameState {
    constructor() {
        this.currentPlayer = 0;
        this.turn = 1;
        this.phase = 'research'; // research, movement, combat, resource, end
        this.players = [];
        this.hexMap = null;
        this.techTree = null;
        this.selectedHex = null;
    }

    /**
     * Initialize game with default values
     */
    init() {
        this.currentPlayer = 0;
        this.turn = 1;
        this.phase = 'research';
        this.players = [
            {
                name: 'Player 1',
                color: 0xffd700,
                resources: { energy: 5, material: 15, knowledge: 3, food: 15 },
                techs: [],
                units: [],
                race: 'Human'
            },
            {
                name: 'Player 2',
                color: 0xff4444,
                resources: { energy: 5, material: 15, knowledge: 3, food: 15 },
                techs: [],
                units: [],
                race: 'Klackon'
            }
        ];
    }

    /**
     * Switch to next player
     */
    nextPlayer() {
        this.currentPlayer = (this.currentPlayer + 1) % this.players.length;
    }

    /**
     * Switch to next phase
     */
    nextPhase() {
        const phases = ['research', 'movement', 'combat', 'resource', 'end'];
        const currentIndex = phases.indexOf(this.phase);
        this.phase = phases[(currentIndex + 1) % phases.length];
    }

    /**
     * Increment turn
     */
    nextTurn() {
        this.turn++;
    }

    /**
     * Get current player info
     */
    getCurrentPlayer() {
        return this.players[this.currentPlayer];
    }

    /**
     * Update player resources
     */
    updateResources(playerIndex, resourceChanges) {
        if (this.players[playerIndex]) {
            Object.keys(resourceChanges).forEach(resource => {
                this.players[playerIndex].resources[resource] += resourceChanges[resource];
            });
        }
    }

    /**
     * Add unit to player
     */
    addUnit(playerIndex, unit) {
        if (this.players[playerIndex]) {
            this.players[playerIndex].units.push(unit);
        }
    }

    /**
     * Select a hex
     */
    selectHex(hexData) {
        this.selectedHex = hexData;
    }

    /**
     * Deselect hex
     */
    deselectHex() {
        this.selectedHex = null;
    }
}

// Export singleton instance
const gameState = new GameState();
