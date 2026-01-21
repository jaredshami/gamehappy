// Flag Guardians - Complete Game Logic with Flag Placement and Movement

console.log('[GAME.JS] Loaded');

class Game {
    constructor() {
        console.log('[GAME.JS] Constructor called');
        
        // Connection
        this.socket = null;
        this.isConnected = false;
        
        // Player info
        this.playerToken = null;
        this.playerName = null;
        this.playerTeam = null; // 'red' or 'blue'
        this.isHost = false;
        this.gameCode = null;
        
        // Game state
        this.gameState = 'home'; // 'home', 'create', 'join', 'lobby', 'flag-placement', 'active', 'results'
        this.phase = 'waiting'; // Game phase: 'waiting', 'flag-placement', 'active', 'finished'
        
        // Players
        this.redTeam = [];
        this.blueTeam = [];
        this.playerPositions = new Map(); // playerToken -> { x, y, team, name }
        
        // Houses
        this.houses = {};
        
        // Flag placement
        this.redFlagPlaced = false;
        this.blueFlagPlaced = false;
        this.isFlagPlacer = false; // Is this player the flag placer for their team?
        this.redFlagData = null;
        this.blueFlagData = null;
        
        // Scores
        this.redScore = 0;
        this.blueScore = 0;
        
        // Game mechanics
        this.selectedHouse = null;
        this.selectedFloor = null;
        this.selectedCoord = null;
        this.playerX = null;
        this.playerY = null;
        this.lastMoveTime = 0;
        
        // Building interiors (4x4 grids)
        this.currentBuilding = null;
        this.buildingFloor = 'floor1';
        
        this.init();
    }

    init() {
        console.log('[GAME.JS] Initializing...');
        this.setupSocketIO();
        this.bindUIEvents();
        this.showScreen('home');
    }

    /**
     * Setup Socket.IO connection
     */
    setupSocketIO() {
        console.log('[GAME.JS] Setting up Socket.IO...');
        
        this.socket = io({
            auth: {
                token: this.playerToken || 'guest'
            },
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 10
        });

        // Connection events
        this.socket.on('connect', () => {
            console.log('[SOCKET] Connected:', this.socket.id);
            this.isConnected = true;
        });

        this.socket.on('disconnect', () => {
            console.log('[SOCKET] Disconnected');
            this.isConnected = false;
        });

        this.socket.on('error', (err) => {
            console.error('[SOCKET] Error:', err);
        });

        // Game events
        this.socket.on('game:created', (data) => {
            console.log('[SOCKET] Game created:', data);
            this.gameCode = data.gameCode;
            this.isHost = data.isHost;
            this.playerToken = data.playerToken;
            this.playerName = data.playerName;
            this.showScreen('lobby');
        });

        this.socket.on('game:joined', (data) => {
            console.log('[SOCKET] Game joined:', data);
            this.gameCode = data.gameCode;
            this.isHost = data.isHost;
            this.playerToken = data.playerToken;
            this.playerName = data.playerName;
            this.showScreen('lobby');
        });

        this.socket.on('lobby:updated', (data) => {
            console.log('[SOCKET] Lobby updated:', data);
            this.redTeam = data.redTeam || [];
            this.blueTeam = data.blueTeam || [];
            this.updateLobbyUI();
        });

        this.socket.on('game:started', (data) => {
            console.log('[SOCKET] Game started:', data);
            this.phase = data.phase || 'flag-placement';
            this.redTeam = data.redTeam || [];
            this.blueTeam = data.blueTeam || [];
            this.houses = data.houses || {};
            
            // Check if this player is the flag placer for their team
            if (data.redPlacingPlayer === this.playerToken || data.bluePlacingPlayer === this.playerToken) {
                this.isFlagPlacer = true;
            }
            
            if (this.phase === 'flag-placement') {
                this.showScreen('flag-placement');
                this.renderHousesForPlacement();
            }
        });

        this.socket.on('flagguardians:game-started', (data) => {
            console.log('[SOCKET] FlagGuardians active game started:', data);
            this.phase = data.phase || 'active';
            this.showScreen('game');
            
            if (data.gameState) {
                this.redScore = data.gameState.redScore || 0;
                this.blueScore = data.gameState.blueScore || 0;
                this.redTeam = data.gameState.redTeam || [];
                this.blueTeam = data.gameState.blueTeam || [];
            }
            
            this.renderGameMap();
        });

        this.socket.on('flagguardians:flag-placed', (data) => {
            console.log('[SOCKET] Flag placed:', data);
            if (data.team === 'red') {
                this.redFlagPlaced = true;
                this.redFlagData = data;
            } else {
                this.blueFlagPlaced = true;
                this.blueFlagData = data;
            }
            
            const msg = `${data.team.toUpperCase()} team placed their flag in ${data.house}`;
            this.addGameLog(msg);
        });

        this.socket.on('game-state-updated', (data) => {
            console.log('[SOCKET] Game state updated:', data);
            if (data.gameState) {
                this.playerPositions = new Map();
                if (data.gameState.playerPositions) {
                    for (const pos of data.gameState.playerPositions) {
                        this.playerPositions.set(pos.playerToken, {
                            x: pos.x,
                            y: pos.y,
                            team: pos.team,
                            name: pos.playerName
                        });
                    }
                }
                this.renderGameMap();
            }
        });
    }

