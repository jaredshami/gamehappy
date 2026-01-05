const GameManager = require('./GameManager');

class SecretSyndicates extends GameManager {
    constructor(gameCode) {
        super(gameCode, 'secretsyndicates');
        
        // Game settings
        this.settings = {
            enableEyeWitness: false,
            enableBodyGuard: false
        };

        // Role assignments
        this.roles = new Map(); // playerToken -> role
        
        // Game phase tracking
        this.currentPhase = 'waiting'; // waiting, night, murder, discussion, vote, trial, ended
        this.currentRound = 0;
        this.phasesCompleted = 0;

        // Night phase data
        this.nightVotes = new Map(); // playerToken -> targetToken
        this.nightVotesLocked = new Map(); // playerToken -> isLocked

        // Murder phase
        this.lastMurderTarget = null;
        this.lastMurderAssassin = null;

        // Voting phase
        this.dayVotes = new Map(); // playerToken -> votedFor

        // Trial phase
        this.trialAccused = null;
        this.trialVotes = new Map(); // playerToken -> guilty/notguilty

        // Eliminated players
        this.eliminatedPlayers = new Set();

        // Phase readiness
        this.playersReady = new Set();
    }

    /**
     * Set game settings before start
     */
    setSettings(settings) {
        this.settings = { ...this.settings, ...settings };
    }

    /**
     * Assign roles to players
     */
    assignRoles() {
        const players = this.getPlayers();
        const totalPlayers = players.length;

        if (totalPlayers < 5) {
            return { success: false, message: 'Minimum 5 players required' };
        }

        // Calculate role distribution
        const syndicateCount = Math.max(1, Math.floor(totalPlayers / 3));
        const detectiveCount = Math.max(1, Math.floor(totalPlayers / 4));
        const eyeWitnessCount = this.settings.enableEyeWitness ? 1 : 0;
        const bodyGuardCount = this.settings.enableBodyGuard ? 1 : 0;
        
        let bystanders = totalPlayers - syndicateCount - detectiveCount - eyeWitnessCount - bodyGuardCount;
        if (bystanders < 0) {
            bodyGuardCount = 0;
            bystanders = totalPlayers - syndicateCount - detectiveCount - eyeWitnessCount;
        }

        // Create role list
        const roleList = [];
        for (let i = 0; i < syndicateCount; i++) roleList.push('Syndicate');
        for (let i = 0; i < detectiveCount; i++) roleList.push('Detective');
        if (eyeWitnessCount) roleList.push('Eye Witness');
        if (bodyGuardCount) roleList.push('Body Guard');
        for (let i = 0; i < bystanders; i++) roleList.push('Bystander');

        // Shuffle roles
        this.shuffleArray(roleList);

        // Assign roles to players
        for (let i = 0; i < players.length; i++) {
            this.roles.set(players[i].token, roleList[i]);
        }

        return { success: true, roles: this.roles };
    }

    /**
     * Get player's role
     */
    getPlayerRole(playerToken) {
        return this.roles.get(playerToken);
    }

    /**
     * Get all syndicate members
     */
    getSyndicateMembers() {
        const members = [];
        for (const [token, role] of this.roles) {
            if (role === 'Syndicate' && !this.eliminatedPlayers.has(token)) {
                members.push({ token, name: this.getPlayer(token).name });
            }
        }
        return members;
    }

    /**
     * Check if can start game
     */
    canStart() {
        return this.getPlayerCount() >= 5;
    }

    /**
     * Start the game
     */
    startGame() {
        if (!this.canStart()) {
            return { success: false, message: 'Need at least 5 players' };
        }

        const roleResult = this.assignRoles();
        if (!roleResult.success) {
            return roleResult;
        }

        this.gameState = 'started';
        this.currentRound = 1;
        this.currentPhase = 'night';

        return { 
            success: true, 
            message: 'Game started', 
            phase: this.currentPhase,
            round: this.currentRound
        };
    }

    /**
     * Player votes to lock in night action
     */
    nightVote(playerToken, targetToken) {
        const role = this.getPlayerRole(playerToken);

        // Only syndicate can vote in night phase
        if (role !== 'Syndicate') {
            return { success: false, message: 'Only Syndicate can vote in night' };
        }

        if (!this.players.has(targetToken)) {
            return { success: false, message: 'Invalid target' };
        }

        this.nightVotes.set(playerToken, targetToken);
        return { success: true, message: 'Vote recorded' };
    }

    /**
     * Lock in night votes
     */
    lockNightVotes(playerToken) {
        if (this.getPlayerRole(playerToken) !== 'Syndicate') {
            return { success: false, message: 'Only Syndicate can lock votes' };
        }

        this.nightVotesLocked.set(playerToken, true);
        return { success: true };
    }

    /**
     * Check if all syndicate members locked votes
     */
    allSyndicateLocked() {
        const syndicate = this.getSyndicateMembers();
        return syndicate.every(s => this.nightVotesLocked.has(s.token));
    }

