class BootScene extends Phaser.Scene {
    constructor() {
        super('BootScene');
    }

    preload() {
        console.log('BootScene preload started');
        
        // Hide the HTML loading screen
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.style.display = 'none';
        }
        
        // Create loading bar graphics
        const progressBar = this.add.graphics();
        const progressBox = this.add.graphics();
        
        const { width, height } = this.cameras.main;
        
        progressBox.fillStyle(0x222222, 0.8);
        progressBox.fillRect(width / 2 - 200, height / 2 - 25, 400, 50);
        
        const loadingText = this.make.text({
            x: width / 2,
            y: height / 2 - 60,
            text: 'Loading...',
            style: {
                font: '20px Arial',
                fill: '#ffffff'
            }
        });
        loadingText.setOrigin(0.5);
        
        // Update progress bar
        this.load.on('progress', (value) => {
            progressBar.clear();
            progressBar.fillStyle(0xffffff, 1);
            progressBar.fillRect(width / 2 - 195, height / 2 - 20, 390 * value, 40);
        });
        
        // Complete callback
        this.load.on('complete', () => {
            console.log('BootScene preload complete');
            progressBar.destroy();
            progressBox.destroy();
            loadingText.destroy();
            this.scene.start('MenuScene');
        });
        
        // Load some placeholder assets to demonstrate loading
        console.log('Loading placeholder assets...');
        this.load.image('logo', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
        this.load.image('background', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
    }

    create() {
        console.log('BootScene create called');
        // Don't start MenuScene here, let preload complete handle it
    }
}