    /**
     * Bind UI events
     */
    bindUIEvents() {
        console.log('[GAME.JS] Binding UI events...');
        
        // Home screen
        document.getElementById('btn-create')?.addEventListener('click', () => this.showScreen('create'));
        document.getElementById('btn-join')?.addEventListener('click', () => this.showScreen('join'));
        
        // Create screen
        document.getElementById('create-name-input')?.addEventListener('input', (e) => {
            this.playerName = e.target.value;
        });
        document.getElementById('btn-create-game')?.addEventListener('click', () => this.createGame());
        
        // Join screen
        document.getElementById('join-name-input')?.addEventListener('input', (e) => {
            this.playerName = e.target.value;
        });
        document.getElementById('join-code-input')?.addEventListener('input', (e) => {
            this.gameCode = e.target.value.toUpperCase();
        });
        document.getElementById('btn-join-game')?.addEventListener('click', () => this.joinGame());
        
        // Lobby screen
        document.getElementById('btn-select-red')?.addEventListener('click', () => this.selectTeam('red'));
        document.getElementById('btn-select-blue')?.addEventListener('click', () => this.selectTeam('blue'));
        document.getElementById('btn-start-game')?.addEventListener('click', () => this.startGame());
        document.getElementById('btn-leave')?.addEventListener('click', () => this.leaveGame());
        
        // Flag placement
        document.getElementById('btn-confirm-flag')?.addEventListener('click', () => this.confirmFlagPlacement());
        
        // Building navigation
        document.getElementById('btn-exit-building')?.addEventListener('click', () => this.exitBuilding());
        document.getElementById('btn-next-floor')?.addEventListener('click', () => this.nextFloor());
        document.getElementById('btn-prev-floor')?.addEventListener('click', () => this.prevFloor());
    }

    /**
     * Create new game
     */
    createGame() {
        if (!this.playerName) {
            alert('Please enter your name');
            return;
        }
        
        this.socket.emit('create-game', {
            gameType: 'flagguardians',
            playerName: this.playerName
        }, (response) => {
            console.log('[CREATE-GAME] Response:', response);
            if (response.success) {
                this.gameCode = response.gameCode;
                this.playerToken = response.playerToken;
                this.isHost = response.isHost;
                this.redTeam = response.game.redTeam || [];
                this.blueTeam = response.game.blueTeam || [];
                this.showScreen('lobby');
            } else {
                alert(response.message);
            }
        });
    }

    /**
     * Join existing game
     */
    joinGame() {
        if (!this.playerName) {
            alert('Please enter your name');
            return;
        }
        if (!this.gameCode) {
            alert('Please enter game code');
            return;
        }
        
        this.socket.emit('join-game', {
            gameCode: this.gameCode,
            playerName: this.playerName
        }, (response) => {
            console.log('[JOIN-GAME] Response:', response);
            if (response.success) {
                this.playerToken = response.playerToken;
                this.isHost = response.isHost;
                this.redTeam = response.game.redTeam || [];
                this.blueTeam = response.game.blueTeam || [];
                this.showScreen('lobby');
            } else {
                alert(response.message);
            }
        });
    }

    /**
     * Select team in lobby
     */
    selectTeam(team) {
        this.playerTeam = team;
        this.socket.emit('lobby:select-team', {
            gameCode: this.gameCode,
            team: team
        }, (response) => {
            console.log('[SELECT-TEAM] Response:', response);
            if (response.success) {
                this.updateLobbyUI();
            }
        });
    }

    /**
     * Start game (host only)
     */
    startGame() {
        if (!this.isHost) {
            alert('Only host can start game');
            return;
        }
        
        this.socket.emit('game:start', {
            gameCode: this.gameCode
        }, (response) => {
            console.log('[START-GAME] Response:', response);
            if (!response.success) {
                alert(response.message);
            }
        });
    }

    /**
     * Leave game
     */
    leaveGame() {
        this.socket.emit('leave-game', () => {
            this.gameCode = null;
            this.playerTeam = null;
            this.redTeam = [];
            this.blueTeam = [];
            this.showScreen('home');
        });
    }

