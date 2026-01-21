// Flag Guardians - Client Game Logic

console.log('Game.js loaded');

class Game {
    constructor() {
        console.log('Game constructor called');
        this.socket = null;
        this.isHost = false;
        this.gameCode = null;
        this.playerName = null;
        this.playerToken = null;
        this.playerTeam = null; // 'red', 'blue', or null
        this.players = [];
        this.gameState = 'home';
        this.isConnected = false;
        
        // Game data
        this.redTeamPlayers = [];
        this.blueTeamPlayers = [];
        this.redScore = 0;
        this.blueScore = 0;
        this.currentRound = 1;
        this.gameStarted = false;
        
        // Map and game mechanics - Initialize nodeControl BEFORE initializeMapGraph
        this.nodeControl = new Map(); // nodeId -> 'red', 'blue', or 'neutral'
        this.gameLog = [];
        
        console.log('About to initialize map graph...');
        this.mapGraph = this.initializeMapGraph();
        console.log('Map graph initialized:', this.mapGraph);
        
        console.log('About to call init()...');
        this.init();
        console.log('init() completed');
    }

    // ===== MAP INITIALIZATION =====
    initializeMapGraph() {
        /**
         * Map Layout (top-down view):
         * 
         * NORTH SIDE (Red Team starts here)
         * [N0] [N1] [N2] [N3] [N4] [N5]
         * 
         *       ════ ALLEYWAY ════
         * 
         * SOUTH SIDE (Blue Team starts here)
         * [S0] [S1] [S2] [S3] [S4] [S5]
         */
        
        // Initialize nodeControl map first
        if (!this.nodeControl) {
            this.nodeControl = new Map();
        }
        
        const graph = {
            nodes: [
                // North side (6 houses)
                { id: 'N0', x: 0, y: 0, side: 'north', label: 'N0' },
                { id: 'N1', x: 1, y: 0, side: 'north', label: 'N1' },
                { id: 'N2', x: 2, y: 0, side: 'north', label: 'N2' },
                { id: 'N3', x: 3, y: 0, side: 'north', label: 'N3' },
                { id: 'N4', x: 4, y: 0, side: 'north', label: 'N4' },
                { id: 'N5', x: 5, y: 0, side: 'north', label: 'N5' },
                
                // South side (6 houses)
                { id: 'S0', x: 0, y: 2, side: 'south', label: 'S0' },
                { id: 'S1', x: 1, y: 2, side: 'south', label: 'S1' },
                { id: 'S2', x: 2, y: 2, side: 'south', label: 'S2' },
                { id: 'S3', x: 3, y: 2, side: 'south', label: 'S3' },
                { id: 'S4', x: 4, y: 2, side: 'south', label: 'S4' },
                { id: 'S5', x: 5, y: 2, side: 'south', label: 'S5' },
                
                // Alleyway nodes for connections
                { id: 'A0', x: 0, y: 1, side: 'alley', label: 'A0' },
                { id: 'A1', x: 1, y: 1, side: 'alley', label: 'A1' },
                { id: 'A2', x: 2, y: 1, side: 'alley', label: 'A2' },
                { id: 'A3', x: 3, y: 1, side: 'alley', label: 'A3' },
                { id: 'A4', x: 4, y: 1, side: 'alley', label: 'A4' },
                { id: 'A5', x: 5, y: 1, side: 'alley', label: 'A5' }
            ],
            edges: [
                // North side connections (linear)
                { from: 'N0', to: 'N1' },
                { from: 'N1', to: 'N2' },
                { from: 'N2', to: 'N3' },
                { from: 'N3', to: 'N4' },
                { from: 'N4', to: 'N5' },
                
                // South side connections (linear)
                { from: 'S0', to: 'S1' },
                { from: 'S1', to: 'S2' },
                { from: 'S2', to: 'S3' },
                { from: 'S3', to: 'S4' },
                { from: 'S4', to: 'S5' },
                
                // Alleyway connections (linear)
                { from: 'A0', to: 'A1' },
                { from: 'A1', to: 'A2' },
                { from: 'A2', to: 'A3' },
                { from: 'A3', to: 'A4' },
                { from: 'A4', to: 'A5' },
                
                // Cross connections (north to alley)
                { from: 'N0', to: 'A0' },
                { from: 'N1', to: 'A1' },
                { from: 'N2', to: 'A2' },
                { from: 'N3', to: 'A3' },
                { from: 'N4', to: 'A4' },
                { from: 'N5', to: 'A5' },
                
                // Cross connections (alley to south)
                { from: 'A0', to: 'S0' },
                { from: 'A1', to: 'S1' },
                { from: 'A2', to: 'S2' },
                { from: 'A3', to: 'S3' },
                { from: 'A4', to: 'S4' },
                { from: 'A5', to: 'S5' }
            ]
        };
        
        // Initialize all nodes as neutral
        graph.nodes.forEach(node => {
            this.nodeControl.set(node.id, 'neutral');
        });
        
        // Red team starts with north side
        for (let i = 0; i < 6; i++) {
            this.nodeControl.set(`N${i}`, 'red');
        }
        
        // Blue team starts with south side
        for (let i = 0; i < 6; i++) {
            this.nodeControl.set(`S${i}`, 'blue');
        }
        
        return graph;
    }

