const GameManager = require('./GameManager');

class FlagGuardians extends GameManager {
    constructor(gameCode) {
        super(gameCode, 'flagguardians');
        
        // Team assignments
        this.teams = new Map(); // playerToken -> 'red' or 'blue'
        
        // Game phase tracking
        this.currentPhase = 'waiting'; // waiting, ready, active, finished
        this.currentRound = 0;
        this.maxRounds = 3;
        
        // Team scores
        this.redScore = 0;
        this.blueScore = 0;
        
        // Flag status
        this.redFlagHeld = null; // playerToken if held, null if secure
        this.blueFlagHeld = null; // playerToken if held, null if secure
        
        // Gameplay tracking
        this.captureEvents = []; // Track flag captures
        this.roundHistory = []; // Track rounds
        
        // Team data for lobby
        this.redTeam = []; // Array of player objects
        this.blueTeam = []; // Array of player objects
    }

    /**
     * Add a player to the game (override to include team assignment)
     */
    addPlayer(playerToken, playerName) {
        const result = super.addPlayer(playerToken, playerName);
        if (result.success) {
            // Initialize team as null - player must select team in lobby
            this.teams.set(playerToken, null);
        }
        return result;
    }

    /**
     * Remove a player from the game
     */
    removePlayer(playerToken) {
        const team = this.teams.get(playerToken);
        this.teams.delete(playerToken);
        
        // Remove from team roster
        if (team === 'red') {
            this.redTeam = this.redTeam.filter(p => p.token !== playerToken);
        } else if (team === 'blue') {
            this.blueTeam = this.blueTeam.filter(p => p.token !== playerToken);
        }

        return super.removePlayer(playerToken);
    }

    /**
     * Player selects a team
     */
    selectTeam(playerToken, team) {
        if (!this.players.has(playerToken)) {
            return { success: false, message: 'Player not in game' };
        }

        if (team !== 'red' && team !== 'blue') {
            return { success: false, message: 'Invalid team' };
        }

        const player = this.players.get(playerToken);
        const oldTeam = this.teams.get(playerToken);

        // Remove from old team if switching
        if (oldTeam === 'red') {
            this.redTeam = this.redTeam.filter(p => p.token !== playerToken);
        } else if (oldTeam === 'blue') {
            this.blueTeam = this.blueTeam.filter(p => p.token !== playerToken);
        }

        // Add to new team
        this.teams.set(playerToken, team);
        const playerData = { token: playerToken, name: player.name };
        
        if (team === 'red') {
            this.redTeam.push(playerData);
        } else {
            this.blueTeam.push(playerData);
        }

        return { success: true, message: `Joined ${team} team` };
    }

    /**
     * Get team roster
     */
    getTeamRoster() {
        return {
            redTeam: this.redTeam,
            blueTeam: this.blueTeam
        };
    }

    /**
     * Check if game can start
     */
    canStart() {
        // Minimum 2 players total (1v1)
        // All players must have selected a team
        if (this.players.size < 2) {
            return false;
        }

        for (let playerToken of this.players.keys()) {
            if (this.teams.get(playerToken) === null) {
                return false;
            }
        }

        return true;
    }

    /**
     * Get game starting validation message
     */
    getStartValidation() {
        if (this.players.size < 2) {
            return { valid: false, message: 'Need at least 2 players' };
        }

        const unassignedPlayers = Array.from(this.players.keys())
            .filter(token => this.teams.get(token) === null);

        if (unassignedPlayers.length > 0) {
            return { valid: false, message: 'All players must select a team' };
        }

        return { valid: true };
    }

    /**
     * Start the game
     */
    startGame() {
        const validation = this.getStartValidation();
        if (!validation.valid) {
            return { success: false, message: validation.message };
        }

        this.gameState = 'started';
        this.currentPhase = 'active';
        this.currentRound = 1;
        this.redScore = 0;
        this.blueScore = 0;
        
        // Initialize flags (not held by anyone)
        this.redFlagHeld = null;
        this.blueFlagHeld = null;

        return { 
            success: true, 
            message: 'Game started',
            gameState: this.getGameState()
        };
    }

    /**
     * Handle player action (flag capture, etc.)
     */
    handlePlayerAction(playerToken, action, targetData = {}) {
        if (!this.players.has(playerToken)) {
            return { success: false, message: 'Player not found' };
        }

        const player = this.players.get(playerToken);
        const playerTeam = this.teams.get(playerToken);

        switch (action) {
            case 'capture-flag':
                return this.captureFlag(playerToken, playerTeam);
            case 'defend-flag':
                return this.defendFlag(playerToken, playerTeam, targetData);
            default:
                return { success: false, message: 'Unknown action' };
        }
    }

