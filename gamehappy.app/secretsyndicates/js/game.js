// Secret Syndicates - Client Game Logic

console.log('Game.js loaded');

class Game {
    constructor() {
        console.log('Game constructor called');
        this.socket = null;
        this.isHost = false;
        this.gameCode = null;
        this.playerName = null;
        this.playerToken = null;
        this.playerRole = null;
        this.players = [];
        this.role = null;
        this.isReady = false;
        this.reconnecting = false;
        this.startGameInProgress = false;
        this.isConnected = false;
        this.isTestMode = false;  // Track if in test mode
        
        // Game state tracking for rejoin
        this.lastGameState = null;
        
        // Elimination tracking
        this.isEliminated = false;
        this.eliminationData = null;
        
        // Voting history tracking
        this.votingHistory = {}; // playerToken -> { accusationVotes: [], trialVotes: [] }

        this.init();
    }

    init() {
        console.log('Game.init() called');
        
        // Check for test mode
        const urlParams = new URLSearchParams(window.location.search);
        const testToken = urlParams.get('test');
        
        // Check for results view mode
        if (testToken === 'results') {
            // Results-only view mode - set as host for testing
            const winner = urlParams.get('winner') || 'innocent';
            const gameCode = urlParams.get('gameCode');
            this.gameCode = gameCode;
            this.playerToken = 'test-results-view';
            this.playerName = 'Results Viewer';
            this.isHost = true;  // Set as host for testing the button
            this.isTestMode = true;  // Mark as test mode
            console.log(`[RESULTS VIEW] Showing ${winner} win for game ${gameCode}`);
            
            // Bind events first so socket listeners are set up
            this.bindEvents();
            
            // Initialize socket connection so button can emit events
            this.connect();
            
            // Wait a bit for connection, then show results
            setTimeout(() => {
                this.showResultsScreenDirectly(winner);
            }, 500);
            return;
        } else if (testToken) {
            // Test mode - use token from URL, and game info from URL params
            this.playerToken = testToken;
            const gameCode = urlParams.get('gameCode');
            const playerName = urlParams.get('playerName');
            if (gameCode && playerName) {
                this.gameCode = gameCode;
                this.playerName = playerName;
                console.log(`[TEST MODE] Loaded as ${playerName} (${testToken}) in game ${gameCode}`);
            }
        } else {
            // Normal mode - check for rejoin URL first, then load from session
            if (!this.checkForRejoinSession()) {
                this.loadSession();
            }
        }
        
        this.bindEvents();
        
        // Auto-rejoin silently if there's an active session (don't show rejoin screen)
        if (!testToken && !this.isConnected) {
            const sessionData = this.getSessionData();
            if (sessionData) {
                try {
                    const session = JSON.parse(sessionData);
                    // Check if session is recent (within 24 hours)
                    const sessionAge = Date.now() - (session.createdAt || 0);
                    const dayInMs = 24 * 60 * 60 * 1000;
                    
                    if (sessionAge < dayInMs) {
                        // Valid session - load it and auto-reconnect after connection
                        this.playerToken = session.playerToken;
                        this.gameCode = session.gameCode;
                        this.playerName = session.playerName;
                        this.playerRole = session.playerRole;
                        this.lastGameState = session.gameState;
                        console.log(`[AUTO-REJOIN] Loaded session for ${this.playerName} in game ${this.gameCode}`);
                        console.log(`[AUTO-REJOIN] Restoring to phase: ${this.lastGameState?.currentPhase}`);
                        // Will auto-reconnect in connect() when socket connects
                    } else {
                        // Session expired - show home screen
                        this.clearSession();
                        this.showScreen('home-screen');
                    }
                } catch (e) {
                    console.error('Error parsing session:', e);
                    this.showScreen('home-screen');
                }
            } else {
                // No session - show home screen
                this.showScreen('home-screen');
            }
        }
        
        this.connect();
    }
    
    showResultsScreenDirectly(winner) {
        // Create mock data for results view
        const mockPlayers = [
            { name: 'A', token: 'test-player-1', role: 'Syndicate', alive: winner === 'syndicate' },
            { name: 'B', token: 'test-player-2', role: 'Detective', alive: winner === 'innocent' },
            { name: 'C', token: 'test-player-3', role: 'Bystander', alive: winner === 'innocent' },
            { name: 'D', token: 'test-player-4', role: 'Bystander', alive: true },
            { name: 'E', token: 'test-player-5', role: 'Bystander', alive: true }
        ];
        
        // Create voting history with new per-round structure
        const votingHistory = {
            'test-player-1': { roundVotes: { 1: { accused: 'test-player-2', verdict: 'guilty' }, 2: { accused: 'test-player-3', verdict: 'not-guilty' }, 3: { accused: 'test-player-4', verdict: 'not-guilty' } } },
            'test-player-2': { roundVotes: { 1: { accused: 'test-player-1', verdict: 'guilty' }, 2: { accused: 'test-player-1', verdict: 'guilty' }, 3: { accused: 'test-player-5', verdict: 'guilty' } } },
            'test-player-3': { roundVotes: { 1: { accused: 'test-player-4', verdict: 'not-guilty' }, 2: { accused: 'test-player-1', verdict: 'guilty' }, 3: { accused: 'test-player-2', verdict: 'not-guilty' } } },
            'test-player-4': { roundVotes: { 1: { accused: 'test-player-5', verdict: 'guilty' }, 2: { accused: 'test-player-2', verdict: 'not-guilty' }, 3: { accused: 'test-player-3', verdict: 'guilty' } } },
            'test-player-5': { roundVotes: { 1: { accused: 'test-player-3', verdict: 'guilty' }, 2: { accused: 'test-player-4', verdict: 'guilty' }, 3: { accused: 'test-player-1', verdict: 'guilty' } } }
        };
        
        // Calculate suspicion levels from voting history (same logic as server)
        const calculateSuspicionFromHistory = (targetToken) => {
            const targetPlayer = mockPlayers.find(p => p.token === targetToken);
            if (!targetPlayer) {
                return { level: 'Unknown', score: 0, reasons: [] };
            }

            let suspicionScore = 0;
            let reasons = [];

            // Get voting history for this player
            const targetHistory = votingHistory[targetToken] || { roundVotes: {} };

            // Count how many rounds they were accused
            let timesAccused = 0;
            let timesVotedGuilty = 0;
            let timesVotedNotGuilty = 0;
            
            // Analyze voting history across all rounds
            if (targetHistory.roundVotes) {
                Object.entries(targetHistory.roundVotes).forEach(([round, voteData]) => {
                    // Count how they voted
                    if (voteData.verdict) {
                        if (voteData.verdict === 'guilty') {
                            timesVotedGuilty++;
                        } else {
                            timesVotedNotGuilty++;
                        }
                    }
                });
            }
            
            // Also count votes AGAINST the target from other players
            let votesAgainstCount = 0;
            Object.entries(votingHistory).forEach(([voterToken, voterHistory]) => {
                if (voterToken !== targetToken && voterHistory.roundVotes) {
                    Object.entries(voterHistory.roundVotes).forEach(([round, voteData]) => {
                        if (voteData.accused === targetToken) {
                            votesAgainstCount++;
                        }
                    });
                }
            });

            // ==================== INCOMING SUSPICION (votes/accusations against them) ====================
            
            // Being accused by other players is a major indicator
            if (votesAgainstCount >= 1) {
                suspicionScore += (votesAgainstCount * 20);  // +20 per accusation vote
                reasons.push(`${votesAgainstCount} player(s) voted to accuse them`);
            }

            // ==================== OUTGOING SUSPICION (their voting patterns) ====================
            
            // Voting guilty frequently could indicate suspicious behavior
            if (timesVotedGuilty >= 2) {
                suspicionScore += (timesVotedGuilty * 8);  // +8 per guilty vote
                reasons.push(`Voted guilty ${timesVotedGuilty} times`);
            }

            // Voting not-guilty frequently suggests being defensive or protecting allies
            if (timesVotedNotGuilty >= 1) {
                suspicionScore += (timesVotedNotGuilty * 10);  // +10 per not-guilty vote (more suspicious)
                reasons.push(`Voted not guilty ${timesVotedNotGuilty} times (defensive)`);
            }

            // Convert score to level
            let level = 'Clear';
            if (suspicionScore >= 90) {
                level = 'Very Suspicious';
            } else if (suspicionScore >= 65) {
                level = 'Suspicious';
            } else if (suspicionScore >= 40) {
                level = 'Moderate';
            } else if (suspicionScore >= 15) {
                level = 'Low';
            }

            return {
                level: level,
                score: Math.min(suspicionScore, 100),  // Cap at 100
                reasons: reasons.length > 0 ? reasons : ['No suspicious activity detected']
            };
        };

        // Calculate suspicion for all players
        const playerSuspicionLevels = {};
        mockPlayers.forEach(player => {
            playerSuspicionLevels[player.token] = calculateSuspicionFromHistory(player.token);
        });
        
        // Simulate game-ended event
        this.handleGameEnded({
            winner: winner,
            winType: winner === 'syndicate' ? 'CONTROL_VOTES' : 'ELIMINATED_SYNDICATES',
            details: {
                message: winner === 'syndicate' ? 'Syndicates control the votes!' : 'All syndicates have been eliminated!',
                syndicatesLeft: winner === 'syndicate' ? 1 : 0,
                innocentLeft: winner === 'innocent' ? 3 : 2
            },
            finalRound: 3,
            playerRole: 'Bystander',
            allPlayers: mockPlayers,
            votingHistory: votingHistory,
            playerSuspicionLevels: playerSuspicionLevels
        });
    }

    // Session Management
    loadSession() {
        const savedSession = this.getSessionData();
        if (savedSession) {
            try {
                const session = JSON.parse(savedSession);
                // Check if session is not too old (24 hours - same as in init())
                const sessionAge = Date.now() - (session.createdAt || 0);
                const maxSessionAge = 24 * 60 * 60 * 1000; // 24 hours
                
                if (sessionAge > maxSessionAge) {
                    console.log('Session expired (older than 24 hours)');
                    this.clearSession();
                    return;
                }
                
                this.playerToken = session.playerToken;
                this.gameCode = session.gameCode;
                this.playerName = session.playerName;
                console.log('Loaded session for', this.playerName);
            } catch (e) {
                this.clearSession();
            }
        }
    }

    getSessionData() {
        return sessionStorage.getItem('secretSyndicatesSession');
    }

    saveSession() {
        if (this.playerToken && this.gameCode && this.playerName) {
            const sessionData = JSON.stringify({
                playerToken: this.playerToken,
                gameCode: this.gameCode,
                playerName: this.playerName,
                playerRole: this.playerRole,
                gameState: this.lastGameState || null,
                createdAt: Date.now()
            });
            sessionStorage.setItem('secretSyndicatesSession', sessionData);
        }
    }

    clearSession() {
        sessionStorage.removeItem('secretSyndicatesSession');
        this.playerToken = null;
    }

    // Rejoin Code Management
    generateRejoinCode() {
        // Format: GAME-XXXX-XXXX (friendly format)
        if (!this.gameCode) return null;
        
        // Use a combination of game code and partial token for unique code
        const gamePart = this.gameCode.substring(0, 4).toUpperCase();
        const tokenPart = (this.playerToken || '').substring(0, 4).toUpperCase();
        const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
        
        const rejoinCode = `${gamePart}-${tokenPart}-${randomPart}`;
        
        // Store it for later reference
        this.currentRejoinCode = rejoinCode;
        return rejoinCode;
    }

    generateRejoinUrl() {
        // Create a URL that can be used to rejoin the game
        const baseUrl = window.location.origin + window.location.pathname;
        const params = new URLSearchParams({
            rejoin: this.gameCode,
            token: this.playerToken,
            name: this.playerName
        });
        return `${baseUrl}?${params.toString()}`;
    }

    checkForRejoinSession() {
        // Check if user is trying to rejoin via URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const rejoinGameCode = urlParams.get('rejoin');
        const rejoinToken = urlParams.get('token');
        const rejoinName = urlParams.get('name');
        
        if (rejoinGameCode && rejoinToken) {
            console.log('Rejoin attempt detected from URL parameters');
            this.gameCode = rejoinGameCode;
            this.playerToken = rejoinToken;
            this.playerName = rejoinName || 'Unknown';
            this.saveSession();
            return true;
        }
        
        return false;
    }

    showRejoinScreenIfAvailable() {
        // Check if there's an active session
        const sessionData = this.getSessionData();
        if (sessionData) {
            try {
                const session = JSON.parse(sessionData);
                // Check if session is recent (within 24 hours)
                const sessionAge = Date.now() - (session.createdAt || 0);
                const dayInMs = 24 * 60 * 60 * 1000;
                
                if (sessionAge < dayInMs) {
                    // Show rejoin screen
                    document.getElementById('rejoin-game-code').textContent = session.gameCode;
                    document.getElementById('rejoin-player-name').textContent = session.playerName;
                    this.showScreen('rejoin-screen');
                    return;
                }
            } catch (e) {
                console.error('Error parsing session:', e);
            }
        }
        
        // No active session, show home screen
        this.showScreen('home-screen');
    }

    // WebSocket Connection
    setupSocketListeners() {
        // Connection lifecycle events
        this.socket.on('connect', () => {
            console.log('[SOCKET] Connected to server');
        });

        this.socket.on('disconnect', (reason) => {
            console.log('[SOCKET] Disconnected from server, reason:', reason);
            this.updateConnectionStatus('disconnected');
        });

        this.socket.on('connect_error', (error) => {
            console.error('[SOCKET] Connection error:', error);
            this.updateConnectionStatus('disconnected');
        });

        this.socket.on('error', (error) => {
            console.error('[SOCKET] Socket error:', error);
            this.updateConnectionStatus('disconnected');
        });

        // Listen for game events from server
        this.socket.on('game-created', (data) => {
            console.log('Game created:', data);
            this.gameCode = data.gameCode;
            this.isHost = data.isHost;
            this.saveSession();
            this.updateLobby(data.game);
        });

        this.socket.on('player-joined', (data) => {
            console.log('Player joined:', data);
            this.updateLobby(data.game);
        });

        this.socket.on('game-started', (data) => {
            console.log('Game started:', data);
            this.showScreen('role-screen');
            this.displayRoleIntro(data.gameState);
        });

        this.socket.on('game-state-updated', (data) => {
            console.log('Game state updated:', data);
            this.handleGameStateUpdate(data.gameState, data.eventResult);
        });

        this.socket.on('player-ready-updated', (data) => {
            console.log('Ready count updated:', data);
            this.updateReadyStatus(data.playerCount, data.totalPlayers);
        });

        this.socket.on('on-phase-start', (data) => {
            console.log('Phase start received:', data);
            this.onPhaseStart(data);
        });

        this.socket.on('phase4-vote-update', (data) => {
            console.log('Phase 4 vote update received:', data);
            this.onPhase4VoteUpdate(data);
        });

        this.socket.on('phase5-vote-update', (data) => {
            console.log('Phase 5 vote update received:', data);
            this.onPhase5VoteUpdate(data);
        });

        this.socket.on('verdict-result', (data) => {
            console.log('Verdict result received:', data);
            this.displayVerdictScreen(data);
        });

        // Syndicate real-time updates
        this.socket.on('syndicate-recommendations-update', (data) => {
            console.log('Syndicate recommendations update received:', data);
            this.onSyndicateRecommendationsUpdate(data);
        });

        this.socket.on('syndicate-lock-update', (data) => {
            console.log('Syndicate lock update received:', data);
            this.onSyndicateLockInUpdate(data);
        });
        
        this.socket.on('assassin-recommendations-update', (data) => {
            console.log('Assassin recommendations update received:', data);
            this.onAssassinRecommendationsUpdate(data);
        });

        this.socket.on('all-players-done', (data) => {
            console.log('All players done, advancing to next phase:', data);
            // Server will handle phase advancement, just wait for next on-phase-start event
        });

        // Bot action notifications
        this.socket.on('player-done-notification', (data) => {
            console.log('Player done notification received:', data);
            // Update the done counter if we have an element for it
            this.updateDoneCounter();
        });

        // Bot action performed notifications
        this.socket.on('game-event', (data) => {
            console.log('Game event received:', data);
            if (data.eventName === 'bot-action-performed') {
                console.log(`Bot action: ${data.payload.playerName} ${data.payload.action}`);
                this.showBotActionNotification(data.payload);
            } else if (data.eventName === 'phase-advancing') {
                console.log('Phase advancing:', data.payload);
            }
        });

        this.socket.on('player-left', (data) => {
            console.log('Player left:', data);
            this.updateLobby(data.game);
        });

        this.socket.on('player-disconnected', (data) => {
            console.log('Player disconnected:', data);
            this.updateLobby(data.game);
        });

        this.socket.on('rejoin-accepted', (data) => {
            console.log('[REJOIN] Rejoin accepted, returning to game:', data);
            console.log('[REJOIN] gameState:', data.gameState);
            console.log('[REJOIN] gameState.currentPhase:', data.gameState?.currentPhase);
            this.reconnecting = false;
            this.updateConnectionStatus('connected');
            
            // Save the gameState to session for potential future refreshes
            if (data.gameState) {
                this.lastGameState = data.gameState;
                this.playerRole = data.gameState.playerRole || data.gameState.role;
                this.saveSession();
            }
            
            // Restore game state - gameState is an object with gameState, currentPhase, playerRole
            if (data.gameState && (data.gameState.currentPhase >= 1 || data.gameState.gameState === 'started')) {
                // Game is in progress, show role screen
                console.log('[REJOIN] Game is in progress, showing role screen');
                this.showScreen('role-screen');
                this.displayRoleIntro(data.gameState);
            } else {
                // Game hasn't started yet, show lobby
                console.log('[REJOIN] Game not started, showing lobby');
                this.updateLobby(data.game);
            }
        });

        this.socket.on('rejoin-rejected', (data) => {
            console.log('[REJOIN] Rejoin rejected:', data.message);
            this.reconnecting = false;
            this.clearSession();
            this.gameCode = null;
            this.playerToken = null;
            this.showScreen('home-screen');
        });

        this.socket.on('player-eliminated', (data) => {
            console.log('Player eliminated event received:', data);
            // Only process elimination event if not already eliminated
            if (!this.isEliminated) {
                this.isEliminated = true;
                this.eliminationData = data;
                this.showEliminationScreen(data);
            } else {
                console.log('Already eliminated, ignoring redundant elimination event');
            }
        });

        this.socket.on('game-ended', (data) => {
            console.log('Game ended event received:', data);
            this.handleGameEnded(data);
        });
        
        this.socket.on('play-again-lobby', (data) => {
            console.log('Play again - moving to new lobby:', data);
            this.handlePlayAgainLobby(data);
        });
    }

    connect() {
        this.updateConnectionStatus('connecting');

        try {
            console.log('[CONNECT] Initiating Socket.IO connection to wss://gamehappy.app');
            console.log('[CONNECT] Player token:', this.playerToken);
            console.log('[CONNECT] Game code:', this.gameCode);

            // Get or create session ID for user tracking
            let sessionId = localStorage.getItem('gamehappy-session-id');
            if (!sessionId) {
                sessionId = 'session-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now();
                localStorage.setItem('gamehappy-session-id', sessionId);
            }

            // Connect to Socket.IO server with correct path
            this.socket = io('wss://gamehappy.app', {
                path: '/websocket',
                query: {
                    token: this.playerToken || '',
                    sessionId: sessionId
                },
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                reconnectionAttempts: 5
            });

            // Set up all socket event listeners FIRST before any events fire
            console.log('[CONNECT] Setting up socket listeners');
            this.setupSocketListeners();

            // Connection event - fires when socket successfully connects
            this.socket.on('connect', () => {
                console.log('[CONNECT] Socket.IO connected successfully');
                this.isConnected = true;
                this.updateConnectionStatus('connected');
                
                // Notify server that a regular user (not admin) is connected
                const sessionId = localStorage.getItem('gamehappy-session-id');
                console.log('[CONNECT] Emitting user:connect with page=secretsyndicates-home, sessionId=' + sessionId);
                this.socket.emit('user:connect', {
                    timestamp: new Date(),
                    page: 'secretsyndicates-home',
                    sessionId: sessionId
                });
                console.log('[CONNECT] user:connect event emitted');
                
                // Skip auto-rejoin in test mode
                if (this.isTestMode) {
                    console.log('[CONNECT] Test mode - skipping auto-rejoin');
                    return;
                }
                
                // Try to reconnect to existing game if we have a token
                if (this.playerToken && this.gameCode) {
                    console.log('[CONNECT] Auto-rejoining game:', this.gameCode);
                    this.attemptReconnect();
                } else {
                    console.log('[CONNECT] No session to rejoin (token:', this.playerToken, 'code:', this.gameCode, ')');
                }
            });

            // Connection error event
            this.socket.on('connect_error', (error) => {
                console.error('[CONNECT_ERROR]', error);
                this.updateConnectionStatus('connection-error');
            });

        } catch (error) {
            console.error('[CONNECT] Failed to initialize Socket.IO:', error);
            this.updateConnectionStatus('disconnected');
        }
    }

    attemptReconnect() {
        if (!this.playerToken || !this.gameCode) {
            console.log('[RECONNECT] Missing credentials - token:', this.playerToken, 'code:', this.gameCode);
            return;
        }
        
        console.log('[RECONNECT] Attempting to rejoin game:', this.gameCode, 'with token:', this.playerToken, 'as player:', this.playerName);
        this.reconnecting = true;
        this.updateConnectionStatus('reconnecting');
        
        // Emit rejoin event to server - response will be handled by rejoin-accepted or rejoin-rejected listeners
        this.socket.emit('rejoin-game', {
            gameCode: this.gameCode,
            playerToken: this.playerToken,
            playerName: this.playerName
        });
    }

    searchRejoinGame() {
        const gameCode = document.getElementById('rejoin-code').value.toUpperCase();
        const errorEl = document.getElementById('rejoin-code-error');
        
        if (!gameCode || gameCode.length !== 4) {
            errorEl.textContent = 'Please enter a 4-letter game code';
            return;
        }

        console.log('[REJOIN-SEARCH] Searching for disconnected players in game:', gameCode);
        
        this.socket.emit('get-disconnected-players', { gameCode }, (response) => {
            if (response.error) {
                console.error('[REJOIN-SEARCH] Error:', response.error);
                errorEl.textContent = response.error;
                return;
            }

            if (!response.players || response.players.length === 0) {
                errorEl.textContent = 'No players found in this game';
                return;
            }

            console.log('[REJOIN-SEARCH] Found players:', response.players);
            this.showRejoinPlayerSelection(response.players, gameCode);
        });
    }

    showRejoinPlayerSelection(players, gameCode) {
        const container = document.getElementById('rejoin-players-list');
        container.innerHTML = '';

        players.forEach(player => {
            const playerEl = document.createElement('div');
            playerEl.className = 'rejoin-player-item';
            playerEl.innerHTML = `
                <div class="rejoin-player-info">
                    <div class="rejoin-player-name">${player.name}</div>
                    <div class="rejoin-player-status">Game Code: ${gameCode}</div>
                </div>
                <div class="rejoin-player-icon">🎭</div>
            `;
            playerEl.addEventListener('click', () => {
                this.rejoinAsPlayer(gameCode, player.token);
            });
            container.appendChild(playerEl);
        });

        this.showScreen('rejoin-player-screen');
    }

    rejoinAsPlayer(gameCode, playerToken) {
        console.log('[REJOIN-SELECT] Rejoin as player:', playerToken, 'in game:', gameCode);
        
        // Save session
        this.playerToken = playerToken;
        this.gameCode = gameCode;
        this.saveSession();

        // Attempt to reconnect with these credentials
        this.attemptReconnect();
    }

    updateConnectionStatus(status) {
        const statusEl = document.getElementById('connection-status');
        const textEl = statusEl.querySelector('.status-text');

        statusEl.classList.remove('connected');

        switch (status) {
            case 'connected':
                statusEl.classList.add('connected');
                textEl.textContent = 'Connected';
                break;
            case 'connecting':
                textEl.textContent = 'Connecting...';
                break;
            case 'reconnecting':
                textEl.textContent = 'Reconnecting...';
                break;
            case 'disconnected':
                textEl.textContent = 'Disconnected';
                break;
        }
    }

