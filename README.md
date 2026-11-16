# Eclipse: Second Dawn for the Galaxy - Phaser Game

A turn-based strategy game built with Phaser.io, inspired by the board game "Eclipse: Second Dawn for the Galaxy". This is a 1 vs 1 offline game against a computer opponent.

## Features

### Implemented
- Basic Phaser game structure with scenes
- Boot scene with loading functionality
- Main menu with single-player and exit options
- Player race selection
- Player mat display with resource management
- Hex-based map system with grid generation
- Basic UI with turn counter and phase display
- Player resource panels with adjustment buttons
- Hex click interaction and ownership system
- Turn progression system
- Basic AI opponent framework

### Future Features (See RoadMap.md for details)
- Complete hex map with terrain types
- Technology system
- Unit system (Fighter, Cruiser, Dreadnought, Base)
- Combat system
- Full AI with advanced strategy
- Visual enhancements
- Save/Load functionality

## How to Run

1. Install dependencies:
   ```
   npm install
   ```

2. Start the development server:
   ```
   npx serve . -l 3000
   ```

3. Open your browser to http://localhost:3000

## Controls
- Mouse click to select hexes
- Button interactions for UI elements
- ESC key to exit game

## Project Structure
```
Eclipse/
├── index.html              # Main HTML file
├── package.json            # NPM configuration
├── RoadMap.md              # Feature roadmap and progress
├── README.md               # This file
├── source_data/            # Original game assets
│   ├── rulebook.pdf
│   ├── player_aid.pdf
│   ├── race.pdf
│   ├── sector1.pdf
│   ├── sector2.pdf
│   ├── sector3.pdf
│   ├── control.png
│   ├── species.pdf
│   ├── tech.pdf
│   └── 3D/                 # 3D model files
├── assets/                 # Game assets
└── src/                    # Game source code
    ├── main.js
    ├── config.js
    ├── scenes/             # Game scenes
    ├── entities/           # Game entities
    ├── hexmap/             # Hex map logic
    ├── system/             # Game systems
    └── ui/                 # UI components
```

## Development

### Adding New Features
1. Create new files in appropriate directories
2. Add scenes to the scene manager in main.js
3. Update the roadmap in RoadMap.md

### Contributing
This is a personal project. Feel free to fork and modify for your own use.

## License
MIT License

## Acknowledgments
- Phaser.io for the game framework
- The Eclipse board game developers for inspiration