    getNodeOwner(nodeId) {
        return this.nodeControl.get(nodeId) || 'neutral';
    }

    getRedControlledNodes() {
        const controlled = [];
        this.nodeControl.forEach((owner, nodeId) => {
            if (owner === 'red') controlled.push(nodeId);
        });
        return controlled;
    }

    getBlueControlledNodes() {
        const controlled = [];
        this.nodeControl.forEach((owner, nodeId) => {
            if (owner === 'blue') controlled.push(nodeId);
        });
        return controlled;
    }

    getNeutralNodes() {
        const neutral = [];
        this.nodeControl.forEach((owner, nodeId) => {
            if (owner === 'neutral') neutral.push(nodeId);
        });
        return neutral;
    }

    init() {
        console.log('Game.init() called');
        this.loadSession();
        this.bindEvents();
        this.connect();
    }

    // ===== SESSION MANAGEMENT =====
    loadSession() {
        const session = sessionStorage.getItem('flagguardians_session');
        if (session) {
            const data = JSON.parse(session);
            this.playerName = data.playerName;
            this.playerToken = data.playerToken;
            console.log(`[SESSION LOADED] ${this.playerName} (${this.playerToken})`);
        }
    }

    saveSession() {
        const data = {
            playerName: this.playerName,
            playerToken: this.playerToken
        };
        sessionStorage.setItem('flagguardians_session', JSON.stringify(data));
    }

    clearSession() {
        sessionStorage.removeItem('flagguardians_session');
    }