    updateDoneCounter() {
        // Find the done count element and increment it or update based on server state
        const countEl = document.getElementById('done-count');
        if (countEl) {
            // Request current game state if needed, or just trigger a UI update
            // The counter will be updated via gameState updates
            console.log('Done counter update triggered');
        }
    }

    showBotActionNotification(payload) {
        // Show a temporary notification that a bot performed an action
        console.log(`[BOT ACTION] ${payload.playerName} ${payload.action}`);
        
        // Create or update action notification element
        let actionNotif = document.getElementById('bot-action-notification');
        if (!actionNotif) {
            actionNotif = document.createElement('div');
            actionNotif.id = 'bot-action-notification';
            actionNotif.className = 'bot-action-notification';
            document.body.appendChild(actionNotif);
        }
        
        actionNotif.textContent = `${payload.playerName} ${payload.action}`;
        actionNotif.style.display = 'block';
        actionNotif.style.opacity = '1';
        
        // Fade out after 2 seconds
        setTimeout(() => {
            actionNotif.style.opacity = '0';
            setTimeout(() => {
                actionNotif.style.display = 'none';
            }, 300);
        }, 2000);
    }

    // Event Binding
    bindEvents() {
        // Home screen buttons
        const createBtn = document.getElementById('btn-create-game');
        if (createBtn) {
            createBtn.addEventListener('click', () => {
                console.log('Create game button clicked');
                this.showScreen('create-screen');
            });
        } else {
            console.error('btn-create-game not found in DOM');
        }

        document.getElementById('btn-join-game').addEventListener('click', () => {
            this.showScreen('join-screen');
        });

        // How to Play button
        document.getElementById('btn-how-to-play').addEventListener('click', () => {
            this.showScreen('how-to-play-screen');
        });

        // Back buttons
        document.getElementById('btn-back-create').addEventListener('click', () => {
            this.showScreen('home-screen');
            this.clearErrors();
        });

        document.getElementById('btn-back-join').addEventListener('click', () => {
            this.showScreen('home-screen');
            this.clearErrors();
        });

        document.getElementById('btn-back-rejoin-code').addEventListener('click', () => {
            this.showScreen('home-screen');
            document.getElementById('rejoin-code-error').textContent = '';
        });

        document.getElementById('btn-back-rejoin-player').addEventListener('click', () => {
            this.showScreen('rejoin-code-screen');
            document.getElementById('rejoin-player-error').textContent = '';
        });

        document.getElementById('btn-back-how-to-play').addEventListener('click', () => {
            this.showScreen('home-screen');
        });

        document.getElementById('btn-close-how-to-play').addEventListener('click', () => {
            this.showScreen('home-screen');
        });

        // Rejoin screen buttons
        const btnRejoinNewGame = document.getElementById('btn-rejoin-new-game');
        if (btnRejoinNewGame) {
            btnRejoinNewGame.addEventListener('click', () => {
                this.clearSession();
                this.gameCode = null;
                this.playerToken = null;
                this.showScreen('home-screen');
            });
        }

        // Create game
        document.getElementById('btn-create-lobby').addEventListener('click', () => {
            this.createGame();
        });

        // Join game
        document.getElementById('btn-join-lobby').addEventListener('click', () => {
            this.joinGame();
        });

        // Rejoin by code search
        document.getElementById('btn-rejoin-search').addEventListener('click', () => {
            this.searchRejoinGame();
        });

        // Start game
        document.getElementById('btn-start-game').addEventListener('click', () => {
            this.startGame();
        });

        // Ready button
        document.getElementById('btn-ready').addEventListener('click', () => {
            this.setReady();
        });

        // Enter key handling for inputs
        document.getElementById('create-player-name').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.createGame();
        });

        document.getElementById('join-player-name').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') document.getElementById('join-game-code').focus();
        });

        document.getElementById('join-game-code').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinGame();
        });

        // Auto-uppercase game code
        document.getElementById('join-game-code').addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase();
        });
    }

    // Send message helper - converts old message format to Socket.IO events
    sendMessage(data) {
        console.log('Sending message:', JSON.stringify(data));
        
        // Map old action-based messages to Socket.IO events
        if (data.action === 'playerReady') {
            this.socket.emit('player-ready', {});
        } else if (data.action === 'playerDone' || data.action === 'playerDonePhase3') {
            this.socket.emit('game-event', {
                eventName: 'player-done',
                payload: {}
            });
        } else if (data.action === 'nightVote') {
            this.socket.emit('game-event', {
                eventName: 'night-vote',
                payload: { target: data.target }
            });
        } else if (data.action === 'syndicateRecommend') {
            this.socket.emit('game-event', {
                eventName: 'night-vote',
                payload: { target: data.targetId }
            });
        } else if (data.action === 'syndicateLockIn') {
            this.socket.emit('game-event', {
                eventName: 'night-lock',
                payload: {}
            });
        } else if (data.action === 'dayVote') {
            this.socket.emit('game-event', {
                eventName: 'day-vote',
                payload: { target: data.target }
            });
        } else if (data.action === 'trialVote') {
            this.socket.emit('game-event', {
                eventName: 'trial-vote',
                payload: { vote: data.vote }
            });
        } else if (data.action === 'castVote') {
            this.socket.emit('game-event', {
                eventName: 'accusation-vote',
                payload: { target: data.targetId }
            });
        } else if (data.action === 'detective-lock') {
            this.socket.emit('game-event', {
                eventName: 'detective-lock',
                payload: { targetToken: data.targetToken }
            });
        } else if (data.action === 'updateCaseNotes') {
            this.socket.emit('game-event', {
                eventName: 'update-case-notes',
                payload: { targetId: data.targetId, notes: data.notes }
            });
        } else if (data.action === 'bodyGuardProtect') {
            this.socket.emit('game-event', {
                eventName: 'bodyguard-protect',
                payload: { targetToken: data.targetId }
            });
        } else if (data.action === 'verdictReady') {
            console.log('============ SENDING VERDICT-READY EVENT ============');
            this.socket.emit('verdictReady', {});
            console.log('verdictReady event emitted to server');
        } else if (data.action === 'bystanderSelect') {
            this.socket.emit('game-event', {
                eventName: 'bystander-select',
                payload: { targetToken: data.targetId }
            });
        } else {
            console.warn('Unknown action in sendMessage:', data.action);
        }
    }

    // Screen Management
    showScreen(screenId) {
        console.log('showScreen called with:', screenId);
        try {
            document.querySelectorAll('.screen').forEach(screen => {
                screen.classList.remove('active');
                screen.style.display = 'none';
            });
            const targetScreen = document.getElementById(screenId);
            if (targetScreen) {
                targetScreen.classList.add('active');
                targetScreen.style.display = 'block';  // Force display block
                console.log('Screen changed to:', screenId);
            } else {
                console.error('Screen not found:', screenId);
            }
        } catch (e) {
            console.error('Error changing screen:', e);
        }
    }

    clearErrors() {
        document.querySelectorAll('.error-message').forEach(el => {
            el.textContent = '';
        });
    }

    showError(elementId, message) {
        document.getElementById(elementId).textContent = message;
    }

    // Game Actions
    createGame() {
        const playerName = document.getElementById('create-player-name').value.trim();

        if (!playerName) {
            this.showError('create-error', 'Please enter your name');
            return;
        }

        if (!this.socket || !this.socket.connected) {
            this.showError('create-error', 'Not connected to server. Please wait...');
            return;
        }

        const eyeWitness = document.getElementById('opt-eye-witness').checked;
        const bodyGuard = document.getElementById('opt-body-guard').checked;

        this.playerName = playerName;

        console.log('Creating game with settings:', { eyeWitness, bodyGuard });

        // Emit create-game event to server
        this.socket.emit('create-game', {
            gameType: 'secretsyndicates',
            playerName: playerName,
            settings: {
                enableEyeWitness: eyeWitness,
                enableBodyGuard: bodyGuard
            }
        }, (response) => {
            if (response.success) {
                console.log('Game created:', response.gameCode);
                this.gameCode = response.gameCode;
                this.isHost = response.isHost;
                
                // Use server-assigned playerToken
                if (response.playerToken) {
                    this.playerToken = response.playerToken;
                }
                
                this.saveSession();
                this.showScreen('lobby-screen');
                this.updateLobby(response.game);
            } else {
                this.showError('create-error', response.message || 'Failed to create game');
            }
        });
    }

    joinGame() {
        const playerName = document.getElementById('join-player-name').value.trim();
        const gameCode = document.getElementById('join-game-code').value.trim().toUpperCase();

        if (!playerName) {
            this.showError('join-error', 'Please enter your name');
            return;
        }

        if (!gameCode || gameCode.length !== 4) {
            this.showError('join-error', 'Please enter a valid 4-character game code');
            return;
        }

        if (!this.socket || !this.socket.connected) {
            this.showError('join-error', 'Not connected to server. Please wait...');
            return;
        }

        this.playerName = playerName;
        console.log('Joining game:', gameCode, 'as', playerName);

        // Emit join-game event to server
        this.socket.emit('join-game', {
            gameCode: gameCode,
            playerName: playerName
        }, (response) => {
            if (response.success) {
                console.log('Successfully joined game:', gameCode);
                this.gameCode = gameCode;
                this.isHost = response.isHost;
                
                // Use server-assigned playerToken
                if (response.playerToken) {
                    this.playerToken = response.playerToken;
                }
                
                this.saveSession();
                this.showScreen('lobby-screen');
                this.updateLobby(response.game);
            } else {
                this.showError('join-error', response.message || 'Failed to join game');
            }
        });
    }

    startGame() {
        if (!this.isHost) return;
        
        // Prevent multiple clicks - use a flag to ensure only one call
        if (this.startGameInProgress) return;
        this.startGameInProgress = true;
        
        const startBtn = document.getElementById('btn-start-game');
        if (startBtn) {
            startBtn.disabled = true;
            startBtn.textContent = 'Starting...';
        }

        // Emit start-game event to server
        this.socket.emit('start-game', {
            gameCode: this.gameCode
        }, (response) => {
            if (!response.success) {
                console.error('Failed to start game:', response.message);
                this.startGameInProgress = false;
                if (startBtn) {
                    startBtn.disabled = false;
                    startBtn.textContent = 'Start Game';
                }
            }
        });
        
        // Reset flag after a delay in case of error
        setTimeout(() => {
            this.startGameInProgress = false;
        }, 5000);
    }

    setReady() {
        if (this.isReady) return;

        this.isReady = true;
        const btn = document.getElementById('btn-ready');
        if (btn) {
            btn.disabled = true;
            btn.textContent = '✓ Ready!';
        }

        // Emit player-ready event via Socket.IO
        this.socket.emit('player-ready', {});
    }

    // Message Handling
    handleMessage(data) {
        switch (data.action) {
            case 'gameCreated':
                this.onGameCreated(data);
                break;
            case 'gameJoined':
                this.onGameJoined(data);
                break;
            case 'playerListUpdate':
                this.updatePlayerList(data.players);
                break;
            case 'becameHost':
                this.onBecameHost();
                break;
            case 'roleAssigned':
                this.onRoleAssigned(data);
                break;
            case 'readyUpdate':
                this.onReadyUpdate(data);
                break;
            case 'phaseStart':
                this.onPhaseStart(data);
                break;
            case 'reconnected':
                this.onReconnected(data);
                break;
            case 'reconnectFailed':
                this.onReconnectFailed(data);
                break;
            case 'playerDisconnected':
                this.onPlayerDisconnected(data);
                break;
            case 'playerReconnected':
                this.onPlayerReconnected(data);
                break;
            case 'syndicateRecommendationsUpdate':
                this.onSyndicateRecommendationsUpdate(data);
                break;
            case 'syndicateLockInUpdate':
                this.onSyndicateLockInUpdate(data);
                break;
            case 'syndicateTargetChosen':
                this.onSyndicateTargetChosen(data);
                break;
            case 'syndicateTie':
                this.onSyndicateTie(data);
                break;
            case 'syndicateTargetFailed':
                this.onSyndicateTargetFailed(data);
                break;
            case 'syndicateAssassinChosen':
                this.onSyndicateAssassinChosen(data);
                break;
            case 'playerDoneUpdate':
                this.onPlayerDoneUpdate(data);
                break;
            case 'playerReadyUpdate':
                this.onPlayerReadyUpdate(data);
                break;
            case 'phase2Start':
                this.onPhase2Start(data);
                break;
            case 'phase3Start':
                this.onPhase3Start(data);
                break;
            case 'phase3DoneUpdate':
                this.onPhase3DoneUpdate(data);
                break;
            case 'phase4Start':
                this.onPhase4Start(data);
                break;
            case 'phase4VoteUpdate':
                this.onPhase4VoteUpdate(data);
                break;
            case 'phase5Start':
                this.onPhase5Start(data);
                break;
            case 'phase5VoteUpdate':
                this.onPhase5VoteUpdate(data);
                break;
            case 'playerEliminated':
                this.onPlayerEliminated(data);
                break;
            case 'trialVerdict':
                this.onTrialVerdict(data);
                break;
            case 'nextRoundStart':
                this.onNextRoundStart(data);
                break;
            case 'gameEnd':
                this.onGameEnd(data);
                break;
            case 'playAgain':
                this.onPlayAgain(data);
                break;
            case 'leftGame':
                this.onLeftGame(data);
                break;
            case 'removedFromGame':
                this.onRemovedFromGame(data);
                break;
            case 'gameNoteAdded':
                this.onGameNoteAdded(data);
                break;
            case 'error':
                this.handleError(data.message);
                break;
        }
    }

    onGameCreated(data) {
        console.log('onGameCreated called with data:', data);
        this.isHost = true;
        this.gameCode = data.gameCode;
        this.playerToken = data.playerToken;
        this.players = data.players;
        this.saveSession();

        try {
            console.log('Setting game code...');
            const gameCodeEl = document.getElementById('display-game-code');
            if (gameCodeEl) {
                gameCodeEl.textContent = data.gameCode;
                console.log('Game code set to:', data.gameCode);
            } else {
                console.warn('display-game-code element not found');
            }
            
            console.log('Updating player list with players:', data.players);
            this.updatePlayerList(data.players);

            // Show host controls
            console.log('Setting host controls...');
            const hostControls = document.getElementById('host-controls');
            const guestMessage = document.getElementById('guest-message');
            if (hostControls) {
                hostControls.style.display = 'block';
                console.log('Host controls shown');
            } else {
                console.warn('host-controls element not found');
            }
            if (guestMessage) {
                guestMessage.style.display = 'none';
                console.log('Guest message hidden');
            } else {
                console.warn('guest-message element not found');
            }
        } catch (e) {
            console.error('Error in onGameCreated:', e);
        }

        console.log('About to show lobby-screen');
        this.showScreen('lobby-screen');
        console.log('Clearing errors');
        this.clearErrors();
    }

    updateLobby(gameData) {
        console.log('updateLobby called with:', gameData);
        
        if (!gameData) return;

        // Update game code display
        if (gameData.gameCode) {
            const gameCodeEl = document.getElementById('display-game-code');
            if (gameCodeEl) {
                gameCodeEl.textContent = gameData.gameCode;
            }
        }

        // Update player list
        if (gameData.players) {
            this.updatePlayerList(gameData.players);
        }

        // Update player count and visibility
        const playerCount = gameData.playerCount || 0;
        const playerCountEl = document.getElementById('player-count');
        if (playerCountEl) {
            playerCountEl.textContent = `(${playerCount}/5 minimum)`;
        }

        // Update start button state
        const startBtn = document.getElementById('btn-start-game');
        if (startBtn) {
            startBtn.disabled = playerCount < 5;
        }

        // Show/hide host controls
        const hostControls = document.getElementById('host-controls');
        const guestMessage = document.getElementById('guest-message');
        
        if (this.isHost) {
            if (hostControls) hostControls.style.display = 'block';
            if (guestMessage) guestMessage.style.display = 'none';
        } else {
            if (hostControls) hostControls.style.display = 'none';
            if (guestMessage) guestMessage.style.display = 'block';
        }
    }

    displayRoleIntro(gameState) {
        console.log('displayRoleIntro called with gameState:', gameState);
        
        if (!gameState) {
            console.error('No gameState provided');
            return;
        }

        // Get player's role from gameState
        const playerRole = gameState.playerRole;
        console.log('Player role:', playerRole);

        if (!playerRole) {
            console.error('No playerRole in gameState');
            return;
        }

        // Store role
        this.role = playerRole;

        try {
            // Set role name
            const roleEl = document.getElementById('player-role');
            if (roleEl) {
                roleEl.textContent = playerRole;
                roleEl.className = 'role-name ' + playerRole.toLowerCase().replace(/\s+/g, '-');
            }

            // Set description based on role
            const descEl = document.getElementById('role-description');
            if (descEl) {
                const descriptions = {
                    'Syndicate': 'You are part of the secret criminal organization. Your goal is to eliminate all innocent citizens without being discovered.',
                    'Detective': 'You are a skilled investigator working to expose the Syndicate. Use your abilities wisely to uncover the truth.',
                    'Bystander': 'You are an ordinary citizen caught in the crossfire. Stay vigilant and help identify the Syndicate through observation and deduction.',
                    'Eye Witness': 'You witnessed a crime and caught a glimpse of the underworld. You see who commits the assassination each round.',
                    'Body Guard': 'You are a professional protector. Each night, you can choose one player to shield from harm.'
                };
                descEl.textContent = descriptions[playerRole] || 'Role description unavailable';
            }

            // Set abilities based on role
            const abilitiesList = document.getElementById('role-abilities-list');
            if (abilitiesList) {
                abilitiesList.innerHTML = '';
                const abilities = {
                    'Syndicate': [
                        'Vote each night to select a target',
                        'Know the identity of your fellow Syndicate members',
                        'Blend in during the day and mislead investigations'
                    ],
                    'Detective': [
                        'Receive a secret keyword each round',
                        'Share your findings during day discussions',
                        'Lead the town to vote out Syndicate members'
                    ],
                    'Bystander': [
                        'Vote during the day to eliminate suspected Syndicate',
                        'Observe player behavior and discussions',
                        'Form alliances with other players'
                    ],
                    'Eye Witness': [
                        'Learn the assassin\'s identity each round',
                        'Receive a keyword to signal the Detective',
                        'Vote during the day like other citizens'
                    ],
                    'Body Guard': [
                        'Protect one player each night from elimination',
                        'Cannot protect yourself',
                        'Cannot protect the same player two nights in a row'
                    ]
                };
                
                const roleAbilities = abilities[playerRole] || [];
                roleAbilities.forEach(ability => {
                    const li = document.createElement('li');
                    li.textContent = ability;
                    abilitiesList.appendChild(li);
                });
            }

            // Set win condition
            const winEl = document.getElementById('role-win-condition');
            if (winEl) {
                const winConditions = {
                    'Syndicate': 'Eliminate enough players until Syndicate equals or outnumbers the Town',
                    'Detective': 'Survive and help eliminate all Syndicate members',
                    'Bystander': 'Survive and help eliminate all Syndicate members',
                    'Eye Witness': 'Survive and help eliminate all Syndicate members',
                    'Body Guard': 'Survive and help eliminate all Syndicate members'
                };
                winEl.textContent = winConditions[playerRole] || 'Unknown win condition';
            }

            // Show teammates for Syndicate
            const teammatesSection = document.getElementById('teammates-section');
            const teammatesList = document.getElementById('teammates-list');
            
            if (playerRole === 'Syndicate' && gameState.syndicate && gameState.syndicate.length > 1) {
                if (teammatesSection) {
                    teammatesSection.style.display = 'block';
                    if (teammatesList) {
                        teammatesList.innerHTML = '';
                        // Get teammates (other syndicate members)
                        const teammates = gameState.syndicate.filter(s => s.name !== this.playerName);
                        teammates.forEach(teammate => {
                            const li = document.createElement('li');
                            li.textContent = teammate.name;
                            teammatesList.appendChild(li);
                        });
                    }
                }
            } else if (teammatesSection) {
                teammatesSection.style.display = 'none';
            }

            // Update ready status
            const readyCount = document.getElementById('ready-count');
            const readyTotal = document.getElementById('ready-total');
            if (readyCount) readyCount.textContent = gameState.readyCount || 0;
            if (readyTotal) readyTotal.textContent = gameState.totalPlayers || 0;

        } catch (e) {
            console.error('Error in displayRoleIntro:', e);
        }
    }

    onGameJoined(data) {
        this.isHost = false;
        this.gameCode = data.gameCode;
        this.playerToken = data.playerToken;
        this.players = data.players;
        
        // Update playerName if it was set before joining
        if (!this.playerName && data.playerName) {
            this.playerName = data.playerName;
        }
        
        this.saveSession();

        try {
            const gameCodeEl = document.getElementById('display-game-code');
            if (gameCodeEl) {
                gameCodeEl.textContent = data.gameCode;
            }
            this.updatePlayerList(data.players);

            // Show guest message instead of host controls
            const hostControls = document.getElementById('host-controls');
            const guestMessage = document.getElementById('guest-message');
            if (hostControls) hostControls.style.display = 'none';
            if (guestMessage) guestMessage.style.display = 'block';
        } catch (e) {
            console.error('Error in onGameJoined:', e);
        }

        this.showScreen('lobby-screen');
        this.clearErrors();
    }

    onBecameHost() {
        this.isHost = true;
        document.getElementById('host-controls').style.display = 'block';
        document.getElementById('guest-message').style.display = 'none';
        this.updateStartButton();
    }

    onRoleAssigned(data) {
        console.log('onRoleAssigned called with data:', data);
        console.log('Description object:', data.description);
        console.log('Description type:', typeof data.description);
        
        this.role = data.role;
        this.isReady = false;

        try {
            // Ensure description is an object
            if (typeof data.description === 'string' || !data.description) {
                console.error('Invalid description format:', data.description);
                console.log('Using empty description');
                data.description = {
                    title: data.role,
                    description: 'Role description unavailable',
                    abilities: [],
                    winCondition: 'Unknown'
                };
            }
            
            // Set role name with styling
            const roleEl = document.getElementById('player-role');
            if (!roleEl) {
                console.error('Element player-role not found!');
                return;
            }
            roleEl.textContent = data.description.title || data.role;
            roleEl.className = 'role-name ' + data.role.toLowerCase().replace(' ', '-');

            // Set description
            const descEl = document.getElementById('role-description');
            if (descEl) descEl.textContent = data.description.description || '';

            // Set abilities
            const abilitiesList = document.getElementById('role-abilities-list');
            if (abilitiesList) {
                abilitiesList.innerHTML = '';
                const abilities = data.description.abilities || [];
                abilities.forEach(ability => {
                    const li = document.createElement('li');
                    li.textContent = ability;
                    abilitiesList.appendChild(li);
                });
            }

            // Set win condition
            const winEl = document.getElementById('role-win-condition');
            if (winEl) winEl.textContent = data.description.winCondition || '';

            // Show teammates for Syndicate
            const teammatesSection = document.getElementById('teammates-section');
            const teammatesList = document.getElementById('teammates-list');
            
            if (data.role === 'Syndicate' && data.teammates && data.teammates.length > 0) {
                if (teammatesSection) {
                    teammatesSection.style.display = 'block';
                    if (teammatesList) {
                        teammatesList.innerHTML = '';
                        data.teammates.forEach(name => {
                            const li = document.createElement('li');
                            li.textContent = name;
                            teammatesList.appendChild(li);
                        });
                    }
                }
            } else {
                if (teammatesSection) teammatesSection.style.display = 'none';
            }

            // Reset ready button
            const readyBtn = document.getElementById('btn-ready');
            if (readyBtn) {
                readyBtn.disabled = false;
                readyBtn.textContent = "I'm Ready";
            }

            // Update ready count
            const readyCountEl = document.getElementById('ready-count');
            const readyTotalEl = document.getElementById('ready-total');
            if (readyCountEl) readyCountEl.textContent = data.readyCount || 0;
            if (readyTotalEl) readyTotalEl.textContent = data.totalPlayers || 0;

            console.log('About to show role-screen');
            this.showScreen('role-screen');
            console.log('role-screen shown successfully');
        } catch (e) {
            console.error('Error in onRoleAssigned:', e);
        }
    }

    onReadyUpdate(data) {
        document.getElementById('ready-count').textContent = data.readyCount;
        document.getElementById('ready-total').textContent = data.totalPlayers;
    }

    updateReadyStatus(playerCount, totalPlayers) {
        const readyCountEl = document.getElementById('ready-count');
        const readyTotalEl = document.getElementById('ready-total');
        
        if (readyCountEl) readyCountEl.textContent = playerCount;
        if (readyTotalEl) readyTotalEl.textContent = totalPlayers;
    }

    onPhaseStart(data) {
        try {
            console.log('onPhaseStart received:', data);
            console.log('onPhaseStart phase:', data.phase, 'type:', typeof data.phase);
            console.log('onPhaseStart phaseName:', data.phaseName);
            console.log('onPhaseStart phaseState:', data.phaseState, 'type:', typeof data.phaseState);
            console.log('onPhaseStart condition check: data.phase === 1?', data.phase === 1, 'data.phaseState?', !!data.phaseState);
            
            // Save current game state for rejoin recovery
            if (data.phaseState) {
                this.lastGameState = data.phaseState;
                this.saveSession();
            }
            
            document.getElementById('current-phase').textContent = data.phase;
            document.getElementById('phase-name').textContent = data.phaseName || '';
            
            // If player is eliminated, always show elimination screen
            if (this.isEliminated) {
                this.showEliminationScreen(this.eliminationData);
                return;
            }
            
            // Ensure phaseState has all required properties with defaults
            const phaseState = data.phaseState || {};
            phaseState.role = phaseState.role || phaseState.playerRole || this.role;
            phaseState.gameNotes = phaseState.gameNotes || [];
            // Don't default detectiveData/syndicateData to empty objects - only use if provided by server
            phaseState.round = phaseState.currentRound || phaseState.round || 1;
            phaseState.players = phaseState.players || [];
            
            console.log('onPhaseStart setting phaseState.role to:', phaseState.role);
            
            if (data.phase === 1 && phaseState) {
                console.log('onPhaseStart Phase 1 - phaseState.isHost:', phaseState.isHost);
                // Hide all phase screens using inline styles
                const phase2 = document.getElementById('phase2-screen');
                const phase3 = document.getElementById('phase3-screen');
                const phase4 = document.getElementById('phase4-screen');
                const phase5 = document.getElementById('phase5-screen');
                if (phase2) phase2.style.display = 'none';
                if (phase3) phase3.style.display = 'none';
                if (phase4) phase4.style.display = 'none';
                if (phase5) phase5.style.display = 'none';
                this.initPhase1(phaseState);
                this.showScreen('phase-screen');
            } else if (data.phase === 2) {
                // Hide other phase screens
                const phaseScreen = document.getElementById('phase-screen');
                const phase3 = document.getElementById('phase3-screen');
                const phase4 = document.getElementById('phase4-screen');
                const phase5 = document.getElementById('phase5-screen');
                if (phaseScreen) phaseScreen.style.display = 'none';
                if (phase3) phase3.style.display = 'none';
                if (phase4) phase4.style.display = 'none';
                if (phase5) phase5.style.display = 'none';
                this.initPhase2Screen(phaseState);
                const phase2 = document.getElementById('phase2-screen');
                if (phase2) phase2.style.display = 'block';
            } else if (data.phase === 3) {
                // Hide other phase screens
                const phaseScreen = document.getElementById('phase-screen');
                const phase2 = document.getElementById('phase2-screen');
                const phase4 = document.getElementById('phase4-screen');
                const phase5 = document.getElementById('phase5-screen');
                if (phaseScreen) phaseScreen.style.display = 'none';
                if (phase2) phase2.style.display = 'none';
                if (phase4) phase4.style.display = 'none';
                if (phase5) phase5.style.display = 'none';
                this.initPhase3Screen(phaseState);
                const phase3 = document.getElementById('phase3-screen');
                if (phase3) phase3.style.display = 'block';
            } else if (data.phase === 4) {
                // Hide other phase screens
                const phaseScreen = document.getElementById('phase-screen');
                const phase2 = document.getElementById('phase2-screen');
                const phase3 = document.getElementById('phase3-screen');
                const phase5 = document.getElementById('phase5-screen');
                if (phaseScreen) phaseScreen.style.display = 'none';
                if (phase2) phase2.style.display = 'none';
                if (phase3) phase3.style.display = 'none';
                if (phase5) phase5.style.display = 'none';
                this.onPhase4Start(phaseState);
            } else if (data.phase === 5) {
                // Hide other phase screens
                const phaseScreen = document.getElementById('phase-screen');
                const phase2 = document.getElementById('phase2-screen');
                const phase3 = document.getElementById('phase3-screen');
                const phase4 = document.getElementById('phase4-screen');
                if (phaseScreen) phaseScreen.style.display = 'none';
                if (phase2) phase2.style.display = 'none';
                if (phase3) phase3.style.display = 'none';
                if (phase4) phase4.style.display = 'none';
                this.onPhase5Start(phaseState);
            } else {
                console.warn('onPhaseStart: Unhandled phase or missing phaseState', data);
            }
        } catch (error) {
            console.error('CRITICAL ERROR in onPhaseStart:', error);
            console.error('Stack:', error.stack);
            console.error('data:', data);
        }
    }

    handleGameStateUpdate(gameState, eventResult) {
        console.log('handleGameStateUpdate called with gameState:', gameState);
        // Update done count if available
        if (gameState && gameState.doneCount !== undefined) {
            // Update phase 1 counter
            const countEl = document.getElementById('done-count');
            if (countEl) {
                countEl.textContent = gameState.doneCount;
            }
            // Update phase 2 counter
            const phase2CountEl = document.getElementById('phase2-ready-count');
            if (phase2CountEl) {
                phase2CountEl.textContent = gameState.doneCount;
            }
            // Update phase 3 counter
            const phase3CountEl = document.getElementById('phase3-done-count');
            if (phase3CountEl) {
                phase3CountEl.textContent = gameState.doneCount;
            }
        }
        // Update game notes if available
        if (gameState && gameState.gameNotes) {
            this.updateGameNotes(gameState.gameNotes);
        }
        // Auto-mark as done if actions are complete
        if (!this.playerDone && eventResult && eventResult.doneCount !== undefined) {
            this.checkActionsComplete();
        }
    }

    initPhase2Screen(data) {
        console.log('initPhase2Screen called with data:', data);
        
        // Store Phase 2 data for later use (needed to check if player is victim)
        this.phase2Data = data;
        this.phase2Ready = false;
        
        // Update role banner
        this.updatePhase2RoleBanner(data);
        
        // Show the murder story view
        const murderView = document.getElementById('murder-view');
        if (murderView) {
            murderView.style.display = 'block';
        }
        
        // Show special role message at top of screen (not as overlay)
        // First, remove any existing role message from a previous phase
        const existingMessage = document.getElementById('phase2-role-message');
        if (existingMessage) {
            existingMessage.remove();
        }
        
        const messageContainer = document.createElement('div');
        messageContainer.id = 'phase2-role-message';
        messageContainer.style.marginBottom = '20px';
        
        if (data.isDetective && data.detectiveData) {
            console.log(`[PHASE2] Detective detected. detectiveData:`, data.detectiveData);
            console.log(`[PHASE2] Has investigationResults: ${!!data.detectiveData.investigationResults}`);
            
            let detectiveContent = '';
            
            // Check if there are investigation results to display
            if (data.detectiveData.investigationResults) {
                const results = data.detectiveData.investigationResults;
                console.log(`[PHASE2] Displaying investigation results:`, results);
                detectiveContent += `
                    <div style="background: rgba(78, 205, 196, 0.1); border: 2px solid #4ecdc4; border-radius: 8px; padding: 15px; margin-bottom: 15px;">
                        <h3 style="color: #4ecdc4; margin-top: 0;">🔍 INVESTIGATION RESULT</h3>
                        <div style="background: rgba(78, 205, 196, 0.05); padding: 12px; border-radius: 6px; margin-bottom: 12px; border-left: 3px solid #4ecdc4;">
                            <p style="margin: 5px 0; font-size: 14px;"><strong>Target:</strong> ${results.targetName}</p>
                            <p style="margin: 5px 0; font-size: 14px;"><strong>Suspicion Level:</strong> <span style="color: #ffc107; font-weight: bold;">${results.level}</span></p>
                            ${results.reasons && results.reasons.length > 0 ? `<p style="margin: 5px 0; font-size: 12px; font-style: italic;">${results.reasons.join(', ')}</p>` : ''}
                        </div>
                        <p style="margin: 10px 0; font-size: 13px; color: #aaa; font-style: italic;">Based on voting patterns and behavior analysis</p>
                    </div>
                `;
            }
            
            // Show secret word hint if available (from Eye Witness system)
            if (data.detectiveData.secretWordKeyword) {
                detectiveContent += `
                    <div class="detective-secret-hint">
                        <div class="detective-hint-header">
                            <span>🔍</span>
                            <h3>Intelligence Report</h3>
                        </div>
                        <div class="detective-hint-content">
                            <p>The Eye Witness has been given a signal keyword:</p>
                            <p class="detective-keyword">"${this.escapeHtml(data.detectiveData.secretWordKeyword)}"</p>
                            <p class="detective-hint-instruction">${this.escapeHtml(data.detectiveData.hint || 'Watch for players who use this word or perform a related gesture during discussions.')}</p>
                        </div>
                    </div>
                `;
            }
            
            // Fallback if nothing to show
            if (!detectiveContent) {
                detectiveContent = `
                    <div style="background: rgba(78, 205, 196, 0.1); border: 2px solid #4ecdc4; border-radius: 8px; padding: 15px; margin-bottom: 15px;">
                        <h3 style="color: #4ecdc4; margin-top: 0;">🔍 DETECTIVE</h3>
                        <p style="margin: 10px 0; font-size: 14px;">Pay close attention to the discussions.</p>
                    </div>
                `;
            }
            
            messageContainer.innerHTML = detectiveContent;
        } else if (data.isAssassin && data.assassinData) {
            messageContainer.innerHTML = `
                <div style="background: rgba(233, 69, 96, 0.1); border: 2px solid #e94560; border-radius: 8px; padding: 15px; margin-bottom: 15px;">
                    <h3 style="color: #e94560; margin-top: 0;">⚠️ WARNING</h3>
                    <p style="margin: 10px 0; font-size: 14px;">${data.assassinData.warning || 'You performed the assassination. Be careful - someone may have witnessed you!'}</p>
                </div>
            `;
        } else if (data.isEyewitness && data.eyewitnessData) {
            const eyeData = data.eyewitnessData;
            let eyewitnessContent = `
                <div class="eyewitness-special-info">
                    <div class="eyewitness-header">
                        <span class="eyewitness-icon">👁️</span>
                        <h3>Eye Witness Vision</h3>
                    </div>
                    <div class="eyewitness-content">
                        <div class="assassin-reveal">
                            <p>${eyeData.message || 'You witnessed the assassination!'}</p>`;
            
            // Show assassin name if available
            if (eyeData.assassinName) {
                eyewitnessContent += `
                            <p class="assassin-name">The assassin was: <strong>${this.escapeHtml(eyeData.assassinName)}</strong></p>`;
            }
            
            eyewitnessContent += `
                        </div>`;
            
            // Show secret word if available
            if (eyeData.secretWord) {
                eyewitnessContent += `
                        <div class="secret-word-section">
                            <p class="secret-word-label">Your secret signal:</p>
                            <p class="secret-word">"${this.escapeHtml(eyeData.secretWord)}"</p>
                            <p class="secret-word-instruction">${this.escapeHtml(eyeData.instruction || 'Use this signal during discussions to communicate with the Detective!')}</p>
                        </div>`;
            }
            
            eyewitnessContent += `
                    </div>
                </div>`;
            
            messageContainer.innerHTML = eyewitnessContent;
        }
        
        // Insert message before the murder story
        const storyContainer = document.querySelector('.murder-story-container');
        if (storyContainer && messageContainer.innerHTML) {
            storyContainer.parentNode.insertBefore(messageContainer, storyContainer);
        }
        
        // Show murder story
        const storyEl = document.getElementById('murder-story');
        if (storyEl) {
            console.log('Setting murder story:', data.murderStory);
            storyEl.textContent = data.murderStory;
        } else {
            console.warn('murder-story element not found');
        }
        
        // Initialize the "I'm Ready" button for Phase 2
        this.initPhase2ReadySection(data);
        
        // Show persistent case notes for detectives
        this.showPersistentCaseNotesPanel(data);
    }

    updatePhase2RoleBanner(data) {
        const bannerName = document.getElementById('phase2-role-name');
        const bannerAction = document.getElementById('phase2-role-action');
        
        if (!bannerName || !bannerAction) return;
        
        const role = data.role || this.role;
        
        // Define role-specific messages
        const roleMessages = {
            'Syndicate': {
                emoji: '🔴',
                action: 'Select and eliminate your target during the night'
            },
            'Detective': {
                emoji: '🔍',
                action: 'Investigate one player to determine their suspicion level'
            },
            'Body Guard': {
                emoji: '🛡️',
                action: 'Protect one player from assassination'
            },
            'Eye Witness': {
                emoji: '👁️',
                action: 'You saw the assassination happen during the night'
            },
            'Bystander': {
                emoji: '👤',
                action: 'Listen and observe. You have no special action'
            }
        };
        
        const roleData = roleMessages[role] || {
            emoji: '❓',
            action: 'Unknown role'
        };
        
        bannerName.textContent = `${roleData.emoji} ${role}`;
        bannerAction.textContent = roleData.action;
    }

    updatePhaseRoleBanner(phaseId, data) {
        const bannerName = document.getElementById(`${phaseId}-role-name`);
        const bannerAction = document.getElementById(`${phaseId}-role-action`);
        
        if (!bannerName || !bannerAction) return;
        
        const role = data.role || this.role;
        
        // Define role-specific messages
        const roleMessages = {
            'Syndicate': {
                emoji: '🔴',
                action: 'Select and eliminate your target during the night'
            },
            'Detective': {
                emoji: '🔍',
                action: 'Investigate one player to determine their suspicion level'
            },
            'Body Guard': {
                emoji: '🛡️',
                action: 'Protect one player from assassination'
            },
            'Eye Witness': {
                emoji: '👁️',
                action: 'You saw the assassination happen during the night'
            },
            'Bystander': {
                emoji: '👤',
                action: 'Listen and observe. You have no special action'
            }
        };
        
        const roleData = roleMessages[role] || {
            emoji: '❓',
            action: 'Unknown role'
        };
        
        bannerName.textContent = `${roleData.emoji} ${role}`;
        bannerAction.textContent = roleData.action;
    }

    initPhase2ReadySection(data) {
        this.phase2Ready = false;
        
        // Defensive: Ensure we have valid data, not stale from previous game
        // If data is missing critical properties, reset to fresh state
        if (!data || typeof data !== 'object' || (!data.alivePlayers && !data.players)) {
            console.warn('[PHASE2] initPhase2ReadySection called with invalid data, resetting button state:', data);
            const btn = document.getElementById('btn-phase2-ready');
            if (btn) {
                btn.disabled = true;
                btn.textContent = "I'm Ready";
                btn.classList.remove('selected', 'confirmed');
            }
            return;
        }
        
        // Set total players
        const totalEl = document.getElementById('phase2-ready-total');
        const countEl = document.getElementById('phase2-ready-count');
        if (totalEl && data.alivePlayers) {
            totalEl.textContent = data.alivePlayers.length;
        }
        if (countEl) {
            countEl.textContent = data.doneCount || 0;
        }
        
        // Bind button event (remove old listener first)
        const btn = document.getElementById('btn-phase2-ready');
        if (btn) {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            newBtn.addEventListener('click', () => this.markPhase2Ready());
            
            // CRITICAL: Always start fresh on Phase 2 - button should be enabled and ready to click
            // Do NOT check data.amReady as this is only set on client-side reconnection, not on new game start
            newBtn.disabled = false;  // Enabled so player can click "I'm Ready"
            newBtn.textContent = "I'm Ready";
            document.getElementById('phase2-ready-hint').textContent = 'Click when ready to proceed to the discussion phase';
        }
    }

    markPhase2Ready() {
        if (this.phase2Ready) {
            console.warn('Already marked ready for Phase 2, ignoring duplicate click');
            return;
        }
        
        console.log('Marking player ready for Phase 2:', {
            playerName: this.playerName,
            role: this.role,
            isTestGame: this.isTestGame,
            testPlayerId: this.currentTestPlayerId,
            gameCode: this.gameCode
        });
        
        this.phase2Ready = true;
        const btn = document.getElementById('btn-phase2-ready');
        if (btn) {
            btn.disabled = true;
            btn.textContent = "✓ Ready";
            document.getElementById('phase2-ready-hint').textContent = 'Waiting for other players...';
        }
        
        // Emit player-done event to mark phase 2 completion
        this.socket.emit('game-event', {
            eventName: 'player-done'
        });
    }
    
    showEyewitnessMessage(eyeData, murderStory) {
        // Hide the main murder view
        const murderView = document.getElementById('murder-view');
        if (murderView) {
            murderView.style.display = 'none';
        }
        
        // Create overlay for eyewitness message
        let overlay = document.getElementById('eyewitness-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'eyewitness-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.9);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 1000;
            `;
            document.body.appendChild(overlay);
        }
        
        overlay.innerHTML = `
            <div style="background: #1a1a2e; border: 3px solid #e94560; padding: 30px; max-width: 600px; border-radius: 10px; color: #fff; text-align: center;">
                <h2 style="color: #e94560; font-size: 24px; margin-bottom: 20px;">🔍 YOU ARE THE EYEWITNESS 🔍</h2>
                <div style="background: rgba(233, 69, 96, 0.1); padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #e94560;">
                    <p style="font-size: 18px; margin: 10px 0;"><strong>Assassin:</strong> ${eyeData.assassinName}</p>
                    <p style="font-size: 18px; margin: 10px 0;"><strong>Victim:</strong> ${eyeData.victimName}</p>
                </div>
                <div style="background: rgba(78, 205, 196, 0.1); padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #4ecdc4;">
                    <p style="font-size: 14px; margin: 10px 0;">Your Secret Signal:</p>
                    <p style="font-size: 28px; font-weight: bold; color: #4ecdc4; margin: 10px 0;">${eyeData.keyword}</p>
                    <p style="font-size: 12px; margin-top: 10px; font-style: italic;">Use this word or gesture subtly during discussions</p>
                </div>
                <div style="background: rgba(255, 193, 7, 0.1); padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #ffc107;">
                    <p style="font-size: 14px; white-space: pre-wrap; line-height: 1.6;">${eyeData.warning}</p>
                </div>
                <button id="btn-acknowledge-eyewitness" class="btn btn-primary" style="font-size: 16px; padding: 12px 30px;">I Understand</button>
            </div>
        `;
        
        document.getElementById('btn-acknowledge-eyewitness').addEventListener('click', () => {
            overlay.remove();
            // Show the murder story with ready button
            const storyEl = document.getElementById('murder-story');
            if (storyEl) {
                storyEl.textContent = murderStory;
            }
            const murderView = document.getElementById('murder-view');
            if (murderView) {
                murderView.style.display = 'block';
            }
            this.initPhase2ReadySection(this.phase2Data);
        });
    }
    
    showDetectiveMessage(detectiveData, murderStory) {
        // Hide the main murder view
        const murderView = document.getElementById('murder-view');
        if (murderView) {
            murderView.style.display = 'none';
        }
        
        // Create overlay for detective message
        let overlay = document.getElementById('detective-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'detective-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.9);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 1000;
            `;
            document.body.appendChild(overlay);
        }
        
        overlay.innerHTML = `
            <div style="background: #1a1a2e; border: 3px solid #4ecdc4; padding: 30px; max-width: 600px; border-radius: 10px; color: #fff; text-align: center;">
                <h2 style="color: #4ecdc4; font-size: 24px; margin-bottom: 20px;">🔍 DETECTIVE'S CLUE 🔍</h2>
                <div style="background: rgba(78, 205, 196, 0.1); padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #4ecdc4;">
                    <p style="font-size: 14px; margin: 10px 0;">Listen for the signal:</p>
                    <p style="font-size: 28px; font-weight: bold; color: #4ecdc4; margin: 10px 0;">${detectiveData.keyword}</p>
                    <p style="font-size: 12px; margin-top: 10px; font-style: italic;">This word or gesture might reveal the truth</p>
                </div>
                <div style="background: rgba(78, 205, 196, 0.1); padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #4ecdc4;">
                    <p style="font-size: 14px; white-space: pre-wrap; line-height: 1.6;">${detectiveData.hint}</p>
                </div>
                <button id="btn-acknowledge-detective" class="btn btn-primary" style="font-size: 16px; padding: 12px 30px;">I Will Listen</button>
            </div>
        `;
        
        document.getElementById('btn-acknowledge-detective').addEventListener('click', () => {
            overlay.remove();
            // Show the murder story with ready button
            const storyEl = document.getElementById('murder-story');
            if (storyEl) {
                storyEl.textContent = murderStory;
            }
            const murderView = document.getElementById('murder-view');
            if (murderView) {
                murderView.style.display = 'block';
            }
            this.initPhase2ReadySection(this.phase2Data);
        });
    }
    
    showAssassinWarning(assassinData, murderStory) {
        // Hide the main murder view
        const murderView = document.getElementById('murder-view');
        if (murderView) {
            murderView.style.display = 'none';
        }
        
        // Create overlay for assassin warning
        let overlay = document.getElementById('assassin-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'assassin-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.9);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 1000;
            `;
            document.body.appendChild(overlay);
        }
        
        const warningText = assassinData && assassinData.warning ? assassinData.warning : 'You performed the assassination. Be careful - someone may have witnessed you!';
        
        overlay.innerHTML = `
            <div style="background: #1a1a2e; border: 3px solid #e94560; padding: 30px; max-width: 600px; border-radius: 10px; color: #fff; text-align: center;">
                <h2 style="color: #e94560; font-size: 28px; margin-bottom: 20px; animation: pulse 1.5s infinite;">⚠️ WARNING ⚠️</h2>
                <div style="background: rgba(233, 69, 96, 0.2); padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #e94560;">
                    <p style="font-size: 14px; white-space: pre-wrap; line-height: 1.8;">${warningText}</p>
                </div>
                <button id="btn-acknowledge-assassin" class="btn btn-danger" style="font-size: 16px; padding: 12px 30px;">I Understand the Risk</button>
            </div>
        `;
        
        document.getElementById('btn-acknowledge-assassin').addEventListener('click', () => {
            overlay.remove();
            // Show the murder story with ready button
            const storyEl = document.getElementById('murder-story');
            if (storyEl) {
                storyEl.textContent = murderStory;
            }
            const murderView = document.getElementById('murder-view');
            if (murderView) {
                murderView.style.display = 'block';
            }
            this.initPhase2ReadySection(this.phase2Data);
        });
    }

    initPhase3Screen(data) {
        console.log('initPhase3Screen called with data:', data);
        
        // Update role banner
        this.updatePhaseRoleBanner('phase3', data);
        
        document.getElementById('phase2-screen').style.display = 'none';
        document.getElementById('phase3-screen').style.display = 'block';
        
        // Reset/hide all Phase 3 special role messages
        document.getElementById('phase3-eyewitness-message').style.display = 'none';
        document.getElementById('phase3-detective-message').style.display = 'none';
        document.getElementById('phase3-assassin-message').style.display = 'none';
        
        // Hide saved message if it exists from a previous round
        const savedMsg = document.getElementById('phase3-saved-message');
        if (savedMsg) {
            savedMsg.style.display = 'none';
        }
        
        // Update status
        if (data && data.alivePlayers) {
            document.getElementById('phase3-done-total').textContent = data.alivePlayers.length;
        }
        document.getElementById('phase3-done-count').textContent = data.doneCount || 0;
        
        // Show persistent case notes for detectives
        this.showPersistentCaseNotesPanel(data);
        
        // Bind button event (remove old listener first)
        const btn = document.getElementById('btn-phase3-done');
        if (btn) {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            newBtn.addEventListener('click', () => this.markPhase3Done());
            
            // Check if already done (reconnection or switching players)
            if (data && data.amDone) {
                this.phase3Done = true;
                newBtn.disabled = true;
                newBtn.textContent = "✓ Done";
                document.getElementById('phase3-done-hint').textContent = 'Waiting for other players...';
            } else {
                this.phase3Done = false;
                newBtn.disabled = false;
                newBtn.textContent = "I'm Done";
                document.getElementById('phase3-done-hint').textContent = 'Click when ready to move to voting';
            }
        }
    }

    markPhase3Done() {
        if (this.phase3Done) {
            console.warn('Already marked done for Phase 3, ignoring duplicate click');
            return;
        }
        
        console.log('Marking player done for Phase 3:', {
            playerName: this.playerName,
            role: this.role,
            isTestGame: this.isTestGame,
            testPlayerId: this.currentTestPlayerId,
            gameCode: this.gameCode
        });
        
        this.phase3Done = true;
        const btn = document.getElementById('btn-phase3-done');
        btn.disabled = true;
        btn.textContent = "✓ Done";
        document.getElementById('phase3-done-hint').textContent = 'Waiting for other players...';
        
        const msg = {
            action: 'playerDonePhase3'
        };
        console.log('Sending Phase 3 done message:', msg);
        console.log('Is test game:', this.isTestGame);
        console.log('Current test player ID:', this.currentTestPlayerId);
        console.log('Game code:', this.gameCode);
        this.sendMessage(msg);
    }

    onPhase3DoneUpdate(data) {
        console.log('Received Phase 3 done update:', data);
        const countEl = document.getElementById('phase3-done-count');
        const totalEl = document.getElementById('phase3-done-total');
        if (countEl) countEl.textContent = data.doneCount;
        if (totalEl) totalEl.textContent = data.totalPlayers;
    }

    sendPhase3Ready() {
        this.socket.emit('player-ready', {});
    }

    // ==================== PHASE 1: DELIBERATIONS ====================

    initPhase1(state) {
        try {
            console.log('initPhase1 starting with role:', state.role);
            this.phaseState = state;
            this.role = state.role;
            
            // CRITICAL: Reset ALL client-side state for new round
            // This ensures no stale data from previous rounds affects the UI
            this.phase4Voted = false;
            this.phase5Voted = false;
            this.playerDone = false;
            
            // Clear all role-specific state from previous round
            this.syndicateState = null;
            this.syndicateIds = [];
            this.detectiveState = null;
            this.bystanderState = null;
            this.bodyGuardState = null;
            
            console.log('initPhase1: Cleared all previous round state');
            
            // Update round display
            const roundEl = document.getElementById('current-round');
            if (roundEl) {
                roundEl.textContent = state.round || 1;
            }
            
            // Set isHost if provided in state
            if (state.isHost !== undefined) {
                console.log('initPhase1: Setting isHost from state:', state.isHost);
                this.isHost = state.isHost;
            } else {
                console.log('initPhase1: isHost not in state, current isHost:', this.isHost);
            }
            
            // Set role badge
            const badge = document.getElementById('phase-role-badge');
            if (!badge) {
                console.error('phase-role-badge element not found!');
                return;
            }
            badge.textContent = state.role;
            badge.className = 'role-badge ' + state.role.toLowerCase().replace(' ', '-');

            // Hide all role views first
            const synView = document.getElementById('syndicate-view');
            const detView = document.getElementById('detective-view');
            const bysView = document.getElementById('bystander-view');
            const bgView = document.getElementById('bodyguard-view');
            
            if (synView) synView.style.display = 'none';
            if (detView) detView.style.display = 'none';
            if (bysView) bysView.style.display = 'none';
            if (bgView) bgView.style.display = 'none';

            // Update game notes
            this.updateGameNotes(state.gameNotes);

            // Show appropriate view based on role
            console.log('initPhase1: About to init role view for:', state.role);
            switch (state.role) {
                case 'Syndicate':
                    console.log('initPhase1: Calling initSyndicateView with state:', state);
                    this.initSyndicateView(state);
                    break;
                case 'Detective':
                    console.log('initPhase1: Calling initDetectiveView');
                    this.initDetectiveView(state);
                    break;
                case 'Body Guard':
                    console.log('initPhase1: Calling initBodyGuardView');
                    this.initBodyGuardView(state);
                    break;
                case 'Eye Witness':
                    console.log('initPhase1: Calling initEyeWitnessView');
                    this.initEyeWitnessView(state);
                    break;
                default: // Bystander
                    console.log('initPhase1: Calling initBystanderView');
                    this.initBystanderView(state);
                    break;
            }

            // Initialize "I'm Done" section
            console.log('initPhase1: Calling initImDoneSection');
            this.initImDoneSection(state);
            
            // Ensure "I'm Ready" button is enabled when entering Phase 1
            // This button appears in the role banner and should be clickable
            const readyBtn = document.getElementById('btn-ready');
            if (readyBtn) {
                readyBtn.disabled = false;
                readyBtn.textContent = "I'm Ready";
                console.log('initPhase1: Enabled btn-ready button');
            }
            
            // Show persistent case notes for detectives
            this.showPersistentCaseNotesPanel(state);
            
            console.log('initPhase1: completed successfully');
        } catch (error) {
            console.error('ERROR in initPhase1:', error);
            console.error('Stack:', error.stack);
        }
    }

    initImDoneSection(state) {
        this.playerDone = false;
        
        // Set total players (only count alive players)
        const alivePlayers = state.players.filter(p => p.alive !== false);
        const totalEl = document.getElementById('done-total');
        const countEl = document.getElementById('done-count');
        
        // Explicitly update counter elements
        if (totalEl) {
            totalEl.textContent = alivePlayers.length;
        }
        if (countEl) {
            countEl.textContent = state.doneCount || 0;
        }
        
        // Also update the status display
        const statusEl = document.getElementById('done-status');
        if (statusEl) {
            statusEl.innerHTML = `<span id="done-count">${state.doneCount || 0}</span>/<span id="done-total">${alivePlayers.length}</span> players ready for next phase`;
        }
        
        // Bind button event (remove old listener first)
        const btn = document.getElementById('btn-im-done');
        if (btn) {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            // Reset button state for new round
            newBtn.disabled = true; // Will be enabled by checkActionsComplete
            newBtn.textContent = "I'm Done";
            newBtn.classList.remove('selected', 'confirmed');
            
            const hintEl = document.getElementById('done-hint');
            if (hintEl) {
                hintEl.textContent = 'Complete your actions first';
            }
            
            newBtn.addEventListener('click', () => this.markDone());
            
            // Check if already done (reconnection case)
            if (state.amDone) {
                this.playerDone = true;
                newBtn.disabled = true;
                newBtn.textContent = "✓ Done";
                if (hintEl) {
                    hintEl.textContent = 'Waiting for other players...';
                }
            } else {
                this.checkActionsComplete();
            }
        }
    }

    checkActionsComplete() {
        let complete = false;
        const hint = document.getElementById('done-hint');
        const btn = document.getElementById('btn-im-done');
        
        // Safety check - if button doesn't exist, we're not on Phase 1 screen
        if (!btn) {
            console.log('checkActionsComplete: btn-im-done not found, likely not on Phase 1 screen');
            return false;
        }
        
        switch (this.role) {
            case 'Syndicate':
                // Syndicate MUST complete BOTH actions:
                // 1. Choose and lock in a target (myRecommendation)
                // 2. Choose and lock in an assassin (myAssassinVote)
                const hasTarget = this.syndicateState?.myRecommendation !== null && this.syndicateState?.myRecommendation !== undefined;
                const hasAssassin = this.syndicateState?.myAssassinVote !== null && this.syndicateState?.myAssassinVote !== undefined;
                const targetLocked = this.syndicateState?.lockedIn === true;
                const assassinLocked = this.syndicateState?.assassinLockedIn === true;
                
                // Both must be locked in
                complete = hasTarget && hasAssassin && targetLocked && assassinLocked;
                
                if (!complete && hint) {
                    if (!hasTarget) {
                        hint.textContent = 'Choose a target first';
                    } else if (!targetLocked) {
                        hint.textContent = 'Lock in your target choice';
                    } else if (!hasAssassin) {
                        hint.textContent = 'Choose an assassin';
                    } else if (!assassinLocked) {
                        hint.textContent = 'Lock in your assassin choice';
                    }
                }
                break;
                
            case 'Detective':
                // Detective is done when investigation is locked in
                complete = this.detectiveState?.lockedIn === true;
                if (!complete && hint) {
                    hint.textContent = 'Lock in your investigation to enable';
                }
                break;
                
            case 'Body Guard':
                // Body Guard is done when both protection and bystander vote are made
                const isProtecting = this.bodyGuardState?.protecting !== null && this.bodyGuardState?.protecting !== undefined;
                const hasVoted = this.bodyGuardState?.bystanderVote !== null && this.bodyGuardState?.bystanderVote !== undefined;
                complete = isProtecting && hasVoted;
                if (!complete && hint) {
                    if (!isProtecting && !hasVoted) {
                        hint.textContent = 'Choose someone to protect and make your selection';
                    } else if (!isProtecting) {
                        hint.textContent = 'Choose someone to protect';
                    } else {
                        hint.textContent = 'Make your anonymous selection';
                    }
                }
                break;
                
            default: // Bystander, Eye Witness
                // Bystander is done when they've voted
                complete = this.bystanderState?.myVote !== null && this.bystanderState?.myVote !== undefined;
                if (!complete && hint) {
                    hint.textContent = 'Make your selection to enable';
                }
                break;
        }
        
        if (complete && !this.playerDone && btn) {
            btn.disabled = false;
            if (hint) {
                hint.textContent = 'Click when you\'re ready to proceed';
            }
        }
        
        return complete;
    }

    markDone() {
        if (this.playerDone) {
            console.warn('Already marked done, ignoring duplicate click');
            return;
        }
        
        console.log('Marking player done:', {
            playerName: this.playerName,
            role: this.role,
            isTestGame: this.isTestGame,
            testPlayerId: this.currentTestPlayerId,
            gameCode: this.gameCode
        });
        
        this.playerDone = true;
        const btn = document.getElementById('btn-im-done');
        btn.disabled = true;
        btn.textContent = "✓ Done";
        document.getElementById('done-hint').textContent = 'Waiting for other players...';
        
        this.sendMessage({
            action: 'playerDone'
        });
    }

    onPlayerDoneUpdate(data) {
        console.log('Received playerDoneUpdate:', data);
        const countEl = document.getElementById('done-count');
        const totalEl = document.getElementById('done-total');
        console.log('Elements found:', { countEl, totalEl });
        if (countEl) countEl.textContent = data.doneCount;
        if (totalEl) totalEl.textContent = data.totalPlayers;
    }

    onPlayerReadyUpdate(data) {
        console.log('Received playerReadyUpdate:', data);
        const countEl = document.getElementById('phase2-ready-count');
        const totalEl = document.getElementById('phase2-ready-total');
        console.log('Phase 2 ready elements:', { countEl, totalEl });
        if (countEl) countEl.textContent = data.readyCount;
        if (totalEl) totalEl.textContent = data.totalPlayers;
    }

    onPhase2Start(data) {
        console.log('Phase 2 starting', data);
        console.log('onPhase2Start: this.isHost =', this.isHost);
        
        // If eliminated, ignore phase 2 start - stay on elimination screen
        if (this.isEliminated) {
            console.log('Player is eliminated, ignoring phase2Start');
            return;
        }
        
        document.getElementById('phase-screen').style.display = 'none';
        document.getElementById('phase2-screen').style.display = 'block';
        
        this.initPhase2Screen(data);
    }

    onPhase3Start(data) {
        console.log('Phase 3 started with data:', data);
        console.log('Data keys:', Object.keys(data));
        console.log('Phase 3 starting', data);
        console.log('Phase 3 players:', data.players);
        console.log('Phase 3 doneCount:', data.doneCount);
        this.phase3Done = false;
        
        // Check if current player is the victim (was assassinated in Phase 2)
        const myId = this.getMyPlayerId();
        if (data.victimId && myId === data.victimId && !data.victimSaved) {
            console.log('Current player is the victim. Showing elimination screen.');
            this.isEliminated = true;
            this.eliminationData = {
                verdict: 'ASSASSINATED',
                role: this.role || 'Unknown',
                playerName: this.playerName
            };
            document.getElementById('phase2-screen').style.display = 'none';
            document.getElementById('phase3-screen').style.display = 'none';
            this.showEliminationScreen(this.eliminationData);
            return;
        } else if (data.victimId && myId === data.victimId && data.victimSaved) {
            console.log('Current player was targeted but SAVED by bodyguard!');
            // Show a message that they were saved
            this.showSavedByBodyguardMessage();
        }
        
        document.getElementById('phase2-screen').style.display = 'none';
        document.getElementById('phase3-screen').style.display = 'block';
        this.initPhase3Screen(data);
        
        // Show special role messages for Phase 3
        console.log('Checking for role messages:');
        console.log('  eyewitnessData:', data.eyewitnessData);
        console.log('  detectiveData:', data.detectiveData);
        console.log('  assassinData:', data.assassinData);
        
        if (data.eyewitnessData) {
            console.log('Displaying eyewitness message');
            this.showEyewitnessMessagePhase3(data.eyewitnessData);
        }
        if (data.detectiveData) {
            console.log('Displaying detective message');
            this.showDetectiveMessagePhase3(data.detectiveData);
        }
        if (data.assassinData) {
            console.log('Displaying assassin message');
            this.showAssassinWarningPhase3(data.assassinData);
        }
    }

    showSavedByBodyguardMessage() {
        // Create or show a message that the player was saved
        const phase3Screen = document.getElementById('phase3-screen');
        let savedMsg = document.getElementById('phase3-saved-message');
        
        if (!savedMsg) {
            savedMsg = document.createElement('div');
            savedMsg.id = 'phase3-saved-message';
            savedMsg.style.cssText = 'background: rgba(78, 205, 196, 0.2); border: 2px solid #4ecdc4; border-radius: 8px; padding: 15px; margin-bottom: 15px; text-align: center;';
            savedMsg.innerHTML = `
                <h3 style="color: #4ecdc4; margin-top: 0;">🛡️ YOU WERE SAVED!</h3>
                <p style="margin: 10px 0;">Someone tried to assassinate you last night, but a mysterious guardian intervened and saved your life!</p>
                <p style="font-style: italic; color: #888;">You narrowly escaped death. Be more careful who you trust...</p>
            `;
            
            // Insert at the beginning of messages container or after phase header
            const messagesContainer = document.getElementById('phase3-messages-container');
            if (messagesContainer) {
                messagesContainer.insertBefore(savedMsg, messagesContainer.firstChild);
            } else {
                const phaseHeader = phase3Screen.querySelector('.phase-header');
                if (phaseHeader) {
                    phaseHeader.after(savedMsg);
                }
            }
        } else {
            savedMsg.style.display = 'block';
        }
    }

    showEyewitnessMessagePhase3(eyeData) {
        console.log('showEyewitnessMessagePhase3 called with:', eyeData);
        const messageDiv = document.getElementById('phase3-eyewitness-message');
        const detailsDiv = document.getElementById('eyewitness-details');
        
        if (!messageDiv) {
            console.error('phase3-eyewitness-message element not found!');
            return;
        }
        if (!detailsDiv) {
            console.error('eyewitness-details element not found!');
            return;
        }
        
        // Update header based on whether victim was saved
        const headerEl = messageDiv.querySelector('h3');
        if (headerEl) {
            headerEl.textContent = eyeData.victimSaved 
                ? '🔍 YOU WITNESSED THE ASSASSINATION ATTEMPT'
                : '🔍 YOU WITNESSED THE ASSASSINATION';
        }
        
        const victimStatus = eyeData.victimSaved ? `${eyeData.victimName} (saved!)` : eyeData.victimName;
        const assassinLabel = eyeData.victimSaved ? 'Would-be Assassin' : 'Assassin';
        const victimLabel = eyeData.victimSaved ? 'Intended Victim' : 'Victim';
        
        detailsDiv.innerHTML = `
            <strong>${assassinLabel}:</strong> ${eyeData.assassinName}<br>
            <strong>${victimLabel}:</strong> ${victimStatus}<br><br>
            <strong>Your Secret Signal:</strong> "<span style="color: #4ecdc4; font-weight: bold;">${eyeData.keyword}</span>"<br>
            <em>Use this word or gesture subtly during discussions to hint at the truth.</em>
        `;
        messageDiv.style.display = 'block';
        console.log('Eyewitness message displayed');
    }
    
    showDetectiveMessagePhase3(detectiveData) {
        console.log('showDetectiveMessagePhase3 called with:', detectiveData);
        const messageDiv = document.getElementById('phase3-detective-message');
        const detailsDiv = document.getElementById('detective-details');
        
        if (!messageDiv) {
            console.error('phase3-detective-message element not found!');
            return;
        }
        if (!detailsDiv) {
            console.error('detective-details element not found!');
            return;
        }
        
        let investigationHtml = '';
        
        // Check if there are investigation results
        if (detectiveData.investigationResults) {
            const results = detectiveData.investigationResults;
            const levelColor = results.level === 'Very Suspicious' ? '#ff6b6b' : 
                              results.level === 'Suspicious' ? '#ff9f43' : 
                              results.level === 'Moderate' ? '#ffc107' :
                              results.level === 'Low' ? '#4ecdc4' : '#888';
            
            investigationHtml = `
                <div style="background: rgba(0,0,0,0.3); border-radius: 10px; padding: 15px; margin-bottom: 15px; border-left: 4px solid ${levelColor};">
                    <h4 style="margin: 0 0 10px 0; color: #fff;">📋 Investigation Results: ${results.targetName}</h4>
                    <div style="font-size: 16px; font-weight: bold; color: ${levelColor}; margin-bottom: 10px;">
                        Suspicion Level: ${results.level}
                    </div>
                    ${results.reasons && results.reasons.length > 0 ? `
                        <ul style="margin: 5px 0 10px 20px; padding-left: 10px; color: #aaa; font-size: 13px;">
                            ${results.reasons.map(r => `<li>${r}</li>`).join('')}
                        </ul>
                    ` : ''}
                </div>
            `;
        }
        
        detailsDiv.innerHTML = `
            ${investigationHtml}
            <strong>Listen for the signal:</strong> "<span style="color: #4ecdc4; font-weight: bold;">${detectiveData.keyword || 'Pay close attention'}</span>"<br><br>
            <em>If you hear this word or see a related gesture during discussions, you may have found the Eye Witness who knows the truth about the assassination.</em>
        `;
        messageDiv.style.display = 'block';
        console.log('Detective message displayed');
    }
    
    showAssassinWarningPhase3(assassinData) {
        console.log('showAssassinWarningPhase3 called with:', assassinData);
        const messageDiv = document.getElementById('phase3-assassin-message');
        const detailsDiv = document.getElementById('assassin-details');
        
        if (!messageDiv) {
            console.error('phase3-assassin-message element not found!');
            return;
        }
        if (!detailsDiv) {
            console.error('assassin-details element not found!');
            return;
        }
        
        detailsDiv.innerHTML = `
            <strong>Someone saw you commit the assassination.</strong><br><br>
            Watch carefully during the discussion for who might be revealing your identity. Be strategic in what you say and who you accuse.
        `;
        messageDiv.style.display = 'block';
        console.log('Assassin message displayed');
    }

    // ==================== PHASE 4: VOTING ====================
    
    onPhase4Start(data) {
        console.log('Phase 4 starting', data);
        this.phase4Voted = false;
        
        // Hide all other screens
        document.getElementById('phase3-screen').style.display = 'none';
        document.getElementById('phase4-screen').style.display = 'block';
        
        this.initPhase4Screen(data);
    }
    
    initPhase4Screen(data) {
        console.log('initPhase4Screen called with data:', data);
        
        // Update role banner
        this.updatePhaseRoleBanner('phase4', data);
        
        // Build player grid for voting (alive players, excluding self)
        const grid = document.getElementById('vote-player-grid');
        grid.innerHTML = '';
        
        const myId = this.getMyPlayerId();
        const players = data.players || [];
        const hasVoted = data.amVoted || false;
        
        // Set state
        this.phase4Voted = hasVoted;
        
        players.forEach((player, index) => {
            if (!player.alive) return; // Skip dead players
            if (player.id === myId) return; // Can't vote for yourself
            
            const card = document.createElement('div');
            card.className = 'player-select-card';
            card.dataset.playerId = player.id;
            card.innerHTML = `
                <span class="player-icon">${this.getPlayerIcon(index)}</span>
                <span class="player-name">${this.escapeHtml(player.name)}</span>
            `;
            
            if (hasVoted) {
                // Already voted - disable clicking
                card.style.pointerEvents = 'none';
                card.style.opacity = '0.6';
            } else {
                card.addEventListener('click', () => this.castVote(player.id, player.name));
            }
            grid.appendChild(card);
        });
        
        // Update vote status
        document.getElementById('phase4-vote-total').textContent = (data.alivePlayers ? data.alivePlayers.length : 0) || players.filter(p => p.alive).length;
        document.getElementById('phase4-vote-count').textContent = data.voteCount || 0;
        
        // Show message if already voted
        if (hasVoted) {
            const statusEl = document.getElementById('phase4-vote-status');
            statusEl.innerHTML = `<p>✓ You have voted. Waiting for others...</p>
                <span id="phase4-vote-count">${data.voteCount || 0}</span>/<span id="phase4-vote-total">${(data.alivePlayers ? data.alivePlayers.length : 0) || 0}</span> players have voted`;
        }
        
        // Show persistent case notes for detectives
        this.showPersistentCaseNotesPanel(data);
    }
    
    castVote(playerId, playerName) {
        if (this.phase4Voted) {
            console.warn('Already voted, ignoring duplicate click');
            return;
        }
        
        console.log('Casting vote for:', playerId, playerName);
        this.phase4Voted = true;
        
        // Highlight selected player
        const cards = document.querySelectorAll('#vote-player-grid .player-select-card');
        cards.forEach(card => {
            card.classList.remove('selected');
            if (card.dataset.playerId === playerId) {
                card.classList.add('selected');
            }
            card.style.pointerEvents = 'none'; // Disable further clicks
        });
        
        this.sendMessage({
            action: 'castVote',
            targetId: playerId
        });
    }
    
    onPhase4VoteUpdate(data) {
        console.log('Received Phase 4 vote update:', data);
        const countEl = document.getElementById('phase4-vote-count');
        const totalEl = document.getElementById('phase4-vote-total');
        if (countEl) countEl.textContent = data.voteCount;
        if (totalEl) totalEl.textContent = data.totalPlayers;
    }

    // ==================== PHASE 5: TRIAL ====================
    
    onPhase5Start(data) {
        console.log('Phase 5 starting', data);
        this.phase5Voted = false;
        
        // Hide all other screens
        document.getElementById('phase4-screen').style.display = 'none';
        document.getElementById('phase5-screen').style.display = 'block';
        
        this.initPhase5Screen(data);
    }
    
    initPhase5Screen(data) {
        console.log('initPhase5Screen called with data:', data);
        
        // Update role banner
        this.updatePhaseRoleBanner('phase5', data);
        
        const hasVoted = data.amVoted || false;
        this.phase5Voted = hasVoted;
        
        // Show accused player info
        const accusedInfo = document.getElementById('accused-player-info');
        accusedInfo.innerHTML = `<h2>👤 ${data.accusedName}</h2>`;
        
        // Update vote counts
        document.getElementById('guilty-count').textContent = data.guiltyCount || 0;
        document.getElementById('not-guilty-count').textContent = data.notGuiltyCount || 0;
        
        // Bind buttons (remove old listeners)
        const guiltyBtn = document.getElementById('btn-guilty');
        const notGuiltyBtn = document.getElementById('btn-not-guilty');
        
        const newGuiltyBtn = guiltyBtn.cloneNode(true);
        guiltyBtn.parentNode.replaceChild(newGuiltyBtn, guiltyBtn);
        
        const newNotGuiltyBtn = notGuiltyBtn.cloneNode(true);
        notGuiltyBtn.parentNode.replaceChild(newNotGuiltyBtn, notGuiltyBtn);
        
        newGuiltyBtn.addEventListener('click', () => this.castTrialVote('guilty'));
        newNotGuiltyBtn.addEventListener('click', () => this.castTrialVote('not-guilty'));
        
        // Check if already voted or reset
        if (hasVoted) {
            newGuiltyBtn.disabled = true;
            newNotGuiltyBtn.disabled = true;
        } else {
            newGuiltyBtn.disabled = false;
            newNotGuiltyBtn.disabled = false;
            // Remove any selected class
            newGuiltyBtn.classList.remove('selected');
            newNotGuiltyBtn.classList.remove('selected');
        }
        
        // Show persistent case notes for detectives
        this.showPersistentCaseNotesPanel(data);
    }
    
    castTrialVote(vote) {
        if (this.phase5Voted) {
            console.warn('Already voted in trial, ignoring duplicate click');
            return;
        }
        
        console.log('Casting trial vote:', vote);
        this.phase5Voted = true;
        
        // Disable buttons
        document.getElementById('btn-guilty').disabled = true;
        document.getElementById('btn-not-guilty').disabled = true;
        
        // Highlight chosen option
        if (vote === 'guilty') {
            document.getElementById('btn-guilty').classList.add('selected');
        } else {
            document.getElementById('btn-not-guilty').classList.add('selected');
        }
        
        this.sendMessage({
            action: 'trialVote',
            vote: vote
        });
    }
    
    onPhase5VoteUpdate(data) {
        console.log('Received Phase 5 vote update:', data);
        document.getElementById('guilty-count').textContent = data.guiltyCount || 0;
        document.getElementById('not-guilty-count').textContent = data.notGuiltyCount || 0;
    }

    displayVerdictScreen(data) {
        console.log('Displaying verdict screen with data:', data);
        
        // Always set up the listener so counter updates show for all players
        // This needs to happen regardless of elimination status
        this.setupVerdictReadyListener();
        
        // If player is eliminated, don't show verdict screen - show elimination screen instead
        if (this.isEliminated) {
            console.log('Player is eliminated - not showing verdict screen');
            return;
        }
        
        // Hide phase 5 screen and show verdict screen
        const phase5Screen = document.getElementById('phase5-screen');
        const verdictScreen = document.getElementById('verdict-result-screen');
        
        if (phase5Screen) phase5Screen.style.display = 'none';
        if (verdictScreen) verdictScreen.style.display = 'block';
        
        // Store verdict ready state for this player
        this.verdictReady = false;
        
        // Update verdict screen with data from server
        document.getElementById('verdict-accused-name').textContent = data.accusedName || 'Unknown Player';
        document.getElementById('verdict-guilty-count').textContent = data.guiltyCount || 0;
        document.getElementById('verdict-not-guilty-count').textContent = data.notGuiltyCount || 0;
        
        // Determine verdict outcome
        const guiltyCount = data.guiltyCount || 0;
        const notGuiltyCount = data.notGuiltyCount || 0;
        const totalVotes = guiltyCount + notGuiltyCount;
        const isGuilty = guiltyCount > notGuiltyCount;
        
        const verdictOutcomeEl = document.getElementById('verdict-outcome');
        const verdictMessageEl = document.getElementById('verdict-message');
        
        if (isGuilty) {
            verdictOutcomeEl.textContent = '🔴 GUILTY - Player Eliminated';
            verdictOutcomeEl.style.color = '#e94560';
            verdictMessageEl.textContent = `${data.accusedName} has been found guilty by a vote of ${guiltyCount} to ${notGuiltyCount} and has been imprisoned.`;
        } else {
            verdictOutcomeEl.textContent = '🟢 NOT GUILTY - Player Acquitted';
            verdictOutcomeEl.style.color = '#4ecdc4';
            verdictMessageEl.textContent = `${data.accusedName} has been found not guilty by a vote of ${notGuiltyCount} to ${guiltyCount} and remains in the game.`;
        }
        
        // Update player ready count
        document.getElementById('verdict-ready-count').textContent = '0';
        document.getElementById('verdict-ready-total').textContent = data.totalPlayers || '0';
        
        // Setup "I Understand" button
        const verdictReadyBtn = document.getElementById('btn-verdict-ready');
        console.log('verdictReadyBtn element found:', !!verdictReadyBtn);
        console.log('verdictReadyBtn element details:', verdictReadyBtn);
        
        if (verdictReadyBtn) {
            console.log('Button initial disabled state:', verdictReadyBtn.disabled);
            
            // Remove any existing click handlers by cloning
            const newBtn = verdictReadyBtn.cloneNode(true);
            console.log('Button cloned');
            
            // Replace in DOM
            verdictReadyBtn.parentNode.replaceChild(newBtn, verdictReadyBtn);
            console.log('Button replaced in DOM');
            
            // EXPLICITLY enable the button
            newBtn.disabled = false;
            console.log('Button disabled property set to:', newBtn.disabled);
            
            // Remove any disabled HTML attribute
            newBtn.removeAttribute('disabled');
            console.log('Button disabled HTML attribute removed');
            
            // Verify button is enabled
            const actualDisabledState = newBtn.getAttribute('disabled');
            console.log('Button disabled HTML attribute after removal:', actualDisabledState);
            
            // Add new click handler with explicit logging
            newBtn.addEventListener('click', (e) => {
                console.log('============ BUTTON CLICK EVENT FIRED ============');
                console.log('Event:', e);
                console.log('Button clicked! Calling handleVerdictReady()');
                this.handleVerdictReady();
            });
            
            // Test that click handler works
            console.log('Button click handler attached successfully');
            console.log('Button element after setup:', newBtn);
            console.log('Button is now ready for clicks');
        } else {
            console.error('ERROR: Could not find verdict-ready button element with ID btn-verdict-ready');
        }
    }

    handleVerdictReady() {
        console.log('handleVerdictReady called. verdictReady=', this.verdictReady);
        
        if (this.verdictReady) {
            console.warn('Already marked as ready for verdict');
            return;
        }
        
        console.log('Player clicked I Understand button');
        this.verdictReady = true;
        
        // Disable button and update text
        const btn = document.getElementById('btn-verdict-ready');
        console.log('Button element for disabling:', btn);
        if (btn) {
            btn.disabled = true;
            btn.textContent = '✓ Understood';
            console.log('Button disabled and text updated');
        }
        
        // Send verdict-ready message to server
        console.log('Sending verdictReady action to server');
        this.sendMessage({
            action: 'verdictReady'
        });
        console.log('Message sent');
    }

    setupVerdictReadyListener() {
        console.log('Setting up verdict-ready-count listener');
        
        // Listen for verdict-ready-count updates from server
        if (this.verdictReadyListener) {
            console.log('Removing old verdict-ready-count listener');
            this.socket.removeListener('verdict-ready-count', this.verdictReadyListener);
        }
        
        this.verdictReadyListener = (data) => {
            console.log('============ VERDICT-READY-COUNT RECEIVED ============');
            console.log('Data from server:', data);
            console.log('Ready count:', data.readyCount, 'Total players:', data.totalPlayers);
            
            const countEl = document.getElementById('verdict-ready-count');
            console.log('verdict-ready-count element:', countEl);
            
            if (countEl) {
                countEl.textContent = data.readyCount || 0;
                console.log('Updated counter text to:', data.readyCount || 0);
            } else {
                console.error('ERROR: Could not find verdict-ready-count element');
            }
            
            // Check if all players are ready
            if (data.readyCount >= data.totalPlayers) {
                console.log('All players ready! Server should advance phase');
            }
        };
        
        this.socket.on('verdict-ready-count', this.verdictReadyListener);
        console.log('verdict-ready-count listener attached');
    }
    
    onPlayerEliminated(data) {
        console.log('Player eliminated:', data);
        
        const myId = this.getMyPlayerId();
        
        // Only mark as eliminated if verdict is GUILTY
        if (data.verdict === 'GUILTY') {
            // Check if this is the current player
            if (data.playerId === myId) {
                // Mark as eliminated and store the data
                this.isEliminated = true;
                this.eliminationData = data;
                
                // Show elimination screen for this player
                this.showEliminationScreen(data);
            } else {
                // For other players, just track it
                // They will see it in the next phase
                console.log(`${data.playerName} has been eliminated.`);
            }
        }
    }
    
    onTrialVerdict(data) {
        // Player was found NOT GUILTY - they remain in the game
        console.log(`Trial verdict: ${data.playerName} found ${data.verdict}`);
        
        if (data.verdict === 'NOT GUILTY') {
            // Show a message to all players about the not guilty verdict
            this.showNotification(`⚖️ ${data.playerName} has been found NOT GUILTY and remains in the game!`, 'info');
            
            // Show a brief overlay message
            this.showVerdictOverlay(data.playerName, 'NOT GUILTY');
        }
        // Game will continue to next round via onNextRoundStart
    }
    
    showVerdictOverlay(playerName, verdict) {
        // Create an overlay to show the verdict
        const overlay = document.createElement('div');
        overlay.id = 'verdict-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.9);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            animation: fadeIn 0.3s ease;
        `;
        
        const isGuilty = verdict === 'GUILTY';
        const icon = isGuilty ? '⚖️' : '🔓';
        const color = isGuilty ? '#e94560' : '#4ecdc4';
        
        overlay.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <div style="font-size: 80px; margin-bottom: 20px;">${icon}</div>
                <h1 style="color: ${color}; font-size: 2.5rem; margin-bottom: 20px; font-family: 'Cinzel', serif;">
                    ${verdict}
                </h1>
                <p style="font-size: 1.5rem; color: #f5f5f5; margin-bottom: 10px;">
                    ${this.escapeHtml(playerName)}
                </p>
                <p style="font-size: 1.1rem; color: #888;">
                    ${isGuilty ? 'has been found guilty and removed from the game' : 'has been found innocent and remains in the game'}
                </p>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        // Remove after 3 seconds
        setTimeout(() => {
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.5s ease';
            setTimeout(() => {
                if (overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
            }, 500);
        }, 3000);
    }
    
    showEliminationScreen(data) {
        // Hide all game screens
        document.querySelectorAll('.screen').forEach(screen => {
            screen.style.display = 'none';
        });
        
        document.getElementById('eliminated-screen').style.display = 'block';
        
        // Set the title and reason based on verdict
        const title = document.getElementById('eliminated-title');
        const reason = document.getElementById('eliminated-reason');
        const roleEl = document.getElementById('eliminated-role');
        
        if (data.verdict === 'GUILTY') {
            title.textContent = '⚖️ You Have Been Found Guilty';
            reason.textContent = 'You have been imprisoned and removed from the game.';
        } else if (data.verdict === 'ASSASSINATED') {
            title.textContent = '🔪 You Have Been Assassinated';
            reason.textContent = 'You did not survive the night.';
        }
        
        roleEl.textContent = data.role;
    }

    handleGameEnded(data) {
        console.log('[GAME-ENDED] Game ended event:', data);
        
        // Clear session since game is over
        this.clearSession();
        
        // Hide all game screens
        document.querySelectorAll('.screen').forEach(screen => {
            screen.style.display = 'none';
        });
        
        // Create or show results screen
        console.log('[GAME-ENDED] Looking for existing results-screen');
        let resultsScreen = document.getElementById('results-screen');
        if (!resultsScreen) {
            console.log('[GAME-ENDED] No existing results screen, creating one');
            this.createResultsScreen();
            resultsScreen = document.getElementById('results-screen');
            console.log('[GAME-ENDED] Created results screen, element:', resultsScreen);
        } else {
            console.log('[GAME-ENDED] Using existing results screen');
        }
        
        resultsScreen.style.display = 'block';
        resultsScreen.style.zIndex = '9999';
        
        // Update results content
        const resultsTitle = document.getElementById('results-title');
        const resultsBanner = document.getElementById('results-banner');
        const resultsDetails = document.getElementById('results-details');
        const playersTableContainer = document.getElementById('players-table-container');
        
        const isSyndicateWin = data.winner === 'syndicate';
        
        if (isSyndicateWin) {
            resultsTitle.textContent = '👹 SYNDICATE WINS';
            resultsBanner.classList.remove('syndicate-loss');
            resultsBanner.classList.add('syndicate-win');
            resultsBanner.innerHTML = '🏆 The Syndicate has taken control!';
            
            const message = data.winType === 'VOTE_CONTROL' 
                ? `The Syndicate has achieved vote control with ${data.details.syndicatesLeft} members remaining.`
                : 'The Syndicate has won!';
            resultsDetails.innerHTML = `
                <p style="font-size: 1.1rem; margin-bottom: 15px;">${message}</p>
                <div class="results-stats">
                    <div class="stat-item">
                        <span class="stat-label">Syndicates Remaining</span>
                        <span class="stat-value">${data.details.syndicatesLeft}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Innocents Remaining</span>
                        <span class="stat-value">${data.details.innocentLeft}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Final Round</span>
                        <span class="stat-value">${data.finalRound}</span>
                    </div>
                </div>
                <p style="margin-top: 20px; color: var(--text-muted);">Your Role: <strong>${data.playerRole}</strong></p>
            `;
        } else {
            resultsTitle.textContent = '🎉 INNOCENTS WIN';
            resultsBanner.classList.remove('syndicate-win');
            resultsBanner.classList.add('syndicate-loss');
            resultsBanner.innerHTML = '🏆 The Syndicate has been eliminated!';
            
            resultsDetails.innerHTML = `
                <p style="font-size: 1.1rem; margin-bottom: 15px;">All syndicate members have been eliminated!</p>
                <div class="results-stats">
                    <div class="stat-item">
                        <span class="stat-label">Syndicates Eliminated</span>
                        <span class="stat-value">${data.details.syndicatesLeft}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Innocents Surviving</span>
                        <span class="stat-value">${data.details.innocentLeft}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Final Round</span>
                        <span class="stat-value">${data.finalRound}</span>
                    </div>
                </div>
                <p style="margin-top: 20px; color: var(--text-muted);">Your Role: <strong>${data.playerRole}</strong></p>
            `;
        }
        
        // Build and display player stats table
        if (data.allPlayers && data.allPlayers.length > 0) {
            this.buildPlayersTable(playersTableContainer, data.allPlayers, data.playerRole, data.playerSuspicionLevels, data.votingHistory);
        }
    }

    buildPlayersTable(container, allPlayers, playerRole, playerSuspicionLevels = {}, votingHistory = {}) {
        // Use the votingHistory passed from server, or fallback to this.votingHistory
        const history = Object.keys(votingHistory).length > 0 ? votingHistory : this.votingHistory;
        
        // Count number of rounds from voting history
        let maxRounds = 0;
        Object.values(history).forEach(playerHistory => {
            if (playerHistory.roundVotes) {
                const rounds = Object.keys(playerHistory.roundVotes).map(Number);
                const maxRound = Math.max(...rounds);
                if (maxRound > maxRounds) {
                    maxRounds = maxRound;
                }
            }
        });
        maxRounds = Math.max(maxRounds, 1); // At least 1 round

        // Build per-round data structure to show who was most accused in each round
        const roundData = {};
        for (let round = 1; round <= maxRounds; round++) {
            roundData[round] = {
                accused: null,
                accusationCount: {},
                mostAccused: null
            };
        }

        // Count accusations per round to find most accused
        Object.entries(history).forEach(([playerToken, playerHistory]) => {
            if (playerHistory.roundVotes) {
                Object.entries(playerHistory.roundVotes).forEach(([round, voteData]) => {
                    const roundNum = Number(round);
                    if (voteData.accused) {
                        if (!roundData[roundNum].accusationCount[voteData.accused]) {
                            roundData[roundNum].accusationCount[voteData.accused] = 0;
                        }
                        roundData[roundNum].accusationCount[voteData.accused]++;
                    }
                });
            }
        });

        // Find most accused for each round
        Object.entries(roundData).forEach(([round, data]) => {
            let maxVotes = 0;
            let mostAccused = null;
            Object.entries(data.accusationCount).forEach(([token, count]) => {
                if (count > maxVotes) {
                    maxVotes = count;
                    mostAccused = token;
                }
            });
            data.mostAccused = mostAccused;
        });

        // Build player stats
        const playerStats = allPlayers.map(player => {
            const playerHistory = history[player.token] || { roundVotes: {} };
            
            // Build data for each round
            const roundCells = [];
            for (let round = 1; round <= maxRounds; round++) {
                const voteData = playerHistory.roundVotes[round] || {};
                const accused = voteData.accused;
                const verdict = voteData.verdict;
                const mostAccused = roundData[round].mostAccused;
                
                // Determine who was accused and how they voted
                const accusedPlayer = accused ? allPlayers.find(p => p.token === accused) : null;
                const accusedName = accusedPlayer ? accusedPlayer.name : '-';
                
                // Build display text showing both accused and verdict
                let verdictText = '';
                let verdictColor = '';
                let verdictBg = '';
                if (verdict === 'guilty') {
                    verdictText = 'Guilty';
                    verdictColor = '#4ade80';
                    verdictBg = '#2d5a2d';
                } else if (verdict === 'not guilty') {
                    verdictText = 'Not Guilty';
                    verdictColor = '#ff6b6b';
                    verdictBg = '#5a2d2d';
                } else {
                    verdictText = 'Abstain';
                    verdictColor = '#999';
                    verdictBg = '#3a3a3a';
                }
                
                roundCells.push({
                    accused: accusedName,
                    verdict: verdictText,
                    verdictBg: verdictBg,
                    verdictColor: verdictColor,
                    display: accusedName,
                    displayWithVerdict: verdictText
                });
            }
            
            // Get suspicion level from server
            let suspicionLevel = 'low';
            let suspicionDisplay = 'Low';
            let suspicionScore = 0;
            if (playerSuspicionLevels && playerSuspicionLevels[player.token]) {
                const serverSuspicion = playerSuspicionLevels[player.token];
                suspicionDisplay = serverSuspicion.level;
                suspicionScore = serverSuspicion.score;
                
                // Convert server level names to CSS class names
                if (serverSuspicion.level === 'Very Suspicious') {
                    suspicionLevel = 'very-suspicious';
                } else if (serverSuspicion.level === 'Suspicious') {
                    suspicionLevel = 'suspicious';
                } else if (serverSuspicion.level === 'Moderate') {
                    suspicionLevel = 'moderate';
                } else if (serverSuspicion.level === 'Low') {
                    suspicionLevel = 'low-suspicion';
                } else {
                    suspicionLevel = 'clear';
                }
            }
            
            return {
                token: player.token,
                name: player.name,
                role: player.role || 'Hidden',
                alive: player.alive,
                roundCells: roundCells,
                suspicionLevel: suspicionLevel,
                suspicionDisplay: suspicionDisplay,
                suspicionScore: suspicionScore
            };
        });

        // Sort by name
        playerStats.sort((a, b) => a.name.localeCompare(b.name));

        // Build table headers with rounds
        const roundHeaders = [];
        for (let i = 1; i <= maxRounds; i++) {
            roundHeaders.push(`<th style="text-align: center; font-size: 0.9em;"><div style="min-width: 140px;">Round ${i}</div><div style="font-size: 0.75em; font-weight: normal; color: var(--text-muted);">Accused | Vote</div></th>`);
        }

        const tableHTML = `
            <div class="players-stats-section">
                <h3 style="margin-bottom: 15px;">📊 Final Results</h3>
                <div class="table-wrapper">
                    <table class="players-stats-table">
                        <thead>
                            <tr>
                                <th>Player</th>
                                <th>Role</th>
                                <th>Status</th>
                                ${roundHeaders.join('')}
                                <th style="min-width: 160px;">Suspicion Level</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${playerStats.map(player => `
                                <tr class="${player.alive ? '' : 'eliminated'}">
                                    <td class="player-name"><strong>${player.name}</strong></td>
                                    <td class="player-role">
                                        <span class="role-badge ${player.role === 'Syndicate' ? 'syndicate' : 'innocent'}">
                                            ${player.role}
                                        </span>
                                    </td>
                                    <td class="status-cell">
                                        <span class="status-badge ${player.alive ? 'alive' : 'dead'}">
                                            ${player.alive ? 'Alive' : 'Out'}
                                        </span>
                                    </td>
                                    ${player.roundCells.map(cell => `
                                        <td class="round-data" style="text-align: center; padding: 8px; font-size: 0.85em;">
                                            <div style="display: flex; gap: 4px; justify-content: center; align-items: center; flex-wrap: wrap; flex-direction: column;">
                                                <div style="background: #4a5f8f; color: white; padding: 6px 8px; border-radius: 4px; font-size: 0.8em; white-space: nowrap; font-weight: 500;">📍 ${cell.display}</div>
                                                <div style="background: ${cell.verdictBg}; color: ${cell.verdictColor}; padding: 6px 8px; border-radius: 4px; font-weight: bold; font-size: 0.75em; white-space: nowrap;">✓ ${cell.verdict}</div>
                                            </div>
                                        </td>
                                    `).join('')}
                                    <td class="suspicion-cell" style="min-width: 160px;">
                                        <div style="display: flex; flex-direction: column; gap: 4px;">
                                            <span class="suspicion-level ${player.suspicionLevel}" style="padding: 6px 8px; border-radius: 4px; font-weight: 600; text-align: center;">${player.suspicionDisplay}</span>
                                            <span style="font-size: 0.75em; color: var(--text-muted);">Score: ${player.suspicionScore}%</span>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        
        container.innerHTML = tableHTML;
    }

    createResultsScreen() {
        console.log('[CREATE-RESULTS] Creating results screen');
        const screen = document.createElement('div');
        screen.id = 'results-screen';
        screen.className = 'screen';
        screen.style.cssText = `
            display: block;
            min-height: 100vh;
            background: var(--dark-bg);
            background-image: 
                radial-gradient(ellipse at top, rgba(212, 175, 55, 0.1) 0%, transparent 50%),
                radial-gradient(ellipse at bottom, rgba(139, 0, 0, 0.1) 0%, transparent 50%);
            padding: 40px 20px;
            overflow-y: auto;
            z-index: 1000;
        `;
        
        screen.innerHTML = `
            <div style="max-width: 800px; margin: 0 auto;">
                <div class="results-container">
                    <div id="results-banner" class="results-banner" style="margin-bottom: 30px;">
                        Game Results
                    </div>
                    
                    <h1 id="results-title" class="results-title" style="margin-bottom: 30px; text-align: center;">
                        Game Results
                    </h1>
                    
                    <div id="results-details" class="results-details" style="margin-bottom: 40px;"></div>
                    
                    <div id="players-table-container" class="players-table-container"></div>
                    
                    <div class="results-actions" style="margin-top: 40px; text-align: center;">
                        <div id="play-again-host-only" style="display: none;">
                            <button id="btn-play-again" class="btn btn-primary" style="padding: 12px 30px; font-size: 1rem; background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%); color: var(--primary-gold); border: 2px solid var(--primary-gold); border-radius: 6px; cursor: pointer; transition: all 0.3s ease; font-weight: 600; display: block; margin: 0 auto;">Play Again</button>
                            <p id="play-again-status" style="margin-top: 15px; color: var(--text-muted); font-size: 0.9rem;"></p>
                        </div>
                        <div id="waiting-for-host" style="display: none;">
                            <p style="color: var(--text-muted); font-size: 1rem;">Waiting for host to start new game...</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        const container = document.querySelector('.container');
        if (container) {
            console.log('[CREATE-RESULTS] Appending to .container');
            container.appendChild(screen);
        } else {
            console.log('[CREATE-RESULTS] No .container found, appending to body');
            document.body.appendChild(screen);
        }
        
        // Bind play again button - only for host
        console.log('[CREATE-RESULTS] isHost:', this.isHost);
        const playAgainHostOnly = document.getElementById('play-again-host-only');
        const waitingForHost = document.getElementById('waiting-for-host');
        
        if (this.isHost) {
            console.log('[CREATE-RESULTS] Host detected - showing Play Again button');
            playAgainHostOnly.style.display = 'block';
            waitingForHost.style.display = 'none';
            
            // Use event delegation on the container
            const container = document.querySelector('.container');
            const self = this;
            
            const delegateListener = function(e) {
                const btn = e.target.closest('#btn-play-again');
                if (btn) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[PLAY-AGAIN-BTN] ========== CLICK FIRED VIA DELEGATION ==========');
                    self.playAgain();
                    return false;
                }
            };
            
            if (container) {
                console.log('[CREATE-RESULTS] Attaching event delegation listener to container');
                container.addEventListener('click', delegateListener, true); // Use capture phase
                console.log('[CREATE-RESULTS] Event delegation listener attached');
            } else {
                console.warn('[CREATE-RESULTS] No container found for event delegation');
            }
        } else {
            console.log('[CREATE-RESULTS] Non-host player - showing waiting message');
            playAgainHostOnly.style.display = 'none';
            waitingForHost.style.display = 'block';
        }
    }
    
    playAgain() {
        console.log('[PLAY-AGAIN] Emitting play-again event');
        if (this.socket && this.socket.connected && this.gameCode) {
            this.socket.emit('play-again', { gameCode: this.gameCode });
        }
    }
    
    onNextRoundStart(data) {
        console.log('Next round starting', data);
        
        // If player is eliminated, don't transition - they stay on elimination screen
        if (this.isEliminated) {
            console.log('Player is eliminated, staying on elimination screen');
            return;
        }
        
        // Reset state for new round
        this.playerDone = false;
        this.phase3Done = false;
        this.phase4Voted = false;
        this.phase5Voted = false;
        
        // Hide eliminated screen if showing
        document.getElementById('eliminated-screen').style.display = 'none';
        
        // Hide all phase screens
        document.getElementById('phase5-screen').style.display = 'none';
        document.getElementById('phase4-screen').style.display = 'none';
        document.getElementById('phase3-screen').style.display = 'none';
        document.getElementById('phase2-screen').style.display = 'none';
        document.getElementById('phase-screen').style.display = 'block';
        
        // Initialize Phase 1
        this.initPhase1(data.phaseState);
    }

    onGameEnd(data) {
        console.log('Game has ended', data);
        
        // Hide all game phase screens
        document.getElementById('phase-screen').style.display = 'none';
        document.getElementById('phase2-screen').style.display = 'none';
        document.getElementById('phase3-screen').style.display = 'none';
        document.getElementById('phase4-screen').style.display = 'none';
        document.getElementById('phase5-screen').style.display = 'none';
        document.getElementById('eliminated-screen').style.display = 'none';
        
        // Show game over screen
        const gameOverScreen = document.getElementById('game-over-screen');
        gameOverScreen.style.display = 'flex';
        
        // Update winner title (the h3 element)
        const winnerTitle = document.getElementById('game-over-winner');
        const winnerColor = data.winner === 'Syndicate' ? '#ff6b6b' : '#4ecdc4';
        if (data.winner === 'Syndicate') {
            winnerTitle.innerHTML = `<span style="color: ${winnerColor}">🔪 The Syndicate Wins!</span>`;
        } else {
            winnerTitle.innerHTML = `<span style="color: ${winnerColor}">🎉 The Innocents Win!</span>`;
        }
        
        // Update results message
        const resultMessage = document.querySelector('.game-over-message');
        resultMessage.textContent = data.message || '';
        
        // Show your role
        const roleReveal = document.getElementById('your-role-reveal');
        if (roleReveal) {
            roleReveal.textContent = this.role || 'Unknown';
        }
        
        // Build player results table
        this.buildPlayerResultsTable(data.playerResults || []);
        
        // Show/hide Play Again button based on host status
        const playAgainBtn = document.getElementById('btn-play-again');
        if (playAgainBtn) {
            if (this.isHost) {
                playAgainBtn.style.display = 'inline-block';
                // Remove old listener and add new one
                const newBtn = playAgainBtn.cloneNode(true);
                playAgainBtn.parentNode.replaceChild(newBtn, playAgainBtn);
                newBtn.addEventListener('click', () => this.playAgain());
            } else {
                playAgainBtn.style.display = 'none';
            }
        }
    }
    
    buildPlayerResultsTable(playerResults) {
        const tbody = document.getElementById('player-results-body');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        playerResults.forEach(player => {
            const row = document.createElement('tr');
            
            // Determine role class for styling
            const roleClass = player.role === 'Syndicate' ? 'role-syndicate' : 'role-innocent';
            const statusClass = player.alive ? 'status-alive' : 'status-dead';
            const statusText = player.alive ? 'Alive' : 'Eliminated';
            
            // Determine suspicion class
            let suspicionClass = 'suspicion-na';
            if (player.suspicion === 'Very Suspicious') {
                suspicionClass = 'suspicion-very-high';
            } else if (player.suspicion === 'Suspicious') {
                suspicionClass = 'suspicion-high';
            } else if (player.suspicion === 'Moderate') {
                suspicionClass = 'suspicion-medium';
            } else if (player.suspicion === 'Low') {
                suspicionClass = 'suspicion-low';
            } else if (player.suspicion === 'Clear') {
                suspicionClass = 'suspicion-clear';
            }
            
            row.innerHTML = `
                <td>${this.escapeHtml(player.name)}</td>
                <td class="${roleClass}">${player.role}</td>
                <td class="${statusClass}">${statusText}</td>
                <td class="${suspicionClass}">${player.suspicion}</td>
            `;
            
            tbody.appendChild(row);
        });
    }
    
    handlePlayAgainLobby(data) {
        console.log('[PLAY-AGAIN-LOBBY] Received new game:', data);
        
        // The playerToken may have been cleared by handleGameEnded, 
        // but we still have it from the server event - recover from session or use the token we remember
        // The server is sending us the same token back (it's identifying us by it)
        // so we know we're the right player
        
        // Recover playerToken from session storage before we lost it
        const savedSession = this.getSessionData();
        if (savedSession) {
            try {
                const session = JSON.parse(savedSession);
                if (session.playerToken && !this.playerToken) {
                    console.log('[PLAY-AGAIN-LOBBY] Recovering playerToken from cleared session:', session.playerToken);
                    this.playerToken = session.playerToken;
                }
            } catch (e) {
                console.error('[PLAY-AGAIN-LOBBY] Error recovering playerToken:', e);
            }
        }
        
        // Update to new game - KEEP the playerToken!
        this.gameCode = data.gameCode;
        this.isHost = data.isHost;
        this.isReady = false;
        
        console.log('[PLAY-AGAIN-LOBBY] Using playerToken:', this.playerToken, 'for new game:', this.gameCode);
        
        // CRITICAL: Clear ALL game-specific state for new game
        // This includes all phase states and ready flags
        this.isEliminated = false;
        this.eliminationData = null;
        this.phase2Data = null;  // Clear Phase 2 data to prevent state carryover
        this.phase3Done = false;
        this.phase4Voted = false;
        this.phase5Voted = false;
        this.phase2Ready = false;  // Reset Phase 2 ready flag
        this.verdictReady = false; // Reset verdict ready flag
        this.startGameInProgress = false;
        this.syndicateState = null;
        this.detectiveState = null;
        this.bystanderState = null;
        this.bodyGuardState = null;
        this.playerDone = false;
        this.caseNotes = {};
        this.selectedCaseNotesPlayer = null;
        this.role = null;
        this.playerRole = null;
        this.votingHistory = {};
        this.lastGameState = null;
        this.phaseState = null;
        this.caseNotesEventsBound = false;  // Reset case notes event binding flag
        
        // Save session with new game code and preserved playerToken
        this.saveSession();
        
        // Hide ALL game screens to prevent any DOM state carryover
        document.querySelectorAll('.screen').forEach(screen => {
            screen.style.display = 'none';
        });
        
        // Explicitly hide phase screens
        const phaseScreens = [
            'phase-screen',
            'phase2-screen', 
            'phase3-screen',
            'phase4-screen',
            'phase5-screen',
            'role-screen',
            'eliminated-screen',
            'results-screen'
        ];
        phaseScreens.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        
        // Reset ALL phase UI elements (counters, buttons, etc.)
        // Phase 1
        const doneBtn = document.getElementById('btn-im-done');
        if (doneBtn) {
            doneBtn.disabled = true;
            doneBtn.textContent = "I'm Done";
            doneBtn.classList.remove('selected', 'confirmed');
        }
        const doneTotal = document.getElementById('done-total');
        const doneCount = document.getElementById('done-count');
        if (doneTotal) doneTotal.textContent = '0';
        if (doneCount) doneCount.textContent = '0';
        
        // Phase 2
        const phase2ReadyBtn = document.getElementById('btn-phase2-ready');
        if (phase2ReadyBtn) {
            phase2ReadyBtn.disabled = true;
            phase2ReadyBtn.textContent = "I'm Ready";
            phase2ReadyBtn.classList.remove('selected', 'confirmed');
        }
        const phase2Total = document.getElementById('phase2-ready-total');
        const phase2Count = document.getElementById('phase2-ready-count');
        if (phase2Total) phase2Total.textContent = '0';
        if (phase2Count) phase2Count.textContent = '0';
        
        // Phase 3
        const phase3DoneBtn = document.getElementById('btn-phase3-done');
        if (phase3DoneBtn) {
            phase3DoneBtn.disabled = true;
            phase3DoneBtn.textContent = "I'm Done";
            phase3DoneBtn.classList.remove('selected', 'confirmed');
        }
        const phase3Total = document.getElementById('phase3-done-total');
        const phase3Count = document.getElementById('phase3-done-count');
        if (phase3Total) phase3Total.textContent = '0';
        if (phase3Count) phase3Count.textContent = '0';
        
        // Phase 4 & 5 voting buttons
        const guiltyBtn = document.getElementById('btn-guilty');
        const notGuiltyBtn = document.getElementById('btn-not-guilty');
        if (guiltyBtn) {
            guiltyBtn.disabled = false;
            guiltyBtn.classList.remove('selected', 'confirmed');
        }
        if (notGuiltyBtn) {
            notGuiltyBtn.disabled = false;
            notGuiltyBtn.classList.remove('selected', 'confirmed');
        }
        
        // Verdict ready button
        const verdictBtn = document.getElementById('btn-verdict-ready');
        if (verdictBtn) {
            verdictBtn.disabled = false;  // Enable for new game
            verdictBtn.textContent = "I Understand";
            verdictBtn.classList.remove('selected', 'confirmed');
        }
        const verdictReadyCount = document.getElementById('verdict-ready-count');
        if (verdictReadyCount) verdictReadyCount.textContent = '0';
        
        // Lobby Start Game button - CRITICAL: Reset to default state
        const startBtn = document.getElementById('btn-start-game');
        if (startBtn) {
            startBtn.disabled = data.game.playerCount < 5;
            startBtn.textContent = 'Start Game';  // Ensure it says "Start Game" not "Starting..."
            startBtn.classList.remove('selected', 'confirmed');
        }
        
        // Show fresh lobby screen
        this.showScreen('lobby-screen');
        this.updateLobby(data.game);
        
        console.log('[PLAY-AGAIN-LOBBY] Switched to new lobby, code:', this.gameCode, 'token:', this.playerToken);
    }
    
    onPlayAgain(data) {
        console.log('Play Again - returning to lobby', data);
        
        // Reset all local state
        this.isEliminated = false;
        this.eliminationData = null;
        this.phase3Done = false;
        this.phase4Voted = false;
        this.phase5Voted = false;
        this.isReady = false;
        this.startGameInProgress = false;
        this.syndicateState = null;
        this.detectiveState = null;
        this.bystanderState = null;
        this.bodyGuardState = null;
        this.playerDone = false;
        this.phase2Ready = false;
        this.caseNotes = {};
        this.selectedCaseNotesPlayer = null;
        this.role = null;
        
        // Update host status
        this.isHost = data.isHost;
        console.log('isHost set to:', this.isHost);
        
        // Hide all screens (with null checks)
        const screens = [
            'game-over-screen',
            'role-screen', 
            'phase1-screen',
            'phase2-screen',
            'phase3-screen',
            'phase4-screen',
            'phase5-screen',
            'eliminated-screen'
        ];
        screens.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        
        // Show lobby screen
        const lobbyScreen = document.getElementById('lobby-screen');
        if (lobbyScreen) lobbyScreen.style.display = 'block';
        
        const gameCodeDisplay = document.getElementById('game-code-display');
        if (gameCodeDisplay) gameCodeDisplay.textContent = data.gameCode;
        
        // Update player list
        this.updatePlayerList(data.players);
        
        // Show/hide host controls and guest message based on host status
        const hostControls = document.getElementById('host-controls');
        const guestMessage = document.getElementById('guest-message');
        const startBtn = document.getElementById('btn-start-game');
        const startHint = document.getElementById('start-hint');
        
        if (data.isHost) {
            if (hostControls) hostControls.style.display = 'block';
            if (guestMessage) guestMessage.style.display = 'none';
            if (startBtn) {
                startBtn.style.display = 'block';
                startBtn.textContent = 'START GAME';
                // Check if enough players to enable start button
                const playerCount = data.players ? data.players.length : 0;
                startBtn.disabled = playerCount < 5;
            }
            if (startHint) {
                const playerCount = data.players ? data.players.length : 0;
                startHint.textContent = playerCount < 5 
                    ? `Need at least 5 players to start (${playerCount}/5)` 
                    : 'Ready to start!';
            }
        } else {
            if (hostControls) hostControls.style.display = 'none';
            if (guestMessage) guestMessage.style.display = 'block';
        }
        
        // Show leave game button
        const leaveBtn = document.getElementById('btn-leave-game');
        if (leaveBtn) {
            leaveBtn.style.display = 'inline-block';
        }
        
        console.log('Returned to lobby. isHost:', data.isHost, 'hostControls visible:', hostControls?.style.display);
    }

    onLeftGame(data) {
        console.log('Left game:', data);
        alert(data.message || 'You have left the game');
        
        // Reset to initial state
        this.resetToInitialState();
    }

    onRemovedFromGame(data) {
        console.log('Removed from game:', data);
        alert(data.message || 'You have been removed from the game');
        
        // Reset to initial state
        this.resetToInitialState();
    }

    resetToInitialState() {
        // Reset all state
        this.gameCode = null;
        this.playerName = null;
        this.isHost = false;
        this.role = null;
        this.isReady = false;
        this.isEliminated = false;
        
        // Hide all screens
        const screens = [
            'lobby-screen',
            'role-screen',
            'phase1-screen',
            'phase2-screen',
            'phase3-screen',
            'phase4-screen',
            'phase5-screen',
            'game-over-screen',
            'eliminated-screen'
        ];
        screens.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        
        // Show home screen
        const homeScreen = document.getElementById('home-screen');
        if (homeScreen) homeScreen.style.display = 'block';
        
        // Clear inputs
        const nameInput = document.getElementById('player-name');
        if (nameInput) nameInput.value = '';
        const codeInput = document.getElementById('join-code');
        if (codeInput) codeInput.value = '';
    }

    leaveGame() {
        console.log('leaveGame() called');
        
        if (!confirm('Are you sure you want to leave the game?')) {
            console.log('User cancelled leave');
            return;
        }
        
        console.log('Leaving game');
        this.socket.emit('leave-game', {}, (response) => {
            if (response.success) {
                this.clearSession();
                this.showScreen('home-screen');
            } else {
                console.error('Failed to leave game:', response.message);
            }
        });
    }

    removePlayer(playerId) {
        if (!confirm('Are you sure you want to remove this player?')) {
            return;
        }
        
        this.sendMessage({
            action: 'removePlayer',
            targetId: playerId
        });
    }

    onGameNoteAdded(data) {
        const list = document.getElementById('game-notes-list');
        const li = document.createElement('li');
        li.textContent = data.note;
        list.appendChild(li);
    }

    updateGameNotes(notes) {
        const list = document.getElementById('game-notes-list');
        list.innerHTML = '';
        (notes || []).forEach(note => {
            const li = document.createElement('li');
            li.textContent = note;
            list.appendChild(li);
        });
    }

    // ---- Syndicate Functions ----
    initSyndicateView(state) {
        try {
            console.log('initSyndicateView: Starting');
            console.log('initSyndicateView: state.players:', state.players);
            console.log('initSyndicateView: state.players details:', state.players.map(p => ({id: p.id, name: p.name, alive: p.alive})));
            
            const view = document.getElementById('syndicate-view');
            if (!view) {
                console.error('syndicate-view element not found!');
                return;
            }
            console.log('initSyndicateView: Before setting display, view.style.display:', view.style.display);
            view.style.display = 'block';
            console.log('initSyndicateView: After setting display, view.style.display:', view.style.display);
            console.log('initSyndicateView: view element:', view);
            
            console.log('initSyndicateView: syndicateData =', state.syndicateData);
            this.syndicateState = state.syndicateData || {};
            this.syndicateIds = state.syndicateData?.syndicateIds || [];
            
            console.log('initSyndicateView: syndicateIds =', this.syndicateIds);
            
            // Filter out self, other syndicates, and dead players
            const myId = this.getMyPlayerId();
            console.log('initSyndicateView: myId =', myId);
            
            const eligiblePlayers = state.players.filter(p => 
                p.id !== myId && !this.syndicateIds.includes(p.id) && (p.alive !== false)
            );
            console.log('initSyndicateView: eligiblePlayers =', eligiblePlayers.length);
            console.log('initSyndicateView: eligiblePlayers:', eligiblePlayers.map(p => ({id: p.id, name: p.name})));
            
            this.buildPlayerGrid('syndicate-player-grid', eligiblePlayers, 'syndicate', false);
            this.updateSyndicateStage();
            this.updateSyndicateRecommendations();
            this.bindSyndicateEvents();
            
            // If already locked in, show the locked status
            if (this.syndicateState.lockedIn) {
                const lockBtn = document.getElementById('btn-syndicate-lock');
                const lockStatus = document.getElementById('syndicate-lock-status');
                if (lockBtn) {
                    lockBtn.disabled = true;
                    lockBtn.textContent = '✓ Locked In';
                }
                if (lockStatus) {
                    lockStatus.textContent = 'Waiting for other Syndicate members...';
                }
            } else if (this.syndicateState.myRecommendation) {
                // Recommendation selected but not locked in
                const lockBtn = document.getElementById('btn-syndicate-lock');
                const lockStatus = document.getElementById('syndicate-lock-status');
                if (lockBtn) {
                    lockBtn.disabled = false;
                }
                if (lockStatus) {
                    lockStatus.textContent = 'Ready to lock in your choice';
                }
            }
            
            // If syndicate is complete (target failed or assassin chosen), mark as complete
            if (this.syndicateState.complete) {
                this.checkActionsComplete();
            }
            console.log('initSyndicateView: completed successfully');
        } catch (error) {
            console.error('ERROR in initSyndicateView:', error);
            console.error('Stack:', error.stack);
            console.error('state.syndicateData:', state.syndicateData);
        }
    }

    updateSyndicateStage() {
        const stage = this.syndicateState.stage || 'target';
        const titleEl = document.getElementById('syndicate-stage-title');
        const descEl = document.getElementById('syndicate-stage-desc');

        if (stage === 'target') {
            titleEl.textContent = 'Choose Your Target';
            descEl.textContent = 'Select a player to eliminate. You can see your fellow Syndicate members\' choices.';
            this.updateSyndicateRecommendations();
        } else {
            titleEl.textContent = 'Choose the Assassin';
            descEl.textContent = 'Select which Syndicate member will carry out the hit.';
            
            // Rebuild grid for assassin selection (show only alive syndicates)
            const syndicatePlayers = this.phaseState.players.filter(p => 
                this.syndicateIds.includes(p.id) && !p.eliminated
            );
            this.buildPlayerGrid('syndicate-player-grid', syndicatePlayers, 'syndicate-assassin', false);
            
            // Re-bind click events for assassin selection
            document.querySelectorAll('#syndicate-player-grid .player-select-card').forEach(card => {
                card.onclick = () => this.assassinSelectPlayer(card.dataset.playerId);
            });
            
            this.updateAssassinRecommendations();
        }
    }

    bindSyndicateEvents() {
        document.getElementById('btn-syndicate-lock').addEventListener('click', () => {
            // Check which stage we're in
            if (this.syndicateState && this.syndicateState.stage === 'assassin') {
                this.assassinLockIn();
            } else {
                this.syndicateLockIn();
            }
        });
    }

    syndicateSelectPlayer(playerId) {
        if (this.syndicateState.lockedIn) return;

        this.syndicateState.myRecommendation = playerId;
        
        // Update UI
        document.querySelectorAll('#syndicate-player-grid .player-select-card').forEach(card => {
            card.classList.remove('selected');
            if (card.dataset.playerId === playerId) {
                card.classList.add('selected');
            }
        });

        // Enable lock button
        document.getElementById('btn-syndicate-lock').disabled = false;
        document.getElementById('syndicate-lock-status').textContent = 'Ready to lock in your choice';

        // Send to server
        this.sendMessage({
            action: 'syndicateRecommend',
            targetId: playerId
        });
    }

    syndicateLockIn() {
        if (!this.syndicateState.myRecommendation) return;

        this.sendMessage({
            action: 'syndicateLockIn'
        });

        this.syndicateState.lockedIn = true;
        document.getElementById('btn-syndicate-lock').disabled = true;
        document.getElementById('btn-syndicate-lock').textContent = '✓ Locked In';
        document.getElementById('syndicate-lock-status').textContent = 'Waiting for other Syndicate members...';
        
        // Check if actions are complete and auto-mark done if so
        this.checkActionsComplete();
    }

    updateSyndicateRecommendations() {
        const data = this.syndicateState;
        const list = document.getElementById('syndicate-recommendations-list');
        list.innerHTML = '';

        if (data.recommendations && data.recommendations.recommendations) {
            // Build a map of targetId -> array of voter info (name + locked status)
            const votersByTarget = {};
            const lockedInList = data.recommendations.lockedIn || [];
            
            data.recommendations.recommendations.forEach(rec => {
                if (!votersByTarget[rec.targetId]) {
                    votersByTarget[rec.targetId] = [];
                }
                const isLocked = lockedInList.includes(rec.voterId);
                votersByTarget[rec.targetId].push({
                    name: rec.voterName,
                    locked: isLocked
                });
                
                // Also add to the list display with lock indicator
                const li = document.createElement('li');
                const lockIcon = isLocked ? '🔒 ' : '';
                li.innerHTML = `<span class="voter">${lockIcon}${this.escapeHtml(rec.voterName)}</span> → ${this.escapeHtml(rec.targetName)}`;
                list.appendChild(li);
            });

            // Update vote counts and voter tags on player cards
            const voteCounts = data.recommendations.voteCounts || {};
            document.querySelectorAll('#syndicate-player-grid .player-select-card').forEach(card => {
                const playerId = card.dataset.playerId;
                const count = voteCounts[playerId] || 0;
                const countEl = card.querySelector('.vote-count');
                
                // Update vote count badge
                if (count > 1) {
                    card.classList.add('has-votes');
                    countEl.textContent = count;
                } else {
                    card.classList.remove('has-votes');
                    countEl.textContent = '0';
                }

                // Highlight recommended players
                if (count > 0) {
                    card.classList.add('recommended');
                } else {
                    card.classList.remove('recommended');
                }

                // Add/update voter name tags with lock indicator
                let tagsContainer = card.querySelector('.voter-tags');
                if (!tagsContainer) {
                    tagsContainer = document.createElement('div');
                    tagsContainer.className = 'voter-tags';
                    card.appendChild(tagsContainer);
                }
                
                const voters = votersByTarget[playerId] || [];
                tagsContainer.innerHTML = voters.map(voter => 
                    `<span class="voter-tag ${voter.locked ? 'locked' : ''}">${voter.locked ? '🔒 ' : ''}${this.escapeHtml(voter.name)}</span>`
                ).join('');
            });
            
            // Update lock status count if available
            const status = document.getElementById('syndicate-lock-status');
            if (status && data.recommendations.lockedInCount !== undefined) {
                const lockedCount = data.recommendations.lockedInCount;
                const totalCount = data.recommendations.totalSyndicates;
                if (lockedCount > 0 && lockedCount < totalCount) {
                    status.textContent = `${lockedCount}/${totalCount} Syndicate members locked in`;
                }
            }
        }
    }

    onSyndicateRecommendationsUpdate(data) {
        if (!this.syndicateState) return;
        
        this.syndicateState.recommendations = data.recommendations;
        this.syndicateState.stage = data.stage;
        this.updateSyndicateRecommendations();
    }

    onSyndicateLockInUpdate(data) {
        // Update lock-in status display
        const status = document.getElementById('syndicate-lock-status');
        if (status) {
            if (data.allLocked) {
                // Check if we're transitioning to assassin stage
                if (data.stage === 'assassin') {
                    status.textContent = 'Target locked! Now vote on who performs the assassination...';
                    
                    // Transition to assassin voting stage
                    if (this.syndicateState) {
                        this.syndicateState.stage = 'assassin';
                        this.syndicateState.target = data.target?.targetId || data.target;
                        this.syndicateState.myAssassinVote = null;
                        this.syndicateState.assassinLockedIn = false;
                        this.syndicateState.assassinRecommendations = data.assassinRecommendations || { recommendations: [], voteCounts: {}, lockedIn: [] };
                        
                        // Reset lock button for assassin voting
                        const lockBtn = document.getElementById('btn-syndicate-lock');
                        if (lockBtn) {
                            lockBtn.disabled = true;
                            lockBtn.textContent = 'Lock In Assassin';
                        }
                        
                        // Update the UI for assassin selection
                        this.updateSyndicateStage();
                    }
                } else {
                    status.textContent = 'All Syndicate members locked in! Determining target...';
                }
            } else {
                status.textContent = `${data.lockedInCount}/${data.totalSyndicates} Syndicate members locked in`;
            }
        }
    }

    onSyndicateTargetChosen(data) {
        if (!this.syndicateState) return;
        
        // Update state to assassin stage
        this.syndicateState.stage = 'assassin';
        this.syndicateState.target = data.targetId;
        this.syndicateState.myRecommendation = null;
        this.syndicateState.lockedIn = false;
        this.syndicateState.recommendations = { recommendations: [], voteCounts: {}, lockedIn: [] };
        
        // Reset lock button
        const lockBtn = document.getElementById('btn-syndicate-lock');
        lockBtn.disabled = true;
        lockBtn.textContent = 'Lock In';
        
        // Show message
        document.getElementById('syndicate-lock-status').textContent = data.message;
        
        // Rebuild the grid for assassin selection
        this.updateSyndicateStage();
    }

    onSyndicateTie(data) {
        if (!this.syndicateState) return;
        
        // Reset for revote
        this.syndicateState.myRecommendation = null;
        this.syndicateState.lockedIn = false;
        this.syndicateState.recommendations = { recommendations: [], voteCounts: {}, lockedIn: [] };
        
        // Reset lock button
        const lockBtn = document.getElementById('btn-syndicate-lock');
        lockBtn.disabled = true;
        lockBtn.textContent = 'Lock In';
        
        // Show tie message
        document.getElementById('syndicate-lock-status').textContent = data.message;
        
        // Clear selections
        document.querySelectorAll('#syndicate-player-grid .player-select-card').forEach(card => {
            card.classList.remove('selected', 'recommended');
            const tagsContainer = card.querySelector('.voter-tags');
            if (tagsContainer) tagsContainer.innerHTML = '';
        });
        
        this.updateSyndicateRecommendations();
    }

    onSyndicateTargetFailed(data) {
        if (!this.syndicateState) return;
        
        // Show failure message
        document.getElementById('syndicate-lock-status').textContent = data.message;
        
        // Disable further interaction
        const lockBtn = document.getElementById('btn-syndicate-lock');
        lockBtn.disabled = true;
        lockBtn.textContent = 'No Target';
        
        // Mark as done
        this.syndicateState.complete = true;
        this.checkActionsComplete();
    }

    onSyndicateAssassinChosen(data) {
        if (!this.syndicateState) return;
        
        // Show success message
        document.getElementById('syndicate-lock-status').textContent = data.message;
        
        // Disable further interaction
        const lockBtn = document.getElementById('btn-syndicate-lock');
        lockBtn.disabled = true;
        lockBtn.textContent = 'Assassin Chosen';
        
        // Mark as done
        this.syndicateState.complete = true;
        this.syndicateState.assassin = data.assassinId;
        this.checkActionsComplete();
    }
    
    onAssassinRecommendationsUpdate(data) {
        if (!this.syndicateState || this.syndicateState.stage !== 'assassin') return;
        
        this.syndicateState.assassinRecommendations = data.recommendations;
        this.updateAssassinRecommendations();
        
        // Check if all assassin votes are locked
        if (data.allLocked) {
            document.getElementById('syndicate-lock-status').textContent = 'All Syndicate members locked in! Assassin chosen...';
            this.syndicateState.complete = true;
            this.checkActionsComplete();
        }
    }
    
    updateAssassinRecommendations() {
        const data = this.syndicateState.assassinRecommendations || {};
        const list = document.getElementById('syndicate-recommendations-list');
        list.innerHTML = '';
        
        if (data.recommendations) {
            // Build a map of targetId -> array of voter info (name + locked status)
            const votersByTarget = {};
            const lockedInList = data.lockedIn || [];
            
            data.recommendations.forEach(rec => {
                if (!votersByTarget[rec.targetId]) {
                    votersByTarget[rec.targetId] = [];
                }
                const isLocked = lockedInList.includes(rec.voterId);
                votersByTarget[rec.targetId].push({
                    name: rec.voterName,
                    locked: isLocked
                });
                
                // Also add to the list display with lock indicator
                const li = document.createElement('li');
                const lockIcon = isLocked ? '🔒 ' : '';
                li.innerHTML = `<span class="voter">${lockIcon}${this.escapeHtml(rec.voterName)}</span> → ${this.escapeHtml(rec.targetName)} (assassin)`;
                list.appendChild(li);
            });
            
            // Update vote counts and voter tags on player cards
            const voteCounts = data.voteCounts || {};
            document.querySelectorAll('#syndicate-player-grid .player-select-card').forEach(card => {
                const playerId = card.dataset.playerId;
                const count = voteCounts[playerId] || 0;
                const countEl = card.querySelector('.vote-count');
                
                // Update vote count badge
                if (count > 1) {
                    card.classList.add('has-votes');
                    if (countEl) countEl.textContent = count;
                } else {
                    card.classList.remove('has-votes');
                    if (countEl) countEl.textContent = '0';
                }
                
                // Highlight recommended players
                if (count > 0) {
                    card.classList.add('recommended');
                } else {
                    card.classList.remove('recommended');
                }
                
                // Add/update voter name tags with lock indicator
                let tagsContainer = card.querySelector('.voter-tags');
                if (!tagsContainer) {
                    tagsContainer = document.createElement('div');
                    tagsContainer.className = 'voter-tags';
                    card.appendChild(tagsContainer);
                }
                
                const voters = votersByTarget[playerId] || [];
                tagsContainer.innerHTML = voters.map(voter => 
                    `<span class="voter-tag ${voter.locked ? 'locked' : ''}">${voter.locked ? '🔒 ' : ''}${this.escapeHtml(voter.name)}</span>`
                ).join('');
            });
            
            // Update lock status count if available
            const status = document.getElementById('syndicate-lock-status');
            if (status && data.lockedInCount !== undefined) {
                const lockedCount = data.lockedInCount;
                const totalCount = data.totalSyndicates;
                if (lockedCount > 0 && lockedCount < totalCount) {
                    status.textContent = `Assassin vote: ${lockedCount}/${totalCount} locked in`;
                }
            }
        }
    }
    
    assassinSelectPlayer(playerId) {
        if (this.syndicateState.assassinLockedIn) return;
        
        this.syndicateState.myAssassinVote = playerId;
        
        // Update UI
        document.querySelectorAll('#syndicate-player-grid .player-select-card').forEach(card => {
            card.classList.remove('selected');
            if (card.dataset.playerId === playerId) {
                card.classList.add('selected');
            }
        });
        
        // Enable lock button
        document.getElementById('btn-syndicate-lock').disabled = false;
        document.getElementById('syndicate-lock-status').textContent = 'Ready to lock in assassin choice';
        
        // Send to server
        this.socket.emit('game-event', {
            eventName: 'assassin-vote',
            payload: { targetToken: playerId }
        });
    }
    
    assassinLockIn() {
        if (!this.syndicateState.myAssassinVote) return;
        
        this.socket.emit('game-event', {
            eventName: 'assassin-lock',
            payload: {}
        });
        
        this.syndicateState.assassinLockedIn = true;
        document.getElementById('btn-syndicate-lock').disabled = true;
        document.getElementById('btn-syndicate-lock').textContent = '✓ Assassin Locked';
        document.getElementById('syndicate-lock-status').textContent = 'Waiting for other Syndicate members...';
        
        // Check if actions are complete and enable done button if so
        this.checkActionsComplete();
    }

    // ---- Detective Functions ----
    initDetectiveView(state) {
        try {
            console.log('initDetectiveView: Starting');
            
            const view = document.getElementById('detective-view');
            if (!view) {
                console.error('detective-view element not found!');
                return;
            }
            view.style.display = 'block';
            
            console.log('initDetectiveView: detectiveData =', state.detectiveData);
            this.detectiveState = state.detectiveData || {};
            this.currentRound = state.round || 1;
            
            // Filter out dead players for investigation
            const alivePlayers = state.players.filter(p => p.alive !== false);
            console.log('initDetectiveView: alivePlayers count =', alivePlayers.length);
            
            // Check if investigation is allowed (Round 2+)
            const canInvestigate = this.detectiveState.canInvestigate || this.currentRound >= 2;
            
            const round1Message = document.getElementById('detective-round1-message');
            const playerGrid = document.getElementById('detective-player-grid');
            const instructions = document.getElementById('detective-instructions');
            
            if (!canInvestigate) {
                // Round 1 - disable investigation, only show case notes
                if (round1Message) round1Message.style.display = 'block';
                if (playerGrid) playerGrid.style.display = 'none';
                if (instructions) instructions.style.display = 'none';
                const lockBtn = document.getElementById('btn-detective-lock');
                if (lockBtn) lockBtn.style.display = 'none';
                const lockStatus = document.getElementById('detective-lock-status');
                if (lockStatus) lockStatus.textContent = 'Click "I\'m Done" when ready to proceed';
                
                // Auto-mark detective as ready since they can't do anything in Round 1
                this.detectiveState.lockedIn = true;
            } else {
                // Round 2+ - enable investigation
                if (round1Message) round1Message.style.display = 'none';
                if (playerGrid) playerGrid.style.display = 'grid';
                if (instructions) instructions.style.display = 'block';
                this.buildPlayerGrid('detective-player-grid', alivePlayers, 'detective', false);
                const lockBtn = document.getElementById('btn-detective-lock');
                if (lockBtn) lockBtn.style.display = 'inline-block';
                
                // If already locked in, show the locked status
                if (this.detectiveState.lockedIn && this.detectiveState.investigation) {
                    const targetPlayer = alivePlayers.find(p => p.id === this.detectiveState.investigation);
                    if (lockBtn) {
                        lockBtn.disabled = true;
                        lockBtn.textContent = '✓ Investigation Locked';
                    }
                    const lockStatus = document.getElementById('detective-lock-status');
                    if (lockStatus) {
                        lockStatus.textContent = `Investigating: ${targetPlayer ? this.escapeHtml(targetPlayer.name) : 'Unknown'}. Results will be revealed later...`;
                    }
                } else if (this.detectiveState.investigation) {
                    // Investigation selected but not locked in
                    if (lockBtn) lockBtn.disabled = false;
                    const lockStatus = document.getElementById('detective-lock-status');
                    if (lockStatus) lockStatus.textContent = 'Ready to lock in investigation';
                } else {
                    const lockStatus = document.getElementById('detective-lock-status');
                    if (lockStatus) lockStatus.textContent = 'Select a player to investigate';
                }
            }
            
            this.bindDetectiveEvents();
            this.initCaseNotes(state);
            
            // Display secret word hint from Eye Witness (if available)
            this.displayDetectiveSecretHint(state.detectiveData);
            
            console.log('initDetectiveView: completed successfully');
        } catch (error) {
            console.error('ERROR in initDetectiveView:', error);
            console.error('Stack:', error.stack);
            console.error('state.detectiveData:', state.detectiveData);
        }
    }
    
    displayDetectiveSecretHint(detectiveData) {
        // Remove any existing hint panel
        const existingPanel = document.getElementById('detective-secret-hint-panel');
        if (existingPanel) {
            existingPanel.remove();
        }
        
        // Only show if we have secret word data
        if (!detectiveData || !detectiveData.secretWordKeyword) {
            console.log('displayDetectiveSecretHint: No secret word data yet');
            return;
        }
        
        // Create the detective hint panel
        const panel = document.createElement('div');
        panel.id = 'detective-secret-hint-panel';
        panel.className = 'detective-secret-hint';
        panel.innerHTML = `
            <div class="detective-hint-header">
                <span>🔍</span>
                <h3>Intelligence Report</h3>
            </div>
            <div class="detective-hint-content">
                <p>The Eye Witness has been given a signal keyword:</p>
                <p class="detective-keyword">"${this.escapeHtml(detectiveData.secretWordKeyword)}"</p>
                <p class="detective-hint-instruction">${this.escapeHtml(detectiveData.hint || 'Watch for players who use this word or perform a related gesture during discussions. They may be trying to communicate with you!')}</p>
            </div>
        `;
        
        // Insert after the view title
        const view = document.getElementById('detective-view');
        const title = view.querySelector('h3') || view.firstChild;
        title.parentNode.insertBefore(panel, title.nextSibling);
        
        console.log('displayDetectiveSecretHint: Panel added with keyword:', detectiveData.secretWordKeyword);
    }

    bindDetectiveEvents() {
        document.getElementById('btn-detective-lock').addEventListener('click', () => {
            this.detectiveLockIn();
        });

        // Tag buttons are now bound in bindCaseNotesEvents()
    }

    detectiveSelectPlayer(playerId) {
        if (this.detectiveState.lockedIn) return;

        this.detectiveState.investigation = playerId;

        document.querySelectorAll('#detective-player-grid .player-select-card').forEach(card => {
            card.classList.remove('selected');
            if (card.dataset.playerId === playerId) {
                card.classList.add('selected');
            }
        });

        document.getElementById('btn-detective-lock').disabled = false;
        document.getElementById('detective-lock-status').textContent = 'Ready to lock in investigation';

        this.sendMessage({
            action: 'detectiveInvestigate',
            targetId: playerId
        });
    }

    detectiveLockIn() {
        if (!this.detectiveState.investigation) return;

        this.sendMessage({
            action: 'detective-lock',
            targetToken: this.detectiveState.investigation
        });

        this.detectiveState.lockedIn = true;
        const targetPlayer = this.phaseState.players.find(p => p.id === this.detectiveState.investigation);
        document.getElementById('btn-detective-lock').disabled = true;
        document.getElementById('btn-detective-lock').textContent = '✓ Investigation Locked';
        document.getElementById('detective-lock-status').textContent = `Investigating: ${targetPlayer ? this.escapeHtml(targetPlayer.name) : 'Unknown'}. Results will be revealed later...`;
        this.checkActionsComplete();
    }

    initCaseNotes(state) {
        const detectiveData = state.detectiveData || {};
        this.caseNotes = detectiveData.caseNotes || {};
        const caseNotesPlayers = detectiveData.caseNotesPlayers || state.players;
        let availableRoles = detectiveData.availableRoles || [];
        
        console.log('initCaseNotes: availableRoles from server =', availableRoles);
        
        // Always include Suspicious and Innocent tags (they don't depend on roles in game)
        const allAvailableTags = ['Syndicate', 'Detective', 'Bystander', 'Eye Witness', 'Body Guard', 'Suspicious', 'Innocent'];
        const tagsToShow = allAvailableTags.filter(tag => {
            // Suspicious and Innocent are always available
            if (tag === 'Suspicious' || tag === 'Innocent') return true;
            // Other tags only show if the role is in the game
            return availableRoles.includes(tag);
        });
        
        console.log('initCaseNotes: tagsToShow =', tagsToShow);
        
        // Show/hide tag buttons based on available roles (if they exist)
        const tagButtons = document.querySelectorAll('.tag-btn');
        if (tagButtons.length > 0) {
            tagButtons.forEach(btn => {
                const tag = btn.dataset.tag;
                btn.style.display = tagsToShow.includes(tag) ? 'inline-block' : 'none';
            });
        }
        
        // Ensure case notes tags container is visible (if it exists)
        const tagsSection = document.getElementById('case-notes-tags');
        if (tagsSection) {
            tagsSection.style.display = 'block';
        }
        
        this.renderCaseNotesGrid(caseNotesPlayers);
        this.bindCaseNotesEvents();
    }

    renderCaseNotesGrid(players) {
        const grid = document.getElementById('case-notes-grid');
        
        // If case notes grid doesn't exist (not in detective view), return early
        if (!grid) {
            console.log('renderCaseNotesGrid: case-notes-grid element not found, skipping grid render');
            return;
        }
        
        grid.innerHTML = '';

        players.forEach(player => {
            if (player.id === this.getMyPlayerId()) return; // Don't include self

            const card = document.createElement('div');
            card.className = 'case-note-card';
            card.dataset.playerId = player.id;

            const notes = this.caseNotes[player.id] || [];
            const tagsHtml = notes.length 
                ? notes.map(tag => `<span class="tag">${tag} <button class="tag-remove" data-tag="${tag}">✕</button></span>`).join('')
                : '<span class="no-tags">No tags</span>';

            card.innerHTML = `
                <div class="card-header">
                    <h4>${this.escapeHtml(player.name)}</h4>
                </div>
                <div class="card-tags">
                    ${tagsHtml}
                </div>
            `;

            card.addEventListener('click', () => this.selectCaseNotesPlayer(player.id, card));

            grid.appendChild(card);
        });
    }

    selectCaseNotesPlayer(playerId, cardEl) {
        // Remove previous selection
        document.querySelectorAll('.case-note-card').forEach(card => {
            card.classList.remove('selected');
        });

        // Select new card
        if (cardEl) {
            cardEl.classList.add('selected');
        }

        this.selectedCaseNotesPlayer = playerId;
        const player = this.phaseState.players.find(p => p.id === playerId);

        // Show tags panel
        const tagsSection = document.getElementById('case-notes-tags');
        if (tagsSection) {
            tagsSection.style.display = 'block';
        }
        const playerNameEl = document.getElementById('selected-player-name');
        if (playerNameEl) {
            playerNameEl.textContent = player ? this.escapeHtml(player.name) : 'Player';
        }

        // Update tag button states - make sure all visible tags are accessible
        const playerNotes = this.caseNotes[playerId] || [];
        document.querySelectorAll('.tag-btn').forEach(btn => {
            btn.classList.toggle('active', playerNotes.includes(btn.dataset.tag));
        });
    }

    bindCaseNotesEvents() {
        // Prevent duplicate event listeners by using a flag
        if (this.caseNotesEventsBound) return;
        
        // Only bind events if case notes elements exist
        const tagButtons = document.querySelectorAll('.tag-btn');
        if (tagButtons.length === 0) {
            console.log('bindCaseNotesEvents: No case notes tag buttons found, skipping event binding');
            return;
        }
        
        this.caseNotesEventsBound = true;

        tagButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.toggleCaseNoteTag(btn.dataset.tag);
            });
        });

        // Remove tag button handlers
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('tag-remove')) {
                const tag = e.target.dataset.tag;
                this.removeTagFromPlayer(this.selectedCaseNotesPlayer, tag);
            }
        });
    }

    toggleCaseNoteTag(tag) {
        if (!this.selectedCaseNotesPlayer) return;

        const playerId = this.selectedCaseNotesPlayer;
        if (!this.caseNotes[playerId]) {
            this.caseNotes[playerId] = [];
        }

        const index = this.caseNotes[playerId].indexOf(tag);
        if (index > -1) {
            this.caseNotes[playerId].splice(index, 1);
        } else {
            this.caseNotes[playerId].push(tag);
        }

        // Update button state
        document.querySelector(`.tag-btn[data-tag="${tag}"]`).classList.toggle('active');

        // Send to server
        this.sendMessage({
            action: 'updateCaseNotes',
            targetId: playerId,
            notes: this.caseNotes[playerId]
        });

        this.updateCaseNoteCard(playerId);
    }

    removeTagFromPlayer(playerId, tag) {
        if (!this.caseNotes[playerId]) return;

        const index = this.caseNotes[playerId].indexOf(tag);
        if (index > -1) {
            this.caseNotes[playerId].splice(index, 1);
        }

        // Send to server
        this.sendMessage({
            action: 'updateCaseNotes',
            targetId: playerId,
            notes: this.caseNotes[playerId]
        });

        this.updateCaseNoteCard(playerId);
        
        // Update tag buttons
        const playerNotes = this.caseNotes[playerId] || [];
        document.querySelectorAll('.tag-btn').forEach(btn => {
            btn.classList.toggle('active', playerNotes.includes(btn.dataset.tag));
        });
    }

    updateCaseNoteCard(playerId) {
        const card = document.querySelector(`.case-note-card[data-player-id="${playerId}"]`);
        if (!card) return;

        const notes = this.caseNotes[playerId] || [];
        const tagsHtml = notes.length 
            ? notes.map(tag => `<span class="tag">${tag} <button class="tag-remove" data-tag="${tag}">✕</button></span>`).join('')
            : '<span class="no-tags">No tags</span>';

        card.querySelector('.card-tags').innerHTML = tagsHtml;
    }

    showPersistentCaseNotesPanel(state) {
        // Only show for detectives
        if (state.role !== 'Detective') {
            return;
        }

        // Update case notes data from detectiveData
        const detectiveData = state.detectiveData || {};
        if (detectiveData.caseNotes) {
            this.caseNotes = detectiveData.caseNotes;
        }

        const caseNotesPlayers = detectiveData.caseNotesPlayers || state.players.filter(p => p.id !== this.getMyPlayerId());
        let availableRoles = detectiveData.availableRoles || [];
        
        // Always include Suspicious and Innocent tags
        const allAvailableTags = ['Syndicate', 'Detective', 'Bystander', 'Eye Witness', 'Body Guard', 'Suspicious', 'Innocent'];
        const tagsToShow = allAvailableTags.filter(tag => {
            if (tag === 'Suspicious' || tag === 'Innocent') return true;
            return availableRoles.includes(tag);
        });

        // Get the current phase container (phase1, phase2, phase3, phase4, phase5)
        let caseNotesContainer = null;
        const currentPhase = state.currentPhase;
        
        // Map phase names to container IDs
        const phaseContainerMap = {
            'night': 'phase1-case-notes-container',
            'murder': 'phase2-case-notes-container',
            'discussion': 'phase3-case-notes-container',
            'accusation': 'phase4-case-notes-container',
            'verdict': 'phase5-case-notes-container'
        };

        const containerId = phaseContainerMap[currentPhase];
        if (containerId) {
            caseNotesContainer = document.getElementById(containerId);
        }

        // If no specific phase container found, don't display
        if (!caseNotesContainer) {
            console.log('showPersistentCaseNotesPanel: No case notes container found for phase', currentPhase);
            return;
        }

        // Show the container
        caseNotesContainer.style.display = 'block';

        // Build the case notes content directly in the container
        const gridHtml = caseNotesPlayers
            .filter(p => p.id !== this.getMyPlayerId())
            .map(player => {
                const notes = this.caseNotes[player.id] || [];
                const tagsHtml = notes.length 
                    ? notes.map(tag => `<span class="tag">${tag} <button class="tag-remove" data-tag="${tag}">✕</button></span>`).join('')
                    : '<span class="no-tags">No tags</span>';

                return `
                    <div class="case-note-card" data-player-id="${player.id}">
                        <div class="card-header">
                            <h4>${this.escapeHtml(player.name)}</h4>
                        </div>
                        <div class="card-tags">
                            ${tagsHtml}
                        </div>
                    </div>
                `;
            })
            .join('');

        // Rebuild entire container without the nested .case-notes wrapper
        caseNotesContainer.innerHTML = `
            <h3>📋 Case Notes</h3>
            <div class="case-notes-grid">
                ${gridHtml}
            </div>
            <div class="case-notes-tags" style="display: none;">
                <h4>Add Tags to <span class="selected-player-name">Player</span></h4>
                <div class="tag-buttons">
                    ${allAvailableTags
                        .filter(tag => tagsToShow.includes(tag))
                        .map(tag => `<button class="tag-btn" data-tag="${tag}">${tag}</button>`)
                        .join('')}
                </div>
            </div>
        `;

        // Bind case notes events
        this.bindPersistentCaseNotesEvents(caseNotesContainer);
    }

    bindPersistentCaseNotesEvents(container) {
        // Clear the flag each time to allow re-binding when container is recreated
        container.dataset.eventsbound = 'false';

        const grid = container.querySelector('.case-notes-grid');
        const tagsSection = container.querySelector('.case-notes-tags');
        const playerNameEl = container.querySelector('.selected-player-name');

        // Card selection handler
        if (grid) {
            grid.querySelectorAll('.case-note-card').forEach(card => {
                card.addEventListener('click', () => {
                    const playerId = card.dataset.playerId;
                    
                    // Update selection
                    grid.querySelectorAll('.case-note-card').forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                    this.selectedCaseNotesPlayer = playerId;

                    // Show tags section and update player name
                    if (tagsSection) {
                        tagsSection.style.display = 'block';
                        const player = this.phaseState.players.find(p => p.id === playerId);
                        if (playerNameEl && player) {
                            playerNameEl.textContent = this.escapeHtml(player.name);
                        }

                        // Update tag button states
                        const playerNotes = this.caseNotes[playerId] || [];
                        tagsSection.querySelectorAll('.tag-btn').forEach(btn => {
                            btn.classList.toggle('active', playerNotes.includes(btn.dataset.tag));
                        });
                    }
                });
            });
        }

        // Tag button handler
        if (tagsSection) {
            tagsSection.querySelectorAll('.tag-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    
                    if (!this.selectedCaseNotesPlayer) return;

                    const tag = btn.dataset.tag;
                    const playerId = this.selectedCaseNotesPlayer;
                    
                    if (!this.caseNotes[playerId]) {
                        this.caseNotes[playerId] = [];
                    }

                    const index = this.caseNotes[playerId].indexOf(tag);
                    if (index > -1) {
                        this.caseNotes[playerId].splice(index, 1);
                    } else {
                        this.caseNotes[playerId].push(tag);
                    }

                    // Update button state
                    btn.classList.toggle('active');

                    // Update card display
                    const notes = this.caseNotes[playerId] || [];
                    const card = grid.querySelector(`.case-note-card[data-player-id="${playerId}"]`);
                    if (card) {
                        const tagsHtml = notes.length 
                            ? notes.map(t => `<span class="tag">${t}</span>`).join('')
                            : '<span class="no-tags">No tags</span>';
                        card.querySelector('.card-tags').innerHTML = tagsHtml;
                    }

                    // Send to server
                    this.sendMessage({
                        action: 'updateCaseNotes',
                        targetId: playerId,
                        notes: this.caseNotes[playerId]
                    });
                });
            });
        }

        // Tag remove handler
        container.addEventListener('click', (e) => {
            if (e.target.classList.contains('tag-remove')) {
                const tag = e.target.dataset.tag;
                if (!this.selectedCaseNotesPlayer) return;

                const playerId = this.selectedCaseNotesPlayer;
                if (!this.caseNotes[playerId]) return;

                const index = this.caseNotes[playerId].indexOf(tag);
                if (index > -1) {
                    this.caseNotes[playerId].splice(index, 1);
                }

                // Update card display
                const notes = this.caseNotes[playerId] || [];
                const card = grid.querySelector(`.case-note-card[data-player-id="${playerId}"]`);
                if (card) {
                    const tagsHtml = notes.length 
                        ? notes.map(t => `<span class="tag">${t}</span>`).join('')
                        : '<span class="no-tags">No tags</span>';
                    card.querySelector('.card-tags').innerHTML = tagsHtml;
                }

                // Send to server
                this.sendMessage({
                    action: 'updateCaseNotes',
                    targetId: playerId,
                    notes: this.caseNotes[playerId]
                });
            }
        });
    }

    // ---- Bystander Functions ----
    initBystanderView(state) {
        try {
            console.log('initBystanderView: Starting');
            console.log('initBystanderView: state.players:', state.players);
            console.log('initBystanderView: state.players details:', state.players.map(p => ({id: p.id, name: p.name, alive: p.alive})));
            
            const view = document.getElementById('bystander-view');
            if (!view) {
                console.error('bystander-view element not found!');
                return;
            }
            console.log('initBystanderView: Setting bystander-view display to block, current display:', view.style.display);
            view.style.display = 'block';
            console.log('initBystanderView: After setting display, view.style.display:', view.style.display);
            console.log('initBystanderView: view DOM element:', view);
            
            console.log('initBystanderView: bystanderData =', state.bystanderData);
            this.bystanderState = state.bystanderData || {};
            
            // Filter out dead players
            const alivePlayers = state.players.filter(p => p.alive !== false);
            console.log('initBystanderView: alivePlayers count =', alivePlayers.length);
            console.log('initBystanderView: alivePlayers:', alivePlayers.map(p => ({id: p.id, name: p.name})));
            
            this.buildPlayerGrid('bystander-player-grid', alivePlayers, 'bystander', false);
            
            // Reset selection status first
            const statusEl = document.getElementById('bystander-selection-status');
            if (statusEl) {
                statusEl.className = 'selection-status';
                statusEl.innerHTML = '<p>Select a player you suspect to be Syndicate</p>';
            }
            
            // If already voted, show the selection status
            if (this.bystanderState.myVote) {
                const player = alivePlayers.find(p => p.id === this.bystanderState.myVote);
                if (player) {
                    if (statusEl) {
                        statusEl.className = 'selection-status confirmed';
                        statusEl.innerHTML = `<p>You selected ${this.escapeHtml(player.name)}</p>`;
                    }
                }
            }
            console.log('initBystanderView: completed successfully');
        } catch (error) {
            console.error('ERROR in initBystanderView:', error);
            console.error('Stack:', error.stack);
            console.error('state.bystanderData:', state.bystanderData);
        }
    }

    bystanderSelectPlayer(playerId) {
        this.bystanderState.myVote = playerId;

        document.querySelectorAll('#bystander-player-grid .player-select-card').forEach(card => {
            card.classList.remove('selected');
            if (card.dataset.playerId === playerId) {
                card.classList.add('selected');
            }
        });

        const statusEl = document.getElementById('bystander-selection-status');
        const player = this.phaseState.players.find(p => p.id === playerId);
        statusEl.className = 'selection-status confirmed';
        statusEl.innerHTML = `<p>You selected ${this.escapeHtml(player.name)}</p>`;

        this.sendMessage({
            action: 'bystanderSelect',
            targetId: playerId
        });
        
        this.checkActionsComplete();
    }
    
    // ---- Eye Witness Functions ----
    initEyeWitnessView(state) {
        try {
            console.log('initEyeWitnessView: Starting');
            console.log('initEyeWitnessView: eyewitnessData =', state.eyewitnessData);
            
            // Use bystander view as base, but add eye witness special information
            const view = document.getElementById('bystander-view');
            if (!view) {
                console.error('bystander-view element not found!');
                return;
            }
            view.style.display = 'block';
            
            this.bystanderState = state.bystanderData || {};
            this.eyewitnessState = state.eyewitnessData || {};
            
            // Filter out dead players
            const alivePlayers = state.players.filter(p => p.alive !== false);
            this.buildPlayerGrid('bystander-player-grid', alivePlayers, 'bystander', false);
            
            // Reset selection status
            const statusEl = document.getElementById('bystander-selection-status');
            if (statusEl) {
                statusEl.className = 'selection-status';
                statusEl.innerHTML = '<p>Select a player you suspect to be Syndicate</p>';
            }
            
            // If already voted, show the selection status
            if (this.bystanderState.myVote) {
                const player = alivePlayers.find(p => p.id === this.bystanderState.myVote);
                if (player && statusEl) {
                    statusEl.className = 'selection-status confirmed';
                    statusEl.innerHTML = `<p>You selected ${this.escapeHtml(player.name)}</p>`;
                }
            }
            
            // Add Eye Witness special information panel
            this.displayEyeWitnessInfo(state.eyewitnessData);
            
            console.log('initEyeWitnessView: completed successfully');
        } catch (error) {
            console.error('ERROR in initEyeWitnessView:', error);
            console.error('Stack:', error.stack);
        }
    }
    
    displayEyeWitnessInfo(eyewitnessData) {
        // Remove any existing eye witness panel
        const existingPanel = document.getElementById('eyewitness-info-panel');
        if (existingPanel) {
            existingPanel.remove();
        }
        
        // Only show if we have assassin data
        if (!eyewitnessData || !eyewitnessData.assassinName) {
            console.log('displayEyeWitnessInfo: No assassin data yet');
            return;
        }
        
        // Create the eye witness information panel
        const panel = document.createElement('div');
        panel.id = 'eyewitness-info-panel';
        panel.className = 'eyewitness-special-info';
        panel.innerHTML = `
            <div class="eyewitness-header">
                <span class="eyewitness-icon">👁️</span>
                <h3>Eye Witness Vision</h3>
            </div>
            <div class="eyewitness-content">
                <div class="assassin-reveal">
                    <p>You witnessed the assassination!</p>
                    <p class="assassin-name">The assassin was: <strong>${this.escapeHtml(eyewitnessData.assassinName)}</strong></p>
                </div>
                <div class="secret-word-section">
                    <p class="secret-word-label">Your secret signal:</p>
                    <p class="secret-word">"${this.escapeHtml(eyewitnessData.secretWord)}"</p>
                    <p class="secret-word-instruction">${this.escapeHtml(eyewitnessData.instruction || 'Use this signal during discussions to communicate with the Detective!')}</p>
                </div>
            </div>
        `;
        
        // Insert after the view title
        const view = document.getElementById('bystander-view');
        const title = view.querySelector('h3') || view.firstChild;
        title.parentNode.insertBefore(panel, title.nextSibling);
        
        console.log('displayEyeWitnessInfo: Panel added with assassin:', eyewitnessData.assassinName);
    }

    // ---- Body Guard Functions ----
    initBodyGuardView(state) {
        try {
            console.log('initBodyGuardView: Starting');
            
            const view = document.getElementById('bodyguard-view');
            if (!view) {
                console.error('bodyguard-view element not found!');
                return;
            }
            view.style.display = 'block';
            
            console.log('initBodyGuardView: bodyGuardData =', state.bodyGuardData);
            console.log('initBodyGuardView: bystanderData =', state.bystanderData);
            
            this.bodyGuardState = state.bodyGuardData || {};
            this.bystanderState = state.bystanderData || {};
            
            // Filter out dead players
            const alivePlayers = state.players.filter(p => p.alive !== false);
            console.log('initBodyGuardView: alivePlayers count =', alivePlayers.length);
            
            this.buildPlayerGrid('bodyguard-player-grid', alivePlayers, 'bodyguard', false);
            this.buildPlayerGrid('bodyguard-bystander-grid', alivePlayers, 'bodyguard-bystander', false);
            
            // If already protecting, show the protection status
            if (this.bodyGuardState.protecting) {
                const player = alivePlayers.find(p => p.id === this.bodyGuardState.protecting);
                if (player) {
                    const statusEl = document.getElementById('bodyguard-protection-status');
                    if (statusEl) {
                        statusEl.className = 'protection-status confirmed';
                        statusEl.innerHTML = `<p>🛡️ Protecting ${this.escapeHtml(player.name)}</p>`;
                    }
                }
            }
            
            // If already voted in bystander selection, show the selection status
            if (this.bystanderState.myVote) {
                const player = alivePlayers.find(p => p.id === this.bystanderState.myVote);
                if (player) {
                    const statusEl = document.getElementById('bodyguard-bystander-status');
                    if (statusEl) {
                        statusEl.className = 'selection-status confirmed';
                        statusEl.innerHTML = `<p>You selected ${this.escapeHtml(player.name)}</p>`;
                    }
                }
            }
            console.log('initBodyGuardView: completed successfully');
        } catch (error) {
            console.error('ERROR in initBodyGuardView:', error);
            console.error('Stack:', error.stack);
            console.error('state.bodyGuardData:', state.bodyGuardData);
            console.error('state.bystanderData:', state.bystanderData);
        }
    }

    bodyGuardProtect(playerId) {
        this.bodyGuardState.protecting = playerId;

        document.querySelectorAll('#bodyguard-player-grid .player-select-card').forEach(card => {
            card.classList.remove('selected');
            if (card.dataset.playerId === playerId) {
                card.classList.add('selected');
            }
        });

        const statusEl = document.getElementById('bodyguard-protection-status');
        const player = this.phaseState.players.find(p => p.id === playerId);
        statusEl.className = 'protection-status confirmed';
        statusEl.innerHTML = `<p>🛡️ Protecting ${this.escapeHtml(player.name)}</p>`;

        this.sendMessage({
            action: 'bodyGuardProtect',
            targetId: playerId
        });
        
        this.checkActionsComplete();
    }

    bodyGuardBystanderSelect(playerId) {
        this.bodyGuardState.bystanderVote = playerId;

        document.querySelectorAll('#bodyguard-bystander-grid .player-select-card').forEach(card => {
            card.classList.remove('selected');
            if (card.dataset.playerId === playerId) {
                card.classList.add('selected');
            }
        });

        const statusEl = document.getElementById('bodyguard-bystander-status');
        const player = this.phaseState.players.find(p => p.id === playerId);
        statusEl.className = 'selection-status confirmed';
        statusEl.innerHTML = `<p>You selected ${this.escapeHtml(player.name)}</p>`;

        this.sendMessage({
            action: 'bystanderSelect',
            targetId: playerId
        });
        
        this.checkActionsComplete();
    }

    // ---- Helper Functions ----
    buildPlayerGrid(containerId, players, type, excludeSyndicates = false) {
        console.log('buildPlayerGrid called with:', {containerId, playersCount: players.length, type});
        const container = document.getElementById(containerId);
        if (!container) {
            console.error('Container not found:', containerId);
            return;
        }
        console.log('Container found:', container);
        container.innerHTML = '';
        const myId = this.getMyPlayerId();
        console.log('myId:', myId);
        
        let cardCount = 0;

        players.forEach((player, index) => {
            // Skip self for most selections, but allow for assassin voting
            const isSelf = player.id === myId;
            const allowSelfSelection = type === 'syndicate-assassin';
            
            // Completely skip self card unless it's assassin selection
            if (isSelf && !allowSelfSelection) {
                console.log('buildPlayerGrid: Skipping self player:', player.id);
                return;
            }
            
            console.log('buildPlayerGrid: Creating card for player:', {playerId: player.id, playerName: player.name, index});
            
            const card = document.createElement('div');
            card.className = 'player-select-card';
            card.dataset.playerId = player.id;
            
            // Mark previously selected cards
            let isSelected = false;
            switch (type) {
                case 'syndicate':
                case 'syndicate-assassin':
                    isSelected = this.syndicateState?.myRecommendation === player.id;
                    break;
                case 'bystander':
                    isSelected = this.bystanderState?.myVote === player.id;
                    break;
                case 'bodyguard':
                    isSelected = this.bodyGuardState?.protecting === player.id;
                    break;
                case 'bodyguard-bystander':
                    isSelected = this.bystanderState?.myVote === player.id;
                    break;
                case 'detective':
                    isSelected = this.detectiveState?.investigation === player.id;
                    break;
            }
            
            if (isSelected) {
                card.classList.add('selected');
            }

            card.innerHTML = `
                <span class="player-icon">${this.getPlayerIcon(index)}</span>
                <span class="player-name">${this.escapeHtml(player.name)}</span>
                <span class="vote-count">0</span>
            `;

            card.addEventListener('click', () => {
                this.handlePlayerSelect(type, player.id);
            });
            
            console.log('buildPlayerGrid: Appending card for player:', player.id);
            container.appendChild(card);
            cardCount++;
        });
        console.log('buildPlayerGrid completed:', {containerId, cardCount, containerChildrenCount: container.children.length});
        
        // Ensure container and parent are visible
        if (container.parentElement) {
            console.log('buildPlayerGrid: Container parent:', container.parentElement.id, 'display:', container.parentElement.style.display);
            if (container.parentElement.style.display === 'none') {
                console.warn('buildPlayerGrid: Parent is hidden! Setting to block');
                container.parentElement.style.display = 'block';
            }
        }
        
        // Verify grid has content
        if (container.children.length === 0) {
            console.warn('buildPlayerGrid WARNING: Grid has no children!');
        }
    }

    handlePlayerSelect(type, playerId) {
        switch (type) {
            case 'syndicate':
            case 'syndicate-assassin':
                this.syndicateSelectPlayer(playerId);
                break;
            case 'detective':
                this.detectiveSelectPlayer(playerId);
                break;
            case 'bystander':
                this.bystanderSelectPlayer(playerId);
                break;
            case 'bodyguard':
                this.bodyGuardProtect(playerId);
                break;
            case 'bodyguard-bystander':
                this.bodyGuardBystanderSelect(playerId);
                break;
        }
    }

    getMyPlayerId() {
        // For test games, use the current test player ID
        if (this.isTestGame && this.currentTestPlayerId) {
            return this.currentTestPlayerId;
        }
        
        // Find our player ID from the players list
        if (this.phaseState && this.phaseState.players) {
            const myPlayer = this.phaseState.players.find(p => p.name === this.playerName);
            return myPlayer ? myPlayer.id : null;
        }
        return null;
    }

    getRoleInfo(role) {
        const roles = {
            'Syndicate': {
                title: 'Syndicate Member',
                description: 'You are part of a secret Syndicate seeking to eliminate a target. Work with your fellow members to coordinate your strategy.',
                abilities: [
                    'See your fellow Syndicate members',
                    'Vote on and recommend assassination targets',
                    'Coordinate your team strategy'
                ],
                winCondition: 'Eliminate your target or be the last team standing'
            },
            'Detective': {
                title: 'Detective',
                description: 'You are investigating a mysterious crime. Use your investigative skills to uncover the truth and identify the culprits.',
                abilities: [
                    'Investigate one player per phase',
                    'Take detailed case notes',
                    'Build a profile of suspects'
                ],
                winCondition: 'Identify and eliminate the Syndicate'
            },
            'Body Guard': {
                title: 'Body Guard',
                description: 'You are tasked with protecting someone from the Syndicate\'s reach. Choose wisely who to protect.',
                abilities: [
                    'Protect one player per phase',
                    'Participate in anonymous voting',
                    'Prevent assassination'
                ],
                winCondition: 'Keep your protected target alive and eliminate the Syndicate'
            },
            'Eye Witness': {
                title: 'Eye Witness',
                description: 'You witnessed something important. Use your knowledge to help identify the truth.',
                abilities: [
                    'Identify one player\'s role during the game',
                    'Participate in anonymous voting'
                ],
                winCondition: 'Identify the Syndicate and survive'
            },
            'Bystander': {
                title: 'Bystander',
                description: 'You are an innocent bystander drawn into this mystery. Try to stay alive and help eliminate the real threat.',
                abilities: [
                    'Vote anonymously on suspects',
                    'Listen carefully to discussions'
                ],
                winCondition: 'Survive and help eliminate the Syndicate'
            }
        };

        return roles[role] || {
            title: role,
            description: 'Unknown role',
            abilities: [],
            winCondition: 'Unknown'
        };
    }
    onReconnected(data) {
        this.reconnecting = false;
        this.updateConnectionStatus('connected');
        
        this.gameCode = data.gameCode;
        this.playerName = data.playerName;
        this.isHost = data.isHost;
        this.players = data.players;

        console.log('Reconnected to game', data.gameCode, 'as', data.playerName);

        // Restore game state based on status
        if (data.gameStatus === 'lobby') {
            // Back to lobby
            document.getElementById('display-game-code').textContent = data.gameCode;
            this.updatePlayerList(data.players);

            if (data.isHost) {
                document.getElementById('host-controls').style.display = 'block';
                document.getElementById('guest-message').style.display = 'none';
            } else {
                document.getElementById('host-controls').style.display = 'none';
                document.getElementById('guest-message').style.display = 'block';
            }

            this.showScreen('lobby-screen');
        } else if (data.gameStatus === 'playing' && data.role) {
            // Restore to role screen
            this.role = data.role;
            this.isReady = data.isReady;

            // Ensure roleDescription exists
            if (!data.roleDescription) {
                console.warn('Missing roleDescription in reconnected data, using fallback');
                data.roleDescription = {
                    title: data.role,
                    description: 'Role restored',
                    abilities: [],
                    winCondition: 'Eliminate Syndicate' 
                };
            }

            // Set role display
            const roleEl = document.getElementById('player-role');
            roleEl.textContent = data.roleDescription.title;
            roleEl.className = 'role-name ' + data.role.toLowerCase().replace(' ', '-');

            document.getElementById('role-description').textContent = data.roleDescription.description;

            // Set abilities
            const abilitiesList = document.getElementById('role-abilities-list');
            abilitiesList.innerHTML = '';
            (data.roleDescription.abilities || []).forEach(ability => {
                const li = document.createElement('li');
                li.textContent = ability;
                abilitiesList.appendChild(li);
            });

            document.getElementById('role-win-condition').textContent = data.roleDescription.winCondition || '';

            // Show teammates for Syndicate
            const teammatesSection = document.getElementById('teammates-section');
            const teammatesList = document.getElementById('teammates-list');

            if (data.role === 'Syndicate' && data.teammates && data.teammates.length > 0) {
                teammatesSection.style.display = 'block';
                teammatesList.innerHTML = '';
                data.teammates.forEach(name => {
                    const li = document.createElement('li');
                    li.textContent = name;
                    teammatesList.appendChild(li);
                });
            } else {
                teammatesSection.style.display = 'none';
            }

            // Update ready button state
            const readyBtn = document.getElementById('btn-ready');
            if (data.isReady) {
                readyBtn.disabled = true;
                readyBtn.textContent = '✓ Ready!';
            } else {
                readyBtn.disabled = false;
                readyBtn.textContent = "I'm Ready";
            }

            document.getElementById('ready-count').textContent = data.readyCount;
            document.getElementById('ready-total').textContent = data.totalPlayers;

            this.showScreen('role-screen');
        } else if (data.gameStatus && data.gameStatus.startsWith('phase')) {
            // Restore to phase screen
            this.role = data.role;
            document.getElementById('current-phase').textContent = data.phase || 1;
            this.showScreen('phase-screen');
        }

        this.showNotification(`Welcome back, ${data.playerName}!`);
    }

    onReconnectFailed(data) {
        this.reconnecting = false;
        this.updateConnectionStatus('connected');
        this.clearSession();
        console.log('Reconnect failed:', data.message);
        // Stay on home screen for new game
        this.showScreen('home-screen');
    }

    onPlayerDisconnected(data) {
        this.updatePlayerList(data.players);
        this.showNotification(`${data.playerName} disconnected`);
    }

    onPlayerReconnected(data) {
        this.updatePlayerList(data.players);
        this.showNotification(`${data.playerName} reconnected`);
    }

    showNotification(message) {
        // Create notification element if it doesn't exist
        let notification = document.getElementById('game-notification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'game-notification';
            notification.className = 'game-notification';
            document.body.appendChild(notification);
        }

        notification.textContent = message;
        notification.classList.add('show');

        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }

    updatePlayerList(players) {
        this.players = players;
        const listEl = document.getElementById('player-list');
        const countEl = document.getElementById('player-count');

        if (!listEl || !countEl) {
            console.warn('Player list or count element not found');
            return;
        }

        listEl.innerHTML = '';

        players.forEach((player, index) => {
            const li = document.createElement('li');
            const isDisconnected = player.connected === false;
            const isMe = player.name === this.playerName;
            const canRemove = this.isHost && !player.isHost && !isMe;
            
            li.className = isDisconnected ? 'disconnected' : '';
            li.innerHTML = `
                <span class="player-icon">${this.getPlayerIcon(index)}</span>
                <span class="player-name">${this.escapeHtml(player.name)}${isDisconnected ? ' <span class="disconnected-badge">⚡ Reconnecting...</span>' : ''}</span>
                ${player.isHost ? '<span class="host-badge">Host</span>' : ''}
                ${canRemove ? `<button class="btn-remove-player" data-player-id="${player.id}" title="Remove player">✕</button>` : ''}
            `;
            listEl.appendChild(li);
        });

        // Bind remove button events
        listEl.querySelectorAll('.btn-remove-player').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const playerId = btn.dataset.playerId;
                this.removePlayer(playerId);
            });
        });

        const count = players.length;
        countEl.textContent = `(${count}/5 minimum)`;

        this.updateStartButton();
    }

    updateStartButton() {
        if (!this.isHost) return;

        const startBtn = document.getElementById('btn-start-game');
        const hintEl = document.getElementById('start-hint');
        const count = this.players.length;

        if (count >= 5) {
            startBtn.disabled = false;
            hintEl.textContent = `Ready to start with ${count} players!`;
        } else {
            startBtn.disabled = true;
            hintEl.textContent = `Need ${5 - count} more player${5 - count !== 1 ? 's' : ''} to start`;
        }
    }

    handleError(message) {
        console.error('Game error:', message);
        // Show error in the appropriate screen
        const currentScreen = document.querySelector('.screen.active');

        if (currentScreen.id === 'create-screen') {
            this.showError('create-error', message);
        } else if (currentScreen.id === 'join-screen') {
            this.showError('join-error', message);
        } else if (currentScreen.id === 'lobby-screen') {
            this.showError('lobby-error', message);
        } else {
            // Show as notification if on another screen
            this.showNotification(message);
        }
    }

    // Utility Functions
    getPlayerIcon(index) {
        const icons = ['🎭', '🎩', '🕵️', '👤', '🎯', '🔮', '⚔️', '🛡️', '💀', '👁️'];
        return icons[index % icons.length];
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();
});