    /**
     * Execute the night phase (determine victim)
     */
    executeNightPhase() {
        const votes = new Map();
        
        // Count votes from syndicate
        for (const [voter, target] of this.nightVotes) {
            const count = votes.get(target) || 0;
            votes.set(target, count + 1);
        }

        // Find target with most votes
        let target = null;
        let maxVotes = 0;
        for (const [playerToken, voteCount] of votes) {
            if (voteCount > maxVotes) {
                maxVotes = voteCount;
                target = playerToken;
            }
        }

        if (target) {
            this.lastMurderTarget = target;
            this.lastMurderAssassin = this.findAssassinForTarget(target);
            this.eliminatedPlayers.add(target);
        }

        // Move to murder phase
        this.currentPhase = 'murder';
        this.nightVotes.clear();
        this.nightVotesLocked.clear();
        this.playersReady.clear();

        return { success: true, target: target, assassin: this.lastMurderAssassin };
    }

    /**
     * Find who cast the winning vote for target
     */
    findAssassinForTarget(target) {
        for (const [voter, voted] of this.nightVotes) {
            if (voted === target) return voter;
        }
        return null;
    }

    /**
     * Day phase: player votes who to arrest
     */
    dayVote(playerToken, votedForToken) {
        if (this.eliminatedPlayers.has(playerToken)) {
            return { success: false, message: 'Eliminated players cannot vote' };
        }

        this.dayVotes.set(playerToken, votedForToken);
        return { success: true };
    }

    /**
     * Execute day phase voting
     */
    executeDayVoting() {
        const votes = new Map();
        
        for (const [voter, target] of this.dayVotes) {
            const count = votes.get(target) || 0;
            votes.set(target, count + 1);
        }

        let target = null;
        let maxVotes = 0;
        for (const [playerToken, voteCount] of votes) {
            if (voteCount > maxVotes) {
                maxVotes = voteCount;
                target = playerToken;
            }
        }

        this.trialAccused = target;
        this.currentPhase = 'trial';
        this.dayVotes.clear();
        this.playersReady.clear();

        return { success: true, accused: target };
    }

    /**
     * Trial voting
     */
    trialVote(playerToken, vote) {
        if (this.eliminatedPlayers.has(playerToken)) {
            return { success: false, message: 'Eliminated players cannot vote' };
        }

        if (!['guilty', 'notguilty'].includes(vote)) {
            return { success: false, message: 'Invalid vote' };
        }

        this.trialVotes.set(playerToken, vote);
        return { success: true };
    }

    /**
     * Execute trial
     */
    executeTrial() {
        let guiltyCount = 0;
        let notGuiltyCount = 0;

        for (const vote of this.trialVotes.values()) {
            if (vote === 'guilty') guiltyCount++;
            else notGuiltyCount++;
        }

        const convicted = guiltyCount > notGuiltyCount;
        
        if (convicted) {
            this.eliminatedPlayers.add(this.trialAccused);
        }

        this.trialVotes.clear();
        this.playersReady.clear();

        // Check win conditions
        const winResult = this.checkWinCondition();
        if (winResult.gameEnded) {
            this.currentPhase = 'ended';
            return { success: true, convicted, winner: winResult.winner };
        }

        // Next round
        this.currentRound++;
        this.currentPhase = 'night';
        
        return { success: true, convicted, nextPhase: 'night' };
    }

    /**
     * Check win conditions
     */
    checkWinCondition() {
        const syndicate = this.getSyndicateMembers();
        const alive = this.getAlivePlayers();
        const townAlive = alive.filter(p => !syndicate.some(s => s.token === p.token));

        // Syndicate wins if they equal or outnumber town
        if (syndicate.length >= townAlive.length) {
            return { gameEnded: true, winner: 'Syndicate' };
        }

        // Town wins if all syndicate eliminated
        if (syndicate.length === 0) {
            return { gameEnded: true, winner: 'Town' };
        }

        return { gameEnded: false };
    }

    /**
     * Get alive players
     */
    getAlivePlayers() {
        return this.getPlayers().filter(p => !this.eliminatedPlayers.has(p.token));
    }

    /**
     * Mark player as ready for next phase
     */
    setPlayerReady(playerToken) {
        if (this.players.has(playerToken)) {
            this.playersReady.add(playerToken);
            return true;
        }
        return false;
    }

    /**
     * Check if all players ready
     */
    allPlayersReady() {
        return this.playersReady.size === this.getAlivePlayers().length;
    }

    /**
     * Shuffle array helper
     */
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    /**
     * Get game state for player
     */
    getGameStateForPlayer(playerToken) {
        return {
            gameCode: this.gameCode,
            gameType: this.gameType,
            gameState: this.gameState,
            currentPhase: this.currentPhase,
            currentRound: this.currentRound,
            playerRole: this.getPlayerRole(playerToken),
            players: this.getPlayers(),
            alivePlayers: this.getAlivePlayers(),
            eliminated: Array.from(this.eliminatedPlayers),
            syndicate: this.getSyndicateMembers(),
            readyCount: this.playersReady.size,
            totalPlayers: this.getPlayerCount(),
            alivePlayers: this.getAlivePlayers().length
        };
    }

    /**
     * Handle game-specific events
     */
    handleEvent(eventName, playerToken, data) {
        switch (eventName) {
            case 'night-vote':
                return this.nightVote(playerToken, data.target);
            case 'night-lock':
                return this.lockNightVotes(playerToken);
            case 'day-vote':
                return this.dayVote(playerToken, data.target);
            case 'trial-vote':
                return this.trialVote(playerToken, data.vote);
            case 'player-ready':
                this.setPlayerReady(playerToken);
                return { success: true };
            default:
                return { success: false, message: 'Unknown event' };
        }
    }
}

module.exports = SecretSyndicates;
