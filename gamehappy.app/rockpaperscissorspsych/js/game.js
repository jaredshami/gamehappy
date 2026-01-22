class RockPaperScissorsPsychGame {
    constructor() {
        console.log('[GAME.JS] Loaded');
        
        // Connection
        this.socket = null;
        this.playerToken = null;
        this.isHost = false;
        
        // Game state
        this.gameCode = null;
        this.playerName = null;
        this.players = [];
        this.phase = 'home';
        this.roundNumber = 1;
        this.myIntention = null;
        this.myActualChoice = null;
        this.myReady = false;
        
        // Round state
        this.intentions = {}; // token -> {name, choice}
        this.actualChoices = {}; // token -> {name, choice}
        this.roundWinner = null;
        this.psychedPlayers = [];
        
        this.init();
    }

    init() {
        console.log('[GAME.JS] Initializing...');
        this.setupSocketIO();
        this.bindUIEvents();
        this.showScreen('home');
    }

    setupSocketIO() {
        console.log('[GAME.JS] Setting up Socket.IO...');
        
        this.socket = io({
            path: '/websocket',
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 5
        });

        this.socket.on('connect', () => {
            console.log('[SOCKET] Connected:', this.socket.id);
            this.playerToken = this.socket.id;
        });

        this.socket.on('connect_error', (error) => {
            console.error('[SOCKET] Connection error:', error);
        });

        // Game events
        this.socket.on('game:created', (data) => {
            console.log('[SOCKET] Game created:', data);
            this.gameCode = data.gameCode;
            this.playerToken = data.playerToken;
            this.isHost = data.isHost;
            this.playerName = data.playerName;
            this.showScreen('lobby');
            this.updateLobbyUI();
        });

        this.socket.on('game:joined', (data) => {
            console.log('[SOCKET] Joined game:', data);
            this.gameCode = data.gameCode;
            this.playerToken = data.playerToken;
            this.isHost = data.isHost;
            this.showScreen('lobby');
            this.updateLobbyUI();
        });

        this.socket.on('lobby:updated', (data) => {
            console.log('[SOCKET] Lobby updated:', data);
            if (data.players) {
                this.players = data.players;
            }
            this.updateLobbyUI();
        });

        this.socket.on('lobby:player-joined', (data) => {
            console.log('[SOCKET] Player joined:', data);
            if (data.players) {
                this.players = data.players;
            }
            this.updateLobbyUI();
        });

        this.socket.on('game:started', (data) => {
            console.log('[SOCKET] Game started:', data);
            this.phase = 'intention-select';
            this.roundNumber = data.roundNumber || 1;
            this.showScreen('intention');
            this.displayIntentions({});
        });

        this.socket.on('round:intentions', (data) => {
            console.log('[SOCKET] Intentions updated:', data);
            this.intentions = data.intentions;
            this.displayIntentions(data.intentions);
        });

        this.socket.on('round:allReady', () => {
            console.log('[SOCKET] All players ready, starting countdown');
            this.showScreen('countdown');
            this.startCountdown();
        });

        this.socket.on('round:actualChoice', () => {
            console.log('[SOCKET] Ready for actual choice');
            this.myActualChoice = null;
            this.phase = 'actual-choice';
            this.showScreen('actual');
            this.startActualChoiceTimer();
        });

        this.socket.on('round:result', (data) => {
            console.log('[SOCKET] Round result:', data);
            this.phase = 'round-result';
            this.displayRoundResult(data);
            this.showScreen('result');
        });

        this.socket.on('game:over', (data) => {
            console.log('[SOCKET] Game over:', data);
            this.phase = 'game-over';
            this.displayGameOver(data);
            this.showScreen('game-over');
        });
    }

    bindUIEvents() {
        console.log('[GAME.JS] Binding UI events...');
        
        // Home screen
        document.getElementById('btn-create').onclick = () => this.showScreen('create');
        document.getElementById('btn-join').onclick = () => this.showScreen('join');
        
        // Create screen
        document.getElementById('btn-create-game').onclick = () => this.createGame();
        
        // Join screen
        document.getElementById('btn-join-game').onclick = () => this.joinGame();
        
        // Lobby
        document.getElementById('btn-start-game').onclick = () => this.startGame();
        document.getElementById('btn-leave').onclick = () => this.leaveGame();
        
        // Intention select
        document.getElementById('btn-intention-rock').onclick = () => this.selectIntention('rock');
        document.getElementById('btn-intention-paper').onclick = () => this.selectIntention('paper');
        document.getElementById('btn-intention-scissors').onclick = () => this.selectIntention('scissors');
        
        // Ready screen
        document.getElementById('btn-player-ready').onclick = () => this.playerReady();
        
        // Actual choice
        document.getElementById('btn-actual-rock').onclick = () => this.makeActualChoice('rock');
        document.getElementById('btn-actual-paper').onclick = () => this.makeActualChoice('paper');
        document.getElementById('btn-actual-scissors').onclick = () => this.makeActualChoice('scissors');
        
        // Results
        document.getElementById('btn-next-round').onclick = () => this.nextRound();
        document.getElementById('btn-return-home').onclick = () => {
            this.socket.emit('game:leave', { gameCode: this.gameCode });
            this.showScreen('home');
        };
    }

    // UI Methods
    showScreen(screenName) {
        console.log('[SHOW-SCREEN]', screenName);
        const screens = document.querySelectorAll('.screen');
        screens.forEach(s => s.style.display = 'none');
        const screen = document.getElementById(`screen-${screenName}`);
        if (screen) {
            screen.style.display = 'block';
        }
        this.phase = screenName;
    }

    updateLobbyUI() {
        const codeDisplay = document.getElementById('lobby-code');
        if (codeDisplay) {
            codeDisplay.textContent = this.gameCode || '----';
        }

        const playersList = document.getElementById('players-list');
        if (playersList) {
            playersList.innerHTML = this.players
                .map(p => `<div class="player-item">${p.name}${p.token === this.playerToken ? ' (You)' : ''}${p.isHost ? ' 👑' : ''}</div>`)
                .join('');
        }

        const startBtn = document.getElementById('btn-start-game');
        if (startBtn && this.isHost && this.players.length >= 2) {
            startBtn.style.display = 'block';
        } else if (startBtn) {
            startBtn.style.display = 'none';
        }
    }

    displayIntentions(intentions) {
        const display = document.getElementById('intentions-display') || document.getElementById('intentions-display-ready');
        if (!display) return;

        let html = '<div class="intentions-list">';
        for (const [token, data] of Object.entries(intentions)) {
            html += `
                <div class="intention-item">
                    <div class="player-name">${data.name}</div>
                    <div class="intention-choice">${this.getEmoji(data.choice)} ${data.choice.toUpperCase()}</div>
                </div>
            `;
        }
        html += '</div>';
        display.innerHTML = html;
    }

    displayRoundResult(data) {
        const container = document.getElementById('result-content');
        if (!container) return;

        let html = '';

        if (data.type === 'psych') {
            html = `
                <div class="psych-alert">
                    <div class="psych-title">🧠 PSYCH!!! 🧠</div>
                    <div class="psyched-info">
                        <div class="psycher">Psyched by: ${data.psychedPlayers.join(', ')}</div>
                        <div class="eliminated">Eliminated: ${data.eliminated.join(', ')}</div>
                    </div>
                </div>
            `;
        } else {
            html = `
                <div class="round-result">
                    <div class="result-title">Round ${this.roundNumber} Result</div>
                    <div class="choices-result">
            `;
            
            for (const [token, playerData] of Object.entries(data.choices)) {
                html += `
                    <div class="choice-result">
                        <div class="player-name">${playerData.name}</div>
                        <div class="actual-choice">${this.getEmoji(playerData.choice)} ${playerData.choice.toUpperCase()}</div>
                    </div>
                `;
            }
            
            html += `
                    </div>
                    <div class="round-winner">
                        ${data.winners.length > 0 
                            ? `<strong>Winner: ${data.winners.join(', ')}</strong>`
                            : '<strong>Three-Way Tie</strong>'
                        }
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;
    }

    displayGameOver(data) {
        const winnerInfo = document.getElementById('winner-info');
        if (winnerInfo) {
            winnerInfo.innerHTML = `<h3 class="winner-name">🏆 ${data.winner} 🏆</h3>`;
        }

        const scoresContainer = document.getElementById('final-scores');
        if (scoresContainer) {
            let scoresHtml = '<div class="final-scores-list">';
            for (const [token, playerData] of Object.entries(data.scores)) {
                scoresHtml += `
                    <div class="final-score-item ${playerData.psyched ? 'psyched' : ''}">
                        <div class="score-name">${playerData.name}</div>
                        <div class="score-value">${playerData.score} pts${playerData.psyched ? ' (PSYCHED)' : ''}</div>
                    </div>
                `;
            }
            scoresHtml += '</div>';
            scoresContainer.innerHTML = scoresHtml;
        }
    }

    getEmoji(choice) {
        const emojis = { rock: '🪨', paper: '📄', scissors: '✂️' };
        return emojis[choice] || '?';
    }

    // Game Actions
    createGame() {
        const name = document.getElementById('create-name-input').value.trim();
        if (!name) {
            alert('Please enter your name');
            return;
        }
        this.playerName = name;
        this.socket.emit('game:create', { gameType: 'rockpaperscissorspsych', playerName: name }, (response) => {
            console.log('[CREATE-GAME] Response:', response);
            if (response.success) {
                this.gameCode = response.gameCode;
                this.playerToken = response.playerToken;
                this.isHost = true;
                this.players = response.players || [];
                this.updateLobbyUI();
                this.showScreen('lobby');
            }
        });
    }

    joinGame() {
        const code = document.getElementById('join-code-input').value.trim().toUpperCase();
        const name = document.getElementById('join-name-input').value.trim();
        if (!code || !name) {
            alert('Please enter code and name');
            return;
        }
        this.playerName = name;
        this.socket.emit('game:join', { gameCode: code, playerName: name }, (response) => {
            console.log('[JOIN-GAME] Response:', response);
            if (response.success) {
                this.gameCode = response.gameCode;
                this.playerToken = response.playerToken;
                this.isHost = false;
                this.players = response.players || [];
                this.updateLobbyUI();
                this.showScreen('lobby');
            } else {
                alert(response.message || 'Failed to join game');
            }
        });
    }

    startGame() {
        this.socket.emit('game:start', { gameCode: this.gameCode }, (response) => {
            console.log('[START-GAME] Response:', response);
            if (!response.success) {
                alert(response.message);
            }
        });
    }

    leaveGame() {
        this.socket.emit('game:leave', { gameCode: this.gameCode });
        this.showScreen('home');
    }

    selectIntention(choice) {
        this.myIntention = choice;
        this.socket.emit('game:intentionSelect', { gameCode: this.gameCode, intention: choice }, (response) => {
            console.log('[INTENTION] Response:', response);
            if (response.success) {
                this.displayIntentions(response.intentions);
                // Show ready screen
                this.showScreen('ready');
                this.displayIntentions(response.intentions);
            }
        });
    }

    playerReady() {
        this.myReady = true;
        this.socket.emit('game:playerReady', { gameCode: this.gameCode }, (response) => {
            console.log('[READY] Response:', response);
            if (!response.success) {
                alert(response.message);
            }
        });
        
        const btn = document.getElementById('btn-player-ready');
        if (btn) btn.disabled = true;
        
        const status = document.getElementById('ready-status');
        if (status) status.textContent = 'You are ready!';
    }

    startCountdown() {
        let countdownStates = ['ROCK!', 'PAPER!', 'SCISSORS!'];
        let index = 0;
        const countdownText = document.getElementById('countdown-text');

        const interval = setInterval(() => {
            if (index < countdownStates.length) {
                if (countdownText) countdownText.textContent = countdownStates[index];
                index++;
            } else {
                clearInterval(interval);
                this.socket.emit('game:countdownEnd', { gameCode: this.gameCode });
            }
        }, 300);
    }

    startActualChoiceTimer() {
        // No timer - players choose at their own pace
        // Timer display removed from UI
    }

    makeActualChoice(choice) {
        this.myActualChoice = choice;
        this.socket.emit('game:actualChoice', { gameCode: this.gameCode, choice: choice });
    }

    nextRound() {
        this.myIntention = null;
        this.myActualChoice = null;
        this.myReady = false;
        this.roundNumber++;
        this.socket.emit('game:nextRound', { gameCode: this.gameCode });
    }
}

// Initialize when DOM is ready
console.log('[MAIN] Script loaded');
document.addEventListener('DOMContentLoaded', () => {
    console.log('[MAIN] DOM ready, creating game instance');
    window.game = new RockPaperScissorsPsychGame();
});
