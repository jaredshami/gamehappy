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
        
        this.init();
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
        // Home screen
        document.getElementById('btn-create-game').addEventListener('click', () => this.showScreen('create-game-screen'));
        document.getElementById('btn-join-game').addEventListener('click', () => this.showScreen('join-game-screen'));
        document.getElementById('btn-how-to-play').addEventListener('click', () => this.showScreen('how-to-play-screen'));

        // Navigation
        document.getElementById('btn-back-create').addEventListener('click', () => this.showScreen('home-screen'));
        document.getElementById('btn-back-join').addEventListener('click', () => this.showScreen('home-screen'));
        document.getElementById('btn-back-how-to-play').addEventListener('click', () => this.showScreen('home-screen'));

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
        // Hide all screens
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });

        // Show selected screen
        const screen = document.getElementById(screenId);
        if (screen) {
            screen.classList.add('active');
            this.gameState = screenId;
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
        const playerName = document.getElementById('input-player-name').value.trim();

        if (!playerName) {
            this.showMessage('Please enter your name', 'error', 'create-game-screen');
            return;
        }

        if (!this.isConnected) {
            this.showMessage('Not connected to server', 'error', 'create-game-screen');
            return;
        }

        this.playerName = playerName;
        this.socket.emit('game:create', { playerName }, (response) => {
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

        if (!gameCode || gameCode.length !== 6) {
            this.showMessage('Please enter a valid 6-character game code', 'error', 'join-game-screen');
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
                    this.updateLobbyTeams();
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
        this.currentRound = 1;
        this.showScreen('game-screen');
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

        // Enable start button if minimum 2 players and player has selected a team
        const startBtn = document.getElementById('btn-start-game');
        const canStart = this.isHost && totalPlayers >= 2 && this.playerTeam;
        startBtn.disabled = !canStart;
        
        if (canStart) {
            startBtn.textContent = 'Start Game';
        } else if (totalPlayers < 2) {
            startBtn.textContent = 'Start Game (Minimum 2 players)';
        } else if (!this.playerTeam) {
            startBtn.textContent = 'Select a team first';
        }
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