    /**
     * Capture enemy flag
     */
    captureFlag(playerToken, playerTeam) {
        if (playerTeam === 'red') {
            if (this.blueFlagHeld === null) {
                this.blueFlagHeld = playerToken;
                this.captureEvents.push({
                    round: this.currentRound,
                    playerToken,
                    playerTeam,
                    action: 'flag-capture',
                    target: 'blue',
                    timestamp: Date.now()
                });
                return { success: true, message: 'Blue flag captured!' };
            }
        } else if (playerTeam === 'blue') {
            if (this.redFlagHeld === null) {
                this.redFlagHeld = playerToken;
                this.captureEvents.push({
                    round: this.currentRound,
                    playerToken,
                    playerTeam,
                    action: 'flag-capture',
                    target: 'red',
                    timestamp: Date.now()
                });
                return { success: true, message: 'Red flag captured!' };
            }
        }

        return { success: false, message: 'Flag already held' };
    }

    /**
     * Score a flag capture (return flag to base)
     */
    scoreCapture(playerToken, playerTeam) {
        if (playerTeam === 'red' && this.blueFlagHeld === playerToken) {
            this.redScore += 1;
            this.blueFlagHeld = null;
            return { success: true, message: 'Red team scores!', points: 1 };
        } else if (playerTeam === 'blue' && this.redFlagHeld === playerToken) {
            this.blueScore += 1;
            this.redFlagHeld = null;
            return { success: true, message: 'Blue team scores!', points: 1 };
        }

        return { success: false, message: 'Cannot score' };
    }

    /**
     * Defend flag (block opponent)
     */
    defendFlag(playerToken, playerTeam, targetData) {
        const defender = this.players.get(playerToken);
        
        this.captureEvents.push({
            round: this.currentRound,
            playerToken,
            playerTeam,
            action: 'flag-defense',
            target: playerTeam === 'red' ? 'red' : 'blue',
            timestamp: Date.now()
        });

        return { success: true, message: `${defender.name} defended the flag!` };
    }

    /**
     * Complete a round
     */
    completeRound() {
        // Return any held flags to base
        this.redFlagHeld = null;
        this.blueFlagHeld = null;

        this.roundHistory.push({
            round: this.currentRound,
            redScore: this.redScore,
            blueScore: this.blueScore,
            events: [...this.captureEvents]
        });

        // Check if game should end (best of 3)
        if (this.currentRound >= this.maxRounds) {
            this.currentPhase = 'finished';
            return { gameEnded: true, winner: this.getWinner() };
        }

        this.currentRound++;
        return { gameEnded: false, nextRound: this.currentRound };
    }

    /**
     * Get winner
     */
    getWinner() {
        if (this.redScore > this.blueScore) {
            return 'red';
        } else if (this.blueScore > this.redScore) {
            return 'blue';
        } else {
            return 'tie';
        }
    }

    /**
     * Get current game state
     */
    getGameState() {
        return {
            gameCode: this.gameCode,
            gameType: this.gameType,
            gameState: this.gameState,
            currentPhase: this.currentPhase,
            currentRound: this.currentRound,
            players: this.getPlayers(),
            playerCount: this.getPlayerCount(),
            redTeam: this.redTeam,
            blueTeam: this.blueTeam,
            scores: {
                red: this.redScore,
                blue: this.blueScore
            },
            flagStatus: {
                redFlag: this.redFlagHeld,
                blueFlag: this.blueFlagHeld
            }
        };
    }

    /**
     * Get lobby info with team data
     */
    getLobbyInfo() {
        const base = super.getLobbyInfo();
        return {
            ...base,
            redTeam: this.redTeam,
            blueTeam: this.blueTeam,
            currentPhase: this.currentPhase
        };
    }

    /**
     * Get game results
     */
    getGameResults() {
        return {
            gameCode: this.gameCode,
            winner: this.getWinner(),
            finalScores: {
                red: this.redScore,
                blue: this.blueScore
            },
            redTeam: this.redTeam,
            blueTeam: this.blueTeam,
            roundHistory: this.roundHistory,
            captureEvents: this.captureEvents
        };
    }
}

module.exports = FlagGuardians;