    /**
     * Select house for flag placement
     */
    selectHouseForFlagPlacement(houseId) {
        if (!this.isFlagPlacer) return;
        
        this.selectedHouse = houseId;
        const house = this.houses[houseId];
        
        // Show house interior (floor 1 by default)
        this.showHouseInterior(houseId, 'floor1');
    }

    /**
     * Show house interior for flag placement
     */
    showHouseInterior(houseId, floor) {
        const house = this.houses[houseId];
        this.selectedFloor = floor;
        
        const container = document.getElementById('house-interior');
        if (!container) return;
        
        // Show 4x4 grid for selecting flag location
        container.innerHTML = `
            <div class="interior-header">
                <h3>${house.name} - ${floor === 'floor1' ? 'Ground Floor' : '2nd Floor'}</h3>
                ${house.floors === 2 ? `
                    <button class="btn-small" onclick="game.showHouseInterior('${houseId}', '${floor === 'floor1' ? 'floor2' : 'floor1'}')">
                        Go to ${floor === 'floor1' ? '2nd Floor' : 'Ground Floor'}
                    </button>
                ` : ''}
            </div>
            <div class="interior-grid">
        `;
        
        for (let y = 0; y < 4; y++) {
            container.innerHTML += '<div class="interior-row">';
            for (let x = 0; x < 4; x++) {
                container.innerHTML += `
                    <div class="interior-cell" onclick="game.selectFlagCoord(${x}, ${y})">
                        (${x}, ${y})
                    </div>
                `;
            }
            container.innerHTML += '</div>';
        }
        
        container.innerHTML += '</div>';
    }

    /**
     * Select coordinate for flag placement
     */
    selectFlagCoord(x, y) {
        this.selectedCoord = { x, y };
        document.getElementById('confirm-flag-text').textContent = 
            `Place flag in ${this.houses[this.selectedHouse].name} at (${x}, ${y})?`;
    }

    /**
     * Confirm flag placement
     */
    confirmFlagPlacement() {
        if (!this.selectedHouse || !this.selectedFloor || !this.selectedCoord) {
            alert('Please select location');
            return;
        }
        
        this.socket.emit('flagguardians:place-flag', {
            gameCode: this.gameCode,
            house: this.selectedHouse,
            floor: this.selectedFloor,
            coord: this.selectedCoord
        }, (response) => {
            console.log('[PLACE-FLAG] Response:', response);
            if (response.success) {
                const team = this.playerTeam;
                this.addGameLog(`You placed the flag in ${this.selectedHouse}`);
                this.selectedHouse = null;
                this.selectedFloor = null;
                this.selectedCoord = null;
            } else {
                alert(response.message);
            }
        });
    }

    /**
     * Render game map with players
     */
    renderGameMap() {
        const container = document.getElementById('game-map');
        if (!container) return;
        
        container.innerHTML = '<div class="map-grid">';
        
        // Alleyway (6 cells)
        container.innerHTML += '<div class="map-section alleyway-section">ALLEYWAY</div>';
        for (let x = 0; x < 6; x++) {
            const players = Array.from(this.playerPositions.values())
                .filter(p => p.x === x && p.y === 1);
            
            let html = `<div class="map-cell alley" data-x="${x}" data-y="1">`;
            if (players.length > 0) {
                html += `<div class="player-marker ${players[0].team}">${players[0].name[0]}</div>`;
            }
            html += `<span class="cell-label">A${x}</span></div>`;
            container.innerHTML += html;
        }
        
        // North side
        container.innerHTML += '<div class="map-section north-section">NORTH</div>';
        for (let x = 0; x < 6; x++) {
            const players = Array.from(this.playerPositions.values())
                .filter(p => p.x === x && p.y === 0);
            
            let html = `<div class="map-cell north" data-x="${x}" data-y="0" onclick="game.handleMapClick(${x}, 0)">`;
            if (players.length > 0) {
                html += `<div class="player-marker ${players[0].team}">${players[0].name[0]}</div>`;
            }
            html += `<span class="cell-label">N${x}</span></div>`;
            container.innerHTML += html;
        }
        
        // South side
        container.innerHTML += '<div class="map-section south-section">SOUTH</div>';
        for (let x = 0; x < 6; x++) {
            const players = Array.from(this.playerPositions.values())
                .filter(p => p.x === x && p.y === 2);
            
            let html = `<div class="map-cell south" data-x="${x}" data-y="2" onclick="game.handleMapClick(${x}, 2)">`;
            if (players.length > 0) {
                html += `<div class="player-marker ${players[0].team}">${players[0].name[0]}</div>`;
            }
            html += `<span class="cell-label">S${x}</span></div>`;
            container.innerHTML += html;
        }
        
        container.innerHTML += '</div>';
    }