    // ===== SOCKET CONNECTION =====
    connect() {
        console.log('Attempting to connect to socket server...');
        
        // Determine the correct server URL
        let socketUrl;
        if (window.location.protocol === 'https:') {
            socketUrl = window.location.origin;
        } else {
            socketUrl = `http://${window.location.hostname}:8443`;
        }
        
        console.log('Connecting to:', socketUrl);
        
        this.socket = io(socketUrl, {
            path: '/websocket',
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 5
        });

        this.socket.on('connect', () => {
            console.log('✓ Connected to server');
            this.isConnected = true;
            this.showMessage('Connected to server', 'success');
        });

        this.socket.on('disconnect', () => {
            console.log('✗ Disconnected from server');
            this.isConnected = false;
            this.showMessage('Disconnected from server', 'error');
        });

        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            this.isConnected = false;
            this.showMessage(`Connection error: ${error.message}`, 'error');
        });

        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
            this.showMessage(`Socket error: ${error}`, 'error');
        });

        // Game events
        this.socket.on('game:created', (data) => this.onGameCreated(data));
        this.socket.on('game:joined', (data) => this.onGameJoined(data));
        this.socket.on('lobby:updated', (data) => this.onLobbyUpdated(data));
        this.socket.on('lobby:player-joined', (data) => this.onPlayerJoined(data));
        this.socket.on('lobby:player-left', (data) => this.onPlayerLeft(data));
        this.socket.on('game:started', (data) => this.onGameStarted(data));
        this.socket.on('game:error', (data) => this.onGameError(data));
    }

    // ===== EVENT HANDLERS =====
    bindEvents() {
        console.log('[BIND EVENTS] Starting to bind event listeners');
        
        // Only bind once
        if (this.eventsAlreadyBound) {
            console.log('[BIND EVENTS] Events already bound, skipping');
            return;
        }
        this.eventsAlreadyBound = true;
        // Home screen
        const btnCreateGame = document.getElementById('btn-create-game');
        if (btnCreateGame) {
            console.log('[BIND EVENTS] Found btn-create-game, binding click listener');
            btnCreateGame.addEventListener('click', () => {
                console.log('[BIND EVENTS] btn-create-game clicked');
                this.showScreen('create-game-screen');
            });
        } else {
            console.error('[BIND EVENTS] btn-create-game NOT FOUND');
        }
        
        const btnJoinGame = document.getElementById('btn-join-game');
        if (btnJoinGame) {
            console.log('[BIND EVENTS] Found btn-join-game, binding click listener');
            btnJoinGame.addEventListener('click', () => this.showScreen('join-game-screen'));
        } else {
            console.error('[BIND EVENTS] btn-join-game NOT FOUND');
        }
        
        const btnHowToPlay = document.getElementById('btn-how-to-play');
        if (btnHowToPlay) {
            console.log('[BIND EVENTS] Found btn-how-to-play, binding click listener');
            btnHowToPlay.addEventListener('click', () => this.showScreen('how-to-play-screen'));
        } else {
            console.error('[BIND EVENTS] btn-how-to-play NOT FOUND');
        }

        // Navigation
        document.getElementById('btn-back-create')?.addEventListener('click', () => this.showScreen('home-screen'));
        document.getElementById('btn-back-join')?.addEventListener('click', () => this.showScreen('home-screen'));
        document.getElementById('btn-back-how-to-play')?.addEventListener('click', () => this.showScreen('home-screen'));

        // Create/Join Game
        document.getElementById('btn-start-create-game').addEventListener('click', () => this.createGame());
        document.getElementById('btn-start-join-game').addEventListener('click', () => this.joinGame());

        // Lobby
        document.getElementById('btn-join-red').addEventListener('click', () => this.selectTeam('red'));
        document.getElementById('btn-join-blue').addEventListener('click', () => this.selectTeam('blue'));
        document.getElementById('btn-start-game').addEventListener('click', () => this.startGame());
        document.getElementById('btn-leave-game').addEventListener('click', () => this.leaveGame());

        // Game
        document.getElementById('btn-leave-mid-game').addEventListener('click', () => this.leaveGame());

        // Results
        document.getElementById('btn-play-again').addEventListener('click', () => this.playAgain());
        document.getElementById('btn-back-home').addEventListener('click', () => this.backToHome());

        // Input events
        document.getElementById('input-player-name').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.createGame();
        });
        document.getElementById('input-join-player-name').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinGame();
        });
        document.getElementById('input-game-code').addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase();
        });
    }

    // ===== SCREEN MANAGEMENT =====
    showScreen(screenId) {
        console.log(`[SHOW SCREEN] Switching to: ${screenId}`);
        
        // Hide all screens
        const allScreens = document.querySelectorAll('.screen');
        console.log(`[SHOW SCREEN] Found ${allScreens.length} screens total`);
        
        console.log('[SHOW SCREEN] Starting to hide all screens...');
        for (let i = 0; i < allScreens.length; i++) {
            const screen = allScreens[i];
            console.log(`[SHOW SCREEN] Hiding screen ${i}: ${screen.id}`);
            screen.classList.remove('active');
        }
        console.log('[SHOW SCREEN] Finished hiding all screens');

        // Show selected screen
        const screen = document.getElementById(screenId);
        if (screen) {
            console.log(`[SHOW SCREEN] Found target screen, adding active class`);
            screen.classList.add('active');
            console.log(`[SHOW SCREEN] Successfully added active class to ${screenId}`);
            this.gameState = screenId;
        } else {
            console.error(`[SHOW SCREEN] Screen not found: ${screenId}`);
        }
    }

    showMessage(text, type = 'info', screenId = null) {
        let messageElement = null;
        
        if (screenId) {
            messageElement = document.querySelector(`#${screenId} .message`);
        } else {
            // Find the message element in the current active screen
            const activeScreen = document.querySelector('.screen.active');
            messageElement = activeScreen ? activeScreen.querySelector('.message') : null;
        }

        if (messageElement) {
            messageElement.textContent = text;
            messageElement.className = `message ${type} show`;
            
            // Auto-hide after 4 seconds
            setTimeout(() => {
                messageElement.classList.remove('show');
            }, 4000);
        }
    }

    // ===== GAME CREATION & JOINING =====
    createGame() {
        console.log('[CREATE GAME] Button clicked');
        const playerName = document.getElementById('input-player-name').value.trim();
        console.log('[CREATE GAME] Player name:', playerName);

        if (!playerName) {
            console.log('[CREATE GAME] No player name entered');
            this.showMessage('Please enter your name', 'error', 'create-game-screen');
            return;
        }

        if (!this.isConnected) {
            console.log('[CREATE GAME] Not connected to server');
            this.showMessage('Not connected to server', 'error', 'create-game-screen');
            return;
        }

        console.log('[CREATE GAME] Emitting game:create event...');
        this.playerName = playerName;
        this.socket.emit('game:create', { playerName }, (response) => {
            console.log('[CREATE GAME] Received callback response:', response);
            if (response.success) {
                this.playerToken = response.playerToken;
                this.gameCode = response.gameCode;
                this.isHost = true;
                this.saveSession();
                this.showScreen('lobby-screen');
                this.updateLobbyScreen();
            } else {
                this.showMessage(response.message || 'Failed to create game', 'error', 'create-game-screen');
            }
        });
    }

    joinGame() {
        const gameCode = document.getElementById('input-game-code').value.trim().toUpperCase();
        const playerName = document.getElementById('input-join-player-name').value.trim();

        if (!gameCode || gameCode.length !== 4) {
            this.showMessage('Please enter a valid 4-character game code', 'error', 'join-game-screen');
            return;
        }

        if (!playerName) {
            this.showMessage('Please enter your name', 'error', 'join-game-screen');
            return;
        }

        if (!this.isConnected) {
            this.showMessage('Not connected to server', 'error', 'join-game-screen');
            return;
        }

        this.playerName = playerName;
        this.gameCode = gameCode;
        this.socket.emit('game:join', { gameCode, playerName }, (response) => {
            if (response.success) {
                this.playerToken = response.playerToken;
                this.isHost = false;
                this.saveSession();
                this.showScreen('lobby-screen');
                this.updateLobbyScreen();
            } else {
                this.showMessage(response.message || 'Failed to join game', 'error', 'join-game-screen');
            }
        });
    }

    selectTeam(team) {
        if (!this.gameCode || !this.playerToken) {
            this.showMessage('Game session lost', 'error');
            return;
        }

        this.socket.emit('lobby:select-team', 
            { gameCode: this.gameCode, playerToken: this.playerToken, team },
            (response) => {
                if (response.success) {
                    this.playerTeam = team;
                    console.log(`[SELECT TEAM] Team selected: ${team}, isHost: ${this.isHost}, playerTeam: ${this.playerTeam}`);
                    this.updateLobbyTeams();
                    this.updatePlayerCount();
                } else {
                    this.showMessage(response.message || 'Failed to select team', 'error');
                }
            }
        );
    }

    startGame() {
        if (!this.isHost) {
            this.showMessage('Only the host can start the game', 'error');
            return;
        }

        this.socket.emit('game:start',
            { gameCode: this.gameCode, playerToken: this.playerToken },
            (response) => {
                if (response.success) {
                    console.log('Game start acknowledged by server');
                } else {
                    this.showMessage(response.message || 'Failed to start game', 'error');
                }
            }
        );
    }

    leaveGame() {
        this.socket.emit('game:leave',
            { gameCode: this.gameCode, playerToken: this.playerToken },
            (response) => {
                this.clearSession();
                this.gameCode = null;
                this.playerToken = null;
                this.playerTeam = null;
                this.showScreen('home-screen');
            }
        );
    }

    // ===== SOCKET EVENT HANDLERS =====
    onGameCreated(data) {
        console.log('Game created:', data);
        this.gameCode = data.gameCode;
        this.redScore = 0;
        this.blueScore = 0;
        this.currentRound = 1;
    }

    onGameJoined(data) {
        console.log('Joined game:', data);
        this.gameCode = data.gameCode;
        this.redScore = 0;
        this.blueScore = 0;
        this.currentRound = 1;
    }

    onLobbyUpdated(data) {
        console.log('Lobby updated:', data);
        this.players = data.players;
        this.redTeamPlayers = data.redTeam || [];
        this.blueTeamPlayers = data.blueTeam || [];
        this.updateLobbyScreen();
    }

    onPlayerJoined(data) {
        console.log('Player joined:', data.playerName);
        this.players = data.players;
        this.redTeamPlayers = data.redTeam || [];
        this.blueTeamPlayers = data.blueTeam || [];
        this.updateLobbyTeams();
        this.updatePlayerCount();
    }

    onPlayerLeft(data) {
        console.log('Player left:', data.playerName);
        if (data.isHost) {
            this.isHost = true;
        }
        this.players = data.players;
        this.redTeamPlayers = data.redTeam || [];
        this.blueTeamPlayers = data.blueTeam || [];
        this.updateLobbyTeams();
        this.updatePlayerCount();
    }

    onGameStarted(data) {
        console.log('Game started:', data);
        this.gameStarted = true;
        this.redTeamPlayers = data.redTeam || [];
        this.blueTeamPlayers = data.blueTeam || [];
        this.currentRound = data.currentRound || 1;
        this.redScore = data.scores?.red || 0;
        this.blueScore = data.scores?.blue || 0;
        
        this.showScreen('game-screen');
        
        // Render the game map
        this.renderGameMap();
        
        // Update game screen content
        this.updateGameScreen();
    }

    onGameError(data) {
        console.error('Game error:', data);
        this.showMessage(data.message || 'Game error occurred', 'error');
    }

    // ===== UI UPDATE FUNCTIONS =====
    updateLobbyScreen() {
        // Update game code display
        document.getElementById('lobby-game-code').textContent = this.gameCode;

        // Update player info
        document.getElementById('lobby-player-name').textContent = this.playerName;

        // Show/hide host badge
        const hostBadge = document.getElementById('host-badge');
        if (this.isHost) {
            hostBadge.style.display = 'block';
        } else {
            hostBadge.style.display = 'none';
        }

        this.updateLobbyTeams();
        this.updatePlayerCount();
    }

    updateLobbyTeams() {
        // Red team
        const redList = document.getElementById('red-team-list');
        if (this.redTeamPlayers.length === 0) {
            redList.innerHTML = '<p class="empty">Waiting for players...</p>';
        } else {
            redList.innerHTML = this.redTeamPlayers
                .map(p => `<div class="team-player red">${p.name}</div>`)
                .join('');
        }

        // Blue team
        const blueList = document.getElementById('blue-team-list');
        if (this.blueTeamPlayers.length === 0) {
            blueList.innerHTML = '<p class="empty">Waiting for players...</p>';
        } else {
            blueList.innerHTML = this.blueTeamPlayers
                .map(p => `<div class="team-player blue">${p.name}</div>`)
                .join('');
        }

        // Update button states
        const joinRedBtn = document.getElementById('btn-join-red');
        const joinBlueBtn = document.getElementById('btn-join-blue');

        if (this.playerTeam === 'red') {
            joinRedBtn.textContent = '✓ Joined Red Team';
            joinRedBtn.disabled = true;
            joinBlueBtn.textContent = 'Join Blue Team';
            joinBlueBtn.disabled = false;
        } else if (this.playerTeam === 'blue') {
            joinBlueBtn.textContent = '✓ Joined Blue Team';
            joinBlueBtn.disabled = true;
            joinRedBtn.textContent = 'Join Red Team';
            joinRedBtn.disabled = false;
        } else {
            joinRedBtn.textContent = 'Join Red Team';
            joinRedBtn.disabled = false;
            joinBlueBtn.textContent = 'Join Blue Team';
            joinBlueBtn.disabled = false;
        }
    }

    updatePlayerCount() {
        const totalPlayers = this.redTeamPlayers.length + this.blueTeamPlayers.length;
        document.getElementById('player-count-display').textContent = `Players: ${totalPlayers}/8`;

        // Enable start button if minimum 2 players and player has selected a team (and is host)
        const startBtn = document.getElementById('btn-start-game');
        const canStart = this.isHost && totalPlayers >= 2 && this.playerTeam;
        
        console.log(`[UPDATE PLAYER COUNT] isHost: ${this.isHost}, totalPlayers: ${totalPlayers}, playerTeam: ${this.playerTeam}, canStart: ${canStart}`);
        
        startBtn.disabled = !canStart;
        
        if (canStart) {
            startBtn.textContent = 'Start Game';
        } else if (totalPlayers < 2) {
            startBtn.textContent = 'Start Game (Minimum 2 players)';
        } else if (!this.playerTeam) {
            startBtn.textContent = 'Select a team first';
        } else if (!this.isHost) {
            startBtn.textContent = 'Only host can start';
        }
    }

    // ===== GAME MAP RENDERING =====
    renderGameMap() {
        // Find or create map container
        let mapContainer = document.getElementById('game-map-container');
        
        if (!mapContainer) {
            // Create the map container if it doesn't exist
            const gameContent = document.querySelector('.game-content');
            mapContainer = document.createElement('div');
            mapContainer.id = 'game-map-container';
            mapContainer.className = 'game-map-container';
            gameContent.insertBefore(mapContainer, gameContent.firstChild);
        }
        
        // Build the HTML for the map grid
        let mapHTML = '<div class="map-grid">';
        
        // Map labels for reference
        const mapLabels = {
            'N0': 'N0', 'N1': 'N1', 'N2': 'N2', 'N3': 'N3', 'N4': 'N4', 'N5': 'N5',
            'A0': 'A', 'A1': 'A', 'A2': 'A', 'A3': 'A', 'A4': 'A', 'A5': 'A',
            'S0': 'S0', 'S1': 'S1', 'S2': 'S2', 'S3': 'S3', 'S4': 'S4', 'S5': 'S5'
        };
        
        // Row order: North (y=0), Alley (y=1), South (y=2)
        const nodeOrder = [
            ['N0', 'N1', 'N2', 'N3', 'N4', 'N5'],
            ['A0', 'A1', 'A2', 'A3', 'A4', 'A5'],
            ['S0', 'S1', 'S2', 'S3', 'S4', 'S5']
        ];
        
        nodeOrder.forEach(row => {
            mapHTML += '<div class="map-row">';
            row.forEach(nodeId => {
                const owner = this.getNodeOwner(nodeId);
                const ownerClass = owner === 'red' ? 'owner-red' : owner === 'blue' ? 'owner-blue' : 'owner-neutral';
                
                mapHTML += `
                    <div class="map-node ${ownerClass}" id="node-${nodeId}" data-node-id="${nodeId}">
                        <div class="node-label">${mapLabels[nodeId]}</div>
                        <div class="node-owner-indicator">
                            ${owner === 'red' ? '🔴' : owner === 'blue' ? '🔵' : '⚪'}
                        </div>
                    </div>
                `;
            });
            mapHTML += '</div>';
        });
        
        mapHTML += '</div>';
        mapContainer.innerHTML = mapHTML;
        
        // Add click handlers to nodes
        document.querySelectorAll('.map-node').forEach(nodeElement => {
            nodeElement.addEventListener('click', (e) => {
                const nodeId = nodeElement.dataset.nodeId;
                this.handleNodeClick(nodeId);
            });
        });
    }

    handleNodeClick(nodeId) {
        console.log(`[NODE CLICK] Clicked node: ${nodeId}`);
        const currentOwner = this.getNodeOwner(nodeId);
        console.log(`[NODE CLICK] Current owner: ${currentOwner}, Your team: ${this.playerTeam}`);
        
        // Send action to server
        this.socket.emit('game:node-action', {
            gameCode: this.gameCode,
            nodeId: nodeId,
            action: 'capture'
        }, (response) => {
            if (response.success) {
                this.addGameLog(`You attempted to capture ${nodeId}!`);
            } else {
                this.addGameLog(`Cannot capture ${nodeId}: ${response.message}`);
            }
        });
    }

    addGameLog(message) {
        const gameLog = document.getElementById('game-log');
        if (gameLog) {
            const logEntry = document.createElement('p');
            logEntry.className = 'message-info';
            logEntry.textContent = message;
            gameLog.appendChild(logEntry);
            gameLog.scrollTop = gameLog.scrollHeight;
        }
    }

    updateGameMap(nodeControl) {
        // Update node control map
        Object.entries(nodeControl).forEach(([nodeId, owner]) => {
            this.nodeControl.set(nodeId, owner);
        });
        
        // Re-render map
        this.renderGameMap();
    }

    updateGameScreen() {
        // Update header with team scores
        document.getElementById('red-score').textContent = this.redScore;
        document.getElementById('blue-score').textContent = this.blueScore;
        document.getElementById('current-round').textContent = this.currentRound;

        // Update team display
        const teamEmoji = this.playerTeam === 'red' ? '🔴' : '🔵';
        const teamColor = this.playerTeam === 'red' ? 'Red' : 'Blue';
        document.getElementById('my-team-display').textContent = `${teamEmoji} ${teamColor}`;

        // Update my team players
        const myTeamPlayers = this.playerTeam === 'red' ? this.redTeamPlayers : this.blueTeamPlayers;
        const myTeamList = document.getElementById('my-team-players');
        
        if (myTeamPlayers.length === 0) {
            myTeamList.innerHTML = '<p>No teammates</p>';
        } else {
            myTeamList.innerHTML = myTeamPlayers
                .map(p => `<div class="player-item">${p.name}</div>`)
                .join('');
        }

        // Placeholder game log
        const gameLog = document.getElementById('game-log');
        gameLog.innerHTML = `
            <p class="message-info">🎮 Game started! Defend your flag and capture the enemy flag!</p>
            <p class="message-info">🔴 Red Team is ready to battle!</p>
            <p class="message-info">🔵 Blue Team is ready to battle!</p>
        `;
    }

    playAgain() {
        this.showScreen('home-screen');
        this.clearSession();
        this.gameCode = null;
        this.playerToken = null;
        this.playerTeam = null;
        this.gameStarted = false;
    }

    backToHome() {
        this.showScreen('home-screen');
        this.clearSession();
        this.gameCode = null;
        this.playerToken = null;
        this.playerTeam = null;
        this.gameStarted = false;
    }
}

// Initialize game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded - Initializing Game');
    new Game();
});
