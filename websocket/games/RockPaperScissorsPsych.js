const GameManager = require('./GameManager');

class RockPaperScissorsPsych extends GameManager {
    constructor(gameCode) {
        super(gameCode, 'rockpaperscissorspsych');
        
        // Game state
        this.phase = 'waiting'; // waiting, lobby, intention-select, ready, countdown, actual-choice, round-result, game-over
        this.roundNumber = 0;
        this.activePlayers = new Map(); // playerToken -> player data
        this.psychedPlayers = new Set(); // playerToken set of eliminated players
        
        // Current round data
        this.intentions = new Map(); // playerToken -> 'rock'/'paper'/'scissors'
        this.readyPlayers = new Set(); // playerToken set
        this.actualChoices = new Map(); // playerToken -> 'rock'/'paper'/'scissors'
        this.scores = new Map(); // playerToken -> score (hidden from clients)
        
        // Round result
        this.roundResult = {
            winner: null,
            psychedPlayers: [],
            roundWinners: []
        };
    }

    /**
     * Add a player to the game
     */
    addPlayer(playerToken, playerName) {
        const result = super.addPlayer(playerToken, playerName);
        if (result.success) {
            this.activePlayers.set(playerToken, {
                token: playerToken,
                name: playerName,
                intention: null,
                actual: null,
                ready: false
            });
            this.scores.set(playerToken, 0);
        }
        return result;
    }

    /**
     * Remove a player from the game
     */
    removePlayer(playerToken) {
        this.activePlayers.delete(playerToken);
        this.scores.delete(playerToken);
        this.psychedPlayers.add(playerToken);
        return super.removePlayer(playerToken);
    }

    /**
     * Start the game
     */
    startGame() {
        if (this.activePlayers.size < 2) {
            return { success: false, message: 'Minimum 2 players required' };
        }

        this.phase = 'intention-select';
        this.roundNumber = 1;
        this.resetRound();
        
        return {
            success: true,
            phase: this.phase,
            roundNumber: this.roundNumber,
            activePlayers: Array.from(this.activePlayers.values()).map(p => ({
                token: p.token,
                name: p.name
            }))
        };
    }

    /**
     * Reset round data
     */
    resetRound() {
        this.intentions.clear();
        this.readyPlayers.clear();
        this.actualChoices.clear();
        this.roundResult = { winner: null, psychedPlayers: [], roundWinners: [] };
    }

    /**
     * Player selects intention
     */
    selectIntention(playerToken, choice) {
        if (!this.activePlayers.has(playerToken) || this.psychedPlayers.has(playerToken)) {
            return { success: false, message: 'Invalid player' };
        }

        if (!['rock', 'paper', 'scissors'].includes(choice)) {
            return { success: false, message: 'Invalid choice' };
        }

        this.intentions.set(playerToken, choice);
        this.activePlayers.get(playerToken).intention = choice;

        return {
            success: true,
            intentions: this.getIntentionsForBroadcast()
        };
    }

    /**
     * Get intentions for broadcast (visible to all)
     */
    getIntentionsForBroadcast() {
        const result = {};
        for (const [token, choice] of this.intentions) {
            const player = this.activePlayers.get(token);
            if (player) {
                result[token] = {
                    name: player.name,
                    choice: choice
                };
            }
        }
        return result;
    }

    /**
     * Player marks ready
     */
    playerReady(playerToken) {
        if (!this.activePlayers.has(playerToken) || this.psychedPlayers.has(playerToken)) {
            return { success: false, message: 'Invalid player' };
        }

        if (!this.intentions.has(playerToken)) {
            return { success: false, message: 'Must select intention first' };
        }

        this.readyPlayers.add(playerToken);
        const activePlayers = Array.from(this.activePlayers.keys()).filter(p => !this.psychedPlayers.has(p));

        // All ready?
        if (this.readyPlayers.size === activePlayers.length) {
            return { success: true, allReady: true };
        }

        return { success: true, allReady: false };
    }

    /**
     * Player makes actual choice
     */
    makeActualChoice(playerToken, choice) {
        if (!this.activePlayers.has(playerToken) || this.psychedPlayers.has(playerToken)) {
            return { success: false, message: 'Invalid player' };
        }

        if (!['rock', 'paper', 'scissors'].includes(choice)) {
            return { success: false, message: 'Invalid choice' };
        }

        this.actualChoices.set(playerToken, choice);
        return { success: true };
    }