    /**
     * Handle map cell click for movement
     */
    handleMapClick(x, y) {
        // Check if adjacent
        if (this.playerX !== null && this.playerY !== null) {
            const dx = Math.abs(x - this.playerX);
            const dy = Math.abs(y - this.playerY);
            
            if (dx <= 1 && dy <= 1 && (dx !== 0 || dy !== 0)) {
                this.socket.emit('flagguardians:move', {
                    gameCode: this.gameCode,
                    x: x,
                    y: y
                }, (response) => {
                    console.log('[MOVE] Response:', response);
                });
            }
        }
    }

    /**
     * Enter building
     */
    enterBuilding(houseId) {
        this.currentBuilding = houseId;
        this.buildingFloor = 'floor1';
        this.showScreen('building');
        this.renderBuilding();
    }

    /**
     * Exit building
     */
    exitBuilding() {
        this.currentBuilding = null;
        this.showScreen('game');
        this.renderGameMap();
    }

    /**
     * Go to next floor in building
     */
    nextFloor() {
        const house = this.houses[this.currentBuilding];
        if (house && house.floors === 2 && this.buildingFloor === 'floor1') {
            this.buildingFloor = 'floor2';
            this.renderBuilding();
        }
    }

    /**
     * Go to previous floor in building
     */
    prevFloor() {
        if (this.buildingFloor === 'floor2') {
            this.buildingFloor = 'floor1';
            this.renderBuilding();
        }
    }

    /**
     * Render building interior
     */
    renderBuilding() {
        const container = document.getElementById('building-interior');
        if (!container) return;
        
        const house = this.houses[this.currentBuilding];
        container.innerHTML = `
            <div class="building-header">
                <h3>${house.name} - ${this.buildingFloor === 'floor1' ? 'Ground Floor' : '2nd Floor'}</h3>
            </div>
            <div class="building-grid">
        `;
        
        for (let y = 0; y < 4; y++) {
            container.innerHTML += '<div class="building-row">';
            for (let x = 0; x < 4; x++) {
                const players = Array.from(this.playerPositions.values())
                    .filter(p => p.x === x && p.y === y);
                
                let html = '<div class="building-cell">';
                if (players.length > 0) {
                    html += `<div class="player-marker ${players[0].team}">${players[0].name[0]}</div>`;
                }
                html += '</div>';
                container.innerHTML += html;
            }
            container.innerHTML += '</div>';
        }
        
        container.innerHTML += '</div>';
    }

    /**
     * Render houses for flag placement
     */
    renderHousesForPlacement() {
        const container = document.getElementById('houses-grid');
        if (!container) return;
        
        container.innerHTML = '';
        for (const [houseId, house] of Object.entries(this.houses)) {
            const btn = document.createElement('button');
            btn.className = 'house-button';
            btn.innerHTML = `${house.name}<br><small>${house.floors} floor${house.floors > 1 ? 's' : ''}</small>`;
            btn.onclick = () => this.selectHouseForFlagPlacement(houseId);
            container.appendChild(btn);
        }
    }

    /**
     * Update lobby UI
     */
    updateLobbyUI() {
        const redContainer = document.getElementById('red-team');
        const blueContainer = document.getElementById('blue-team');
        const startBtn = document.getElementById('btn-start-game');
        const codeDisplay = document.getElementById('lobby-code');
        
        if (codeDisplay) {
            codeDisplay.textContent = this.gameCode || '----';
        }
        
        if (redContainer) {
            redContainer.innerHTML = this.redTeam.length === 0 ? 
                '<p class="empty">Waiting for players...</p>' :
                this.redTeam.map(p => `<div class="team-player">${p.name}</div>`).join('');
        }
        if (blueContainer) {
            blueContainer.innerHTML = this.blueTeam.length === 0 ?
                '<p class="empty">Waiting for players...</p>' :
                this.blueTeam.map(p => `<div class="team-player">${p.name}</div>`).join('');
        }
        
        // Enable start button if host and both teams have players
        if (startBtn) {
            startBtn.disabled = !this.isHost || this.redTeam.length === 0 || this.blueTeam.length === 0;
        }
    }

    /**
     * Add message to game log
     */
    addGameLog(message) {
        const log = document.getElementById('game-log');
        if (!log) return;
        
        const timestamp = new Date().toLocaleTimeString();
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.textContent = `[${timestamp}] ${message}`;
        log.appendChild(entry);
        log.scrollTop = log.scrollHeight;
    }

    /**
     * Show screen
     */
    showScreen(screenName) {
        console.log('[SHOW-SCREEN]', screenName);
        
        const screens = document.querySelectorAll('.screen');
        screens.forEach(screen => screen.style.display = 'none');
        
        const screen = document.getElementById(`screen-${screenName}`);
        if (screen) {
            screen.style.display = 'block';
        }
        
        this.gameState = screenName;
    }
}

// Initialize game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('[MAIN] DOM ready, creating game instance');
    window.game = new Game();
});
