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
        this.currentPhaseStory = null;  // Story for current phase (generated once, used for all)

        // Night phase data
        this.nightVotes = new Map(); // playerToken -> targetToken
        this.nightVotesLocked = new Map(); // playerToken -> isLocked

        // Murder phase
        this.lastMurderTarget = null;
        this.lastMurderAssassin = null;
        this.lastVictim = null;  // The victim object

        // Voting phase
        this.dayVotes = new Map(); // playerToken -> votedFor

        // Trial phase
        this.trialAccused = null;
        this.trialVotes = new Map(); // playerToken -> guilty/notguilty

        // Accusation phase (phase 4)
        this.accusationVotes = new Map(); // playerToken -> targetToken

        // Detective investigations
        this.detectiveInvestigations = new Map(); // playerToken -> { targetToken, targetName, round, results: null }

        // Phase readiness
        this.playersReady = new Set();
        
        // Phase completion tracking
        this.playersDone = new Set();
        
        // Detective case notes - persists across rounds and phases
        this.detectiveCaseNotes = {}; // playerToken -> Map of targetToken -> Set of tags
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

        console.log(`[${this.gameCode}] Role assignment for ${totalPlayers} players:`, {
            syndicateCount,
            detectiveCount,
            eyeWitnessCount,
            bodyGuardCount,
            bystanders,
            roleList
        });

        // Shuffle roles
        this.shuffleArray(roleList);

        console.log(`[${this.gameCode}] Roles after shuffle:`, roleList);

        // Assign roles to players
        for (let i = 0; i < players.length; i++) {
            this.roles.set(players[i].token, roleList[i]);
            console.log(`[${this.gameCode}] Assigned ${players[i].name} (${players[i].token}): ${roleList[i]}`);
        }

        console.log(`[${this.gameCode}] Final roles map:`, Array.from(this.roles.entries()).map(([token, role]) => ({ token, role })));

        return { success: true, roles: this.roles };
    }

    /**
     * Get all roles that are in the game
     */
    getAvailableRoles() {
        const rolesInGame = new Set();
        for (const role of this.roles.values()) {
            rolesInGame.add(role);
        }
        
        // Convert to array and always include Detective
        const result = Array.from(rolesInGame);
        if (!result.includes('Detective')) {
            result.push('Detective');
        }
        
        return result;
    }

    /**
     * Get player's role
     */
    getPlayerRole(playerToken) {
        const role = this.roles.get(playerToken);
        if (!role) {
            console.warn(`[${this.gameCode}] No role found for player ${playerToken}. Available roles:`, Array.from(this.roles.entries()));
        }
        return role;
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
     * Advance to the next phase
     */
    advancePhase() {
        console.log(`[${this.gameCode}] advancePhase() called. Current phase: ${this.currentPhase}, playersDone: ${this.playersDone.size}, alivePlayers: ${this.getAlivePlayers().length}`);
        
        const previousPhase = this.currentPhase;
        
        // Reset done tracking for the new phase
        this.playersDone.clear();
        this.playersReady.clear();
        this.currentPhaseStory = null;  // Reset story for new phase
        
        // Advance phase: night -> murder -> trial -> accusation -> verdict -> night (repeat)
        switch (this.currentPhase) {
            case 'night':
                // Execute night votes to determine the victim
                this.executeNightPhase();
                this.currentPhase = 'murder';
                
                // Now set lastVictim from lastMurderTarget
                if (this.lastMurderTarget) {
                    const victim = this.players.get(this.lastMurderTarget);
                    if (victim) {
                        this.lastVictim = victim;
                        // Add to eliminated when advancing to murder phase
                        this.eliminatedPlayers.add(this.lastMurderTarget);
                        this.murderEliminatedPlayer = this.lastMurderTarget;
                        console.log(`[${this.gameCode}] Victim set to: ${victim.name}`);
                        // Generate the story once for this phase
                        this.currentPhaseStory = this.getMurderStory();
                        console.log(`[${this.gameCode}] Murder story generated: ${this.currentPhaseStory}`);
                    }
                } else {
                    // Fallback: Auto-select a random alive player as victim if no target was selected
                    const alivePlayers = this.getAlivePlayers();
                    if (alivePlayers.length > 0) {
                        const randomVictim = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
                        this.lastMurderTarget = randomVictim.token;
                        this.lastVictim = randomVictim;
                        this.eliminatedPlayers.add(this.lastMurderTarget);
                        this.murderEliminatedPlayer = this.lastMurderTarget;
                        console.log(`[${this.gameCode}] No votes, auto-selecting: ${randomVictim.name} (${randomVictim.token})`);
                        this.currentPhaseStory = this.getMurderStory();
                    }
                }
                this.playersReady.clear();
                break;
            case 'murder':
                this.currentPhase = 'trial';
                break;
            case 'trial':
                this.currentPhase = 'accusation';
                break;
            case 'accusation':
                // Count accusations and determine who was accused
                if (this.accusationVotes.size > 0) {
                    const voteCounts = new Map();
                    for (const targetToken of this.accusationVotes.values()) {
                        voteCounts.set(targetToken, (voteCounts.get(targetToken) || 0) + 1);
                    }
                    
                    let mostAccused = null;
                    let maxVotes = 0;
                    for (const [targetToken, count] of voteCounts) {
                        if (count > maxVotes) {
                            maxVotes = count;
                            mostAccused = targetToken;
                        }
                    }
                    
                    this.accusedPlayer = mostAccused;
                    console.log(`[${this.gameCode}] Most accused player: ${mostAccused} with ${maxVotes} votes`);
                }
                
                // Clear votes and advance to verdict phase
                this.accusationVotes.clear();
                this.currentPhase = 'verdict';
                break;
            case 'verdict':
                // Execute verdict votes: check if majority voted guilty
                const guiltVotes = Array.from(this.trialVotes.values()).filter(v => v === 'guilty').length;
                const totalVotes = this.trialVotes.size;
                const majorityVotedGuilty = guiltVotes > totalVotes / 2;
                
                // Track the newly eliminated player for the verdict phase
                this.verdictEliminatedPlayer = null;
                
                if (majorityVotedGuilty && this.accusedPlayer) {
                    // Majority voted guilty - eliminate the accused player
                    this.eliminatedPlayers.add(this.accusedPlayer);
                    this.verdictEliminatedPlayer = this.accusedPlayer;
                    console.log(`[${this.gameCode}] Player ${this.accusedPlayer} eliminated by guilty verdict (${guiltVotes}/${totalVotes} votes)`);
                } else if (this.accusedPlayer) {
                    console.log(`[${this.gameCode}] Player ${this.accusedPlayer} acquitted (${guiltVotes}/${totalVotes} votes for guilty)`);
                }
                
                // CRITICAL: Reset ALL round-specific state for new round
                this.currentPhase = 'night';
                this.currentRound++;
                
                // Clear all voting/action state from previous round
                this.trialVotes.clear();
                this.accusationVotes.clear();
                this.nightVotes.clear();
                this.nightVotesLocked.clear();
                this.dayVotes.clear();
                this.playersDone.clear();
                this.playersReady.clear();
                this.detectiveInvestigations.clear();  // Clear old investigations for new round
                
                // Clear round-specific tracking
                this.accusedPlayer = null;
                this.lastMurderTarget = null;
                this.lastMurderAssassin = null;
                this.lastVictim = null;
                this.currentPhaseStory = null;
                
                console.log(`[${this.gameCode}] Reset all round state for round ${this.currentRound}`);
                break;
            default:
                this.currentPhase = 'night';
                break;
        }
        
        return {
            success: true,
            phase: this.currentPhase,
            previousPhase: previousPhase,
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
        }

        this.nightVotes.clear();
        this.nightVotesLocked.clear();

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

        // Normalize vote value (accept both 'not-guilty' and 'notguilty')
        const normalizedVote = vote.toLowerCase().replace('-', '');
        
        if (!['guilty', 'notguilty'].includes(normalizedVote)) {
            return { success: false, message: 'Invalid vote' };
        }

        this.trialVotes.set(playerToken, normalizedVote);
        return { success: true };
    }

    accusationVote(playerToken, targetToken) {
        if (this.eliminatedPlayers.has(playerToken)) {
            return { success: false, message: 'Eliminated players cannot vote' };
        }

        // Validate target is a real alive player
        if (!this.players.has(targetToken) || this.eliminatedPlayers.has(targetToken)) {
            return { success: false, message: 'Invalid target' };
        }

        this.accusationVotes.set(playerToken, targetToken);
        console.log(`[${this.gameCode}] Accusation vote recorded: ${playerToken} -> ${targetToken}, total votes: ${this.accusationVotes.size}`);
        return { success: true, voteCount: this.accusationVotes.size };
    }

    /**
     * Execute accusation votes and eliminate the most voted player
     */
    executeAccusationVotes() {
        if (this.accusationVotes.size === 0) {
            console.log(`[${this.gameCode}] No accusation votes cast`);
            return null;
        }

        // Count votes for each target
        const voteCounts = new Map();
        for (const targetToken of this.accusationVotes.values()) {
            voteCounts.set(targetToken, (voteCounts.get(targetToken) || 0) + 1);
        }

        // Find player with most votes
        let mostVoted = null;
        let maxVotes = 0;
        for (const [targetToken, count] of voteCounts) {
            console.log(`[${this.gameCode}] Accusation vote count for ${targetToken}: ${count}`);
            if (count > maxVotes) {
                maxVotes = count;
                mostVoted = targetToken;
            }
        }

        console.log(`[${this.gameCode}] Most voted player: ${mostVoted} with ${maxVotes} votes`);

        if (mostVoted) {
            this.eliminatedPlayers.add(mostVoted);
            const victim = this.players.get(mostVoted);
            console.log(`[${this.gameCode}] Eliminated by accusation: ${victim?.name || mostVoted}`);
        }

        this.accusationVotes.clear();
        return mostVoted;
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
        this.detectiveInvestigations.clear();  // Clear old investigations for new round
        
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
     * Mark player as done with current phase
     */
    setPlayerDone(playerToken) {
        if (this.players.has(playerToken)) {
            this.playersDone.add(playerToken);
            console.log(`[${this.gameCode}] setPlayerDone: ${playerToken}, playersDone size now: ${this.playersDone.size}, alivePlayers: ${this.getAlivePlayers().length}`);
            return true;
        }
        return false;
    }

    /**
     * Check if all players are done
     */
    allPlayersDone() {
        const alivePlayers = this.getAlivePlayers().length;
        const isDone = this.playersDone.size === alivePlayers;
        console.log(`[${this.gameCode}] allPlayersDone check: playersDone=${this.playersDone.size}, alivePlayers=${alivePlayers}, isDone=${isDone}`);
        return isDone;
    }

    /**
     * Get done count
     */
    getDoneCount() {
        return this.playersDone.size;
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
     * Build detective data object with case notes and investigation results
     * Only includes investigation results if this is the first phase after investigation was locked
     */
    buildDetectiveData(detectiveToken, alivePlayersWithStatus, currentPhase = null) {
        const detectiveData = {
            caseNotes: this.detectiveCaseNotes[detectiveToken] || {},
            caseNotesPlayers: alivePlayersWithStatus,
            availableRoles: this.getAvailableRoles()
        };

        // Only add investigation results in the phase after they were locked in
        const investigation = this.detectiveInvestigations.get(detectiveToken);
        if (investigation && investigation.results && !investigation.displayed) {
            // Results should only be shown once in the next phase
            investigation.displayed = true;
            detectiveData.investigationResults = investigation.results;
        }

        return detectiveData;
    }

    /**
     * Get game state for player
     */
    getGameStateForPlayer(playerToken) {
        const playerRole = this.getPlayerRole(playerToken);
        const player = this.players.get(playerToken);
        
        // Ensure eliminatedPlayers is initialized (for backward compatibility)
        if (!this.eliminatedPlayers) {
            this.eliminatedPlayers = new Set();
        }
        
        // Transform players array to include id and alive status
        const playersWithStatus = this.getPlayers().map(p => ({
            id: p.token,  // Use token as id for client
            name: p.name,
            token: p.token,
            isHost: p.isHost,
            alive: !this.eliminatedPlayers.has(p.token),
            joinedAt: p.joinedAt
        }));
        
        // Transform alive players similarly
        const alivePlayersWithStatus = this.getAlivePlayers().map(p => ({
            id: p.token,
            name: p.name,
            token: p.token,
            isHost: p.isHost,
            alive: true,
            joinedAt: p.joinedAt
        }));
        
        const gameState = {
            gameCode: this.gameCode,
            gameType: this.gameType,
            gameState: this.gameState,
            currentPhase: this.currentPhase,
            currentRound: this.currentRound,
            playerRole: playerRole,
            role: playerRole,  // Alias for client compatibility
            isHost: player && player.isHost ? true : false,
            players: playersWithStatus,
            alivePlayers: alivePlayersWithStatus,
            eliminated: Array.from(this.eliminatedPlayers),
            syndicate: this.getSyndicateMembers(),
            readyCount: this.playersReady.size,
            doneCount: this.playersDone.size,
            totalPlayers: this.getPlayerCount(),
            alivePlayerCount: alivePlayersWithStatus.length
        };

        // Add phase-specific data
        if (this.currentPhase === 'murder') {
            // Phase 2: Murder Discovery - include story and role-specific data
            gameState.murderStory = this.getMurderStory();
            
            // Check if player is eyewitness
            gameState.isEyewitness = playerRole === 'Eye Witness';
            if (gameState.isEyewitness) {
                gameState.eyewitnessData = {
                    message: 'You witnessed the assassination! You know who did it.'
                };
            }
            
            // Check if player is detective (only show special info if eyewitness is enabled)
            gameState.isDetective = playerRole === 'Detective';
            if (gameState.isDetective && this.settings.enableEyeWitness) {
                gameState.detectiveData = this.buildDetectiveData(playerToken, alivePlayersWithStatus);
                gameState.detectiveData.keyword = 'Look for hesitation';
                gameState.detectiveData.hint = 'The person who knows something will give themselves away. Watch for nervous behavior or unusual pauses.';
                console.log(`[${this.gameCode}] Sending detective data (eyewitness enabled)`);
            } else if (gameState.isDetective) {
                // Add case notes even if eyewitness is disabled
                gameState.detectiveData = this.buildDetectiveData(playerToken, alivePlayersWithStatus);
                console.log(`[${this.gameCode}] Sending case notes to detective`);
            }
            
            // Check if player is syndicate/assassin (only show special warning if eyewitness is enabled)
            gameState.isAssassin = playerRole === 'Syndicate';
            if (gameState.isAssassin && this.settings.enableEyeWitness) {
                gameState.assassinData = {
                    warning: 'You performed the assassination. Be careful - someone may have witnessed you!'
                };
                console.log(`[${this.gameCode}] Sending assassin data (eyewitness enabled)`);
            } else if (gameState.isAssassin) {
                console.log(`[${this.gameCode}] NOT sending assassin data (eyewitness disabled)`);
            }
        }

        // Add accusation phase data
        if (this.currentPhase === 'accusation') {
            gameState.voteCount = this.accusationVotes.size;
            
            // Add detective case notes
            if (playerRole === 'Detective') {
                gameState.detectiveData = this.buildDetectiveData(playerToken, alivePlayersWithStatus);
            }
        }

        // Add verdict phase data
        if (this.currentPhase === 'verdict' && this.accusedPlayer) {
            const accusedPlayerObj = this.players.get(this.accusedPlayer);
            gameState.accusedName = accusedPlayerObj ? accusedPlayerObj.name : 'Unknown';
            gameState.accusedToken = this.accusedPlayer;
            gameState.guiltyVotes = Array.from(this.trialVotes.values()).filter(v => v === 'guilty').length;
            gameState.notGuiltyVotes = Array.from(this.trialVotes.values()).filter(v => v === 'notguilty').length;
            
            // Add detective case notes
            if (playerRole === 'Detective') {
                gameState.detectiveData = this.buildDetectiveData(playerToken, alivePlayersWithStatus);
            }
        }

        // Add trial phase data
        if (this.currentPhase === 'trial') {
            // Add detective case notes for trial phase
            if (playerRole === 'Detective') {
                gameState.detectiveData = this.buildDetectiveData(playerToken, alivePlayersWithStatus);
            }
        }

        // Add discussion phase data
        if (this.currentPhase === 'discussion') {
            // Add detective case notes for discussion phase
            if (playerRole === 'Detective') {
                gameState.detectiveData = this.buildDetectiveData(playerToken, alivePlayersWithStatus);
            }
        }

        // Add night phase (phase 1) data
        if (this.currentPhase === 'night') {
            // Add syndicate data
            if (playerRole === 'Syndicate') {
                gameState.syndicateData = {
                    syndicateIds: this.getSyndicateMembers().map(m => m.token),
                    stage: 'target',
                    recommendations: { recommendations: [], voteCounts: {}, lockedIn: [] },
                    myRecommendation: null,
                    lockedIn: false,
                    complete: false
                };
            }

            // Add detective data
            if (playerRole === 'Detective') {
                gameState.detectiveData = this.buildDetectiveData(playerToken, alivePlayersWithStatus);
                // Add night-phase-specific fields
                gameState.detectiveData.investigation = null;
                gameState.detectiveData.lockedIn = false;
                gameState.detectiveData.canInvestigate = this.currentRound >= 2;
            }

            // Add body guard data
            if (playerRole === 'Body Guard') {
                gameState.bodyGuardData = {
                    protecting: null,
                    bystanderVote: null
                };
            }

            // Add bystander data (for non-syndicate, non-detective, non-bodyguard roles)
            if (playerRole !== 'Syndicate' && playerRole !== 'Detective' && playerRole !== 'Body Guard') {
                gameState.bystanderData = {
                    myVote: null
                };
            }

            // Add game notes
            gameState.gameNotes = [];
        }

        return gameState;
    }

    /**
     * Generate murder story (which player was assassinated)
     */
    getMurderStory() {
        // If we already generated a story for this phase, reuse it
        if (this.currentPhaseStory) {
            return this.currentPhaseStory;
        }
        
        if (!this.lastVictim) {
            return 'Last night, someone was assassinated by the Syndicate.';
        }
        
        const stories = [
            `🔪 Last night, the Syndicate struck. ${this.lastVictim.name} was found dead in the streets. The killer left no trace.`,
            `⚰️ A scream pierced the night. ${this.lastVictim.name} has been assassinated by the Syndicate.`,
            `🌑 In the darkness of night, ${this.lastVictim.name} was silently eliminated by the Syndicate.`,
            `💀 Morning brought terrible news. ${this.lastVictim.name} was found murdered. The Syndicate has struck again.`,
            `🗡️ The Syndicate made their move. ${this.lastVictim.name} is dead.`,
            `🕷️ In the shadows of the night, the Syndicate claimed another victim: ${this.lastVictim.name}.`,
            `🌙 Under cover of darkness, the Syndicate assassinated ${this.lastVictim.name}.`,
            `🔴 Blood was spilled last night. ${this.lastVictim.name} has been eliminated by the Syndicate.`
        ];
        
        const randomStory = stories[Math.floor(Math.random() * stories.length)];
        return randomStory;
    }

    /**
     * Calculate suspicion level based on voting patterns
     */
    calculateSuspicionLevel(targetToken) {
        const targetPlayer = this.players.get(targetToken);
        if (!targetPlayer) {
            return { level: 'Unknown', suspicionScore: 0 };
        }

        let suspicionScore = 0;
        let reasons = [];

        // Check votes AGAINST the target (day votes)
        // Count how many players voted to eliminate this person
        let votesAgainst = 0;
        for (const [voter, target] of this.dayVotes) {
            if (target === targetToken) {
                votesAgainst++;
            }
        }

        // Check votes FOR the target during accusations
        // Count how many players this person accused
        let votesFor = 0;
        for (const [voter, target] of this.accusationVotes) {
            if (voter === targetToken) {
                votesFor++;
            }
        }

        // High number of votes against suggests guilt
        const totalPlayers = this.getAlivePlayers().length;
        const percentVotedAgainst = totalPlayers > 0 ? (votesAgainst / totalPlayers) * 100 : 0;
        
        if (percentVotedAgainst >= 60) {
            suspicionScore += 40;
            reasons.push('Multiple players voted to eliminate them');
        } else if (percentVotedAgainst >= 40) {
            suspicionScore += 25;
        } else if (percentVotedAgainst >= 20) {
            suspicionScore += 15;
        }

        // If they accused many people, they might be trying to throw suspicion
        if (votesFor >= 3) {
            suspicionScore += 20;
            reasons.push('They made multiple accusations');
        } else if (votesFor >= 2) {
            suspicionScore += 10;
        }

        // Determine level based on score
        let level = 'Clear';
        if (suspicionScore >= 80) {
            level = 'Very Suspicious';
        } else if (suspicionScore >= 60) {
            level = 'Suspicious';
        } else if (suspicionScore >= 40) {
            level = 'Moderate';
        } else if (suspicionScore >= 20) {
            level = 'Low';
        }

        return { level, suspicionScore, reasons };
    }

    /**
     * Get investigation result for detective
     */
    getInvestigationResult(detectiveToken, targetToken) {
        const targetPlayer = this.players.get(targetToken);
        if (!targetPlayer) {
            return null;
        }

        const suspicion = this.calculateSuspicionLevel(targetToken);
        const investigationResults = {
            targetName: targetPlayer.name,
            level: suspicion.level,
            suspicionScore: suspicion.suspicionScore,
            reasons: suspicion.reasons || [],
            round: this.currentRound
        };

        return investigationResults;
    }

    /**
     * Generate detective clue
     */
    getDetectiveClue() {
        if (this.lastVictim) {
            return `The victim was ${this.lastVictim.name}. You may investigate someone to learn their alignment.`;
        }
        return 'Someone was assassinated. You may investigate someone to learn their alignment.';
    }

    /**
     * Handle game-specific events
     */
    handleEvent(eventName, playerToken, data) {
        console.log(`[${this.gameCode}] handleEvent: eventName=${eventName}, playerToken=${playerToken}`);
        
        switch (eventName) {
            case 'night-vote':
                return this.nightVote(playerToken, data.target);
            case 'night-lock':
                return this.lockNightVotes(playerToken);
            case 'day-vote':
                return this.dayVote(playerToken, data.target);
            case 'trial-vote':
                return this.trialVote(playerToken, data.vote);
            case 'accusation-vote':
                return this.accusationVote(playerToken, data.target);
            case 'detective-lock':
                console.log(`[${this.gameCode}] Received detective-lock event for ${playerToken}`);
                return this.detectiveLockIn(playerToken, data);
            case 'player-ready':
                this.setPlayerReady(playerToken);
                return { success: true };
            case 'player-done':
                this.setPlayerDone(playerToken);
                return { success: true, doneCount: this.getDoneCount() };
            case 'update-case-notes':
                return this.updateDetectiveCaseNotes(playerToken, data);
            default:
                return { success: false, message: 'Unknown event' };
        }
    }

    /**
     * Handle detective lock-in for investigation
     */
    detectiveLockIn(detectiveToken, data) {
        console.log(`[${this.gameCode}] detectiveLockIn called for ${detectiveToken}, data:`, data);
        
        const role = this.getPlayerRole(detectiveToken);
        if (role !== 'Detective') {
            return { success: false, message: 'Only detectives can lock investigations' };
        }

        const { targetToken } = data || {};
        if (!targetToken) {
            console.log(`[${this.gameCode}] detectiveLockIn: No targetToken provided`);
            return { success: false, message: 'No investigation target provided' };
        }

        console.log(`[${this.gameCode}] detectiveLockIn: targetToken=${targetToken}`);

        // Get investigation result
        const investigationResults = this.getInvestigationResult(detectiveToken, targetToken);
        if (!investigationResults) {
            return { success: false, message: 'Invalid investigation target' };
        }

        // Store the investigation
        this.detectiveInvestigations.set(detectiveToken, {
            targetToken,
            targetName: investigationResults.targetName,
            round: this.currentRound,
            results: investigationResults,
            displayed: false  // Mark as not yet displayed
        });

        console.log(`[${this.gameCode}] Detective ${detectiveToken} locked investigation on ${investigationResults.targetName} - Suspicion: ${investigationResults.level}`);

        return { success: true, results: investigationResults };
    }

    /**
     * Update detective case notes (tags on players)
     */
    updateDetectiveCaseNotes(detectiveToken, payload) {
        const role = this.getPlayerRole(detectiveToken);
        if (role !== 'Detective') {
            return { success: false, message: 'Only detectives can update case notes' };
        }

        const { targetId, notes } = payload;
        if (!targetId || !Array.isArray(notes)) {
            return { success: false, message: 'Invalid case notes data' };
        }

        // Initialize detective's notes if not exists
        if (!this.detectiveCaseNotes[detectiveToken]) {
            this.detectiveCaseNotes[detectiveToken] = {};
        }

        // Store the notes (replace completely)
        this.detectiveCaseNotes[detectiveToken][targetId] = notes;
        
        console.log(`[${this.gameCode}] Detective ${detectiveToken} updated case notes for ${targetId}:`, notes);
        return { success: true };
    }}

module.exports = SecretSyndicates;