    /**
     * End round - calculate results
     */
    endRound() {
        const activePlayers = Array.from(this.activePlayers.keys()).filter(p => !this.psychedPlayers.has(p));
        
        // Check for psyches first
        const psychedThisRound = [];
        for (const playerToken of activePlayers) {
            const intention = this.intentions.get(playerToken);
            const actual = this.actualChoices.get(playerToken);
            const won = this.didPlayerWinRound(playerToken, activePlayers);

            // PSYCH: intention == actual AND won
            if (intention === actual && won) {
                psychedThisRound.push(playerToken);
            }
        }

        // If psyches occurred, eliminate others and give psycher points
        if (psychedThisRound.length > 0) {
            for (const psycher of psychedThisRound) {
                const psychedCount = activePlayers.length - 1; // Everyone else
                this.scores.set(psycher, (this.scores.get(psycher) || 0) + (psychedCount * 3));
                
                // Eliminate non-psychers
                for (const player of activePlayers) {
                    if (!psychedThisRound.includes(player)) {
                        this.psychedPlayers.add(player);
                    }
                }
            }

            this.roundResult = {
                type: 'psych',
                psychedPlayers: psychedThisRound.map(t => this.activePlayers.get(t).name),
                eliminated: activePlayers
                    .filter(p => !psychedThisRound.includes(p))
                    .map(t => this.activePlayers.get(t).name)
            };
        } else {
            // Normal round - determine winner(s)
            const roundWinners = this.calculateRoundWinners(activePlayers);

            for (const winner of roundWinners) {
                this.scores.set(winner, (this.scores.get(winner) || 0) + 1);
            }

            // Losers lose a point
            for (const player of activePlayers) {
                if (!roundWinners.includes(player)) {
                    this.scores.set(player, (this.scores.get(player) || 0) - 1);
                }
            }

            this.roundResult = {
                type: 'normal',
                winners: roundWinners.map(t => this.activePlayers.get(t).name),
                choices: this.getChoicesForResult(activePlayers)
            };
        }

        return this.roundResult;
    }

    /**
     * Calculate normal round winners
     */
    calculateRoundWinners(activePlayers) {
        const choiceCounts = { rock: 0, paper: 0, scissors: 0 };
        const choiceMap = { rock: [], paper: [], scissors: [] };

        for (const player of activePlayers) {
            const choice = this.actualChoices.get(player);
            choiceCounts[choice]++;
            choiceMap[choice].push(player);
        }

        // All same choice
        if (Object.values(choiceCounts).filter(c => c > 0).length === 1) {
            return activePlayers; // Everyone wins (gets point)
        }

        // Different choices
        if (choiceCounts.rock > 0 && choiceCounts.paper > 0 && choiceCounts.scissors > 0) {
            // Three-way tie - no winner
            return [];
        }

        // Two choices - determine winner
        if (choiceCounts.rock > 0 && choiceCounts.paper > 0) {
            // Paper wins over rock
            return choiceMap.paper;
        }
        if (choiceCounts.rock > 0 && choiceCounts.scissors > 0) {
            // Rock wins over scissors
            return choiceMap.rock;
        }
        if (choiceCounts.paper > 0 && choiceCounts.scissors > 0) {
            // Scissors wins over paper
            return choiceMap.scissors;
        }

        return [];
    }

    /**
     * Check if player won this round (before PSYCH check)
     */
    didPlayerWinRound(playerToken, activePlayers) {
        const winners = this.calculateRoundWinners(activePlayers);
        return winners.includes(playerToken);
    }

    /**
     * Get choices for result display
     */
    getChoicesForResult(activePlayers) {
        const result = {};
        for (const playerToken of activePlayers) {
            const player = this.activePlayers.get(playerToken);
            result[playerToken] = {
                name: player.name,
                choice: this.actualChoices.get(playerToken)
            };
        }
        return result;
    }

    /**
     * Check if game is over
     */
    isGameOver() {
        const activePlayers = Array.from(this.activePlayers.keys()).filter(p => !this.psychedPlayers.has(p));
        return activePlayers.length <= 1;
    }

    /**
     * Get final winner
     */
    getWinner() {
        const activePlayers = Array.from(this.activePlayers.keys()).filter(p => !this.psychedPlayers.has(p));
        if (activePlayers.length === 1) {
            return {
                winner: this.activePlayers.get(activePlayers[0]).name,
                scores: this.getScoresForResult()
            };
        }
        return null;
    }

    /**
     * Get scores for final result (revealed at end)
     */
    getScoresForResult() {
        const result = {};
        for (const [token, score] of this.scores) {
            const player = this.activePlayers.get(token);
            if (player) {
                result[token] = {
                    name: player.name,
                    score: score,
                    psyched: this.psychedPlayers.has(token)
                };
            }
        }
        return result;
    }

    /**
     * Get active players list
     */
    getActivePlayers() {
        return Array.from(this.activePlayers.values())
            .filter(p => !this.psychedPlayers.has(p.token))
            .map(p => ({ token: p.token, name: p.name }));
    }
}

module.exports = RockPaperScissorsPsych;
